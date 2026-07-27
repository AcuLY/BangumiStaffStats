import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  canonicalJson,
  canonicalJsonDigest,
} from '../lib/canonical-json.mjs';
import {
  isolateAndSanitizeFailureEvidence,
  registerFailureEvidence,
  validateAcknowledgedFailureEvidence,
  validateEvidenceFiles,
  writeAndVerifyCanonicalResult,
  writeRetryableParentFailureEvidence,
} from '../lib/evidence-validation.mjs';
import {
  acceptedLoadedImageIdentity,
  SupervisorRuntimeOwnership,
} from '../lib/supervisor-runtime.mjs';
import {
  createOnceAsyncOperation,
  superviseAcceptanceWorker,
} from '../lib/supervisor.mjs';

const WORKER = fileURLToPath(
  new URL('./supervisor-worker.fixture.mjs', import.meta.url),
);
const INPUT_DIGEST = `sha256:${'1'.repeat(64)}`;
const BACKEND_REVISION = '2'.repeat(40);
const BACKEND_IMAGE =
  `localhost/bgmss-backend-api:${BACKEND_REVISION}-arm64`;
const UPDATER_REVISION = '3'.repeat(40);
const UPDATER_IMAGE =
  `localhost/bgmss-updater-artifact:${UPDATER_REVISION}-arm64`;

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function tarOctal(header, offset, length, value) {
  header.write(
    value.toString(8).padStart(length - 1, '0'),
    offset,
    length - 1,
    'ascii',
  );
  header[offset + length - 1] = 0;
}

function tarEntry(name, bytes) {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, 'utf8');
  tarOctal(header, 100, 8, 0o444);
  tarOctal(header, 108, 8, 0);
  tarOctal(header, 116, 8, 0);
  tarOctal(header, 124, 12, bytes.length);
  tarOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header[156] = 48;
  header.write('ustar\u0000', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  tarOctal(
    header,
    148,
    8,
    header.reduce((total, byte) => total + byte, 0),
  );
  const padding = Buffer.alloc(Math.ceil(bytes.length / 512) * 512 - bytes.length);
  return Buffer.concat([header, bytes, padding]);
}

function writeOciArchive(filePath, component) {
  const layer = Buffer.from(`${component}-layer\n`);
  const layerDigest = sha256(layer);
  const rootfsDiffIds = Object.freeze([layerDigest]);
  const config = Buffer.from(
    canonicalJson({
      architecture: 'arm64',
      component,
      os: 'linux',
      rootfs: {
        diff_ids: rootfsDiffIds,
        type: 'layers',
      },
    }),
  );
  const configDigest = sha256(config);
  const manifest = Buffer.from(
    canonicalJson({
      config: {
        digest: configDigest,
        mediaType: 'application/vnd.oci.image.config.v1+json',
        size: config.length,
      },
      layers: [
        {
          digest: layerDigest,
          mediaType: 'application/vnd.oci.image.layer.v1.tar',
          size: layer.length,
        },
      ],
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      schemaVersion: 2,
    }),
  );
  const manifestDigest = sha256(manifest);
  const index = Buffer.from(
    canonicalJson({
      mediaType: 'application/vnd.oci.image.index.v1+json',
      manifests: [
        {
          digest: manifestDigest,
          mediaType: 'application/vnd.oci.image.manifest.v1+json',
          platform: {
            architecture: 'arm64',
            os: 'linux',
          },
          size: manifest.length,
        },
      ],
      schemaVersion: 2,
    }),
  );
  fs.writeFileSync(
    filePath,
    Buffer.concat([
      tarEntry('index.json', index),
      tarEntry(`blobs/sha256/${manifestDigest.slice(7)}`, manifest),
      tarEntry(`blobs/sha256/${configDigest.slice(7)}`, config),
      tarEntry(`blobs/sha256/${layerDigest.slice(7)}`, layer),
      Buffer.alloc(1024),
    ]),
  );
  return Object.freeze({
    architecture: 'arm64',
    configDigest,
    layerDigest,
    layerDigests: Object.freeze([layerDigest]),
    manifestDigest,
    manifestSize: manifest.length,
    os: 'linux',
    rootfsDiffIds,
  });
}

function fakeImageInspection(
  identity,
  reference,
  {
    descriptor,
    descriptorDigest = identity.manifestDigest,
    repoDigests,
    runtimeId,
  },
) {
  const repository = reference.slice(0, reference.lastIndexOf(':'));
  return canonicalJson([
    {
      Architecture: 'arm64',
      ...(descriptor
        ? {
            Descriptor: {
              digest: descriptorDigest,
              mediaType: 'application/vnd.oci.image.manifest.v1+json',
              size: identity.manifestSize,
            },
          }
        : {}),
      Id: runtimeId,
      Os: 'linux',
      RepoDigests:
        repoDigests ??
        (descriptor
          ? [`${repository}@${identity.manifestDigest}`]
          : []),
      RepoTags: [reference],
      RootFS: {
        Layers: identity.rootfsDiffIds,
        Type: 'layers',
      },
    },
  ]);
}

function allocateFixtureRunRoot() {
  const base = fs.realpathSync.native(
    fs.mkdtempSync(
      path.join(os.tmpdir(), 'bgmss-supervisor-test-'),
    ),
  );
  const runId = `run-${randomBytes(12).toString('hex')}`;
  const runRoot = path.join(base, runId);
  fs.mkdirSync(runRoot, { mode: 0o700 });
  for (const relative of ['evidence', 'home', 'tmp']) {
    fs.mkdirSync(path.join(runRoot, relative), { mode: 0o700 });
  }
  return Object.freeze({ base, runId, runRoot });
}

function cleanupFixtureRunRoot(allocation) {
  fs.rmSync(allocation.base, { force: false, recursive: true });
}

