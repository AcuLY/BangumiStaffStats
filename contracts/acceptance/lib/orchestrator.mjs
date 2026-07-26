import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createBrowserAcceptanceSession,
} from '../browser/index.mjs';
import {
  actionBoundaryFacts,
  createActionBoundary,
  drainActionBoundary,
  revokeActionBoundary,
  runWithActionBoundary,
} from './action-boundary.mjs';
import {
  attestFullArchive,
  materializeFullArchive,
  verifyFullArchiveSeal,
  verifyMaterializedArchiveSeal,
} from './archive.mjs';
import {
  attestArtifacts,
  verifyArtifactSeals,
} from './artifacts.mjs';
import {
  attestCacheCompatibilityPhase,
  cacheCompatibilityResultIdentity,
  createCacheCompatibilityEnvelope,
} from './cache-compatibility.mjs';
import { attestInputCaches, verifyInputCacheSeal } from './cache-input.mjs';
import { seedNpmCache } from './cache.mjs';
import { canonicalJsonDigest } from './canonical-json.mjs';
import {
  ACCEPTANCE_ROOT,
  REPOSITORY_ROOT,
  RESULT_VERDICT,
} from './constants.mjs';
import {
  BUDGETS_IDENTITY_DIGEST,
  validateResult,
} from './contracts.mjs';
import {
  isolateAndSanitizeFailureEvidence,
  registerFailureEvidence,
  validateEvidenceFiles,
  writeAndVerifyCanonicalResult,
} from './evidence-validation.mjs';
import { commandEvidence, writeEvidence } from './evidence.mjs';
import {
  runArchiveConsumerGate,
  runArtifactCompatibilityGate,
  runArtifactComponentGates,
  runBackendOwnerGate,
  runContractsOwnerGate,
  runFrontendOwnerGate,
  runUpdaterOwnerGate,
  runtimeReadOnlySandboxProfile,
} from './gates.mjs';
import {
  attestSourceIdentities,
  materializeCandidateClone,
} from './git-attestation.mjs';
import { verifyPackagePolicy } from './package-policy.mjs';
import {
  MeasurementRecorder,
  recordApiMeasurements,
  recordArchiveMeasurements,
  recordArtifactMeasurements,
  recordBackendMeasurements,
  recordBrowserMeasurements,
  recordSuiteMeasurement,
} from './performance.mjs';
import {
  attestOfficialProvenance,
  OFFICIAL_PROVENANCE_IDENTITY,
  verifyOfficialProvenanceSeal,
} from './provenance.mjs';
import { buildResult, ResultStateMachine } from './result.mjs';
import {
  allocateRunRoot,
  attestOwnedRunRoot,
  inventoryOwnedRunRoot,
} from './run-root.mjs';
import {
  newHostProcesses,
  newOwnedCwdProcesses,
  runCommand,
  runWithCommandAbortSignal,
  sanitizeSummary,
  sanitizedEnvironment,
  snapshotHostProcessInventory,
  snapshotOwnedCwdProcesses,
  terminateOwnedProcesses,
} from './runner.mjs';
import {
  AcceptedRuntime,
  assertDockerInventoryUnchanged,
  ownedRuntimeResidue,
} from './runtime.mjs';
import { sha256File } from './seal.mjs';
import {
  attestSupervisorProtectedInputs,
} from './supervisor-inputs.mjs';
import { attestTools, verifyToolSeal } from './tools.mjs';
import { createRealApiJourney } from './api-journey.mjs';

const NETWORKLESS_PROFILE = '(version 1)(allow default)(deny network*)';
const ZERO_DIGEST = `sha256:${'0'.repeat(64)}`;

export class AcceptanceOrchestrationError extends Error {}

class MatrixAbort extends Error {
  constructor(cause) {
    super('closed acceptance matrix aborted');
    this.cause = cause;
  }
}

function fail(message) {
  throw new AcceptanceOrchestrationError(message);
}

function safeCellToken(cellId) {
  return cellId.replaceAll('.', '-');
}

function failureCode(error) {
  const source =
    error?.code ??
    error?.constructor?.name ??
    'ACCEPTANCE_FAILURE';
  const normalized = String(source)
    .replaceAll(/([a-z])([A-Z])/gu, '$1_$2')
    .replaceAll(/[^A-Za-z0-9]+/gu, '_')
    .replaceAll(/^_+|_+$/gu, '')
    .toUpperCase();
  return /^[A-Z][A-Z0-9_]{2,63}$/u.test(normalized)
    ? normalized
    : 'ACCEPTANCE_FAILURE';
}

function sanitizeSupervisedFailureSummary(value) {
  return sanitizeSummary(value)
    .replaceAll(
      /(?:password|secret|authorization|bearer|token)=[^\s,;]*/giu,
      '<redacted>',
    )
    .slice(0, 512);
}

function evidenceArray(value) {
  if (!Array.isArray(value)) fail('matrix action did not return an evidence array');
  return value;
}

function assertRequiredEvidence(cell, evidence) {
  const kinds = new Set(evidence.map((entry) => entry?.kind));
  const missing = cell.evidence.filter((kind) => !kinds.has(kind));
  if (missing.length > 0) {
    fail(`${cell.id} omitted required evidence: ${missing.join(', ')}`);
  }
}

export class ClosedMatrixExecution {
  constructor(
    matrix,
    { signal, abortDrainMs = 1_000, checkpoint } = {},
  ) {
    if (signal !== undefined && !(signal instanceof AbortSignal)) {
      fail('closed matrix parent signal is invalid');
    }
    if (
      !Number.isInteger(abortDrainMs) ||
      abortDrainMs < 0 ||
      abortDrainMs > 30_000
    ) {
      fail('closed matrix abort drain is invalid');
    }
    this.matrix = matrix;
    this.state = new ResultStateMachine(matrix);
    this.signal = signal;
    this.abortDrainMs = abortDrainMs;
    this.actionBoundaries = [];
    this.checkpoint = checkpoint;
    this.checkpointedIndex = null;
    this.cellIndex = 0;
    if (checkpoint !== undefined && typeof checkpoint !== 'function') {
      fail('closed matrix checkpoint writer is invalid');
    }
  }

  get boundaryRevocations() {
    return this.actionBoundaries
      .filter((boundary) => actionBoundaryFacts(boundary).revoked)
      .map((boundary) => actionBoundaryFacts(boundary));
  }

  revokeAllBoundaries() {
    for (const boundary of this.actionBoundaries) {
      revokeActionBoundary(boundary);
    }
    return this.boundaryRevocations;
  }

  async checkpointNext() {
    if (!this.checkpoint) return;
    if (this.checkpointedIndex === this.cellIndex) return;
    const cell = this.matrix.cells[this.cellIndex];
    if (!cell) fail('closed matrix checkpoint has no next cell');
    const previous =
      this.cellIndex === 0
        ? null
        : this.state.snapshot()[this.cellIndex - 1];
    this.checkpointedIndex = this.cellIndex;
    await this.checkpoint({
      type: 'checkpoint',
      cellId: cell.id,
      index: this.cellIndex,
      phase: cell.phase,
      previous,
      timeoutMs: cell.timeoutMs,
    });
  }

  completeCheckpointedCell() {
    if (this.checkpoint && this.checkpointedIndex !== this.cellIndex) {
      fail('closed matrix cell completed without its parent checkpoint');
    }
    this.cellIndex += 1;
    this.checkpointedIndex = null;
  }

  async terminal(code) {
    if (!this.checkpoint) return;
    if (![0, 1].includes(code)) fail('closed matrix terminal code is invalid');
    const cells = this.state.snapshot();
    const previous =
      code === 0
        ? cells.at(-1)
        : cells.find((cell) => cell.status === 'fail');
    if (!previous) fail('closed matrix terminal record is absent');
    await this.checkpoint({
      type: 'terminal',
      code,
      previous,
    });
  }

