import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createRunRoot } from '../../lib/run-root.mjs';
import {
  cleanupOwnedRunInventory,
  cleanupOwnedRunRoot,
  inventoryOwnedRunRoot,
  OwnedCleanupError,
} from '../../release/owned-cleanup.mjs';

const TEST_TMP = path.join(os.tmpdir(), 'bgmss-release-cleanup-tests');

function createFixture(purpose) {
  const run = createRunRoot({
    directories: ['nested'],
    purpose,
    tmpRoot: TEST_TMP,
  });
  const file = path.join(run.runRoot, 'nested', 'payload.txt');
  fs.writeFileSync(file, 'payload\n', { flag: 'wx', mode: 0o600 });
  return { file, run };
}

function cleanup(run, purpose) {
  cleanupOwnedRunRoot(run.runRoot, {
    expectedPurpose: purpose,
    tmpRoot: TEST_TMP,
  });
}

test('closed cleanup inventory rejects and preserves a foreign entry', () => {
  const purpose = 'cleanup-foreign-test';
  const { file, run } = createFixture(purpose);
  const inventory = inventoryOwnedRunRoot(run.runRoot, {
    expectedPurpose: purpose,
    tmpRoot: TEST_TMP,
  });
  const foreign = path.join(run.runRoot, 'foreign.txt');
  fs.writeFileSync(foreign, 'foreign\n', { flag: 'wx', mode: 0o600 });
  assert.throws(
    () => cleanupOwnedRunInventory(inventory),
    OwnedCleanupError,
  );
  assert.equal(fs.readFileSync(file, 'utf8'), 'payload\n');
  assert.equal(fs.readFileSync(foreign, 'utf8'), 'foreign\n');
  cleanup(run, purpose);
});

test('owned inventory records paths relative to its supplied run root', () => {
  const purpose = 'cleanup-relative-root-test';
  const { run } = createFixture(purpose);
  const inventory = inventoryOwnedRunRoot(run.runRoot, {
    expectedPurpose: purpose,
    tmpRoot: TEST_TMP,
  });
  assert.deepEqual(
    inventory.entries.map((entry) => entry.path),
    [
      '.bgmss-operations-run.json',
      'nested',
      'nested/payload.txt',
    ],
  );
  cleanupOwnedRunInventory(inventory);
  assert.equal(fs.existsSync(run.runRoot), false);
});

test('double-build-shaped partial output with package symlinks is cleaned exactly', () => {
  const purpose = 'double-build-partial-test';
  const run = createRunRoot({
    directories: [
      'set-one/checkout/node_modules/.bin',
      'set-one/checkout/node_modules/tool/bin',
      'set-two/checkout',
    ],
    purpose,
    tmpRoot: TEST_TMP,
  });
  const executable = path.join(
    run.runRoot,
    'set-one',
    'checkout',
    'node_modules',
    'tool',
    'bin',
    'tool.js',
  );
  fs.writeFileSync(executable, 'tool\n', { flag: 'wx', mode: 0o600 });
  fs.symlinkSync(
    '../../tool/bin/tool.js',
    path.join(
      run.runRoot,
      'set-one',
      'checkout',
      'node_modules',
      '.bin',
      'tool',
    ),
  );
  fs.writeFileSync(
    path.join(run.runRoot, 'set-two', 'checkout', 'partial-output'),
    'partial\n',
    { flag: 'wx', mode: 0o600 },
  );
  cleanup(run, purpose);
  assert.equal(fs.existsSync(run.runRoot), false);
});

test('read-only automatic Go toolchain cache is opened, admitted, and cleaned exactly', () => {
  const purpose = 'readonly-go-toolchain-cleanup-test';
  const moduleRoot = [
    'set-two',
    'go-mod-cache',
    'golang.org',
    'toolchain@v0.0.1-go1.26.5.linux-amd64',
  ].join('/');
  const run = createRunRoot({
    directories: [moduleRoot],
    purpose,
    tmpRoot: TEST_TMP,
  });
  const absoluteModuleRoot = path.join(run.runRoot, ...moduleRoot.split('/'));
  const version = path.join(absoluteModuleRoot, 'VERSION');
  fs.writeFileSync(version, 'go1.26.5\n', { flag: 'wx', mode: 0o444 });
  fs.chmodSync(absoluteModuleRoot, 0o555);
  const directoryDescriptor = fs.openSync(
    absoluteModuleRoot,
    fs.constants.O_RDONLY | fs.constants.O_DIRECTORY,
  );
  const fileDescriptor = fs.openSync(version, fs.constants.O_RDONLY);
  try {
    cleanup(run, purpose);
    assert.equal(fs.existsSync(run.runRoot), false);
    assert.equal(
      fs.fstatSync(directoryDescriptor).mode & 0o777,
      0o755,
    );
    assert.equal(fs.fstatSync(fileDescriptor).mode & 0o777, 0o444);
  } finally {
    fs.closeSync(fileDescriptor);
    fs.closeSync(directoryDescriptor);
  }
});

