import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  canonicalJson,
  canonicalJsonDigest,
} from './canonical-json.mjs';
import { validateResultEvidenceDescriptor } from './contracts.mjs';
import {
  assertSafeRelativePath,
  isStrictlyBelow,
  requireCanonicalPath,
  resolveRunRelative,
} from './paths.mjs';
import { sha256File } from './seal.mjs';
import { readJsonStrict } from './strict-json.mjs';

export class EvidenceValidationError extends Error {}

function fail(message) {
  throw new EvidenceValidationError(message);
}

const EVIDENCE_PREFIXES = Object.freeze([
  'evidence/',
  'browser/evidence/',
  'browser/cells/',
]);
const MAX_EVIDENCE_DESCRIPTOR_COUNT = 10_000;
const PARENT_FAILURE_DESCRIPTOR_RESERVE = 2;
const MAX_SANITIZED_WORKER_DESCRIPTORS =
  MAX_EVIDENCE_DESCRIPTOR_COUNT - PARENT_FAILURE_DESCRIPTOR_RESERVE;
const MAX_CELL_EVIDENCE_DESCRIPTORS = 64;

export function canRetainFailureEvidenceClosure(
  retainedDescriptorCount,
  closureDescriptorCount,
) {
  return (
    Number.isInteger(retainedDescriptorCount) &&
    retainedDescriptorCount >= 0 &&
    Number.isInteger(closureDescriptorCount) &&
    closureDescriptorCount > 0 &&
    retainedDescriptorCount + closureDescriptorCount <=
      MAX_SANITIZED_WORKER_DESCRIPTORS
  );
}

function evidencePath(value, label) {
  const relative = assertSafeRelativePath(value, label);
  if (!EVIDENCE_PREFIXES.some((prefix) => relative.startsWith(prefix))) {
    fail(`${label} is outside the closed evidence roots`);
  }
  return relative;
}

function descriptorsFromCells(cells) {
  if (!Array.isArray(cells)) fail('result cells must be an array');
  return cells.flatMap((cell, cellIndex) => {
    if (!Array.isArray(cell?.evidence)) {
      fail(`result cell ${cellIndex} evidence must be an array`);
    }
    return cell.evidence;
  });
}

