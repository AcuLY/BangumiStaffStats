"""Deterministic common/config catalog compiler."""

from __future__ import annotations

from dataclasses import dataclass
from typing import cast

from .config import CatalogConfiguration
from .errors import CatalogError
from .model import (
    CAPABILITIES,
    SUBJECT_TYPES,
    CatalogGroup,
    CatalogPosition,
    CommonCatalog,
    CommonCategory,
    CommonPosition,
    Names,
    StaffSet,
)


@dataclass(frozen=True, slots=True)
class CompiledCatalog:
    """Complete catalog projection before source-credit derivation."""

    common: CommonCatalog
    ordered_categories: tuple[CommonCategory, ...]
    ordered_positions: tuple[CommonPosition, ...]
    positions: tuple[CatalogPosition, ...]
    groups: tuple[CatalogGroup, ...]
    staff_sets: tuple[StaffSet, ...]


def _ascii(value: str) -> bytes:
    return value.encode("ascii", errors="strict")


def _stable_key(value: CommonPosition | CommonCategory) -> tuple[int, int, int, int | bytes]:
    positive = value.order is not None and value.order > 0
    identity: int | bytes = (
        value.position_id if isinstance(value, CommonPosition) else _ascii(value.key)
    )
    return (
        0 if positive else 1,
        value.order if positive and value.order is not None else 0,
        value.source_index,
        identity,
    )


def _objects(value: object, code: str) -> list[dict[str, object]]:
    if not isinstance(value, list):
        raise CatalogError(code)
    result: list[dict[str, object]] = []
    for item in value:
        if not isinstance(item, dict) or not all(isinstance(key, str) for key in item):
            raise CatalogError(code)
        result.append(cast(dict[str, object], item))
    return result


def _strings(value: object, code: str) -> tuple[str, ...]:
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise CatalogError(code)
    return tuple(cast(list[str], value))


def _rule_map(configuration: CatalogConfiguration) -> dict[tuple[str, str], tuple[str, ...]]:
    return {
        (cast(str, item["subjectType"]), cast(str, item["positionKind"])): _strings(
            item["capabilities"],
            "CAPABILITY_MATRIX_INVALID",
        )
        for item in _objects(
            configuration.display["capabilityRules"],
            "CAPABILITY_MATRIX_INVALID",
        )
    }


def _positions_by_type(
    values: tuple[CommonPosition, ...],
    subject_type: str,
) -> tuple[CommonPosition, ...]:
    return tuple(value for value in values if value.subject_type == subject_type)


def _categories_by_type(
    values: tuple[CommonCategory, ...],
    subject_type: str,
) -> tuple[CommonCategory, ...]:
    return tuple(value for value in values if value.subject_type == subject_type)


def _staff_position(
    value: CommonPosition,
    display_order: int,
    capabilities: tuple[str, ...],
) -> CatalogPosition:
    key = f"staff:{value.subject_type}:{value.position_id}"
    return CatalogPosition(
        key,
        value.subject_type,
        "staff",
        value.names,
        display_order,
        capabilities,
        f"rule:{key}",
        "exactStaff",
        str(value.position_id),
    )


def _cast_positions(
    subject_type: str,
    first_display_order: int,
    capabilities: tuple[str, ...],
) -> tuple[CatalogPosition, CatalogPosition]:
    return (
        CatalogPosition(
            f"cast:{subject_type}:main",
            subject_type,
            "cast",
            Names("声优（仅主役）", None, None),  # noqa: RUF001 - governed product label
            first_display_order,
            capabilities,
            f"exclusive:cast:{subject_type}",
            "exactCast",
            "1",
        ),
        CatalogPosition(
            f"cast:{subject_type}:all",
            subject_type,
            "cast",
            Names("声优", None, None),
            first_display_order + 10,
            capabilities,
            f"exclusive:cast:{subject_type}",
            "exactCast",
            "1..6",
        ),
    )


