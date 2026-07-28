import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  canonicalJson,
  canonicalJsonDigest,
  deepFreeze,
} from '../lib/canonical-json.mjs';
import { assertSha256, sha256File } from '../lib/digest.mjs';
import {
  assertSafeRelativePath,
  requireCanonicalPath,
  resolveContainedPath,
} from '../lib/path-policy.mjs';
import { writeImmutableFile } from '../lib/immutable-output.mjs';

const COPY_BUFFER_SIZE = 1024 * 1024;
const CHECKSUM_LINE = /^([0-9a-f]{64})  ([A-Za-z0-9][A-Za-z0-9._/-]*)$/u;

export class ReleaseFileError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'ReleaseFileError';
  }
}

function fail(message, cause) {
  throw new ReleaseFileError(message, cause ? { cause } : undefined);
}

function normalizedMode(information) {
  return (information.mode & 0o111n) === 0n ? '0444' : '0555';
}

function assertRealRegularFile(filePath, label = 'release input') {
  const canonical = requireCanonicalPath(filePath, {
    label,
    requireSingleLink: true,
    type: 'file',
  });
  const information = fs.lstatSync(canonical, { bigint: true });
  if (information.isSymbolicLink() || information.nlink !== 1n) {
    fail(`${label} must be a single-link regular file`);
  }
  return { canonical, information };
}

function sameFileIdentity(actual, expected) {
  return (
    actual.isFile() &&
    !actual.isSymbolicLink() &&
    actual.dev === expected.dev &&
    actual.ino === expected.ino &&
    actual.nlink === expected.nlink &&
    actual.mode === expected.mode &&
    actual.size === expected.size &&
    actual.mtimeNs === expected.mtimeNs
  );
}

function fsyncDirectory(directory) {
  const descriptor = fs.openSync(directory, fs.constants.O_RDONLY);
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function fileRecord(root, relativePath) {
  const absolute = resolveContainedPath(root, relativePath, {
    allowMissing: false,
    label: `release file ${relativePath}`,
  });
  const { information } = assertRealRegularFile(
    absolute,
    `release file ${relativePath}`,
  );
  const size = Number(information.size);
  if (!Number.isSafeInteger(size)) fail(`release file is too large: ${relativePath}`);
  return deepFreeze({
    mode: normalizedMode(information),
    path: relativePath,
    sha256: sha256File(absolute),
    size,
  });
}

function walk(root, current, records) {
  const entries = fs
    .readdirSync(current, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, 'en'));
  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    const relative = path.relative(root, absolute).split(path.sep).join('/');
    assertSafeRelativePath(relative, 'release inventory path');
    const information = fs.lstatSync(absolute);
    if (information.isSymbolicLink()) {
      fail(`symbolic links are forbidden in release trees: ${relative}`);
    }
    if (information.isDirectory()) {
      walk(root, absolute, records);
    } else if (information.isFile()) {
      records.push(fileRecord(root, relative));
    } else {
      fail(`special files are forbidden in release trees: ${relative}`);
    }
  }
}

export function inventoryTree(root, { exclude = [] } = {}) {
  const canonicalRoot = requireCanonicalPath(root, {
    label: 'release inventory root',
    type: 'directory',
  });
  const excluded = new Set(
    exclude.map((entry) => assertSafeRelativePath(entry, 'excluded inventory path')),
  );
  const records = [];
  walk(canonicalRoot, canonicalRoot, records);
  const filtered = records.filter((record) => !excluded.has(record.path));
  return deepFreeze(filtered);
}

export function compareInventories(first, second, label = 'release trees') {
  if (
    first.length !== second.length ||
    first.some((record, index) => {
      const other = second[index];
      return (
        !other ||
        record.mode !== other.mode ||
        record.path !== other.path ||
        record.sha256 !== other.sha256 ||
        record.size !== other.size
      );
    })
  ) {
    fail(`${label} are not byte-and-mode identical`);
  }
  return first;
}

