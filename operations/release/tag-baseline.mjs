import { assertVersionTag } from './cli.mjs';
import {
  assertProductHarnessDifferenceInventory,
  classifyProductHarnessDifferencePath,
} from './product-harness-difference.mjs';

const OPERATIONS_CHANGE_ARTIFACTS = new Set([
  '.openspec.yaml',
  'design.md',
  'proposal.md',
  'specs/operations-isolated-host-validation/spec.md',
  'specs/operations-release-assembly/spec.md',
  'specs/operations-single-host-runtime/spec.md',
  'tasks.md',
]);
const OPERATIONS_MAIN_SPECS = new Set([
  'openspec/specs/operations-isolated-host-validation/spec.md',
  'openspec/specs/operations-release-assembly/spec.md',
  'openspec/specs/operations-single-host-runtime/spec.md',
]);
const REFRESH_CHANGE_ARTIFACTS = new Set([
  '.openspec.yaml',
  'design.md',
  'proposal.md',
  'specs/contracts-development-acceptance/spec.md',
  'tasks.md',
]);
const OPERATIONS_CHANGE_PREFIX =
  'openspec/changes/implement-operations-foundation-and-isolated-validation/';
const OPERATIONS_ARCHIVE_PATTERN =
  /^openspec\/changes\/archive\/[0-9]{4}-[0-9]{2}-[0-9]{2}-implement-operations-foundation-and-isolated-validation\/(.+)$/u;
const REFRESH_CHANGE_PREFIX =
  'openspec/changes/refresh-integrated-development-acceptance/';
const REFRESH_ARCHIVE_PATTERN =
  /^openspec\/changes\/archive\/[0-9]{4}-[0-9]{2}-[0-9]{2}-refresh-integrated-development-acceptance\/(.+)$/u;
const ROOT_ACCEPTANCE_SPEC =
  'openspec/specs/contracts-development-acceptance/spec.md';

export class TagBaselineError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'TagBaselineError';
  }
}

function fail(message, cause) {
  throw new TagBaselineError(message, cause ? { cause } : undefined);
}

function exactArtifact(relativePath, prefix, allowedArtifacts) {
  return (
    relativePath.startsWith(prefix) &&
    allowedArtifacts.has(relativePath.slice(prefix.length))
  );
}

function exactArchiveArtifact(relativePath, pattern, allowedArtifacts) {
  const match = pattern.exec(relativePath);
  return match !== null && allowedArtifacts.has(match[1]);
}

function isOperationsLifecyclePath(relativePath) {
  return (
    relativePath.startsWith('operations/') ||
    [
      '.github/workflows/deploy.yml',
      '.github/workflows/operations.yml',
      '.github/workflows/release.yml',
    ].includes(relativePath) ||
    exactArtifact(
      relativePath,
      OPERATIONS_CHANGE_PREFIX,
      OPERATIONS_CHANGE_ARTIFACTS,
    ) ||
    exactArchiveArtifact(
      relativePath,
      OPERATIONS_ARCHIVE_PATTERN,
      OPERATIONS_CHANGE_ARTIFACTS,
    ) ||
    OPERATIONS_MAIN_SPECS.has(relativePath)
  );
}

function isRefreshLifecyclePath(relativePath) {
  return (
    exactArtifact(
      relativePath,
      REFRESH_CHANGE_PREFIX,
      REFRESH_CHANGE_ARTIFACTS,
    ) ||
    exactArchiveArtifact(
      relativePath,
      REFRESH_ARCHIVE_PATTERN,
      REFRESH_CHANGE_ARTIFACTS,
    ) ||
    relativePath === ROOT_ACCEPTANCE_SPEC
  );
}

async function requireUnchanged(git, authority, tagCommit, relativePath, label) {
  if (await git.pathDiffers(authority, tagCommit, relativePath)) {
    fail(`${label} drifted after its accepted authority: ${relativePath}`);
  }
}

