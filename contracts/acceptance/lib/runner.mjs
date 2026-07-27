import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';

import { registerOwnedChildProcess } from './action-boundary.mjs';
import {
  currentAbortSignal,
  runWithAbortSignal,
  throwIfAborted,
} from './abort-context.mjs';
import { MAX_CAPTURE_BYTES } from './constants.mjs';
import { canonicalJsonDigest } from './canonical-json.mjs';
import { resolveRunRelative } from './paths.mjs';
import { sha256File } from './seal.mjs';

const FORBIDDEN_ENV = new Set([
  'BASH_ENV',
  'ENV',
  'NODE_OPTIONS',
  'NODE_PATH',
  'PYTHONHOME',
  'PYTHONINSPECT',
  'PYTHONPATH',
  'PYTHONSTARTUP',
  'RUBYOPT',
  'PERL5OPT',
]);

// Process inventory is a safety boundary, not a scheduler-performance gate.
// Keep it bounded while allowing heavily loaded validation hosts to respond.
const PROCESS_INVENTORY_TIMEOUT_MS = 30_000;

export class CommandError extends Error {
  constructor(message, result) {
    super(message);
    this.result = result;
  }
}

function fail(message) {
  throw new CommandError(message);
}

export function runWithCommandAbortSignal(signal, action) {
  return runWithAbortSignal(signal, action);
}

export function throwIfCommandAborted() {
  throwIfAborted();
}

export function snapshotHostProcessInventory() {
  if (process.platform === 'win32') {
    fail('host process inventory is not implemented on Windows');
  }
  const result = spawnSync(
    '/bin/ps',
    ['-axo', 'pid=,ppid=,pgid=,uid=,lstart=,comm='],
    {
      encoding: 'utf8',
      env: {
        LANG: 'C',
        LC_ALL: 'C',
        PATH: '/usr/bin:/bin',
      },
      maxBuffer: 16 * 1024 * 1024,
      timeout: PROCESS_INVENTORY_TIMEOUT_MS,
    },
  );
  if (result.error || result.status !== 0) {
    fail(`host process inventory failed: ${result.error?.message ?? result.status}`);
  }
  const entries = result.stdout
    .split(/\r?\n/u)
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const fields = line.trim().split(/\s+/u);
      if (fields.length < 10) {
        fail(`host process inventory emitted an invalid row: ${line}`);
      }
      return {
        pid: Number(fields[0]),
        parentPid: Number(fields[1]),
        processGroupId: Number(fields[2]),
        userId: Number(fields[3]),
        startToken: fields.slice(4, 9).join(' '),
        command: fields.slice(9).join(' '),
      };
    })
    .filter((entry) => path.basename(entry.command) !== 'ps')
    .sort((left, right) => left.pid - right.pid);
  return Object.freeze({
    entries: Object.freeze(entries.map((entry) => Object.freeze(entry))),
    digest: canonicalJsonDigest(entries),
  });
}

export function newHostProcesses(before, after) {
  if (!Array.isArray(before?.entries) || !Array.isArray(after?.entries)) {
    fail('host process inventory entries are absent');
  }
  const existing = new Set(
    before.entries.map(
      (entry) =>
        `${entry.pid}\0${entry.userId}\0${entry.startToken}\0${entry.command}`,
    ),
  );
  return Object.freeze(
    after.entries.filter(
      (entry) =>
        !existing.has(
          `${entry.pid}\0${entry.userId}\0${entry.startToken}\0${entry.command}`,
        ),
    ),
  );
}

