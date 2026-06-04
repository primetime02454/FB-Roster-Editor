#!/usr/bin/env python3
"""Parse Madden TDB2/H2-like database records to JSON/CSV.

This is a Python adaptation of the public madden-file-tools TDB2Parser logic,
including compressed record handling used by current Madden roster/visuals files.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import json
import math
import struct
import sys
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

FIELD_TYPE_INT = 0
FIELD_TYPE_STRING = 1
FIELD_TYPE_UNK = 3
FIELD_TYPE_SUBTABLE = 4
FIELD_TYPE_SUBTABLE_COMPRESSED = 5
FIELD_TYPE_FLOAT = 10

class ParseError(Exception):
    pass

class Reader:
    def __init__(self, data: bytes, name: str = '<buffer>'):
        self.data = data
        self.off = 0
        self.name = name
    def remaining(self) -> int:
        return len(self.data) - self.off
    def eof(self) -> bool:
        return self.off >= len(self.data)
    def read(self, n: int) -> bytes:
        if n < 0:
            raise ValueError('negative read')
        if self.off + n > len(self.data):
            raise ParseError(f'{self.name}: need {n} bytes at 0x{self.off:x}, only {self.remaining()} remaining')
        b = self.data[self.off:self.off+n]
        self.off += n
        return b
    def read_byte(self) -> int:
        return self.read(1)[0]
    def peek_byte(self) -> Optional[int]:
        return None if self.eof() else self.data[self.off]


def sixbit_decode(data: bytes) -> str:
    # Equivalent to utilService.getUncompressedTextFromSixBitCompression:
    # read big-endian bit groups of 6 from the bytes and add 32 to each group.
    total_bits = len(data) * 8
    chars = []
    value = int.from_bytes(data, 'big')
    for bit_offset in range(0, total_bits, 6):
        shift = total_bits - bit_offset - 6
        chars.append(chr(((value >> shift) & 0x3F) + 32))
    return ''.join(chars)


def read_modified_leb_from_buf(buf: bytes) -> int:
    value = 0
    is_negative = False
    for i in range(len(buf) - 1, -1, -1):
        current = buf[i]
        if i != len(buf) - 1:
            current ^= 0x80
        if i == 0 and (current & 0x40) == 0x40:
            current ^= 0x40
            is_negative = True
        multiplication_factor = 1 << (i * 6)
        if i > 1:
            multiplication_factor <<= 1
        value += current * multiplication_factor
        if is_negative:
            value *= -1
    return value


def read_modified_leb(reader: Reader, first: Optional[bytes | int] = None) -> Tuple[int, bytes]:
    raw = bytearray()
    if first is not None:
        if isinstance(first, int):
            raw.append(first)
        else:
            raw.extend(first)
    while not raw or (raw[-1] & 0x80):
        raw.append(reader.read_byte())
    b = bytes(raw)
    return read_modified_leb_from_buf(b), b

@dataclass
class FieldDef:
    name: str
    type: int

@dataclass
class Table:
    name: str
    type: int
    unknown1: int = 0
    unknown2: Optional[int] = None
    raw_key_hex: str = ''
    offset: int = 0
    num_entries: int = 0
    records: List[Dict[str, Any]] = field(default_factory=list)
    field_defs: Dict[str, int] = field(default_factory=dict)
    parse_warnings: List[str] = field(default_factory=list)

class TDB2ParserPy:
    def __init__(self, data: bytes, *, max_tables: int = 100000, keep_raw: bool = False):
        self.reader = Reader(data, 'tdb2')
        self.tables: List[Table] = []
        self.max_tables = max_tables
        self.keep_raw = keep_raw
        self.warnings: List[str] = []

    def parse(self) -> List[Table]:
        table_count = 0
        while self.reader.remaining() >= 5:
            # Some files may end with padding; don't try to parse a run of zeros.
            if all(x == 0 for x in self.reader.data[self.reader.off:]):
                break
            try:
                tbl = self._parse_table(top_level=True)
            except ParseError as e:
                self.warnings.append(str(e))
                break
            self.tables.append(tbl)
            table_count += 1
            if table_count >= self.max_tables:
                self.warnings.append(f'stopped after max_tables={self.max_tables}')
                break
        if self.reader.remaining():
            tail = self.reader.data[self.reader.off:self.reader.off+32]
            self.warnings.append(f'{self.reader.remaining()} trailing/unparsed bytes at 0x{self.reader.off:x}: {tail.hex()}')
        return self.tables

    def _parse_table(self, top_level: bool = False, existing_header: Optional[bytes] = None) -> Table:
        start = self.reader.off
        header5 = existing_header if existing_header is not None else self.reader.read(5)
        if len(header5) != 5:
            raise ParseError('table header is not 5 bytes')
        name = sixbit_decode(header5[:3])
        ttype = header5[3]
        unknown1 = header5[4]
        raw_key = bytearray(header5)

        first = self.reader.read_byte()
        unknown2 = None
        if ttype == 0x5:
            unknown2 = first
            num_entries, num_raw = read_modified_leb(self.reader)
            raw_key.extend(bytes([first]))
        elif ttype == 0x3:
            extra = self.reader.read(3)
            raw_key.extend(bytes([first]) + extra)
            first_count = self.reader.read_byte()
            num_entries, num_raw = read_modified_leb(self.reader, first_count)
        else:
            num_entries, num_raw = read_modified_leb(self.reader, first)

        tbl = Table(name=name, type=ttype, unknown1=unknown1, unknown2=unknown2,
                    raw_key_hex=bytes(raw_key).hex(), offset=start, num_entries=num_entries)
        # Guard against bogus interpretation.
        if num_entries < 0 or num_entries > 10_000_000:
            raise ParseError(f'implausible num_entries={num_entries} for table {name} at 0x{start:x}')
        for i in range(num_entries):
            rec = self._parse_record(tbl, i)
            tbl.records.append(rec)
        return tbl

    def _field_def(self, table: Table, key: str, typ: int):
        table.field_defs.setdefault(key, typ)

    def _parse_record(self, table: Table, default_index: int) -> Dict[str, Any]:
        record: Dict[str, Any] = {'_index': default_index}
        if table.type == 5:
            idx, raw = read_modified_leb(self.reader)
            record['_index'] = idx
            if table.unknown2 == 0x2:
                n, nraw = read_modified_leb(self.reader)
                comp = self.reader.read(n)
                return self._parse_compressed_record(comp, table, idx)
        # If not compressed keyed storage, parse inline fields.
        self._parse_inline_fields_into(record, table)
        return record

    def _parse_inline_fields_into(self, record: Dict[str, Any], table: Table, start_buf: bytes = b''):
        buf = start_buf
        while True:
            need = 5 - len(buf)
            if need < 0:
                raise ParseError('start_buf larger than field header')
            header = buf + self.reader.read(need)
            buf = b''
            raw_key = header[:4]
            key = sixbit_decode(raw_key[:3])
            typ = raw_key[3]
            self._field_def(table, key, typ)
            fifth = header[4]

            if typ == FIELD_TYPE_INT:
                val, raw = read_modified_leb(self.reader, fifth)
                # The JS parser preserves one extra zero after UNWI/TREF in some files.
                if key in ('UNWI', 'TREF') and self.reader.peek_byte() == 0:
                    _ = self.reader.read_byte()
                record[key] = val
            elif typ == FIELD_TYPE_STRING:
                strlen, raw = read_modified_leb(self.reader, fifth)
                if strlen < 0 or strlen > self.reader.remaining():
                    raise ParseError(f'bad string length {strlen} for {key} at 0x{self.reader.off:x}')
                rawstr = self.reader.read(strlen)
                record[key] = rawstr.rstrip(b'\x00').decode('utf-8', errors='replace')
            elif typ == FIELD_TYPE_UNK:
                # The official parser treats the next two bytes as start of the following field.
                # Preserve a boolean marker for this unknown field.
                record[key] = None
                b2 = self.reader.read(1)
                buf = bytes([fifth]) + b2
                continue
            elif typ in (FIELD_TYPE_SUBTABLE, FIELD_TYPE_SUBTABLE_COMPRESSED):
                sub = Table(name=key, type=typ, unknown1=fifth, raw_key_hex=raw_key.hex(), offset=self.reader.off-5)
                if typ == FIELD_TYPE_SUBTABLE_COMPRESSED:
                    sub.unknown2 = self.reader.read_byte()
                    count, raw = read_modified_leb(self.reader)
                else:
                    first_count = self.reader.read_byte()
                    count, raw = read_modified_leb(self.reader, first_count)
                sub.num_entries = count
                if count < 0 or count > 1_000_000:
                    raise ParseError(f'bad subtable count {count} for {key}')
                for i in range(count):
                    sub.records.append(self._parse_record(sub, i))
                record[key] = self._table_to_jsonable(sub, include_records=True)
            elif typ == FIELD_TYPE_FLOAT:
                rest = self.reader.read(3)
                raw = bytes([fifth]) + rest
                try:
                    record[key] = struct.unpack('>f', raw)[0]
                except Exception:
                    record[key] = None
            else:
                raise ParseError(f'unsupported inline field type 0x{typ:x} ({key}) at 0x{self.reader.off:x}')

            # After each field, official parser reads one byte to decide record end.
            # Some extracted DB/H2 files end immediately after the final field; treat EOF
            # here as an implicit record terminator.
            if self.reader.eof():
                return
            terminator_or_next = self.reader.read_byte()
            if terminator_or_next == 0:
                return
            buf = bytes([terminator_or_next])

    def _parse_compressed_record(self, comp: bytes, table: Table, idx: int) -> Dict[str, Any]:
        try:
            dec = gzip.decompress(comp)
        except Exception as e:
            # Some tools use zlib wrappers. Try zlib as fallback.
            import zlib
            try:
                dec = zlib.decompress(comp)
            except Exception:
                raise ParseError(f'failed to decompress record {idx} in {table.name}: {e}')
        rp = Reader(dec, f'{table.name}[{idx}]')
        record: Dict[str, Any] = {'_index': idx}
        # Skip initial 4-byte header, usually CHVI or CHAN.
        if rp.remaining() < 4:
            raise ParseError(f'compressed record {idx} too short')
        first_header = rp.read(4)
        if self.keep_raw:
            record['_compressed_header'] = first_header.hex()
        # M26 BLOB/BLBM subrecord special case from madden-file-tools.
        if table.name in ('BLBM', 'BLOB'):
            if rp.remaining() < 4:
                raise ParseError(f'BLOB/BLBM record {idx} missing subrecord header')
            sub_header = rp.read(4)
            if self.keep_raw:
                record['_subrecord_header'] = sub_header.hex()
            nxt = rp.peek_byte()
            if nxt is not None and nxt != 0 and nxt != 0x8E:
                sub_record: Dict[str, Any] = {'_index': 0}
                self._parse_decompressed_fields_into(sub_record, table, rp)
                record['_subRecord'] = sub_record
                # Parser consumes a CHVI header before parent fields. Some Madden 26
                # BLOB/BLBM records include an extra null byte after the subrecord
                # terminator before CHVI, so skip null padding until a plausible header.
                while rp.remaining() > 4 and rp.peek_byte() == 0:
                    rp.read(1)
                if rp.remaining() >= 4:
                    parent_hdr = rp.read(4)
                    if self.keep_raw:
                        record['_parent_header'] = parent_hdr.hex()
                if not rp.eof():
                    self._parse_decompressed_fields_into(record, table, rp)
            else:
                # No subrecord: two null bytes then 4-byte main header.
                if rp.remaining() >= 2:
                    rp.read(2)
                if rp.remaining() >= 4:
                    main_hdr = rp.read(4)
                    if self.keep_raw:
                        record['_main_header'] = main_hdr.hex()
                if not rp.eof():
                    self._parse_decompressed_fields_into(record, table, rp)
        else:
            if not rp.eof():
                self._parse_decompressed_fields_into(record, table, rp)
        if rp.remaining() > 0:
            # Usually zero. Preserve warning on table level without failing.
            tail = rp.data[rp.off:rp.off+16].hex()
            table.parse_warnings.append(f'record {idx}: {rp.remaining()} trailing decompressed bytes at 0x{rp.off:x}: {tail}')
        return record

    def _parse_decompressed_fields_into(self, record: Dict[str, Any], table: Table, rp: Reader):
        while True:
            if rp.eof():
                return
            # End-of-record marker.
            if rp.peek_byte() == 0:
                rp.read(1)
                return
            raw_key = rp.read(4)
            key = sixbit_decode(raw_key[:3])
            typ = raw_key[3]
            self._field_def(table, key, typ)
            if typ == FIELD_TYPE_INT:
                val, raw = read_modified_leb(rp)
                if key in ('UNWI', 'WRST') and rp.peek_byte() == 0:
                    # Preserve compatibility with parser's extra-zero handling.
                    rp.read(1)
                record[key] = val
            elif typ == FIELD_TYPE_STRING:
                strlen, raw = read_modified_leb(rp)
                if strlen < 0 or strlen > rp.remaining():
                    raise ParseError(f'{rp.name}: bad string length {strlen} for {key} at 0x{rp.off:x}')
                rawstr = rp.read(strlen)
                record[key] = rawstr.rstrip(b'\x00').decode('utf-8', errors='replace')
            elif typ == FIELD_TYPE_UNK:
                if rp.peek_byte() == 0:
                    rp.read(1)
                record[key] = None
            elif typ == FIELD_TYPE_SUBTABLE:
                sub = Table(name=key, type=typ, raw_key_hex=raw_key.hex(), offset=rp.off-4)
                sub.unknown1 = rp.read_byte()
                count, raw = read_modified_leb(rp)
                sub.num_entries = count
                for i in range(count):
                    subrec: Dict[str, Any] = {'_index': i}
                    # Fields until null terminator.
                    self._parse_decompressed_fields_into(subrec, sub, rp)
                    sub.records.append(subrec)
                record[key] = self._table_to_jsonable(sub, include_records=True)
            elif typ == FIELD_TYPE_FLOAT:
                raw = rp.read(4)
                record[key] = struct.unpack('>f', raw)[0]
            else:
                raise ParseError(f'{rp.name}: unsupported field type 0x{typ:x} ({key}) at 0x{rp.off:x}')

    def _table_to_jsonable(self, table: Table, include_records: bool = True) -> Dict[str, Any]:
        d = {
            'name': table.name,
            'type': table.type,
            'unknown1': table.unknown1,
            'unknown2': table.unknown2,
            'offset': table.offset,
            'raw_key_hex': table.raw_key_hex,
            'num_entries': table.num_entries,
            'field_definitions': [{'name': k, 'type': v} for k, v in sorted(table.field_defs.items())],
        }
        if include_records:
            d['records'] = table.records
        if table.parse_warnings:
            d['warnings'] = table.parse_warnings[:50]
        return d

    def jsonable(self) -> Dict[str, Any]:
        return {
            'format': 'TDB2/H2-like parsed by Python adaptation of madden-file-tools TDB2Parser',
            'table_count': len(self.tables),
            'warnings': self.warnings,
            'tables': [self._table_to_jsonable(t, include_records=True) for t in self.tables],
        }


def is_table_dict(v: Any) -> bool:
    return isinstance(v, dict) and 'records' in v and 'field_definitions' in v and 'num_entries' in v


def compact_table_ref(v: Dict[str, Any], export_path: Optional[str] = None) -> Dict[str, Any]:
    d = {
        'nested_table': v.get('name'),
        'type': v.get('type'),
        'num_entries': v.get('num_entries'),
        'field_count': len(v.get('field_definitions', [])),
    }
    if export_path:
        d['export_path'] = export_path
    return d


def flatten_for_csv(v: Any) -> Any:
    if v is None or v == '':
        return 0
    if is_table_dict(v):
        return json.dumps(compact_table_ref(v), ensure_ascii=False, separators=(',', ':'))
    if isinstance(v, (dict, list)):
        return json.dumps(v, ensure_ascii=False, separators=(',', ':'))
    return v


def safe_file_component(text: str) -> str:
    return ''.join(c if c.isalnum() or c in ('_', '-') else '_' for c in text).strip('_') or 'table'


def simplified_record_for_json(record: Dict[str, Any]) -> Dict[str, Any]:
    out = {}
    for k, v in record.items():
        if is_table_dict(v):
            out[k] = compact_table_ref(v)
        else:
            out[k] = v
    return out


def collect_relational_tables(table_dicts: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    exports: Dict[str, Dict[str, Any]] = {}

    def visit(tbl: Dict[str, Any], path: str, parent_ctx: Optional[Dict[str, Any]] = None):
        exp = exports.setdefault(path, {
            'path': path,
            'name': tbl.get('name'),
            'type': tbl.get('type'),
            'unknown1': tbl.get('unknown1'),
            'unknown2': tbl.get('unknown2'),
            'offset': tbl.get('offset'),
            'raw_key_hex': tbl.get('raw_key_hex'),
            'field_definitions': {},
            'records': [],
            'declared_entries_total': 0,
        })
        exp['declared_entries_total'] += int(tbl.get('num_entries') or 0)
        for fd in tbl.get('field_definitions', []):
            exp['field_definitions'].setdefault(fd.get('name'), fd.get('type'))

        for rec in tbl.get('records', []):
            rec_out = {}
            if parent_ctx:
                rec_out.update(parent_ctx)
            for k, v in rec.items():
                if is_table_dict(v):
                    nested_path = f'{path}.{k}'
                    rec_out[k] = compact_table_ref(v, export_path=f'{safe_file_component(nested_path)}.json/.csv')
                    visit(v, nested_path, {
                        '_parent_table_path': path,
                        '_parent_table_name': tbl.get('name'),
                        '_parent_record_index': rec.get('_index'),
                    })
                else:
                    rec_out[k] = v
            exp['records'].append(rec_out)

    for i, tbl in enumerate(table_dicts):
        visit(tbl, tbl.get('name') or f'table_{i}')
    return exports


def write_outputs(input_path: Path, outdir: Path) -> Dict[str, Any]:
    outdir.mkdir(parents=True, exist_ok=True)
    data = input_path.read_bytes()
    parser = TDB2ParserPy(data, keep_raw=True)
    tables = parser.parse()

    metadata = {
        'input_file': input_path.name,
        'input_size_bytes': len(data),
        'table_count': len(tables),
        'warnings': parser.warnings,
        'tables': []
    }

    # Directory outputs.
    json_dir = outdir / 'json'
    csv_dir = outdir / 'csv'
    json_dir.mkdir(exist_ok=True)
    csv_dir.mkdir(exist_ok=True)

    # Write full JSON (can be large), plus per-table files.
    full_json_path = outdir / f'{input_path.stem}_parsed_full.json'
    with full_json_path.open('w', encoding='utf-8') as f:
        json.dump(parser.jsonable(), f, ensure_ascii=False, indent=2)

    # Relational per-table exports: top-level table plus all nested subtables
    # (PLAY, TEAM, DCHT, TCPS, BLBM, etc.) get their own JSON and CSV files.
    top_table_dicts = [parser._table_to_jsonable(t, include_records=True) for t in tables]
    relational = collect_relational_tables(top_table_dicts)

    for ti, (table_path, exp) in enumerate(relational.items()):
        prefix = f'{ti:03d}_{safe_file_component(table_path)}'
        table_json_path = json_dir / f'{prefix}.json'
        table_csv_path = csv_dir / f'{prefix}.csv'

        fields_dict = exp.get('field_definitions', {})
        records = exp.get('records', [])
        json_obj = {
            'path': table_path,
            'name': exp.get('name'),
            'type': exp.get('type'),
            'unknown1': exp.get('unknown1'),
            'unknown2': exp.get('unknown2'),
            'offset': exp.get('offset'),
            'raw_key_hex': exp.get('raw_key_hex'),
            'declared_entries_total': exp.get('declared_entries_total'),
            'records_parsed': len(records),
            'field_definitions': [{'name': k, 'type': v} for k, v in sorted(fields_dict.items())],
            'records': records,
        }
        with table_json_path.open('w', encoding='utf-8') as f:
            json.dump(json_obj, f, ensure_ascii=False, indent=2)

        # Fieldnames: parent linkage columns, _index, schema fields, then any additional keys.
        cols = []
        for k in ['_parent_table_path', '_parent_table_name', '_parent_record_index', '_index']:
            if any(k in r for r in records) or k == '_index':
                cols.append(k)
        known = set(cols)
        for k in sorted(fields_dict):
            if k not in known:
                cols.append(k); known.add(k)
        for r in records:
            for k in r.keys():
                if k not in known:
                    cols.append(k); known.add(k)
        with table_csv_path.open('w', encoding='utf-8', newline='') as f:
            w = csv.DictWriter(f, fieldnames=cols, extrasaction='ignore')
            w.writeheader()
            for r in records:
                w.writerow({k: flatten_for_csv(r.get(k)) for k in cols})

        metadata['tables'].append({
            'index': ti,
            'path': table_path,
            'name': exp.get('name'),
            'type': exp.get('type'),
            'unknown1': exp.get('unknown1'),
            'unknown2': exp.get('unknown2'),
            'offset': exp.get('offset'),
            'raw_key_hex': exp.get('raw_key_hex'),
            'num_entries_declared': exp.get('declared_entries_total'),
            'records_parsed': len(records),
            'field_count': len(fields_dict),
            'fields': [{'name': k, 'type': v} for k, v in sorted(fields_dict.items())],
            'warnings': [],
            'json_file': str(table_json_path.relative_to(outdir)),
            'csv_file': str(table_csv_path.relative_to(outdir)),
        })

    summary_path = outdir / f'{input_path.stem}_summary.json'
    with summary_path.open('w', encoding='utf-8') as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)

    # Summary CSV of exported tables.
    summary_csv = outdir / f'{input_path.stem}_tables_summary.csv'
    with summary_csv.open('w', encoding='utf-8', newline='') as f:
        cols = ['index','path','name','type','unknown1','unknown2','offset','raw_key_hex','num_entries_declared','records_parsed','field_count','fields','warnings','json_file','csv_file']
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for row in metadata['tables']:
            row2 = dict(row)
            row2['fields'] = json.dumps(row2['fields'], separators=(',', ':'))
            row2['warnings'] = json.dumps(row2['warnings'], separators=(',', ':'))
            w.writerow(row2)

    zip_path = outdir / f'{input_path.stem}_json_csv_export.zip'
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
        for path in [full_json_path, summary_path, summary_csv]:
            z.write(path, path.relative_to(outdir))
        for path in sorted(json_dir.glob('*.json')):
            z.write(path, path.relative_to(outdir))
        for path in sorted(csv_dir.glob('*.csv')):
            z.write(path, path.relative_to(outdir))

    metadata['output_paths'] = {
        'full_json': str(full_json_path),
        'summary_json': str(summary_path),
        'summary_csv': str(summary_csv),
        'zip': str(zip_path),
        'json_dir': str(json_dir),
        'csv_dir': str(csv_dir),
    }
    return metadata


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('input', type=Path)
    ap.add_argument('-o', '--outdir', type=Path, default=Path('/mnt/data/madden_parse_output'))
    args = ap.parse_args(argv)
    meta = write_outputs(args.input, args.outdir)
    print(json.dumps({
        'table_count': meta['table_count'],
        'warnings': meta['warnings'],
        'tables': [{k: t[k] for k in ('index','name','records_parsed','field_count')} for t in meta['tables'][:20]],
        'output_paths': meta['output_paths'],
    }, indent=2))
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
