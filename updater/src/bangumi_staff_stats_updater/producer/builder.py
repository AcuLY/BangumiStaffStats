"""Streaming construction and validation of SQLite Archive v1."""

from __future__ import annotations

import hashlib
import json
import math
import re
import sqlite3
import stat
from collections.abc import Callable, Iterable, Iterator, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Final, NoReturn, cast
from urllib.parse import quote

import yaml

from .manifest import canonical_json_bytes, data_version, digest_bytes, digest_file
from .model import (
    LOGICAL_ROWS_ALGORITHM,
    QUALITY_NAMES,
    SAFE_INTEGER_MAX,
    SCHEMA_OBJECT_ALGORITHM,
    SOURCE_NAMES,
    SUBJECT_TYPES,
    TABLE_NAMES,
    BuildIdentity,
    BuildResult,
    ProducerError,
    SourceAccounting,
    SourceInput,
)

_MAX_LINE_BYTES: Final = 8 * 1024 * 1024
_SOURCE_BUFFER_BYTES: Final = 1024 * 1024
_BATCH_SIZE: Final = 10_000
_SQLITE_PROGRESS_OPCODES: Final = 10_000
_CAREERS: Final = frozenset(
    {"producer", "mangaka", "artist", "seiyu", "writer", "illustrator", "actor"}
)
_CAPABILITIES: Final = frozenset({"rankings", "candidates", "personDetail", "partners", "coStar"})
_PARTIAL_DATE: Final = re.compile(
    r"^(?P<year>[0-9]{4})(?:-(?P<month>[0-9]{2})(?:-(?P<day>[0-9]{2}))?)?$"
)
_SCORE_DETAIL_KEYS: Final = frozenset(str(value) for value in range(1, 11))
_FAVORITE_KEYS: Final = frozenset({"wish", "done", "doing", "on_hold", "dropped"})
_SUBJECT_FIELDS: Final = frozenset(
    {
        "id",
        "type",
        "name",
        "name_cn",
        "infobox",
        "platform",
        "summary",
        "nsfw",
        "tags",
        "meta_tags",
        "score",
        "score_details",
        "rank",
        "date",
        "favorite",
        "series",
    }
)
_PERSON_FIELDS: Final = frozenset(
    {"id", "name", "name_cn", "type", "career", "infobox", "summary", "comments", "collects"}
)
_CHARACTER_FIELDS: Final = frozenset(
    {"id", "role", "name", "name_cn", "infobox", "summary", "comments", "collects"}
)
_RECORD_FIELDS: Final = {
    "subject.jsonlines": _SUBJECT_FIELDS,
    "person.jsonlines": _PERSON_FIELDS,
    "character.jsonlines": _CHARACTER_FIELDS,
    "subject-persons.jsonlines": frozenset({"subject_id", "person_id", "position", "appear_eps"}),
    "subject-characters.jsonlines": frozenset({"subject_id", "character_id", "type", "order"}),
    "person-characters.jsonlines": frozenset(
        {"subject_id", "character_id", "person_id", "type", "summary"}
    ),
    "subject-relations.jsonlines": frozenset(
        {"subject_id", "related_subject_id", "relation_type", "order"}
    ),
}
_REQUIRED_FIELDS: Final = {
    "subject.jsonlines": frozenset({"id", "type", "name", "name_cn", "nsfw", "date"}),
    "person.jsonlines": frozenset({"id", "name", "career"}),
    "character.jsonlines": frozenset({"id", "name"}),
    "subject-persons.jsonlines": frozenset({"subject_id", "person_id", "position"}),
    "subject-characters.jsonlines": frozenset({"subject_id", "character_id", "type", "order"}),
    "person-characters.jsonlines": frozenset({"subject_id", "character_id", "person_id"}),
    "subject-relations.jsonlines": frozenset({"subject_id", "related_subject_id", "relation_type"}),
}
_OPTIONAL_TEXT_FIELDS: Final = {
    "subject.jsonlines": ("infobox", "summary"),
    "person.jsonlines": ("infobox", "summary"),
    "character.jsonlines": ("infobox", "summary"),
    "subject-persons.jsonlines": ("appear_eps",),
    "person-characters.jsonlines": ("summary",),
}
_OPTIONAL_UINT_FIELDS: Final = {
    "subject.jsonlines": {"platform": 16, "rank": 32},
    "person.jsonlines": {"type": 8, "comments": 32, "collects": 32},
    "character.jsonlines": {"role": 8, "comments": 32, "collects": 32},
    "person-characters.jsonlines": {"type": 8},
    "subject-relations.jsonlines": {"order": 16},
}


@dataclass(frozen=True, slots=True)
class _CommonPosition:
    subject_code: int
    position_id: int
    name_cn: str | None
    name_en: str | None
    name_jp: str | None
    categories: tuple[str, ...]
    sort_order: int
    status: str


@dataclass(frozen=True, slots=True)
class _Category:
    subject_code: int
    key: str
    label: str
    sort_order: int


@dataclass(frozen=True, slots=True)
class _CatalogPosition:
    position_key: str
    subject_type: str
    position_kind: str
    label: str
    display_order: int
    selectable: bool
    capabilities: tuple[str, ...]
    selection_rule: str


@dataclass(frozen=True, slots=True)
class _CatalogGroup:
    group_key: str
    subject_type: str
    label: str
    display_order: int
    position_keys: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class _Catalog:
    positions: tuple[_CatalogPosition, ...]
    groups: tuple[_CatalogGroup, ...]


@dataclass(slots=True)
class _SQLiteCancellation:
    callback: Callable[[], bool]
    requested: bool = False
    interruption: BaseException | None = None

    def check(self) -> None:
        if self.callback():
            self.requested = True
            _fail("CANCELED")

    def progress(self) -> int:
        try:
            cancelled = self.callback()
        except BaseException as error:
            self.requested = True
            self.interruption = error
            return 1
        if cancelled:
            self.requested = True
            return 1
        return 0


def _fail(
    code: str,
    *,
    source: str | None = None,
    line: int | None = None,
    evidence: object | None = None,
) -> NoReturn:
    raise ProducerError(code, source=source, line=line, evidence=evidence)


def _object(value: object) -> dict[str, object]:
    if not isinstance(value, dict) or not all(isinstance(key, str) for key in value):
        _fail("SOURCE_RECORD_MALFORMED")
    return cast(dict[str, object], value)


def _positive_integer(value: object, *, allow_zero: bool = False) -> int:
    if (
        isinstance(value, bool)
        or not isinstance(value, int)
        or value > SAFE_INTEGER_MAX
        or value < (0 if allow_zero else 1)
    ):
        _fail("SOURCE_RECORD_MALFORMED")
    return value


