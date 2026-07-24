#!/usr/bin/env python3
"""Build deterministic, tiny Archive contract fixtures using Python stdlib only."""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
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
SAFE_INTEGER_MAX = 9_007_199_254_740_991
APPLICATION_ID = 1_111_969_107
SQLITE_SCHEMA_VERSION = 1
MANIFEST_SCHEMA_VERSION = 1
POINTER_SCHEMA_VERSION = 1
ALGORITHM = "bgmss-archive-data-version-v1"
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
    "idx_subject_type_date_id",
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


def fail(message: str) -> None:
    raise RuntimeError(message)


def sha256_bytes(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


def file_digest(file_path: Path) -> str:
    return sha256_bytes(file_path.read_bytes())


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
        "subject.jsonlines": (2, 2, 0, 0, 0),
        "person.jsonlines": (2, 2, 0, 0, 0),
        "character.jsonlines": (1, 1, 0, 0, 0),
        "subject-persons.jsonlines": (2, 1, 0, 0, 1),
        "subject-characters.jsonlines": (1, 1, 0, 0, 0),
        "person-characters.jsonlines": (1, 1, 0, 0, 0),
        "subject-relations.jsonlines": (1, 1, 0, 0, 0),
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
          subject_type, subject_id, name, name_cn, air_date, score, votes
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            ("anime", 1, "Golden Animation", "金标动画", "2024-01-01", 8.2, 10),
            ("anime", 2, "Golden Sequel", "金标续作", "2025-01-01", 7.8, 5),
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
        ),
    )
    connection.execute("INSERT INTO person_career VALUES (?, ?)", (101, "seiyu"))
    connection.execute(
        "INSERT INTO character VALUES (?, ?, ?)",
        (200, "Golden Character", "金标角色"),
    )
    connection.execute(
        "INSERT INTO subject_relation VALUES (?, ?, ?, ?, ?)",
        ("anime", 1, "anime", 2, "sequel"),
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
    connection.execute(
        "INSERT INTO cast_credit VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        ("anime", 1, 101, 200, "main", 1, 1, "exact"),
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
                "roleType=main",
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


def inspect_valid_database(file_path: Path, expected_version: str) -> dict[str, Any]:
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
            "unknownPosition": connection.execute(
                """
                SELECT COUNT(*) FROM staff_credit AS c
                LEFT JOIN staff_position AS p
                  ON p.subject_type = c.subject_type
                 AND p.position_id = c.position_id
                WHERE p.position_id IS NULL
                """
            ).fetchone()[0],
            "unknownCatalog": connection.execute(
                "SELECT COUNT(*) FROM catalog_position WHERE position_key = 'staff:anime:999999'"
            ).fetchone()[0],
            "eligibleExactCast": connection.execute(
                "SELECT COUNT(*) FROM cast_credit WHERE eligible = 1 AND provenance = 'exact'"
            ).fetchone()[0],
            "animeSubject": connection.execute(
                "SELECT COUNT(*) FROM subject WHERE subject_type = 'anime' AND subject_id = 1"
            ).fetchone()[0],
        }
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
    if sentinels != {
        "unknownPosition": 1,
        "unknownCatalog": 0,
        "eligibleExactCast": 1,
        "animeSubject": 1,
    }:
        fail(f"sentinel mismatch: {sentinels!r}")
    return {
        "applicationId": application_id,
        "userVersion": user_version,
        "integrity": integrity,
        "tableCount": len(TABLE_NAMES),
        "requiredIndexCount": len(REQUIRED_INDEXES),
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


def generate(root: Path) -> dict[str, Any]:
    if root.exists() and root.is_symlink():
        fail(f"golden root is a symlink: {root}")
    root.mkdir(parents=True, exist_ok=True)
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
    inspection = inspect_valid_database(valid_db, version)
    return {
        "dataVersion": version,
        "preimageByteLength": len(canonical_preimage(inputs)),
        "schemaSqlDigest": sql_digest,
        "manifestDigest": sha256_bytes(json_bytes(valid_manifest)),
        "sqliteDigest": file_digest(valid_db),
        "goldenFileCount": len(entries) + 1,
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
    with tempfile.TemporaryDirectory(prefix="sqlite-self-test-", dir=temp_parent) as directory:
        database = Path(directory) / "bangumi.sqlite"
        create_database(database, version, inputs)
        return {
            "python": sys.version.split()[0],
            "sqlite": sqlite3.sqlite_version,
            "dataVersion": version,
            "inspection": inspect_valid_database(database, version),
        }


def main() -> int:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--self-test", action="store_true")
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--check", action="store_true")
    arguments = parser.parse_args()
    try:
        if arguments.self_test:
            report = self_test()
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
