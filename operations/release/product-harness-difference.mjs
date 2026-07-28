import {
  canonicalJson,
  canonicalJsonDigest,
  deepFreeze,
} from '../lib/canonical-json.mjs';
import {
  assertGitOid,
  assertSha256,
} from '../lib/digest.mjs';

const ZERO_OBJECT_ID = '0000000000000000000000000000000000000000';
const REGULAR_MODES = new Set(['100644', '100755']);
const INVENTORY_KEYS = Object.freeze([
  'entries',
  'harnessRevision',
  'inventoryDigest',
  'nonAllowedDifferenceCount',
  'productRevision',
  'schemaVersion',
]);
const ENTRY_KEYS = Object.freeze([
  'newContentSha256',
  'newGitBlob',
  'newMode',
  'oldContentSha256',
  'oldGitBlob',
  'oldMode',
  'path',
  'status',
]);
const RAW_ENTRY_KEYS = Object.freeze([
  'newGitBlob',
  'newMode',
  'oldGitBlob',
  'oldMode',
  'path',
  'status',
]);
const COMPLETE_ACCEPTANCE_ARTIFACTS = new Set([
  '.openspec.yaml',
  'design.md',
  'proposal.md',
  'specs/contracts-development-acceptance/spec.md',
  'tasks.md',
]);
const OPERATIONS_PLANNING_ARTIFACTS = new Set([
  '.openspec.yaml',
  'design.md',
  'proposal.md',
  'specs/operations-isolated-host-validation/spec.md',
  'specs/operations-release-assembly/spec.md',
  'specs/operations-single-host-runtime/spec.md',
  'tasks.md',
]);
const REFRESH_PLANNING_ARTIFACTS = new Set([
  '.openspec.yaml',
  'design.md',
  'proposal.md',
  'specs/contracts-development-acceptance/spec.md',
  'tasks.md',
]);

const PATH_AUTHORITIES = Object.freeze({
  acceptanceHarness: 'contracts/acceptance/',
  activeCompleteAcceptance:
    'openspec/changes/complete-integrated-development-acceptance/',
  archivedCompleteAcceptance:
    'openspec/changes/archive/2026-07-28-complete-integrated-development-acceptance/',
  operationsPlanning:
    'openspec/changes/implement-operations-foundation-and-isolated-validation/',
  refreshPlanning:
    'openspec/changes/refresh-integrated-development-acceptance/',
  rootAcceptanceSpec:
    'openspec/specs/contracts-development-acceptance/spec.md',
});

export const PRODUCT_HARNESS_DIFFERENCE_SCHEMA_VERSION =
  'operations-product-harness-difference-v1';

export class ProductHarnessDifferenceError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'ProductHarnessDifferenceError';
  }
}

function fail(message, cause) {
  throw new ProductHarnessDifferenceError(
    message,
    cause ? { cause } : undefined,
  );
}

function assertExactKeys(value, expected, label) {
  const prototype =
    value === null || typeof value !== 'object'
      ? undefined
      : Object.getPrototypeOf(value);
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    (prototype !== null && prototype !== Object.prototype) ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) {
    fail(`${label} must be one closed object`);
  }
  const keys = Object.keys(value).sort();
  if (
    keys.length !== expected.length ||
    keys.some((key, index) => key !== expected[index])
  ) {
    fail(`${label} fields are outside the closed inventory`);
  }
}

function assertCanonicalDifferencePath(relativePath) {
  if (
    typeof relativePath !== 'string' ||
    relativePath.length === 0 ||
    relativePath.length > 4096 ||
    !/^[A-Za-z0-9._/-]+$/u.test(relativePath) ||
    relativePath.startsWith('/') ||
    relativePath.endsWith('/') ||
    relativePath.includes('//') ||
    relativePath.split('/').some((entry) => entry === '.' || entry === '..')
  ) {
    fail('Product/Harness difference path is not canonical ASCII');
  }
  return relativePath;
}

function exactPlanningArtifact(relativePath, prefix, allowedArtifacts) {
  return (
    relativePath.startsWith(prefix) &&
    allowedArtifacts.has(relativePath.slice(prefix.length))
  );
}

