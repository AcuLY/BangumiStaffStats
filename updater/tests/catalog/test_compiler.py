"""Dynamic common/group/staff-set compiler tests."""

from __future__ import annotations

import copy
import json
from dataclasses import replace
from pathlib import Path
from typing import cast

import pytest

from bangumi_staff_stats_updater.catalog.common import parse_contract_common
from bangumi_staff_stats_updater.catalog.compiler import (
    compile_catalog,
    diff_common_catalogs,
)
from bangumi_staff_stats_updater.catalog.config import configuration_from_documents
from bangumi_staff_stats_updater.catalog.errors import CatalogError
from bangumi_staff_stats_updater.catalog.model import CommonCatalog, Names


def _case(contracts_root: Path) -> dict[str, object]:
    path = contracts_root / "goldens" / "catalog" / "cases" / "complete-derivation.json"
    return cast(dict[str, object], json.loads(path.read_bytes()))


def _base(
    contracts_root: Path,
) -> tuple[dict[str, object], CommonCatalog, dict[str, object], dict[str, object]]:
    document = _case(contracts_root)
    inputs = cast(dict[str, object], document["input"])
    common = parse_contract_common(inputs["commonCatalog"])
    display = cast(dict[str, object], inputs["displayConfig"])
    staff_sets = cast(dict[str, object], inputs["staffSetConfig"])
    return document, common, display, staff_sets


def _variant_codes(document: dict[str, object], mutation_id: str) -> tuple[str, ...]:
    expected = cast(dict[str, object], document["expected"])
    variants = cast(list[dict[str, object]], expected["variants"])
    variant = next(item for item in variants if item["mutationId"] == mutation_id)
    return tuple(cast(list[str], variant["errorCodes"]))


def test_complete_contract_common_compiles_all_dynamic_entities(
    contracts_root: Path,
) -> None:
    _document, common, display, staff_sets = _base(contracts_root)
    configuration = configuration_from_documents(display, staff_sets, contracts_root)
    compiled = compile_catalog(common, configuration)
    position_by_key = {item.position_key: item for item in compiled.positions}
    group_by_key = {item.group_key: item for item in compiled.groups}

    assert len(compiled.ordered_positions) == 24
    assert len(compiled.positions) == 28
    assert compiled.staff_sets == ()
    assert all(f"staff:anime:{value}" in position_by_key for value in range(101, 107))
    assert position_by_key["staff:anime:104"].position_kind == "staff"
    assert position_by_key["cast:anime:main"].rule_key == "exclusive:cast:anime"
    assert position_by_key["cast:anime:all"].rule_key == "exclusive:cast:anime"
    assert position_by_key["cast:anime:main"].rule_value == "1"
    assert position_by_key["cast:anime:all"].rule_value == "1..6"
    assert group_by_key["shortcut:anime:cast"].position_keys == (
        "cast:anime:main",
        "cast:anime:all",
    )
    assert group_by_key["fallback:anime:other"].position_keys == ("staff:anime:201",)
    assert group_by_key["fallback:music:all"].position_keys == ("staff:music:300",)
    assert "staff:anime:200" in group_by_key["bangumi:anime:direction"].position_keys
    assert "staff:anime:200" in group_by_key["bangumi:anime:writing"].position_keys


def test_synthetic_staff_set_is_sorted_and_activates_only_its_custom_group(
    contracts_root: Path,
) -> None:
    _document, common, display, _staff_sets = _base(contracts_root)
    synthetic_path = (
        contracts_root / "goldens" / "catalog" / "config" / "staff-sets-synthetic-v1.json"
    )
    synthetic = cast(dict[str, object], json.loads(synthetic_path.read_bytes()))
    configuration = configuration_from_documents(display, synthetic, contracts_root)
    compiled = compile_catalog(common, configuration)
    assert len(compiled.staff_sets) == 1
    staff_set = compiled.staff_sets[0]
    assert staff_set.members == tuple(sorted(staff_set.members))
    assert staff_set.capabilities == (
        "rankings",
        "candidates",
        "personDetail",
        "partners",
        "coStar",
    )
    custom = next(item for item in compiled.groups if item.group_key == "custom:anime:staff-sets")
    assert custom.position_keys == (staff_set.key,)