  async run(cellId, action) {
    const cell = this.state.next();
    if (!cell || cell.id !== cellId) {
      fail(
        `closed matrix order mismatch: expected ${cell?.id ?? '(complete)'}, received ${cellId}`,
      );
    }
    const started = performance.now();
    const controller = new AbortController();
    const signal = this.signal
      ? AbortSignal.any([this.signal, controller.signal])
      : controller.signal;
    const timeoutError = new AcceptanceOrchestrationError(
      `${cell.id} exceeded its closed ${cell.timeoutMs} ms timeout`,
    );
    let timer;
    let onAbort;
    let actionPromise;
    const actionBoundary = createActionBoundary(cell.id);
    this.actionBoundaries.push(actionBoundary);
    try {
      await this.checkpointNext();
      actionPromise = runWithActionBoundary(actionBoundary, () =>
        Promise.resolve().then(() =>
          runWithCommandAbortSignal(signal, () =>
            action({
              deadline: started + cell.timeoutMs,
              signal,
              timeoutMs: cell.timeoutMs,
            }),
          ),
        ),
      );
      const timeoutPromise = new Promise((resolve, reject) => {
        onAbort = () =>
          reject(
            signal.reason instanceof Error
              ? signal.reason
              : new AcceptanceOrchestrationError(`${cell.id} was aborted`),
          );
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
        timer = setTimeout(() => {
          controller.abort(timeoutError);
          reject(timeoutError);
        }, cell.timeoutMs);
      });
      const output = await Promise.race([actionPromise, timeoutPromise]);
      const evidence = evidenceArray(output?.evidence ?? output);
      const durationMs = Math.round(performance.now() - started);
      if (durationMs > cell.timeoutMs) {
        fail(`${cell.id} exceeded its closed ${cell.timeoutMs} ms timeout`);
      }
      assertRequiredEvidence(cell, evidence);
      this.state.pass(cell.id, { durationMs, evidence });
      this.completeCheckpointedCell();
      return output?.value;
    } catch (error) {
      this.revokeAllBoundaries();
      if (actionPromise) {
        await drainActionBoundary(actionBoundary, actionPromise, {
          timeoutMs: Math.max(this.abortDrainMs, 1_000),
        });
      }
      const durationMs = Math.min(
        Math.round(performance.now() - started),
        cell.timeoutMs,
      );
      const evidence = Array.isArray(error?.evidence)
        ? error.evidence
        : error?.result
          ? commandEvidence(error.result)
          : [];
      this.state.fail(cell.id, {
        durationMs,
        evidence,
        code: failureCode(error),
        summary: error instanceof Error ? error.message : String(error),
      });
      this.completeCheckpointedCell();
      throw new MatrixAbort(error);
    } finally {
      clearTimeout(timer);
      if (onAbort) signal.removeEventListener('abort', onAbort);
    }
  }
}

async function cellEvidence(runRoot, cellId, kind, value, summary) {
  return writeEvidence({
    runRoot,
    relative: `evidence/cells/${safeCellToken(cellId)}/${kind}.json`,
    kind,
    value,
    summary,
  });
}

async function nestedCommandLogs(runRoot, cellId, results) {
  return cellEvidence(
    runRoot,
    cellId,
    'logs',
    results.flatMap((result) => commandEvidence(result)),
    `${results.length} bounded command log pairs`,
  );
}

async function commandDeclaration(runRoot, cellId, results, summary) {
  return cellEvidence(
    runRoot,
    cellId,
    'command',
    results.map((result) => ({
      durationMs: result.durationMs,
      id: result.id,
      signal: result.signal,
      status: result.status,
      timedOut: result.timedOut,
    })),
    summary,
  );
}

function runtimeRoots(attestation) {
  return Object.values(attestation.runtimeRoots).map(
    (declaration) => declaration.root,
  );
}

async function preparePlaywrightPackage({
  cacheRoot,
  runRoot,
  toolAttestation,
  budgets,
}) {
  const root = path.join(runRoot, 'browser', 'playwright-package');
  fs.mkdirSync(root, { mode: 0o700 });
  for (const name of ['package.json', 'package-lock.json']) {
    fs.copyFileSync(
      path.join(ACCEPTANCE_ROOT, name),
      path.join(root, name),
      fs.constants.COPYFILE_EXCL,
    );
  }
  const cache = path.join(runRoot, 'cache', 'acceptance-npm');
  seedNpmCache({
    source: cacheRoot,
    destination: cache,
    lockPaths: [path.join(root, 'package-lock.json')],
  });
  const tools = toolAttestation.tools;
  const result = await runCommand({
    id: 'acceptance-playwright-npm-ci',
    executable: '/usr/bin/sandbox-exec',
    args: [
      '-p',
      runtimeReadOnlySandboxProfile(
        runtimeRoots(toolAttestation),
        NETWORKLESS_PROFILE,
      ),
      tools.node.path,
      tools.npm.path,
      'ci',
      '--ignore-scripts',
      '--offline',
      '--no-audit',
      '--no-fund',
    ],
    cwd: root,
    environment: sanitizedEnvironment({
      runRoot,
      pathEntries: [path.dirname(tools.node.path), '/usr/bin', '/bin'],
      extra: {
        NPM_CONFIG_AUDIT: 'false',
        NPM_CONFIG_CACHE: cache,
        NPM_CONFIG_ENGINE_STRICT: 'true',
        NPM_CONFIG_FUND: 'false',
        NPM_CONFIG_IGNORE_SCRIPTS: 'true',
        NPM_CONFIG_OFFLINE: 'true',
        PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
      },
    }),
    timeoutMs: 300_000,
    gracefulStopMs: budgets.timeouts.gracefulStopMs,
    runRoot,
  });
  const packageRoot = path.join(root, 'node_modules', '@playwright', 'test');
  if (!fs.existsSync(packageRoot)) fail('run-owned Playwright package is absent');
  return Object.freeze({ packageRoot, result });
}

function exactFrontendTar(artifacts) {
  const statement = artifacts.statements.frontend;
  const matches = statement.artifacts.filter((artifact) =>
    artifact.path.endsWith('.tar'),
  );
  if (matches.length !== 1) fail('Frontend statement must name one packaged tar');
  return path.join(
    artifacts.roots.frontend,
    ...matches[0].path.split('/'),
  );
}

function apiAdapter(runtime) {
  return async ({ body, headers, method, path: pathname, signal }) => {
    const effectiveMethod = method === 'HEAD' ? 'GET' : method;
    const response = await runtime.requestRaw(pathname, {
      method: effectiveMethod,
      bodyBytes: effectiveMethod === 'POST' ? body : undefined,
      contentType: headers['content-type'],
      signal,
    });
    return Object.freeze({
      body: response.bytes,
      headers: response.headers,
      status: response.status,
    });
  };
}

export function protectedInputSeal({
  archive,
  artifacts,
  cache,
  cacheCompatibility,
  provenance,
  sources,
  tools,
}) {
  return canonicalJsonDigest({
    archive: {
      dataVersion: archive.identity.dataVersion,
      manifestDigest: archive.identity.manifestDigest,
      rootDigest: archive.sourceSeal.digest,
      sqliteDigest: archive.identity.sqliteDigest,
    },
    artifacts: Object.fromEntries(
      ['backend', 'updater', 'frontend', 'compatibility'].map((name) => [
        name,
        {
          digest: artifacts.seals[name].digest,
          identityDigest: artifacts.seals[name].identityDigest,
        },
      ]),
    ),
    cache: {
      manifestDigest: cache.digest,
      rootDigest: cache.rootSeal,
      compatibility: {
        revisions: cacheCompatibility.revisions,
        counts: cacheCompatibility.counts,
        authorities: cacheCompatibility.authorities,
        seals: cacheCompatibility.seals,
      },
    },
    provenance: {
      digest: provenance.identity.provenanceDigest,
      rootDigest: provenance.sourceSeal.digest,
    },
    sources: {
      product: {
        revision: sources.product.revision,
        tree: sources.product.tree,
      },
      harness: {
        revision: sources.harness.revision,
        tree: sources.harness.tree,
      },
    },
    tools: {
      executables: tools.identities,
      runtimeClosures: tools.runtimeClosures,
      browserDigest: tools.browser.executableDigest,
    },
  });
}

function selectedComponentIdentities(artifacts) {
  return Object.fromEntries(
    ['backend', 'updater', 'frontend'].map((component) => [
      component,
      {
        artifactSetDigest:
          artifacts.components[component].artifactSetDigest,
        statementDigest:
          artifacts.components[component].statementDigest,
      },
    ]),
  );
}

function resultIdentities({
  artifacts,
  cacheCompatibility,
  configuration,
  oracle,
  provenance,
  archive,
  sources,
  tools,
}) {
  return {
    product: {
      revision: sources.product.revision,
      tree: sources.product.tree,
    },
    harness: {
      revision: sources.harness.revision,
      tree: sources.harness.tree,
    },
    components: selectedComponentIdentities(artifacts),
    compatibility: artifacts.compatibility.digest,
    cacheCompatibility,
    archive: {
      ...archive.identity,
      ...provenance.identity,
    },
    oracle,
    tools: tools.identities,
    browser: {
      name: tools.browser.name,
      version: tools.browser.version,
      executableDigest: tools.browser.executableDigest,
    },
    historicalGo: {
      rootDigest: tools.historicalGoSeal.digest,
      ownerFixedInPlace: true,
      copied: false,
      hermetic: false,
    },
    runtimeClosures: tools.runtimeClosures,
    budgets: {
      profileId: configuration.budgets.profile.id,
      digest: BUDGETS_IDENTITY_DIGEST,
    },
  };
}