export function snapshotOwnedCwdProcesses(runRoot) {
  if (process.platform === 'win32') {
    fail('owned cwd process inventory is not implemented on Windows');
  }
  const canonicalRoot = fs.realpathSync.native(runRoot);
  const result = spawnSync(
    '/usr/sbin/lsof',
    ['-a', '-d', 'cwd', '-Fpn'],
    {
      encoding: 'utf8',
      env: {
        LANG: 'C',
        LC_ALL: 'C',
        PATH: '/usr/bin:/bin:/usr/sbin',
      },
      maxBuffer: 16 * 1024 * 1024,
      timeout: PROCESS_INVENTORY_TIMEOUT_MS,
    },
  );
  if (result.error || result.status !== 0) {
    fail(`owned cwd process inventory failed: ${result.error?.message ?? result.status}`);
  }
  const entries = [];
  const processTable = new Map(
    snapshotHostProcessInventory().entries.map((entry) => [entry.pid, entry]),
  );
  let pid = null;
  for (const line of result.stdout.split(/\r?\n/u)) {
    if (line.startsWith('p')) {
      pid = Number(line.slice(1));
      continue;
    }
    if (!line.startsWith('n') || !Number.isSafeInteger(pid) || pid <= 0) continue;
    const cwd = line.slice(1);
    if (
      pid !== process.pid &&
      (cwd === canonicalRoot || cwd.startsWith(`${canonicalRoot}${path.sep}`))
    ) {
      const identity = processTable.get(pid);
      if (identity) entries.push(Object.freeze({ ...identity, cwd }));
    }
  }
  entries.sort((left, right) => left.pid - right.pid);
  return Object.freeze(entries);
}

export function newOwnedCwdProcesses(before, after) {
  if (!Array.isArray(before) || !Array.isArray(after)) {
    fail('owned cwd process inventories must be arrays');
  }
  const existing = new Set(before.map((entry) => `${entry.pid}\0${entry.cwd}`));
  return Object.freeze(
    after.filter((entry) => !existing.has(`${entry.pid}\0${entry.cwd}`)),
  );
}

function assertString(value, label, max = 4096) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > max ||
    value.includes('\0')
  ) {
    fail(`${label} must be bounded text without NUL`);
  }
  return value;
}

export function sanitizedEnvironment({
  runRoot,
  pathEntries,
  extra = {},
}) {
  const entries = [...pathEntries].map((entry, index) =>
    assertString(entry, `PATH entry ${index}`),
  );
  const environment = {
    CI: '1',
    HOME: path.join(runRoot, 'home'),
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    NO_COLOR: '1',
    PATH: entries.join(path.delimiter),
    TMPDIR: path.join(runRoot, 'tmp'),
  };
  for (const [name, value] of Object.entries(extra)) {
    if (
      !/^[A-Z][A-Z0-9_]{0,63}$/u.test(name) ||
      FORBIDDEN_ENV.has(name) ||
      name.startsWith('GIT_')
    ) {
      fail(`environment name is forbidden: ${name}`);
    }
    environment[name] = assertString(String(value), `environment ${name}`, 8192);
  }
  return Object.freeze(environment);
}

function appendBounded(state, chunk) {
  if (state.bytes >= state.limit) {
    state.truncated = true;
    return;
  }
  const remaining = state.limit - state.bytes;
  const bounded = chunk.length <= remaining ? chunk : chunk.subarray(0, remaining);
  state.chunks.push(bounded);
  state.bytes += bounded.length;
  if (bounded.length !== chunk.length) state.truncated = true;
}

function signalProcessGroup(child, processGroupId, signal) {
  try {
    if (process.platform === 'win32') {
      if (child.exitCode === null) child.kill(signal);
    } else {
      process.kill(-processGroupId, signal);
    }
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
  }
}

function processGroupExists(processGroupId) {
  if (process.platform === 'win32') return false;
  try {
    process.kill(-processGroupId, 0);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    if (error?.code === 'EPERM') return true;
    throw error;
  }
}

