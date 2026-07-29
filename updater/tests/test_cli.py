"""Deterministic CLI and import-purity tests."""

from __future__ import annotations

import importlib
import json
import logging
import os
import subprocess
import sys
import threading
from collections.abc import Callable
from pathlib import Path
from typing import NoReturn, cast

import pytest

from bangumi_staff_stats_updater import __version__, cli
from bangumi_staff_stats_updater.archive_contract import (
    ContractExpectationError,
    ContractInputError,
)
from bangumi_staff_stats_updater.producer.model import ProducerError
from bangumi_staff_stats_updater.producer.service import (
    PhaseObserver,
    ProduceRequest,
    ProduceResult,
)


def _invoke(
    args: list[str],
    capsys: pytest.CaptureFixture[str],
) -> tuple[int, str, str]:
    status = cli.main(args)
    output = capsys.readouterr()
    return status, output.out, output.err


def test_version_is_exact(capsys: pytest.CaptureFixture[str]) -> None:
    assert __version__ == "0.1.0"
    assert _invoke(["--version"], capsys) == (0, "bgmss-updater 0.1.0\n", "")


def test_help_is_deterministic_and_lists_only_terminating_commands(
    capsys: pytest.CaptureFixture[str],
) -> None:
    first = _invoke(["--help"], capsys)
    second = _invoke(["--help"], capsys)

    assert first == second
    assert first[0] == 0
    assert first[2] == ""
    assert len(first[1].encode()) <= 512
    assert "doctor" in first[1]
    assert "contract-check" in first[1]
    assert "produce" in first[1]
    for forbidden in ("build", "publish", "activate", "serve", "watch", "daemon", "schedule"):
        assert forbidden not in first[1]


@pytest.mark.parametrize(
    "command",
    [["doctor", "--help"], ["contract-check", "--help"], ["produce", "--help"]],
)
def test_subcommand_help_is_bounded(
    command: list[str],
    capsys: pytest.CaptureFixture[str],
) -> None:
    status, stdout, stderr = _invoke(command, capsys)
    assert status == 0
    assert stderr == ""
    assert len(stdout.encode()) <= 1024


def test_doctor_is_exact(capsys: pytest.CaptureFixture[str]) -> None:
    assert _invoke(["doctor"], capsys) == (
        0,
        '{"code":"FOUNDATION_READY","status":"ok","version":"0.1.0"}\n',
        "",
    )


