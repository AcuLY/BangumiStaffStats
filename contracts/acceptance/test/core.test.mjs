import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';

import {
  assertApiViewSemantics,
  assertCatalogResponse,
} from '../lib/api-journey.mjs';
import { runWithAbortSignal } from '../lib/abort-context.mjs';
import { sealImmutableArtifactRoot } from '../lib/artifacts.mjs';
import {
  canonicalJson,
  canonicalJsonDigest,
} from '../lib/canonical-json.mjs';
import { copyCacheTree, validateSeededGoToolchain } from '../lib/cache.mjs';
import { sealFrozenCacheTree } from '../lib/cache-input.mjs';
import { loadAcceptanceConfiguration } from '../lib/config.mjs';
import {
  ContractError,
  validateAcceptanceInput,
  validateBudgets,
  validateMatrix,
  validateOracleExceptions,
  validateResult,
} from '../lib/contracts.mjs';
import {
  canRetainFailureEvidenceClosure,
  registerFailureEvidence,
  validateEvidenceFiles,
  writeAndVerifyCanonicalResult,
} from '../lib/evidence-validation.mjs';
import { writeEvidence } from '../lib/evidence.mjs';
import { REPOSITORY_ROOT } from '../lib/constants.mjs';
import {
  assertGitAncestor,
  assertGitRevisionTree,
  assertNoHardlinkedTrackedFiles,
  buildCloneGitEnvironment,
  deriveCleanCheckoutIdentityClosed,
} from '../lib/git-attestation.mjs';
import {
  dockerLocalSandboxProfile,
  runtimeReadOnlySandboxProfile,
} from '../lib/gates.mjs';
import { REQUIRED_MEASUREMENTS } from '../lib/measurements.mjs';
import { resultOutputDigest } from '../lib/output-digest.mjs';
import {
  ClosedMatrixExecution,
  protectedInputSeal,
  writeSupervisedCanonicalFailure,
} from '../lib/orchestrator.mjs';
import { verifyPackagePolicy } from '../lib/package-policy.mjs';
import {
  MeasurementRecorder,
  parseBackendMetrics,
  PerformanceAcceptanceError,
} from '../lib/performance.mjs';
import { OFFICIAL_PROVENANCE_IDENTITY } from '../lib/provenance.mjs';
import { buildResult, ResultStateMachine } from '../lib/result.mjs';
import {
  allocateRunRoot,
  cleanupRunRoot,
  inventoryOwnedRunRoot,
} from '../lib/run-root.mjs';
import {
  CommandError,
  runCommand,
  sanitizedEnvironment,
  snapshotHostProcessInventory,
  terminateOwnedProcesses,
} from '../lib/runner.mjs';
import {
  assertDockerInventoryUnchanged,
  cleanupOwnedRuntimeResources,
  normalizeDockerResourceInventory,
  normalizeBackendMemoryPolicy,
  ownedRuntimeResidue,
  sampledMemoryHighWater,
} from '../lib/runtime.mjs';
import {
  assertSameSeal,
  sealDirectoryTree,
  sealDistributionTree,
  sealSingleFileDistribution,
  sha256File,
} from '../lib/seal.mjs';
import {
  attestInputRuntimeClosures,
  attestRuntimeClosureSpecifications,
  copyBrowserDistribution,
  copyRuntimeDistribution,
  copySingleFileRuntime,
  deriveNestedDirectoryTreeSeal,
} from '../lib/tools.mjs';
import {
  decodeUtf8Strict,
  parseJsonStrict,
  readJsonStrict,
  StrictJsonError,
} from '../lib/strict-json.mjs';
import {
  sealSupervisorRuntimeClosures,
} from '../lib/supervisor-inputs.mjs';
import { supervisedFailureCells } from '../lib/supervisor.mjs';

function digest(fill = '0') {
  return `sha256:${fill.repeat(64)}`;
}

function removeReadOnlyFixtureTree(root) {
  if (!fs.existsSync(root)) return;
  const canonicalRoot = fs.realpathSync.native(root);
  const canonicalTemporaryRoot = fs.realpathSync.native(os.tmpdir());
  assert.ok(
    canonicalRoot.startsWith(`${canonicalTemporaryRoot}${path.sep}`),
    `fixture cleanup escaped the temporary root: ${canonicalRoot}`,
  );
  function restoreDirectories(directory) {
    const information = fs.lstatSync(directory);
    assert.equal(information.isSymbolicLink(), false);
    assert.equal(information.isDirectory(), true);
    fs.chmodSync(directory, 0o700);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      restoreDirectories(path.join(directory, entry.name));
    }
  }
  restoreDirectories(canonicalRoot);
  fs.rmSync(canonicalRoot, {
    recursive: true,
    force: false,
    maxRetries: 5,
    retryDelay: 100,
  });
}

function escapedFixtureScript(runRoot, name) {
  const scriptPath = path.join(
    runRoot,
    'processes',
    `${name}-escaped-child.mjs`,
  );
  fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
  fs.writeFileSync(
    scriptPath,
    [
      "process.chdir('/');",
      "process.on('SIGTERM',()=>{});",
      'setInterval(()=>{},1000);',
      'setTimeout(()=>process.exit(124),120000);',
      '',
    ].join(''),
    { mode: 0o400 },
  );
  return scriptPath;
}

function completeProcessCommand(pid) {
  const result = spawnSync(
    '/bin/ps',
    ['-ww', '-p', String(pid), '-o', 'command='],
    {
      encoding: 'utf8',
      env: {
        LANG: 'C',
        LC_ALL: 'C',
        PATH: '/usr/bin:/bin',
      },
      maxBuffer: 1024 * 1024,
      timeout: 5_000,
    },
  );
  if (result.status === 1 && result.stdout.trim() === '') return null;
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0);
  return result.stdout.trim();
}

async function cleanupEscapedFixture({
  childPid,
  childPidPath,
  expectedArgv,
}) {
  let exactPid = childPid;
  if (
    !Number.isSafeInteger(exactPid) &&
    fs.existsSync(childPidPath)
  ) {
    const encoded = fs.readFileSync(childPidPath, 'utf8');
    assert.match(encoded, /^(?:[1-9][0-9]*)$/u);
    exactPid = Number(encoded);
  }
  if (!Number.isSafeInteger(exactPid) || exactPid <= 0) return exactPid;
  const inventory = snapshotHostProcessInventory();
  const identity = inventory.entries.find((entry) => entry.pid === exactPid);
  if (!identity) return exactPid;
  const completeCommand = completeProcessCommand(exactPid);
  if (
    identity.userId !== process.getuid() ||
    typeof identity.startToken !== 'string' ||
    identity.startToken === '' ||
    identity.command !== process.execPath ||
    completeCommand !== expectedArgv.join(' ')
  ) {
    throw new Error('escaped fixture process identity differs before cleanup');
  }
  await terminateOwnedProcesses([identity], 50);
  return exactPid;
}

function rebuiltSeal(
  seal,
  {
    entries = seal.entries,
    identities = seal.identities,
    root = seal.root,
  } = {},
) {
  return {
    root,
    entries,
    digest: canonicalJsonDigest(entries),
    canonical: canonicalJson(entries),
    identities,
    identityDigest: canonicalJsonDigest(identities),
    identityCanonical: canonicalJson(identities),
  };
}

function runtimeClosuresFixture() {
  const closure = (shape, classification, copied, hermetic) => ({
    shape,
    classification,
    rootDigest: digest('d'),
    identityDigest: digest('e'),
    copied,
    hermetic,
  });
  return {
    currentNodeSource: closure('directory', 'read-only-source', false, false),
    currentNode: closure('directory', 'run-owned-copy', true, true),
    queryNode: closure('directory', 'owner-fixed-in-place', false, false),
    currentNpmSource: closure('directory', 'read-only-source', false, false),
    currentNpm: closure('directory', 'run-owned-copy', true, true),
    queryNpm: closure('directory', 'owner-fixed-in-place', false, false),
    currentGoSource: closure('directory', 'read-only-source', false, false),
    currentGo: closure('directory', 'run-owned-copy', true, true),
    historicalGo: closure('directory', 'owner-fixed-in-place', false, false),
    pythonSource: closure('directory', 'read-only-source', false, false),
    python: closure('directory', 'run-owned-copy', true, true),
    uvSource: closure('single-file', 'read-only-source', false, false),
    uv: closure('single-file', 'run-owned-copy', true, true),
    dockerSource: closure('single-file', 'read-only-source', false, false),
    docker: closure('single-file', 'run-owned-copy', true, true),
    browserSource: closure('directory', 'read-only-source', false, false),
    browserCopy: closure('directory', 'run-owned-copy', true, true),
  };
}

function inputFixture() {
  const objectId = '1'.repeat(40);
  const absolute = '/private/tmp/input';
  return {
    schemaVersion: 1,
    product: { root: `${absolute}/product`, revision: objectId, tree: objectId },
    harness: { root: `${absolute}/harness`, revision: objectId, tree: objectId },
    artifacts: {
      backendRoot:
        `${absolute}/product/backend/build/.tmp/artifacts/sha256-backend`,
      updaterRoot:
        `${absolute}/product/updater/build/.tmp/published/sha256-updater`,
      frontendRoot:
        `${absolute}/product/frontend/build/.tmp/published/sha256-frontend`,
      compatibilityManifest:
        `${absolute}/product/contracts/artifacts/.tmp/assembled/sha256-compat/compatibility-manifest.json`,
    },
    archive: {
      versionRoot: `${absolute}/archive`,
      dataVersion: `dv1-${'2'.repeat(64)}`,
      provenanceRoot: `${absolute}/provenance`,
      provenanceManifest: `${absolute}/provenance/provenance.json`,
      provenanceDigest: OFFICIAL_PROVENANCE_IDENTITY.provenanceDigest,
    },
    oracle: {
      revision: '644b7748674e553f863d0ffd61d029f86fdc0717',
      tree: objectId,
      npmCache: `${absolute}/cache/npm`,
    },
    tools: Object.fromEntries(
      [
        'git',
        'node',
        'npm',
        'go',
        'uv',
        'python',
        'docker',
        'tar',
        'queryNode',
        'queryNpm',
        'queryGo',
        'queryGofmt',
      ].map((name) => [
        name,
        {
          path: `${absolute}/bin/${name}`,
          version: '1.0.0',
          sha256: digest('1'),
          ...(name === 'docker'
            ? { endpoint: 'unix:///private/tmp/docker.sock' }
            : {}),
        },
      ]),
    ),
    caches: {
      npm: `${absolute}/cache/npm`,
      goModule: `${absolute}/cache/go`,
      uv: `${absolute}/cache/uv`,
      browser: `${absolute}/cache/browser`,
      root: `${absolute}/cache`,
      manifest: `${absolute}/cache/cache-manifest.json`,
      digest: digest('2'),
    },
    browser: {
      name: 'chromium',
      version: '149.0.7827.55',
      executablePath: `${absolute}/cache/browser/chromium`,
      executableDigest: digest('3'),
    },
  };
}

test('strict JSON rejects duplicate keys, non-finite numbers, and fatal UTF-8', () => {
  assert.throws(() => parseJsonStrict('{"a":1,"a":2}'), StrictJsonError);
  assert.throws(() => parseJsonStrict('1e999'), StrictJsonError);
  assert.throws(() => decodeUtf8Strict(Uint8Array.from([0xc3, 0x28])), StrictJsonError);
  assert.deepEqual({ ...parseJsonStrict('{"ok":true}') }, { ok: true });
});

test('canonical JSON is stable and newline terminated', () => {
  assert.equal(canonicalJson({ z: 1, a: [true, null] }), '{"a":[true,null],"z":1}\n');
});

test('catalog uses its exact OpenAPI schema and no-cache policy', () => {
  const fixture = JSON.parse(
    fs.readFileSync(
      path.join(
        REPOSITORY_ROOT,
        'contracts',
        'goldens',
        'api',
        'catalog',
        'cases',
        'success-empty.json',
      ),
      'utf8',
    ),
  ).expected;
  const validator = (value) => value === fixture.body;
  validator.errors = null;
  const bytes = Buffer.from(JSON.stringify(fixture.body));
  const response = {
    status: fixture.status,
    headers: {
      'cache-control': fixture.headers['Cache-Control'],
      'content-type': fixture.headers['Content-Type'],
      'x-request-id': fixture.headers['X-Request-ID'],
    },
    document: fixture.body,
    bytes,
  };
  assert.equal(
    assertCatalogResponse(
      response,
      fixture.body.meta.dataVersion,
      validator,
    ).length,
    fixture.body.data.positions.length,
  );
  assert.throws(
    () =>
      assertCatalogResponse(
        {
          ...response,
          headers: { ...response.headers, 'cache-control': 'private, no-store' },
        },
        fixture.body.meta.dataVersion,
        validator,
      ),
    /cache policy/u,
  );
});

test('API view semantics reject an implementation that ignores page, sort, or search', () => {
  const request = {
    view: {
      search: 'alpha',
      sort: 'average',
      order: 'asc',
      page: 2,
      pageSize: 5,
    },
  };
  const accepted = {
    meta: { pagination: { page: 2, pageSize: 5, total: 7 } },
    data: {
      metricScale: { metric: 'average' },
      items: [
        {
          person: { id: 2, name: 'Alpha Two', nameCN: null },
          average: 200,
        },
        {
          person: { id: 3, name: 'Alpha Three', nameCN: null },
          average: 300,
        },
      ],
    },
  };
  assert.deepEqual(
    assertApiViewSemantics({
      operation: 'rankings',
      request,
      document: accepted,
    }),
    { itemCount: 2, page: 2, pageSize: 5, total: 7 },
  );
  assert.throws(
    () =>
      assertApiViewSemantics({
        operation: 'rankings',
        request,
        document: {
          ...accepted,
          meta: { pagination: { page: 1, pageSize: 20, total: 7 } },
          data: { ...accepted.data, metricScale: { metric: 'count' } },
        },
      }),
    /requested page/u,
  );
  assert.throws(
    () =>
      assertApiViewSemantics({
        operation: 'rankings',
        request,
        document: {
          ...accepted,
          data: {
            ...accepted.data,
            items: [
              {
                person: { id: 2, name: 'Unrelated', nameCN: null },
                average: 200,
              },
            ],
          },
        },
      }),
    /does not match/u,
  );
});

test('closed input rejects unknown fields and unsafe paths', () => {
  const accepted = inputFixture();
  assert.equal(validateAcceptanceInput(accepted), accepted);
  assert.throws(
    () => validateAcceptanceInput({ ...accepted, command: '/bin/sh' }),
    ContractError,
  );
  assert.throws(
    () =>
      validateAcceptanceInput({
        ...accepted,
        archive: { ...accepted.archive, versionRoot: '../archive' },
      }),
    /absolute normalized POSIX path/u,
  );
  for (const candidate of [
    '/private/tmp//archive',
    '/private/tmp/./archive',
    '/private/tmp/archive/',
    '/private/tmp/archive\ncontrol',
  ]) {
    assert.throws(
      () =>
        validateAcceptanceInput({
          ...accepted,
          archive: { ...accepted.archive, versionRoot: candidate },
        }),
      /absolute normalized POSIX path/u,
    );
  }
  const nestedCacheRoot = `${accepted.product.root}/cache`;
  assert.throws(
    () =>
      validateAcceptanceInput({
        ...accepted,
        caches: {
          ...accepted.caches,
          root: nestedCacheRoot,
          npm: `${nestedCacheRoot}/npm`,
          goModule: `${nestedCacheRoot}/go`,
          uv: `${nestedCacheRoot}/uv`,
          browser: `${nestedCacheRoot}/browser`,
          manifest: `${nestedCacheRoot}/cache-manifest.json`,
        },
        browser: {
          ...accepted.browser,
          executablePath: `${nestedCacheRoot}/browser/chromium`,
        },
        oracle: {
          ...accepted.oracle,
          npmCache: `${nestedCacheRoot}/npm`,
        },
      }),
    /paths must be disjoint/u,
  );
  assert.throws(
    () =>
      validateAcceptanceInput({
        ...accepted,
        oracle: {
          ...accepted.oracle,
          npmCache: '/private/tmp/unsealed-oracle-cache',
        },
      }),
    /exact sealed npm cache authority/u,
  );
  assert.throws(
    () =>
      validateAcceptanceInput({
        ...accepted,
        artifacts: {
          ...accepted.artifacts,
          backendRoot:
            `${accepted.harness.root}/contracts/acceptance/.tmp/run-dead/backend`,
        },
      }),
    /must be strictly below/u,
  );
});

test('tracked matrix, budgets, and oracle exceptions are closed', () => {
  const { matrix, budgets, oracleExceptions } = loadAcceptanceConfiguration();
  assert.equal(validateMatrix(matrix).cells.length, 56);
  assert.equal(validateBudgets(budgets).profile.id, 'darwin-arm64-development-v1');
  assert.equal(
    validateOracleExceptions(oracleExceptions, { authorityRoot: REPOSITORY_ROOT }),
    oracleExceptions,
  );
  assert.throws(
    () =>
      validateOracleExceptions(
        {
          ...oracleExceptions,
          entries: [
            {
              ...oracleExceptions.entries[0],
              selector: 'body',
            },
          ],
        },
        { authorityRoot: REPOSITORY_ROOT },
      ),
    /whole-page/u,
  );
});

