import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  canonicalJsonDigest,
  deepFreeze,
} from './canonical-json.mjs';
import { writeCanonicalJsonFile } from './immutable-output.mjs';
import {
  assertPathIdentity,
  capturePathIdentity,
  ensureContainedDirectory,
  isStrictlyContained,
  requireCanonicalPath,
} from './path-policy.mjs';
import { readCanonicalJson } from './strict-json.mjs';

export const OPERATIONS_ROOT = path.dirname(
  path.dirname(fileURLToPath(import.meta.url)),
);
export const OPERATIONS_TMP_ROOT = path.join(OPERATIONS_ROOT, '.tmp');
export const RUN_MARKER = '.bgmss-operations-run.json';

const RUN_ID_PATTERN = /^run-[0-9a-f]{32}$/u;
const OWNER_PATTERN = /^[a-z][a-z0-9-]{2,63}$/u;
const PURPOSE_PATTERN = /^[a-z][a-z0-9-]{2,63}$/u;
const ADMITTED_RUN_INVENTORIES = new WeakSet();

export class RunRootError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'RunRootError';
  }
}

function fail(message, cause) {
  throw new RunRootError(message, cause ? { cause } : undefined);
}

function ensureTemporaryRoot(tmpRoot) {
  const absolute = path.resolve(tmpRoot);
  const parent = requireCanonicalPath(path.dirname(absolute), {
    label: 'temporary root parent',
    type: 'directory',
  });
  if (!isStrictlyContained(absolute, parent)) {
    fail('temporary root must be a direct or nested child of its real parent');
  }
  const relative = path.relative(parent, absolute).split(path.sep).join('/');
  return ensureContainedDirectory(parent, relative, 0o700);
}

export function ensureOperationsTemporaryRoot() {
  return ensureTemporaryRoot(OPERATIONS_TMP_ROOT);
}

function numericIdentity(candidate) {
  const information = fs.lstatSync(candidate, { bigint: true });
  return {
    device: String(information.dev),
    inode: String(information.ino),
  };
}

function inventoryIdentity(information) {
  const type = information.isFile()
    ? 'file'
    : information.isDirectory()
      ? 'directory'
      : information.isSymbolicLink()
        ? 'symlink'
        : 'special';
  return {
    device: String(information.dev),
    inode: String(information.ino),
    links: Number(information.nlink),
    mode: Number(information.mode & 0o7777n),
    modifiedNs: String(information.mtimeNs),
    size: Number(information.size),
    type,
  };
}

function assertInventoriedIdentity(absolute, identity, label) {
  try {
    return assertPathIdentity(
      absolute,
      {
        path: absolute,
        ...identity,
      },
      { label, includeDigest: false },
    );
  } catch (error) {
    fail(`${label} differs from its admitted inventory`, error);
  }
}

function assertStableOwnedIdentity(actual, original, label) {
  for (const key of ['device', 'inode', 'mode', 'type']) {
    if (actual[key] !== original[key]) {
      fail(`${label} no longer identifies the inventoried object`);
    }
  }
}

export function createRunRoot({
  owner = 'bangumi-staff-stats-operations',
  purpose,
  tmpRoot = OPERATIONS_TMP_ROOT,
  directories = [],
}) {
  if (!OWNER_PATTERN.test(owner)) fail('run owner is invalid');
  if (!PURPOSE_PATTERN.test(purpose)) fail('run purpose is invalid');
  const canonicalTmp = ensureTemporaryRoot(tmpRoot);
  const runsRoot = ensureContainedDirectory(canonicalTmp, 'runs', 0o700);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const runId = `run-${randomBytes(16).toString('hex')}`;
    const runRoot = path.join(runsRoot, runId);
    try {
      fs.mkdirSync(runRoot, { mode: 0o700 });
    } catch (error) {
      if (error?.code === 'EEXIST') continue;
      fail('cannot allocate a run root', error);
    }
    const rootIdentity = numericIdentity(runRoot);
    const marker = {
      owner,
      purpose,
      rootDevice: rootIdentity.device,
      rootInode: rootIdentity.inode,
      runId,
      schemaVersion: 'operations-run-root-v1',
    };
    try {
      writeCanonicalJsonFile({
        root: runRoot,
        relativePath: RUN_MARKER,
        value: marker,
      });
      for (const relative of directories) {
        ensureContainedDirectory(runRoot, relative, 0o700);
      }
      return deepFreeze({
        owner,
        purpose,
        runId,
        runRoot,
        markerDigest: canonicalJsonDigest(marker),
      });
    } catch (error) {
      fail('run root initialization failed; owned residue was preserved', error);
    }
  }
  fail('cannot allocate a unique run root after eight attempts');
}

