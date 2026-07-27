import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const [, scenarioPath, runRoot, , inputDocumentDigest] =
  process.argv.slice(2);
const scenarioBytes = fs.readFileSync(scenarioPath);
if (
  `sha256:${createHash('sha256').update(scenarioBytes).digest('hex')}` !==
  inputDocumentDigest
) {
  throw new Error('fixture input document digest was not forwarded');
}
const scenarioInput = JSON.parse(scenarioBytes);
const scenario = scenarioInput.scenario;
const timeoutMs = scenarioInput.timeoutMs ?? 300;
const runId = path.basename(runRoot);
const matrixVersion = 'supervisor-test-matrix';
let sequence = 0;

function send(message) {
  const current = sequence;
  sequence += 1;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('fixture did not receive acknowledgement')),
      2_000,
    );
    const onMessage = (candidate) => {
      if (
        candidate?.type !== 'ack' ||
        candidate.sequence !== current
      ) {
        return;
      }
      clearTimeout(timer);
      process.removeListener('message', onMessage);
      resolve();
    };
    process.on('message', onMessage);
    process.send({
      ...message,
      matrixVersion,
      protocolVersion: 1,
      runId,
      sequence: current,
    });
  });
}

function checkpoint(index, previous = null) {
  const cells = [
    {
      id: 'first.cell',
      owner: 'fixture-owner',
      phase: 'fixture',
      timeoutMs,
    },
    {
      id: 'second.cell',
      owner: 'fixture-owner',
      phase: 'fixture',
      timeoutMs,
    },
  ];
  return send({
    type: 'checkpoint',
    cellId: cells[index].id,
    index,
    phase: cells[index].phase,
    previous,
    timeoutMs: cells[index].timeoutMs,
  });
}

function passed(id, evidence = []) {
  return {
    durationMs: 1,
    evidence,
    failure: null,
    id,
    owner: 'fixture-owner',
    status: 'pass',
  };
}

function failed(id, evidence = []) {
  return {
    durationMs: 1,
    evidence,
    failure: {
      blockedBy: null,
      code: 'COMMAND_ERROR',
      summary: 'fixture owner command failed',
    },
    id,
    owner: 'fixture-owner',
    status: 'fail',
  };
}

function fixtureEvidence(name, valid) {
  const relative = `evidence/${name}`;
  const absolute = path.join(runRoot, ...relative.split('/'));
  const bytes = Buffer.from(`${name}\n`);
  fs.mkdirSync(path.dirname(absolute), {
    recursive: true,
    mode: 0o700,
  });
  fs.writeFileSync(absolute, bytes, {
    flag: 'wx',
    mode: 0o600,
  });
  return {
    kind: 'logs',
    path: relative,
    sha256: valid
      ? `sha256:${createHash('sha256').update(bytes).digest('hex')}`
      : `sha256:${'0'.repeat(64)}`,
    summary: valid
      ? 'fixture evidence with a valid digest'
      : 'fixture evidence with an intentionally mismatched digest',
  };
}

function invalidEvidence(name) {
  return fixtureEvidence(name, false);
}

function validEvidence(name) {
  return fixtureEvidence(name, true);
}

if (scenario === 'malformed-ipc') {
  process.on('message', () => {
    fs.writeFileSync(path.join(runRoot, 'unexpected-ack'), 'ack\n', {
      flag: 'wx',
    });
  });
  process.send({ type: 'checkpoint' });
  setInterval(() => {}, 1_000);
  await new Promise(() => {});
}

await checkpoint(0);
if (scenario === 'sync-loop') {
  while (true) {
    // Exercise a worker that cannot service its own timers or microtasks.
  }
}
if (scenario === 'microtask-starvation') {
  const starve = () => queueMicrotask(starve);
  starve();
  await new Promise(() => {});
}
if (scenario === 'fake-partial') {
  fs.writeFileSync(
    path.join(runRoot, 'result.json'),
    '{"partial":true}\n',
    { flag: 'wx' },
  );
  setInterval(() => {}, 1_000);
  await new Promise(() => {});
}
if (scenario === 'late-descendant') {
  const marker = path.join(runRoot, 'late-descendant-marker');
  const markerDelayMs = timeoutMs + 2_000;
  const exitDelayMs = markerDelayMs + 30_000;
  const writerSource = [
    "const fs=require('node:fs');",
    "process.chdir('/');",
    "process.on('SIGTERM',()=>{});",
    `setTimeout(()=>fs.writeFileSync(${JSON.stringify(marker)},'late',{flag:'wx'}),${markerDelayMs});`,
    `setTimeout(()=>process.exit(0),${exitDelayMs});`,
  ].join('');
  spawn(
    process.execPath,
    ['-e', writerSource],
    {
      detached: true,
      env: {},
      stdio: 'ignore',
    },
  ).unref();
  setInterval(() => {}, 1_000);
  await new Promise(() => {});
}
if (scenario === 'terminal-hang') {
  const first = passed('first.cell');
  await checkpoint(1, first);
  const second = passed('second.cell');
  await send({
    type: 'terminal',
    code: 0,
    previous: second,
  });
  setInterval(() => {}, 1_000);
  await new Promise(() => {});
}
if (scenario === 'orderly-pass') {
  const first = passed('first.cell');
  await checkpoint(1, first);
  const second = passed('second.cell');
  await send({
    type: 'terminal',
    code: 0,
    previous: second,
  });
  process.exitCode = 0;
} else if (scenario === 'orderly-direct-failure') {
  await send({
    type: 'terminal',
    code: 1,
    previous: failed('first.cell'),
  });
  process.exitCode = 1;
} else if (scenario === 'orderly-direct-failure-invalid-evidence') {
  await send({
    type: 'terminal',
    code: 1,
    previous: failed(
      'first.cell',
      [invalidEvidence('invalid-direct.log')],
    ),
  });
  process.exitCode = 1;
} else if (scenario === 'orderly-direct-failure-valid-evidence') {
  await send({
    type: 'terminal',
    code: 1,
    previous: failed(
      'first.cell',
      [validEvidence('valid-direct.log')],
    ),
  });
  process.exitCode = 1;
} else if (scenario === 'orderly-earlier-pass-invalid-evidence') {
  const first = passed(
    'first.cell',
    [invalidEvidence('invalid-pass.log')],
  );
  await checkpoint(1, first);
  await send({
    type: 'terminal',
    code: 1,
    previous: failed('second.cell'),
  });
  process.exitCode = 1;
} else if (scenario === 'orderly-earlier-pass-valid-evidence') {
  const first = passed(
    'first.cell',
    [validEvidence('valid-pass.log')],
  );
  await checkpoint(1, first);
  await send({
    type: 'terminal',
    code: 1,
    previous: failed('second.cell'),
  });
  process.exitCode = 1;
} else {
  throw new Error(`unknown supervisor fixture scenario ${scenario}`);
}
