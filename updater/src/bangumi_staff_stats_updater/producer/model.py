"""Shared immutable values for Archive production."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Final

SAFE_INTEGER_MAX: Final = 9_007_199_254_740_991
DATA_VERSION_ALGORITHM: Final = "bgmss-archive-data-version-v1"
SOURCE_SET_ALGORITHM: Final = "bgmss-producer-source-set-v1"
LOGICAL_ROWS_ALGORITHM: Final = "bgmss-producer-logical-rows-v1"
SCHEMA_OBJECT_ALGORITHM: Final = "bgmss-sqlite-schema-objects-v1"
SOURCE_NAMES: Final = (
    "subject.jsonlines",
    "person.jsonlines",
    "character.jsonlines",
    "subject-persons.jsonlines",
    "subject-characters.jsonlines",
    "person-characters.jsonlines",
    "subject-relations.jsonlines",
)
ARCHIVE_MEMBER_NAMES: Final = frozenset(
    {
        *SOURCE_NAMES,
        "episode.jsonlines",
        "person-relations.jsonlines",
    }
)
SUBJECT_TYPES: Final = {1: "book", 2: "anime", 3: "music", 4: "game", 6: "real"}
TABLE_NAMES: Final = (
    "archive_meta",
    "subject",
    "subject_rating_bucket",
    "subject_tag",
    "person",
    "person_career",
    "character",
    "subject_relation",
    "staff_position",
    "staff_position_category",
    "staff_credit",
    "cast_credit",
    "staff_set",
    "staff_set_member",
    "catalog_position",
    "catalog_position_member",
    "catalog_group",
    "catalog_group_member",
    "catalog_capability",
    "catalog_selection_rule",
)
QUALITY_NAMES: Final = (
    "NO_CHARACTERS",
    "NO_CAST_RELATIONS",
    "FILTERED_BY_VALID_CV",
    "UNKNOWN_STAFF_POSITION",
)


class ProducerError(RuntimeError):
    """A bounded stable producer failure."""

    def __init__(
        self,
        code: str,
        *,
        source: str | None = None,
        line: int | None = None,
        evidence: object | None = None,
    ) -> None:
        super().__init__(code)
        self.code = code
        self.source = source
        self.line = line
        self.evidence = evidence


@dataclass(frozen=True, slots=True)
class SourceInput:
    """One verified source file that the builder opens incrementally."""

    name: str
    path: Path
    size: int
    digest: str
    declared_size: int
    declared_digest: str


@dataclass(frozen=True, slots=True)
class BuildIdentity:
    """Validated semantic inputs to the Archive dataVersion."""

    archive_release: str
    archive_digest: str
    common_commit: str
    common_digest: str
    manifest_schema_version: int
    sqlite_schema_version: int
    schema_sql_digest: str
    domain_rules_version: str
    cast_rules_version: str
    catalog_config_digest: str


@dataclass(slots=True)
class SourceAccounting:
    """Exclusive source-line accounting."""

    name: str
    size: int
    digest: str
    records_total: int = 0
    imported: int = 0
    duplicate: int = 0
    invalid: int = 0
    unresolved: int = 0

    def as_manifest(self) -> dict[str, object]:
        """Return the contract field names in canonical insertion order."""
        return {
            "name": self.name,
            "size": self.size,
            "digest": self.digest,
            "recordsTotal": self.records_total,
            "imported": self.imported,
            "duplicate": self.duplicate,
            "invalid": self.invalid,
            "unresolved": self.unresolved,
        }


@dataclass(frozen=True, slots=True)
class BuildResult:
    """Validated database evidence before manifest finalization."""

    data_version: str
    sqlite_path: Path
    accounting: tuple[SourceAccounting, ...]
    table_counts: dict[str, int]
    quality_summary: dict[str, int]
    logical_digests: dict[str, str]