def _unsigned_integer(value: object, bits: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= (1 << bits) - 1:
        _fail("SOURCE_RECORD_MALFORMED")
    return value


def _bounded_text(value: object, maximum: int, *, nullable: bool = False) -> str | None:
    if value is None and nullable:
        return None
    if (
        not isinstance(value, str)
        or not value
        or len(value) > maximum
        or "\x00" in value
        or "\r" in value
        or "\n" in value
    ):
        _fail("SOURCE_RECORD_MALFORMED")
    try:
        value.encode("utf-8", errors="strict")
    except UnicodeEncodeError as error:
        raise ProducerError("SOURCE_RECORD_MALFORMED") from error
    return value


def _nullable_text(value: object, maximum: int) -> str | None:
    if value is None or value == "":
        return None
    return _bounded_text(value, maximum)


def _source_text(value: object) -> str:
    """Validate a bounded upstream text payload while permitting empty/multiline text."""
    if not isinstance(value, str) or len(value) > _MAX_LINE_BYTES:
        _fail("SOURCE_RECORD_MALFORMED")
    try:
        value.encode("utf-8", errors="strict")
    except UnicodeEncodeError as error:
        raise ProducerError("SOURCE_RECORD_MALFORMED") from error
    return value


def _partial_date(value: object) -> tuple[str | None, int | None]:
    if value is None or value == "":
        return None, None
    if not isinstance(value, str):
        _fail("SOURCE_RECORD_MALFORMED")
    match = _PARTIAL_DATE.fullmatch(value)
    if match is None:
        _fail("SOURCE_RECORD_MALFORMED")
    year = int(match["year"])
    if year < 1 or year > 9999:
        _fail("SOURCE_RECORD_MALFORMED")
    month_text = match["month"]
    if month_text is None:
        return value, 1
    month = int(month_text)
    if month < 1 or month > 12:
        _fail("SOURCE_RECORD_MALFORMED")
    day_text = match["day"]
    if day_text is None:
        return value, 2
    day = int(day_text)
    leap = year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)
    days = (31, 29 if leap else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)
    if day < 1 or day > days[month - 1]:
        _fail("SOURCE_RECORD_MALFORMED")
    return value, 3


def _extract_name_cn(record: Mapping[str, object]) -> str | None:
    supplied = record.get("name_cn")
    if supplied is not None:
        return _nullable_text(supplied, 4096)
    infobox = record.get("infobox")
    if not isinstance(infobox, str):
        return None
    match = re.search(
        r"(?:^|[\r\n|])\s*简体中文名\s*=\s*([^\r\n|}]*)",
        infobox,
    )
    if match is None:
        return None
    value = match.group(1).strip()
    if not value:
        return None
    return _bounded_text(value, 4096)


def _strict_pairs(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError
        result[key] = value
    return result


def _reject_constant(_value: str) -> NoReturn:
    raise ValueError


def _finite_float(value: str) -> float:
    result = float(value)
    if not math.isfinite(result):
        raise ValueError
    return result


def _parse_json_line(data: bytes) -> dict[str, object]:
    try:
        text = data.decode("utf-8", errors="strict")
        value = json.loads(
            text,
            object_pairs_hook=_strict_pairs,
            parse_constant=_reject_constant,
            parse_float=_finite_float,
        )
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError, OverflowError) as error:
        raise ProducerError("SOURCE_RECORD_MALFORMED") from error
    return _object(value)


def _known_optional_shape(source_name: str, record: Mapping[str, object]) -> None:
    for field in _OPTIONAL_TEXT_FIELDS.get(source_name, ()):
        if field in record:
            _source_text(record[field])
    for field, bits in _OPTIONAL_UINT_FIELDS.get(source_name, {}).items():
        if field in record:
            _unsigned_integer(record[field], bits)
    if source_name != "subject.jsonlines":
        return
    if "series" in record and not isinstance(record["series"], bool):
        _fail("SOURCE_RECORD_MALFORMED")
    if "favorite" in record:
        favorite = _object(record["favorite"])
        if set(favorite) != _FAVORITE_KEYS:
            _fail("SOURCE_RECORD_MALFORMED")
        for count in favorite.values():
            _unsigned_integer(count, 32)
    if "score_details" in record:
        score_details = _object(record["score_details"])
        if set(score_details) != _SCORE_DETAIL_KEYS:
            _fail("SOURCE_RECORD_MALFORMED")
        for count in score_details.values():
            _unsigned_integer(count, 32)
    if "tags" in record:
        tags = record["tags"]
        if not isinstance(tags, list) or len(tags) > 11:
            _fail("SOURCE_RECORD_MALFORMED")
        for value in tags:
            tag = _object(value)
            if set(tag) != {"name", "count"}:
                _fail("SOURCE_RECORD_MALFORMED")
            _bounded_text(tag["name"], 255)
            _positive_integer(tag["count"], allow_zero=True)
    if "meta_tags" in record:
        meta_tags = record["meta_tags"]
        if not isinstance(meta_tags, list):
            _fail("SOURCE_RECORD_MALFORMED")
        for value in meta_tags:
            _bounded_text(value, 255)


def _record_shape(source_name: str, record: Mapping[str, object]) -> None:
    keys = frozenset(record)
    if not keys.issubset(_RECORD_FIELDS[source_name]):
        _fail("SOURCE_RECORD_UNKNOWN_FIELD")
    if not _REQUIRED_FIELDS[source_name].issubset(keys):
        _fail("SOURCE_RECORD_MALFORMED")
    _known_optional_shape(source_name, record)
    if source_name == "subject.jsonlines":
        _positive_integer(record.get("id"))
        subject_code = _positive_integer(record.get("type"))
        if subject_code not in SUBJECT_TYPES:
            _fail("SOURCE_RECORD_MALFORMED")
        _bounded_text(record.get("name"), 4096)
        _nullable_text(record.get("name_cn"), 4096)
        if not isinstance(record.get("nsfw"), bool):
            _fail("SOURCE_RECORD_MALFORMED")
        _partial_date(record.get("date"))
    elif source_name == "person.jsonlines":
        _positive_integer(record.get("id"))
        _bounded_text(record.get("name"), 4096)
        if "name_cn" in record:
            _nullable_text(record.get("name_cn"), 4096)
        careers = record.get("career")
        if (
            not isinstance(careers, list)
            or len(careers) > 16
            or len({item for item in careers if isinstance(item, str)}) != len(careers)
            or any(item not in _CAREERS for item in careers)
        ):
            _fail("SOURCE_RECORD_MALFORMED")
    elif source_name == "character.jsonlines":
        _positive_integer(record.get("id"))
        _bounded_text(record.get("name"), 4096)
        if "name_cn" in record:
            _nullable_text(record.get("name_cn"), 4096)
    elif source_name == "subject-characters.jsonlines":
        _positive_integer(record.get("subject_id"))
        _positive_integer(record.get("character_id"))
        role = _positive_integer(record.get("type"))
        if role > 6:
            _fail("SOURCE_RECORD_MALFORMED")
        _positive_integer(record.get("order"), allow_zero=True)
    else:
        for field in _REQUIRED_FIELDS[source_name]:
            _positive_integer(record.get(field))


def _record_identity(source_name: str, record: Mapping[str, object]) -> str:
    if source_name in {"subject.jsonlines", "person.jsonlines", "character.jsonlines"}:
        return str(record["id"])
    if source_name == "subject-persons.jsonlines":
        return f"{record['subject_id']}:{record['person_id']}:{record['position']}"
    if source_name == "subject-characters.jsonlines":
        return f"{record['subject_id']}:{record['character_id']}"
    if source_name == "person-characters.jsonlines":
        return f"{record['subject_id']}:{record['character_id']}:{record['person_id']}"
    return f"{record['subject_id']}:{record['related_subject_id']}:{record['relation_type']}"


