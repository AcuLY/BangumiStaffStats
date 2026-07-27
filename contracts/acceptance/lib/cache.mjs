import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { canonicalJson, canonicalJsonDigest } from './canonical-json.mjs';
import {
  assertNoSymlinkAncestors,
  isStrictlyBelow,
  requireCanonicalPath,
  resolveProspectiveCanonicalPath,
  sha256Bytes,
} from './paths.mjs';
import { sha256File } from './seal.mjs';
import { readJsonStrict } from './strict-json.mjs';

export class CacheSeedError extends Error {}

export const GO_TOOLCHAIN_MODULE = 'golang.org/toolchain';
export const GO_TOOLCHAIN_VERSION = 'v0.0.1-go1.26.5.darwin-arm64';
export const GO_CONTENT_SET_COUNT = 62;
export const GO_CONTENT_SET_SHA256 =
  '65d2972c8632a90b2e3331071db6016db037480e7fe04a615e44931656f31bb7';
export const GO_MATERIALIZATION_LOCK_SET_SHA256 =
  '0429a1eb475367e7950d45e11c826632893b8a08892b78985da17bedb30e7f28';

const GO_CONTENT_ASSET_SUFFIXES = Object.freeze([
  '.info',
  '.mod',
  '.zip',
  '.ziphash',
]);
const GO_LOCK_MODE = 0o644;
const GO_LOCK_MODE_MASK = 0o7777;
const GO_LOCK_STAGING_PREFIX = '.bgmss-go-lock-staging-';

function goToolchainRelativeRoot() {
  const parts = GO_TOOLCHAIN_MODULE.split('/');
  const name = parts.pop();
  return path.join(...parts, `${name}@${GO_TOOLCHAIN_VERSION}`);
}

function fail(message) {
  throw new CacheSeedError(message);
}

function ensureDestination(destination) {
  if (fs.existsSync(destination)) fail(`cache destination already exists: ${destination}`);
  fs.mkdirSync(destination, { recursive: true, mode: 0o700 });
}

function assertDisjointTreeCopy(source, destination) {
  if (
    !path.isAbsolute(destination) ||
    path.resolve(destination) !== destination
  ) {
    fail('cache destination is not one normalized absolute path');
  }
  assertNoSymlinkAncestors(destination, 'cache destination');
  const canonicalDestination = resolveProspectiveCanonicalPath(
    destination,
    'cache destination',
  );
  if (
    canonicalDestination === source ||
    isStrictlyBelow(canonicalDestination, source) ||
    isStrictlyBelow(source, canonicalDestination)
  ) {
    fail('cache source and destination overlap');
  }
  if (canonicalDestination !== destination) {
    fail('cache destination is not one prospective canonical path');
  }
}

function copyRegularFile(source, destination) {
  const information = fs.lstatSync(source);
  if (information.isSymbolicLink() || !information.isFile()) {
    fail(`cache source is not a regular file: ${source}`);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_FICLONE);
  const copied = fs.statSync(destination);
  if (copied.dev === information.dev && copied.ino === information.ino) {
    fail(`cache seed created a hard link: ${source}`);
  }
  fs.chmodSync(destination, information.mode & 0o777);
}

