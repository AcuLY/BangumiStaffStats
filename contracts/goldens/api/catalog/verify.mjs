import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const goldenRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(goldenRoot, "../../../..");
const openapiPath = path.join(repositoryRoot, "contracts/openapi/openapi.yaml");
const errorSchemaPath = path.join(
  repositoryRoot,
  "contracts/schemas/query/error-envelope-v1.schema.json",
);
const indexPath = path.join(goldenRoot, "index.json");
const generationPath = path.join(goldenRoot, "generation.json");
const disposableNames = new Set([".cache", ".tmp", "node_modules"]);
const subjectOrder = ["book", "anime", "music", "game", "real"];
const capabilityOrder = [
  "rankings",
  "candidates",
  "personDetail",
  "partners",
  "coStar",
];
const expectedStatuses = new Map([
  ["query-input-rejected", 400],
  ["non-empty-body-rejected", 400],
  ["wrong-method-rejected", 405],
  ["malformed-path-retains-not-found", 404],
  ["corrupt-store-fails-closed", 500],
  ["store-not-ready", 503],
  ["deadline-before-commit", 504],
]);
const expectedErrorCodes = new Map([
  [400, "INVALID_REQUEST"],
  [404, "ENTITY_NOT_FOUND"],
  [405, "INVALID_REQUEST"],
  [500, "INTERNAL_ERROR"],
  [503, "NOT_READY"],
  [504, "UPSTREAM_TIMEOUT"],
]);
const expectedCatalogComponents = [
  "CatalogCastPositionV1",
  "CatalogDataV1",
  "CatalogFilterCapabilityV1",
  "CatalogGroupV1",
  "CatalogLocalizedNamesV1",
  "CatalogMetaV1",
  "CatalogOperationApplicabilityV1",
  "CatalogOperationV1",
  "CatalogPositionCapabilityNameV1",
  "CatalogPositionV1",
  "CatalogRootSortCapabilityV1",
  "CatalogScopeV1",
  "CatalogSectionSortCapabilityV1",
  "CatalogSectionV1",
  "CatalogSelectionRuleV1",
  "CatalogSortCapabilityV1",
  "CatalogStaffPositionV1",
  "CatalogStaffSetPositionV1",
  "CatalogSubjectTypeKeyV1",
  "CatalogSubjectTypeV1",
  "CatalogSuccessEnvelopeV1",
];
const expectedQueryComponentSeal =
  "58f20d1c145c50215839d8dc781d147c46dcdd35ee68698e84fa6d662016d6db";
const expectedCatalogResponseSeal =
  "b9e8ccdc7f42acb695818ee080d34668d0b82189d033bf77349f3475abdcfa44";
const queryComponentNames = [
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
  "SharedQueryV1",
];

function fail(message) {
  throw new Error(message);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
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

function semanticDigest(value) {
  return sha256(canonical(value));
}

function readRegular(file) {
  const metadata = fs.lstatSync(file);
  assert(metadata.isFile(), `${file}: regular file`);
  assert(!metadata.isSymbolicLink(), `${file}: symlink forbidden`);
  return fs.readFileSync(file);
}

function decodeUtf8(bytes, label) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail(`${label}: invalid UTF-8`);
  }
}

class StrictJsonSyntax {
  constructor(text, label) {
    this.text = text;
    this.label = label;
    this.offset = 0;
  }

  parse() {
    this.value();
    this.space();
    assert.equal(this.offset, this.text.length, `${this.label}: trailing JSON`);
  }

  space() {
    while (/[\t\n\r ]/.test(this.text[this.offset] ?? "")) this.offset += 1;
  }

