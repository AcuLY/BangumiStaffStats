"""End-to-end one-shot Archive production and inactive publication."""

from __future__ import annotations

import json
import math
import os
import selectors
import signal
import stat
import subprocess
import time
from collections.abc import Callable, Mapping
from contextlib import suppress
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import IO, Protocol, cast

from bangumi_staff_stats_updater import __version__
from bangumi_staff_stats_updater.archive_contract import (
    ContractExpectationError,
    ContractInputError,
    check_contracts,
)
from bangumi_staff_stats_updater.catalog.config import load_configuration
from bangumi_staff_stats_updater.catalog.errors import CatalogError

from .acquisition import AcquiredInputs, AcquisitionClient, acquire
from .builder import build_database
from .manifest import (
    data_version,
    digest_bytes,
    finalize_manifest,
    verify_manifest_string_vectors,
)
from .model import BuildIdentity, ProducerError
from .staging import StagingRoot

_MAX_CONFIG_BYTES = 4 * 1024 * 1024
_MAX_SMOKE_OUTPUT_BYTES = 4096


class PhaseObserver(Protocol):
    """Read-only synchronous observer for existing producer phase gates."""

    def phase_started(self, phase: str) -> None:
        """Observe entry into one existing phase."""

    def phase_completed(
        self,
        phase: str,
        duration_seconds: float | None,
        details: Mapping[str, object],
    ) -> None:
        """Observe successful completion of one existing phase."""


def _phase[PhaseResult](
    phase: str,
    operation: Callable[[], PhaseResult],
    *,
    observer: PhaseObserver | None,
    monotonic: Callable[[], float],
    details: Callable[[PhaseResult], Mapping[str, object]] = lambda _result: {},
) -> PhaseResult:
    if observer is not None:
        with suppress(Exception):
            observer.phase_started(phase)
    started: float | None = None
    if observer is not None:
        with suppress(Exception):
            started = monotonic()
    result = operation()
    duration: float | None = None
    if started is not None:
        with suppress(Exception):
            measured = monotonic() - started
            if measured >= 0 and math.isfinite(measured):
                duration = measured
    if observer is not None:
        with suppress(Exception):
            observer.phase_completed(phase, duration, details(result))
    return result


@dataclass(frozen=True, slots=True)
class ProduceRequest:
    """Explicit local and upstream inputs for one terminating run."""

    output_root: Path
    contracts_root: Path
    catalog_config: Path
    common_commit: str
    archive_smoke: Path
    generated_at: str | None = None
    domain_rules_version: str = "domain-raw-v1"
    cast_rules_version: str = "cast-exact-v1"


@dataclass(frozen=True, slots=True)
class ProduceResult:
    """Bounded success identity."""

    status: str
    data_version: str
    manifest_digest: str
    sqlite_digest: str
    quality_report: dict[str, object] | None = None

    def as_json(self) -> dict[str, object]:
        """Return the stable CLI field names."""
        return {
            "code": "ARCHIVE_READY",
            "status": self.status,
            "dataVersion": self.data_version,
            "manifestDigest": self.manifest_digest,
            "sqliteDigest": self.sqlite_digest,
        }


def _regular_file(path: Path, code: str, *, executable: bool = False) -> Path:
    if not path.is_absolute():
        raise ProducerError(code)
    try:
        metadata = path.lstat()
        resolved = path.resolve(strict=True)
    except OSError as error:
        raise ProducerError(code) from error
    if (
        stat.S_ISLNK(metadata.st_mode)
        or not stat.S_ISREG(metadata.st_mode)
        or path.absolute() != resolved
        or (executable and not os.access(resolved, os.X_OK))
    ):
        raise ProducerError(code)
    return resolved


def _read_config(path: Path, contracts_root: Path) -> bytes:
    resolved = _regular_file(path, "CATALOG_CONFIG_INVALID")
    if resolved.name == "display-v1.yaml":
        try:
            return load_configuration(resolved, contracts_root).canonical_bytes
        except CatalogError as error:
            raise ProducerError(error.code, evidence=error.evidence) from error
    try:
        if resolved.stat().st_size <= 0 or resolved.stat().st_size > _MAX_CONFIG_BYTES:
            raise ProducerError("CATALOG_CONFIG_INVALID")
        data = resolved.read_bytes()
    except OSError as error:
        raise ProducerError("CATALOG_CONFIG_INVALID") from error
    if len(data) > _MAX_CONFIG_BYTES:
        raise ProducerError("CATALOG_CONFIG_INVALID")
    return data


def _schema_digest(contracts_root: Path) -> str:
    try:
        data = (contracts_root / "schemas" / "archive" / "schema.sql").read_bytes()
    except OSError as error:
        raise ProducerError("CONTRACT_INPUT_INVALID") from error
    return digest_bytes(data)