const configuration = Object.freeze({
  matrix: Object.freeze({
    matrixVersion: 'supervisor-test-matrix',
    cells: Object.freeze([
      Object.freeze({
        id: 'first.cell',
        owner: 'fixture-owner',
        phase: 'fixture',
        timeoutMs: 5_000,
        evidence: Object.freeze([]),
      }),
      Object.freeze({
        id: 'second.cell',
        owner: 'fixture-owner',
        phase: 'fixture',
        timeoutMs: 5_000,
        evidence: Object.freeze([]),
      }),
    ]),
  }),
  budgets: Object.freeze({
    timeouts: Object.freeze({
      gracefulStopMs: 250,
      suiteMs: 30_000,
    }),
  }),
});

async function runScenario(scenario) {
  const allocation = allocateFixtureRunRoot();
  const scenarioPath = path.join(
    allocation.runRoot,
    'supervised-input.json',
  );
  const scenarioInput = {
    scenario,
    timeoutMs: configuration.matrix.cells[0].timeoutMs,
  };
  fs.writeFileSync(scenarioPath, canonicalJson(scenarioInput), {
    flag: 'wx',
    mode: 0o600,
  });
  let failure = null;
  let failureWrites = 0;
  try {
    const code = await superviseAcceptanceWorker({
      configuration,
      inputBeforeDigest: INPUT_DIGEST,
      inputDocumentDigest: canonicalJsonDigest(scenarioInput),
      inputPath: scenarioPath,
      runId: allocation.runId,
      runRoot: allocation.runRoot,
      validateWorkerResult: async () => {
        throw new Error('abnormal fixture result must not validate');
      },
      workerModule: WORKER,
      writeSupervisedFailure: async (facts) => {
        failureWrites += 1;
        failure = facts;
        const candidate = path.join(allocation.runRoot, 'result.json');
        if (fs.existsSync(candidate)) fs.unlinkSync(candidate);
        fs.writeFileSync(
          candidate,
          canonicalJson({
            kind: 'parent-only-fixture-result',
            reason: facts.reason.code,
          }),
          { flag: 'wx', mode: 0o600 },
        );
      },
    });
    assert.equal(code, 1);
    assert.equal(failureWrites, 1);
    assert.ok(failure);
    assert.equal(
      JSON.parse(
        fs.readFileSync(path.join(allocation.runRoot, 'result.json'), 'utf8'),
      ).kind,
      'parent-only-fixture-result',
    );
    return { allocation, failure };
  } catch (error) {
    cleanupFixtureRunRoot(allocation);
    throw error;
  }
}

function fixtureCell(id, status, evidence = []) {
  return {
    durationMs: 1,
    evidence,
    failure:
      status === 'pass'
        ? null
        : {
            blockedBy: null,
            code: 'COMMAND_ERROR',
            summary: 'fixture command failed',
          },
    id,
    owner: 'fixture-owner',
    status,
  };
}

function writeFixtureEvidence(runRoot, relative, contents = `${relative}\n`) {
  const output = path.join(runRoot, ...relative.split('/'));
  fs.mkdirSync(path.dirname(output), {
    recursive: true,
    mode: 0o700,
  });
  const bytes = Buffer.from(contents);
  fs.writeFileSync(output, bytes, { flag: 'wx', mode: 0o600 });
  return {
    kind: 'logs',
    path: relative,
    sha256: sha256(bytes),
    summary: 'fixture failure evidence',
  };
}

function injectedIoError(message) {
  const error = new Error(message);
  error.code = 'EIO';
  return error;
}

async function runOrderlyScenario(
  scenario,
  {
    cleanupFailures = [],
    validateFailureEvidence = ({ acceptedCells, runRoot }) =>
      validateAcknowledgedFailureEvidence({
        cells: acceptedCells,
        runRoot,
      }),
  } = {},
) {
  const allocation = allocateFixtureRunRoot();
  const scenarioPath = path.join(
    allocation.runRoot,
    'supervised-input.json',
  );
  const scenarioInput = {
    scenario,
    timeoutMs: configuration.matrix.cells[0].timeoutMs,
  };
  fs.writeFileSync(scenarioPath, canonicalJson(scenarioInput), {
    flag: 'wx',
    mode: 0o600,
  });
  const facts = {
    cleanupCalls: 0,
    failure: null,
    greenValidationCalls: 0,
    releaseValidationCalls: 0,
  };
  const cleanup = createOnceAsyncOperation(async () => {
    facts.cleanupCalls += 1;
    return {
      failures: cleanupFailures,
      residue: {
        containers: 0,
        images: 0,
        networks: 0,
      },
    };
  });
  try {
    const code = await superviseAcceptanceWorker({
      cleanupExternalOwnership: cleanup,
      configuration,
      inputBeforeDigest: INPUT_DIGEST,
      inputDocumentDigest: canonicalJsonDigest(scenarioInput),
      inputPath: scenarioPath,
      runId: allocation.runId,
      runRoot: allocation.runRoot,
      validateExternalOwnershipRelease: async () => {
        facts.releaseValidationCalls += 1;
      },
      validateWorkerFailureEvidence: validateFailureEvidence,
      validateWorkerResult: async () => {
        facts.greenValidationCalls += 1;
      },
      workerModule: WORKER,
      writeSupervisedFailure: async (failure) => {
        facts.failure = failure;
      },
    });
    return { allocation, code, facts };
  } catch (error) {
    cleanupFixtureRunRoot(allocation);
    throw error;
  }
}

for (const [scenario, code] of [
  ['malformed-ipc', 'SUPERVISOR_IPC_INVALID'],
  ['sync-loop', 'SUPERVISOR_CELL_TIMEOUT'],
  ['microtask-starvation', 'SUPERVISOR_CELL_TIMEOUT'],
  ['fake-partial', 'SUPERVISOR_CELL_TIMEOUT'],
  ['terminal-hang', 'SUPERVISOR_TERMINAL_TIMEOUT'],
]) {
  test(`parent supervisor fails closed for ${scenario}`, async () => {
    const { allocation, failure } = await runScenario(scenario);
    try {
      assert.equal(failure.reason.code, code);
      assert.equal(failure.cells.length, 2);
      assert.equal(
        failure.cells[0].status,
        scenario === 'terminal-hang' ? 'pass' : 'fail',
      );
      assert.equal(
        failure.cells[1].status,
        scenario === 'terminal-hang' ? 'fail' : 'blocked',
      );
    } finally {
      cleanupFixtureRunRoot(allocation);
    }
  });
}

