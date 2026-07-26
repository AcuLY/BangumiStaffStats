"""Focused tests for the deterministic Updater artifact boundary."""

from __future__ import annotations

import gzip
import io
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest
from contextlib import redirect_stderr
from pathlib import Path, PurePosixPath
from typing import Any
from unittest.mock import patch

sys.dont_write_bytecode = True

import artifact  # noqa: E402
import check as build_check  # noqa: E402
import runtime_prune  # noqa: E402
import smoke  # noqa: E402


class GeneratedDirectoryTestCase(unittest.TestCase):
    def setUp(self) -> None:
        artifact._ensure_tmp_root()
        self._temporary = tempfile.TemporaryDirectory(
            dir=artifact.TMP_ROOT,
            prefix="test-artifact-",
        )
        self.root = Path(self._temporary.name)

    def tearDown(self) -> None:
        self._temporary.cleanup()


class SourceAttestationTests(GeneratedDirectoryTestCase):
    def setUp(self) -> None:
        super().setUp()
        self.repository = self.root / "repository"
        self.repository.mkdir()
        self.generated_root = self.repository / "updater" / "build" / ".tmp"
        (self.repository / ".gitignore").write_text(
            "\n".join(
                (
                    "/updater/build/.tmp/",
                    "__pycache__/",
                    "*.pyc",
                    ".env",
                    "",
                )
            ),
            encoding="utf-8",
        )
        fixture_files = {
            "tracked.txt": "clean\n",
            "updater/README.md": "fixture updater\n",
            "updater/build/runtime_prune.py": "def prune() -> None:\n    return None\n",
            "updater/pyproject.toml": '[project]\nname = "fixture"\nversion = "1"\n',
            "updater/src/package/__init__.py": 'VALUE = "tracked"\n',
            "updater/uv.lock": "version = 1\nrevision = 1\n",
        }
        for relative, value in fixture_files.items():
            path = self.repository / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(value, encoding="utf-8")
        authority_source = artifact.REPOSITORY_ROOT / (
            artifact.producer_inputs.MANIFEST_SOURCE_PATH
        )
        manifest = artifact.producer_inputs.parse_runtime_manifest(authority_source.read_bytes())
        producer_paths = [
            artifact.producer_inputs.MANIFEST_SOURCE_PATH,
            *(record.path for record in manifest.files),
            *artifact.producer_inputs.CATALOG_SOURCE_PATHS,
        ]
        for relative in producer_paths:
            path = self.repository / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes((artifact.REPOSITORY_ROOT / relative).read_bytes())
        self._git("init", "--quiet")
        self._git("add", ".")
        self._git("commit", "--quiet", "-m", "attestation fixture")
        self.attestation = artifact.attest_source_checkout(
            None,
            None,
            None,
            repository_root=self.repository,
        )
        self.identity = self.attestation.identity

    def _git(self, *arguments: str) -> str:
        return self._git_at(self.repository, *arguments)

    def _git_input(self, value: str, *arguments: str) -> str:
        git = shutil.which("git")
        if git is None:
            raise RuntimeError("Git is required for source attestation tests")
        environment = dict(os.environ)
        environment.update(
            {
                "GIT_AUTHOR_EMAIL": "artifact-tests@example.invalid",
                "GIT_AUTHOR_NAME": "Artifact Tests",
                "GIT_COMMITTER_EMAIL": "artifact-tests@example.invalid",
                "GIT_COMMITTER_NAME": "Artifact Tests",
            }
        )
        completed = subprocess.run(  # noqa: S603
            [git, *arguments],
            check=True,
            cwd=self.repository,
            env=environment,
            capture_output=True,
            input=value,
            text=True,
        )
        return completed.stdout.strip()

    @staticmethod
    def _git_at(repository: Path, *arguments: str) -> str:
        git = shutil.which("git")
        if git is None:
            raise RuntimeError("Git is required for source attestation tests")
        environment = dict(os.environ)
        environment.update(
            {
                "GIT_AUTHOR_EMAIL": "artifact-tests@example.invalid",
                "GIT_AUTHOR_NAME": "Artifact Tests",
                "GIT_COMMITTER_EMAIL": "artifact-tests@example.invalid",
                "GIT_COMMITTER_NAME": "Artifact Tests",
            }
        )
        completed = subprocess.run(  # noqa: S603
            [git, *arguments],
            check=True,
            cwd=repository,
            env=environment,
            capture_output=True,
            text=True,
        )
        return completed.stdout.strip()

    @staticmethod
    def _different_object_id(value: str) -> str:
        replacement = "0" if value[0] != "0" else "1"
        return f"{replacement}{value[1:]}"

    def _assert_acceptance_entrypoints_reject_without_output(
        self,
        overrides: list[str],
        expected_error: str,
    ) -> None:
        self.generated_root.mkdir(parents=True, exist_ok=True)
        artifact_sentinel = self.generated_root / "artifact-sentinel"
        check_sentinel = self.generated_root / "check-sentinel"
        artifact_sentinel.write_bytes(b"artifact sentinel")
        check_sentinel.write_bytes(b"check sentinel")
        artifact_output = self.generated_root / "artifact-output"
        check_output = self.generated_root / "reproducibility"

        with (
            patch.object(artifact, "REPOSITORY_ROOT", self.repository),
            patch.object(artifact, "TMP_ROOT", self.generated_root),
            redirect_stderr(io.StringIO()) as artifact_error,
        ):
            artifact_result = artifact.main(
                [
                    "build",
                    "--work-root",
                    str(artifact_output),
                    "--python",
                    sys.executable,
                    *overrides,
                ]
            )
        self.assertEqual(artifact_result, 1)
        self.assertIn(expected_error, artifact_error.getvalue())
        self.assertFalse(artifact_output.exists())
        self.assertEqual(artifact_sentinel.read_bytes(), b"artifact sentinel")

        with (
            patch.object(artifact, "REPOSITORY_ROOT", self.repository),
            patch.object(artifact, "TMP_ROOT", self.generated_root),
            redirect_stderr(io.StringIO()) as check_error,
        ):
            check_result = build_check.main(
                [
                    "--python",
                    sys.executable,
                    "--uv",
                    sys.executable,
                    *overrides,
                ]
            )
        self.assertEqual(check_result, 1)
        self.assertIn(expected_error, check_error.getvalue())
        self.assertFalse(check_output.exists())
        self.assertEqual(check_sentinel.read_bytes(), b"check sentinel")

    def test_clean_checkout_derives_identity_and_accepts_only_exact_restatement(
        self,
    ) -> None:
        self.assertEqual(
            artifact.attest_source_checkout(
                self.identity.revision,
                self.identity.tree,
                self.identity.epoch,
                repository_root=self.repository,
            ),
            self.attestation,
        )

    def test_noncanonical_repository_root_is_rejected(self) -> None:
        nested = self.repository / "nested"
        nested.mkdir()
        with self.assertRaisesRegex(
            artifact.BuildError,
            "canonical repository root mismatch",
        ):
            artifact.attest_source_checkout(
                None,
                None,
                None,
                repository_root=nested,
            )

    def test_symlinked_repository_root_is_rejected(self) -> None:
        linked_root = self.root / "repository-link"
        linked_root.symlink_to(self.repository, target_is_directory=True)
        with self.assertRaisesRegex(
            artifact.BuildError,
            "must not contain symlinks or aliases",
        ):
            artifact.attest_source_checkout(
                None,
                None,
                None,
                repository_root=linked_root,
            )

    def test_tracked_worktree_drift_fails_both_clis_before_output(self) -> None:
        (self.repository / "tracked.txt").write_text("changed\n", encoding="utf-8")
        self._assert_acceptance_entrypoints_reject_without_output(
            [],
            "raw bytes differ from HEAD",
        )

    def test_staged_index_drift_fails_both_clis_before_output(self) -> None:
        (self.repository / "tracked.txt").write_text("staged\n", encoding="utf-8")
        self._git("add", "tracked.txt")
        self._assert_acceptance_entrypoints_reject_without_output(
            [],
            "stage-zero blob/mode inventory differs from HEAD",
        )

    def test_untracked_nonignored_drift_fails_both_clis_before_output(self) -> None:
        (self.repository / "untracked.txt").write_text("untracked\n", encoding="utf-8")
        self._assert_acceptance_entrypoints_reject_without_output(
            [],
            "untracked non-ignored path",
        )

    def test_revision_override_drift_fails_both_clis_before_output(self) -> None:
        self._assert_acceptance_entrypoints_reject_without_output(
            [
                "--source-revision",
                self._different_object_id(self.identity.revision),
            ],
            "supplied source revision does not exactly match",
        )

    def test_tree_override_drift_fails_both_clis_before_output(self) -> None:
        self._assert_acceptance_entrypoints_reject_without_output(
            [
                "--source-tree",
                self._different_object_id(self.identity.tree),
            ],
            "supplied source tree does not exactly match",
        )

    def test_epoch_override_drift_fails_both_clis_before_output(self) -> None:
        self._assert_acceptance_entrypoints_reject_without_output(
            [
                "--source-date-epoch",
                str(self.identity.epoch + 1),
            ],
            "supplied source epoch does not exactly match",
        )

    def test_git_environment_cannot_redirect_attestation_to_clean_decoy(self) -> None:
        self.generated_root.mkdir(parents=True)
        decoy = self.generated_root / "decoy"
        decoy.mkdir()
        (decoy / "tracked.txt").write_text("decoy\n", encoding="utf-8")
        self._git_at(decoy, "init", "--quiet")
        self._git_at(decoy, "add", "tracked.txt")
        self._git_at(decoy, "commit", "--quiet", "-m", "clean decoy")
        (self.repository / "tracked.txt").write_text("changed\n", encoding="utf-8")

        with patch.dict(
            os.environ,
            {
                "GIT_DIR": str(decoy / ".git"),
                "GIT_WORK_TREE": str(decoy),
            },
            clear=False,
        ):
            self._assert_acceptance_entrypoints_reject_without_output(
                [],
                "raw bytes differ from HEAD",
            )

    def test_alternate_index_environment_cannot_hide_staged_drift(self) -> None:
        self.generated_root.mkdir(parents=True)
        alternate_index = self.generated_root / "alternate-index"
        shutil.copyfile(self.repository / ".git" / "index", alternate_index)
        (self.repository / "tracked.txt").write_text("staged\n", encoding="utf-8")
        self._git("add", "tracked.txt")

        with patch.dict(
            os.environ,
            {"GIT_INDEX_FILE": str(alternate_index)},
            clear=False,
        ):
            self._assert_acceptance_entrypoints_reject_without_output(
                [],
                "stage-zero blob/mode inventory differs from HEAD",
            )

    def test_hostile_global_excludes_cannot_hide_untracked_source(self) -> None:
        self.generated_root.mkdir(parents=True)
        hidden_source = self.repository / "updater" / "src" / "global-hidden.py"
        hidden_source.parent.mkdir(parents=True, exist_ok=True)
        hidden_source.write_text("hidden = True\n", encoding="utf-8")
        excludes = self.generated_root / "global-excludes"
        excludes.write_text("/updater/src/global-hidden.py\n", encoding="utf-8")
        global_config = self.generated_root / "global-config"
        global_config.write_text(
            f"[core]\n\texcludesFile = {excludes}\n",
            encoding="utf-8",
        )

        with patch.dict(
            os.environ,
            {"GIT_CONFIG_GLOBAL": str(global_config)},
            clear=False,
        ):
            self._assert_acceptance_entrypoints_reject_without_output(
                [],
                "untracked non-ignored path",
            )

    def test_info_exclude_cannot_hide_untracked_source(self) -> None:
        hidden_source = self.repository / "updater" / "src" / "info-hidden.py"
        hidden_source.parent.mkdir(parents=True, exist_ok=True)
        hidden_source.write_text("hidden = True\n", encoding="utf-8")
        (self.repository / ".git" / "info" / "exclude").write_text(
            "/updater/src/info-hidden.py\n",
            encoding="utf-8",
        )

        self._assert_acceptance_entrypoints_reject_without_output(
            [],
            "untracked non-ignored path",
        )

    def test_nested_untracked_ignore_control_cannot_hide_source(self) -> None:
        nested = self.repository / "updater" / "src" / "nested"
        nested.mkdir(parents=True)
        (nested / ".gitignore").write_text("*\n", encoding="utf-8")
        (nested / "hidden.py").write_text("hidden = True\n", encoding="utf-8")

        self._assert_acceptance_entrypoints_reject_without_output(
            [],
            "untracked ignore-control file is forbidden",
        )

    def test_assume_unchanged_flag_fails_both_clis_before_output(self) -> None:
        self._git("update-index", "--assume-unchanged", "tracked.txt")
        self._assert_acceptance_entrypoints_reject_without_output(
            [],
            "assume-unchanged flag is forbidden",
        )

    def test_skip_worktree_flag_fails_both_clis_before_output(self) -> None:
        self._git("update-index", "--skip-worktree", "tracked.txt")
        self._assert_acceptance_entrypoints_reject_without_output(
            [],
            "skip-worktree flag is forbidden",
        )

    def test_non_stage_zero_index_fails_both_clis_before_output(self) -> None:
        oid = self._git("rev-parse", "HEAD:tracked.txt")
        self._git("update-index", "--force-remove", "tracked.txt")
        self._git_input(
            "".join(
                (
                    f"100644 {oid} 1\ttracked.txt\n",
                    f"100644 {oid} 2\ttracked.txt\n",
                    f"100644 {oid} 3\ttracked.txt\n",
                )
            ),
            "update-index",
            "--index-info",
        )
        self._assert_acceptance_entrypoints_reject_without_output(
            [],
            "non-stage-zero entry",
        )

    @unittest.skipIf(os.name == "nt", "executable-mode attestation is POSIX-only")
    def test_raw_executable_mode_fails_even_when_local_config_ignores_it(self) -> None:
        self._git("config", "core.filemode", "false")
        (self.repository / "tracked.txt").chmod(0o755)
        self._git("diff", "--quiet", "--", "tracked.txt")
        self._assert_acceptance_entrypoints_reject_without_output(
            [],
            "executable mode differs from HEAD",
        )

    def test_local_attributes_filter_cannot_hide_raw_worktree_drift(self) -> None:
        (self.repository / ".git" / "info" / "attributes").write_text(
            "tracked.txt filter=mask\n",
            encoding="utf-8",
        )
        self._git("config", "filter.mask.clean", "printf 'clean\\n'")
        self._git("config", "filter.mask.required", "true")
        (self.repository / "tracked.txt").write_text("changed\n", encoding="utf-8")
        self._git("diff", "--quiet", "--", "tracked.txt")
        self._assert_acceptance_entrypoints_reject_without_output(
            [],
            "raw bytes differ from HEAD",
        )

    def test_snapshot_uses_attested_bytes_not_live_source(self) -> None:
        tracked_source = self.repository / "updater" / "src" / "package" / "__init__.py"
        tracked_source.write_text('VALUE = "changed after attest"\n', encoding="utf-8")
        catalog_source = self.repository / artifact.producer_inputs.CATALOG_SOURCE_PATHS[0]
        admitted_catalog = next(
            blob.content
            for blob in self.attestation.tracked_blobs
            if blob.path == artifact.producer_inputs.CATALOG_SOURCE_PATHS[0]
        )
        catalog_source.write_bytes(b"changed after attest\n")
        snapshot = self.generated_root / "trusted-snapshot"
        with patch.object(artifact, "TMP_ROOT", self.generated_root):
            artifact._copy_source_snapshot(snapshot, self.attestation)
        self.assertEqual(
            (snapshot / "src" / "package" / "__init__.py").read_text(encoding="utf-8"),
            'VALUE = "tracked"\n',
        )
        self.assertEqual(
            (
                snapshot / "producer" / artifact.producer_inputs.CATALOG_EMBEDDED_PATHS[0]
            ).read_bytes(),
            admitted_catalog,
        )
        producer_files = artifact._iter_regular_files(snapshot / "producer")
        self.assertEqual(len(producer_files), 44)
        self.assertEqual(
            (snapshot / artifact.producer_inputs.MANIFEST_AUTHORITY_SNAPSHOT_PATH).read_bytes(),
            next(
                blob.content
                for blob in self.attestation.tracked_blobs
                if blob.path == artifact.producer_inputs.MANIFEST_SOURCE_PATH
            ),
        )

    def test_ignored_live_files_do_not_enter_or_change_snapshot_artifacts(self) -> None:
        cache = self.repository / "updater" / "src" / "package" / "__pycache__"
        cache.mkdir(parents=True)
        pycache = cache / "module.cpython-314.pyc"
        ignored_pyc = self.repository / "updater" / "src" / "package" / "ignored.pyc"
        ignored_env = self.repository / "updater" / "src" / ".env"
        pycache.write_bytes(b"first cache")
        ignored_pyc.write_bytes(b"first pyc")
        ignored_env.write_bytes(b"FIRST=1\n")
        first_attestation = artifact.attest_source_checkout(
            None,
            None,
            None,
            repository_root=self.repository,
        )

        first_snapshot = self.generated_root / "ignored-first"
        second_snapshot = self.generated_root / "ignored-second"
        first_tar = self.generated_root / "ignored-first.tar.gz"
        second_tar = self.generated_root / "ignored-second.tar.gz"
        with patch.object(artifact, "TMP_ROOT", self.generated_root):
            artifact._copy_source_snapshot(first_snapshot, first_attestation)
            artifact._normalized_tar(
                first_snapshot,
                first_tar,
                prefix="source",
                epoch=first_attestation.identity.epoch,
                compress=True,
            )

        pycache.write_bytes(b"second cache with different bytes")
        ignored_pyc.write_bytes(b"second pyc")
        ignored_env.write_bytes(b"SECOND=2\n")
        (cache / "additional.pyc").write_bytes(b"additional ignored file")
        second_attestation = artifact.attest_source_checkout(
            None,
            None,
            None,
            repository_root=self.repository,
        )
        self.assertEqual(first_attestation, second_attestation)
        with patch.object(artifact, "TMP_ROOT", self.generated_root):
            artifact._copy_source_snapshot(second_snapshot, second_attestation)
            artifact._normalized_tar(
                second_snapshot,
                second_tar,
                prefix="source",
                epoch=second_attestation.identity.epoch,
                compress=True,
            )
            artifact.compare_trees(first_snapshot, second_snapshot)

        self.assertEqual(first_tar.read_bytes(), second_tar.read_bytes())
        self.assertFalse(any(first_snapshot.rglob("__pycache__")))
        self.assertFalse(any(first_snapshot.rglob("*.pyc")))
        self.assertFalse((first_snapshot / "src" / ".env").exists())


