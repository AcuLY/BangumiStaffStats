import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { flushPromises } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { decodePersonDetailPayload, type PersonDetailPayload } from '../../../src/api/adapters/personDetail';
import { decodeRankingPayload, type RankingPayload } from '../../../src/api/adapters/rankings';
import { catalogFixture } from '../query/fixtures';
import { createPersonWorkspaceLinks } from '../../../src/features/person-detail/workspaceLinks';
import type { OperationDriver, OperationResponse, RankingsViewState } from '../../../src/features/query/coordinator';
import type { AppliedQuery } from '../../../src/features/query/model';

type Options = Parameters<typeof createPersonWorkspaceLinks>[0];
type Drivers = Options['drivers'];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function controlledDriver<Input, View, Payload>() {
  const calls: Array<{
    request: Parameters<OperationDriver<Input, View, Payload>['execute']>[0];
    result: ReturnType<typeof deferred<OperationResponse<Payload>>>;
  }> = [];
  const execute = vi.fn<OperationDriver<Input, View, Payload>['execute']>((request) => {
    const result = deferred<OperationResponse<Payload>>();
    calls.push({ request, result });
    return result.promise;
  });
  return {
    execute,
    calls,
    succeed(index: number, payload: Payload) {
      const call = calls[index]!;
      call.result.resolve({ payload, requestId: `response-${index}`, transactionId: call.request.transactionId });
    },
  };
}

function golden(operation: 'person-detail' | 'rankings', scope: 'global' | 'personal'): unknown {
  const filename = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../contracts/goldens/api', operation, 'cases', `${scope}.json`);
  const fixture = JSON.parse(fs.readFileSync(filename, 'utf8')) as { cases: Array<{ expected: { body: unknown } }> };
  return fixture.cases[0]!.expected.body;
}

function harness(scope: 'global' | 'personal' = 'global', withCatalog = false) {
  const detailPayload = decodePersonDetailPayload(golden('person-detail', scope));
  const rankingPayload = decodeRankingPayload(golden('rankings', scope));
  const shared = { subjectType: 'anime', positionKeys: ['staff:anime:2', 'staff:anime:3'], includeNSFW: false, mergeSeries: false } as const;
  const context: { query: AppliedQuery | null; revision: number } = {
    query: scope === 'global' ? { ...shared, scope } : { ...shared, scope, uid: 'luca', collectionStatuses: ['completed'] },
    revision: 1,
  };
  const detailDriver = controlledDriver<
    Parameters<NonNullable<Drivers['personDetail']>['execute']>[0]['input'],
    Parameters<NonNullable<Drivers['personDetail']>['execute']>[0]['view'],
    PersonDetailPayload
  >();
  const rankDriver = controlledDriver<
    Parameters<Drivers['rankings']['execute']>[0]['input'],
    Parameters<Drivers['rankings']['execute']>[0]['view'],
    RankingPayload
  >();
  const rankingView: RankingsViewState = { search: '别的人物', sort: 'average', order: 'asc', page: 3, pageSize: 20 };
  const links = createPersonWorkspaceLinks({
    drivers: {
      personDetail: detailDriver,
      rankings: rankDriver,
      candidates: { async execute(): Promise<never> { throw new Error('Unexpected candidate request'); } },
    },
    ...(withCatalog ? { getCatalog: catalogFixture } : {}),
    query: () => context.query,
    revision: () => context.revision,
    snapshot: () => JSON.stringify([detailPayload.dataVersion, detailPayload.collection?.fetchedAt ?? null]),
    rankingView: () => rankingView,
  });
  const person = { id: detailPayload.person.id, name: detailPayload.person.name, nameCN: detailPayload.person.nameCN };
  function rank(personId = person.id, rank: number | null = 23): RankingPayload {
    return {
      ...rankingPayload,
      dataVersion: detailPayload.dataVersion,
      ...(detailPayload.collection ? { collection: detailPayload.collection } : {}),
      location: { personId, rank, page: rank === null ? null : 2 },
    };
  }
  return { context, links, person, detailPayload, detailDriver, rankDriver, rankingView, rank };
}

