import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { NDivider, NDynamicInput, NPopover, NSelect } from 'naive-ui';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from '../../../src/app/App.vue';
import type {
  CatalogGroup,
  CatalogPosition,
  PositionKey,
} from '../../../src/api/adapters/catalog';
import type { CatalogApi } from '../../../src/api/catalog';
import type {
  CandidatePayload as ApiCandidatePayload,
} from '../../../src/api/adapters/candidates';
import type { RankingPayload } from '../../../src/api/adapters/rankings';
import AppHeader from '../../../src/features/query/components/AppHeader.vue';
import PositionSelector from '../../../src/features/query/components/PositionSelector.vue';
import {
  createQueryCoordinator,
  type OperationResponse,
  type QueryDrivers,
} from '../../../src/features/query/coordinator';
import type { AppliedQuery } from '../../../src/features/query/model';
import { createQuerySessionOwner } from '../../../src/features/query/session';
import type { RecoveryWorkspace } from '../../../src/features/query/recovery';
import { useQueryStore } from '../../../src/features/query/store';
import { catalogFixture } from './fixtures';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);

interface CandidatePayload {
  id: string;
}

const selectorPositions: readonly CatalogPosition[] = [
  {
    capabilities: ['rankings', 'candidates'],
    categories: ['director'],
    displayOrder: 10,
    key: 'staff:anime:2',
    kind: 'staff',
    label: '导演',
    names: { cn: '导演', en: 'Director', jp: '監督' },
    selectable: true,
    subjectType: 'anime',
  },
  {
    capabilities: ['rankings', 'candidates'],
    categories: ['cast'],
    displayOrder: 20,
    exclusiveGroup: 'cast:anime',
    key: 'cast:anime:main',
    kind: 'cast',
    label: '声优（仅主役）',
    names: { cn: '声优（仅主役）', en: null, jp: null },
    roleScope: 'main',
    selectable: true,
    subjectType: 'anime',
  },
  {
    capabilities: ['rankings', 'candidates'],
    categories: ['cast'],
    displayOrder: 30,
    exclusiveGroup: 'cast:anime',
    key: 'cast:anime:all',
    kind: 'cast',
    label: '声优',
    names: { cn: '声优', en: null, jp: null },
    roleScope: 'all',
    selectable: true,
    subjectType: 'anime',
  },
];

const selectorGroups: readonly CatalogGroup[] = [
  {
    displayOrder: 10,
    key: 'shortcut:anime:featured',
    kind: 'shortcut',
    label: '常用职位',
    positionKeys: ['staff:anime:2', 'cast:anime:main'],
    subjectType: 'anime',
  },
  {
    displayOrder: 20,
    key: 'bangumi:anime:director',
    kind: 'bangumi',
    label: '导演类',
    positionKeys: ['staff:anime:2'],
    subjectType: 'anime',
  },
  {
    displayOrder: 30,
    key: 'bangumi:anime:cast',
    kind: 'bangumi',
    label: '配音类',
    positionKeys: ['cast:anime:main', 'cast:anime:all'],
    subjectType: 'anime',
  },
];

const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');

function installMatchMedia(
  matches: (query: string) => boolean,
): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(
      (media: string) =>
        ({
          addEventListener: vi.fn(),
          dispatchEvent: vi.fn(() => true),
          matches: matches(media),
          media,
          onchange: null,
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    ),
  });
}

function rankingPayload(requestId: string): RankingPayload {
  return Object.freeze({
    dataVersion: `dv1-${'c'.repeat(64)}`,
    items: Object.freeze([]),
    metricScale: Object.freeze({
      kind: 'linear',
      max: null,
      metric: 'count',
    }),
    pagination: Object.freeze({
      page: 1,
      pageSize: 10,
      total: 0,
    }),
    requestId,
    scope: 'personal',
    summary: Object.freeze({
      personCount: 0,
      workCount: 0,
      workUnit: 'subject',
    }),
  });
}

function appCandidatePayload(
  positionKey: string | null,
  requestId: string,
): ApiCandidatePayload {
  return Object.freeze({
    collection: Object.freeze({
      fetchedAt: '2026-07-25T00:00:00Z',
      stale: false,
      warningCodes: Object.freeze([]),
    }),
    dataVersion: `dv1-${'d'.repeat(64)}`,
    items: Object.freeze([]),
    pagination: Object.freeze({
      page: 1,
      pageSize: 10,
      total: 0,
    }),
    positionCounts: Object.freeze([
      Object.freeze({ count: 0, positionKey: 'staff:anime:2' }),
    ]),
    positionKey,
    requestId,
    scope: 'personal',
    workUnit: 'subject',
  });
}

function validStore() {
  const store = useQueryStore();
  store.draft.uid = 'luca';
  store.draft.positionKeys = ['staff:anime:2'];
  return store;
}

function catalogApi(): CatalogApi {
  return {
    async load() {
      return catalogFixture();
    },
  };
}

function drivers(
  execute: QueryDrivers<
    RankingPayload,
    CandidatePayload
  >['rankings']['execute'],
): QueryDrivers<RankingPayload, CandidatePayload> {
  return {
    rankings: { execute },
    candidates: {
      async execute(request) {
        return {
          payload: { id: 'candidate' },
          requestId: `server-${request.transactionId}`,
          transactionId: request.transactionId,
        };
      },
    },
  };
}

beforeEach(() => {
  window.history.replaceState({}, '', '/ranking');
  window.sessionStorage.clear();
  setActivePinia(createPinia());
});

afterEach(() => {
  if (originalMatchMedia) {
    Object.defineProperty(window, 'matchMedia', originalMatchMedia);
  } else {
    Reflect.deleteProperty(window, 'matchMedia');
  }
});

