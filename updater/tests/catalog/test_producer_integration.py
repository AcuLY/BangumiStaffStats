"""Governed catalog/cast/quality integration at the producer boundary."""

from __future__ import annotations

import copy
import io
import json
import sqlite3
import sys
import zipfile
from collections.abc import Callable
from pathlib import Path
from typing import cast

import pytest
import yaml

from bangumi_staff_stats_updater.catalog.config import configuration_from_documents
from bangumi_staff_stats_updater.catalog.errors import CatalogError
from bangumi_staff_stats_updater.producer.acquisition import LATEST_URL
from bangumi_staff_stats_updater.producer.builder import build_database
from bangumi_staff_stats_updater.producer.manifest import digest_bytes
from bangumi_staff_stats_updater.producer.model import (
    ARCHIVE_MEMBER_NAMES,
    SOURCE_NAMES,
    BuildIdentity,
    BuildResult,
    ProducerError,
    SourceInput,
)
from bangumi_staff_stats_updater.producer.service import ProduceRequest, ProduceResult, produce

_TYPE_CODES = {"book": 1, "anime": 2, "music": 3, "game": 4, "real": 6}


def _case(contracts_root: Path) -> dict[str, object]:
    path = contracts_root / "goldens" / "catalog" / "cases" / "complete-derivation.json"
    return cast(dict[str, object], json.loads(path.read_bytes()))


def _variant_code(document: dict[str, object], mutation_id: str) -> str:
    expected = cast(dict[str, object], document["expected"])
    variants = cast(list[dict[str, object]], expected["variants"])
    variant = next(item for item in variants if item["mutationId"] == mutation_id)
    codes = cast(list[str], variant["errorCodes"])
    assert len(codes) == 1
    return codes[0]


def _common_yaml(entries_value: object) -> bytes:
    entries = cast(list[dict[str, object]], entries_value)
    categories: dict[str, object] = {}
    defined_types: dict[str, object] = {}
    staffs: dict[int, object] = {}
    for entry in entries:
        subject_type = cast(str, entry["subjectType"])
        category_values: list[dict[str, object]] = []
        category_by_key: dict[str, dict[str, object]] = {}
        for raw_category in cast(list[dict[str, object]], entry["categories"]):
            names = cast(dict[str, object], raw_category["names"])
            category = {
                "order": raw_category["order"] or 0,
                "en": raw_category["key"],
                "cn": names["cn"],
            }
            category_values.append(category)
            category_by_key[cast(str, raw_category["key"])] = category
        if category_values:
            categories[subject_type] = category_values
        position_values: dict[int, object] = {}
        for raw_position in cast(list[dict[str, object]], entry["positions"]):
            names = cast(dict[str, object], raw_position["names"])
            position_values[cast(int, raw_position["id"])] = {
                "en": names["en"],
                "cn": names["cn"],
                "jp": names["jp"],
                "categories": [
                    category_by_key[key] for key in cast(list[str], raw_position["categoryKeys"])
                ],
            }
        defined_types[subject_type] = position_values
        staffs[_TYPE_CODES[subject_type]] = position_values
    document = {
        "define": {
            "type": _TYPE_CODES,
            "categories": categories,
            "types": defined_types,
        },
        "staffs": staffs,
    }
    rendered = cast(
        str,
        yaml.safe_dump(
            document,
            allow_unicode=True,
            sort_keys=False,
        ),
    )
    return rendered.encode()


