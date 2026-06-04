#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import json
import sys
import zlib
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

FIELD_TYPE_INT = 0
FIELD_TYPE_STRING = 1
FIELD_TYPE_ARRAY = 4
FIELD_TYPE_FLOAT = 10

FIELD_LOOKUP = {
    "assetName": {"key": "ASNM", "type": 1},
    "bodyType": {"key": "BTYP", "type": 0},
    "firstName": {"key": "CFNM", "type": 1},
    "jerseyNumber": {"key": "CJNO", "type": 0},
    "lastName": {"key": "CLNM", "type": 1},
    "containerId": {"key": "CNID", "type": 0},
    "genericHeadName": {"key": "GENR", "type": 1},
    "genericHead": {"key": "GNHD", "type": 0},
    "heightInches": {"key": "HINC", "type": 0},
    "loadouts": {"key": "LOUT", "type": 4},
    "loadoutCategory": {"key": "LDCT", "type": 0},
    "loadoutType": {"key": "LDTY", "type": 0},
    "loadoutElements": {"key": "PINS", "type": 4},
    "blends": {"key": "IBLD", "type": 4},
    "baseBlend": {"key": "BASE", "type": 10},
    "barycentricBlend": {"key": "BARY", "type": 10},
    "slotType": {"key": "SLOT", "type": 0},
    "itemAssetName": {"key": "ITAN", "type": 1},
    "skinTone": {"key": "SKNT", "type": 0},
    "skinToneScale": {"key": "USKT", "type": 0},
    "weightPounds": {"key": "WLBS", "type": 0},
}
KEY_TO_FIELD = {v["key"]: k for k, v in FIELD_LOOKUP.items()}

ENUM_LOOKUP = {
    "loadoutCategory": {
        "GearOnly": 0, "UniformOnly": 1, "AvatarFull": 2, "Combined": 3,
        "Head": 4, "Base": 5, "CoachApparel": 6, "Casual": 7, "Invalid": 8,
    },
    "loadoutType": {
        "Base": 0, "PlayerOnField": 1, "CoachOnField": 2, "TeamLight": 3,
        "Head": 4, "YardLight": 5, "TeamDark": 6, "Misc": 7,
        "TeamUniform": 8, "YardDark": 9, "Merged": 10, "Casual": 11,
        "Max": 12, "Invalid": 254,
    },
}
ENUM_REVERSE = {k: {v: n for n, v in vals.items()} for k, vals in ENUM_LOOKUP.items()}

SLOTS_26 = {
    0:"FaceMask", 2:"Visor", 9:"LeftSpat", 10:"LeftShoe", 11:"RightShoe", 12:"BackPlate", 18:"Reserved",
    24:"HeadBand", 25:"Shoulderpads", 26:"Towel", 29:"Neckpad", 30:"FlakJacket", 33:"Face", 34:"Eyebrow",
    35:"Nose", 36:"Ears", 37:"Eyes", 38:"Cheek", 39:"Chin", 40:"Jaw", 41:"Mouth", 42:"FacialHair",
    43:"Chest", 44:"Gut", 45:"Glute", 46:"Thighs", 47:"CalfBlend", 48:"Feet", 49:"ArmSize", 50:"Hair",
    51:"FacePaint", 54:"RightSpat", 55:"FaceTexture", 57:"CaptainPatch", 71:"LeftKneeBrace", 72:"RightKneeBrace",
    73:"LeftBicepBand", 74:"RightBicepBand", 75:"LeftForearmBand", 76:"RightForearmBand", 77:"LeftCalfBand",
    78:"RightCalfBand", 79:"CustomHead", 80:"GenericHead", 81:"PlusHead", 82:"HeadAttire", 83:"BodyAttire",
    84:"LeftArmTattoo", 85:"RightArmTattoo", 86:"CraniumHead", 87:"ItemSet", 88:"HelmetFlag", 89:"HelmetBumper",
    90:"FullCharacter", 91:"UpperBodyAttire", 92:"LowerBodyAttire", 93:"HeadWearOverride", 94:"InnerSocksOverride",
    95:"LeftShoeOverride", 96:"RightShoeOverride", 97:"OuterPantsOverride", 98:"OuterShirtOverride", 99:"OuterSocksOverride",
    101:"WaistWearOverride", 102:"EarWear", 103:"EyeWear", 106:"HeadWear", 107:"InnerPants", 108:"InnerShirt",
    109:"InnerSocks", 110:"LeftArmWear", 111:"RightArmWear", 112:"LeftCalfWear", 113:"RightCalfWear",
    114:"LeftHandWear", 115:"RightHandWear", 116:"LeftElbowWear", 117:"RightElbowWear", 118:"KneeWear",
    120:"LeftWristWear", 121:"RightWristWear", 122:"MouthWear", 123:"NoseWear", 124:"OuterPants", 125:"OuterShirt",
    126:"OuterSocks", 127:"WaistWear", 128:"FaceWear", 129:"CharacterBodyType", 130:"NeckTattoo", 131:"FaceTattoo",
    132:"LeftLegTattoo", 133:"RightLegTattoo", 134:"PlayCard", 135:"GuardianCap", 136:"LeftEarAccessory",
    137:"RightEarAccessory", 138:"LeftHandAccessory", 139:"RightHandAccessory", 140:"NeckWear", 141:"OuterWear",
    142:"LeftThighWear", 143:"RightThighWear", 144:"ExtraAttire", 145:"Max", 254:"Invalid",
}

