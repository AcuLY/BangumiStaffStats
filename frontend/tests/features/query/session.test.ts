import { beforeEach, describe, expect, it } from 'vitest';

import type { AppliedQuery } from '../../../src/features/query/model';
import {
  createQuerySessionOwner,
  QUERY_SESSION_STORAGE_KEY,
} from '../../../src/features/query/session';
import type { RecoveryWorkspace } from '../../../src/features/query/recovery';

const query: AppliedQuery = Object.freeze({
  collectionStatuses: Object.freeze(['completed'] as const),
  includeNSFW: false,
  mergeSeries: false,
  positionKeys: Object.freeze(['staff:anime:2', 'staff:anime:101'] as const),
  scope: 'personal',
  subjectType: 'anime',
  uid: 'luca',
});

const rankingWorkspace: RecoveryWorkspace = Object.freeze({
  kind: 'ranking',
  rankingsView: Object.freeze({
    order: 'asc',
    page: 2,
    pageSize: 20,
    search: '监督',
    sort: 'average',
  }),
});

const coStarWorkspace: RecoveryWorkspace = Object.freeze({
  candidates: Object.freeze({
    input: Object.freeze({ positionKey: 'staff:anime:101' }),
    view: Object.freeze({
      order: 'desc',
      page: 1,
      pageSize: 10,
      search: '',
      sort: 'count',
    }),
  }),
  kind: 'co-star',
  state: 'empty',
});

beforeEach(() => {
  window.sessionStorage.clear();
});