function fallbackRuntimeClosures() {
  const declarations = {
    currentNodeSource: ['directory', 'read-only-source', false, false],
    currentNode: ['directory', 'run-owned-copy', true, true],
    queryNode: ['directory', 'owner-fixed-in-place', false, false],
    currentNpmSource: ['directory', 'read-only-source', false, false],
    currentNpm: ['directory', 'run-owned-copy', true, true],
    queryNpm: ['directory', 'owner-fixed-in-place', false, false],
    currentGoSource: ['directory', 'read-only-source', false, false],
    currentGo: ['directory', 'run-owned-copy', true, true],
    historicalGo: ['directory', 'owner-fixed-in-place', false, false],
    pythonSource: ['directory', 'read-only-source', false, false],
    python: ['directory', 'run-owned-copy', true, true],
    uvSource: ['single-file', 'read-only-source', false, false],
    uv: ['single-file', 'run-owned-copy', true, true],
    dockerSource: ['single-file', 'read-only-source', false, false],
    docker: ['single-file', 'run-owned-copy', true, true],
    browserSource: ['directory', 'read-only-source', false, false],
    browserCopy: ['directory', 'run-owned-copy', true, true],
  };
  return Object.fromEntries(
    Object.entries(declarations).map(([name, declaration]) => [
      name,
      {
        shape: declaration[0],
        classification: declaration[1],
        rootDigest: ZERO_DIGEST,
        identityDigest: ZERO_DIGEST,
        copied: declaration[2],
        hermetic: declaration[3],
      },
    ]),
  );
}

export function failedResultIdentities({
  cacheCompatibility,
  configuration,
  context,
  input,
}) {
  const source = (name) => ({
    revision: context.sources?.[name]?.revision ?? input[name].revision,
    tree: context.sources?.[name]?.tree ?? input[name].tree,
  });
  const components = context.artifacts
    ? selectedComponentIdentities(context.artifacts)
    : Object.fromEntries(
        ['backend', 'updater', 'frontend'].map((name) => [
          name,
          {
            artifactSetDigest: ZERO_DIGEST,
            statementDigest: ZERO_DIGEST,
          },
        ]),
      );
  return {
    product: source('product'),
    harness: source('harness'),
    components,
    compatibility:
      context.artifacts?.compatibility?.digest ?? ZERO_DIGEST,
    cacheCompatibility,
    archive: {
      dataVersion:
        context.archive?.identity?.dataVersion ?? input.archive.dataVersion,
      manifestDigest:
        context.archive?.identity?.manifestDigest ?? ZERO_DIGEST,
      sqliteDigest:
        context.archive?.identity?.sqliteDigest ?? ZERO_DIGEST,
      ...(context.provenance?.identity ?? OFFICIAL_PROVENANCE_IDENTITY),
    },
    oracle: context.oracle ?? {
      revision: input.oracle.revision,
      tree: input.oracle.tree,
      buildDigest: ZERO_DIGEST,
    },
    tools:
      context.tools?.identities ??
      Object.fromEntries(
        Object.entries(input.tools).map(([name, declaration]) => [
          name,
          {
            version: declaration.version,
            sha256: declaration.sha256,
          },
        ]),
      ),
    browser: {
      name: input.browser.name,
      version: input.browser.version,
      executableDigest: input.browser.executableDigest,
    },
    historicalGo: {
      rootDigest: context.tools?.historicalGoSeal?.digest ?? ZERO_DIGEST,
      ownerFixedInPlace: true,
      copied: false,
      hermetic: false,
    },
    runtimeClosures:
      context.tools?.runtimeClosures ?? fallbackRuntimeClosures(),
    budgets: {
      profileId: configuration.budgets.profile.id,
      digest: BUDGETS_IDENTITY_DIGEST,
    },
  };
}

function runtimeCommandSlice(runtime, cursor) {
  return Object.freeze({
    cursor: runtime.commands.length,
    results: runtime.commands.slice(cursor),
  });
}

