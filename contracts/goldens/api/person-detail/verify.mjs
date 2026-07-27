import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const goldenRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(goldenRoot, "../../../..");

const caseFiles = [
  "cases/characters.json",
  "cases/errors.json",
  "cases/global.json",
  "cases/personal.json",
];
const schemaFiles = [
  "schemas/person-detail/request-v1.schema.json",
  "schemas/person-detail/result-error-envelope-v1.schema.json",
  "schemas/person-detail/success-envelope-v1.schema.json",
];
const sharedQuerySchema = readJson("schemas/query/shared-query-v1.schema.json");
const operationSchema = readJson(
  "schemas/query/operation-components-v1.schema.json",
);
const requestSchema = readJson(schemaFiles[0]);
const errorSchema = readJson(schemaFiles[1]);
const successSchema = readJson(schemaFiles[2]);

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
  errorSchema,
  successSchema,
]) {
  ajv.addSchema(schema);
}
const validateRequest = ajv.getSchema(requestSchema.$id);
const validateError = ajv.getSchema(errorSchema.$id);
const validateSuccess = ajv.getSchema(successSchema.$id);
assert(validateRequest && validateError && validateSuccess);

const cases = new Map();
for (const relative of caseFiles) {
  const document = readJson(path.join("goldens/api/person-detail", relative));
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
      continue;
    }
    if (item.request.body) {
      const valid = validateRequest(item.request.body);
      assert.equal(
        valid,
        item.requestSchemaValid,
        `${item.id}: request-schema expectation`,
      );
    }
    assert(item.expected.status >= 400 && item.expected.status <= 599);
    assertCommonHeaders(item);
    assertValid(validateError, item.expected.body, `${item.id}: error`);
  }
}

for (const required of [
  "global-subject-exact-staff",
  "global-out-of-range-empty-page",
  "personal-subject-complete-evidence",
  "personal-series-complete-members-stale",
  "global-character-exact-cast",
  "refresh-field-rejected",
  "unknown-input-field-rejected",
  "person-id-fraction-rejected",
  "characters-without-cast-rejected",
  "person-not-in-query-result",
  "person-entity-not-found",
  "wrong-method-rejected",
  "store-not-ready",
]) {
  assert(cases.has(required), `missing required case ${required}`);
}

const globalSubject = cases.get("global-subject-exact-staff");
const invalidRawWorkCount = structuredClone(globalSubject.expected.body);
invalidRawWorkCount.data.summary.rawWorkCount = 1;
assertInvalid(validateSuccess, invalidRawWorkCount, "unapproved rawWorkCount");

const personalSubject = cases.get("personal-subject-complete-evidence");
const invalidGlobalRatedWorkCount = structuredClone(
  personalSubject.expected.body,
);
invalidGlobalRatedWorkCount.data.metrics.globalRatedWorkCount = 1;
assertInvalid(
  validateSuccess,
  invalidGlobalRatedWorkCount,
  "cross-operation globalRatedWorkCount",
);

const invalidOverlongPage = structuredClone(globalSubject.expected.body);
invalidOverlongPage.data.items = Array.from(
  { length: 21 },
  () => structuredClone(invalidOverlongPage.data.items[0]),
);
assertInvalid(validateSuccess, invalidOverlongPage, "overlong detail page");

const series = cases.get("personal-series-complete-members-stale");
assert(
  series.expected.body.data.items[0].members.some(({ matched }) => !matched),
  "series golden must retain complete unmatched members",
);
assert.equal(series.expected.body.meta.collection.stale, true);
assert.deepEqual(series.expected.body.meta.collection.warningCodes, [
  "COLLECTION_STALE",
]);

const character = cases.get("global-character-exact-cast");
assert.equal(character.expected.body.data.summary.characterCount, 1);
assert.equal(
  character.expected.body.data.items[0].appearances[0].subject.id,
  1,
  "character appearance must reference a raw Subject",
);

const inventory = [
  ...caseFiles,
  ...schemaFiles.map((value) =>
    path.relative("schemas/person-detail", value),
  ),
  "package-lock.json",
  "package.json",
  "verify.mjs",
].sort();
const result = {
  schemaVersion: 1,
  cases: cases.size,
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

function assertSuccessSemantics(item) {
  const { data, meta } = item.expected.body;
  assert.equal(data.section, item.request.view?.section ?? "works");
  assert(data.items.length <= 20);
  assert.equal(meta.pagination.page, item.request.view?.page ?? 1);
  assert.equal(meta.pagination.pageSize, item.request.view?.pageSize ?? 10);
  assert.equal(data.ratings.global.buckets.length, 10);
  for (const bucket of data.ratings.global.buckets) {
    assert(bucket.examples.length <= 8);
    assert.equal(
      bucket.hiddenCount,
      bucket.count - bucket.examples.length,
      `${item.id}: hidden count`,
    );
  }
  if (item.request.query.scope === "global") {
    for (const forbidden of [
      "globalAverage",
      "highest",
      "lowest",
    ]) {
      assert(!(forbidden in data.metrics), `${item.id}: leaked ${forbidden}`);
    }
    assert(!("personal" in data.tags));
    assert(!("personal" in data.ratings));
    assert(!("preference" in data));
    assert(!("collection" in meta));
  } else {
    assert("globalAverage" in data.metrics);
    assert("personal" in data.tags);
    assert("personal" in data.ratings);
    assert("preference" in data);
    assert("collection" in meta);
  }
  if (data.section === "works") {
    for (const work of data.items) {
      assert(["subject", "series"].includes(work.kind));
    }
  } else {
    for (const value of data.items) {
      assert(value.appearances.length === value.workCount);
    }
  }
}

function assertCommonHeaders(item) {
  assert.equal(item.expected.headers["Cache-Control"], "private, no-store");
}

function assertValid(validate, value, label) {
  if (!validate(value)) {
    throw new Error(`${label}: ${ajv.errorsText(validate.errors)}`);
  }
}

function assertInvalid(validate, value, label) {
  assert(!validate(value), `${label}: schema accepted invalid value`);
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
