from __future__ import annotations

import gzip
import shutil
import subprocess
from datetime import datetime
from pathlib import Path

from app.main import (
    build_cdb_container,
    detect_input_format,
    extract_roster_payload,
    read_json,
    run_tdb_bridge_summary,
    write_json,
)
from app.parsers.encode_h2_visuals import encode_chvi_record
from app.parsers.parse_h2_visuals_json import parse_visuals
from app.parsers.parse_madden_tdb2 import write_outputs
from app.parsers.rebuild_madden_tdb2 import encode_modified_leb, raw_key_for

PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = Path(__file__).resolve().parents[1]
MFT_ROOT = BACKEND_ROOT / "vendor" / "madden-file-tools"
IMPORT_BRIDGE = BACKEND_ROOT / "tools" / "tdb_import_bridge.js"

H2_PREFIX = bytes.fromhex("8acbe2040301")


def encode_h2_from_visuals_json(visuals_json_path: Path, output_h2_path: Path, trailer: bytes) -> None:
    visuals = read_json(visuals_json_path)
    player_map = visuals.get("characterVisualsPlayerMap") or {}
    out = bytearray(H2_PREFIX)
    out += raw_key_for("BLBM", 5)
    out.append(0)
    out.append(2)
    keys = sorted(player_map.keys(), key=lambda v: int(v))
    out += encode_modified_leb(len(keys))
    for key in keys:
        record_key = int(key)
        dec = encode_chvi_record(player_map[key] if isinstance(player_map[key], dict) else {})
        comp = gzip.compress(dec, compresslevel=9, mtime=0)
        out += encode_modified_leb(record_key)
        out += encode_modified_leb(len(comp))
        out += comp
    out += trailer
    output_h2_path.write_bytes(bytes(out))


def main() -> None:
    src_db = Path(r"C:\Users\Shadow\Desktop\CFB27\mroster_209_158\mroster_209_158.db")
    league_db = Path(r"C:\Users\Shadow\Desktop\CFB27\Test\league.DB")
    existing_visuals_json = src_db.with_name("mroster_209_158_character_visuals_nested.json")

    work = PROJECT_ROOT / "tmp_mroster_to_league"
    if work.exists():
        shutil.rmtree(work)
    work.mkdir(parents=True)

    src_parse = work / "src_parse"
    write_outputs(src_db, src_parse)

    if existing_visuals_json.exists():
        src_visuals_json = existing_visuals_json
    else:
        src_visuals_json = work / "src_visuals.json"
        parse_visuals(src_db, src_visuals_json, game_year=26)

    league_fmt = detect_input_format(league_db.read_bytes()[:64])
    league_raw = work / "league_raw.db"
    wrapper_meta = extract_roster_payload(league_db, league_fmt, league_raw)
    league_h2 = work / wrapper_meta["h2_path"]
    trailer = league_h2.read_bytes()[-10:]

    # Optional summary export for debugging/inspection.
    run_tdb_bridge_summary(league_raw, work / "league_parse")

    migrated_raw = work / "league_migrated_raw.db"
    cmd = [
        "node",
        str(IMPORT_BRIDGE),
        "--mft-root",
        str(MFT_ROOT),
        "--input",
        str(league_raw),
        "--source-parse-dir",
        str(src_parse),
        "--output",
        str(migrated_raw),
    ]
    completed = subprocess.run(cmd, capture_output=True, text=True, cwd=str(PROJECT_ROOT))
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr or completed.stdout or "table import bridge failed")

    migrated_h2 = work / "league_migrated.h2"
    encode_h2_from_visuals_json(src_visuals_json, migrated_h2, trailer)

    final_bytes = build_cdb_container(
        migrated_raw.read_bytes(),
        migrated_h2.read_bytes(),
        version=int(wrapper_meta.get("version") or 1),
    )

    backup_path = league_db.with_suffix(f".DB.bak-{datetime.now().strftime('%Y%m%d-%H%M%S')}")
    shutil.copy2(league_db, backup_path)
    league_db.write_bytes(final_bytes)

    write_json(
        work / "migration_report.json",
        {
            "source_db": str(src_db),
            "target_db": str(league_db),
            "backup_db": str(backup_path),
            "source_visuals_json": str(src_visuals_json),
            "output_size_bytes": len(final_bytes),
        },
    )
    print(f"Migrated roster written to {league_db}")
    print(f"Backup created at {backup_path}")


if __name__ == "__main__":
    main()