def _record_digest(record: Mapping[str, object]) -> str:
    return digest_bytes(
        json.dumps(
            record,
            ensure_ascii=False,
            allow_nan=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8", errors="strict")
    )


def _read_document(data: bytes, code: str) -> dict[str, object]:
    try:
        return _object(
            json.loads(
                data.decode("utf-8", errors="strict"),
                object_pairs_hook=_strict_pairs,
                parse_constant=_reject_constant,
                parse_float=_finite_float,
            )
        )
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError, ProducerError) as error:
        raise ProducerError(code) from error


def _optional_name(value: object) -> str | None:
    if value in {None, ""}:
        return None
    return cast(str, _bounded_text(value, 255))


def _parse_synthetic_common(
    document: Mapping[str, object],
) -> tuple[tuple[_CommonPosition, ...], tuple[_Category, ...]]:
    if set(document) != {"positions"} or not isinstance(document["positions"], list):
        _fail("COMMON_CATALOG_INVALID")
    positions: list[_CommonPosition] = []
    category_map: dict[tuple[int, str], _Category] = {}
    identities: set[tuple[int, int]] = set()
    for value in document["positions"]:
        position = _object(value)
        if set(position) != {
            "subjectType",
            "positionId",
            "nameCn",
            "nameEn",
            "nameJp",
            "categories",
            "sortOrder",
            "status",
        }:
            _fail("COMMON_CATALOG_INVALID")
        subject_code = _positive_integer(position["subjectType"])
        position_id = _positive_integer(position["positionId"])
        if subject_code not in SUBJECT_TYPES or (subject_code, position_id) in identities:
            _fail("COMMON_CATALOG_INVALID")
        identities.add((subject_code, position_id))
        raw_categories = position["categories"]
        if not isinstance(raw_categories, list) or not raw_categories:
            _fail("COMMON_CATALOG_INVALID")
        categories = tuple(cast(str, _bounded_text(item, 64)) for item in raw_categories)
        if len(set(categories)) != len(categories):
            _fail("COMMON_CATALOG_INVALID")
        for order, key in enumerate(categories, 1):
            category_map.setdefault(
                (subject_code, key),
                _Category(subject_code, key, key, order),
            )
        status = position["status"]
        if status not in {"selectable", "hidden"}:
            _fail("COMMON_CATALOG_INVALID")
        positions.append(
            _CommonPosition(
                subject_code,
                position_id,
                _optional_name(position["nameCn"]),
                _optional_name(position["nameEn"]),
                _optional_name(position["nameJp"]),
                categories,
                _positive_integer(position["sortOrder"], allow_zero=True),
                status,
            )
        )
    return tuple(positions), tuple(category_map.values())


def _parse_common(data: bytes) -> tuple[tuple[_CommonPosition, ...], tuple[_Category, ...]]:
    try:
        loaded = yaml.safe_load(data)
    except yaml.YAMLError as error:
        raise ProducerError("COMMON_CATALOG_INVALID") from error
    document = _object(loaded)
    if set(document) == {"positions"}:
        return _parse_synthetic_common(document)
    if set(document) != {"define", "staffs"}:
        _fail("COMMON_CATALOG_INVALID")
    staffs = document["staffs"]
    if not isinstance(staffs, dict):
        _fail("COMMON_CATALOG_INVALID")
    positions: list[_CommonPosition] = []
    categories: dict[tuple[int, str], _Category] = {}
    for subject_code in SUBJECT_TYPES:
        raw_positions = staffs.get(subject_code)
        if not isinstance(raw_positions, dict):
            _fail("COMMON_CATALOG_INVALID")
        for sort_index, (position_id_value, value) in enumerate(raw_positions.items(), 1):
            position_id = _positive_integer(position_id_value)
            position = _object(value)
            if not set(position).issubset({"en", "cn", "jp", "rdf", "categories", "desc"}):
                _fail("COMMON_CATALOG_INVALID")
            if "desc" in position:
                _bounded_text(position["desc"], 4096)
            raw_categories = position.get("categories", [])
            if not isinstance(raw_categories, list):
                _fail("COMMON_CATALOG_INVALID")
            category_keys: list[str] = []
            for category_value in raw_categories:
                category = _object(category_value)
                if not {"order", "en", "cn"}.issubset(category):
                    _fail("COMMON_CATALOG_INVALID")
                key = cast(str, _bounded_text(category["en"], 64))
                label = cast(str, _bounded_text(category["cn"], 255))
                order = _positive_integer(category["order"], allow_zero=True)
                category_keys.append(key)
                existing = categories.get((subject_code, key))
                candidate = _Category(subject_code, key, label, order)
                if existing is not None and existing != candidate:
                    _fail("COMMON_CATALOG_INVALID")
                categories[(subject_code, key)] = candidate
            positions.append(
                _CommonPosition(
                    subject_code,
                    position_id,
                    _optional_name(position.get("cn")),
                    _optional_name(position.get("en")),
                    _optional_name(position.get("jp")),
                    tuple(category_keys),
                    sort_index * 10,
                    "selectable",
                )
            )
    if len({(item.subject_code, item.position_id) for item in positions}) != len(positions):
        _fail("COMMON_CATALOG_INVALID")
    return tuple(positions), tuple(categories.values())


def _parse_catalog(data: bytes) -> _Catalog:
    document = _read_document(data, "CATALOG_CONFIG_INVALID")
    if set(document) != {"positions", "groups"}:
        _fail("CATALOG_CONFIG_INVALID")
    raw_positions = document["positions"]
    raw_groups = document["groups"]
    if (
        not isinstance(raw_positions, list)
        or not raw_positions
        or len(raw_positions) > 512
        or not isinstance(raw_groups, list)
        or len(raw_groups) > 256
    ):
        _fail("CATALOG_CONFIG_INVALID")
    positions: list[_CatalogPosition] = []
    position_keys: dict[str, str] = {}
    for value in raw_positions:
        item = _object(value)
        if set(item) != {
            "positionKey",
            "subjectType",
            "positionKind",
            "label",
            "displayOrder",
            "selectable",
            "capabilities",
            "selectionRule",
        }:
            _fail("CATALOG_CONFIG_INVALID")
        key = cast(str, _bounded_text(item["positionKey"], 96))
        subject_type = item["subjectType"]
        kind = item["positionKind"]
        if subject_type not in SUBJECT_TYPES.values() or kind not in {"staff", "cast"}:
            _fail("CATALOG_CONFIG_INVALID")
        parts = key.split(":")
        if len(parts) != 3 or parts[0] != kind or parts[1] != subject_type:
            _fail("CATALOG_CONFIG_INVALID")
        selection_rule = cast(str, _bounded_text(item["selectionRule"], 255))
        if kind == "staff":
            if (
                not parts[2].isdigit()
                or parts[2].startswith("0")
                or selection_rule != f"positionId={parts[2]}"
            ):
                _fail("CATALOG_CONFIG_INVALID")
        elif (
            subject_type not in {"anime", "game"}
            or parts[2] not in {"main", "all"}
            or selection_rule != ("roleType=1" if parts[2] == "main" else "roleType=1..6")
        ):
            _fail("CATALOG_CONFIG_INVALID")
        capabilities_value = item["capabilities"]
        if (
            not isinstance(capabilities_value, list)
            or not capabilities_value
            or len(set(capabilities_value)) != len(capabilities_value)
            or any(value not in _CAPABILITIES for value in capabilities_value)
        ):
            _fail("CATALOG_CONFIG_INVALID")
        if key in position_keys or not isinstance(item["selectable"], bool):
            _fail("CATALOG_CONFIG_INVALID")
        label = _bounded_text(item["label"], 255)
        if label is None:
            _fail("CATALOG_CONFIG_INVALID")
        position_keys[key] = subject_type
        positions.append(
            _CatalogPosition(
                key,
                subject_type,
                kind,
                label,
                _positive_integer(item["displayOrder"], allow_zero=True),
                item["selectable"],
                tuple(cast(list[str], capabilities_value)),
                selection_rule,
            )
        )
    groups: list[_CatalogGroup] = []
    group_keys: set[str] = set()
    for value in raw_groups:
        item = _object(value)
        if set(item) != {
            "groupKey",
            "subjectType",
            "label",
            "displayOrder",
            "positionKeys",
        }:
            _fail("CATALOG_CONFIG_INVALID")
        key = cast(str, _bounded_text(item["groupKey"], 96))
        subject_type = item["subjectType"]
        members = item["positionKeys"]
        if (
            key in group_keys
            or subject_type not in SUBJECT_TYPES.values()
            or not isinstance(members, list)
            or not members
            or len(set(members)) != len(members)
            or any(position_keys.get(member) != subject_type for member in members)
        ):
            _fail("CATALOG_CONFIG_INVALID")
        group_keys.add(key)
        groups.append(
            _CatalogGroup(
                key,
                cast(str, subject_type),
                cast(str, _bounded_text(item["label"], 255)),
                _positive_integer(item["displayOrder"], allow_zero=True),
                tuple(cast(list[str], members)),
            )
        )
    return _Catalog(tuple(positions), tuple(groups))


