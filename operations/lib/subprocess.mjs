import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { deepFreeze } from './canonical-json.mjs';
import {
  ensureContainedDirectory,
  isStrictlyContained,
  requireCanonicalPath,
} from './path-policy.mjs';

export class SubprocessError extends Error {
  constructor(message, result, options) {
    super(message, options);
    this.name = 'SubprocessError';
    this.result = result;
  }
}

const FORBIDDEN_ENVIRONMENT_NAME =
  /(?:AUTH|COOKIE|CREDENTIAL|PASS|PRIVATE|SECRET|SSH|TOKEN)/u;
const INJECTION_ENVIRONMENT_NAME = /^(?:BASH_FUNC_|DYLD_|LD_)/u;
const ALWAYS_FORBIDDEN_ENVIRONMENT = new Set([
  'BASH_ENV',
  'BASHOPTS',
  'CDPATH',
  'DOCKER_AUTH_CONFIG',
  'ENV',
  'GIT_ASKPASS',
  'GIT_CONFIG_GLOBAL',
  'GIT_CONFIG_SYSTEM',
  'GIT_SSH',
  'GIT_SSH_COMMAND',
  'GLOBIGNORE',
  'IFS',
  'KSH_ENV',
  'LIBPATH',
  'NODE_OPTIONS',
  'NODE_PATH',
  'NPM_TOKEN',
  'PERL5OPT',
  'PS4',
  'PYTHONHOME',
  'PYTHONINSPECT',
  'PYTHONPATH',
  'PYTHONSTARTUP',
  'RUBYOPT',
  'SHELLOPTS',
  'SHLIB_PATH',
  'ZDOTDIR',
  '_RLD_LIST',
]);
const ADMITTED_ENVIRONMENTS = new WeakSet();

function isForbiddenEnvironmentName(name) {
  return (
    ALWAYS_FORBIDDEN_ENVIRONMENT.has(name) ||
    INJECTION_ENVIRONMENT_NAME.test(name) ||
    FORBIDDEN_ENVIRONMENT_NAME.test(name) ||
    name.startsWith('GIT_')
  );
}

function fail(message, result, cause) {
  throw new SubprocessError(
    message,
    result,
    cause ? { cause } : undefined,
  );
}

function boundedString(value, label, maximum = 8192) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximum ||
    value.includes('\0')
  ) {
    throw new TypeError(`${label} must be bounded non-empty text without NUL`);
  }
  return value;
}

export function buildSanitizedEnvironment({
  runRoot,
  pathEntries,
  extra = {},
  allowedExtraNames = [],
}) {
  const canonicalRun = requireCanonicalPath(runRoot, {
    label: 'subprocess run root',
    type: 'directory',
  });
  const home = ensureContainedDirectory(canonicalRun, 'home', 0o700);
  const temporary = ensureContainedDirectory(canonicalRun, 'tmp', 0o700);
  if (!Array.isArray(pathEntries) || pathEntries.length === 0) {
    throw new TypeError('subprocess PATH must contain at least one entry');
  }
  const canonicalPathEntries = pathEntries.map((entry, index) =>
    requireCanonicalPath(
      boundedString(entry, `PATH entry ${index}`, 4096),
      {
        label: `PATH entry ${index}`,
        type: 'directory',
      },
    ),
  );
  const allowed = new Set(allowedExtraNames);
  const environment = {
    CI: '1',
    HOME: home,
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    NO_COLOR: '1',
    NPM_CONFIG_AUDIT: 'false',
    NPM_CONFIG_FUND: 'false',
    NPM_CONFIG_IGNORE_SCRIPTS: 'true',
    NPM_CONFIG_UPDATE_NOTIFIER: 'false',
    PATH: canonicalPathEntries.join(path.delimiter),
    TMPDIR: temporary,
    TZ: 'UTC',
  };
  for (const [name, value] of Object.entries(extra)) {
    if (
      !/^[A-Z][A-Z0-9_]{0,63}$/u.test(name) ||
      !allowed.has(name) ||
      isForbiddenEnvironmentName(name)
    ) {
      throw new TypeError(`subprocess environment name is not admitted: ${name}`);
    }
    environment[name] = boundedString(String(value), `environment ${name}`);
  }
  const sanitized = deepFreeze(environment);
  ADMITTED_ENVIRONMENTS.add(sanitized);
  return sanitized;
}

