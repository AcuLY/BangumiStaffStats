"""Canonical Archive identity and manifest finalization."""

from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Callable, Mapping
from datetime import datetime
from pathlib import Path
from typing import Final, cast

from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError

from .model import (
    DATA_VERSION_ALGORITHM,
    QUALITY_NAMES,
    SOURCE_NAMES,
    TABLE_NAMES,
    BuildIdentity,
    ProducerError,
    SourceAccounting,
)

_DIGEST: Final = re.compile(r"^sha256:[0-9a-f]{64}$")
_GENERATED_AT: Final = re.compile(
    r"^(?P<year>[0-9]{4})-(?P<month>[0-9]{2})-(?P<day>[0-9]{2})"
    r"T(?P<hour>[0-9]{2}):(?P<minute>[0-9]{2}):(?P<second>[0-9]{2})"
    r"(?:\.(?P<fraction>[0-9]{1,6}))?Z$"
)


def digest_bytes(data: bytes) -> str:
    """Return the contract SHA-256 form."""
    return f"sha256:{hashlib.sha256(data).hexdigest()}"


def digest_file(
    path: Path,
    cancelled: Callable[[], bool] = lambda: False,
) -> tuple[int, str]:
    """Hash one file incrementally."""
    size = 0
    digest = hashlib.sha256()
    with path.open("rb", buffering=0) as source:
        while True:
            if cancelled():
                raise ProducerError("CANCELED")
            chunk = source.read(1024 * 1024)
            if cancelled():
                raise ProducerError("CANCELED")
            if not chunk:
                break
            size += len(chunk)
            digest.update(chunk)
    return size, f"sha256:{digest.hexdigest()}"


def canonical_json_bytes(value: object) -> bytes:
    """Match the Contracts pretty-JSON byte convention."""
    try:
        text = json.dumps(
            value,
            ensure_ascii=False,
            allow_nan=False,
            indent=2,
            separators=(",", ": "),
        )
        return f"{text}\n".encode("utf-8", errors="strict")
    except (TypeError, ValueError, UnicodeEncodeError) as error:
        raise ProducerError("MANIFEST_SCHEMA_INVALID") from error


def identity_mapping(identity: BuildIdentity) -> dict[str, object]:
    """Return dataVersion input field names."""
    return {
        "archiveRelease": identity.archive_release,
        "archiveDigest": identity.archive_digest,
        "commonCommit": identity.common_commit,
        "commonDigest": identity.common_digest,
        "manifestSchemaVersion": identity.manifest_schema_version,
        "sqliteSchemaVersion": identity.sqlite_schema_version,
        "schemaSqlDigest": identity.schema_sql_digest,
        "domainRulesVersion": identity.domain_rules_version,
        "castRulesVersion": identity.cast_rules_version,
        "catalogConfigDigest": identity.catalog_config_digest,
    }


