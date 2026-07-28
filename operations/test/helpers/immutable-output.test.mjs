import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  assertImmutableFile,
  ImmutableOutputError,
  writeCanonicalJsonFile,
  writeContentAddressedBlob,
  writeImmutableFile,
} from '../../lib/immutable-output.mjs';
import {
  cleanupRunRoot,
  createRunRoot,
  inventoryRunRoot,
} from '../../lib/run-root.mjs';

function ownedRun(t, purpose) {
  const run = createRunRoot({ purpose });
  t.after(() => cleanupRunRoot(run.runRoot));
  return run;
}

test('immutable output publishes exact bytes without writable or shared state', (t) => {
  const run = ownedRun(t, 'immutable-output-test');
  const output = writeImmutableFile({
    root: run.runRoot,
    relativePath: 'evidence/value.txt',
    bytes: 'accepted\n',
  });
  assert.equal(fs.readFileSync(output.path, 'utf8'), 'accepted\n');
  const identity = assertImmutableFile(output.path, output.sha256);
  assert.equal(identity.links, 1);
  assert.equal(identity.mode & 0o222, 0);
  assert.throws(
    () =>
      writeImmutableFile({
        root: run.runRoot,
        relativePath: 'evidence/value.txt',
        bytes: 'replacement\n',
      }),
    ImmutableOutputError,
  );
  assert.equal(fs.readFileSync(output.path, 'utf8'), 'accepted\n');
  assert.equal(
    inventoryRunRoot(run.runRoot).entries.some((entry) =>
      entry.path.includes('.bgmss-output-'),
    ),
    false,
  );
});

test('content-addressed output rejects a second publication even for same bytes', (t) => {
  const run = ownedRun(t, 'content-address-test');
  const first = writeContentAddressedBlob({
    root: run.runRoot,
    bytes: 'content\n',
    suffix: '.txt',
  });
  assert.equal(
    path.basename(first.path),
    `sha256-${first.sha256.slice('sha256:'.length)}.txt`,
  );
  assert.throws(
    () =>
      writeContentAddressedBlob({
        root: run.runRoot,
        bytes: 'content\n',
        suffix: '.txt',
      }),
    /already exists/u,
  );
});

test('canonical JSON output is itself immutable and canonical', (t) => {
  const run = ownedRun(t, 'canonical-output-test');
  const output = writeCanonicalJsonFile({
    root: run.runRoot,
    relativePath: 'inputs/value.json',
    value: { z: 2, a: 1 },
  });
  assert.equal(fs.readFileSync(output.path, 'utf8'), '{"a":1,"z":2}\n');
  assertImmutableFile(output.path, output.sha256);
});