test('parent supervisor never acknowledges malformed IPC', async () => {
  const { allocation, failure } = await runScenario('malformed-ipc');
  try {
    assert.equal(failure.reason.code, 'SUPERVISOR_IPC_INVALID');
    assert.equal(
      fs.existsSync(path.join(allocation.runRoot, 'unexpected-ack')),
      false,
    );
  } finally {
    cleanupFixtureRunRoot(allocation);
  }
});

test('parent supervisor kills a reparented late writer before result creation', async () => {
  const { allocation, failure } = await runScenario('late-descendant');
  try {
    assert.equal(failure.reason.code, 'SUPERVISOR_CELL_TIMEOUT');
    assert.ok(failure.cleanup.observedProcessCount >= 2);
    assert.ok(failure.cleanup.terminatedDescendantCount >= 1);
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    assert.equal(
      fs.existsSync(path.join(allocation.runRoot, 'late-descendant-marker')),
      false,
    );
  } finally {
    cleanupFixtureRunRoot(allocation);
  }
});

test('orderly worker exit zero runs only strict green validation', async () => {
  const { allocation, code, facts } =
    await runOrderlyScenario('orderly-pass');
  try {
    assert.equal(code, 0);
    assert.equal(facts.failure, null);
    assert.equal(facts.greenValidationCalls, 1);
    assert.equal(facts.releaseValidationCalls, 1);
    assert.equal(facts.cleanupCalls, 0);
  } finally {
    cleanupFixtureRunRoot(allocation);
  }
});

test('orderly direct failure remains primary and cleanup is exactly once', async () => {
  const cleanupMessage = 'fixture cleanup reported residue';
  const { allocation, code, facts } = await runOrderlyScenario(
    'orderly-direct-failure',
    { cleanupFailures: [cleanupMessage] },
  );
  try {
    assert.equal(code, 1);
    assert.equal(facts.greenValidationCalls, 0);
    assert.equal(facts.releaseValidationCalls, 0);
    assert.equal(facts.cleanupCalls, 1);
    assert.equal(facts.failure.reason.code, 'COMMAND_ERROR');
    assert.equal(facts.failure.cells[0].failure.code, 'COMMAND_ERROR');
    assert.equal(facts.failure.cells[1].status, 'blocked');
    assert.equal(
      facts.failure.cleanup.cleanupFailures[0].message,
      cleanupMessage,
    );
  } finally {
    cleanupFixtureRunRoot(allocation);
  }
});

test('earlier invalid acknowledged evidence replaces direct failure primary', async () => {
  const { allocation, facts } = await runOrderlyScenario(
    'orderly-earlier-pass-invalid-evidence',
  );
  try {
    assert.equal(facts.failure.reason.code, 'SUPERVISOR_EVIDENCE_INVALID');
    assert.equal(
      facts.failure.cells[0].failure.code,
      'SUPERVISOR_EVIDENCE_INVALID',
    );
    assert.equal(facts.failure.cells[1].status, 'blocked');
  } finally {
    cleanupFixtureRunRoot(allocation);
  }
});

test('invalid evidence on the direct-failure cell does not replace its owner error', async () => {
  const { allocation, facts } = await runOrderlyScenario(
    'orderly-direct-failure-invalid-evidence',
  );
  try {
    assert.equal(facts.failure.reason.code, 'COMMAND_ERROR');
    assert.equal(facts.failure.cells[0].failure.code, 'COMMAND_ERROR');
    assert.equal(facts.failure.cells[0].evidence.length, 1);
  } finally {
    cleanupFixtureRunRoot(allocation);
  }
});

test('failure-evidence validation counts bind to acknowledged descriptors', async () => {
  const { allocation, facts } = await runOrderlyScenario(
    'orderly-direct-failure-valid-evidence',
    {
      validateFailureEvidence: async () => ({
        earliestRejectedCell: null,
        rejectedCellIndices: [],
        rejectedDescriptorCount: 0,
        validatedDescriptorCount: 0,
      }),
    },
  );
  try {
    assert.equal(facts.failure.reason.code, 'SUPERVISOR_EVIDENCE_INVALID');
    assert.equal(
      facts.failure.cells[0].failure.code,
      'SUPERVISOR_EVIDENCE_INVALID',
    );
  } finally {
    cleanupFixtureRunRoot(allocation);
  }
});

test('second-root rename failure restores only roots actually moved', async () => {
  const allocation = allocateFixtureRunRoot();
  const state = {};
  const direct = writeFixtureEvidence(
    allocation.runRoot,
    'evidence/direct.log',
    'direct\n',
  );
  writeFixtureEvidence(
    allocation.runRoot,
    'browser/evidence/browser.log',
    'browser\n',
  );
  const evidenceIdentity = fs.lstatSync(
    path.join(allocation.runRoot, 'evidence'),
  ).ino;
  const browserIdentity = fs.lstatSync(
    path.join(allocation.runRoot, 'browser'),
  ).ino;
  const originalRenameSync = fs.renameSync;
  let injected = false;
  try {
    fs.renameSync = (source, destination) => {
      if (
        !injected &&
        source === path.join(allocation.runRoot, 'browser')
      ) {
        injected = true;
        throw injectedIoError('second root rename failed');
      }
      return originalRenameSync(source, destination);
    };
    await assert.rejects(
      isolateAndSanitizeFailureEvidence({
        cells: [fixtureCell('first.cell', 'fail', [direct])],
        isolationState: state,
        runRoot: allocation.runRoot,
      }),
      /second root rename failed/u,
    );
  } finally {
    fs.renameSync = originalRenameSync;
  }
  try {
    assert.equal(state.phase, undefined);
    assert.equal(
      fs.lstatSync(path.join(allocation.runRoot, 'evidence')).ino,
      evidenceIdentity,
    );
    assert.equal(
      fs.lstatSync(path.join(allocation.runRoot, 'browser')).ino,
      browserIdentity,
    );
    assert.equal(
      fs.readFileSync(
        path.join(allocation.runRoot, 'browser/evidence/browser.log'),
        'utf8',
      ),
      'browser\n',
    );
    const isolated = await isolateAndSanitizeFailureEvidence({
      cells: [fixtureCell('first.cell', 'fail', [direct])],
      isolationState: state,
      runRoot: allocation.runRoot,
    });
    assert.equal(state.phase, 'complete');
    assert.equal(isolated.cells[0].evidence.length, 1);
  } finally {
    cleanupFixtureRunRoot(allocation);
  }
});

