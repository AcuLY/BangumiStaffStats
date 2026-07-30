"""Golden-driven streaming SQLite builder tests."""

from __future__ import annotations

import hashlib
import json
import sqlite3
import tracemalloc
from collections.abc import Iterator, Mapping
from dataclasses import replace
from pathlib import Path
from typing import cast

import pytest

from bangumi_staff_stats_updater.producer import builder as builder_module
from bangumi_staff_stats_updater.producer.builder import (
    _extract_name_cn,
    _line_records,
    _open_database,
    _parse_common,
    _parse_json_line,
    _projection_digest,
    _quality_summary,
    _record_shape,
    _subject_details,
    _unsigned_integer,
    _validate_database,
    build_database,
)
from bangumi_staff_stats_updater.producer.model import (
    BuildIdentity,
    ProducerError,
    SourceInput,
)


def _document(contracts_root: Path, case_id: str) -> dict[str, object]:
    path = contracts_root / "goldens" / "archive" / "producer" / "cases" / f"{case_id}.json"
    return cast(dict[str, object], json.loads(path.read_bytes()))


def _arrange(
    contracts_root: Path,
    tmp_path: Path,
    case_id: str,
) -> tuple[
    dict[str, object],
    tuple[SourceInput, ...],
    bytes,
    bytes,
    BuildIdentity,
]:
    document = _document(contracts_root, case_id)
    inputs = cast(dict[str, object], document["inputs"])
    raw_sources = cast(list[dict[str, object]], inputs["sources"])
    source_root = tmp_path / "sources"
    source_root.mkdir()
    sources: list[SourceInput] = []
    for item in raw_sources:
        path = source_root / cast(str, item["name"])
        data = cast(str, item["bytesUtf8"]).encode()
        path.write_bytes(data)
        sources.append(
            SourceInput(
                cast(str, item["name"]),
                path,
                cast(int, item["size"]),
                cast(str, item["digest"]),
                cast(int, item["declaredSize"]),
                cast(str, item["declaredDigest"]),
            )
        )
    common = cast(dict[str, object], inputs["commonSubjectStaffs"])
    catalog = cast(dict[str, object], inputs["catalogConfig"])
    identity = cast(dict[str, object], inputs["identity"])
    return (
        document,
        tuple(sources),
        cast(str, common["bytesUtf8"]).encode(),
        cast(str, catalog["bytesUtf8"]).encode(),
        BuildIdentity(
            cast(str, identity["archiveRelease"]),
            cast(str, identity["archiveDigest"]),
            cast(str, identity["commonCommit"]),
            cast(str, identity["commonDigest"]),
            cast(int, identity["manifestSchemaVersion"]),
            cast(int, identity["sqliteSchemaVersion"]),
            cast(str, identity["schemaSqlDigest"]),
            cast(str, identity["domainRulesVersion"]),
            cast(str, identity["castRulesVersion"]),
            cast(str, identity["catalogConfigDigest"]),
        ),
    )


@pytest.mark.parametrize(
    "case_id",
    [
        "valid-seven-source",
        "identical-regeneration",
        "identical-duplicate",
        "permitted-unresolved-position",
        "missing-reference",
    ],
)
def test_valid_producer_goldens_build_exact_evidence(
    contracts_root: Path,
    tmp_path: Path,
    case_id: str,
) -> None:
    document, sources, common, catalog, identity = _arrange(contracts_root, tmp_path, case_id)
    result = build_database(
        contracts_root=contracts_root,
        destination=tmp_path / "candidate.sqlite",
        sources=sources,
        common_bytes=common,
        catalog_bytes=catalog,
        identity=identity,
    )
    expected = cast(dict[str, object], document["expected"])
    expected_version = cast(dict[str, object], document["dataVersion"])["result"]
    assert result.data_version == expected_version
    accounting_without_bytes = [
        {key: value for key, value in item.as_manifest().items() if key not in {"size", "digest"}}
        for item in result.accounting
    ]
    assert accounting_without_bytes == expected["accounting"]
    assert result.table_counts == expected["tableCounts"]
    assert result.quality_summary == expected["qualitySummary"]
    assert result.logical_digests == expected["logicalDigests"]
    assert result.sqlite_path.is_file()


