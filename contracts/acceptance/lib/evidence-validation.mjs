import fs from 'node:fs';
import path from 'node:path';

import { canonicalJson } from './canonical-json.mjs';
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
      fs.chmodSync(candidate, 0o700);
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

export async function isolateAndSanitizeFailureEvidence({
  runRoot,
  cells,
}) {
  const root = requireCanonicalPath(runRoot, {
    label: 'failure evidence run root',
    type: 'directory',
  });
  const sanitizedCells = structuredClone(cells);
  const quarantineRoot = fs.mkdtempSync(
    path.join(root, 'worker-evidence-quarantine-'),
  );
  fs.chmodSync(quarantineRoot, 0o700);

  for (const relative of ['evidence', 'browser']) {
    const candidate = path.join(root, relative);
    try {
      fs.renameSync(candidate, path.join(quarantineRoot, relative));
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  fs.mkdirSync(path.join(root, 'evidence'), { mode: 0o700 });
  fs.mkdirSync(path.join(root, 'browser', 'evidence'), {
    recursive: true,
    mode: 0o700,
  });
  fs.mkdirSync(path.join(root, 'browser', 'cells'), {
    recursive: true,
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
    const candidate = path.join(quarantineRoot, relative);
    isolatedEntryFacts(candidate, relative, observed);
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
      // Unregistered bytes are retained only when their whole descriptor
      // closure can be independently verified.
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
    for (const relative of candidate.closure.paths) retainedPaths.add(relative);
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

  for (const relative of ['evidence', 'browser']) {
    const candidate = path.join(quarantineRoot, relative);
    removeIsolatedEntry(candidate);
  }
  const { files: _observedFiles, ...discarded } = observed;
  const quarantineDocument = {
    schemaVersion: 1,
    kind: 'worker-evidence-quarantine',
    budgetRejectedDescriptorCount,
    discarded,
    discardedEntryCount: Math.max(0, observed.entries - retainedPaths.size),
    rejectedDescriptors: rejected,
    retainedDescriptorCount: sanitizedCells.reduce(
      (total, cell) => total + cell.evidence.length,
      0,
    ),
    retainedFileCount: retainedPaths.size,
    retainedUnregisteredRootCount,
    unregisteredBudgetDroppedCount,
  };
  const quarantineManifest = path.join(quarantineRoot, 'manifest.json');
  fs.writeFileSync(
    quarantineManifest,
    Buffer.from(canonicalJson(quarantineDocument)),
    { flag: 'wx', mode: 0o600 },
  );
  return Object.freeze({
    cells: sanitizedCells,
    earliestRejectedCell,
    quarantine: Object.freeze({
      path: path.relative(root, quarantineManifest).split(path.sep).join('/'),
      sha256: await sha256File(quarantineManifest),
      ...quarantineDocument,
    }),
  });
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

export async function registerFailureEvidence({ runRoot, cells }) {
  const root = requireCanonicalPath(runRoot, {
    label: 'failure evidence run root',
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
  const directFailure = cells.find((cell) => cell.status === 'fail');
  if (!directFailure) fail('failure evidence registration requires one failed cell');
  if (directFailure.evidence.length > MAX_CELL_EVIDENCE_DESCRIPTORS) {
    fail('direct failure evidence exceeds the closed cell count');
  }
  const folded = directFailure.evidence.splice(
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
  fs.writeFileSync(indexPath, Buffer.from(canonicalJson(descriptors)), {
    flag: 'wx',
    mode: 0o600,
  });
  directFailure.evidence.push({
    kind: 'failureArtifactIndex',
    path: indexRelative,
    sha256: await sha256File(indexPath),
    summary:
      `${unregistered.length} pre-failure evidence files registered; ` +
      `${folded.length} direct descriptors folded`,
  });
  await validateEvidenceFiles({ runRoot: root, cells });
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
