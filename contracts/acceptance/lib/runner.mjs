import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  isMainThread,
  Worker,
  workerData as currentWorkerData,
} from 'node:worker_threads';

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
const PROCESS_INVENTORY_MAX_ENTRIES = 131_072;
const PROCESS_STAT_MAX_BYTES = 64 * 1024;
const PROCESS_STATUS_MAX_BYTES = 1024 * 1024;
const PROCESS_CMDLINE_MAX_BYTES = 1024 * 1024;
const PROCESS_LINK_MAX_BYTES = 16 * 1024;
const LINUX_ANCESTOR_CHAIN_MAX_DEPTH = 4096;
const LINUX_PROC_SUPER_MAGIC = 0x9fa0;
const PREEXISTING_SAME_USER_PERMISSION_DENIED =
  'preexisting-same-user-permission-denied';
const PROCESS_BASELINE_ENTRY_KEYS = Object.freeze([
  'comm',
  'kind',
  'pid',
  'reason',
  'startToken',
  'userId',
]);
const TRANSFERRED_PROCESS_BASELINE_ENTRIES =
  'preexistingSameUserProcessBaseline';
const TRANSFERRED_PROCESS_BASELINE_DIGEST =
  'preexistingSameUserProcessBaselineDigest';
const SYNTHETIC_PROCESS_BASELINE = 'syntheticProcessBaseline';
const SYNTHETIC_PERMISSION_DENIED_PATHS =
  'syntheticPermissionDeniedPaths';
const LINUX_SIGNED_STAT_FIELDS = new Set([
  4, 5, 6, 7, 8, 16, 17, 18, 19, 20, 21, 24, 38, 39, 44, 52,
]);
const SIGNED_64_MINIMUM = -(1n << 63n);
const SIGNED_64_MAXIMUM = (1n << 63n) - 1n;
const UNSIGNED_64_MAXIMUM = (1n << 64n) - 1n;
const PROCESS_CLOSURE_MONITOR_STATES = new WeakMap();
let canonicalLinuxProcessBaseline = null;
let canonicalLinuxProcessBaselineCaptureInProgress = false;
let canonicalLinuxProcessBaselineFailure = null;

export class CommandError extends Error {
  constructor(message, result) {
    super(message);
    this.result = result;
  }
}

function fail(message) {
  throw new CommandError(message);
}

function processBaselineIdentityKey(entry) {
  return [
    entry.kind,
    entry.reason,
    entry.pid,
    entry.userId,
    entry.startToken,
    entry.comm,
  ].join('\0');
}

function validatedProcessBaselineEntry(value, label) {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join('\0') !==
      [...PROCESS_BASELINE_ENTRY_KEYS].sort().join('\0') ||
    value.kind !== 'opaque' ||
    value.reason !== PREEXISTING_SAME_USER_PERMISSION_DENIED ||
    !Number.isSafeInteger(value.pid) ||
    value.pid <= 0 ||
    !Number.isSafeInteger(value.userId) ||
    value.userId < 0 ||
    typeof value.startToken !== 'string' ||
    !/^(?:0|[1-9][0-9]*)$/u.test(value.startToken) ||
    !Number.isSafeInteger(Number(value.startToken)) ||
    typeof value.comm !== 'string' ||
    value.comm.length === 0 ||
    value.comm.length > 4096
  ) {
    fail(`${label} is invalid`);
  }
  return Object.freeze({
    comm: value.comm,
    kind: value.kind,
    pid: value.pid,
    reason: value.reason,
    startToken: value.startToken,
    userId: value.userId,
  });
}

function sealedProcessBaseline(entries, expectedDigest = undefined, label) {
  if (
    !Array.isArray(entries) ||
    entries.length > PROCESS_INVENTORY_MAX_ENTRIES
  ) {
    fail(`${label} list is invalid or unbounded`);
  }
  const validatedEntries = entries.map((entry, index) =>
    validatedProcessBaselineEntry(entry, `${label} entry ${index}`),
  );
  const keys = validatedEntries.map(processBaselineIdentityKey);
  if (
    new Set(validatedEntries.map((entry) => entry.pid)).size !==
      validatedEntries.length ||
    keys.some((key, index) => index > 0 && key <= keys[index - 1])
  ) {
    fail(`${label} list is not sorted and duplicate-free`);
  }
  const digest = canonicalJsonDigest(validatedEntries);
  if (
    expectedDigest !== undefined &&
    (
      typeof expectedDigest !== 'string' ||
      expectedDigest !== digest
    )
  ) {
    fail(`${label} digest does not match its canonical list`);
  }
  return Object.freeze({
    digest,
    entries: Object.freeze(validatedEntries),
  });
}

function validatedProcessBaseline(value, label) {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join('\0') !== 'digest\0entries'
  ) {
    fail(`${label} is invalid`);
  }
  return sealedProcessBaseline(value.entries, value.digest, label);
}

function capturedProcessBaseline(entries, currentUserId) {
  return sealedProcessBaseline(
    entries
      .filter(
        (entry) =>
          entry.kind === 'opaque' &&
          entry.userId === currentUserId &&
          (
            entry.reason === 'permission-denied' ||
            entry.reason === PREEXISTING_SAME_USER_PERMISSION_DENIED
          ),
      )
      .map((entry) => ({
        comm: entry.comm,
        kind: entry.kind,
        pid: entry.pid,
        reason: PREEXISTING_SAME_USER_PERMISSION_DENIED,
        startToken: entry.startToken,
        userId: entry.userId,
      }))
      .sort((left, right) => {
        const leftKey = processBaselineIdentityKey(left);
        const rightKey = processBaselineIdentityKey(right);
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
      }),
    undefined,
    'canonical Linux process baseline',
  );
}

function sameProcessBaseline(left, right) {
  return (
    left.digest === right.digest &&
    left.entries.length === right.entries.length &&
    left.entries.every(
      (entry, index) =>
        processBaselineIdentityKey(entry) ===
        processBaselineIdentityKey(right.entries[index]),
    )
  );
}

export function runWithCommandAbortSignal(signal, action) {
  return runWithAbortSignal(signal, action);
}

export function throwIfCommandAborted() {
  throwIfAborted();
}

function boundedReadFile(fileSystem, filePath, maximumBytes) {
  const descriptor = fileSystem.openSync(filePath, 'r');
  const bytes = Buffer.allocUnsafe(maximumBytes + 1);
  let offset = 0;
  try {
    while (offset < bytes.length) {
      const count = fileSystem.readSync(
        descriptor,
        bytes,
        offset,
        bytes.length - offset,
        null,
      );
      if (count === 0) break;
      if (!Number.isSafeInteger(count) || count < 0) {
        fail('process inventory file read returned an invalid byte count');
      }
      offset += count;
    }
  } finally {
    fileSystem.closeSync(descriptor);
  }
  if (offset > maximumBytes) {
    fail(`process inventory file exceeds ${maximumBytes} bytes`);
  }
  return bytes.subarray(0, offset);
}

function defaultProcessInventoryIo(fileSystem) {
  return Object.freeze({
    lstat: (candidate) => fileSystem.lstatSync(candidate),
    readDirectory: (directory) =>
      fileSystem.readdirSync(directory, { withFileTypes: true }),
    readFile: (candidate, maximumBytes) =>
      boundedReadFile(fileSystem, candidate, maximumBytes),
    readLink: (candidate) =>
      fileSystem.readlinkSync(candidate, { encoding: 'buffer' }),
  });
}

function validatedHarnessAnchorIdentity(value, label) {
  const expectedKeys = ['comm', 'pid', 'startToken', 'userId'];
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join('\0') !==
      [...expectedKeys].sort().join('\0') ||
    !Number.isSafeInteger(value.pid) ||
    value.pid <= 0 ||
    !Number.isSafeInteger(value.userId) ||
    value.userId < 0 ||
    typeof value.startToken !== 'string' ||
    !/^(?:0|[1-9][0-9]*)$/u.test(value.startToken) ||
    !Number.isSafeInteger(Number(value.startToken)) ||
    typeof value.comm !== 'string' ||
    value.comm.length === 0 ||
    value.comm.length > 4096
  ) {
    fail(`${label} is invalid`);
  }
  return Object.freeze({
    comm: value.comm,
    pid: value.pid,
    startToken: value.startToken,
    userId: value.userId,
  });
}