function visitRegularTree(root, prefix, entries) {
  for (const entry of fs
    .readdirSync(root, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
    const absolute = path.join(root, entry.name);
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const information = fs.lstatSync(absolute);
    if (information.isSymbolicLink()) fail(`cache contains symlink ${absolute}`);
    if (information.isDirectory()) {
      visitRegularTree(absolute, relative, entries);
    } else if (information.isFile()) {
      entries.push(relative);
    } else {
      fail(`cache contains special file ${absolute}`);
    }
  }
}

export function copyCacheTree(source, destination) {
  const root = requireCanonicalPath(source, {
    label: 'cache source',
    type: 'directory',
  });
  assertDisjointTreeCopy(root, destination);
  ensureDestination(destination);
  assertDisjointTreeCopy(root, destination);
  function visit(sourceDirectory, destinationDirectory) {
    for (const entry of fs.readdirSync(sourceDirectory, { withFileTypes: true })) {
      const sourcePath = path.join(sourceDirectory, entry.name);
      const destinationPath = path.join(destinationDirectory, entry.name);
      const information = fs.lstatSync(sourcePath);
      if (information.isSymbolicLink()) fail(`cache contains symlink ${sourcePath}`);
      if (information.isDirectory()) {
        // Caller-owned cache inputs are frozen read-only. Keep the new tree
        // writable while populating it; copying a 0555 mode before descending
        // would make the first nested file impossible to create.
        fs.mkdirSync(destinationPath, { mode: 0o700 });
        visit(sourcePath, destinationPath);
      } else if (information.isFile()) {
        copyRegularFile(sourcePath, destinationPath);
      } else {
        fail(`cache contains special file ${sourcePath}`);
      }
    }
    const sourceMode = fs.lstatSync(sourceDirectory).mode & 0o777;
    fs.chmodSync(destinationDirectory, sourceMode);
  }
  visit(root, destination);
  return destination;
}

function npmCacacheRoot(source) {
  const root = requireCanonicalPath(source, {
    label: 'npm cache source',
    type: 'directory',
  });
  if (path.basename(root) === '_cacache') return root;
  return requireCanonicalPath(path.join(root, '_cacache'), {
    label: 'npm content cache source',
    type: 'directory',
  });
}

function integrityPath(cacheRoot, integrity) {
  const match = /^(sha512|sha256)-([A-Za-z0-9+/]+={0,2})$/u.exec(integrity);
  if (!match) fail(`unsupported package integrity: ${integrity}`);
  const hexadecimal = Buffer.from(match[2], 'base64').toString('hex');
  if (hexadecimal.length < 8) fail(`short package integrity: ${integrity}`);
  return path.join(
    cacheRoot,
    'content-v2',
    match[1],
    hexadecimal.slice(0, 2),
    hexadecimal.slice(2, 4),
    hexadecimal.slice(4),
  );
}

export function collectLockIntegrities(lockPaths) {
  const integrities = new Set();
  for (const lockPath of lockPaths) {
    const lock = readJsonStrict(lockPath);
    const packages = lock.packages;
    if (!packages || typeof packages !== 'object' || Array.isArray(packages)) {
      fail(`lockfile has no package closure: ${lockPath}`);
    }
    for (const declaration of Object.values(packages)) {
      if (declaration?.integrity) integrities.add(declaration.integrity);
    }
  }
  return Object.freeze([...integrities].sort());
}

export function seedNpmCache({ source, destination, lockPaths }) {
  const cacache = npmCacacheRoot(source);
  ensureDestination(destination);
  const destinationCache = path.join(destination, '_cacache');
  fs.mkdirSync(destinationCache, { mode: 0o700 });
  const indexSource = path.join(cacache, 'index-v5');
  if (fs.existsSync(indexSource)) {
    copyCacheTree(indexSource, path.join(destinationCache, 'index-v5'));
  }
  for (const integrity of collectLockIntegrities(lockPaths)) {
    const sourcePath = integrityPath(cacache, integrity);
    if (!fs.existsSync(sourcePath)) {
      fail(`npm cache is missing locked content ${integrity}`);
    }
    const relative = path.relative(cacache, sourcePath);
    copyRegularFile(sourcePath, path.join(destinationCache, relative));
  }
  fs.writeFileSync(path.join(destination, '.seed-complete'), 'npm-cache-v1\n', {
    flag: 'wx',
    mode: 0o400,
  });
  return destination;
}

function escapeModulePath(modulePath) {
  let result = '';
  for (const character of modulePath) {
    if (/[A-Z]/u.test(character)) result += `!${character.toLowerCase()}`;
    else result += character;
  }
  return result;
}

function terminalLfListSha256(values) {
  return sha256Bytes(
    Buffer.from(`${values.join('\n')}\n`, 'utf8'),
  ).slice('sha256:'.length);
}

function moduleContentDeclaration(record, label) {
  if (typeof record !== 'string') fail(`${label} is not a string`);
  const separator = record.lastIndexOf('@');
  const module = record.slice(0, separator);
  const version = record.slice(separator + 1);
  if (
    separator < 1 ||
    module.includes('@') ||
    !/^v[0-9][A-Za-z0-9.+_-]*$/u.test(version)
  ) {
    fail(`${label} is not one exact module@version record`);
  }
  return Object.freeze({ module, version });
}

function contentSeedAssetPaths(items) {
  return items.flatMap((record, index) => {
    const declaration = moduleContentDeclaration(
      record,
      `Go content set record ${index}`,
    );
    const escaped = escapeModulePath(declaration.module);
    const versionRoot = path.posix.join(
      'cache',
      'download',
      ...escaped.split('/'),
      '@v',
    );
    return GO_CONTENT_ASSET_SUFFIXES.map((suffix) =>
      path.posix.join(versionRoot, `${declaration.version}${suffix}`));
  });
}

function contentLockPaths(items) {
  return items
    .map((record, index) => {
      const declaration = moduleContentDeclaration(
        record,
        `Go content set record ${index}`,
      );
      return path.posix.join(
        'cache',
        'download',
        ...escapeModulePath(declaration.module).split('/'),
        '@v',
        `${declaration.version}.lock`,
      );
    })
    .sort((left, right) => left.localeCompare(right, 'en'));
}

function buildGoModuleContentSet(items) {
  const records = Object.freeze([...items]);
  const seedAssetPaths = Object.freeze(contentSeedAssetPaths(records));
  const lockPaths = Object.freeze(contentLockPaths(records));
  return Object.freeze({
    count: records.length,
    items: records,
    lockCount: lockPaths.length,
    lockPaths,
    lockSetSha256: terminalLfListSha256(lockPaths),
    seedAssetPaths,
    setSha256: terminalLfListSha256(records),
  });
}

export function validateGoModuleContentSet(contentSet) {
  requireExactObjectKeys(
    contentSet,
    [
      'count',
      'items',
      'lockCount',
      'lockPaths',
      'lockSetSha256',
      'seedAssetPaths',
      'setSha256',
    ],
    'Go content set',
  );
  if (
    !Array.isArray(contentSet.items) ||
    !Array.isArray(contentSet.lockPaths) ||
    !Array.isArray(contentSet.seedAssetPaths)
  ) {
    fail('Go content set paths and records must be arrays');
  }
  const sortedUnique = [...new Set(contentSet.items)].sort((left, right) =>
    left.localeCompare(right, 'en'));
  const expected = buildGoModuleContentSet(sortedUnique);
  if (
    contentSet.count !== GO_CONTENT_SET_COUNT ||
    contentSet.lockCount !== GO_CONTENT_SET_COUNT ||
    contentSet.setSha256 !== GO_CONTENT_SET_SHA256 ||
    contentSet.lockSetSha256 !== GO_MATERIALIZATION_LOCK_SET_SHA256 ||
    !Object.isFrozen(contentSet.items) ||
    !Object.isFrozen(contentSet.lockPaths) ||
    !Object.isFrozen(contentSet.seedAssetPaths) ||
    !Object.isFrozen(contentSet) ||
    !isDeepStrictEqual(contentSet, expected)
  ) {
    fail('Go content set does not match the exact checksum authority');
  }
  return contentSet;
}

export function deriveGoModuleContentSet(goSumPath) {
  const canonicalGoSum = requireCanonicalPath(goSumPath, {
    label: 'backend go.sum',
    type: 'file',
  });
  const records = new Set();
  const source = fs.readFileSync(canonicalGoSum, 'utf8');
  for (const [lineNumber, line] of source.split(/\r?\n/u).entries()) {
    if (!line) continue;
    const match = /^(\S+) (\S+) h1:[A-Za-z0-9+/=]+$/u.exec(line);
    if (!match) fail(`invalid go.sum line ${lineNumber + 1}`);
    if (match[2].endsWith('/go.mod')) continue;
    const record = `${match[1]}@${match[2]}`;
    moduleContentDeclaration(record, `go.sum line ${lineNumber + 1}`);
    records.add(record);
  }
  const contentSet = buildGoModuleContentSet(
    [...records].sort((left, right) => left.localeCompare(right, 'en')),
  );
  return validateGoModuleContentSet(contentSet);
}

export function validateGoModuleContentSeedAssets(source, contentSet) {
  const root = requireCanonicalPath(source, {
    label: 'Go module cache source',
    type: 'directory',
  });
  validateGoModuleContentSet(contentSet);
  for (const relative of contentSet.seedAssetPaths) {
    const absolute = path.join(root, ...relative.split('/'));
    if (!isStrictlyBelow(absolute, root)) {
      fail(`Go content seed path escapes its cache root: ${relative}`);
    }
    assertNoSymlinkAncestors(absolute, `Go content seed ${relative}`);
    const canonical = requireCanonicalPath(absolute, {
      label: `Go content seed ${relative}`,
      type: 'file',
    });
    const information = fs.lstatSync(canonical);
    if (
      information.isSymbolicLink() ||
      !information.isFile() ||
      information.nlink !== 1
    ) {
      fail(`Go content seed is not an admitted regular file: ${relative}`);
    }
  }
  return contentSet;
}

function relativePosix(root, absolute) {
  return path.relative(root, absolute).split(path.sep).join('/');
}

function inspectGoDownloadState(root) {
  const downloadRoot = requireCanonicalPath(
    path.join(root, 'cache', 'download'),
    {
      label: 'materialized Go download cache',
      type: 'directory',
    },
  );
  const locks = [];
  const temporary = [];
  function visit(directory) {
    for (const entry of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
      const absolute = path.join(directory, entry.name);
      const relative = relativePosix(root, absolute);
      const information = fs.lstatSync(absolute);
      if (information.isSymbolicLink()) {
        fail(`materialized Go download cache contains symlink ${relative}`);
      }
      if (information.isDirectory()) {
        visit(absolute);
        continue;
      }
      if (!information.isFile()) {
        fail(`materialized Go download cache contains special file ${relative}`);
      }
      if (entry.name.endsWith('.lock')) locks.push(relative);
      if (
        entry.name.endsWith('.tmp') ||
        entry.name.includes('.tmp-') ||
        entry.name.endsWith('.partial')
      ) {
        temporary.push(relative);
      }
    }
  }
  visit(downloadRoot);
  return Object.freeze({
    locks: Object.freeze(
      locks.sort((left, right) => left.localeCompare(right, 'en')),
    ),
    temporary: Object.freeze(
      temporary.sort((left, right) => left.localeCompare(right, 'en')),
    ),
  });
}

function pathExistsNoFollow(absolute) {
  try {
    fs.lstatSync(absolute);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    return true;
  }
}

function isGoExtractionTemporaryName(name) {
  const separator = name.lastIndexOf('@');
  if (separator < 1) return false;
  return /^v[^/\\]+\.tmp-[^/\\]+$/u.test(
    name.slice(separator + 1),
  );
}

function isCompletedGoModuleDirectory(name) {
  const separator = name.lastIndexOf('@');
  if (separator < 1) return false;
  return /^v[0-9][^/\\]*$/u.test(name.slice(separator + 1));
}

function inspectGoExtractionTemporaryState(root, excludedRoot) {
  const temporary = [];
  const downloadRoot = path.join(root, 'cache', 'download');
  function visit(directory) {
    for (const entry of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
      const absolute = path.join(directory, entry.name);
      if (absolute === excludedRoot) continue;
      const relative = relativePosix(root, absolute);
      const information = fs.lstatSync(absolute);
      if (
        entry.name.startsWith(GO_LOCK_STAGING_PREFIX) ||
        (information.isDirectory() &&
          isGoExtractionTemporaryName(entry.name))
      ) {
        temporary.push(relative);
        continue;
      }
      if (
        information.isSymbolicLink() ||
        !information.isDirectory() ||
        absolute === downloadRoot ||
        isCompletedGoModuleDirectory(entry.name)
      ) {
        continue;
      }
      visit(absolute);
    }
  }
  visit(root);
  return Object.freeze(
    temporary.sort((left, right) => left.localeCompare(right, 'en')),
  );
}

function assertNoGoTemporaryState(root, excludedRoot) {
  const download = inspectGoDownloadState(root);
  const extraction = inspectGoExtractionTemporaryState(root, excludedRoot);
  if (download.temporary.length !== 0) {
    fail(
      `materialized Go download cache retains temporary state: ${download.temporary[0]}`,
    );
  }
  if (extraction.length !== 0) {
    fail(
      `materialized Go cache retains temporary extraction ${extraction[0]}`,
    );
  }
  return download;
}

function readMaterializedGoLockIdentity(absolute, relative) {
  let information;
  try {
    information = fs.lstatSync(absolute);
  } catch {
    fail(`materialized Go lock identity is unavailable: ${relative}`);
  }
  if (
    information.isSymbolicLink() ||
    !information.isFile() ||
    (information.mode & GO_LOCK_MODE_MASK) !== GO_LOCK_MODE ||
    information.size !== 0 ||
    information.nlink !== 1
  ) {
    fail(`materialized Go lock has invalid identity: ${relative}`);
  }
  return Object.freeze({
    dev: information.dev,
    ino: information.ino,
    mode: information.mode,
    nlink: information.nlink,
    size: information.size,
  });
}

function materializedGoLockIdentityMatches(left, right) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.nlink === right.nlink &&
    left.size === right.size
  );
}