@pytest.mark.parametrize(
    ("mutation_id", "replacement"),
    [
        ("cross-type-staff-set-member", "staff:game:1001"),
        ("cast-staff-set-member", "cast:anime:all"),
        ("unknown-staff-set-member", "staff:anime:999999"),
    ],
)
def test_invalid_staff_set_uses_a_contract_declared_error(
    contracts_root: Path,
    mutation_id: str,
    replacement: str,
) -> None:
    document, common, display, _staff_sets = _base(contracts_root)
    synthetic_path = (
        contracts_root / "goldens" / "catalog" / "config" / "staff-sets-synthetic-v1.json"
    )
    synthetic = cast(dict[str, object], json.loads(synthetic_path.read_bytes()))
    mutated = copy.deepcopy(synthetic)
    first = cast(list[dict[str, object]], mutated["sets"])[0]
    cast(list[str], first["members"])[1] = replacement
    with pytest.raises(CatalogError) as raised:
        configuration = configuration_from_documents(display, mutated, contracts_root)
        compile_catalog(common, configuration)
    assert raised.value.code in _variant_codes(document, mutation_id)


def test_structured_common_diff_reports_category_and_order_only_drift(
    contracts_root: Path,
) -> None:
    _document, common, _display, _staff_sets = _base(contracts_root)
    first_category = common.categories[0]
    first_position = common.positions[0]
    changed = CommonCatalog(
        (
            replace(
                first_category,
                names=Names("改名分类", first_category.names.en, first_category.names.jp),
                order=(first_category.order or 0) + 1,
            ),
            *common.categories[1:],
        ),
        (
            replace(first_position, source_index=first_position.source_index + 10),
            *common.positions[1:],
        ),
    )
    report = diff_common_catalogs(common, changed)
    assert report["additions"] == []
    assert report["deletions"] == []
    assert report["categoryChanges"] == []
    assert len(cast(list[object], report["categoryRenames"])) == 1
    assert len(cast(list[object], report["categoryOrderChanges"])) == 1
    assert len(cast(list[object], report["orderChanges"])) == 1