export function attestRunRoot(
  runRoot,
  {
    expectedOwner,
    expectedPurpose,
    tmpRoot = OPERATIONS_TMP_ROOT,
  } = {},
) {
  const canonicalTmp = requireCanonicalPath(tmpRoot, {
    label: 'temporary root',
    type: 'directory',
  });
  const canonicalRun = requireCanonicalPath(runRoot, {
    label: 'run root',
    type: 'directory',
    below: canonicalTmp,
  });
  const runId = path.basename(canonicalRun);
  if (!RUN_ID_PATTERN.test(runId)) fail('run root ID is invalid');
  if (path.dirname(canonicalRun) !== path.join(canonicalTmp, 'runs')) {
    fail('run root is outside the exact runs directory');
  }
  const markerPath = path.join(canonicalRun, RUN_MARKER);
  const markerInformation = fs.lstatSync(markerPath);
  if (
    !markerInformation.isFile() ||
    markerInformation.isSymbolicLink() ||
    markerInformation.nlink !== 1 ||
    (markerInformation.mode & 0o222) !== 0
  ) {
    fail('run ownership marker is not one immutable regular file');
  }
  const marker = readCanonicalJson(markerPath);
  if (
    Object.keys(marker).sort().join(',') !==
      'owner,purpose,rootDevice,rootInode,runId,schemaVersion' ||
    marker.schemaVersion !== 'operations-run-root-v1' ||
    marker.runId !== runId ||
    !OWNER_PATTERN.test(marker.owner) ||
    !PURPOSE_PATTERN.test(marker.purpose)
  ) {
    fail('run ownership marker is invalid');
  }
  if (expectedOwner !== undefined && marker.owner !== expectedOwner) {
    fail('run owner differs from the expected owner');
  }
  if (expectedPurpose !== undefined && marker.purpose !== expectedPurpose) {
    fail('run purpose differs from the expected purpose');
  }
  const currentIdentity = numericIdentity(canonicalRun);
  if (
    marker.rootDevice !== currentIdentity.device ||
    marker.rootInode !== currentIdentity.inode
  ) {
    fail('run root identity differs from its ownership marker');
  }
  return deepFreeze({
    owner: marker.owner,
    purpose: marker.purpose,
    runId,
    runRoot: canonicalRun,
    markerPath,
    markerDigest: canonicalJsonDigest(marker),
  });
}

export function inventoryRunRoot(runRoot, options) {
  const owned = attestRunRoot(runRoot, options);
  const entries = [];
  function visit(directory) {
    for (const name of fs
      .readdirSync(directory)
      .sort((left, right) => left.localeCompare(right, 'en'))) {
      const absolute = path.join(directory, name);
      const relative = path.relative(owned.runRoot, absolute).split(path.sep).join('/');
      const information = fs.lstatSync(absolute, { bigint: true });
      if (information.isSymbolicLink()) {
        fail(`run root contains symbolic link ${relative}`);
      }
      if (information.isDirectory()) {
        entries.push({
          identity: inventoryIdentity(information),
          path: `${relative}/`,
          type: 'directory',
        });
        visit(absolute);
      } else if (information.isFile()) {
        if (information.nlink !== 1n) {
          fail(`run root contains hard-linked file ${relative}`);
        }
        entries.push({
          identity: inventoryIdentity(information),
          path: relative,
          type: 'file',
        });
      } else {
        fail(`run root contains special file ${relative}`);
      }
    }
  }
  visit(owned.runRoot);
  const inventory = deepFreeze({
    ...owned,
    entries,
    entriesDigest: canonicalJsonDigest(entries),
    rootIdentity: inventoryIdentity(
      fs.lstatSync(owned.runRoot, { bigint: true }),
    ),
  });
  ADMITTED_RUN_INVENTORIES.add(inventory);
  return inventory;
}