test('post-move mkdir failure rolls back and retry retains direct log', async () => {
  const allocation = allocateFixtureRunRoot();
  const state = {};
  const direct = writeFixtureEvidence(
    allocation.runRoot,
    'evidence/direct.log',
    'direct\n',
  );
  const evidenceRoot = path.join(allocation.runRoot, 'evidence');
  const evidenceIdentity = fs.lstatSync(evidenceRoot).ino;
  const originalMkdirSync = fs.mkdirSync;
  let injected = false;
  try {
    fs.mkdirSync = (candidate, options) => {
      const result = originalMkdirSync(candidate, options);
      if (!injected && candidate === evidenceRoot) {
        injected = true;
        throw injectedIoError('mkdir failed after creation');
      }
      return result;
    };
    await assert.rejects(
      isolateAndSanitizeFailureEvidence({
        cells: [fixtureCell('first.cell', 'fail', [direct])],
        isolationState: state,
        runRoot: allocation.runRoot,
      }),
      /mkdir failed after creation/u,
    );
  } finally {
    fs.mkdirSync = originalMkdirSync;
  }
  try {
    assert.equal(state.phase, undefined);
    assert.equal(fs.lstatSync(evidenceRoot).ino, evidenceIdentity);
    assert.equal(
      fs.readFileSync(path.join(evidenceRoot, 'direct.log'), 'utf8'),
      'direct\n',
    );
    const isolated = await isolateAndSanitizeFailureEvidence({
      cells: [fixtureCell('first.cell', 'fail', [direct])],
      isolationState: state,
      runRoot: allocation.runRoot,
    });
    assert.equal(state.phase, 'complete');
    assert.equal(isolated.cells[0].evidence[0].path, 'evidence/direct.log');
  } finally {
    cleanupFixtureRunRoot(allocation);
  }
});

test('copy failure rolls back rebuilt roots before restoring originals', async () => {
  const allocation = allocateFixtureRunRoot();
  const state = {};
  const direct = writeFixtureEvidence(
    allocation.runRoot,
    'evidence/direct.log',
    'direct\n',
  );
  const evidenceRoot = path.join(allocation.runRoot, 'evidence');
  const evidenceIdentity = fs.lstatSync(evidenceRoot).ino;
  const originalCopyFileSync = fs.copyFileSync;
  let injected = false;
  try {
    fs.copyFileSync = (source, destination, mode) => {
      const result = originalCopyFileSync(source, destination, mode);
      if (!injected) {
        injected = true;
        throw injectedIoError('copy failed after creation');
      }
      return result;
    };
    await assert.rejects(
      isolateAndSanitizeFailureEvidence({
        cells: [fixtureCell('first.cell', 'fail', [direct])],
        isolationState: state,
        runRoot: allocation.runRoot,
      }),
      /copy failed after creation/u,
    );
  } finally {
    fs.copyFileSync = originalCopyFileSync;
  }
  try {
    assert.equal(state.phase, undefined);
    assert.equal(fs.lstatSync(evidenceRoot).ino, evidenceIdentity);
    assert.equal(
      fs.readFileSync(path.join(evidenceRoot, 'direct.log'), 'utf8'),
      'direct\n',
    );
    const isolated = await isolateAndSanitizeFailureEvidence({
      cells: [fixtureCell('first.cell', 'fail', [direct])],
      isolationState: state,
      runRoot: allocation.runRoot,
    });
    assert.equal(state.phase, 'complete');
    assert.equal(isolated.cells[0].evidence.length, 1);
  } finally {
    cleanupFixtureRunRoot(allocation);
  }
});

test('finish removal failure resumes prepared state without losing earlier pass evidence', async () => {
  const allocation = allocateFixtureRunRoot();
  const state = {};
  const passEvidence = writeFixtureEvidence(
    allocation.runRoot,
    'evidence/pass.log',
    'pass\n',
  );
  const directEvidence = writeFixtureEvidence(
    allocation.runRoot,
    'evidence/direct.log',
    'direct\n',
  );
  const cells = [
    fixtureCell('first.cell', 'pass', [passEvidence]),
    fixtureCell('second.cell', 'fail', [directEvidence]),
  ];
  const originalUnlinkSync = fs.unlinkSync;
  let injected = false;
  try {
    fs.unlinkSync = (candidate) => {
      if (
        !injected &&
        candidate.includes('worker-evidence-quarantine-') &&
        candidate.endsWith('pass.log')
      ) {
        injected = true;
        throw injectedIoError('finish removal failed');
      }
      return originalUnlinkSync(candidate);
    };
    await assert.rejects(
      isolateAndSanitizeFailureEvidence({
        cells,
        isolationState: state,
        runRoot: allocation.runRoot,
      }),
      /finish removal failed/u,
    );
  } finally {
    fs.unlinkSync = originalUnlinkSync;
  }
  try {
    assert.equal(state.phase, 'prepared');
    const isolated = await isolateAndSanitizeFailureEvidence({
      cells,
      isolationState: state,
      runRoot: allocation.runRoot,
    });
    assert.equal(state.phase, 'complete');
    assert.equal(isolated.earliestRejectedCell, null);
    assert.equal(isolated.cells[0].evidence[0].path, 'evidence/pass.log');
    assert.equal(
      fs.readFileSync(
        path.join(allocation.runRoot, 'evidence/pass.log'),
        'utf8',
      ),
      'pass\n',
    );
    const reused = await isolateAndSanitizeFailureEvidence({
      cells,
      isolationState: state,
      runRoot: allocation.runRoot,
    });
    assert.equal(reused.cells[0].evidence[0].path, 'evidence/pass.log');
  } finally {
    cleanupFixtureRunRoot(allocation);
  }
});

