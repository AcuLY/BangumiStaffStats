"""Independent boundary examples for the bounded Archive fixture refresh."""

import os
import copy
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True
import refresh_derived_fixtures as refresh


class SummaryContractTests(unittest.TestCase):
    def test_absent_and_unicode_blank(self):
        for value in (None, "", "\u0085\u3000\t\r\n\0"):
            self.assertIsNone(refresh.normalize_summary(value))

    def test_control_normalization_preserves_literal_markup(self):
        self.assertEqual(
            refresh.normalize_summary(" \r\nA\rB\0\x01\t<b>C</b> [b]D[/b]\u3000"),
            "A\nB\t<b>C</b> [b]D[/b]",
        )

    def test_scalar_truncation_and_final_trim(self):
        self.assertEqual(refresh.normalize_summary("😀" * 8193), "😀" * 8192)
        self.assertEqual(refresh.normalize_summary("A" * 8191 + " \nB"), "A" * 8191)
        self.assertEqual(refresh.normalize_summary("\ufeffx\ufeff"), "\ufeffx\ufeff")

    def test_nontext_and_invalid_unicode_rejected(self):
        for value in (0, False, [], "\ud800"):
            with self.assertRaises((ValueError, UnicodeError)):
                refresh.normalize_summary(value)

    def test_real_sqlite_summary_bounds(self):
        with sqlite3.connect(":memory:") as con:
            con.executescript((refresh.REPOSITORY / refresh.SCHEMA / "schema.sql").read_text(encoding="utf-8"))
            for i, value in enumerate((None, "A", "😀" * 8192), 1):
                con.execute("INSERT INTO person(person_id,name,summary) VALUES(?,?,?)", (i, "fixture", value))
            self.assertEqual(con.execute("SELECT length(summary) FROM person WHERE person_id=3").fetchone()[0], 8192)
            for value in ("", "A" * 8193, "A\0B"):
                with self.assertRaises(sqlite3.IntegrityError):
                    con.execute("INSERT INTO person(person_id,name,summary) VALUES(99,'invalid',?)", (value,))

    def test_unicode_whitespace_does_not_split_jsonlines_on_refresh(self):
        document = json.loads((refresh.REPOSITORY / refresh.PRODUCER / "cases/valid-seven-source.json").read_text(encoding="utf-8"))
        original = copy.deepcopy(document)
        sql_digest = refresh.digest((refresh.REPOSITORY / refresh.SCHEMA / "schema.sql").read_bytes())
        first = refresh.refresh_producer(document, sql_digest)
        second = refresh.refresh_producer(copy.deepcopy(first), sql_digest)
        self.assertEqual(first, second)
        self.assertEqual(first, original)
        people = first["expected"]["logicalProjection"]["person"]
        self.assertEqual(len(people), 6)
        self.assertIsNone(next(p["summary"] for p in people if p["personId"] == 104))

    def test_output_inventory_rejects_escape_and_unlisted(self):
        root = refresh.REPOSITORY
        for relative in ("../outside", "/absolute", "contracts/unlisted.json"):
            with self.assertRaises(ValueError):
                refresh.safe_target(root, relative, {"contracts/known.json"})

    def test_output_inventory_rejects_symlink(self):
        temp = refresh.REPOSITORY / refresh.SCHEMA / ".tmp"
        temp.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="refresh-test-", dir=temp) as directory:
            root = Path(directory)
            (root / "real").write_text("preserve", encoding="utf-8")
            try:
                os.symlink(root / "real", root / "alias")
            except OSError:
                self.skipTest("symlink creation unavailable on this host")
            with self.assertRaises(ValueError):
                refresh.safe_target(root, "alias", {"alias"})
            self.assertEqual((root / "real").read_text(encoding="utf-8"), "preserve")


if __name__ == "__main__":
    unittest.main()