test('result state is fail closed and a green result requires all evidence', () => {
  const { matrix, budgets } = loadAcceptanceConfiguration();
  const state = new ResultStateMachine(matrix);
  for (const cell of matrix.cells) {
    state.pass(cell.id, {
      durationMs: 1,
      evidence: cell.evidence.map((kind) => ({
        kind,
        path: `evidence/${cell.id}/${kind}.json`,
        sha256: digest('a'),
        summary: `${kind} accepted`,
      })),
    });
  }
  const result = buildResult({
    runId: `run-${'a'.repeat(24)}`,
    matrix,
    state,
    identities: {
      product: { revision: '1'.repeat(40), tree: '2'.repeat(40) },
      harness: { revision: '3'.repeat(40), tree: '4'.repeat(40) },
      components: {
        backend: { artifactSetDigest: digest('1'), statementDigest: digest('2') },
        updater: { artifactSetDigest: digest('3'), statementDigest: digest('4') },
        frontend: { artifactSetDigest: digest('5'), statementDigest: digest('6') },
      },
      compatibility: digest('7'),
      archive: {
        dataVersion: `dv1-${'8'.repeat(64)}`,
        manifestDigest: digest('9'),
        sqliteDigest: digest('a'),
        ...OFFICIAL_PROVENANCE_IDENTITY,
      },
      oracle: {
        revision: '644b7748674e553f863d0ffd61d029f86fdc0717',
        tree: 'b'.repeat(40),
        buildDigest: digest('b'),
      },
      tools: Object.fromEntries(
        [
          'docker',
          'git',
          'go',
          'node',
          'npm',
          'python',
          'queryGo',
          'queryGofmt',
          'queryNode',
          'queryNpm',
          'tar',
          'uv',
        ].map((name) => [
          name,
          { version: `${name} 1`, sha256: digest('d') },
        ]),
      ),
      browser: {
        name: 'chromium',
        version: '149',
        executableDigest: digest('c'),
      },
      historicalGo: {
        rootDigest: digest('f'),
        ownerFixedInPlace: true,
        copied: false,
        hermetic: false,
      },
      runtimeClosures: runtimeClosuresFixture(),
      budgets: {
        profileId: 'darwin-arm64-development-v1',
        digest:
          'sha256:19857455c671b06eefc0930532c21d752d123b248882419bafd84b6fbb16978e',
      },
      cacheCompatibility: {
        schemaVersion: 1,
        preparedFromRevision: '5'.repeat(40),
        productRevision: '1'.repeat(40),
        harnessRevision: '3'.repeat(40),
        oracleRevision: '644b7748674e553f863d0ffd61d029f86fdc0717',
        authorities: 16,
        npmLocks: 13,
        productLocks: 11,
        goFiles: 2,
        uvLocks: 1,
        cacheManifestSha256: digest('1'),
        cacheRootSha256: digest('2'),
        evidencePath: 'evidence/cache-compatibility.json',
        evidenceSha256: digest('3'),
        preAdmissionAuthoritySetSha256: digest('4'),
        postCleanupAuthoritySetSha256: digest('4'),
      },
    },
    machine: {
      profileId: 'darwin-arm64-development-v1',
      os: 'darwin',
      architecture: 'arm64',
      release: 'test',
      logicalCpuCount: 8,
      memoryBytes: 1024,
      dockerVersion: '29.5.3',
    },
    measurements: Object.entries(REQUIRED_MEASUREMENTS).map(([id, declaration]) => ({
      id,
      value:
        declaration.budgetId === null
          ? 1
          : declaration.comparison === 'lt'
            ? declaration.value - 1
            : declaration.value,
      unit: declaration.unit,
      budgetId: declaration.budgetId,
      decision: declaration.decision,
    })),
    seals: {
      inputBefore: digest('d'),
      inputAfter: digest('d'),
      outputDigest: digest('e'),
      residue: {
        processes: 0,
        listeners: 0,
        containers: 0,
        images: 0,
        networks: 0,
        files: 0,
      },
    },
    lifecycle: {
      specified: true,
      implemented: true,
      verified: true,
      committed: true,
      pushed: false,
    },
  });
  assert.equal(
    validateResult(result, matrix, budgets).verdict,
    'development-accepted-operations-pending',
  );
  const missingMeasurement = structuredClone(result);
  missingMeasurement.measurements.pop();
  missingMeasurement.seals.outputDigest = resultOutputDigest(missingMeasurement);
  assert.throws(
    () => validateResult(missingMeasurement, matrix, budgets),
    /missing required closed measurement/u,
  );
  const residue = structuredClone(result);
  residue.seals.residue.containers = 1;
  residue.seals.outputDigest = resultOutputDigest(residue);
  assert.throws(
    () => validateResult(residue, matrix, budgets),
    /green result requires zero residue/u,
  );
  const overTimeout = structuredClone(result);
  overTimeout.cells[0].durationMs = matrix.cells[0].timeoutMs + 1;
  overTimeout.seals.outputDigest = resultOutputDigest(overTimeout);
  assert.throws(
    () => validateResult(overTimeout, matrix, budgets),
    /exceeds the closed cell timeout/u,
  );
  const outputTamper = structuredClone(result);
  outputTamper.machine.memoryBytes += 1;
  assert.throws(
    () => validateResult(outputTamper, matrix, budgets),
    /does not match the canonical result content/u,
  );
  const uncommitted = structuredClone(result);
  uncommitted.lifecycle.committed = false;
  uncommitted.seals.outputDigest = resultOutputDigest(uncommitted);
  assert.throws(
    () => validateResult(uncommitted, matrix, budgets),
    /requires specified, implemented, verified, and committed/u,
  );
  const impossibleSequence = structuredClone(result);
  impossibleSequence.cells[0] = {
    ...impossibleSequence.cells[0],
    status: 'blocked',
    failure: {
      code: 'BLOCKED_BY_FAILURE',
      summary: `blocked by ${matrix.cells.at(-1).id}`,
      blockedBy: matrix.cells.at(-1).id,
    },
  };
  impossibleSequence.cells.at(-1).status = 'fail';
  impossibleSequence.cells.at(-1).failure = {
    code: 'TEST_FAILURE',
    summary: 'deliberate',
    blockedBy: null,
  };
  impossibleSequence.verdict = null;
  impossibleSequence.seals.outputDigest = resultOutputDigest(impossibleSequence);
  assert.throws(
    () => validateResult(impossibleSequence, matrix, budgets),
    /cell before the direct failure must pass/u,
  );
  result.cells[0].evidence = [];
  assert.throws(
    () => validateResult(result, matrix, budgets),
    /missing required evidence/u,
  );

  const failed = new ResultStateMachine(matrix);
  failed.fail(matrix.cells[0].id, {
    durationMs: 1,
    code: 'TEST_FAILURE',
    summary: 'deliberate',
  });
  assert.equal(failed.snapshot()[1].status, 'blocked');
  assert.equal(failed.snapshot()[1].failure.blockedBy, matrix.cells[0].id);
});

test('runner sanitizes environment, captures bounded output, and kills timeout groups', async () => {
  const { runRoot } = allocateRunRoot();
  try {
    const environment = sanitizedEnvironment({
      runRoot,
      pathEntries: ['/usr/bin', '/bin'],
      extra: { TEST_VALUE: 'closed' },
    });
    assert.equal(environment.NODE_OPTIONS, undefined);
    const passed = await runCommand({
      id: 'unit-pass',
      executable: process.execPath,
      args: ['-e', 'process.stdout.write(process.env.TEST_VALUE)'],
      cwd: runRoot,
      environment,
      timeoutMs: 1000,
      gracefulStopMs: 50,
      runRoot,
    });
    assert.equal(passed.status, 0);
    await assert.rejects(
      runCommand({
        id: 'unit-timeout',
        executable: process.execPath,
        args: ['-e', 'setInterval(() => {}, 1000)'],
        cwd: runRoot,
        environment,
        timeoutMs: 100,
        gracefulStopMs: 50,
        runRoot,
      }),
      (error) => error instanceof CommandError && error.result.timedOut,
    );
  } finally {
    cleanupRunRoot(runRoot);
  }
});

test('runner rejects and force-cleans a reparented child with empty env and escaped cwd', async () => {
  if (process.platform === 'win32') return;
  const { runRoot } = allocateRunRoot();
  const childPidPath = path.join(runRoot, 'processes', 'stranded-child.pid');
  const childScript = escapedFixtureScript(runRoot, 'stranded');
  const childArguments = [childScript, 'stranded-owned-fixture'];
  const expectedArgv = [process.execPath, ...childArguments];
  const leaderSource = [
    "const {spawn}=require('node:child_process');",
    "const fs=require('node:fs');",
    `const child=spawn(${JSON.stringify(process.execPath)},${JSON.stringify(childArguments)},{detached:true,env:{},stdio:'ignore'});`,
    `fs.writeFileSync(${JSON.stringify(childPidPath)},String(child.pid));`,
    'child.unref();',
    'setTimeout(()=>process.exit(0),50);',
  ].join('');
  let childPid;
  try {
    const environment = sanitizedEnvironment({
      runRoot,
      pathEntries: [path.dirname(process.execPath), '/usr/bin', '/bin'],
    });
    await assert.rejects(
      runCommand({
        id: 'unit-reparented-descendant',
        executable: process.execPath,
        args: ['-e', leaderSource],
        cwd: runRoot,
        environment,
        timeoutMs: 1_000,
        gracefulStopMs: 50,
        runRoot,
      }),
      /left descendant processes/u,
    );
    childPid = Number(fs.readFileSync(childPidPath, 'utf8'));
    assert.equal(Number.isSafeInteger(childPid), true);
    assert.throws(
      () => process.kill(childPid, 0),
      (error) => error?.code === 'ESRCH',
    );
  } finally {
    childPid = await cleanupEscapedFixture({
      childPid,
      childPidPath,
      expectedArgv,
    });
    cleanupRunRoot(runRoot);
  }
});

test('escaped fixture fallback cleans only an exact owned process identity', async () => {
  if (process.platform === 'win32') return;
  const { runRoot } = allocateRunRoot();
  const childPidPath = path.join(runRoot, 'processes', 'fallback-child.pid');
  const childScript = escapedFixtureScript(runRoot, 'fallback');
  assert.match(
    fs.readFileSync(childScript, 'utf8'),
    /setTimeout\(\(\)=>process\.exit\(124\),120000\)/u,
  );
  const childArguments = [childScript, 'fallback-owned-fixture'];
  const expectedArgv = [process.execPath, ...childArguments];
  const owned = spawn(process.execPath, childArguments, {
    cwd: runRoot,
    detached: true,
    env: {},
    stdio: 'ignore',
  });
  owned.unref();
  fs.writeFileSync(childPidPath, String(owned.pid));
  try {
    const cleanedPid = await cleanupEscapedFixture({
      childPid: undefined,
      childPidPath,
      expectedArgv,
    });
    assert.equal(cleanedPid, owned.pid);
    assert.throws(
      () => process.kill(owned.pid, 0),
      (error) => error?.code === 'ESRCH',
    );
  } finally {
    try {
      owned.kill('SIGKILL');
    } catch (error) {
      if (error?.code !== 'ESRCH') throw error;
    }
    cleanupRunRoot(runRoot);
  }

  const foreignRoot = allocateRunRoot().runRoot;
  const foreignPidPath = path.join(
    foreignRoot,
    'processes',
    'foreign-child.pid',
  );
  const foreign = spawn('/bin/sleep', ['30'], {
    cwd: '/',
    detached: true,
    env: {},
    stdio: 'ignore',
  });
  foreign.unref();
  fs.mkdirSync(path.dirname(foreignPidPath), { recursive: true });
  fs.writeFileSync(foreignPidPath, String(foreign.pid));
  try {
    await assert.rejects(
      cleanupEscapedFixture({
        childPid: undefined,
        childPidPath: foreignPidPath,
        expectedArgv,
      }),
      /process identity differs/u,
    );
    assert.doesNotThrow(() => process.kill(foreign.pid, 0));
  } finally {
    try {
      foreign.kill('SIGKILL');
    } catch (error) {
      if (error?.code !== 'ESRCH') throw error;
    }
    cleanupRunRoot(foreignRoot);
  }
});

test('runner does not signal an unattributed concurrent host process', async () => {
  if (process.platform === 'win32') return;
  const { runRoot } = allocateRunRoot();
  const foreign = spawn('/bin/sleep', ['30'], {
    cwd: '/',
    detached: true,
    env: {},
    stdio: 'ignore',
  });
  foreign.unref();
  try {
    const environment = sanitizedEnvironment({
      runRoot,
      pathEntries: ['/usr/bin', '/bin'],
    });
    const result = await runCommand({
      id: 'unit-foreign-process',
      executable: '/usr/bin/true',
      args: [],
      cwd: runRoot,
      environment,
      timeoutMs: 1_000,
      gracefulStopMs: 50,
      runRoot,
    });
    assert.equal(result.status, 0);
    assert.doesNotThrow(() => process.kill(foreign.pid, 0));
  } finally {
    try {
      process.kill(foreign.pid, 'SIGKILL');
    } catch (error) {
      if (error?.code !== 'ESRCH') throw error;
    }
    cleanupRunRoot(runRoot);
  }
});

test('runner cleans reparented children before reporting nonzero and timeout outcomes', async () => {
  if (process.platform === 'win32') return;
  for (const scenario of [
    { name: 'nonzero', tail: 'setTimeout(()=>process.exit(7),50);', timeoutMs: 1_000 },
    { name: 'timeout', tail: 'setInterval(()=>{},1000);', timeoutMs: 100 },
  ]) {
    const { runRoot } = allocateRunRoot();
    const childPidPath = path.join(
      runRoot,
      'processes',
      `${scenario.name}-child.pid`,
    );
    const childScript = escapedFixtureScript(runRoot, scenario.name);
    const childArguments = [
      childScript,
      `${scenario.name}-owned-fixture`,
    ];
    const expectedArgv = [process.execPath, ...childArguments];
    const leaderSource = [
      "const{spawn}=require('node:child_process');",
      "const fs=require('node:fs');",
      `const child=spawn(${JSON.stringify(process.execPath)},${JSON.stringify(childArguments)},{detached:true,env:{},stdio:'ignore'});`,
      `fs.writeFileSync(${JSON.stringify(childPidPath)},String(child.pid));`,
      'child.unref();',
      scenario.tail,
    ].join('');
    let childPid;
    try {
      const environment = sanitizedEnvironment({
        runRoot,
        pathEntries: [path.dirname(process.execPath), '/usr/bin', '/bin'],
      });
      await assert.rejects(
        runCommand({
          id: `unit-reparented-${scenario.name}`,
          executable: process.execPath,
          args: ['-e', leaderSource],
          cwd: runRoot,
          environment,
          timeoutMs: scenario.timeoutMs,
          gracefulStopMs: 50,
          runRoot,
        }),
      );
      childPid = Number(fs.readFileSync(childPidPath, 'utf8'));
      assert.throws(
        () => process.kill(childPid, 0),
        (error) => error?.code === 'ESRCH',
      );
    } finally {
      childPid = await cleanupEscapedFixture({
        childPid,
        childPidPath,
        expectedArgv,
      });
      cleanupRunRoot(runRoot);
    }
  }
});

test('backend memory facts distinguish sampled high-water from the enforced hard cap', () => {
  assert.equal(sampledMemoryHighWater([10, 50, 20]), 50);
  const accepted = normalizeBackendMemoryPolicy({
    currentMemoryBytes: 20,
    memoryHardLimitBytes: 1_073_741_824,
    memorySampleCount: 3,
    memorySwapHardLimitBytes: 1_073_741_824,
    oomKilled: false,
    sampledHighWaterMemoryBytes: 50,
  });
  assert.equal(accepted.sampledHighWaterMemoryBytes, 50);
  for (const change of [
    { memoryHardLimitBytes: 1_073_741_823 },
    { memorySwapHardLimitBytes: 0 },
    { oomKilled: true },
    { currentMemoryBytes: undefined },
  ]) {
    assert.throws(
      () => normalizeBackendMemoryPolicy({ ...accepted, ...change }),
      /memory|OOM/u,
    );
  }
});

test('evidence validation opens every registered file and rejects tamper or residue', async () => {
  const { runRoot } = allocateRunRoot();
  try {
    const imageRelative = 'browser/cells/browser.light.360.default/root.candidate.png';
    const imagePath = path.join(runRoot, ...imageRelative.split('/'));
    fs.mkdirSync(path.dirname(imagePath), { recursive: true, mode: 0o700 });
    fs.writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
      flag: 'wx',
      mode: 0o600,
    });
    const screenshots = await writeEvidence({
      runRoot,
      relative:
        'browser/cells/browser.light.360.default/screenshots.json',
      kind: 'screenshots',
      value: [{
        kind: 'candidate',
        path: imageRelative,
        sha256: await sha256File(imagePath),
      }],
      summary: 'registered screenshot',
    });
    const cells = [{ evidence: [screenshots] }];
    assert.equal(
      (await validateEvidenceFiles({ runRoot, cells })).fileCount,
      2,
    );
    await assert.rejects(
      validateEvidenceFiles({
        runRoot,
        cells: [{ evidence: [screenshots, screenshots] }],
      }),
      /duplicate evidence descriptor/u,
    );
    const unregistered = path.join(runRoot, 'evidence', 'unregistered.log');
    fs.mkdirSync(path.dirname(unregistered), { recursive: true, mode: 0o700 });
    fs.writeFileSync(unregistered, 'residue');
    await assert.rejects(
      validateEvidenceFiles({ runRoot, cells }),
      /unregistered evidence file/u,
    );
    fs.unlinkSync(unregistered);
    fs.writeFileSync(imagePath, 'tampered');
    await assert.rejects(
      validateEvidenceFiles({ runRoot, cells }),
      /digest differs/u,
    );
  } finally {
    cleanupRunRoot(runRoot);
  }
});

