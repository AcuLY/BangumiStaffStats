#!/usr/bin/env python3
"""Build deterministic, tiny Archive contract fixtures using Python stdlib only."""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import re
import shutil
import sqlite3
import sys
import tempfile
from pathlib import Path
from typing import Any


SCRIPT = Path(__file__).resolve()
SCHEMA_ROOT = SCRIPT.parents[1]
CONTRACTS_ROOT = SCHEMA_ROOT.parents[1]
GOLDEN_ROOT = CONTRACTS_ROOT / "goldens" / "archive"
SCHEMA_SQL = SCHEMA_ROOT / "schema.sql"
COMPATIBILITY_MATRIX = SCHEMA_ROOT / "compatibility-matrix.json"
SAFE_INTEGER_MAX = 9_007_199_254_740_991
SUBJECT_TYPE_MAP = {
    1: "book",
    2: "anime",
    3: "music",
    4: "game",
    6: "real",
}
LOCKED_RELATION_TYPES = (
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11,
    12,
    14,
    99,
    1002,
    1003,
    1004,
    1005,
    1006,
    1007,
    1008,
    1010,
    1011,
    1012,
    1013,
    1014,
    1015,
    1099,
    3001,
    3002,
    3003,
    3004,
    3005,
    3006,
    3007,
    3099,
    4002,
    4003,
    4006,
    4007,
    4008,
    4009,
    4010,
    4012,
    4013,
    4014,
    4015,
    4016,
    4017,
    4018,
    4019,
    4099,
)
SUBJECT_TYPE_DOMAIN_SEAL = "5a78c4f014c3f76d16b2d902afb0e5f0ae25540fce9485c6a908f39abff55000"
CAST_ROLE_DOMAIN_SEAL = "c5d161527c5f9d09a2ed9cd76c4063481472f14da4dda40d19468bbfab4421a7"
RELATION_TYPE_DOMAIN_SEAL = "a12d764c98b4064df39a139914790aade8b6e887ca3d50e7b4c6a955ea4cd9ca"
APPLICATION_ID = 1_111_969_107
SQLITE_SCHEMA_VERSION = 1
MANIFEST_SCHEMA_VERSION = 1
POINTER_SCHEMA_VERSION = 1
ALGORITHM = "bgmss-archive-data-version-v1"
SCHEMA_OBJECT_ALGORITHM = "bgmss-sqlite-schema-objects-v1"
SCHEMA_OBJECT_COUNT = 35
COMMON_COMMIT = "6a8442c17143a870357a5ff812362e8b5cfe9f9d"
SOURCE_NAMES = (
    "subject.jsonlines",
    "person.jsonlines",
    "character.jsonlines",
    "subject-persons.jsonlines",
    "subject-characters.jsonlines",
    "person-characters.jsonlines",
    "subject-relations.jsonlines",
)
TABLE_NAMES = (
    "archive_meta",
    "subject",
    "subject_rating_bucket",
    "subject_tag",
    "person",
    "person_career",
    "character",
    "subject_relation",
    "staff_position",
    "staff_position_category",
    "staff_credit",
    "cast_credit",
    "staff_set",
    "staff_set_member",
    "catalog_position",
    "catalog_position_member",
    "catalog_group",
    "catalog_group_member",
    "catalog_capability",
    "catalog_selection_rule",
)
REQUIRED_INDEXES = (
    "idx_subject_filter_date_id",
    "idx_subject_relation_source",
    "idx_subject_tag_lookup",
    "idx_person_career_lookup",
    "idx_staff_position_category_lookup",
    "idx_staff_credit_lookup",
    "idx_cast_credit_role_lookup",
    "idx_cast_credit_character_lookup",
    "idx_staff_set_member_lookup",
    "idx_catalog_position_order",
    "idx_catalog_position_member_lookup",
    "idx_catalog_group_order",
    "idx_catalog_group_member_lookup",
    "idx_catalog_capability_lookup",
    "idx_catalog_selection_rule_lookup",
)
MISSING = object()
PARTIAL_DATE = re.compile(
    r"^(?P<year>[0-9]{4})(?:-(?P<month>[0-9]{2})(?:-(?P<day>[0-9]{2}))?)?$",
    re.ASCII,
)
GENERATED_AT = re.compile(
    r"^(?P<year>[0-9]{4})-(?P<month>[0-9]{2})-(?P<day>[0-9]{2})"
    r"T(?P<hour>[0-9]{2}):(?P<minute>[0-9]{2}):(?P<second>[0-9]{2})"
    r"(?P<fraction>\.[0-9]{1,6})?Z$",
    re.ASCII,
)
MANIFEST_STRING_VECTOR = "vectors/manifest-string-semantics.json"
MANIFEST_STRING_CASE_IDS = (
    "generated-at-valid-no-fraction",
    "generated-at-invalid-fraction-0",
    "generated-at-valid-fraction-1",
    "generated-at-valid-fraction-6",
    "generated-at-invalid-fraction-7",
    "generated-at-valid-min-year",
    "generated-at-valid-max-year",
    "generated-at-invalid-year-zero",
    "generated-at-invalid-1900-leap-day",
    "generated-at-valid-2000-leap-day",
    "generated-at-invalid-impossible-fields",
    "generated-at-invalid-hour-24",
    "generated-at-invalid-minute-60",
    "generated-at-invalid-second-60",
    "generated-at-invalid-offset",
    "archive-url-invalid-ascii-min-minus-one",
    "archive-url-valid-ascii-min",
    "archive-url-invalid-multibyte-short",
    "archive-url-valid-multibyte-max",
    "archive-url-invalid-multibyte-max-plus-one",
    "common-url-valid-multibyte-max",
    "common-url-invalid-multibyte-max-plus-one",
    "archive-url-valid-surrogate-pair",
    "archive-url-invalid-isolated-high-surrogate",
    "archive-url-invalid-isolated-low-surrogate",
)
SENTINELS = (
    (
        "unknown-position-preserved-without-catalog-placeholder",
        """
        SELECT COUNT(*) FROM staff_credit AS c
        LEFT JOIN staff_position AS p
          ON p.subject_type = c.subject_type
         AND p.position_id = c.position_id
        WHERE p.position_id IS NULL
        """,
        1,
    ),
    (
        "eligible-exact-cast",
        "SELECT COUNT(*) FROM cast_credit WHERE eligible = 1 AND provenance = 'exact'",
        6,
    ),
    (
        "main-cast-is-raw-role-1",
        "SELECT COUNT(*) FROM cast_credit WHERE eligible = 1 AND role_type = 1",
        1,
    ),
    (
        "all-cast-includes-raw-roles-1-through-6",
        """
        SELECT COUNT(*) FROM cast_credit
        WHERE eligible = 1
          AND provenance = 'exact'
          AND typeof(role_type) = 'integer'
          AND role_type BETWEEN 1 AND 6
        """,
        6,
    ),
    (
        "locked-raw-relation-domain",
        """
        SELECT COUNT(DISTINCT relation_type) FROM subject_relation
        WHERE typeof(relation_type) = 'integer'
        """,
        52,
    ),
    (
        "relation-code-2-source-direction",
        """
        SELECT COUNT(*) FROM subject_relation
        WHERE subject_type = 'anime'
          AND subject_id = 1
          AND related_subject_type = 'anime'
          AND related_subject_id = 2
          AND relation_type = 2
        """,
        1,
    ),
    (
        "relation-code-3-source-direction",
        """
        SELECT COUNT(*) FROM subject_relation
        WHERE subject_type = 'anime'
          AND subject_id = 2
          AND related_subject_type = 'anime'
          AND related_subject_id = 1
          AND relation_type = 3
        """,
        1,
    ),
    (
        "raw-domain-text-values-absent",
        """
        SELECT
          (SELECT COUNT(*) FROM cast_credit WHERE typeof(role_type) <> 'integer')
          +
          (SELECT COUNT(*) FROM subject_relation WHERE typeof(relation_type) <> 'integer')
        """,
        0,
    ),
    (
        "selectable-unknown-position-absent",
        "SELECT COUNT(*) FROM catalog_position WHERE position_key = 'staff:anime:999999'",
        0,
    ),
    (
        "normalized-subject-type-anime",
        "SELECT COUNT(*) FROM subject WHERE subject_type = 'anime' AND subject_id = 1",
        1,
    ),
    (
        "normalized-subject-type-book",
        "SELECT COUNT(*) FROM subject WHERE subject_type = 'book' AND subject_id = 1",
        1,
    ),
    (
        "normalized-subject-type-music",
        "SELECT COUNT(*) FROM subject WHERE subject_type = 'music' AND subject_id = 1",
        1,
    ),
    (
        "normalized-subject-type-game",
        "SELECT COUNT(*) FROM subject WHERE subject_type = 'game' AND subject_id = 1",
        1,
    ),
    (
        "normalized-subject-type-real",
        "SELECT COUNT(*) FROM subject WHERE subject_type = 'real' AND subject_id = 1",
        1,
    ),
    (
        "safe-subject-count",
        "SELECT COUNT(*) FROM subject WHERE nsfw = 0",
        7,
    ),
    (
        "nsfw-subject-count",
        "SELECT COUNT(*) FROM subject WHERE nsfw = 1",
        1,
    ),
    (
        "month-filter-eligible-subject-count",
        """
        SELECT COUNT(*) FROM subject
        WHERE air_date_precision IN (2, 3)
          AND substr(air_date, 1, 7) BETWEEN '2024-01' AND '2025-12'
        """,
        2,
    ),
    (
        "year-only-date-preserved",
        """
        SELECT COUNT(*) FROM subject
        WHERE subject_type = 'anime'
          AND subject_id = 3
          AND air_date = '2023'
          AND air_date_precision = 1
        """,
        1,
    ),
    (
        "null-date-precision-consistent",
        """
        SELECT COUNT(*) FROM subject
        WHERE (air_date IS NULL) <> (air_date_precision IS NULL)
        """,
        0,
    ),
)


