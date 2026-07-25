"""Strict governed catalog configuration and canonical identity."""

from __future__ import annotations

import hashlib
import json
import re
import stat
from dataclasses import dataclass
from pathlib import Path
from typing import Final, cast

from jsonschema import Draft202012Validator

from .errors import CatalogError
from .model import CAPABILITIES, SUBJECT_TYPES
from .yamlio import load_yaml

_MAX_CONFIG_BYTES: Final = 4 * 1024 * 1024
_EXPECTED_RULE_KEYS: Final = (
    ("book", "staff"),
    ("anime", "staff"),
    ("music", "staff"),
    ("game", "staff"),
    ("real", "staff"),
    ("anime", "cast"),
    ("game", "cast"),
)
_EXPECTED_FEATURED: Final = {
    "anime": (
        "staff:anime:2",
        "staff:anime:67",
        "cast:anime:main",
        "cast:anime:all",
        "staff:anime:3",
        "staff:anime:10",
        "staff:anime:74",
        "staff:anime:1",
        "staff:anime:5",
        "staff:anime:4",
    ),
    "game": (
        "staff:game:1004",
        "staff:game:1001",
        "cast:game:all",
        "cast:game:main",
        "staff:game:1013",
    ),
}
_EXPECTED_CAST: Final = {
    "anime": ("cast:anime:main", "cast:anime:all"),
    "game": ("cast:game:main", "cast:game:all"),
}
_STAFF_SET_KEY = re.compile(
    r"^staffset:(book|anime|music|game|real):(?=[a-z0-9-]{1,64}$)"
    r"[a-z0-9]+(?:-[a-z0-9]+)*$"
)


@dataclass(frozen=True, slots=True)
class CatalogConfiguration:
    """Validated configuration plus its exact canonical identity."""

    display: dict[str, object]
    staff_sets: dict[str, object]
    canonical_bytes: bytes
    digest: str