describe('cross-workspace person inspection', () => {
  it('opens exact identity detail for an all-only query without sending an empty ranking request', async () => {
    const h = harness('global', true);
    h.context.query = { ...h.context.query!, positionKeys: [] };
    h.links.inspect(h.person, ['staff:anime:2']);
    expect(h.detailDriver.calls[0]!.request).toMatchObject({
      query: { positionKeys: [] },
      input: { personId: h.person.id, positionKeys: ['staff:anime:2'], positionScope: 'all' },
    });
    expect(h.rankDriver.calls).toHaveLength(0);
    expect(h.links.rankError.value).toBe('选择排行职位后可定位人物');
    expect(h.links.rankPending.value).toBe(false);
    h.detailDriver.succeed(0, h.detailPayload);
    await flushPromises();
    expect(h.links.detail).toMatchObject({ payload: h.detailPayload, phase: 'ready' });
    await expect(h.links.loadRank()).resolves.toBe(false);
    expect(h.rankDriver.calls).toHaveLength(0);
  });

  it('starts independent identity-scoped detail and unfiltered exact-ID ranking requests without changing Applied Query or ranking view', async () => {
    const h = harness();
    const applied = structuredClone(h.context.query);
    h.links.inspect(h.person, ['staff:anime:2']);

    expect(h.detailDriver.calls).toHaveLength(1);
    expect(h.rankDriver.calls).toHaveLength(1);
    expect(h.detailDriver.calls[0]!.request).toMatchObject({ query: applied, input: { personId: h.person.id, positionKeys: ['staff:anime:2'] } });
    expect(h.rankDriver.calls[0]!.request).toMatchObject({
      query: applied,
      view: { locatePersonId: h.person.id, search: '', sort: 'average', order: 'asc', pageSize: 20 },
    });
    expect(h.context.query).toEqual(applied);
    expect(h.rankingView).toEqual({ search: '别的人物', sort: 'average', order: 'asc', page: 3, pageSize: 20 });

    h.detailDriver.succeed(0, h.detailPayload);
    await flushPromises();
    expect(h.links.detail.payload).toEqual(h.detailPayload);
    expect(h.links.rankPending.value).toBe(true);
    h.rankDriver.succeed(0, h.rank());
    await flushPromises();
    expect(h.links.location.value).toEqual({ personId: h.person.id, rank: 23, page: 2 });
  });

  it('keeps successful detail available when ranking fails and permits ranking-only retry', async () => {
    const h = harness();
    h.links.inspect(h.person, ['staff:anime:2']);
    h.detailDriver.succeed(0, h.detailPayload);
    h.rankDriver.calls[0]!.result.reject(new Error('ranking unavailable'));
    await flushPromises();
    expect(h.links.detail).toMatchObject({ payload: h.detailPayload, phase: 'ready', error: null });
    expect(h.links.rankError.value).toBe('ranking unavailable');

    const retry = h.links.loadRank();
    h.rankDriver.succeed(1, h.rank());
    await expect(retry).resolves.toBe(true);
    expect(h.detailDriver.calls).toHaveLength(1);
    expect(h.links.rankError.value).toBeNull();
  });

  it('keeps authoritative ranking available when the separate detail request fails', async () => {
    const h = harness();
    h.links.inspect(h.person, ['staff:anime:2']);
    h.detailDriver.calls[0]!.result.reject(new Error('detail unavailable'));
    h.rankDriver.succeed(0, h.rank());
    await flushPromises();
    expect(h.links.detail).toMatchObject({ payload: null, phase: 'error', error: 'detail unavailable' });
    expect(h.links.location.value?.rank).toBe(23);
    expect(h.links.rankError.value).toBeNull();
  });

  it.each(['close', 'query revision', 'query signature'] as const)('discards delayed success after %s changes', async (change) => {
    const h = harness();
    h.links.inspect(h.person, ['staff:anime:2']);
    if (change === 'close') h.links.close();
    else if (change === 'query revision') h.context.revision += 1;
    else h.context.query = { ...h.context.query!, includeNSFW: true };

    h.detailDriver.succeed(0, h.detailPayload);
    h.rankDriver.succeed(0, h.rank());
    await flushPromises();
    expect(h.links.detail.payload).toBeNull();
    expect(h.links.location.value).toBeNull();
    if (change === 'close') {
      expect(h.links.person.value).toBeNull();
      expect(h.detailDriver.calls[0]!.request.signal.aborted).toBe(true);
      expect(h.rankDriver.calls[0]!.request.signal.aborted).toBe(true);
    }
  });

  it('never replaces a newly inspected person with a late previous-person response', async () => {
    const h = harness();
    h.links.inspect(h.person, ['staff:anime:2']);
    const nextPerson = { ...h.person, id: h.person.id + 1, name: '另一位人物' };
    const nextDetail = { ...h.detailPayload, person: { ...h.detailPayload.person, ...nextPerson } };
    h.links.inspect(nextPerson, ['staff:anime:3']);
    h.detailDriver.succeed(1, nextDetail);
    h.rankDriver.succeed(1, h.rank(nextPerson.id));
    await flushPromises();
    h.detailDriver.succeed(0, h.detailPayload);
    h.rankDriver.succeed(0, h.rank());
    await flushPromises();

    expect(h.links.person.value).toEqual(nextPerson);
    expect(h.links.detail.payload).toEqual(nextDetail);
    expect(h.links.location.value?.personId).toBe(nextPerson.id);
    expect(h.detailDriver.calls[0]!.request.signal.aborted).toBe(true);
    expect(h.rankDriver.calls[0]!.request.signal.aborted).toBe(true);
  });

  it.each(['dataVersion', 'collection fetchedAt'] as const)('rejects detail and ranking results from a different %s snapshot', async (difference) => {
    const h = harness('personal');
    h.links.inspect(h.person, ['staff:anime:2']);
    const patch = difference === 'dataVersion'
      ? { dataVersion: 'different-archive-version' }
      : { collection: { ...h.detailPayload.collection!, fetchedAt: '2026-09-09T00:00:00Z' } };
    h.detailDriver.succeed(0, { ...h.detailPayload, ...patch });
    h.rankDriver.succeed(0, { ...h.rank(), ...patch });
    await flushPromises();

    expect(h.links.detail.payload).toBeNull();
    expect(h.links.detail.phase).toBe('error');
    expect(h.links.detail.error).toBeTruthy();
    expect(h.links.location.value).toBeNull();
    expect(h.links.rankError.value).toBeTruthy();
  });

  it('retains the last successful detail payload and view when the next page fails', async () => {
    const h = harness();
    h.links.inspect(h.person, ['staff:anime:2']);
    h.detailDriver.succeed(0, h.detailPayload);
    h.rankDriver.succeed(0, h.rank());
    await flushPromises();
    const acceptedView = { ...h.links.detail.view };

    const nextPage = h.links.loadDetail({ ...acceptedView, page: 2 });
    expect(h.links.detail.payload).toEqual(h.detailPayload);
    expect(h.links.detail.viewPending).toBe(true);
    h.detailDriver.calls[1]!.result.reject(new Error('page unavailable'));
    await expect(nextPage).resolves.toBe(false);

    expect(h.links.detail).toMatchObject({
      payload: h.detailPayload, phase: 'ready', view: acceptedView,
      acceptedView, viewPending: false, error: 'page unavailable',
    });
    expect(h.links.location.value?.rank).toBe(23);
  });

  it('accepts an unranked participant without losing their scoped detail or changing Query', async () => {
    const h = harness();
    const applied = structuredClone(h.context.query);
    h.links.inspect(h.person, ['staff:anime:2']);
    h.detailDriver.succeed(0, h.detailPayload);
    h.rankDriver.succeed(0, h.rank(h.person.id, null));
    await flushPromises();

    expect(h.links.detail).toMatchObject({ payload: h.detailPayload, phase: 'ready' });
    expect(h.links.location.value).toEqual({ personId: h.person.id, rank: null, page: null });
    expect(h.links.rankError.value).toBeNull();
    expect(h.context.query).toEqual(applied);
  });
});


it('opens cross-role detail using all scope without widening ranking lookup', () => {
  const h = harness('global', true);
  h.links.inspect(h.person, ['staff:anime:101']);
  expect(h.detailDriver.calls[0]!.request.input).toEqual({ personId: h.person.id, positionKeys: ['staff:anime:101'], positionScope: 'all' });
  expect(h.detailDriver.calls[0]!.request.query.positionKeys).toEqual(['staff:anime:2', 'staff:anime:3']);
  expect(h.rankDriver.calls[0]!.request.query).toEqual(h.context.query);
  h.links.inspect(h.person, ['staff:book:1']);
  expect(h.links.person.value).toBeNull();
  expect(h.detailDriver.calls).toHaveLength(1);
});