export function copyImmutableFile({
  destinationRoot,
  destinationRelative,
  mode,
  source,
}) {
  const root = requireCanonicalPath(destinationRoot, {
    label: 'release destination root',
    type: 'directory',
  });
  const relative = assertSafeRelativePath(
    destinationRelative,
    'release destination path',
  );
  const sourceRecord = assertRealRegularFile(source, `release source ${relative}`);
  const desiredMode =
    mode === undefined
      ? (Number(sourceRecord.information.mode & 0o111n) === 0 ? 0o444 : 0o555)
      : mode;
  if (![0o444, 0o555].includes(desiredMode)) {
    fail('release file mode must be exactly 0444 or 0555');
  }
  const destination = resolveContainedPath(root, relative, {
    label: `release destination ${relative}`,
  });
  if (fs.existsSync(destination)) fail(`release destination exists: ${relative}`);
  const destinationParent = path.dirname(destination);
  fs.mkdirSync(destinationParent, { mode: 0o700, recursive: true });
  requireCanonicalPath(destinationParent, {
    ...(destinationParent === root ? {} : { below: root }),
    label: `release destination parent ${relative}`,
    type: 'directory',
  });
  const temporary = path.join(
    destinationParent,
    `.bgmss-copy-${randomBytes(16).toString('hex')}`,
  );
  const sourceFlags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0);
  const destinationFlags =
    fs.constants.O_CREAT |
    fs.constants.O_EXCL |
    fs.constants.O_WRONLY |
    (fs.constants.O_NOFOLLOW ?? 0);
  let input;
  let output;
  try {
    input = fs.openSync(sourceRecord.canonical, sourceFlags);
    output = fs.openSync(temporary, destinationFlags, 0o600);
    const openedSource = fs.fstatSync(input, { bigint: true });
    if (
      !sameFileIdentity(openedSource, sourceRecord.information)
    ) {
      fail(`release source changed before copy: ${relative}`);
    }
    const hash = createHash('sha256');
    const buffer = Buffer.allocUnsafe(COPY_BUFFER_SIZE);
    let total = 0n;
    while (total < openedSource.size) {
      const remaining = openedSource.size - total;
      const requested =
        remaining > BigInt(buffer.length) ? buffer.length : Number(remaining);
      const count = fs.readSync(input, buffer, 0, requested, null);
      if (count === 0) break;
      const bytes = buffer.subarray(0, count);
      hash.update(bytes);
      let written = 0;
      while (written < count) {
        written += fs.writeSync(output, bytes, written, count - written);
      }
      total += BigInt(count);
    }
    if (total !== openedSource.size) fail(`release source ended early: ${relative}`);
    const digest = `sha256:${hash.digest('hex')}`;
    if (
      !sameFileIdentity(fs.fstatSync(input, { bigint: true }), openedSource) ||
      !sameFileIdentity(
        fs.lstatSync(sourceRecord.canonical, { bigint: true }),
        sourceRecord.information,
      )
    ) {
      fail(`release source changed while copied: ${relative}`);
    }
    fs.fsyncSync(output);
    fs.fchmodSync(output, desiredMode);
    fs.fsyncSync(output);
    const temporaryIdentity = fs.fstatSync(output, { bigint: true });
    fs.closeSync(output);
    output = undefined;
    fs.closeSync(input);
    input = undefined;
    fs.renameSync(temporary, destination);
    fsyncDirectory(destinationParent);
    if (
      !sameFileIdentity(
        fs.lstatSync(destination, { bigint: true }),
        temporaryIdentity,
      )
    ) {
      fail(`release destination identity changed during publication: ${relative}`);
    }
    const copied = fileRecord(root, relative);
    if (copied.sha256 !== digest || copied.size !== Number(total)) {
      fail(`published release copy failed verification: ${relative}`);
    }
    return copied;
  } catch (error) {
    if (output !== undefined) {
      try {
        fs.closeSync(output);
      } catch {}
    }
    if (input !== undefined) {
      try {
        fs.closeSync(input);
      } catch {}
    }
    try {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    } catch {}
    if (error instanceof ReleaseFileError) throw error;
    fail(`cannot copy immutable release file ${relative}`, error);
  }
}

