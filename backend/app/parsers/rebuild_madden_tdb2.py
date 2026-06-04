from __future__ import annotations

import gzip
import json
import struct
import zipfile
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from app.parsers.parse_madden_tdb2 import (
    FIELD_TYPE_FLOAT,
    FIELD_TYPE_INT,
    FIELD_TYPE_STRING,
    FIELD_TYPE_SUBTABLE,
    FIELD_TYPE_SUBTABLE_COMPRESSED,
    Reader,
    read_modified_leb,
    sixbit_decode,
)


def sixbit_encode(text: str) -> bytes:
    s = (text or "")[:4].ljust(4)
    value = 0
    for ch in s:
        code = ord(ch) - 32
        if code < 0 or code > 0x3F:
            raise ValueError(f"cannot six-bit encode character {ch!r} in {text!r}")
        value = (value << 6) | code
    return value.to_bytes(3, "big")


def encode_modified_leb(value: int) -> bytes:
    v = int(value)
    neg = v < 0
    mag = abs(v)
    digits: List[int] = []
    d0 = mag % 64
    digits.append(d0)
    mag = (mag - d0) // 64
    if mag:
        d1 = mag % 128
        digits.append(d1)
        mag = (mag - d1) // 128
    while mag:
        d = mag % 64
        digits.append(d)
        mag = (mag - d) // 64
    out = bytearray()
    for i, d in enumerate(digits):
        cur = d
        if i == 0 and neg:
            cur |= 0x40
        if i != len(digits) - 1:
            cur ^= 0x80
        out.append(cur)
    return bytes(out)


def raw_key_for(name: str, typ: int) -> bytes:
    return sixbit_encode(name) + bytes([int(typ) & 0xFF])


def table_raw_key(table: Dict[str, Any], *, as_field: bool) -> bytes:
    raw_hex = table.get("raw_key_hex")
    if raw_hex:
        raw = bytes.fromhex(raw_hex)
        if as_field:
            # Subtable field raw key is exactly name3 + field type.
            if len(raw) >= 4:
                return raw[:4]
        else:
            return raw
    return raw_key_for(table.get("name", ""), int(table.get("type", 0)))


def field_type_map(table: Dict[str, Any]) -> Dict[str, int]:
    out: Dict[str, int] = {}
    for fd in table.get("field_definitions", []) or []:
        if fd.get("name") is not None and fd.get("type") is not None:
            out[str(fd["name"])] = int(fd["type"])
    return out


def is_metadata_key(key: str) -> bool:
    return key.startswith("_") or key in {
        "TeamName", "TeamLongName", "TeamNickname", "TeamShortName", "TeamAbbrev", "TeamAbbrev2",
        "TeamAssetName", "TeamOrigId", "Position", "__rowIndex",
    }


def coerce_int(value: Any) -> int:
    if value is None or value == "":
        return 0
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float)):
        return int(value)
    text = str(value).strip()
    if text.lower().startswith("0x"):
        return int(text, 16)
    return int(float(text))


def encode_scalar_field(key: str, typ: int, value: Any) -> bytes:
    raw = raw_key_for(key, typ)
    if typ == FIELD_TYPE_INT:
        return raw + encode_modified_leb(coerce_int(value))
    if typ == FIELD_TYPE_STRING:
        data = ("" if value is None else str(value)).encode("utf-8")
        return raw + encode_modified_leb(len(data)) + data
    if typ == FIELD_TYPE_FLOAT:
        try:
            f = float(value)
        except Exception:
            f = 0.0
        return raw + struct.pack(">f", f)
    if typ == 3:
        # Unknown marker field. Preserve as marker only.
        return raw + b"\x00"
    raise ValueError(f"unsupported field type {typ} for {key}")


def record_field_order(table: Dict[str, Any], record: Dict[str, Any]) -> List[str]:
    fmap = field_type_map(table)
    ordered: List[str] = []
    for key in record.keys():
        if key in fmap and not is_metadata_key(key):
            ordered.append(key)
    for key in fmap.keys():
        if key in record and key not in ordered and not is_metadata_key(key):
            ordered.append(key)
    return ordered


def encode_inline_record(record: Dict[str, Any], table: Dict[str, Any]) -> bytes:
    fmap = field_type_map(table)
    out = bytearray()
    for key in record_field_order(table, record):
        val = record.get(key)
        typ = int(fmap[key])
        if typ in (FIELD_TYPE_SUBTABLE, FIELD_TYPE_SUBTABLE_COMPRESSED) and isinstance(val, dict):
            out += encode_subtable_field(val)
        else:
            out += encode_scalar_field(key, typ, val)
    out.append(0)
    return bytes(out)


