import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { flushPromises, mount } from '@vue/test-utils';
import {
  NCheckbox,
  NRadioGroup,
} from 'naive-ui';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  decodeCoStarPayload,
  type CoStarPayload,
} from '../../../src/api/adapters/coStar';
import CoStarSurface from '../../../src/features/co-star/components/CoStarSurface.vue';
import {
  coStarInput,
  defaultCoStarView,
  type CoStarInput,
  type CoStarRatingDataset,
  type CoStarResource,
  type CoStarView,
  type CoStarWorkItem,
} from '../../../src/features/co-star/coStar';
import CoStarRatings from '../../../src/features/co-star/components/CoStarRatings.vue';
import CoStarWorkBrowser from '../../../src/features/co-star/components/CoStarWorkBrowser.vue';
import { createCoStarSelection } from '../../../src/features/co-star/selection';
import AdaptivePagination from '../../../src/features/ranking/components/AdaptivePagination.vue';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);
type GoldenName = 'global' | 'group' | 'personal';

function payload(
  name: GoldenName,
  scope: 'global' | 'personal',
): CoStarPayload {
  const golden = JSON.parse(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        `contracts/goldens/api/co-star/cases/${name}.json`,
      ),
      'utf8',
    ),
  ) as { cases: Array<{ expected: { body: unknown } }> };
  return decodeCoStarPayload(golden.cases[0]!.expected.body, scope);
}

const labels: Record<string, string> = {
  'cast:anime:main': '主要声优',
  'staff:anime:1': '原作',
  'staff:anime:2': '导演',
  'staff:anime:3': '脚本',
  'staffset:anime:creative': '创作人员',
};
const positionLabel = (positionKey: string) =>
  labels[positionKey] ?? positionKey;

function setup(
  name: GoldenName,
  scope: 'global' | 'personal',
  patch: Partial<CoStarResource> = {},
  acceptedOverride?: CoStarPayload,
  attachTo?: HTMLElement,
) {
  const accepted = acceptedOverride ?? payload(name, scope);
  const selection = createCoStarSelection(
    accepted.data.participants.flatMap((participant) =>
      participant.positionKeys.map((positionKey) => ({
        person: participant.person,
        positionKey: String(positionKey),
        positionLabel: positionLabel(String(positionKey)),
      })),
    ),
  );
  const input = coStarInput(selection.people.value);
  const view: Readonly<CoStarView> = Object.freeze({
    ...defaultCoStarView(scope),
    ...(accepted.data.workUnit === 'series'
      ? { sort: 'seriesSize' as const }
      : {}),
  });
  const resource: CoStarResource = {
    error: null,
    feedback: null,
    input,
    payload: accepted,
    phase: 'ready',
    requestId: accepted.requestId,
    view,
    viewPending: false,
    ...patch,
  };
  const execute = vi.fn(
    async (
      _input: Readonly<CoStarInput>,
      _view: Readonly<CoStarView>,
    ) => true,
  );
  const executeView = vi.fn(
    async (_view: Readonly<CoStarView>) => true,
  );
  const wrapper = mount(CoStarSurface, {
    ...(attachTo ? { attachTo } : {}),
    props: {
      cancel: vi.fn(),
      execute,
      executeView,
      positionLabel,
      resource,
      scope,
      selection,
      workUnit: accepted.data.workUnit,
    },
  });
  return {
    execute,
    executeView,
    input,
    payload: accepted,
    resource,
    selection,
    view,
    wrapper,
  };
}

interface TimelineFixture {
  readonly average: number;
  readonly count: number;
  readonly quarter: number;
  readonly year: number;
}

function ratingComparisonSetup(
  scope: 'global' | 'personal' = 'global',
  timelineFixture?: readonly TimelineFixture[],
) {
  const accepted = payload('global', 'global');
  const datasets = accepted.data.ratings.datasets.map(
    (dataset, datasetIndex) => {
      const timeline = Object.freeze(
        (
          timelineFixture ?? [
            {
              average: 720,
              count: 1,
              quarter: 1,
              year: 2024,
            },
            {
              average: 760,
              count: 2,
              quarter: 2,
              year: 2024,
            },
          ]
        ).map((entry) =>
          Object.freeze({
            ...entry,
            average: entry.average + datasetIndex * 10,
            count: entry.count + datasetIndex,
          }),
        ),
      );
      const global = Object.freeze({
        ...dataset.global,
        timeline,
      });
      return Object.freeze({
        ...dataset,
        global,
        personal: Object.freeze({
          ...global,
          average:
            global.average === null ? null : global.average + 20,
        }),
      }) as unknown as CoStarRatingDataset;
    },
  );
  return mount(CoStarRatings, {
    props: {
      datasets,
      participants: accepted.data.participants,
      scope,
      workUnit: 'subject',
    },
  });
}