def fail(message: str) -> None:
    raise RuntimeError(message)


def days_in_month(year: int, month: int) -> int:
    if month == 2:
        leap = year % 400 == 0 or (year % 4 == 0 and year % 100 != 0)
        return 29 if leap else 28
    if month in (4, 6, 9, 11):
        return 30
    return 31


def normalized_subject_type(value: Any) -> str:
    if type(value) is not int or value not in SUBJECT_TYPE_MAP:
        fail(f"subject type is outside the registered source domain: {value!r}")
    return SUBJECT_TYPE_MAP[value]


def raw_cast_role_type(value: Any) -> int:
    if type(value) is not int or not 1 <= value <= 6:
        fail(f"cast role is outside the registered source domain: {value!r}")
    return value


def raw_relation_type(value: Any) -> int:
    if type(value) is not int or not 1 <= value <= SAFE_INTEGER_MAX:
        fail(f"relation type is not a positive JSON-safe source integer: {value!r}")
    return value


def raw_domain_self_test() -> dict[str, Any]:
    mapped_types = tuple(
        normalized_subject_type(value) for value in SUBJECT_TYPE_MAP
    )
    if mapped_types != ("book", "anime", "music", "game", "real"):
        fail(f"subject type mapping drifted: {mapped_types!r}")
    cast_roles = tuple(raw_cast_role_type(value) for value in range(1, 7))
    relation_types = tuple(
        raw_relation_type(value) for value in LOCKED_RELATION_TYPES
    )

    rejected_subject_types = (0, 5, 7, -1, None, True, 2.0, "2")
    rejected_cast_roles = (0, 7, -1, SAFE_INTEGER_MAX, None, True, 1.0, "1")
    rejected_relation_types = (
        0,
        -1,
        SAFE_INTEGER_MAX + 1,
        None,
        True,
        1.0,
        2.5,
        "2",
    )
    for function, values in (
        (normalized_subject_type, rejected_subject_types),
        (raw_cast_role_type, rejected_cast_roles),
        (raw_relation_type, rejected_relation_types),
    ):
        for value in values:
            try:
                function(value)
            except RuntimeError:
                continue
            fail(f"raw domain adapter accepted invalid value: {value!r}")

    domain_preimages = {
        "subjectTypeDomainSeal": "".join(
            f"{value}\n" for value in SUBJECT_TYPE_MAP
        ).encode("ascii"),
        "castRoleDomainSeal": b"1\n2\n3\n4\n5\n6\n",
        "relationTypeDomainSeal": "".join(
            f"{value}\n" for value in LOCKED_RELATION_TYPES
        ).encode("ascii"),
    }
    domain_seals = {
        name: hashlib.sha256(preimage).hexdigest()
        for name, preimage in domain_preimages.items()
    }
    expected_seals = {
        "subjectTypeDomainSeal": SUBJECT_TYPE_DOMAIN_SEAL,
        "castRoleDomainSeal": CAST_ROLE_DOMAIN_SEAL,
        "relationTypeDomainSeal": RELATION_TYPE_DOMAIN_SEAL,
    }
    if domain_seals != expected_seals:
        fail(f"locked raw domain seals drifted: {domain_seals!r}")

    connection = sqlite3.connect(":memory:")
    try:
        connection.executescript(SCHEMA_SQL.read_text(encoding="utf-8"))
        connection.executemany(
            """
            INSERT INTO subject (
              subject_type, subject_id, name, nsfw, air_date,
              air_date_precision, votes
            ) VALUES (?, ?, ?, 0, NULL, NULL, 0)
            """,
            (
                ("anime", 1, "raw-domain-source"),
                ("anime", 2, "raw-domain-related"),
            ),
        )
        connection.execute(
            "INSERT INTO person VALUES (1, 'raw-domain-person', NULL, NULL)"
        )
        connection.execute(
            "INSERT INTO character VALUES (1, 'raw-domain-character', NULL)"
        )
        connection.commit()
        rejected_sql_rows = (
            (
                "cast-zero",
                "INSERT INTO cast_credit VALUES ('anime', 1, 1, 1, ?, 0, 1, 'exact')",
                0,
            ),
            (
                "cast-seven",
                "INSERT INTO cast_credit VALUES ('anime', 1, 1, 1, ?, 0, 1, 'exact')",
                7,
            ),
            (
                "cast-non-integral",
                "INSERT INTO cast_credit VALUES ('anime', 1, 1, 1, ?, 0, 1, 'exact')",
                1.5,
            ),
            (
                "cast-text-label",
                "INSERT INTO cast_credit VALUES ('anime', 1, 1, 1, ?, 0, 1, 'exact')",
                "main",
            ),
            (
                "relation-zero",
                "INSERT INTO subject_relation VALUES ('anime', 1, 'anime', 2, ?)",
                0,
            ),
            (
                "relation-unsafe",
                "INSERT INTO subject_relation VALUES ('anime', 1, 'anime', 2, ?)",
                SAFE_INTEGER_MAX + 1,
            ),
            (
                "relation-non-integral",
                "INSERT INTO subject_relation VALUES ('anime', 1, 'anime', 2, ?)",
                2.5,
            ),
            (
                "relation-text-label",
                "INSERT INTO subject_relation VALUES ('anime', 1, 'anime', 2, ?)",
                "sequel",
            ),
        )
        for label, statement, value in rejected_sql_rows:
            try:
                connection.execute(statement, (value,))
                connection.rollback()
            except sqlite3.DatabaseError:
                connection.rollback()
                continue
            fail(f"SQLite accepted invalid raw domain row: {label}")
    finally:
        connection.close()

    return {
        "subjectTypeMappings": len(mapped_types),
        "castRoles": len(cast_roles),
        "relationTypes": len(relation_types),
        "rejectedSubjectTypes": len(rejected_subject_types),
        "rejectedCastRoles": len(rejected_cast_roles),
        "rejectedRelationTypes": len(rejected_relation_types),
        "rejectedSqlRows": len(rejected_sql_rows),
        **domain_seals,
    }


def subject_semantics(
    nsfw: Any = MISSING,
    air_date: Any = None,
) -> tuple[int, str | None, int | None]:
    if type(nsfw) is not bool:
        fail("subject nsfw must be an explicit boolean")
    if air_date is None:
        return (int(nsfw), None, None)
    if type(air_date) is not str:
        fail("subject date must be a registered raw string or null")
    if "\0" in air_date:
        fail("subject date must not contain an embedded NUL")
    match = PARTIAL_DATE.fullmatch(air_date)
    if match is None:
        fail(f"subject date has an unregistered shape: {air_date!r}")
    year = int(match.group("year"))
    if year == 0:
        fail("subject date year 0000 is invalid")
    month_text = match.group("month")
    if month_text is None:
        return (int(nsfw), air_date, 1)
    month = int(month_text)
    if not 1 <= month <= 12:
        fail(f"subject date month is invalid: {air_date!r}")
    day_text = match.group("day")
    if day_text is None:
        return (int(nsfw), air_date, 2)
    day = int(day_text)
    if not 1 <= day <= days_in_month(year, month):
        fail(f"subject date day is invalid: {air_date!r}")
    return (int(nsfw), air_date, 3)


