import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { createClient } from '@hey-api/openapi-ts';

import config from '../openapi-ts.config.mjs';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(frontendRoot, '..');
const temporaryRoot = path.join(frontendRoot, '.tmp/query-wire-check');
const temporaryFile = path.join(temporaryRoot, 'types.gen.ts');
const committedFile = path.join(
  frontendRoot,
  'src/api/generated/query-wire/types.gen.ts',
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
  fs.rmSync(temporaryRoot, { force: true, recursive: true });
  const disposableRoot = path.dirname(temporaryRoot);
  if (
    fs.existsSync(disposableRoot) &&
    fs.readdirSync(disposableRoot).length === 0
  ) {
    fs.rmdirSync(disposableRoot);
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
  await createClient({
    ...config,
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
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const names = manifest.openapi.componentSchemas.names;
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

  const expected = fs.readFileSync(committedFile);
  const actual = fs.readFileSync(temporaryFile);
  if (!expected.equals(actual)) {
    fail('generated query wire differs from committed types.gen.ts');
  }

  console.log(`query wire drift check passed: ${names.length} components`);
} finally {
  removeTemporaryRoot();
}
