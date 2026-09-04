import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { mount } from '@vue/test-utils';
import {
  NButton,
  NInput,
  NNumberAnimation,
  NPagination,
  NSelect,
  NSkeleton,
} from 'naive-ui';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RankingPayload } from '../../../src/api/adapters/rankings';
import AdaptivePagination from '../../../src/features/ranking/components/AdaptivePagination.vue';
import RankedPersonList from '../../../src/features/ranking/components/RankedPersonList.vue';
import RankingResults from '../../../src/features/ranking/components/RankingResults.vue';
import RankingToolbar from '../../../src/features/ranking/components/RankingToolbar.vue';
import SortDirectionButton from '../../../src/features/ranking/components/SortDirectionButton.vue';
import type { RankingView } from '../../../src/features/ranking/model';
import AppIcon from '../../../src/shared/components/AppIcon.vue';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);

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
  vi.unstubAllGlobals();
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
    expect(
      rows.map((row) => [
        row.get('.ranked-person-row__identity strong').text(),
        row.get('.ranked-person-row__identity small').text(),
      ]),
    ).toEqual([
      ['林明', 'Hayashi Akira'],
      ['No Ratings', 'No Ratings'],
    ]);
    expect(
      rows.map((row) =>
        row.get('.ranked-person-row__identity').attributes('title'),
      ),
    ).toEqual(['林明\nHayashi Akira', 'No Ratings\nNo Ratings']);
    expect(rows[0]!.attributes('aria-label')).toContain('综合分 6.77');
    expect(rows[1]!.attributes('aria-label')).toContain(
      '8. No Ratings，No Ratings',
    );
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

  it('shares compact one-line tracks and preserves the narrow two-line map', () => {
    const baseCss = fs.readFileSync(
      path.join(repositoryRoot, 'frontend/src/shared/styles/base.css'),
      'utf8',
    );

    expect(baseCss).toMatch(
      /\.ranking-workspace \.ranked-person-row,\s*\.ranking-workspace \.ranking-row-skeleton\s*\{[^}]*grid-template-areas:\s*"rank avatar identity metrics";/s,
    );
    expect(baseCss).toMatch(
      /@container ranking-pane \(max-width: 380px\)[\s\S]*?\.ranking-workspace \.ranked-person-row,\s*\.ranking-workspace \.ranking-row-skeleton\s*\{[^}]*grid-template-areas:\s*"rank avatar identity"\s*"\. metrics metrics";[^}]*grid-template-columns:\s*22px 36px minmax\(0, 1fr\);/,
    );
  });
});

