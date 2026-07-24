"""Exact bounded acquisition of public Archive and common inputs."""

from __future__ import annotations

import hashlib
import json
import re
import stat
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from http.client import HTTPMessage
from pathlib import Path, PurePosixPath
from typing import IO, Final, Protocol, cast

from .manifest import digest_bytes, digest_file
from .model import (
    ARCHIVE_MEMBER_NAMES,
    SAFE_INTEGER_MAX,
    SOURCE_NAMES,
    ProducerError,
    SourceInput,
)

LATEST_URL: Final = "https://raw.githubusercontent.com/bangumi/Archive/master/aux/latest.json"
_LATEST_HOSTS: Final = frozenset({"raw.githubusercontent.com"})
_ASSET_HOSTS: Final = frozenset({"github.com", "release-assets.githubusercontent.com"})
_COMMON_HOSTS: Final = frozenset({"raw.githubusercontent.com"})
_MAX_LATEST_BYTES: Final = 64 * 1024
_MAX_COMMON_BYTES: Final = 4 * 1024 * 1024
_MAX_ARCHIVE_BYTES: Final = 1024 * 1024 * 1024
_MAX_MEMBER_BYTES: Final = 2 * 1024 * 1024 * 1024
_MAX_UNCOMPRESSED_BYTES: Final = 4 * 1024 * 1024 * 1024
_CHUNK_BYTES: Final = 1024 * 1024
_DIGEST: Final = re.compile(r"^sha256:[0-9a-f]{64}$")
_COMMIT: Final = re.compile(r"^[0-9a-f]{40}$")
_ASSET_NAME: Final = re.compile(r"^dump-[0-9]{4}-[0-9]{2}-[0-9]{2}\.[0-9]{6}Z\.zip$")
_GITHUB_TIMESTAMP: Final = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$")
_LATEST_FIELDS: Final = {
    "browser_download_url",
    "content_type",
    "created_at",
    "digest",
    "id",
    "label",
    "name",
    "node_id",
    "size",
    "updated_at",
    "url",
}


@dataclass(frozen=True, slots=True)
class LatestAsset:
    """Strict identity resolved from the official latest document."""

    release: str
    url: str
    name: str
    size: int
    digest: str


@dataclass(frozen=True, slots=True)
class AcquiredInputs:
    """All bytes and identities needed by the streaming builder."""

    archive_release: str
    archive_asset_url: str
    archive_asset_name: str
    archive_size: int
    archive_digest: str
    common_commit: str
    common_url: str
    common_size: int
    common_digest: str
    common_bytes: bytes
    sources: tuple[SourceInput, ...]


class AcquisitionClient(Protocol):
    """Injected bounded fetch boundary."""

    def fetch_bytes(
        self,
        url: str,
        *,
        maximum: int,
        allowed_hosts: frozenset[str],
        cancelled: Callable[[], bool],
    ) -> tuple[bytes, str]:
        """Fetch one bounded HTTPS response."""

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
        """Download one exact response incrementally and return final URL."""


def _validate_url(url: str, allowed_hosts: frozenset[str]) -> None:
    try:
        parsed = urllib.parse.urlsplit(url)
    except ValueError as error:
        raise ProducerError("HTTPS_ORIGIN_INVALID") from error
    if (
        parsed.scheme != "https"
        or parsed.hostname not in allowed_hosts
        or parsed.username is not None
        or parsed.password is not None
        or parsed.fragment
        or parsed.port not in {None, 443}
    ):
        raise ProducerError("HTTPS_ORIGIN_INVALID")


class _RedirectHandler(urllib.request.HTTPRedirectHandler):
    def __init__(self, allowed_hosts: frozenset[str]) -> None:
        super().__init__()
        self._allowed_hosts = allowed_hosts

    def redirect_request(
        self,
        request: urllib.request.Request,
        file_pointer: IO[bytes],
        code: int,
        message: str,
        headers: HTTPMessage,
        new_url: str,
    ) -> urllib.request.Request | None:
        _validate_url(new_url, self._allowed_hosts)
        return super().redirect_request(
            request,
            file_pointer,
            code,
            message,
            headers,
            new_url,
        )


