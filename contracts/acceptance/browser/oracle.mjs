import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { registerOwnedChildProcess } from '../lib/action-boundary.mjs';
import { ORACLE_REVISION } from '../lib/constants.mjs';
import { commandEvidence } from '../lib/evidence.mjs';
import {
  isStrictlyBelow,
  requireCanonicalPath,
} from '../lib/paths.mjs';
import {
  runCommand,
  sanitizedEnvironment,
} from '../lib/runner.mjs';
import {
  assertSameSeal,
  sealDirectory,
} from '../lib/seal.mjs';
import { extractTarBuffer } from './tar.mjs';

const SANDBOX_EXECUTABLE = '/usr/bin/sandbox-exec';
const NETWORKLESS_PROFILE = '(version 1) (allow default) (deny network*)';
const MAX_GIT_ARCHIVE_BYTES = 128 * 1024 * 1024;
const MAX_STDERR_BYTES = 1024 * 1024;
const OBJECT_ID = /^[0-9a-f]{40}$/u;

export class OracleMaterializationError extends Error {}

function fail(message) {
  throw new OracleMaterializationError(message);
}

function exactExecutable(candidate, label) {
  const executable = requireCanonicalPath(candidate, {
    label,
    type: 'file',
  });
  if ((fs.statSync(executable).mode & 0o111) === 0) {
    fail(`${label} is not executable`);
  }
  return executable;
}

function gitEnvironment(runRoot, gitExecutable) {
  const environment = {
    ...sanitizedEnvironment({
      runRoot,
      pathEntries: [
        path.dirname(gitExecutable),
        '/usr/bin',
        '/bin',
      ],
    }),
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0',
  };
  return Object.freeze(environment);
}

function npmEnvironment({
  nodeExecutable,
  npmCacheRoot,
  runRoot,
}) {
  return sanitizedEnvironment({
    runRoot,
    pathEntries: [
      path.dirname(nodeExecutable),
      '/usr/bin',
      '/bin',
    ],
    extra: {
      NPM_CONFIG_AUDIT: 'false',
      NPM_CONFIG_CACHE: npmCacheRoot,
      NPM_CONFIG_FUND: 'false',
      NPM_CONFIG_IGNORE_SCRIPTS: 'true',
      NPM_CONFIG_LOGS_MAX: '0',
      NPM_CONFIG_OFFLINE: 'true',
      NPM_CONFIG_PROGRESS: 'false',
      NPM_CONFIG_UPDATE_NOTIFIER: 'false',
      PLAYWRIGHT_BROWSERS_PATH: '0',
      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
    },
  });
}

function readCommandStdout(runRoot, result) {
  return fs
    .readFileSync(path.join(runRoot, ...result.stdout.path.split('/')), 'utf8')
    .trim();
}

async function gitText({
  args,
  gitExecutable,
  id,
  repositoryRoot,
  runRoot,
  timeoutMs,
}) {
  const result = await runCommand({
    args: [
      '-p',
      NETWORKLESS_PROFILE,
      gitExecutable,
      ...args,
    ],
    cwd: repositoryRoot,
    environment: gitEnvironment(runRoot, gitExecutable),
    executable: SANDBOX_EXECUTABLE,
    gracefulStopMs: 5_000,
    id,
    runRoot,
    timeoutMs,
  });
  return Object.freeze({
    evidence: Object.freeze(commandEvidence(result)),
    result,
    stdout: readCommandStdout(runRoot, result),
  });
}

function killProcessGroup(child, signal) {
  if (!child.pid || child.exitCode !== null) return;
  try {
    if (process.platform === 'win32') child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
  }
}

