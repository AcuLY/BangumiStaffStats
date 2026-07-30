import { mount } from '@vue/test-utils';
import { NNumberAnimation, NPagination } from 'naive-ui';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RankingPayload } from '../../../src/api/adapters/rankings';
import AdaptivePagination from '../../../src/features/ranking/components/AdaptivePagination.vue';
import RankedPersonList from '../../../src/features/ranking/components/RankedPersonList.vue';
import RankingResults from '../../../src/features/ranking/components/RankingResults.vue';
import type { RankingView } from '../../../src/features/ranking/model';

const personalPayload: RankingPayload = Object.freeze({
  collection: Object.freeze({
    fetchedAt: '2026-07-25T00:00:00Z',
    stale: false,
    warningCodes: Object.freeze([]),
  }),
  dataVersion: `dv1-${'a'.repeat(64)}`,
  items: Object.freeze([
    Object.freeze({
      average: 825,
      overall: 677,
      person: Object.freeze({
        id: 12,
        name: 'Hayashi Akira',
        nameCN: '林明',
      }),
      preference: Object.freeze({
        comparableCount: 6,
        comparableSeriesCount: 6,
        effectiveEvidence: 6,
        evidenceWeight: Object.freeze({
          denominator: '11',
          numerator: '6',
        }),
        mean: Object.freeze({ denominator: '2', numerator: '1' }),
        score: Object.freeze({ denominator: '11', numerator: '3' }),
      }),
      rank: 2,
      workCount: 7,
    }),
    Object.freeze({
      average: null,
      overall: null,
      person: Object.freeze({
        id: 88,
        name: 'No Ratings',
        nameCN: null,
      }),
      preference: null,
      rank: 8,
      workCount: 1,
    }),
  ]),
  metricScale: Object.freeze({
    kind: 'linear',
    max: Object.freeze({ denominator: '5', numerator: '3' }),
    metric: 'preference',
  }),
  pagination: Object.freeze({
    page: 1,
    pageSize: 10,
    total: 2,
  }),
  requestId: 'server-ranking',
  scope: 'personal',
  summary: Object.freeze({
    personCount: 8,
    workCount: 21,
    workUnit: 'subject',
  }),
});

const defaultView: RankingView = Object.freeze({
  order: 'desc',
  page: 1,
  pageSize: 10,
  search: '',
  sort: 'preference',
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ranked person list', () => {
  it('renders backend ranks, nullable metrics, proxy images, and personal preference', () => {
    const wrapper = mount(RankedPersonList, {
      props: {
        devicePixelRatio: 2,
        items: personalPayload.items,
        metricScale: personalPayload.metricScale,
        personal: true,
        sort: 'preference',
        workUnit: 'subject',
      },
    });
    const rows = wrapper.findAll('button.ranked-person-row');

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.get('.ranked-person-row__rank').text())).toEqual([
      '2',
      '8',
    ]);
    expect(rows[0]!.text()).toContain('林明');
    expect(rows[0]!.text()).toContain('+0.27');
    expect(rows[1]!.text()).toContain('—');
    expect(rows[0]!.attributes('aria-label')).toContain('综合分 6.77');
    expect(rows[0]!.get('img').attributes('src')).toBe(
      '/api/v1/images/bangumi/persons/12?type=small',
    );
  });

  it('omits the preference column entirely in global mode', () => {
    const items = personalPayload.items.map(({ preference: _, ...item }) => item);
    const wrapper = mount(RankedPersonList, {
      props: {
        items,
        metricScale: {
          kind: 'linear',
          max: 7,
          metric: 'count',
        },
        personal: false,
        sort: 'count',
        workUnit: 'series',
      },
    });

    expect(wrapper.text()).not.toContain('偏好');
    expect(wrapper.text()).not.toContain('相对偏好');
    expect(wrapper.get('.ranking-columns__metrics').findAll('span')).toHaveLength(
      3,
    );
  });
});

describe('ranking result surface', () => {
  it('preserves summary and toolbar while a view request is pending', () => {
    const wrapper = mount(RankingResults, {
      props: {
        executeView: vi.fn(async () => true),
        resource: {
          error: null,
          payload: personalPayload,
          phase: 'ready',
          view: defaultView,
          viewPending: true,
        },
        retry: vi.fn(async () => true),
      },
    });

    expect(wrapper.text()).toContain('共统计到');
    expect(
      wrapper
        .findAllComponents(NNumberAnimation)
        .map((statistic) => statistic.props('to')),
    ).toEqual([8, 21]);
    expect(wrapper.find('input[name="ranking-search"]').exists()).toBe(true);
    expect(wrapper.find('.ranking-view-pending').exists()).toBe(true);
    expect(wrapper.find('.ranked-person-row').exists()).toBe(false);
    expect(wrapper.find('.ranking-pagination-skeleton').exists()).toBe(true);
  });

  it('debounces search as a server view request and resets page to one', async () => {
    vi.useFakeTimers();
    const executeView = vi.fn(async () => true);
    const wrapper = mount(RankingResults, {
      props: {
        executeView,
        resource: {
          error: null,
          payload: personalPayload,
          phase: 'ready',
          view: Object.freeze({ ...defaultView, page: 4 }),
          viewPending: false,
        },
        retry: vi.fn(async () => true),
      },
    });

    await wrapper.get('input[name="ranking-search"]').setValue('林');
    expect(executeView).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(240);
    expect(executeView).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        search: '林',
      }),
    );
  });

  it('keeps the complete summary for a search-empty page', () => {
    const wrapper = mount(RankingResults, {
      props: {
        executeView: vi.fn(async () => true),
        resource: {
          error: null,
          payload: Object.freeze({
            ...personalPayload,
            items: Object.freeze([]),
            pagination: Object.freeze({
              page: 1,
              pageSize: 10,
              total: 0,
            }),
          }),
          phase: 'ready',
          view: Object.freeze({ ...defaultView, search: '无人' }),
          viewPending: false,
        },
        retry: vi.fn(async () => true),
      },
    });

    expect(wrapper.text()).toContain('没有符合搜索条件的人物');
    expect(wrapper.text()).toContain('共统计到');
    expect(
      wrapper
        .findAllComponents(NNumberAnimation)
        .map((statistic) => statistic.props('to')),
    ).toEqual([8, 21]);
  });
});

describe('adaptive pagination', () => {
  it('emits backend page and page-size choices without deriving totals', async () => {
    const wrapper = mount(AdaptivePagination, {
      props: {
        itemCount: 10,
        page: 2,
        pageSize: 10,
        total: 98,
      },
    });

    expect(wrapper.text()).toContain('11—20 / 98');
    const paginations = wrapper.findAllComponents(NPagination);
    expect(paginations).toHaveLength(2);
    paginations[0]!.vm.$emit('update:page', 3);
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('page')).toEqual([[3]]);
    paginations[1]!.vm.$emit('update:page-size', 20);
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('pageSize')).toEqual([[20]]);
  });
});