function processInventoryRuntime(options = {}) {
  if (
    options === null ||
    typeof options !== 'object' ||
    Array.isArray(options)
  ) {
    fail('process inventory options must be an object');
  }
  const platform = options.platform ?? process.platform;
  if (!['darwin', 'linux', 'win32'].includes(platform)) {
    fail(`process inventory platform is unsupported: ${platform}`);
  }
  let actualCurrentUserId = null;
  let currentUserId = null;
  let currentProcessId = null;
  if (platform === 'linux') {
    actualCurrentUserId = process.getuid?.();
    if (
      !Number.isSafeInteger(actualCurrentUserId) ||
      actualCurrentUserId < 0
    ) {
      fail('process inventory current real UID is unavailable');
    }
    currentUserId =
      options.currentUserId === undefined
        ? actualCurrentUserId
        : options.currentUserId;
    if (
      !Number.isSafeInteger(currentUserId) ||
      currentUserId < 0
    ) {
      fail('process inventory current real UID is invalid');
    }
    currentProcessId =
      options.currentProcessId === undefined
        ? process.pid
        : options.currentProcessId;
    if (
      !Number.isSafeInteger(currentProcessId) ||
      currentProcessId <= 0
    ) {
      fail('process inventory current PID is invalid');
    }
  }
  const procRoot = options.procRoot ?? '/proc';
  if (
    typeof procRoot !== 'string' ||
    !path.posix.isAbsolute(procRoot) ||
    procRoot.length > 4096 ||
    procRoot.includes('\0')
  ) {
    fail('process inventory proc root must be an absolute bounded path');
  }
  const normalizedProcRoot =
    path.posix.normalize(procRoot).replace(/\/+$/u, '') || '/';
  let syntheticPermissionDeniedPaths = null;
  if (options[SYNTHETIC_PERMISSION_DENIED_PATHS] !== undefined) {
    const candidates = options[SYNTHETIC_PERMISSION_DENIED_PATHS];
    if (
      platform !== 'linux' ||
      normalizedProcRoot === '/proc' ||
      !Array.isArray(candidates) ||
      candidates.length === 0 ||
      candidates.length > PROCESS_INVENTORY_MAX_ENTRIES
    ) {
      fail(
        'synthetic permission-denied paths require a bounded noncanonical Linux fixture',
      );
    }
    const validated = [];
    for (const [index, candidate] of candidates.entries()) {
      if (
        typeof candidate !== 'string' ||
        candidate.length === 0 ||
        candidate.length > 4096 ||
        candidate.includes('\0') ||
        !path.posix.isAbsolute(candidate) ||
        path.posix.normalize(candidate) !== candidate
      ) {
        fail(`synthetic permission-denied path ${index} is invalid`);
      }
      const relative = path.posix.relative(
        normalizedProcRoot,
        candidate,
      );
      const fields = relative.split('/');
      if (
        fields.length !== 2 ||
        !/^[1-9][0-9]*$/u.test(fields[0]) ||
        !['cmdline', 'cwd', 'exe'].includes(fields[1]) ||
        path.posix.join(normalizedProcRoot, ...fields) !== candidate
      ) {
        fail(
          `synthetic permission-denied path ${index} is outside an exact PID live-only field`,
        );
      }
      validated.push(candidate);
    }
    if (
      validated.some(
        (candidate, index) =>
          index > 0 && candidate <= validated[index - 1],
      )
    ) {
      fail(
        'synthetic permission-denied paths are not sorted and duplicate-free',
      );
    }
    syntheticPermissionDeniedPaths = Object.freeze(validated);
  }
  let syntheticProcessBaselineMode = 'legacy';
  let syntheticProcessBaseline = null;
  if (options[SYNTHETIC_PROCESS_BASELINE] !== undefined) {
    if (platform !== 'linux' || normalizedProcRoot === '/proc') {
      fail('synthetic process baseline requires a noncanonical Linux root');
    }
    if (options[SYNTHETIC_PROCESS_BASELINE] === 'capture') {
      syntheticProcessBaselineMode = 'capture';
    } else {
      syntheticProcessBaseline = validatedProcessBaseline(
        options[SYNTHETIC_PROCESS_BASELINE],
        'synthetic process baseline',
      );
      syntheticProcessBaselineMode = 'enforce';
    }
  }
  const transferredBaselineEntries =
    options[TRANSFERRED_PROCESS_BASELINE_ENTRIES];
  const transferredBaselineDigest =
    options[TRANSFERRED_PROCESS_BASELINE_DIGEST];
  let transferredProcessBaseline = null;
  if (
    transferredBaselineEntries !== undefined ||
    transferredBaselineDigest !== undefined
  ) {
    if (
      platform !== 'linux' ||
      normalizedProcRoot !== '/proc' ||
      isMainThread ||
      transferredBaselineEntries === undefined ||
      transferredBaselineDigest === undefined
    ) {
      fail('transferred process baseline is not allowed in this inventory');
    }
    const authorizedOptions =
      currentWorkerData?.processInventoryOptions;
    if (
      authorizedOptions === null ||
      typeof authorizedOptions !== 'object' ||
      Array.isArray(authorizedOptions) ||
      transferredBaselineEntries !==
        authorizedOptions[TRANSFERRED_PROCESS_BASELINE_ENTRIES] ||
      transferredBaselineDigest !==
        authorizedOptions[TRANSFERRED_PROCESS_BASELINE_DIGEST]
    ) {
      fail('closure worker process baseline was forged or replaced');
    }
    transferredProcessBaseline = sealedProcessBaseline(
      transferredBaselineEntries,
      transferredBaselineDigest,
      'closure worker process baseline',
    );
  }
  if (
    platform === 'linux' &&
    normalizedProcRoot === '/proc' &&
    currentProcessId !== process.pid
  ) {
    fail('canonical Linux process inventory current PID must equal process.pid');
  }
  if (
    platform === 'linux' &&
    normalizedProcRoot === '/proc' &&
    currentUserId !== actualCurrentUserId
  ) {
    fail(
      'canonical Linux process inventory current UID must equal process.getuid()',
    );
  }
  if (
    platform === 'linux' &&
    normalizedProcRoot === '/proc' &&
    isMainThread &&
    (
      options.fileSystem !== undefined ||
      options.io !== undefined ||
      options.spawnSync !== undefined
    )
  ) {
    fail('canonical Linux process inventory dependencies cannot be replaced');
  }
  if (
    platform === 'linux' &&
    normalizedProcRoot !== '/proc'
  ) {
    let fileSystemType;
    try {
      fileSystemType = Number(fs.statfsSync(normalizedProcRoot).type);
    } catch (error) {
      fail(
        `synthetic Linux process inventory root statfs failed: ${error.message}`,
      );
    }
    if (fileSystemType === LINUX_PROC_SUPER_MAGIC) {
      fail(
        'noncanonical Linux process inventory root cannot use procfs',
      );
    }
  }
  let expectedHarnessAnchor = null;
  if (
    platform === 'linux' &&
    options.expectedHarnessAnchor !== undefined
  ) {
    expectedHarnessAnchor = validatedHarnessAnchorIdentity(
      options.expectedHarnessAnchor,
      'process inventory expected Harness anchor',
    );
    if (
      expectedHarnessAnchor.pid !== currentProcessId ||
      expectedHarnessAnchor.userId !== currentUserId
    ) {
      fail('process inventory expected Harness anchor does not match PID/UID');
    }
  } else if (options.expectedHarnessAnchor !== undefined) {
    fail('process inventory expected Harness anchor is Linux-only');
  }
  const timeoutMs = options.timeoutMs ?? PROCESS_INVENTORY_TIMEOUT_MS;
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 100 ||
    timeoutMs > PROCESS_INVENTORY_TIMEOUT_MS
  ) {
    fail('process inventory timeout is invalid');
  }
  const fileSystem = options.fileSystem ?? fs;
  const baseIo = options.io ?? defaultProcessInventoryIo(fileSystem);
  for (const method of ['lstat', 'readDirectory', 'readFile', 'readLink']) {
    if (typeof baseIo?.[method] !== 'function') {
      fail(`process inventory IO is missing ${method}`);
    }
  }
  const deniedPaths =
    syntheticPermissionDeniedPaths === null
      ? null
      : new Set(syntheticPermissionDeniedPaths);
  const denySyntheticEvidence = (candidate) => {
    if (!deniedPaths?.has(candidate)) return;
    const error = new Error(
      `synthetic process inventory permission denied: ${candidate}`,
    );
    error.code = 'EACCES';
    throw error;
  };
  const io =
    deniedPaths === null
      ? baseIo
      : Object.freeze({
          lstat: (...arguments_) => baseIo.lstat(...arguments_),
          readDirectory: (...arguments_) =>
            baseIo.readDirectory(...arguments_),
          readFile: (candidate, ...arguments_) => {
            denySyntheticEvidence(candidate);
            return baseIo.readFile(candidate, ...arguments_);
          },
          readLink: (candidate, ...arguments_) => {
            denySyntheticEvidence(candidate);
            return baseIo.readLink(candidate, ...arguments_);
          },
        });
  const spawnProcessSync = options.spawnSync ?? spawnSync;
  if (typeof spawnProcessSync !== 'function') {
    fail('process inventory spawnSync dependency is invalid');
  }
  return Object.freeze({
    currentProcessId,
    currentUserId,
    expectedHarnessAnchor,
    fileSystem,
    io,
    platform,
    procRoot: normalizedProcRoot,
    spawnProcessSync,
    syntheticPermissionDeniedPaths,
    syntheticProcessBaseline,
    syntheticProcessBaselineMode,
    timeoutMs,
    transferredProcessBaseline,
  });
}

function decodeUtf8(bytes, label) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail(`${label} is not valid UTF-8`);
  }
}

function canonicalInteger(text, label, { minimum = 0 } = {}) {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(text)) {
    fail(`${label} is not a canonical non-negative integer`);
  }
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < minimum) {
    fail(`${label} is outside the safe integer range`);
  }
  return value;
}

function canonicalLinuxStatInteger(text, fieldNumber, pid) {
  if (!/^(?:0|-?[1-9][0-9]*)$/u.test(text)) {
    fail(`process ${pid} stat field ${fieldNumber} is not canonical`);
  }
  let value;
  try {
    value = BigInt(text);
  } catch {
    fail(`process ${pid} stat field ${fieldNumber} is invalid`);
  }
  const signed = LINUX_SIGNED_STAT_FIELDS.has(fieldNumber);
  const minimum = signed ? SIGNED_64_MINIMUM : 0n;
  const maximum = signed ? SIGNED_64_MAXIMUM : UNSIGNED_64_MAXIMUM;
  if (value < minimum || value > maximum) {
    fail(`process ${pid} stat field ${fieldNumber} exceeds its integer width`);
  }
  return value;
}

function parseLinuxProcessStat(bytes, expectedPid) {
  const text = decodeUtf8(bytes, `process ${expectedPid} stat`);
  if (text.includes('\0')) fail(`process ${expectedPid} stat contains NUL`);
  const line = text.endsWith('\n') ? text.slice(0, -1) : text;
  if (line.includes('\n') || line.includes('\r')) {
    fail(`process ${expectedPid} stat has invalid line framing`);
  }
  const prefix = `${expectedPid} (`;
  if (!line.startsWith(prefix)) {
    fail(`process ${expectedPid} stat has the wrong PID prefix`);
  }
  const closingParenthesis = line.lastIndexOf(')');
  if (
    closingParenthesis < prefix.length ||
    line[closingParenthesis + 1] !== ' ' ||
    !/^[RSDZTtWXxKPI]$/u.test(line[closingParenthesis + 2] ?? '') ||
    line[closingParenthesis + 3] !== ' '
  ) {
    fail(`process ${expectedPid} stat has an invalid comm field`);
  }
  const comm = line.slice(prefix.length, closingParenthesis);
  if (comm.length === 0 || comm.length > 4096) {
    fail(`process ${expectedPid} stat comm is invalid`);
  }
  const suffix = line.slice(closingParenthesis + 2);
  if (
    suffix.length === 0 ||
    suffix.startsWith(' ') ||
    suffix.endsWith(' ') ||
    suffix.includes('  ') ||
    suffix.includes('\t')
  ) {
    fail(`process ${expectedPid} stat fields are not canonical`);
  }
  const fields = suffix.split(' ');
  if (fields.length < 50 || !/^[RSDZTtWXxKPI]$/u.test(fields[0])) {
    fail(`process ${expectedPid} stat is truncated`);
  }
  for (const [index, field] of fields.slice(1).entries()) {
    canonicalLinuxStatInteger(field, index + 4, expectedPid);
  }
  const parentPid = canonicalInteger(
    fields[1],
    `process ${expectedPid} parent PID`,
  );
  const processGroupId = canonicalInteger(
    fields[2],
    `process ${expectedPid} process group`,
  );
  canonicalInteger(
    fields[19],
    `process ${expectedPid} start time`,
  );
  return Object.freeze({
    comm,
    parentPid,
    pid: expectedPid,
    processGroupId,
    state: fields[0],
    startToken: fields[19],
  });
}

function parseLinuxProcessStatusText(bytes, pid) {
  const text = decodeUtf8(bytes, `process ${pid} status`);
  if (text.includes('\0')) fail(`process ${pid} status contains NUL`);
  return text;
}

function parseLinuxProcessUserIdFromText(text, pid) {
  const userIdRows = text
    .split('\n')
    .filter((line) => line.trimStart().startsWith('Uid'));
  if (userIdRows.length !== 1) {
    fail(`process ${pid} status must contain one complete Uid row`);
  }
  const match =
    /^Uid:[ \t]+([0-9]+)[ \t]+([0-9]+)[ \t]+([0-9]+)[ \t]+([0-9]+)[ \t]*$/u.exec(
      userIdRows[0],
    );
  if (match === null) {
    fail(`process ${pid} status must contain one complete Uid row`);
  }
  for (const [index, value] of match.slice(1).entries()) {
    canonicalInteger(value, `process ${pid} UID field ${index + 1}`);
  }
  return canonicalInteger(match[1], `process ${pid} real UID`);
}

function parseLinuxProcessUserId(bytes, pid) {
  return parseLinuxProcessUserIdFromText(
    parseLinuxProcessStatusText(bytes, pid),
    pid,
  );
}

