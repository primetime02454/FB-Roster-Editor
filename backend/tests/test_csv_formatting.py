import tempfile
import unittest
import zlib
from pathlib import Path
from unittest.mock import patch

from app.main import (
    build_visuals_table,
    build_wrapped_roster,
    crc32_be,
    default_save_mode,
    detect_input_format,
    detect_roster_family_from_meta,
    extract_roster_payload,
    find_fbchunks_payload_start,
    looks_like_franchise_payload,
    get_field_description,
    get_field_labels_for_table,
    roster_family_for_session,
    sanitize_table_obj,
    set_visuals_cell,
    should_parse_as_franchise,
    should_use_hc09_bridge,
    stable_table_columns,
)
from app.parsers.parse_madden_tdb2 import flatten_for_csv


class FlattenForCsvTests(unittest.TestCase):
    def test_none_becomes_zero(self):
        self.assertEqual(flatten_for_csv(None), 0)

    def test_empty_string_becomes_zero(self):
        self.assertEqual(flatten_for_csv(""), 0)

    def test_numeric_zero_stays_zero(self):
        self.assertEqual(flatten_for_csv(0), 0)

    def test_non_empty_string_stays_string(self):
        self.assertEqual(flatten_for_csv("Georgia State"), "Georgia State")


class SanitizeTableObjTests(unittest.TestCase):
    def test_strips_frontend_only_columns_before_save(self):
        table_obj = {
            "field_definitions": [
                {"name": "TGID", "type": 0},
                {"name": "PPOS", "type": 0},
                {"name": "PFNA", "type": 1},
            ],
            "records": [
                {
                    "_index": 0,
                    "TGID": 1136,
                    "PPOS": 0,
                    "PFNA": "Keith",
                    "TeamName": "Georgia State",
                    "Position": "QB",
                    "__rowIndex": 0,
                    "UnexpectedColumn": "drop me",
                }
            ],
        }

        sanitized = sanitize_table_obj(table_obj)

        self.assertEqual(
            sanitized["records"][0],
            {
                "_index": 0,
                "TGID": 1136,
                "PPOS": 0,
                "PFNA": "Keith",
            },
        )


class VisualsTableTests(unittest.TestCase):
    def test_build_visuals_table_flattens_slot_types(self):
        visuals = {
            "characterVisualsPlayerMap": {
                "123": {
                    "firstName": "Jane",
                    "loadouts": [
                        {
                            "loadoutType": 1,
                            "loadoutElements": [
                                {
                                    "slotType": 93,
                                    "itemAssetName": "helmet_alpha",
                                    "blends": [{"baseBlend": 1.5, "barycentricBlend": 2.5}],
                                }
                            ],
                        }
                    ],
                }
            }
        }

        table = build_visuals_table(visuals)

        self.assertIn("Player ID", table["columns"])
        self.assertIn("slotType: 93", table["columns"])
        self.assertIn("slotType: 93 baseBlend", table["columns"])
        self.assertEqual(table["rows"][0]["Player ID"], "123")
        self.assertEqual(table["rows"][0]["slotType: 93"], "helmet_alpha")
        self.assertEqual(table["rows"][0]["slotType: 93 baseBlend"], 1.5)

    def test_set_visuals_cell_rebuilds_nested_slot_type_value(self):
        player = {"firstName": "Jane", "loadouts": []}

        set_visuals_cell(player, "slotType: 93", "helmet_beta")
        set_visuals_cell(player, "slotType: 93 baseBlend", 7.25)

        element = player["loadouts"][1]["loadoutElements"][0]
        self.assertEqual(element["slotType"], 93)
        self.assertEqual(element["itemAssetName"], "helmet_beta")
        self.assertEqual(element["blends"][0]["baseBlend"], 7.25)

    def test_build_visuals_table_handles_named_slot_types(self):
        visuals = {
            "characterVisualsPlayerMap": {
                "321": {
                    "loadouts": [
                        {
                            "loadoutType": 1,
                            "loadoutElements": [
                                {"slotType": "CharacterBodyType", "itemAssetName": "BodySlim"}
                            ],
                        }
                    ],
                }
            }
        }

        table = build_visuals_table(visuals)

        self.assertIn("slotType: CharacterBodyType", table["columns"])
        self.assertEqual(table["rows"][0]["slotType: CharacterBodyType"], "BodySlim")


