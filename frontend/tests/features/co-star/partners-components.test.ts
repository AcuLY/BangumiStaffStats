import { flushPromises, mount } from '@vue/test-utils';
import { NSelect } from 'naive-ui';
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
import AdaptivePagination from '../../../src/features/ranking/components/AdaptivePagination.vue';
import RankedPersonList from '../../../src/features/ranking/components/RankedPersonList.vue';
import CoStarParticipants from '../../../src/features/co-star/components/CoStarParticipants.vue';

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
  metricScale: Object.freeze({ kind: 'linear', metric: 'count', max: 3 }),
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
  attachTo?: HTMLElement,
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
    ...(attachTo ? { attachTo } : {}),
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
  it('uses the complete signed scale when a maximum is outside the displayed page', async () => {
    const positive = { ...payload.items[0]!, preference: { ...partner.preference!, score: { numerator: '1', denominator: '5' } } };
    const negative = { ...positive, person: { ...positive.person, id: 3 }, rank: 9, preference: { ...positive.preference, score: { numerator: '-4', denominator: '5' } } };
    const signedPayload: PartnersPayload = { ...payload, metricScale: { kind: 'linear', metric: 'preference', max: { numerator: '4', denominator: '5' } }, items: [positive, negative] };
    const { wrapper, resource: current } = setup({ payload: signedPayload, view: { ...view, sort: 'preference' } });
    const rows = wrapper.findAll('.ranked-person-row');
    expect(rows[0]!.classes()).toContain('is-signed');
    expect(rows[0]!.classes()).toContain('is-positive');
    expect(rows[0]!.attributes('style')).toContain('--ranking-progress: 25%');
    expect(rows[1]!.classes()).toContain('is-negative');
    expect(rows[1]!.attributes('style')).toContain('--ranking-progress: 100%');
    await wrapper.setProps({ resource: { ...current, payload: { ...signedPayload, items: [positive] } } });
    expect(wrapper.get('.ranked-person-row').attributes('style')).toContain('--ranking-progress: 25%');
    expect(wrapper.get('.ranked-person-row__progress').attributes('aria-hidden')).toBe('true');
    wrapper.unmount();
  });

  it('uses ranking rows while displaying server summary, leaders, identities, and pagination', () => {
    const { execute, wrapper } = setup();

    expect(execute).not.toHaveBeenCalled();
    expect(wrapper.findComponent(RankedPersonList).exists()).toBe(true);
    expect(wrapper.findAll('.selected-person-card__metrics > div')).toHaveLength(3);
    expect(wrapper.get('.ranked-person-row__identity').text()).toContain('导演 · 主要声优');
    expect(wrapper.get('article').attributes('aria-label')).toBe(
      '单人物共演分析',
    );
    expect(wrapper.text()).toContain('来源');
    expect(wrapper.text()).toContain('3');
    expect(wrapper.text()).toContain('9.00');
    expect(wrapper.text()).toContain('合作人物');
    expect(wrapper.text()).toContain('12');
    expect(wrapper.text()).toContain('偏好分最高');
    expect(wrapper.get('.ranked-person-row').text()).toContain('8');
    expect(wrapper.get('.ranked-person-row').text()).toContain('合作方');
    expect(wrapper.get('.ranked-person-row__identity').text()).toContain('Partner');
    expect(wrapper.findAll('.ranked-person-list button')).toHaveLength(1);
    expect(wrapper.get('.ranked-person-row').text()).toContain('+0.17');
    expect(wrapper.get('.ranked-person-row').attributes('aria-label')).toContain(
      '2 个作品',
    );
    expect(wrapper.get('.ranked-person-row').attributes('aria-label')).not.toContain(
      '2 部作品',
    );
    expect(wrapper.text()).not.toContain('1—1 / 12');
    expect(wrapper.get('.single-cooperation__heading').text()).toBe('合作人物');
    expect(wrapper.find('.single-cooperation__works').exists()).toBe(false);
  });

  it('adds a row target using only its actual returned contributing identities', async () => {
    const { selection, wrapper } = setup();
    const row = wrapper.get('.ranked-person-row');

    await row.trigger('click');

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
    expect(wrapper.emitted('partnerActivated')?.[0]?.[1]).toBe(row.element);
  });

  it('reveals partner results only after accepted pagination and retains focus', async () => {
    vi.useFakeTimers();
    const { executeView, wrapper } = setup({}, undefined, document.body);
    executeView
      .mockReset()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const results = wrapper.get('.partners-results-boundary');
    const scrollIntoView = vi.fn();
    Object.defineProperty(results.element, 'scrollIntoView', {
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
    expect(document.activeElement).toBe(results.element);
    expect(results.classes()).toContain('is-reveal-attention');

    await vi.advanceTimersByTimeAsync(900);
    expect(document.activeElement).toBe(results.element);
    expect(results.classes()).not.toContain('is-reveal-attention');
    wrapper.unmount();
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
  });

  it('keeps source, summary, and toolbar for view pending but replaces the full summary for a position-filter request', () => {
    const viewPending = setup({ viewPending: true });
    expect(viewPending.wrapper.text()).toContain('来源');
    expect(viewPending.wrapper.text()).toContain('偏好分最高');
    expect(
      viewPending.wrapper.find('input[name="partners-search"]').exists(),
    ).toBe(true);
    expect(
      viewPending.wrapper.find('button.ranked-person-row').exists(),
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
    expect(fullPending.wrapper.text()).toContain('偏好分最高');
    expect(fullPending.wrapper.findAll('.partners-summary-skeleton .single-cooperation__leader')).toHaveLength(4);
    expect(viewPending.wrapper.findComponent(AdaptivePagination).props('pending')).toBe(true);
    expect(fullPending.wrapper.findComponent(AdaptivePagination).props('pending')).toBe(true);
    expect(
      fullPending.wrapper
        .get('.partners-results-boundary')
        .attributes('aria-busy'),
    ).toBe('true');
  });

  it('keeps known source identity and metric labels while unknown partner rows load without pagination', () => {
    const { wrapper } = setup({ payload: null, phase: 'pending' });
    expect(wrapper.text()).toContain('来源');
    expect(wrapper.text()).toContain('合作人物');
    expect(wrapper.findAll('.ranking-row-skeleton')).toHaveLength(view.pageSize);
    expect(wrapper.findAll('.ranking-row-skeleton .ranked-person-row__avatar')).toHaveLength(view.pageSize);
    expect(wrapper.find('button.ranked-person-row').exists()).toBe(false);
    expect(wrapper.findComponent(AdaptivePagination).exists()).toBe(false);
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

  it('keeps list loading local and omits the removed metric explanation', () => {
    const pending = setup({ viewPending: true });
    expect(pending.wrapper.attributes('aria-busy')).toBeUndefined();
    expect(pending.wrapper.get('.partners-results-boundary').attributes('aria-busy')).toBe('true');
    expect(pending.wrapper.find('.partners-metric-info').exists()).toBe(false);
    expect(pending.wrapper.text()).not.toContain('均由服务端返回');
  });

  it('reuses the participant card and opens source details from a keyboard-operable text entry', async () => {
    const { wrapper } = setup();
    expect(wrapper.findComponent(CoStarParticipants).exists()).toBe(true);
    const entry = wrapper.get('.selected-person-card .co-star-person-inspect');
    expect(entry.element.tagName).toBe('SPAN');
    expect(entry.attributes('role')).toBe('button');
    expect(entry.attributes('tabindex')).toBe('0');
    for (const key of ['Enter', ' ']) await entry.trigger('keydown', { key });
    expect(wrapper.emitted('inspectPerson')).toHaveLength(2);
    expect(wrapper.emitted('inspectPerson')?.[0]).toEqual([sourcePerson, ['staff:anime:2'], entry.element]);
  });
});
