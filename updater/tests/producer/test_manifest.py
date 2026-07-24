"""Manifest identity and real string-boundary tests."""

from __future__ import annotations

import json
from pathlib import Path
from typing import cast

import pytest

from bangumi_staff_stats_updater.producer.manifest import (
    canonical_preimage,
    data_version,
    digest_file,
    verify_manifest_string_vectors,
)
from bangumi_staff_stats_updater.producer.model import BuildIdentity, ProducerError


def _identity(contracts_root: Path) -> tuple[BuildIdentity, dict[str, object]]:
    path = contracts_root / "goldens" / "archive" / "producer" / "cases" / "valid-seven-source.json"
    document = cast(dict[str, object], json.loads(path.read_bytes()))
    inputs = cast(dict[str, object], document["inputs"])
    raw = cast(dict[str, object], inputs["identity"])
    return (
        BuildIdentity(
            cast(str, raw["archiveRelease"]),
            cast(str, raw["archiveDigest"]),
            cast(str, raw["commonCommit"]),
            cast(str, raw["commonDigest"]),
            cast(int, raw["manifestSchemaVersion"]),
            cast(int, raw["sqliteSchemaVersion"]),
            cast(str, raw["schemaSqlDigest"]),
            cast(str, raw["domainRulesVersion"]),
            cast(str, raw["castRulesVersion"]),
            cast(str, raw["catalogConfigDigest"]),
        ),
        cast(dict[str, object], document["dataVersion"]),
    )


def test_data_version_matches_accepted_producer_vector(contracts_root: Path) -> None:
    identity, expected = _identity(contracts_root)
    assert canonical_preimage(identity).decode() == expected["canonicalPreimage"]
    assert len(canonical_preimage(identity)) == expected["canonicalPreimageByteLength"]
    assert data_version(identity) == expected["result"]


def test_every_manifest_string_vector_crosses_real_finalizer(
    contracts_root: Path,
) -> None:
    assert verify_manifest_string_vectors(contracts_root) == 26


def test_shared_file_digest_cancels_between_chunks(tmp_path: Path) -> None:
    path = tmp_path / "large.bin"
    path.write_bytes(b"x" * (3 * 1024 * 1024))
    checks = 0

    def cancelled() -> bool:
        nonlocal checks
        checks += 1
        return checks == 4

    with pytest.raises(ProducerError, match="CANCELED"):
        digest_file(path, cancelled)
    assert checks == 4
