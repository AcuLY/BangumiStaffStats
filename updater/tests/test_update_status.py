"""Closed consumer and atomic update-status persistence tests."""

from __future__ import annotations

import json
from pathlib import Path
from typing import IO, cast

import jsonschema
import pytest

from bangumi_staff_stats_updater import update_status
from bangumi_staff_stats_updater.update_status import (
    StatusDocument,
    UpdateStatusError,
    canonical_status_bytes,
    next_status_document,
    read_status,
    terminal_record,
    validate_status_document,
    write_status,
)

_VERSION = "dv1-" + ("a" * 64)


def _success() -> update_status.StatusRecord:
    return terminal_record(
        time="2026-07-25T03:04:05.678Z",
        status="published",
        phase="complete",
        duration_seconds=3,
        data_version=_VERSION,
        error_code=None,
    )


def _document() -> StatusDocument:
    return next_status_document(None, _success())


def test_manual_consumer_matches_shared_schema_and_goldens(
    contracts_root: Path,
) -> None:
    schema = json.loads(
        (contracts_root / "schemas/update-status/update-status-v1.schema.json").read_bytes()
    )
    validator = jsonschema.Draft202012Validator(
        schema,
        format_checker=jsonschema.FormatChecker(),
    )
    case_root = contracts_root / "goldens/update-status/cases"
    for name in ("first-failure", "canceled", "no-change", "published"):
        document = json.loads((case_root / f"{name}.json").read_bytes())
        validator.validate(document)
        assert validate_status_document(document) == document
    invalid = json.loads((case_root / "invalid.json").read_bytes())
    for mutation in invalid["mutations"]:
        if mutation["id"] != "calendar-invalid-time":
            with pytest.raises(jsonschema.ValidationError):
                validator.validate(mutation["document"])
        with pytest.raises(UpdateStatusError, match="STATUS_STATE_INVALID"):
            validate_status_document(mutation["document"])


@pytest.mark.parametrize("code", ["FAILED_", "FAILED__AGAIN", "failed", "A" * 65])
def test_error_codes_match_the_closed_schema(code: str) -> None:
    with pytest.raises(UpdateStatusError, match="STATUS_STATE_INVALID"):
        terminal_record(
            time="2026-07-25T00:00:00Z",
            status="failed",
            phase="build",
            duration_seconds=1,
            data_version=None,
            error_code=code,
        )


def test_success_and_failure_transitions_preserve_prior_success() -> None:
    previous = _document()
    prior_success = json.dumps(previous["last_success"], sort_keys=True)
    failure = terminal_record(
        time="2026-07-25T04:00:00Z",
        status="failed",
        phase="smoke",
        duration_seconds=4,
        data_version=_VERSION,
        error_code="GO_SMOKE_FAILED",
    )
    updated = next_status_document(previous, failure)
    assert updated["last_attempt"] == failure
    assert json.dumps(updated["last_success"], sort_keys=True) == prior_success

    canceled = terminal_record(
        time="2026-07-25T05:00:00Z",
        status="canceled",
        phase="build",
        duration_seconds=5,
        data_version=_VERSION,
        error_code="CANCELED",
    )
    assert next_status_document(updated, canceled)["last_success"] == previous["last_success"]


def test_atomic_round_trip_is_canonical_and_leaves_no_temp(tmp_path: Path) -> None:
    target = tmp_path / "update-status.json"
    document = _document()
    write_status(target, document)
    assert target.read_bytes() == canonical_status_bytes(document)
    assert read_status(target) == document
    assert not tuple(tmp_path.glob(".update-status.*.tmp"))


@pytest.mark.parametrize(
    "fault_name",
    ["_write", "_flush", "_sync_file", "_replace"],
)
def test_precommit_fault_preserves_prior_bytes_and_removes_temp(
    fault_name: str,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    target = tmp_path / "update-status.json"
    previous = _document()
    write_status(target, previous)
    prior_bytes = target.read_bytes()
    failed = terminal_record(
        time="2026-07-25T06:00:00Z",
        status="failed",
        phase="manifest",
        duration_seconds=6,
        data_version=_VERSION,
        error_code="MANIFEST_FAILED",
    )

    def fault(*_args: object, **_kwargs: object) -> None:
        raise OSError("injected private detail")

    monkeypatch.setattr(update_status, fault_name, fault)
    with pytest.raises(UpdateStatusError, match="STATUS_WRITE_FAILED"):
        write_status(target, next_status_document(previous, failed))
    assert target.read_bytes() == prior_bytes
    assert not tuple(tmp_path.glob(".update-status.*.tmp"))


def test_directory_sync_fault_is_postreplace_and_reported_truthfully(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    target = tmp_path / "update-status.json"
    previous = _document()
    write_status(target, previous)
    failed = terminal_record(
        time="2026-07-25T07:00:00Z",
        status="failed",
        phase="complete",
        duration_seconds=7,
        data_version=_VERSION,
        error_code="EVENT_WRITE_FAILED",
    )
    replacement = next_status_document(previous, failed)

    def fail_directory_sync(_path: Path) -> None:
        raise OSError("injected")

    monkeypatch.setattr(update_status, "_sync_directory", fail_directory_sync)
    with pytest.raises(UpdateStatusError, match="STATUS_WRITE_FAILED"):
        write_status(target, replacement)
    assert target.read_bytes() == canonical_status_bytes(replacement)
    assert target.read_bytes() != canonical_status_bytes(previous)
    assert not tuple(tmp_path.glob(".update-status.*.tmp"))


def test_unsafe_and_malformed_prior_state_fail_closed(tmp_path: Path) -> None:
    relative = Path("update-status.json")
    with pytest.raises(UpdateStatusError, match="STATUS_PATH_INVALID"):
        read_status(relative)
    wrong_name = tmp_path / "status.json"
    with pytest.raises(UpdateStatusError, match="STATUS_PATH_INVALID"):
        read_status(wrong_name)

    target = tmp_path / "update-status.json"
    target.write_text('{"last_attempt":{},"last_success":null}\n')
    with pytest.raises(UpdateStatusError, match="STATUS_STATE_INVALID"):
        read_status(target)

    with pytest.raises(UpdateStatusError, match="STATUS_STATE_INVALID"):
        write_status(target, _document())

    target.unlink()
    target.symlink_to(tmp_path / "missing")
    with pytest.raises(UpdateStatusError, match="STATUS_STATE_INVALID"):
        read_status(target)
    with pytest.raises(UpdateStatusError, match="STATUS_STATE_INVALID"):
        write_status(target, _document())


def test_partial_write_is_rejected() -> None:
    class PartialWriter:
        def write(self, data: bytes) -> int:
            return len(data) - 1

    with pytest.raises(OSError, match="incomplete status write"):
        update_status._write(cast(IO[bytes], PartialWriter()), b"status")


def test_duplicate_json_keys_are_rejected(tmp_path: Path) -> None:
    target = tmp_path / "update-status.json"
    document = cast(dict[str, object], _document())
    encoded = json.dumps(document, separators=(",", ":"))
    target.write_text(encoded[:-1] + ',"last_success":null}')
    with pytest.raises(UpdateStatusError, match="STATUS_STATE_INVALID"):
        read_status(target)
