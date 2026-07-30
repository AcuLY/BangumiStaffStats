"""Immutable catalog compiler values."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

SUBJECT_TYPES: Final = ("book", "anime", "music", "game", "real")
SUBJECT_CODES: Final = {1: "book", 2: "anime", 3: "music", 4: "game", 6: "real"}
CAPABILITIES: Final = ("rankings", "candidates", "personDetail", "partners", "coStar")
CAST_TYPES: Final = frozenset({"anime", "game"})


@dataclass(frozen=True, slots=True)
class Names:
    """Normalized localized names."""

    cn: str | None
    en: str | None
    jp: str | None


@dataclass(frozen=True, slots=True)
class CommonCategory:
    """One category from the pinned common source."""

    subject_type: str
    key: str
    names: Names
    order: int | None
    source_index: int


@dataclass(frozen=True, slots=True)
class CommonPosition:
    """One exact staff position from the pinned common source."""

    subject_type: str
    position_id: int
    names: Names
    order: int | None
    source_index: int
    category_keys: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class CommonCatalog:
    """All five common subject-type catalogs."""

    categories: tuple[CommonCategory, ...]
    positions: tuple[CommonPosition, ...]


@dataclass(frozen=True, slots=True)
class CatalogPosition:
    """One selectable catalog entity."""

    position_key: str
    subject_type: str
    position_kind: str
    names: Names
    display_order: int
    capabilities: tuple[str, ...]
    rule_key: str
    rule_kind: str
    rule_value: str
    member_keys: tuple[str, ...] = ()

    @property
    def label(self) -> str:
        """Return the required Chinese display label."""
        if self.names.cn is None:
            raise AssertionError("compiled position has no Chinese label")
        return self.names.cn


@dataclass(frozen=True, slots=True)
class CatalogGroup:
    """One ordered display group."""

    group_key: str
    subject_type: str
    label: str
    display_order: int
    position_keys: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class StaffSet:
    """One validated dormant extension value."""

    key: str
    subject_type: str
    label: str
    display_order: int
    members: tuple[str, ...]
    capabilities: tuple[str, ...]