def canonical_preimage(identity: BuildIdentity) -> bytes:
    """Build the exact cycle-free dataVersion preimage."""
    values = identity_mapping(identity)
    lines = [
        DATA_VERSION_ALGORITHM,
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
    try:
        return "\n".join(lines).encode("ascii", errors="strict")
    except UnicodeEncodeError as error:
        raise ProducerError("IDENTITY_INVALID") from error


def data_version(identity: BuildIdentity) -> str:
    """Derive the immutable Archive identity."""
    return f"dv1-{hashlib.sha256(canonical_preimage(identity)).hexdigest()}"


def valid_generated_at(value: object) -> bool:
    """Validate the exact calendar-valid UTC contract subset."""
    if not isinstance(value, str):
        return False
    match = _GENERATED_AT.fullmatch(value)
    if match is None:
        return False
    try:
        datetime(
            int(match["year"]),
            int(match["month"]),
            int(match["day"]),
            int(match["hour"]),
            int(match["minute"]),
            int(match["second"]),
        )
    except ValueError:
        return False
    return True


def unicode_scalar_length(value: object) -> int | None:
    """Count Unicode scalar values, rejecting isolated surrogate code points."""
    if not isinstance(value, str):
        return None
    if any(0xD800 <= ord(character) <= 0xDFFF for character in value):
        return None
    try:
        value.encode("utf-8", errors="strict")
    except UnicodeEncodeError:
        return None
    return len(value)


def valid_manifest_url(value: object, *, common: bool) -> bool:
    """Apply the manifest's scalar-count and fixed-shape URL rules."""
    if not isinstance(value, str):
        return False
    length = unicode_scalar_length(value)
    if length is None or length < 12 or length > 2048:
        return False
    if not value.startswith("https://") or any(character in value for character in "\x00\r\n"):
        return False
    return not common or value.endswith("/subject_staffs.yml")


def _load_manifest_validator(contracts_root: Path) -> Draft202012Validator:
    schema_path = contracts_root / "schemas" / "archive" / "archive-manifest.schema.json"
    try:
        schema = json.loads(schema_path.read_bytes().decode("utf-8", errors="strict"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ProducerError("CONTRACT_INPUT_INVALID") from error
    if not isinstance(schema, dict):
        raise ProducerError("CONTRACT_INPUT_INVALID")
    try:
        Draft202012Validator.check_schema(schema)
    except SchemaError as error:
        raise ProducerError("CONTRACT_INPUT_INVALID") from error
    return Draft202012Validator(schema)


def validate_manifest(document: object, contracts_root: Path) -> dict[str, object]:
    """Validate one in-memory manifest through the real finalizer boundary."""
    if not isinstance(document, dict) or not all(isinstance(key, str) for key in document):
        raise ProducerError("MANIFEST_SCHEMA_INVALID")
    manifest = cast(dict[str, object], document)
    if (
        not valid_generated_at(manifest.get("generatedAt"))
        or not valid_manifest_url(manifest.get("archiveAssetUrl"), common=False)
        or not valid_manifest_url(manifest.get("commonSubjectStaffsUrl"), common=True)
        or not _load_manifest_validator(contracts_root).is_valid(manifest)
    ):
        raise ProducerError("MANIFEST_SCHEMA_INVALID")

    sources = manifest.get("sourceFiles")
    if not isinstance(sources, list) or len(sources) != len(SOURCE_NAMES):
        raise ProducerError("MANIFEST_ACCOUNTING_INVALID")
    names: list[str] = []
    for value in sources:
        if not isinstance(value, dict):
            raise ProducerError("MANIFEST_ACCOUNTING_INVALID")
        source = cast(dict[str, object], value)
        name = source.get("name")
        if not isinstance(name, str):
            raise ProducerError("MANIFEST_ACCOUNTING_INVALID")
        names.append(name)
        counts = tuple(
            source.get(key)
            for key in ("recordsTotal", "imported", "duplicate", "invalid", "unresolved")
        )
        if any(isinstance(item, bool) or not isinstance(item, int) for item in counts):
            raise ProducerError("MANIFEST_ACCOUNTING_INVALID")
        total, *outcomes = cast(tuple[int, int, int, int, int], counts)
        if total != sum(outcomes):
            raise ProducerError("MANIFEST_ACCOUNTING_INVALID")
    if tuple(names) != SOURCE_NAMES:
        raise ProducerError("MANIFEST_ACCOUNTING_INVALID")
    return manifest


def classify_manifest_bytes(data: bytes, contracts_root: Path) -> str:
    """Return the first stable manifest outcome for raw bytes."""
    try:
        document = json.loads(data.decode("utf-8", errors="strict"))
        validate_manifest(document, contracts_root)
    except (
        UnicodeDecodeError,
        json.JSONDecodeError,
        ProducerError,
        ValueError,
        TypeError,
    ) as error:
        if isinstance(error, ProducerError) and error.code == "MANIFEST_ACCOUNTING_INVALID":
            return error.code
        return "MANIFEST_SCHEMA_INVALID"
    return "VALID"


def finalize_manifest(
    *,
    contracts_root: Path,
    destination: Path,
    identity: BuildIdentity,
    generated_at: str,
    generator_version: str,
    archive_asset_url: str,
    archive_asset_name: str,
    archive_size: int,
    common_url: str,
    common_size: int,
    accounting: tuple[SourceAccounting, ...],
    table_counts: Mapping[str, int],
    quality_summary: Mapping[str, int],
    sqlite_path: Path,
    cancelled: Callable[[], bool] = lambda: False,
) -> tuple[dict[str, object], str]:
    """Validate and exclusively write canonical manifest bytes."""
    version = data_version(identity)
    sqlite_size, sqlite_digest = digest_file(sqlite_path, cancelled)
    if tuple(table_counts) != TABLE_NAMES or tuple(quality_summary) != QUALITY_NAMES:
        raise ProducerError("MANIFEST_SCHEMA_INVALID")
    document: dict[str, object] = {
        "manifestSchemaVersion": identity.manifest_schema_version,
        "sqliteSchemaVersion": identity.sqlite_schema_version,
        "dataVersionAlgorithm": DATA_VERSION_ALGORITHM,
        "dataVersion": version,
        "generatorVersion": generator_version,
        "generatedAt": generated_at,
        "archiveRelease": identity.archive_release,
        "archiveAssetUrl": archive_asset_url,
        "archiveAssetName": archive_asset_name,
        "archiveSize": archive_size,
        "archiveDigest": identity.archive_digest,
        "commonCommit": identity.common_commit,
        "commonSubjectStaffsUrl": common_url,
        "commonSize": common_size,
        "commonDigest": identity.common_digest,
        "schemaSqlDigest": identity.schema_sql_digest,
        "catalogConfigDigest": identity.catalog_config_digest,
        "domainRulesVersion": identity.domain_rules_version,
        "castRulesVersion": identity.cast_rules_version,
        "sourceFiles": [entry.as_manifest() for entry in accounting],
        "tableCounts": dict(table_counts),
        "qualitySummary": dict(quality_summary),
        "sqliteFile": "bangumi.sqlite",
        "sqliteSize": sqlite_size,
        "sqliteDigest": sqlite_digest,
    }
    validate_manifest(document, contracts_root)
    data = canonical_json_bytes(document)
    try:
        with destination.open("xb") as output:
            output.write(data)
            output.flush()
    except OSError as error:
        raise ProducerError("MANIFEST_WRITE_FAILED") from error
    return document, digest_bytes(data)


def verify_manifest_string_vectors(contracts_root: Path) -> int:
    """Execute every indexed string vector against this runtime boundary."""
    golden_root = contracts_root / "goldens" / "archive"
    vector_path = golden_root / "vectors" / "manifest-string-semantics.json"
    minimal_path = golden_root / "valid" / "minimal" / "archive-manifest.json"
    try:
        vector = json.loads(vector_path.read_bytes().decode("utf-8", errors="strict"))
        base = json.loads(minimal_path.read_bytes().decode("utf-8", errors="strict"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ProducerError("CONTRACT_INPUT_INVALID") from error
    if not isinstance(vector, dict) or not isinstance(base, dict):
        raise ProducerError("CONTRACT_INPUT_INVALID")
    cases = vector.get("stringCases")
    if not isinstance(cases, list):
        raise ProducerError("CONTRACT_INPUT_INVALID")
    executed = 0
    for item in cases:
        if not isinstance(item, dict):
            raise ProducerError("CONTRACT_INPUT_INVALID")
        field = item.get("field")
        literal = item.get("jsonStringLiteral")
        expected = item.get("expected")
        if (
            not isinstance(field, str)
            or not isinstance(literal, str)
            or not isinstance(expected, str)
        ):
            raise ProducerError("CONTRACT_INPUT_INVALID")
        candidate = dict(base)
        try:
            candidate[field] = json.loads(literal)
            validate_manifest(candidate, contracts_root)
            actual = "VALID"
        except json.JSONDecodeError, ProducerError, UnicodeEncodeError:
            actual = "MANIFEST_SCHEMA_INVALID"
        if actual != expected:
            raise ProducerError("MANIFEST_STRING_VECTOR_FAILED")
        executed += 1

    raw = vector.get("rawByteRecipe")
    if not isinstance(raw, dict) or raw.get("payloadHex") != "C3 28":
        raise ProducerError("CONTRACT_INPUT_INVALID")
    baseline = minimal_path.read_bytes()
    marker = b'"archiveAssetUrl": "'
    start = baseline.find(marker)
    if start < 0:
        raise ProducerError("CONTRACT_INPUT_INVALID")
    start += len(marker)
    end = baseline.find(b'"', start)
    candidate_bytes = baseline[:start] + bytes.fromhex("C3 28") + baseline[end:]
    if classify_manifest_bytes(candidate_bytes, contracts_root) != raw.get("expected"):
        raise ProducerError("MANIFEST_STRING_VECTOR_FAILED")
    return executed + 1
