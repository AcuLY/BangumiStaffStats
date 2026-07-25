import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptFile = fileURLToPath(import.meta.url);
const backendRoot = path.resolve(path.dirname(scriptFile), "..");
const repositoryRoot = path.resolve(backendRoot, "..");
const authorityPath = path.join(repositoryRoot, "contracts/openapi/openapi.yaml");
const allowedRoot = path.join(backendRoot, ".tmp", "rankings-wire", "projection");
const rankingsInfoDescription =
  "Rankings request and result contracts for immutable Archive-backed queries.";
const expected = {
  schemas: [
    "RankingsRequestV1",
    "RankingsSuccessEnvelopeV1",
    "ResultErrorEnvelopeV1",
  ],
  headers: ["PrivateNoStoreV1", "RequestIDV1"],
  responses: [
    "ResultBadGatewayErrorV1",
    "ResultBadRequestErrorV1",
    "ResultForbiddenErrorV1",
    "ResultGatewayTimeoutErrorV1",
    "ResultInternalErrorV1",
    "ResultMethodNotAllowedErrorV1",
    "ResultNotFoundErrorV1",
    "ResultPayloadTooLargeErrorV1",
    "ResultRateLimitedErrorV1",
    "ResultServiceUnavailableErrorV1",
    "ResultUnsupportedMediaTypeErrorV1",
  ],
};

const [targetArgument] = process.argv.slice(2);
if (typeof targetArgument !== "string" || process.argv.length !== 3) {
  throw new Error("usage: node prepare-rankings-wire.mjs <projection-root>");
}
const projectionRoot = path.resolve(targetArgument);
assert.equal(projectionRoot, allowedRoot, "unexpected rankings projection root");
resetDirectory(projectionRoot);

const authority = JSON.parse(readRegular(authorityPath).toString("utf8"));
assert.equal(authority.openapi, "3.1.0");
assert.equal(authority.paths["/rankings"]?.post?.operationId, "postRankingsV1");
const selected = collectLocalComponents(authority, authority.paths["/rankings"]);
assert.deepEqual(selected, expected);

const projection = {
  openapi: authority.openapi,
  jsonSchemaDialect: authority.jsonSchemaDialect,
  info: {
    ...authority.info,
    description: rankingsInfoDescription,
  },
  servers: authority.servers,
  paths: {
    "/rankings": authority.paths["/rankings"],
  },
  components: {
    schemas: pick(authority.components.schemas, selected.schemas),
    headers: pick(authority.components.headers, selected.headers),
    responses: pick(authority.components.responses, selected.responses),
  },
};
const sourceRoot = path.join(projectionRoot, "source");
const openAPIRoot = path.join(sourceRoot, "openapi");
fs.mkdirSync(openAPIRoot, { recursive: true });
fs.writeFileSync(
  path.join(openAPIRoot, "openapi.yaml"),
  `${JSON.stringify(projection, null, 2)}\n`,
);
copySchemas("query");
copySchemas("rankings");
fs.writeFileSync(path.join(projectionRoot, "redocly.yaml"), "{}\n");
console.log(JSON.stringify(selected));

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

function copySchemas(name) {
  const source = path.join(repositoryRoot, "contracts", "schemas", name);
  const destination = path.join(sourceRoot, "schemas", name);
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".schema.json")) continue;
    const document = JSON.parse(
      readRegular(path.join(source, entry.name)).toString("utf8"),
    );
    delete document.$id;
    delete document.$schema;
    fs.writeFileSync(
      path.join(destination, entry.name),
      `${JSON.stringify(document, null, 2)}\n`,
    );
  }
}

function resetDirectory(target) {
  if (fs.existsSync(target)) {
    assert(!fs.lstatSync(target).isSymbolicLink());
    fs.rmSync(target, { recursive: true });
  }
  fs.mkdirSync(target, { recursive: true });
}

function readRegular(filename) {
  const metadata = fs.lstatSync(filename);
  assert(metadata.isFile() && !metadata.isSymbolicLink(), `${filename}: regular`);
  return fs.readFileSync(filename);
}
