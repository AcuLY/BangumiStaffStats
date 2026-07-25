"""Closed update-status model and same-directory atomic persistence."""

from __future__ import annotations

import json
import math
import os
import re
import stat
import tempfile
from contextlib import suppress
from datetime import datetime
from pathlib import Path
from typing import IO, Literal, TypedDict, cast

_MAX_STATUS_BYTES = 64 * 1024
_TIME = re.compile(
    r"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}"
    r"(?:\.[0-9]{1,6})?Z$"
)
_DATA_VERSION = re.compile(r"^dv1-[0-9a-f]{64}$")
_ERROR_CODE = re.compile(r"^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$")
_PHASES = frozenset(
    {
        "preflight",
        "acquisition",
        "identity",
        "build",
        "manifest",
        "smoke",
        "publication",
        "complete",
    }
)
_STATUSES = frozenset({"failed", "canceled", "no-change", "published"})
_SUCCESS_STATUSES = frozenset({"no-change", "published"})
_RECORD_FIELDS = frozenset(
    {
        "time",
        "status",
        "phase",
        "duration_seconds",
        "dataVersion",
        "error_code",
    }
)

TerminalStatus = Literal["failed", "canceled", "no-change", "published"]


class StatusRecord(TypedDict):
    """One closed terminal attempt."""

    time: str
    status: TerminalStatus
    phase: str
    duration_seconds: float
    dataVersion: str | None
    error_code: str | None


class StatusDocument(TypedDict):
    """Only the latest attempt and latest success."""

    last_attempt: StatusRecord
    last_success: StatusRecord | None


