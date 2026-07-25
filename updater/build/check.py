#!/usr/bin/env python3
"""Run the Updater artifact reproducibility and artifact-only smoke gates."""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from collections.abc import Sequence
from pathlib import Path

sys.dont_write_bytecode = True

import artifact  # noqa: E402
import smoke  # noqa: E402


def _run(command: Sequence[str], *, cwd: Path) -> None:
    environment = dict(os.environ)
    environment["PYTHONDONTWRITEBYTECODE"] = "1"
    environment["PYTHONPYCACHEPREFIX"] = str(artifact.TMP_ROOT / "pycache")
    rendered = " ".join(command)
    sys.stdout.write(f"+ {rendered}\n")
    sys.stdout.flush()
    completed = subprocess.run(  # noqa: S603
        list(command),
        check=False,
        cwd=cwd,
        env=environment,
    )
    if completed.returncode != 0:
        raise artifact.BuildError(f"gate failed ({completed.returncode}): {rendered}")


def _audit_owned_paths() -> None:
    status = artifact._git_output(
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
        "--",
        "updater",
    )
    for line in status.splitlines():
        path = line[3:]
        if " -> " in path:
            raise artifact.BuildError(f"renames are forbidden in Updater artifact paths: {line}")
        if path == "updater/Dockerfile" or path.startswith("updater/build/"):
            continue
        raise artifact.BuildError(f"Updater protected path changed: {line}")
    _run(
        ["git", "diff", "--check", "--", "updater/Dockerfile", "updater/build"],
        cwd=artifact.REPOSITORY_ROOT,
    )
    build_root = artifact.BUILD_ROOT
    residue = [
        path
        for path in build_root.rglob("*")
        if artifact.TMP_ROOT.resolve() not in path.resolve().parents
        and path.resolve() != artifact.TMP_ROOT.resolve()
        and (
            path.name == "__pycache__"
            or path.suffix in {".pyc", ".pyo"}
            or path.name in {"current.json", "update_activated"}
        )
    ]
    if residue:
        raise artifact.BuildError(f"Updater build residue exists: {residue}")


def check(
    *,
    target: artifact.Target,
    python: Path,
    uv: Path,
    docker: Path | None,
    builder: str | None,
    contracts_root: Path | None,
    keep_work: bool,
    source_revision: str | None,
    source_tree: str | None,
    source_date_epoch: int | None,
) -> Path | None:
    attestation = artifact.attest_source_checkout(
        source_revision,
        source_tree,
        source_date_epoch,
    )
    artifact.verify_dockerfile()
    _audit_owned_paths()
    _run(
        [
            str(python),
            "-m",
            "unittest",
            "discover",
            "-s",
            "build",
            "-p",
            "test_*.py",
            "-v",
        ],
        cwd=artifact.UPDATER_ROOT,
    )
    rechecked_attestation = artifact.attest_source_checkout(
        source_revision,
        source_tree,
        source_date_epoch,
    )
    if rechecked_attestation != attestation:
        raise artifact.BuildError("source checkout state changed during pre-build gates")
    attestation = rechecked_attestation
    run_root = artifact.TMP_ROOT / "reproducibility"
    artifact._clear_generated_directory(run_root)
    first_root = run_root / "first"
    second_root = run_root / "second"
    first = artifact.build_component(
        work_root=first_root,
        target=target,
        attestation=attestation,
        uv=uv,
        python=python,
        docker=docker,
        contracts_root=contracts_root,
        publish_root=None,
        builder=builder,
    )
    second = artifact.build_component(
        work_root=second_root,
        target=target,
        attestation=attestation,
        uv=uv,
        python=python,
        docker=docker,
        contracts_root=contracts_root,
        publish_root=None,
        builder=builder,
    )
    artifact.compare_trees(first, second)
    published: Path | None = None
    if docker is not None and contracts_root is not None:
        published = artifact.publish_content_addressed(first, artifact.TMP_ROOT / "published")
        smoke.smoke(published, contracts_root, docker, target)
    elif docker is not None or contracts_root is not None:
        raise artifact.BuildError("Docker and Contracts inputs must be provided together")
    _audit_owned_paths()
    if not keep_work:
        artifact._remove_generated_directory(run_root)
    return published


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument("--target", default="linux/arm64")
    parser.add_argument("--python", required=True, type=Path)
    parser.add_argument("--uv", default=Path(shutil.which("uv") or "uv"), type=Path)
    parser.add_argument("--docker", type=Path)
    parser.add_argument("--builder")
    parser.add_argument("--contracts-root", type=Path)
    parser.add_argument("--keep-work", action="store_true")
    parser.add_argument("--source-revision")
    parser.add_argument("--source-tree")
    parser.add_argument("--source-date-epoch", type=int)
    return parser


def main(arguments: Sequence[str] | None = None) -> int:
    namespace = _parser().parse_args(arguments)
    try:
        result = check(
            target=artifact.Target.parse(namespace.target),
            python=namespace.python.resolve(),
            uv=namespace.uv.resolve(),
            docker=namespace.docker.resolve() if namespace.docker else None,
            builder=namespace.builder,
            contracts_root=(
                namespace.contracts_root.resolve() if namespace.contracts_root else None
            ),
            keep_work=namespace.keep_work,
            source_revision=namespace.source_revision,
            source_tree=namespace.source_tree,
            source_date_epoch=namespace.source_date_epoch,
        )
        if result is None:
            sys.stdout.write("native reproducibility check passed (OCI/statement/smoke deferred)\n")
        else:
            sys.stdout.write(f"updater artifact accepted at {result}\n")
        return 0
    except artifact.BuildError as error:
        sys.stderr.write(f"updater artifact check error: {error}\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
