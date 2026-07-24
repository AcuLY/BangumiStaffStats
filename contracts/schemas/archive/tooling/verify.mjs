#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { TextDecoder } from "node:util";
import Ajv2020 from "ajv/dist/2020.js";

const SCRIPT = fs.realpathSync(fileURLToPath(import.meta.url));
const TOOLING_ROOT = path.dirname(SCRIPT);
const SCHEMA_ROOT = path.dirname(TOOLING_ROOT);
const CONTRACTS_ROOT = path.dirname(path.dirname(SCHEMA_ROOT));
const GOLDEN_ROOT = path.join(CONTRACTS_ROOT, "goldens", "archive");
const REPOSITORY_ROOT = path.dirname(CONTRACTS_ROOT);
const SAFE_INTEGER_MAX = 9_007_199_254_740_991;
const ALGORITHM = "bgmss-archive-data-version-v1";
const SCHEMA_OBJECT_ALGORITHM = "bgmss-sqlite-schema-objects-v1";
const SCHEMA_OBJECT_COUNT = 35;
const COMMON_COMMIT = "6a8442c17143a870357a5ff812362e8b5cfe9f9d";
const SOURCE_NAMES = [
  "subject.jsonlines",
  "person.jsonlines",
  "character.jsonlines",
  "subject-persons.jsonlines",
  "subject-characters.jsonlines",
  "person-characters.jsonlines",
  "subject-relations.jsonlines",
];
const SCHEMA_FILES = {
  manifest: "archive-manifest.schema.json",
  pointer: "current-pointer.schema.json",
  dataVersionInput: "data-version-input.schema.json",
  fixtureIndex: "fixture-index.schema.json",
};
const EXPECTED_SCHEMA_INVENTORY = [
  "README.md",
  "archive-manifest.schema.json",
  "compatibility-matrix.json",
  "current-pointer.schema.json",
  "data-version-input.schema.json",
  "fixture-index.schema.json",
  "schema.sql",
  "tooling/build_sqlite_fixtures.py",
  "tooling/package-lock.json",
  "tooling/package.json",
  "tooling/verify.mjs",
];
const RESULT_STAGE = new Map([
  ["VALID", "valid"],
  ["MANIFEST_SCHEMA_INVALID", "json-schema"],
  ["MANIFEST_ACCOUNTING_INVALID", "source-accounting"],
  ["POINTER_SCHEMA_INVALID", "json-schema"],
  ["ARCHIVE_VERSION_UNSUPPORTED", "compatibility"],
  ["DATA_VERSION_MISMATCH", "data-version"],
  ["SQLITE_DIGEST_MISMATCH", "sqlite-digest"],
  ["SQLITE_FORMAT_INVALID", "sqlite-format"],
  ["SQLITE_DATA_VERSION_MISMATCH", "sqlite-identity"],
  ["SQLITE_REQUIRED_OBJECT_MISSING", "sqlite-required-objects"],
  ["SQLITE_TABLE_COUNT_MISMATCH", "sqlite-table-count"],
]);

function invariant(value, message) {
  if (!value) throw new Error(message);
}

function readJson(filePath) {
  const bytes = fs.readFileSync(filePath);
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return JSON.parse(text);
}

function sha256(bytes) {
  return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}

function fileDigest(filePath) {
  return sha256(fs.readFileSync(filePath));
}

function canonicalJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function canonicalPreimage(input) {
  return Buffer.from(
    [
      ALGORITHM,
      `archiveRelease=${input.archiveRelease}`,
      `archiveDigest=${input.archiveDigest}`,
      `commonCommit=${input.commonCommit}`,
      `commonDigest=${input.commonDigest}`,
      `manifestSchemaVersion=${input.manifestSchemaVersion}`,
      `sqliteSchemaVersion=${input.sqliteSchemaVersion}`,
      `schemaSqlDigest=${input.schemaSqlDigest}`,
      `domainRulesVersion=${input.domainRulesVersion}`,
      `castRulesVersion=${input.castRulesVersion}`,
      `catalogConfigDigest=${input.catalogConfigDigest}`,
      "",
    ].join("\n"),
    "utf8",
  );
}

function computeDataVersion(input) {
  return `dv1-${crypto.createHash("sha256").update(canonicalPreimage(input)).digest("hex")}`;
}

function strictUtf8Bytes(value, label) {
  invariant(typeof value === "string", `${label} must be text`);
  const bytes = Buffer.from(value, "utf8");
  assert.equal(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    value,
    `${label} must round-trip exact UTF-8`,
  );
  return bytes;
}

function schemaObjectRecord(objects) {
  invariant(Array.isArray(objects), "SQLite schema objects must be an array");
  const ordered = objects.map((object, index) => {
    assert.deepEqual(
      Object.keys(object),
      ["type", "name", "table", "sql"],
      `SQLite schema object ${index} shape`,
    );
    return {
      type: strictUtf8Bytes(object.type, `schema object ${index} type`),
      name: strictUtf8Bytes(object.name, `schema object ${index} name`),
      table: strictUtf8Bytes(object.table, `schema object ${index} table`),
      sql: strictUtf8Bytes(object.sql, `schema object ${index} sql`),
    };
  });
  ordered.sort((left, right) => {
    for (const field of ["type", "name", "table"]) {
      const compared = Buffer.compare(left[field], right[field]);
      if (compared !== 0) return compared;
    }
    return 0;
  });
  const chunks = [
    Buffer.from(`${SCHEMA_OBJECT_ALGORITHM}\n`, "ascii"),
    Buffer.from(`count=${ordered.length}\n`, "ascii"),
  ];
  for (const object of ordered) {
    for (const field of ["type", "name", "table", "sql"]) {
      const value = object[field];
      chunks.push(Buffer.from(`${field}=${value.length}:`, "ascii"), value, Buffer.from("\n"));
    }
  }
  return {
    algorithm: SCHEMA_OBJECT_ALGORITHM,
    digest: sha256(Buffer.concat(chunks)),
    objectCount: ordered.length,
  };
}

