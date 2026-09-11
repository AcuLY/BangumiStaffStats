import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const verifierFile = fs.realpathSync(fileURLToPath(import.meta.url));
const goldenRoot = path.dirname(verifierFile);
const repositoryRootCandidate = path.resolve(goldenRoot, "../../..");
const repositoryRoot = fs.realpathSync(repositoryRootCandidate);
assert.equal(
  repositoryRoot,
  repositoryRootCandidate,
  `repository root is not canonical: ${repositoryRootCandidate} -> ${repositoryRoot}`
);
assert.equal(
  path.relative(repositoryRoot, verifierFile).split(path.sep).join("/"),
  "contracts/goldens/query/verify-current.mjs",
  "verifier location does not match the fixed repository layout"
);
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
const queryOwnedGitignorePrefix = "/contracts/goldens/query/";
const queryOwnedGitignoreRules = [
  "/contracts/goldens/query/node_modules/",
  "/contracts/goldens/query/.cache/npm/",
  "/contracts/goldens/query/.cache/go-build/",
  "/contracts/goldens/query/.cache/go-mod/",
  "/contracts/goldens/query/.cache/go-path/",
  "/contracts/goldens/query/.tmp/"
];
const authoritySchemaNames = [
  "catalog-context-v1.schema.json",
  "effective-query-v1.schema.json",
  "error-envelope-v1.schema.json",
  "operation-components-v1.schema.json",
  "query-digest-projection-v1.schema.json",
  "shared-query-v1.schema.json"
];
const queryProjectionDescription =
  "Wave 1 shared query components. Business endpoint paths and result DTOs are intentionally deferred.";
const queryProjectionComponentNames = [
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
  "ErrorEnvelopeV1"
];
const queryProjectionResponseNames = [
  "BadRequestErrorV1",
  "ForbiddenErrorV1",
  "NotFoundErrorV1",
  "PayloadTooLargeErrorV1",
  "UnsupportedMediaTypeErrorV1",
  "RateLimitedErrorV1",
  "ServiceUnavailableErrorV1",
  "GatewayTimeoutErrorV1",
  "InternalErrorV1"
];
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

const manifest = JSON.parse(fs.readFileSync(path.join(goldenRoot, 'manifest.json'), 'utf8'));
const mode = process.argv[2] ?? '--check';
assert(['--check', '--refresh'].includes(mode), 'usage: node verify.mjs [--check|--refresh]');
assert.equal(process.version, 'v24.18.0', 'query verification requires pinned Node');
const [{ default: Ajv2020 }, { default: addFormats }, { default: canonicalize }] = await Promise.all([import('ajv/dist/2020.js'), import('ajv-formats'), import('canonicalize')]);
function fail(message) { throw new Error(message); }
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