test('failed result evidence registration closes files written before a cell aborts', async () => {
  const { runRoot } = allocateRunRoot();
  try {
    fs.mkdirSync(path.join(runRoot, 'evidence', 'partial'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(runRoot, 'evidence', 'partial', 'orphan.txt'),
      'partial evidence',
    );
    const cells = [
      {
        id: 'failed.cell',
        owner: 'failed-owner',
        status: 'fail',
        durationMs: 1,
        evidence: [],
        failure: {
          code: 'TEST_FAILURE',
          summary: 'deliberate',
          blockedBy: null,
        },
      },
    ];
    await registerFailureEvidence({ runRoot, cells });
    assert.equal(cells[0].evidence[0].kind, 'failureArtifactIndex');
    const inventory = await validateEvidenceFiles({ runRoot, cells });
    assert.equal(inventory.fileCount, 2);
  } finally {
    cleanupRunRoot(runRoot);
  }
});

test('parent failure evidence budget reserves exactly two terminal descriptors', () => {
  assert.equal(canRetainFailureEvidenceClosure(0, 9_998), true);
  assert.equal(canRetainFailureEvidenceClosure(9_997, 1), true);
  assert.equal(canRetainFailureEvidenceClosure(9_998, 1), false);
  assert.equal(canRetainFailureEvidenceClosure(0, 9_999), false);
});

test('evidence recursion ignores cache authority bindings but closes explicit screenshots', async () => {
  const { runRoot } = allocateRunRoot();
  try {
    const cacheEnvelope = await writeEvidence({
      runRoot,
      relative: 'evidence/cache/compatibility.json',
      kind: 'cacheCompatibilityPostCleanup',
      value: {
        schemaVersion: 1,
        preAdmission: {
          authorities: [
            {
              kind: 'uv-lock',
              bindings: [
                {
                  kind: 'uv-validation',
                  path: 'validation/uv-lock.json',
                  sha256: digest('a'),
                },
                {
                  kind: 'uv-closure-plan',
                  path: 'validation/uv-closure-plan.json',
                  sha256: digest('b'),
                },
              ],
            },
          ],
        },
      },
      summary: 'cache authority envelope with non-evidence path bindings',
    });
    assert.equal(
      (
        await validateEvidenceFiles({
          runRoot,
          cells: [{ evidence: [cacheEnvelope] }],
        })
      ).fileCount,
      1,
    );
    const invalidScreenshot = await writeEvidence({
      runRoot,
      relative: 'evidence/cache/invalid-screenshot.json',
      kind: 'screenshots',
      value: [
        {
          kind: 'candidate',
          path: 'validation/not-run-evidence.png',
          sha256: digest('c'),
        },
      ],
      summary: 'deliberately escaped explicit screenshot descriptor',
    });
    await assert.rejects(
      validateEvidenceFiles({
        runRoot,
        cells: [{ evidence: [cacheEnvelope, invalidScreenshot] }],
      }),
      /outside the closed evidence roots/u,
    );
  } finally {
    cleanupRunRoot(runRoot);
  }
});

test('canonical result output is exclusively written and verified after re-read', async () => {
  const { runRoot } = allocateRunRoot();
  try {
    const output = await writeAndVerifyCanonicalResult({
      runRoot,
      result: { accepted: true, value: 1 },
    });
    assert.equal(output.path, 'result.json');
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(runRoot, output.path), 'utf8')).accepted,
      true,
    );
    await assert.rejects(
      writeAndVerifyCanonicalResult({
        runRoot,
        result: { accepted: true, value: 1 },
      }),
      { code: 'EEXIST' },
    );
  } finally {
    cleanupRunRoot(runRoot);
  }
});

test('parent supervisor replaces a fake partial result with one canonical fail-fast result', async () => {
  const { runId, runRoot } = allocateRunRoot();
  const configuration = loadAcceptanceConfiguration();
  try {
    fs.writeFileSync(path.join(runRoot, 'result.json'), '{"partial":true}\n', {
      flag: 'wx',
      mode: 0o600,
    });
    const cells = supervisedFailureCells({
      matrix: configuration.matrix,
      acceptedCells: [],
      code: 'SUPERVISOR_CELL_TIMEOUT',
      summary: 'fixture worker exceeded its deadline',
      durationMs: 1,
    });
    await writeSupervisedCanonicalFailure({
      cells,
      cleanup: {
        cleanupFailures: [],
        external: {
          failures: [],
          residue: { containers: 0, images: 0, networks: 0 },
        },
        observedProcessCount: 1,
        terminatedDescendantCount: 0,
      },
      configuration,
      input: inputFixture(),
      inputAfter: { digest: digest('6'), document: { phase: 'after' } },
      inputBefore: { digest: digest('5'), document: { phase: 'before' } },
      reason: Object.assign(new Error('fixture supervisor timeout'), {
        code: 'SUPERVISOR_CELL_TIMEOUT',
      }),
      runId,
      runRoot,
      suiteDurationMs: 2,
      workerOutput: {
        stderrBytes: 0,
        stderrTruncated: false,
        stdoutBytes: 0,
        stdoutTruncated: false,
      },
    });
    const result = validateResult(
      parseJsonStrict(
        fs.readFileSync(path.join(runRoot, 'result.json'), 'utf8'),
      ),
      configuration.matrix,
      configuration.budgets,
    );
    assert.equal(result.cells[0].status, 'fail');
    assert.equal(result.cells[1].status, 'blocked');
    assert.equal(result.seals.inputBefore, digest('5'));
    assert.equal(result.seals.inputAfter, digest('6'));
    assert.equal(
      fs
        .readdirSync(runRoot)
        .filter((name) => name.startsWith('worker-result-untrusted-'))
        .length,
      1,
    );
    await validateEvidenceFiles({ runRoot, cells: result.cells });
  } finally {
    cleanupRunRoot(runRoot);
  }
});

test('parent failure registration uses a unique index and folds a full direct-fail evidence array', async () => {
  const { runId, runRoot } = allocateRunRoot();
  const configuration = loadAcceptanceConfiguration();
  try {
    const oldIndexRelative = 'evidence/failure/unregistered-index.json';
    const oldIndexPath = path.join(runRoot, ...oldIndexRelative.split('/'));
    fs.mkdirSync(path.dirname(oldIndexPath), {
      recursive: true,
      mode: 0o700,
    });
    fs.writeFileSync(oldIndexPath, canonicalJson([]), {
      flag: 'wx',
      mode: 0o600,
    });
    const descriptors = [{
      kind: 'logs',
      path: oldIndexRelative,
      sha256: await sha256File(oldIndexPath),
      summary: 'worker-owned legacy failure index',
    }];
    for (let index = 0; index < 63; index += 1) {
      const relative =
        `evidence/worker/direct-${String(index).padStart(2, '0')}.log`;
      const absolute = path.join(runRoot, ...relative.split('/'));
      fs.mkdirSync(path.dirname(absolute), {
        recursive: true,
        mode: 0o700,
      });
      fs.writeFileSync(absolute, `direct evidence ${index}\n`, {
        flag: 'wx',
        mode: 0o600,
      });
      descriptors.push({
        kind: 'logs',
        path: relative,
        sha256: await sha256File(absolute),
        summary: `direct failure evidence ${index}`,
      });
    }
    const cells = structuredClone(
      supervisedFailureCells({
        matrix: configuration.matrix,
        acceptedCells: [],
        code: 'SUPERVISOR_CELL_TIMEOUT',
        summary:
          `worker failed at /Users/luca/private token=fixture-${'x'.repeat(600)}`,
        durationMs: 1,
      }),
    );
    cells[0].evidence = descriptors;
    await writeSupervisedCanonicalFailure({
      cells,
      cleanup: {
        cleanupFailures: [],
        external: {
          failures: [],
          residue: { containers: 0, images: 0, networks: 0 },
        },
        observedProcessCount: 1,
        terminatedDescendantCount: 0,
      },
      configuration,
      input: inputFixture(),
      inputAfter: { digest: digest('a'), document: { phase: 'after' } },
      inputBefore: { digest: digest('9'), document: { phase: 'before' } },
      reason: Object.assign(
        new Error(
          `worker failed at /Users/luca/private token=fixture-${'x'.repeat(600)}`,
        ),
        { code: 'SUPERVISOR_CELL_TIMEOUT' },
      ),
      runId,
      runRoot,
      suiteDurationMs: 2,
      workerOutput: {
        stderrBytes: 0,
        stderrTruncated: false,
        stdoutBytes: 0,
        stdoutTruncated: false,
      },
    });
    const result = validateResult(
      readJsonStrict(path.join(runRoot, 'result.json')),
      configuration.matrix,
      configuration.budgets,
    );
    assert.equal(result.cells[0].status, 'fail');
    assert.equal(result.cells[0].evidence.length, 64);
    assert.ok(result.cells[0].failure.summary.length <= 512);
    assert.doesNotMatch(
      result.cells[0].failure.summary,
      /\/Users\/|token=/iu,
    );
    const indexDescriptor = result.cells[0].evidence.find(
      (descriptor) => descriptor.kind === 'failureArtifactIndex',
    );
    assert.ok(indexDescriptor);
    assert.notEqual(indexDescriptor.path, oldIndexRelative);
    assert.match(
      indexDescriptor.path,
      /^evidence\/parent-failure-index-[A-Za-z0-9._-]+\/index\.json$/u,
    );
    const index = readJsonStrict(
      path.join(runRoot, ...indexDescriptor.path.split('/')),
    );
    assert.ok(
      index.some(
        (descriptor) =>
          descriptor.path === 'evidence/worker/direct-62.log',
      ),
    );
    assert.ok(
      index.some((descriptor) =>
        descriptor.path.includes('/parent-supervisor-')),
    );
    const inventory = await validateEvidenceFiles({
      runRoot,
      cells: result.cells,
    });
    assert.ok(inventory.paths.includes(oldIndexRelative));
    assert.ok(inventory.paths.includes(indexDescriptor.path));
    assert.ok(
      result.cells[0].evidence.some(
        (descriptor) => descriptor.path === oldIndexRelative,
      ),
    );
  } finally {
    cleanupRunRoot(runRoot);
  }
});

test('parent supervisor quarantines corrupt worker evidence and still writes one closed 56-cell failure', async () => {
  const { runId, runRoot } = allocateRunRoot();
  const configuration = loadAcceptanceConfiguration();
  const externalRoot = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), 'bgmss-evidence-negative-')),
  );
  try {
    const truncatedRelative = 'browser/cells/worker/truncated.json';
    const truncatedPath = path.join(
      runRoot,
      ...truncatedRelative.split('/'),
    );
    fs.mkdirSync(path.dirname(truncatedPath), {
      recursive: true,
      mode: 0o700,
    });
    fs.writeFileSync(truncatedPath, '{"truncated":');
    const mismatchRelative = 'browser/cells/worker/mismatch.json';
    fs.writeFileSync(
      path.join(runRoot, ...mismatchRelative.split('/')),
      '{"valid":true}\n',
    );
    const nestedMismatchRelative =
      'browser/cells/worker/nested-mismatch.png';
    const nestedMismatchPath = path.join(
      runRoot,
      ...nestedMismatchRelative.split('/'),
    );
    fs.writeFileSync(nestedMismatchPath, 'worker screenshot bytes');
    const nestedEnvelopeRelative =
      'browser/cells/worker/nested-envelope.json';
    const nestedEnvelopePath = path.join(
      runRoot,
      ...nestedEnvelopeRelative.split('/'),
    );
    fs.writeFileSync(
      nestedEnvelopePath,
      canonicalJson({
        screenshots: [{
          kind: 'candidate',
          path: nestedMismatchRelative,
          sha256: digest('e'),
        }],
      }),
    );
    fs.writeFileSync(
      path.join(
        runRoot,
        'browser',
        'cells',
        'worker',
        'unregistered-corrupt.json',
      ),
      '{"orphan":',
    );
    const validUnregisteredRelative =
      'browser/cells/worker/unregistered-valid.log';
    fs.writeFileSync(
      path.join(runRoot, ...validUnregisteredRelative.split('/')),
      'bounded worker diagnostic\n',
    );
    const invalidAcceptedDescriptors = [];
    for (const fixture of [
      {
        kind: 'Invalid-Kind',
        name: 'invalid-kind.log',
        summary: 'worker descriptor has an invalid kind',
      },
      {
        kind: 'logs',
        name: 'secret-summary.log',
        summary: 'token=worker-secret',
      },
      {
        kind: 'logs',
        name: 'oversize-summary.log',
        summary: 'x'.repeat(513),
      },
    ]) {
      const relative = `browser/cells/worker/${fixture.name}`;
      const absolute = path.join(runRoot, ...relative.split('/'));
      fs.writeFileSync(absolute, `${fixture.name}\n`);
      invalidAcceptedDescriptors.push({
        kind: fixture.kind,
        path: relative,
        sha256: await sha256File(absolute),
        summary: fixture.summary,
      });
    }
    const fifo = path.join(
      runRoot,
      'browser',
      'cells',
      'worker',
      'special.pipe',
    );
    assert.equal(spawnSync('/usr/bin/mkfifo', [fifo]).status, 0);

    const externalTarget = path.join(externalRoot, 'external.json');
    fs.writeFileSync(externalTarget, '{"external":"unchanged"}\n');
    fs.rmdirSync(path.join(runRoot, 'evidence'));
    fs.symlinkSync(externalRoot, path.join(runRoot, 'evidence'));
    const linkedRelative = 'evidence/external.json';
    const first = configuration.matrix.cells[0];
    const acceptedCells = [{
      id: first.id,
      owner: first.owner,
      status: 'pass',
      durationMs: 1,
      evidence: [
        {
          kind: 'inputSeal',
          path: truncatedRelative,
          sha256: await sha256File(truncatedPath),
          summary: 'worker reported a truncated JSON document',
        },
        {
          kind: 'logs',
          path: mismatchRelative,
          sha256: digest('f'),
          summary: 'worker reported a mismatched digest',
        },
        {
          kind: 'screenshots',
          path: nestedEnvelopeRelative,
          sha256: await sha256File(nestedEnvelopePath),
          summary: 'worker reported a nested mismatched screenshot',
        },
        {
          kind: 'logs',
          path: linkedRelative,
          sha256: await sha256File(externalTarget),
          summary: 'worker reported evidence through a linked root',
        },
        ...invalidAcceptedDescriptors,
      ],
      failure: null,
    }];
    const cells = supervisedFailureCells({
      matrix: configuration.matrix,
      acceptedCells,
      code: 'SUPERVISOR_CELL_TIMEOUT',
      summary: 'fixture worker exceeded its deadline',
      durationMs: 1,
    });
    const output = await writeSupervisedCanonicalFailure({
      cells,
      cleanup: {
        cleanupFailures: [],
        external: {
          failures: [],
          residue: { containers: 0, images: 0, networks: 0 },
        },
        observedProcessCount: 1,
        terminatedDescendantCount: 0,
      },
      configuration,
      input: inputFixture(),
      inputAfter: { digest: digest('8'), document: { phase: 'after' } },
      inputBefore: { digest: digest('7'), document: { phase: 'before' } },
      reason: Object.assign(new Error('fixture supervisor timeout'), {
        code: 'SUPERVISOR_CELL_TIMEOUT',
      }),
      runId,
      runRoot,
      suiteDurationMs: 2,
      workerOutput: {
        stderrBytes: 0,
        stderrTruncated: false,
        stdoutBytes: 0,
        stdoutTruncated: false,
      },
    });
    assert.equal(output.path, 'result.json');
    assert.equal(
      fs.readdirSync(runRoot).filter((name) => name === 'result.json').length,
      1,
    );
    const result = validateResult(
      readJsonStrict(path.join(runRoot, 'result.json')),
      configuration.matrix,
      configuration.budgets,
    );
    assert.equal(result.cells.length, 56);
    assert.equal(
      result.cells.filter((cell) => cell.status === 'fail').length,
      1,
    );
    assert.equal(result.cells[0].status, 'fail');
    assert.equal(
      result.cells[0].failure.code,
      'SUPERVISOR_EVIDENCE_INVALID',
    );
    assert.equal(result.cells[1].status, 'blocked');
    assert.equal(result.cells[1].failure.blockedBy, result.cells[0].id);
    const canonical = canonicalJson(result);
    const untrustedPaths = [
      truncatedRelative,
      mismatchRelative,
      nestedEnvelopeRelative,
      nestedMismatchRelative,
      linkedRelative,
      'browser/cells/worker/unregistered-corrupt.json',
      'browser/cells/worker/special.pipe',
      ...invalidAcceptedDescriptors.map((descriptor) => descriptor.path),
    ];
    for (const untrusted of untrustedPaths) {
      assert.equal(canonical.includes(untrusted), false);
    }
    assert.equal(
      result.cells[0].evidence.filter(
        (descriptor) => descriptor.kind === 'failureArtifactIndex',
      ).length,
      1,
    );
    const evidenceInventory = await validateEvidenceFiles({
      runRoot,
      cells: result.cells,
    });
    assert.ok(evidenceInventory.paths.includes(validUnregisteredRelative));
    const failureIndex = readJsonStrict(
      path.join(
        runRoot,
        result.cells[0].evidence.find(
          (descriptor) => descriptor.kind === 'failureArtifactIndex',
        ).path,
      ),
    );
    assert.ok(
      failureIndex.some(
        (descriptor) =>
          descriptor.kind === 'failureArtifact' &&
          descriptor.path.includes('/parent-supervisor-'),
      ),
    );
    assert.ok(
      failureIndex.some(
        (descriptor) => descriptor.path === validUnregisteredRelative,
      ),
    );
    for (const untrusted of untrustedPaths) {
      assert.equal(
        failureIndex.some((descriptor) => descriptor.path === untrusted),
        false,
      );
      assert.equal(evidenceInventory.paths.includes(untrusted), false);
    }
    assert.equal(fs.readFileSync(externalTarget, 'utf8'), '{"external":"unchanged"}\n');
    assert.deepEqual(fs.readdirSync(externalRoot), ['external.json']);
    const quarantineName = fs
      .readdirSync(runRoot)
      .find((name) => name.startsWith('worker-evidence-quarantine-'));
    assert.ok(quarantineName);
    const quarantine = readJsonStrict(
      path.join(runRoot, quarantineName, 'manifest.json'),
    );
    assert.equal(quarantine.rejectedDescriptors.length, 7);
    assert.ok(quarantine.discarded.symlinks >= 1);
    assert.ok(quarantine.discarded.specialFiles >= 1);
    assert.ok(quarantine.retainedUnregisteredRootCount >= 1);
  } finally {
    try {
      const leftoverFifo = path.join(
        runRoot,
        'browser',
        'cells',
        'worker',
        'special.pipe',
      );
      if (fs.existsSync(leftoverFifo)) fs.unlinkSync(leftoverFifo);
    } catch {
      // The production path removes the special entry after isolating it.
    }
    cleanupRunRoot(runRoot);
    fs.rmSync(externalRoot, { recursive: true, force: false });
  }
});

