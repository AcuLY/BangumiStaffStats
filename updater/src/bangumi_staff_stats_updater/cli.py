"""Terminating command-line interface for immutable Archive production."""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
import time
import uuid
from collections.abc import Mapping, Sequence
from contextlib import suppress
from datetime import UTC, datetime
from pathlib import Path
from typing import NoReturn

from . import __version__
from .archive_contract import ContractExpectationError, ContractInputError, check_contracts
from .producer.model import ProducerError
from .producer.service import PhaseObserver, ProduceRequest, produce
from .update_status import (
    StatusDocument,
    TerminalStatus,
    UpdateStatusError,
    next_status_document,
    read_status,
    terminal_record,
    write_status,
)

_PROGRAM = "bgmss-updater"
_EVENT_FIELDS = frozenset(
    {
        "event",
        "run_id",
        "source_release",
        "source_digest",
        "phase",
        "duration_seconds",
        "input_rows",
        "output_rows",
        "quality_summary",
        "dataVersion",
        "error_code",
    }
)
_ERROR_CODE = re.compile(r"^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$")
_DATA_VERSION = re.compile(r"^dv1-[0-9a-f]{64}$")
_DIGEST = re.compile(r"^sha256:[0-9a-f]{64}$")
_SOURCE_RELEASE = re.compile(r"^dump-[0-9]{4}-[0-9]{2}-[0-9]{2}\.[0-9]{6}Z$")
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
_EVENT_LAYOUTS = {
    "updater_started": (frozenset({"event", "run_id"}), frozenset({"event", "run_id"})),
    "phase_completed": (
        frozenset({"event", "run_id", "phase"}),
        _EVENT_FIELDS - {"error_code"},
    ),
    "update_no_change": (
        frozenset({"event", "run_id", "duration_seconds", "dataVersion"}),
        frozenset({"event", "run_id", "duration_seconds", "dataVersion"}),
    ),
    "update_published": (
        frozenset({"event", "run_id", "duration_seconds", "dataVersion"}),
        frozenset({"event", "run_id", "duration_seconds", "dataVersion"}),
    ),
    "update_failed": (
        frozenset({"event", "run_id", "phase", "error_code"}),
        frozenset(
            {
                "event",
                "run_id",
                "phase",
                "duration_seconds",
                "dataVersion",
                "error_code",
            }
        ),
    ),
}


class _ParserExit(Exception):
    def __init__(self, status: int, message: str | None) -> None:
        super().__init__()
        self.status = status
        self.message = message


class _UsageError(Exception):
    pass


class _Parser(argparse.ArgumentParser):
    def exit(self, status: int = 0, message: str | None = None) -> NoReturn:
        raise _ParserExit(status, message)

    def error(self, message: str) -> NoReturn:
        del message
        raise _UsageError from None


def _parser() -> _Parser:
    parser = _Parser(prog=_PROGRAM, allow_abbrev=False)
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    subcommands = parser.add_subparsers(dest="command", required=True, parser_class=_Parser)
    subcommands.add_parser("doctor", allow_abbrev=False)
    contract = subcommands.add_parser(
        "contract-check",
        allow_abbrev=False,
    )
    contract.add_argument("--contracts-root", required=True)
    producer = subcommands.add_parser("produce", allow_abbrev=False)
    producer.add_argument("--output-root", required=True)
    producer.add_argument("--contracts-root", required=True)
    producer.add_argument("--catalog-config", required=True)
    producer.add_argument("--common-commit", required=True)
    producer.add_argument("--archive-smoke", required=True)
    producer.add_argument("--status-file", required=True)
    producer.add_argument("--generated-at")
    return parser


def _emit(code: str, status: str, *, error: bool) -> None:
    output = json.dumps({"code": code, "status": status}, sort_keys=True, separators=(",", ":"))
    encoded = f"{output}\n"
    if len(encoded.encode()) > 256:
        raise RuntimeError
    stream = sys.stderr if error else sys.stdout
    stream.write(encoded)


def _is_nonnegative_number(value: object) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
        and value >= 0
    )


