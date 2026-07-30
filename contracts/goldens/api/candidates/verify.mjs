import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const goldenRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(goldenRoot, "../../../..");

const authorityPath = path.join(repositoryRoot, "contracts/openapi/openapi.yaml");
const schemaRoot = path.join(repositoryRoot, "contracts/schemas");
const caseFiles = ["cases/errors.json", "cases/global.json", "cases/personal.json"];
const schemaFiles = [
  "schemas/candidates/request-v1.schema.json",
  "schemas/candidates/success-envelope-v1.schema.json",
];
const expectedResponses = [
  "200",
  "400",
  "403",
  "404",
  "405",
  "413",
  "415",
  "429",
  "500",
  "502",
  "503",
  "504",
];
const candidatesInfoDescription =
  "Candidate request and result contracts for independent per-position Archive-backed queries.";
const requestSchema = readJson(schemaFiles[0]);
const successSchema = readJson(schemaFiles[1]);
const sharedQuerySchema = readJson("schemas/query/shared-query-v1.schema.json");
const operationSchema = readJson(
  "schemas/query/operation-components-v1.schema.json",
);
const errorSchema = readJson(
  "schemas/rankings/result-error-envelope-v1.schema.json",
);
const authority = JSON.parse(readRegular(authorityPath).toString("utf8"));

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  validateFormats: true,
});
addFormats(ajv);
for (const schema of [
  sharedQuerySchema,
  operationSchema,
  requestSchema,
  successSchema,
  errorSchema,
]) {
  ajv.addSchema(schema);
}
const validateRequest = ajv.getSchema(requestSchema.$id);
const validateSuccess = ajv.getSchema(successSchema.$id);
const validateError = ajv.getSchema(errorSchema.$id);
assert(validateRequest && validateSuccess && validateError);

assert.equal(authority.openapi, "3.1.0");
const candidatesOperation = authority.paths["/candidates"]?.post;
assert.equal(candidatesOperation?.operationId, "postCandidatesV1");
assert.deepEqual(Object.keys(candidatesOperation.responses).sort(), expectedResponses);
assert.equal(
  candidatesOperation.requestBody.content["application/json"].schema.$ref,
  "#/components/schemas/CandidatesRequestV1",
);
assert.equal(
  candidatesOperation.responses["200"].content["application/json"].schema.$ref,
  "#/components/schemas/CandidatesSuccessEnvelopeV1",
);
assert.equal(
  authority.components.schemas.CandidatesRequestV1.$ref,
  "../schemas/candidates/request-v1.schema.json",
);
assert.equal(
  authority.components.schemas.CandidatesSuccessEnvelopeV1.$ref,
  "../schemas/candidates/success-envelope-v1.schema.json",
);
assert.deepEqual(
  authority.components.responses.ResultBadGatewayErrorV1["x-error-codes"],
  ["UPSTREAM_PROTOCOL_ERROR"],
);
assert(
  !authority.components.responses.ResultServiceUnavailableErrorV1[
    "x-error-codes"
  ].includes("UPSTREAM_PROTOCOL_ERROR"),
);
assert.equal(
  authority.components.responses.ResultMethodNotAllowedErrorV1.headers.Allow.schema
    .const,
  "POST",
);
const projectionEvidence = buildCandidatesProjectionEvidence(authority);
const projectionSha256 = sha256(Buffer.from(canonical(projectionEvidence)));
assert.deepEqual(Object.keys(projectionEvidence.externalSchemas), [
  "contracts/schemas/candidates/request-v1.schema.json",
  "contracts/schemas/candidates/success-envelope-v1.schema.json",
  "contracts/schemas/query/operation-components-v1.schema.json",
  "contracts/schemas/query/shared-query-v1.schema.json",
  "contracts/schemas/rankings/result-error-envelope-v1.schema.json",
]);
const transitiveDependencyChange = structuredClone(projectionEvidence);
transitiveDependencyChange.externalSchemas[
  "contracts/schemas/query/operation-components-v1.schema.json"
]["x-projection-test"] = true;
assert.notEqual(
  sha256(Buffer.from(canonical(transitiveDependencyChange))),
  projectionSha256,
  "transitive schema changes must change candidates projection",
);
const unrelatedAuthority = structuredClone(authority);
unrelatedAuthority.info.description = "Unrelated authority description change.";
unrelatedAuthority.paths["/unrelated"] = {
  get: {
    operationId: "unrelatedOperation",
    responses: {
      204: { description: "Unrelated response." },
    },
  },
};
assert.equal(
  sha256(Buffer.from(canonical(buildCandidatesProjectionEvidence(unrelatedAuthority)))),
  projectionSha256,
  "unrelated paths and shared info description must not change candidates projection",
);

