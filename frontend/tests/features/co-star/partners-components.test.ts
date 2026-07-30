import { mount } from '@vue/test-utils';
import { NSelect, NTooltip } from 'naive-ui';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  PartnerCore,
  PartnersPayload,
} from '../../../src/api/adapters/partners';
import PartnersSurface from '../../../src/features/co-star/components/PartnersSurface.vue';
import type {
  PartnersInput,
  PartnersResource,
  PartnersView,
} from '../../../src/features/co-star/partners';
import { createCoStarSelection } from '../../../src/features/co-star/selection';

const sourcePerson = Object.freeze({
  id: 1,
  name: 'Source',
  nameCN: '来源',
});
const partner: PartnerCore = Object.freeze({
  metrics: Object.freeze({
    average: 850,
    overall: 720,
    ratedWorkCount: 2,
    workCount: 2,
  }),
  person: Object.freeze({
    id: 2,
    name: 'Partner',
    nameCN: '合作方',
  }),
  positionKeys: Object.freeze([
    'staff:anime:2',
    'cast:anime:main',
  ]),
  preference: Object.freeze({
    comparableCount: 1,
    comparableSeriesCount: 1,
    effectiveEvidence: 1,
    evidenceWeight: Object.freeze({
      denominator: '6',
      numerator: '1',
    }),
    mean: Object.freeze({ denominator: '1', numerator: '1' }),
    score: Object.freeze({ denominator: '6', numerator: '1' }),
  }),
});
const view: Readonly<PartnersView> = Object.freeze({
  order: 'desc',
  page: 1,
  pageSize: 10,
  search: '',
  sort: 'count',
});
const payload: PartnersPayload = Object.freeze({
  collection: Object.freeze({
    fetchedAt: '2026-07-25T08:00:00Z',
    stale: false,
    warningCodes: Object.freeze([]),
  }),
  dataVersion: `dv1-${'c'.repeat(64)}`,
  items: Object.freeze([
    Object.freeze({
      ...partner,
      rank: 8,
    }),
  ]),
  pagination: Object.freeze({
    page: 1,
    pageSize: 10,
    total: 12,
  }),
  requestId: 'req-partners-personal',
  scope: 'personal',
  source: Object.freeze({
    metrics: Object.freeze({
      average: 900,
      ratedWorkCount: 1,
      workCount: 3,
    }),
    person: sourcePerson,
    positionKeys: Object.freeze(['staff:anime:2']),
  }),
  summary: Object.freeze({
    leaders: Object.freeze([
      Object.freeze({ item: partner, metric: 'count' as const }),
      Object.freeze({ item: partner, metric: 'average' as const }),
      Object.freeze({ item: partner, metric: 'overall' as const }),
      Object.freeze({ item: partner, metric: 'preference' as const }),
    ]),
    partnerCount: 12,
  }),
  workUnit: 'subject',
});

const labels: Record<string, string> = {
  'cast:anime:main': '主要声优',
  'staff:anime:2': '导演',
};
const positionLabel = (positionKey: string) =>
  labels[positionKey] ?? positionKey;

