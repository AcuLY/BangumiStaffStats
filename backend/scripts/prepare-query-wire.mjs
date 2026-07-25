import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const expectedSchemas = [
  "catalog-context-v1.schema.json",
  "effective-query-v1.schema.json",
  "error-envelope-v1.schema.json",
  "operation-components-v1.schema.json",
  "query-digest-projection-v1.schema.json",
  "share-payload-v1.schema.json",
  "shared-query-v1.schema.json",
];

const expectedPublicComponents = [
  "SharedQueryV1",
  "EffectiveQueryV1",
  "QueryDigestProjectionV1",
  "CatalogContextV1",
  "RankingsViewV1",
  "CandidatesInputV1",
  "CandidatesViewV1",
  "PersonDetailInputV1",
  "PersonDetailViewV1",
  "PartnersInputV1",
  "PartnersViewV1",
  "CoStarInputV1",
  "CoStarViewV1",
  "ErrorEnvelopeV1",
  "SharePayloadV1",
  "RankingShareWorkspaceV1",
  "CoStarShareWorkspaceV1",
];

const forbiddenBundleKeywords = [
  "$anchor",
  "$dynamicAnchor",
  "$dynamicRef",
  "$id",
  "$recursiveRef",
  "$ref",
  "$schema",
];

const scriptFile = fileURLToPath(import.meta.url);
const backendRoot = path.resolve(path.dirname(scriptFile), "..");
const repositoryRoot = path.resolve(backendRoot, "..");
const disposableRoot = path.join(backendRoot, ".tmp", "query-wire");
const authorityOpenAPI = path.join(
  repositoryRoot,
  "contracts",
  "openapi",
  "openapi.yaml",
);
const authoritySchemaRoot = path.join(
  repositoryRoot,
  "contracts",
  "schemas",
  "query",
);
const authorityManifest = path.join(
  repositoryRoot,
  "contracts",
  "goldens",
  "query",
  "manifest.json",
);

const [mode, targetArgument] = process.argv.slice(2);
if (
  !["prepare", "verify-bundle"].includes(mode) ||
  typeof targetArgument !== "string"
) {
  throw new Error(
    "usage: node prepare-query-wire.mjs <prepare|verify-bundle> <projection-root>",
  );
}

const projectionRoot = assertDisposableProjection(targetArgument);
if (mode === "prepare") {
  prepareProjection(projectionRoot);
} else {
  verifyBundle(projectionRoot);
}

function prepareProjection(root) {
  const sourceOpenAPIRoot = path.join(root, "source", "openapi");
  const sourceSchemaRoot = path.join(root, "source", "schemas", "query");
  resetDirectory(root);
  fs.mkdirSync(sourceOpenAPIRoot, { recursive: true });
  fs.mkdirSync(sourceSchemaRoot, { recursive: true });

  const schemaNames = fs
    .readdirSync(authoritySchemaRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".schema.json"))
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(schemaNames, expectedSchemas, "query schema inventory");

  const authority = JSON.parse(
    readRegularFile(authorityOpenAPI).toString("utf8"),
  );
  assert.equal(authority.openapi, "3.1.0");
  assert.deepEqual(Object.keys(authority.paths ?? {}).sort(), ["/catalog"]);
  assert(authority.paths["/catalog"]?.get, "catalog operation is missing");
  assert.deepEqual(
    expectedPublicComponents.filter(
      (name) => !Object.hasOwn(authority.components?.schemas ?? {}, name),
    ),
    [],
    "OpenAPI query component inventory",
  );
  const openAPI = structuredClone(authority);
  openAPI.info.description =
    "Wave 1 shared query components. Business endpoint paths and result DTOs are intentionally deferred.";
  openAPI.paths = {};
  openAPI.components.schemas = Object.fromEntries(
    expectedPublicComponents.map((name) => [
      name,
      authority.components.schemas[name],
    ]),
  );
  const openAPIBytes = Buffer.from(`${JSON.stringify(openAPI, null, 2)}\n`);
  fs.writeFileSync(path.join(sourceOpenAPIRoot, "openapi.yaml"), openAPIBytes);

  const documents = new Map([
    [path.join(sourceOpenAPIRoot, "openapi.yaml"), openAPI],
  ]);
  let deletedRootKeys = 0;
  for (const schemaName of schemaNames) {
    const authorityPath = path.join(authoritySchemaRoot, schemaName);
    const authority = JSON.parse(readRegularFile(authorityPath).toString("utf8"));
    assert.equal(typeof authority.$id, "string", `${schemaName}: root $id`);
    assert.equal(
      authority.$schema,
      "https://json-schema.org/draft/2020-12/schema",
      `${schemaName}: root $schema`,
    );

    const sanitized = structuredClone(authority);
    delete sanitized.$id;
    delete sanitized.$schema;
    deletedRootKeys += 2;
    assert.equal("$id" in sanitized, false);
    assert.equal("$schema" in sanitized, false);

    const projectionPath = path.join(sourceSchemaRoot, schemaName);
    fs.writeFileSync(projectionPath, `${JSON.stringify(sanitized, null, 2)}\n`);
    documents.set(projectionPath, sanitized);
  }
  assert.equal(deletedRootKeys, 14);
  fs.writeFileSync(path.join(root, "redocly.yaml"), "{}\n");

  const referenceCount = auditReferences(documents, path.join(root, "source"));
  assert(referenceCount > expectedPublicComponents.length);
  console.log(
    JSON.stringify({
      schemaFiles: schemaNames.length,
      publicComponents: expectedPublicComponents.length,
      deletedRootKeys,
      resolvedReferences: referenceCount,
    }),
  );
}