function manifestInputs(manifest) {
  return {
    archiveRelease: manifest.archiveRelease,
    archiveDigest: manifest.archiveDigest,
    commonCommit: manifest.commonCommit,
    commonDigest: manifest.commonDigest,
    manifestSchemaVersion: manifest.manifestSchemaVersion,
    sqliteSchemaVersion: manifest.sqliteSchemaVersion,
    schemaSqlDigest: manifest.schemaSqlDigest,
    domainRulesVersion: manifest.domainRulesVersion,
    castRulesVersion: manifest.castRulesVersion,
    catalogConfigDigest: manifest.catalogConfigDigest,
  };
}

function parseVersion(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version);
  invariant(match, `cannot parse version: ${version}`);
  return match.slice(1).map(Number);
}

function versionAtLeast(version, minimum) {
  const actual = parseVersion(version);
  const required = parseVersion(minimum);
  for (let index = 0; index < 3; index += 1) {
    if (actual[index] !== required[index]) return actual[index] > required[index];
  }
  return true;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? REPOSITORY_ROOT,
    env: options.env ?? process.env,
    input: options.input,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      [
        `command failed (${result.status}): ${command} ${args.join(" ")}`,
        result.stdout?.trim(),
        result.stderr?.trim(),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return result.stdout.trim();
}

function canonicalContained(candidate, parent, label, allowMissing = false) {
  const parentReal = fs.realpathSync(parent);
  const candidateAbsolute = path.resolve(candidate);
  const candidateReal = allowMissing
    ? fs.realpathSync(path.dirname(candidateAbsolute))
    : fs.realpathSync(candidateAbsolute);
  const target = allowMissing
    ? path.join(candidateReal, path.basename(candidateAbsolute))
    : candidateReal;
  invariant(
    target === parentReal || target.startsWith(`${parentReal}${path.sep}`),
    `${label} escapes ${parentReal}: ${target}`,
  );
  return target;
}

function ensureContainedDirectory(candidate, parent, label) {
  const candidateAbsolute = path.resolve(candidate);
  const parentReal = fs.realpathSync(parent);
  invariant(
    candidateAbsolute.startsWith(`${parentReal}${path.sep}`),
    `${label} is not lexically below ${parentReal}: ${candidateAbsolute}`,
  );
  fs.mkdirSync(candidateAbsolute, { recursive: true });
  invariant(!fs.lstatSync(candidateAbsolute).isSymbolicLink(), `${label} is a symlink`);
  return canonicalContained(candidateAbsolute, parentReal, label);
}

function validateEnvironment({ requireGo }) {
  invariant(versionAtLeast(process.version, "20.19.0"), `Node ${process.version} is too old`);
  const npmVersion = run("npm", ["--version"]);
  invariant(versionAtLeast(npmVersion, "10.0.0"), `npm ${npmVersion} is too old`);
  invariant(
    String(process.env.npm_config_engine_strict).toLowerCase() === "true",
    "npm_config_engine_strict must be true",
  );
  const tmpDir = process.env.TMPDIR;
  const npmCache = process.env.npm_config_cache;
  invariant(tmpDir, "TMPDIR must be explicit");
  invariant(npmCache, "npm_config_cache must be explicit");
  ensureContainedDirectory(tmpDir, path.join(SCHEMA_ROOT, ".tmp"), "TMPDIR");
  ensureContainedDirectory(npmCache, path.join(SCHEMA_ROOT, ".cache"), "npm cache");
  assert.equal(
    fs.realpathSync(run("npm", ["config", "get", "cache"])),
    fs.realpathSync(npmCache),
    "effective npm cache differs from npm_config_cache",
  );
  canonicalContained(
    path.join(TOOLING_ROOT, "node_modules"),
    TOOLING_ROOT,
    "node_modules",
  );
  if (requireGo) {
    for (const name of ["GOCACHE", "GOMODCACHE", "GOPATH"]) {
      invariant(process.env[name], `${name} must be explicit`);
      ensureContainedDirectory(
        process.env[name],
        path.join(SCHEMA_ROOT, ".cache"),
        name,
      );
    }
    assert.equal(process.env.GOENV, "off", "GOENV must be off");
    assert.equal(process.env.GOWORK, "off", "GOWORK must be off");
    assert.equal(process.env.GOTOOLCHAIN, "local", "GOTOOLCHAIN must be local");
  }
  return { nodeVersion: process.version, npmVersion };
}

function validateStrictJsonDecoding() {
  const categories = [
    "manifest",
    "pointer",
    "index",
    "vector",
    "matrix",
    "schema",
    "package",
    "lockfile",
  ];
  const invalidUtf8Json = Buffer.from([
    0x7b, 0x22, 0x76, 0x61, 0x6c, 0x75, 0x65, 0x22, 0x3a, 0x22,
    0xc3, 0x28,
    0x22, 0x7d,
  ]);
  const tempParent = fs.realpathSync(process.env.TMPDIR);
  const root = fs.mkdtempSync(path.join(tempParent, "strict-json-"));
  canonicalContained(root, path.join(SCHEMA_ROOT, ".tmp"), "strict JSON self-test");
  try {
    for (const category of categories) {
      const candidate = path.join(root, `${category}.json`);
      fs.writeFileSync(candidate, invalidUtf8Json);
      assert.throws(
        () => readJson(candidate),
        (error) => error instanceof TypeError,
        `${category} invalid UTF-8 must fail before JSON.parse`,
      );
    }
  } finally {
    fs.rmSync(root, { recursive: true });
  }
  return { categories, rejectedBytes: invalidUtf8Json.length };
}

function walkSchema(node, location = "#") {
  if (Array.isArray(node)) {
    node.forEach((child, index) => walkSchema(child, `${location}/${index}`));
    return;
  }
  if (node === null || typeof node !== "object") return;
  if (node.type === "object") {
    assert.equal(
      node.additionalProperties,
      false,
      `${location}: every object schema must reject unknown fields`,
    );
  }
  if (node.type === "integer") {
    invariant(
      Number.isSafeInteger(node.maximum) && node.maximum <= SAFE_INTEGER_MAX,
      `${location}: integer maximum must be JSON-safe`,
    );
    invariant(
      Number.isSafeInteger(node.minimum) && node.minimum >= -SAFE_INTEGER_MAX,
      `${location}: integer minimum must be JSON-safe`,
    );
  }
  for (const [key, value] of Object.entries(node)) {
    walkSchema(value, `${location}/${key}`);
  }
}

function persistentSchemaInventory() {
  const result = [];
  function visit(directory, prefix = "") {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (
        (prefix === "" && [".cache", ".tmp"].includes(entry.name)) ||
        (prefix === "tooling" && entry.name === "node_modules")
      ) {
        continue;
      }
      invariant(!entry.isSymbolicLink(), `schema symlink forbidden: ${prefix}/${entry.name}`);
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute, relative);
      else {
        invariant(entry.isFile(), `non-regular schema entry: ${relative}`);
        result.push(relative);
      }
    }
  }
  visit(SCHEMA_ROOT);
  return result.sort();
}

