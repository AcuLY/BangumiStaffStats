import { fork } from 'node:child_process';
import path from 'node:path';

import { validateResultEvidenceDescriptor } from './contracts.mjs';
import {
  createProcessClosureMonitor,
  startProcessClosureMonitor,
  stopProcessClosureMonitor,
  terminateOwnedProcesses,
} from './runner.mjs';

const PROTOCOL_VERSION = 1;
const MAX_WORKER_OUTPUT_BYTES = 1024 * 1024;

export class AcceptanceSupervisorError extends Error {
  constructor(message, code = 'SUPERVISOR_FAILURE') {
    super(message);
    this.code = code;
  }
}

function fail(message, code = 'SUPERVISOR_FAILURE') {
  throw new AcceptanceSupervisorError(message, code);
}

export function createOnceAsyncOperation(operation) {
  if (typeof operation !== 'function') {
    fail('exactly-once async operation is absent');
  }
  let result;
  return (...args) => {
    result ??= Promise.resolve().then(() => operation(...args));
    return result;
  };
}

export async function retrySupervisedFailureWrite({
  failureFacts,
  writeSupervisedFailure,
  writerError,
}) {
  if (
    !failureFacts?.cleanup ||
    typeof writeSupervisedFailure !== 'function'
  ) {
    fail('supervised failure retry facts are invalid');
  }
  const cleanup = Object.freeze({
    ...failureFacts.cleanup,
    cleanupFailures: Object.freeze([
      ...failureFacts.cleanup.cleanupFailures,
      writerError,
    ]),
  });
  return writeSupervisedFailure(
    Object.freeze({
      ...failureFacts,
      cleanup,
    }),
  );
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object`, 'SUPERVISOR_IPC_INVALID');
  }
  if (
    Object.keys(value).sort().join(',') !== [...keys].sort().join(',')
  ) {
    fail(`${label} fields are not closed`, 'SUPERVISOR_IPC_INVALID');
  }
  return value;
}

function appendBounded(state, chunk) {
  if (state.bytes >= MAX_WORKER_OUTPUT_BYTES) {
    state.truncated = true;
    return;
  }
  const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  const remaining = MAX_WORKER_OUTPUT_BYTES - state.bytes;
  const bounded =
    bytes.length <= remaining ? bytes : bytes.subarray(0, remaining);
  state.chunks.push(bounded);
  state.bytes += bounded.length;
  if (bounded.length !== bytes.length) state.truncated = true;
}

function validateCellRecord(value, declaration, label) {
  const cell = exactKeys(
    value,
    ['durationMs', 'evidence', 'failure', 'id', 'owner', 'status'],
    label,
  );
  if (cell.id !== declaration.id || cell.owner !== declaration.owner) {
    fail(`${label} differs from the closed matrix`, 'SUPERVISOR_IPC_INVALID');
  }
  if (!['pass', 'fail'].includes(cell.status)) {
    fail(`${label} status is invalid`, 'SUPERVISOR_IPC_INVALID');
  }
  if (
    !Number.isInteger(cell.durationMs) ||
    cell.durationMs < 0 ||
    cell.durationMs > declaration.timeoutMs
  ) {
    fail(`${label} duration exceeds its timeout`, 'SUPERVISOR_IPC_INVALID');
  }
  if (!Array.isArray(cell.evidence) || cell.evidence.length > 64) {
    fail(`${label} evidence is invalid`, 'SUPERVISOR_IPC_INVALID');
  }
  const kinds = new Set();
  for (const [index, descriptor] of cell.evidence.entries()) {
    try {
      validateResultEvidenceDescriptor(
        descriptor,
        `${label}.evidence[${index}]`,
      );
    } catch {
      fail(
        `${label}.evidence[${index}] is invalid`,
        'SUPERVISOR_IPC_INVALID',
      );
    }
    kinds.add(descriptor.kind);
  }
  if (
    cell.status === 'pass' &&
    declaration.evidence.some((kind) => !kinds.has(kind))
  ) {
    fail(`${label} omits required evidence`, 'SUPERVISOR_IPC_INVALID');
  }
  if (cell.status === 'pass') {
    if (cell.failure !== null) {
      fail(`${label} pass has a failure`, 'SUPERVISOR_IPC_INVALID');
    }
  } else {
    const failure = exactKeys(
      cell.failure,
      ['blockedBy', 'code', 'summary'],
      `${label}.failure`,
    );
    if (
      failure.blockedBy !== null ||
      typeof failure.code !== 'string' ||
      !/^[A-Z][A-Z0-9_]{2,63}$/u.test(failure.code) ||
      typeof failure.summary !== 'string' ||
      failure.summary.length > 512
    ) {
      fail(`${label} direct failure is invalid`, 'SUPERVISOR_IPC_INVALID');
    }
  }
  return structuredClone(cell);
}

function validateFailureEvidenceOutcome(value, acceptedCells) {
  const acceptedCellCount = acceptedCells.length;
  const expectedDescriptorCount = acceptedCells.reduce(
    (total, cell) => total + cell.evidence.length,
    0,
  );
  const outcome = exactKeys(
    value,
    [
      'earliestRejectedCell',
      'rejectedCellIndices',
      'rejectedDescriptorCount',
      'validatedDescriptorCount',
    ],
    'parent failure-evidence validation',
  );
  if (
    !Number.isInteger(outcome.rejectedDescriptorCount) ||
    outcome.rejectedDescriptorCount < 0 ||
    !Number.isInteger(outcome.validatedDescriptorCount) ||
    outcome.validatedDescriptorCount < 0 ||
    !Array.isArray(outcome.rejectedCellIndices) ||
    outcome.rejectedCellIndices.some(
      (index, position) =>
        !Number.isInteger(index) ||
        index < 0 ||
        index >= acceptedCellCount ||
        (position > 0 &&
          outcome.rejectedCellIndices[position - 1] >= index),
    ) ||
    outcome.earliestRejectedCell !==
      (outcome.rejectedCellIndices[0] ?? null) ||
    outcome.rejectedDescriptorCount <
      outcome.rejectedCellIndices.length ||
    outcome.validatedDescriptorCount +
      outcome.rejectedDescriptorCount !==
      expectedDescriptorCount ||
    (outcome.rejectedDescriptorCount === 0) !==
      (outcome.rejectedCellIndices.length === 0)
  ) {
    fail(
      'parent failure-evidence validation result is invalid',
      'SUPERVISOR_EVIDENCE_INVALID',
    );
  }
  return outcome;
}

function replaceAcknowledgedCellWithEvidenceFailure(
  acceptedCells,
  failedIndex,
) {
  const cells = structuredClone(acceptedCells);
  cells[failedIndex] = {
    ...cells[failedIndex],
    status: 'fail',
    failure: {
      blockedBy: null,
      code: 'SUPERVISOR_EVIDENCE_INVALID',
      summary: 'parent rejected untrusted worker evidence',
    },
  };
  return cells;
}

export function supervisedFailureCells({
  matrix,
  acceptedCells,
  code,
  summary,
  durationMs,
}) {
  const acceptedFailure = acceptedCells.findIndex(
    (cell) => cell.status === 'fail',
  );
  const failedIndex =
    acceptedFailure >= 0
      ? acceptedFailure
      : Math.min(acceptedCells.length, matrix.cells.length - 1);
  return Object.freeze(
    matrix.cells.map((declaration, index) => {
      if (index < failedIndex) {
        const accepted = acceptedCells[index];
        if (!accepted || accepted.status !== 'pass') {
          fail('supervisor accepted-cell prefix is incomplete');
        }
        return structuredClone(accepted);
      }
      if (index === failedIndex) {
        if (acceptedFailure >= 0) {
          return structuredClone(acceptedCells[index]);
        }
        return {
          id: declaration.id,
          owner: declaration.owner,
          status: 'fail',
          durationMs: Math.min(
            Math.max(0, Math.round(durationMs)),
            declaration.timeoutMs,
          ),
          evidence: [],
          failure: {
            code,
            summary,
            blockedBy: null,
          },
        };
      }
      return {
        id: declaration.id,
        owner: declaration.owner,
        status: 'blocked',
        durationMs: 0,
        evidence: [],
        failure: {
          code: 'BLOCKED_BY_FAILURE',
          summary: `blocked by ${matrix.cells[failedIndex].id}`,
          blockedBy: matrix.cells[failedIndex].id,
        },
      };
    }),
  );
}

function sendIpc(target, message) {
  return new Promise((resolve, reject) => {
    if (!target.connected || typeof target.send !== 'function') {
      reject(new AcceptanceSupervisorError('supervisor IPC is closed'));
      return;
    }
    target.send(message, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

export function createWorkerCheckpointWriter({
  runId,
  matrixVersion,
  acknowledgementTimeoutMs = 5_000,
}) {
  if (typeof process.send !== 'function') {
    fail('supervised worker has no parent IPC channel');
  }
  let sequence = 0;
  return async (payload) => {
    const currentSequence = sequence;
    sequence += 1;
    const message = {
      ...payload,
      matrixVersion,
      protocolVersion: PROTOCOL_VERSION,
      runId,
      sequence: currentSequence,
    };
    await sendIpc(process, message);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        process.removeListener('message', onMessage);
        reject(
          new AcceptanceSupervisorError(
            'parent omitted the checkpoint acknowledgement',
            'SUPERVISOR_ACK_TIMEOUT',
          ),
        );
      }, acknowledgementTimeoutMs);
      const onMessage = (candidate) => {
        try {
          exactKeys(
            candidate,
            [
              'matrixVersion',
              'protocolVersion',
              'runId',
              'sequence',
              'type',
            ],
            'supervisor acknowledgement',
          );
          if (
            candidate.type !== 'ack' ||
            candidate.protocolVersion !== PROTOCOL_VERSION ||
            candidate.runId !== runId ||
            candidate.matrixVersion !== matrixVersion ||
            candidate.sequence !== currentSequence
          ) {
            fail(
              'supervisor acknowledgement identity is invalid',
              'SUPERVISOR_ACK_INVALID',
            );
          }
          clearTimeout(timer);
          process.removeListener('message', onMessage);
          resolve();
        } catch (error) {
          clearTimeout(timer);
          process.removeListener('message', onMessage);
          reject(error);
        }
      };
      process.on('message', onMessage);
    });
  };
}

function workerEnvironment(runRoot) {
  return Object.freeze({
    BGMSS_ACCEPTANCE_SUPERVISED_WORKER: '1',
    CI: '1',
    HOME: path.join(runRoot, 'home'),
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    NO_COLOR: '1',
    PATH: '/usr/bin:/bin',
    TMPDIR: path.join(runRoot, 'tmp'),
  });
}

function signalWorkerGroup(child, signal) {
  if (!child.pid || child.exitCode !== null) return;
  try {
    if (process.platform === 'win32') child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
  }
}

function waitForChildClose(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const onClose = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      child.removeListener('close', onClose);
      resolve(false);
    }, timeoutMs);
    child.once('close', onClose);
  });
}

async function stopProcessLedger(closureMonitor, workerPid) {
  const ledger = await stopProcessClosureMonitor(closureMonitor);
  if (!ledger.some((entry) => entry.pid === workerPid)) {
    fail(
      'process-closure monitor omitted the supervised worker identity',
      'SUPERVISOR_PROCESS_LEDGER',
    );
  }
  const descendants = ledger.filter((entry) => entry.pid !== workerPid);
  return Object.freeze({
    descendants: Object.freeze(descendants),
    observed: Object.freeze(ledger),
  });
}

async function closeProcessLedger(
  closureMonitor,
  gracefulStopMs,
  workerPid,
) {
  const ledger = await stopProcessLedger(closureMonitor, workerPid);
  const terminated = await terminateOwnedProcesses(
    ledger.descendants,
    gracefulStopMs,
  );
  return Object.freeze({
    observed: ledger.observed,
    terminated: Object.freeze(terminated),
  });
}

async function terminateWorkerClosure({
  child,
  closureMonitor,
  gracefulStopMs,
}) {
  const cleanupFailures = [];
  try {
    signalWorkerGroup(child, 'SIGTERM');
  } catch (error) {
    cleanupFailures.push(error);
  }
  let ledger = { observed: [], descendants: [] };
  try {
    ledger = await stopProcessLedger(closureMonitor, child.pid);
  } catch (error) {
    cleanupFailures.push(error);
  }
  const descendantCleanup = terminateOwnedProcesses(
    ledger.descendants,
    gracefulStopMs,
  ).catch((error) => {
    cleanupFailures.push(error);
    return [];
  });
  if (!(await waitForChildClose(child, gracefulStopMs))) {
    try {
      signalWorkerGroup(child, 'SIGKILL');
    } catch (error) {
      cleanupFailures.push(error);
    }
    if (
      !(await waitForChildClose(
        child,
        Math.max(250, Math.min(2_000, gracefulStopMs)),
      ))
    ) {
      cleanupFailures.push(
        new AcceptanceSupervisorError(
          'supervised worker survived forced cleanup',
          'SUPERVISOR_WORKER_SURVIVED',
        ),
      );
    }
  }
  const terminated = await descendantCleanup;
  return Object.freeze({
    cleanupFailures: Object.freeze(cleanupFailures),
    observedProcessCount: ledger.observed.length,
    terminatedDescendantCount: terminated.length,
  });
}

function acknowledgedMessage(child, message) {
  return sendIpc(child, {
    matrixVersion: message.matrixVersion,
    protocolVersion: PROTOCOL_VERSION,
    runId: message.runId,
    sequence: message.sequence,
    type: 'ack',
  });
}

export async function superviseAcceptanceWorker({
  cleanupExternalOwnership,
  configuration,
  inputBeforeDigest,
  inputDocumentDigest,
  inputPath,
  nodeExecutable = process.execPath,
  runId,
  runRoot,
  startClosureMonitor = startProcessClosureMonitor,
  suiteStartedAt = performance.now(),
  validateWorkerFailureEvidence,
  validateWorkerResult,
  validateExternalOwnershipRelease,
  workerModule,
  writeSupervisedFailure,
}) {
  if (process.platform === 'win32') {
    fail('formal acceptance supervisor is not implemented on Windows');
  }
  if (typeof writeSupervisedFailure !== 'function') {
    fail('supervisor failure writer is absent');
  }
  if (!/^sha256:[0-9a-f]{64}$/u.test(inputBeforeDigest)) {
    fail('supervisor input-before digest is invalid');
  }
  if (!/^sha256:[0-9a-f]{64}$/u.test(inputDocumentDigest)) {
    fail('supervisor input-document digest is invalid');
  }
  if (
    !path.isAbsolute(inputPath) ||
    !path.isAbsolute(runRoot) ||
    inputPath !== path.join(runRoot, 'supervised-input.json')
  ) {
    fail('supervisor input-copy path is invalid');
  }
  const matrix = configuration.matrix;
  const gracefulStopMs = configuration.budgets.timeouts.gracefulStopMs;
  const suiteTimeoutMs = configuration.budgets.timeouts.suiteMs;
  if (
    typeof suiteStartedAt !== 'number' ||
    !Number.isFinite(suiteStartedAt) ||
    suiteStartedAt > performance.now()
  ) {
    fail('supervisor suite start is invalid');
  }
  let suiteRemainingMs = Math.max(
    0,
    suiteTimeoutMs - (performance.now() - suiteStartedAt),
  );
  if (suiteRemainingMs === 0) {
    fail(
      'acceptance suite expired before worker startup',
      'SUPERVISOR_SUITE_TIMEOUT',
    );
  }
  const terminalExitTimeoutMs = Math.min(
    5_000,
    gracefulStopMs + 250,
  );
  const terminalStabilityMs = Math.min(
    250,
    Math.max(50, gracefulStopMs),
  );
  const closureMonitor = await createProcessClosureMonitor();
  suiteRemainingMs = Math.max(
    0,
    suiteTimeoutMs - (performance.now() - suiteStartedAt),
  );
  if (suiteRemainingMs === 0) {
    await stopProcessClosureMonitor(closureMonitor);
    fail(
      'acceptance suite expired during process-monitor startup',
      'SUPERVISOR_SUITE_TIMEOUT',
    );
  }
  let child;
  try {
    child = fork(
      workerModule,
      [
        '__supervised-worker',
        inputPath,
        runRoot,
        inputBeforeDigest,
        inputDocumentDigest,
      ],
      {
        cwd: path.dirname(workerModule),
        detached: true,
        env: workerEnvironment(runRoot),
        execPath: nodeExecutable,
        serialization: 'json',
        silent: true,
      },
    );
  } catch (error) {
    await stopProcessClosureMonitor(closureMonitor);
    throw new AcceptanceSupervisorError(
      `supervised worker could not start: ${error.message}`,
      'SUPERVISOR_WORKER_START',
    );
  }
  const stdout = { bytes: 0, chunks: [], truncated: false };
  const stderr = { bytes: 0, chunks: [], truncated: false };
  child.stdout.on('data', (chunk) => appendBounded(stdout, chunk));
  child.stderr.on('data', (chunk) => appendBounded(stderr, chunk));

  const acceptedCells = [];
  let expectedSequence = 0;
  let expectedIndex = 0;
  let terminal = null;
  let ipcClosed = false;
  let cellStartedAt = performance.now();
  let settled = false;
  let cellTimer;
  let suiteTimer;
  let messageQueue = Promise.resolve();
  let resolveDecision;
  const decision = new Promise((resolve) => {
    resolveDecision = resolve;
  });

  const settle = (value) => {
    if (settled) return;
    settled = true;
    clearTimeout(cellTimer);
    clearTimeout(suiteTimer);
    resolveDecision(value);
  };
  const abort = (error) =>
    settle({
      kind: 'abnormal',
      reason:
        error instanceof AcceptanceSupervisorError
          ? error
          : new AcceptanceSupervisorError(String(error)),
    });
  const armDeadline = (timeoutMs, code, summary) => {
    clearTimeout(cellTimer);
    cellStartedAt = performance.now();
    cellTimer = setTimeout(
      () => abort(new AcceptanceSupervisorError(summary, code)),
      timeoutMs,
    );
  };
  armDeadline(
    Math.min(matrix.cells[0].timeoutMs, terminalExitTimeoutMs),
    'SUPERVISOR_STARTUP_TIMEOUT',
    'supervised worker omitted its startup checkpoint',
  );
  suiteTimer = setTimeout(
    () =>
      abort(
        new AcceptanceSupervisorError(
          `acceptance suite exceeded its parent-supervised ${suiteTimeoutMs} ms timeout`,
          'SUPERVISOR_SUITE_TIMEOUT',
        ),
      ),
    suiteRemainingMs,
  );
  const closureMonitorStarted = Promise.resolve().then(() =>
    startClosureMonitor(closureMonitor, child.pid),
  );
  void closureMonitorStarted.catch((error) => {
    abort(
      new AcceptanceSupervisorError(
        `process-closure monitor failed to start: ${
          error instanceof Error ? error.message : String(error)
        }`,
        'SUPERVISOR_PROCESS_LEDGER',
      ),
    );
  });

  child.on('message', async (raw) => {
    const predecessor = messageQueue;
    let releaseMessage;
    messageQueue = new Promise((resolve) => {
      releaseMessage = resolve;
    });
    await predecessor;
    if (settled) {
      releaseMessage();
      return;
    }
    try {
      await closureMonitorStarted;
      if (settled) return;
      const keys =
        raw?.type === 'checkpoint'
          ? [
              'cellId',
              'index',
              'matrixVersion',
              'phase',
              'previous',
              'protocolVersion',
              'runId',
              'sequence',
              'timeoutMs',
              'type',
            ]
          : raw?.type === 'terminal'
            ? [
                'code',
                'matrixVersion',
                'previous',
                'protocolVersion',
                'runId',
                'sequence',
                'type',
              ]
            : [];
      const message = exactKeys(raw, keys, 'supervisor checkpoint');
      if (
        message.protocolVersion !== PROTOCOL_VERSION ||
        message.runId !== runId ||
        message.matrixVersion !== matrix.matrixVersion ||
        message.sequence !== expectedSequence
      ) {
        fail(
          'supervisor checkpoint identity or sequence is invalid',
          'SUPERVISOR_IPC_INVALID',
        );
      }
      expectedSequence += 1;
      if (message.type === 'checkpoint') {
        if (terminal || message.index !== expectedIndex) {
          fail('matrix checkpoint is out of order', 'SUPERVISOR_IPC_INVALID');
        }
        const declaration = matrix.cells[expectedIndex];
        if (
          !declaration ||
          message.cellId !== declaration.id ||
          message.phase !== declaration.phase ||
          message.timeoutMs !== declaration.timeoutMs
        ) {
          fail(
            'matrix checkpoint differs from the closed declaration',
            'SUPERVISOR_IPC_INVALID',
          );
        }
        if (expectedIndex === 0) {
          if (message.previous !== null) {
            fail(
              'first matrix checkpoint has a previous record',
              'SUPERVISOR_IPC_INVALID',
            );
          }
        } else {
          const previous = validateCellRecord(
            message.previous,
            matrix.cells[expectedIndex - 1],
            `supervisor previous cell ${expectedIndex - 1}`,
          );
          if (previous.status !== 'pass') {
            fail(
              'a failed cell attempted to start a later cell',
              'SUPERVISOR_IPC_INVALID',
            );
          }
          acceptedCells.push(previous);
        }
        armDeadline(
          declaration.timeoutMs,
          'SUPERVISOR_CELL_TIMEOUT',
          `${declaration.id} exceeded its parent-supervised ${declaration.timeoutMs} ms timeout`,
        );
        await acknowledgedMessage(child, message);
        if (settled) return;
        expectedIndex += 1;
        return;
      }
      if (message.type === 'terminal') {
        if (terminal || expectedIndex === 0) {
          fail('terminal checkpoint is out of order', 'SUPERVISOR_IPC_INVALID');
        }
        const previousIndex = expectedIndex - 1;
        const previous = validateCellRecord(
          message.previous,
          matrix.cells[previousIndex],
          `supervisor terminal cell ${previousIndex}`,
        );
        acceptedCells.push(previous);
        if (
          ![0, 1].includes(message.code) ||
          (message.code === 0 &&
            (expectedIndex !== matrix.cells.length ||
              previous.status !== 'pass')) ||
          (message.code === 1 && previous.status !== 'fail')
        ) {
          fail(
            'terminal checkpoint status is invalid',
            'SUPERVISOR_IPC_INVALID',
          );
        }
        terminal = message;
        armDeadline(
          terminalExitTimeoutMs,
          'SUPERVISOR_TERMINAL_TIMEOUT',
          'supervised worker acknowledged terminal state but did not exit',
        );
        await acknowledgedMessage(child, message);
        if (settled) return;
      }
    } catch (error) {
      abort(error);
    } finally {
      releaseMessage();
    }
  });
  child.once('error', (error) =>
    abort(
      new AcceptanceSupervisorError(
        `supervised worker failed: ${error.message}`,
        'SUPERVISOR_WORKER_ERROR',
      ),
    ),
  );
  child.once('disconnect', () => {
    ipcClosed = true;
  });
  child.once('close', (status, signal) => {
    if (
      terminal &&
      status === terminal.code &&
      signal === null &&
      ipcClosed &&
      child.connected === false
    ) {
      clearTimeout(cellTimer);
      cellTimer = setTimeout(
        () => settle({ code: terminal.code, kind: 'terminal' }),
        terminalStabilityMs,
      );
      return;
    }
    abort(
      new AcceptanceSupervisorError(
        `supervised worker exited unexpectedly: ${status ?? signal}`,
        'SUPERVISOR_WORKER_EXIT',
      ),
    );
  });

  const outcome = await decision;
  let abnormal = outcome.kind === 'abnormal' ? outcome.reason : null;
  let closureClosed = false;
  let completedCleanup = null;
  let acceptedFailureCells = acceptedCells;
  if (!abnormal && outcome.code === 1) {
    const directFailure = acceptedCells.at(-1);
    abnormal =
      directFailure?.status === 'fail'
        ? new AcceptanceSupervisorError(
            directFailure.failure.summary,
            directFailure.failure.code,
          )
        : new AcceptanceSupervisorError(
            'terminal failure omitted its acknowledged direct-failure cell',
            'SUPERVISOR_IPC_INVALID',
          );
    completedCleanup = await terminateWorkerClosure({
      child,
      closureMonitor,
      gracefulStopMs,
    });
    closureClosed = true;
    let evidenceValidation;
    let evidenceValidationFault = false;
    try {
      if (typeof validateWorkerFailureEvidence !== 'function') {
        throw new AcceptanceSupervisorError(
          'parent failure-evidence validator is absent',
          'SUPERVISOR_EVIDENCE_INVALID',
        );
      }
      evidenceValidation = await validateWorkerFailureEvidence({
        acceptedCells: Object.freeze(structuredClone(acceptedCells)),
        code: outcome.code,
        runId,
        runRoot,
      });
      evidenceValidation = validateFailureEvidenceOutcome(
        evidenceValidation,
        acceptedCells,
      );
    } catch {
      evidenceValidationFault = true;
    }
    const directFailureIndex = acceptedCells.length - 1;
    if (
      evidenceValidationFault ||
      (evidenceValidation.earliestRejectedCell !== null &&
        evidenceValidation.earliestRejectedCell < directFailureIndex)
    ) {
      const failedIndex = evidenceValidationFault
        ? directFailureIndex
        : evidenceValidation.earliestRejectedCell;
      acceptedFailureCells =
        replaceAcknowledgedCellWithEvidenceFailure(
          acceptedCells,
          failedIndex,
        );
      abnormal = new AcceptanceSupervisorError(
        'parent rejected untrusted worker evidence',
        'SUPERVISOR_EVIDENCE_INVALID',
      );
    }
  }
  if (!abnormal) {
    try {
      closureClosed = true;
      const ledger = await closeProcessLedger(
        closureMonitor,
        gracefulStopMs,
        child.pid,
      );
      completedCleanup = Object.freeze({
        cleanupFailures: Object.freeze([]),
        observedProcessCount: ledger.observed.length,
        terminatedDescendantCount: ledger.terminated.length,
      });
      if (ledger.terminated.length > 0) {
        fail(
          'worker terminal state left an owned descendant alive',
          'SUPERVISOR_PROCESS_RESIDUE',
        );
      }
      if (typeof validateExternalOwnershipRelease === 'function') {
        await validateExternalOwnershipRelease();
      }
      if (typeof validateWorkerResult === 'function') {
        await validateWorkerResult({
          acceptedCells: Object.freeze(structuredClone(acceptedCells)),
          code: outcome.code,
          runId,
          runRoot,
        });
      }
    } catch (error) {
      abnormal =
        error instanceof AcceptanceSupervisorError
          ? error
          : new AcceptanceSupervisorError(
              `worker result validation failed: ${error.message}`,
              'SUPERVISOR_RESULT_INVALID',
            );
    }
    if (!abnormal) {
      process.stdout.write(Buffer.concat(stdout.chunks));
      process.stderr.write(Buffer.concat(stderr.chunks));
      return outcome.code;
    }
  }

  const workerCleanup =
    closureClosed
      ? completedCleanup ??
        Object.freeze({
          cleanupFailures: Object.freeze([]),
          observedProcessCount: 0,
          terminatedDescendantCount: 0,
        })
      : await terminateWorkerClosure({
          child,
          closureMonitor,
          gracefulStopMs,
        });
  let externalCleanup = null;
  const externalCleanupFailures = [];
  if (typeof cleanupExternalOwnership === 'function') {
    try {
      externalCleanup = await cleanupExternalOwnership();
      for (const message of externalCleanup?.failures ?? []) {
        externalCleanupFailures.push(
          new AcceptanceSupervisorError(
            String(message),
            'SUPERVISOR_EXTERNAL_CLEANUP',
          ),
        );
      }
    } catch (error) {
      externalCleanupFailures.push(error);
    }
  }
  const cleanup = Object.freeze({
    cleanupFailures: Object.freeze([
      ...workerCleanup.cleanupFailures,
      ...externalCleanupFailures,
    ]),
    external: externalCleanup,
    observedProcessCount: workerCleanup.observedProcessCount,
    terminatedDescendantCount: workerCleanup.terminatedDescendantCount,
  });
  const cells = supervisedFailureCells({
    matrix,
    acceptedCells: acceptedFailureCells,
    code: abnormal.code,
    summary: abnormal.message,
    durationMs: performance.now() - cellStartedAt,
  });
  await writeSupervisedFailure({
    acceptedCells: Object.freeze(
      structuredClone(acceptedFailureCells),
    ),
    cells,
    cleanup,
    reason: abnormal,
    runId,
    runRoot,
    workerOutput: Object.freeze({
      stderrBytes: stderr.bytes,
      stderrTruncated: stderr.truncated,
      stdoutBytes: stdout.bytes,
      stdoutTruncated: stdout.truncated,
    }),
  });
  return 1;
}