function verifyBundle(root) {
  const bundlePath = path.join(root, "query.bundle.json");
  const bundleBytes = readRegularFile(bundlePath);
  const bundle = JSON.parse(bundleBytes.toString("utf8"));
  const manifest = JSON.parse(readRegularFile(authorityManifest).toString("utf8"));
  const expected = manifest.acceptanceEvidence?.bundle;
  assert(expected, "shared bundle evidence");

  assert.equal(bundleBytes.byteLength, expected.bytes, "bundle byte length");
  assert.equal(sha256(bundleBytes), expected.sha256, "bundle digest");
  assert.deepEqual(bundle.paths, {});
  assert.deepEqual(
    expectedPublicComponents.filter(
      (name) => !Object.hasOwn(bundle.components?.schemas ?? {}, name),
    ),
    [],
    "bundle public components",
  );
  assert.equal(
    Object.keys(bundle.components.schemas).length,
    expected.totalComponentSchemas,
    "bundle component count",
  );

  const forbiddenCounts = Object.fromEntries(
    forbiddenBundleKeywords.map((keyword) => [keyword, 0]),
  );
  walkJSON(bundle, (key) => {
    if (Object.hasOwn(forbiddenCounts, key)) {
      forbiddenCounts[key] += 1;
    }
  });
  assert.deepEqual(
    forbiddenCounts,
    expected.forbiddenKeywordCounts,
    "fully dereferenced bundle keywords",
  );
  console.log(
    JSON.stringify({
      bundleBytes: bundleBytes.byteLength,
      bundleSha256: sha256(bundleBytes),
      componentSchemas: Object.keys(bundle.components.schemas).length,
      forbiddenCounts,
    }),
  );
}

function auditReferences(documents, sourceRoot) {
  const approvedFiles = new Set(documents.keys());
  let count = 0;
  for (const [documentPath, document] of documents) {
    walkJSON(document, (key, value) => {
      if (key !== "$ref") {
        return;
      }
      assert.equal(typeof value, "string", `${documentPath}: non-string $ref`);
      count += 1;
      const [referencePath] = value.split("#", 1);
      if (referencePath === "") {
        return;
      }
      assert.equal(
        /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(referencePath),
        false,
        `${documentPath}: URL reference`,
      );
      const resolved = path.resolve(path.dirname(documentPath), referencePath);
      assert(isWithin(sourceRoot, resolved), `${documentPath}: escaping $ref`);
      assert(approvedFiles.has(resolved), `${documentPath}: unresolved $ref ${value}`);
    });
  }
  return count;
}

function walkJSON(value, visitor) {
  if (Array.isArray(value)) {
    for (const child of value) {
      walkJSON(child, visitor);
    }
    return;
  }
  if (value === null || typeof value !== "object") {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    visitor(key, child);
    walkJSON(child, visitor);
  }
}

function assertDisposableProjection(target) {
  const resolved = path.resolve(target);
  assert(isWithin(disposableRoot, resolved), "projection escapes backend/.tmp");
  assert.notEqual(resolved, disposableRoot, "projection must be a descendant");
  return resolved;
}

function resetDirectory(target) {
  if (fs.existsSync(target)) {
    assert.equal(fs.lstatSync(target).isSymbolicLink(), false);
    fs.rmSync(target, { recursive: true });
  }
  fs.mkdirSync(target, { recursive: true });
}

function readRegularFile(filename) {
  const metadata = fs.lstatSync(filename);
  assert.equal(metadata.isSymbolicLink(), false, `${filename}: symlink`);
  assert.equal(metadata.isFile(), true, `${filename}: not a regular file`);
  return fs.readFileSync(filename);
}

function isWithin(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}