def _compile_staff_sets(
    configuration: CatalogConfiguration,
    positions: dict[str, CatalogPosition],
) -> tuple[StaffSet, ...]:
    result: list[StaffSet] = []
    for item in _objects(configuration.staff_sets["sets"], "STAFF_SET_CONFIG_INVALID"):
        key = cast(str, item["key"])
        subject_type = cast(str, item["subjectType"])
        member_keys = _strings(item["members"], "STAFF_SET_CONFIG_INVALID")
        members: list[CatalogPosition] = []
        for member_key in member_keys:
            member = positions.get(member_key)
            if member is None:
                raise CatalogError("UNKNOWN_STAFF_SET_MEMBER")
            if member.position_kind != "staff":
                raise CatalogError("NON_STAFF_SET_MEMBER")
            if member.subject_type != subject_type:
                raise CatalogError("CROSS_TYPE_STAFF_SET_MEMBER")
            members.append(member)
        sorted_members = tuple(sorted(member_keys, key=_ascii))
        capabilities = tuple(
            capability
            for capability in CAPABILITIES
            if all(capability in member.capabilities for member in members)
        )
        value = StaffSet(
            key,
            subject_type,
            cast(str, item["label"]),
            cast(int, item["displayOrder"]),
            sorted_members,
            capabilities,
        )
        result.append(value)
        positions[key] = CatalogPosition(
            key,
            subject_type,
            "staffSet",
            Names(value.label, None, None),
            value.display_order,
            capabilities,
            f"rule:{key}",
            "staffSetUnion",
            key,
            sorted_members,
        )
    result.sort(key=lambda value: _ascii(value.key))
    return tuple(result)


def _resolve_group(
    subject_type: str,
    position_keys: tuple[str, ...],
    positions: dict[str, CatalogPosition],
    *,
    required_kind: str | None = None,
) -> None:
    if len(set(position_keys)) != len(position_keys):
        raise CatalogError("DUPLICATE_GROUP_REFERENCE")
    for key in position_keys:
        position = positions.get(key)
        if position is None:
            raise CatalogError("UNKNOWN_GROUP_REFERENCE")
        if position.subject_type != subject_type or (
            required_kind is not None and position.position_kind != required_kind
        ):
            raise CatalogError("INVALID_GROUP_REFERENCE")


