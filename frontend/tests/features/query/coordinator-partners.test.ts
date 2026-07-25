import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createQueryCoordinator,
  type OperationResponse,
  type QueryDrivers,
} from '../../../src/features/query/coordinator';
import type { PartnersInputV1 } from '../../../src/api/generated/query-wire/types.gen';
import { useQueryStore } from '../../../src/features/query/store';
import { catalogFixture } from './fixtures';

interface Payload {
  id: string;
}

type Drivers = QueryDrivers<Payload, Payload, unknown, Payload>;
type PartnersRequest = Parameters<
  NonNullable<Drivers['partners']>['execute']
>[0];
type CandidateRequest = Parameters<Drivers['candidates']['execute']>[0];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function readyStore(scope: 'global' | 'personal' = 'personal') {
  const store = useQueryStore();
  store.draft.scope = scope;
  store.draft.uid = scope === 'personal' ? 'luca' : '';
  store.draft.positionKeys = [
    'staff:anime:2',
    'staff:anime:101',
  ];
  return store;
}

function drivers(
  partnersExecute: NonNullable<Drivers['partners']>['execute'],
  candidatesExecute?: Drivers['candidates']['execute'],
): Drivers {
  return {
    candidates: {
      execute:
        candidatesExecute ??
        (async (request) => ({
          payload: { id: 'candidates' },
          requestId: `server-${request.transactionId}`,
          transactionId: request.transactionId,
        })),
    },
    partners: { execute: partnersExecute },
    rankings: {
      async execute(request) {
        return {
          payload: { id: 'rankings' },
          requestId: `server-${request.transactionId}`,
          transactionId: request.transactionId,
        };
      },
    },
  };
}

async function readyCoordinator(
  partnersExecute: NonNullable<Drivers['partners']>['execute'],
  scope: 'global' | 'personal' = 'personal',
) {
  const store = readyStore(scope);
  const coordinator = createQueryCoordinator<
    Payload,
    Payload,
    unknown,
    Payload
  >(store, drivers(partnersExecute));
  await coordinator.execute({
    catalog: catalogFixture(),
    mode: 'co-star',
  });
  return { coordinator, store };
}