const cases = new Map();
for (const relative of caseFiles) {
  const document = readJson(path.join("goldens/api/candidates", relative));
  assert.equal(document.schemaVersion, 1);
  assert(Array.isArray(document.cases) && document.cases.length > 0);
  for (const item of document.cases) {
    assert.equal(typeof item.id, "string");
    assert(!cases.has(item.id), `duplicate case ID ${item.id}`);
    cases.set(item.id, item);
    if (document.kind.endsWith("success-cases")) {
      assertValid(validateRequest, item.request, `${item.id}: request`);
      assert.equal(item.expected.status, 200);
      assertCommonHeaders(item);
      assertValid(validateSuccess, item.expected.body, `${item.id}: success`);
      assertSuccessSemantics(item);
    } else {
      const valid = validateRequest(item.request.body);
      assert.equal(
        valid,
        item.requestSchemaValid,
        `${item.id}: request-schema expectation`,
      );
      assert(item.expected.status >= 400 && item.expected.status <= 599);
      assertCommonHeaders(item);
      assertValid(validateError, item.expected.body, `${item.id}: error`);
    }
  }
}

for (const required of [
  "global-independent-position-counts",
  "global-rank-gap-search",
  "global-average-missing-last",
  "global-empty-current-position",
  "global-out-of-range-empty-page",
  "personal-average-defaults",
  "personal-global-average-sort",
  "personal-series-stale-refresh",
  "missing-current-position",
  "unknown-current-position",
  "global-global-average-rejected",
  "global-refresh-rejected",
  "selected-state-rejected",
  "wrong-method-rejected",
  "store-not-ready",
  "deadline-before-commit",
]) {
  assert(cases.has(required), `missing required case ${required}`);
}

const independent = cases.get("global-independent-position-counts");
assert.deepEqual(
  independent.expected.body.data.summary.positionCounts.map(
    ({ positionKey }) => positionKey,
  ),
  independent.assertions.orderedPositionKeys,
);
assert(
  independent.expected.body.data.items.some(
    ({ person }) => person.id === independent.assertions.personOnlyInSecondPosition,
  ),
);

const rankGap = cases.get("global-rank-gap-search");
assert.deepEqual(
  rankGap.expected.body.data.items.map(({ rank }) => rank),
  rankGap.assertions.completeRanks,
);
assert.equal(
  rankGap.expected.body.data.summary.positionCounts[0].count,
  rankGap.assertions.completePositionCount,
);
assert.equal(
  rankGap.expected.body.meta.pagination.total,
  rankGap.assertions.completeRanks.length,
);

const missing = cases.get("global-average-missing-last");
const missingRow = missing.expected.body.data.items.at(-1);
assert.equal(missingRow.person.id, missing.assertions.missingMetricPersonId);
assert.equal(missingRow.rank, missing.assertions.missingMetricRank);

const stale = cases.get("personal-series-stale-refresh");
assert.equal(stale.request.refreshCollection, true);
assert.equal(stale.expected.body.data.workUnit, "series");
assert.equal(stale.expected.body.data.items[0].workCount, 1);
assert.equal(stale.expected.body.meta.collection.stale, true);
assert.deepEqual(stale.expected.body.meta.collection.warningCodes, [
  "COLLECTION_STALE",
]);

const invalidOverlongPage = structuredClone(
  cases.get("global-independent-position-counts").expected.body,
);
invalidOverlongPage.data.items = Array.from(
  { length: 21 },
  () => structuredClone(invalidOverlongPage.data.items[0]),
);
assertInvalid(validateSuccess, invalidOverlongPage, "overlong candidates page");

const inventory = [
  ...caseFiles,
  ...schemaFiles.map((value) => path.relative("schemas/candidates", value)),
  "package-lock.json",
  "package.json",
  "verify.mjs",
].sort();
const result = {
  schemaVersion: 1,
  cases: cases.size,
  projectionSha256,
  schemaSha256: sha256(
    Buffer.concat(
      schemaFiles.map((relative) =>
        readRegular(path.join(repositoryRoot, "contracts", relative)),
      ),
    ),
  ),
  inventorySha256: sha256(Buffer.from(`${inventory.join("\n")}\n`)),
};
console.log(JSON.stringify(result));

function buildCandidatesProjectionEvidence(openapi) {
  const projection = buildCandidatesProjection(openapi);
  return {
    projection,
    externalSchemas: collectExternalSchemas(projection),
  };
}

function buildCandidatesProjection(openapi) {
  const selected = collectLocalComponents(openapi, openapi.paths["/candidates"]);
  return {
    openapi: openapi.openapi,
    jsonSchemaDialect: openapi.jsonSchemaDialect,
    info: {
      ...openapi.info,
      description: candidatesInfoDescription,
    },
    servers: openapi.servers,
    paths: {
      "/candidates": openapi.paths["/candidates"],
    },
    components: {
      schemas: pick(openapi.components.schemas, selected.schemas),
      headers: pick(openapi.components.headers, selected.headers),
      responses: pick(openapi.components.responses, selected.responses),
    },
  };
}