export function cleanupInventoriedRunRoot(inventory) {
  if (!ADMITTED_RUN_INVENTORIES.has(inventory)) {
    fail('run cleanup requires an inventory captured by this process');
  }

  assertInventoriedIdentity(
    inventory.runRoot,
    inventory.rootIdentity,
    'owned run root',
  );
  for (const entry of inventory.entries) {
    const relative = entry.path.endsWith('/')
      ? entry.path.slice(0, -1)
      : entry.path;
    assertInventoriedIdentity(
      path.join(inventory.runRoot, ...relative.split('/')),
      entry.identity,
      `owned run ${entry.type} ${entry.path}`,
    );
  }

  const initialDirectories = new Map([
    ['', inventory.rootIdentity],
    ...inventory.entries
      .filter((entry) => entry.type === 'directory')
      .map((entry) => [entry.path.slice(0, -1), entry.identity]),
  ]);
  const expectedDirectories = new Map(initialDirectories);

  function assertExpectedDirectory(relative) {
    const absolute = relative
      ? path.join(inventory.runRoot, ...relative.split('/'))
      : inventory.runRoot;
    const expected = expectedDirectories.get(relative);
    if (!expected) fail(`owned run directory ${relative || '.'} was not inventoried`);
    return assertInventoriedIdentity(
      absolute,
      expected,
      `owned run directory ${relative || '.'}`,
    );
  }

  function refreshExpectedDirectory(relative) {
    const absolute = relative
      ? path.join(inventory.runRoot, ...relative.split('/'))
      : inventory.runRoot;
    const actual = capturePathIdentity(absolute, {
      label: `owned run directory ${relative || '.'}`,
      includeDigest: false,
    });
    const initial = initialDirectories.get(relative);
    assertStableOwnedIdentity(
      actual,
      initial,
      `owned run directory ${relative || '.'}`,
    );
    expectedDirectories.set(relative, {
      device: actual.device,
      inode: actual.inode,
      links: actual.links,
      mode: actual.mode,
      modifiedNs: actual.modifiedNs,
      size: actual.size,
      type: actual.type,
    });
  }

  const files = inventory.entries
    .filter((entry) => entry.type === 'file')
    .sort((left, right) => right.path.localeCompare(left.path, 'en'));
  for (const entry of files) {
    const absolute = path.join(
      inventory.runRoot,
      ...entry.path.split('/'),
    );
    assertInventoriedIdentity(
      absolute,
      entry.identity,
      `owned run file ${entry.path}`,
    );
    const parent = path.posix.dirname(entry.path);
    const parentRelative = parent === '.' ? '' : parent;
    assertExpectedDirectory(parentRelative);
    fs.unlinkSync(absolute);
    refreshExpectedDirectory(parentRelative);
  }

  const directories = inventory.entries
    .filter((entry) => entry.type === 'directory')
    .map((entry) => entry.path.slice(0, -1))
    .sort((left, right) => {
      const depth = right.split('/').length - left.split('/').length;
      return depth || right.localeCompare(left, 'en');
    });
  for (const relative of directories) {
    const parent = path.posix.dirname(relative);
    const parentRelative = parent === '.' ? '' : parent;
    assertExpectedDirectory(relative);
    assertExpectedDirectory(parentRelative);
    fs.rmdirSync(path.join(inventory.runRoot, ...relative.split('/')));
    expectedDirectories.delete(relative);
    refreshExpectedDirectory(parentRelative);
  }
  assertExpectedDirectory('');
  fs.rmdirSync(inventory.runRoot);
  ADMITTED_RUN_INVENTORIES.delete(inventory);

  const runsRoot = path.dirname(inventory.runRoot);
  const tmpRoot = path.dirname(runsRoot);
  for (const candidate of [runsRoot, tmpRoot]) {
    try {
      if (fs.readdirSync(candidate).length === 0) fs.rmdirSync(candidate);
    } catch (error) {
      if (!['ENOENT', 'ENOTEMPTY'].includes(error?.code)) throw error;
    }
  }
}

export function cleanupRunRoot(runRoot, options) {
  return cleanupInventoriedRunRoot(inventoryRunRoot(runRoot, options));
}
