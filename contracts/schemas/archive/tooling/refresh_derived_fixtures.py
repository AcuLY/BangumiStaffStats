#!/usr/bin/env python3
"""Refresh only the existing Archive/profile derived fixture inventories."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import sqlite3
import sys
import tempfile

sys.dont_write_bytecode = True
import build_sqlite_fixtures as builder

REPOSITORY = Path(__file__).resolve().parents[4]
SCHEMA = "contracts/schemas/archive"
GOLDEN = "contracts/goldens/archive"
PRODUCER = f"{GOLDEN}/producer"
RUNTIME = "contracts/artifacts/producer-runtime-inputs-v1.json"
VALIDATION = "contracts/artifacts/lib/validation.mjs"
ARTIFACT = "backend/build/artifact.go"
ARTIFACT_TEST = "backend/build/artifact_test.go"
RUNTIME_TEST = "contracts/artifacts/test/producer-runtime-inputs.test.mjs"
STATEMENT_SCHEMA = "contracts/artifacts/schemas/component-statement-v1.schema.json"
BUILD_SCRIPT = "backend/build/build.sh"
QUERY_MANIFEST = "contracts/goldens/query-domain/manifest.json"
QUERY_VERIFIER = "contracts/goldens/query-domain/verify.mjs"
EMBEDDED = "backend/internal/archivebuild/assets/schema.sql"
FIXTURES = (
    "contracts/artifacts/fixtures/positive/backend/component-statement.json",
    "contracts/artifacts/fixtures/positive/frontend/component-statement.json",
)
WHITE_SPACE = "\u0009\u000a\u000b\u000c\u000d\u0020\u0085\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000"
# Each existing person exercises one biography source shape, without new cases.
SUMMARY_INPUTS = {
    101: " \r\n金标简介。\r第二行\u0000\u0001\tLiteral <b>text</b> [b]text[/b] 😀\u3000",
    102: None,
    104: " \t\r\n\u0085\u3000 ",
    105: "跨 Unicode 😀 简介",
    106: "A short biography.",
}


def digest(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


def json_bytes(value, *, canonical: bool = False) -> bytes:
    options = {"sort_keys": True, "separators": (",", ":")} if canonical else {"indent": 2}
    return (json.dumps(value, ensure_ascii=False, **options) + "\n").encode("utf-8")


def logical_bytes(value) -> bytes:
    return json_bytes(value)


def normalize_summary(value):
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("summary must be string or null")
    value.encode("utf-8", errors="strict")
    value = value.replace("\r\n", "\n").replace("\r", "\n")
    value = "".join(c for c in value if ord(c) >= 32 or c in "\n\t")
    return value.strip(WHITE_SPACE)[:8192].strip(WHITE_SPACE) or None


def safe_target(root: Path, relative: str, allowed: set[str]) -> Path:
    parts = PurePosixPath(relative).parts
    if relative not in allowed or not parts or ".." in parts or "\\" in relative or parts[0].endswith(":"):
        raise ValueError(f"output is outside the closed inventory: {relative}")
    target = root.joinpath(*parts)
    if not target.is_relative_to(root) or target.resolve() != target:
        raise ValueError(f"output aliases another path: {relative}")
    for item in (target, *target.parents):
        if item == root:
            break
        if item.is_symlink():
            raise ValueError(f"output is a symlink: {relative}")
    if not target.is_file():
        raise ValueError(f"derived target must already exist: {relative}")
    return target


def replace_constant(source: str, name: str, value: str) -> str:
    pattern = rf"({re.escape(name)}\s*=\s*(?:\(\s*)?[\"'])[^\"']+([\"'])"
    result, count = re.subn(pattern, lambda m: m[1] + value + m[2], source)
    if count != 1:
        raise ValueError(f"expected one constant {name}, found {count}")
    return result


def source_set_digest(sources) -> str:
    chunks = [b"bgmss-producer-source-set-v1\n", f"count={len(sources)}\n".encode()]
    for source in sorted(sources, key=lambda x: x["name"].encode("utf-8")):
        name = source["name"].encode("utf-8")
        chunks += [f"name={len(name)}:".encode(), name, b"\n", f"size={source['size']}\ndigest={source['digest']}\n".encode()]
    return digest(b"".join(chunks))


def refresh_producer(document, sql_digest):
    summaries = {}
    for source in document["inputs"]["sources"]:
        if source["name"] != "person.jsonlines":
            continue
        lines = []
        for line in source["bytesUtf8"].split("\n"):
            if not line:
                continue
            record = json.loads(line)
            if record["id"] in SUMMARY_INPUTS:
                record["summary"] = SUMMARY_INPUTS[record["id"]]
            else:
                record.pop("summary", None)
            summaries.setdefault(record["id"], normalize_summary(record.get("summary")))
            lines.append(json.dumps(record, ensure_ascii=False, separators=(",", ":")))
        data = ("\n".join(lines) + "\n").encode("utf-8")
        # Keep intentionally mismatching declarations mismatching.
        if source["declaredSize"] == source["size"]:
            source["declaredSize"] = len(data)
        if source["declaredDigest"] == source["digest"]:
            source["declaredDigest"] = digest(data)
        source.update(bytesUtf8=data.decode("utf-8"), size=len(data), digest=digest(data))
    identity = document["inputs"]["identity"]
    identity.update(sqliteSchemaVersion=2, schemaSqlDigest=sql_digest,
                    archiveDigest=source_set_digest(document["inputs"]["sources"]))
    preimage = builder.canonical_preimage(identity)
    document["dataVersion"].update(canonicalPreimage=preimage.decode("utf-8"),
                                   canonicalPreimageByteLength=len(preimage),
                                   result=builder.data_version(identity))
    people = document["expected"]["logicalProjection"]["person"]
    for person in people:
        person.pop("summary", None)
        person["summary"] = summaries.get(person["personId"])
    document["expected"]["logicalDigests"]["person"] = digest(logical_bytes(people))
    return document


def render_outputs(root: Path) -> dict[str, bytes]:
    def read(relative):
        return (root / relative).read_bytes()

    def load(relative):
        return json.loads(read(relative).decode("utf-8"))

    canonical_index = load(f"{GOLDEN}/index.json")
    producer_index = load(f"{PRODUCER}/index.json")
    canonical_paths = {f"{GOLDEN}/{entry['path']}" for entry in canonical_index["files"]}
    producer_paths = {f"{PRODUCER}/{entry['path']}" for entry in producer_index["files"]}
    if len(canonical_paths) != 32 or len(producer_paths) != 15:
        raise ValueError("closed canonical/producer inventory count changed")
    fixed = {f"{SCHEMA}/compatibility-matrix.json", f"{GOLDEN}/index.json",
             f"{PRODUCER}/index.json", RUNTIME, VALIDATION, ARTIFACT, ARTIFACT_TEST,
             EMBEDDED, RUNTIME_TEST, STATEMENT_SCHEMA, BUILD_SCRIPT,
             QUERY_MANIFEST, QUERY_VERIFIER, f"{SCHEMA}/tooling/verify.mjs",
             f"{SCHEMA}/tooling/build_sqlite_fixtures.py",
             "contracts/artifacts/test/contracts.test.mjs", *FIXTURES}
    allowed = canonical_paths | producer_paths | fixed
    for relative in allowed:
        safe_target(root, relative, allowed)
    outputs = {}
    sql = read(f"{SCHEMA}/schema.sql")
    sql_digest = digest(sql)
    matrix = load(f"{SCHEMA}/compatibility-matrix.json")
    matrix["supported"][0]["sqliteSchemaVersion"] = 2
    with sqlite3.connect(":memory:") as con:
        con.executescript(sql.decode("utf-8"))
        matrix["canonicalSchema"] = {"schemaSqlDigest": sql_digest, **builder.schema_object_record(con)}
    matrix_bytes = json_bytes(matrix)
    outputs[f"{SCHEMA}/compatibility-matrix.json"] = matrix_bytes
    outputs[EMBEDDED] = sql
    temp_root = root / SCHEMA / ".tmp"
    temp_root.mkdir(exist_ok=True)
    if temp_root.is_symlink() or temp_root.resolve() != temp_root:
        raise ValueError("temporary output root aliases another path")
    with tempfile.TemporaryDirectory(prefix="profile-v2-", dir=temp_root) as temporary:
        temporary = Path(temporary)
        generated = temporary / "archive"
        staged_matrix = temporary / "matrix.json"
        staged_matrix.write_bytes(matrix_bytes)
        previous_matrix = builder.COMPATIBILITY_MATRIX
        builder.COMPATIBILITY_MATRIX = staged_matrix
        try:
            report = builder.generate(generated, verify_seal=False)
        finally:
            builder.COMPATIBILITY_MATRIX = previous_matrix
        expected = {entry["path"] for entry in canonical_index["files"]} | {"index.json"}
        actual = {p.relative_to(generated).as_posix() for p in generated.rglob("*") if p.is_file()}
        if actual != expected:
            raise ValueError("canonical generator changed its closed path set")
        for relative in expected:
            outputs[f"{GOLDEN}/{relative}"] = (generated / relative).read_bytes()
    for entry in producer_index["files"]:
        relative = f"{PRODUCER}/{entry['path']}"
        outputs[relative] = json_bytes(refresh_producer(load(relative), sql_digest))
        entry["digest"] = digest(outputs[relative])
    outputs[f"{PRODUCER}/index.json"] = json_bytes(producer_index)
    for relative in (f"{SCHEMA}/tooling/verify.mjs", f"{SCHEMA}/tooling/build_sqlite_fixtures.py"):
        source = read(relative).decode("utf-8").replace("\r\n", "\n")
        source = replace_constant(source, "CANONICAL_INDEX_SHA256", report["canonicalIndex"]["indexSha256"])
        source = replace_constant(source, "CANONICAL_INDEX_TABLE_SHA256", report["canonicalIndex"]["sortedPathDigestSeal"])
        outputs[relative] = source.encode("utf-8")
    runtime = load(RUNTIME)
    if len(runtime["files"]) != 42:
        raise ValueError("runtime-input closure count changed")
    for entry in runtime["files"]:
        relative = entry["path"]
        data = outputs.get(relative, read(relative))
        # All contract JSON/SQL authority is Git LF text; do not seal CRLF checkout conversion.
        if relative.endswith((".json", ".sql")):
            data = data.replace(b"\r\n", b"\n")
        entry.update(size=len(data), sha256=digest(data))
    runtime["totalSize"] = sum(entry["size"] for entry in runtime["files"])
    runtime["fileSetDigest"] = digest(json_bytes(runtime["files"], canonical=True))
    outputs[RUNTIME] = json_bytes(runtime, canonical=True)
    matrix_digest = digest(matrix_bytes)
    runtime_digest = digest(outputs[RUNTIME])
    source = read(BUILD_SCRIPT).decode("utf-8").replace("\r\n", "\n")
    for name, value in (("accepted_schema_sql", sql_digest),
                        ("accepted_compatibility_matrix", matrix_digest),
                        ("accepted_producer_runtime_inputs", runtime_digest)):
        source = replace_constant(source, name, value)
    outputs[BUILD_SCRIPT] = source.encode("utf-8")
    statement_schema = load(STATEMENT_SCHEMA)
    replacements = {}

    def schema_bindings(value):
        if isinstance(value, dict):
            properties = value.get("properties", {})
            source_path = properties.get("path", {}).get("const")
            if source_path in (EMBEDDED, "contracts/producer-runtime-inputs-v1"):
                replacements[properties["sha256"]["const"]] = sql_digest if source_path == EMBEDDED else runtime_digest
            if "compatibilityMatrixDigest" in properties:
                replacements[properties["compatibilityMatrixDigest"]["const"]] = matrix_digest
            for child in value.values():
                schema_bindings(child)
        elif isinstance(value, list):
            for child in value:
                schema_bindings(child)

    schema_bindings(statement_schema)
    source = read(STATEMENT_SCHEMA).decode("utf-8").replace("\r\n", "\n")
    for old, new in replacements.items():
        source = source.replace(old, new)
    outputs[STATEMENT_SCHEMA] = source.encode("utf-8")
    source = read(QUERY_VERIFIER).decode("utf-8").replace("\r\n", "\n")
    source = source.replace('id: "archive-schema-v1"', 'id: "archive-schema-v2"')
    source, count = re.subn(r'(path: "contracts/schemas/archive/schema.sql",\s*sha256: ")[^"]+("|$)',
                           lambda m: m[1] + sql_digest[7:] + m[2], source)
    if count != 1:
        raise ValueError("expected one query-domain Archive authority")
    outputs[QUERY_VERIFIER] = source.encode("utf-8")
    manifest = load(QUERY_MANIFEST)
    authority = next(item for item in manifest["authorities"] if item["path"] == f"{SCHEMA}/schema.sql")
    authority.update(id="archive-schema-v2", sha256=sql_digest[7:])
    manifest["verifier"]["sha256"] = digest(outputs[QUERY_VERIFIER])[7:]
    outputs[QUERY_MANIFEST] = json_bytes(manifest)
    source = read(VALIDATION).decode("utf-8").replace("\r\n", "\n")
    for name, value in (("ARCHIVE_COMPATIBILITY_MATRIX_DIGEST", matrix_digest),
                        ("ARCHIVE_SCHEMA_SQL_DIGEST", sql_digest),
                        ("PRODUCER_RUNTIME_INPUTS_MANIFEST_DIGEST", runtime_digest)):
        source = replace_constant(source, name, value)
    source = re.sub(r"SUPPORTED_ARCHIVE_SQLITE_SCHEMA = \d+", "SUPPORTED_ARCHIVE_SQLITE_SCHEMA = 2", source)
    outputs[VALIDATION] = source.encode("utf-8")
    for relative in (ARTIFACT, ARTIFACT_TEST):
        source = read(relative).decode("utf-8").replace("\r\n", "\n")
        if relative == ARTIFACT:
            source = replace_constant(source, "compatibilityMatrixDigest", matrix_digest)
            source = replace_constant(source, "producerRuntimeInputDigest", runtime_digest)
        else:
            source = re.sub(r'(ArchiveSchemaSQLDigest:\s*")[^"]+("|$)', lambda m: m[1] + sql_digest + m[2], source)
            source = re.sub(r'(Path: archiveSchemaAssetInputPath, SHA256: ")[^"]+("|$)', lambda m: m[1] + sql_digest + m[2], source)
        source = re.sub(r'(SQLiteSchemaVersion:\s*versionRange\{Minimum: )\d+(, Maximum: )\d+(\})', r'\g<1>2\g<2>2\3', source)
        source = re.sub(r'(SQLiteSchemaVersion != \(versionRange\{Minimum: )\d+(, Maximum: )\d+(\})', r'\g<1>2\g<2>2\3', source)
        outputs[relative] = source.encode("utf-8")
    for relative in FIXTURES:
        document = load(relative)
        archive = document["compatibility"]["archive"]
        archive.update(schemaSqlDigest=sql_digest, compatibilityMatrixDigest=matrix_digest,
                       sqliteSchemaVersion={"maximum": 2, "minimum": 2})
        for item in document.get("inputs", []):
            if item["path"] == EMBEDDED:
                item["sha256"] = sql_digest
            if item["path"] == "contracts/producer-runtime-inputs-v1":
                item["sha256"] = runtime_digest
        outputs[relative] = json_bytes(document, canonical=True)
    relative = "contracts/artifacts/test/contracts.test.mjs"
    source = read(relative).decode("utf-8").replace("\r\n", "\n")
    source = re.sub(r'(compatibilityMatrixDigest\.\*must equal sha256:)[0-9a-f]+', lambda m: m[1] + matrix_digest[7:13], source)
    outputs[relative] = source.encode("utf-8")
    source = read(RUNTIME_TEST).decode("utf-8").replace("\r\n", "\n")
    source, count = re.subn(
        r"(fileCount: 42,\s*totalSize: )\d+(,\s*fileSetDigest:\s*')[^']+(')",
        lambda m: m[1] + str(runtime["totalSize"]) + m[2] + runtime["fileSetDigest"] + m[3],
        source,
    )
    if count != 1:
        raise ValueError("expected one runtime-input authority test binding")
    outputs[RUNTIME_TEST] = source.encode("utf-8")
    if not set(outputs) <= allowed:
        raise ValueError("generated output escaped the closed inventory")
    return outputs


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument("--write", action="store_true")
    modes.add_argument("--check", action="store_true")
    args = parser.parse_args()
    outputs = render_outputs(REPOSITORY)
    drift = [path for path, data in outputs.items() if (REPOSITORY / path).read_bytes() != data]
    if args.check and drift:
        raise ValueError("derived fixture drift: " + ", ".join(sorted(drift)))
    if args.write:
        for relative in drift:
            safe_target(REPOSITORY, relative, set(outputs)).write_bytes(outputs[relative])
    print(json.dumps({"mode": "write" if args.write else "check", "files": len(outputs), "changed": len(drift)}))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError) as error:
        print(f"derived fixture refresh: {error}", file=sys.stderr)
        sys.exit(1)
