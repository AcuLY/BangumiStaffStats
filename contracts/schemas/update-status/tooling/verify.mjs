import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_ROOT = path.resolve(TOOL_DIR, "..");
const GOLDEN_ROOT = path.resolve(SCHEMA_ROOT, "../../goldens/update-status");
const INDEX_PATH = path.join(GOLDEN_ROOT, "index.json");
const STATUS_SCHEMA_PATH = path.join(
  SCHEMA_ROOT,
  "update-status-v1.schema.json",
);
const INDEX_SCHEMA_PATH = path.join(
  SCHEMA_ROOT,
  "golden-index.schema.json",
);
const EXPECTED_CASES = [
  {
    path: "cases/first-failure.json",
    caseId: "first-failure",
    caseKind: "status-document",
    outcome: "VALID",
  },
  {
    path: "cases/canceled.json",
    caseId: "canceled",
    caseKind: "status-document",
    outcome: "VALID",
  },
  {
    path: "cases/no-change.json",
    caseId: "no-change",
    caseKind: "status-document",
    outcome: "VALID",
  },
  {
    path: "cases/published.json",
    caseId: "published",
    caseKind: "status-document",
    outcome: "VALID",
  },
  {
    path: "cases/invalid.json",
    caseId: "invalid",
    caseKind: "invalid-mutations",
    outcome: "INVALID",
  },
];
const EXPECTED_INVALID_MUTATIONS = [
  "unknown-root-field",
  "unknown-record-field",
  "invalid-status",
  "calendar-invalid-time",
  "negative-duration",
  "invalid-data-version",
  "failed-without-error",
  "failed-with-canceled-code",
  "canceled-with-wrong-code",
  "success-with-error",
  "failed-last-success",
  "missing-error-field",
];
const decoder = new TextDecoder("utf-8", { fatal: true });

function compareBytes(left, right) {
  return Buffer.from(left).compare(Buffer.from(right));
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function assertRegularFile(filePath, label) {
  const stat = await lstat(filePath);
  assert.equal(stat.isSymbolicLink(), false, `${label} must not be a symlink`);
  assert.equal(stat.isFile(), true, `${label} must be a regular file`);
}

async function assertDirectory(directoryPath, label) {
  const stat = await lstat(directoryPath);
  assert.equal(stat.isSymbolicLink(), false, `${label} must not be a symlink`);
  assert.equal(stat.isDirectory(), true, `${label} must be a directory`);
}

async function readBytes(filePath, label) {
  await assertRegularFile(filePath, label);
  return readFile(filePath);
}

async function readJson(filePath, label) {
  const bytes = await readBytes(filePath, label);
  let text;
  try {
    text = decoder.decode(bytes);
  } catch (error) {
    throw new Error(`${label} is not valid UTF-8: ${error.message}`);
  }
  try {
    return { bytes, value: JSON.parse(text) };
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

async function walkRegularFiles(root) {
  const files = [];
  async function visit(current, relative) {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((left, right) => compareBytes(left.name, right.name));
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      const stat = await lstat(absolute);
      assert.equal(stat.isSymbolicLink(), false, `symlink is forbidden: ${rel}`);
      if (stat.isDirectory()) {
        await visit(absolute, rel);
      } else {
        assert.equal(
          stat.isFile(),
          true,
          `non-regular golden is forbidden: ${rel}`,
        );
        files.push(rel);
      }
    }
  }
  await visit(root, "");
  return files;
}

function validateUtcTimestamp(value) {
  const match =
    /^(?!0000)([0-9]{4})-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):([0-5][0-9]):([0-5][0-9])(?:\.([0-9]{1,6}))?Z$/.exec(
      value,
    );
  if (match === null) {
    return false;
  }
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] =
    match;
  const expected = [
    Number(yearText),
    Number(monthText),
    Number(dayText),
    Number(hourText),
    Number(minuteText),
    Number(secondText),
  ];
  const instant = new Date(0);
  instant.setUTCHours(expected[3], expected[4], expected[5], 0);
  instant.setUTCFullYear(expected[0], expected[1] - 1, expected[2]);
  return (
    instant.getUTCFullYear() === expected[0] &&
    instant.getUTCMonth() + 1 === expected[1] &&
    instant.getUTCDate() === expected[2] &&
    instant.getUTCHours() === expected[3] &&
    instant.getUTCMinutes() === expected[4] &&
    instant.getUTCSeconds() === expected[5]
  );
}

function assertClosedObject(value, expectedKeys, label) {
  assert.equal(
    typeof value,
    "object",
    `${label} must be an object`,
  );
  assert.notEqual(value, null, `${label} must not be null`);
  assert.equal(Array.isArray(value), false, `${label} must not be an array`);
  assert.deepEqual(
    Object.keys(value).sort(compareBytes),
    [...expectedKeys].sort(compareBytes),
    `${label} has an invalid field inventory`,
  );
}