class ParseError(Exception): pass

class Reader:
    def __init__(self, data: bytes, name: str = "<buffer>"):
        self.data = data
        self.off = 0
        self.name = name
    def remaining(self) -> int:
        return len(self.data) - self.off
    def eof(self) -> bool:
        return self.off >= len(self.data)
    def peek(self) -> Optional[int]:
        return None if self.eof() else self.data[self.off]
    def read(self, n: int) -> bytes:
        if self.off + n > len(self.data):
            raise ParseError(f"{self.name}: need {n} bytes at 0x{self.off:x}, only {self.remaining()} remain")
        out = self.data[self.off:self.off+n]
        self.off += n
        return out
    def read_byte(self) -> int:
        return self.read(1)[0]


def sixbit_decode(data: bytes) -> str:
    total_bits = len(data) * 8
    value = int.from_bytes(data, 'big')
    return ''.join(chr(((value >> (total_bits - bit_offset - 6)) & 0x3F) + 32) for bit_offset in range(0, total_bits, 6))


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
        factor = 1 << (i * 6)
        if i > 1:
            factor <<= 1
        value += current * factor
        if is_negative:
            value *= -1
    return value


def read_modified_leb(reader: Reader, first: Optional[int] = None) -> int:
    raw = bytearray()
    if first is not None:
        raw.append(first)
    while not raw or (raw[-1] & 0x80):
        raw.append(reader.read_byte())
    return read_modified_leb_from_buf(bytes(raw))


def read_float_be(reader: Reader) -> float:
    import struct
    return struct.unpack('>f', reader.read(4))[0]


def read_string(reader: Reader) -> str:
    strlen = read_modified_leb(reader)
    if strlen < 0 or strlen > reader.remaining():
        raise ParseError(f"{reader.name}: bad string length {strlen} at 0x{reader.off:x}")
    raw = reader.read(strlen)
    return raw[:-1].decode('utf-8', errors='replace') if raw.endswith(b'\x00') else raw.decode('utf-8', errors='replace')


def normalize_value(field_name: Optional[str], field_key: str, field_type: int, reader: Reader) -> Any:
    if field_type == FIELD_TYPE_INT:
        if field_key == 'USKT':
            # h2-visuals-tools treats this as fixed 4 bytes C0 FE FB 07.
            if reader.remaining() >= 4:
                reader.read(4)
            return -8355712
        val = read_modified_leb(reader)
        if field_name == 'slotType':
            return SLOTS_26.get(val, val)
        if field_name in ENUM_REVERSE:
            return ENUM_REVERSE[field_name].get(val, val)
        return val
    if field_type == FIELD_TYPE_STRING:
        return read_string(reader)
    if field_type == FIELD_TYPE_FLOAT:
        return read_float_be(reader)
    raise ParseError(f"{reader.name}: unsupported scalar field type {field_type} for {field_key} at 0x{reader.off:x}")


def read_chvi_array(reader: Reader, array_length: int) -> list[dict[str, Any]]:
    array = []
    for _ in range(array_length):
        obj: dict[str, Any] = {}
        previous_byte = -1
        while True:
            if reader.eof():
                break
            if previous_byte != -1:
                reader.off -= 1
            if reader.peek() == 0:
                reader.read_byte()
                break
            field_key = sixbit_decode(reader.read(3))
            field_name = KEY_TO_FIELD.get(field_key)
            field_type = reader.read_byte()
            if field_type == FIELD_TYPE_ARRAY:
                # Unknown byte, then modified LEB length.
                reader.read_byte()
                nested_length = read_modified_leb(reader)
                value = read_chvi_array(reader, nested_length)
            else:
                value = normalize_value(field_name, field_key, field_type, reader)
            if field_name:
                obj[field_name] = value
            if reader.eof():
                break
            previous_byte = reader.read_byte()
            if previous_byte == 0x00:
                break
        array.append(obj)
    return array


