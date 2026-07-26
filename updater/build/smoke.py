#!/usr/bin/env python3
"""Source-free, non-root smoke for the built Updater OCI artifact."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import re
import secrets
import stat
import subprocess
import sys
from collections.abc import Callable, Iterator, Mapping, MutableMapping, Sequence
from contextlib import contextmanager
from pathlib import Path, PurePosixPath
from types import ModuleType
from typing import TYPE_CHECKING


def _load_sibling_control_plane(module_name: str, filename: str) -> ModuleType:
    """Load one reviewed sibling without adding its directory to ``sys.path``."""
    helper = Path(__file__).resolve(strict=True)
    candidate = helper.parent / filename
    information = candidate.lstat()
    if stat.S_ISLNK(information.st_mode) or not stat.S_ISREG(information.st_mode):
        raise RuntimeError(f"control-plane sibling must be a regular non-symlink: {filename}")
    resolved = candidate.resolve(strict=True)
    if resolved.parent != helper.parent or resolved != candidate:
        raise RuntimeError(f"control-plane sibling escaped the helper directory: {filename}")
    specification = importlib.util.spec_from_file_location(module_name, resolved)
    if specification is None or specification.loader is None:
        raise RuntimeError(f"control-plane sibling cannot be loaded: {filename}")
    module = importlib.util.module_from_spec(specification)
    sys.modules[module_name] = module
    try:
        specification.loader.exec_module(module)
    except BaseException:
        sys.modules.pop(module_name, None)
        raise
    return module


def _load_artifact_control_plane() -> ModuleType:
    existing = sys.modules.get("artifact")
    if isinstance(existing, ModuleType):
        source = getattr(existing, "__file__", None)
        if source is not None:
            expected = Path(__file__).resolve(strict=True).with_name("artifact.py")
            if Path(source).resolve(strict=True) == expected:
                return existing
    previous_modules = {
        name: sys.modules.get(name) for name in ("producer_inputs", "runtime_prune")
    }
    _load_sibling_control_plane("producer_inputs", "producer_inputs.py")
    _load_sibling_control_plane("runtime_prune", "runtime_prune.py")
    try:
        return _load_sibling_control_plane("artifact", "artifact.py")
    finally:
        for name, previous in previous_modules.items():
            if previous is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = previous


if TYPE_CHECKING:
    import artifact
else:
    artifact = _load_artifact_control_plane()

CONTAINER_TMPFS = "/tmp:rw,noexec,nosuid,size=8m"  # noqa: S108
SMOKE_OWNER_LABEL = "org.bangumi-staff-stats.smoke-owner"
_OWNER_TOKEN_RE = re.compile(r"^[0-9a-f]{32}$")
_CONTAINER_ID_RE = re.compile(r"^[0-9a-f]{64}$")
_IMAGE_ID_RE = re.compile(r"^sha256:[0-9a-f]{64}$")


def _run_docker(
    docker: Path,
    arguments: Sequence[str],
    *,
    capture: bool = True,
    check: bool = True,
    timeout_seconds: int = 120,
) -> subprocess.CompletedProcess[str]:
    command = [str(docker), *arguments]
    sys.stdout.write(f"+ {' '.join(command)}\n")
    sys.stdout.flush()
    try:
        completed = subprocess.run(  # noqa: S603
            command,
            check=False,
            cwd=artifact.REPOSITORY_ROOT,
            stdout=subprocess.PIPE if capture else None,
            stderr=subprocess.PIPE if capture else None,
            text=True,
            timeout=timeout_seconds,
        )
    except subprocess.TimeoutExpired as error:
        raise artifact.BuildError(
            f"Docker command exceeded {timeout_seconds} seconds: {' '.join(command)}"
        ) from error
    if check and completed.returncode != 0:
        raise artifact.BuildError(
            f"Docker command failed ({completed.returncode}): {' '.join(command)}\n"
            f"stdout:\n{completed.stdout}\nstderr:\n{completed.stderr}"
        )
    return completed


def _protected_contract_digest(contracts_root: Path) -> str:
    digest_input = artifact.TMP_ROOT / "smoke-contract-digest"
    artifact._clear_generated_directory(digest_input)
    for name in ("goldens", "openapi", "schemas"):
        source = contracts_root / name
        if not source.is_dir():
            raise artifact.BuildError(f"missing Contracts input: {source}")
        target = digest_input / name
        artifact._ensure_generated_directory(target)
        for relative, path in artifact._iter_regular_files(source):
            output = target.joinpath(*PurePosixPath(relative).parts)
            artifact._copy_generated_file(path, output)
    value = artifact.tree_digest(digest_input)
    artifact._remove_generated_directory(digest_input)
    return value


def _read_build_metadata(output: Path) -> dict[str, object]:
    path = output / "artifacts" / "build-metadata.json"
    try:
        value, _evidence = artifact._producer_evidence(path.read_bytes())
    except (OSError, artifact.BuildError) as error:
        raise artifact.BuildError(f"invalid build metadata: {error}") from error
    return value


def _producer_manifest_digest(metadata: dict[str, object]) -> str:
    inputs = metadata.get("inputs")
    if not isinstance(inputs, dict):
        raise artifact.BuildError("build metadata has no producer manifest input")
    value = inputs.get("producerRuntimeInputsManifestSha256")
    if not isinstance(value, str) or re.fullmatch(r"sha256:[0-9a-f]{64}", value) is None:
        raise artifact.BuildError("build metadata producer manifest input is invalid")
    return value


def _validated_artifact_image_ids(
    image_ids: Sequence[str],
) -> tuple[str, str]:
    values = tuple(image_ids)
    if (
        len(values) != 2
        or any(
            not isinstance(value, str) or _IMAGE_ID_RE.fullmatch(value) is None for value in values
        )
        or values[0] == values[1]
    ):
        raise artifact.BuildError(
            "artifact image identity must be one distinct config/manifest digest pair"
        )
    return values[0], values[1]


def _image_information(
    metadata: dict[str, object],
) -> tuple[str, Path, tuple[str, str]]:
    try:
        artifacts = metadata["artifacts"]
        if not isinstance(artifacts, dict):
            raise TypeError
        image = artifacts["image"]
        if not isinstance(image, dict):
            raise TypeError
        oci = image["oci"]
        if not isinstance(oci, dict):
            raise TypeError
        reference = oci["reference"]
        config = oci["config"]
        if not isinstance(config, dict):
            raise TypeError
        manifest = oci["manifest"]
        if not isinstance(manifest, dict):
            raise TypeError
        config_id = config["digest"]
        manifest_id = manifest["digest"]
        path = image["path"]
        if (
            not isinstance(reference, str)
            or not isinstance(path, str)
            or not isinstance(config_id, str)
            or not isinstance(manifest_id, str)
        ):
            raise TypeError
    except (KeyError, TypeError) as error:
        raise artifact.BuildError("build metadata has no complete OCI image description") from error
    relative = artifact._safe_relative(path)
    return (
        reference,
        Path(*relative.parts),
        _validated_artifact_image_ids((config_id, manifest_id)),
    )


def _runtime_package_information(
    metadata: dict[str, object],
) -> list[dict[str, str]]:
    value = metadata.get("runtimePackages")
    if not isinstance(value, list):
        raise artifact.BuildError("build metadata has no runtime package closure")
    result: list[dict[str, str]] = []
    for item in value:
        if not isinstance(item, dict) or set(item) != {"name", "version"}:
            raise artifact.BuildError("build metadata has a malformed runtime package")
        name = item["name"]
        version = item["version"]
        if (
            not isinstance(name, str)
            or re.fullmatch(r"[a-z0-9][a-z0-9.-]*", name) is None
            or not isinstance(version, str)
            or not version
        ):
            raise artifact.BuildError("build metadata has a malformed runtime package")
        result.append({"name": name, "version": version})
    if (
        len(result) < 2
        or result != sorted(result, key=lambda item: (item["name"], item["version"]))
        or len({item["name"] for item in result}) != len(result)
    ):
        raise artifact.BuildError("build metadata runtime package closure is incomplete")
    return result


def _container_name(image: str, purpose: str) -> str:
    digest = hashlib.sha256(image.encode()).hexdigest()[:12]
    return f"bgmss-updater-smoke-{digest}-{purpose}"


def _new_owner_token() -> str:
    return secrets.token_hex(16)


def _validated_owner_token(value: str) -> str:
    if _OWNER_TOKEN_RE.fullmatch(value) is None:
        raise artifact.BuildError("smoke owner token must be 32 lowercase hex characters")
    return value


def _container_create_arguments(
    image: str,
    container_name: str,
    owner_token: str,
    *,
    entrypoint: str | None = None,
) -> list[str]:
    token = _validated_owner_token(owner_token)
    arguments = [
        "container",
        "create",
        "--name",
        container_name,
        "--label",
        f"{SMOKE_OWNER_LABEL}={token}",
        "--pull",
        "never",
        "--network",
        "none",
        "--read-only",
        "--security-opt",
        "no-new-privileges",
        "--tmpfs",
        CONTAINER_TMPFS,
        "--user",
        "65532:65532",
    ]
    if entrypoint is not None:
        arguments.extend(("--entrypoint", entrypoint))
    arguments.append(image)
    return arguments


def _common_create_arguments(
    image: str,
    container_name: str,
    owner_token: str,
) -> list[str]:
    return _container_create_arguments(image, container_name, owner_token)


def _run_container(
    docker: Path,
    *,
    image: str,
    container_name: str,
    owner_token: str,
    owned_container_ids: MutableMapping[str, str],
    command: Sequence[str],
    entrypoint: str | None = None,
    timeout_seconds: int = 120,
) -> subprocess.CompletedProcess[str]:
    created = _run_docker(
        docker,
        [
            *_container_create_arguments(
                image,
                container_name,
                owner_token,
                entrypoint=entrypoint,
            ),
            *command,
        ],
    )
    container_id = created.stdout.strip()
    if _CONTAINER_ID_RE.fullmatch(container_id) is None:
        raise artifact.BuildError(
            f"Docker create did not return one immutable container ID: {container_name}"
        )
    if container_name in owned_container_ids:
        raise artifact.BuildError(f"smoke container was created more than once: {container_name}")
    owned_container_ids[container_name] = container_id
    return _run_docker(
        docker,
        ["container", "start", "--attach", container_id],
        timeout_seconds=timeout_seconds,
    )


def _docker_resource_missing(
    completed: subprocess.CompletedProcess[str],
    resource: str,
) -> bool:
    if completed.returncode == 0:
        return False
    detail = f"{completed.stdout or ''}\n{completed.stderr or ''}".lower()
    return any(
        marker in detail
        for marker in (
            f"no such {resource}",
            "no such object",
        )
    )


def _require_container_names_available(
    docker: Path,
    container_names: Sequence[str],
) -> None:
    for container_name in container_names:
        inspected = _run_docker(
            docker,
            ["container", "inspect", container_name],
            check=False,
        )
        if inspected.returncode == 0:
            raise artifact.BuildError(f"refusing pre-existing smoke container: {container_name}")
        if not _docker_resource_missing(inspected, "container"):
            raise artifact.BuildError(
                f"cannot prove smoke container name is unused: {container_name}"
            )


def _cleanup_container(
    docker: Path,
    container_name: str,
    owner_token: str,
    expected_container_id: str | None,
) -> str | None:
    token = _validated_owner_token(owner_token)
    if (
        expected_container_id is not None
        and _CONTAINER_ID_RE.fullmatch(expected_container_id) is None
    ):
        return f"smoke container immutable ID is malformed: {container_name}"
    inspect_target = expected_container_id or container_name
    inspected = _run_docker(
        docker,
        ["container", "inspect", inspect_target],
        check=False,
    )
    if inspected.returncode != 0:
        if _docker_resource_missing(inspected, "container"):
            return None
        return f"cannot inspect smoke container during cleanup: {container_name}"
    try:
        document = json.loads(inspected.stdout)
        if not isinstance(document, list) or len(document) != 1:
            raise TypeError
        value = document[0]
        if not isinstance(value, dict):
            raise TypeError
        container_id = value["Id"]
        current_name = value["Name"]
        config = value["Config"]
        if not isinstance(container_id, str) or _CONTAINER_ID_RE.fullmatch(container_id) is None:
            raise TypeError
        if not isinstance(current_name, str):
            raise TypeError
        if not isinstance(config, dict):
            raise TypeError
        labels = config.get("Labels")
        if not isinstance(labels, dict):
            raise TypeError
        current_owner = labels.get(SMOKE_OWNER_LABEL)
    except KeyError, TypeError, json.JSONDecodeError:
        return f"smoke container ownership inspection is malformed: {container_name}"
    if (
        expected_container_id is None
        or container_id != expected_container_id
        or current_name != f"/{container_name}"
        or current_owner != token
    ):
        return f"refusing to remove foreign smoke container: {container_name}"
    removed = _run_docker(
        docker,
        ["container", "rm", "--force", container_id],
        check=False,
    )
    if removed.returncode != 0 and not _docker_resource_missing(removed, "container"):
        return f"cannot remove owned smoke container: {container_name}"
    return None


def _capture_loaded_image_id(
    docker: Path,
    image_reference: str,
    artifact_image_ids: Sequence[str],
) -> str:
    expected_image_ids = _validated_artifact_image_ids(artifact_image_ids)
    inspected = _run_docker(docker, ["image", "inspect", image_reference])
    try:
        document = json.loads(inspected.stdout)
        if not isinstance(document, list) or len(document) != 1:
            raise TypeError
        value = document[0]
        if not isinstance(value, dict):
            raise TypeError
        image_id = value["Id"]
        if not isinstance(image_id, str) or _IMAGE_ID_RE.fullmatch(image_id) is None:
            raise TypeError
    except (KeyError, TypeError, json.JSONDecodeError) as error:
        raise artifact.BuildError(
            "loaded image inspection did not return one immutable image ID"
        ) from error
    if image_id not in expected_image_ids:
        raise artifact.BuildError(
            "loaded image tag does not resolve to an artifact-bound immutable ID"
        )
    return image_id


def _cleanup_loaded_image(
    docker: Path,
    image_reference: str,
    artifact_image_ids: Sequence[str],
    *,
    captured_image_id: str | None,
    missing_reference_is_clean: bool = False,
) -> str | None:
    try:
        expected_image_ids = _validated_artifact_image_ids(artifact_image_ids)
    except artifact.BuildError:
        return "artifact image identity pair is malformed"
    if captured_image_id is not None and captured_image_id not in expected_image_ids:
        return "captured loaded smoke image ID is not artifact-bound"
    inspected = _run_docker(
        docker,
        ["image", "inspect", image_reference],
        check=False,
    )
    if inspected.returncode != 0:
        if missing_reference_is_clean and _docker_resource_missing(inspected, "image"):
            return None
        return f"cannot prove loaded smoke image tag ownership: {image_reference}"
    try:
        document = json.loads(inspected.stdout)
        if not isinstance(document, list) or len(document) != 1:
            raise TypeError
        value = document[0]
        if not isinstance(value, dict):
            raise TypeError
        current_image_id = value["Id"]
        if (
            not isinstance(current_image_id, str)
            or _IMAGE_ID_RE.fullmatch(current_image_id) is None
        ):
            raise TypeError
    except KeyError, TypeError, json.JSONDecodeError:
        return f"loaded smoke image ownership inspection is malformed: {image_reference}"
    if current_image_id not in expected_image_ids:
        return f"refusing to remove non-artifact smoke image tag: {image_reference}"
    if captured_image_id is not None and current_image_id != captured_image_id:
        return f"refusing to remove replacement smoke image tag: {image_reference}"
    removal_image_id = captured_image_id or current_image_id
    removed = _run_docker(
        docker,
        ["image", "rm", removal_image_id],
        check=False,
    )
    if removed.returncode != 0 and not _docker_resource_missing(removed, "image"):
        return f"cannot remove loaded smoke image by immutable ID: {image_reference}"
    return None


def _cleanup_smoke_resources(
    *,
    docker: Path,
    containers: Mapping[str, str | None],
    owner_token: str,
    image_reference: str,
    artifact_image_ids: Sequence[str],
    image_load_attempted: bool,
    image_load_completed: bool,
    loaded_image_id: str | None,
) -> list[str]:
    failures: list[str] = []
    for container_name, container_id in containers.items():
        failure = _cleanup_container(
            docker,
            container_name,
            owner_token,
            container_id,
        )
        if failure is not None:
            failures.append(failure)
    if loaded_image_id is not None:
        failure = _cleanup_loaded_image(
            docker,
            image_reference,
            artifact_image_ids,
            captured_image_id=loaded_image_id,
        )
        if failure is not None:
            failures.append(failure)
    elif image_load_attempted:
        failure = _cleanup_loaded_image(
            docker,
            image_reference,
            artifact_image_ids,
            captured_image_id=None,
            missing_reference_is_clean=not image_load_completed,
        )
        if failure is not None:
            failures.append(failure)
    return failures


def _invoke_cleanup(cleanup: Callable[[], Sequence[str]]) -> list[str]:
    try:
        return list(cleanup())
    except BaseException as error:
        return [f"smoke cleanup routine failed: {type(error).__name__}: {error}"]


def _record_cleanup_failures(
    failures: Sequence[str],
    primary: BaseException,
) -> None:
    if not failures:
        return
    message = f"smoke cleanup failure: {'; '.join(failures)}"
    primary.add_note(message)
    sys.stderr.write(f"{message}\n")


@contextmanager
def _cleanup_guard(
    cleanup: Callable[[], Sequence[str]],
) -> Iterator[None]:
    try:
        yield
    except BaseException as primary:
        _record_cleanup_failures(_invoke_cleanup(cleanup), primary)
        raise
    failures = _invoke_cleanup(cleanup)
    if failures:
        raise artifact.BuildError(f"smoke cleanup failure: {'; '.join(failures)}")


def _inspect_runtime(
    docker: Path,
    image_id: str,
    target: artifact.Target,
    expected_packages: list[dict[str, str]],
    expected_manifest_digest: str,
    owner_token: str,
    owned_container_ids: MutableMapping[str, str],
    filesystem_container: str,
    package_container: str,
) -> dict[str, str]:
    inspected = _run_docker(docker, ["image", "inspect", image_id])
    try:
        document = json.loads(inspected.stdout)
        value = document[0]
        config = value["Config"]
    except (IndexError, KeyError, TypeError, json.JSONDecodeError) as error:
        raise artifact.BuildError(f"invalid docker image inspection result: {error}") from error
    if value.get("Id") != image_id:
        raise artifact.BuildError("runtime image inspection changed immutable image identity")
    if config.get("User") != "65532:65532":
        raise artifact.BuildError("runtime image is not configured for the reviewed non-root user")
    if config.get("Entrypoint") != [
        "/usr/local/bin/python",
        "-m",
        "bangumi_staff_stats_updater",
    ]:
        raise artifact.BuildError("runtime image does not have the finite Updater entrypoint")
    if value.get("Os") != target.os or value.get("Architecture") != target.architecture:
        raise artifact.BuildError("runtime image target platform disagrees with its statement")
    labels_value = config.get("Labels")
    if not isinstance(labels_value, dict) or not all(
        isinstance(key, str) and isinstance(label_value, str)
        for key, label_value in labels_value.items()
    ):
        raise artifact.BuildError("runtime image labels are malformed")
    labels = {
        key: label_value
        for key, label_value in labels_value.items()
        if key.startswith("org.bangumi-staff-stats.")
    }
    if set(labels) != artifact.PRODUCER_LABELS:
        raise artifact.BuildError("runtime image producer label set is not exact")
    if (
        labels[artifact.PRODUCER_RUNTIME_INPUTS_LABEL] != expected_manifest_digest
        or re.fullmatch(
            r"sha256:[0-9a-f]{64}",
            labels[artifact.PRODUCER_CATALOG_CONFIG_LABEL],
        )
        is None
        or re.fullmatch(
            r"[0-9a-f]{40}",
            labels[artifact.PRODUCER_COMMON_COMMIT_LABEL],
        )
        is None
    ):
        raise artifact.BuildError("runtime image producer labels are invalid")
    filesystem_check = (
        'test "$(id -u)" = 65532; '
        "test ! -e /build; test ! -e /src; test ! -e /app; "
        "test ! -e /workspace; "
        "! find /opt/runtime -type d \\( -name test -o -name tests "
        "-o -name benchmark -o -name benchmarks \\) | grep -q .; "
        "! find /opt/runtime -type f \\( -name 'test_*.py' "
        "-o -name '*_test.py' \\) | grep -q .; "
        "! find /opt/runtime -name pyproject.toml -o -name uv.lock | grep -q .; "
        "! find /opt/runtime -type f -name uv_cache.json | grep -q .; "
        "test ! -e /opt/runtime/hatchling; test ! -e /opt/runtime/pytest; "
        "test ! -e /opt/runtime/mypy; test ! -e /opt/runtime/ruff; "
        "! command -v uv; ! command -v pip; ! command -v pip3; "
        "! command -v gcc; ! command -v cc; ! command -v make; "
        "! command -v cron; ! command -v crond; "
        "! find /opt/runtime -name current.json -o -name update_activated | grep -q .; "
        "test -d /opt/bgmss/producer; "
        'test -z "$(find /opt/bgmss/producer -type d ! -perm 0555 -print -quit)"; '
        'test -z "$(find /opt/bgmss/producer -type f ! -perm 0444 -print -quit)"; '
        'test -z "$(find /opt/bgmss/producer ! -uid 65532 -print -quit)"; '
        'test -z "$(find /opt/bgmss/producer ! -gid 65532 -print -quit)"; '
        "! touch /opt/bgmss/producer/.write-probe"
    )
    _run_container(
        docker,
        image=image_id,
        container_name=filesystem_container,
        owner_token=owner_token,
        owned_container_ids=owned_container_ids,
        entrypoint="/bin/sh",
        command=[
            "-ec",
            filesystem_check,
        ],
    )
    package_probe = (
        "import importlib.metadata as metadata;import json;"
        "distributions=list(metadata.distributions(path=['/opt/runtime']));"
        "missing=sorted(str(file) for item in distributions "
        "for file in (item.files or ()) if not item.locate_file(file).is_file());"
        "assert not missing,missing;"
        "value=[{'name':str(item.metadata['Name']).lower().replace('_','-'),"
        "'version':item.version} for item in "
        "distributions];"
        "print(json.dumps(sorted(value,key=lambda item:(item['name'],item['version'])),"
        "separators=(',',':'),sort_keys=True))"
    )
    closure = _run_container(
        docker,
        image=image_id,
        container_name=package_container,
        owner_token=owner_token,
        owned_container_ids=owned_container_ids,
        entrypoint="/usr/local/bin/python",
        command=[
            "-c",
            package_probe,
        ],
    )
    try:
        actual_packages = json.loads(closure.stdout)
    except json.JSONDecodeError as error:
        raise artifact.BuildError("runtime package probe did not emit JSON") from error
    if actual_packages != expected_packages:
        raise artifact.BuildError(
            "runtime image package closure disagrees with build metadata and SBOM"
        )
    return labels


def smoke(
    output: Path,
    contracts_root: Path,
    docker: Path,
    target: artifact.Target,
) -> None:
    artifact.verify_output(output, require_statement=True)
    artifact.validate_contract_output(output, contracts_root)
    before_output = artifact.tree_digest(output)
    before_contracts = _protected_contract_digest(contracts_root)
    metadata = _read_build_metadata(output)
    runtime_packages = _runtime_package_information(metadata)
    manifest_digest = _producer_manifest_digest(metadata)
    image, relative_archive, artifact_image_ids = _image_information(metadata)
    image_archive = output.joinpath(*relative_archive.parts)
    containers = {
        purpose: _container_name(image, purpose)
        for purpose in ("catalog", "contract", "doctor", "filesystem", "packages")
    }
    owner_token = _new_owner_token()
    existing = _run_docker(docker, ["image", "inspect", image], check=False)
    if existing.returncode == 0:
        raise artifact.BuildError(f"refusing to replace pre-existing local image ref: {image}")
    if not _docker_resource_missing(existing, "image"):
        raise artifact.BuildError(f"cannot prove local image ref is unused: {image}")
    _require_container_names_available(docker, tuple(containers.values()))
    image_load_attempted = False
    image_load_completed = False
    loaded_image_id: str | None = None
    owned_container_ids: dict[str, str] = {}
    with _cleanup_guard(
        lambda: _cleanup_smoke_resources(
            docker=docker,
            containers={name: owned_container_ids.get(name) for name in containers.values()},
            owner_token=owner_token,
            image_reference=image,
            artifact_image_ids=artifact_image_ids,
            image_load_attempted=image_load_attempted,
            image_load_completed=image_load_completed,
            loaded_image_id=loaded_image_id,
        )
    ):
        image_load_attempted = True
        _run_docker(
            docker,
            ["image", "load", "--input", str(image_archive)],
            timeout_seconds=300,
        )
        image_load_completed = True
        loaded_image_id = _capture_loaded_image_id(
            docker,
            image,
            artifact_image_ids,
        )
        producer_labels = _inspect_runtime(
            docker,
            loaded_image_id,
            target,
            runtime_packages,
            manifest_digest,
            owner_token,
            owned_container_ids,
            containers["filesystem"],
            containers["packages"],
        )
        doctor = _run_container(
            docker,
            image=loaded_image_id,
            container_name=containers["doctor"],
            owner_token=owner_token,
            owned_container_ids=owned_container_ids,
            command=[
                "doctor",
            ],
        )
        try:
            doctor_value = json.loads(doctor.stdout)
        except json.JSONDecodeError as error:
            raise artifact.BuildError("doctor did not emit bounded JSON") from error
        if doctor_value != {
            "code": "FOUNDATION_READY",
            "status": "ok",
            "version": artifact.PACKAGE_VERSION,
        }:
            raise artifact.BuildError("doctor emitted an unexpected result")
        contract_check = _run_container(
            docker,
            image=loaded_image_id,
            container_name=containers["contract"],
            owner_token=owner_token,
            owned_container_ids=owned_container_ids,
            command=[
                "contract-check",
                "--contracts-root",
                "/opt/bgmss/producer/contracts",
            ],
        )
        try:
            contract_value = json.loads(contract_check.stdout)
        except json.JSONDecodeError as error:
            raise artifact.BuildError("contract-check did not emit bounded JSON") from error
        if contract_value != {"code": "VALID", "status": "ok"}:
            raise artifact.BuildError("contract-check emitted an unexpected result")
        catalog_probe = (
            "from pathlib import Path;"
            "from bangumi_staff_stats_updater.catalog.config "
            "import load_configuration;"
            "value=load_configuration("
            "Path('/opt/bgmss/producer/catalog/display-v1.yaml'),"
            "Path('/opt/bgmss/producer/contracts'));"
            "print(value.digest)"
        )
        catalog_check = _run_container(
            docker,
            image=loaded_image_id,
            container_name=containers["catalog"],
            owner_token=owner_token,
            owned_container_ids=owned_container_ids,
            entrypoint="/usr/local/bin/python",
            command=[
                "-I",
                "-c",
                catalog_probe,
            ],
        )
        if catalog_check.stdout.strip() != producer_labels[artifact.PRODUCER_CATALOG_CONFIG_LABEL]:
            raise artifact.BuildError("embedded catalog probe disagrees with producer metadata")
    if artifact.tree_digest(output) != before_output:
        raise artifact.BuildError("artifact bytes changed during smoke")
    if _protected_contract_digest(contracts_root) != before_contracts:
        raise artifact.BuildError("read-only Contracts inputs changed during smoke")
    forbidden_residue = tuple(output.rglob("current.json")) + tuple(
        output.rglob("update_activated")
    )
    if forbidden_residue:
        raise artifact.BuildError("smoke left activation residue")


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument("output", type=Path)
    parser.add_argument("--contracts-root", required=True, type=Path)
    parser.add_argument("--docker", default=Path("docker"), type=Path)
    parser.add_argument("--target", default="linux/arm64")
    return parser


def main(arguments: Sequence[str] | None = None) -> int:
    namespace = _parser().parse_args(arguments)
    try:
        smoke(
            namespace.output.resolve(),
            namespace.contracts_root.resolve(),
            namespace.docker,
            artifact.Target.parse(namespace.target),
        )
        return 0
    except artifact.BuildError as error:
        sys.stderr.write(f"updater smoke error: {error}\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
