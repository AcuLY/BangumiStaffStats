import fs from 'node:fs';
import path from 'node:path';

import { ACCEPTANCE_ROOT } from './constants.mjs';
import { assertSafeRelativePath, requireCanonicalPath } from './paths.mjs';
import { readJsonStrict } from './strict-json.mjs';

export const ACCEPTANCE_INVENTORY_KIND =
  'bangumi-staff-stats-development-acceptance-inventory-v1';

const FORBIDDEN_SEGMENTS = new Set([
  '.tmp',
  'node_modules',
  'openspec',
  'skills',
]);
const FILE_MODE_PATTERN = /^0(?:644|755)$/u;

export class InventoryPolicyError extends Error {}

function fail(message) {
  throw new InventoryPolicyError(message);
}

function compareCodePoints(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort(compareCodePoints);
  const expected = [...keys].sort(compareCodePoints);
  if (
    actual.length !== expected.length ||
    actual.some((entry, index) => entry !== expected[index])
  ) {
    fail(`${label} fields must be exactly ${expected.join(', ')}`);
  }
  return value;
}

function assertAllowedRelativePath(value, label) {
  try {
    assertSafeRelativePath(value, label);
  } catch (error) {
    fail(error.message);
  }
  const forbidden = value
    .split('/')
    .find((segment) => FORBIDDEN_SEGMENTS.has(segment.toLowerCase()));
  if (forbidden) fail(`${label} contains forbidden segment ${forbidden}`);
  return value;
}

function assertSortedUnique(values, label) {
  for (let index = 1; index < values.length; index += 1) {
    const comparison = compareCodePoints(values[index - 1], values[index]);
    if (comparison === 0) fail(`${label} contains duplicate ${values[index]}`);
    if (comparison > 0) fail(`${label} must use code-point order`);
  }
}

function validateInventoryDocument(value) {
  const inventory = exactKeys(
    value,
    ['directories', 'files', 'kind', 'schemaVersion'],
    'acceptance inventory',
  );
  if (
    inventory.schemaVersion !== 1 ||
    inventory.kind !== ACCEPTANCE_INVENTORY_KIND
  ) {
    fail('acceptance inventory identity is invalid');
  }
  if (!Array.isArray(inventory.directories)) {
    fail('acceptance inventory.directories must be an array');
  }
  if (!Array.isArray(inventory.files)) {
    fail('acceptance inventory.files must be an array');
  }

  const directories = inventory.directories.map((entry, index) =>
    assertAllowedRelativePath(
      entry,
      `acceptance inventory.directories[${index}]`,
    ),
  );
  assertSortedUnique(directories, 'acceptance inventory.directories');

  const files = inventory.files.map((entry, index) => {
    const declaration = exactKeys(
      entry,
      ['mode', 'path'],
      `acceptance inventory.files[${index}]`,
    );
    assertAllowedRelativePath(
      declaration.path,
      `acceptance inventory.files[${index}].path`,
    );
    if (
      typeof declaration.mode !== 'string' ||
      !FILE_MODE_PATTERN.test(declaration.mode)
    ) {
      fail(
        `acceptance inventory.files[${index}].mode must be 0644 or 0755`,
      );
    }
    return declaration;
  });
  assertSortedUnique(
    files.map((entry) => entry.path),
    'acceptance inventory.files',
  );

  const directorySet = new Set(directories);
  for (const declaration of files) {
    let parent = path.posix.dirname(declaration.path);
    while (parent !== '.') {
      if (!directorySet.has(parent)) {
        fail(`acceptance inventory omits parent directory ${parent}`);
      }
      parent = path.posix.dirname(parent);
    }
  }
  for (const directory of directories) {
    const parent = path.posix.dirname(directory);
    if (parent !== '.' && !directorySet.has(parent)) {
      fail(`acceptance inventory omits parent directory ${parent}`);
    }
  }

  return Object.freeze({
    schemaVersion: 1,
    kind: ACCEPTANCE_INVENTORY_KIND,
    directories: Object.freeze([...directories]),
    files: Object.freeze(
      files.map((entry) =>
        Object.freeze({ path: entry.path, mode: entry.mode }),
      ),
    ),
  });
}

