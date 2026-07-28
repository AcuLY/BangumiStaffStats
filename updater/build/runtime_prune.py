#!/usr/bin/env python3
"""Deterministically remove development-only files from an installed runtime."""

from __future__ import annotations

import argparse
import base64
import csv
import fnmatch
import hashlib
import io
import os
import shutil
import stat
import sys
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

sys.dont_write_bytecode = True

FORBIDDEN_DIRECTORY_NAMES = frozenset({"benchmark", "benchmarks", "test", "tests"})
FORBIDDEN_FILE_PATTERNS = ("*_test.py", "test_*.py")
_DIRECTORY_OPEN_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
_FILE_OPEN_FLAGS = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK
_INSTALLER_QUARANTINE_NAME = ".bin.runtime-prune-quarantine"


class RuntimePruneError(RuntimeError):
    """The installed runtime cannot be pruned without violating its metadata."""


@dataclass(frozen=True)
class _DirectoryEvidence:
    path: str
    device: int
    inode: int
    mode: int
    links: int
    size: int
    modified_ns: int
    changed_ns: int


@dataclass(frozen=True)
class _FileEvidence:
    path: str
    device: int
    inode: int
    mode: int
    links: int
    size: int
    modified_ns: int
    changed_ns: int
    digest: str


@dataclass(frozen=True)
class _InstallerPlan:
    directories: tuple[_DirectoryEvidence, ...]
    files: tuple[_FileEvidence, ...]


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


def _fd_digest(file_descriptor: int) -> str:
    digest = hashlib.sha256()
    os.lseek(file_descriptor, 0, os.SEEK_SET)
    while chunk := os.read(file_descriptor, 1024 * 1024):
        digest.update(chunk)
    return base64.urlsafe_b64encode(digest.digest()).rstrip(b"=").decode()


def _directory_evidence(path: str, information: os.stat_result) -> _DirectoryEvidence:
    if not stat.S_ISDIR(information.st_mode):
        raise RuntimePruneError(f"runtime installer directory changed type: {path}")
    return _DirectoryEvidence(
        path=path,
        device=information.st_dev,
        inode=information.st_ino,
        mode=information.st_mode,
        links=information.st_nlink,
        size=information.st_size,
        modified_ns=information.st_mtime_ns,
        changed_ns=information.st_ctime_ns,
    )


def _file_evidence(
    path: str,
    information: os.stat_result,
    digest: str,
) -> _FileEvidence:
    if not stat.S_ISREG(information.st_mode):
        raise RuntimePruneError(f"runtime installer file changed type: {path}")
    return _FileEvidence(
        path=path,
        device=information.st_dev,
        inode=information.st_ino,
        mode=information.st_mode,
        links=information.st_nlink,
        size=information.st_size,
        modified_ns=information.st_mtime_ns,
        changed_ns=information.st_ctime_ns,
        digest=digest,
    )


def _stable_file_evidence(path: str, file_descriptor: int) -> _FileEvidence:
    before = os.fstat(file_descriptor)
    digest = _fd_digest(file_descriptor)
    after = os.fstat(file_descriptor)
    before_identity = (
        before.st_dev,
        before.st_ino,
        before.st_mode,
        before.st_nlink,
        before.st_size,
        before.st_mtime_ns,
        before.st_ctime_ns,
    )
    after_identity = (
        after.st_dev,
        after.st_ino,
        after.st_mode,
        after.st_nlink,
        after.st_size,
        after.st_mtime_ns,
        after.st_ctime_ns,
    )
    if before_identity != after_identity:
        raise RuntimePruneError(f"runtime installer file changed while hashing: {path}")
    return _file_evidence(path, after, digest)


def _open_directory_at(parent_descriptor: int, name: str, display_path: str) -> int:
    try:
        descriptor = os.open(name, _DIRECTORY_OPEN_FLAGS, dir_fd=parent_descriptor)
    except OSError as error:
        raise RuntimePruneError(
            f"runtime installer directory is not a stable real directory: {display_path}"
        ) from error
    return descriptor


def _same_directory_identity(
    expected: _DirectoryEvidence,
    information: os.stat_result,
) -> bool:
    return (
        stat.S_ISDIR(information.st_mode)
        and information.st_dev == expected.device
        and information.st_ino == expected.inode
        and information.st_mode == expected.mode
    )


