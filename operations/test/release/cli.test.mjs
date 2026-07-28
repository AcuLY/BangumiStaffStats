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
import { formatReleaseCliError } from '../../release/cli.mjs';

const CHUNK_WRITER = [
  'const count = Number(process.argv[1]);',
  'const chunks = process.argv.slice(2, 2 + count);',
  'let index = 0;',
  'function writeNext() {',
  '  if (index === chunks.length) { process.exitCode = 7; return; }',
  '  process.stderr.write(chunks[index], () => { index += 1; setImmediate(writeNext); });',
  '}',
  'writeNext();',
].join('\n');

function subprocessFixture(t, purpose) {
  const run = createRunRoot({ purpose });
  t.after(() => cleanupRunRoot(run.runRoot));
  const pathEntries = [
    path.dirname(process.execPath),
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
  ]
    .filter((entry) => fs.existsSync(entry))
    .map((entry) => fs.realpathSync.native(entry))
    .filter((entry, index, values) => values.indexOf(entry) === index);
  const environmentOnlyCanary = `${purpose}-environment-only`;
  const environment = buildSanitizedEnvironment({
    runRoot: run.runRoot,
    pathEntries,
    extra: {
      BGMSS_DIAGNOSTIC_VALUE: environmentOnlyCanary,
    },
    allowedExtraNames: ['BGMSS_DIAGNOSTIC_VALUE'],
  });
  return { environment, environmentOnlyCanary, run };
}

async function captureChunkFailure(t, purpose, chunks) {
  const fixture = subprocessFixture(t, purpose);
  const argumentOnlyCanary = `${purpose}-argument-only`;
  let captured;
  await assert.rejects(
    () =>
      runSubprocess({
        command: process.execPath,
        args: [
          '-e',
          CHUNK_WRITER,
          String(chunks.length),
          ...chunks,
          argumentOnlyCanary,
        ],
        cwd: fixture.run.runRoot,
        environment: fixture.environment,
        timeoutMs: 5_000,
        maxOutputBytes: 128 * 1024,
      }),
    (error) => {
      captured = error;
      return error instanceof SubprocessError && error.result?.exitCode === 7;
    },
  );
  return {
    argumentOnlyCanary,
    error: captured,
    ...fixture,
  };
}

test('release diagnostics preserve actual primary and cleanup failures safely', async (t) => {
  const assignedValue = ['foundation', 'canary'].join('-');
  const bearerValue = ['opaque', 'bearer', 'value'].join('.');
  const namedField = ['to', 'ken'].join('');
  const fixture = await captureChunkFailure(
    t,
    'release-cli-primary',
    [
      `fatal: ${namedField}=${assignedValue}\n`,
      `Authorization: Bearer ${bearerValue}\n`,
      'path: /home/runner/private-build/component\n',
      'useful stderr tail\n',
    ],
  );
  const cleanup = Object.assign(
    new Error('owned run contains a hard-linked file'),
    { name: 'OwnedCleanupError' },
  );
  const report = formatReleaseCliError(
    new AggregateError(
      [fixture.error, cleanup],
      'AMD64 build and owned cleanup both failed',
    ),
  );

  assert.match(report, /root\.primary: SubprocessError/u);
  assert.match(report, /root\.cleanup: OwnedCleanupError/u);
  assert.match(report, /command=node exit=7/u);
  assert.match(report, /useful stderr tail/u);
  assert.match(report, /\/home\/\[USER\]\/private-build/u);
  assert.equal(report.includes(assignedValue), false);
  assert.equal(report.includes(bearerValue), false);
  assert.equal(report.includes(fixture.argumentOnlyCanary), false);
  assert.equal(report.includes(fixture.environmentOnlyCanary), false);
  assert.equal(report.includes(fixture.run.runRoot), false);
  assert.ok(report.length <= 16_385);
});

