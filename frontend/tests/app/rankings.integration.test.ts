import { createPinia, setActivePinia } from 'pinia';
import { NSelect } from 'naive-ui';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';

import type { RankingPayload } from '../../src/api/adapters/rankings';
import type { PersonDetailPayload } from '../../src/api/adapters/personDetail';
import type { CatalogApi } from '../../src/api/catalog';
import App from '../../src/app/App.vue';
import type {
  OperationResponse,
  QueryDrivers,
} from '../../src/features/query/coordinator';
import type { AppliedQuery } from '../../src/features/query/model';
import { createQuerySessionOwner, QUERY_SESSION_STORAGE_KEY } from '../../src/features/query/session';
import type { RecoveryWorkspace } from '../../src/features/query/recovery';
import { useQueryStore } from '../../src/features/query/store';
import { catalogFixture } from '../features/query/fixtures';

const rankingDataVersion = `dv1-${'d'.repeat(64)}`;

async function waitForRankingSurface(wrapper: VueWrapper): Promise<void> {
  await vi.waitFor(() => {
    expect(
      wrapper.findComponent({ name: 'RankingResults' }).exists() ||
      wrapper.find('.ranking-page-empty-state').exists(),
    ).toBe(true);
  }, { timeout: 10000 });
}

function rankingPayload(
  requestId: string,
  metric: 'average' | 'count',
  dataVersion = rankingDataVersion,
  fetchedAt = '2026-07-25T00:00:00Z',
): RankingPayload {
  return Object.freeze({
    collection: Object.freeze({
      fetchedAt,
      stale: false,
      warningCodes: Object.freeze([]),
    }),
    dataVersion,
    items: Object.freeze([
      Object.freeze({
        average: 825,
        overall: 677,
        person: Object.freeze({
          id: 12,
          name: 'Hayashi Akira',
          nameCN: '林明',
        }),
        preference: null,
        rank: 2,
        workCount: 7,
      }),
    ]),
    metricScale: Object.freeze({
      kind: 'linear',
      max: metric === 'count' ? 7 : 825,
      metric,
    }),
    pagination: Object.freeze({
      page: 1,
      pageSize: 10,
      total: 1,
    }),
    requestId,
    scope: 'personal',
    summary: Object.freeze({
      personCount: 8,
      workCount: 21,
      workUnit: 'subject',
    }),
  });
}

function emptyRankingPayload(): RankingPayload {
  const payload = rankingPayload('server-ranking-empty', 'count');
  return Object.freeze({
    ...payload,
    items: Object.freeze([]),
    metricScale: Object.freeze({
      ...payload.metricScale,
      max: null,
    }),
    pagination: Object.freeze({
      ...payload.pagination,
      total: 0,
    }),
    summary: Object.freeze({
      ...payload.summary,
      personCount: 0,
      workCount: 0,
    }),
  });
}

function detailPayload(
  dataVersion = rankingDataVersion,
  fetchedAt = '2026-07-25T00:00:00Z',
): PersonDetailPayload {
  const buckets = Array.from({ length: 10 }, (_, index) => ({
    count: index === 7 ? 1 : 0,
    examples: [],
    hiddenCount: 0,
    score: index + 1,
  })) as never;
  return Object.freeze({
    collection: Object.freeze({
      fetchedAt,
      stale: false,
      warningCodes: Object.freeze([]),
    }),
    dataVersion,
    items: Object.freeze([]),
    metrics: Object.freeze({
      average: 825,
      overall: 677,
      ratedWorkCount: 7,
    }),
    pagination: Object.freeze({
      page: 1,
      pageSize: 10,
      total: 0,
    }),
    person: Object.freeze({
      careers: Object.freeze(['producer'] as const),
      id: 12,
      name: 'Hayashi Akira',
      nameCN: '林明',
    }),
    ratings: Object.freeze({
      global: Object.freeze({
        average: 825,
        buckets,
        timeline: Object.freeze([]),
        validCount: 7,
      }),
    }),
    requestId: 'server-detail',
    scope: 'global',
    section: 'works',
    summary: Object.freeze({
      workCount: 7,
      workUnit: 'subject',
    }),
    tags: Object.freeze({
      community: Object.freeze([]),
      meta: Object.freeze([]),
    }),
  });
}

