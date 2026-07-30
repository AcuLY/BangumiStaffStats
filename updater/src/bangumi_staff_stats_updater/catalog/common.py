"""Strict pinned-common parsing without static position enums."""

from __future__ import annotations

import re
from collections.abc import Mapping
from typing import Final, cast

from .errors import CatalogError
from .model import (
    SUBJECT_CODES,
    SUBJECT_TYPES,
    CommonCatalog,
    CommonCategory,
    CommonPosition,
    Names,
)
from .yamlio import load_yaml

_SAFE_INTEGER_MAX: Final = 9_007_199_254_740_991
_CATEGORY_KEY: Final = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
_POSITION_FIELDS: Final = frozenset({"en", "cn", "jp", "rdf", "categories", "desc"})


def _mapping(value: object, code: str) -> dict[object, object]:
    if not isinstance(value, dict):
        raise CatalogError(code)
    return cast(dict[object, object], value)


def _string_mapping(value: object, code: str) -> dict[str, object]:
    document = _mapping(value, code)
    if not all(isinstance(key, str) for key in document):
        raise CatalogError(code)
    return cast(dict[str, object], document)


def _safe_integer(
    value: object,
    code: str,
    *,
    positive: bool = False,
    allow_null: bool = False,
) -> int | None:
    if allow_null and value is None:
        return None
    if (
        isinstance(value, bool)
        or not isinstance(value, int)
        or abs(value) > _SAFE_INTEGER_MAX
        or (positive and value <= 0)
    ):
        raise CatalogError(code)
    return value


def _text(value: object, code: str, *, maximum: int, required: bool = False) -> str | None:
    if value is None or value == "":
        if required:
            raise CatalogError(code)
        return None
    if (
        not isinstance(value, str)
        or not 1 <= len(value) <= maximum
        or "\x00" in value
        or "\r" in value
        or "\n" in value
    ):
        raise CatalogError(code)
    return value


def _names(value: object, code: str) -> Names:
    document = _string_mapping(value, code)
    if set(document) != {"cn", "en", "jp"}:
        raise CatalogError(code)
    return Names(
        _text(document["cn"], code, maximum=255, required=True),
        _text(document["en"], code, maximum=255),
        _text(document["jp"], code, maximum=255),
    )


def _category_from_common(
    subject_type: str,
    value: object,
    source_index: int,
) -> CommonCategory:
    document = _string_mapping(value, "COMMON_CATALOG_INVALID")
    if set(document) != {"order", "en", "cn"}:
        raise CatalogError("COMMON_CATALOG_INVALID")
    key = _text(document["en"], "COMMON_CATALOG_INVALID", maximum=64, required=True)
    label = _text(
        document["cn"],
        "COMMON_CATEGORY_CHINESE_LABEL_MISSING",
        maximum=255,
        required=True,
    )
    if key is None or label is None or _CATEGORY_KEY.fullmatch(key) is None:
        raise CatalogError("COMMON_CATALOG_INVALID")
    order = _safe_integer(document["order"], "COMMON_CATALOG_INVALID")
    return CommonCategory(subject_type, key, Names(label, key, None), order, source_index)