class UpdateStatusError(RuntimeError):
    """Stable sanitized status failure."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def _invalid_state() -> UpdateStatusError:
    return UpdateStatusError("STATUS_STATE_INVALID")


def _is_number(value: object) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
        and value >= 0
    )


def _validate_time(value: object) -> bool:
    if not isinstance(value, str) or _TIME.fullmatch(value) is None:
        return False
    try:
        datetime.fromisoformat(value.removesuffix("Z") + "+00:00")
    except ValueError:
        return False
    return True


def _validate_record(value: object, *, success_only: bool) -> StatusRecord:
    if not isinstance(value, dict) or set(value) != _RECORD_FIELDS:
        raise _invalid_state()
    status_value = value.get("status")
    phase = value.get("phase")
    data_version = value.get("dataVersion")
    error_code = value.get("error_code")
    if (
        not _validate_time(value.get("time"))
        or status_value not in _STATUSES
        or (success_only and status_value not in _SUCCESS_STATUSES)
        or phase not in _PHASES
        or not _is_number(value.get("duration_seconds"))
        or (
            data_version is not None
            and (not isinstance(data_version, str) or _DATA_VERSION.fullmatch(data_version) is None)
        )
    ):
        raise _invalid_state()
    if status_value == "failed":
        if (
            not isinstance(error_code, str)
            or len(error_code) > 64
            or error_code == "CANCELED"
            or _ERROR_CODE.fullmatch(error_code) is None
        ):
            raise _invalid_state()
    elif status_value == "canceled":
        if error_code != "CANCELED":
            raise _invalid_state()
    elif error_code is not None:
        raise _invalid_state()
    return cast(StatusRecord, value)


def validate_status_document(value: object) -> StatusDocument:
    """Validate the package-contained typed equivalent of the shared schema."""
    if not isinstance(value, dict) or set(value) != {"last_attempt", "last_success"}:
        raise _invalid_state()
    attempt = _validate_record(value["last_attempt"], success_only=False)
    success_value = value["last_success"]
    success = None if success_value is None else _validate_record(success_value, success_only=True)
    attempt_copy = cast(StatusRecord, dict(attempt))
    success_copy = None if success is None else cast(StatusRecord, dict(success))
    return {
        "last_attempt": attempt_copy,
        "last_success": success_copy,
    }


def terminal_record(
    *,
    time: str,
    status: TerminalStatus,
    phase: str,
    duration_seconds: float,
    data_version: str | None,
    error_code: str | None,
) -> StatusRecord:
    """Build and validate one exact terminal record."""
    return _validate_record(
        {
            "time": time,
            "status": status,
            "phase": phase,
            "duration_seconds": duration_seconds,
            "dataVersion": data_version,
            "error_code": error_code,
        },
        success_only=False,
    )


def next_status_document(
    previous: StatusDocument | None,
    attempt: StatusRecord,
) -> StatusDocument:
    """Apply the closed latest-attempt/latest-success transition."""
    prior = None if previous is None else validate_status_document(previous)
    record = dict(_validate_record(attempt, success_only=False))
    last_success = (
        dict(record)
        if record["status"] in _SUCCESS_STATUSES
        else None
        if prior is None
        else prior["last_success"]
    )
    return validate_status_document(
        {
            "last_attempt": record,
            "last_success": last_success,
        }
    )


def _reject_duplicate_keys(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise _invalid_state()
        result[key] = value
    return result


def _canonical_target(path: Path) -> Path:
    if not path.is_absolute() or path.name != "update-status.json":
        raise UpdateStatusError("STATUS_PATH_INVALID")
    parent = path.parent
    try:
        parent_metadata = parent.lstat()
        resolved_parent = parent.resolve(strict=True)
    except OSError as error:
        raise UpdateStatusError("STATUS_PATH_INVALID") from error
    if (
        stat.S_ISLNK(parent_metadata.st_mode)
        or not stat.S_ISDIR(parent_metadata.st_mode)
        or parent.absolute() != resolved_parent
    ):
        raise UpdateStatusError("STATUS_PATH_INVALID")
    return resolved_parent / path.name


def _read_regular(path: Path) -> bytes:
    flags = os.O_RDONLY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        descriptor = os.open(path, flags)
    except OSError as error:
        raise UpdateStatusError("STATUS_STATE_INVALID") from error
    try:
        metadata = os.fstat(descriptor)
        if (
            not stat.S_ISREG(metadata.st_mode)
            or metadata.st_size <= 0
            or metadata.st_size > _MAX_STATUS_BYTES
        ):
            raise _invalid_state()
        chunks: list[bytes] = []
        remaining = metadata.st_size + 1
        while remaining > 0:
            chunk = os.read(descriptor, remaining)
            if not chunk:
                break
            chunks.append(chunk)
            remaining -= len(chunk)
        data = b"".join(chunks)
        if len(data) != metadata.st_size or len(data) > _MAX_STATUS_BYTES:
            raise _invalid_state()
        return data
    except OSError as error:
        raise UpdateStatusError("STATUS_STATE_INVALID") from error
    finally:
        os.close(descriptor)


def read_status(path: Path) -> StatusDocument | None:
    """Read and strictly validate an absent-or-safe prior status document."""
    target = _canonical_target(path)
    try:
        metadata = target.lstat()
    except FileNotFoundError:
        return None
    except OSError as error:
        raise UpdateStatusError("STATUS_STATE_INVALID") from error
    if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISREG(metadata.st_mode):
        raise UpdateStatusError("STATUS_STATE_INVALID")
    try:
        value = json.loads(
            _read_regular(target).decode("utf-8", errors="strict"),
            object_pairs_hook=_reject_duplicate_keys,
        )
    except UpdateStatusError:
        raise
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise UpdateStatusError("STATUS_STATE_INVALID") from error
    return validate_status_document(value)


def canonical_status_bytes(document: StatusDocument) -> bytes:
    """Serialize one validated canonical compact document plus one LF."""
    validated = validate_status_document(document)
    return (
        json.dumps(
            validated,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        ).encode("utf-8")
        + b"\n"
    )


def _write(stream: IO[bytes], data: bytes) -> None:
    if stream.write(data) != len(data):
        raise OSError("incomplete status write")


def _flush(stream: IO[bytes]) -> None:
    stream.flush()


def _sync_file(descriptor: int) -> None:
    os.fsync(descriptor)


def _write_temp(stream: IO[bytes], data: bytes) -> None:
    _write(stream, data)
    _flush(stream)
    _sync_file(stream.fileno())


def _replace(source: Path, target: Path) -> None:
    source.replace(target)


def _sync_directory(path: Path) -> None:
    flags = os.O_RDONLY
    if hasattr(os, "O_DIRECTORY"):
        flags |= os.O_DIRECTORY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    descriptor = os.open(path, flags)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def write_status(path: Path, document: StatusDocument) -> None:
    """Atomically replace one caller-selected status file beside its temp."""
    target = _canonical_target(path)
    data = canonical_status_bytes(document)
    read_status(target)
    descriptor: int | None = None
    temporary: Path | None = None
    replaced = False
    try:
        descriptor, raw_temporary = tempfile.mkstemp(
            prefix=".update-status.",
            suffix=".tmp",
            dir=target.parent,
        )
        temporary = Path(raw_temporary)
        metadata = os.fstat(descriptor)
        if not stat.S_ISREG(metadata.st_mode):
            raise OSError("status temporary file is not regular")
        with os.fdopen(descriptor, "wb", closefd=True) as stream:
            descriptor = None
            _write_temp(stream, data)
        _replace(temporary, target)
        replaced = True
        _sync_directory(target.parent)
    except (OSError, UpdateStatusError) as error:
        raise UpdateStatusError("STATUS_WRITE_FAILED") from error
    finally:
        if descriptor is not None:
            with suppress(OSError):
                os.close(descriptor)
        if temporary is not None and not replaced:
            with suppress(OSError):
                temporary.unlink()
