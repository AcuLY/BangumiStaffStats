import { createPinia, setActivePinia } from 'pinia';
import { NSelect } from 'naive-ui';
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

    await row.trigger('click');
    await flushPromises();

    expect(personExecute).toHaveBeenCalledOnce();
    expect(row.attributes('aria-current')).toBe('true');
    expect(row.attributes('aria-controls')).toBe('person-detail-panel');
    expect(row.attributes('aria-expanded')).toBe('true');
    expect(
      document.body.querySelector('.person-detail-drawer'),
    ).not.toBeNull();

    media.setMatches(false);
    await flushPromises();

    expect(
      document.body.querySelector('.person-detail-drawer'),
    ).toBeNull();
    expect(wrapper.find('.person-detail-surface').exists()).toBe(true);
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

  it('clears the hidden selection and detail on mode switch and successful query apply', async () => {
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
    expect(row.attributes('aria-current')).toBeUndefined();
    expect(row.attributes('aria-expanded')).toBeUndefined();

    await row.trigger('click');
    await flushPromises();
    expect(personExecute).toHaveBeenCalledTimes(2);

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
    expect(personExecute).toHaveBeenCalledTimes(3);
    wrapper.unmount();
    vi.unstubAllGlobals();
  });
});