function groupPayloadWithParticipantCount(count: 3 | 4 | 5): CoStarPayload {
  const accepted = payload('group', 'global');
  if (accepted.data.kind !== 'group') {
    throw new Error('Expected group golden');
  }
  const template = accepted.data.participants[0]!;
  const pairMetrics = accepted.data.matrix.pairs[0]!.metrics;
  const participants = Array.from({ length: count }, (_, index) =>
    accepted.data.participants[index] ??
    Object.freeze({
      metrics: template.metrics,
      person: Object.freeze({
        id: index + 1,
        name: `Person ${index + 1}`,
        nameCN: null,
      }),
      positionKeys: Object.freeze(['staff:anime:3']),
    }),
  );
  const pairs = participants.flatMap((left, leftIndex) =>
    participants.slice(leftIndex + 1).map((right) =>
      Object.freeze({
        leftPersonId: left.person.id,
        metrics: pairMetrics,
        rightPersonId: right.person.id,
      }),
    ),
  );
  return Object.freeze({
    ...accepted,
    data: Object.freeze({
      ...accepted.data,
      matrix: Object.freeze({ pairs: Object.freeze(pairs) }),
      participants: Object.freeze(participants),
    }),
  }) as CoStarPayload;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('pair and group co-star surface', () => {
  it('shows scroll-edge cues only where more work-list content remains', async () => {
    const { wrapper } = setup('global', 'global');
    const list = wrapper.get('.co-star-work-list');
    const element = list.element as HTMLElement;
    Object.defineProperties(element, {
      clientHeight: { configurable: true, value: 200 },
      scrollHeight: { configurable: true, value: 600 },
    });
    const boundary = wrapper.get('.co-star-work-list-boundary');
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ right: 500 } as DOMRect);
    vi.spyOn(element.children[0]!, 'getBoundingClientRect').mockReturnValue({ right: 482 } as DOMRect);
    await list.trigger('scroll');
    expect(boundary.attributes('style')).toContain('--scroll-edge-inset: 18px');
    expect(boundary.classes()).not.toContain('can-scroll-up');
    expect(boundary.classes()).toContain('can-scroll-down');
    element.scrollTop = 100;
    await list.trigger('scroll');
    expect(boundary.classes()).toContain('can-scroll-up');
    expect(boundary.classes()).toContain('can-scroll-down');
    element.scrollTop = 400;
    await list.trigger('scroll');
    expect(boundary.classes()).toContain('can-scroll-up');
    expect(boundary.classes()).not.toContain('can-scroll-down');
    element.scrollTop = 0;
    Object.defineProperty(element, 'scrollHeight', { configurable: true, value: 200 });
    await list.trigger('scroll');
    expect(boundary.classes()).not.toContain('can-scroll-up');
    expect(boundary.classes()).not.toContain('can-scroll-down');
    wrapper.unmount();
  });

  it('renders the oracle pair hierarchy from complete server evidence without local statistics', () => {
    const { execute, payload: accepted, wrapper } = setup(
      'global',
      'global',
    );
    if (accepted.data.kind !== 'pair') {
      throw new Error('Expected pair golden');
    }

    expect(execute).not.toHaveBeenCalled();
    expect(wrapper.get('article').attributes('data-analysis-mode')).toBe(
      'pair',
    );
    expect(wrapper.findAll('.co-star-participant-card')).toHaveLength(2);
    expect(wrapper.text()).toContain('导演');
    expect(wrapper.text()).toContain('声优');
    expect(
      wrapper
        .findAll('.co-star-summary-grid dd')
        .map((node) => node.text()),
    ).toEqual([
      String(accepted.data.summary.unionWorkCount),
      String(accepted.data.summary.commonWorkCount),
      String(accepted.data.summary.ratedWorkCount),
      '8.00',
    ]);
    expect(wrapper.text()).toContain('代表条目标签');
    expect(wrapper.text()).toContain('TV · 1');
    expect(wrapper.find('.horizontal-distribution').exists()).toBe(true);
    expect(wrapper.find('.co-star-matrix-table').exists()).toBe(false);
    expect(wrapper.find('.preference-domain').exists()).toBe(false);
    expect(wrapper.findAll('.co-star-work-row')).toHaveLength(1);
    expect(wrapper.text()).toContain('共同系列');
    expect(
      wrapper.findAll('[data-provenance="exact"]').length,
    ).toBeGreaterThan(0);
    expect(wrapper.text()).toContain('声优（主角）：主角 · 1 部');
    expect(wrapper.text()).not.toContain('主角 · 主役');
    expect(wrapper.text()).not.toContain('最佳组合');
    expect(wrapper.text()).not.toContain('最佳搭档');
  });

  it('keeps the group matrix visible for a ready zero common-work result', () => {
    const { payload: accepted, wrapper } = setup('group', 'global');
    if (accepted.data.kind !== 'group') {
      throw new Error('Expected group golden');
    }

    expect(wrapper.get('article').attributes('data-analysis-mode')).toBe(
      'group',
    );
    expect(wrapper.findAll('.co-star-participant-card')).toHaveLength(3);
    expect(wrapper.text()).toContain('没有共同作品');
    expect(wrapper.find('.co-star-matrix-table').exists()).toBe(true);
    expect(wrapper.get('.co-star-matrix-block').element.compareDocumentPosition(
      wrapper.get('.co-star-common-empty').element,
    ) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(wrapper.get('.co-star-matrix-block').classes()).toContain(
      'co-star-matrix-block--standalone',
    );
    expect(wrapper.findAll('.co-star-matrix-table tbody tr')).toHaveLength(
      3,
    );
    expect(wrapper.findAll('.co-star-matrix-table tbody td')).toHaveLength(
      9,
    );
    expect(wrapper.find('.co-star-matrix-table .is-best').exists()).toBe(
      false,
    );
    expect(wrapper.text()).toContain('共同 1 部');
    expect(wrapper.find('.rating-distribution-panel').exists()).toBe(false);
    expect(wrapper.find('.co-star-tag-domain').exists()).toBe(false);
    expect(wrapper.find('.preference-domain').exists()).toBe(false);
    expect(wrapper.find('.co-star-work-browser').exists()).toBe(false);
    expect(wrapper.find('.co-star-ready-empty').exists()).toBe(false);
    expect(wrapper.findAll('.co-star-common-empty')).toHaveLength(1);
  });

  it('retains pair participants and one ready empty state without empty detail sections', () => {
    const { payload: accepted, wrapper } = setup(
      'personal',
      'personal',
    );
    expect(accepted.data).toHaveProperty('preference.score', null);
    expect(wrapper.findAll('.co-star-participant-card')).toHaveLength(2);
    expect(wrapper.text()).toContain('没有共同作品');
    expect(wrapper.findAll('.co-star-common-empty')).toHaveLength(1);
    expect(wrapper.find('.co-star-tag-domain').exists()).toBe(false);
    expect(wrapper.find('.rating-domain').exists()).toBe(false);
    expect(wrapper.find('.preference-domain').exists()).toBe(false);
    expect(wrapper.find('.co-star-work-browser').exists()).toBe(false);
    expect(wrapper.find('.co-star-matrix-table').exists()).toBe(false);
  });

  it.each([3, 4, 5] as const)(
    'uses adaptive matrix density for %i participants and scrolls only at five',
    (count) => {
      const accepted = groupPayloadWithParticipantCount(count);
      const { wrapper } = setup(
        'group',
        'global',
        {},
        accepted,
      );
      const details = wrapper.get('.matrix-details');
      const viewport = wrapper.get('.co-star-matrix-scroll');

      expect(
        wrapper.findAll('.co-star-matrix-table tbody tr'),
      ).toHaveLength(count);
      expect(details.classes().includes('matrix-details--scrollable')).toBe(
        count >= 5,
      );
      expect(viewport.attributes('tabindex')).toBe(
        count >= 5 ? '0' : undefined,
      );
    },
  );
});