  value() {
    this.space();
    const token = this.text[this.offset];
    if (token === "{") return this.object();
    if (token === "[") return this.array();
    if (token === '"') return this.string();
    if (token === "t") return this.literal("true");
    if (token === "f") return this.literal("false");
    if (token === "n") return this.literal("null");
    const match = this.text
      .slice(this.offset)
      .match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/);
    assert(match, `${this.label}: invalid JSON value at ${this.offset}`);
    this.offset += match[0].length;
  }

  literal(value) {
    assert(
      this.text.startsWith(value, this.offset),
      `${this.label}: invalid literal at ${this.offset}`,
    );
    this.offset += value.length;
  }

  string() {
    const start = this.offset;
    this.offset += 1;
    while (this.offset < this.text.length) {
      const character = this.text[this.offset++];
      if (character === '"') {
        return JSON.parse(this.text.slice(start, this.offset));
      }
      if (character === "\\") {
        const escaped = this.text[this.offset++];
        if (escaped === "u") {
          assert(
            /^[0-9a-fA-F]{4}$/.test(
              this.text.slice(this.offset, this.offset + 4),
            ),
            `${this.label}: invalid unicode escape`,
          );
          this.offset += 4;
        } else {
          assert(
            '"\\/bfnrt'.includes(escaped),
            `${this.label}: invalid escape`,
          );
        }
      } else {
        assert(
          character.charCodeAt(0) >= 0x20,
          `${this.label}: control character`,
        );
      }
    }
    fail(`${this.label}: unterminated string`);
  }

  object() {
    this.offset += 1;
    this.space();
    const keys = new Set();
    if (this.text[this.offset] === "}") {
      this.offset += 1;
      return;
    }
    while (true) {
      assert.equal(this.text[this.offset], '"', `${this.label}: object key`);
      const key = this.string();
      assert(!keys.has(key), `${this.label}: duplicate object key ${key}`);
      keys.add(key);
      this.space();
      assert.equal(this.text[this.offset++], ":", `${this.label}: colon`);
      this.value();
      this.space();
      const separator = this.text[this.offset++];
      if (separator === "}") return;
      assert.equal(separator, ",", `${this.label}: object separator`);
      this.space();
    }
  }

  array() {
    this.offset += 1;
    this.space();
    if (this.text[this.offset] === "]") {
      this.offset += 1;
      return;
    }
    while (true) {
      this.value();
      this.space();
      const separator = this.text[this.offset++];
      if (separator === "]") return;
      assert.equal(separator, ",", `${this.label}: array separator`);
    }
  }
}

function readJson(file) {
  const text = decodeUtf8(readRegular(file), file);
  new StrictJsonSyntax(text, file).parse();
  return JSON.parse(text);
}

function walkInventory(root, relative = "") {
  const absolute = path.join(root, relative);
  const entries = fs.readdirSync(absolute, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (relative === "" && disposableNames.has(entry.name)) continue;
    const childRelative = path.posix.join(relative, entry.name);
    const child = path.join(root, childRelative);
    const metadata = fs.lstatSync(child);
    assert(!metadata.isSymbolicLink(), `${childRelative}: symlink forbidden`);
    if (metadata.isDirectory()) {
      files.push(...walkInventory(root, childRelative));
    } else {
      assert(metadata.isFile(), `${childRelative}: non-regular entry`);
      files.push(childRelative);
    }
  }
  return files.sort();
}

function assertClosedInventory(actual, declared) {
  assert.deepEqual([...declared].sort(), actual, "closed inventory");
}

function verifyClosedIndex() {
  const index = readJson(indexPath);
  assert.equal(index.schemaVersion, 1);
  assert.equal(index.kind, "catalog-golden-index");
  assert(Array.isArray(index.files));
  const actual = walkInventory(goldenRoot).filter((entry) => entry !== "index.json");
  const declared = index.files.map((entry) => entry.path);
  assertClosedInventory(actual, declared);
  assert.equal(new Set(declared).size, declared.length, "duplicate index path");
  const caseIds = new Set();
  for (const entry of index.files) {
    assert.deepEqual(Object.keys(entry).sort(), [
      "caseId",
      "kind",
      "outcome",
      "path",
      "sha256",
    ]);
    assert(/^[a-f0-9]{64}$/.test(entry.sha256), `${entry.path}: SHA-256`);
    assert(!caseIds.has(entry.caseId), `${entry.path}: duplicate caseId`);
    caseIds.add(entry.caseId);
    const bytes = readRegular(path.join(goldenRoot, entry.path));
    assert.equal(sha256(bytes), entry.sha256, `${entry.path}: digest`);
    if (entry.path.endsWith(".json")) readJson(path.join(goldenRoot, entry.path));
    else decodeUtf8(bytes, entry.path);
  }
  return index;
}

function selfTestFailClosedGuards(index) {
  assert.throws(
    () => decodeUtf8(Buffer.from([0xc3, 0x28]), "fatal-utf8-negative"),
    /invalid UTF-8/,
  );
  assert.throws(
    () => new StrictJsonSyntax('{"duplicate":1,"duplicate":2}', "duplicate-key-negative").parse(),
    /duplicate object key/,
  );
  const declared = index.files.map((entry) => entry.path);
  const actual = [...declared].sort();
  assert.throws(
    () => assertClosedInventory([...actual, "cases/undeclared.json"].sort(), declared),
    /closed inventory/,
  );
  assert.throws(
    () => assertClosedInventory(actual.slice(1), declared),
    /closed inventory/,
  );
}