const source: Readonly<PartnersInputV1> = {
  source: {
    personId: 1,
    positionKeys: ['staff:anime:2'],
  },
};
const otherSource: Readonly<PartnersInputV1> = {
  source: {
    personId: 2,
    positionKeys: ['staff:anime:101'],
  },
};
const view = Object.freeze({
  order: 'desc' as const,
  page: 1,
  pageSize: 10 as const,
  search: '',
  sort: 'count' as const,
});

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('partners coordinator resource', () => {
  it('runs independently from the primary pending surface and does not advance query revision', async () => {
    const pending = deferred<OperationResponse<Payload>>();
    const execute = vi.fn((_request: PartnersRequest) => pending.promise);
    const { coordinator, store } = await readyCoordinator(execute);
    const revision = store.revision;

    const request = coordinator.executePartners(source, view);
    const driverRequest = execute.mock.calls[0]![0] as PartnersRequest;

    expect(driverRequest).toMatchObject({
      input: source,
      query: coordinator.candidates.acceptedQuery,
      refreshCollection: false,
      view,
    });
    expect(driverRequest.input).not.toHaveProperty('refreshCollection');
    expect(coordinator.partners).toMatchObject({
      input: source,
      phase: 'pending',
      revision,
      viewPending: false,
    });
    expect(coordinator.pending.value).toBe(false);
    expect(coordinator.pendingOperation.value).toBeNull();
    expect(coordinator.candidates.phase).toBe('ready');

    pending.resolve({
      payload: { id: 'partners-ready' },
      requestId: 'server-partners-ready',
      transactionId: driverRequest.transactionId,
    });
    await expect(request).resolves.toBe(true);
    expect(coordinator.partners).toMatchObject({
      payload: { id: 'partners-ready' },
      phase: 'ready',
      requestId: 'server-partners-ready',
      revision,
    });
    expect(store.revision).toBe(revision);
  });

  it('admits only the latest source response and preserves canonical ordered identities', async () => {
    const first = deferred<OperationResponse<Payload>>();
    const second = deferred<OperationResponse<Payload>>();
    const execute = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const { coordinator } = await readyCoordinator(execute);
    const firstResult = coordinator.executePartners(
      {
        source: {
          personId: 1,
          positionKeys: [
            'staff:anime:2',
            'staff:anime:101',
          ],
        },
      },
      view,
    );
    const firstRequest = execute.mock.calls[0]![0] as PartnersRequest;
    const secondResult = coordinator.executePartners(
      {
        source: {
          personId: 2,
          positionKeys: ['staff:anime:101'],
        },
      },
      view,
    );
    const secondRequest = execute.mock.calls[1]![0] as PartnersRequest;

    expect(firstRequest.signal.aborted).toBe(true);
    expect(firstRequest.input.source.positionKeys).toEqual([
      'staff:anime:2',
      'staff:anime:101',
    ]);
    second.resolve({
      payload: { id: 'new-source' },
      requestId: 'server-new-source',
      transactionId: secondRequest.transactionId,
    });
    await expect(secondResult).resolves.toBe(true);
    first.resolve({
      payload: { id: 'old-source' },
      requestId: 'server-old-source',
      transactionId: firstRequest.transactionId,
    });
    await expect(firstResult).resolves.toBe(false);

    expect(coordinator.partners).toMatchObject({
      input: {
        source: {
          personId: 2,
          positionKeys: ['staff:anime:101'],
        },
      },
      payload: { id: 'new-source' },
      requestId: 'server-new-source',
    });
  });

  it('restores the complete accepted partners projection when a full source switch fails', async () => {
    const failedSwitch = deferred<OperationResponse<Payload>>();
    const execute = vi
      .fn()
      .mockImplementationOnce(async (request: PartnersRequest) => ({
        payload: { id: 'accepted-source' },
        requestId: 'server-accepted-source',
        transactionId: request.transactionId,
      }))
      .mockImplementationOnce(() => failedSwitch.promise);
    const { coordinator, store } = await readyCoordinator(execute);
    const acceptedView = {
      ...view,
      search: 'accepted',
    };
    await coordinator.executePartners(source, acceptedView);
    const acceptedInput = coordinator.partners.input;
    const acceptedPayload = coordinator.partners.payload;
    const acceptedRequestId = coordinator.partners.requestId;
    const acceptedResourceView = coordinator.partners.view;
    const revision = store.revision;

    const switching = coordinator.executePartners(otherSource, {
      ...view,
      page: 2,
      search: 'replacement',
    });
    expect(coordinator.partners).toMatchObject({
      input: otherSource,
      payload: acceptedPayload,
      phase: 'pending',
      requestId: acceptedRequestId,
      view: { page: 2, search: 'replacement' },
    });

    failedSwitch.reject(new Error('source unavailable'));
    await expect(switching).resolves.toBe(false);
    expect(coordinator.partners.input).toBe(acceptedInput);
    expect(coordinator.partners.payload).toBe(acceptedPayload);
    expect(coordinator.partners.requestId).toBe(acceptedRequestId);
    expect(coordinator.partners.view).toBe(acceptedResourceView);
    expect(coordinator.partners).toMatchObject({
      error: '查询暂时无法完成，请稍后重试',
      phase: 'ready',
      revision,
    });
    expect(store.revision).toBe(revision);
  });

  it('restores an accepted full source on cancel and rejects its stale completion', async () => {
    const staleSwitch = deferred<OperationResponse<Payload>>();
    const execute = vi
      .fn()
      .mockImplementationOnce(async (request: PartnersRequest) => ({
        payload: { id: 'stable-before-cancel' },
        requestId: 'server-stable-before-cancel',
        transactionId: request.transactionId,
      }))
      .mockImplementationOnce(() => staleSwitch.promise);
    const { coordinator, store } = await readyCoordinator(execute);
    const acceptedView = {
      ...view,
      order: 'asc' as const,
      search: 'stable',
    };
    await coordinator.executePartners(source, acceptedView);
    const acceptedInput = coordinator.partners.input;
    const acceptedPayload = coordinator.partners.payload;
    const acceptedRequestId = coordinator.partners.requestId;
    const acceptedResourceView = coordinator.partners.view;
    const revision = store.revision;

    const switching = coordinator.executePartners(otherSource, {
      ...view,
      pageSize: 20,
      search: 'stale',
    });
    const staleRequest = execute.mock.calls[1]![0] as PartnersRequest;
    coordinator.cancelPartners();

    expect(staleRequest.signal.aborted).toBe(true);
    expect(coordinator.partners.input).toBe(acceptedInput);
    expect(coordinator.partners.payload).toBe(acceptedPayload);
    expect(coordinator.partners.requestId).toBe(acceptedRequestId);
    expect(coordinator.partners.view).toBe(acceptedResourceView);
    expect(coordinator.partners).toMatchObject({
      phase: 'ready',
      revision,
      viewPending: false,
    });

    staleSwitch.resolve({
      payload: { id: 'must-not-commit' },
      requestId: 'server-stale-after-cancel',
      transactionId: staleRequest.transactionId,
    });
    await expect(switching).resolves.toBe(false);
    expect(coordinator.partners.input).toBe(acceptedInput);
    expect(coordinator.partners.payload).toBe(acceptedPayload);
    expect(coordinator.partners.requestId).toBe(acceptedRequestId);
    expect(coordinator.partners.view).toBe(acceptedResourceView);
    expect(store.revision).toBe(revision);
  });

  it('retains the accepted source/summary payload and request ID while a view request fails', async () => {
    const viewFailure = deferred<OperationResponse<Payload>>();
    const execute = vi
      .fn()
      .mockImplementationOnce(async (request: PartnersRequest) => ({
        payload: { id: 'stable-partners' },
        requestId: 'server-stable-partners',
        transactionId: request.transactionId,
      }))
      .mockImplementationOnce(() => viewFailure.promise);
    const { coordinator, store } = await readyCoordinator(execute);
    await coordinator.executePartners(source, view);
    const revision = store.revision;

    const next = coordinator.executePartnersView({
      ...view,
      page: 2,
      search: '林',
    });
    const request = execute.mock.calls[1]![0] as PartnersRequest;
    expect(coordinator.partners).toMatchObject({
      payload: { id: 'stable-partners' },
      requestId: 'server-stable-partners',
      view: { page: 2, search: '林' },
      viewPending: true,
    });
    expect(request.refreshCollection).toBe(false);

    viewFailure.reject(new Error('offline'));
    await expect(next).resolves.toBe(false);
    expect(coordinator.partners).toMatchObject({
      error: '查询暂时无法完成，请稍后重试',
      payload: { id: 'stable-partners' },
      phase: 'ready',
      requestId: 'server-stable-partners',
      revision,
      view: { page: 1, search: '' },
      viewPending: false,
    });
    expect(store.revision).toBe(revision);
  });

  it('rejects invalid identities and personal-only global sorts before transport', async () => {
    const execute = vi.fn();
    const { coordinator } = await readyCoordinator(execute, 'global');

    await expect(
      coordinator.executePartners(
        {
          source: {
            personId: 1,
            positionKeys: [],
          },
        },
        view,
      ),
    ).resolves.toBe(false);
    expect(coordinator.partners.error).toBe('合作人物来源身份无效');

    await expect(
      coordinator.executePartners(source, {
        ...view,
        sort: 'preference',
      }),
    ).resolves.toBe(false);
    expect(coordinator.partners.error).toBe('合作人物视图参数无效');
    expect(execute).not.toHaveBeenCalled();
  });

  it('keeps accepted partners during a new primary request and clears them only after success', async () => {
    const nextCandidates = deferred<OperationResponse<Payload>>();
    const candidatesExecute = vi
      .fn()
      .mockImplementationOnce(async (request: CandidateRequest) => ({
        payload: { id: 'initial-candidates' },
        requestId: 'server-initial-candidates',
        transactionId: request.transactionId,
      }))
      .mockImplementationOnce(() => nextCandidates.promise);
    const partnersExecute = vi.fn(
      async (request: PartnersRequest) => ({
        payload: { id: 'accepted-partners' },
        requestId: 'server-accepted-partners',
        transactionId: request.transactionId,
      }),
    );
    const store = readyStore();
    const coordinator = createQueryCoordinator<
      Payload,
      Payload,
      unknown,
      Payload
    >(store, drivers(partnersExecute, candidatesExecute));
    await coordinator.execute({
      catalog: catalogFixture(),
      mode: 'co-star',
    });
    await coordinator.executePartners(source, view);

    store.draft.positionKeys = ['staff:anime:101'];
    const primary = coordinator.execute({
      catalog: catalogFixture(),
      mode: 'co-star',
    });
    const request = candidatesExecute.mock.calls[1]![0] as CandidateRequest;
    expect(coordinator.partners.payload).toEqual({
      id: 'accepted-partners',
    });

    nextCandidates.resolve({
      payload: { id: 'new-candidates' },
      requestId: 'server-new-candidates',
      transactionId: request.transactionId,
    });
    await expect(primary).resolves.toBe(true);
    expect(coordinator.partners).toMatchObject({
      acceptedQuery: null,
      payload: null,
      phase: 'idle',
      revision: 0,
    });
  });
});