function parseLinuxLiveProcessStatus(bytes, pid) {
  const text = parseLinuxProcessStatusText(bytes, pid);
  const kernelThreadRows = text
    .split('\n')
    .filter((line) => line.trimStart().startsWith('Kthread'));
  if (kernelThreadRows.length > 1) {
    fail(`process ${pid} status contains duplicate Kthread rows`);
  }
  let kernelThread = null;
  if (kernelThreadRows.length === 1) {
    const match =
      /^Kthread:[ \t]+([01])[ \t]*$/u.exec(kernelThreadRows[0]);
    if (match === null) {
      fail(`process ${pid} status contains a malformed Kthread row`);
    }
    kernelThread = match[1] === '1';
  }
  return Object.freeze({
    kernelThread,
    userId: parseLinuxProcessUserIdFromText(text, pid),
  });
}

function parseLinuxProcessArguments(bytes, pid) {
  if (bytes.length === 0 || bytes.at(-1) !== 0) {
    fail(`process ${pid} cmdline must be a non-empty NUL-terminated argv`);
  }
  const arguments_ = [];
  let start = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] !== 0) continue;
    arguments_.push(
      decodeUtf8(bytes.subarray(start, index), `process ${pid} argv`),
    );
    start = index + 1;
  }
  if (
    start !== bytes.length ||
    arguments_.length === 0 ||
    arguments_[0].length === 0
  ) {
    fail(`process ${pid} cmdline has an invalid argv`);
  }
  return Object.freeze(arguments_);
}

function parseLinuxProcessLink(value, pid, label) {
  if (!Buffer.isBuffer(value) || value.length > PROCESS_LINK_MAX_BYTES) {
    fail(`process ${pid} ${label} link returned invalid or unbounded bytes`);
  }
  const decoded = decodeUtf8(value, `process ${pid} ${label} link`);
  if (
    decoded.length === 0 ||
    decoded.includes('\0') ||
    decoded.endsWith(' (deleted)') ||
    !path.posix.isAbsolute(decoded)
  ) {
    fail(`process ${pid} ${label} link is invalid`);
  }
  return decoded;
}

function isDisappearanceError(error) {
  return error?.code === 'ENOENT' || error?.code === 'ESRCH';
}

function confirmedProcessAbsent(runtime, processRoot, pid) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      runtime.io.lstat(processRoot);
      return false;
    } catch (error) {
      if (!isDisappearanceError(error)) {
        fail(
          `process ${pid} disappearance confirmation failed: ${error.message}`,
        );
      }
    }
  }
  return true;
}

function checkedInventoryRead(runtime, candidate, maximumBytes, label) {
  const bytes = runtime.io.readFile(candidate, maximumBytes);
  if (!Buffer.isBuffer(bytes) || bytes.length > maximumBytes) {
    fail(`${label} returned invalid or unbounded bytes`);
  }
  return bytes;
}

function readLinuxProcessStat(runtime, processRoot, pid) {
  return parseLinuxProcessStat(
    checkedInventoryRead(
      runtime,
      path.posix.join(processRoot, 'stat'),
      PROCESS_STAT_MAX_BYTES,
      `process ${pid} stat`,
    ),
    pid,
  );
}

function readLinuxProcessUserId(runtime, processRoot, pid) {
  return parseLinuxProcessUserId(
    checkedInventoryRead(
      runtime,
      path.posix.join(processRoot, 'status'),
      PROCESS_STATUS_MAX_BYTES,
      `process ${pid} status`,
    ),
    pid,
  );
}

function readLinuxLiveProcessStatus(runtime, processRoot, pid) {
  return parseLinuxLiveProcessStatus(
    checkedInventoryRead(
      runtime,
      path.posix.join(processRoot, 'status'),
      PROCESS_STATUS_MAX_BYTES,
      `process ${pid} status`,
    ),
    pid,
  );
}

function readLinuxProcessCommandEvidence(runtime, processRoot, pid) {
  return Object.freeze({
    argv: parseLinuxProcessArguments(
      checkedInventoryRead(
        runtime,
        path.posix.join(processRoot, 'cmdline'),
        PROCESS_CMDLINE_MAX_BYTES,
        `process ${pid} cmdline`,
      ),
      pid,
    ),
    command: parseLinuxProcessLink(
      runtime.io.readLink(path.posix.join(processRoot, 'exe')),
      pid,
      'executable',
    ),
    cwd: parseLinuxProcessLink(
      runtime.io.readLink(path.posix.join(processRoot, 'cwd')),
      pid,
      'cwd',
    ),
  });
}

function terminalLinuxProcessState(state) {
  return state === 'Z' || state === 'X' || state === 'x';
}

function assertSameLinuxProcessGeneration(pid, before, after) {
  if (
    before.startToken !== after.startToken ||
    before.comm !== after.comm
  ) {
    fail(`process ${pid} identity changed while inventory was read`);
  }
  if (
    (before.processGroupId === 0) !==
    (after.processGroupId === 0)
  ) {
    fail(
      `process ${pid} process-group zero classification changed while inventory was read`,
    );
  }
}

function assertPositiveLinuxProcessGroup(stat, evidenceKind) {
  if (
    !Number.isSafeInteger(stat.processGroupId) ||
    stat.processGroupId <= 0
  ) {
    fail(
      `process ${stat.pid} ${evidenceKind} requires a positive process group`,
    );
  }
}

function assertLinuxProcessRemainedLive(pid, before, after) {
  assertSameLinuxProcessGeneration(pid, before, after);
  if (
    terminalLinuxProcessState(before.state) ||
    terminalLinuxProcessState(after.state)
  ) {
    fail(`process ${pid} live sample changed to terminal state`);
  }
}

function assertStableLinuxOpaqueRelation(pid, samples) {
  if (!Array.isArray(samples) || samples.length < 2) {
    fail(`process ${pid} opaque relation samples are invalid`);
  }
  const [first, ...remaining] = samples;
  if (
    remaining.some(
      (sample) =>
        sample.parentPid !== first.parentPid ||
        sample.processGroupId !== first.processGroupId,
    )
  ) {
    fail(`process ${pid} live relation changed while inventory was read`);
  }
}

function assertStableLinuxLiveStatus(pid, before, after) {
  if (before.userId !== after.userId) {
    fail(`process ${pid} live UID changed while inventory was read`);
  }
  if (before.kernelThread !== after.kernelThread) {
    fail(`process ${pid} Kthread flag changed while inventory was read`);
  }
}

function isPermissionDeniedError(error) {
  return error?.code === 'EACCES' || error?.code === 'EPERM';
}

function usesPreexistingSameUserProcessBaseline(runtime) {
  return (
    runtime.procRoot === '/proc' ||
    runtime.syntheticProcessBaselineMode !== 'legacy'
  );
}

function opaqueLinuxProcessEntry(
  stat,
  status,
  reason,
  ancestorEvidence = null,
) {
  if (
    reason !== 'permission-denied' &&
    reason !== 'kernel-thread' &&
    reason !== 'harness-ancestor-permission-denied' &&
    reason !== PREEXISTING_SAME_USER_PERMISSION_DENIED
  ) {
    fail(`process ${stat.pid} opaque reason is invalid`);
  }
  if (terminalLinuxProcessState(stat.state)) {
    fail(`process ${stat.pid} terminal evidence cannot become opaque`);
  }
  if (
    reason === 'permission-denied' ||
    reason === 'harness-ancestor-permission-denied' ||
    reason === PREEXISTING_SAME_USER_PERMISSION_DENIED
  ) {
    assertPositiveLinuxProcessGroup(
      stat,
      'permission-denied opaque evidence',
    );
  }
  const harnessAncestorFields =
    reason === 'harness-ancestor-permission-denied'
      ? ancestorEvidence
      : {};
  if (
    reason === 'harness-ancestor-permission-denied' &&
    (
      harnessAncestorFields === null ||
      typeof harnessAncestorFields !== 'object' ||
      !Array.isArray(harnessAncestorFields.ancestorChain) ||
      harnessAncestorFields.harnessAnchor === null ||
      typeof harnessAncestorFields.harnessAnchor !== 'object'
    )
  ) {
    fail(`process ${stat.pid} Harness ancestor evidence is invalid`);
  }
  return Object.freeze({
    ...harnessAncestorFields,
    comm: stat.comm,
    kind: 'opaque',
    parentPid: stat.parentPid,
    pid: stat.pid,
    processGroupId: stat.processGroupId,
    reason,
    startToken: stat.startToken,
    state: stat.state,
    userId: status.userId,
  });
}

function readStableLinuxAncestorLink(runtime, pid) {
  const processRoot = path.posix.join(runtime.procRoot, String(pid));
  try {
    const statBefore = readLinuxProcessStat(runtime, processRoot, pid);
    const userId = readLinuxProcessUserId(runtime, processRoot, pid);
    const statAfter = readLinuxProcessStat(runtime, processRoot, pid);
    assertSameLinuxProcessGeneration(pid, statBefore, statAfter);
    if (
      terminalLinuxProcessState(statBefore.state) ||
      terminalLinuxProcessState(statAfter.state)
    ) {
      fail(`process ${pid} Harness ancestor chain contains terminal evidence`);
    }
    if (
      statBefore.parentPid !== statAfter.parentPid ||
      statBefore.processGroupId !== statAfter.processGroupId
    ) {
      fail(`process ${pid} Harness ancestor relation changed while inventory was read`);
    }
    assertPositiveLinuxProcessGroup(
      statAfter,
      'Harness ancestor evidence',
    );
    return Object.freeze({
      comm: statAfter.comm,
      parentPid: statAfter.parentPid,
      pid,
      processGroupId: statAfter.processGroupId,
      startToken: statAfter.startToken,
      state: statAfter.state,
      userId,
    });
  } catch (error) {
    if (error instanceof CommandError) throw error;
    fail(`process ${pid} Harness ancestor chain failed: ${error.message}`);
  }
}

function readStableLinuxHarnessAnchor(runtime) {
  const link = readStableLinuxAncestorLink(
    runtime,
    runtime.currentProcessId,
  );
  if (link.userId !== runtime.currentUserId) {
    fail('Harness anchor does not match the current real UID');
  }
  return validatedHarnessAnchorIdentity(
    {
      comm: link.comm,
      pid: link.pid,
      startToken: link.startToken,
      userId: link.userId,
    },
    'Harness anchor identity',
  );
}

function assertExpectedLinuxHarnessAnchor(runtime, observed) {
  const expected = runtime.expectedHarnessAnchor;
  if (
    expected !== null &&
    (
      observed.pid !== expected.pid ||
      observed.userId !== expected.userId ||
      observed.startToken !== expected.startToken ||
      observed.comm !== expected.comm
    )
  ) {
    fail('Harness anchor identity changed after monitor creation');
  }
}

function snapshotLinuxHarnessAncestorChain(runtime) {
  const started = performance.now();
  const chain = [];
  const visited = new Set();
  let pid = runtime.currentProcessId;
  for (
    let depth = 0;
    depth < LINUX_ANCESTOR_CHAIN_MAX_DEPTH;
    depth += 1
  ) {
    if (performance.now() - started > runtime.timeoutMs) {
      fail('Harness ancestor chain timed out');
    }
    if (visited.has(pid)) {
      fail(`process ${pid} Harness ancestor chain contains a cycle`);
    }
    visited.add(pid);
    const link = readStableLinuxAncestorLink(runtime, pid);
    if (performance.now() - started > runtime.timeoutMs) {
      fail('Harness ancestor chain timed out');
    }
    chain.push(link);
    if (link.parentPid === 0) {
      return Object.freeze(chain);
    }
    pid = link.parentPid;
  }
  fail('Harness ancestor chain exceeds the bounded depth');
}