function clone(value) {
  return structuredClone(value);
}

function pointer(document, raw, allowAppend = false) {
  assert(raw.startsWith("/"), `invalid JSON pointer ${raw}`);
  const segments = raw
    .slice(1)
    .split("/")
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"));
  let parent = document;
  for (const segment of segments.slice(0, -1)) {
    assert(Object.hasOwn(parent, segment), `missing JSON pointer ${raw}`);
    parent = parent[segment];
  }
  const key = segments.at(-1);
  if (Array.isArray(parent)) {
    if (key === "-" && allowAppend) return [parent, parent.length];
    assert(/^(0|[1-9][0-9]*)$/.test(key), `invalid array pointer ${raw}`);
    return [parent, Number(key)];
  }
  return [parent, key];
}

function getPointer(document, raw) {
  const [parent, key] = pointer(document, raw);
  assert(Object.hasOwn(parent, key), `missing JSON pointer ${raw}`);
  return parent[key];
}

function applyPatch(document, operations) {
  const result = clone(document);
  for (const operation of operations) {
    if (operation.op === "move" || operation.op === "copy") {
      const value = clone(getPointer(result, operation.from));
      if (operation.op === "move") {
        const [source, sourceKey] = pointer(result, operation.from);
        if (Array.isArray(source)) source.splice(sourceKey, 1);
        else delete source[sourceKey];
      }
      const [target, targetKey] = pointer(result, operation.path, true);
      if (Array.isArray(target)) target.splice(targetKey, 0, value);
      else target[targetKey] = value;
      continue;
    }
    const [target, targetKey] = pointer(
      result,
      operation.path,
      operation.op === "add",
    );
    if (operation.op === "remove") {
      if (Array.isArray(target)) target.splice(targetKey, 1);
      else delete target[targetKey];
    } else if (operation.op === "add") {
      if (Array.isArray(target)) target.splice(targetKey, 0, clone(operation.value));
      else target[targetKey] = clone(operation.value);
    } else if (operation.op === "replace") {
      assert(Object.hasOwn(target, targetKey), `replace target ${operation.path}`);
      target[targetKey] = clone(operation.value);
    } else {
      fail(`unsupported JSON Patch operation ${operation.op}`);
    }
  }
  return result;
}

function stripDiscriminator(value) {
  if (Array.isArray(value)) return value.map(stripDiscriminator);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "discriminator")
        .map(([key, child]) => [key, stripDiscriminator(child)]),
    );
  }
  return value;
}

function rewriteComponentRefs(value) {
  if (Array.isArray(value)) return value.map(rewriteComponentRefs);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        key === "$ref" &&
        typeof child === "string" &&
        child.startsWith("#/components/schemas/")
          ? child.replace("#/components/schemas/", "#/$defs/")
          : rewriteComponentRefs(child),
      ]),
    );
  }
  return value;
}

function createValidators(openapi, errorSchema) {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    discriminator: false,
  });
  addFormats(ajv);
  ajv.addSchema(errorSchema);
  const rootId = "https://bangumi.example/catalog-openapi-schema";
  const components = rewriteComponentRefs(
    stripDiscriminator(clone(openapi.components.schemas)),
  );
  components.ErrorEnvelopeV1 = { $ref: errorSchema.$id };
  ajv.addSchema({
    $id: rootId,
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: components,
  });
  return {
    success: ajv.compile({
      $ref: `${rootId}#/$defs/CatalogSuccessEnvelopeV1`,
    }),
    error: ajv.compile({
      $ref: `${rootId}#/$defs/ErrorEnvelopeV1`,
    }),
  };
}

function assertUnique(values, label) {
  assert.equal(new Set(values).size, values.length, `${label}: duplicate`);
}

function assertAsciiSorted(values, label) {
  assert.deepEqual(values, [...values].sort(), `${label}: ASCII order`);
}

function assertCanonicalCapabilities(values, label) {
  assertUnique(values, label);
  assert.deepEqual(
    values,
    capabilityOrder.filter((value) => values.includes(value)),
    `${label}: capability order`,
  );
}

function compareEntityOrder(left, right) {
  return (
    subjectOrder.indexOf(left.subjectType) -
      subjectOrder.indexOf(right.subjectType) ||
    left.displayOrder - right.displayOrder ||
    left.key.localeCompare(right.key, "en", { sensitivity: "variant" })
  );
}

