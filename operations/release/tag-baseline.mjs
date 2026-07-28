import {
  ACCEPTANCE_ACTIONS_HEAD,
  ACCEPTANCE_ARCHIVE,
  ACCEPTANCE_IMPLEMENTATION,
  FROZEN_PRODUCT,
} from './constants.mjs';
import { assertVersionTag } from './cli.mjs';

export class TagBaselineError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'TagBaselineError';
  }
}

function fail(message, cause) {
  throw new TagBaselineError(message, cause ? { cause } : undefined);
}

function isAcceptanceLifecyclePath(relativePath) {
  return (
    relativePath ===
      'openspec/specs/contracts-development-acceptance/spec.md' ||
    relativePath.startsWith(
      'openspec/changes/complete-integrated-development-acceptance/',
    ) ||
    /^openspec\/changes\/archive\/[0-9]{4}-[0-9]{2}-[0-9]{2}-complete-integrated-development-acceptance\//u.test(
      relativePath,
    )
  );
}

function isOperationsLifecyclePath(relativePath) {
  return (
    relativePath.startsWith('operations/') ||
    [
      '.github/workflows/deploy.yml',
      '.github/workflows/operations.yml',
      '.github/workflows/release.yml',
    ].includes(relativePath) ||
    relativePath.startsWith(
      'openspec/changes/implement-operations-foundation-and-isolated-validation/',
    ) ||
    /^openspec\/changes\/archive\/[0-9]{4}-[0-9]{2}-[0-9]{2}-implement-operations-foundation-and-isolated-validation\//u.test(
      relativePath,
    ) ||
    /^openspec\/specs\/operations-(?:isolated-host-validation|release-assembly|single-host-runtime)\/spec\.md$/u.test(
      relativePath,
    )
  );
}

async function requireUnchanged(git, authority, tagCommit, relativePath, label) {
  if (await git.pathDiffers(authority, tagCommit, relativePath)) {
    fail(`${label} drifted after its accepted authority: ${relativePath}`);
  }
}

export async function verifyTagBaseline({
  acceptanceReceipt,
  git,
  tag,
}) {
  if (!git || typeof git.resolve !== 'function') {
    throw new TypeError('tag baseline verification requires a GitRepository');
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
  if (!(await git.isAncestor(FROZEN_PRODUCT.revision, tagCommit))) {
    fail('release tag does not descend from the frozen product');
  }
  for (const authority of [
    ACCEPTANCE_IMPLEMENTATION,
    ACCEPTANCE_ACTIONS_HEAD,
    ACCEPTANCE_ARCHIVE,
  ]) {
    if (!(await git.isAncestor(authority, tagCommit))) {
      fail(`release tag does not descend from accepted authority ${authority}`);
    }
  }
  const version = await git.fileAtRevision(tagCommit, 'VERSION');
  if (version.bytes !== `${releaseTag}\n`) {
    fail('release tag differs from the exact root VERSION bytes');
  }

  const changes = await git.changedPaths(FROZEN_PRODUCT.revision, tagCommit);
  for (const change of changes) {
    const relativePath = change.path;
    if (relativePath.startsWith('contracts/acceptance/')) {
      await requireUnchanged(
        git,
        ACCEPTANCE_IMPLEMENTATION,
        tagCommit,
        relativePath,
        'accepted acceptance-control path',
      );
      continue;
    }
    if (isAcceptanceLifecyclePath(relativePath)) {
      await requireUnchanged(
        git,
        ACCEPTANCE_ARCHIVE,
        tagCommit,
        relativePath,
        'archived acceptance lifecycle path',
      );
      continue;
    }
    if (relativePath === '.github/workflows/ci.yml') {
      await requireUnchanged(
        git,
        ACCEPTANCE_ACTIONS_HEAD,
        tagCommit,
        relativePath,
        'accepted CI authority',
      );
      continue;
    }
    if (
      relativePath === '.gitignore' ||
      isOperationsLifecyclePath(relativePath)
    ) {
      continue;
    }
    fail(`release tag changed a protected product/build/Contracts path: ${relativePath}`);
  }

  const frozenIgnore = await git.fileAtRevision(
    FROZEN_PRODUCT.revision,
    '.gitignore',
  );
  const tagIgnore = await git.fileAtRevision(tagCommit, '.gitignore');
  const expectedIgnore =
    `${frozenIgnore.bytes}${frozenIgnore.bytes.endsWith('\n') ? '' : '\n'}` +
    '/operations/.tmp/\n';
  if (tagIgnore.bytes !== expectedIgnore) {
    fail('tag .gitignore differs from the one accepted Operations addition');
  }
  const receiptFrozen = acceptanceReceipt.value.frozenProduct;
  if (
    receiptFrozen.revision !== FROZEN_PRODUCT.revision ||
    receiptFrozen.tree !== FROZEN_PRODUCT.tree
  ) {
    fail('accepted receipt frozen product differs from tag baseline authority');
  }
  return Object.freeze({
    releaseTag,
    revision: tagCommit,
    tree: tagTree,
  });
}
