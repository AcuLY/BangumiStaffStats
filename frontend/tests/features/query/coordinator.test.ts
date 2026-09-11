import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createQueryCoordinator,
  type OperationRequest,
  type OperationResponse,
  type QueryDrivers,
  unavailableQueryDrivers,
} from '../../../src/features/query/coordinator';
import { CandidatesApiError } from '../../../src/api/candidates';
import { RankingsApiError } from '../../../src/api/rankings';
import type {
  CoStarInputV1,
  CoStarViewV1,
} from '../../../src/api/generated/query-wire/types.gen';
import { useQueryStore } from '../../../src/features/query/store';
import { catalogFixture } from './fixtures';

interface Payload {
  id: string;
}

interface SnapshotPayload extends Payload {
  readonly collection: Readonly<{ fetchedAt: string }>;
  readonly dataVersion: string;
}

function snapshotPayload(
  id: string,
  dataVersion: string,
  fetchedAt: string,
): SnapshotPayload {
  return Object.freeze({
    collection: Object.freeze({ fetchedAt }),
    dataVersion,
    id,
  });
}

type RankingRequest = Parameters<
  QueryDrivers<Payload, Payload>['rankings']['execute']
>[0];
type CandidateRequest = Parameters<
  QueryDrivers<Payload, Payload>['candidates']['execute']
>[0];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function drivers(
  rankings: QueryDrivers<Payload, Payload>['rankings']['execute'],
): QueryDrivers<Payload, Payload> {
  return {
    rankings: { execute: rankings },
    candidates: {
      async execute(request) {
        return {
          payload: { id: String(request.input.positionKey) },
          requestId: `server-${request.transactionId}`,
          transactionId: request.transactionId,
        };
      },
    },
  };
}