function validateLockfile() {
  const packageJson = readJson(path.join(TOOLING_ROOT, "package.json"));
  const lock = readJson(path.join(TOOLING_ROOT, "package-lock.json"));
  assert.deepEqual(packageJson.devDependencies, { ajv: "8.20.0", quicktype: "26.0.0" });
  invariant(!("dependencies" in packageJson), "runtime dependencies are forbidden");
  assert.deepEqual(packageJson.overrides, { "stream-json": "2.1.0" });
  assert.equal(packageJson.engines.node, ">=20.19.0");
  assert.equal(packageJson.engines.npm, ">=10");
  assert.deepEqual(lock.packages[""].devDependencies, packageJson.devDependencies);
  assert.equal(lock.packages["node_modules/ajv"].version, "8.20.0");
  assert.equal(lock.packages["node_modules/quicktype"].version, "26.0.0");
  assert.equal(lock.packages["node_modules/stream-json"].version, "2.1.0");
}

function validateInstalledToolGraph() {
  const tree = JSON.parse(run("npm", ["ls", "quicktype", "stream-json", "--all", "--json"], {
    cwd: TOOLING_ROOT,
  }));
  const versions = new Map([
    ["quicktype", []],
    ["stream-json", []],
  ]);
  function visit(dependencies) {
    if (!dependencies || typeof dependencies !== "object") return;
    for (const [name, dependency] of Object.entries(dependencies)) {
      if (versions.has(name)) versions.get(name).push(dependency.version);
      visit(dependency.dependencies);
    }
  }
  visit(tree.dependencies);
  assert.deepEqual(versions.get("quicktype"), ["26.0.0"]);
  assert.deepEqual(versions.get("stream-json"), ["2.1.0"]);
  invariant(
    !JSON.stringify(tree).includes('"3.5.0"'),
    "installed npm graph still contains stream-json 3.5.0",
  );
  const require = createRequire(path.join(TOOLING_ROOT, "package.json"));
  const streamJson = require("stream-json");
  assert.equal(
    typeof streamJson.parser?.asStream,
    "function",
    "stream-json parser.asStream must be callable",
  );
  return {
    quicktypeVersions: versions.get("quicktype"),
    streamJsonVersions: versions.get("stream-json"),
    parserAsStream: typeof streamJson.parser.asStream,
  };
}

function compileSchemas() {
  const ajv = new Ajv2020({
    strict: true,
    allErrors: true,
    validateFormats: false,
    allowUnionTypes: false,
  });
  const schemas = {};
  const validators = {};
  for (const [name, basename] of Object.entries(SCHEMA_FILES)) {
    const schema = readJson(path.join(SCHEMA_ROOT, basename));
    walkSchema(schema, basename);
    schemas[name] = schema;
    validators[name] = ajv.compile(schema);
  }
  return { schemas, validators };
}

function semanticManifestError(manifest) {
  const names = manifest.sourceFiles.map((source) => source.name);
  if (
    names.length !== SOURCE_NAMES.length ||
    new Set(names).size !== SOURCE_NAMES.length ||
    SOURCE_NAMES.some((name) => !names.includes(name))
  ) {
    return "MANIFEST_ACCOUNTING_INVALID";
  }
  for (const source of manifest.sourceFiles) {
    const outcome =
      source.imported + source.duplicate + source.invalid + source.unresolved;
    if (!Number.isSafeInteger(outcome) || outcome !== source.recordsTotal) {
      return "MANIFEST_ACCOUNTING_INVALID";
    }
  }
  if (manifest.commonCommit !== COMMON_COMMIT) return "MANIFEST_ACCOUNTING_INVALID";
  return null;
}

function compatible(pointer, manifest, matrix) {
  return (
    manifest.schemaSqlDigest === matrix.canonicalSchema.schemaSqlDigest &&
    matrix.supported.some(
    (entry) =>
      entry.pointerSchemaVersion === pointer.pointerSchemaVersion &&
      entry.manifestSchemaVersion === manifest.manifestSchemaVersion &&
      entry.sqliteSchemaVersion === manifest.sqliteSchemaVersion &&
      entry.dataVersionAlgorithm === manifest.dataVersionAlgorithm,
    )
  );
}

const SQLITE_INSPECTOR = String.raw`
import json, sqlite3, sys
request = json.load(sys.stdin)
try:
    uri = "file:" + request["path"] + "?mode=ro&immutable=1"
    con = sqlite3.connect(uri, uri=True)
    try:
        result = {
            "ok": True,
            "applicationId": int(con.execute("PRAGMA application_id").fetchone()[0]),
            "userVersion": int(con.execute("PRAGMA user_version").fetchone()[0]),
            "integrity": con.execute("PRAGMA integrity_check").fetchone()[0],
            "foreignKeyCheck": con.execute("PRAGMA foreign_key_check").fetchall(),
            "tables": sorted(row[0] for row in con.execute("SELECT name FROM sqlite_schema WHERE type = 'table'")),
            "indexes": sorted(row[0] for row in con.execute("SELECT name FROM sqlite_schema WHERE type = 'index'")),
            "schemaObjects": [
                {"type": row[0], "name": row[1], "table": row[2], "sql": row[3]}
                for row in con.execute("""
                    SELECT type, name, tbl_name, sql
                    FROM sqlite_schema
                    WHERE type IN ('table', 'index', 'view', 'trigger')
                      AND sql IS NOT NULL
                      AND lower(substr(name, 1, 7)) <> 'sqlite_'
                    ORDER BY
                      type COLLATE BINARY,
                      name COLLATE BINARY,
                      tbl_name COLLATE BINARY
                """)
            ],
        }
        try:
            result["metadata"] = con.execute(
                "SELECT data_version, manifest_schema_version, sqlite_schema_version, data_version_algorithm, domain_rules_version, cast_rules_version, catalog_config_digest FROM archive_meta WHERE singleton = 1"
            ).fetchone()
        except sqlite3.DatabaseError:
            result["metadata"] = None
        counts = {}
        for table in request["tables"]:
            if table in result["tables"]:
                counts[table] = int(con.execute('SELECT COUNT(*) FROM "' + table + '"').fetchone()[0])
        result["counts"] = counts
        sentinels = {}
        for item in request["sentinels"]:
            try:
                row = con.execute(item["sql"]).fetchone()
                sentinels[item["id"]] = None if row is None else row[0]
            except sqlite3.DatabaseError:
                sentinels[item["id"]] = None
        result["sentinels"] = sentinels
    finally:
        con.close()
except Exception as error:
    result = {"ok": False, "error": type(error).__name__ + ": " + str(error)}
print(json.dumps(result, separators=(",", ":")))
`;