def encode_decompressed_record_fields(record: Dict[str, Any], field_types: Dict[str, int]) -> bytes:
    out = bytearray()
    for key, value in record.items():
        if is_metadata_key(key):
            continue
        typ = int(field_types.get(key, FIELD_TYPE_INT))
        if typ in (FIELD_TYPE_SUBTABLE, FIELD_TYPE_SUBTABLE_COMPRESSED):
            continue
        out += encode_scalar_field(key, typ, value)
    out.append(0)
    return bytes(out)


def encode_blbm_compressed_record(record: Dict[str, Any], table: Dict[str, Any]) -> bytes:
    field_types = field_type_map(table)
    has_subrecord = isinstance(record.get("_subRecord"), dict)
    sub = record.get("_subRecord") if has_subrecord else {
        k: v for k, v in record.items() if k in field_types and not is_metadata_key(k)
    }
    compressed_header = bytes.fromhex(record.get("_compressed_header", "8e886e03"))
    subrecord_header = bytes.fromhex(record.get("_subrecord_header", "8e886e03"))
    if has_subrecord or sub:
        parent_header = bytes.fromhex(record.get("_parent_header", "8e8da903"))
        dec = compressed_header + subrecord_header + encode_decompressed_record_fields(sub, field_types) + parent_header
    else:
        main_header = bytes.fromhex(record.get("_main_header", "8e8da903"))
        dec = compressed_header + subrecord_header + b"\x00\x00" + main_header
    comp = gzip.compress(dec, compresslevel=9, mtime=0)
    return encode_modified_leb(coerce_int(record.get("_index", 0))) + encode_modified_leb(len(comp)) + comp


def encode_subtable_field(table: Dict[str, Any]) -> bytes:
    typ = int(table.get("type", 0))
    records = table.get("records", []) or []
    out = bytearray()
    out += table_raw_key(table, as_field=True)
    out.append(int(table.get("unknown1") or 0) & 0xFF)
    if typ == FIELD_TYPE_SUBTABLE_COMPRESSED:
        out.append(int(table.get("unknown2") if table.get("unknown2") is not None else 2) & 0xFF)
    out += encode_modified_leb(len(records))
    if typ == FIELD_TYPE_SUBTABLE:
        for rec in records:
            out += encode_inline_record(rec, table)
    elif typ == FIELD_TYPE_SUBTABLE_COMPRESSED:
        for rec in records:
            out += encode_blbm_compressed_record(rec, table)
    else:
        raise ValueError(f"cannot encode table {table.get('name')} as subtable type {typ}")
    return bytes(out)


def encode_record1_tables(tables_by_path: Dict[str, Dict[str, Any]]) -> bytes:
    out = bytearray()
    for path in ("BLOB.DCHT", "BLOB.PLAY", "BLOB.TCPS", "BLOB.TEAM"):
        table = tables_by_path.get(path)
        if not table:
            raise ValueError(f"required table {path} is missing")
        out += encode_subtable_field(table)
    out.append(0)
    return bytes(out)


def find_field_header(data: bytes, name: str, typ: int, start: int = 0) -> int:
    marker = raw_key_for(name, typ)
    off = data.find(marker, start)
    if off < 0:
        raise ValueError(f"could not find field header {name}/{typ} in original file")
    return off


def find_nth_field_header(data: bytes, name: str, typ: int, n: int) -> int:
    start = 0
    off = -1
    for _ in range(n):
        off = find_field_header(data, name, typ, start)
        start = off + 1
    return off


def compressed_subtable_field_end(data: bytes, table_offset: int) -> int:
    """Return the end offset for a type-5 compressed subtable field in original bytes."""
    rr = Reader(data[table_offset + 5:], f"compressed_table@0x{table_offset:x}")
    _unknown2 = rr.read_byte()
    count, _ = read_modified_leb(rr)
    for _ in range(count):
        _idx, _ = read_modified_leb(rr)
        size, _ = read_modified_leb(rr)
        rr.read(size)
    return table_offset + 5 + rr.off


def load_tables_from_parse_dir(parse_dir: Path) -> Dict[str, Dict[str, Any]]:
    summary_candidates = sorted(parse_dir.glob("*_summary.json"))
    if not summary_candidates:
        raise FileNotFoundError(f"no summary JSON found in {parse_dir}")
    summary = json.loads(summary_candidates[0].read_text(encoding="utf-8"))
    out: Dict[str, Dict[str, Any]] = {}
    for t in summary.get("tables", []):
        path = t.get("path")
        jf = t.get("json_file")
        if path and jf:
            out[path] = json.loads((parse_dir / jf).read_text(encoding="utf-8"))
    return out


