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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function readyStore() {
  const store = useQueryStore();
  store.draft.uid = 'luca';
  store.draft.positionKeys = ['staff:anime:2'];
  return store;
}

function drivers(
  detailExecute: DetailExecute,
): QueryDrivers<RankingPayload, never, DetailPayload> {
  return {
    candidates: {
      async execute(): Promise<never> {
        throw new Error('not part of this test');
      },
    },
    personDetail: { execute: detailExecute },
    rankings: {
      async execute(request) {
        return {
          payload: { id: 'ranking' },
          requestId: 'server-ranking',
          transactionId: request.transactionId,
        };
      },
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
      input: { personId: 12 },
      payload: { id: '12' },
      phase: 'ready',
      revision: 1,
    });
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
});