def _same_file_identity(expected: _FileEvidence, information: os.stat_result) -> bool:
    return (
        stat.S_ISREG(information.st_mode)
        and information.st_dev == expected.device
        and information.st_ino == expected.inode
        and information.st_mode == expected.mode
        and information.st_nlink == expected.links == 1
        and information.st_size == expected.size
        and information.st_mtime_ns == expected.modified_ns
        and information.st_ctime_ns == expected.changed_ns
    )


def _installer_plans_match(
    expected: _InstallerPlan | None,
    observed: _InstallerPlan | None,
    *,
    allow_root_rename_metadata: bool = False,
) -> bool:
    if expected is None or observed is None:
        return expected is observed
    if expected.files != observed.files:
        return False
    expected_directories = {entry.path: entry for entry in expected.directories}
    observed_directories = {entry.path: entry for entry in observed.directories}
    if expected_directories.keys() != observed_directories.keys():
        return False
    for path, expected_directory in expected_directories.items():
        observed_directory = observed_directories[path]
        if path == "bin" and allow_root_rename_metadata:
            # POSIX implementations differ on metadata updates for the renamed
            # directory itself; its inode and the complete child evidence remain sealed.
            if (
                expected_directory.device != observed_directory.device
                or expected_directory.inode != observed_directory.inode
                or expected_directory.mode != observed_directory.mode
            ):
                return False
        elif expected_directory != observed_directory:
            return False
    return True


def _verify_record(root: Path, record: Path) -> list[list[str]]:
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
    return rows


def _installed_records(root: Path) -> tuple[Path, ...]:
    records = tuple(sorted(root.glob("*.dist-info/RECORD")))
    metadata = tuple(sorted(root.glob("*.dist-info/METADATA")))
    if not records or len(records) != len(metadata):
        raise RuntimePruneError("runtime package metadata is incomplete")
    return records


def _installer_record_owners(
    record_rows: dict[Path, list[list[str]]],
) -> dict[str, tuple[Path, str, int]]:
    owners: dict[str, tuple[Path, str, int]] = {}
    for record, rows in record_rows.items():
        for value, digest, size in rows:
            relative = _safe_record_path(value)
            if relative.parts[0] != "bin":
                continue
            if value in owners:
                raise RuntimePruneError(f"installer script has multiple RECORD owners: {value}")
            if not digest.startswith("sha256=") or not size.isascii() or not size.isdecimal():
                raise RuntimePruneError(f"unsupported installer RECORD entry: {value}")
            owners[value] = (record, digest[7:], int(size))
    return owners