def _source_records(archive_value: object) -> dict[str, list[dict[str, object]]]:
    archive = cast(dict[str, object], archive_value)
    return {
        "subject.jsonlines": [
            {
                "id": item["subjectId"],
                "type": _TYPE_CODES[cast(str, item["subjectType"])],
                "name": f"subject-{item['subjectId']}",
                "name_cn": "",
                "nsfw": False,
                "date": None,
            }
            for item in cast(list[dict[str, object]], archive["subjects"])
        ],
        "person.jsonlines": [
            {
                "id": item["personId"],
                "name": f"person-{item['personId']}",
                "career": ["seiyu"],
            }
            for item in cast(list[dict[str, object]], archive["persons"])
        ],
        "character.jsonlines": [
            {
                "id": item["characterId"],
                "name": f"character-{item['characterId']}",
            }
            for item in cast(list[dict[str, object]], archive["characters"])
        ],
        "subject-persons.jsonlines": [
            {
                "subject_id": item["subjectId"],
                "person_id": item["personId"],
                "position": item["positionId"],
            }
            for item in cast(list[dict[str, object]], archive["staffCredits"])
        ],
        "subject-characters.jsonlines": [
            {
                "subject_id": item["subjectId"],
                "character_id": item["characterId"],
                "type": item["type"],
                "order": item["order"],
            }
            for item in cast(list[dict[str, object]], archive["subjectCharacters"])
        ],
        "person-characters.jsonlines": [
            {
                "subject_id": item["subjectId"],
                "character_id": item["characterId"],
                "person_id": item["personId"],
            }
            for item in cast(list[dict[str, object]], archive["personCharacters"])
        ],
        "subject-relations.jsonlines": [
            {
                "subject_id": item["subjectId"],
                "related_subject_id": item["relatedSubjectId"],
                "relation_type": item["relationType"],
            }
            for item in cast(list[dict[str, object]], archive["subjectRelations"])
        ],
    }


def _write_sources(
    root: Path,
    records: dict[str, list[dict[str, object]]],
) -> tuple[SourceInput, ...]:
    source_root = root / "sources"
    source_root.mkdir(parents=True)
    result: list[SourceInput] = []
    for name in SOURCE_NAMES:
        data = b"".join(
            (
                json.dumps(
                    item,
                    ensure_ascii=False,
                    allow_nan=False,
                    separators=(",", ":"),
                )
                + "\n"
            ).encode()
            for item in records[name]
        )
        path = source_root / name
        path.write_bytes(data)
        digest = digest_bytes(data)
        result.append(SourceInput(name, path, len(data), digest, len(data), digest))
    return tuple(result)


def _source_bytes(records: dict[str, list[dict[str, object]]]) -> dict[str, bytes]:
    return {
        name: b"".join(
            (
                json.dumps(
                    item,
                    ensure_ascii=False,
                    allow_nan=False,
                    separators=(",", ":"),
                )
                + "\n"
            ).encode()
            for item in records[name]
        )
        for name in SOURCE_NAMES
    }


def _archive_bytes(records: dict[str, list[dict[str, object]]]) -> bytes:
    sources = _source_bytes(records)
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name in sorted(ARCHIVE_MEMBER_NAMES):
            archive.writestr(name, sources.get(name, b""))
    return output.getvalue()


class _CatalogClient:
    def __init__(self, archive: bytes, common: bytes) -> None:
        self.archive = archive
        self.common = common
        name = "dump-2026-07-25.000000Z.zip"
        self.latest = json.dumps(
            {
                "browser_download_url": (
                    f"https://github.com/bangumi/Archive/releases/download/archive/{name}"
                ),
                "content_type": "application/zip",
                "created_at": "2026-07-25T00:00:00Z",
                "digest": digest_bytes(archive),
                "id": 1,
                "label": "",
                "name": name,
                "node_id": "node",
                "size": len(archive),
                "updated_at": "2026-07-25T00:00:00Z",
                "url": "https://api.github.com/repos/bangumi/Archive/releases/assets/1",
            },
            separators=(",", ":"),
        ).encode()

    def fetch_bytes(
        self,
        url: str,
        *,
        maximum: int,
        allowed_hosts: frozenset[str],
        cancelled: Callable[[], bool],
    ) -> tuple[bytes, str]:
        del maximum, allowed_hosts, cancelled
        return (self.latest, url) if url == LATEST_URL else (self.common, url)

    def download(
        self,
        url: str,
        destination: Path,
        *,
        expected_size: int,
        expected_digest: str,
        maximum: int,
        allowed_hosts: frozenset[str],
        cancelled: Callable[[], bool],
    ) -> str:
        del maximum, allowed_hosts, cancelled
        assert expected_size == len(self.archive)
        assert expected_digest == digest_bytes(self.archive)
        destination.write_bytes(self.archive)
        return url


