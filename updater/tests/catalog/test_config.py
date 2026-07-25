"""Governed configuration identity tests."""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import cast

import pytest

from bangumi_staff_stats_updater.catalog.config import (
    configuration_from_documents,
    load_configuration,
)
from bangumi_staff_stats_updater.catalog.errors import CatalogError
from bangumi_staff_stats_updater.catalog.yamlio import load_yaml


def _case(contracts_root: Path) -> dict[str, object]:
    path = contracts_root / "goldens" / "catalog" / "cases" / "complete-derivation.json"
    return cast(dict[str, object], json.loads(path.read_bytes()))


def test_repository_configuration_matches_contract_canonical_identity(
    contracts_root: Path,
) -> None:
    display_path = Path(__file__).resolve().parents[2] / "config" / "catalog" / "display-v1.yaml"
    configuration = load_configuration(display_path, contracts_root)
    expected = cast(
        dict[str, object],
        cast(dict[str, object], _case(contracts_root)["expected"])["canonicalConfig"],
    )
    assert configuration.canonical_bytes == cast(str, expected["bytesUtf8"]).encode()
    assert configuration.digest == expected["digest"]
    assert configuration.staff_sets == {"schemaVersion": 1, "sets": []}


def test_staff_set_member_order_is_non_semantic(
    contracts_root: Path,
) -> None:
    document = _case(contracts_root)
    inputs = cast(dict[str, object], document["input"])
    display = inputs["displayConfig"]
    synthetic_path = (
        contracts_root / "goldens" / "catalog" / "config" / "staff-sets-synthetic-v1.json"
    )
    staff_sets = cast(dict[str, object], json.loads(synthetic_path.read_bytes()))
    reordered = copy.deepcopy(staff_sets)
    sets = cast(list[dict[str, object]], reordered["sets"])
    cast(list[object], sets[0]["members"]).reverse()
    first = configuration_from_documents(display, staff_sets, contracts_root)
    second = configuration_from_documents(display, reordered, contracts_root)
    assert first.canonical_bytes == second.canonical_bytes
    assert first.digest == second.digest


@pytest.mark.parametrize(
    "data",
    [
        b"schemaVersion: 1\nschemaVersion: 1\n",
        b"\xffschemaVersion: 1\n",
    ],
)
def test_yaml_rejects_duplicate_keys_and_invalid_utf8(data: bytes) -> None:
    with pytest.raises(CatalogError):
        load_yaml(data, "DISPLAY_CONFIG_INVALID")
