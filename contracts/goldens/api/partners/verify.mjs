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

const readJson = (relative) =>
  JSON.parse(fs.readFileSync(path.join(repositoryRoot, relative), "utf8"));

const sharedQuery = readJson("contracts/schemas/query/shared-query-v1.schema.json");
const operationComponents = readJson(
  "contracts/schemas/query/operation-components-v1.schema.json",
);
const sharedError = readJson(
  "contracts/schemas/rankings/result-error-envelope-v1.schema.json",
);
const rankingSuccessSchema = readJson(
  "contracts/schemas/rankings/success-envelope-v1.schema.json",
);
const requestSchema = readJson(
  "contracts/schemas/partners/request-v1.schema.json",
);
const successSchema = readJson(
  "contracts/schemas/partners/success-envelope-v1.schema.json",
);
const errorSchema = readJson(
  "contracts/schemas/partners/result-error-envelope-v1.schema.json",
);
const authority = JSON.parse(fs.readFileSync(authorityPath, "utf8"));
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
const partnersInfo = {
  title: "BangumiStaffStats Partners API",
  version: "1.0.0",
  description:
    "Partner request and result contracts for real raw-Subject Archive cooperation.",
};

assert.equal(authority.openapi, "3.1.0");
const partnersOperation = authority.paths["/partners"]?.post;
assert.equal(partnersOperation?.operationId, "postPartnersV1");
assert.deepEqual(Object.keys(partnersOperation.responses).sort(), expectedResponses);
assert.equal(
  partnersOperation.requestBody.content["application/json"].schema.$ref,
  "#/components/schemas/PartnersRequestV1",
);
assert.equal(
  partnersOperation.responses["200"].content["application/json"].schema.$ref,
  "#/components/schemas/PartnersSuccessEnvelopeV1",
);
assert.equal(
  authority.components.schemas.PartnersRequestV1.$ref,
  "../schemas/partners/request-v1.schema.json",
);
assert.equal(
  authority.components.schemas.PartnersSuccessEnvelopeV1.$ref,
  "../schemas/partners/success-envelope-v1.schema.json",
);
assert.equal(
  authority.components.schemas.PartnersResultErrorEnvelopeV1.$ref,
  "../schemas/partners/result-error-envelope-v1.schema.json",
);
assert.equal(
  authority.components.responses.PartnersMethodNotAllowedErrorV1.headers.Allow
    .schema.const,
  "POST",
);
assert.equal(
  authority.components.responses.PartnersRateLimitedErrorV1.headers[
    "Retry-After"
  ].schema.maximum,
  60,
);

