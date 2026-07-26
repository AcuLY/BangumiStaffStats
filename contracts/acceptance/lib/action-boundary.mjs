import { AsyncLocalStorage, createHook } from 'node:async_hooks';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

const actionStorage = new AsyncLocalStorage();
const asyncOwners = new Map();
const BOUNDARY = Symbol('acceptance-action-boundary');
const PATCHED = Symbol.for(
  'bangumi-staff-stats.acceptance.revocable-fs-boundary',
);
const MAX_RECORDED_VIOLATIONS = 64;

export class RevokedActionWriteError extends Error {
  constructor(operation, cellId) {
    super(`revoked matrix action ${cellId} attempted ${operation}`);
    this.code = 'REVOKED_ACTION_WRITE';
  }
}

function resourceCounts(resources) {
  const counts = {};
  for (const { type } of resources.values()) {
    counts[type] = (counts[type] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) =>
      left.localeCompare(right, 'en'),
    ),
  );
}

function releaseAsyncResource(asyncId) {
  const boundary = asyncOwners.get(asyncId);
  if (!boundary) return;
  asyncOwners.delete(asyncId);
  boundary.resources.delete(asyncId);
}

createHook({
  init(asyncId, type, _triggerAsyncId, resource) {
    const boundary = actionStorage.getStore();
    if (!boundary || type === 'PROMISE') return;
    asyncOwners.set(asyncId, boundary);
    boundary.resources.set(asyncId, { resource, type });
  },
  destroy: releaseAsyncResource,
  promiseResolve: releaseAsyncResource,
}).enable();

function requireBoundary(boundary) {
  if (!boundary || boundary[BOUNDARY] !== true) {
    throw new TypeError('matrix action boundary is invalid');
  }
  return boundary;
}

function recordRevokedWrite(boundary, operation) {
  boundary.writeViolationCount += 1;
  if (boundary.writeViolations.length < MAX_RECORDED_VIOLATIONS) {
    boundary.writeViolations.push(operation);
  }
  throw new RevokedActionWriteError(operation, boundary.cellId);
}

function assertBoundaryWritable(boundary, operation) {
  if (boundary?.revoked) recordRevokedWrite(boundary, operation);
}

function currentBoundary() {
  return actionStorage.getStore();
}

function flagsMayMutate(flags) {
  if (typeof flags === 'number') {
    const mask =
      fs.constants.O_WRONLY |
      fs.constants.O_RDWR |
      fs.constants.O_CREAT |
      fs.constants.O_TRUNC |
      fs.constants.O_APPEND;
    return (flags & mask) !== 0;
  }
  return typeof flags === 'string' && /[+awx]/u.test(flags);
}

function decorateFileHandle(handle, boundary) {
  for (const name of [
    'appendFile',
    'chmod',
    'chown',
    'truncate',
    'utimes',
    'write',
    'writeFile',
    'writev',
    'createWriteStream',
  ]) {
    if (typeof handle[name] !== 'function') continue;
    const original = handle[name].bind(handle);
    Object.defineProperty(handle, name, {
      configurable: true,
      value(...args) {
        assertBoundaryWritable(boundary, `fs.promises.FileHandle.${name}`);
        return original(...args);
      },
      writable: true,
    });
  }
  return handle;
}

function patchFileSystemBoundary() {
  if (fs[PATCHED]) return;
  Object.defineProperty(fs, PATCHED, {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false,
  });

  const synchronousMutations = [
    'appendFileSync',
    'chmodSync',
    'chownSync',
    'copyFileSync',
    'cpSync',
    'fchmodSync',
    'fchownSync',
    'ftruncateSync',
    'futimesSync',
    'lchmodSync',
    'lchownSync',
    'linkSync',
    'lutimesSync',
    'mkdirSync',
    'mkdtempSync',
    'mkdtempDisposableSync',
    'renameSync',
    'rmSync',
    'rmdirSync',
    'symlinkSync',
    'truncateSync',
    'unlinkSync',
    'utimesSync',
    'writeFileSync',
    'writeSync',
    'writevSync',
  ];
  for (const name of synchronousMutations) {
    if (typeof fs[name] !== 'function') continue;
    const original = fs[name];
    fs[name] = function guardedSynchronousMutation(...args) {
      assertBoundaryWritable(currentBoundary(), `fs.${name}`);
      return Reflect.apply(original, this, args);
    };
  }

  const originalOpenSync = fs.openSync;
  fs.openSync = function guardedOpenSync(...args) {
    if (flagsMayMutate(args[1])) {
      assertBoundaryWritable(currentBoundary(), 'fs.openSync');
    }
    return Reflect.apply(originalOpenSync, this, args);
  };

  const asynchronousMutations = [
    'appendFile',
    'chmod',
    'chown',
    'copyFile',
    'cp',
    'fchmod',
    'fchown',
    'ftruncate',
    'futimes',
    'lchmod',
    'lchown',
    'link',
    'lutimes',
    'mkdir',
    'mkdtemp',
    'rename',
    'rm',
    'rmdir',
    'symlink',
    'truncate',
    'unlink',
    'utimes',
    'write',
    'writeFile',
    'writev',
  ];
  for (const name of asynchronousMutations) {
    if (typeof fs[name] !== 'function') continue;
    const original = fs[name];
    fs[name] = function guardedAsynchronousMutation(...args) {
      assertBoundaryWritable(currentBoundary(), `fs.${name}`);
      return Reflect.apply(original, this, args);
    };
  }

  const originalOpen = fs.open;
  fs.open = function guardedOpen(...args) {
    if (flagsMayMutate(args[1])) {
      assertBoundaryWritable(currentBoundary(), 'fs.open');
    }
    return Reflect.apply(originalOpen, this, args);
  };

  const originalCreateWriteStream = fs.createWriteStream;
  fs.createWriteStream = function guardedCreateWriteStream(...args) {
    const boundary = currentBoundary();
    assertBoundaryWritable(boundary, 'fs.createWriteStream');
    const stream = Reflect.apply(originalCreateWriteStream, this, args);
    for (const name of ['end', 'write']) {
      const original = stream[name];
      stream[name] = function guardedStreamMutation(...streamArgs) {
        assertBoundaryWritable(boundary, `fs.WriteStream.${name}`);
        return Reflect.apply(original, this, streamArgs);
      };
    }
    return stream;
  };

  const promises = fs.promises;
  const originalPromisesOpen = promises.open.bind(promises);
  promises.open = async function guardedPromisesOpen(...args) {
    const boundary = currentBoundary();
    if (flagsMayMutate(args[1])) {
      assertBoundaryWritable(boundary, 'fs.promises.open');
    }
    const handle = await originalPromisesOpen(...args);
    return boundary ? decorateFileHandle(handle, boundary) : handle;
  };
  for (const name of [
    'appendFile',
    'chmod',
    'chown',
    'copyFile',
    'cp',
    'link',
    'lchmod',
    'lchown',
    'lutimes',
    'mkdir',
    'mkdtemp',
    'rename',
    'rm',
    'rmdir',
    'symlink',
    'truncate',
    'unlink',
    'utimes',
    'writeFile',
  ]) {
    if (typeof promises[name] !== 'function') continue;
    const original = promises[name].bind(promises);
    promises[name] = function guardedPromisesMutation(...args) {
      assertBoundaryWritable(currentBoundary(), `fs.promises.${name}`);
      return original(...args);
    };
  }

  syncBuiltinESMExports();
}