function requireMaterializedGoLockIdentity(absolute, relative, admitted) {
  const observed = readMaterializedGoLockIdentity(absolute, relative);
  if (!materializedGoLockIdentityMatches(observed, admitted)) {
    fail(`materialized Go lock changed before removal: ${relative}`);
  }
  return observed;
}

function createGoLockStagingRoot(root) {
  const rootInformation = fs.lstatSync(root);
  const staging = fs.mkdtempSync(path.join(root, GO_LOCK_STAGING_PREFIX));
  fs.chmodSync(staging, 0o700);
  const canonical = requireCanonicalPath(staging, {
    label: 'materialized Go lock staging root',
    type: 'directory',
  });
  const information = fs.lstatSync(canonical);
  if (
    canonical !== staging ||
    !isStrictlyBelow(canonical, root) ||
    path.dirname(canonical) !== root ||
    information.isSymbolicLink() ||
    !information.isDirectory() ||
    information.dev !== rootInformation.dev ||
    (information.mode & GO_LOCK_MODE_MASK) !== 0o700
  ) {
    fail('materialized Go lock staging root is not private and contained');
  }
  return canonical;
}

function restoreStagedGoLocks(staged, stagingRoot) {
  let restorationError;
  for (const entry of [...staged].reverse()) {
    if (!pathExistsNoFollow(entry.stagedPath)) continue;
    if (pathExistsNoFollow(entry.originalPath)) {
      restorationError ??= new CacheSeedError(
        `materialized Go lock restoration target was rebound: ${entry.relative}`,
      );
      continue;
    }
    try {
      fs.renameSync(entry.stagedPath, entry.originalPath);
      if (
        entry.stagedIdentity !== undefined &&
        !materializedGoLockIdentityMatches(
          readMaterializedGoLockIdentity(
            entry.originalPath,
            entry.relative,
          ),
          entry.stagedIdentity,
        )
      ) {
        restorationError ??= new CacheSeedError(
          `materialized Go lock restoration changed identity: ${entry.relative}`,
        );
      }
    } catch (error) {
      restorationError ??= new CacheSeedError(
        `materialized Go lock restoration failed: ${entry.relative} (${error?.code ?? 'unknown'})`,
      );
    }
  }
  if (pathExistsNoFollow(stagingRoot)) {
    try {
      fs.rmdirSync(stagingRoot);
    } catch (error) {
      restorationError ??= new CacheSeedError(
        `materialized Go lock staging root survived restoration (${error?.code ?? 'unknown'})`,
      );
    }
  }
  return restorationError;
}