test('package policy pins one browser owner and leaves no persistent install', () => {
  const { installPolicy } = verifyPackagePolicy();
  assert.equal(installPolicy.directDependencyCount, 1);
  assert.equal(installPolicy.productionBundleImpactBytes, 0);
  assert.equal(fs.existsSync(path.join(REPOSITORY_ROOT, 'contracts/acceptance/node_modules')), false);
});

test('configuration objects reject non-finite and threshold widening', () => {
  const { budgets, matrix } = loadAcceptanceConfiguration();
  assert.throws(
    () =>
      validateBudgets({
        ...budgets,
        invariants: {
          ...budgets.invariants,
          apiRequestMs: {
            ...budgets.invariants.apiRequestMs,
            value: Number.POSITIVE_INFINITY,
          },
        },
      }),
    /integer/u,
  );
  assert.throws(
    () =>
      validateMatrix({
        ...matrix,
        cells: matrix.cells.map((cell, index) =>
          index === 0 ? { ...cell, action: 'shell-from-input' } : cell,
        ),
      }),
    /closed action registry/u,
  );
  assert.throws(
    () =>
      validateMatrix({
        ...matrix,
        cells: matrix.cells.map((cell) =>
          cell.action.startsWith('browser-cell:')
            ? { ...cell, action: 'browser-cell:light:360:default' }
            : cell,
        ),
      }),
    /duplicate browser matrix action/u,
  );
  assert.throws(
    () =>
      validateMatrix({
        ...matrix,
        cells: matrix.cells.map((cell) =>
          cell.id === 'owner.backend'
            ? { ...cell, action: 'owner-gate:contracts' }
            : cell,
        ),
      }),
    /exact closed matrix declaration/u,
  );
});

test('performance recorder closes units, duplicates, completeness, and budgets', () => {
  const { budgets } = loadAcceptanceConfiguration();
  const recorder = new MeasurementRecorder(budgets);
  recorder.record(
    'frontend.initialJavaScriptGzipBytes',
    budgets.invariants.frontendInitialJavaScriptGzipBytes.value - 1,
  );
  assert.throws(
    () =>
      recorder.record(
        'frontend.initialJavaScriptGzipBytes',
        budgets.invariants.frontendInitialJavaScriptGzipBytes.value - 1,
      ),
    /duplicate closed measurement/u,
  );
  assert.throws(
    () =>
      new MeasurementRecorder(budgets).record(
        'backend.readyMs',
        1,
        'bytes',
      ),
    /instead of milliseconds/u,
  );
  assert.throws(
    () => recorder.snapshot({ complete: true }),
    /missing required closed measurements/u,
  );

  const exceeded = new MeasurementRecorder(budgets);
  exceeded.record(
    'backend.readyMs',
    budgets.profile.ceilings.backendReadyMs + 1,
  );
  assert.throws(
    () => exceeded.snapshot({ passing: true }),
    /development budget exceeded/u,
  );
  const drifted = structuredClone(budgets);
  drifted.profile.ceilings.backendReadyMs += 1;
  assert.throws(
    () => new MeasurementRecorder(drifted),
    PerformanceAcceptanceError,
  );
});

test('Backend performance metrics require exact integer cache and request counters', () => {
  const parsed = parseBackendMetrics(
    [
      'bgmss_query_cache_items{cache="result"} 3',
      'bgmss_query_cache_retained_bytes{cache="result"} 10',
      'bgmss_http_requests_total{route="readyz"} 2',
      'bgmss_http_requests_total{route="rankings"} 4',
      '',
    ].join('\n'),
  );
  assert.deepEqual(parsed, {
    cacheResultBytes: 10,
    cacheResultItems: 3,
    cacheResultPerItemBytes: 4,
    requestCount: 6,
  });
  assert.throws(
    () =>
      parseBackendMetrics(
        'bgmss_query_cache_items{cache="result"} 1\n' +
          'bgmss_query_cache_retained_bytes{cache="result"} 1.5\n' +
          'bgmss_http_requests_total{route="readyz"} 1\n',
      ),
    /integer result-cache/u,
  );
});

test('closed matrix execution preserves order and blocks every later cell on failure', async () => {
  const matrix = {
    cells: [
      {
        id: 'first.cell',
        owner: 'first-owner',
        evidence: ['firstEvidence'],
        timeoutMs: 100,
      },
      {
        id: 'second.cell',
        owner: 'second-owner',
        evidence: ['secondEvidence'],
        timeoutMs: 100,
      },
    ],
  };
  const execution = new ClosedMatrixExecution(matrix);
  await execution.run('first.cell', async () => ({
    evidence: [{ kind: 'firstEvidence' }],
    value: 'accepted',
  }));
  await assert.rejects(
    execution.run('second.cell', async () => ({
      evidence: [],
    })),
    /closed acceptance matrix aborted/u,
  );
  const cells = execution.state.snapshot();
  assert.equal(cells[0].status, 'pass');
  assert.equal(cells[1].status, 'fail');
  assert.match(cells[1].failure.summary, /omitted required evidence/u);
});

test('closed matrix execution rejects out-of-order and over-time actions', async () => {
  const matrix = {
    cells: [
      {
        id: 'timed.cell',
        owner: 'timed-owner',
        evidence: ['timing'],
        timeoutMs: 1,
      },
      {
        id: 'blocked.cell',
        owner: 'blocked-owner',
        evidence: [],
        timeoutMs: 100,
      },
    ],
  };
  const order = new ClosedMatrixExecution(matrix);
  await assert.rejects(
    order.run('blocked.cell', async () => ({ evidence: [] })),
    /order mismatch/u,
  );
  assert.equal(order.state.snapshot()[0].status, 'blocked');
  const timed = new ClosedMatrixExecution(matrix);
  await assert.rejects(
    timed.run('timed.cell', async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { evidence: [{ kind: 'timing' }] };
    }),
    /closed acceptance matrix aborted/u,
  );
  assert.equal(timed.state.snapshot()[0].status, 'fail');
  assert.equal(timed.state.snapshot()[1].failure.blockedBy, 'timed.cell');
});

test('closed matrix timeout interrupts a never-settling action and records the owner failure', async () => {
  const execution = new ClosedMatrixExecution(
    {
      cells: [
        {
          id: 'never.cell',
          owner: 'never-owner',
          evidence: [],
          timeoutMs: 20,
        },
      ],
    },
    { abortDrainMs: 10 },
  );
  const started = performance.now();
  await assert.rejects(
    execution.run('never.cell', async () => new Promise(() => {})),
    /closed acceptance matrix aborted/u,
  );
  assert.ok(performance.now() - started < 250);
  const [cell] = execution.state.snapshot();
  assert.equal(cell.status, 'fail');
  assert.match(cell.failure.summary, /exceeded its closed 20 ms timeout/u);
});

test('closed matrix timeout revokes late evidence writes from an action', async () => {
  const { runRoot } = allocateRunRoot();
  const execution = new ClosedMatrixExecution(
    {
      cells: [
        {
          id: 'late-write.cell',
          owner: 'late-write-owner',
          evidence: [],
          timeoutMs: 20,
        },
      ],
    },
    { abortDrainMs: 100 },
  );
  try {
    await assert.rejects(
      execution.run('late-write.cell', async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        await writeEvidence({
          runRoot,
          relative: 'evidence/late-write.json',
          kind: 'lateWrite',
          value: { forbidden: true },
          summary: 'must not be written',
        });
        return { evidence: [] };
      }),
      /closed acceptance matrix aborted/u,
    );
    assert.equal(fs.existsSync(path.join(runRoot, 'evidence', 'late-write.json')), false);
  } finally {
    cleanupRunRoot(runRoot);
  }
});

test('closed matrix timeout rejects direct filesystem writes resolved outside the action causal chain', async () => {
  const { runRoot } = allocateRunRoot();
  const output = path.join(runRoot, 'evidence', 'direct-late-write.json');
  const execution = new ClosedMatrixExecution(
    {
      cells: [
        {
          id: 'direct-late-write.cell',
          owner: 'direct-late-write-owner',
          evidence: [],
          timeoutMs: 20,
        },
      ],
    },
    { abortDrainMs: 10 },
  );
  let release;
  const outside = new Promise((resolve) => {
    release = resolve;
  });
  const outsideTimer = setTimeout(release, 80);
  try {
    await assert.rejects(
      execution.run('direct-late-write.cell', async () => {
        await outside;
        fs.writeFileSync(output, 'forbidden\n');
        return { evidence: [] };
      }),
      /closed acceptance matrix aborted/u,
    );
    assert.equal(fs.existsSync(output), false);
    assert.equal(execution.boundaryRevocations.length, 1);
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(
      execution.boundaryRevocations[0].writeViolations.includes(
        'fs.writeFileSync',
      ),
      true,
    );
    assert.equal(fs.existsSync(output), false);
  } finally {
    clearTimeout(outsideTimer);
    cleanupRunRoot(runRoot);
  }
});

test('closed matrix timeout cancels an owned delayed timer before it can write', async () => {
  const { runRoot } = allocateRunRoot();
  const output = path.join(runRoot, 'evidence', 'timer-late-write.json');
  const execution = new ClosedMatrixExecution(
    {
      cells: [
        {
          id: 'timer-late-write.cell',
          owner: 'timer-late-write-owner',
          evidence: [],
          timeoutMs: 20,
        },
      ],
    },
    { abortDrainMs: 10 },
  );
  let callbackRan = false;
  try {
    await assert.rejects(
      execution.run('timer-late-write.cell', async () => {
        setTimeout(() => {
          callbackRan = true;
          fs.writeFileSync(output, 'forbidden\n');
        }, 80);
        return new Promise(() => {});
      }),
      /closed acceptance matrix aborted/u,
    );
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert.equal(callbackRan, false);
    assert.equal(fs.existsSync(output), false);
    assert.ok(
      (execution.boundaryRevocations[0].resourcesAtRevoke.Timeout ?? 0) >= 1,
    );
  } finally {
    cleanupRunRoot(runRoot);
  }
});

test('closed matrix timeout revokes runCommand logs after the bounded drain', async () => {
  const { runRoot } = allocateRunRoot();
  const execution = new ClosedMatrixExecution(
    {
      cells: [
        {
          id: 'runner-late-write.cell',
          owner: 'runner-late-write-owner',
          evidence: [],
          timeoutMs: 20,
        },
      ],
    },
    { abortDrainMs: 10 },
  );
  try {
    await assert.rejects(
      execution.run('runner-late-write.cell', () =>
        runCommand({
          id: 'runner-late-write',
          executable: '/bin/sh',
          args: ['-c', 'trap "" TERM; sleep 1; printf late'],
          cwd: runRoot,
          environment: sanitizedEnvironment({
            runRoot,
            pathEntries: ['/usr/bin', '/bin'],
          }),
          timeoutMs: 1_000,
          gracefulStopMs: 100,
          runRoot,
        }),
      ),
      /closed acceptance matrix aborted/u,
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(
      fs.existsSync(
        path.join(
          runRoot,
          'evidence',
          'commands',
          'runner-late-write.stdout',
        ),
      ),
      false,
    );
    assert.equal(
      fs.existsSync(
        path.join(
          runRoot,
          'evidence',
          'commands',
          'runner-late-write.stderr',
        ),
      ),
      false,
    );
    assert.ok(
      execution.boundaryRevocations[0].writeViolationCount >= 1,
    );
  } finally {
    cleanupRunRoot(runRoot);
  }
});

test('successful matrix action resources remain usable by the next cell', async () => {
  const execution = new ClosedMatrixExecution({
    cells: [
      {
        id: 'runtime.start',
        owner: 'runtime-owner',
        evidence: [],
        timeoutMs: 100,
      },
      {
        id: 'runtime.use',
        owner: 'runtime-owner',
        evidence: [],
        timeoutMs: 100,
      },
    ],
  });
  let ticks = 0;
  let interval;
  await execution.run('runtime.start', async () => {
    interval = setInterval(() => {
      ticks += 1;
    }, 5);
    return { evidence: [] };
  });
  try {
    await execution.run('runtime.use', async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      assert.ok(ticks > 0);
      return { evidence: [] };
    });
  } finally {
    clearInterval(interval);
  }
  assert.equal(execution.state.complete, true);
});

test('a later timeout revokes resources retained by every earlier passing cell', async () => {
  const { runRoot } = allocateRunRoot();
  const output = path.join(runRoot, 'late-prior-cell-write');
  const execution = new ClosedMatrixExecution({
    cells: [
      {
        id: 'runtime.start',
        owner: 'runtime-owner',
        evidence: [],
        timeoutMs: 100,
      },
      {
        id: 'runtime.timeout',
        owner: 'runtime-owner',
        evidence: [],
        timeoutMs: 20,
      },
    ],
  });
  try {
    await execution.run('runtime.start', async () => {
      setTimeout(() => fs.writeFileSync(output, 'late'), 100);
      return { evidence: [] };
    });
    await assert.rejects(
      execution.run('runtime.timeout', async () => {
        await new Promise(() => {});
      }),
      /closed acceptance matrix aborted/u,
    );
    await new Promise((resolve) => setTimeout(resolve, 140));
    assert.equal(fs.existsSync(output), false);
    assert.equal(execution.boundaryRevocations.length, 2);
  } finally {
    cleanupRunRoot(runRoot);
  }
});

test('closed matrix execution requires exact cache compatibility phase evidence kinds', async () => {
  const { matrix } = loadAcceptanceConfiguration();
  const sourceCell = matrix.cells.find(({ id }) => id === 'admission.sources');
  const cleanupCell = matrix.cells.find(({ id }) => id === 'residue.cleanup');
  assert.ok(sourceCell);
  assert.ok(cleanupCell);

  const exact = new ClosedMatrixExecution({
    cells: [sourceCell, cleanupCell],
  });
  await exact.run(sourceCell.id, async () => ({
    evidence: sourceCell.evidence.map((kind) => ({ kind })),
  }));
  await exact.run(cleanupCell.id, async () => ({
    evidence: cleanupCell.evidence.map((kind) => ({ kind })),
  }));
  assert.equal(exact.state.complete, true);

  const stale = new ClosedMatrixExecution({
    cells: [sourceCell],
  });
  await assert.rejects(
    stale.run(sourceCell.id, async () => ({
      evidence: sourceCell.evidence.map((kind) => ({
        kind:
          kind === 'cacheCompatibilityPreAdmission'
            ? 'cacheCompatibility'
            : kind,
      })),
    })),
    /closed acceptance matrix aborted/u,
  );
  assert.match(
    stale.state.snapshot()[0].failure.summary,
    /omitted required evidence: cacheCompatibilityPreAdmission/u,
  );
});