def _strict_pairs(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON key")
        result[key] = value
    return result


def _document(value: object, code: str) -> dict[str, object]:
    if not isinstance(value, dict) or not all(isinstance(key, str) for key in value):
        raise CatalogError(code)
    return cast(dict[str, object], value)


def _objects(value: object, code: str) -> list[dict[str, object]]:
    if not isinstance(value, list):
        raise CatalogError(code)
    return [_document(item, code) for item in value]


def _strings(value: object, code: str) -> tuple[str, ...]:
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise CatalogError(code)
    return tuple(cast(list[str], value))


def _read_regular(path: Path, code: str) -> bytes:
    try:
        metadata = path.lstat()
        resolved = path.resolve(strict=True)
        if (
            stat.S_ISLNK(metadata.st_mode)
            or not stat.S_ISREG(metadata.st_mode)
            or path.absolute() != resolved
            or not 0 < metadata.st_size <= _MAX_CONFIG_BYTES
        ):
            raise CatalogError(code)
        data = resolved.read_bytes()
    except OSError as error:
        raise CatalogError(code) from error
    if not 0 < len(data) <= _MAX_CONFIG_BYTES:
        raise CatalogError(code)
    return data


def _schema(contracts_root: Path, name: str) -> dict[str, object]:
    path = contracts_root / "schemas" / "catalog" / name
    try:
        raw = json.loads(
            path.read_bytes().decode("utf-8", errors="strict"),
            object_pairs_hook=_strict_pairs,
        )
        document = _document(raw, "CATALOG_CONTRACT_INVALID")
        Draft202012Validator.check_schema(document)
        return document
    except (
        OSError,
        UnicodeDecodeError,
        json.JSONDecodeError,
        ValueError,
        CatalogError,
    ) as error:
        raise CatalogError("CATALOG_CONTRACT_INVALID") from error


def _validate_schema(
    document: dict[str, object],
    contracts_root: Path,
    schema_name: str,
    code: str,
) -> None:
    validator = Draft202012Validator(_schema(contracts_root, schema_name))
    if next(validator.iter_errors(document), None) is not None:
        raise CatalogError(code)


def _validate_display_semantics(display: dict[str, object]) -> None:
    rules = _objects(display["capabilityRules"], "CAPABILITY_MATRIX_INVALID")
    rule_keys = tuple(
        (cast(str, item["subjectType"]), cast(str, item["positionKind"])) for item in rules
    )
    if len(set(rule_keys)) != len(rule_keys) or set(rule_keys) != set(_EXPECTED_RULE_KEYS):
        raise CatalogError("CAPABILITY_MATRIX_INVALID")
    for item in rules:
        if _strings(item["capabilities"], "CAPABILITY_MATRIX_INVALID") != CAPABILITIES:
            raise CatalogError("CAPABILITY_MATRIX_INVALID")

    featured = _objects(display["featuredGroups"], "FEATURED_GROUP_INVALID")
    featured_types = tuple(cast(str, item["subjectType"]) for item in featured)
    if len(set(featured_types)) != 2 or set(featured_types) != set(_EXPECTED_FEATURED):
        raise CatalogError("FEATURED_GROUP_INVALID")
    for item in featured:
        subject_type = cast(str, item["subjectType"])
        if (
            _strings(item["positionKeys"], "FEATURED_GROUP_INVALID")
            != _EXPECTED_FEATURED[subject_type]
        ):
            raise CatalogError("FEATURED_GROUP_INVALID")

    cast_groups = _objects(display["castGroups"], "CAST_GROUP_INVALID")
    cast_types = tuple(cast(str, item["subjectType"]) for item in cast_groups)
    if len(set(cast_types)) != 2 or set(cast_types) != set(_EXPECTED_CAST):
        raise CatalogError("CAST_GROUP_INVALID")
    for item in cast_groups:
        subject_type = cast(str, item["subjectType"])
        if (
            item["anchorCategoryKey"] != "music"
            or _strings(item["positionKeys"], "CAST_GROUP_INVALID") != _EXPECTED_CAST[subject_type]
        ):
            raise CatalogError("CAST_GROUP_INVALID")

    additional = _objects(display["additionalDisplayGroups"], "DISPLAY_CONFIG_INVALID")
    keys = tuple(cast(str, item["groupKey"]) for item in additional)
    if len(set(keys)) != len(keys):
        raise CatalogError("DUPLICATE_GROUP_KEY")


def _validate_staff_set_semantics(staff_sets: dict[str, object]) -> None:
    values = _objects(staff_sets["sets"], "STAFF_SET_CONFIG_INVALID")
    keys: set[str] = set()
    for item in values:
        key = cast(str, item["key"])
        subject_type = cast(str, item["subjectType"])
        match = _STAFF_SET_KEY.fullmatch(key)
        if match is None or match.group(1) != subject_type:
            raise CatalogError("STAFF_SET_TYPE_MISMATCH")
        if key in keys:
            raise CatalogError("DUPLICATE_STAFF_SET_KEY")
        keys.add(key)
        members = _strings(item["members"], "STAFF_SET_CONFIG_INVALID")
        if len(set(members)) != len(members):
            raise CatalogError("DUPLICATE_STAFF_SET_MEMBER")


def _canonical_document(
    display: dict[str, object],
    staff_sets: dict[str, object],
) -> dict[str, object]:
    rules = [
        {
            "subjectType": item["subjectType"],
            "positionKind": item["positionKind"],
            "capabilities": list(_strings(item["capabilities"], "DISPLAY_CONFIG_INVALID")),
        }
        for item in _objects(display["capabilityRules"], "DISPLAY_CONFIG_INVALID")
    ]
    featured = [
        {
            "subjectType": item["subjectType"],
            "label": item["label"],
            "positionKeys": list(_strings(item["positionKeys"], "DISPLAY_CONFIG_INVALID")),
        }
        for item in _objects(display["featuredGroups"], "DISPLAY_CONFIG_INVALID")
    ]
    cast_groups = [
        {
            "subjectType": item["subjectType"],
            "label": item["label"],
            "anchorCategoryKey": item["anchorCategoryKey"],
            "positionKeys": list(_strings(item["positionKeys"], "DISPLAY_CONFIG_INVALID")),
        }
        for item in _objects(display["castGroups"], "DISPLAY_CONFIG_INVALID")
    ]
    additional = [
        {
            "groupKey": item["groupKey"],
            "subjectType": item["subjectType"],
            "label": item["label"],
            "displayOrder": item["displayOrder"],
            "positionKeys": list(_strings(item["positionKeys"], "DISPLAY_CONFIG_INVALID")),
        }
        for item in _objects(display["additionalDisplayGroups"], "DISPLAY_CONFIG_INVALID")
    ]
    sets = [
        {
            "key": item["key"],
            "subjectType": item["subjectType"],
            "label": item["label"],
            "displayOrder": item["displayOrder"],
            "members": sorted(
                _strings(item["members"], "STAFF_SET_CONFIG_INVALID"),
                key=lambda value: value.encode("ascii"),
            ),
        }
        for item in _objects(staff_sets["sets"], "STAFF_SET_CONFIG_INVALID")
    ]
    sets.sort(
        key=lambda item: (
            SUBJECT_TYPES.index(cast(str, item["subjectType"])),
            cast(int, item["displayOrder"]),
            cast(str, item["key"]).encode("ascii"),
        )
    )
    return {
        "display": {
            "schemaVersion": display["schemaVersion"],
            "capabilityRules": rules,
            "featuredGroups": featured,
            "castGroups": cast_groups,
            "additionalDisplayGroups": additional,
        },
        "staffSets": {
            "schemaVersion": staff_sets["schemaVersion"],
            "sets": sets,
        },
    }


def configuration_from_documents(
    display_value: object,
    staff_sets_value: object,
    contracts_root: Path,
) -> CatalogConfiguration:
    """Validate and canonicalize already parsed documents."""
    display = _document(display_value, "DISPLAY_CONFIG_INVALID")
    staff_sets = _document(staff_sets_value, "STAFF_SET_CONFIG_INVALID")
    _validate_schema(
        display,
        contracts_root,
        "display-config.schema.json",
        "DISPLAY_CONFIG_SCHEMA_INVALID",
    )
    _validate_schema(
        staff_sets,
        contracts_root,
        "staff-set-config.schema.json",
        "STAFF_SET_CONFIG_SCHEMA_INVALID",
    )
    _validate_display_semantics(display)
    _validate_staff_set_semantics(staff_sets)
    canonical = _canonical_document(display, staff_sets)
    encoded = (
        json.dumps(canonical, ensure_ascii=False, allow_nan=False, separators=(",", ":")) + "\n"
    ).encode("utf-8", errors="strict")
    digest = f"sha256:{hashlib.sha256(encoded).hexdigest()}"
    return CatalogConfiguration(display, staff_sets, encoded, digest)


def load_configuration(display_path: Path, contracts_root: Path) -> CatalogConfiguration:
    """Load the repository display file and its exact sibling staff-set file."""
    if display_path.name != "display-v1.yaml":
        raise CatalogError("CATALOG_CONFIG_INVALID")
    staff_sets_path = display_path.with_name("staff-sets-v1.yaml")
    display = load_yaml(
        _read_regular(display_path, "CATALOG_CONFIG_INVALID"), "DISPLAY_CONFIG_INVALID"
    )
    staff_sets = load_yaml(
        _read_regular(staff_sets_path, "CATALOG_CONFIG_INVALID"),
        "STAFF_SET_CONFIG_INVALID",
    )
    return configuration_from_documents(display, staff_sets, contracts_root)


def load_canonical_configuration(data: bytes, contracts_root: Path) -> CatalogConfiguration:
    """Validate exact canonical bytes supplied directly to the builder."""
    try:
        value = json.loads(
            data.decode("utf-8", errors="strict"),
            object_pairs_hook=_strict_pairs,
        )
        document = _document(value, "CATALOG_CONFIG_INVALID")
        if set(document) != {"display", "staffSets"}:
            raise CatalogError("CATALOG_CONFIG_INVALID")
        configuration = configuration_from_documents(
            document["display"],
            document["staffSets"],
            contracts_root,
        )
    except (
        UnicodeDecodeError,
        json.JSONDecodeError,
        ValueError,
        CatalogError,
    ) as error:
        if isinstance(error, CatalogError):
            raise
        raise CatalogError("CATALOG_CONFIG_INVALID") from error
    if data != configuration.canonical_bytes:
        raise CatalogError("CATALOG_CONFIG_NOT_CANONICAL")
    return configuration
