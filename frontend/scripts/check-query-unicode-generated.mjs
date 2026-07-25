import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const generatedPath = path.join(
  frontendRoot,
  'src/features/query/unicode15_1.generated.ts',
);
const temporaryRoot = path.join(frontendRoot, '.tmp/query-unicode');
const committedPath = path.join(temporaryRoot, 'unicode15_1.generated.ts');

if (process.version !== 'v24.18.0') {
  throw new Error(
    `query Unicode drift check requires Node v24.18.0, received ${process.version}`,
  );
}
assert(fs.existsSync(generatedPath), 'generated query Unicode table is missing');

if (fs.existsSync(temporaryRoot)) {
  fs.rmSync(temporaryRoot, { recursive: true });
}
fs.mkdirSync(temporaryRoot, { recursive: true });
fs.copyFileSync(generatedPath, committedPath);

try {
  const result = spawnSync(
    process.execPath,
    [path.join(frontendRoot, 'scripts/generate-query-unicode.mjs')],
    {
      cwd: frontendRoot,
      env: process.env,
      stdio: 'inherit',
    },
  );
  if (result.error) {
    throw result.error;
  }
  assert.equal(result.status, 0, 'query Unicode generator failed');
  assert(
    fs.readFileSync(generatedPath).equals(fs.readFileSync(committedPath)),
    'generated query Unicode table drifted',
  );
  console.log('query Unicode drift check passed');
} finally {
  fs.copyFileSync(committedPath, generatedPath);
  fs.rmSync(temporaryRoot, { recursive: true });
  const disposableRoot = path.dirname(temporaryRoot);
  if (fs.existsSync(disposableRoot) && fs.readdirSync(disposableRoot).length === 0) {
    fs.rmdirSync(disposableRoot);
  }
}