async function captureGitArchive({
  gitExecutable,
  repositoryRoot,
  runRoot,
  timeoutMs,
}) {
  const child = spawn(
    SANDBOX_EXECUTABLE,
    [
      '-p',
      NETWORKLESS_PROFILE,
      gitExecutable,
      'archive',
      '--format=tar',
      ORACLE_REVISION,
      'frontend',
    ],
    {
      cwd: repositoryRoot,
      detached: process.platform !== 'win32',
      env: gitEnvironment(runRoot, gitExecutable),
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  registerOwnedChildProcess(child, {
    detached: process.platform !== 'win32',
  });
  const stdout = [];
  const stderr = [];
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let overflow = null;
  child.stdout.on('data', (chunk) => {
    stdoutBytes += chunk.length;
    if (stdoutBytes > MAX_GIT_ARCHIVE_BYTES) {
      overflow = 'Git archive exceeds the bounded output size';
      killProcessGroup(child, 'SIGKILL');
      return;
    }
    stdout.push(chunk);
  });
  child.stderr.on('data', (chunk) => {
    stderrBytes += chunk.length;
    if (stderrBytes > MAX_STDERR_BYTES) {
      overflow = 'Git archive stderr exceeds the bounded output size';
      killProcessGroup(child, 'SIGKILL');
      return;
    }
    stderr.push(chunk);
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    killProcessGroup(child, 'SIGTERM');
    setTimeout(() => killProcessGroup(child, 'SIGKILL'), 5_000).unref();
  }, timeoutMs);
  timer.unref();
  const outcome = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (status, signal) => resolve({ signal, status }));
  }).finally(() => clearTimeout(timer));
  if (timedOut) fail('Git oracle archive timed out');
  if (overflow) fail(overflow);
  if (outcome.status !== 0) {
    const summary = Buffer.concat(stderr).toString('utf8').slice(0, 512);
    fail(`Git oracle archive failed: ${summary || outcome.signal}`);
  }
  return Buffer.concat(stdout);
}

function requireFileBelow(root, relative, label) {
  const candidate = path.join(root, ...relative.split('/'));
  return requireCanonicalPath(candidate, {
    below: root,
    label,
    type: 'file',
  });
}

export async function materializeOracleSource({
  gitExecutable,
  repositoryRoot,
  runRoot,
  timeoutMs = 120_000,
}) {
  const canonicalRunRoot = requireCanonicalPath(runRoot, {
    label: 'browser run root',
    type: 'directory',
  });
  const canonicalRepository = requireCanonicalPath(repositoryRoot, {
    label: 'oracle object repository',
    type: 'directory',
  });
  const git = exactExecutable(gitExecutable, 'oracle Git executable');
  exactExecutable(SANDBOX_EXECUTABLE, 'network sandbox executable');
  const objectType = await gitText({
    args: ['cat-file', '-t', ORACLE_REVISION],
    gitExecutable: git,
    id: 'oracle-object-type',
    repositoryRoot: canonicalRepository,
    runRoot: canonicalRunRoot,
    timeoutMs,
  });
  if (objectType.stdout !== 'commit') fail('fixed oracle object is not a commit');
  const tree = await gitText({
    args: ['rev-parse', `${ORACLE_REVISION}^{tree}`],
    gitExecutable: git,
    id: 'oracle-commit-tree',
    repositoryRoot: canonicalRepository,
    runRoot: canonicalRunRoot,
    timeoutMs,
  });
  const frontendTree = await gitText({
    args: ['rev-parse', `${ORACLE_REVISION}:frontend`],
    gitExecutable: git,
    id: 'oracle-frontend-tree',
    repositoryRoot: canonicalRepository,
    runRoot: canonicalRunRoot,
    timeoutMs,
  });
  if (!OBJECT_ID.test(tree.stdout) || !OBJECT_ID.test(frontendTree.stdout)) {
    fail('fixed oracle tree identity is invalid');
  }
  const archiveBytes = await captureGitArchive({
    gitExecutable: git,
    repositoryRoot: canonicalRepository,
    runRoot: canonicalRunRoot,
    timeoutMs,
  });
  const extracted = extractTarBuffer({
    allowGitPaxRevision: ORACLE_REVISION,
    bytes: archiveBytes,
    outputRelative: 'browser/oracle-source',
    preserveExecutable: true,
    runRoot: canonicalRunRoot,
    stripPrefix: 'frontend/',
  });
  if (extracted.gitPaxRevision !== ORACLE_REVISION) {
    fail('Git archive did not carry the fixed oracle revision comment');
  }
  for (const required of [
    'package.json',
    'package-lock.json',
    'person-workbench.html',
    'person-workbench-empty.html',
  ]) {
    requireFileBelow(extracted.outputRoot, required, `oracle ${required}`);
  }
  const trackedFiles = Object.freeze(
    extracted.entries
      .filter((entry) => entry.kind === 'file')
      .map((entry) => entry.path),
  );
  const sourceSeal = await sealDirectory(extracted.outputRoot, {
    paths: trackedFiles,
  });
  return Object.freeze({
    archiveDigest: extracted.archiveDigest,
    commandEvidence: Object.freeze([
      ...objectType.evidence,
      ...tree.evidence,
      ...frontendTree.evidence,
    ]),
    frontendTree: frontendTree.stdout,
    revision: ORACLE_REVISION,
    sourceRoot: extracted.outputRoot,
    sourceSeal,
    trackedFiles,
    tree: tree.stdout,
  });
}