function displayMode(information) {
  return `0${(information.mode & 0o777).toString(8).padStart(3, '0')}`;
}

function walkPersistentTree(root) {
  const directories = [];
  const files = [];

  function visit(directory, prefix) {
    const entries = fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => compareCodePoints(left.name, right.name));
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      assertAllowedRelativePath(relative, 'persistent acceptance path');
      const absolute = path.join(directory, entry.name);
      const information = fs.lstatSync(absolute);
      if (information.isSymbolicLink()) {
        fail(`persistent acceptance tree contains symlink ${relative}`);
      }
      if (information.isDirectory()) {
        directories.push(relative);
        visit(absolute, relative);
        continue;
      }
      if (!information.isFile()) {
        fail(`persistent acceptance tree contains special file ${relative}`);
      }
      if (information.nlink !== 1) {
        fail(`persistent acceptance tree contains hard-linked file ${relative}`);
      }
      files.push(Object.freeze({ path: relative, mode: displayMode(information) }));
    }
  }

  visit(root, '');
  return Object.freeze({
    directories: Object.freeze(directories),
    files: Object.freeze(files),
  });
}

function assertExactPaths(actual, expected, label) {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const unexpected = actual.filter((entry) => !expectedSet.has(entry));
  if (unexpected.length > 0) {
    fail(`${label} contains unexpected path ${unexpected[0]}`);
  }
  const missing = expected.filter((entry) => !actualSet.has(entry));
  if (missing.length > 0) fail(`${label} is missing path ${missing[0]}`);
}

export function validatePersistentInventory({ root, inventory }) {
  let canonicalRoot;
  try {
    canonicalRoot = requireCanonicalPath(path.resolve(root), {
      label: 'acceptance inventory root',
      type: 'directory',
    });
  } catch (error) {
    fail(error.message);
  }
  const declaration = validateInventoryDocument(inventory);
  const actual = walkPersistentTree(canonicalRoot);

  assertExactPaths(
    actual.directories,
    declaration.directories,
    'persistent acceptance directories',
  );
  assertExactPaths(
    actual.files.map((entry) => entry.path),
    declaration.files.map((entry) => entry.path),
    'persistent acceptance files',
  );
  const modes = new Map(actual.files.map((entry) => [entry.path, entry.mode]));
  for (const expected of declaration.files) {
    const actualMode = modes.get(expected.path);
    if (actualMode !== expected.mode) {
      fail(
        `persistent acceptance file ${expected.path} has mode ${actualMode}; ` +
          `expected ${expected.mode}`,
      );
    }
  }

  return Object.freeze({
    root: canonicalRoot,
    directoryCount: actual.directories.length,
    fileCount: actual.files.length,
  });
}

export function verifyAcceptanceInventory(root = ACCEPTANCE_ROOT) {
  let canonicalRoot;
  try {
    canonicalRoot = requireCanonicalPath(path.resolve(root), {
      label: 'acceptance inventory root',
      type: 'directory',
    });
  } catch (error) {
    fail(error.message);
  }
  const inventoryPath = path.join(canonicalRoot, 'inventory.json');
  let information;
  try {
    information = fs.lstatSync(inventoryPath);
  } catch (error) {
    fail(`acceptance inventory manifest is unavailable: ${error.message}`);
  }
  if (
    information.isSymbolicLink() ||
    !information.isFile() ||
    information.nlink !== 1
  ) {
    fail('acceptance inventory manifest must be one regular non-linked file');
  }
  if (fs.realpathSync.native(inventoryPath) !== inventoryPath) {
    fail('acceptance inventory manifest path is not canonical');
  }
  const inventory = validateInventoryDocument(readJsonStrict(inventoryPath));
  if (!inventory.files.some((entry) => entry.path === 'inventory.json')) {
    fail('acceptance inventory must declare inventory.json');
  }
  return validatePersistentInventory({ root: canonicalRoot, inventory });
}
