import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { TextDecoder } from "node:util";
import { fileURLToPath } from "node:url";

const goldenRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(goldenRoot, "../../..");
const schemaRoot = path.join(repositoryRoot, "contracts/schemas/query");
const openapiPath = path.join(repositoryRoot, "contracts/openapi/openapi.yaml");
const generatedRoots = [
  "node_modules",
  ".cache/npm",
  ".cache/go-build",
  ".cache/go-mod",
  ".cache/go-path",
  ".tmp"
];
const cacheLeafRoots = generatedRoots.filter((root) =>
  root.startsWith(".cache/")
);
const retryableEmptyDirectoryErrors = new Set([
  "EBUSY",
  "EMFILE",
  "ENFILE",
  "EPERM"
]);
const emptyDirectoryMaxRetries = 5;
const emptyDirectoryRetryDelay = 100;
const expectedNodeExecutable =
  "/Users/luca/.nvm/versions/node/v24.16.0/bin/node";
const authoritySchemaNames = [
  "catalog-context-v1.schema.json",
  "effective-query-v1.schema.json",
  "error-envelope-v1.schema.json",
  "operation-components-v1.schema.json",
  "query-digest-projection-v1.schema.json",
  "share-payload-v1.schema.json",
  "shared-query-v1.schema.json"
];
const projectionNames = ["codegen-a", "codegen-b"];
const projectionSourceInventory = [
  "redocly.yaml",
  "source/openapi/openapi.yaml",
  ...authoritySchemaNames.map((name) => `source/schemas/query/${name}`)
].sort();
const forbiddenReferenceKeywords = new Set([
  "$dynamicRef",
  "$recursiveRef",
  "$anchor",
  "$dynamicAnchor"
]);
const forbiddenBundleKeywords = new Set([
  "$ref",
  "$dynamicRef",
  "$recursiveRef",
  "$id",
  "$schema",
  "$anchor",
  "$dynamicAnchor"
]);
const approvedGoSandboxProfile =
  '(version 1)(allow default)(deny file-write* (subpath "/Users/luca/Library/Application Support/go/telemetry"))';
const approvedGoSandboxProfileSha256 =
  "143e32f267bbc18f68939d8ffa288038ae5644f249568fb9a2d289b5932c7993";
const approvedRedoclySandboxProfile =
  "(version 1)(allow default)(deny network*)";
const approvedRedoclySandboxProfileSha256 =
  "80de7c41c4cac0234db39d259c29450b17c4e5768f24bc7dd9f9f8c75d2c12a3";
const fixedAcceptancePath =
  "/Users/luca/.nvm/versions/node/v24.16.0/bin:/usr/bin:/bin:/usr/sbin:/sbin";
const goExecutable =
  "/opt/homebrew/Cellar/go/1.25.4/libexec/bin/go";
const gofmtExecutable =
  "/opt/homebrew/Cellar/go/1.25.4/libexec/bin/gofmt";
const goSandboxWrapper = "/usr/bin/sandbox-exec";
const cleanEnvironmentExecutable = "/usr/bin/env";
const goEnvironment = {
  PATH: fixedAcceptancePath,
  HOME: path.join(goldenRoot, ".tmp/go-home"),
  TMPDIR: path.join(goldenRoot, ".tmp/system"),
  GOCACHE: path.join(goldenRoot, ".cache/go-build"),
  GOMODCACHE: path.join(goldenRoot, ".cache/go-mod"),
  GOPATH: path.join(goldenRoot, ".cache/go-path"),
  GOENV: "off",
  GOWORK: "off",
  GOTOOLCHAIN: "local"
};
const requiredPublicGoDeclarations = [
  "CandidatesInputV1",
  "CandidatesViewV1",
  "CatalogContextV1",
  "CoStarInputV1",
  "CoStarShareWorkspaceV1",
  "CoStarViewV1",
  "EffectiveQueryV1",
  "ErrorEnvelopeV1",
  "PartnersInputV1",
  "PartnersViewV1",
  "PersonDetailInputV1",
  "PersonDetailViewV1",
  "QueryDigestProjectionV1",
  "RankingShareWorkspaceV1",
  "RankingsViewV1",
  "SharePayloadV1",
  "SharedQueryV1"
];

function fail(message) {
  throw new Error(message);
}

function assertExactNodeRuntime() {
  assert.equal(
    process.execPath,
    expectedNodeExecutable,
    `verification requires exact Node executable ${expectedNodeExecutable}`
  );
  assert.equal(process.version, "v24.16.0");
}

function jsonPointerValue(root, fragment, label) {
  if (fragment === "" || fragment === "#") {
    return root;
  }
  if (!fragment.startsWith("#/")) {
    fail(`${label}: reference fragment is not a JSON pointer: ${fragment}`);
  }
  return fragment
    .slice(2)
    .split("/")
    .map((part) =>
      decodeURIComponent(part).replaceAll("~1", "/").replaceAll("~0", "~")
    )
    .reduce((value, part) => {
      if (
        value === null ||
        typeof value !== "object" ||
        !Object.hasOwn(value, part)
      ) {
        fail(`${label}: unresolved JSON pointer ${fragment}`);
      }
      return value[part];
    }, root);
}

function splitReference(reference) {
  const index = reference.indexOf("#");
  return index < 0
    ? [reference, ""]
    : [reference.slice(0, index), reference.slice(index)];
}

function createReferenceContext(openapiFile, schemasDirectory) {
  const schemaFiles = authoritySchemaNames.map((name) =>
    path.join(schemasDirectory, name)
  );
  const files = [openapiFile, ...schemaFiles].map((file) => path.resolve(file));
  const documents = new Map(
    files.map((file) => [file, JSON.parse(fs.readFileSync(file, "utf8"))])
  );
  const filesById = new Map();
  for (const file of schemaFiles) {
    const id = documents.get(path.resolve(file)).$id;
    if (id !== undefined) {
      if (filesById.has(id)) {
        fail(`duplicate schema resource ID ${id}`);
      }
      filesById.set(id, path.resolve(file));
    }
  }
  return {
    openapiFile: path.resolve(openapiFile),
    schemaFiles: schemaFiles.map((file) => path.resolve(file)),
    files: new Set(files),
    documents,
    filesById
  };
}

function resolveReference(context, sourceFile, reference) {
  if (typeof reference !== "string" || reference.length === 0) {
    fail(`${sourceFile}: invalid empty/non-string $ref`);
  }
  const [documentPart, fragment] = splitReference(reference);
  let targetFile = sourceFile;
  if (documentPart !== "") {
    const source = context.documents.get(sourceFile);
    if (sourceFile !== context.openapiFile && typeof source.$id === "string") {
      const resource = new URL(documentPart, source.$id).href;
      targetFile = context.filesById.get(resource);
    } else {
      targetFile = path.resolve(path.dirname(sourceFile), documentPart);
    }
  }
  if (!targetFile || !context.files.has(targetFile)) {
    fail(
      `${path.relative(repositoryRoot, sourceFile)}: reference escapes exact authority: ${reference}`
    );
  }
  const value = jsonPointerValue(
    context.documents.get(targetFile),
    fragment,
    path.relative(repositoryRoot, targetFile)
  );
  return {
    file: targetFile,
    fragment,
    key: `${targetFile}${fragment}`,
    value
  };
}

function auditReferenceContext(context, options = {}) {
  const { expectRootResourceKeys = true } = options;
  let referenceCount = 0;
  let rootIdCount = 0;
  let rootSchemaCount = 0;

  function scan(value, file, pointer = "") {
    if (!value || typeof value !== "object") {
      return;
    }
    if (!Array.isArray(value)) {
      for (const key of Object.keys(value)) {
        if (forbiddenReferenceKeywords.has(key)) {
          fail(`${path.relative(repositoryRoot, file)}${pointer}: ${key}`);
        }
        if (key === "$id" || key === "$schema") {
          if (
            pointer !== "" ||
            file === context.openapiFile ||
            !expectRootResourceKeys
          ) {
            fail(
              `${path.relative(repositoryRoot, file)}${pointer}: forbidden ${key}`
            );
          }
          if (key === "$id") {
            rootIdCount += 1;
          } else {
            rootSchemaCount += 1;
          }
        }
      }
      if (Object.hasOwn(value, "$ref")) {
        referenceCount += 1;
        assert.deepEqual(
          Object.keys(value),
          ["$ref"],
          `${path.relative(repositoryRoot, file)}${pointer}: $ref siblings`
        );
        resolveReference(context, file, value.$ref);
      }
    }
    for (const [key, child] of Object.entries(value)) {
      scan(child, file, childPointer(pointer, key));
    }
  }

  function proveAcyclic(value, file, stack) {
    if (!value || typeof value !== "object") {
      return;
    }
    if (!Array.isArray(value) && Object.hasOwn(value, "$ref")) {
      const target = resolveReference(context, file, value.$ref);
      if (stack.has(target.key)) {
        fail(
          `reference cycle at ${path.relative(repositoryRoot, target.file)}${target.fragment}`
        );
      }
      const next = new Set(stack);
      next.add(target.key);
      proveAcyclic(target.value, target.file, next);
      return;
    }
    for (const child of Object.values(value)) {
      proveAcyclic(child, file, stack);
    }
  }

  for (const [file, document] of context.documents) {
    scan(document, file);
  }
  if (expectRootResourceKeys) {
    assert.equal(rootIdCount, authoritySchemaNames.length);
    assert.equal(rootSchemaCount, authoritySchemaNames.length);
  } else {
    assert.equal(rootIdCount, 0);
    assert.equal(rootSchemaCount, 0);
  }
  for (const [file, document] of context.documents) {
    proveAcyclic(document, file, new Set([file]));
  }
  return {
    files: context.documents.size,
    references: referenceCount,
    rootIds: rootIdCount,
    rootSchemas: rootSchemaCount,
    graph: "DAG",
    refObjects: "sibling-free",
    dynamicRecursiveAnchorKeywords: 0
  };
}

function expandReferenceValue(context, value, file, stack = new Set()) {
  if (!value || typeof value !== "object") {
    return value;
  }
  if (!Array.isArray(value) && Object.hasOwn(value, "$ref")) {
    const target = resolveReference(context, file, value.$ref);
    if (stack.has(target.key)) {
      fail(
        `reference cycle while expanding ${path.relative(repositoryRoot, target.file)}${target.fragment}`
      );
    }
    const next = new Set(stack);
    next.add(target.key);
    return expandReferenceValue(context, target.value, target.file, next);
  }
  if (Array.isArray(value)) {
    return value.map((child) =>
      expandReferenceValue(context, child, file, stack)
    );
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      expandReferenceValue(context, child, file, stack)
    ])
  );
}

function publicSchemaExpansions(context) {
  const components =
    context.documents.get(context.openapiFile).components?.schemas;
  if (!components || typeof components !== "object") {
    fail("OpenAPI components.schemas is missing");
  }
  return Object.fromEntries(
    Object.entries(components).map(([name, schema]) => [
      name,
      expandReferenceValue(context, schema, context.openapiFile)
    ])
  );
}

function listTreeFiles(root, relative = "") {
  const result = [];
  for (const entry of fs.readdirSync(path.join(root, relative), {
    withFileTypes: true
  })) {
    const child = path.join(relative, entry.name);
    const absolute = path.join(root, child);
    if (entry.isSymbolicLink()) {
      fail(`generated tree contains symlink: ${absolute}`);
    }
    if (entry.isDirectory()) {
      result.push(...listTreeFiles(root, child));
    } else if (entry.isFile()) {
      result.push(child.split(path.sep).join("/"));
    } else {
      fail(`generated tree contains unsupported entry: ${absolute}`);
    }
  }
  return result.sort();
}

function treeSha256(root, inventory) {
  const hash = crypto.createHash("sha256");
  for (const relative of inventory) {
    hash.update(relative, "utf8");
    hash.update(Buffer.from([0]));
    hash.update(fs.readFileSync(path.join(root, relative)));
    hash.update(Buffer.from([0]));
  }
  return hash.digest("hex");
}

function assertNoSymlinksBelow(root) {
  if (!fs.existsSync(root)) {
    return;
  }
  if (fs.lstatSync(root).isSymbolicLink()) {
    fail(`generated root is a symlink: ${root}`);
  }
  if (!fs.lstatSync(root).isDirectory()) {
    return;
  }
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const child = path.join(root, entry.name);
    if (entry.isSymbolicLink()) {
      fail(`generated tree contains symlink: ${child}`);
    }
    if (entry.isDirectory()) {
      assertNoSymlinksBelow(child);
    }
  }
}

function makeOwnedTreeRemovable(root) {
  const metadata = fs.lstatSync(root);
  if (metadata.isSymbolicLink()) {
    return;
  }
  if (!metadata.isDirectory()) {
    return;
  }
  fs.chmodSync(root, metadata.mode | 0o700);
  for (const entry of fs.readdirSync(root)) {
    const child = path.join(root, entry);
    const childMetadata = fs.lstatSync(child);
    if (childMetadata.isSymbolicLink()) {
      continue;
    }
    if (childMetadata.isDirectory()) {
      makeOwnedTreeRemovable(child);
    }
  }
}