def read_chvi_record(decompressed: bytes, record_key: int, game_year: int = 26) -> dict[str, Any]:
    r = Reader(decompressed, f"record[{record_key}]")
    # Madden 26 visual record: CHAN + CHAN + 00 00 + CHVI = 14-byte header.
    # Madden 25 visual record: CHVI = 4-byte header. Auto-detect to be safer.
    if game_year >= 26 and len(decompressed) >= 14 and sixbit_decode(decompressed[10:13]) == 'CHVI':
        r.read(14)
    elif len(decompressed) >= 4:
        r.read(4)
    out: dict[str, Any] = {}
    while r.remaining() > 1:
        if r.peek() == 0:
            r.read_byte()
            continue
        field_key = sixbit_decode(r.read(3))
        field_name = KEY_TO_FIELD.get(field_key)
        field_type = r.read_byte()
        if field_type == 0x03:
            # Unknown marker sometimes occurs before real fields.
            if r.peek() == 0:
                r.read_byte()
            continue
        if field_type == FIELD_TYPE_ARRAY:
            r.read_byte()  # unknown byte, usually 0x03
            array_length = read_modified_leb(r)
            value = read_chvi_array(r, array_length)
            if not r.eof():
                b = r.read_byte()
                if b != 0:
                    r.off -= 1
        else:
            value = normalize_value(field_name, field_key, field_type, r)
        if field_name:
            out[field_name] = value
    return out


def decompress_record(comp: bytes) -> bytes:
    try:
        return gzip.decompress(comp)
    except Exception:
        return zlib.decompress(comp)


def find_first_visual_blbm(data: bytes) -> Tuple[int, int, int, int]:
    """Return (table_offset, count, payload_offset, unknown2) for first large BLBM table."""
    # In the supplied Madden roster DB, the first top-level BLOB record begins at offset 10.
    # Search rather than hard-code entirely: six-bit 'BLBM' + type 5.
    target = bytes.fromhex('8ac8ad05')
    candidates = []
    start = 0
    while True:
        off = data.find(target, start)
        if off == -1:
            break
        if off + 7 < len(data):
            rr = Reader(data[off+5:], f"BLBM_header@0x{off:x}")
            unknown2 = rr.read_byte()
            try:
                count = read_modified_leb(rr)
            except Exception:
                count = -1
            candidates.append((off, count, off+5+rr.off, unknown2))
        start = off + 1
    # Visuals table has thousands of records; later body-blend mini-table has hundreds.
    large = [c for c in candidates if c[1] and c[1] > 1000]
    if not large:
        raise ParseError(f"no large BLBM visuals table found; candidates={candidates[:10]}")
    return large[0]


def parse_visuals(input_path: Path, output_path: Path, game_year: int = 26) -> dict[str, Any]:
    data = input_path.read_bytes()
    table_offset, count, payload_offset, unknown2 = find_first_visual_blbm(data)
    r = Reader(data[payload_offset:], f"visual_BLBM@0x{table_offset:x}")
    player_map: dict[str, Any] = {}
    warnings: list[str] = []
    for i in range(count):
        try:
            record_key = read_modified_leb(r)
            record_size = read_modified_leb(r)
            comp = r.read(record_size)
            dec = decompress_record(comp)
            obj = read_chvi_record(dec, record_key, game_year=game_year)
            player_map[str(record_key)] = obj
        except Exception as e:
            warnings.append(f"record_index={i}: {e}")
            # Try to stop only after unrecoverable stream issue.
            break
    out = {"characterVisualsPlayerMap": player_map}
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open('w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=4)
    meta = {
        "input_file": str(input_path),
        "output_file": str(output_path),
        "format": "H2-style Madden 26 characterVisualsPlayerMap JSON",
        "source_table": "BLBM",
        "source_table_offset": table_offset,
        "source_table_unknown2": unknown2,
        "declared_records": count,
        "parsed_records": len(player_map),
        "warnings": warnings,
        "sample_keys": list(player_map.keys())[:5],
    }
    return meta



def validate_visuals(input_path: Path, game_year: int = 26) -> dict[str, Any]:
    """Parse Character Visuals without writing the huge nested JSON file.

    This is used by binary save validation so Save DB can confirm CHVI records are
    readable without leaving another 50-80 MB JSON file in the session folder.
    """
    data = input_path.read_bytes()
    table_offset, count, payload_offset, unknown2 = find_first_visual_blbm(data)
    r = Reader(data[payload_offset:], f"visual_BLBM@0x{table_offset:x}")
    warnings: list[str] = []
    sample_keys: list[int] = []
    parsed = 0
    for i in range(count):
        try:
            record_key = read_modified_leb(r)
            record_size = read_modified_leb(r)
            comp = r.read(record_size)
            dec = decompress_record(comp)
            _obj = read_chvi_record(dec, record_key, game_year=game_year)
            if len(sample_keys) < 5:
                sample_keys.append(record_key)
            parsed += 1
        except Exception as e:
            warnings.append(f"record_index={i}: {e}")
            break
    return {
        "input_file": str(input_path),
        "format": "H2-style Madden 26 character visuals validation",
        "source_table": "BLBM",
        "source_table_offset": table_offset,
        "source_table_unknown2": unknown2,
        "declared_records": count,
        "parsed_records": parsed,
        "warnings": warnings,
        "sample_keys": sample_keys,
    }

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('input')
    ap.add_argument('output')
    ap.add_argument('--game-year', type=int, default=26)
    args = ap.parse_args()
    meta = parse_visuals(Path(args.input), Path(args.output), args.game_year)
    print(json.dumps(meta, indent=2))

if __name__ == '__main__':
    main()