@pytest.mark.parametrize(
    ("case_id", "code"),
    [
        ("malformed-record", "SOURCE_RECORD_MALFORMED"),
        ("unknown-field-record", "SOURCE_RECORD_UNKNOWN_FIELD"),
        ("conflicting-duplicate", "SOURCE_DUPLICATE_CONFLICT"),
        ("missing-source", "SOURCE_SET_MISSING"),
        ("extra-source", "SOURCE_SET_EXTRA"),
        ("digest-mismatch", "SOURCE_DIGEST_MISMATCH"),
        ("size-mismatch", "SOURCE_SIZE_MISMATCH"),
    ],
)
def test_rejection_goldens_fail_with_exact_first_code(
    contracts_root: Path,
    tmp_path: Path,
    case_id: str,
    code: str,
) -> None:
    _document_value, sources, common, catalog, identity = _arrange(
        contracts_root, tmp_path, case_id
    )
    with pytest.raises(ProducerError) as raised:
        build_database(
            contracts_root=contracts_root,
            destination=tmp_path / "candidate.sqlite",
            sources=sources,
            common_bytes=common,
            catalog_bytes=catalog,
            identity=identity,
        )
    assert raised.value.code == code
    assert not (tmp_path / "final").exists()


def test_pinned_common_shape_accepts_documented_description_field() -> None:
    positions, categories = _parse_common(
        b"""\
define: {}
staffs:
  1:
    2001: {en: Author, cn: "\xe4\xbd\x9c\xe8\x80\x85", jp: ""}
  2:
    2:
      en: Director
      cn: "\xe5\xaf\xbc\xe6\xbc\x94"
      jp: ""
      desc: "\xe7\x9b\x91\xe7\x9d\xa3\xe4\xbd\x9c\xe5\x93\x81\xe4\xba\xa4\xe4\xbb\x98"
      categories:
        - {order: 1, en: director, cn: "\xe5\xaf\xbc\xe6\xbc\x94\xe7\xb1\xbb"}
  3:
    3001: {en: Artist, cn: "\xe8\x89\xba\xe6\x9c\xaf\xe5\xae\xb6", jp: ""}
  4:
    1001: {en: Developer, cn: "\xe5\xbc\x80\xe5\x8f\x91", jp: ""}
  6:
    4001: {en: Creator, cn: "\xe5\x8e\x9f\xe4\xbd\x9c", jp: ""}
"""
    )
    assert len(positions) == 5
    assert [(item.subject_code, item.key) for item in categories] == [(2, "director")]


def test_upstream_empty_nullable_subject_fields_normalize_to_null() -> None:
    details = _subject_details(
        {
            "id": 7,
            "type": 2,
            "name": "subject",
            "name_cn": "",
            "nsfw": False,
            "date": "",
        }
    )
    assert details[3] is None
    assert details[5:7] == (None, None)
    assert _extract_name_cn({"name_cn": ""}) is None


def test_json_numbers_and_aggregate_votes_remain_json_safe() -> None:
    with pytest.raises(ProducerError, match="SOURCE_RECORD_MALFORMED"):
        _parse_json_line(b'{"id":1,"ignored":1e999}')
    with pytest.raises(ProducerError, match="SOURCE_RECORD_MALFORMED"):
        _subject_details(
            {
                "id": 7,
                "type": 2,
                "name": "subject",
                "name_cn": "",
                "nsfw": False,
                "date": "",
                "score_details": {
                    "1": 9_007_199_254_740_991,
                    "2": 1,
                },
            }
        )


def _minimal_record(source_name: str) -> dict[str, object]:
    records: dict[str, dict[str, object]] = {
        "subject.jsonlines": {
            "id": 1,
            "type": 2,
            "name": "subject",
            "name_cn": "",
            "nsfw": False,
            "date": "",
        },
        "person.jsonlines": {
            "id": 1,
            "name": "person",
            "career": ["seiyu"],
        },
        "character.jsonlines": {"id": 1, "name": "character"},
        "subject-persons.jsonlines": {
            "subject_id": 1,
            "person_id": 1,
            "position": 2,
        },
        "person-characters.jsonlines": {
            "subject_id": 1,
            "character_id": 1,
            "person_id": 1,
        },
        "subject-relations.jsonlines": {
            "subject_id": 1,
            "related_subject_id": 2,
            "relation_type": 1,
        },
    }
    return records[source_name]


