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
from typing import NoReturn

import pytest

from bangumi_staff_stats_updater import __version__, cli
from bangumi_staff_stats_updater.archive_contract import (
    ContractExpectationError,
    ContractInputError,
)
from bangumi_staff_stats_updater.producer.model import ProducerError
from bangumi_staff_stats_updater.producer.service import ProduceResult


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
) -> None:
    observed: list[object] = []

    def succeed(request: object) -> ProduceResult:
        observed.append(request)
        return ProduceResult(
            "published",
            "dv1-" + ("a" * 64),
            "sha256:" + ("b" * 64),
            "sha256:" + ("c" * 64),
        )

    monkeypatch.setattr(cli, "produce", succeed)
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
        "--generated-at",
        "2026-07-25T00:00:00Z",
    ]
    status, stdout, stderr = _invoke(args, capsys)
    assert status == 0
    assert stderr == ""
    assert len(stdout.encode()) <= 512
    assert json.loads(stdout) == {
        "code": "ARCHIVE_READY",
        "dataVersion": "dv1-" + ("a" * 64),
        "manifestDigest": "sha256:" + ("b" * 64),
        "sqliteDigest": "sha256:" + ("c" * 64),
        "status": "published",
    }
    assert len(observed) == 1


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
) -> None:
    def fail(_request: object) -> NoReturn:
        raise ProducerError("SOURCE_DIGEST_MISMATCH", evidence="/private/source")

    monkeypatch.setattr(cli, "produce", fail)
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
        ],
        capsys,
    )
    assert status == 1
    assert stdout == ""
    assert stderr == '{"code":"SOURCE_DIGEST_MISMATCH","status":"error"}\n'
    assert "/private" not in stderr


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
    for module_name in (
        "bangumi_staff_stats_updater",
        "bangumi_staff_stats_updater.archive_contract",
        "bangumi_staff_stats_updater.cli",
        "bangumi_staff_stats_updater.__main__",
        "bangumi_staff_stats_updater.producer.acquisition",
        "bangumi_staff_stats_updater.producer.builder",
        "bangumi_staff_stats_updater.producer.manifest",
        "bangumi_staff_stats_updater.producer.service",
        "bangumi_staff_stats_updater.producer.staging",
    ):
        sys.modules.pop(module_name, None)
    importlib.import_module("bangumi_staff_stats_updater")
    importlib.import_module("bangumi_staff_stats_updater.archive_contract")
    importlib.import_module("bangumi_staff_stats_updater.cli")
    importlib.import_module("bangumi_staff_stats_updater.__main__")

    assert calls == []
    assert dict(os.environ) == environment
    assert tuple(tmp_path.iterdir()) == before