def _source_gate(
    sources: tuple[SourceInput, ...],
    cancelled: Callable[[], bool],
) -> tuple[SourceInput, ...]:
    names = [source.name for source in sources]
    missing = [name for name in SOURCE_NAMES if name not in names]
    if missing:
        _fail("SOURCE_SET_MISSING", source=missing[0])
    extra = [name for name in names if name not in SOURCE_NAMES]
    if extra:
        _fail("SOURCE_SET_EXTRA", source=extra[0])
    if len(set(names)) != len(names):
        duplicate = next(name for name in names if names.count(name) > 1)
        _fail("SOURCE_SET_EXTRA", source=duplicate)
    for source in sources:
        if cancelled():
            _fail("CANCELED")
        try:
            metadata = source.path.lstat()
        except OSError as error:
            raise ProducerError("SOURCE_FILE_INVALID", source=source.name) from error
        if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISREG(metadata.st_mode):
            _fail("SOURCE_FILE_INVALID", source=source.name)
        try:
            actual_size, actual_digest = digest_file(source.path, cancelled)
        except OSError as error:
            raise ProducerError("SOURCE_FILE_INVALID", source=source.name) from error
        if actual_size != source.size or source.declared_size != source.size:
            _fail("SOURCE_SIZE_MISMATCH", source=source.name)
        if actual_digest != source.digest or source.declared_digest != source.digest:
            _fail("SOURCE_DIGEST_MISMATCH", source=source.name)
    by_name = {source.name: source for source in sources}
    return tuple(by_name[name] for name in SOURCE_NAMES)


def _insert_common(
    connection: sqlite3.Connection,
    positions: tuple[_CommonPosition, ...],
    categories: tuple[_Category, ...],
    common_commit: str,
) -> set[tuple[int, int]]:
    for category in sorted(
        categories, key=lambda value: (value.subject_code, value.sort_order, value.key)
    ):
        connection.execute(
            "INSERT INTO staff_position_category VALUES (?, ?, ?, ?)",
            (
                SUBJECT_TYPES[category.subject_code],
                category.key,
                category.label,
                category.sort_order,
            ),
        )
    for position in sorted(positions, key=lambda value: (value.subject_code, value.position_id)):
        connection.execute(
            "INSERT INTO staff_position VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                SUBJECT_TYPES[position.subject_code],
                position.position_id,
                position.name_cn,
                position.name_en,
                position.name_jp,
                json.dumps(position.categories, ensure_ascii=False, separators=(",", ":")),
                position.sort_order,
                position.status,
                common_commit,
            ),
        )
    return {(position.subject_code, position.position_id) for position in positions}


def _selection_rule(position: _CatalogPosition) -> tuple[str, str]:
    value = position.selection_rule.split("=", 1)[1]
    return ("exactStaff" if position.position_kind == "staff" else "exactCast", value)


def _insert_catalog(connection: sqlite3.Connection, catalog: _Catalog) -> None:
    for position in catalog.positions:
        if position.position_kind == "staff":
            position_id = int(position.position_key.rsplit(":", 1)[1])
            common = connection.execute(
                "SELECT status FROM staff_position WHERE subject_type = ? AND position_id = ?",
                (position.subject_type, position_id),
            ).fetchone()
            if common is None or (position.selectable and common[0] != "selectable"):
                _fail("CATALOG_CONFIG_INVALID")
        connection.execute(
            "INSERT INTO catalog_position VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, ?)",
            (
                position.position_key,
                position.subject_type,
                position.position_kind,
                position.label,
                position.display_order,
                int(position.selectable),
            ),
        )
        for capability in position.capabilities:
            connection.execute(
                "INSERT INTO catalog_capability VALUES (?, ?, 1)",
                (position.position_key, capability),
            )
        rule_kind, rule_value = _selection_rule(position)
        connection.execute(
            "INSERT INTO catalog_selection_rule VALUES (?, ?, ?, ?)",
            (f"rule:{position.position_key}", position.position_key, rule_kind, rule_value),
        )
    for group in catalog.groups:
        connection.execute(
            "INSERT INTO catalog_group VALUES (?, ?, ?, ?)",
            (group.group_key, group.subject_type, group.label, group.display_order),
        )
        for order, position_key in enumerate(group.position_keys):
            connection.execute(
                "INSERT INTO catalog_group_member VALUES (?, ?, ?)",
                (group.group_key, position_key, order),
            )


def _subject_type(connection: sqlite3.Connection, subject_id: int) -> str | None:
    row = connection.execute(
        "SELECT subject_type FROM temp.entity_subject WHERE subject_id = ?",
        (subject_id,),
    ).fetchone()
    return None if row is None else cast(str, row[0])


def _person_exists(connection: sqlite3.Connection, person_id: int) -> bool:
    return (
        connection.execute(
            "SELECT 1 FROM person WHERE person_id = ?",
            (person_id,),
        ).fetchone()
        is not None
    )


def _character_exists(connection: sqlite3.Connection, character_id: int) -> bool:
    return (
        connection.execute(
            "SELECT 1 FROM character WHERE character_id = ?",
            (character_id,),
        ).fetchone()
        is not None
    )