function verifyCatalogSemantics(fixture) {
  const data = fixture.expected.body.data;
  assert.deepEqual(
    data.subjectTypes.map(({ key }) => key),
    subjectOrder,
    "subject-type order",
  );
  assert.deepEqual(
    data.subjectTypes.map(({ label }) => label),
    ["书籍", "动画", "音乐", "游戏", "三次元"],
    "subject-type labels",
  );
  assert.deepEqual(data.positions, [...data.positions].sort(compareEntityOrder));
  assert.deepEqual(data.groups, [...data.groups].sort(compareEntityOrder));
  const positionByKey = new Map(
    data.positions.map((position) => [position.key, position]),
  );
  assert.equal(positionByKey.size, data.positions.length, "position uniqueness");
  assertUnique(data.groups.map(({ key }) => key), "groups");
  assertUnique(data.selectionRules.map(({ key }) => key), "rules");

  for (const position of data.positions) {
    assertCanonicalCapabilities(
      position.capabilities,
      `${position.key}: capabilities`,
    );
    assert(
      position.key.startsWith(
        position.kind === "staffSet"
          ? `staffset:${position.subjectType}:`
          : `${position.kind}:${position.subjectType}:`,
      ),
      `${position.key}: subject/kind identity`,
    );
    if (position.status === "hidden") {
      assert.deepEqual(position.capabilities, [], `${position.key}: hidden`);
    }
    if (position.kind === "staff") {
      assert.equal(
        position.positionId,
        Number(position.key.split(":").at(-1)),
        `${position.key}: positionId`,
      );
    } else if (position.kind === "cast") {
      assert(
        ["anime", "game"].includes(position.subjectType),
        `${position.key}: cast type`,
      );
      assert.equal(
        position.key,
        `cast:${position.subjectType}:${position.roleScope}`,
        `${position.key}: cast identity`,
      );
      assert.equal(
        position.exclusiveGroup,
        `cast:${position.subjectType}`,
        `${position.key}: exclusive identity`,
      );
    } else {
      assertAsciiSorted(position.memberKeys, `${position.key}: staff-set members`);
      for (const memberKey of position.memberKeys) {
        const member = positionByKey.get(memberKey);
        assert(member, `${position.key}: dangling member ${memberKey}`);
        assert.equal(member.kind, "staff", `${position.key}: member kind`);
        assert.equal(
          member.subjectType,
          position.subjectType,
          `${position.key}: cross-type member`,
        );
      }
    }
  }

  for (const group of data.groups) {
    assertUnique(group.positionKeys, `${group.key}: group members`);
    const members = group.positionKeys.map((key) => {
      const position = positionByKey.get(key);
      assert(position, `${group.key}: dangling position ${key}`);
      assert.equal(position.subjectType, group.subjectType, `${group.key}: type`);
      assert.equal(position.status, "selectable", `${group.key}: hidden position`);
      return position;
    });
    const castMain = members.findIndex((item) => item.kind === "cast" && item.roleScope === "main");
    const castAll = members.findIndex((item) => item.kind === "cast" && item.roleScope === "all");
    if (group.key.endsWith(":cast") && castMain !== -1 && castAll !== -1) {
      assert(castMain < castAll, `${group.key}: cast main before all`);
    }
  }

  const positionIndex = new Map(
    data.positions.map((position, index) => [position.key, index]),
  );
  assert.deepEqual(
    data.selectionRules,
    [...data.selectionRules].sort(
      (left, right) =>
        positionIndex.get(left.positionKey) - positionIndex.get(right.positionKey),
    ),
    "selection-rule order",
  );
  for (const rule of data.selectionRules) {
    const position = positionByKey.get(rule.positionKey);
    assert(position, `${rule.key}: dangling position`);
    const requiredKind = {
      exactStaff: "staff",
      exactCast: "cast",
      staffSetUnion: "staffSet",
    }[rule.kind];
    assert.equal(position.kind, requiredKind, `${rule.key}: position kind`);
    if (rule.kind === "staffSetUnion") {
      assert.equal(
        rule.value,
        position.memberKeys.join("|"),
        `${rule.key}: union members`,
      );
    }
  }

  assert.equal(
    data.positions.filter(({ kind }) => kind === "staffSet").length,
    fixture.source.staffSetConfig === "empty-v1" ? 0 : 1,
    "staff-set activation",
  );
  assert.equal(
    data.groups.filter(({ kind }) => kind === "custom").length,
    fixture.source.staffSetConfig === "empty-v1" ? 0 : 1,
    "custom-group activation",
  );
  assert.equal(
    data.selectionRules.filter(({ kind }) => kind === "staffSetUnion").length,
    fixture.source.staffSetConfig === "empty-v1" ? 0 : 1,
    "staff-set rule activation",
  );

  const generation = readJson(generationPath);
  assert.equal(
    semanticDigest(data.filterCapabilities),
    generation.semanticDigests.filterCapabilities,
    "filter capability matrix",
  );
  assert.equal(
    semanticDigest(data.sortCapabilities),
    generation.semanticDigests.sortCapabilities,
    "sort capability matrix",
  );
  const shape = fixture.source.staffSetConfig === "empty-v1" ? "dormant" : "synthetic";
  for (const field of ["positions", "groups", "selectionRules"]) {
    assert.equal(
      semanticDigest(data[field]),
      generation.semanticDigests[shape][field],
      `${shape} ${field}`,
    );
  }
}

