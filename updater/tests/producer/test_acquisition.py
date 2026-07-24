"""Bounded acquisition and safe ZIP tests."""

from __future__ import annotations

import hashlib
import io
import json
import zipfile
from collections.abc import Callable
from pathlib import Path

import pytest

from bangumi_staff_stats_updater.producer.acquisition import (
    LATEST_URL,
    AcquiredInputs,
    acquire,
    parse_latest,
    verify_and_extract,
)
from bangumi_staff_stats_updater.producer.model import (
    ARCHIVE_MEMBER_NAMES,
    SOURCE_NAMES,
    ProducerError,
)


def _digest(data: bytes) -> str:
    return f"sha256:{hashlib.sha256(data).hexdigest()}"


def _zip_bytes(
    members: dict[str, bytes],
) -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in members.items():
            archive.writestr(name, data)
    return output.getvalue()


def _members() -> dict[str, bytes]:
    return {
        name: (b'{"id":1}\n' if name in SOURCE_NAMES else b"")
        for name in sorted(ARCHIVE_MEMBER_NAMES)
    }


def _latest(archive: bytes) -> bytes:
    name = "dump-2026-07-21.210441Z.zip"
    return json.dumps(
        {
            "browser_download_url": (
                f"https://github.com/bangumi/Archive/releases/download/archive/{name}"
            ),
            "content_type": "application/zip",
            "created_at": "2026-07-21T21:04:41Z",
            "digest": _digest(archive),
            "id": 485155893,
            "label": "",
            "name": name,
            "node_id": "RA_kwDOGogJqs4c6uQ1",
            "size": len(archive),
            "updated_at": "2026-07-21T21:05:00Z",
            "url": "https://api.github.com/repos/bangumi/Archive/releases/assets/485155893",
        },
        separators=(",", ":"),
    ).encode()


class _Client:
    def __init__(self, archive: bytes, common: bytes) -> None:
        self.archive = archive
        self.common = common
        self.latest = _latest(archive)
        self.calls: list[str] = []

    def fetch_bytes(
        self,
        url: str,
        *,
        maximum: int,
        allowed_hosts: frozenset[str],
        cancelled: Callable[[], bool],
    ) -> tuple[bytes, str]:
        del maximum, allowed_hosts
        assert not cancelled()
        self.calls.append(url)
        if url == LATEST_URL:
            return self.latest, url
        return self.common, url

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
        assert not cancelled()
        self.calls.append(url)
        assert expected_size == len(self.archive)
        assert expected_digest == _digest(self.archive)
        destination.write_bytes(self.archive)
        return url


def test_latest_document_resolves_exact_official_asset() -> None:
    archive = _zip_bytes(_members())
    value = parse_latest(_latest(archive))
    assert value.release == "dump-2026-07-21.210441Z"
    assert value.size == len(archive)
    assert value.digest == _digest(archive)


def test_latest_document_rejects_unknown_or_cross_origin_fields() -> None:
    archive = _zip_bytes(_members())
    document = json.loads(_latest(archive))
    document["unexpected"] = True
    with pytest.raises(ProducerError, match="ARCHIVE_LATEST_INVALID"):
        parse_latest(json.dumps(document).encode())
    document.pop("unexpected")
    document["browser_download_url"] = "https://example.com/archive.zip"
    with pytest.raises(ProducerError, match="ARCHIVE_IDENTITY_INVALID"):
        parse_latest(json.dumps(document).encode())


def test_latest_document_rejects_duplicate_or_inconsistent_identity() -> None:
    archive = _zip_bytes(_members())
    duplicate = _latest(archive).replace(
        b'"name":',
        b'"name":"duplicate.zip","name":',
        1,
    )
    with pytest.raises(ProducerError, match="ARCHIVE_LATEST_INVALID"):
        parse_latest(duplicate)

    document = json.loads(_latest(archive))
    document["created_at"] = "2026-07-21T21:04:42Z"
    with pytest.raises(ProducerError, match="ARCHIVE_IDENTITY_INVALID"):
        parse_latest(json.dumps(document).encode())