function createReferenceContext(openapiFile, schemasDirectory, options = {}) {
  const { openapiDocument } = options;
  const schemaFiles = authoritySchemaNames.map((name) =>
    path.join(schemasDirectory, name)
  );
  const files = [openapiFile, ...schemaFiles].map((file) => path.resolve(file));
  const documents = new Map(
    files.map((file) => [file, JSON.parse(fs.readFileSync(file, "utf8"))])
  );
  if (openapiDocument !== undefined) {
    documents.set(path.resolve(openapiFile), cloneJson(openapiDocument));
  }
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

function queryProjectionInventories(manifestValue) {
  const componentNames = manifestValue.openapi?.componentSchemas?.names;
  const responseNames = manifestValue.openapi?.reusableErrorResponses?.names;
  assert.equal(
    manifestValue.openapi?.componentSchemas?.count,
    queryProjectionComponentNames.length,
    "Query projection component count"
  );
  assert.equal(
    manifestValue.openapi?.reusableErrorResponses?.count,
    queryProjectionResponseNames.length,
    "Query projection response count"
  );
  assert.deepEqual(
    [...componentNames].sort(),
    [...queryProjectionComponentNames].sort(),
    "Query projection component inventory"
  );
  assert.deepEqual(
    [...responseNames].sort(),
    [...queryProjectionResponseNames].sort(),
    "Query projection response inventory"
  );
  assert.equal(new Set(componentNames).size, componentNames.length);
  assert.equal(new Set(responseNames).size, responseNames.length);
  return {
    componentNames: queryProjectionComponentNames,
    responseNames: queryProjectionResponseNames
  };
}

function buildQueryOpenapiProjection(authority, manifestValue) {
  const { componentNames, responseNames } =
    queryProjectionInventories(manifestValue);
  assert.equal(authority.openapi, manifestValue.openapi.version);
  assert.equal(
    authority.jsonSchemaDialect,
    "https://json-schema.org/draft/2020-12/schema"
  );
  assert(authority.info && typeof authority.info === "object");
  assert(Array.isArray(authority.servers));
  const authoritySchemas = authority.components?.schemas;
  const authorityResponses = authority.components?.responses;
  assert(
    authoritySchemas && typeof authoritySchemas === "object",
    "shared authority is missing components.schemas"
  );
  assert(
    authorityResponses && typeof authorityResponses === "object",
    "shared authority is missing components.responses"
  );
  const missingSchemas = componentNames.filter(
    (name) => !Object.hasOwn(authoritySchemas, name)
  );
  const missingResponses = responseNames.filter(
    (name) => !Object.hasOwn(authorityResponses, name)
  );
  if (missingSchemas.length > 0) {
    fail(`shared authority is missing Query-owned schemas: ${missingSchemas.join(", ")}`);
  }
  if (missingResponses.length > 0) {
    fail(
      `shared authority is missing Query-owned responses: ${missingResponses.join(", ")}`
    );
  }
  return {
    openapi: cloneJson(authority.openapi),
    jsonSchemaDialect: cloneJson(authority.jsonSchemaDialect),
    info: {
      ...cloneJson(authority.info),
      description: queryProjectionDescription
    },
    servers: cloneJson(authority.servers),
    paths: {},
    components: {
      schemas: Object.fromEntries(
        componentNames.map((name) => [name, cloneJson(authoritySchemas[name])])
      ),
      responses: Object.fromEntries(
        responseNames.map((name) => [
          name,
          cloneJson(authorityResponses[name])
        ])
      )
    }
  };
}

function queryOpenapiProjectionBytes(projection) {
  return Buffer.from(`${JSON.stringify(projection, null, 2)}\n`, "utf8");
}

function queryProjectionSyntheticEvidence(authority, manifestValue, bytes) {
  const unrelated = cloneJson(authority);
  unrelated.info.description = "Synthetic unrelated endpoint authority";
  unrelated.paths = {
    ...unrelated.paths,
    "/__synthetic-query-unrelated": {
      get: {
        responses: {
          200: {
            description: "Synthetic unrelated response"
          }
        }
      }
    }
  };
  unrelated.components = {
    ...unrelated.components,
    schemas: {
      ...unrelated.components.schemas,
      SyntheticEndpointOnlyV1: {
        $ref: "../schemas/synthetic/endpoint-only-v1.schema.json"
      }
    },
    headers: {
      ...(unrelated.components.headers ?? {}),
      SyntheticEndpointHeaderV1: {
        schema: {
          type: "string"
        }
      }
    },
    responses: {
      ...unrelated.components.responses,
      SyntheticEndpointResponseV1: {
        description: "Synthetic endpoint-only response"
      }
    }
  };
  const unrelatedBytes = queryOpenapiProjectionBytes(
    buildQueryOpenapiProjection(unrelated, manifestValue)
  );
  assert.deepEqual(
    unrelatedBytes,
    bytes,
    "unrelated authority changed Query projection bytes"
  );

  const ownedMutation = cloneJson(authority);
  const ownedName = queryProjectionComponentNames[0];
  ownedMutation.components.schemas[ownedName] = {
    ...ownedMutation.components.schemas[ownedName],
    "x-synthetic-query-owned-drift": true
  };
  const ownedMutationBytes = queryOpenapiProjectionBytes(
    buildQueryOpenapiProjection(ownedMutation, manifestValue)
  );
  assert.notDeepEqual(
    ownedMutationBytes,
    bytes,
    "owned Query component mutation did not change projection bytes"
  );

  const missingSchema = cloneJson(authority);
  delete missingSchema.components.schemas[ownedName];
  assert.throws(
    () => buildQueryOpenapiProjection(missingSchema, manifestValue),
    /missing Query-owned schemas/u
  );
  const missingResponse = cloneJson(authority);
  delete missingResponse.components.responses[queryProjectionResponseNames[0]];
  assert.throws(
    () => buildQueryOpenapiProjection(missingResponse, manifestValue),
    /missing Query-owned responses/u
  );

  return {
    unrelatedMutationKinds: [
      "description",
      "header",
      "path",
      "response",
      "schema"
    ],
    unrelatedProjectionSha256: sha256(unrelatedBytes),
    unrelatedProjectionByteIdentical: true,
    ownedComponentMutationSha256: sha256(ownedMutationBytes),
    ownedComponentMutationChangesSha256:
      sha256(ownedMutationBytes) !== sha256(bytes),
    missingOwnedMembersRejected: ["response", "schema"]
  };
}

function createQueryProjectionState(authority, manifestValue) {
  const projection = buildQueryOpenapiProjection(authority, manifestValue);
  const bytes = queryOpenapiProjectionBytes(projection);
  return {
    projection,
    bytes,
    sha256: sha256(bytes),
    syntheticEvidence: queryProjectionSyntheticEvidence(
      authority,
      manifestValue,
      bytes
    )
  };
}

function queryAuthorityEvidence(state, audit) {
  const publicComponentSchemas = Object.keys(
    state.projection.components.schemas
  ).sort();
  const reusableErrorResponses = Object.keys(
    state.projection.components.responses
  ).sort();
  return {
    files: [
      "contracts/openapi/openapi.yaml",
      ...authoritySchemaNames.map(
        (name) => `contracts/schemas/query/${name}`
      )
    ],
    audit,
    canonicalSource: {
      encoding: "UTF-8",
      lineEndings: "LF",
      finalLf: true,
      bytes: state.bytes.byteLength,
      sha256: state.sha256,
      description: queryProjectionDescription
    },
    syntheticStability: state.syntheticEvidence,
    topLevelKeys: Object.keys(state.projection).sort(),
    paths: Object.keys(state.projection.paths).length,
    publicComponentSchemas,
    reusableErrorResponses
  };
}

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

const declaredCaseFiles = manifest.caseFiles.map((entry) => entry.path).sort();
const actualCaseFiles = fs
  .readdirSync(path.join(goldenRoot, "cases"))
  .filter((name) => name.endsWith(".json"))
  .map((name) => `cases/${name}`)
  .sort();
assert.deepEqual(actualCaseFiles, declaredCaseFiles);
assert.deepEqual(listPhysicalFiles(goldenRoot), [
  "manifest.json", "package-lock.json", "package.json", "verify.mjs", "verify-current.mjs",
  "fixtures/go-module/go.mod.lock", "fixtures/go-module/go.sum.lock",
  ...declaredCaseFiles, ...manifest.unicode.files.map(entry => entry.path)
].sort(), "committed query contract inventory");
const ownedIgnoreRules = fs.readFileSync(path.join(repositoryRoot, ".gitignore"), "utf8")
  .replaceAll("\r\n", "\n").split("\n")
  .filter(line => line.startsWith(queryOwnedGitignorePrefix));
assert.deepEqual(ownedIgnoreRules, queryOwnedGitignoreRules, "query-owned ignored disposable roots");

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
assert.deepEqual(packageJson.engines, { node: ">=20.19.0 <21.0.0 || >=22.12.0", npm: ">=10" });
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


const queryOpenapiProjection = createQueryProjectionState(readJson(openapiPath), manifest);
const authorityContext = createReferenceContext(openapiPath, schemaRoot, { openapiDocument: queryOpenapiProjection.projection });
const authorityAudit = auditReferenceContext(authorityContext);
const originalContractInputs = JSON.stringify({ manifest, cases: manifest.caseFiles.map(entry => readJson(path.join(goldenRoot, entry.path))) });
const caseDocuments = new Map(
  manifest.caseFiles.map((entry) => [
    entry.kind,
    readJson(path.join(goldenRoot, entry.path))
  ])
);
const originalGoldenObjects = JSON.stringify([...caseDocuments]);
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
  // Git may materialize text fixtures with CRLF on Windows; verify canonical LF bytes.
  const bytes = Buffer.from(fs.readFileSync(absolute, "utf8").replaceAll("\r\n", "\n"));
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
  error: ajv.getSchema(schemaIds.ErrorEnvelopeV1)
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
  } else {
    fail(`unknown injection target ${testCase.target}`);
  }
  resolvePointer(value, testCase.pointer)[unknownDocument.injectedProperty] =
    unknownDocument.injectedValue;
  assert.throws(
    validate,
    (error) =>
      error instanceof ContractError &&
      error.code === unknownDocument.expectedCode,
    testCase.id
  );
}