test('manifest write failure restores originals and retries on the same state', async () => {
  const allocation = allocateFixtureRunRoot();
  const state = {};
  const direct = writeFixtureEvidence(
    allocation.runRoot,
    'evidence/direct.log',
    'direct\n',
  );
  const evidenceRoot = path.join(allocation.runRoot, 'evidence');
  const evidenceIdentity = fs.lstatSync(evidenceRoot).ino;
  const originalWriteFileSync = fs.writeFileSync;
  let injected = false;
  try {
    fs.writeFileSync = (candidate, ...args) => {
      const result = originalWriteFileSync(candidate, ...args);
      if (!injected && Number.isInteger(candidate)) {
        injected = true;
        throw injectedIoError('manifest write failed');
      }
      return result;
    };
    await assert.rejects(
      isolateAndSanitizeFailureEvidence({
        cells: [fixtureCell('first.cell', 'fail', [direct])],
        isolationState: state,
        runRoot: allocation.runRoot,
      }),
      /manifest write failed/u,
    );
  } finally {
    fs.writeFileSync = originalWriteFileSync;
  }
  try {
    assert.equal(state.phase, undefined);
    assert.equal(fs.lstatSync(evidenceRoot).ino, evidenceIdentity);
    assert.equal(
      fs.readFileSync(path.join(evidenceRoot, 'direct.log'), 'utf8'),
      'direct\n',
    );
    const isolated = await isolateAndSanitizeFailureEvidence({
      cells: [fixtureCell('first.cell', 'fail', [direct])],
      isolationState: state,
      runRoot: allocation.runRoot,
    });
    assert.equal(state.phase, 'complete');
    assert.equal(isolated.cells[0].evidence.length, 1);
  } finally {
    cleanupFixtureRunRoot(allocation);
  }
});

test('partial parent failure JSON is removed and retry records the writer fault', async () => {
  const allocation = allocateFixtureRunRoot();
  const state = {};
  const originalOpenSync = fs.openSync;
  const originalWriteFileSync = fs.writeFileSync;
  let injected = false;
  let targetDescriptor = null;
  try {
    fs.openSync = (candidate, ...args) => {
      const descriptor = originalOpenSync(candidate, ...args);
      if (
        typeof candidate === 'string' &&
        candidate.endsWith('.failure.json.parent-private.tmp')
      ) {
        targetDescriptor = descriptor;
      }
      return descriptor;
    };
    fs.writeFileSync = (candidate, value, ...args) => {
      if (!injected && candidate === targetDescriptor) {
        injected = true;
        const bytes = Buffer.from(value);
        originalWriteFileSync(
          candidate,
          bytes.subarray(0, Math.max(1, Math.floor(bytes.length / 2))),
          ...args,
        );
        throw injectedIoError('parent evidence partial write failed');
      }
      return originalWriteFileSync(candidate, value, ...args);
    };
    await assert.rejects(
      writeRetryableParentFailureEvidence({
        kind: 'supervisorFailure',
        runRoot: allocation.runRoot,
        state,
        summary: 'fixture parent failure',
        value: { cleanup: { failures: [] }, schemaVersion: 1 },
      }),
      /parent evidence partial write failed/u,
    );
  } finally {
    fs.openSync = originalOpenSync;
    fs.writeFileSync = originalWriteFileSync;
  }
  try {
    assert.equal(state.phase, 'prepared');
    assert.deepEqual(fs.readdirSync(state.evidenceRoot), []);
    await writeRetryableParentFailureEvidence({
      kind: 'supervisorFailure',
      runRoot: allocation.runRoot,
      state,
      summary: 'fixture parent failure',
      value: {
        cleanup: { failures: ['parent evidence partial write failed'] },
        schemaVersion: 1,
      },
    });
    const document = JSON.parse(
      fs.readFileSync(
        path.join(state.evidenceRoot, 'failure.json'),
        'utf8',
      ),
    );
    assert.deepEqual(document.cleanup.failures, [
      'parent evidence partial write failed',
    ]);
    await writeRetryableParentFailureEvidence({
      kind: 'supervisorFailure',
      runRoot: allocation.runRoot,
      state,
      summary: 'fixture parent failure',
      value: {
        cleanup: {
          failures: [
            'parent evidence partial write failed',
            'later parent index write failed',
          ],
        },
        schemaVersion: 1,
      },
    });
    const retryDocument = JSON.parse(
      fs.readFileSync(
        path.join(state.evidenceRoot, 'retry.json'),
        'utf8',
      ),
    );
    assert.deepEqual(retryDocument.cleanup.failures, [
      'parent evidence partial write failed',
      'later parent index write failed',
    ]);
    assert.deepEqual(
      fs.readdirSync(state.evidenceRoot).sort(),
      ['failure.json', 'retry.json'],
    );
    const cells = [fixtureCell('first.cell', 'fail')];
    await registerFailureEvidence({
      cells,
      registrationState: {},
      runRoot: allocation.runRoot,
    });
    await validateEvidenceFiles({
      cells,
      runRoot: allocation.runRoot,
    });
  } finally {
    cleanupFixtureRunRoot(allocation);
  }
});

