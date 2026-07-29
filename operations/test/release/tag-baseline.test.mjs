import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalJsonDigest } from '../../lib/canonical-json.mjs';
import { verifyTagBaseline } from '../../release/tag-baseline.mjs';

const PRODUCT = '1111111111111111111111111111111111111111';
const HARNESS = '2222222222222222222222222222222222222222';
const ARCHIVE = '3333333333333333333333333333333333333333';
const TAG = '4444444444444444444444444444444444444444';
const ZERO = '0000000000000000000000000000000000000000';
const DIGEST = `sha256:${'a'.repeat(64)}`;
const REFRESH_ARTIFACTS = [
  '.openspec.yaml',
  'design.md',
  'proposal.md',
  'specs/contracts-development-acceptance/spec.md',
  'tasks.md',
];
const OPERATIONS_ARTIFACTS = [
  '.openspec.yaml',
  'design.md',
  'proposal.md',
  'specs/operations-isolated-host-validation/spec.md',
  'specs/operations-release-assembly/spec.md',
  'specs/operations-single-host-runtime/spec.md',
  'tasks.md',
];
const OPERATIONS_MAIN_SPECS = [
  'openspec/specs/operations-isolated-host-validation/spec.md',
  'openspec/specs/operations-release-assembly/spec.md',
  'openspec/specs/operations-single-host-runtime/spec.md',
];
const ACTIVE_REFRESH =
  'openspec/changes/refresh-integrated-development-acceptance/';
const ARCHIVED_REFRESH =
  'openspec/changes/archive/2026-07-29-refresh-integrated-development-acceptance/';
const ACTIVE_OPERATIONS =
  'openspec/changes/implement-operations-foundation-and-isolated-validation/';
const ARCHIVED_OPERATIONS =
  'openspec/changes/archive/2026-07-29-implement-operations-foundation-and-isolated-validation/';

function added(path, blob) {
  return {
    newContentSha256: DIGEST,
    newGitBlob: blob,
    newMode: '100644',
    oldContentSha256: null,
    oldGitBlob: ZERO,
    oldMode: '000000',
    path,
    status: 'A',
  };
}

function modified(path, oldBlob, newBlob) {
  return {
    newContentSha256: `sha256:${'b'.repeat(64)}`,
    newGitBlob: newBlob,
    newMode: '100644',
    oldContentSha256: DIGEST,
    oldGitBlob: oldBlob,
    oldMode: '100644',
    path,
    status: 'M',
  };
}

