import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { createClient } from '@hey-api/openapi-ts';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(frontendRoot, '..');
const openapiPath = path.join(repositoryRoot, 'contracts/openapi/openapi.yaml');
const temporaryRoot = path.join(frontendRoot, '.tmp/catalog-wire');
const projectionPath = path.join(temporaryRoot, 'catalog.openapi.json');
const generatedRoot = path.join(frontendRoot, 'src/api/generated/catalog');

const expectedComponents = [
  'CatalogCastPositionV1',
  'CatalogDataV1',
  'CatalogFilterCapabilityV1',
  'CatalogGroupV1',
  'CatalogLocalizedNamesV1',
  'CatalogMetaV1',
  'CatalogOperationApplicabilityV1',
  'CatalogPositionCapabilityNameV1',
  'CatalogPositionV1',
  'CatalogRootSortCapabilityV1',
  'CatalogScopeV1',
  'CatalogSectionSortCapabilityV1',
  'CatalogSectionV1',
  'CatalogSelectionRuleV1',
  'CatalogSortCapabilityV1',
  'CatalogStaffPositionV1',
  'CatalogStaffSetPositionV1',
  'CatalogSubjectTypeKeyV1',
  'CatalogSubjectTypeV1',
  'CatalogSuccessEnvelopeV1',
];

function walk(value, visitor) {
  if (Array.isArray(value)) {
    value.forEach((item) => walk(item, visitor));
    return;
  }
  if (value === null || typeof value !== 'object') {
    return;
  }
  if (typeof value.$ref === 'string') {
    visitor(value.$ref);
  }
  Object.values(value).forEach((item) => walk(item, visitor));
}

function collectComponents(openapi) {
  const pending = ['CatalogSuccessEnvelopeV1'];
  const selected = new Set();
  while (pending.length > 0) {
    const name = pending.pop();
    if (selected.has(name)) {
      continue;
    }
    assert(openapi.components?.schemas?.[name], `missing schema ${name}`);
    selected.add(name);
    walk(openapi.components.schemas[name], (reference) => {
      if (reference.startsWith('#/components/schemas/')) {
        pending.push(reference.split('/').at(-1));
      }
    });
  }
  return [...selected].sort();
}

function removeTemporaryRoot() {
  if (fs.existsSync(temporaryRoot) && !fs.lstatSync(temporaryRoot).isSymbolicLink()) {
    fs.rmSync(temporaryRoot, { recursive: true });
  }
}

if (process.version !== 'v24.18.0') {
  throw new Error(
    `catalog wire generation requires Node v24.18.0, received ${process.version}`,
  );
}

const authority = JSON.parse(fs.readFileSync(openapiPath, 'utf8'));
assert.equal(authority.openapi, '3.1.0');
assert.equal(authority.paths['/catalog']?.get?.operationId, 'getCatalogV1');

const selected = collectComponents(authority);
assert.deepEqual(selected, expectedComponents);

const projection = {
  openapi: authority.openapi,
  info: {
    ...authority.info,
    description:
      'Shared query contracts and the input-free dynamic catalog endpoint.',
  },
  paths: {
    '/catalog': {
      get: {
        ...authority.paths['/catalog'].get,
        responses: {
          200: authority.paths['/catalog'].get.responses['200'],
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
const projectionBytes = Buffer.from(`${JSON.stringify(projection, null, 2)}\n`);

removeTemporaryRoot();
fs.mkdirSync(temporaryRoot, { recursive: true });
fs.writeFileSync(projectionPath, projectionBytes);

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

const inventory = fs
  .readdirSync(generatedRoot, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => path.relative(generatedRoot, path.join(entry.parentPath, entry.name)))
  .sort();
assert.deepEqual(inventory, ['schemas.gen.ts', 'types.gen.ts']);

console.log(
  `catalog wire generated: ${selected.length} components, ${inventory.join(', ')}`,
);
