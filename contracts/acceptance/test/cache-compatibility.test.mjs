import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  CACHE_AUTHORITY_COUNT,
  NPM_LOCK_AUTHORITY_COUNT,
  PRODUCT_PACKAGE_LOCK_PATHS,
  cacheCompatibilityResultIdentity,
  createCacheCompatibilityEnvelope,
  verifyCacheCompatibilityPhase,
} from '../lib/cache-compatibility.mjs';
import {
  canonicalJson,
  canonicalJsonDigest,
} from '../lib/canonical-json.mjs';
import { sha256Bytes } from '../lib/paths.mjs';

const ACCEPTANCE_LOCK = 'contracts/acceptance/package-lock.json';
const ORACLE_LOCK = 'frontend/package-lock.json';
const RAW_SHA256 = /^[0-9a-f]{64}$/u;
const TEST_GIT_ENVIRONMENT = Object.freeze({
  GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
  GIT_AUTHOR_EMAIL: 'acceptance@example.invalid',
  GIT_AUTHOR_NAME: 'Acceptance Test',
  GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
  GIT_COMMITTER_EMAIL: 'acceptance@example.invalid',
  GIT_COMMITTER_NAME: 'Acceptance Test',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  LANG: 'C.UTF-8',
  LC_ALL: 'C.UTF-8',
  PATH: '/usr/bin:/bin',
});

