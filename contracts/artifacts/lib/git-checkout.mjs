import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const GIT_OBJECT_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const MAX_GIT_OUTPUT = 64 * 1024 * 1024;

export class CheckoutAttestationError extends Error {}

function fail(message) {
  throw new CheckoutAttestationError(message);
}

function gitEnvironment() {
  const environment = { ...process.env };
  for (const name of Object.keys(environment)) {
    if (name.startsWith('GIT_')) delete environment[name];
  }
  environment.GIT_CONFIG_GLOBAL = process.platform === 'win32' ? 'NUL' : '/dev/null';
  environment.GIT_CONFIG_NOSYSTEM = '1';
  environment.GIT_ATTR_NOSYSTEM = '1';
  environment.GIT_NO_LAZY_FETCH = '1';
  environment.GIT_NO_REPLACE_OBJECTS = '1';
  environment.GIT_OPTIONAL_LOCKS = '0';
  environment.LC_ALL = 'C';
  return environment;
}

function runGit(
  repositoryRoot,
  arguments_,
  {
    allowDirtyStatus = false,
    binary = false,
    input,
  } = {},
) {
  const configuration = [
    '-c',
    'core.fsmonitor=false',
    '-c',
    'core.untrackedCache=false',
  ];
  const result = spawnSync(
    'git',
    [
      ...configuration,
      '-C',
      repositoryRoot,
      ...arguments_,
    ],
    {
      encoding: binary ? null : 'utf8',
      env: gitEnvironment(),
      input,
      maxBuffer: MAX_GIT_OUTPUT,
    },
  );
  if (result.error) fail(`git ${arguments_.join(' ')} failed: ${result.error.message}`);
  if (allowDirtyStatus && (result.status === 0 || result.status === 1)) return result;
  if (result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr)
      ? result.stderr.toString('utf8')
      : result.stderr;
    fail(`git ${arguments_.join(' ')} failed: ${stderr.trim() || `status ${result.status}`}`);
  }
  return result;
}

function gitText(repositoryRoot, arguments_) {
  return runGit(repositoryRoot, arguments_).stdout.trim();
}

function canonicalRepositoryRoot(repositoryRoot) {
  const requested = path.resolve(repositoryRoot);
  let information;
  try {
    information = fs.lstatSync(requested);
  } catch (error) {
    fail(`canonical repository root is unavailable: ${error.message}`);
  }
  if (information.isSymbolicLink() || !information.isDirectory()) {
    fail('canonical repository root must be a real directory');
  }
  const canonical = fs.realpathSync.native(requested);
  if (canonical !== requested) {
    fail(`repository root must use its canonical path: ${canonical}`);
  }
  const reported = path.resolve(
    gitText(canonical, ['rev-parse', '--show-toplevel']),
  );
  let reportedCanonical;
  try {
    reportedCanonical = fs.realpathSync.native(reported);
  } catch (error) {
    fail(`Git reported an unavailable repository root: ${error.message}`);
  }
  if (reported !== reportedCanonical || reportedCanonical !== canonical) {
    fail(
      `Git checkout root mismatch: expected ${canonical}, received ${reportedCanonical}`,
    );
  }
  return canonical;
}

function assertObjectId(value, label) {
  if (!GIT_OBJECT_RE.test(value)) fail(`${label} is not a lowercase Git object ID`);
  return value;
}

function assertControlPlanePath(value) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.startsWith('/') ||
    value.includes('\\') ||
    value.includes('\0')
  ) {
    fail('control-plane path must be a normalized relative POSIX path');
  }
  const parts = value.split('/');
  if (
    parts.some(
      (part) =>
        part === '' ||
        part === '.' ||
        part === '..' ||
        !/^[A-Za-z0-9._-]+$/.test(part),
    )
  ) {
    fail(`control-plane path is unsafe: ${value}`);
  }
  return value;
}

function requireRegularPath(repositoryRoot, relative) {
  let current = repositoryRoot;
  const parts = relative.split('/');
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    let information;
    try {
      information = fs.lstatSync(current);
    } catch (error) {
      fail(`control-plane path is missing: ${relative} (${error.message})`);
    }
    if (information.isSymbolicLink()) {
      fail(`control-plane path must not traverse a symlink: ${relative}`);
    }
    if (index < parts.length - 1 && !information.isDirectory()) {
      fail(`control-plane parent must be a directory: ${relative}`);
    }
    if (index === parts.length - 1 && !information.isFile()) {
      fail(`control-plane path must be a regular file: ${relative}`);
    }
  }
  const resolved = fs.realpathSync.native(current);
  if (!resolved.startsWith(`${repositoryRoot}${path.sep}`)) {
    fail(`control-plane path escapes the canonical checkout: ${relative}`);
  }
  return { absolute: resolved, information: fs.lstatSync(resolved) };
}