def subject_semantics_self_test() -> dict[str, int]:
    valid_mappings = (
        (False, None, (0, None, None)),
        (False, "0001", (0, "0001", 1)),
        (True, "2024-02", (1, "2024-02", 2)),
        (False, "2024-02-29", (0, "2024-02-29", 3)),
        (False, "2000-02-29", (0, "2000-02-29", 3)),
        (False, "1900-02-28", (0, "1900-02-28", 3)),
        (False, "9999-12-31", (0, "9999-12-31", 3)),
    )
    for nsfw, air_date, expected in valid_mappings:
        actual = subject_semantics(nsfw, air_date)
        if actual != expected:
            fail(f"subject semantic mapping mismatch: {actual!r} != {expected!r}")

    rejected_nsfw = (MISSING, None, 0, 1, 0.0, "0", "false", b"false")
    for value in rejected_nsfw:
        try:
            subject_semantics(value)
        except RuntimeError:
            continue
        fail(f"subject semantic mapping accepted invalid nsfw: {value!r}")

    rejected_dates: tuple[Any, ...] = (
        2024,
        b"2024",
        "",
        "2024-",
        "2024-2",
        "2024/02",
        "2024-02-29x",
        "2024\0junk",
        "2024-02\0junk",
        "2024-02-29\0junk",
        "0000",
        "0000-01",
        "2024-00",
        "2024-13",
        "2024-01-00",
        "2024-04-31",
        "2023-02-29",
        "1900-02-29",
    )
    for value in rejected_dates:
        try:
            subject_semantics(False, value)
        except RuntimeError:
            continue
        fail(f"subject semantic mapping accepted invalid date: {value!r}")

    invalid_rows = (
        ("nsfw-null", None, None, None),
        ("nsfw-negative", -1, None, None),
        ("nsfw-two", 2, None, None),
        ("nsfw-text", "false", None, None),
        ("date-without-precision", 0, "2024", None),
        ("precision-without-date", 0, None, 1),
        ("year-as-month", 0, "2024", 2),
        ("month-as-year", 0, "2024-02", 1),
        ("month-as-day", 0, "2024-02", 3),
        ("day-as-month", 0, "2024-02-29", 2),
        ("unknown-precision", 0, "2024", 4),
        ("trailing-date", 0, "2024-02-29x", 3),
        ("year-embedded-nul", 0, "2024\0junk", 1),
        ("month-embedded-nul", 0, "2024-02\0junk", 2),
        ("day-embedded-nul", 0, "2024-02-29\0junk", 3),
        ("year-zero", 0, "0000", 1),
        ("month-zero", 0, "2024-00", 2),
        ("month-thirteen", 0, "2024-13", 2),
        ("day-zero", 0, "2024-01-00", 3),
        ("april-thirty-one", 0, "2024-04-31", 3),
        ("common-year-leap-day", 0, "2023-02-29", 3),
        ("century-non-leap-day", 0, "1900-02-29", 3),
    )
    connection = sqlite3.connect(":memory:")
    try:
        connection.executescript(SCHEMA_SQL.read_text(encoding="utf-8"))
        statement = """
            INSERT INTO subject (
              subject_type, subject_id, name, name_cn, nsfw, air_date,
              air_date_precision, score, votes
            ) VALUES ('anime', ?, ?, NULL, ?, ?, ?, NULL, 0)
        """
        for subject_id, (label, nsfw, air_date, precision) in enumerate(
            invalid_rows, start=10_000
        ):
            try:
                connection.execute(
                    statement,
                    (subject_id, f"invalid-{label}", nsfw, air_date, precision),
                )
                connection.rollback()
            except sqlite3.DatabaseError:
                connection.rollback()
                continue
            fail(f"SQLite accepted invalid subject row: {label}")

        valid_rows = (
            ("null-date", False, None),
            ("year-date", False, "2023"),
            ("month-date", True, "2024-02"),
            ("leap-day", False, "2000-02-29"),
        )
        for subject_id, (label, nsfw, air_date) in enumerate(
            valid_rows, start=20_000
        ):
            stored_nsfw, stored_date, precision = subject_semantics(nsfw, air_date)
            connection.execute(
                statement,
                (
                    subject_id,
                    f"valid-{label}",
                    stored_nsfw,
                    stored_date,
                    precision,
                ),
            )
        valid_sql_rows = int(
            connection.execute(
                "SELECT COUNT(*) FROM subject WHERE subject_id >= 20000"
            ).fetchone()[0]
        )
        if valid_sql_rows != len(valid_rows):
            fail(f"SQLite valid subject count mismatch: {valid_sql_rows}")
    finally:
        connection.close()

    return {
        "validMappings": len(valid_mappings),
        "rejectedNsfwMappings": len(rejected_nsfw),
        "rejectedDateMappings": len(rejected_dates),
        "rejectedSqlRows": len(invalid_rows),
        "validSqlRows": len(valid_rows),
    }


def sha256_bytes(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


def file_digest(file_path: Path) -> str:
    return sha256_bytes(file_path.read_bytes())


def schema_object_record(connection: sqlite3.Connection) -> dict[str, Any]:
    rows = connection.execute(
        """
        SELECT type, name, tbl_name, sql
        FROM sqlite_schema
        WHERE type IN ('table', 'index', 'view', 'trigger')
          AND sql IS NOT NULL
          AND lower(substr(name, 1, 7)) <> 'sqlite_'
        ORDER BY
          type COLLATE BINARY,
          name COLLATE BINARY,
          tbl_name COLLATE BINARY
        """
    ).fetchall()
    preimage = bytearray()
    preimage.extend(f"{SCHEMA_OBJECT_ALGORITHM}\n".encode("ascii"))
    preimage.extend(f"count={len(rows)}\n".encode("ascii"))
    for object_type, name, table_name, sql in rows:
        for field, value in (
            ("type", object_type),
            ("name", name),
            ("table", table_name),
            ("sql", sql),
        ):
            if not isinstance(value, str):
                fail(f"SQLite schema {field} is not text: {value!r}")
            encoded = value.encode("utf-8", errors="strict")
            preimage.extend(f"{field}={len(encoded)}:".encode("ascii"))
            preimage.extend(encoded)
            preimage.extend(b"\n")
    return {
        "algorithm": SCHEMA_OBJECT_ALGORITHM,
        "digest": sha256_bytes(bytes(preimage)),
        "objectCount": len(rows),
    }


def canonical_schema_record() -> dict[str, Any]:
    matrix = json.loads(COMPATIBILITY_MATRIX.read_text(encoding="utf-8"))
    record = matrix.get("canonicalSchema")
    if not isinstance(record, dict) or list(record) != [
        "schemaSqlDigest",
        "algorithm",
        "digest",
        "objectCount",
    ]:
        fail("compatibility matrix canonicalSchema shape is invalid")
    if record["schemaSqlDigest"] != file_digest(SCHEMA_SQL):
        fail("compatibility matrix schemaSqlDigest differs from schema.sql")
    if record["algorithm"] != SCHEMA_OBJECT_ALGORITHM:
        fail("compatibility matrix schema object algorithm differs")
    if record["objectCount"] != SCHEMA_OBJECT_COUNT:
        fail("compatibility matrix schema object count differs")
    if not (
        isinstance(record["digest"], str)
        and len(record["digest"]) == 71
        and record["digest"].startswith("sha256:")
    ):
        fail("compatibility matrix schema object digest is invalid")
    return record


def schema_object_outcome(
    actual: dict[str, Any],
    canonical: dict[str, Any],
) -> str:
    expected = {
        "algorithm": canonical["algorithm"],
        "digest": canonical["digest"],
        "objectCount": canonical["objectCount"],
    }
    return "VALID" if actual == expected else "SQLITE_REQUIRED_OBJECT_MISSING"


def schema_object_self_test(canonical: dict[str, Any]) -> dict[str, Any]:
    schema_text = SCHEMA_SQL.read_text(encoding="utf-8")
    canonical_connection = sqlite3.connect(":memory:")
    try:
        canonical_connection.executescript(schema_text)
        actual = schema_object_record(canonical_connection)
    finally:
        canonical_connection.close()
    if schema_object_outcome(actual, canonical) != "VALID":
        fail(f"canonical SQLite schema object seal differs: {actual!r}")

    nul_constraint = "      AND instr(air_date, char(0)) = 0\n"
    if schema_text.count(nul_constraint) != 1:
        fail("canonical embedded-NUL constraint is not unique")
    weakened_text = schema_text.replace(nul_constraint, "", 1)
    weakened_connection = sqlite3.connect(":memory:")
    try:
        weakened_connection.executescript(weakened_text)
        weakened = schema_object_record(weakened_connection)
        weakened_connection.execute(
            """
            INSERT INTO subject (
              subject_type, subject_id, name, nsfw, air_date,
              air_date_precision, votes
            ) VALUES ('anime', 99999, 'weakened-nul-probe', 0, ?, 1, 0)
            """,
            ("2024\0junk",),
        )
    finally:
        weakened_connection.close()
    weakened_outcome = schema_object_outcome(weakened, canonical)
    if weakened["objectCount"] != SCHEMA_OBJECT_COUNT:
        fail(f"weakened schema changed object count: {weakened!r}")
    if weakened_outcome != "SQLITE_REQUIRED_OBJECT_MISSING":
        fail("weakened SQLite schema object definition was accepted")
    return {
        "canonical": actual,
        "weakenedDigest": weakened["digest"],
        "weakenedOutcome": weakened_outcome,
    }


def json_bytes(value: Any) -> bytes:
    return (
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=False) + "\n"
    ).encode("utf-8")


