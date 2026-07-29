"""Bounded acquisition and safe ZIP tests."""

from __future__ import annotations

import hashlib
import io
import json
import socket
import ssl
import urllib.request
import zipfile
from collections.abc import Callable
from pathlib import Path
from typing import cast

import pytest

from bangumi_staff_stats_updater.producer.acquisition import (
    LATEST_URL,
    AcquiredInputs,
    StrictHTTPSClient,
    _ExplicitHTTPSProxyHandler,
    acquire,
    parse_latest,
    validate_https_proxy,
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


@pytest.mark.parametrize(
    "value",
    [
        "",
        "HTTP://proxy.example:7897",
        "https://proxy.example:7897",
        "http://proxy.example",
        "http://proxy.example:0",
        "http://proxy.example:01",
        "http://proxy.example:65536",
        "http://Proxy.example:7897",
        "http://-proxy.example:7897",
        "http://proxy-.example:7897",
        "http://proxy..example:7897",
        "http://proxy.example.:7897",
        "http://user@proxy.example:7897",
        "http://proxy.example:7897/",
        "http://proxy.example:7897/path",
        "http://proxy.example:7897?query",
        "http://proxy.example:7897#fragment",
        "http://[::1]:7897",
        "http://pröxy.example:7897",
        "x" * 321,
    ],
)
def test_dedicated_proxy_rejects_every_noncanonical_spelling(value: str) -> None:
    with pytest.raises(ProducerError, match=r"^HTTPS_PROXY_INVALID$") as failure:
        validate_https_proxy(value)
    if value:
        assert value not in str(failure.value)


def test_dedicated_proxy_accepts_only_the_canonical_value() -> None:
    value = "http://proxy-1.internal.example:7897"
    assert validate_https_proxy(None) is None
    assert validate_https_proxy(value) == value


def test_dedicated_proxy_enforces_host_label_and_port_boundaries() -> None:
    host_253 = ".".join(("a" * 63, "b" * 63, "c" * 63, "d" * 61))
    host_254 = ".".join(("a" * 63, "b" * 63, "c" * 63, "d" * 62))
    assert len(host_253) == 253
    assert len(host_254) == 254
    assert validate_https_proxy(f"http://{host_253}:65535") == f"http://{host_253}:65535"
    for value in (
        f"http://{host_254}:7897",
        f"http://{'a' * 64}.example:7897",
        "http://proxy.example:65536",
    ):
        with pytest.raises(ProducerError, match=r"^HTTPS_PROXY_INVALID$"):
            validate_https_proxy(value)


def test_explicit_proxy_uses_real_urllib_connect_and_destination_tls(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    proxy_bytes = b"HTTP/1.0 200 Connection established\r\n\r\n"
    origin_bytes = b"HTTP/1.1 200 OK\r\nContent-Length: 3\r\nConnection: close\r\n\r\nok\n"
    proxy_writes: list[bytes] = []
    origin_writes: list[bytes] = []
    connection_targets: list[tuple[str, int]] = []
    server_names: list[str | None] = []
    default_context_calls = 0

    class _Socket:
        def __init__(self, response: bytes, writes: list[bytes]) -> None:
            self._response = response
            self._writes = writes

        def setsockopt(self, *_args: object) -> None:
            return None

        def sendall(self, data: bytes) -> None:
            self._writes.append(data)

        def makefile(self, *_args: object, **_kwargs: object) -> io.BytesIO:
            return io.BytesIO(self._response)

        def close(self) -> None:
            return None

    proxy_socket = _Socket(proxy_bytes, proxy_writes)
    origin_socket = _Socket(origin_bytes, origin_writes)

    class _TLSContext:
        def __init__(self) -> None:
            default = ssl.create_default_context()
            self.check_hostname = default.check_hostname
            self.verify_mode = default.verify_mode
            self.post_handshake_auth: bool | None = None
            self.alpn_protocols: list[str] = []

        def set_alpn_protocols(self, protocols: list[str]) -> None:
            self.alpn_protocols = protocols

        def wrap_socket(
            self,
            raw_socket: object,
            *,
            server_hostname: str | None,
        ) -> object:
            assert raw_socket is proxy_socket
            server_names.append(server_hostname)
            return origin_socket

    tls_context = _TLSContext()

    def default_https_context() -> _TLSContext:
        nonlocal default_context_calls
        default_context_calls += 1
        return tls_context

    def create_connection(
        address: tuple[str, int],
        *_args: object,
        **_kwargs: object,
    ) -> socket.socket:
        connection_targets.append(address)
        return cast(socket.socket, proxy_socket)

    def forbidden_bypass(_host: str) -> bool:
        raise AssertionError("ambient proxy bypass was consulted")

    def forbidden_getproxies() -> dict[str, str]:
        raise AssertionError("ambient proxies were consulted")

    monkeypatch.setenv("HTTP_PROXY", "http://ambient.invalid:1")
    monkeypatch.setenv("HTTPS_PROXY", "http://ambient.invalid:2")
    monkeypatch.setenv("ALL_PROXY", "http://ambient.invalid:3")
    monkeypatch.setenv("NO_PROXY", "*")
    monkeypatch.setenv("no_proxy", "raw.githubusercontent.com")
    monkeypatch.setattr(socket, "create_connection", create_connection)
    monkeypatch.setattr(ssl, "_create_default_https_context", default_https_context)
    monkeypatch.setattr(urllib.request, "proxy_bypass", forbidden_bypass)
    monkeypatch.setattr(urllib.request, "getproxies", forbidden_getproxies)

    opener = urllib.request.build_opener(_ExplicitHTTPSProxyHandler("http://proxy.internal:7897"))
    request = urllib.request.Request(  # noqa: S310 - fixed HTTPS origin under test.
        LATEST_URL,
        method="GET",
    )
    with opener.open(request, timeout=60) as response:
        assert response.read() == b"ok\n"

    assert connection_targets == [("proxy.internal", 7897)]
    assert len(proxy_writes) == 1
    assert proxy_writes[0].startswith(b"CONNECT raw.githubusercontent.com:443 HTTP/1.1\r\n")
    assert len(origin_writes) == 1
    assert origin_writes[0].startswith(b"GET /bangumi/Archive/master/aux/latest.json HTTP/1.1\r\n")
    assert server_names == ["raw.githubusercontent.com"]
    assert default_context_calls == 1
    assert tls_context.check_hostname is True
    assert tls_context.verify_mode == ssl.CERT_REQUIRED
    assert tls_context.alpn_protocols == ["http/1.1"]


def test_direct_client_installs_an_explicit_empty_proxy_handler(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    observed: list[tuple[object, ...]] = []

    class _FailingOpener:
        def open(self, _request: object, *, timeout: int) -> None:
            assert timeout == 60
            raise OSError("offline unit boundary")

    def build_opener(*handlers: object) -> _FailingOpener:
        observed.append(handlers)
        return _FailingOpener()

    def forbidden_getproxies() -> dict[str, str]:
        raise AssertionError("ambient proxies were consulted")

    monkeypatch.setattr(urllib.request, "build_opener", build_opener)
    monkeypatch.setattr(urllib.request, "getproxies", forbidden_getproxies)
    with pytest.raises(ProducerError, match=r"^HTTPS_REQUEST_FAILED$"):
        StrictHTTPSClient().fetch_bytes(
            LATEST_URL,
            maximum=1,
            allowed_hosts=frozenset({"raw.githubusercontent.com"}),
            cancelled=lambda: False,
        )
    assert len(observed) == 1
    proxy_handlers = [
        handler for handler in observed[0] if isinstance(handler, urllib.request.ProxyHandler)
    ]
    assert len(proxy_handlers) == 1
    assert proxy_handlers[0].proxies == {}


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