def _smoke(path: Path) -> Path:
    path.write_text(
        f"#!{sys.executable}\n"
        "import hashlib,json,pathlib,sys\n"
        "args=dict(zip(sys.argv[1::2],sys.argv[2::2],strict=True))\n"
        "root=pathlib.Path(args['-archive-root'])\n"
        "version=args['-data-version']\n"
        "manifest_path=root/'versions'/version/'manifest.json'\n"
        "data=manifest_path.read_bytes()\n"
        "manifest=json.loads(data)\n"
        "print(json.dumps({'ok':True,'dataVersion':version,"
        "'manifestDigest':'sha256:'+hashlib.sha256(data).hexdigest(),"
        "'sqliteDigest':manifest['sqliteDigest']},separators=(',',':')))\n"
    )
    path.chmod(0o755)
    return path


def _produce_request(
    contracts_root: Path,
    output_root: Path,
    smoke: Path,
) -> ProduceRequest:
    return ProduceRequest(
        output_root=output_root,
        contracts_root=contracts_root,
        catalog_config=(
            Path(__file__).resolve().parents[2] / "config" / "catalog" / "display-v1.yaml"
        ).resolve(strict=True),
        common_commit="6a8442c17143a870357a5ff812362e8b5cfe9f9d",
        archive_smoke=smoke.resolve(strict=True),
        generated_at="2026-07-25T00:00:00Z",
    )


def _build(
    contracts_root: Path,
    tmp_path: Path,
    *,
    mutation_id: str | None = None,
) -> tuple[dict[str, object], Path, BuildResult]:
    document = _case(contracts_root)
    inputs = cast(dict[str, object], document["input"])
    records = _source_records(inputs["archive"])
    if mutation_id == "unknown-cast-role":
        records["subject-characters.jsonlines"][0]["type"] = 7
    elif mutation_id == "conflicting-subject-character":
        conflict = copy.deepcopy(records["subject-characters.jsonlines"][0])
        conflict["type"] = 2
        records["subject-characters.jsonlines"].append(conflict)
    elif mutation_id == "duplicate-subject-character":
        records["subject-characters.jsonlines"].append(
            copy.deepcopy(records["subject-characters.jsonlines"][0])
        )
    elif mutation_id == "duplicate-person-character":
        records["person-characters.jsonlines"].append(
            copy.deepcopy(records["person-characters.jsonlines"][0])
        )
    elif mutation_id == "duplicate-staff-credit":
        records["subject-persons.jsonlines"].append(
            copy.deepcopy(records["subject-persons.jsonlines"][0])
        )
    elif mutation_id == "dangling-person-character":
        records["person-characters.jsonlines"].append(
            {
                "subject_id": 9717,
                "character_id": 9001,
                "person_id": 999999,
            }
        )

    common_bytes = _common_yaml(inputs["commonCatalog"])
    configuration = configuration_from_documents(
        inputs["displayConfig"],
        inputs["staffSetConfig"],
        contracts_root,
    )
    schema_bytes = (contracts_root / "schemas" / "archive" / "schema.sql").read_bytes()
    identity = BuildIdentity(
        "catalog-contract-fixture",
        digest_bytes(b"catalog-contract-archive"),
        "a" * 40,
        digest_bytes(common_bytes),
        1,
        1,
        digest_bytes(schema_bytes),
        "domain-raw-v1",
        "cast-exact-v1",
        configuration.digest,
    )
    build_root = tmp_path / (mutation_id or "valid")
    sources = _write_sources(build_root, records)
    destination = build_root / "candidate.sqlite"
    result = build_database(
        contracts_root=contracts_root,
        destination=destination,
        sources=sources,
        common_bytes=common_bytes,
        catalog_bytes=configuration.canonical_bytes,
        identity=identity,
    )
    return document, destination, result


