import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const goldenRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(goldenRoot, "../../../..");
const toolRoot = process.env.RANKINGS_TOOL_ROOT
  ? path.resolve(process.env.RANKINGS_TOOL_ROOT)
  : path.join(repositoryRoot, "frontend");
const { default: Ajv2020 } = await import(
  pathToFileURL(path.join(toolRoot, "node_modules/ajv/dist/2020.js"))
);
const { default: addFormats } = await import(
  pathToFileURL(path.join(toolRoot, "node_modules/ajv-formats/dist/index.js"))
);
const authorityPath = path.join(repositoryRoot, "contracts/openapi/openapi.yaml");
const schemaRoot = path.join(repositoryRoot, "contracts/schemas");
const caseFiles = ["cases/errors.json", "cases/global.json", "cases/personal.json"];
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
const rankingsInfoDescription =
  "Rankings request and result contracts for immutable Archive-backed queries.";

const requestSchema = readJson("schemas/rankings/request-v1.schema.json");
const successSchema = readJson("schemas/rankings/success-envelope-v1.schema.json");
const sharedQuerySchema = readJson("schemas/query/shared-query-v1.schema.json");
const operationSchema = readJson("schemas/query/operation-components-v1.schema.json");
const errorSchema = readJson("schemas/rankings/result-error-envelope-v1.schema.json");
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
const rankingsOperation = authority.paths["/rankings"]?.post;
assert.equal(rankingsOperation?.operationId, "postRankingsV1");
assert.deepEqual(Object.keys(rankingsOperation.responses).sort(), expectedResponses);
assert.equal(
  rankingsOperation.requestBody.content["application/json"].schema.$ref,
  "#/components/schemas/RankingsRequestV1",
);
assert.equal(
  rankingsOperation.responses["200"].content["application/json"].schema.$ref,
  "#/components/schemas/RankingsSuccessEnvelopeV1",
);
assert.equal(
  authority.components.schemas.RankingsRequestV1.$ref,
  "../schemas/rankings/request-v1.schema.json",
);
assert.equal(
  authority.components.schemas.RankingsSuccessEnvelopeV1.$ref,
  "../schemas/rankings/success-envelope-v1.schema.json",
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
const projectionEvidence = buildRankingsProjectionEvidence(authority);
const projectionSha256 = sha256(
  Buffer.from(canonical(projectionEvidence)),
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
  sha256(Buffer.from(canonical(buildRankingsProjectionEvidence(unrelatedAuthority)))),
  projectionSha256,
  "unrelated paths and shared info description must not change rankings projection",
);

const cases = new Map();
for (const relative of caseFiles) {
  const document = readJson(path.join("goldens/api/rankings", relative));
  assert.equal(document.schemaVersion, 1);
  assert(Array.isArray(document.cases) && document.cases.length > 0);
  for (const item of document.cases) {
    assert.equal(typeof item.id, "string");
    assert(!cases.has(item.id), `duplicate case ID ${item.id}`);
    cases.set(item.id, item);
    if (document.kind.endsWith("success-cases")) {
      assertValid(validateRequest, item.request, `${item.id}: request`);
      assert.equal(item.expected.status, 200);
      assert.equal(item.expected.headers["Cache-Control"], "private, no-store");
      assertValid(validateSuccess, item.expected.body, `${item.id}: success`);
      assertScopeOmissions(item);
    } else {
      assert(item.expected.status >= 400 && item.expected.status <= 599);
      assert.equal(item.expected.headers["Cache-Control"], "private, no-store");
      assertValid(validateError, item.expected.body, `${item.id}: error`);
      if (item.request.body && item.id !== "unknown-top-level-field-rejected") {
        assertValid(validateRequest, item.request.body, `${item.id}: request`);
      }
      if (item.id === "unknown-top-level-field-rejected") {
        assert(
          !validateRequest(item.request.body),
          `${item.id}: unknown field accepted`,
        );
      }
    }
  }
}

for (const required of [
  "personal-preference-rank-before-search",
  "personal-cast-series-stale",
  "global-average-missing-last",
  "global-out-of-range-empty-page",
  "global-preference-rejected",
  "global-refresh-rejected",
  "unknown-top-level-field-rejected",
  "wrong-method-rejected",
  "second-document-rejected",
  "store-not-ready",
  "upstream-protocol-rejected",
  "deadline-before-commit",
]) {
  assert(cases.has(required), `missing required case ${required}`);
}

const preference = cases.get("personal-preference-rank-before-search");
assert.deepEqual(
  preference.expected.data,
  undefined,
  "success body must remain enveloped",
);
assert.deepEqual(
  preference.expected.body.data.items.map((item) => item.rank),
  preference.assertions.completeRanks,
);
assert.equal(
  preference.expected.body.data.summary.personCount,
  preference.assertions.preSearchPersonCount,
);
assert.deepEqual(
  preference.expected.body.data.metricScale.max,
  preference.assertions.preSearchScaleAbsoluteMaximum,
);
assert.equal(preference.expected.body.data.metricScale.max.numerator.startsWith("-"), false);

const invalidNegativeEvidenceWeight = structuredClone(
  preference.expected.body,
);
invalidNegativeEvidenceWeight.data.items[0].preference.evidenceWeight.numerator =
  "-1";
assertInvalid(
  validateSuccess,
  invalidNegativeEvidenceWeight,
  "negative preference evidenceWeight",
);

const invalidGlobalPreferenceScale = structuredClone(
  cases.get("global-average-missing-last").expected.body,
);
invalidGlobalPreferenceScale.data.metricScale = {
  metric: "preference",
  kind: "linear",
  max: { numerator: "1", denominator: "2" },
};
assertInvalid(
  validateSuccess,
  invalidGlobalPreferenceScale,
  "global preference metric scale",
);

const invalidOverlongPage = structuredClone(
  cases.get("global-average-missing-last").expected.body,
);
invalidOverlongPage.data.items = Array.from(
  { length: 21 },
  () => structuredClone(invalidOverlongPage.data.items[0]),
);
assertInvalid(validateSuccess, invalidOverlongPage, "overlong rankings page");

const stale = cases.get("personal-cast-series-stale").expected.body.meta.collection;
assert.equal(stale.stale, true);
assert.deepEqual(stale.warningCodes, ["COLLECTION_STALE"]);
const fresh = preference.expected.body.meta.collection;
assert.equal(fresh.stale, false);
assert.deepEqual(fresh.warningCodes, []);

const result = {
  schemaVersion: 1,
  cases: cases.size,
  projectionSha256,
  inventorySha256: sha256(
    Buffer.from(
      [...caseFiles, "package-lock.json", "package.json", "verify.mjs"]
        .sort()
        .join("\n") + "\n",
    ),
  ),
};
console.log(JSON.stringify(result));

function buildRankingsProjectionEvidence(openapi) {
  const projection = buildRankingsProjection(openapi);
  return {
    projection,
    externalSchemas: collectExternalSchemas(projection),
  };
}

function buildRankingsProjection(openapi) {
  const selected = collectLocalComponents(openapi, openapi.paths["/rankings"]);
  return {
    openapi: openapi.openapi,
    jsonSchemaDialect: openapi.jsonSchemaDialect,
    info: {
      ...openapi.info,
      description: rankingsInfoDescription,
    },
    servers: openapi.servers,
    paths: {
      "/rankings": openapi.paths["/rankings"],
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
      `external rankings schema outside authority root: ${filename}`,
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
  return Object.fromEntries([...documents.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  ));
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

function assertScopeOmissions(item) {
  const scope = item.request.query.scope;
  const { body } = item.expected;
  if (scope === "global") {
    assert(!Object.hasOwn(body.meta, "collection"), `${item.id}: collection`);
    for (const row of body.data.items) {
      assert(!Object.hasOwn(row, "preference"), `${item.id}: preference`);
    }
    return;
  }
  assert(Object.hasOwn(body.meta, "collection"), `${item.id}: collection`);
  for (const row of body.data.items) {
    assert(Object.hasOwn(row, "preference"), `${item.id}: preference`);
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
    readRegular(path.join(repositoryRoot, "contracts", relative)).toString("utf8"),
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