export function removeGoMaterializationLocks({ root, contentSet }) {
  const canonicalRoot = requireCanonicalPath(root, {
    label: 'materialized Go module cache',
    type: 'directory',
  });
  validateGoModuleContentSet(contentSet);
  const before = assertNoGoTemporaryState(canonicalRoot);
  if (
    before.locks.length !== GO_CONTENT_SET_COUNT ||
    terminalLfListSha256(before.locks) !==
      GO_MATERIALIZATION_LOCK_SET_SHA256 ||
    !isDeepStrictEqual(before.locks, contentSet.lockPaths)
  ) {
    fail('materialized Go cache does not contain the exact content lock set');
  }
  const admitted = [];
  for (const relative of contentSet.lockPaths) {
    const absolute = path.join(canonicalRoot, ...relative.split('/'));
    if (!isStrictlyBelow(absolute, canonicalRoot)) {
      fail(`materialized Go lock escapes its cache root: ${relative}`);
    }
    assertNoSymlinkAncestors(absolute, `materialized Go lock ${relative}`);
    const canonical = requireCanonicalPath(absolute, {
      label: `materialized Go lock ${relative}`,
      type: 'file',
    });
    const identity = readMaterializedGoLockIdentity(canonical, relative);
    admitted.push(Object.freeze({
      identity,
      originalPath: canonical,
      relative,
    }));
  }
  const stagingRoot = createGoLockStagingRoot(canonicalRoot);
  const staged = [];
  try {
    for (const [index, entry] of admitted.entries()) {
      requireMaterializedGoLockIdentity(
        entry.originalPath,
        entry.relative,
        entry.identity,
      );
      const stagedPath = path.join(
        stagingRoot,
        String(index).padStart(3, '0'),
      );
      if (
        !isStrictlyBelow(stagedPath, stagingRoot) ||
        pathExistsNoFollow(stagedPath)
      ) {
        fail(`materialized Go lock staging path is invalid: ${entry.relative}`);
      }
      const stagedEntry = {
        ...entry,
        stagedPath,
        stagedIdentity: undefined,
      };
      staged.push(stagedEntry);
      fs.renameSync(entry.originalPath, stagedPath);
      if (pathExistsNoFollow(entry.originalPath)) {
        fail(`materialized Go lock was rebound during staging: ${entry.relative}`);
      }
      stagedEntry.stagedIdentity = readMaterializedGoLockIdentity(
        stagedPath,
        entry.relative,
      );
      if (
        !materializedGoLockIdentityMatches(
          stagedEntry.stagedIdentity,
          entry.identity,
        )
      ) {
        fail(`materialized Go lock changed during staging: ${entry.relative}`);
      }
    }
    const stagedTargetState = assertNoGoTemporaryState(
      canonicalRoot,
      stagingRoot,
    );
    if (stagedTargetState.locks.length !== 0) {
      fail('materialized Go cache retains a lock outside private staging');
    }
    for (const entry of staged) {
      if (pathExistsNoFollow(entry.originalPath)) {
        fail(`materialized Go lock was rebound before removal: ${entry.relative}`);
      }
      requireMaterializedGoLockIdentity(
        entry.stagedPath,
        entry.relative,
        entry.identity,
      );
    }
  } catch (error) {
    const restorationError = restoreStagedGoLocks(staged, stagingRoot);
    if (restorationError !== undefined) throw restorationError;
    throw error;
  }

  // Node does not expose an inode-conditional unlink. The owner command and
  // its descendants are already settled here, so the unpredictable same-FS
  // 0700 staging rename is the authorization boundary. Recheck every staged
  // identity immediately before unlinking only from that private directory.
  for (const entry of staged) {
    if (pathExistsNoFollow(entry.originalPath)) {
      fail(`materialized Go lock was rebound before removal: ${entry.relative}`);
    }
    requireMaterializedGoLockIdentity(
      entry.stagedPath,
      entry.relative,
      entry.identity,
    );
    fs.unlinkSync(entry.stagedPath);
    if (
      pathExistsNoFollow(entry.stagedPath) ||
      pathExistsNoFollow(entry.originalPath)
    ) {
      fail(`materialized Go lock survived private staging removal: ${entry.relative}`);
    }
  }
  fs.rmdirSync(stagingRoot);
  if (pathExistsNoFollow(stagingRoot)) {
    fail('materialized Go lock staging root survived cleanup');
  }
  const after = assertNoGoTemporaryState(canonicalRoot);
  if (after.locks.length !== 0) {
    fail('materialized Go cache retains lock or temporary state after cleanup');
  }
  for (const relative of contentSet.lockPaths) {
    if (
      pathExistsNoFollow(path.join(canonicalRoot, ...relative.split('/')))
    ) {
      fail(`materialized Go lock survived cleanup: ${relative}`);
    }
  }
  return Object.freeze({
    count: contentSet.lockCount,
    setSha256: contentSet.lockSetSha256,
  });
}

