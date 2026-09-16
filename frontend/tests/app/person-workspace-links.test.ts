import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPinia, setActivePinia } from 'pinia';
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import App from '../../src/app/App.vue';
import QueryWorkspace from '../../src/features/query/components/QueryWorkspace.vue';
import type { CoStarSelection } from '../../src/features/co-star/selection';
import { createQuerySessionOwner } from '../../src/features/query/session';
import type { CandidatePayload } from '../../src/api/adapters/candidates';
import { decodeCoStarPayload, type CoStarPayload } from '../../src/api/adapters/coStar';
import { decodePartnersPayload, type PartnersPayload } from '../../src/api/adapters/partners';
import { decodePersonDetailPayload, type PersonDetailPayload } from '../../src/api/adapters/personDetail';
import type { RankingPayload } from '../../src/api/adapters/rankings';
import type { OperationResponse, QueryCoordinator, QueryDrivers } from '../../src/features/query/coordinator';
import { useQueryStore } from '../../src/features/query/store';
import { catalogFixture } from '../features/query/fixtures';

type Drivers = QueryDrivers<RankingPayload, CandidatePayload, PersonDetailPayload, PartnersPayload, CoStarPayload>;
type RankRequest = Parameters<Drivers['rankings']['execute']>[0];
type CandidateRequest = Parameters<Drivers['candidates']['execute']>[0];
type DetailDriver = NonNullable<Drivers['personDetail']>['execute'];
const wrappers: VueWrapper[] = [];
const primaryDataVersion = `dv1-${'a'.repeat(64)}`;
const collection = { fetchedAt: '2026-07-25T00:00:00Z', stale: false, warningCodes: [] } as const;

function golden(operation: string, scope = 'personal'): unknown {
  const filename = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..', 'contracts/goldens/api', operation, `cases/${scope}.json`);
  const fixture = JSON.parse(fs.readFileSync(filename, 'utf8')) as { cases: Array<{ expected: { body: unknown } }> };
  return fixture.cases[0]!.expected.body;
}

function person(id: number) {
  return { id, name: `Person ${id}`, nameCN: `人物${id}` };
}

function candidatePayload(request: Parameters<Drivers['candidates']['execute']>[0]): CandidatePayload {
  return {
    ...(request.query.scope === 'personal' ? { collection } : {}), dataVersion: primaryDataVersion,
    items: [1, 2].map((id) => ({ person: person(id), rank: id, positionKeys: ['staff:anime:2'], workCount: 12 - id })),
    pagination: { page: 1, pageSize: 10, total: 2 },
    positionCounts: [{ count: 2, positionKey: 'staff:anime:2' }],
    positionKey: request.input.positionKey, requestId: 'candidates', scope: request.query.scope, workUnit: 'subject',
  };
}

function rankingPayload(request: RankRequest): RankingPayload {
  const id = request.view.page === 2 ? 1 : 12;
  return {
    ...(request.query.scope === 'personal' ? { collection } : {}), dataVersion: primaryDataVersion,
    ...(request.view.locatePersonId ? { location: { personId: request.view.locatePersonId, rank: 11, page: 2 } } : {}),
    items: [{ person: person(id), rank: request.view.page === 2 ? 11 : 1, workCount: 3, average: 800, overall: 600, preference: null }],
    metricScale: { kind: 'linear', metric: 'count', max: 3 },
    pagination: { page: request.view.page ?? 1, pageSize: request.view.pageSize ?? 10, total: 20 },
    requestId: 'ranking', scope: request.query.scope, summary: { personCount: 20, workCount: 30, workUnit: 'subject' },
  };
}