def _generated_at(value: str | None) -> str:
    if value is not None:
        return value
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _identity(
    acquired: AcquiredInputs,
    catalog_bytes: bytes,
    contracts_root: Path,
    request: ProduceRequest,
) -> BuildIdentity:
    return BuildIdentity(
        acquired.archive_release,
        acquired.archive_digest,
        acquired.common_commit,
        acquired.common_digest,
        1,
        1,
        _schema_digest(contracts_root),
        request.domain_rules_version,
        request.cast_rules_version,
        digest_bytes(catalog_bytes),
    )


def _candidate_inventory(candidate: Path) -> None:
    try:
        entries = sorted(candidate.iterdir(), key=lambda value: value.name)
        if [entry.name for entry in entries] != ["bangumi.sqlite", "manifest.json"]:
            raise ProducerError("CANDIDATE_LAYOUT_INVALID")
        for entry in entries:
            metadata = entry.lstat()
            if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISREG(metadata.st_mode):
                raise ProducerError("CANDIDATE_LAYOUT_INVALID")
    except OSError as error:
        raise ProducerError("CANDIDATE_LAYOUT_INVALID") from error


def _smoke(
    executable: Path,
    archive_root: Path,
    version: str,
    cancelled: Callable[[], bool],
) -> tuple[str, str]:
    if cancelled():
        raise ProducerError("CANCELED")
    try:
        process = subprocess.Popen(  # noqa: S603 - executable is canonical and validated.
            [
                os.fspath(executable),
                "-archive-root",
                os.fspath(archive_root),
                "-data-version",
                version,
            ],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env={"LANG": "C", "LC_ALL": "C", "TZ": "UTC"},
            start_new_session=True,
        )
    except OSError as error:
        raise ProducerError("GO_SMOKE_FAILED") from error

    def terminate_and_reap() -> None:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except OSError:
            if process.poll() is None:
                with suppress(OSError):
                    process.kill()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            with suppress(OSError):
                process.kill()
            process.wait()

    output = {"stdout": bytearray(), "stderr": bytearray()}
    active: set[IO[bytes]] = set()
    selector: selectors.BaseSelector | None = None
    try:
        stdout = process.stdout
        stderr = process.stderr
        if stdout is None or stderr is None:
            raise ProducerError("GO_SMOKE_FAILED")
        active = {stdout, stderr}
        deadline = time.monotonic() + 300
        selector = selectors.DefaultSelector()
        for stream, name in ((stdout, "stdout"), (stderr, "stderr")):
            os.set_blocking(stream.fileno(), False)
            selector.register(stream, selectors.EVENT_READ, name)
        while active or process.poll() is None:
            if cancelled():
                raise ProducerError("CANCELED")
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise ProducerError("GO_SMOKE_FAILED")
            if active:
                events = selector.select(timeout=min(0.05, remaining))
                for key, _mask in events:
                    stream = cast(IO[bytes], key.fileobj)
                    if stream not in active:
                        continue
                    name = cast(str, key.data)
                    maximum_read = max(
                        1,
                        _MAX_SMOKE_OUTPUT_BYTES + 1 - len(output[name]),
                    )
                    chunk = os.read(stream.fileno(), maximum_read)
                    if chunk:
                        output[name].extend(chunk)
                        if len(output[name]) > _MAX_SMOKE_OUTPUT_BYTES:
                            raise ProducerError("GO_SMOKE_FAILED")
                    else:
                        selector.unregister(stream)
                        stream.close()
                        active.remove(stream)
            else:
                try:
                    process.wait(timeout=min(0.05, remaining))
                except subprocess.TimeoutExpired:
                    continue
        return_code = process.wait()
    except ProducerError:
        terminate_and_reap()
        raise
    except OSError as error:
        terminate_and_reap()
        raise ProducerError("GO_SMOKE_FAILED") from error
    except BaseException:
        terminate_and_reap()
        raise
    finally:
        if selector is not None:
            selector.close()
        for stream in tuple(active):
            stream.close()
    if return_code != 0:
        raise ProducerError("GO_SMOKE_FAILED")
    try:
        value = json.loads(bytes(output["stdout"]).decode("utf-8", errors="strict"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ProducerError("GO_SMOKE_FAILED") from error
    if (
        not isinstance(value, dict)
        or set(value) != {"ok", "dataVersion", "manifestDigest", "sqliteDigest"}
        or value.get("ok") is not True
        or value.get("dataVersion") != version
        or not isinstance(value.get("manifestDigest"), str)
        or not isinstance(value.get("sqliteDigest"), str)
    ):
        raise ProducerError("GO_SMOKE_FAILED")
    return cast(str, value["manifestDigest"]), cast(str, value["sqliteDigest"])


def _existing_version(
    output_root: Path,
    executable: Path,
    version: str,
    cancelled: Callable[[], bool],
) -> ProduceResult | None:
    destination = output_root / "versions" / version
    if not destination.exists() and not destination.is_symlink():
        return None
    manifest_digest, sqlite_digest = _smoke(executable, output_root, version, cancelled)
    return ProduceResult("no-change", version, manifest_digest, sqlite_digest)


def produce(
    request: ProduceRequest,
    *,
    client: AcquisitionClient | None = None,
    cancelled: Callable[[], bool] = lambda: False,
    observer: PhaseObserver | None = None,
    monotonic: Callable[[], float] = time.monotonic,
) -> ProduceResult:
    """Run every fallible gate, then atomically publish one inactive version."""
    contracts_root = request.contracts_root

    def preflight() -> tuple[bytes, Path]:
        try:
            check_contracts(contracts_root)
        except (ContractInputError, ContractExpectationError) as error:
            raise ProducerError("CONTRACT_INPUT_INVALID") from error
        catalog_bytes = _read_config(request.catalog_config, contracts_root)
        smoke = _regular_file(request.archive_smoke, "GO_SMOKE_INVALID", executable=True)
        verify_manifest_string_vectors(contracts_root)
        return catalog_bytes, smoke

    catalog_bytes, smoke = _phase(
        "preflight",
        preflight,
        observer=observer,
        monotonic=monotonic,
    )

    with StagingRoot(request.output_root) as staging:
        acquired = _phase(
            "acquisition",
            lambda: acquire(
                staging_root=staging.path,
                common_commit=request.common_commit,
                client=client,
                cancelled=cancelled,
            ),
            observer=observer,
            monotonic=monotonic,
            details=lambda value: {
                "source_release": value.archive_release,
                "source_digest": value.archive_digest,
            },
        )

        def create_identity() -> tuple[BuildIdentity, str]:
            identity = _identity(acquired, catalog_bytes, contracts_root, request)
            return identity, data_version(identity)

        identity, version = _phase(
            "identity",
            create_identity,
            observer=observer,
            monotonic=monotonic,
            details=lambda value: {"dataVersion": value[1]},
        )
        destination = staging.output_root / "versions" / version
        existing = None
        if destination.exists() or destination.is_symlink():
            existing = _phase(
                "smoke",
                lambda: _existing_version(
                    staging.output_root,
                    smoke,
                    version,
                    cancelled,
                ),
                observer=observer,
                monotonic=monotonic,
                details=lambda value: (
                    {"dataVersion": value.data_version} if value is not None else {}
                ),
            )
        if existing is not None:
            return existing
        candidate = staging.candidate_root(version)
        build = _phase(
            "build",
            lambda: build_database(
                contracts_root=contracts_root,
                destination=candidate / "bangumi.sqlite",
                sources=acquired.sources,
                common_bytes=acquired.common_bytes,
                catalog_bytes=catalog_bytes,
                identity=identity,
                cancelled=cancelled,
            ),
            observer=observer,
            monotonic=monotonic,
            details=lambda value: {
                "input_rows": sum(item.records_total for item in value.accounting),
                "output_rows": sum(value.table_counts.values()),
                "quality_summary": dict(value.quality_summary),
                "dataVersion": version,
            },
        )

        def create_manifest() -> tuple[dict[str, object], str]:
            manifest, manifest_digest = finalize_manifest(
                contracts_root=contracts_root,
                destination=candidate / "manifest.json",
                identity=identity,
                generated_at=_generated_at(request.generated_at),
                generator_version=__version__,
                archive_asset_url=acquired.archive_asset_url,
                archive_asset_name=acquired.archive_asset_name,
                archive_size=acquired.archive_size,
                common_url=acquired.common_url,
                common_size=acquired.common_size,
                accounting=build.accounting,
                table_counts=build.table_counts,
                quality_summary=build.quality_summary,
                sqlite_path=build.sqlite_path,
                cancelled=cancelled,
            )
            _candidate_inventory(candidate)
            return manifest, manifest_digest

        manifest, manifest_digest = _phase(
            "manifest",
            create_manifest,
            observer=observer,
            monotonic=monotonic,
            details=lambda _value: {"dataVersion": version},
        )

        def verify_smoke() -> tuple[str, str]:
            smoke_manifest_digest, sqlite_digest = _smoke(
                smoke,
                staging.path,
                version,
                cancelled,
            )
            if (
                smoke_manifest_digest != manifest_digest
                or sqlite_digest != manifest["sqliteDigest"]
            ):
                raise ProducerError("GO_SMOKE_FAILED")
            return smoke_manifest_digest, sqlite_digest

        _smoke_manifest_digest, sqlite_digest = _phase(
            "smoke",
            verify_smoke,
            observer=observer,
            monotonic=monotonic,
            details=lambda _value: {"dataVersion": version},
        )

        def publish() -> ProduceResult:
            staging.prepare_publication(version)
            if cancelled():
                raise ProducerError("CANCELED")
            result = ProduceResult(
                "published",
                version,
                manifest_digest,
                sqlite_digest,
                build.quality_report,
            )
            staging.publish(version)
            return result

        return _phase(
            "publication",
            publish,
            observer=observer,
            monotonic=monotonic,
            details=lambda value: {"dataVersion": value.data_version},
        )
