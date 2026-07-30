import { createPinia, setActivePinia } from 'pinia';
import { NSelect } from 'naive-ui';
import { flushPromises, mount } from '@vue/test-utils';
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
import {
  createShareUrl,
  readShare,
  type ShareWorkspace,
} from '../../src/features/query/share';
import { useQueryStore } from '../../src/features/query/store';
import { catalogFixture } from '../features/query/fixtures';

const rankingDataVersion = `dv1-${'d'.repeat(64)}`;

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

function installCompactLayout(initialMatches: boolean): {
  setMatches: (matches: boolean) => void;
} {
  let matches = initialMatches;
  const listeners = new Set<() => void>();
  const media = {
    addEventListener(_type: string, listener: () => void) {
      listeners.add(listener);
    },
    dispatchEvent() {
      for (const listener of listeners) {
        listener();
      }
      return true;
    },
    get matches() {
      return matches;
    },
    media: '(width < 780px)',
    onchange: null,
    removeEventListener(_type: string, listener: () => void) {
      listeners.delete(listener);
    },
  } as unknown as MediaQueryList;
  vi.stubGlobal('matchMedia', vi.fn(() => media));
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

function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string'
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

function uncheckedFragment(payload: unknown): string {
  const bytes = new TextEncoder().encode(canonicalJson(payload));
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return `#q=v1.${btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '')}`;
}

describe('App ranking production slice', () => {
  it('replays and re-shares one authoritative detail with its exact view', async () => {
    const query: AppliedQuery = {
      scope: 'personal',
      uid: 'luca',
      collectionStatuses: ['completed'],
      subjectType: 'anime',
      positionKeys: ['staff:anime:2'],
      includeNSFW: false,
      mergeSeries: false,
    };
    const workspace: ShareWorkspace = {
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
    window.history.replaceState(
      {},
      '',
      createShareUrl(
        new URL(`${window.location.origin}/ranking`),
        '/ranking',
        query,
        workspace,
      ),
    );
    const pinia = createPinia();
    setActivePinia(pinia);
    const rankingExecute = vi.fn(async (request) => ({
      payload: rankingPayload('server-ranking-share', 'average'),
      requestId: 'server-ranking-share',
      transactionId: request.transactionId,
    }));
    const detailExecute = vi.fn(async (request) => ({
      payload: detailPayload(),
      requestId: 'server-detail-share',
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
    expect(wrapper.find('.query-editor-overlay').exists()).toBe(false);
    expect(window.location.hash).toBe('');

    await wrapper
      .get('button[aria-label="复制当前查询链接"]')
      .trigger('click');
    await flushPromises();
    const link = (
      wrapper.get(
      '.share-fallback__content input',
      ).element as HTMLInputElement
    ).value;
    expect(readShare('/ranking', new URL(link).hash).workspace).toEqual(
      workspace,
    );
    wrapper.unmount();
  });

  it('replays a ranking share without detail without starting an Inspector request', async () => {
    const query: AppliedQuery = {
      scope: 'personal',
      uid: 'luca',
      collectionStatuses: ['completed'],
      subjectType: 'anime',
      positionKeys: ['staff:anime:2'],
      includeNSFW: false,
      mergeSeries: false,
    };
    const workspace: ShareWorkspace = {
      kind: 'ranking',
      rankingsView: {
        order: 'desc',
        page: 1,
        pageSize: 10,
        search: '',
        sort: 'count',
      },
    };
    window.history.replaceState(
      {},
      '',
      createShareUrl(
        new URL(`${window.location.origin}/ranking`),
        '/ranking',
        query,
        workspace,
      ),
    );
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

    expect(detailExecute).not.toHaveBeenCalled();
    expect(wrapper.find('.query-editor-overlay').exists()).toBe(false);
    expect(wrapper.get('.ranked-person-row').attributes('aria-current')).toBeUndefined();
    expect(window.location.hash).toBe('');
    wrapper.unmount();
  });

  it('keeps deferred Inspector state invisible until a person is selected', async () => {
    installCompactLayout(false);
    window.history.replaceState({}, '', '/ranking?user=luca');
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useQueryStore();
    store.draft.uid = 'luca';
    store.draft.positionKeys = ['staff:anime:2'];
    const personDetailModule = deferred<never>();
    const detailExecute = vi.fn(async (request) => ({
      payload: detailPayload(),
      requestId: 'server-detail',
      transactionId: request.transactionId,
    }));
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
                  payload: rankingPayload(
                    'server-ranking',
                    'count',
                  ),
                  requestId: 'server-ranking',
                  transactionId: request.transactionId,
                };
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
    await flushPromises();

    const placeholder = wrapper.get('.person-detail-placeholder');
    expect(placeholder.get('h2').text()).toBe('选择人物查看详情');
    expect(placeholder.get('p').text()).toBe(
      '从左侧排行中选择一位人物，查看评分、证据和参与作品。',
    );
    expect(wrapper.text()).not.toContain('正在加载人物详情');
    expect(wrapper.text()).not.toContain('人物详情加载失败');

    personDetailModule.reject(new Error('module unavailable'));
    await flushPromises();
    expect(wrapper.get('.person-detail-placeholder').text()).toContain(
      '选择人物查看详情',
    );
    expect(wrapper.text()).not.toContain('人物详情加载失败');

    await wrapper.get('.ranked-person-row').trigger('click');
    await flushPromises();
    expect(detailExecute).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain('人物详情加载失败');
    expect(wrapper.find('.person-detail-placeholder').exists()).toBe(
      false,
    );
    wrapper.unmount();
    vi.unstubAllGlobals();
  });

  it('omits pending and failed unaccepted detail attempts from an otherwise shareable ranking', async () => {
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
    await wrapper.get('.ranked-person-row').trigger('click');
    await nextTick();

    await wrapper
      .get('button[aria-label="复制当前查询链接"]')
      .trigger('click');
    await flushPromises();
    let link = (
      wrapper.get(
      '.share-fallback__content input',
      ).element as HTMLInputElement
    ).value;
    let shared = readShare('/ranking', new URL(link).hash);
    expect(
      shared.workspace.kind === 'ranking'
        ? shared.workspace.detail
        : null,
    ).toBeUndefined();

    rejectDetail(new Error('offline'));
    await flushPromises();
    await wrapper
      .get('button[aria-label="复制当前查询链接"]')
      .trigger('click');
    await flushPromises();
    link = (
      wrapper.get(
      '.share-fallback__content input',
      ).element as HTMLInputElement
    ).value;
    shared = readShare('/ranking', new URL(link).hash);
    expect(
      shared.workspace.kind === 'ranking'
        ? shared.workspace.detail
        : null,
    ).toBeUndefined();
    wrapper.unmount();
  });

  it('rejects an invalid detail section/sort union before rankings or Inspector requests', async () => {
    const fragment = uncheckedFragment({
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
    });
    window.history.replaceState(
      {},
      '',
      `${window.location.origin}/ranking${fragment}`,
    );
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
    expect(wrapper.get('.app-local-error').text()).toContain(
      '分享查询无效',
    );
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

  it('preserves the selected Inspector and reruns it against the refreshed collection before sharing', async () => {
    window.history.replaceState({}, '', '/ranking?user=luca');
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useQueryStore();
    store.draft.uid = 'luca';
    store.draft.positionKeys = ['staff:anime:2'];
    const refreshedDataVersion = `dv1-${'f'.repeat(64)}`;
    const refreshedFetchedAt = '2026-07-25T00:05:00Z';
    const detailRefresh =
      deferred<OperationResponse<PersonDetailPayload>>();
    type Drivers = QueryDrivers<
      RankingPayload,
      never,
      PersonDetailPayload
    >;
    type RankingRequest = Parameters<
      Drivers['rankings']['execute']
    >[0];
    type DetailRequest = Parameters<
      NonNullable<Drivers['personDetail']>['execute']
    >[0];
    let rankingCall = 0;
    const rankingExecute = vi.fn(async (request: RankingRequest) => {
      rankingCall += 1;
      const refreshed = rankingCall > 1;
      const requestId = refreshed
        ? 'server-ranking-refreshed'
        : 'server-ranking';
      return {
        payload: rankingPayload(
          requestId,
          'count',
          refreshed ? refreshedDataVersion : rankingDataVersion,
          refreshed
            ? refreshedFetchedAt
            : '2026-07-25T00:00:00Z',
        ),
        requestId,
        transactionId: request.transactionId,
      };
    });
    let detailCall = 0;
    const detailExecute = vi.fn((request: DetailRequest) => {
      detailCall += 1;
      if (detailCall === 2) {
        return detailRefresh.promise;
      }
      const refreshed = detailCall > 1;
      return Promise.resolve({
        payload: detailPayload(
          refreshed ? refreshedDataVersion : rankingDataVersion,
          refreshed
            ? refreshedFetchedAt
            : '2026-07-25T00:00:00Z',
        ),
        requestId: refreshed
          ? 'server-detail-refreshed'
          : 'server-detail',
        transactionId: request.transactionId,
      });
    });
    const drivers: Drivers = {
      candidates: {
        async execute(): Promise<never> {
          throw new Error('not part of this test');
        },
      },
      personDetail: { execute: detailExecute },
      rankings: { execute: rankingExecute },
    };
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
          drivers,
          targetWindow: window,
        },
      },
    });
    await flushPromises();
    await wrapper.get('#query-editor').trigger('submit');
    await flushPromises();
    const row = wrapper.get('.ranked-person-row');
    await row.trigger('click');
    await flushPromises();
    expect(detailExecute).toHaveBeenCalledOnce();
    expect(row.attributes('aria-current')).toBe('true');
    expect(
      wrapper
        .get('button[aria-label="复制当前查询链接"]')
        .attributes('disabled'),
    ).toBeUndefined();

    await wrapper.get('.query-summary').trigger('click');
    await nextTick();
    const refresh = wrapper
      .findAll('button')
      .find((button) => button.text().includes('刷新收藏并查询'));
    expect(refresh).toBeDefined();
    await refresh!.trigger('click');
    await flushPromises();

    expect(rankingExecute).toHaveBeenCalledTimes(2);
    expect(rankingExecute.mock.calls[1]![0].refreshCollection).toBe(
      true,
    );
    expect(detailExecute).toHaveBeenCalledTimes(2);
    expect(detailExecute.mock.calls[1]![0]).toMatchObject({
      input: { personId: 12 },
      view: detailExecute.mock.calls[0]![0].view,
    });
    expect(row.attributes('aria-current')).toBe('true');
    const share = wrapper.get(
      'button[aria-label="复制当前查询链接"]',
    );
    expect(share.attributes('disabled')).toBeUndefined();
    await share.trigger('click');
    await flushPromises();
    let link = (
      wrapper.get(
        '.share-fallback__content input',
      ).element as HTMLInputElement
    ).value;
    let shared = readShare('/ranking', new URL(link).hash);
    expect(
      shared.workspace.kind === 'ranking'
        ? shared.workspace.detail
        : null,
    ).toBeUndefined();

    detailRefresh.reject(new Error('offline'));
    await flushPromises();
    expect(row.attributes('aria-current')).toBe('true');
    expect(wrapper.get('.person-inspector__state').text()).toContain(
      '人物详情加载失败',
    );
    expect(share.attributes('disabled')).toBeUndefined();

    await wrapper.get('.person-inspector__state button').trigger('click');
    await flushPromises();
    expect(detailExecute).toHaveBeenCalledTimes(3);
    await share.trigger('click');
    await flushPromises();
    link = (
      wrapper.get(
        '.share-fallback__content input',
      ).element as HTMLInputElement
    ).value;
    shared = readShare('/ranking', new URL(link).hash);
    expect(
      shared.workspace.kind === 'ranking'
        ? shared.workspace.detail
        : null,
    ).toMatchObject({
      input: { personId: 12 },
      view: detailExecute.mock.calls[2]![0].view,
    });
    expect(wrapper.text()).toContain('林明');
    wrapper.unmount();
  });

  it('queues compound Inspector controls and replays both changed and unchanged views exactly once per ranking refresh', async () => {
    window.history.replaceState({}, '', '/ranking?user=luca');
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useQueryStore();
    store.draft.uid = 'luca';
    store.draft.positionKeys = ['staff:anime:2'];
    const versionB = `dv1-${'e'.repeat(64)}`;
    const versionC = `dv1-${'f'.repeat(64)}`;
    const fetchedAtB = '2026-07-25T00:05:00Z';
    const fetchedAtC = '2026-07-25T00:10:00Z';
    const rankingRefreshB =
      deferred<OperationResponse<RankingPayload>>();
    const rankingRefreshC =
      deferred<OperationResponse<RankingPayload>>();
    const detailRefreshB =
      deferred<OperationResponse<PersonDetailPayload>>();
    type Drivers = QueryDrivers<
      RankingPayload,
      never,
      PersonDetailPayload
    >;
    type RankingRequest = Parameters<
      Drivers['rankings']['execute']
    >[0];
    type DetailRequest = Parameters<
      NonNullable<Drivers['personDetail']>['execute']
    >[0];
    let rankingCall = 0;
    const rankingExecute = vi.fn((request: RankingRequest) => {
      rankingCall += 1;
      if (rankingCall === 2) {
        return rankingRefreshB.promise;
      }
      if (rankingCall === 3) {
        return rankingRefreshC.promise;
      }
      return Promise.resolve({
        payload: rankingPayload('server-ranking', 'count'),
        requestId: 'server-ranking',
        transactionId: request.transactionId,
      });
    });
    let detailCall = 0;
    const detailExecute = vi.fn((request: DetailRequest) => {
      detailCall += 1;
      if (detailCall === 2) {
        return detailRefreshB.promise;
      }
      const refreshed = detailCall === 3;
      return Promise.resolve({
        payload: detailPayload(
          refreshed ? versionC : rankingDataVersion,
          refreshed
            ? fetchedAtC
            : '2026-07-25T00:00:00Z',
        ),
        requestId: refreshed
          ? 'server-detail-c'
          : 'server-detail',
        transactionId: request.transactionId,
      });
    });
    const drivers: Drivers = {
      candidates: {
        async execute(): Promise<never> {
          throw new Error('not part of this test');
        },
      },
      personDetail: { execute: detailExecute },
      rankings: { execute: rankingExecute },
    };
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
          drivers,
          targetWindow: window,
        },
      },
    });
    await flushPromises();
    await wrapper.get('#query-editor').trigger('submit');
    await flushPromises();
    await wrapper.get('.ranked-person-row').trigger('click');
    await flushPromises();
    expect(detailExecute).toHaveBeenCalledOnce();

    await wrapper.get('.query-summary').trigger('click');
    await nextTick();
    let refresh = wrapper
      .findAll('button')
      .find((button) => button.text().includes('刷新收藏并查询'));
    expect(refresh).toBeDefined();
    await refresh!.trigger('click');
    await nextTick();
    expect(rankingExecute).toHaveBeenCalledTimes(2);
    expect(detailExecute).toHaveBeenCalledOnce();

    const search = wrapper.get<HTMLInputElement>(
      'input[name="workSearch"]',
    );
    await search.setValue('刷新后作品');
    await wrapper.get('form.person-item-toolbar').trigger('submit');
    await flushPromises();
    await wrapper
      .get('.person-item-toolbar .ranking-order-button')
      .trigger('click');
    await flushPromises();
    expect(detailExecute).toHaveBeenCalledOnce();
    expect(wrapper.text()).not.toContain('请先选择排行中的人物');
    expect(wrapper.text()).not.toContain('请先完成一次人物排行查询');

    const rankingRequestB = rankingExecute.mock.calls[1]![0];
    rankingRefreshB.resolve({
      payload: rankingPayload(
        'server-ranking-b',
        'count',
        versionB,
        fetchedAtB,
      ),
      requestId: 'server-ranking-b',
      transactionId: rankingRequestB.transactionId,
    });
    await flushPromises();
    await vi.waitFor(() => {
      expect(detailExecute).toHaveBeenCalledTimes(2);
    });
    const compoundView = detailExecute.mock.calls[1]![0].view;
    expect(compoundView).toMatchObject({
      order: 'asc',
      search: '刷新后作品',
    });

    const share = wrapper.get(
      'button[aria-label="复制当前查询链接"]',
    );
    await share.trigger('click');
    await flushPromises();
    let link = (
      wrapper.get(
        '.share-fallback__content input',
      ).element as HTMLInputElement
    ).value;
    let shared = readShare('/ranking', new URL(link).hash);
    expect(
      shared.workspace.kind === 'ranking'
        ? shared.workspace.detail
        : null,
    ).toBeUndefined();

    const detailRequestB = detailExecute.mock.calls[1]![0];
    detailRefreshB.resolve({
      payload: detailPayload(versionB, fetchedAtB),
      requestId: 'server-detail-b',
      transactionId: detailRequestB.transactionId,
    });
    await flushPromises();
    await share.trigger('click');
    await flushPromises();
    link = (
      wrapper.get(
        '.share-fallback__content input',
      ).element as HTMLInputElement
    ).value;
    shared = readShare('/ranking', new URL(link).hash);
    expect(
      shared.workspace.kind === 'ranking'
        ? shared.workspace.detail
        : null,
    ).toMatchObject({
      input: { personId: 12 },
      view: compoundView,
    });

    await wrapper.get('.query-summary').trigger('click');
    await nextTick();
    refresh = wrapper
      .findAll('button')
      .find((button) => button.text().includes('刷新收藏并查询'));
    expect(refresh).toBeDefined();
    await refresh!.trigger('click');
    await nextTick();
    expect(rankingExecute).toHaveBeenCalledTimes(3);
    expect(detailExecute).toHaveBeenCalledTimes(2);

    const rankingRequestC = rankingExecute.mock.calls[2]![0];
    rankingRefreshC.resolve({
      payload: rankingPayload(
        'server-ranking-c',
        'count',
        versionC,
        fetchedAtC,
      ),
      requestId: 'server-ranking-c',
      transactionId: rankingRequestC.transactionId,
    });
    await flushPromises();
    await vi.waitFor(() => {
      expect(detailExecute).toHaveBeenCalledTimes(3);
    });
    expect(detailExecute.mock.calls[2]![0].view).toEqual(
      compoundView,
    );
    expect(detailExecute).toHaveBeenCalledTimes(3);

    await share.trigger('click');
    await flushPromises();
    link = (
      wrapper.get(
        '.share-fallback__content input',
      ).element as HTMLInputElement
    ).value;
    shared = readShare('/ranking', new URL(link).hash);
    expect(
      shared.workspace.kind === 'ranking'
        ? shared.workspace.detail
        : null,
    ).toMatchObject({
      input: { personId: 12 },
      view: compoundView,
    });
    wrapper.unmount();
  });

  it('closes only the compact drawer while preserving the selected person and accepted detail', async () => {
    const media = installCompactLayout(true);
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
    const row = wrapper.get<HTMLButtonElement>('.ranked-person-row');
    row.element.focus();
    await row.trigger('click');
    await flushPromises();

    expect(personExecute).toHaveBeenCalledOnce();
    expect(row.attributes('aria-current')).toBe('true');
    expect(row.attributes('aria-controls')).toBe('person-detail-panel');
    expect(row.attributes('aria-expanded')).toBe('true');
    expect(
      wrapper.get('[data-app-root]').attributes(),
    ).toMatchObject({
      'aria-hidden': 'true',
      inert: 'true',
    });
    const close = document.body.querySelector<HTMLButtonElement>(
      '.person-detail-drawer__bar button',
    )!;
    expect(close).not.toBeNull();
    expect(document.activeElement).toBe(close);
    close.click();
    await flushPromises();

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
    expect(
      wrapper.get('[data-app-root]').attributes('inert'),
    ).toBe('true');

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

  it('preserves accepted Inspector state across modes and clears it only for a successful changed query', async () => {
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

    await wrapper.get('.ranked-person-row').trigger('click');
    await flushPromises();
    expect(personExecute).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(
        document.body.querySelector('.person-detail-drawer'),
      ).not.toBeNull();
    });
    expect(
      document.body.querySelector('.person-detail-drawer'),
    ).not.toBeNull();

    await wrapper.get('#mode-tab-co-star').trigger('click');
    await flushPromises();
    expect(
      document.body.querySelector('.person-detail-drawer'),
    ).toBeNull();

    await wrapper.get('#mode-tab-ranking').trigger('click');
    await flushPromises();
    let row = wrapper.get('.ranked-person-row');
    expect(row.attributes('aria-current')).toBe('true');
    expect(row.attributes('aria-expanded')).toBeUndefined();
    expect(wrapper.text()).toContain('林明');

    await row.trigger('click');
    await flushPromises();
    expect(personExecute).toHaveBeenCalledTimes(1);

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
    expect(
      document.body.querySelector('.person-detail-drawer'),
    ).toBeNull();
    row = wrapper.get('.ranked-person-row');
    expect(row.attributes('aria-current')).toBeUndefined();
    expect(row.attributes('aria-expanded')).toBeUndefined();

    await row.trigger('click');
    await flushPromises();
    expect(personExecute).toHaveBeenCalledTimes(2);
    wrapper.unmount();
    vi.unstubAllGlobals();
  });
});