def _parse_pinned_common(value: object) -> CommonCatalog:
    document = _string_mapping(value, "COMMON_CATALOG_INVALID")
    if set(document) != {"define", "staffs"}:
        raise CatalogError("COMMON_CATALOG_INVALID")
    define = _string_mapping(document["define"], "COMMON_CATALOG_INVALID")
    if set(define) != {"type", "categories", "types"}:
        raise CatalogError("COMMON_CATALOG_INVALID")

    raw_types = _string_mapping(define["type"], "COMMON_CATALOG_INVALID")
    expected_types = {subject_type: code for code, subject_type in SUBJECT_CODES.items()}
    if raw_types != expected_types:
        raise CatalogError("COMMON_CATALOG_INVALID")

    raw_staffs = _mapping(document["staffs"], "COMMON_CATALOG_INVALID")
    if set(raw_staffs) != set(SUBJECT_CODES):
        raise CatalogError("COMMON_TYPE_SET_INVALID")
    raw_defined_types = _string_mapping(define["types"], "COMMON_CATALOG_INVALID")
    if set(raw_defined_types) != set(SUBJECT_TYPES):
        raise CatalogError("COMMON_TYPE_SET_INVALID")
    for code, subject_type in SUBJECT_CODES.items():
        if raw_defined_types[subject_type] != raw_staffs[code]:
            raise CatalogError("COMMON_CATALOG_INVALID")

    categories_by_type: dict[str, tuple[CommonCategory, ...]] = dict.fromkeys(
        SUBJECT_TYPES,
        (),
    )
    raw_categories = _string_mapping(define["categories"], "COMMON_CATALOG_INVALID")
    if not set(raw_categories).issubset(SUBJECT_TYPES):
        raise CatalogError("COMMON_CATALOG_INVALID")
    for subject_type, values in raw_categories.items():
        if not isinstance(values, list):
            raise CatalogError("COMMON_CATALOG_INVALID")
        categories = tuple(
            _category_from_common(subject_type, item, index) for index, item in enumerate(values)
        )
        if len({item.key for item in categories}) != len(categories):
            raise CatalogError("DUPLICATE_COMMON_CATEGORY")
        categories_by_type[subject_type] = categories

    positions: list[CommonPosition] = []
    for code, subject_type in SUBJECT_CODES.items():
        raw_positions = _mapping(raw_staffs[code], "COMMON_CATALOG_INVALID")
        identities: set[int] = set()
        category_lookup = {item.key: item for item in categories_by_type[subject_type]}
        for source_index, (raw_id, raw_value) in enumerate(raw_positions.items()):
            position_id = _safe_integer(raw_id, "COMMON_CATALOG_INVALID", positive=True)
            if position_id is None or position_id in identities:
                raise CatalogError("DUPLICATE_COMMON_POSITION")
            identities.add(position_id)
            item = _string_mapping(raw_value, "COMMON_CATALOG_INVALID")
            if not {"cn"}.issubset(item) or not set(item).issubset(_POSITION_FIELDS):
                raise CatalogError("COMMON_CATALOG_INVALID")
            for optional in ("rdf", "desc"):
                if optional in item:
                    _text(item[optional], "COMMON_CATALOG_INVALID", maximum=4096)
            names = Names(
                _text(
                    item.get("cn"),
                    "COMMON_CHINESE_LABEL_MISSING",
                    maximum=255,
                    required=True,
                ),
                _text(item.get("en"), "COMMON_CATALOG_INVALID", maximum=255),
                _text(item.get("jp"), "COMMON_CATALOG_INVALID", maximum=255),
            )
            raw_position_categories = item.get("categories", [])
            if not isinstance(raw_position_categories, list):
                raise CatalogError("COMMON_CATALOG_INVALID")
            category_keys: list[str] = []
            for raw_category in raw_position_categories:
                category_document = _string_mapping(
                    raw_category,
                    "COMMON_CATALOG_INVALID",
                )
                key = _text(
                    category_document.get("en"),
                    "COMMON_CATALOG_INVALID",
                    maximum=64,
                    required=True,
                )
                if key is None or key not in category_lookup:
                    raise CatalogError("UNKNOWN_COMMON_CATEGORY_REFERENCE")
                expected = category_lookup[key]
                actual = _category_from_common(
                    subject_type,
                    category_document,
                    expected.source_index,
                )
                if actual != expected or key in category_keys:
                    raise CatalogError("COMMON_CATALOG_INVALID")
                category_keys.append(key)
            positions.append(
                CommonPosition(
                    subject_type,
                    position_id,
                    names,
                    None,
                    source_index,
                    tuple(category_keys),
                )
            )
    return CommonCatalog(
        tuple(
            category
            for subject_type in SUBJECT_TYPES
            for category in categories_by_type[subject_type]
        ),
        tuple(positions),
    )


def parse_common_catalog(data: bytes) -> CommonCatalog:
    """Parse exact pinned `subject_staffs.yml` bytes."""
    return _parse_pinned_common(load_yaml(data, "COMMON_CATALOG_INVALID"))