function activeResourceBaseline() {
  const counts = new Map();
  for (const name of process.getActiveResourcesInfo()) {
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

function activeRuntimeResidue(before) {
  const after = activeResourceBaseline();
  const additional = (names) =>
    names.reduce(
      (total, name) =>
        total + Math.max(0, (after.get(name) ?? 0) - (before.get(name) ?? 0)),
      0,
    );
  return Object.freeze({
    processes: additional(['ChildProcess', 'ProcessWrap', 'PROCESSWRAP']),
    listeners: additional([
      'TCPServerWrap',
      'TCPSERVERWRAP',
      'PipeServerWrap',
    ]),
  });
}

async function finalizeGreenResult({
  cacheIdentity,
  configuration,
  context,
  execution,
  inputAfter,
  inputBefore,
  measurementRecorder,
  residue,
  runId,
  runRoot,
  suiteStarted,
  suiteSignal,
}) {
  suiteSignal.throwIfAborted();
  const cell = execution.state.next();
  if (!cell || cell.id !== 'residue.verdict') {
    fail('final result cell is not the next closed matrix cell');
  }
  await execution.checkpointNext();
  const started = performance.now();
  const evidence = [
    await cellEvidence(
      runRoot,
      cell.id,
      'canonicalResult',
      {
        matrixVersion: configuration.matrix.matrixVersion,
        schemaVersion: 1,
      },
      'canonical result schema and exact closed matrix selected',
    ),
    await cellEvidence(
      runRoot,
      cell.id,
      'verdict',
      {
        operationsPending: true,
        verdict: RESULT_VERDICT,
      },
      'development accepted while release and deployment remain false',
    ),
  ];
  const durationMs = Math.round(performance.now() - started);
  if (durationMs > cell.timeoutMs) {
    fail('final result cell exceeded its closed timeout');
  }
  assertRequiredEvidence(cell, evidence);
  const provisionalCells = execution.state.snapshot();
  provisionalCells[provisionalCells.length - 1] = {
    id: cell.id,
    owner: cell.owner,
    status: 'pass',
    durationMs,
    evidence,
    failure: null,
  };
  await validateEvidenceFiles({ runRoot, cells: provisionalCells });
  suiteSignal.throwIfAborted();
  recordSuiteMeasurement(
    measurementRecorder,
    Math.round(performance.now() - suiteStarted),
  );
  const measurements = measurementRecorder.snapshot({
    complete: true,
    passing: true,
  });
  const result = buildResult({
    runId,
    matrix: configuration.matrix,
    state: { snapshot: () => provisionalCells },
    identities: resultIdentities({
      ...context,
      cacheCompatibility: cacheIdentity,
      configuration,
    }),
    machine: context.tools.machine,
    measurements,
    seals: {
      inputBefore,
      inputAfter,
      residue,
    },
    lifecycle: {
      specified: true,
      implemented: true,
      verified: true,
      committed: true,
      pushed: false,
    },
  });
  validateResult(result, configuration.matrix, configuration.budgets);
  const output = await writeAndVerifyCanonicalResult({ runRoot, result });
  execution.state.pass(cell.id, { durationMs, evidence });
  execution.completeCheckpointedCell();
  return output;
}

async function writeFailureDiagnostic({
  error,
  execution,
  runId,
  runRoot,
  cleanupFailures,
}) {
  const document = {
    schemaVersion: 1,
    kind: 'development-acceptance-failure-diagnostic',
    runId,
    failedBy: execution.state.failedBy,
    failure: sanitizeSummary(
      error instanceof Error ? error.message : String(error),
    ),
    cleanupFailures: cleanupFailures.map((entry) =>
      sanitizeSummary(entry instanceof Error ? entry.message : String(entry)),
    ),
    cells: execution.state.snapshot(),
  };
  return writeAndVerifyCanonicalResult({
    runRoot,
    relative: 'diagnostic.json',
    result: document,
  });
}

async function writeFailedCanonicalResult({
  cacheIdentity,
  configuration,
  context,
  execution,
  input,
  measurements,
  residue,
  runId,
  runRoot,
  inputAfter,
  inputBefore,
}) {
  const cells = execution.state.snapshot();
  await registerFailureEvidence({ runRoot, cells });
  const result = buildResult({
    runId,
    matrix: configuration.matrix,
    state: { snapshot: () => cells },
    identities: failedResultIdentities({
      cacheCompatibility: cacheIdentity,
      configuration,
      context,
      input,
    }),
    machine:
      context.tools?.machine ?? {
        profileId: configuration.budgets.profile.id,
        os: process.platform,
        architecture: process.arch,
        release: os.release(),
        logicalCpuCount: os.cpus().length,
        memoryBytes: os.totalmem(),
        dockerVersion: input.tools.docker.version,
      },
    measurements,
    seals: {
      inputBefore,
      inputAfter,
      residue,
    },
    lifecycle: {
      specified: true,
      implemented: true,
      verified: false,
      committed: Boolean(context.sources),
      pushed: false,
    },
  });
  validateResult(result, configuration.matrix, configuration.budgets);
  return writeAndVerifyCanonicalResult({ runRoot, result });
}

export async function writeSupervisedCanonicalFailure({
  cells,
  cleanup,
  configuration,
  input,
  inputAfter,
  inputBefore,
  reason,
  runId,
  runRoot,
  suiteDurationMs,
  workerOutput,
}) {
  if (
    !/^sha256:[0-9a-f]{64}$/u.test(inputBefore?.digest) ||
    !/^sha256:[0-9a-f]{64}$/u.test(inputAfter?.digest)
  ) {
    fail('supervisor failure result requires real input seal digests');
  }
  const resultPath = path.join(runRoot, 'result.json');
  let resultQuarantine = null;
  let workerResultExists = false;
  try {
    fs.lstatSync(resultPath);
    workerResultExists = true;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  if (workerResultExists) {
    const quarantineRoot = fs.mkdtempSync(
      path.join(runRoot, 'worker-result-untrusted-'),
    );
    resultQuarantine = path.join(quarantineRoot, 'result.json');
    fs.renameSync(resultPath, resultQuarantine);
  }
  const isolated = await isolateAndSanitizeFailureEvidence({
    runRoot,
    cells,
  });
  const resultCells = isolated.cells;
  const directFailureIndex = resultCells.findIndex(
    (cell) => cell.status === 'fail',
  );
  if (
    isolated.earliestRejectedCell !== null &&
    isolated.earliestRejectedCell < directFailureIndex
  ) {
    const failedIndex = isolated.earliestRejectedCell;
    const failedId = resultCells[failedIndex].id;
    resultCells[failedIndex] = {
      ...resultCells[failedIndex],
      status: 'fail',
      failure: {
        code: 'SUPERVISOR_EVIDENCE_INVALID',
        summary: 'parent rejected untrusted worker evidence',
        blockedBy: null,
      },
    };
    for (let index = failedIndex + 1; index < resultCells.length; index += 1) {
      resultCells[index] = {
        id: resultCells[index].id,
        owner: resultCells[index].owner,
        status: 'blocked',
        durationMs: 0,
        evidence: [],
        failure: {
          code: 'BLOCKED_BY_FAILURE',
          summary: `blocked by ${failedId}`,
          blockedBy: failedId,
        },
      };
    }
  }
  for (const cell of resultCells) {
    if (cell.failure !== null) {
      cell.failure.summary = sanitizeSupervisedFailureSummary(
        cell.failure.summary,
      );
    }
  }
  const evidenceRoot = fs.mkdtempSync(
    path.join(runRoot, 'evidence', 'parent-supervisor-'),
  );
  await writeEvidence({
    runRoot,
    relative: `${path
      .relative(runRoot, evidenceRoot)
      .split(path.sep)
      .join('/')}/failure.json`,
    kind: 'supervisorFailure',
    value: {
      cleanup: {
        failures: cleanup.cleanupFailures.map((error) =>
          sanitizeSupervisedFailureSummary(
            error instanceof Error ? error.message : String(error),
          ),
        ),
        external: cleanup.external,
        observedProcessCount: cleanup.observedProcessCount,
        terminatedDescendantCount: cleanup.terminatedDescendantCount,
      },
      inputAfter: {
        digest: inputAfter.digest,
        document: inputAfter.document,
        error: inputAfter.error ?? null,
      },
      inputBefore: {
        digest: inputBefore.digest,
        document: inputBefore.document,
      },
      quarantine: {
        evidence: isolated.quarantine,
        result:
          resultQuarantine === null
            ? null
            : path
                .relative(runRoot, resultQuarantine)
                .split(path.sep)
                .join('/'),
      },
      reason: {
        code: failureCode(reason),
        summary: sanitizeSupervisedFailureSummary(
          reason instanceof Error ? reason.message : String(reason),
        ),
      },
      runId,
      schemaVersion: 1,
      workerOutput,
    },
    summary: 'parent supervisor terminated the worker closure and re-sealed inputs',
  });
  await registerFailureEvidence({ runRoot, cells: resultCells });
  const recorder = new MeasurementRecorder(configuration.budgets);
  recordSuiteMeasurement(
    recorder,
    Math.max(0, Math.round(suiteDurationMs)),
  );
  const runInventory = inventoryOwnedRunRoot(runRoot);
  const externalResidue = cleanup.external?.residue ?? {};
  const cleanupFailed = cleanup.cleanupFailures.length > 0 ? 1 : 0;
  const result = buildResult({
    runId,
    matrix: configuration.matrix,
    state: { snapshot: () => resultCells },
    identities: failedResultIdentities({
      cacheCompatibility: null,
      configuration,
      context: {},
      input,
    }),
    machine: {
      profileId: configuration.budgets.profile.id,
      os: process.platform,
      architecture: process.arch,
      release: os.release(),
      logicalCpuCount: os.cpus().length,
      memoryBytes: os.totalmem(),
      dockerVersion: input.tools.docker.version,
    },
    measurements: recorder.snapshot(),
    seals: {
      inputBefore: inputBefore.digest,
      inputAfter: inputAfter.digest,
      residue: {
        processes: cleanupFailed,
        listeners: 0,
        containers: externalResidue.containers ?? cleanupFailed,
        images: externalResidue.images ?? cleanupFailed,
        networks: externalResidue.networks ?? cleanupFailed,
        files: runInventory.unsafeEntries,
      },
    },
    lifecycle: {
      specified: true,
      implemented: true,
      verified: false,
      committed: false,
      pushed: false,
    },
  });
  validateResult(result, configuration.matrix, configuration.budgets);
  return writeAndVerifyCanonicalResult({ runRoot, result });
}

export async function runAcceptance({
  input,
  configuration,
  checkpoint,
  packagePolicyVerified = false,
  runAllocation,
  supervisorInputBefore,
  supervisorPreparedImages = false,
}) {
  if (packagePolicyVerified) {
    if (typeof checkpoint !== 'function' || !runAllocation) {
      fail('package-policy handoff requires a supervised worker allocation');
    }
  } else {
    verifyPackagePolicy();
  }
  const allocation = runAllocation ?? allocateRunRoot();
  const owned = attestOwnedRunRoot(allocation.runRoot);
  if (allocation.runId !== owned.runId) {
    fail('preallocated run identity does not match its owned root');
  }
  const { runId, runRoot } = owned;
  const runFilesBefore = inventoryOwnedRunRoot(runRoot);
  const suiteStarted = performance.now();
  const suiteController = new AbortController();
  const suiteTimer = setTimeout(
    () =>
      suiteController.abort(
        new AcceptanceOrchestrationError(
          `acceptance suite exceeded ${configuration.budgets.timeouts.suiteMs} ms`,
        ),
      ),
    configuration.budgets.timeouts.suiteMs,
  );
  suiteTimer.unref();
  const hostBaseline = activeResourceBaseline();
  const hostProcessBaseline = snapshotHostProcessInventory();
  const ownedCwdProcessBaseline = snapshotOwnedCwdProcesses(runRoot);
  const execution = new ClosedMatrixExecution(configuration.matrix, {
    signal: suiteController.signal,
    checkpoint,
    abortDrainMs:
      configuration.budgets.timeouts.gracefulStopMs + 5_000,
  });
  const measurements = new MeasurementRecorder(configuration.budgets);
  const context = {};
  let runtime = null;
  let browserSession = null;
  let runtimeCursor = 0;
  let inputBefore = ZERO_DIGEST;
  let inputAfter = ZERO_DIGEST;
  let residue = {
    processes: 0,
    listeners: 0,
    containers: 0,
    images: 0,
    networks: 0,
    files: 0,
  };
  const cleanupFailures = [];

  try {
    context.cache = await execution.run('admission.input', async () => {
      const cache = await attestInputCaches(input);
      const inputSeal = await cellEvidence(
        runRoot,
        'admission.input',
        'inputSeal',
        {
          cacheManifestDigest: cache.digest,
          cacheRootDigest: cache.rootSeal,
          schemaVersion: input.schemaVersion,
        },
        'strict input and complete frozen cache admitted',
      );
      return { evidence: [inputSeal], value: cache };
    });

    context.sources = await execution.run('admission.sources', async () => {
      const sources = attestSourceIdentities(input);
      context.sources = sources;
      context.preCacheCompatibility = await attestCacheCompatibilityPhase({
        input,
        cacheAttestation: context.cache,
        phase: 'preAdmission',
      });
      const evidence = [
        await cellEvidence(
          runRoot,
          'admission.sources',
          'productIdentity',
          { revision: sources.product.revision, tree: sources.product.tree },
          'clean product candidate revision and tree admitted',
        ),
        await cellEvidence(
          runRoot,
          'admission.sources',
          'harnessIdentity',
          { revision: sources.harness.revision, tree: sources.harness.tree },
          'clean harness control revision and tree admitted',
        ),
        await cellEvidence(
          runRoot,
          'admission.sources',
          'protectedDiff',
          {
            changedPaths: sources.changed,
            cacheCompatibility:
              context.preCacheCompatibility.authoritySetSha256,
          },
          'harness difference is confined to reviewed control paths',
        ),
        await cellEvidence(
          runRoot,
          'admission.sources',
          'cacheCompatibilityPreAdmission',
          context.preCacheCompatibility,
          'exact 18 cache authorities match accepted source blobs',
        ),
      ];
      return { evidence, value: sources };
    });

    context.artifacts = await execution.run('admission.artifacts', async () => {
      const artifacts = await attestArtifacts(
        input.artifacts,
        context.sources.product,
      );
      context.artifacts = artifacts;
      const evidence = [
        await cellEvidence(
          runRoot,
          'admission.artifacts',
          'componentStatements',
          selectedComponentIdentities(artifacts),
          'three immutable component statements share one product identity',
        ),
        await cellEvidence(
          runRoot,
          'admission.artifacts',
          'compatibilityManifest',
          {
            canonicalDigest: artifacts.compatibility.canonicalDigest,
            digest: artifacts.compatibility.digest,
          },
          'assembled compatibility manifest admitted',
        ),
        await cellEvidence(
          runRoot,
          'admission.artifacts',
          'artifactSeals',
          {
            components: Object.fromEntries(
              Object.entries(artifacts.seals).map(([name, seal]) => [
                name,
                { digest: seal.digest, identityDigest: seal.identityDigest },
              ]),
            ),
          },
          'component artifact inputs are immutable',
        ),
      ];
      return { evidence, value: artifacts };
    });

    context.archive = await execution.run('admission.archive', async () => {
      const archive = await attestFullArchive({
        versionRoot: input.archive.versionRoot,
        expectedDataVersion: input.archive.dataVersion,
      });
      context.archive = archive;
      context.provenance = await attestOfficialProvenance({
        root: input.archive.provenanceRoot,
        manifestPath: input.archive.provenanceManifest,
        expectedDigest: input.archive.provenanceDigest,
        archiveAttestation: archive,
      });
      return {
        evidence: [
          await cellEvidence(
            runRoot,
            'admission.archive',
            'archiveSeal',
            archive.identity,
            'official full Archive manifest and SQLite identity admitted',
          ),
          await cellEvidence(
            runRoot,
            'admission.archive',
            'manifestFacts',
            archive.facts,
            'full Archive accounting admitted by its owning contract',
          ),
          await cellEvidence(
            runRoot,
            'admission.archive',
            'provenanceSeal',
            {
              identity: context.provenance.identity,
              sourceDigest: context.provenance.sourceSeal.digest,
            },
            'official Archive provenance admitted by its owning contract',
          ),
        ],
        value: archive,
      };
    });

    context.tools = await execution.run('admission.tools', async () => {
      const tools = await attestTools({
        input,
        runRoot,
        budgets: configuration.budgets,
        cacheAttestation: context.cache,
      });
      context.tools = tools;
      context.clone = await materializeCandidateClone({
        input,
        runRoot,
        tools: tools.tools,
        budgets: configuration.budgets,
      });
      inputBefore = protectedInputSeal({
        ...context,
        cacheCompatibility: context.preCacheCompatibility,
      });
      const evidence = [
        await cellEvidence(
          runRoot,
          'admission.tools',
          'toolIdentities',
          {
            identities: tools.identities,
            runtimeClosures: tools.runtimeClosures,
          },
          'current and historical tool closures admitted',
        ),
        await cellEvidence(
          runRoot,
          'admission.tools',
          'browserIdentity',
          {
            executableDigest: tools.browser.executableDigest,
            name: tools.browser.name,
            version: tools.browser.version,
          },
          'run-owned copied Chromium identity admitted',
        ),
        await cellEvidence(
          runRoot,
          'admission.tools',
          'machineProfile',
          tools.machine,
          'reviewed darwin arm64 development profile recorded',
        ),
        ...tools.evidence,
        ...context.clone.evidence,
      ];
      return { evidence, value: tools };
    });

    const gateArguments = () => ({
      candidateRoot: context.clone.root,
      cacheRoots: context.tools.cacheRoots,
      tools: context.tools.tools,
      budgets: configuration.budgets,
      runRoot,
      runtimeRoots: context.tools.runtimeRoots,
      toolAttestation: context.tools,
    });
    await execution.run('owner.contracts', async () => {
      const gate = await runContractsOwnerGate(gateArguments());
      return { evidence: gate.evidence, value: gate };
    });
    context.backendGate = await execution.run('owner.backend', async () => {
      const gate = await runBackendOwnerGate(gateArguments());
      return { evidence: gate.evidence, value: gate };
    });
    context.updaterGate = await execution.run('owner.updater', async () => {
      const gate = await runUpdaterOwnerGate(gateArguments());
      return { evidence: gate.evidence, value: gate };
    });
    await execution.run('owner.frontend', async () => {
      const gate = await runFrontendOwnerGate(gateArguments());
      return { evidence: gate.evidence, value: gate };
    });

    const artifactGateArguments = {
      candidateRoot: context.clone.root,
      artifacts: context.artifacts,
      tools: context.tools.tools,
      budgets: configuration.budgets,
      runRoot,
      updaterPython: context.updaterGate.python,
      runtimeRoots: context.tools.runtimeRoots,
      toolAttestation: context.tools,
    };
    await execution.run('artifacts.components', async () => {
      const gate = await runArtifactComponentGates(artifactGateArguments);
      return { evidence: gate.evidence, value: gate };
    });
    await execution.run('artifacts.compatibility', async () => {
      const gate = await runArtifactCompatibilityGate(artifactGateArguments);
      return { evidence: gate.evidence, value: gate };
    });

    context.materializedArchive = await execution.run(
      'archive.copy',
      async () => {
        const copyStarted = performance.now();
        const materialized = await materializeFullArchive({
          attestation: context.archive,
          runRoot,
        });
        context.archiveCopyMs = Math.round(performance.now() - copyStarted);
        const evidence = [
          await cellEvidence(
            runRoot,
            'archive.copy',
            'copySeal',
            {
              digest: materialized.outputSeal.digest,
              identity: materialized.identity,
            },
            'disposable Archive is an independent read-only byte copy',
          ),
          await cellEvidence(
            runRoot,
            'archive.copy',
            'currentPointer',
            materialized.pointer,
            'development-only current pointer names the copied Archive',
          ),
          await cellEvidence(
            runRoot,
            'archive.copy',
            'copyDuration',
            { milliseconds: context.archiveCopyMs },
            'full Archive streaming copy duration recorded',
          ),
        ];
        return { evidence, value: materialized };
      },
    );
    context.archiveConsumer = await execution.run(
      'archive.validate',
      async () => {
        const consumer = await runArchiveConsumerGate({
          ...gateArguments(),
          materialized: context.materializedArchive,
        });
        const evidence = [
          await cellEvidence(
            runRoot,
            'archive.validate',
            'archiveSeal',
            context.archive.identity,
            'official full Archive manifest and SQLite identity accepted',
          ),
          await cellEvidence(
            runRoot,
            'archive.validate',
            'manifestFacts',
            {
              ...context.archive.facts,
              provenance: context.provenance.facts,
            },
            'full Archive accounting and official provenance accepted',
          ),
          ...consumer.evidence,
        ];
        return { evidence, value: consumer };
      },
    );

    await execution.run('updater.doctor', async () => {
      runtime = new AcceptedRuntime({
        runId,
        runRoot,
        docker: context.tools.tools.docker.path,
        dockerEndpoint: context.tools.tools.docker.endpoint,
        artifacts: context.artifacts,
        archiveRoot: context.materializedArchive.archiveRoot,
        contractsRoot: path.join(context.clone.root, 'contracts'),
        budgets: configuration.budgets,
        supervisorPreparedImages,
      });
      context.dockerInventoryBefore = await runtime.resourceInventory();
      context.dockerOwnedBefore = ownedRuntimeResidue(
        context.dockerInventoryBefore,
        runtime,
      );
      const expectedPreparedImages = supervisorPreparedImages ? 2 : 0;
      if (
        context.dockerOwnedBefore.containers !== 0 ||
        context.dockerOwnedBefore.networks !== 0 ||
        context.dockerOwnedBefore.mounts !== 0 ||
        context.dockerOwnedBefore.images !== expectedPreparedImages
      ) {
        fail('reserved runtime identities existed before runtime preparation');
      }
      context.runtimePreparation = await runtime.prepare();
      runtimeCursor = runtime.commands.length;
      const outcome = await runtime.runUpdaterDoctor();
      const slice = runtimeCommandSlice(runtime, runtimeCursor);
      runtimeCursor = slice.cursor;
      return {
        evidence: [
          await commandDeclaration(
            runRoot,
            'updater.doctor',
            slice.results,
            'immutable Updater doctor command passed',
          ),
          await nestedCommandLogs(runRoot, 'updater.doctor', [
            ...runtime.commands.slice(0, runtimeCursor - slice.results.length),
            ...slice.results,
          ]),
          await cellEvidence(
            runRoot,
            'updater.doctor',
            'containerPolicy',
            {
              image: context.runtimePreparation.images.updater,
              network: 'none',
              rootFilesystem: 'read-only',
              user: '65532:65532',
              value: outcome.value,
            },
            'Updater doctor ran non-root, read-only, and networkless',
          ),
        ],
      };
    });
    await execution.run('updater.contract', async () => {
      const outcome = await runtime.runUpdaterContract();
      const slice = runtimeCommandSlice(runtime, runtimeCursor);
      runtimeCursor = slice.cursor;
      return {
        evidence: [
          await commandDeclaration(
            runRoot,
            'updater.contract',
            slice.results,
            'immutable Updater contract command passed',
          ),
          await nestedCommandLogs(
            runRoot,
            'updater.contract',
            slice.results,
          ),
          await cellEvidence(
            runRoot,
            'updater.contract',
            'containerPolicy',
            {
              contractMount: 'read-only',
              network: 'none',
              rootFilesystem: 'read-only',
              user: '65532:65532',
              value: outcome.value,
            },
            'Updater contract check used only accepted contract bytes',
          ),
        ],
      };
    });
    context.backendStart = await execution.run('backend.start', async () => {
      const started = await runtime.startBackend();
      const slice = runtimeCommandSlice(runtime, runtimeCursor);
      runtimeCursor = slice.cursor;
      const evidence = [
        await cellEvidence(
          runRoot,
          'backend.start',
          'containerPolicy',
          {
            internalNetwork: runtime.names.network,
            loopbackExposure: 'closed relay callback only',
            rootFilesystem: 'read-only',
            user: '65532:65532',
          },
          'Backend ran non-root on one internal local network',
        ),
        await cellEvidence(
          runRoot,
          'backend.start',
          'readyDuration',
          { milliseconds: started.readyDurationMs },
          'Backend full-Archive readiness duration recorded',
        ),
        await cellEvidence(
          runRoot,
          'backend.start',
          'runtimeIdentity',
          {
            dataVersion: context.archive.identity.dataVersion,
            image: context.runtimePreparation.images.backend,
            transport: started.transport,
          },
          'packaged Backend started against the copied Archive',
        ),
        await nestedCommandLogs(runRoot, 'backend.start', slice.results),
      ];
      return { evidence, value: started };
    });

    let apiJourney;
    const runApiCell = async (cellId, action) =>
      execution.run(cellId, async () => {
        const commandStart = runtimeCursor;
        const declarations = await action();
        runtimeCursor = runtime.commands.length;
        const evidence = [];
        for (const [kind, value, summary] of declarations) {
          evidence.push(
            await cellEvidence(runRoot, cellId, kind, value, summary),
          );
        }
        evidence.push(
          await nestedCommandLogs(
            runRoot,
            cellId,
            runtime.commands.slice(commandStart, runtimeCursor),
          ),
        );
        return { evidence };
      });
    await runApiCell('api.health', async () => {
      apiJourney = createRealApiJourney({
        runtime,
        candidateRoot: context.clone.root,
        dataVersion: context.archive.identity.dataVersion,
      });
      const facts = await apiJourney.runHealth();
      return [
        ['httpFacts', facts, 'live and ready endpoints accepted'],
        [
          'metrics',
          { responseBytes: facts.metricsBytes },
          'Backend metrics exposed the accepted Archive identity',
        ],
      ];
    });
    await runApiCell('api.catalog', async () => {
      const facts = await apiJourney.runCatalog();
      return [
        [
          'httpFacts',
          { positionCount: facts.positionCount, status: 200 },
          'dynamic catalog response accepted',
        ],
        [
          'catalogSelection',
          facts,
          'catalog exposes a complete selectable journey surface',
        ],
      ];
    });
    await runApiCell('api.candidates', async () => {
      const facts = await apiJourney.runCandidates();
      return [
        ['httpFacts', { status: 200 }, 'api.candidates returned accepted HTTP facts'],
        [
          'coldWarm',
          apiJourney.timings.candidates,
          'api.candidates cold and warm calls accepted',
        ],
        [
          'selectedPeople',
          { candidatePersonIds: facts.candidatePersonIds },
          'api.candidates used real full-Archive people',
        ],
      ];
    });
    await runApiCell('api.rankings', async () => {
      const facts = await apiJourney.runRankings();
      return [
        ['httpFacts', { status: 200 }, 'api.rankings returned accepted HTTP facts'],
        [
          'coldWarm',
          apiJourney.timings.rankings,
          'api.rankings cold and warm calls accepted',
        ],
        [
          'selectedPeople',
          {
            rankingPersonId: facts.rankingPersonId,
            candidatePersonIds: apiJourney.candidates.candidatePersonIds,
          },
          'api.rankings used real full-Archive people',
        ],
      ];
    });
    await runApiCell('api.person-detail', async () => {
      await apiJourney.runPersonDetail();
      return [
        [
          'httpFacts',
          { status: 200 },
          'api.person-detail returned accepted HTTP facts',
        ],
        [
          'coldWarm',
          apiJourney.timings.personDetail,
          'api.person-detail cold and warm calls accepted',
        ],
      ];
    });
    await runApiCell('api.partners', async () => {
      await apiJourney.runPartners();
      return [
        ['httpFacts', { status: 200 }, 'api.partners returned accepted HTTP facts'],
        [
          'coldWarm',
          apiJourney.timings.partners,
          'api.partners cold and warm calls accepted',
        ],
        [
          'selectedPeople',
          {
            rankingPersonId: apiJourney.rankings.rankingPersonId,
            candidatePersonIds: apiJourney.candidates.candidatePersonIds,
          },
          'api.partners used real full-Archive people',
        ],
      ];
    });
    await runApiCell('api.co-star', async () => {
      await apiJourney.runCoStar();
      return [
        ['httpFacts', { status: 200 }, 'api.co-star returned accepted HTTP facts'],
        [
          'coldWarm',
          {
            pair: apiJourney.timings.pair,
            group: apiJourney.timings.group,
          },
          'api.co-star pair and group cold and warm calls accepted',
        ],
      ];
    });
    await runApiCell('api.malformed', async () => {
      const facts = await apiJourney.runMalformed();
      return [
        ['httpFacts', facts, 'malformed and limit requests completed'],
        ['errorEnvelope', facts, 'error envelopes matched accepted schemas'],
      ];
    });
    await runApiCell('api.cancellation', async () => {
      const facts = await apiJourney.runCancellation();
      return [
        ['cancellation', facts, 'in-flight request was canceled'],
        [
          'latestResponse',
          {
            latestBytes: facts.latestBytes,
            latestDurationMs: facts.latestDurationMs,
          },
          'latest request completed after cancellation',
        ],
      ];
    });
    context.apiJourney = apiJourney.snapshot();

    await execution.run('frontend.serve', async () => {
      context.playwright = await preparePlaywrightPackage({
        cacheRoot: context.tools.cacheRoots.npm,
        runRoot,
        toolAttestation: context.tools,
        budgets: configuration.budgets,
      });
      browserSession = createBrowserAcceptanceSession({
        apiRequest: apiAdapter(runtime),
        browserCellTimeoutMs: configuration.budgets.timeouts.browserCellMs,
        chromiumExecutable: context.tools.browser.executablePath,
        chromiumVersion: context.tools.browser.version,
        frontendTarPath: exactFrontendTar(context.artifacts),
        gitExecutable: context.tools.tools.git.path,
        nodeExecutable: context.tools.tools.node.path,
        npmCacheRoot: path.join(runRoot, 'cache', 'oracle-npm'),
        npmCacheSource: context.tools.cacheRoots.npm,
        npmCliPath: context.tools.tools.npm.path,
        oracleExceptions: configuration.oracleExceptions,
        oracleTimeoutMs: 900_000,
        playwrightPackageRoot: context.playwright.packageRoot,
        repositoryRoot: input.harness.root,
        runRoot,
      });
      const evidence = [...await browserSession.serveCandidate()];
      evidence.push(
        await commandDeclaration(
          runRoot,
          'frontend.serve',
          [context.playwright.result],
          'pinned run-owned Playwright package installed offline',
        ),
        await nestedCommandLogs(
          runRoot,
          'frontend.serve',
          [context.playwright.result],
        ),
      );
      return { evidence };
    });
    await execution.run('oracle.materialize', async () => ({
      evidence: [...await browserSession.materializeOracle()],
    }));
    context.oracle = browserSession.oracleIdentity();
    await execution.run('browser.shared-journeys', async () => {
      const commandStart = runtimeCursor;
      const evidence = [...await browserSession.runSharedJourneys()];
      runtimeCursor = runtime.commands.length;
      evidence.push(
        await nestedCommandLogs(
          runRoot,
          'browser.shared-journeys',
          runtime.commands.slice(commandStart, runtimeCursor),
        ),
      );
      return { evidence };
    });
    for (const cell of configuration.matrix.cells.filter((candidate) =>
      /^browser\.(?:light|dark)\./u.test(candidate.id),
    )) {
      await execution.run(cell.id, async () => {
        const commandStart = runtimeCursor;
        const evidence = [...await browserSession.runMatrixCell(cell.id)];
        runtimeCursor = runtime.commands.length;
        evidence.push(
          await nestedCommandLogs(
            runRoot,
            cell.id,
            runtime.commands.slice(commandStart, runtimeCursor),
          ),
        );
        return { evidence };
      });
    }
    await execution.run('browser.safe-image', async () => {
      const commandStart = runtimeCursor;
      const evidence = [...await browserSession.runSafeImageCell()];
      runtimeCursor = runtime.commands.length;
      evidence.push(
        await nestedCommandLogs(
          runRoot,
          'browser.safe-image',
          runtime.commands.slice(commandStart, runtimeCursor),
        ),
      );
      return { evidence };
    });

    await execution.run('performance.characterization', async () => {
      const performanceCommandStart = runtimeCursor;
      const browserFacts = browserSession.performanceSnapshot();
      context.browserFacts = browserFacts;
      const backendFacts = await runtime.performanceSnapshot();
      runtimeCursor = runtime.commands.length;
      await browserSession.close();
      browserSession = null;
      context.runtimeCleanup = await runtime.cleanup();
      runtimeCursor = runtime.commands.length;

      recordArchiveMeasurements(
        measurements,
        context.archive,
        context.archiveCopyMs,
      );
      await recordArtifactMeasurements(
        measurements,
        context.artifacts,
        path.join(runRoot, 'browser', 'candidate-static'),
      );
      recordApiMeasurements(measurements, context.apiJourney);
      recordBackendMeasurements(measurements, {
        ...backendFacts,
        queryTestBinaryBytes: context.backendGate.queryTestBinaryBytes,
        readyMs: context.backendStart.readyDurationMs,
        shutdownMs: context.runtimeCleanup.backendShutdownDurationMs,
      });
      recordBrowserMeasurements(measurements, browserFacts);
      const characterized = measurements.snapshot({ passing: true });
      return {
        evidence: [
          await cellEvidence(
            runRoot,
            'performance.characterization',
            'measurements',
            characterized,
            'finite pre-cleanup development measurements recorded',
          ),
          await cellEvidence(
            runRoot,
            'performance.characterization',
            'budgetDecisions',
            characterized.filter((measurement) => measurement.budgetId !== null),
            'all characterized invariant and named-profile budgets passed without override',
          ),
          await cellEvidence(
            runRoot,
            'performance.characterization',
            'backendMemoryPolicy',
            {
              currentMemoryBytes: backendFacts.currentMemoryBytes,
              memoryHardLimitBytes: backendFacts.memoryHardLimitBytes,
              memorySampleCount: backendFacts.memorySampleCount,
              memorySampleIntervalMs: backendFacts.memorySampleIntervalMs,
              memorySwapHardLimitBytes:
                backendFacts.memorySwapHardLimitBytes,
              oomKilled: backendFacts.oomKilled,
              sampledHighWaterMemoryBytes:
                backendFacts.sampledHighWaterMemoryBytes,
            },
            'sampled high-water is distinguished from the exact enforced hard cap',
          ),
          await cellEvidence(
            runRoot,
            'performance.characterization',
            'machineProfile',
            context.tools.machine,
            'development characterization machine profile recorded',
          ),
          await nestedCommandLogs(
            runRoot,
            'performance.characterization',
            runtime.commands.slice(performanceCommandStart, runtimeCursor),
          ),
        ],
      };
    });

    context.cacheIdentity = await execution.run('residue.cleanup', async () => {
      const cleanupStart = runtimeCursor;
      await runtime.cleanup();
      runtimeCursor = runtime.commands.length;
      const postCache = await verifyInputCacheSeal(context.cache);
      context.postCacheCompatibility = await attestCacheCompatibilityPhase({
        input,
        cacheAttestation: postCache,
        phase: 'postCleanup',
      });
      await verifyArtifactSeals(context.artifacts);
      await verifyFullArchiveSeal(context.archive);
      await verifyOfficialProvenanceSeal(context.provenance);
      await verifyMaterializedArchiveSeal(context.materializedArchive);
      await verifyToolSeal(context.tools);
      const postSources = attestSourceIdentities(input);
      inputAfter = protectedInputSeal({
        ...context,
        cache: postCache,
        cacheCompatibility: context.postCacheCompatibility,
        sources: postSources,
      });
      if (inputAfter !== inputBefore) {
        fail('protected input aggregate changed after cleanup');
      }
      const envelope = createCacheCompatibilityEnvelope({
        preAdmission: context.preCacheCompatibility,
        postCleanup: context.postCacheCompatibility,
      });
      const compatibilityEvidence = await cellEvidence(
        runRoot,
        'residue.cleanup',
        'cacheCompatibilityPostCleanup',
        envelope,
        'post-cleanup cache authority set equals pre-admission',
      );
      const cacheIdentity = cacheCompatibilityResultIdentity({
        envelopePath: compatibilityEvidence.path,
        evidenceSha256: compatibilityEvidence.sha256,
        envelope,
      });
      const activeResidue = activeRuntimeResidue(hostBaseline);
      context.dockerInventoryAfter = await runtime.resourceInventory();
      context.dockerOwnedAfter = ownedRuntimeResidue(
        context.dockerInventoryAfter,
        runtime,
      );
      if (!supervisorPreparedImages) {
        assertDockerInventoryUnchanged(
          context.dockerInventoryBefore,
          context.dockerInventoryAfter,
        );
      }
      const runFilesAfter = inventoryOwnedRunRoot(runRoot);
      const ownedCwdLeaks = newOwnedCwdProcesses(
        ownedCwdProcessBaseline,
        snapshotOwnedCwdProcesses(runRoot),
      );
      await terminateOwnedProcesses(
        ownedCwdLeaks,
        configuration.budgets.timeouts.gracefulStopMs,
      );
      const hostProcessAfter = snapshotHostProcessInventory();
      const escapedProcesses = newHostProcesses(
        hostProcessBaseline,
        hostProcessAfter,
      );
      residue = {
        processes: activeResidue.processes,
        listeners: activeResidue.listeners,
        containers: context.dockerOwnedAfter.containers,
        images: context.dockerOwnedAfter.images,
        networks: context.dockerOwnedAfter.networks,
        files: runFilesAfter.unsafeEntries,
      };
      const browserExternalAttempts =
        context.browserFacts?.externalNetworkAttempts;
      const browserExternalAttemptFacts =
        context.browserFacts?.externalNetworkAttemptFacts;
      if (
        !Number.isSafeInteger(browserExternalAttempts) ||
        browserExternalAttempts < 0 ||
        !browserExternalAttemptFacts ||
        !Number.isSafeInteger(
          browserExternalAttemptFacts.candidateUnexpected,
        ) ||
        !Number.isSafeInteger(browserExternalAttemptFacts.oracleDenied) ||
        !Number.isSafeInteger(browserExternalAttemptFacts.total) ||
        browserExternalAttemptFacts.candidateUnexpected < 0 ||
        browserExternalAttemptFacts.oracleDenied < 0 ||
        browserExternalAttemptFacts.total !== browserExternalAttempts ||
        browserExternalAttemptFacts.total !==
          browserExternalAttemptFacts.candidateUnexpected +
            browserExternalAttemptFacts.oracleDenied
      ) {
        fail('browser external-network attempt observation is absent');
      }
      if (
        context.dockerOwnedAfter.mounts !== 0 ||
        ownedCwdLeaks.length !== 0 ||
        browserExternalAttempts !== 0 ||
        Object.values(residue).some((count) => count !== 0)
      ) {
        fail('owned runtime residue remains after cleanup');
      }
      return {
        evidence: [
          await cellEvidence(
            runRoot,
            'residue.cleanup',
            'inputReseal',
            { before: inputBefore, after: inputAfter },
            'all protected inputs re-sealed unchanged',
          ),
          await cellEvidence(
            runRoot,
            'residue.cleanup',
            'runtimeResidue',
            {
              ...residue,
              cleanup: context.runtimeCleanup,
              docker: {
                baseline: {
                  containers: context.dockerInventoryBefore.containers.length,
                  digest: context.dockerInventoryBefore.digest,
                  images: context.dockerInventoryBefore.images.length,
                  networks: context.dockerInventoryBefore.networks.length,
                  volumes: context.dockerInventoryBefore.volumes.length,
                },
                terminal: {
                  containers: context.dockerInventoryAfter.containers.length,
                  digest: context.dockerInventoryAfter.digest,
                  images: context.dockerInventoryAfter.images.length,
                  networks: context.dockerInventoryAfter.networks.length,
                  volumes: context.dockerInventoryAfter.volumes.length,
                },
                ownedBaseline: context.dockerOwnedBefore,
                ownedTerminal: context.dockerOwnedAfter,
              },
              runFiles: {
                baseline: runFilesBefore,
                terminal: runFilesAfter,
              },
              hostProcesses: {
                baselineCount: hostProcessBaseline.entries.length,
                baselineDigest: hostProcessBaseline.digest,
                diagnosticForeignPids:
                  escapedProcesses.map((entry) => entry.pid),
                terminalCount: hostProcessAfter.entries.length,
                terminalDigest: hostProcessAfter.digest,
              },
            },
            'owned resources are absent; unattributed host drift is diagnostic only',
          ),
          await cellEvidence(
            runRoot,
            'residue.cleanup',
            'networkResidue',
            {
              browserServers: 0,
              externalAttempts: browserExternalAttempts,
              observed: browserExternalAttemptFacts,
              listeners: residue.listeners,
              scope: 'browser candidate and oracle request observers',
            },
            'loopback servers closed and browser observers recorded no external attempt',
          ),
          compatibilityEvidence,
          await nestedCommandLogs(
            runRoot,
            'residue.cleanup',
            runtime.commands.slice(cleanupStart, runtimeCursor),
          ),
        ],
        value: cacheIdentity,
      };
    });

    if (supervisorInputBefore !== undefined) {
      if (!/^sha256:[0-9a-f]{64}$/u.test(supervisorInputBefore)) {
        fail('parent supervisor input seal is invalid');
      }
      const supervisorInputAfter =
        await attestSupervisorProtectedInputs(input);
      if (supervisorInputAfter.digest !== supervisorInputBefore) {
        fail('parent-supervised protected input aggregate changed');
      }
      inputBefore = supervisorInputBefore;
      inputAfter = supervisorInputAfter.digest;
    }

    const output = await finalizeGreenResult({
      cacheIdentity: context.cacheIdentity,
      configuration,
      context,
      execution,
      inputAfter,
      inputBefore,
      measurementRecorder: measurements,
      residue,
      runId,
      runRoot,
      suiteStarted,
      suiteSignal: suiteController.signal,
    });
    execution.revokeAllBoundaries();
    await execution.terminal(0);
    process.stdout.write(
      `acceptance result: ${path.relative(REPOSITORY_ROOT, path.join(runRoot, output.path))}\n`,
    );
    process.stdout.write(`${RESULT_VERDICT}\n`);
    clearTimeout(suiteTimer);
    return 0;
  } catch (caught) {
    const error = caught instanceof MatrixAbort ? caught.cause : caught;
    if (!(caught instanceof MatrixAbort) && !execution.state.failedBy) {
      const cell = execution.state.next();
      if (cell) {
        execution.state.fail(cell.id, {
          durationMs: 0,
          code: failureCode(error),
          summary: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (browserSession) {
      try {
        await browserSession.close();
      } catch (cleanupError) {
        cleanupFailures.push(cleanupError);
      }
    }
    if (runtime) {
      try {
        await runtime.cleanup();
      } catch (cleanupError) {
        cleanupFailures.push(cleanupError);
      }
    }
    const failureActiveResidue = activeRuntimeResidue(hostBaseline);
    try {
      const ownedCwdLeaks = newOwnedCwdProcesses(
        ownedCwdProcessBaseline,
        snapshotOwnedCwdProcesses(runRoot),
      );
      await terminateOwnedProcesses(
        ownedCwdLeaks,
        configuration.budgets.timeouts.gracefulStopMs,
      );
    } catch (cleanupError) {
      cleanupFailures.push(cleanupError);
    }
    let failureEscapedProcesses = [];
    try {
      failureEscapedProcesses = newHostProcesses(
        hostProcessBaseline,
        snapshotHostProcessInventory(),
      );
    } catch (inventoryError) {
      cleanupFailures.push(inventoryError);
      failureEscapedProcesses = [{}];
    }
    try {
      await writeEvidence({
        runRoot,
        relative: 'evidence/failure/foreign-host-process-drift.json',
        kind: 'hostProcessDiagnostic',
        value: {
          count: failureEscapedProcesses.length,
          entries: failureEscapedProcesses,
        },
        summary: 'unattributed host process drift is diagnostic and was not signaled',
      });
    } catch (diagnosticError) {
      cleanupFailures.push(diagnosticError);
    }
    let failureDockerResidue = {
      containers: 0,
      images: 0,
      networks: 0,
      mounts: 0,
    };
    if (runtime) {
      try {
        const terminalInventory = await runtime.resourceInventory();
        failureDockerResidue = ownedRuntimeResidue(terminalInventory, runtime);
      } catch (inventoryError) {
        cleanupFailures.push(inventoryError);
        failureDockerResidue = {
          containers: 1,
          images: 1,
          networks: 1,
          mounts: 1,
        };
      }
    }
    let failureFileResidue = 0;
    try {
      failureFileResidue = inventoryOwnedRunRoot(runRoot).unsafeEntries;
    } catch (inventoryError) {
      cleanupFailures.push(inventoryError);
      failureFileResidue = 1;
    }
    residue = {
      processes: failureActiveResidue.processes,
      listeners: failureActiveResidue.listeners,
      containers: failureDockerResidue.containers,
      images: failureDockerResidue.images,
      networks: failureDockerResidue.networks,
      files: failureFileResidue + failureDockerResidue.mounts,
    };
    let output;
    let outputKind = 'result';
    let cacheIdentity = null;
    let postCache = null;
    let protectedResealFailed = false;
    if (context.cache) {
      try {
        postCache = await verifyInputCacheSeal(context.cache);
        if (context.preCacheCompatibility) {
          const postCleanup = await attestCacheCompatibilityPhase({
            input,
            cacheAttestation: postCache,
            phase: 'postCleanup',
          });
          context.postCacheCompatibility = postCleanup;
          const envelope = createCacheCompatibilityEnvelope({
            preAdmission: context.preCacheCompatibility,
            postCleanup,
          });
          const descriptor = await writeEvidence({
            runRoot,
            relative: 'evidence/failure/cache-compatibility.json',
            kind: 'cacheCompatibilityPostCleanup',
            value: envelope,
            summary: 'failure run cache authorities re-sealed unchanged',
          });
          cacheIdentity = cacheCompatibilityResultIdentity({
            envelopePath: descriptor.path,
            evidenceSha256: descriptor.sha256,
            envelope,
          });
        }
      } catch (resealError) {
        protectedResealFailed = true;
        cleanupFailures.push(resealError);
      }
    }
    for (const [present, reseal] of [
      [context.artifacts, () => verifyArtifactSeals(context.artifacts)],
      [context.archive, () => verifyFullArchiveSeal(context.archive)],
      [context.provenance, () => verifyOfficialProvenanceSeal(context.provenance)],
      [
        context.materializedArchive,
        () => verifyMaterializedArchiveSeal(context.materializedArchive),
      ],
      [context.tools, () => verifyToolSeal(context.tools)],
    ]) {
      if (!present) continue;
      try {
        await reseal();
      } catch (resealError) {
        protectedResealFailed = true;
        cleanupFailures.push(resealError);
      }
    }
    let postSources = null;
    if (context.sources) {
      try {
        postSources = attestSourceIdentities(input);
      } catch (resealError) {
        protectedResealFailed = true;
        cleanupFailures.push(resealError);
      }
    }
    if (
      postCache &&
      context.postCacheCompatibility === undefined &&
      cacheIdentity !== null
    ) {
      try {
        context.postCacheCompatibility =
          await attestCacheCompatibilityPhase({
            input,
            cacheAttestation: postCache,
            phase: 'postCleanup',
          });
      } catch (resealError) {
        protectedResealFailed = true;
        cleanupFailures.push(resealError);
      }
    }
    if (
      !protectedResealFailed &&
      postCache &&
      postSources &&
      context.archive &&
      context.artifacts &&
      context.postCacheCompatibility &&
      context.provenance &&
      context.tools
    ) {
      try {
        inputAfter = protectedInputSeal({
          ...context,
          cache: postCache,
          cacheCompatibility: context.postCacheCompatibility,
          sources: postSources,
        });
        if (inputBefore !== ZERO_DIGEST && inputAfter !== inputBefore) {
          cleanupFailures.push(
            new AcceptanceOrchestrationError(
              'protected input aggregate changed on the failure path',
            ),
          );
        }
      } catch (resealError) {
        protectedResealFailed = true;
        cleanupFailures.push(resealError);
        inputAfter = ZERO_DIGEST;
      }
    }
    if (protectedResealFailed) inputAfter = ZERO_DIGEST;
    try {
      await writeEvidence({
        runRoot,
        relative: 'evidence/failure/cleanup-reseal.json',
        kind: 'failureCleanupReseal',
        value: {
          actionBoundaries: execution.boundaryRevocations,
          inputAfter,
          inputBefore,
          failures: cleanupFailures.map((entry) =>
            sanitizeSummary(
              entry instanceof Error ? entry.message : String(entry),
            ),
          ),
        },
        summary: 'failure cleanup and protected-input reseal outcomes recorded',
      });
    } catch (diagnosticError) {
      cleanupFailures.push(diagnosticError);
    }
    try {
      if (!measurements.has('suite.durationMs')) {
        recordSuiteMeasurement(
          measurements,
          Math.round(performance.now() - suiteStarted),
        );
      }
      output = await writeFailedCanonicalResult({
        cacheIdentity,
        configuration,
        context,
        execution,
        input,
        measurements: measurements.snapshot(),
        residue,
        runId,
        runRoot,
        inputBefore,
        inputAfter,
      });
    } catch (failureResultError) {
      cleanupFailures.push(failureResultError);
      outputKind = 'diagnostic';
    }
    if (!output) {
      output = await writeFailureDiagnostic({
        error,
        execution,
        runId,
        runRoot,
        cleanupFailures,
      });
    }
    await execution.terminal(1);
    process.stderr.write(
      `acceptance failed at ${execution.state.failedBy}; ${outputKind}: ${path.relative(
        REPOSITORY_ROOT,
        path.join(runRoot, output.path),
      )}\n`,
    );
    clearTimeout(suiteTimer);
    return 1;
  }
}