const openapi = queryOpenapiProjection.projection;
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

function closedCompositionConstraint(value, pointer, root) {
  if (!pointer.endsWith('/allOf/1')) return false;
  const parent = jsonPointerValue(root, `#${pointer.slice(0, -'/allOf/1'.length)}`, pointer);
  const reference = parent.allOf?.[0]?.$ref;
  if (!reference?.startsWith('#/$defs/')) return false;
  const base = jsonPointerValue(root, reference, pointer);
  return base.additionalProperties === false &&
    Object.keys(value).every(key => key === 'type' || key === 'properties') &&
    Object.keys(value.properties ?? {}).every(key => Object.hasOwn(base.properties ?? {}, key));
}

function walkSchema(value, pointer = "", root = value) {
  if (!value || typeof value !== "object") {
    return;
  }
  if (
    value.type === "object" &&
    value.additionalProperties !== false &&
    pointer !== "/$defs/FieldErrorsV1" &&
    !closedCompositionConstraint(value, pointer, root)
  ) {
    fail(`object schema is not closed: ${pointer}`);
  }
  for (const [key, child] of Object.entries(value)) {
    walkSchema(child, childPointer(pointer, key), root);
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

// Current portable acceptance; historical host-bound transcripts live in the retirement archive.
const backendRoot = path.join(repositoryRoot, 'backend');
const workRoot = path.join(backendRoot, '.tmp/query-wire/current');
const goCommand = process.env.GO_BOOTSTRAP || 'go';
const commandEnvironment = { ...process.env, GOTOOLCHAIN: 'go1.26.5+auto', GOWORK: 'off', REDOCLY_TELEMETRY: 'off', CI: 'true', NO_UPDATE_NOTIFIER: '1', npm_config_update_notifier: 'false' };
function run(command, args, cwd = repositoryRoot) {
  const result = spawnSync(command, args, { cwd, env: commandEnvironment, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) fail(command + ' ' + args.join(' ') + ' failed: ' + (result.error?.message || result.stderr || result.stdout));
  return result.stdout.trim();
}
function readGenerated(file) {
  const metadata = fs.lstatSync(file);
  assert(metadata.isFile() && !metadata.isSymbolicLink(), file + ': regular generated file');
  return Buffer.from(fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n'));
}
function fileEvidence(bytes) { return { bytes: bytes.byteLength, sha256: sha256(bytes) }; }
function assertWorkRoot() {
  const approved = path.join(backendRoot, '.tmp/query-wire');
  assert.equal(path.dirname(workRoot), approved);
  for (const candidate of [path.join(backendRoot, '.tmp'), approved, workRoot]) {
    if (fs.existsSync(candidate)) assert(!fs.lstatSync(candidate).isSymbolicLink(), candidate + ': symlink forbidden');
  }
}
assertWorkRoot();
fs.mkdirSync(workRoot, { recursive: true });
const backendGenerated = path.join(backendRoot, 'internal/httpapi/wire/query_wire.gen.go');
const frontendGenerated = path.join(repositoryRoot, 'frontend/src/api/generated/query-wire/types.gen.ts');
const redoclyCli = path.join(goldenRoot, 'node_modules/@redocly/cli/bin/cli.js');
const typescriptCli = path.join(goldenRoot, 'node_modules/openapi-typescript/bin/cli.js');
assert.equal(run(goCommand, ['env', 'GOVERSION'], backendRoot), 'go1.26.5');
assert.equal(run(goCommand, ['tool', 'oapi-codegen', '-version'], backendRoot).replaceAll('\r\n', '\n'), 'github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen\nv2.8.0');
const goRoot = run(goCommand, ['env', 'GOROOT'], backendRoot);
const gofmt = path.join(goRoot, 'bin', process.platform === 'win32' ? 'gofmt.exe' : 'gofmt');
assert.equal(run(process.execPath, [redoclyCli, '--version']), '2.40.0');
assert.equal(run(process.execPath, [typescriptCli, '--version']), 'v7.13.0');
const bundles = [], contexts = [], generatedGo = [], generatedTs = [];
const schemaInputSnapshot = authoritySchemaNames.map(name => [name, readGenerated(path.join(schemaRoot, name))]);
const openapiInputSnapshot = readGenerated(openapiPath);
try {
  for (const label of ['a', 'b']) {
    const projectionRoot = path.join(workRoot, label);
    run(process.execPath, [path.join(backendRoot, 'scripts/prepare-query-wire.mjs'), 'prepare', projectionRoot]);
    const source = path.join(projectionRoot, 'source/openapi/openapi.yaml');
    const bundlePath = path.join(projectionRoot, 'query.bundle.json');
    run(process.execPath, [redoclyCli, 'bundle', source, '--dereferenced', '--ext', 'json', '--component-names-strategy', 'basename', '--component-renaming-conflicts-severity', 'error', '--remove-unused-components=false', '--keep-url-references=false', '--output', bundlePath, '--config', path.join(projectionRoot, 'redocly.yaml')]);
    bundles.push(readGenerated(bundlePath));
    const context = createReferenceContext(source, path.join(projectionRoot, 'source/schemas/query'));
    auditReferenceContext(context, { expectRootResourceKeys: false });
    assert.deepEqual(context.documents.get(source), queryOpenapiProjection.projection, 'projection preserves OpenAPI');
    for (const name of authoritySchemaNames) {
      const expected = readJson(path.join(schemaRoot, name));
      delete expected.$id; delete expected.$schema;
      assert.deepEqual(readJson(path.join(projectionRoot, 'source/schemas/query', name)), expected, name + ': exactly two root metadata keys removed');
    }
    contexts.push(context);
    const goFile = path.join(projectionRoot, 'query_wire.gen.go');
    run(goCommand, ['tool', 'oapi-codegen', '-config', path.join(projectionRoot, 'oapi-codegen.yaml'), '-o', goFile, bundlePath], backendRoot);
    run(gofmt, ['-w', goFile]);
    generatedGo.push(readGenerated(goFile));
    const tsFile = path.join(projectionRoot, 'query.d.ts');
    run(process.execPath, [typescriptCli, source, '--output', tsFile], goldenRoot);
    generatedTs.push(readGenerated(tsFile));
  }
  assert.deepEqual(bundles[0], bundles[1], 'bundle deterministic replay');
  assert.deepEqual(generatedGo[0], generatedGo[1], 'Go deterministic replay');
  assert.deepEqual(generatedTs[0], generatedTs[1], 'TypeScript deterministic replay');
  const bundle = JSON.parse(bundles[0]);
  const expanded = publicSchemaExpansions(contexts[0]);
  const zeroKeywords = Object.fromEntries([...forbiddenBundleKeywords].sort().map(key => [key, 0]));
  assert.deepEqual(forbiddenKeywordCounts(bundle), zeroKeywords);
  for (const name of requiredComponents) assert.deepEqual(bundle.components.schemas[name], expanded[name], name + ': independent bundle equivalence');
  const expandedDocument = expandReferenceValue(contexts[0], openapi, contexts[0].openapiFile);
  assert.deepEqual(bundle.components.responses, expandedDocument.components.responses, 'all reusable response semantics');
  const goldenEquivalence = crossValidateGoldens({
    authority: authorityPublicValidatorMap(),
    'projection-a': compileExpandedValidatorMap(publicSchemaExpansions(contexts[0]), 'projection-a'),
    'projection-b': compileExpandedValidatorMap(publicSchemaExpansions(contexts[1]), 'projection-b'),
    'bundle-a': compileExpandedValidatorMap(JSON.parse(bundles[0]).components.schemas, 'bundle-a'),
    'bundle-b': compileExpandedValidatorMap(JSON.parse(bundles[1]).components.schemas, 'bundle-b')
  });
  const goDeclarations = extractGoDeclarations(generatedGo[0].toString('utf8'));
  const tsDeclarations = extractTypeScriptDeclarations(generatedTs[0].toString('utf8'));
  for (const name of requiredComponents) {
    assert(goDeclarations.includes(name), name + ': generated Go public declaration');
    assert(tsDeclarations.componentSchemas.includes(name), name + ': generated TypeScript public declaration');
  }
  for (const source of [...generatedGo, ...generatedTs]) assert(!/SharePayload|ShareWorkspace|share-payload/.test(source.toString('utf8')), 'retired generated declarations');
  assert.deepEqual(schemaInputSnapshot, authoritySchemaNames.map(name => [name, readGenerated(path.join(schemaRoot, name))]), 'schema inputs immutable');
  assert.deepEqual(openapiInputSnapshot, readGenerated(openapiPath), 'OpenAPI input immutable');
  assert.equal(originalGoldenObjects, JSON.stringify([...caseDocuments]), 'in-memory golden inputs immutable');
  assert.equal(originalContractInputs, JSON.stringify({ manifest, cases: manifest.caseFiles.map(entry => readJson(path.join(goldenRoot, entry.path))) }), 'contract inputs immutable');
  if (mode === '--refresh') {
    fs.writeFileSync(backendGenerated, generatedGo[0]);
    run(process.execPath, [path.join(repositoryRoot, 'frontend/scripts/generate-query-wire.mjs')], path.join(repositoryRoot, 'frontend'));
  }
  assert.deepEqual(readGenerated(backendGenerated), generatedGo[0], 'backend generated query consumer drift');
  run(process.execPath, [path.join(repositoryRoot, 'frontend/scripts/check-query-wire-generated.mjs')]);
  run(goCommand, ['test', './internal/httpapi/wire', '-run', '^TestSelected(PositiveQueryCasesDecodeThroughGeneratedModels|StructuralNegativeQueryCasesAreRejected)$'], backendRoot);
  const bundleNames = Object.keys(bundle.components.schemas).sort();
  const evidence = {
    runtime: { node: process.version, go: 'go1.26.5', redocly: '2.40.0', openapiTypescript: '7.13.0' },
    authority: queryAuthorityEvidence(queryOpenapiProjection, authorityAudit),
    bundle: { ...fileEvidence(bundles[0]), byteIdentical: true, forbiddenKeywordCounts: zeroKeywords, totalComponentSchemas: bundleNames.length, publicComponentSchemas: [...requiredComponents].sort(), helperComponentSchemas: bundleNames.filter(name => !requiredComponents.includes(name)) },
    goldenEquivalence,
    go: { ...fileEvidence(generatedGo[0]), byteIdentical: true, declarations: goDeclarations },
    typescript: { ...fileEvidence(generatedTs[0]), byteIdentical: true, declarations: tsDeclarations },
    frontend: fileEvidence(readGenerated(frontendGenerated))
  };
  if (mode === '--refresh') {
    manifest.acceptanceEvidence = evidence;
    fs.writeFileSync(path.join(goldenRoot, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  } else assert.deepEqual(manifest.acceptanceEvidence, evidence, 'current contract evidence drift');
  run(process.execPath, [path.join(backendRoot, 'scripts/prepare-query-wire.mjs'), 'verify-bundle', path.join(workRoot, 'a')]);
  console.log('verified ' + schemas.length + ' strict schemas, ' + allCaseIds.length + ' golden cases, ' + normalizationAssertions + ' pinned NFKC assertions, ' + requiredComponents.length + ' OpenAPI components; ' + goldenEquivalence.validatorExecutions + ' cross-validation executions; deterministic Go/TypeScript and production consumer checks passed');
} finally {
  assertWorkRoot();
  fs.rmSync(workRoot, { recursive: true, force: true });
}
