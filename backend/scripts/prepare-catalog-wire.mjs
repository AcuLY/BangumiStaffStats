import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptFile = fileURLToPath(import.meta.url);
const backendRoot = path.resolve(path.dirname(scriptFile), "..");
const repositoryRoot = path.resolve(backendRoot, "..");
const authorityOpenAPI = path.join(
  repositoryRoot,
  "contracts",
  "openapi",
  "openapi.yaml",
);
const authorityErrorSchema = path.join(
  repositoryRoot,
  "contracts",
  "schemas",
  "query",
  "error-envelope-v1.schema.json",
);
const allowedRoot = path.join(
  backendRoot,
  ".tmp",
  "catalog-wire",
  "projection",
);
const expectedComponents = [
  "CatalogCastPositionV1",
  "CatalogDataV1",
  "CatalogFilterCapabilityV1",
  "CatalogGroupV1",
  "CatalogLocalizedNamesV1",
  "CatalogMetaV1",
  "CatalogOperationApplicabilityV1",
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

const [targetArgument] = process.argv.slice(2);
if (typeof targetArgument !== "string" || process.argv.length !== 3) {
  throw new Error("usage: node prepare-catalog-wire.mjs <projection-root>");
}
const projectionRoot = path.resolve(targetArgument);
assert.equal(
  projectionRoot,
  path.resolve(allowedRoot),
  "catalog projection must use the owned disposable root",
);
if (fs.existsSync(projectionRoot)) {
  assert(!fs.lstatSync(projectionRoot).isSymbolicLink());
  fs.rmSync(projectionRoot, { recursive: true });
}

const authority = JSON.parse(readRegular(authorityOpenAPI).toString("utf8"));
assert.equal(authority.openapi, "3.1.0");
assert.equal(authority.paths["/catalog"]?.get?.operationId, "getCatalogV1");
const selected = collectComponents(authority);
assert.deepEqual(selected, expectedComponents);

const sourceOpenAPI = path.join(projectionRoot, "source", "openapi");
const sourceSchemas = path.join(projectionRoot, "source", "schemas", "query");
fs.mkdirSync(sourceOpenAPI, { recursive: true });
fs.mkdirSync(sourceSchemas, { recursive: true });
const projection = {
  openapi: authority.openapi,
  info: {
    ...authority.info,
    description:
      "Shared query contracts and the input-free dynamic catalog endpoint.",
  },
  paths: {
    "/catalog": {
      get: {
        ...authority.paths["/catalog"].get,
        responses: {
          "200": authority.paths["/catalog"].get.responses["200"],
        },
      },
    },
  },
  components: {
    schemas: Object.fromEntries(
      selected.map((name) => [name, authority.components.schemas[name]]),
    ),
  },
};
fs.writeFileSync(
  path.join(sourceOpenAPI, "openapi.yaml"),
  `${JSON.stringify(projection, null, 2)}\n`,
);
const errorSchema = JSON.parse(readRegular(authorityErrorSchema).toString("utf8"));
delete errorSchema.$id;
delete errorSchema.$schema;
fs.writeFileSync(
  path.join(sourceSchemas, "error-envelope-v1.schema.json"),
  `${JSON.stringify(errorSchema, null, 2)}\n`,
);
fs.writeFileSync(path.join(projectionRoot, "redocly.yaml"), "{}\n");

function collectComponents(openAPI) {
  const pending = ["CatalogSuccessEnvelopeV1"];
  const selected = new Set();
  while (pending.length > 0) {
    const name = pending.pop();
    if (selected.has(name)) continue;
    assert(openAPI.components?.schemas?.[name], `missing schema ${name}`);
    selected.add(name);
    walk(openAPI.components.schemas[name], (reference) => {
      if (reference.startsWith("#/components/schemas/")) {
        pending.push(reference.split("/").at(-1));
      }
    });
  }
  return [...selected].sort();
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

function readRegular(filename) {
  const metadata = fs.lstatSync(filename);
  assert(metadata.isFile() && !metadata.isSymbolicLink(), `${filename}: file`);
  return fs.readFileSync(filename);
}