def rebuild_roster_db(
    original_db: Path,
    parse_dir: Path,
    output_db: Path,
    visuals_dir: Optional[Path] = None,
    rebuild_visuals: bool = True,
) -> Dict[str, Any]:
    """Rebuild the roster DB from edited table JSON and, optionally, edited Character Visuals JSON.

    The original roster layout is preserved around the rebuilt sections:
    root header -> large visual BLBM -> TREF/other bytes -> small BLBM -> OTID/root terminator ->
    DCHT/PLAY/TCPS/TEAM record.
    """
    original = original_db.read_bytes()
    tables = load_tables_from_parse_dir(parse_dir)
    small_blbm = tables.get("BLOB.BLBM")
    if not small_blbm:
        raise ValueError("BLOB.BLBM table is missing")

    visual_rebuild_meta: Dict[str, Any] = {"included": False, "reason": "disabled or visuals JSON missing"}

    visual_blbm_off = find_nth_field_header(original, "BLBM", FIELD_TYPE_SUBTABLE_COMPRESSED, 1)
    small_blbm_off = find_nth_field_header(original, "BLBM", FIELD_TYPE_SUBTABLE_COMPRESSED, 2)
    dcht_off = find_field_header(original, "DCHT", FIELD_TYPE_SUBTABLE, small_blbm_off)

    # Locate original compressed table boundaries.
    visual_blbm_end = compressed_subtable_field_end(original, visual_blbm_off)
    small_blbm_end = compressed_subtable_field_end(original, small_blbm_off)

    prefix = original[:visual_blbm_off]
    between_visual_and_small = original[visual_blbm_end:small_blbm_off]
    between_small_and_dcht = original[small_blbm_end:dcht_off]

    visuals_bytes = original[visual_blbm_off:visual_blbm_end]
    if rebuild_visuals and visuals_dir is not None:
        visuals_json_path = visuals_dir / "character_visuals_nested.json"
        if visuals_json_path.exists():
            from app.parsers.encode_h2_visuals import encode_visuals_blbm_table
            visuals_json = json.loads(visuals_json_path.read_text(encoding="utf-8"))
            unknown1 = original[visual_blbm_off + 4]
            # Offset +5 points to unknown2 for type-5 tables.
            unknown2 = original[visual_blbm_off + 5]
            visuals_bytes = encode_visuals_blbm_table(visuals_json, unknown1=unknown1, unknown2=unknown2)
            visual_rebuild_meta = {
                "included": True,
                "source_json": str(visuals_json_path),
                "players_encoded": len(visuals_json.get("characterVisualsPlayerMap", {})),
                "original_visuals_size_bytes": visual_blbm_end - visual_blbm_off,
                "rebuilt_visuals_size_bytes": len(visuals_bytes),
                "unknown1": unknown1,
                "unknown2": unknown2,
            }
        else:
            visual_rebuild_meta = {"included": False, "reason": f"missing {visuals_json_path}"}

    rebuilt = (
        prefix
        + visuals_bytes
        + between_visual_and_small
        + encode_subtable_field(small_blbm)
        + between_small_and_dcht
        + encode_record1_tables(tables)
    )
    output_db.parent.mkdir(parents=True, exist_ok=True)
    output_db.write_bytes(rebuilt)
    return {
        "output_file": str(output_db),
        "original_size_bytes": len(original),
        "rebuilt_size_bytes": len(rebuilt),
        "visual_blbm_original_offset": visual_blbm_off,
        "visual_blbm_original_end": visual_blbm_end,
        "small_blbm_original_offset": small_blbm_off,
        "small_blbm_original_end": small_blbm_end,
        "dcht_original_offset": dcht_off,
        "visuals_rebuilt": visual_rebuild_meta,
        "tables_rebuilt": ["Character Visuals BLBM", "BLOB.BLBM", "BLOB.DCHT", "BLOB.PLAY", "BLOB.TCPS", "BLOB.TEAM"] if visual_rebuild_meta.get("included") else ["BLOB.BLBM", "BLOB.DCHT", "BLOB.PLAY", "BLOB.TCPS", "BLOB.TEAM"],
    }


def make_project_json(parse_dir: Path, visuals_dir: Path, output_path: Path) -> None:
    tables = load_tables_from_parse_dir(parse_dir)
    visuals_path = visuals_dir / "character_visuals_nested.json"
    project = {
        "format": "Madden Roster Editor editable project JSON",
        "tables": tables,
        "characterVisuals": json.loads(visuals_path.read_text(encoding="utf-8")) if visuals_path.exists() else None,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(project, ensure_ascii=False, indent=2), encoding="utf-8")
