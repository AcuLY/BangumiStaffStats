import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPinia, setActivePinia } from 'pinia';
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/app/App.vue';
import QueryWorkspace from '../../src/features/query/components/QueryWorkspace.vue';
import PersonDetailSurface from '../../src/features/person-detail/components/PersonDetailSurface.vue';
import RankingResults from '../../src/features/ranking/components/RankingResults.vue';
import { decodePersonDetailPayload, type PersonDetailPayload } from '../../src/api/adapters/personDetail';
import type { RankingPayload } from '../../src/api/adapters/rankings';
import type { CatalogApi } from '../../src/api/catalog';
import { PersonDetailApiError } from '../../src/api/personDetail';
import type { QueryDrivers, OperationResponse } from '../../src/features/query/coordinator';
import { createQuerySessionOwner } from '../../src/features/query/session';
import { useQueryStore } from '../../src/features/query/store';
import { createPersonEntryDraft } from '../../src/app/personEntry';
import { catalogFixture } from '../features/query/fixtures';

type Drivers = QueryDrivers<RankingPayload, never, PersonDetailPayload>;
type RankRequest = Parameters<Drivers['rankings']['execute']>[0];
type DetailRequest = Parameters<NonNullable<Drivers['personDetail']>['execute']>[0];
const entryUrl = '/ranking?entry=bangumi-person&user=luca&person=42&type=anime';
const collection = { fetchedAt: '2026-07-25T00:00:00Z', stale: false, warningCodes: [] } as const;
const dataVersion = `dv1-${'a'.repeat(64)}`;
const detailGolden = JSON.parse(fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../contracts/goldens/api/person-detail/cases/personal.json'), 'utf8')).cases[0].expected.body;
const detailBase = decodePersonDetailPayload(detailGolden);
const wrappers: VueWrapper[] = [];
function response<T>(request: { transactionId: string }, payload: T): OperationResponse<T> {
  return { payload, requestId: 'server-response', transactionId: request.transactionId };
}
function rankPayload(empty = false): RankingPayload {
  return { collection, dataVersion, requestId: 'ranking', scope: 'personal',
    items: empty ? [] : [{ person: { id: 12, name: 'Person 12', nameCN: '人物12' }, rank: 1, workCount: 3, average: 800, overall: 600, preference: null }],
    metricScale: { kind: 'linear', metric: 'count', max: empty ? null : 3 },
    pagination: { page: 1, pageSize: 10, total: empty ? 0 : 20 },
    summary: { personCount: empty ? 0 : 20, workCount: empty ? 0 : 30, workUnit: 'subject' } };
}
function detailPayload(id: number): PersonDetailPayload {
  return { ...detailBase, collection, dataVersion, person: { ...detailBase.person, id, name: `Person ${id}`, nameCN: `人物${id}` } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function apiError(code: PersonDetailApiError['code']) {
  return new PersonDetailApiError({ error: { code, message: code, fieldErrors: {}, retryable: true }, meta: { requestId: 'detail-error' } }, 400);
}
function setup(options: {
  url?: string; width?: number; empty?: boolean; saved?: boolean;
  catalogLoad?: CatalogApi['load']; rankingExecute?: Drivers['rankings']['execute'];
  detailExecute?: NonNullable<Drivers['personDetail']>['execute'];
} = {}) {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: query.startsWith('(width <') ? (options.width ?? 1280) < Number(query.match(/\d+/)![0]) : false,
    media: query, addEventListener() {}, removeEventListener() {},
  })));
  window.history.replaceState({}, '', options.url ?? entryUrl);
  const pinia = createPinia(); setActivePinia(pinia);
  const store = useQueryStore(pinia);
  if (options.saved) expect(createQuerySessionOwner(window).write('/ranking', {
    scope: 'personal', uid: 'old-user', subjectType: 'anime', collectionStatuses: ['completed'],
    positionKeys: ['staff:anime:2'], includeNSFW: true, mergeSeries: true,
  }, { kind: 'ranking', rankingsView: { page: 2, search: 'old-search' }, detail: { input: { personId: 99 }, view: { section: 'works' } } })).toBe(true);
  const ranking = vi.fn<Drivers['rankings']['execute']>(options.rankingExecute ?? (async req => response(req, rankPayload(options.empty))));
  const detail = vi.fn<NonNullable<Drivers['personDetail']>['execute']>(options.detailExecute ?? (async req => response(req, detailPayload(req.input.personId))));
  const candidates = vi.fn<Drivers['candidates']['execute']>(async () => { throw new Error('No candidates in entry flow'); });
  const load = vi.fn<CatalogApi['load']>(options.catalogLoad ?? (async () => catalogFixture()));
  const wrapper = mount(App, { attachTo: document.body, global: { plugins: [pinia] }, props: { services: {
    catalogApi: { load }, drivers: { rankings: { execute: ranking }, personDetail: { execute: detail }, candidates: { execute: candidates } },
    surfaceLoaders: { ranking: async () => ({ default: RankingResults }), personDetail: async () => ({ default: PersonDetailSurface }) }, targetWindow: window,
  } } });
  wrappers.push(wrapper);
  const coordinator = wrapper.getComponent(QueryWorkspace).props('coordinator');
  return { wrapper, store, ranking, detail, candidates, load, coordinator };
}
function button(root: VueWrapper | DOMWrapper<Element>, label: string) {
  const found = root.findAll('button').find(item => item.text().trim() === label);
  if (!found) throw new Error(`Missing button ${label}`);
  return found;
}
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); vi.unstubAllGlobals(); });

