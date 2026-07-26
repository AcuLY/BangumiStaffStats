import { AsyncLocalStorage } from 'node:async_hooks';

const abortStorage = new AsyncLocalStorage();

export function runWithAbortSignal(signal, action) {
  if (!(signal instanceof AbortSignal)) {
    throw new TypeError('abort context requires one AbortSignal');
  }
  if (typeof action !== 'function') {
    throw new TypeError('abort context action is absent');
  }
  return abortStorage.run(signal, action);
}

export function currentAbortSignal() {
  return abortStorage.getStore();
}

export function throwIfAborted() {
  abortStorage.getStore()?.throwIfAborted();
}