test('closed cleanup inventory rejects a same-byte path replacement', () => {
  const purpose = 'cleanup-replacement-test';
  const { file, run } = createFixture(purpose);
  const inventory = inventoryOwnedRunRoot(run.runRoot, {
    expectedPurpose: purpose,
    tmpRoot: TEST_TMP,
  });
  fs.unlinkSync(file);
  fs.writeFileSync(file, 'payload\n', { flag: 'wx', mode: 0o600 });
  assert.throws(
    () => cleanupOwnedRunInventory(inventory),
    OwnedCleanupError,
  );
  assert.equal(fs.readFileSync(file, 'utf8'), 'payload\n');
  cleanup(run, purpose);
});

test('cleanup rejects a directory symlink replacement without chmod outside the run', () => {
  const purpose = 'cleanup-directory-symlink-replacement-test';
  const { run } = createFixture(purpose);
  const inventory = inventoryOwnedRunRoot(run.runRoot, {
    expectedPurpose: purpose,
    tmpRoot: TEST_TMP,
  });
  const nested = path.join(run.runRoot, 'nested');
  const preserved = path.join(
    path.dirname(run.runRoot),
    `${run.runId}-preserved`,
  );
  const outside = fs.mkdtempSync(
    path.join(os.tmpdir(), 'bgmss-cleanup-outside-'),
  );
  fs.chmodSync(outside, 0o500);
  fs.renameSync(nested, preserved);
  fs.symlinkSync(outside, nested);
  assert.throws(
    () => cleanupOwnedRunInventory(inventory),
    OwnedCleanupError,
  );
  assert.equal(fs.statSync(outside).mode & 0o777, 0o500);
  fs.unlinkSync(nested);
  fs.renameSync(preserved, nested);
  cleanup(run, purpose);
  fs.chmodSync(outside, 0o700);
  fs.rmdirSync(outside);
});

test('owned cleanup inventory rejects a hard-linked file', () => {
  const purpose = 'cleanup-hardlink-test';
  const run = createRunRoot({
    purpose,
    tmpRoot: TEST_TMP,
  });
  const outsideDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'bgmss-cleanup-hardlink-'),
  );
  const outside = path.join(outsideDirectory, 'outside');
  const linked = path.join(run.runRoot, 'linked');
  fs.writeFileSync(outside, 'outside\n', { flag: 'wx', mode: 0o600 });
  fs.linkSync(outside, linked);
  assert.throws(
    () =>
      inventoryOwnedRunRoot(run.runRoot, {
        expectedPurpose: purpose,
        tmpRoot: TEST_TMP,
      }),
    OwnedCleanupError,
  );
  assert.equal(fs.statSync(outside).nlink, 2);
  fs.unlinkSync(linked);
  cleanup(run, purpose);
  fs.unlinkSync(outside);
  fs.rmdirSync(outsideDirectory);
});

test('closed cleanup inventory rejects root identity drift before deletion', () => {
  const purpose = 'cleanup-failure-test';
  const { file, run } = createFixture(purpose);
  const inventory = inventoryOwnedRunRoot(run.runRoot, {
    expectedPurpose: purpose,
    tmpRoot: TEST_TMP,
  });
  fs.chmodSync(run.runRoot, 0o500);
  assert.throws(
    () => cleanupOwnedRunInventory(inventory),
    OwnedCleanupError,
  );
  assert.equal(fs.readFileSync(file, 'utf8'), 'payload\n');
  fs.chmodSync(run.runRoot, 0o700);
  cleanup(run, purpose);
});