def compile_catalog(
    common: CommonCatalog,
    configuration: CatalogConfiguration,
) -> CompiledCatalog:
    """Compile all common, shortcut, cast, fallback, and staff-set entities."""
    rules = _rule_map(configuration)
    ordered_categories: list[CommonCategory] = []
    ordered_common_positions: list[CommonPosition] = []
    positions: dict[str, CatalogPosition] = {}

    for subject_type in SUBJECT_TYPES:
        raw_categories = _categories_by_type(common.categories, subject_type)
        raw_positions = _positions_by_type(common.positions, subject_type)
        if len({value.key for value in raw_categories}) != len(raw_categories):
            raise CatalogError("DUPLICATE_COMMON_CATEGORY")
        if len({value.position_id for value in raw_positions}) != len(raw_positions):
            raise CatalogError("DUPLICATE_COMMON_POSITION")
        category_keys = {value.key for value in raw_categories}
        if any(not set(value.category_keys).issubset(category_keys) for value in raw_positions):
            raise CatalogError("UNKNOWN_COMMON_CATEGORY_REFERENCE")
        if any(value.names.cn is None for value in raw_categories):
            raise CatalogError("COMMON_CATEGORY_CHINESE_LABEL_MISSING")
        if any(value.names.cn is None for value in raw_positions):
            raise CatalogError("COMMON_CHINESE_LABEL_MISSING")

        type_categories = tuple(sorted(raw_categories, key=_stable_key))
        type_positions = tuple(sorted(raw_positions, key=_stable_key))
        ordered_categories.extend(type_categories)
        ordered_common_positions.extend(type_positions)
        capabilities = rules[(subject_type, "staff")]
        for index, value in enumerate(type_positions, 1):
            position = _staff_position(value, index * 10, capabilities)
            positions[position.position_key] = position
        if subject_type in {"anime", "game"}:
            cast_positions = _cast_positions(
                subject_type,
                (len(type_positions) + 1) * 10,
                rules[(subject_type, "cast")],
            )
            positions.update((value.position_key, value) for value in cast_positions)

    staff_sets = _compile_staff_sets(configuration, positions)
    featured = {
        cast(str, item["subjectType"]): item
        for item in _objects(
            configuration.display["featuredGroups"],
            "FEATURED_GROUP_INVALID",
        )
    }
    cast_groups = {
        cast(str, item["subjectType"]): item
        for item in _objects(
            configuration.display["castGroups"],
            "CAST_GROUP_INVALID",
        )
    }
    additional = _objects(
        configuration.display["additionalDisplayGroups"],
        "DISPLAY_CONFIG_INVALID",
    )

    groups: list[CatalogGroup] = []
    for subject_type in SUBJECT_TYPES:
        display_order = 10
        featured_value = featured.get(subject_type)
        if featured_value is not None:
            members = _strings(featured_value["positionKeys"], "FEATURED_GROUP_INVALID")
            _resolve_group(subject_type, members, positions)
            groups.append(
                CatalogGroup(
                    f"shortcut:{subject_type}:featured",
                    subject_type,
                    cast(str, featured_value["label"]),
                    display_order,
                    members,
                )
            )
            display_order += 10

        categories = tuple(
            value for value in ordered_categories if value.subject_type == subject_type
        )
        type_positions = tuple(
            value for value in ordered_common_positions if value.subject_type == subject_type
        )
        for category in categories:
            members = tuple(
                f"staff:{subject_type}:{value.position_id}"
                for value in type_positions
                if category.key in value.category_keys
            )
            groups.append(
                CatalogGroup(
                    f"bangumi:{subject_type}:{category.key}",
                    subject_type,
                    cast(str, category.names.cn),
                    display_order,
                    members,
                )
            )
            display_order += 10
            cast_value = cast_groups.get(subject_type)
            if cast_value is not None and cast_value["anchorCategoryKey"] == category.key:
                if category.names.cn != "声音类" or category.names.en != "music":
                    raise CatalogError("CAST_GROUP_ANCHOR_LABEL_INVALID")
                cast_members = _strings(cast_value["positionKeys"], "CAST_GROUP_INVALID")
                _resolve_group(
                    subject_type,
                    cast_members,
                    positions,
                    required_kind="cast",
                )
                groups.append(
                    CatalogGroup(
                        f"shortcut:{subject_type}:cast",
                        subject_type,
                        cast(str, cast_value["label"]),
                        display_order,
                        cast_members,
                    )
                )
                display_order += 10

        if subject_type in cast_groups and not any(
            category.key == cast_groups[subject_type]["anchorCategoryKey"]
            for category in categories
        ):
            raise CatalogError("CAST_GROUP_ANCHOR_MISSING")

        fallback = tuple(
            f"staff:{subject_type}:{value.position_id}"
            for value in type_positions
            if not categories or not value.category_keys
        )
        if fallback:
            groups.append(
                CatalogGroup(
                    f"fallback:{subject_type}:{'all' if not categories else 'other'}",
                    subject_type,
                    "全部职位" if not categories else "其他",
                    display_order,
                    fallback,
                )
            )
            display_order += 10

        type_sets = sorted(
            (value for value in staff_sets if value.subject_type == subject_type),
            key=lambda value: (value.display_order, _ascii(value.key)),
        )
        if type_sets:
            groups.append(
                CatalogGroup(
                    f"custom:{subject_type}:staff-sets",
                    subject_type,
                    "人工职位集合",
                    display_order,
                    tuple(value.key for value in type_sets),
                )
            )
            display_order += 10

        type_additional = sorted(
            (value for value in additional if value["subjectType"] == subject_type),
            key=lambda value: (
                cast(int, value["displayOrder"]),
                _ascii(cast(str, value["groupKey"])),
            ),
        )
        for additional_group in type_additional:
            members = _strings(
                additional_group["positionKeys"],
                "DISPLAY_CONFIG_INVALID",
            )
            _resolve_group(subject_type, members, positions)
            groups.append(
                CatalogGroup(
                    cast(str, additional_group["groupKey"]),
                    subject_type,
                    cast(str, additional_group["label"]),
                    display_order,
                    members,
                )
            )
            display_order += 10

    group_keys = [value.group_key for value in groups]
    if len(set(group_keys)) != len(group_keys):
        raise CatalogError("DUPLICATE_GROUP_KEY")
    compiled_positions = tuple(
        sorted(
            positions.values(),
            key=lambda value: (
                SUBJECT_TYPES.index(value.subject_type),
                value.display_order,
                _ascii(value.position_key),
            ),
        )
    )
    return CompiledCatalog(
        common,
        tuple(ordered_categories),
        tuple(ordered_common_positions),
        compiled_positions,
        tuple(groups),
        staff_sets,
    )