function exactDescriptor(value) {
  const keys =
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? Object.keys(value).sort().join(',')
      : '';
  const complete =
    keys === 'kind,path,sha256,summary' &&
    typeof value.kind === 'string' &&
    typeof value.summary === 'string';
  const screenshot =
    keys === 'kind,path,sha256' &&
    ['candidate', 'oracle', 'difference'].includes(value.kind);
  if (
    !complete &&
    !screenshot
  ) {
    fail('evidence descriptor is not closed');
  }
  if (complete) {
    try {
      return validateResultEvidenceDescriptor(value);
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
  }
  if (
    typeof value.path !== 'string' ||
    typeof value.sha256 !== 'string' ||
    !/^sha256:[0-9a-f]{64}$/u.test(value.sha256) ||
    [value.kind, value.path].some(
      (entry) =>
        entry.includes('/Users/') ||
        entry.includes('/home/') ||
        /(?:password|secret|authorization|bearer|token)=/iu.test(entry),
    )
  ) {
    fail('evidence descriptor content is invalid');
  }
  return value;
}

function nestedDescriptors(value, output, depth = 0) {
  if (depth > 32) fail('nested evidence exceeds the closed depth');
  if (Array.isArray(value)) {
    for (const entry of value) nestedDescriptors(entry, output, depth + 1);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  const keys = Object.keys(value).sort().join(',');
  const completeDescriptor =
    keys === 'kind,path,sha256,summary' &&
    typeof value.kind === 'string' &&
    typeof value.summary === 'string';
  const screenshotDescriptor =
    keys === 'kind,path,sha256' &&
    ['candidate', 'oracle', 'difference'].includes(value.kind);
  if (
    (completeDescriptor || screenshotDescriptor) &&
    typeof value.path === 'string' &&
    typeof value.sha256 === 'string' &&
    /^sha256:[0-9a-f]{64}$/u.test(value.sha256)
  ) {
    output.push(Object.freeze({ ...value }));
    if (output.length > MAX_EVIDENCE_DESCRIPTOR_COUNT) {
      fail('nested evidence exceeds the closed count');
    }
  }
  for (const entry of Object.values(value)) {
    nestedDescriptors(entry, output, depth + 1);
  }
}

function walkEvidenceRoot(root, runRoot, output) {
  if (!fs.existsSync(root)) return;
  const canonical = requireCanonicalPath(root, {
    label: 'evidence inventory root',
    type: 'directory',
    below: runRoot,
  });
  function visit(directory) {
    for (const entry of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
      const absolute = path.join(directory, entry.name);
      const information = fs.lstatSync(absolute);
      if (information.isSymbolicLink()) {
        fail(`evidence inventory contains symlink ${absolute}`);
      }
      if (information.isDirectory()) {
        visit(absolute);
      } else if (information.isFile()) {
        if (information.nlink !== 1) {
          fail(`evidence inventory contains hard-linked file ${absolute}`);
        }
        output.add(path.relative(runRoot, absolute).split(path.sep).join('/'));
      } else {
        fail(`evidence inventory contains special file ${absolute}`);
      }
    }
  }
  visit(canonical);
}

async function verifyDescriptor(runRoot, descriptor, seen, queue) {
  exactDescriptor(descriptor);
  const relative = evidencePath(descriptor.path, 'evidence descriptor path');
  if (!/^sha256:[0-9a-f]{64}$/u.test(descriptor.sha256)) {
    fail(`evidence descriptor ${relative} has an invalid digest`);
  }
  if (seen.has(relative)) fail(`duplicate evidence descriptor path ${relative}`);
  seen.add(relative);
  const absolute = resolveRunRelative(runRoot, relative, 'evidence descriptor path');
  const canonical = requireCanonicalPath(absolute, {
    label: `evidence file ${relative}`,
    type: 'file',
    below: runRoot,
  });
  if (!isStrictlyBelow(canonical, runRoot)) {
    fail(`evidence file ${relative} escapes the exact run root`);
  }
  const information = fs.lstatSync(canonical);
  if (!information.isFile() || information.nlink !== 1) {
    fail(`evidence file ${relative} is not one unlinked regular file`);
  }
  if ((await sha256File(canonical)) !== descriptor.sha256) {
    fail(`evidence file ${relative} digest differs from its descriptor`);
  }
  if (path.extname(relative) === '.json') {
    if (information.size > 16 * 1024 * 1024) {
      fail(`JSON evidence file ${relative} exceeds the closed size`);
    }
    const nested = [];
    nestedDescriptors(readJsonStrict(canonical), nested);
    queue.push(...nested);
  }
}

export async function validateAcknowledgedFailureEvidence({
  runRoot,
  cells,
}) {
  const root = requireCanonicalPath(runRoot, {
    label: 'acknowledged failure evidence run root',
    type: 'directory',
  });
  if (!Array.isArray(cells)) {
    fail('acknowledged failure cells must be an array');
  }
  const acceptedPaths = new Set();
  const rejectedCellIndices = [];
  let rejectedDescriptorCount = 0;
  let validatedDescriptorCount = 0;
  for (const [cellIndex, cell] of cells.entries()) {
    if (!Array.isArray(cell?.evidence)) {
      fail(`acknowledged failure cell ${cellIndex} evidence must be an array`);
    }
    let cellRejected = false;
    for (const descriptor of cell.evidence) {
      const queue = [descriptor];
      const descriptorPaths = new Set();
      try {
        for (let cursor = 0; cursor < queue.length; cursor += 1) {
          if (queue.length > MAX_EVIDENCE_DESCRIPTOR_COUNT) {
            fail('evidence descriptor count exceeds the bound');
          }
          await verifyDescriptor(
            root,
            queue[cursor],
            descriptorPaths,
            queue,
          );
        }
        if (
          [...descriptorPaths].some((relative) =>
            acceptedPaths.has(relative))
        ) {
          fail('acknowledged evidence descriptor closure is not exactly once');
        }
        for (const relative of descriptorPaths) acceptedPaths.add(relative);
        validatedDescriptorCount += 1;
      } catch {
        rejectedDescriptorCount += 1;
        cellRejected = true;
      }
    }
    if (cellRejected) rejectedCellIndices.push(cellIndex);
  }
  return Object.freeze({
    earliestRejectedCell: rejectedCellIndices[0] ?? null,
    rejectedCellIndices: Object.freeze(rejectedCellIndices),
    rejectedDescriptorCount,
    validatedDescriptorCount,
  });
}

function quarantineSource(quarantineRoot, relative) {
  if (relative.startsWith('evidence/')) {
    return path.join(quarantineRoot, 'evidence', relative.slice('evidence/'.length));
  }
  return path.join(quarantineRoot, ...relative.split('/'));
}

async function verifyQuarantinedDescriptor(quarantineRoot, descriptor) {
  const queue = [descriptor];
  const seen = new Set();
  const files = [];
  try {
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      if (queue.length > MAX_EVIDENCE_DESCRIPTOR_COUNT) {
        fail('evidence descriptor count exceeds the bound');
      }
      const current = exactDescriptor(queue[cursor]);
      const relative = evidencePath(current.path, 'evidence descriptor path');
      if (!/^sha256:[0-9a-f]{64}$/u.test(current.sha256)) {
        fail(`evidence descriptor ${relative} has an invalid digest`);
      }
      if (seen.has(relative)) fail(`duplicate evidence descriptor path ${relative}`);
      seen.add(relative);
      const source = requireCanonicalPath(
        quarantineSource(quarantineRoot, relative),
        {
          label: `quarantined evidence file ${relative}`,
          type: 'file',
          below: quarantineRoot,
        },
      );
      const information = fs.lstatSync(source);
      if (information.nlink !== 1) {
        fail(`quarantined evidence file ${relative} is hard linked`);
      }
      if ((await sha256File(source)) !== current.sha256) {
        fail(`quarantined evidence file ${relative} digest differs`);
      }
      if (path.extname(relative) === '.json') {
        if (information.size > 16 * 1024 * 1024) {
          fail(`quarantined JSON evidence file ${relative} exceeds the closed size`);
        }
        const nested = [];
        nestedDescriptors(readJsonStrict(source), nested);
        queue.push(...nested);
      }
      files.push(Object.freeze({
        relative,
        sha256: current.sha256,
        source,
      }));
    }
  } catch (error) {
    const rejection = new EvidenceValidationError(
      error instanceof Error ? error.message : String(error),
      { cause: error },
    );
    rejection.rejectedPaths = Object.freeze([...seen]);
    throw rejection;
  }
  return Object.freeze({
    files: Object.freeze(files),
    paths: Object.freeze([...seen]),
  });
}

function isolatedEntryFacts(candidate, relative, facts) {
  let information;
  try {
    information = fs.lstatSync(candidate);
  } catch (error) {
    facts.errors += 1;
    return;
  }
  if (information.isSymbolicLink()) {
    facts.entries += 1;
    facts.symlinks += 1;
    return;
  }
  if (information.isDirectory()) {
    try {
      for (const name of fs.readdirSync(candidate)) {
        isolatedEntryFacts(
          path.join(candidate, name),
          relative ? `${relative}/${name}` : name,
          facts,
        );
      }
    } catch (error) {
      facts.errors += 1;
    }
    return;
  }
  facts.entries += 1;
  if (information.isFile()) {
    facts.regularFiles += 1;
    if (information.nlink !== 1) {
      facts.hardLinkedFiles += 1;
    } else {
      facts.files.push(Object.freeze({
        relative,
        source: candidate,
      }));
    }
  } else {
    facts.specialFiles += 1;
  }
}

function removeIsolatedEntry(candidate) {
  let information;
  try {
    information = fs.lstatSync(candidate);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  if (information.isDirectory() && !information.isSymbolicLink()) {
    fs.chmodSync(candidate, 0o700);
    for (const name of fs.readdirSync(candidate)) {
      removeIsolatedEntry(path.join(candidate, name));
    }
    fs.rmdirSync(candidate);
    return;
  }
  fs.unlinkSync(candidate);
}

function pathExistsNoFollow(candidate) {
  try {
    fs.lstatSync(candidate);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    return true;
  }
}

function isolationRootIdentity(candidate) {
  const information = fs.lstatSync(candidate);
  return Object.freeze({
    dev: information.dev,
    ino: information.ino,
    mode: information.mode,
    type: information.isDirectory()
      ? 'directory'
      : information.isFile()
        ? 'file'
        : information.isSymbolicLink()
          ? 'symlink'
          : 'special',
  });
}

function isolationRootIdentityMatches(candidate, expected) {
  try {
    const observed = isolationRootIdentity(candidate);
    return (
      observed.dev === expected.dev &&
      observed.ino === expected.ino &&
      observed.mode === expected.mode &&
      observed.type === expected.type
    );
  } catch {
    return false;
  }
}

function rollbackFailureEvidencePreparation({
  createdRoots,
  manifestIdentity,
  manifestPath,
  quarantineIdentity,
  quarantineRoot,
  root,
  roots,
}) {
  const errors = [];
  const attempt = (operation) => {
    try {
      operation();
    } catch (error) {
      errors.push(error);
    }
  };
  for (const entry of [...createdRoots].reverse()) {
    attempt(() => {
      if (!pathExistsNoFollow(entry.path)) return;
      if (!isolationRootIdentityMatches(entry.path, entry.identity)) {
        fail(`failure evidence rollback does not own ${entry.path}`);
      }
      removeIsolatedEntry(entry.path);
    });
  }
  if (manifestIdentity !== null) {
    attempt(() => {
      if (!pathExistsNoFollow(manifestPath)) return;
      if (!isolationRootIdentityMatches(manifestPath, manifestIdentity)) {
        fail('failure evidence rollback does not own its manifest');
      }
      removeIsolatedEntry(manifestPath);
    });
  }
  for (const entry of [...roots].reverse()) {
    if (!entry.moved) continue;
    attempt(() => {
      const original = path.join(root, entry.relative);
      const quarantined = path.join(quarantineRoot, entry.relative);
      if (
        isolationRootIdentityMatches(original, entry.identity) &&
        !pathExistsNoFollow(quarantined)
      ) {
        return;
      }
      if (
        pathExistsNoFollow(original) ||
        !isolationRootIdentityMatches(quarantined, entry.identity)
      ) {
        fail(`failure evidence rollback could not restore ${entry.relative}`);
      }
      try {
        fs.renameSync(quarantined, original);
      } catch (error) {
        if (
          !isolationRootIdentityMatches(original, entry.identity) ||
          pathExistsNoFollow(quarantined)
        ) {
          throw error;
        }
      }
      if (!isolationRootIdentityMatches(original, entry.identity)) {
        fail(`failure evidence rollback changed ${entry.relative}`);
      }
    });
  }
  attempt(() => {
    if (!pathExistsNoFollow(quarantineRoot)) return;
    if (!isolationRootIdentityMatches(quarantineRoot, quarantineIdentity)) {
      fail('failure evidence rollback lost its quarantine root');
    }
    fs.rmdirSync(quarantineRoot);
  });
  if (errors.length > 0) {
    throw new AggregateError(
      errors,
      'failure evidence preparation rollback failed',
    );
  }
}

function createIsolationRoot(candidate, createdRoots) {
  if (pathExistsNoFollow(candidate)) {
    fail(`failure evidence rebuild root already exists: ${candidate}`);
  }
  try {
    fs.mkdirSync(candidate, { mode: 0o700 });
  } catch (error) {
    if (
      error?.code !== 'EEXIST' &&
      pathExistsNoFollow(candidate)
    ) {
      const identity = isolationRootIdentity(candidate);
      if (identity.type === 'directory') {
        createdRoots.push({ identity, path: candidate });
      }
    }
    throw error;
  }
  const identity = isolationRootIdentity(candidate);
  if (identity.type !== 'directory') {
    fail(`failure evidence rebuild root is not a directory: ${candidate}`);
  }
  createdRoots.push({ identity, path: candidate });
}

function topLevelEvidenceDescriptorCount(cells) {
  if (!Array.isArray(cells)) {
    fail('failure evidence cells must be an array');
  }
  let count = 0;
  for (const [index, cell] of cells.entries()) {
    if (!Array.isArray(cell?.evidence)) {
      fail(`failure evidence cell ${index} evidence must be an array`);
    }
    count += cell.evidence.length;
  }
  return count;
}

async function validatePreparedFailureEvidenceState(state, root, cellsDigest) {
  if (
    state.schemaVersion !== 1 ||
    !['prepared', 'complete'].includes(state.phase) ||
    state.root !== root ||
    state.cellsDigest !== cellsDigest ||
    canonicalJsonDigest(state.sanitizedCells) !== state.sanitizedCellsDigest ||
    canonicalJsonDigest(state.quarantineDocument) !==
      state.quarantineDocumentDigest ||
    !isolationRootIdentityMatches(
      state.quarantineRoot,
      state.quarantineIdentity,
    )
  ) {
    fail('failure evidence isolation retry state is invalid');
  }
  for (const entry of state.createdRoots) {
    if (
      !isolationRootIdentityMatches(entry.path, entry.identity)
    ) {
      fail('failure evidence isolation live root changed before retry');
    }
  }
  const manifestInformation = fs.lstatSync(state.manifestPath);
  if (
    !manifestInformation.isFile() ||
    manifestInformation.isSymbolicLink() ||
    manifestInformation.nlink !== 1 ||
    !isolationRootIdentityMatches(
      state.manifestPath,
      state.manifestIdentity,
    ) ||
    fs.readFileSync(state.manifestPath, 'utf8') !== state.manifestText ||
    (await sha256File(state.manifestPath)) !== state.manifestDigest
  ) {
    fail('failure evidence isolation manifest changed before retry');
  }
  const validation = await validateAcknowledgedFailureEvidence({
    runRoot: root,
    cells: state.sanitizedCells,
  });
  if (
    validation.earliestRejectedCell !== null ||
    validation.rejectedDescriptorCount !== 0 ||
    validation.validatedDescriptorCount !==
      topLevelEvidenceDescriptorCount(state.sanitizedCells)
  ) {
    fail('retained failure evidence changed before retry');
  }
  for (const entry of state.isolationRoots) {
    const candidate = path.join(state.quarantineRoot, entry.relative);
    if (!entry.moved) {
      if (pathExistsNoFollow(candidate)) {
        fail('unmoved failure evidence unexpectedly entered quarantine');
      }
      continue;
    }
    if (state.phase === 'complete' && pathExistsNoFollow(candidate)) {
      fail('completed failure evidence isolation retained a source root');
    }
    if (
      pathExistsNoFollow(candidate) &&
      !isolationRootIdentityMatches(candidate, entry.identity)
    ) {
      fail('quarantined failure evidence root changed before retry');
    }
  }
}

function writeIsolationManifest(manifestPath, manifestText) {
  let descriptor;
  let identity = null;
  let failure = null;
  try {
    descriptor = fs.openSync(
      manifestPath,
      fs.constants.O_CREAT |
        fs.constants.O_EXCL |
        fs.constants.O_WRONLY,
      0o600,
    );
    identity = isolationRootIdentity(manifestPath);
    fs.writeFileSync(descriptor, Buffer.from(manifestText));
    fs.fsyncSync(descriptor);
  } catch (error) {
    failure = error;
  } finally {
    if (descriptor !== undefined) {
      try {
        fs.closeSync(descriptor);
      } catch (error) {
        failure =
          failure === null
            ? error
            : new AggregateError(
                [failure, error],
                'failure evidence manifest write and close failed',
              );
      }
    }
  }
  if (failure !== null) {
    if (
      identity === null &&
      pathExistsNoFollow(manifestPath)
    ) {
      identity = isolationRootIdentity(manifestPath);
    }
    failure.manifestIdentity = identity;
    throw failure;
  }
  return identity;
}

function finishPreparedFailureEvidenceState(state) {
  for (const entry of state.isolationRoots) {
    const candidate = path.join(state.quarantineRoot, entry.relative);
    if (!entry.moved) {
      if (pathExistsNoFollow(candidate)) {
        fail('unmoved failure evidence unexpectedly entered quarantine');
      }
      continue;
    }
    if (!pathExistsNoFollow(candidate)) continue;
    if (!isolationRootIdentityMatches(candidate, entry.identity)) {
      fail(`quarantined failure evidence root changed: ${entry.relative}`);
    }
    try {
      removeIsolatedEntry(candidate);
    } catch (error) {
      try {
        const current = isolationRootIdentity(candidate);
        if (
          current.dev === entry.identity.dev &&
          current.ino === entry.identity.ino &&
          current.type === entry.identity.type
        ) {
          fs.chmodSync(candidate, entry.identity.mode & 0o7777);
        }
      } catch {
        // A post-success fault can report after the owned root is gone.
      }
      throw error;
    }
  }
  for (const entry of state.isolationRoots) {
    if (
      pathExistsNoFollow(
        path.join(state.quarantineRoot, entry.relative),
      )
    ) {
      fail(`quarantined failure evidence root remains: ${entry.relative}`);
    }
  }
  state.phase = 'complete';
}

function failureEvidenceIsolationResult(state) {
  return Object.freeze({
    cells: structuredClone(state.sanitizedCells),
    earliestRejectedCell: state.earliestRejectedCell,
    quarantine: Object.freeze({
      path: path
        .relative(state.root, state.manifestPath)
        .split(path.sep)
        .join('/'),
      sha256: state.manifestDigest,
      ...structuredClone(state.quarantineDocument),
    }),
  });
}

function bytesDigest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function retryableFileBytes(state) {
  const bytes = Buffer.from(state.bytesBase64, 'base64');
  if (bytesDigest(bytes) !== state.digest) {
    fail('retryable parent evidence bytes changed in memory');
  }
  return bytes;
}

function validateRetryableFile(candidate, identity, bytes, label) {
  let information;
  try {
    information = fs.lstatSync(candidate);
  } catch {
    fail(`${label} is absent`);
  }
  if (
    !information.isFile() ||
    information.isSymbolicLink() ||
    information.nlink !== 1 ||
    !isolationRootIdentityMatches(candidate, identity) ||
    !fs.readFileSync(candidate).equals(bytes)
  ) {
    fail(`${label} changed`);
  }
}

function discardRetryableTemporaryFile(state) {
  if (!pathExistsNoFollow(state.temporaryPath)) {
    state.temporaryIdentity = null;
    return;
  }
  if (
    state.temporaryIdentity === null ||
    !isolationRootIdentityMatches(
      state.temporaryPath,
      state.temporaryIdentity,
    )
  ) {
    fail('retryable parent evidence does not own its temporary file');
  }
  try {
    fs.unlinkSync(state.temporaryPath);
  } catch (error) {
    if (pathExistsNoFollow(state.temporaryPath)) throw error;
  }
  state.temporaryIdentity = null;
}

function resetUncommittedRetryableFile(state, bytes) {
  if (state.schemaVersion === undefined) return;
  if (state.phase === 'complete') {
    fail('completed parent evidence file cannot be reset');
  }
  discardRetryableTemporaryFile(state);
  if (pathExistsNoFollow(state.destination)) {
    if (
      state.destinationIdentity === null ||
      !isolationRootIdentityMatches(
        state.destination,
        state.destinationIdentity,
      )
    ) {
      fail('uncommitted parent evidence destination changed');
    }
    try {
      fs.unlinkSync(state.destination);
    } catch (error) {
      if (pathExistsNoFollow(state.destination)) throw error;
    }
  }
  state.bytesBase64 = bytes.toString('base64');
  state.destinationIdentity = null;
  state.digest = bytesDigest(bytes);
  state.phase = 'prepared';
}

function fsyncDirectory(directory) {
  const descriptor = fs.openSync(directory, 'r');
  let failure = null;
  try {
    fs.fsyncSync(descriptor);
  } catch (error) {
    failure = error;
  }
  try {
    fs.closeSync(descriptor);
  } catch (error) {
    failure =
      failure === null
        ? error
        : new AggregateError(
            [failure, error],
            'parent evidence directory sync and close failed',
          );
  }
  if (failure !== null) throw failure;
}

function writeRetryableExclusiveFile({
  bytes,
  destination,
  state,
}) {
  const directory = path.dirname(destination);
  const digest = bytesDigest(bytes);
  if (state.schemaVersion === undefined) {
    if (
      pathExistsNoFollow(destination) ||
      !Object.isExtensible(state)
    ) {
      fail('retryable parent evidence destination is not fresh');
    }
    const temporaryPath = path.join(
      directory,
      `.${path.basename(destination)}.parent-private.tmp`,
    );
    if (pathExistsNoFollow(temporaryPath)) {
      fail('retryable parent evidence temporary path already exists');
    }
    Object.assign(state, {
      bytesBase64: bytes.toString('base64'),
      destination,
      destinationIdentity: null,
      digest,
      directory,
      directoryIdentity: isolationRootIdentity(directory),
      phase: 'prepared',
      schemaVersion: 1,
      temporaryIdentity: null,
      temporaryPath,
    });
  }
  if (
    state.schemaVersion !== 1 ||
    !['prepared', 'renamed', 'complete'].includes(state.phase) ||
    state.destination !== destination ||
    state.directory !== directory ||
    state.digest !== digest ||
    !isolationRootIdentityMatches(
      state.directory,
      state.directoryIdentity,
    )
  ) {
    fail('retryable parent evidence state is invalid');
  }
  const storedBytes = retryableFileBytes(state);

  if (state.phase === 'prepared' && pathExistsNoFollow(destination)) {
    if (
      state.destinationIdentity !== null &&
      isolationRootIdentityMatches(
        destination,
        state.destinationIdentity,
      )
    ) {
      validateRetryableFile(
        destination,
        state.destinationIdentity,
        storedBytes,
        'retryable parent evidence destination',
      );
      state.phase = 'renamed';
    } else {
      fail('retryable parent evidence destination appeared unexpectedly');
    }
  }

  if (state.phase === 'prepared') {
    discardRetryableTemporaryFile(state);
    let descriptor;
    let failure = null;
    try {
      descriptor = fs.openSync(
        state.temporaryPath,
        fs.constants.O_CREAT |
          fs.constants.O_EXCL |
          fs.constants.O_WRONLY,
        0o600,
      );
      state.temporaryIdentity =
        isolationRootIdentity(state.temporaryPath);
      fs.writeFileSync(descriptor, storedBytes);
      fs.fsyncSync(descriptor);
    } catch (error) {
      failure = error;
      if (
        state.temporaryIdentity === null &&
        pathExistsNoFollow(state.temporaryPath)
      ) {
        state.temporaryIdentity =
          isolationRootIdentity(state.temporaryPath);
      }
    }
    if (descriptor !== undefined) {
      try {
        fs.closeSync(descriptor);
      } catch (error) {
        failure =
          failure === null
            ? error
            : new AggregateError(
                [failure, error],
                'parent evidence write and close failed',
              );
      }
    }
    if (failure !== null) {
      try {
        discardRetryableTemporaryFile(state);
      } catch (cleanupError) {
        throw new AggregateError(
          [failure, cleanupError],
          'parent evidence write and cleanup failed',
        );
      }
      throw failure;
    }
    validateRetryableFile(
      state.temporaryPath,
      state.temporaryIdentity,
      storedBytes,
      'retryable parent evidence temporary file',
    );
    state.destinationIdentity = state.temporaryIdentity;
    try {
      fs.renameSync(state.temporaryPath, destination);
    } catch (error) {
      if (
        !pathExistsNoFollow(state.temporaryPath) &&
        isolationRootIdentityMatches(
          destination,
          state.destinationIdentity,
        )
      ) {
        state.temporaryIdentity = null;
        state.phase = 'renamed';
      } else {
        state.destinationIdentity = null;
        discardRetryableTemporaryFile(state);
      }
      throw error;
    }
    state.temporaryIdentity = null;
    state.phase = 'renamed';
  }

  validateRetryableFile(
    destination,
    state.destinationIdentity,
    storedBytes,
    'retryable parent evidence destination',
  );
  if (state.phase === 'renamed') {
    fsyncDirectory(directory);
    state.phase = 'complete';
  }
  return Object.freeze({
    digest: state.digest,
    path: destination,
  });
}

export async function writeRetryableParentFailureEvidence({
  kind,
  runRoot,
  state,
  summary,
  value,
}) {
  const root = requireCanonicalPath(runRoot, {
    label: 'retryable parent failure evidence run root',
    type: 'directory',
  });
  if (
    state === null ||
    typeof state !== 'object' ||
    Array.isArray(state)
  ) {
    fail('retryable parent failure evidence state must be an object');
  }
  if (state.schemaVersion === undefined) {
    const evidenceRoot = fs.mkdtempSync(
      path.join(root, 'evidence', 'parent-supervisor-'),
    );
    fs.chmodSync(evidenceRoot, 0o700);
    Object.assign(state, {
      documentText: canonicalJson(value),
      evidenceRoot,
      evidenceRootIdentity: isolationRootIdentity(evidenceRoot),
      file: {},
      kind,
      phase: 'prepared',
      root,
      schemaVersion: 1,
      summary,
    });
  }
  if (
    state.schemaVersion !== 1 ||
    !['prepared', 'complete'].includes(state.phase) ||
    state.root !== root ||
    state.kind !== kind ||
    state.summary !== summary ||
    !isolationRootIdentityMatches(
      state.evidenceRoot,
      state.evidenceRootIdentity,
    )
  ) {
    fail('retryable parent failure evidence state is invalid');
  }
  const currentDocumentText = canonicalJson(value);
  if (
    state.phase === 'prepared' &&
    currentDocumentText !== state.documentText
  ) {
    resetUncommittedRetryableFile(
      state.file,
      Buffer.from(currentDocumentText),
    );
    state.documentText = currentDocumentText;
  }
  const destination = path.join(state.evidenceRoot, 'failure.json');
  const written = writeRetryableExclusiveFile({
    bytes: Buffer.from(state.documentText),
    destination,
    state: state.file,
  });
  state.phase = 'complete';
  if (currentDocumentText !== state.documentText) {
    if (state.retryDocumentText === undefined) {
      Object.assign(state, {
        retryDocumentText: currentDocumentText,
        retryFile: {},
      });
    }
    if (state.retryDocumentText !== currentDocumentText) {
      fail('parent failure evidence retry facts changed more than once');
    }
    writeRetryableExclusiveFile({
      bytes: Buffer.from(state.retryDocumentText),
      destination: path.join(state.evidenceRoot, 'retry.json'),
      state: state.retryFile,
    });
  }
  return Object.freeze({
    kind: state.kind,
    path: path.relative(root, destination).split(path.sep).join('/'),
    sha256: written.digest,
    summary: state.summary,
  });
}

export async function isolateAndSanitizeFailureEvidence({
  runRoot,
  cells,
  isolationState,
}) {
  const root = requireCanonicalPath(runRoot, {
    label: 'failure evidence run root',
    type: 'directory',
  });
  const cellsDigest = canonicalJsonDigest(cells);
  const state = isolationState ?? {};
  if (
    state === null ||
    typeof state !== 'object' ||
    Array.isArray(state)
  ) {
    fail('failure evidence isolation state must be an object');
  }
  if (state.phase !== undefined) {
    await validatePreparedFailureEvidenceState(state, root, cellsDigest);
    if (state.phase === 'prepared') {
      finishPreparedFailureEvidenceState(state);
    }
    return failureEvidenceIsolationResult(state);
  }
  if (!Object.isExtensible(state)) {
    fail('failure evidence isolation state cannot record progress');
  }

  const sanitizedCells = structuredClone(cells);
  const quarantineRoot = fs.mkdtempSync(
    path.join(root, 'worker-evidence-quarantine-'),
  );
  const manifestPath = path.join(quarantineRoot, 'manifest.json');
  const isolationRoots = [];
  const createdRoots = [];
  let manifestIdentity = null;
  let quarantineIdentity = isolationRootIdentity(quarantineRoot);
  try {
    fs.chmodSync(quarantineRoot, 0o700);
    quarantineIdentity = isolationRootIdentity(quarantineRoot);
    for (const relative of ['evidence', 'browser']) {
      const candidate = path.join(root, relative);
      let identity;
      try {
        identity = isolationRootIdentity(candidate);
      } catch (error) {
        if (error?.code === 'ENOENT') {
          isolationRoots.push({ identity: null, moved: false, relative });
          continue;
        }
        throw error;
      }
      const entry = { identity, moved: false, relative };
      isolationRoots.push(entry);
      const quarantined = path.join(quarantineRoot, relative);
      try {
        fs.renameSync(candidate, quarantined);
      } catch (error) {
        if (
          !pathExistsNoFollow(candidate) &&
          isolationRootIdentityMatches(quarantined, identity)
        ) {
          entry.moved = true;
        }
        throw error;
      }
      entry.moved = true;
      if (
        pathExistsNoFollow(candidate) ||
        !isolationRootIdentityMatches(quarantined, identity)
      ) {
        fail(`failure evidence root changed during isolation: ${relative}`);
      }
    }

    createIsolationRoot(path.join(root, 'evidence'), createdRoots);
    createIsolationRoot(path.join(root, 'browser'), createdRoots);
    fs.mkdirSync(path.join(root, 'browser', 'evidence'), {
      mode: 0o700,
    });
    fs.mkdirSync(path.join(root, 'browser', 'cells'), {
      mode: 0o700,
    });

    const retainedPaths = new Set();
    const retained = [];
    const rejected = [];
    const rejectedPaths = new Set();
    let budgetRejectedDescriptorCount = 0;
    let retainedDescriptorCount = 0;
    let earliestRejectedCell = null;
    for (const [cellIndex, cell] of sanitizedCells.entries()) {
      const safeEvidence = [];
      for (const descriptor of cell.evidence) {
        let claimedPaths = [];
        try {
          const closure = await verifyQuarantinedDescriptor(
            quarantineRoot,
            descriptor,
          );
          claimedPaths = closure.paths;
          if (closure.paths.some((relative) => retainedPaths.has(relative))) {
            fail('evidence descriptor closure is not exactly once');
          }
          if (
            !canRetainFailureEvidenceClosure(
              retainedDescriptorCount,
              closure.paths.length,
            )
          ) {
            budgetRejectedDescriptorCount += closure.paths.length;
            fail('evidence descriptor closure exceeds the parent result budget');
          }
          for (const relative of closure.paths) retainedPaths.add(relative);
          retainedDescriptorCount += closure.paths.length;
          retained.push(...closure.files);
          safeEvidence.push(descriptor);
        } catch (error) {
          earliestRejectedCell ??= cellIndex;
          for (const relative of claimedPaths) rejectedPaths.add(relative);
          for (const relative of error?.rejectedPaths ?? []) {
            rejectedPaths.add(relative);
          }
          let rejectedPath = null;
          try {
            rejectedPath = evidencePath(
              descriptor?.path,
              'rejected evidence descriptor path',
            );
            rejectedPaths.add(rejectedPath);
          } catch {
            // An unsafe claimed path is recorded only as a rejected descriptor.
          }
          rejected.push(Object.freeze({
            cellId: cell.id,
            path: rejectedPath,
          }));
        }
      }
      cell.evidence = safeEvidence;
    }

    const observed = {
      entries: 0,
      errors: 0,
      files: [],
      hardLinkedFiles: 0,
      regularFiles: 0,
      specialFiles: 0,
      symlinks: 0,
    };
    for (const relative of ['evidence', 'browser']) {
      isolatedEntryFacts(
        path.join(quarantineRoot, relative),
        relative,
        observed,
      );
    }
    const unregisteredCandidates = [];
    for (const candidate of observed.files) {
      if (
        retainedPaths.has(candidate.relative) ||
        rejectedPaths.has(candidate.relative)
      ) {
        continue;
      }
      try {
        const descriptor = {
          kind: 'failureArtifact',
          path: candidate.relative,
          sha256: await sha256File(candidate.source),
          summary: 'artifact written before the owning cell failed',
        };
        const closure = await verifyQuarantinedDescriptor(
          quarantineRoot,
          descriptor,
        );
        unregisteredCandidates.push(Object.freeze({
          closure,
          relative: candidate.relative,
        }));
      } catch {
        // Retain only independently verified unregistered closures.
      }
    }
    unregisteredCandidates.sort(
      (left, right) =>
        right.closure.paths.length - left.closure.paths.length ||
        left.relative.localeCompare(right.relative, 'en'),
    );
    let retainedUnregisteredRootCount = 0;
    let unregisteredBudgetDroppedCount = 0;
    for (const candidate of unregisteredCandidates) {
      if (
        candidate.closure.paths.some(
          (relative) =>
            retainedPaths.has(relative) || rejectedPaths.has(relative),
        )
      ) {
        continue;
      }
      if (
        !canRetainFailureEvidenceClosure(
          retainedDescriptorCount,
          candidate.closure.paths.length,
        )
      ) {
        unregisteredBudgetDroppedCount += candidate.closure.paths.length;
        continue;
      }
      for (const relative of candidate.closure.paths) {
        retainedPaths.add(relative);
      }
      retainedDescriptorCount += candidate.closure.paths.length;
      retained.push(...candidate.closure.files);
      retainedUnregisteredRootCount += 1;
    }

    for (const file of retained) {
      const destination = resolveRunRelative(
        root,
        file.relative,
        'retained failure evidence path',
      );
      fs.mkdirSync(path.dirname(destination), {
        recursive: true,
        mode: 0o700,
      });
      fs.copyFileSync(file.source, destination, fs.constants.COPYFILE_EXCL);
      fs.chmodSync(destination, 0o600);
      if ((await sha256File(destination)) !== file.sha256) {
        fail(`retained evidence file ${file.relative} changed during isolation`);
      }
    }
    const retainedValidation =
      await validateAcknowledgedFailureEvidence({
        runRoot: root,
        cells: sanitizedCells,
      });
    if (
      retainedValidation.earliestRejectedCell !== null ||
      retainedValidation.rejectedDescriptorCount !== 0 ||
      retainedValidation.validatedDescriptorCount !==
        topLevelEvidenceDescriptorCount(sanitizedCells)
    ) {
      fail('retained failure evidence failed parent validation');
    }

    const { files: _observedFiles, ...discarded } = observed;
    const quarantineDocument = {
      schemaVersion: 1,
      kind: 'worker-evidence-quarantine',
      budgetRejectedDescriptorCount,
      discarded,
      discardedEntryCount: Math.max(0, observed.entries - retainedPaths.size),
      rejectedDescriptors: rejected,
      retainedDescriptorCount:
        topLevelEvidenceDescriptorCount(sanitizedCells),
      retainedFileCount: retainedPaths.size,
      retainedUnregisteredRootCount,
      unregisteredBudgetDroppedCount,
    };
    const manifestText = canonicalJson(quarantineDocument);
    try {
      manifestIdentity = writeIsolationManifest(
        manifestPath,
        manifestText,
      );
    } catch (error) {
      manifestIdentity = error.manifestIdentity ?? manifestIdentity;
      throw error;
    }
    const manifestDigest = await sha256File(manifestPath);
    if (
      manifestDigest !== canonicalJsonDigest(quarantineDocument) ||
      fs.readFileSync(manifestPath, 'utf8') !== manifestText
    ) {
      fail('failure evidence isolation manifest changed while writing');
    }

    Object.assign(state, {
      cellsDigest,
      createdRoots,
      earliestRejectedCell,
      isolationRoots,
      manifestDigest,
      manifestIdentity,
      manifestPath,
      manifestText,
      quarantineDocument,
      quarantineDocumentDigest: canonicalJsonDigest(quarantineDocument),
      quarantineIdentity,
      quarantineRoot,
      root,
      sanitizedCells,
      sanitizedCellsDigest: canonicalJsonDigest(sanitizedCells),
      schemaVersion: 1,
      phase: 'prepared',
    });
  } catch (error) {
    try {
      rollbackFailureEvidencePreparation({
        createdRoots,
        manifestIdentity,
        manifestPath,
        quarantineIdentity,
        quarantineRoot,
        root,
        roots: isolationRoots,
      });
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        'failure evidence isolation and rollback failed',
      );
    }
    throw error;
  }

  finishPreparedFailureEvidenceState(state);
  return failureEvidenceIsolationResult(state);
}

export async function validateEvidenceFiles({ runRoot, cells }) {
  const root = requireCanonicalPath(runRoot, {
    label: 'evidence run root',
    type: 'directory',
  });
  const queue = [...descriptorsFromCells(cells)];
  const seen = new Set();
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    if (queue.length > MAX_EVIDENCE_DESCRIPTOR_COUNT) {
      fail('evidence descriptor count exceeds the bound');
    }
    await verifyDescriptor(root, queue[cursor], seen, queue);
  }
  const actual = new Set();
  for (const relative of [
    'evidence',
    'browser/evidence',
    'browser/cells',
  ]) {
    walkEvidenceRoot(path.join(root, ...relative.split('/')), root, actual);
  }
  for (const relative of actual) {
    if (!seen.has(relative)) fail(`unregistered evidence file ${relative}`);
  }
  for (const relative of seen) {
    if (!actual.has(relative)) fail(`registered evidence file is absent ${relative}`);
  }
  return Object.freeze({
    descriptorCount: seen.size,
    fileCount: actual.size,
    paths: Object.freeze([...actual].sort((left, right) =>
      left.localeCompare(right, 'en'))),
  });
}