test('owning cells attribute setup and journey failures before blocking later work', async () => {
  for (const cellId of [
    'archive.copy',
    'updater.doctor',
    'api.candidates',
    'frontend.serve',
  ]) {
    const execution = new ClosedMatrixExecution({
      cells: [
        {
          id: cellId,
          owner: `${cellId}-owner`,
          evidence: [],
          timeoutMs: 1_000,
        },
        {
          id: `${cellId}.later`,
          owner: 'later-owner',
          evidence: [],
          timeoutMs: 1_000,
        },
      ],
    });
    await assert.rejects(
      execution.run(cellId, async () => {
        await new Promise((resolve) => setTimeout(resolve, 2));
        throw new Error(`${cellId} owned setup failed`);
      }),
      /closed acceptance matrix aborted/u,
    );
    const [failed, blocked] = execution.state.snapshot();
    assert.equal(failed.status, 'fail');
    assert.equal(failed.failure.summary, `${cellId} owned setup failed`);
    assert.equal(blocked.status, 'blocked');
    assert.equal(blocked.failure.blockedBy, cellId);
  }
});

test('protected input seal is phase-neutral but binds cache compatibility content', () => {
  const compatibility = {
    phase: 'preAdmission',
    authoritySetSha256: digest('1'),
    revisions: {
      preparedFromRevision: '1'.repeat(40),
      productRevision: '2'.repeat(40),
      harnessRevision: '3'.repeat(40),
      oracleRevision: '4'.repeat(40),
    },
    counts: { authorities: 16, npmLocks: 13 },
    authorities: [{ index: 0, sha256: digest('2') }],
    seals: {
      cacheManifestSha256: digest('3'),
      cacheRootSha256: digest('4'),
    },
  };
  const arguments_ = {
    archive: {
      identity: {
        dataVersion: `dv1-${'5'.repeat(64)}`,
        manifestDigest: digest('6'),
        sqliteDigest: digest('7'),
      },
      sourceSeal: { digest: digest('8') },
    },
    artifacts: {
      seals: Object.fromEntries(
        ['backend', 'updater', 'frontend', 'compatibility'].map((name) => [
          name,
          { digest: digest('9'), identityDigest: digest('a') },
        ]),
      ),
    },
    cache: { digest: digest('b'), rootSeal: digest('c') },
    cacheCompatibility: compatibility,
    provenance: {
      identity: { provenanceDigest: digest('d') },
      sourceSeal: { digest: digest('e') },
    },
    sources: {
      product: { revision: '1'.repeat(40), tree: '2'.repeat(40) },
      harness: { revision: '3'.repeat(40), tree: '4'.repeat(40) },
    },
    tools: {
      identities: {
        node: { version: 'node 24', sha256: digest('1') },
        git: { version: 'git 2', sha256: digest('2') },
        tar: { version: 'tar 3', sha256: digest('3') },
      },
      runtimeClosures: { node: digest('f') },
      browser: { executableDigest: digest('0') },
    },
  };
  const before = protectedInputSeal(arguments_);
  const postCleanup = structuredClone(compatibility);
  postCleanup.phase = 'postCleanup';
  postCleanup.authoritySetSha256 = digest('f');
  assert.equal(
    protectedInputSeal({
      ...arguments_,
      cacheCompatibility: postCleanup,
    }),
    before,
  );
  postCleanup.authorities[0].sha256 = digest('0');
  assert.notEqual(
    protectedInputSeal({
      ...arguments_,
      cacheCompatibility: postCleanup,
    }),
    before,
  );
  const changedTool = structuredClone(arguments_);
  changedTool.tools.identities.tar.sha256 = digest('4');
  assert.notEqual(protectedInputSeal(changedTool), before);
});

test('Go bootstrap rejects a marker backed by a partial fake toolchain', () => {
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), 'bgmss-fake-go-')),
  );
  try {
    const toolchain = path.join(
      root,
      'golang.org',
      'toolchain@v0.0.1-go1.26.5.darwin-arm64',
    );
    fs.mkdirSync(path.join(toolchain, 'bin'), { recursive: true });
    fs.writeFileSync(
      path.join(toolchain, 'VERSION'),
      'go1.26.5\ntime 2026-07-01T21:24:27Z\n',
    );
    fs.writeFileSync(path.join(toolchain, 'bin', 'go'), 'fake\n', { mode: 0o700 });
    fs.writeFileSync(path.join(toolchain, 'bin', 'gofmt'), 'fake\n', { mode: 0o700 });
    fs.writeFileSync(
      path.join(root, '.seed-complete'),
      canonicalJson({
        schemaVersion: 1,
        sourceDigest: digest('1'),
        moduleFileCount: 1,
        toolchainFileCount: 1_000,
        toolchainVersion: 'go1.26.5',
      }),
    );
    assert.throws(
      () => validateSeededGoToolchain(root),
      /pkg\/tool\/darwin_arm64\/compile/u,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('cache copy accepts a nested read-only source and creates independent bytes', () => {
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), 'acceptance-cache-copy-')),
  );
  const source = path.join(root, 'source');
  const nested = path.join(source, 'one', 'two');
  const destination = path.join(root, 'destination');
  fs.mkdirSync(nested, { recursive: true, mode: 0o700 });
  const sourceFile = path.join(nested, 'entry');
  fs.writeFileSync(sourceFile, 'sealed cache byte\n', { mode: 0o444 });
  fs.chmodSync(nested, 0o555);
  fs.chmodSync(path.dirname(nested), 0o555);
  fs.chmodSync(source, 0o555);
  try {
    const nestedDestination = path.join(source, 'nested-copy');
    assert.throws(
      () => copyCacheTree(source, nestedDestination),
      /source and destination overlap/u,
    );
    assert.equal(fs.existsSync(nestedDestination), false);
    const caseAliasedSource = path.join(root, 'SOURCE');
    if (
      fs.existsSync(caseAliasedSource) &&
      fs.realpathSync.native(caseAliasedSource) === source
    ) {
      const caseAliasedDestination = path.join(
        caseAliasedSource,
        'case-aliased-copy',
      );
      assert.throws(
        () => copyCacheTree(source, caseAliasedDestination),
        /source and destination overlap/u,
      );
      assert.equal(fs.existsSync(caseAliasedDestination), false);
    }
    copyCacheTree(source, destination);
    assert.equal(
      fs.readFileSync(path.join(destination, 'one', 'two', 'entry'), 'utf8'),
      'sealed cache byte\n',
    );
    const before = fs.statSync(sourceFile);
    const after = fs.statSync(path.join(destination, 'one', 'two', 'entry'));
    assert.notEqual(`${before.dev}:${before.ino}`, `${after.dev}:${after.ino}`);
    for (const relative of ['', 'one', 'one/two']) {
      assert.equal(
        fs.statSync(path.join(destination, relative)).mode & 0o777,
        fs.statSync(path.join(source, relative)).mode & 0o777,
      );
    }
    assert.throws(
      () => fs.writeFileSync(path.join(destination, 'forbidden'), 'mutation'),
      { code: 'EACCES' },
    );
  } finally {
    for (const candidate of [source, destination]) {
      if (!fs.existsSync(candidate)) continue;
      fs.chmodSync(candidate, 0o700);
      fs.chmodSync(path.join(candidate, 'one'), 0o700);
      fs.chmodSync(path.join(candidate, 'one', 'two'), 0o700);
    }
    fs.rmSync(root, { recursive: true });
  }
});

test('whole frozen cache seal detects same-size mutation of an otherwise unreferenced file', async () => {
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), 'acceptance-cache-seal-')),
  );
  const candidate = path.join(root, 'unreferenced.log');
  fs.writeFileSync(candidate, 'AAAA', { mode: 0o444 });
  fs.chmodSync(root, 0o555);
  try {
    const before = await sealFrozenCacheTree(root);
    fs.chmodSync(candidate, 0o644);
    fs.writeFileSync(candidate, 'BBBB');
    fs.chmodSync(candidate, 0o444);
    const after = await sealFrozenCacheTree(root);
    assert.notEqual(after.digest, before.digest);
  } finally {
    fs.chmodSync(root, 0o700);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('complete immutable tool-tree seal rejects hard links and detects mode changes', async () => {
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), 'acceptance-tool-tree-')),
  );
  const file = path.join(root, 'tool');
  const empty = path.join(root, 'empty');
  fs.writeFileSync(file, 'tool\n', { mode: 0o555 });
  fs.mkdirSync(empty, { mode: 0o755 });
  try {
    const before = await sealDirectoryTree(root);
    fs.chmodSync(file, 0o444);
    const after = await sealDirectoryTree(root);
    assert.notEqual(after.digest, before.digest);
    fs.chmodSync(empty, 0o700);
    const directoryMode = await sealDirectoryTree(root);
    assert.notEqual(directoryMode.digest, after.digest);
    fs.mkdirSync(path.join(root, 'new-empty'));
    const newDirectory = await sealDirectoryTree(root);
    assert.notEqual(newDirectory.digest, directoryMode.digest);
    fs.linkSync(file, path.join(root, 'hardlink'));
    await assert.rejects(sealDirectoryTree(root), /hard-linked file/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('artifact roots reject writable files, hard links, and same-byte inode replacement', async () => {
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), 'bgmss-artifact-seal-')),
  );
  const file = path.join(root, 'artifact.bin');
  const external = path.join(path.dirname(root), `${path.basename(root)}-external`);
  try {
    fs.writeFileSync(file, 'artifact');
    fs.chmodSync(file, 0o444);
    fs.chmodSync(root, 0o555);
    const before = await sealImmutableArtifactRoot(root);
    fs.chmodSync(root, 0o755);
    fs.chmodSync(file, 0o644);
    fs.chmodSync(root, 0o555);
    await assert.rejects(
      sealImmutableArtifactRoot(root),
      /writable file/u,
    );
    fs.chmodSync(file, 0o444);
    fs.linkSync(file, external);
    fs.chmodSync(root, 0o555);
    await assert.rejects(
      sealImmutableArtifactRoot(root),
      /hard-linked file/u,
    );
    fs.unlinkSync(external);
    fs.chmodSync(root, 0o755);
    fs.chmodSync(file, 0o644);
    fs.renameSync(file, `${file}.old`);
    fs.writeFileSync(file, 'artifact');
    fs.chmodSync(file, 0o444);
    fs.unlinkSync(`${file}.old`);
    fs.chmodSync(root, 0o555);
    const replaced = await sealImmutableArtifactRoot(root);
    assert.throws(
      () => assertSameSeal(before, replaced, 'artifact'),
      /changed during acceptance/u,
    );
  } finally {
    if (fs.existsSync(external)) fs.unlinkSync(external);
    if (fs.existsSync(root)) {
      fs.chmodSync(root, 0o755);
      for (const entry of fs.readdirSync(root)) {
        fs.chmodSync(path.join(root, entry), 0o644);
      }
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('parent runtime aggregate closes non-executable members on green and abnormal reseal', async (t) => {
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), 'bgmss-parent-runtime-')),
  );
  t.after(() => removeReadOnlyFixtureTree(root));
  const directory = (name, files) => {
    const candidate = path.join(root, name);
    for (const [relative, bytes, mode] of files) {
      const absolute = path.join(candidate, relative);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, bytes, { mode });
    }
    return candidate;
  };
  const currentNode = directory('current-node', [
    ['bin/node', 'node\n', 0o555],
    ['lib/node-runtime.dat', 'runtime\n', 0o444],
  ]);
  const queryNode = directory('query-node', [
    ['bin/node', 'query-node\n', 0o555],
  ]);
  const currentNpm = directory('current-npm/npm', [
    ['bin/npm-cli.js', 'npm\n', 0o555],
    ['lib/npm-runtime.js', 'module\n', 0o444],
  ]);
  const queryNpm = directory('query-npm/npm', [
    ['bin/npm-cli.js', 'query-npm\n', 0o555],
  ]);
  const currentGo = directory('current-go', [
    ['bin/go', 'go\n', 0o555],
  ]);
  const historicalGo = directory('historical-go', [
    ['bin/go', 'query-go\n', 0o555],
    ['bin/gofmt', 'query-gofmt\n', 0o555],
  ]);
  const python = directory('python', [
    ['bin/python3', 'python\n', 0o555],
    ['lib/stdlib.py', 'value = 1\n', 0o444],
  ]);
  const browser = directory('browser', [
    ['chromium', 'browser\n', 0o555],
    ['resources.pak', 'resource\n', 0o444],
  ]);
  const uv = path.join(root, 'uv');
  const docker = path.join(root, 'docker');
  fs.writeFileSync(uv, 'uv\n', { mode: 0o555 });
  fs.writeFileSync(docker, 'docker\n', { mode: 0o555 });
  const distribution = (runtimeRoot, classification, allowLinks = false) => ({
    classification,
    copied: false,
    hermetic: false,
    root: runtimeRoot,
    sealKind: 'distributionTree',
    sealOptions: Object.freeze({ allowInternalSymlinks: allowLinks }),
    shape: 'directory',
  });
  const tree = (runtimeRoot, classification) => ({
    classification,
    copied: false,
    hermetic: false,
    root: runtimeRoot,
    sealKind: 'directoryTree',
    sealOptions: Object.freeze({}),
    shape: 'directory',
  });
  const single = (runtimePath) => ({
    classification: 'read-only-source',
    copied: false,
    hermetic: false,
    root: runtimePath,
    sealKind: 'singleFile',
    sealOptions: Object.freeze({}),
    shape: 'single-file',
  });
  const specifications = Object.freeze({
    currentNodeSource: distribution(
      currentNode,
      'read-only-source',
      true,
    ),
    queryNode: distribution(
      queryNode,
      'owner-fixed-in-place',
      true,
    ),
    currentNpmSource: tree(currentNpm, 'read-only-source'),
    queryNpm: tree(queryNpm, 'owner-fixed-in-place'),
    currentGoSource: distribution(currentGo, 'read-only-source'),
    historicalGo: tree(historicalGo, 'owner-fixed-in-place'),
    pythonSource: distribution(python, 'read-only-source', true),
    uvSource: single(uv),
    dockerSource: single(docker),
    browserSource: tree(browser, 'read-only-source'),
  });
  const attest = async () =>
    sealSupervisorRuntimeClosures(
      (await attestRuntimeClosureSpecifications(specifications))
        .runtimeClosures,
    );
  const before = await attest();
  const green = await attest();
  assert.deepEqual(green, before);
  assert.deepEqual(
    Object.keys(before.document.runtimeClosures),
    Object.keys(specifications),
  );
  assert.equal(JSON.stringify(before.document).includes(root), false);
  for (const identity of Object.values(
    before.document.runtimeClosures,
  )) {
    assert.deepEqual(Object.keys(identity).sort(), [
      'classification',
      'copied',
      'hermetic',
      'identityDigest',
      'rootDigest',
      'shape',
    ]);
  }

  const nonExecutableMember = path.join(python, 'lib', 'stdlib.py');
  fs.chmodSync(nonExecutableMember, 0o644);
  fs.writeFileSync(nonExecutableMember, 'value = 2\n');
  fs.chmodSync(nonExecutableMember, 0o444);
  const abnormal = await attest();
  assert.notEqual(abnormal.digest, before.digest);
  assert.notEqual(
    abnormal.document.runtimeClosures.pythonSource.rootDigest,
    before.document.runtimeClosures.pythonSource.rootDigest,
  );
  await assert.rejects(
    attestInputRuntimeClosures({
      browser: { executablePath: path.join(browser, 'chromium') },
      caches: { browser },
      tools: {
        node: { path: path.join(currentNode, 'bin', 'node') },
        npm: { path: path.join(currentNpm, 'bin', 'npm-cli.js') },
        go: { path: path.join(currentGo, 'bin', 'go') },
        python: { path: path.join(python, 'bin', 'python3') },
        uv: { path: uv },
        docker: { path: docker },
        queryNode: { path: path.join(queryNode, 'bin', 'node') },
        queryNpm: {
          path: path.join(queryNpm, 'bin', 'npm-cli.js'),
        },
        queryGo: { path: path.join(historicalGo, 'bin', 'go') },
        queryGofmt: {
          path: path.join(historicalGo, 'bin', 'gofmt'),
        },
      },
    }),
    /exact owner-fixed GOROOT/u,
  );
});