def _scan_installer_tree(
    root_descriptor: int,
    owners: dict[str, tuple[Path, str, int]],
    *,
    entry_name: str = "bin",
) -> _InstallerPlan | None:
    try:
        installer_descriptor = os.open(
            entry_name,
            _DIRECTORY_OPEN_FLAGS,
            dir_fd=root_descriptor,
        )
    except FileNotFoundError:
        if owners:
            missing = min(owners)
            raise RuntimePruneError(
                f"RECORD references a missing installer script: {missing}"
            ) from None
        return None
    except OSError as error:
        raise RuntimePruneError("runtime installer bin must be a stable real directory") from error

    directories: list[_DirectoryEvidence] = []
    files: list[_FileEvidence] = []

    def scan_directory(descriptor: int, relative: PurePosixPath) -> None:
        display = relative.as_posix()
        initial_directory = _directory_evidence(display, os.fstat(descriptor))
        try:
            names = sorted(os.listdir(descriptor))
        except OSError as error:
            raise RuntimePruneError(
                f"cannot enumerate runtime installer directory: {display}"
            ) from error
        for name in names:
            child_relative = relative / name
            child_display = child_relative.as_posix()
            try:
                observed = os.stat(
                    name,
                    dir_fd=descriptor,
                    follow_symlinks=False,
                )
            except OSError as error:
                raise RuntimePruneError(
                    f"runtime installer entry changed during admission: {child_display}"
                ) from error
            if stat.S_ISLNK(observed.st_mode):
                raise RuntimePruneError(
                    f"runtime installer subtree contains a symlink: {child_display}"
                )
            if stat.S_ISDIR(observed.st_mode):
                child_descriptor = _open_directory_at(descriptor, name, child_display)
                try:
                    opened = os.fstat(child_descriptor)
                    if (
                        observed.st_dev != opened.st_dev
                        or observed.st_ino != opened.st_ino
                        or observed.st_mode != opened.st_mode
                    ):
                        raise RuntimePruneError(
                            f"runtime installer directory changed during admission: {child_display}"
                        )
                    scan_directory(child_descriptor, child_relative)
                finally:
                    os.close(child_descriptor)
                continue
            if not stat.S_ISREG(observed.st_mode):
                raise RuntimePruneError(
                    f"runtime installer subtree contains a special file: {child_display}"
                )
            if observed.st_nlink != 1:
                raise RuntimePruneError(
                    f"runtime installer file has multiple hard links: {child_display}"
                )
            try:
                file_descriptor = os.open(
                    name,
                    _FILE_OPEN_FLAGS,
                    dir_fd=descriptor,
                )
            except OSError as error:
                raise RuntimePruneError(
                    f"runtime installer file changed during admission: {child_display}"
                ) from error
            try:
                evidence = _stable_file_evidence(child_display, file_descriptor)
            finally:
                os.close(file_descriptor)
            if not _same_file_identity(evidence, observed):
                raise RuntimePruneError(
                    f"runtime installer file changed during admission: {child_display}"
                )
            owner = owners.get(child_display)
            if owner is None:
                raise RuntimePruneError(f"installer script has no RECORD owner: {child_display}")
            _record, expected_digest, expected_size = owner
            if evidence.digest != expected_digest or evidence.size != expected_size:
                raise RuntimePruneError(f"RECORD digest or size mismatch: {child_display}")
            files.append(evidence)
        final_directory = _directory_evidence(display, os.fstat(descriptor))
        if final_directory != initial_directory:
            raise RuntimePruneError(
                f"runtime installer directory changed during admission: {display}"
            )
        directories.append(final_directory)

    try:
        scan_directory(installer_descriptor, PurePosixPath("bin"))
    finally:
        os.close(installer_descriptor)

    on_disk = {entry.path for entry in files}
    missing = sorted(owners.keys() - on_disk)
    if missing:
        raise RuntimePruneError(f"RECORD references a missing installer script: {missing[0]}")
    return _InstallerPlan(
        directories=tuple(sorted(directories, key=lambda entry: entry.path)),
        files=tuple(sorted(files, key=lambda entry: entry.path)),
    )


def _open_planned_directory(
    installer_descriptor: int,
    relative: PurePosixPath,
    expected_directories: dict[str, _DirectoryEvidence],
) -> int:
    descriptor = os.dup(installer_descriptor)
    try:
        installer_expected = expected_directories["bin"]
        if not _same_directory_identity(installer_expected, os.fstat(descriptor)):
            raise RuntimePruneError("runtime installer quarantine identity changed before deletion")
        for index, name in enumerate(relative.parts):
            display = PurePosixPath("bin", *relative.parts[: index + 1]).as_posix()
            expected = expected_directories[display]
            child_descriptor = _open_directory_at(descriptor, name, display)
            os.close(descriptor)
            descriptor = child_descriptor
            if not _same_directory_identity(expected, os.fstat(descriptor)):
                raise RuntimePruneError(
                    f"runtime installer directory identity changed before deletion: {display}"
                )
        return descriptor
    except Exception:
        os.close(descriptor)
        raise


def _entry_exists_at(parent_descriptor: int, name: str) -> bool:
    try:
        os.stat(name, dir_fd=parent_descriptor, follow_symlinks=False)
    except FileNotFoundError:
        return False
    except OSError as error:
        raise RuntimePruneError(f"cannot inspect runtime installer entry: {name}") from error
    return True


def _required_stat_at(
    parent_descriptor: int,
    name: str,
    display_path: str,
) -> os.stat_result:
    try:
        return os.stat(
            name,
            dir_fd=parent_descriptor,
            follow_symlinks=False,
        )
    except OSError as error:
        raise RuntimePruneError(
            f"runtime installer entry changed before deletion: {display_path}"
        ) from error


def _rename_at(
    parent_descriptor: int,
    source: str,
    destination: str,
) -> None:
    try:
        os.rename(
            source,
            destination,
            src_dir_fd=parent_descriptor,
            dst_dir_fd=parent_descriptor,
        )
    except OSError as error:
        raise RuntimePruneError(
            f"cannot isolate runtime installer tree: {source} -> {destination}"
        ) from error