function differenceInventory() {
  const authority = {
    entries: [
      added(
        'contracts/acceptance/README.md',
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      ),
      added(
        'openspec/changes/archive/2026-07-28-complete-integrated-development-acceptance/proposal.md',
        '9999999999999999999999999999999999999999',
      ),
      ...OPERATIONS_ARTIFACTS.map((artifact, index) =>
        added(
          `${ACTIVE_OPERATIONS}${artifact}`,
          `${index + 1}`.repeat(40),
        ),
      ),
      added(
        'openspec/changes/refresh-integrated-development-acceptance/proposal.md',
        'cccccccccccccccccccccccccccccccccccccccc',
      ),
      modified(
        'openspec/specs/contracts-development-acceptance/spec.md',
        'dddddddddddddddddddddddddddddddddddddddd',
        'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      ),
    ].sort((left, right) => left.path.localeCompare(right.path, 'en')),
    harnessRevision: HARNESS,
    nonAllowedDifferenceCount: 0,
    productRevision: PRODUCT,
    schemaVersion: 'operations-product-harness-difference-v1',
  };
  return {
    ...authority,
    inventoryDigest: canonicalJsonDigest(authority),
  };
}

function operationsLifecycleTagChanges({
  archivePrefix = ARCHIVED_OPERATIONS,
} = {}) {
  return [
    ...OPERATIONS_ARTIFACTS.map((artifact) => ({
      path: `${archivePrefix}${artifact}`,
      status: 'A',
    })),
    ...OPERATIONS_MAIN_SPECS.map((specPath) => ({
      path: specPath,
      status: 'A',
    })),
  ];
}

function acceptedTagChanges() {
  return [
    { path: '.gitignore', status: 'M' },
    { path: 'contracts/acceptance/README.md', status: 'A' },
    {
      path: 'openspec/changes/archive/2026-07-28-complete-integrated-development-acceptance/proposal.md',
      status: 'A',
    },
    {
      path: 'openspec/changes/archive/2026-07-29-refresh-integrated-development-acceptance/proposal.md',
      status: 'A',
    },
    {
      path: 'openspec/changes/refresh-integrated-development-acceptance/proposal.md',
      status: 'D',
    },
    {
      path: 'openspec/specs/contracts-development-acceptance/spec.md',
      status: 'M',
    },
    ...operationsLifecycleTagChanges(),
    { path: 'operations/release/receipt.mjs', status: 'A' },
  ];
}

function refreshArtifactIdentity(artifact) {
  const index = REFRESH_ARTIFACTS.indexOf(artifact);
  assert.notEqual(index, -1);
  const hex = (index + 1).toString(16);
  return {
    bytes: `refresh artifact ${artifact}\n`,
    gitBlob: hex.repeat(40),
    mode: '100644',
    sha256: `sha256:${hex.repeat(64)}`,
  };
}

function receipt() {
  return {
    digest: `sha256:${'f'.repeat(64)}`,
    value: {
      acceptanceControl: {
        archiveLifecycleCommit: ARCHIVE,
        implementationRevision: HARNESS,
        productHarnessDifference: differenceInventory(),
      },
      actionsEvidence: {
        headRevision: PRODUCT,
        headTree: '5555555555555555555555555555555555555555',
      },
      authorities: {
        lifecycle: [
          {
            path: `${ARCHIVED_REFRESH}proposal.md`,
          },
          {
            path: 'openspec/specs/contracts-development-acceptance/spec.md',
          },
        ],
      },
      frozenProduct: {
        revision: PRODUCT,
        tree: '5555555555555555555555555555555555555555',
      },
    },
  };
}

function fakeGit({
  archiveChanges,
  changedPaths,
  drifted = new Set(),
  harnessTagDrifted = new Set([
    'openspec/changes/implement-operations-foundation-and-isolated-validation/proposal.md',
  ]),
  missingTagFiles = new Set(),
  refreshFileOverrides = new Map(),
  tagFileModes = new Map(),
} = {}) {
  const defaultArchiveChanges = [
    ...REFRESH_ARTIFACTS.map((artifact) => ({
      path: `${ACTIVE_REFRESH}${artifact}`,
      status: 'D',
    })),
    ...REFRESH_ARTIFACTS.map((artifact) => ({
      path: `${ARCHIVED_REFRESH}${artifact}`,
      status: 'A',
    })),
    {
      path: 'openspec/specs/contracts-development-acceptance/spec.md',
      status: 'M',
    },
  ];
  const defaultTagChanges = acceptedTagChanges();
  return {
    async assertCleanCheckout({ revision, tree }) {
      assert.equal(revision, TAG);
      assert.equal(tree, '6666666666666666666666666666666666666666');
    },
    async changedPaths(fromRevision, toRevision) {
      if (fromRevision === HARNESS && toRevision === ARCHIVE) {
        return archiveChanges ?? defaultArchiveChanges;
      }
      assert.equal(fromRevision, PRODUCT);
      assert.equal(toRevision, TAG);
      return changedPaths ?? defaultTagChanges;
    },
    async fileAtRevision(revision, path) {
      if (path === 'VERSION') return { bytes: 'v0.1.0\n' };
      if (path === '.gitignore' && revision === PRODUCT) {
        return { bytes: 'node_modules/\n' };
      }
      if (path === '.gitignore' && revision === TAG) {
        return { bytes: 'node_modules/\n/operations/.tmp/\n' };
      }
      if (revision === HARNESS && path.startsWith(ACTIVE_REFRESH)) {
        const artifact = path.slice(ACTIVE_REFRESH.length);
        return {
          ...refreshArtifactIdentity(artifact),
          path,
          revision: HARNESS,
        };
      }
      if (revision === ARCHIVE && path.startsWith(ARCHIVED_REFRESH)) {
        const artifact = path.slice(ARCHIVED_REFRESH.length);
        return {
          ...refreshArtifactIdentity(artifact),
          ...refreshFileOverrides.get(path),
          path,
          revision: ARCHIVE,
        };
      }
      if (
        revision === TAG &&
        (
          path.startsWith(ARCHIVED_OPERATIONS) ||
          OPERATIONS_MAIN_SPECS.includes(path)
        ) &&
        !missingTagFiles.has(path)
      ) {
        return {
          bytes: 'reviewed Operations lifecycle artifact\n',
          gitBlob: '8888888888888888888888888888888888888888',
          mode: tagFileModes.get(path) ?? '100644',
          path,
          revision: TAG,
          sha256: `sha256:${'8'.repeat(64)}`,
        };
      }
      throw new Error(`unexpected authority lookup: ${revision}:${path}`);
    },
    async isAncestor(ancestor, descendant) {
      return (
        descendant === TAG &&
        [PRODUCT, HARNESS, ARCHIVE].includes(ancestor)
      );
    },
    async pathDiffers(authority, tagCommit, path) {
      assert.equal(tagCommit, TAG);
      return (
        drifted.has(`${authority}:${path}`) ||
        (authority === HARNESS && harnessTagDrifted.has(path))
      );
    },
    async resolve(expression) {
      if (expression === 'refs/tags/v0.1.0' || expression === 'HEAD') {
        return TAG;
      }
      return expression;
    },
    async tree(revision) {
      if (revision === TAG) {
        return '6666666666666666666666666666666666666666';
      }
      throw new Error(`unexpected tree lookup: ${revision}`);
    },
  };
}

test('tag baseline derives Product, Harness, archive, and exact path authority from the receipt', async () => {
  const result = await verifyTagBaseline({
    acceptanceReceipt: receipt(),
    git: fakeGit(),
    tag: 'v0.1.0',
  });
  assert.deepEqual(result, {
    acceptedDevelopmentDigest: `sha256:${'f'.repeat(64)}`,
    acceptanceArchiveRevision: ARCHIVE,
    acceptanceImplementationRevision: HARNESS,
    frozenProductRevision: PRODUCT,
    releaseTag: 'v0.1.0',
    revision: TAG,
    tree: '6666666666666666666666666666666666666666',
  });
});

test('tag baseline rejects receipt Actions not equal to Product', async () => {
  const changed = receipt();
  changed.value.actionsEvidence.headRevision =
    '7777777777777777777777777777777777777777';
  await assert.rejects(
    () =>
      verifyTagBaseline({
        acceptanceReceipt: changed,
        git: fakeGit(),
        tag: 'v0.1.0',
      }),
    /identities disagree/u,
  );
});

test('tag baseline rejects product, acceptance, and archive lifecycle drift', async () => {
  for (const options of [
    {
      changedPaths: [
        ...acceptedTagChanges(),
        { path: 'backend/cmd/api/main.go', status: 'M' },
      ],
      message: /protected product/u,
    },
    {
      drifted: new Set([
        `${HARNESS}:contracts/acceptance/README.md`,
      ]),
      message: /accepted Harness path drifted/u,
    },
    {
      drifted: new Set([
        `${ARCHIVE}:openspec/specs/contracts-development-acceptance/spec.md`,
      ]),
      message: /archived acceptance lifecycle path drifted/u,
    },
  ]) {
    await assert.rejects(
      () =>
        verifyTagBaseline({
          acceptanceReceipt: receipt(),
          git: fakeGit(options),
          tag: 'v0.1.0',
        }),
      options.message,
    );
  }
});

test('tag baseline admits changed receipt-declared Operations planning only through the exact lifecycle allowance', async () => {
  const result = await verifyTagBaseline({
    acceptanceReceipt: receipt(),
    git: fakeGit(),
    tag: 'v0.1.0',
  });
  assert.equal(result.revision, TAG);
});

test('tag baseline freezes every non-Operations receipt path even when deleting or reverting it removes the Product-to-tag difference', async () => {
  const changesWithoutAcceptedPaths = [
    { path: '.gitignore', status: 'M' },
    ...operationsLifecycleTagChanges(),
    { path: 'operations/release/receipt.mjs', status: 'A' },
  ];
  for (const [authority, relativePath, message] of [
    [
      HARNESS,
      'contracts/acceptance/README.md',
      /accepted Harness path drifted/u,
    ],
    [
      HARNESS,
      'openspec/changes/archive/2026-07-28-complete-integrated-development-acceptance/proposal.md',
      /accepted Harness path drifted/u,
    ],
    [
      ARCHIVE,
      `${ACTIVE_REFRESH}proposal.md`,
      /archived acceptance lifecycle path drifted/u,
    ],
    [
      ARCHIVE,
      `${ARCHIVED_REFRESH}proposal.md`,
      /archived acceptance lifecycle path drifted/u,
    ],
    [
      ARCHIVE,
      'openspec/specs/contracts-development-acceptance/spec.md',
      /archived acceptance lifecycle path drifted/u,
    ],
  ]) {
    await assert.rejects(
      () =>
        verifyTagBaseline({
          acceptanceReceipt: receipt(),
          git: fakeGit({
            changedPaths: changesWithoutAcceptedPaths,
            drifted: new Set([`${authority}:${relativePath}`]),
          }),
          tag: 'v0.1.0',
        }),
      message,
    );
  }
});

test('tag baseline rejects broad OpenSpec allowances in archive and Operations lifecycle', async () => {
  for (const options of [
    {
      archiveChanges: [
        {
          path: 'openspec/changes/refresh-integrated-development-acceptance/evidence.md',
          status: 'A',
        },
      ],
      message: /non-refresh path/u,
    },
    {
      archiveChanges: [
        {
          path: `${ACTIVE_REFRESH}proposal.md`,
          status: 'D',
        },
      ],
      message: /not the exact refresh move/u,
    },
    {
      changedPaths: [
        ...acceptedTagChanges(),
        {
          path: 'openspec/changes/implement-operations-foundation-and-isolated-validation/evidence.md',
          status: 'A',
        },
      ],
      message: /invalid active Operations artifact/u,
    },
    {
      changedPaths: [
        ...acceptedTagChanges(),
        {
          path: `${ARCHIVED_OPERATIONS}evidence.md`,
          status: 'A',
        },
      ],
      message: /invalid archived Operations artifact/u,
    },
  ]) {
    await assert.rejects(
      () =>
        verifyTagBaseline({
          acceptanceReceipt: receipt(),
          git: fakeGit(options),
          tag: 'v0.1.0',
        }),
      options.message,
    );
  }
});

test('tag baseline rejects any byte, mode, or digest drift while moving refresh artifacts into the archive', async () => {
  const archivedProposal = `${ARCHIVED_REFRESH}proposal.md`;
  for (const override of [
    { gitBlob: 'ffffffffffffffffffffffffffffffffffffffff' },
    { mode: '100755' },
    { sha256: `sha256:${'f'.repeat(64)}` },
  ]) {
    await assert.rejects(
      () =>
        verifyTagBaseline({
          acceptanceReceipt: receipt(),
          git: fakeGit({
            refreshFileOverrides: new Map([
              [archivedProposal, override],
            ]),
          }),
          tag: 'v0.1.0',
        }),
      /changed refresh artifact bytes or mode/u,
    );
  }
});

test('tag baseline requires one complete archived Operations lifecycle and no active change', async () => {
  const secondArchive =
    'openspec/changes/archive/2026-07-30-implement-operations-foundation-and-isolated-validation/';
  const missingArchiveArtifact = `${ARCHIVED_OPERATIONS}tasks.md`;
  const missingMainSpec =
    'openspec/specs/operations-single-host-runtime/spec.md';
  for (const options of [
    {
      changedPaths: acceptedTagChanges().filter(
        ({ path }) =>
          !path.startsWith(ARCHIVED_OPERATIONS) &&
          !OPERATIONS_MAIN_SPECS.includes(path),
      ),
      message: /exactly one dated Operations archive/u,
    },
    {
      changedPaths: [
        ...acceptedTagChanges(),
        { path: `${ACTIVE_OPERATIONS}proposal.md`, status: 'A' },
      ],
      message: /must not retain the active Operations change/u,
    },
    {
      changedPaths: acceptedTagChanges().filter(
        ({ path }) => path !== missingArchiveArtifact,
      ),
      message: /complete seven-artifact Operations archive/u,
    },
    {
      changedPaths: acceptedTagChanges().filter(
        ({ path }) => path !== missingMainSpec,
      ),
      message: /all three Operations main specs/u,
    },
    {
      changedPaths: [
        ...acceptedTagChanges(),
        { path: `${secondArchive}proposal.md`, status: 'A' },
      ],
      message: /exactly one dated Operations archive/u,
    },
    {
      missingTagFiles: new Set([missingArchiveArtifact]),
      message: /absent or not an ordinary Git blob/u,
    },
    {
      tagFileModes: new Map([[missingMainSpec, '120000']]),
      message: /absent or not an ordinary Git blob/u,
    },
  ]) {
    await assert.rejects(
      () =>
        verifyTagBaseline({
          acceptanceReceipt: receipt(),
          git: fakeGit(options),
          tag: 'v0.1.0',
        }),
      options.message,
    );
  }
});

test('tag baseline requires the one exact gitignore addition', async () => {
  const git = fakeGit();
  const original = git.fileAtRevision;
  git.fileAtRevision = async (revision, path) => {
    if (path === '.gitignore' && revision === TAG) {
      return { bytes: 'node_modules/\n/operations/.tmp/\nextra/\n' };
    }
    return await original(revision, path);
  };
  await assert.rejects(
    () =>
      verifyTagBaseline({
        acceptanceReceipt: receipt(),
        git,
        tag: 'v0.1.0',
      }),
    /gitignore differs/u,
  );
});