function response<T>(request: { transactionId: string }, payload: T): OperationResponse<T> {
  return { payload, requestId: 'server-response', transactionId: request.transactionId };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function installViewport(initialWidth: number) {
  let width = initialWidth;
  const media = new Map<string, { query: string; listeners: Set<() => void> }>();
  vi.stubGlobal('matchMedia', vi.fn((query: string) => {
    const state = media.get(query) ?? { query, listeners: new Set<() => void>() };
    media.set(query, state);
    return {
      media: query,
      get matches() {
        const breakpoint = query.match(/^\(width < (\d+)px\)$/);
        return breakpoint ? width < Number(breakpoint[1]) : false;
      },
      addEventListener: (_event: string, listener: () => void) => state.listeners.add(listener),
      removeEventListener: (_event: string, listener: () => void) => state.listeners.delete(listener),
      dispatchEvent: () => true,
      onchange: null,
    } as unknown as MediaQueryList;
  }));
  return (nextWidth: number) => {
    width = nextWidth;
    for (const state of media.values()) {
      if (/^\(width < \d+px\)$/.test(state.query)) {
        for (const listener of state.listeners) listener();
      }
    }
  };
}

async function setup(options: {
  width?: number;
  realTeleport?: boolean;
  queryAll?: boolean;
  scope?: 'personal' | 'global';
  rankingExecute?: Drivers['rankings']['execute'];
  candidateExecute?: Drivers['candidates']['execute'];
  detailExecute?: DetailDriver;
} = {}) {
  const resize = installViewport(options.width ?? 1280);
  const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  scrollRestorers.push(() => {
    if (originalScrollIntoView) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView);
    else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  });
  window.history.replaceState({}, '', '/co-star?user=luca');
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useQueryStore();
  const scope = options.scope ?? 'personal';
  store.draft.scope = scope;
  store.draft.uid = 'luca';
  // Pinia's optional scope must never leak query-all into ordinary fixtures.
  delete store.draft.positionScope;
  if (options.queryAll) store.draft.positionScope = 'all';
  store.draft.positionKeys = options.queryAll ? [] : ['staff:anime:2'];
  const snapshot = { ...(scope === 'personal' ? { collection } : {}), dataVersion: primaryDataVersion };
  const detailBase = decodePersonDetailPayload(golden('person-detail', scope));
  const coStarBody = golden('co-star', scope) as {
    data: { participants: Array<{ positionKeys: string[] }> };
    meta: { pagination: { total: number } };
  };
  if (scope === 'global') {
    // The global golden is series-based; this harness queries unmerged subjects.
    // Build a coherent empty-intersection subject fixture before real decoding.
    Object.assign(coStarBody.data, {
      workUnit: 'subject', items: [],
      summary: { unionWorkCount: 2, commonWorkCount: 0, ratedWorkCount: 0, average: null },
      tags: { meta: [], community: [] }, ratings: { datasets: [] },
    });
    coStarBody.meta.pagination.total = 0;
  }
  coStarBody.data.participants.forEach((participant) => { participant.positionKeys = ['staff:anime:2']; });
  const analysisBase = decodeCoStarPayload(coStarBody, scope);
  const partnerBody = golden('partners', scope) as { data: { workUnit: 'subject' | 'series' } };
  partnerBody.data.workUnit = 'subject';
  const partnerBase = decodePartnersPayload(partnerBody, scope);
  const ranking = vi.fn<Drivers['rankings']['execute']>(options.rankingExecute ?? (async (request) => response(request, rankingPayload(request))));
  const detailPayload = (request: Parameters<DetailDriver>[0]): PersonDetailPayload => ({
    ...detailBase, ...snapshot,
    person: { ...detailBase.person, ...person(request.input.personId) },
  });
  const detail = vi.fn<DetailDriver>(options.detailExecute ?? (async (request) => response(request, detailPayload(request))));
  const candidates = vi.fn<Drivers['candidates']['execute']>(options.candidateExecute ?? (async (request) => response(request, candidatePayload(request))));
  const analysis = vi.fn<NonNullable<Drivers['coStar']>['execute']>(async (request) => response(request, {
    ...analysisBase, ...snapshot,
    data: { ...analysisBase.data, participants: analysisBase.data.participants.map((participant, index) => ({
      ...participant, person: person(request.input.participants[index]!.personId), positionKeys: request.input.participants[index]!.positionKeys,
    })) },
  }));
  const partners = vi.fn<NonNullable<Drivers['partners']>['execute']>(async (request) => response(request, {
    ...partnerBase, ...snapshot,
    source: { ...partnerBase.source, person: person(request.input.source.personId), positionKeys: request.input.source.positionKeys.map(String) },
    items: partnerBase.items.map((item) => ({ ...item, positionKeys: [request.input.source.personId === 12 ? 'cast:anime:all' : 'staff:anime:2'] })),
  }));
  const wrapper = mount(App, {
    attachTo: document.body,
    global: { plugins: [pinia], stubs: { teleport: !options.realTeleport } },
    props: { services: {
      targetWindow: window,
      catalogApi: { async load() { return catalogFixture(); } },
      drivers: {
        candidates: { execute: candidates },
        rankings: { execute: ranking }, personDetail: { execute: detail }, coStar: { execute: analysis }, partners: { execute: partners },
      },
    } },
  });
  wrappers.push(wrapper);
  await flushPromises();
  await wrapper.get('#query-editor').trigger('submit');
  await vi.waitFor(() => expect(wrapper.findAll('button.candidate-row')).toHaveLength(2), { timeout: 10000 });
  await wrapper.findAll('button.candidate-row')[1]!.trigger('click');
  await vi.waitFor(() => expect(wrapper.findAll('.co-star-surface .co-star-participant-card .co-star-person-inspect:not([aria-disabled="true"])')).toHaveLength(2), { timeout: 10000 }).catch((error: unknown) => {
    const resource = wrapper.getComponent(QueryWorkspace).props('coordinator').coStar;
    throw new Error(`${String(error)}; coStar: ${resource.phase}, ${resource.error}`);
  });
  const coordinator = wrapper.getComponent(QueryWorkspace).props('coordinator') as QueryCoordinator<RankingPayload, CandidatePayload, PersonDetailPayload, PartnersPayload, CoStarPayload>;
  const selection = wrapper.getComponent({ name: 'CoStarWorkspace' }).props('selection') as CoStarSelection;
  return { wrapper, store, ranking, detail, detailPayload, candidates, coordinator, selection, analysis, partners, resize };
}