function splitNul(buffer) {
  return buffer
    .toString('utf8')
    .split('\0')
    .filter((record) => record.length > 0);
}

function headTreeEntries(repositoryRoot, revision) {
  const entries = new Map();
  const output = runGit(
    repositoryRoot,
    ['ls-tree', '-r', '-z', '--full-tree', revision],
    { binary: true },
  ).stdout;
  for (const record of splitNul(output)) {
    const match = /^(100644|100755) blob ([0-9a-f]{40}|[0-9a-f]{64})\t(.+)$/.exec(
      record,
    );
    if (!match) {
      fail('HEAD tree must contain regular blobs only');
    }
    const relative = assertControlPlanePath(match[3]);
    if (entries.has(relative)) fail(`HEAD tree contains duplicate path ${relative}`);
    entries.set(relative, { mode: match[1], oid: match[2], path: relative });
  }
  if (entries.size === 0) fail('HEAD tree contains no regular files');
  return entries;
}

function indexEntries(repositoryRoot) {
  const entries = new Map();
  const output = runGit(repositoryRoot, ['ls-files', '--stage', '-z'], {
    binary: true,
  }).stdout;
  for (const record of splitNul(output)) {
    const match =
      /^(100644|100755) ([0-9a-f]{40}|[0-9a-f]{64}) ([0-3])\t(.+)$/.exec(
        record,
      );
    if (!match) fail('index must contain regular blob entries only');
    const stage = Number(match[3]);
    const relative = assertControlPlanePath(match[4]);
    if (stage !== 0) fail(`index contains non-stage-zero entry: ${relative}`);
    if (entries.has(relative)) fail(`index contains duplicate path ${relative}`);
    entries.set(relative, { mode: match[1], oid: match[2], path: relative });
  }
  return entries;
}

function assertIndexFlags(repositoryRoot) {
  const tags = splitNul(
    runGit(repositoryRoot, ['ls-files', '-v', '-z'], {
      binary: true,
    }).stdout,
  );
  const paths = new Set();
  for (const record of tags) {
    const match = /^(.{1}) (.+)$/u.exec(record);
    if (!match || match[1] !== 'H') {
      fail(`index contains assume-unchanged, skip-worktree, or hidden flags: ${record}`);
    }
    paths.add(assertControlPlanePath(match[2]));
  }
  if (paths.size !== tags.length) fail('index flag inventory has duplicates');
  return paths;
}

function assertNoReplacementRefs(repositoryRoot) {
  const replacements = gitText(repositoryRoot, [
    'for-each-ref',
    '--format=%(refname)',
    'refs/replace',
  ]);
  if (replacements) fail('checkout contains local replacement refs');
}

function assertTreeEqualsIndex(tree, index) {
  if (tree.size !== index.size) fail('checkout index differs from HEAD tree');
  for (const [relative, expected] of tree) {
    const actual = index.get(relative);
    if (
      !actual ||
      actual.mode !== expected.mode ||
      actual.oid !== expected.oid
    ) {
      fail(`checkout index differs from HEAD tree: ${relative}`);
    }
  }
}

function blobObjectId(bytes, revision) {
  const algorithm = revision.length === 64 ? 'sha256' : 'sha1';
  return createHash(algorithm)
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest('hex');
}

function readVerifiedTrackedFile(repositoryRoot, revision, entry) {
  const { absolute, information } = requireRegularPath(
    repositoryRoot,
    entry.path,
  );
  const expectedExecutable = entry.mode === '100755';
  const actualExecutable = (information.mode & 0o111) !== 0;
  if (actualExecutable !== expectedExecutable) {
    fail(`tracked executable mode differs from HEAD: ${entry.path}`);
  }
  const bytes = fs.readFileSync(absolute);
  if (blobObjectId(bytes, revision) !== entry.oid) {
    fail(`raw tracked bytes differ from HEAD: ${entry.path}`);
  }
  return bytes;
}

function assertRawTrackedFiles(repositoryRoot, revision, entries) {
  for (const entry of entries.values()) {
    readVerifiedTrackedFile(repositoryRoot, revision, entry);
  }
}

function trackedIgnoreSource(repositoryRoot, trackedEntries, relativeDirectory) {
  const output = runGit(
    repositoryRoot,
    ['check-ignore', '-v', '-z', '--no-index', '--stdin'],
    {
      allowDirtyStatus: true,
      binary: true,
      input: Buffer.from(`${relativeDirectory.replace(/\/?$/u, '/')}\0`),
    },
  );
  if (output.status === 1 || output.stdout.length === 0) return false;
  const fields = splitNul(output.stdout);
  if (fields.length !== 4) fail('Git ignore provenance output is malformed');
  const [source, , pattern] = fields;
  if (pattern.startsWith('!')) return false;
  return (
    source.endsWith('.gitignore') &&
    trackedEntries.has(source) &&
    source !== `${relativeDirectory}/.gitignore`
  );
}