def _delete_quarantined_installer_tree(
    root_descriptor: int,
    owners: dict[str, tuple[Path, str, int]],
    admitted: _InstallerPlan,
) -> None:
    current = _scan_installer_tree(
        root_descriptor,
        owners,
        entry_name=_INSTALLER_QUARANTINE_NAME,
    )
    if not _installer_plans_match(
        admitted,
        current,
        allow_root_rename_metadata=True,
    ):
        raise RuntimePruneError("quarantined runtime installer tree changed before deletion")
    if _entry_exists_at(root_descriptor, "bin"):
        raise RuntimePruneError("runtime installer bin was recreated before quarantine deletion")

    installer_descriptor = _open_directory_at(
        root_descriptor,
        _INSTALLER_QUARANTINE_NAME,
        _INSTALLER_QUARANTINE_NAME,
    )
    installer_root = next(entry for entry in admitted.directories if entry.path == "bin")
    if not _same_directory_identity(installer_root, os.fstat(installer_descriptor)):
        os.close(installer_descriptor)
        raise RuntimePruneError("runtime installer quarantine identity changed before deletion")

    expected_directories = {entry.path: entry for entry in admitted.directories}
    try:
        for expected in admitted.files:
            relative = PurePosixPath(*PurePosixPath(expected.path).parts[1:])
            parent_descriptor = _open_planned_directory(
                installer_descriptor,
                relative.parent,
                expected_directories,
            )
            try:
                try:
                    file_descriptor = os.open(
                        relative.name,
                        _FILE_OPEN_FLAGS,
                        dir_fd=parent_descriptor,
                    )
                except OSError as error:
                    raise RuntimePruneError(
                        f"runtime installer file changed before deletion: {expected.path}"
                    ) from error
                try:
                    current_file = _stable_file_evidence(
                        expected.path,
                        file_descriptor,
                    )
                    named = _required_stat_at(
                        parent_descriptor,
                        relative.name,
                        expected.path,
                    )
                finally:
                    os.close(file_descriptor)
                if current_file != expected or not _same_file_identity(
                    expected,
                    named,
                ):
                    raise RuntimePruneError(
                        f"runtime installer file identity changed before deletion: {expected.path}"
                    )
                try:
                    os.unlink(relative.name, dir_fd=parent_descriptor)
                except OSError as error:
                    raise RuntimePruneError(
                        f"cannot delete admitted runtime installer file: {expected.path}"
                    ) from error
            finally:
                os.close(parent_descriptor)

        ordered_directories = sorted(
            (entry for entry in admitted.directories if entry.path != "bin"),
            key=lambda entry: (
                len(PurePosixPath(entry.path).parts),
                entry.path,
            ),
            reverse=True,
        )
        for expected in ordered_directories:
            relative = PurePosixPath(*PurePosixPath(expected.path).parts[1:])
            parent_descriptor = _open_planned_directory(
                installer_descriptor,
                relative.parent,
                expected_directories,
            )
            try:
                child_descriptor = _open_directory_at(
                    parent_descriptor,
                    relative.name,
                    expected.path,
                )
                try:
                    if not _same_directory_identity(
                        expected,
                        os.fstat(child_descriptor),
                    ):
                        raise RuntimePruneError(
                            f"runtime installer directory identity changed before "
                            f"deletion: {expected.path}"
                        )
                    if os.listdir(  # noqa: PTH208 - descriptor-relative seal
                        child_descriptor
                    ):
                        raise RuntimePruneError(
                            f"runtime installer directory is not empty: {expected.path}"
                        )
                finally:
                    os.close(child_descriptor)
                named = _required_stat_at(
                    parent_descriptor,
                    relative.name,
                    expected.path,
                )
                if not _same_directory_identity(expected, named):
                    raise RuntimePruneError(
                        f"runtime installer directory identity changed before "
                        f"deletion: {expected.path}"
                    )
                try:
                    os.rmdir(relative.name, dir_fd=parent_descriptor)
                except OSError as error:
                    raise RuntimePruneError(
                        f"cannot delete empty runtime installer directory: {expected.path}"
                    ) from error
            finally:
                os.close(parent_descriptor)
    finally:
        os.close(installer_descriptor)

    named_quarantine = _required_stat_at(
        root_descriptor,
        _INSTALLER_QUARANTINE_NAME,
        _INSTALLER_QUARANTINE_NAME,
    )
    if not _same_directory_identity(installer_root, named_quarantine):
        raise RuntimePruneError("runtime installer quarantine identity changed before removal")
    try:
        os.rmdir(_INSTALLER_QUARANTINE_NAME, dir_fd=root_descriptor)
    except OSError as error:
        raise RuntimePruneError("cannot remove empty runtime installer quarantine") from error


