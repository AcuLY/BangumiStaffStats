import type { SharePath } from '../../api/adapters/queryWire';
import { querySignature, type AppliedQuery } from './model';
import {
  createShareFragment,
  readShare,
  type SharePayload,
  type ShareWorkspace,
} from './share';

export const QUERY_SESSION_STORAGE_KEY = 'bgmss-query-session-v1';

const MAX_SESSION_BYTES = 128 * 1024;
const MAX_FRAGMENT_LENGTH = 64 * 1024;

interface QuerySessionEnvelopeV1 {
  readonly coStar?: string;
  readonly ranking?: string;
  readonly version: 1;
}

interface ValidSessionEnvelope {
  readonly envelope: QuerySessionEnvelopeV1;
  readonly payloads: Readonly<{
    coStar?: SharePayload;
    ranking?: SharePayload;
  }>;
}

interface SessionStorageTarget {
  readonly sessionStorage: Storage;
}

export interface QuerySessionOwner {
  read(path: SharePath): SharePayload | null;
  write(
    path: SharePath,
    query: AppliedQuery,
    workspace: ShareWorkspace,
  ): boolean;
}

function entryName(path: SharePath): 'coStar' | 'ranking' {
  return path === '/co-star' ? 'coStar' : 'ranking';
}

function storageFor(target: SessionStorageTarget): Storage | null {
  try {
    return target.sessionStorage;
  } catch {
    return null;
  }
}

function removeInvalid(storage: Storage): void {
  try {
    storage.removeItem(QUERY_SESSION_STORAGE_KEY);
  } catch {
    // Storage failures must never affect the query application.
  }
}

function parseEnvelope(raw: string): QuerySessionEnvelopeV1 {
  if (raw.length > MAX_SESSION_BYTES) {
    throw new TypeError('Query session is too large');
  }
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Query session must be an object');
  }
  const record = value as Record<string, unknown>;
  if (
    record.version !== 1 ||
    Object.keys(record).some(
      (key) => !['coStar', 'ranking', 'version'].includes(key),
    ) ||
    (record.coStar !== undefined && typeof record.coStar !== 'string') ||
    (record.ranking !== undefined && typeof record.ranking !== 'string') ||
    (typeof record.coStar === 'string' &&
      record.coStar.length > MAX_FRAGMENT_LENGTH) ||
    (typeof record.ranking === 'string' &&
      record.ranking.length > MAX_FRAGMENT_LENGTH)
  ) {
    throw new TypeError('Query session has an unsupported shape');
  }
  return {
    ...(typeof record.coStar === 'string'
      ? { coStar: record.coStar }
      : {}),
    ...(typeof record.ranking === 'string'
      ? { ranking: record.ranking }
      : {}),
    version: 1,
  };
}

function validateEnvelope(envelope: QuerySessionEnvelopeV1): ValidSessionEnvelope {
  const ranking = envelope.ranking
    ? readShare('/ranking', envelope.ranking)
    : undefined;
  const coStar = envelope.coStar
    ? readShare('/co-star', envelope.coStar)
    : undefined;
  if (
    ranking &&
    coStar &&
    querySignature(ranking.query) !== querySignature(coStar.query)
  ) {
    throw new TypeError('Query session mixes incompatible applied queries');
  }
  return {
    envelope,
    payloads: {
      ...(coStar ? { coStar } : {}),
      ...(ranking ? { ranking } : {}),
    },
  };
}

function readEnvelope(storage: Storage): ValidSessionEnvelope | null {
  let raw: string | null;
  try {
    raw = storage.getItem(QUERY_SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw === null) {
    return null;
  }
  try {
    return validateEnvelope(parseEnvelope(raw));
  } catch {
    removeInvalid(storage);
    return null;
  }
}

export function createQuerySessionOwner(
  target: SessionStorageTarget,
): QuerySessionOwner {
  function read(path: SharePath): SharePayload | null {
    const storage = storageFor(target);
    if (!storage) {
      return null;
    }
    const valid = readEnvelope(storage);
    return valid?.payloads[entryName(path)] ?? null;
  }

  function write(
    path: SharePath,
    query: AppliedQuery,
    workspace: ShareWorkspace,
  ): boolean {
    const storage = storageFor(target);
    if (!storage) {
      return false;
    }
    let fragment: string;
    try {
      fragment = createShareFragment(path, query, workspace);
    } catch {
      return false;
    }

    const currentSignature = querySignature(query);
    const existing = readEnvelope(storage);
    const envelope: QuerySessionEnvelopeV1 = {
      ...(existing?.payloads.coStar &&
      querySignature(existing.payloads.coStar.query) === currentSignature
        ? { coStar: existing.envelope.coStar }
        : {}),
      ...(existing?.payloads.ranking &&
      querySignature(existing.payloads.ranking.query) === currentSignature
        ? { ranking: existing.envelope.ranking }
        : {}),
      [entryName(path)]: fragment,
      version: 1,
    };
    try {
      storage.setItem(QUERY_SESSION_STORAGE_KEY, JSON.stringify(envelope));
      return true;
    } catch {
      return false;
    }
  }

  return { read, write };
}