def _is_nonnegative_integer(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def _valid_event(document: dict[str, object]) -> bool:
    event = document.get("event")
    if not isinstance(event, str) or event not in _EVENT_LAYOUTS:
        return False
    required, permitted = _EVENT_LAYOUTS[event]
    if not required.issubset(document) or not set(document).issubset(permitted):
        return False
    run_id = document.get("run_id")
    try:
        if not isinstance(run_id, str) or str(uuid.UUID(run_id)) != run_id:
            return False
    except ValueError:
        return False
    phase = document.get("phase")
    if "phase" in document and (not isinstance(phase, str) or phase not in _PHASES):
        return False
    duration = document.get("duration_seconds")
    if "duration_seconds" in document and not _is_nonnegative_number(duration):
        return False
    for field in ("input_rows", "output_rows"):
        if field in document and not _is_nonnegative_integer(document[field]):
            return False
    release = document.get("source_release")
    if "source_release" in document and (
        not isinstance(release, str) or _SOURCE_RELEASE.fullmatch(release) is None
    ):
        return False
    digest = document.get("source_digest")
    if "source_digest" in document and (
        not isinstance(digest, str) or _DIGEST.fullmatch(digest) is None
    ):
        return False
    data_version = document.get("dataVersion")
    if "dataVersion" in document and (
        not isinstance(data_version, str) or _DATA_VERSION.fullmatch(data_version) is None
    ):
        return False
    error_code = document.get("error_code")
    if "error_code" in document and _stable_code(error_code, "") != error_code:
        return False
    quality = document.get("quality_summary")
    return "quality_summary" not in document or (
        isinstance(quality, dict)
        and all(
            isinstance(code, str)
            and len(code) <= 64
            and _ERROR_CODE.fullmatch(code) is not None
            and _is_nonnegative_integer(count)
            for code, count in quality.items()
        )
    )


def _emit_event(document: dict[str, object], *, error: bool) -> None:
    if not _valid_event(document):
        raise RuntimeError
    output = json.dumps(
        document,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    )
    encoded = f"{output}\n"
    if len(encoded.encode()) > 4096:
        raise RuntimeError
    (sys.stderr if error else sys.stdout).write(encoded)


def _new_run_id() -> str:
    return str(uuid.uuid4())


def _utc_now() -> str:
    return datetime.now(UTC).isoformat(timespec="microseconds").replace("+00:00", "Z")


def _monotonic() -> float:
    return time.monotonic()


def _stable_code(value: object, fallback: str) -> str:
    if (
        not isinstance(value, str)
        or not value
        or len(value) > 64
        or _ERROR_CODE.fullmatch(value) is None
    ):
        return fallback
    return value


class _LifecycleObserver(PhaseObserver):
    def __init__(self, run_id: str) -> None:
        self.run_id = run_id
        self.active_phase = "preflight"
        self.data_version: str | None = None
        self.event_error: str | None = None

    def phase_started(self, phase: str) -> None:
        self.active_phase = phase

    def phase_completed(
        self,
        phase: str,
        duration_seconds: float | None,
        details: Mapping[str, object],
    ) -> None:
        bounded = dict(details)
        event = {
            **bounded,
            "event": "phase_completed",
            "run_id": self.run_id,
            "phase": phase,
        }
        if duration_seconds is not None:
            event["duration_seconds"] = duration_seconds
        data_version = event.get("dataVersion")
        if isinstance(data_version, str) and _DATA_VERSION.fullmatch(data_version) is not None:
            self.data_version = data_version
        self.active_phase = "complete" if phase == "publication" else phase
        if not _valid_event(event):
            self.event_error = "EVENT_DATA_INVALID"
            return
        try:
            _emit_event(event, error=False)
        except Exception:
            self.event_error = "EVENT_WRITE_FAILED"


def _produce_request(namespace: argparse.Namespace) -> ProduceRequest:
    return ProduceRequest(
        output_root=Path(namespace.output_root),
        contracts_root=Path(namespace.contracts_root),
        catalog_config=Path(namespace.catalog_config),
        common_commit=namespace.common_commit,
        archive_smoke=Path(namespace.archive_smoke),
        generated_at=namespace.generated_at,
    )


def _clock_reading() -> float | None:
    try:
        value = _monotonic()
    except Exception:
        return None
    return value if value >= 0 and math.isfinite(value) else None


def _terminal_duration(started: float | None) -> float | None:
    completed = _clock_reading()
    if started is None or completed is None:
        return None
    duration = completed - started
    return duration if duration >= 0 and math.isfinite(duration) else None


def _persist_terminal(
    status_file: Path,
    previous: StatusDocument | None,
    *,
    status: TerminalStatus,
    phase: str,
    duration: float,
    data_version: str | None,
    error_code: str | None,
) -> None:
    try:
        record = terminal_record(
            time=_utc_now(),
            status=status,
            phase=phase,
            duration_seconds=duration,
            data_version=data_version,
            error_code=error_code,
        )
    except Exception as error:
        raise UpdateStatusError("STATUS_CLOCK_INVALID") from error
    write_status(status_file, next_status_document(previous, record))


def _run_produce(namespace: argparse.Namespace) -> int:
    run_id = _new_run_id()
    observer = _LifecycleObserver(run_id)
    started = _clock_reading()
    status_file = Path(namespace.status_file)
    previous: StatusDocument | None = None
    try:
        _emit_event({"event": "updater_started", "run_id": run_id}, error=False)
    except Exception:
        with suppress(Exception):
            duration = _terminal_duration(started)
            _emit_event(
                {
                    "event": "update_failed",
                    "run_id": run_id,
                    "phase": "preflight",
                    "error_code": "EVENT_WRITE_FAILED",
                    **({"duration_seconds": duration} if duration is not None else {}),
                },
                error=True,
            )
        return 1
    if started is None:
        _emit_event(
            {
                "event": "update_failed",
                "run_id": run_id,
                "phase": "preflight",
                "error_code": "STATUS_CLOCK_INVALID",
            },
            error=True,
        )
        return 1
    try:
        previous = read_status(status_file)
        result = produce(
            _produce_request(namespace),
            observer=observer,
            monotonic=_monotonic,
        )
        observer.active_phase = "complete"
        observer.data_version = result.data_version
        if observer.event_error is not None:
            raise UpdateStatusError(observer.event_error)
        duration = _terminal_duration(started)
        if duration is None:
            raise UpdateStatusError("STATUS_CLOCK_INVALID")
        status: TerminalStatus = "published" if result.status == "published" else "no-change"
        event_name = "update_published" if result.status == "published" else "update_no_change"
        _persist_terminal(
            status_file,
            previous,
            status=status,
            phase="complete",
            duration=duration,
            data_version=result.data_version,
            error_code=None,
        )
        try:
            _emit_event(
                {
                    "event": event_name,
                    "run_id": run_id,
                    "duration_seconds": duration,
                    "dataVersion": result.data_version,
                },
                error=False,
            )
        except Exception as error:
            raise UpdateStatusError("EVENT_WRITE_FAILED") from error
        return 0
    except KeyboardInterrupt:
        code = "CANCELED"
        exit_status = 130
    except ProducerError as error:
        code = _stable_code(error.code, "PRODUCER_FAILED")
        exit_status = 130 if code == "CANCELED" else 1
    except UpdateStatusError as error:
        code = _stable_code(error.code, "STATUS_WRITE_FAILED")
        exit_status = 1
    except Exception:
        code = "INTERNAL_ERROR"
        exit_status = 70

    duration = _terminal_duration(started)
    if duration is None:
        code = "STATUS_CLOCK_INVALID"
        exit_status = 1
    terminal_status: TerminalStatus = "canceled" if code == "CANCELED" else "failed"
    try:
        if duration is not None and code not in {"STATUS_PATH_INVALID", "STATUS_STATE_INVALID"}:
            _persist_terminal(
                status_file,
                previous,
                status=terminal_status,
                phase=observer.active_phase,
                duration=duration,
                data_version=observer.data_version,
                error_code=code,
            )
    except UpdateStatusError as error:
        code = _stable_code(error.code, "STATUS_WRITE_FAILED")
        terminal_status = "failed"
        exit_status = 1
    _emit_event(
        {
            "event": "update_failed",
            "run_id": run_id,
            "phase": observer.active_phase,
            "error_code": code,
            **({"duration_seconds": duration} if duration is not None else {}),
            **({"dataVersion": observer.data_version} if observer.data_version is not None else {}),
        },
        error=True,
    )
    return exit_status


def main(args: Sequence[str] | None = None) -> int:
    """Run one terminating updater command and return its process status."""
    try:
        namespace = _parser().parse_args(None if args is None else list(args))
        if namespace.command == "doctor":
            output = json.dumps(
                {"code": "FOUNDATION_READY", "status": "ok", "version": __version__},
                sort_keys=True,
                separators=(",", ":"),
            )
            sys.stdout.write(f"{output}\n")
            return 0
        if namespace.command == "contract-check":
            check_contracts(Path(namespace.contracts_root))
            _emit("VALID", "ok", error=False)
            return 0
        if namespace.command == "produce":
            return _run_produce(namespace)
        raise RuntimeError
    except _ParserExit as error:
        if error.message is not None:
            sys.stdout.write(error.message)
        return error.status
    except _UsageError:
        _emit("USAGE_ERROR", "error", error=True)
        return 2
    except ContractInputError:
        _emit("CONTRACT_INPUT_INVALID", "error", error=True)
        return 1
    except ContractExpectationError:
        _emit("CONTRACT_CHECK_FAILED", "error", error=True)
        return 1
    except ProducerError as error:
        code = error.code
        if (
            not code
            or len(code) > 64
            or any(character not in "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_" for character in code)
        ):
            code = "PRODUCER_FAILED"
        _emit(code, "error", error=True)
        return 1
    except KeyboardInterrupt:
        _emit("CANCELED", "error", error=True)
        return 130
    except Exception:
        _emit("INTERNAL_ERROR", "error", error=True)
        return 70


def run() -> NoReturn:
    """Console-script wrapper."""
    raise SystemExit(main())
