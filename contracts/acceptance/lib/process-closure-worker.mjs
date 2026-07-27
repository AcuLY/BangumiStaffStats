import { spawnSync } from 'node:child_process';
import { parentPort } from 'node:worker_threads';

if (!parentPort) throw new Error('process closure worker requires a parent port');

let processGroupId = null;
let timer = null;
const ledger = new Map();

function inventory() {
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
      timeout: 5_000,
    },
  );
  if (result.error || result.status !== 0) {
    throw new Error(
      `process closure worker inventory failed: ${result.error?.message ?? result.status}`,
    );
  }
  return result.stdout
    .split(/\r?\n/u)
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const fields = line.trim().split(/\s+/u);
      if (fields.length < 10) throw new Error('invalid process inventory row');
      return {
        pid: Number(fields[0]),
        parentPid: Number(fields[1]),
        processGroupId: Number(fields[2]),
        userId: Number(fields[3]),
        startToken: fields.slice(4, 9).join(' '),
        command: fields.slice(9).join(' '),
      };
    });
}

function sameIdentity(left, right) {
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

function poll() {
  if (processGroupId === null) return;
  const entries = inventory();
  const byPid = new Map(entries.map((entry) => [entry.pid, entry]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const entry of entries) {
      const known = ledger.get(entry.pid);
      if (known) {
        if (sameStableProcess(known, entry)) ledger.set(entry.pid, entry);
        continue;
      }
      const parent = ledger.get(entry.parentPid);
      if (
        entry.processGroupId === processGroupId ||
        (parent && sameIdentity(parent, byPid.get(entry.parentPid)))
      ) {
        ledger.set(entry.pid, entry);
        changed = true;
      }
    }
  }
}

parentPort.on('message', (message) => {
  try {
    if (message?.type === 'start') {
      processGroupId = message.processGroupId;
      poll();
      timer = setInterval(poll, 10);
      return;
    }
    if (message?.type === 'stop') {
      clearInterval(timer);
      poll();
      parentPort.postMessage({
        type: 'stopped',
        entries: [...ledger.values()],
      });
    }
  } catch (error) {
    clearInterval(timer);
    parentPort.postMessage({
      type: 'failure',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

parentPort.postMessage({ type: 'ready' });