const scrollRestorers: Array<() => void> = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  scrollRestorers.splice(0).reverse().forEach((restore) => restore());
  vi.unstubAllGlobals();
});

function button(wrapper: VueWrapper | DOMWrapper<Element>, label: string) {
  const target = wrapper.findAll('button').find((candidate) => candidate.text().trim() === label);
  if (!target) throw new Error(`Missing button: ${label}`);
  return target;
}

function selectedIds(wrapper: VueWrapper): string[] {
  return wrapper.findAll('.candidate-selected-person').map((node) => node.attributes('data-selected-person-id')!);
}

async function inspectFirst(wrapper: VueWrapper) {
  const trigger = wrapper.get('.co-star-participant-card[data-selected-person-id="1"] .co-star-person-inspect');
  await trigger.trigger('click');
  await vi.waitFor(() => expect(wrapper.find('#co-star-person-detail-panel .person-inspector').exists()).toBe(true), { timeout: 10000 });
  return trigger;
}

const completeKeys = ['staff:anime:2', 'cast:anime:all', 'staff:anime:99999'];

function linkedPayload(request: CandidateRequest, keys = completeKeys, id = 12): CandidatePayload {
  return {
    ...candidatePayload(request),
    // A same-name decoy proves the App forwards the exact numeric detail target.
    items: [11, id].map((personId, index) => ({
      person: { ...person(personId), name: 'Person 12' }, rank: index + 1,
      positionKeys: keys, workCount: 3,
    })),
    positionCounts: keys.map((positionKey) => ({ positionKey, count: 2 })),
    pagination: { page: 1, pageSize: 20, total: 2 },
  };
}

async function handoffHarness(options: { scope?: 'personal' | 'global'; width?: number; realTeleport?: boolean } = {}) {
  const lookups: Array<{ request: CandidateRequest; result: ReturnType<typeof deferred<OperationResponse<CandidatePayload>>> }> = [];
  const h = await setup({ ...options, queryAll: true, candidateExecute: async (request) => {
    if (!request.transactionId.startsWith('linked-candidates-')) return response(request, candidatePayload(request));
    const result = deferred<OperationResponse<CandidatePayload>>();
    lookups.push({ request, result });
    // Deliberately ignore AbortSignal: ownership, not transport, must prevent stale commits.
    return result.promise;
  } });
  await h.wrapper.get('#mode-tab-ranking').trigger('click');
  await vi.waitFor(() => expect(h.coordinator.personDetail.phase).toBe('ready'));
  if (options.width && options.width < 960) {
    await h.wrapper.get('#mode-panel-ranking [data-person-id="12"]').trigger('click');
  }
  const handoffRoot = options.realTeleport ? new DOMWrapper(document.body) : h.wrapper;
  await vi.waitFor(() => expect(button(handoffRoot, '查看共演').exists()).toBe(true));
  h.store.draft.includeNSFW = true;
  const preserved = () => ({
    identities: h.selection.identities.value, applied: h.store.applied,
    draft: h.store.draft, revision: h.store.revision,
    scope: h.store.coStarPositionScope, appliedScope: h.store.appliedCoStarPositionScope,
    pathname: window.location.pathname, analysis: h.coordinator.coStar.payload,
  });
  const before = JSON.parse(JSON.stringify(preserved()));
  const start = async () => {
    const count = lookups.length;
    await button(handoffRoot, '查看共演').trigger('click');
    await flushPromises();
    expect(lookups).toHaveLength(count + 1);
    return lookups[count]!;
  };
  return { ...h, lookups, start, preserved, before };
}

