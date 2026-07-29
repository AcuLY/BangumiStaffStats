import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { sha256 } from '../../lib/digest.mjs';
import {
  cleanupRunRoot,
  createRunRoot,
} from '../../lib/run-root.mjs';
import {
  buildSanitizedEnvironment,
  runSubprocess,
  SubprocessError,
} from '../../lib/subprocess.mjs';

function subprocessFixture(t, purpose) {
  const run = createRunRoot({ purpose });
  t.after(() => cleanupRunRoot(run.runRoot));
  const pathEntries = [path.dirname(process.execPath), '/usr/local/bin', '/usr/bin', '/bin']
    .filter((entry) => fs.existsSync(entry))
    .map((entry) => fs.realpathSync.native(entry))
    .filter((entry, index, values) => values.indexOf(entry) === index);
  const environment = buildSanitizedEnvironment({
    runRoot: run.runRoot,
    pathEntries,
    extra: {
      BGMSS_TEST_VALUE: 'literal-value',
    },
    allowedExtraNames: ['BGMSS_TEST_VALUE'],
  });
  return { environment, run };
}

test('subprocess environment is explicit, sanitized, and shell-free', async (t) => {
  const { environment, run } = subprocessFixture(t, 'subprocess-env-test');
  assert.equal(Object.hasOwn(environment, 'SSH_AUTH_SOCK'), false);
  assert.equal(Object.hasOwn(environment, 'NODE_OPTIONS'), false);
  assert.equal(environment.BGMSS_TEST_VALUE, 'literal-value');
  const admittedPathEntries = environment.PATH.split(path.delimiter);
  assert.throws(
    () =>
      buildSanitizedEnvironment({
        runRoot: run.runRoot,
        pathEntries: admittedPathEntries,
        extra: { DEPLOY_TOKEN: 'canary' },
        allowedExtraNames: ['DEPLOY_TOKEN'],
    }),
    /not admitted/u,
  );
  for (const name of [
    'BASH_FUNC_COMMAND',
    'DYLD_INSERT_LIBRARIES',
    'IFS',
    'LD_PRELOAD',
  ]) {
    assert.throws(
      () =>
        buildSanitizedEnvironment({
          runRoot: run.runRoot,
          pathEntries: admittedPathEntries,
          extra: { [name]: 'injected' },
          allowedExtraNames: [name],
        }),
      /not admitted/u,
    );
  }

  const literal = '$(touch should-not-exist)';
  const result = await runSubprocess({
    command: process.execPath,
    args: ['-e', 'process.stdout.write(process.argv[1])', literal],
    cwd: run.runRoot,
    environment,
    timeoutMs: 5_000,
  });
  assert.equal(result.stdout, literal);
  assert.equal(Object.hasOwn(result, 'stdoutSha256'), false);
  assert.equal(fs.existsSync(path.join(run.runRoot, 'should-not-exist')), false);
});

test('subprocess can hash original stdout bytes without changing the default result shape', async (t) => {
  const { environment, run } = subprocessFixture(t, 'subprocess-stdout-hash-test');
  const bytes = Buffer.from([0, 255, 10, 128, 65]);
  const result = await runSubprocess({
    command: process.execPath,
    args: [
      '-e',
      'process.stdout.write(Buffer.from([0, 255, 10, 128, 65]))',
    ],
    cwd: run.runRoot,
    environment,
    hashStdout: true,
    timeoutMs: 5_000,
  });
  assert.equal(result.stdoutSha256, sha256(bytes));
});