export async function registerFailureEvidence({
  runRoot,
  cells,
  registrationState,
}) {
  const root = requireCanonicalPath(runRoot, {
    label: 'failure evidence run root',
    type: 'directory',
  });
  const cellsDigest = canonicalJsonDigest(cells);
  const state = registrationState ?? {};
  if (
    state === null ||
    typeof state !== 'object' ||
    Array.isArray(state)
  ) {
    fail('failure evidence registration state must be an object');
  }
  const directFailure = cells.find((cell) => cell.status === 'fail');
  if (!directFailure) fail('failure evidence registration requires one failed cell');
  if (state.schemaVersion !== undefined) {
    if (
      state.schemaVersion !== 1 ||
      !['prepared', 'complete'].includes(state.phase) ||
      state.root !== root ||
      state.cellsDigest !== cellsDigest ||
      canonicalJsonDigest(state.plannedDirectEvidence) !==
        state.plannedDirectEvidenceDigest ||
      !isolationRootIdentityMatches(
        state.indexRoot,
        state.indexRootIdentity,
      )
    ) {
      fail('failure evidence registration retry state is invalid');
    }
    try {
      removeIsolatedEntry(state.indexRoot);
    } catch (error) {
      if (pathExistsNoFollow(state.indexRoot)) {
        try {
          const current = isolationRootIdentity(state.indexRoot);
          if (
            current.dev === state.indexRootIdentity.dev &&
            current.ino === state.indexRootIdentity.ino &&
            current.type === state.indexRootIdentity.type
          ) {
            fs.chmodSync(
              state.indexRoot,
              state.indexRootIdentity.mode & 0o7777,
            );
          }
        } catch {
          // Preserve the originating precise-removal fault.
        }
        throw error;
      }
    }
    for (const key of Object.keys(state)) delete state[key];
  }
  const queue = [...descriptorsFromCells(cells)];
  const seen = new Set();
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    if (queue.length > MAX_EVIDENCE_DESCRIPTOR_COUNT) {
      fail('evidence descriptor count exceeds the bound');
    }
    await verifyDescriptor(root, queue[cursor], seen, queue);
  }
  const actual = new Set();
  for (const relative of ['evidence', 'browser/evidence', 'browser/cells']) {
    walkEvidenceRoot(path.join(root, ...relative.split('/')), root, actual);
  }
  const unregistered = [...actual]
    .filter((relative) => !seen.has(relative))
    .sort((left, right) => left.localeCompare(right, 'en'));
  if (unregistered.length === 0) return cells;

  const referencedByUnregistered = new Set();
  for (const relative of unregistered) {
    if (path.extname(relative) !== '.json') continue;
    const nested = [];
    nestedDescriptors(
      readJsonStrict(resolveRunRelative(root, relative, 'failure evidence path')),
      nested,
    );
    for (const descriptor of nested) {
      if (unregistered.includes(descriptor.path)) {
        referencedByUnregistered.add(descriptor.path);
      }
    }
  }
  let roots = unregistered.filter(
    (relative) => !referencedByUnregistered.has(relative),
  );
  if (roots.length === 0) roots = unregistered;
  const descriptors = await Promise.all(
    roots.map(async (relative) => ({
      kind: 'failureArtifact',
      path: relative,
      sha256: await sha256File(
        resolveRunRelative(root, relative, 'failure evidence path'),
      ),
      summary: 'artifact written before the owning cell failed',
    })),
  );
  if (directFailure.evidence.length > MAX_CELL_EVIDENCE_DESCRIPTORS) {
    fail('direct failure evidence exceeds the closed cell count');
  }
  const retainedDirectEvidence = directFailure.evidence.slice(
    0,
    MAX_CELL_EVIDENCE_DESCRIPTORS - 1,
  );
  const folded = directFailure.evidence.slice(
    MAX_CELL_EVIDENCE_DESCRIPTORS - 1,
  );
  descriptors.push(...folded);
  if (actual.size + 1 > MAX_EVIDENCE_DESCRIPTOR_COUNT) {
    fail('registered failure evidence exceeds the global descriptor count');
  }
  const indexRoot = fs.mkdtempSync(
    path.join(root, 'evidence', 'parent-failure-index-'),
  );
  fs.chmodSync(indexRoot, 0o700);
  const indexPath = path.join(indexRoot, 'index.json');
  const indexRelative = path
    .relative(root, indexPath)
    .split(path.sep)
    .join('/');
  const indexText = canonicalJson(descriptors);
  const indexDescriptor = {
    kind: 'failureArtifactIndex',
    path: indexRelative,
    sha256: bytesDigest(Buffer.from(indexText)),
    summary:
      `${unregistered.length} pre-failure evidence files registered; ` +
      `${folded.length} direct descriptors folded`,
  };
  const plannedDirectEvidence = [
    ...retainedDirectEvidence,
    indexDescriptor,
  ];
  if (!Object.isExtensible(state)) {
    fail('failure evidence registration state cannot record progress');
  }
  Object.assign(state, {
    cellsDigest,
    file: {},
    indexPath,
    indexRoot,
    indexRootIdentity: isolationRootIdentity(indexRoot),
    indexText,
    plannedDirectEvidence,
    plannedDirectEvidenceDigest:
      canonicalJsonDigest(plannedDirectEvidence),
    root,
    schemaVersion: 1,
    phase: 'prepared',
  });
  writeRetryableExclusiveFile({
    bytes: Buffer.from(indexText),
    destination: indexPath,
    state: state.file,
  });
  directFailure.evidence = structuredClone(plannedDirectEvidence);
  await validateEvidenceFiles({ runRoot: root, cells });
  state.phase = 'complete';
  return cells;
}

