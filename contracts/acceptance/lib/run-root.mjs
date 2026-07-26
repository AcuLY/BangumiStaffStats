import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { canonicalJson, canonicalJsonDigest } from './canonical-json.mjs';
import { ACCEPTANCE_ROOT, RUN_ID_PATTERN, TMP_ROOT } from './constants.mjs';
import {
  assertNoSymlinkAncestors,
  isStrictlyBelow,
  requireCanonicalPath,
} from './paths.mjs';
import { readJsonStrict } from './strict-json.mjs';

const MARKER = '.acceptance-run.json';

export class RunRootError extends Error {}

function fail(message) {
  throw new RunRootError(message);
}

function requireAcceptanceRoot() {
  return requireCanonicalPath(ACCEPTANCE_ROOT, {
    label: 'acceptance root',
    type: 'directory',
  });
}

function ensureTmpRoot() {
  requireAcceptanceRoot();
  assertNoSymlinkAncestors(TMP_ROOT, 'acceptance temporary root');
  if (!fs.existsSync(TMP_ROOT)) fs.mkdirSync(TMP_ROOT, { mode: 0o700 });
  const canonical = requireCanonicalPath(TMP_ROOT, {
    label: 'acceptance temporary root',
    type: 'directory',
  });
  if (path.dirname(canonical) !== ACCEPTANCE_ROOT) {
    fail('acceptance temporary root parent is unexpected');
  }
  return canonical;
}

export function allocateRunRoot() {
  const temporaryRoot = ensureTmpRoot();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const runId = `run-${randomBytes(12).toString('hex')}`;
    const runRoot = path.join(temporaryRoot, runId);
    try {
      fs.mkdirSync(runRoot, { mode: 0o700 });
      const marker = {
        schemaVersion: 1,
        owner: 'contracts-development-acceptance',
        runId,
      };
      fs.writeFileSync(path.join(runRoot, MARKER), canonicalJson(marker), {
        flag: 'wx',
        mode: 0o400,
      });
      for (const relative of [
        'evidence',
        'home',
        'tmp',
        'processes',
        'source',
        'runtime',
        'browser',
      ]) {
        fs.mkdirSync(path.join(runRoot, relative), { mode: 0o700 });
      }
      return Object.freeze({ runId, runRoot });
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
  }
  fail('cannot allocate a unique bounded run root');
}

export function attestOwnedRunRoot(runRoot) {
  const temporaryRoot = ensureTmpRoot();
  const canonical = requireCanonicalPath(runRoot, {
    label: 'owned run root',
    type: 'directory',
    below: temporaryRoot,
  });
  if (!isStrictlyBelow(canonical, temporaryRoot)) fail('run root escapes temporary root');
  const runId = path.basename(canonical);
  if (!RUN_ID_PATTERN.test(runId)) fail('run root has an invalid run ID');
  const markerPath = path.join(canonical, MARKER);
  const marker = readJsonStrict(markerPath);
  if (
    Object.keys(marker).sort().join(',') !== 'owner,runId,schemaVersion' ||
    marker.schemaVersion !== 1 ||
    marker.owner !== 'contracts-development-acceptance' ||
    marker.runId !== runId
  ) {
    fail('run root ownership marker is invalid');
  }
  return Object.freeze({ runId, runRoot: canonical, markerPath });
}

export function inventoryOwnedRunRoot(runRoot) {
  const owned = attestOwnedRunRoot(runRoot);
  const entries = [];
  const inodeOccurrences = new Map();
  const unsafePaths = new Set();
  let fileBytes = 0;
  function visit(directory) {
    for (const name of fs
      .readdirSync(directory)
      .sort((left, right) => left.localeCompare(right, 'en'))) {
      const absolute = path.join(directory, name);
      const relative = path.relative(owned.runRoot, absolute).split(path.sep).join('/');
      const information = fs.lstatSync(absolute, { bigint: true });
      if (information.isSymbolicLink()) {
        const target = path.resolve(path.dirname(absolute), fs.readlinkSync(absolute));
        const internal =
          target === owned.runRoot || isStrictlyBelow(target, owned.runRoot);
        if (!internal) unsafePaths.add(relative);
        entries.push({ path: relative, type: 'symlink', internal });
        continue;
      }
      if (information.isDirectory()) {
        entries.push({ path: relative, type: 'directory' });
        visit(absolute);
        continue;
      }
      if (information.isFile()) {
        const inode = `${information.dev}:${information.ino}`;
        const occurrence = inodeOccurrences.get(inode) ?? {
          paths: [],
          links: Number(information.nlink),
        };
        occurrence.paths.push(relative);
        inodeOccurrences.set(inode, occurrence);
        const size = Number(information.size);
        if (!Number.isSafeInteger(size) || size < 0) {
          fail(`owned run file has an invalid size: ${relative}`);
        }
        fileBytes += size;
        entries.push({ path: relative, type: 'file', size });
        continue;
      }
      unsafePaths.add(relative);
      entries.push({ path: relative, type: 'special' });
    }
  }
  visit(owned.runRoot);
  for (const occurrence of inodeOccurrences.values()) {
    if (occurrence.links !== occurrence.paths.length) {
      for (const relative of occurrence.paths) unsafePaths.add(relative);
    }
  }
  const transientEntries = entries.filter(
    (entry) =>
      entry.type !== 'directory' &&
      (entry.path.startsWith('processes/') || entry.path.startsWith('tmp/')),
  );
  for (const entry of transientEntries) unsafePaths.add(entry.path);
  const summary = {
    directories: entries.filter((entry) => entry.type === 'directory').length,
    files: entries.filter((entry) => entry.type === 'file').length,
    symlinks: entries.filter((entry) => entry.type === 'symlink').length,
    fileBytes,
    transientEntries: transientEntries.length,
    unsafeEntries: unsafePaths.size,
    entryDigest: canonicalJsonDigest(entries),
  };
  return Object.freeze(summary);
}

export function cleanupRunRoot(runRoot) {
  const owned = attestOwnedRunRoot(runRoot);
  function restoreRemovalPermissions(candidate) {
    const information = fs.lstatSync(candidate);
    if (information.isSymbolicLink()) return;
    if (information.isDirectory()) {
      fs.chmodSync(candidate, 0o700);
      for (const name of fs.readdirSync(candidate)) {
        restoreRemovalPermissions(path.join(candidate, name));
      }
      return;
    }
    if (information.isFile()) {
      if (information.nlink !== 1) {
        fail(`owned run root contains a hard-linked regular file ${candidate}`);
      }
      return;
    }
    fail(`owned run root contains unexpected special file ${candidate}`);
  }
  restoreRemovalPermissions(owned.runRoot);
  fs.rmSync(owned.runRoot, {
    recursive: true,
    force: false,
    maxRetries: 2,
    retryDelay: 25,
  });
  if (fs.existsSync(owned.runRoot)) fail('owned run root remains after cleanup');
  if (fs.existsSync(TMP_ROOT) && fs.readdirSync(TMP_ROOT).length === 0) {
    fs.rmdirSync(TMP_ROOT);
  }
}