def test_zip_inventory_extracts_only_exact_required_sources(tmp_path: Path) -> None:
    members = _members()
    archive_path = tmp_path / "archive.zip"
    archive_path.write_bytes(_zip_bytes(members))
    sources = verify_and_extract(archive_path, tmp_path / "sources", lambda: False)
    assert tuple(source.name for source in sources) == SOURCE_NAMES
    assert {path.name for path in (tmp_path / "sources").iterdir()} == set(SOURCE_NAMES)
    for source in sources:
        assert source.digest == _digest(members[source.name])


def test_zip_rejects_missing_extra_traversal_and_cancellation(tmp_path: Path) -> None:
    missing = _members()
    missing.pop("episode.jsonlines")
    missing_path = tmp_path / "missing.zip"
    missing_path.write_bytes(_zip_bytes(missing))
    with pytest.raises(ProducerError, match="ARCHIVE_ZIP_INVALID"):
        verify_and_extract(missing_path, tmp_path / "missing", lambda: False)

    traversal = _members()
    traversal["../escape.jsonlines"] = b"{}\n"
    traversal_path = tmp_path / "traversal.zip"
    traversal_path.write_bytes(_zip_bytes(traversal))
    with pytest.raises(ProducerError, match="ARCHIVE_ZIP_INVALID"):
        verify_and_extract(traversal_path, tmp_path / "traversal", lambda: False)

    valid_path = tmp_path / "cancel.zip"
    valid_path.write_bytes(_zip_bytes(_members()))
    with pytest.raises(ProducerError, match="CANCELED"):
        verify_and_extract(valid_path, tmp_path / "cancel", lambda: True)


def test_acquire_uses_exact_commit_and_returns_verified_inputs(tmp_path: Path) -> None:
    archive = _zip_bytes(_members())
    common = b'{"positions":[]}\n'
    client = _Client(archive, common)
    result = acquire(
        staging_root=tmp_path,
        common_commit="6a8442c17143a870357a5ff812362e8b5cfe9f9d",
        client=client,
    )
    assert isinstance(result, AcquiredInputs)
    assert result.archive_digest == _digest(archive)
    assert result.common_digest == _digest(common)
    assert tuple(source.name for source in result.sources) == SOURCE_NAMES
    assert len(client.calls) == 3


def test_acquire_records_stable_official_url_after_allowed_redirect(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    archive = _zip_bytes(_members())
    client = _Client(archive, b'{"positions":[]}\n')
    original = client.download

    def redirected_download(
        url: str,
        destination: Path,
        *,
        expected_size: int,
        expected_digest: str,
        maximum: int,
        allowed_hosts: frozenset[str],
        cancelled: Callable[[], bool],
    ) -> str:
        original(
            url,
            destination,
            expected_size=expected_size,
            expected_digest=expected_digest,
            maximum=maximum,
            allowed_hosts=allowed_hosts,
            cancelled=cancelled,
        )
        return "https://release-assets.githubusercontent.com/archive.zip?token=temporary"

    monkeypatch.setattr(client, "download", redirected_download)
    result = acquire(
        staging_root=tmp_path,
        common_commit="6a8442c17143a870357a5ff812362e8b5cfe9f9d",
        client=client,
    )
    assert result.archive_asset_url == (
        "https://github.com/bangumi/Archive/releases/download/archive/dump-2026-07-21.210441Z.zip"
    )


def test_acquire_rejects_injected_redirect_identity(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    archive = _zip_bytes(_members())
    client = _Client(archive, b'{"positions":[]}\n')
    original = client.fetch_bytes

    def redirect(
        url: str,
        *,
        maximum: int,
        allowed_hosts: frozenset[str],
        cancelled: Callable[[], bool],
    ) -> tuple[bytes, str]:
        data, _final = original(
            url,
            maximum=maximum,
            allowed_hosts=allowed_hosts,
            cancelled=cancelled,
        )
        return data, "https://raw.githubusercontent.com/other/path"

    monkeypatch.setattr(client, "fetch_bytes", redirect)
    with pytest.raises(ProducerError, match="ARCHIVE_LATEST_INVALID"):
        acquire(
            staging_root=tmp_path,
            common_commit="6a8442c17143a870357a5ff812362e8b5cfe9f9d",
            client=client,
        )