class StrictHTTPSClient:
    """Standard-library HTTPS client with no environment proxy inheritance."""

    @staticmethod
    def _open(
        url: str,
        allowed_hosts: frozenset[str],
    ) -> urllib.response.addinfourl:
        _validate_url(url, allowed_hosts)
        opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}),
            _RedirectHandler(allowed_hosts),
        )
        request = urllib.request.Request(  # noqa: S310 - URL is restricted to HTTPS above.
            url,
            headers={
                "Accept": "application/octet-stream, application/json",
                "User-Agent": "BangumiStaffStats-updater/0.1.0",
            },
            method="GET",
        )
        try:
            response = opener.open(request, timeout=60)
        except (urllib.error.URLError, OSError, ProducerError) as error:
            if isinstance(error, ProducerError):
                raise
            raise ProducerError("HTTPS_REQUEST_FAILED") from error
        if response.status != 200:
            response.close()
            raise ProducerError("HTTPS_STATUS_INVALID")
        _validate_url(response.geturl(), allowed_hosts)
        return cast(urllib.response.addinfourl, response)

    def fetch_bytes(
        self,
        url: str,
        *,
        maximum: int,
        allowed_hosts: frozenset[str],
        cancelled: Callable[[], bool],
    ) -> tuple[bytes, str]:
        response = self._open(url, allowed_hosts)
        try:
            declared = response.headers.get("Content-Length")
            if declared is None or not declared.isascii() or not declared.isdigit():
                raise ProducerError("HTTPS_SIZE_INVALID")
            length = int(declared)
            if length < 0 or length > maximum:
                raise ProducerError("HTTPS_SIZE_INVALID")
            chunks: list[bytes] = []
            size = 0
            while chunk := response.read(min(_CHUNK_BYTES, maximum + 1 - size)):
                if cancelled():
                    raise ProducerError("CANCELED")
                size += len(chunk)
                if size > maximum:
                    raise ProducerError("HTTPS_SIZE_INVALID")
                chunks.append(chunk)
            if size != length:
                raise ProducerError("HTTPS_SIZE_INVALID")
            return b"".join(chunks), response.geturl()
        finally:
            response.close()

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
        if expected_size < 0 or expected_size > maximum or not _DIGEST.fullmatch(expected_digest):
            raise ProducerError("ARCHIVE_IDENTITY_INVALID")
        response = self._open(url, allowed_hosts)
        try:
            declared = response.headers.get("Content-Length")
            if declared is None or not declared.isascii() or not declared.isdigit():
                raise ProducerError("SOURCE_SIZE_MISMATCH")
            if int(declared) != expected_size:
                raise ProducerError("SOURCE_SIZE_MISMATCH")
            digest = hashlib.sha256()
            size = 0
            try:
                with destination.open("xb", buffering=0) as output:
                    while chunk := response.read(_CHUNK_BYTES):
                        if cancelled():
                            raise ProducerError("CANCELED")
                        size += len(chunk)
                        if size > maximum or size > expected_size:
                            raise ProducerError("SOURCE_SIZE_MISMATCH")
                        digest.update(chunk)
                        output.write(chunk)
                if size != expected_size:
                    raise ProducerError("SOURCE_SIZE_MISMATCH")
                if f"sha256:{digest.hexdigest()}" != expected_digest:
                    raise ProducerError("SOURCE_DIGEST_MISMATCH")
            except Exception:
                destination.unlink(missing_ok=True)
                raise
            return response.geturl()
        finally:
            response.close()


def _unique_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError
        result[key] = value
    return result


def _reject_constant(_value: str) -> None:
    raise ValueError