describe('query shell components', () => {
  it('renders the ranking first-query state on the canvas without a duplicate action', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    validStore();
    const wrapper = mount(App, {
      attachTo: document.body,
      global: { plugins: [pinia], stubs: { teleport: true } },
      props: {
        services: {
          catalogApi: catalogApi(),
          drivers: drivers(async (request) => ({
            payload: rankingPayload(`server-${request.transactionId}`),
            requestId: `server-${request.transactionId}`,
            transactionId: request.transactionId,
          })),
          targetWindow: window,
        },
      },
    });
    await flushPromises();

    const state = wrapper.get('#ranking-query-empty-title').element
      .closest<HTMLElement>('section');
    expect(state).not.toBeNull();
    expect(state!.classList).toContain('query-result-state');
    expect(state!.classList).toContain('ranking-page-empty-state');
    expect(state!.classList).not.toContain('surface-panel');
    expect(state!.querySelector('button')).toBeNull();
    expect(state!.textContent).not.toContain('设置查询条件');
    expect(wrapper.get('#query-position-title').text()).toBe('职位');
    for (const name of ['query-editor-panel-divider', 'query-stage-divider', 'query-editor-footer-divider']) {
      expect(wrapper.findAllComponents(NDivider).some((divider) => divider.classes().includes(name))).toBe(true);
    }
    wrapper.unmount();
  });

  it('reveals the complete query workspace from the co-star first-query action', async () => {
    window.history.replaceState({}, '', '/co-star');
    installMatchMedia(
      (query) => query === '(width >= 780px) and (pointer: fine)',
    );
    const pinia = createPinia();
    setActivePinia(pinia);
    validStore();
    const scrollTo = vi.fn();
    const wrapper = mount(App, {
      attachTo: document.body,
      global: { plugins: [pinia], stubs: { teleport: true } },
      props: {
        services: {
          catalogApi: catalogApi(),
          drivers: drivers(async (request) => ({
            payload: rankingPayload(`server-${request.transactionId}`),
            requestId: `server-${request.transactionId}`,
            transactionId: request.transactionId,
          })),
          targetWindow: window,
        },
      },
    });
    await flushPromises();
    vi.useFakeTimers();

    wrapper.get('.app-main').element.scrollIntoView = scrollTo;
    await wrapper.get('#co-star-query-empty-title + button').trigger('click');
    await nextTick();
    const workspace = wrapper.get('.query-workspace');
    expect(scrollTo).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(workspace.classes()).toContain('is-attention');
    expect((document.activeElement as HTMLInputElement).name).toBe('userId');

    await vi.advanceTimersByTimeAsync(900);
    expect(workspace.classes()).not.toContain('is-attention');
    await workspace.get('.query-summary').trigger('click');
    await nextTick();
    await workspace.get('.query-summary').trigger('click');
    await nextTick();
    expect(workspace.classes()).not.toContain('is-attention');
    wrapper.unmount();
  });

  it('keeps unchanged submit silent and avoids duplicate footer pending copy', () => {
    const workspaceSource = fs.readFileSync(
      path.join(
        repositoryRoot,
        'frontend/src/features/query/components/QueryWorkspace.vue',
      ),
      'utf8',
    );
    const editorSource = fs.readFileSync(
      path.join(
        repositoryRoot,
        'frontend/src/features/query/components/QueryEditor.vue',
      ),
      'utf8',
    );

    expect(workspaceSource).toMatch(
      /queryStore\.applied !== null[\s\S]*?!dirty\.value[\s\S]*?return;/,
    );
    expect(workspaceSource).not.toContain('refreshCollection');
    expect(editorSource).not.toContain('query-editor__status');
    expect(editorSource).not.toContain("{{ disabled ? '查询中' : '' }}");
  });

  it('keeps query-summary corner motion synchronized with panel enter and leave', () => {
    const baseCss = fs.readFileSync(
      path.join(repositoryRoot, 'frontend/src/shared/styles/base.css'),
      'utf8',
    );
    const catalogBrowser = fs.readFileSync(
      path.join(
        repositoryRoot,
        'frontend/src/features/query/components/PositionCatalogBrowser.vue',
      ),
      'utf8',
    );

    expect(baseCss).toMatch(
      /\.query-summary\s*\{[^}]*transition:\s*background-color 150ms ease-out,\s*border-radius 120ms ease-in;/s,
    );
    expect(baseCss).toMatch(
      /\.query-summary\.is-editing\s*\{[^}]*border-radius:[^;}]*0 0;[^}]*transition:\s*background-color 150ms ease-out,\s*border-radius 160ms ease-out;/s,
    );
    expect(baseCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.query-summary,[\s\S]*?transition-duration:\s*0s;/,
    );
    expect(baseCss).toMatch(
      /\.query-editor-panel\s*\{[^}]*grid-template-rows:\s*1fr;[^}]*overflow:\s*hidden;/s,
    );
    expect(baseCss).toMatch(
      /\.query-panel-enter-active\s*\{[^}]*grid-template-rows 160ms ease-out,[^}]*opacity 160ms ease-out;/s,
    );
    expect(baseCss).toMatch(
      /\.query-panel-leave-active\s*\{[^}]*grid-template-rows 120ms ease-in,[^}]*opacity 120ms ease-in;/s,
    );
    expect(baseCss).toMatch(
      /\.query-panel-enter-from,\s*\.query-panel-leave-to\s*\{[^}]*grid-template-rows:\s*0fr;[^}]*opacity:\s*0;/s,
    );
    expect(baseCss).toMatch(
      /\.query-summary__copy\s*\{[^}]*font-weight:\s*600;/s,
    );
    expect(baseCss).toMatch(
      /\.query-summary__value:not\(:last-child\)::after\s*\{[^}]*content:\s*" ·";[^}]*font-weight:\s*400;/s,
    );
    expect(catalogBrowser).toMatch(
      /\.position-catalog-browser__positions\s*\{[^}]*gap:\s*0;[^}]*padding:\s*0;/s,
    );
  });

  it('keeps the legacy link available before the theme control while a query is pending', async () => {
    const store = validStore();
    let resolveQuery!: (response: OperationResponse<RankingPayload>) => void;
    let queryTransactionId = '';
    const execute = vi
      .fn()
      .mockImplementationOnce(async (request) => ({
        payload: rankingPayload(`server-${request.transactionId}`),
        requestId: `server-${request.transactionId}`,
        transactionId: request.transactionId,
      }))
      .mockImplementationOnce(
        (request) =>
          new Promise<OperationResponse<RankingPayload>>((resolve) => {
            queryTransactionId = request.transactionId;
            resolveQuery = resolve;
          }),
      );
    const coordinator = createQueryCoordinator(store, drivers(execute));
    const catalog = catalogFixture();
    await coordinator.execute({ catalog, mode: 'ranking' });
    store.draft.includeNSFW = true;
    const query = coordinator.execute({
      catalog,
      mode: 'ranking',
    });
    const toggleTheme = vi.fn();

    const wrapper = mount(AppHeader, {
      attachTo: document.body,
      props: {
        mode: 'ranking',
        navigate: vi.fn(),
        targetWindow: window,
        theme: 'light',
        toggleTheme,
      },
    });

    expect(coordinator.rankings.phase).toBe('pending');
    expect(
      wrapper.get('a[href="https://search.bgmss.fun/old/"]').attributes(
        'disabled',
      ),
    ).not.toBe('true');
    expect(wrapper.get('.app-brand').attributes('aria-label')).toBe(
      'Bangumi Staff Statistics 人物工作台首页',
    );
    expect(wrapper.get('.app-brand__mark').attributes()).toMatchObject({
      height: '28',
      width: '28',
    });
    expect(wrapper.get('.mode-tabs .n-tabs').classes()).toContain(
      'n-tabs--segment-type',
    );
    expect(
      wrapper.get('#mode-tab-ranking').attributes('aria-controls'),
    ).toBe('mode-panel-ranking');
    expect(
      wrapper.get('#mode-tab-co-star').attributes('aria-controls'),
    ).toBe('mode-panel-co-star');
    const legacy = wrapper.get('a[href="https://search.bgmss.fun/old/"]');
    expect(legacy.text()).toBe('回到旧版');
    expect(legacy.attributes('aria-label')).toBe('回到旧版');
    expect(legacy.find('svg[aria-hidden="true"]').exists()).toBe(true);
    expect(wrapper.get('.header-actions').find('a').element).toBe(legacy.element);
    expect(wrapper.get('.header-actions').find('.theme-action').exists()).toBe(true);
    expect(legacy.attributes('target')).toBeUndefined();
    expect(legacy.element.compareDocumentPosition(wrapper.get('button[aria-label="切换到深色模式"]').element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(wrapper.text()).not.toContain('分享');
    expect(document.querySelector('[aria-label="主题偏好"]')).toBeNull();

    await wrapper
      .get('button[aria-label="切换到深色模式"]')
      .trigger('click');
    expect(toggleTheme).toHaveBeenCalledTimes(1);
    await wrapper.setProps({ theme: 'dark' });
    await nextTick();

    expect(
      wrapper.get('button[aria-label="切换到浅色模式"]').attributes(
        'aria-pressed',
      ),
    ).toBe('true');
    expect(document.querySelector('[aria-label="主题偏好"]')).toBeNull();
    expect(document.body.textContent).not.toContain('改为跟随系统');
    expect(document.body.textContent).not.toContain('已固定为深色');

    coordinator.cancelPending();
    resolveQuery({
      payload: rankingPayload('server-late'),
      requestId: 'server-late',
      transactionId: queryTransactionId,
    });
    await query;
    wrapper.unmount();
  });

  it('keeps stale feedback visible and live after the editor collapses', async () => {
    window.history.replaceState({}, '', '/ranking?user=luca');
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = validStore();
    const resultDrivers = drivers(async (request) => ({
      payload: rankingPayload(`server-${request.transactionId}`),
      requestId: `server-${request.transactionId}`,
      transactionId: request.transactionId,
      warningCodes: ['COLLECTION_STALE'],
    }));
    const wrapper = mount(App, {
      attachTo: document.body,
      global: { plugins: [pinia], stubs: { teleport: true } },
      props: {
        services: {
          catalogApi: catalogApi(),
          drivers: resultDrivers,
          targetWindow: window,
        },
      },
    });
    await flushPromises();

    await wrapper.get('#query-editor').trigger('submit');
    await flushPromises();
    await nextTick();

    expect(wrapper.find('.query-editor-overlay').exists()).toBe(false);
    const feedback = wrapper.get('.app-query-feedback');
    expect(feedback.text()).toContain('最近一次可用数据');
    expect(feedback.attributes()).toMatchObject({
      'aria-live': 'polite',
      role: 'status',
    });

    await wrapper.get('.query-summary').trigger('click');
    await nextTick();
    expect(wrapper.get('.query-request-feedback').text()).toContain(
      '最近一次可用数据',
    );
    expect(wrapper.find('.app-query-feedback').exists()).toBe(false);
    expect(
      wrapper.findAll(
        '.query-request-feedback, .app-query-feedback',
      ),
    ).toHaveLength(1);

    await wrapper.get('.query-summary').trigger('click');
    await nextTick();
    expect(wrapper.find('.query-request-feedback').exists()).toBe(false);
    expect(wrapper.get('.app-query-feedback').text()).toContain(
      '最近一次可用数据',
    );
    wrapper.unmount();
  });

  it('persists the applied ranking instead of dirty Draft and replays it after remount', async () => {
    window.history.replaceState({}, '', '/ranking?user=luca');
    const firstPinia = createPinia();
    setActivePinia(firstPinia);
    const firstStore = validStore();
    const execute = vi.fn(async (request) => ({
      payload: rankingPayload(`server-${request.transactionId}`),
      requestId: `server-${request.transactionId}`,
      transactionId: request.transactionId,
    }));
    const resultDrivers = drivers(execute);
    const first = mount(App, {
      attachTo: document.body,
      global: { plugins: [firstPinia], stubs: { teleport: true } },
      props: {
        services: {
          catalogApi: catalogApi(),
          drivers: resultDrivers,
          targetWindow: window,
        },
      },
    });
    await flushPromises();

    await first.get('#query-editor').trigger('submit');
    await flushPromises();
    await vi.waitFor(() => {
      expect(createQuerySessionOwner(window).read('/ranking')).not.toBeNull();
    });

    firstStore.draft.uid = 'unsubmitted-user';
    await nextTick();
    expect(createQuerySessionOwner(window).read('/ranking')?.query).toMatchObject({
      scope: 'personal',
      uid: 'luca',
    });
    first.unmount();

    window.history.replaceState({}, '', '/ranking?user=other');
    const secondPinia = createPinia();
    setActivePinia(secondPinia);
    const secondStore = useQueryStore();
    const second = mount(App, {
      attachTo: document.body,
      global: { plugins: [secondPinia], stubs: { teleport: true } },
      props: {
        services: {
          catalogApi: catalogApi(),
          drivers: resultDrivers,
          targetWindow: window,
        },
      },
    });
    await flushPromises();
    await nextTick();

    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[1]![0]).toMatchObject({
      query: { scope: 'personal', uid: 'luca' },
    });
    expect(execute.mock.calls[1]![0]).not.toHaveProperty('refreshCollection');
    expect(secondStore.applied).toMatchObject({
      scope: 'personal',
      uid: 'luca',
    });
    expect(secondStore.draft.uid).toBe('luca');
    expect(second.find('.query-editor-overlay').exists()).toBe(false);
    expect(window.location.search).toBe('?user=luca');
    second.unmount();
  });

  it('retains a valid saved ranking when its refresh replay fails', async () => {
    const savedQuery: AppliedQuery = {
      scope: 'personal',
      uid: 'luca',
      collectionStatuses: ['completed'],
      subjectType: 'anime',
      positionKeys: ['staff:anime:2'],
      includeNSFW: false,
      mergeSeries: false,
    };
    const session = createQuerySessionOwner(window);
    expect(
      session.write('/ranking', savedQuery, {
        kind: 'ranking',
        rankingsView: {
          order: 'desc',
          page: 1,
          pageSize: 10,
          search: '',
          sort: 'count',
        },
      }),
    ).toBe(true);
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useQueryStore();
    const execute = vi.fn(async () => {
      throw new Error('offline');
    });
    const wrapper = mount(App, {
      attachTo: document.body,
      global: { plugins: [pinia], stubs: { teleport: true } },
      props: {
        services: {
          catalogApi: catalogApi(),
          drivers: drivers(execute),
          targetWindow: window,
        },
      },
    });
    await flushPromises();

    expect(execute).toHaveBeenCalledOnce();
    expect(store.applied).toBeNull();
    expect(store.draft.uid).toBe('luca');
    expect(wrapper.get('.app-local-error').text()).toContain(
      '结果暂时无法重新加载',
    );
    expect(session.read('/ranking')?.query).toEqual(savedQuery);
    wrapper.unmount();
  });

  it('retains a complete saved ranking when dependent detail replay fails', async () => {
    const savedQuery: AppliedQuery = {
      scope: 'personal',
      uid: 'luca',
      collectionStatuses: ['completed'],
      subjectType: 'anime',
      positionKeys: ['staff:anime:2'],
      includeNSFW: false,
      mergeSeries: false,
    };
    const savedWorkspace = {
      detail: {
        input: { personId: 12 },
        view: {
          order: 'asc',
          page: 2,
          pageSize: 5,
          search: '导演',
          section: 'works',
          sort: 'globalScore',
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
    } satisfies RecoveryWorkspace;
    const session = createQuerySessionOwner(window);
    expect(session.write('/ranking', savedQuery, savedWorkspace)).toBe(true);
    const savedPayload = session.read('/ranking');
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useQueryStore();
    const rankingExecute = vi.fn(async (request) => ({
      payload: rankingPayload(`server-${request.transactionId}`),
      requestId: `server-${request.transactionId}`,
      transactionId: request.transactionId,
    }));
    const detailExecute = vi.fn(async () => {
      throw new Error('detail offline');
    });
    const wrapper = mount(App, {
      attachTo: document.body,
      global: { plugins: [pinia], stubs: { teleport: true } },
      props: {
        services: {
          catalogApi: catalogApi(),
          drivers: {
            ...drivers(rankingExecute),
            personDetail: { execute: detailExecute },
          },
          targetWindow: window,
        },
      },
    });
    await flushPromises();

    expect(rankingExecute).toHaveBeenCalledOnce();
    expect(detailExecute).toHaveBeenCalledOnce();
    expect(wrapper.get('.app-local-error').text()).toContain(
      '结果暂时无法重新加载',
    );
    expect(session.read('/ranking')).toEqual(savedPayload);

    store.draft.uid = 'next-user';
    await wrapper.get('#query-editor').trigger('submit');
    await flushPromises();
    await vi.waitFor(() => {
      expect(session.read('/ranking')?.query).toMatchObject({
        scope: 'personal',
        uid: 'next-user',
      });
    });
    const updatedPayload = session.read('/ranking');
    expect(updatedPayload?.workspace).toMatchObject({
      kind: 'ranking',
      rankingsView: savedWorkspace.rankingsView,
    });
    expect(
      updatedPayload?.workspace.kind === 'ranking'
        ? updatedPayload.workspace.detail
        : undefined,
    ).toBeUndefined();
    wrapper.unmount();
  });

  it('skips a captured session when the route changes during catalog loading', async () => {
    const savedQuery: AppliedQuery = {
      scope: 'personal',
      uid: 'luca',
      collectionStatuses: ['completed'],
      subjectType: 'anime',
      positionKeys: ['staff:anime:2'],
      includeNSFW: false,
      mergeSeries: false,
    };
    const savedWorkspace = {
      kind: 'ranking',
      rankingsView: {
        order: 'desc',
        page: 1,
        pageSize: 10,
        search: '',
        sort: 'count',
      },
    } satisfies RecoveryWorkspace;
    const session = createQuerySessionOwner(window);
    expect(session.write('/ranking', savedQuery, savedWorkspace)).toBe(true);
    const savedPayload = session.read('/ranking');
    let resolveCatalog!: (
      value: Awaited<ReturnType<CatalogApi['load']>>,
    ) => void;
    const load = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<CatalogApi['load']>>>((resolve) => {
          resolveCatalog = resolve;
        }),
    );
    const rankingExecute = vi.fn();
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useQueryStore();
    const wrapper = mount(App, {
      attachTo: document.body,
      global: { plugins: [pinia], stubs: { teleport: true } },
      props: {
        services: {
          catalogApi: { load },
          drivers: drivers(rankingExecute),
          targetWindow: window,
        },
      },
    });
    await vi.waitFor(() => {
      expect(load).toHaveBeenCalledOnce();
    });

    window.history.pushState({}, '', '/co-star');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await nextTick();
    resolveCatalog(catalogFixture());
    await flushPromises();

    expect(window.location.pathname).toBe('/co-star');
    expect(rankingExecute).not.toHaveBeenCalled();
    expect(store.applied).toBeNull();
    expect(session.read('/ranking')).toEqual(savedPayload);
    wrapper.unmount();
  });

  it.each(['/ranking', '/co-star'] as const)(
    'opens an old fragment at %s as an editable form without business requests', async (path) => {
      window.history.replaceState({}, '', `${path}?user=other#q=v1.e30`);
      const pinia = createPinia();
      setActivePinia(pinia);
      const execute = vi.fn();
      const wrapper = mount(App, {
        global: { plugins: [pinia], stubs: { teleport: true } },
        props: { services: { catalogApi: catalogApi(), drivers: drivers(execute), targetWindow: window } },
      });
      await flushPromises();
      expect(execute).not.toHaveBeenCalled();
      expect(useQueryStore(pinia).draft.uid).toBe('other');
      expect(useQueryStore(pinia).applied).toBeNull();
      expect(wrapper.find('#query-editor').exists()).toBe(true);
      expect(wrapper.find('.app-local-error').exists()).toBe(false);
      expect(window.location.hash).toBe('');
      wrapper.unmount();
    },
  );

  it('restores an independent saved session while ignoring a retired URL fragment', async () => {
    const savedQuery: AppliedQuery = {
      scope: 'personal',
      uid: 'luca',
      collectionStatuses: ['completed'],
      subjectType: 'anime',
      positionKeys: ['staff:anime:2'],
      includeNSFW: false,
      mergeSeries: false,
    };
    const session = createQuerySessionOwner(window);
    expect(
      session.write('/ranking', savedQuery, {
        kind: 'ranking',
        rankingsView: {
          order: 'desc',
          page: 1,
          pageSize: 10,
          search: '',
          sort: 'count',
        },
      }),
    ).toBe(true);
    window.history.replaceState({}, '', '/ranking?user=other#q=v9.invalid');
    const pinia = createPinia();
    setActivePinia(pinia);
    const execute = vi.fn(async (request) => ({
      payload: rankingPayload(`server-${request.transactionId}`),
      requestId: `server-${request.transactionId}`, transactionId: request.transactionId,
    }));
    const wrapper = mount(App, {
      attachTo: document.body,
      global: { plugins: [pinia], stubs: { teleport: true } },
      props: {
        services: {
          catalogApi: catalogApi(),
          drivers: drivers(execute),
          targetWindow: window,
        },
      },
    });
    await flushPromises();

    expect(execute).toHaveBeenCalledOnce();
    expect(wrapper.find('.app-local-error').exists()).toBe(false);
    expect(useQueryStore(pinia).applied).toEqual(savedQuery);
    expect(window.location.hash).toBe('');
    expect(session.read('/ranking')?.query).toEqual(savedQuery);
    wrapper.unmount();
  });

  it(
    'replays the candidate identity installed by a valid co-star session',
    async () => {
    installMatchMedia((query) => query === '(width < 780px)');
    const savedQuery: AppliedQuery = {
      scope: 'personal',
      uid: 'luca',
      collectionStatuses: ['completed'],
      subjectType: 'anime',
      positionKeys: ['staff:anime:2', 'staff:anime:101'],
      includeNSFW: false,
      mergeSeries: false,
    };
    const savedWorkspace = {
      kind: 'co-star' as const,
      state: 'empty' as const,
      candidates: {
        input: { positionKey: 'staff:anime:101' },
        view: {
          order: 'desc' as const,
          page: 1,
          pageSize: 10 as const,
          search: '',
          sort: 'count' as const,
        },
      },
    };
    window.history.replaceState({}, '', '/co-star');
    expect(createQuerySessionOwner(window).write(
      '/co-star', savedQuery, savedWorkspace,
    )).toBe(true);
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useQueryStore();
    const candidateExecute = vi.fn(async (request) => {
      const requestId = `server-${request.transactionId}`;
      return {
        payload: appCandidatePayload(
          String(request.input.positionKey),
          requestId,
        ),
        requestId,
        transactionId: request.transactionId,
      };
    });
    const wrapper = mount(App, {
      attachTo: document.body,
      global: { plugins: [pinia], stubs: { teleport: true } },
      props: {
        services: {
          catalogApi: catalogApi(),
          drivers: {
            rankings: drivers(vi.fn()).rankings,
            candidates: { execute: candidateExecute },
          },
          targetWindow: window,
        },
      },
    });
    await flushPromises();
    await nextTick();

    expect(candidateExecute).toHaveBeenCalledOnce();
    expect(candidateExecute.mock.calls[0]![0].input).toEqual({
      positionKey: 'staff:anime:101',
    });
    expect(store.applied?.positionKeys).toEqual([
      'staff:anime:2',
      'staff:anime:101',
    ]);
    expect(wrapper.find('.query-editor-overlay').exists()).toBe(false);
    await vi.waitFor(() => {
      expect(
        wrapper
          .find('#mode-panel-co-star > .co-star-mobile-entry')
          .exists(),
      ).toBe(true);
    });
    expect(
      wrapper.find('#mode-panel-co-star > .co-star-mobile-entry').exists(),
    ).toBe(true);
    expect(wrapper.find('.app-header__mobile-context').exists()).toBe(false);
    expect(window.location.hash).toBe('');
    wrapper.unmount();
    },
  );

  it('focuses the first invalid field and exposes a keyboard disclosure', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useQueryStore();
    const wrapper = mount(App, {
      attachTo: document.body,
      global: { plugins: [pinia], stubs: { teleport: true } },
      props: {
        services: {
          catalogApi: catalogApi(),
          targetWindow: window,
        },
      },
    });
    await flushPromises();

    const submit = wrapper.get('button[type="submit"]');
    (submit.element as HTMLButtonElement).focus();
    await wrapper.get('#query-editor').trigger('submit');
    await flushPromises();

    const uid = wrapper.get('input[name="userId"]');
    expect(document.activeElement).toBe(uid.element);
    expect(uid.attributes('aria-invalid')).toBe('true');
    expect(uid.attributes('aria-describedby')).toBe(
      'query-user-id-help query-error-uid',
    );
    expect(wrapper.get('#query-error-uid').text()).not.toBe('');
    const uidFrame = uid.element.closest<HTMLElement>('.n-input')!;
    const sourceGroup = wrapper.get('.query-source-switch');
    const sourceLabel = wrapper.get('.n-radio-button');
    expect(uidFrame.style.getPropertyValue('--n-height')).toBe('34px');
    expect(
      (sourceGroup.element as HTMLElement).style.getPropertyValue('--n-height'),
    ).toBe('34px');
    expect(
      (sourceGroup.element as HTMLElement).style.getPropertyValue(
        '--n-button-color-active',
      ),
    ).toBe('#C82A70');
    expect(
      (sourceGroup.element as HTMLElement).style.getPropertyValue(
        '--n-button-text-color-active',
      ),
    ).toBe('#FFFFFF');
    expect(
      (
        wrapper.get('.mode-tabs .n-tabs').element as HTMLElement
      ).style.getPropertyValue('--n-tab-color-segment'),
    ).toBe('#C82A70');
    expect(sourceLabel.classes()).toContain('n-radio-button');

    const disclosure = wrapper.get(
      'button[aria-controls="query-advanced-options"]',
    );
    expect(disclosure.attributes('aria-expanded')).toBe('false');
    await disclosure.trigger('click');
    expect(disclosure.attributes('aria-expanded')).toBe('true');
    expect(wrapper.find('#query-advanced-options').exists()).toBe(true);
    expect(store.fieldErrors).toHaveProperty('uid');
    wrapper.unmount();
  });

  it('preserves contextual help and oracle tag controls', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const wrapper = mount(App, {
      attachTo: document.body,
      global: { plugins: [pinia], stubs: { teleport: true } },
      props: {
        services: {
          catalogApi: catalogApi(),
          targetWindow: window,
        },
      },
    });
    await flushPromises();

    const uidHelp = wrapper.get('.field-help-trigger');
    expect(uidHelp.classes()).toContain('info-trigger');
    expect(uidHelp.attributes('aria-expanded')).toBe('false');
    await uidHelp.trigger('focus');
    expect(uidHelp.attributes('aria-expanded')).toBe('true');
    await uidHelp.trigger('keydown', { key: 'Escape' });
    expect(uidHelp.attributes('aria-expanded')).toBe('false');

    await wrapper
      .get('button[aria-controls="query-advanced-options"]')
      .trigger('click');
    const mergeHelp = wrapper.get(
      'button[aria-label^="合并续作说明："]',
    );
    expect(mergeHelp.classes()).toContain('info-trigger');
    await mergeHelp.trigger('mouseenter');
    expect(mergeHelp.attributes('aria-expanded')).toBe('true');
    await mergeHelp.trigger('mouseleave');
    expect(mergeHelp.attributes('aria-expanded')).toBe('false');

    await wrapper
      .get('[role="switch"][aria-label="正向标签"]')
      .trigger('click');
    await nextTick();
    expect(wrapper.find('.query-tags').exists()).toBe(true);
    expect(wrapper.find('button[aria-label="添加正向标签"]').exists()).toBe(
      true,
    );

    const summary = wrapper.get('.query-summary');
    await summary.trigger('pointerdown');
    await summary.trigger('click');
    await nextTick();
    await summary.trigger('click');
    await nextTick();
    expect(
      wrapper
        .get('button[aria-controls="query-advanced-options"]')
        .attributes('aria-expanded'),
    ).toBe('true');
    wrapper.unmount();
  });

  it('autofocuses the personal UID only with a desktop fine pointer', async () => {
    installMatchMedia(
      (query) => query === '(width >= 780px) and (pointer: fine)',
    );
    const pinia = createPinia();
    setActivePinia(pinia);
    const wrapper = mount(App, {
      attachTo: document.body,
      global: { plugins: [pinia], stubs: { teleport: true } },
      props: {
        services: {
          catalogApi: catalogApi(),
          targetWindow: window,
        },
      },
    });
    await flushPromises();
    await nextTick();

    expect(document.activeElement).toBe(
      wrapper.get('input[name="userId"]').element,
    );
    wrapper.unmount();
  });

  it('moves validation focus into collection and advanced range controls', async () => {
    window.history.replaceState({}, '', '/ranking?user=luca');
    installMatchMedia(() => false);
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = validStore();
    store.draft.collectionStatuses = [];
    const wrapper = mount(App, {
      attachTo: document.body,
      global: { plugins: [pinia], stubs: { teleport: true } },
      props: {
        services: {
          catalogApi: catalogApi(),
          targetWindow: window,
        },
      },
    });
    await flushPromises();

    await wrapper.get('#query-editor').trigger('submit');
    await flushPromises();
    expect(
      (document.activeElement as HTMLElement).matches(
        '.field--collections :is([role="checkbox"], input[type="checkbox"])',
      ),
    ).toBe(true);

    store.draft.collectionStatuses = ['completed'];
    store.draft.personalScore.enabled = true;
    store.draft.personalScore.min = '';
    store.draft.personalScore.max = '';
    await wrapper.get('#query-editor').trigger('submit');
    await flushPromises();
    expect((document.activeElement as HTMLInputElement).name).toBe(
      'userRateMin',
    );
    expect(
      wrapper
        .get('button[aria-controls="query-advanced-options"]')
        .attributes('aria-expanded'),
    ).toBe('true');
    wrapper.unmount();
  });

  it('releases pointer focus but restores keyboard focus on compact close', async () => {
    installMatchMedia((query) => query === '(width < 780px)');
    const pinia = createPinia();
    setActivePinia(pinia);
    const wrapper = mount(App, {
      attachTo: document.body,
      global: { plugins: [pinia], stubs: { teleport: true } },
      props: {
        services: {
          catalogApi: catalogApi(),
          targetWindow: window,
        },
      },
    });
    await flushPromises();
    await nextTick();

    const summary = wrapper.get('.query-summary');
    const uid = wrapper.get('input[name="userId"]');
    expect(document.activeElement).not.toBe(uid.element);

    await summary.trigger('pointerdown');
    await summary.trigger('click');
    await nextTick();
    expect(wrapper.find('.query-editor-overlay').exists()).toBe(false);
    expect(document.activeElement).not.toBe(summary.element);

    await summary.trigger('click');
    await nextTick();
    const reopenedUid = wrapper.get('input[name="userId"]');
    (reopenedUid.element as HTMLInputElement).focus();
    await wrapper.get('#query-editor').trigger('keydown', { key: 'Escape' });
    await nextTick();
    expect(wrapper.find('.query-editor-overlay').exists()).toBe(false);
    expect(document.activeElement).toBe(summary.element);
    wrapper.unmount();
  });

  it('cancels the originating ranking request after switching tabs', async () => {
    window.history.replaceState({}, '', '/ranking?user=luca');
    const pinia = createPinia();
    setActivePinia(pinia);
    validStore();
    let rankingSignal: AbortSignal | undefined;
    const resultDrivers = drivers(
      (request) =>
        new Promise<OperationResponse<RankingPayload>>((_resolve, reject) => {
          rankingSignal = request.signal;
          request.signal.addEventListener(
            'abort',
            () => reject(new DOMException('cancelled', 'AbortError')),
            { once: true },
          );
        }),
    );
    const wrapper = mount(App, {
      attachTo: document.body,
      global: { plugins: [pinia], stubs: { teleport: true } },
      props: {
        services: {
          catalogApi: catalogApi(),
          drivers: resultDrivers,
          targetWindow: window,
        },
      },
    });
    await flushPromises();

    await wrapper.get('#query-editor').trigger('submit');
    await nextTick();
    expect(rankingSignal).toBeDefined();

    await wrapper.get('#mode-tab-co-star').trigger('click');
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('取消查询'))!
      .trigger('click');
    await flushPromises();

    expect(rankingSignal!.aborted).toBe(true);
    const apply = wrapper.get('button[type="submit"]');
    expect(apply.attributes('disabled')).toBeUndefined();
    const feedback = wrapper.get('.app-query-feedback');
    expect(feedback.text()).toBe('查询已取消');
    expect(feedback.attributes()).toMatchObject({
      'aria-live': 'polite',
      'data-operation': 'rankings',
      role: 'status',
    });
    wrapper.unmount();
  });

  it('keeps an originating ranking failure visible after switching tabs', async () => {
    window.history.replaceState({}, '', '/ranking?user=luca');
    const pinia = createPinia();
    setActivePinia(pinia);
    validStore();
    let rejectRanking!: (error: unknown) => void;
    const resultDrivers = drivers(
      () =>
        new Promise<OperationResponse<RankingPayload>>((_resolve, reject) => {
          rejectRanking = reject;
        }),
    );
    const wrapper = mount(App, {
      attachTo: document.body,
      global: { plugins: [pinia], stubs: { teleport: true } },
      props: {
        services: {
          catalogApi: catalogApi(),
          drivers: resultDrivers,
          targetWindow: window,
        },
      },
    });
    await flushPromises();

    await wrapper.get('#query-editor').trigger('submit');
    await nextTick();
    await wrapper.get('#mode-tab-co-star').trigger('click');
    rejectRanking(new Error('offline'));
    await flushPromises();

    const feedback = wrapper.get('.app-query-feedback');
    expect(feedback.text()).toBe('查询暂时无法完成，请稍后重试');
    expect(feedback.classes()).toContain('app-query-feedback--error');
    expect(feedback.attributes()).toMatchObject({
      'aria-live': 'polite',
      'data-operation': 'rankings',
      role: 'status',
    });
    wrapper.unmount();
  });

  it('renders one local copy of the current ranking failure', async () => {
    window.history.replaceState({}, '', '/ranking?user=luca');
    const pinia = createPinia();
    setActivePinia(pinia);
    validStore();
    const wrapper = mount(App, {
      attachTo: document.body,
      global: { plugins: [pinia], stubs: { teleport: true } },
      props: {
        services: {
          catalogApi: catalogApi(),
          drivers: drivers(async () => {
            throw new Error('offline');
          }),
          targetWindow: window,
        },
      },
    });
    await flushPromises();

    await wrapper.get('#query-editor').trigger('submit');
    await flushPromises();
    await vi.waitFor(() => {
      expect(wrapper.find('.ranking-surface--state').exists()).toBe(true);
    });

    expect(wrapper.get('.query-request-feedback').text()).toBe(
      '查询暂时无法完成，请稍后重试',
    );
    expect(wrapper.find('.app-query-feedback').exists()).toBe(false);
    expect(wrapper.find('.ranking-surface--state').exists()).toBe(true);
    expect(wrapper.find('.ranking-surface--state p').exists()).toBe(false);
    expect(
      wrapper.findAll(
        '.query-request-feedback, .app-query-feedback, .ranking-inline-error, .ranking-surface--state p',
      ),
    ).toHaveLength(1);
    wrapper.unmount();
  });

  it('keeps retained ranking results and one error copy when a changed query fails', async () => {
    window.history.replaceState({}, '', '/ranking?user=luca');
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = validStore();
    const execute = vi
      .fn()
      .mockImplementationOnce(async (request) => ({
        payload: rankingPayload(`server-${request.transactionId}`),
        requestId: `server-${request.transactionId}`,
        transactionId: request.transactionId,
      }))
      .mockImplementationOnce(async () => {
        throw new Error('offline');
      });
    const wrapper = mount(App, {
      attachTo: document.body,
      global: { plugins: [pinia], stubs: { teleport: true } },
      props: {
        services: {
          catalogApi: catalogApi(),
          drivers: drivers(execute),
          targetWindow: window,
        },
      },
    });
    await flushPromises();
    await wrapper.get('#query-editor').trigger('submit');
    await flushPromises();
    await vi.waitFor(() => {
      expect(wrapper.find('.ranking-page-empty-state').exists()).toBe(true);
    });
    expect(wrapper.find('.ranking-page-empty-state').exists()).toBe(true);

    await wrapper.get('.query-summary').trigger('click');
    await nextTick();
    store.draft.includeNSFW = true;
    await wrapper.get('#query-editor').trigger('submit');
    await flushPromises();

    expect(wrapper.find('.ranking-page-empty-state').exists()).toBe(true);
    expect(wrapper.get('.query-request-feedback').text()).toBe(
      '查询暂时无法完成，请稍后重试',
    );
    expect(wrapper.find('.ranking-inline-error').exists()).toBe(false);
    expect(
      wrapper.findAll(
        '.query-request-feedback, .app-query-feedback, .ranking-inline-error, .ranking-surface--state p',
      ),
    ).toHaveLength(1);
    wrapper.unmount();
  });

  it('renders one local copy of a current ranking cancellation', async () => {
    window.history.replaceState({}, '', '/ranking?user=luca');
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = validStore();
    const wrapper = mount(App, {
      attachTo: document.body,
      global: { plugins: [pinia], stubs: { teleport: true } },
      props: {
        services: {
          catalogApi: catalogApi(),
          drivers: drivers(
            (request) =>
              new Promise<OperationResponse<RankingPayload>>(
                (_resolve, reject) => {
                  request.signal.addEventListener(
                    'abort',
                    () =>
                      reject(
                        new DOMException('cancelled', 'AbortError'),
                      ),
                    { once: true },
                  );
                },
              ),
          ),
          targetWindow: window,
        },
      },
    });
    await flushPromises();

    await wrapper.get('#query-editor').trigger('submit');
    await nextTick();
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('取消查询'))!
      .trigger('click');
    await flushPromises();

    expect(wrapper.get('.query-request-feedback').text()).toBe(
      '查询已取消',
    );
    expect(wrapper.find('.app-query-feedback').exists()).toBe(false);
    expect(
      wrapper.findAll(
        '.query-request-feedback, .app-query-feedback',
      ),
    ).toHaveLength(1);
    wrapper.unmount();
  });

  it('uses truthful all-position help and de-duplicates candidate failure feedback', async () => {
    window.history.replaceState({}, '', '/co-star?user=luca');
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = validStore();
    let candidateCalls = 0;
    const executeCandidates: QueryDrivers<
      RankingPayload,
      ApiCandidatePayload
    >['candidates']['execute'] = async (request) => {
      candidateCalls += 1;
      if (candidateCalls > 1) {
        throw new Error('offline');
      }
      return {
        payload: appCandidatePayload(
          request.input.positionKey,
          `server-${request.transactionId}`,
        ),
        requestId: `server-${request.transactionId}`,
        transactionId: request.transactionId,
      };
    };
    const resultDrivers: QueryDrivers<RankingPayload, ApiCandidatePayload> = {
      candidates: {
        execute: executeCandidates,
      },
      rankings: {
        async execute(request) {
          return {
            payload: rankingPayload(`server-${request.transactionId}`),
            requestId: `server-${request.transactionId}`,
            transactionId: request.transactionId,
          };
        },
      },
    };
    const wrapper = mount(App, {
      attachTo: document.body,
      global: { plugins: [pinia], stubs: { teleport: true } },
      props: {
        services: {
          catalogApi: catalogApi(),
          drivers: resultDrivers,
          targetWindow: window,
        },
      },
    });
    await flushPromises();

    const help = wrapper
      .findAll<HTMLButtonElement>('.query-option-help')
      .find((button) =>
        button.attributes('aria-label')?.startsWith('职位说明：'),
      );
    expect(help).toBeDefined();
    expect(wrapper.get('#query-position-title').text()).toBe('职位');
    expect(help!.classes()).toContain('info-trigger');
    expect(help!.attributes('aria-label')).toContain(
      '选择“全部”可从所有可用职位中选择人物；选择具体职位用于确定初始候选人物；实际参与身份在“已选人物”中管理',
    );
    expect(help!.attributes('aria-label')).not.toContain('第一项');

    await wrapper.get('#query-editor').trigger('submit');
    await flushPromises();

    await vi.waitFor(() => {
      expect(wrapper.findComponent({ name: 'CandidatePicker' }).exists()).toBe(true);
    });
    await wrapper.get('.query-summary').trigger('click');
    await nextTick();
    store.draft.includeNSFW = true;
    await wrapper.get('#query-editor').trigger('submit');
    await flushPromises();

    expect(wrapper.get('.query-request-feedback').text()).toBe(
      '查询暂时无法完成，请稍后重试',
    );
    expect(wrapper.find('.app-query-feedback').exists()).toBe(false);
    expect(wrapper.find('.candidate-browser').exists()).toBe(true);
    expect(wrapper.get('.candidate-inline-error').text()).toBe('重试');
    expect(
      wrapper.find('.candidate-inline-error__message').exists(),
    ).toBe(false);
    expect(
      wrapper.findAll(
        '.query-request-feedback, .app-query-feedback, .candidate-inline-error__message, .candidate-state p',
      ),
    ).toHaveLength(1);
    wrapper.unmount();
  });
});