test('runtime distributions close internal links and browser copies use new inodes', async (t) => {
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), 'bgmss-runtime-roots-')),
  );
  t.after(() => {
    for (const directory of ['browser-source', 'browser-copy', 'python']) {
      const candidate = path.join(root, directory);
      if (!fs.existsSync(candidate)) continue;
      for (const entry of fs.readdirSync(candidate)) {
        const absolute = path.join(candidate, entry);
        if (!fs.lstatSync(absolute).isSymbolicLink()) fs.chmodSync(absolute, 0o700);
      }
      fs.chmodSync(candidate, 0o700);
    }
    fs.rmSync(root, { recursive: true, force: true });
  });
  const python = path.join(root, 'python');
  fs.mkdirSync(python);
  fs.writeFileSync(path.join(python, 'python3.14'), 'runtime');
  fs.symlinkSync('python3.14', path.join(python, 'python3'));
  const pythonSeal = await sealDistributionTree(python, {
    allowInternalSymlinks: true,
  });
  assert.equal(
    pythonSeal.entries.find((entry) => entry.path === 'python3')?.target,
    'python3.14',
  );
  fs.symlinkSync('/private/tmp', path.join(python, 'escape'));
  await assert.rejects(
    sealDistributionTree(python, { allowInternalSymlinks: true }),
    /escapes its root/u,
  );
  fs.unlinkSync(path.join(python, 'escape'));

  const source = path.join(root, 'browser-source');
  const destination = path.join(root, 'browser-copy');
  fs.mkdirSync(source);
  const executable = path.join(source, 'headless-shell');
  fs.writeFileSync(executable, 'browser');
  fs.chmodSync(executable, 0o555);
  fs.chmodSync(source, 0o555);
  const admittedSourceSeal = await sealDirectoryTree(source);
  const nestedDestination = path.join(source, 'nested-copy');
  await assert.rejects(
    copyBrowserDistribution({
      sourceRoot: source,
      sourceExecutable: executable,
      destinationRoot: nestedDestination,
      expectedExecutableDigest:
        `sha256:${createHash('sha256').update('browser').digest('hex')}`,
      admittedSourceSeal,
    }),
    /source and destination overlap/u,
  );
  assert.equal(fs.existsSync(nestedDestination), false);
  assertSameSeal(
    admittedSourceSeal,
    await sealDirectoryTree(source),
    'overlap-rejected browser source',
  );
  const copied = await copyBrowserDistribution({
    sourceRoot: source,
    sourceExecutable: executable,
    destinationRoot: destination,
    expectedExecutableDigest:
      `sha256:${createHash('sha256').update('browser').digest('hex')}`,
    admittedSourceSeal,
  });
  assert.equal(copied.sourceSeal, admittedSourceSeal);
  const sourceInformation = fs.statSync(executable);
  const copyInformation = fs.statSync(copied.executablePath);
  assert.notEqual(
    `${sourceInformation.dev}:${sourceInformation.ino}`,
    `${copyInformation.dev}:${copyInformation.ino}`,
  );
});

test('nested npm seals derive exactly from a validated Node distribution', async (t) => {
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), 'bgmss-npm-derived-seal-')),
  );
  t.after(() => removeReadOnlyFixtureTree(root));
  const nodeRoot = path.join(root, 'node');
  const npmRoot = path.join(nodeRoot, 'lib', 'node_modules', 'npm');
  fs.mkdirSync(path.join(npmRoot, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(nodeRoot, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(npmRoot, 'bin', 'npm-cli.js'), 'npm\n', {
    mode: 0o555,
  });
  fs.writeFileSync(path.join(npmRoot, 'package.json'), '{"name":"npm"}\n', {
    mode: 0o444,
  });
  fs.writeFileSync(path.join(nodeRoot, 'bin', 'node'), 'node\n', {
    mode: 0o555,
  });
  fs.symlinkSync(
    '../lib/node_modules/npm/bin/npm-cli.js',
    path.join(nodeRoot, 'bin', 'npm'),
  );
  const parentSeal = await sealDistributionTree(nodeRoot, {
    allowInternalSymlinks: true,
  });
  const derived = deriveNestedDirectoryTreeSeal(
    parentSeal,
    npmRoot,
    'fixture npm root',
  );
  const physical = await sealDirectoryTree(npmRoot);
  assertSameSeal(physical, derived, 'derived npm seal');
  assert.equal(derived.root, fs.realpathSync.native(npmRoot));
  const derivedCopy = path.join(root, 'derived-copy');
  await assert.rejects(
    copyRuntimeDistribution({
      sourceRoot: npmRoot,
      destinationRoot: derivedCopy,
      admittedSourceSeal: derived,
    }),
    /was not minted by the active seal authority/u,
  );
  assert.equal(fs.existsSync(derivedCopy), false);

  const linkedNpm = path.join(nodeRoot, 'lib', 'node_modules', 'linked-npm');
  fs.mkdirSync(linkedNpm);
  fs.writeFileSync(path.join(linkedNpm, 'target'), 'target\n');
  fs.symlinkSync('target', path.join(linkedNpm, 'link'));
  const linkedParentSeal = await sealDistributionTree(nodeRoot, {
    allowInternalSymlinks: true,
  });
  assert.throws(
    () =>
      deriveNestedDirectoryTreeSeal(
        linkedParentSeal,
        linkedNpm,
        'linked npm root',
      ),
    /contains a link or shape mismatch/u,
  );

  const absentAtSeal = path.join(nodeRoot, 'lib', 'node_modules', 'late-npm');
  const beforeLateRoot = await sealDistributionTree(nodeRoot, {
    allowInternalSymlinks: true,
  });
  fs.mkdirSync(absentAtSeal);
  assert.throws(
    () =>
      deriveNestedDirectoryTreeSeal(
        beforeLateRoot,
        absentAtSeal,
        'late npm root',
      ),
    /root traverses a link or missing parent/u,
  );

  const npmPrefix = path
    .relative(nodeRoot, npmRoot)
    .split(path.sep)
    .join('/');
  const mismatchedIdentities = parentSeal.identities.map((identity) =>
    identity.path === npmPrefix
      ? { ...identity, kind: 'file' }
      : identity,
  );
  assert.throws(
    () =>
      deriveNestedDirectoryTreeSeal(
        rebuiltSeal(parentSeal, {
          identities: mismatchedIdentities,
        }),
        npmRoot,
        'mismatched npm root',
      ),
    /entry and identity shape differs/u,
  );
  const duplicateEntries = [
    ...parentSeal.entries,
    { ...parentSeal.entries.at(-1) },
  ];
  const duplicateIdentities = [
    ...parentSeal.identities,
    { ...parentSeal.identities.at(-1) },
  ];
  assert.throws(
    () =>
      deriveNestedDirectoryTreeSeal(
        rebuiltSeal(parentSeal, {
          entries: duplicateEntries,
          identities: duplicateIdentities,
        }),
        npmRoot,
        'duplicate npm root',
      ),
    /path is not canonical and ordered/u,
  );
  assert.throws(
    () =>
      deriveNestedDirectoryTreeSeal(
        { ...parentSeal, canonical: 'forged\n' },
        npmRoot,
        'forged npm root',
      ),
    /seal is not self-consistent/u,
  );
  const npmLink = path.join(nodeRoot, 'npm-link');
  fs.symlinkSync(path.relative(nodeRoot, npmRoot), npmLink);
  assert.throws(
    () =>
      deriveNestedDirectoryTreeSeal(
        parentSeal,
        npmLink,
        'symlink npm root',
      ),
    /must not be a symlink/u,
  );
});

test('runtime closure admission drains later seals before ordered rejection', async (t) => {
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), 'bgmss-runtime-drain-')),
  );
  t.after(() => removeReadOnlyFixtureTree(root));
  const source = path.join(root, 'later-source');
  fs.mkdirSync(source);
  for (let index = 0; index < 32; index += 1) {
    fs.writeFileSync(
      path.join(source, `entry-${String(index).padStart(2, '0')}`),
      Buffer.alloc(64 * 1024, index),
      { mode: 0o444 },
    );
  }
  const finalEntry = path.join(source, 'entry-31');
  const originalLstatSync = fs.lstatSync;
  let finalEntryObserved = false;
  fs.lstatSync = (candidate, ...arguments_) => {
    if (candidate === finalEntry) finalEntryObserved = true;
    return originalLstatSync(candidate, ...arguments_);
  };
  try {
    await assert.rejects(
      attestRuntimeClosureSpecifications({
        declaredFirstFailure: {
          classification: 'read-only-source',
          root: source,
          sealKind: 'unsupported-fixture-kind',
          shape: 'directory',
        },
        laterSeal: {
          classification: 'read-only-source',
          root: source,
          sealKind: 'distributionTree',
          sealOptions: Object.freeze({ allowInternalSymlinks: false }),
          shape: 'directory',
        },
        declaredLaterFailure: {
          classification: 'read-only-source',
          root: source,
          sealKind: 'another-unsupported-fixture-kind',
          shape: 'directory',
        },
      }),
      /unknown runtime closure seal kind unsupported-fixture-kind/u,
    );
    assert.equal(finalEntryObserved, true);
  } finally {
    fs.lstatSync = originalLstatSync;
  }
});

test('runtime distribution and single-file copies preserve bytes but reject later mutation', async (t) => {
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), 'bgmss-runtime-copy-')),
  );
  t.after(() => removeReadOnlyFixtureTree(root));
  const source = path.join(root, 'source');
  fs.mkdirSync(path.join(source, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(source, 'bin', 'tool-real'), 'runtime\n', {
    mode: 0o755,
  });
  fs.writeFileSync(path.join(source, 'runtime.dat'), 'writable source\n', {
    mode: 0o644,
  });
  fs.symlinkSync('tool-real', path.join(source, 'bin', 'tool'));
  const admittedSourceSeal = await sealDistributionTree(source, {
    allowInternalSymlinks: true,
  });
  const copied = await copyRuntimeDistribution({
    sourceRoot: source,
    destinationRoot: path.join(root, 'copy'),
    allowInternalSymlinks: true,
    admittedSourceSeal,
  });
  assert.equal(copied.sourceSeal, admittedSourceSeal);
  assert.notEqual(
    copied.sourceSeal.identityDigest,
    copied.copiedSeal.identityDigest,
  );
  const sourceInodes = new Set(
    copied.sourceSeal.identities.map(
      (identity) => `${identity.device}:${identity.inode}`,
    ),
  );
  assert.equal(
    copied.copiedSeal.identities.some((identity) =>
      sourceInodes.has(`${identity.device}:${identity.inode}`),
    ),
    false,
  );
  assert.equal(
    fs.lstatSync(path.join(copied.root, 'bin', 'tool-real')).mode & 0o777,
    0o555,
  );
  assert.equal(
    fs.lstatSync(path.join(copied.root, 'runtime.dat')).mode & 0o777,
    0o444,
  );
  assert.equal(
    copied.copiedSeal.entries
      .filter((entry) => ['directory', 'file'].includes(entry.kind))
      .every((entry) => (entry.mode & 0o222) === 0),
    true,
  );
  assert.equal(
    fs.readlinkSync(path.join(copied.root, 'bin', 'tool')),
    'tool-real',
  );
  assertSameSeal(
    copied.copiedSeal,
    await sealDistributionTree(copied.root, {
      allowInternalSymlinks: true,
    }),
  );
  fs.chmodSync(path.join(copied.root, 'bin', 'tool-real'), 0o755);
  const changedDistribution = await sealDistributionTree(copied.root, {
    allowInternalSymlinks: true,
  });
  assert.throws(
    () => assertSameSeal(copied.copiedSeal, changedDistribution),
    /changed during acceptance/u,
  );

  const sourceFile = path.join(root, 'single-source');
  fs.writeFileSync(sourceFile, 'single\n', { mode: 0o755 });
  const admittedFileSeal = await sealSingleFileDistribution(sourceFile);
  const copiedFile = await copySingleFileRuntime({
    sourcePath: sourceFile,
    destinationPath: path.join(root, 'single-copy'),
    admittedSourceSeal: admittedFileSeal,
  });
  assert.equal(copiedFile.sourceSeal, admittedFileSeal);
  assert.notEqual(
    copiedFile.sourceSeal.identityDigest,
    copiedFile.copiedSeal.identityDigest,
  );
  assert.equal(fs.lstatSync(copiedFile.path).mode & 0o777, 0o555);
  fs.chmodSync(copiedFile.path, 0o755);
  const changedFile = await sealSingleFileDistribution(copiedFile.path);
  assert.throws(
    () => assertSameSeal(copiedFile.copiedSeal, changedFile),
    /changed during acceptance/u,
  );

  const staleSource = path.join(root, 'stale-source');
  fs.mkdirSync(staleSource);
  const staleTool = path.join(staleSource, 'tool');
  fs.writeFileSync(staleTool, 'before\n', { mode: 0o555 });
  const staleSeal = await sealDistributionTree(staleSource);
  fs.chmodSync(staleTool, 0o755);
  fs.writeFileSync(staleTool, 'after\n');
  fs.chmodSync(staleTool, 0o555);
  await assert.rejects(
    copyRuntimeDistribution({
      sourceRoot: staleSource,
      destinationRoot: path.join(root, 'stale-copy'),
      admittedSourceSeal: staleSeal,
    }),
    /source changed before copy/u,
  );

  const unrelatedSource = path.join(root, 'unrelated-source');
  fs.mkdirSync(unrelatedSource);
  fs.writeFileSync(path.join(unrelatedSource, 'tool'), 'unrelated\n', {
    mode: 0o555,
  });
  const unrelatedSeal = await sealDistributionTree(unrelatedSource);
  await assert.rejects(
    copyRuntimeDistribution({
      sourceRoot: source,
      destinationRoot: path.join(root, 'wrong-seal-copy'),
      admittedSourceSeal: unrelatedSeal,
    }),
    /admitted source seal does not identify its source/u,
  );

  const overlapSource = path.join(root, 'overlap-source');
  fs.mkdirSync(overlapSource);
  fs.writeFileSync(path.join(overlapSource, 'tool'), 'overlap\n', {
    mode: 0o555,
  });
  const overlapSeal = await sealDistributionTree(overlapSource);
  const nestedDestination = path.join(overlapSource, 'nested-copy');
  await assert.rejects(
    copyRuntimeDistribution({
      sourceRoot: overlapSource,
      destinationRoot: nestedDestination,
      admittedSourceSeal: overlapSeal,
    }),
    /source and destination overlap/u,
  );
  assert.equal(fs.existsSync(nestedDestination), false);
  assertSameSeal(
    overlapSeal,
    await sealDistributionTree(overlapSource),
    'overlap-rejected runtime source',
  );
  const caseAliasedSource = path.join(root, 'OVERLAP-SOURCE');
  if (
    fs.existsSync(caseAliasedSource) &&
    fs.realpathSync.native(caseAliasedSource) === overlapSource
  ) {
    const caseAliasedDestination = path.join(
      caseAliasedSource,
      'case-aliased-copy',
    );
    await assert.rejects(
      copyRuntimeDistribution({
        sourceRoot: overlapSource,
        destinationRoot: caseAliasedDestination,
        admittedSourceSeal: overlapSeal,
      }),
      /source and destination overlap/u,
    );
    assert.equal(fs.existsSync(caseAliasedDestination), false);
    assertSameSeal(
      overlapSeal,
      await sealDistributionTree(overlapSource),
      'case-overlap-rejected runtime source',
    );
  }

  const movingSource = path.join(root, 'moving-source');
  fs.mkdirSync(movingSource);
  fs.writeFileSync(path.join(movingSource, 'a-tool'), 'stable-a\n', {
    mode: 0o555,
  });
  const movingLast = path.join(movingSource, 'z-tool');
  fs.writeFileSync(movingLast, 'stable-z\n', { mode: 0o555 });
  const movingSeal = await sealDistributionTree(movingSource);
  const originalCreateReadStream = fs.createReadStream;
  let mutatedAfterCopy = false;
  fs.createReadStream = (sourcePath, ...arguments_) => {
    const stream = originalCreateReadStream(sourcePath, ...arguments_);
    if (sourcePath === movingLast) {
      stream.once('end', () => {
        fs.chmodSync(movingLast, 0o755);
        fs.writeFileSync(movingLast, 'changed-z\n');
        fs.chmodSync(movingLast, 0o555);
        mutatedAfterCopy = true;
      });
    }
    return stream;
  };
  try {
    await assert.rejects(
      copyRuntimeDistribution({
        sourceRoot: movingSource,
        destinationRoot: path.join(root, 'moving-copy'),
        admittedSourceSeal: movingSeal,
      }),
      /runtime distribution source changed during acceptance/u,
    );
    assert.equal(mutatedAfterCopy, true);
  } finally {
    fs.createReadStream = originalCreateReadStream;
  }

  const linkedSource = path.join(root, 'linked-source');
  fs.mkdirSync(linkedSource);
  const linkedTool = path.join(linkedSource, 'tool');
  fs.writeFileSync(linkedTool, 'linked\n', { mode: 0o555 });
  fs.linkSync(linkedTool, path.join(linkedSource, 'hardlink'));
  await assert.rejects(
    copyRuntimeDistribution({
      sourceRoot: linkedSource,
      destinationRoot: path.join(root, 'linked-copy'),
    }),
    /hard-linked file/u,
  );

  const specialSource = path.join(root, 'special-source');
  fs.mkdirSync(specialSource);
  const specialEntry = path.join(specialSource, 'pipe');
  assert.equal(spawnSync('/usr/bin/mkfifo', [specialEntry]).status, 0);
  await assert.rejects(
    copyRuntimeDistribution({
      sourceRoot: specialSource,
      destinationRoot: path.join(root, 'special-copy'),
    }),
    /special file/u,
  );
});