test('release diagnostics redact complete long credentials before tail bounding', async (t) => {
  const privateKeyMarker = [
    '-----BEGIN OPENSSH PRIVATE ',
    'KEY-----',
  ].join('');
  const privateKeyEnd = [
    '-----END OPENSSH PRIVATE ',
    'KEY-----',
  ].join('');
  const cases = [
    {
      name: 'assignment',
      secret: `${'a'.repeat(20_000)}ASSIGNMENTEND`,
      chunks(secret) {
        return [
          `${['API', 'TOKEN'].join('_')}=`,
          secret,
          '\ncredential-assignment-tail\n',
        ];
      },
    },
    {
      name: 'json',
      secret: `${'j'.repeat(20_000)}JSONEND`,
      chunks(secret) {
        return [
          `{"${['api', 'token'].join('_')}":"`,
          secret,
          '"}\ncredential-json-tail\n',
        ];
      },
    },
    {
      name: 'bearer',
      secret: `${'b'.repeat(20_000)}BEAREREND`,
      chunks(secret) {
        return [
          'Authorization: Bearer ',
          secret,
          '\ncredential-bearer-tail\n',
        ];
      },
    },
    {
      name: 'opaque',
      secret: `${['gh', 'p', '_'].join('')}${'o'.repeat(20_000)}OPAQUEEND`,
      chunks(secret) {
        return [
          secret.slice(0, 4),
          secret.slice(4),
          '\ncredential-opaque-tail\n',
        ];
      },
    },
    {
      name: 'url',
      secret: `${'u'.repeat(20_000)}URLEND`,
      chunks(secret) {
        return [
          'https://operator:',
          secret,
          '@example.invalid/path\ncredential-url-tail\n',
        ];
      },
    },
    {
      name: 'pem',
      secret: `${'p'.repeat(20_000)}PEMEND`,
      chunks(secret) {
        return [
          `${privateKeyMarker}\n`,
          secret,
          `\n${privateKeyEnd}\ncredential-pem-tail\n`,
        ];
      },
    },
  ];

  for (const credentialCase of cases) {
    await t.test(credentialCase.name, async (subtest) => {
      const fixture = await captureChunkFailure(
        subtest,
        `release-cli-redact-${credentialCase.name}`,
        credentialCase.chunks(credentialCase.secret),
      );
      const report = formatReleaseCliError(fixture.error);
      assert.match(
        report,
        new RegExp(`credential-${credentialCase.name}-tail`, 'u'),
      );
      assert.equal(report.includes(credentialCase.secret), false);
      assert.equal(
        report.includes(credentialCase.secret.slice(-256)),
        false,
      );
      assert.equal(report.includes(fixture.argumentOnlyCanary), false);
      assert.equal(report.includes(fixture.environmentOnlyCanary), false);
      assert.equal(report.includes(fixture.run.runRoot), false);
      assert.ok(report.length <= 16_385);
    });
  }
});

test('release diagnostics use the real subprocess tail after output-limit termination', async (t) => {
  const fixture = subprocessFixture(t, 'release-cli-output-tail');
  const shortSecretSuffix = ['short', 'credential', 'suffix'].join('-');
  const terminationOutput =
    `${shortSecretSuffix}\nactual-diagnostic-tail\n`;
  let captured;
  await assert.rejects(
    () =>
      runSubprocess({
        command: process.execPath,
        args: [
          '-e',
          [
            'let hold;',
            "process.on('SIGTERM', () => {",
            '  clearInterval(hold);',
            `  process.stderr.write(${JSON.stringify(terminationOutput)}, () => process.exit(0));`,
            '});',
            "process.stderr.write('diagnostic-head\\n' + 'x'.repeat(4096));",
            'hold = setInterval(() => {}, 1_000);',
          ].join('\n'),
          'ignored-argument-canary',
        ],
        cwd: fixture.run.runRoot,
        environment: fixture.environment,
        timeoutMs: 5_000,
        gracefulStopMs: 1_000,
        maxOutputBytes: 256,
      }),
    (error) => {
      captured = error;
      return (
        error instanceof SubprocessError &&
        error.result?.terminationReason === 'output-limit'
      );
    },
  );
  assert.equal(captured.result.stderr.includes('actual-diagnostic-tail'), false);
  assert.equal(shortSecretSuffix.length < 48, true);
  assert.match(captured.result.stderrTail, new RegExp(shortSecretSuffix, 'u'));
  assert.match(captured.result.stderrTail, /actual-diagnostic-tail\n$/u);
  const report = formatReleaseCliError(captured);
  assert.match(report, /stderr-tail: .*actual-diagnostic-tail/u);
  assert.equal(report.includes(shortSecretSuffix), false);
  assert.equal(report.includes('ignored-argument-canary'), false);
  assert.equal(report.includes(fixture.environmentOnlyCanary), false);
  assert.equal(report.includes(fixture.run.runRoot), false);
});