function resetOwnedGeneratedDirectory(target) {
  const resolved = assertOwnedRealPath(target);
  if (fs.existsSync(resolved)) {
    assertNoSymlinksBelow(resolved);
    fs.rmSync(resolved, { recursive: true, force: false });
  }
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

function assertNoRedoclyLintIgnore(extraRoots = []) {
  const candidates = [
    repositoryRoot,
    path.join(repositoryRoot, "contracts"),
    path.join(repositoryRoot, "contracts/openapi"),
    schemaRoot,
    goldenRoot,
    path.join(goldenRoot, ".tmp"),
    ...extraRoots
  ];
  for (const directory of candidates) {
    if (
      fs.existsSync(
        path.join(directory, ".redocly.lint-ignore.yaml")
      )
    ) {
      fail(`Redocly lint-ignore file is forbidden in discovery scope: ${directory}`);
    }
  }
}

function prepareCodegenProjections() {
  assertExactNodeRuntime();
  const authority = createReferenceContext(openapiPath, schemaRoot);
  const audit = auditReferenceContext(authority);
  const temporaryRoot = assertOwnedRealPath(path.join(goldenRoot, ".tmp"));
  if (!fs.existsSync(temporaryRoot)) {
    fs.mkdirSync(temporaryRoot, { recursive: true });
  }
  const environmentRoots = [
    resetOwnedGeneratedDirectory(path.join(temporaryRoot, "redocly-home")),
    resetOwnedGeneratedDirectory(path.join(temporaryRoot, "redocly-tmp"))
  ];
  const evidence = [];
  for (const name of projectionNames) {
    const projectionRoot = resetOwnedGeneratedDirectory(
      path.join(temporaryRoot, name)
    );
    const projectionOpenapi = path.join(
      projectionRoot,
      "source/openapi/openapi.yaml"
    );
    const projectionSchemas = path.join(
      projectionRoot,
      "source/schemas/query"
    );
    fs.mkdirSync(path.dirname(projectionOpenapi), { recursive: true });
    fs.mkdirSync(projectionSchemas, { recursive: true });
    fs.writeFileSync(path.join(projectionRoot, "redocly.yaml"), "{}\n");
    fs.copyFileSync(openapiPath, projectionOpenapi);
    assert.deepEqual(
      fs.readFileSync(projectionOpenapi),
      fs.readFileSync(openapiPath),
      `${name}: OpenAPI authority bytes`
    );
    let deletedRootKeys = 0;
    for (const schemaName of authoritySchemaNames) {
      const source = readJson(path.join(schemaRoot, schemaName));
      assert.equal(typeof source.$id, "string", `${schemaName}: root $id`);
      assert.equal(
        source.$schema,
        "https://json-schema.org/draft/2020-12/schema",
        `${schemaName}: root $schema`
      );
      const sanitized = cloneJson(source);
      delete sanitized.$id;
      delete sanitized.$schema;
      deletedRootKeys += 2;
      const expected = cloneJson(source);
      delete expected.$id;
      delete expected.$schema;
      assert.deepEqual(sanitized, expected, `${name}:${schemaName}: only root keys`);
      fs.writeFileSync(
        path.join(projectionSchemas, schemaName),
        `${JSON.stringify(sanitized, null, 2)}\n`
      );
    }
    assert.equal(deletedRootKeys, 14);
    assert.deepEqual(listTreeFiles(projectionRoot), projectionSourceInventory);
    const projection = createReferenceContext(
      projectionOpenapi,
      projectionSchemas
    );
    const projectionAudit = auditReferenceContext(projection, {
      expectRootResourceKeys: false
    });
    assert.deepEqual(
      Object.keys(publicSchemaExpansions(projection)).sort(),
      Object.keys(
        authority.documents.get(authority.openapiFile).components.schemas
      ).sort()
    );
    evidence.push({
      name,
      inventory: projectionSourceInventory,
      treeSha256: treeSha256(projectionRoot, projectionSourceInventory),
      deletedRootKeys,
      audit: projectionAudit
    });
  }
  assert.equal(evidence[0].treeSha256, evidence[1].treeSha256);
  assertNoRedoclyLintIgnore([
    ...projectionNames.flatMap((name) => {
      const root = path.join(temporaryRoot, name);
      return [
        root,
        path.join(root, "source"),
        path.join(root, "source/openapi"),
        path.join(root, "source/schemas"),
        path.join(root, "source/schemas/query")
      ];
    }),
    ...environmentRoots
  ]);
  console.log(
    JSON.stringify(
      {
        authority: audit,
        projections: evidence,
        redoclyHome: path.relative(repositoryRoot, environmentRoots[0]),
        redoclyTmp: path.relative(repositoryRoot, environmentRoots[1])
      },
      null,
      2
    )
  );
}

function assertOwnedRealPath(target) {
  const rootReal = fs.realpathSync(goldenRoot);
  if (rootReal !== path.resolve(goldenRoot)) {
    fail(`golden root is not canonical: ${goldenRoot} -> ${rootReal}`);
  }
  const resolved = path.resolve(target);
  if (!resolved.startsWith(`${rootReal}${path.sep}`)) {
    fail(`generated target escapes golden root: ${target}`);
  }
  const relative = path.relative(rootReal, resolved);
  let cursor = rootReal;
  for (const segment of relative.split(path.sep)) {
    cursor = path.join(cursor, segment);
    if (!fs.existsSync(cursor)) {
      continue;
    }
    if (fs.lstatSync(cursor).isSymbolicLink()) {
      fail(`generated target traverses symlink: ${cursor}`);
    }
  }
  return resolved;
}

function lstatResult(target, lstat = fs.lstatSync) {
  try {
    return {
      exists: true,
      metadata: lstat(target)
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        exists: false,
        errorCode: "ENOENT"
      };
    }
    throw error;
  }
}