function git(repositoryRoot, ...arguments_) {
  const result = spawnSync(
    '/usr/bin/git',
    ['-C', repositoryRoot, ...arguments_],
    {
      encoding: 'utf8',
      env: TEST_GIT_ENVIRONMENT,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  assert.equal(
    result.status,
    0,
    `git ${arguments_.join(' ')} failed: ${result.stderr}`,
  );
  return result.stdout.trim();
}

function writeFile(root, relative, bytes, mode = 0o644) {
  const absolute = path.join(root, ...relative.split('/'));
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, bytes);
  fs.chmodSync(absolute, mode);
  return absolute;
}

function replaceReadOnlyFile(root, relative, bytes) {
  const absolute = path.join(root, ...relative.split('/'));
  if (fs.existsSync(absolute)) fs.chmodSync(absolute, 0o644);
  writeFile(root, relative, bytes, 0o444);
  return absolute;
}

function commit(repositoryRoot, message) {
  git(repositoryRoot, 'add', '--all');
  git(repositoryRoot, 'commit', '--quiet', '--message', message);
  return git(repositoryRoot, 'rev-parse', 'HEAD');
}

function checkout(repositoryRoot, revision) {
  git(repositoryRoot, 'checkout', '--quiet', '--detach', revision);
}

function packageLockBytes(name) {
  return Buffer.from(
    canonicalJson({
      name,
      version: '1.0.0',
      lockfileVersion: 3,
      requires: true,
      packages: {
        '': {
          name,
          version: '1.0.0',
        },
        'node_modules/example': {
          version: '1.0.0',
          resolved:
            'https://registry.npmjs.org/example/-/example-1.0.0.tgz',
          integrity:
            'sha512-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==',
        },
      },
    }),
    'utf8',
  );
}

function rawDigest(bytes) {
  return sha256Bytes(bytes).slice('sha256:'.length);
}

function reference(relative, bytes) {
  return {
    path: relative,
    sha256: rawDigest(bytes),
    byteCount: bytes.length,
  };
}

function lockRecord(relative, bytes) {
  return {
    path: relative,
    sha256: rawDigest(bytes),
    packageEntries: 2,
    resolvedIntegrityEntries: 1,
  };
}

function phaseDigest(phase) {
  return canonicalJsonDigest({
    schemaVersion: phase.schemaVersion,
    phase: phase.phase,
    revisions: phase.revisions,
    counts: phase.counts,
    authorities: phase.authorities,
    seals: phase.seals,
  });
}

function clonePhase(phase, mutate) {
  const copy = structuredClone(phase);
  mutate(copy);
  copy.authoritySetSha256 = phaseDigest(copy);
  return copy;
}

function createFixture(t, { samePreparationAndProduct = false } = {}) {
  const temporaryRoot = fs.realpathSync(
    fs.mkdtempSync(
      path.join(os.tmpdir(), 'bgmss-cache-compatibility-test-'),
    ),
  );
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  const repositoryRoot = path.join(temporaryRoot, 'repository');
  const cacheRoot = path.join(temporaryRoot, 'cache');
  fs.mkdirSync(repositoryRoot);
  fs.mkdirSync(cacheRoot);
  git(repositoryRoot, 'init', '--quiet');

  const productLockBytes = packageLockBytes('product-lock');
  const harnessLockBytes = packageLockBytes('harness-lock');
  const oracleLockBytes = packageLockBytes('oracle-lock');
  for (const relative of PRODUCT_PACKAGE_LOCK_PATHS) {
    writeFile(repositoryRoot, relative, productLockBytes);
  }
  writeFile(
    repositoryRoot,
    'backend/go.mod',
    Buffer.from('module example.invalid/acceptance\n\ngo 1.25\n', 'utf8'),
  );
  writeFile(
    repositoryRoot,
    'backend/go.sum',
    Buffer.from(
      'example.invalid/dependency v1.0.0 h1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=\n',
      'utf8',
    ),
  );
  writeFile(
    repositoryRoot,
    'updater/uv.lock',
    Buffer.from('version = 1\nrevision = 3\nrequires-python = ">=3.12"\n', 'utf8'),
  );
  const preparedFromRevision = commit(repositoryRoot, 'preparation');

  let productRevision = preparedFromRevision;
  if (!samePreparationAndProduct) {
    writeFile(
      repositoryRoot,
      'accepted-product-note.txt',
      Buffer.from('authority-neutral accepted product change\n', 'utf8'),
    );
    productRevision = commit(repositoryRoot, 'accepted product');
  }

  writeFile(repositoryRoot, ACCEPTANCE_LOCK, harnessLockBytes);
  const harnessRevision = commit(repositoryRoot, 'accepted harness');

  git(repositoryRoot, 'checkout', '--quiet', '--orphan', 'synthetic-oracle');
  for (const entry of fs.readdirSync(repositoryRoot)) {
    if (entry !== '.git') {
      fs.rmSync(path.join(repositoryRoot, entry), {
        recursive: true,
        force: true,
      });
    }
  }
  writeFile(repositoryRoot, ORACLE_LOCK, oracleLockBytes);
  const oracleRevision = commit(repositoryRoot, 'fixed oracle');
  checkout(repositoryRoot, preparedFromRevision);

  const npmSources = [
    {
      path: `locks/harness/${ACCEPTANCE_LOCK}`,
      bytes: harnessLockBytes,
    },
    {
      path: `locks/oracle/${ORACLE_LOCK}`,
      bytes: oracleLockBytes,
    },
    ...PRODUCT_PACKAGE_LOCK_PATHS.map((relative) => ({
      path: `locks/product/${relative}`,
      bytes: productLockBytes,
    })),
  ];
  const locks = npmSources.map(({ path: relative, bytes }) => {
    writeFile(cacheRoot, relative, bytes, 0o444);
    return lockRecord(relative, bytes);
  });
  const pair = {
    resolved: 'https://registry.npmjs.org/example/-/example-1.0.0.tgz',
    integrity:
      'sha512-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==',
  };
  const inventory = {
    schemaVersion: 1,
    productRevision: preparedFromRevision,
    oracleRevision,
    locks,
    pairCount: 1,
    integrityCount: 1,
    urlCount: 1,
    pairs: [pair],
  };
  const inventoryBytes = Buffer.from(
    canonicalJson(inventory).slice(0, -1),
    'utf8',
  );
  writeFile(
    cacheRoot,
    'npm-lock-inventory.json',
    inventoryBytes,
    0o444,
  );
  const inventoryReference = reference(
    'npm-lock-inventory.json',
    inventoryBytes,
  );

  const goModBytes = fs.readFileSync(
    path.join(repositoryRoot, 'backend/go.mod'),
  );
  const goSumBytes = fs.readFileSync(
    path.join(repositoryRoot, 'backend/go.sum'),
  );
  writeFile(cacheRoot, 'go/backend/go.mod', goModBytes, 0o444);
  writeFile(cacheRoot, 'go/backend/go.sum', goSumBytes, 0o444);
  const goValidation = {
    schemaVersion: 1,
    source: {},
    destination: {},
    candidateRevision: preparedFromRevision,
    goSumPath: 'backend/go.sum',
    goSumSha256: rawDigest(goSumBytes),
    marker: {},
    copySealMatchesSource: true,
    allCopiedFilesNewInodes: true,
    noSymlinks: true,
    currentToolchain: {},
    historicalQueryToolchain: {},
    offlineValidation: {},
  };
  const goValidationBytes = Buffer.from(canonicalJson(goValidation), 'utf8');
  writeFile(
    cacheRoot,
    'validation/go-cache.json',
    goValidationBytes,
    0o444,
  );
  const goValidationReference = reference(
    'validation/go-cache.json',
    goValidationBytes,
  );

  const uvLockBytes = fs.readFileSync(
    path.join(repositoryRoot, 'updater/uv.lock'),
  );
  const uvPlan = {
    schemaVersion: 1,
    candidateRevision: preparedFromRevision,
    lockPath: 'updater/uv.lock',
    lockSha256: rawDigest(uvLockBytes),
    target: {},
    sourceCache: {},
    destinationCache: {},
    selectionPolicy: 'exact-lock-closure',
    packages: [],
    simpleIndexFileCount: 0,
    archiveIds: [],
    dynamicBuildRequirements: [],
  };
  const uvPlanBytes = Buffer.from(canonicalJson(uvPlan), 'utf8');
  writeFile(cacheRoot, 'uv-closure-plan.json', uvPlanBytes, 0o444);
  const uvPlanReference = reference('uv-closure-plan.json', uvPlanBytes);
  const uvValidation = {
    schemaVersion: 1,
    source: {},
    destination: {},
    candidateRevision: preparedFromRevision,
    lockPath: 'updater/uv.lock',
    lockSha256: rawDigest(uvLockBytes),
    closurePlan: {
      path: uvPlanReference.path,
      sha256: uvPlanReference.sha256,
      registryLockPackageCount: 0,
      registryPackagesWithBytes: 0,
      markerExcludedPackages: 0,
      dynamicBuildRequirements: 0,
      archiveObjectCount: 0,
      simpleIndexFileCount: 0,
      selectionPolicy: 'exact-lock-closure',
    },
    copyPolicy: {},
    allDestinationInodesDistinctFromLocalSources: true,
    destinationSymlinkCount: 0,
    destinationHardlinkCount: 0,
    offlineSync: {},
  };
  const uvValidationBytes = Buffer.from(
    canonicalJson(uvValidation),
    'utf8',
  );
  writeFile(
    cacheRoot,
    'validation/uv-cache.json',
    uvValidationBytes,
    0o444,
  );
  const uvValidationReference = reference(
    'validation/uv-cache.json',
    uvValidationBytes,
  );

  const manifest = {
    productCandidate: { revision: preparedFromRevision },
    supplemental: {
      lockClosure: {
        inventory: inventoryReference,
        locks,
        pairCount: 1,
        integrityCount: 1,
        urlCount: 1,
      },
    },
    caches: {
      goModule: { validation: goValidationReference },
      uv: {
        validation: uvValidationReference,
        closurePlan: uvPlanReference,
      },
    },
  };
  const cacheAttestation = {
    root: cacheRoot,
    manifest,
    preparedFromRevision,
    digest: canonicalJsonDigest(manifest),
    rootSeal: sha256Bytes(Buffer.from('sealed synthetic cache root', 'utf8')),
  };
  const input = {
    product: {
      root: repositoryRoot,
      revision: productRevision,
    },
    harness: {
      root: repositoryRoot,
      revision: harnessRevision,
    },
    oracle: {
      revision: oracleRevision,
    },
  };

  function rewriteInventory(mutator) {
    mutator(inventory);
    const bytes = Buffer.from(
      canonicalJson(inventory).slice(0, -1),
      'utf8',
    );
    replaceReadOnlyFile(cacheRoot, 'npm-lock-inventory.json', bytes);
    manifest.supplemental.lockClosure.inventory = reference(
      'npm-lock-inventory.json',
      bytes,
    );
  }

  function rewriteGoValidation(mutator) {
    mutator(goValidation);
    const bytes = Buffer.from(canonicalJson(goValidation), 'utf8');
    replaceReadOnlyFile(cacheRoot, 'validation/go-cache.json', bytes);
    manifest.caches.goModule.validation = reference(
      'validation/go-cache.json',
      bytes,
    );
  }

  function rewriteUvDocuments({ mutatePlan, mutateValidation } = {}) {
    mutatePlan?.(uvPlan);
    let planBytes = Buffer.from(canonicalJson(uvPlan), 'utf8');
    replaceReadOnlyFile(cacheRoot, 'uv-closure-plan.json', planBytes);
    const planReference = reference('uv-closure-plan.json', planBytes);
    uvValidation.closurePlan.path = planReference.path;
    uvValidation.closurePlan.sha256 = planReference.sha256;
    mutateValidation?.(uvValidation);
    const validationBytes = Buffer.from(
      canonicalJson(uvValidation),
      'utf8',
    );
    replaceReadOnlyFile(
      cacheRoot,
      'validation/uv-cache.json',
      validationBytes,
    );
    manifest.caches.uv.closurePlan = planReference;
    manifest.caches.uv.validation = reference(
      'validation/uv-cache.json',
      validationBytes,
    );
    planBytes = null;
  }

  return {
    temporaryRoot,
    repositoryRoot,
    cacheRoot,
    input,
    cacheAttestation,
    manifest,
    inventory,
    goValidation,
    uvPlan,
    uvValidation,
    preparedFromRevision,
    productRevision,
    harnessRevision,
    oracleRevision,
    productLockBytes,
    harnessLockBytes,
    oracleLockBytes,
    rewriteInventory,
    rewriteGoValidation,
    rewriteUvDocuments,
  };
}

async function verify(fixture, phase = 'preAdmission') {
  return verifyCacheCompatibilityPhase({
    input: fixture.input,
    cacheAttestation: fixture.cacheAttestation,
    phase,
  });
}

for (const samePreparationAndProduct of [true, false]) {
  test(
    `the exact 16-authority proof accepts ${
      samePreparationAndProduct ? 'equal' : 'different'
    } preparation and product revisions`,
    async (t) => {
      const fixture = createFixture(t, { samePreparationAndProduct });
      const preAdmission = await verify(fixture, 'preAdmission');
      const postCleanup = await verify(fixture, 'postCleanup');
      assert.equal(
        preAdmission.revisions.preparedFromRevision,
        fixture.preparedFromRevision,
      );
      assert.equal(
        preAdmission.revisions.productRevision,
        fixture.productRevision,
      );
      assert.equal(
        preAdmission.revisions.preparedFromRevision ===
          preAdmission.revisions.productRevision,
        samePreparationAndProduct,
      );
      assert.equal(preAdmission.authorities.length, CACHE_AUTHORITY_COUNT);
      assert.deepEqual(preAdmission.counts, {
        authorities: 16,
        npmLocks: 13,
        productLocks: 11,
        goFiles: 2,
        uvLocks: 1,
      });
      assert.equal(
        preAdmission.authorities.filter(
          (authority) => authority.kind === 'npm-lock',
        ).length,
        NPM_LOCK_AUTHORITY_COUNT,
      );
      assert.notEqual(
        preAdmission.authoritySetSha256,
        postCleanup.authoritySetSha256,
        'phase identity must be part of each phase digest',
      );
      const envelope = createCacheCompatibilityEnvelope({
        preAdmission,
        postCleanup,
      });
      const evidenceSha256 = sha256Bytes(
        Buffer.from(canonicalJson(envelope), 'utf8'),
      );
      const identity = cacheCompatibilityResultIdentity({
        envelopePath: 'evidence/cache-compatibility.json',
        evidenceSha256,
        envelope,
      });
      assert.equal(identity.authorities, 16);
      assert.equal(identity.evidenceSha256, evidenceSha256);
      assert.equal(
        identity.preAdmissionAuthoritySetSha256,
        preAdmission.authoritySetSha256,
      );
      assert.equal(
        identity.postCleanupAuthoritySetSha256,
        postCleanup.authoritySetSha256,
      );
    },
  );
}

const OWNER_MUTATIONS = Object.freeze({
  product: {
    base(fixture) {
      return fixture.input.product.revision;
    },
    path: PRODUCT_PACKAGE_LOCK_PATHS[0],
    extra: 'extra-product/package-lock.json',
    update(fixture, revision) {
      fixture.input.product.revision = revision;
    },
  },
  harness: {
    base(fixture) {
      return fixture.input.harness.revision;
    },
    path: ACCEPTANCE_LOCK,
    extra: 'contracts/acceptance/extra/package-lock.json',
    update(fixture, revision) {
      fixture.input.harness.revision = revision;
    },
  },
  oracle: {
    base(fixture) {
      return fixture.input.oracle.revision;
    },
    path: ORACLE_LOCK,
    extra: 'frontend/extra/package-lock.json',
    update(fixture, revision) {
      fixture.input.oracle.revision = revision;
      fixture.rewriteInventory((inventory) => {
        inventory.oracleRevision = revision;
      });
    },
  },
});

function mutateOwnerCommit(fixture, owner, mutation) {
  const declaration = OWNER_MUTATIONS[owner];
  checkout(fixture.repositoryRoot, declaration.base(fixture));
  const absolute = path.join(
    fixture.repositoryRoot,
    ...declaration.path.split('/'),
  );
  if (mutation === 'drift') {
    writeFile(
      fixture.repositoryRoot,
      declaration.path,
      packageLockBytes(`${owner}-drift`),
    );
  } else if (mutation === 'missing') {
    fs.rmSync(absolute);
  } else if (mutation === 'extra') {
    writeFile(
      fixture.repositoryRoot,
      declaration.extra,
      packageLockBytes(`${owner}-extra`),
    );
  } else if (mutation === 'mode') {
    fs.chmodSync(absolute, 0o755);
  } else {
    assert.fail(`unknown mutation ${mutation}`);
  }
  const revision = commit(
    fixture.repositoryRoot,
    `${owner} package-lock ${mutation}`,
  );
  declaration.update(fixture, revision);
}

test('product, harness, and oracle package-lock authorities reject drift, missing, extra, and executable-mode sources', async (t) => {
  for (const owner of Object.keys(OWNER_MUTATIONS)) {
    for (const mutation of ['drift', 'missing', 'extra', 'mode']) {
      await t.test(`${owner} ${mutation}`, async (child) => {
        const fixture = createFixture(child);
        mutateOwnerCommit(fixture, owner, mutation);
        await assert.rejects(
          verify(fixture),
          /authority|package locks|bytes differ|100644/u,
        );
      });
    }
  }
});

test('manifest lock declarations reject missing, duplicate, extra, reordered, and wrong-owner records', async (t) => {
  const mutations = {
    missing(locks) {
      locks.pop();
    },
    duplicate(locks) {
      locks[2] = structuredClone(locks[1]);
    },
    extra(locks) {
      locks.push(structuredClone(locks.at(-1)));
    },
    reordered(locks) {
      [locks[0], locks[1]] = [locks[1], locks[0]];
    },
    'wrong-owner'(locks) {
      locks[0].path = locks[2].path;
    },
  };
  for (const [name, mutate] of Object.entries(mutations)) {
    await t.test(name, async (child) => {
      const fixture = createFixture(child);
      mutate(fixture.manifest.supplemental.lockClosure.locks);
      await assert.rejects(verify(fixture), /authority|lock record/u);
    });
  }
});

test('canonical npm inventory rejects missing, duplicate, extra, reordered, and wrong-owner records', async (t) => {
  const mutations = {
    missing(locks) {
      locks.pop();
    },
    duplicate(locks) {
      locks[2] = structuredClone(locks[1]);
    },
    extra(locks) {
      locks.push(structuredClone(locks.at(-1)));
    },
    reordered(locks) {
      [locks[0], locks[1]] = [locks[1], locks[0]];
    },
    'wrong-owner'(locks) {
      locks[1].path = locks[2].path;
    },
  };
  for (const [name, mutate] of Object.entries(mutations)) {
    await t.test(name, async (child) => {
      const fixture = createFixture(child);
      fixture.rewriteInventory((inventory) => mutate(inventory.locks));
      await assert.rejects(verify(fixture), /authority|lock record/u);
    });
  }
});

test('frozen npm authorities reject symlinks and hard links', async (t) => {
  await t.test('symlink', async (child) => {
    const fixture = createFixture(child);
    const relative = `locks/product/${PRODUCT_PACKAGE_LOCK_PATHS[0]}`;
    const absolute = path.join(fixture.cacheRoot, ...relative.split('/'));
    fs.unlinkSync(absolute);
    fs.symlinkSync(
      path.join(
        fixture.cacheRoot,
        ...`locks/product/${PRODUCT_PACKAGE_LOCK_PATHS[1]}`.split('/'),
      ),
      absolute,
    );
    await assert.rejects(verify(fixture), /canonical|regular file|symlink/u);
  });
  await t.test('hard link', async (child) => {
    const fixture = createFixture(child);
    const relative = `locks/product/${PRODUCT_PACKAGE_LOCK_PATHS[0]}`;
    const absolute = path.join(fixture.cacheRoot, ...relative.split('/'));
    const target = path.join(
      fixture.cacheRoot,
      ...`locks/product/${PRODUCT_PACKAGE_LOCK_PATHS[1]}`.split('/'),
    );
    fs.unlinkSync(absolute);
    fs.linkSync(target, absolute);
    await assert.rejects(verify(fixture), /single-link/u);
  });
});

function mutateProductFileCommit(fixture, relative, bytes, { mode } = {}) {
  checkout(fixture.repositoryRoot, fixture.input.product.revision);
  writeFile(fixture.repositoryRoot, relative, bytes);
  if (mode !== undefined) {
    fs.chmodSync(
      path.join(fixture.repositoryRoot, ...relative.split('/')),
      mode,
    );
  }
  fixture.input.product.revision = commit(
    fixture.repositoryRoot,
    `mutate ${relative}`,
  );
}

test('the Go pair rejects preparation, accepted, frozen, validation, and scope drift', async (t) => {
  const cases = {
    'accepted go.mod drift'(fixture) {
      mutateProductFileCommit(
        fixture,
        'backend/go.mod',
        Buffer.from('module example.invalid/drift\n\ngo 1.25\n', 'utf8'),
      );
    },
    'accepted go.sum drift'(fixture) {
      mutateProductFileCommit(
        fixture,
        'backend/go.sum',
        Buffer.from('example.invalid/drift v1.0.0 h1:BBBB=\n', 'utf8'),
      );
    },
    'accepted go.sum mode'(fixture) {
      const bytes = fs.readFileSync(
        path.join(fixture.repositoryRoot, 'backend/go.sum'),
      );
      mutateProductFileCommit(fixture, 'backend/go.sum', bytes, {
        mode: 0o755,
      });
    },
    'frozen go.mod drift'(fixture) {
      replaceReadOnlyFile(
        fixture.cacheRoot,
        'go/backend/go.mod',
        Buffer.from('module example.invalid/frozen-drift\n', 'utf8'),
      );
    },
    'frozen go.sum drift'(fixture) {
      replaceReadOnlyFile(
        fixture.cacheRoot,
        'go/backend/go.sum',
        Buffer.from('example.invalid/frozen-drift v1.0.0 h1:C=\n', 'utf8'),
      );
    },
    'validation go.sum digest drift'(fixture) {
      fixture.rewriteGoValidation((validation) => {
        validation.goSumSha256 = 'f'.repeat(64);
      });
    },
    'validation cannot claim go.mod authority'(fixture) {
      fixture.rewriteGoValidation((validation) => {
        validation.goModSha256 = 'f'.repeat(64);
      });
    },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    await t.test(name, async (child) => {
      const fixture = createFixture(child);
      mutate(fixture);
      await assert.rejects(
        verify(fixture),
        /Go|backend\/go|100644|unexpected fields/u,
      );
    });
  }
});

test('the uv dual authority rejects lock drift, mode drift, directed-reference drift, and invented frozen bytes', async (t) => {
  const cases = {
    'accepted lock drift'(fixture) {
      mutateProductFileCommit(
        fixture,
        'updater/uv.lock',
        Buffer.from('version = 1\nrevision = 99\n', 'utf8'),
      );
    },
    'accepted lock mode'(fixture) {
      const bytes = fs.readFileSync(
        path.join(fixture.repositoryRoot, 'updater/uv.lock'),
      );
      mutateProductFileCommit(fixture, 'updater/uv.lock', bytes, {
        mode: 0o755,
      });
    },
    'agreed validation and plan lock digest drift'(fixture) {
      fixture.rewriteUvDocuments({
        mutatePlan(plan) {
          plan.lockSha256 = 'e'.repeat(64);
        },
        mutateValidation(validation) {
          validation.lockSha256 = 'e'.repeat(64);
        },
      });
    },
    'plan preparation revision drift'(fixture) {
      fixture.rewriteUvDocuments({
        mutatePlan(plan) {
          plan.candidateRevision = 'e'.repeat(40);
        },
      });
    },
    'validation directed plan digest drift'(fixture) {
      fixture.rewriteUvDocuments({
        mutateValidation(validation) {
          validation.closurePlan.sha256 = 'e'.repeat(64);
        },
      });
    },
    'reverse plan reference is forbidden'(fixture) {
      fixture.rewriteUvDocuments({
        mutatePlan(plan) {
          plan.validation = {
            path: 'validation/uv-cache.json',
            sha256: 'e'.repeat(64),
          };
        },
      });
    },
    'invented frozen uv lock is forbidden'(fixture) {
      writeFile(
        fixture.cacheRoot,
        'uv/updater/uv.lock',
        Buffer.from('invented frozen uv authority\n', 'utf8'),
        0o444,
      );
    },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    await t.test(name, async (child) => {
      const fixture = createFixture(child);
      mutate(fixture);
      await assert.rejects(
        verify(fixture),
        /uv|100644|unexpected fields/u,
      );
    });
  }
});

test('raw Git reads reject missing source objects and replacement refs', async (t) => {
  await t.test('missing accepted source object', async (child) => {
    const fixture = createFixture(child);
    fixture.input.product.revision = 'f'.repeat(40);
    await assert.rejects(verify(fixture), /git .* failed/u);
  });
  await t.test('replacement refs', async (child) => {
    const fixture = createFixture(child);
    git(
      fixture.repositoryRoot,
      'replace',
      fixture.preparedFromRevision,
      fixture.productRevision,
    );
    await assert.rejects(verify(fixture), /replacement refs/u);
  });
});

test('phase envelopes reject missing, swapped, inconsistent, reordered, and recomputed-tampered phases', async (t) => {
  const fixture = createFixture(t);
  const preAdmission = await verify(fixture, 'preAdmission');
  const postCleanup = await verify(fixture, 'postCleanup');
  assert.throws(
    () =>
      createCacheCompatibilityEnvelope({
        preAdmission: undefined,
        postCleanup,
      }),
    /preAdmission/u,
  );
  assert.throws(
    () =>
      createCacheCompatibilityEnvelope({
        preAdmission: postCleanup,
        postCleanup: preAdmission,
      }),
    /phase identity/u,
  );
  const inconsistentPost = await verifyCacheCompatibilityPhase({
    input: fixture.input,
    cacheAttestation: {
      ...fixture.cacheAttestation,
      rootSeal: sha256Bytes(Buffer.from('different valid cache seal', 'utf8')),
    },
    phase: 'postCleanup',
  });
  assert.throws(
    () =>
      createCacheCompatibilityEnvelope({
        preAdmission,
        postCleanup: inconsistentPost,
      }),
    /differs from pre-admission/u,
  );
  const reordered = clonePhase(postCleanup, (phase) => {
    [phase.authorities[0], phase.authorities[1]] = [
      phase.authorities[1],
      phase.authorities[0],
    ];
  });
  assert.throws(
    () =>
      createCacheCompatibilityEnvelope({
        preAdmission,
        postCleanup: reordered,
      }),
    /reordered|wrong owner/u,
  );
  const forged = clonePhase(postCleanup, (phase) => {
    phase.authorities[0].git.accepted.mode = '100755';
  });
  assert.throws(
    () =>
      createCacheCompatibilityEnvelope({
        preAdmission,
        postCleanup: forged,
      }),
    /100644/u,
  );
});

test('post-cleanup verification rejects cache mutation after pre-admission', async (t) => {
  const fixture = createFixture(t);
  await verify(fixture, 'preAdmission');
  replaceReadOnlyFile(
    fixture.cacheRoot,
    `locks/product/${PRODUCT_PACKAGE_LOCK_PATHS[0]}`,
    packageLockBytes('post-admission-mutation'),
  );
  await assert.rejects(
    verify(fixture, 'postCleanup'),
    /immutable digest|bytes differ/u,
  );
});

test('result identity rejects evidence path, file digest, phase digest, and envelope summary mismatches', async (t) => {
  const fixture = createFixture(t);
  const preAdmission = await verify(fixture, 'preAdmission');
  const postCleanup = await verify(fixture, 'postCleanup');
  const envelope = createCacheCompatibilityEnvelope({
    preAdmission,
    postCleanup,
  });
  const evidenceSha256 = sha256Bytes(
    Buffer.from(canonicalJson(envelope), 'utf8'),
  );
  assert.match(
    evidenceSha256.slice('sha256:'.length),
    RAW_SHA256,
  );
  assert.throws(
    () =>
      cacheCompatibilityResultIdentity({
        envelopePath: '/absolute/evidence.json',
        evidenceSha256,
        envelope,
      }),
    /relative/u,
  );
  assert.throws(
    () =>
      cacheCompatibilityResultIdentity({
        envelopePath: 'evidence/cache-compatibility.json',
        evidenceSha256: `sha256:${'f'.repeat(64)}`,
        envelope,
      }),
    /file digest/u,
  );
  const phaseDigestMismatch = structuredClone(envelope);
  phaseDigestMismatch.postCleanup.authoritySetSha256 =
    `sha256:${'f'.repeat(64)}`;
  assert.throws(
    () =>
      cacheCompatibilityResultIdentity({
        envelopePath: 'evidence/cache-compatibility.json',
        evidenceSha256: sha256Bytes(
          Buffer.from(canonicalJson(phaseDigestMismatch), 'utf8'),
        ),
        envelope: phaseDigestMismatch,
      }),
    /authority-set digest/u,
  );
  const summaryMismatch = structuredClone(envelope);
  summaryMismatch.revisions = {
    ...summaryMismatch.revisions,
    productRevision: 'f'.repeat(40),
  };
  assert.throws(
    () =>
      cacheCompatibilityResultIdentity({
        envelopePath: 'evidence/cache-compatibility.json',
        evidenceSha256: sha256Bytes(
          Buffer.from(canonicalJson(summaryMismatch), 'utf8'),
        ),
        envelope: summaryMismatch,
      }),
    /summary differs/u,
  );
});
