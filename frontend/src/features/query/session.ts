import { querySignature, type AppliedQuery } from './model';
import {
  decodeRecoveryPayload,
  type RecoveryPath,
  type RecoveryPayload,
  type RecoveryWorkspace,
} from './recovery';

export const QUERY_SESSION_STORAGE_KEY = 'bgmss-query-session-v2';

const MAX_SESSION_BYTES = 128 * 1024;

interface QuerySessionEnvelopeV2 {
  readonly coStar?: unknown;
  readonly ranking?: unknown;
  readonly version: 2;
}

interface ValidSessionEnvelope {
  readonly envelope: QuerySessionEnvelopeV2;
  readonly payloads: Readonly<{
    coStar?: RecoveryPayload;
    ranking?: RecoveryPayload;
  }>;
}

interface SessionStorageTarget {
  readonly sessionStorage: Storage;
}

export interface QuerySessionOwner {
  read(path: RecoveryPath): RecoveryPayload | null;
  write(
    path: RecoveryPath,
    query: AppliedQuery,
    workspace: RecoveryWorkspace,
  ): boolean;
}

function entryName(path: RecoveryPath): 'coStar' | 'ranking' {
  return path === '/co-star' ? 'coStar' : 'ranking';
}

function storageFor(target: SessionStorageTarget): Storage | null {
  try {
    const storage = target.sessionStorage;
    storage.removeItem('bgmss-query-session-v1');
    return storage;
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

function parseEnvelope(raw: string): QuerySessionEnvelopeV2 {
  if (raw.length > MAX_SESSION_BYTES) {
    throw new TypeError('Query session is too large');
  }
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Query session must be an object');
  }
  const record = value as Record<string, unknown>;
  if (
    record.version !== 2 ||
    Object.keys(record).some((key) => !['coStar', 'ranking', 'version'].includes(key))
  ) {
    throw new TypeError('Query session has an unsupported shape');
  }
  return {
    ...(Object.hasOwn(record, 'coStar') ? { coStar: record.coStar } : {}),
    ...(Object.hasOwn(record, 'ranking') ? { ranking: record.ranking } : {}),
    version: 2,
  };
}

function validateEnvelope(envelope: QuerySessionEnvelopeV2): ValidSessionEnvelope {
  const ranking = Object.hasOwn(envelope, 'ranking')
    ? decodeRecoveryPayload('/ranking', envelope.ranking)
    : undefined;
  const coStar = Object.hasOwn(envelope, 'coStar')
    ? decodeRecoveryPayload('/co-star', envelope.coStar)
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
  function read(path: RecoveryPath): RecoveryPayload | null {
    const storage = storageFor(target);
    if (!storage) {
      return null;
    }
    const valid = readEnvelope(storage);
    return valid?.payloads[entryName(path)] ?? null;
  }

  function write(
    path: RecoveryPath,
    query: AppliedQuery,
    workspace: RecoveryWorkspace,
  ): boolean {
    const storage = storageFor(target);
    if (!storage) {
      return false;
    }
    let payload: RecoveryPayload;
    try {
      payload = decodeRecoveryPayload(path, structuredClone({ query, workspace }));
    } catch {
      return false;
    }

    const currentSignature = querySignature(query);
    const existing = readEnvelope(storage);
    const envelope: QuerySessionEnvelopeV2 = {
      ...(existing?.payloads.coStar &&
      querySignature(existing.payloads.coStar.query) === currentSignature
        ? { coStar: existing.envelope.coStar }
        : {}),
      ...(existing?.payloads.ranking &&
      querySignature(existing.payloads.ranking.query) === currentSignature
        ? { ranking: existing.envelope.ranking }
        : {}),
      [entryName(path)]: payload,
      version: 2,
    };
    try {
      const serialized = JSON.stringify(envelope);
      if (serialized.length > MAX_SESSION_BYTES) return false;
      storage.setItem(QUERY_SESSION_STORAGE_KEY, serialized);
      return true;
    } catch {
      return false;
    }
  }

  return { read, write };
}