export function classifyProductHarnessDifferencePath(relativePath) {
  const admittedPath = assertCanonicalDifferencePath(relativePath);
  if (
    admittedPath.startsWith(PATH_AUTHORITIES.acceptanceHarness) &&
    admittedPath.length > PATH_AUTHORITIES.acceptanceHarness.length
  ) {
    return 'acceptance-harness';
  }
  if (
    exactPlanningArtifact(
      admittedPath,
      PATH_AUTHORITIES.activeCompleteAcceptance,
      COMPLETE_ACCEPTANCE_ARTIFACTS,
    ) ||
    exactPlanningArtifact(
      admittedPath,
      PATH_AUTHORITIES.archivedCompleteAcceptance,
      COMPLETE_ACCEPTANCE_ARTIFACTS,
    )
  ) {
    return 'complete-acceptance-lifecycle';
  }
  if (
    exactPlanningArtifact(
      admittedPath,
      PATH_AUTHORITIES.operationsPlanning,
      OPERATIONS_PLANNING_ARTIFACTS,
    )
  ) {
    return 'operations-acceptance-planning';
  }
  if (
    exactPlanningArtifact(
      admittedPath,
      PATH_AUTHORITIES.refreshPlanning,
      REFRESH_PLANNING_ARTIFACTS,
    )
  ) {
    return 'acceptance-refresh-planning';
  }
  if (admittedPath === PATH_AUTHORITIES.rootAcceptanceSpec) {
    return 'development-acceptance-main-spec';
  }
  return null;
}

function assertBlobSide({
  contentSha256,
  gitBlob,
  mode,
  requireContent,
  side,
}) {
  if (mode === '000000') {
    if (
      gitBlob !== ZERO_OBJECT_ID ||
      (requireContent && contentSha256 !== null)
    ) {
      fail(`${side} absent blob identity is inconsistent`);
    }
    return false;
  }
  if (!REGULAR_MODES.has(mode)) {
    fail(`${side} Git mode is not one ordinary regular file`);
  }
  assertGitOid(gitBlob, `${side} Git blob`);
  if (gitBlob === ZERO_OBJECT_ID) {
    fail(`${side} Git blob must not use the absent object ID`);
  }
  if (requireContent) {
    assertSha256(contentSha256, `${side} content SHA-256`);
  }
  return true;
}

function assertEntryShape(entry, { raw = false } = {}) {
  assertExactKeys(
    entry,
    raw ? RAW_ENTRY_KEYS : ENTRY_KEYS,
    raw ? 'raw Product/Harness difference entry' : 'Product/Harness difference entry',
  );
  if (!['A', 'D', 'M'].includes(entry.status)) {
    fail('Product/Harness difference status must be exactly A, M, or D');
  }
  const path = assertCanonicalDifferencePath(entry.path);
  if (classifyProductHarnessDifferencePath(path) === null) {
    fail(`Product/Harness difference path is not admitted: ${path}`);
  }
  const oldPresent = assertBlobSide({
    contentSha256: raw ? undefined : entry.oldContentSha256,
    gitBlob: entry.oldGitBlob,
    mode: entry.oldMode,
    requireContent: !raw,
    side: 'old',
  });
  const newPresent = assertBlobSide({
    contentSha256: raw ? undefined : entry.newContentSha256,
    gitBlob: entry.newGitBlob,
    mode: entry.newMode,
    requireContent: !raw,
    side: 'new',
  });
  if (
    (entry.status === 'A' && (oldPresent || !newPresent)) ||
    (entry.status === 'D' && (!oldPresent || newPresent)) ||
    (
      entry.status === 'M' &&
      (
        !oldPresent ||
        !newPresent ||
        (
          entry.oldMode === entry.newMode &&
          entry.oldGitBlob === entry.newGitBlob
        )
      )
    )
  ) {
    fail('Product/Harness difference status disagrees with its blob identities');
  }
  if (
    !raw &&
    entry.oldGitBlob === entry.newGitBlob &&
    entry.oldContentSha256 !== entry.newContentSha256
  ) {
    fail('one Git blob cannot have two content SHA-256 identities');
  }
  return entry;
}

function comparePaths(left, right) {
  if (left.path < right.path) return -1;
  if (left.path > right.path) return 1;
  return 0;
}

function inventoryAuthority({
  entries,
  harnessRevision,
  nonAllowedDifferenceCount,
  productRevision,
}) {
  return {
    entries,
    harnessRevision,
    nonAllowedDifferenceCount,
    productRevision,
    schemaVersion: PRODUCT_HARNESS_DIFFERENCE_SCHEMA_VERSION,
  };
}

function buildInventory({
  entries,
  harnessRevision,
  productRevision,
}) {
  const authority = inventoryAuthority({
    entries,
    harnessRevision,
    nonAllowedDifferenceCount: 0,
    productRevision,
  });
  return deepFreeze({
    ...authority,
    inventoryDigest: canonicalJsonDigest(authority),
  });
}