function readyStore() {
  const store = useQueryStore();
  store.draft.uid = 'luca';
  store.draft.positionKeys = ['staff:anime:2'];
  return store;
}

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('query coordinator', () => {
  it('applies a first all-position query without a synthetic key and blocks ranking until positions are chosen', async () => {
    const store = readyStore();
    store.draft.positionKeys = [];
    store.draft.includeNSFW = true;
    store.setCoStarPositionScope('all');
    const candidateExecute = vi.fn(async (request: CandidateRequest) => ({
      payload: { id: 'all' }, requestId: 'server-all',
      transactionId: request.transactionId,
    }));
    const rankingExecute = vi.fn();
    const coordinator = createQueryCoordinator(store, {
      candidates: { execute: candidateExecute },
      rankings: { execute: rankingExecute },
    });
    const catalog = catalogFixture();

    await expect(coordinator.execute({ catalog, mode: 'co-star' })).resolves.toBe(true);
    expect(candidateExecute.mock.calls[0]![0]).toMatchObject({
      input: { positionKey: null, positionScope: 'all' },
      query: { uid: 'luca', positionKeys: [], includeNSFW: true },
    });
    expect(store.applied?.positionKeys).toEqual([]);
    expect(store.appliedCoStarPositionScope).toBe('all');
    expect(store.coStarScopeDirty).toBe(false);
    expect(store.dirty).toBe(false);
    await expect(coordinator.executeApplied({ catalog, mode: 'ranking' })).resolves.toBe(false);
    await expect(coordinator.execute({ catalog, mode: 'ranking' })).resolves.toBe(false);
    expect(rankingExecute).not.toHaveBeenCalled();
    expect(coordinator.candidates.payload).toEqual({ id: 'all' });
  });

  it('executes a scope-only apply after view broadening and restores accepted scope on undo', async () => {
    const store = readyStore();
    const candidateExecute = vi.fn(async (request: CandidateRequest) => ({
      payload: snapshotPayload('candidates', 'dv1-same', '2026-09-10T00:00:00Z'),
      requestId: 'server-candidates', transactionId: request.transactionId,
    }));
    const coordinator = createQueryCoordinator(store, {
      candidates: { execute: candidateExecute }, rankings: { execute: vi.fn() },
    });
    const catalog = catalogFixture();
    await coordinator.execute({ catalog, mode: 'co-star' });
    await coordinator.executeCandidateView(
      { positionKey: null, positionScope: 'all' },
      { order: 'desc', page: 1, pageSize: 10, search: '', sort: 'count' },
    );
    expect(store.appliedCoStarPositionScope).toBe('query');
    store.setCoStarPositionScope('all');
    expect(store.dirty).toBe(false);
    expect(store.coStarScopeDirty).toBe(true);

    await expect(coordinator.execute({ catalog, mode: 'co-star' })).resolves.toBe(true);

    expect(candidateExecute).toHaveBeenCalledTimes(3);
    expect(store.appliedCoStarPositionScope).toBe('all');
    expect(store.coStarScopeDirty).toBe(false);
    expect(store.applied?.positionKeys).toEqual(['staff:anime:2']);
    store.setCoStarPositionScope('query');
    store.draft.includeNSFW = true;
    store.restoreDraft();
    expect(store.coStarPositionScope).toBe('all');
    expect(store.coStarScopeDirty).toBe(false);
    expect(store.draft.includeNSFW).toBe(false);
    expect(store.dirty).toBe(false);
  });

  it.each(['failure', 'cancel'] as const)('keeps accepted scope and result on scope-only %s', async (outcome) => {
    const store = readyStore();
    const pending = deferred<OperationResponse<Payload>>();
    const candidateExecute = vi.fn(async (request: CandidateRequest) => ({
      payload: { id: 'prior' }, requestId: 'server-prior',
      transactionId: request.transactionId,
    }));
    const coordinator = createQueryCoordinator(store, {
      candidates: { execute: candidateExecute }, rankings: { execute: vi.fn() },
    });
    const catalog = catalogFixture();
    await coordinator.execute({ catalog, mode: 'co-star' });
    candidateExecute.mockImplementationOnce(() => pending.promise);
    store.setCoStarPositionScope('all');
    const appliedBefore = store.applied;
    const running = coordinator.execute({ catalog, mode: 'co-star' });
    if (outcome === 'cancel') coordinator.cancel('co-star');
    pending.reject(new Error('unavailable'));

    await expect(running).resolves.toBe(false);
    expect(store.applied).toEqual(appliedBefore);
    expect(store.appliedCoStarPositionScope).toBe('query');
    expect(store.coStarPositionScope).toBe('all');
    expect(store.coStarScopeDirty).toBe(true);
    expect(coordinator.candidates.payload).toEqual({ id: 'prior' });
    expect(coordinator.candidates.acceptedInput).toEqual({ positionKey: null });
    store.restoreDraft();
    expect(store.coStarPositionScope).toBe('query');
  });

  it('preserves draft edits made while accepting all and during automatic scope promotion', async () => {
    const store = readyStore();
    const pending = deferred<OperationResponse<Payload>>();
    const candidateExecute = vi.fn(async (request: CandidateRequest) => ({
      payload: { id: 'prior' }, requestId: 'server-prior',
      transactionId: request.transactionId,
    }));
    const coordinator = createQueryCoordinator(store, {
      candidates: { execute: candidateExecute }, rankings: { execute: vi.fn() },
    });
    const catalog = catalogFixture();
    await coordinator.execute({ catalog, mode: 'co-star' });
    candidateExecute.mockImplementationOnce(() => pending.promise);
    store.setCoStarPositionScope('all');
    const running = coordinator.execute({ catalog, mode: 'co-star' });
    store.setCoStarPositionScope('query');
    store.draft.includeNSFW = true;
    pending.resolve({
      payload: { id: 'all' }, requestId: 'server-all',
      transactionId: candidateExecute.mock.calls[1]![0].transactionId,
    });

    await expect(running).resolves.toBe(true);
    expect(store.appliedCoStarPositionScope).toBe('all');
    expect(store.coStarPositionScope).toBe('query');
    expect(store.coStarScopeDirty).toBe(true);
    expect(store.applied?.includeNSFW).toBe(false);
    expect(store.draft.includeNSFW).toBe(true);
    expect(store.dirty).toBe(true);
    store.acceptCoStarPositionScope('all', 'all');
    expect(store.coStarPositionScope).toBe('query');
    store.restoreDraft();
    expect(store.coStarPositionScope).toBe('all');
    store.setCoStarPositionScope('query', true);
    store.acceptCoStarPositionScope('all', 'query');
    expect(store.coStarPositionScope).toBe('all');
    expect(store.coStarScopeDirty).toBe(false);
  });

  it('uses accepted all scope with Applied Query while preserving ranking keys and unrelated draft edits', async () => {
    const store = readyStore();
    const rankingExecute = vi.fn(async (request: RankingRequest) => ({
      payload: { id: 'ranking' }, requestId: 'server-ranking',
      transactionId: request.transactionId,
    }));
    const candidateExecute = vi.fn(async (request: CandidateRequest) => ({
      payload: { id: 'candidates' }, requestId: 'server-candidates',
      transactionId: request.transactionId,
    }));
    const coordinator = createQueryCoordinator(store, {
      candidates: { execute: candidateExecute }, rankings: { execute: rankingExecute },
    });
    const catalog = catalogFixture();
    await coordinator.execute({ catalog, mode: 'ranking' });
    const applied = store.applied;
    store.draft.includeNSFW = true;
    store.draft.uid = 'unapplied-user';
    store.setCoStarPositionScope('all', true);

    await expect(coordinator.executeApplied({ catalog, mode: 'co-star' })).resolves.toBe(true);

    expect(candidateExecute.mock.calls[0]![0].input).toEqual({ positionKey: null, positionScope: 'all' });
    expect(candidateExecute.mock.calls[0]![0].query).toEqual(applied);
    expect(store.applied?.positionKeys).toEqual(['staff:anime:2']);
    expect(store.draft.uid).toBe('unapplied-user');
    expect(store.draft.includeNSFW).toBe(true);
    expect(store.dirty).toBe(true);
    expect(store.coStarScopeDirty).toBe(false);
  });

  it('commits resource, applied query, and monotonic revision together', async () => {
    const store = readyStore();
    const execute = vi.fn(
      async (
        request: OperationRequest<
          Readonly<Record<string, never>>,
          Readonly<Record<string, unknown>>
        >,
      ): Promise<OperationResponse<Payload>> => ({
        payload: { id: 'first' },
        requestId: `server-${request.transactionId}`,
        transactionId: request.transactionId,
      }),
    );
    const coordinator = createQueryCoordinator(store, drivers(execute as never));

    expect(
      await coordinator.execute({
        catalog: catalogFixture(),
        mode: 'ranking',
      }),
    ).toBe(true);

    expect(store.revision).toBe(1);
    expect(store.applied?.positionKeys).toEqual(['staff:anime:2']);
    expect(coordinator.rankings).toMatchObject({
      payload: { id: 'first' },
      phase: 'ready',
      requestId: 'server-rankings-1',
      revision: 1,
    });
    expect(store.dirty).toBe(false);

    expect(
      await coordinator.execute({
        catalog: catalogFixture(),
        mode: 'ranking',
      }),
    ).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(store.revision).toBe(1);
    expect(coordinator.lastOperationFeedback.value).toBeNull();
    expect(coordinator.rankings.feedback).toBeNull();
  });

  it('loads a missing mode from Applied Query without submitting a dirty Draft', async () => {
    const store = readyStore();
    const sharedVersion = `dv1-${'a'.repeat(64)}`;
    const sharedFetchedAt = '2026-07-25T00:00:00Z';
    const rankingExecute = vi.fn(async (request: RankingRequest) => ({
      payload: snapshotPayload('ranking', sharedVersion, sharedFetchedAt),
      requestId: 'server-ranking',
      transactionId: request.transactionId,
    }));
    const candidateExecute = vi.fn(async (request: CandidateRequest) => ({
      payload: snapshotPayload('candidates', sharedVersion, sharedFetchedAt),
      requestId: 'server-candidates',
      transactionId: request.transactionId,
    }));
    const coordinator = createQueryCoordinator(store, {
      candidates: { execute: candidateExecute },
      rankings: { execute: rankingExecute },
    });
    const catalog = catalogFixture();

    await expect(
      coordinator.execute({ catalog, mode: 'ranking' }),
    ).resolves.toBe(true);
    store.draft.includeNSFW = true;
    expect(store.dirty).toBe(true);

    await expect(
      coordinator.executeApplied({ catalog, mode: 'co-star' }),
    ).resolves.toBe(true);

    expect(candidateExecute).toHaveBeenCalledOnce();
    expect(candidateExecute.mock.calls[0]![0].query.includeNSFW).toBe(false);
    expect(store.draft.includeNSFW).toBe(true);
    expect(store.dirty).toBe(true);
    expect(store.revision).toBe(1);
    expect(coordinator.candidates).toMatchObject({
      acceptedQuery: { includeNSFW: false },
      payload: { id: 'candidates' },
      phase: 'ready',
      revision: 1,
    });
  });

  it('accepts only the latest of two explicitly deferred responses', async () => {
    const store = readyStore();
    const firstDeferred = deferred<OperationResponse<Payload>>();
    const secondDeferred = deferred<OperationResponse<Payload>>();
    const execute = vi
      .fn()
      .mockImplementationOnce(() => firstDeferred.promise)
      .mockImplementationOnce(() => secondDeferred.promise);
    const coordinator = createQueryCoordinator(store, drivers(execute));
    const catalog = catalogFixture();

    const first = coordinator.execute({ catalog, mode: 'ranking' });
    store.draft.positionKeys = ['staff:anime:101'];
    const second = coordinator.execute({ catalog, mode: 'ranking' });
    const secondRequest = execute.mock.calls[1]![0];
    secondDeferred.resolve({
      payload: { id: 'new' },
      requestId: 'server-second',
      transactionId: secondRequest.transactionId,
    });
    expect(await second).toBe(true);

    const firstRequest = execute.mock.calls[0]![0];
    firstDeferred.resolve({
      payload: { id: 'old' },
      requestId: 'server-first',
      transactionId: firstRequest.transactionId,
    });
    expect(await first).toBe(false);

    expect(store.applied?.positionKeys).toEqual(['staff:anime:101']);
    expect(coordinator.rankings.payload).toEqual({ id: 'new' });
    expect(store.revision).toBe(1);
  });

  it('keeps the request snapshot applied when Draft changes during pending', async () => {
    const store = readyStore();
    const pending = deferred<OperationResponse<Payload>>();
    let transactionId = '';
    const execute = vi.fn((request: RankingRequest) => {
      transactionId = request.transactionId;
      return pending.promise;
    });
    const coordinator = createQueryCoordinator(store, drivers(execute));

    const request = coordinator.execute({
      catalog: catalogFixture(),
      mode: 'ranking',
    });
    store.draft.positionKeys = ['staff:anime:101'];
    pending.resolve({
      payload: { id: 'snapshot' },
      requestId: 'server-snapshot',
      transactionId,
    });

    expect(await request).toBe(true);
    expect(store.applied?.positionKeys).toEqual(['staff:anime:2']);
    expect(store.dirty).toBe(true);
  });

  it('admits only the latest revision-bound candidates application', async () => {
    const store = readyStore();
    const firstDeferred = deferred<OperationResponse<Payload>>();
    const secondDeferred = deferred<OperationResponse<Payload>>();
    const candidateExecute = vi
      .fn()
      .mockImplementationOnce(() => firstDeferred.promise)
      .mockImplementationOnce(() => secondDeferred.promise);
    const coordinator = createQueryCoordinator(store, {
      rankings: drivers(vi.fn()).rankings,
      candidates: { execute: candidateExecute },
    });
    const catalog = catalogFixture();

    const first = coordinator.execute({
      candidateInput: { positionKey: 'staff:anime:2' },
      catalog,
      mode: 'co-star',
    });
    const firstRequest = candidateExecute.mock
      .calls[0]![0] as CandidateRequest;
    store.draft.positionKeys = ['staff:anime:101'];
    const second = coordinator.execute({
      candidateInput: { positionKey: 'staff:anime:101' },
      catalog,
      mode: 'co-star',
    });
    const secondRequest = candidateExecute.mock
      .calls[1]![0] as CandidateRequest;
    expect(firstRequest.signal.aborted).toBe(true);
    expect(coordinator.candidates).toMatchObject({
      input: { positionKey: 'staff:anime:101' },
      phase: 'pending',
    });

    secondDeferred.resolve({
      payload: { id: 'new-candidates' },
      requestId: 'server-new-candidates',
      transactionId: secondRequest.transactionId,
    });
    await expect(second).resolves.toBe(true);
    firstDeferred.resolve({
      payload: { id: 'old-candidates' },
      requestId: 'server-old-candidates',
      transactionId: firstRequest.transactionId,
    });
    await expect(first).resolves.toBe(false);

    expect(store.applied?.positionKeys).toEqual(['staff:anime:101']);
    expect(store.revision).toBe(1);
    expect(coordinator.candidates).toMatchObject({
      input: { positionKey: 'staff:anime:101' },
      payload: { id: 'new-candidates' },
      requestId: 'server-new-candidates',
      revision: 1,
    });
  });

  it('replays and persists an accepted candidate input instead of replacing it with the first position', async () => {
    const store = readyStore();
    store.draft.positionKeys = ['staff:anime:2', 'staff:anime:101'];
    const candidateExecute = vi.fn(async (request) => ({
      payload: { id: String(request.input.positionKey) },
      requestId: `server-${request.transactionId}`,
      transactionId: request.transactionId,
    }));
    const coordinator = createQueryCoordinator(store, {
      rankings: drivers(vi.fn()).rankings,
      candidates: { execute: candidateExecute },
    });

    await expect(
      coordinator.execute({
        candidateInput: { positionKey: 'staff:anime:101' },
        catalog: catalogFixture(),
        mode: 'co-star',
      }),
    ).resolves.toBe(true);

    expect(candidateExecute).toHaveBeenCalledOnce();
    expect(candidateExecute.mock.calls[0]![0].input).toEqual({
      positionKey: 'staff:anime:101',
    });
    expect(coordinator.candidates.input).toEqual({
      positionKey: 'staff:anime:101',
    });
    expect(coordinator.candidates.payload).toEqual({
      id: 'staff:anime:101',
    });
  });

  it('shows the requested primary candidate input while pending and rolls it back on failure', async () => {
    const store = readyStore();
    store.draft.positionKeys = ['staff:anime:2', 'staff:anime:101'];
    const rejected = deferred<OperationResponse<Payload>>();
    const candidateExecute = vi
      .fn()
      .mockImplementationOnce(async (request: CandidateRequest) => ({
        payload: { id: 'accepted-position' },
        requestId: 'server-accepted-position',
        transactionId: request.transactionId,
      }))
      .mockImplementationOnce(() => rejected.promise);
    const coordinator = createQueryCoordinator(store, {
      rankings: drivers(vi.fn()).rankings,
      candidates: { execute: candidateExecute },
    });
    const catalog = catalogFixture();

    await coordinator.execute({
      candidateInput: { positionKey: 'staff:anime:2' },
      catalog,
      mode: 'co-star',
    });
    const acceptedView = coordinator.candidates.view;
    const pending = coordinator.execute({
      candidateInput: { positionKey: 'staff:anime:101' },
      catalog,
      mode: 'co-star',
    });

    expect(coordinator.candidates).toMatchObject({
      input: { positionKey: 'staff:anime:101' },
      payload: { id: 'accepted-position' },
      phase: 'pending',
      requestId: 'server-accepted-position',
    });

    rejected.reject(new Error('candidate position failed'));
    await expect(pending).resolves.toBe(false);
    expect(coordinator.candidates).toMatchObject({
      error: '查询暂时无法完成，请稍后重试',
      input: { positionKey: 'staff:anime:2' },
      payload: { id: 'accepted-position' },
      phase: 'ready',
      requestId: 'server-accepted-position',
      view: acceptedView,
    });
  });

  it('accepts a candidate position change as a new authoritative primary snapshot', async () => {
    const store = readyStore();
    store.draft.positionKeys = ['staff:anime:2', 'staff:anime:101'];
    const candidateExecute = vi.fn(async (request) => ({
      payload: { id: String(request.input.positionKey) },
      requestId: `server-${request.transactionId}`,
      transactionId: request.transactionId,
    }));
    const coordinator = createQueryCoordinator(store, {
      rankings: drivers(vi.fn()).rankings,
      candidates: { execute: candidateExecute },
    });
    const catalog = catalogFixture();

    await coordinator.execute({
      candidateInput: { positionKey: 'staff:anime:2' },
      catalog,
      mode: 'co-star',
    });
    await coordinator.execute({
      candidateInput: { positionKey: 'staff:anime:101' },
      catalog,
      mode: 'co-star',
    });

    expect(candidateExecute).toHaveBeenCalledTimes(2);
    expect(candidateExecute.mock.calls[1]![0].input).toEqual({
      positionKey: 'staff:anime:101',
    });
    expect(coordinator.candidates.input.positionKey).toBe(
      'staff:anime:101',
    );
    expect(coordinator.candidates.payload).toEqual({
      id: 'staff:anime:101',
    });
    expect(store.revision).toBe(2);
  });

  it('shares one payload snapshot owner across modes and reloads a stale primary surface', async () => {
    const store = readyStore();
    const versionA = `dv1-${'a'.repeat(64)}`;
    const versionB = `dv1-${'b'.repeat(64)}`;
    const fetchedAtA = '2026-07-25T08:00:00Z';
    const fetchedAtB = '2026-07-25T08:05:00Z';
    let rankingCall = 0;
    const rankings = vi.fn(async (request: RankingRequest) => {
      rankingCall += 1;
      const current = rankingCall === 1;
      return {
        payload: snapshotPayload(
          current ? 'ranking-a' : 'ranking-b',
          current ? versionA : versionB,
          current ? fetchedAtA : fetchedAtB,
        ),
        requestId: `server-${request.transactionId}`,
        transactionId: request.transactionId,
      };
    });
    const candidates = vi.fn(async (request: CandidateRequest) => ({
      payload: snapshotPayload(
        'candidates-b',
        versionB,
        fetchedAtB,
      ),
      requestId: `server-${request.transactionId}`,
      transactionId: request.transactionId,
    }));
    const coordinator = createQueryCoordinator<
      SnapshotPayload,
      SnapshotPayload
    >(store, {
      candidates: { execute: candidates },
      rankings: { execute: rankings },
    });
    const catalog = catalogFixture();

    await coordinator.execute({ catalog, mode: 'ranking' });
    expect(store.revision).toBe(1);
    expect(coordinator.snapshotIdentity.value).toBe(
      JSON.stringify([versionA, fetchedAtA]),
    );

    await coordinator.execute({ catalog, mode: 'co-star' });
    expect(store.revision).toBe(2);
    expect(coordinator.snapshotIdentity.value).toBe(
      JSON.stringify([versionB, fetchedAtB]),
    );
    expect(coordinator.rankings.revision).toBe(1);

    await coordinator.execute({ catalog, mode: 'ranking' });
    expect(rankings).toHaveBeenCalledTimes(2);
    expect(coordinator.rankings).toMatchObject({
      payload: { id: 'ranking-b' },
      revision: 2,
    });
    expect(store.revision).toBe(2);
  });

  it('rejects a primary view projection from a different snapshot without replacing accepted data', async () => {
    const store = readyStore();
    const versionA = `dv1-${'a'.repeat(64)}`;
    const versionB = `dv1-${'b'.repeat(64)}`;
    const fetchedAt = '2026-07-25T08:00:00Z';
    let call = 0;
    const rankings = vi.fn(async (request: RankingRequest) => {
      call += 1;
      return {
        payload: snapshotPayload(
          call === 1 ? 'accepted' : 'mismatched-view',
          call === 1 ? versionA : versionB,
          fetchedAt,
        ),
        requestId: `server-${request.transactionId}`,
        transactionId: request.transactionId,
      };
    });
    const coordinator = createQueryCoordinator<
      SnapshotPayload,
      SnapshotPayload
    >(store, {
      candidates: {
        async execute(): Promise<never> {
          throw new Error('not part of this test');
        },
      },
      rankings: { execute: rankings },
    });

    await coordinator.execute({
      catalog: catalogFixture(),
      mode: 'ranking',
    });
    await expect(
      coordinator.executeRankingView({
        ...coordinator.rankings.view,
        page: 2,
      }),
    ).resolves.toBe(false);

    expect(coordinator.rankings).toMatchObject({
      error: '结果数据版本已变化，请重新查询后重试',
      payload: { id: 'accepted' },
      phase: 'ready',
      revision: 1,
      view: { page: 1 },
    });
    expect(store.revision).toBe(1);
    expect(coordinator.snapshotIdentity.value).toBe(
      JSON.stringify([versionA, fetchedAt]),
    );
  });

  it('rejects an invalid candidate position before the same-query no-op', async () => {
    const store = readyStore();
    const candidateExecute = vi.fn(async (request) => ({
      payload: { id: String(request.input.positionKey) },
      requestId: `server-${request.transactionId}`,
      transactionId: request.transactionId,
    }));
    const coordinator = createQueryCoordinator(store, {
      rankings: drivers(vi.fn()).rankings,
      candidates: { execute: candidateExecute },
    });
    const catalog = catalogFixture();

    await coordinator.execute({
      candidateInput: { positionKey: 'staff:anime:2' },
      catalog,
      mode: 'co-star',
    });
    await expect(
      coordinator.execute({
        candidateInput: { positionKey: 'staff:anime:101' },
        catalog,
        mode: 'co-star',
      }),
    ).resolves.toBe(false);

    expect(candidateExecute).toHaveBeenCalledTimes(1);
    expect(coordinator.candidates.input.positionKey).toBe('staff:anime:2');
    expect(coordinator.candidates.payload).toEqual({
      id: 'staff:anime:2',
    });
    expect(coordinator.candidates.error).toBe(
      '查询暂时无法完成，请稍后重试',
    );
    expect(store.revision).toBe(1);
  });

  it('rejects a candidate input outside the applied query or catalog capability', async () => {
    const store = readyStore();
    const candidateExecute = vi.fn();
    const coordinator = createQueryCoordinator(store, {
      rankings: drivers(vi.fn()).rankings,
      candidates: { execute: candidateExecute },
    });

    await expect(
      coordinator.execute({
        candidateInput: { positionKey: 'staff:anime:101' },
        catalog: catalogFixture(),
        mode: 'co-star',
      }),
    ).resolves.toBe(false);
    expect(candidateExecute).not.toHaveBeenCalled();
    expect(coordinator.candidates.error).toBe(
      '查询暂时无法完成，请稍后重试',
    );

    const catalog = catalogFixture();
    const selected = catalog.positionsByKey.get('staff:anime:2')!;
    const unsupported = Object.freeze({
      ...selected,
      capabilities: Object.freeze(
        selected.capabilities.filter(
          (capability) => capability !== 'candidates',
        ),
      ),
    });
    const positions = Object.freeze(
      catalog.positions.map((position) =>
        position.key === unsupported.key ? unsupported : position,
      ),
    );
    const unsupportedCatalog = Object.freeze({
      ...catalog,
      positions,
      positionsByKey: new Map(
        positions.map((position) => [position.key, position]),
      ),
    });
    await expect(
      coordinator.execute({
        candidateInput: { positionKey: 'staff:anime:2' },
        catalog: unsupportedCatalog,
        mode: 'co-star',
      }),
    ).resolves.toBe(false);
    expect(candidateExecute).not.toHaveBeenCalled();
    expect(store.fieldErrors.positionKeys).toBe(
      '所选职位不适用于当前查询',
    );
  });

  it('restores prior usable data after a changed-query failure and commits an ordinary stale warning', async () => {
    const store = readyStore();
    const execute = vi
      .fn()
      .mockImplementationOnce(async (request) => ({
        payload: { id: 'old' },
        requestId: `server-${request.transactionId}`,
        transactionId: request.transactionId,
      }))
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(async (request) => ({
        payload: { id: 'stale' },
        requestId: `server-${request.transactionId}`,
        transactionId: request.transactionId,
        warningCodes: ['COLLECTION_STALE'],
      }));
    const coordinator = createQueryCoordinator(store, drivers(execute));
    const catalog = catalogFixture();

    await coordinator.execute({ catalog, mode: 'ranking' });
    store.draft.includeNSFW = true;
    expect(
      await coordinator.execute({
        catalog,
        mode: 'ranking',
      }),
    ).toBe(false);
    expect(coordinator.rankings.payload).toEqual({ id: 'old' });
    expect(coordinator.rankings.phase).toBe('ready');
    expect(store.revision).toBe(1);
    expect(store.dirty).toBe(true);
    expect(coordinator.lastOperationFeedback.value).toMatchObject({
      kind: 'error',
      message: '查询暂时无法完成，请稍后重试',
      operation: 'rankings',
    });

    expect(
      await coordinator.execute({
        catalog,
        mode: 'ranking',
      }),
    ).toBe(true);
    expect(coordinator.rankings.payload).toEqual({ id: 'stale' });
    expect(coordinator.rankings.staleCollection).toBe(true);
    expect(coordinator.rankings.feedback).toContain('最近一次可用数据');
    expect(coordinator.lastOperationFeedback.value).toMatchObject({
      kind: 'warning',
      operation: 'rankings',
    });
    expect(store.revision).toBe(2);
  });

  it('clears transient operation feedback when a newer request starts and succeeds cleanly', async () => {
    const store = readyStore();
    const retry = deferred<OperationResponse<Payload>>();
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(() => retry.promise);
    const coordinator = createQueryCoordinator(store, drivers(execute));
    const catalog = catalogFixture();

    await expect(
      coordinator.execute({ catalog, mode: 'ranking' }),
    ).resolves.toBe(false);
    expect(coordinator.lastOperationFeedback.value?.kind).toBe('error');

    const pendingRetry = coordinator.execute({ catalog, mode: 'ranking' });
    expect(coordinator.lastOperationFeedback.value).toBeNull();
    retry.resolve({
      payload: { id: 'ready' },
      requestId: 'server-ready',
      transactionId: (execute.mock.calls[1]![0] as RankingRequest)
        .transactionId,
    });

    await expect(pendingRetry).resolves.toBe(true);
    expect(coordinator.lastOperationFeedback.value).toBeNull();
  });

  it('atomically restores the last ready resource when a changed query is cancelled', async () => {
    const store = readyStore();
    const changedQuery = deferred<OperationResponse<Payload>>();
    const execute = vi
      .fn()
      .mockImplementationOnce(async (request: RankingRequest) => ({
        payload: { id: 'ready' },
        requestId: `server-${request.transactionId}`,
        transactionId: request.transactionId,
      }))
      .mockImplementationOnce(() => changedQuery.promise);
    const coordinator = createQueryCoordinator(store, drivers(execute));
    const catalog = catalogFixture();

    await coordinator.execute({ catalog, mode: 'ranking' });
    store.draft.includeNSFW = true;
    const pendingQuery = coordinator.execute({
      catalog,
      mode: 'ranking',
    });
    const changedRequest = execute.mock.calls[1]![0] as RankingRequest;

    expect(coordinator.rankings.phase).toBe('pending');
    expect(coordinator.rankings.payload).toEqual({ id: 'ready' });

    coordinator.cancel('ranking');
    expect(coordinator.rankings).toMatchObject({
      feedback: '查询已取消',
      payload: { id: 'ready' },
      phase: 'ready',
      revision: 1,
    });
    expect(coordinator.pending.value).toBe(false);

    changedQuery.resolve({
      payload: { id: 'too-late' },
      requestId: 'server-too-late',
      transactionId: changedRequest.transactionId,
    });
    await expect(pendingQuery).resolves.toBe(false);
    expect(coordinator.rankings.payload).toEqual({ id: 'ready' });
  });

  it('rolls a failed superseding request back to the stable preflight snapshot', async () => {
    const store = readyStore();
    const firstPending = deferred<OperationResponse<Payload>>();
    const secondPending = deferred<OperationResponse<Payload>>();
    const execute = vi
      .fn()
      .mockImplementationOnce(async (request: RankingRequest) => ({
        payload: { id: 'stable' },
        requestId: `server-${request.transactionId}`,
        transactionId: request.transactionId,
      }))
      .mockImplementationOnce(() => firstPending.promise)
      .mockImplementationOnce(() => secondPending.promise);
    const coordinator = createQueryCoordinator(store, drivers(execute));
    const catalog = catalogFixture();

    await coordinator.execute({ catalog, mode: 'ranking' });
    store.draft.includeNSFW = true;
    const first = coordinator.execute({
      catalog,
      mode: 'ranking',
    });
    store.draft.positionKeys = ['staff:anime:101'];
    const superseding = coordinator.execute({ catalog, mode: 'ranking' });
    const firstRequest = execute.mock.calls[1]![0] as RankingRequest;

    secondPending.reject(new Error('offline'));
    await expect(superseding).resolves.toBe(false);
    expect(coordinator.rankings).toMatchObject({
      payload: { id: 'stable' },
      phase: 'ready',
      revision: 1,
    });

    firstPending.resolve({
      payload: { id: 'late-first' },
      requestId: 'server-late-first',
      transactionId: firstRequest.transactionId,
    });
    await expect(first).resolves.toBe(false);
    expect(coordinator.rankings.payload).toEqual({ id: 'stable' });
    expect(store.applied?.positionKeys).toEqual(['staff:anime:2']);
    expect(store.dirty).toBe(true);
  });

  it.each(['ranking', 'co-star'] as const)(
    'rejects a mismatched response transaction ID before mutating %s',
    async (mode) => {
      const store = readyStore();
      const driversWithMismatch: QueryDrivers<Payload, Payload> = {
        rankings: {
          async execute() {
            return {
              payload: { id: 'ranking' },
              requestId: 'server-ranking',
              transactionId: '',
            };
          },
        },
        candidates: {
          async execute() {
            return {
              payload: { id: 'candidate' },
              requestId: 'server-candidate',
              transactionId: 'wrong-id',
            };
          },
        },
      };
      const coordinator = createQueryCoordinator(store, driversWithMismatch);

      await expect(
        coordinator.execute({ catalog: catalogFixture(), mode }),
      ).resolves.toBe(false);

      expect(store.applied).toBeNull();
      expect(store.revision).toBe(0);
      const resource =
        mode === 'ranking' ? coordinator.rankings : coordinator.candidates;
      expect(resource.payload).toBeNull();
      expect(resource.phase).toBe('idle');
      expect(resource.error).toBe('查询暂时无法完成，请稍后重试');
    },
  );

  it('keeps a successful commit when the best-effort URL callback throws', async () => {
    const store = readyStore();
    const execute = vi.fn(async (request: RankingRequest) => ({
      payload: { id: 'committed' },
      requestId: `server-${request.transactionId}`,
      transactionId: request.transactionId,
    }));
    const coordinator = createQueryCoordinator(
      store,
      drivers(execute),
      () => {
        throw new DOMException('blocked', 'SecurityError');
      },
    );

    await expect(
      coordinator.execute({
        catalog: catalogFixture(),
        mode: 'ranking',
      }),
    ).resolves.toBe(true);

    expect(store.revision).toBe(1);
    expect(store.applied?.positionKeys).toEqual(['staff:anime:2']);
    expect(coordinator.rankings).toMatchObject({
      feedback: '查询已应用，但地址栏同步未完成',
      payload: { id: 'committed' },
      phase: 'ready',
      revision: 1,
    });
  });

  it('cancels the originating operation after the visible mode changes', async () => {
    const store = readyStore();
    const pendingResponse = deferred<OperationResponse<Payload>>();
    let rankingTransactionId = '';
    let rankingSignal: AbortSignal | undefined;
    const execute = vi.fn((request: RankingRequest) => {
      rankingTransactionId = request.transactionId;
      rankingSignal = request.signal;
      return pendingResponse.promise;
    });
    const coordinator = createQueryCoordinator(store, drivers(execute));

    const pending = coordinator.execute({
      catalog: catalogFixture(),
      mode: 'ranking',
    });
    expect(coordinator.pendingOperation.value).toBe('rankings');

    coordinator.cancelPending();
    expect(rankingSignal).toBeDefined();
    expect(rankingSignal!.aborted).toBe(true);
    expect(coordinator.pending.value).toBe(false);
    expect(coordinator.pendingOperation.value).toBeNull();
    expect(coordinator.rankings.phase).toBe('idle');
    expect(coordinator.rankings.feedback).toBe('查询已取消');
    expect(coordinator.lastOperationFeedback.value).toEqual({
      kind: 'status',
      message: '查询已取消',
      operation: 'rankings',
    });

    pendingResponse.resolve({
      payload: { id: 'late' },
      requestId: 'server-late',
      transactionId: rankingTransactionId,
    });
    await expect(pending).resolves.toBe(false);
    expect(store.applied).toBeNull();
  });

  it('runs a candidate view transaction without changing Applied or revision', async () => {
    const store = readyStore();
    store.draft.positionKeys = ['staff:anime:2', 'staff:anime:101'];
    const pendingView = deferred<OperationResponse<Payload>>();
    const candidateExecute = vi
      .fn()
      .mockImplementationOnce(async (request: CandidateRequest) => ({
        payload: { id: 'core' },
        requestId: 'server-candidate-core',
        transactionId: request.transactionId,
      }))
      .mockImplementationOnce(() => pendingView.promise);
    const coordinator = createQueryCoordinator(store, {
      rankings: drivers(vi.fn()).rankings,
      candidates: { execute: candidateExecute },
    });
    const catalog = catalogFixture();

    await coordinator.execute({
      candidateInput: { positionKey: 'staff:anime:2' },
      catalog,
      mode: 'co-star',
    });
    const applied = store.applied;
    const revision = store.revision;
    const viewRequest = coordinator.executeCandidateView(
      { positionKey: 'staff:anime:101' },
      {
        order: 'asc',
        page: 1,
        pageSize: 20,
        search: '林',
        sort: 'globalAverage',
      },
    );
    const request = candidateExecute.mock.calls[1]![0] as CandidateRequest;

    expect(request.query).toBe(coordinator.candidates.acceptedQuery);
    expect(request.input.positionKey).toBe('staff:anime:101');
    expect(request.view).toEqual({
      order: 'asc',
      page: 1,
      pageSize: 20,
      search: '林',
      sort: 'globalAverage',
    });
    expect(coordinator.candidates).toMatchObject({
      input: { positionKey: 'staff:anime:101' },
      payload: { id: 'core' },
      phase: 'ready',
      requestId: 'server-candidate-core',
      viewPending: true,
    });
    expect(store.applied).toBe(applied);
    expect(store.revision).toBe(revision);

    pendingView.resolve({
      payload: { id: 'searched' },
      requestId: 'server-candidate-view',
      staleCollection: true,
      transactionId: request.transactionId,
      warningCodes: ['COLLECTION_STALE'],
    });
    await expect(viewRequest).resolves.toBe(true);
    expect(coordinator.candidates).toMatchObject({
      feedback: '收藏数据暂时无法更新，当前显示最近一次可用数据',
      input: { positionKey: 'staff:anime:101' },
      payload: { id: 'searched' },
      requestId: 'server-candidate-view',
      revision,
      staleCollection: true,
      view: { search: '林' },
      viewPending: false,
    });
    expect(store.applied).toBe(applied);
    expect(store.revision).toBe(revision);
  });

  it('admits only the latest superseding candidate view response', async () => {
    const store = readyStore();
    const firstView = deferred<OperationResponse<Payload>>();
    const secondView = deferred<OperationResponse<Payload>>();
    const candidateExecute = vi
      .fn()
      .mockImplementationOnce(async (request: CandidateRequest) => ({
        payload: { id: 'core' },
        requestId: 'server-candidate-core',
        transactionId: request.transactionId,
      }))
      .mockImplementationOnce(() => firstView.promise)
      .mockImplementationOnce(() => secondView.promise);
    const coordinator = createQueryCoordinator(store, {
      rankings: drivers(vi.fn()).rankings,
      candidates: { execute: candidateExecute },
    });
    await coordinator.execute({
      catalog: catalogFixture(),
      mode: 'co-star',
    });

    const first = coordinator.executeCandidateView(
      coordinator.candidates.input,
      {
        ...coordinator.candidates.view,
        search: '旧',
      } as never,
    );
    const firstRequest = candidateExecute.mock
      .calls[1]![0] as CandidateRequest;
    const second = coordinator.executeCandidateView(
      coordinator.candidates.input,
      {
        ...coordinator.candidates.view,
        search: '新',
      } as never,
    );
    const secondRequest = candidateExecute.mock
      .calls[2]![0] as CandidateRequest;
    expect(firstRequest.signal.aborted).toBe(true);

    secondView.resolve({
      payload: { id: 'new' },
      requestId: 'server-candidate-new',
      transactionId: secondRequest.transactionId,
    });
    await expect(second).resolves.toBe(true);
    firstView.resolve({
      payload: { id: 'old' },
      requestId: 'server-candidate-old',
      transactionId: firstRequest.transactionId,
    });
    await expect(first).resolves.toBe(false);

    expect(coordinator.candidates).toMatchObject({
      payload: { id: 'new' },
      requestId: 'server-candidate-new',
      revision: 1,
      view: { search: '新' },
      viewPending: false,
    });
    expect(store.revision).toBe(1);
  });

  it('rolls a failed or cancelled candidate view back to the accepted page', async () => {
    const store = readyStore();
    store.draft.positionKeys = ['staff:anime:2', 'staff:anime:101'];
    const pendingView = deferred<OperationResponse<Payload>>();
    const candidateExecute = vi
      .fn()
      .mockImplementationOnce(async (request: CandidateRequest) => ({
        payload: { id: 'stable' },
        requestId: 'server-candidate-stable',
        transactionId: request.transactionId,
      }))
      .mockImplementationOnce(() => pendingView.promise);
    const coordinator = createQueryCoordinator(store, {
      rankings: drivers(vi.fn()).rankings,
      candidates: { execute: candidateExecute },
    });
    await coordinator.execute({
      candidateInput: { positionKey: 'staff:anime:2' },
      catalog: catalogFixture(),
      mode: 'co-star',
    });

    const request = coordinator.executeCandidateView(
      { positionKey: 'staff:anime:101' },
      {
        ...coordinator.candidates.view,
        page: 2,
      } as never,
    );
    const candidateRequest = candidateExecute.mock
      .calls[1]![0] as CandidateRequest;
    coordinator.cancel('co-star');

    expect(candidateRequest.signal.aborted).toBe(true);
    expect(coordinator.candidates).toMatchObject({
      feedback: '查询已取消',
      input: { positionKey: 'staff:anime:2' },
      payload: { id: 'stable' },
      phase: 'ready',
      requestId: 'server-candidate-stable',
      view: { page: 1 },
      viewPending: false,
    });
    pendingView.resolve({
      payload: { id: 'late' },
      requestId: 'server-candidate-late',
      transactionId: candidateRequest.transactionId,
    });
    await expect(request).resolves.toBe(false);
    expect(coordinator.candidates.payload).toEqual({ id: 'stable' });
  });

  it('rejects invalid candidate view scope and records strict server errors', async () => {
    const store = readyStore();
    store.draft.scope = 'global';
    store.draft.positionKeys = ['staff:anime:2', 'staff:anime:101'];
    const candidateExecute = vi
      .fn()
      .mockImplementationOnce(async (request: CandidateRequest) => ({
        payload: { id: 'global' },
        requestId: 'server-candidate-global',
        transactionId: request.transactionId,
      }))
      .mockImplementationOnce(async () => {
        throw new CandidatesApiError(
          {
            error: {
              code: 'NOT_READY',
              fieldErrors: {},
              message: 'not ready',
              retryable: true,
            },
            meta: {
              requestId: 'server-candidate-not-ready',
            },
          },
          503,
        );
      });
    const coordinator = createQueryCoordinator(store, {
      rankings: drivers(vi.fn()).rankings,
      candidates: { execute: candidateExecute },
    });
    await coordinator.execute({
      catalog: catalogFixture(),
      mode: 'co-star',
    });

    await expect(
      coordinator.executeCandidateView(coordinator.candidates.input, {
        order: 'desc',
        page: 1,
        pageSize: 10,
        search: '',
        sort: 'globalAverage',
      }),
    ).resolves.toBe(false);
    expect(candidateExecute).toHaveBeenCalledTimes(1);
    expect(coordinator.candidates.error).toBe('候选人物视图参数无效');

    await expect(
      coordinator.executeCandidateView(
        { positionKey: 'staff:anime:101' },
        {
          order: 'desc',
          page: 2,
          pageSize: 10,
          search: '',
          sort: 'average',
        },
      ),
    ).resolves.toBe(false);
    expect(coordinator.candidates).toMatchObject({
      error: '候选人物服务正在准备，请稍后重试',
      input: { positionKey: null },
      payload: { id: 'global' },
      requestId: 'server-candidate-not-ready',
      view: { page: 1 },
    });
  });

  it('runs a view-only ranking transaction without changing Applied or revision', async () => {
    const store = readyStore();
    const pendingView = deferred<OperationResponse<Payload>>();
    const execute = vi
      .fn()
      .mockImplementationOnce(async (request: RankingRequest) => ({
        payload: { id: 'core' },
        requestId: 'server-core',
        transactionId: request.transactionId,
      }))
      .mockImplementationOnce(() => pendingView.promise);
    const coordinator = createQueryCoordinator(store, drivers(execute));

    await coordinator.execute({
      catalog: catalogFixture(),
      mode: 'ranking',
    });
    const applied = store.applied;
    const revision = store.revision;
    const viewRequest = coordinator.executeRankingView({
      ...coordinator.rankings.view,
      page: 1,
      search: '林',
    });
    const request = execute.mock.calls[1]![0] as RankingRequest;

    expect(request.query).toBe(coordinator.rankings.acceptedQuery);
    expect(request.view.search).toBe('林');
    expect(coordinator.rankings).toMatchObject({
      payload: { id: 'core' },
      phase: 'ready',
      requestId: 'server-core',
      viewPending: true,
    });
    expect(store.applied).toBe(applied);
    expect(store.revision).toBe(revision);

    pendingView.resolve({
      payload: { id: 'searched' },
      requestId: 'server-view-search',
      transactionId: request.transactionId,
    });
    await expect(viewRequest).resolves.toBe(true);
    expect(coordinator.rankings).toMatchObject({
      payload: { id: 'searched' },
      phase: 'ready',
      requestId: 'server-view-search',
      revision,
      view: { search: '林' },
      viewPending: false,
    });
    expect(store.applied).toBe(applied);
    expect(store.revision).toBe(revision);
  });

  it('admits only the latest superseding ranking view response', async () => {
    const store = readyStore();
    const firstView = deferred<OperationResponse<Payload>>();
    const secondView = deferred<OperationResponse<Payload>>();
    const execute = vi
      .fn()
      .mockImplementationOnce(async (request: RankingRequest) => ({
        payload: { id: 'core' },
        requestId: 'server-core',
        transactionId: request.transactionId,
      }))
      .mockImplementationOnce(() => firstView.promise)
      .mockImplementationOnce(() => secondView.promise);
    const coordinator = createQueryCoordinator(store, drivers(execute));
    await coordinator.execute({
      catalog: catalogFixture(),
      mode: 'ranking',
    });

    const first = coordinator.executeRankingView({
      ...coordinator.rankings.view,
      search: '旧',
    });
    const firstRequest = execute.mock.calls[1]![0] as RankingRequest;
    const second = coordinator.executeRankingView({
      ...coordinator.rankings.view,
      search: '新',
    });
    const secondRequest = execute.mock.calls[2]![0] as RankingRequest;
    expect(firstRequest.signal.aborted).toBe(true);

    secondView.resolve({
      payload: { id: 'new' },
      requestId: 'server-new',
      transactionId: secondRequest.transactionId,
    });
    await expect(second).resolves.toBe(true);
    firstView.resolve({
      payload: { id: 'old' },
      requestId: 'server-old',
      transactionId: firstRequest.transactionId,
    });
    await expect(first).resolves.toBe(false);

    expect(coordinator.rankings).toMatchObject({
      payload: { id: 'new' },
      requestId: 'server-new',
      revision: 1,
      view: { search: '新' },
      viewPending: false,
    });
    expect(store.revision).toBe(1);
  });

  it('rolls a failed view request back without erasing its ready ranking', async () => {
    const store = readyStore();
    const execute = vi
      .fn()
      .mockImplementationOnce(async (request: RankingRequest) => ({
        payload: { id: 'stable' },
        requestId: 'server-stable',
        transactionId: request.transactionId,
      }))
      .mockRejectedValueOnce(new Error('offline'));
    const coordinator = createQueryCoordinator(store, drivers(execute));
    await coordinator.execute({
      catalog: catalogFixture(),
      mode: 'ranking',
    });

    await expect(
      coordinator.executeRankingView({
        ...coordinator.rankings.view,
        page: 2,
      }),
    ).resolves.toBe(false);

    expect(coordinator.rankings).toMatchObject({
      error: '查询暂时无法完成，请稍后重试',
      payload: { id: 'stable' },
      phase: 'ready',
      requestId: 'server-stable',
      revision: 1,
      view: { page: 1 },
      viewPending: false,
    });
    expect(store.revision).toBe(1);
  });

  it('stores a strictly decoded server request ID for ranking errors', async () => {
    const store = readyStore();
    const execute = vi.fn(async () => {
      throw new RankingsApiError(
        {
          error: {
            code: 'NOT_READY',
            fieldErrors: {},
            message: 'not ready',
            retryable: true,
          },
          meta: {
            requestId: 'server-not-ready',
          },
        },
        503,
      );
    });
    const coordinator = createQueryCoordinator(store, drivers(execute));

    await expect(
      coordinator.execute({
        catalog: catalogFixture(),
        mode: 'ranking',
      }),
    ).resolves.toBe(false);
    expect(coordinator.rankings).toMatchObject({
      error: '排行服务正在准备，请稍后重试',
      requestId: 'server-not-ready',
    });
  });

  it('fails closed when production has no registered result driver', async () => {
    const store = readyStore();
    const coordinator = createQueryCoordinator(
      store,
      unavailableQueryDrivers(),
    );

    expect(
      await coordinator.execute({
        catalog: catalogFixture(),
        mode: 'ranking',
      }),
    ).toBe(false);
    expect(store.applied).toBeNull();
    expect(coordinator.rankings.error).toBe('该结果能力尚未接入');
  });
});