async function verifyArchiveLifecycleDelta({
  archiveProposalPath,
  archiveRevision,
  git,
  harnessRevision,
}) {
  const changed = await git.changedPaths(harnessRevision, archiveRevision);
  if (!Array.isArray(changed) || changed.length === 0) {
    fail('Harness archive lifecycle delta is empty or unavailable');
  }
  if (
    typeof archiveProposalPath !== 'string' ||
    !REFRESH_ARCHIVE_PATTERN.test(archiveProposalPath) ||
    !archiveProposalPath.endsWith('/proposal.md')
  ) {
    fail('accepted receipt does not bind one exact archived refresh proposal');
  }
  const archivePrefix = archiveProposalPath.slice(0, -'proposal.md'.length);
  const expected = new Map([
    ...[...REFRESH_CHANGE_ARTIFACTS].map((artifact) => [
      `${REFRESH_CHANGE_PREFIX}${artifact}`,
      'D',
    ]),
    ...[...REFRESH_CHANGE_ARTIFACTS].map((artifact) => [
      `${archivePrefix}${artifact}`,
      'A',
    ]),
    [ROOT_ACCEPTANCE_SPEC, 'M'],
  ]);
  const actual = new Map();
  for (const entry of changed) {
    if (
      !isRefreshLifecyclePath(entry.path) ||
      actual.has(entry.path) ||
      expected.get(entry.path) !== entry.status
    ) {
      fail(`Harness archive changed a non-refresh or wrongly typed path: ${entry.path}`);
    }
    actual.set(entry.path, entry.status);
  }
  if (
    actual.size !== expected.size ||
    [...expected].some(([path, status]) => actual.get(path) !== status)
  ) {
    fail('Harness archive lifecycle delta is not the exact refresh move and sync');
  }
  for (const artifact of REFRESH_CHANGE_ARTIFACTS) {
    const activePath = `${REFRESH_CHANGE_PREFIX}${artifact}`;
    const archivedPath = `${archivePrefix}${artifact}`;
    let active;
    let archived;
    try {
      active = await git.fileAtRevision(harnessRevision, activePath);
      archived = await git.fileAtRevision(archiveRevision, archivedPath);
    } catch (error) {
      fail('Harness archive lifecycle is missing a moved refresh artifact', error);
    }
    if (
      active.gitBlob !== archived.gitBlob ||
      active.mode !== archived.mode ||
      active.sha256 !== archived.sha256
    ) {
      fail(
        `Harness archive changed refresh artifact bytes or mode: ${artifact}`,
      );
    }
  }
  return new Set(changed.map((entry) => entry.path));
}

async function requireRegularBlob(git, revision, relativePath, label) {
  let authority;
  try {
    authority = await git.fileAtRevision(revision, relativePath);
  } catch (error) {
    fail(`${label} is absent or not an ordinary Git blob: ${relativePath}`, error);
  }
  if (
    authority.path !== relativePath ||
    authority.revision !== revision ||
    !['100644', '100755'].includes(authority.mode)
  ) {
    fail(`${label} is absent or not an ordinary Git blob: ${relativePath}`);
  }
}

async function verifyOperationsLifecycleAtTag({
  changes,
  difference,
  git,
  tagCommit,
}) {
  const expectedActivePaths = new Set(
    [...OPERATIONS_CHANGE_ARTIFACTS].map(
      (artifact) => `${OPERATIONS_CHANGE_PREFIX}${artifact}`,
    ),
  );
  const planningEntries = difference.entries.filter(
    (entry) =>
      classifyProductHarnessDifferencePath(entry.path) ===
      'operations-acceptance-planning',
  );
  if (
    planningEntries.length !== expectedActivePaths.size ||
    planningEntries.some(
      (entry) =>
        entry.status !== 'A' || !expectedActivePaths.has(entry.path),
    )
  ) {
    fail(
      'accepted receipt does not bind the exact added Operations planning artifact set',
    );
  }

  const activePaths = new Set();
  const archiveGroups = new Map();
  const mainSpecs = new Map();
  for (const change of changes) {
    if (change.path.startsWith(OPERATIONS_CHANGE_PREFIX)) {
      if (
        !expectedActivePaths.has(change.path) ||
        activePaths.has(change.path)
      ) {
        fail(`release tag contains an invalid active Operations artifact: ${change.path}`);
      }
      activePaths.add(change.path);
      continue;
    }

    const archiveMatch = OPERATIONS_ARCHIVE_PATTERN.exec(change.path);
    if (archiveMatch) {
      const artifact = archiveMatch[1];
      if (!OPERATIONS_CHANGE_ARTIFACTS.has(artifact)) {
        fail(`release tag contains an invalid archived Operations artifact: ${change.path}`);
      }
      const prefix = change.path.slice(0, -artifact.length);
      const entries = archiveGroups.get(prefix) ?? new Map();
      if (entries.has(artifact)) {
        fail(`release tag repeats an archived Operations artifact: ${change.path}`);
      }
      entries.set(artifact, change.status);
      archiveGroups.set(prefix, entries);
      continue;
    }

    if (OPERATIONS_MAIN_SPECS.has(change.path)) {
      if (mainSpecs.has(change.path)) {
        fail(`release tag repeats an Operations main spec: ${change.path}`);
      }
      mainSpecs.set(change.path, change.status);
    }
  }

  if (activePaths.size !== 0) {
    fail('release tag must not retain the active Operations change');
  }
  if (archiveGroups.size !== 1) {
    fail('release tag must contain exactly one dated Operations archive');
  }
  const [[archivePrefix, archivedArtifacts]] = archiveGroups;
  if (
    archivedArtifacts.size !== OPERATIONS_CHANGE_ARTIFACTS.size ||
    [...OPERATIONS_CHANGE_ARTIFACTS].some(
      (artifact) => archivedArtifacts.get(artifact) !== 'A',
    )
  ) {
    fail('release tag must add the complete seven-artifact Operations archive');
  }
  if (
    mainSpecs.size !== OPERATIONS_MAIN_SPECS.size ||
    [...OPERATIONS_MAIN_SPECS].some((specPath) => mainSpecs.get(specPath) !== 'A')
  ) {
    fail('release tag must add all three Operations main specs');
  }

  for (const artifact of OPERATIONS_CHANGE_ARTIFACTS) {
    await requireRegularBlob(
      git,
      tagCommit,
      `${archivePrefix}${artifact}`,
      'archived Operations artifact',
    );
  }
  for (const specPath of OPERATIONS_MAIN_SPECS) {
    await requireRegularBlob(
      git,
      tagCommit,
      specPath,
      'Operations main spec',
    );
  }
}