describe('ranking result surface', () => {
  it.each([
    {
      label: 'personal subject',
      metricCount: 4,
      pendingPersonal: true,
    },
    {
      label: 'global series',
      metricCount: 3,
      pendingPersonal: false,
    },
  ] as const)(
    'mirrors the $label ready regions with direct NSkeleton leaves while core pending',
    ({ pendingPersonal, metricCount }) => {
      const wrapper = mount(RankingResults, {
        props: {
          executeView: vi.fn(async () => true),
          pendingPersonal,
          resource: {
            error: null,
            payload: null,
            phase: 'pending',
            view: Object.freeze({
              ...defaultView,
              sort: pendingPersonal ? 'preference' : 'count',
            }),
            viewPending: false,
          },
          retry: vi.fn(async () => true),
        },
      });

      const pending = wrapper.get('.ranking-surface--loading');
      expect(pending.attributes('aria-busy')).toBe('true');
      expect(pending.get('[role="status"]').text()).toBe(
        '正在加载人物排行',
      );
      expect(wrapper.findAll('[role="status"]')).toHaveLength(1);
      expect(wrapper.find('.ranking-skeleton__summary').exists()).toBe(true);
      expect(wrapper.find('.ranking-skeleton__toolbar').exists()).toBe(true);
      expect(wrapper.find('.ranking-columns').exists()).toBe(true);
      expect(wrapper.findAll('.ranking-row-skeleton')).toHaveLength(
        defaultView.pageSize,
      );
      expect(wrapper.find('.ranking-pagination-skeleton').exists()).toBe(true);
      expect(
        wrapper.get('.ranking-columns__metrics').findAll(':scope > span'),
      ).toHaveLength(metricCount);
      expect(wrapper.find('.ranking-skeleton__column-label').exists()).toBe(true);
      expect(
        wrapper.get('.ranking-row-skeleton__metrics').findAll(':scope > span'),
      ).toHaveLength(metricCount);
      expect(wrapper.findAll('button, input, select')).toHaveLength(0);
      expect(wrapper.findComponent(RankingToolbar).exists()).toBe(false);
      expect(wrapper.findComponent(AdaptivePagination).exists()).toBe(false);
      expect(wrapper.findAllComponents(NNumberAnimation)).toHaveLength(0);
      expect(wrapper.find('.ranked-person-row').exists()).toBe(false);
      expect(wrapper.text()).not.toMatch(/共统计到|林明|0 个人物|0 个条目/);
      expect(wrapper.get('.ranking-controls').attributes('aria-hidden')).toBe(
        'true',
      );
      expect(
        wrapper.get('.ranking-list-scroll').attributes('aria-hidden'),
      ).toBe('true');

      const skeletons = wrapper.findAllComponents(NSkeleton);
      expect(skeletons.length).toBeGreaterThan(0);
      for (const skeleton of skeletons) {
        expect(skeleton.classes()).toContain('app-skeleton');
      }
    },
  );

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
    expect(wrapper.findAllComponents(NSkeleton).length).toBeGreaterThan(0);
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

  it('renders a complete-zero result with the same plain page hierarchy', () => {
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
            summary: Object.freeze({
              personCount: 0,
              workCount: 0,
              workUnit: 'subject',
            }),
          }),
          phase: 'ready',
          view: defaultView,
          viewPending: false,
        },
        retry: vi.fn(async () => true),
      },
    });

    const state = wrapper.get('.ranking-page-empty-state');
    expect(state.text()).toContain('没有符合查询条件的人物');
    expect(state.classes()).toContain('query-result-state');
    expect(state.classes()).not.toContain('surface-panel');
    expect(wrapper.find('.ranking-controls').exists()).toBe(false);
    expect(wrapper.findComponent(RankingToolbar).exists()).toBe(false);
    expect(wrapper.find('input[name="ranking-search"]').exists()).toBe(false);
    expect(wrapper.find('.ranking-columns').exists()).toBe(false);
    expect(wrapper.find('.ranked-person-list').exists()).toBe(false);
    expect(wrapper.find('.ranking-surface__footer').exists()).toBe(false);
    expect(wrapper.findComponent(AdaptivePagination).exists()).toBe(false);
    expect(wrapper.findAllComponents(NNumberAnimation)).toHaveLength(0);
    expect(wrapper.text()).not.toMatch(/共统计到|0 个人物|0 个条目/);
  });

  it('keeps the complete summary and recovery controls for a search-empty page', () => {
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
    expect(wrapper.find('.ranking-controls').exists()).toBe(true);
    expect(wrapper.findComponent(RankingToolbar).exists()).toBe(true);
    expect(wrapper.find('input[name="ranking-search"]').exists()).toBe(true);
    expect(wrapper.find('.ranking-surface__footer').exists()).toBe(true);
    expect(wrapper.findComponent(AdaptivePagination).exists()).toBe(true);
    expect(wrapper.find('.ranked-person-row').exists()).toBe(false);
  });
});

