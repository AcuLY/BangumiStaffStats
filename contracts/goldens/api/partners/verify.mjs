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
