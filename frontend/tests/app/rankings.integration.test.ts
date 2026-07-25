import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import type { RankingPayload } from '../../src/api/adapters/rankings';
import type { PersonDetailPayload } from '../../src/api/adapters/personDetail';
import type { CatalogApi } from '../../src/api/catalog';
import App from '../../src/app/App.vue';
import type { QueryDrivers } from '../../src/features/query/coordinator';
import { useQueryStore } from '../../src/features/query/store';
import { catalogFixture } from '../features/query/fixtures';

function rankingPayload(
  requestId: string,
  metric: 'average' | 'count',
): RankingPayload {
  return Object.freeze({
    collection: Object.freeze({
      fetchedAt: '2026-07-25T00:00:00Z',
      stale: false,
      warningCodes: Object.freeze([]),
    }),
    dataVersion: `dv1-${'d'.repeat(64)}`,
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

function detailPayload(): PersonDetailPayload {
  const buckets = Array.from({ length: 10 }, (_, index) => ({
    count: index === 7 ? 1 : 0,
    examples: [],
    hiddenCount: 0,
    score: index + 1,
  })) as never;
  return Object.freeze({
    dataVersion: `dv1-${'e'.repeat(64)}`,
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

describe('App ranking production slice', () => {
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

    await wrapper.get('.ranking-sort-control select').setValue('average');
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

  it('opens a selected row in the compact drawer and restores focus to that exact trigger', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        addEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: true,
        media: '(width < 780px)',
        onchange: null,
        removeEventListener: vi.fn(),
      })),
    );
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
    const close = document.body.querySelector<HTMLButtonElement>(
      '.person-detail-drawer__bar button',
    )!;
    expect(close).not.toBeNull();
    expect(document.activeElement).toBe(close);
    close.click();
    await flushPromises();

    expect(document.activeElement).toBe(row.element);
    expect(row.attributes('aria-current')).toBeUndefined();
    wrapper.unmount();
    vi.unstubAllGlobals();
  });
});