describe('co-star local request boundaries', () => {
  it('retains all accepted core sections while only work rows are view-pending', () => {
    const accepted = payload('global', 'global');
    const pagedPayload = Object.freeze({
      ...accepted,
      pagination: Object.freeze({
        ...accepted.pagination,
        total: 12,
      }),
    }) as CoStarPayload;
    const { wrapper } = setup(
      'global',
      'global',
      { viewPending: true },
      pagedPayload,
    );

    expect(wrapper.findAll('.co-star-participant-card')).toHaveLength(2);
    expect(wrapper.find('.co-star-summary-grid').exists()).toBe(true);
    expect(wrapper.find('.co-star-tag-groups').exists()).toBe(true);
    expect(wrapper.find('.horizontal-distribution').exists()).toBe(true);
    expect(wrapper.find('.co-star-work-row a').exists()).toBe(false);
    expect(wrapper.find('.co-star-work-skeletons').exists()).toBe(true);
    expect(wrapper.get('article').attributes('aria-busy')).toBeUndefined();
    expect(
      wrapper.get('.co-star-work-browser').attributes('aria-busy'),
    ).toBe('true');
    expect(
      wrapper.get('.co-star-work-list-boundary').attributes('aria-busy'),
    ).toBe('true');
    expect(
      wrapper.get('.co-star-work-pagination').attributes('aria-busy'),
    ).toBe('true');
  });

  it('reveals common-work results only after accepted pagination', async () => {
    const accepted = payload('global', 'global');
    const pagedPayload = Object.freeze({
      ...accepted,
      pagination: Object.freeze({
        ...accepted.pagination,
        total: 12,
      }),
    }) as CoStarPayload;
    const { executeView, wrapper } = setup(
      'global',
      'global',
      {},
      pagedPayload,
      document.body,
    );
    executeView
      .mockReset()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const browser = wrapper.get('.co-star-work-browser');
    const scrollIntoView = vi.fn();
    Object.defineProperty(browser.element, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    const pagination = wrapper.findComponent(AdaptivePagination);

    pagination.vm.$emit('page', 2);
    await flushPromises();
    expect(scrollIntoView).not.toHaveBeenCalled();

    pagination.vm.$emit('page-size', 20);
    await flushPromises();
    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(browser.element);
    expect(browser.classes()).toContain('is-reveal-attention');
    wrapper.unmount();
  });

  it('shows bounded full skeleton and stable initial error states', async () => {
    const pending = setup('global', 'global', {
      payload: null,
      phase: 'pending',
      requestId: null,
    });
    expect(
      pending.wrapper.findAll('.selected-people-grid .selected-person-card'),
    ).toHaveLength(2);
    expect(pending.wrapper.get('article').attributes('aria-busy')).toBe(
      'true',
    );
    expect(pending.wrapper.find('.co-star-work-skeletons').exists()).toBe(
      true,
    );
    expect(pending.wrapper.findAll('.co-star-summary-grid > div')).toHaveLength(4);
    const distribution = pending.wrapper.get('.co-star-loading-chart');
    expect(distribution.findAll('.co-star-loading-chart__axis .app-skeleton')).toHaveLength(3);
    expect(distribution.findAll('.co-star-loading-chart__column')).toHaveLength(10);
    expect(distribution.findAll('.co-star-loading-chart__column > small').map(node => node.text())).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    expect(distribution.find('.horizontal-score-bar').exists()).toBe(false);
    expect(distribution.find('[tabindex]').exists()).toBe(false);
    expect(pending.wrapper.find('.preference-domain').exists()).toBe(false);
    expect(pending.wrapper.find('.co-star-matrix-block').exists()).toBe(false);
    expect(pending.wrapper.findComponent(AdaptivePagination).exists()).toBe(false);
    expect(pending.wrapper.find('.subject-work-row__series-members').exists()).toBe(true);

    const failed = setup('global', 'global', {
      error: '共演分析暂时无法加载，请稍后重试',
      payload: null,
      phase: 'error',
      requestId: 'server-failed',
    });
    expect(failed.wrapper.find('.co-star-full-skeleton').exists()).toBe(
      false,
    );
    expect(failed.wrapper.get('[role="alert"]').text()).toContain(
      '共演分析暂时无法加载',
    );
    await failed.wrapper
      .get('.co-star-initial-error__actions button')
      .trigger('click');
    expect(failed.execute).toHaveBeenCalledWith(
      failed.input,
      failed.view,
    );
  });

  it('preserves personal and group loading topology with known participants and no fabricated statistics', () => {
    const group = setup('group', 'global', { payload: null, phase: 'pending', requestId: null });
    expect(group.wrapper.findAll('.co-star-matrix-table tbody tr')).toHaveLength(group.payload.data.participants.length);
    expect(group.wrapper.findAll('.work-cards-skeleton > li')[0]!.findAll('.shared-work-participant')).toHaveLength(group.payload.data.participants.length);
    expect(group.wrapper.findAll('.work-cards-skeleton > li')[0]!.findAll('.shared-work-participant-row')).toHaveLength(Math.ceil(group.payload.data.participants.length / 2));
    expect(group.wrapper.findAll('.co-star-summary-grid > div')).toHaveLength(4);

    const personal = setup('personal', 'personal', { payload: null, phase: 'pending', requestId: null });
    expect(personal.wrapper.findAll('.co-star-summary-grid > div')).toHaveLength(8);
    expect(personal.wrapper.find('.preference-domain').exists()).toBe(true);
    expect(personal.wrapper.findAll('.tag-row')).toHaveLength(3);
    expect(personal.wrapper.find('.co-star-full-skeleton').text()).toContain('我的评分');
    expect(personal.wrapper.findAll('.selected-person-card__name').map(node => node.text())).toEqual(personal.payload.data.participants.map(person => person.person.nameCN ?? person.person.name));
  });

  it('debounces work search as a view-only request and resets server page', async () => {
    vi.useFakeTimers();
    const { execute, executeView, wrapper } = setup(
      'global',
      'global',
      {
        view: Object.freeze({
          ...defaultCoStarView('global'),
          page: 4,
          sort: 'seriesSize',
        }),
      },
    );

    await wrapper
      .get('input[name="sharedWorkSearch"]')
      .setValue('共同');
    expect(executeView).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(240);

    expect(executeView).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        search: '共同',
        sort: 'seriesSize',
      }),
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it('keeps a failed view request local to the work browser and rolls search back to the accepted view', async () => {
    vi.useFakeTimers();
    const context = setup('global', 'global');
    const input = context.wrapper.get(
      'input[name="sharedWorkSearch"]',
    );

    await input.setValue('失败的列表查询');
    await vi.advanceTimersByTimeAsync(240);
    expect(context.executeView).toHaveBeenCalledOnce();

    await context.wrapper.setProps({
      resource: {
        ...context.resource,
        error: '共同系列列表暂时无法更新',
        view: context.view,
        viewPending: false,
      },
    });

    expect(context.wrapper.findAll('[role="alert"]')).toHaveLength(1);
    expect(
      context.wrapper.get('.co-star-work-browser [role="alert"]').text(),
    ).toContain('共同系列列表暂时无法更新');
    expect(
      (
        context.wrapper.get('input[name="sharedWorkSearch"]')
          .element as HTMLInputElement
      ).value,
    ).toBe('');
  });

  it('switches the server work list between detailed and compact oracle rows without a new request', async () => {
    const context = setup('global', 'global');
    const { executeView, wrapper } = context;
    const density = wrapper
      .findAllComponents(NRadioGroup)
      .find((control) =>
        control.attributes('aria-label')?.includes('缩略模式'),
      );

    expect(density).toBeDefined();
    expect(wrapper.find('.subject-work-row__participants').exists()).toBe(
      true,
    );
    density!.vm.$emit('update:value', 'compact');
    await nextTick();

    expect(wrapper.get('.subject-work-list').classes()).toContain(
      'subject-work-list--compact',
    );
    expect(wrapper.find('.subject-work-row__index').exists()).toBe(true);
    expect(wrapper.find('.subject-work-row__participants').exists()).toBe(
      false,
    );
    expect(executeView).not.toHaveBeenCalled();
    await wrapper.setProps({ resource: { ...context.resource, viewPending: true } });
    expect(wrapper.get('.work-cards-skeleton').classes()).toContain('subject-work-list--compact');
    expect(wrapper.findAll('.work-cards-skeleton > li')).toHaveLength(context.view.pageSize);
    expect(wrapper.find('.work-cards-skeleton .subject-work-row__participants').exists()).toBe(false);
    expect(wrapper.find('.work-cards-skeleton .subject-work-row__compact-score .n-skeleton').exists()).toBe(true);
  });
});

describe('co-star rating comparison interactions', () => {
  it('supports subject score/time switching, personal/global sources, series visibility, and keyboard point navigation', async () => {
    const wrapper = ratingComparisonSetup('personal');
    const controls = wrapper.findAllComponents(NRadioGroup);
    const modeControl = controls.find(
      (control) =>
        control.attributes('aria-label') === '评分图表维度',
    );
    const sourceControl = controls.find(
      (control) =>
        control.attributes('aria-label') === '评分数据来源',
    );

    expect(wrapper.find('.horizontal-distribution').exists()).toBe(true);
    expect(modeControl?.props('value')).toBe('score');
    expect(sourceControl?.props('value')).toBe('personal');
    sourceControl!.vm.$emit('update:value', 'global');
    modeControl!.vm.$emit('update:value', 'time');
    await nextTick();

    expect(sourceControl!.props('value')).toBe('global');
    expect(modeControl!.props('value')).toBe('time');
    const chart = wrapper.get('.comparison-time-chart');
    expect(chart.attributes('viewBox')).toBe('0 0 360 236');
    expect(chart.attributes('preserveAspectRatio')).toBeUndefined();
    expect(
      wrapper
        .findAll('.rating-time-chart__quarter-label')
        .map((label) => Number(label.attributes('x'))),
    ).toEqual([112, 268]);
    expect(
      wrapper.findAll('.comparison-time-chart__series'),
    ).toHaveLength(3);

    const targets = wrapper.findAll(
      '.comparison-time-chart__hit-target',
    );
    expect(targets.length).toBeGreaterThan(1);
    expect(Number(targets[0]!.attributes('width'))).toBeGreaterThanOrEqual(
      44,
    );
    expect(targets[0]!.attributes('aria-label')).toContain(
      '使用方向键浏览相邻时间点',
    );
    await targets[0]!.trigger('focus');
    expect(wrapper.find('[role="tooltip"]').exists()).toBe(true);

    const focusNext = vi.fn();
    Object.defineProperty(targets[1]!.element, 'focus', {
      configurable: true,
      value: focusNext,
    });
    await targets[0]!.trigger('keydown', { key: 'ArrowRight' });
    expect(focusNext).toHaveBeenCalledOnce();

    const legend = wrapper.findAllComponents(NCheckbox);
    expect(legend).toHaveLength(3);
    legend[0]!.vm.$emit('update:checked', false);
    await nextTick();
    expect(
      wrapper.findAll('.comparison-time-chart__series'),
    ).toHaveLength(2);
    expect(wrapper.find('.distribution-legend > span')!.classes()).toContain(
      'is-hidden',
    );
  });

  it('keeps common on slot one and wraps the tenth person to slot one', () => {
    const accepted = payload('global', 'global');
    const template = accepted.data.ratings.datasets[0]!;
    const datasets = Array.from({ length: 11 }, (_, index) =>
      Object.freeze({
        ...template,
        ...(index === 0
          ? { kind: 'common' as const }
          : {
              kind: 'participant' as const,
              personId: index + 100,
            }),
      }),
    ) as unknown as readonly CoStarRatingDataset[];
    const wrapper = mount(CoStarRatings, {
      props: {
        datasets,
        participants: accepted.data.participants,
        scope: 'global',
        workUnit: 'series',
      },
    });
    const colors = wrapper
      .findAll('.distribution-legend > span')
      .map((item) => item.attributes('style')?.match(
        /--series-color:\s*([^;]+)/,
      )?.[1]);

    expect(colors).toHaveLength(11);
    expect(new Set(colors).size).toBe(10);
    expect(colors[0]).not.toBe(colors[1]);
    expect(colors[10]).toBe(colors[0]);
  });

  it('uses measured plot width to hide crowded quarters and keep year labels 52px apart', async () => {
    vi.spyOn(
      HTMLElement.prototype,
      'getBoundingClientRect',
    ).mockReturnValue({
      bottom: 236,
      height: 236,
      left: 0,
      right: 280,
      toJSON: () => ({}),
      top: 0,
      width: 280,
      x: 0,
      y: 0,
    });
    const timeline = Array.from({ length: 32 }, (_, index) => ({
      average: 700 + (index % 4) * 10,
      count: 1,
      quarter: (index % 4) + 1,
      year: 2017 + Math.floor(index / 4),
    }));
    const wrapper = ratingComparisonSetup('global', timeline);
    const modeControl = wrapper
      .findAllComponents(NRadioGroup)
      .find(
        (control) =>
          control.attributes('aria-label') === '评分图表维度',
      );

    modeControl!.vm.$emit('update:value', 'time');
    await nextTick();
    await flushPromises();

    expect(wrapper.get('.comparison-time-chart').attributes('viewBox')).toBe(
      '0 0 280 236',
    );
    expect(
      wrapper.findAll('.rating-time-chart__quarter-label'),
    ).toHaveLength(0);
    const yearPositions = wrapper
      .findAll('.rating-time-chart__year-label')
      .map((label) => Number(label.attributes('x')));
    expect(yearPositions.length).toBeGreaterThan(1);
    expect(
      yearPositions
        .slice(1)
        .every(
          (position, index) =>
            position - yearPositions[index]! >= 52,
        ),
    ).toBe(true);
  });
});

describe('co-star contribution copy', () => {
  it('maps server cast roles and keeps overflowed identities available in the complete list', async () => {
    const accepted = payload('global', 'global');
    const seriesItem = accepted.data.items[0];
    if (!seriesItem || seriesItem.kind !== 'series') {
      throw new Error('Expected series work golden');
    }
    const castCredit = seriesItem.participants
      .flatMap((participant) => participant.credits)
      .find((credit) => credit.kind === 'cast');
    if (!castCredit) {
      throw new Error('Expected cast credit');
    }
    const subjectParticipants = seriesItem.participants.map(
      (participant) => ({
        credits: participant.credits.map((credit) => {
          const { workCount: _workCount, ...subjectCredit } = credit;
          return subjectCredit;
        }),
        personId: participant.personId,
      }),
    );
    const castParticipant = subjectParticipants.find(
      (participant) =>
        participant.personId ===
        seriesItem.participants.find((participant) =>
          participant.credits.some((credit) => credit.kind === 'cast'),
        )?.personId,
    );
    const {
      workCount: _castWorkCount,
      ...subjectCastCredit
    } = castCredit;
    castParticipant?.credits.push(
      {
        ...subjectCastCredit,
        character: Object.freeze({
          id: 202,
          key: 'character:202',
          name: 'Supporting Role',
          nameCN: '配角角色',
        }),
        roleLabel: '配角',
        roleType: 2,
      } as never,
      {
        ...subjectCastCredit,
        character: Object.freeze({
          id: 203,
          key: 'character:203',
          name: 'Guest Role',
          nameCN: '客串角色',
        }),
        roleLabel: '客串',
        roleType: 3,
      } as never,
      {
        ...subjectCastCredit,
        character: Object.freeze({
          id: 204,
          key: 'character:204',
          name: 'Unknown Role',
          nameCN: '未知角色',
        }),
        roleLabel: '其他',
        roleType: 4,
      } as never,
    );
    const subjectItem = Object.freeze({
      globalScore: seriesItem.globalScore,
      key: `subject:${seriesItem.representative.id}`,
      kind: 'subject',
      metaTags: Object.freeze(['TV', '日本']),
      participants: Object.freeze(subjectParticipants),
      subject: Object.freeze({
        ...seriesItem.representative,
        name: 'One Name Work',
        nameCN: null,
      }),
    }) as unknown as CoStarWorkItem;
    const wrapper = mount(CoStarWorkBrowser, {
      props: {
        error: null,
        executeView: vi.fn(async () => true),
        items: [subjectItem],
        page: 1,
        pageSize: 10,
        participants: accepted.data.participants,
        pending: false,
        positionLabel,
        retry: vi.fn(),
        scope: 'global',
        total: 1,
        view: defaultCoStarView('global'),
        workUnit: 'subject',
      },
    });

    expect(wrapper.text()).toContain('声优（主角）：主角');
    expect(wrapper.findAll('.subject-work-row__meta > li > .n-tag').map(tag => tag.text())).toEqual(['TV', '日本']);
    expect(wrapper.findAll('.subject-work-row__meta > li > .n-tag--round')).toHaveLength(2);
    expect(wrapper.text()).toContain('声优（配角）：配角角色');
    const credits = wrapper.findAll('.credit-list').find((list) =>
      list.attributes('aria-label')?.includes('声优（客串）：客串角色'),
    )!;
    expect(credits.attributes('aria-label')).toContain('声优：未知角色');
    expect(credits.text()).toContain('… +');
    await credits.trigger('focus');
    await credits.trigger('click');
    await vi.waitFor(() => {
      const full = document.querySelector('.credit-list__full')?.textContent;
      expect(full).toContain('声优（客串）：客串角色');
      expect(full).toContain('声优：未知角色');
      expect(full).not.toContain('声优：未知角色 ·');
    });
    await credits.trigger('keydown', { key: 'Escape' });
    expect(wrapper.text()).not.toContain('声优（主角）：主角 · 1 部');
    expect(wrapper.text()).not.toContain('声优：未知角色 ·');
    expect(wrapper.get('.subject-work-row__primary-link').text()).toBe(
      'One Name Work',
    );
    expect(wrapper.get('.subject-work-row__secondary').text()).toBe(
      'One Name Work',
    );
    expect(
      wrapper.get('.subject-work-row__primary-link').attributes('title'),
    ).toBe('One Name Work\nOne Name Work');
    wrapper.unmount();
  });
});

describe('co-star oracle layout contracts', () => {
  it('keeps desktop candidates in page flow and reserves matrix scrolling for five people', () => {
    const pickerCss = fs.readFileSync(
      path.join(
        repositoryRoot,
        'frontend/src/features/co-star/co-star.css',
      ),
      'utf8',
    );
    const analysisCss = fs.readFileSync(
      path.join(
        repositoryRoot,
        'frontend/src/features/co-star/co-star-analysis.css',
      ),
      'utf8',
    );
    const baseCss = fs.readFileSync(
      path.join(
        repositoryRoot,
        'frontend/src/shared/styles/base.css',
      ),
      'utf8',
    );

    expect(pickerCss).toMatch(
      /@media \(width >= 780px\)[\s\S]*?\.co-star-candidate-rail\s*\{[^}]*height:\s*auto;[^}]*max-height:\s*none;[^}]*overflow:\s*visible;/,
    );
    expect(pickerCss).toMatch(
      /\.candidate-picker:not\(\.is-drawer\) \.candidate-list,[\s\S]*?overflow-y:\s*visible;/,
    );
    expect(pickerCss).toMatch(
      /\.co-star-candidate-rail::after\s*\{[^}]*inset:\s*-3px;[^}]*border:\s*2px solid transparent;[^}]*pointer-events:\s*none;/s,
    );
    expect(pickerCss).toMatch(
      /\.co-star-candidate-rail\.is-attention::after\s*\{[^}]*border-color:\s*var\(--focus\);/s,
    );
    expect(pickerCss).toMatch(
      /\.candidate-toolbar \.ranking-order-button\s*\{[^}]*width:\s*100%;[^}]*min-height:\s*0;/s,
    );
    expect(pickerCss).not.toMatch(
      /\.candidate-toolbar[\s\S]*?\.ranking-order-button__content\s*> span\s*\{/,
    );
    expect(pickerCss).not.toMatch(
      /@media \(width < 520px\)[\s\S]*?\.candidate-toolbar\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 80px;/,
    );
    expect(baseCss).not.toMatch(
      /@media \(width < 780px\)[\s\S]*?\.ranking-workspace \.ranking-order-button__content > span\s*\{[^}]*position:\s*absolute;[^}]*clip:\s*rect\(0, 0, 0, 0\);/s,
    );
    expect(baseCss).not.toContain('.ranking-order-button span');
    expect(pickerCss).toMatch(
      /\.candidate-row\s*\{[^}]*border:\s*1px solid var\(--divider\);/s,
    );
    expect(analysisCss).toMatch(
      /\.co-star-matrix-scroll\s*\{[^}]*overflow-x:\s*clip;/,
    );
    expect(analysisCss).toMatch(
      /\.matrix-details--scrollable \.co-star-matrix-scroll\s*\{[^}]*overflow-x:\s*auto;/,
    );
    expect(analysisCss).toMatch(
      /\.matrix-details--scrollable \.co-star-matrix-table\s*\{[^}]*min-width:\s*calc\(112px \+ var\(--matrix-size, 5\) \* 104px\);/,
    );
    expect(baseCss).not.toMatch(/\.app-header__query\s*\{/);
    expect(baseCss).not.toMatch(/\.query-editor-overlay\s*\{/);
    expect(baseCss).toMatch(
      /\.query-workspace\s*\{[^}]*background:\s*var\(--surface\);/,
    );
    expect(baseCss).toMatch(
      /@media \(width < 780px\)[\s\S]*?\.query-workspace\s*\{[^}]*margin-bottom:\s*var\(--space-4\);/,
    );
    expect(baseCss).not.toContain('.app-header__mobile-context');
    expect(pickerCss).not.toContain('.co-star-picker-drawer');
    expect(pickerCss).toMatch(
      /@media \(width < 780px\)[\s\S]*?\.co-star-mobile-entry\.co-star-content-entry\s*\{[^}]*min-height:\s*var\(--touch-target\);[^}]*margin-bottom:\s*0;[^}]*padding:\s*var\(--space-2\) var\(--space-3\);[^}]*border:\s*1px solid var\(--border\);[^}]*background:\s*var\(--surface\);/,
    );
    expect(pickerCss).toMatch(
      /\.co-star-content-entry \.co-star-mobile-entry__selection b,[\s\S]*?white-space:\s*normal;[\s\S]*?overflow-wrap:\s*anywhere;/,
    );
    expect(pickerCss).toMatch(
      /\.co-star-content-entry \.co-star-mobile-entry__selection b\s*\{[^}]*font-size:\s*12px;[^}]*font-weight:\s*600;/s,
    );
    expect(pickerCss).toMatch(
      /\.co-star-content-entry \.co-star-mobile-entry__selection span\s*\{[^}]*font-size:\s*12px;[^}]*font-weight:\s*400;/s,
    );
    expect(pickerCss).toMatch(
      /\.co-star-content-entry \.co-star-mobile-entry__action\s*\{[^}]*width:\s*var\(--touch-target\);[^}]*height:\s*28px;/s,
    );
    expect(pickerCss).toMatch(
      /\.co-star-picker-accordion\s*\{[^}]*overflow:\s*hidden;[^}]*grid-template-rows:\s*1fr;[^}]*border-top:\s*0;/s,
    );
    expect(pickerCss).toMatch(
      /\.co-star-picker-panel-enter-active\s*\{[^}]*grid-template-rows 160ms ease-out,[^}]*opacity 160ms ease-out;/s,
    );
    expect(analysisCss).toMatch(
      /\.co-star-surface > \.analysis-section\.selected-people-panel\s*\{[^}]*padding:\s*var\(--space-3\) var\(--analysis-section-inline\) var\(--space-4\);/s,
    );
    expect(baseCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.safe-image img,[\s\S]*?transition-duration:\s*0s;[\s\S]*?\.state-icon--loading,[\s\S]*?\.app-skeleton\.app-skeleton[\s\S]*?animation:\s*none;/,
    );
  });
});