function assertNoUntrackedIgnoreControl(repositoryRoot, trackedEntries) {
  const ignoreControls = splitNul(
    runGit(
      repositoryRoot,
      [
        'ls-files',
        '--others',
        '-z',
        '--',
        '.gitignore',
        ':(glob)**/.gitignore',
      ],
      { binary: true },
    ).stdout,
  ).map(assertControlPlanePath);
  for (const relative of ignoreControls) {
    const parents = relative.split('/').slice(0, -1);
    let ignoredByCommittedDirectory = false;
    for (let length = 1; length <= parents.length; length += 1) {
      const ancestor = parents.slice(0, length).join('/');
      if (trackedIgnoreSource(repositoryRoot, trackedEntries, ancestor)) {
        ignoredByCommittedDirectory = true;
        break;
      }
    }
    if (!ignoredByCommittedDirectory) {
      fail(`untracked ignore-control file can hide candidate input: ${relative}`);
    }
  }
}

function assertNoUntrackedInput(repositoryRoot, trackedEntries) {
  assertNoUntrackedIgnoreControl(repositoryRoot, trackedEntries);
  const untracked = runGit(
    repositoryRoot,
    ['ls-files', '--others', '--exclude-per-directory=.gitignore', '-z'],
    { binary: true },
  ).stdout;
  if (untracked.length !== 0) fail('checkout contains untracked non-ignored paths');
}

export function captureTrackedRegularFilesAtRevision({
  repositoryRoot,
  revision,
  prefix,
}) {
  const root = canonicalRepositoryRoot(repositoryRoot);
  const object = assertObjectId(revision, 'requested revision');
  const current = assertObjectId(
    gitText(root, ['rev-parse', '--verify', 'HEAD^{commit}']),
    'checkout revision',
  );
  if (current !== object) fail('requested revision is not checkout HEAD');
  const normalizedPrefix = assertControlPlanePath(prefix);
  const tree = headTreeEntries(root, object);
  const result = [];
  for (const entry of tree.values()) {
    if (
      entry.path !== normalizedPrefix &&
      !entry.path.startsWith(`${normalizedPrefix}/`)
    ) {
      continue;
    }
    result.push(
      Object.freeze({
        path: entry.path,
        mode: entry.mode,
        bytes: readVerifiedTrackedFile(root, object, entry),
      }),
    );
  }
  if (result.length === 0) fail(`source tree has no files below ${normalizedPrefix}`);
  return Object.freeze(result);
}

export function deriveCleanCheckoutIdentity({
  repositoryRoot,
  suppliedRevision,
  suppliedTree,
  controlPlanePaths = [],
}) {
  const root = canonicalRepositoryRoot(repositoryRoot);
  assertNoReplacementRefs(root);
  const revision = assertObjectId(
    gitText(root, ['rev-parse', '--verify', 'HEAD^{commit}']),
    'checkout revision',
  );
  const tree = assertObjectId(
    gitText(root, ['rev-parse', '--verify', 'HEAD^{tree}']),
    'checkout tree',
  );

  const supplied = suppliedRevision !== undefined || suppliedTree !== undefined;
  if (supplied && (suppliedRevision === undefined || suppliedTree === undefined)) {
    fail('supplied source identity must include both revision and tree');
  }
  if (suppliedRevision !== undefined && suppliedRevision !== revision) {
    fail(`supplied source revision does not equal checkout HEAD ${revision}`);
  }
  if (suppliedTree !== undefined && suppliedTree !== tree) {
    fail(`supplied source tree does not equal checkout HEAD tree ${tree}`);
  }

  const treeEntries = headTreeEntries(root, revision);
  const currentIndex = indexEntries(root);
  const indexFlagPaths = assertIndexFlags(root);
  if (
    indexFlagPaths.size !== currentIndex.size ||
    [...indexFlagPaths].some((relative) => !currentIndex.has(relative))
  ) {
    fail('index flag inventory is incomplete');
  }
  assertTreeEqualsIndex(treeEntries, currentIndex);
  assertRawTrackedFiles(root, revision, treeEntries);

  const paths = [...controlPlanePaths].map(assertControlPlanePath).sort();
  if (new Set(paths).size !== paths.length) {
    fail('control-plane paths must be unique');
  }
  for (const relative of paths) {
    if (!treeEntries.has(relative)) {
      fail(`control-plane path is not a tracked regular blob in ${revision}: ${relative}`);
    }
  }
  assertNoUntrackedInput(root, treeEntries);
  return Object.freeze({ revision, tree, repositoryRoot: root });
}
