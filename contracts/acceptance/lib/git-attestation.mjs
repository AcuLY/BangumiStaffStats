import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  deriveCleanCheckoutIdentity,
} from '../../artifacts/lib/git-checkout.mjs';
import {
  ALLOWED_HARNESS_DIFF_FILES,
  ALLOWED_HARNESS_DIFF_PREFIXES,
  REPOSITORY_ROOT,
} from './constants.mjs';
import { commandEvidence } from './evidence.mjs';
import {
  assertSafeRelativePath,
  requireCanonicalPath,
  sha256Bytes,
} from './paths.mjs';
import { runCommand, sanitizedEnvironment } from './runner.mjs';

export class GitAttestationError extends Error {}

function fail(message) {
  throw new GitAttestationError(message);
}

function gitEnvironment() {
  return {
    GIT_ATTR_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_NO_LAZY_FETCH: '1',
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_OPTIONAL_LOCKS: '0',
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    PATH: '/usr/bin:/bin',
  };
}

export function deriveCleanCheckoutIdentityClosed(arguments_) {
  const previous = { ...process.env };
  try {
    for (const name of Object.keys(process.env)) delete process.env[name];
    Object.assign(process.env, gitEnvironment());
    return deriveCleanCheckoutIdentity(arguments_);
  } finally {
    for (const name of Object.keys(process.env)) delete process.env[name];
    Object.assign(process.env, previous);
  }
}