def test_contract_check_success(
    contracts_root: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    assert _invoke(
        ["contract-check", "--contracts-root", str(contracts_root)],
        capsys,
    ) == (0, '{"code":"VALID","status":"ok"}\n', "")


def test_produce_success_is_bounded_and_exact(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
) -> None:
    observed: list[object] = []

    def succeed(request: object, **_kwargs: object) -> ProduceResult:
        observed.append(request)
        return ProduceResult(
            "published",
            "dv1-" + ("a" * 64),
            "sha256:" + ("b" * 64),
            "sha256:" + ("c" * 64),
        )

    monkeypatch.setattr(cli, "produce", succeed)
    monkeypatch.setattr(cli, "_new_run_id", lambda: "11111111-1111-4111-8111-111111111111")
    monkeypatch.setattr(cli, "_utc_now", lambda: "2026-07-25T00:00:02Z")
    monkeypatch.setenv("BGMSS_HTTPS_PROXY", "http://proxy.internal:7897")
    clock = iter([10.0, 12.0])
    monkeypatch.setattr(cli, "_monotonic", lambda: next(clock))
    status_file = tmp_path / "update-status.json"
    args = [
        "produce",
        "--output-root",
        "/archive",
        "--contracts-root",
        "/contracts",
        "--catalog-config",
        "/catalog.json",
        "--common-commit",
        "d" * 40,
        "--archive-smoke",
        "/archive-smoke",
        "--status-file",
        str(status_file),
        "--generated-at",
        "2026-07-25T00:00:00Z",
    ]
    status, stdout, stderr = _invoke(args, capsys)
    assert status == 0
    assert stderr == ""
    events = [json.loads(line) for line in stdout.splitlines()]
    assert events == [
        {
            "event": "updater_started",
            "run_id": "11111111-1111-4111-8111-111111111111",
        },
        {
            "dataVersion": "dv1-" + ("a" * 64),
            "duration_seconds": 2.0,
            "event": "update_published",
            "run_id": "11111111-1111-4111-8111-111111111111",
        },
    ]
    status_document = json.loads(status_file.read_bytes())
    assert status_document["last_attempt"] == status_document["last_success"]
    assert status_document["last_attempt"] == {
        "dataVersion": "dv1-" + ("a" * 64),
        "duration_seconds": 2.0,
        "error_code": None,
        "phase": "complete",
        "status": "published",
        "time": "2026-07-25T00:00:02Z",
    }
    assert len(observed) == 1
    assert cast(ProduceRequest, observed[0]).https_proxy == "http://proxy.internal:7897"


@pytest.mark.parametrize(
    "args",
    [
        [],
        ["unknown"],
        ["contract-check"],
        ["produce"],
        ["contract-check", "--contracts-r", "secret-value"],
        ["build"],
        ["publish"],
        ["activate"],
        ["serve"],
        ["watch"],
        ["daemon"],
        ["schedule"],
    ],
)
def test_usage_errors_are_sanitized(
    args: list[str],
    capsys: pytest.CaptureFixture[str],
) -> None:
    assert _invoke(args, capsys) == (
        2,
        "",
        '{"code":"USAGE_ERROR","status":"error"}\n',
    )


@pytest.mark.parametrize(
    ("exception", "expected"),
    [
        (
            ContractInputError("/secret/contracts"),
            '{"code":"CONTRACT_INPUT_INVALID","status":"error"}\n',
        ),
        (
            ContractExpectationError("raw fixture content"),
            '{"code":"CONTRACT_CHECK_FAILED","status":"error"}\n',
        ),
        (
            RuntimeError("traceback secret"),
            '{"code":"INTERNAL_ERROR","status":"error"}\n',
        ),
    ],
)
def test_contract_failures_are_redacted_and_bounded(
    exception: Exception,
    expected: str,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    def fail(_root: Path) -> NoReturn:
        raise exception

    monkeypatch.setattr(cli, "check_contracts", fail)
    status, stdout, stderr = _invoke(
        ["contract-check", "--contracts-root", "/secret/contracts"],
        capsys,
    )
    assert status in {1, 70}
    assert stdout == ""
    assert stderr == expected
    assert len(stderr.encode()) <= 256
    assert "secret" not in stderr
    assert "traceback" not in stderr


def test_producer_failure_is_redacted_and_bounded(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
) -> None:
    def fail(_request: object, **_kwargs: object) -> NoReturn:
        raise ProducerError("SOURCE_DIGEST_MISMATCH", evidence="/private/source")

    monkeypatch.setattr(cli, "produce", fail)
    monkeypatch.setattr(cli, "_new_run_id", lambda: "22222222-2222-4222-8222-222222222222")
    monkeypatch.setattr(cli, "_utc_now", lambda: "2026-07-25T00:00:01Z")
    clock = iter([20.0, 21.0])
    monkeypatch.setattr(cli, "_monotonic", lambda: next(clock))
    status_file = tmp_path / "update-status.json"
    status, stdout, stderr = _invoke(
        [
            "produce",
            "--output-root",
            "/archive",
            "--contracts-root",
            "/contracts",
            "--catalog-config",
            "/catalog.json",
            "--common-commit",
            "d" * 40,
            "--archive-smoke",
            "/archive-smoke",
            "--status-file",
            str(status_file),
        ],
        capsys,
    )
    assert status == 1
    assert json.loads(stdout) == {
        "event": "updater_started",
        "run_id": "22222222-2222-4222-8222-222222222222",
    }
    assert json.loads(stderr) == {
        "duration_seconds": 1.0,
        "error_code": "SOURCE_DIGEST_MISMATCH",
        "event": "update_failed",
        "phase": "preflight",
        "run_id": "22222222-2222-4222-8222-222222222222",
    }
    status_document = json.loads(status_file.read_bytes())
    assert status_document["last_success"] is None
    assert status_document["last_attempt"]["error_code"] == "SOURCE_DIGEST_MISMATCH"
    assert "/private" not in stderr


def test_invalid_dedicated_proxy_is_sanitized_before_staging(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
) -> None:
    credentialed_proxy = "http://user:password@private-proxy.internal:7897"
    monkeypatch.setenv("BGMSS_HTTPS_PROXY", credentialed_proxy)
    monkeypatch.setattr(cli, "_new_run_id", lambda: "22222222-2222-4222-8222-222222222223")
    monkeypatch.setattr(cli, "_utc_now", lambda: "2026-07-25T00:00:01Z")
    monkeypatch.setattr(cli, "_monotonic", iter([20.0, 21.0]).__next__)
    status_file = tmp_path / "update-status.json"

    status, stdout, stderr = _invoke(_produce_arguments(status_file), capsys)

    assert status == 1
    assert json.loads(stdout)["event"] == "updater_started"
    assert json.loads(stderr)["error_code"] == "HTTPS_PROXY_INVALID"
    assert credentialed_proxy not in stdout
    assert credentialed_proxy not in stderr
    document = json.loads(status_file.read_bytes())
    assert document["last_attempt"]["error_code"] == "HTTPS_PROXY_INVALID"
    assert not tuple(tmp_path.glob(".bgmss-stage-*"))


def _produce_arguments(status_file: Path) -> list[str]:
    return [
        "produce",
        "--output-root",
        "/archive",
        "--contracts-root",
        "/contracts",
        "--catalog-config",
        "/catalog.json",
        "--common-commit",
        "d" * 40,
        "--archive-smoke",
        "/archive-smoke",
        "--status-file",
        str(status_file),
    ]


def test_produce_request_ignores_all_generic_proxy_environment(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.delenv("BGMSS_HTTPS_PROXY", raising=False)
    for scheme in ("http", "https", "all", "no"):
        monkeypatch.setenv(f"{scheme}_proxy", "http://ambient.invalid:1")
        monkeypatch.setenv(f"{scheme.upper()}_PROXY", "http://ambient.invalid:2")
    namespace = cli._parser().parse_args(_produce_arguments(tmp_path / "update-status.json"))
    request = cli._produce_request(namespace)
    assert request.https_proxy is None


def test_no_change_emits_the_exact_terminal_event(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
) -> None:
    version = "dv1-" + ("e" * 64)

    def no_change(_request: object, **_kwargs: object) -> ProduceResult:
        return ProduceResult(
            "no-change",
            version,
            "sha256:" + ("b" * 64),
            "sha256:" + ("c" * 64),
        )

    monkeypatch.setattr(cli, "produce", no_change)
    monkeypatch.setattr(cli, "_new_run_id", lambda: "33333333-3333-4333-8333-333333333333")
    monkeypatch.setattr(cli, "_utc_now", lambda: "2026-07-25T00:00:03Z")
    clock = iter([30.0, 33.0])
    monkeypatch.setattr(cli, "_monotonic", lambda: next(clock))
    target = tmp_path / "update-status.json"

    status, stdout, stderr = _invoke(_produce_arguments(target), capsys)

    assert status == 0
    assert stderr == ""
    assert [json.loads(line)["event"] for line in stdout.splitlines()] == [
        "updater_started",
        "update_no_change",
    ]
    document = json.loads(target.read_bytes())
    assert document["last_attempt"] == document["last_success"]
    assert document["last_attempt"]["status"] == "no-change"


def test_phase_events_use_only_the_closed_whitelist_and_one_run_id(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
) -> None:
    version = "dv1-" + ("7" * 64)

    def publish(_request: object, **kwargs: object) -> ProduceResult:
        observer = cast(PhaseObserver, kwargs["observer"])
        observer.phase_started("acquisition")
        observer.phase_completed(
            "acquisition",
            0.5,
            {
                "source_release": "dump-2026-07-21.210441Z",
                "source_digest": "sha256:" + ("a" * 64),
            },
        )
        observer.phase_started("build")
        observer.phase_completed(
            "build",
            1.5,
            {
                "input_rows": 12,
                "output_rows": 10,
                "quality_summary": {"NO_CHARACTERS": 2},
                "dataVersion": version,
            },
        )
        return ProduceResult(
            "published",
            version,
            "sha256:" + ("b" * 64),
            "sha256:" + ("c" * 64),
        )

    run_id = "66666666-6666-4666-8666-666666666666"
    monkeypatch.setattr(cli, "produce", publish)
    monkeypatch.setattr(cli, "_new_run_id", lambda: run_id)
    monkeypatch.setattr(cli, "_utc_now", lambda: "2026-07-25T00:00:06Z")
    clock = iter([60.0, 66.0])
    monkeypatch.setattr(cli, "_monotonic", lambda: next(clock))

    status, stdout, stderr = _invoke(
        _produce_arguments(tmp_path / "update-status.json"),
        capsys,
    )

    assert status == 0
    assert stderr == ""
    events = [json.loads(line) for line in stdout.splitlines()]
    assert [event["event"] for event in events] == [
        "updater_started",
        "phase_completed",
        "phase_completed",
        "update_published",
    ]
    assert {event["run_id"] for event in events} == {run_id}
    allowed = {
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
    assert all(set(event).issubset(allowed) for event in events)
    assert "/archive" not in stdout
    assert "manifestDigest" not in stdout


def test_cancellation_is_130_and_preserves_prior_success(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
) -> None:
    version = "dv1-" + ("f" * 64)
    target = tmp_path / "update-status.json"
    previous_success = {
        "time": "2026-07-24T00:00:00Z",
        "status": "published",
        "phase": "complete",
        "duration_seconds": 8,
        "dataVersion": version,
        "error_code": None,
    }
    target.write_text(
        json.dumps(
            {
                "last_attempt": previous_success,
                "last_success": previous_success,
            },
            separators=(",", ":"),
        )
        + "\n"
    )

    def cancel(_request: object, **kwargs: object) -> NoReturn:
        observer = cast(PhaseObserver, kwargs["observer"])
        observer.phase_started("build")
        raise ProducerError("CANCELED", evidence="/private/cancel")

    monkeypatch.setattr(cli, "produce", cancel)
    monkeypatch.setattr(cli, "_new_run_id", lambda: "44444444-4444-4444-8444-444444444444")
    monkeypatch.setattr(cli, "_utc_now", lambda: "2026-07-25T00:00:04Z")
    clock = iter([40.0, 44.0])
    monkeypatch.setattr(cli, "_monotonic", lambda: next(clock))

    status, stdout, stderr = _invoke(_produce_arguments(target), capsys)

    assert status == 130
    assert [json.loads(line)["event"] for line in stdout.splitlines()] == ["updater_started"]
    failure = json.loads(stderr)
    assert failure["event"] == "update_failed"
    assert failure["phase"] == "build"
    assert failure["error_code"] == "CANCELED"
    document = json.loads(target.read_bytes())
    assert document["last_attempt"]["status"] == "canceled"
    assert document["last_success"] == previous_success


def test_phase_event_sink_failure_never_becomes_a_published_terminal_event(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
) -> None:
    version = "dv1-" + ("9" * 64)

    def publish(_request: object, **kwargs: object) -> ProduceResult:
        observer = cast(PhaseObserver, kwargs["observer"])
        observer.phase_started("publication")
        observer.phase_completed("publication", 1.0, {"dataVersion": version})
        return ProduceResult(
            "published",
            version,
            "sha256:" + ("b" * 64),
            "sha256:" + ("c" * 64),
        )

    original_emit = cli._emit_event

    def fail_phase(document: dict[str, object], *, error: bool) -> None:
        if document["event"] == "phase_completed":
            raise OSError("closed stdout")
        original_emit(document, error=error)

    monkeypatch.setattr(cli, "produce", publish)
    monkeypatch.setattr(cli, "_emit_event", fail_phase)
    monkeypatch.setattr(cli, "_new_run_id", lambda: "55555555-5555-4555-8555-555555555555")
    monkeypatch.setattr(cli, "_utc_now", lambda: "2026-07-25T00:00:05Z")
    clock = iter([50.0, 55.0])
    monkeypatch.setattr(cli, "_monotonic", lambda: next(clock))
    target = tmp_path / "update-status.json"

    status, stdout, stderr = _invoke(_produce_arguments(target), capsys)

    assert status == 1
    assert "update_published" not in stdout
    assert json.loads(stderr)["error_code"] == "EVENT_WRITE_FAILED"
    assert json.loads(target.read_bytes())["last_attempt"]["status"] == "failed"


def test_terminal_event_sink_failure_is_recorded_without_reversing_archive_result(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
) -> None:
    version = "dv1-" + ("8" * 64)
    result = ProduceResult(
        "published",
        version,
        "sha256:" + ("b" * 64),
        "sha256:" + ("c" * 64),
    )
    original_emit = cli._emit_event

    def fail_terminal(document: dict[str, object], *, error: bool) -> None:
        if document["event"] == "update_published":
            raise OSError("closed stdout")
        original_emit(document, error=error)

    monkeypatch.setattr(cli, "produce", lambda *_args, **_kwargs: result)
    monkeypatch.setattr(cli, "_emit_event", fail_terminal)
    monkeypatch.setattr(cli, "_new_run_id", lambda: "88888888-8888-4888-8888-888888888888")
    monkeypatch.setattr(cli, "_utc_now", lambda: "2026-07-25T00:00:08Z")
    clock = iter([80.0, 88.0, 88.0])
    monkeypatch.setattr(cli, "_monotonic", lambda: next(clock))
    target = tmp_path / "update-status.json"

    status, stdout, stderr = _invoke(_produce_arguments(target), capsys)

    assert status == 1
    assert [json.loads(line)["event"] for line in stdout.splitlines()] == ["updater_started"]
    assert json.loads(stderr)["error_code"] == "EVENT_WRITE_FAILED"
    document = json.loads(target.read_bytes())
    assert document["last_attempt"]["status"] == "failed"
    assert document["last_attempt"]["dataVersion"] == version
    assert document["last_success"] is None


def test_missing_phase_duration_is_omitted_without_losing_the_phase_event(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
) -> None:
    version = "dv1-" + ("6" * 64)

    def publish(_request: object, **kwargs: object) -> ProduceResult:
        observer = cast(PhaseObserver, kwargs["observer"])
        observer.phase_started("identity")
        observer.phase_completed("identity", None, {"dataVersion": version})
        return ProduceResult(
            "published",
            version,
            "sha256:" + ("b" * 64),
            "sha256:" + ("c" * 64),
        )

    monkeypatch.setattr(cli, "produce", publish)
    monkeypatch.setattr(cli, "_new_run_id", lambda: "66666666-6666-4666-8666-666666666667")
    monkeypatch.setattr(cli, "_utc_now", lambda: "2026-07-25T00:00:09Z")
    clock = iter([90.0, 99.0])
    monkeypatch.setattr(cli, "_monotonic", lambda: next(clock))

    status, stdout, stderr = _invoke(
        _produce_arguments(tmp_path / "update-status.json"),
        capsys,
    )

    assert status == 0
    assert stderr == ""
    phase_event = [json.loads(line) for line in stdout.splitlines()][1]
    assert phase_event["event"] == "phase_completed"
    assert "duration_seconds" not in phase_event


def test_invalid_phase_duration_becomes_a_stable_lifecycle_failure(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
) -> None:
    version = "dv1-" + ("5" * 64)

    def publish(_request: object, **kwargs: object) -> ProduceResult:
        observer = cast(PhaseObserver, kwargs["observer"])
        observer.phase_started("publication")
        observer.phase_completed("publication", float("nan"), {"dataVersion": version})
        return ProduceResult(
            "published",
            version,
            "sha256:" + ("b" * 64),
            "sha256:" + ("c" * 64),
        )

    monkeypatch.setattr(cli, "produce", publish)
    monkeypatch.setattr(cli, "_new_run_id", lambda: "55555555-5555-4555-8555-555555555556")
    monkeypatch.setattr(cli, "_utc_now", lambda: "2026-07-25T00:00:10Z")
    clock = iter([100.0, 110.0])
    monkeypatch.setattr(cli, "_monotonic", lambda: next(clock))
    target = tmp_path / "update-status.json"

    status, stdout, stderr = _invoke(_produce_arguments(target), capsys)

    assert status == 1
    assert [json.loads(line)["event"] for line in stdout.splitlines()] == ["updater_started"]
    assert json.loads(stderr)["error_code"] == "EVENT_DATA_INVALID"
    assert json.loads(target.read_bytes())["last_attempt"]["error_code"] == "EVENT_DATA_INVALID"


@pytest.mark.parametrize("bad_clock", [float("nan"), float("inf"), -1.0])
def test_terminal_clock_fault_stays_in_the_lifecycle_stream(
    bad_clock: float,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(cli, "_new_run_id", lambda: "77777777-7777-4777-8777-777777777777")
    monkeypatch.setattr(cli, "_monotonic", lambda: bad_clock)
    target = tmp_path / "update-status.json"

    status, stdout, stderr = _invoke(_produce_arguments(target), capsys)

    assert status == 1
    assert [json.loads(line)["event"] for line in stdout.splitlines()] == ["updater_started"]
    failure = json.loads(stderr)
    assert failure["event"] == "update_failed"
    assert failure["error_code"] == "STATUS_CLOCK_INVALID"
    assert "duration_seconds" not in failure
    assert not target.exists()


def test_terminal_clock_exception_stays_in_the_lifecycle_stream(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
) -> None:
    def fail_clock() -> float:
        raise RuntimeError("private clock failure")

    monkeypatch.setattr(cli, "_new_run_id", lambda: "99999999-9999-4999-8999-999999999999")
    monkeypatch.setattr(cli, "_monotonic", fail_clock)
    target = tmp_path / "update-status.json"

    status, stdout, stderr = _invoke(_produce_arguments(target), capsys)

    assert status == 1
    assert [json.loads(line)["event"] for line in stdout.splitlines()] == ["updater_started"]
    failure = json.loads(stderr)
    assert failure["event"] == "update_failed"
    assert failure["error_code"] == "STATUS_CLOCK_INVALID"
    assert "duration_seconds" not in failure
    assert "private" not in stderr
    assert not target.exists()


def test_wall_clock_exception_stays_in_the_lifecycle_stream(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
) -> None:
    version = "dv1-" + ("4" * 64)
    monkeypatch.setattr(
        cli,
        "produce",
        lambda *_args, **_kwargs: ProduceResult(
            "published",
            version,
            "sha256:" + ("b" * 64),
            "sha256:" + ("c" * 64),
        ),
    )
    monkeypatch.setattr(cli, "_new_run_id", lambda: "44444444-4444-4444-8444-444444444445")
    monkeypatch.setattr(cli, "_monotonic", iter([120.0, 124.0, 124.0]).__next__)

    def fail_wall_clock() -> str:
        raise RuntimeError("private wall clock failure")

    monkeypatch.setattr(cli, "_utc_now", fail_wall_clock)
    target = tmp_path / "update-status.json"

    status, stdout, stderr = _invoke(_produce_arguments(target), capsys)

    assert status == 1
    assert [json.loads(line)["event"] for line in stdout.splitlines()] == ["updater_started"]
    failure = json.loads(stderr)
    assert failure["event"] == "update_failed"
    assert failure["error_code"] == "STATUS_CLOCK_INVALID"
    assert "private" not in stderr
    assert not target.exists()


def test_invalid_real_root_is_redacted(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    missing = tmp_path / "private-secret"
    assert _invoke(
        ["contract-check", "--contracts-root", str(missing)],
        capsys,
    ) == (
        1,
        "",
        '{"code":"CONTRACT_INPUT_INVALID","status":"error"}\n',
    )


def test_imports_do_not_start_runtime_work(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    calls: list[str] = []

    def forbidden(*_args: object, **_kwargs: object) -> NoReturn:
        calls.append("called")
        raise AssertionError

    guarded: tuple[tuple[object, str, Callable[..., object]], ...] = (
        (subprocess, "Popen", forbidden),
        (subprocess, "run", forbidden),
        (logging, "basicConfig", forbidden),
        (threading.Thread, "start", forbidden),
    )
    for owner, name, replacement in guarded:
        monkeypatch.setattr(owner, name, replacement)

    environment = dict(os.environ)
    before = tuple(tmp_path.iterdir())
    module_names = (
        "bangumi_staff_stats_updater",
        "bangumi_staff_stats_updater.archive_contract",
        "bangumi_staff_stats_updater.cli",
        "bangumi_staff_stats_updater.__main__",
        "bangumi_staff_stats_updater.producer",
        "bangumi_staff_stats_updater.producer.acquisition",
        "bangumi_staff_stats_updater.producer.builder",
        "bangumi_staff_stats_updater.producer.manifest",
        "bangumi_staff_stats_updater.producer.service",
        "bangumi_staff_stats_updater.producer.staging",
    )
    original_modules = {module_name: sys.modules.get(module_name) for module_name in module_names}
    try:
        for module_name in reversed(module_names):
            sys.modules.pop(module_name, None)
        importlib.import_module("bangumi_staff_stats_updater")
        importlib.import_module("bangumi_staff_stats_updater.archive_contract")
        importlib.import_module("bangumi_staff_stats_updater.cli")
        importlib.import_module("bangumi_staff_stats_updater.__main__")

        assert calls == []
        assert dict(os.environ) == environment
        assert tuple(tmp_path.iterdir()) == before
    finally:
        for module_name in reversed(module_names):
            sys.modules.pop(module_name, None)
        for module_name, original in original_modules.items():
            if original is not None:
                sys.modules[module_name] = original
        for module_name in sorted(module_names, key=lambda value: value.count(".")):
            parent_name, separator, child_name = module_name.rpartition(".")
            if not separator:
                continue
            parent = sys.modules.get(parent_name)
            original = original_modules[module_name]
            if parent is None:
                continue
            if original is None:
                current = getattr(parent, child_name, None)
                if getattr(current, "__name__", None) == module_name:
                    delattr(parent, child_name)
            else:
                setattr(parent, child_name, original)