function collectLocalComponents(openapi, root) {
  const pending = [];
  const selected = {
    schemas: new Set(),
    headers: new Set(),
    responses: new Set(),
  };
  walkReferences(root, (reference) => pending.push(reference));
  while (pending.length > 0) {
    const reference = pending.pop();
    const match = reference.match(
      /^#\/components\/(schemas|headers|responses)\/([^/]+)$/,
    );
    if (!match) continue;
    const [, category, name] = match;
    if (selected[category].has(name)) continue;
    const component = openapi.components?.[category]?.[name];
    assert(component, `missing ${category} component ${name}`);
    selected[category].add(name);
    walkReferences(component, (nested) => pending.push(nested));
  }
  return Object.fromEntries(
    Object.entries(selected).map(([category, names]) => [
      category,
      [...names].sort(),
    ]),
  );
}

function collectExternalSchemas(projection) {
  const pending = [];
  const documents = new Map();
  walkReferences(projection, (reference) => {
    if (!reference.startsWith("#")) {
      pending.push({ source: authorityPath, reference });
    }
  });
  while (pending.length > 0) {
    const { source, reference } = pending.pop();
    const [externalPath] = reference.split("#", 1);
    if (!externalPath) continue;
    const filename = path.resolve(path.dirname(source), externalPath);
    const relativeToSchemas = path.relative(schemaRoot, filename);
    assert(
      relativeToSchemas !== "" &&
        !relativeToSchemas.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relativeToSchemas),
      `external candidates schema outside authority root: ${filename}`,
    );
    const key = path.relative(repositoryRoot, filename).split(path.sep).join("/");
    if (documents.has(key)) continue;
    const document = JSON.parse(readRegular(filename).toString("utf8"));
    documents.set(key, document);
    walkReferences(document, (nested) => {
      if (!nested.startsWith("#")) {
        pending.push({ source: filename, reference: nested });
      }
    });
  }
  return Object.fromEntries(
    [...documents.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
}

function walkReferences(value, visitor) {
  if (Array.isArray(value)) {
    value.forEach((child) => walkReferences(child, visitor));
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (typeof value.$ref === "string") visitor(value.$ref);
  Object.values(value).forEach((child) => walkReferences(child, visitor));
}

function pick(values, names) {
  return Object.fromEntries(names.map((name) => [name, values[name]]));
}

function canonical(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function assertCommonHeaders(item) {
  assert.equal(item.expected.headers["Cache-Control"], "private, no-store");
  assert.equal(item.expected.headers["Content-Type"], "application/json");
  assert.equal(typeof item.expected.headers["X-Request-ID"], "string");
}

function assertSuccessSemantics(item) {
  const { query, input } = item.request;
  const { data, meta } = item.expected.body;
  assert.equal(data.positionKey, input.positionKey);
  assert(query.positionKeys.includes(input.positionKey));
  assert.deepEqual(
    data.summary.positionCounts.map(({ positionKey }) => positionKey),
    query.positionKeys,
  );
  assert.equal(
    new Set(data.summary.positionCounts.map(({ positionKey }) => positionKey))
      .size,
    query.positionKeys.length,
  );
  assert.equal(data.workUnit, query.mergeSeries === true ? "series" : "subject");
  assertNoFrontendState(data);
  if (query.scope === "global") {
    assert(!Object.hasOwn(meta, "collection"), `${item.id}: collection`);
  } else {
    assert(Object.hasOwn(meta, "collection"), `${item.id}: collection`);
  }
}

function assertNoFrontendState(value) {
  const forbidden = new Set([
    "selected",
    "selectedPersonIds",
    "alternateIdentities",
    "image",
    "imageUrl",
    "images",
    "works",
    "workList",
  ]);
  walk(value, (key) => {
    assert(!forbidden.has(key), `forbidden response field ${key}`);
  });
}

function walk(value, visitor) {
  if (Array.isArray(value)) {
    value.forEach((child) => walk(child, visitor));
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    visitor(key);
    walk(child, visitor);
  }
}

function assertValid(validate, value, label) {
  if (!validate(value)) {
    throw new Error(`${label}: ${ajv.errorsText(validate.errors)}`);
  }
}

function assertInvalid(validate, value, label) {
  assert.equal(validate(value), false, `${label}: invalid value was accepted`);
}

function readJson(relative) {
  return JSON.parse(
    readRegular(path.join(repositoryRoot, "contracts", relative)).toString(
      "utf8",
    ),
  );
}

function readRegular(filename) {
  const metadata = fs.lstatSync(filename);
  assert(metadata.isFile() && !metadata.isSymbolicLink(), `${filename}: regular`);
  return fs.readFileSync(filename);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