@pytest.mark.parametrize(
    ("source_name", "field", "valid", "invalid"),
    [
        ("subject.jsonlines", "infobox", "", {}),
        ("subject.jsonlines", "platform", 65_535, 65_536),
        ("subject.jsonlines", "summary", ("x" * 5000) + "\n\x00", []),
        ("subject.jsonlines", "rank", 4_294_967_295, 4_294_967_296),
        ("subject.jsonlines", "series", False, 0),
        ("person.jsonlines", "type", 255, 256),
        ("person.jsonlines", "infobox", "", {}),
        ("person.jsonlines", "summary", "line one\nline two\r\n", []),
        ("person.jsonlines", "comments", 4_294_967_295, -1),
        ("person.jsonlines", "collects", 0, True),
        ("character.jsonlines", "role", 255, 256),
        ("character.jsonlines", "infobox", "", {}),
        ("character.jsonlines", "summary", "line one\nline two\r\n", []),
        ("character.jsonlines", "comments", 4_294_967_295, -1),
        ("character.jsonlines", "collects", 0, True),
        ("subject-persons.jsonlines", "appear_eps", "", {}),
        ("person-characters.jsonlines", "type", 255, 256),
        ("person-characters.jsonlines", "summary", "line one\nline two\r\n", []),
        ("subject-relations.jsonlines", "order", 65_535, 65_536),
    ],
)
def test_known_optional_fields_are_strict_when_present(
    source_name: str,
    field: str,
    valid: object,
    invalid: object,
) -> None:
    record = {**_minimal_record(source_name), field: valid}
    _record_shape(source_name, record)
    malformed = {**record, field: invalid}
    with pytest.raises(ProducerError, match="SOURCE_RECORD_MALFORMED"):
        _record_shape(source_name, malformed)


@pytest.mark.parametrize(
    ("field", "valid", "invalid"),
    [
        (
            "favorite",
            {
                "wish": 0,
                "done": 1,
                "doing": 2,
                "on_hold": 3,
                "dropped": 4_294_967_295,
            },
            {"wish": 0, "done": 1, "doing": 2, "on_hold": 3},
        ),
        (
            "favorite",
            {"wish": 0, "done": 1, "doing": 2, "on_hold": 3, "dropped": 4},
            {
                "wish": 0,
                "done": 1,
                "doing": 2,
                "on_hold": 3,
                "dropped": 4_294_967_296,
            },
        ),
        (
            "score_details",
            {str(value): 0 for value in range(1, 11)},
            {str(value): 0 for value in range(1, 10)},
        ),
        (
            "score_details",
            {str(value): 0 for value in range(1, 11)},
            {
                **{str(value): 0 for value in range(1, 11)},
                "10": 4_294_967_296,
            },
        ),
        (
            "tags",
            [{"name": "tag", "count": 9_007_199_254_740_991}],
            [{"name": "tag", "count": 1}] * 12,
        ),
        (
            "tags",
            [{"name": "tag", "count": 0}],
            [{"name": "tag", "count": 9_007_199_254_740_992}],
        ),
        ("meta_tags", ["meta"], [1]),
    ],
)
def test_known_optional_nested_subject_shapes_are_exact(
    field: str,
    valid: object,
    invalid: object,
) -> None:
    record = {**_minimal_record("subject.jsonlines"), field: valid}
    _record_shape("subject.jsonlines", record)
    malformed = {**record, field: invalid}
    with pytest.raises(ProducerError, match="SOURCE_RECORD_MALFORMED"):
        _record_shape("subject.jsonlines", malformed)


@pytest.mark.parametrize("bits", [8, 16, 32])
def test_unsigned_integer_helper_accepts_only_exact_json_integer_domain(bits: int) -> None:
    maximum = (1 << bits) - 1
    assert _unsigned_integer(0, bits) == 0
    assert _unsigned_integer(maximum, bits) == maximum
    for invalid in (-1, maximum + 1, True, "1", 1.0):
        with pytest.raises(ProducerError, match="SOURCE_RECORD_MALFORMED"):
            _unsigned_integer(invalid, bits)