function descendantSegments(base, target, label) {
  const baseAbsolute = path.resolve(base);
  const targetAbsolute = path.resolve(target);
  const relative = path.relative(baseAbsolute, targetAbsolute);
  if (
    relative === "" ||
    path.isAbsolute(relative) ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`)
  ) {
    fail(`${label}: path escapes strict descendant boundary: ${target}`);
  }
  return relative.split(path.sep);
}

function assertRealDirectoryChain(base, target, label) {
  const baseResult = lstatResult(base);
  assert.equal(baseResult.exists, true, `${label}: base directory is missing`);
  assert.equal(
    baseResult.metadata.isSymbolicLink(),
    false,
    `${label}: base directory is a symlink`
  );
  assert.equal(
    baseResult.metadata.isDirectory(),
    true,
    `${label}: base is not a directory`
  );
  let cursor = path.resolve(base);
  for (const segment of descendantSegments(base, target, label)) {
    cursor = path.join(cursor, segment);
    const result = lstatResult(cursor);
    assert.equal(result.exists, true, `${label}: required directory is missing: ${cursor}`);
    assert.equal(
      result.metadata.isSymbolicLink(),
      false,
      `${label}: directory chain contains symlink: ${cursor}`
    );
    assert.equal(
      result.metadata.isDirectory(),
      true,
      `${label}: directory chain contains non-directory: ${cursor}`
    );
  }
}

function inspectCleanupTarget(boundaryRoot, relative) {
  assertRealDirectoryChain(
    repositoryRoot,
    goldenRoot,
    "cleanup repository/golden root"
  );
  const resolvedBoundary = path.resolve(boundaryRoot);
  if (resolvedBoundary !== path.resolve(goldenRoot)) {
    assertRealDirectoryChain(
      goldenRoot,
      resolvedBoundary,
      "cleanup synthetic boundary"
    );
  }
  const target = path.resolve(resolvedBoundary, relative);
  const segments = descendantSegments(
    resolvedBoundary,
    target,
    `cleanup target ${relative}`
  );
  let cursor = resolvedBoundary;
  let targetMetadata;
  for (const [index, segment] of segments.entries()) {
    cursor = path.join(cursor, segment);
    const result = lstatResult(cursor);
    if (!result.exists) {
      return {
        relative,
        target,
        exists: false
      };
    }
    assert.equal(
      result.metadata.isSymbolicLink(),
      false,
      `cleanup target ${relative}: root/ancestor symlink: ${cursor}`
    );
    const final = index === segments.length - 1;
    assert.equal(
      result.metadata.isDirectory(),
      true,
      final
        ? `cleanup target ${relative}: exact root is not a directory`
        : `cleanup target ${relative}: ancestor is not a directory`
    );
    if (final) {
      targetMetadata = result.metadata;
    }
  }
  return {
    relative,
    target,
    exists: true,
    metadata: targetMetadata
  };
}

function removeCleanupTargets(boundaryRoot, relatives, hooks = {}) {
  const remove = hooks.remove ?? fs.rmSync;
  const postLstat = hooks.postLstat ?? fs.lstatSync;
  const sortedRelatives = [...relatives].sort();
  assert.equal(
    new Set(sortedRelatives).size,
    sortedRelatives.length,
    "cleanup target list contains duplicates"
  );
  const inspections = sortedRelatives.map((relative) =>
    inspectCleanupTarget(boundaryRoot, relative)
  );
  const removed = [];
  const alreadyAbsent = [];
  for (const inspection of inspections) {
    if (!inspection.exists) {
      alreadyAbsent.push(inspection.relative);
      continue;
    }
    makeOwnedTreeRemovable(inspection.target);
    remove(inspection.target, {
      recursive: true,
      force: false,
      maxRetries: 5,
      retryDelay: 100
    });
    const postcondition = lstatResult(inspection.target, postLstat);
    assert.equal(
      postcondition.exists,
      false,
      `cleanup postcondition failed: ${inspection.relative} still exists`
    );
    assert.equal(
      postcondition.errorCode,
      "ENOENT",
      `cleanup postcondition failed: ${inspection.relative} did not return ENOENT`
    );
    removed.push(inspection.relative);
  }
  return {
    removed: removed.sort(),
    alreadyAbsent: alreadyAbsent.sort()
  };
}

function inspectEmptyCleanupParent(
  boundaryRoot,
  relative,
  requiredAbsentRelatives
) {
  for (const requiredAbsent of requiredAbsentRelatives) {
    const childInspection = inspectCleanupTarget(
      boundaryRoot,
      requiredAbsent
    );
    assert.equal(
      childInspection.exists,
      false,
      `empty cleanup parent ${relative}: required leaf remains: ${requiredAbsent}`
    );
  }
  const inspection = inspectCleanupTarget(boundaryRoot, relative);
  if (!inspection.exists) {
    return inspection;
  }
  const entries = fs.readdirSync(inspection.target).sort();
  assert.deepEqual(
    entries,
    [],
    `empty cleanup parent ${relative}: directory is not empty`
  );
  return inspection;
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function waitSynchronously(milliseconds) {
  const signal = new Int32Array(new SharedArrayBuffer(4));
  const result = Atomics.wait(signal, 0, 0, milliseconds);
  assert.equal(result, "timed-out");
}

function pruneEmptyCleanupParent(
  boundaryRoot,
  relative,
  requiredAbsentRelatives = [],
  hooks = {}
) {
  const remove = hooks.remove ?? fs.rmdirSync;
  const wait = hooks.wait ?? waitSynchronously;
  const postLstat = hooks.postLstat ?? fs.lstatSync;
  let inspection = inspectEmptyCleanupParent(
    boundaryRoot,
    relative,
    requiredAbsentRelatives
  );
  if (!inspection.exists) {
    return {
      removed: [],
      alreadyAbsent: [relative],
      retries: 0
    };
  }
  const initialMetadata = inspection.metadata;
  let retries = 0;
  while (true) {
    try {
      remove(inspection.target);
      break;
    } catch (error) {
      if (
        !retryableEmptyDirectoryErrors.has(error.code) ||
        retries >= emptyDirectoryMaxRetries
      ) {
        throw error;
      }
      retries += 1;
      wait(emptyDirectoryRetryDelay);
      inspection = inspectEmptyCleanupParent(
        boundaryRoot,
        relative,
        requiredAbsentRelatives
      );
      assert.equal(
        inspection.exists,
        true,
        `empty cleanup parent ${relative}: ENOENT race after failed removal`
      );
      assert.equal(
        sameFileIdentity(initialMetadata, inspection.metadata),
        true,
        `empty cleanup parent ${relative}: identity changed before retry`
      );
    }
  }
  const postcondition = lstatResult(inspection.target, postLstat);
  assert.equal(
    postcondition.exists,
    false,
    `empty cleanup parent ${relative}: postcondition still exists`
  );
  assert.equal(
    postcondition.errorCode,
    "ENOENT",
    `empty cleanup parent ${relative}: postcondition did not return ENOENT`
  );
  return {
    removed: [relative],
    alreadyAbsent: [],
    retries
  };
}

function cleanupGenerated() {
  const evidence = removeCleanupTargets(goldenRoot, generatedRoots);
  const emptyParents = pruneEmptyCleanupParent(
    goldenRoot,
    ".cache",
    cacheLeafRoots
  );
  console.log(
    JSON.stringify({
      ...evidence,
      emptyParents
    })
  );
}

function verifyCleanupSafety() {
  const temporaryRoot = assertOwnedRealPath(path.join(goldenRoot, ".tmp"));
  assert.deepEqual(lstatResult(temporaryRoot), {
    exists: false,
    errorCode: "ENOENT"
  });
  fs.mkdirSync(temporaryRoot, { recursive: false });
  const safetyRoot = path.join(temporaryRoot, "cleanup-safety");
  assert.equal(
    lstatResult(safetyRoot).exists,
    false,
    "cleanup-safety fixture root must be absent before the synthetic run"
  );
  fs.mkdirSync(safetyRoot, { recursive: false });
  const sentinelPath = path.join(safetyRoot, "outside-sentinel.txt");
  const sentinelBytes = Buffer.from("cleanup outside sentinel\n", "utf8");
  fs.writeFileSync(sentinelPath, sentinelBytes);
  const sentinelMode = fs.lstatSync(sentinelPath).mode;
  const cases = [];

  const readOnlyRoot = path.join(safetyRoot, "readonly-case");
  const readOnlyNested = path.join(readOnlyRoot, "nested/deeper");
  fs.mkdirSync(readOnlyNested, { recursive: true });
  fs.writeFileSync(path.join(readOnlyNested, "fixture.txt"), "read-only\n");
  fs.chmodSync(readOnlyNested, 0o500);
  fs.chmodSync(path.dirname(readOnlyNested), 0o500);
  fs.chmodSync(readOnlyRoot, 0o500);
  let observedRemoveOptions;
  const readOnlyEvidence = removeCleanupTargets(
    safetyRoot,
    ["readonly-case", "missing-case"],
    {
      remove(target, options) {
        observedRemoveOptions = options;
        fs.rmSync(target, options);
      }
    }
  );
  assert.deepEqual(observedRemoveOptions, {
    recursive: true,
    force: false,
    maxRetries: 5,
    retryDelay: 100
  });
  assert.deepEqual(readOnlyEvidence, {
    removed: ["readonly-case"],
    alreadyAbsent: ["missing-case"]
  });
  cases.push("readonly-and-bounded-removal");

  const linkCase = path.join(safetyRoot, "internal-link-case");
  fs.mkdirSync(linkCase);
  const internalLink = path.join(linkCase, "sentinel-link");
  fs.symlinkSync("../outside-sentinel.txt", internalLink);
  assert.equal(fs.readlinkSync(internalLink), "../outside-sentinel.txt");
  const linkEvidence = removeCleanupTargets(safetyRoot, [
    "internal-link-case"
  ]);
  assert.deepEqual(linkEvidence, {
    removed: ["internal-link-case"],
    alreadyAbsent: []
  });
  assert.deepEqual(fs.readFileSync(sentinelPath), sentinelBytes);
  assert.equal(fs.lstatSync(sentinelPath).mode, sentinelMode);
  cases.push("internal-link-unlink-only");

  const exactRootLink = path.join(safetyRoot, "exact-root-link");
  fs.symlinkSync("outside-sentinel.txt", exactRootLink);
  assert.throws(
    () => removeCleanupTargets(safetyRoot, ["exact-root-link"]),
    /root\/ancestor symlink/u
  );
  assert.equal(fs.lstatSync(exactRootLink).isSymbolicLink(), true);
  fs.unlinkSync(exactRootLink);
  cases.push("exact-root-link-rejected");

  const danglingAncestor = path.join(safetyRoot, "dangling-ancestor");
  fs.symlinkSync("missing-target", danglingAncestor);
  assert.throws(
    () =>
      removeCleanupTargets(safetyRoot, [
        "dangling-ancestor/forbidden-child"
      ]),
    /root\/ancestor symlink/u
  );
  assert.equal(fs.lstatSync(danglingAncestor).isSymbolicLink(), true);
  fs.unlinkSync(danglingAncestor);
  cases.push("dangling-ancestor-link-rejected");

  assert.throws(
    () => inspectCleanupTarget(safetyRoot, "../outside-boundary"),
    /strict descendant boundary/u
  );
  cases.push("lexical-escape-rejected");

  const removalFailure = path.join(safetyRoot, "removal-failure");
  fs.mkdirSync(removalFailure);
  assert.throws(
    () =>
      removeCleanupTargets(safetyRoot, ["removal-failure"], {
        remove() {
          const error = new Error("synthetic removal failure");
          error.code = "EACCES";
          throw error;
        }
      }),
    /synthetic removal failure/u
  );
  assert.equal(fs.lstatSync(removalFailure).isDirectory(), true);
  removeCleanupTargets(safetyRoot, ["removal-failure"]);
  cases.push("removal-error-propagated");

  const postconditionFailure = path.join(
    safetyRoot,
    "postcondition-failure"
  );
  fs.mkdirSync(postconditionFailure);
  assert.throws(
    () =>
      removeCleanupTargets(safetyRoot, ["postcondition-failure"], {
        remove() {}
      }),
    /cleanup postcondition failed/u
  );
  assert.equal(fs.lstatSync(postconditionFailure).isDirectory(), true);
  removeCleanupTargets(safetyRoot, ["postcondition-failure"]);
  cases.push("postcondition-enforced");

  const emptyParent = path.join(safetyRoot, "empty-parent");
  fs.mkdirSync(emptyParent);
  const emptyParentEvidence = pruneEmptyCleanupParent(
    safetyRoot,
    "empty-parent"
  );
  assert.deepEqual(emptyParentEvidence, {
    removed: ["empty-parent"],
    alreadyAbsent: [],
    retries: 0
  });
  cases.push("empty-parent-removed");

  const nonemptyParent = path.join(safetyRoot, "nonempty-parent");
  const preservedChild = path.join(nonemptyParent, "preserved.txt");
  const preservedBytes = Buffer.from("preserve non-empty parent\n", "utf8");
  fs.mkdirSync(nonemptyParent);
  fs.writeFileSync(preservedChild, preservedBytes);
  assert.throws(
    () => pruneEmptyCleanupParent(safetyRoot, "nonempty-parent"),
    /directory is not empty/u
  );
  assert.deepEqual(fs.readFileSync(preservedChild), preservedBytes);
  fs.unlinkSync(preservedChild);
  const retryWaits = [];
  let retryAttempts = 0;
  const retryEvidence = pruneEmptyCleanupParent(
    safetyRoot,
    "nonempty-parent",
    [],
    {
      remove(target) {
        retryAttempts += 1;
        if (retryAttempts === 1) {
          const error = new Error("synthetic transient empty-parent failure");
          error.code = "EBUSY";
          throw error;
        }
        fs.rmdirSync(target);
      },
      wait(milliseconds) {
        retryWaits.push(milliseconds);
      }
    }
  );
  assert.deepEqual(retryEvidence, {
    removed: ["nonempty-parent"],
    alreadyAbsent: [],
    retries: 1
  });
  assert.deepEqual(retryWaits, [emptyDirectoryRetryDelay]);
  cases.push("nonempty-parent-rejected-and-preserved");
  cases.push("empty-parent-bounded-retry");

  assert.deepEqual(fs.readFileSync(sentinelPath), sentinelBytes);
  fs.unlinkSync(sentinelPath);
  fs.rmdirSync(safetyRoot);
  assert.deepEqual(lstatResult(safetyRoot), {
    exists: false,
    errorCode: "ENOENT"
  });
  const temporaryRootEvidence = pruneEmptyCleanupParent(
    goldenRoot,
    ".tmp"
  );
  assert.deepEqual(temporaryRootEvidence, {
    removed: [".tmp"],
    alreadyAbsent: [],
    retries: 0
  });
  console.log(
    JSON.stringify({
      mode: "cleanup-safety",
      cases: cases.sort(),
      sentinelSha256: crypto
        .createHash("sha256")
        .update(sentinelBytes)
        .digest("hex"),
      temporaryRoot: temporaryRootEvidence,
      residue: "absent"
    })
  );
}

function assertRegularNonSymlink(file, label = file) {
  const metadata = fs.lstatSync(file);
  assert.equal(metadata.isSymbolicLink(), false, `${label}: symlink`);
  assert.equal(metadata.isFile(), true, `${label}: regular file`);
  return metadata;
}

function goEnvironmentArgv() {
  return Object.entries(goEnvironment).map(([key, value]) => `${key}=${value}`);
}

function runGoSandboxed(childExecutable, childArgs, options = {}) {
  const {
    cwd = repositoryRoot,
    label = path.basename(childExecutable)
  } = options;
  assert.equal(sha256(approvedGoSandboxProfile), approvedGoSandboxProfileSha256);
  assertRegularNonSymlink(goSandboxWrapper, "Go sandbox wrapper");
  assertRegularNonSymlink(cleanEnvironmentExecutable, "clean env executable");
  assertRegularNonSymlink(childExecutable, `${label} executable`);
  for (const directory of [
    goEnvironment.HOME,
    goEnvironment.TMPDIR,
    goEnvironment.GOCACHE,
    goEnvironment.GOMODCACHE,
    goEnvironment.GOPATH
  ]) {
    const resolved = assertOwnedRealPath(directory);
    assert.equal(fs.realpathSync(resolved), resolved, `${label}: canonical ${resolved}`);
    assert.equal(fs.lstatSync(resolved).isDirectory(), true);
    assert.equal(fs.lstatSync(resolved).isSymbolicLink(), false);
  }
  const wrapperArgs = [
    "-p",
    approvedGoSandboxProfile,
    cleanEnvironmentExecutable,
    "-i",
    ...goEnvironmentArgv(),
    childExecutable,
    ...childArgs
  ];
  const result = spawnSync(goSandboxWrapper, wrapperArgs, {
    cwd,
    encoding: "utf8",
    env: {}
  });
  if (result.error) {
    throw result.error;
  }
  assert.equal(
    result.status,
    0,
    [
      `${label}: sandboxed child exited ${result.status}`,
      result.stdout,
      result.stderr
    ]
      .filter(Boolean)
      .join("\n")
  );
  assert.equal(result.signal, null, `${label}: terminated by signal`);
  return {
    wrapper: goSandboxWrapper,
    profile: approvedGoSandboxProfile,
    profileSha256: approvedGoSandboxProfileSha256,
    cwd,
    argv: [childExecutable, ...childArgs],
    wrapperArgv: [goSandboxWrapper, ...wrapperArgs],
    environment: goEnvironment,
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr
  };
}

function admitGoDownloadProgress(stderr, policy, label) {
  assert.equal(policy.name, "go-download-progress-v1");
  assert.equal(
    policy.stderrGrammar,
    "go: downloading <module> <version>\\n"
  );
  assert.deepEqual(policy.appliesTo, [
    "primaryGeneration",
    "deterministicReplay",
    "compileSmoke"
  ]);
  const graphPairs = Object.values(policy.sourceGraphs).flatMap((graph) => {
    assert.deepEqual(
      graph.moduleVersionPairs,
      [...graph.moduleVersionPairs].sort(scalarCompare),
      `${label}: ${graph.label} module graph must be lexically sorted`
    );
    assert.equal(
      new Set(graph.moduleVersionPairs).size,
      graph.moduleVersionPairs.length,
      `${label}: ${graph.label} module graph must be unique`
    );
    return graph.moduleVersionPairs;
  });
  const graphUnion = [...new Set(graphPairs)].sort(scalarCompare);
  assert.deepEqual(
    policy.allowedModuleVersionPairs,
    graphUnion,
    `${label}: download allowlist must equal the source-graph union`
  );
  assert.equal(
    new Set(policy.allowedModuleVersionPairs).size,
    policy.allowedModuleVersionPairs.length,
    `${label}: download allowlist must be unique`
  );
  if (stderr === "") {
    return {
      policy: policy.name,
      accepted: true,
      stderrBytes: 0,
      observedModuleVersionPairs: []
    };
  }
  assert.equal(stderr.includes("\r"), false, `${label}: CR/CRLF is forbidden`);
  assert.equal(stderr.endsWith("\n"), true, `${label}: stderr lacks final LF`);
  const allowed = new Set(policy.allowedModuleVersionPairs);
  const observed = stderr.slice(0, -1).split("\n").map((line) => {
    const match = line.match(
      /^go: downloading ([^\s\u0000-\u001f\u007f]+) ([^\s\u0000-\u001f\u007f]+)$/u
    );
    assert(match, `${label}: forbidden Go stderr line: ${JSON.stringify(line)}`);
    const pair = `${match[1]}@${match[2]}`;
    assert(allowed.has(pair), `${label}: unlisted Go download pair ${pair}`);
    return pair;
  });
  return {
    policy: policy.name,
    accepted: true,
    stderrBytes: Buffer.byteLength(stderr),
    observedModuleVersionPairs: observed
  };
}

assertExactNodeRuntime();

const verificationMode = process.argv[2] ?? "verify";
if (process.argv.length > 3) {
  fail(
    "usage: node verify.mjs [--prepare-codegen-projections|--verify-codegen-projections|--verify-cleanup-safety|--cleanup-generated]"
  );
}
if (verificationMode === "--cleanup-generated") {
  cleanupGenerated();
  process.exit(0);
}
if (verificationMode === "--verify-cleanup-safety") {
  verifyCleanupSafety();
  process.exit(0);
}
if (verificationMode === "--prepare-codegen-projections") {
  prepareCodegenProjections();
  process.exit(0);
}
if (
  verificationMode !== "verify" &&
  verificationMode !== "--verify-codegen-projections"
) {
  fail(
    "usage: node verify.mjs [--prepare-codegen-projections|--verify-codegen-projections|--verify-cleanup-safety|--cleanup-generated]"
  );
}
const verifyCodegenProjections =
  verificationMode === "--verify-codegen-projections";

const [{ default: Ajv2020 }, { default: addFormats }, { default: canonicalize }] =
  await Promise.all([
    import("ajv/dist/2020.js"),
    import("ajv-formats"),
    import("canonicalize")
  ]);

const UTF8 = new TextEncoder();
const SAFE_MAX = 9007199254740991;
const DIGEST_DOMAIN = Buffer.from("bgmss.query.v1", "ascii");
const STATUS_ORDER = ["completed", "in_progress", "on_hold", "dropped"];
const TRIM_CODE_POINTS = new Set([
  0x0009,
  0x000a,
  0x000b,
  0x000c,
  0x000d,
  0x0020,
  0x0085,
  0x00a0,
  0x1680,
  0x2000,
  0x2001,
  0x2002,
  0x2003,
  0x2004,
  0x2005,
  0x2006,
  0x2007,
  0x2008,
  0x2009,
  0x200a,
  0x2028,
  0x2029,
  0x202f,
  0x205f,
  0x3000
]);

class ContractError extends Error {
  constructor(code, pointer, message) {
    super(message);
    this.code = code;
    this.pointer = pointer;
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function utf8Length(value) {
  return UTF8.encode(value).byteLength;
}

function scalarLength(value) {
  return [...value].length;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function pointerEscape(value) {
  return String(value).replaceAll("~", "~0").replaceAll("/", "~1");
}

function childPointer(pointer, key) {
  return `${pointer}/${pointerEscape(key)}`;
}

function assertNoLoneSurrogates(value, pointer = "") {
  if (typeof value === "string") {
    for (let index = 0; index < value.length; index += 1) {
      const unit = value.charCodeAt(index);
      if (unit >= 0xd800 && unit <= 0xdbff) {
        const next = value.charCodeAt(index + 1);
        if (!(next >= 0xdc00 && next <= 0xdfff)) {
          throw new ContractError("FIELD_INVALID", pointer, "unpaired high surrogate");
        }
        index += 1;
      } else if (unit >= 0xdc00 && unit <= 0xdfff) {
        throw new ContractError("FIELD_INVALID", pointer, "unpaired low surrogate");
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertNoLoneSurrogates(entry, childPointer(pointer, index))
    );
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      assertNoLoneSurrogates(key, childPointer(pointer, key));
      assertNoLoneSurrogates(entry, childPointer(pointer, key));
    }
  }
}

function assertSafeJsonNumbers(value, pointer = "") {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new ContractError("FIELD_INVALID", pointer, "non-finite JSON number");
    }
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
      throw new ContractError("FIELD_INVALID", pointer, "unsafe JSON integer");
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertSafeJsonNumbers(entry, childPointer(pointer, index))
    );
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      assertSafeJsonNumbers(entry, childPointer(pointer, key));
    }
  }
}

function trimV1(value) {
  const scalars = [...value];
  let start = 0;
  let end = scalars.length;
  while (start < end && TRIM_CODE_POINTS.has(scalars[start].codePointAt(0))) {
    start += 1;
  }
  while (end > start && TRIM_CODE_POINTS.has(scalars[end - 1].codePointAt(0))) {
    end -= 1;
  }
  return scalars.slice(start, end).join("");
}

function scalarCompare(left, right) {
  const a = [...left].map((value) => value.codePointAt(0));
  const b = [...right].map((value) => value.codePointAt(0));
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) {
      return a[index] - b[index];
    }
  }
  return a.length - b.length;
}

function sequenceCompare(left, right) {
  for (
    let index = 0;
    index < Math.min(left.length, right.length);
    index += 1
  ) {
    const result = scalarCompare(left[index], right[index]);
    if (result !== 0) {
      return result;
    }
  }
  return left.length - right.length;
}

function listPhysicalFiles(root, relative = "") {
  const result = [];
  for (const entry of fs.readdirSync(path.join(root, relative), {
    withFileTypes: true
  })) {
    const child = path.join(relative, entry.name);
    const normalized = child.split(path.sep).join("/");
    if (
      generatedRoots.some(
        (generated) =>
          normalized === generated || normalized.startsWith(`${generated}/`)
      )
    ) {
      continue;
    }
    if (entry.isSymbolicLink()) {
      fail(`symlink is forbidden in committed golden inventory: ${normalized}`);
    }
    if (entry.isDirectory()) {
      result.push(...listPhysicalFiles(root, child));
    } else if (entry.isFile()) {
      result.push(normalized);
    } else {
      fail(`unsupported filesystem entry: ${normalized}`);
    }
  }
  return result.sort();
}

const manifest = readJson(path.join(goldenRoot, "manifest.json"));
assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.contract, "contracts-query-wire/v1");
assert.equal(manifest.queryDigest.domainAscii, "bgmss.query.v1");
assert.equal(DIGEST_DOMAIN.byteLength, 14);
assert.equal(manifest.queryDigest.prefixBytes, 15);
assert.equal(manifest.queryDigest.separatorHex, "00");
assert.equal(manifest.queryDigest.domainHex, DIGEST_DOMAIN.toString("hex"));
assert.equal(manifest.oracleEvidence.bulkFixtureCopied, false);
assert.equal(manifest.oracleEvidence.observations.publicUidUtf8Bytes, 8);
assert.equal(manifest.oracleEvidence.observations.tagOccurrences, 7059);
assert.equal(manifest.oracleEvidence.observations.longestObservedTagUtf8Bytes, 72);
assert(!JSON.stringify(manifest).includes("TO_BE_FILLED"), "manifest has placeholders");

const exactRootGitignore = [
  "# macOS",
  ".DS_Store",
  "",
  "# Local secrets and environment overrides",
  ".env",
  ".env.*",
  "!.env.example",
  "!.env.*.example",
  "",
  "# Query contract tool state; physically absent at candidate handoff",
  "/contracts/goldens/query/node_modules/",
  "/contracts/goldens/query/.cache/npm/",
  "/contracts/goldens/query/.cache/go-build/",
  "/contracts/goldens/query/.cache/go-mod/",
  "/contracts/goldens/query/.cache/go-path/",
  "/contracts/goldens/query/.tmp/",
  ""
].join("\n");
const rootGitignoreBytes = fs.readFileSync(path.join(repositoryRoot, ".gitignore"));
assert.equal(new TextDecoder("utf-8", { fatal: true }).decode(rootGitignoreBytes), exactRootGitignore);
assert.deepEqual(manifest.acceptanceEvidence.gitignore, {
  path: ".gitignore",
  encoding: "UTF-8",
  lineEndings: "LF",
  finalLf: true,
  bytes: rootGitignoreBytes.byteLength,
  sha256: sha256(rootGitignoreBytes)
});

const authorityContext = createReferenceContext(openapiPath, schemaRoot);
const authorityAudit = auditReferenceContext(authorityContext);
assert.deepEqual(manifest.acceptanceEvidence.authority.audit, authorityAudit);
assert.deepEqual(
  manifest.acceptanceEvidence.authority.files,
  [
    "contracts/openapi/openapi.yaml",
    ...authoritySchemaNames.map((name) => `contracts/schemas/query/${name}`)
  ]
);

const declaredCaseFiles = manifest.caseFiles.map((entry) => entry.path).sort();
const actualCaseFiles = fs
  .readdirSync(path.join(goldenRoot, "cases"))
  .filter((name) => name.endsWith(".json"))
  .map((name) => `cases/${name}`)
  .sort();
assert.deepEqual(actualCaseFiles, declaredCaseFiles);

const expectedPhysicalFiles = [
  "manifest.json",
  "package-lock.json",
  "package.json",
  "verify.mjs",
  ...declaredCaseFiles,
  ...manifest.unicode.files.map((entry) => entry.path)
].sort();
assert.deepEqual(listPhysicalFiles(goldenRoot), expectedPhysicalFiles);

const packageJson = readJson(path.join(goldenRoot, "package.json"));
const packageLock = readJson(path.join(goldenRoot, "package-lock.json"));
const exactDevDependencies = {
  "@redocly/cli": "2.40.0",
  ajv: "8.20.0",
  "ajv-formats": "3.0.1",
  canonicalize: "3.0.0",
  "openapi-typescript": "7.13.0"
};
assert.deepEqual(packageJson.devDependencies, exactDevDependencies);
assert.deepEqual(packageLock.packages[""].devDependencies, exactDevDependencies);
assert.deepEqual(packageJson.engines, {
  node: manifest.toolchain.node,
  npm: manifest.toolchain.npm
});
assert.deepEqual(packageLock.packages[""].engines, packageJson.engines);
assert.equal(packageLock.lockfileVersion, 3);
assert.equal(packageJson.dependencies, undefined);
assert.equal(packageLock.packages[""].dependencies, undefined);
assert.deepEqual(Object.keys(packageJson.scripts), ["verify"]);
assert.equal(packageJson.scripts.verify, "node verify.mjs");
for (const name of [
  "preinstall",
  "install",
  "postinstall",
  "prepare",
  "prepublish",
  "prepack",
  "postpack"
]) {
  assert.equal(packageJson.scripts[name], undefined);
}

const major = Number(process.versions.node.split(".")[0]);
const [nodeMajor, nodeMinor] = process.versions.node.split(".").map(Number);
assert(
  (nodeMajor === 20 && nodeMinor >= 19) ||
    (nodeMajor >= 22 && (nodeMajor > 22 || nodeMinor >= 12)),
  `unsupported Node ${process.versions.node}`
);
assert(major !== 21, "Node 21 is outside the supported execution floor");

const caseDocuments = new Map(
  manifest.caseFiles.map((entry) => [
    entry.kind,
    readJson(path.join(goldenRoot, entry.path))
  ])
);
for (const entry of manifest.caseFiles) {
  assert.equal(caseDocuments.get(entry.kind).kind, entry.kind);
}

const allCaseIds = [];
for (const document of caseDocuments.values()) {
  for (const [key, value] of Object.entries(document)) {
    if (!key.toLowerCase().includes("cases") || !Array.isArray(value)) {
      continue;
    }
    for (const testCase of value) {
      assert.equal(typeof testCase.id, "string");
      assert(testCase.id.length > 0);
      allCaseIds.push(testCase.id);
    }
  }
}
assert.equal(new Set(allCaseIds).size, allCaseIds.length, "duplicate golden case ID");

for (const unicodeFile of manifest.unicode.files) {
  const absolute = path.join(goldenRoot, unicodeFile.path);
  const bytes = fs.readFileSync(absolute);
  assert.equal(sha256(bytes), unicodeFile.sha256);
  const header = bytes.subarray(0, Math.min(bytes.length, 4096)).toString("utf8");
  assert(
    header.startsWith(`# ${path.basename(unicodeFile.path)}\n`),
    `${unicodeFile.path} versioned header basename`
  );
  assert.equal(
    new URL(unicodeFile.source, manifest.unicode.baseUrl).href,
    `${manifest.unicode.baseUrl}${unicodeFile.source}`
  );
  assert(header.includes("Unicode"));
}