def parse_latest(data: bytes) -> LatestAsset:
    """Strictly resolve one official release asset."""
    try:
        document = json.loads(
            data.decode("utf-8", errors="strict"),
            object_pairs_hook=_unique_object,
            parse_constant=_reject_constant,
        )
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
        raise ProducerError("ARCHIVE_LATEST_INVALID") from error
    if (
        not isinstance(document, dict)
        or set(document) != _LATEST_FIELDS
        or not all(isinstance(key, str) for key in document)
    ):
        raise ProducerError("ARCHIVE_LATEST_INVALID")
    name = document.get("name")
    url = document.get("browser_download_url")
    size = document.get("size")
    digest = document.get("digest")
    identifier = document.get("id")
    created_at = document.get("created_at")
    updated_at = document.get("updated_at")
    api_url = document.get("url")
    label = document.get("label")
    node_id = document.get("node_id")
    try:
        created = (
            datetime.strptime(created_at, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=UTC)
            if isinstance(created_at, str) and _GITHUB_TIMESTAMP.fullmatch(created_at)
            else None
        )
        updated = (
            datetime.strptime(updated_at, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=UTC)
            if isinstance(updated_at, str) and _GITHUB_TIMESTAMP.fullmatch(updated_at)
            else None
        )
    except ValueError:
        created = None
        updated = None
    if (
        not isinstance(name, str)
        or _ASSET_NAME.fullmatch(name) is None
        or not isinstance(url, str)
        or url != f"https://github.com/bangumi/Archive/releases/download/archive/{name}"
        or isinstance(size, bool)
        or not isinstance(size, int)
        or size <= 0
        or size > _MAX_ARCHIVE_BYTES
        or not isinstance(digest, str)
        or _DIGEST.fullmatch(digest) is None
        or document.get("content_type") != "application/zip"
        or isinstance(identifier, bool)
        or not isinstance(identifier, int)
        or not 0 < identifier <= SAFE_INTEGER_MAX
        or api_url != f"https://api.github.com/repos/bangumi/Archive/releases/assets/{identifier}"
        or not isinstance(label, str)
        or len(label) > 255
        or not isinstance(node_id, str)
        or not 1 <= len(node_id) <= 255
        or created is None
        or updated is None
        or updated < created
        or name != f"dump-{created.strftime('%Y-%m-%d.%H%M%SZ')}.zip"
    ):
        raise ProducerError("ARCHIVE_IDENTITY_INVALID")
    return LatestAsset(name.removesuffix(".zip"), url, name, size, digest)


def _safe_member(info: zipfile.ZipInfo) -> None:
    pure = PurePosixPath(info.filename)
    mode = info.external_attr >> 16
    file_type = stat.S_IFMT(mode)
    if (
        pure.is_absolute()
        or len(pure.parts) != 1
        or pure.name != info.filename
        or pure.name not in ARCHIVE_MEMBER_NAMES
        or info.is_dir()
        or info.flag_bits & 0x1
        or info.compress_type not in {zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED}
        or info.file_size < 0
        or info.file_size > _MAX_MEMBER_BYTES
        or info.compress_size < 0
        or file_type not in {0, stat.S_IFREG}
    ):
        raise ProducerError("ARCHIVE_ZIP_INVALID")
    if info.compress_size == 0:
        if info.file_size != 0:
            raise ProducerError("ARCHIVE_ZIP_INVALID")
    elif info.file_size / info.compress_size > 200:
        raise ProducerError("ARCHIVE_ZIP_INVALID")


