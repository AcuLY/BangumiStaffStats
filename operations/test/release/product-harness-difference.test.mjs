import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { canonicalJsonDigest } from '../../lib/canonical-json.mjs';
import { sha256 } from '../../lib/digest.mjs';
import {
  executableFromPath,
  GitRepository,
  parseRawDifferenceRecords,
} from '../../release/git.mjs';
import {
  assertProductHarnessDifferenceInventory,
  classifyProductHarnessDifferencePath,
  recomputeProductHarnessDifference,
  verifyProductHarnessDifference,
} from '../../release/product-harness-difference.mjs';

const PRODUCT = '1111111111111111111111111111111111111111';
const HARNESS = '2222222222222222222222222222222222222222';
const ZERO = '0000000000000000000000000000000000000000';
const BLOBS = Object.freeze({
  acceptance: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  archive: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  lifecycle: 'cccccccccccccccccccccccccccccccccccccccc',
  modeOnly: 'dddddddddddddddddddddddddddddddddddddddd',
  operations: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  refresh: 'ffffffffffffffffffffffffffffffffffffffff',
});

function added(path, gitBlob) {
  return {
    newGitBlob: gitBlob,
    newMode: '100644',
    oldGitBlob: ZERO,
    oldMode: '000000',
    path,
    status: 'A',
  };
}

function deleted(path, gitBlob) {
  return {
    newGitBlob: ZERO,
    newMode: '000000',
    oldGitBlob: gitBlob,
    oldMode: '100644',
    path,
    status: 'D',
  };
}

function modeOnly(path, gitBlob) {
  return {
    newGitBlob: gitBlob,
    newMode: '100755',
    oldGitBlob: gitBlob,
    oldMode: '100644',
    path,
    status: 'M',
  };
}

function legalDifference() {
  return [
    added(
      'openspec/changes/refresh-integrated-development-acceptance/tasks.md',
      BLOBS.refresh,
    ),
    modeOnly(
      'openspec/specs/contracts-development-acceptance/spec.md',
      BLOBS.modeOnly,
    ),
    added(
      'contracts/acceptance/bin/acceptance.mjs',
      BLOBS.acceptance,
    ),
    deleted(
      'openspec/changes/complete-integrated-development-acceptance/tasks.md',
      BLOBS.lifecycle,
    ),
    added(
      'openspec/changes/archive/2026-07-28-complete-integrated-development-acceptance/tasks.md',
      BLOBS.archive,
    ),
    added(
      'openspec/changes/implement-operations-foundation-and-isolated-validation/design.md',
      BLOBS.operations,
    ),
  ];
}

function fakeGit({
  ancestor = true,
  entries = legalDifference(),
} = {}) {
  return {
    async blobSha256(gitBlob) {
      return sha256(Buffer.from(`blob:${gitBlob}`, 'utf8'));
    },
    async differenceRecords(fromRevision, toRevision) {
      assert.equal(fromRevision, PRODUCT);
      assert.equal(toRevision, HARNESS);
      return entries;
    },
    async isAncestor(ancestorRevision, descendantRevision) {
      assert.equal(ancestorRevision, PRODUCT);
      assert.equal(descendantRevision, HARNESS);
      return ancestor;
    },
    async resolve(revision) {
      return revision;
    },
  };
}

function recomputeDigest(value) {
  return canonicalJsonDigest({
    entries: value.entries,
    harnessRevision: value.harnessRevision,
    nonAllowedDifferenceCount: value.nonAllowedDifferenceCount,
    productRevision: value.productRevision,
    schemaVersion: value.schemaVersion,
  });
}

