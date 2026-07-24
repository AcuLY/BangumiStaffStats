"""Archive contract adapter tests."""

from __future__ import annotations

import hashlib
import os
import stat
from pathlib import Path

import pytest

from bangumi_staff_stats_updater import archive_contract
from bangumi_staff_stats_updater.archive_contract import (
    ContractExpectationError,
    ContractInputError,
    check_contracts,
)

_EXPECTED_OUTCOMES = {
    "minimal-valid": "VALID",
    "data-version-vector": "VALID",
    "manifest-bad-digest": "MANIFEST_SCHEMA_INVALID",
    "manifest-unknown-field": "MANIFEST_SCHEMA_INVALID",
    "manifest-unsafe-sqlite-file": "MANIFEST_SCHEMA_INVALID",
    "manifest-source-accounting-mismatch": "MANIFEST_ACCOUNTING_INVALID",
    "sqlite-unsupported-schema": "ARCHIVE_VERSION_UNSUPPORTED",
    "manifest-data-version-mismatch": "DATA_VERSION_MISMATCH",
}


def _tree_seal(root: Path) -> str:
    digest = hashlib.sha256()

    def visit(directory: Path) -> None:
        for entry in sorted(os.scandir(directory), key=lambda item: item.name):
            path = Path(entry.path)
            relative = path.relative_to(root).as_posix().encode()
            metadata = entry.stat(follow_symlinks=False)
            digest.update(relative)
            digest.update(str(metadata.st_mode).encode())
            if stat.S_ISDIR(metadata.st_mode):
                visit(path)
            elif stat.S_ISREG(metadata.st_mode):
                digest.update(path.read_bytes())
            elif stat.S_ISLNK(metadata.st_mode):
                digest.update(str(path.readlink()).encode())

    visit(root)
    return digest.hexdigest()


def test_whole_bundle_and_selected_cases_are_valid(contracts_root: Path) -> None:
    before = _tree_seal(contracts_root)
    report = check_contracts(contracts_root)

    assert report.indexed_files == 31
    assert dict(report.selected_outcomes) == _EXPECTED_OUTCOMES
    assert _tree_seal(contracts_root) == before
    assert not tuple(contracts_root.rglob("current.json"))


@pytest.mark.parametrize(("case_id", "expected"), tuple(_EXPECTED_OUTCOMES.items()))
def test_every_approved_case_executes(
    contracts_root: Path,
    case_id: str,
    expected: str,
) -> None:
    outcomes = dict(check_contracts(contracts_root).selected_outcomes)
    assert outcomes[case_id] == expected


@pytest.mark.parametrize(
    ("case_id", "expected"),
    [
        ("sqlite-unsupported-schema", "ARCHIVE_VERSION_UNSUPPORTED"),
        ("manifest-data-version-mismatch", "DATA_VERSION_MISMATCH"),
    ],
)
def test_precedence_stops_before_sqlite_bytes(
    contracts_root: Path,
    case_id: str,
    expected: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root = archive_contract._root_directory(contracts_root)
    schema_root = archive_contract._regular_file(root, "schemas/archive/schema.sql").parent
    golden_root = archive_contract._regular_file(root, "goldens/archive/index.json").parent
    validators = archive_contract._load_validators(schema_root)
    original = archive_contract._read_bytes

    def reject_sqlite(path: Path) -> bytes:
        if path.suffix == ".sqlite":
            raise AssertionError
        return original(path)

    monkeypatch.setattr(archive_contract, "_read_bytes", reject_sqlite)
    assert archive_contract._classify_bundle(golden_root, case_id, validators) == expected


@pytest.mark.parametrize(
    "payload",
    [
        b"\xef\xbb\xbf{}",
        b'{"key":1,"key":2}',
        b"{} trailing",
        b'{"value":NaN}',
        b'{"value":Infinity}',
        b'{"value":1e9999}',
        b"\xff",
    ],
)
def test_strict_json_rejects_ambiguous_inputs(payload: bytes) -> None:
    with pytest.raises(archive_contract._JsonParseError):
        archive_contract._decode_json(payload)


def test_strict_json_accepts_one_utf8_value() -> None:
    assert archive_contract._decode_json(b'{"value":1.25}\n') == {"value": 1.25}


def test_missing_or_linked_contract_root_is_input_invalid(
    contracts_root: Path,
    tmp_path: Path,
) -> None:
    with pytest.raises(ContractInputError):
        check_contracts(tmp_path / "missing")

    linked_root = tmp_path / "linked-contracts"
    linked_root.symlink_to(contracts_root, target_is_directory=True)
    with pytest.raises(ContractInputError):
        check_contracts(linked_root)


def test_golden_digest_drift_is_input_invalid(
    contracts_root: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    original = archive_contract._digest_file

    def drift_one_manifest(path: Path) -> str:
        if path.name == "archive-manifest.json" and "valid/minimal" in path.as_posix():
            return "sha256:" + ("0" * 64)
        return original(path)

    monkeypatch.setattr(archive_contract, "_digest_file", drift_one_manifest)
    with pytest.raises(ContractInputError):
        check_contracts(contracts_root)


def test_case_outcome_drift_is_expectation_failure(
    contracts_root: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(archive_contract, "_classify_json", lambda *_args: "VALID")
    with pytest.raises(ContractExpectationError):
        check_contracts(contracts_root)