async function waitForProcessGroupExit(processGroupId, timeoutMs) {
  const started = performance.now();
  while (processGroupExists(processGroupId)) {
    if (performance.now() - started >= timeoutMs) return false;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return true;
}

async function terminateProcessGroup(
  child,
  processGroupId,
  gracefulStopMs,
) {
  if (process.platform === 'win32') {
    signalProcessGroup(child, processGroupId, 'SIGKILL');
    return;
  }
  signalProcessGroup(child, processGroupId, 'SIGTERM');
  if (await waitForProcessGroupExit(processGroupId, gracefulStopMs)) return;
  signalProcessGroup(child, processGroupId, 'SIGKILL');
  if (
    !(await waitForProcessGroupExit(
      processGroupId,
      Math.max(250, Math.min(2_000, gracefulStopMs)),
    ))
  ) {
    fail(`process group ${processGroupId} survived forced cleanup`);
  }
}

function sameProcessIdentity(left, right) {
  return (
    left?.pid === right?.pid &&
    left?.userId === right?.userId &&
    left?.startToken === right?.startToken &&
    left?.command === right?.command
  );
}

function sameStableProcess(left, right) {
  return (
    left?.pid === right?.pid &&
    left?.userId === right?.userId &&
    left?.startToken === right?.startToken
  );
}

function discoverProcessClosure(ledger, processGroupId) {
  const inventory = snapshotHostProcessInventory();
  const byPid = new Map(inventory.entries.map((entry) => [entry.pid, entry]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const entry of inventory.entries) {
      const known = ledger.get(entry.pid);
      if (known) {
        if (sameStableProcess(known, entry)) ledger.set(entry.pid, entry);
        continue;
      }
      if (entry.pid === process.pid) continue;
      const parent = ledger.get(entry.parentPid);
      const currentParent = byPid.get(entry.parentPid);
      if (
        entry.processGroupId === processGroupId ||
        (parent && sameProcessIdentity(parent, currentParent))
      ) {
        ledger.set(entry.pid, entry);
        changed = true;
      }
    }
  }
  return inventory;
}

export async function createProcessClosureMonitor() {
  const worker = new Worker(
    new URL('./process-closure-worker.mjs', import.meta.url),
    { type: 'module' },
  );
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('process closure worker startup timed out')),
      5_000,
    );
    worker.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    worker.once('message', (message) => {
      clearTimeout(timer);
      if (message?.type === 'ready') resolve();
      else reject(new Error('process closure worker did not become ready'));
    });
  }).catch(async (error) => {
    await worker.terminate();
    throw error;
  });
  return worker;
}

export async function stopProcessClosureMonitor(worker) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('process closure worker stop timed out')),
      5_000,
    );
    const onMessage = (message) => {
      if (message?.type === 'stopped') {
        clearTimeout(timer);
        resolve(message.entries);
      } else if (message?.type === 'failure') {
        clearTimeout(timer);
        reject(new Error(message.message));
      }
    };
    worker.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    worker.on('message', onMessage);
    worker.postMessage({ type: 'stop' });
  }).finally(async () => {
    await worker.terminate();
  });
}

function signalOwnedProcesses(processes, signal) {
  for (const process_ of processes) {
    try {
      process.kill(process_.pid, signal);
    } catch (error) {
      if (error?.code !== 'ESRCH') throw error;
    }
  }
}

export async function terminateOwnedProcesses(processes, gracefulStopMs) {
  if (!Array.isArray(processes)) fail('owned process cleanup requires an array');
  const matching = () => {
    const byPid = new Map(
      snapshotHostProcessInventory().entries.map((entry) => [entry.pid, entry]),
    );
    const exact = [];
    const mismatched = [];
    for (const entry of processes) {
      const current = byPid.get(entry.pid);
      if (!current) continue;
      if (sameProcessIdentity(entry, current)) exact.push(entry);
      else mismatched.push(Object.freeze({ expected: entry, current }));
    }
    return { exact, mismatched };
  };
  let state = matching();
  if (state.mismatched.length > 0) {
    fail('owned process PID identity changed before cleanup');
  }
  const initial = state.exact;
  if (initial.length === 0) return Object.freeze([]);
  signalOwnedProcesses(initial, 'SIGTERM');
  const started = performance.now();
  let remaining = initial;
  while (performance.now() - started < gracefulStopMs) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    state = matching();
    if (state.mismatched.length > 0) {
      fail('owned process PID identity changed during graceful cleanup');
    }
    remaining = state.exact;
    if (remaining.length === 0) return Object.freeze(initial);
  }
  signalOwnedProcesses(remaining, 'SIGKILL');
  const forcedStarted = performance.now();
  while (performance.now() - forcedStarted < Math.max(250, gracefulStopMs)) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    state = matching();
    if (state.mismatched.length > 0) {
      fail('owned process PID identity changed during forced cleanup');
    }
    remaining = state.exact;
    if (remaining.length === 0) return Object.freeze(initial);
  }
  fail('run-owned cwd processes survived forced cleanup');
}