test('Product to Harness recomputation closes five path classes and records A/M/D byte and mode identities', async () => {
  const inventory = await recomputeProductHarnessDifference({
    git: fakeGit(),
    harnessRevision: HARNESS,
    productRevision: PRODUCT,
  });
  assert.deepEqual(
    inventory.entries.map((entry) => entry.path),
    [...inventory.entries.map((entry) => entry.path)].sort(),
  );
  assert.deepEqual(
    new Set(inventory.entries.map((entry) => entry.status)),
    new Set(['A', 'D', 'M']),
  );
  assert.equal(inventory.nonAllowedDifferenceCount, 0);
  const modeChange = inventory.entries.find(
    (entry) =>
      entry.path ===
      'openspec/specs/contracts-development-acceptance/spec.md',
  );
  assert.equal(modeChange.oldGitBlob, modeChange.newGitBlob);
  assert.equal(modeChange.oldContentSha256, modeChange.newContentSha256);
  assert.equal(modeChange.oldMode, '100644');
  assert.equal(modeChange.newMode, '100755');
  const deletion = inventory.entries.find((entry) => entry.status === 'D');
  assert.equal(deletion.newMode, '000000');
  assert.equal(deletion.newGitBlob, ZERO);
  assert.equal(deletion.newContentSha256, null);
  assert.doesNotThrow(() =>
    assertProductHarnessDifferenceInventory(inventory),
  );
  await assert.doesNotReject(() =>
    verifyProductHarnessDifference({
      expected: inventory,
      git: fakeGit(),
      harnessRevision: HARNESS,
      productRevision: PRODUCT,
    }),
  );

  assert.equal(
    classifyProductHarnessDifferencePath(
      'contracts/acceptance/lib/runner.mjs',
    ),
    'acceptance-harness',
  );
  assert.equal(
    classifyProductHarnessDifferencePath(
      'openspec/changes/archive/2026-07-28-complete-integrated-development-acceptance/proposal.md',
    ),
    'complete-acceptance-lifecycle',
  );
  assert.equal(
    classifyProductHarnessDifferencePath(
      'openspec/changes/implement-operations-foundation-and-isolated-validation/tasks.md',
    ),
    'operations-acceptance-planning',
  );
  assert.equal(
    classifyProductHarnessDifferencePath(
      'openspec/changes/refresh-integrated-development-acceptance/design.md',
    ),
    'acceptance-refresh-planning',
  );
  assert.equal(
    classifyProductHarnessDifferencePath(
      'openspec/specs/contracts-development-acceptance/spec.md',
    ),
    'development-acceptance-main-spec',
  );
});

test('non-allowed difference count rejects missing, non-integer, nonzero, and digest-synchronized widening', async () => {
  const inventory = await recomputeProductHarnessDifference({
    git: fakeGit(),
    harnessRevision: HARNESS,
    productRevision: PRODUCT,
  });
  const variants = [];

  const missing = structuredClone(inventory);
  delete missing.nonAllowedDifferenceCount;
  variants.push(missing);

  const nonInteger = structuredClone(inventory);
  nonInteger.nonAllowedDifferenceCount = 0.5;
  nonInteger.inventoryDigest = recomputeDigest(nonInteger);
  variants.push(nonInteger);

  const widened = structuredClone(inventory);
  widened.nonAllowedDifferenceCount = 1;
  widened.inventoryDigest = recomputeDigest(widened);
  variants.push(widened);

  for (const changed of variants) {
    assert.throws(() => assertProductHarnessDifferenceInventory(changed));
    await assert.rejects(() =>
      verifyProductHarnessDifference({
        expected: changed,
        git: fakeGit(),
        harnessRevision: HARNESS,
        productRevision: PRODUCT,
      }),
    );
  }
});

test('recorded inventory rejects order, content, and canonical digest tampering', async () => {
  const inventory = await recomputeProductHarnessDifference({
    git: fakeGit(),
    harnessRevision: HARNESS,
    productRevision: PRODUCT,
  });

  const reordered = structuredClone(inventory);
  [reordered.entries[0], reordered.entries[1]] = [
    reordered.entries[1],
    reordered.entries[0],
  ];
  reordered.inventoryDigest = recomputeDigest(reordered);
  assert.throws(
    () => assertProductHarnessDifferenceInventory(reordered),
    /fixed path order/u,
  );

  const badDigest = structuredClone(inventory);
  badDigest.inventoryDigest =
    'sha256:0000000000000000000000000000000000000000000000000000000000000000';
  assert.throws(
    () => assertProductHarnessDifferenceInventory(badDigest),
    /digest is invalid/u,
  );

  const tampered = structuredClone(inventory);
  tampered.entries[0].newContentSha256 =
    'sha256:9999999999999999999999999999999999999999999999999999999999999999';
  tampered.inventoryDigest = recomputeDigest(tampered);
  await assert.rejects(
    () =>
      verifyProductHarnessDifference({
        expected: tampered,
        git: fakeGit(),
        harnessRevision: HARNESS,
        productRevision: PRODUCT,
      }),
    /differs from Git/u,
  );
});

test('recomputation rejects broken ancestry and every path outside the exact closure', async () => {
  await assert.rejects(
    () =>
      recomputeProductHarnessDifference({
        git: fakeGit({ ancestor: false }),
        harnessRevision: HARNESS,
        productRevision: PRODUCT,
      }),
    /not an ancestor/u,
  );
  for (const path of [
    'backend/cmd/api/main.go',
    'operations/release/receipt.mjs',
    'openspec/specs/unrelated/spec.md',
    'openspec/changes/refresh-integrated-development-acceptance/notes.md',
    'openspec/changes/archive/2026-07-29-complete-integrated-development-acceptance/tasks.md',
  ]) {
    await assert.rejects(
      () =>
        recomputeProductHarnessDifference({
          git: fakeGit({ entries: [added(path, BLOBS.acceptance)] }),
          harnessRevision: HARNESS,
          productRevision: PRODUCT,
        }),
      /path is not admitted/u,
    );
  }
});