describe('PositionSelector hierarchical catalog', () => {
  function mountSelector(
    modelValue: readonly PositionKey[] = [],
    compact = true,
  ) {
    installMatchMedia(
      (query) => compact && query === '(width < 780px)',
    );
    return mount(PositionSelector, {
      attachTo: document.body,
      global: { stubs: { teleport: true } },
      props: {
        controlSize: compact ? 'small' : 'medium',
        groups: selectorGroups,
        modelValue,
        phase: 'ready',
        placeholder: '选择职位',
        positions: selectorPositions,
      },
    });
  }

  async function openCatalog(
    wrapper: ReturnType<typeof mountSelector>,
    index = 0,
  ) {
    await wrapper
      .findAll('.position-selector__toggle')[index]!
      .trigger('click');
    await flushPromises();
  }

  it('offers All as an exclusive co-star scope without inventing position keys', async () => {
    const wrapper = mountSelector(['staff:anime:2']);
    await wrapper.setProps({ allowAll: true });
    await openCatalog(wrapper);
    await wrapper.get('[data-position-all]').trigger('click');
    expect(wrapper.emitted('update:allSelected')?.at(-1)).toEqual([true]);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    await wrapper.setProps({ allSelected: true });
    await flushPromises();
    expect(wrapper.findAll('.position-selector__filter')).toHaveLength(1);
    expect((wrapper.get('.position-selector__filter').element as HTMLInputElement).value).toBe('全部');
    expect(wrapper.get('[aria-label="在第 1 行后添加职位选择器"]').attributes('disabled')).toBeDefined();
    await openCatalog(wrapper);
    expect(wrapper.get('[data-position-all]').attributes('aria-pressed')).toBe('true');
    await wrapper.get('[data-position-group="bangumi:anime:cast"]').trigger('click');
    await wrapper.findAll('[data-position-key="cast:anime:all"]')[0]!.trigger('click');
    expect(wrapper.emitted('update:allSelected')?.at(-1)).toEqual([false]);
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([['cast:anime:all']]);
    await wrapper.setProps({ allSelected: false, allowAll: false, modelValue: ['cast:anime:all'] });
    await openCatalog(wrapper);
    expect(wrapper.find('[data-position-all]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('keeps a loading selector while catalog choices are unavailable', async () => {
    const wrapper = mountSelector();
    await wrapper.setProps({ phase: 'pending' });
    const selector = wrapper.findComponent(NSelect);
    expect(selector.props('loading')).toBe(true);
    expect(selector.props('disabled')).toBe(true);
    expect(selector.props('size')).toBe('small');
    expect(wrapper.find('.app-skeleton').exists()).toBe(false);
    expect(wrapper.get('.position-selector__pending').attributes('aria-busy')).toBe('true');
    await wrapper.setProps({ phase: 'ready' });
    expect(wrapper.find('.position-selector__filter').exists()).toBe(true);
    wrapper.unmount();
  });

  it('discloses categories without selecting them and synchronizes duplicate copies', async () => {
    const wrapper = mountSelector();
    await openCatalog(wrapper);

    const featured = wrapper.get(
      '[data-position-group="shortcut:anime:featured"]',
    );
    const directorGroup = wrapper.get(
      '[data-position-group="bangumi:anime:director"]',
    );
    expect(featured.attributes('aria-expanded')).toBe('true');
    expect(directorGroup.attributes('aria-expanded')).toBe('false');

    const emissionsBeforeDisclosure =
      wrapper.emitted('update:modelValue')?.length ?? 0;
    await directorGroup.trigger('click');
    expect(directorGroup.attributes('aria-expanded')).toBe('true');
    expect(wrapper.emitted('update:modelValue')?.length ?? 0).toBe(
      emissionsBeforeDisclosure,
    );

    const directorCopies = wrapper.findAll(
      '[data-position-key="staff:anime:2"]',
    );
    expect(directorCopies).toHaveLength(2);
    const occurrenceKeys = directorCopies.map((copy) =>
      copy.attributes('data-occurrence-key'),
    );
    expect(new Set(occurrenceKeys).size).toBe(occurrenceKeys.length);

    await directorCopies[1]!.trigger('click');
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual([
      'staff:anime:2',
    ]);
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);

    await wrapper.setProps({ modelValue: ['staff:anime:2'] });
    await openCatalog(wrapper);
    await wrapper
      .get('[data-position-group="bangumi:anime:director"]')
      .trigger('click');
    expect(
      wrapper
        .findAll('[data-position-key="staff:anime:2"]')
        .map((copy) => copy.attributes('aria-pressed')),
    ).toEqual(['true', 'true']);
    expect(
      wrapper
        .get<HTMLInputElement>('.position-selector__filter')
        .attributes('aria-label'),
    ).toBe('第 1 个职位，当前为导演');

    await wrapper
      .get('[data-position-key="cast:anime:main"]')
      .trigger('click');
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual([
      'cast:anime:main',
    ]);
    expect(
      wrapper.get<HTMLInputElement>('.position-selector__filter').element
        .value,
    ).toBe('声优（仅主役）');

    await wrapper.setProps({ modelValue: ['cast:anime:main'] });
    const emissionsBeforeSameSelection =
      wrapper.emitted('update:modelValue')?.length ?? 0;
    await openCatalog(wrapper);
    await wrapper
      .findAll('[data-position-key="cast:anime:main"]')[0]!
      .trigger('click');
    expect(wrapper.emitted('update:modelValue')?.length ?? 0).toBe(
      emissionsBeforeSameSelection,
    );
    wrapper.unmount();
  });

  it('keeps canonical cast exclusivity and the order of unrelated positions', async () => {
    const wrapper = mountSelector([
      'staff:anime:2',
      'cast:anime:main',
    ]);
    await openCatalog(wrapper, 1);
    await wrapper
      .get('[data-position-group="bangumi:anime:cast"]')
      .trigger('click');
    await wrapper
      .get('[data-position-key="cast:anime:all"]')
      .trigger('click');

    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual([
      'staff:anime:2',
      'cast:anime:all',
    ]);
    wrapper.unmount();
  });

  it('uses DynamicInput rows for ordered unique add, replace, remove, and reset', async () => {
    const wrapper = mountSelector(['staff:anime:2']);

    expect(wrapper.getComponent(NDynamicInput).props('min')).toBe(1);
    expect(wrapper.findAll('.position-selector__control')).toHaveLength(1);
    for (const action of wrapper.findAll(
      '.position-selector__action-button',
    )) {
      expect(action.classes()).toContain('n-button--default-type');
      expect(action.classes()).not.toContain('n-button--secondary');
      expect(action.classes()).not.toContain('n-button--circle');
      expect(action.classes()).not.toContain('n-button--quaternary-type');
    }
    expect(
      wrapper
        .get('button[aria-label="移除第 1 个职位选择器"]')
        .attributes('disabled'),
    ).toBeDefined();

    await wrapper
      .get('button[aria-label="在第 1 行后添加职位选择器"]')
      .trigger('click');
    await flushPromises();
    expect(wrapper.findAll('.position-selector__control')).toHaveLength(2);
    expect(wrapper.findAll('.position-selector__filter')[1]!.attributes(
      'placeholder',
    )).toBe('选择职位');
    expect(wrapper.find('#query-position-catalog-browser').exists()).toBe(
      true,
    );
    expect(
      wrapper
        .findAll('[data-position-key="staff:anime:2"]')
        .every(
          (copy) =>
            copy.attributes('disabled') !== undefined &&
            copy.attributes('data-position-unavailable') === 'true',
        ),
    ).toBe(true);

    await wrapper
      .findAll('[data-position-key="cast:anime:main"]')[0]!
      .trigger('click');
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual([
      'staff:anime:2',
      'cast:anime:main',
    ]);
    expect(wrapper.find('#query-position-catalog-browser').exists()).toBe(
      false,
    );

    await wrapper
      .get('button[aria-label="移除第 1 个职位选择器"]')
      .trigger('click');
    await flushPromises();
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual([
      'cast:anime:main',
    ]);
    expect(wrapper.findAll('.position-selector__control')).toHaveLength(1);
    expect(
      wrapper.get<HTMLInputElement>('.position-selector__filter').element
        .value,
    ).toBe('声优（仅主役）');
    expect(
      wrapper
        .get('button[aria-label="移除第 1 个职位选择器"]')
        .attributes('disabled'),
    ).toBeDefined();

    await wrapper.setProps({ modelValue: [] });
    await nextTick();
    expect(wrapper.findAll('.position-selector__control')).toHaveLength(1);
    expect(
      wrapper.get<HTMLInputElement>('.position-selector__filter').element
        .value,
    ).toBe('');
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual([
      'cast:anime:main',
    ]);
    wrapper.unmount();
  });

  it.each([
    'Director',
    '監督',
    'staff:anime:2',
    'director',
    'bangumi:anime:director',
    '导演类',
  ])('returns one canonical contextual result for search %s', async (pattern) => {
    const wrapper = mountSelector();
    await openCatalog(wrapper);
    await wrapper
      .get<HTMLInputElement>('.position-selector__filter')
      .setValue(pattern);
    await nextTick();

    expect(wrapper.findAll('[data-position-group]')).toHaveLength(0);
    expect(
      wrapper.find('#query-position-catalog-browser .content-divider').exists(),
    ).toBe(false);
    const results = wrapper.findAll(
      '[data-position-key="staff:anime:2"]',
    );
    expect(results).toHaveLength(1);
    expect(results[0]!.attributes('data-occurrence-key')).toContain('search');
    expect(results[0]!.text()).toContain('常用职位、导演类');
    wrapper.unmount();
  });

  it('uses an anchored compact Popover and isolates Escape with focus restoration', async () => {
    const wrapper = mountSelector();
    await openCatalog(wrapper);

    const panel = wrapper.get('#query-position-catalog-browser');
    const groups = panel.findAll('.position-catalog-browser__group');
    expect(panel.findAll('.content-divider')).toHaveLength(groups.length - 1);
    expect(groups.at(-1)!.find('.content-divider').exists()).toBe(false);
    const toggle = wrapper.get<HTMLButtonElement>(
      '.position-selector__toggle',
    );
    expect(panel.classes()).toContain('is-compact');
    expect(toggle.attributes()).toMatchObject({
      'aria-expanded': 'true',
      'aria-haspopup': 'dialog',
    });
    expect(wrapper.getComponent(NPopover).props()).toMatchObject({
      placement: 'bottom-start',
      flip: true,
      show: true,
      to: 'body',
    });
    expect(wrapper.getComponent(NPopover).props('width')).toBeUndefined();

    toggle.element.focus();
    await panel.trigger('keydown', { key: 'Escape' });
    await nextTick();
    expect(wrapper.find('#query-position-catalog-browser').exists()).toBe(
      false,
    );
    expect(document.activeElement).toBe(
      wrapper.get('.position-selector__filter').element,
    );
    wrapper.unmount();
  });

  it('keeps compact inside interaction open and dismisses on outside pointer without focus theft', async () => {
    const wrapper = mountSelector();
    await openCatalog(wrapper);
    await wrapper
      .get('[data-position-key="staff:anime:2"]')
      .trigger('pointerdown');
    expect(wrapper.find('#query-position-catalog-browser').exists()).toBe(
      true,
    );

    const outside = document.createElement('button');
    outside.textContent = 'outside';
    document.body.append(outside);
    outside.focus();
    wrapper
      .getComponent(NPopover)
      .vm.$emit('clickoutside', new MouseEvent('click'));
    await nextTick();

    expect(wrapper.find('#query-position-catalog-browser').exists()).toBe(
      false,
    );
    expect(document.activeElement).toBe(outside);
    outside.remove();
    wrapper.unmount();
  });

  it('configures the desktop browser as an anchored body portal', async () => {
    const wrapper = mountSelector([], false);
    await openCatalog(wrapper);

    const popover = wrapper.getComponent(NPopover);
    expect(popover.props()).toMatchObject({
      disabled: false,
      flip: true,
      placement: 'bottom-start',
      show: true,
      to: 'body',
    });
    expect(popover.props('width')).toBeUndefined();
    expect(wrapper.get('.position-selector__toggle').attributes()).toMatchObject({
      'aria-expanded': 'true',
      'aria-haspopup': 'dialog',
    });
    popover.vm.$emit('clickoutside', new MouseEvent('click'));
    await nextTick();
    expect(
      wrapper.get('.position-selector__toggle').attributes('aria-expanded'),
    ).toBe('false');
    wrapper.unmount();
  });
});