export async function runCommand({
  id,
  executable,
  args,
  cwd,
  environment,
  timeoutMs,
  gracefulStopMs,
  runRoot,
  maxOutputBytes = MAX_CAPTURE_BYTES,
  expectStatus = 0,
  signal,
}) {
  assertString(id, 'command ID', 128);
  assertString(executable, 'command executable');
  if (!path.isAbsolute(executable)) fail('command executable must be absolute');
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string' || arg.includes('\0'))) {
    fail('command arguments must be a closed string array');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 7_200_000) {
    fail('command timeout is invalid');
  }
  if (
    !Number.isInteger(gracefulStopMs) ||
    gracefulStopMs < 50 ||
    gracefulStopMs > 30_000
  ) {
    fail('graceful stop timeout is invalid');
  }
  const logBase = `evidence/commands/${id.replaceAll(':', '-')}`;
  const stdoutPath = resolveRunRelative(runRoot, `${logBase}.stdout`);
  const stderrPath = resolveRunRelative(runRoot, `${logBase}.stderr`);
  fs.mkdirSync(path.dirname(stdoutPath), { recursive: true, mode: 0o700 });
  const stdoutState = { chunks: [], bytes: 0, limit: maxOutputBytes, truncated: false };
  const stderrState = { chunks: [], bytes: 0, limit: maxOutputBytes, truncated: false };
  const started = performance.now();
  let timedOut = false;
  let aborted = false;
  const effectiveSignal = signal ?? currentAbortSignal();
  if (effectiveSignal !== undefined && !(effectiveSignal instanceof AbortSignal)) {
    fail(`command ${id} received an invalid abort signal`);
  }
  if (effectiveSignal?.aborted) {
    throw new CommandError(`command ${id} was aborted before start`);
  }
  const ownedCwdBefore = snapshotOwnedCwdProcesses(runRoot);
  const processMonitor = await createProcessClosureMonitor();
  const child = spawn(executable, args, {
    cwd,
    env: environment,
    detached: process.platform !== 'win32',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  registerOwnedChildProcess(child, {
    detached: process.platform !== 'win32',
  });
  const processGroupId = child.pid;
  if (!Number.isSafeInteger(processGroupId) || processGroupId <= 0) {
    await processMonitor.terminate();
    fail(`command ${id} did not receive a valid process-group identity`);
  }
  processMonitor.postMessage({ type: 'start', processGroupId });
  child.stdout.on('data', (chunk) => appendBounded(stdoutState, chunk));
  child.stderr.on('data', (chunk) => appendBounded(stderrState, chunk));
  const processLedger = new Map();
  discoverProcessClosure(processLedger, processGroupId);
  discoverProcessClosure(processLedger, processGroupId);
  let ledgerFailure = null;
  let forceTimer;
  let stopRequested = false;
  const requestStop = () => {
    if (stopRequested) return;
    stopRequested = true;
    signalProcessGroup(child, processGroupId, 'SIGTERM');
    forceTimer = setTimeout(
      () => signalProcessGroup(child, processGroupId, 'SIGKILL'),
      gracefulStopMs,
    );
    forceTimer.unref();
  };
  const onAbort = () => {
    aborted = true;
    requestStop();
  };
  effectiveSignal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    requestStop();
  }, timeoutMs);
  timer.unref();
  const outcome = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (status, signal) => resolve({ status, signal }));
  }).finally(() => {
    clearTimeout(timer);
    clearTimeout(forceTimer);
    effectiveSignal?.removeEventListener('abort', onAbort);
  }).catch(async (error) => {
    try {
      await stopProcessClosureMonitor(processMonitor);
    } catch {
      // Preserve the original spawn failure; suite residue remains fail-closed.
    }
    throw error;
  });
  try {
    discoverProcessClosure(processLedger, processGroupId);
  } catch (error) {
    ledgerFailure ??= error;
  }
  try {
    for (const entry of await stopProcessClosureMonitor(processMonitor)) {
      processLedger.set(entry.pid, Object.freeze(entry));
    }
  } catch (error) {
    ledgerFailure ??= error;
  }
  const descendantResidue = processGroupExists(processGroupId);
  if (descendantResidue) {
    await terminateProcessGroup(child, processGroupId, gracefulStopMs);
  }
  const ownedCwdResidue = newOwnedCwdProcesses(
    ownedCwdBefore,
    snapshotOwnedCwdProcesses(runRoot),
  );
  const terminalInventory = snapshotHostProcessInventory();
  const terminalByPid = new Map(
    terminalInventory.entries.map((entry) => [entry.pid, entry]),
  );
  for (const entry of ownedCwdResidue) {
    const current = terminalByPid.get(entry.pid);
    if (current && sameProcessIdentity(entry, current)) {
      processLedger.set(entry.pid, current);
    }
  }
  const ledgerResidue = [...processLedger.values()].filter((entry) => {
    const current = terminalByPid.get(entry.pid);
    return entry.pid !== processGroupId && sameProcessIdentity(entry, current);
  });
  await terminateOwnedProcesses(ledgerResidue, gracefulStopMs);
  const durationMs = Math.round(performance.now() - started);
  const stdout = Buffer.concat(stdoutState.chunks);
  const stderr = Buffer.concat(stderrState.chunks);
  fs.writeFileSync(stdoutPath, stdout, { flag: 'wx', mode: 0o600 });
  fs.writeFileSync(stderrPath, stderr, { flag: 'wx', mode: 0o600 });
  const result = Object.freeze({
    id,
    executable,
    args: Object.freeze([...args]),
    cwd,
    status: outcome.status,
    signal: outcome.signal,
    timedOut,
    durationMs,
    stdout: Object.freeze({
      path: path.relative(runRoot, stdoutPath).split(path.sep).join('/'),
      sha256: await sha256File(stdoutPath),
      bytes: stdout.length,
      truncated: stdoutState.truncated,
    }),
    stderr: Object.freeze({
      path: path.relative(runRoot, stderrPath).split(path.sep).join('/'),
      sha256: await sha256File(stderrPath),
      bytes: stderr.length,
      truncated: stderrState.truncated,
    }),
  });
  if (timedOut) throw new CommandError(`command ${id} timed out`, result);
  if (aborted) throw new CommandError(`command ${id} was aborted`, result);
  if (ledgerFailure) {
    throw new CommandError(
      `command ${id} process-closure inventory failed: ${ledgerFailure.message}`,
      result,
    );
  }
  if (descendantResidue || ledgerResidue.length > 0) {
    throw new CommandError(
      `command ${id} left descendant processes in its owned process closure`,
      result,
    );
  }
  if (outcome.status !== expectStatus) {
    throw new CommandError(
      `command ${id} exited ${outcome.status ?? `by ${outcome.signal}`}`,
      result,
    );
  }
  return result;
}

export function sanitizeSummary(value, redactions = []) {
  let result = String(value)
    .replaceAll(/[\r\n\t]+/gu, ' ')
    .replaceAll(/\s{2,}/gu, ' ')
    .trim();
  for (const redaction of redactions.filter(Boolean)) {
    result = result.replaceAll(String(redaction), '<redacted>');
  }
  result = result.replaceAll(/(?:[A-Za-z]:)?\/[^\s"']+/gu, '<path>');
  return result.slice(0, 512) || 'unspecified failure';
}
