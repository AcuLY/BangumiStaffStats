"""Read-only adapter for the shared Archive contract bundle."""

from __future__ import annotations

import codecs
import hashlib
import json
import math
import os
import stat
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Final, NoReturn, Protocol, cast

_ALGORITHM: Final = "bgmss-archive-data-version-v1"
_COMMON_COMMIT: Final = "6a8442c17143a870357a5ff812362e8b5cfe9f9d"
_SAFE_INTEGER_MAX: Final = 9_007_199_254_740_991
_SOURCE_NAMES: Final = frozenset(
    {
        "subject.jsonlines",
        "person.jsonlines",
        "character.jsonlines",
        "subject-persons.jsonlines",
        "subject-characters.jsonlines",
        "person-characters.jsonlines",
        "subject-relations.jsonlines",
    }
)
_SCHEMA_FILES: Final = {
    "manifest": "archive-manifest.schema.json",
    "pointer": "current-pointer.schema.json",
    "data_version_input": "data-version-input.schema.json",
    "fixture_index": "fixture-index.schema.json",
}
_OUTCOME_STAGES: Final = {
    "VALID": "valid",
    "MANIFEST_SCHEMA_INVALID": "json-schema",
    "MANIFEST_ACCOUNTING_INVALID": "source-accounting",
    "POINTER_SCHEMA_INVALID": "json-schema",
    "ARCHIVE_VERSION_UNSUPPORTED": "compatibility",
    "DATA_VERSION_MISMATCH": "data-version",
    "SQLITE_DIGEST_MISMATCH": "sqlite-digest",
    "SQLITE_FORMAT_INVALID": "sqlite-format",
    "SQLITE_DATA_VERSION_MISMATCH": "sqlite-identity",
    "SQLITE_REQUIRED_OBJECT_MISSING": "sqlite-required-objects",
    "SQLITE_TABLE_COUNT_MISMATCH": "sqlite-table-count",
}
_SELECTED_CASES: Final = (
    ("minimal-valid", "VALID"),
    ("data-version-vector", "VALID"),
    ("manifest-bad-digest", "MANIFEST_SCHEMA_INVALID"),
    ("manifest-unknown-field", "MANIFEST_SCHEMA_INVALID"),
    ("manifest-unsafe-sqlite-file", "MANIFEST_SCHEMA_INVALID"),
    ("manifest-source-accounting-mismatch", "MANIFEST_ACCOUNTING_INVALID"),
    ("sqlite-unsupported-schema", "ARCHIVE_VERSION_UNSUPPORTED"),
    ("manifest-data-version-mismatch", "DATA_VERSION_MISMATCH"),
)
_EXPECTED_PRECEDENCE: Final = (
    (1, "json-schema", ("MANIFEST_SCHEMA_INVALID", "POINTER_SCHEMA_INVALID")),
    (2, "source-accounting", ("MANIFEST_ACCOUNTING_INVALID",)),
    (3, "compatibility", ("ARCHIVE_VERSION_UNSUPPORTED",)),
    (4, "data-version", ("DATA_VERSION_MISMATCH",)),
    (5, "identity-path", ("SQLITE_DATA_VERSION_MISMATCH",)),
    (6, "file-integrity", ("SQLITE_FORMAT_INVALID",)),
    (7, "sqlite-digest", ("SQLITE_DIGEST_MISMATCH",)),
    (8, "sqlite-format", ("SQLITE_FORMAT_INVALID",)),
    (9, "sqlite-identity", ("SQLITE_DATA_VERSION_MISMATCH",)),
    (10, "sqlite-required-objects", ("SQLITE_REQUIRED_OBJECT_MISSING",)),
    (11, "sqlite-table-count", ("SQLITE_TABLE_COUNT_MISMATCH",)),
)


class ContractInputError(RuntimeError):
    """The supplied shared contract bundle is not a valid closed input."""


class ContractExpectationError(RuntimeError):
    """A valid indexed case did not produce its approved outcome."""