type CoStarDrivers = QueryDrivers<
  Payload,
  Payload,
  unknown,
  unknown,
  Payload
>;
type CoStarRequest = Parameters<
  NonNullable<CoStarDrivers['coStar']>['execute']
>[0];

const coStarInput: Readonly<CoStarInputV1> = {
  participants: [
    {
      personId: 1,
      positionKeys: ['staff:anime:2'],
    },
    {
      personId: 2,
      positionKeys: ['staff:anime:101'],
    },
  ],
};
const otherCoStarInput: Readonly<CoStarInputV1> = {
  participants: [
    {
      personId: 2,
      positionKeys: ['staff:anime:101'],
    },
    {
      personId: 1,
      positionKeys: ['staff:anime:2'],
    },
  ],
};
const coStarView: Required<CoStarViewV1> = Object.freeze({
  order: 'desc',
  page: 1,
  pageSize: 10,
  search: '',
  sort: 'personalScore',
});

function coStarDrivers(
  execute: NonNullable<CoStarDrivers['coStar']>['execute'],
  candidatesExecute?: CoStarDrivers['candidates']['execute'],
): CoStarDrivers {
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
    coStar: { execute },
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

async function readyCoStarCoordinator(
  execute: NonNullable<CoStarDrivers['coStar']>['execute'],
  candidatesExecute?: CoStarDrivers['candidates']['execute'],
) {
  const store = readyStore();
  store.draft.positionKeys = [
    'staff:anime:2',
    'staff:anime:101',
  ];
  const coordinator = createQueryCoordinator<
    Payload,
    Payload,
    unknown,
    unknown,
    Payload
  >(store, coStarDrivers(execute, candidatesExecute));
  await coordinator.execute({
    catalog: catalogFixture(),
    mode: 'co-star',
  });
  return { coordinator, store };
}

describe('co-star coordinator resource', () => {
  it('runs independently with canonical ordered identities', async () => {
    const pending = deferred<OperationResponse<Payload>>();
    const execute = vi.fn((_request: CoStarRequest) => pending.promise);
    const { coordinator, store } = await readyCoStarCoordinator(execute);
    const revision = store.revision;

    const result = coordinator.executeCoStar(coStarInput, coStarView);
    const request = execute.mock.calls[0]![0] as CoStarRequest;
    expect(request).toMatchObject({
      input: coStarInput,
      query: coordinator.candidates.acceptedQuery,
      view: coStarView,
    });
    expect(coordinator.coStar).toMatchObject({
      input: coStarInput,
      phase: 'pending',
      revision,
      viewPending: false,
    });
    expect(coordinator.pending.value).toBe(false);
    expect(coordinator.pendingOperation.value).toBeNull();

    pending.resolve({
      payload: { id: 'co-star-ready' },
      requestId: 'server-co-star-ready',
      transactionId: request.transactionId,
    });
    await expect(result).resolves.toBe(true);
    expect(coordinator.coStar).toMatchObject({
      payload: { id: 'co-star-ready' },
      phase: 'ready',
      requestId: 'server-co-star-ready',
      revision,
    });
    expect(store.revision).toBe(revision);
  });

  it('admits only the latest ordered participant response', async () => {
    const first = deferred<OperationResponse<Payload>>();
    const second = deferred<OperationResponse<Payload>>();
    const execute = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const { coordinator } = await readyCoStarCoordinator(execute);

    const firstResult = coordinator.executeCoStar(
      coStarInput,
      coStarView,
    );
    const firstRequest = execute.mock.calls[0]![0] as CoStarRequest;
    const secondResult = coordinator.executeCoStar(
      otherCoStarInput,
      coStarView,
    );
    const secondRequest = execute.mock.calls[1]![0] as CoStarRequest;
    expect(firstRequest.signal.aborted).toBe(true);

    second.resolve({
      payload: { id: 'latest-order' },
      requestId: 'server-latest-order',
      transactionId: secondRequest.transactionId,
    });
    await expect(secondResult).resolves.toBe(true);
    first.resolve({
      payload: { id: 'stale-order' },
      requestId: 'server-stale-order',
      transactionId: firstRequest.transactionId,
    });
    await expect(firstResult).resolves.toBe(false);
    expect(coordinator.coStar).toMatchObject({
      input: otherCoStarInput,
      payload: { id: 'latest-order' },
      requestId: 'server-latest-order',
    });
  });

  it('restores the complete accepted analysis after full failure and cancel', async () => {
    const failed = deferred<OperationResponse<Payload>>();
    const canceled = deferred<OperationResponse<Payload>>();
    const execute = vi
      .fn()
      .mockImplementationOnce(async (request: CoStarRequest) => ({
        payload: { id: 'accepted-analysis' },
        requestId: 'server-accepted-analysis',
        transactionId: request.transactionId,
      }))
      .mockImplementationOnce(() => failed.promise)
      .mockImplementationOnce(() => canceled.promise);
    const { coordinator, store } = await readyCoStarCoordinator(execute);
    await coordinator.executeCoStar(coStarInput, coStarView);
    const acceptedInput = coordinator.coStar.input;
    const acceptedPayload = coordinator.coStar.payload;
    const acceptedRequestId = coordinator.coStar.requestId;
    const acceptedView = coordinator.coStar.view;
    const revision = store.revision;

    const failing = coordinator.executeCoStar(otherCoStarInput, {
      ...coStarView,
      page: 2,
      search: 'replacement',
    });
    failed.reject(new Error('offline'));
    await expect(failing).resolves.toBe(false);
    expect(coordinator.coStar.input).toBe(acceptedInput);
    expect(coordinator.coStar.payload).toBe(acceptedPayload);
    expect(coordinator.coStar.requestId).toBe(acceptedRequestId);
    expect(coordinator.coStar.view).toBe(acceptedView);
    expect(coordinator.coStar).toMatchObject({
      error: '查询暂时无法完成，请稍后重试',
      phase: 'ready',
      revision,
    });

    const canceling = coordinator.executeCoStar(otherCoStarInput, {
      ...coStarView,
      search: 'stale',
    });
    const canceledRequest = execute.mock.calls[2]![0] as CoStarRequest;
    coordinator.cancelCoStar();
    expect(canceledRequest.signal.aborted).toBe(true);
    expect(coordinator.coStar.input).toBe(acceptedInput);
    expect(coordinator.coStar.payload).toBe(acceptedPayload);
    expect(coordinator.coStar.requestId).toBe(acceptedRequestId);
    expect(coordinator.coStar.view).toBe(acceptedView);

    canceled.resolve({
      payload: { id: 'must-not-commit' },
      requestId: 'server-stale-canceled',
      transactionId: canceledRequest.transactionId,
    });
    await expect(canceling).resolves.toBe(false);
    expect(coordinator.coStar.payload).toBe(acceptedPayload);
    expect(store.revision).toBe(revision);
  });

  it('retains accepted core evidence while a work-view request fails', async () => {
    const viewFailure = deferred<OperationResponse<Payload>>();
    const execute = vi
      .fn()
      .mockImplementationOnce(async (request: CoStarRequest) => ({
        payload: { id: 'stable-core' },
        requestId: 'server-stable-core',
        transactionId: request.transactionId,
      }))
      .mockImplementationOnce(() => viewFailure.promise);
    const { coordinator, store } = await readyCoStarCoordinator(execute);
    await coordinator.executeCoStar(coStarInput, coStarView);

    const next = coordinator.executeCoStarView({
      ...coStarView,
      page: 2,
      search: '共同',
    });
    const request = execute.mock.calls[1]![0] as CoStarRequest;
    expect(coordinator.coStar).toMatchObject({
      payload: { id: 'stable-core' },
      requestId: 'server-stable-core',
      view: { page: 2, search: '共同' },
      viewPending: true,
    });

    viewFailure.reject(new Error('offline'));
    await expect(next).resolves.toBe(false);
    expect(coordinator.coStar).toMatchObject({
      error: '查询暂时无法完成，请稍后重试',
      payload: { id: 'stable-core' },
      phase: 'ready',
      requestId: 'server-stable-core',
      revision: store.revision,
      view: coStarView,
      viewPending: false,
    });
  });

  it('clears and aborts pending co-star only after a new candidate revision succeeds', async () => {
    const staleAnalysis = deferred<OperationResponse<Payload>>();
    const nextCandidates = deferred<OperationResponse<Payload>>();
    const coStarExecute = vi.fn(
      (_request: CoStarRequest) => staleAnalysis.promise,
    );
    const candidateExecute = vi
      .fn()
      .mockImplementationOnce(
        async (request: CandidateRequest) => ({
          payload: { id: 'initial-candidates' },
          requestId: 'server-initial-candidates',
          transactionId: request.transactionId,
        }),
      )
      .mockImplementationOnce(() => nextCandidates.promise);
    const { coordinator, store } = await readyCoStarCoordinator(
      coStarExecute,
      candidateExecute,
    );
    const pendingAnalysis = coordinator.executeCoStar(
      coStarInput,
      coStarView,
    );
    const staleRequest = coStarExecute.mock.calls[0]![0] as CoStarRequest;

    store.draft.positionKeys = ['staff:anime:101'];
    const primary = coordinator.execute({
      catalog: catalogFixture(),
      mode: 'co-star',
    });
    expect(staleRequest.signal.aborted).toBe(false);
    const candidateRequest = candidateExecute.mock
      .calls[1]![0] as CandidateRequest;
    nextCandidates.resolve({
      payload: { id: 'new-candidates' },
      requestId: 'server-new-candidates',
      transactionId: candidateRequest.transactionId,
    });
    await expect(primary).resolves.toBe(true);

    expect(staleRequest.signal.aborted).toBe(true);
    expect(coordinator.coStar).toMatchObject({
      acceptedQuery: null,
      payload: null,
      phase: 'idle',
      requestId: null,
      revision: 0,
    });
    staleAnalysis.resolve({
      payload: { id: 'must-not-commit' },
      requestId: 'server-stale-analysis',
      transactionId: staleRequest.transactionId,
    });
    await expect(pendingAnalysis).resolves.toBe(false);
    expect(coordinator.coStar.payload).toBeNull();
  });

  it('preserves accepted co-star when a new candidate query fails', async () => {
    const coStarExecute = vi.fn(
      async (request: CoStarRequest) => ({
        payload: { id: 'accepted-before-query-failure' },
        requestId: 'server-accepted-before-query-failure',
        transactionId: request.transactionId,
      }),
    );
    const candidateExecute = vi
      .fn()
      .mockImplementationOnce(
        async (request: CandidateRequest) => ({
          payload: { id: 'initial-candidates' },
          requestId: 'server-initial-candidates',
          transactionId: request.transactionId,
        }),
      )
      .mockRejectedValueOnce(new Error('candidate failure'));
    const { coordinator, store } = await readyCoStarCoordinator(
      coStarExecute,
      candidateExecute,
    );
    await coordinator.executeCoStar(coStarInput, coStarView);
    const acceptedQuery = coordinator.coStar.acceptedQuery;
    const acceptedInput = coordinator.coStar.input;
    const acceptedPayload = coordinator.coStar.payload;
    const acceptedRequestId = coordinator.coStar.requestId;
    const acceptedView = coordinator.coStar.view;
    const revision = store.revision;

    store.draft.positionKeys = ['staff:anime:101'];
    await expect(
      coordinator.execute({
        catalog: catalogFixture(),
        mode: 'co-star',
      }),
    ).resolves.toBe(false);

    expect(coordinator.coStar.acceptedQuery).toBe(acceptedQuery);
    expect(coordinator.coStar.input).toBe(acceptedInput);
    expect(coordinator.coStar.payload).toBe(acceptedPayload);
    expect(coordinator.coStar.requestId).toBe(acceptedRequestId);
    expect(coordinator.coStar.view).toBe(acceptedView);
    expect(coordinator.coStar).toMatchObject({
      phase: 'ready',
      revision,
    });
    expect(store.revision).toBe(revision);
  });

  it('rejects invalid identities and scope/work-unit sorts before transport', async () => {
    const execute = vi.fn();
    const { coordinator } = await readyCoStarCoordinator(execute);

    await expect(
      coordinator.executeCoStar(
        {
          participants: [
            {
              personId: 1,
              positionKeys: ['staff:anime:2'],
            },
            {
              personId: 1,
              positionKeys: ['staff:anime:101'],
            },
          ],
        },
        coStarView,
      ),
    ).resolves.toBe(false);
    expect(coordinator.coStar.error).toBe('共演人物身份无效');

    await expect(
      coordinator.executeCoStar(coStarInput, {
        ...coStarView,
        sort: 'seriesSize',
      }),
    ).resolves.toBe(false);
    expect(coordinator.coStar.error).toBe('共同作品视图参数无效');
    expect(execute).not.toHaveBeenCalled();
  });
});


describe('independent operation position scope', () => {
  function harness() {
    const store = readyStore();
    const catalog = catalogFixture();
    const execute = vi.fn(async (request: OperationRequest<unknown, unknown>) => ({
      payload: { id: request.transactionId }, requestId: request.transactionId,
      transactionId: request.transactionId,
    }));
    const coordinator = createQueryCoordinator(store, {
      rankings: { execute }, candidates: { execute },
      partners: { execute }, coStar: { execute },
    }, undefined, { getCatalog: () => catalog });
    return { store, catalog, execute, coordinator };
  }

  it('isolates query/all candidate and partner reuse while keeping the ranking Query', async () => {
    const h = harness();
    await h.coordinator.execute({ catalog: h.catalog, mode: 'co-star' });
    const query = h.store.applied;
    const view = { search: '', sort: 'count', order: 'desc', page: 1, pageSize: 10 } as const;
    expect(await h.coordinator.executeCandidateView({ positionKey: null, positionScope: 'all' }, view)).toBe(true);
    expect(h.execute).toHaveBeenCalledTimes(2);
    expect(await h.coordinator.executeCandidateView({ positionKey: null, positionScope: 'all' }, view)).toBe(true);
    expect(h.execute).toHaveBeenCalledTimes(2);
    expect(await h.coordinator.executeCandidateView({ positionKey: 'staff:anime:101', positionScope: 'all' }, view)).toBe(true);
    expect(h.execute).toHaveBeenCalledTimes(3);
    expect(await h.coordinator.executeCandidateView({ positionKey: 'staff:anime:101' }, view)).toBe(false);
    const source = { personId: 1, positionKeys: ['staff:anime:2'] } as const;
    expect(await h.coordinator.executePartners({ source } as never)).toBe(true);
    expect(await h.coordinator.executePartners({ source, positionScope: 'all' } as never)).toBe(true);
    expect(h.execute).toHaveBeenCalledTimes(5);
    expect(h.coordinator.partners.acceptedInput?.positionScope).toBe('all');
    expect(h.store.applied).toBe(query);
  });

  it('accepts exact cross-role identities only in all scope and refuses unknown/type/capability mismatches', async () => {
    const h = harness();
    await h.coordinator.execute({ catalog: h.catalog, mode: 'co-star' });
    const participants = [
      { personId: 1, positionKeys: ['staff:anime:2'] },
      { personId: 2, positionKeys: ['staff:anime:101'] },
    ];
    expect(await h.coordinator.executeCoStar({ participants } as never)).toBe(false);
    expect(await h.coordinator.executeCoStar({ participants, positionScope: 'all' } as never)).toBe(true);
    expect(h.coordinator.coStar.acceptedInput).toEqual({ participants, positionScope: 'all' });
    expect(await h.coordinator.executePartners({ source: participants[1], positionScope: 'all' } as never)).toBe(true);
    for (const key of ['staff:anime:999999', 'staff:book:1']) {
      expect(await h.coordinator.executeCoStar({ participants: [participants[0], { personId: 2, positionKeys: [key] }], positionScope: 'all' } as never)).toBe(false);
    }
    const position = h.catalog.positionsByKey.get('staff:anime:101')!;
    (h.catalog.positionsByKey as Map<string, typeof position>).set(position.key, { ...position, capabilities: ['rankings'] });
    expect(await h.coordinator.executeCoStar({ participants, positionScope: 'all' } as never)).toBe(false);
  });

  it('rejects unsupported positions returned by an all-position candidate response', async () => {
    const store = readyStore();
    const catalog = catalogFixture();
    const execute = vi.fn(async (request: CandidateRequest) => ({
      payload: { items: [{ positionKeys: ['staff:book:1'] }], positionCounts: [{ positionKey: 'staff:book:1' }] },
      requestId: request.transactionId, transactionId: request.transactionId,
    }));
    const coordinator = createQueryCoordinator(store, { candidates: { execute }, rankings: { execute: execute as never } });
    expect(await coordinator.execute({ catalog, mode: 'co-star', candidateInput: { positionKey: null, positionScope: 'all' } })).toBe(false);
    expect(store.applied).toBeNull();
  });
});
