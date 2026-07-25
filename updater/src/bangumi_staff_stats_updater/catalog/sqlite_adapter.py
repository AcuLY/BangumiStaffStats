"""Single pre-finalization SQLite adapter for catalog, cast, and quality."""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Mapping
from pathlib import Path
from typing import cast

from jsonschema import Draft202012Validator

from .compiler import CompiledCatalog
from .errors import CatalogError
from .model import SUBJECT_CODES, SUBJECT_TYPES


def _subject_order_sql(alias: str) -> str:
    return (
        f"CASE {alias}.subject_type "
        "WHEN 'book' THEN 0 WHEN 'anime' THEN 1 WHEN 'music' THEN 2 "
        "WHEN 'game' THEN 3 WHEN 'real' THEN 4 ELSE 5 END"
    )


def insert_compiled_catalog(
    connection: sqlite3.Connection,
    compiled: CompiledCatalog,
    common_commit: str,
) -> set[tuple[int, int]]:
    """Insert the complete governed catalog before source import/finalization."""
    type_codes = {subject_type: code for code, subject_type in SUBJECT_CODES.items()}
    category_orders: dict[str, int] = dict.fromkeys(SUBJECT_TYPES, 0)
    for category in compiled.ordered_categories:
        category_orders[category.subject_type] += 10
        connection.execute(
            "INSERT INTO staff_position_category VALUES (?, ?, ?, ?)",
            (
                category.subject_type,
                category.key,
                category.names.cn,
                category_orders[category.subject_type],
            ),
        )

    position_orders: dict[str, int] = dict.fromkeys(SUBJECT_TYPES, 0)
    identities: set[tuple[int, int]] = set()
    for common_position in compiled.ordered_positions:
        position_orders[common_position.subject_type] += 10
        connection.execute(
            "INSERT INTO staff_position VALUES (?, ?, ?, ?, ?, ?, ?, 'selectable', ?)",
            (
                common_position.subject_type,
                common_position.position_id,
                common_position.names.cn,
                common_position.names.en,
                common_position.names.jp,
                json.dumps(
                    common_position.category_keys,
                    ensure_ascii=False,
                    separators=(",", ":"),
                ),
                position_orders[common_position.subject_type],
                common_commit,
            ),
        )
        identities.add(
            (
                type_codes[common_position.subject_type],
                common_position.position_id,
            )
        )

    for staff_set in compiled.staff_sets:
        connection.execute(
            "INSERT INTO staff_set VALUES (?, ?, ?, ?)",
            (
                staff_set.key,
                staff_set.subject_type,
                staff_set.label,
                staff_set.display_order,
            ),
        )
        for member_key in staff_set.members:
            connection.execute(
                "INSERT INTO staff_set_member VALUES (?, ?, ?)",
                (
                    staff_set.key,
                    staff_set.subject_type,
                    int(member_key.rsplit(":", 1)[1]),
                ),
            )

    for catalog_position in compiled.positions:
        connection.execute(
            "INSERT INTO catalog_position VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)",
            (
                catalog_position.position_key,
                catalog_position.subject_type,
                catalog_position.position_kind,
                catalog_position.label,
                catalog_position.names.cn,
                catalog_position.names.en,
                catalog_position.names.jp,
                catalog_position.display_order,
            ),
        )
        for capability in catalog_position.capabilities:
            connection.execute(
                "INSERT INTO catalog_capability VALUES (?, ?, 1)",
                (catalog_position.position_key, capability),
            )
        connection.execute(
            "INSERT INTO catalog_selection_rule VALUES (?, ?, ?, ?)",
            (
                catalog_position.rule_key,
                catalog_position.position_key,
                catalog_position.rule_kind,
                catalog_position.rule_value,
            ),
        )
    for catalog_position in compiled.positions:
        for member_key in catalog_position.member_keys:
            connection.execute(
                "INSERT INTO catalog_position_member VALUES (?, ?)",
                (catalog_position.position_key, member_key),
            )

    for group in compiled.groups:
        connection.execute(
            "INSERT INTO catalog_group VALUES (?, ?, ?, ?)",
            (
                group.group_key,
                group.subject_type,
                group.label,
                group.display_order,
            ),
        )
        for display_order, position_key in enumerate(group.position_keys):
            connection.execute(
                "INSERT INTO catalog_group_member VALUES (?, ?, ?)",
                (group.group_key, position_key, display_order),
            )
    return identities


