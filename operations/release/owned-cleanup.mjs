import fs from 'node:fs';
import path from 'node:path';

import { deepFreeze } from '../lib/canonical-json.mjs';
import { attestRunRoot } from '../lib/run-root.mjs';

const ADMITTED_CLEANUP_INVENTORIES = new WeakSet();

export class OwnedCleanupError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'OwnedCleanupError';
  }
}

function fail(message, cause) {
  throw new OwnedCleanupError(message, cause ? { cause } : undefined);
}

function identity(information, linkTarget) {
  const type = information.isFile()
    ? 'file'
    : information.isDirectory()
      ? 'directory'
      : information.isSymbolicLink()
        ? 'symlink'
        : 'special';
  if (type === 'special') fail('owned run contains a special file');
  if (type === 'file' && information.nlink !== 1n) {
    fail('owned run contains a hard-linked file');
  }
  return deepFreeze({
    device: String(information.dev),
    inode: String(information.ino),
    linkTarget,
    links: Number(information.nlink),
    mode: Number(information.mode & 0o7777n),
    modifiedNs: String(information.mtimeNs),
    size: Number(information.size),
    type,
  });
}

function capture(absolute) {
  const information = fs.lstatSync(absolute, { bigint: true });
  const linkTarget = information.isSymbolicLink()
    ? fs.readlinkSync(absolute)
    : null;
  return identity(information, linkTarget);
}

function assertIdentity(absolute, expected, label) {
  let actual;
  try {
    actual = capture(absolute);
  } catch (error) {
    fail(`${label} disappeared or cannot be inspected`, error);
  }
  assertCapturedIdentity(actual, expected, label);
}

function assertCapturedIdentity(actual, expected, label) {
  for (const key of Object.keys(expected)) {
    if (actual[key] !== expected[key]) {
      fail(`${label} differs from its captured identity`);
    }
  }
}

