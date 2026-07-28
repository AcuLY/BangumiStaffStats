import { parentPort, workerData } from 'node:worker_threads';

import {
  sameProcessArguments,
  sameProcessIdentity,
  snapshotHostProcessInventory,
} from './runner.mjs';

if (!parentPort) throw new Error('process closure worker requires a parent port');

if (
  workerData?.processInventoryOptions !== undefined &&
  (
    workerData.processInventoryOptions === null ||
    typeof workerData.processInventoryOptions !== 'object' ||
    Array.isArray(workerData.processInventoryOptions)
  )
) {
  throw new Error('process closure worker inventory options are invalid');
}
const configuredInventoryOptions =
  workerData?.processInventoryOptions === undefined
    ? Object.freeze({})
    : Object.freeze({ ...workerData.processInventoryOptions });

let processGroupId = null;
let timer = null;
let failure = null;
const ledger = new Map();

function sameOwnedProcess(left, right) {
  return (
    sameProcessIdentity(left, right) &&
    sameProcessArguments(left, right)
  );
}

function inventory() {
  return snapshotHostProcessInventory({
    ...configuredInventoryOptions,
    timeoutMs: Math.min(
      configuredInventoryOptions.timeoutMs ?? 5_000,
      5_000,
    ),
  }).entries;
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
        if (!sameOwnedProcess(known, entry)) {
          throw new Error(
            `process ${entry.pid} identity changed in the worker closure`,
          );
        }
        continue;
      }
      const parent = ledger.get(entry.parentPid);
      if (
        entry.processGroupId === processGroupId ||
        (parent && sameOwnedProcess(parent, byPid.get(entry.parentPid)))
      ) {
        ledger.set(entry.pid, entry);
        changed = true;
      }
    }
  }
}

function stopPolling() {
  clearInterval(timer);
  timer = null;
}

function reportFailure(error) {
  if (failure !== null) return;
  stopPolling();
  failure = error instanceof Error ? error.message : String(error);
  parentPort.postMessage({
    type: 'failure',
    message: failure,
  });
}

function guardedPoll() {
  if (failure !== null) return;
  try {
    poll();
  } catch (error) {
    reportFailure(error);
  }
}

parentPort.on('message', (message) => {
  if (failure !== null) return;
  try {
    if (message?.type === 'start') {
      if (
        !Number.isSafeInteger(message.processGroupId) ||
        message.processGroupId <= 0 ||
        processGroupId !== null
      ) {
        throw new Error('process closure worker received an invalid start');
      }
      processGroupId = message.processGroupId;
      poll();
      timer = setInterval(guardedPoll, 10);
      parentPort.postMessage({ type: 'started' });
      return;
    }
    if (message?.type === 'stop') {
      stopPolling();
      poll();
      parentPort.postMessage({
        type: 'stopped',
        entries: [...ledger.values()],
      });
      return;
    }
    throw new Error('process closure worker received an invalid message');
  } catch (error) {
    reportFailure(error);
  }
});

parentPort.postMessage({ type: 'ready' });