describe('query session owner', () => {
  it('round-trips unrestricted wish queries across modes without widening hidden identities', () => {
    const owner = createQuerySessionOwner(window);
    const allQuery: AppliedQuery = { ...query, positionScope: 'all', positionKeys: [], collectionStatuses: ['wish', 'completed'] };
    const workspace: RecoveryWorkspace = {
      kind: 'co-star', state: 'partners', candidates: coStarWorkspace.candidates,
      partners: { input: { positionScope: 'query', source: { personId: 1, positionKeys: ['staff:anime:999'] },
        candidatePositionKey: 'cast:anime:main' }, view: { sort: 'count' } },
    };
    expect(owner.write('/ranking', allQuery, rankingWorkspace)).toBe(true);
    expect(owner.write('/co-star', allQuery, workspace)).toBe(true);
    const reloaded = createQuerySessionOwner(window);
    expect(reloaded.read('/ranking')).toEqual({ query: allQuery, workspace: rankingWorkspace });
    expect(reloaded.read('/co-star')).toEqual({ query: allQuery, workspace });
    expect(JSON.parse(window.sessionStorage.getItem(QUERY_SESSION_STORAGE_KEY)!)).toEqual({
      version: 2, ranking: { query: allQuery, workspace: rankingWorkspace }, coStar: { query: allQuery, workspace },
    });
  });

  it('distinguishes explicit query all from legacy empty operation-all session identity', () => {
    const owner = createQuerySessionOwner(window);
    const legacy: AppliedQuery = { ...query, positionKeys: [] };
    const allQuery: AppliedQuery = { ...legacy, positionScope: 'all' };
    const allWorkspace: RecoveryWorkspace = { ...coStarWorkspace,
      candidates: { ...coStarWorkspace.candidates, input: { positionKey: null, positionScope: 'all' } },
    };
    expect(owner.write('/co-star', legacy, allWorkspace)).toBe(true);
    expect(owner.write('/ranking', allQuery, rankingWorkspace)).toBe(true);
    expect(owner.read('/co-star')).toBeNull();
    expect(owner.read('/ranking')?.query).toEqual(allQuery);
    expect(owner.write('/co-star', legacy, allWorkspace)).toBe(true);
    expect(owner.read('/ranking')).toBeNull();
    expect(owner.read('/co-star')?.query).not.toHaveProperty('positionScope');
  });

  it('round-trips compatible ranking and co-star workspaces in one tab session', () => {
    const owner = createQuerySessionOwner(window);

    expect(owner.write('/ranking', query, rankingWorkspace)).toBe(true);
    expect(owner.write('/co-star', query, coStarWorkspace)).toBe(true);

    expect(owner.read('/ranking')).toEqual({
      query,
      workspace: rankingWorkspace,
    });
    expect(owner.read('/co-star')).toEqual({
      query,
      workspace: coStarWorkspace,
    });
    expect(JSON.parse(window.sessionStorage.getItem(QUERY_SESSION_STORAGE_KEY)!)).toEqual({
      version: 2, ranking: { query, workspace: rankingWorkspace },
      coStar: { query, workspace: coStarWorkspace },
    });
  });

  it('drops an older other-mode workspace when a new applied query is saved', () => {
    const owner = createQuerySessionOwner(window);
    const nextQuery: AppliedQuery = Object.freeze({
      includeNSFW: false,
      mergeSeries: false,
      positionKeys: Object.freeze(['staff:anime:2'] as const),
      scope: 'global',
      subjectType: 'anime',
    });

    expect(owner.write('/co-star', query, coStarWorkspace)).toBe(true);
    expect(owner.write('/ranking', nextQuery, rankingWorkspace)).toBe(true);

    expect(owner.read('/co-star')).toBeNull();
    expect(owner.read('/ranking')?.query).toEqual(nextQuery);
  });

  it.each([
    ['malformed JSON', '{'],
    ['unsupported version', JSON.stringify({ version: 3 })],
    ['unknown member', JSON.stringify({ response: {}, version: 2 })],
  ])('ignores and removes %s', (_label, stored) => {
    window.sessionStorage.setItem(QUERY_SESSION_STORAGE_KEY, stored);
    const owner = createQuerySessionOwner(window);

    expect(owner.read('/ranking')).toBeNull();
    expect(window.sessionStorage.getItem(QUERY_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('rejects recovery state stored under an incompatible route', () => {
    window.sessionStorage.setItem(
      QUERY_SESSION_STORAGE_KEY,
      JSON.stringify({
        ranking: { query, workspace: coStarWorkspace },
        version: 2,
      }),
    );
    const owner = createQuerySessionOwner(window);

    expect(owner.read('/ranking')).toBeNull();
    expect(window.sessionStorage.getItem(QUERY_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('discards legacy session data without decoding its fragment', () => {
    window.sessionStorage.setItem('bgmss-query-session-v1', JSON.stringify({
      version: 1, ranking: '#q=v1.e30',
    }));
    const owner = createQuerySessionOwner(window);
    expect(owner.read('/ranking')).toBeNull();
    expect(window.sessionStorage.getItem('bgmss-query-session-v1')).toBeNull();
    expect(window.sessionStorage.getItem(QUERY_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('fails closed when session storage access throws', () => {
    const unavailable = createQuerySessionOwner({
      get sessionStorage(): Storage {
        throw new DOMException('denied', 'SecurityError');
      },
    });
    const writeDenied = createQuerySessionOwner({
      sessionStorage: {
        clear() {},
        getItem() {
          return null;
        },
        key() {
          return null;
        },
        length: 0,
        removeItem() {},
        setItem() {
          throw new DOMException('quota', 'QuotaExceededError');
        },
      },
    });

    expect(unavailable.read('/ranking')).toBeNull();
    expect(unavailable.write('/ranking', query, rankingWorkspace)).toBe(false);
    expect(writeDenied.write('/ranking', query, rankingWorkspace)).toBe(false);
  });

  it('refuses workspaces with response or transient fields', () => {
    const owner = createQuerySessionOwner(window);
    const pollutedWorkspace = {
      ...rankingWorkspace,
      pending: true,
      response: { items: [] },
    } as unknown as RecoveryWorkspace;

    expect(owner.write('/ranking', query, pollutedWorkspace)).toBe(false);
    expect(window.sessionStorage.getItem(QUERY_SESSION_STORAGE_KEY)).toBeNull();
  });
});