function verifySuccessFixture(fixture, validators) {
  assert.equal(fixture.schemaVersion, 1);
  assert.equal(fixture.kind, "catalog-success");
  assert.equal(fixture.expected.status, 200);
  assert.deepEqual(Object.keys(fixture.expected.headers).sort(), [
    "Cache-Control",
    "Content-Type",
    "X-Request-ID",
  ]);
  assert.equal(fixture.expected.headers["Cache-Control"], "no-cache");
  assert.equal(fixture.expected.headers["Content-Type"], "application/json");
  assert.equal(
    fixture.expected.headers["X-Request-ID"],
    fixture.expected.body.meta.requestId,
  );
  assert.equal(
    fixture.source.dataVersion,
    fixture.expected.body.meta.dataVersion,
  );
  assert(
    validators.success(fixture.expected.body),
    `success schema: ${JSON.stringify(validators.success.errors)}`,
  );
  verifyCatalogSemantics(fixture);
}

function materializeSynthetic(document, base) {
  assert.equal(document.kind, "catalog-success-derived");
  assert.equal(document.base, "cases/success-empty.json");
  const fixture = applyPatch(base, document.patch);
  assert.equal(fixture.caseId, document.caseId);
  return fixture;
}

function verifyErrors(document, validators) {
  assert.equal(document.kind, "catalog-error-matrix");
  assert.equal(document.schemaVersion, 1);
  assert.equal(document.cases.length, expectedStatuses.size);
  assertUnique(document.cases.map(({ id }) => id), "error cases");
  for (const testCase of document.cases) {
    const expectedStatus = expectedStatuses.get(testCase.id);
    assert(expectedStatus, `${testCase.id}: unknown error case`);
    assert.equal(testCase.expected.status, expectedStatus);
    assert.deepEqual(
      Object.keys(testCase.expected.headers).sort(),
      expectedStatus === 405
        ? ["Allow", "Cache-Control", "Content-Type", "X-Request-ID"]
        : ["Cache-Control", "Content-Type", "X-Request-ID"],
    );
    if (expectedStatus === 405) assert.equal(testCase.expected.headers.Allow, "GET");
    assert.equal(testCase.expected.headers["Cache-Control"], "no-store");
    assert.equal(testCase.expected.headers["Content-Type"], "application/json");
    assert.equal(
      testCase.expected.headers["X-Request-ID"],
      testCase.expected.body.meta.requestId,
    );
    assert(
      validators.error(testCase.expected.body),
      `${testCase.id}: ${JSON.stringify(validators.error.errors)}`,
    );
    assert.equal(
      testCase.expected.body.error.code,
      expectedErrorCodes.get(expectedStatus),
    );
    assert(!Object.hasOwn(testCase.expected.body, "data"));
    assert(!Object.hasOwn(testCase.expected.body.meta, "dataVersion"));
  }
}

