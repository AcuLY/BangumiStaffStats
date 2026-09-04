import { beforeEach, describe, expect, it } from 'vitest';

import type { AppliedQuery } from '../../../src/features/query/model';
import {
  createQuerySessionOwner,
  QUERY_SESSION_STORAGE_KEY,
} from '../../../src/features/query/session';
import {
  createShareFragment,
  type ShareWorkspace,
} from '../../../src/features/query/share';

const query: AppliedQuery = Object.freeze({
  collectionStatuses: Object.freeze(['completed'] as const),
  includeNSFW: false,
  mergeSeries: false,
  positionKeys: Object.freeze(['staff:anime:2', 'staff:anime:101'] as const),
  scope: 'personal',
  subjectType: 'anime',
  uid: 'luca',
});

const rankingWorkspace: ShareWorkspace = Object.freeze({
  kind: 'ranking',
  rankingsView: Object.freeze({
    order: 'asc',
    page: 2,
    pageSize: 20,
    search: '监督',
    sort: 'average',
  }),
});

const coStarWorkspace: ShareWorkspace = Object.freeze({
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
    expect(window.sessionStorage.getItem(QUERY_SESSION_STORAGE_KEY)).not.toContain(
      'response',
    );
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
    ['unsupported version', JSON.stringify({ version: 2 })],
    ['unknown member', JSON.stringify({ response: {}, version: 1 })],
  ])('ignores and removes %s', (_label, stored) => {
    window.sessionStorage.setItem(QUERY_SESSION_STORAGE_KEY, stored);
    const owner = createQuerySessionOwner(window);

    expect(owner.read('/ranking')).toBeNull();
    expect(window.sessionStorage.getItem(QUERY_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('rejects a fragment stored under an incompatible route', () => {
    window.sessionStorage.setItem(
      QUERY_SESSION_STORAGE_KEY,
      JSON.stringify({
        ranking: createShareFragment('/co-star', query, coStarWorkspace),
        version: 1,
      }),
    );
    const owner = createQuerySessionOwner(window);

    expect(owner.read('/ranking')).toBeNull();
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
    } as unknown as ShareWorkspace;

    expect(owner.write('/ranking', query, pollutedWorkspace)).toBe(false);
    expect(window.sessionStorage.getItem(QUERY_SESSION_STORAGE_KEY)).toBeNull();
  });
});