@pytest.mark.parametrize("selectable", [True, False])
def test_every_staff_catalog_position_must_exist_in_pinned_common(
    contracts_root: Path,
    tmp_path: Path,
    selectable: bool,
) -> None:
    _document_value, sources, common, catalog, identity = _arrange(
        contracts_root,
        tmp_path,
        "valid-seven-source",
    )
    catalog_document = cast(dict[str, object], json.loads(catalog))
    positions = cast(list[dict[str, object]], catalog_document["positions"])
    positions[0]["positionKey"] = "staff:book:999999"
    positions[0]["selectionRule"] = "positionId=999999"
    positions[0]["selectable"] = selectable
    groups = cast(list[dict[str, object]], catalog_document["groups"])
    members = cast(list[str], groups[0]["positionKeys"])
    members[0] = "staff:book:999999"
    invalid_catalog = (
        json.dumps(
            catalog_document,
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode()
        + b"\n"
    )
    invalid_identity = replace(
        identity,
        catalog_config_digest="sha256:" + hashlib.sha256(invalid_catalog).hexdigest(),
    )
    with pytest.raises(ProducerError, match="CATALOG_CONFIG_INVALID"):
        build_database(
            contracts_root=contracts_root,
            destination=tmp_path / "candidate.sqlite",
            sources=sources,
            common_bytes=common,
            catalog_bytes=invalid_catalog,
            identity=invalid_identity,
        )


def test_identical_semantics_reproduce_identity_accounting_and_logical_rows(
    contracts_root: Path,
    tmp_path: Path,
) -> None:
    results = []
    for name in ("first", "second"):
        run_root = tmp_path / name
        run_root.mkdir()
        _document_value, sources, common, catalog, identity = _arrange(
            contracts_root,
            run_root,
            "valid-seven-source",
        )
        results.append(
            build_database(
                contracts_root=contracts_root,
                destination=run_root / "candidate.sqlite",
                sources=sources,
                common_bytes=common,
                catalog_bytes=catalog,
                identity=identity,
            )
        )
    first, second = results
    assert first.data_version == second.data_version
    assert [item.as_manifest() for item in first.accounting] == [
        item.as_manifest() for item in second.accounting
    ]
    assert first.table_counts == second.table_counts
    assert first.quality_summary == second.quality_summary
    assert first.logical_digests == second.logical_digests


def test_overlong_physical_line_is_drained_with_bounded_memory(tmp_path: Path) -> None:
    source = tmp_path / "overlong.jsonlines"
    block = b"x" * (1024 * 1024)
    with source.open("wb", buffering=0) as output:
        for _ in range(10):
            output.write(block)
        output.write(b"\n")

    tracemalloc.start()
    try:
        records = list(_line_records(source))
        _current, peak = tracemalloc.get_traced_memory()
    finally:
        tracemalloc.stop()

    assert records == [(1, b"", False)]
    assert peak < 30 * 1024 * 1024


def test_fixed_buffered_reader_preserves_raw_physical_line_semantics(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = tmp_path / "mixed.jsonlines"
    source.write_bytes(b"{}\n" + (b"x" * 9) + b'\n{"id":1}\ntail')
    monkeypatch.setattr(builder_module, "_MAX_LINE_BYTES", 8)
    monkeypatch.setattr(builder_module, "_SOURCE_BUFFER_BYTES", 0)
    raw = list(_line_records(source))
    monkeypatch.setattr(builder_module, "_SOURCE_BUFFER_BYTES", 64)
    buffered = list(_line_records(source))
    assert (
        buffered
        == raw
        == [
            (1, b"{}", True),
            (2, b"", False),
            (3, b'{"id":1}', True),
            (4, b"tail", False),
        ]
    )


def test_overlong_physical_line_cancels_during_drain(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = tmp_path / "overlong.jsonlines"
    source.write_bytes((b"x" * 1000) + b"\n")
    monkeypatch.setattr(builder_module, "_MAX_LINE_BYTES", 8)
    checks = 0

    def cancelled() -> bool:
        nonlocal checks
        checks += 1
        return checks == 4

    with pytest.raises(ProducerError, match="CANCELED"):
        list(_line_records(source, cancelled))
    assert checks == 4


def test_logical_projection_cancels_before_exhausting_rows() -> None:
    emitted = 0

    def rows() -> Iterator[Mapping[str, object]]:
        nonlocal emitted
        for value in range(10_000):
            emitted += 1
            yield {"value": value}

    with pytest.raises(ProducerError, match="CANCELED"):
        _projection_digest(rows(), lambda: emitted >= 2048)
    assert 2048 <= emitted < 10_000


def test_read_only_sqlite_validation_interrupt_maps_to_cancel_and_reopens_cleanly(
    contracts_root: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _document_value, sources, common, catalog, identity = _arrange(
        contracts_root,
        tmp_path,
        "valid-seven-source",
    )
    result = build_database(
        contracts_root=contracts_root,
        destination=tmp_path / "candidate.sqlite",
        sources=sources,
        common_bytes=common,
        catalog_bytes=catalog,
        identity=identity,
    )
    monkeypatch.setattr(builder_module, "_SQLITE_PROGRESS_OPCODES", 1)
    checks = 0

    def cancelled() -> bool:
        nonlocal checks
        checks += 1
        return checks >= 4

    with pytest.raises(ProducerError, match="CANCELED"):
        _validate_database(
            result.sqlite_path,
            contracts_root,
            identity,
            result.table_counts,
            cancelled,
        )
    with sqlite3.connect(result.sqlite_path) as connection:
        assert connection.execute("SELECT 1").fetchone() == (1,)


def test_read_only_sqlite_progress_preserves_keyboard_interrupt(
    contracts_root: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _document_value, sources, common, catalog, identity = _arrange(
        contracts_root,
        tmp_path,
        "valid-seven-source",
    )
    result = build_database(
        contracts_root=contracts_root,
        destination=tmp_path / "candidate.sqlite",
        sources=sources,
        common_bytes=common,
        catalog_bytes=catalog,
        identity=identity,
    )
    monkeypatch.setattr(builder_module, "_SQLITE_PROGRESS_OPCODES", 1)
    checks = 0

    def interrupted() -> bool:
        nonlocal checks
        checks += 1
        if checks >= 4:
            raise KeyboardInterrupt
        return False

    with pytest.raises(KeyboardInterrupt):
        _validate_database(
            result.sqlite_path,
            contracts_root,
            identity,
            result.table_counts,
            interrupted,
        )
    with sqlite3.connect(result.sqlite_path) as connection:
        assert connection.execute("SELECT 1").fetchone() == (1,)


def test_build_sqlite_progress_preserves_keyboard_interrupt(
    contracts_root: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _document_value, sources, common, catalog, identity = _arrange(
        contracts_root,
        tmp_path,
        "valid-seven-source",
    )
    destination = tmp_path / "interrupted.sqlite"
    monkeypatch.setattr(builder_module, "_SQLITE_PROGRESS_OPCODES", 1)
    checks = 0

    def interrupted() -> bool:
        nonlocal checks
        if not destination.exists():
            return False
        checks += 1
        if checks >= 4:
            raise KeyboardInterrupt
        return False

    with pytest.raises(KeyboardInterrupt):
        build_database(
            contracts_root=contracts_root,
            destination=destination,
            sources=sources,
            common_bytes=common,
            catalog_bytes=catalog,
            identity=identity,
            cancelled=interrupted,
        )
    assert checks >= 4
    with sqlite3.connect(destination) as connection:
        assert connection.execute("SELECT 1").fetchone() == (1,)


def test_per_record_eligibility_lookup_uses_temp_primary_key(
    contracts_root: Path,
    tmp_path: Path,
) -> None:
    schema_sql = (contracts_root / "schemas" / "archive" / "schema.sql").read_text()
    connection = _open_database(tmp_path / "plan.sqlite", schema_sql)
    try:
        plan = connection.execute(
            "EXPLAIN QUERY PLAN SELECT 1 FROM temp.eligible_staff_person WHERE person_id = ?",
            (1,),
        ).fetchall()
    finally:
        connection.close()
    assert any(
        "SEARCH " in cast(str, row[3])
        and "eligible_staff_person" in cast(str, row[3])
        and ("person_id=?" in cast(str, row[3]) or "rowid=?" in cast(str, row[3]))
        for row in plan
    )


def test_no_cast_quality_is_type_precise_and_uses_cast_primary_key_prefix(
    contracts_root: Path,
    tmp_path: Path,
) -> None:
    schema_sql = (contracts_root / "schemas" / "archive" / "schema.sql").read_text()
    connection = _open_database(tmp_path / "quality.sqlite", schema_sql)
    try:
        connection.executemany(
            "INSERT INTO subject "
            "(subject_type, subject_id, name, name_cn, nsfw, air_date, "
            "air_date_precision, score, votes) "
            "VALUES (?, 1, ?, NULL, 0, NULL, NULL, NULL, 0)",
            (("anime", "Anime"), ("book", "Book")),
        )
        connection.execute("INSERT INTO person VALUES (1, 'Person', NULL, NULL)")
        connection.execute("INSERT INTO character VALUES (1, 'Character', NULL)")
        connection.execute("INSERT INTO cast_credit VALUES ('anime', 1, 1, 1, 1, 0, 1, 'exact')")
        summary = _quality_summary(connection, 0, 0)
        plan = connection.execute(
            "EXPLAIN QUERY PLAN "
            "SELECT COUNT(*) FROM subject s WHERE NOT EXISTS "
            "(SELECT 1 FROM cast_credit c "
            "WHERE c.subject_type = s.subject_type AND c.subject_id = s.subject_id)"
        ).fetchall()
    finally:
        connection.close()
    assert summary["NO_CAST_RELATIONS"] == 1
    assert any(
        "SEARCH c USING COVERING INDEX" in cast(str, row[3])
        and "subject_type=?" in cast(str, row[3])
        and "subject_id=?" in cast(str, row[3])
        for row in plan
    )