function inspectSqlite(sqlitePath, matrix) {
  const python = run("/usr/bin/which", ["python3"]);
  const output = run(
    fs.realpathSync(python),
    ["-c", SQLITE_INSPECTOR],
    {
      input: JSON.stringify({
        path: fs.realpathSync(sqlitePath),
        tables: matrix.requiredTables,
        sentinels: matrix.sentinels,
      }),
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
    },
  );
  return JSON.parse(output);
}

function validateMatrix(matrix) {
  assert.deepEqual(Object.keys(matrix), [
    "matrixSchemaVersion",
    "supported",
    "canonicalSchema",
    "requiredTables",
    "requiredIndexes",
    "validationPrecedence",
    "sentinels",
  ]);
  assert.equal(matrix.matrixSchemaVersion, 1);
  assert.deepEqual(matrix.supported, [
    {
      pointerSchemaVersion: 1,
      manifestSchemaVersion: 1,
      sqliteSchemaVersion: 1,
      sqliteApplicationId: 1111969107,
      dataVersionAlgorithm: ALGORITHM,
    },
  ]);
  assert.deepEqual(Object.keys(matrix.canonicalSchema), [
    "schemaSqlDigest",
    "algorithm",
    "digest",
    "objectCount",
  ]);
  assert.equal(
    matrix.canonicalSchema.schemaSqlDigest,
    fileDigest(path.join(SCHEMA_ROOT, "schema.sql")),
    "canonical schema.sql digest differs",
  );
  assert.equal(matrix.canonicalSchema.algorithm, SCHEMA_OBJECT_ALGORITHM);
  assert.match(matrix.canonicalSchema.digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(matrix.canonicalSchema.objectCount, SCHEMA_OBJECT_COUNT);
  assert.equal(new Set(matrix.requiredTables).size, 20);
  assert.equal(new Set(matrix.requiredIndexes).size, 15);
  assert.equal(matrix.requiredIndexes[0], "idx_subject_filter_date_id");
  invariant(
    !matrix.requiredIndexes.includes("idx_subject_type_date_id"),
    "old subject date index must not remain compatible",
  );
  assert.deepEqual(
    matrix.validationPrecedence.map((item) => item.order),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  );
  assert.deepEqual(
    matrix.sentinels.map((item) => item.id),
    [
      "unknown-position-preserved-without-catalog-placeholder",
      "eligible-exact-cast",
      "selectable-unknown-position-absent",
      "minimal-anime-subject",
      "safe-subject-count",
      "nsfw-subject-count",
      "month-filter-eligible-subject-count",
      "year-only-date-preserved",
      "null-date-precision-consistent",
    ],
  );
}

function validateBundle(bundleRoot, validators, matrix) {
  const manifestPath = path.join(bundleRoot, "archive-manifest.json");
  const pointerPath = path.join(bundleRoot, "current-pointer.json");
  const sqlitePath = path.join(bundleRoot, "bangumi.sqlite");
  let manifest;
  let pointer;
  try {
    manifest = readJson(manifestPath);
  } catch {
    return "MANIFEST_SCHEMA_INVALID";
  }
  if (!validators.manifest(manifest)) return "MANIFEST_SCHEMA_INVALID";
  try {
    pointer = readJson(pointerPath);
  } catch {
    return "POINTER_SCHEMA_INVALID";
  }
  if (!validators.pointer(pointer)) return "POINTER_SCHEMA_INVALID";
  const semanticError = semanticManifestError(manifest);
  if (semanticError) return semanticError;
  if (!compatible(pointer, manifest, matrix)) return "ARCHIVE_VERSION_UNSUPPORTED";
  if (computeDataVersion(manifestInputs(manifest)) !== manifest.dataVersion) {
    return "DATA_VERSION_MISMATCH";
  }
  if (
    pointer.dataVersion !== manifest.dataVersion ||
    pointer.manifestDigest !== sha256(fs.readFileSync(manifestPath))
  ) {
    return "SQLITE_DATA_VERSION_MISMATCH";
  }
  let sqliteStat;
  try {
    sqliteStat = fs.lstatSync(sqlitePath);
    if (!sqliteStat.isFile() || sqliteStat.isSymbolicLink()) return "SQLITE_FORMAT_INVALID";
    canonicalContained(sqlitePath, bundleRoot, "SQLite file");
  } catch {
    return "SQLITE_FORMAT_INVALID";
  }
  if (sqliteStat.size !== manifest.sqliteSize) return "SQLITE_FORMAT_INVALID";
  if (fileDigest(sqlitePath) !== manifest.sqliteDigest) return "SQLITE_DIGEST_MISMATCH";
  const inspection = inspectSqlite(sqlitePath, matrix);
  if (!inspection.ok) return "SQLITE_FORMAT_INVALID";
  const tuple = matrix.supported[0];
  const expectedMetadata = [
    manifest.dataVersion,
    manifest.manifestSchemaVersion,
    manifest.sqliteSchemaVersion,
    manifest.dataVersionAlgorithm,
    manifest.domainRulesVersion,
    manifest.castRulesVersion,
    manifest.catalogConfigDigest,
  ];
  if (
    inspection.applicationId !== tuple.sqliteApplicationId ||
    inspection.userVersion !== manifest.sqliteSchemaVersion ||
    !Array.isArray(inspection.metadata) ||
    !isDeepStrictEqual(inspection.metadata, expectedMetadata)
  ) {
    return "SQLITE_DATA_VERSION_MISMATCH";
  }
  let actualSchema;
  try {
    actualSchema = schemaObjectRecord(inspection.schemaObjects);
  } catch {
    return "SQLITE_REQUIRED_OBJECT_MISSING";
  }
  const expectedSchema = {
    algorithm: matrix.canonicalSchema.algorithm,
    digest: matrix.canonicalSchema.digest,
    objectCount: matrix.canonicalSchema.objectCount,
  };
  const tables = new Set(inspection.tables);
  const indexes = new Set(inspection.indexes);
  const sentinelsValid = matrix.sentinels.every(
    (sentinel) => inspection.sentinels[sentinel.id] === sentinel.expectedInteger,
  );
  if (
    inspection.integrity !== "ok" ||
    inspection.foreignKeyCheck.length !== 0 ||
    !isDeepStrictEqual(actualSchema, expectedSchema) ||
    matrix.requiredTables.some((table) => !tables.has(table)) ||
    matrix.requiredIndexes.some((index) => !indexes.has(index)) ||
    !sentinelsValid
  ) {
    return "SQLITE_REQUIRED_OBJECT_MISSING";
  }
  for (const table of matrix.requiredTables) {
    if (inspection.counts[table] !== manifest.tableCounts[table]) {
      return "SQLITE_TABLE_COUNT_MISMATCH";
    }
  }
  return "VALID";
}

function isDeepStrictEqual(left, right) {
  try {
    assert.deepEqual(left, right);
    return true;
  } catch {
    return false;
  }
}

function classifyJson(filePath, validators) {
  let document;
  try {
    document = readJson(filePath);
  } catch {
    return path.basename(filePath).startsWith("pointer-")
      ? "POINTER_SCHEMA_INVALID"
      : "MANIFEST_SCHEMA_INVALID";
  }
  if (path.basename(filePath).startsWith("pointer-")) {
    return validators.pointer(document) ? "VALID" : "POINTER_SCHEMA_INVALID";
  }
  if (!validators.manifest(document)) return "MANIFEST_SCHEMA_INVALID";
  return semanticManifestError(document) ?? "VALID";
}

function validateDataVersionVector(filePath, validators) {
  const vector = readJson(filePath);
  assert.deepEqual(Object.keys(vector), [
    "vectorSchemaVersion",
    "algorithm",
    "input",
    "canonicalPreimage",
    "canonicalPreimageByteLength",
    "expectedDataVersion",
    "assertions",
  ]);
  assert.equal(vector.vectorSchemaVersion, 1);
  assert.equal(vector.algorithm, ALGORITHM);
  invariant(validators.dataVersionInput(vector.input), "vector input fails schema");
  const preimage = canonicalPreimage(vector.input);
  assert.equal(vector.canonicalPreimage, preimage.toString("utf8"));
  assert.equal(vector.canonicalPreimageByteLength, preimage.byteLength);
  assert.equal(vector.expectedDataVersion, computeDataVersion(vector.input));
  assert.equal(
    vector.assertions.stableRegeneration.expectedDataVersion,
    vector.expectedDataVersion,
  );
  const mutation = { ...vector.input };
  mutation[vector.assertions.oneFieldMutation.field] =
    vector.assertions.oneFieldMutation.value;
  invariant(validators.dataVersionInput(mutation), "mutation input fails schema");
  assert.equal(
    vector.assertions.oneFieldMutation.expectedDataVersion,
    computeDataVersion(mutation),
  );
  assert.notEqual(
    vector.assertions.oneFieldMutation.expectedDataVersion,
    vector.expectedDataVersion,
  );
  const reordered = vector.assertions.inputOrderIndependence.input;
  invariant(validators.dataVersionInput(reordered), "reordered input fails schema");
  assert.equal(computeDataVersion(reordered), vector.expectedDataVersion);
  assert.equal(
    vector.assertions.inputOrderIndependence.expectedDataVersion,
    vector.expectedDataVersion,
  );
  assert.equal(
    vector.assertions.catalogMemberReorderEquivalence.canonicalCatalogConfigDigest,
    vector.input.catalogConfigDigest,
  );
  assert.equal(
    vector.assertions.catalogMemberReorderEquivalence.expectedDataVersion,
    vector.expectedDataVersion,
  );
  assert.equal(vector.input.schemaSqlDigest, fileDigest(path.join(SCHEMA_ROOT, "schema.sql")));
  return "VALID";
}

function validateGoldenCorpus(validators, matrix) {
  const indexPath = path.join(GOLDEN_ROOT, "index.json");
  const index = readJson(indexPath);
  invariant(validators.fixtureIndex(index), `fixture index schema: ${JSON.stringify(validators.fixtureIndex.errors)}`);
  const indexedPaths = index.files.map((entry) => entry.path);
  assert.equal(new Set(indexedPaths).size, indexedPaths.length, "duplicate indexed path");
  const physical = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      invariant(!entry.isSymbolicLink(), `golden symlink forbidden: ${absolute}`);
      if (entry.isDirectory()) visit(absolute);
      else {
        invariant(entry.isFile(), `golden non-regular path: ${absolute}`);
        if (absolute !== indexPath) {
          physical.push(path.relative(GOLDEN_ROOT, absolute).split(path.sep).join("/"));
        }
      }
    }
  }
  visit(GOLDEN_ROOT);
  physical.sort();
  assert.deepEqual([...indexedPaths].sort(), physical, "fixture index is not closed-world");
  for (const entry of index.files) {
    const absolute = path.join(GOLDEN_ROOT, entry.path);
    canonicalContained(absolute, GOLDEN_ROOT, `golden ${entry.path}`);
    assert.equal(fileDigest(absolute), entry.digest, `golden digest drift: ${entry.path}`);
    assert.equal(RESULT_STAGE.get(entry.expected), entry.validationStage);
  }
  const byCase = new Map();
  for (const entry of index.files) {
    if (!byCase.has(entry.caseId)) byCase.set(entry.caseId, []);
    byCase.get(entry.caseId).push(entry);
  }
  for (const [caseId, entries] of byCase) {
    const expected = new Set(entries.map((entry) => entry.expected));
    assert.equal(expected.size, 1, `case ${caseId} has inconsistent outcomes`);
    let actual;
    if (caseId === "data-version-vector") {
      actual = validateDataVersionVector(
        path.join(GOLDEN_ROOT, entries[0].path),
        validators,
      );
    } else if (caseId === "minimal-valid") {
      actual = validateBundle(path.join(GOLDEN_ROOT, "valid", "minimal"), validators, matrix);
    } else if (entries.length === 1) {
      actual = classifyJson(path.join(GOLDEN_ROOT, entries[0].path), validators);
    } else {
      actual = validateBundle(
        path.join(GOLDEN_ROOT, "invalid", "bundles", caseId),
        validators,
        matrix,
      );
    }
    assert.equal(actual, [...expected][0], `case ${caseId}`);
  }
  assert.equal(index.files.length, 31, "approved corpus must contain 31 indexed files");
  return { indexedFiles: index.files.length, cases: byCase.size };
}