class InputFormatTests(unittest.TestCase):
    def test_detects_fbchunks_wrapper(self):
        fmt = detect_input_format(b"FBCHUNKS\x01\x00rest")
        self.assertEqual(fmt["container"], "fbchunks")

    def test_detects_raw_database(self):
        fmt = detect_input_format(bytes.fromhex("8acbe2038acbe204"))
        self.assertEqual(fmt["container"], "tdb2")

    def test_extracts_fbchunks_payload(self):
        raw = b"example roster payload"
        header = bytearray(b"FBCHUNKS" + b"\x00" * (0x4A - 8))
        header[0x16:0x18] = (2025).to_bytes(2, "little")
        wrapped = bytes(header) + zlib.compress(raw, level=9)

        with tempfile.TemporaryDirectory() as tmp:
            input_path = Path(tmp) / "wrapped"
            output_path = Path(tmp) / "payload.db"
            input_path.write_bytes(wrapped)
            meta = extract_roster_payload(input_path, {"container": "fbchunks", "label": "FBCHUNKS wrapped save"}, output_path)
            self.assertEqual(output_path.read_bytes(), raw)
            self.assertEqual(meta["data_start"], 0x4A)

    def test_finds_modern_fbchunks_payload_start_from_zlib_header(self):
        raw = b"example roster payload"
        header = bytearray(b"FBCHUNKS" + b"\x00" * (0x48 - 8))
        header[0x16:0x18] = (2026).to_bytes(2, "little")
        wrapped = bytes(header) + zlib.compress(raw, level=9)

        self.assertEqual(find_fbchunks_payload_start(wrapped, 2026), 0x48)

    def test_builds_wrapped_roster_with_expected_crc_and_size(self):
        raw = b"example roster payload"
        header = bytearray(b"FBCHUNKS" + b"\x00" * (0x4A - 8))
        wrapped = build_wrapped_roster(raw, bytes(header))
        self.assertEqual(wrapped[:8], b"FBCHUNKS")
        self.assertEqual(int.from_bytes(wrapped[0x12:0x16], "little"), len(raw))
        self.assertEqual(int.from_bytes(wrapped[0x1A:0x1E], "little"), crc32_be(raw))
        self.assertEqual(zlib.decompress(wrapped[0x4A:]), raw)

    def test_fbchunks_sessions_use_hc09_bridge(self):
        self.assertTrue(should_use_hc09_bridge({"input_container": "fbchunks"}))

    def test_raw_sessions_do_not_use_hc09_bridge(self):
        self.assertFalse(should_use_hc09_bridge({"input_container": "tdb2"}))

    def test_wrapped_roster_file_without_extension_is_not_forced_to_franchise(self):
        input_path = Path("ROSTER-TESTBETA")
        fmt = {"container": "fbchunks", "label": "FBCHUNKS wrapped save"}
        self.assertFalse(should_parse_as_franchise(input_path, fmt))

    def test_wrapped_roster_sessions_default_to_wrapped_save_mode(self):
        self.assertEqual(default_save_mode({"input_container": "fbchunks"}), "fbchunks")
        self.assertEqual(default_save_mode({"input_container": "tdb2"}), "tdb2")

    def test_detects_franchise_payload_by_header(self):
        self.assertTrue(looks_like_franchise_payload(bytes.fromhex("4672546b00000000")))
        self.assertFalse(looks_like_franchise_payload(bytes.fromhex("8acbe2038acbe204")))


class FranchiseFamilyTests(unittest.TestCase):
    def test_detect_roster_family_from_meta_prefers_explicit_hint(self):
        self.assertEqual(detect_roster_family_from_meta({"roster_family_hint": "college"}), "college")
        self.assertEqual(detect_roster_family_from_meta({"roster_family_hint": "madden"}), "madden")

    def test_detect_roster_family_from_meta_uses_college_branding(self):
        self.assertEqual(detect_roster_family_from_meta({"input_file": "DYNASTY", "input_container_label": "College-27-CTRE_RL2"}), "college")

    def test_detect_roster_family_from_meta_defaults_franchise_to_madden_without_hint(self):
        self.assertEqual(detect_roster_family_from_meta({"session_kind": "franchise"}), "madden")

    def test_roster_family_for_franchise_session_uses_metadata_hint(self):
        with patch("app.main.session_metadata", return_value={"session_kind": "franchise", "roster_family_hint": "college"}):
            self.assertEqual(roster_family_for_session("abc123"), "college")


class FieldDescriptionTests(unittest.TestCase):
    def test_player_field_description_uses_amp_define_labels(self):
        self.assertEqual(get_field_description("PLAY", "PACC"), "Acceleration")

    def test_team_field_description_uses_amp_team_constants(self):
        self.assertEqual(get_field_description("TEAM", "TDNA"), "Team Name")

    def test_tcps_field_description_uses_rankings_labels(self):
        labels = get_field_labels_for_table("TCPS")
        self.assertEqual(labels["TCRK"], "Coaches Rankings")
        self.assertEqual(labels["TMRK"], "Media Rankings")
        self.assertEqual(labels["TGID"], "Team ID")


class TableColumnTests(unittest.TestCase):
    def test_sparse_schema_field_stays_in_definition_order(self):
        obj = {
            "field_definitions": [{"name": "A"}, {"name": "PIIP"}, {"name": "B"}],
            "records": [{"A": 1, "B": 2}, {"A": 3, "PIIP": 1, "B": 4}],
        }
        self.assertEqual(stable_table_columns("session", "BLOB.PLAY", obj), ["A", "PIIP", "B"])


if __name__ == "__main__":
    unittest.main()
