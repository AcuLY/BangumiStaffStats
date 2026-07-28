import { sha256 } from './digest.mjs';

export class CanonicalJsonError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'CanonicalJsonError';
  }
}

function fail(message) {
  throw new CanonicalJsonError(message);
}

function serialize(value, ancestors) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('non-finite numbers are not permitted');
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') {
    fail(`${typeof value} values are not permitted`);
  }
  if (ancestors.has(value)) fail('cyclic values are not permitted');
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const entries = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
          fail('sparse or accessor-backed arrays are not permitted');
        }
        entries.push(serialize(descriptor.value, ancestors));
      }
      if (
        Object.keys(value).length !== value.length ||
        Object.keys(value).some((key, index) => key !== String(index))
      ) {
        fail('arrays with named properties are not permitted');
      }
      return `[${entries.join(',')}]`;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== null && prototype !== Object.prototype) {
      fail('only plain objects are permitted');
    }
    if (Object.getOwnPropertySymbols(value).length !== 0) {
      fail('symbol keys are not permitted');
    }
    const entries = Object.keys(value)
      .sort()
      .map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
          fail(`accessor property ${JSON.stringify(key)} is not permitted`);
        }
        return `${JSON.stringify(key)}:${serialize(descriptor.value, ancestors)}`;
      });
    return `{${entries.join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalJson(value) {
  return `${serialize(value, new Set())}\n`;
}

export function canonicalJsonBytes(value) {
  return Buffer.from(canonicalJson(value), 'utf8');
}

export function canonicalJsonDigest(value) {
  return sha256(canonicalJsonBytes(value));
}

export function assertCanonicalJson(source, parsed, label = 'JSON') {
  if (typeof source !== 'string') throw new TypeError(`${label} must be text`);
  if (source !== canonicalJson(parsed)) {
    fail(`${label} must be canonical JSON with sorted keys and one trailing newline`);
  }
  return parsed;
}

export function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const entry of Object.values(value)) deepFreeze(entry, seen);
  return Object.freeze(value);
}