function sameLinuxAncestorRelation(left, right) {
  return (
    left.pid === right.pid &&
    left.userId === right.userId &&
    left.startToken === right.startToken &&
    left.comm === right.comm &&
    left.parentPid === right.parentPid &&
    left.processGroupId === right.processGroupId
  );
}

function harnessAncestorEvidence(
  runtime,
  candidateStat,
  candidateStatus,
  beforeChain,
  afterChain,
) {
  if (
    beforeChain.length !== afterChain.length ||
    beforeChain.some(
      (link, index) =>
        !sameLinuxAncestorRelation(link, afterChain[index]),
    )
  ) {
    fail(
      `process ${candidateStat.pid} Harness ancestor chain changed while inventory was read`,
    );
  }
  const anchor = afterChain[0];
  if (
    anchor?.pid !== runtime.currentProcessId ||
    anchor.userId !== runtime.currentUserId
  ) {
    fail('Harness ancestor chain anchor does not match the current process');
  }
  assertExpectedLinuxHarnessAnchor(
    runtime,
    validatedHarnessAnchorIdentity(
      {
        comm: anchor.comm,
        pid: anchor.pid,
        startToken: anchor.startToken,
        userId: anchor.userId,
      },
      'Harness ancestor chain anchor',
    ),
  );
  const candidateMatches = (link) =>
    link.pid === candidateStat.pid &&
    link.userId === candidateStatus.userId &&
    link.startToken === candidateStat.startToken &&
    link.comm === candidateStat.comm &&
    link.parentPid === candidateStat.parentPid &&
    link.processGroupId === candidateStat.processGroupId;
  const beforeCandidate = beforeChain
    .slice(1)
    .find((link) => link.pid === candidateStat.pid);
  const afterCandidate = afterChain
    .slice(1)
    .find((link) => link.pid === candidateStat.pid);
  if (
    beforeCandidate === undefined ||
    afterCandidate === undefined ||
    !candidateMatches(beforeCandidate) ||
    !candidateMatches(afterCandidate)
  ) {
    fail(
      `process ${candidateStat.pid} is not a stable strict Harness ancestor`,
    );
  }
  return Object.freeze({
    ancestorChain: Object.freeze(
      afterChain.map((link) => Object.freeze({ ...link })),
    ),
    harnessAnchor: Object.freeze({
      comm: anchor.comm,
      pid: anchor.pid,
      startToken: anchor.startToken,
      userId: anchor.userId,
    }),
  });
}

function assertStableLinuxTerminalSample(pid, before, after) {
  assertSameLinuxProcessGeneration(pid, before, after);
  if (
    !terminalLinuxProcessState(before.state) ||
    !terminalLinuxProcessState(after.state)
  ) {
    fail(
      `process ${pid} terminal generation changed back to live state`,
    );
  }
  if (
    before.state !== after.state ||
    before.parentPid !== after.parentPid ||
    before.processGroupId !== after.processGroupId
  ) {
    fail(`process ${pid} terminal relation changed while inventory was read`);
  }
}

function readStableLinuxTerminalEntry(
  runtime,
  processRoot,
  pid,
  firstStat,
) {
  const firstUserId = readLinuxProcessUserId(runtime, processRoot, pid);
  const middleStat = readLinuxProcessStat(runtime, processRoot, pid);
  assertStableLinuxTerminalSample(pid, firstStat, middleStat);
  const secondUserId = readLinuxProcessUserId(runtime, processRoot, pid);
  const finalStat = readLinuxProcessStat(runtime, processRoot, pid);
  assertStableLinuxTerminalSample(pid, middleStat, finalStat);
  if (firstUserId !== secondUserId) {
    fail(`process ${pid} terminal UID changed while inventory was read`);
  }
  assertPositiveLinuxProcessGroup(finalStat, 'terminal evidence');
  return Object.freeze({
    comm: finalStat.comm,
    kind: 'terminal',
    parentPid: finalStat.parentPid,
    pid,
    processGroupId: finalStat.processGroupId,
    startToken: finalStat.startToken,
    state: finalStat.state,
    userId: secondUserId,
  });
}

function reclassifyLinuxEvidenceFailure(
  runtime,
  processRoot,
  pid,
  firstStat,
  firstUserId,
  evidenceError,
) {
  const finalStat = readLinuxProcessStat(runtime, processRoot, pid);
  assertSameLinuxProcessGeneration(pid, firstStat, finalStat);
  if (!terminalLinuxProcessState(finalStat.state)) throw evidenceError;
  const terminal = readStableLinuxTerminalEntry(
    runtime,
    processRoot,
    pid,
    finalStat,
  );
  if (firstUserId !== undefined && firstUserId !== terminal.userId) {
    fail(`process ${pid} UID changed during live-to-terminal transition`);
  }
  return terminal;
}

function readLinuxLiveContinuation(
  runtime,
  processRoot,
  pid,
  previousStat,
  previousStatus,
) {
  let status;
  try {
    status = readLinuxLiveProcessStatus(runtime, processRoot, pid);
  } catch (error) {
    return Object.freeze({
      terminal: reclassifyLinuxEvidenceFailure(
        runtime,
        processRoot,
        pid,
        previousStat,
        previousStatus.userId,
        error,
      ),
    });
  }
  const stat = readLinuxProcessStat(runtime, processRoot, pid);
  assertSameLinuxProcessGeneration(pid, previousStat, stat);
  if (terminalLinuxProcessState(stat.state)) {
    if (previousStatus.userId !== status.userId) {
      fail(`process ${pid} UID changed during live-to-terminal transition`);
    }
    const terminal = readStableLinuxTerminalEntry(
      runtime,
      processRoot,
      pid,
      stat,
    );
    if (status.userId !== terminal.userId) {
      fail(`process ${pid} UID changed during live-to-terminal transition`);
    }
    return Object.freeze({ terminal });
  }
  assertLinuxProcessRemainedLive(pid, previousStat, stat);
  assertStableLinuxLiveStatus(pid, previousStatus, status);
  return Object.freeze({ stat, status, terminal: null });
}

function readLinuxProcessEntry(runtime, pid) {
  const processRoot = path.posix.join(runtime.procRoot, String(pid));
  let statBefore;
  try {
    statBefore = readLinuxProcessStat(runtime, processRoot, pid);
    if (terminalLinuxProcessState(statBefore.state)) {
      return readStableLinuxTerminalEntry(
        runtime,
        processRoot,
        pid,
        statBefore,
      );
    }
    let statusBefore;
    try {
      statusBefore = readLinuxLiveProcessStatus(
        runtime,
        processRoot,
        pid,
      );
    } catch (error) {
      return reclassifyLinuxEvidenceFailure(
        runtime,
        processRoot,
        pid,
        statBefore,
        undefined,
        error,
      );
    }
    const statMiddle = readLinuxProcessStat(runtime, processRoot, pid);
    assertSameLinuxProcessGeneration(pid, statBefore, statMiddle);
    if (terminalLinuxProcessState(statMiddle.state)) {
      const terminal = readStableLinuxTerminalEntry(
        runtime,
        processRoot,
        pid,
        statMiddle,
      );
      if (terminal.userId !== statusBefore.userId) {
        fail(`process ${pid} UID changed during live-to-terminal transition`);
      }
      return terminal;
    }
    assertLinuxProcessRemainedLive(pid, statBefore, statMiddle);

    if (statusBefore.kernelThread === true) {
      const continuation = readLinuxLiveContinuation(
        runtime,
        processRoot,
        pid,
        statMiddle,
        statusBefore,
      );
      if (continuation.terminal !== null) return continuation.terminal;
      if (continuation.status.userId === runtime.currentUserId) {
        fail(
          `process ${pid} kernel-thread evidence belongs to the current real UID`,
        );
      }
      assertStableLinuxOpaqueRelation(
        pid,
        [statBefore, statMiddle, continuation.stat],
      );
      return opaqueLinuxProcessEntry(
        continuation.stat,
        continuation.status,
        'kernel-thread',
      );
    }

    let evidenceBefore;
    let evidenceBeforeError = null;
    try {
      evidenceBefore = readLinuxProcessCommandEvidence(
        runtime,
        processRoot,
        pid,
      );
    } catch (error) {
      evidenceBeforeError = error;
    }
    const firstAncestorChain =
      evidenceBeforeError !== null &&
      isPermissionDeniedError(evidenceBeforeError) &&
      statusBefore.userId === runtime.currentUserId &&
      !usesPreexistingSameUserProcessBaseline(runtime)
        ? snapshotLinuxHarnessAncestorChain(runtime)
        : null;
    const middleContinuation = readLinuxLiveContinuation(
      runtime,
      processRoot,
      pid,
      statMiddle,
      statusBefore,
    );
    if (middleContinuation.terminal !== null) {
      return middleContinuation.terminal;
    }
    if (evidenceBeforeError !== null) {
      if (!isPermissionDeniedError(evidenceBeforeError)) {
        throw evidenceBeforeError;
      }
      if (middleContinuation.status.userId === runtime.currentUserId) {
        if (usesPreexistingSameUserProcessBaseline(runtime)) {
          if (pid === runtime.currentProcessId) {
            fail(
              `process ${pid} self permission denial cannot enter the process baseline`,
            );
          }
          assertStableLinuxOpaqueRelation(
            pid,
            [statBefore, statMiddle, middleContinuation.stat],
          );
          return opaqueLinuxProcessEntry(
            middleContinuation.stat,
            middleContinuation.status,
            PREEXISTING_SAME_USER_PERMISSION_DENIED,
          );
        }
        const ancestorEvidence = harnessAncestorEvidence(
          runtime,
          middleContinuation.stat,
          middleContinuation.status,
          firstAncestorChain,
          snapshotLinuxHarnessAncestorChain(runtime),
        );
        assertStableLinuxOpaqueRelation(
          pid,
          [statBefore, statMiddle, middleContinuation.stat],
        );
        return opaqueLinuxProcessEntry(
          middleContinuation.stat,
          middleContinuation.status,
          'harness-ancestor-permission-denied',
          ancestorEvidence,
        );
      }
      assertStableLinuxOpaqueRelation(
        pid,
        [statBefore, statMiddle, middleContinuation.stat],
      );
      return opaqueLinuxProcessEntry(
        middleContinuation.stat,
        middleContinuation.status,
        'permission-denied',
      );
    }

    let evidenceAfter;
    let evidenceAfterError = null;
    try {
      evidenceAfter = readLinuxProcessCommandEvidence(
        runtime,
        processRoot,
        pid,
      );
    } catch (error) {
      evidenceAfterError = error;
    }
    const secondAncestorChain =
      evidenceAfterError !== null &&
      isPermissionDeniedError(evidenceAfterError) &&
      middleContinuation.status.userId === runtime.currentUserId &&
      !usesPreexistingSameUserProcessBaseline(runtime)
        ? snapshotLinuxHarnessAncestorChain(runtime)
        : null;
    const finalContinuation = readLinuxLiveContinuation(
      runtime,
      processRoot,
      pid,
      middleContinuation.stat,
      middleContinuation.status,
    );
    if (finalContinuation.terminal !== null) {
      return finalContinuation.terminal;
    }
    if (evidenceAfterError !== null) {
      if (!isPermissionDeniedError(evidenceAfterError)) {
        throw evidenceAfterError;
      }
      if (finalContinuation.status.userId === runtime.currentUserId) {
        if (usesPreexistingSameUserProcessBaseline(runtime)) {
          fail(
            `process ${pid} live evidence changed to same-user permission denial`,
          );
        }
        const ancestorEvidence = harnessAncestorEvidence(
          runtime,
          finalContinuation.stat,
          finalContinuation.status,
          secondAncestorChain,
          snapshotLinuxHarnessAncestorChain(runtime),
        );
        assertStableLinuxOpaqueRelation(
          pid,
          [
            statBefore,
            statMiddle,
            middleContinuation.stat,
            finalContinuation.stat,
          ],
        );
        return opaqueLinuxProcessEntry(
          finalContinuation.stat,
          finalContinuation.status,
          'harness-ancestor-permission-denied',
          ancestorEvidence,
        );
      }
      assertStableLinuxOpaqueRelation(
        pid,
        [
          statBefore,
          statMiddle,
          middleContinuation.stat,
          finalContinuation.stat,
        ],
      );
      return opaqueLinuxProcessEntry(
        finalContinuation.stat,
        finalContinuation.status,
        'permission-denied',
      );
    }
    if (
      evidenceBefore.command !== evidenceAfter.command ||
      evidenceBefore.cwd !== evidenceAfter.cwd ||
      !sameProcessArguments(evidenceBefore, evidenceAfter)
    ) {
      fail(`process ${pid} identity, cwd, or argv changed while inventory was read`);
    }
    assertPositiveLinuxProcessGroup(
      finalContinuation.stat,
      'complete live evidence',
    );
    return Object.freeze({
      ...evidenceAfter,
      comm: finalContinuation.stat.comm,
      kind: 'live',
      parentPid: finalContinuation.stat.parentPid,
      pid,
      processGroupId: finalContinuation.stat.processGroupId,
      startToken: finalContinuation.stat.startToken,
      userId: finalContinuation.status.userId,
    });
  } catch (error) {
    if (isDisappearanceError(error)) {
      if (confirmedProcessAbsent(runtime, processRoot, pid)) return null;
      if (statBefore !== undefined) {
        let statAfter;
        try {
          statAfter = readLinuxProcessStat(runtime, processRoot, pid);
        } catch (statError) {
          if (
            isDisappearanceError(statError) &&
            confirmedProcessAbsent(runtime, processRoot, pid)
          ) {
            return null;
          }
          if (statError instanceof CommandError) throw statError;
          fail(`process ${pid} race confirmation failed: ${statError.message}`);
        }
        assertSameLinuxProcessGeneration(pid, statBefore, statAfter);
      }
      fail(
        `process ${pid} inventory raced without confirmed absence: ${error.message}`,
      );
    }
    if (error instanceof CommandError) throw error;
    fail(`process ${pid} inventory failed: ${error.message}`);
  }
}