test('release diagnostics redact an orphaned private-key end in a truncated real tail', async (t) => {
  const fixture = subprocessFixture(t, 'release-cli-pem-tail');
  const privateKeyEnd = [
    '-----END OPENSSH PRIVATE ',
    'KEY-----',
  ].join('');
  const privateKeySuffix = ['tiny', 'pem', 'suffix'].join('-');
  const terminationOutput = [
    privateKeySuffix,
    privateKeyEnd,
    'orphaned-pem-diagnostic-tail',
    '',
  ].join('\n');
  let captured;
  await assert.rejects(
    () =>
      runSubprocess({
        command: process.execPath,
        args: [
          '-e',
          [
            'let hold;',
            "process.on('SIGTERM', () => {",
            '  clearInterval(hold);',
            `  process.stderr.write(${JSON.stringify(terminationOutput)}, () => process.exit(0));`,
            '});',
            "process.stderr.write('pem-head\\n' + 'p'.repeat(4096));",
            'hold = setInterval(() => {}, 1_000);',
          ].join('\n'),
        ],
        cwd: fixture.run.runRoot,
        environment: fixture.environment,
        timeoutMs: 5_000,
        gracefulStopMs: 1_000,
        maxOutputBytes: 256,
      }),
    (error) => {
      captured = error;
      return (
        error instanceof SubprocessError &&
        error.result?.terminationReason === 'output-limit'
      );
    },
  );
  assert.match(
    captured.result.stderrTail,
    new RegExp(privateKeySuffix, 'u'),
  );
  assert.match(captured.result.stderrTail, new RegExp(privateKeyEnd, 'u'));
  const report = formatReleaseCliError(captured);
  assert.match(report, /orphaned-pem-diagnostic-tail/u);
  assert.equal(report.includes(privateKeySuffix), false);
  assert.equal(report.includes(privateKeyEnd), false);
  assert.equal(report.includes(fixture.environmentOnlyCanary), false);
  assert.equal(report.includes(fixture.run.runRoot), false);
});

test('release diagnostics bound nested and circular error structures', () => {
  const circular = new Error('circular failure');
  circular.cause = circular;
  const nested = new AggregateError(
    Array.from(
      { length: 32 },
      (_value, index) => new Error(`failure-${index}-${'x'.repeat(4_096)}`),
    ),
    'parallel component builds failed',
  );
  const report = formatReleaseCliError(
    new AggregateError(
      [nested, circular],
      'component build and owned cleanup both failed',
    ),
  );
  assert.match(report, /diagnostic child limit reached/u);
  assert.match(report, /root\.cleanup: Error: circular failure/u);
  assert.ok(report.length <= 16_385);
});

test('release diagnostics safely render non-Error throws', () => {
  assert.equal(
    formatReleaseCliError('literal failure'),
    [
      'operations release error: Error: literal failure',
      'operations release diagnostic root: Error: literal failure',
      '',
    ].join('\n'),
  );
});