def write_bytes(file_path: Path, data: bytes) -> None:
    root = file_path.parent
    while root != root.parent and root != file_path.anchor:
        if root.exists() and root.is_symlink():
            fail(f"refusing to write through symlink: {root}")
        if root == file_path.parents[len(file_path.parents) - 1]:
            break
        root = root.parent
    file_path.parent.mkdir(parents=True, exist_ok=True)
    if file_path.exists() and (file_path.is_symlink() or not file_path.is_file()):
        fail(f"refusing to replace non-regular path: {file_path}")
    file_path.write_bytes(data)


def canonical_preimage(inputs: dict[str, Any]) -> bytes:
    lines = (
        ALGORITHM,
        f"archiveRelease={inputs['archiveRelease']}",
        f"archiveDigest={inputs['archiveDigest']}",
        f"commonCommit={inputs['commonCommit']}",
        f"commonDigest={inputs['commonDigest']}",
        f"manifestSchemaVersion={inputs['manifestSchemaVersion']}",
        f"sqliteSchemaVersion={inputs['sqliteSchemaVersion']}",
        f"schemaSqlDigest={inputs['schemaSqlDigest']}",
        f"domainRulesVersion={inputs['domainRulesVersion']}",
        f"castRulesVersion={inputs['castRulesVersion']}",
        f"catalogConfigDigest={inputs['catalogConfigDigest']}",
    )
    return ("\n".join(lines) + "\n").encode("utf-8")


def data_version(inputs: dict[str, Any]) -> str:
    return "dv1-" + hashlib.sha256(canonical_preimage(inputs)).hexdigest()


def semantic_inputs(sql_digest: str, sqlite_version: int = 1) -> dict[str, Any]:
    archive_bytes = b"bangumi-archive-golden-release-v1\n"
    common_bytes = b"bangumi-common-subject-staffs-golden-v1\n"
    catalog_bytes = (
        b'{"featured":["staff:anime:2","cast:anime:main"],'
        b'"sets":[],"subjectType":"anime"}\n'
    )
    return {
        "archiveRelease": "golden-v1",
        "archiveDigest": sha256_bytes(archive_bytes),
        "commonCommit": COMMON_COMMIT,
        "commonDigest": sha256_bytes(common_bytes),
        "manifestSchemaVersion": MANIFEST_SCHEMA_VERSION,
        "sqliteSchemaVersion": sqlite_version,
        "schemaSqlDigest": sql_digest,
        "domainRulesVersion": "domain-v1",
        "castRulesVersion": "cast-exact-v1",
        "catalogConfigDigest": sha256_bytes(catalog_bytes),
    }


def source_files() -> list[dict[str, Any]]:
    accounting = {
        "subject.jsonlines": (8, 8, 0, 0, 0),
        "person.jsonlines": (7, 7, 0, 0, 0),
        "character.jsonlines": (1, 1, 0, 0, 0),
        "subject-persons.jsonlines": (2, 1, 0, 0, 1),
        "subject-characters.jsonlines": (6, 6, 0, 0, 0),
        "person-characters.jsonlines": (1, 1, 0, 0, 0),
        "subject-relations.jsonlines": (52, 52, 0, 0, 0),
    }
    result: list[dict[str, Any]] = []
    for name in SOURCE_NAMES:
        synthetic = f"golden-source:{name}\n".encode("ascii")
        total, imported, duplicate, invalid, unresolved = accounting[name]
        result.append(
            {
                "name": name,
                "size": len(synthetic),
                "digest": sha256_bytes(synthetic),
                "recordsTotal": total,
                "imported": imported,
                "duplicate": duplicate,
                "invalid": invalid,
                "unresolved": unresolved,
            }
        )
    return result