function admitOwnerCleanupPermissions(absolute, expected, label) {
  const admittedMode = expected.mode | 0o700;
  if (admittedMode === expected.mode) return expected;
  let descriptor;
  try {
    descriptor = fs.openSync(
      absolute,
      fs.constants.O_RDONLY |
        fs.constants.O_DIRECTORY |
        fs.constants.O_NOFOLLOW,
    );
    assertCapturedIdentity(
      identity(fs.fstatSync(descriptor, { bigint: true }), null),
      expected,
      label,
    );
    fs.fchmodSync(descriptor, admittedMode);
    const admitted = deepFreeze({ ...expected, mode: admittedMode });
    assertCapturedIdentity(
      identity(fs.fstatSync(descriptor, { bigint: true }), null),
      admitted,
      label,
    );
    return admitted;
  } catch (error) {
    if (error instanceof OwnedCleanupError) throw error;
    fail(`${label} owner cleanup permission admission failed`, error);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function assertStableContainer(absolute, expected, label) {
  const actual = capture(absolute);
  for (const key of ['device', 'inode', 'mode', 'type']) {
    if (actual[key] !== expected[key]) {
      fail(`${label} no longer identifies the owned directory`);
    }
  }
}

export function inventoryOwnedRunRoot(runRoot, options) {
  const owned = attestRunRoot(runRoot, options);
  const rootIdentity = capture(owned.runRoot);
  const entries = captureEntries(owned.runRoot);
  const inventory = deepFreeze({ ...owned, entries, rootIdentity });
  ADMITTED_CLEANUP_INVENTORIES.add(inventory);
  return inventory;
}

function captureEntries(runRoot) {
  const entries = [];
  function walk(directory) {
    for (const name of fs
      .readdirSync(directory)
      .sort((left, right) => left.localeCompare(right, 'en'))) {
      const absolute = path.join(directory, name);
      const relative = path
        .relative(runRoot, absolute)
        .split(path.sep)
        .join('/');
      const entryIdentity = capture(absolute);
      entries.push({
        identity: entryIdentity,
        path: relative,
        type: entryIdentity.type,
      });
      if (entryIdentity.type === 'directory') walk(absolute);
    }
  }
  walk(runRoot);
  return entries;
}

function assertInventoryStillClosed(inventory) {
  assertIdentity(inventory.runRoot, inventory.rootIdentity, 'owned run root');
  const current = captureEntries(inventory.runRoot);
  if (
    current.length !== inventory.entries.length ||
    current.some((entry, index) => {
      const expected = inventory.entries[index];
      return (
        !expected ||
        entry.path !== expected.path ||
        entry.type !== expected.type ||
        Object.keys(expected.identity).some(
          (key) => entry.identity[key] !== expected.identity[key],
        )
      );
    })
  ) {
    fail('owned run differs from its closed cleanup inventory');
  }
  for (const entry of inventory.entries) {
    assertIdentity(
      path.join(inventory.runRoot, ...entry.path.split('/')),
      entry.identity,
      `owned run ${entry.path}`,
    );
  }
}

export function cleanupOwnedRunInventory(inventory) {
  if (!ADMITTED_CLEANUP_INVENTORIES.has(inventory)) {
    fail('owned cleanup requires an inventory captured by this process');
  }
  assertInventoryStillClosed(inventory);
  const directoryIdentities = new Map();
  for (const entry of [
    { identity: inventory.rootIdentity, path: '' },
    ...inventory.entries.filter((candidate) => candidate.type === 'directory'),
  ]) {
    const absolute = entry.path
      ? path.join(inventory.runRoot, ...entry.path.split('/'))
      : inventory.runRoot;
    directoryIdentities.set(
      entry.path,
      admitOwnerCleanupPermissions(
        absolute,
        entry.identity,
        `owned run directory ${entry.path || '.'}`,
      ),
    );
  }
  const leaves = inventory.entries
    .filter((entry) => entry.type !== 'directory')
    .sort((left, right) => right.path.localeCompare(left.path, 'en'));
  for (const entry of leaves) {
    const absolute = path.join(
      inventory.runRoot,
      ...entry.path.split('/'),
    );
    assertIdentity(absolute, entry.identity, `owned run ${entry.path}`);
    const parent = path.posix.dirname(entry.path);
    const parentRelative = parent === '.' ? '' : parent;
    assertStableContainer(
      path.dirname(absolute),
      directoryIdentities.get(parentRelative),
      `owned run directory ${parentRelative || '.'}`,
    );
    fs.unlinkSync(absolute);
  }
  const directories = inventory.entries
    .filter((entry) => entry.type === 'directory')
    .sort((left, right) => {
      const depth =
        right.path.split('/').length - left.path.split('/').length;
      return depth || right.path.localeCompare(left.path, 'en');
    });
  for (const entry of directories) {
    const absolute = path.join(
      inventory.runRoot,
      ...entry.path.split('/'),
    );
    assertStableContainer(
      absolute,
      directoryIdentities.get(entry.path),
      `owned run directory ${entry.path}`,
    );
    if (fs.readdirSync(absolute).length !== 0) {
      fail(`owned run directory ${entry.path} gained a foreign entry`);
    }
    fs.rmdirSync(absolute);
  }
  assertStableContainer(
    inventory.runRoot,
    directoryIdentities.get(''),
    'owned run root',
  );
  if (fs.readdirSync(inventory.runRoot).length !== 0) {
    fail('owned run root gained a foreign entry');
  }
  fs.rmdirSync(inventory.runRoot);
  ADMITTED_CLEANUP_INVENTORIES.delete(inventory);
  for (const directory of [
    path.dirname(inventory.runRoot),
    path.dirname(path.dirname(inventory.runRoot)),
  ]) {
    try {
      if (fs.readdirSync(directory).length === 0) fs.rmdirSync(directory);
    } catch (error) {
      if (!['ENOENT', 'ENOTEMPTY'].includes(error?.code)) throw error;
    }
  }
}

export function cleanupOwnedRunRoot(runRoot, options) {
  return cleanupOwnedRunInventory(inventoryOwnedRunRoot(runRoot, options));
}