def test_governed_builder_matches_contract_cast_and_quality_evidence(
    contracts_root: Path,
    tmp_path: Path,
) -> None:
    _document, database, result = _build(contracts_root, tmp_path)
    sentinel_path = (
        contracts_root / "goldens" / "catalog" / "quality" / "complete-source-sentinel.json"
    )
    expected_quality = cast(dict[str, object], json.loads(sentinel_path.read_bytes()))
    assert result.quality_report == expected_quality
    assert result.quality_summary == {
        **cast(dict[str, int], expected_quality["counts"]),
        "UNKNOWN_STAFF_POSITION": 1,
    }

    connection = sqlite3.connect(database)
    try:
        roles = connection.execute(
            "SELECT role_type, COUNT(*) FROM cast_credit GROUP BY role_type ORDER BY role_type"
        ).fetchall()
        assert roles == [(1, 1), (2, 1), (3, 1), (4, 1), (5, 1), (6, 1)]
        assert connection.execute(
            "SELECT COUNT(*) FROM cast_credit WHERE subject_id = 300"
        ).fetchone() == (0,)
        assert connection.execute(
            "SELECT position_kind FROM catalog_position WHERE position_key = 'staff:anime:104'"
        ).fetchone() == ("staff",)
        assert connection.execute(
            "SELECT COUNT(*) FROM cast_credit WHERE subject_id = 9717 AND person_id = 6756"
        ).fetchone() == (1,)
        assert connection.execute("SELECT COUNT(*) FROM staff_set").fetchone() == (0,)
    finally:
        connection.close()


@pytest.mark.parametrize(
    ("mutation_id", "expected_code"),
    [
        ("unknown-cast-role", "UNKNOWN_CAST_ROLE"),
        ("conflicting-subject-character", "SOURCE_DUPLICATE_CONFLICT"),
    ],
)
def test_governed_source_domain_and_admission_conflicts_are_fatal(
    contracts_root: Path,
    tmp_path: Path,
    mutation_id: str,
    expected_code: str,
) -> None:
    document = _case(contracts_root)
    with pytest.raises(ProducerError) as raised:
        _build(contracts_root, tmp_path, mutation_id=mutation_id)
    if mutation_id == "unknown-cast-role":
        assert expected_code == _variant_code(document, mutation_id)
    assert raised.value.code == expected_code


@pytest.mark.parametrize(
    ("mutation_id", "source_name"),
    [
        ("duplicate-subject-character", "subject-characters.jsonlines"),
        ("duplicate-person-character", "person-characters.jsonlines"),
        ("duplicate-staff-credit", "subject-persons.jsonlines"),
    ],
)
def test_governed_raw_identical_duplicates_keep_archive_accounting(
    contracts_root: Path,
    tmp_path: Path,
    mutation_id: str,
    source_name: str,
) -> None:
    _document, database, result = _build(
        contracts_root,
        tmp_path,
        mutation_id=mutation_id,
    )
    accounting = {item.name: item for item in result.accounting}
    assert accounting[source_name].duplicate == 1
    connection = sqlite3.connect(database)
    try:
        assert connection.execute("SELECT COUNT(*) FROM cast_credit").fetchone() == (6,)
        assert connection.execute("SELECT COUNT(*) FROM staff_credit").fetchone() == (12,)
    finally:
        connection.close()


def test_governed_dangling_raw_relation_is_invalid_and_excluded(
    contracts_root: Path,
    tmp_path: Path,
) -> None:
    _document, database, result = _build(
        contracts_root,
        tmp_path,
        mutation_id="dangling-person-character",
    )
    accounting = {item.name: item for item in result.accounting}
    assert accounting["person-characters.jsonlines"].invalid == 1
    connection = sqlite3.connect(database)
    try:
        assert connection.execute(
            "SELECT COUNT(*) FROM cast_credit WHERE person_id = 999999"
        ).fetchone() == (0,)
        assert connection.execute(
            "SELECT COUNT(*) FROM person WHERE person_id = 999999"
        ).fetchone() == (0,)
    finally:
        connection.close()


def test_fresh_produce_reports_deterministic_quality_and_no_change_reports_none(
    contracts_root: Path,
    tmp_path: Path,
) -> None:
    document = _case(contracts_root)
    inputs = cast(dict[str, object], document["input"])
    records = _source_records(inputs["archive"])
    common = _common_yaml(inputs["commonCatalog"])
    client = _CatalogClient(_archive_bytes(records), common)
    smoke = _smoke(tmp_path / "archive-smoke")
    first_root = tmp_path / "root-one"
    second_root = tmp_path / "root-two"
    first_root.mkdir()
    second_root.mkdir()
    first = produce(
        _produce_request(contracts_root, first_root, smoke),
        client=client,
    )
    second = produce(
        _produce_request(contracts_root, second_root, smoke),
        client=client,
    )
    expected_path = (
        contracts_root / "goldens" / "catalog" / "quality" / "complete-source-sentinel.json"
    )
    expected = cast(dict[str, object], json.loads(expected_path.read_bytes()))
    assert first.quality_report == expected
    assert second.quality_report == expected
    assert first.quality_report == second.quality_report
    assert first.data_version == second.data_version
    assert set(first.as_json()) == {
        "code",
        "status",
        "dataVersion",
        "manifestDigest",
        "sqliteDigest",
    }

    no_change = produce(
        _produce_request(contracts_root, first_root, smoke),
        client=client,
    )
    assert no_change.status == "no-change"
    assert no_change.quality_report is None