def _subject_details(
    record: Mapping[str, object],
) -> tuple[str, int, str, str | None, bool, str | None, int | None, float | None, int]:
    subject_id = _positive_integer(record["id"])
    subject_code = _positive_integer(record["type"])
    subject_type = SUBJECT_TYPES[subject_code]
    name = cast(str, _bounded_text(record["name"], 4096))
    name_cn = _nullable_text(record["name_cn"], 4096)
    nsfw = cast(bool, record["nsfw"])
    air_date, precision = _partial_date(record["date"])
    score_value = record.get("score")
    if score_value is None:
        score = None
    elif (
        isinstance(score_value, bool)
        or not isinstance(score_value, (int, float))
        or not math.isfinite(score_value)
        or not 0 <= score_value <= 10
    ):
        _fail("SOURCE_RECORD_MALFORMED")
    else:
        score = float(score_value)
    details = record.get("score_details")
    votes = 0
    if details is not None:
        if not isinstance(details, dict) or set(details) != _SCORE_DETAIL_KEYS:
            _fail("SOURCE_RECORD_MALFORMED")
        for key, count in details.items():
            if (
                not isinstance(key, str)
                or isinstance(count, bool)
                or not isinstance(count, int)
                or count < 0
                or count > 4_294_967_295
            ):
                _fail("SOURCE_RECORD_MALFORMED")
            votes += count
            if votes > SAFE_INTEGER_MAX:
                _fail("SOURCE_RECORD_MALFORMED")
    return (
        subject_type,
        subject_id,
        name,
        name_cn,
        nsfw,
        air_date,
        precision,
        score,
        votes,
    )


def _insert_subject(connection: sqlite3.Connection, record: Mapping[str, object]) -> None:
    details = _subject_details(record)
    connection.execute(
        "INSERT INTO subject VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (*details[:4], int(details[4]), *details[5:]),
    )
    connection.execute(
        "INSERT INTO temp.entity_subject VALUES (?, ?)",
        (details[1], details[0]),
    )
    score_details = record.get("score_details")
    if isinstance(score_details, dict):
        for rating in sorted(score_details, key=int):
            connection.execute(
                "INSERT INTO subject_rating_bucket VALUES (?, ?, ?, ?)",
                (details[0], details[1], int(rating), score_details[rating]),
            )
    tags = record.get("tags", [])
    if not isinstance(tags, list):
        _fail("SOURCE_RECORD_MALFORMED")
    for value in tags:
        tag = _object(value)
        if set(tag) != {"name", "count"}:
            _fail("SOURCE_RECORD_MALFORMED")
        _positive_integer(tag["count"], allow_zero=True)
        connection.execute(
            "INSERT OR IGNORE INTO subject_tag VALUES (?, ?, 'public', ?)",
            (details[0], details[1], _bounded_text(tag["name"], 255)),
        )
    meta_tags = record.get("meta_tags", [])
    if not isinstance(meta_tags, list):
        _fail("SOURCE_RECORD_MALFORMED")
    for value in meta_tags:
        connection.execute(
            "INSERT OR IGNORE INTO subject_tag VALUES (?, ?, 'meta', ?)",
            (details[0], details[1], _bounded_text(value, 255)),
        )


def _insert_person(connection: sqlite3.Connection, record: Mapping[str, object]) -> None:
    person_id = _positive_integer(record["id"])
    connection.execute(
        "INSERT INTO person VALUES (?, ?, ?, NULL)",
        (
            person_id,
            _bounded_text(record["name"], 4096),
            _extract_name_cn(record),
        ),
    )
    careers = cast(list[str], record["career"])
    for career in sorted(careers):
        connection.execute("INSERT INTO person_career VALUES (?, ?)", (person_id, career))


def _insert_character(connection: sqlite3.Connection, record: Mapping[str, object]) -> None:
    connection.execute(
        "INSERT INTO character VALUES (?, ?, ?)",
        (
            _positive_integer(record["id"]),
            _bounded_text(record["name"], 4096),
            _extract_name_cn(record),
        ),
    )


def _apply_record(
    connection: sqlite3.Connection,
    source_name: str,
    record: Mapping[str, object],
    common_identities: set[tuple[int, int]],
) -> tuple[str, int]:
    if source_name == "subject.jsonlines":
        _insert_subject(connection, record)
        return "imported", 0
    if source_name == "person.jsonlines":
        _insert_person(connection, record)
        return "imported", 0
    if source_name == "character.jsonlines":
        _insert_character(connection, record)
        return "imported", 0

    subject_id = _positive_integer(record["subject_id"])
    subject_type = _subject_type(connection, subject_id)
    if source_name == "subject-persons.jsonlines":
        person_id = _positive_integer(record["person_id"])
        if subject_type is None or not _person_exists(connection, person_id):
            return "invalid", 0
        position_id = _positive_integer(record["position"])
        connection.execute(
            "INSERT INTO staff_credit VALUES (?, ?, ?, ?)",
            (subject_type, subject_id, person_id, position_id),
        )
        connection.execute(
            "INSERT OR IGNORE INTO temp.eligible_staff_person VALUES (?)",
            (person_id,),
        )
        subject_code = next(code for code, name in SUBJECT_TYPES.items() if name == subject_type)
        return (
            ("imported", 0)
            if (subject_code, position_id) in common_identities
            else ("unresolved", 0)
        )
    if source_name == "subject-characters.jsonlines":
        character_id = _positive_integer(record["character_id"])
        if subject_type is None or not _character_exists(connection, character_id):
            return "invalid", 0
        connection.execute(
            "INSERT INTO temp.source_subject_character VALUES (?, ?, ?, ?)",
            (
                subject_id,
                character_id,
                _positive_integer(record["type"]),
                _positive_integer(record["order"], allow_zero=True),
            ),
        )
        return "imported", 0
    if source_name == "person-characters.jsonlines":
        character_id = _positive_integer(record["character_id"])
        person_id = _positive_integer(record["person_id"])
        role = connection.execute(
            "SELECT role_type, sort_order FROM temp.source_subject_character "
            "WHERE subject_id = ? AND character_id = ?",
            (subject_id, character_id),
        ).fetchone()
        if (
            subject_type is None
            or role is None
            or not _person_exists(connection, person_id)
            or not _character_exists(connection, character_id)
        ):
            return "invalid", 0
        eligible = connection.execute(
            "SELECT 1 FROM temp.eligible_staff_person WHERE person_id = ?",
            (person_id,),
        ).fetchone()
        if eligible is None:
            return "imported", 1
        connection.execute(
            "INSERT INTO cast_credit VALUES (?, ?, ?, ?, ?, ?, 1, 'exact')",
            (subject_type, subject_id, person_id, character_id, role[0], role[1]),
        )
        return "imported", 0

    related_id = _positive_integer(record["related_subject_id"])
    related_type = _subject_type(connection, related_id)
    if subject_type is None or related_type is None:
        return "invalid", 0
    connection.execute(
        "INSERT INTO subject_relation VALUES (?, ?, ?, ?, ?)",
        (
            subject_type,
            subject_id,
            related_type,
            related_id,
            _positive_integer(record["relation_type"]),
        ),
    )
    return "imported", 0