describe('App query-all atomic person handoff', { timeout: 15000 }, () => {
  it.each(['personal', 'global'] as const)('commits the complete exact-ID row for %s without applying dirty Draft', async (scope) => {
    const h = await handoffHarness({ scope });
    const applied = h.store.applied;
    const pending = await h.start();
    expect(pending.request.query).toEqual(h.before.applied);
    expect(pending.request.input).toEqual({ positionKey: null, positionScope: 'query' });
    expect(pending.request.view).toEqual({ search: 'Person 12', sort: 'count', order: 'desc', page: 1, pageSize: 20 });
    expect(h.preserved()).toEqual(h.before);
    const action = button(h.wrapper, '查看共演');
    expect(action.attributes('disabled')).toBeDefined();
    expect(action.classes()).toContain('n-button--loading');
    await action.trigger('click');
    expect(h.lookups).toHaveLength(1);
    const scroll = vi.mocked(HTMLElement.prototype.scrollIntoView);
    scroll.mockClear();
    const focus = document.activeElement;
    pending.result.resolve(response(pending.request, linkedPayload(pending.request)));
    await vi.waitFor(() => expect(h.partners.mock.calls.at(-1)?.[0].input.source.personId).toBe(12));
    expect(window.location.pathname).toBe('/co-star');
    expect(h.selection.identities.value.map(({ positionKey }) => positionKey)).toEqual(completeKeys);
    expect(selectedIds(h.wrapper)).toEqual(['12']);
    expect(h.store.coStarPositionScope).toBe('all');
    expect(h.store.appliedCoStarPositionScope).toBe('all');
    expect(h.store.applied).toEqual(h.before.applied);
    expect(h.store.applied).toBe(applied);
    expect(h.store.draft).toEqual(h.before.draft);
    expect(h.store.revision).toBe(h.before.revision);
    expect(h.partners.mock.calls.at(-1)![0].input).toEqual({ positionScope: 'all', source: { personId: 12, positionKeys: completeKeys } });
    expect(scroll).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(focus);
  });

  it.each(['error', 'missing', 'oversize', 'invalid selection'] as const)('preserves all state on %s and permits a complete retry', async (failure) => {
    const h = await handoffHarness();
    if (failure === 'invalid selection') {
      const payload = h.coordinator.personDetail.payload!;
      h.coordinator.personDetail.payload = { ...payload, person: { ...payload.person, name: '' } };
    }
    const pending = await h.start();
    if (failure === 'error') pending.result.reject(new Error('候选暂不可用，请重试'));
    else pending.result.resolve(response(pending.request, linkedPayload(pending.request,
      failure === 'oversize' ? Array.from({ length: 21 }, (_, i) => `staff:anime:${90000 + i}`) : completeKeys,
      failure === 'missing' ? 13 : 12)));
    await flushPromises();
    expect(h.preserved()).toEqual(h.before);
    expect(h.wrapper.findAll('[role="alert"]').some((node) => node.text().includes(failure === 'invalid selection' ? '人物身份无效' : failure === 'oversize' ? '超过 20' : failure === 'missing' ? '未找到' : '候选暂不可用'))).toBe(true);
    expect(button(h.wrapper, '查看共演').attributes('disabled')).toBeUndefined();
    if (failure === 'invalid selection') h.coordinator.personDetail.payload = h.detailPayload(h.detail.mock.calls.at(-1)![0]);
    const retry = await h.start();
    retry.result.resolve(response(retry.request, linkedPayload(retry.request)));
    await vi.waitFor(() => expect(window.location.pathname).toBe('/co-star'));
    expect(h.selection.identities.value.map(({ positionKey }) => positionKey)).toEqual(completeKeys);
  });

  it.each(['target', 'same target', 'selection', 'mode', 'primary', 'candidate view', 'drawer'] as const)('clears completed handoff feedback on %s intent', async (intent) => {
    const h = await handoffHarness(intent === 'drawer' ? { width: 390 } : {});
    const pending = await h.start();
    pending.result.reject(new Error('旧人物身份查找失败'));
    await flushPromises();
    expect(h.wrapper.text()).toContain('旧人物身份查找失败');

    if (intent === 'target' || intent === 'same target') {
      h.wrapper.getComponent({ name: 'RankingResults' }).vm.$emit('activate', intent === 'target' ? 1 : 12, document.body);
    }
    if (intent === 'selection') h.selection.removePerson(2);
    if (intent === 'mode') await h.wrapper.get('#mode-tab-co-star').trigger('click');
    if (intent === 'primary') await h.coordinator.execute({ mode: 'ranking', catalog: catalogFixture() });
    if (intent === 'candidate view') {
      await h.coordinator.executeCandidateView(h.coordinator.candidates.input, {
        sort: 'count', order: 'desc', page: 1, pageSize: 10, search: 'new',
      });
    }
    if (intent === 'drawer') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flushPromises();
    expect(h.wrapper.text().includes('旧人物身份查找失败')).toBe(false);
  });

  it.each([390, 959, 1280])('shows handoff feedback once inside the accessible detail surface at %s px and permits retry', async (width) => {
    const h = await handoffHarness({ width, realTeleport: true });
    const root = new DOMWrapper(document.body);
    const pending = await h.start();
    const action = button(root, '查看共演');
    pending.result.reject(new Error('人物身份查找失败，请重试'));
    await flushPromises();

    const alerts = root.findAll('[role="alert"]').filter((node) => node.text().includes('人物身份查找失败，请重试'));
    expect(alerts).toHaveLength(1);
    const alert = alerts[0]!;
    expect(alert.element.closest('#person-detail-panel')).not.toBeNull();
    expect(alert.element.closest('[hidden], [inert], [aria-hidden="true"]')).toBeNull();
    expect(h.coordinator.personDetail.error).toBeNull();
    expect(action.attributes('disabled')).toBeUndefined();
    expect(h.preserved()).toEqual(h.before);

    const retry = await h.start();
    expect(root.text()).not.toContain('人物身份查找失败，请重试');
    retry.result.resolve(response(retry.request, linkedPayload(retry.request)));
    await vi.waitFor(() => expect(window.location.pathname).toBe('/co-star'));
    expect(h.selection.identities.value.map(({ positionKey }) => positionKey)).toEqual(completeKeys);
  });

  it('clears only handoff feedback without erasing an independent detail error', async () => {
    const h = await handoffHarness();
    const pending = await h.start();
    pending.result.reject(new Error('旧人物身份查找失败'));
    await flushPromises();
    h.coordinator.personDetail.error = '详情视图暂时不可用';
    h.selection.removePerson(2);
    await flushPromises();
    expect(h.wrapper.text().includes('旧人物身份查找失败')).toBe(false);
    expect(h.coordinator.personDetail.error).toBe('详情视图暂时不可用');
    expect(h.wrapper.get('#person-detail-panel').text()).toContain('详情视图暂时不可用');
    expect(button(h.wrapper, '查看共演').attributes('disabled')).toBeDefined();
  });

  it.each(['wrong person', 'pending', 'error', 'view pending', 'accepted target', 'input target', 'query', 'revision', 'version', 'collection'] as const)('rejects non-current ready detail: %s', async (stale) => {
    const h = await handoffHarness();
    const detail = h.coordinator.personDetail;
    const action = button(h.wrapper, '查看共演');
    if (stale === 'wrong person') detail.payload = { ...detail.payload!, person: { ...detail.payload!.person, id: 13 } };
    if (stale === 'pending') detail.phase = 'pending';
    if (stale === 'error') detail.error = '保留旧详情的失败';
    if (stale === 'view pending') detail.viewPending = true;
    if (stale === 'accepted target') detail.acceptedInput = { personId: 13 };
    if (stale === 'input target') detail.input = { personId: 13 };
    if (stale === 'query') detail.acceptedQuery = { ...h.store.applied!, includeNSFW: true };
    if (stale === 'revision') detail.revision -= 1;
    if (stale === 'version') detail.payload = { ...detail.payload!, dataVersion: `dv1-${'b'.repeat(64)}` };
    if (stale === 'collection') detail.payload = { ...detail.payload!, collection: { ...collection, fetchedAt: '2026-07-26T00:00:00Z' } };
    // Dispatch before rendering disabled state: the action itself must enforce admission.
    await action.trigger('click');
    await flushPromises();
    expect(h.lookups).toHaveLength(0);
    expect(h.preserved()).toEqual(h.before);
  });

  it.each(['ranking view failure', 'ranking query failure', 'ranking cancellation', 'candidate view failure'] as const)('invalidates synchronously at primary START, even after %s restores revision', async (kind) => {
    const h = await handoffHarness();
    const old = await h.start();
    const primary = deferred<OperationResponse<RankingPayload>>();
    const candidate = deferred<OperationResponse<CandidatePayload>>();
    h.ranking.mockImplementationOnce(() => primary.promise);
    if (kind === 'candidate view failure') h.candidates.mockImplementationOnce(() => candidate.promise);
    const loading = kind === 'ranking query failure'
      ? h.coordinator.execute({ mode: 'ranking', catalog: catalogFixture() })
      : kind === 'candidate view failure'
        ? h.coordinator.executeCandidateView(h.coordinator.candidates.input, { sort: 'count', order: 'desc', page: 1, pageSize: 10, search: 'new' })
        : h.coordinator.executeRankingView({ ...h.coordinator.rankings.view, page: 2 });
    expect(old.request.signal.aborted).toBe(true);
    expect(h.store.revision).toBe(h.before.revision);
    await flushPromises();
    const action = h.wrapper.findAll('button').find((node) => node.text().trim() === '查看共演');
    if (action) {
      await action.trigger('click');
      expect(h.lookups).toHaveLength(1);
    }
    if (kind === 'ranking cancellation') h.coordinator.cancel('ranking');
    if (kind === 'candidate view failure') candidate.reject(new Error('new primary failed'));
    else primary.reject(new Error('new primary failed'));
    await loading;
    expect(h.store.revision).toBe(h.before.revision);
    old.result.resolve(response(old.request, linkedPayload(old.request)));
    await flushPromises();
    expect(h.preserved()).toEqual(h.before);
  });

  it.each(['target', 'same target', 'selection', 'mode', 'cancel', 'drawer', 'unmount'] as const)('invalidates pending lookup on %s without a stale commit', async (intent) => {
    const h = await handoffHarness(intent === 'drawer' ? { width: 390 } : {});
    const old = await h.start();
    if (intent === 'target' || intent === 'same target') {
      h.wrapper.getComponent({ name: 'RankingResults' }).vm.$emit('activate', intent === 'target' ? 1 : 12, document.body);
    }
    if (intent === 'selection') h.selection.removePerson(2);
    if (intent === 'mode') await h.wrapper.get('#mode-tab-co-star').trigger('click');
    if (intent === 'cancel') await button(h.wrapper, '取消查看共演').trigger('click');
    if (intent === 'drawer') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    if (intent === 'unmount') {
      h.wrapper.unmount();
      wrappers.splice(wrappers.indexOf(h.wrapper), 1);
    }
    expect(old.request.signal.aborted).toBe(true);
    await flushPromises();
    const state = JSON.parse(JSON.stringify(h.preserved()));
    old.result.resolve(response(old.request, linkedPayload(old.request)));
    await flushPromises();
    expect(h.preserved()).toEqual(state);
    expect(h.selection.identities.value.some(({ person }) => person.id === 12)).toBe(false);
  });

  it.each(['success', 'error'] as const)('stale %s cannot clear a newer pending lookup or its completed error', async (late) => {
    const h = await handoffHarness();
    const old = await h.start();
    await button(h.wrapper, '取消查看共演').trigger('click');
    const newer = await h.start();
    if (late === 'success') old.result.resolve(response(old.request, linkedPayload(old.request)));
    else old.result.reject(new Error('obsolete error'));
    await flushPromises();
    expect(button(h.wrapper, '查看共演').attributes('disabled')).toBeDefined();
    expect(h.preserved()).toEqual(h.before);
    newer.result.reject(new Error('newest error'));
    await flushPromises();
    expect(h.wrapper.text()).toContain('newest error');
    expect(h.wrapper.text()).not.toContain('obsolete error');
    expect(button(h.wrapper, '查看共演').attributes('disabled')).toBeUndefined();
  });

  it('a late completion cannot erase an already completed newer error', async () => {
    const h = await handoffHarness();
    const old = await h.start();
    await button(h.wrapper, '取消查看共演').trigger('click');
    const newer = await h.start();
    newer.result.reject(new Error('newest completed error'));
    await flushPromises();
    old.result.resolve(response(old.request, linkedPayload(old.request)));
    await flushPromises();
    expect(h.wrapper.text()).toContain('newest completed error');
    expect(h.preserved()).toEqual(h.before);
  });
});

