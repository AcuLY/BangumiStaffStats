import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

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
  assert.throws(
    () =>
      buildSanitizedEnvironment({
        runRoot: run.runRoot,
        pathEntries: ['/usr/bin', '/bin'],
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
          pathEntries: ['/usr/bin', '/bin'],
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
  assert.equal(fs.existsSync(path.join(run.runRoot, 'should-not-exist')), false);
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

test('subprocess output is bounded and a truncation is a failure', async (t) => {
  const { environment, run } = subprocessFixture(t, 'subprocess-output-test');
  await assert.rejects(
    () =>
      runSubprocess({
        command: process.execPath,
        args: ['-e', 'process.stdout.write("x".repeat(8192))'],
        cwd: run.runRoot,
        environment,
        timeoutMs: 5_000,
        maxOutputBytes: 256,
      }),
    (error) =>
      error instanceof SubprocessError &&
      error.result?.terminationReason === 'output-limit' &&
      error.result.stdoutTruncated === true,
  );
});