test('partial parent failure index is removed and the same registration resumes', async () => {
  const allocation = allocateFixtureRunRoot();
  const parentState = {};
  const registrationState = {};
  await writeRetryableParentFailureEvidence({
    kind: 'supervisorFailure',
    runRoot: allocation.runRoot,
    state: parentState,
    summary: 'fixture parent failure',
    value: { cleanup: { failures: [] }, schemaVersion: 1 },
  });
  const cells = [fixtureCell('first.cell', 'fail')];
  const originalOpenSync = fs.openSync;
  const originalWriteFileSync = fs.writeFileSync;
  let injected = false;
  let targetDescriptor = null;
  try {
    fs.openSync = (candidate, ...args) => {
      const descriptor = originalOpenSync(candidate, ...args);
      if (
        typeof candidate === 'string' &&
        candidate.endsWith('.index.json.parent-private.tmp')
      ) {
        targetDescriptor = descriptor;
      }
      return descriptor;
    };
    fs.writeFileSync = (candidate, value, ...args) => {
      if (!injected && candidate === targetDescriptor) {
        injected = true;
        const bytes = Buffer.from(value);
        originalWriteFileSync(
          candidate,
          bytes.subarray(0, Math.max(1, Math.floor(bytes.length / 2))),
          ...args,
        );
        throw injectedIoError('parent index partial write failed');
      }
      return originalWriteFileSync(candidate, value, ...args);
    };
    await assert.rejects(
      registerFailureEvidence({
        cells,
        registrationState,
        runRoot: allocation.runRoot,
      }),
      /parent index partial write failed/u,
    );
  } finally {
    fs.openSync = originalOpenSync;
    fs.writeFileSync = originalWriteFileSync;
  }
  try {
    assert.equal(registrationState.phase, 'prepared');
    assert.equal(cells[0].evidence.length, 0);
    assert.deepEqual(fs.readdirSync(registrationState.indexRoot), []);
    await registerFailureEvidence({
      cells,
      registrationState,
      runRoot: allocation.runRoot,
    });
    assert.equal(registrationState.phase, 'complete');
    assert.deepEqual(
      fs.readdirSync(registrationState.indexRoot),
      ['index.json'],
    );
    await validateEvidenceFiles({
      cells,
      runRoot: allocation.runRoot,
    });
    const completedIndexRoot = registrationState.indexRoot;
    const reusedCells = [fixtureCell('first.cell', 'fail')];
    await registerFailureEvidence({
      cells: reusedCells,
      registrationState,
      runRoot: allocation.runRoot,
    });
    assert.equal(fs.existsSync(completedIndexRoot), false);
    assert.equal(registrationState.phase, 'complete');
    assert.equal(reusedCells[0].evidence.length, 1);
    await validateEvidenceFiles({
      cells: reusedCells,
      runRoot: allocation.runRoot,
    });
  } finally {
    cleanupFixtureRunRoot(allocation);
  }
});

test('completed parent index is rebuilt when retry facts add evidence', async () => {
  const allocation = allocateFixtureRunRoot();
  const parentState = {};
  const registrationState = {};
  try {
    await writeRetryableParentFailureEvidence({
      kind: 'supervisorFailure',
      runRoot: allocation.runRoot,
      state: parentState,
      summary: 'fixture parent failure',
      value: {
        cleanup: { failures: [] },
        reason: { code: 'COMMAND_ERROR' },
        schemaVersion: 1,
      },
    });
    const firstCells = [fixtureCell('first.cell', 'fail')];
    await registerFailureEvidence({
      cells: firstCells,
      registrationState,
      runRoot: allocation.runRoot,
    });
    const firstIndexRoot = registrationState.indexRoot;
    assert.equal(registrationState.phase, 'complete');

    await writeRetryableParentFailureEvidence({
      kind: 'supervisorFailure',
      runRoot: allocation.runRoot,
      state: parentState,
      summary: 'fixture parent failure',
      value: {
        cleanup: { failures: ['canonical result write failed'] },
        reason: { code: 'COMMAND_ERROR' },
        schemaVersion: 1,
      },
    });
    const retryCells = [fixtureCell('first.cell', 'fail')];
    await registerFailureEvidence({
      cells: retryCells,
      registrationState,
      runRoot: allocation.runRoot,
    });
    assert.equal(fs.existsSync(firstIndexRoot), false);
    assert.equal(registrationState.phase, 'complete');
    const retryDocument = JSON.parse(
      fs.readFileSync(
        path.join(parentState.evidenceRoot, 'retry.json'),
        'utf8',
      ),
    );
    assert.equal(retryDocument.reason.code, 'COMMAND_ERROR');
    assert.deepEqual(retryDocument.cleanup.failures, [
      'canonical result write failed',
    ]);
    const index = JSON.parse(
      fs.readFileSync(registrationState.indexPath, 'utf8'),
    );
    assert.deepEqual(
      index.map((descriptor) => path.basename(descriptor.path)).sort(),
      ['failure.json', 'retry.json'],
    );
    await validateEvidenceFiles({
      cells: retryCells,
      runRoot: allocation.runRoot,
    });
    const output = await writeAndVerifyCanonicalResult({
      result: { closed: true },
      runRoot: allocation.runRoot,
    });
    assert.equal(output.path, 'result.json');
  } finally {
    cleanupFixtureRunRoot(allocation);
  }
});