function verifyInvalidMatrix(document, base, validators) {
  assert.equal(document.kind, "catalog-invalid-matrix");
  assert.equal(document.base, "cases/success-empty.json");
  assertUnique(document.cases.map(({ id }) => id), "invalid cases");
  const requiredFamilies = new Set([
    "unknown-position-kind",
    "unknown-group-kind",
    "unknown-rule-kind",
    "unknown-position-capability",
    "staff-has-cast-field",
    "position-order-drift",
    "group-order-drift",
    "member-order-drift",
    "rule-order-drift",
    "category-order-drift",
    "capability-order-drift",
    "duplicate-position",
    "duplicate-group-member",
    "dangling-group-member",
    "cross-type-group-member",
    "hidden-position-in-group",
    "malformed-localized-name",
    "unexpected-cast-key",
    "cast-on-book",
    "unresolved-raw-credit",
    "unknown-response-property",
    "malformed-data-version",
    "label-over-boundary",
    "selection-rule-key-max-boundary",
    "selection-rule-key-over-boundary",
    "selection-rule-value-max-boundary",
    "selection-rule-value-over-boundary",
    "filter-matrix-drift",
    "sort-matrix-drift",
  ]);
  for (const testCase of document.cases) {
    requiredFamilies.delete(testCase.id);
    let operations = testCase.patch;
    if (testCase.generatedPatch) {
      const generated = clone(testCase.generatedPatch);
      generated.value = generated.value.repeat(generated.repeat);
      delete generated.repeat;
      operations = [generated];
    }
    const candidate = applyPatch(base, operations);
    const schemaValid = validators.success(candidate.expected.body);
    if (testCase.outcome === "schema-valid-boundary") {
      assert.equal(schemaValid, true, `${testCase.id}: expected schema acceptance`);
    } else if (testCase.outcome === "schema-invalid") {
      assert.equal(schemaValid, false, `${testCase.id}: expected schema rejection`);
    } else {
      assert.equal(schemaValid, true, `${testCase.id}: must reach semantics`);
      assert.throws(
        () => verifyCatalogSemantics(candidate),
        `${testCase.id}: expected semantic rejection`,
      );
    }
  }
  assert.deepEqual([...requiredFamilies], [], "invalid coverage");
}

function verifyOpenapi(openapi) {
  assert.equal(openapi.openapi, "3.1.0");
  assert(openapi.paths["/catalog"], "catalog authority path");
  const operation = openapi.paths["/catalog"].get;
  assert(operation);
  assert.deepEqual(operation.security, []);
  assert(!Object.hasOwn(operation, "parameters"));
  assert(!Object.hasOwn(operation, "requestBody"));
  assert.deepEqual(Object.keys(operation.responses).sort(), [
    "200",
    "400",
    "405",
    "500",
    "503",
    "504",
  ]);
  const catalogComponents = Object.keys(openapi.components.schemas)
    .filter((name) => name.startsWith("Catalog") && name !== "CatalogContextV1")
    .sort();
  assert.deepEqual(catalogComponents, expectedCatalogComponents);
  const schemas = openapi.components.schemas;
  assert.deepEqual(schemas.CatalogSectionV1.enum, ["works", "characters"]);
  for (const name of ["positions", "groups", "selectionRules"]) {
    assert.equal(schemas.CatalogDataV1.properties[name].maxItems, 50260);
  }
  assert(!Object.hasOwn(schemas.CatalogStaffPositionV1.properties, "exclusiveGroup"));
  assert(!Object.hasOwn(schemas.CatalogStaffSetPositionV1.properties, "exclusiveGroup"));
  assert(
    schemas.CatalogCastPositionV1.required.includes("exclusiveGroup"),
    "cast exclusiveGroup",
  );
  assert.equal(
    schemas.CatalogSelectionRuleV1.properties.key.maxLength,
    101,
    "selection-rule key bound",
  );
  assert.equal(
    schemas.CatalogSelectionRuleV1.properties.value.maxLength,
    7423,
    "selection-rule value bound",
  );
  assert.deepEqual(
    {
      minLength: schemas.CatalogMetaV1.properties.dataVersion.minLength,
      maxLength: schemas.CatalogMetaV1.properties.dataVersion.maxLength,
      pattern: schemas.CatalogMetaV1.properties.dataVersion.pattern,
    },
    {
      minLength: 68,
      maxLength: 68,
      pattern: "^dv1-[0-9a-f]{64}$",
    },
    "catalog dataVersion identity",
  );
  assert.deepEqual(
    schemas.CatalogPositionV1.discriminator.mapping,
    {
      staff: "#/components/schemas/CatalogStaffPositionV1",
      cast: "#/components/schemas/CatalogCastPositionV1",
      staffSet: "#/components/schemas/CatalogStaffSetPositionV1",
    },
  );
  assert.equal(
    semanticDigest(
      Object.fromEntries(
        queryComponentNames.map((name) => [name, schemas[name]]),
      ),
    ),
    expectedQueryComponentSeal,
    "shared query component seal",
  );
  assert.equal(
    semanticDigest(openapi.paths["/catalog"].get.responses),
    expectedCatalogResponseSeal,
    "catalog response seal",
  );
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? goldenRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: path.join(goldenRoot, ".cache/home"),
      XDG_CACHE_HOME: path.join(goldenRoot, ".cache/xdg"),
      npm_config_cache: path.join(goldenRoot, ".cache/npm"),
      GOCACHE: path.join(goldenRoot, ".cache/go-build"),
      GOMODCACHE: path.join(goldenRoot, ".cache/go-mod"),
    },
  });
  if (result.status !== 0) {
    fail(
      `${command} ${args.join(" ")} failed (${result.status})\n${result.stdout}\n${result.stderr}`,
    );
  }
  return result;
}