def insert_minimal_rows(connection: sqlite3.Connection, version: str, inputs: dict[str, Any]) -> None:
    connection.execute(
        """
        INSERT INTO archive_meta (
          singleton, data_version, manifest_schema_version, sqlite_schema_version,
          data_version_algorithm, domain_rules_version, cast_rules_version,
          catalog_config_digest
        ) VALUES (1, ?, 1, 1, ?, ?, ?, ?)
        """,
        (
            version,
            ALGORITHM,
            inputs["domainRulesVersion"],
            inputs["castRulesVersion"],
            inputs["catalogConfigDigest"],
        ),
    )
    connection.executemany(
        """
        INSERT INTO subject (
          subject_type, subject_id, name, name_cn, nsfw, air_date,
          air_date_precision, score, votes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            (
                normalized_subject_type(2),
                1,
                "Golden Animation",
                "金标动画",
                *subject_semantics(False, "2024-01-01"),
                8.2,
                10,
            ),
            (
                "anime",
                2,
                "Golden Sequel",
                "金标续作",
                *subject_semantics(True, "2025-01"),
                7.8,
                5,
            ),
            (
                "anime",
                3,
                "Golden Year",
                "金标年份",
                *subject_semantics(False, "2023"),
                None,
                0,
            ),
            (
                "anime",
                4,
                "Golden Undated",
                "金标待定",
                *subject_semantics(False, None),
                None,
                0,
            ),
            (
                normalized_subject_type(1),
                1,
                "Golden Book",
                "金标书籍",
                *subject_semantics(False, None),
                None,
                0,
            ),
            (
                normalized_subject_type(3),
                1,
                "Golden Music",
                "金标音乐",
                *subject_semantics(False, None),
                None,
                0,
            ),
            (
                normalized_subject_type(4),
                1,
                "Golden Game",
                "金标游戏",
                *subject_semantics(False, None),
                None,
                0,
            ),
            (
                normalized_subject_type(6),
                1,
                "Golden Real",
                "金标三次元",
                *subject_semantics(False, None),
                None,
                0,
            ),
        ),
    )
    connection.executemany(
        "INSERT INTO subject_rating_bucket VALUES (?, ?, ?, ?)",
        (("anime", 1, 8, 10), ("anime", 2, 8, 5)),
    )
    connection.executemany(
        "INSERT INTO subject_tag VALUES (?, ?, ?, ?)",
        (
            ("anime", 1, "public", "golden"),
            ("anime", 1, "meta", "series:golden"),
        ),
    )
    connection.executemany(
        "INSERT INTO person VALUES (?, ?, ?, ?)",
        (
            (100, "Golden Director", "金标导演", None),
            (101, "Golden Voice", "金标声优", None),
            (102, "Golden Voice 2", "金标声优二", None),
            (103, "Golden Voice 3", "金标声优三", None),
            (104, "Golden Voice 4", "金标声优四", None),
            (105, "Golden Voice 5", "金标声优五", None),
            (106, "Golden Voice 6", "金标声优六", None),
        ),
    )
    connection.execute("INSERT INTO person_career VALUES (?, ?)", (101, "seiyu"))
    connection.execute(
        "INSERT INTO character VALUES (?, ?, ?)",
        (200, "Golden Character", "金标角色"),
    )
    connection.executemany(
        "INSERT INTO subject_relation VALUES (?, ?, ?, ?, ?)",
        tuple(
            (
                "anime",
                2 if relation_type == 3 else 1,
                "anime",
                1 if relation_type == 3 else 2,
                raw_relation_type(relation_type),
            )
            for relation_type in LOCKED_RELATION_TYPES
        ),
    )
    connection.execute(
        "INSERT INTO staff_position_category VALUES (?, ?, ?, ?)",
        ("anime", "production", "制作", 10),
    )
    connection.execute(
        """
        INSERT INTO staff_position (
          subject_type, position_id, name_cn, name_en, name_jp, categories,
          sort_order, status, common_commit
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            "anime",
            2,
            "导演",
            "Director",
            "監督",
            '["production"]',
            10,
            "selectable",
            COMMON_COMMIT,
        ),
    )
    connection.executemany(
        "INSERT INTO staff_credit VALUES (?, ?, ?, ?)",
        (
            ("anime", 1, 100, 2),
            ("anime", 1, 101, 999999),
        ),
    )
    connection.executemany(
        "INSERT INTO cast_credit VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        tuple(
            (
                "anime",
                1,
                100 + role_type,
                200,
                raw_cast_role_type(role_type),
                role_type,
                1,
                "exact",
            )
            for role_type in range(1, 7)
        ),
    )
    connection.executemany(
        """
        INSERT INTO catalog_position (
          position_key, subject_type, position_kind, label, name_cn, name_en,
          name_jp, display_order, selectable
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            (
                "staff:anime:2",
                "anime",
                "staff",
                "导演",
                "导演",
                "Director",
                "監督",
                10,
                1,
            ),
            (
                "cast:anime:main",
                "anime",
                "cast",
                "主要声优",
                "主要声优",
                "Main cast",
                None,
                20,
                1,
            ),
            (
                "cast:anime:all",
                "anime",
                "cast",
                "全部声优",
                "全部声优",
                "All cast",
                None,
                21,
                1,
            ),
        ),
    )
    connection.execute(
        "INSERT INTO catalog_position_member VALUES (?, ?)",
        ("cast:anime:all", "cast:anime:main"),
    )
    connection.execute(
        "INSERT INTO catalog_group VALUES (?, ?, ?, ?)",
        ("featured:anime", "anime", "常用职位", 10),
    )
    connection.executemany(
        "INSERT INTO catalog_group_member VALUES (?, ?, ?)",
        (
            ("featured:anime", "staff:anime:2", 10),
            ("featured:anime", "cast:anime:main", 20),
        ),
    )
    connection.executemany(
        "INSERT INTO catalog_capability VALUES (?, ?, ?)",
        (
            ("staff:anime:2", "rankings", 1),
            ("staff:anime:2", "candidates", 1),
            ("cast:anime:main", "coStar", 1),
            ("cast:anime:all", "coStar", 1),
        ),
    )
    connection.executemany(
        "INSERT INTO catalog_selection_rule VALUES (?, ?, ?, ?)",
        (
            (
                "select:staff:anime:2",
                "staff:anime:2",
                "exactStaff",
                "positionId=2",
            ),
            (
                "select:cast:anime:main",
                "cast:anime:main",
                "exactCast",
                "roleType=1",
            ),
        ),
    )


def create_database(
    file_path: Path,
    version: str,
    inputs: dict[str, Any],
    variant: str = "valid",
) -> None:
    file_path.parent.mkdir(parents=True, exist_ok=True)
    if file_path.exists():
        file_path.unlink()
    connection = sqlite3.connect(file_path)
    try:
        connection.execute("PRAGMA page_size = 4096")
        connection.execute("PRAGMA journal_mode = DELETE")
        connection.execute("PRAGMA synchronous = FULL")
        connection.executescript(SCHEMA_SQL.read_text(encoding="utf-8"))
        connection.execute("BEGIN IMMEDIATE")
        insert_minimal_rows(connection, version, inputs)
        connection.commit()
        if variant == "content-drift":
            connection.execute(
                "UPDATE subject SET name = 'Silver Animation' WHERE subject_type = 'anime' AND subject_id = 1"
            )
            connection.commit()
        elif variant == "metadata-mismatch":
            connection.execute(
                "UPDATE archive_meta SET data_version = ? WHERE singleton = 1",
                ("dv1-" + "0" * 64,),
            )
            connection.commit()
        elif variant == "required-index-missing":
            connection.execute("DROP INDEX idx_staff_credit_lookup")
            connection.commit()
        elif variant != "valid":
            fail(f"unknown SQLite variant: {variant}")
        connection.execute("VACUUM")
        integrity = connection.execute("PRAGMA integrity_check").fetchone()
        foreign_keys = connection.execute("PRAGMA foreign_key_check").fetchall()
        if integrity != ("ok",) or foreign_keys:
            fail(f"constructed database failed integrity checks: {integrity!r} {foreign_keys!r}")
    finally:
        connection.close()


def database_counts(file_path: Path) -> dict[str, int]:
    uri = f"{file_path.resolve().as_uri()}?mode=ro&immutable=1"
    connection = sqlite3.connect(uri, uri=True)
    try:
        return {
            table: int(connection.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0])
            for table in TABLE_NAMES
        }
    finally:
        connection.close()


def inspect_valid_database(
    file_path: Path,
    expected_version: str,
    canonical_schema: dict[str, Any],
) -> dict[str, Any]:
    uri = f"{file_path.resolve().as_uri()}?mode=ro&immutable=1"
    connection = sqlite3.connect(uri, uri=True)
    try:
        application_id = int(connection.execute("PRAGMA application_id").fetchone()[0])
        user_version = int(connection.execute("PRAGMA user_version").fetchone()[0])
        integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
        foreign_keys = connection.execute("PRAGMA foreign_key_check").fetchall()
        tables = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_schema WHERE type = 'table'"
            )
        }
        indexes = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_schema WHERE type = 'index'"
            )
        }
        embedded = connection.execute(
            """
            SELECT data_version, manifest_schema_version, sqlite_schema_version,
                   data_version_algorithm
            FROM archive_meta WHERE singleton = 1
            """
        ).fetchone()
        sentinels = {
            sentinel_id: int(connection.execute(sql).fetchone()[0])
            for sentinel_id, sql, _ in SENTINELS
        }
        schema_objects = schema_object_record(connection)
    finally:
        connection.close()
    if application_id != APPLICATION_ID:
        fail(f"unexpected application_id: {application_id}")
    if user_version != SQLITE_SCHEMA_VERSION:
        fail(f"unexpected user_version: {user_version}")
    if integrity != "ok" or foreign_keys:
        fail(f"invalid SQLite integrity: {integrity!r}, {foreign_keys!r}")
    if set(TABLE_NAMES) - tables:
        fail(f"missing tables: {sorted(set(TABLE_NAMES) - tables)}")
    if set(REQUIRED_INDEXES) - indexes:
        fail(f"missing indexes: {sorted(set(REQUIRED_INDEXES) - indexes)}")
    if embedded != (expected_version, 1, 1, ALGORITHM):
        fail(f"unexpected embedded metadata: {embedded!r}")
    expected_sentinels = {
        sentinel_id: expected
        for sentinel_id, _, expected in SENTINELS
    }
    if sentinels != expected_sentinels:
        fail(f"sentinel mismatch: {sentinels!r}")
    if schema_object_outcome(schema_objects, canonical_schema) != "VALID":
        fail(f"SQLite schema object seal mismatch: {schema_objects!r}")
    return {
        "applicationId": application_id,
        "userVersion": user_version,
        "integrity": integrity,
        "tableCount": len(TABLE_NAMES),
        "requiredIndexCount": len(REQUIRED_INDEXES),
        "schemaObjects": schema_objects,
        "sentinels": sentinels,
    }


def base_manifest(
    inputs: dict[str, Any],
    version: str,
    sqlite_path: Path,
    counts: dict[str, int],
) -> dict[str, Any]:
    archive_bytes = b"bangumi-archive-golden-release-v1\n"
    common_bytes = b"bangumi-common-subject-staffs-golden-v1\n"
    return {
        "manifestSchemaVersion": inputs["manifestSchemaVersion"],
        "sqliteSchemaVersion": inputs["sqliteSchemaVersion"],
        "dataVersionAlgorithm": ALGORITHM,
        "dataVersion": version,
        "generatorVersion": "archive-contract-fixture-v1",
        "generatedAt": "2026-01-01T00:00:00Z",
        "archiveRelease": inputs["archiveRelease"],
        "archiveAssetUrl": "https://github.com/bangumi/Archive/releases/download/golden-v1/archive.zip",
        "archiveAssetName": "archive.zip",
        "archiveSize": len(archive_bytes),
        "archiveDigest": inputs["archiveDigest"],
        "commonCommit": inputs["commonCommit"],
        "commonSubjectStaffsUrl": (
            "https://raw.githubusercontent.com/bangumi/common/"
            + COMMON_COMMIT
            + "/subject_staffs.yml"
        ),
        "commonSize": len(common_bytes),
        "commonDigest": inputs["commonDigest"],
        "schemaSqlDigest": inputs["schemaSqlDigest"],
        "catalogConfigDigest": inputs["catalogConfigDigest"],
        "domainRulesVersion": inputs["domainRulesVersion"],
        "castRulesVersion": inputs["castRulesVersion"],
        "sourceFiles": source_files(),
        "tableCounts": counts,
        "qualitySummary": {
            "NO_CHARACTERS": 1,
            "NO_CAST_RELATIONS": 1,
            "FILTERED_BY_VALID_CV": 1,
            "UNKNOWN_STAFF_POSITION": 1,
        },
        "sqliteFile": "bangumi.sqlite",
        "sqliteSize": sqlite_path.stat().st_size,
        "sqliteDigest": file_digest(sqlite_path),
    }


def pointer_for(manifest: dict[str, Any]) -> dict[str, Any]:
    return {
        "pointerSchemaVersion": POINTER_SCHEMA_VERSION,
        "dataVersion": manifest["dataVersion"],
        "manifestDigest": sha256_bytes(json_bytes(manifest)),
    }


def write_bundle(root: Path, manifest: dict[str, Any], sqlite_path: Path) -> None:
    write_bytes(root / "archive-manifest.json", json_bytes(manifest))
    write_bytes(root / "current-pointer.json", json_bytes(pointer_for(manifest)))
    write_bytes(root / "bangumi.sqlite", sqlite_path.read_bytes())


def vector_document(inputs: dict[str, Any]) -> dict[str, Any]:
    preimage = canonical_preimage(inputs)
    base_version = data_version(inputs)
    mutated = dict(inputs)
    mutated["archiveRelease"] = "golden-v1-mutated"
    reordered = {key: inputs[key] for key in reversed(tuple(inputs))}
    return {
        "vectorSchemaVersion": 1,
        "algorithm": ALGORITHM,
        "input": inputs,
        "canonicalPreimage": preimage.decode("utf-8"),
        "canonicalPreimageByteLength": len(preimage),
        "expectedDataVersion": base_version,
        "assertions": {
            "stableRegeneration": {
                "expectedDataVersion": base_version
            },
            "oneFieldMutation": {
                "field": "archiveRelease",
                "value": mutated["archiveRelease"],
                "expectedDataVersion": data_version(mutated),
            },
            "inputOrderIndependence": {
                "input": reordered,
                "expectedDataVersion": base_version,
            },
            "catalogMemberReorderEquivalence": {
                "canonicalCatalogConfigDigest": inputs["catalogConfigDigest"],
                "expectedDataVersion": base_version,
            },
        },
    }


def valid_generated_at(value: str) -> bool:
    match = GENERATED_AT.fullmatch(value)
    if match is None:
        return False
    year = int(match["year"])
    month = int(match["month"])
    day = int(match["day"])
    hour = int(match["hour"])
    minute = int(match["minute"])
    second = int(match["second"])
    return (
        1 <= year <= 9999
        and 1 <= month <= 12
        and 1 <= day <= days_in_month(year, month)
        and 0 <= hour <= 23
        and 0 <= minute <= 59
        and 0 <= second <= 59
    )


def unicode_scalar_string(value: str) -> bool:
    return all(not 0xD800 <= ord(character) <= 0xDFFF for character in value)


def valid_manifest_url(value: str, field: str) -> bool:
    if not unicode_scalar_string(value):
        return False
    scalar_length = len(value)
    if (
        scalar_length < 12
        or scalar_length > 2048
        or not value.startswith("https://")
        or any(character in value for character in ("\0", "\r", "\n"))
    ):
        return False
    return field != "commonSubjectStaffsUrl" or value.endswith("/subject_staffs.yml")


def ascii_json_string_literal(value: str) -> str:
    literal = json.dumps(value, ensure_ascii=True, separators=(",", ":"))
    return re.sub(
        r"\\u([0-9a-f]{4})",
        lambda match: "\\u" + match.group(1).upper(),
        literal,
    )


def manifest_string_case(
    case_id: str,
    field: str,
    json_string_literal: str,
    expected: str,
) -> dict[str, Any]:
    try:
        json_string_literal.encode("ascii")
        value = json.loads(json_string_literal)
    except (UnicodeEncodeError, json.JSONDecodeError) as error:
        fail(f"{case_id} JSON string literal is invalid: {error}")
    if type(value) is not str:
        fail(f"{case_id} JSON string literal did not decode to a string")
    scalar_valid = unicode_scalar_string(value)
    if scalar_valid:
        scalar_length: int | None = len(value)
        utf8_byte_length: int | None = len(value.encode("utf-8", errors="strict"))
    else:
        scalar_length = None
        utf8_byte_length = None
    if field == "generatedAt":
        actual_valid = scalar_valid and valid_generated_at(value)
    elif field in ("archiveAssetUrl", "commonSubjectStaffsUrl"):
        actual_valid = valid_manifest_url(value, field)
    else:
        fail(f"{case_id} has unsupported target field {field!r}")
    actual = "VALID" if actual_valid else "MANIFEST_SCHEMA_INVALID"
    if actual != expected:
        fail(f"{case_id} expected {expected}, Python classified {actual}")
    return {
        "caseId": case_id,
        "field": field,
        "jsonStringLiteral": json_string_literal,
        "expectedScalarLength": scalar_length,
        "expectedUtf8ByteLength": utf8_byte_length,
        "expected": expected,
    }


def manifest_string_vector_document() -> dict[str, Any]:
    cases = (
        (
            "generated-at-valid-no-fraction",
            "generatedAt",
            "2024-02-29T23:59:59Z",
            "VALID",
        ),
        (
            "generated-at-invalid-fraction-0",
            "generatedAt",
            "2024-02-29T23:59:59.Z",
            "MANIFEST_SCHEMA_INVALID",
        ),
        (
            "generated-at-valid-fraction-1",
            "generatedAt",
            "2024-02-29T23:59:59.1Z",
            "VALID",
        ),
        (
            "generated-at-valid-fraction-6",
            "generatedAt",
            "2024-02-29T23:59:59.123456Z",
            "VALID",
        ),
        (
            "generated-at-invalid-fraction-7",
            "generatedAt",
            "2024-02-29T23:59:59.1234567Z",
            "MANIFEST_SCHEMA_INVALID",
        ),
        (
            "generated-at-valid-min-year",
            "generatedAt",
            "0001-01-01T00:00:00Z",
            "VALID",
        ),
        (
            "generated-at-valid-max-year",
            "generatedAt",
            "9999-12-31T23:59:59.999999Z",
            "VALID",
        ),
        (
            "generated-at-invalid-year-zero",
            "generatedAt",
            "0000-01-01T00:00:00Z",
            "MANIFEST_SCHEMA_INVALID",
        ),
        (
            "generated-at-invalid-1900-leap-day",
            "generatedAt",
            "1900-02-29T00:00:00Z",
            "MANIFEST_SCHEMA_INVALID",
        ),
        (
            "generated-at-valid-2000-leap-day",
            "generatedAt",
            "2000-02-29T00:00:00Z",
            "VALID",
        ),
        (
            "generated-at-invalid-impossible-fields",
            "generatedAt",
            "2024-13-99T25:61:61Z",
            "MANIFEST_SCHEMA_INVALID",
        ),
        (
            "generated-at-invalid-hour-24",
            "generatedAt",
            "2024-01-01T24:00:00Z",
            "MANIFEST_SCHEMA_INVALID",
        ),
        (
            "generated-at-invalid-minute-60",
            "generatedAt",
            "2024-01-01T23:60:00Z",
            "MANIFEST_SCHEMA_INVALID",
        ),
        (
            "generated-at-invalid-second-60",
            "generatedAt",
            "2024-01-01T23:59:60Z",
            "MANIFEST_SCHEMA_INVALID",
        ),
        (
            "generated-at-invalid-offset",
            "generatedAt",
            "2024-01-01T00:00:00+00:00",
            "MANIFEST_SCHEMA_INVALID",
        ),
        (
            "archive-url-invalid-ascii-min-minus-one",
            "archiveAssetUrl",
            "https://abc",
            "MANIFEST_SCHEMA_INVALID",
        ),
        (
            "archive-url-valid-ascii-min",
            "archiveAssetUrl",
            "https://a.bc",
            "VALID",
        ),
        (
            "archive-url-invalid-multibyte-short",
            "archiveAssetUrl",
            "https://😀",
            "MANIFEST_SCHEMA_INVALID",
        ),
        (
            "archive-url-valid-multibyte-max",
            "archiveAssetUrl",
            "https://" + "a" * 2039 + "😀",
            "VALID",
        ),
        (
            "archive-url-invalid-multibyte-max-plus-one",
            "archiveAssetUrl",
            "https://" + "a" * 2040 + "😀",
            "MANIFEST_SCHEMA_INVALID",
        ),
        (
            "common-url-valid-multibyte-max",
            "commonSubjectStaffsUrl",
            "https://" + "a" * 2020 + "😀/subject_staffs.yml",
            "VALID",
        ),
        (
            "common-url-invalid-multibyte-max-plus-one",
            "commonSubjectStaffsUrl",
            "https://" + "a" * 2021 + "😀/subject_staffs.yml",
            "MANIFEST_SCHEMA_INVALID",
        ),
    )
    string_cases = [
        manifest_string_case(
            case_id,
            field,
            ascii_json_string_literal(value),
            expected,
        )
        for case_id, field, value, expected in cases
    ]
    string_cases.extend(
        (
            manifest_string_case(
                "archive-url-valid-surrogate-pair",
                "archiveAssetUrl",
                '"https://abc\\uD83D\\uDE00"',
                "VALID",
            ),
            manifest_string_case(
                "archive-url-invalid-isolated-high-surrogate",
                "archiveAssetUrl",
                '"https://abc\\uD800"',
                "MANIFEST_SCHEMA_INVALID",
            ),
            manifest_string_case(
                "archive-url-invalid-isolated-low-surrogate",
                "archiveAssetUrl",
                '"https://abc\\uDC00"',
                "MANIFEST_SCHEMA_INVALID",
            ),
        )
    )
    if tuple(case["caseId"] for case in string_cases) != MANIFEST_STRING_CASE_IDS:
        fail("manifest string vector case ids/order drifted")
    return {
        "vectorSchemaVersion": 1,
        "formats": {
            "generatedAt": "bgmss-utc-generated-at-v1",
            "url": "bgmss-unicode-scalar-url-v1",
        },
        "stringCases": string_cases,
        "rawByteRecipe": {
            "caseId": "manifest-invalid-raw-utf8",
            "field": "archiveAssetUrl",
            "payloadHex": "C3 28",
            "retainJsonStringDelimiters": True,
            "expected": "MANIFEST_SCHEMA_INVALID",
        },
    }


def generate(root: Path) -> dict[str, Any]:
    if root.exists() and root.is_symlink():
        fail(f"golden root is a symlink: {root}")
    root.mkdir(parents=True, exist_ok=True)
    canonical_schema = canonical_schema_record()
    raw_domain_report = raw_domain_self_test()
    subject_semantic_report = subject_semantics_self_test()
    schema_object_report = schema_object_self_test(canonical_schema)
    sql_bytes = SCHEMA_SQL.read_bytes()
    if b"\r" in sql_bytes or not sql_bytes.endswith(b"\n") or sql_bytes.endswith(b"\n\n"):
        fail("schema.sql must be LF-only with exactly one final LF")
    sql_digest = sha256_bytes(sql_bytes)
    inputs = semantic_inputs(sql_digest)
    version = data_version(inputs)

    valid_db = root / "valid" / "minimal" / "bangumi.sqlite"
    create_database(valid_db, version, inputs)
    counts = database_counts(valid_db)
    valid_manifest = base_manifest(inputs, version, valid_db, counts)
    write_bytes(root / "valid" / "minimal" / "archive-manifest.json", json_bytes(valid_manifest))
    write_bytes(
        root / "valid" / "minimal" / "current-pointer.json",
        json_bytes(pointer_for(valid_manifest)),
    )
    write_bytes(root / "vectors" / "data-version.json", json_bytes(vector_document(inputs)))
    write_bytes(
        root / MANIFEST_STRING_VECTOR,
        json_bytes(manifest_string_vector_document()),
    )

    invalid_json: dict[str, dict[str, Any]] = {}
    value = copy.deepcopy(valid_manifest)
    value["unexpected"] = True
    invalid_json["manifest-unknown-field.json"] = value
    value = copy.deepcopy(valid_manifest)
    value["archiveDigest"] = "sha256:not-a-digest"
    invalid_json["manifest-bad-digest.json"] = value
    value = copy.deepcopy(valid_manifest)
    value["sqliteFile"] = "../bangumi.sqlite"
    invalid_json["manifest-unsafe-sqlite-file.json"] = value
    value = copy.deepcopy(valid_manifest)
    value["sourceFiles"][3]["recordsTotal"] += 1
    invalid_json["manifest-source-accounting-mismatch.json"] = value
    value = pointer_for(valid_manifest)
    value["manifestPath"] = "../manifest.json"
    invalid_json["pointer-unknown-field.json"] = value
    value = pointer_for(valid_manifest)
    value["dataVersion"] = "../dv1-" + "0" * 64
    invalid_json["pointer-unsafe-data-version.json"] = value
    for name, document in invalid_json.items():
        write_bytes(root / "invalid" / "json" / name, json_bytes(document))

    scratch = root / ".fixture-build"
    scratch.mkdir(parents=True, exist_ok=True)
    try:
        mismatch_manifest = copy.deepcopy(valid_manifest)
        mismatch_manifest["dataVersion"] = "dv1-" + "0" * 64
        write_bundle(
            root / "invalid" / "bundles" / "manifest-data-version-mismatch",
            mismatch_manifest,
            valid_db,
        )

        digest_db = scratch / "digest-mismatch.sqlite"
        create_database(digest_db, version, inputs, "content-drift")
        digest_manifest = copy.deepcopy(valid_manifest)
        digest_manifest["sqliteSize"] = digest_db.stat().st_size
        write_bundle(
            root / "invalid" / "bundles" / "sqlite-digest-mismatch",
            digest_manifest,
            digest_db,
        )

        corrupt_db = scratch / "corrupt.sqlite"
        write_bytes(corrupt_db, b"not a sqlite database\n")
        corrupt_manifest = copy.deepcopy(valid_manifest)
        corrupt_manifest["sqliteSize"] = corrupt_db.stat().st_size
        corrupt_manifest["sqliteDigest"] = file_digest(corrupt_db)
        write_bundle(
            root / "invalid" / "bundles" / "sqlite-corrupt",
            corrupt_manifest,
            corrupt_db,
        )

        unsupported_inputs = semantic_inputs(sql_digest, sqlite_version=2)
        unsupported_manifest = base_manifest(
            unsupported_inputs,
            data_version(unsupported_inputs),
            valid_db,
            counts,
        )
        write_bundle(
            root / "invalid" / "bundles" / "sqlite-unsupported-schema",
            unsupported_manifest,
            valid_db,
        )

        identity_db = scratch / "identity-mismatch.sqlite"
        create_database(identity_db, version, inputs, "metadata-mismatch")
        identity_manifest = copy.deepcopy(valid_manifest)
        identity_manifest["sqliteSize"] = identity_db.stat().st_size
        identity_manifest["sqliteDigest"] = file_digest(identity_db)
        write_bundle(
            root / "invalid" / "bundles" / "sqlite-data-version-mismatch",
            identity_manifest,
            identity_db,
        )

        object_db = scratch / "required-object-missing.sqlite"
        create_database(object_db, version, inputs, "required-index-missing")
        object_manifest = copy.deepcopy(valid_manifest)
        object_manifest["sqliteSize"] = object_db.stat().st_size
        object_manifest["sqliteDigest"] = file_digest(object_db)
        write_bundle(
            root / "invalid" / "bundles" / "sqlite-required-index-missing",
            object_manifest,
            object_db,
        )

        count_manifest = copy.deepcopy(valid_manifest)
        count_manifest["tableCounts"]["subject"] += 1
        write_bundle(
            root / "invalid" / "bundles" / "sqlite-table-count-mismatch",
            count_manifest,
            valid_db,
        )
    finally:
        if scratch.exists():
            shutil.rmtree(scratch)

    metadata: dict[str, tuple[str, str, str]] = {
        "vectors/data-version.json": ("data-version-vector", "valid", "VALID"),
        MANIFEST_STRING_VECTOR: (
            "manifest-string-semantics-vector",
            "valid",
            "VALID",
        ),
        "valid/minimal/archive-manifest.json": ("minimal-valid", "valid", "VALID"),
        "valid/minimal/current-pointer.json": ("minimal-valid", "valid", "VALID"),
        "valid/minimal/bangumi.sqlite": ("minimal-valid", "valid", "VALID"),
        "invalid/json/manifest-unknown-field.json": (
            "manifest-unknown-field",
            "json-schema",
            "MANIFEST_SCHEMA_INVALID",
        ),
        "invalid/json/manifest-bad-digest.json": (
            "manifest-bad-digest",
            "json-schema",
            "MANIFEST_SCHEMA_INVALID",
        ),
        "invalid/json/manifest-unsafe-sqlite-file.json": (
            "manifest-unsafe-sqlite-file",
            "json-schema",
            "MANIFEST_SCHEMA_INVALID",
        ),
        "invalid/json/manifest-source-accounting-mismatch.json": (
            "manifest-source-accounting-mismatch",
            "source-accounting",
            "MANIFEST_ACCOUNTING_INVALID",
        ),
        "invalid/json/pointer-unknown-field.json": (
            "pointer-unknown-field",
            "json-schema",
            "POINTER_SCHEMA_INVALID",
        ),
        "invalid/json/pointer-unsafe-data-version.json": (
            "pointer-unsafe-data-version",
            "json-schema",
            "POINTER_SCHEMA_INVALID",
        ),
    }
    bundle_cases = {
        "manifest-data-version-mismatch": ("data-version", "DATA_VERSION_MISMATCH"),
        "sqlite-digest-mismatch": ("sqlite-digest", "SQLITE_DIGEST_MISMATCH"),
        "sqlite-corrupt": ("sqlite-format", "SQLITE_FORMAT_INVALID"),
        "sqlite-unsupported-schema": ("compatibility", "ARCHIVE_VERSION_UNSUPPORTED"),
        "sqlite-data-version-mismatch": (
            "sqlite-identity",
            "SQLITE_DATA_VERSION_MISMATCH",
        ),
        "sqlite-required-index-missing": (
            "sqlite-required-objects",
            "SQLITE_REQUIRED_OBJECT_MISSING",
        ),
        "sqlite-table-count-mismatch": (
            "sqlite-table-count",
            "SQLITE_TABLE_COUNT_MISMATCH",
        ),
    }
    for case_id, (stage, expected) in bundle_cases.items():
        for basename in ("archive-manifest.json", "current-pointer.json", "bangumi.sqlite"):
            relative = f"invalid/bundles/{case_id}/{basename}"
            metadata[relative] = (case_id, stage, expected)

    physical = sorted(
        file_path.relative_to(root).as_posix()
        for file_path in root.rglob("*")
        if file_path.is_file() and file_path.name != "index.json"
    )
    if set(physical) != set(metadata):
        fail(
            "generated golden inventory mismatch: "
            f"missing={sorted(set(metadata) - set(physical))}, "
            f"extra={sorted(set(physical) - set(metadata))}"
        )
    entries = []
    for relative in physical:
        case_id, stage, expected = metadata[relative]
        entries.append(
            {
                "path": relative,
                "digest": file_digest(root / relative),
                "caseId": case_id,
                "validationStage": stage,
                "expected": expected,
            }
        )
    index = {"indexSchemaVersion": 1, "files": entries}
    write_bytes(root / "index.json", json_bytes(index))
    inspection = inspect_valid_database(valid_db, version, canonical_schema)
    return {
        "dataVersion": version,
        "preimageByteLength": len(canonical_preimage(inputs)),
        "schemaSqlDigest": sql_digest,
        "manifestDigest": sha256_bytes(json_bytes(valid_manifest)),
        "sqliteDigest": file_digest(valid_db),
        "goldenFileCount": len(entries) + 1,
        "rawDomains": raw_domain_report,
        "subjectSemantics": subject_semantic_report,
        "schemaObjectSelfTest": schema_object_report,
        "sqlite": inspection,
    }


def inventory(root: Path) -> dict[str, bytes]:
    if not root.exists() or root.is_symlink():
        fail(f"fixture root missing or unsafe: {root}")
    result: dict[str, bytes] = {}
    for entry in sorted(root.rglob("*")):
        if entry.is_symlink():
            fail(f"fixture symlink forbidden: {entry}")
        if entry.is_dir():
            continue
        if not entry.is_file():
            fail(f"fixture is not regular: {entry}")
        result[entry.relative_to(root).as_posix()] = entry.read_bytes()
    return result


def write_manifest_string_vector() -> dict[str, Any]:
    temp_parent_value = os.environ.get("TMPDIR")
    if not temp_parent_value:
        fail("TMPDIR must be explicitly set below contracts/schemas/archive/.tmp")
    temp_parent = Path(temp_parent_value).resolve()
    expected_parent = (SCHEMA_ROOT / ".tmp").resolve()
    if not temp_parent.is_relative_to(expected_parent):
        fail(f"TMPDIR escapes Archive schema root: {temp_parent}")
    temp_parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="string-vector-write-", dir=temp_parent) as directory:
        generated_root = Path(directory) / "archive"
        report = generate(generated_root)
        generated = inventory(generated_root)
        accepted = inventory(GOLDEN_ROOT)
        prior_paths = set(accepted) - {"index.json", MANIFEST_STRING_VECTOR}
        if len(prior_paths) != 31:
            fail(f"accepted baseline must contain exactly 31 prior golden files, got {len(prior_paths)}")
        expected_generated = prior_paths | {"index.json", MANIFEST_STRING_VECTOR}
        if set(generated) != expected_generated:
            fail(
                "generated manifest-string inventory mismatch: "
                f"missing={sorted(expected_generated - set(generated))}, "
                f"extra={sorted(set(generated) - expected_generated)}"
            )
        drift = [
            relative
            for relative in sorted(prior_paths)
            if generated[relative] != accepted[relative]
        ]
        if drift:
            fail(f"prior 31 accepted golden bytes drifted: {drift}")
        write_bytes(GOLDEN_ROOT / MANIFEST_STRING_VECTOR, generated[MANIFEST_STRING_VECTOR])
        write_bytes(GOLDEN_ROOT / "index.json", generated["index.json"])
        return {
            **report,
            "indexedFiles": 32,
            "manifestStringVectorDigest": sha256_bytes(generated[MANIFEST_STRING_VECTOR]),
            "priorGoldenFilesUnchanged": len(prior_paths),
        }


def check_fixtures() -> dict[str, Any]:
    temp_parent_value = os.environ.get("TMPDIR")
    if not temp_parent_value:
        fail("TMPDIR must be explicitly set below contracts/schemas/archive/.tmp")
    temp_parent = Path(temp_parent_value).resolve()
    expected_parent = (SCHEMA_ROOT / ".tmp").resolve()
    if not temp_parent.is_relative_to(expected_parent):
        fail(f"TMPDIR escapes Archive schema root: {temp_parent}")
    temp_parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="fixture-check-", dir=temp_parent) as directory:
        generated_root = Path(directory) / "archive"
        report = generate(generated_root)
        generated = inventory(generated_root)
        accepted = inventory(GOLDEN_ROOT)
        if generated.keys() != accepted.keys():
            fail(
                "accepted fixture inventory differs: "
                f"missing={sorted(generated.keys() - accepted.keys())}, "
                f"extra={sorted(accepted.keys() - generated.keys())}"
            )
        drift = [
            relative
            for relative in generated
            if generated[relative] != accepted[relative]
        ]
        if drift:
            fail(f"accepted fixture bytes drifted: {drift}")
        return report


def self_test() -> dict[str, Any]:
    temp_parent_value = os.environ.get("TMPDIR")
    if not temp_parent_value:
        fail("TMPDIR must be explicitly set below contracts/schemas/archive/.tmp")
    temp_parent = Path(temp_parent_value).resolve()
    expected_parent = (SCHEMA_ROOT / ".tmp").resolve()
    if not temp_parent.is_relative_to(expected_parent):
        fail(f"TMPDIR escapes Archive schema root: {temp_parent}")
    temp_parent.mkdir(parents=True, exist_ok=True)
    sql_digest = sha256_bytes(SCHEMA_SQL.read_bytes())
    inputs = semantic_inputs(sql_digest)
    version = data_version(inputs)
    canonical_schema = canonical_schema_record()
    raw_domain_report = raw_domain_self_test()
    subject_semantic_report = subject_semantics_self_test()
    schema_object_report = schema_object_self_test(canonical_schema)
    with tempfile.TemporaryDirectory(prefix="sqlite-self-test-", dir=temp_parent) as directory:
        database = Path(directory) / "bangumi.sqlite"
        create_database(database, version, inputs)
        return {
            "python": sys.version.split()[0],
            "sqlite": sqlite3.sqlite_version,
            "dataVersion": version,
            "rawDomains": raw_domain_report,
            "subjectSemantics": subject_semantic_report,
            "schemaObjectSelfTest": schema_object_report,
            "inspection": inspect_valid_database(
                database,
                version,
                canonical_schema,
            ),
        }


def main() -> int:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--self-test", action="store_true")
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--write-manifest-string-vector", action="store_true")
    mode.add_argument("--check", action="store_true")
    arguments = parser.parse_args()
    try:
        if arguments.self_test:
            report = self_test()
        elif arguments.write_manifest_string_vector:
            report = write_manifest_string_vector()
        elif arguments.write:
            report = generate(GOLDEN_ROOT)
        else:
            report = check_fixtures()
        print(json.dumps(report, ensure_ascii=False, sort_keys=True))
        return 0
    except Exception as error:
        print(f"archive fixture builder: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