export function copyImmutableTree({ destinationRoot, prefix, sourceRoot }) {
  const source = requireCanonicalPath(sourceRoot, {
    label: 'release source tree',
    type: 'directory',
  });
  const safePrefix = assertSafeRelativePath(prefix, 'release tree prefix');
  const sourceInventory = inventoryTree(source);
  const copied = sourceInventory.map((record) =>
    copyImmutableFile({
      destinationRelative: `${safePrefix}/${record.path}`,
      destinationRoot,
      mode: record.mode === '0555' ? 0o555 : 0o444,
      source: path.join(source, ...record.path.split('/')),
    }),
  );
  return deepFreeze(copied);
}

export function descriptorForFile(root, relativePath) {
  return fileRecord(
    requireCanonicalPath(root, {
      label: 'descriptor root',
      type: 'directory',
    }),
    assertSafeRelativePath(relativePath, 'descriptor path'),
  );
}

export function serializeChecksumInventory(records) {
  const paths = records.map((record) => record.path);
  if (
    new Set(paths).size !== paths.length ||
    paths.some(
      (entry, index) =>
        index > 0 && paths[index - 1].localeCompare(entry, 'en') >= 0,
    )
  ) {
    fail('checksum inventory records must be unique and path-sorted');
  }
  return records
    .map((record) => `${assertSha256(record.sha256).slice(7)}  ${record.path}\n`)
    .join('');
}

export function parseChecksumInventory(source, label = 'checksum inventory') {
  if (typeof source !== 'string' || !source.endsWith('\n') || source.includes('\r')) {
    fail(`${label} must be LF-terminated text`);
  }
  const records = source
    .slice(0, -1)
    .split('\n')
    .map((line) => {
      const match = CHECKSUM_LINE.exec(line);
      if (!match) fail(`${label} contains an invalid line`);
      return deepFreeze({
        path: assertSafeRelativePath(match[2], `${label} path`),
        sha256: `sha256:${match[1]}`,
      });
    });
  const paths = records.map((record) => record.path);
  if (
    records.length === 0 ||
    new Set(paths).size !== paths.length ||
    paths.some(
      (entry, index) =>
        index > 0 && paths[index - 1].localeCompare(entry, 'en') >= 0,
    )
  ) {
    fail(`${label} paths must be non-empty, unique, and sorted`);
  }
  return deepFreeze(records);
}

export function verifyChecksumInventory({
  inventoryPath,
  root,
  requiredPaths,
}) {
  const canonicalRoot = requireCanonicalPath(root, {
    label: 'checksum verification root',
    type: 'directory',
  });
  const inventory = parseChecksumInventory(
    fs.readFileSync(inventoryPath, 'utf8'),
    inventoryPath,
  );
  if (requiredPaths) {
    const expected = [...requiredPaths].sort((left, right) =>
      left.localeCompare(right, 'en'),
    );
    if (
      inventory.length !== expected.length ||
      inventory.some((entry, index) => entry.path !== expected[index])
    ) {
      fail('checksum inventory does not exactly cover its closed path set');
    }
  }
  return deepFreeze(
    inventory.map((entry) => {
      const actual = descriptorForFile(canonicalRoot, entry.path);
      if (actual.sha256 !== entry.sha256) {
        fail(`checksum mismatch for ${entry.path}`);
      }
      return actual;
    }),
  );
}

export function writeCanonicalFile({
  root,
  relativePath,
  value,
  mode = 0o444,
}) {
  return writeImmutableFile({
    bytes: canonicalJson(value),
    mode,
    relativePath,
    root,
  });
}

export function completeInventoryDocument({
  candidateDocument,
  candidateKind,
  candidateRoot,
}) {
  const files = inventoryTree(candidateRoot);
  const totalSize = files.reduce((total, entry) => total + entry.size, 0);
  if (!Number.isSafeInteger(totalSize)) fail('candidate total size is unsafe');
  return deepFreeze({
    candidateDocument: assertSafeRelativePath(
      candidateDocument,
      'candidate document path',
    ),
    candidateKind,
    contentAddress: canonicalJsonDigest(files),
    fileCount: files.length,
    files,
    schemaVersion: 'operations-candidate-complete-inventory-v1',
    totalSize,
  });
}

export function compareTrees(firstRoot, secondRoot, label = 'release trees') {
  return compareInventories(
    inventoryTree(firstRoot),
    inventoryTree(secondRoot),
    label,
  );
}