function readTargetedLinuxProcessAfterMapMiss(runtime, pid) {
  const processRoot = path.posix.join(runtime.procRoot, String(pid));
  let observed = false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      runtime.io.lstat(processRoot);
      observed = true;
      break;
    } catch (error) {
      if (!isDisappearanceError(error)) {
        fail(
          `process ${pid} targeted absence confirmation failed: ${error.message}`,
        );
      }
    }
  }
  if (!observed) return null;
  const entry = readLinuxProcessEntry(runtime, pid);
  if (entry === null) {
    fail(`process ${pid} disappeared after targeted presence confirmation`);
  }
  const processBaseline =
    runtime.procRoot === '/proc'
      ? resolveCanonicalLinuxProcessBaseline(runtime)
      : runtime.syntheticProcessBaseline;
  if (processBaseline !== null) {
    assertCanonicalLinuxProcessBaseline(
      [entry],
      processBaseline,
      runtime.currentUserId,
    );
  }
  return entry;
}

function snapshotLinuxProcessInventory(runtime) {
  const started = performance.now();
  if (runtime.expectedHarnessAnchor !== null) {
    const observedAnchor = readStableLinuxHarnessAnchor(runtime);
    assertExpectedLinuxHarnessAnchor(runtime, observedAnchor);
  }
  let directoryEntries;
  try {
    directoryEntries = runtime.io.readDirectory(runtime.procRoot);
  } catch (error) {
    fail(`Linux process inventory root failed: ${error.message}`);
  }
  if (
    !Array.isArray(directoryEntries) ||
    directoryEntries.length > PROCESS_INVENTORY_MAX_ENTRIES
  ) {
    fail('Linux process inventory root is invalid or unbounded');
  }
  const pids = [];
  for (const entry of directoryEntries) {
    if (!/^[1-9][0-9]*$/u.test(entry?.name ?? '')) continue;
    if (typeof entry.isDirectory !== 'function' || !entry.isDirectory()) {
      fail(`Linux process inventory PID ${entry.name} is not a directory`);
    }
    pids.push(canonicalInteger(entry.name, 'Linux process inventory PID', {
      minimum: 1,
    }));
  }
  pids.sort((left, right) => left - right);
  const entries = [];
  for (const pid of pids) {
    if (performance.now() - started > runtime.timeoutMs) {
      fail('Linux process inventory timed out');
    }
    const entry = readLinuxProcessEntry(runtime, pid);
    if (entry !== null) entries.push(entry);
  }
  return entries;
}

function assertCanonicalLinuxProcessBaseline(
  entries,
  baseline,
  currentUserId,
) {
  const baselineByPid = new Map();
  for (const sealedEntry of baseline.entries) {
    if (sealedEntry.userId !== currentUserId) {
      fail('canonical Linux process baseline UID does not match the Harness');
    }
    if (baselineByPid.has(sealedEntry.pid)) {
      fail('canonical Linux process baseline contains a duplicate PID');
    }
    baselineByPid.set(sealedEntry.pid, sealedEntry);
  }
  for (const entry of entries) {
    const sealedEntry = baselineByPid.get(entry.pid);
    if (sealedEntry !== undefined) {
      if (
        entry.kind !== 'opaque' ||
        entry.reason !== PREEXISTING_SAME_USER_PERMISSION_DENIED ||
        processBaselineIdentityKey(entry) !==
          processBaselineIdentityKey(sealedEntry)
      ) {
        fail(
          `process ${entry.pid} differs from its sealed process baseline generation`,
        );
      }
      continue;
    }
    if (
      entry.kind === 'opaque' &&
      entry.reason === PREEXISTING_SAME_USER_PERMISSION_DENIED
    ) {
      fail(
        `process ${entry.pid} same-user permission denial is absent from the sealed process baseline`,
      );
    }
  }
}

function resolveCanonicalLinuxProcessBaseline(runtime) {
  if (runtime.platform !== 'linux' || runtime.procRoot !== '/proc') {
    return null;
  }
  if (isMainThread) {
    if (runtime.transferredProcessBaseline !== null) {
      fail('main thread cannot receive a transferred process baseline');
    }
    return sealCanonicalLinuxProcessBaseline();
  }
  if (runtime.transferredProcessBaseline === null) {
    fail('closure worker cannot capture a local process baseline');
  }
  if (canonicalLinuxProcessBaseline === null) {
    canonicalLinuxProcessBaseline = runtime.transferredProcessBaseline;
  } else if (
    !sameProcessBaseline(
      canonicalLinuxProcessBaseline,
      runtime.transferredProcessBaseline,
    )
  ) {
    fail('closure worker process baseline changed after adoption');
  }
  return canonicalLinuxProcessBaseline;
}

export function sealCanonicalLinuxProcessBaseline() {
  if (process.platform !== 'linux') return null;
  if (!isMainThread) {
    const transferredOptions =
      currentWorkerData?.processInventoryOptions;
    if (
      transferredOptions === null ||
      typeof transferredOptions !== 'object' ||
      Array.isArray(transferredOptions)
    ) {
      fail('closure worker process baseline transfer is absent');
    }
    return resolveCanonicalLinuxProcessBaseline(
      processInventoryRuntime(transferredOptions),
    );
  }
  if (canonicalLinuxProcessBaseline !== null) {
    return canonicalLinuxProcessBaseline;
  }
  if (canonicalLinuxProcessBaselineFailure !== null) {
    fail(
      `canonical Linux process baseline previously failed: ${canonicalLinuxProcessBaselineFailure}`,
    );
  }
  if (canonicalLinuxProcessBaselineCaptureInProgress) {
    fail('canonical Linux process baseline capture is re-entrant');
  }
  canonicalLinuxProcessBaselineCaptureInProgress = true;
  try {
    const runtime = processInventoryRuntime({
      platform: 'linux',
      procRoot: '/proc',
    });
    const entries = snapshotLinuxProcessInventory(runtime);
    canonicalLinuxProcessBaseline = capturedProcessBaseline(
      entries,
      runtime.currentUserId,
    );
    return canonicalLinuxProcessBaseline;
  } catch (error) {
    const failure =
      error instanceof Error
        ? error
        : new CommandError(String(error));
    canonicalLinuxProcessBaselineFailure =
      failure.message || 'unknown process baseline failure';
    throw failure;
  } finally {
    canonicalLinuxProcessBaselineCaptureInProgress = false;
  }
}

function snapshotDarwinProcessInventory(runtime) {
  const result = runtime.spawnProcessSync(
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
      timeout: runtime.timeoutMs,
    },
  );
  if (result.error || result.status !== 0) {
    fail(`host process inventory failed: ${result.error?.message ?? result.status}`);
  }
  return result.stdout
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
}

export function snapshotHostProcessInventory(options = {}) {
  const runtime = processInventoryRuntime(options);
  if (runtime.platform === 'win32') {
    fail('host process inventory is not implemented on Windows');
  }
  let processBaseline =
    runtime.platform === 'linux' && runtime.procRoot === '/proc'
      ? resolveCanonicalLinuxProcessBaseline(runtime)
      : runtime.syntheticProcessBaseline;
  const entries =
    runtime.platform === 'linux'
      ? snapshotLinuxProcessInventory(runtime)
      : snapshotDarwinProcessInventory(runtime);
  if (runtime.syntheticProcessBaselineMode === 'capture') {
    processBaseline = capturedProcessBaseline(
      entries,
      runtime.currentUserId,
    );
  }
  if (processBaseline !== null) {
    assertCanonicalLinuxProcessBaseline(
      entries,
      processBaseline,
      runtime.currentUserId,
    );
  }
  return Object.freeze({
    entries: Object.freeze(entries.map((entry) => Object.freeze(entry))),
    digest: canonicalJsonDigest(entries),
    ...(runtime.syntheticProcessBaselineMode === 'capture'
      ? { processBaseline }
      : {}),
  });
}

export function isTerminalProcessEntry(entry) {
  return entry?.kind === 'terminal';
}

export function isOpaqueProcessEntry(entry) {
  return entry?.kind === 'opaque';
}

function isLiveProcessEntry(entry) {
  if (entry?.kind === 'live') return true;
  return (
    entry?.kind === undefined &&
    typeof entry?.command === 'string' &&
    entry.command !== '' &&
    entry?.comm === undefined &&
    entry?.argv === undefined &&
    entry?.state === undefined
  );
}

