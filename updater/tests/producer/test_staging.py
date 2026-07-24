"""Contained staging and inactive publication tests."""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest

from bangumi_staff_stats_updater.producer import staging as staging_module
from bangumi_staff_stats_updater.producer.model import ProducerError
from bangumi_staff_stats_updater.producer.staging import StagingRoot

_VERSION = "dv1-" + ("a" * 64)


def test_failure_cleans_only_unique_staging(tmp_path: Path) -> None:
    keep = tmp_path / "keep"
    keep.write_text("preserved")
    with pytest.raises(RuntimeError), StagingRoot(tmp_path) as staging:
        (staging.path / "owned").write_text("temporary")
        stage_path = staging.path
        raise RuntimeError
    assert not stage_path.exists()
    assert keep.read_text() == "preserved"


def test_publish_atomically_moves_closed_candidate_and_cleans_stage(
    tmp_path: Path,
) -> None:
    with StagingRoot(tmp_path) as staging:
        candidate = staging.candidate_root(_VERSION)
        (candidate / "manifest.json").write_text("{}")
        (candidate / "bangumi.sqlite").write_bytes(b"sqlite")
        stage_path = staging.path
        staging.prepare_publication(_VERSION)
        published = staging.publish(_VERSION)
        assert published == tmp_path / "versions" / _VERSION
    assert not stage_path.exists()
    assert sorted(path.name for path in published.iterdir()) == [
        "bangumi.sqlite",
        "manifest.json",
    ]


def test_publication_collision_never_overwrites_existing_bytes(tmp_path: Path) -> None:
    existing = tmp_path / "versions" / _VERSION
    existing.mkdir(parents=True)
    protected = existing / "manifest.json"
    protected.write_text("protected")
    with StagingRoot(tmp_path) as staging:
        candidate = staging.candidate_root(_VERSION)
        (candidate / "manifest.json").write_text("new")
        staging.prepare_publication(_VERSION)
        with pytest.raises(ProducerError, match="PUBLICATION_COLLISION"):
            staging.publish(_VERSION)
    assert protected.read_text() == "protected"


def test_raced_publication_collision_never_overwrites_existing_bytes(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    original = staging_module._rename_exclusive
    protected = tmp_path / "versions" / _VERSION / "manifest.json"

    def race(source: Path, destination: Path) -> None:
        destination.mkdir()
        protected.write_text("raced")
        original(source, destination)

    with StagingRoot(tmp_path) as staging:
        candidate = staging.candidate_root(_VERSION)
        (candidate / "manifest.json").write_text("new")
        staging.prepare_publication(_VERSION)
        monkeypatch.setattr(staging_module, "_rename_exclusive", race)
        with pytest.raises(ProducerError, match="PUBLICATION_COLLISION"):
            staging.publish(_VERSION)
    assert protected.read_text() == "raced"


def test_rename_fault_removes_only_staging_and_preserves_prior_version(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    prior = tmp_path / "versions" / ("dv1-" + ("b" * 64))
    prior.mkdir(parents=True)
    protected = prior / "manifest.json"
    protected.write_text("prior")

    def fail(_source: Path, _destination: Path) -> None:
        raise ProducerError("PUBLICATION_FAILED")

    with StagingRoot(tmp_path) as staging:
        candidate = staging.candidate_root(_VERSION)
        (candidate / "manifest.json").write_text("new")
        stage_path = staging.path
        staging.prepare_publication(_VERSION)
        monkeypatch.setattr(staging_module, "_rename_exclusive", fail)
        with pytest.raises(ProducerError, match="PUBLICATION_FAILED"):
            staging.publish(_VERSION)
    assert not stage_path.exists()
    assert protected.read_text() == "prior"


def test_relative_or_symlink_output_root_is_rejected(tmp_path: Path) -> None:
    with pytest.raises(ProducerError, match="OUTPUT_ROOT_INVALID"):
        StagingRoot(Path("relative"))
    linked = tmp_path.parent / f"{tmp_path.name}-link"
    linked.symlink_to(tmp_path, target_is_directory=True)
    try:
        with pytest.raises(ProducerError, match="OUTPUT_ROOT_INVALID"):
            StagingRoot(linked)
    finally:
        linked.unlink()


def test_constructor_failure_removes_created_staging_directory(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    original_mkdir = Path.mkdir

    def fail_stage_versions(
        path: Path,
        mode: int = 0o777,
        parents: bool = False,
        exist_ok: bool = False,
    ) -> None:
        if path.name == "versions" and path.parent.name.startswith(".bgmss-stage-"):
            raise OSError("injected stage setup failure")
        original_mkdir(path, mode=mode, parents=parents, exist_ok=exist_ok)

    monkeypatch.setattr(Path, "mkdir", fail_stage_versions)
    with pytest.raises(ProducerError, match="STAGING_CREATE_FAILED"):
        StagingRoot(tmp_path)
    assert not tuple(tmp_path.glob(".bgmss-stage-*"))


def test_prepublication_work_cleanup_failure_prevents_publication(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    original_rmtree = shutil.rmtree
    version_root = tmp_path / "versions" / _VERSION
    with (
        pytest.raises(ProducerError, match="STAGING_CLEANUP_FAILED"),
        StagingRoot(tmp_path) as staging,
    ):
        sources = staging.path / "sources"
        sources.mkdir()
        (sources / "subject.jsonlines").write_bytes(b"large-work")
        download = staging.path / "download"
        download.mkdir()
        (download / "archive.zip").write_bytes(b"large-work")
        candidate = staging.candidate_root(_VERSION)
        (candidate / "manifest.json").write_text("{}")

        def fail_sources(path: Path) -> None:
            if path == sources:
                raise OSError("injected prepublication cleanup failure")
            original_rmtree(path)

        monkeypatch.setattr(shutil, "rmtree", fail_sources)
        staging.prepare_publication(_VERSION)
    assert not version_root.exists()
    assert not tuple(tmp_path.glob(".bgmss-stage-*"))


def test_postpublication_cleanup_fault_leaves_only_empty_stage_shell(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    original_rmtree = shutil.rmtree
    with StagingRoot(tmp_path) as staging:
        sources = staging.path / "sources"
        sources.mkdir()
        (sources / "subject.jsonlines").write_bytes(b"large-work")
        download = staging.path / "download"
        download.mkdir()
        (download / "archive.zip").write_bytes(b"large-work")
        candidate = staging.candidate_root(_VERSION)
        (candidate / "manifest.json").write_text("{}")
        (candidate / "bangumi.sqlite").write_bytes(b"sqlite")
        stage_path = staging.path
        staging.prepare_publication(_VERSION)

        def fail_stage_shell(path: Path) -> None:
            if path == stage_path:
                raise OSError("injected postpublication cleanup failure")
            original_rmtree(path)

        monkeypatch.setattr(shutil, "rmtree", fail_stage_shell)
        published = staging.publish(_VERSION)

    assert published == tmp_path / "versions" / _VERSION
    assert tuple(stage_path.iterdir()) == (stage_path / "versions",)
    assert not tuple((stage_path / "versions").iterdir())
    assert not (stage_path / "download").exists()
    assert not (stage_path / "sources").exists()
    original_rmtree(stage_path)
