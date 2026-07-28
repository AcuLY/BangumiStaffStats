import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  copyImmutableFile,
  inventoryTree,
} from '../../release/files.mjs';

test('candidate-shaped immutable copies admit top-level and nested destinations', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bgmss-release-files-test-'));
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));

  const sourceRoot = path.join(root, 'source');
  const candidateRoot = path.join(root, 'candidate');
  fs.mkdirSync(sourceRoot, { mode: 0o700 });
  fs.mkdirSync(candidateRoot, { mode: 0o700 });

  const receipt = path.join(sourceRoot, 'accepted-development.json');
  const executable = path.join(sourceRoot, 'archive-smoke');
  fs.writeFileSync(receipt, '{}\n', { flag: 'wx', mode: 0o600 });
  fs.writeFileSync(executable, '#!/bin/sh\n', { flag: 'wx', mode: 0o700 });

  const receiptRecord = copyImmutableFile({
    destinationRelative: 'accepted-development.json',
    destinationRoot: candidateRoot,
    mode: 0o444,
    source: receipt,
  });
  const executableRecord = copyImmutableFile({
    destinationRelative: 'release/archive-smoke',
    destinationRoot: candidateRoot,
    mode: 0o555,
    source: executable,
  });

  assert.equal(receiptRecord.mode, '0444');
  assert.equal(executableRecord.mode, '0555');
  assert.deepEqual(
    inventoryTree(candidateRoot).map(({ mode, path: relativePath }) => ({
      mode,
      path: relativePath,
    })),
    [
      { mode: '0444', path: 'accepted-development.json' },
      { mode: '0555', path: 'release/archive-smoke' },
    ],
  );
});