def parse_contract_common(value: object) -> CommonCatalog:
    """Parse the language-neutral Contracts common-catalog shape for tests."""
    if not isinstance(value, list):
        raise CatalogError("COMMON_CATALOG_INVALID")
    entries = [
        _string_mapping(item, "COMMON_CATALOG_INVALID") for item in cast(list[object], value)
    ]
    if len(entries) != len(SUBJECT_TYPES) or {entry.get("subjectType") for entry in entries} != set(
        SUBJECT_TYPES
    ):
        raise CatalogError("COMMON_TYPE_SET_INVALID")
    categories: list[CommonCategory] = []
    positions: list[CommonPosition] = []
    for subject_type in SUBJECT_TYPES:
        entry = next(item for item in entries if item["subjectType"] == subject_type)
        if set(entry) != {"subjectType", "categories", "positions"}:
            raise CatalogError("COMMON_CATALOG_INVALID")
        raw_categories = entry["categories"]
        raw_positions = entry["positions"]
        if not isinstance(raw_categories, list) or not isinstance(raw_positions, list):
            raise CatalogError("COMMON_CATALOG_INVALID")
        local_categories: list[CommonCategory] = []
        for raw_category in raw_categories:
            item = _string_mapping(raw_category, "COMMON_CATALOG_INVALID")
            if set(item) != {"key", "names", "order", "sourceIndex"}:
                raise CatalogError("COMMON_CATALOG_INVALID")
            key = _text(item["key"], "COMMON_CATALOG_INVALID", maximum=64, required=True)
            if key is None or _CATEGORY_KEY.fullmatch(key) is None:
                raise CatalogError("COMMON_CATALOG_INVALID")
            source_index = _safe_integer(
                item["sourceIndex"],
                "COMMON_CATALOG_INVALID",
            )
            if source_index is None or source_index < 0:
                raise CatalogError("COMMON_CATALOG_INVALID")
            local_categories.append(
                CommonCategory(
                    subject_type,
                    key,
                    _names(item["names"], "COMMON_CATEGORY_CHINESE_LABEL_MISSING"),
                    _safe_integer(
                        item["order"],
                        "COMMON_CATALOG_INVALID",
                        allow_null=True,
                    ),
                    source_index,
                )
            )
        if len({item.key for item in local_categories}) != len(local_categories):
            raise CatalogError("DUPLICATE_COMMON_CATEGORY")
        category_keys = {item.key for item in local_categories}
        identities: set[int] = set()
        for raw_position in raw_positions:
            item = _string_mapping(raw_position, "COMMON_CATALOG_INVALID")
            if set(item) != {
                "id",
                "names",
                "order",
                "sourceIndex",
                "categoryKeys",
            }:
                raise CatalogError("COMMON_CATALOG_INVALID")
            position_id = _safe_integer(
                item["id"],
                "COMMON_CATALOG_INVALID",
                positive=True,
            )
            source_index = _safe_integer(
                item["sourceIndex"],
                "COMMON_CATALOG_INVALID",
            )
            raw_keys = item["categoryKeys"]
            if (
                position_id is None
                or source_index is None
                or source_index < 0
                or position_id in identities
                or not isinstance(raw_keys, list)
                or not all(isinstance(key, str) for key in raw_keys)
            ):
                raise CatalogError("COMMON_CATALOG_INVALID")
            identities.add(position_id)
            keys = tuple(cast(list[str], raw_keys))
            if len(set(keys)) != len(keys) or not set(keys).issubset(category_keys):
                raise CatalogError("UNKNOWN_COMMON_CATEGORY_REFERENCE")
            positions.append(
                CommonPosition(
                    subject_type,
                    position_id,
                    _names(item["names"], "COMMON_CHINESE_LABEL_MISSING"),
                    _safe_integer(
                        item["order"],
                        "COMMON_CATALOG_INVALID",
                        allow_null=True,
                    ),
                    source_index,
                    keys,
                )
            )
        categories.extend(local_categories)
    return CommonCatalog(tuple(categories), tuple(positions))


def common_catalog_index(
    catalog: CommonCatalog,
) -> Mapping[str, tuple[CommonCategory, ...] | tuple[CommonPosition, ...]]:
    """Return a compact deterministic inventory for reports."""
    return {
        "categories": tuple(catalog.categories),
        "positions": tuple(catalog.positions),
    }
