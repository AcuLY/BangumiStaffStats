"""Language-neutral component-statement v1 producer helpers.

The Updater imports :func:`emit_component_statement` from this module after
placing ``contracts/artifacts`` on ``sys.path``.  Contracts owns the field
mapping; component builders own the bytes and metadata supplied to it.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Mapping, Sequence
from pathlib import Path, PurePosixPath
from typing import Any

ARCHIVE_MANIFEST_SCHEMA_DIGEST = (
    "sha256:5a2b0cd7294312e9dcbdd413a1b01c4218652c4c39fd7472b74e40622e7a3e73"
)
ARCHIVE_SCHEMA_SQL_DIGEST = (
    "sha256:3cce7ce75fb4a7d2943ee8b9fb7c5df2639fae8fa0a2e07bddb3e1519ffdc8e0"
)
APPLICATION_VERSION = "v0.1.0"
ARCHIVE_DOMAIN_RULES_VERSION = "domain-raw-v1"
ARCHIVE_CAST_RULES_VERSION = "cast-exact-v1"
ARCHIVE_COMPATIBILITY_MATRIX_DIGEST = (
    "sha256:659121caac966df42a6201dcfb539ac1cd0f7f6a4e452495707833f7c8b889ac"
)
BUILDKIT_VERSION = "0.27.1"
DOCKER_BUILDX_VERSION = "0.34.1"
BUILDKIT_IMAGE_REFERENCE = (
    "docker.io/moby/buildkit:v0.27.1@"
    "sha256:1e110c71d389d6d24f67b9438e2f7b8da749a6ff407b22a1631e025c95599368"
)
BUILDKIT_IMAGE_DIGEST = BUILDKIT_IMAGE_REFERENCE.rsplit("@", 1)[1]
PRODUCER_RUNTIME_INPUTS_LOGICAL_PATH = "contracts/producer-runtime-inputs-v1"
GIT_OBJECT_RE = re.compile(r"^(?:[0-9a-f]{40}|[0-9a-f]{64})$")
SHA256_RE = re.compile(r"^(?:sha256:)?([0-9a-f]{64})$")
TOKEN_RE = re.compile(r"^[a-z0-9][a-z0-9._-]*$")


class StatementError(ValueError):
    """Raised when producer metadata cannot form a closed v1 statement."""


def _canonical_json(value: Any) -> bytes:
    try:
        encoded = json.dumps(
            value,
            allow_nan=False,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        )
    except (TypeError, ValueError) as error:
        raise StatementError(f"value is not canonical JSON: {error}") from error
    return f"{encoded}\n".encode()


def _sha256_bytes(value: bytes) -> str:
    return f"sha256:{hashlib.sha256(value).hexdigest()}"


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return f"sha256:{digest.hexdigest()}"


def _digest(value: Any, label: str) -> str:
    match = SHA256_RE.fullmatch(str(value))
    if match is None:
        raise StatementError(f"{label} must be a lowercase SHA-256 digest")
    return f"sha256:{match.group(1)}"


def _safe_path(value: Any, label: str) -> str:
    text = str(value)
    if "\\" in text or "\0" in text:
        raise StatementError(f"{label} must be a normalized relative POSIX path")
    parsed = PurePosixPath(text)
    if (
        not text
        or parsed.is_absolute()
        or parsed.as_posix() != text
        or any(
            part in {"", ".", ".."} or re.fullmatch(r"[A-Za-z0-9._-]+", part) is None
            for part in parsed.parts
        )
    ):
        raise StatementError(f"{label} must be a safe relative path")
    return text


def _contracts_digest(contracts_root: Path, relative: str, expected: str) -> str:
    candidate = contracts_root.joinpath(*PurePosixPath(relative).parts)
    if candidate.is_symlink() or not candidate.is_file():
        raise StatementError(f"required Contracts input is missing: {relative}")
    actual = _sha256_file(candidate)
    if actual != expected:
        raise StatementError(
            f"Contracts input drift for {relative}: expected {expected}, got {actual}"
        )
    return actual


def _release_authorities(contracts_root: Path) -> tuple[str, str, str, str]:
    version_path = contracts_root.parent / "VERSION"
    if version_path.is_symlink() or not version_path.is_file():
        raise StatementError("root VERSION authority is missing")
    if version_path.read_bytes() != f"{APPLICATION_VERSION}\n".encode():
        raise StatementError(
            f"root VERSION must contain exactly {APPLICATION_VERSION} plus LF"
        )

    matrix_relative = "schemas/archive/compatibility-matrix.json"
    matrix_path = contracts_root.joinpath(*PurePosixPath(matrix_relative).parts)
    matrix_digest = _contracts_digest(
        contracts_root,
        matrix_relative,
        ARCHIVE_COMPATIBILITY_MATRIX_DIGEST,
    )
    try:
        matrix = json.loads(matrix_path.read_bytes())
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise StatementError(
            f"Archive compatibility matrix is invalid: {error}"
        ) from error
    supported = matrix.get("supported") if isinstance(matrix, Mapping) else None
    if (
        not isinstance(supported, list)
        or len(supported) != 1
        or not isinstance(supported[0], Mapping)
        or supported[0].get("domainRulesVersion") != ARCHIVE_DOMAIN_RULES_VERSION
        or supported[0].get("castRulesVersion") != ARCHIVE_CAST_RULES_VERSION
    ):
        raise StatementError(
            "Archive compatibility matrix must declare the exact supported "
            "domain/cast rule pair"
        )
    return (
        APPLICATION_VERSION,
        ARCHIVE_DOMAIN_RULES_VERSION,
        ARCHIVE_CAST_RULES_VERSION,
        matrix_digest,
    )


def _artifact_inventory(
    artifacts: Sequence[Mapping[str, Any]],
) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for index, artifact in enumerate(artifacts):
        try:
            size = artifact["size"]
            item = {
                "path": _safe_path(artifact["path"], f"artifacts[{index}].path"),
                "size": size,
                "sha256": _digest(artifact["sha256"], f"artifacts[{index}].sha256"),
            }
        except KeyError as error:
            raise StatementError(
                f"artifacts[{index}] is missing {error.args[0]}"
            ) from error
        if isinstance(size, bool) or not isinstance(size, int) or size < 0:
            raise StatementError(f"artifacts[{index}].size must be an integer >= 0")
        result.append(item)
    result.sort(key=lambda item: item["path"])
    paths = [item["path"] for item in result]
    if not result or len(paths) != len(set(paths)):
        raise StatementError("artifacts must be non-empty with unique paths")
    return result


def _require_mapping(value: Any, label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise StatementError(f"{label} must be an object")
    return value


def _metadata_digest(value: Any, label: str) -> str:
    return _digest(value, label)


def emit_component_statement(
    *,
    artifacts: Sequence[Mapping[str, Any]],
    checksum_path: str,
    checksum_sha256: str,
    checksum_size: int,
    contracts_root: Path,
    metadata: Mapping[str, Any],
    sbom_path: str,
    sbom_sha256: str,
    sbom_size: int,
    source_revision: str,
    source_tree: str,
    target_architecture: str,
    target_os: str,
) -> dict[str, Any]:
    """Map reviewed Updater build metadata to component-statement v1.

    Digest arguments may be raw lowercase hex or ``sha256:`` prefixed.  The
    returned object is ready for the producer's canonical JSON encoder.
    """

    contracts_root = Path(contracts_root)
    metadata = _require_mapping(metadata, "metadata")
    if metadata.get("component") != "updater":
        raise StatementError("metadata.component must equal updater")
    if not GIT_OBJECT_RE.fullmatch(source_revision):
        raise StatementError("source_revision must be a lowercase Git object ID")
    if not GIT_OBJECT_RE.fullmatch(source_tree):
        raise StatementError("source_tree must be a lowercase Git object ID")
    if (
        TOKEN_RE.fullmatch(target_os) is None
        or TOKEN_RE.fullmatch(target_architecture) is None
    ):
        raise StatementError("target platform must use normalized lowercase tokens")
    if (
        isinstance(checksum_size, bool)
        or not isinstance(checksum_size, int)
        or checksum_size < 1
        or isinstance(sbom_size, bool)
        or not isinstance(sbom_size, int)
        or sbom_size < 1
    ):
        raise StatementError("evidence sizes must be positive integers")

    inventory = _artifact_inventory(artifacts)
    toolchain = _require_mapping(metadata.get("toolchain"), "metadata.toolchain")
    inputs = _require_mapping(metadata.get("inputs"), "metadata.inputs")
    runtime_packages = metadata.get("runtimePackages")
    if not isinstance(runtime_packages, Sequence) or isinstance(
        runtime_packages, (str, bytes)
    ):
        raise StatementError("metadata.runtimePackages must be an array")
    if len(runtime_packages) < 2:
        raise StatementError(
            "Updater SBOM metadata must include the application and runtime closure"
        )
    package_count = metadata.get("sbomPackageCount")
    expected_package_count = len(inventory) + len(runtime_packages) - 1
    if (
        isinstance(package_count, bool)
        or not isinstance(package_count, int)
        or package_count != expected_package_count
    ):
        raise StatementError(
            "metadata.sbomPackageCount must equal one package per artifact plus "
            "the non-application runtime closure"
        )

    python_version = str(toolchain.get("python", ""))
    uv_version = str(toolchain.get("uv", ""))
    if not python_version or not uv_version:
        raise StatementError("Updater toolchain must declare python and uv versions")
    if toolchain.get("buildkit") != BUILDKIT_VERSION:
        raise StatementError(
            f"Updater toolchain buildkit must equal {BUILDKIT_VERSION}"
        )
    if toolchain.get("dockerBuildx") != DOCKER_BUILDX_VERSION:
        raise StatementError(
            f"Updater toolchain dockerBuildx must equal {DOCKER_BUILDX_VERSION}"
        )
    if toolchain.get("buildkitImage") != BUILDKIT_IMAGE_REFERENCE:
        raise StatementError(
            "Updater toolchain buildkitImage must equal the accepted digest-pinned image"
        )
    base_images = [
        {"reference": str(toolchain.get("pythonBaseImage", ""))},
        {"reference": str(toolchain.get("uvBaseImage", ""))},
    ]
    for image in base_images:
        if (
            re.fullmatch(r"[A-Za-z0-9._/:+-]+@sha256:[0-9a-f]{64}", image["reference"])
            is None
        ):
            raise StatementError("Updater base images must be digest-pinned references")
    base_images.sort(key=lambda item: item["reference"])

    build_definition = _metadata_digest(
        metadata.get("buildDefinitionSha256"), "metadata.buildDefinitionSha256"
    )
    source_snapshot = _metadata_digest(
        inputs.get("sourceSnapshotSha256"), "metadata.inputs.sourceSnapshotSha256"
    )
    uv_lock = _metadata_digest(
        inputs.get("uvLockSha256"), "metadata.inputs.uvLockSha256"
    )
    producer_runtime_inputs_manifest = _metadata_digest(
        inputs.get("producerRuntimeInputsManifestSha256"),
        "metadata.inputs.producerRuntimeInputsManifestSha256",
    )
    normalized_inputs = sorted(
        [
            {
                "path": PRODUCER_RUNTIME_INPUTS_LOGICAL_PATH,
                "sha256": producer_runtime_inputs_manifest,
            },
            {"path": "updater/build-definition", "sha256": build_definition},
            {"path": "updater/source-snapshot", "sha256": source_snapshot},
            {"path": "updater/uv.lock", "sha256": uv_lock},
            {
                "path": "toolchain/buildkit-image",
                "sha256": BUILDKIT_IMAGE_DIGEST,
            },
        ],
        key=lambda item: item["path"],
    )

    metadata_artifacts = _require_mapping(
        metadata.get("artifacts"), "metadata.artifacts"
    )
    bundle = _require_mapping(
        metadata_artifacts.get("bundle"), "metadata.artifacts.bundle"
    )
    namespace_digest = _digest(
        bundle.get("sha256"), "metadata.artifacts.bundle.sha256"
    ).removeprefix("sha256:")
    namespace = (
        f"https://spdx.bangumi-staff-stats.invalid/updater/sha256-{namespace_digest}"
    )

    _contracts_digest(
        contracts_root,
        "schemas/archive/archive-manifest.schema.json",
        ARCHIVE_MANIFEST_SCHEMA_DIGEST,
    )
    _contracts_digest(
        contracts_root,
        "schemas/archive/schema.sql",
        ARCHIVE_SCHEMA_SQL_DIGEST,
    )
    _contracts_digest(
        contracts_root,
        "artifacts/producer-runtime-inputs-v1.json",
        producer_runtime_inputs_manifest,
    )
    (
        application_version,
        domain_rules_version,
        cast_rules_version,
        compatibility_matrix_digest,
    ) = _release_authorities(contracts_root)

    return {
        "schemaVersion": 1,
        "applicationVersion": application_version,
        "component": "updater",
        "source": {"revision": source_revision, "tree": source_tree},
        "target": {
            "os": target_os,
            "architecture": target_architecture,
        },
        "toolchain": [
            {"name": "buildkit", "version": BUILDKIT_VERSION},
            {"name": "docker-buildx", "version": DOCKER_BUILDX_VERSION},
            {"name": "python", "version": python_version},
            {"name": "uv", "version": uv_version},
        ],
        "baseImages": base_images,
        "inputs": normalized_inputs,
        "compatibility": {
            "archive": {
                "manifestSchemaVersion": {"minimum": 1, "maximum": 1},
                "sqliteSchemaVersion": {"minimum": 1, "maximum": 1},
                "manifestSchemaDigest": ARCHIVE_MANIFEST_SCHEMA_DIGEST,
                "schemaSqlDigest": ARCHIVE_SCHEMA_SQL_DIGEST,
                "domainRulesVersion": domain_rules_version,
                "castRulesVersion": cast_rules_version,
                "compatibilityMatrixDigest": compatibility_matrix_digest,
            },
            "openapiDigest": None,
        },
        "artifacts": inventory,
        "artifactSetDigest": _sha256_bytes(_canonical_json(inventory)),
        "checksumInventory": {
            "path": _safe_path(checksum_path, "checksum_path"),
            "size": checksum_size,
            "sha256": _digest(checksum_sha256, "checksum_sha256"),
        },
        "sbom": {
            "path": _safe_path(sbom_path, "sbom_path"),
            "size": sbom_size,
            "sha256": _digest(sbom_sha256, "sbom_sha256"),
            "documentNamespace": namespace,
            "packageCount": package_count,
        },
    }


__all__ = ["StatementError", "emit_component_statement"]
