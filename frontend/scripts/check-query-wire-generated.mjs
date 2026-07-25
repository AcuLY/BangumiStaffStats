import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { createClient } from '@hey-api/openapi-ts';

import config from '../openapi-ts.config.mjs';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(frontendRoot, '..');
const temporaryBase = path.join(frontendRoot, '.tmp/query-wire-check');
const temporaryRoot = path.join(temporaryBase, 'generated');
const temporaryFile = path.join(temporaryRoot, 'types.gen.ts');
const projectionOpenAPI = path.join(
  temporaryBase,
  'source/openapi/openapi.yaml',
);
const projectionSchemaRoot = path.join(
  temporaryBase,
  'source/schemas/query',
);
const committedFile = path.join(
  frontendRoot,
  'src/api/generated/query-wire/types.gen.ts',
);
const authorityOpenAPI = path.join(
  repositoryRoot,
  'contracts/openapi/openapi.yaml',
);
const authoritySchemaRoot = path.join(
  repositoryRoot,
  'contracts/schemas/query',
);
const manifestPath = path.join(
  repositoryRoot,
  'contracts/goldens/query/manifest.json',
);

function fail(message) {
  throw new Error(message);
}

function listFiles(root) {
  if (!fs.existsSync(root)) {
    return [];
  }
  return fs
    .readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)))
    .sort();
}

function removeTemporaryRoot() {
  fs.rmSync(temporaryBase, { force: true, recursive: true });
  const disposableRoot = path.dirname(temporaryBase);
  if (
    fs.existsSync(disposableRoot) &&
    fs.readdirSync(disposableRoot).length === 0
  ) {
    fs.rmdirSync(disposableRoot);
  }
}

function prepareProjection(componentNames) {
  const authority = JSON.parse(fs.readFileSync(authorityOpenAPI, 'utf8'));
  const missing = componentNames.filter(
    (name) => !authority.components?.schemas?.[name],
  );
  if (missing.length > 0) {
    fail(`query projection is missing components: ${missing.join(', ')}`);
  }
  const projection = {
    openapi: authority.openapi,
    info: authority.info,
    servers: authority.servers,
    paths: {},
    components: {
      schemas: Object.fromEntries(
        Object.entries(authority.components.schemas).filter(([name]) =>
          componentNames.includes(name),
        ),
      ),
    },
  };
  fs.mkdirSync(path.dirname(projectionOpenAPI), { recursive: true });
  fs.mkdirSync(projectionSchemaRoot, { recursive: true });
  fs.writeFileSync(
    projectionOpenAPI,
    `${JSON.stringify(projection, null, 2)}\n`,
  );
  for (const entry of fs.readdirSync(authoritySchemaRoot, {
    withFileTypes: true,
  })) {
    if (entry.isFile() && entry.name.endsWith('.schema.json')) {
      fs.copyFileSync(
        path.join(authoritySchemaRoot, entry.name),
        path.join(projectionSchemaRoot, entry.name),
      );
    }
  }
}

if (process.version !== 'v24.18.0') {
  fail(`generated drift check requires Node v24.18.0, received ${process.version}`);
}
if (!fs.existsSync(committedFile)) {
  fail('committed query wire types are missing');
}

removeTemporaryRoot();
process.chdir(frontendRoot);

try {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const names = manifest.openapi.componentSchemas.names;
  prepareProjection(names);
  await createClient({
    ...config,
    input: projectionOpenAPI,
    output: {
      ...config.output,
      path: temporaryRoot,
    },
  });

  const files = listFiles(temporaryRoot);
  if (files.length !== 1 || files[0] !== 'types.gen.ts') {
    fail(`unexpected check-mode inventory: ${JSON.stringify(files)}`);
  }

  const source = fs.readFileSync(temporaryFile, 'utf8');
  const exports = new Set(
    [...source.matchAll(/^export type ([A-Za-z_$][\w$]*)/gm)].map(
      (match) => match[1],
    ),
  );
  const missing = names.filter((name) => !exports.has(name));
  if (
    manifest.openapi.paths !== 0 ||
    names.length !== 17 ||
    missing.length > 0
  ) {
    fail(`generated component mismatch: missing ${missing.join(', ')}`);
  }
  if (
    /^(?:import|export\s+(?:const|function|class|enum)|const|function|class|enum)\b/m.test(
      source,
    )
  ) {
    fail('check-mode output contains runtime declarations');
  }

  const expected = fs.readFileSync(committedFile, 'utf8');
  const actual = fs.readFileSync(temporaryFile, 'utf8');
  if (expected !== actual) {
    const expectedLines = expected.split('\n');
    const actualLines = actual.split('\n');
    const line = expectedLines.findIndex(
      (value, index) => value !== actualLines[index],
    );
    fail(
      `generated query wire differs at line ${line + 1}: expected=${JSON.stringify(expectedLines[line])} actual=${JSON.stringify(actualLines[line])}`,
    );
  }

  console.log(`query wire drift check passed: ${names.length} components`);
} finally {
  removeTemporaryRoot();
}
