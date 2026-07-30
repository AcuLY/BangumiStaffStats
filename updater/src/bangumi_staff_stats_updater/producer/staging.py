"""Contained same-filesystem staging and atomic inactive publication."""

from __future__ import annotations

import ctypes
import errno
import os
import shutil
import stat
import sys
import tempfile
from pathlib import Path

from .model import ProducerError

_AT_FDCWD = -2
_RENAME_EXCL = 0x00000004
_RENAME_NOREPLACE = 1


def _rename_exclusive(source: Path, destination: Path) -> None:
    """Atomically rename a directory without replacing a raced destination."""
    library = ctypes.CDLL(None, use_errno=True)
    source_bytes = os.fsencode(source)
    destination_bytes = os.fsencode(destination)
    try:
        if sys.platform == "darwin":
            function = library.renameatx_np
            function.argtypes = [
                ctypes.c_int,
                ctypes.c_char_p,
                ctypes.c_int,
                ctypes.c_char_p,
                ctypes.c_uint,
            ]
            function.restype = ctypes.c_int
            result = function(
                _AT_FDCWD,
                source_bytes,
                _AT_FDCWD,
                destination_bytes,
                _RENAME_EXCL,
            )
        elif sys.platform.startswith("linux"):
            function = library.renameat2
            function.argtypes = [
                ctypes.c_int,
                ctypes.c_char_p,
                ctypes.c_int,
                ctypes.c_char_p,
                ctypes.c_uint,
            ]
            function.restype = ctypes.c_int
            result = function(
                _AT_FDCWD,
                source_bytes,
                _AT_FDCWD,
                destination_bytes,
                _RENAME_NOREPLACE,
            )
        else:
            raise ProducerError("PUBLICATION_FAILED")
    except AttributeError as error:
        raise ProducerError("PUBLICATION_FAILED") from error
    if result == 0:
        return
    error_number = ctypes.get_errno()
    if error_number in {errno.EEXIST, errno.ENOTEMPTY}:
        raise ProducerError("PUBLICATION_COLLISION")
    raise ProducerError("PUBLICATION_FAILED")


def _directory(path: Path, code: str) -> Path:
    try:
        metadata = path.lstat()
        if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISDIR(metadata.st_mode):
            raise ProducerError(code)
        resolved = path.resolve(strict=True)
    except OSError as error:
        raise ProducerError(code) from error
    if path.absolute() != resolved:
        raise ProducerError(code)
    return resolved


def _remove_owned_stage(path: Path, output_root: Path) -> None:
    """Remove one exact, owner-created staging directory without following links."""
    try:
        metadata = path.lstat()
        if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISDIR(metadata.st_mode):
            raise ProducerError("STAGING_CLEANUP_FAILED")
        resolved = path.resolve(strict=True)
        if (
            path.absolute() != resolved
            or resolved.parent != output_root
            or not resolved.name.startswith(".bgmss-stage-")
        ):
            raise ProducerError("STAGING_CLEANUP_FAILED")
        shutil.rmtree(resolved)
    except FileNotFoundError:
        return
    except (OSError, ProducerError) as error:
        if isinstance(error, ProducerError):
            raise
        raise ProducerError("STAGING_CLEANUP_FAILED") from error