function appendBounded(state, chunk) {
  if (!Buffer.isBuffer(chunk)) {
    throw new TypeError('subprocess output chunk must be a Buffer');
  }
  state.hash?.update(chunk);
  if (!state.truncated && state.bytes + chunk.length <= state.limit) {
    state.chunks.push(chunk);
    state.bytes += chunk.length;
    return;
  }

  if (!state.truncated) {
    const buffered = Buffer.concat(state.chunks, state.bytes);
    const headLimit = Math.floor(state.limit / 2);
    const tailLimit = state.limit - headLimit;
    if (headLimit > 0) {
      if (buffered.length >= headLimit) {
        state.head = Buffer.from(buffered.subarray(0, headLimit));
      } else {
        state.head = Buffer.concat(
          [
            buffered,
            chunk.subarray(0, headLimit - buffered.length),
          ],
          headLimit,
        );
      }
    }
    if (chunk.length >= tailLimit) {
      state.tail = Buffer.from(chunk.subarray(chunk.length - tailLimit));
    } else {
      const priorTailLength = tailLimit - chunk.length;
      state.tail = Buffer.concat(
        [
          buffered.subarray(buffered.length - priorTailLength),
          chunk,
        ],
        tailLimit,
      );
    }
    state.chunks = [];
    state.bytes = 0;
    state.truncated = true;
    return;
  }

  if (chunk.length >= state.tail.length) {
    state.tail = Buffer.from(chunk.subarray(chunk.length - state.tail.length));
    return;
  }
  state.tail = Buffer.concat(
    [
      state.tail.subarray(chunk.length),
      chunk,
    ],
    state.tail.length,
  );
}

function boundedOutputSnapshot(state) {
  if (!state.truncated) {
    const full = Buffer.concat(state.chunks, state.bytes).toString('utf8');
    return { head: full, tail: full };
  }
  return {
    head: state.head.toString('utf8'),
    tail: state.tail.toString('utf8'),
  };
}

function rawOutputDigest(state) {
  return `sha256:${state.hash.digest('hex')}`;
}

function signalProcess(child, signal) {
  try {
    if (process.platform === 'win32') {
      if (child.exitCode === null) child.kill(signal);
    } else if (child.pid) {
      process.kill(-child.pid, signal);
    }
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
  }
}

function processGroupExists(processGroupId) {
  if (process.platform === 'win32' || !processGroupId) return false;
  try {
    process.kill(-processGroupId, 0);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    if (error?.code === 'EPERM') return true;
    throw error;
  }
}

