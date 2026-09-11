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
  "operation-field-rejected",
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
for (const [label, mutate] of [
  ["missing timeline works", (point) => { delete point.works; }],
  ["empty timeline works", (point) => { point.works = []; }],
  ["unrated timeline work", (point) => { point.works[0].score = 0; }],
  ["fractional timeline work", (point) => { point.works[0].score = 820.5; }],
  ["unknown timeline work field", (point) => { point.works[0].average = 820; }],
]) {
  const invalid = structuredClone(globalSubject.expected.body);
  mutate(invalid.data.ratings.global.timeline[0]);
  assertInvalid(validateSuccess, invalid, label);
}
for (const [label, mutate] of [
  ["timeline count mismatch", (point) => { point.count += 1; }],
  ["timeline average mismatch", (point) => { point.average -= 1; }],
  ["monthless timeline date", (point) => { point.works[0].subject.date = "2024"; }],
  ["invalid calendar date", (point) => { point.works[0].subject.date = "2024-02-30"; }],
  ["wrong timeline quarter", (point) => { point.works[0].subject.date = "2024-04-10"; }],
  ["duplicate timeline subject", (point) => {
    point.works.push(structuredClone(point.works[0]));
    point.count += 1;
  }],
]) {
  const invalid = structuredClone(globalSubject);
  mutate(invalid.expected.body.data.ratings.global.timeline[0]);
  assert.throws(() => assertSuccessSemantics(invalid), undefined, label);
}

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
verifySeriesMetadata(series.expected.body.data.items[0]);
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
const scopedDetailRequest = structuredClone(globalSubject.request);
scopedDetailRequest.input.positionKeys = [scopedDetailRequest.query.positionKeys[0]];
assertValid(validateRequest, scopedDetailRequest, "identity-scoped detail request");
for (const positionKeys of [[], null, "staff:anime:2", ["staff:anime:2", "staff:anime:2"], [null]]) {
  scopedDetailRequest.input.positionKeys = positionKeys;
  assertInvalid(validateRequest, scopedDetailRequest, "invalid detail identity scope");
}

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
  for (const [source, distribution] of Object.entries(data.ratings)) {
    assertTimelineSemantics(distribution.timeline, `${item.id}: ${source}`);
    if (data.summary.workUnit === "series") {
      assert.deepEqual(distribution.timeline, [], `${item.id}: series timeline`);
    }
    if (data.section === "works" && data.summary.workUnit === "subject") {
      const evidence = new Map(distribution.timeline.flatMap((point) =>
        point.works.map((work) => [work.subject.id, work]),
      ));
      for (const work of data.items) {
        const score = source === "global" ? work.globalScore : work.personal.score;
        if (score >= 100 && work.subject.date?.length >= 7) {
          assert.deepEqual(evidence.get(work.subject.id), {
            subject: work.subject,
            score,
          }, `${item.id}: visible work agrees with ${source} timeline`);
        }
      }
    }
  }
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

function assertTimelineSemantics(timeline, label) {
  const seenSubjects = new Set();
  let previousQuarter = -1;
  for (const point of timeline) {
    const quarterIndex = point.year * 4 + point.quarter - 1;
    assert(quarterIndex > previousQuarter, `${label}: chronological quarters`);
    previousQuarter = quarterIndex;
    assert.equal(point.count, point.works.length, `${label}: complete work count`);
    let scoreSum = 0n;
    let previousWork;
    for (const work of point.works) {
      const { id, date } = work.subject;
      assert.equal(typeof date, "string", `${label}: dated work`);
      const match = date.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
      assert(match, `${label}: month-precise date`);
      const [, year, month, day] = match;
      const parsed = new Date(`${year}-${month}-${day ?? "01"}T00:00:00Z`);
      assert.equal(parsed.getUTCFullYear(), Number(year), `${label}: valid year`);
      assert.equal(parsed.getUTCMonth() + 1, Number(month), `${label}: valid month`);
      assert.equal(parsed.getUTCDate(), Number(day ?? 1), `${label}: valid day`);
      assert.equal(Number(year), point.year, `${label}: year membership`);
      assert.equal(Math.ceil(Number(month) / 3), point.quarter, `${label}: quarter membership`);
      assert(!seenSubjects.has(id), `${label}: unique subject`);
      seenSubjects.add(id);
      if (previousWork) {
        assert(previousWork.subject.date < date ||
          (previousWork.subject.date === date && previousWork.subject.id < id),
        `${label}: date then subject ID order`);
      }
      previousWork = work;
      scoreSum += BigInt(work.score);
    }
    assert.equal(point.average, Number(scoreSum / BigInt(point.count)),
      `${label}: canonical truncated mean`);
  }
}

function assertCommonHeaders(item) {
  assert.equal(item.expected.headers["Cache-Control"], "private, no-store");
}

function verifySeriesMetadata(personalSeries) {
  assert.deepEqual(personalSeries.metaTags, ["TV", "原创"]);
  const globalSeries = structuredClone(personalSeries);
  delete globalSeries.personalScore;
  delete globalSeries.latestCollectionUpdatedAt;
  for (const [name, example] of [
    ["GlobalSeriesWorkV1", globalSeries],
    ["PersonalSeriesWorkV1", personalSeries],
  ]) {
    const validate = ajv.compile({ $ref: `${successSchema.$id}#/$defs/${name}` });
    assertValid(validate, example, `${name}: representative metadata`);
    assertValid(validate, { ...example, metaTags: [] }, `${name}: empty metadata`);
    assertValid(validate, { ...example, metaTags: ["😀".repeat(255)] }, `${name}: Unicode scalar bound`);
    for (const [label, metaTags] of [
      ["missing", undefined], ["null", null], ["duplicate", ["TV", "TV"]],
      ["empty string", [""]], ["oversized string", ["😀".repeat(256)]],
      ["too many", Array.from({ length: 17 }, (_, index) => `tag-${index}`)],
    ]) {
      const invalid = { ...example, metaTags };
      if (metaTags === undefined) delete invalid.metaTags;
      assertInvalid(validate, invalid, `${name}: ${label} metadata`);
    }
  }
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

// Independent operation scope is explicit, closed, and optional.
const positionScopeRequest = {"query": {"scope": "global", "subjectType": "anime", "positionKeys": ["staff:anime:2"]}, "input": {"personId": 2, "positionKeys": ["staff:anime:3"]}};
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
    delete request.input.positionKeys;
    assert.equal(validateRequest(request), false, "empty detail query requires exact identities");
  }
}