export function sameProcessGeneration(left, right) {
  return (
    left?.pid === right?.pid &&
    left?.userId === right?.userId &&
    left?.startToken === right?.startToken &&
    typeof left?.comm === 'string' &&
    left.comm !== '' &&
    left.comm === right?.comm
  );
}

function assertHarnessAncestorOpaqueIdentity(entry) {
  const anchor = entry.harnessAnchor;
  const anchorKeys = ['comm', 'pid', 'startToken', 'userId'];
  if (
    anchor === null ||
    typeof anchor !== 'object' ||
    Array.isArray(anchor) ||
    Object.keys(anchor).sort().join('\0') !==
      [...anchorKeys].sort().join('\0') ||
    !Number.isSafeInteger(anchor.pid) ||
    anchor.pid <= 0 ||
    !Number.isSafeInteger(anchor.userId) ||
    anchor.userId < 0 ||
    typeof anchor.startToken !== 'string' ||
    !/^(?:0|[1-9][0-9]*)$/u.test(anchor.startToken) ||
    !Number.isSafeInteger(Number(anchor.startToken)) ||
    typeof anchor.comm !== 'string' ||
    anchor.comm.length === 0 ||
    anchor.comm.length > 4096
  ) {
    fail(`process ${entry.pid} Harness ancestor anchor is invalid`);
  }
  const chain = entry.ancestorChain;
  const chainKeys = [
    'comm',
    'parentPid',
    'pid',
    'processGroupId',
    'startToken',
    'state',
    'userId',
  ];
  if (
    !Array.isArray(chain) ||
    chain.length < 2 ||
    chain.length > LINUX_ANCESTOR_CHAIN_MAX_DEPTH
  ) {
    fail(`process ${entry.pid} Harness ancestor chain is invalid`);
  }
  const visited = new Set();
  for (const [index, link] of chain.entries()) {
    if (
      link === null ||
      typeof link !== 'object' ||
      Array.isArray(link) ||
      Object.keys(link).sort().join('\0') !==
        [...chainKeys].sort().join('\0') ||
      !Number.isSafeInteger(link.pid) ||
      link.pid <= 0 ||
      visited.has(link.pid) ||
      !Number.isSafeInteger(link.userId) ||
      link.userId < 0 ||
      typeof link.startToken !== 'string' ||
      !/^(?:0|[1-9][0-9]*)$/u.test(link.startToken) ||
      !Number.isSafeInteger(Number(link.startToken)) ||
      typeof link.comm !== 'string' ||
      link.comm.length === 0 ||
      link.comm.length > 4096 ||
      !Number.isSafeInteger(link.parentPid) ||
      link.parentPid < 0 ||
      !Number.isSafeInteger(link.processGroupId) ||
      link.processGroupId <= 0 ||
      !/^[RSDTtWKPI]$/u.test(link.state)
    ) {
      fail(`process ${entry.pid} Harness ancestor chain is invalid`);
    }
    visited.add(link.pid);
    const next = chain[index + 1];
    if (
      (next === undefined && link.parentPid !== 0) ||
      (next !== undefined && link.parentPid !== next.pid)
    ) {
      fail(`process ${entry.pid} Harness ancestor chain relation is invalid`);
    }
  }
  const first = chain[0];
  if (
    first.pid !== anchor.pid ||
    first.userId !== anchor.userId ||
    first.startToken !== anchor.startToken ||
    first.comm !== anchor.comm
  ) {
    fail(`process ${entry.pid} Harness ancestor anchor is not chain-bound`);
  }
  const candidate = chain
    .slice(1)
    .find((link) => link.pid === entry.pid);
  if (
    candidate === undefined ||
    candidate.userId !== entry.userId ||
    candidate.userId !== anchor.userId ||
    candidate.startToken !== entry.startToken ||
    candidate.comm !== entry.comm ||
    candidate.parentPid !== entry.parentPid ||
    candidate.processGroupId !== entry.processGroupId ||
    !/^[RSDTtWKPI]$/u.test(entry.state)
  ) {
    fail(`process ${entry.pid} Harness ancestor candidate is not chain-bound`);
  }
}

function processIdentityKey(entry) {
  if (isTerminalProcessEntry(entry)) {
    return [
      'terminal',
      entry.pid,
      entry.userId,
      entry.startToken,
      entry.comm,
      entry.state,
      entry.parentPid,
      entry.processGroupId,
    ].join('\0');
  }
  if (isOpaqueProcessEntry(entry)) {
    const fields = [
      'opaque',
      entry.pid,
      entry.userId,
      entry.startToken,
      entry.comm,
      entry.reason,
    ];
    if (entry.reason === 'harness-ancestor-permission-denied') {
      assertHarnessAncestorOpaqueIdentity(entry);
      fields.push(
        entry.harnessAnchor.pid,
        entry.harnessAnchor.userId,
        entry.harnessAnchor.startToken,
        entry.harnessAnchor.comm,
      );
    }
    return fields.join('\0');
  }
  if (!isLiveProcessEntry(entry)) {
    fail(`process ${entry?.pid ?? 'unknown'} inventory kind is invalid`);
  }
  return `${entry.pid}\0${entry.userId}\0${entry.startToken}\0${entry.command}`;
}

export function sameProcessIdentity(left, right) {
  if (isOpaqueProcessEntry(left) || isOpaqueProcessEntry(right)) {
    return false;
  }
  if (isTerminalProcessEntry(left) || isTerminalProcessEntry(right)) {
    return (
      isTerminalProcessEntry(left) &&
      isTerminalProcessEntry(right) &&
      sameProcessGeneration(left, right)
    );
  }
  if (!isLiveProcessEntry(left) || !isLiveProcessEntry(right)) {
    return false;
  }
  return (
    left?.pid === right?.pid &&
    left?.userId === right?.userId &&
    left?.startToken === right?.startToken &&
    left?.command === right?.command
  );
}

export function sameProcessArguments(left, right) {
  if (
    isTerminalProcessEntry(left) ||
    isTerminalProcessEntry(right) ||
    isOpaqueProcessEntry(left) ||
    isOpaqueProcessEntry(right)
  ) {
    return false;
  }
  if (left?.argv === undefined && right?.argv === undefined) return true;
  return (
    Array.isArray(left?.argv) &&
    Array.isArray(right?.argv) &&
    left.argv.length === right.argv.length &&
    left.argv.every((argument, index) => argument === right.argv[index])
  );
}

export function newHostProcesses(before, after) {
  if (!Array.isArray(before?.entries) || !Array.isArray(after?.entries)) {
    fail('host process inventory entries are absent');
  }
  const existing = new Set(before.entries.map(processIdentityKey));
  return Object.freeze(
    after.entries.filter((entry) => !existing.has(processIdentityKey(entry))),
  );
}

function containedPath(root, candidate, platform) {
  const pathImplementation = platform === 'linux' ? path.posix : path;
  const relative = pathImplementation.relative(root, candidate);
  return (
    relative === '' ||
    (
      relative !== '..' &&
      !relative.startsWith(`..${pathImplementation.sep}`) &&
      !pathImplementation.isAbsolute(relative)
    )
  );
}

export function snapshotOwnedCwdProcesses(runRoot, options = {}) {
  const runtime = processInventoryRuntime(options);
  if (runtime.platform === 'win32') {
    fail('owned cwd process inventory is not implemented on Windows');
  }
  const canonicalRoot = runtime.fileSystem.realpathSync.native(runRoot);
  if (runtime.platform === 'linux') {
    return Object.freeze(
      snapshotHostProcessInventory(options).entries.filter(
        (entry) =>
          isLiveProcessEntry(entry) &&
          entry.pid !== process.pid &&
          containedPath(canonicalRoot, entry.cwd, runtime.platform),
      ),
    );
  }
  const result = runtime.spawnProcessSync(
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
      timeout: runtime.timeoutMs,
    },
  );
  if (result.error || result.status !== 0) {
    fail(`owned cwd process inventory failed: ${result.error?.message ?? result.status}`);
  }
  const entries = [];
  const processTable = new Map(
    snapshotHostProcessInventory(options).entries.map((entry) => [entry.pid, entry]),
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
  if ([...before, ...after].some(isOpaqueProcessEntry)) {
    fail('owned cwd process inventories cannot contain opaque evidence');
  }
  const key = (entry) => `${processIdentityKey(entry)}\0${entry.cwd}`;
  const existing = new Set(before.map(key));
  return Object.freeze(after.filter((entry) => !existing.has(key(entry))));
}

export function completeProcessCommand(pid, options = {}) {
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    fail('complete process command PID is invalid');
  }
  const runtime = processInventoryRuntime(options);
  if (runtime.platform === 'win32') {
    fail('complete process command is not implemented on Windows');
  }
  if (runtime.platform === 'linux') {
    const entry = readLinuxProcessEntry(runtime, pid);
    if (entry === null) return null;
    if (isTerminalProcessEntry(entry)) {
      fail(`process ${pid} is terminal without a complete command identity`);
    }
    if (isOpaqueProcessEntry(entry)) {
      fail(`process ${pid} is opaque without a complete command identity`);
    }
    return Object.freeze({
      argv: entry.argv,
      kind: 'argv',
    });
  }
  const result = runtime.spawnProcessSync(
    '/bin/ps',
    ['-ww', '-p', String(pid), '-o', 'command='],
    {
      encoding: 'utf8',
      env: {
        LANG: 'C',
        LC_ALL: 'C',
        PATH: '/usr/bin:/bin',
      },
      maxBuffer: PROCESS_CMDLINE_MAX_BYTES,
      timeout: Math.min(runtime.timeoutMs, 5_000),
    },
  );
  if (result.status === 1 && result.stdout.trim() === '') return null;
  if (result.error || result.status !== 0) {
    fail(`complete process command failed: ${result.error?.message ?? result.status}`);
  }
  return Object.freeze({
    kind: 'text',
    text: result.stdout.trim(),
  });
}

export function completeProcessCommandMatches(observed, expectedArgv) {
  if (
    !Array.isArray(expectedArgv) ||
    expectedArgv.length === 0 ||
    expectedArgv.some(
      (argument) => typeof argument !== 'string' || argument.includes('\0'),
    )
  ) {
    fail('expected complete process command must be a closed argv');
  }
  if (observed?.kind === 'argv') {
    return sameProcessArguments(observed, { argv: expectedArgv });
  }
  if (observed?.kind === 'text') {
    return observed.text === expectedArgv.join(' ');
  }
  return false;
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

function signalTrustedCommandChild(child, processGroupId, signal) {
  if (process.platform !== 'linux') {
    signalProcessGroup(child, processGroupId, signal);
    return;
  }
  try {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill(signal);
    }
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
  }
}

