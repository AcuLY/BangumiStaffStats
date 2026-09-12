import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import App from '../../src/app/App.vue';
import { createQuerySessionOwner } from '../../src/features/query/session';
import type { CandidatePayload } from '../../src/api/adapters/candidates';
import { decodeCoStarPayload, type CoStarPayload } from '../../src/api/adapters/coStar';
import { decodePartnersPayload, type PartnersPayload } from '../../src/api/adapters/partners';
import { decodePersonDetailPayload, type PersonDetailPayload } from '../../src/api/adapters/personDetail';
import type { RankingPayload } from '../../src/api/adapters/rankings';
import type { OperationResponse, QueryDrivers } from '../../src/features/query/coordinator';
import { useQueryStore } from '../../src/features/query/store';
import { catalogFixture } from '../features/query/fixtures';

type Drivers = QueryDrivers<RankingPayload, CandidatePayload, PersonDetailPayload, PartnersPayload, CoStarPayload>;
type RankRequest = Parameters<Drivers['rankings']['execute']>[0];
const wrappers: VueWrapper[] = [];
const primaryDataVersion = `dv1-${'a'.repeat(64)}`;
const collection = { fetchedAt: '2026-07-25T00:00:00Z', stale: false, warningCodes: [] } as const;

function golden(operation: string): unknown {
  const filename = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..', 'contracts/goldens/api', operation, 'cases/personal.json');
  const fixture = JSON.parse(fs.readFileSync(filename, 'utf8')) as { cases: Array<{ expected: { body: unknown } }> };
  return fixture.cases[0]!.expected.body;
}

function person(id: number) {
  return { id, name: `Person ${id}`, nameCN: `人物${id}` };
}

function candidatePayload(request: Parameters<Drivers['candidates']['execute']>[0]): CandidatePayload {
  return {
    collection, dataVersion: primaryDataVersion,
    items: [1, 2].map((id) => ({ person: person(id), rank: id, positionKeys: ['staff:anime:2'], workCount: 12 - id })),
    pagination: { page: 1, pageSize: 10, total: 2 },
    positionCounts: [{ count: 2, positionKey: 'staff:anime:2' }],
    positionKey: request.input.positionKey, requestId: 'candidates', scope: 'personal', workUnit: 'subject',
  };
}

function rankingPayload(request: RankRequest): RankingPayload {
  const id = request.view.page === 2 ? 1 : 12;
  return {
    collection, dataVersion: primaryDataVersion,
    ...(request.view.locatePersonId ? { location: { personId: request.view.locatePersonId, rank: 11, page: 2 } } : {}),
    items: [{ person: person(id), rank: request.view.page === 2 ? 11 : 1, workCount: 3, average: 800, overall: 600, preference: null }],
    metricScale: { kind: 'linear', metric: 'count', max: 3 },
    pagination: { page: request.view.page ?? 1, pageSize: request.view.pageSize ?? 10, total: 20 },
    requestId: 'ranking', scope: 'personal', summary: { personCount: 20, workCount: 30, workUnit: 'subject' },
  };
}

function response<T>(request: { transactionId: string }, payload: T): OperationResponse<T> {
  return { payload, requestId: 'server-response', transactionId: request.transactionId };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
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

async function setup(options: { width?: number; rankingExecute?: Drivers['rankings']['execute'] } = {}) {
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
  store.draft.uid = 'luca';
  store.draft.positionKeys = ['staff:anime:2'];
  const detailBase = decodePersonDetailPayload(golden('person-detail'));
  const coStarBody = golden('co-star') as { data: { participants: Array<{ positionKeys: string[] }> } };
  coStarBody.data.participants.forEach((participant) => { participant.positionKeys = ['staff:anime:2']; });
  const analysisBase = decodeCoStarPayload(coStarBody, 'personal');
  const partnerBase = decodePartnersPayload(golden('partners'), 'personal');
  const ranking = vi.fn<Drivers['rankings']['execute']>(options.rankingExecute ?? (async (request) => response(request, rankingPayload(request))));
  const detail = vi.fn<NonNullable<Drivers['personDetail']>['execute']>(async (request) => response(request, {
    ...detailBase, collection, dataVersion: primaryDataVersion,
    person: { ...detailBase.person, ...person(request.input.personId) },
  }));
  const analysis = vi.fn<NonNullable<Drivers['coStar']>['execute']>(async (request) => response(request, {
    ...analysisBase, collection, dataVersion: primaryDataVersion,
    data: { ...analysisBase.data, participants: analysisBase.data.participants.map((participant, index) => ({
      ...participant, person: person(request.input.participants[index]!.personId), positionKeys: request.input.participants[index]!.positionKeys,
    })) },
  }));
  const partners = vi.fn<NonNullable<Drivers['partners']>['execute']>(async (request) => response(request, {
    ...partnerBase, collection, dataVersion: primaryDataVersion,
    source: { ...partnerBase.source, person: person(request.input.source.personId), positionKeys: request.input.source.positionKeys.map(String) },
    items: partnerBase.items.map((item) => ({ ...item, positionKeys: [request.input.source.personId === 12 ? 'cast:anime:all' : 'staff:anime:2'] })),
  }));
  const wrapper = mount(App, {
    attachTo: document.body,
    global: { plugins: [pinia], stubs: { teleport: true } },
    props: { services: {
      targetWindow: window,
      catalogApi: { async load() { return catalogFixture(); } },
      drivers: {
        candidates: { async execute(request) { return response(request, candidatePayload(request)); } },
        rankings: { execute: ranking }, personDetail: { execute: detail }, coStar: { execute: analysis }, partners: { execute: partners },
      },
    } },
  });
  wrappers.push(wrapper);
  await flushPromises();
  await wrapper.get('#query-editor').trigger('submit');
  await vi.waitFor(() => expect(wrapper.findAll('button.candidate-row')).toHaveLength(2), { timeout: 10000 });
  await wrapper.findAll('button.candidate-row')[1]!.trigger('click');
  await vi.waitFor(() => expect(wrapper.findAll('.co-star-surface .co-star-participant-card .co-star-person-inspect:not([aria-disabled="true"])')).toHaveLength(2), { timeout: 10000 });
  return { wrapper, store, ranking, detail, analysis, partners, resize };
}

const scrollRestorers: Array<() => void> = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  scrollRestorers.splice(0).reverse().forEach((restore) => restore());
  vi.unstubAllGlobals();
});

function button(wrapper: VueWrapper, label: string) {
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
