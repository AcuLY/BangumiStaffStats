import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { canonicalJson } from '../lib/canonical-json.mjs';
import {
  ACCEPTANCE_INVENTORY_KIND,
  InventoryPolicyError,
  validatePersistentInventory,
  verifyAcceptanceInventory,
} from '../lib/inventory.mjs';
import { verifyPackagePolicy } from '../lib/package-policy.mjs';

function fixtureInventory() {
  return {
    schemaVersion: 1,
    kind: ACCEPTANCE_INVENTORY_KIND,
    directories: ['bin', 'lib'],
    files: [
      { path: 'README.md', mode: '0644' },
      { path: 'bin/acceptance.mjs', mode: '0755' },
      { path: 'inventory.json', mode: '0644' },
      { path: 'lib/inventory.mjs', mode: '0644' },
    ],
  };
}

function writeFile(root, relative, contents, mode) {
  const absolute = path.join(root, ...relative.split('/'));
  fs.mkdirSync(path.dirname(absolute), { recursive: true, mode: 0o755 });
  fs.writeFileSync(absolute, contents, { mode });
  fs.chmodSync(absolute, mode);
}

function createFixture() {
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), 'bgmss-acceptance-inventory-')),
  );
  const inventory = fixtureInventory();
  writeFile(root, 'README.md', '# Fixture\n', 0o644);
  writeFile(root, 'bin/acceptance.mjs', '#!/usr/bin/env node\n', 0o755);
  writeFile(root, 'lib/inventory.mjs', 'export {};\n', 0o644);
  writeFile(root, 'inventory.json', canonicalJson(inventory), 0o644);
  return { root, inventory };
}

function withFixture(callback) {
  const fixture = createFixture();
  try {
    return callback(fixture);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
}

function rejectsMutation(mutate, pattern) {
  withFixture(({ root, inventory }) => {
    mutate(root, inventory);
    assert.throws(
      () => validatePersistentInventory({ root, inventory }),
      (error) =>
        error instanceof InventoryPolicyError && pattern.test(error.message),
    );
  });
}

test('fixed inventory accepts only the exact declared persistent tree', () => {
  withFixture(({ root, inventory }) => {
    assert.deepEqual(validatePersistentInventory({ root, inventory }), {
      root,
      directoryCount: 2,
      fileCount: 4,
    });
    assert.deepEqual(verifyAcceptanceInventory(root), {
      root,
      directoryCount: 2,
      fileCount: 4,
    });
  });
});

test('fixed inventory rejects unexpected and missing files or directories', () => {
  rejectsMutation(
    (root) => writeFile(root, 'lib/unreviewed.mjs', 'export {};\n', 0o644),
    /unexpected path lib\/unreviewed\.mjs/u,
  );
  rejectsMutation(
    (root) => fs.unlinkSync(path.join(root, 'README.md')),
    /missing path README\.md/u,
  );
  rejectsMutation(
    (root) => fs.mkdirSync(path.join(root, 'extra')),
    /unexpected path extra/u,
  );
  rejectsMutation(
    (root) => fs.chmodSync(path.join(root, 'README.md'), 0o600),
    /has mode 0600; expected 0644/u,
  );
});

test('fixed inventory rejects symlinks and hard links', () => {
  rejectsMutation(
    (root) =>
      fs.symlinkSync(
        path.join(root, 'README.md'),
        path.join(root, 'lib', 'linked.mjs'),
      ),
    /contains symlink lib\/linked\.mjs/u,
  );
  rejectsMutation(
    (root) =>
      fs.linkSync(
        path.join(root, 'README.md'),
        path.join(root, 'lib', 'hard-linked.mjs'),
      ),
    /contains hard-linked file/u,
  );
});

test('fixed inventory rejects special files', () => {
  rejectsMutation(
    (root) => {
      const fifo = path.join(root, 'lib', 'special.fifo');
      const result = spawnSync('/usr/bin/mkfifo', [fifo], {
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, result.stderr);
    },
    /contains special file lib\/special\.fifo/u,
  );
});

test('fixed inventory rejects temporary, dependency, OpenSpec, and skill trees', () => {
  for (const [relative, pattern] of [
    ['.tmp/result.json', /forbidden segment \.tmp/u],
    ['node_modules/pkg/index.js', /forbidden segment node_modules/u],
    ['lib/openspec/change.md', /forbidden segment openspec/u],
    ['browser/skills/SKILL.md', /forbidden segment skills/u],
  ]) {
    rejectsMutation(
      (root) => writeFile(root, relative, 'unexpected\n', 0o644),
      pattern,
    );
  }
});

test('inventory declarations cannot authorize forbidden or duplicate paths', () => {
  withFixture(({ root, inventory }) => {
    assert.throws(
      () =>
        validatePersistentInventory({
          root,
          inventory: {
            ...inventory,
            directories: [...inventory.directories, 'skills'],
          },
        }),
      /forbidden segment skills/u,
    );
    assert.throws(
      () =>
        validatePersistentInventory({
          root,
          inventory: {
            ...inventory,
            files: [...inventory.files, inventory.files.at(-1)],
          },
        }),
      /duplicate lib\/inventory\.mjs/u,
    );
  });
});

test('package policy rejects an unexpected direct dependency', () => {
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), 'bgmss-acceptance-package-')),
  );
  try {
    const sourceRoot = path.resolve(import.meta.dirname, '..');
    const manifest = JSON.parse(
      fs.readFileSync(path.join(sourceRoot, 'package.json'), 'utf8'),
    );
    manifest.devDependencies['unreviewed-browser-stack'] = '1.0.0';
    fs.writeFileSync(path.join(root, 'package.json'), canonicalJson(manifest));
    fs.copyFileSync(
      path.join(sourceRoot, 'package-lock.json'),
      path.join(root, 'package-lock.json'),
    );
    assert.throws(
      () => verifyPackagePolicy(root),
      /only direct development dependency/u,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
