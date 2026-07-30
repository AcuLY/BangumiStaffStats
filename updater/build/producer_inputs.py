"""Pure admission and verification for immutable producer runtime inputs."""

from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import Any, Never, Protocol, cast

EXPECTED_MANIFEST_DIGEST = "sha256:56adbccc4c83432ae02d9bf985ea1b9281d2836e96e389e84dae97bd8cacac52"
EXPECTED_FILE_COUNT = 42
GIT_REGULAR_MODE = 0o100644
MANIFEST_SOURCE_PATH = "contracts/artifacts/producer-runtime-inputs-v1.json"
MANIFEST_AUTHORITY_SNAPSHOT_PATH = "producer-input-authority/producer-runtime-inputs-v1.json"
MANIFEST_EMBEDDED_PATH = "metadata/producer-runtime-inputs-v1.json"
PRODUCER_METADATA_PATH = "metadata/producer-inputs.json"
DATA_VERSION_VECTOR_PATH = "contracts/goldens/archive/vectors/data-version.json"
CATALOG_SOURCE_PATHS = (
    "updater/config/catalog/display-v1.yaml",
    "updater/config/catalog/staff-sets-v1.yaml",
)
CATALOG_EMBEDDED_PATHS = (
    "catalog/display-v1.yaml",
    "catalog/staff-sets-v1.yaml",
)
NATIVE_PRODUCER_ROOT = "producer"
OCI_PRODUCER_ROOT = "/opt/bgmss/producer"
PRODUCER_INPUTS_LABEL = "org.bangumi-staff-stats.producer-runtime-inputs-manifest-sha256"
CATALOG_CONFIG_LABEL = "org.bangumi-staff-stats.catalog-config-digest"
COMMON_COMMIT_LABEL = "org.bangumi-staff-stats.common-commit"
PRODUCER_LABELS = frozenset(
    {
        PRODUCER_INPUTS_LABEL,
        CATALOG_CONFIG_LABEL,
        COMMON_COMMIT_LABEL,
    }
)

_MAX_JSON_BYTES = 8 * 1024 * 1024
_DIGEST_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
_COMMIT_RE = re.compile(r"^[0-9a-f]{40}$")
_PATH_PART_RE = re.compile(r"^[A-Za-z0-9._-]+$")


class ProducerInputsError(ValueError):
    """Producer runtime authority or embedded evidence is invalid."""


class AttestedBlob(Protocol):
    """Minimal interface supplied by the build checkout attestation."""

    @property
    def path(self) -> str: ...

    @property
    def mode(self) -> int: ...

    @property
    def content(self) -> bytes: ...


@dataclass(frozen=True)
class ManifestRecord:
    path: str
    size: int
    sha256: str


@dataclass(frozen=True)
class RuntimeManifest:
    file_count: int
    total_size: int
    files: tuple[ManifestRecord, ...]
    file_set_digest: str


@dataclass(frozen=True)
class SelectedFile:
    source_path: str
    embedded_path: str
    content: bytes

    @property
    def sha256(self) -> str:
        return sha256_bytes(self.content)

    @property
    def size(self) -> int:
        return len(self.content)


@dataclass(frozen=True)
class SelectedProducerInputs:
    manifest: RuntimeManifest
    manifest_bytes: bytes
    manifest_digest: str
    contracts: tuple[SelectedFile, ...]
    catalogs: tuple[SelectedFile, ...]
    common_commit: str

    @property
    def embedded_files(self) -> tuple[SelectedFile, ...]:
        return (*self.contracts, *self.catalogs)


@dataclass(frozen=True)
class VerifiedProducerTree:
    metadata: dict[str, Any]
    metadata_digest: str
    manifest: RuntimeManifest
    manifest_digest: str
    catalog_config_digest: str
    common_commit: str
    directories: frozenset[str]


def _fail(message: str) -> Never:
    raise ProducerInputsError(message)


def canonical_json(value: Any) -> bytes:
    try:
        encoded = json.dumps(
            value,
            allow_nan=False,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        )
    except (TypeError, ValueError) as error:
        raise ProducerInputsError(f"value is not canonical JSON: {error}") from error
    return f"{encoded}\n".encode()


def sha256_bytes(value: bytes) -> str:
    return f"sha256:{hashlib.sha256(value).hexdigest()}"


