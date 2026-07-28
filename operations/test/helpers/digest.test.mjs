import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  assertGitOid,
  assertSha256,
  DigestError,
  sha256,
  sha256File,
} from '../../lib/digest.mjs';
import {
  cleanupRunRoot,
  createRunRoot,
} from '../../lib/run-root.mjs';

test('SHA-256 and Git OID helpers require exact lowercase identities', () => {
  assert.equal(
    sha256('abc'),
    'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
  assert.equal(
    assertGitOid('3f585cfe0a0dd61fe783a839528fef25470a58db'),
    '3f585cfe0a0dd61fe783a839528fef25470a58db',
  );
  assert.throws(() => assertGitOid('3F585CFE'), DigestError);
  assert.throws(() => assertSha256('sha256:ABC'), DigestError);
});

test('file SHA-256 is read in bounded chunks under one stable identity', () => {
  const run = createRunRoot({ purpose: 'digest-file-test' });
  const filePath = path.join(run.runRoot, 'artifact.bin');
  const bytes = Buffer.alloc(2 * 1024 * 1024 + 17, 0x61);
  fs.writeFileSync(filePath, bytes, { mode: 0o600 });
  assert.equal(sha256File(filePath), sha256(bytes));
  fs.linkSync(filePath, path.join(run.runRoot, 'artifact-link.bin'));
  assert.throws(() => sha256File(filePath), DigestError);
  fs.unlinkSync(path.join(run.runRoot, 'artifact-link.bin'));
  cleanupRunRoot(run.runRoot);
});