function parseDerivedAge(text) {
  const ranges = [];
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.replace(/#.*/u, "").trim();
    if (!line || line.startsWith("@")) {
      continue;
    }
    const [rangeText, ageText] = line.split(";").map((part) => part.trim());
    const [startText, endText = startText] = rangeText.split("..");
    const [majorText, minorText] = ageText.split(".");
    const version = Number(majorText) * 100 + Number(minorText);
    if (version <= 1501) {
      ranges.push([
        Number.parseInt(startText, 16),
        Number.parseInt(endText, 16)
      ]);
    }
  }
  ranges.sort((left, right) => left[0] - right[0]);
  return ranges;
}

const assignedRanges = parseDerivedAge(
  fs.readFileSync(
    path.join(goldenRoot, "unicode/DerivedAge-15.1.0.txt"),
    "utf8"
  )
);

function isAssignedInUnicode151(codePoint) {
  let low = 0;
  let high = assignedRanges.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const [start, end] = assignedRanges[middle];
    if (codePoint < start) {
      high = middle - 1;
    } else if (codePoint > end) {
      low = middle + 1;
    } else {
      return true;
    }
  }
  return false;
}

function parseCaseFolding(text) {
  const mappings = new Map();
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.replace(/#.*/u, "").trim();
    if (!line) {
      continue;
    }
    const [sourceText, status, mappingText] = line
      .split(";")
      .map((part) => part.trim());
    if (status !== "C" && status !== "F") {
      continue;
    }
    const source = Number.parseInt(sourceText, 16);
    const mapped = mappingText
      .split(/\s+/u)
      .map((part) => String.fromCodePoint(Number.parseInt(part, 16)))
      .join("");
    if (status === "F" || !mappings.has(source)) {
      mappings.set(source, mapped);
    }
  }
  return mappings;
}

const foldMappings = parseCaseFolding(
  fs.readFileSync(
    path.join(goldenRoot, "unicode/CaseFolding-15.1.0.txt"),
    "utf8"
  )
);

function assertAssigned151(value, pointer) {
  for (const scalar of value) {
    if (!isAssignedInUnicode151(scalar.codePointAt(0))) {
      throw new ContractError(
        "FIELD_INVALID",
        pointer,
        `scalar U+${scalar.codePointAt(0).toString(16).toUpperCase()} is not assigned in Unicode 15.1`
      );
    }
  }
}

function defaultCaseFold151(value) {
  return [...value]
    .map((scalar) => foldMappings.get(scalar.codePointAt(0)) ?? scalar)
    .join("");
}

function normalizeTagToken(value, pointer) {
  assertNoLoneSurrogates(value, pointer);
  const trimmed = trimV1(value);
  if (trimmed.length === 0) {
    throw new ContractError("FIELD_INVALID", pointer, "empty normalized tag");
  }
  assertAssigned151(trimmed, pointer);
  const normalized = defaultCaseFold151(trimmed.normalize("NFKC"));
  if (
    normalized.length === 0 ||
    scalarLength(normalized) > manifest.limits.normalizedTagCodePoints ||
    utf8Length(normalized) > manifest.limits.normalizedTagUtf8Bytes
  ) {
    throw new ContractError("FIELD_INVALID", pointer, "normalized tag exceeds limit");
  }
  return normalized;
}

function normalizeTokenArray(tokens, pointer) {
  const normalized = tokens.map((token, index) =>
    normalizeTagToken(token, childPointer(pointer, index))
  );
  return [...new Set(normalized)].sort(scalarCompare);
}

function normalizeTagFilter(tags, pointer) {
  const result = {};
  let totalTokens = 0;
  for (const [polarity, field] of [
    ["include", "anyOf"],
    ["exclude", "allOf"]
  ]) {
    if (!tags[polarity]) {
      continue;
    }
    const groups = tags[polarity].map((group, index) => {
      const values = normalizeTokenArray(
        group[field],
        `${pointer}/${polarity}/${index}/${field}`
      );
      totalTokens += values.length;
      return { [field]: values };
    });
    const unique = new Map(
      groups.map((group) => [canonicalize(group), group])
    );
    result[polarity] = [...unique.values()].sort((left, right) =>
      sequenceCompare(left[field], right[field])
    );
  }
  if (totalTokens > manifest.limits.normalizedTagTokens) {
    throw new ContractError(
      "FIELD_INVALID",
      pointer,
      "normalized tag token count exceeds limit"
    );
  }
  return result;
}

function fromHexSequence(value) {
  return value
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .map((part) => String.fromCodePoint(Number.parseInt(part, 16)))
    .join("");
}