class _JsonParseError(ValueError):
    """Strict JSON parsing failed."""


class _Validator(Protocol):
    def is_valid(self, instance: object) -> bool:
        """Return whether an instance satisfies the shared schema."""


@dataclass(frozen=True, slots=True)
class ContractReport:
    """Bounded evidence returned after a successful whole-bundle check."""

    indexed_files: int
    selected_outcomes: tuple[tuple[str, str], ...]
    domain_rules_version: str
    cast_rules_version: str
    compatibility_matrix_digest: str


@dataclass(frozen=True, slots=True)
class _Validators:
    manifest: _Validator
    pointer: _Validator
    data_version_input: _Validator
    fixture_index: _Validator


@dataclass(frozen=True, slots=True)
class _Matrix:
    required_tables: tuple[str, ...]
    required_indexes: tuple[str, ...]
    schema_sql_digest: str
    schema_object_algorithm: str
    schema_object_digest: str
    schema_object_count: int
    domain_rules_version: str
    cast_rules_version: str
    digest: str


@dataclass(frozen=True, slots=True)
class _IndexEntry:
    path: str
    digest: str
    case_id: str
    validation_stage: str
    expected: str


def _fail_input(message: str) -> NoReturn:
    raise ContractInputError(message)


def _fail_expectation(message: str) -> NoReturn:
    raise ContractExpectationError(message)


def _object(value: object, label: str) -> dict[str, object]:
    if not isinstance(value, dict) or not all(isinstance(key, str) for key in value):
        _fail_input(f"{label} must be an object")
    return cast(dict[str, object], value)


def _array(value: object, label: str) -> list[object]:
    if not isinstance(value, list):
        _fail_input(f"{label} must be an array")
    return cast(list[object], value)


def _string(value: object, label: str) -> str:
    if not isinstance(value, str):
        _fail_input(f"{label} must be a string")
    return value


