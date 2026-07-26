import fs from 'node:fs';
import path from 'node:path';

import {
  copyCacheTree,
  seedGoModuleCache,
  seedNpmCache,
  validateSeededGoToolchain,
} from './cache.mjs';
import { commandEvidence, writeEvidence } from './evidence.mjs';
import {
  assertNoSymlinkAncestors,
  assertSafeRelativePath,
  isStrictlyBelow,
  requireCanonicalPath,
} from './paths.mjs';
import { runCommand, sanitizedEnvironment } from './runner.mjs';
import { verifyRuntimeClosures } from './tools.mjs';

const SANDBOX_EXECUTABLE = '/usr/bin/sandbox-exec';
const NETWORKLESS_PROFILE = '(version 1)(allow default)(deny network*)';
const QUERY_GOLDEN_TIMEOUT_MS = 300_000;
export const QUERY_GOLDEN_COMMAND_IDS = Object.freeze([
  'contracts-query-npm-ci',
  'contracts-query-verify',
  'contracts-query-cleanup-safety',
  'contracts-query-prepare-codegen',
  'contracts-query-redocly-codegen-a',
  'contracts-query-redocly-codegen-b',
  'contracts-query-typescript-a',
  'contracts-query-typescript-b',
  'contracts-query-verify-codegen',
  'contracts-query-cleanup',
]);
const GENERATED_ROOT_CLEANUP_ATTEMPTS = 4;
const GENERATED_ROOT_CLEANUP_RETRY_MS = 25;
const TRANSIENT_GENERATED_ROOT_ERRORS = new Set([
  'EBUSY',
  'EMFILE',
  'ENFILE',
  'ENOTEMPTY',
  'EPERM',
]);
const CONTRACTS_GENERATED_ROOTS = Object.freeze([
  'contracts/goldens/query/node_modules',
  'contracts/goldens/query/.cache',
  'contracts/goldens/query/.tmp',
  'contracts/schemas/archive/tooling/node_modules',
  'contracts/schemas/archive/.cache',
  'contracts/schemas/archive/.tmp',
  'contracts/schemas/catalog/tooling/node_modules',
  'contracts/schemas/catalog/tooling/.cache',
  'contracts/schemas/update-status/tooling/node_modules',
  'contracts/schemas/update-status/tooling/.cache',
]);

const CURRENT_NPM_PACKAGES = Object.freeze([
  'contracts/schemas/archive/tooling',
  'contracts/schemas/catalog/tooling',
  'contracts/schemas/update-status/tooling',
  'contracts/goldens/api/catalog',
  'contracts/goldens/api/rankings',
  'contracts/goldens/api/candidates',
  'contracts/goldens/api/person-detail',
  'contracts/goldens/api/partners',
  'contracts/goldens/api/co-star',
]);

const DIRECT_NODE_VERIFIERS = Object.freeze([
  'contracts/goldens/query-domain/verify.mjs',
  'contracts/goldens/statistics/verify.mjs',
]);

export class OwnerGateError extends Error {}

function fail(message) {
  throw new OwnerGateError(message);
}

class GeneratedRootCleanupError extends OwnerGateError {
  constructor(relative, attempts, filesystemCode, cause) {
    super(
      `generated cleanup failed after ${attempts} bounded attempt(s): ` +
        `${relative} (${filesystemCode})`,
      { cause },
    );
    this.code = 'OWNER_GATE_GENERATED_CLEANUP_FAILED';
    this.relative = relative;
    this.attempts = attempts;
    this.filesystemCode = filesystemCode;
  }
}

function ensureEmptyDirectory(candidate) {
  if (fs.existsSync(candidate)) fail(`owned gate directory already exists: ${candidate}`);
  fs.mkdirSync(candidate, { recursive: true, mode: 0o700 });
  return candidate;
}

function exactGeneratedRoot(root, relative) {
  const safe = assertSafeRelativePath(relative, 'generated cleanup root');
  const absolute = path.resolve(root, ...safe.split('/'));
  if (!isStrictlyBelow(absolute, root)) {
    fail(`generated cleanup escapes candidate root: ${relative}`);
  }
  return absolute;
}