function goModules(goSumPath) {
  const modules = new Map();
  const source = fs.readFileSync(goSumPath, 'utf8');
  for (const [lineNumber, line] of source.split(/\r?\n/u).entries()) {
    if (!line) continue;
    const match = /^(\S+) (\S+) h1:[A-Za-z0-9+/=]+$/u.exec(line);
    if (!match) fail(`invalid go.sum line ${lineNumber + 1}`);
    const goModOnly = match[2].endsWith('/go.mod');
    const version = goModOnly ? match[2].slice(0, -'/go.mod'.length) : match[2];
    if (!/^v[0-9][A-Za-z0-9.+_-]*$/u.test(version)) {
      fail(`invalid Go module version on line ${lineNumber + 1}`);
    }
    const key = `${match[1]}@${version}`;
    const previous = modules.get(key);
    modules.set(key, {
      module: match[1],
      version,
      needsZip: Boolean(previous?.needsZip || !goModOnly),
    });
  }
  return [...modules.values()].sort((left, right) =>
    `${left.module}@${left.version}`.localeCompare(
      `${right.module}@${right.version}`,
      'en',
    ),
  );
}

function goModuleSeedPaths(sourceRoot, goSumPath) {
  const sourceDownload = path.join(sourceRoot, 'cache', 'download');
  const paths = [];
  for (const declaration of goModules(goSumPath)) {
    const escaped = escapeModulePath(declaration.module);
    const versionRoot = path.join('cache', 'download', ...escaped.split('/'), '@v');
    const requiredSuffixes = declaration.needsZip
      ? ['.info', '.mod', '.zip', '.ziphash']
      : ['.mod'];
    for (const suffix of requiredSuffixes) {
      const relative = path.join(versionRoot, `${declaration.version}${suffix}`);
      const sourcePath = path.join(sourceRoot, relative);
      if (!fs.existsSync(sourcePath)) {
        fail(
          `Go cache is missing ${declaration.module}@${declaration.version}${suffix}`,
        );
      }
      paths.push(relative);
    }
    for (const suffix of ['.info', '.zip', '.ziphash']) {
      const relative = path.join(versionRoot, `${declaration.version}${suffix}`);
      if (!paths.includes(relative) && fs.existsSync(path.join(sourceRoot, relative))) {
        paths.push(relative);
      }
    }
  }
  if (!fs.existsSync(sourceDownload)) fail('Go cache has no download directory');
  return paths;
}