def diff_common_catalogs(
    previous: CommonCatalog,
    current: CommonCatalog,
) -> dict[str, object]:
    """Return deterministic additions/deletions/renames/category changes."""
    before = {(value.subject_type, value.position_id): value for value in previous.positions}
    after = {(value.subject_type, value.position_id): value for value in current.positions}
    before_keys = set(before)
    after_keys = set(after)

    def identity(key: tuple[str, int]) -> dict[str, object]:
        return {"subjectType": key[0], "positionId": key[1]}

    additions = [
        identity(key)
        for key in sorted(
            after_keys - before_keys,
            key=lambda value: (SUBJECT_TYPES.index(value[0]), value[1]),
        )
    ]
    deletions = [
        identity(key)
        for key in sorted(
            before_keys - after_keys,
            key=lambda value: (SUBJECT_TYPES.index(value[0]), value[1]),
        )
    ]
    renames: list[dict[str, object]] = []
    category_changes: list[dict[str, object]] = []
    order_changes: list[dict[str, object]] = []
    for key in sorted(
        before_keys & after_keys,
        key=lambda value: (SUBJECT_TYPES.index(value[0]), value[1]),
    ):
        old = before[key]
        new = after[key]
        if old.names != new.names:
            renames.append(
                {
                    **identity(key),
                    "before": {
                        "cn": old.names.cn,
                        "en": old.names.en,
                        "jp": old.names.jp,
                    },
                    "after": {
                        "cn": new.names.cn,
                        "en": new.names.en,
                        "jp": new.names.jp,
                    },
                }
            )
        if old.category_keys != new.category_keys:
            category_changes.append(
                {
                    **identity(key),
                    "before": list(old.category_keys),
                    "after": list(new.category_keys),
                }
            )
        if (old.order, old.source_index) != (new.order, new.source_index):
            order_changes.append(
                {
                    **identity(key),
                    "before": {
                        "order": old.order,
                        "sourceIndex": old.source_index,
                    },
                    "after": {
                        "order": new.order,
                        "sourceIndex": new.source_index,
                    },
                }
            )

    old_categories = {(value.subject_type, value.key): value for value in previous.categories}
    new_categories = {(value.subject_type, value.key): value for value in current.categories}
    old_category_keys = set(old_categories)
    new_category_keys = set(new_categories)

    def category_identity(key: tuple[str, str]) -> dict[str, object]:
        return {"subjectType": key[0], "categoryKey": key[1]}

    def category_sort(key: tuple[str, str]) -> tuple[int, bytes]:
        return SUBJECT_TYPES.index(key[0]), _ascii(key[1])

    category_additions = [
        category_identity(key)
        for key in sorted(new_category_keys - old_category_keys, key=category_sort)
    ]
    category_deletions = [
        category_identity(key)
        for key in sorted(old_category_keys - new_category_keys, key=category_sort)
    ]
    category_renames: list[dict[str, object]] = []
    category_order_changes: list[dict[str, object]] = []
    for category_key in sorted(
        old_category_keys & new_category_keys,
        key=category_sort,
    ):
        old_category = old_categories[category_key]
        new_category = new_categories[category_key]
        if old_category.names != new_category.names:
            category_renames.append(
                {
                    **category_identity(category_key),
                    "before": {
                        "cn": old_category.names.cn,
                        "en": old_category.names.en,
                        "jp": old_category.names.jp,
                    },
                    "after": {
                        "cn": new_category.names.cn,
                        "en": new_category.names.en,
                        "jp": new_category.names.jp,
                    },
                }
            )
        if (old_category.order, old_category.source_index) != (
            new_category.order,
            new_category.source_index,
        ):
            category_order_changes.append(
                {
                    **category_identity(category_key),
                    "before": {
                        "order": old_category.order,
                        "sourceIndex": old_category.source_index,
                    },
                    "after": {
                        "order": new_category.order,
                        "sourceIndex": new_category.source_index,
                    },
                }
            )
    return {
        "additions": additions,
        "deletions": deletions,
        "renames": renames,
        "categoryChanges": category_changes,
        "orderChanges": order_changes,
        "categoryAdditions": category_additions,
        "categoryDeletions": category_deletions,
        "categoryRenames": category_renames,
        "categoryOrderChanges": category_order_changes,
    }