function generatedRootInformation(absolute, relative) {
  assertNoSymlinkAncestors(absolute, `generated cleanup target ${relative}`);
  let information;
  try {
    information = fs.lstatSync(absolute);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  if (information.isSymbolicLink()) {
    fail(`generated cleanup target is a symlink: ${relative}`);
  }
  if (!information.isDirectory()) {
    fail(`generated cleanup target is not a directory: ${relative}`);
  }
  return information;
}

function generatedRootExists(root, relative) {
  const absolute = exactGeneratedRoot(root, relative);
  try {
    fs.lstatSync(absolute);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    return true;
  }
}

function cleanupFilesystemCode(error) {
  const source =
    typeof error === 'string'
      ? error
      : error?.code ?? error?.constructor?.name ?? 'ERROR';
  const candidate = String(source)
    .replaceAll(/[^A-Za-z0-9_]+/gu, '_')
    .toUpperCase();
  return /^[A-Z][A-Z0-9_]{1,63}$/u.test(candidate)
    ? candidate
    : 'ERROR';
}

function cleanupDelay(attempt) {
  return new Promise((resolve) => {
    setTimeout(resolve, GENERATED_ROOT_CLEANUP_RETRY_MS * attempt);
  });
}

export async function removeOwnedGenerated(root, relative) {
  const canonicalRoot = requireCanonicalPath(root, {
    label: 'generated cleanup candidate root',
    type: 'directory',
  });
  if (canonicalRoot !== root) {
    fail('generated cleanup candidate root is not canonical');
  }
  const absolute = exactGeneratedRoot(canonicalRoot, relative);
  let observed = false;
  for (
    let attempt = 1;
    attempt <= GENERATED_ROOT_CLEANUP_ATTEMPTS;
    attempt += 1
  ) {
    const information = generatedRootInformation(absolute, relative);
    if (information === null) {
      return Object.freeze({
        attempts: attempt,
        relative,
        status: observed ? 'removed' : 'absent',
      });
    }
    observed = true;
    try {
      fs.rmSync(absolute, { recursive: true, force: false });
      if (generatedRootInformation(absolute, relative) === null) {
        return Object.freeze({
          attempts: attempt,
          relative,
          status: 'removed',
        });
      }
      const residue = new Error('generated root survived removal');
      residue.code = 'ENOTEMPTY';
      throw residue;
    } catch (error) {
      const filesystemCode = cleanupFilesystemCode(error);
      if (
        TRANSIENT_GENERATED_ROOT_ERRORS.has(filesystemCode) &&
        attempt < GENERATED_ROOT_CLEANUP_ATTEMPTS
      ) {
        await cleanupDelay(attempt);
        continue;
      }
      throw new GeneratedRootCleanupError(
        relative,
        attempt,
        filesystemCode,
        error,
      );
    }
  }
  fail(`generated cleanup exhausted its bounded attempts: ${relative}`);
}

export async function cleanupContractsGeneratedRoots(candidateRoot) {
  const root = requireCanonicalPath(candidateRoot, {
    label: 'Contracts generated cleanup candidate',
    type: 'directory',
  });
  const outcomes = [];
  for (const relative of CONTRACTS_GENERATED_ROOTS) {
    try {
      outcomes.push(await removeOwnedGenerated(root, relative));
    } catch (error) {
      outcomes.push(Object.freeze({
        attempts: Number.isInteger(error?.attempts) ? error.attempts : 1,
        code: cleanupFilesystemCode(error?.filesystemCode ?? error),
        relative,
        residue: generatedRootExists(root, relative),
        status: 'failed',
      }));
    }
  }
  const failedCount = outcomes.filter(
    (outcome) => outcome.status === 'failed',
  ).length;
  const report = {
    attemptLimit: GENERATED_ROOT_CLEANUP_ATTEMPTS,
    failedCount,
    outcomes: Object.freeze(outcomes),
    residueCount: outcomes.filter(
      (outcome) => outcome.status === 'failed' && outcome.residue,
    ).length,
    retriedCount: outcomes.filter((outcome) => outcome.attempts > 1).length,
    retryDelayMs: GENERATED_ROOT_CLEANUP_RETRY_MS,
  };
  return Object.freeze(report);
}

function registerSecondaryCleanup(primaryError, cleanup, evidence) {
  const existingEvidence = Array.isArray(primaryError?.evidence)
    ? primaryError.evidence
    : primaryError?.result
      ? commandEvidence(primaryError.result)
      : [];
  try {
    Object.defineProperty(primaryError, 'cleanup', {
      configurable: true,
      enumerable: true,
      value: cleanup,
    });
    if (evidence) {
      Object.defineProperty(primaryError, 'evidence', {
        configurable: true,
        enumerable: true,
        value: Object.freeze([...existingEvidence, evidence]),
      });
    }
  } catch {
    // The originating error remains primary even if it cannot carry metadata.
  }
  return primaryError;
}

function ownerCleanupFailure(cleanup, evidence, evidenceError) {
  const suffix = evidenceError
    ? ' and its secondary evidence could not be written'
    : '';
  const error = new OwnerGateError(
    `Contracts owner generated-root cleanup failed for ` +
      `${cleanup.failedCount} exact root(s)${suffix}`,
    evidenceError ? { cause: evidenceError } : undefined,
  );
  error.code = 'OWNER_GATE_CLEANUP_FAILED';
  error.cleanup = cleanup;
  error.evidence = Object.freeze(evidence ? [evidence] : []);
  return error;
}

export async function settleContractsOwnerGate({
  candidateRoot,
  runRoot,
  gateResult,
  primaryError,
}) {
  const cleanup = await cleanupContractsGeneratedRoots(candidateRoot);
  const notable = cleanup.failedCount > 0 || cleanup.retriedCount > 0;
  let evidence;
  let evidenceError;
  if (notable) {
    try {
      evidence = await writeEvidence({
        runRoot,
        relative: 'evidence/gates/owner-contracts-cleanup.json',
        kind: 'cleanup',
        value: cleanup,
        summary:
          `Contracts generated-root cleanup: ${cleanup.failedCount} failed, ` +
          `${cleanup.retriedCount} retried, ${cleanup.residueCount} residual`,
      });
    } catch (error) {
      evidenceError = error;
    }
  }
  if (primaryError !== undefined) {
    throw registerSecondaryCleanup(primaryError, cleanup, evidence);
  }
  if (cleanup.failedCount > 0 || evidenceError) {
    throw ownerCleanupFailure(cleanup, evidence, evidenceError);
  }
  if (!gateResult || !Array.isArray(gateResult.evidence)) {
    fail('Contracts owner gate completed without one result');
  }
  if (!evidence) return gateResult;
  return Object.freeze({
    ...gateResult,
    evidence: Object.freeze([...gateResult.evidence, evidence]),
  });
}

function thawOwnedWorkingCache(root) {
  function visit(candidate) {
    const information = fs.lstatSync(candidate);
    if (information.isSymbolicLink()) {
      fail(`owned working cache contains a symlink: ${candidate}`);
    }
    if (information.isDirectory()) {
      fs.chmodSync(candidate, 0o700);
      for (const entry of fs.readdirSync(candidate)) {
        visit(path.join(candidate, entry));
      }
      return;
    }
    if (!information.isFile()) {
      fail(`owned working cache contains a special file: ${candidate}`);
    }
    fs.chmodSync(candidate, (information.mode & 0o111) === 0 ? 0o600 : 0o700);
  }
  visit(root);
}

function commandEnvironment({
  runRoot,
  pathEntries,
  extra = {},
}) {
  return sanitizedEnvironment({
    runRoot,
    pathEntries: [...pathEntries, '/usr/bin', '/bin', '/usr/sbin', '/sbin'],
    extra: {
      NPM_CONFIG_AUDIT: 'false',
      NPM_CONFIG_FUND: 'false',
      NPM_CONFIG_IGNORE_SCRIPTS: 'true',
      NPM_CONFIG_LOGS_MAX: '0',
      NPM_CONFIG_OFFLINE: 'true',
      NPM_CONFIG_PROGRESS: 'false',
      NPM_CONFIG_UPDATE_NOTIFIER: 'false',
      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
      ...extra,
    },
  });
}

async function networklessCommand({
  id,
  executable,
  args,
  cwd,
  environment,
  timeoutMs,
  budgets,
  runRoot,
  profile = NETWORKLESS_PROFILE,
}) {
  return runCommand({
    id,
    executable: SANDBOX_EXECUTABLE,
    args: ['-p', profile, executable, ...args],
    cwd,
    environment,
    timeoutMs,
    gracefulStopMs: budgets.timeouts.gracefulStopMs,
    runRoot,
  });
}

function sandboxLiteral(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

export function dockerLocalSandboxProfile(endpoint) {
  if (
    typeof endpoint !== 'string' ||
    !endpoint.startsWith('unix:///') ||
    endpoint.includes('\0')
  ) {
    fail('Docker-local sandbox requires an exact Unix endpoint');
  }
  const socket = endpoint.slice('unix://'.length);
  return [
    '(version 1)',
    '(allow default)',
    '(deny network*)',
    '(allow network-inbound (local ip "localhost:*"))',
    '(allow network-outbound (remote ip "localhost:*"))',
    `(allow network-outbound (literal "${sandboxLiteral(socket)}"))`,
  ].join('');
}

export function historicalGoReadOnlySandboxProfile(goRoot) {
  const canonical = requireCanonicalPath(goRoot, {
    label: 'historical Query Go GOROOT',
    type: 'directory',
  });
  if (canonical !== '/opt/homebrew/Cellar/go/1.25.4/libexec') {
    fail('historical Query Go sandbox received an unexpected GOROOT');
  }
  return [
    NETWORKLESS_PROFILE,
    `(deny file-write* (subpath "${sandboxLiteral(canonical)}"))`,
  ].join('');
}

export function runtimeReadOnlySandboxProfile(roots, base = NETWORKLESS_PROFILE) {
  if (!Array.isArray(roots) || roots.length === 0) {
    fail('runtime-root sandbox requires at least one root');
  }
  const canonical = [...new Map(roots.map((root, index) => {
    let information;
    try {
      information = fs.lstatSync(root);
    } catch (error) {
      fail(`runtime sandbox root ${index} is unavailable: ${error.message}`);
    }
    const type = information.isDirectory()
      ? 'directory'
      : information.isFile()
        ? 'file'
        : null;
    if (!type || information.isSymbolicLink()) {
      fail(`runtime sandbox root ${index} is not a real file or directory`);
    }
    const candidate = requireCanonicalPath(root, {
      label: `runtime sandbox root ${index}`,
      type,
    });
    return [candidate, Object.freeze({ path: candidate, type })];
  })).values()].sort((left, right) =>
    left.path.localeCompare(right.path, 'en'));
  return [
    base,
    ...canonical.flatMap((entry) => [
      `(deny file-write* (literal "${sandboxLiteral(entry.path)}"))`,
      ...(entry.type === 'directory'
        ? [`(deny file-write* (subpath "${sandboxLiteral(entry.path)}"))`]
        : []),
    ]),
  ].join('');
}

function runtimePaths(runtimeRoots, names) {
  if (!runtimeRoots || typeof runtimeRoots !== 'object') {
    fail('owning gate requires admitted runtime roots');
  }
  return names.map((name) => {
    const declaration = runtimeRoots[name];
    if (!declaration?.root) fail(`owning gate is missing runtime root ${name}`);
    return declaration.root;
  });
}

const CURRENT_NODE_RUNTIME_NAMES = Object.freeze([
  'currentNodeSource',
  'currentNode',
  'currentNpmSource',
  'currentNpm',
]);
const CURRENT_GO_RUNTIME_NAMES = Object.freeze([
  'currentGoSource',
  'currentGo',
]);
const QUERY_RUNTIME_NAMES = Object.freeze([
  'queryNode',
  'queryNpm',
  'historicalGo',
]);
const PYTHON_RUNTIME_NAMES = Object.freeze([
  'pythonSource',
  'python',
  'uvSource',
  'uv',
]);
const DOCKER_RUNTIME_NAMES = Object.freeze([
  'dockerSource',
  'docker',
]);

function npmInvocation(tools, family, args) {
  const current = family === 'current';
  const node = tools[current ? 'node' : 'queryNode'];
  const npm = tools[current ? 'npm' : 'queryNpm'];
  if (!node || !npm) fail(`unknown npm tool family ${family}`);
  return Object.freeze({
    executable: node.path,
    args: [npm.path, ...args],
    pathEntries: [path.dirname(node.path)],
  });
}

async function runNpm({
  id,
  family,
  args,
  cwd,
  cache,
  tools,
  budgets,
  runRoot,
  timeoutMs,
  extra = {},
  additionalPathEntries = [],
  runtimeRoots,
}) {
  const invocation = npmInvocation(tools, family, args);
  const environment = commandEnvironment({
    runRoot,
    pathEntries: [...invocation.pathEntries, ...additionalPathEntries],
    extra: {
      NPM_CONFIG_CACHE: cache,
      NPM_CONFIG_ENGINE_STRICT: 'true',
      ...extra,
    },
  });
  return networklessCommand({
    id,
    executable: invocation.executable,
    args: invocation.args,
    cwd,
    environment,
    timeoutMs,
    budgets,
    runRoot,
    profile: runtimeReadOnlySandboxProfile(runtimeRoots),
  });
}

async function seedPackageNpmCache({
  candidateRoot,
  packageRelative,
  source,
}) {
  const packageRoot = path.join(candidateRoot, ...packageRelative.split('/'));
  const destination = packageRelative === 'contracts/goldens/query'
    ? path.join(packageRoot, '.cache', 'npm')
    : packageRelative === 'contracts/schemas/archive/tooling'
      ? path.join(path.dirname(packageRoot), '.cache', 'npm')
      : path.join(packageRoot, '.cache', 'npm');
  seedNpmCache({
    source,
    destination,
    lockPaths: [path.join(packageRoot, 'package-lock.json')],
  });
  return Object.freeze({ cache: destination, root: packageRoot });
}

function goBootstrapEnvironment({
  candidateRoot,
  runRoot,
  sourceCache,
  targetCache,
  tools,
  npmCache,
}) {
  const goRoot = path.dirname(path.dirname(tools.go.path));
  return commandEnvironment({
    runRoot,
    pathEntries: [
      path.dirname(tools.node.path),
      path.dirname(tools.go.path),
      path.dirname(tools.git.path),
    ],
    extra: {
      BGMSS_GO_BACKEND_ROOT: path.join(candidateRoot, 'backend'),
      BGMSS_GO_EXECUTABLE: tools.go.path,
      BGMSS_GO_ROOT: goRoot,
      BGMSS_GO_SOURCE_CACHE: sourceCache,
      BGMSS_GO_TARGET_CACHE: targetCache,
      GO_BOOTSTRAP: path.join(
        path.resolve(import.meta.dirname, '..'),
        'bin',
        'go-bootstrap.mjs',
      ),
      GOPROXY: 'off',
      GOSUMDB: 'off',
      GOROOT: goRoot,
      NPM_CONFIG_CACHE: npmCache,
      REDOCLY_TELEMETRY: 'off',
    },
  });
}

function allCommandEvidence(results) {
  return Object.freeze(results.flatMap((result) => commandEvidence(result)));
}

async function commandDeclarationEvidence({
  runRoot,
  id,
  results,
  summary,
}) {
  return writeEvidence({
    runRoot,
    relative: `evidence/gates/${id}.json`,
    kind: 'command',
    value: {
      commands: results.map((result) => ({
        args: result.args,
        durationMs: result.durationMs,
        executable: result.executable,
        id: result.id,
        status: result.status,
      })),
    },
    summary,
  });
}

export function queryTypeScriptCommandPlan({
  goldenRoot,
  queryNodePath,
}) {
  const typescript = path.join(
    goldenRoot,
    'node_modules',
    'openapi-typescript',
    'bin',
    'cli.js',
  );
  return Object.freeze(['a', 'b'].map((name) => Object.freeze({
    args: Object.freeze([
      typescript,
      path.join(
        goldenRoot,
        '.tmp',
        `codegen-${name}`,
        'source',
        'openapi',
        'openapi.yaml',
      ),
      '--output',
      path.join(goldenRoot, '.tmp', `query-${name}.d.ts`),
    ]),
    cwd: goldenRoot,
    environment: 'typescript',
    executable: queryNodePath,
    id: `contracts-query-typescript-${name}`,
    timeoutMs: QUERY_GOLDEN_TIMEOUT_MS,
  })));
}

export function queryGoldenEnvironmentOverrides(goldenRoot) {
  return Object.freeze({
    redocly: Object.freeze({
      HOME: path.join(goldenRoot, '.tmp', 'redocly-home'),
      TMPDIR: path.join(goldenRoot, '.tmp', 'redocly-tmp'),
    }),
    typescript: Object.freeze({
      HOME: path.join(goldenRoot, '.tmp', 'redocly-home'),
      TMPDIR: path.join(goldenRoot, '.tmp', 'system'),
    }),
  });
}

async function runQueryGolden({
  candidateRoot,
  cacheRoots,
  tools,
  budgets,
  runRoot,
  runtimeRoots,
  toolAttestation,
}) {
  const relative = 'contracts/goldens/query';
  const seededNpm = await seedPackageNpmCache({
    candidateRoot,
    packageRelative: relative,
    source: cacheRoots.npm,
  });
  const goCache = path.join(seededNpm.root, '.cache', 'go-mod');
  await seedGoModuleCache({
    source: cacheRoots.goModule,
    destination: goCache,
    goSumPath: path.join(candidateRoot, 'backend', 'go.sum'),
  });
  for (const relativeDirectory of [
    '.cache/go-build',
    '.cache/go-path',
  ]) {
    fs.mkdirSync(path.join(seededNpm.root, relativeDirectory), {
      recursive: true,
      mode: 0o700,
    });
  }
  const results = [];
  results.push(await runNpm({
    id: 'contracts-query-npm-ci',
    family: 'query',
    args: ['ci', '--ignore-scripts', '--offline', '--no-audit', '--no-fund'],
    cwd: seededNpm.root,
    cache: seededNpm.cache,
    tools,
    budgets,
    runRoot,
    timeoutMs: 300_000,
    runtimeRoots: runtimePaths(runtimeRoots, QUERY_RUNTIME_NAMES),
  }));
  const queryEnvironment = commandEnvironment({
    runRoot,
    pathEntries: [
      path.dirname(tools.queryNode.path),
      path.dirname(tools.queryGo.path),
    ],
    extra: {
      NPM_CONFIG_CACHE: seededNpm.cache,
      REDOCLY_TELEMETRY: 'off',
    },
  });
  const environmentOverrides =
    queryGoldenEnvironmentOverrides(seededNpm.root);
  const redoclyEnvironment = commandEnvironment({
    runRoot,
    pathEntries: [
      path.dirname(tools.queryNode.path),
      path.dirname(tools.queryGo.path),
    ],
    extra: {
      NPM_CONFIG_CACHE: seededNpm.cache,
      REDOCLY_TELEMETRY: 'off',
      ...environmentOverrides.redocly,
    },
  });
  const typescriptEnvironment = commandEnvironment({
    runRoot,
    pathEntries: [
      path.dirname(tools.queryNode.path),
      path.dirname(tools.queryGo.path),
    ],
    extra: {
      NPM_CONFIG_CACHE: seededNpm.cache,
      REDOCLY_TELEMETRY: 'off',
      ...environmentOverrides.typescript,
    },
  });
  const querySandbox = runtimeReadOnlySandboxProfile(
    runtimePaths(runtimeRoots, QUERY_RUNTIME_NAMES),
  );
  const verify = async (id, args) => {
    results.push(await networklessCommand({
      id,
      executable: tools.queryNode.path,
      args: [path.join(seededNpm.root, 'verify.mjs'), ...args],
      cwd: seededNpm.root,
      environment: queryEnvironment,
      timeoutMs: QUERY_GOLDEN_TIMEOUT_MS,
      budgets,
      runRoot,
      profile: querySandbox,
    }));
  };
  await verify('contracts-query-verify', []);
  await verify('contracts-query-cleanup-safety', ['--verify-cleanup-safety']);
  await verify(
    'contracts-query-prepare-codegen',
    ['--prepare-codegen-projections'],
  );
  for (const relativeDirectory of [
    '.tmp/go-home',
    '.tmp/system',
  ]) {
    fs.mkdirSync(path.join(seededNpm.root, relativeDirectory), {
      recursive: true,
      mode: 0o700,
    });
  }
  const redocly = path.join(
    seededNpm.root,
    'node_modules',
    '@redocly',
    'cli',
    'bin',
    'cli.js',
  );
  for (const name of ['codegen-a', 'codegen-b']) {
    const projection = path.join(seededNpm.root, '.tmp', name);
    results.push(await networklessCommand({
      id: `contracts-query-redocly-${name}`,
      executable: tools.queryNode.path,
      args: [
        redocly,
        'bundle',
        path.join(projection, 'source', 'openapi', 'openapi.yaml'),
        '--dereferenced',
        '--ext',
        'json',
        '--component-names-strategy',
        'basename',
        '--component-renaming-conflicts-severity',
        'error',
        '--remove-unused-components=false',
        '--keep-url-references=false',
        '--output',
        path.join(projection, 'query.bundle.json'),
        '--config',
        path.join(projection, 'redocly.yaml'),
      ],
      cwd: seededNpm.root,
      environment: redoclyEnvironment,
      timeoutMs: QUERY_GOLDEN_TIMEOUT_MS,
      budgets,
      runRoot,
      profile: querySandbox,
    }));
  }
  for (const declaration of queryTypeScriptCommandPlan({
    goldenRoot: seededNpm.root,
    queryNodePath: tools.queryNode.path,
  })) {
    results.push(await networklessCommand({
      ...declaration,
      environment: declaration.environment === 'typescript'
        ? typescriptEnvironment
        : undefined,
      budgets,
      runRoot,
      profile: querySandbox,
    }));
  }
  await verify(
    'contracts-query-verify-codegen',
    ['--verify-codegen-projections'],
  );
  await verify('contracts-query-cleanup', ['--cleanup-generated']);
  const observedCommandIds = results.map(({ id }) => id);
  if (
    observedCommandIds.length !== QUERY_GOLDEN_COMMAND_IDS.length ||
    observedCommandIds.some(
      (id, index) => id !== QUERY_GOLDEN_COMMAND_IDS[index],
    )
  ) {
    fail('Query golden command order is not the closed owner sequence');
  }
  await verifyRuntimeClosures(toolAttestation, QUERY_RUNTIME_NAMES);
  return results;
}

async function runArchiveContract({
  candidateRoot,
  cacheRoots,
  tools,
  budgets,
  runRoot,
  runtimeRoots,
  toolAttestation,
}) {
  const relative = 'contracts/schemas/archive/tooling';
  const seededNpm = await seedPackageNpmCache({
    candidateRoot,
    packageRelative: relative,
    source: cacheRoots.npm,
  });
  const schemaRoot = path.dirname(seededNpm.root);
  const goCache = path.join(schemaRoot, '.cache', 'go-mod');
  await seedGoModuleCache({
    source: cacheRoots.goModule,
    destination: goCache,
    goSumPath: path.join(candidateRoot, 'backend', 'go.sum'),
  });
  validateSeededGoToolchain(goCache);
  for (const relativeDirectory of [
    '.cache/go-build',
    '.cache/go-path',
    '.tmp/system',
  ]) {
    fs.mkdirSync(path.join(schemaRoot, relativeDirectory), {
      recursive: true,
      mode: 0o700,
    });
  }
  const results = [];
  results.push(await runNpm({
    id: 'contracts-archive-npm-ci',
    family: 'current',
    args: ['ci', '--ignore-scripts', '--offline', '--no-audit', '--no-fund'],
    cwd: seededNpm.root,
    cache: seededNpm.cache,
    tools,
    budgets,
    runRoot,
    timeoutMs: 300_000,
    runtimeRoots: runtimePaths(runtimeRoots, [
      ...CURRENT_NODE_RUNTIME_NAMES,
      ...CURRENT_GO_RUNTIME_NAMES,
    ]),
  }));
  const environment = Object.freeze({
    ...commandEnvironment({
    runRoot,
    pathEntries: [
      path.dirname(tools.go.path),
      path.dirname(tools.node.path),
    ],
    extra: {
      CGO_ENABLED: '0',
      GOCACHE: path.join(schemaRoot, '.cache', 'go-build'),
      GOENV: 'off',
      GOMODCACHE: goCache,
      GOROOT: path.dirname(path.dirname(tools.go.path)),
      GOPATH: path.join(schemaRoot, '.cache', 'go-path'),
      GOPROXY: 'off',
      GOSUMDB: 'off',
      GOTOOLCHAIN: 'local',
      NPM_CONFIG_CACHE: seededNpm.cache,
      REDOCLY_TELEMETRY: 'off',
    },
    }),
    TMPDIR: path.join(schemaRoot, '.tmp', 'system'),
    npm_config_cache: seededNpm.cache,
    npm_config_engine_strict: 'true',
  });
  results.push(await networklessCommand({
    id: 'contracts-archive-verify',
    executable: tools.node.path,
    args: [path.join(seededNpm.root, 'verify.mjs')],
    cwd: seededNpm.root,
    environment,
    timeoutMs: 900_000,
    budgets,
    runRoot,
    profile: runtimeReadOnlySandboxProfile(runtimePaths(runtimeRoots, [
      ...CURRENT_NODE_RUNTIME_NAMES,
      ...CURRENT_GO_RUNTIME_NAMES,
    ])),
  }));
  await verifyRuntimeClosures(toolAttestation, [
    ...CURRENT_NODE_RUNTIME_NAMES,
    ...CURRENT_GO_RUNTIME_NAMES,
  ]);
  return results;
}

export async function runContractsOwnerGate({
  candidateRoot,
  cacheRoots,
  tools,
  budgets,
  runRoot,
  runtimeRoots,
  toolAttestation,
}) {
  const root = requireCanonicalPath(candidateRoot, {
    label: 'Contracts owner candidate',
    type: 'directory',
  });
  const results = [];
  let gateResult;
  let primaryError;
  try {
    results.push(...await runQueryGolden({
      candidateRoot: root,
      cacheRoots,
      tools,
      budgets,
      runRoot,
      runtimeRoots,
      toolAttestation,
    }));
    results.push(...await runArchiveContract({
      candidateRoot: root,
      cacheRoots,
      tools,
      budgets,
      runRoot,
      runtimeRoots,
      toolAttestation,
    }));
    for (const relative of CURRENT_NPM_PACKAGES.filter(
      (entry) => entry !== 'contracts/schemas/archive/tooling',
    )) {
      const seeded = await seedPackageNpmCache({
        candidateRoot: root,
        packageRelative: relative,
        source: cacheRoots.npm,
      });
      results.push(await runNpm({
        id: `contracts-${relative.replaceAll('/', '-')}-npm-ci`,
        family: 'current',
        args: ['ci', '--ignore-scripts', '--offline', '--no-audit', '--no-fund'],
        cwd: seeded.root,
        cache: seeded.cache,
        tools,
        budgets,
        runRoot,
        timeoutMs: 300_000,
        runtimeRoots: runtimePaths(
          runtimeRoots,
          CURRENT_NODE_RUNTIME_NAMES,
        ),
      }));
      const isCatalogApi = relative === 'contracts/goldens/api/catalog';
      if (isCatalogApi) {
        await seedGoModuleCache({
          source: cacheRoots.goModule,
          destination: path.join(seeded.root, '.cache', 'go-mod'),
          goSumPath: path.join(root, 'backend', 'go.sum'),
        });
        for (const relativeDirectory of [
          '.cache/go-build',
          '.cache/go-path',
          '.cache/home',
          '.cache/xdg',
        ]) {
          fs.mkdirSync(path.join(seeded.root, relativeDirectory), {
            recursive: true,
            mode: 0o700,
          });
        }
      }
      results.push(await runNpm({
        id: `contracts-${relative.replaceAll('/', '-')}-verify`,
        family: 'current',
        args: ['run', 'verify'],
        cwd: seeded.root,
        cache: seeded.cache,
        tools,
        budgets,
        runRoot,
        timeoutMs: 300_000,
        additionalPathEntries: isCatalogApi ? [path.dirname(tools.go.path)] : [],
        extra: isCatalogApi
          ? {
              GOENV: 'off',
              GOPROXY: 'off',
              GOSUMDB: 'off',
              GOTOOLCHAIN: 'local',
              GOROOT: path.dirname(path.dirname(tools.go.path)),
              REDOCLY_TELEMETRY: 'off',
            }
          : {},
        runtimeRoots: runtimePaths(runtimeRoots, [
          ...CURRENT_NODE_RUNTIME_NAMES,
          ...(isCatalogApi ? CURRENT_GO_RUNTIME_NAMES : []),
        ]),
      }));
    }
    const environment = commandEnvironment({
      runRoot,
      pathEntries: [path.dirname(tools.node.path)],
    });
    for (const relative of DIRECT_NODE_VERIFIERS) {
      results.push(await networklessCommand({
        id: `contracts-${relative.replaceAll('/', '-').replace('.mjs', '')}`,
        executable: tools.node.path,
        args: [path.join(root, ...relative.split('/'))],
        cwd: root,
        environment,
        timeoutMs: 300_000,
        budgets,
        runRoot,
        profile: runtimeReadOnlySandboxProfile(
          runtimePaths(runtimeRoots, CURRENT_NODE_RUNTIME_NAMES),
        ),
      }));
    }
    await verifyRuntimeClosures(toolAttestation, [
      ...CURRENT_NODE_RUNTIME_NAMES,
      ...CURRENT_GO_RUNTIME_NAMES,
    ]);
    const declaration = await commandDeclarationEvidence({
      runRoot,
      id: 'owner-contracts',
      results,
      summary: `${results.length} fixed Contracts verifier/install commands passed`,
    });
    gateResult = Object.freeze({
      results: Object.freeze(results),
      evidence: Object.freeze([declaration, ...allCommandEvidence(results)]),
    });
  } catch (error) {
    primaryError = error;
  }
  return settleContractsOwnerGate({
    candidateRoot: root,
    runRoot,
    gateResult,
    primaryError,
  });
}

function writeNpmWrapper({ runRoot, tools, npmCache }) {
  const directory = path.join(runRoot, 'control', 'bin');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const wrapper = path.join(directory, 'npm');
  const source = [
    '#!/bin/sh',
    `export npm_config_cache=${JSON.stringify(npmCache)}`,
    'export npm_config_offline=true',
    'export npm_config_audit=false',
    'export npm_config_fund=false',
    'export npm_config_ignore_scripts=true',
    'export npm_config_update_notifier=false',
    `exec ${JSON.stringify(tools.node.path)} ${JSON.stringify(tools.npm.path)} "$@"`,
    '',
  ].join('\n');
  fs.writeFileSync(wrapper, source, { flag: 'wx', mode: 0o700 });
  return wrapper;
}

export async function runBackendOwnerGate({
  candidateRoot,
  cacheRoots,
  tools,
  budgets,
  runRoot,
  runtimeRoots,
  toolAttestation,
}) {
  const backendRoot = path.join(candidateRoot, 'backend');
  const npmCache = path.join(runRoot, 'cache', 'backend-npm');
  seedNpmCache({
    source: cacheRoots.npm,
    destination: npmCache,
    lockPaths: [
      path.join(candidateRoot, 'contracts', 'goldens', 'query', 'package-lock.json'),
      ...CURRENT_NPM_PACKAGES.map((relative) =>
        path.join(candidateRoot, ...relative.split('/'), 'package-lock.json')),
    ],
  });
  const npmWrapper = writeNpmWrapper({ runRoot, tools, npmCache });
  const targetGoCache = path.join(backendRoot, '.cache', 'go-mod');
  const environment = goBootstrapEnvironment({
    candidateRoot,
    runRoot,
    sourceCache: cacheRoots.goModule,
    targetCache: targetGoCache,
    tools,
    npmCache,
  });
  const result = await networklessCommand({
    id: 'owner-backend-check',
    executable: path.join(backendRoot, 'scripts', 'check.sh'),
    args: [],
    cwd: backendRoot,
    environment: Object.freeze({
      ...environment,
      PATH: [
        path.dirname(npmWrapper),
        path.dirname(tools.node.path),
        path.dirname(tools.git.path),
        '/usr/bin',
        '/bin',
        '/usr/sbin',
        '/sbin',
      ].join(path.delimiter),
    }),
    timeoutMs: 3_600_000,
    budgets,
    runRoot,
    profile: runtimeReadOnlySandboxProfile(runtimePaths(runtimeRoots, [
      ...CURRENT_NODE_RUNTIME_NAMES,
      ...CURRENT_GO_RUNTIME_NAMES,
    ])),
  });
  const measurementRoot = ensureEmptyDirectory(
    path.join(runRoot, 'control', 'backend-query-measurement'),
  );
  const queryTestBinary = path.join(measurementRoot, 'query.test');
  const queryMeasurement = await networklessCommand({
    id: 'owner-backend-query-binary-measurement',
    executable: tools.go.path,
    args: ['test', '-c', '-o', queryTestBinary, './internal/query'],
    cwd: backendRoot,
    environment: commandEnvironment({
      runRoot,
      pathEntries: [path.dirname(tools.go.path)],
      extra: {
        CGO_ENABLED: '0',
        GOCACHE: path.join(measurementRoot, 'go-build'),
        GOENV: 'off',
        GOMODCACHE: targetGoCache,
        GOPATH: path.join(measurementRoot, 'go-path'),
        GOPROXY: 'off',
        GOSUMDB: 'off',
        GOTOOLCHAIN: 'local',
        GOROOT: path.dirname(path.dirname(tools.go.path)),
        GOWORK: 'off',
      },
    }),
    timeoutMs: 600_000,
    budgets,
    runRoot,
    profile: runtimeReadOnlySandboxProfile(runtimePaths(runtimeRoots, [
      ...CURRENT_NODE_RUNTIME_NAMES,
      ...CURRENT_GO_RUNTIME_NAMES,
    ])),
  });
  const queryTestBinaryBytes = fs.statSync(queryTestBinary).size;
  if (
    !Number.isSafeInteger(queryTestBinaryBytes) ||
    queryTestBinaryBytes < 1 ||
    queryTestBinaryBytes > 16 * 1024 * 1024
  ) {
    fail(`measured Backend query test binary exceeds the accepted bound`);
  }
  await verifyRuntimeClosures(toolAttestation, [
    ...CURRENT_NODE_RUNTIME_NAMES,
    ...CURRENT_GO_RUNTIME_NAMES,
  ]);
  const declaration = await commandDeclarationEvidence({
    runRoot,
    id: 'owner-backend',
    results: [result, queryMeasurement],
    summary: 'backend/scripts/check.sh passed with the fixed offline bootstrap',
  });
  const queryBinary = await writeEvidence({
    runRoot,
    relative: 'evidence/gates/backend-query-binary.json',
    kind: 'queryBinaryBytes',
    value: {
      bytes: queryTestBinaryBytes,
      maximumBytes: 16 * 1024 * 1024,
      enforcedBy: 'backend/scripts/check.sh and independent fixed build',
    },
    summary: 'Backend query test binary was independently measured within 16 MiB',
  });
  return Object.freeze({
    results: Object.freeze([result, queryMeasurement]),
    evidence: Object.freeze([
      declaration,
      queryBinary,
      ...allCommandEvidence([result, queryMeasurement]),
    ]),
    queryTestBinaryBytes,
  });
}

export async function runUpdaterOwnerGate({
  candidateRoot,
  cacheRoots,
  tools,
  budgets,
  runRoot,
  runtimeRoots,
  toolAttestation,
}) {
  const updaterRoot = path.join(candidateRoot, 'updater');
  const cache = path.join(runRoot, 'cache', 'updater-uv');
  fs.mkdirSync(path.dirname(cache), { recursive: true, mode: 0o700 });
  // This is an owned working cache. The caller cache remains immutable and is
  // independently re-attested; uv may create bounded local metadata here.
  copyCacheTree(cacheRoots.uv, cache);
  thawOwnedWorkingCache(cache);
  const environment = commandEnvironment({
    runRoot,
    pathEntries: [path.dirname(tools.uv.path), path.dirname(tools.python.path)],
    extra: {
      PYTHONDONTWRITEBYTECODE: '1',
      PYTHONNOUSERSITE: '1',
      UV_CACHE_DIR: cache,
      UV_LINK_MODE: 'copy',
      UV_NO_PROGRESS: '1',
      UV_OFFLINE: '1',
      UV_PYTHON_DOWNLOADS: 'never',
    },
  });
  const commands = [
    ['sync', ['sync', '--frozen', '--offline', '--python', tools.python.path]],
    ['pytest', ['run', '--frozen', 'pytest']],
    ['mypy', ['run', '--frozen', 'mypy', 'src', 'tests']],
    ['ruff-check', ['run', '--frozen', 'ruff', 'check', '.']],
    ['ruff-format', ['run', '--frozen', 'ruff', 'format', '--check', '.']],
    [
      'export',
      [
        'export',
        '--frozen',
        '--offline',
        '--only-dev',
        '--no-emit-project',
        '--no-annotate',
        '--no-header',
        '--output-file',
        '.tmp/build-constraints.txt',
      ],
    ],
    ['lock', ['lock', '--check', '--offline']],
    [
      'build',
      [
        'build',
        '--offline',
        '--wheel',
        '--python',
        tools.python.path,
        '--out-dir',
        '.tmp/dist',
        '--build-constraints',
        '.tmp/build-constraints.txt',
        '--require-hashes',
        '--no-create-gitignore',
      ],
    ],
  ];
  const results = [];
  for (const [name, args] of commands) {
    results.push(await networklessCommand({
      id: `owner-updater-${name}`,
      executable: tools.uv.path,
      args,
      cwd: updaterRoot,
      environment,
      timeoutMs: 900_000,
      budgets,
      runRoot,
      profile: runtimeReadOnlySandboxProfile(
        runtimePaths(runtimeRoots, PYTHON_RUNTIME_NAMES),
      ),
    }));
  }
  await verifyRuntimeClosures(toolAttestation, PYTHON_RUNTIME_NAMES);
  const declaration = await commandDeclarationEvidence({
    runRoot,
    id: 'owner-updater',
    results,
    summary: 'Updater pytest, mypy, Ruff, lock and wheel gates passed offline',
  });
  return Object.freeze({
    results: Object.freeze(results),
    evidence: Object.freeze([declaration, ...allCommandEvidence(results)]),
    python: path.join(updaterRoot, '.venv', 'bin', 'python'),
  });
}

export async function runFrontendOwnerGate({
  candidateRoot,
  cacheRoots,
  tools,
  budgets,
  runRoot,
  runtimeRoots,
  toolAttestation,
}) {
  const frontendRoot = path.join(candidateRoot, 'frontend');
  const cache = path.join(runRoot, 'cache', 'frontend-npm');
  seedNpmCache({
    source: cacheRoots.npm,
    destination: cache,
    lockPaths: [path.join(frontendRoot, 'package-lock.json')],
  });
  const results = [];
  results.push(await runNpm({
    id: 'owner-frontend-npm-ci',
    family: 'current',
    args: ['ci', '--ignore-scripts', '--offline', '--no-audit', '--no-fund'],
    cwd: frontendRoot,
    cache,
    tools,
    budgets,
    runRoot,
    timeoutMs: 600_000,
    runtimeRoots: runtimePaths(runtimeRoots, CURRENT_NODE_RUNTIME_NAMES),
  }));
  results.push(await runNpm({
    id: 'owner-frontend-check',
    family: 'current',
    args: ['run', 'check'],
    cwd: frontendRoot,
    cache,
    tools,
    budgets,
    runRoot,
    timeoutMs: 1_800_000,
    runtimeRoots: runtimePaths(runtimeRoots, CURRENT_NODE_RUNTIME_NAMES),
  }));
  await verifyRuntimeClosures(toolAttestation, CURRENT_NODE_RUNTIME_NAMES);
  const declaration = await commandDeclarationEvidence({
    runRoot,
    id: 'owner-frontend',
    results,
    summary: 'Frontend architecture, wire, unit, type, build and artifact gates passed',
  });
  const bundleBudget = await writeEvidence({
    runRoot,
    relative: 'evidence/gates/frontend-initial-javascript.json',
    kind: 'initialJavaScriptGzipBytes',
    value: {
      maximumExclusiveBytes: 300 * 1024,
      enforcedBy: 'frontend/scripts/check-production-artifact.mjs',
    },
    summary: 'Frontend gate enforced the <300 KiB initial JavaScript gzip bound',
  });
  return Object.freeze({
    results: Object.freeze(results),
    evidence: Object.freeze([
      declaration,
      bundleBudget,
      ...allCommandEvidence(results),
    ]),
  });
}

function artifactGateEnvironment({
  runRoot,
  tools,
}) {
  return commandEnvironment({
    runRoot,
    pathEntries: [
      path.dirname(tools.node.path),
      path.dirname(tools.docker.path),
      path.dirname(tools.python.path),
    ],
    extra: {
      DOCKER_CLI_HINTS: 'false',
      DOCKER_HOST: tools.docker.endpoint,
      PYTHONDONTWRITEBYTECODE: '1',
      PYTHONNOUSERSITE: '1',
    },
  });
}

export async function runArtifactComponentGates({
  candidateRoot,
  artifacts,
  tools,
  budgets,
  runRoot,
  runtimeRoots,
  toolAttestation,
}) {
  const environment = artifactGateEnvironment({ runRoot, tools });
  const artifactCli = path.join(candidateRoot, 'contracts', 'artifacts', 'bin', 'artifacts.mjs');
  const results = [];
  for (const component of ['backend', 'updater', 'frontend']) {
    results.push(await networklessCommand({
      id: `artifact-verify-${component}`,
      executable: tools.node.path,
      args: [artifactCli, 'verify-component', artifacts.roots[component], component],
      cwd: candidateRoot,
      environment,
      timeoutMs: 300_000,
      budgets,
      runRoot,
      profile: runtimeReadOnlySandboxProfile(
        runtimePaths(runtimeRoots, CURRENT_NODE_RUNTIME_NAMES),
      ),
    }));
  }
  results.push(await networklessCommand({
    id: 'artifact-verify-manifest',
    executable: tools.node.path,
    args: [
      artifactCli,
      'verify-manifest',
      artifacts.compatibility.path,
    ],
    cwd: candidateRoot,
    environment,
    timeoutMs: 300_000,
    budgets,
    runRoot,
    profile: runtimeReadOnlySandboxProfile(
      runtimePaths(runtimeRoots, CURRENT_NODE_RUNTIME_NAMES),
    ),
  }));
  await verifyRuntimeClosures(toolAttestation, CURRENT_NODE_RUNTIME_NAMES);
  const verification = await commandDeclarationEvidence({
    runRoot,
    id: 'artifacts-components',
    results,
    summary: 'All component statements and the compatibility manifest passed',
  });
  return Object.freeze({
    evidence: Object.freeze([
      verification,
      ...allCommandEvidence(results),
    ]),
    results: Object.freeze(results),
  });
}

export async function runArtifactCompatibilityGate({
  candidateRoot,
  artifacts,
  tools,
  budgets,
  runRoot,
  updaterPython,
  runtimeRoots,
  toolAttestation,
}) {
  const environment = artifactGateEnvironment({ runRoot, tools });
  const coordinator = await networklessCommand({
    id: 'artifact-coordinator-smoke',
    executable: tools.node.path,
    args: [
      path.join(candidateRoot, 'contracts', 'artifacts', 'bin', 'coordinator.mjs'),
      'smoke',
      '--backend',
      artifacts.roots.backend,
      '--frontend',
      artifacts.roots.frontend,
      '--updater',
      artifacts.roots.updater,
      '--docker',
      tools.docker.path,
      '--python',
      updaterPython,
    ],
    cwd: candidateRoot,
    environment,
    timeoutMs: 900_000,
    budgets,
    runRoot,
    profile: runtimeReadOnlySandboxProfile(
      runtimePaths(runtimeRoots, [
        ...CURRENT_NODE_RUNTIME_NAMES,
        ...PYTHON_RUNTIME_NAMES,
        ...DOCKER_RUNTIME_NAMES,
      ]),
      dockerLocalSandboxProfile(tools.docker.endpoint),
    ),
  });
  await verifyRuntimeClosures(toolAttestation, [
    ...CURRENT_NODE_RUNTIME_NAMES,
    ...PYTHON_RUNTIME_NAMES,
    ...DOCKER_RUNTIME_NAMES,
  ]);
  const coordinatorDeclaration = await commandDeclarationEvidence({
    runRoot,
    id: 'artifacts-coordinator',
    results: [coordinator],
    summary: 'Cross-component artifact-only coordinator smoke passed',
  });
  return Object.freeze({
    evidence: Object.freeze([
      coordinatorDeclaration,
      ...commandEvidence(coordinator),
    ]),
    results: Object.freeze([coordinator]),
  });
}

export async function runArtifactCommandGates(arguments_) {
  const components = await runArtifactComponentGates(arguments_);
  const compatibility = await runArtifactCompatibilityGate(arguments_);
  return Object.freeze({
    componentEvidence: components.evidence,
    coordinatorEvidence: compatibility.evidence,
    results: Object.freeze([
      ...components.results,
      ...compatibility.results,
    ]),
  });
}

export async function runArchiveConsumerGate({
  candidateRoot,
  materialized,
  cacheRoots,
  tools,
  budgets,
  runRoot,
  runtimeRoots,
  toolAttestation,
}) {
  const controlRoot = ensureEmptyDirectory(path.join(runRoot, 'control', 'archive-consumer'));
  const goCache = path.join(controlRoot, 'go-mod');
  const environment = goBootstrapEnvironment({
    candidateRoot,
    runRoot,
    sourceCache: cacheRoots.goModule,
    targetCache: goCache,
    tools,
    npmCache: path.join(runRoot, 'cache', 'backend-npm'),
  });
  const bootstrap = path.join(
    path.resolve(import.meta.dirname, '..'),
    'bin',
    'go-bootstrap.mjs',
  );
  const binary = path.join(controlRoot, 'archive-smoke');
  const build = await networklessCommand({
    id: 'archive-consumer-build',
    executable: tools.node.path,
    args: [
      bootstrap,
      'build',
      '-trimpath',
      '-o',
      binary,
      './cmd/archive-smoke',
    ],
    cwd: path.join(candidateRoot, 'backend'),
    environment,
    timeoutMs: 600_000,
    budgets,
    runRoot,
    profile: runtimeReadOnlySandboxProfile(runtimePaths(runtimeRoots, [
      ...CURRENT_NODE_RUNTIME_NAMES,
      ...CURRENT_GO_RUNTIME_NAMES,
    ])),
  });
  const smoke = await networklessCommand({
    id: 'archive-consumer-smoke',
    executable: binary,
    args: [
      '-archive-root',
      materialized.archiveRoot,
      '-data-version',
      materialized.identity.dataVersion,
    ],
    cwd: controlRoot,
    environment,
    timeoutMs: 600_000,
    budgets,
    runRoot,
    profile: runtimeReadOnlySandboxProfile(runtimePaths(runtimeRoots, [
      ...CURRENT_NODE_RUNTIME_NAMES,
      ...CURRENT_GO_RUNTIME_NAMES,
    ])),
  });
  await verifyRuntimeClosures(toolAttestation, [
    ...CURRENT_NODE_RUNTIME_NAMES,
    ...CURRENT_GO_RUNTIME_NAMES,
  ]);
  const output = fs.readFileSync(path.join(runRoot, smoke.stdout.path), 'utf8');
  let document;
  try {
    document = JSON.parse(output);
  } catch {
    fail('real Go Archive consumer emitted invalid JSON');
  }
  if (
    document?.ok !== true ||
    document.dataVersion !== materialized.identity.dataVersion ||
    document.manifestDigest !== materialized.identity.manifestDigest ||
    document.sqliteDigest !== materialized.identity.sqliteDigest
  ) {
    fail('real Go Archive consumer rejected or misidentified the full Archive');
  }
  const archiveConsumer = await writeEvidence({
    runRoot,
    relative: 'evidence/archive/real-go-consumer.json',
    kind: 'archiveConsumer',
    value: document,
    summary: 'Real Go archive-smoke accepted the copied full Archive identity',
  });
  const command = await commandDeclarationEvidence({
    runRoot,
    id: 'archive-consumer',
    results: [build, smoke],
    summary: 'Real Go archive-smoke built offline and accepted the full Archive',
  });
  return Object.freeze({
    document: Object.freeze(document),
    evidence: Object.freeze([
      archiveConsumer,
      command,
      ...allCommandEvidence([build, smoke]),
    ]),
    results: Object.freeze([build, smoke]),
  });
}