function installCompactLayout(initialMatches: boolean, wideControls = false): {
  setMatches: (matches: boolean) => void;
} {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const media = {
    addEventListener(_type: string, listener: (event: MediaQueryListEvent) => void) {
      listeners.add(listener);
    },
    dispatchEvent() {
      for (const listener of listeners) {
        listener({ matches } as MediaQueryListEvent);
      }
      return true;
    },
    get matches() {
      return matches;
    },
    media: '(width < 780px)',
    onchange: null,
    removeEventListener(_type: string, listener: (event: MediaQueryListEvent) => void) {
      listeners.delete(listener);
    },
  } as unknown as MediaQueryList;
  vi.stubGlobal('matchMedia', vi.fn((query: string) =>
    wideControls && query === '(width < 780px)'
      ? { ...media, matches: false, addEventListener() {}, removeEventListener() {} }
      : media,
  ));
  return {
    setMatches(nextMatches: boolean) {
      matches = nextMatches;
      media.dispatchEvent(new Event('change'));
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe('App ranking production slice', () => {
  it.each([false, true])('keeps submitted labels in a deferred ranking shell (mergeSeries=%s)', async (mergeSeries) => {
    installCompactLayout(false);
    const query: AppliedQuery = {
      scope: 'personal', uid: 'luca', collectionStatuses: ['completed'],
      subjectType: 'anime', positionKeys: ['staff:anime:2'],
      includeNSFW: false, mergeSeries,
    };
    window.history.replaceState({}, '', '/ranking');
    expect(createQuerySessionOwner(window).write('/ranking', query,
      { kind: 'ranking', rankingsView: { order: 'desc', page: 1, pageSize: 5, search: '', sort: 'count' } },
    )).toBe(true);
    const pinia = createPinia();
    setActivePinia(pinia);
    const execute = vi.fn(() => new Promise<never>(() => {}));
    const wrapper = mount(App, {
      global: { plugins: [pinia], stubs: { teleport: true } },
      props: { services: {
        catalogApi: { async load() { return catalogFixture(); } },
        drivers: { rankings: { execute }, candidates: { execute } },
        surfaceLoaders: { ranking: () => new Promise(() => {}) },
        targetWindow: window,
      } },
    });
    try {
      await vi.waitFor(() => expect(execute).toHaveBeenCalledOnce());
      expect(wrapper.findAll('.ranking-row-skeleton')).toHaveLength(5);
      expect(wrapper.get('.ranking-columns').text()).toContain(mergeSeries ? '系列' : '作品');
      expect(wrapper.find('.person-detail-skeleton').exists()).toBe(true);
      const store = useQueryStore(pinia);
      store.draft.mergeSeries = !mergeSeries;
      store.draft.scope = 'global';
      await nextTick();
      expect(wrapper.get('.ranking-columns').text()).toContain(mergeSeries ? '系列' : '作品');
      expect(wrapper.get('.ranking-columns').text()).toContain('偏好');
      expect(wrapper.find('.ranking-pagination-skeleton').exists()).toBe(false);
    } finally { wrapper.unmount(); }
  });

  it('replays and persists one authoritative detail with its exact view', async () => {
    const query: AppliedQuery = {
      scope: 'personal',
      uid: 'luca',
      collectionStatuses: ['completed'],
      subjectType: 'anime',
      positionKeys: ['staff:anime:2'],
      includeNSFW: false,
      mergeSeries: false,
    };
    const workspace: RecoveryWorkspace = {
      detail: {
        input: { personId: 12 },
        view: {
          order: 'asc',
          page: 3,
          pageSize: 5,
          search: '导演',
          section: 'works',
          sort: 'globalScore',
        },
      },
      kind: 'ranking',
      rankingsView: {
        order: 'asc',
        page: 2,
        pageSize: 5,
        search: '林',
        sort: 'average',
      },
    };
    window.history.replaceState({}, '', '/ranking');
    expect(createQuerySessionOwner(window).write('/ranking', query, workspace)).toBe(true);
    const pinia = createPinia();
    setActivePinia(pinia);
    const rankingExecute = vi.fn(async (request) => ({
      payload: rankingPayload('server-ranking-recovery', 'average'),
      requestId: 'server-ranking-recovery',
      transactionId: request.transactionId,
    }));
    const detailExecute = vi.fn(async (request) => ({
      payload: detailPayload(),
      requestId: 'server-detail-recovery',
      transactionId: request.transactionId,
    }));
    const wrapper = mount(App, {
      attachTo: document.body,
      global: {
        plugins: [pinia],
        stubs: { teleport: true },
      },
      props: {
        services: {
          catalogApi: {
            async load() {
              return catalogFixture();
            },
          },
          drivers: {
            candidates: {
              async execute(): Promise<never> {
                throw new Error('not part of this test');
              },
            },
            personDetail: { execute: detailExecute },
            rankings: { execute: rankingExecute },
          },
          targetWindow: window,
        },
      },
    });
    await flushPromises();
    await waitForRankingSurface(wrapper);

    expect(rankingExecute).toHaveBeenCalledOnce();
    expect(rankingExecute.mock.calls[0]![0].view).toEqual(
      workspace.rankingsView,
    );
    expect(detailExecute).toHaveBeenCalledOnce();
    expect(detailExecute.mock.calls[0]![0]).toMatchObject({
      input: { personId: 12 },
      view: workspace.detail!.view,
    });
    expect(wrapper.get('.ranked-person-row').attributes('aria-current')).toBe(
      'true',
    );
    await vi.waitFor(() => {
      expect(wrapper.find('.person-detail-surface').exists()).toBe(true);
    });
    expect(wrapper.find('.person-detail-surface').exists()).toBe(true);
    const main = wrapper.get('.app-main');
    const queryWorkspace = wrapper.get('.query-workspace');
    expect(main.element.firstElementChild).toBe(queryWorkspace.element);
    expect(wrapper.find('.app-header .query-workspace').exists()).toBe(false);
    expect(wrapper.find('.query-editor-panel').exists()).toBe(false);
    expect(wrapper.find('.query-editor-overlay').exists()).toBe(false);
    expect(window.location.hash).toBe('');

    await queryWorkspace.get('.query-summary').trigger('click');
    await nextTick();
    expect(queryWorkspace.find('.query-editor-panel').exists()).toBe(true);
    expect(queryWorkspace.attributes('aria-labelledby')).toBe('query-title');
    expect(queryWorkspace.get('#query-title').text()).toBe('编辑查询参数');
    expect(wrapper.find('.query-editor-overlay').exists()).toBe(false);
    const wheelEvent = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: 120,
    });
    expect(
      queryWorkspace.get('.query-editor__content').element.dispatchEvent(
        wheelEvent,
      ),
    ).toBe(true);
    expect(wheelEvent.defaultPrevented).toBe(false);
    await queryWorkspace.get('.query-summary').trigger('click');
    await nextTick();
    expect(queryWorkspace.find('.query-editor-panel').exists()).toBe(false);

    expect(createQuerySessionOwner(window).read('/ranking')?.workspace).toEqual(workspace);
    wrapper.unmount();
  });

  it('replays a ranking session without detail without starting an Inspector request', async () => {
    const query: AppliedQuery = {
      scope: 'personal',
      uid: 'luca',
      collectionStatuses: ['completed'],
      subjectType: 'anime',
      positionKeys: ['staff:anime:2'],
      includeNSFW: false,
      mergeSeries: false,
    };
    const workspace: RecoveryWorkspace = {
      kind: 'ranking',
      rankingsView: {
        order: 'desc',
        page: 1,
        pageSize: 10,
        search: '',
        sort: 'count',
      },
    };
    window.history.replaceState({}, '', '/ranking');
    expect(createQuerySessionOwner(window).write('/ranking', query, workspace)).toBe(true);
    const pinia = createPinia();
    setActivePinia(pinia);
    const detailExecute = vi.fn();
    const wrapper = mount(App, {
      attachTo: document.body,
      global: { plugins: [pinia], stubs: { teleport: true } },
      props: {
        services: {
          catalogApi: {
            async load() {
              return catalogFixture();
            },
          },
          drivers: {
            candidates: {
              async execute(): Promise<never> {
                throw new Error('not part of this test');
              },
            },
            personDetail: { execute: detailExecute },
            rankings: {
              async execute(request) {
                return {
                  payload: rankingPayload('server-ranking', 'count'),
                  requestId: 'server-ranking',
                  transactionId: request.transactionId,
                };
              },
            },
          },
          targetWindow: window,
        },
      },
    });
    await flushPromises();
    await waitForRankingSurface(wrapper);

    expect(detailExecute).not.toHaveBeenCalled();
    expect(wrapper.find('.query-editor-overlay').exists()).toBe(false);
    expect(wrapper.get('.ranked-person-row').attributes('aria-current')).toBeUndefined();
    expect(window.location.hash).toBe('');
    wrapper.unmount();
  });

  it('shows the companion detail skeleton and auto-selects first while the surface loads', async () => {
    installCompactLayout(false);
    window.history.replaceState({}, '', '/ranking?user=luca');
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useQueryStore();
    store.draft.uid = 'luca';
    store.draft.positionKeys = ['staff:anime:2'];
    const personDetailModule = deferred<never>();
    const rankingRequest = deferred<OperationResponse<RankingPayload>>();
    const detailRequest = deferred<OperationResponse<PersonDetailPayload>>();
    let rankingTransactionId = '';
    let detailTransactionId = '';
    const detailExecute = vi.fn((request) => {
      detailTransactionId = request.transactionId;
      return detailRequest.promise;
    });
    const wrapper = mount(App, {
      attachTo: document.body,
      global: { plugins: [pinia], stubs: { teleport: true } },
      props: {
        services: {
          catalogApi: {
            async load() {
              return catalogFixture();
            },
          },
          drivers: {
            candidates: {
              async execute(): Promise<never> {
                throw new Error('not part of this test');
              },
            },
            personDetail: { execute: detailExecute },
            rankings: {
              execute(request) {
                rankingTransactionId = request.transactionId;
                return rankingRequest.promise;
              },
            },
          },
          surfaceLoaders: {
            personDetail: () => personDetailModule.promise,
          },
          targetWindow: window,
        },
      },
    });
    await flushPromises();
    await wrapper.get('#query-editor').trigger('submit');
    await nextTick();
    await waitForRankingSurface(wrapper);

    expect(wrapper.find('.ranking-surface--loading').exists()).toBe(true);
    expect(wrapper.get('#person-detail-panel').attributes('aria-hidden')).toBe(
      'true',
    );
    expect(
      wrapper
        .get('.ranking-workspace')
        .findAll('[aria-live="polite"]')
        .filter(
          (node) =>
            node.element.closest('[aria-hidden="true"]') === null &&
            node.text().startsWith('正在加载'),
        )
        .map((node) => node.text()),
    ).toEqual(['正在加载人物排行']);
    expect(wrapper.text()).not.toContain('选择人物查看详情');
    expect(detailExecute).not.toHaveBeenCalled();

    rankingRequest.resolve({
      payload: rankingPayload('server-ranking', 'count'),
      requestId: 'server-ranking',
      transactionId: rankingTransactionId,
    });
    await flushPromises();

    expect(detailExecute).toHaveBeenCalledOnce();
    expect(detailExecute.mock.calls[0]![0].input).toEqual({ personId: 12 });
    expect(wrapper.get('.ranked-person-row').attributes('aria-current')).toBe(
      'true',
    );
    expect(
      wrapper
        .get('.ranking-workspace')
        .findAll('[aria-live="polite"]')
        .filter(
          (node) =>
            node.element.closest('[aria-hidden="true"]') === null &&
            node.text().startsWith('正在加载'),
        )
        .map((node) => node.text()),
    ).toEqual(['正在加载人物详情']);
    expect(wrapper.get('.ranking-workspace').classes()).not.toContain(
      'ranking-workspace--single',
    );

    detailRequest.resolve({
      payload: detailPayload(),
      requestId: 'server-detail',
      transactionId: detailTransactionId,
    });
    await flushPromises();

    personDetailModule.reject(new Error('module unavailable'));
    await flushPromises();
    expect(wrapper.text()).toContain('人物详情加载失败');
    expect(wrapper.find('.person-detail-placeholder').exists()).toBe(
      false,
    );
    wrapper.unmount();
    vi.unstubAllGlobals();
  });

  it('uses the full ranking width when an accepted query has no people', async () => {
    installCompactLayout(false);
    window.history.replaceState({}, '', '/ranking?user=luca');
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useQueryStore();
    store.draft.uid = 'luca';
    store.draft.positionKeys = ['staff:anime:2'];
    const detailExecute = vi.fn();
    const wrapper = mount(App, {
      attachTo: document.body,
      global: { plugins: [pinia], stubs: { teleport: true } },
      props: {
        services: {
          catalogApi: {
            async load() {
              return catalogFixture();
            },
          },
          drivers: {
            candidates: {
              async execute(): Promise<never> {
                throw new Error('not part of this test');
              },
            },
            personDetail: { execute: detailExecute },
            rankings: {
              async execute(request) {
                return {
                  payload: emptyRankingPayload(),
                  requestId: 'server-ranking-empty',
                  transactionId: request.transactionId,
                };
              },
            },
          },
          targetWindow: window,
        },
      },
    });
    await flushPromises();
    await wrapper.get('#query-editor').trigger('submit');
    await flushPromises();
    await waitForRankingSurface(wrapper);

    expect(wrapper.get('.ranking-workspace').classes()).toContain(
      'ranking-workspace--single',
    );
    expect(wrapper.find('#person-detail-panel').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('选择人物查看详情');
    expect(wrapper.text()).toContain('没有符合查询条件的人物');
    expect(wrapper.find('.ranking-controls').exists()).toBe(false);
    expect(wrapper.find('input[name="ranking-search"]').exists()).toBe(false);
    expect(wrapper.find('.ranking-surface__footer').exists()).toBe(false);
    expect(wrapper.find('.ranking-pagination').exists()).toBe(false);
    expect(wrapper.text()).not.toMatch(/共统计到|0 个人物|0 个条目/);
    expect(detailExecute).not.toHaveBeenCalled();
    wrapper.unmount();
    vi.unstubAllGlobals();
  });

  it('omits pending and failed unaccepted detail attempts from a saved ranking', async () => {
    window.history.replaceState({}, '', '/ranking?user=luca');
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useQueryStore();
    store.draft.uid = 'luca';
    store.draft.positionKeys = ['staff:anime:2'];
    let rejectDetail!: (reason: unknown) => void;
    const detailExecute = vi.fn(
      () =>
        new Promise<never>((_resolve, reject) => {
          rejectDetail = reject;
        }),
    );
    const wrapper = mount(App, {
      attachTo: document.body,
      global: { plugins: [pinia], stubs: { teleport: true } },
      props: {
        services: {
          catalogApi: {
            async load() {
              return catalogFixture();
            },
          },
          drivers: {
            candidates: {
              async execute(): Promise<never> {
                throw new Error('not part of this test');
              },
            },
            personDetail: { execute: detailExecute },
            rankings: {
              async execute(request) {
                return {
                  payload: rankingPayload('server-ranking', 'count'),
                  requestId: 'server-ranking',
                  transactionId: request.transactionId,
                };
              },
            },
          },
          targetWindow: window,
        },
      },
    });
    await flushPromises();
    await wrapper.get('#query-editor').trigger('submit');
    await flushPromises();
    await waitForRankingSurface(wrapper);
    await wrapper.get('.ranked-person-row').trigger('click');
    await nextTick();

    const session = createQuerySessionOwner(window);
    expect(session.read('/ranking')?.workspace).not.toHaveProperty('detail');
    rejectDetail(new Error('offline'));
    await flushPromises();
    expect(session.read('/ranking')?.workspace).not.toHaveProperty('detail');
    wrapper.unmount();
  });

  it('rejects an invalid detail section/sort union before rankings or Inspector requests', async () => {
    const invalidPayload = {
      query: {
        scope: 'personal',
        uid: 'luca',
        collectionStatuses: ['completed'],
        subjectType: 'anime',
        positionKeys: ['staff:anime:2'],
        includeNSFW: false,
        mergeSeries: false,
      },
      workspace: {
        detail: {
          input: { personId: 12 },
          view: {
            order: 'desc',
            page: 1,
            pageSize: 10,
            search: '',
            section: 'works',
            sort: 'role',
          },
        },
        kind: 'ranking',
        rankingsView: {
          order: 'desc',
          page: 1,
          pageSize: 10,
          search: '',
          sort: 'count',
        },
      },
    };
    window.sessionStorage.setItem(QUERY_SESSION_STORAGE_KEY, JSON.stringify({version: 2, ranking: invalidPayload}));
    window.history.replaceState({}, '', '/ranking');
    const pinia = createPinia();
    setActivePinia(pinia);
    const rankingExecute = vi.fn();
    const detailExecute = vi.fn();
    const wrapper = mount(App, {
      attachTo: document.body,
      global: { plugins: [pinia], stubs: { teleport: true } },
      props: {
        services: {
          catalogApi: {
            async load() {
              return catalogFixture();
            },
          },
          drivers: {
            candidates: {
              async execute(): Promise<never> {
                throw new Error('not part of this test');
              },
            },
            personDetail: { execute: detailExecute },
            rankings: { execute: rankingExecute },
          },
          targetWindow: window,
        },
      },
    });
    await flushPromises();

    expect(rankingExecute).not.toHaveBeenCalled();
    expect(detailExecute).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('');
    expect(wrapper.find('.app-local-error').exists()).toBe(false);
    expect(window.sessionStorage.getItem(QUERY_SESSION_STORAGE_KEY)).toBeNull();
    wrapper.unmount();
  });

  it('renders the real driver result and routes toolbar changes through one coordinator', async () => {
    window.history.replaceState({}, '', '/ranking?user=luca');
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useQueryStore();
    store.draft.uid = 'luca';
    store.draft.positionKeys = ['staff:anime:2'];

    const rankingExecute = vi.fn(async (request) => {
      const metric = request.view.sort === 'average' ? 'average' : 'count';
      const requestId = `server-${request.transactionId}`;
      return {
        payload: rankingPayload(requestId, metric),
        requestId,
        staleCollection: false,
        transactionId: request.transactionId,
        warningCodes: [],
      };
    });
    const drivers: QueryDrivers<RankingPayload, never> = {
      rankings: { execute: rankingExecute },
      candidates: {
        async execute(): Promise<never> {
          throw new Error('not part of this test');
        },
      },
    };
    const catalogApi: CatalogApi = {
      async load() {
        return catalogFixture();
      },
    };
    const wrapper = mount(App, {
      attachTo: document.body,
      global: {
        plugins: [pinia],
        stubs: { teleport: true },
      },
      props: {
        services: {
          catalogApi,
          drivers,
          targetWindow: window,
        },
      },
    });
    await flushPromises();

    await wrapper.get('#query-editor').trigger('submit');
    await flushPromises();
    await waitForRankingSurface(wrapper);

    expect(wrapper.find('.ranking-surface').exists()).toBe(true);
    expect(wrapper.findAll('.ranked-person-row')).toHaveLength(1);
    expect(wrapper.get('.ranked-person-row__rank').text()).toBe('2');
    expect(wrapper.text()).toContain('林明');
    expect(wrapper.text()).toContain('共统计到');
    expect(wrapper.text()).not.toContain('结果区域将由当前模式');
    expect(store.revision).toBe(1);
    expect(rankingExecute).toHaveBeenCalledTimes(1);
    expect(rankingExecute.mock.calls[0]![0].transactionId).toMatch(
      /^rankings-/,
    );

    wrapper
      .findAllComponents(NSelect)
      .find((component) =>
        component.classes().includes('ranking-sort-control'),
      )!
      .vm.$emit('update:value', 'average');
    await flushPromises();

    expect(rankingExecute).toHaveBeenCalledTimes(2);
    expect(rankingExecute.mock.calls[1]![0].view).toMatchObject({
      page: 1,
      sort: 'average',
    });
    expect(store.revision).toBe(1);
    expect(wrapper.get('.ranking-surface').attributes('aria-busy')).toBeUndefined();
    wrapper.unmount();
  });

  it.each([false, true])('closes only the drawer while preserving selection and detail (wide controls: %s)', async (wideControls) => {
    const media = installCompactLayout(true, wideControls);
    window.history.replaceState({}, '', '/ranking?user=luca');
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useQueryStore();
    store.draft.uid = 'luca';
    store.draft.positionKeys = ['staff:anime:2'];
    const personExecute = vi.fn(async (request) => ({
      payload: detailPayload(),
      requestId: 'server-detail',
      transactionId: request.transactionId,
    }));
    const drivers: QueryDrivers<
      RankingPayload,
      never,
      PersonDetailPayload
    > = {
      candidates: {
        async execute(): Promise<never> {
          throw new Error('not part of this test');
        },
      },
      personDetail: { execute: personExecute },
      rankings: {
        async execute(request) {
          return {
            payload: rankingPayload('server-ranking', 'count'),
            requestId: 'server-ranking',
            transactionId: request.transactionId,
          };
        },
      },
    };
    const wrapper = mount(App, {
      attachTo: document.body,
      global: {
        plugins: [pinia],
        stubs: { transition: false },
      },
      props: {
        services: {
          catalogApi: {
            async load() {
              return catalogFixture();
            },
          },
          drivers,
          targetWindow: window,
        },
      },
    });
    await flushPromises();
    await wrapper.get('#query-editor').trigger('submit');
    await flushPromises();
    await waitForRankingSurface(wrapper);
    const row = wrapper.get<HTMLButtonElement>('.ranked-person-row');

    expect(personExecute).toHaveBeenCalledOnce();
    expect(wrapper.get('.ranking-workspace').classes()).toContain('ranking-workspace--single');
    expect(row.attributes('aria-current')).toBe('true');
    expect(row.attributes('aria-controls')).toBeUndefined();
    expect(row.attributes('aria-expanded')).toBeUndefined();
    expect(
      document.body.querySelector('.person-detail-drawer'),
    ).toBeNull();
    expect(
      wrapper.get('[data-app-root]').attributes('inert'),
    ).toBeUndefined();
    expect(
      wrapper.get('[data-app-root]').attributes('aria-hidden'),
    ).toBeUndefined();
    row.element.focus();
    await row.trigger('click');
    await flushPromises();

    const manualClose = document.body.querySelector<HTMLButtonElement>(
      '.person-detail-drawer__bar button',
    )!;
    expect(manualClose).not.toBeNull();
    expect(document.activeElement).toBe(
      document.body.querySelector('.person-detail-drawer'),
    );
    manualClose.click();
    await flushPromises();

    await vi.waitFor(() => {
      expect(document.body.querySelector('.person-detail-drawer')).toBeNull();
      expect(document.activeElement).toBe(row.element);
    });
    expect(document.activeElement).toBe(row.element);
    expect(row.attributes('aria-current')).toBe('true');
    expect(row.attributes('aria-controls')).toBeUndefined();
    expect(row.attributes('aria-expanded')).toBeUndefined();
    expect(row.classes()).toContain('is-selected');
    expect(
      document.body.querySelector('.person-detail-drawer'),
    ).toBeNull();
    expect(
      wrapper.get('[data-app-root]').attributes('inert'),
    ).toBeUndefined();
    expect(
      wrapper.get('[data-app-root]').attributes('aria-hidden'),
    ).toBeUndefined();

    await row.trigger('click');
    await flushPromises();

    expect(personExecute).toHaveBeenCalledOnce();
    expect(row.attributes('aria-current')).toBe('true');
    expect(row.attributes('aria-controls')).toBe('person-detail-panel');
    expect(row.attributes('aria-expanded')).toBe('true');
    expect(
      document.body.querySelector('.person-detail-drawer'),
    ).not.toBeNull();
    expect((wrapper.get('.app-page-scroll').element as HTMLElement).inert).toBe(true);

    media.setMatches(false);
    await flushPromises();

    expect(
      document.body.querySelector('.person-detail-drawer'),
    ).toBeNull();
    expect(wrapper.find('.person-detail-surface').exists()).toBe(true);
    expect(
      wrapper.get('[data-app-root]').attributes('inert'),
    ).toBeUndefined();
    expect(wrapper.get('.ranked-person-row').attributes('aria-expanded')).toBe(
      'true',
    );
    expect(wrapper.text()).toContain('林明');

    media.setMatches(true);
    await flushPromises();

    expect(
      document.body.querySelector('.person-detail-drawer'),
    ).toBeNull();
    expect(wrapper.get('.ranked-person-row').attributes('aria-current')).toBe(
      'true',
    );
    expect(
      wrapper.get('.ranked-person-row').attributes('aria-expanded'),
    ).toBeUndefined();
    wrapper.unmount();
    vi.unstubAllGlobals();
  });

  it('preserves accepted Inspector state across modes and reselects first after a successful changed query', async () => {
    installCompactLayout(true);
    window.history.replaceState({}, '', '/ranking?user=luca');
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useQueryStore();
    store.draft.uid = 'luca';
    store.draft.positionKeys = ['staff:anime:2'];
    const personExecute = vi.fn(async (request) => ({
      payload: detailPayload(),
      requestId: 'server-detail',
      transactionId: request.transactionId,
    }));
    const rankingExecute = vi.fn(async (request) => ({
      payload: rankingPayload('server-ranking', 'count'),
      requestId: 'server-ranking',
      transactionId: request.transactionId,
    }));
    const drivers: QueryDrivers<
      RankingPayload,
      never,
      PersonDetailPayload
    > = {
      candidates: {
        async execute(): Promise<never> {
          throw new Error('not part of this test');
        },
      },
      personDetail: { execute: personExecute },
      rankings: { execute: rankingExecute },
    };
    const wrapper = mount(App, {
      attachTo: document.body,
      global: {
        plugins: [pinia],
        stubs: { transition: false },
      },
      props: {
        services: {
          catalogApi: {
            async load() {
              return catalogFixture();
            },
          },
          drivers,
          targetWindow: window,
        },
      },
    });
    await flushPromises();
    await wrapper.get('#query-editor').trigger('submit');
    await flushPromises();
    await waitForRankingSurface(wrapper);

    expect(personExecute).toHaveBeenCalledTimes(1);
    expect(
      document.body.querySelector('.person-detail-drawer'),
    ).toBeNull();

    await wrapper.get('#mode-tab-co-star').trigger('click');
    await flushPromises();
    expect(
      document.body.querySelector('.person-detail-drawer'),
    ).toBeNull();

    await wrapper.get('#mode-tab-ranking').trigger('click');
    await flushPromises();
    await waitForRankingSurface(wrapper);
    let row = wrapper.get('.ranked-person-row');
    expect(row.attributes('aria-current')).toBe('true');
    expect(row.attributes('aria-expanded')).toBeUndefined();
    expect(wrapper.text()).toContain('林明');

    await row.trigger('click');
    await flushPromises();
    expect(personExecute).toHaveBeenCalledTimes(1);

    await vi.waitFor(() => expect(document.body.querySelector('.person-detail-drawer')).not.toBeNull());
    expect(wrapper.get('.app-header').element.closest('[inert], [aria-hidden="true"]')).toBeNull();
    expect((wrapper.get('.app-page-scroll').element as HTMLElement).inert).toBe(true);
    await wrapper.get('#mode-tab-co-star').trigger('click');
    await vi.waitFor(() => {
      expect(document.body.querySelector('.person-detail-drawer')).toBeNull();
      expect(document.activeElement).toBe(wrapper.get('#mode-tab-co-star').element);
      expect((wrapper.get('.app-page-scroll').element as HTMLElement).inert).toBe(false);
    });
    await wrapper.get('#mode-tab-ranking').trigger('click');
    await flushPromises();
    await wrapper.get('.ranked-person-row').trigger('click');
    await vi.waitFor(() => expect(document.body.querySelector('.person-detail-drawer__bar button')).not.toBeNull());

    document.body
      .querySelector<HTMLButtonElement>(
        '.person-detail-drawer__bar button',
      )!
      .click();
    await flushPromises();
    store.draft.uid = 'mika';
    await wrapper.get('.query-summary').trigger('click');
    await flushPromises();
    document.body
      .querySelector<HTMLFormElement>('#query-editor')!
      .dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
    await flushPromises();
    expect(rankingExecute).toHaveBeenCalledTimes(2);
    expect(personExecute).toHaveBeenCalledTimes(2);
    expect(
      document.body.querySelector('.person-detail-drawer'),
    ).toBeNull();
    row = wrapper.get('.ranked-person-row');
    expect(row.attributes('aria-current')).toBe('true');
    expect(row.attributes('aria-expanded')).toBeUndefined();
    wrapper.unmount();
    vi.unstubAllGlobals();
  });
  it.each([true, false])('retries a failed chunk only after preserving recovery intent (storage=%s)', async (storageAvailable) => {
    installCompactLayout(false);
    window.history.replaceState({}, '', '/ranking?user=luca');
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useQueryStore(pinia);
    store.draft.uid = 'luca';
    store.draft.positionKeys = ['staff:anime:2'];
    const reload = vi.fn(() => createQuerySessionOwner(window).read('/ranking'));
    const targetWindow = new Proxy(window, {
      get(target, property) {
        if (property === 'location') return {
          href: window.location.href, pathname: window.location.pathname, reload,
        };
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    vi.doMock('../../src/features/person-detail/components/PersonDetailSurface.vue', () => {
      throw new Error('chunk unavailable');
    });
    const wrapper = mount(App, {
      global: { plugins: [pinia], stubs: { teleport: true } },
      props: { services: {
        catalogApi: { async load() { return catalogFixture(); } },
        drivers: {
          rankings: { async execute(request) { return {
            payload: rankingPayload('server-ranking', 'count'),
            requestId: 'server-ranking', transactionId: request.transactionId,
          }; } },
          candidates: { async execute(): Promise<never> { throw new Error('not used'); } },
          personDetail: { async execute(request) { return {
            payload: detailPayload(), requestId: 'server-detail', transactionId: request.transactionId,
          }; } },
        },
        targetWindow,
      } },
    });
    try {
      await flushPromises();
      await wrapper.get('#query-editor').trigger('submit');
      await vi.waitFor(() => expect(wrapper.find('#mode-panel-ranking [data-deferred-surface] button').exists()).toBe(true));
      const retry = wrapper.get('#mode-panel-ranking [data-deferred-surface] button');
      if (!storageAvailable) vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('quota', 'QuotaExceededError');
      });
      await retry.trigger('click');
      await flushPromises();
      expect(reload).toHaveBeenCalledTimes(storageAvailable ? 1 : 0);
      if (storageAvailable) expect(reload.mock.results[0]?.value?.workspace).toMatchObject({
        kind: 'ranking', detail: { input: { personId: 12 } },
      });
      expect(store.applied).toMatchObject({ scope: 'personal', uid: 'luca' });
      expect(window.location.hash).toBe('');
    } finally {
      wrapper.unmount();
      vi.doUnmock('../../src/features/person-detail/components/PersonDetailSurface.vue');
      vi.unstubAllGlobals();
      delete document.documentElement.dataset.deferredSurfaceRecovery;
    }
  });

});
