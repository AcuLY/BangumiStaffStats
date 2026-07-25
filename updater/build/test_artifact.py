"""Focused tests for the deterministic Updater artifact boundary."""

from __future__ import annotations

import io
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest
from contextlib import redirect_stderr
from pathlib import Path
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
        snapshot = self.generated_root / "trusted-snapshot"
        with patch.object(artifact, "TMP_ROOT", self.generated_root):
            artifact._copy_source_snapshot(snapshot, self.attestation)
        self.assertEqual(
            (snapshot / "src" / "package" / "__init__.py").read_text(encoding="utf-8"),
            'VALUE = "tracked"\n',
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

    def test_safe_tar_extraction_rejects_escape_and_links(self) -> None:
        archive_path = self.root / "unsafe.tar"
        with tarfile.open(archive_path, "w") as archive:
            info = tarfile.TarInfo("../escape")
            value = b"unsafe"
            info.size = len(value)
            archive.addfile(info, io.BytesIO(value))
        with self.assertRaisesRegex(artifact.BuildError, "unsafe relative path"):
            artifact._extract_tar_safely(archive_path, self.root / "extract")


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
        artifact.verify_output(stage, require_statement=True)
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

    def test_oci_export_rewrites_layer_timestamps(self) -> None:
        source = Path(artifact.__file__).read_text(encoding="utf-8")
        self.assertIn(
            'f"type=oci,dest={raw_archive},rewrite-timestamp=true"',
            source,
        )
        self.assertIn('"--builder",\n            builder,', source)

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
        metadata: dict[str, Any] = {
            "artifacts": {
                "image": {
                    "oci": {"reference": "bgmss-updater-artifact:revision-arm64"},
                    "path": "artifacts/updater-image-linux-arm64.oci.tar",
                }
            }
        }
        reference, path = smoke._image_information(metadata)
        self.assertEqual(reference, "bgmss-updater-artifact:revision-arm64")
        self.assertEqual(path.as_posix(), "artifacts/updater-image-linux-arm64.oci.tar")
        metadata["artifacts"]["image"]["path"] = "../escape"
        with self.assertRaisesRegex(artifact.BuildError, "unsafe relative path"):
            smoke._image_information(metadata)

    def test_runtime_smoke_is_networkless_read_only_and_non_root(self) -> None:
        arguments = smoke._common_run_arguments("updater:test", "updater-test-doctor")
        self.assertIn("updater-test-doctor", arguments)
        self.assertIn("none", arguments)
        self.assertIn("never", arguments)
        self.assertIn("--read-only", arguments)
        self.assertIn("no-new-privileges", arguments)
        self.assertIn("65532:65532", arguments)
        self.assertEqual(arguments[-1], "updater:test")
        self.assertNotIn("produce", arguments)
        source = Path(smoke.__file__).read_text(encoding="utf-8")
        self.assertIn("benchmarks", source)
        self.assertIn("locate_file(file).is_file()", source)

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
