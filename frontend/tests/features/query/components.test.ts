import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from '../../../src/app/App.vue';
import type { CatalogApi } from '../../../src/api/catalog';
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
    const candidateExecute = vi.fn(async (request) => ({
      payload: { id: String(request.input.positionKey) },
      requestId: `server-${request.transactionId}`,
      transactionId: request.transactionId,
    }));
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
    expect(uid.attributes('aria-describedby')).toBe('query-error-uid');
    expect(wrapper.get('#query-error-uid').text()).not.toBe('');
    const uidFrame = uid.element.closest<HTMLElement>('.n-input')!;
    const sourceGroup = wrapper.get('.query-source-switch');
    const sourceLabel = wrapper.get('.n-radio-button');
    expect(uidFrame.style.getPropertyValue('--n-height')).toBe('44px');
    expect(
      (sourceGroup.element as HTMLElement).style.getPropertyValue('--n-height'),
    ).toBe('44px');
    expect(sourceLabel.classes()).toContain('n-radio-button');

    const disclosure = wrapper.get(
      'button[aria-controls="query-advanced-panel"]',
    );
    expect(disclosure.attributes('aria-expanded')).toBe('false');
    await disclosure.trigger('click');
    expect(disclosure.attributes('aria-expanded')).toBe('true');
    expect(wrapper.find('#query-advanced-panel').exists()).toBe(true);
    expect(store.fieldErrors).toHaveProperty('uid');
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
