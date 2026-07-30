import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createQueryCoordinator,
  type OperationResponse,
  type QueryDrivers,
} from '../../../src/features/query/coordinator';
import { useQueryStore } from '../../../src/features/query/store';
import { catalogFixture } from '../query/fixtures';

interface RankingPayload {
  readonly id: string;
}

interface DetailPayload {
  readonly id: string;
}

type DetailExecute = NonNullable<
  QueryDrivers<RankingPayload, never, DetailPayload>['personDetail']
>['execute'];
type RankingExecute = QueryDrivers<
  RankingPayload,
  never,
  DetailPayload
>['rankings']['execute'];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function readyStore() {
  const store = useQueryStore();
  store.draft.uid = 'luca';
  store.draft.positionKeys = ['staff:anime:2'];
  return store;
}

function drivers(
  detailExecute: DetailExecute,
  rankingExecute?: RankingExecute,
): QueryDrivers<RankingPayload, never, DetailPayload> {
  return {
    candidates: {
      async execute(): Promise<never> {
        throw new Error('not part of this test');
      },
    },
    personDetail: { execute: detailExecute },
    rankings: {
      execute:
        rankingExecute ??
        (async (request) => ({
          payload: { id: 'ranking' },
          requestId: 'server-ranking',
          transactionId: request.transactionId,
        })),
    },
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('person-detail coordinator resource', () => {
  it('uses globalScore/desc by default even for personal queries', async () => {
    const detailExecute = vi.fn(async (request) => ({
      payload: { id: String(request.input.personId) },
      requestId: 'server-detail',
      transactionId: request.transactionId,
    }));
    const store = readyStore();
    const coordinator = createQueryCoordinator(
      store,
      drivers(detailExecute),
    );
    await coordinator.execute({
      catalog: catalogFixture(),
      mode: 'ranking',
    });

    await expect(coordinator.executePersonDetail(12)).resolves.toBe(true);

    expect(detailExecute).toHaveBeenCalledOnce();
    expect(detailExecute.mock.calls[0]![0].view).toEqual({
      order: 'desc',
      page: 1,
      pageSize: 10,
      search: '',
      section: 'works',
      sort: 'globalScore',
    });
    expect(coordinator.personDetail).toMatchObject({
      acceptedInput: { personId: 12 },
      acceptedView: {
        section: 'works',
        sort: 'globalScore',
      },
      input: { personId: 12 },
      payload: { id: '12' },
      phase: 'ready',
      revision: 1,
    });
  });

  it('rejects section, scope, and series-incompatible detail view unions before the driver', async () => {
    const detailExecute = vi.fn(async (request) => ({
      payload: { id: String(request.input.personId) },
      requestId: 'server-detail',
      transactionId: request.transactionId,
    }));
    const personalStore = readyStore();
    const personal = createQueryCoordinator(
      personalStore,
      drivers(detailExecute),
    );
    await personal.execute({
      catalog: catalogFixture(),
      mode: 'ranking',
    });

    await expect(
      personal.executePersonDetail(12, {
        order: 'desc',
        page: 1,
        pageSize: 10,
        search: '',
        section: 'works',
        sort: 'role',
      }),
    ).resolves.toBe(false);
    await expect(
      personal.executePersonDetail(12, {
        order: 'desc',
        page: 1,
        pageSize: 10,
        search: '',
        section: 'characters',
        sort: 'globalScore',
      }),
    ).resolves.toBe(false);
    await expect(
      personal.executePersonDetail(12, {
        order: 'desc',
        page: 1,
        pageSize: 10,
        search: '',
        section: 'works',
        sort: 'seriesSize',
      }),
    ).resolves.toBe(false);

    setActivePinia(createPinia());
    const globalStore = readyStore();
    globalStore.draft.scope = 'global';
    const global = createQueryCoordinator(
      globalStore,
      drivers(detailExecute),
    );
    await global.execute({
      catalog: catalogFixture(),
      mode: 'ranking',
    });
    await expect(
      global.executePersonDetail(12, {
        order: 'desc',
        page: 1,
        pageSize: 10,
        search: '',
        section: 'works',
        sort: 'personalScore',
      }),
    ).resolves.toBe(false);

    expect(detailExecute).not.toHaveBeenCalled();
  });

  it('aborts superseded identities and commits only the latest response', async () => {
    const first = deferred<OperationResponse<DetailPayload>>();
    const second = deferred<OperationResponse<DetailPayload>>();
    const detailExecute = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const store = readyStore();
    const coordinator = createQueryCoordinator(
      store,
      drivers(detailExecute),
    );
    await coordinator.execute({
      catalog: catalogFixture(),
      mode: 'ranking',
    });

    const firstResult = coordinator.executePersonDetail(12);
    const firstRequest = detailExecute.mock.calls[0]![0];
    const secondResult = coordinator.executePersonDetail(13);
    const secondRequest = detailExecute.mock.calls[1]![0];
    expect(firstRequest.signal.aborted).toBe(true);
    second.resolve({
      payload: { id: 'new' },
      requestId: 'server-new',
      transactionId: secondRequest.transactionId,
    });
    expect(await secondResult).toBe(true);
    first.resolve({
      payload: { id: 'old' },
      requestId: 'server-old',
      transactionId: firstRequest.transactionId,
    });
    expect(await firstResult).toBe(false);

    expect(coordinator.personDetail.input.personId).toBe(13);
    expect(coordinator.personDetail.payload).toEqual({ id: 'new' });
    expect(coordinator.personDetail.requestId).toBe('server-new');
  });

  it('retains identity payload while a server-side view projection is pending', async () => {
    const viewResponse = deferred<OperationResponse<DetailPayload>>();
    const detailExecute = vi
      .fn()
      .mockImplementationOnce(async (request) => ({
        payload: { id: 'identity' },
        requestId: 'server-identity',
        transactionId: request.transactionId,
      }))
      .mockImplementationOnce(() => viewResponse.promise);
    const store = readyStore();
    const coordinator = createQueryCoordinator(
      store,
      drivers(detailExecute),
    );
    await coordinator.execute({
      catalog: catalogFixture(),
      mode: 'ranking',
    });
    await coordinator.executePersonDetail(12);

    const pending = coordinator.executePersonDetailView({
      ...coordinator.personDetail.view,
      page: 2,
    });
    expect(coordinator.personDetail.payload).toEqual({ id: 'identity' });
    expect(coordinator.personDetail.phase).toBe('ready');
    expect(coordinator.personDetail.viewPending).toBe(true);
    const request = detailExecute.mock.calls[1]![0];
    viewResponse.resolve({
      payload: { id: 'page-2' },
      requestId: 'server-page-2',
      transactionId: request.transactionId,
    });

    expect(await pending).toBe(true);
    expect(coordinator.personDetail.payload).toEqual({ id: 'page-2' });
    expect(coordinator.personDetail.viewPending).toBe(false);
  });

  it('commits only the latest of two consecutive server-side view requests', async () => {
    const firstView = deferred<OperationResponse<DetailPayload>>();
    const secondView = deferred<OperationResponse<DetailPayload>>();
    const detailExecute = vi
      .fn()
      .mockImplementationOnce(async (request) => ({
        payload: { id: 'identity' },
        requestId: 'server-identity',
        transactionId: request.transactionId,
      }))
      .mockImplementationOnce(() => firstView.promise)
      .mockImplementationOnce(() => secondView.promise);
    const store = readyStore();
    const coordinator = createQueryCoordinator(
      store,
      drivers(detailExecute),
    );
    await coordinator.execute({
      catalog: catalogFixture(),
      mode: 'ranking',
    });
    await coordinator.executePersonDetail(12);

    const older = coordinator.executePersonDetailView({
      ...coordinator.personDetail.view,
      page: 2,
    });
    const olderRequest = detailExecute.mock.calls[1]![0];
    const latest = coordinator.executePersonDetailView({
      ...coordinator.personDetail.view,
      page: 3,
    });
    const latestRequest = detailExecute.mock.calls[2]![0];
    expect(olderRequest.signal.aborted).toBe(true);
    secondView.resolve({
      payload: { id: 'page-3' },
      requestId: 'server-page-3',
      transactionId: latestRequest.transactionId,
    });
    expect(await latest).toBe(true);
    firstView.resolve({
      payload: { id: 'page-2' },
      requestId: 'server-page-2',
      transactionId: olderRequest.transactionId,
    });
    expect(await older).toBe(false);

    expect(coordinator.personDetail.view.page).toBe(3);
    expect(coordinator.personDetail.payload).toEqual({ id: 'page-3' });
  });

  it.each(['failure', 'cancel'] as const)(
    'discards compound person-detail intent and restores accepted ownership after ranking refresh %s',
    async (outcome) => {
      const refresh =
        deferred<OperationResponse<RankingPayload>>();
      const rankingExecute = vi
        .fn()
        .mockImplementationOnce(async (request) => ({
          payload: { id: 'ranking' },
          requestId: 'server-ranking',
          transactionId: request.transactionId,
        }))
        .mockImplementationOnce(() => refresh.promise);
      const detailExecute = vi.fn(async (request) => ({
        payload: { id: 'accepted-detail' },
        requestId: 'server-accepted-detail',
        transactionId: request.transactionId,
      }));
      const store = readyStore();
      const coordinator = createQueryCoordinator(
        store,
        drivers(detailExecute, rankingExecute),
      );
      const catalog = catalogFixture();
      await coordinator.execute({ catalog, mode: 'ranking' });
      await coordinator.executePersonDetail(12, {
        order: 'desc',
        page: 1,
        pageSize: 10,
        search: 'accepted',
        section: 'works',
        sort: 'globalScore',
      });
      const acceptedView = coordinator.personDetail.view;
      const acceptedInput = coordinator.personDetail.acceptedInput;
      const acceptedQuery = coordinator.personDetail.acceptedQuery;

      const primary = coordinator.execute({
        catalog,
        mode: 'ranking',
        refreshCollection: true,
      });
      await expect(
        coordinator.executePersonDetailView({
          ...coordinator.personDetail.view,
          search: 'queued search',
        }),
      ).resolves.toBe(true);
      await expect(
        coordinator.executePersonDetailView({
          ...coordinator.personDetail.view,
          order: 'asc',
        }),
      ).resolves.toBe(true);

      expect(detailExecute).toHaveBeenCalledOnce();
      expect(coordinator.personDetail).toMatchObject({
        error: null,
        view: {
          order: 'asc',
          search: 'queued search',
        },
      });
      expect(coordinator.lastOperationFeedback.value).toBeNull();

      const refreshRequest = rankingExecute.mock.calls[1]![0];
      if (outcome === 'failure') {
        refresh.reject(new Error('refresh failed'));
      } else {
        coordinator.cancel('ranking');
        refresh.resolve({
          payload: { id: 'stale-ranking' },
          requestId: 'server-stale-ranking',
          transactionId: refreshRequest.transactionId,
        });
      }
      await expect(primary).resolves.toBe(false);

      expect(detailExecute).toHaveBeenCalledOnce();
      expect(coordinator.personDetail.view).toBe(acceptedView);
      expect(coordinator.personDetail.acceptedInput).toBe(acceptedInput);
      expect(coordinator.personDetail.acceptedQuery).toBe(acceptedQuery);
      expect(coordinator.personDetail).toMatchObject({
        error: null,
        payload: { id: 'accepted-detail' },
        phase: 'ready',
        view: {
          order: 'desc',
          search: 'accepted',
        },
      });
    },
  );
});