export async function buildOracle({
  nodeExecutable,
  npmCacheRoot,
  npmCliPath,
  oracleSource,
  runRoot,
  timeoutMs = 900_000,
}) {
  const canonicalRunRoot = requireCanonicalPath(runRoot, {
    label: 'browser run root',
    type: 'directory',
  });
  const sourceRoot = requireCanonicalPath(oracleSource.sourceRoot, {
    below: canonicalRunRoot,
    label: 'oracle source root',
    type: 'directory',
  });
  const cacheRoot = requireCanonicalPath(npmCacheRoot, {
    below: canonicalRunRoot,
    label: 'owned oracle npm cache',
    type: 'directory',
  });
  if (!isStrictlyBelow(cacheRoot, canonicalRunRoot)) {
    fail('oracle npm cache is not owned by the run root');
  }
  const node = exactExecutable(nodeExecutable, 'oracle Node executable');
  const npmCli = exactExecutable(npmCliPath, 'oracle npm CLI');
  exactExecutable(SANDBOX_EXECUTABLE, 'network sandbox executable');
  const cacheBefore = await sealDirectory(cacheRoot);
  const environment = npmEnvironment({
    nodeExecutable: node,
    npmCacheRoot: cacheRoot,
    runRoot: canonicalRunRoot,
  });
  const install = await runCommand({
    args: [
      '-p',
      NETWORKLESS_PROFILE,
      node,
      npmCli,
      'ci',
      '--ignore-scripts',
      '--offline',
      '--no-audit',
      '--no-fund',
    ],
    cwd: sourceRoot,
    environment,
    executable: SANDBOX_EXECUTABLE,
    gracefulStopMs: 10_000,
    id: 'oracle-npm-ci',
    runRoot: canonicalRunRoot,
    timeoutMs,
  });
  const build = await runCommand({
    args: [
      '-p',
      NETWORKLESS_PROFILE,
      node,
      npmCli,
      'run',
      'build',
      '--offline',
      '--ignore-scripts',
    ],
    cwd: sourceRoot,
    environment,
    executable: SANDBOX_EXECUTABLE,
    gracefulStopMs: 10_000,
    id: 'oracle-npm-build',
    runRoot: canonicalRunRoot,
    timeoutMs,
  });
  const sourceAfter = await sealDirectory(sourceRoot, {
    paths: oracleSource.trackedFiles,
  });
  assertSameSeal(oracleSource.sourceSeal, sourceAfter, 'fixed oracle source');
  const cacheAfter = await sealDirectory(cacheRoot);
  assertSameSeal(cacheBefore, cacheAfter, 'owned oracle npm cache');
  const distRoot = requireCanonicalPath(path.join(sourceRoot, 'dist'), {
    below: sourceRoot,
    label: 'oracle build output',
    type: 'directory',
  });
  for (const required of [
    'person-workbench.html',
    'person-workbench-empty.html',
  ]) {
    requireFileBelow(distRoot, required, `oracle output ${required}`);
  }
  const buildSeal = await sealDirectory(distRoot);
  return Object.freeze({
    archiveDigest: oracleSource.archiveDigest,
    buildDigest: buildSeal.digest,
    cacheDigest: cacheAfter.digest,
    commandEvidence: Object.freeze([
      ...commandEvidence(install),
      ...commandEvidence(build),
    ]),
    distRoot,
    frontendTree: oracleSource.frontendTree,
    revision: oracleSource.revision,
    sourceDigest: oracleSource.sourceSeal.digest,
    tree: oracleSource.tree,
  });
}

export async function materializeAndBuildOracle(options) {
  const source = await materializeOracleSource(options);
  return buildOracle({ ...options, oracleSource: source });
}