def _strict_pairs(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            _fail(f"JSON contains duplicate key {key!r}")
        result[key] = value
    return result


def _invalid_constant(value: str) -> None:
    _fail(f"JSON contains invalid numeric constant {value}")


def parse_json_bytes(
    source: bytes,
    label: str,
    *,
    require_canonical: bool,
) -> object:
    if not isinstance(source, bytes) or not 0 < len(source) <= _MAX_JSON_BYTES:
        _fail(f"{label} must be bounded bytes")
    try:
        text = source.decode("utf-8", errors="strict")
        value = json.loads(
            text,
            object_pairs_hook=_strict_pairs,
            parse_constant=_invalid_constant,
        )
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ProducerInputsError(f"{label} is not strict JSON: {error}") from error
    if require_canonical and canonical_json(value) != source:
        _fail(f"{label} is not canonical JSON")
    return value


def _object(value: object, label: str) -> dict[str, object]:
    if not isinstance(value, dict) or not all(isinstance(key, str) for key in value):
        _fail(f"{label} must be an object")
    return cast(dict[str, object], value)


def _exact_keys(
    value: object,
    expected: set[str],
    label: str,
) -> dict[str, object]:
    document = _object(value, label)
    if set(document) != expected:
        _fail(f"{label} must contain exactly {', '.join(sorted(expected))}")
    return document


def _integer(value: object, label: str, *, positive: bool = False) -> int:
    minimum = 1 if positive else 0
    if (
        isinstance(value, bool)
        or not isinstance(value, int)
        or value < minimum
        or value > 9_007_199_254_740_991
    ):
        qualifier = "positive" if positive else "nonnegative"
        _fail(f"{label} must be a {qualifier} safe integer")
    return value


def _digest(value: object, label: str) -> str:
    if not isinstance(value, str) or _DIGEST_RE.fullmatch(value) is None:
        _fail(f"{label} must be a sha256:-prefixed lowercase digest")
    return value


def _commit(value: object, label: str) -> str:
    if not isinstance(value, str) or _COMMIT_RE.fullmatch(value) is None:
        _fail(f"{label} must be a lowercase 40-hex Git object name")
    return value


def safe_relative_path(value: object, label: str) -> str:
    if not isinstance(value, str) or len(value) > 1024:
        _fail(f"{label} must be a bounded relative POSIX path")
    try:
        value.encode("ascii")
    except UnicodeEncodeError as error:
        raise ProducerInputsError(f"{label} must contain only ASCII") from error
    parsed = PurePosixPath(value)
    if (
        not value
        or "\\" in value
        or "\0" in value
        or parsed.is_absolute()
        or parsed.as_posix() != value
        or any(
            part in {"", ".", ".."} or _PATH_PART_RE.fullmatch(part) is None
            for part in parsed.parts
        )
    ):
        _fail(f"{label} must be a normalized relative POSIX path")
    return value


def parse_runtime_manifest(source: bytes) -> RuntimeManifest:
    document = _exact_keys(
        parse_json_bytes(
            source,
            "producer runtime inputs manifest",
            require_canonical=True,
        ),
        {"schemaVersion", "fileCount", "totalSize", "files", "fileSetDigest"},
        "producer runtime inputs manifest",
    )
    if document["schemaVersion"] != 1:
        _fail("producer runtime inputs manifest schemaVersion must equal 1")
    file_count = _integer(
        document["fileCount"],
        "producer runtime inputs manifest fileCount",
        positive=True,
    )
    if file_count != EXPECTED_FILE_COUNT:
        _fail(f"producer runtime inputs manifest fileCount must equal {EXPECTED_FILE_COUNT}")
    total_size = _integer(
        document["totalSize"],
        "producer runtime inputs manifest totalSize",
        positive=True,
    )
    file_set_digest = _digest(
        document["fileSetDigest"],
        "producer runtime inputs manifest fileSetDigest",
    )
    raw_files = document["files"]
    if not isinstance(raw_files, list) or len(raw_files) != EXPECTED_FILE_COUNT:
        _fail(f"producer runtime inputs manifest files must contain {EXPECTED_FILE_COUNT} records")
    files: list[ManifestRecord] = []
    previous: bytes | None = None
    seen: set[str] = set()
    for index, raw_record in enumerate(raw_files):
        label = f"producer runtime inputs manifest files[{index}]"
        record = _exact_keys(raw_record, {"path", "size", "sha256"}, label)
        record_path = safe_relative_path(record["path"], f"{label}.path")
        if not record_path.startswith("contracts/"):
            _fail(f"{label}.path must remain below contracts")
        encoded_path = record_path.encode("ascii")
        if record_path in seen:
            _fail(f"producer runtime inputs manifest contains duplicate path {record_path}")
        if previous is not None and previous >= encoded_path:
            _fail("producer runtime inputs manifest files must be bytewise sorted")
        seen.add(record_path)
        previous = encoded_path
        files.append(
            ManifestRecord(
                path=record_path,
                size=_integer(record["size"], f"{label}.size"),
                sha256=_digest(record["sha256"], f"{label}.sha256"),
            )
        )
    expected_file_set = sha256_bytes(canonical_json(raw_files))
    if file_set_digest != expected_file_set:
        _fail(f"producer runtime inputs manifest fileSetDigest must equal {expected_file_set}")
    expected_total = sum(record.size for record in files)
    if total_size != expected_total:
        _fail(f"producer runtime inputs manifest totalSize must equal {expected_total}")
    return RuntimeManifest(
        file_count=file_count,
        total_size=total_size,
        files=tuple(files),
        file_set_digest=file_set_digest,
    )


def _blob_inventory(blobs: Sequence[AttestedBlob]) -> dict[str, AttestedBlob]:
    result: dict[str, AttestedBlob] = {}
    for blob in blobs:
        if blob.path in result:
            _fail(f"attested source contains duplicate blob {blob.path}")
        result[blob.path] = blob
    return result


def _required_blob(
    blobs: Mapping[str, AttestedBlob],
    source_path: str,
) -> AttestedBlob:
    try:
        blob = blobs[source_path]
    except KeyError as error:
        raise ProducerInputsError(
            f"attested candidate is missing producer input {source_path}"
        ) from error
    if blob.mode != GIT_REGULAR_MODE:
        _fail(f"producer input Git mode must be 100644: {source_path}")
    if not isinstance(blob.content, bytes):
        _fail(f"producer input bytes are invalid: {source_path}")
    return blob


def _common_commit(vector_bytes: bytes) -> str:
    vector = _object(
        parse_json_bytes(
            vector_bytes,
            DATA_VERSION_VECTOR_PATH,
            require_canonical=False,
        ),
        DATA_VERSION_VECTOR_PATH,
    )
    inputs = _object(vector.get("input"), f"{DATA_VERSION_VECTOR_PATH}.input")
    return _commit(
        inputs.get("commonCommit"),
        f"{DATA_VERSION_VECTOR_PATH}.input.commonCommit",
    )


def select_attested_producer_inputs(
    tracked_blobs: Sequence[AttestedBlob],
) -> SelectedProducerInputs:
    blobs = _blob_inventory(tracked_blobs)
    manifest_blob = _required_blob(blobs, MANIFEST_SOURCE_PATH)
    manifest_digest = sha256_bytes(manifest_blob.content)
    if manifest_digest != EXPECTED_MANIFEST_DIGEST:
        _fail(f"producer runtime inputs manifest digest must equal {EXPECTED_MANIFEST_DIGEST}")
    manifest = parse_runtime_manifest(manifest_blob.content)
    contracts: list[SelectedFile] = []
    for record in manifest.files:
        blob = _required_blob(blobs, record.path)
        if len(blob.content) != record.size:
            _fail(f"producer input size disagrees with manifest: {record.path}")
        if sha256_bytes(blob.content) != record.sha256:
            _fail(f"producer input digest disagrees with manifest: {record.path}")
        contracts.append(
            SelectedFile(
                source_path=record.path,
                embedded_path=record.path,
                content=blob.content,
            )
        )
    catalogs: list[SelectedFile] = []
    for source_path, embedded_path in zip(
        CATALOG_SOURCE_PATHS,
        CATALOG_EMBEDDED_PATHS,
        strict=True,
    ):
        blob = _required_blob(blobs, source_path)
        if len(blob.content) == 0:
            _fail(f"catalog producer input must not be empty: {source_path}")
        catalogs.append(
            SelectedFile(
                source_path=source_path,
                embedded_path=embedded_path,
                content=blob.content,
            )
        )
    vector = next(
        (
            selected.content
            for selected in contracts
            if selected.embedded_path == DATA_VERSION_VECTOR_PATH
        ),
        None,
    )
    if vector is None:
        _fail(f"producer runtime manifest does not admit {DATA_VERSION_VECTOR_PATH}")
    return SelectedProducerInputs(
        manifest=manifest,
        manifest_bytes=manifest_blob.content,
        manifest_digest=manifest_digest,
        contracts=tuple(contracts),
        catalogs=tuple(catalogs),
        common_commit=_common_commit(vector),
    )


def producer_metadata_document(
    selected: SelectedProducerInputs,
    catalog_config_digest: str,
) -> dict[str, object]:
    configured_digest = _digest(
        catalog_config_digest,
        "catalogConfigDigest",
    )
    return {
        "catalog": {
            "catalogConfigDigest": configured_digest,
            "files": [
                {
                    "path": selected_file.embedded_path,
                    "sha256": selected_file.sha256,
                    "size": selected_file.size,
                }
                for selected_file in selected.catalogs
            ],
            "root": "catalog",
        },
        "commonCommit": selected.common_commit,
        "contracts": {
            "fileCount": selected.manifest.file_count,
            "fileSetDigest": selected.manifest.file_set_digest,
            "manifestPath": MANIFEST_EMBEDDED_PATH,
            "manifestSha256": selected.manifest_digest,
            "root": "contracts",
            "totalSize": selected.manifest.total_size,
        },
        "roots": {
            "native": NATIVE_PRODUCER_ROOT,
            "oci": OCI_PRODUCER_ROOT,
        },
        "schemaVersion": 1,
    }


def producer_metadata_bytes(
    selected: SelectedProducerInputs,
    catalog_config_digest: str,
) -> bytes:
    return canonical_json(producer_metadata_document(selected, catalog_config_digest))


def parse_producer_metadata(source: bytes) -> dict[str, Any]:
    document = _exact_keys(
        parse_json_bytes(
            source,
            "producer input metadata",
            require_canonical=True,
        ),
        {"catalog", "commonCommit", "contracts", "roots", "schemaVersion"},
        "producer input metadata",
    )
    if document["schemaVersion"] != 1:
        _fail("producer input metadata schemaVersion must equal 1")
    _commit(document["commonCommit"], "producer input metadata commonCommit")
    roots = _exact_keys(
        document["roots"],
        {"native", "oci"},
        "producer input metadata roots",
    )
    if roots != {"native": NATIVE_PRODUCER_ROOT, "oci": OCI_PRODUCER_ROOT}:
        _fail("producer input metadata roots must equal the fixed native/OCI roots")
    contracts = _exact_keys(
        document["contracts"],
        {
            "fileCount",
            "fileSetDigest",
            "manifestPath",
            "manifestSha256",
            "root",
            "totalSize",
        },
        "producer input metadata contracts",
    )
    if (
        contracts["root"] != "contracts"
        or contracts["manifestPath"] != MANIFEST_EMBEDDED_PATH
        or contracts["fileCount"] != EXPECTED_FILE_COUNT
    ):
        _fail("producer input metadata contracts paths/count are not fixed")
    _integer(contracts["totalSize"], "producer input metadata contracts totalSize", positive=True)
    _digest(contracts["fileSetDigest"], "producer input metadata contracts fileSetDigest")
    _digest(contracts["manifestSha256"], "producer input metadata contracts manifestSha256")
    catalog = _exact_keys(
        document["catalog"],
        {"catalogConfigDigest", "files", "root"},
        "producer input metadata catalog",
    )
    if catalog["root"] != "catalog":
        _fail("producer input metadata catalog root must equal catalog")
    _digest(
        catalog["catalogConfigDigest"],
        "producer input metadata catalog catalogConfigDigest",
    )
    raw_catalog_files = catalog["files"]
    if not isinstance(raw_catalog_files, list) or len(raw_catalog_files) != 2:
        _fail("producer input metadata catalog files must contain exactly two records")
    actual_paths: list[str] = []
    for index, raw_record in enumerate(raw_catalog_files):
        label = f"producer input metadata catalog files[{index}]"
        record = _exact_keys(raw_record, {"path", "sha256", "size"}, label)
        actual_paths.append(safe_relative_path(record["path"], f"{label}.path"))
        _digest(record["sha256"], f"{label}.sha256")
        _integer(record["size"], f"{label}.size", positive=True)
    if tuple(actual_paths) != CATALOG_EMBEDDED_PATHS:
        _fail("producer input metadata catalog files are not in fixed bytewise order")
    return cast(dict[str, Any], document)


def expected_producer_directories(file_paths: Sequence[str]) -> frozenset[str]:
    directories = {""}
    for relative in file_paths:
        parent = PurePosixPath(relative).parent
        while parent.as_posix() not in {"", "."}:
            directories.add(parent.as_posix())
            parent = parent.parent
    return frozenset(directories)


def verify_producer_tree(files: Mapping[str, bytes]) -> VerifiedProducerTree:
    normalized: dict[str, bytes] = {}
    for path, content in files.items():
        safe = safe_relative_path(path, "embedded producer path")
        if safe in normalized:
            _fail(f"embedded producer tree contains duplicate path {safe}")
        if not isinstance(content, bytes):
            _fail(f"embedded producer file is not bytes: {safe}")
        normalized[safe] = content
    try:
        manifest_bytes = normalized[MANIFEST_EMBEDDED_PATH]
        metadata_bytes = normalized[PRODUCER_METADATA_PATH]
    except KeyError as error:
        raise ProducerInputsError(f"embedded producer tree is missing {error.args[0]}") from error
    manifest_digest = sha256_bytes(manifest_bytes)
    if manifest_digest != EXPECTED_MANIFEST_DIGEST:
        _fail(f"embedded manifest digest must equal {EXPECTED_MANIFEST_DIGEST}")
    manifest = parse_runtime_manifest(manifest_bytes)
    metadata = parse_producer_metadata(metadata_bytes)
    expected_paths = {
        *(record.path for record in manifest.files),
        *CATALOG_EMBEDDED_PATHS,
        MANIFEST_EMBEDDED_PATH,
        PRODUCER_METADATA_PATH,
    }
    if set(normalized) != expected_paths:
        missing = sorted(expected_paths - set(normalized))
        extra = sorted(set(normalized) - expected_paths)
        _fail(
            "embedded producer inventory mismatch: "
            f"missing={missing or 'none'} extra={extra or 'none'}"
        )
    for record in manifest.files:
        content = normalized[record.path]
        if len(content) != record.size or sha256_bytes(content) != record.sha256:
            _fail(f"embedded Contracts bytes disagree with manifest: {record.path}")
    catalog_metadata = cast(dict[str, object], metadata["catalog"])
    for catalog_record in cast(list[dict[str, object]], catalog_metadata["files"]):
        content = normalized[cast(str, catalog_record["path"])]
        if (
            len(content) != catalog_record["size"]
            or sha256_bytes(content) != catalog_record["sha256"]
        ):
            _fail(f"embedded catalog bytes disagree with metadata: {catalog_record['path']}")
    contracts_metadata = cast(dict[str, object], metadata["contracts"])
    if contracts_metadata != {
        "fileCount": manifest.file_count,
        "fileSetDigest": manifest.file_set_digest,
        "manifestPath": MANIFEST_EMBEDDED_PATH,
        "manifestSha256": manifest_digest,
        "root": "contracts",
        "totalSize": manifest.total_size,
    }:
        _fail("embedded Contracts metadata disagrees with its manifest")
    common_commit = _common_commit(normalized[DATA_VERSION_VECTOR_PATH])
    if metadata["commonCommit"] != common_commit:
        _fail("producer input metadata commonCommit disagrees with admitted vector")
    catalog_config_digest = cast(str, catalog_metadata["catalogConfigDigest"])
    return VerifiedProducerTree(
        metadata=metadata,
        metadata_digest=sha256_bytes(metadata_bytes),
        manifest=manifest,
        manifest_digest=manifest_digest,
        catalog_config_digest=catalog_config_digest,
        common_commit=common_commit,
        directories=expected_producer_directories(sorted(expected_paths)),
    )
