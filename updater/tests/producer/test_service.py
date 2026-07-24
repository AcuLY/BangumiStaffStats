"""End-to-end inactive publication tests with injected public I/O."""

from __future__ import annotations

import hashlib
import io
import json
import os
import shutil
import sys
import time
import zipfile
from collections.abc import Callable
from dataclasses import replace
from pathlib import Path
from typing import cast

import pytest

from bangumi_staff_stats_updater.producer import service as service_module
from bangumi_staff_stats_updater.producer.acquisition import LATEST_URL
from bangumi_staff_stats_updater.producer.model import (
    ARCHIVE_MEMBER_NAMES,
    ProducerError,
)
from bangumi_staff_stats_updater.producer.service import (
    ProduceRequest,
    produce,
)


def _digest(data: bytes) -> str:
    return f"sha256:{hashlib.sha256(data).hexdigest()}"


def _case(contracts_root: Path) -> dict[str, object]:
    path = contracts_root / "goldens" / "archive" / "producer" / "cases" / "valid-seven-source.json"
    return cast(dict[str, object], json.loads(path.read_bytes()))


def _archive(case: dict[str, object]) -> bytes:
    inputs = cast(dict[str, object], case["inputs"])
    sources = {
        cast(str, item["name"]): cast(str, item["bytesUtf8"]).encode()
        for item in cast(list[dict[str, object]], inputs["sources"])
    }
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name in sorted(ARCHIVE_MEMBER_NAMES):
            archive.writestr(name, sources.get(name, b""))
    return output.getvalue()


