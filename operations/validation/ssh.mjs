import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { deepFreeze } from '../lib/canonical-json.mjs';
import { requireCanonicalPath } from '../lib/path-policy.mjs';
import { HOST_ALIAS, MAXIMUMS, REMOTE_ROOT } from './constants.mjs';

const activeTerminators = new Set();

export function terminateActiveSshProcesses(reason = 'controller-signal') {
  for (const terminate of [...activeTerminators]) {
    terminate(reason);
  }
}

export class ValidationSshError extends Error {
  constructor(message, result, options) {
    super(message, options);
    this.name = 'ValidationSshError';
    this.result = result;
  }
}

function fail(message, result, cause) {
  throw new ValidationSshError(
    message,
    result,
    cause ? { cause } : undefined,
  );
}

function executable(name) {
  const fixed = [`/usr/bin/${name}`, `/bin/${name}`].find((candidate) => {
    try {
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
  if (!fixed) fail(`required local ${name} executable is unavailable`);
  return requireCanonicalPath(fixed, {
    label: `${name} executable`,
    type: 'file',
  });
}

function sshFiles() {
  const home = os.homedir();
  if (!path.isAbsolute(home) || home === '/') {
    fail('local SSH home is not an admitted absolute path');
  }
  const config = requireCanonicalPath(path.join(home, '.ssh', 'config'), {
    label: 'SSH config',
    requireSingleLink: true,
    type: 'file',
  });
  const knownHosts = requireCanonicalPath(
    path.join(home, '.ssh', 'known_hosts'),
    {
      label: 'SSH known-hosts file',
      requireSingleLink: true,
      type: 'file',
    },
  );
  return { config, home, knownHosts };
}

function environment(home) {
  const result = {
    HOME: home,
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    NO_COLOR: '1',
    PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
    TZ: 'UTC',
  };
  if (
    typeof process.env.SSH_AUTH_SOCK === 'string' &&
    process.env.SSH_AUTH_SOCK.startsWith('/') &&
    !process.env.SSH_AUTH_SOCK.includes('\0')
  ) {
    result.SSH_AUTH_SOCK = process.env.SSH_AUTH_SOCK;
  }
  return result;
}

function connectionArguments({ config, knownHosts }) {
  return [
    '-F',
    config,
    '-o',
    'BatchMode=yes',
    '-o',
    'ClearAllForwardings=yes',
    '-o',
    'ConnectTimeout=15',
    '-o',
    'ControlMaster=no',
    '-o',
    'ForwardAgent=no',
    '-o',
    'LogLevel=ERROR',
    '-o',
    'PermitLocalCommand=no',
    '-o',
    'RequestTTY=no',
    '-o',
    'StrictHostKeyChecking=yes',
    '-o',
    `UserKnownHostsFile=${knownHosts}`,
  ];
}

function appendBounded(state, chunk) {
  if (state.bytes >= state.limit) {
    state.truncated = true;
    return;
  }
  const remaining = state.limit - state.bytes;
  const accepted =
    chunk.length <= remaining ? chunk : chunk.subarray(0, remaining);
  state.chunks.push(accepted);
  state.bytes += accepted.length;
  if (accepted.length !== chunk.length) state.truncated = true;
}

async function boundedSpawn({
  args,
  command,
  input,
  inputFile,
  timeoutMs,
  maxOutputBytes = MAXIMUMS.commandOutputBytes,
}) {
  if (
    !Array.isArray(args) ||
    args.some(
      (entry) =>
        typeof entry !== 'string' ||
        entry.length === 0 ||
        entry.length > 32_768 ||
        entry.includes('\0'),
    )
  ) {
    throw new TypeError('SSH arguments must be bounded closed text');
  }
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > MAXIMUMS.remoteRunMs
  ) {
    throw new TypeError('SSH timeout is outside the admitted bound');
  }
  if (input !== undefined && inputFile !== undefined) {
    throw new TypeError('SSH process cannot have two input authorities');
  }
  const { home } = sshFiles();
  const stdin = input === undefined ? null : Buffer.from(input);
  if (stdin && stdin.length > 1024 * 1024) {
    throw new TypeError('SSH control input exceeds its one-megabyte bound');
  }
  let streamedInput = null;
  if (inputFile !== undefined) {
    const sourcePath = requireCanonicalPath(inputFile, {
      label: 'validation streamed transfer source',
      requireSingleLink: true,
      type: 'file',
    });
    let descriptor;
    try {
      descriptor = fs.openSync(
        sourcePath,
        fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
      );
      const information = fs.fstatSync(descriptor);
      const pathInformation = fs.lstatSync(sourcePath);
      if (
        !information.isFile() ||
        pathInformation.isSymbolicLink() ||
        !pathInformation.isFile() ||
        information.dev !== pathInformation.dev ||
        information.ino !== pathInformation.ino ||
        information.nlink !== 1 ||
        pathInformation.nlink !== 1 ||
        information.size < 1 ||
        information.size > MAXIMUMS.transferFileBytes
      ) {
        throw new TypeError('validation streamed transfer source is unsafe');
      }
      streamedInput = { descriptor, sourcePath };
    } catch (error) {
      if (descriptor !== undefined) fs.closeSync(descriptor);
      throw error;
    }
  }

  return await new Promise((resolve, reject) => {
    const started = performance.now();
    const stdout = {
      bytes: 0,
      chunks: [],
      limit: maxOutputBytes,
      truncated: false,
    };
    const stderr = {
      bytes: 0,
      chunks: [],
      limit: maxOutputBytes,
      truncated: false,
    };
    let child;
    let settled = false;
    let terminationReason = null;
    let killTimer;
    let inputError = null;

    function result(code, signal) {
      return deepFreeze({
        args,
        durationMs: Math.round(performance.now() - started),
        exitCode: code,
        signal,
        stderr: Buffer.concat(stderr.chunks).toString('utf8'),
        stderrTruncated: stderr.truncated,
        stdout: Buffer.concat(stdout.chunks).toString('utf8'),
        stdoutTruncated: stdout.truncated,
        terminationReason,
      });
    }

    function terminate(reason) {
      if (terminationReason !== null || !child) return;
      terminationReason = reason;
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        try {
          child.kill('SIGTERM');
        } catch {}
      }
      killTimer = setTimeout(() => {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          try {
            child.kill('SIGKILL');
          } catch {}
        }
      }, MAXIMUMS.remoteStopMs);
      killTimer.unref();
    }

    try {
      child = spawn(command, args, {
        detached: true,
        env: environment(home),
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (error) {
      if (streamedInput) fs.closeSync(streamedInput.descriptor);
      reject(
        new ValidationSshError('SSH process could not be spawned', undefined, {
          cause: error,
        }),
      );
      return;
    }
    activeTerminators.add(terminate);

    const timer = setTimeout(() => terminate('timeout'), timeoutMs);
    timer.unref();
    child.stdout.on('data', (chunk) => {
      appendBounded(stdout, chunk);
      if (stdout.truncated) terminate('output-limit');
    });
    child.stderr.on('data', (chunk) => {
      appendBounded(stderr, chunk);
      if (stderr.truncated) terminate('output-limit');
    });
    child.stdin.on('error', (error) => {
      if (settled || terminationReason !== null) return;
      inputError = error;
      terminate('input-error');
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      activeTerminators.delete(terminate);
      clearTimeout(timer);
      clearTimeout(killTimer);
      reject(
        new ValidationSshError('SSH process failed', undefined, {
          cause: error,
        }),
      );
    });
    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      activeTerminators.delete(terminate);
      clearTimeout(timer);
      clearTimeout(killTimer);
      const completed = result(code, signal);
      if (
        inputError !== null ||
        code !== 0 ||
        terminationReason !== null ||
        completed.stdoutTruncated ||
        completed.stderrTruncated
      ) {
        reject(
          new ValidationSshError(
            'SSH process did not satisfy its bounded execution contract',
            completed,
          ),
        );
      } else {
        resolve(completed);
      }
    });
    if (streamedInput) {
      const source = fs.createReadStream(streamedInput.sourcePath, {
        autoClose: true,
        emitClose: true,
        fd: streamedInput.descriptor,
      });
      source.on('error', (error) => {
        if (settled || terminationReason !== null) return;
        inputError = error;
        terminate('input-error');
      });
      source.pipe(child.stdin);
    } else if (stdin) child.stdin.end(stdin);
    else child.stdin.end();
  });
}

export async function runSshScript({
  arguments: scriptArguments = [],
  script,
  timeoutMs = MAXIMUMS.sshPreflightMs,
}) {
  if (
    !Array.isArray(scriptArguments) ||
    scriptArguments.some(
      (entry) =>
        typeof entry !== 'string' || !/^[A-Za-z0-9._:-]{1,255}$/u.test(entry),
    )
  ) {
    throw new TypeError('remote script arguments are not closed identifiers');
  }
  const files = sshFiles();
  const command = executable('ssh');
  const remoteCommand = [
    '/usr/bin/bash',
    '-s',
    '--',
    ...scriptArguments,
  ].join(' ');
  return await boundedSpawn({
    args: [
      ...connectionArguments(files),
      '--',
      HOST_ALIAS,
      remoteCommand,
    ],
    command,
    input: script,
    timeoutMs,
  });
}

const authenticatedReceiver = [
    "/usr/bin/bash -c '",
    'set -Eeuo pipefail; ',
    `marker=${REMOTE_ROOT}/.validation-owner.json; `,
    `agent=${REMOTE_ROOT}/.transfer-agent; `,
    '[[ "$3" =~ ^sha256:[0-9a-f]{64}$ && ',
    '-f "$marker" && ! -L "$marker" && ',
    '-f "$agent" && ! -L "$agent" ]]; ',
    'exec 8<"$marker"; exec 9<"$agent"; ',
    '[[ "$(stat -Lc "%d:%i:%u:%g:%h:%a:%F" /proc/self/fd/8)" == ',
    '"$(stat -Lc "%d:%i:%u:%g:%h:%a:%F" "$marker")" && ',
    '"$(stat -Lc "%u:%g:%h:%a" /proc/self/fd/8)" == "0:0:1:400" && ',
    '"$(stat -Lc "%d:%i:%u:%g:%h:%a:%F" /proc/self/fd/9)" == ',
    '"$(stat -Lc "%d:%i:%u:%g:%h:%a:%F" "$agent")" && ',
    '"$(stat -Lc "%u:%g:%h:%a" /proc/self/fd/9)" == "0:0:1:500" ]]; ',
    'marker_digest="sha256:$(sha256sum /proc/self/fd/8 | cut -d " " -f1)"; ',
    '[[ "$marker_digest" == "$3" ]]; ',
    'cmp --silent /proc/self/fd/8 <(jq -cS . /proc/self/fd/8); ',
    'expected="$(jq -er .agentDigest /proc/self/fd/8)"; ',
    'actual="sha256:$(sha256sum /proc/self/fd/9 | cut -d " " -f1)"; ',
    '[[ "$actual" == "$expected" ]]; ',
    'exec /usr/bin/bash /proc/self/fd/9 receive "$@"',
    "' --",
  ].join('');

export async function runFixedRemoteCommand({
  command: remoteCommand,
  timeoutMs = MAXIMUMS.sshPreflightMs,
}) {
  if (
    typeof remoteCommand !== 'string' ||
    remoteCommand.length === 0 ||
    remoteCommand.length > 8192 ||
    /[\0\r\n]/u.test(remoteCommand)
  ) {
    throw new TypeError('fixed remote command is not bounded one-line text');
  }
  const files = sshFiles();
  return await boundedSpawn({
    args: [
      ...connectionArguments(files),
      '--',
      HOST_ALIAS,
      remoteCommand,
    ],
    command: executable('ssh'),
    timeoutMs,
  });
}

export async function receiveFileToRemote({
  agentArguments,
  source,
}) {
  const local = requireCanonicalPath(source, {
    label: 'validation transfer source',
    requireSingleLink: true,
    type: 'file',
  });
  if (
    !Array.isArray(agentArguments) ||
    agentArguments.length !== 10 ||
    agentArguments.some(
      (entry) =>
        typeof entry !== 'string' ||
        !/^[A-Za-z0-9._:-]{1,255}$/u.test(entry),
    )
  ) {
    throw new TypeError('validation receiver arguments are not closed');
  }
  const files = sshFiles();
  return await boundedSpawn({
    args: [
      ...connectionArguments(files),
      '--',
      HOST_ALIAS,
      [
        authenticatedReceiver,
        ...agentArguments,
      ].join(' '),
    ],
    command: executable('ssh'),
    inputFile: local,
    timeoutMs: MAXIMUMS.remoteRunMs,
  });
}