describe('App one-time person entry with real coordinator', () => {
  it.each([1280, 390])('renders confirmed no participation only in detail at width %s', async width => {
    const { wrapper, store, detail } = setup({ width, detailExecute: async req => {
      if (req.input.personId === 42) throw apiError('PERSON_NOT_IN_QUERY_RESULT');
      return response(req, detailPayload(req.input.personId));
    } });
    await flushPromises();
    const panel = new DOMWrapper(document.querySelector('#person-detail-panel')!);
    expect(panel.text()).toContain('该人物没有参与当前查询条件下的收藏作品');
    expect(panel.text()).toContain('人物 ID：42');
    expect(panel.text()).toContain('动画');
    expect(panel.find('[role="status"]').exists()).toBe(true);
    expect(panel.find('[role="alert"], .person-profile, .metric-unit, .subject-work-row').exists()).toBe(false);
    expect(panel.text()).not.toContain('重试');
    expect(wrapper.find('.app-query-feedback').exists()).toBe(false);
    expect(wrapper.getComponent(RankingResults).text()).toContain('人物12');
    if (width === 390) await panel.get('button[aria-label="关闭人物详情"]').trigger('click');
    store.patchDraft({ uid: 'edited-user' });
    expect(store.draft.uid).toBe('edited-user');
    wrapper.getComponent(RankingResults).vm.$emit('activate', 12, document.body);
    await flushPromises();
    expect(document.querySelector('#person-detail-panel')?.textContent).toContain('人物12');
    expect(document.body.textContent).not.toContain('该人物没有参与当前查询条件下的收藏作品');
    expect(detail.mock.calls.map(([req]) => req.input.personId)).toEqual([42, 12]);
  });

  it.each(['ENTITY_NOT_FOUND', 'COLLECTION_NOT_PUBLIC', 'USER_NOT_FOUND', 'UPSTREAM_UNAVAILABLE', 'UPSTREAM_TIMEOUT', 'NOT_READY'] as const)('retains actual %s error and retry', async code => {
    let failed = false;
    const { wrapper, detail } = setup({ detailExecute: async req => {
      if (!failed) { failed = true; throw apiError(code); }
      return response(req, detailPayload(req.input.personId));
    } });
    await flushPromises();
    const panel = wrapper.get('#person-detail-panel');
    expect(panel.get('[role="alert"]').text()).toContain(apiError(code).message);
    expect(document.body.textContent).not.toContain('该人物没有参与当前查询条件下的收藏作品');
    await panel.get('button.app-primary-action').trigger('click');
    await flushPromises();
    expect(detail).toHaveBeenCalledTimes(2);
    expect(wrapper.get('#person-detail-panel').text()).toContain('人物42');
  });

  it('does not infer no participation from a network error message', async () => {
    const { wrapper } = setup({ detailExecute: async () => { throw new Error('PERSON_NOT_IN_QUERY_RESULT'); } });
    await flushPromises();
    expect(wrapper.get('#person-detail-panel [role="alert"]').text()).toContain('人物详情加载失败');
    expect(document.body.textContent).not.toContain('该人物没有参与当前查询条件下的收藏作品');
  });

  it.each(['selection', 'cancel', 'query'] as const)('ignores a late no-participation error after %s', async action => {
    const pending = deferred<OperationResponse<PersonDetailPayload>>();
    const { wrapper, coordinator, store } = setup({ detailExecute: req => req.input.personId === 42
      ? pending.promise : Promise.resolve(response(req, detailPayload(req.input.personId))) });
    await flushPromises();
    if (action === 'selection') wrapper.getComponent(RankingResults).vm.$emit('activate', 12, document.body);
    if (action === 'cancel') coordinator.cancelPersonDetail('人物详情加载已取消');
    if (action === 'query') {
      store.patchDraft({ uid: 'new-user' });
      await coordinator.execute({ catalog: catalogFixture(), mode: 'ranking' });
    }
    await flushPromises();
    pending.reject(apiError('PERSON_NOT_IN_QUERY_RESULT'));
    await flushPromises();
    expect(document.body.textContent).not.toContain('该人物没有参与当前查询条件下的收藏作品');
    if (action !== 'cancel') expect(wrapper.get('#person-detail-panel').text()).toContain('人物12');
  });

  it('keeps a confirmed empty target local when the whole ranking is empty', async () => {
    const { wrapper, store } = setup({ empty: true, detailExecute: async () => { throw apiError('PERSON_NOT_IN_QUERY_RESULT'); } });
    await flushPromises();
    expect(wrapper.get('#person-detail-panel').text()).toContain('该人物没有参与当前查询条件下的收藏作品');
    expect(wrapper.text()).toContain('没有符合查询条件的人物');
    expect(wrapper.find('.app-query-feedback').exists()).toBe(false);
    store.patchDraft({ uid: 'another-user' });
    expect(store.draft.uid).toBe('another-user');
  });

  it('abandons entry when the user edits while catalog is pending', async () => {
    const catalog = deferred<ReturnType<typeof catalogFixture>>();
    const { store, ranking, detail } = setup({ catalogLoad: () => catalog.promise });
    store.patchDraft({ uid: 'new-user' });
    catalog.resolve(catalogFixture());
    await flushPromises();
    expect(ranking).not.toHaveBeenCalled();
    expect(detail).not.toHaveBeenCalled();
    expect(store.draft.uid).toBe('new-user');
  });
  it('abandons entry on navigation before catalog completes, even after navigating back', async () => {
    const catalog = deferred<ReturnType<typeof catalogFixture>>();
    const { wrapper, ranking, detail } = setup({ catalogLoad: () => catalog.promise });
    await wrapper.get('#mode-tab-co-star').trigger('click');
    await wrapper.get('#mode-tab-ranking').trigger('click');
    catalog.resolve(catalogFixture());
    await flushPromises();
    expect(ranking).not.toHaveBeenCalled();
    expect(detail).not.toHaveBeenCalled();
  });

  it.each(['edit', 'navigate', 'cancel', 'replace'] as const)('relinquishes a pending ranking to user %s and ignores its late response', async action => {
    const pending = deferred<OperationResponse<RankingPayload>>();
    const { wrapper, store, ranking, detail, coordinator } = setup({
      rankingExecute: req => req.sequence === 1 ? pending.promise : Promise.resolve(response(req, rankPayload())),
    });
    await flushPromises();
    const request = ranking.mock.calls[0]![0];
    if (action === 'edit') store.patchDraft({ uid: 'new-user' });
    if (action === 'navigate') await wrapper.get('#mode-tab-co-star').trigger('click');
    if (action === 'cancel') coordinator.cancelPending();
    if (action === 'replace') await coordinator.execute({ catalog: catalogFixture(), mode: 'ranking' });
    expect(request.signal.aborted).toBe(true);
    pending.resolve(response(request, rankPayload()));
    await flushPromises();
    expect(detail.mock.calls.some(([req]) => req.input.personId === 42)).toBe(false);
    if (action === 'edit') {
      expect(store.applied).toBeNull();
      expect(wrapper.find('#query-editor').exists()).toBe(true);
    }
    if (action === 'cancel') {
      await coordinator.execute({ catalog: catalogFixture(), mode: 'ranking' });
      await flushPromises();
      expect(detail.mock.calls.map(([req]) => req.input.personId)).toEqual([12]);
    }
  });

  it('retains a failed ranking target for explicit retry, without automatic replay', async () => {
    const { wrapper, ranking, detail, coordinator } = setup({ rankingExecute: async req => {
      if (req.sequence === 1) throw new Error('Network unavailable');
      return response(req, rankPayload());
    } });
    await flushPromises();
    expect(ranking).toHaveBeenCalledOnce();
    expect(detail).not.toHaveBeenCalled();
    expect(wrapper.find('#query-editor').exists()).toBe(true);
    await coordinator.execute({ catalog: catalogFixture(), mode: 'ranking' });
    await flushPromises();
    expect(ranking).toHaveBeenCalledTimes(2);
    expect(detail.mock.calls.map(([req]) => req.input.personId)).toEqual([42]);
  });

  it('a newer primary after ranking failure relinquishes the retry target', async () => {
    const { detail, coordinator } = setup({ rankingExecute: async req => {
      if (req.sequence === 1) throw new Error('Network unavailable');
      return response(req, rankPayload());
    } });
    await flushPromises();
    await coordinator.execute({ catalog: catalogFixture(), mode: 'co-star' });
    await coordinator.execute({ catalog: catalogFixture(), mode: 'ranking' });
    await flushPromises();
    expect(detail.mock.calls.map(([req]) => req.input.personId)).toEqual([12]);
  });

  it('recovers catalog failure once and never replays entry on later catalog retry', async () => {
    let attempts = 0;
    const { wrapper, ranking, detail } = setup({ catalogLoad: async () => {
      if (++attempts === 1) throw new Error('Catalog unavailable');
      return catalogFixture();
    } });
    await flushPromises();
    expect(ranking).not.toHaveBeenCalled();
    const retry = wrapper.getComponent(QueryWorkspace).props('retryCatalog');
    await retry();
    await flushPromises();
    expect(ranking).toHaveBeenCalledOnce();
    expect(detail.mock.calls.map(([req]) => req.input.personId)).toEqual([42]);
    await retry();
    await flushPromises();
    expect(ranking).toHaveBeenCalledOnce();
    expect(detail).toHaveBeenCalledOnce();
  });

  it.each([`${entryUrl}&person=7`, `${entryUrl}&extra=1`, entryUrl.replace('42', '9007199254740992')])('suppresses saved recovery for invalid entry %s', async url => {
    const { wrapper, store, ranking, detail } = setup({ saved: true, url });
    await flushPromises();
    expect(ranking).not.toHaveBeenCalled();
    expect(detail).not.toHaveBeenCalled();
    expect(store.applied).toBeNull();
    expect(wrapper.find('#query-editor').exists()).toBe(true);
  });

  it('preserves ordinary user prefill without automatically querying', async () => {
    const { store, ranking } = setup({ url: '/ranking?user=ordinary' });
    await flushPromises();
    expect(store.draft.uid).toBe('ordinary');
    expect(ranking).not.toHaveBeenCalled();
  });

  it.each([1280, 390])('opens the target even with an empty ranking at width %s', async width => {
    const { wrapper, detail } = setup({ width, empty: true });
    await flushPromises();
    expect(detail.mock.calls.map(([req]) => req.input.personId)).toEqual([42]);
    const surface = wrapper.getComponent(PersonDetailSurface);
    expect(surface.props('compact')).toBe(width === 390);
    expect(surface.props('open')).toBe(width === 390);
    expect(document.body.textContent).toContain('人物42');
  });

  it('ignores the entry detail response after a newer user selection', async () => {
    const pending = deferred<OperationResponse<PersonDetailPayload>>();
    const { wrapper, detail, coordinator } = setup({ detailExecute: req => req.input.personId === 42
      ? pending.promise : Promise.resolve(response(req, detailPayload(req.input.personId))) });
    await flushPromises();
    const old = detail.mock.calls[0]![0];
    wrapper.getComponent(RankingResults).vm.$emit('activate', 12, document.body);
    await flushPromises();
    expect(old.signal.aborted).toBe(true);
    pending.resolve(response(old, detailPayload(42)));
    await flushPromises();
    expect(coordinator.personDetail.payload).toMatchObject({ person: { id: 12 } });
    expect(wrapper.get('#person-detail-panel').text()).toContain('人物12');
    expect(detail.mock.calls.map(([req]) => req.input.personId)).toEqual([42, 12]);
  });

  it('runs one fresh query after catalog, ignoring recovery, and opens an off-page target', async () => {
    const catalog = deferred<ReturnType<typeof catalogFixture>>();
    const { wrapper, store, ranking, detail, candidates } = setup({ saved: true, catalogLoad: () => catalog.promise });
    expect(window.location.search).toBe('');
    expect(ranking).not.toHaveBeenCalled();
    catalog.resolve(catalogFixture());
    await flushPromises();
    expect(ranking).toHaveBeenCalledOnce();
    expect(ranking.mock.calls[0]![0].query).toEqual({ scope: 'personal', uid: 'luca', subjectType: 'anime',
      collectionStatuses: ['wish', 'completed', 'in_progress', 'on_hold', 'dropped'], positionScope: 'all', positionKeys: [], includeNSFW: false, mergeSeries: false });
    expect(ranking.mock.calls[0]![0].view).toMatchObject({ page: 1, search: '' });
    expect(detail).toHaveBeenCalledOnce();
    expect(detail.mock.calls[0]![0].input).toEqual({ personId: 42 });
    expect(candidates).not.toHaveBeenCalled();
    expect(wrapper.get('#person-detail-panel').text()).toContain('人物42');
    expect(store.draft).toEqual(createPersonEntryDraft({ uid: 'luca', personId: 42, subjectType: 'anime' }));
    expect(wrapper.find('#query-editor').exists()).toBe(false);
    expect(window.location.search).toBe('?user=luca');
  });
});