def _open_database(path: Path, schema_sql: str) -> sqlite3.Connection:
    if path.exists():
        _fail("SQLITE_BUILD_FAILED")
    try:
        connection = sqlite3.connect(path)
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA temp_store = FILE")
        connection.execute("PRAGMA journal_mode = DELETE")
        connection.executescript(schema_sql)
        connection.executescript(
            """
            CREATE TEMP TABLE seen_record (
              source TEXT NOT NULL,
              identity TEXT NOT NULL,
              digest TEXT NOT NULL,
              PRIMARY KEY (source, identity)
            ) STRICT;
            CREATE TEMP TABLE entity_subject (
              subject_id INTEGER NOT NULL PRIMARY KEY,
              subject_type TEXT NOT NULL
            ) STRICT;
            CREATE TEMP TABLE source_subject_character (
              subject_id INTEGER NOT NULL,
              character_id INTEGER NOT NULL,
              role_type INTEGER NOT NULL,
              sort_order INTEGER NOT NULL,
              PRIMARY KEY (subject_id, character_id)
            ) STRICT;
            CREATE TEMP TABLE eligible_staff_person (
              person_id INTEGER NOT NULL PRIMARY KEY
            ) STRICT;
            """
        )
        return connection
    except sqlite3.Error as error:
        raise ProducerError("SQLITE_BUILD_FAILED") from error


def _line_records(
    path: Path,
    cancelled: Callable[[], bool] = lambda: False,
    cancellation_evidence: object | None = None,
) -> Iterator[tuple[int, bytes, bool]]:
    with path.open("rb", buffering=_SOURCE_BUFFER_BYTES) as source:
        line_number = 0
        while True:
            if cancelled():
                _fail("CANCELED", evidence=cancellation_evidence)
            data = source.readline(_MAX_LINE_BYTES + 1)
            if cancelled():
                _fail("CANCELED", evidence=cancellation_evidence)
            if not data:
                return
            line_number += 1
            too_long = len(data) > _MAX_LINE_BYTES and not data.endswith(b"\n")
            if too_long:
                while data and not data.endswith(b"\n"):
                    if cancelled():
                        _fail("CANCELED", evidence=cancellation_evidence)
                    data = source.readline(_MAX_LINE_BYTES + 1)
                    if cancelled():
                        _fail("CANCELED", evidence=cancellation_evidence)
                yield line_number, b"", False
                continue
            terminated = data.endswith(b"\n")
            yield line_number, data[:-1] if terminated else data, terminated


def _classify_sources(
    connection: sqlite3.Connection,
    sources: tuple[SourceInput, ...],
    common_identities: set[tuple[int, int]],
    cancelled: Callable[[], bool],
) -> tuple[tuple[SourceAccounting, ...], int, ProducerError | None]:
    accounting = tuple(
        SourceAccounting(source.name, source.size, source.digest) for source in sources
    )
    record_failure: ProducerError | None = None
    filtered_by_valid_cv = 0
    processed = 0
    for source, evidence in zip(sources, accounting, strict=True):
        for line_number, data, terminated in _line_records(
            source.path,
            cancelled,
            accounting,
        ):
            if cancelled():
                _fail("CANCELED", evidence=accounting)
            evidence.records_total += 1
            try:
                if not terminated or not data:
                    _fail("SOURCE_RECORD_MALFORMED")
                record = _parse_json_line(data)
                _record_shape(source.name, record)
                identity = _record_identity(source.name, record)
                record_hash = _record_digest(record)
                seen = connection.execute(
                    "SELECT digest FROM temp.seen_record WHERE source = ? AND identity = ?",
                    (source.name, identity),
                ).fetchone()
                if seen is not None:
                    if seen[0] == record_hash:
                        evidence.duplicate += 1
                    else:
                        evidence.invalid += 1
                        if record_failure is None:
                            record_failure = ProducerError(
                                "SOURCE_DUPLICATE_CONFLICT",
                                source=source.name,
                                line=line_number,
                            )
                    continue
                connection.execute(
                    "INSERT INTO temp.seen_record VALUES (?, ?, ?)",
                    (source.name, identity, record_hash),
                )
                classification, filtered = _apply_record(
                    connection,
                    source.name,
                    record,
                    common_identities,
                )
                setattr(evidence, classification, getattr(evidence, classification) + 1)
                filtered_by_valid_cv += filtered
            except ProducerError as error:
                evidence.invalid += 1
                if record_failure is None:
                    record_failure = ProducerError(
                        error.code,
                        source=source.name,
                        line=line_number,
                    )
            except sqlite3.IntegrityError:
                evidence.invalid += 1
                if record_failure is None:
                    record_failure = ProducerError(
                        "SOURCE_DUPLICATE_CONFLICT",
                        source=source.name,
                        line=line_number,
                    )
            processed += 1
            if processed % _BATCH_SIZE == 0:
                connection.commit()
    return accounting, filtered_by_valid_cv, record_failure


def _quality_summary(
    connection: sqlite3.Connection,
    filtered_by_valid_cv: int,
    unresolved: int,
) -> dict[str, int]:
    return {
        "NO_CHARACTERS": cast(
            int,
            connection.execute(
                "SELECT COUNT(*) FROM subject s WHERE NOT EXISTS "
                "(SELECT 1 FROM temp.source_subject_character c "
                "WHERE c.subject_id = s.subject_id)"
            ).fetchone()[0],
        ),
        "NO_CAST_RELATIONS": cast(
            int,
            connection.execute(
                "SELECT COUNT(*) FROM subject s WHERE NOT EXISTS "
                "(SELECT 1 FROM cast_credit c "
                "WHERE c.subject_type = s.subject_type AND c.subject_id = s.subject_id)"
            ).fetchone()[0],
        ),
        "FILTERED_BY_VALID_CV": filtered_by_valid_cv,
        "UNKNOWN_STAFF_POSITION": unresolved,
    }


def _table_counts(connection: sqlite3.Connection) -> dict[str, int]:
    rows = connection.execute(
        "SELECT 'archive_meta', COUNT(*) FROM archive_meta "
        "UNION ALL SELECT 'subject', COUNT(*) FROM subject "
        "UNION ALL SELECT 'subject_rating_bucket', COUNT(*) FROM subject_rating_bucket "
        "UNION ALL SELECT 'subject_tag', COUNT(*) FROM subject_tag "
        "UNION ALL SELECT 'person', COUNT(*) FROM person "
        "UNION ALL SELECT 'person_career', COUNT(*) FROM person_career "
        "UNION ALL SELECT 'character', COUNT(*) FROM character "
        "UNION ALL SELECT 'subject_relation', COUNT(*) FROM subject_relation "
        "UNION ALL SELECT 'staff_position', COUNT(*) FROM staff_position "
        "UNION ALL SELECT 'staff_position_category', COUNT(*) FROM staff_position_category "
        "UNION ALL SELECT 'staff_credit', COUNT(*) FROM staff_credit "
        "UNION ALL SELECT 'cast_credit', COUNT(*) FROM cast_credit "
        "UNION ALL SELECT 'staff_set', COUNT(*) FROM staff_set "
        "UNION ALL SELECT 'staff_set_member', COUNT(*) FROM staff_set_member "
        "UNION ALL SELECT 'catalog_position', COUNT(*) FROM catalog_position "
        "UNION ALL SELECT 'catalog_position_member', COUNT(*) FROM catalog_position_member "
        "UNION ALL SELECT 'catalog_group', COUNT(*) FROM catalog_group "
        "UNION ALL SELECT 'catalog_group_member', COUNT(*) FROM catalog_group_member "
        "UNION ALL SELECT 'catalog_capability', COUNT(*) FROM catalog_capability "
        "UNION ALL SELECT 'catalog_selection_rule', COUNT(*) FROM catalog_selection_rule"
    )
    counts = {cast(str, row[0]): cast(int, row[1]) for row in rows}
    if tuple(counts) != TABLE_NAMES:
        _fail("SQLITE_SCHEMA_FAILED")
    return counts