def _subject_samples(
    connection: sqlite3.Connection,
    absence_sql: str,
) -> tuple[int, list[dict[str, object]]]:
    condition = (
        f"FROM subject s WHERE s.subject_type IN ('anime','game') AND NOT EXISTS ({absence_sql})"
    )
    count = cast(int, connection.execute(f"SELECT COUNT(*) {condition}").fetchone()[0])
    rows = connection.execute(
        "SELECT s.subject_type, s.subject_id "
        f"{condition} ORDER BY {_subject_order_sql('s')}, s.subject_id LIMIT 100"
    )
    return count, [
        {"subjectType": cast(str, row[0]), "subjectId": cast(int, row[1])} for row in rows
    ]


def _quality_schema(contracts_root: Path) -> dict[str, object]:
    try:
        value = json.loads(
            (contracts_root / "schemas" / "catalog" / "quality-report.schema.json").read_bytes()
        )
    except (OSError, json.JSONDecodeError, UnicodeDecodeError) as error:
        raise CatalogError("CATALOG_CONTRACT_INVALID") from error
    if not isinstance(value, dict):
        raise CatalogError("CATALOG_CONTRACT_INVALID")
    return cast(dict[str, object], value)


def compile_quality_report(
    connection: sqlite3.Connection,
    contracts_root: Path,
) -> dict[str, object]:
    """Recompute exact bounded diagnostics from pre-finalization temp evidence."""
    no_characters_count, no_characters = _subject_samples(
        connection,
        "SELECT 1 FROM temp.source_subject_character c WHERE c.subject_id = s.subject_id",
    )
    no_relations_count, no_relations = _subject_samples(
        connection,
        "SELECT 1 FROM temp.exact_cast_edge e "
        "WHERE e.subject_type = s.subject_type AND e.subject_id = s.subject_id",
    )
    filtered_condition = (
        "FROM temp.exact_cast_edge e "
        "LEFT JOIN temp.eligible_staff_person v ON v.person_id = e.person_id "
        "WHERE e.subject_type IN ('anime','game') AND v.person_id IS NULL"
    )
    filtered_count = cast(
        int,
        connection.execute(f"SELECT COUNT(*) {filtered_condition}").fetchone()[0],
    )
    filtered_rows = connection.execute(
        "SELECT e.subject_type, e.subject_id, e.character_id, e.person_id, e.role_type "
        f"{filtered_condition} ORDER BY {_subject_order_sql('e')}, e.subject_id, "
        "e.character_id, e.person_id, e.role_type, e.sort_order LIMIT 100"
    )
    filtered = [
        {
            "subjectType": cast(str, row[0]),
            "subjectId": cast(int, row[1]),
            "characterId": cast(int, row[2]),
            "personId": cast(int, row[3]),
            "roleType": cast(int, row[4]),
        }
        for row in filtered_rows
    ]
    role_inventory = [
        {"roleType": cast(int, row[0]), "count": cast(int, row[1])}
        for row in connection.execute(
            "SELECT role_type, COUNT(*) FROM temp.source_subject_character "
            "GROUP BY role_type ORDER BY role_type"
        )
    ]
    unknown_group_count = cast(
        int,
        connection.execute(
            "SELECT COUNT(*) FROM ("
            "SELECT 1 FROM staff_credit c LEFT JOIN staff_position p "
            "ON p.subject_type = c.subject_type AND p.position_id = c.position_id "
            "WHERE p.position_id IS NULL GROUP BY c.subject_type, c.position_id"
            ")"
        ).fetchone()[0],
    )
    if unknown_group_count > 1000:
        raise CatalogError(
            "QUALITY_UNKNOWN_POSITION_BOUND_EXCEEDED",
            evidence={
                "unknownStaffPositionGroupCount": unknown_group_count,
                "limit": 1000,
            },
        )
    unknown_positions = [
        {
            "subjectType": cast(str, row[0]),
            "positionId": cast(int, row[1]),
            "count": cast(int, row[2]),
        }
        for row in connection.execute(
            "SELECT c.subject_type, c.position_id, COUNT(*) "  # noqa: S608
            "FROM staff_credit c LEFT JOIN staff_position p "
            "ON p.subject_type = c.subject_type AND p.position_id = c.position_id "
            "WHERE p.position_id IS NULL "
            f"GROUP BY c.subject_type, c.position_id ORDER BY {_subject_order_sql('c')}, "
            "c.position_id"
        )
    ]
    if len(unknown_positions) != unknown_group_count:
        raise CatalogError("QUALITY_REPORT_INVALID")
    report: dict[str, object] = {
        "schemaVersion": 1,
        "counts": {
            "NO_CHARACTERS": no_characters_count,
            "NO_CAST_RELATIONS": no_relations_count,
            "FILTERED_BY_VALID_CV": filtered_count,
        },
        "samples": {
            "NO_CHARACTERS": no_characters,
            "NO_CAST_RELATIONS": no_relations,
            "FILTERED_BY_VALID_CV": filtered,
        },
        "roleInventory": role_inventory,
        "unknownStaffPositionIds": unknown_positions,
        "blockingErrors": [],
    }
    if not Draft202012Validator(_quality_schema(contracts_root)).is_valid(report):
        raise CatalogError("QUALITY_REPORT_INVALID")
    return report