class CanonicalJsonTests(unittest.TestCase):
    def test_canonical_json_is_sorted_compact_and_newline_terminated(self) -> None:
        self.assertEqual(
            artifact.canonical_json({"z": [2, 1], "a": "值"}),
            '{"a":"值","z":[2,1]}\n'.encode(),
        )

    def test_canonical_json_rejects_nan(self) -> None:
        with self.assertRaisesRegex(artifact.BuildError, "canonical JSON"):
            artifact.canonical_json({"unsafe": float("nan")})


class PathSafetyTests(GeneratedDirectoryTestCase):
    def test_safe_relative_rejects_absolute_escape_and_backslash(self) -> None:
        for value in (
            "/absolute",
            "../escape",
            "a/../escape",
            r"a\escape",
            "space here",
            "",
        ):
            with (
                self.subTest(value=value),
                self.assertRaisesRegex(artifact.BuildError, "unsafe relative path"),
            ):
                artifact._safe_relative(value)

    def test_generated_paths_cannot_escape_build_tmp(self) -> None:
        with self.assertRaisesRegex(artifact.BuildError, "must be below"):
            artifact._require_under_tmp(artifact.BUILD_ROOT / "outside")
        with self.assertRaisesRegex(artifact.BuildError, "must be below"):
            artifact._require_under_tmp(artifact.TMP_ROOT)
        with self.assertRaisesRegex(artifact.BuildError, "parent traversal"):
            artifact._require_under_tmp(self.root / ".." / "escape")

    def test_generated_mutations_reject_symlink_escape_without_touching_sentinel(self) -> None:
        with tempfile.TemporaryDirectory(prefix="bgmss-updater-sentinel-") as external_name:
            external = Path(external_name)
            sentinel = external / "sentinel"
            sentinel.write_bytes(b"outside")
            link = self.root / "linked-outside"
            link.symlink_to(external, target_is_directory=True)
            stage = self.root / "stage"
            stage.mkdir()
            (stage / "artifact").write_bytes(b"immutable")
            source = self.root / "source"
            source.mkdir()
            (source / "value").write_bytes(b"value")

            operations = (
                lambda: artifact._clear_generated_directory(link / "clear"),
                lambda: artifact._write_bytes(link / "sentinel", b"changed"),
                lambda: artifact._normalized_tar(
                    source,
                    link / "archive.tar",
                    prefix=None,
                    epoch=1_700_000_000,
                    compress=False,
                ),
                lambda: artifact.publish_content_addressed(stage, link / "published"),
            )
            for operation in operations:
                with (
                    self.subTest(operation=operation),
                    self.assertRaisesRegex(
                        artifact.BuildError,
                        "symlink",
                    ),
                ):
                    operation()
                self.assertEqual(sentinel.read_bytes(), b"outside")

    def test_generated_removal_repairs_readonly_tree_without_following_symlinks(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory(prefix="bgmss-updater-sentinel-") as external_name:
            external = Path(external_name)
            sentinel = external / "sentinel"
            sentinel.write_bytes(b"outside")
            output = self.root / "readonly-output"
            nested = output / "oci-layout" / "blobs" / "sha256"
            nested.mkdir(parents=True)
            immutable = nested / "digest"
            immutable.write_bytes(b"artifact")
            (nested / "external").symlink_to(external, target_is_directory=True)
            immutable.chmod(0o444)
            for directory in (
                nested,
                nested.parent,
                nested.parent.parent,
                nested.parent.parent.parent,
                output,
            ):
                directory.chmod(0o555)

            artifact._remove_generated_directory(output)

            self.assertFalse(os.path.lexists(output))
            self.assertEqual(sentinel.read_bytes(), b"outside")

    def test_absolute_escape_is_rejected_without_touching_external_sentinel(self) -> None:
        with tempfile.TemporaryDirectory(prefix="bgmss-updater-absolute-") as external_name:
            external = Path(external_name)
            sentinel = external / "sentinel"
            sentinel.write_bytes(b"outside")
            with self.assertRaisesRegex(artifact.BuildError, "must be below"):
                artifact._write_bytes(sentinel, b"changed")
            self.assertEqual(sentinel.read_bytes(), b"outside")

    def test_tree_digest_rejects_symlinks(self) -> None:
        target = self.root / "target"
        target.write_text("target", encoding="utf-8")
        (self.root / "link").symlink_to(target)
        with self.assertRaisesRegex(artifact.BuildError, "symlink"):
            artifact.tree_digest(self.root)


class ArchiveTests(GeneratedDirectoryTestCase):
    def test_normalized_tar_is_byte_identical_and_has_fixed_metadata(self) -> None:
        source = self.root / "source"
        source.mkdir()
        (source / "z.txt").write_text("z", encoding="utf-8")
        (source / "a").mkdir()
        executable = source / "a" / "run"
        executable.write_text("#!/bin/sh\n", encoding="utf-8")
        executable.chmod(0o755)
        first = self.root / "first.tar.gz"
        second = self.root / "second.tar.gz"
        artifact._normalized_tar(
            source,
            first,
            prefix="bundle",
            epoch=1_700_000_000,
            compress=True,
        )
        artifact._normalized_tar(
            source,
            second,
            prefix="bundle",
            epoch=1_700_000_000,
            compress=True,
        )
        self.assertEqual(first.read_bytes(), second.read_bytes())
        with tarfile.open(first, "r:gz") as archive:
            members = archive.getmembers()
        self.assertEqual(
            [member.name for member in members], sorted(member.name for member in members)
        )
        self.assertEqual({member.uid for member in members}, {0})
        self.assertEqual({member.gid for member in members}, {0})
        self.assertEqual({member.mtime for member in members}, {1_700_000_000})
        modes = {member.name: member.mode for member in members}
        self.assertEqual(modes["bundle/a/run"], 0o755)
        self.assertEqual(modes["bundle/z.txt"], 0o644)

    def test_exporter_header_validation_rejects_escape_and_links(self) -> None:
        escaped = tarfile.TarInfo("../escape")
        escaped.size = 1
        escaped_header = escaped.tobuf(format=tarfile.USTAR_FORMAT)
        escaped_member = tarfile.TarInfo.frombuf(
            escaped_header,
            encoding="utf-8",
            errors="strict",
        )
        with self.assertRaisesRegex(artifact.BuildError, "normalized relative path"):
            artifact._validate_exporter_member(escaped_header, escaped_member)

        linked = tarfile.TarInfo("manifest.json")
        linked.type = tarfile.SYMTYPE
        linked.linkname = "index.json"
        linked_header = linked.tobuf(format=tarfile.USTAR_FORMAT)
        linked_member = tarfile.TarInfo.frombuf(
            linked_header,
            encoding="utf-8",
            errors="strict",
        )
        with self.assertRaisesRegex(artifact.BuildError, "link"):
            artifact._validate_exporter_member(linked_header, linked_member)


class RuntimePruneTests(GeneratedDirectoryTestCase):
    def _make_runtime(self) -> Path:
        runtime = self.root / "runtime"
        distribution = runtime / "fixture-1.0.dist-info"
        distribution.mkdir(parents=True)
        files = {
            "fixture/__init__.py": "production\n",
            "fixture/tests/test_fixture.py": "test\n",
            "fixture/benchmarks/run.py": "benchmark\n",
            "fixture-1.0.dist-info/METADATA": "Name: fixture\nVersion: 1.0\n",
            "fixture-1.0.dist-info/uv_cache.json": '{"timestamp":"unstable"}\n',
        }
        for relative, value in files.items():
            path = runtime / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(value, encoding="utf-8")
        record = distribution / "RECORD"
        rows = [
            (
                relative,
                f"sha256={runtime_prune._record_digest(runtime / relative)}",
                str((runtime / relative).stat().st_size),
            )
            for relative in sorted(files)
        ]
        rows.append(("fixture-1.0.dist-info/RECORD", "", ""))
        record.write_text(
            "".join(f"{relative},{digest},{size}\n" for relative, digest, size in rows),
            encoding="utf-8",
        )
        return runtime

    def test_prune_removes_only_development_content_and_repairs_record(self) -> None:
        runtime = self._make_runtime()
        removed = runtime_prune.prune_runtime_tree(runtime)
        self.assertEqual(
            removed,
            (
                "fixture-1.0.dist-info/uv_cache.json",
                "fixture/benchmarks/run.py",
                "fixture/tests/test_fixture.py",
            ),
        )
        self.assertTrue((runtime / "fixture/__init__.py").is_file())
        self.assertTrue((runtime / "fixture-1.0.dist-info/METADATA").is_file())
        record = runtime / "fixture-1.0.dist-info/RECORD"
        self.assertTrue(record.is_file())
        value = record.read_text(encoding="utf-8")
        self.assertNotIn("uv_cache.json", value)
        self.assertNotIn("/tests/", value)
        self.assertNotIn("/benchmarks/", value)
        runtime_prune.verify_runtime_tree(runtime)

    def test_verify_rejects_record_reference_to_missing_production_file(self) -> None:
        runtime = self._make_runtime()
        (runtime / "fixture/__init__.py").unlink()
        with self.assertRaisesRegex(
            runtime_prune.RuntimePruneError,
            "missing file",
        ):
            runtime_prune.prune_runtime_tree(runtime)


class InventoryTests(GeneratedDirectoryTestCase):
    def _make_output(self) -> Path:
        output = self.root / "output"
        if output.exists():
            artifact._clear_generated_directory(output)
        artifacts = output / "artifacts"
        artifacts.mkdir(parents=True)
        (artifacts / "z.bin").write_bytes(b"z")
        (artifacts / "a.bin").write_bytes(b"a")
        inventory, entries = artifact.make_checksum_inventory(artifacts)
        (output / "SHA256SUMS").write_bytes(inventory)
        packages = []
        relationships = []
        for entry in entries:
            package_id = f"SPDXRef-Package-Artifact-{entry['sha256']}"
            packages.append(
                {
                    "SPDXID": package_id,
                    "checksums": [{"algorithm": "SHA256", "checksumValue": entry["sha256"]}],
                    "copyrightText": "NOASSERTION",
                    "downloadLocation": "NOASSERTION",
                    "filesAnalyzed": False,
                    "licenseConcluded": "NOASSERTION",
                    "licenseDeclared": "NOASSERTION",
                    "name": entry["path"],
                    "primaryPackagePurpose": "APPLICATION",
                    "versionInfo": "1",
                }
            )
            relationships.append(
                {
                    "relatedSpdxElement": package_id,
                    "relationshipType": "DESCRIBES",
                    "spdxElementId": "SPDXRef-DOCUMENT",
                }
            )
        bundle_digest = entries[0]["sha256"]
        sbom = {
            "SPDXID": "SPDXRef-DOCUMENT",
            "creationInfo": {
                "created": "1970-01-01T00:00:00Z",
                "creators": ["Tool: test"],
            },
            "dataLicense": "CC0-1.0",
            "documentNamespace": f"https://example.invalid/{bundle_digest}",
            "name": "test",
            "packages": packages,
            "relationships": sorted(
                relationships,
                key=lambda value: (
                    value["spdxElementId"],
                    value["relationshipType"],
                    value["relatedSpdxElement"],
                ),
            ),
            "spdxVersion": "SPDX-2.3",
        }
        (output / "sbom.spdx.json").write_bytes(artifact.canonical_json(sbom))
        return output

    def test_inventory_is_sorted_complete_and_verifiable(self) -> None:
        output = self._make_output()
        lines = (output / "SHA256SUMS").read_text(encoding="utf-8").splitlines()
        self.assertEqual(
            [line.split("  ", 1)[1] for line in lines],
            ["artifacts/a.bin", "artifacts/z.bin"],
        )
        artifact.verify_output(output, require_statement=False)

    def test_tamper_and_extra_file_fail_closed(self) -> None:
        output = self._make_output()
        (output / "artifacts" / "a.bin").write_bytes(b"tampered")
        with self.assertRaisesRegex(artifact.BuildError, "checksum mismatch"):
            artifact.verify_output(output, require_statement=False)
        output = self._make_output()
        (output / "artifacts" / "extra.bin").write_bytes(b"extra")
        with self.assertRaisesRegex(artifact.BuildError, "does not exactly cover"):
            artifact.verify_output(output, require_statement=False)

    def test_inventory_rejects_unsafe_unsorted_and_duplicate_paths(self) -> None:
        digest = "0" * 64
        cases = (
            f"{digest}  ../escape\n",
            f"{digest}  z\n{digest}  a\n",
            f"{digest}  a\n{digest}  a\n",
        )
        for value in cases:
            with self.subTest(value=value), self.assertRaises(artifact.BuildError):
                artifact.parse_checksum_inventory(value.encode())


class SpdxTests(GeneratedDirectoryTestCase):
    def _make_artifacts(self) -> tuple[list[dict[str, object]], str]:
        artifacts = self.root / "artifacts"
        artifacts.mkdir()
        files = {
            "bangumi_staff_stats_updater-0.1.0-py3-none-any.whl": b"wheel",
            "build-metadata.json": b"metadata",
            "updater-image-linux-arm64.oci.tar": b"oci",
            "updater-runtime-0.1.0-linux-arm64.tar.gz": b"bundle",
        }
        for name, value in files.items():
            (artifacts / name).write_bytes(value)
        _checksum_bytes, inventory = artifact.make_checksum_inventory(artifacts)
        return inventory, "artifacts/updater-runtime-0.1.0-linux-arm64.tar.gz"

    def _make_lock(self, *, version: str = "1.2.3", wheel_hashes: int = 0) -> Path:
        wheel_values = "\n".join(
            (
                '    { url = "https://example.invalid/dependency-'
                f'{index}.whl", hash = "sha256:{str(index + 1) * 64}", size = 1 }},'
            )
            for index in range(wheel_hashes)
        )
        wheels = f"wheels = [\n{wheel_values}\n]\n" if wheel_values else ""
        lock = self.root / "uv.lock"
        lock.write_text(
            f"""
version = 1
revision = 1
requires-python = ">=3.14.6,<3.15"

[[package]]
name = "bangumi-staff-stats-updater"
version = "0.1.0"
source = {{ editable = "." }}

[[package]]
name = "dependency"
version = "{version}"
source = {{ registry = "https://pypi.org/simple" }}
sdist = {{ url = "https://example.invalid/dependency.tar.gz", hash = "sha256:{"a" * 64}", size = 1 }}
{wheels}
""".lstrip(),
            encoding="utf-8",
        )
        return lock

    def test_spdx_is_deterministic_and_covers_installed_runtime_closure(self) -> None:
        inventory, dependency_artifact = self._make_artifacts()
        lock = self._make_lock()
        packages = [
            {"name": artifact.PACKAGE_NAME, "version": artifact.PACKAGE_VERSION},
            {"name": "dependency", "version": "1.2.3"},
        ]
        first = artifact.make_spdx(
            artifacts=inventory,
            dependency_artifact_path=dependency_artifact,
            runtime_packages=packages,
            lock_path=lock,
            namespace_digest=str(
                next(item["sha256"] for item in inventory if item["path"] == dependency_artifact)
            ),
        )
        second = artifact.make_spdx(
            artifacts=list(reversed(inventory)),
            dependency_artifact_path=dependency_artifact,
            runtime_packages=list(reversed(packages)),
            lock_path=lock,
            namespace_digest=str(
                next(item["sha256"] for item in inventory if item["path"] == dependency_artifact)
            ),
        )
        self.assertEqual(artifact.canonical_json(first), artifact.canonical_json(second))
        self.assertEqual(first["spdxVersion"], "SPDX-2.3")
        self.assertEqual(first["creationInfo"]["created"], "1970-01-01T00:00:00Z")
        self.assertEqual(len(first["packages"]), 5)
        describes = [
            relationship
            for relationship in first["relationships"]
            if relationship["relationshipType"] == "DESCRIBES"
        ]
        self.assertEqual(len(describes), 4)
        artifact.verify_spdx_artifact_coverage(first, inventory)

    def test_spdx_rejects_missing_wheel_or_oci_description(self) -> None:
        inventory, dependency_artifact = self._make_artifacts()
        document = artifact.make_spdx(
            artifacts=inventory,
            dependency_artifact_path=dependency_artifact,
            runtime_packages=[
                {"name": artifact.PACKAGE_NAME, "version": artifact.PACKAGE_VERSION},
                {"name": "dependency", "version": "1.2.3"},
            ],
            lock_path=self._make_lock(),
        )
        packages_by_name = {package["name"]: package for package in document["packages"]}
        for name in (
            "artifacts/bangumi_staff_stats_updater-0.1.0-py3-none-any.whl",
            "artifacts/updater-image-linux-arm64.oci.tar",
        ):
            with self.subTest(name=name):
                changed = {
                    **document,
                    "relationships": [
                        relationship
                        for relationship in document["relationships"]
                        if not (
                            relationship["relationshipType"] == "DESCRIBES"
                            and relationship["relatedSpdxElement"]
                            == packages_by_name[name]["SPDXID"]
                        )
                    ],
                }
                with self.assertRaisesRegex(
                    artifact.BuildError,
                    "does not describe every statement artifact",
                ):
                    artifact.verify_spdx_artifact_coverage(changed, inventory)

    def test_spdx_omits_ambiguous_sdist_and_multi_wheel_checksum(self) -> None:
        inventory, dependency_artifact = self._make_artifacts()
        document = artifact.make_spdx(
            artifacts=inventory,
            dependency_artifact_path=dependency_artifact,
            runtime_packages=[
                {"name": artifact.PACKAGE_NAME, "version": artifact.PACKAGE_VERSION},
                {"name": "dependency", "version": "1.2.3"},
            ],
            lock_path=self._make_lock(wheel_hashes=2),
        )
        dependency = next(
            package for package in document["packages"] if package["name"] == "dependency"
        )
        self.assertNotIn("checksums", dependency)

    def test_spdx_rejects_installed_package_version_drift(self) -> None:
        inventory, dependency_artifact = self._make_artifacts()
        lock = self._make_lock(version="1.0.0")
        with self.assertRaisesRegex(artifact.BuildError, "disagrees with uv.lock"):
            artifact.make_spdx(
                artifacts=inventory,
                dependency_artifact_path=dependency_artifact,
                runtime_packages=[
                    {"name": artifact.PACKAGE_NAME, "version": artifact.PACKAGE_VERSION},
                    {"name": "dependency", "version": "2.0.0"},
                ],
                lock_path=lock,
            )


class PublicationTests(GeneratedDirectoryTestCase):
    def test_content_addressed_publish_is_idempotent_and_tamper_safe(self) -> None:
        stage = self.root / "stage"
        stage.mkdir()
        (stage / "artifact").write_bytes(b"immutable")
        publish = self.root / "published"
        first = artifact.publish_content_addressed(stage, publish)
        second = artifact.publish_content_addressed(stage, publish)
        self.assertEqual(first, second)
        self.assertEqual((first / "artifact").read_bytes(), b"immutable")
        self.assertFalse(any(path.name.endswith(".publishing") for path in publish.iterdir()))
        (first / "artifact").write_bytes(b"tampered")
        with self.assertRaisesRegex(artifact.BuildError, "repeated builds differ"):
            artifact.publish_content_addressed(stage, publish)


class ProducerArtifactVerificationTests(GeneratedDirectoryTestCase):
    def setUp(self) -> None:
        super().setUp()
        manifest_bytes = (
            artifact.REPOSITORY_ROOT / artifact.producer_inputs.MANIFEST_SOURCE_PATH
        ).read_bytes()
        manifest = artifact.producer_inputs.parse_runtime_manifest(manifest_bytes)
        source_paths = [
            artifact.producer_inputs.MANIFEST_SOURCE_PATH,
            *(record.path for record in manifest.files),
            *artifact.producer_inputs.CATALOG_SOURCE_PATHS,
        ]
        blobs = [
            artifact.TrackedBlob(
                path=path,
                mode=artifact.producer_inputs.GIT_REGULAR_MODE,
                oid="0" * 40,
                content=(artifact.REPOSITORY_ROOT / path).read_bytes(),
            )
            for path in source_paths
        ]
        self.selected = artifact.producer_inputs.select_attested_producer_inputs(blobs)
        self.catalog_digest = f"sha256:{'a' * 64}"
        self.producer_metadata = artifact.producer_inputs.producer_metadata_bytes(
            self.selected,
            self.catalog_digest,
        )
        self.producer_metadata_digest = artifact.producer_inputs.sha256_bytes(
            self.producer_metadata
        )
        self.producer_files = {
            **{
                selected.embedded_path: selected.content
                for selected in self.selected.embedded_files
            },
            artifact.producer_inputs.MANIFEST_EMBEDDED_PATH: (self.selected.manifest_bytes),
            artifact.producer_inputs.PRODUCER_METADATA_PATH: (self.producer_metadata),
        }
        self.producer_directories = artifact.producer_inputs.expected_producer_directories(
            sorted(self.producer_files)
        )
        self.runtime_packages = [
            {"name": artifact.PACKAGE_NAME, "version": artifact.PACKAGE_VERSION},
            {"name": "jsonschema", "version": "4.26.0"},
        ]
        self.image_reference = f"localhost/bgmss-updater-artifact:{'d' * 40}-arm64"

    def _bundle_metadata(self) -> bytes:
        return artifact.canonical_json(
            {
                "component": artifact.COMPONENT_ID,
                "package": {
                    "name": artifact.PACKAGE_NAME,
                    "version": artifact.PACKAGE_VERSION,
                },
                "producerInputs": {
                    "path": (
                        f"{artifact.producer_inputs.NATIVE_PRODUCER_ROOT}/"
                        f"{artifact.producer_inputs.PRODUCER_METADATA_PATH}"
                    ),
                    "sha256": self.producer_metadata_digest,
                },
                "python": artifact.PYTHON_VERSION,
                "runtimePackages": self.runtime_packages,
                "schemaVersion": "bgmss-updater-runtime-bundle-v2",
                "target": {"architecture": "arm64", "os": "linux"},
            }
        )

    def _make_native_bundle(
        self,
        destination: Path,
        *,
        mutation: str | None,
    ) -> None:
        destination.parent.mkdir(parents=True, exist_ok=True)
        selected_path = sorted(self.producer_files)[0]
        with tarfile.open(destination, "w:gz", format=tarfile.PAX_FORMAT) as archive:
            directories = {
                "updater-runtime",
                *(
                    (
                        "updater-runtime/producer"
                        if not relative
                        else f"updater-runtime/producer/{relative}"
                    )
                    for relative in self.producer_directories
                ),
            }
            for name in sorted(directories):
                info = tarfile.TarInfo(name)
                info.type = tarfile.DIRTYPE
                info.mode = (
                    0o755
                    if name == "updater-runtime"
                    else (0o755 if mutation == "directory-mode" else 0o555)
                )
                info.uid = 0
                info.gid = 0
                archive.addfile(info)
            metadata = self._bundle_metadata()
            metadata_info = tarfile.TarInfo("updater-runtime/bundle-metadata.json")
            metadata_info.mode = 0o644
            metadata_info.uid = 0
            metadata_info.gid = 0
            metadata_info.size = len(metadata)
            archive.addfile(metadata_info, io.BytesIO(metadata))
            for path, original in sorted(self.producer_files.items()):
                content = b"tampered" if mutation == "bytes" and path == selected_path else original
                name = f"updater-runtime/producer/{path}"
                info = tarfile.TarInfo(name)
                info.uid = 0
                info.gid = 0
                if mutation == "type" and path == selected_path:
                    info.type = tarfile.SYMTYPE
                    info.linkname = "elsewhere"
                    info.mode = 0o444
                    archive.addfile(info)
                    continue
                info.mode = 0o644 if mutation == "file-mode" and path == selected_path else 0o444
                info.size = len(content)
                archive.addfile(info, io.BytesIO(content))
            if mutation == "extra-path":
                content = b"extra"
                info = tarfile.TarInfo("updater-runtime/producer/extra.txt")
                info.mode = 0o444
                info.uid = 0
                info.gid = 0
                info.size = len(content)
                archive.addfile(info, io.BytesIO(content))

    def _layer_bytes(
        self,
        *,
        mutation: str | None,
    ) -> tuple[bytes, bytes]:
        selected_path = sorted(self.producer_files)[0]
        real_buildkit_copy_shape = mutation in {
            "buildkit-copy-root-mode",
            "buildkit-producer-only-chmod",
            "buildkit-runtime-chmod",
        }
        raw = io.BytesIO()
        with tarfile.open(
            fileobj=raw,
            mode="w",
            format=tarfile.PAX_FORMAT,
        ) as archive:
            for name, mode, uid, gid in (
                ("opt", 0o755, 0, 0),
                (
                    "opt/bgmss",
                    0o755 if real_buildkit_copy_shape else 0o555,
                    65532,
                    65532,
                ),
            ):
                info = tarfile.TarInfo(name)
                info.type = tarfile.DIRTYPE
                info.mode = mode
                info.uid = uid
                info.gid = gid
                archive.addfile(info)
            for relative in sorted(
                self.producer_directories,
                key=lambda value: (value.count("/"), value),
            ):
                name = "opt/bgmss/producer"
                if relative:
                    name = f"{name}/{relative}"
                info = tarfile.TarInfo(name)
                info.type = tarfile.DIRTYPE
                info.mode = (
                    0o755
                    if mutation == "directory-mode" or (real_buildkit_copy_shape and not relative)
                    else 0o555
                )
                info.uid = 65532
                info.gid = 65532
                archive.addfile(info)
            for path, original in sorted(self.producer_files.items()):
                content = b"tampered" if mutation == "bytes" and path == selected_path else original
                info = tarfile.TarInfo(f"opt/bgmss/producer/{path}")
                info.uid = 65532
                info.gid = 65532
                if mutation == "type" and path == selected_path:
                    info.type = tarfile.SYMTYPE
                    info.linkname = "elsewhere"
                    info.mode = 0o444
                    archive.addfile(info)
                    continue
                info.mode = 0o644 if mutation == "file-mode" and path == selected_path else 0o444
                info.size = len(content)
                archive.addfile(info, io.BytesIO(content))
            if mutation == "extra-path":
                content = b"extra"
                info = tarfile.TarInfo("opt/bgmss/producer/extra.txt")
                info.mode = 0o444
                info.uid = 65532
                info.gid = 65532
                info.size = len(content)
                archive.addfile(info, io.BytesIO(content))
        raw_bytes = raw.getvalue()
        return raw_bytes, gzip.compress(raw_bytes, compresslevel=9, mtime=0)

    @staticmethod
    def _runtime_directory_mode_layer_bytes(
        *,
        include_parent: bool,
    ) -> tuple[bytes, bytes]:
        raw = io.BytesIO()
        with tarfile.open(
            fileobj=raw,
            mode="w",
            format=tarfile.PAX_FORMAT,
        ) as archive:
            names = (
                ("opt/bgmss", "opt/bgmss/producer") if include_parent else ("opt/bgmss/producer",)
            )
            for name in names:
                info = tarfile.TarInfo(name)
                info.type = tarfile.DIRTYPE
                info.mode = 0o555
                info.uid = 65532
                info.gid = 65532
                archive.addfile(info)
        raw_bytes = raw.getvalue()
        return raw_bytes, gzip.compress(raw_bytes, compresslevel=9, mtime=0)

    def _make_oci_image(
        self,
        destination: Path,
        *,
        mutation: str | None,
    ) -> dict[str, object]:
        raw_layer, layer = self._layer_bytes(mutation=mutation)
        layer_values = [(raw_layer, layer)]
        if mutation in {"buildkit-producer-only-chmod", "buildkit-runtime-chmod"}:
            layer_values.append(
                self._runtime_directory_mode_layer_bytes(
                    include_parent=mutation == "buildkit-runtime-chmod",
                )
            )
        layer_digests = [
            artifact.producer_inputs.sha256_bytes(compressed) for _raw, compressed in layer_values
        ]
        labels = {
            artifact.producer_inputs.PRODUCER_INPUTS_LABEL: (self.selected.manifest_digest),
            artifact.producer_inputs.CATALOG_CONFIG_LABEL: self.catalog_digest,
            artifact.producer_inputs.COMMON_COMMIT_LABEL: self.selected.common_commit,
        }
        if mutation == "label":
            labels[artifact.producer_inputs.CATALOG_CONFIG_LABEL] = f"sha256:{'b' * 64}"
        if mutation == "extra-label":
            labels["org.bangumi-staff-stats.unexpected"] = "value"
        config = artifact.canonical_json(
            {
                "architecture": "arm64",
                "config": {
                    "Entrypoint": [
                        "/usr/local/bin/python",
                        "-m",
                        "bangumi_staff_stats_updater",
                    ],
                    "Labels": labels,
                    "User": "65532:65532",
                },
                "os": "linux",
                "rootfs": {
                    "diff_ids": [
                        artifact.producer_inputs.sha256_bytes(raw)
                        for raw, _compressed in layer_values
                    ],
                    "type": "layers",
                },
            }
        )
        config_digest = artifact.producer_inputs.sha256_bytes(config)
        config_media_type = artifact.OCI_CONFIG_MEDIA_TYPE
        layer_media_type = artifact.OCI_LAYER_MEDIA_TYPE
        manifest_media_type = artifact.OCI_MANIFEST_MEDIA_TYPE
        layer_descriptors = [
            {
                "digest": digest,
                "mediaType": (
                    "application/vnd.docker.image.rootfs.diff.tar.gzip"
                    if mutation == "layer-media"
                    else layer_media_type
                ),
                "size": len(compressed),
            }
            for digest, (_raw, compressed) in zip(
                layer_digests,
                layer_values,
                strict=True,
            )
        ]
        manifest = artifact.canonical_json(
            {
                "config": {
                    "digest": config_digest,
                    "mediaType": (
                        "application/vnd.docker.container.image.v1+json"
                        if mutation == "config-media"
                        else config_media_type
                    ),
                    "size": len(config),
                },
                "layers": layer_descriptors,
                "mediaType": (
                    "application/vnd.docker.distribution.manifest.v2+json"
                    if mutation == "manifest-media"
                    else manifest_media_type
                ),
                "schemaVersion": 2,
            }
        )
        manifest_digest = artifact.producer_inputs.sha256_bytes(manifest)
        index = artifact.canonical_json(
            {
                "mediaType": artifact.OCI_INDEX_MEDIA_TYPE,
                "manifests": [
                    {
                        "annotations": {
                            "io.containerd.image.name": self.image_reference,
                            "org.opencontainers.image.ref.name": (
                                self.image_reference.rsplit(":", 1)[1]
                            ),
                        },
                        "digest": manifest_digest,
                        "mediaType": (
                            "application/vnd.docker.distribution.manifest.v2+json"
                            if mutation == "index-media"
                            else manifest_media_type
                        ),
                        "platform": {
                            "architecture": ("amd64" if mutation == "target" else "arm64"),
                            "os": "linux",
                        },
                        "size": len(manifest),
                    }
                ],
                "schemaVersion": 2,
            }
        )
        layout = self.root / f"oci-layout-{mutation or 'valid'}"
        artifact._clear_generated_directory(layout)
        (layout / "blobs" / "sha256").mkdir(parents=True)
        (layout / "index.json").write_bytes(index)
        (layout / "oci-layout").write_bytes(
            artifact.canonical_json({"imageLayoutVersion": "1.0.0"})
        )
        for digest, value in (
            (config_digest, config),
            (manifest_digest, manifest),
        ):
            (layout / "blobs" / "sha256" / digest[7:]).write_bytes(value)
        for digest, (_raw, compressed) in zip(
            layer_digests,
            layer_values,
            strict=True,
        ):
            (layout / "blobs" / "sha256" / digest[7:]).write_bytes(compressed)
        compatibility: dict[str, object] = {
            "Config": f"blobs/sha256/{config_digest[7:]}",
            "RepoTags": [self.image_reference],
            "Layers": [f"blobs/sha256/{digest[7:]}" for digest in layer_digests],
        }
        if mutation == "compat-tag":
            compatibility["RepoTags"] = ["localhost/bgmss-updater-artifact:wrong"]
        if mutation == "compat-config":
            compatibility["Config"] = f"blobs/sha256/{'f' * 64}"
        if mutation == "compat-layers":
            compatibility["Layers"] = [f"blobs/sha256/{'f' * 64}"]
        if mutation == "compat-field":
            compatibility["Unexpected"] = "forbidden"
        compatibility_records = (
            [compatibility, compatibility] if mutation == "compat-record" else [compatibility]
        )
        (layout / "manifest.json").write_bytes(
            json.dumps(
                compatibility_records,
                allow_nan=False,
                ensure_ascii=False,
                separators=(None if mutation == "compat-noncanonical" else (",", ":")),
            ).encode()
        )
        if mutation == "orphan":
            (layout / "blobs" / "sha256" / ("f" * 64)).write_bytes(b"orphan")
        artifact._write_normalized_image_archive(
            layout,
            destination,
            epoch=1_700_000_000,
        )
        return {
            "compatibility": compatibility,
            "config": {
                "digest": config_digest,
                "mediaType": (
                    "application/vnd.docker.container.image.v1+json"
                    if mutation == "config-media"
                    else config_media_type
                ),
                "size": len(config),
            },
            "layers": layer_descriptors,
            "manifest": {
                "digest": manifest_digest,
                "mediaType": (
                    "application/vnd.docker.distribution.manifest.v2+json"
                    if mutation in {"index-media", "manifest-media"}
                    else manifest_media_type
                ),
                "size": len(manifest),
            },
            "reference": self.image_reference,
        }

    @staticmethod
    def _raw_exporter_entries(
        layout: Path,
    ) -> list[tuple[tarfile.TarInfo, bytes]]:
        entries: list[tuple[tarfile.TarInfo, bytes]] = []
        for name in ("blobs/", "blobs/sha256/"):
            information = tarfile.TarInfo(name)
            information.type = tarfile.DIRTYPE
            information.mode = 0o755
            entries.append((information, b""))
        for path in sorted(value for value in layout.rglob("*") if value.is_file()):
            name = path.relative_to(layout).as_posix()
            content = path.read_bytes()
            information = tarfile.TarInfo(name)
            information.mode = 0o600
            information.size = len(content)
            entries.append((information, content))
        return entries

    @staticmethod
    def _clone_tar_entry(
        entry: tuple[tarfile.TarInfo, bytes],
    ) -> tuple[tarfile.TarInfo, bytes]:
        original, content = entry
        information = tarfile.TarInfo(original.name)
        information.type = original.type
        information.mode = original.mode
        information.uid = original.uid
        information.gid = original.gid
        information.size = original.size
        information.linkname = original.linkname
        return information, content

    @staticmethod
    def _write_raw_exporter_archive(
        destination: Path,
        entries: list[tuple[tarfile.TarInfo, bytes]],
        *,
        trailing: bytes = b"",
    ) -> None:
        with destination.open("wb") as output:
            for information, content in entries:
                output.write(information.tobuf(format=tarfile.USTAR_FORMAT))
                output.write(content)
                output.write(bytes((-len(content)) % tarfile.BLOCKSIZE))
            output.write(bytes(2 * tarfile.BLOCKSIZE))
            output.write(trailing)

    def _make_raw_exporter_archive(
        self,
        *,
        mutation: str | None = None,
    ) -> tuple[Path, dict[str, object]]:
        normalized = self.root / f"normalized-{mutation or 'valid'}.oci.tar"
        metadata = self._make_oci_image(normalized, mutation=None)
        layout = self.root / "oci-layout-valid"
        entries = self._raw_exporter_entries(layout)
        file_index = next(
            index
            for index, (information, _content) in enumerate(entries)
            if information.name == "manifest.json"
        )
        if mutation in {"absolute", "dot-dot", "dot", "double-slash"}:
            names = {
                "absolute": "/manifest.json",
                "dot-dot": "../manifest.json",
                "dot": "./manifest.json",
                "double-slash": "blobs//sha256/",
            }
            entries[file_index][0].name = names[mutation]
        elif mutation == "duplicate":
            entries.append(self._clone_tar_entry(entries[file_index]))
        elif mutation == "symlink":
            entries[file_index][0].type = tarfile.SYMTYPE
            entries[file_index][0].linkname = "index.json"
            entries[file_index][0].size = 0
            entries[file_index] = (entries[file_index][0], b"")
        elif mutation == "hardlink":
            entries[file_index][0].type = tarfile.LNKTYPE
            entries[file_index][0].linkname = "index.json"
            entries[file_index][0].size = 0
            entries[file_index] = (entries[file_index][0], b"")
        elif mutation in {"pax", "xattr"}:
            entries[file_index][0].type = tarfile.XHDTYPE
            if mutation == "xattr":
                content = b"30 SCHILY.xattr.user.test=value\n"
                entries[file_index][0].size = len(content)
                entries[file_index] = (entries[file_index][0], content)
        elif mutation == "sparse":
            entries[file_index][0].type = tarfile.GNUTYPE_SPARSE
        elif mutation == "special":
            entries[file_index][0].type = tarfile.FIFOTYPE
            entries[file_index][0].size = 0
            entries[file_index] = (entries[file_index][0], b"")
        elif mutation == "extra":
            information = tarfile.TarInfo("unexpected")
            information.size = 5
            entries.append((information, b"extra"))
        elif mutation == "missing":
            entries.pop(file_index)
        archive_path = self.root / f"raw-exporter-{mutation or 'valid'}.tar"
        self._write_raw_exporter_archive(
            archive_path,
            entries,
            trailing=b"trailing" if mutation == "trailing" else b"",
        )
        return archive_path, metadata

    @staticmethod
    def _record(path: Path, output: Path) -> dict[str, object]:
        return {
            "path": path.relative_to(output).as_posix(),
            "sha256": artifact.sha256_file(path),
            "size": path.stat().st_size,
        }

    def _make_output(
        self,
        *,
        native_mutation: str | None = None,
        oci_mutation: str | None = None,
        metadata_mutation: str | None = None,
        include_image: bool = True,
    ) -> Path:
        output = self.root / (
            f"output-{native_mutation}-{oci_mutation}-{metadata_mutation}-{include_image}"
        )
        artifacts = output / "artifacts"
        artifacts.mkdir(parents=True)
        bundle = artifacts / "updater-runtime-0.1.0-linux-arm64.tar.gz"
        self._make_native_bundle(bundle, mutation=native_mutation)
        wheel = artifacts / "bangumi_staff_stats_updater-0.1.0-py3-none-any.whl"
        wheel.write_bytes(b"synthetic wheel")
        image: Path | None = None
        oci_metadata: dict[str, object] | None = None
        if include_image:
            image = artifacts / "updater-image-linux-arm64.oci.tar"
            oci_metadata = self._make_oci_image(
                image,
                mutation=oci_mutation,
            )
        producer_digest = self.producer_metadata_digest
        manifest_digest = self.selected.manifest_digest
        if metadata_mutation == "producer-digest":
            producer_digest = f"sha256:{'b' * 64}"
        if metadata_mutation == "manifest-digest":
            manifest_digest = f"sha256:{'b' * 64}"
        metadata: dict[str, object] = {
            "artifacts": {
                "bundle": self._record(bundle, output),
                "image": (
                    {**self._record(image, output), "oci": oci_metadata}
                    if image is not None
                    else None
                ),
                "wheel": self._record(wheel, output),
            },
            "buildDefinitionSha256": "a" * 64,
            "component": artifact.COMPONENT_ID,
            "inputs": {
                "producerInputsSha256": producer_digest,
                "producerRuntimeInputsManifestSha256": manifest_digest,
                "sourceSnapshotSha256": "b" * 64,
                "uvLockSha256": "c" * 64,
            },
            "producerInputs": {
                "bundlePath": (
                    f"{artifact.producer_inputs.NATIVE_PRODUCER_ROOT}/"
                    f"{artifact.producer_inputs.PRODUCER_METADATA_PATH}"
                ),
                "imagePath": (
                    f"{artifact.producer_inputs.OCI_PRODUCER_ROOT}/"
                    f"{artifact.producer_inputs.PRODUCER_METADATA_PATH}"
                ),
                "sha256": producer_digest,
            },
            "runtimePackages": self.runtime_packages,
            "schemaVersion": "bgmss-updater-build-metadata-v2",
            "sbomPackageCount": 3,
            "source": {"revision": "d" * 40, "tree": "e" * 40},
            "target": {"architecture": "arm64", "os": "linux"},
            "toolchain": {},
        }
        (artifacts / "build-metadata.json").write_bytes(artifact.canonical_json(metadata))
        return output

    def _add_evidence(self, output: Path) -> None:
        artifacts = output / "artifacts"
        checksum, inventory = artifact.make_checksum_inventory(artifacts)
        (output / "SHA256SUMS").write_bytes(checksum)
        bundle = artifacts / "updater-runtime-0.1.0-linux-arm64.tar.gz"
        (output / "sbom.spdx.json").write_bytes(
            artifact.canonical_json(
                artifact.make_spdx(
                    artifacts=inventory,
                    dependency_artifact_path=("artifacts/updater-runtime-0.1.0-linux-arm64.tar.gz"),
                    runtime_packages=self.runtime_packages,
                    lock_path=artifact.UPDATER_ROOT / "uv.lock",
                    namespace_digest=artifact.sha256_file(bundle),
                )
            )
        )

    def test_native_and_oci_producer_trees_verify_offline(self) -> None:
        output = self._make_output()
        _metadata, evidence = artifact._verify_producer_artifacts(output)
        self.assertEqual(
            evidence.metadata_digest,
            self.producer_metadata_digest,
        )
        self.assertEqual(evidence.manifest_digest, self.selected.manifest_digest)
        self._add_evidence(output)
        artifact.verify_output(output, require_statement=False)

    def test_real_buildkit_copy_requires_parent_and_root_runtime_chmod_layer(
        self,
    ) -> None:
        copy_only = self._make_output(oci_mutation="buildkit-copy-root-mode")
        with self.assertRaisesRegex(
            artifact.BuildError,
            "OCI producer",
        ):
            artifact._verify_producer_artifacts(copy_only)

        producer_only = self._make_output(
            oci_mutation="buildkit-producer-only-chmod",
        )
        with self.assertRaisesRegex(
            artifact.BuildError,
            "OCI producer parent directory is not read-only",
        ):
            artifact._verify_producer_artifacts(producer_only)

        repaired = self._make_output(oci_mutation="buildkit-runtime-chmod")
        artifact._verify_producer_artifacts(repaired)
        image = repaired / "artifacts" / "updater-image-linux-arm64.oci.tar"
        graph = artifact._inspect_oci_graph(
            artifact._oci_layout_files(image),
            reference=self.image_reference,
            target=artifact.Target.parse("linux/arm64"),
        )
        self.assertEqual(len(graph.layers), 2)

        with tarfile.open(
            fileobj=io.BytesIO(graph.layers[0][1]),
            mode="r:*",
        ) as archive:
            copy_entries = [
                (
                    member.name,
                    member.type,
                    member.mode & 0o7777,
                    member.uid,
                    member.gid,
                )
                for member in archive.getmembers()[:3]
            ]
        self.assertEqual(
            copy_entries,
            [
                ("opt", tarfile.DIRTYPE, 0o755, 0, 0),
                ("opt/bgmss", tarfile.DIRTYPE, 0o755, 65532, 65532),
                (
                    "opt/bgmss/producer",
                    tarfile.DIRTYPE,
                    0o755,
                    65532,
                    65532,
                ),
            ],
        )
        with tarfile.open(
            fileobj=io.BytesIO(graph.layers[1][1]),
            mode="r:*",
        ) as archive:
            mode_entries = [
                (
                    member.name,
                    member.type,
                    member.mode & 0o7777,
                    member.uid,
                    member.gid,
                )
                for member in archive.getmembers()
            ]
        self.assertEqual(
            mode_entries,
            [
                (
                    "opt/bgmss",
                    tarfile.DIRTYPE,
                    0o555,
                    65532,
                    65532,
                ),
                (
                    "opt/bgmss/producer",
                    tarfile.DIRTYPE,
                    0o555,
                    65532,
                    65532,
                ),
            ],
        )
        state: dict[str, tuple[str, int, int, int, bytes | None]] = {}
        parent_state: dict[str, tuple[str, int, int, int, bytes | None]] = {}
        for _descriptor, layer_bytes in graph.layers:
            artifact._apply_oci_layer(state, layer_bytes)
            artifact._apply_oci_layer(
                parent_state,
                layer_bytes,
                target="opt/bgmss",
            )
        self.assertEqual(
            state[""],
            ("directory", 0o555, 65532, 65532, None),
        )
        self.assertEqual(
            parent_state[""],
            ("directory", 0o555, 65532, 65532, None),
        )

    def test_pinned_docker_exporter_shape_admits_normalizes_and_verifies(self) -> None:
        raw_archive, expected_metadata = self._make_raw_exporter_archive()
        admitted = self.root / "admitted-exporter"
        artifact._admit_docker_exporter_archive(raw_archive, admitted)
        actual_metadata = artifact._parse_oci_metadata(
            admitted,
            reference=self.image_reference,
            target=artifact.Target.parse("linux/arm64"),
        )
        self.assertEqual(actual_metadata, expected_metadata)
        normalized = self.root / "round-trip.oci.tar"
        artifact._write_normalized_image_archive(
            admitted,
            normalized,
            epoch=1_700_000_000,
        )
        graph = artifact._inspect_oci_graph(
            artifact._oci_layout_files(normalized),
            reference=self.image_reference,
            target=artifact.Target.parse("linux/arm64"),
        )
        self.assertEqual(graph.metadata, expected_metadata)

    def test_exporter_admission_rejects_unsafe_and_unsupported_members(self) -> None:
        for mutation in (
            "absolute",
            "dot-dot",
            "dot",
            "double-slash",
            "duplicate",
            "symlink",
            "hardlink",
            "pax",
            "xattr",
            "sparse",
            "special",
            "extra",
            "missing",
            "trailing",
        ):
            with self.subTest(mutation=mutation):
                raw_archive, _metadata = self._make_raw_exporter_archive(mutation=mutation)
                with self.assertRaises(artifact.BuildError):
                    artifact._admit_docker_exporter_archive(
                        raw_archive,
                        self.root / f"rejected-{mutation}",
                    )

    def test_exporter_admission_enforces_archive_member_and_count_bounds(self) -> None:
        raw_archive, _metadata = self._make_raw_exporter_archive()
        with (
            patch.object(
                artifact,
                "MAX_IMAGE_ARCHIVE_SIZE",
                raw_archive.stat().st_size - 1,
            ),
            self.assertRaisesRegex(artifact.BuildError, "bounded regular file"),
        ):
            artifact._admit_docker_exporter_archive(
                raw_archive,
                self.root / "archive-oversized",
            )
        with (
            patch.object(artifact, "MAX_IMAGE_MEMBER_SIZE", 1),
            self.assertRaisesRegex(artifact.BuildError, "oversized"),
        ):
            artifact._admit_docker_exporter_archive(
                raw_archive,
                self.root / "member-oversized",
            )
        with (
            patch.object(artifact, "MAX_IMAGE_MEMBERS", 1),
            self.assertRaisesRegex(artifact.BuildError, "more than"),
        ):
            artifact._admit_docker_exporter_archive(
                raw_archive,
                self.root / "too-many-members",
            )

    def test_native_rejects_tampered_type_mode_and_path(self) -> None:
        for mutation in ("bytes", "type", "file-mode", "directory-mode", "extra-path"):
            with self.subTest(mutation=mutation):
                output = self._make_output(
                    native_mutation=mutation,
                    include_image=False,
                )
                with self.assertRaises(artifact.BuildError):
                    artifact._verify_producer_artifacts(output)

    def test_component_statement_must_bind_the_same_manifest(self) -> None:
        output = self._make_output(include_image=False)
        self._add_evidence(output)
        (output / "component-statement.json").write_bytes(artifact.canonical_json({"inputs": []}))
        with self.assertRaisesRegex(
            artifact.BuildError,
            "statement producer manifest input disagrees",
        ):
            artifact.verify_output(output, require_statement=True)

    def test_oci_rejects_tampered_tree_media_graph_and_compatibility(self) -> None:
        for mutation in (
            "bytes",
            "type",
            "file-mode",
            "directory-mode",
            "extra-path",
            "label",
            "extra-label",
            "orphan",
            "compat-tag",
            "compat-config",
            "compat-layers",
            "compat-field",
            "compat-record",
            "compat-noncanonical",
            "target",
            "index-media",
            "manifest-media",
            "config-media",
            "layer-media",
        ):
            with self.subTest(mutation=mutation):
                output = self._make_output(oci_mutation=mutation)
                with self.assertRaises(artifact.BuildError):
                    artifact._verify_producer_artifacts(output)

    def test_oci_layer_replay_preserves_directories_and_applies_whiteouts(self) -> None:
        raw_layer, _compressed = self._layer_bytes(mutation=None)
        state: dict[str, tuple[str, int, int, int, bytes | None]] = {}
        artifact._apply_oci_layer(state, raw_layer)
        initial = dict(state)

        directory_layer = io.BytesIO()
        with tarfile.open(fileobj=directory_layer, mode="w") as archive:
            info = tarfile.TarInfo("opt/bgmss/producer/contracts")
            info.type = tarfile.DIRTYPE
            info.mode = 0o555
            info.uid = 65532
            info.gid = 65532
            archive.addfile(info)
        artifact._apply_oci_layer(state, directory_layer.getvalue())
        self.assertEqual(state, initial)

        removed = artifact.producer_inputs.PRODUCER_METADATA_PATH
        parent = PurePosixPath(removed).parent.as_posix()
        filename = PurePosixPath(removed).name
        whiteout_layer = io.BytesIO()
        with tarfile.open(fileobj=whiteout_layer, mode="w") as archive:
            info = tarfile.TarInfo(f"opt/bgmss/producer/{parent}/.wh.{filename}")
            info.mode = 0o000
            info.size = 0
            archive.addfile(info, io.BytesIO())
        artifact._apply_oci_layer(state, whiteout_layer.getvalue())
        self.assertNotIn(removed, state)

    def test_outer_input_digests_are_fail_closed(self) -> None:
        for mutation in ("producer-digest", "manifest-digest"):
            with self.subTest(mutation=mutation):
                output = self._make_output(
                    metadata_mutation=mutation,
                    include_image=False,
                )
                with self.assertRaises(artifact.BuildError):
                    artifact._verify_producer_artifacts(output)


class ContractsStatementTests(GeneratedDirectoryTestCase):
    @unittest.skipUnless(shutil.which("node"), "Node.js is required for Contracts validation")
    def test_emitted_statement_passes_the_frozen_contracts_validator(self) -> None:
        stage = self.root / "statement-output"
        artifacts = stage / "artifacts"
        artifacts.mkdir(parents=True)
        artifact_values = {
            "bangumi_staff_stats_updater-0.1.0-py3-none-any.whl": b"wheel fixture\n",
            "build-metadata.json": b"metadata fixture\n",
            "updater-image-linux-arm64.oci.tar": b"oci fixture\n",
            "updater-runtime-0.1.0-linux-arm64.tar.gz": b"bundle fixture\n",
        }
        for name, value in artifact_values.items():
            (artifacts / name).write_bytes(value)
        bundle = artifacts / "updater-runtime-0.1.0-linux-arm64.tar.gz"
        checksum_bytes, inventory = artifact.make_checksum_inventory(artifacts)
        (stage / "SHA256SUMS").write_bytes(checksum_bytes)
        runtime_packages = [
            {"name": artifact.PACKAGE_NAME, "version": artifact.PACKAGE_VERSION},
            {"name": "jsonschema", "version": "4.26.0"},
        ]
        (stage / "sbom.spdx.json").write_bytes(
            artifact.canonical_json(
                artifact.make_spdx(
                    artifacts=inventory,
                    dependency_artifact_path=("artifacts/updater-runtime-0.1.0-linux-arm64.tar.gz"),
                    runtime_packages=runtime_packages,
                    lock_path=artifact.UPDATER_ROOT / "uv.lock",
                    namespace_digest=artifact.sha256_file(bundle),
                )
            )
        )
        metadata: dict[str, Any] = {
            "artifacts": {
                "bundle": {
                    "path": "artifacts/updater-runtime-0.1.0-linux-arm64.tar.gz",
                    "sha256": artifact.sha256_file(bundle),
                    "size": bundle.stat().st_size,
                }
            },
            "buildDefinitionSha256": "a" * 64,
            "component": "updater",
            "inputs": {
                "producerRuntimeInputsManifestSha256": (
                    artifact.producer_inputs.EXPECTED_MANIFEST_DIGEST
                ),
                "sourceSnapshotSha256": "b" * 64,
                "uvLockSha256": "c" * 64,
            },
            "runtimePackages": runtime_packages,
            "sbomPackageCount": len(inventory) + len(runtime_packages) - 1,
            "toolchain": {
                "buildkit": artifact.BUILDKIT_VERSION,
                "buildkitImage": artifact.BUILDKIT_IMAGE,
                "dockerBuildx": artifact.DOCKER_BUILDX_VERSION,
                "python": artifact.PYTHON_VERSION,
                "pythonBaseImage": artifact.PYTHON_IMAGE,
                "uv": artifact.UV_VERSION,
                "uvBaseImage": artifact.UV_IMAGE,
            },
        }
        artifact._emit_contract_statement(
            stage=stage,
            identity=artifact.SourceIdentity("d" * 40, "e" * 40, 1_700_000_000),
            target=artifact.Target.parse("linux/arm64"),
            inventory=inventory,
            metadata=metadata,
            contracts_root=artifact.REPOSITORY_ROOT / "contracts",
        )
        artifact.validate_contract_output(stage, artifact.REPOSITORY_ROOT / "contracts")


class DockerfileTests(unittest.TestCase):
    def test_dockerfile_has_reviewed_pins_and_one_shot_runtime_shape(self) -> None:
        artifact.verify_dockerfile()

    def test_dockerfile_has_no_unpinned_from_or_forbidden_operation(self) -> None:
        value = (artifact.UPDATER_ROOT / "Dockerfile").read_text(encoding="utf-8")
        from_lines = [line for line in value.splitlines() if line.startswith("FROM ")]
        self.assertEqual(
            from_lines,
            [
                f"FROM {artifact.UV_IMAGE} AS uv-bin",
                f"FROM {artifact.PYTHON_IMAGE} AS builder",
                f"FROM {artifact.PYTHON_IMAGE} AS runtime",
            ],
        )
        lowered = value.lower()
        self.assertIn("PATH=/usr/local/bin:/usr/bin:/bin", value)
        self.assertIn("runtime_prune.py /opt/runtime", value)
        producer_copy = (
            "COPY --from=builder --chown=65532:65532 /opt/bgmss/producer /opt/bgmss/producer"
        )
        producer_modes = "chmod 0555 /opt/bgmss /opt/bgmss/producer"
        parent_identity = 'test "$(stat -c \'%a:%u:%g\' /opt/bgmss)" = "555:65532:65532"'
        root_identity = 'test "$(stat -c \'%a:%u:%g\' /opt/bgmss/producer)" = "555:65532:65532"'
        self.assertLess(
            value.index(producer_copy),
            value.index(producer_modes),
        )
        self.assertLess(
            value.index(producer_modes),
            value.index(parent_identity),
        )
        self.assertLess(
            value.index(parent_identity),
            value.index(root_identity),
        )
        self.assertLess(
            value.index(root_identity),
            value.index("USER 65532:65532"),
        )
        for label in artifact.producer_inputs.PRODUCER_LABELS:
            self.assertEqual(value.count(label), 1)
        for forbidden in (
            "docker push",
            "registry login",
            "current.json",
            "update_activated",
            "systemd",
            "crond",
        ):
            with self.subTest(forbidden=forbidden):
                self.assertNotIn(forbidden, lowered)

    def test_docker_exporter_command_is_single_platform_pinned_and_explicit(self) -> None:
        identity = artifact.SourceIdentity(
            revision="d" * 40,
            tree="e" * 40,
            epoch=1_700_000_000,
        )
        target = artifact.Target.parse("linux/arm64")
        reference = artifact._declared_image_reference(identity, target)
        raw_archive = Path("/tmp/raw-image.docker.tar")  # noqa: S108
        command = artifact._docker_export_command(
            context=Path("/tmp/context"),  # noqa: S108
            raw_archive=raw_archive,
            target=target,
            identity=identity,
            docker=Path("/usr/local/bin/docker"),
            builder="bgmss-artifacts-v0271",
            image_reference=reference,
            producer_contracts={"manifestSha256": f"sha256:{'a' * 64}"},
            producer_catalog={"catalogConfigDigest": f"sha256:{'b' * 64}"},
            common_commit="c" * 40,
        )
        self.assertEqual(command.count("--platform"), 1)
        self.assertEqual(command[command.index("--platform") + 1], "linux/arm64")
        self.assertIn("--provenance=false", command)
        self.assertIn("--sbom=false", command)
        self.assertEqual(
            command[command.index("--output") + 1],
            (
                f"type=docker,dest={raw_archive},tar=true,oci-mediatypes=true,"
                f"rewrite-timestamp=true,name={reference}"
            ),
        )
        self.assertFalse(any("type=oci" in argument for argument in command))

    def test_buildx_inspection_requires_current_pinned_builder_and_driver_image(self) -> None:
        builder = "ci-builder-42"
        inspection = f"""
Name:          {builder}
Driver:        docker-container

Nodes:
Name:                  {builder}0
Endpoint:              colima
Driver Options:        image="{artifact.BUILDKIT_IMAGE}"
Status:                running
BuildKit version:      v{artifact.BUILDKIT_VERSION}
""".lstrip()
        self.assertEqual(
            artifact._validate_buildx_inspection(inspection, builder=None),
            builder,
        )
        self.assertEqual(
            artifact._validate_buildx_inspection(inspection, builder=builder),
            builder,
        )
        for changed in (
            inspection.replace(artifact.BUILDKIT_IMAGE, "docker.io/moby/buildkit:latest"),
            inspection.replace(
                f"v{artifact.BUILDKIT_VERSION}",
                "v0.26.0",
            ),
            inspection.replace(
                f"Name:          {builder}",
                "Name:          another-builder",
                1,
            ),
        ):
            with self.subTest(changed=changed), self.assertRaises(artifact.BuildError):
                artifact._validate_buildx_inspection(
                    changed,
                    builder=builder,
                )
        for unsafe in ("", "--builder", "-bad", "has space", "slash/name"):
            with (
                self.subTest(unsafe=unsafe),
                self.assertRaisesRegex(
                    artifact.BuildError,
                    "safe non-option token",
                ),
            ):
                artifact._validated_builder_name(unsafe)


class SmokePolicyTests(GeneratedDirectoryTestCase):
    def test_runtime_package_information_is_sorted_complete_and_strict(self) -> None:
        packages = [
            {"name": artifact.PACKAGE_NAME, "version": artifact.PACKAGE_VERSION},
            {"name": "jsonschema", "version": "4.26.0"},
        ]
        self.assertEqual(
            smoke._runtime_package_information({"runtimePackages": packages}),
            packages,
        )
        with self.assertRaisesRegex(artifact.BuildError, "incomplete"):
            smoke._runtime_package_information({"runtimePackages": list(reversed(packages))})

    def test_image_metadata_path_and_reference_are_strict(self) -> None:
        config_id = f"sha256:{'a' * 64}"
        manifest_id = f"sha256:{'b' * 64}"
        metadata: dict[str, Any] = {
            "artifacts": {
                "image": {
                    "oci": {
                        "config": {"digest": config_id},
                        "manifest": {"digest": manifest_id},
                        "reference": (f"localhost/bgmss-updater-artifact:{'d' * 40}-arm64"),
                    },
                    "path": "artifacts/updater-image-linux-arm64.oci.tar",
                }
            }
        }
        reference, path, image_ids = smoke._image_information(metadata)
        self.assertEqual(
            reference,
            f"localhost/bgmss-updater-artifact:{'d' * 40}-arm64",
        )
        self.assertEqual(path.as_posix(), "artifacts/updater-image-linux-arm64.oci.tar")
        self.assertEqual(image_ids, (config_id, manifest_id))
        metadata["artifacts"]["image"]["path"] = "../escape"
        with self.assertRaisesRegex(artifact.BuildError, "unsafe relative path"):
            smoke._image_information(metadata)

    def test_image_metadata_requires_distinct_config_and_manifest_digests(self) -> None:
        config_id = f"sha256:{'a' * 64}"
        metadata: dict[str, Any] = {
            "artifacts": {
                "image": {
                    "oci": {
                        "config": {"digest": config_id},
                        "manifest": {"digest": config_id},
                        "reference": "localhost/bgmss-updater-artifact:test",
                    },
                    "path": "artifacts/updater-image-linux-arm64.oci.tar",
                }
            }
        }
        with self.assertRaisesRegex(artifact.BuildError, "distinct config/manifest"):
            smoke._image_information(metadata)
        metadata["artifacts"]["image"]["oci"]["manifest"] = {"digest": "sha256:not-a-digest"}
        with self.assertRaisesRegex(artifact.BuildError, "distinct config/manifest"):
            smoke._image_information(metadata)
        del metadata["artifacts"]["image"]["oci"]["manifest"]
        with self.assertRaisesRegex(artifact.BuildError, "complete OCI image"):
            smoke._image_information(metadata)

    def test_runtime_smoke_is_networkless_read_only_and_non_root(self) -> None:
        owner_token = "a" * 32
        arguments = smoke._common_create_arguments(
            "updater:test",
            "updater-test-doctor",
            owner_token,
        )
        self.assertIn("updater-test-doctor", arguments)
        self.assertIn("none", arguments)
        self.assertIn("never", arguments)
        self.assertIn("--read-only", arguments)
        self.assertIn("no-new-privileges", arguments)
        self.assertIn("65532:65532", arguments)
        self.assertEqual(arguments[-1], "updater:test")
        self.assertEqual(arguments[:2], ["container", "create"])
        self.assertNotIn("--rm", arguments)
        self.assertNotIn("produce", arguments)
        label_index = arguments.index("--label")
        self.assertEqual(
            arguments[label_index + 1],
            f"{smoke.SMOKE_OWNER_LABEL}={owner_token}",
        )
        source = Path(smoke.__file__).read_text(encoding="utf-8")
        self.assertIn("benchmarks", source)
        self.assertIn("locate_file(file).is_file()", source)
        self.assertIn("/opt/bgmss/producer/contracts", source)
        self.assertIn("/opt/bgmss/producer/catalog/display-v1.yaml", source)
        self.assertIn("load_configuration", source)
        self.assertEqual(smoke.CATALOG_PROBE_PYTHON_FLAGS, ("-P", "-s"))
        self.assertIn("*CATALOG_PROBE_PYTHON_FLAGS", source)
        self.assertNotIn('"-I"', source)
        self.assertNotIn("--volume", source)
        self.assertNotIn(":/contracts", source)
        self.assertNotIn('"produce"', source)

    def test_preexisting_container_collision_is_not_removed(self) -> None:
        inspected = subprocess.CompletedProcess(
            ["docker"],
            0,
            stdout="[]",
            stderr="",
        )
        with (
            patch.object(smoke, "_run_docker", return_value=inspected) as run_docker,
            self.assertRaisesRegex(
                artifact.BuildError,
                "pre-existing smoke container",
            ),
        ):
            smoke._require_container_names_available(
                Path("docker"),
                ("planned-name",),
            )
        run_docker.assert_called_once_with(
            Path("docker"),
            ["container", "inspect", "planned-name"],
            check=False,
        )

    def test_foreign_collision_cleanup_is_refused(self) -> None:
        owner_token = "a" * 32
        expected_container_id = "e" * 64
        inspected = subprocess.CompletedProcess(
            ["docker"],
            0,
            stdout=json.dumps(
                [
                    {
                        "Config": {
                            "Labels": {
                                smoke.SMOKE_OWNER_LABEL: owner_token,
                            }
                        },
                        "Id": "f" * 64,
                        "Name": "/concurrent-foreign",
                    }
                ]
            ),
            stderr="",
        )
        with patch.object(smoke, "_run_docker", return_value=inspected) as run_docker:
            failure = smoke._cleanup_container(
                Path("docker"),
                "concurrent-foreign",
                owner_token,
                expected_container_id,
            )
        self.assertEqual(
            failure,
            "refusing to remove foreign smoke container: concurrent-foreign",
        )
        run_docker.assert_called_once_with(
            Path("docker"),
            ["container", "inspect", expected_container_id],
            check=False,
        )

    def test_renamed_owned_container_is_not_mistaken_for_a_missing_name(self) -> None:
        owner_token = "a" * 32
        container_id = "c" * 64
        inspected = subprocess.CompletedProcess(
            ["docker"],
            0,
            stdout=json.dumps(
                [
                    {
                        "Config": {
                            "Labels": {
                                smoke.SMOKE_OWNER_LABEL: owner_token,
                            }
                        },
                        "Id": container_id,
                        "Name": "/renamed-owned-container",
                    }
                ]
            ),
            stderr="",
        )
        with patch.object(smoke, "_run_docker", return_value=inspected) as run_docker:
            failure = smoke._cleanup_container(
                Path("docker"),
                "original-owned-container",
                owner_token,
                container_id,
            )
        self.assertEqual(
            failure,
            "refusing to remove foreign smoke container: original-owned-container",
        )
        run_docker.assert_called_once_with(
            Path("docker"),
            ["container", "inspect", container_id],
            check=False,
        )

    def test_missing_owned_id_preserves_a_reused_container_name(self) -> None:
        owner_token = "a" * 32
        container_id = "c" * 64
        missing = subprocess.CompletedProcess(
            ["docker"],
            1,
            stdout="",
            stderr=f"Error: No such container: {container_id}",
        )
        with patch.object(smoke, "_run_docker", return_value=missing) as run_docker:
            failure = smoke._cleanup_container(
                Path("docker"),
                "reused-container-name",
                owner_token,
                container_id,
            )
        self.assertIsNone(failure)
        run_docker.assert_called_once_with(
            Path("docker"),
            ["container", "inspect", container_id],
            check=False,
        )

    def test_owned_id_with_foreign_owner_is_not_removed(self) -> None:
        owner_token = "a" * 32
        container_id = "c" * 64
        inspected = subprocess.CompletedProcess(
            ["docker"],
            0,
            stdout=json.dumps(
                [
                    {
                        "Config": {
                            "Labels": {
                                smoke.SMOKE_OWNER_LABEL: "b" * 32,
                            }
                        },
                        "Id": container_id,
                        "Name": "/owned-container",
                    }
                ]
            ),
            stderr="",
        )
        with patch.object(smoke, "_run_docker", return_value=inspected) as run_docker:
            failure = smoke._cleanup_container(
                Path("docker"),
                "owned-container",
                owner_token,
                container_id,
            )
        self.assertEqual(
            failure,
            "refusing to remove foreign smoke container: owned-container",
        )
        run_docker.assert_called_once_with(
            Path("docker"),
            ["container", "inspect", container_id],
            check=False,
        )

    def test_owned_container_cleanup_removes_the_inspected_id(self) -> None:
        owner_token = "a" * 32
        container_id = "c" * 64
        inspected = subprocess.CompletedProcess(
            ["docker"],
            0,
            stdout=json.dumps(
                [
                    {
                        "Config": {
                            "Labels": {
                                smoke.SMOKE_OWNER_LABEL: owner_token,
                            }
                        },
                        "Id": container_id,
                        "Name": "/owned-container",
                    }
                ]
            ),
            stderr="",
        )
        removed = subprocess.CompletedProcess(
            ["docker"],
            0,
            stdout="",
            stderr="",
        )
        with patch.object(
            smoke,
            "_run_docker",
            side_effect=(inspected, removed),
        ) as run_docker:
            failure = smoke._cleanup_container(
                Path("docker"),
                "owned-container",
                owner_token,
                container_id,
            )
        self.assertIsNone(failure)
        self.assertEqual(run_docker.call_count, 2)
        self.assertEqual(
            run_docker.call_args_list[0].args,
            (
                Path("docker"),
                ["container", "inspect", container_id],
            ),
        )
        self.assertEqual(run_docker.call_args_list[0].kwargs, {"check": False})
        run_docker.assert_any_call(
            Path("docker"),
            ["container", "rm", "--force", container_id],
            check=False,
        )

    def test_container_execution_captures_id_before_starting_by_id(self) -> None:
        owner_token = "a" * 32
        container_id = "c" * 64
        created = subprocess.CompletedProcess(
            ["docker"],
            0,
            stdout=f"{container_id}\n",
            stderr="",
        )
        started = subprocess.CompletedProcess(
            ["docker"],
            0,
            stdout='{"status":"ok"}\n',
            stderr="",
        )
        owned: dict[str, str] = {}
        with patch.object(
            smoke,
            "_run_docker",
            side_effect=(created, started),
        ) as run_docker:
            result = smoke._run_container(
                Path("docker"),
                image=f"sha256:{'d' * 64}",
                container_name="owned-container",
                owner_token=owner_token,
                owned_container_ids=owned,
                command=("doctor",),
            )
        self.assertIs(result, started)
        self.assertEqual(owned, {"owned-container": container_id})
        create_arguments = run_docker.call_args_list[0].args[1]
        self.assertEqual(create_arguments[:2], ["container", "create"])
        self.assertEqual(create_arguments[-1], "doctor")
        self.assertIn(
            f"{smoke.SMOKE_OWNER_LABEL}={owner_token}",
            create_arguments,
        )
        run_docker.assert_any_call(
            Path("docker"),
            ["container", "start", "--attach", container_id],
            timeout_seconds=120,
        )

    def test_failed_load_side_effect_accepts_both_artifact_image_ids(self) -> None:
        image_reference = "localhost/bgmss-updater-artifact:test"
        image_ids = (
            f"sha256:{'a' * 64}",
            f"sha256:{'b' * 64}",
        )
        for image_id in image_ids:
            with self.subTest(image_id=image_id):
                inspected = subprocess.CompletedProcess(
                    ["docker"],
                    0,
                    stdout=json.dumps([{"Id": image_id}]),
                    stderr="",
                )
                removed = subprocess.CompletedProcess(
                    ["docker"],
                    0,
                    stdout="",
                    stderr="",
                )
                primary = artifact.BuildError("image load failed after daemon side effect")
                with (
                    patch.object(
                        smoke,
                        "_run_docker",
                        side_effect=(inspected, removed),
                    ) as run_docker,
                    self.assertRaises(artifact.BuildError) as caught,
                    smoke._cleanup_guard(
                        lambda: smoke._cleanup_smoke_resources(
                            docker=Path("docker"),
                            containers={},
                            owner_token="a" * 32,
                            image_reference=image_reference,
                            artifact_image_ids=image_ids,
                            image_load_attempted=True,
                            image_load_completed=False,
                            loaded_image_id=None,
                        )
                    ),
                ):
                    raise primary
                self.assertIs(caught.exception, primary)
                self.assertEqual(
                    run_docker.call_args_list[0].args,
                    (
                        Path("docker"),
                        ["image", "inspect", image_reference],
                    ),
                )
                run_docker.assert_any_call(
                    Path("docker"),
                    ["image", "rm", image_id],
                    check=False,
                )
                self.assertFalse(
                    any("--force" in call.args[1] for call in run_docker.call_args_list)
                )

    def test_failed_load_with_absent_tag_has_no_cleanup_residue(self) -> None:
        image_reference = "localhost/bgmss-updater-artifact:test"
        image_ids = (
            f"sha256:{'a' * 64}",
            f"sha256:{'b' * 64}",
        )
        missing = subprocess.CompletedProcess(
            ["docker"],
            1,
            stdout="",
            stderr=f"Error: No such image: {image_reference}",
        )
        primary = artifact.BuildError("image load failed without side effect")
        with (
            patch.object(smoke, "_run_docker", return_value=missing) as run_docker,
            self.assertRaises(artifact.BuildError) as caught,
            smoke._cleanup_guard(
                lambda: smoke._cleanup_smoke_resources(
                    docker=Path("docker"),
                    containers={},
                    owner_token="a" * 32,
                    image_reference=image_reference,
                    artifact_image_ids=image_ids,
                    image_load_attempted=True,
                    image_load_completed=False,
                    loaded_image_id=None,
                )
            ),
        ):
            raise primary
        self.assertIs(caught.exception, primary)
        run_docker.assert_called_once_with(
            Path("docker"),
            ["image", "inspect", image_reference],
            check=False,
        )

    def test_failed_load_preserves_and_reports_third_image_identity(self) -> None:
        image_reference = "localhost/bgmss-updater-artifact:test"
        image_ids = (
            f"sha256:{'a' * 64}",
            f"sha256:{'b' * 64}",
        )
        replacement_image_id = f"sha256:{'c' * 64}"
        inspected = subprocess.CompletedProcess(
            ["docker"],
            0,
            stdout=json.dumps([{"Id": replacement_image_id}]),
            stderr="",
        )
        primary = artifact.BuildError("image load failed while tag was replaced")
        standard_error = io.StringIO()
        with (
            patch.object(smoke, "_run_docker", return_value=inspected) as run_docker,
            redirect_stderr(standard_error),
            self.assertRaises(artifact.BuildError) as caught,
            smoke._cleanup_guard(
                lambda: smoke._cleanup_smoke_resources(
                    docker=Path("docker"),
                    containers={},
                    owner_token="a" * 32,
                    image_reference=image_reference,
                    artifact_image_ids=image_ids,
                    image_load_attempted=True,
                    image_load_completed=False,
                    loaded_image_id=None,
                )
            ),
        ):
            raise primary
        self.assertIs(caught.exception, primary)
        secondary = f"refusing to remove non-artifact smoke image tag: {image_reference}"
        self.assertIn(
            secondary,
            "\n".join(getattr(caught.exception, "__notes__", ())),
        )
        self.assertIn(secondary, standard_error.getvalue())
        run_docker.assert_called_once_with(
            Path("docker"),
            ["image", "inspect", image_reference],
            check=False,
        )

    def test_replacement_image_tag_is_preserved(self) -> None:
        image_ids = (
            f"sha256:{'a' * 64}",
            f"sha256:{'b' * 64}",
        )
        replacement_image_id = image_ids[1]
        inspected = subprocess.CompletedProcess(
            ["docker"],
            0,
            stdout=json.dumps([{"Id": replacement_image_id}]),
            stderr="",
        )
        with patch.object(smoke, "_run_docker", return_value=inspected) as run_docker:
            failure = smoke._cleanup_loaded_image(
                Path("docker"),
                "localhost/bgmss-updater-artifact:test",
                image_ids,
                captured_image_id=image_ids[0],
            )
        self.assertEqual(
            failure,
            (
                "refusing to remove replacement smoke image tag: "
                "localhost/bgmss-updater-artifact:test"
            ),
        )
        run_docker.assert_called_once()

    def test_post_load_capture_accepts_classic_and_containerd_image_ids(self) -> None:
        image_reference = "localhost/bgmss-updater-artifact:test"
        image_ids = (
            f"sha256:{'a' * 64}",
            f"sha256:{'b' * 64}",
        )
        for image_id in image_ids:
            with self.subTest(image_id=image_id):
                inspected = subprocess.CompletedProcess(
                    ["docker"],
                    0,
                    stdout=json.dumps([{"Id": image_id}]),
                    stderr="",
                )
                with patch.object(
                    smoke,
                    "_run_docker",
                    return_value=inspected,
                ) as run_docker:
                    captured = smoke._capture_loaded_image_id(
                        Path("docker"),
                        image_reference,
                        image_ids,
                    )
                self.assertEqual(captured, image_id)
                run_docker.assert_called_once_with(
                    Path("docker"),
                    ["image", "inspect", image_reference],
                )

    def test_post_load_capture_rejects_non_artifact_image_id(self) -> None:
        image_ids = (
            f"sha256:{'a' * 64}",
            f"sha256:{'b' * 64}",
        )
        inspected = subprocess.CompletedProcess(
            ["docker"],
            0,
            stdout=json.dumps([{"Id": f"sha256:{'c' * 64}"}]),
            stderr="",
        )
        with (
            patch.object(smoke, "_run_docker", return_value=inspected) as run_docker,
            self.assertRaisesRegex(
                artifact.BuildError,
                "artifact-bound immutable ID",
            ),
        ):
            smoke._capture_loaded_image_id(
                Path("docker"),
                "localhost/bgmss-updater-artifact:test",
                image_ids,
            )
        run_docker.assert_called_once_with(
            Path("docker"),
            [
                "image",
                "inspect",
                "localhost/bgmss-updater-artifact:test",
            ],
        )

    def test_post_load_capture_rejects_malformed_inspection(self) -> None:
        image_reference = "localhost/bgmss-updater-artifact:test"
        malformed = subprocess.CompletedProcess(
            ["docker"],
            0,
            stdout=json.dumps([{"Id": "not-an-image-id"}]),
            stderr="",
        )
        with (
            patch.object(smoke, "_run_docker", return_value=malformed) as run_docker,
            self.assertRaisesRegex(
                artifact.BuildError,
                "did not return one immutable image ID",
            ),
        ):
            smoke._capture_loaded_image_id(
                Path("docker"),
                image_reference,
                (f"sha256:{'a' * 64}", f"sha256:{'b' * 64}"),
            )
        run_docker.assert_called_once_with(
            Path("docker"),
            ["image", "inspect", image_reference],
        )

    def test_owned_image_cleanup_uses_immutable_id_without_force(self) -> None:
        image_ids = (
            f"sha256:{'a' * 64}",
            f"sha256:{'b' * 64}",
        )
        for image_id in image_ids:
            with self.subTest(image_id=image_id):
                inspected = subprocess.CompletedProcess(
                    ["docker"],
                    0,
                    stdout=json.dumps([{"Id": image_id}]),
                    stderr="",
                )
                removed = subprocess.CompletedProcess(
                    ["docker"],
                    0,
                    stdout="",
                    stderr="",
                )
                with patch.object(
                    smoke,
                    "_run_docker",
                    side_effect=(inspected, removed),
                ) as run_docker:
                    failure = smoke._cleanup_loaded_image(
                        Path("docker"),
                        "localhost/bgmss-updater-artifact:test",
                        image_ids,
                        captured_image_id=image_id,
                    )
                self.assertIsNone(failure)
                run_docker.assert_any_call(
                    Path("docker"),
                    ["image", "rm", image_id],
                    check=False,
                )
                self.assertFalse(
                    any("--force" in call.args[1] for call in run_docker.call_args_list)
                )

    def test_malformed_image_cleanup_inspection_preserves_the_tag(self) -> None:
        image_reference = "localhost/bgmss-updater-artifact:test"
        malformed = subprocess.CompletedProcess(
            ["docker"],
            0,
            stdout=json.dumps([{"Id": "not-an-image-id"}]),
            stderr="",
        )
        with patch.object(smoke, "_run_docker", return_value=malformed) as run_docker:
            failure = smoke._cleanup_loaded_image(
                Path("docker"),
                image_reference,
                (f"sha256:{'a' * 64}", f"sha256:{'b' * 64}"),
                captured_image_id=None,
            )
        self.assertEqual(
            failure,
            f"loaded smoke image ownership inspection is malformed: {image_reference}",
        )
        run_docker.assert_called_once_with(
            Path("docker"),
            ["image", "inspect", image_reference],
            check=False,
        )

    def test_primary_failure_is_preserved_when_cleanup_fails(self) -> None:
        primary = artifact.BuildError("primary smoke failure")
        standard_error = io.StringIO()
        with (
            redirect_stderr(standard_error),
            self.assertRaises(artifact.BuildError) as caught,
            smoke._cleanup_guard(
                lambda: ("refusing to remove foreign smoke container: collision",)
            ),
        ):
            raise primary
        self.assertIs(caught.exception, primary)
        self.assertEqual(str(caught.exception), "primary smoke failure")
        self.assertIn(
            "refusing to remove foreign smoke container: collision",
            "\n".join(getattr(caught.exception, "__notes__", ())),
        )
        self.assertIn(
            "refusing to remove foreign smoke container: collision",
            standard_error.getvalue(),
        )

    def test_contract_digest_reads_only_declared_contract_inputs(self) -> None:
        contracts = self.root / "contracts"
        for name in ("goldens", "openapi", "schemas"):
            directory = contracts / name
            directory.mkdir(parents=True)
            (directory / "input").write_text(name, encoding="utf-8")
        first = smoke._protected_contract_digest(contracts)
        (contracts / "artifacts").mkdir()
        (contracts / "artifacts" / "parallel-owner").write_text("ignored", encoding="utf-8")
        second = smoke._protected_contract_digest(contracts)
        self.assertEqual(first, second)


class ResidueTests(unittest.TestCase):
    def test_python_bytecode_is_disabled_for_contract_helper_imports(self) -> None:
        self.assertTrue(sys.dont_write_bytecode)
        self.assertFalse((artifact.REPOSITORY_ROOT / "contracts/artifacts/__pycache__").exists())

    def test_build_tool_contains_no_activation_or_publication_invocation(self) -> None:
        value = Path(artifact.__file__).read_text(encoding="utf-8")
        self.assertNotIn('["bgmss-updater", "produce"', value)
        self.assertNotIn('"docker", "push"', value)
        self.assertNotIn('"docker", "login"', value)

    def test_tmp_ignore_is_narrow(self) -> None:
        self.assertEqual(
            (artifact.BUILD_ROOT / ".gitignore").read_text(encoding="utf-8"),
            "/.tmp/\n",
        )


if __name__ == "__main__":
    os.environ["PYTHONDONTWRITEBYTECODE"] = "1"
    unittest.main()