describe('App person workspace links', () => {
  it('temporarily replaces the wide analysis card, preserves its instance and selection, and returns focus', async () => {
    const h = await setup();
    const analysisNode = h.wrapper.get('.co-star-surface').element;
    const previousIds = selectedIds(h.wrapper);
    const trigger = await inspectFirst(h.wrapper);

    expect(h.wrapper.get('#co-star-person-detail-panel').element.tagName).toBe('ASIDE');
    expect(h.wrapper.get('.co-star-surface').element).toBe(analysisNode);
    expect(analysisNode.closest('[hidden]')).not.toBeNull();
    expect(analysisNode.closest('[inert]')).not.toBeNull();
    expect(selectedIds(h.wrapper)).toEqual(previousIds);
    await button(h.wrapper, '返回共演分析').trigger('click');
    await flushPromises();

    expect(h.wrapper.find('#co-star-person-detail-panel').exists()).toBe(false);
    expect(h.wrapper.get('.co-star-surface').element).toBe(analysisNode);
    expect(analysisNode.closest('[hidden]')).toBeNull();
    expect(selectedIds(h.wrapper)).toEqual(previousIds);
    expect(document.activeElement).toBe(trigger.element);
    expect(h.analysis).toHaveBeenCalledOnce();
  }, 15000);

  it.each([390, 959])('opens a drawer at %s px and Escape preserves the original analysis', async (width) => {
    const h = await setup({ width });
    const analysisNode = h.wrapper.get('.co-star-surface').element;
    await inspectFirst(h.wrapper);
    expect(h.wrapper.get('#co-star-person-detail-panel').attributes('role')).toBe('dialog');
    expect(analysisNode.closest('[hidden]')).toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flushPromises();
    await vi.waitFor(() => expect(h.wrapper.find('#co-star-person-detail-panel').exists()).toBe(false));
    expect(h.wrapper.get('.co-star-surface').element).toBe(analysisNode);
    expect(h.analysis).toHaveBeenCalledOnce();
  }, 15000);

  it('keeps the inspected person across the 959/960 boundary with one detail panel', async () => {
    const h = await setup({ width: 959 });
    await inspectFirst(h.wrapper);
    h.resize(960);
    await flushPromises();
    expect(h.wrapper.findAll('#co-star-person-detail-panel')).toHaveLength(1);
    expect(h.wrapper.get('#co-star-person-detail-panel').element.tagName).toBe('ASIDE');
    expect(h.wrapper.get('#co-star-person-detail-panel').text()).toContain('人物1');
    h.resize(959);
    await flushPromises();
    expect(h.wrapper.findAll('#co-star-person-detail-panel')).toHaveLength(1);
    expect(h.wrapper.get('#co-star-person-detail-panel').attributes('role')).toBe('dialog');
    expect(h.detail).toHaveBeenCalledOnce();
  }, 15000);

  it('locates the exact ranked person on the returned page without applying dirty Draft', async () => {
    const h = await setup();
    const applied = JSON.parse(JSON.stringify(h.store.applied));
    h.store.draft.includeNSFW = true;
    await inspectFirst(h.wrapper);
    await button(h.wrapper, '在排行中查看').trigger('click');
    await vi.waitFor(() => expect(h.wrapper.find('#mode-panel-ranking [data-person-id="1"][aria-current="true"]').exists()).toBe(true), { timeout: 10000 });

    expect(h.ranking.mock.calls.some(([request]) => request.view.page === 2 && request.view.search === '')).toBe(true);
    expect(h.detail.mock.calls.at(-1)![0].input.personId).toBe(1);
    expect(h.store.applied).toEqual(applied);
    expect(h.store.draft.includeNSFW).toBe(true);
    expect(h.store.dirty).toBe(true);
    expect(h.wrapper.find('#person-detail-panel > .person-detail-surface__actions').exists()).toBe(false);
    expect(h.wrapper.get('#person-detail-panel .person-profile__action').text()).toBe('查看共演');
    const rankingCallsAfterLocation = h.ranking.mock.calls.length;
    await h.wrapper.get('#mode-tab-co-star').trigger('click');
    await flushPromises();
    expect(window.location.pathname).toBe('/co-star');
    expect(selectedIds(h.wrapper)).toEqual(['1', '2']);
    expect(h.ranking).toHaveBeenCalledTimes(rankingCallsAfterLocation);
    await inspectFirst(h.wrapper);
    const ids = [...document.querySelectorAll('[id]')].map((element) => element.id);
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
    const rankingCallsAfterInspection = h.ranking.mock.calls.length;
    await h.wrapper.get('#mode-tab-ranking').trigger('click');
    await flushPromises();
    expect(h.wrapper.find('#mode-panel-ranking [data-person-id="1"][aria-current="true"]').exists()).toBe(true);
    expect(h.ranking).toHaveBeenCalledTimes(rankingCallsAfterInspection);
  }, 15000);

  it('follows the ranking person as the sole partner source and keeps the current group across ordinary Header navigation', async () => {
    const h = await setup();
    await h.wrapper.get('#mode-tab-ranking').trigger('click');
    await vi.waitFor(() => expect(button(h.wrapper, '查看共演').exists()).toBe(true), { timeout: 10000 });
    h.store.draft.includeNSFW = true;
    const beforeFollowApplied = JSON.parse(JSON.stringify(h.store.applied));
    const beforeFollowDraft = JSON.parse(JSON.stringify(h.store.draft));
    await button(h.wrapper, '查看共演').trigger('click');
    await vi.waitFor(() => expect(h.partners.mock.calls.at(-1)?.[0].input.source.personId).toBe(12), { timeout: 10000 });

    expect(selectedIds(h.wrapper)).toEqual(['12']);
    expect(h.store.coStarPositionScope).toBe('all');
    expect(h.store.appliedCoStarPositionScope).toBe('all');
    expect(h.store.applied).toEqual(beforeFollowApplied);
    expect(h.store.draft).toEqual(beforeFollowDraft);
    expect(h.wrapper.get('.query-summary').text()).toContain('全部职位');
    await h.wrapper.get('.query-summary').trigger('click');
    await flushPromises();
    expect(h.wrapper.findAll('.position-selector__toggle')).toHaveLength(1);
    expect(h.wrapper.get('.position-selector__selected-label').text()).toBe('全部');
    expect(h.partners.mock.calls.at(-1)![0].input).toEqual({
      positionScope: 'all', source: { personId: 12, positionKeys: ['staff:anime:2'] },
    });
    expect(h.partners.mock.calls.at(-1)![0].query.positionKeys).toEqual(['staff:anime:2']);
    expect(h.candidates.mock.calls.filter(([request]) => request.transactionId.startsWith('linked-candidates-'))).toHaveLength(0);
    expect(h.partners.mock.calls.at(-1)![0].query.includeNSFW).toBe(false);
    expect(h.store.draft.includeNSFW).toBe(true);
    expect(h.wrapper.findAll('button').some((candidate) => ['返回人物排行', '返回原分析'].includes(candidate.text().trim()))).toBe(false);
    await h.wrapper.get('.partners-results-boundary .ranked-person-row').trigger('click');
    await vi.waitFor(() => expect(h.analysis).toHaveBeenCalledTimes(2));
    expect(h.analysis.mock.calls.at(-1)![0].input).toEqual({
      positionScope: 'all', participants: [
        { personId: 12, positionKeys: ['staff:anime:2'] },
        { personId: 2, positionKeys: ['cast:anime:all'] },
      ],
    });
    expect(h.store.applied!.positionKeys).toEqual(['staff:anime:2']);
    await vi.waitFor(() => {
      const saved = createQuerySessionOwner(window).read('/co-star');
      expect(saved?.workspace).toMatchObject({
        kind: 'co-star', state: 'analysis',
        coStar: { input: { positionScope: 'all', participants: [
          { personId: 12, positionKeys: ['staff:anime:2'] },
          { personId: 2, positionKeys: ['cast:anime:all'] },
        ] } },
      });
    });
    await h.wrapper.get('#mode-tab-ranking').trigger('click');
    await flushPromises();
    await h.wrapper.get('#mode-tab-co-star').trigger('click');
    await flushPromises();
    expect(selectedIds(h.wrapper)).toEqual(['12', '2']);
    expect(h.wrapper.findAll('.co-star-participant-card')).toHaveLength(2);
    expect(h.analysis).toHaveBeenCalledTimes(2);
  }, 15000);

  it('does not activate the linked person when Header navigation supersedes a delayed target-page request', async () => {
    const targetPage = deferred<OperationResponse<RankingPayload>>();
    let pendingRequest: RankRequest | undefined;
    const h = await setup({ rankingExecute: async (request) => {
      if (request.view.page === 2 && !request.view.locatePersonId) {
        pendingRequest = request;
        return targetPage.promise;
      }
      return response(request, rankingPayload(request));
    } });
    await inspectFirst(h.wrapper);
    await button(h.wrapper, '在排行中查看').trigger('click');
    await vi.waitFor(() => expect(pendingRequest).toBeDefined());
    const detailCallsBeforeLeaving = h.detail.mock.calls.length;
    await h.wrapper.get('#mode-tab-co-star').trigger('click');
    await flushPromises();
    targetPage.resolve(response(pendingRequest!, rankingPayload(pendingRequest!)));
    await flushPromises();

    expect(window.location.pathname).toBe('/co-star');
    expect(h.wrapper.get('#mode-panel-ranking').attributes('hidden')).toBeDefined();
    expect(h.wrapper.find('#co-star-person-detail-panel').exists()).toBe(false);
    expect(h.detail).toHaveBeenCalledTimes(detailCallsBeforeLeaving);
    expect(selectedIds(h.wrapper)).toEqual(['1', '2']);
  }, 15000);
});