function waitForTrustedChildClose(child, timeoutMs) {
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

function sameOwnedProcess(left, right) {
  return (
    isLiveProcessEntry(left) &&
    isLiveProcessEntry(right) &&
    sameProcessIdentity(left, right) &&
    sameProcessArguments(left, right)
  );
}

function sameTerminalTombstone(left, right) {
  return (
    isTerminalProcessEntry(left) &&
    isTerminalProcessEntry(right) &&
    sameProcessGeneration(left, right) &&
    left.state === right.state &&
    left.parentPid === right.parentPid &&
    left.processGroupId === right.processGroupId
  );
}

function ownedTerminalTombstone(entry) {
  return isTerminalProcessEntry(entry)
    ? entry
    : entry?.terminalTombstone ?? null;
}

function retainOwnedTerminal(liveEntry, tombstone) {
  if (!sameProcessGeneration(liveEntry, tombstone)) {
    fail(`process ${tombstone.pid} generation changed in the owned closure`);
  }
  return Object.freeze({
    ...liveEntry,
    terminalTombstone: tombstone,
  });
}

function mergeOwnedProcessRecord(existing, observed) {
  if (
    isTerminalProcessEntry(existing) ||
    isTerminalProcessEntry(observed) ||
    isOpaqueProcessEntry(existing) ||
    isOpaqueProcessEntry(observed) ||
    existing?.ambiguousOwnedTerminal === true ||
    observed?.ambiguousOwnedTerminal === true ||
    existing?.ambiguousOwnedOpaque === true ||
    observed?.ambiguousOwnedOpaque === true ||
    !sameOwnedProcess(existing, observed)
  ) {
    fail(`process ${observed?.pid ?? existing?.pid} identity changed in owned evidence`);
  }
  const existingTerminal = ownedTerminalTombstone(existing);
  const observedTerminal = ownedTerminalTombstone(observed);
  if (existingTerminal !== null && observedTerminal !== null) {
    if (!sameTerminalTombstone(existingTerminal, observedTerminal)) {
      fail(`process ${observed.pid} terminal evidence changed`);
    }
    return existing;
  }
  if (existingTerminal !== null) {
    fail(`process ${observed.pid} returned to live state after terminal evidence`);
  }
  if (observedTerminal !== null) return observed;
  return observed;
}

function retainedParentMatchesCurrent(parent, currentParent) {
  const terminal = ownedTerminalTombstone(parent);
  if (terminal !== null) {
    return sameTerminalTombstone(terminal, currentParent);
  }
  return (
    sameOwnedProcess(parent, currentParent) ||
    (
      isTerminalProcessEntry(currentParent) &&
      sameProcessGeneration(parent, currentParent)
    )
  );
}

export function reconcileProcessClosure(
  ledger,
  processGroupId,
  entries,
) {
  if (!(ledger instanceof Map)) fail('process closure ledger must be a Map');
  if (!Number.isSafeInteger(processGroupId) || processGroupId <= 0) {
    fail('process closure requires a positive process group');
  }
  if (!Array.isArray(entries)) {
    fail('process closure inventory entries must be an array');
  }
  const byPid = new Map(entries.map((entry) => [entry.pid, entry]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const entry of entries) {
      const known = ledger.get(entry.pid);
      if (known) {
        if (known.ambiguousOwnedTerminal === true) {
          fail(`process ${entry.pid} has ambiguous terminal ownership`);
        }
        if (known.ambiguousOwnedOpaque === true) {
          fail(`process ${entry.pid} has ambiguous opaque ownership`);
        }
        if (isOpaqueProcessEntry(entry)) {
          fail(`process ${entry.pid} became opaque in the owned closure`);
        }
        const retainedTerminal = ownedTerminalTombstone(known);
        if (retainedTerminal !== null) {
          if (!sameTerminalTombstone(retainedTerminal, entry)) {
            fail(`process ${entry.pid} terminal generation changed in the owned closure`);
          }
          continue;
        }
        if (isTerminalProcessEntry(entry)) {
          ledger.set(entry.pid, retainOwnedTerminal(known, entry));
          continue;
        }
        if (!sameOwnedProcess(known, entry)) {
          fail(`process ${entry.pid} identity changed in the owned closure`);
        }
        if (
          known.parentPid !== entry.parentPid ||
          known.processGroupId !== entry.processGroupId
        ) {
          ledger.set(entry.pid, entry);
        }
        continue;
      }
      if (entry.pid === process.pid) continue;
      const parent = ledger.get(entry.parentPid);
      const currentParent = byPid.get(entry.parentPid);
      const relationOwned =
        entry.processGroupId === processGroupId ||
        (
          parent &&
          currentParent &&
          retainedParentMatchesCurrent(parent, currentParent)
        );
      if (!relationOwned) continue;
      if (isOpaqueProcessEntry(entry)) {
        ledger.set(
          entry.pid,
          Object.freeze({
            ambiguousOwnedOpaque: true,
            ...entry,
          }),
        );
        fail(`process ${entry.pid} was first observed as owned opaque evidence`);
      }
      if (isTerminalProcessEntry(entry)) {
        ledger.set(
          entry.pid,
          Object.freeze({
            ambiguousOwnedTerminal: true,
            ...entry,
          }),
        );
        fail(`process ${entry.pid} was first observed as an owned terminal`);
      }
      ledger.set(entry.pid, entry);
      changed = true;
    }
  }
  return ledger;
}

function discoverProcessClosure(
  ledger,
  processGroupId,
  processInventoryOptions = {},
) {
  const inventory = snapshotHostProcessInventory(processInventoryOptions);
  reconcileProcessClosure(ledger, processGroupId, inventory.entries);
  return inventory;
}

export async function createProcessClosureMonitor(
  processInventoryOptions = {},
) {
  const runtime = processInventoryRuntime(processInventoryOptions);
  sealCanonicalLinuxProcessBaseline();
  if (runtime.syntheticProcessBaselineMode === 'capture') {
    fail('closure worker cannot capture a synthetic process baseline');
  }
  const processBaseline =
    runtime.platform === 'linux' && runtime.procRoot === '/proc'
      ? resolveCanonicalLinuxProcessBaseline(runtime)
      : null;
  let expectedHarnessAnchor = null;
  if (
    runtime.platform === 'linux' &&
    (
      runtime.procRoot === '/proc' ||
      processInventoryOptions.currentProcessId !== undefined ||
      runtime.expectedHarnessAnchor !== null
    )
  ) {
    expectedHarnessAnchor = readStableLinuxHarnessAnchor(runtime);
    assertExpectedLinuxHarnessAnchor(runtime, expectedHarnessAnchor);
  }
  const worker = new Worker(
    new URL('./process-closure-worker.mjs', import.meta.url),
    {
      type: 'module',
      workerData: {
        processInventoryOptions: {
          ...(runtime.platform === 'linux'
            ? {
                currentProcessId: runtime.currentProcessId,
                currentUserId: runtime.currentUserId,
                ...(expectedHarnessAnchor === null
                  ? {}
                  : { expectedHarnessAnchor }),
                ...(processBaseline === null
                  ? {}
                  : {
                      [TRANSFERRED_PROCESS_BASELINE_ENTRIES]:
                        processBaseline.entries,
                      [TRANSFERRED_PROCESS_BASELINE_DIGEST]:
                        processBaseline.digest,
                    }),
              }
            : {}),
          platform: runtime.platform,
          procRoot: runtime.procRoot,
          ...(runtime.syntheticProcessBaseline === null
            ? {}
            : {
                [SYNTHETIC_PROCESS_BASELINE]:
                  runtime.syntheticProcessBaseline,
              }),
          ...(runtime.syntheticPermissionDeniedPaths === null
            ? {}
            : {
                [SYNTHETIC_PERMISSION_DENIED_PATHS]:
                  runtime.syntheticPermissionDeniedPaths,
              }),
          timeoutMs: Math.min(runtime.timeoutMs, 5_000),
        },
      },
    },
  );
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('process closure worker startup timed out')),
      5_000,
    );
    const cleanup = () => {
      clearTimeout(timer);
      worker.off('error', onError);
      worker.off('message', onMessage);
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onMessage = (message) => {
      cleanup();
      if (message?.type === 'ready') resolve();
      else reject(new Error('process closure worker did not become ready'));
    };
    worker.once('error', onError);
    worker.once('message', onMessage);
  }).catch(async (error) => {
    await worker.terminate();
    throw error;
  });
  const state = { failure: null, started: false, starting: false };
  worker.on('message', (message) => {
    if (message?.type === 'failure' && state.failure === null) {
      state.failure = new Error(message.message);
    }
  });
  worker.on('error', (error) => {
    state.failure ??= error;
  });
  PROCESS_CLOSURE_MONITOR_STATES.set(worker, state);
  return worker;
}

export async function startProcessClosureMonitor(worker, processGroupId) {
  if (!Number.isSafeInteger(processGroupId) || processGroupId <= 0) {
    fail('process closure worker start requires a positive process group');
  }
  const state = PROCESS_CLOSURE_MONITOR_STATES.get(worker);
  if (state === undefined || state.started || state.starting) {
    fail('process closure worker is not available for start');
  }
  if (state.failure) throw state.failure;
  state.starting = true;
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('process closure worker start timed out')),
        5_000,
      );
      const cleanup = () => {
        clearTimeout(timer);
        worker.off('error', onError);
        worker.off('message', onMessage);
      };
      const onError = (error) => {
        cleanup();
        reject(error);
      };
      const onMessage = (message) => {
        if (message?.type === 'started') {
          cleanup();
          resolve();
        } else if (message?.type === 'failure') {
          cleanup();
          reject(new Error(message.message));
        }
      };
      worker.once('error', onError);
      worker.on('message', onMessage);
      try {
        worker.postMessage({ type: 'start', processGroupId });
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
    state.started = true;
  } finally {
    state.starting = false;
  }
}

