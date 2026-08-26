"""End-to-end one-shot Archive production and inactive publication."""

from __future__ import annotations

import json
import math
import os
import stat
import time
from collections.abc import Callable, Mapping
from contextlib import suppress
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Protocol

from bangumi_staff_stats_updater import __version__
from bangumi_staff_stats_updater.archive_contract import (
    ContractExpectationError,
    ContractInputError,
    ContractReport,
    check_contracts,
)
from bangumi_staff_stats_updater.catalog.config import load_configuration
from bangumi_staff_stats_updater.catalog.errors import CatalogError

from .acquisition import (
    AcquiredInputs,
    AcquisitionClient,
    StrictHTTPSClient,
    acquire,
    validate_https_proxy,
)
from .builder import build_database
from .manifest import (
    data_version,
    digest_bytes,
    digest_file,
    finalize_manifest,
    identity_mapping,
    validate_manifest,
    verify_manifest_string_vectors,
)
from .model import BuildIdentity, ProducerError
from .staging import StagingRoot

_MAX_CONFIG_BYTES = 4 * 1024 * 1024


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
    generated_at: str | None = None
    https_proxy: str | None = None


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
    contracts: ContractReport,
) -> BuildIdentity:
    return BuildIdentity(
        acquired.archive_release,
        acquired.archive_digest,
        acquired.common_commit,
        acquired.common_digest,
        1,
        1,
        _schema_digest(contracts_root),
        contracts.domain_rules_version,
        contracts.cast_rules_version,
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


def _existing_version(
    output_root: Path,
    contracts_root: Path,
    identity: BuildIdentity,
    cancelled: Callable[[], bool],
) -> ProduceResult | None:
    version = data_version(identity)
    destination = output_root / "versions" / version
    if not destination.exists() and not destination.is_symlink():
        return None
    try:
        metadata = destination.lstat()
        if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISDIR(metadata.st_mode):
            raise ProducerError("PUBLICATION_COLLISION")
        _candidate_inventory(destination)
        manifest_bytes = (destination / "manifest.json").read_bytes()
        manifest = validate_manifest(
            json.loads(manifest_bytes.decode("utf-8", errors="strict")),
            contracts_root,
        )
        if manifest.get("dataVersion") != version or any(
            manifest.get(key) != value for key, value in identity_mapping(identity).items()
        ):
            raise ProducerError("PUBLICATION_COLLISION")
        sqlite_size, sqlite_digest = digest_file(
            destination / "bangumi.sqlite",
            cancelled,
        )
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ProducerError("PUBLICATION_COLLISION") from error
    if manifest.get("sqliteSize") != sqlite_size or manifest.get("sqliteDigest") != sqlite_digest:
        raise ProducerError("PUBLICATION_COLLISION")
    manifest_digest = digest_bytes(manifest_bytes)
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
    proxy_url = validate_https_proxy(request.https_proxy)
    active_client = StrictHTTPSClient(proxy_url) if client is None else client
    contracts_root = request.contracts_root

    def preflight() -> tuple[bytes, ContractReport]:
        try:
            contracts = check_contracts(contracts_root)
        except (ContractInputError, ContractExpectationError) as error:
            raise ProducerError("CONTRACT_INPUT_INVALID") from error
        catalog_bytes = _read_config(request.catalog_config, contracts_root)
        verify_manifest_string_vectors(contracts_root)
        return catalog_bytes, contracts

    catalog_bytes, contracts = _phase(
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
                client=active_client,
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
            identity = _identity(acquired, catalog_bytes, contracts_root, contracts)
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
                "existing",
                lambda: _existing_version(
                    staging.output_root,
                    contracts_root,
                    identity,
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

        sqlite_digest = manifest.get("sqliteDigest")
        if not isinstance(sqlite_digest, str):
            raise ProducerError("MANIFEST_SCHEMA_INVALID")

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