export async function runSubprocess({
  command,
  args = [],
  cwd,
  environment,
  acceptedExitCodes = [0],
  timeoutMs = 60_000,
  gracefulStopMs = 1_000,
  hashStdout = false,
  maxOutputBytes = 4 * 1024 * 1024,
  signal,
}) {
  const executable = requireCanonicalPath(command, {
    label: 'subprocess executable',
    type: 'file',
  });
  const canonicalCwd = requireCanonicalPath(cwd, {
    label: 'subprocess working directory',
    type: 'directory',
  });
  if (!Array.isArray(args)) throw new TypeError('subprocess arguments must be an array');
  const boundedArgs = args.map((entry, index) =>
    boundedString(String(entry), `subprocess argument ${index}`, 32_768),
  );
  if (
    environment === null ||
    typeof environment !== 'object' ||
    Array.isArray(environment) ||
    Object.keys(environment).length === 0
  ) {
    throw new TypeError('subprocess requires an explicit sanitized environment');
  }
  if (
    !Array.isArray(acceptedExitCodes) ||
    acceptedExitCodes.length === 0 ||
    acceptedExitCodes.some((entry) => !Number.isInteger(entry))
  ) {
    throw new TypeError('accepted subprocess exit codes are invalid');
  }
  for (const [name, value] of Object.entries(environment)) {
    if (
      !/^[A-Z][A-Z0-9_]{0,63}$/u.test(name) ||
      isForbiddenEnvironmentName(name) ||
      typeof value !== 'string' ||
      value.includes('\0')
    ) {
      throw new TypeError('subprocess environment is not closed text');
    }
  }
  if (!ADMITTED_ENVIRONMENTS.has(environment)) {
    throw new TypeError(
      'subprocess environment was not produced by buildSanitizedEnvironment',
    );
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 86_400_000) {
    throw new TypeError('subprocess timeout is outside the closed bound');
  }
  if (
    !Number.isInteger(gracefulStopMs) ||
    gracefulStopMs < 1 ||
    gracefulStopMs > 60_000
  ) {
    throw new TypeError('subprocess graceful stop bound is invalid');
  }
  if (
    !Number.isInteger(maxOutputBytes) ||
    maxOutputBytes < 1 ||
    maxOutputBytes > 64 * 1024 * 1024
  ) {
    throw new TypeError('subprocess output bound is invalid');
  }
  if (typeof hashStdout !== 'boolean') {
    throw new TypeError('subprocess stdout hash selection must be boolean');
  }

  return await new Promise((resolve, reject) => {
    const started = performance.now();
    const stdout = {
      bytes: 0,
      chunks: [],
      hash: hashStdout ? createHash('sha256') : null,
      head: Buffer.alloc(0),
      limit: maxOutputBytes,
      tail: Buffer.alloc(0),
      truncated: false,
    };
    const stderr = {
      bytes: 0,
      chunks: [],
      hash: null,
      head: Buffer.alloc(0),
      limit: maxOutputBytes,
      tail: Buffer.alloc(0),
      truncated: false,
    };
    let terminationReason = null;
    let forcedTimer;
    let settled = false;
    let child;

    function result(code, childSignal) {
      const stdoutSnapshot = boundedOutputSnapshot(stdout);
      const stderrSnapshot = boundedOutputSnapshot(stderr);
      const completed = {
        command: executable,
        args: boundedArgs,
        cwd: canonicalCwd,
        exitCode: code,
        signal: childSignal,
        terminationReason,
        durationMs: Math.round(performance.now() - started),
        stdout: stdoutSnapshot.head,
        stdoutTail: stdoutSnapshot.tail,
        stderr: stderrSnapshot.head,
        stderrTail: stderrSnapshot.tail,
        stdoutTruncated: stdout.truncated,
        stderrTruncated: stderr.truncated,
      };
      if (hashStdout) completed.stdoutSha256 = rawOutputDigest(stdout);
      return deepFreeze(completed);
    }

    function terminate(reason) {
      if (terminationReason !== null || !child) return;
      terminationReason = reason;
      try {
        signalProcess(child, 'SIGTERM');
      } catch (error) {
        settled = true;
        clearTimeout(timeout);
        signal?.removeEventListener('abort', abort);
        reject(
          new SubprocessError('subprocess termination failed', undefined, {
            cause: error,
          }),
        );
        return;
      }
      forcedTimer = setTimeout(() => {
        try {
          signalProcess(child, 'SIGKILL');
        } catch {
          // The close handler remains the single result authority.
        }
      }, gracefulStopMs);
      forcedTimer.unref();
    }

    let timeout;
    try {
      child = spawn(executable, boundedArgs, {
        cwd: canonicalCwd,
        detached: process.platform !== 'win32',
        env: { ...environment },
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (error) {
      reject(new SubprocessError('subprocess could not be spawned', undefined, {
        cause: error,
      }));
      return;
    }

    timeout = setTimeout(() => terminate('timeout'), timeoutMs);
    timeout.unref();
    const abort = () => terminate('aborted');
    if (signal) {
      if (signal.aborted) abort();
      else signal.addEventListener('abort', abort, { once: true });
    }

    child.stdout.on('data', (chunk) => {
      appendBounded(stdout, chunk);
      if (stdout.truncated) terminate('output-limit');
    });
    child.stderr.on('data', (chunk) => {
      appendBounded(stderr, chunk);
      if (stderr.truncated) terminate('output-limit');
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearTimeout(forcedTimer);
      signal?.removeEventListener('abort', abort);
      reject(new SubprocessError('subprocess emitted an execution error', undefined, {
        cause: error,
      }));
    });
    child.on('close', (code, childSignal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      try {
        if (processGroupExists(child.pid)) {
          terminationReason ??= 'process-group-leak';
          signalProcess(child, 'SIGKILL');
        }
      } catch (error) {
        clearTimeout(forcedTimer);
        reject(
          new SubprocessError('subprocess group cleanup failed', undefined, {
            cause: error,
          }),
        );
        return;
      }
      clearTimeout(forcedTimer);
      const completed = result(code, childSignal);
      if (
        terminationReason !== null ||
        !acceptedExitCodes.includes(code) ||
        completed.stdoutTruncated ||
        completed.stderrTruncated
      ) {
        try {
          fail('subprocess did not satisfy its closed execution contract', completed);
        } catch (error) {
          reject(error);
        }
        return;
      }
      resolve(completed);
    });
  });
}

export function assertWorkingDirectoryContained(cwd, runRoot) {
  const canonicalCwd = requireCanonicalPath(cwd, {
    label: 'working directory',
    type: 'directory',
  });
  const canonicalRun = requireCanonicalPath(runRoot, {
    label: 'run root',
    type: 'directory',
  });
  if (
    canonicalCwd !== canonicalRun &&
    !isStrictlyContained(canonicalCwd, canonicalRun)
  ) {
    throw new SubprocessError('working directory escapes the run root');
  }
  return canonicalCwd;
}

export function assertExecutableFile(candidate) {
  const canonical = requireCanonicalPath(candidate, {
    label: 'executable',
    type: 'file',
  });
  if ((fs.statSync(canonical).mode & 0o111) === 0) {
    throw new SubprocessError('executable has no execute bit');
  }
  return canonical;
}