def _integer(value: object, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        _fail_input(f"{label} must be an integer")
    return value


def _root_directory(candidate: Path) -> Path:
    try:
        metadata = candidate.lstat()
        if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISDIR(metadata.st_mode):
            _fail_input("contracts root must be a non-symlink directory")
        return candidate.resolve(strict=True)
    except (OSError, RuntimeError) as error:
        raise ContractInputError("contracts root is unavailable") from error


def _regular_file(root: Path, relative: str) -> Path:
    pure = PurePosixPath(relative)
    if pure.is_absolute() or not pure.parts or any(part in {"", ".", ".."} for part in pure.parts):
        _fail_input("contract path is not a safe relative path")

    current = root
    try:
        for part in pure.parts[:-1]:
            current /= part
            metadata = current.lstat()
            if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISDIR(metadata.st_mode):
                _fail_input("contract parent is not a regular directory")
        current /= pure.parts[-1]
        metadata = current.lstat()
        if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISREG(metadata.st_mode):
            _fail_input("contract input is not a regular file")
        resolved = current.resolve(strict=True)
        if not resolved.is_relative_to(root):
            _fail_input("contract input escapes its root")
        return resolved
    except (OSError, RuntimeError) as error:
        raise ContractInputError("contract input is unavailable") from error


def _read_bytes(path: Path) -> bytes:
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    descriptor: int | None = None
    try:
        descriptor = os.open(path, flags)
        metadata = os.fstat(descriptor)
        if not stat.S_ISREG(metadata.st_mode):
            _fail_input("contract input changed file type")
        chunks: list[bytes] = []
        while chunk := os.read(descriptor, 64 * 1024):
            chunks.append(chunk)
        return b"".join(chunks)
    except OSError as error:
        raise ContractInputError("contract input cannot be read") from error
    finally:
        if descriptor is not None:
            os.close(descriptor)


def _reject_constant(_value: str) -> NoReturn:
    raise _JsonParseError


def _finite_float(value: str) -> float:
    result = float(value)
    if not math.isfinite(result):
        raise _JsonParseError
    return result


def _unique_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise _JsonParseError
        result[key] = value
    return result


def _decode_json(data: bytes) -> object:
    if data.startswith(codecs.BOM_UTF8):
        raise _JsonParseError
    try:
        text = data.decode("utf-8", errors="strict")
        return cast(
            object,
            json.loads(
                text,
                object_pairs_hook=_unique_object,
                parse_constant=_reject_constant,
                parse_float=_finite_float,
            ),
        )
    except (UnicodeDecodeError, json.JSONDecodeError, _JsonParseError, OverflowError) as error:
        raise _JsonParseError from error


def _strict_json(path: Path) -> object:
    return _decode_json(_read_bytes(path))


def _digest_bytes(data: bytes) -> str:
    return f"sha256:{hashlib.sha256(data).hexdigest()}"


def _digest_file(path: Path) -> str:
    return _digest_bytes(_read_bytes(path))


def _walk_schema(node: object, location: str = "#") -> None:
    if isinstance(node, list):
        for index, child in enumerate(node):
            _walk_schema(child, f"{location}/{index}")
        return
    if not isinstance(node, dict):
        return
    schema = cast(dict[str, object], node)
    if schema.get("type") == "object" and schema.get("additionalProperties") is not False:
        _fail_input(f"{location} permits unknown object properties")
    if schema.get("type") == "integer":
        minimum = _integer(schema.get("minimum"), f"{location} minimum")
        maximum = _integer(schema.get("maximum"), f"{location} maximum")
        if minimum < -_SAFE_INTEGER_MAX or maximum > _SAFE_INTEGER_MAX:
            _fail_input(f"{location} exceeds JSON-safe integer bounds")
    for key, value in schema.items():
        _walk_schema(value, f"{location}/{key}")


def _compile_validator(schema: object, label: str) -> _Validator:
    from jsonschema import Draft202012Validator
    from jsonschema.exceptions import SchemaError

    document = _object(schema, label)
    if document.get("$schema") != "https://json-schema.org/draft/2020-12/schema":
        _fail_input(f"{label} does not declare JSON Schema 2020-12")
    _walk_schema(document, label)
    try:
        Draft202012Validator.check_schema(document)
    except SchemaError as error:
        raise ContractInputError(f"{label} is not a valid schema") from error
    return cast(_Validator, Draft202012Validator(document))


def _load_validators(schema_root: Path) -> _Validators:
    compiled: dict[str, _Validator] = {}
    for name, relative in _SCHEMA_FILES.items():
        path = _regular_file(schema_root, relative)
        try:
            document = _strict_json(path)
        except _JsonParseError as error:
            raise ContractInputError("schema JSON is not strict") from error
        compiled[name] = _compile_validator(document, relative)
    return _Validators(
        manifest=compiled["manifest"],
        pointer=compiled["pointer"],
        data_version_input=compiled["data_version_input"],
        fixture_index=compiled["fixture_index"],
    )


def _strings(value: object, label: str, *, count: int) -> tuple[str, ...]:
    items = tuple(_string(item, label) for item in _array(value, label))
    if len(items) != count or len(set(items)) != count:
        _fail_input(f"{label} has an invalid closed inventory")
    return items


def _load_matrix(schema_root: Path) -> _Matrix:
    try:
        matrix = _object(
            _strict_json(_regular_file(schema_root, "compatibility-matrix.json")),
            "compatibility matrix",
        )
    except _JsonParseError as error:
        raise ContractInputError("compatibility matrix JSON is not strict") from error

    expected_keys = {
        "matrixSchemaVersion",
        "supported",
        "canonicalSchema",
        "requiredTables",
        "requiredIndexes",
        "validationPrecedence",
        "sentinels",
    }
    if (
        set(matrix) != expected_keys
        or _integer(
            matrix.get("matrixSchemaVersion"),
            "matrix schema version",
        )
        != 1
    ):
        _fail_input("compatibility matrix shape is invalid")
    supported = _array(matrix.get("supported"), "supported compatibility tuples")
    if len(supported) != 1:
        _fail_input("compatibility matrix tuple is unsupported")
    supported_tuple = _object(supported[0], "supported compatibility tuple")
    if set(supported_tuple) != {
        "pointerSchemaVersion",
        "manifestSchemaVersion",
        "sqliteSchemaVersion",
        "sqliteApplicationId",
        "dataVersionAlgorithm",
        "domainRulesVersion",
        "castRulesVersion",
    }:
        _fail_input("compatibility matrix tuple shape is invalid")
    if (
        _integer(supported_tuple.get("pointerSchemaVersion"), "pointer schema version") != 1
        or _integer(supported_tuple.get("manifestSchemaVersion"), "manifest schema version") != 1
        or _integer(supported_tuple.get("sqliteSchemaVersion"), "SQLite schema version") != 1
        or _integer(supported_tuple.get("sqliteApplicationId"), "SQLite application id")
        != 1_111_969_107
        or _string(supported_tuple.get("dataVersionAlgorithm"), "dataVersion algorithm")
        != _ALGORITHM
        or _string(supported_tuple.get("domainRulesVersion"), "domain rules version")
        != "domain-raw-v1"
        or _string(supported_tuple.get("castRulesVersion"), "cast rules version") != "cast-exact-v1"
    ):
        _fail_input("compatibility matrix tuple is unsupported")

    canonical_schema = _object(matrix.get("canonicalSchema"), "canonical schema identity")
    if set(canonical_schema) != {
        "schemaSqlDigest",
        "algorithm",
        "digest",
        "objectCount",
    }:
        _fail_input("canonical schema identity shape is invalid")
    schema_sql_digest = _string(
        canonical_schema.get("schemaSqlDigest"),
        "canonical schema SQL digest",
    )
    schema_object_algorithm = _string(
        canonical_schema.get("algorithm"),
        "canonical schema object algorithm",
    )
    schema_object_digest = _string(
        canonical_schema.get("digest"),
        "canonical schema object digest",
    )
    schema_object_count = _integer(
        canonical_schema.get("objectCount"),
        "canonical schema object count",
    )
    if (
        schema_object_algorithm != "bgmss-sqlite-schema-objects-v1"
        or not schema_sql_digest.startswith("sha256:")
        or len(schema_sql_digest) != 71
        or not schema_object_digest.startswith("sha256:")
        or len(schema_object_digest) != 71
    ):
        _fail_input("canonical schema identity is invalid")

    precedence = []
    for item in _array(matrix.get("validationPrecedence"), "validation precedence"):
        entry = _object(item, "validation precedence entry")
        precedence.append(
            (
                _integer(entry.get("order"), "precedence order"),
                _string(entry.get("stage"), "precedence stage"),
                tuple(
                    _string(error, "precedence error")
                    for error in _array(entry.get("errors"), "precedence errors")
                ),
            )
        )
    if tuple(precedence) != _EXPECTED_PRECEDENCE:
        _fail_input("validation precedence drifted")

    sentinels = _array(matrix.get("sentinels"), "sentinels")
    sentinel_ids: set[str] = set()
    for item in sentinels:
        sentinel = _object(item, "sentinel")
        if set(sentinel) != {"id", "sql", "expectedInteger"}:
            _fail_input("sentinel shape is invalid")
        sentinel_ids.add(_string(sentinel.get("id"), "sentinel id"))
        _string(sentinel.get("sql"), "sentinel SQL")
        _integer(sentinel.get("expectedInteger"), "sentinel expected integer")
    if not sentinels or len(sentinel_ids) != len(sentinels):
        _fail_input("sentinel inventory is invalid")

    required_tables = _strings(matrix.get("requiredTables"), "required tables", count=20)
    required_indexes = _strings(matrix.get("requiredIndexes"), "required indexes", count=15)
    if schema_object_count != len(required_tables) + len(required_indexes):
        _fail_input("canonical schema object count is invalid")

    return _Matrix(
        required_tables=required_tables,
        required_indexes=required_indexes,
        schema_sql_digest=schema_sql_digest,
        schema_object_algorithm=schema_object_algorithm,
        schema_object_digest=schema_object_digest,
        schema_object_count=schema_object_count,
        domain_rules_version=cast(str, supported_tuple["domainRulesVersion"]),
        cast_rules_version=cast(str, supported_tuple["castRulesVersion"]),
        digest=_digest_file(_regular_file(schema_root, "compatibility-matrix.json")),
    )


def _validate_ddl(schema_root: Path, matrix: _Matrix) -> str:
    ddl = _read_bytes(_regular_file(schema_root, "schema.sql"))
    if (
        codecs.BOM_UTF8 in ddl[:3]
        or b"\r" in ddl
        or not ddl.endswith(b"\n")
        or ddl.endswith(b"\n\n")
    ):
        _fail_input("schema.sql encoding or line endings are invalid")
    try:
        text = ddl.decode("utf-8", errors="strict")
    except UnicodeDecodeError as error:
        raise ContractInputError("schema.sql is not UTF-8") from error
    if "PRAGMA application_id = 1111969107;" not in text or "PRAGMA user_version = 1;" not in text:
        _fail_input("schema.sql identity is invalid")
    for table in matrix.required_tables:
        if f"CREATE TABLE {table} (" not in text:
            _fail_input("schema.sql is missing a required table")
    for index in matrix.required_indexes:
        if f"CREATE INDEX {index}" not in text:
            _fail_input("schema.sql is missing a required index")
    digest = _digest_bytes(ddl)
    if digest != matrix.schema_sql_digest:
        _fail_input("schema.sql digest disagrees with the compatibility matrix")
    return digest


def _walk_regular_files(root: Path) -> tuple[str, ...]:
    files: list[str] = []

    def visit(directory: Path) -> None:
        try:
            with os.scandir(directory) as iterator:
                entries = sorted(iterator, key=lambda item: item.name)
        except OSError as error:
            raise ContractInputError("contract directory cannot be read") from error
        for entry in entries:
            if entry.is_symlink():
                _fail_input("contract tree contains a symlink")
            try:
                metadata = entry.stat(follow_symlinks=False)
            except OSError as error:
                raise ContractInputError("contract entry cannot be inspected") from error
            path = Path(entry.path)
            if stat.S_ISDIR(metadata.st_mode):
                visit(path)
            elif stat.S_ISREG(metadata.st_mode):
                files.append(path.relative_to(root).as_posix())
            else:
                _fail_input("contract tree contains a special file")

    visit(root)
    return tuple(sorted(files))


def _index_entries(golden_root: Path, validator: _Validator) -> tuple[_IndexEntry, ...]:
    index_path = _regular_file(golden_root, "index.json")
    try:
        document = _strict_json(index_path)
    except _JsonParseError as error:
        raise ContractInputError("fixture index JSON is not strict") from error
    if not validator.is_valid(document):
        _fail_input("fixture index schema validation failed")
    index = _object(document, "fixture index")

    entries: list[_IndexEntry] = []
    for value in _array(index.get("files"), "fixture index files"):
        item = _object(value, "fixture index entry")
        entries.append(
            _IndexEntry(
                path=_string(item.get("path"), "fixture path"),
                digest=_string(item.get("digest"), "fixture digest"),
                case_id=_string(item.get("caseId"), "fixture case id"),
                validation_stage=_string(item.get("validationStage"), "fixture stage"),
                expected=_string(item.get("expected"), "fixture outcome"),
            )
        )
    if len(entries) != 32 or len({entry.path for entry in entries}) != len(entries):
        _fail_input("fixture index does not contain the approved 32 unique files")

    physical = {
        path for path in _walk_regular_files(golden_root) if not path.startswith("producer/")
    }
    physical.discard("index.json")
    indexed = {entry.path for entry in entries}
    if physical != indexed:
        _fail_input("fixture index is not closed")

    for entry in entries:
        path = _regular_file(golden_root, entry.path)
        if _digest_file(path) != entry.digest:
            _fail_input("fixture digest drifted")
        if _OUTCOME_STAGES.get(entry.expected) != entry.validation_stage:
            _fail_input("fixture stage and outcome disagree")

    grouped: dict[str, set[str]] = {}
    for entry in entries:
        grouped.setdefault(entry.case_id, set()).add(entry.expected)
    if any(len(outcomes) != 1 for outcomes in grouped.values()):
        _fail_input("fixture case outcomes disagree")
    if not {case_id for case_id, _expected in _SELECTED_CASES}.issubset(grouped):
        _fail_input("an approved selected fixture case is absent")
    return tuple(entries)


def _manifest_accounting(document: object) -> str | None:
    manifest = _object(document, "manifest")
    sources = _array(manifest.get("sourceFiles"), "manifest source files")
    names: set[str] = set()
    for value in sources:
        source = _object(value, "manifest source")
        names.add(_string(source.get("name"), "source name"))
        records_total = _integer(source.get("recordsTotal"), "records total")
        outcome = sum(
            _integer(source.get(field), f"source {field}")
            for field in ("imported", "duplicate", "invalid", "unresolved")
        )
        if outcome != records_total:
            return "MANIFEST_ACCOUNTING_INVALID"
    if names != _SOURCE_NAMES or len(sources) != len(_SOURCE_NAMES):
        return "MANIFEST_ACCOUNTING_INVALID"
    if manifest.get("commonCommit") != _COMMON_COMMIT:
        return "MANIFEST_ACCOUNTING_INVALID"
    return None


def _manifest_inputs(document: object) -> dict[str, object]:
    manifest = _object(document, "manifest")
    keys = (
        "archiveRelease",
        "archiveDigest",
        "commonCommit",
        "commonDigest",
        "manifestSchemaVersion",
        "sqliteSchemaVersion",
        "schemaSqlDigest",
        "domainRulesVersion",
        "castRulesVersion",
        "catalogConfigDigest",
    )
    return {key: manifest[key] for key in keys}


def _canonical_preimage(values: Mapping[str, object]) -> bytes:
    lines = [
        _ALGORITHM,
        f"archiveRelease={values['archiveRelease']}",
        f"archiveDigest={values['archiveDigest']}",
        f"commonCommit={values['commonCommit']}",
        f"commonDigest={values['commonDigest']}",
        f"manifestSchemaVersion={values['manifestSchemaVersion']}",
        f"sqliteSchemaVersion={values['sqliteSchemaVersion']}",
        f"schemaSqlDigest={values['schemaSqlDigest']}",
        f"domainRulesVersion={values['domainRulesVersion']}",
        f"castRulesVersion={values['castRulesVersion']}",
        f"catalogConfigDigest={values['catalogConfigDigest']}",
        "",
    ]
    return "\n".join(lines).encode()


def _data_version(values: Mapping[str, object]) -> str:
    return f"dv1-{hashlib.sha256(_canonical_preimage(values)).hexdigest()}"


def _compatible(pointer: object, manifest: object, matrix: _Matrix) -> bool:
    pointer_object = _object(pointer, "pointer")
    manifest_object = _object(manifest, "manifest")
    return (
        pointer_object.get("pointerSchemaVersion") == 1
        and manifest_object.get("manifestSchemaVersion") == 1
        and manifest_object.get("sqliteSchemaVersion") == 1
        and manifest_object.get("dataVersionAlgorithm") == _ALGORITHM
        and manifest_object.get("domainRulesVersion") == matrix.domain_rules_version
        and manifest_object.get("castRulesVersion") == matrix.cast_rules_version
    )


def _classify_json(path: Path, validator: _Validator) -> str:
    try:
        document = _strict_json(path)
    except _JsonParseError:
        return "MANIFEST_SCHEMA_INVALID"
    if not validator.is_valid(document):
        return "MANIFEST_SCHEMA_INVALID"
    return _manifest_accounting(document) or "VALID"


def _bundle_directory(golden_root: Path, case_id: str) -> Path:
    relative = "valid/minimal" if case_id == "minimal-valid" else f"invalid/bundles/{case_id}"
    manifest_path = _regular_file(golden_root, f"{relative}/archive-manifest.json")
    return manifest_path.parent


def _classify_bundle(
    golden_root: Path,
    case_id: str,
    validators: _Validators,
    matrix: _Matrix,
) -> str:
    bundle = _bundle_directory(golden_root, case_id)
    manifest_path = _regular_file(bundle, "archive-manifest.json")

    try:
        manifest = _strict_json(manifest_path)
    except _JsonParseError:
        return "MANIFEST_SCHEMA_INVALID"
    if not validators.manifest.is_valid(manifest):
        return "MANIFEST_SCHEMA_INVALID"

    pointer_path = _regular_file(bundle, "current-pointer.json")
    try:
        pointer = _strict_json(pointer_path)
    except _JsonParseError:
        return "POINTER_SCHEMA_INVALID"
    if not validators.pointer.is_valid(pointer):
        return "POINTER_SCHEMA_INVALID"

    if accounting := _manifest_accounting(manifest):
        return accounting
    if not _compatible(pointer, manifest, matrix):
        return "ARCHIVE_VERSION_UNSUPPORTED"

    manifest_object = _object(manifest, "manifest")
    pointer_object = _object(pointer, "pointer")
    if _data_version(_manifest_inputs(manifest)) != manifest_object.get("dataVersion"):
        return "DATA_VERSION_MISMATCH"
    if pointer_object.get("dataVersion") != manifest_object.get(
        "dataVersion"
    ) or pointer_object.get("manifestDigest") != _digest_file(manifest_path):
        return "SQLITE_DATA_VERSION_MISMATCH"

    sqlite_path = _regular_file(bundle, "bangumi.sqlite")
    sqlite_bytes = _read_bytes(sqlite_path)
    if len(sqlite_bytes) != manifest_object.get("sqliteSize"):
        return "SQLITE_FORMAT_INVALID"
    if _digest_bytes(sqlite_bytes) != manifest_object.get("sqliteDigest"):
        return "SQLITE_DIGEST_MISMATCH"
    return "VALID"


def _validate_vector(
    path: Path,
    validator: _Validator,
    ddl_digest: str,
) -> str:
    try:
        document = _strict_json(path)
    except _JsonParseError as error:
        raise ContractInputError("dataVersion vector JSON is not strict") from error
    vector = _object(document, "dataVersion vector")
    expected_keys = {
        "vectorSchemaVersion",
        "algorithm",
        "input",
        "canonicalPreimage",
        "canonicalPreimageByteLength",
        "expectedDataVersion",
        "assertions",
    }
    if (
        set(vector) != expected_keys
        or _integer(vector.get("vectorSchemaVersion"), "vector schema version") != 1
        or vector.get("algorithm") != _ALGORITHM
    ):
        _fail_input("dataVersion vector shape is invalid")

    inputs = _object(vector.get("input"), "dataVersion vector input")
    if not validator.is_valid(inputs):
        _fail_input("dataVersion vector input is invalid")
    if inputs.get("schemaSqlDigest") != ddl_digest:
        _fail_input("schema.sql digest disagrees with the dataVersion vector")

    preimage = _canonical_preimage(inputs)
    if (
        vector.get("canonicalPreimage") != preimage.decode()
        or vector.get("canonicalPreimageByteLength") != len(preimage)
        or vector.get("expectedDataVersion") != _data_version(inputs)
    ):
        _fail_expectation("dataVersion vector canonical assertion failed")

    assertions = _object(vector.get("assertions"), "dataVersion assertions")
    stable = _object(assertions.get("stableRegeneration"), "stable regeneration assertion")
    if stable.get("expectedDataVersion") != vector.get("expectedDataVersion"):
        _fail_expectation("stable regeneration assertion failed")

    mutation = _object(assertions.get("oneFieldMutation"), "one-field mutation assertion")
    mutated = dict(inputs)
    field = _string(mutation.get("field"), "mutation field")
    if field not in mutated:
        _fail_input("mutation field is not a dataVersion input")
    mutated[field] = mutation.get("value")
    if not validator.is_valid(mutated):
        _fail_input("mutation input is invalid")
    mutation_result = _data_version(mutated)
    if mutation.get("expectedDataVersion") != mutation_result or mutation_result == vector.get(
        "expectedDataVersion"
    ):
        _fail_expectation("one-field mutation assertion failed")

    reordered = _object(assertions.get("inputOrderIndependence"), "input-order assertion")
    reordered_input = _object(reordered.get("input"), "reordered input")
    if not validator.is_valid(reordered_input):
        _fail_input("reordered dataVersion input is invalid")
    if _data_version(reordered_input) != vector.get("expectedDataVersion") or reordered.get(
        "expectedDataVersion"
    ) != vector.get("expectedDataVersion"):
        _fail_expectation("input-order assertion failed")

    catalog = _object(
        assertions.get("catalogMemberReorderEquivalence"),
        "catalog reorder assertion",
    )
    if catalog.get("canonicalCatalogConfigDigest") != inputs.get(
        "catalogConfigDigest"
    ) or catalog.get("expectedDataVersion") != vector.get("expectedDataVersion"):
        _fail_expectation("catalog reorder assertion failed")
    return "VALID"


def _expected_for_case(entries: tuple[_IndexEntry, ...], case_id: str) -> str:
    outcomes = {entry.expected for entry in entries if entry.case_id == case_id}
    if len(outcomes) != 1:
        _fail_input("selected fixture case has inconsistent index evidence")
    return next(iter(outcomes))


def check_contracts(contracts_root: Path) -> ContractReport:
    """Validate the shared Archive authority and approved producer-side cases."""
    root = _root_directory(contracts_root)
    schema_root = _regular_file(root, "schemas/archive/schema.sql").parent
    golden_root = _regular_file(root, "goldens/archive/index.json").parent

    validators = _load_validators(schema_root)
    matrix = _load_matrix(schema_root)
    ddl_digest = _validate_ddl(schema_root, matrix)
    entries = _index_entries(golden_root, validators.fixture_index)

    outcomes: list[tuple[str, str]] = []
    for case_id, approved_outcome in _SELECTED_CASES:
        expected = _expected_for_case(entries, case_id)
        if expected != approved_outcome:
            _fail_input("selected fixture outcome drifted")
        case_entries = tuple(entry for entry in entries if entry.case_id == case_id)
        if case_id == "data-version-vector":
            actual = _validate_vector(
                _regular_file(golden_root, case_entries[0].path),
                validators.data_version_input,
                ddl_digest,
            )
        elif case_id in {
            "minimal-valid",
            "sqlite-unsupported-schema",
            "manifest-data-version-mismatch",
        }:
            actual = _classify_bundle(golden_root, case_id, validators, matrix)
        else:
            actual = _classify_json(
                _regular_file(golden_root, case_entries[0].path),
                validators.manifest,
            )
        if actual != expected:
            _fail_expectation(f"selected fixture case {case_id} produced {actual}")
        outcomes.append((case_id, actual))

    minimal_manifest = _strict_json(
        _regular_file(golden_root, "valid/minimal/archive-manifest.json")
    )
    if _object(minimal_manifest, "minimal manifest").get("schemaSqlDigest") != ddl_digest:
        _fail_input("schema.sql digest disagrees with the minimal manifest")
    return ContractReport(
        indexed_files=len(entries),
        selected_outcomes=tuple(outcomes),
        domain_rules_version=matrix.domain_rules_version,
        cast_rules_version=matrix.cast_rules_version,
        compatibility_matrix_digest=matrix.digest,
    )
