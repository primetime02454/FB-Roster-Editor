from __future__ import annotations

import gzip
import json
import struct
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

from app.parsers.parse_h2_visuals_json import FIELD_LOOKUP, ENUM_LOOKUP, SLOTS_26, find_first_visual_blbm
from app.parsers.rebuild_madden_tdb2 import sixbit_encode, encode_modified_leb, raw_key_for, coerce_int

FIELD_BY_NAME = {name: (spec["key"], int(spec["type"])) for name, spec in FIELD_LOOKUP.items()}
SLOTS_26_REVERSE = {name: code for code, name in SLOTS_26.items()}

TOP_LEVEL_ORDER = [
    "assetName", "bodyType", "firstName", "jerseyNumber", "lastName", "containerId",
    "genericHeadName", "genericHead", "heightInches", "loadouts", "skinTone", "skinToneScale", "weightPounds",
]
LOADOUT_ORDER = ["loadoutCategory", "loadoutType", "loadoutElements"]
ELEMENT_ORDER = ["blends", "itemAssetName", "slotType"]
BLEND_ORDER = ["baseBlend", "barycentricBlend"]
ORDER_BY_CONTEXT = {
    "player": TOP_LEVEL_ORDER,
    "loadout": LOADOUT_ORDER,
    "element": ELEMENT_ORDER,
    "blend": BLEND_ORDER,
}

# Madden 26 CHVI record wrapper observed in roster files: CHAN + CHAN + 00 00 + CHVI.
CHVI_RECORD_PREFIX = raw_key_for("CHAN", 3) + raw_key_for("CHAN", 3) + b"\x00\x00" + raw_key_for("CHVI", 3)


def _ordered_keys(obj: Dict[str, Any], context: str) -> List[str]:
    ordered: List[str] = []
    seen = set()
    for key in ORDER_BY_CONTEXT.get(context, []):
        if key in obj and key not in seen:
            ordered.append(key)
            seen.add(key)
    for key in obj.keys():
        if key in FIELD_BY_NAME and key not in seen:
            ordered.append(key)
            seen.add(key)
    return ordered


def _enum_to_int(field_name: str, value: Any) -> int:
    if value is None or value == "":
        return 0
    if field_name == "slotType":
        if isinstance(value, str):
            if value in SLOTS_26_REVERSE:
                return int(SLOTS_26_REVERSE[value])
            # Support stringified numeric slots.
            try:
                return int(float(value))
            except Exception:
                raise ValueError(f"unknown slotType enum: {value!r}")
        return coerce_int(value)
    if field_name in ENUM_LOOKUP:
        if isinstance(value, str):
            lookup = ENUM_LOOKUP[field_name]
            if value in lookup:
                return int(lookup[value])
            try:
                return int(float(value))
            except Exception:
                raise ValueError(f"unknown {field_name} enum: {value!r}")
        return coerce_int(value)
    return coerce_int(value)


def _encode_string(value: Any) -> bytes:
    data = ("" if value is None else str(value)).encode("utf-8") + b"\x00"
    return encode_modified_leb(len(data)) + data


def _encode_scalar(field_name: str, value: Any) -> bytes:
    field_key, field_type = FIELD_BY_NAME[field_name]
    raw = sixbit_encode(field_key) + bytes([field_type])
    if field_type == 0:
        if field_key == "USKT":
            # h2-visuals-tools treats USKT as the fixed C0 FE FB 07 byte sequence.
            # The parser normalizes this to -8355712, so write back the original bytes.
            return raw + b"\xc0\xfe\xfb\x07"
        return raw + encode_modified_leb(_enum_to_int(field_name, value))
    if field_type == 1:
        return raw + _encode_string(value)
    if field_type == 10:
        try:
            f = float(0.0 if value is None or value == "" else value)
        except Exception:
            f = 0.0
        return raw + struct.pack(">f", f)
    raise ValueError(f"unsupported scalar visual field {field_name}/{field_key} type={field_type}")


def _array_context(field_name: str) -> str:
    if field_name == "loadouts":
        return "loadout"
    if field_name == "loadoutElements":
        return "element"
    if field_name == "blends":
        return "blend"
    return "object"


def _encode_object(obj: Dict[str, Any], context: str) -> bytes:
    out = bytearray()
    for field_name in _ordered_keys(obj, context):
        if field_name not in FIELD_BY_NAME:
            continue
        field_key, field_type = FIELD_BY_NAME[field_name]
        value = obj.get(field_name)
        if field_type == 4:
            arr = value if isinstance(value, list) else []
            out += sixbit_encode(field_key) + bytes([field_type, 0x03]) + encode_modified_leb(len(arr))
            child_context = _array_context(field_name)
            for child in arr:
                if not isinstance(child, dict):
                    child = {}
                out += _encode_object(child, child_context)
                out.append(0)
        else:
            out += _encode_scalar(field_name, value)
    return bytes(out)


def encode_chvi_record(player: Dict[str, Any]) -> bytes:
    return CHVI_RECORD_PREFIX + _encode_object(player, "player") + b"\x00"


def _numeric_sort_key(value: str) -> Tuple[int, Any]:
    try:
        return (0, int(value))
    except Exception:
        return (1, value)


def encode_visuals_blbm_table(visuals: Dict[str, Any], *, unknown1: int = 0, unknown2: int = 2) -> bytes:
    player_map = visuals.get("characterVisualsPlayerMap")
    if not isinstance(player_map, dict):
        raise ValueError("visuals JSON must contain characterVisualsPlayerMap object")
    out = bytearray()
    out += raw_key_for("BLBM", 5)
    out.append(int(unknown1) & 0xFF)
    out.append(int(unknown2) & 0xFF)
    keys = sorted(player_map.keys(), key=_numeric_sort_key)
    out += encode_modified_leb(len(keys))
    for key in keys:
        record_key = int(key)
        player = player_map[key]
        if not isinstance(player, dict):
            player = {}
        dec = encode_chvi_record(player)
        comp = gzip.compress(dec, compresslevel=9, mtime=0)
        out += encode_modified_leb(record_key)
        out += encode_modified_leb(len(comp))
        out += comp
    return bytes(out)


def encode_visuals_file(json_path: Path, original_db: Path | None = None, output_path: Path | None = None) -> Dict[str, Any]:
    visuals = json.loads(json_path.read_text(encoding="utf-8"))
    unknown1 = 0
    unknown2 = 2
    if original_db and original_db.exists():
        data = original_db.read_bytes()
        table_offset, declared_count, payload_offset, detected_unknown2 = find_first_visual_blbm(data)
        unknown1 = data[table_offset + 4]
        unknown2 = detected_unknown2
    encoded = encode_visuals_blbm_table(visuals, unknown1=unknown1, unknown2=unknown2)
    if output_path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(encoded)
    return {
        "visual_players_encoded": len(visuals.get("characterVisualsPlayerMap", {})),
        "encoded_visuals_blbm_size_bytes": len(encoded),
        "visuals_unknown1": unknown1,
        "visuals_unknown2": unknown2,
        "output_file": str(output_path) if output_path else None,
    }