test('parent runtime prepare receives full artifact attestation and removes only owned tags', async () => {
  const allocation = allocateFixtureRunRoot();
  const socketRoot = fs.realpathSync.native(
    fs.mkdtempSync('/tmp/bgmss-supervisor-socket-'),
  );
  const dockerSocket = path.join(socketRoot, 'docker.sock');
  const server = net.createServer();
  const connections = new Set();
  server.on('connection', (connection) => {
    connections.add(connection);
    connection.once('close', () => connections.delete(connection));
  });
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(dockerSocket, resolve);
    });
    const backendRoot = path.join(allocation.runRoot, 'artifacts', 'backend');
    const updaterRoot = path.join(allocation.runRoot, 'artifacts', 'updater');
    fs.mkdirSync(path.join(updaterRoot, 'artifacts'), {
      recursive: true,
      mode: 0o700,
    });
    fs.mkdirSync(backendRoot, { recursive: true, mode: 0o700 });
    const backendOci = writeOciArchive(
      path.join(backendRoot, 'backend.oci.tar'),
      'backend',
    );
    const updaterOci = writeOciArchive(
      path.join(updaterRoot, 'updater.oci.tar'),
      'updater',
    );
    fs.writeFileSync(
      path.join(updaterRoot, 'artifacts', 'build-metadata.json'),
      canonicalJson({
        artifacts: {
          image: {
            oci: {
              config: { digest: updaterOci.configDigest },
              manifest: { digest: updaterOci.manifestDigest },
              reference: UPDATER_IMAGE,
            },
          },
        },
      }),
    );
    const backendRuntimeId = `sha256:${'a'.repeat(64)}`;
    const updaterRuntimeId = `sha256:${'b'.repeat(64)}`;
    const invalidBackendRuntimeId = `sha256:${'c'.repeat(64)}`;
    const backendContainerd = fakeImageInspection(
      backendOci,
      BACKEND_IMAGE,
      {
        descriptor: true,
        repoDigests: [],
        runtimeId: backendRuntimeId,
      },
    );
    const updaterContainerd = fakeImageInspection(
      updaterOci,
      UPDATER_IMAGE,
      {
        descriptor: true,
        repoDigests: [],
        runtimeId: updaterRuntimeId,
      },
    );
    const backendClassic = fakeImageInspection(
      backendOci,
      BACKEND_IMAGE,
      {
        descriptor: false,
        runtimeId: backendOci.configDigest,
      },
    );
    const backendContainerdWithoutDescriptor = fakeImageInspection(
      backendOci,
      BACKEND_IMAGE,
      {
        descriptor: false,
        runtimeId: backendOci.configDigest,
      },
    );
    const backendClassicWrongId = fakeImageInspection(
      backendOci,
      BACKEND_IMAGE,
      {
        descriptor: false,
        runtimeId: backendOci.manifestDigest,
      },
    );
    const backendInvalidRuntimeId = fakeImageInspection(
      backendOci,
      BACKEND_IMAGE,
      {
        descriptor: true,
        repoDigests: [],
        runtimeId: 'not-a-digest',
      },
    );
    const backendInvalidDescriptor = fakeImageInspection(
      backendOci,
      BACKEND_IMAGE,
      {
        descriptor: true,
        descriptorDigest: `sha256:${'d'.repeat(64)}`,
        repoDigests: [],
        runtimeId: invalidBackendRuntimeId,
      },
    );
    const backendWrongRepositoryDigest =
      JSON.parse(backendContainerd)[0];
    backendWrongRepositoryDigest.RepoDigests = [
      `localhost/bgmss-backend-api@sha256:${'e'.repeat(64)}`,
    ];
    assert.equal(
      acceptedLoadedImageIdentity({
        archive: backendOci,
        document: JSON.parse(backendContainerd)[0],
        image: BACKEND_IMAGE,
        imageStore: { mode: 'containerd' },
        requireExclusiveTag: true,
      }),
      backendRuntimeId,
    );
    assert.equal(
      acceptedLoadedImageIdentity({
        archive: backendOci,
        document: JSON.parse(backendClassic)[0],
        image: BACKEND_IMAGE,
        imageStore: { mode: 'classic' },
        requireExclusiveTag: true,
      }),
      backendOci.configDigest,
    );
    assert.throws(
      () =>
        acceptedLoadedImageIdentity({
          archive: backendOci,
          document: JSON.parse(backendContainerdWithoutDescriptor)[0],
          image: BACKEND_IMAGE,
          imageStore: { mode: 'containerd' },
          requireExclusiveTag: true,
        }),
      /lacks an accepted manifest descriptor/u,
    );
    assert.throws(
      () =>
        acceptedLoadedImageIdentity({
          archive: backendOci,
          document: JSON.parse(backendClassicWrongId)[0],
          image: BACKEND_IMAGE,
          imageStore: { mode: 'classic' },
          requireExclusiveTag: true,
        }),
      /lacks an accepted manifest descriptor/u,
    );
    assert.throws(
      () =>
        acceptedLoadedImageIdentity({
          archive: backendOci,
          document: JSON.parse(backendInvalidRuntimeId)[0],
          image: BACKEND_IMAGE,
          imageStore: { mode: 'containerd' },
          requireExclusiveTag: true,
        }),
      /unexpected runtime ID/u,
    );
    assert.throws(
      () =>
        acceptedLoadedImageIdentity({
          archive: backendOci,
          document: backendWrongRepositoryDigest,
          image: BACKEND_IMAGE,
          imageStore: { mode: 'containerd' },
          requireExclusiveTag: true,
        }),
      /unexpected repository digest/u,
    );
    const docker = path.join(allocation.runRoot, 'fake-docker.sh');
    fs.writeFileSync(
      docker,
      `#!/bin/sh
set -eu
root=$(dirname "$HOME")
backend_ref='${BACKEND_IMAGE}'
updater_ref='${UPDATER_IMAGE}'
backend_identity="$root/fake-backend-identity"
backend_tag="$root/fake-backend-tag"
updater_identity="$root/fake-updater-identity"
updater_tag="$root/fake-updater-tag"
invalid_backend="$root/invalid-backend-load"
removed_images="$root/removed-images"
kind=$1
action=$2
if [ "$kind" = info ] && [ "$action" = --format ]; then
  printf '%s\\n' '{"driver":"overlayfs","driverStatus":[["driver-type","io.containerd.snapshotter.v1"]]}'
  exit 0
fi
if [ "$kind" = image ] && [ "$action" = load ]; then
  archive=$4
  case "$archive" in
    */backend/*)
      if [ -f "$invalid_backend" ]; then
        printf '%s\\n' '${invalidBackendRuntimeId}' > "$backend_identity"
      else
        printf '%s\\n' '${backendRuntimeId}' > "$backend_identity"
      fi
      : > "$backend_tag"
      ;;
    */updater/*)
      printf '%s\\n' '${updaterRuntimeId}' > "$updater_identity"
      : > "$updater_tag"
      ;;
    *) exit 7 ;;
  esac
  printf 'Loaded image\\n'
  exit 0
fi
if [ "$kind" = image ] && [ "$action" = inspect ]; then
  if [ "$3" = --format ]; then ref=$5; else ref=$3; fi
  state=
  tag=
  document=
  case "$ref" in
    "$backend_ref")
      state=$backend_identity
      tag=$backend_tag
      if [ -f "$invalid_backend" ]; then
        document='${backendInvalidDescriptor}'
      else
        document='${backendContainerd}'
      fi
      ;;
    "$updater_ref")
      state=$updater_identity
      tag=$updater_tag
      document='${updaterContainerd}'
      ;;
    *)
      if [ -f "$backend_identity" ] && [ "$(cat "$backend_identity")" = "$ref" ]; then
        state=$backend_identity
        if [ -f "$invalid_backend" ]; then
          document='${backendInvalidDescriptor}'
        else
          document='${backendContainerd}'
        fi
      elif [ -f "$updater_identity" ] && [ "$(cat "$updater_identity")" = "$ref" ]; then
        state=$updater_identity
        document='${updaterContainerd}'
      fi
      ;;
  esac
  if [ -n "$state" ] && [ -f "$state" ] && { [ -z "$tag" ] || [ -f "$tag" ]; }; then
    if [ "$3" = --format ]; then cat "$state"; else printf '%s\\n' "$document"; fi
    exit 0
  fi
  printf 'Error response from daemon: No such image: %s\\n' "$ref" >&2
  exit 1
fi
if [ "$kind" = image ] && [ "$action" = rm ]; then
  [ "$3" != --force ]
  case "$3" in
    "$backend_ref")
      rm "$backend_tag" "$backend_identity"
      ;;
    "$updater_ref")
      rm "$updater_tag" "$updater_identity"
      ;;
    *) exit 8 ;;
  esac
  printf '%s\\n' "$3" >> "$removed_images"
  exit 0
fi
if [ "$kind" = container ] && [ "$action" = ls ]; then exit 0; fi
if [ "$kind" = container ] && [ "$action" = inspect ]; then
  printf 'Error response from daemon: No such container: %s\\n' "$3" >&2
  exit 1
fi
if [ "$kind" = network ] && [ "$action" = inspect ]; then
  printf 'Error response from daemon: network %s not found\\n' "$3" >&2
  exit 1
fi
exit 9
`,
      { mode: 0o700 },
    );
    const artifactAttestation = {
      roots: {
        backend: backendRoot,
        updater: updaterRoot,
      },
      statements: {
        backend: {
          source: { revision: BACKEND_REVISION },
          artifacts: [{ path: 'backend.oci.tar' }],
        },
        updater: {
          source: { revision: UPDATER_REVISION },
          artifacts: [{ path: 'updater.oci.tar' }],
        },
      },
    };
    const updaterMetadataPath = path.join(
      updaterRoot,
      'artifacts',
      'build-metadata.json',
    );
    const updaterMetadata = JSON.parse(
      fs.readFileSync(updaterMetadataPath, 'utf8'),
    );
    fs.writeFileSync(
      updaterMetadataPath,
      canonicalJson({
        ...updaterMetadata,
        artifacts: {
          ...updaterMetadata.artifacts,
          image: {
            ...updaterMetadata.artifacts.image,
            oci: {
              ...updaterMetadata.artifacts.image.oci,
              reference:
                `localhost/bgmss-updater-artifact:${'4'.repeat(40)}-arm64`,
            },
          },
        },
      }),
    );
    assert.throws(
      () =>
        new SupervisorRuntimeOwnership({
          allocation,
          artifacts: artifactAttestation,
          budgets: configuration.budgets,
          docker: { path: docker },
          dockerEndpoint: `unix://${dockerSocket}`,
        }),
      /invalid image reference/u,
    );
    fs.writeFileSync(updaterMetadataPath, canonicalJson(updaterMetadata));
    const ownership = new SupervisorRuntimeOwnership({
      allocation,
      artifacts: artifactAttestation,
      budgets: configuration.budgets,
      docker: { path: docker },
      dockerEndpoint: `unix://${dockerSocket}`,
    });
    const prepared = await ownership.prepare();
    assert.equal(Object.keys(prepared.loaded).length, 2);
    assert.equal(prepared.imageStore.mode, 'containerd');
    assert.equal(
      prepared.loaded[BACKEND_IMAGE],
      backendRuntimeId,
    );
    assert.equal(prepared.observed[BACKEND_IMAGE], backendRuntimeId);
    await assert.rejects(
      ownership.verifyReleased(),
      /resources remain/u,
    );
    const cleanup = await ownership.cleanup();
    assert.deepEqual(cleanup.failures, []);
    assert.deepEqual(cleanup.residue, {
      containers: 0,
      images: 0,
      networks: 0,
    });
    await ownership.verifyReleased();

    const removedImages = path.join(allocation.runRoot, 'removed-images');
    assert.deepEqual(
      fs.readFileSync(removedImages, 'utf8').trim().split('\n').sort(),
      [BACKEND_IMAGE, UPDATER_IMAGE].sort(),
    );
    fs.unlinkSync(removedImages);
    fs.writeFileSync(
      path.join(allocation.runRoot, 'invalid-backend-load'),
      'invalid\n',
      { flag: 'wx', mode: 0o600 },
    );
    const interruptedOwnership = new SupervisorRuntimeOwnership({
      allocation,
      artifacts: artifactAttestation,
      budgets: configuration.budgets,
      docker: { path: docker },
      dockerEndpoint: `unix://${dockerSocket}`,
    });
    await assert.rejects(
      interruptedOwnership.prepare(),
      /unexpected manifest descriptor/u,
    );
    assert.deepEqual(interruptedOwnership.facts().pending, [BACKEND_IMAGE]);
    assert.deepEqual(interruptedOwnership.facts().observed, {
      [BACKEND_IMAGE]: invalidBackendRuntimeId,
    });
    fs.unlinkSync(path.join(allocation.runRoot, 'fake-backend-tag'));
    const interruptedCleanup = await interruptedOwnership.cleanup();
    assert.deepEqual(interruptedCleanup.failures, [
      'supervisor-owned Docker identity remains after cleanup',
    ]);
    assert.deepEqual(interruptedCleanup.residue, {
      containers: 0,
      images: 1,
      networks: 0,
    });
    assert.equal(fs.existsSync(removedImages), false);
    assert.equal(
      fs.readFileSync(
        path.join(allocation.runRoot, 'fake-backend-identity'),
        'utf8',
      ).trim(),
      invalidBackendRuntimeId,
    );
    await assert.rejects(
      interruptedOwnership.verifyReleased(),
      /resources remain/u,
    );
    fs.unlinkSync(path.join(allocation.runRoot, 'fake-backend-identity'));
    await interruptedOwnership.verifyReleased();
  } finally {
    for (const connection of connections) connection.destroy();
    if (server.listening) server.close();
    fs.rmSync(socketRoot, { force: false, recursive: true });
    cleanupFixtureRunRoot(allocation);
  }
});