function validateDdlAndBuilder(matrix) {
  const sql = fs.readFileSync(path.join(SCHEMA_ROOT, "schema.sql"));
  invariant(!sql.includes(13), "schema.sql must use LF only");
  invariant(sql.at(-1) === 10 && sql.at(-2) !== 10, "schema.sql needs one final LF");
  const text = sql.toString("utf8");
  invariant(text.includes("PRAGMA application_id = 1111969107;"), "application_id missing");
  invariant(text.includes("PRAGMA user_version = 1;"), "user_version missing");
  for (const table of matrix.requiredTables) {
    invariant(text.includes(`CREATE TABLE ${table} (`), `DDL missing ${table}`);
  }
  for (const index of matrix.requiredIndexes) {
    invariant(text.includes(`CREATE INDEX ${index}`), `DDL missing ${index}`);
  }
  invariant(
    !text.includes("CREATE INDEX idx_subject_type_date_id"),
    "DDL retains old subject date index",
  );
  invariant(
    /nsfw\s+INTEGER\s+NOT NULL\s+CHECK\s*\(\s*nsfw\s+IN\s*\(\s*0\s*,\s*1\s*\)\s*\)/i.test(text),
    "DDL missing required boolean NSFW fact",
  );
  invariant(
    /air_date_precision\s+INTEGER/i.test(text),
    "DDL missing explicit air_date_precision",
  );
  invariant(
    !/FOREIGN KEY\s*\(\s*subject_type\s*,\s*position_id\s*\).*staff_position/is.test(
      text.slice(text.indexOf("CREATE TABLE staff_credit"), text.indexOf("CREATE TABLE cast_credit")),
    ),
    "staff_credit must not foreign-key unknown positions to staff_position",
  );
  const builder = path.join(TOOLING_ROOT, "build_sqlite_fixtures.py");
  const python = fs.realpathSync(run("/usr/bin/which", ["python3"]));
  const output = run(python, [builder, "--self-test"], {
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
  });
  const report = JSON.parse(output);
  assert.equal(report.inspection.applicationId, 1111969107);
  assert.equal(report.inspection.userVersion, 1);
  assert.equal(report.inspection.tableCount, 20);
  assert.equal(report.inspection.requiredIndexCount, 15);
  const expectedSchemaObjects = {
    algorithm: matrix.canonicalSchema.algorithm,
    digest: matrix.canonicalSchema.digest,
    objectCount: matrix.canonicalSchema.objectCount,
  };
  assert.deepEqual(report.inspection.schemaObjects, expectedSchemaObjects);
  assert.deepEqual(
    report.schemaObjectSelfTest.canonical,
    expectedSchemaObjects,
  );
  assert.notEqual(
    report.schemaObjectSelfTest.weakenedDigest,
    expectedSchemaObjects.digest,
  );
  assert.equal(
    report.schemaObjectSelfTest.weakenedOutcome,
    "SQLITE_REQUIRED_OBJECT_MISSING",
  );
  assert.deepEqual(report.subjectSemantics, {
    validMappings: 7,
    rejectedNsfwMappings: 8,
    rejectedDateMappings: 18,
    rejectedSqlRows: 22,
    validSqlRows: 4,
  });
  assert.deepEqual(report.inspection.sentinels, {
    "unknown-position-preserved-without-catalog-placeholder": 1,
    "eligible-exact-cast": 1,
    "selectable-unknown-position-absent": 0,
    "minimal-anime-subject": 1,
    "safe-subject-count": 3,
    "nsfw-subject-count": 1,
    "month-filter-eligible-subject-count": 2,
    "year-only-date-preserved": 1,
    "null-date-precision-consistent": 0,
  });
  return report;
}