function goToolchainSeedPaths(sourceRoot) {
  const toolchainRelative = goToolchainRelativeRoot();
  const toolchainRoot = path.join(sourceRoot, toolchainRelative);
  const information = fs.lstatSync(toolchainRoot);
  if (information.isSymbolicLink() || !information.isDirectory()) {
    fail('Go 1.26.5 toolchain source is not a real directory');
  }
  const descendants = [];
  visitRegularTree(toolchainRoot, toolchainRelative, descendants);
  const required = [
    `${toolchainRelative}/VERSION`,
    `${toolchainRelative}/bin/go`,
    `${toolchainRelative}/bin/gofmt`,
    `${toolchainRelative}/pkg/tool/darwin_arm64/compile`,
    `${toolchainRelative}/src/runtime/runtime.go`,
  ];
  for (const relative of required) {
    if (!descendants.includes(relative)) {
      fail(`Go 1.26.5 toolchain source is incomplete: ${relative}`);
    }
  }
  if (descendants.length < 1_000) {
    fail('Go 1.26.5 toolchain source is implausibly small');
  }
  return descendants;
}

export function createGoSeedPlan({ source, goSumPath }) {
  const sourceRoot = requireCanonicalPath(source, {
    label: 'Go module cache source',
    type: 'directory',
  });
  const canonicalGoSum = requireCanonicalPath(goSumPath, {
    label: 'backend go.sum',
    type: 'file',
  });
  const contentSet = deriveGoModuleContentSet(canonicalGoSum);
  validateGoModuleContentSeedAssets(sourceRoot, contentSet);
  const modulePaths = goModuleSeedPaths(sourceRoot, canonicalGoSum);
  const toolchainPaths = goToolchainSeedPaths(sourceRoot);
  const paths = Object.freeze(
    [...new Set([...modulePaths, ...toolchainPaths])].sort((left, right) =>
      left.localeCompare(right, 'en')),
  );
  return Object.freeze({
    contentSet,
    sourceRoot,
    goSumPath: canonicalGoSum,
    paths,
    moduleFileCount: modulePaths.length,
    toolchainFileCount: toolchainPaths.length,
  });
}

