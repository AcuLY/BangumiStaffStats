import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from '../../../src/app/App.vue';
import type { CatalogApi } from '../../../src/api/catalog';
import type {
  CandidatePayload as ApiCandidatePayload,
} from '../../../src/api/adapters/candidates';
import type { RankingPayload } from '../../../src/api/adapters/rankings';
import AppHeader from '../../../src/features/query/components/AppHeader.vue';
import {
  createQueryCoordinator,
  type OperationResponse,
  type QueryDrivers,
} from '../../../src/features/query/coordinator';
import type { AppliedQuery } from '../../../src/features/query/model';
import { createShareUrl } from '../../../src/features/query/share';
import { useQueryStore } from '../../../src/features/query/store';
import { catalogFixture } from './fixtures';

interface CandidatePayload {
  id: string;
}

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
  positionKey: string,
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
      Object.freeze({ count: 0, positionKey }),
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
  it('keeps the last successful share enabled while a refresh is pending', async () => {
    const store = validStore();
    let resolveRefresh!: (response: OperationResponse<RankingPayload>) => void;
    let refreshTransactionId = '';
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
            refreshTransactionId = request.transactionId;
            resolveRefresh = resolve;
          }),
      );
    const coordinator = createQueryCoordinator(store, drivers(execute));
    const catalog = catalogFixture();
    await coordinator.execute({ catalog, mode: 'ranking' });
    const refresh = coordinator.execute({
      catalog,
      mode: 'ranking',
      refreshCollection: true,
    });

    const wrapper = mount(AppHeader, {
      attachTo: document.body,
      props: {
        coordinator,
        mode: 'ranking',
        navigate: vi.fn(),
        queryStore: store,
        targetWindow: window,
        theme: 'light',
        toggleTheme: vi.fn(),
      },
    });

    expect(coordinator.rankings.phase).toBe('pending');
    expect(
      wrapper.get('button[aria-label="复制当前查询链接"]').attributes(
        'disabled',
      ),
    ).toBeUndefined();
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
    expect(
      (
        wrapper.get('button[aria-label="复制当前查询链接"]')
          .element as HTMLElement
      ).style.getPropertyValue('--n-height'),
    ).toBe('38px');

    coordinator.cancelPending();
    resolveRefresh({
      payload: rankingPayload('server-late'),
      requestId: 'server-late',
      transactionId: refreshTransactionId,
    });
    await refresh;
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
    wrapper.unmount();
  });

  it('replays the candidate identity installed by a valid co-star share', async () => {
    installMatchMedia((query) => query === '(width < 780px)');
    const sharedQuery: AppliedQuery = {
      scope: 'personal',
      uid: 'luca',
      collectionStatuses: ['completed'],
      subjectType: 'anime',
      positionKeys: ['staff:anime:2', 'staff:anime:101'],
      includeNSFW: false,
      mergeSeries: false,
    };
    const sharedUrl = createShareUrl(
      new URL(`${window.location.origin}/co-star`),
      '/co-star',
      sharedQuery,
      {
        kind: 'co-star',
        state: 'empty',
        candidates: {
          input: { positionKey: 'staff:anime:101' },
          view: {
            order: 'desc',
            page: 1,
            pageSize: 10,
            search: '',
            sort: 'count',
          },
        },
      },
    );
    window.history.replaceState({}, '', sharedUrl);
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
          .find(
            '.app-header__mobile-context .co-star-mobile-entry',
          )
          .exists(),
      ).toBe(true);
    });
    expect(
      wrapper
        .find('.app-header__mobile-context .co-star-mobile-entry')
        .exists(),
    ).toBe(true);
    expect(window.location.hash).toBe('');
    wrapper.unmount();
  });

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
});
