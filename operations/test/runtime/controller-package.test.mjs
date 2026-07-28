import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { renderCompose } from '../../compose/render.mjs';

const OPERATIONS = path.resolve(import.meta.dirname, '..', '..');
const ASSEMBLER = path.join(
  OPERATIONS,
  'bin/assemble-controller-package.mjs',
);
const DEFINITIONS = JSON.parse(
  readFileSync(
    path.join(OPERATIONS, 'config/controller-files.json'),
    'utf8',
  ),
);
const INVENTORY = [DEFINITIONS.bootstrap, ...DEFINITIONS.files];
const SENTINEL = 'compose/updater-current-deny';

function digest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function expectedMode(relative) {
  if (relative === SENTINEL) return 0o000;
  if (
    relative === DEFINITIONS.bootstrap ||
    relative === 'bin/bgmss-ops'
  ) {
    return 0o555;
  }
  return 0o444;
}

function expectedBytes(relative) {
  if (relative === 'compose/compose.yaml') {
    return Buffer.from(renderCompose('production'));
  }
  return readFileSync(path.join(OPERATIONS, relative));
}

function listTree(root, relative = '') {
  const current = relative === '' ? root : path.join(root, relative);
  const entries = [];
  for (const name of readdirSync(current).sort()) {
    const child = relative === '' ? name : `${relative}/${name}`;
    const information = lstatSync(path.join(root, child));
    assert.equal(information.isSymbolicLink(), false, child);
    entries.push(child);
    if (information.isDirectory()) entries.push(...listTree(root, child));
  }
  return entries;
}

function expectedTree() {
  const entries = new Set(['controller-manifest.json', 'payload']);
  for (const relative of INVENTORY) {
    let parent = path.posix.dirname(relative);
    while (parent !== '.') {
      entries.add(`payload/${parent}`);
      parent = path.posix.dirname(parent);
    }
    entries.add(`payload/${relative}`);
  }
  return [...entries].sort();
}

function assemble(outputRoot, revision) {
  return spawnSync(
    process.execPath,
    [
      ASSEMBLER,
      '--operations-root',
      OPERATIONS,
      '--controller-revision',
      revision,
      '--output-root',
      outputRoot,
    ],
    { encoding: 'utf8' },
  );
}

function verifyPackage(root, revision) {
  assert.deepEqual(listTree(root).sort(), expectedTree());
  assert.equal(statSync(root).mode & 0o777, 0o555);
  assert.equal(statSync(path.join(root, 'payload')).mode & 0o777, 0o555);

  for (const relative of listTree(root)) {
    const candidate = path.join(root, relative);
    const information = lstatSync(candidate);
    if (information.isDirectory()) {
      assert.equal(information.mode & 0o777, 0o555, relative);
      assert.equal(information.mtimeMs, 0, relative);
    } else {
      assert.equal(information.nlink, 1, relative);
    }
  }

  const manifestPath = path.join(root, 'controller-manifest.json');
  const manifestText = readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestText);
  assert.equal(statSync(manifestPath).mode & 0o777, 0o444);
  assert.equal(statSync(manifestPath).mtimeMs, 0);
  assert.equal(manifest.controllerRevision, revision);
  assert.equal(manifest.schemaVersion, 'controller-manifest-v1');
  assert.equal(manifest.bootstrap.path, DEFINITIONS.bootstrap);
  assert.deepEqual(
    manifest.files.map((descriptor) => descriptor.path),
    DEFINITIONS.files,
  );

  const descriptors = new Map([
    [manifest.bootstrap.path, manifest.bootstrap],
    ...manifest.files.map((descriptor) => [descriptor.path, descriptor]),
  ]);
  for (const relative of INVENTORY) {
    const sourceBytes = expectedBytes(relative);
    const packaged = path.join(root, 'payload', relative);
    const information = statSync(packaged);
    const descriptor = descriptors.get(relative);
    assert.equal(information.mode & 0o777, expectedMode(relative), relative);
    assert.equal(information.nlink, 1, relative);
    assert.equal(information.size, sourceBytes.length, relative);
    assert.equal(information.mtimeMs, 0, relative);
    assert.equal(
      descriptor.mode,
      expectedMode(relative).toString(8).padStart(4, '0'),
      relative,
    );
    assert.equal(descriptor.size, sourceBytes.length, relative);
    assert.equal(descriptor.sha256, digest(sourceBytes), relative);
    if (relative !== SENTINEL) {
      assert.deepEqual(readFileSync(packaged), sourceBytes, relative);
    }
  }
  return manifestText;
}

function makeDirectoriesWritable(root) {
  chmodSync(root, 0o700);
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      makeDirectoriesWritable(path.join(root, entry.name));
    }
  }
}

test('controller package assembler closes bytes, modes, and reproducibility', () => {
  const temporary = realpathSync(
    mkdtempSync(path.join(tmpdir(), 'bgmss-controller-package-test-')),
  );
  const first = path.join(temporary, 'package-one');
  const second = path.join(temporary, 'package-two');
  const revision = 'b'.repeat(40);
  try {
    const firstResult = assemble(first, revision);
    assert.equal(firstResult.status, 0, firstResult.stderr);
    assert.equal(firstResult.stdout, `${first}\n`);
    const firstManifest = verifyPackage(first, revision);

    const secondResult = assemble(second, revision);
    assert.equal(secondResult.status, 0, secondResult.stderr);
    assert.equal(secondResult.stdout, `${second}\n`);
    assert.equal(verifyPackage(second, revision), firstManifest);

    const collision = assemble(first, revision);
    assert.equal(collision.status, 1);
    assert.match(collision.stderr, /output root must be absent/u);
    assert.equal(
      readFileSync(path.join(first, 'controller-manifest.json'), 'utf8'),
      firstManifest,
    );
  } finally {
    for (const root of [first, second]) {
      try {
        makeDirectoriesWritable(root);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
    rmSync(temporary, { force: true, recursive: true });
  }
});
