import { createHash } from 'node:crypto';

function serialize(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('canonical JSON rejects non-finite numbers');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(serialize).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${serialize(value[key])}`);
    return `{${entries.join(',')}}`;
  }
  throw new TypeError(`canonical JSON rejects ${typeof value}`);
}

export function canonicalJson(value) {
  return `${serialize(value)}\n`;
}

export function canonicalJsonDigest(value) {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

export function assertCanonicalJson(source, value, label = 'JSON') {
  if (source !== canonicalJson(value)) {
    throw new Error(`${label} is not canonical JSON with one trailing newline`);
  }
}
