import { createDefaultDraft, normalizeUid } from '../features/query/model';
import type { QueryDraft } from '../features/query/model';

export interface PersonEntryIntent {
  readonly uid: string;
  readonly personId: number;
  readonly subjectType: QueryDraft['subjectType'];
}

export type PersonEntry =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'invalid' }>
  | Readonly<{ kind: 'valid'; intent: PersonEntryIntent }>;

/** Parse only the restricted initial entry, never a general query URL. */
export function parsePersonEntry(logicalPath: string | null, search: string): PersonEntry {
  const invalid = { kind: 'invalid' } as const;
  const raw = search.startsWith('?') ? search.slice(1) : search;
  if (!raw) return { kind: 'none' };
  // URLSearchParams repairs broken percent/UTF-8 sequences. Validate the raw
  // encoding first so repaired identifiers can never acquire execution intent.
  try {
    for (const pair of raw.split('&')) {
      if (!pair || !pair.includes('=')) return invalid;
      decodeURIComponent(pair.replace(/\+/g, ' '));
    }
  } catch { return invalid; }
  const params = new URLSearchParams(raw);
  if (params.size === 1 && params.has('user')) return { kind: 'none' };
  const keys = ['entry', 'user', 'person', 'type'];
  if (logicalPath !== '/ranking' || params.size !== keys.length
    || keys.some(key => params.getAll(key).length !== 1)
    || params.get('entry') !== 'bangumi-person') return invalid;
  const uid = normalizeUid(params.get('user')!);
  const id = params.get('person')!;
  const personId = Number(id);
  const subjectType = params.get('type')!;
  if (!uid || !/^[0-9]+$/.test(id) || !Number.isSafeInteger(personId) || personId <= 0
    || !['book', 'anime', 'music', 'game', 'real'].includes(subjectType)) return invalid;
  return Object.freeze({ kind: 'valid', intent: Object.freeze({
    uid, personId, subjectType: subjectType as PersonEntryIntent['subjectType'],
  }) });
}

export function createPersonEntryDraft(intent: PersonEntryIntent): QueryDraft {
  return {
    ...createDefaultDraft(intent.uid),
    subjectType: intent.subjectType,
    collectionStatuses: ['wish', 'completed', 'in_progress', 'on_hold', 'dropped'],
    positionScope: 'all',
    positionKeys: [],
  };
}
