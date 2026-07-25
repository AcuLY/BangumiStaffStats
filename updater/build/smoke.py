#!/usr/bin/env python3
"""Source-free, non-root smoke for the built Updater OCI artifact."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import re
import stat
import subprocess
import sys
from collections.abc import Sequence
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
    previous_runtime_prune = sys.modules.get("runtime_prune")
    _load_sibling_control_plane("runtime_prune", "runtime_prune.py")
    try:
        return _load_sibling_control_plane("artifact", "artifact.py")
    finally:
        if previous_runtime_prune is None:
            sys.modules.pop("runtime_prune", None)
        else:
            sys.modules["runtime_prune"] = previous_runtime_prune


if TYPE_CHECKING:
    import artifact
else:
    artifact = _load_artifact_control_plane()

CONTAINER_TMPFS = "/tmp:rw,noexec,nosuid,size=8m"  # noqa: S108


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
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise artifact.BuildError(f"invalid build metadata: {error}") from error
    if not isinstance(value, dict):
        raise artifact.BuildError("build metadata must be an object")
    return value


def _image_information(metadata: dict[str, object]) -> tuple[str, Path]:
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
        path = image["path"]
        if not isinstance(reference, str) or not isinstance(path, str):
            raise TypeError
    except (KeyError, TypeError) as error:
        raise artifact.BuildError("build metadata has no complete OCI image description") from error
    relative = artifact._safe_relative(path)
    return reference, Path(*relative.parts)


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


def _common_run_arguments(image: str, container_name: str) -> list[str]:
    return [
        "run",
        "--rm",
        "--name",
        container_name,
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
        image,
    ]


def _inspect_runtime(
    docker: Path,
    image: str,
    target: artifact.Target,
    expected_packages: list[dict[str, str]],
    filesystem_container: str,
    package_container: str,
) -> None:
    inspected = _run_docker(docker, ["image", "inspect", image])
    try:
        document = json.loads(inspected.stdout)
        value = document[0]
        config = value["Config"]
    except (IndexError, KeyError, TypeError, json.JSONDecodeError) as error:
        raise artifact.BuildError(f"invalid docker image inspection result: {error}") from error
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
        "! find /opt/runtime -name current.json -o -name update_activated | grep -q ."
    )
    _run_docker(
        docker,
        [
            "run",
            "--rm",
            "--name",
            filesystem_container,
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
            "--entrypoint",
            "/bin/sh",
            image,
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
    closure = _run_docker(
        docker,
        [
            "run",
            "--rm",
            "--name",
            package_container,
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
            "--entrypoint",
            "/usr/local/bin/python",
            image,
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
    image, relative_archive = _image_information(metadata)
    image_archive = output.joinpath(*relative_archive.parts)
    containers = {
        purpose: _container_name(image, purpose)
        for purpose in ("contract", "doctor", "filesystem", "packages")
    }
    existing = _run_docker(docker, ["image", "inspect", image], check=False)
    if existing.returncode == 0:
        raise artifact.BuildError(f"refusing to replace pre-existing local image ref: {image}")
    for container in containers.values():
        existing_container = _run_docker(
            docker,
            ["container", "inspect", container],
            check=False,
        )
        if existing_container.returncode == 0:
            raise artifact.BuildError(
                f"refusing to replace pre-existing smoke container: {container}"
            )
    loaded = False
    loaded_targets: list[str] = []
    try:
        load = _run_docker(
            docker,
            ["image", "load", "--input", str(image_archive)],
            timeout_seconds=300,
        )
        loaded = True
        for line in load.stdout.splitlines():
            match = re.fullmatch(r"Loaded image(?: ID)?: (.+)", line.strip())
            if match is not None:
                loaded_targets.append(match.group(1))
        _inspect_runtime(
            docker,
            image,
            target,
            runtime_packages,
            containers["filesystem"],
            containers["packages"],
        )
        doctor = _run_docker(
            docker,
            [*_common_run_arguments(image, containers["doctor"]), "doctor"],
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
        contract_check = _run_docker(
            docker,
            [
                "run",
                "--rm",
                "--name",
                containers["contract"],
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
                "--volume",
                f"{contracts_root.resolve()}:/contracts:ro",
                image,
                "contract-check",
                "--contracts-root",
                "/contracts",
            ],
        )
        try:
            contract_value = json.loads(contract_check.stdout)
        except json.JSONDecodeError as error:
            raise artifact.BuildError("contract-check did not emit bounded JSON") from error
        if contract_value != {"code": "VALID", "status": "ok"}:
            raise artifact.BuildError("contract-check emitted an unexpected result")
    finally:
        for container in containers.values():
            _run_docker(
                docker,
                ["container", "rm", "--force", container],
                check=False,
            )
        if loaded:
            for image_target in dict.fromkeys([image, *loaded_targets]):
                _run_docker(docker, ["image", "rm", image_target], check=False)
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