test('subprocess hash-and-byte-count sink consumes stdout beyond 64 MiB without treating diagnostic truncation as execution failure', async (t) => {
  const { environment, run } = subprocessFixture(
    t,
    'subprocess-large-stdout-hash-test',
  );
  const chunkSize = 1024 * 1024;
  const chunkCount = 65;
  const chunk = Buffer.alloc(chunkSize, 0x61);
  const expected = Buffer.alloc(chunkSize * chunkCount, 0x61);
  const result = await runSubprocess({
    command: process.execPath,
    args: [
      '-e',
      [
        `const chunk = Buffer.alloc(${chunkSize}, 0x61);`,
        `let remaining = ${chunkCount};`,
        'function write() {',
        '  while (remaining > 0) {',
        '    remaining -= 1;',
        "    if (!process.stdout.write(chunk)) {",
        "      process.stdout.once('drain', write);",
        '      return;',
        '    }',
        '  }',
        '}',
        'write();',
      ].join('\n'),
    ],
    cwd: run.runRoot,
    environment,
    hashAndCountStdout: true,
    maxOutputBytes: 1024,
    timeoutMs: 30_000,
  });
  assert.equal(result.exitCode, 0);
  assert.equal(result.terminationReason, null);
  assert.equal(result.stdoutTruncated, true);
  assert.equal(result.stderrTruncated, false);
  assert.equal(result.stdoutByteCount, chunkSize * chunkCount);
  assert.equal(result.stdoutSha256, sha256(expected));
});

test('subprocess rejects forged and loader-injected environments', async (t) => {
  const { environment, run } = subprocessFixture(t, 'subprocess-admission-test');
  await assert.rejects(
    () =>
      runSubprocess({
        command: process.execPath,
        args: ['-e', 'process.exit(0)'],
        cwd: run.runRoot,
        environment: { ...environment },
        timeoutMs: 5_000,
      }),
    /not produced by buildSanitizedEnvironment/u,
  );
  await assert.rejects(
    () =>
      runSubprocess({
        command: process.execPath,
        args: ['-e', 'process.exit(0)'],
        cwd: run.runRoot,
        environment: {
          ...environment,
          LD_PRELOAD: '/tmp/untrusted.so',
        },
        timeoutMs: 5_000,
      }),
    /not closed text/u,
  );
});

test('subprocess timeout terminates its isolated process group', async (t) => {
  const { environment, run } = subprocessFixture(t, 'subprocess-timeout-test');
  await assert.rejects(
    () =>
      runSubprocess({
        command: process.execPath,
        args: ['-e', 'setTimeout(() => {}, 10_000)'],
        cwd: run.runRoot,
        environment,
        timeoutMs: 50,
        gracefulStopMs: 50,
      }),
    (error) =>
      error instanceof SubprocessError &&
      error.result?.terminationReason === 'timeout',
  );
});

test('subprocess output keeps bounded real tails and truncation remains a failure', async (t) => {
  const { environment, run } = subprocessFixture(t, 'subprocess-output-test');
  let captured;
  await assert.rejects(
    () =>
      runSubprocess({
        command: process.execPath,
        args: [
          '-e',
          [
            'let stopping = false;',
            'let hold;',
            "process.on('SIGTERM', () => {",
            '  if (stopping) return;',
            '  stopping = true;',
            '  clearInterval(hold);',
            "  process.stdout.write('\\nactual-stdout-tail\\n');",
            "  process.stderr.write('\\nactual-stderr-tail\\n', () => process.exit(0));",
            '});',
            "process.stdout.write('stdout-head\\n' + 'x'.repeat(4096));",
            "process.stderr.write('stderr-head\\n' + 'y'.repeat(4096));",
            'hold = setInterval(() => {}, 1_000);',
          ].join('\n'),
        ],
        cwd: run.runRoot,
        environment,
        timeoutMs: 5_000,
        gracefulStopMs: 1_000,
        maxOutputBytes: 256,
      }),
    (error) => {
      captured = error;
      return (
        error instanceof SubprocessError &&
        error.result?.terminationReason === 'output-limit' &&
        error.result.stdoutTruncated === true &&
        error.result.stderrTruncated === true
      );
    },
  );
  assert.match(captured.result.stdout, /^stdout-head/u);
  assert.equal(captured.result.stdout.includes('actual-stdout-tail'), false);
  assert.match(captured.result.stdoutTail, /actual-stdout-tail\n$/u);
  assert.match(captured.result.stderr, /^stderr-head/u);
  assert.equal(captured.result.stderr.includes('actual-stderr-tail'), false);
  assert.match(captured.result.stderrTail, /actual-stderr-tail\n$/u);
  assert.ok(
    Buffer.byteLength(captured.result.stdout) +
      Buffer.byteLength(captured.result.stdoutTail) <=
      256,
  );
  assert.ok(
    Buffer.byteLength(captured.result.stderr) +
      Buffer.byteLength(captured.result.stderrTail) <=
      256,
  );
});