def _remove_installer_tree(
    root_descriptor: int,
    owners: dict[str, tuple[Path, str, int]],
    admitted: _InstallerPlan,
) -> None:
    current = _scan_installer_tree(root_descriptor, owners)
    if not _installer_plans_match(admitted, current):
        raise RuntimePruneError("runtime installer tree changed before quarantine")
    if _entry_exists_at(root_descriptor, _INSTALLER_QUARANTINE_NAME):
        raise RuntimePruneError("runtime installer quarantine destination already exists")

    _rename_at(
        root_descriptor,
        "bin",
        _INSTALLER_QUARANTINE_NAME,
    )
    quarantined = True
    try:
        isolated = _scan_installer_tree(
            root_descriptor,
            owners,
            entry_name=_INSTALLER_QUARANTINE_NAME,
        )
        if not _installer_plans_match(
            admitted,
            isolated,
            allow_root_rename_metadata=True,
        ):
            raise RuntimePruneError("runtime installer identity changed while entering quarantine")
        _delete_quarantined_installer_tree(
            root_descriptor,
            owners,
            admitted,
        )
        quarantined = False
    finally:
        if (
            quarantined
            and not _entry_exists_at(root_descriptor, "bin")
            and _entry_exists_at(root_descriptor, _INSTALLER_QUARANTINE_NAME)
        ):
            _rename_at(
                root_descriptor,
                _INSTALLER_QUARANTINE_NAME,
                "bin",
            )


def verify_runtime_tree(root: Path) -> None:
    if root.is_symlink():
        raise RuntimePruneError(f"runtime root must be a real directory: {root}")
    root = root.resolve()
    if not root.is_dir():
        raise RuntimePruneError(f"runtime root must be a real directory: {root}")
    installer_root = root / "bin"
    if installer_root.is_symlink() or installer_root.exists():
        raise RuntimePruneError("runtime tree retains direct installer bin child")
    quarantine_root = root / _INSTALLER_QUARANTINE_NAME
    if quarantine_root.is_symlink() or quarantine_root.exists():
        raise RuntimePruneError("runtime tree retains installer quarantine residue")
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
    for record in _installed_records(root):
        _verify_record(root, record)


def prune_runtime_tree(root: Path) -> tuple[str, ...]:
    if root.is_symlink():
        raise RuntimePruneError(f"runtime root must be a real directory: {root}")
    root = root.resolve()
    if not root.is_dir():
        raise RuntimePruneError(f"runtime root must be a real directory: {root}")
    quarantine_root = root / _INSTALLER_QUARANTINE_NAME
    if quarantine_root.is_symlink() or quarantine_root.exists():
        raise RuntimePruneError("runtime tree contains pre-existing installer quarantine")
    for path in root.rglob("*"):
        if path.is_symlink():
            raise RuntimePruneError(f"runtime tree contains a symlink: {path}")

    installer_root = root / "bin"
    records = _installed_records(root)
    record_rows = {record: _verify_record(root, record) for record in records}
    installer_owners = _installer_record_owners(record_rows)
    try:
        root_descriptor = os.open(root, _DIRECTORY_OPEN_FLAGS)
    except OSError as error:
        raise RuntimePruneError(f"runtime root must be a stable real directory: {root}") from error
    try:
        if _entry_exists_at(root_descriptor, _INSTALLER_QUARANTINE_NAME):
            raise RuntimePruneError("runtime tree contains pre-existing installer quarantine")
        installer_plan = _scan_installer_tree(root_descriptor, installer_owners)

        forbidden_directory_candidates = {
            path
            for path in root.rglob("*")
            if path.is_dir()
            and installer_root not in path.parents
            and path.name.casefold() in FORBIDDEN_DIRECTORY_NAMES
        }
        forbidden_directories = sorted(
            (
                path
                for path in forbidden_directory_candidates
                if not any(parent in forbidden_directory_candidates for parent in path.parents)
            ),
            key=lambda path: path.relative_to(root).as_posix(),
        )
        removed = (
            {entry.path for entry in installer_plan.files} if installer_plan is not None else set()
        )
        removed.update(
            path.relative_to(root).as_posix()
            for directory in forbidden_directories
            for path in directory.rglob("*")
            if path.is_file()
        )
        if installer_plan is not None:
            _remove_installer_tree(
                root_descriptor,
                installer_owners,
                installer_plan,
            )
    finally:
        os.close(root_descriptor)

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

    for record in records:
        rows = [row for row in record_rows[record] if row[0] not in removed]
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
