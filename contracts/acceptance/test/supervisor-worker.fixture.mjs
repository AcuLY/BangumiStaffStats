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
const scenario = JSON.parse(scenarioBytes).scenario;
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
      timeoutMs: 300,
    },
    {
      id: 'second.cell',
      owner: 'fixture-owner',
      phase: 'fixture',
      timeoutMs: 300,
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

function passed(id) {
  return {
    durationMs: 1,
    evidence: [],
    failure: null,
    id,
    owner: 'fixture-owner',
    status: 'pass',
  };
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
  const writerSource = [
    "const fs=require('node:fs');",
    "process.chdir('/');",
    "process.on('SIGTERM',()=>{});",
    `setTimeout(()=>fs.writeFileSync(${JSON.stringify(marker)},'late',{flag:'wx'}),1200);`,
    'setTimeout(()=>process.exit(0),30000);',
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
throw new Error(`unknown supervisor fixture scenario ${scenario}`);
