import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptFile = fileURLToPath(import.meta.url);
const backendRoot = path.resolve(path.dirname(scriptFile), "..");
const repositoryRoot = path.resolve(backendRoot, "..");
const authorityPath = path.join(repositoryRoot, "contracts/openapi/openapi.yaml");
const schemaRoot = path.join(repositoryRoot, "contracts/schemas");
const allowedRoots = new Set([
  path.join(backendRoot, ".tmp", "co-star-wire", "projection"),
  path.join(repositoryRoot, "frontend", ".tmp", "co-star-wire", "projection"),
]);
const coStarInfo = {
  title: "BangumiStaffStats Co-Star API",
  version: "1.0.0",
  description:
    "Pair/group co-star contracts over real raw-Subject Archive intersections.",
};

const [targetArgument] = process.argv.slice(2);
if (typeof targetArgument !== "string" || process.argv.length !== 3) {
  throw new Error("usage: node prepare-co-star-wire.mjs <projection-root>");
}
const projectionRoot = path.resolve(targetArgument);
assert(allowedRoots.has(projectionRoot), "unexpected co-star projection root");
resetDirectory(projectionRoot);

const authority = JSON.parse(readRegular(authorityPath).toString("utf8"));
assert.equal(authority.openapi, "3.1.0");
const operation = authority.paths["/co-star"]?.post;
assert.equal(operation?.operationId, "postCoStarV1");
const selected = collectLocalComponents(authority, authority.paths["/co-star"]);
for (const required of [
  "CoStarRequestV1",
  "CoStarSuccessEnvelopeV1",
  "CoStarResultErrorEnvelopeV1",
]) {
  assert(selected.schemas.includes(required), `missing schema component ${required}`);
}

const projection = buildProjection(authority, selected);
const externalSchemas = collectExternalSchemas(projection);
const projectionSha256 = sha256(
  Buffer.from(canonical({ projection, externalSchemas })),
);
const sourceRoot = path.join(projectionRoot, "source");
const openAPIRoot = path.join(sourceRoot, "openapi");
fs.mkdirSync(openAPIRoot, { recursive: true });
fs.writeFileSync(
  path.join(openAPIRoot, "openapi.yaml"),
  `${JSON.stringify(projection, null, 2)}\n`,
);
copySchemas("query");
copySchemas("rankings");
copySchemas("person-detail");
copySchemas("co-star");
fs.writeFileSync(path.join(projectionRoot, "redocly.yaml"), "{}\n");
fs.writeFileSync(
  path.join(projectionRoot, "oapi-codegen.yaml"),
  [
    "package: wire",
    "generate:",
    "  models: true",
    "compatibility:",
    "  always-prefix-enum-values: true",
    "output-options:",
    "  skip-prune: true",
    "",
  ].join("\n"),
);
fs.writeFileSync(
  path.join(projectionRoot, "projection-sha256.txt"),
  `${projectionSha256}\n`,
);
console.log(JSON.stringify({ ...selected, projectionSha256 }));

function buildProjection(openapi, components) {
  return {
    openapi: openapi.openapi,
    jsonSchemaDialect: openapi.jsonSchemaDialect,
    info: coStarInfo,
    paths: {
      "/co-star": openapi.paths["/co-star"],
    },
    components: {
      schemas: pick(openapi.components.schemas, components.schemas),
      headers: pick(openapi.components.headers, components.headers),
      responses: pick(openapi.components.responses, components.responses),
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
      `external co-star schema outside authority root: ${filename}`,
    );
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

function copySchemas(name) {
  const source = path.join(schemaRoot, name);
  const destination = path.join(sourceRoot, "schemas", name);
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".schema.json")) continue;
    const document = JSON.parse(
      readRegular(path.join(source, entry.name)).toString("utf8"),
    );
    delete document.$id;
    delete document.$schema;
    normalizeTupleSchemas(document);
    fs.writeFileSync(
      path.join(destination, entry.name),
      `${JSON.stringify(document, null, 2)}\n`,
    );
  }
}

function normalizeTupleSchemas(value) {
  if (Array.isArray(value)) {
    value.forEach(normalizeTupleSchemas);
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value.prefixItems) && value.items === false) {
    value.items = { oneOf: value.prefixItems };
    delete value.prefixItems;
  }
  Object.values(value).forEach(normalizeTupleSchemas);
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
