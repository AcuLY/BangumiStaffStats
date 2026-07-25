#!/usr/bin/env python3
"""Deterministically remove development-only files from an installed runtime."""

from __future__ import annotations

import argparse
import base64
import csv
import fnmatch
import hashlib
import io
import shutil
import sys
from pathlib import Path, PurePosixPath

sys.dont_write_bytecode = True

FORBIDDEN_DIRECTORY_NAMES = frozenset({"benchmark", "benchmarks", "test", "tests"})
FORBIDDEN_FILE_PATTERNS = ("*_test.py", "test_*.py")


class RuntimePruneError(RuntimeError):
    """The installed runtime cannot be pruned without violating its metadata."""


def _safe_record_path(value: str) -> PurePosixPath:
    if not value or "\\" in value or "\0" in value:
        raise RuntimePruneError(f"unsafe RECORD path: {value!r}")
    path = PurePosixPath(value)
    if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        raise RuntimePruneError(f"unsafe RECORD path: {value!r}")
    return path


def _record_rows(path: Path) -> list[list[str]]:
    try:
        rows = list(csv.reader(path.read_text(encoding="utf-8").splitlines()))
    except (csv.Error, OSError, UnicodeDecodeError) as error:
        raise RuntimePruneError(f"cannot read RECORD {path}: {error}") from error
    if not rows or any(len(row) != 3 for row in rows):
        raise RuntimePruneError(f"malformed RECORD: {path}")
    return rows


def _write_record(path: Path, rows: list[list[str]]) -> None:
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\n")
    writer.writerows(rows)
    temporary = path.with_name(f".{path.name}.runtime-prune")
    temporary.write_text(output.getvalue(), encoding="utf-8", newline="")
    temporary.chmod(path.stat().st_mode & 0o777)
    temporary.replace(path)


def _record_digest(path: Path) -> str:
    digest = hashlib.sha256(path.read_bytes()).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


def _verify_record(root: Path, record: Path) -> None:
    rows = _record_rows(record)
    relative_record = record.relative_to(root).as_posix()
    relative_metadata = f"{record.parent.relative_to(root).as_posix()}/METADATA"
    paths = [row[0] for row in rows]
    if len(paths) != len(set(paths)):
        raise RuntimePruneError(f"duplicate paths in RECORD: {record}")
    if relative_record not in paths or relative_metadata not in paths:
        raise RuntimePruneError(f"RECORD lost required package metadata: {record}")
    for value, digest, size in rows:
        relative = _safe_record_path(value)
        target = root.joinpath(*relative.parts)
        if target.is_symlink() or not target.is_file():
            raise RuntimePruneError(f"RECORD references a missing file: {value}")
        if not digest and not size:
            if value != relative_record:
                raise RuntimePruneError(f"unexpected unhashed RECORD entry: {value}")
            continue
        if not digest.startswith("sha256=") or not size.isascii() or not size.isdecimal():
            raise RuntimePruneError(f"unsupported RECORD digest or size: {value}")
        if digest[7:] != _record_digest(target) or int(size) != target.stat().st_size:
            raise RuntimePruneError(f"RECORD digest or size mismatch: {value}")


def verify_runtime_tree(root: Path) -> None:
    if root.is_symlink():
        raise RuntimePruneError(f"runtime root must be a real directory: {root}")
    root = root.resolve()
    if not root.is_dir():
        raise RuntimePruneError(f"runtime root must be a real directory: {root}")
    for path in root.rglob("*"):
        if path.is_symlink():
            raise RuntimePruneError(f"runtime tree contains a symlink: {path}")
        relative = path.relative_to(root)
        if path.is_dir() and path.name.casefold() in FORBIDDEN_DIRECTORY_NAMES:
            raise RuntimePruneError(f"runtime tree contains development directory: {relative}")
        if path.is_file() and (
            path.name == "uv_cache.json"
            or any(fnmatch.fnmatchcase(path.name, pattern) for pattern in FORBIDDEN_FILE_PATTERNS)
        ):
            raise RuntimePruneError(f"runtime tree contains development file: {relative}")
    records = sorted(root.glob("*.dist-info/RECORD"))
    metadata = sorted(root.glob("*.dist-info/METADATA"))
    if not records or len(records) != len(metadata):
        raise RuntimePruneError("runtime package metadata is incomplete")
    for record in records:
        _verify_record(root, record)


def prune_runtime_tree(root: Path) -> tuple[str, ...]:
    if root.is_symlink():
        raise RuntimePruneError(f"runtime root must be a real directory: {root}")
    root = root.resolve()
    if not root.is_dir():
        raise RuntimePruneError(f"runtime root must be a real directory: {root}")
    for path in root.rglob("*"):
        if path.is_symlink():
            raise RuntimePruneError(f"runtime tree contains a symlink: {path}")

    forbidden_directory_candidates = {
        path
        for path in root.rglob("*")
        if path.is_dir() and path.name.casefold() in FORBIDDEN_DIRECTORY_NAMES
    }
    forbidden_directories = sorted(
        (
            path
            for path in forbidden_directory_candidates
            if not any(parent in forbidden_directory_candidates for parent in path.parents)
        ),
        key=lambda path: path.relative_to(root).as_posix(),
    )
    removed = {
        path.relative_to(root).as_posix()
        for directory in forbidden_directories
        for path in directory.rglob("*")
        if path.is_file()
    }
    for directory in forbidden_directories:
        shutil.rmtree(directory)

    forbidden_files = sorted(
        (
            path
            for path in root.rglob("*")
            if path.is_file()
            and (
                path.name == "uv_cache.json"
                or any(
                    fnmatch.fnmatchcase(path.name, pattern) for pattern in FORBIDDEN_FILE_PATTERNS
                )
            )
        ),
        key=lambda path: path.relative_to(root).as_posix(),
    )
    for path in forbidden_files:
        removed.add(path.relative_to(root).as_posix())
        path.unlink()

    for record in sorted(root.glob("*.dist-info/RECORD")):
        rows = [row for row in _record_rows(record) if row[0] not in removed]
        _write_record(record, rows)
    verify_runtime_tree(root)
    return tuple(sorted(removed))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("runtime_root", type=Path)
    namespace = parser.parse_args()
    try:
        removed = prune_runtime_tree(namespace.runtime_root)
    except RuntimePruneError as error:
        parser.error(str(error))
    sys.stdout.write(f"pruned {len(removed)} development-only runtime files\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