function git(repositoryRoot, args, { binary = false } = {}) {
  const result = spawnSync(
    '/usr/bin/git',
    ['-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false', '-C', repositoryRoot, ...args],
    {
      encoding: binary ? null : 'utf8',
      env: gitEnvironment(),
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (result.error || result.status !== 0) {
    fail(
      `git ${args.join(' ')} failed: ${
        result.error?.message ?? result.stderr?.toString('utf8').trim() ?? result.status
      }`,
    );
  }
  return result.stdout;
}

function exactObjectId(value, label) {
  if (
    typeof value !== 'string' ||
    !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value)
  ) {
    fail(`${label} must be one exact Git object ID`);
  }
  return value;
}

function assertNoReplacementRefs(repositoryRoot) {
  const replacements = git(repositoryRoot, [
    'for-each-ref',
    '--format=%(refname)',
    'refs/replace/',
  ]).trim();
  if (replacements !== '') {
    fail('Git replacement refs are forbidden during raw authority reads');
  }
}

export function assertGitRevisionTree({
  repositoryRoot,
  revision,
  expectedTree,
  label = 'Git revision',
}) {
  const root = requireCanonicalPath(repositoryRoot, {
    label: `${label} repository`,
    type: 'directory',
  });
  exactObjectId(revision, `${label} revision`);
  exactObjectId(expectedTree, `${label} tree`);
  assertNoReplacementRefs(root);
  git(root, ['cat-file', '-e', `${revision}^{commit}`]);
  const actualTree = git(root, [
    'rev-parse',
    '--verify',
    `${revision}^{tree}`,
  ]).trim();
  if (actualTree !== expectedTree) {
    fail(`${label} revision/tree mismatch in the admitted Git object store`);
  }
  return actualTree;
}

export function assertGitAncestor({
  repositoryRoot,
  ancestorRevision,
  descendantRevision,
}) {
  const root = requireCanonicalPath(repositoryRoot, {
    label: 'Git ancestry repository',
    type: 'directory',
  });
  exactObjectId(ancestorRevision, 'product ancestor revision');
  exactObjectId(descendantRevision, 'harness descendant revision');
  assertNoReplacementRefs(root);
  git(root, ['cat-file', '-e', `${ancestorRevision}^{commit}`]);
  git(root, ['cat-file', '-e', `${descendantRevision}^{commit}`]);
  const result = spawnSync(
    '/usr/bin/git',
    [
      '-c',
      'core.fsmonitor=false',
      '-c',
      'core.untrackedCache=false',
      '-C',
      root,
      'merge-base',
      '--is-ancestor',
      ancestorRevision,
      descendantRevision,
    ],
    {
      encoding: 'utf8',
      env: gitEnvironment(),
      maxBuffer: 1024 * 1024,
    },
  );
  if (result.error || ![0, 1].includes(result.status)) {
    fail(
      `Git ancestry check failed: ${
        result.error?.message ?? result.stderr.trim() ?? result.status
      }`,
    );
  }
  if (result.status !== 0) {
    fail('accepted product revision is not an ancestor of the harness revision');
  }
}

function rawTreeRecords(repositoryRoot, revision) {
  const output = git(
    repositoryRoot,
    ['ls-tree', '-r', '-z', '--full-tree', revision],
    { binary: true },
  );
  return output
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map((record) => {
      const match =
        /^([0-7]{6}) ([a-z]+) ([0-9a-f]{40}|[0-9a-f]{64})\t(.+)$/u.exec(
          record,
        );
      if (!match) fail(`Git tree returned an invalid raw record: ${record}`);
      return Object.freeze({
        mode: match[1],
        type: match[2],
        oid: match[3],
        path: match[4],
      });
    });
}

export function listPackageLockPathsAtRevision({
  repositoryRoot,
  revision,
  prefix = '',
}) {
  const root = requireCanonicalPath(repositoryRoot, {
    label: 'raw Git repository',
    type: 'directory',
  });
  exactObjectId(revision, 'raw Git revision');
  if (prefix !== '') assertSafeRelativePath(prefix, 'raw Git path prefix');
  assertNoReplacementRefs(root);
  git(root, ['cat-file', '-e', `${revision}^{commit}`]);
  const prefixWithSeparator = prefix === '' ? '' : `${prefix}/`;
  return Object.freeze(
    rawTreeRecords(root, revision)
      .filter(
        (entry) =>
          entry.path.startsWith(prefixWithSeparator) &&
          (entry.path === 'package-lock.json' ||
            entry.path.endsWith('/package-lock.json')),
      )
      .map((entry) => entry.path)
      .sort((left, right) => left.localeCompare(right, 'en')),
  );
}

export function readRawRegularGitBlob({
  repositoryRoot,
  revision,
  relativePath,
}) {
  const root = requireCanonicalPath(repositoryRoot, {
    label: 'raw Git repository',
    type: 'directory',
  });
  exactObjectId(revision, 'raw Git revision');
  assertSafeRelativePath(relativePath, 'raw Git blob path');
  assertNoReplacementRefs(root);
  git(root, ['cat-file', '-e', `${revision}^{commit}`]);
  const records = rawTreeRecords(root, revision).filter(
    (entry) => entry.path === relativePath,
  );
  if (records.length !== 1) {
    fail(`raw Git authority is missing or ambiguous: ${relativePath}`);
  }
  const [entry] = records;
  if (entry.mode !== '100644' || entry.type !== 'blob') {
    fail(`raw Git authority must be a regular 100644 blob: ${relativePath}`);
  }
  const objectType = git(root, ['cat-file', '-t', entry.oid]).trim();
  if (objectType !== 'blob') {
    fail(`raw Git authority object is not a blob: ${relativePath}`);
  }
  const bytes = Buffer.from(
    git(root, ['cat-file', 'blob', entry.oid], { binary: true }),
  );
  const declaredSize = Number(git(root, ['cat-file', '-s', entry.oid]).trim());
  if (!Number.isSafeInteger(declaredSize) || declaredSize !== bytes.length) {
    fail(`raw Git authority size is inconsistent: ${relativePath}`);
  }
  return Object.freeze({
    revision,
    path: relativePath,
    mode: entry.mode,
    blobOid: entry.oid,
    byteCount: bytes.length,
    sha256: sha256Bytes(bytes),
    bytes,
  });
}

function treeEntries(repositoryRoot, revision) {
  const output = git(repositoryRoot, ['ls-tree', '-r', '-z', '--full-tree', revision], {
    binary: true,
  });
  const entries = new Map();
  for (const record of output.toString('utf8').split('\0').filter(Boolean)) {
    const match = /^(100644|100755) blob ([0-9a-f]{40}|[0-9a-f]{64})\t(.+)$/u.exec(
      record,
    );
    if (!match) fail(`revision contains a non-regular tracked entry: ${record}`);
    entries.set(match[3], Object.freeze({ mode: match[1], oid: match[2] }));
  }
  return entries;
}

function allowedHarnessDifference(relative) {
  return (
    ALLOWED_HARNESS_DIFF_FILES.includes(relative) ||
    ALLOWED_HARNESS_DIFF_PREFIXES.some((prefix) => relative.startsWith(prefix))
  );
}

export function attestHarnessProductDiff({
  repositoryRoot,
  productRevision,
  harnessRevision,
}) {
  const product = treeEntries(repositoryRoot, productRevision);
  const harness = treeEntries(repositoryRoot, harnessRevision);
  const changed = [];
  for (const relative of new Set([...product.keys(), ...harness.keys()])) {
    const left = product.get(relative);
    const right = harness.get(relative);
    if (left?.mode === right?.mode && left?.oid === right?.oid) continue;
    if (!allowedHarnessDifference(relative)) {
      fail(`harness/control tree changes a protected path: ${relative}`);
    }
    changed.push(relative);
  }
  changed.sort((left, right) => left.localeCompare(right, 'en'));
  if (!changed.some((relative) => relative.startsWith('contracts/acceptance/'))) {
    fail('harness/control tree does not contain the acceptance implementation');
  }
  return Object.freeze(changed);
}

function assertLifecycleBoundary(root) {
  const changesRoot = path.join(root, 'openspec', 'changes');
  const active = fs
    .readdirSync(changesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'archive')
    .map((entry) => entry.name)
    .sort();
  if (active.join(',') !== 'complete-integrated-development-acceptance') {
    fail(`unexpected active OpenSpec changes: ${active.join(',') || '(none)'}`);
  }
  const dependency = path.join(
    changesRoot,
    'archive',
    '2026-07-25-produce-development-artifacts',
  );
  requireCanonicalPath(dependency, {
    label: 'archived artifact dependency',
    type: 'directory',
  });
}

export function attestSourceIdentities(input, repositoryRoot = REPOSITORY_ROOT) {
  const harnessRoot = requireCanonicalPath(input.harness.root, {
    label: 'harness checkout',
    type: 'directory',
  });
  if (harnessRoot !== repositoryRoot) {
    fail(`harness checkout must equal the executing repository root ${repositoryRoot}`);
  }
  const harness = deriveCleanCheckoutIdentityClosed({
    repositoryRoot: harnessRoot,
    suppliedRevision: input.harness.revision,
    suppliedTree: input.harness.tree,
  });
  const productRoot = requireCanonicalPath(input.product.root, {
    label: 'product checkout',
    type: 'directory',
  });
  const product = deriveCleanCheckoutIdentityClosed({
    repositoryRoot: productRoot,
    suppliedRevision: input.product.revision,
    suppliedTree: input.product.tree,
  });
  assertGitRevisionTree({
    repositoryRoot: harnessRoot,
    revision: input.product.revision,
    expectedTree: input.product.tree,
    label: 'product',
  });
  assertGitAncestor({
    repositoryRoot: harnessRoot,
    ancestorRevision: input.product.revision,
    descendantRevision: input.harness.revision,
  });
  assertGitRevisionTree({
    repositoryRoot: harnessRoot,
    revision: input.oracle.revision,
    expectedTree: input.oracle.tree,
    label: 'oracle',
  });
  assertLifecycleBoundary(harnessRoot);
  const changed = attestHarnessProductDiff({
    repositoryRoot: harnessRoot,
    productRevision: input.product.revision,
    harnessRevision: input.harness.revision,
  });
  return Object.freeze({ product, harness, changed });
}

export function buildCloneGitEnvironment(runRoot) {
  const environment = sanitizedEnvironment({
    runRoot,
    pathEntries: ['/usr/bin', '/bin'],
  });
  return Object.freeze({
    ...environment,
    GIT_ATTR_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_NO_LAZY_FETCH: '1',
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_OPTIONAL_LOCKS: '0',
  });
}

export function assertNoHardlinkedTrackedFiles({
  sourceRoot,
  cloneRoot,
  trackedPaths,
}) {
  if (!Array.isArray(trackedPaths) || trackedPaths.length === 0) {
    fail('tracked hard-link inventory must not be empty');
  }
  for (const relative of trackedPaths) {
    const sourcePath = path.join(sourceRoot, ...relative.split('/'));
    const clonePath = path.join(cloneRoot, ...relative.split('/'));
    const sourceInformation = fs.statSync(sourcePath);
    const cloneInformation = fs.statSync(clonePath);
    if (
      sourceInformation.dev === cloneInformation.dev &&
      sourceInformation.ino === cloneInformation.ino
    ) {
      fail(`candidate clone contains a hard-linked tracked file: ${relative}`);
    }
  }
}

export async function materializeCandidateClone({
  input,
  runRoot,
  tools,
  budgets,
}) {
  const destination = path.join(runRoot, 'source', 'candidate');
  if (fs.existsSync(destination)) fail('candidate clone destination already exists');
  const gitEnv = buildCloneGitEnvironment(runRoot);
  const clone = await runCommand({
    id: 'candidate-clone',
    executable: tools.git.path,
    args: [
      '-c',
      'core.hooksPath=/dev/null',
      'clone',
      '--local',
      '--no-hardlinks',
      '--no-checkout',
      '--no-tags',
      input.product.root,
      destination,
    ],
    cwd: runRoot,
    environment: gitEnv,
    timeoutMs: budgets.timeouts.commandMs,
    gracefulStopMs: budgets.timeouts.gracefulStopMs,
    runRoot,
  });
  const checkout = await runCommand({
    id: 'candidate-checkout',
    executable: tools.git.path,
    args: [
      '-c',
      'core.hooksPath=/dev/null',
      '-C',
      destination,
      'checkout',
      '--detach',
      input.product.revision,
    ],
    cwd: runRoot,
    environment: gitEnv,
    timeoutMs: 300_000,
    gracefulStopMs: budgets.timeouts.gracefulStopMs,
    runRoot,
  });
  const alternatePath = path.join(destination, '.git', 'objects', 'info', 'alternates');
  if (fs.existsSync(alternatePath)) fail('candidate clone uses an alternate object store');
  const identity = deriveCleanCheckoutIdentityClosed({
    repositoryRoot: destination,
    suppliedRevision: input.product.revision,
    suppliedTree: input.product.tree,
  });
  const trackedPaths = [...treeEntries(destination, input.product.revision).keys()].sort(
    (left, right) => left.localeCompare(right, 'en'),
  );
  assertNoHardlinkedTrackedFiles({
    sourceRoot: input.product.root,
    cloneRoot: destination,
    trackedPaths,
  });
  return Object.freeze({
    root: destination,
    identity,
    evidence: Object.freeze([...commandEvidence(clone), ...commandEvidence(checkout)]),
  });
}