function directoryByteSeal(root) {
  const hash = crypto.createHash("sha256");
  let fileCount = 0;
  let byteCount = 0;
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      const relativeBytes = Buffer.from(relative, "utf8");
      hash.update(Buffer.from([entry.isDirectory() ? 1 : entry.isFile() ? 2 : 3]));
      hash.update(Buffer.from(`${relativeBytes.length}:`));
      hash.update(relativeBytes);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) {
        const bytes = fs.readFileSync(absolute);
        hash.update(Buffer.from(`${bytes.length}:`));
        hash.update(bytes);
        fileCount += 1;
        byteCount += bytes.length;
      } else if (entry.isSymbolicLink()) {
        const bytes = Buffer.from(fs.readlinkSync(absolute), "utf8");
        hash.update(Buffer.from(`${bytes.length}:`));
        hash.update(bytes);
      } else {
        throw new Error(`unsupported telemetry entry: ${absolute}`);
      }
    }
  }
  visit(root);
  return { digest: hash.digest("hex"), fileCount, byteCount };
}

function diagnosticDirectoryByteSeal(root) {
  try {
    return { ok: true, ...directoryByteSeal(root) };
  } catch (error) {
    return { ok: false, error: error?.message ?? String(error) };
  }
}

function sandboxLiteral(value) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function sanitizeGoSandboxEnvironment(environment) {
  const sanitized = { ...environment };
  const ignoredClaimKeys = Object.keys(sanitized)
    .filter((name) => name.startsWith("ARCHIVE_GO_"))
    .sort();
  for (const name of ignoredClaimKeys) delete sanitized[name];
  return { environment: sanitized, ignoredClaimKeys };
}

