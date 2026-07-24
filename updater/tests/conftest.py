"""Shared test fixtures for the updater foundation."""

from __future__ import annotations

import socket
from collections.abc import Iterator
from pathlib import Path
from typing import NoReturn

import pytest


@pytest.fixture
def contracts_root() -> Path:
    """Return the repository's authoritative contracts root."""
    return Path(__file__).resolve().parents[2] / "contracts"


def _deny_network(*_args: object, **_kwargs: object) -> NoReturn:
    raise AssertionError("product tests must not access the public network")


@pytest.fixture(autouse=True)
def deny_public_network(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Fail every test that attempts a socket connection."""
    monkeypatch.setattr(socket, "create_connection", _deny_network)
    monkeypatch.setattr(socket.socket, "connect", _deny_network)
    yield