describe('adaptive pagination', () => {
  it('accepts an explicit public control size without changing its label', () => {
    const wrapper = mount(SortDirectionButton, {
      props: { order: 'desc', size: 'small' },
    });

    expect(wrapper.get('button').classes()).toContain('n-button--small-type');
    expect(wrapper.get('button').attributes('aria-label')).toBe(
      '排序方向：当前降序，切换为升序',
    );
    expect(wrapper.getComponent(AppIcon).props('name')).toBe('arrow-down');
    expect(wrapper.getComponent(NButton).props('themeOverrides')).toMatchObject({
      color: 'var(--control-background)',
      colorDisabled: 'var(--control-background)',
      colorFocus: 'var(--control-background)',
      colorHover: 'var(--control-background)',
      colorPressed: 'var(--control-background)',
    });
  });

  it.each([
    { compact: false, size: 'medium', sizeClass: 'n-button--medium-type' },
    { compact: true, size: 'small', sizeClass: 'n-button--small-type' },
  ] as const)(
    'uses one public $size size across the ranking toolbar',
    async ({ compact, size, sizeClass }) => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({
          addEventListener: vi.fn(),
          matches: compact,
          media: '(width < 780px)',
          onchange: null,
          removeEventListener: vi.fn(),
        })),
      );
      const wrapper = mount(RankingToolbar, {
        props: {
          personal: true,
          search: '',
          view: defaultView,
          workUnit: 'subject',
        },
      });
      await wrapper.vm.$nextTick();

      expect(wrapper.getComponent(NInput).props('size')).toBe(size);
      expect(wrapper.getComponent(NSelect).props('size')).toBe(size);
      expect(wrapper.get('.ranking-order-button').classes()).toContain(
        sizeClass,
      );
    },
  );

  it('keeps public visible sizes separate from 44px toolbar and page targets', () => {
    const personCss = fs.readFileSync(
      path.join(
        repositoryRoot,
        'frontend/src/features/person-detail/person-detail.css',
      ),
      'utf8',
    );
    const baseCss = fs.readFileSync(
      path.join(repositoryRoot, 'frontend/src/shared/styles/base.css'),
      'utf8',
    );

    expect(personCss).toMatch(
      /\.ranking-workspace \.ranking-toolbar\s*\{[^}]*--ranking-toolbar-visible-size:\s*34px;[^}]*align-items:\s*center;/s,
    );
    expect(personCss).toMatch(
      /\.ranking-workspace\s+\.ranking-toolbar\s+:is\(\.ranking-search-control, \.ranking-sort-control, \.ranking-order-button\)\s*\{[^}]*position:\s*relative;[^}]*min-height:\s*0;[^}]*align-self:\s*center;/s,
    );
    expect(personCss).toMatch(
      /\.ranking-workspace\s+\.ranking-toolbar\s+\.ranking-search-control\s+input\s*\{[^}]*min-height:\s*0;/s,
    );
    expect(personCss).toMatch(
      /\.ranking-workspace\s+\.ranking-toolbar\s+:is\([\s\S]*?\.ranking-search-control,[\s\S]*?\.ranking-sort-control,[\s\S]*?\.ranking-order-button[\s\S]*?\)::before\s*\{[^}]*inset-block:\s*calc\(\s*\(var\(--touch-target\) - var\(--ranking-toolbar-visible-size\)\) \/ -2\s*\);[^}]*inset-inline:\s*0;/s,
    );
    expect(personCss).toMatch(
      /@media \(width < 780px\)[\s\S]*?\.ranking-workspace \.ranking-toolbar\s*\{[^}]*--ranking-toolbar-visible-size:\s*28px;/,
    );
    expect(baseCss).toMatch(
      /\.adaptive-pagination \.adaptive-pagination__button\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;[^}]*height:\s*100%;[^}]*min-height:\s*0;/s,
    );
    expect(baseCss).toMatch(
      /\.adaptive-pagination \.adaptive-pagination__button::before\s*\{[^}]*top:\s*50%;[^}]*left:\s*50%;[^}]*width:\s*max\(100%, var\(--touch-target\)\);[^}]*height:\s*max\(100%, var\(--touch-target\)\);[^}]*transform:\s*translate\(-50%, -50%\);/s,
    );
    expect(baseCss).not.toContain('.adaptive-pagination .n-pagination-item');
    expect(baseCss).toMatch(
      /\.ranking-order-button\s*\{[^}]*background:\s*var\(--control-background\);/s,
    );
    expect(baseCss).toMatch(
      /:root\s*\{[^}]*--control-background:\s*rgb\(255 255 255\);/s,
    );
    expect(baseCss).toMatch(
      /:root\[data-theme="dark"\]\s*\{[^}]*--control-background:\s*rgb\(255 255 255 \/ 10%\);/s,
    );
    expect(baseCss).toMatch(
      /\.adaptive-pagination__pages\s*\{[^}]*box-sizing:\s*border-box;[^}]*padding-inline:\s*5px;/s,
    );
    expect(baseCss).toMatch(
      /@media \(width < 780px\)[\s\S]*?\.adaptive-pagination__pages\s*\{[^}]*padding-inline:\s*8px;/,
    );
    expect(personCss).toMatch(
      /\.ranking-workspace \.adaptive-pagination__control--tools\s*\{[^}]*grid-column:\s*1 \/ -1;[^}]*grid-row:\s*2;[^}]*max-width:\s*100%;[^}]*flex-wrap:\s*wrap;/s,
    );
    expect(personCss).toMatch(
      /@container ranking-pane \(max-width: 340px\)[\s\S]*?\.ranking-workspace \.ranking-pagination\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);[\s\S]*?\.ranking-workspace \.ranking-pagination__pages\s*\{[^}]*grid-column:\s*1;[^}]*grid-row:\s*2;[\s\S]*?\.ranking-workspace \.adaptive-pagination__control--tools\s*\{[^}]*grid-row:\s*3;/,
    );
  });

  it('resets shared pagination placement while preserving stronger consumer layouts', () => {
    const baseCss = fs.readFileSync(
      path.join(repositoryRoot, 'frontend/src/shared/styles/base.css'),
      'utf8',
    );
    const personCss = fs.readFileSync(
      path.join(
        repositoryRoot,
        'frontend/src/features/person-detail/person-detail.css',
      ),
      'utf8',
    );
    const coStarCss = fs.readFileSync(
      path.join(
        repositoryRoot,
        'frontend/src/features/co-star/co-star.css',
      ),
      'utf8',
    );

    expect(baseCss).toMatch(
      /\.adaptive-pagination__summary\s*\{[^}]*grid-column:\s*auto;[^}]*grid-row:\s*auto;/s,
    );
    expect(baseCss).toMatch(
      /\.adaptive-pagination__pages\s*\{[^}]*grid-column:\s*auto;[^}]*grid-row:\s*auto;/s,
    );
    expect(baseCss).toMatch(
      /\.adaptive-pagination__control--pages\s*\{[^}]*flex-wrap:\s*nowrap;/s,
    );
    expect(baseCss).toMatch(
      /\.adaptive-pagination__control--tools\s*\{[^}]*grid-column:\s*auto;[^}]*grid-row:\s*auto;[^}]*flex-wrap:\s*wrap;[^}]*row-gap:\s*var\(--space-2\);/s,
    );
    expect(personCss).toMatch(
      /\.ranking-workspace \.adaptive-pagination__control--tools\s*\{[^}]*grid-column:\s*1 \/ -1;[^}]*grid-row:\s*2;/s,
    );
    expect(coStarCss).toMatch(
      /\.candidate-footer \.ranking-pagination__pages\s*\{[^}]*grid-column:\s*1 \/ -1;/s,
    );
  });

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
    const navigation = wrapper.get('.adaptive-pagination').element;
    expect(
      [
        wrapper.get('.adaptive-pagination__summary').element,
        wrapper.get('.adaptive-pagination__pages').element,
        wrapper.get('.adaptive-pagination__control--tools').element,
      ].map((element) =>
        Array.from(navigation.children).indexOf(element),
      ),
    ).toEqual([0, 1, 2]);
    const paginations = wrapper.findAllComponents(NPagination);
    expect(paginations).toHaveLength(2);
    paginations[0]!.vm.$emit('update:page', 3);
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('page')).toEqual([[3]]);
    paginations[1]!.vm.$emit('update:page-size', 20);
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('pageSize')).toEqual([[20]]);
  });

  it('renders native named page actions with current and disabled state', async () => {
    const wrapper = mount(AdaptivePagination, {
      props: {
        itemCount: 10,
        page: 50,
        pageSize: 10,
        total: 1_000,
      },
    });
    await wrapper.vm.$nextTick();

    const buttons = wrapper.findAll('button.adaptive-pagination__button');
    expect(buttons.length).toBeGreaterThan(5);
    expect(
      buttons.every(
        (button) =>
          button.element.tagName === 'BUTTON' &&
          button.attributes('type') === 'button' &&
          Boolean(button.attributes('aria-label')),
      ),
    ).toBe(true);
    expect(
      wrapper
        .findAllComponents(NPagination)[0]!
        .props('themeOverrides'),
    ).toMatchObject({
      itemMarginMedium: '0 0 0 10px',
      itemMarginMediumRtl: '0 10px 0 0',
      itemPaddingMedium: '0',
      itemSizeMedium: '34px',
    });
    const pageControl = wrapper.get<HTMLElement>(
      '.adaptive-pagination__control--pages',
    ).element;
    expect(pageControl.style.getPropertyValue('--n-item-size')).toBe('34px');
    expect(pageControl.style.getPropertyValue('--n-item-margin')).toBe(
      '0 0 0 10px',
    );

    const current = wrapper.get(
      'button.adaptive-pagination__button--page[aria-current="page"]',
    );
    expect(current.attributes()).toHaveProperty('disabled');
    (current.element as HTMLButtonElement).click();
    expect(wrapper.emitted('page')).toBeUndefined();

    const nextPage = wrapper
      .findAll('button.adaptive-pagination__button--page')
      .find((button) => !button.attributes('disabled'));
    expect(nextPage).toBeDefined();
    const nextPageNumber = Number(nextPage!.text());
    (nextPage!.element as HTMLButtonElement).click();
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('page')).toEqual([[nextPageNumber]]);

    const fastJump = wrapper.get(
      'button.adaptive-pagination__button--fast-jump',
    );
    (fastJump.element as HTMLButtonElement).click();
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('page')).toHaveLength(2);
  });

  it('uses public compact item geometry to keep 44px targets non-overlapping', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        addEventListener: vi.fn(),
        matches: true,
        removeEventListener: vi.fn(),
      })),
    );
    const wrapper = mount(AdaptivePagination, {
      props: {
        itemCount: 10,
        page: 5,
        pageSize: 10,
        total: 1_000,
      },
    });
    await wrapper.vm.$nextTick();

    const overrides = wrapper
      .findAllComponents(NPagination)[0]!
      .props('themeOverrides') as Record<string, string>;
    expect(overrides).toMatchObject({
      itemMarginSmall: '0 0 0 16px',
      itemMarginSmallRtl: '0 16px 0 0',
      itemPaddingSmall: '0',
      itemSizeSmall: '28px',
    });
    const pageControl = wrapper.get<HTMLElement>(
      '.adaptive-pagination__control--pages',
    ).element;
    expect(pageControl.style.getPropertyValue('--n-item-size')).toBe('28px');
    expect(pageControl.style.getPropertyValue('--n-item-margin')).toBe(
      '0 0 0 16px',
    );
    expect(
      Number.parseFloat(overrides.itemSizeSmall!) +
        Number.parseFloat(overrides.itemMarginSmall!.split(' ').at(-1)!),
    ).toBe(44);
  });

  it('disables boundaries and every page action while pending', async () => {
    const wrapper = mount(AdaptivePagination, {
      props: {
        itemCount: 10,
        page: 1,
        pageSize: 10,
        total: 20,
      },
    });

    const previous = wrapper.get(
      'button.adaptive-pagination__button--previous',
    );
    expect(previous.attributes()).toHaveProperty('disabled');
    (previous.element as HTMLButtonElement).click();
    expect(wrapper.emitted('page')).toBeUndefined();

    await wrapper.setProps({ page: 2 });
    const next = wrapper.get('button.adaptive-pagination__button--next');
    expect(next.attributes()).toHaveProperty('disabled');
    (next.element as HTMLButtonElement).click();
    expect(wrapper.emitted('page')).toBeUndefined();

    await wrapper.setProps({ pending: true });
    expect(
      wrapper
        .findAll('button.adaptive-pagination__button')
        .every((button) => button.attributes('disabled') !== undefined),
    ).toBe(true);
  });
});

describe('ranking sort-direction presentation', () => {
  it('keeps icon color and theme timing unified with the button label', () => {
    const baseCss = fs.readFileSync(
      path.join(repositoryRoot, 'frontend/src/shared/styles/base.css'),
      'utf8',
    );

    expect(baseCss).toMatch(
      /\.ranking-order-button \.app-icon \{[\s\S]*?color:\s*inherit;[\s\S]*?transition:\s*color 300ms cubic-bezier\(0\.4, 0, 0\.2, 1\),\s*transform 160ms cubic-bezier\(0\.22, 1, 0\.36, 1\);[\s\S]*?\}/,
    );
    expect(baseCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.ranking-order-button \.app-icon,[\s\S]*?transition-duration:\s*0s;/,
    );
  });
});