function directGoSandboxInvocation({
  mode,
  sandboxExecutable,
  profile,
  executable,
  args,
}) {
  invariant(mode === "off" || mode === "local", `unsafe Go telemetry mode: ${mode}`);
  invariant(path.isAbsolute(sandboxExecutable), "sandbox wrapper must be absolute");
  invariant(path.isAbsolute(executable), "Go-starting executable must be absolute");
  invariant(typeof profile === "string" && profile.length > 0, "sandbox profile must be present");
  return {
    executable: sandboxExecutable,
    args: ["-p", profile, executable, ...args],
  };
}

function validateGoSandboxPolicy({
  sandboxExecutable,
  profile,
  goExecutable,
  gofmtExecutable,
}) {
  const forgedEnvironment = {
    PATH: "/forged/path",
    ARCHIVE_GO_SANDBOX_INHERITED: "1",
    ARCHIVE_GO_SANDBOX_WRAPPER: "/usr/bin/true",
    ARCHIVE_GO_TELEMETRY_SAFE: "1",
  };
  const sanitized = sanitizeGoSandboxEnvironment(forgedEnvironment);
  assert.deepEqual(sanitized.ignoredClaimKeys, [
    "ARCHIVE_GO_SANDBOX_INHERITED",
    "ARCHIVE_GO_SANDBOX_WRAPPER",
    "ARCHIVE_GO_TELEMETRY_SAFE",
  ]);
  assert.equal(sanitized.environment.PATH, forgedEnvironment.PATH);
  for (const name of sanitized.ignoredClaimKeys) {
    assert.equal(
      Object.hasOwn(sanitized.environment, name),
      false,
      `${name} must not reach a Go-starting child`,
    );
  }
  const modes = ["off", "local"];
  const executables = [goExecutable, gofmtExecutable];
  for (const mode of modes) {
    for (const executable of executables) {
      const invocation = directGoSandboxInvocation({
        mode,
        sandboxExecutable,
        profile,
        executable,
        args: ["-self-test"],
      });
      assert.equal(invocation.executable, sandboxExecutable);
      assert.deepEqual(invocation.args, [
        "-p",
        profile,
        executable,
        "-self-test",
      ]);
    }
  }
  return {
    acceptedDiscoveryModes: modes,
    directlyWrappedExecutables: executables,
    unconditionalDirectWrapper: true,
    forgedEnvironmentKeys: sanitized.ignoredClaimKeys,
    environmentBypassAccepted: false,
  };
}

function prepareGo() {
  invariant(process.platform === "darwin", "approved Go telemetry sandbox currently requires macOS");
  const goExecutable = fs.realpathSync(run("/usr/bin/which", ["go"]));
  const gofmtExecutable = fs.realpathSync(
    path.join(path.dirname(goExecutable), "gofmt"),
  );
  const sandboxExecutable = fs.realpathSync("/usr/bin/sandbox-exec");
  const sandboxStat = fs.statSync(sandboxExecutable);
  invariant(
    sandboxStat.isFile() && (sandboxStat.mode & 0o111) !== 0,
    "sandbox-exec must be a regular executable",
  );
  const processEnvironment = sanitizeGoSandboxEnvironment(process.env);
  const ignoredClaimKeys = new Set(processEnvironment.ignoredClaimKeys);
  const controlledEnvironment = {
    ...processEnvironment.environment,
    GOENV: "off",
    GOWORK: "off",
    GOTOOLCHAIN: "local",
  };
  const bootstrapProfile = "(version 1)(allow default)(deny network*)(deny file-write*)";
  const discoveryCommand = [
    "-p",
    bootstrapProfile,
    "/usr/bin/env",
    "GOENV=off",
    "GOWORK=off",
    "GOTOOLCHAIN=local",
    goExecutable,
    "env",
    "GOTELEMETRY",
    "GOTELEMETRYDIR",
  ];
  const telemetryOutput = run(
    sandboxExecutable,
    discoveryCommand,
    { env: controlledEnvironment },
  ).split("\n");
  invariant(telemetryOutput.length === 2, `unexpected Go telemetry output: ${telemetryOutput}`);
  const [mode, telemetryDirectoryText] = telemetryOutput;
  invariant(mode === "off" || mode === "local", `unsafe Go telemetry mode: ${mode}`);
  const telemetryDirectory = fs.realpathSync(telemetryDirectoryText);
  invariant(
    fs.statSync(telemetryDirectory).isDirectory(),
    "Go telemetry directory is not a directory",
  );
  const initialSeal = diagnosticDirectoryByteSeal(telemetryDirectory);
  const profile = [
    "(version 1)",
    "(allow default)",
    "(deny network*)",
    `(deny file-write* (subpath "${sandboxLiteral(telemetryDirectory)}"))`,
  ].join("");
  const policySelfTest = validateGoSandboxPolicy({
    sandboxExecutable,
    profile,
    goExecutable,
    gofmtExecutable,
  });
  const goCommands = [];
  function runGoTool(executable, args, options = {}) {
    invariant(
      executable === goExecutable || executable === gofmtExecutable,
      `unapproved Go-starting executable: ${executable}`,
    );
    const childEnvironment = sanitizeGoSandboxEnvironment({
      ...controlledEnvironment,
      ...options.env,
      GOENV: "off",
      GOWORK: "off",
      GOTOOLCHAIN: "local",
      GOPROXY: "off",
      GOSUMDB: "off",
      CGO_ENABLED: "0",
    });
    for (const name of childEnvironment.ignoredClaimKeys) {
      ignoredClaimKeys.add(name);
    }
    const invocation = directGoSandboxInvocation({
      mode,
      sandboxExecutable,
      profile,
      executable,
      args,
    });
    const evidence = {
      executable,
      args: [...args],
      cwd: options.cwd ?? REPOSITORY_ROOT,
      wrapper: invocation.executable,
      profile,
    };
    goCommands.push(evidence);
    return run(invocation.executable, invocation.args, {
      ...options,
      env: childEnvironment.environment,
    });
  }
  function finishTelemetryDiagnostics(expectedCommandCount) {
    assert.equal(
      goCommands.length,
      expectedCommandCount,
      "unexpected Go-starting command count",
    );
    invariant(
      goCommands.every(
        (command) =>
          command.wrapper === sandboxExecutable &&
          command.profile === profile,
      ),
      "a Go-starting command lacked the telemetry write-denial sandbox",
    );
    const finalSeal = diagnosticDirectoryByteSeal(telemetryDirectory);
    const equal = isDeepStrictEqual(initialSeal, finalSeal);
    return {
      before: initialSeal,
      after: finalSeal,
      changed: !equal,
    };
  }
  return {
    mode,
    telemetryDirectory,
    initialSeal,
    sandboxExecutable,
    bootstrapProfile,
    discoveryCommand,
    profile,
    policySelfTest,
    ignoredClaimKeys,
    goCommands,
    goExecutable,
    gofmtExecutable,
    runGoTool,
    finishTelemetryDiagnostics,
  };
}