function setup(
  patch: Partial<PartnersResource> = {},
  candidatePositionKey?: string,
) {
  const selection = createCoStarSelection([
    {
      person: sourcePerson,
      positionKey: 'staff:anime:2',
      positionLabel: '导演',
    },
  ]);
  const resource: PartnersResource = {
    error: null,
    feedback: null,
    input: Object.freeze({
      source: Object.freeze({
        personId: 1,
        positionKeys: Object.freeze(['staff:anime:2']),
      }),
      ...(candidatePositionKey ? { candidatePositionKey } : {}),
    }),
    payload,
    phase: 'ready',
    requestId: payload.requestId,
    view,
    viewPending: false,
    ...patch,
  };
  const execute = vi.fn(
    async (
      _input: Readonly<PartnersInput>,
      _view: Readonly<PartnersView>,
    ) => true,
  );
  const executeView = vi.fn(
    async (_view: Readonly<PartnersView>) => true,
  );
  const wrapper = mount(PartnersSurface, {
    props: {
      cancel: vi.fn(),
      execute,
      executeView,
      positionKeys: ['staff:anime:2', 'cast:anime:main'],
      positionLabel,
      resource,
      scope: 'personal',
      selection,
      source: selection.people.value[0]!,
      workUnit: 'subject',
    },
  });
  return { execute, executeView, resource, selection, wrapper };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('one-person partners surface', () => {
  it('preserves oracle hierarchy while displaying server summary, leaders, rank, metrics, and pagination', () => {
    const { execute, wrapper } = setup();

    expect(execute).not.toHaveBeenCalled();
    expect(wrapper.get('article').attributes('aria-label')).toBe(
      '单人物共演分析',
    );
    expect(wrapper.text()).toContain('来源');
    expect(wrapper.text()).toContain('3');
    expect(wrapper.text()).toContain('9.00');
    expect(wrapper.text()).toContain('合作人物');
    expect(wrapper.text()).toContain('12');
    expect(wrapper.text()).toContain('偏好分最高');
    expect(wrapper.get('.partners-person-row').text()).toContain('8');
    expect(wrapper.get('.partners-person-row').text()).toContain('合作方');
    expect(wrapper.get('.partners-person-row').text()).toContain('+0.17');
    expect(wrapper.get('.partners-person-row').attributes('aria-label')).toContain(
      '2 部作品',
    );
    expect(wrapper.get('.partners-person-row').attributes('aria-label')).not.toContain(
      '个作品',
    );
    expect(wrapper.text()).toContain('1—1 / 12');
    expect(wrapper.find('.single-cooperation__works').exists()).toBe(false);
  });

  it('adds a row target using only its actual returned contributing identities', async () => {
    const { selection, wrapper } = setup();

    await wrapper.get('.partners-person-row').trigger('click');

    expect(
      selection.people.value.map((person) => ({
        id: person.person.id,
        positions: person.identities.map(
          (identity) => identity.positionKey,
        ),
      })),
    ).toEqual([
      { id: 1, positions: ['staff:anime:2'] },
      {
        id: 2,
        positions: ['staff:anime:2', 'cast:anime:main'],
      },
    ]);
    expect(wrapper.emitted('partnerActivated')?.[0]?.[0]).toMatchObject(
      partner,
    );
  });

  it('uses view-only debounce for search and a full boundary for candidate-position filtering', async () => {
    vi.useFakeTimers();
    const { execute, executeView, wrapper } = setup(
      {},
      'cast:anime:main',
    );
    const search = wrapper.get('input[name="partners-search"]');

    await search.setValue('林');
    expect(executeView).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(240);
    expect(executeView).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, search: '林' }),
    );

    await wrapper
      .findComponent(NSelect)
      .vm.$emit('update:value', '');
    await nextTick();
    expect(execute).toHaveBeenCalledWith(
      {
        source: {
          personId: 1,
          positionKeys: ['staff:anime:2'],
        },
      },
      expect.objectContaining({ page: 1 }),
    );
    expect(execute.mock.calls.at(-1)?.[0]).not.toHaveProperty(
      'candidatePositionKey',
    );
    expect(execute.mock.calls.at(-1)?.[0]).not.toHaveProperty(
      'refreshCollection',
    );
  });

  it('keeps source, summary, and toolbar for view pending but replaces the full summary for a position-filter request', () => {
    const viewPending = setup({ viewPending: true });
    expect(viewPending.wrapper.text()).toContain('来源');
    expect(viewPending.wrapper.text()).toContain('偏好分最高');
    expect(
      viewPending.wrapper.find('input[name="partners-search"]').exists(),
    ).toBe(true);
    expect(
      viewPending.wrapper.find('.partners-person-row').exists(),
    ).toBe(false);
    expect(
      viewPending.wrapper.find('.partners-row-skeletons').exists(),
    ).toBe(true);

    const fullPending = setup({ phase: 'pending' });
    expect(fullPending.wrapper.text()).toContain('来源');
    expect(
      fullPending.wrapper.find('input[name="partners-search"]').exists(),
    ).toBe(true);
    expect(
      fullPending.wrapper.find('.partners-summary-skeleton').exists(),
    ).toBe(true);
    expect(fullPending.wrapper.text()).not.toContain('偏好分最高');
    expect(
      fullPending.wrapper
        .get('.partners-results-boundary')
        .attributes('aria-busy'),
    ).toBe('true');
  });

  it('shows one initial error boundary without a simultaneous empty summary', () => {
    const failed = setup({
      error: '合作人物暂时无法加载，请稍后重试',
      payload: null,
      phase: 'error',
      requestId: 'server-partners-error',
    });

    expect(failed.execute).not.toHaveBeenCalled();
    expect(
      failed.wrapper.find('.partners-summary-skeleton').exists(),
    ).toBe(false);
    expect(
      failed.wrapper.find('.partners-summary-placeholder').exists(),
    ).toBe(false);
    expect(failed.wrapper.findAll('[role="alert"]')).toHaveLength(1);
    expect(failed.wrapper.text()).not.toContain('暂无数据');
    expect(failed.wrapper.get('.partners-state[role="alert"]').text()).toContain(
      '合作人物暂时无法加载，请稍后重试',
    );
  });

  it('marks only list results busy and exposes the server-authority metric explanation', async () => {
    const pending = setup({ viewPending: true });
    const info = pending.wrapper.get('.partners-metric-info');

    expect(pending.wrapper.attributes('aria-busy')).toBeUndefined();
    expect(
      pending.wrapper
        .get('.partners-results-boundary')
        .attributes('aria-busy'),
    ).toBe('true');
    expect(info.attributes('aria-label')).toContain('均由服务端返回');
    expect(info.attributes('aria-label')).toContain('不会从当前列表重新计算');

    await info.trigger('focus');
    const tooltip = pending.wrapper.findComponent(NTooltip);
    expect(
      pending.wrapper
        .get('.partners-metric-info')
        .attributes('aria-expanded'),
    ).toBe('true');
    expect(tooltip.props('contentClass')).toBe(
      'workbench-tooltip-content',
    );
  });
});
