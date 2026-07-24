import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(frontendRoot, '..');
const generatedRoot = path.join(
  frontendRoot,
  'src/api/generated/query-wire',
);
const generatedFile = path.join(generatedRoot, 'types.gen.ts');
const manifestPath = path.join(
  repositoryRoot,
  'contracts/goldens/query/manifest.json',
);
const cliPath = path.join(
  frontendRoot,
  'node_modules/@hey-api/openapi-ts/bin/run.js',
);

function fail(message) {
  throw new Error(message);
}

function assertExactNode() {
  if (process.version !== 'v24.18.0') {
    fail(`query wire generation requires Node v24.18.0, received ${process.version}`);
  }
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

function assertGeneratedContract() {
  const files = listFiles(generatedRoot);
  if (files.length !== 1 || files[0] !== 'types.gen.ts') {
    fail(`unexpected generated inventory: ${JSON.stringify(files)}`);
  }

  const source = fs.readFileSync(generatedFile, 'utf8');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const names = manifest.openapi.componentSchemas.names;
  const exports = new Set(
    [...source.matchAll(/^export type ([A-Za-z_$][\w$]*)/gm)].map(
      (match) => match[1],
    ),
  );
  const missing = names.filter((name) => !exports.has(name));
  if (names.length !== 17 || missing.length > 0) {
    fail(`generated component mismatch: missing ${missing.join(', ')}`);
  }
  if (
    /^(?:import|export\s+(?:const|function|class|enum)|const|function|class|enum)\b/m.test(
      source,
    )
  ) {
    fail('generated query wire contains runtime declarations');
  }
}

assertExactNode();

const result = spawnSync(
  process.execPath,
  [cliPath, '--file', './openapi-ts.config.mjs', '--no-log-file'],
  {
    cwd: frontendRoot,
    env: process.env,
    stdio: 'inherit',
  },
);

if (result.error) {
  throw result.error;
}
if (result.status !== 0) {
  fail(`openapi-ts exited with status ${String(result.status)}`);
}

assertGeneratedContract();
console.log('query wire generated: src/api/generated/query-wire/types.gen.ts');