class _Client:
    def __init__(self, archive: bytes, common: bytes) -> None:
        self.archive = archive
        self.common = common
        name = "dump-2026-07-21.210441Z.zip"
        self.latest = json.dumps(
            {
                "browser_download_url": (
                    f"https://github.com/bangumi/Archive/releases/download/archive/{name}"
                ),
                "content_type": "application/zip",
                "created_at": "2026-07-21T21:04:41Z",
                "digest": _digest(archive),
                "id": 1,
                "label": "",
                "name": name,
                "node_id": "node",
                "size": len(archive),
                "updated_at": "2026-07-21T21:05:00Z",
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
        assert expected_digest == _digest(self.archive)
        destination.write_bytes(self.archive)
        return url


class _FileClient:
    def __init__(self, archive: Path, common: Path) -> None:
        self.archive = archive
        self.common = common
        self.archive_size = archive.stat().st_size
        self.archive_digest = _digest_file(archive)
        name = "dump-2026-07-21.210441Z.zip"
        self.latest = json.dumps(
            {
                "browser_download_url": (
                    f"https://github.com/bangumi/Archive/releases/download/archive/{name}"
                ),
                "content_type": "application/zip",
                "created_at": "2026-07-21T21:04:41Z",
                "digest": self.archive_digest,
                "id": 485155893,
                "label": "",
                "name": name,
                "node_id": "RA_kwDOGogJqs4c6uQ1",
                "size": self.archive_size,
                "updated_at": "2026-07-21T21:05:00Z",
                "url": "https://api.github.com/repos/bangumi/Archive/releases/assets/485155893",
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
        del maximum, allowed_hosts
        if cancelled():
            raise ProducerError("CANCELED")
        return (self.latest, url) if url == LATEST_URL else (self.common.read_bytes(), url)

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
        del maximum, allowed_hosts
        if cancelled():
            raise ProducerError("CANCELED")
        assert expected_size == self.archive_size
        assert expected_digest == self.archive_digest
        shutil.copyfile(self.archive, destination)
        return url


def _digest_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb", buffering=0) as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return f"sha256:{digest.hexdigest()}"


def _full_source_catalog(case: dict[str, object]) -> bytes:
    inputs = cast(dict[str, object], case["inputs"])
    golden = cast(dict[str, object], inputs["catalogConfig"])
    document = cast(dict[str, object], json.loads(cast(str, golden["bytesUtf8"])))
    position_ids = {
        "book": "2001",
        "anime": "2",
        "music": "3001",
        "game": "1001",
        "real": "4001",
    }
    replacements: dict[str, str] = {}
    for position in cast(list[dict[str, object]], document["positions"]):
        if position["positionKind"] != "staff":
            continue
        subject_type = cast(str, position["subjectType"])
        position_id = position_ids[subject_type]
        old_key = cast(str, position["positionKey"])
        new_key = f"staff:{subject_type}:{position_id}"
        position["positionKey"] = new_key
        position["selectionRule"] = f"positionId={position_id}"
        replacements[old_key] = new_key
    for group in cast(list[dict[str, object]], document["groups"]):
        members = cast(list[str], group["positionKeys"])
        group["positionKeys"] = [replacements.get(member, member) for member in members]
    return (
        json.dumps(
            document,
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode()
        + b"\n"
    )


def _smoke(path: Path, *, fail: bool = False) -> Path:
    body = (
        f"#!{sys.executable}\n"
        "import hashlib,json,pathlib,sys\n"
        + ("raise SystemExit(1)\n" if fail else "")
        + "args=dict(zip(sys.argv[1::2],sys.argv[2::2],strict=True))\n"
        + "root=pathlib.Path(args['-archive-root'])\n"
        + "version=args['-data-version']\n"
        + "manifest_path=root/'versions'/version/'manifest.json'\n"
        + "data=manifest_path.read_bytes()\n"
        + "manifest=json.loads(data)\n"
        + "print(json.dumps({'ok':True,'dataVersion':version,"
        + "'manifestDigest':'sha256:'+hashlib.sha256(data).hexdigest(),"
        + "'sqliteDigest':manifest['sqliteDigest']},separators=(',',':')))\n"
    )
    path.write_text(body)
    path.chmod(0o755)
    return path


def _arrange(
    contracts_root: Path,
    tmp_path: Path,
    *,
    failing_smoke: bool = False,
) -> tuple[ProduceRequest, _Client]:
    case = _case(contracts_root)
    inputs = cast(dict[str, object], case["inputs"])
    common = cast(dict[str, object], inputs["commonSubjectStaffs"])
    catalog = cast(dict[str, object], inputs["catalogConfig"])
    identity = cast(dict[str, object], inputs["identity"])
    archive = _archive(case)
    catalog_path = tmp_path / "catalog.json"
    catalog_path.write_bytes(cast(str, catalog["bytesUtf8"]).encode())
    smoke_path = _smoke(tmp_path / "archive-smoke", fail=failing_smoke)
    return (
        ProduceRequest(
            output_root=tmp_path,
            contracts_root=contracts_root,
            catalog_config=catalog_path,
            common_commit=cast(str, identity["commonCommit"]),
            archive_smoke=smoke_path,
            generated_at="2026-07-25T00:00:00Z",
        ),
        _Client(archive, cast(str, common["bytesUtf8"]).encode()),
    )


def test_service_publishes_exactly_one_inactive_pair_then_returns_no_change(
    contracts_root: Path,
    tmp_path: Path,
) -> None:
    request, client = _arrange(contracts_root, tmp_path)
    first = produce(request, client=client)
    assert first.status == "published"
    version_root = tmp_path / "versions" / first.data_version
    assert sorted(path.name for path in version_root.iterdir()) == [
        "bangumi.sqlite",
        "manifest.json",
    ]
    assert not (tmp_path / "current.json").exists()
    assert not tuple(tmp_path.glob(".bgmss-stage-*"))

    second = produce(request, client=client)
    assert second.status == "no-change"
    assert second.data_version == first.data_version
    assert not tuple(tmp_path.glob(".bgmss-stage-*"))


def test_go_smoke_failure_leaves_no_candidate(
    contracts_root: Path,
    tmp_path: Path,
) -> None:
    request, client = _arrange(contracts_root, tmp_path, failing_smoke=True)
    with pytest.raises(ProducerError, match="GO_SMOKE_FAILED"):
        produce(request, client=client)
    versions = tmp_path / "versions"
    assert not versions.exists() or not tuple(versions.iterdir())
    assert not tuple(tmp_path.glob(".bgmss-stage-*"))


def test_cancellation_removes_staging_and_preserves_prior_bytes(
    contracts_root: Path,
    tmp_path: Path,
) -> None:
    protected = tmp_path / "protected"
    protected.write_bytes(b"keep")
    request, client = _arrange(contracts_root, tmp_path)
    with pytest.raises(ProducerError, match="CANCELED"):
        produce(request, client=client, cancelled=lambda: True)
    assert protected.read_bytes() == b"keep"
    assert not tuple(tmp_path.glob(".bgmss-stage-*"))
    assert not (tmp_path / "current.json").exists()


def test_cancellation_after_go_smoke_is_the_last_prepublication_gate(
    contracts_root: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    request, client = _arrange(contracts_root, tmp_path)
    original_smoke = service_module._smoke
    state = {"smoked": False}

    def smoke(
        executable: Path,
        archive_root: Path,
        version: str,
        cancelled: Callable[[], bool],
    ) -> tuple[str, str]:
        result = original_smoke(executable, archive_root, version, cancelled)
        state["smoked"] = True
        return result

    monkeypatch.setattr(service_module, "_smoke", smoke)
    with pytest.raises(ProducerError, match="CANCELED"):
        produce(request, client=client, cancelled=lambda: state["smoked"])
    assert state["smoked"]
    assert not tuple((tmp_path / "versions").iterdir())
    assert not tuple(tmp_path.glob(".bgmss-stage-*"))


def test_go_smoke_output_is_rejected_at_the_streaming_bound(
    tmp_path: Path,
) -> None:
    executable = tmp_path / "overflow-smoke"
    executable.write_text(
        f"#!{sys.executable}\nimport sys\nsys.stdout.write('x' * 4097)\nsys.stdout.flush()\n"
    )
    executable.chmod(0o755)
    with pytest.raises(ProducerError, match="GO_SMOKE_FAILED"):
        service_module._smoke(
            executable,
            tmp_path,
            "dv1-" + ("a" * 64),
            lambda: False,
        )


def test_cancellation_terminates_and_reaps_running_go_smoke(
    tmp_path: Path,
) -> None:
    pid_path = tmp_path / "smoke.pid"
    executable = tmp_path / "sleeping-smoke"
    executable.write_text(
        f"#!{sys.executable}\n"
        "import os,pathlib,time\n"
        f"pathlib.Path({os.fspath(pid_path)!r}).write_text(str(os.getpid()))\n"
        "time.sleep(30)\n"
    )
    executable.chmod(0o755)
    started = time.monotonic()
    with pytest.raises(ProducerError, match="CANCELED"):
        service_module._smoke(
            executable,
            tmp_path,
            "dv1-" + ("a" * 64),
            pid_path.exists,
        )
    assert time.monotonic() - started < 2
    process_id = int(pid_path.read_text())
    with pytest.raises(ProcessLookupError):
        os.kill(process_id, 0)


def test_keyboard_interrupt_terminates_and_reaps_running_go_smoke(
    tmp_path: Path,
) -> None:
    pid_path = tmp_path / "interrupted-smoke.pid"
    executable = tmp_path / "interrupted-smoke"
    executable.write_text(
        f"#!{sys.executable}\n"
        "import os,pathlib,time\n"
        f"pathlib.Path({os.fspath(pid_path)!r}).write_text(str(os.getpid()))\n"
        "time.sleep(30)\n"
    )
    executable.chmod(0o755)

    def interrupted() -> bool:
        if pid_path.exists():
            raise KeyboardInterrupt
        return False

    with pytest.raises(KeyboardInterrupt):
        service_module._smoke(
            executable,
            tmp_path,
            "dv1-" + ("a" * 64),
            interrupted,
        )
    process_id = int(pid_path.read_text())
    with pytest.raises(ProcessLookupError):
        os.kill(process_id, 0)


def test_invalid_existing_same_version_is_preserved_and_rejected(
    contracts_root: Path,
    tmp_path: Path,
) -> None:
    request, client = _arrange(contracts_root, tmp_path)
    first = produce(request, client=client)
    manifest = tmp_path / "versions" / first.data_version / "manifest.json"
    manifest.write_bytes(b"invalid-existing")
    with pytest.raises(ProducerError, match="GO_SMOKE_FAILED"):
        produce(request, client=client)
    assert manifest.read_bytes() == b"invalid-existing"
    assert not tuple(tmp_path.glob(".bgmss-stage-*"))


def test_real_go_consumer_accepts_python_candidate_when_explicitly_supplied(
    contracts_root: Path,
    tmp_path: Path,
) -> None:
    executable = os.environ.get("BGMSS_ARCHIVE_SMOKE")
    if executable is None:
        pytest.skip("set BGMSS_ARCHIVE_SMOKE for the explicit Python-to-Go gate")
    request, client = _arrange(contracts_root, tmp_path)
    result = produce(
        replace(request, archive_smoke=Path(executable).resolve(strict=True)),
        client=client,
    )
    assert result.status == "published"
    assert (tmp_path / "versions" / result.data_version / "manifest.json").is_file()
    assert (tmp_path / "versions" / result.data_version / "bangumi.sqlite").is_file()


def test_complete_public_source_reaches_real_go_consumer_when_explicitly_supplied(
    contracts_root: Path,
    tmp_path: Path,
) -> None:
    executable = os.environ.get("BGMSS_ARCHIVE_SMOKE")
    archive = os.environ.get("BGMSS_ARCHIVE_ZIP")
    common = os.environ.get("BGMSS_COMMON_YAML")
    if executable is None or archive is None or common is None:
        pytest.skip("set all BGMSS complete-source gate paths")

    case = _case(contracts_root)
    inputs = cast(dict[str, object], case["inputs"])
    identity = cast(dict[str, object], inputs["identity"])
    catalog_path = tmp_path / "catalog.json"
    catalog_path.write_bytes(_full_source_catalog(case))
    result = produce(
        ProduceRequest(
            output_root=tmp_path,
            contracts_root=contracts_root,
            catalog_config=catalog_path,
            common_commit=cast(str, identity["commonCommit"]),
            archive_smoke=Path(executable).resolve(strict=True),
            generated_at="2026-07-25T00:00:00Z",
        ),
        client=_FileClient(
            Path(archive).resolve(strict=True),
            Path(common).resolve(strict=True),
        ),
    )
    assert result.status == "published"
    version_root = tmp_path / "versions" / result.data_version
    assert sorted(path.name for path in version_root.iterdir()) == [
        "bangumi.sqlite",
        "manifest.json",
    ]
    assert not (tmp_path / "current.json").exists()