test('runtime executable visibility follows complete read-only projection', async (t) => {
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), 'bgmss-runtime-read-only-')),
  );
  t.after(() => removeReadOnlyFixtureTree(root));
  const source = path.join(root, 'source');
  const destination = path.join(root, 'copy');
  const sourceExecutable = path.join(source, 'bin', 'python3.14');
  const sourceCache = path.join(source, 'lib', 'python3.14', '__pycache__');
  const sourceBytecode = path.join(sourceCache, 'copyreg.pyc');
  fs.mkdirSync(path.dirname(sourceExecutable), { recursive: true });
  fs.mkdirSync(sourceCache, { recursive: true });
  fs.writeFileSync(sourceExecutable, 'python\n', { mode: 0o755 });
  fs.writeFileSync(sourceBytecode, 'bytecode\n', { mode: 0o644 });
  const admitted = await sealDistributionTree(source);
  const copiedExecutable = path.join(destination, 'bin', 'python3.14');
  const copiedCache = path.join(
    destination,
    'lib',
    'python3.14',
    '__pycache__',
  );
  const copiedBytecode = path.join(copiedCache, 'copyreg.pyc');
  const originalChmodSync = fs.chmodSync;
  let executableObserved = false;
  fs.chmodSync = (candidate, mode) => {
    originalChmodSync(candidate, mode);
    if (candidate !== copiedExecutable || (mode & 0o111) === 0) return;
    executableObserved = true;
    assert.equal(fs.lstatSync(copiedCache).mode & 0o222, 0);
    assert.equal(fs.lstatSync(copiedBytecode).mode & 0o222, 0);
    assert.throws(
      () => fs.writeFileSync(copiedBytecode, 'rewritten\n'),
      (error) => error?.code === 'EACCES',
    );
    assert.throws(
      () => fs.writeFileSync(path.join(copiedCache, 'new.pyc'), 'new\n'),
      (error) => error?.code === 'EACCES',
    );
  };
  let copied;
  try {
    copied = await copyRuntimeDistribution({
      sourceRoot: source,
      destinationRoot: destination,
      admittedSourceSeal: admitted,
    });
  } finally {
    fs.chmodSync = originalChmodSync;
  }
  assert.equal(executableObserved, true);
  assert.equal(fs.readFileSync(copiedBytecode, 'utf8'), 'bytecode\n');
  assert.equal(fs.lstatSync(copiedExecutable).mode & 0o777, 0o555);
  assertSameSeal(
    copied.copiedSeal,
    await sealDistributionTree(copied.root),
    'read-only projected runtime',
  );
  assertSameSeal(
    admitted,
    await sealDistributionTree(source),
    'read-only projection source',
  );
});

test('runtime distribution copies reject every unminted seal before any write', async (t) => {
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), 'bgmss-runtime-plan-')),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source');
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'tool'), 'tool\n', { mode: 0o555 });
  fs.writeFileSync(path.join(source, 'peer'), 'peer\n', { mode: 0o555 });
  const admitted = await sealDistributionTree(source);
  const rootEntry = admitted.entries[0];
  const fileEntry = admitted.entries[1];
  const secondFileEntry = admitted.entries[2];
  const rootIdentity = admitted.identities[0];
  const fileIdentity = admitted.identities[1];
  const secondFileIdentity = admitted.identities[2];
  const outside = path.join(root, 'escaped');

  const attempts = [
    {
      name: 'structured-clone',
      seal: structuredClone(admitted),
    },
    {
      name: 'forged-digest',
      seal: rebuiltSeal(admitted, {
        entries: [
          rootEntry,
          { ...fileEntry, sha256: digest('f') },
          secondFileEntry,
        ],
      }),
    },
    {
      name: 'same-size-omission',
      seal: rebuiltSeal(admitted, {
        entries: [rootEntry, fileEntry],
        identities: [rootIdentity, fileIdentity],
      }),
    },
    {
      name: 'escape',
      seal: rebuiltSeal(admitted, {
        entries: [
          rootEntry,
          { ...fileEntry, path: '../escaped' },
          secondFileEntry,
        ],
        identities: [
          rootIdentity,
          { ...fileIdentity, path: '../escaped' },
          secondFileIdentity,
        ],
      }),
    },
    {
      name: 'duplicate',
      seal: rebuiltSeal(admitted, {
        entries: [
          rootEntry,
          fileEntry,
          { ...fileEntry },
          secondFileEntry,
        ],
        identities: [
          rootIdentity,
          fileIdentity,
          { ...fileIdentity },
          secondFileIdentity,
        ],
      }),
    },
    {
      name: 'shape',
      seal: rebuiltSeal(admitted, {
        identities: [
          rootIdentity,
          { ...fileIdentity, kind: 'directory' },
          secondFileIdentity,
        ],
      }),
    },
    {
      name: 'unknown-field',
      seal: rebuiltSeal(admitted, {
        entries: [
          rootEntry,
          { ...fileEntry, unexpected: true },
          secondFileEntry,
        ],
      }),
    },
  ];
  for (const attempt of attempts) {
    const destination = path.join(root, `copy-${attempt.name}`);
    await assert.rejects(
      copyRuntimeDistribution({
        sourceRoot: source,
        destinationRoot: destination,
        admittedSourceSeal: attempt.seal,
      }),
      /was not minted by the active seal authority/u,
    );
    assert.equal(fs.existsSync(destination), false);
    assert.equal(fs.existsSync(outside), false);
  }
});

test('runtime file workers are bounded and drain before ordered failure', async (t) => {
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), 'bgmss-runtime-workers-')),
  );
  t.after(() => removeReadOnlyFixtureTree(root));
  const source = path.join(root, 'source');
  fs.mkdirSync(source);
  for (let index = 0; index < 16; index += 1) {
    fs.writeFileSync(
      path.join(source, `entry-${String(index).padStart(2, '0')}`),
      Buffer.alloc(1024, index),
      { mode: 0o444 },
    );
  }
  const admitted = await sealDistributionTree(source);
  const originalCreateWriteStream = fs.createWriteStream;
  let active = 0;
  let maximumActive = 0;
  fs.createWriteStream = (...arguments_) => {
    const stream = originalCreateWriteStream(...arguments_);
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    stream.once('close', () => {
      active -= 1;
    });
    return stream;
  };
  try {
    await copyRuntimeDistribution({
      sourceRoot: source,
      destinationRoot: path.join(root, 'bounded-copy'),
      admittedSourceSeal: admitted,
    });
  } finally {
    fs.createWriteStream = originalCreateWriteStream;
  }
  assert.ok(maximumActive > 1);
  assert.ok(maximumActive <= 8);
  assert.equal(active, 0);

  const originalCreateReadStream = fs.createReadStream;
  let laterWorkerDrained = false;
  fs.createReadStream = (sourcePath, ...arguments_) => {
    if (sourcePath.endsWith('entry-00')) {
      return Readable.from(
        (async function* firstFailure() {
          await new Promise((resolve) => setTimeout(resolve, 20));
          throw new Error('ordered-first-entry-failure');
        })(),
      );
    }
    if (sourcePath.endsWith('entry-01')) {
      return Readable.from(
        (async function* secondFailure() {
          throw new Error('earlier-completion-second-entry-failure');
        })(),
      );
    }
    if (sourcePath.endsWith('entry-02')) {
      return Readable.from(
        (async function* laterDrain() {
          await new Promise((resolve) => setTimeout(resolve, 40));
          laterWorkerDrained = true;
          yield Buffer.alloc(1024, 2);
        })(),
      );
    }
    return originalCreateReadStream(sourcePath, ...arguments_);
  };
  try {
    await assert.rejects(
      copyRuntimeDistribution({
        sourceRoot: source,
        destinationRoot: path.join(root, 'failed-copy'),
        admittedSourceSeal: admitted,
      }),
      /ordered-first-entry-failure/u,
    );
  } finally {
    fs.createReadStream = originalCreateReadStream;
  }
  assert.equal(laterWorkerDrained, true);
});

test('runtime distribution copy stops between files when its cell aborts', async (t) => {
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), 'bgmss-runtime-abort-')),
  );
  t.after(() => removeReadOnlyFixtureTree(root));
  const source = path.join(root, 'source');
  fs.mkdirSync(source);
  for (let index = 0; index < 64; index += 1) {
    fs.writeFileSync(
      path.join(source, `runtime-${String(index).padStart(3, '0')}`),
      Buffer.alloc(4096, index),
      { mode: 0o444 },
    );
  }
  const admittedSourceSeal = await sealDistributionTree(source);
  const destination = path.join(root, 'copy');
  const controller = new AbortController();
  const reason = new Error('fixture runtime-copy abort');
  const originalCreateWriteStream = fs.createWriteStream;
  let activeWorkers = 0;
  let drainedWorkers = 0;
  fs.createWriteStream = (...arguments_) => {
    const stream = originalCreateWriteStream(...arguments_);
    activeWorkers += 1;
    stream.once('close', () => {
      activeWorkers -= 1;
      drainedWorkers += 1;
    });
    return stream;
  };
  try {
    const pending = runWithAbortSignal(controller.signal, () =>
      copyRuntimeDistribution({
        sourceRoot: source,
        destinationRoot: destination,
        admittedSourceSeal,
      }),
    );
    queueMicrotask(() => controller.abort(reason));
    await assert.rejects(pending, (error) => error === reason);
  } finally {
    fs.createWriteStream = originalCreateWriteStream;
  }
  assert.equal(activeWorkers, 0);
  assert.ok(drainedWorkers > 0);
  assert.ok(drainedWorkers <= 8);
  assert.ok(fs.existsSync(destination));
  assert.ok(fs.readdirSync(destination).length < 64);
  assertSameSeal(
    admittedSourceSeal,
    await sealDistributionTree(source),
    'aborted runtime distribution source',
  );
});

test('representative runtime closures and five copies provide a cooperative bounded smoke', async (t) => {
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), 'bgmss-runtime-bounded-')),
  );
  t.after(() => removeReadOnlyFixtureTree(root));
  const specifications = {};
  for (let closureIndex = 0; closureIndex < 5; closureIndex += 1) {
    const source = path.join(root, `source-${closureIndex}`);
    fs.mkdirSync(source);
    for (let fileIndex = 0; fileIndex < 24; fileIndex += 1) {
      fs.writeFileSync(
        path.join(source, `entry-${String(fileIndex).padStart(3, '0')}`),
        Buffer.alloc(1024, closureIndex + fileIndex),
        { mode: fileIndex % 2 === 0 ? 0o444 : 0o555 },
      );
    }
    specifications[`runtime${closureIndex}`] = {
      classification: 'read-only-source',
      copied: false,
      hermetic: false,
      root: source,
      sealKind: 'distributionTree',
      sealOptions: Object.freeze({ allowInternalSymlinks: false }),
      shape: 'directory',
    };
  }
  const startedAt = performance.now();
  const admitted = await attestRuntimeClosureSpecifications(specifications);
  const copies = await Promise.all(
    Object.values(admitted.runtimeRoots).map((runtime, index) =>
      copyRuntimeDistribution({
        sourceRoot: runtime.root,
        destinationRoot: path.join(root, `copy-${index}`),
        admittedSourceSeal: runtime.seal,
      }),
    ),
  );
  const elapsedMs = performance.now() - startedAt;
  assert.equal(copies.length, 5);
  assert.ok(
    elapsedMs < 15_000,
    `cooperative runtime-copy smoke took ${elapsedMs.toFixed(1)}ms`,
  );
});

test('runtime sandbox denies writes to complete directory roots and single-file tools', (t) => {
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), 'bgmss-runtime-profile-')),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, 'distribution');
  const executable = path.join(root, 'tool');
  fs.mkdirSync(directory);
  fs.writeFileSync(executable, 'tool\n', { mode: 0o555 });
  const profile = runtimeReadOnlySandboxProfile([directory, executable]);
  assert.match(
    profile,
    new RegExp(`literal "${directory.replaceAll('/', '\\/')}"`, 'u'),
  );
  assert.match(
    profile,
    new RegExp(`subpath "${directory.replaceAll('/', '\\/')}"`, 'u'),
  );
  assert.match(
    profile,
    new RegExp(`literal "${executable.replaceAll('/', '\\/')}"`, 'u'),
  );
  assert.doesNotMatch(
    profile,
    new RegExp(`subpath "${executable.replaceAll('/', '\\/')}"`, 'u'),
  );
});

test(
  'Docker-local sandbox permits its exact Unix socket and loopback but denies public TCP',
  { skip: process.platform !== 'darwin' },
  async () => {
    const { runRoot } = allocateRunRoot();
    const socketRoot = fs.mkdtempSync('/private/tmp/bgmss-sandbox-');
    const socketPath = path.join(socketRoot, 'docker.sock');
    const server = net.createServer((connection) => connection.end('unix-ok'));
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(socketPath, resolve);
    });
    try {
      const environment = sanitizedEnvironment({
        runRoot,
        pathEntries: [path.dirname(process.execPath), '/usr/bin', '/bin'],
      });
      const script = `
        const http = require('node:http');
        const net = require('node:net');
        const socketPath = process.argv[1];
        function unixProbe() {
          return new Promise((resolve, reject) => {
            let value = '';
            const client = net.connect(socketPath);
            client.on('data', (chunk) => { value += chunk; });
            client.on('end', () => value === 'unix-ok' ? resolve() : reject(new Error(value)));
            client.on('error', reject);
          });
        }
        function publicProbe() {
          return new Promise((resolve, reject) => {
            const client = net.connect({ host: '1.1.1.1', port: 80 });
            client.on('connect', () => reject(new Error('public TCP connected')));
            client.on('error', (error) =>
              error.code === 'EPERM' ? resolve() : reject(error));
          });
        }
        async function loopbackProbe() {
          const server = http.createServer((_request, response) => response.end('loopback-ok'));
          await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(0, '127.0.0.1', resolve);
          });
          try {
            const response = await fetch('http://127.0.0.1:' + server.address().port);
            if (await response.text() !== 'loopback-ok') throw new Error('loopback mismatch');
          } finally {
            await new Promise((resolve) => server.close(resolve));
          }
        }
        Promise.all([unixProbe(), publicProbe(), loopbackProbe()])
          .then(() => process.stdout.write('closed-network-ok'))
          .catch((error) => { console.error(error); process.exitCode = 1; });
      `;
      const result = await runCommand({
        id: 'docker-local-sandbox',
        executable: '/usr/bin/sandbox-exec',
        args: [
          '-p',
          dockerLocalSandboxProfile(`unix://${socketPath}`),
          process.execPath,
          '-e',
          script,
          socketPath,
        ],
        cwd: runRoot,
        environment,
        timeoutMs: 10_000,
        gracefulStopMs: 100,
        runRoot,
      });
      assert.equal(
        fs.readFileSync(path.join(runRoot, result.stdout.path), 'utf8'),
        'closed-network-ok',
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
      if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
      fs.rmdirSync(socketRoot);
      cleanupRunRoot(runRoot);
    }
  },
);

test('runtime cleanup removes a timeout-stranded Updater container and is idempotent', async () => {
  const names = {
    relay: 'relay',
    backend: 'backend',
    updaterDoctor: 'updater-doctor',
    updaterContract: 'updater-contract',
    network: 'runtime-network',
  };
  const images = { backend: 'backend:image', updater: 'updater:image' };
  const resources = {
    container: new Set([names.backend, names.updaterDoctor]),
    network: new Set([names.network]),
    image: new Set(Object.values(images)),
  };
  const imageIds = new Map([
    [images.backend, digest('1')],
    [images.updater, digest('2')],
  ]);
  const states = new Map([
    [
      names.backend,
      { Running: true, OOMKilled: false, Error: '', ExitCode: 0 },
    ],
  ]);
  const calls = [];
  async function runDocker(id, args) {
    calls.push({ id, args });
    const [kind, action, ...rest] = args;
    const name = action === 'inspect' ? rest.at(-1) : rest.at(-1);
    if (kind === 'container' && action === 'ls') {
      return { status: 0, stdoutText: '' };
    }
    if (action === 'inspect') {
      if (!resources[kind].has(name)) {
        const stderrText =
          kind === 'container'
            ? `Error response from daemon: No such container: ${name}\n`
            : kind === 'image'
              ? `Error response from daemon: No such image: ${name}\n`
              : `Error response from daemon: network ${name} not found\n`;
        throw new CommandError('absent', { status: 1, stderrText });
      }
      return {
        status: 0,
        stdoutText:
          rest[0] === '--format'
            ? kind === 'image'
              ? imageIds.get(name)
              : JSON.stringify(states.get(name))
            : '',
      };
    }
    if (
      (kind === 'container' && action === 'stop')
    ) {
      states.set(name, {
        Running: false,
        OOMKilled: false,
        Error: '',
        ExitCode: 0,
      });
      return { status: 0 };
    }
    if (
      (kind === 'container' && action === 'rm') ||
      (kind === 'network' && action === 'rm') ||
      (kind === 'image' && action === 'rm')
    ) {
      resources[kind].delete(name);
      return { status: 0 };
    }
    throw new Error(`unexpected Docker command ${args.join(' ')}`);
  }
  const declaration = {
    runDocker,
    names,
    images,
    loadedImages: new Set(Object.values(images)),
    loadedImageIds: imageIds,
  };
  await cleanupOwnedRuntimeResources(declaration);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(resources).map(([kind, values]) => [kind, [...values]]),
    ),
    { container: [], network: [], image: [] },
  );
  assert(
    calls.some(
      ({ args }) =>
        args[0] === 'container' &&
        args[1] === 'rm' &&
        args.at(-1) === names.updaterDoctor,
    ),
  );
  const stopIndex = calls.findIndex(
    ({ args }) =>
      args[0] === 'container' &&
      args[1] === 'stop' &&
      args.at(-1) === names.backend,
  );
  const removeIndex = calls.findIndex(
    ({ args }) =>
      args[0] === 'container' &&
      args[1] === 'rm' &&
      args.at(-1) === names.backend,
  );
  assert(stopIndex >= 0 && removeIndex > stopIndex);
  assert.equal(
    calls.some(
      ({ args }) =>
        args[0] === 'image' &&
        args[1] === 'rm' &&
        args.includes('--force'),
    ),
    false,
  );
  await cleanupOwnedRuntimeResources(declaration);
});