describe('personal preference navigation', () => {
  it('uses the server difference and focuses the work browser with the selected server item', async () => {
    const accepted = payload('personal', 'personal');
    if (!('preference' in accepted.data)) {
      throw new Error('Expected personal golden');
    }
    const preferred = Object.freeze({
      differenceHundredths: 125,
      globalScore: 775,
      personalScore: 900,
      unit: Object.freeze({
        id: 909,
        key: 'subject:909',
        kind: 'subject' as const,
        name: 'Preferred Work',
        nameCN: '偏好作品',
      }),
    });
    const patchedPayload = Object.freeze({
      ...accepted,
      data: Object.freeze({
        ...accepted.data,
        preference: Object.freeze({
          ...accepted.data.preference,
          preferred: Object.freeze([preferred]),
        }),
        summary: Object.freeze({
          ...accepted.data.summary,
          commonWorkCount: 1,
        }),
      }),
    }) as CoStarPayload;
    const { executeView, wrapper } = setup(
      'personal',
      'personal',
      { payload: patchedPayload },
      undefined,
      document.body,
    );
    const browser = wrapper.get('.co-star-work-browser');
    const scrollIntoView = vi.fn();
    Object.defineProperty(browser.element, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });

    expect(wrapper.get('.preference-work--positive').text()).toContain(
      '+1.25',
    );
    await wrapper.get('.preference-work--positive').trigger('click');
    await nextTick();

    expect(executeView).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        search: '偏好作品',
      }),
    );
    expect(
      (
        wrapper.get('input[name="sharedWorkSearch"]')
          .element as HTMLInputElement
      ).value,
    ).toBe('偏好作品');
    expect(document.activeElement).toBe(
      wrapper.get('input[name="sharedWorkSearch"]').element,
    );
    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(browser.classes()).toContain('is-reveal-attention');
    wrapper.unmount();
  });
});

describe('co-star motion policy', () => {
  it('uses centralized Skeleton motion without blanket overrides', () => {
    const analysisCss = fs.readFileSync(
      path.join(
        repositoryRoot,
        'frontend/src/features/co-star/co-star-analysis.css',
      ),
      'utf8',
    );
    const partnersCss = fs.readFileSync(
      path.join(
        repositoryRoot,
        'frontend/src/features/co-star/partners.css',
      ),
      'utf8',
    );
    const baseCss = fs.readFileSync(
      path.join(repositoryRoot, 'frontend/src/shared/styles/base.css'),
      'utf8',
    );

    for (const css of [analysisCss, partnersCss]) {
      expect(css).not.toContain('ranking-shimmer');
      expect(css).not.toContain('animation-duration: 0.01ms !important');
      expect(css).not.toMatch(/\.(?:co-star|partners)-surface \*,/);
    }
    expect(baseCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.app-skeleton\.app-skeleton\s*\{\s*animation:\s*none;/,
    );
    expect(partnersCss).toContain(
      '.partners-surface .single-cooperation__leader',
    );
    expect(partnersCss).toContain('transition-duration: 0s');
  });
});
