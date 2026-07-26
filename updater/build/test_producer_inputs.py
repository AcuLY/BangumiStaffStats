"""Pure tests for admitted and packaged producer runtime inputs."""

from __future__ import annotations

import copy
import json
import sys
import unittest
from dataclasses import dataclass
from pathlib import Path
from unittest.mock import patch

sys.dont_write_bytecode = True

import producer_inputs  # noqa: E402

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class Blob:
    path: str
    mode: int
    content: bytes


def accepted_blobs() -> list[Blob]:
    manifest_bytes = (REPOSITORY_ROOT / producer_inputs.MANIFEST_SOURCE_PATH).read_bytes()
    manifest = producer_inputs.parse_runtime_manifest(manifest_bytes)
    paths = [
        producer_inputs.MANIFEST_SOURCE_PATH,
        *(record.path for record in manifest.files),
        *producer_inputs.CATALOG_SOURCE_PATHS,
    ]
    return [
        Blob(
            path=path,
            mode=producer_inputs.GIT_REGULAR_MODE,
            content=(REPOSITORY_ROOT / path).read_bytes(),
        )
        for path in paths
    ]


def accepted_manifest_document() -> dict[str, object]:
    value = json.loads((REPOSITORY_ROOT / producer_inputs.MANIFEST_SOURCE_PATH).read_bytes())
    if not isinstance(value, dict):
        raise AssertionError("accepted manifest fixture must be an object")
    return value


def normalized_manifest(document: dict[str, object]) -> bytes:
    files = document["files"]
    if not isinstance(files, list):
        raise AssertionError("manifest files fixture must be a list")
    document["fileCount"] = len(files)
    document["totalSize"] = sum(int(record["size"]) for record in files if isinstance(record, dict))
    document["fileSetDigest"] = producer_inputs.sha256_bytes(producer_inputs.canonical_json(files))
    return producer_inputs.canonical_json(document)


def selected_tree(
    selected: producer_inputs.SelectedProducerInputs,
    metadata: bytes,
) -> dict[str, bytes]:
    return {
        **{
            selected_file.embedded_path: selected_file.content
            for selected_file in selected.embedded_files
        },
        producer_inputs.MANIFEST_EMBEDDED_PATH: selected.manifest_bytes,
        producer_inputs.PRODUCER_METADATA_PATH: metadata,
    }


class RuntimeManifestTests(unittest.TestCase):
    def test_accepted_manifest_is_canonical_and_fixed(self) -> None:
        source = (REPOSITORY_ROOT / producer_inputs.MANIFEST_SOURCE_PATH).read_bytes()
        parsed = producer_inputs.parse_runtime_manifest(source)
        self.assertEqual(parsed.file_count, producer_inputs.EXPECTED_FILE_COUNT)
        self.assertEqual(
            producer_inputs.sha256_bytes(source),
            producer_inputs.EXPECTED_MANIFEST_DIGEST,
        )
        self.assertEqual(
            [record.path for record in parsed.files],
            sorted(record.path for record in parsed.files),
        )

    def test_manifest_rejects_noncanonical_and_duplicate_json(self) -> None:
        source = (REPOSITORY_ROOT / producer_inputs.MANIFEST_SOURCE_PATH).read_bytes()
        with self.assertRaisesRegex(
            producer_inputs.ProducerInputsError,
            "not canonical",
        ):
            producer_inputs.parse_runtime_manifest(source.rstrip())
        with self.assertRaisesRegex(
            producer_inputs.ProducerInputsError,
            "duplicate key",
        ):
            producer_inputs.parse_runtime_manifest(b'{"fileCount":42,"fileCount":42}\n')

    def test_manifest_rejects_missing_and_extra_records(self) -> None:
        for operation in ("missing", "extra"):
            with self.subTest(operation=operation):
                document = accepted_manifest_document()
                files = document["files"]
                self.assertIsInstance(files, list)
                records = list(files)
                if operation == "missing":
                    records.pop()
                else:
                    records.append(copy.deepcopy(records[-1]))
                    records[-1]["path"] = "contracts/schemas/extra.json"
                document["files"] = records
                with self.assertRaisesRegex(
                    producer_inputs.ProducerInputsError,
                    "must equal 42|must contain 42",
                ):
                    producer_inputs.parse_runtime_manifest(normalized_manifest(document))

    def test_manifest_rejects_reordered_duplicate_and_unsafe_paths(self) -> None:
        cases = ("reordered", "duplicate", "unsafe")
        for case in cases:
            with self.subTest(case=case):
                document = accepted_manifest_document()
                files = copy.deepcopy(document["files"])
                self.assertIsInstance(files, list)
                if case == "reordered":
                    files[0], files[1] = files[1], files[0]
                elif case == "duplicate":
                    files[1]["path"] = files[0]["path"]
                else:
                    files[0]["path"] = "contracts/../escape.json"
                document["files"] = files
                with self.assertRaises(producer_inputs.ProducerInputsError):
                    producer_inputs.parse_runtime_manifest(normalized_manifest(document))

    def test_manifest_rejects_record_digest_set_digest_and_total_drift(self) -> None:
        document = accepted_manifest_document()
        files = copy.deepcopy(document["files"])
        self.assertIsInstance(files, list)
        files[0]["sha256"] = "not-a-digest"
        document["files"] = files
        with self.assertRaisesRegex(
            producer_inputs.ProducerInputsError,
            "sha256:-prefixed",
        ):
            producer_inputs.parse_runtime_manifest(normalized_manifest(document))

        document = accepted_manifest_document()
        document["fileSetDigest"] = f"sha256:{'0' * 64}"
        with self.assertRaisesRegex(
            producer_inputs.ProducerInputsError,
            "fileSetDigest must equal",
        ):
            producer_inputs.parse_runtime_manifest(producer_inputs.canonical_json(document))

        document = accepted_manifest_document()
        document["totalSize"] = int(document["totalSize"]) + 1
        with self.assertRaisesRegex(
            producer_inputs.ProducerInputsError,
            "totalSize must equal",
        ):
            producer_inputs.parse_runtime_manifest(producer_inputs.canonical_json(document))


class AdmissionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.blobs = accepted_blobs()

    def _replace(self, path: str, **values: object) -> list[Blob]:
        result = list(self.blobs)
        index = next(index for index, value in enumerate(result) if value.path == path)
        original = result[index]
        result[index] = Blob(
            path=str(values.get("path", original.path)),
            mode=int(values.get("mode", original.mode)),
            content=values.get("content", original.content),  # type: ignore[arg-type]
        )
        return result

    def test_selects_only_manifest_contracts_and_catalog_pair(self) -> None:
        extra = Blob("unrelated.txt", 0o100644, b"must not be selected")
        selected = producer_inputs.select_attested_producer_inputs([*self.blobs, extra])
        self.assertEqual(len(selected.contracts), 42)
        self.assertEqual(
            tuple(value.source_path for value in selected.catalogs),
            producer_inputs.CATALOG_SOURCE_PATHS,
        )
        self.assertNotIn(
            extra.content,
            [value.content for value in selected.embedded_files],
        )
        self.assertRegex(selected.common_commit, r"^[0-9a-f]{40}$")

    def test_rejects_unaccepted_manifest_bytes(self) -> None:
        manifest = next(
            value for value in self.blobs if value.path == producer_inputs.MANIFEST_SOURCE_PATH
        )
        changed = self._replace(
            manifest.path,
            content=manifest.content.replace(b'"schemaVersion":1', b'"schemaVersion":2'),
        )
        with self.assertRaisesRegex(
            producer_inputs.ProducerInputsError,
            "manifest digest must equal",
        ):
            producer_inputs.select_attested_producer_inputs(changed)

    def test_rejects_missing_duplicate_and_nonregular_blobs(self) -> None:
        contract_path = (
            producer_inputs.parse_runtime_manifest(
                next(
                    value.content
                    for value in self.blobs
                    if value.path == producer_inputs.MANIFEST_SOURCE_PATH
                )
            )
            .files[0]
            .path
        )
        cases = {
            "missing": [value for value in self.blobs if value.path != contract_path],
            "duplicate": [*self.blobs, self.blobs[0]],
            "mode": self._replace(contract_path, mode=0o100755),
        }
        for name, values in cases.items():
            with self.subTest(name=name), self.assertRaises(producer_inputs.ProducerInputsError):
                producer_inputs.select_attested_producer_inputs(values)

    def test_rejects_contract_bytes_and_catalog_pair_drift(self) -> None:
        manifest = producer_inputs.parse_runtime_manifest(
            next(
                value.content
                for value in self.blobs
                if value.path == producer_inputs.MANIFEST_SOURCE_PATH
            )
        )
        contract_path = manifest.files[0].path
        cases = {
            "contract bytes": self._replace(contract_path, content=b"changed"),
            "catalog missing": [
                value
                for value in self.blobs
                if value.path != producer_inputs.CATALOG_SOURCE_PATHS[0]
            ],
            "catalog empty": self._replace(
                producer_inputs.CATALOG_SOURCE_PATHS[1],
                content=b"",
            ),
            "catalog mode": self._replace(
                producer_inputs.CATALOG_SOURCE_PATHS[0],
                mode=0o100755,
            ),
        }
        for name, values in cases.items():
            with self.subTest(name=name), self.assertRaises(producer_inputs.ProducerInputsError):
                producer_inputs.select_attested_producer_inputs(values)

    def test_selection_never_rereads_a_mutated_live_worktree(self) -> None:
        selected = producer_inputs.select_attested_producer_inputs(self.blobs)
        original = Path.read_bytes

        def fail_read(_path: Path) -> bytes:
            raise AssertionError("live worktree read attempted")

        with patch.object(Path, "read_bytes", fail_read):
            repeated = producer_inputs.select_attested_producer_inputs(self.blobs)
        self.assertEqual(repeated, selected)
        self.assertIsNotNone(original)


class PackagedTreeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.selected = producer_inputs.select_attested_producer_inputs(accepted_blobs())
        self.catalog_digest = f"sha256:{'a' * 64}"
        self.metadata = producer_inputs.producer_metadata_bytes(
            self.selected,
            self.catalog_digest,
        )
        self.tree = selected_tree(self.selected, self.metadata)

    def test_metadata_and_exact_tree_round_trip(self) -> None:
        document = producer_inputs.parse_producer_metadata(self.metadata)
        verified = producer_inputs.verify_producer_tree(self.tree)
        self.assertEqual(document, verified.metadata)
        self.assertEqual(verified.catalog_config_digest, self.catalog_digest)
        self.assertEqual(
            verified.metadata_digest,
            producer_inputs.sha256_bytes(self.metadata),
        )
        self.assertEqual(
            verified.directories,
            producer_inputs.expected_producer_directories(sorted(self.tree)),
        )

    def test_metadata_rejects_unknown_duplicate_and_reordered_catalog_fields(self) -> None:
        document = json.loads(self.metadata)
        document["unknown"] = True
        with self.assertRaises(producer_inputs.ProducerInputsError):
            producer_inputs.parse_producer_metadata(producer_inputs.canonical_json(document))
        with self.assertRaisesRegex(
            producer_inputs.ProducerInputsError,
            "duplicate key",
        ):
            producer_inputs.parse_producer_metadata(b'{"schemaVersion":1,"schemaVersion":1}\n')
        document = json.loads(self.metadata)
        document["catalog"]["files"].reverse()
        with self.assertRaisesRegex(
            producer_inputs.ProducerInputsError,
            "fixed bytewise order",
        ):
            producer_inputs.parse_producer_metadata(producer_inputs.canonical_json(document))

    def test_tree_rejects_missing_extra_tampered_and_unsafe_inputs(self) -> None:
        cases: dict[str, dict[str, bytes]] = {}
        missing = dict(self.tree)
        missing.pop(next(iter(self.selected.contracts)).embedded_path)
        cases["missing"] = missing
        extra = dict(self.tree)
        extra["extra.txt"] = b"extra"
        cases["extra"] = extra
        contract_tamper = dict(self.tree)
        contract_tamper[next(iter(self.selected.contracts)).embedded_path] = b"tampered"
        cases["contract tamper"] = contract_tamper
        catalog_tamper = dict(self.tree)
        catalog_tamper[producer_inputs.CATALOG_EMBEDDED_PATHS[0]] = b"tampered"
        cases["catalog tamper"] = catalog_tamper
        unsafe = dict(self.tree)
        unsafe["../escape"] = b"unsafe"
        cases["unsafe"] = unsafe
        for name, tree in cases.items():
            with self.subTest(name=name), self.assertRaises(producer_inputs.ProducerInputsError):
                producer_inputs.verify_producer_tree(tree)

    def test_tree_rejects_metadata_manifest_and_common_commit_mismatch(self) -> None:
        metadata = json.loads(self.metadata)
        metadata["contracts"]["fileSetDigest"] = f"sha256:{'b' * 64}"
        tree = dict(self.tree)
        tree[producer_inputs.PRODUCER_METADATA_PATH] = producer_inputs.canonical_json(metadata)
        with self.assertRaisesRegex(
            producer_inputs.ProducerInputsError,
            "Contracts metadata disagrees",
        ):
            producer_inputs.verify_producer_tree(tree)

        metadata = json.loads(self.metadata)
        metadata["commonCommit"] = "0" * 40
        tree = dict(self.tree)
        tree[producer_inputs.PRODUCER_METADATA_PATH] = producer_inputs.canonical_json(metadata)
        with self.assertRaisesRegex(
            producer_inputs.ProducerInputsError,
            "commonCommit disagrees",
        ):
            producer_inputs.verify_producer_tree(tree)

        tree = dict(self.tree)
        tree[producer_inputs.MANIFEST_EMBEDDED_PATH] = b"{}\n"
        with self.assertRaisesRegex(
            producer_inputs.ProducerInputsError,
            "manifest digest must equal",
        ):
            producer_inputs.verify_producer_tree(tree)


if __name__ == "__main__":
    unittest.main()
