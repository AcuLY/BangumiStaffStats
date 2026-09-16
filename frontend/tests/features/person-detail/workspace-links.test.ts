import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { flushPromises } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { decodeCandidatePayload, type CandidatePayload } from '../../../src/api/adapters/candidates';
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

function golden(operation: 'person-detail' | 'rankings' | 'candidates', scope: 'global' | 'personal'): unknown {
  const filename = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../contracts/goldens/api', operation, 'cases', `${scope}.json`);
  const fixture = JSON.parse(fs.readFileSync(filename, 'utf8')) as { cases: Array<{ expected: { body: unknown } }> };
  return fixture.cases[0]!.expected.body;
}

function harness(scope: 'global' | 'personal' = 'global', withCatalog = false, withCandidateLookup = false) {
  const detailPayload = decodePersonDetailPayload(golden('person-detail', scope));
  const rankingPayload = decodeRankingPayload(golden('rankings', scope));
  const shared = { subjectType: 'anime', positionKeys: ['staff:anime:2', 'staff:anime:3'], includeNSFW: false, mergeSeries: false } as const;
  const context: { query: AppliedQuery | null; revision: number; snapshot?: string | null } = {
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
  const candidateDriver = controlledDriver<
    Parameters<Drivers['candidates']['execute']>[0]['input'],
    Parameters<Drivers['candidates']['execute']>[0]['view'], CandidatePayload
  >();
  const rankingView: RankingsViewState = { search: '别的人物', sort: 'average', order: 'asc', page: 3, pageSize: 20 };
  const links = createPersonWorkspaceLinks({
    drivers: {
      personDetail: detailDriver,
      rankings: rankDriver,
      candidates: withCandidateLookup ? candidateDriver : {
        async execute(): Promise<never> { throw new Error('Unexpected candidate request'); },
      },
    },
    ...(withCatalog ? { getCatalog: catalogFixture } : {}),
    query: () => context.query,
    revision: () => context.revision,
    snapshot: () => context.snapshot !== undefined ? context.snapshot : JSON.stringify([detailPayload.dataVersion, detailPayload.collection?.fetchedAt ?? null]),
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
  return { context, links, person, detailPayload, detailDriver, candidateDriver, rankDriver, rankingView, rank };
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



it.each(['global', 'personal'] as const)('keeps genuine query-all accepted detail and locates its exact ID (%s)', async (scope) => {
  const h = harness(scope, true);
  h.context.query = { ...h.context.query!, positionScope: 'all', positionKeys: [] };
  const query = h.context.query;
  h.links.inspect(h.person, ['staff:anime:101', 'staff:anime:99999']);
  expect(h.links.detail.acceptedQuery).toBe(query);
  expect(h.rankDriver.calls).toHaveLength(1);
  expect(h.rankDriver.calls[0]!.request).toMatchObject({ query, view: {
    search: '', sort: 'average', order: 'asc', page: 1, pageSize: 20, locatePersonId: h.person.id,
  } });
  h.detailDriver.succeed(0, h.detailPayload);
  h.rankDriver.succeed(0, h.rank());
  await flushPromises();
  expect(h.links.detail.acceptedQuery).toBe(query);
  expect(h.links.detail.acceptedInput?.positionKeys).toEqual(['staff:anime:101', 'staff:anime:99999']);
  expect(h.links.location.value?.personId).toBe(h.person.id);
});

function lookupHarness(scope: 'global' | 'personal' = 'global') {
  const h = harness(scope, true, true);
  h.context.query = { ...h.context.query!, positionScope: 'all', positionKeys: [] };
  const base = decodeCandidatePayload(golden('candidates', scope));
  function page(ids: number[], number = 1, total = ids.length, keys: readonly string[] = ['staff:anime:101', 'staff:anime:99999']): CandidatePayload {
    return { ...base, dataVersion: h.detailPayload.dataVersion,
      ...(h.detailPayload.collection ? { collection: h.detailPayload.collection } : {}),
      positionKey: null, pagination: { page: number, pageSize: 20, total },
      items: ids.map((id, index) => ({ ...base.items[0]!, person: { ...h.person, id },
        rank: (number - 1) * 20 + index + 1, workCount: 1, positionKeys: keys })),
    };
  }
  return { ...h, page };
}

function lookup(h: ReturnType<typeof lookupHarness>, person = h.person, isCurrent = () => true) {
  return h.links.lookupCandidateIdentities(person, isCurrent);
}

describe('transient complete candidate identity lookup', () => {
  it.each(['global', 'personal'] as const)('pages namesakes by exact numeric ID without mutating other resources (%s)', async (scope) => {
    const h = lookupHarness(scope);
    const query = h.context.query;
    const before = { ...h.links.detail };
    const fullName = { ...h.person, name: '  完整原文名😀  ', nameCN: '不能用于查询' };
    const result = lookup(h, fullName);
    expect(h.candidateDriver.calls).toHaveLength(1);
    const first = h.candidateDriver.calls[0]!.request;
    expect(first.query).toBe(query);
    expect(first.input).toEqual({ positionKey: null, positionScope: 'query' });
    expect(first.input).not.toHaveProperty('participants');
    expect(first.view).toEqual({ search: fullName.name, sort: 'count', order: 'desc', page: 1, pageSize: 20 });
    expect(h.links.candidateLookupPending.value).toBe(true);
    h.candidateDriver.succeed(0, h.page(Array.from({ length: 20 }, (_, i) => 1000 + i), 1, 21));
    await flushPromises();
    expect(h.candidateDriver.calls).toHaveLength(2);
    expect(h.candidateDriver.calls[1]!.request.view).toEqual({ ...first.view, page: 2 });
    expect(h.candidateDriver.calls[1]!.request.transactionId).not.toBe(first.transactionId);
    expect(h.candidateDriver.calls[1]!.request.sequence).toBeGreaterThan(first.sequence);
    const keys = ['staff:anime:99999', 'staff:anime:101', 'cast:anime:all'];
    h.candidateDriver.succeed(1, h.page([h.person.id], 2, 21, keys));
    await expect(result).resolves.toEqual(keys);
    expect(h.links.candidateLookupPending.value).toBe(false);
    expect(h.links.candidateLookupError.value).toBeNull();
    expect(h.links.detail).toEqual(before);
    expect(h.links.person.value).toBeNull();
    expect(h.links.positionKeys.value).toEqual([]);
    expect(h.context.query).toBe(query);
    expect(h.context.revision).toBe(1);
    expect(h.detailDriver.calls).toHaveLength(0);
    expect(h.rankDriver.calls).toHaveLength(0);
  });

  it.each([256, 257])('uses the full original name only within %i Unicode codepoints', async (length) => {
    const h = lookupHarness();
    const name = '😀'.repeat(length);
    const result = lookup(h, { ...h.person, name });
    expect(h.candidateDriver.calls).toHaveLength(1);
    expect(h.candidateDriver.calls[0]!.request.view.search).toBe(length === 256 ? name : '');
    h.candidateDriver.succeed(0, h.page([h.person.id]));
    await expect(result).resolves.toEqual(['staff:anime:101', 'staff:anime:99999']);
  });

  it.each([null, 'request:1', 'garbage', '[null,null]', '["version"]'])('refuses an unverifiable snapshot %s', async (snapshot) => {
    const h = lookupHarness();
    h.context.snapshot = snapshot;
    expect(await lookup(h)).toBeNull();
    expect(h.candidateDriver.calls).toHaveLength(0);
    expect(h.links.candidateLookupError.value).toBeTruthy();
  });

  it.each(['legacy empty', 'specific', 'malformed all'] as const)('does not use lookup for %s Query', async (kind) => {
    const h = lookupHarness();
    h.context.query = kind === 'legacy empty' ? { ...h.context.query!, positionScope: undefined } :
      { ...h.context.query!, positionScope: kind === 'specific' ? undefined : 'all', positionKeys: ['staff:anime:2'] };
    expect(await lookup(h)).toBeNull();
    expect(h.candidateDriver.calls).toHaveLength(0);
  });

  it.each(['query', 'revision', 'snapshot', 'owner', 'target', 'cancel', 'close', 'inspect'] as const)('invalidates delayed lookup on %s', async (change) => {
    const h = lookupHarness();
    let owner = true;
    const person = { ...h.person };
    const result = lookup(h, person, () => owner);
    expect(h.candidateDriver.calls).toHaveLength(1);
    if (change === 'query') h.context.query = { ...h.context.query!, includeNSFW: true };
    if (change === 'revision') h.context.revision++;
    if (change === 'snapshot') h.context.snapshot = '["new-version",null]';
    if (change === 'owner') owner = false;
    if (change === 'target') person.id++;
    if (change === 'cancel') h.links.cancelCandidateLookup();
    if (change === 'close') h.links.close();
    if (change === 'inspect') h.links.inspect(h.person, ['staff:anime:101']);
    h.candidateDriver.succeed(0, h.page([h.person.id]));
    await expect(result).resolves.toBeNull();
    expect(h.links.candidateLookupError.value).toBeNull();
    expect(h.links.candidateLookupPending.value).toBe(false);
  });

  it.each(['success', 'error'] as const)('stale %s and finally cannot clear newer lookup pending or feedback', async (outcome) => {
    const h = lookupHarness();
    const old = lookup(h);
    expect(h.candidateDriver.calls).toHaveLength(1);
    const person = { ...h.person, id: h.person.id + 1 };
    const next = lookup(h, person);
    expect(h.candidateDriver.calls[0]!.request.signal.aborted).toBe(true);
    if (outcome === 'success') h.candidateDriver.succeed(0, h.page([h.person.id]));
    else h.candidateDriver.calls[0]!.result.reject(new Error('obsolete failure'));
    await expect(old).resolves.toBeNull();
    expect(h.links.candidateLookupPending.value).toBe(true);
    expect(h.links.candidateLookupError.value).toBeNull();
    h.candidateDriver.succeed(1, h.page([person.id]));
    await expect(next).resolves.toEqual(['staff:anime:101', 'staff:anime:99999']);
  });

  it.each(['transaction', 'page', 'size', 'total', 'short', 'empty', 'duplicates', 'scope', 'workUnit', 'positionKey', 'dataVersion', 'collection'] as const)('rejects invalid %s before accepting a target anywhere on the page', async (kind) => {
    const h = lookupHarness('personal');
    const result = lookup(h);
    expect(h.candidateDriver.calls).toHaveLength(1);
    let payload = h.page([h.person.id, 1001]);
    if (kind === 'page') payload = { ...payload, pagination: { ...payload.pagination, page: 2 } };
    if (kind === 'size') payload = { ...payload, pagination: { ...payload.pagination, pageSize: 10 } };
    if (kind === 'total') payload = { ...payload, pagination: { ...payload.pagination, total: -1 } };
    if (kind === 'short') payload = { ...payload, pagination: { ...payload.pagination, total: 21 } };
    if (kind === 'empty') payload = { ...payload, items: [] };
    if (kind === 'duplicates') payload = h.page([h.person.id, 1001, 1001]);
    if (kind === 'scope') payload = { ...payload, scope: 'global' };
    if (kind === 'workUnit') payload = { ...payload, workUnit: 'series' };
    if (kind === 'positionKey') payload = { ...payload, positionKey: 'staff:anime:2' };
    if (kind === 'dataVersion') payload = { ...payload, dataVersion: 'other' };
    if (kind === 'collection') payload = { ...payload, collection: { ...payload.collection!, fetchedAt: '2026-09-09T00:00:00Z' } };
    const call = h.candidateDriver.calls[0]!;
    call.result.resolve({ payload, requestId: 'test', transactionId: kind === 'transaction' ? 'wrong' : call.request.transactionId });
    await expect(result).resolves.toBeNull();
    expect(h.links.candidateLookupError.value).toBeTruthy();
    expect(h.links.candidateLookupPending.value).toBe(false);
  });

  it.each(['total changes', 'duplicate people', 'duplicate page', 'no progress'] as const)('rejects %s on a later page', async (kind) => {
    const h = lookupHarness();
    const result = lookup(h);
    expect(h.candidateDriver.calls).toHaveLength(1);
    h.candidateDriver.succeed(0, h.page(Array.from({ length: 20 }, (_, i) => 1000 + i), 1, 22));
    await flushPromises();
    h.candidateDriver.succeed(1, h.page(kind === 'no progress' ? [] : [h.person.id, kind === 'duplicate people' ? 1000 : 1020], kind === 'duplicate page' ? 1 : 2, kind === 'total changes' ? 23 : 22));
    await expect(result).resolves.toBeNull();
    expect(h.links.candidateLookupError.value).toBeTruthy();
    expect(h.candidateDriver.calls).toHaveLength(2);
  });

  it.each([0, 1, 20, 21])('never repairs a complete row with %i identities', async (count) => {
    const h = lookupHarness();
    const result = lookup(h);
    expect(h.candidateDriver.calls).toHaveLength(1);
    const keys = Array.from({ length: count }, (_, i) => `staff:anime:${90000 + i}`);
    h.candidateDriver.succeed(0, h.page([h.person.id], 1, 1, keys));
    await expect(result).resolves.toEqual(count > 0 && count <= 20 ? keys : null);
    expect(Boolean(h.links.candidateLookupError.value)).toBe(count === 0 || count === 21);
  });

  it.each([{ keys: ['staff:anime:2', 'staff:anime:2'] }, { keys: [' bad '] }, { keys: [123] }, { keys: ['staff:book:1'] }])('rejects malformed, repeated or wrong-type identities %j', async ({ keys }) => {
    const h = lookupHarness();
    const result = lookup(h);
    expect(h.candidateDriver.calls).toHaveLength(1);
    h.candidateDriver.succeed(0, h.page([h.person.id], 1, 1, keys as string[]));
    await expect(result).resolves.toBeNull();
    expect(h.links.candidateLookupError.value).toBeTruthy();
  });

  it('reports genuinely exhausted missing targets and allows an uncached retry', async () => {
    const h = lookupHarness();
    const result = lookup(h);
    expect(h.candidateDriver.calls).toHaveLength(1);
    h.candidateDriver.succeed(0, h.page([1000]));
    await expect(result).resolves.toBeNull();
    expect(h.links.candidateLookupError.value).toContain('未找到');
    const retry = lookup(h);
    expect(h.candidateDriver.calls).toHaveLength(2);
    expect(h.links.candidateLookupError.value).toBeNull();
    h.candidateDriver.succeed(1, h.page([h.person.id]));
    await expect(retry).resolves.toEqual(['staff:anime:101', 'staff:anime:99999']);
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