function runCodegen() {
  const quicktype = fs.realpathSync(path.join(TOOLING_ROOT, "node_modules", ".bin", "quicktype"));
  const quicktypeVersion = run(quicktype, ["--version"]);
  invariant(quicktypeVersion.includes("26.0.0"), `unexpected quicktype: ${quicktypeVersion}`);
  const codegenRoot = path.join(SCHEMA_ROOT, ".tmp", "codegen");
  fs.mkdirSync(codegenRoot, { recursive: true });
  canonicalContained(codegenRoot, path.join(SCHEMA_ROOT, ".tmp"), "codegen root");
  const go = prepareGo();
  const effectiveGoEnvironment = go
    .runGoTool(go.goExecutable, [
      "env",
      "GOCACHE",
      "GOMODCACHE",
      "GOPATH",
      "GOWORK",
      "GOENV",
      "GOTOOLCHAIN",
    ])
    .split("\n");
  assert.deepEqual(effectiveGoEnvironment, [
    fs.realpathSync(process.env.GOCACHE),
    fs.realpathSync(process.env.GOMODCACHE),
    fs.realpathSync(process.env.GOPATH),
    "off",
    "",
    "local",
  ]);
  const goVersion = go.runGoTool(go.goExecutable, ["version"]);
  const python = fs.realpathSync(run("/usr/bin/which", ["python3"]));
  const results = [];
  for (const [schemaName, basename] of Object.entries(SCHEMA_FILES)) {
    const schemaPath = path.join(SCHEMA_ROOT, basename);
    const outputRoot = path.join(codegenRoot, schemaName);
    const goRoot = path.join(outputRoot, "go");
    const pythonRoot = path.join(outputRoot, "python");
    fs.mkdirSync(goRoot, { recursive: true });
    fs.mkdirSync(pythonRoot, { recursive: true });
    const goFile = path.join(goRoot, "model.go");
    const pythonFile = path.join(pythonRoot, "model.py");
    run(quicktype, [
      "--src",
      schemaPath,
      "--src-lang",
      "schema",
      "--lang",
      "go",
      "--package",
      "archivecontract",
      "--just-types-and-package",
      "--out",
      goFile,
    ]);
    run(quicktype, [
      "--src",
      schemaPath,
      "--src-lang",
      "schema",
      "--lang",
      "python",
      "--python-version",
      "3.7",
      "--just-types",
      "--out",
      pythonFile,
    ]);
    fs.writeFileSync(
      path.join(goRoot, "go.mod"),
      `module example.invalid/archivecontract/${schemaName}\n\ngo 1.23\n`,
      "utf8",
    );
    run(python, ["-c", "import pathlib,sys; compile(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8'), sys.argv[1], 'exec')", pythonFile], {
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
    });
    go.runGoTool(go.gofmtExecutable, ["-w", goFile]);
    go.runGoTool(go.goExecutable, ["test", "./..."], { cwd: goRoot });
    results.push(schemaName);
  }
  const expectedGoCommandCount = 2 + results.length * 2;
  const telemetryDiagnostics =
    go.finishTelemetryDiagnostics(expectedGoCommandCount);
  return {
    schemas: results,
    quicktypeVersion,
    goVersion,
    effectiveGoEnvironment,
    goExecutable: go.goExecutable,
    goTelemetryMode: go.mode,
    goTelemetryDirectory: go.telemetryDirectory,
    goTelemetryDiagnostics: telemetryDiagnostics,
    goSandboxWrapper: go.sandboxExecutable,
    goSandboxBootstrapProfile: go.bootstrapProfile,
    goSandboxDiscoveryCommand: go.discoveryCommand,
    goSandboxProfile: go.profile,
    goSandboxPolicySelfTest: go.policySelfTest,
    goSandboxIgnoredEnvironmentKeys: [...go.ignoredClaimKeys].sort(),
    goSandboxedCommands: go.goCommands,
  };
}

function verifyNoCurrentJson() {
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else invariant(entry.name !== "current.json", `runtime pointer forbidden: ${absolute}`);
    }
  }
  visit(SCHEMA_ROOT);
  visit(GOLDEN_ROOT);
}

function main() {
  const allowed = new Set(["--schemas-only", "--codegen-only"]);
  invariant(process.argv.slice(2).every((argument) => allowed.has(argument)), "unknown argument");
  invariant(
    !(process.argv.includes("--schemas-only") && process.argv.includes("--codegen-only")),
    "choose only one verification mode",
  );
  const codegenOnly = process.argv.includes("--codegen-only");
  const schemasOnly = process.argv.includes("--schemas-only");
  const environment = validateEnvironment({ requireGo: codegenOnly || !schemasOnly });
  const strictJson = validateStrictJsonDecoding();
  validateLockfile();
  const installedTools = validateInstalledToolGraph();
  assert.deepEqual(persistentSchemaInventory(), EXPECTED_SCHEMA_INVENTORY);
  const { validators } = compileSchemas();
  const matrix = readJson(path.join(SCHEMA_ROOT, "compatibility-matrix.json"));
  validateMatrix(matrix);
  const report = {
    environment,
    strictJson,
    schemaCount: Object.keys(validators).length,
    schemaInventory: EXPECTED_SCHEMA_INVENTORY.length,
    installedTools,
  };
  if (!codegenOnly) {
    report.ddl = validateDdlAndBuilder(matrix);
  }
  if (!schemasOnly && !codegenOnly) {
    report.goldens = validateGoldenCorpus(validators, matrix);
    verifyNoCurrentJson();
  }
  if (codegenOnly || !schemasOnly) {
    report.codegen = runCodegen();
  }
  console.log(JSON.stringify(report));
}

try {
  main();
} catch (error) {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
}