function collectInternalComponents(openapi) {
  const pending = ["CatalogSuccessEnvelopeV1", "ErrorEnvelopeV1"];
  const selected = new Set();
  while (pending.length > 0) {
    const name = pending.pop();
    if (selected.has(name)) continue;
    selected.add(name);
    const schema = openapi.components.schemas[name];
    assert(schema, `missing component ${name}`);
    const visit = (value) => {
      if (Array.isArray(value)) return value.forEach(visit);
      if (value === null || typeof value !== "object") return;
      if (
        typeof value.$ref === "string" &&
        value.$ref.startsWith("#/components/schemas/")
      ) {
        pending.push(value.$ref.split("/").at(-1));
      }
      Object.values(value).forEach(visit);
    };
    visit(schema);
  }
  return [...selected].sort();
}

function resetDisposable(root) {
  const resolved = path.resolve(root);
  assert(
    resolved.startsWith(`${path.resolve(goldenRoot)}${path.sep}`),
    "disposable root containment",
  );
  if (fs.existsSync(resolved)) {
    fs.lstatSync(resolved).isSymbolicLink() && fail("disposable symlink");
    fs.rmSync(resolved, { recursive: true });
  }
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

function cleanupDisposables() {
  const makeWritable = (target) => {
    const metadata = fs.lstatSync(target);
    if (metadata.isSymbolicLink()) return;
    if (metadata.isDirectory()) {
      fs.chmodSync(target, 0o700);
      for (const entry of fs.readdirSync(target)) {
        makeWritable(path.join(target, entry));
      }
    } else {
      assert(metadata.isFile(), `${target}: cleanup non-regular entry`);
      fs.chmodSync(target, 0o600);
    }
  };
  for (const name of disposableNames) {
    const target = path.join(goldenRoot, name);
    if (!fs.existsSync(target)) continue;
    const metadata = fs.lstatSync(target);
    assert(!metadata.isSymbolicLink(), `${name}: cleanup symlink forbidden`);
    assert(metadata.isDirectory(), `${name}: cleanup target must be a directory`);
    makeWritable(target);
    fs.rmSync(target, { recursive: true });
  }
}

function generateCatalog(openapi, generation) {
  const temporaryRoot = resetDisposable(path.join(goldenRoot, ".tmp"));
  const componentNames = collectInternalComponents(openapi);
  assert.deepEqual(componentNames, generation.projection.components);
  const outputEvidence = [];
  for (const replay of ["a", "b"]) {
    const root = path.join(temporaryRoot, replay);
    const sourceOpenapi = path.join(root, "source/openapi");
    const sourceSchemas = path.join(root, "source/schemas/query");
    fs.mkdirSync(sourceOpenapi, { recursive: true });
    fs.mkdirSync(sourceSchemas, { recursive: true });
    const projection = {
      openapi: openapi.openapi,
      info: {
        ...openapi.info,
        description:
          "Shared query contracts and the input-free dynamic catalog endpoint.",
      },
      paths: { "/catalog": openapi.paths["/catalog"] },
      components: {
        schemas: Object.fromEntries(
          componentNames.map((name) => [name, openapi.components.schemas[name]]),
        ),
      },
    };
    fs.writeFileSync(
      path.join(sourceOpenapi, "openapi.yaml"),
      `${JSON.stringify(projection, null, 2)}\n`,
    );
    const errorSchema = readJson(errorSchemaPath);
    delete errorSchema.$id;
    delete errorSchema.$schema;
    fs.writeFileSync(
      path.join(sourceSchemas, "error-envelope-v1.schema.json"),
      `${JSON.stringify(errorSchema, null, 2)}\n`,
    );
    fs.writeFileSync(path.join(root, "redocly.yaml"), "{}\n");
    const redocly = path.join(goldenRoot, "node_modules/.bin/redocly");
    run(
      redocly,
      [
        "bundle",
        "source/openapi/openapi.yaml",
        "--config",
        "redocly.yaml",
        "--output",
        "catalog.bundle.json",
      ],
      { cwd: root },
    );
    const output = path.join(root, "catalog.gen.go");
    run(
      "go",
      [
        "run",
        "github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen@v2.8.0",
        "-generate",
        "models,skip-prune",
        "-package",
        "catalogwire",
        "-o",
        output,
        path.join(root, "catalog.bundle.json"),
      ],
      { cwd: repositoryRoot },
    );
    const bytes = readRegular(output);
    const source = decodeUtf8(bytes, output);
    const declarations = [...source.matchAll(/^type ([A-Za-z0-9_]+) /gm)].map(
      (match) => match[1],
    );
    outputEvidence.push({
      bytes: bytes.length,
      sha256: sha256(bytes),
      declarations,
    });
  }
  assert.deepEqual(outputEvidence[0], outputEvidence[1], "Go generation replay");
  assert.deepEqual(outputEvidence[0], generation.go.output);
  const compileRoot = path.join(temporaryRoot, "compile");
  fs.mkdirSync(compileRoot, { recursive: true });
  fs.copyFileSync(
    path.join(temporaryRoot, "a/catalog.gen.go"),
    path.join(compileRoot, "catalog.gen.go"),
  );
  fs.writeFileSync(
    path.join(compileRoot, "go.mod"),
    [
      "module example.invalid/catalogwire",
      "",
      "go 1.25.0",
      "",
      "require github.com/oapi-codegen/runtime v1.1.2",
      "",
    ].join("\n"),
  );
  run("go", ["test", "-mod=mod", "./..."], { cwd: compileRoot });
  fs.rmSync(temporaryRoot, { recursive: true });
}

function verifyGeneration(openapi) {
  const generation = readJson(generationPath);
  assert.equal(generation.schemaVersion, 1);
  assert.equal(generation.kind, "catalog-generation-evidence");
  assert.equal(generation.tools.redocly.version, "2.40.0");
  assert.equal(generation.tools.oapiCodegen.version, "2.8.0");
  assert.equal(generation.tools.oapiRuntime.version, "1.1.2");
  assert.deepEqual(generation.openapi.responses, ["200", "400", "405", "500", "503", "504"]);
  const componentNames = collectInternalComponents(openapi);
  const ownedProjection = {
    openapi: openapi.openapi,
    info: {
      ...openapi.info,
      description:
        "Shared query contracts and the input-free dynamic catalog endpoint.",
    },
    paths: {
      "/catalog": {
        get: {
          ...openapi.paths["/catalog"].get,
          responses: {
            "200": openapi.paths["/catalog"].get.responses["200"],
          },
        },
      },
    },
    components: {
      schemas: Object.fromEntries(
        componentNames.map((name) => [name, openapi.components.schemas[name]]),
      ),
    },
  };
  assert.equal(
    generation.projection.sha256,
    sha256(Buffer.from(`${JSON.stringify(ownedProjection, null, 2)}\n`)),
  );
  run(path.join(goldenRoot, "node_modules/.bin/redocly"), [
    "lint",
    openapiPath,
  ]);
  generateCatalog(openapi, generation);
}

function verify() {
  const index = verifyClosedIndex();
  selfTestFailClosedGuards(index);
  const openapi = readJson(openapiPath);
  const errorSchema = readJson(errorSchemaPath);
  verifyOpenapi(openapi);
  const validators = createValidators(openapi, errorSchema);
  const base = readJson(path.join(goldenRoot, "cases/success-empty.json"));
  verifySuccessFixture(base, validators);
  const syntheticDocument = readJson(
    path.join(goldenRoot, "cases/success-synthetic.json"),
  );
  const synthetic = materializeSynthetic(syntheticDocument, base);
  verifySuccessFixture(synthetic, validators);
  verifyErrors(readJson(path.join(goldenRoot, "cases/errors.json")), validators);
  verifyInvalidMatrix(
    readJson(path.join(goldenRoot, "cases/invalid.json")),
    base,
    validators,
  );
  verifyGeneration(openapi);
  cleanupDisposables();
  for (const disposable of disposableNames) {
    assert(
      !fs.existsSync(path.join(goldenRoot, disposable)),
      `${disposable}: residue`,
    );
  }
  console.log(
    JSON.stringify({
      files: index.files.length,
      successCases: 2,
      errorCases: expectedStatuses.size,
      invalidCases: 36,
      openapiSha256: sha256(readRegular(openapiPath)),
      indexSha256: sha256(readRegular(indexPath)),
      queryComponentsPreserved: true,
      responseComponentsPreserved: true,
      deterministicGoGeneration: true,
      temporaryCompile: true,
    }),
  );
}

try {
  verify();
} finally {
  cleanupDisposables();
}