export async function writeAndVerifyCanonicalResult({
  runRoot,
  relative = 'result.json',
  result,
}) {
  const root = requireCanonicalPath(runRoot, {
    label: 'canonical result run root',
    type: 'directory',
  });
  const output = resolveRunRelative(root, relative, 'canonical result path');
  const bytes = Buffer.from(canonicalJson(result));
  const descriptor = fs.openSync(
    output,
    fs.constants.O_CREAT |
      fs.constants.O_EXCL |
      fs.constants.O_WRONLY,
    0o600,
  );
  try {
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  const directoryDescriptor = fs.openSync(path.dirname(output), 'r');
  try {
    fs.fsyncSync(directoryDescriptor);
  } finally {
    fs.closeSync(directoryDescriptor);
  }
  const canonical = requireCanonicalPath(output, {
    label: 'canonical result output',
    type: 'file',
    below: root,
  });
  const information = fs.lstatSync(canonical);
  if (information.nlink !== 1) fail('canonical result output is hard linked');
  if (!fs.readFileSync(canonical).equals(bytes)) {
    fail('canonical result output differs after re-read');
  }
  const parsed = readJsonStrict(canonical);
  if (canonicalJson(parsed) !== bytes.toString('utf8')) {
    fail('canonical result output is not canonical JSON');
  }
  return Object.freeze({
    path: path.relative(root, canonical).split(path.sep).join('/'),
    sha256: await sha256File(canonical),
    bytes: information.size,
  });
}