@pytest.mark.parametrize(
    "mutation_id",
    [
        "missing-featured-position",
        "duplicate-featured-position",
        "missing-cast-anchor",
        "missing-chinese-label",
        "missing-category-chinese-label",
        "additional-staff-set-group-collision",
        "cast-anchor-label-drift",
    ],
)
def test_indexed_configuration_and_common_mutations_are_all_or_nothing(
    contracts_root: Path,
    mutation_id: str,
) -> None:
    document = _case(contracts_root)
    inputs = copy.deepcopy(cast(dict[str, object], document["input"]))
    display = cast(dict[str, object], inputs["displayConfig"])
    staff_sets = cast(dict[str, object], inputs["staffSetConfig"])
    common_value = cast(list[dict[str, object]], inputs["commonCatalog"])
    if mutation_id == "missing-featured-position":
        featured = cast(list[dict[str, object]], display["featuredGroups"])
        cast(list[str], featured[0]["positionKeys"])[0] = "staff:anime:999999"
    elif mutation_id == "duplicate-featured-position":
        featured = cast(list[dict[str, object]], display["featuredGroups"])
        keys = cast(list[str], featured[0]["positionKeys"])
        keys[1] = keys[0]
    elif mutation_id == "missing-cast-anchor":
        cast(list[dict[str, object]], display["castGroups"])[0]["anchorCategoryKey"] = (
            "missing-music"
        )
    elif mutation_id == "missing-chinese-label":
        anime = next(item for item in common_value if item["subjectType"] == "anime")
        positions = cast(list[dict[str, object]], anime["positions"])
        cast(dict[str, object], next(item for item in positions if item["id"] == 201)["names"])[
            "cn"
        ] = None
    elif mutation_id == "missing-category-chinese-label":
        anime = next(item for item in common_value if item["subjectType"] == "anime")
        categories = cast(list[dict[str, object]], anime["categories"])
        cast(
            dict[str, object],
            next(item for item in categories if item["key"] == "visual")["names"],
        )["cn"] = None
    elif mutation_id == "additional-staff-set-group-collision":
        synthetic_path = (
            contracts_root / "goldens" / "catalog" / "config" / "staff-sets-synthetic-v1.json"
        )
        staff_sets = cast(dict[str, object], json.loads(synthetic_path.read_bytes()))
        cast(list[dict[str, object]], display["additionalDisplayGroups"]).append(
            {
                "groupKey": "custom:anime:staff-sets",
                "subjectType": "anime",
                "label": "重复集合分组",
                "displayOrder": 1,
                "positionKeys": ["staff:anime:2"],
            }
        )
    elif mutation_id == "cast-anchor-label-drift":
        anime = next(item for item in common_value if item["subjectType"] == "anime")
        categories = cast(list[dict[str, object]], anime["categories"])
        cast(
            dict[str, object],
            next(item for item in categories if item["key"] == "music")["names"],
        )["cn"] = "音频类"

    produced: list[object] = []
    with pytest.raises(CatalogError) as raised:
        common = parse_contract_common(common_value)
        configuration = configuration_from_documents(display, staff_sets, contracts_root)
        produced.append(compile_catalog(common, configuration))
    assert raised.value.code in _variant_codes(document, mutation_id)
    assert produced == []


@pytest.mark.parametrize(
    ("mutate", "expected_code"),
    [
        ("bad-key", "STAFF_SET_CONFIG_SCHEMA_INVALID"),
        ("type-mismatch", "STAFF_SET_TYPE_MISMATCH"),
        ("empty-label", "STAFF_SET_CONFIG_SCHEMA_INVALID"),
        ("zero-order", "STAFF_SET_CONFIG_SCHEMA_INVALID"),
        ("duplicate-member", "STAFF_SET_CONFIG_SCHEMA_INVALID"),
        ("nested-member", "STAFF_SET_CONFIG_SCHEMA_INVALID"),
        ("capability-override", "STAFF_SET_CONFIG_SCHEMA_INVALID"),
    ],
)
def test_staff_set_extension_rejects_every_governed_boundary(
    contracts_root: Path,
    mutate: str,
    expected_code: str,
) -> None:
    _document, common, display, _staff_sets = _base(contracts_root)
    synthetic_path = (
        contracts_root / "goldens" / "catalog" / "config" / "staff-sets-synthetic-v1.json"
    )
    staff_sets = cast(dict[str, object], json.loads(synthetic_path.read_bytes()))
    first = cast(list[dict[str, object]], staff_sets["sets"])[0]
    if mutate == "bad-key":
        first["key"] = "staffset:anime:Bad"
    elif mutate == "type-mismatch":
        first["subjectType"] = "game"
    elif mutate == "empty-label":
        first["label"] = ""
    elif mutate == "zero-order":
        first["displayOrder"] = 0
    elif mutate == "duplicate-member":
        members = cast(list[str], first["members"])
        members[1] = members[0]
    elif mutate == "nested-member":
        cast(list[str], first["members"])[1] = "staffset:anime:directors"
    elif mutate == "capability-override":
        first["capabilities"] = ["rankings"]

    produced: list[object] = []
    with pytest.raises(CatalogError) as raised:
        configuration = configuration_from_documents(display, staff_sets, contracts_root)
        produced.append(compile_catalog(common, configuration))
    assert raised.value.code == expected_code
    assert produced == []