const projectionEvidence = buildPartnersProjectionEvidence(authority);
const projectionSha256 = sha256(Buffer.from(canonical(projectionEvidence)));
assert.deepEqual(Object.keys(projectionEvidence.externalSchemas), [
  "contracts/schemas/partners/request-v1.schema.json",
  "contracts/schemas/partners/result-error-envelope-v1.schema.json",
  "contracts/schemas/partners/success-envelope-v1.schema.json",
  "contracts/schemas/query/operation-components-v1.schema.json",
  "contracts/schemas/query/shared-query-v1.schema.json",
  "contracts/schemas/rankings/result-error-envelope-v1.schema.json",
  "contracts/schemas/rankings/success-envelope-v1.schema.json",
]);
const transitiveDependencyChange = structuredClone(projectionEvidence);
transitiveDependencyChange.externalSchemas[
  "contracts/schemas/query/operation-components-v1.schema.json"
]["x-projection-test"] = true;
assert.notEqual(
  sha256(Buffer.from(canonical(transitiveDependencyChange))),
  projectionSha256,
  "transitive schema changes must change partners projection",
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
  sha256(Buffer.from(canonical(buildPartnersProjectionEvidence(unrelatedAuthority)))),
  projectionSha256,
  "unrelated paths and shared info must not change partners projection",
);

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  validateFormats: true,
});
addFormats(ajv);
for (const schema of [
  sharedQuery,
  operationComponents,
  sharedError,
  rankingSuccessSchema,
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

const files = [
  "cases/global.json",
  "cases/personal.json",
  "cases/many-identities.json",
  "cases/errors.json",
];
let checked = 0;
for (const filename of files) {
  const corpus = readJson(`contracts/goldens/api/partners/${filename}`);
  assert.equal(corpus.schemaVersion, 1);
  assert(Array.isArray(corpus.cases) && corpus.cases.length > 0);
  for (const testCase of corpus.cases) {
    const requestValid = validateRequest(testCase.request);
    assert.equal(
      requestValid,
      testCase.requestSchemaValid ?? true,
      `${testCase.id} request: ${ajv.errorsText(validateRequest.errors)}`,
    );
    const body = testCase.expected.body;
    if (testCase.expected.status === 200) {
      assert(
        validateSuccess(body),
        `${testCase.id} success: ${ajv.errorsText(validateSuccess.errors)}`,
      );
      const metrics = body.data.summary.leaders.map((leader) => leader.metric);
      verifyMetricScale(testCase);
      if (testCase.request.query.scope === "global") {
        assert.deepEqual(metrics, ["count", "average", "overall"]);
        assert.equal(JSON.stringify(body).includes('"preference"'), false);
        assert.equal(Object.hasOwn(body.meta, "collection"), false);
      } else {
        assert.deepEqual(metrics, [
          "count",
          "average",
          "overall",
          "preference",
        ]);
        assert(Object.hasOwn(body.meta, "collection"));
      }
      assert.equal(Object.hasOwn(body.data, "works"), false);
      assert.equal(Object.hasOwn(body.data, "commonWorks"), false);
    } else {
      assert(
        validateError(body),
        `${testCase.id} error: ${ajv.errorsText(validateError.errors)}`,
      );
    }
    checked += 1;
  }
}

const zeroEvidence = readJson(
  "contracts/goldens/api/partners/cases/personal.json",
).cases.find((value) => value.id === "personal-zero-preference-evidence");
const zeroPreference = zeroEvidence.expected.body.data.items[0].preference;
assert.equal(zeroPreference.mean, null);
assert.equal(zeroPreference.score, null);
assert.deepEqual(zeroPreference.evidenceWeight, {
  numerator: "0",
  denominator: "1",
});
assert.equal(
  zeroEvidence.expected.body.data.summary.leaders[3].item,
  null,
);

const personalCases = readJson("contracts/goldens/api/partners/cases/personal.json").cases;
const negativeMaximum = personalCases.find(value => value.id === "personal-preference-off-page-negative-maximum");
assert.deepEqual(negativeMaximum.expected.body.data.metricScale.max, {numerator: "4", denominator: "5"});
assert.equal(negativeMaximum.expected.body.data.items.some(item => item.person.id === 9), false);
assert.deepEqual(personalCases.find(value => value.id === "personal-preference-valid-zero-scale").expected.body.data.metricScale.max, {numerator: "0", denominator: "1"});
assert.equal(zeroEvidence.expected.body.data.metricScale.max, null);

const globalExample = readJson("contracts/goldens/api/partners/cases/global.json").cases[0].expected.body;
for (const mutate of [
  body => { delete body.data.metricScale; },
  body => { body.data.metricScale = {metric: "preference", kind: "linear", max: {numerator: "1", denominator: "5"}}; },
  body => { body.data.metricScale = {metric: "count", kind: "linear", max: "1"}; },
  body => { body.data.metricScale = {metric: "count", kind: "linear", max: -1}; },
]) {
  const invalid = structuredClone(globalExample);
  mutate(invalid);
  assert.equal(validateSuccess(invalid), false, "invalid global metric scale must be rejected");
}
const wrongMetric = structuredClone(negativeMaximum);
wrongMetric.expected.body.data.metricScale = {metric: "count", kind: "linear", max: 2};
assert.throws(() => verifyMetricScale(wrongMetric), /metric/);
for (const maximum of [{numerator: "-4", denominator: "5"}, {numerator: "4", denominator: "0"}]) {
  const invalid = structuredClone(negativeMaximum.expected.body);
  invalid.data.metricScale.max = maximum;
  assert.equal(validateSuccess(invalid), false, "invalid absolute rational maximum must be rejected");
}

console.log(
  JSON.stringify({
    schemaVersion: 1,
    cases: checked,
    projectionSha256,
  }),
);

function buildPartnersProjectionEvidence(openapi) {
  const projection = buildPartnersProjection(openapi);
  return {
    projection,
    externalSchemas: collectExternalSchemas(projection),
  };
}

function buildPartnersProjection(openapi) {
  const selected = collectLocalComponents(openapi, openapi.paths["/partners"]);
  return {
    openapi: openapi.openapi,
    jsonSchemaDialect: openapi.jsonSchemaDialect,
    info: partnersInfo,
    paths: {
      "/partners": openapi.paths["/partners"],
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
  walk(root, (reference) => pending.push(reference));
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
    walk(component, (nested) => pending.push(nested));
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
  walk(projection, (reference) => {
    if (!reference.startsWith("#")) {
      pending.push({ source: authorityPath, reference });
    }
  });
  while (pending.length > 0) {
    const { source, reference } = pending.pop();
    const [externalPath] = reference.split("#", 1);
    if (!externalPath) continue;
    const filename = path.resolve(path.dirname(source), externalPath);
    const relative = path.relative(schemaRoot, filename);
    assert(
      relative !== "" &&
        !relative.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relative),
      `external partners schema outside authority root: ${filename}`,
    );
    const key = path.relative(repositoryRoot, filename).split(path.sep).join("/");
    if (documents.has(key)) continue;
    const document = JSON.parse(fs.readFileSync(filename, "utf8"));
    documents.set(key, document);
    walk(document, (nested) => {
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

function walk(value, visitor) {
  if (Array.isArray(value)) {
    value.forEach((child) => walk(child, visitor));
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (typeof value.$ref === "string") visitor(value.$ref);
  Object.values(value).forEach((child) => walk(child, visitor));
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

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function verifyMetricScale(testCase) {
  const scope = testCase.request.query.scope;
  const metric = testCase.request.view?.sort ?? "count";
  const actual = testCase.expected.body.data.metricScale;
  assert.equal(actual.metric, metric, `${testCase.id} requested metric`);
  const rows = testCase.assertions?.metricScalePopulation;
  assert(Array.isArray(rows), `${testCase.id} complete metric population is required`);
  assert.equal(rows.length, testCase.expected.body.data.summary.partnerCount);
  const validateRow = ajv.getSchema(`${successSchema.$id}#/$defs/${scope === "global" ? "GlobalPartnerCoreV1" : "PersonalPartnerCoreV1"}`);
  assert(validateRow);
  let maximum = null;
  const identities = new Set();
  for (const row of rows) {
    assert(validateRow(row), `${testCase.id} metric population: ${ajv.errorsText(validateRow.errors)}`);
    assert(!identities.has(row.person.id), "metric population contains duplicate people");
    identities.add(row.person.id);
    let value = metric === "count" ? row.metrics.workCount : metric === "preference" ? row.preference?.score ?? null : row.metrics[metric];
    if (value === null) continue;
    if (metric === "preference") {
      const numerator = BigInt(value.numerator);
      value = {numerator: String(numerator < 0n ? -numerator : numerator), denominator: value.denominator};
    }
    const greater = maximum === null || (typeof value === "number"
      ? value > maximum
      : BigInt(value.numerator) * BigInt(maximum.denominator) > BigInt(maximum.numerator) * BigInt(value.denominator));
    if (greater) maximum = value;
  }
  assert.deepEqual(actual, {metric, kind: "linear", max: maximum}, `${testCase.id} complete metric scale`);
}

// Independent operation scope is explicit, closed, and optional.
const positionScopeRequest = {"query": {"scope": "global", "subjectType": "anime", "positionKeys": ["staff:anime:2"]}, "input": {"source": {"personId": 1, "positionKeys": ["staff:anime:2"]}}};
for (const scope of [undefined, 'query', 'all']) {
  const request = structuredClone(positionScopeRequest);
  if (scope !== undefined) request.input.positionScope = scope;
  assert(validateRequest(request), `positionScope ${scope}: ${ajv.errorsText(validateRequest.errors)}`);
}
for (const scope of [null, '', 'unknown', true, []]) {
  const request = structuredClone(positionScopeRequest);
  request.input.positionScope = scope;
  assert.equal(validateRequest(request), false, `invalid positionScope ${JSON.stringify(scope)}`);
}

// Empty positions are an explicit operation scope, never an ordinary SharedQuery.
for (const scope of [undefined, "query", "all"]) {
  for (const queryScope of ["global", "personal"]) {
    const request = structuredClone(positionScopeRequest);
    request.query.positionKeys = [];
    request.query.scope = queryScope;
    if (queryScope === "personal") { request.query.uid = "lucay126"; request.query.collectionStatuses = ["completed"]; }
    if (scope !== undefined) request.input.positionScope = scope;
    assert.equal(validateRequest(request), scope === "all", `empty ${queryScope} query with ${scope}: ${ajv.errorsText(validateRequest.errors)}`);
  }
}