export async function stopProcessClosureMonitor(worker) {
  return new Promise((resolve, reject) => {
    const state = PROCESS_CLOSURE_MONITOR_STATES.get(worker);
    if (state?.failure) {
      reject(state.failure);
      return;
    }
    const timer = setTimeout(
      () => reject(new Error('process closure worker stop timed out')),
      5_000,
    );
    const cleanup = () => {
      clearTimeout(timer);
      worker.off('error', onError);
      worker.off('message', onMessage);
    };
    const onMessage = (message) => {
      if (message?.type === 'stopped') {
        cleanup();
        resolve(message.entries);
      } else if (message?.type === 'failure') {
        cleanup();
        reject(new Error(message.message));
      }
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    worker.once('error', onError);
    worker.on('message', onMessage);
    worker.postMessage({ type: 'stop' });
  }).finally(async () => {
    PROCESS_CLOSURE_MONITOR_STATES.delete(worker);
    await worker.terminate();
  });
}

export async function terminateOwnedProcesses(
  processes,
  gracefulStopMs,
  options = {},
) {
  if (!Array.isArray(processes)) fail('owned process cleanup requires an array');
  if (
    options === null ||
    typeof options !== 'object' ||
    Array.isArray(options)
  ) {
    fail('owned process cleanup options must be an object');
  }
  const inventoryOptions = options.inventoryOptions ?? {};
  const inventoryRuntime = processInventoryRuntime(inventoryOptions);
  const killProcess = options.killProcess ?? process.kill.bind(process);
  if (typeof killProcess !== 'function') {
    fail('owned process cleanup signal dependency is invalid');
  }
  const expectedByPid = new Map();
  const retainedTerminalByPid = new Map();
  for (const entry of processes) {
    if (
      !Number.isSafeInteger(entry?.pid) ||
      entry.pid <= 0 ||
      expectedByPid.has(entry.pid)
    ) {
      fail('owned process cleanup contains an invalid or duplicate PID');
    }
    if (
      isTerminalProcessEntry(entry) ||
      isOpaqueProcessEntry(entry) ||
      entry.ambiguousOwnedTerminal === true ||
      entry.ambiguousOwnedOpaque === true
    ) {
      fail('owned process cleanup lacks a complete signal identity');
    }
    if (
      inventoryRuntime.platform === 'linux' &&
      (
        !Number.isSafeInteger(entry.processGroupId) ||
        entry.processGroupId <= 0
      )
    ) {
      fail('owned process cleanup requires a positive process group');
    }
    expectedByPid.set(entry.pid, entry);
    if (entry.terminalTombstone !== undefined) {
      if (
        !isTerminalProcessEntry(entry.terminalTombstone) ||
        !sameProcessGeneration(entry, entry.terminalTombstone)
      ) {
        fail('owned process cleanup terminal evidence is invalid');
      }
      if (
        inventoryRuntime.platform === 'linux' &&
        (
          !Number.isSafeInteger(
            entry.terminalTombstone.processGroupId,
          ) ||
          entry.terminalTombstone.processGroupId <= 0
        )
      ) {
        fail(
          'owned process cleanup terminal evidence requires a positive process group',
        );
      }
      retainedTerminalByPid.set(entry.pid, entry.terminalTombstone);
    }
  }
  const matching = () => {
    const byPid = new Map(
      snapshotHostProcessInventory(inventoryOptions).entries.map(
        (entry) => [entry.pid, entry],
      ),
    );
    const live = [];
    const opaque = [];
    const terminal = [];
    const mismatched = [];
    for (const entry of expectedByPid.values()) {
      let current = byPid.get(entry.pid);
      if (
        current === undefined &&
        inventoryRuntime.platform === 'linux'
      ) {
        current = readTargetedLinuxProcessAfterMapMiss(
          inventoryRuntime,
          entry.pid,
        );
      }
      if (!current) continue;
      if (isOpaqueProcessEntry(current)) {
        opaque.push(Object.freeze({ expected: entry, current }));
        continue;
      }
      const retainedTerminal = retainedTerminalByPid.get(entry.pid);
      if (retainedTerminal !== undefined) {
        if (sameTerminalTombstone(retainedTerminal, current)) {
          terminal.push(current);
        } else {
          mismatched.push(Object.freeze({ expected: entry, current }));
        }
        continue;
      }
      if (sameOwnedProcess(entry, current)) {
        live.push(current);
        continue;
      }
      if (
        isTerminalProcessEntry(current) &&
        sameProcessGeneration(entry, current)
      ) {
        retainedTerminalByPid.set(entry.pid, current);
        terminal.push(current);
        continue;
      }
      mismatched.push(Object.freeze({ expected: entry, current }));
    }
    return { live, mismatched, opaque, terminal };
  };
  const assertSafeCleanupState = (state, mismatchMessage) => {
    if (state.opaque.length > 0) {
      fail('owned process cleanup observed opaque evidence');
    }
    if (state.mismatched.length > 0) fail(mismatchMessage);
  };
  const signalFreshMatches = (candidates, signal, mismatchMessage) => {
    const candidatePids = new Set(candidates.map((entry) => entry.pid));
    const preflight = matching();
    assertSafeCleanupState(preflight, mismatchMessage);
    const preflightLive = new Map(
      preflight.live
        .filter((entry) => candidatePids.has(entry.pid))
        .map((entry) => [entry.pid, entry]),
    );
    for (const candidate of candidates) {
      if (!preflightLive.has(candidate.pid)) continue;
      const fresh = matching();
      assertSafeCleanupState(fresh, mismatchMessage);
      const current = fresh.live.find(
        (entry) => entry.pid === candidate.pid,
      );
      if (current === undefined) continue;
      if (!sameOwnedProcess(candidate, current)) fail(mismatchMessage);
      try {
        killProcess(current.pid, signal);
      } catch (error) {
        if (error?.code !== 'ESRCH') throw error;
      }
    }
  };
  let state = matching();
  assertSafeCleanupState(
    state,
    'owned process PID identity or argv changed before cleanup',
  );
  const initial = Object.freeze([...state.live, ...state.terminal]);
  if (initial.length === 0) return Object.freeze([]);
  signalFreshMatches(
    state.live,
    'SIGTERM',
    'owned process PID identity or argv changed before SIGTERM',
  );
  const started = performance.now();
  let remaining = initial;
  while (performance.now() - started < gracefulStopMs) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    state = matching();
    assertSafeCleanupState(
      state,
      'owned process PID identity or argv changed during graceful cleanup',
    );
    remaining = [...state.live, ...state.terminal];
    if (remaining.length === 0) return Object.freeze(initial);
  }
  state = matching();
  assertSafeCleanupState(
    state,
    'owned process PID identity or argv changed before SIGKILL',
  );
  remaining = [...state.live, ...state.terminal];
  if (remaining.length === 0) return Object.freeze(initial);
  signalFreshMatches(
    state.live,
    'SIGKILL',
    'owned process PID identity or argv changed before SIGKILL',
  );
  const forcedStarted = performance.now();
  while (performance.now() - forcedStarted < Math.max(250, gracefulStopMs)) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    state = matching();
    assertSafeCleanupState(
      state,
      'owned process PID identity or argv changed during forced cleanup',
    );
    remaining = [...state.live, ...state.terminal];
    if (remaining.length === 0) return Object.freeze(initial);
  }
  if (state.terminal.length > 0) {
    fail('run-owned terminal processes survived bounded cleanup');
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
  processInventoryOptions = {},
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
  const commandInventoryRuntime =
    processInventoryRuntime(processInventoryOptions);
  sealCanonicalLinuxProcessBaseline();
  if (
    commandInventoryRuntime.platform === 'linux' &&
    commandInventoryRuntime.procRoot === '/proc'
  ) {
    resolveCanonicalLinuxProcessBaseline(commandInventoryRuntime);
  }
  const ownedCwdBefore = snapshotOwnedCwdProcesses(
    runRoot,
    processInventoryOptions,
  );
  const processMonitor = await createProcessClosureMonitor(
    processInventoryOptions,
  );
  let child;
  try {
    child = spawn(executable, args, {
      cwd,
      env: environment,
      detached: process.platform !== 'win32',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    await processMonitor.terminate();
    throw error;
  }
  const processGroupId = child.pid;
  child.stdout.on('data', (chunk) => appendBounded(stdoutState, chunk));
  child.stderr.on('data', (chunk) => appendBounded(stderrState, chunk));
  const processLedger = new Map();
  let ledgerFailure = null;
  let forceTimer;
  let stopRequested = false;
  const validProcessGroup =
    Number.isSafeInteger(processGroupId) && processGroupId > 0;
  const requestStop = () => {
    if (stopRequested) return;
    stopRequested = true;
    if (validProcessGroup) {
      signalTrustedCommandChild(child, processGroupId, 'SIGTERM');
    } else {
      child.kill('SIGKILL');
      return;
    }
    forceTimer = setTimeout(
      () => signalTrustedCommandChild(child, processGroupId, 'SIGKILL'),
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
  const outcomePromise = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (status, signal) => resolve({ status, signal }));
  });
  try {
    registerOwnedChildProcess(child, {
      detached: process.platform === 'darwin',
    });
    if (!validProcessGroup) {
      fail(`command ${id} did not receive a valid process-group identity`);
    }
    await startProcessClosureMonitor(processMonitor, processGroupId);
    discoverProcessClosure(
      processLedger,
      processGroupId,
      processInventoryOptions,
    );
    discoverProcessClosure(
      processLedger,
      processGroupId,
      processInventoryOptions,
    );
  } catch (error) {
    ledgerFailure ??= error;
    requestStop();
  }
  let outcome;
  try {
    outcome = await outcomePromise;
  } catch (error) {
    requestStop();
    if (process.platform === 'linux') {
      const closeBudget =
        gracefulStopMs + Math.max(250, Math.min(2_000, gracefulStopMs));
      if (!(await waitForTrustedChildClose(child, closeBudget))) {
        try {
          signalTrustedCommandChild(child, processGroupId, 'SIGKILL');
          await waitForTrustedChildClose(
            child,
            Math.max(250, Math.min(2_000, gracefulStopMs)),
          );
        } catch {
          // Preserve the child-process error; the ledger remains authoritative.
        }
      }
    }
    try {
      for (const entry of await stopProcessClosureMonitor(processMonitor)) {
        const known = processLedger.get(entry.pid);
        processLedger.set(
          entry.pid,
          known ? mergeOwnedProcessRecord(known, entry) : entry,
        );
      }
    } catch {
      // Preserve the child-process error while retaining fail-closed cleanup.
    }
    if (
      process.platform !== 'linux' &&
      validProcessGroup &&
      processGroupExists(processGroupId)
    ) {
      try {
        await terminateProcessGroup(child, processGroupId, gracefulStopMs);
      } catch {
        // Preserve the child-process error; terminal residue remains visible.
      }
    }
    try {
      await terminateOwnedProcesses(
        [...processLedger.values()].filter(
          (entry) => entry.pid !== processGroupId,
        ),
        gracefulStopMs,
        { inventoryOptions: processInventoryOptions },
      );
    } catch {
      // Preserve the child-process error without risking a foreign signal.
    }
    throw error;
  } finally {
    clearTimeout(timer);
    clearTimeout(forceTimer);
    effectiveSignal?.removeEventListener('abort', onAbort);
  }
  try {
    discoverProcessClosure(
      processLedger,
      processGroupId,
      processInventoryOptions,
    );
  } catch (error) {
    ledgerFailure ??= error;
  }
  try {
    for (const entry of await stopProcessClosureMonitor(processMonitor)) {
      const known = processLedger.get(entry.pid);
      processLedger.set(
        entry.pid,
        known
          ? mergeOwnedProcessRecord(known, entry)
          : Object.freeze(entry),
      );
    }
  } catch (error) {
    ledgerFailure ??= error;
  }
  let descendantResidue = false;
  if (process.platform !== 'linux') {
    try {
      descendantResidue = processGroupExists(processGroupId);
      if (descendantResidue) {
        await terminateProcessGroup(child, processGroupId, gracefulStopMs);
      }
    } catch (error) {
      ledgerFailure ??= error;
    }
  }
  let ownedCwdResidue = [];
  try {
    ownedCwdResidue = newOwnedCwdProcesses(
      ownedCwdBefore,
      snapshotOwnedCwdProcesses(runRoot, processInventoryOptions),
    );
  } catch (error) {
    ledgerFailure ??= error;
  }
  for (const entry of ownedCwdResidue) {
    const known = processLedger.get(entry.pid);
    try {
      if (known) {
        processLedger.set(
          entry.pid,
          mergeOwnedProcessRecord(known, entry),
        );
      } else {
        processLedger.set(entry.pid, entry);
      }
    } catch (error) {
      ledgerFailure ??= error;
      continue;
    }
  }
  const ledgerResidue = [...processLedger.values()].filter(
    (entry) => entry.pid !== processGroupId,
  );
  let initiallyPresentLedgerResidue = [];
  try {
    initiallyPresentLedgerResidue = await terminateOwnedProcesses(
      ledgerResidue,
      gracefulStopMs,
      {
        inventoryOptions: processInventoryOptions,
      },
    );
  } catch (error) {
    ledgerFailure ??= error;
  }
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
  if (descendantResidue || initiallyPresentLedgerResidue.length > 0) {
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