def test_cli_success_document_does_not_expose_python_quality_report(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
) -> None:
    from bangumi_staff_stats_updater import cli as cli_module

    result = ProduceResult(
        "published",
        "dv1-" + ("a" * 64),
        "sha256:" + ("b" * 64),
        "sha256:" + ("c" * 64),
        {"schemaVersion": 1},
    )
    monkeypatch.setattr(cli_module, "produce", lambda _request: result)
    status = cli_module.main(
        [
            "produce",
            "--output-root",
            str(tmp_path / "output"),
            "--contracts-root",
            str(tmp_path / "contracts"),
            "--catalog-config",
            str(tmp_path / "display-v1.yaml"),
            "--common-commit",
            "a" * 40,
            "--archive-smoke",
            str(tmp_path / "archive-smoke"),
        ]
    )
    assert status == 0
    assert capsys.readouterr().out == (
        json.dumps(result.as_json(), sort_keys=True, separators=(",", ":")) + "\n"
    )
    assert "quality" not in result.as_json()


def test_quality_overflow_is_bounded_evidence_and_publishes_nothing(
    contracts_root: Path,
    tmp_path: Path,
) -> None:
    document = _case(contracts_root)
    inputs = cast(dict[str, object], document["input"])
    records = _source_records(inputs["archive"])
    records["subject-persons.jsonlines"].extend(
        {
            "subject_id": 500,
            "person_id": 11,
            "position": 20_000 + offset,
        }
        for offset in range(1001)
    )
    common = _common_yaml(inputs["commonCatalog"])
    client = _CatalogClient(_archive_bytes(records), common)
    output_root = tmp_path / "overflow-root"
    output_root.mkdir()
    smoke = _smoke(tmp_path / "overflow-smoke")
    with pytest.raises(
        ProducerError,
        match="QUALITY_UNKNOWN_POSITION_BOUND_EXCEEDED",
    ) as raised:
        produce(
            _produce_request(contracts_root, output_root, smoke),
            client=client,
        )
    assert raised.value.evidence == {
        "unknownStaffPositionGroupCount": 1002,
        "limit": 1000,
    }
    versions = output_root / "versions"
    assert not versions.exists() or not tuple(versions.iterdir())
    assert not tuple(output_root.glob(".bgmss-stage-*"))
    assert not tuple(output_root.rglob("*quality*"))


def test_derivation_closure_failure_publishes_nothing(
    contracts_root: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    document = _case(contracts_root)
    inputs = cast(dict[str, object], document["input"])
    records = _source_records(inputs["archive"])
    common = _common_yaml(inputs["commonCatalog"])
    client = _CatalogClient(_archive_bytes(records), common)
    output_root = tmp_path / "closure-root"
    output_root.mkdir()
    smoke = _smoke(tmp_path / "closure-smoke")

    def reject_closure(_connection: sqlite3.Connection) -> None:
        raise CatalogError("DERIVATION_CLOSURE_INVALID")

    monkeypatch.setattr(
        "bangumi_staff_stats_updater.producer.builder.validate_derivation_closure",
        reject_closure,
    )
    with pytest.raises(ProducerError) as raised:
        produce(
            _produce_request(contracts_root, output_root, smoke),
            client=client,
        )
    assert raised.value.code == "DERIVATION_CLOSURE_INVALID"
    versions = output_root / "versions"
    assert not versions.exists() or not tuple(versions.iterdir())
    assert not (output_root / "current.json").exists()
    assert not tuple(output_root.glob(".bgmss-stage-*"))
