import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { createClient } from '@hey-api/openapi-ts';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(frontendRoot, '..');
const authorityPath = path.join(repositoryRoot, 'contracts/openapi/openapi.yaml');
const temporaryRoot = path.join(frontendRoot, '.tmp/rankings-wire');
const projectionPath = path.join(temporaryRoot, 'source/openapi/openapi.yaml');
const generatedRoot = path.join(frontendRoot, 'src/api/generated/rankings');
const expectedFiles = ['schemas.gen.ts', 'types.gen.ts'];
const rankingsInfoDescription =
  'Rankings request and result contracts for immutable Archive-backed queries.';

if (process.version !== 'v24.18.0') {
  throw new Error(
    `rankings wire generation requires Node v24.18.0, received ${process.version}`,
  );
}

const authority = JSON.parse(readRegular(authorityPath).toString('utf8'));
assert.equal(authority.openapi, '3.1.0');
assert.equal(authority.paths['/rankings']?.post?.operationId, 'postRankingsV1');

const selected = collectLocalComponents(authority, authority.paths['/rankings']);
assert.deepEqual(selected.schemas, [
  'RankingsRequestV1',
  'RankingsSuccessEnvelopeV1',
  'ResultErrorEnvelopeV1',
]);
assert.deepEqual(selected.headers, ['PrivateNoStoreV1', 'RequestIDV1']);
assert.deepEqual(selected.responses, [
  'ResultBadGatewayErrorV1',
  'ResultBadRequestErrorV1',
  'ResultForbiddenErrorV1',
  'ResultGatewayTimeoutErrorV1',
  'ResultInternalErrorV1',
  'ResultMethodNotAllowedErrorV1',
  'ResultNotFoundErrorV1',
  'ResultPayloadTooLargeErrorV1',
  'ResultRateLimitedErrorV1',
  'ResultServiceUnavailableErrorV1',
  'ResultUnsupportedMediaTypeErrorV1',
]);

const projection = {
  openapi: authority.openapi,
  jsonSchemaDialect: authority.jsonSchemaDialect,
  info: {
    ...authority.info,
    description: rankingsInfoDescription,
  },
  servers: authority.servers,
  paths: {
    '/rankings': authority.paths['/rankings'],
  },
  components: {
    schemas: pick(authority.components.schemas, selected.schemas),
    headers: pick(authority.components.headers, selected.headers),
    responses: pick(authority.components.responses, selected.responses),
  },
};

removeTemporaryRoot();
fs.mkdirSync(path.dirname(projectionPath), { recursive: true });
fs.writeFileSync(projectionPath, `${JSON.stringify(projection, null, 2)}\n`);
copySchemaDirectory('query');
copySchemaDirectory('rankings');

try {
  await createClient({
    input: projectionPath,
    output: {
      path: generatedRoot,
      clean: true,
      entryFile: false,
      fileName: {
        suffix: '.gen',
      },
      source: false,
    },
    plugins: [
      {
        name: '@hey-api/typescript',
        enums: false,
        topType: 'unknown',
      },
      {
        name: '@hey-api/schemas',
        type: 'json',
      },
    ],
  });
} finally {
  removeTemporaryRoot();
}

assert.deepEqual(inventory(generatedRoot), expectedFiles);
const types = fs.readFileSync(path.join(generatedRoot, 'types.gen.ts'), 'utf8');
for (const name of [
  'RankingsRequestV1',
  'RankingsSuccessEnvelopeV1',
  'ResultErrorEnvelopeV1',
]) {
  assert.match(types, new RegExp(`^export type ${name}\\b`, 'm'));
}
console.log(
  `rankings wire generated: ${selected.schemas.length} components, ${expectedFiles.join(', ')}`,
);

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
  if (value === null || typeof value !== 'object') return;
  if (typeof value.$ref === 'string') visitor(value.$ref);
  Object.values(value).forEach((child) => walk(child, visitor));
}

function pick(values, names) {
  return Object.fromEntries(names.map((name) => [name, values[name]]));
}

function copySchemaDirectory(name) {
  const source = path.join(repositoryRoot, 'contracts/schemas', name);
  const destination = path.join(temporaryRoot, 'source/schemas', name);
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.schema.json')) {
      fs.copyFileSync(path.join(source, entry.name), path.join(destination, entry.name));
    }
  }
}

function inventory(root) {
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)))
    .sort();
}

function readRegular(filename) {
  const metadata = fs.lstatSync(filename);
  assert(metadata.isFile() && !metadata.isSymbolicLink(), `${filename}: regular`);
  return fs.readFileSync(filename);
}

function removeTemporaryRoot() {
  if (fs.existsSync(temporaryRoot) && !fs.lstatSync(temporaryRoot).isSymbolicLink()) {
    fs.rmSync(temporaryRoot, { recursive: true });
  }
  const disposableRoot = path.dirname(temporaryRoot);
  if (fs.existsSync(disposableRoot) && fs.readdirSync(disposableRoot).length === 0) {
    fs.rmdirSync(disposableRoot);
  }
}