def _projection_digest(
    rows: Iterable[Mapping[str, object]],
    cancelled: Callable[[], bool],
) -> str:
    digest = hashlib.sha256()
    iterator = iter(rows)
    if cancelled():
        _fail("CANCELED")
    try:
        first = next(iterator)
    except StopIteration:
        if cancelled():
            _fail("CANCELED")
        return digest_bytes(b"[]\n")
    digest.update(b"[\n")

    def append(value: Mapping[str, object], *, comma: bool) -> None:
        if comma:
            digest.update(b",\n")
        encoded = canonical_json_bytes(dict(value))[:-1]
        lines = encoded.split(b"\n")
        digest.update(b"  " + b"\n  ".join(lines))

    append(first, comma=False)
    for index, row in enumerate(iterator, 1):
        if index % 1024 == 0 and cancelled():
            _fail("CANCELED")
        append(row, comma=True)
    if cancelled():
        _fail("CANCELED")
    digest.update(b"\n]\n")
    return f"sha256:{digest.hexdigest()}"


def _projection_rows(
    connection: sqlite3.Connection,
    name: str,
    catalog: _Catalog,
) -> Iterable[Mapping[str, object]]:
    if name == "subject":
        rows = connection.execute(
            "SELECT subject_type, subject_id, name, name_cn, nsfw, air_date, air_date_precision "
            "FROM subject ORDER BY subject_type COLLATE BINARY, subject_id"
        )
        return (
            {
                "subjectType": row[0],
                "subjectId": row[1],
                "name": row[2],
                "nameCn": row[3],
                "nsfw": bool(row[4]),
                "airDate": row[5],
                "airDatePrecision": row[6],
            }
            for row in rows
        )
    if name == "person":
        rows = connection.execute("SELECT person_id, name, name_cn FROM person ORDER BY person_id")

        def people() -> Iterator[Mapping[str, object]]:
            for row in rows:
                careers = [
                    value[0]
                    for value in connection.execute(
                        "SELECT career FROM person_career WHERE person_id = ? ORDER BY career",
                        (row[0],),
                    )
                ]
                yield {
                    "personId": row[0],
                    "name": row[1],
                    "nameCn": row[2],
                    "careers": careers,
                }

        return people()
    if name == "character":
        rows = connection.execute(
            "SELECT character_id, name, name_cn FROM character ORDER BY character_id"
        )
        return ({"characterId": row[0], "name": row[1], "nameCn": row[2]} for row in rows)
    if name == "subjectRelation":
        rows = connection.execute(
            "SELECT subject_type, subject_id, related_subject_type, related_subject_id, relation_type "
            "FROM subject_relation ORDER BY subject_type COLLATE BINARY, subject_id, "
            "related_subject_type COLLATE BINARY, related_subject_id, relation_type"
        )
        return (
            {
                "subjectType": row[0],
                "subjectId": row[1],
                "relatedSubjectType": row[2],
                "relatedSubjectId": row[3],
                "relationType": row[4],
            }
            for row in rows
        )
    if name == "staffPosition":
        rows = connection.execute(
            "SELECT subject_type, position_id, name_cn, name_en, name_jp, categories, "
            "sort_order, status FROM staff_position "
            "ORDER BY subject_type COLLATE BINARY, position_id"
        )
        return (
            {
                "subjectType": row[0],
                "positionId": row[1],
                "nameCn": row[2],
                "nameEn": row[3],
                "nameJp": row[4],
                "categories": json.loads(row[5]),
                "sortOrder": row[6],
                "status": row[7],
            }
            for row in rows
        )
    if name == "staffCredit":
        rows = connection.execute(
            "SELECT c.subject_type, c.subject_id, c.person_id, c.position_id, "
            "p.position_id IS NOT NULL, COALESCE(p.status = 'selectable', 0) "
            "FROM staff_credit c LEFT JOIN staff_position p "
            "ON p.subject_type = c.subject_type AND p.position_id = c.position_id "
            "ORDER BY c.subject_type COLLATE BINARY, c.subject_id, c.person_id, c.position_id"
        )
        return (
            {
                "subjectType": row[0],
                "subjectId": row[1],
                "personId": row[2],
                "positionId": row[3],
                "resolved": bool(row[4]),
                "selectable": bool(row[5]),
            }
            for row in rows
        )
    if name == "castCredit":
        rows = connection.execute(
            "SELECT subject_type, subject_id, person_id, character_id, role_type, eligible, provenance "
            "FROM cast_credit ORDER BY subject_type COLLATE BINARY, subject_id, person_id, character_id"
        )
        return (
            {
                "subjectType": row[0],
                "subjectId": row[1],
                "personId": row[2],
                "characterId": row[3],
                "roleType": row[4],
                "eligible": bool(row[5]),
                "provenance": row[6],
            }
            for row in rows
        )
    return (
        {
            "positionKey": item.position_key,
            "subjectType": item.subject_type,
            "positionKind": item.position_kind,
            "label": item.label,
            "displayOrder": item.display_order,
            "selectable": item.selectable,
            "capabilities": list(item.capabilities),
            "selectionRule": item.selection_rule,
        }
        for item in sorted(
            catalog.positions,
            key=lambda value: (value.display_order, value.position_key),
        )
    )


def _logical_digests(
    connection: sqlite3.Connection,
    catalog: _Catalog,
    cancelled: Callable[[], bool],
) -> dict[str, str]:
    names = (
        "subject",
        "person",
        "character",
        "subjectRelation",
        "staffPosition",
        "staffCredit",
        "castCredit",
        "catalogPosition",
    )
    result = {"algorithm": LOGICAL_ROWS_ALGORITHM}
    for name in names:
        if cancelled():
            _fail("CANCELED")
        result[name] = _projection_digest(
            _projection_rows(connection, name, catalog),
            cancelled,
        )
    return result


def _schema_object_record(connection: sqlite3.Connection) -> tuple[int, str]:
    rows = connection.execute(
        "SELECT type, name, tbl_name, sql FROM sqlite_schema "
        "WHERE type IN ('table','index','view','trigger') "
        "AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%' "
        "ORDER BY type COLLATE BINARY, name COLLATE BINARY, tbl_name COLLATE BINARY"
    )
    digest = hashlib.sha256()
    digest.update(f"{SCHEMA_OBJECT_ALGORITHM}\n".encode())
    values = list(rows)
    digest.update(f"count={len(values)}\n".encode())
    for row in values:
        for field, value in zip(("type", "name", "table", "sql"), row, strict=True):
            encoded = cast(str, value).encode("utf-8", errors="strict")
            digest.update(f"{field}={len(encoded)}:".encode())
            digest.update(encoded)
            digest.update(b"\n")
    return len(values), f"sha256:{digest.hexdigest()}"