function assertIndexInventory(index) {
  assert.deepEqual(
    index.entries.map(({ path: casePath, caseId, caseKind, outcome }) => ({
      path: casePath,
      caseId,
      caseKind,
      outcome,
    })),
    EXPECTED_CASES,
    "golden index must contain the exact ordered five-case inventory",
  );
  assert.equal(
    new Set(index.entries.map((entry) => entry.path)).size,
    index.entries.length,
    "golden index paths must be unique",
  );
  assert.equal(
    new Set(index.entries.map((entry) => entry.caseId)).size,
    index.entries.length,
    "golden case IDs must be unique",
  );
}

function assertInvalidMutationSuite(suite, validateStatus) {
  assertClosedObject(suite, ["caseId", "mutations"], "invalid mutation suite");
  assert.equal(suite.caseId, "invalid", "invalid suite caseId drifted");
  assert.ok(Array.isArray(suite.mutations), "mutations must be an array");
  assert.deepEqual(
    suite.mutations.map((mutation) => mutation.id),
    EXPECTED_INVALID_MUTATIONS,
    "invalid mutation inventory drifted",
  );
  for (const mutation of suite.mutations) {
    assertClosedObject(
      mutation,
      ["id", "expected", "document"],
      `invalid mutation ${String(mutation.id)}`,
    );
    assert.equal(
      mutation.expected,
      "INVALID",
      `invalid mutation ${mutation.id} expectation drifted`,
    );
    assert.equal(
      validateStatus(mutation.document),
      false,
      `invalid mutation ${mutation.id} unexpectedly validated`,
    );
  }
}

async function snapshotInputs(casePaths) {
  const paths = [
    STATUS_SCHEMA_PATH,
    INDEX_SCHEMA_PATH,
    INDEX_PATH,
    ...casePaths,
  ];
  const snapshot = {};
  for (const inputPath of paths) {
    snapshot[inputPath] = sha256(
      await readBytes(inputPath, `verifier input ${inputPath}`),
    );
  }
  return snapshot;
}

await assertDirectory(SCHEMA_ROOT, "schema root");
await assertDirectory(GOLDEN_ROOT, "golden root");
await assertDirectory(path.join(GOLDEN_ROOT, "cases"), "golden cases root");

const { value: statusSchema } = await readJson(
  STATUS_SCHEMA_PATH,
  "status schema",
);
const { value: indexSchema } = await readJson(
  INDEX_SCHEMA_PATH,
  "golden index schema",
);
const { value: index } = await readJson(INDEX_PATH, "golden index");

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  validateFormats: true,
});
ajv.addFormat("date-time", {
  type: "string",
  validate: validateUtcTimestamp,
});
const validateStatus = ajv.compile(statusSchema);
const validateIndex = ajv.compile(indexSchema);

assert.equal(
  validateIndex(index),
  true,
  `golden index schema validation failed: ${ajv.errorsText(
    validateIndex.errors,
  )}`,
);
assertIndexInventory(index);

const expectedGoldenFiles = [
  "index.json",
  ...EXPECTED_CASES.map((entry) => entry.path),
].sort(compareBytes);
assert.deepEqual(
  await walkRegularFiles(GOLDEN_ROOT),
  expectedGoldenFiles,
  "golden root contains a missing or extra file",
);

const goldenPrefix = `${GOLDEN_ROOT}${path.sep}`;
const casePaths = [];
let invalidMutationCount = 0;
for (const entry of index.entries) {
  const absolute = path.resolve(GOLDEN_ROOT, entry.path);
  assert.ok(
    absolute.startsWith(goldenPrefix),
    `indexed case escapes golden root: ${entry.path}`,
  );
  const { bytes, value } = await readJson(
    absolute,
    `golden case ${entry.path}`,
  );
  assert.equal(
    sha256(bytes),
    entry.sha256,
    `golden digest mismatch: ${entry.path}`,
  );
  casePaths.push(absolute);
  if (entry.caseKind === "status-document") {
    assert.equal(
      entry.outcome,
      "VALID",
      `status document outcome drifted: ${entry.path}`,
    );
    assert.equal(
      validateStatus(value),
      true,
      `valid status case failed: ${entry.path}: ${ajv.errorsText(
        validateStatus.errors,
      )}`,
    );
  } else {
    assert.equal(
      entry.outcome,
      "INVALID",
      `invalid suite outcome drifted: ${entry.path}`,
    );
    assertInvalidMutationSuite(value, validateStatus);
    invalidMutationCount += value.mutations.length;
  }
}

const before = await snapshotInputs(casePaths);
const after = await snapshotInputs(casePaths);
assert.deepEqual(after, before, "verifier modified an input");

process.stdout.write(
  `${JSON.stringify({
    result: "UPDATE_STATUS_CONTRACTS_OK",
    cases: EXPECTED_CASES.length,
    invalidMutations: invalidMutationCount,
  })}\n`,
);
