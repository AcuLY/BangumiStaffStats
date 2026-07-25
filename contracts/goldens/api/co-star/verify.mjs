import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const goldenRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(goldenRoot, "../../../..");
const authorityPath = path.join(repositoryRoot, "contracts/openapi/openapi.yaml");
const toolRoot = process.env.CO_STAR_TOOL_ROOT
  ? path.resolve(process.env.CO_STAR_TOOL_ROOT)
  : path.join(repositoryRoot, "frontend");
const { default: Ajv2020 } = await import(
  pathToFileURL(path.join(toolRoot, "node_modules/ajv/dist/2020.js"))
);
const { default: addFormats } = await import(
  pathToFileURL(path.join(toolRoot, "node_modules/ajv-formats/dist/index.js"))
);

const readJson = (relative) =>
  JSON.parse(fs.readFileSync(path.join(repositoryRoot, relative), "utf8"));

const sharedQuery = readJson("contracts/schemas/query/shared-query-v1.schema.json");
const operationComponents = readJson(
  "contracts/schemas/query/operation-components-v1.schema.json",
);
const personDetailSuccess = readJson(
  "contracts/schemas/person-detail/success-envelope-v1.schema.json",
);
const sharedError = readJson(
  "contracts/schemas/rankings/result-error-envelope-v1.schema.json",
);
const requestSchema = readJson(
  "contracts/schemas/co-star/request-v1.schema.json",
);
const successSchema = readJson(
  "contracts/schemas/co-star/success-envelope-v1.schema.json",
);
const errorSchema = readJson(
  "contracts/schemas/co-star/result-error-envelope-v1.schema.json",
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
const coStarInfo = {
  title: "BangumiStaffStats Co-Star API",
  version: "1.0.0",
  description:
    "Pair/group co-star contracts over real raw-Subject Archive intersections.",
};

assert.equal(authority.openapi, "3.1.0");
const operation = authority.paths["/co-star"]?.post;
assert.equal(operation?.operationId, "postCoStarV1");
assert.deepEqual(Object.keys(operation.responses).sort(), expectedResponses);
assert.equal(
  operation.requestBody.content["application/json"].schema.$ref,
  "#/components/schemas/CoStarRequestV1",
);
assert.equal(
  operation.responses["200"].content["application/json"].schema.$ref,
  "#/components/schemas/CoStarSuccessEnvelopeV1",
);
assert.equal(
  authority.components.schemas.CoStarRequestV1.$ref,
  "../schemas/co-star/request-v1.schema.json",
);
assert.equal(
  authority.components.schemas.CoStarSuccessEnvelopeV1.$ref,
  "../schemas/co-star/success-envelope-v1.schema.json",
);
assert.equal(
  authority.components.schemas.CoStarResultErrorEnvelopeV1.$ref,
  "../schemas/co-star/result-error-envelope-v1.schema.json",
);
assert.equal(
  authority.components.responses.CoStarMethodNotAllowedErrorV1.headers.Allow
    .schema.const,
  "POST",
);
assert.equal(
  authority.components.responses.CoStarRateLimitedErrorV1.headers["Retry-After"]
    .schema.maximum,
  60,
);

const projectionEvidence = buildProjectionEvidence(authority);
const projectionSha256 = sha256(Buffer.from(canonical(projectionEvidence)));
assert.deepEqual(Object.keys(projectionEvidence.externalSchemas), [
  "contracts/schemas/co-star/request-v1.schema.json",
  "contracts/schemas/co-star/result-error-envelope-v1.schema.json",
  "contracts/schemas/co-star/success-envelope-v1.schema.json",
  "contracts/schemas/person-detail/success-envelope-v1.schema.json",
  "contracts/schemas/query/operation-components-v1.schema.json",
  "contracts/schemas/query/shared-query-v1.schema.json",
  "contracts/schemas/rankings/result-error-envelope-v1.schema.json",
]);
const dependencyChange = structuredClone(projectionEvidence);
dependencyChange.externalSchemas[
  "contracts/schemas/person-detail/success-envelope-v1.schema.json"
]["x-projection-test"] = true;
assert.notEqual(
  sha256(Buffer.from(canonical(dependencyChange))),
  projectionSha256,
  "transitive work/evidence schema changes must change projection",
);
const unrelatedAuthority = structuredClone(authority);
unrelatedAuthority.info.description = "Unrelated authority description.";
unrelatedAuthority.paths["/unrelated"] = {
  get: {
    operationId: "unrelatedOperation",
    responses: { 204: { description: "Unrelated response." } },
  },
};
assert.equal(
  sha256(Buffer.from(canonical(buildProjectionEvidence(unrelatedAuthority)))),
  projectionSha256,
  "unrelated paths and shared info must not change co-star projection",
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
  personDetailSuccess,
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
  "cases/group.json",
  "cases/personal.json",
  "cases/errors.json",
];
let checked = 0;
for (const filename of files) {
  const corpus = readJson(`contracts/goldens/api/co-star/${filename}`);
  assert.equal(corpus.schemaVersion, 1);
  assert(Array.isArray(corpus.cases) && corpus.cases.length > 0);
  for (const testCase of corpus.cases) {
    const requestValid = validateRequest(testCase.request);
    assert.equal(
      requestValid,
      testCase.requestSchemaValid ?? true,
      `${testCase.id} request: ${ajv.errorsText(validateRequest.errors)}`,
    );
    if (testCase.expected.status === 200) {
      assert(
        validateSuccess(testCase.expected.body),
        `${testCase.id} success: ${ajv.errorsText(validateSuccess.errors)}`,
      );
      verifySuccess(testCase);
    } else {
      assert(
        validateError(testCase.expected.body),
        `${testCase.id} error: ${ajv.errorsText(validateError.errors)}`,
      );
    }
    checked += 1;
  }
}

console.log(
  JSON.stringify({
    schemaVersion: 1,
    cases: checked,
    projectionSha256,
  }),
);

function verifySuccess(testCase) {
  const request = testCase.request;
  const body = testCase.expected.body;
  const data = body.data;
  const requested = request.input.participants;
  assert.deepEqual(
    data.participants.map((participant) => ({
      personId: participant.person.id,
      positionKeys: participant.positionKeys,
    })),
    requested,
    `${testCase.id}: participant/identity order`,
  );
  assert.equal(data.kind, requested.length === 2 ? "pair" : "group");
  assert.equal(Object.hasOwn(request, "refreshCollection"), false);
  if (data.kind === "pair") {
    assert.equal(Object.hasOwn(data, "matrix"), false);
  } else {
    assert.equal(data.matrix.pairs.length, (requested.length * (requested.length - 1)) / 2);
    let pairIndex = 0;
    for (let left = 0; left < requested.length; left += 1) {
      for (let right = left + 1; right < requested.length; right += 1) {
        const pair = data.matrix.pairs[pairIndex];
        assert.equal(pair.leftPersonId, requested[left].personId);
        assert.equal(pair.rightPersonId, requested[right].personId);
        pairIndex += 1;
      }
    }
  }
  const personal = request.query.scope === "personal";
  assert.equal(Object.hasOwn(data, "preference"), personal);
  assert.equal(Object.hasOwn(data.tags, "personal"), personal);
  assert.equal(Object.hasOwn(body.meta, "collection"), personal);
  for (const dataset of data.ratings.datasets) {
    assert.equal(Object.hasOwn(dataset, "personal"), personal);
  }
  if (data.summary.commonWorkCount === 0) {
    assert.deepEqual(data.items, []);
    assert.deepEqual(data.ratings.datasets, []);
    assert.deepEqual(data.tags.meta, []);
    assert.deepEqual(data.tags.community, []);
    if (personal) {
      assert.deepEqual(data.tags.personal, []);
      assert.equal(data.preference.mean, null);
      assert.equal(data.preference.score, null);
    }
  } else {
    assert.equal(data.ratings.datasets.length, requested.length + 1);
    assert.equal(data.ratings.datasets[0].kind, "common");
    assert.deepEqual(
      data.ratings.datasets.slice(1).map((dataset) => dataset.personId),
      requested.map((participant) => participant.personId),
    );
  }
  for (const item of data.items) {
    assert.deepEqual(
      item.participants.map((participant) => participant.personId),
      requested.map((participant) => participant.personId),
    );
    for (const participant of item.participants) {
      assert(participant.credits.length > 0);
      assert.equal(Object.hasOwn(participant, "workCount"), item.kind === "series");
      for (const credit of participant.credits) {
        assert.equal(credit.provenance, "exact");
        assert.equal(Object.hasOwn(credit, "workCount"), item.kind === "series");
        if (credit.kind === "staff" && credit.positionKey.startsWith("staffset:")) {
          assert(credit.exactPositionKey.startsWith("staff:"));
        }
      }
    }
  }
}

function buildProjectionEvidence(openapi) {
  const projection = buildProjection(openapi);
  return {
    projection,
    externalSchemas: collectExternalSchemas(projection),
  };
}

function buildProjection(openapi) {
  const selected = collectLocalComponents(openapi, openapi.paths["/co-star"]);
  return {
    openapi: openapi.openapi,
    jsonSchemaDialect: openapi.jsonSchemaDialect,
    info: coStarInfo,
    paths: {
      "/co-star": openapi.paths["/co-star"],
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
    const reference = pending.shift();
    const match = reference.match(/^#\/components\/(schemas|headers|responses)\/(.+)$/);
    if (!match) continue;
    const [, group, encodedName] = match;
    const name = decodeURIComponent(encodedName.replaceAll("~1", "/").replaceAll("~0", "~"));
    if (selected[group].has(name)) continue;
    selected[group].add(name);
    const value = openapi.components[group][name];
    assert(value, `missing ${group}/${name}`);
    walk(value, (nested) => pending.push(nested));
  }
  return Object.fromEntries(
    Object.entries(selected).map(([group, names]) => [
      group,
      [...names].sort(),
    ]),
  );
}

function collectExternalSchemas(projection) {
  const pending = [];
  walk(projection, (reference) => {
    if (!reference.startsWith("#")) {
      pending.push({
        source: authorityPath,
        reference,
      });
    }
  });
  const documents = new Map();
  while (pending.length > 0) {
    const { source, reference } = pending.shift();
    const filename = path.resolve(path.dirname(source), reference.split("#", 1)[0]);
    const key = path.relative(repositoryRoot, filename).split(path.sep).join("/");
    if (documents.has(key)) continue;
    const document = JSON.parse(readRegular(filename).toString("utf8"));
    documents.set(key, document);
    walk(document, (nested) => {
      if (!nested.startsWith("#")) {
        pending.push({ source: filename, reference: nested });
      }
    });
  }
  return Object.fromEntries(
    [...documents.entries()].sort(([left], [right]) => left.localeCompare(right)),
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

function readRegular(filename) {
  const metadata = fs.lstatSync(filename);
  assert(metadata.isFile() && !metadata.isSymbolicLink(), `${filename}: regular`);
  return fs.readFileSync(filename);
}
