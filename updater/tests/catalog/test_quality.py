"""Bounded quality-report tests."""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import cast

import pytest

from bangumi_staff_stats_updater.catalog.errors import CatalogError
from bangumi_staff_stats_updater.catalog.sqlite_adapter import (
    compile_quality_report,
    validate_derivation_closure,
)


def _quality_database(unknown_groups: int) -> sqlite3.Connection:
    connection = sqlite3.connect(":memory:")
    connection.executescript(
        """
        CREATE TABLE subject (
          subject_type TEXT NOT NULL,
          subject_id INTEGER NOT NULL
        );
        CREATE TABLE staff_position (
          subject_type TEXT NOT NULL,
          position_id INTEGER NOT NULL
        );
        CREATE TABLE staff_credit (
          subject_type TEXT NOT NULL,
          position_id INTEGER NOT NULL
        );
        CREATE TEMP TABLE source_subject_character (
          subject_id INTEGER NOT NULL,
          character_id INTEGER NOT NULL,
          role_type INTEGER NOT NULL,
          sort_order INTEGER NOT NULL
        );
        CREATE TEMP TABLE exact_cast_edge (
          subject_type TEXT NOT NULL,
          subject_id INTEGER NOT NULL,
          person_id INTEGER NOT NULL,
          character_id INTEGER NOT NULL,
          role_type INTEGER NOT NULL,
          sort_order INTEGER NOT NULL
        );
        CREATE TEMP TABLE eligible_staff_person (
          person_id INTEGER NOT NULL
        );
        INSERT INTO subject VALUES ('anime', 1);
        """
    )
    connection.executemany(
        "INSERT INTO staff_credit VALUES ('anime', ?)",
        ((position_id,) for position_id in range(1, unknown_groups + 1)),
    )
    return connection


def test_quality_report_accepts_exactly_one_thousand_unknown_groups(
    contracts_root: Path,
) -> None:
    connection = _quality_database(1000)
    try:
        report = compile_quality_report(connection, contracts_root)
        unknown = cast(list[dict[str, object]], report["unknownStaffPositionIds"])
        assert len(unknown) == 1000
        assert sum(cast(int, item["count"]) for item in unknown) == 1000
    finally:
        connection.close()


def test_quality_report_blocks_before_truncating_unknown_groups(
    contracts_root: Path,
) -> None:
    connection = _quality_database(1001)
    try:
        with pytest.raises(
            CatalogError,
            match="QUALITY_UNKNOWN_POSITION_BOUND_EXCEEDED",
        ):
            compile_quality_report(connection, contracts_root)
    finally:
        connection.close()


def _closed_derivation_database() -> sqlite3.Connection:
    connection = sqlite3.connect(":memory:")
    connection.executescript(
        """
        CREATE TABLE person (
          person_id INTEGER NOT NULL
        );
        CREATE TABLE character (
          character_id INTEGER NOT NULL
        );
        CREATE TABLE cast_credit (
          subject_type TEXT NOT NULL,
          subject_id INTEGER NOT NULL,
          person_id INTEGER NOT NULL,
          character_id INTEGER NOT NULL,
          role_type INTEGER NOT NULL,
          sort_order INTEGER NOT NULL
        );
        CREATE TEMP TABLE entity_subject (
          subject_id INTEGER NOT NULL,
          subject_type TEXT NOT NULL
        );
        CREATE TEMP TABLE source_subject_character (
          subject_id INTEGER NOT NULL,
          character_id INTEGER NOT NULL,
          role_type INTEGER NOT NULL,
          sort_order INTEGER NOT NULL
        );
        CREATE TEMP TABLE eligible_staff_person (
          person_id INTEGER NOT NULL
        );
        CREATE TEMP TABLE exact_cast_edge (
          subject_type TEXT NOT NULL,
          subject_id INTEGER NOT NULL,
          person_id INTEGER NOT NULL,
          character_id INTEGER NOT NULL,
          role_type INTEGER NOT NULL,
          sort_order INTEGER NOT NULL
        );
        INSERT INTO person VALUES (3);
        INSERT INTO character VALUES (2);
        INSERT INTO temp.entity_subject VALUES (1, 'anime');
        INSERT INTO temp.source_subject_character VALUES (1, 2, 1, 0);
        INSERT INTO temp.eligible_staff_person VALUES (3);
        INSERT INTO temp.exact_cast_edge VALUES ('anime', 1, 3, 2, 1, 0);
        INSERT INTO cast_credit VALUES ('anime', 1, 3, 2, 1, 0);
        """
    )
    return connection


def test_complete_admitted_derivation_closure_is_accepted() -> None:
    connection = _closed_derivation_database()
    try:
        validate_derivation_closure(connection)
    finally:
        connection.close()


@pytest.mark.parametrize(
    "mutation",
    [
        "UPDATE temp.source_subject_character SET subject_id = 99",
        "UPDATE temp.source_subject_character SET character_id = 99",
        "UPDATE temp.eligible_staff_person SET person_id = 99",
        "UPDATE temp.exact_cast_edge SET subject_id = 99",
        "UPDATE temp.exact_cast_edge SET person_id = 99",
        "UPDATE temp.exact_cast_edge SET character_id = 99",
        "DELETE FROM temp.source_subject_character",
        "UPDATE temp.source_subject_character SET role_type = 2",
        "UPDATE temp.source_subject_character SET sort_order = 1",
        "DELETE FROM temp.exact_cast_edge",
        "DELETE FROM temp.eligible_staff_person",
        "DELETE FROM cast_credit",
        "DELETE FROM temp.eligible_staff_person",
    ],
    ids=[
        "source-character-phantom-subject",
        "source-character-phantom-character",
        "valid-cv-phantom-person",
        "exact-edge-phantom-subject",
        "exact-edge-phantom-person",
        "exact-edge-phantom-character",
        "exact-edge-without-source-character",
        "exact-edge-role-mismatch",
        "exact-edge-order-mismatch",
        "cast-without-exact-edge",
        "cast-without-valid-cv",
        "eligible-exact-edge-without-cast",
        "ineligible-exact-edge-with-cast",
    ],
)
def test_incomplete_admitted_derivation_closure_is_blocked(mutation: str) -> None:
    connection = _closed_derivation_database()
    try:
        connection.execute(mutation)
        with pytest.raises(CatalogError) as raised:
            validate_derivation_closure(connection)
        assert raised.value.code == "DERIVATION_CLOSURE_INVALID"
    finally:
        connection.close()