def verify_and_extract(
    archive_path: Path,
    destination: Path,
    cancelled: Callable[[], bool],
) -> tuple[SourceInput, ...]:
    """Validate the whole ZIP inventory and stream only required members out."""
    try:
        archive_metadata = archive_path.lstat()
        if stat.S_ISLNK(archive_metadata.st_mode) or not stat.S_ISREG(archive_metadata.st_mode):
            raise ProducerError("ARCHIVE_ZIP_INVALID")
        with zipfile.ZipFile(archive_path, "r") as archive:
            infos = archive.infolist()
            if (
                len(infos) != len(ARCHIVE_MEMBER_NAMES)
                or {info.filename for info in infos} != ARCHIVE_MEMBER_NAMES
                or len({info.filename for info in infos}) != len(infos)
            ):
                raise ProducerError("ARCHIVE_ZIP_INVALID")
            total = 0
            by_name: dict[str, zipfile.ZipInfo] = {}
            for info in infos:
                _safe_member(info)
                total += info.file_size
                if total > _MAX_UNCOMPRESSED_BYTES:
                    raise ProducerError("ARCHIVE_ZIP_INVALID")
                by_name[info.filename] = info
            destination.mkdir(mode=0o750)
            sources: list[SourceInput] = []
            for name in SOURCE_NAMES:
                if cancelled():
                    raise ProducerError("CANCELED")
                info = by_name[name]
                target = destination / name
                digest = hashlib.sha256()
                size = 0
                with archive.open(info, "r") as source, target.open("xb", buffering=0) as output:
                    while chunk := source.read(_CHUNK_BYTES):
                        if cancelled():
                            raise ProducerError("CANCELED")
                        size += len(chunk)
                        if size > info.file_size:
                            raise ProducerError("ARCHIVE_ZIP_INVALID")
                        digest.update(chunk)
                        output.write(chunk)
                if size != info.file_size:
                    raise ProducerError("ARCHIVE_ZIP_INVALID")
                value = f"sha256:{digest.hexdigest()}"
                sources.append(SourceInput(name, target, size, value, size, value))
            return tuple(sources)
    except (OSError, zipfile.BadZipFile, RuntimeError) as error:
        if isinstance(error, ProducerError):
            raise
        raise ProducerError("ARCHIVE_ZIP_INVALID") from error


def acquire(
    *,
    staging_root: Path,
    common_commit: str,
    client: AcquisitionClient | None = None,
    cancelled: Callable[[], bool] = lambda: False,
) -> AcquiredInputs:
    """Acquire one exact Archive asset and exact common catalog into staging."""
    if _COMMIT.fullmatch(common_commit) is None:
        raise ProducerError("COMMON_COMMIT_INVALID")
    active_client = StrictHTTPSClient() if client is None else client
    latest_bytes, latest_final = active_client.fetch_bytes(
        LATEST_URL,
        maximum=_MAX_LATEST_BYTES,
        allowed_hosts=_LATEST_HOSTS,
        cancelled=cancelled,
    )
    if len(latest_bytes) > _MAX_LATEST_BYTES or latest_final != LATEST_URL:
        raise ProducerError("ARCHIVE_LATEST_INVALID")
    latest = parse_latest(latest_bytes)
    download_root = staging_root / "download"
    try:
        download_root.mkdir(mode=0o750)
    except OSError as error:
        raise ProducerError("STAGING_CREATE_FAILED") from error
    archive_path = download_root / latest.name
    final_asset_url = active_client.download(
        latest.url,
        archive_path,
        expected_size=latest.size,
        expected_digest=latest.digest,
        maximum=_MAX_ARCHIVE_BYTES,
        allowed_hosts=_ASSET_HOSTS,
        cancelled=cancelled,
    )
    _validate_url(final_asset_url, _ASSET_HOSTS)
    common_url = (
        f"https://raw.githubusercontent.com/bangumi/common/{common_commit}/subject_staffs.yml"
    )
    common_bytes, final_common_url = active_client.fetch_bytes(
        common_url,
        maximum=_MAX_COMMON_BYTES,
        allowed_hosts=_COMMON_HOSTS,
        cancelled=cancelled,
    )
    if not common_bytes or len(common_bytes) > _MAX_COMMON_BYTES or final_common_url != common_url:
        raise ProducerError("COMMON_IDENTITY_INVALID")
    common_digest = digest_bytes(common_bytes)
    common_size = len(common_bytes)
    sources = verify_and_extract(archive_path, staging_root / "sources", cancelled)
    actual_size, actual_digest = digest_file(archive_path, cancelled)
    if actual_size != latest.size or actual_digest != latest.digest:
        raise ProducerError("ARCHIVE_IDENTITY_INVALID")
    return AcquiredInputs(
        latest.release,
        latest.url,
        latest.name,
        latest.size,
        latest.digest,
        common_commit,
        common_url,
        common_size,
        common_digest,
        common_bytes,
        sources,
    )