export async function sealGoSeedPlan(plan, root = plan.sourceRoot) {
  const entries = [];
  for (const relative of plan.paths) {
    const absolute = path.join(root, relative);
    const information = fs.lstatSync(absolute);
    if (information.isSymbolicLink() || !information.isFile()) {
      fail(`Go seed path is not a regular file: ${relative}`);
    }
    entries.push({
      path: relative,
      mode: information.mode & 0o777,
      size: information.size,
      sha256: await sha256File(absolute),
    });
  }
  return Object.freeze({
    entries: Object.freeze(entries),
    canonical: canonicalJson(entries),
    digest: canonicalJsonDigest(entries),
  });
}

function assertSameGoSeal(before, after, label) {
  if (before.canonical !== after.canonical || before.digest !== after.digest) {
    fail(`${label} changed while the isolated cache was seeded`);
  }
}

export async function seedGoModuleCache({ source, destination, goSumPath }) {
  const plan = createGoSeedPlan({ source, goSumPath });
  const sourceBefore = await sealGoSeedPlan(plan);
  ensureDestination(destination);
  for (const relative of plan.paths) {
    copyRegularFile(
      path.join(plan.sourceRoot, relative),
      path.join(destination, relative),
    );
  }
  const [sourceAfter, destinationSeal] = await Promise.all([
    sealGoSeedPlan(plan),
    sealGoSeedPlan(plan, destination),
  ]);
  assertSameGoSeal(sourceBefore, sourceAfter, 'Go seed source');
  assertSameGoSeal(sourceBefore, destinationSeal, 'Go seed destination');
  const marker = {
    schemaVersion: 1,
    sourceDigest: sourceBefore.digest,
    moduleFileCount: plan.moduleFileCount,
    toolchainFileCount: plan.toolchainFileCount,
    toolchainVersion: 'go1.26.5',
  };
  fs.writeFileSync(path.join(destination, '.seed-complete'), canonicalJson(marker), {
    flag: 'wx',
    mode: 0o400,
  });
  return Object.freeze({
    contentSet: plan.contentSet,
    destination,
    marker: Object.freeze(marker),
    sourceBefore,
    sourceAfter,
    destinationSeal,
  });
}

function requireExactObjectKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((name, index) => name !== wanted[index])
  ) {
    fail(`${label} has unexpected fields`);
  }
}

export function validateSeededGoToolchain(destination) {
  const root = requireCanonicalPath(destination, {
    label: 'seeded Go cache',
    type: 'directory',
  });
  const marker = readJsonStrict(path.join(root, '.seed-complete'));
  requireExactObjectKeys(
    marker,
    [
      'schemaVersion',
      'sourceDigest',
      'moduleFileCount',
      'toolchainFileCount',
      'toolchainVersion',
    ],
    'Go seed marker',
  );
  if (
    marker.schemaVersion !== 1 ||
    marker.toolchainVersion !== 'go1.26.5' ||
    !/^sha256:[0-9a-f]{64}$/u.test(marker.sourceDigest) ||
    !Number.isSafeInteger(marker.moduleFileCount) ||
    marker.moduleFileCount < 1 ||
    !Number.isSafeInteger(marker.toolchainFileCount) ||
    marker.toolchainFileCount < 1_000
  ) {
    fail('Go seed marker is invalid');
  }
  const goroot = path.join(
    root,
    goToolchainRelativeRoot(),
  );
  const version = requireCanonicalPath(path.join(goroot, 'VERSION'), {
    label: 'seeded Go VERSION',
    type: 'file',
  });
  if (
    !/^go1\.26\.5\ntime [0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z\n$/u.test(
      fs.readFileSync(version, 'utf8'),
    )
  ) {
    fail('seeded Go VERSION is not go1.26.5');
  }
  for (const relative of [
    'bin/go',
    'bin/gofmt',
    'pkg/tool/darwin_arm64/compile',
    'src/runtime/runtime.go',
  ]) {
    const file = requireCanonicalPath(path.join(goroot, relative), {
      label: `seeded Go ${relative}`,
      type: 'file',
    });
    if (
      (relative.startsWith('bin/') || relative.startsWith('pkg/tool/')) &&
      (fs.statSync(file).mode & 0o111) === 0
    ) {
      fail(`seeded Go executable is not executable: ${relative}`);
    }
  }
  return Object.freeze({ goroot, marker: Object.freeze(marker) });
}
