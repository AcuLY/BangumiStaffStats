import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import type { RankingPayload } from '../../src/api/adapters/rankings';
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
});
