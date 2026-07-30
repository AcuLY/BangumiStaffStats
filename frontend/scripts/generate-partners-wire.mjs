import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { createClient } from '@hey-api/openapi-ts';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(frontendRoot, '..');
const temporaryRoot = path.join(frontendRoot, '.tmp/partners-wire');
const projectionRoot = path.join(temporaryRoot, 'projection');
const projectionPath = path.join(projectionRoot, 'source/openapi/openapi.yaml');
const projectionHashPath = path.join(projectionRoot, 'projection-sha256.txt');
const generatedRoot = path.join(frontendRoot, 'src/api/generated/partners');
const expectedFiles = ['schemas.gen.ts', 'types.gen.ts'];
const prepareScript = path.join(
  repositoryRoot,
  'backend/scripts/prepare-partners-wire.mjs',
);

if (process.version !== 'v24.18.0') {
  throw new Error(
    `partners wire generation requires Node v24.18.0, received ${process.version}`,
  );
}

removeTemporaryRoot();
const preparation = spawnSync(process.execPath, [prepareScript, projectionRoot], {
  cwd: repositoryRoot,
  env: process.env,
  encoding: 'utf8',
});
if (preparation.error) throw preparation.error;
assert.equal(
  preparation.status,
  0,
  `partners projection preparation failed: ${preparation.stderr}`,
);

const projection = JSON.parse(readRegular(projectionPath).toString('utf8'));
assert.equal(projection.openapi, '3.1.0');
assert.equal(projection.paths['/partners']?.post?.operationId, 'postPartnersV1');
assert.deepEqual(Object.keys(projection.paths), ['/partners']);
assert.deepEqual(Object.keys(projection.components.schemas), [
  'PartnersRequestV1',
  'PartnersResultErrorEnvelopeV1',
  'PartnersSuccessEnvelopeV1',
]);
assert.deepEqual(Object.keys(projection.components.headers), [
  'PrivateNoStoreV1',
  'RequestIDV1',
]);
assert.deepEqual(Object.keys(projection.components.responses), [
  'PartnersMethodNotAllowedErrorV1',
  'PartnersRateLimitedErrorV1',
  'PartnersResultErrorV1',
  'PartnersServiceUnavailableErrorV1',
]);
const projectionSha256 = readRegular(projectionHashPath)
  .toString('utf8')
  .trim();
assert.match(projectionSha256, /^[a-f0-9]{64}$/);

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
  'PartnersRequestV1',
  'PartnersSuccessEnvelopeV1',
  'PartnersResultErrorEnvelopeV1',
]) {
  assert.match(types, new RegExp(`^export type ${name}\\b`, 'm'));
}
console.log(
  `partners wire generated: projection ${projectionSha256}, ${expectedFiles.join(', ')}`,
);

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