def _canonical_schema_record(contracts_root: Path) -> tuple[int, str]:
    try:
        matrix = json.loads(
            (contracts_root / "schemas" / "archive" / "compatibility-matrix.json")
            .read_bytes()
            .decode("utf-8", errors="strict")
        )
        record = matrix["canonicalSchema"]
        if (
            set(record) != {"schemaSqlDigest", "algorithm", "digest", "objectCount"}
            or record["algorithm"] != SCHEMA_OBJECT_ALGORITHM
            or isinstance(record["objectCount"], bool)
            or not isinstance(record["objectCount"], int)
            or record["objectCount"] <= 0
            or not isinstance(record["digest"], str)
            or re.fullmatch(r"sha256:[0-9a-f]{64}", record["digest"]) is None
        ):
            _fail("CONTRACT_INPUT_INVALID")
        return record["objectCount"], record["digest"]
    except (OSError, UnicodeDecodeError, json.JSONDecodeError, KeyError, TypeError) as error:
        raise ProducerError("CONTRACT_INPUT_INVALID") from error


def _validate_database(
    path: Path,
    contracts_root: Path,
    identity: BuildIdentity,
    table_counts: Mapping[str, int],
    cancelled: Callable[[], bool],
) -> None:
    uri = f"file:{quote(path.resolve().as_posix(), safe='/')}?mode=ro&immutable=1"
    guard = _SQLiteCancellation(cancelled)
    try:
        guard.check()
        connection = sqlite3.connect(uri, uri=True)
        connection.set_progress_handler(guard.progress, _SQLITE_PROGRESS_OPCODES)
        connection.execute("PRAGMA query_only = ON")
        guard.check()
        if connection.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
            _fail("SQLITE_INTEGRITY_FAILED")
        guard.check()
        if connection.execute("PRAGMA foreign_key_check").fetchone() is not None:
            _fail("SQLITE_INTEGRITY_FAILED")
        if connection.execute("PRAGMA application_id").fetchone()[0] != 1_111_969_107:
            _fail("SQLITE_IDENTITY_FAILED")
        if connection.execute("PRAGMA user_version").fetchone()[0] != 1:
            _fail("SQLITE_IDENTITY_FAILED")
        meta = connection.execute(
            "SELECT data_version, manifest_schema_version, sqlite_schema_version, "
            "data_version_algorithm, domain_rules_version, cast_rules_version, catalog_config_digest "
            "FROM archive_meta WHERE singleton = 1"
        ).fetchone()
        if meta != (
            data_version(identity),
            identity.manifest_schema_version,
            identity.sqlite_schema_version,
            "bgmss-archive-data-version-v1",
            identity.domain_rules_version,
            identity.cast_rules_version,
            identity.catalog_config_digest,
        ):
            _fail("SQLITE_IDENTITY_FAILED")
        if _schema_object_record(connection) != _canonical_schema_record(contracts_root):
            _fail("SQLITE_REQUIRED_OBJECT_MISSING")
        if _table_counts(connection) != dict(table_counts):
            _fail("SQLITE_TABLE_COUNT_MISMATCH")
        guard.check()
    except sqlite3.Error as error:
        if guard.interruption is not None:
            raise guard.interruption from error
        if guard.requested:
            raise ProducerError("CANCELED") from error
        raise ProducerError("SQLITE_FORMAT_INVALID") from error
    finally:
        if "connection" in locals():
            connection.set_progress_handler(None, 0)
            connection.close()


def build_database(
    *,
    contracts_root: Path,
    destination: Path,
    sources: tuple[SourceInput, ...],
    common_bytes: bytes,
    catalog_bytes: bytes,
    identity: BuildIdentity,
    cancelled: Callable[[], bool] = lambda: False,
) -> BuildResult:
    """Stream verified sources into one fresh, fully validated SQLite v1."""
    ordered_sources = _source_gate(sources, cancelled)
    if digest_bytes(common_bytes) != identity.common_digest:
        _fail("COMMON_DIGEST_MISMATCH")
    if digest_bytes(catalog_bytes) != identity.catalog_config_digest:
        _fail("CATALOG_DIGEST_MISMATCH")
    schema_path = contracts_root / "schemas" / "archive" / "schema.sql"
    try:
        schema_bytes = schema_path.read_bytes()
        schema_sql = schema_bytes.decode("utf-8", errors="strict")
    except (OSError, UnicodeDecodeError) as error:
        raise ProducerError("CONTRACT_INPUT_INVALID") from error
    if digest_bytes(schema_bytes) != identity.schema_sql_digest:
        _fail("SCHEMA_DIGEST_MISMATCH")
    common_positions, categories = _parse_common(common_bytes)
    catalog = _parse_catalog(catalog_bytes)
    version = data_version(identity)
    destination.parent.mkdir(parents=True, exist_ok=True)
    connection = _open_database(destination, schema_sql)
    guard = _SQLiteCancellation(cancelled)
    try:
        connection.set_progress_handler(guard.progress, _SQLITE_PROGRESS_OPCODES)
        guard.check()
        connection.execute(
            "INSERT INTO archive_meta VALUES (1, ?, ?, ?, ?, ?, ?, ?)",
            (
                version,
                identity.manifest_schema_version,
                identity.sqlite_schema_version,
                "bgmss-archive-data-version-v1",
                identity.domain_rules_version,
                identity.cast_rules_version,
                identity.catalog_config_digest,
            ),
        )
        common_identities = _insert_common(
            connection,
            common_positions,
            categories,
            identity.common_commit,
        )
        _insert_catalog(connection, catalog)
        accounting, filtered_by_valid_cv, failure = _classify_sources(
            connection,
            ordered_sources,
            common_identities,
            cancelled,
        )
        connection.commit()
        guard.check()
        if failure is not None:
            failure.evidence = accounting
            raise failure
        unresolved = sum(item.unresolved for item in accounting)
        quality_summary = _quality_summary(
            connection,
            filtered_by_valid_cv,
            unresolved,
        )
        table_counts = _table_counts(connection)
        logical_digests = _logical_digests(connection, catalog, cancelled)
        if tuple(quality_summary) != QUALITY_NAMES or tuple(table_counts) != TABLE_NAMES:
            _fail("SQLITE_BUILD_FAILED")
        if connection.execute("PRAGMA foreign_key_check").fetchone() is not None:
            _fail("SQLITE_INTEGRITY_FAILED")
        if connection.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
            _fail("SQLITE_INTEGRITY_FAILED")
        if _schema_object_record(connection) != _canonical_schema_record(contracts_root):
            _fail("SQLITE_REQUIRED_OBJECT_MISSING")
        connection.execute("PRAGMA optimize")
        connection.commit()
        guard.check()
    except sqlite3.Error as error:
        if guard.interruption is not None:
            raise guard.interruption from error
        if guard.requested:
            raise ProducerError("CANCELED") from error
        raise ProducerError("SQLITE_BUILD_FAILED") from error
    finally:
        connection.set_progress_handler(None, 0)
        connection.close()
    if cancelled():
        _fail("CANCELED", evidence=accounting)
    _validate_database(
        destination,
        contracts_root,
        identity,
        table_counts,
        cancelled,
    )
    for suffix in ("-wal", "-shm", "-journal"):
        if Path(f"{destination}{suffix}").exists():
            _fail("SQLITE_BUILD_FAILED")
    return BuildResult(
        version,
        destination,
        accounting,
        table_counts,
        quality_summary,
        logical_digests,
    )