export function assertProductHarnessDifferenceInventory(value) {
  assertExactKeys(value, INVENTORY_KEYS, 'Product/Harness difference inventory');
  if (
    value.schemaVersion !== PRODUCT_HARNESS_DIFFERENCE_SCHEMA_VERSION
  ) {
    fail('Product/Harness difference schema version is not admitted');
  }
  assertGitOid(value.productRevision, 'Product revision');
  assertGitOid(value.harnessRevision, 'Harness revision');
  if (value.productRevision === value.harnessRevision) {
    fail('Product and Harness revisions must be distinct');
  }
  if (
    !Number.isInteger(value.nonAllowedDifferenceCount) ||
    value.nonAllowedDifferenceCount !== 0
  ) {
    fail('Product/Harness non-allowed difference count must be integer zero');
  }
  if (!Array.isArray(value.entries) || value.entries.length === 0) {
    fail('Product/Harness difference inventory must not be empty');
  }
  const seen = new Set();
  let previousPath;
  for (const entry of value.entries) {
    assertEntryShape(entry);
    if (seen.has(entry.path)) {
      fail('Product/Harness difference inventory contains a duplicate path');
    }
    if (previousPath !== undefined && previousPath >= entry.path) {
      fail('Product/Harness difference inventory is not in fixed path order');
    }
    seen.add(entry.path);
    previousPath = entry.path;
  }
  assertSha256(value.inventoryDigest, 'Product/Harness inventory digest');
  const expectedDigest = canonicalJsonDigest(inventoryAuthority(value));
  if (value.inventoryDigest !== expectedDigest) {
    fail('Product/Harness difference inventory digest is invalid');
  }
  return deepFreeze(value);
}

export async function recomputeProductHarnessDifference({
  git,
  harnessRevision,
  productRevision,
}) {
  if (
    !git ||
    typeof git.resolve !== 'function' ||
    typeof git.isAncestor !== 'function' ||
    typeof git.differenceRecords !== 'function' ||
    typeof git.blobSha256 !== 'function'
  ) {
    throw new TypeError(
      'Product/Harness difference recomputation requires a GitRepository',
    );
  }
  const product = assertGitOid(
    await git.resolve(productRevision),
    'resolved Product revision',
  );
  const harness = assertGitOid(
    await git.resolve(harnessRevision),
    'resolved Harness revision',
  );
  if (product === harness) {
    fail('Harness must be a distinct descendant of Product');
  }
  if (!(await git.isAncestor(product, harness))) {
    fail('Product is not an ancestor of Harness');
  }
  const rawEntries = await git.differenceRecords(product, harness);
  if (!Array.isArray(rawEntries) || rawEntries.length === 0) {
    fail('Product/Harness Git difference is empty or unavailable');
  }
  const paths = new Set();
  const blobs = new Set();
  for (const entry of rawEntries) {
    assertEntryShape(entry, { raw: true });
    if (paths.has(entry.path)) {
      fail('Product/Harness raw Git difference contains a duplicate path');
    }
    paths.add(entry.path);
    for (const [mode, gitBlob] of [
      [entry.oldMode, entry.oldGitBlob],
      [entry.newMode, entry.newGitBlob],
    ]) {
      if (mode !== '000000') blobs.add(gitBlob);
    }
  }
  const contentDigests = new Map();
  for (const gitBlob of [...blobs].sort()) {
    contentDigests.set(
      gitBlob,
      assertSha256(
        await git.blobSha256(gitBlob),
        `Git blob ${gitBlob} content SHA-256`,
      ),
    );
  }
  const entries = rawEntries
    .map((entry) => ({
      newContentSha256:
        entry.newMode === '000000'
          ? null
          : contentDigests.get(entry.newGitBlob),
      newGitBlob: entry.newGitBlob,
      newMode: entry.newMode,
      oldContentSha256:
        entry.oldMode === '000000'
          ? null
          : contentDigests.get(entry.oldGitBlob),
      oldGitBlob: entry.oldGitBlob,
      oldMode: entry.oldMode,
      path: entry.path,
      status: entry.status,
    }))
    .sort(comparePaths)
    .map((entry) => Object.freeze(entry));
  return buildInventory({
    entries: Object.freeze(entries),
    harnessRevision: harness,
    productRevision: product,
  });
}

export async function verifyProductHarnessDifference({
  expected,
  git,
  harnessRevision,
  productRevision,
}) {
  const recorded = assertProductHarnessDifferenceInventory(expected);
  const actual = await recomputeProductHarnessDifference({
    git,
    harnessRevision: harnessRevision ?? recorded.harnessRevision,
    productRevision: productRevision ?? recorded.productRevision,
  });
  if (
    recorded.productRevision !== actual.productRevision ||
    recorded.harnessRevision !== actual.harnessRevision ||
    canonicalJson(recorded) !== canonicalJson(actual)
  ) {
    fail('recorded Product/Harness difference differs from Git');
  }
  return actual;
}