export async function verifyTagBaseline({
  acceptanceReceipt,
  git,
  tag,
}) {
  if (
    !git ||
    typeof git.resolve !== 'function' ||
    typeof git.changedPaths !== 'function' ||
    typeof git.pathDiffers !== 'function'
  ) {
    throw new TypeError('tag baseline verification requires a GitRepository');
  }
  if (
    !acceptanceReceipt ||
    acceptanceReceipt.value === null ||
    typeof acceptanceReceipt.value !== 'object'
  ) {
    throw new TypeError('tag baseline verification requires an accepted receipt');
  }

  const receipt = acceptanceReceipt.value;
  const product = receipt.frozenProduct;
  const harnessRevision = receipt.acceptanceControl.implementationRevision;
  const archiveRevision = receipt.acceptanceControl.archiveLifecycleCommit;
  const archiveProposalPath = receipt.authorities?.lifecycle?.find((entry) =>
    REFRESH_ARCHIVE_PATTERN.test(entry.path),
  )?.path;
  const difference = assertProductHarnessDifferenceInventory(
    receipt.acceptanceControl.productHarnessDifference,
  );
  if (
    difference.productRevision !== product.revision ||
    difference.harnessRevision !== harnessRevision ||
    receipt.actionsEvidence.headRevision !== product.revision ||
    receipt.actionsEvidence.headTree !== product.tree
  ) {
    fail('accepted receipt Product/Harness/Actions identities disagree');
  }

  const releaseTag = assertVersionTag(tag);
  const tagRef = `refs/tags/${releaseTag}`;
  const tagCommit = await git.resolve(tagRef);
  const tagTree = await git.tree(tagCommit);
  const head = await git.resolve('HEAD');
  if (head !== tagCommit || (await git.tree(head)) !== tagTree) {
    fail('release checkout HEAD must equal the protected tag commit');
  }
  await git.assertCleanCheckout({ revision: tagCommit, tree: tagTree });
  for (const [authority, label] of [
    [product.revision, 'frozen Product'],
    [harnessRevision, 'Harness implementation'],
    [archiveRevision, 'Harness archive'],
  ]) {
    if (!(await git.isAncestor(authority, tagCommit))) {
      fail(`release tag does not descend from ${label} ${authority}`);
    }
  }

  const version = await git.fileAtRevision(tagCommit, 'VERSION');
  if (version.bytes !== `${releaseTag}\n`) {
    fail('release tag differs from the exact root VERSION bytes');
  }

  const archiveDeltaPaths = await verifyArchiveLifecycleDelta({
    archiveProposalPath,
    archiveRevision,
    git,
    harnessRevision,
  });
  const requiredFinalStates = new Map();
  for (const entry of difference.entries) {
    const pathClass = classifyProductHarnessDifferencePath(entry.path);
    if (pathClass === 'operations-acceptance-planning') {
      continue;
    }
    requiredFinalStates.set(entry.path, {
      authority: harnessRevision,
      label: 'accepted Harness path',
    });
  }
  for (const relativePath of archiveDeltaPaths) {
    requiredFinalStates.set(relativePath, {
      authority: archiveRevision,
      label: 'archived acceptance lifecycle path',
    });
  }
  for (const [relativePath, required] of [...requiredFinalStates].sort(
    ([left], [right]) => left.localeCompare(right, 'en'),
  )) {
    await requireUnchanged(
      git,
      required.authority,
      tagCommit,
      relativePath,
      required.label,
    );
  }

  const changes = await git.changedPaths(product.revision, tagCommit);
  await verifyOperationsLifecycleAtTag({
    changes,
    difference,
    git,
    tagCommit,
  });
  for (const change of changes) {
    const relativePath = change.path;
    if (requiredFinalStates.has(relativePath)) continue;
    if (
      relativePath === '.gitignore' ||
      isOperationsLifecyclePath(relativePath)
    ) {
      continue;
    }
    fail(`release tag changed a protected product/build/Contracts path: ${relativePath}`);
  }

  const frozenIgnore = await git.fileAtRevision(
    product.revision,
    '.gitignore',
  );
  const tagIgnore = await git.fileAtRevision(tagCommit, '.gitignore');
  const expectedIgnore =
    `${frozenIgnore.bytes}${frozenIgnore.bytes.endsWith('\n') ? '' : '\n'}` +
    '/operations/.tmp/\n';
  if (tagIgnore.bytes !== expectedIgnore) {
    fail('tag .gitignore differs from the one accepted Operations addition');
  }

  return Object.freeze({
    acceptedDevelopmentDigest: acceptanceReceipt.digest,
    acceptanceArchiveRevision: archiveRevision,
    acceptanceImplementationRevision: harnessRevision,
    frozenProductRevision: product.revision,
    releaseTag,
    revision: tagCommit,
    tree: tagTree,
  });
}
