import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import {
  copyCacheTree,
  seedGoModuleCache,
  seedNpmCache,
  validateSeededGoToolchain,
} from './cache.mjs';
import { commandEvidence, writeEvidence } from './evidence.mjs';
import {
  deriveCleanCheckoutIdentityClosed,
  readRawRegularGitBlob,
} from './git-attestation.mjs';
import {
  assertNoSymlinkAncestors,
  assertSafeRelativePath,
  isStrictlyBelow,
  requireCanonicalPath,
  resolveRunRelative,
  sha256Bytes,
  sha256FileSync,
} from './paths.mjs';
import { runCommand, sanitizedEnvironment } from './runner.mjs';
import {
  decodeUtf8Strict,
  parseJsonStrict,
  readJsonStrict,
} from './strict-json.mjs';
import {
  assertSameSeal,
  sealDistributionTree,
} from './seal.mjs';
import { verifyRuntimeClosures } from './tools.mjs';

const SANDBOX_EXECUTABLE = '/usr/bin/sandbox-exec';
const NETWORKLESS_PROFILE = '(version 1)(allow default)(deny network*)';
const QUERY_GOLDEN_TIMEOUT_MS = 300_000;
const QUERY_CODEGEN_DIRECT_ID = 'contracts-query-verify-codegen';
const QUERY_CODEGEN_RUNTIME_PREFIX =
  'candidate-success Go stderr evidence: ';
const QUERY_CODEGEN_RUNTIME_MAX_BYTES = 1024 * 1024;
const QUERY_GO_OPERATION_IDS = Object.freeze([
  'primaryGeneration',
  'deterministicReplay',
  'gofmt',
  'compileSmoke',
]);
const QUERY_GO_EXECUTABLE =
  '/opt/homebrew/Cellar/go/1.25.4/libexec/bin/go';
const QUERY_GOFMT_EXECUTABLE =
  '/opt/homebrew/Cellar/go/1.25.4/libexec/bin/gofmt';
const QUERY_GO_SANDBOX_PROFILE =
  '(version 1)(allow default)(deny network*)' +
  '(deny file-write* (subpath "/Users/luca/Library/Application Support/go/telemetry"))';
const QUERY_GO_SANDBOX_PROFILE_SHA256 =
  '45d9c3c9c990bfe2b2edac6bae53423b97a9de0a3199e92a505f9781dc5aab6d';
const QUERY_GO_FIXED_PATH =
  '/Users/luca/.nvm/versions/node/v24.16.0/bin:' +
  '/usr/bin:/bin:/usr/sbin:/sbin';
const QUERY_GO_ENVIRONMENT_KEYS = Object.freeze([
  'PATH',
  'HOME',
  'TMPDIR',
  'GOCACHE',
  'GOMODCACHE',
  'GOPATH',
  'GOENV',
  'GOWORK',
  'GOTOOLCHAIN',
]);
const QUERY_TRACKED_AUTHORITY_PATHS = Object.freeze([
  'contracts/goldens/query/manifest.json',
  'contracts/goldens/query/verify.mjs',
  'contracts/goldens/query/fixtures/go-module/go.mod.lock',
  'contracts/goldens/query/fixtures/go-module/go.sum.lock',
]);
const ARCHIVE_VERIFY_DIRECT_ID = 'contracts-archive-verify';
const ARCHIVE_VERIFY_TIMEOUT_MS = 900_000;
const ARCHIVE_VERIFY_REPORT_MAX_BYTES = 4 * 1024 * 1024;
const ARCHIVE_QUICKTYPE_VERSION =
  'quicktype version 26.0.0\nVisit quicktype.io for more info.';
const ARCHIVE_SCHEMA_NAMES = Object.freeze([
  'manifest',
  'pointer',
  'dataVersionInput',
  'fixtureIndex',
  'producerCase',
  'producerIndex',
]);
const ARCHIVE_SCHEMA_AUTHORITY_PATHS = Object.freeze([
  'contracts/schemas/archive/README.md',
  'contracts/schemas/archive/archive-manifest.schema.json',
  'contracts/schemas/archive/compatibility-matrix.json',
  'contracts/schemas/archive/current-pointer.schema.json',
  'contracts/schemas/archive/data-version-input.schema.json',
  'contracts/schemas/archive/fixture-index.schema.json',
  'contracts/schemas/archive/producer-case.schema.json',
  'contracts/schemas/archive/producer-index.schema.json',
  'contracts/schemas/archive/schema.sql',
  'contracts/schemas/archive/tooling/build_sqlite_fixtures.py',
  'contracts/schemas/archive/tooling/package-lock.json',
  'contracts/schemas/archive/tooling/package.json',
  'contracts/schemas/archive/tooling/verify.mjs',
]);
const ARCHIVE_GOLDEN_INDEX_PATH =
  'contracts/goldens/archive/index.json';
const ARCHIVE_PRODUCER_INDEX_PATH =
  'contracts/goldens/archive/producer/index.json';
const ARCHIVE_INITIAL_AUTHORITY_PATHS = Object.freeze([
  ...ARCHIVE_SCHEMA_AUTHORITY_PATHS,
  ARCHIVE_GOLDEN_INDEX_PATH,
  ARCHIVE_PRODUCER_INDEX_PATH,
]);
const ARCHIVE_BOOTSTRAP_PROFILE =
  '(version 1)(allow default)(deny network*)(deny file-write*)';
