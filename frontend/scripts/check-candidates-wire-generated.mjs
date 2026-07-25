import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const generatedRoot = path.join(frontendRoot, 'src/api/generated/candidates');
const temporaryRoot = path.join(frontendRoot, '.tmp/candidates-wire-committed');
const expectedFiles = ['schemas.gen.ts', 'types.gen.ts'];

if (process.version !== 'v24.18.0') {
  throw new Error(
    `candidates wire drift check requires Node v24.18.0, received ${process.version}`,
  );
}
assert.deepEqual(inventory(generatedRoot), expectedFiles);
removeTemporaryRoot();
fs.mkdirSync(path.dirname(temporaryRoot), { recursive: true });
fs.cpSync(generatedRoot, temporaryRoot, { recursive: true });

try {
  const result = spawnSync(
    process.execPath,
    [path.join(frontendRoot, 'scripts/generate-candidates-wire.mjs')],
    {
      cwd: frontendRoot,
      env: process.env,
      stdio: 'inherit',
    },
  );
  if (result.error) throw result.error;
  assert.equal(result.status, 0, 'candidates generator failed');
  assert.deepEqual(inventory(generatedRoot), expectedFiles);
  for (const filename of expectedFiles) {
    assert(
      fs.readFileSync(path.join(generatedRoot, filename)).equals(
        fs.readFileSync(path.join(temporaryRoot, filename)),
      ),
      `generated candidates file drifted: ${filename}`,
    );
  }
  console.log('candidates wire drift check passed');
} finally {
  fs.rmSync(generatedRoot, { recursive: true });
  fs.renameSync(temporaryRoot, generatedRoot);
  removeDisposableParent();
}

function inventory(root) {
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)))
    .sort();
}

function removeTemporaryRoot() {
  if (fs.existsSync(temporaryRoot) && !fs.lstatSync(temporaryRoot).isSymbolicLink()) {
    fs.rmSync(temporaryRoot, { recursive: true });
  }
  removeDisposableParent();
}

function removeDisposableParent() {
  const parent = path.dirname(temporaryRoot);
  if (fs.existsSync(parent) && fs.readdirSync(parent).length === 0) {
    fs.rmdirSync(parent);
  }
}