test('raw Git difference parsing and recomputation reject renames, ambiguous paths, and non-regular files', async () => {
  const validRaw =
    `:000000 100644 ${ZERO} ${BLOBS.acceptance} A\0` +
    'contracts/acceptance/README.md\0' +
    `:100644 000000 ${BLOBS.lifecycle} ${ZERO} D\0` +
    'openspec/changes/complete-integrated-development-acceptance/tasks.md\0' +
    `:100644 100644 ${BLOBS.lifecycle} ${BLOBS.archive} M\0` +
    'openspec/changes/refresh-integrated-development-acceptance/design.md\0' +
    `:100644 100755 ${BLOBS.modeOnly} ${BLOBS.modeOnly} M\0` +
    'openspec/specs/contracts-development-acceptance/spec.md\0';
  assert.deepEqual(
    parseRawDifferenceRecords(validRaw),
    [
      added('contracts/acceptance/README.md', BLOBS.acceptance),
      deleted(
        'openspec/changes/complete-integrated-development-acceptance/tasks.md',
        BLOBS.lifecycle,
      ),
      {
        newGitBlob: BLOBS.archive,
        newMode: '100644',
        oldGitBlob: BLOBS.lifecycle,
        oldMode: '100644',
        path: 'openspec/changes/refresh-integrated-development-acceptance/design.md',
        status: 'M',
      },
      modeOnly(
        'openspec/specs/contracts-development-acceptance/spec.md',
        BLOBS.modeOnly,
      ),
    ],
  );
  for (const malformed of [
    `:100644 100644 ${BLOBS.lifecycle} ${BLOBS.acceptance} A\0` +
      'contracts/acceptance/malformed-add.mjs\0',
    `:100644 100644 ${BLOBS.lifecycle} ${BLOBS.archive} D\0` +
      'contracts/acceptance/malformed-delete.mjs\0',
  ]) {
    assert.throws(
      () => parseRawDifferenceRecords(malformed),
      /modes and blobs disagree/u,
    );
  }
  assert.throws(
    () =>
      parseRawDifferenceRecords(
        `:100644 100644 ${BLOBS.lifecycle} ${BLOBS.archive} R100\0` +
        'contracts/acceptance/old.mjs\0',
      ),
    /ordinary A\/M\/D/u,
  );
  assert.throws(
    () =>
      parseRawDifferenceRecords(
        `:000000 100644 ${ZERO} ${BLOBS.acceptance} A\0` +
        'contracts/acceptance/a.mjs\0orphan\0',
      ),
    /ambiguous path record/u,
  );

  const symlink = {
    ...added('contracts/acceptance/link', BLOBS.acceptance),
    newMode: '120000',
  };
  await assert.rejects(
    () =>
      recomputeProductHarnessDifference({
        git: fakeGit({ entries: [symlink] }),
        harnessRevision: HARNESS,
        productRevision: PRODUCT,
      }),
    /ordinary regular file/u,
  );
});

test('GitRepository blob hashing preserves original binary object bytes', async (t) => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'bgmss-git-blob-hash-test-'),
  );
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));
  const repositoryRoot = path.join(root, 'repository');
  const runRoot = path.join(root, 'run');
  fs.mkdirSync(repositoryRoot, { mode: 0o700 });
  fs.mkdirSync(runRoot, { mode: 0o700 });

  const git = executableFromPath('git');
  const pathEntries = [path.dirname(git), '/usr/bin', '/bin']
    .filter((entry) => fs.existsSync(entry))
    .map((entry) => fs.realpathSync.native(entry))
    .filter((entry, index, values) => values.indexOf(entry) === index);
  const environment = {
    HOME: root,
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    PATH: pathEntries.join(path.delimiter),
    TZ: 'UTC',
  };
  function runGit(argumentsList, input) {
    const result = spawnSync(git, argumentsList, {
      cwd: repositoryRoot,
      env: environment,
      input,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr.toString('utf8'));
    return result.stdout;
  }

  runGit(['init', '--quiet', '--initial-branch=fixture']);
  const bytes = Buffer.from([0, 255, 10, 128, 65, 0, 254]);
  const gitBlob = runGit(['hash-object', '-w', '--stdin'], bytes)
    .toString('ascii')
    .trim();
  const repository = new GitRepository({
    git,
    repositoryRoot,
    runRoot,
    searchPath: environment.PATH,
  });

  assert.equal(await repository.blobSha256(gitBlob), sha256(bytes));
});