def validate_derivation_closure(connection: sqlite3.Connection) -> None:
    """Block any phantom or incomplete row inside the admitted projection."""
    checks = (
        (
            "SELECT 1 FROM temp.source_subject_character sc "
            "LEFT JOIN temp.entity_subject s ON s.subject_id = sc.subject_id "
            "LEFT JOIN character c ON c.character_id = sc.character_id "
            "WHERE s.subject_id IS NULL OR c.character_id IS NULL LIMIT 1"
        ),
        (
            "SELECT 1 FROM temp.eligible_staff_person v "
            "LEFT JOIN person p ON p.person_id = v.person_id "
            "WHERE p.person_id IS NULL LIMIT 1"
        ),
        (
            "SELECT 1 FROM temp.exact_cast_edge e "
            "LEFT JOIN temp.entity_subject s ON s.subject_id = e.subject_id "
            "LEFT JOIN person p ON p.person_id = e.person_id "
            "LEFT JOIN character c ON c.character_id = e.character_id "
            "LEFT JOIN temp.source_subject_character sc "
            "ON sc.subject_id = e.subject_id AND sc.character_id = e.character_id "
            "WHERE s.subject_id IS NULL OR s.subject_type <> e.subject_type "
            "OR p.person_id IS NULL OR c.character_id IS NULL "
            "OR sc.character_id IS NULL OR sc.role_type <> e.role_type "
            "OR sc.sort_order <> e.sort_order LIMIT 1"
        ),
        (
            "SELECT 1 FROM cast_credit c "
            "LEFT JOIN temp.exact_cast_edge e "
            "ON e.subject_type = c.subject_type AND e.subject_id = c.subject_id "
            "AND e.person_id = c.person_id AND e.character_id = c.character_id "
            "LEFT JOIN temp.eligible_staff_person v ON v.person_id = c.person_id "
            "WHERE c.subject_type NOT IN ('anime','game') OR e.subject_id IS NULL "
            "OR v.person_id IS NULL OR e.role_type <> c.role_type "
            "OR e.sort_order <> c.sort_order LIMIT 1"
        ),
        (
            "SELECT 1 FROM temp.exact_cast_edge e "
            "JOIN temp.eligible_staff_person v ON v.person_id = e.person_id "
            "LEFT JOIN cast_credit c "
            "ON c.subject_type = e.subject_type AND c.subject_id = e.subject_id "
            "AND c.person_id = e.person_id AND c.character_id = e.character_id "
            "WHERE e.subject_type IN ('anime','game') AND c.subject_id IS NULL LIMIT 1"
        ),
        (
            "SELECT 1 FROM temp.exact_cast_edge e "
            "LEFT JOIN temp.eligible_staff_person v ON v.person_id = e.person_id "
            "JOIN cast_credit c "
            "ON c.subject_type = e.subject_type AND c.subject_id = e.subject_id "
            "AND c.person_id = e.person_id AND c.character_id = e.character_id "
            "WHERE e.subject_type IN ('anime','game') AND v.person_id IS NULL LIMIT 1"
        ),
    )
    if any(connection.execute(query).fetchone() is not None for query in checks):
        raise CatalogError("DERIVATION_CLOSURE_INVALID")


def quality_summary(report: Mapping[str, object]) -> dict[str, int]:
    """Project the accepted manifest's four bounded counters."""
    counts = cast(dict[str, int], report["counts"])
    unknown = cast(list[dict[str, object]], report["unknownStaffPositionIds"])
    return {
        "NO_CHARACTERS": counts["NO_CHARACTERS"],
        "NO_CAST_RELATIONS": counts["NO_CAST_RELATIONS"],
        "FILTERED_BY_VALID_CV": counts["FILTERED_BY_VALID_CV"],
        "UNKNOWN_STAFF_POSITION": sum(cast(int, item["count"]) for item in unknown),
    }