test('runtime cleanup rejects an ambiguous Docker status 1 instead of treating it as absent', async () => {
  const names = {
    relay: 'relay',
    backend: 'backend',
    updaterDoctor: 'updater-doctor',
    updaterContract: 'updater-contract',
    network: 'runtime-network',
  };
  const images = { backend: 'backend:image', updater: 'updater:image' };
  await assert.rejects(
    cleanupOwnedRuntimeResources({
      runDocker: async () => {
        throw new CommandError('daemon unavailable', {
          status: 1,
          stderrText: 'Cannot connect to the Docker daemon\n',
        });
      },
      names,
      images,
      loadedImages: new Set(),
    }),
    /runtime cleanup failed/u,
  );
});

test('runtime cleanup preserves an owned image when any foreign container references its ID', async () => {
  const names = {
    relay: 'relay',
    backend: 'backend',
    updaterDoctor: 'updater-doctor',
    updaterContract: 'updater-contract',
    network: 'runtime-network',
  };
  const images = {
    backend: 'backend:image',
    updater: 'updater:image',
  };
  const ownedId = digest('4');
  const calls = [];
  await assert.rejects(
    cleanupOwnedRuntimeResources({
      runDocker: async (_id, args) => {
        calls.push(args);
        const [kind, action] = args;
        const name = args.at(-1);
        if (kind === 'container' && action === 'ls') {
          return { stdoutText: 'foreign-container-id\n', status: 0 };
        }
        if (action === 'inspect') {
          if (kind === 'image' && name === images.backend) {
            return {
              stdoutText:
                args[2] === '--format' ? `${ownedId}\n` : '',
              status: 0,
            };
          }
          const stderrText =
            kind === 'container'
              ? `Error response from daemon: No such container: ${name}\n`
              : kind === 'image'
                ? `Error response from daemon: No such image: ${name}\n`
                : `Error response from daemon: network ${name} not found\n`;
          throw new CommandError('absent', {
            status: 1,
            stderrText,
          });
        }
        throw new Error(`unexpected Docker command ${args.join(' ')}`);
      },
      names,
      images,
      loadedImages: new Set([images.backend]),
      loadedImageIds: new Map([[images.backend, ownedId]]),
    }),
    /runtime cleanup failed/u,
  );
  assert.equal(
    calls.some(
      (args) => args[0] === 'image' && args[1] === 'rm',
    ),
    false,
  );
});

test('runtime cleanup rejects a pre-crashed or uncleanly stopped Backend and still removes it', async () => {
  const cases = [
    {
      name: 'pre-crashed',
      before: { Running: false, OOMKilled: false, Error: '', ExitCode: 137 },
      after: null,
    },
    {
      name: 'post-oom',
      before: { Running: true, OOMKilled: false, Error: '', ExitCode: 0 },
      after: { Running: false, OOMKilled: true, Error: '', ExitCode: 137 },
    },
  ];
  for (const scenario of cases) {
    const names = {
      relay: 'relay',
      backend: `backend-${scenario.name}`,
      updaterDoctor: 'updater-doctor',
      updaterContract: 'updater-contract',
      network: 'runtime-network',
    };
    const images = { backend: 'backend:image', updater: 'updater:image' };
    const containers = new Set([names.backend]);
    let state = scenario.before;
    let forceRemoved = false;
    async function runDocker(_id, args) {
      const [kind, action, ...rest] = args;
      const name = rest.at(-1);
      if (action === 'inspect') {
        const set = kind === 'container' ? containers : new Set();
        if (!set.has(name)) {
          const stderrText =
            kind === 'container'
              ? `Error response from daemon: No such container: ${name}\n`
              : kind === 'image'
                ? `Error response from daemon: No such image: ${name}\n`
                : `Error response from daemon: network ${name} not found\n`;
          throw new CommandError('absent', { status: 1, stderrText });
        }
        return {
          status: 0,
          stdoutText: rest[0] === '--format' ? JSON.stringify(state) : '',
        };
      }
      if (kind === 'container' && action === 'stop') {
        state = scenario.after;
        return { status: 0 };
      }
      if (kind === 'container' && action === 'rm') {
        forceRemoved = rest.includes('--force');
        containers.delete(name);
        return { status: 0 };
      }
      throw new Error(`unexpected Docker command ${args.join(' ')}`);
    }
    await assert.rejects(
      cleanupOwnedRuntimeResources({
        runDocker,
        names,
        images,
        loadedImages: new Set(),
      }),
      /runtime cleanup failed/u,
    );
    assert.equal(containers.size, 0, `${scenario.name} Backend residue`);
    assert.equal(forceRemoved, true, `${scenario.name} was not force removed`);
  }
});

test('Docker inventory blocks global drift and diagnoses reserved mounts and resources', () => {
  const names = {
    relay: 'bgmss-accept-relay-fixture',
    backend: 'bgmss-accept-api-fixture',
    updaterDoctor: 'bgmss-accept-doctor-fixture',
    updaterContract: 'bgmss-accept-contract-fixture',
    network: 'bgmss-accept-fixture',
  };
  const images = {
    backend: 'localhost/bgmss-backend-api:fixture-arm64',
    updater: 'bgmss-updater-artifact:fixture-arm64',
  };
  const unrelated = {
    containers: [
      {
        Id: 'unrelated-container',
        ImageID: 'unrelated-image',
        Names: ['/unrelated'],
        Mounts: [],
      },
    ],
    images: [
      {
        Id: 'unrelated-image',
        RepoTags: ['unrelated:latest'],
        RepoDigests: [],
      },
    ],
    networks: [
      {
        Id: 'unrelated-network',
        Name: 'unrelated',
        Driver: 'bridge',
        Scope: 'local',
      },
    ],
    volumes: [],
  };
  const clean = normalizeDockerResourceInventory(unrelated);
  assert.deepEqual(
    ownedRuntimeResidue(clean, { names, images }),
    {
      containers: 0,
      images: 0,
      networks: 0,
      mounts: 0,
      containerIds: [],
      imageIds: [],
      networkIds: [],
    },
  );
  const terminal = normalizeDockerResourceInventory({
    containers: [
      ...unrelated.containers,
      {
        Id: 'owned-container',
        ImageID: 'owned-image',
        Names: [`/${names.backend}`],
        Mounts: [
          {
            Type: 'bind',
            Source: '/private/tmp/archive',
            Destination: '/archive',
            RW: false,
          },
        ],
      },
    ],
    images: [
      ...unrelated.images,
      {
        Id: 'owned-image',
        RepoTags: [images.backend],
        RepoDigests: [],
      },
    ],
    networks: [
      ...unrelated.networks,
      {
        Id: 'owned-network',
        Name: names.network,
        Driver: 'bridge',
        Scope: 'local',
        Internal: true,
      },
    ],
    volumes: [],
  });
  assert.deepEqual(
    ownedRuntimeResidue(terminal, { names, images }),
    {
      containers: 1,
      images: 1,
      networks: 1,
      mounts: 1,
      containerIds: ['owned-container'],
      imageIds: ['owned-image'],
      networkIds: ['owned-network'],
    },
  );
  assert.throws(
    () => assertDockerInventoryUnchanged(clean, terminal),
    /global resource inventory changed/u,
  );
  assert.doesNotThrow(() => assertDockerInventoryUnchanged(clean, clean));
});

test('owned run-root inventory reports process files, escaped links, and external hard links as residue', () => {
  const { runRoot } = allocateRunRoot();
  const externalRoot = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), 'bgmss-run-residue-')),
  );
  try {
    assert.equal(inventoryOwnedRunRoot(runRoot).unsafeEntries, 0);
    const externalFile = path.join(externalRoot, 'external.txt');
    fs.writeFileSync(externalFile, 'external\n');
    fs.symlinkSync(externalRoot, path.join(runRoot, 'escaped-link'));
    fs.linkSync(externalFile, path.join(runRoot, 'external-hard-link'));
    fs.writeFileSync(path.join(runRoot, 'processes', 'stale.pid'), '123\n');
    const inventory = inventoryOwnedRunRoot(runRoot);
    assert.equal(inventory.unsafeEntries, 3);
    assert.equal(inventory.transientEntries, 1);
    assert.equal(inventory.symlinks, 1);
  } finally {
    fs.unlinkSync(path.join(runRoot, 'escaped-link'));
    fs.unlinkSync(path.join(runRoot, 'external-hard-link'));
    fs.unlinkSync(path.join(runRoot, 'processes', 'stale.pid'));
    cleanupRunRoot(runRoot);
    fs.rmSync(externalRoot, { recursive: true, force: true });
  }
});

test('clone Git environment is built before fixed GIT hardening variables are added', () => {
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), 'bgmss-git-env-')),
  );
  try {
    fs.mkdirSync(path.join(root, 'home'));
    fs.mkdirSync(path.join(root, 'tmp'));
    const environment = buildCloneGitEnvironment(root);
    assert.equal(environment.GIT_NO_REPLACE_OBJECTS, '1');
    assert.equal(environment.GIT_CONFIG_GLOBAL, '/dev/null');
    assert.equal(environment.HOME, path.join(root, 'home'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('clean checkout identity ignores a caller PATH Git shim', () => {
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), 'bgmss-git-identity-')),
  );
  const repository = path.join(root, 'repository');
  const shim = path.join(root, 'shim');
  const sentinel = path.join(root, 'shim-ran');
  fs.mkdirSync(repository);
  fs.mkdirSync(shim);
  const environment = {
    ...process.env,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
  };
  const runGit = (...args) => {
    const result = spawnSync('/usr/bin/git', args, {
      cwd: repository,
      env: environment,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  try {
    runGit('init', '--quiet');
    fs.writeFileSync(path.join(repository, 'tracked.txt'), 'tracked\n');
    runGit('add', 'tracked.txt');
    runGit(
      '-c',
      'user.name=Acceptance',
      '-c',
      'user.email=acceptance@example.invalid',
      'commit',
      '--quiet',
      '-m',
      'fixture',
    );
    const revision = runGit('rev-parse', 'HEAD^{commit}');
    const tree = runGit('rev-parse', 'HEAD^{tree}');
    fs.writeFileSync(
      path.join(shim, 'git'),
      `#!/bin/sh\n/usr/bin/touch ${JSON.stringify(sentinel)}\nexit 99\n`,
      { mode: 0o700 },
    );
    const originalPath = process.env.PATH;
    process.env.PATH = shim;
    try {
      const identity = deriveCleanCheckoutIdentityClosed({
        repositoryRoot: repository,
        suppliedRevision: revision,
        suppliedTree: tree,
      });
      assert.equal(identity.revision, revision);
    } finally {
      process.env.PATH = originalPath;
    }
    assert.equal(fs.existsSync(sentinel), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Git admission binds revision trees and product-to-harness ancestry', () => {
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), 'bgmss-git-admission-')),
  );
  const repository = path.join(root, 'repository');
  fs.mkdirSync(repository);
  const environment = {
    ...process.env,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
  };
  const runGit = (...args) => {
    const result = spawnSync('/usr/bin/git', args, {
      cwd: repository,
      env: environment,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  try {
    runGit('init', '--quiet');
    fs.writeFileSync(path.join(repository, 'tracked.txt'), 'base\n');
    runGit('add', 'tracked.txt');
    runGit(
      '-c',
      'user.name=Acceptance',
      '-c',
      'user.email=acceptance@example.invalid',
      'commit',
      '--quiet',
      '-m',
      'base',
    );
    const baseRevision = runGit('rev-parse', 'HEAD^{commit}');
    const baseTree = runGit('rev-parse', 'HEAD^{tree}');
    fs.writeFileSync(path.join(repository, 'tracked.txt'), 'descendant\n');
    runGit('add', 'tracked.txt');
    runGit(
      '-c',
      'user.name=Acceptance',
      '-c',
      'user.email=acceptance@example.invalid',
      'commit',
      '--quiet',
      '-m',
      'descendant',
    );
    const descendantRevision = runGit('rev-parse', 'HEAD^{commit}');
    const descendantTree = runGit('rev-parse', 'HEAD^{tree}');
    runGit('checkout', '--quiet', '-b', 'sibling', baseRevision);
    fs.writeFileSync(path.join(repository, 'tracked.txt'), 'sibling\n');
    runGit('add', 'tracked.txt');
    runGit(
      '-c',
      'user.name=Acceptance',
      '-c',
      'user.email=acceptance@example.invalid',
      'commit',
      '--quiet',
      '-m',
      'sibling',
    );
    const siblingRevision = runGit('rev-parse', 'HEAD^{commit}');

    assert.equal(
      assertGitRevisionTree({
        repositoryRoot: repository,
        revision: baseRevision,
        expectedTree: baseTree,
        label: 'fixture',
      }),
      baseTree,
    );
    assert.throws(
      () =>
        assertGitRevisionTree({
          repositoryRoot: repository,
          revision: baseRevision,
          expectedTree: descendantTree,
          label: 'fixture',
        }),
      /revision\/tree mismatch/u,
    );
    assert.doesNotThrow(() =>
      assertGitAncestor({
        repositoryRoot: repository,
        ancestorRevision: baseRevision,
        descendantRevision,
      }),
    );
    assert.throws(
      () =>
        assertGitAncestor({
          repositoryRoot: repository,
          ancestorRevision: descendantRevision,
          descendantRevision: siblingRevision,
        }),
      /not an ancestor/u,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('hard-link audit covers tracked paths outside contracts', () => {
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), 'bgmss-hardlink-')),
  );
  const source = path.join(root, 'source');
  const clone = path.join(root, 'clone');
  try {
    fs.mkdirSync(path.join(source, 'frontend'), { recursive: true });
    fs.mkdirSync(path.join(clone, 'frontend'), { recursive: true });
    fs.writeFileSync(path.join(source, 'frontend', 'outside.txt'), 'tracked\n');
    fs.linkSync(
      path.join(source, 'frontend', 'outside.txt'),
      path.join(clone, 'frontend', 'outside.txt'),
    );
    assert.throws(
      () =>
        assertNoHardlinkedTrackedFiles({
          sourceRoot: source,
          cloneRoot: clone,
          trackedPaths: ['frontend/outside.txt'],
        }),
      /hard-linked tracked file/u,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('owned cleanup restores nested read-only permissions without following links', () => {
  const outside = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), 'bgmss-cleanup-outside-')),
  );
  const { runRoot } = allocateRunRoot();
  try {
    const archive = path.join(runRoot, 'archive', 'versions', 'dv1-test');
    fs.mkdirSync(archive, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(archive, 'manifest.json'), '{}\n', { mode: 0o400 });
    fs.symlinkSync(outside, path.join(runRoot, 'outside-link'));
    fs.chmodSync(path.join(archive, 'manifest.json'), 0o444);
    fs.chmodSync(archive, 0o555);
    fs.chmodSync(path.dirname(archive), 0o555);
    fs.chmodSync(path.join(runRoot, 'archive'), 0o555);
    cleanupRunRoot(runRoot);
    assert.equal(fs.existsSync(runRoot), false);
    assert.equal(fs.existsSync(outside), true);
  } finally {
    if (fs.existsSync(runRoot)) {
      fs.chmodSync(runRoot, 0o700);
      fs.rmSync(runRoot, { recursive: true, force: true });
    }
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('cleanup rejects an unowned sibling without changing it', () => {
  const unowned = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), 'bgmss-unowned-')),
  );
  try {
    const sentinel = path.join(unowned, 'sentinel');
    fs.writeFileSync(sentinel, 'preserve\n');
    assert.throws(() => cleanupRunRoot(unowned), /strictly below|owned run root/u);
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'preserve\n');
  } finally {
    fs.rmSync(unowned, { recursive: true, force: true });
  }
});

test('cleanup rejects a hard link without changing the external inode mode or bytes', () => {
  const outside = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), 'bgmss-cleanup-hardlink-')),
  );
  const { runRoot } = allocateRunRoot();
  const protectedFile = path.join(outside, 'protected');
  fs.writeFileSync(protectedFile, 'preserve\n', { mode: 0o440 });
  const originalMode = fs.statSync(protectedFile).mode & 0o777;
  try {
    fs.linkSync(protectedFile, path.join(runRoot, 'injected-hardlink'));
    assert.throws(() => cleanupRunRoot(runRoot), /hard-linked regular file/u);
    assert.equal(fs.statSync(protectedFile).mode & 0o777, originalMode);
    assert.equal(fs.readFileSync(protectedFile, 'utf8'), 'preserve\n');
  } finally {
    if (fs.existsSync(runRoot)) {
      fs.unlinkSync(path.join(runRoot, 'injected-hardlink'));
      cleanupRunRoot(runRoot);
    }
    fs.rmSync(outside, { recursive: true, force: true });
  }
});