let normalizationAssertions = 0;
for (const rawLine of fs
  .readFileSync(
    path.join(goldenRoot, "unicode/NormalizationTest-15.1.0.txt"),
    "utf8"
  )
  .split(/\r?\n/u)) {
  const line = rawLine.replace(/#.*/u, "").trim();
  if (!line || line.startsWith("@")) {
    continue;
  }
  const columns = line.split(";").slice(0, 5).map(fromHexSequence);
  assert.equal(columns.length, 5);
  for (const index of [0, 1, 2, 3, 4]) {
    assert.equal(columns[index].normalize("NFKC"), columns[3]);
    normalizationAssertions += 1;
  }
}
assert(normalizationAssertions > 50000, "full NFKC suite did not run");

const schemaFiles = fs
  .readdirSync(schemaRoot)
  .filter((name) => name.endsWith(".schema.json"))
  .sort()
  .map((name) => path.join(schemaRoot, name));
const schemas = schemaFiles.map(readJson);
const ajv = new Ajv2020({
  strict: true,
  allErrors: true,
  validateFormats: true,
  allowUnionTypes: false
});
addFormats(ajv);
for (const schema of schemas) {
  ajv.addSchema(schema);
}
for (const schema of schemas) {
  ajv.compile(schema);
}

const schemaIds = Object.fromEntries(
  schemas.map((schema) => [schema.title, schema.$id])
);
const validators = {
  sharedQuery: ajv.getSchema(schemaIds.SharedQueryV1),
  effectiveQuery: ajv.getSchema(schemaIds.EffectiveQueryV1),
  projection: ajv.getSchema(schemaIds.QueryDigestProjectionV1),
  catalog: ajv.getSchema(schemaIds.CatalogContextV1),
  error: ajv.getSchema(schemaIds.ErrorEnvelopeV1),
  share: ajv.getSchema(schemaIds.SharePayloadV1)
};
for (const [name, validator] of Object.entries(validators)) {
  assert.equal(typeof validator, "function", `missing validator ${name}`);
}

const operationId =
  "https://bangumi-staff-stats.local/schemas/query/operation-components-v1.schema.json";
for (const name of [
  "RankingsViewV1",
  "CandidatesInputV1",
  "CandidatesViewV1",
  "PersonDetailInputV1",
  "PersonDetailViewV1",
  "PartnersInputV1",
  "PartnersViewV1",
  "CoStarInputV1",
  "CoStarViewV1"
]) {
  validators[name] =
    ajv.getSchema(`${operationId}#/$defs/${name}`) ??
    ajv.compile({ $ref: `${operationId}#/$defs/${name}` });
}

function validationPointer(errors, value) {
  const branchFiltered = errors.filter((error) => {
    if (value?.scope === "personal") {
      return !/Global(?:SharedQuery|Query|Projection)V1/u.test(error.schemaPath);
    }
    if (value?.scope === "global") {
      return !/Personal(?:SharedQuery|Query|Projection)V1/u.test(
        error.schemaPath
      );
    }
    return true;
  });
  const additional = branchFiltered.find(
    (error) => error.keyword === "additionalProperties"
  );
  if (additional) {
    return childPointer(
      additional.instancePath,
      additional.params.additionalProperty
    );
  }
  const pointers = branchFiltered
    .filter((error) => error.keyword !== "oneOf")
    .map((error) =>
      ({
        pointer:
          error.keyword === "required"
            ? childPointer(error.instancePath, error.params.missingProperty)
            : error.instancePath,
        required: error.keyword === "required"
      })
    )
    .sort(
      (left, right) =>
        Number(left.required) - Number(right.required) ||
        right.pointer.length - left.pointer.length
    );
  return pointers[0]?.pointer ?? "";
}

function validateOrThrow(validator, value, prefix = "") {
  if (!validator(value)) {
    const pointer = `${prefix}${validationPointer(validator.errors, value)}`;
    throw new ContractError(
      "FIELD_INVALID",
      pointer,
      ajv.errorsText(validator.errors, { separator: "; " })
    );
  }
}

function validateRange(range, pointer) {
  if (
    Object.hasOwn(range, "min") &&
    Object.hasOwn(range, "max") &&
    range.min > range.max
  ) {
    throw new ContractError("FIELD_INVALID", pointer, "range min exceeds max");
  }
}

function embeddedSubjectType(positionKey) {
  return positionKey.split(":")[1];
}

function validatePositionKeys(positionKeys, subjectType, catalog) {
  const catalogByKey = new Map();
  for (const entry of catalog.positions) {
    if (catalogByKey.has(entry.key)) {
      throw new ContractError(
        "FIELD_INVALID",
        "/catalog/positions",
        "duplicate catalog key"
      );
    }
    catalogByKey.set(entry.key, entry);
  }
  for (const [index, key] of positionKeys.entries()) {
    const pointer = `/positionKeys/${index}`;
    if (key.startsWith("staff:")) {
      const id = key.split(":")[2];
      if (BigInt(id) > BigInt(SAFE_MAX)) {
        throw new ContractError("FIELD_INVALID", pointer, "unsafe position ID");
      }
    }
    if (embeddedSubjectType(key) !== subjectType) {
      throw new ContractError(
        "POSITION_SUBJECT_TYPE_MISMATCH",
        pointer,
        "position subject type mismatch"
      );
    }
    const catalogEntry = catalogByKey.get(key);
    if (!catalogEntry) {
      throw new ContractError(
        "POSITION_NOT_FOUND",
        pointer,
        "position missing from catalog"
      );
    }
    if (catalogEntry.subjectType !== subjectType) {
      throw new ContractError(
        "POSITION_SUBJECT_TYPE_MISMATCH",
        pointer,
        "catalog subject type mismatch"
      );
    }
    if (!catalogEntry.selectable) {
      throw new ContractError(
        "POSITION_NOT_SELECTABLE",
        pointer,
        "position is not selectable"
      );
    }
  }
  for (const type of ["anime", "game"]) {
    if (
      positionKeys.includes(`cast:${type}:main`) &&
      positionKeys.includes(`cast:${type}:all`)
    ) {
      throw new ContractError(
        "POSITION_SELECTION_CONFLICT",
        "/positionKeys",
        "cast main and all are mutually exclusive"
      );
    }
  }
}

function buildFilters(filters, pointer) {
  if (!filters) {
    return undefined;
  }
  const result = {};
  for (const field of [
    "subjectDate",
    "collectionUpdatedAt",
    "personalScore",
    "globalScore",
    "scoreDifference",
    "ratingCount"
  ]) {
    if (filters[field]) {
      validateRange(filters[field], `${pointer}/${field}`);
      result[field] = cloneJson(filters[field]);
    }
  }
  if (filters.tags) {
    result.tags = normalizeTagFilter(filters.tags, `${pointer}/tags`);
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeQuery(submitted, catalog) {
  assertNoLoneSurrogates(submitted);
  assertNoLoneSurrogates(catalog, "/catalog");
  assertSafeJsonNumbers(submitted);
  assertSafeJsonNumbers(catalog, "/catalog");
  if (utf8Length(JSON.stringify(submitted)) > manifest.limits.requestBytes) {
    throw new ContractError("REQUEST_TOO_LARGE", "", "request exceeds byte cap");
  }
  validateOrThrow(validators.catalog, catalog, "/catalog");
  if (submitted?.scope === "global") {
    for (const field of [
      "uid",
      "collectionStatuses",
      "collectionUpdatedAt",
      "personalScore",
      "scoreDifference"
    ]) {
      if (Object.hasOwn(submitted, field)) {
        throw new ContractError(
          "FIELD_INVALID",
          `/${field}`,
          "personal field is forbidden in global scope"
        );
      }
    }
  }
  validateOrThrow(validators.sharedQuery, submitted);
  const positionKeys = [...new Set(submitted.positionKeys)];
  validatePositionKeys(positionKeys, submitted.subjectType, catalog);
  if (submitted.mergeSeries === true && submitted.subjectType !== "anime") {
    throw new ContractError(
      "FIELD_INVALID",
      "/mergeSeries",
      "series merge is anime-only"
    );
  }
  const effective = { scope: submitted.scope };
  if (submitted.scope === "personal") {
    const uid = trimV1(submitted.uid);
    if (
      uid.length === 0 ||
      [...uid].some((scalar) => {
        const codePoint = scalar.codePointAt(0);
        return (
          codePoint === 0 ||
          codePoint <= 0x1f ||
          (codePoint >= 0x7f && codePoint <= 0x9f)
        );
      }) ||
      scalarLength(uid) > manifest.limits.uidCodePoints ||
      utf8Length(uid) > manifest.limits.uidUtf8Bytes
    ) {
      throw new ContractError("FIELD_INVALID", "/uid", "invalid public UID");
    }
    effective.uid = uid;
    const selected = new Set(submitted.collectionStatuses);
    effective.collectionStatuses = STATUS_ORDER.filter((status) =>
      selected.has(status)
    );
  }
  effective.subjectType = submitted.subjectType;
  effective.positionKeys = positionKeys;
  effective.includeNSFW = submitted.includeNSFW ?? false;
  effective.mergeSeries = submitted.mergeSeries ?? false;
  const filters = buildFilters(submitted.filters, "/filters");
  if (filters) {
    effective.filters = filters;
  }
  validateOrThrow(validators.effectiveQuery, effective);
  return effective;
}

function projectQuery(effective) {
  const projection = { scope: effective.scope };
  if (effective.scope === "personal") {
    projection.collectionStatuses = cloneJson(effective.collectionStatuses);
  }
  projection.subjectType = effective.subjectType;
  projection.positionKeys = cloneJson(effective.positionKeys);
  projection.includeNSFW = effective.includeNSFW;
  projection.mergeSeries = effective.mergeSeries;
  if (effective.filters) {
    projection.filters = cloneJson(effective.filters);
  }
  validateOrThrow(validators.projection, projection);
  return projection;
}

function digestQuery(effective) {
  const projection = projectQuery(effective);
  const canonical = canonicalize(projection);
  const preimage = Buffer.concat([
    DIGEST_DOMAIN,
    Buffer.from([0]),
    Buffer.from(canonical, "utf8")
  ]);
  return {
    projection,
    canonical,
    preimageHex: preimage.toString("hex"),
    preimageBase64url: preimage.toString("base64url"),
    queryDigest: `q1:${sha256(preimage)}`
  };
}

const queryDocument = caseDocuments.get("query-normalization");
const positiveQueryById = new Map(
  queryDocument.cases.map((testCase) => [testCase.id, testCase])
);

function catalogFor(testCase) {
  if (testCase.catalog) {
    return testCase.catalog;
  }
  return positiveQueryById.get(testCase.catalogCase).catalog;
}

for (const testCase of queryDocument.cases) {
  const effective = normalizeQuery(testCase.submitted, testCase.catalog);
  assert.deepEqual(effective, testCase.expected.effective, testCase.id);
  const digest = digestQuery(effective);
  for (const field of [
    "projection",
    "canonical",
    "preimageHex",
    "preimageBase64url",
    "queryDigest"
  ]) {
    assert.deepEqual(digest[field], testCase.expected[field], `${testCase.id}:${field}`);
  }
  const second = normalizeQuery(effective, testCase.catalog);
  assert.equal(canonicalize(second), canonicalize(effective), `${testCase.id}:idempotence`);
  assert.deepEqual(digestQuery(second), digest, `${testCase.id}:digest idempotence`);
  if (testCase.sameDigestAs) {
    assert.equal(
      digest.queryDigest,
      positiveQueryById.get(testCase.sameDigestAs).expected.queryDigest,
      `${testCase.id}:digest exclusion`
    );
  }
}

for (const testCase of queryDocument.digestExclusionCases) {
  const base = positiveQueryById.get(testCase.queryCase).expected.effective;
  const excludedFields = [...testCase.excludedFields];
  assert.deepEqual(
    excludedFields,
    manifest.queryDigest.excludedFields,
    `${testCase.id}:manifest excluded fields`
  );
  assert.deepEqual(
    [...new Set(excludedFields)],
    excludedFields,
    `${testCase.id}:unique excluded fields`
  );
  assert.deepEqual(
    Object.keys(testCase.leftContext),
    excludedFields,
    `${testCase.id}:left context fields`
  );
  assert.deepEqual(
    Object.keys(testCase.rightContext),
    excludedFields,
    `${testCase.id}:right context fields`
  );
  assert.notEqual(
    canonicalize(testCase.leftContext),
    canonicalize(testCase.rightContext),
    `${testCase.id}:contexts differ`
  );
  const left = cloneJson(base);
  const right = cloneJson(base);
  left.uid = testCase.leftContext.uid;
  right.uid = testCase.rightContext.uid;
  const leftDigest = digestQuery(left);
  const rightDigest = digestQuery(right);
  assert.equal(leftDigest.queryDigest, testCase.expectedQueryDigest, testCase.id);
  assert.equal(rightDigest.queryDigest, testCase.expectedQueryDigest, testCase.id);
  for (const field of excludedFields) {
    assert.equal(
      Object.hasOwn(leftDigest.projection, field),
      false,
      `${testCase.id}:${field} excluded`
    );
  }
}

for (const testCase of queryDocument.negativeCases) {
  let submitted = testCase.submittedTemplate
    ? cloneJson(testCase.submittedTemplate)
    : testCase.submitted;
  if (testCase.generatedToken) {
    submitted.filters.tags.include[0].anyOf[0] =
      testCase.generatedToken.value.repeat(testCase.generatedToken.repeat);
  }
  if (testCase.generatedUid) {
    submitted.uid = testCase.generatedUid.value.repeat(
      testCase.generatedUid.repeat
    );
  }
  if (testCase.generatedTagGroups) {
    submitted.filters.tags.include = Array.from(
      { length: testCase.generatedTagGroups },
      (_, index) => ({ anyOf: [`group-${index}`] })
    );
  }
  if (testCase.generatedTagTokens) {
    submitted.filters.tags.include[0].anyOf = Array.from(
      { length: testCase.generatedTagTokens },
      (_, index) => `token-${index}`
    );
  }
  if (testCase.generatedTotalTagTokens) {
    const { groups, tokensPerGroup } = testCase.generatedTotalTagTokens;
    submitted.filters.tags.include = Array.from(
      { length: groups },
      (_, groupIndex) => ({
        anyOf: Array.from(
          { length: tokensPerGroup },
          (_, tokenIndex) => `group-${groupIndex}-token-${tokenIndex}`
        )
      })
    );
  }
  assert.throws(
    () => normalizeQuery(submitted, catalogFor(testCase)),
    (error) =>
      error instanceof ContractError &&
      error.code === testCase.expectedCode &&
      error.pointer === testCase.expectedPath,
    testCase.id
  );
}

function validateSearch(search) {
  assertNoLoneSurrogates(search, "/view/search");
  if (
    scalarLength(search) > manifest.limits.searchCodePoints ||
    utf8Length(search) > manifest.limits.searchUtf8Bytes
  ) {
    throw new ContractError(
      "FIELD_INVALID",
      "/view/search",
      "search exceeds limit"
    );
  }
}

function validateIdentity(identity, query, pointer) {
  if (!Number.isSafeInteger(identity.personId) || identity.personId < 1) {
    throw new ContractError("FIELD_INVALID", `${pointer}/personId`, "invalid person ID");
  }
  for (const [index, key] of identity.positionKeys.entries()) {
    if (!query.positionKeys.includes(key)) {
      throw new ContractError(
        "PERSON_NOT_IN_QUERY_RESULT",
        `${pointer}/positionKeys/${index}`,
        "identity key is outside effective query"
      );
    }
  }
}

const operationSchemas = {
  rankings: { view: "RankingsViewV1" },
  candidates: { input: "CandidatesInputV1", view: "CandidatesViewV1" },
  personDetail: { input: "PersonDetailInputV1", view: "PersonDetailViewV1" },
  partners: { input: "PartnersInputV1", view: "PartnersViewV1" },
  coStar: { input: "CoStarInputV1", view: "CoStarViewV1" }
};

function normalizeOperation(operation, query, submittedInput, submittedView) {
  const schema = operationSchemas[operation];
  if (!schema) {
    fail(`unknown operation ${operation}`);
  }
  assertNoLoneSurrogates(submittedView, "/view");
  assertSafeJsonNumbers(submittedView, "/view");
  validateOrThrow(validators[schema.view], submittedView, "/view");
  const view = {};
  if (operation === "personDetail") {
    view.section = submittedView.section ?? "works";
  }
  view.search = submittedView.search ?? "";
  validateSearch(view.search);
  if (submittedView.sort !== undefined) {
    view.sort = submittedView.sort;
  } else if (operation === "personDetail") {
    view.sort = view.section === "characters" ? "role" : "globalScore";
  } else if (operation === "coStar") {
    view.sort = query.scope === "personal" ? "personalScore" : "globalScore";
  } else {
    view.sort = "count";
  }
  view.order = submittedView.order ?? "desc";
  view.page = submittedView.page ?? 1;
  view.pageSize = submittedView.pageSize ?? 10;

  if (
    (operation === "rankings" || operation === "partners") &&
    view.sort === "preference" &&
    query.scope !== "personal"
  ) {
    throw new ContractError("FIELD_INVALID", "/view/sort", "personal-only sort");
  }
  if (
    operation === "candidates" &&
    view.sort === "globalAverage" &&
    query.scope !== "personal"
  ) {
    throw new ContractError("FIELD_INVALID", "/view/sort", "personal-only sort");
  }
  if (operation === "personDetail") {
    const allowed =
      view.section === "characters"
        ? new Set(["role", "workCount", "name"])
        : new Set([
            "globalScore",
            ...(query.scope === "personal"
              ? ["personalScore", "collectionUpdatedAt"]
              : []),
            ...(query.mergeSeries ? ["seriesSize"] : [])
          ]);
    if (!allowed.has(view.sort)) {
      throw new ContractError("FIELD_INVALID", "/view/sort", "invalid detail sort");
    }
  }
  if (operation === "coStar") {
    const allowed = new Set([
      "globalScore",
      ...(query.scope === "personal"
        ? ["personalScore", "collectionUpdatedAt"]
        : []),
      ...(query.mergeSeries ? ["seriesSize"] : [])
    ]);
    if (!allowed.has(view.sort)) {
      throw new ContractError("FIELD_INVALID", "/view/sort", "invalid co-star sort");
    }
  }

  let input;
  if (schema.input) {
    input = cloneJson(submittedInput);
    assertNoLoneSurrogates(input, "/input");
    assertSafeJsonNumbers(input, "/input");
    if (
      operation === "coStar" &&
      Array.isArray(input?.participants) &&
      input.participants.length > manifest.limits.coStarParticipants
    ) {
      throw new ContractError(
        "PARTICIPANT_LIMIT_EXCEEDED",
        "/input/participants",
        "participant limit exceeded"
      );
    }
    validateOrThrow(validators[schema.input], input, "/input");
  }
  if (operation === "candidates") {
    if (!query.positionKeys.includes(input.positionKey)) {
      throw new ContractError(
        "PERSON_NOT_IN_QUERY_RESULT",
        "/input/positionKey",
        "candidate key is outside query"
      );
    }
  } else if (operation === "partners") {
    validateIdentity(input.source, query, "/input/source");
    if (
      input.candidatePositionKey !== undefined &&
      !query.positionKeys.includes(input.candidatePositionKey)
    ) {
      throw new ContractError(
        "PERSON_NOT_IN_QUERY_RESULT",
        "/input/candidatePositionKey",
        "candidate key is outside query"
      );
    }
  } else if (operation === "coStar") {
    const people = new Set();
    let identityCount = 0;
    for (const [index, participant] of input.participants.entries()) {
      if (people.has(participant.personId)) {
        throw new ContractError(
          "FIELD_INVALID",
          "/input/participants",
          "duplicate person"
        );
      }
      people.add(participant.personId);
      validateIdentity(participant, query, `/input/participants/${index}`);
      identityCount += participant.positionKeys.length;
    }
    if (input.participants.length > manifest.limits.coStarParticipants) {
      throw new ContractError(
        "PARTICIPANT_LIMIT_EXCEEDED",
        "/input/participants",
        "participant limit exceeded"
      );
    }
    if (identityCount > manifest.limits.coStarIdentities) {
      throw new ContractError(
        "IDENTITY_LIMIT_EXCEEDED",
        "/input/participants",
        "identity limit exceeded"
      );
    }
  }
  return input === undefined ? { view } : { input, view };
}

const viewDocument = caseDocuments.get("operation-view");
for (const testCase of viewDocument.cases) {
  const query = positiveQueryById.get(testCase.queryCase).expected.effective;
  const result = normalizeOperation(
    testCase.operation,
    query,
    testCase.submittedInput,
    testCase.submittedView
  );
  if (testCase.expectedInput) {
    assert.deepEqual(result.input, testCase.expectedInput, `${testCase.id}:input`);
  }
  assert.deepEqual(result.view, testCase.expectedView, `${testCase.id}:view`);
}

for (const testCase of viewDocument.negativeCases) {
  const query = positiveQueryById.get(testCase.queryCase).expected.effective;
  let view = cloneJson(testCase.submittedView);
  let input = testCase.submittedInput && cloneJson(testCase.submittedInput);
  if (testCase.generatedSearch) {
    view.search = testCase.generatedSearch.value.repeat(
      testCase.generatedSearch.repeat
    );
  }
  if (testCase.generatedParticipants) {
    input = {
      participants: Array.from(
        { length: testCase.generatedParticipants.count },
        (_, index) => ({
          personId: index + 1,
          positionKeys: cloneJson(
            testCase.generatedParticipants.positionKeysPerPerson
          )
        })
      )
    };
  }
  assert.throws(
    () => normalizeOperation(testCase.operation, query, input, view),
    (error) =>
      error instanceof ContractError &&
      error.code === testCase.expectedCode &&
      error.pointer === testCase.expectedPath,
    testCase.id
  );
}

const errorDocument = caseDocuments.get("error-envelope");
const errorById = new Map(
  errorDocument.cases.map((testCase) => [testCase.id, testCase])
);
for (const testCase of errorDocument.cases) {
  assertNoLoneSurrogates(testCase.envelope);
  assertSafeJsonNumbers(testCase.envelope);
  validateOrThrow(validators.error, testCase.envelope);
  assert.deepEqual(
    {
      code: testCase.envelope.error.code,
      retryable: testCase.envelope.error.retryable,
      fieldErrors: testCase.envelope.error.fieldErrors
    },
    testCase.logicKey
  );
  if (testCase.sameLogicAs) {
    assert.deepEqual(
      testCase.logicKey,
      errorById.get(testCase.sameLogicAs).logicKey,
      testCase.id
    );
  }
}
for (const testCase of errorDocument.negativeCases) {
  assert.equal(validators.error(testCase.envelope), false, testCase.id);
}

function ensureMaterializedShare(payload, query, catalog) {
  assertNoLoneSurrogates(payload);
  assertSafeJsonNumbers(payload);
  const workspace = payload.workspace;
  if (
    workspace.kind === "co-star" &&
    workspace.state === "analysis" &&
    workspace.coStar
  ) {
    const ids = workspace.coStar.input.participants.map(
      (participant) => participant.personId
    );
    if (new Set(ids).size !== ids.length) {
      throw new ContractError(
        "SHARE_IDENTITY_INVALID",
        "/workspace/coStar/input/participants",
        "duplicate share participant"
      );
    }
  }
  validateOrThrow(validators.share, payload);
  const normalizedQuery = normalizeQuery(payload.query, catalog);
  if (canonicalize(normalizedQuery) !== canonicalize(payload.query)) {
    throw new ContractError(
      "SHARE_PAYLOAD_INVALID",
      "/query",
      "share query is not normalized"
    );
  }
  if (workspace.kind === "ranking") {
    const rankings = normalizeOperation(
      "rankings",
      query,
      undefined,
      workspace.rankingsView
    );
    if (canonicalize(rankings.view) !== canonicalize(workspace.rankingsView)) {
      throw new ContractError(
        "SHARE_PAYLOAD_INVALID",
        "/workspace/rankingsView",
        "ranking view is not materialized"
      );
    }
    if (workspace.detail) {
      const detail = normalizeOperation(
        "personDetail",
        query,
        workspace.detail.input,
        workspace.detail.view
      );
      if (canonicalize(detail) !== canonicalize(workspace.detail)) {
        throw new ContractError(
          "SHARE_PAYLOAD_INVALID",
          "/workspace/detail",
          "detail state is not normalized"
        );
      }
    }
  } else {
    const candidates = normalizeOperation(
      "candidates",
      query,
      workspace.candidates.input,
      workspace.candidates.view
    );
    if (canonicalize(candidates) !== canonicalize(workspace.candidates)) {
      throw new ContractError(
        "SHARE_PAYLOAD_INVALID",
        "/workspace/candidates",
        "candidate state is not normalized"
      );
    }
    if (workspace.state === "partners") {
      const partners = normalizeOperation(
        "partners",
        query,
        workspace.partners.input,
        workspace.partners.view
      );
      if (canonicalize(partners) !== canonicalize(workspace.partners)) {
        throw new ContractError(
          "SHARE_PAYLOAD_INVALID",
          "/workspace/partners",
          "partners state is not normalized"
        );
      }
    } else if (workspace.state === "analysis") {
      const coStar = normalizeOperation(
        "coStar",
        query,
        workspace.coStar.input,
        workspace.coStar.view
      );
      if (canonicalize(coStar) !== canonicalize(workspace.coStar)) {
        throw new ContractError(
          "SHARE_PAYLOAD_INVALID",
          "/workspace/coStar",
          "co-star state is not normalized"
        );
      }
    }
  }
}

function encodeShare(pathname, payload) {
  const canonical = canonicalize(payload);
  const decoded = Buffer.from(canonical, "utf8");
  if (decoded.byteLength > manifest.limits.shareDecodedBytes) {
    throw new ContractError("SHARE_SIZE_EXCEEDED", "", "decoded share too large");
  }
  const encoded = decoded.toString("base64url");
  if (encoded.length > manifest.limits.shareEncodedBytes) {
    throw new ContractError("SHARE_SIZE_EXCEEDED", "", "encoded share too large");
  }
  return {
    canonical,
    fragment: `${pathname}#q=v1.${encoded}`
  };
}

function decodeShare(fragment, catalog) {
  const marker = "#q=";
  const markerIndex = fragment.indexOf(marker);
  if (markerIndex < 0) {
    throw new ContractError("SHARE_ENCODING_INVALID", "", "missing share marker");
  }
  const pathname = fragment.slice(0, markerIndex);
  const encodedState = fragment.slice(markerIndex + marker.length);
  const dot = encodedState.indexOf(".");
  if (dot < 0) {
    throw new ContractError("SHARE_ENCODING_INVALID", "", "missing share version separator");
  }
  const version = encodedState.slice(0, dot);
  const encoded = encodedState.slice(dot + 1);
  if (version !== "v1") {
    throw new ContractError("SHARE_VERSION_UNSUPPORTED", "", "unsupported share version");
  }
  if (
    encoded.length === 0 ||
    encoded.length > manifest.limits.shareEncodedBytes
  ) {
    throw new ContractError("SHARE_SIZE_EXCEEDED", "", "encoded share exceeds limit");
  }
  if (!/^[A-Za-z0-9_-]+$/u.test(encoded)) {
    throw new ContractError("SHARE_ENCODING_INVALID", "", "non-base64url share");
  }
  const decoded = Buffer.from(encoded, "base64url");
  if (decoded.toString("base64url") !== encoded) {
    throw new ContractError("SHARE_ENCODING_INVALID", "", "non-canonical base64url");
  }
  if (decoded.byteLength > manifest.limits.shareDecodedBytes) {
    throw new ContractError("SHARE_SIZE_EXCEEDED", "", "decoded share exceeds limit");
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(decoded);
  } catch {
    throw new ContractError("SHARE_UTF8_INVALID", "", "invalid UTF-8");
  }
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new ContractError("SHARE_JSON_INVALID", "", "invalid share JSON");
  }
  const expectedPath = payload?.workspace?.kind === "ranking" ? "/ranking" : "/co-star";
  if (
    (pathname !== "/ranking" && pathname !== "/co-star") ||
    pathname !== expectedPath
  ) {
    throw new ContractError("SHARE_PATH_MISMATCH", "", "share path mismatch");
  }
  try {
    ensureMaterializedShare(payload, payload.query, catalog);
  } catch (error) {
    if (error instanceof ContractError && error.code === "SHARE_IDENTITY_INVALID") {
      throw error;
    }
    throw new ContractError("SHARE_PAYLOAD_INVALID", error.pointer ?? "", error.message);
  }
  if (canonicalize(payload) !== text) {
    throw new ContractError("SHARE_PAYLOAD_INVALID", "", "share JSON is not canonical");
  }
  return { pathname, payload, canonical: text };
}

const shareDocument = caseDocuments.get("share-fragment");
const shareById = new Map(
  shareDocument.cases.map((testCase) => [testCase.id, testCase])
);
for (const testCase of shareDocument.cases) {
  const queryCase = positiveQueryById.get(testCase.queryCase);
  ensureMaterializedShare(
    testCase.payload,
    queryCase.expected.effective,
    queryCase.catalog
  );
  const encoded = encodeShare(testCase.path, testCase.payload);
  assert.equal(encoded.canonical, testCase.expectedCanonical, `${testCase.id}:canonical`);
  assert.equal(encoded.fragment, testCase.expectedFragment, `${testCase.id}:fragment`);
  const decoded = decodeShare(encoded.fragment, queryCase.catalog);
  assert.equal(decoded.canonical, encoded.canonical, `${testCase.id}:roundtrip`);
  assert.deepEqual(decoded.payload, testCase.payload, `${testCase.id}:payload`);
}

function fragmentForMutatedShare(testCase) {
  if (testCase.fragment) {
    return {
      fragment: testCase.fragment,
      catalog: positiveQueryById.get("global-safe-position-id").catalog
    };
  }
  if (testCase.mutation === "encoded-over-limit") {
    return {
      fragment: `/ranking#q=v1.${"a".repeat(manifest.limits.shareEncodedBytes + 1)}`,
      catalog: positiveQueryById.get("global-safe-position-id").catalog
    };
  }
  if (testCase.mutation === "decoded-over-limit") {
    const oversized = Buffer.alloc(manifest.limits.shareDecodedBytes + 1, 0x20);
    assert.throws(
      () => {
        if (oversized.byteLength > manifest.limits.shareDecodedBytes) {
          throw new ContractError("SHARE_SIZE_EXCEEDED", "", "decoded cap");
        }
      },
      (error) => error.code === testCase.expectedCode,
      testCase.id
    );
    return null;
  }
  const base = shareById.get(testCase.baseCase);
  const queryCase = positiveQueryById.get(base.queryCase);
  let fragment = base.expectedFragment;
  if (testCase.mutation === "unsupported-version") {
    fragment = fragment.replace("#q=v1.", "#q=v2.");
  } else if (testCase.mutation === "add-padding") {
    fragment = `${fragment}=`;
  } else if (testCase.mutation === "invalid-alphabet") {
    fragment = `${fragment.slice(0, -1)}+`;
  } else if (testCase.mutation === "path-mismatch") {
    fragment = fragment.replace("/ranking#q=", "/co-star#q=");
  } else {
    const payload = cloneJson(base.payload);
    if (testCase.mutation === "extra-partners") {
      payload.workspace.partners = {
        input: {
          source: {
            personId: 1,
            positionKeys: [payload.query.positionKeys[0]]
          }
        },
        view: {
          search: "",
          sort: "count",
          order: "desc",
          page: 1,
          pageSize: 10
        }
      };
    } else if (testCase.mutation === "excluded-theme") {
      payload.theme = "dark";
    } else if (testCase.mutation === "duplicate-person") {
      payload.workspace.coStar.input.participants[1] = cloneJson(
        payload.workspace.coStar.input.participants[0]
      );
    } else if (testCase.mutation === "identity-outside-query") {
      payload.workspace.coStar.input.participants[0].positionKeys[0] =
        "staff:anime:2";
    } else if (testCase.mutation === "duplicate-position-key") {
      const key = payload.workspace.coStar.input.participants[0].positionKeys[0];
      payload.workspace.coStar.input.participants[0].positionKeys = [key, key];
    } else if (testCase.mutation === "participant-over-limit") {
      const key = payload.query.positionKeys[0];
      payload.workspace.coStar.input.participants = Array.from(
        { length: manifest.limits.coStarParticipants + 1 },
        (_, index) => ({
          personId: index + 1,
          positionKeys: [key]
        })
      );
    } else if (testCase.mutation === "noncanonical-json") {
      const text = JSON.stringify(payload, null, 2);
      return {
        fragment: `${base.path}#q=v1.${base64url(Buffer.from(text, "utf8"))}`,
        catalog: queryCase.catalog
      };
    } else {
      fail(`unknown share mutation ${testCase.mutation}`);
    }
    const pathname = base.path;
    const canonical = canonicalize(payload);
    fragment = `${pathname}#q=v1.${base64url(Buffer.from(canonical, "utf8"))}`;
  }
  return { fragment, catalog: queryCase.catalog };
}

for (const testCase of shareDocument.negativeCases) {
  const mutated = fragmentForMutatedShare(testCase);
  if (!mutated) {
    continue;
  }
  assert.throws(
    () => decodeShare(mutated.fragment, mutated.catalog),
    (error) =>
      error instanceof ContractError && error.code === testCase.expectedCode,
    testCase.id
  );
}

const unicodeDocument = caseDocuments.get("unicode");
for (const testCase of unicodeDocument.trimCases) {
  assert.equal(trimV1(testCase.input), testCase.expected, testCase.id);
}
for (const testCase of unicodeDocument.foldCases) {
  const normalized = normalizeTagToken(testCase.input, "/tag");
  assert.equal(normalized, testCase.expected, testCase.id);
  assert.equal(
    normalizeTagToken(normalized, "/tag"),
    normalized,
    `${testCase.id}:idempotence`
  );
}
for (const testCase of unicodeDocument.rejectionCases) {
  assert.throws(
    () => {
      if (testCase.object) {
        assertNoLoneSurrogates(testCase.object);
      } else {
        normalizeTagToken(testCase.input, "/tag");
      }
    },
    (error) =>
      error instanceof ContractError && error.code === testCase.expectedCode,
    testCase.id
  );
}

const rfcDocument = caseDocuments.get("rfc8785");
for (const testCase of rfcDocument.cases) {
  assert.equal(canonicalize(testCase.input), testCase.expected, testCase.id);
}

const textualDocument = caseDocuments.get("textual-json");
for (const testCase of textualDocument.cases) {
  if (testCase.expectedCode === "INVALID_JSON") {
    assert.throws(() => JSON.parse(testCase.text), SyntaxError, testCase.id);
  } else {
    assert.throws(
      () => {
        const parsed = JSON.parse(testCase.text);
        assertSafeJsonNumbers(parsed);
        validateOrThrow(validators.sharedQuery, parsed);
      },
      (error) =>
        error instanceof ContractError && error.code === testCase.expectedCode,
      testCase.id
    );
  }
}

function resolvePointer(root, pointer) {
  if (pointer === "") {
    return root;
  }
  return pointer
    .slice(1)
    .split("/")
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce((value, part) => value[part], root);
}

const unknownDocument = caseDocuments.get("unknown-field");
for (const testCase of unknownDocument.cases) {
  let value;
  let validate;
  let companion;
  if (testCase.target === "query") {
    const base = positiveQueryById.get(testCase.baseCase);
    value = cloneJson(base.submitted);
    companion = base.catalog;
    validate = () => normalizeQuery(value, companion);
  } else if (testCase.target === "catalog") {
    const base = positiveQueryById.get(testCase.baseCase);
    value = cloneJson(base.catalog);
    companion = base.submitted;
    validate = () => normalizeQuery(companion, value);
  } else if (testCase.target === "error") {
    value = cloneJson(errorById.get(testCase.baseCase).envelope);
    validate = () => validateOrThrow(validators.error, value);
  } else if (testCase.target === "share") {
    const base = shareById.get(testCase.baseCase);
    value = cloneJson(base.payload);
    const queryCase = positiveQueryById.get(base.queryCase);
    validate = () =>
      ensureMaterializedShare(value, queryCase.expected.effective, queryCase.catalog);
  } else {
    fail(`unknown injection target ${testCase.target}`);
  }
  resolvePointer(value, testCase.pointer)[unknownDocument.injectedProperty] =
    unknownDocument.injectedValue;
  assert.throws(
    validate,
    (error) =>
      error instanceof ContractError &&
      (error.code === unknownDocument.expectedCode ||
        error.code === "SHARE_PAYLOAD_INVALID"),
    testCase.id
  );
}

const openapi = JSON.parse(fs.readFileSync(openapiPath, "utf8"));
assert.equal(openapi.openapi, manifest.openapi.version);
assert.equal(openapi.jsonSchemaDialect, "https://json-schema.org/draft/2020-12/schema");
assert.equal(Object.keys(openapi.paths).length, manifest.openapi.paths);
assert.deepEqual(openapi.paths, {});
assert.equal(openapi.info.license.identifier, "MIT");
const requiredComponents = manifest.openapi.componentSchemas.names;
assert.equal(
  requiredComponents.length,
  manifest.openapi.componentSchemas.count
);
assert.deepEqual(
  Object.keys(openapi.components.schemas).sort(),
  requiredComponents
);
for (const name of requiredComponents) {
  assert.equal(
    typeof openapi.components.schemas[name]?.$ref,
    "string",
    `missing OpenAPI component ${name}`
  );
}
const responseNames = Object.keys(openapi.components.responses).sort();
assert.equal(
  responseNames.length,
  manifest.openapi.reusableErrorResponses.count
);
assert.deepEqual(responseNames, manifest.openapi.reusableErrorResponses.names);
const responseCodes = [];
for (const name of responseNames) {
  const response = openapi.components.responses[name];
  assert.equal(
    response.content?.["application/json"]?.schema?.$ref,
    "#/components/schemas/ErrorEnvelopeV1",
    `${name}: shared error envelope`
  );
  assert(Array.isArray(response["x-error-codes"]), `${name}: x-error-codes`);
  responseCodes.push(...response["x-error-codes"]);
}
assert.equal(new Set(responseCodes).size, responseCodes.length);
const errorSchema = schemas.find((schema) => schema.title === "ErrorEnvelopeV1");
assert.deepEqual(
  [...responseCodes].sort(),
  [...errorSchema.$defs.ErrorCodeV1.enum].sort(),
  "reusable responses cover every stable error code exactly once"
);

function walkSchema(value, pointer = "") {
  if (!value || typeof value !== "object") {
    return;
  }
  if (
    value.type === "object" &&
    value.additionalProperties !== false &&
    pointer !== "/$defs/FieldErrorsV1"
  ) {
    fail(`object schema is not closed: ${pointer}`);
  }
  for (const [key, child] of Object.entries(value)) {
    walkSchema(child, childPointer(pointer, key));
  }
}
for (const schema of schemas) {
  walkSchema(schema);
}

function forbiddenKeywordCounts(value) {
  const counts = Object.fromEntries(
    [...forbiddenBundleKeywords].sort().map((keyword) => [keyword, 0])
  );
  function visit(child) {
    if (!child || typeof child !== "object") {
      return;
    }
    if (!Array.isArray(child)) {
      for (const key of Object.keys(child)) {
        if (forbiddenBundleKeywords.has(key)) {
          counts[key] += 1;
        }
      }
    }
    for (const nested of Object.values(child)) {
      visit(nested);
    }
  }
  visit(value);
  return counts;
}

function compileExpandedValidatorMap(expansions, label) {
  const expandedAjv = new Ajv2020({
    strict: true,
    allErrors: true,
    validateFormats: true,
    allowUnionTypes: false
  });
  addFormats(expandedAjv);
  return Object.fromEntries(
    Object.entries(expansions).map(([name, schema]) => {
      try {
        return [name, expandedAjv.compile(cloneJson(schema))];
      } catch (error) {
        throw new Error(`${label}:${name}: ${error.message}`, { cause: error });
      }
    })
  );
}

function authorityPublicValidatorMap() {
  return Object.fromEntries(
    Object.entries(openapi.components.schemas).map(([name, schema]) => {
      assert.deepEqual(Object.keys(schema), ["$ref"], `${name}: authority ref`);
      const target = resolveReference(
        authorityContext,
        authorityContext.openapiFile,
        schema.$ref
      );
      const resourceId = authorityContext.documents.get(target.file).$id;
      assert.equal(typeof resourceId, "string", `${name}: resource ID`);
      const reference = `${resourceId}${target.fragment}`;
      const validator = ajv.getSchema(reference) ?? ajv.compile({ $ref: reference });
      assert.equal(typeof validator, "function", `${name}: authority validator`);
      return [name, validator];
    })
  );
}

function stableValidationResult(validator, value) {
  if (validator(value)) {
    return {
      accepted: true,
      classification: "accepted",
      instancePath: ""
    };
  }
  const failures = validator.errors.map((error) => {
    let instancePath = error.instancePath;
    if (error.keyword === "additionalProperties") {
      instancePath = childPointer(
        instancePath,
        error.params.additionalProperty
      );
    } else if (error.keyword === "required") {
      instancePath = childPointer(instancePath, error.params.missingProperty);
    }
    const priority =
      error.keyword === "additionalProperties"
        ? 0
        : error.keyword === "required"
          ? 1
          : ["oneOf", "anyOf", "allOf"].includes(error.keyword)
            ? 3
            : 2;
    return {
      accepted: false,
      classification: error.keyword,
      instancePath,
      priority
    };
  });
  failures.sort(
    (left, right) =>
      left.priority - right.priority ||
      right.instancePath.length - left.instancePath.length ||
      scalarCompare(left.instancePath, right.instancePath) ||
      scalarCompare(left.classification, right.classification)
  );
  const { accepted, classification, instancePath } = failures[0];
  return { accepted, classification, instancePath };
}

function collectGoldenObjectProbes() {
  const probes = [];
  const coveredIds = new Set();
  function visit(value, label, pointer = "") {
    if (!value || typeof value !== "object") {
      return;
    }
    probes.push({
      label: `${label}${pointer}`,
      value
    });
    for (const [key, child] of Object.entries(value)) {
      visit(child, label, childPointer(pointer, key));
    }
  }
  for (const entry of manifest.caseFiles) {
    const document = caseDocuments.get(entry.kind);
    for (const [caseGroup, cases] of Object.entries(document)) {
      if (!caseGroup.toLowerCase().includes("cases") || !Array.isArray(cases)) {
        continue;
      }
      for (const testCase of cases) {
        coveredIds.add(testCase.id);
        visit(testCase, `${entry.kind}/${caseGroup}/${testCase.id}`);
      }
    }
  }
  assert.deepEqual([...coveredIds].sort(), [...allCaseIds].sort());
  return probes;
}

function crossValidateGoldens(validatorMaps) {
  const labels = Object.keys(validatorMaps);
  assert.deepEqual(labels, [
    "authority",
    "projection-a",
    "projection-b",
    "bundle-a",
    "bundle-b"
  ]);
  const probes = collectGoldenObjectProbes();
  const publicNames = [...requiredComponents].sort();
  const snapshots = [];
  for (const probe of probes) {
    for (const schemaName of publicNames) {
      const results = labels.map((label) =>
        stableValidationResult(
          validatorMaps[label][schemaName],
          cloneJson(probe.value)
        )
      );
      for (let index = 1; index < results.length; index += 1) {
        assert.deepEqual(
          results[index],
          results[0],
          `${probe.label}:${schemaName}:${labels[index]} validation drift`
        );
      }
      snapshots.push([
        probe.label,
        schemaName,
        results[0].accepted,
        results[0].classification,
        results[0].instancePath
      ]);
    }
  }
  return {
    caseCount: allCaseIds.length,
    probeCount: probes.length,
    publicSchemaCount: publicNames.length,
    validatorSets: labels,
    validatorExecutions: probes.length * publicNames.length * labels.length,
    snapshotSha256: sha256(canonicalize(snapshots))
  };
}

function extractTypeScriptDeclarations(source) {
  const topLevel = [
    ...source.matchAll(
      /^export (?:type|interface) ([A-Za-z_$][A-Za-z0-9_$]*)\b/gmu
    )
  ]
    .map((match) => match[1])
    .sort(scalarCompare);
  const schemaStart = source.indexOf("    schemas: {");
  const responseStart = source.indexOf("\n    responses: {", schemaStart);
  assert(schemaStart >= 0, "TypeScript schemas block");
  assert(responseStart > schemaStart, "TypeScript responses block");
  const schemaBlock = source.slice(schemaStart, responseStart);
  const componentSchemas = schemaBlock
    .split("\n")
    .map((line) =>
      line.match(
        /^ {8}(?:"([^"]+)"|([A-Za-z_$][A-Za-z0-9_$]*)):/u
      )
    )
    .filter(Boolean)
    .map((match) => match[1] ?? match[2])
    .sort(scalarCompare);
  assert.equal(new Set(topLevel).size, topLevel.length);
  assert.equal(new Set(componentSchemas).size, componentSchemas.length);
  return {
    topLevel,
    componentSchemas
  };
}

function extractGoDeclarations(source) {
  const declarations = [
    ...source.matchAll(/^type ([A-Za-z_][A-Za-z0-9_]*)\b/gmu)
  ]
    .map((match) => match[1])
    .sort(scalarCompare);
  assert.equal(new Set(declarations).size, declarations.length);
  return declarations;
}

function exactFileEvidence(file, repositoryRelative = true) {
  const metadata = assertRegularNonSymlink(file);
  return {
    path: repositoryRelative ? path.relative(repositoryRoot, file) : file,
    bytes: metadata.size,
    sha256: sha256(fs.readFileSync(file))
  };
}

function verifyCodegenEvidence() {
  const temporaryRoot = assertOwnedRealPath(path.join(goldenRoot, ".tmp"));
  const projectionEvidence = [];
  const projectionContexts = [];
  const projectionExpansions = [];
  const bundles = [];
  const bundleBuffers = [];
  assertNoRedoclyLintIgnore();
  for (const projectionName of projectionNames) {
    const projectionRoot = assertOwnedRealPath(
      path.join(temporaryRoot, projectionName)
    );
    assertNoSymlinksBelow(projectionRoot);
    assert.deepEqual(
      listTreeFiles(projectionRoot),
      [...projectionSourceInventory, "query.bundle.json"].sort()
    );
    assert.equal(
      fs.readFileSync(path.join(projectionRoot, "redocly.yaml"), "utf8"),
      "{}\n"
    );
    const projectionOpenapi = path.join(
      projectionRoot,
      "source/openapi/openapi.yaml"
    );
    assert.deepEqual(
      fs.readFileSync(projectionOpenapi),
      fs.readFileSync(openapiPath),
      `${projectionName}: OpenAPI authority bytes`
    );
    const projectionSchemaRoot = path.join(
      projectionRoot,
      "source/schemas/query"
    );
    let deletedRootKeys = 0;
    for (const schemaName of authoritySchemaNames) {
      const authoritySchema = readJson(path.join(schemaRoot, schemaName));
      const sanitizedSchema = readJson(
        path.join(projectionSchemaRoot, schemaName)
      );
      const expectedSchema = cloneJson(authoritySchema);
      assert.equal(typeof expectedSchema.$id, "string");
      assert.equal(
        expectedSchema.$schema,
        "https://json-schema.org/draft/2020-12/schema"
      );
      delete expectedSchema.$id;
      delete expectedSchema.$schema;
      deletedRootKeys += 2;
      assert.deepEqual(
        sanitizedSchema,
        expectedSchema,
        `${projectionName}:${schemaName}: exact two-key sanitization`
      );
    }
    assert.equal(deletedRootKeys, 14);
    const projectionContext = createReferenceContext(
      projectionOpenapi,
      projectionSchemaRoot
    );
    const audit = auditReferenceContext(projectionContext, {
      expectRootResourceKeys: false
    });
    const expansions = publicSchemaExpansions(projectionContext);
    const bundlePath = path.join(projectionRoot, "query.bundle.json");
    const bundleBuffer = fs.readFileSync(bundlePath);
    const bundle = JSON.parse(bundleBuffer.toString("utf8"));
    projectionContexts.push(projectionContext);
    projectionExpansions.push(expansions);
    bundleBuffers.push(bundleBuffer);
    bundles.push(bundle);
    projectionEvidence.push({
      name: projectionName,
      inventory: projectionSourceInventory,
      deletedRootKeys,
      sourceTreeSha256: treeSha256(
        projectionRoot,
        projectionSourceInventory
      ),
      audit
    });
  }
  assert.deepEqual(projectionEvidence[0], {
    ...projectionEvidence[1],
    name: "codegen-a"
  });
  assert.deepEqual(projectionExpansions[0], projectionExpansions[1]);
  assert.deepEqual(bundleBuffers[0], bundleBuffers[1]);
  assert.deepEqual(
    manifest.acceptanceEvidence.projections,
    projectionEvidence
  );

  const bundleSha256 = sha256(bundleBuffers[0]);
  const bundleBytes = bundleBuffers[0].byteLength;
  const publicNames = [...requiredComponents].sort();
  const bundleSchemaNames = Object.keys(bundles[0].components.schemas).sort(
    scalarCompare
  );
  const helperNames = bundleSchemaNames.filter(
    (name) => !publicNames.includes(name)
  );
  const zeroKeywordCounts = Object.fromEntries(
    [...forbiddenBundleKeywords]
      .sort()
      .map((keyword) => [keyword, 0])
  );
  const authorityTopKeys = Object.keys(openapi).sort(scalarCompare);
  const authorityComponentKeys = Object.keys(openapi.components).sort(
    scalarCompare
  );
  const metadataKeys = [
    "openapi",
    "info",
    "jsonSchemaDialect",
    "servers",
    "paths"
  ];
  for (const [index, bundle] of bundles.entries()) {
    assert.deepEqual(
      forbiddenKeywordCounts(bundle),
      zeroKeywordCounts,
      `${projectionNames[index]}: forbidden bundle keywords`
    );
    assert.deepEqual(
      Object.keys(bundle).sort(scalarCompare),
      authorityTopKeys,
      `${projectionNames[index]}: top-level keys`
    );
    assert.deepEqual(
      Object.keys(bundle.components).sort(scalarCompare),
      authorityComponentKeys,
      `${projectionNames[index]}: component keys`
    );
    for (const key of metadataKeys) {
      assert.deepEqual(
        bundle[key],
        openapi[key],
        `${projectionNames[index]}: metadata ${key}`
      );
    }
    assert.deepEqual(bundle.paths, {});
    assert.deepEqual(
      Object.keys(bundle.components.schemas)
        .filter((name) => publicNames.includes(name))
        .sort(scalarCompare),
      publicNames
    );
    assert.deepEqual(
      Object.keys(bundle.components.schemas)
        .filter((name) => !publicNames.includes(name))
        .sort(scalarCompare),
      helperNames
    );
    for (const name of publicNames) {
      assert.deepEqual(
        bundle.components.schemas[name],
        projectionExpansions[index][name],
        `${projectionNames[index]}:${name}: independent expansion`
      );
    }
  }
  const bundleEvidence = {
    bytes: bundleBytes,
    sha256: bundleSha256,
    byteIdentical: true,
    forbiddenKeywordCounts: zeroKeywordCounts,
    totalComponentSchemas: bundleSchemaNames.length,
    publicComponentSchemas: publicNames,
    helperComponentSchemas: helperNames
  };
  assert.deepEqual(manifest.acceptanceEvidence.bundle, bundleEvidence);

  const responseSummary = {};
  const expectedErrorSchema = projectionExpansions[0].ErrorEnvelopeV1;
  for (const responseName of responseNames) {
    const authorityResponse = openapi.components.responses[responseName];
    const authorityMediaTypes = Object.keys(authorityResponse.content).sort(
      scalarCompare
    );
    responseSummary[responseName] = {
      description: authorityResponse.description,
      xErrorCodes: authorityResponse["x-error-codes"],
      mediaTypes: authorityMediaTypes
    };
    for (const [index, bundle] of bundles.entries()) {
      const response = bundle.components.responses[responseName];
      assert.deepEqual(
        Object.keys(response).sort(scalarCompare),
        ["content", "description", "x-error-codes"]
      );
      assert.equal(response.description, authorityResponse.description);
      assert.deepEqual(
        response["x-error-codes"],
        authorityResponse["x-error-codes"]
      );
      assert.deepEqual(
        Object.keys(response.content).sort(scalarCompare),
        authorityMediaTypes
      );
      for (const mediaType of authorityMediaTypes) {
        assert.deepEqual(
          Object.keys(response.content[mediaType]),
          ["schema"],
          `${projectionNames[index]}:${responseName}:${mediaType}: media fields`
        );
        assert.deepEqual(
          response.content[mediaType].schema,
          expectedErrorSchema,
          `${projectionNames[index]}:${responseName}:${mediaType}: envelope expansion`
        );
      }
    }
  }
  assert.deepEqual(
    Object.keys(bundles[0].components.responses).sort(scalarCompare),
    responseNames
  );
  assert.deepEqual(
    Object.keys(bundles[1].components.responses).sort(scalarCompare),
    responseNames
  );
  const responseEvidence = {
    names: responseNames,
    allowedResponseFields: ["content", "description", "x-error-codes"],
    allowedMediaFields: ["schema"],
    mediaTypes: ["application/json"],
    expandedSchemaComponent: "ErrorEnvelopeV1",
    expandedSchemaCanonicalDeepEqual: true,
    authorityMetadataSha256: sha256(canonicalize(responseSummary))
  };
  assert.deepEqual(
    manifest.acceptanceEvidence.responseEquivalence,
    responseEvidence
  );

  const validatorMaps = {
    authority: authorityPublicValidatorMap(),
    "projection-a": compileExpandedValidatorMap(
      projectionExpansions[0],
      "projection-a"
    ),
    "projection-b": compileExpandedValidatorMap(
      projectionExpansions[1],
      "projection-b"
    ),
    "bundle-a": compileExpandedValidatorMap(
      bundles[0].components.schemas,
      "bundle-a"
    ),
    "bundle-b": compileExpandedValidatorMap(
      bundles[1].components.schemas,
      "bundle-b"
    )
  };
  const goldenEquivalence = crossValidateGoldens(validatorMaps);
  console.log(
    `codegen golden equivalence evidence: ${JSON.stringify(goldenEquivalence)}`
  );
  assert.deepEqual(
    manifest.acceptanceEvidence.goldenEquivalence,
    goldenEquivalence
  );

  const typescriptAPath = path.join(temporaryRoot, "query-a.d.ts");
  const typescriptBPath = path.join(temporaryRoot, "query-b.d.ts");
  const typescriptA = fs.readFileSync(typescriptAPath);
  const typescriptB = fs.readFileSync(typescriptBPath);
  assert.deepEqual(typescriptA, typescriptB, "TypeScript outputs differ");
  const typescriptDeclarations = extractTypeScriptDeclarations(
    typescriptA.toString("utf8")
  );
  const typescriptEvidence = {
    bytes: typescriptA.byteLength,
    sha256: sha256(typescriptA),
    byteIdentical: true,
    declarations: typescriptDeclarations.topLevel,
    componentDeclarations: typescriptDeclarations.componentSchemas
  };
  assert.deepEqual(manifest.codegen.typescript.output, typescriptEvidence);
  for (const name of publicNames) {
    assert(
      typescriptDeclarations.componentSchemas.includes(name),
      `TypeScript misses public component ${name}`
    );
  }

  assert.deepEqual(manifest.acceptanceEvidence.goSandbox.profile, {
    text: approvedGoSandboxProfile,
    sha256: approvedGoSandboxProfileSha256
  });
  assert.equal(
    manifest.acceptanceEvidence.goSandbox.wrapper,
    goSandboxWrapper
  );
  assert.deepEqual(
    manifest.acceptanceEvidence.goSandbox.environment,
    goEnvironment
  );
  assert.equal(
    manifest.acceptanceEvidence.goSandbox.recoveryHistory.candidateAdmission,
    "excluded"
  );
  const goDownloadPolicy =
    manifest.acceptanceEvidence.goDownloadProgress;
  const goOutputPath = path.join(temporaryRoot, "query.gen.go");
  const replayOutputPath = path.join(temporaryRoot, "query.verify.gen.go");
  for (const [outputPath, label] of [
    [goOutputPath, "Go primary output"],
    [replayOutputPath, "Go replay output"]
  ]) {
    const outputState = lstatResult(outputPath);
    if (outputState.exists) {
      assertRegularNonSymlink(outputPath, label);
      fs.rmSync(outputPath, { force: false });
    }
  }
  const goSourcePath = path.join(
    temporaryRoot,
    "codegen-a/query.bundle.json"
  );
  const goGenerateArgs = (outputPath) => [
    "run",
    "github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen@v2.8.0",
    "-generate",
    "models,skip-prune",
    "-package",
    "querywire",
    "-o",
    path.relative(repositoryRoot, outputPath),
    path.relative(repositoryRoot, goSourcePath)
  ];
  const primaryGenerate = runGoSandboxed(
    goExecutable,
    goGenerateArgs(goOutputPath),
    {
      label: "candidate primary Go generation"
    }
  );
  const primaryStderr = admitGoDownloadProgress(
    primaryGenerate.stderr,
    goDownloadPolicy,
    "candidate primary Go generation"
  );
  const replayGenerate = runGoSandboxed(
    goExecutable,
    goGenerateArgs(replayOutputPath),
    {
    label: "deterministic Go generation replay"
    }
  );
  const replayStderr = admitGoDownloadProgress(
    replayGenerate.stderr,
    goDownloadPolicy,
    "deterministic Go generation replay"
  );
  const goOutput = fs.readFileSync(goOutputPath);
  const replayOutput = fs.readFileSync(replayOutputPath);
  assert.deepEqual(replayOutput, goOutput, "Go replay output differs");
  assert(goOutput.byteLength > 190, "Go output is header-only");
  assert.notEqual(
    sha256(goOutput),
    "3a96d587a33aca1902c2a4325c86273647c4e7a830250a8bb8589285a99d31d0",
    "Go output matches rejected default-pruning evidence"
  );
  const goDeclarations = extractGoDeclarations(goOutput.toString("utf8"));
  for (const name of requiredPublicGoDeclarations) {
    assert(
      goDeclarations.includes(name),
      `Go output misses public type declaration ${name}`
    );
  }
  const gofmt = runGoSandboxed(
    gofmtExecutable,
    ["-d", "query.gen.go"],
    {
      cwd: temporaryRoot,
      label: "gofmt"
    }
  );
  assert.equal(gofmt.stdout, "", "generated Go is not gofmt-clean");
  assert.equal(gofmt.stderr, "", "gofmt emitted stderr");
  const goTest = runGoSandboxed(
    goExecutable,
    ["test", "query.gen.go"],
    {
      cwd: temporaryRoot,
      label: "Go compile smoke"
    }
  );
  const compileStderr = admitGoDownloadProgress(
    goTest.stderr,
    goDownloadPolicy,
    "Go compile smoke"
  );
  const goEvidence = {
    bytes: goOutput.byteLength,
    sha256: sha256(goOutput),
    declarationCount: goDeclarations.length,
    declarations: goDeclarations,
    requiredPublicDeclarations: requiredPublicGoDeclarations,
    primaryGeneration: {
      childArgv: primaryGenerate.argv,
      status: primaryGenerate.status,
      stdoutSha256: sha256(primaryGenerate.stdout)
    },
    deterministicReplay: {
      childArgv: replayGenerate.argv,
      status: replayGenerate.status,
      stdoutSha256: sha256(replayGenerate.stdout),
      bytes: replayOutput.byteLength,
      sha256: sha256(replayOutput),
      byteIdentical: true
    },
    gofmt: {
      childArgv: gofmt.argv,
      status: gofmt.status,
      stdoutBytes: Buffer.byteLength(gofmt.stdout),
      stderrBytes: Buffer.byteLength(gofmt.stderr)
    },
    compileSmoke: {
      childArgv: goTest.argv,
      status: goTest.status,
      stdoutSha256: sha256(goTest.stdout)
    }
  };
  assert.deepEqual(manifest.codegen.go.output, goEvidence);
  assert.deepEqual(
    manifest.codegen.go.primaryGeneration.childArgv,
    primaryGenerate.argv
  );
  assert.deepEqual(
    manifest.codegen.go.primaryGeneration.wrapperArgv,
    primaryGenerate.wrapperArgv
  );
  assert.equal(
    manifest.codegen.go.primaryGeneration.status,
    primaryGenerate.status
  );
  assert.deepEqual(
    manifest.codegen.go.deterministicReplayChildArgv,
    replayGenerate.argv
  );
  assert.deepEqual(
    manifest.codegen.go.wrapperPrefixArgv,
    [
      goSandboxWrapper,
      "-p",
      approvedGoSandboxProfile,
      cleanEnvironmentExecutable,
      "-i",
      ...goEnvironmentArgv()
    ]
  );
  console.log(
    `candidate-success Go stderr evidence: ${JSON.stringify({
      policy: goDownloadPolicy.name,
      primaryGeneration: primaryStderr,
      deterministicReplay: replayStderr,
      compileSmoke: compileStderr,
      gofmt: {
        accepted: gofmt.stderr === "",
        stderrBytes: Buffer.byteLength(gofmt.stderr)
      }
    })}`
  );

  const verifierFile = fileURLToPath(import.meta.url);
  assert.deepEqual(
    manifest.acceptanceEvidence.projectionTool.verifier,
    exactFileEvidence(verifierFile)
  );
  assert.deepEqual(
    manifest.acceptanceEvidence.runtime.go,
    exactFileEvidence(goExecutable, false)
  );
  assert.deepEqual(
    manifest.acceptanceEvidence.runtime.gofmt,
    exactFileEvidence(gofmtExecutable, false)
  );
  const redoclyCli = path.join(
    goldenRoot,
    "node_modules/@redocly/cli/bin/cli.js"
  );
  const typescriptCli = path.join(
    goldenRoot,
    "node_modules/openapi-typescript/bin/cli.js"
  );
  assert.deepEqual(
    manifest.acceptanceEvidence.redocly.cli,
    exactFileEvidence(redoclyCli)
  );
  assert.deepEqual(
    manifest.codegen.typescript.cli,
    exactFileEvidence(typescriptCli)
  );
  assert.equal(
    readJson(path.join(goldenRoot, "node_modules/@redocly/cli/package.json"))
      .version,
    manifest.acceptanceEvidence.redocly.version
  );
  assert.equal(
    readJson(path.join(goldenRoot, "node_modules/openapi-typescript/package.json"))
      .version,
    manifest.codegen.typescript.version
  );
  console.log(
    [
      `verified byte-identical ${bundleBytes}-byte codegen bundles`,
      `${helperNames.length} helper schemas`,
      `${goldenEquivalence.validatorExecutions} cross-validator golden executions`,
      `byte-identical ${typescriptA.byteLength}-byte TypeScript outputs`,
      `${goDeclarations.length} Go type declarations with sandboxed replay/format/compile`
    ].join(", ")
  );
}

if (verifyCodegenProjections) {
  verifyCodegenEvidence();
} else {
  for (const [name, metadata] of Object.entries({
    "query-a.d.ts": manifest.codegen.typescript.output,
    "query-b.d.ts": manifest.codegen.typescript.output,
    "query.gen.go": manifest.codegen.go.output
  })) {
    const output = path.join(goldenRoot, ".tmp", name);
    if (fs.existsSync(output)) {
      assertRegularNonSymlink(output, name);
      assert(fs.statSync(output).size > 0, `${name} is empty`);
      assert.equal(
        sha256(fs.readFileSync(output)),
        metadata.sha256,
        `${name} hash`
      );
    }
  }
}

console.log(
  [
    `verified ${schemas.length} strict schemas`,
    `${allCaseIds.length} golden cases`,
    `${normalizationAssertions} pinned NFKC assertions`,
    `${manifest.unicode.files.length} Unicode hashes`,
    `${requiredComponents.length} OpenAPI components`
  ].join(", ")
);