patchFileSystemBoundary();

function killOwnedChild(child, detached) {
  if (!child?.pid || child.exitCode !== null) return;
  try {
    if (process.platform !== 'win32' && detached) {
      process.kill(-child.pid, 'SIGKILL');
    } else {
      child.kill('SIGKILL');
    }
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
  }
}

function cancelOwnedCallbacks(boundary) {
  for (const { resource, type } of boundary.resources.values()) {
    if (type === 'Timeout') {
      clearTimeout(resource);
    } else if (type === 'Immediate') {
      clearImmediate(resource);
    }
  }
}

export function createActionBoundary(cellId) {
  if (typeof cellId !== 'string' || cellId.length === 0) {
    throw new TypeError('matrix action boundary requires one cell ID');
  }
  return {
    [BOUNDARY]: true,
    cellId,
    children: new Map(),
    resources: new Map(),
    resourcesAtRevoke: {},
    revoked: false,
    writeViolationCount: 0,
    writeViolations: [],
  };
}

export function runWithActionBoundary(boundary, action) {
  requireBoundary(boundary);
  if (typeof action !== 'function') {
    throw new TypeError('matrix action boundary action is absent');
  }
  return actionStorage.run(boundary, action);
}

export function registerOwnedChildProcess(child, { detached = false } = {}) {
  const boundary = currentBoundary();
  if (!boundary) return () => {};
  if (
    !child ||
    typeof child.once !== 'function' ||
    typeof child.kill !== 'function'
  ) {
    throw new TypeError('owned child process is invalid');
  }
  boundary.children.set(child, Boolean(detached));
  const release = () => boundary.children.delete(child);
  child.once('close', release);
  if (boundary.revoked) killOwnedChild(child, Boolean(detached));
  return release;
}

export function revokeActionBoundary(boundary) {
  requireBoundary(boundary);
  if (boundary.revoked) return actionBoundaryFacts(boundary);
  boundary.resourcesAtRevoke = resourceCounts(boundary.resources);
  boundary.revoked = true;
  cancelOwnedCallbacks(boundary);
  for (const [child, detached] of boundary.children) {
    killOwnedChild(child, detached);
  }
  return actionBoundaryFacts(boundary);
}

export function actionBoundaryFacts(boundary) {
  requireBoundary(boundary);
  return Object.freeze({
    cellId: boundary.cellId,
    activeResourceTypes: Object.freeze(resourceCounts(boundary.resources)),
    childrenActive: [...boundary.children].filter(
      ([child]) => child.exitCode === null,
    ).length,
    platformBoundary:
      'Node default fs mutation APIs and registered child processes on darwin/linux',
    resourcesAtRevoke: Object.freeze({ ...boundary.resourcesAtRevoke }),
    revoked: boundary.revoked,
    writeViolationCount: boundary.writeViolationCount,
    writeViolations: Object.freeze([...boundary.writeViolations]),
  });
}

export async function drainActionBoundary(
  boundary,
  actionPromise,
  { timeoutMs },
) {
  requireBoundary(boundary);
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 0 ||
    timeoutMs > 30_000
  ) {
    throw new TypeError('matrix action boundary drain timeout is invalid');
  }
  Promise.resolve(actionPromise)
    .catch(() => undefined)
    .finally(() => undefined);
  const quiescent = () =>
    boundary.children.size === 0 && boundary.resources.size === 0;
  if (quiescent() || timeoutMs === 0) {
    return actionBoundaryFacts(boundary);
  }
  await actionStorage.run(undefined, async () => {
    const started = performance.now();
    while (!quiescent()) {
      if (performance.now() - started >= timeoutMs) break;
      await new Promise((resolve) => setImmediate(resolve));
    }
  });
  return actionBoundaryFacts(boundary);
}