const ARCHIVE_FORGED_GO_ENVIRONMENT_KEYS = Object.freeze([
  'ARCHIVE_GO_SANDBOX_INHERITED',
  'ARCHIVE_GO_SANDBOX_WRAPPER',
  'ARCHIVE_GO_TELEMETRY_SAFE',
]);
export const QUERY_GOLDEN_COMMAND_IDS = Object.freeze([
  'contracts-query-npm-ci',
  'contracts-query-verify',
  'contracts-query-cleanup-safety',
  'contracts-query-prepare-codegen',
  'contracts-query-redocly-lint-codegen-a',
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
const BACKEND_GENERATED_ROOTS = Object.freeze([
  'backend/.cache',
  'backend/.tmp',
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

const SCHEMA_NPM_PACKAGE_GENERATED_ROOTS = Object.freeze({
  'contracts/schemas/archive/tooling': Object.freeze([
    'contracts/schemas/archive/tooling/node_modules',
    'contracts/schemas/archive/.cache',
    'contracts/schemas/archive/.tmp',
  ]),
  'contracts/schemas/catalog/tooling': Object.freeze([
    'contracts/schemas/catalog/tooling/node_modules',
    'contracts/schemas/catalog/.cache',
  ]),
  'contracts/schemas/update-status/tooling': Object.freeze([
    'contracts/schemas/update-status/tooling/node_modules',
    'contracts/schemas/update-status/.cache',
  ]),
});

const API_NPM_PACKAGE_GENERATED_ROOTS = Object.freeze({
  'contracts/goldens/api/catalog': Object.freeze([
    'contracts/goldens/api/catalog/node_modules',
    'contracts/goldens/api/catalog/.cache',
    'contracts/goldens/api/catalog/.tmp',
  ]),
  'contracts/goldens/api/rankings': Object.freeze([
    'contracts/goldens/api/rankings/node_modules',
    'contracts/goldens/api/rankings/.cache',
    'contracts/goldens/api/rankings/.tmp',
  ]),
  'contracts/goldens/api/candidates': Object.freeze([
    'contracts/goldens/api/candidates/node_modules',
    'contracts/goldens/api/candidates/.cache',
    'contracts/goldens/api/candidates/.tmp',
  ]),
  'contracts/goldens/api/person-detail': Object.freeze([
    'contracts/goldens/api/person-detail/node_modules',
    'contracts/goldens/api/person-detail/.cache',
    'contracts/goldens/api/person-detail/.tmp',
  ]),
  'contracts/goldens/api/partners': Object.freeze([
    'contracts/goldens/api/partners/node_modules',
    'contracts/goldens/api/partners/.cache',
    'contracts/goldens/api/partners/.tmp',
  ]),
  'contracts/goldens/api/co-star': Object.freeze([
    'contracts/goldens/api/co-star/node_modules',
    'contracts/goldens/api/co-star/.cache',
    'contracts/goldens/api/co-star/.tmp',
  ]),
});

export function currentNpmPackageGeneratedRoots(relative) {
  const roots =
    SCHEMA_NPM_PACKAGE_GENERATED_ROOTS[relative] ??
    API_NPM_PACKAGE_GENERATED_ROOTS[relative];
  if (roots !== undefined) return roots;
  throw new Error(
    `Contracts npm package has no generated-root cleanup policy: ${relative}`,
  );
}

export function currentNpmPackageCacheRelative(relative) {
  if (SCHEMA_NPM_PACKAGE_GENERATED_ROOTS[relative] !== undefined) {
    return `${path.posix.dirname(relative)}/.cache/npm`;
  }
  if (API_NPM_PACKAGE_GENERATED_ROOTS[relative] !== undefined) {
    return `${relative}/.cache/npm`;
  }
  throw new Error(
    `Contracts npm package has no cache placement policy: ${relative}`,
  );
}

export const CONTRACTS_OWNER_CLEANUP_INVENTORY = Object.freeze({
  currentNpmPackages: CURRENT_NPM_PACKAGES,
  generatedRoots: Object.freeze([
    'contracts/goldens/query/node_modules',
    'contracts/goldens/query/.cache',
    'contracts/goldens/query/.tmp',
    ...CURRENT_NPM_PACKAGES.flatMap(currentNpmPackageGeneratedRoots),
  ]),
});

const CONTRACTS_GENERATED_ROOTS =
  CONTRACTS_OWNER_CLEANUP_INVENTORY.generatedRoots;

const DIRECT_NODE_VERIFIERS = Object.freeze([
  'contracts/goldens/query-domain/verify.mjs',
  'contracts/goldens/statistics/verify.mjs',
]);

export class OwnerGateError extends Error {}

function fail(message) {
  throw new OwnerGateError(message);
}

class GeneratedRootCleanupError extends OwnerGateError {
  constructor(relative, attempts, filesystemCode, cause, details = {}) {
    super(
      `generated cleanup failed after ${attempts} bounded attempt(s): ` +
        `${relative} (${filesystemCode})`,
      { cause },
    );
    this.code = 'OWNER_GATE_GENERATED_CLEANUP_FAILED';
    this.relative = relative;
    this.attempts = attempts;
    this.filesystemCode = filesystemCode;
    this.residuePaths = Object.freeze([...(details.residuePaths ?? [])]);
    this.restored = details.restored === true;
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

function inventoryDisplayPath(relativeRoot, relative) {
  return relative === '.' ? relativeRoot : `${relativeRoot}/${relative}`;
}

function generatedRootInventory(
  absoluteRoot,
  relativeRoot,
  logicalRoot = absoluteRoot,
) {
  const entries = [];
  function visit(absolute, relative) {
    const information = fs.lstatSync(absolute);
    if (information.isSymbolicLink()) {
      const target = fs.readlinkSync(absolute);
      const logicalAbsolute =
        relative === '.'
          ? logicalRoot
          : path.join(logicalRoot, ...relative.split('/'));
      const resolvedTarget = path.resolve(
        path.dirname(logicalAbsolute),
        target,
      );
      if (
        path.isAbsolute(target) ||
        !isStrictlyBelow(resolvedTarget, logicalRoot)
      ) {
        fail(
          `generated cleanup inventory contains an absolute or escaping ` +
            `symlink: ${inventoryDisplayPath(relativeRoot, relative)}`,
        );
      }
      entries.push(Object.freeze({
        kind: 'symlink',
        relative,
        target,
      }));
      return;
    }
    if (information.isDirectory()) {
      entries.push(Object.freeze({
        device: information.dev,
        inode: information.ino,
        kind: 'directory',
        mode: information.mode & 0o7777,
        relative,
      }));
      for (const entry of fs.readdirSync(absolute).sort((left, right) =>
        left.localeCompare(right, 'en'),
      )) {
        visit(
          path.join(absolute, entry),
          relative === '.' ? entry : `${relative}/${entry}`,
        );
      }
      return;
    }
    if (!information.isFile()) {
      fail(
        `generated cleanup inventory contains a special entry: ` +
          `${inventoryDisplayPath(relativeRoot, relative)}`,
      );
    }
    if (information.nlink !== 1) {
      fail(
        `generated cleanup inventory contains a hard-linked file: ` +
          `${inventoryDisplayPath(relativeRoot, relative)}`,
      );
    }
    entries.push(Object.freeze({
      bytes: information.size,
      device: information.dev,
      inode: information.ino,
      kind: 'file',
      linkCount: information.nlink,
      mode: information.mode & 0o7777,
      relative,
    }));
  }
  visit(absoluteRoot, '.');
  return Object.freeze(entries);
}

function validateGeneratedRootInventory(absolute, relative) {
  const discovered = generatedRootInventory(absolute, relative);
  const confirmed = generatedRootInventory(absolute, relative);
  if (!isDeepStrictEqual(discovered, confirmed)) {
    fail(`generated cleanup inventory changed before removal: ${relative}`);
  }
  return confirmed;
}

function makeGeneratedDirectoriesRemovable(
  quarantinedRoot,
  inventory,
  relative,
) {
  const noFollowDirectoryFlags =
    fs.constants.O_RDONLY |
    fs.constants.O_NOFOLLOW |
    fs.constants.O_DIRECTORY;
  for (const entry of inventory) {
    if (entry.kind !== 'directory') continue;
    let descriptor;
    try {
      const absolute =
        entry.relative === '.'
          ? quarantinedRoot
          : path.join(quarantinedRoot, ...entry.relative.split('/'));
      descriptor = fs.openSync(absolute, noFollowDirectoryFlags);
      const information = fs.fstatSync(descriptor);
      if (
        !information.isDirectory() ||
        information.dev !== entry.device ||
        information.ino !== entry.inode ||
        (information.mode & 0o7777) !== entry.mode
      ) {
        fail(`generated cleanup directory changed before chmod: ${entry.relative}`);
      }
      fs.fchmodSync(descriptor, entry.mode | 0o300);
    } catch (error) {
      if (error instanceof OwnerGateError) throw error;
      fail(
        `generated cleanup could not make an owned directory removable: ` +
          `${entry.relative} (${cleanupFilesystemCode(error)})`,
      );
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
    }
  }
  if (inventory.length === 0) {
    fail(`generated cleanup inventory is empty: ${relative}`);
  }
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

function generatedRootIdentityMatches(absolute, rootEntry) {
  try {
    const information = fs.lstatSync(absolute);
    return (
      information.isDirectory() &&
      !information.isSymbolicLink() &&
      information.dev === rootEntry.device &&
      information.ino === rootEntry.inode
    );
  } catch {
    return false;
  }
}

function candidateRelativePath(candidateRoot, absolute) {
  return path.relative(candidateRoot, absolute).split(path.sep).join('/');
}

function privateQuarantineSibling(parent) {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const absolute = path.join(
      parent,
      `.bgmss-cleanup-${randomBytes(16).toString('hex')}`,
    );
    if (!pathExistsNoFollow(absolute)) return absolute;
  }
  fail('generated cleanup could not reserve a private quarantine name');
}

function currentResiduePaths(candidateRoot, candidates) {
  return Object.freeze(
    candidates
      .filter(({ absolute }) => pathExistsNoFollow(absolute))
      .map(({ absolute, relative }) =>
        relative ?? candidateRelativePath(candidateRoot, absolute),
      ),
  );
}

function restoreQuarantineIfSafe({
  absolute,
  quarantineAbsolute,
  rootEntry,
}) {
  if (
    pathExistsNoFollow(absolute) ||
    !generatedRootIdentityMatches(quarantineAbsolute, rootEntry)
  ) {
    return false;
  }
  try {
    fs.renameSync(quarantineAbsolute, absolute);
    return generatedRootIdentityMatches(absolute, rootEntry);
  } catch {
    return false;
  }
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
  const information = generatedRootInformation(absolute, relative);
  if (information === null) {
    return Object.freeze({
      attempts: 1,
      relative,
      status: 'absent',
    });
  }
  const parent = path.dirname(absolute);
  const canonicalParent = requireCanonicalPath(parent, {
    label: `generated cleanup parent ${relative}`,
    type: 'directory',
  });
  if (canonicalParent !== parent || !isStrictlyBelow(parent, canonicalRoot)) {
    fail(`generated cleanup parent is not canonical: ${relative}`);
  }
  const discoveredInventory = validateGeneratedRootInventory(
    absolute,
    relative,
  );
  const rootEntry = discoveredInventory[0];
  if (rootEntry?.kind !== 'directory') {
    fail(`generated cleanup inventory has no directory root: ${relative}`);
  }
  const inventory = discoveredInventory;
  const quarantineAbsolute = privateQuarantineSibling(parent);
  const quarantineRelative = candidateRelativePath(
    canonicalRoot,
    quarantineAbsolute,
  );
  let attempt = 1;
  for (; attempt <= GENERATED_ROOT_CLEANUP_ATTEMPTS; attempt += 1) {
    try {
      fs.renameSync(absolute, quarantineAbsolute);
      break;
    } catch (error) {
      const filesystemCode = cleanupFilesystemCode(error);
      const originalIdentityMatches = generatedRootIdentityMatches(
        absolute,
        rootEntry,
      );
      const quarantineAbsent = !pathExistsNoFollow(quarantineAbsolute);
      if (
        TRANSIENT_GENERATED_ROOT_ERRORS.has(filesystemCode) &&
        attempt < GENERATED_ROOT_CLEANUP_ATTEMPTS &&
        originalIdentityMatches &&
        quarantineAbsent
      ) {
        await cleanupDelay(attempt);
        continue;
      }
      throw new GeneratedRootCleanupError(
        relative,
        attempt,
        filesystemCode,
        error,
        {
          residuePaths: currentResiduePaths(canonicalRoot, [
            { absolute, relative },
            { absolute: quarantineAbsolute, relative: quarantineRelative },
          ]),
        },
      );
    }
  }
  if (attempt > GENERATED_ROOT_CLEANUP_ATTEMPTS) {
    fail(`generated cleanup exhausted quarantine acquisition: ${relative}`);
  }

  const residueCandidates = [
    { absolute, relative },
    { absolute: quarantineAbsolute, relative: quarantineRelative },
  ];
  const failClosedAfterRename = (error, filesystemCode = 'EIDENTITY') => {
    const restored = restoreQuarantineIfSafe({
      absolute,
      quarantineAbsolute,
      rootEntry,
    });
    throw new GeneratedRootCleanupError(
      relative,
      attempt,
      filesystemCode,
      error,
      {
        residuePaths: currentResiduePaths(
          canonicalRoot,
          residueCandidates,
        ),
        restored,
      },
    );
  };

  if (pathExistsNoFollow(absolute)) {
    failClosedAfterRename(
      new OwnerGateError(
        `generated cleanup root was rebound during quarantine: ${relative}`,
      ),
    );
  }
  let quarantinedInventory;
  try {
    quarantinedInventory = generatedRootInventory(
      quarantineAbsolute,
      relative,
      absolute,
    );
  } catch (error) {
    failClosedAfterRename(error);
  }
  if (!isDeepStrictEqual(inventory, quarantinedInventory)) {
    failClosedAfterRename(
      new OwnerGateError(
        `generated cleanup inventory changed during quarantine: ${relative}`,
      ),
    );
  }
  if (pathExistsNoFollow(absolute)) {
    failClosedAfterRename(
      new OwnerGateError(
        `generated cleanup root was rebound during quarantine: ${relative}`,
      ),
    );
  }
  try {
    makeGeneratedDirectoriesRemovable(
      quarantineAbsolute,
      quarantinedInventory,
      relative,
    );
  } catch (error) {
    failClosedAfterRename(error, cleanupFilesystemCode(error));
  }

  for (; attempt <= GENERATED_ROOT_CLEANUP_ATTEMPTS; attempt += 1) {
    try {
      fs.rmSync(quarantineAbsolute, { recursive: true, force: false });
      if (!pathExistsNoFollow(quarantineAbsolute)) {
        if (pathExistsNoFollow(absolute)) {
          const rebound = new OwnerGateError(
            `generated cleanup root was rebound during removal: ${relative}`,
          );
          throw new GeneratedRootCleanupError(
            relative,
            attempt,
            'EIDENTITY',
            rebound,
            {
              residuePaths: currentResiduePaths(canonicalRoot, [
                { absolute, relative },
              ]),
            },
          );
        }
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
      if (error instanceof GeneratedRootCleanupError) throw error;
      const filesystemCode = cleanupFilesystemCode(error);
      if (
        TRANSIENT_GENERATED_ROOT_ERRORS.has(filesystemCode) &&
        attempt < GENERATED_ROOT_CLEANUP_ATTEMPTS
      ) {
        await cleanupDelay(attempt);
        continue;
      }
      const restored = restoreQuarantineIfSafe({
        absolute,
        quarantineAbsolute,
        rootEntry,
      });
      throw new GeneratedRootCleanupError(
        relative,
        attempt,
        filesystemCode,
        error,
        {
          residuePaths: currentResiduePaths(
            canonicalRoot,
            residueCandidates,
          ),
          restored,
        },
      );
    }
  }
  fail(`generated cleanup exhausted its bounded attempts: ${relative}`);
}

async function cleanupGeneratedRootSet(
  candidateRoot,
  relativeRoots,
  label,
) {
  const root = requireCanonicalPath(candidateRoot, {
    label: `${label} generated cleanup candidate`,
    type: 'directory',
  });
  const outcomes = [];
  for (const relative of relativeRoots) {
    try {
      outcomes.push(await removeOwnedGenerated(root, relative));
    } catch (error) {
      const residuePaths =
        Array.isArray(error?.residuePaths) && error.residuePaths.length > 0
          ? error.residuePaths
          : generatedRootExists(root, relative)
            ? Object.freeze([relative])
            : Object.freeze([]);
      outcomes.push(Object.freeze({
        attempts: Number.isInteger(error?.attempts) ? error.attempts : 1,
        code: cleanupFilesystemCode(error?.filesystemCode ?? error),
        relative,
        residue: residuePaths.length > 0,
        residuePaths,
        restored: error?.restored === true,
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
    residueCount: outcomes.reduce(
      (count, outcome) =>
        count +
        (outcome.status === 'failed'
          ? (outcome.residuePaths?.length ?? (outcome.residue ? 1 : 0))
          : 0),
      0,
    ),
    retriedCount: outcomes.filter((outcome) => outcome.attempts > 1).length,
    retryDelayMs: GENERATED_ROOT_CLEANUP_RETRY_MS,
  };
  return Object.freeze(report);
}

export async function cleanupContractsGeneratedRoots(candidateRoot) {
  return cleanupGeneratedRootSet(
    candidateRoot,
    CONTRACTS_GENERATED_ROOTS,
    'Contracts',
  );
}

export async function cleanupBackendGeneratedRoots(candidateRoot) {
  return cleanupGeneratedRootSet(
    candidateRoot,
    BACKEND_GENERATED_ROOTS,
    'Backend',
  );
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

function registerSecondaryQueryOwnerCleanup(
  primaryError,
  cleanupResult,
  cleanupError,
) {
  if (primaryError === null || typeof primaryError !== 'object') {
    return primaryError;
  }
  const existingEvidence = Array.isArray(primaryError.evidence)
    ? primaryError.evidence
    : primaryError.result
      ? commandEvidence(primaryError.result)
      : [];
  const result = cleanupResult ?? cleanupError?.result;
  const cleanupEvidence = result ? commandEvidence(result) : [];
  try {
    Object.defineProperty(primaryError, 'queryOwnerCleanup', {
      configurable: true,
      enumerable: true,
      value: Object.freeze({
        exitStatus: result?.status ?? null,
        id: result?.id ?? 'contracts-query-cleanup',
        message: cleanupError?.message ??
          'Query owner cleanup command completed',
        status: cleanupError ? 'failed' : 'passed',
        timedOut: result?.timedOut ?? null,
      }),
    });
    if (cleanupEvidence.length > 0) {
      Object.defineProperty(primaryError, 'evidence', {
        configurable: true,
        enumerable: true,
        value: Object.freeze([...existingEvidence, ...cleanupEvidence]),
      });
    }
  } catch {
    // The originating error remains primary even if it cannot carry metadata.
  }
  return primaryError;
}

export async function settleQueryOwnerCommandCleanup({
  operation,
  cleanup,
}) {
  if (typeof operation !== 'function' || typeof cleanup !== 'function') {
    fail('Query owner cleanup settlement requires two operations');
  }
  let primaryError;
  let operationFailed = false;
  try {
    await operation();
  } catch (error) {
    operationFailed = true;
    primaryError = error;
  }
  let cleanupResult;
  let cleanupError;
  try {
    cleanupResult = await cleanup();
  } catch (error) {
    cleanupError = error;
  }
  if (operationFailed) {
    throw registerSecondaryQueryOwnerCleanup(
      primaryError,
      cleanupResult,
      cleanupError,
    );
  }
  if (cleanupError !== undefined) throw cleanupError;
  return cleanupResult;
}

function ownerCleanupFailure(
  cleanup,
  evidence,
  evidenceError,
  ownerLabel,
) {
  const suffix = evidenceError
    ? ' and its secondary evidence could not be written'
    : '';
  const error = new OwnerGateError(
    `${ownerLabel} owner generated-root cleanup failed for ` +
      `${cleanup.failedCount} exact root(s)${suffix}`,
    evidenceError ? { cause: evidenceError } : undefined,
  );
  error.code = 'OWNER_GATE_CLEANUP_FAILED';
  error.cleanup = cleanup;
  error.evidence = Object.freeze(evidence ? [evidence] : []);
  return error;
}

async function settleGeneratedOwnerGate({
  candidateRoot,
  runRoot,
  gateResult,
  primaryError,
  cleanupGeneratedRoots,
  evidenceRelative,
  ownerLabel,
}) {
  const cleanup = await cleanupGeneratedRoots(candidateRoot);
  const notable = cleanup.failedCount > 0 || cleanup.retriedCount > 0;
  let evidence;
  let evidenceError;
  if (notable) {
    try {
      evidence = await writeEvidence({
        runRoot,
        relative: evidenceRelative,
        kind: 'cleanup',
        value: cleanup,
        summary:
          `${ownerLabel} generated-root cleanup: ${cleanup.failedCount} failed, ` +
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
    throw ownerCleanupFailure(
      cleanup,
      evidence,
      evidenceError,
      ownerLabel,
    );
  }
  if (!gateResult || !Array.isArray(gateResult.evidence)) {
    fail(`${ownerLabel} owner gate completed without one result`);
  }
  if (!evidence) return gateResult;
  return Object.freeze({
    ...gateResult,
    evidence: Object.freeze([...gateResult.evidence, evidence]),
  });
}

export async function settleContractsOwnerGate(arguments_) {
  return settleGeneratedOwnerGate({
    ...arguments_,
    cleanupGeneratedRoots: cleanupContractsGeneratedRoots,
    evidenceRelative: 'evidence/gates/owner-contracts-cleanup.json',
    ownerLabel: 'Contracts',
  });
}

export async function settleBackendOwnerGate(arguments_) {
  return settleGeneratedOwnerGate({
    ...arguments_,
    cleanupGeneratedRoots: cleanupBackendGeneratedRoots,
    evidenceRelative: 'evidence/gates/owner-backend-cleanup.json',
    ownerLabel: 'Backend',
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
const ARCHIVE_RUNTIME_NAMES = Object.freeze([
  ...CURRENT_NODE_RUNTIME_NAMES,
  ...CURRENT_GO_RUNTIME_NAMES,
  'pythonSource',
  'python',
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
    : path.join(
        candidateRoot,
        ...currentNpmPackageCacheRelative(packageRelative).split('/'),
      );
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
  boundary,
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
      ...(boundary === undefined ? {} : { boundary }),
    },
    summary,
  });
}

const trustedQueryTrackedAuthorities = new WeakSet();
const queryTrackedAuthorityBytes = new WeakMap();
const trustedQueryCodegenAuthorities = new WeakSet();
const trustedArchiveTrackedAuthorities = new WeakSet();
const archiveTrackedAuthorityBytes = new WeakMap();
const trustedArchiveDependencyClosures = new WeakSet();

function requireExactKeys(value, expected, label) {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !isDeepStrictEqual(Object.keys(value), expected)
  ) {
    fail(`${label} does not have the exact closed fields`);
  }
  return value;
}

function requireExactValue(actual, expected, label) {
  if (!isDeepStrictEqual(actual, expected)) {
    fail(`${label} differs from the accepted Query authority`);
  }
  return actual;
}

function archiveAuthorityFileSeal(filePath, label) {
  const canonical = requireCanonicalPath(filePath, {
    label,
    type: 'file',
  });
  const information = fs.lstatSync(canonical);
  if (information.nlink !== 1 || (information.mode & 0o777) !== 0o644) {
    fail(`${label} must be one unlinked 644 regular file`);
  }
  return Object.freeze({
    bytes: information.size,
    mode: 0o644,
    path: canonical,
    sha256: sha256FileSync(canonical),
  });
}

function archiveIndexAuthorityPaths({
  bytes,
  expectedCount,
  expectedFields,
  indexPath,
  prefix,
}) {
  const document = parseJsonStrict(
    decodeUtf8Strict(bytes, `${indexPath} bytes`),
    indexPath,
  );
  requireExactKeys(
    document,
    ['indexSchemaVersion', 'files'],
    `${indexPath} authority`,
  );
  if (
    document.indexSchemaVersion !== 1 ||
    !Array.isArray(document.files) ||
    document.files.length !== expectedCount
  ) {
    fail(`${indexPath} does not declare the exact accepted file count`);
  }
  const paths = [];
  let previous = '';
  for (const [index, declaration] of document.files.entries()) {
    requireExactKeys(
      declaration,
      expectedFields,
      `${indexPath} file ${index}`,
    );
    const relative = assertSafeRelativePath(
      declaration.path,
      `${indexPath} file ${index} path`,
    );
    if (
      relative <= previous ||
      typeof declaration.digest !== 'string' ||
      !/^sha256:[0-9a-f]{64}$/u.test(declaration.digest)
    ) {
      fail(`${indexPath} file authority is unordered or invalid`);
    }
    previous = relative;
    paths.push(Object.freeze({
      digest: declaration.digest,
      path: `${prefix}/${relative}`,
    }));
  }
  return Object.freeze(paths);
}

function archiveExpectedPersistentDirectories(authorityPaths) {
  const directories = new Set([
    'contracts/goldens/archive',
    'contracts/schemas/archive',
  ]);
  for (const relative of authorityPaths) {
    let parent = path.posix.dirname(relative);
    while (
      parent === 'contracts/goldens/archive' ||
      parent.startsWith('contracts/goldens/archive/') ||
      parent === 'contracts/schemas/archive' ||
      parent.startsWith('contracts/schemas/archive/')
    ) {
      directories.add(parent);
      const next = path.posix.dirname(parent);
      if (next === parent) break;
      parent = next;
    }
  }
  return [...directories].sort((left, right) =>
    left.localeCompare(right, 'en'));
}

function archivePersistentInventory(candidateRoot) {
  const files = [];
  const directories = [];
  function visit(root, relativeRoot, excluded) {
    const rootInformation = fs.lstatSync(root);
    if (
      rootInformation.isSymbolicLink() ||
      !rootInformation.isDirectory()
    ) {
      fail(`Archive persistent authority root is not a real directory: ${relativeRoot}`);
    }
    directories.push(relativeRoot);
    for (const entry of fs
      .readdirSync(root, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
      const relative = `${relativeRoot}/${entry.name}`;
      if (excluded.has(relative)) continue;
      const absolute = path.join(root, entry.name);
      const information = fs.lstatSync(absolute);
      if (information.isSymbolicLink()) {
        fail(`Archive persistent authority contains a symlink: ${relative}`);
      }
      if (information.isDirectory()) {
        visit(absolute, relative, excluded);
      } else if (information.isFile()) {
        if (information.nlink !== 1) {
          fail(`Archive persistent authority contains a hard link: ${relative}`);
        }
        files.push(relative);
      } else {
        fail(`Archive persistent authority contains a special entry: ${relative}`);
      }
    }
  }
  visit(
    path.join(candidateRoot, 'contracts', 'schemas', 'archive'),
    'contracts/schemas/archive',
    new Set([
      'contracts/schemas/archive/.cache',
      'contracts/schemas/archive/.tmp',
      'contracts/schemas/archive/tooling/node_modules',
    ]),
  );
  visit(
    path.join(candidateRoot, 'contracts', 'goldens', 'archive'),
    'contracts/goldens/archive',
    new Set(),
  );
  return Object.freeze({
    directories: Object.freeze(directories.sort((left, right) =>
      left.localeCompare(right, 'en'))),
    files: Object.freeze(files.sort((left, right) =>
      left.localeCompare(right, 'en'))),
  });
}

export function admitArchiveTrackedAuthority({ candidateRoot }) {
  const root = requireCanonicalPath(candidateRoot, {
    label: 'Archive tracked authority candidate',
    type: 'directory',
  });
  const identity = deriveCleanCheckoutIdentityClosed({
    repositoryRoot: root,
    controlPlanePaths: ARCHIVE_INITIAL_AUTHORITY_PATHS,
  });
  const initialBlobs = new Map(
    ARCHIVE_INITIAL_AUTHORITY_PATHS.map((relativePath) => [
      relativePath,
      readRawRegularGitBlob({
        repositoryRoot: root,
        revision: identity.revision,
        relativePath,
      }),
    ]),
  );
  const goldenPaths = archiveIndexAuthorityPaths({
    bytes: initialBlobs.get(ARCHIVE_GOLDEN_INDEX_PATH).bytes,
    expectedCount: 32,
    expectedFields: [
      'path',
      'digest',
      'caseId',
      'validationStage',
      'expected',
    ],
    indexPath: ARCHIVE_GOLDEN_INDEX_PATH,
    prefix: 'contracts/goldens/archive',
  });
  const producerPaths = archiveIndexAuthorityPaths({
    bytes: initialBlobs.get(ARCHIVE_PRODUCER_INDEX_PATH).bytes,
    expectedCount: 15,
    expectedFields: ['path', 'digest', 'caseId'],
    indexPath: ARCHIVE_PRODUCER_INDEX_PATH,
    prefix: 'contracts/goldens/archive/producer',
  });
  const indexedDigests = new Map(
    [...goldenPaths, ...producerPaths].map(({ path: relativePath, digest }) => [
      relativePath,
      digest,
    ]),
  );
  const authorityPaths = Object.freeze([
    ...ARCHIVE_SCHEMA_AUTHORITY_PATHS,
    ARCHIVE_GOLDEN_INDEX_PATH,
    ...goldenPaths.map(({ path: relativePath }) => relativePath),
    ARCHIVE_PRODUCER_INDEX_PATH,
    ...producerPaths.map(({ path: relativePath }) => relativePath),
  ].sort((left, right) => left.localeCompare(right, 'en')));
  if (
    authorityPaths.length !== 62 ||
    new Set(authorityPaths).size !== authorityPaths.length
  ) {
    fail('Archive tracked authority does not contain exactly 62 files');
  }
  const records = [];
  const rawBytes = new Map();
  for (const relativePath of authorityPaths) {
    const blob = initialBlobs.get(relativePath) ??
      readRawRegularGitBlob({
        repositoryRoot: root,
        revision: identity.revision,
        relativePath,
      });
    if (
      blob.mode !== '100644' ||
      (
        indexedDigests.has(relativePath) &&
        indexedDigests.get(relativePath) !== blob.sha256
      )
    ) {
      fail(`Archive tracked authority disagrees with its index: ${relativePath}`);
    }
    const bytes = Buffer.from(blob.bytes);
    const physical = archiveAuthorityFileSeal(
      path.join(root, ...relativePath.split('/')),
      `Archive tracked authority ${relativePath}`,
    );
    if (
      physical.bytes !== blob.byteCount ||
      physical.sha256 !== blob.sha256 ||
      !fs.readFileSync(physical.path).equals(bytes)
    ) {
      fail(`Archive tracked authority differs from Product blob: ${relativePath}`);
    }
    records.push(Object.freeze({
      blobOid: blob.blobOid,
      bytes: blob.byteCount,
      mode: blob.mode,
      path: relativePath,
      sha256: blob.sha256,
    }));
    rawBytes.set(relativePath, bytes);
  }
  const inventory = archivePersistentInventory(root);
  if (
    !isDeepStrictEqual(inventory.files, authorityPaths) ||
    !isDeepStrictEqual(
      inventory.directories,
      archiveExpectedPersistentDirectories(authorityPaths),
    )
  ) {
    fail('Archive persistent schema/golden inventory is not exact');
  }
  const authority = Object.freeze({
    directories: inventory.directories,
    records: Object.freeze(records),
    repositoryRoot: root,
    revision: identity.revision,
    tree: identity.tree,
  });
  trustedArchiveTrackedAuthorities.add(authority);
  archiveTrackedAuthorityBytes.set(authority, rawBytes);
  return authority;
}

export function assertArchiveTrackedAuthorityFiles({
  authority,
  candidateRoot,
}) {
  if (!trustedArchiveTrackedAuthorities.has(authority)) {
    fail('Archive tracked authority was not admitted from Product Git blobs');
  }
  const root = requireCanonicalPath(candidateRoot, {
    label: 'Archive tracked authority candidate',
    type: 'directory',
  });
  if (root !== authority.repositoryRoot) {
    fail('Archive tracked authority belongs to another candidate root');
  }
  const rawBytes = archiveTrackedAuthorityBytes.get(authority);
  const records = authority.records.map((record) => {
    const physical = archiveAuthorityFileSeal(
      path.join(root, ...record.path.split('/')),
      `Archive tracked authority ${record.path}`,
    );
    if (
      record.mode !== '100644' ||
      physical.bytes !== record.bytes ||
      physical.sha256 !== record.sha256 ||
      !fs.readFileSync(physical.path).equals(rawBytes.get(record.path))
    ) {
      fail(`Archive tracked Product blob changed: ${record.path}`);
    }
    return Object.freeze({
      blobOid: record.blobOid,
      bytes: physical.bytes,
      mode: physical.mode,
      path: record.path,
      sha256: physical.sha256,
    });
  });
  const inventory = archivePersistentInventory(root);
  if (
    !isDeepStrictEqual(
      inventory.files,
      authority.records.map(({ path: relativePath }) => relativePath),
    ) ||
    !isDeepStrictEqual(inventory.directories, authority.directories)
  ) {
    fail('Archive persistent schema/golden inventory changed');
  }
  return Object.freeze({
    directories: inventory.directories,
    records: Object.freeze(records),
    revision: authority.revision,
    tree: authority.tree,
  });
}

export function assertArchiveTrackedAuthorityUnchanged(before, after) {
  if (
    !before ||
    !after ||
    !isDeepStrictEqual(before.records, after.records) ||
    !isDeepStrictEqual(before.directories, after.directories)
  ) {
    fail('Archive tracked authority changed during direct verification');
  }
  return after;
}

function installedPackageName(relativePath) {
  const marker = 'node_modules/';
  const index = relativePath.lastIndexOf(marker);
  if (index < 0) fail(`invalid installed package path: ${relativePath}`);
  return relativePath.slice(index + marker.length);
}

function archiveInstalledPackageInventory(nodeModulesRoot) {
  const packages = [];
  function recordPackage(packageRoot, relativePath) {
    const information = fs.lstatSync(packageRoot);
    if (information.isSymbolicLink() || !information.isDirectory()) {
      fail(`Archive dependency package is not a real directory: ${relativePath}`);
    }
    packages.push(relativePath);
    const nested = path.join(packageRoot, 'node_modules');
    if (fs.existsSync(nested)) visitNodeModules(nested, `${relativePath}/node_modules`);
  }
  function visitNodeModules(directory, prefix) {
    const information = fs.lstatSync(directory);
    if (information.isSymbolicLink() || !information.isDirectory()) {
      fail(`Archive dependency node_modules is not a real directory: ${prefix}`);
    }
    for (const entry of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
      const absolute = path.join(directory, entry.name);
      if (entry.name === '.package-lock.json') {
        if (!entry.isFile() || entry.isSymbolicLink()) {
          fail('Archive hidden dependency lock must be a regular file');
        }
        continue;
      }
      if (entry.name === '.bin') {
        if (!entry.isDirectory() || entry.isSymbolicLink()) {
          fail('Archive dependency .bin must be a real directory');
        }
        continue;
      }
      if (entry.name.startsWith('@')) {
        if (!entry.isDirectory() || entry.isSymbolicLink()) {
          fail(`Archive dependency scope is not a real directory: ${entry.name}`);
        }
        for (const scoped of fs
          .readdirSync(absolute, { withFileTypes: true })
          .sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
          if (!scoped.isDirectory() || scoped.isSymbolicLink()) {
            fail(`Archive dependency scoped package is invalid: ${entry.name}/${scoped.name}`);
          }
          recordPackage(
            path.join(absolute, scoped.name),
            `${prefix}/${entry.name}/${scoped.name}`,
          );
        }
        continue;
      }
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        fail(`Archive dependency node_modules contains an unexpected entry: ${entry.name}`);
      }
      recordPackage(absolute, `${prefix}/${entry.name}`);
    }
  }
  visitNodeModules(nodeModulesRoot, 'node_modules');
  return Object.freeze(packages.sort((left, right) =>
    left.localeCompare(right, 'en')));
}

function archiveLockedPackagePath(value) {
  if (
    typeof value !== 'string' ||
    value.length < 14 ||
    value.length > 4096 ||
    value.includes('\\') ||
    value.includes('\0')
  ) {
    fail('Archive locked package path is invalid');
  }
  const parts = value.split('/');
  let index = 0;
  const packagePart = /^[A-Za-z0-9._~-]+$/u;
  while (index < parts.length) {
    if (parts[index] !== 'node_modules') {
      fail(`Archive locked package path has an invalid owner: ${value}`);
    }
    index += 1;
    if (parts[index]?.startsWith('@')) {
      if (
        !/^@[A-Za-z0-9._~-]+$/u.test(parts[index]) ||
        !packagePart.test(parts[index + 1] ?? '')
      ) {
        fail(`Archive locked scoped package path is invalid: ${value}`);
      }
      index += 2;
    } else {
      if (!packagePart.test(parts[index] ?? '')) {
        fail(`Archive locked package name is invalid: ${value}`);
      }
      index += 1;
    }
  }
  return value;
}

export async function sealArchiveInstalledDependencyClosure({
  toolingRoot,
}) {
  const root = requireCanonicalPath(toolingRoot, {
    label: 'Archive tooling root',
    type: 'directory',
  });
  const lock = readJsonStrict(path.join(root, 'package-lock.json'));
  if (
    lock.lockfileVersion !== 3 ||
    !lock.packages ||
    typeof lock.packages !== 'object' ||
    Array.isArray(lock.packages)
  ) {
    fail('Archive package lock has no exact v3 package closure');
  }
  const expected = Object.keys(lock.packages)
    .filter((relativePath) => relativePath !== '')
    .map(archiveLockedPackagePath)
    .sort((left, right) => left.localeCompare(right, 'en'));
  if (expected.length === 0 || new Set(expected).size !== expected.length) {
    fail('Archive package lock does not contain one unique package closure');
  }
  const nodeModules = requireCanonicalPath(path.join(root, 'node_modules'), {
    label: 'Archive installed dependency closure',
    type: 'directory',
    below: root,
  });
  const installed = archiveInstalledPackageInventory(nodeModules);
  if (!isDeepStrictEqual(installed, expected)) {
    fail('Archive installed package paths differ from package-lock');
  }
  for (const relativePath of expected) {
    const declaration = lock.packages[relativePath];
    if (
      !declaration ||
      typeof declaration.version !== 'string' ||
      declaration.version === ''
    ) {
      fail(`Archive locked package has no version: ${relativePath}`);
    }
    const packageRoot = path.join(root, ...relativePath.split('/'));
    const packageDocument = readJsonStrict(path.join(packageRoot, 'package.json'));
    if (
      packageDocument.name !== installedPackageName(relativePath) ||
      packageDocument.version !== declaration.version
    ) {
      fail(`Archive installed package identity differs from lock: ${relativePath}`);
    }
  }
  const hiddenLockPath = path.join(nodeModules, '.package-lock.json');
  const hiddenLock = readJsonStrict(hiddenLockPath);
  const hiddenPaths = Object.keys(hiddenLock.packages ?? {})
    .sort((left, right) => left.localeCompare(right, 'en'));
  if (!isDeepStrictEqual(hiddenPaths, expected)) {
    fail('Archive hidden install lock differs from package-lock closure');
  }
  for (const relativePath of expected) {
    if (
      hiddenLock.packages[relativePath]?.version !==
        lock.packages[relativePath].version
    ) {
      fail(`Archive hidden install lock version drifted: ${relativePath}`);
    }
  }
  const closure = Object.freeze({
    packagePaths: expected,
    seal: await sealDistributionTree(nodeModules, {
      allowInternalSymlinks: true,
    }),
  });
  trustedArchiveDependencyClosures.add(closure);
  return closure;
}

export function assertArchiveInstalledDependencyClosureUnchanged(
  before,
  after,
) {
  if (
    !trustedArchiveDependencyClosures.has(before) ||
    !trustedArchiveDependencyClosures.has(after) ||
    !isDeepStrictEqual(before.packagePaths, after.packagePaths)
  ) {
    fail('Archive installed dependency authority is missing or changed');
  }
  assertSameSeal(
    before.seal,
    after.seal,
    'Archive installed dependency closure',
  );
  return after;
}

function queryCandidateRoot(goldenRoot) {
  const canonical = requireCanonicalPath(goldenRoot, {
    label: 'Query golden root',
    type: 'directory',
  });
  const candidateRoot = path.resolve(canonical, '..', '..', '..');
  if (
    path.join(candidateRoot, 'contracts', 'goldens', 'query') !== canonical
  ) {
    fail('Query golden root is outside its exact candidate path');
  }
  return Object.freeze({ candidateRoot, goldenRoot: canonical });
}

function queryAuthorityFileSeal(filePath, label, expectedMode) {
  const canonical = requireCanonicalPath(filePath, {
    label,
    type: 'file',
  });
  const information = fs.lstatSync(canonical);
  const mode = information.mode & 0o777;
  if (information.nlink !== 1 || mode !== expectedMode) {
    fail(
      `${label} must be one unlinked ${expectedMode.toString(8)} regular file`,
    );
  }
  return Object.freeze({
    bytes: information.size,
    mode,
    path: canonical,
    sha256: sha256FileSync(canonical),
  });
}

export function admitQueryTrackedAuthority({ candidateRoot }) {
  const root = requireCanonicalPath(candidateRoot, {
    label: 'Query tracked authority candidate',
    type: 'directory',
  });
  const identity = deriveCleanCheckoutIdentityClosed({
    repositoryRoot: root,
    controlPlanePaths: QUERY_TRACKED_AUTHORITY_PATHS,
  });
  const records = [];
  const rawBytes = new Map();
  for (const relativePath of QUERY_TRACKED_AUTHORITY_PATHS) {
    const blob = readRawRegularGitBlob({
      repositoryRoot: root,
      revision: identity.revision,
      relativePath,
    });
    const bytes = Buffer.from(blob.bytes);
    const physicalPath = path.join(root, ...relativePath.split('/'));
    const physical = queryAuthorityFileSeal(
      physicalPath,
      `Query tracked authority ${relativePath}`,
      0o644,
    );
    if (
      physical.bytes !== blob.byteCount ||
      physical.sha256 !== blob.sha256 ||
      !fs.readFileSync(physicalPath).equals(bytes)
    ) {
      fail(`Query tracked authority differs from Product blob: ${relativePath}`);
    }
    records.push(Object.freeze({
      blobOid: blob.blobOid,
      bytes: blob.byteCount,
      mode: blob.mode,
      path: relativePath,
      sha256: blob.sha256,
    }));
    rawBytes.set(relativePath, bytes);
  }
  const authority = Object.freeze({
    records: Object.freeze(records),
    repositoryRoot: root,
    revision: identity.revision,
    tree: identity.tree,
  });
  trustedQueryTrackedAuthorities.add(authority);
  queryTrackedAuthorityBytes.set(authority, rawBytes);
  return authority;
}

export function assertQueryTrackedAuthorityFiles({
  authority,
  candidateRoot,
}) {
  if (!trustedQueryTrackedAuthorities.has(authority)) {
    fail('Query tracked authority was not admitted from Product Git blobs');
  }
  const root = requireCanonicalPath(candidateRoot, {
    label: 'Query tracked authority candidate',
    type: 'directory',
  });
  if (root !== authority.repositoryRoot) {
    fail('Query tracked authority belongs to another candidate root');
  }
  const rawBytes = queryTrackedAuthorityBytes.get(authority);
  const seals = [];
  for (const record of authority.records) {
    const physicalPath = path.join(root, ...record.path.split('/'));
    const physical = queryAuthorityFileSeal(
      physicalPath,
      `Query tracked authority ${record.path}`,
      0o644,
    );
    if (
      record.mode !== '100644' ||
      physical.bytes !== record.bytes ||
      physical.sha256 !== record.sha256 ||
      !fs.readFileSync(physicalPath).equals(rawBytes.get(record.path))
    ) {
      fail(`Query tracked Product blob changed: ${record.path}`);
    }
    seals.push(Object.freeze({
      blobOid: record.blobOid,
      bytes: physical.bytes,
      mode: physical.mode,
      path: record.path,
      sha256: physical.sha256,
    }));
  }
  return Object.freeze({
    records: Object.freeze(seals),
    revision: authority.revision,
    tree: authority.tree,
  });
}

function queryManifestEnvironment() {
  return Object.freeze({
    PATH: QUERY_GO_FIXED_PATH,
    HOME: '@repo-root@/contracts/goldens/query/.tmp/go-home',
    TMPDIR: '@repo-root@/contracts/goldens/query/.tmp/system',
    GOCACHE: '@repo-root@/contracts/goldens/query/.cache/go-build',
    GOMODCACHE: '@repo-root@/contracts/goldens/query/.cache/go-mod',
    GOPATH: '@repo-root@/contracts/goldens/query/.cache/go-path',
    GOENV: 'off',
    GOWORK: 'off',
    GOTOOLCHAIN: 'local',
  });
}

function queryRuntimeEnvironment(candidateRoot) {
  const goldenRoot = path.join(
    candidateRoot,
    'contracts',
    'goldens',
    'query',
  );
  return Object.freeze({
    PATH: QUERY_GO_FIXED_PATH,
    HOME: path.join(goldenRoot, '.tmp', 'go-home'),
    TMPDIR: path.join(goldenRoot, '.tmp', 'system'),
    GOCACHE: path.join(goldenRoot, '.cache', 'go-build'),
    GOMODCACHE: path.join(goldenRoot, '.cache', 'go-mod'),
    GOPATH: path.join(goldenRoot, '.cache', 'go-path'),
    GOENV: 'off',
    GOWORK: 'off',
    GOTOOLCHAIN: 'local',
  });
}

function queryGoChildArgv() {
  const generation = (output) => Object.freeze([
    QUERY_GO_EXECUTABLE,
    'tool',
    'oapi-codegen',
    '-generate',
    'models,skip-prune',
    '-package',
    'querywire',
    '-o',
    output,
    'codegen-a/query.bundle.json',
  ]);
  return Object.freeze({
    primaryGeneration: generation('query.gen.go'),
    deterministicReplay: generation('query.verify.gen.go'),
    gofmt: Object.freeze([
      QUERY_GOFMT_EXECUTABLE,
      '-d',
      'query.gen.go',
    ]),
    compileSmoke: Object.freeze([
      QUERY_GO_EXECUTABLE,
      'test',
      'query.gen.go',
    ]),
  });
}

function queryGoWrapperPrefix(environment) {
  return Object.freeze([
    SANDBOX_EXECUTABLE,
    '-p',
    QUERY_GO_SANDBOX_PROFILE,
    '/usr/bin/env',
    '-i',
    ...QUERY_GO_ENVIRONMENT_KEYS.map(
      (name) => `${name}=${environment[name]}`,
    ),
  ]);
}

function validateQueryManifestFileEvidence({
  candidateRoot,
  declaration,
  expectedPath,
  expectedMode,
  label,
  verifyPhysical = true,
}) {
  requireExactKeys(declaration, ['path', 'bytes', 'sha256'], label);
  if (
    declaration.path !== expectedPath ||
    !Number.isSafeInteger(declaration.bytes) ||
    declaration.bytes < 1 ||
    typeof declaration.sha256 !== 'string' ||
    !/^[0-9a-f]{64}$/u.test(declaration.sha256)
  ) {
    fail(`${label} declaration is invalid`);
  }
  if (verifyPhysical) {
    const physical = queryAuthorityFileSeal(
      path.join(candidateRoot, ...expectedPath.split('/')),
      `${label} physical file`,
      expectedMode,
    );
    if (
      physical.bytes !== declaration.bytes ||
      physical.sha256 !== `sha256:${declaration.sha256}`
    ) {
      fail(`${label} physical bytes differ from the Query manifest`);
    }
  }
  return Object.freeze({
    bytes: declaration.bytes,
    mode: expectedMode,
    path: declaration.path,
    sha256: `sha256:${declaration.sha256}`,
  });
}

function validateQueryModuleAuthority(candidateRoot, go) {
  requireExactKeys(go.moduleInputs, ['goMod', 'goSum'], 'Query module inputs');
  requireExactKeys(go.module, ['goMod', 'goSum'], 'Query materialized module');
  const declarations = Object.freeze({
    goMod: Object.freeze({
      input: 'contracts/goldens/query/fixtures/go-module/go.mod.lock',
      materialized: 'contracts/goldens/query/.tmp/go.mod',
    }),
    goSum: Object.freeze({
      input: 'contracts/goldens/query/fixtures/go-module/go.sum.lock',
      materialized: 'contracts/goldens/query/.tmp/go.sum',
    }),
  });
  const inputs = {};
  const materialized = {};
  for (const [name, paths] of Object.entries(declarations)) {
    inputs[name] = validateQueryManifestFileEvidence({
      candidateRoot,
      declaration: go.moduleInputs[name],
      expectedPath: paths.input,
      expectedMode: 0o644,
      label: `Query ${name} input`,
    });
    materialized[name] = validateQueryManifestFileEvidence({
      candidateRoot,
      declaration: go.module[name],
      expectedPath: paths.materialized,
      expectedMode: 0o600,
      label: `Query ${name} materialized module`,
      verifyPhysical: false,
    });
    if (
      inputs[name].bytes !== materialized[name].bytes ||
      inputs[name].sha256 !== materialized[name].sha256
    ) {
      fail(`Query ${name} input/materialized seal differs`);
    }
  }
  return Object.freeze({
    inputs: Object.freeze(inputs),
    materialized: Object.freeze(materialized),
  });
}

function validateQueryGoOutputAuthority(go, childArgv) {
  requireExactKeys(go.output, [
    'bytes',
    'sha256',
    'declarationCount',
    'declarations',
    'requiredPublicDeclarations',
    'deterministicReplay',
    'gofmt',
    'compileSmoke',
    'primaryGeneration',
  ], 'Query Go output authority');
  requireExactKeys(
    go.output.primaryGeneration,
    ['childArgv', 'status', 'stdoutSha256'],
    'Query primaryGeneration output',
  );
  requireExactKeys(
    go.output.deterministicReplay,
    [
      'childArgv',
      'status',
      'stdoutSha256',
      'bytes',
      'sha256',
      'byteIdentical',
    ],
    'Query deterministicReplay output',
  );
  requireExactKeys(
    go.output.gofmt,
    ['childArgv', 'status', 'stdoutBytes', 'stderrBytes'],
    'Query gofmt output',
  );
  requireExactKeys(
    go.output.compileSmoke,
    ['childArgv', 'status', 'stdoutSha256'],
    'Query compileSmoke output',
  );
  for (const operation of QUERY_GO_OPERATION_IDS) {
    requireExactValue(
      go.output[operation].childArgv,
      childArgv[operation],
      `Query ${operation} child argv`,
    );
    if (go.output[operation].status !== 0) {
      fail(`Query ${operation} static status is not zero`);
    }
  }
  if (
    go.output.gofmt.stdoutBytes !== 0 ||
    go.output.gofmt.stderrBytes !== 0 ||
    go.output.deterministicReplay.byteIdentical !== true
  ) {
    fail('Query Go output authority does not bind clean format/replay');
  }
}

export function queryVerifyCodegenCommandPlan({
  goldenRoot,
  queryNodePath,
}) {
  return Object.freeze({
    args: Object.freeze([
      path.join(goldenRoot, 'verify.mjs'),
      '--verify-codegen-projections',
    ]),
    cwd: goldenRoot,
    environment: 'query',
    executable: queryNodePath,
    id: QUERY_CODEGEN_DIRECT_ID,
    timeoutMs: QUERY_GOLDEN_TIMEOUT_MS,
  });
}

export function validateQueryVerifyCodegenCommandPlan(
  declaration,
  {
    goldenRoot,
    queryNodePath,
  },
) {
  const expected = queryVerifyCodegenCommandPlan({
    goldenRoot,
    queryNodePath,
  });
  if (
    !declaration ||
    declaration.id !== expected.id ||
    declaration.cwd !== expected.cwd ||
    declaration.environment !== expected.environment ||
    declaration.executable !== expected.executable ||
    declaration.timeoutMs !== expected.timeoutMs ||
    !isDeepStrictEqual(declaration.args, expected.args)
  ) {
    fail('Query codegen verifier is not the exact direct command plan');
  }
  return expected;
}

export function validateQueryCodegenStaticAuthority({
  goldenRoot,
  trackedAuthority,
}) {
  const roots = queryCandidateRoot(goldenRoot);
  const manifestPath = path.join(roots.goldenRoot, 'manifest.json');
  const trackedSeals = assertQueryTrackedAuthorityFiles({
    authority: trackedAuthority,
    candidateRoot: roots.candidateRoot,
  });
  const verifierSeal = trackedSeals.records.find(
    (record) => record.path === 'contracts/goldens/query/verify.mjs',
  );
  if (!verifierSeal) fail('Query verifier tracked seal is absent');
  const manifest = readJsonStrict(manifestPath);
  requireExactKeys(
    manifest.acceptanceEvidence.projectionTool,
    [
      'identity',
      'version',
      'verifier',
      'command',
      'exactConfigBytes',
      'sourceInventory',
      'deletedRootKeysPerTree',
    ],
    'Query projection tool authority',
  );
  const verifier = requireExactKeys(
    manifest.acceptanceEvidence.projectionTool.verifier,
    ['path', 'bytes', 'sha256'],
    'Query verifier self identity',
  );
  if (
    verifier.path !== 'contracts/goldens/query/verify.mjs' ||
    verifier.bytes !== verifierSeal.bytes ||
    verifier.sha256 !== verifierSeal.sha256.slice('sha256:'.length)
  ) {
    fail('Query verifier self identity differs from the tracked bytes');
  }

  const sandbox = requireExactKeys(
    manifest.acceptanceEvidence.goSandbox,
    [
      'telemetryMode',
      'telemetryDirectory',
      'wrapper',
      'profile',
      'cleanEnvironmentExecutable',
      'environment',
      'wrapperPrefixArgv',
      'externalCollectionOwnerPaused',
      'recoveryHistory',
    ],
    'Query Go sandbox authority',
  );
  requireExactKeys(
    sandbox.profile,
    ['text', 'sha256'],
    'Query Go sandbox profile',
  );
  requireExactKeys(
    sandbox.environment,
    QUERY_GO_ENVIRONMENT_KEYS,
    'Query Go sandbox environment',
  );
  const manifestEnvironment = queryManifestEnvironment();
  const manifestWrapperPrefix = queryGoWrapperPrefix(manifestEnvironment);
  if (
    sandbox.telemetryMode !== 'local' ||
    sandbox.telemetryDirectory !==
      '/Users/luca/Library/Application Support/go/telemetry' ||
    sandbox.wrapper !== SANDBOX_EXECUTABLE ||
    sandbox.cleanEnvironmentExecutable !== '/usr/bin/env' ||
    sandbox.externalCollectionOwnerPaused !== true ||
    sandbox.profile.text !== QUERY_GO_SANDBOX_PROFILE ||
    sandbox.profile.sha256 !== QUERY_GO_SANDBOX_PROFILE_SHA256 ||
    sha256Bytes(Buffer.from(sandbox.profile.text, 'utf8')) !==
      `sha256:${sandbox.profile.sha256}` ||
    JSON.stringify(sandbox.environment) !==
      JSON.stringify(manifestEnvironment) ||
    !isDeepStrictEqual(sandbox.wrapperPrefixArgv, manifestWrapperPrefix)
  ) {
    fail('Query Go sandbox profile/environment authority drifted');
  }

  const go = requireExactKeys(
    manifest.codegen.go,
    [
      'identity',
      'version',
      'runtimeDependency',
      'source',
      'primaryGeneration',
      'deterministicReplayChildArgv',
      'wrapperPrefixArgv',
      'moduleInputs',
      'module',
      'output',
    ],
    'Query Go codegen authority',
  );
  if (
    go.identity !==
      'github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen' ||
    go.version !== 'v2.8.0' ||
    go.runtimeDependency !== 'github.com/oapi-codegen/runtime@v1.1.2' ||
    go.source !==
      'contracts/goldens/query/.tmp/codegen-a/query.bundle.json'
  ) {
    fail('Query Go generator identity/source drifted');
  }
  const childArgv = queryGoChildArgv();
  requireExactKeys(
    go.primaryGeneration,
    ['childArgv', 'wrapperArgv', 'status'],
    'Query primary generation plan',
  );
  requireExactValue(
    go.primaryGeneration.childArgv,
    childArgv.primaryGeneration,
    'Query primary generation child argv',
  );
  requireExactValue(
    go.deterministicReplayChildArgv,
    childArgv.deterministicReplay,
    'Query deterministic replay child argv',
  );
  requireExactValue(
    go.wrapperPrefixArgv,
    manifestWrapperPrefix,
    'Query Go wrapper prefix',
  );
  requireExactValue(
    go.primaryGeneration.wrapperArgv,
    [...manifestWrapperPrefix, ...childArgv.primaryGeneration],
    'Query primary generation wrapper argv',
  );
  if (go.primaryGeneration.status !== 0) {
    fail('Query primary generation static status is not zero');
  }
  validateQueryGoOutputAuthority(go, childArgv);
  const moduleAuthority = validateQueryModuleAuthority(
    roots.candidateRoot,
    go,
  );
  const runtimeEnvironment = queryRuntimeEnvironment(roots.candidateRoot);
  const runtimeWrapperPrefix = queryGoWrapperPrefix(runtimeEnvironment);
  const operations = Object.freeze(
    QUERY_GO_OPERATION_IDS.map((operation) => Object.freeze({
      childArgv: childArgv[operation],
      cwd: path.join(roots.goldenRoot, '.tmp'),
      environment: runtimeEnvironment,
      executable: childArgv[operation][0],
      moduleInputs: moduleAuthority.inputs,
      moduleSeals: Object.freeze({
        after: moduleAuthority.materialized,
        before: moduleAuthority.materialized,
      }),
      operation,
      profile: Object.freeze({
        sha256: `sha256:${QUERY_GO_SANDBOX_PROFILE_SHA256}`,
        text: QUERY_GO_SANDBOX_PROFILE,
      }),
      wrapperArgv: Object.freeze([
        ...runtimeWrapperPrefix,
        ...childArgv[operation],
      ]),
    })),
  );
  const authority = Object.freeze({
    moduleAuthority,
    operations,
    seals: trackedSeals,
  });
  trustedQueryCodegenAuthorities.add(authority);
  return authority;
}

export function assertQueryCodegenStaticAuthorityUnchanged(before, after) {
  if (
    !trustedQueryCodegenAuthorities.has(before) ||
    !trustedQueryCodegenAuthorities.has(after) ||
    !isDeepStrictEqual(before.seals, after.seals) ||
    !isDeepStrictEqual(before.operations, after.operations)
  ) {
    fail('Query codegen verifier/manifest authority changed during command');
  }
  return after;
}

export function parseQueryCodegenRuntimeSummary(
  output,
  {
    status = 0,
    truncated = false,
  } = {},
) {
  if (
    typeof output !== 'string' ||
    output.length === 0 ||
    Buffer.byteLength(output, 'utf8') > QUERY_CODEGEN_RUNTIME_MAX_BYTES ||
    output.includes('\0') ||
    output.includes('\r') ||
    truncated ||
    status !== 0
  ) {
    fail('Query codegen runtime output is absent, invalid, or truncated');
  }
  const prefixCount = output.split(QUERY_CODEGEN_RUNTIME_PREFIX).length - 1;
  const lines = output.split('\n');
  const matching = lines.filter((line) =>
    line.startsWith(QUERY_CODEGEN_RUNTIME_PREFIX));
  if (prefixCount !== 1 || matching.length !== 1) {
    fail('Query codegen runtime summary prefix is missing or duplicated');
  }
  const encoded = matching[0].slice(QUERY_CODEGEN_RUNTIME_PREFIX.length);
  if (encoded === '') {
    fail('Query codegen runtime summary JSON is absent');
  }
  const summary = parseJsonStrict(
    encoded,
    'Query codegen runtime summary',
  );
  if (JSON.stringify(summary) !== encoded) {
    fail('Query codegen runtime summary is not exact compact JSON');
  }
  requireExactKeys(summary, [
    'policy',
    'primaryGeneration',
    'deterministicReplay',
    'compileSmoke',
    'gofmt',
    'moduleFileSeals',
  ], 'Query codegen runtime summary');
  if (summary.policy !== 'go-download-progress-v1') {
    fail('Query codegen runtime summary policy drifted');
  }
  for (const operation of [
    'primaryGeneration',
    'deterministicReplay',
    'compileSmoke',
  ]) {
    const child = requireExactKeys(
      summary[operation],
      ['policy', 'accepted', 'stderrBytes', 'observedModuleVersionPairs'],
      `Query ${operation} runtime summary`,
    );
    if (
      child.policy !== 'go-download-progress-v1' ||
      child.accepted !== true ||
      child.stderrBytes !== 0 ||
      !isDeepStrictEqual(child.observedModuleVersionPairs, [])
    ) {
      fail(`Query ${operation} runtime stderr was not exactly empty`);
    }
  }
  const gofmt = requireExactKeys(
    summary.gofmt,
    ['accepted', 'stderrBytes'],
    'Query gofmt runtime summary',
  );
  if (gofmt.accepted !== true || gofmt.stderrBytes !== 0) {
    fail('Query gofmt runtime stderr was not exactly empty');
  }
  const moduleSeals = requireExactKeys(
    summary.moduleFileSeals,
    ['operations', 'boundaries', 'mode', 'filesPerBoundary'],
    'Query module boundary summary',
  );
  if (
    !isDeepStrictEqual(moduleSeals.operations, QUERY_GO_OPERATION_IDS) ||
    moduleSeals.boundaries !== 8 ||
    moduleSeals.mode !== '0600' ||
    moduleSeals.filesPerBoundary !== 2
  ) {
    fail('Query codegen runtime module boundaries drifted');
  }
  return Object.freeze({
    moduleFileSeals: Object.freeze({
      boundaries: 8,
      filesPerBoundary: 2,
      mode: '0600',
      operations: QUERY_GO_OPERATION_IDS,
    }),
    operations: QUERY_GO_OPERATION_IDS,
    policy: 'go-download-progress-v1',
    stderrBytes: 0,
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

export function queryRedoclyLintCommandPlan({
  goldenRoot,
  queryNodePath,
}) {
  const projection = path.join(goldenRoot, '.tmp', 'codegen-a');
  return Object.freeze({
    args: Object.freeze([
      path.join(
        goldenRoot,
        'node_modules',
        '@redocly',
        'cli',
        'bin',
        'cli.js',
      ),
      'lint',
      path.join(projection, 'source', 'openapi', 'openapi.yaml'),
      '--config',
      path.join(projection, 'redocly.yaml'),
      '--extends',
      'recommended',
    ]),
    cwd: goldenRoot,
    environment: 'redocly',
    executable: queryNodePath,
    id: 'contracts-query-redocly-lint-codegen-a',
    timeoutMs: QUERY_GOLDEN_TIMEOUT_MS,
  });
}

export function validateQueryRedoclyLintCommandPlan(
  declaration,
  {
    goldenRoot,
    queryNodePath,
  },
) {
  const expected = queryRedoclyLintCommandPlan({
    goldenRoot,
    queryNodePath,
  });
  if (
    !declaration ||
    declaration.id !== expected.id ||
    declaration.cwd !== expected.cwd ||
    declaration.environment !== expected.environment ||
    declaration.executable !== expected.executable ||
    declaration.timeoutMs !== expected.timeoutMs ||
    !Array.isArray(declaration.args) ||
    declaration.args.length !== expected.args.length ||
    declaration.args.some(
      (argument, index) => argument !== expected.args[index],
    )
  ) {
    fail('Query Redocly lint command is not the locked codegen-a plan');
  }
  return expected;
}

export function parseQueryRedoclyLintSummary(
  output,
  {
    status = 0,
    truncated = false,
  } = {},
) {
  if (
    typeof output !== 'string' ||
    output.length === 0 ||
    output.length > 2 * 1024 * 1024 ||
    truncated
  ) {
    fail('Query Redocly lint output is absent, unbounded, or truncated');
  }
  if (status !== 0) {
    fail(`Query Redocly lint exited ${status}`);
  }
  const plain = output.replaceAll(/\u001b\[[0-?]*[ -/]*[@-~]/gu, '');
  const counts = [...plain.matchAll(/\b(\d+)\s+(errors?|warnings?)\b/giu)];
  const labelledCounts = [
    ...plain.matchAll(/\b(errors?|warnings?)\s*[:=]\s*(\d+)\b/giu),
  ];
  const summaries = [
    ...counts.map((match) => ({
      count: Number(match[1]),
      index: match.index,
      type: match[2].toLowerCase(),
    })),
    ...labelledCounts.map((match) => ({
      count: Number(match[2]),
      index: match.index,
      type: match[1].toLowerCase(),
    })),
  ].sort((left, right) => left.index - right.index);
  const warningCounts = summaries
    .filter(({ type }) => type.startsWith('warning'))
    .map(({ count }) => count);
  const errorCounts = summaries
    .filter(({ type }) => type.startsWith('error'))
    .map(({ count }) => count);
  if (
    warningCounts.length === 0 ||
    warningCounts.some((count) => !Number.isSafeInteger(count)) ||
    errorCounts.some((count) => !Number.isSafeInteger(count))
  ) {
    fail('Query Redocly lint did not report a bounded warning/error summary');
  }
  const warnings = warningCounts.at(-1);
  const errors = errorCounts.length === 0 ? 0 : errorCounts.at(-1);
  if (errors !== 0 || warnings !== 9) {
    fail(
      `Query Redocly lint reported ${errors} errors and ${warnings} warnings; ` +
        'expected 0 errors and 9 warnings',
    );
  }
  return Object.freeze({
    errors,
    status,
    warnings,
  });
}

function readQueryCommandLog(runRoot, descriptor, label) {
  if (
    !descriptor ||
    !Number.isSafeInteger(descriptor.bytes) ||
    descriptor.bytes < 0 ||
    typeof descriptor.sha256 !== 'string' ||
    !/^sha256:[0-9a-f]{64}$/u.test(descriptor.sha256) ||
    typeof descriptor.truncated !== 'boolean'
  ) {
    fail(`Query ${label} descriptor is invalid`);
  }
  const absolute = resolveRunRelative(runRoot, descriptor.path);
  const bytes = fs.readFileSync(absolute);
  if (
    bytes.length !== descriptor.bytes ||
    sha256Bytes(bytes) !== descriptor.sha256
  ) {
    fail(`Query ${label} bytes differ from command evidence`);
  }
  return Object.freeze({
    text: decodeUtf8Strict(bytes, `Query ${label}`),
    truncated: descriptor.truncated,
  });
}

function readQueryLintLog(runRoot, descriptor, label) {
  return readQueryCommandLog(runRoot, descriptor, `Redocly ${label}`);
}

export function validateQueryRedoclyLintResult({
  result,
  runRoot,
  goldenRoot,
  queryNodePath,
}) {
  const plan = queryRedoclyLintCommandPlan({
    goldenRoot,
    queryNodePath,
  });
  if (
    result?.id !== plan.id ||
    result.executable !== SANDBOX_EXECUTABLE ||
    result.status !== 0 ||
    result.signal !== null ||
    result.timedOut !== false ||
    !Array.isArray(result.args) ||
    result.args[0] !== '-p' ||
    result.args.length !== plan.args.length + 3 ||
    result.args[2] !== plan.executable ||
    result.args.slice(3).some(
      (argument, index) => argument !== plan.args[index],
    )
  ) {
    fail('Query Redocly lint result does not bind the locked executed command');
  }
  const stdout = readQueryLintLog(runRoot, result.stdout, 'stdout');
  const stderr = readQueryLintLog(runRoot, result.stderr, 'stderr');
  return parseQueryRedoclyLintSummary(
    `${stdout.text}\n${stderr.text}`,
    {
      status: result.status,
      truncated: stdout.truncated || stderr.truncated,
    },
  );
}

export function validateQueryVerifyCodegenResult({
  result,
  runRoot,
  goldenRoot,
  queryNodePath,
  authority,
}) {
  if (!trustedQueryCodegenAuthorities.has(authority)) {
    fail('Query codegen result is missing its static authority');
  }
  const plan = queryVerifyCodegenCommandPlan({
    goldenRoot,
    queryNodePath,
  });
  if (
    result?.id !== plan.id ||
    result.executable !== plan.executable ||
    result.cwd !== plan.cwd ||
    result.status !== 0 ||
    result.signal !== null ||
    result.timedOut !== false ||
    !isDeepStrictEqual(result.args, plan.args)
  ) {
    fail('Query codegen result does not bind the exact direct command');
  }
  if (
    !Number.isSafeInteger(result.stdout?.bytes) ||
    result.stdout.bytes < 0 ||
    result.stdout.bytes > QUERY_CODEGEN_RUNTIME_MAX_BYTES ||
    !Number.isSafeInteger(result.stderr?.bytes) ||
    result.stderr.bytes < 0 ||
    result.stderr.bytes > QUERY_CODEGEN_RUNTIME_MAX_BYTES
  ) {
    fail('Query codegen command evidence exceeds the runtime output bound');
  }
  const stdout = readQueryCommandLog(
    runRoot,
    result.stdout,
    'codegen stdout',
  );
  const stderr = readQueryCommandLog(
    runRoot,
    result.stderr,
    'codegen stderr',
  );
  if (stderr.truncated || stderr.text !== '') {
    fail('Query codegen verifier emitted outer stderr');
  }
  const summary = parseQueryCodegenRuntimeSummary(stdout.text, {
    status: result.status,
    truncated: stdout.truncated,
  });
  if (
    authority.operations.length !== QUERY_GO_OPERATION_IDS.length ||
    authority.operations.some(
      (operation, index) =>
        operation.operation !== QUERY_GO_OPERATION_IDS[index] ||
        operation.profile.text !== QUERY_GO_SANDBOX_PROFILE ||
        operation.profile.sha256 !==
          `sha256:${QUERY_GO_SANDBOX_PROFILE_SHA256}` ||
        operation.cwd !== path.join(goldenRoot, '.tmp') ||
        operation.wrapperArgv[0] !== SANDBOX_EXECUTABLE ||
        operation.wrapperArgv[2] !== QUERY_GO_SANDBOX_PROFILE ||
        !isDeepStrictEqual(
          operation.wrapperArgv.slice(-operation.childArgv.length),
          operation.childArgv,
        ) ||
        operation.executable !== operation.childArgv[0] ||
        !isDeepStrictEqual(
          Object.keys(operation.environment),
          QUERY_GO_ENVIRONMENT_KEYS,
        ) ||
        !isDeepStrictEqual(
          operation.moduleSeals.before,
          authority.moduleAuthority.materialized,
        ) ||
        !isDeepStrictEqual(
          operation.moduleSeals.after,
          authority.moduleAuthority.materialized,
        ),
    ) ||
    !isDeepStrictEqual(summary.operations, QUERY_GO_OPERATION_IDS)
  ) {
    fail('Query codegen static operation authority did not cross-bind');
  }
  return Object.freeze({
    boundary: 'verifier-owned-inner-sandbox',
    direct: true,
    operationCount: QUERY_GO_OPERATION_IDS.length,
    profileSha256: `sha256:${QUERY_GO_SANDBOX_PROFILE_SHA256}`,
    summary,
  });
}

export function validateQueryGoldenCommandResults(results) {
  const observedCommandIds = Array.isArray(results)
    ? results.map((result) => result?.id)
    : [];
  if (
    observedCommandIds.length !== QUERY_GOLDEN_COMMAND_IDS.length ||
    observedCommandIds.some(
      (id, index) => id !== QUERY_GOLDEN_COMMAND_IDS[index],
    )
  ) {
    fail('Query golden command order is not the closed owner sequence');
  }
  return Object.freeze([...observedCommandIds]);
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
  trackedAuthority,
  initialCodegenAuthority,
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
  const runVerify = (id, args) =>
    networklessCommand({
      id,
      executable: tools.queryNode.path,
      args: [path.join(seededNpm.root, 'verify.mjs'), ...args],
      cwd: seededNpm.root,
      environment: queryEnvironment,
      timeoutMs: QUERY_GOLDEN_TIMEOUT_MS,
      budgets,
      runRoot,
      profile: querySandbox,
    });
  const verify = async (id, args) => {
    results.push(await runVerify(id, args));
  };
  const cleanupResult = await settleQueryOwnerCommandCleanup({
    operation: async () => {
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
      await verify('contracts-query-verify', []);
      await verify(
        'contracts-query-cleanup-safety',
        ['--verify-cleanup-safety'],
      );
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
      const lintPlan = validateQueryRedoclyLintCommandPlan(
        queryRedoclyLintCommandPlan({
          goldenRoot: seededNpm.root,
          queryNodePath: tools.queryNode.path,
        }),
        {
          goldenRoot: seededNpm.root,
          queryNodePath: tools.queryNode.path,
        },
      );
      const lintResult = await networklessCommand({
        ...lintPlan,
        environment:
          lintPlan.environment === 'redocly'
            ? redoclyEnvironment
            : undefined,
        budgets,
        runRoot,
        profile: querySandbox,
      });
      results.push(lintResult);
      try {
        validateQueryRedoclyLintResult({
          result: lintResult,
          runRoot,
          goldenRoot: seededNpm.root,
          queryNodePath: tools.queryNode.path,
        });
      } catch (error) {
        if (
          error !== null &&
          typeof error === 'object' &&
          error.result === undefined
        ) {
          error.result = lintResult;
        }
        throw error;
      }
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
      const directPlan = validateQueryVerifyCodegenCommandPlan(
        queryVerifyCodegenCommandPlan({
          goldenRoot: seededNpm.root,
          queryNodePath: tools.queryNode.path,
        }),
        {
          goldenRoot: seededNpm.root,
          queryNodePath: tools.queryNode.path,
        },
      );
      const authorityBefore = validateQueryCodegenStaticAuthority({
        goldenRoot: seededNpm.root,
        trackedAuthority,
      });
      assertQueryCodegenStaticAuthorityUnchanged(
        initialCodegenAuthority,
        authorityBefore,
      );
      let directResult;
      let directError;
      try {
        directResult = await runCommand({
          ...directPlan,
          environment:
            directPlan.environment === 'query'
              ? queryEnvironment
              : undefined,
          gracefulStopMs: budgets.timeouts.gracefulStopMs,
          runRoot,
        });
        results.push(directResult);
        validateQueryVerifyCodegenResult({
          result: directResult,
          runRoot,
          goldenRoot: seededNpm.root,
          queryNodePath: tools.queryNode.path,
          authority: authorityBefore,
        });
      } catch (error) {
        if (
          directResult &&
          error !== null &&
          typeof error === 'object' &&
          error.result === undefined
        ) {
          error.result = directResult;
        }
        directError = error;
      }
      try {
        const authorityAfter = validateQueryCodegenStaticAuthority({
          goldenRoot: seededNpm.root,
          trackedAuthority,
        });
        assertQueryCodegenStaticAuthorityUnchanged(
          authorityBefore,
          authorityAfter,
        );
        assertQueryCodegenStaticAuthorityUnchanged(
          initialCodegenAuthority,
          authorityAfter,
        );
      } catch (authorityError) {
        if (
          directError !== undefined &&
          directError !== null &&
          typeof directError === 'object'
        ) {
          try {
            Object.defineProperty(directError, 'queryCodegenAuthority', {
              configurable: true,
              enumerable: true,
              value: Object.freeze({
                message: authorityError.message,
                status: 'failed',
              }),
            });
          } catch {
            // Preserve the originating direct-command failure.
          }
          throw directError;
        }
        if (
          directResult &&
          authorityError !== null &&
          typeof authorityError === 'object' &&
          authorityError.result === undefined
        ) {
          authorityError.result = directResult;
        }
        throw authorityError;
      }
      if (directError !== undefined) throw directError;
      await verifyRuntimeClosures(toolAttestation, QUERY_RUNTIME_NAMES);
    },
    cleanup: () =>
      runVerify('contracts-query-cleanup', ['--cleanup-generated']),
  });
  results.push(cleanupResult);
  validateQueryGoldenCommandResults(results);
  return results;
}

export function archiveVerifierEnvironment({
  npmCache,
  runRoot,
  schemaRoot,
  tools,
}) {
  if (!tools?.go?.path || !tools?.node?.path || !tools?.python?.path) {
    fail('Archive verifier requires admitted Go, Node, and CPython tools');
  }
  const goCache = path.join(schemaRoot, '.cache', 'go-mod');
  return Object.freeze({
    ...commandEnvironment({
      runRoot,
      pathEntries: [
        path.dirname(tools.go.path),
        path.dirname(tools.node.path),
        path.dirname(tools.python.path),
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
        GOWORK: 'off',
        NPM_CONFIG_CACHE: npmCache,
        REDOCLY_TELEMETRY: 'off',
      },
    }),
    TMPDIR: path.join(schemaRoot, '.tmp', 'system'),
    npm_config_cache: npmCache,
    npm_config_engine_strict: 'true',
  });
}

export function archiveVerifierCommandPlan({
  toolingRoot,
  currentNodePath,
}) {
  const root = requireCanonicalPath(toolingRoot, {
    label: 'Archive verifier tooling root',
    type: 'directory',
  });
  if (
    path.basename(root) !== 'tooling' ||
    path.basename(path.dirname(root)) !== 'archive'
  ) {
    fail('Archive verifier tooling root is outside its exact owner path');
  }
  return Object.freeze({
    args: Object.freeze([path.join(root, 'verify.mjs')]),
    cwd: root,
    environment: 'archive',
    executable: currentNodePath,
    id: ARCHIVE_VERIFY_DIRECT_ID,
    timeoutMs: ARCHIVE_VERIFY_TIMEOUT_MS,
  });
}

export function validateArchiveVerifierCommandPlan(
  declaration,
  {
    toolingRoot,
    currentNodePath,
  },
) {
  const expected = archiveVerifierCommandPlan({
    toolingRoot,
    currentNodePath,
  });
  if (
    !declaration ||
    declaration.id !== expected.id ||
    declaration.cwd !== expected.cwd ||
    declaration.environment !== expected.environment ||
    declaration.executable !== expected.executable ||
    declaration.timeoutMs !== expected.timeoutMs ||
    !isDeepStrictEqual(declaration.args, expected.args)
  ) {
    fail('Archive verifier is not the exact direct command plan');
  }
  return expected;
}

export async function executeArchiveVerifierDirect({
  toolingRoot,
  schemaRoot,
  npmCache,
  tools,
  budgets,
  runRoot,
}) {
  const plan = validateArchiveVerifierCommandPlan(
    archiveVerifierCommandPlan({
      toolingRoot,
      currentNodePath: tools.node.path,
    }),
    {
      toolingRoot,
      currentNodePath: tools.node.path,
    },
  );
  const environment = archiveVerifierEnvironment({
    npmCache,
    runRoot,
    schemaRoot,
    tools,
  });
  const result = await runCommand({
    ...plan,
    environment:
      plan.environment === 'archive'
        ? environment
        : undefined,
    gracefulStopMs: budgets.timeouts.gracefulStopMs,
    maxOutputBytes: ARCHIVE_VERIFY_REPORT_MAX_BYTES,
    runRoot,
  });
  return Object.freeze({ environment, plan, result });
}

function archiveVerifierRoots(toolingRoot) {
  const root = requireCanonicalPath(toolingRoot, {
    label: 'Archive verifier tooling root',
    type: 'directory',
  });
  const schemaRoot = path.dirname(root);
  const candidateRoot = path.resolve(schemaRoot, '..', '..', '..');
  if (
    path.join(
      candidateRoot,
      'contracts',
      'schemas',
      'archive',
      'tooling',
    ) !== root
  ) {
    fail('Archive verifier is outside the exact candidate path');
  }
  return Object.freeze({
    candidateRoot,
    goldenRoot: path.join(candidateRoot, 'contracts', 'goldens', 'archive'),
    schemaRoot,
    toolingRoot: root,
  });
}

function archiveGoSandboxProfile(telemetryDirectory) {
  return [
    '(version 1)',
    '(allow default)',
    '(deny network*)',
    `(deny file-write* (subpath "${sandboxLiteral(telemetryDirectory)}"))`,
  ].join('');
}

function archiveExpectedGoSandboxedCommands({
  toolingRoot,
  goExecutable,
  gofmtExecutable,
  profile,
}) {
  const roots = archiveVerifierRoots(toolingRoot);
  const codegenRoot = path.join(roots.schemaRoot, '.tmp', 'codegen');
  const records = [
    {
      executable: goExecutable,
      args: [
        'env',
        'GOCACHE',
        'GOMODCACHE',
        'GOPATH',
        'GOWORK',
        'GOENV',
        'GOTOOLCHAIN',
      ],
      cwd: roots.candidateRoot,
      wrapper: SANDBOX_EXECUTABLE,
      profile,
    },
    {
      executable: goExecutable,
      args: ['version'],
      cwd: roots.candidateRoot,
      wrapper: SANDBOX_EXECUTABLE,
      profile,
    },
  ];
  for (const schemaName of ARCHIVE_SCHEMA_NAMES) {
    const goRoot = path.join(codegenRoot, schemaName, 'go');
    records.push(
      {
        executable: gofmtExecutable,
        args: ['-w', path.join(goRoot, 'model.go')],
        cwd: roots.candidateRoot,
        wrapper: SANDBOX_EXECUTABLE,
        profile,
      },
      {
        executable: goExecutable,
        args: ['test', './...'],
        cwd: goRoot,
        wrapper: SANDBOX_EXECUTABLE,
        profile,
      },
    );
  }
  const probeRoot = path.join(
    roots.schemaRoot,
    '.tmp',
    'manifest-string-semantics',
    'go',
  );
  records.push(
    {
      executable: gofmtExecutable,
      args: ['-w', path.join(probeRoot, 'main.go')],
      cwd: roots.candidateRoot,
      wrapper: SANDBOX_EXECUTABLE,
      profile,
    },
    {
      executable: goExecutable,
      args: [
        'run',
        '.',
        path.join(
          roots.goldenRoot,
          'vectors',
          'manifest-string-semantics.json',
        ),
        path.join(
          roots.goldenRoot,
          'valid',
          'minimal',
          'archive-manifest.json',
        ),
        path.join(
          roots.schemaRoot,
          '.tmp',
          'manifest-string-semantics',
          'manifest-invalid-raw-utf8.json',
        ),
      ],
      cwd: probeRoot,
      wrapper: SANDBOX_EXECUTABLE,
      profile,
    },
  );
  if (records.length !== 16) {
    fail('Archive Go command plan does not contain exactly sixteen records');
  }
  return Object.freeze(records.map((record) => Object.freeze({
    ...record,
    args: Object.freeze(record.args),
  })));
}

function validateArchiveTelemetryDiagnostic(value, label) {
  if (value?.ok === true) {
    requireExactKeys(
      value,
      ['ok', 'digest', 'fileCount', 'byteCount'],
      label,
    );
    if (
      typeof value.digest !== 'string' ||
      !/^[0-9a-f]{64}$/u.test(value.digest) ||
      !Number.isSafeInteger(value.fileCount) ||
      value.fileCount < 0 ||
      !Number.isSafeInteger(value.byteCount) ||
      value.byteCount < 0
    ) {
      fail(`${label} successful seal is invalid`);
    }
    return value;
  }
  requireExactKeys(value, ['ok', 'error'], label);
  if (
    value.ok !== false ||
    typeof value.error !== 'string' ||
    value.error.length < 1 ||
    value.error.length > 4096 ||
    value.error.includes('\0')
  ) {
    fail(`${label} failed diagnostic is invalid`);
  }
  return value;
}

export function validateArchiveVerifierReport({
  report,
  toolingRoot,
  tools,
  environment,
}) {
  requireExactKeys(report, [
    'environment',
    'strictJson',
    'schemaCount',
    'schemaInventory',
    'installedTools',
    'ddl',
    'goldens',
    'codegen',
  ], 'Archive verifier report');
  requireExactKeys(
    report.environment,
    ['nodeVersion', 'npmVersion'],
    'Archive verifier environment report',
  );
  if (
    report.environment.nodeVersion !== tools.node.version ||
    report.environment.npmVersion !== tools.npm.version ||
    report.schemaCount !== 6 ||
    report.schemaInventory !== 13
  ) {
    fail('Archive verifier report identity/count drifted');
  }
  requireExactKeys(
    report.strictJson,
    ['categories', 'rejectedBytes'],
    'Archive strict JSON report',
  );
  if (
    !isDeepStrictEqual(report.strictJson.categories, [
      'manifest',
      'pointer',
      'index',
      'vector',
      'matrix',
      'schema',
      'package',
      'lockfile',
      'producer-case',
      'producer-index',
    ]) ||
    report.strictJson.rejectedBytes !== 14
  ) {
    fail('Archive strict JSON self-test report drifted');
  }
  requireExactKeys(report.ddl, [
    'dataVersion',
    'inspection',
    'python',
    'rawDomains',
    'schemaObjectSelfTest',
    'sqlite',
    'staffSetKeyBounds',
    'subjectSemantics',
  ], 'Archive DDL/builder report');
  requireExactKeys(report.goldens, [
    'indexDigest',
    'sortedPathDigestSeal',
    'indexedFiles',
    'cases',
    'manifestStrings',
    'producer',
  ], 'Archive golden report');
  requireExactKeys(report.goldens.manifestStrings, [
    'outcome',
    'formats',
    'stringCaseCount',
    'node',
    'python',
  ], 'Archive manifest-string golden report');
  requireExactKeys(report.goldens.producer, [
    'indexDigest',
    'indexedFiles',
    'cases',
    'files',
    'rawDomains',
    'danglingReference',
    'reports',
  ], 'Archive producer golden report');
  if (
    report.goldens.indexedFiles !== 32 ||
    report.goldens.cases !== 16 ||
    report.goldens.manifestStrings.outcome !== 'VALID' ||
    report.goldens.producer.indexedFiles !== 15 ||
    report.goldens.producer.cases !== 15 ||
    !Array.isArray(report.goldens.producer.files) ||
    report.goldens.producer.files.length !== 15 ||
    !Array.isArray(report.goldens.producer.reports) ||
    report.goldens.producer.reports.length !== 15
  ) {
    fail('Archive golden corpus counts/outcome drifted');
  }
  requireExactKeys(
    report.installedTools,
    ['quicktypeVersions', 'streamJsonVersions', 'parserAsStream'],
    'Archive installed tool report',
  );
  if (
    !isDeepStrictEqual(report.installedTools.quicktypeVersions, ['26.0.0']) ||
    !isDeepStrictEqual(report.installedTools.streamJsonVersions, ['2.1.0']) ||
    report.installedTools.parserAsStream !== 'function'
  ) {
    fail('Archive installed tool versions drifted');
  }
  const codegen = requireExactKeys(report.codegen, [
    'schemas',
    'quicktypeVersion',
    'goVersion',
    'effectiveGoEnvironment',
    'goExecutable',
    'goTelemetryMode',
    'goTelemetryDirectory',
    'goTelemetryDiagnostics',
    'goSandboxWrapper',
    'goSandboxBootstrapProfile',
    'goSandboxDiscoveryCommand',
    'goSandboxProfile',
    'goSandboxPolicySelfTest',
    'goSandboxIgnoredEnvironmentKeys',
    'goSandboxedCommands',
    'manifestStrings',
  ], 'Archive codegen report');
  if (
    !isDeepStrictEqual(codegen.schemas, ARCHIVE_SCHEMA_NAMES) ||
    codegen.quicktypeVersion !== ARCHIVE_QUICKTYPE_VERSION ||
    codegen.goVersion !== tools.go.version ||
    codegen.goTelemetryMode !== 'off' &&
      codegen.goTelemetryMode !== 'local'
  ) {
    fail('Archive schema/tool/codegen identity drifted');
  }
  const roots = archiveVerifierRoots(toolingRoot);
  const expectedGoExecutable = fs.realpathSync.native(tools.go.path);
  const expectedGofmtExecutable = fs.realpathSync.native(
    path.join(path.dirname(expectedGoExecutable), 'gofmt'),
  );
  const telemetryDirectory = requireCanonicalPath(
    codegen.goTelemetryDirectory,
    {
      label: 'Archive Go telemetry directory',
      type: 'directory',
    },
  );
  const profile = archiveGoSandboxProfile(telemetryDirectory);
  const expectedEnvironment = [
    fs.realpathSync.native(environment.GOCACHE),
    fs.realpathSync.native(environment.GOMODCACHE),
    fs.realpathSync.native(environment.GOPATH),
    'off',
    '',
    'local',
  ];
  if (
    codegen.goExecutable !== expectedGoExecutable ||
    !isDeepStrictEqual(codegen.effectiveGoEnvironment, expectedEnvironment) ||
    codegen.goSandboxWrapper !== SANDBOX_EXECUTABLE ||
    codegen.goSandboxBootstrapProfile !== ARCHIVE_BOOTSTRAP_PROFILE ||
    codegen.goSandboxProfile !== profile
  ) {
    fail('Archive effective Go/bootstrap/profile authority drifted');
  }
  const discoveryCommand = [
    '-p',
    ARCHIVE_BOOTSTRAP_PROFILE,
    '/usr/bin/env',
    'GOENV=off',
    'GOWORK=off',
    'GOTOOLCHAIN=local',
    expectedGoExecutable,
    'env',
    'GOTELEMETRY',
    'GOTELEMETRYDIR',
  ];
  if (!isDeepStrictEqual(codegen.goSandboxDiscoveryCommand, discoveryCommand)) {
    fail('Archive Go telemetry discovery argv drifted');
  }
  const policy = requireExactKeys(codegen.goSandboxPolicySelfTest, [
    'acceptedDiscoveryModes',
    'directlyWrappedExecutables',
    'unconditionalDirectWrapper',
    'forgedEnvironmentKeys',
    'environmentBypassAccepted',
  ], 'Archive Go sandbox policy self-test');
  if (
    !isDeepStrictEqual(policy.acceptedDiscoveryModes, ['off', 'local']) ||
    !isDeepStrictEqual(
      policy.directlyWrappedExecutables,
      [expectedGoExecutable, expectedGofmtExecutable],
    ) ||
    policy.unconditionalDirectWrapper !== true ||
    !isDeepStrictEqual(
      policy.forgedEnvironmentKeys,
      ARCHIVE_FORGED_GO_ENVIRONMENT_KEYS,
    ) ||
    policy.environmentBypassAccepted !== false ||
    !isDeepStrictEqual(
      codegen.goSandboxIgnoredEnvironmentKeys,
      [],
    )
  ) {
    fail('Archive Go sandbox policy/forged-environment authority drifted');
  }
  const diagnostics = requireExactKeys(
    codegen.goTelemetryDiagnostics,
    ['before', 'after', 'changed'],
    'Archive Go telemetry diagnostics',
  );
  validateArchiveTelemetryDiagnostic(
    diagnostics.before,
    'Archive Go telemetry before diagnostic',
  );
  validateArchiveTelemetryDiagnostic(
    diagnostics.after,
    'Archive Go telemetry after diagnostic',
  );
  if (
    typeof diagnostics.changed !== 'boolean' ||
    diagnostics.changed ===
      isDeepStrictEqual(diagnostics.before, diagnostics.after)
  ) {
    fail('Archive Go telemetry changed diagnostic is inconsistent');
  }
  const expectedCommands = archiveExpectedGoSandboxedCommands({
    toolingRoot: roots.toolingRoot,
    goExecutable: expectedGoExecutable,
    gofmtExecutable: expectedGofmtExecutable,
    profile,
  });
  const commandMismatchIndex = Array.isArray(codegen.goSandboxedCommands)
    ? codegen.goSandboxedCommands.findIndex(
      (command, index) =>
        ['executable', 'args', 'cwd', 'wrapper', 'profile'].some(
          (field) => !isDeepStrictEqual(
            command?.[field],
            expectedCommands[index]?.[field],
          ),
        ),
    )
    : -1;
  const commandMismatchField = commandMismatchIndex < 0
    ? 'none'
    : ['executable', 'args', 'cwd', 'wrapper', 'profile'].find(
      (field) => !isDeepStrictEqual(
        codegen.goSandboxedCommands[commandMismatchIndex]?.[field],
        expectedCommands[commandMismatchIndex]?.[field],
      ),
    ) ?? 'shape';
  if (
    !Array.isArray(codegen.goSandboxedCommands) ||
    codegen.goSandboxedCommands.length !== 16 ||
    codegen.goSandboxedCommands.some((command) => {
      try {
        requireExactKeys(
          command,
          ['executable', 'args', 'cwd', 'wrapper', 'profile'],
          'Archive Go sandboxed command',
        );
        return false;
      } catch {
        return true;
      }
    }) ||
    commandMismatchIndex !== -1
  ) {
    fail(
      'Archive sixteen-command Go/gofmt plan drifted at ' +
        `record ${commandMismatchIndex} field ${commandMismatchField}`,
    );
  }
  return Object.freeze({
    boundary: 'verifier-owned-inner-sandbox/direct-local-children',
    direct: true,
    directLocalChildren: true,
    goSandboxedCommandCount: 16,
    kernelNetworkDeniedChildCount: 17,
    profileSha256: sha256Bytes(Buffer.from(profile, 'utf8')),
    schemaOrder: ARCHIVE_SCHEMA_NAMES,
    telemetryChanged: diagnostics.changed,
  });
}

function readArchiveCommandLog(runRoot, descriptor, label) {
  if (
    !descriptor ||
    !Number.isSafeInteger(descriptor.bytes) ||
    descriptor.bytes < 0 ||
    descriptor.bytes > ARCHIVE_VERIFY_REPORT_MAX_BYTES ||
    typeof descriptor.sha256 !== 'string' ||
    !/^sha256:[0-9a-f]{64}$/u.test(descriptor.sha256) ||
    typeof descriptor.truncated !== 'boolean'
  ) {
    fail(`Archive ${label} descriptor is invalid or unbounded`);
  }
  const absolute = resolveRunRelative(runRoot, descriptor.path);
  const bytes = fs.readFileSync(absolute);
  if (
    bytes.length !== descriptor.bytes ||
    sha256Bytes(bytes) !== descriptor.sha256
  ) {
    fail(`Archive ${label} differs from command evidence`);
  }
  return Object.freeze({
    bytes,
    text: decodeUtf8Strict(bytes, `Archive ${label}`),
    truncated: descriptor.truncated,
  });
}

export function validateArchiveVerifierResult({
  result,
  runRoot,
  toolingRoot,
  npmCache,
  tools,
  environment,
  trackedAuthority,
}) {
  if (!trustedArchiveTrackedAuthorities.has(trackedAuthority)) {
    fail('Archive verifier result is missing accepted tracked authority');
  }
  const plan = archiveVerifierCommandPlan({
    toolingRoot,
    currentNodePath: tools.node.path,
  });
  const roots = archiveVerifierRoots(toolingRoot);
  const expectedEnvironment = archiveVerifierEnvironment({
    npmCache,
    runRoot,
    schemaRoot: roots.schemaRoot,
    tools,
  });
  if (
    result?.id !== plan.id ||
    result.executable !== plan.executable ||
    result.cwd !== plan.cwd ||
    result.status !== 0 ||
    result.signal !== null ||
    result.timedOut !== false ||
    !isDeepStrictEqual(result.args, plan.args) ||
    !isDeepStrictEqual(environment, expectedEnvironment)
  ) {
    fail('Archive verifier result does not bind the exact direct command/environment');
  }
  const stdout = readArchiveCommandLog(
    runRoot,
    result.stdout,
    'verifier stdout',
  );
  const stderr = readArchiveCommandLog(
    runRoot,
    result.stderr,
    'verifier stderr',
  );
  if (
    stdout.truncated ||
    stderr.truncated ||
    stderr.bytes.length !== 0 ||
    stderr.text !== ''
  ) {
    fail('Archive verifier output was truncated or emitted outer stderr');
  }
  if (
    stdout.text.length < 2 ||
    !stdout.text.endsWith('\n') ||
    stdout.text.slice(0, -1).includes('\n') ||
    stdout.text.includes('\r') ||
    stdout.text.includes('\0')
  ) {
    fail('Archive verifier stdout is not one compact JSON report');
  }
  const encoded = stdout.text.slice(0, -1);
  const report = parseJsonStrict(encoded, 'Archive verifier report');
  if (JSON.stringify(report) !== encoded) {
    fail('Archive verifier report is not exact compact JSON');
  }
  return validateArchiveVerifierReport({
    report,
    toolingRoot,
    tools,
    environment,
  });
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
  const trackedAuthority = admitArchiveTrackedAuthority({
    candidateRoot,
  });
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
  const environment = archiveVerifierEnvironment({
    npmCache: seededNpm.cache,
    runRoot,
    schemaRoot,
    tools,
  });
  const trackedBefore = assertArchiveTrackedAuthorityFiles({
    authority: trackedAuthority,
    candidateRoot,
  });
  const dependencyBefore = await sealArchiveInstalledDependencyClosure({
    toolingRoot: seededNpm.root,
  });
  await verifyRuntimeClosures(toolAttestation, ARCHIVE_RUNTIME_NAMES);
  let execution;
  let boundary;
  let directError;
  try {
    execution = await executeArchiveVerifierDirect({
      toolingRoot: seededNpm.root,
      schemaRoot,
      npmCache: seededNpm.cache,
      tools,
      budgets,
      runRoot,
    });
    results.push(execution.result);
    boundary = validateArchiveVerifierResult({
      result: execution.result,
      runRoot,
      toolingRoot: seededNpm.root,
      npmCache: seededNpm.cache,
      tools,
      environment: execution.environment,
      trackedAuthority,
    });
  } catch (error) {
    if (
      execution?.result &&
      error !== null &&
      typeof error === 'object' &&
      error.result === undefined
    ) {
      error.result = execution.result;
    }
    directError = error;
  }
  try {
    const trackedAfter = assertArchiveTrackedAuthorityFiles({
      authority: trackedAuthority,
      candidateRoot,
    });
    assertArchiveTrackedAuthorityUnchanged(
      trackedBefore,
      trackedAfter,
    );
    const dependencyAfter = await sealArchiveInstalledDependencyClosure({
      toolingRoot: seededNpm.root,
    });
    assertArchiveInstalledDependencyClosureUnchanged(
      dependencyBefore,
      dependencyAfter,
    );
    await verifyRuntimeClosures(toolAttestation, ARCHIVE_RUNTIME_NAMES);
  } catch (authorityError) {
    if (
      directError !== undefined &&
      directError !== null &&
      typeof directError === 'object'
    ) {
      try {
        Object.defineProperty(directError, 'archiveVerifierAuthority', {
          configurable: true,
          enumerable: true,
          value: Object.freeze({
            message: authorityError.message,
            status: 'failed',
          }),
        });
      } catch {
        // Preserve the originating direct-command failure.
      }
      throw directError;
    }
    if (
      execution?.result &&
      authorityError !== null &&
      typeof authorityError === 'object' &&
      authorityError.result === undefined
    ) {
      authorityError.result = execution.result;
    }
    throw authorityError;
  }
  if (directError !== undefined) throw directError;
  return Object.freeze({
    boundary: Object.freeze({
      ...boundary,
      commandId: execution.result.id,
      environmentKeys: Object.freeze(Object.keys(environment)),
      reportSha256: execution.result.stdout.sha256,
    }),
    results: Object.freeze(results),
  });
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
  let archiveBoundary;
  let gateResult;
  let primaryError;
  try {
    const queryTrackedAuthority = admitQueryTrackedAuthority({
      candidateRoot: root,
    });
    const initialQueryCodegenAuthority =
      validateQueryCodegenStaticAuthority({
        goldenRoot: path.join(root, 'contracts', 'goldens', 'query'),
        trackedAuthority: queryTrackedAuthority,
      });
    results.push(...await runQueryGolden({
      candidateRoot: root,
      cacheRoots,
      tools,
      budgets,
      runRoot,
      runtimeRoots,
      toolAttestation,
      trackedAuthority: queryTrackedAuthority,
      initialCodegenAuthority: initialQueryCodegenAuthority,
    }));
    const archiveContract = await runArchiveContract({
      candidateRoot: root,
      cacheRoots,
      tools,
      budgets,
      runRoot,
      runtimeRoots,
      toolAttestation,
    });
    results.push(...archiveContract.results);
    archiveBoundary = archiveContract.boundary;
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
      boundary: archiveBoundary,
      summary: `${results.length} fixed Contracts verifier/install commands passed`,
    });
    gateResult = Object.freeze({
      results: Object.freeze(results),
      evidence: Object.freeze([
        declaration,
        ...allCommandEvidence(results),
      ]),
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

async function executeBackendOwnerGate({
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

export async function runBackendOwnerGate(arguments_) {
  let gateResult;
  let primaryError;
  try {
    gateResult = await executeBackendOwnerGate(arguments_);
  } catch (error) {
    primaryError = error;
  }
  return settleBackendOwnerGate({
    candidateRoot: arguments_.candidateRoot,
    runRoot: arguments_.runRoot,
    gateResult,
    primaryError,
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