class StagingRoot:
    """Own one unique unpublished staging directory below an approved root."""

    def __init__(self, output_root: Path) -> None:
        if not output_root.is_absolute():
            raise ProducerError("OUTPUT_ROOT_INVALID")
        self.output_root = _directory(output_root, "OUTPUT_ROOT_INVALID")
        self.versions_root = self.output_root / "versions"
        try:
            self.versions_root.mkdir(mode=0o750, exist_ok=True)
        except OSError as error:
            raise ProducerError("OUTPUT_ROOT_INVALID") from error
        self.versions_root = _directory(self.versions_root, "OUTPUT_ROOT_INVALID")
        try:
            root_device = self.output_root.stat().st_dev
            versions_device = self.versions_root.stat().st_dev
        except OSError as error:
            raise ProducerError("OUTPUT_ROOT_INVALID") from error
        if root_device != versions_device:
            raise ProducerError("OUTPUT_FILESYSTEM_MISMATCH")

        stage_path: Path | None = None
        try:
            stage_path = Path(tempfile.mkdtemp(prefix=".bgmss-stage-", dir=self.output_root))
            self.path = _directory(stage_path, "STAGING_CREATE_FAILED")
            self.stage_versions = self.path / "versions"
            self.stage_versions.mkdir(mode=0o750)
            self.stage_versions = _directory(
                self.stage_versions,
                "STAGING_CREATE_FAILED",
            )
            if self.path.stat().st_dev != versions_device:
                raise ProducerError("OUTPUT_FILESYSTEM_MISMATCH")
        except (OSError, ProducerError) as error:
            if stage_path is not None:
                try:
                    _remove_owned_stage(stage_path, self.output_root)
                except ProducerError as cleanup_error:
                    raise cleanup_error from error
            if isinstance(error, ProducerError):
                raise
            raise ProducerError("STAGING_CREATE_FAILED") from error
        self._published = False
        self._closed = False
        self._prepared_version: str | None = None

    def __enter__(self) -> StagingRoot:
        return self

    def candidate_root(self, data_version: str) -> Path:
        """Create and return the fixed pointer-free candidate directory."""
        if (
            not data_version.startswith("dv1-")
            or len(data_version) != 68
            or any(character not in "0123456789abcdef" for character in data_version[4:])
        ):
            raise ProducerError("DATA_VERSION_INVALID")
        path = self.stage_versions / data_version
        try:
            path.mkdir(mode=0o750)
        except OSError as error:
            raise ProducerError("STAGING_CREATE_FAILED") from error
        return _directory(path, "STAGING_CREATE_FAILED")

    def prepare_publication(self, data_version: str) -> None:
        """Delete and verify all large non-candidate work before the commit point."""
        candidate = _directory(
            self.stage_versions / data_version,
            "CANDIDATE_LAYOUT_INVALID",
        )
        try:
            for entry in tuple(self.path.iterdir()):
                if entry == self.stage_versions:
                    continue
                if entry.name not in {"download", "sources"}:
                    raise ProducerError("STAGING_CLEANUP_FAILED")
                work_directory = _directory(entry, "STAGING_CLEANUP_FAILED")
                shutil.rmtree(work_directory)
            if tuple(self.path.iterdir()) != (self.stage_versions,):
                raise ProducerError("STAGING_CLEANUP_FAILED")
            staged_versions = tuple(self.stage_versions.iterdir())
            if staged_versions != (candidate,):
                raise ProducerError("CANDIDATE_LAYOUT_INVALID")
        except (OSError, ProducerError) as error:
            if isinstance(error, ProducerError):
                raise
            raise ProducerError("STAGING_CLEANUP_FAILED") from error
        self._prepared_version = data_version

    def publish(self, data_version: str) -> Path:
        """Atomically rename a closed candidate into an absent inactive version."""
        if self._prepared_version != data_version:
            raise ProducerError("CANDIDATE_LAYOUT_INVALID")
        source = self.stage_versions / data_version
        destination = self.versions_root / data_version
        try:
            source = _directory(source, "CANDIDATE_LAYOUT_INVALID")
        except ProducerError:
            raise
        if destination.exists() or destination.is_symlink():
            raise ProducerError("PUBLICATION_COLLISION")
        _rename_exclusive(source, destination)
        self._published = True
        self._prepared_version = None
        return destination

    def cleanup(self, *, best_effort: bool = False) -> None:
        """Remove only this owner-unique staging directory."""
        if self._closed:
            return
        self._closed = True
        try:
            _remove_owned_stage(self.path, self.output_root)
        except ProducerError:
            if not best_effort:
                raise

    def __exit__(
        self,
        _exception_type: object,
        _exception: object,
        _traceback: object,
    ) -> None:
        self.cleanup(best_effort=self._published)
