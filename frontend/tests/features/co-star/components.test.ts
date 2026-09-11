import { flushPromises, mount } from '@vue/test-utils';
import { NInput, NSelect } from 'naive-ui';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CandidatePayload } from '../../../src/api/adapters/candidates';
import CandidatePicker from '../../../src/features/co-star/components/CandidatePicker.vue';
import CandidateWorkspaceSkeleton from '../../../src/features/co-star/components/CandidateWorkspaceSkeleton.vue';
import CoStarEmptyState from '../../../src/features/co-star/components/CoStarEmptyState.vue';
import CoStarWorkspace from '../../../src/features/co-star/components/CoStarWorkspace.vue';
import MobileCandidateEntry from '../../../src/features/co-star/components/MobileCandidateEntry.vue';
import type {
  CandidateResource,
  CandidateView,
} from '../../../src/features/co-star/model';
import { createCoStarSelection } from '../../../src/features/co-star/selection';
import AdaptivePagination from '../../../src/features/ranking/components/AdaptivePagination.vue';

const candidatePayload: CandidatePayload = Object.freeze({
  collection: Object.freeze({
    fetchedAt: '2026-07-25T00:00:00Z',
    stale: false,
    warningCodes: Object.freeze([]),
  }),
  dataVersion: `dv1-${'a'.repeat(64)}`,
  items: Object.freeze([
      Object.freeze({
      person: Object.freeze({
        id: 20,
        name: 'Both',
        nameCN: '共同',
      }),
        rank: 2,
        positionKeys: Object.freeze(['staff:anime:2']),
        workCount: 7,
    }),
    Object.freeze({
      person: Object.freeze({
        id: 8,
        name: 'Last Match',
        nameCN: null,
      }),
        rank: 8,
        positionKeys: Object.freeze(['staff:anime:2']),
        workCount: 1,
    }),
  ]),
  pagination: Object.freeze({
    page: 1,
    pageSize: 10,
    total: 2,
  }),
  positionCounts: Object.freeze([
    Object.freeze({ count: 8, positionKey: 'staff:anime:2' }),
    Object.freeze({ count: 3, positionKey: 'cast:anime:all' }),
  ]),
  positionKey: 'staff:anime:2',
  requestId: 'server-candidates',
  scope: 'personal',
  workUnit: 'subject',
});

const candidateView: Readonly<CandidateView> = Object.freeze({
  order: 'desc',
  page: 1,
  pageSize: 10,
  search: '',
  sort: 'count',
});

function resource(
  patch: Partial<CandidateResource> = {},
): CandidateResource {
  return {
    error: null,
    feedback: null,
    input: Object.freeze({ positionKey: 'staff:anime:2' }),
    payload: candidatePayload,
    phase: 'ready',
    view: candidateView,
    viewPending: false,
    ...patch,
  };
}

const labels: Record<string, string> = {
  'cast:anime:all': '声优',
  'staff:anime:2': '导演',
};
const positionLabel = (key: string) => labels[key] ?? key;

function installCompactMatchMedia(targetWindow: Window): void {
  Object.defineProperty(targetWindow, 'matchMedia', {
    configurable: true,
    value: vi.fn(
      () =>
        ({
          addEventListener: vi.fn(),
          dispatchEvent: () => true,
          matches: true,
          media: '(width < 780px)',
          onchange: null,
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    ),
  });
}

function installResponsiveMatchMedia(
  targetWindow: Window,
  initialMatches: boolean,
): (matches: boolean) => void {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const media = {
    addEventListener: vi.fn(
      (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.add(listener);
      },
    ),
    dispatchEvent: () => true,
    matches: initialMatches,
    media: '(width < 780px)',
    onchange: null,
    removeEventListener: vi.fn(
      (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.delete(listener);
      },
    ),
  } as unknown as MediaQueryList;
  Object.defineProperty(targetWindow, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => media),
  });
  return (matches: boolean) => {
    Object.defineProperty(media, 'matches', {
      configurable: true,
      value: matches,
    });
    const event = Object.assign(new Event('change'), {
      matches,
      media: media.media,
    }) as MediaQueryListEvent;
    listeners.forEach((listener) => listener(event));
  };
}

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(window, 'matchMedia');
});

describe('candidate picker', () => {
  it('shows the multi-person hint for one person in the tray and accessible mobile entry, then hides it for a pair', async () => {
    const selection = createCoStarSelection([{ person: candidatePayload.items[0]!.person, positionKey: 'staff:anime:2', positionLabel: '导演' }]);
    const hint = '可继续选择人物，进行多人共演分析';
    const picker = mount(CandidatePicker, { props: {
      cancel: vi.fn(), executeView: vi.fn(async () => true), positionLabel, resource: resource(), retry: vi.fn(async () => true), selection,
    } });
    const entry = mount(MobileCandidateEntry, { props: { expanded: false, selection } });
    try {
      expect(picker.text()).toContain('点选下方候选人物，查看与已选人物的共演情况');
      expect(entry.text()).toContain(hint);
      expect(entry.get('button').attributes('aria-label')).toContain(hint);
      await entry.setProps({ expanded: true });
      expect(entry.text()).not.toContain(hint);
      expect(entry.get('button').attributes('aria-label')).not.toContain(hint);
      await entry.setProps({ expanded: false });
      expect(entry.text()).toContain(hint);
      await picker.findAll('button.candidate-row')[1]!.trigger('click');
      await nextTick();
      expect(selection.personCount.value).toBe(2);
      expect(picker.find('.co-star-multi-person-hint').exists()).toBe(false);
      expect(entry.text()).not.toContain(hint);
      expect(entry.get('button').attributes('aria-label')).not.toContain(hint);
    } finally {
      picker.unmount();
      entry.unmount();
    }
  });

  it('keeps the selected tray keyboard-operable without losing identities', async () => {
    const selection = createCoStarSelection([{ person: candidatePayload.items[0]!.person, positionKey: 'staff:anime:2', positionLabel: '导演' }]);
    const wrapper = mount(CandidatePicker, { props: {
      cancel: vi.fn(), executeView: vi.fn(async () => true), positionLabel, resource: resource(), retry: vi.fn(async () => true), selection,
    } });
    const toggle = wrapper.get('button.candidate-selected-tray-toggle');
    const content = wrapper.get('.candidate-selected-scroll-boundary');
    await toggle.trigger('click');
    expect(toggle.attributes('aria-expanded')).toBe('false');
    expect(content.element.hasAttribute('inert')).toBe(true);
    await toggle.trigger('click');
    expect(toggle.attributes('aria-expanded')).toBe('true');
    expect(content.element.hasAttribute('inert')).toBe(false);
    expect(selection.personCount.value).toBe(1);
    wrapper.unmount();
  });

  it('tracks remaining content at both selected-list edges', async () => {
    const wrapper = mount(CandidatePicker, { props: {
      cancel: vi.fn(), executeView: vi.fn(async () => true), positionLabel,
      resource: resource(), retry: vi.fn(), selection: createCoStarSelection(),
    } });
    await nextTick();
    const list = wrapper.get('.candidate-selected-people');
    const element = list.element as HTMLElement;
    Object.defineProperties(element, {
      clientHeight: { configurable: true, value: 166 },
      scrollHeight: { configurable: true, value: 400 },
    });
    const boundary = wrapper.get('.candidate-selected-scroll-boundary');
    await list.trigger('scroll');
    expect(boundary.classes()).not.toContain('can-scroll-up');
    expect(boundary.classes()).toContain('can-scroll-down');
    element.scrollTop = 100;
    await list.trigger('scroll');
    expect(boundary.classes()).toContain('can-scroll-up');
    expect(boundary.classes()).toContain('can-scroll-down');
    element.scrollTop = 234;
    await list.trigger('scroll');
    expect(boundary.classes()).toContain('can-scroll-up');
    expect(boundary.classes()).not.toContain('can-scroll-down');
    element.scrollTop = 0;
    Object.defineProperty(element, 'scrollHeight', { configurable: true, value: 166 });
    await list.trigger('scroll');
    expect(boundary.classes()).not.toContain('can-scroll-up');
    expect(boundary.classes()).not.toContain('can-scroll-down');
    wrapper.unmount();
  });

  it('defaults to all positions and atomically toggles a mixed identity set', async () => {
    const mixedPayload: CandidatePayload = Object.freeze({
      ...candidatePayload,
      positionKey: null,
      items: Object.freeze([
        Object.freeze({
          ...candidatePayload.items[0]!,
          positionKeys: Object.freeze([
            'staff:anime:2',
            'cast:anime:all',
          ]),
        }),
      ]),
      pagination: Object.freeze({ ...candidatePayload.pagination, total: 1 }),
    });
    const selection = createCoStarSelection();
    const wrapper = mount(CandidatePicker, {
      props: {
        cancel: vi.fn(),
        executeView: vi.fn(async () => true),
        positionLabel,
        resource: resource({
          input: Object.freeze({ positionKey: null }),
          payload: mixedPayload,
        }),
        retry: vi.fn(async () => true),
        selection,
      },
    });

    expect(wrapper.text()).not.toContain('浏览职位');
    expect(wrapper.get('[aria-label="候选职位范围"]').text()).toContain(
      '全部职位',
    );
    expect(wrapper.get('.candidate-row').text()).toContain('导演 · 声优');
    await wrapper.get('.candidate-row').trigger('click');
    expect(selection.identities.value.map((identity) => identity.positionKey)).toEqual([
      'staff:anime:2',
      'cast:anime:all',
    ]);
    await wrapper.get('[aria-label="移除共同的声优身份"]').trigger('click');
    expect(wrapper.get('.candidate-row').attributes('aria-pressed')).toBe('mixed');
    expect(wrapper.get('.candidate-row').attributes('aria-label')).toBe('共同已选导演身份；补选声优身份');
    expect(wrapper.get('.candidate-row').text()).toContain('已选部分身份');
    expect(wrapper.get('.co-star-multi-person-hint').text()).toContain('点选下方候选人物');
    await wrapper.get('.candidate-row').trigger('click');
    expect(selection.personCount.value).toBe(1);
    expect(selection.identityCount.value).toBe(2);
    expect(wrapper.get('.candidate-row').attributes('aria-pressed')).toBe('true');
    await wrapper.get('.candidate-row').trigger('click');
    expect(selection.identityCount.value).toBe(0);
    expect(wrapper.find('.co-star-multi-person-hint').exists()).toBe(false);
  });

  it('keeps an explicit all-position input ahead of a stale pending payload', async () => {
    vi.useFakeTimers();
    const executeView = vi.fn(async () => true);
    const wrapper = mount(CandidatePicker, {
      props: {
        cancel: vi.fn(),
        executeView,
        positionLabel,
        resource: resource({
          input: Object.freeze({ positionKey: null }),
          viewPending: true,
        }),
        retry: vi.fn(async () => true),
        selection: createCoStarSelection(),
      },
    });

    expect(wrapper.get('[aria-label="候选职位范围"]').text()).toContain(
      '全部职位',
    );
    expect(
      wrapper.get('.candidate-position-results').attributes('aria-label'),
    ).toBe('全部职位候选人物');
    expect(wrapper.get('.candidate-browser__heading').text()).toBe('候选人物');
    expect(wrapper.get('.candidate-browser__heading').text()).not.toContain(
      '/ 8',
    );

    await wrapper.get('input[name="candidateSearch"]').setValue('石原');
    await vi.advanceTimersByTimeAsync(240);
    expect(executeView).toHaveBeenCalledWith(
      { positionKey: null },
      expect.objectContaining({ page: 1, search: '石原' }),
    );
  });

  it('renders server ranks/counts and toggles only the current identity', async () => {
    const selection = createCoStarSelection([
      {
        person: candidatePayload.items[0]!.person,
        positionKey: 'cast:anime:all',
        positionLabel: '声优',
      },
    ]);
    const wrapper = mount(CandidatePicker, {
      props: {
        cancel: vi.fn(),
        executeView: vi.fn(async () => true),
        positionLabel,
        resource: resource(),
        retry: vi.fn(async () => true),
        selection,
      },
    });
    const rows = wrapper.findAll('button.candidate-row');

    expect(rows).toHaveLength(2);
    expect(rows[0]!.text()).toContain('#2');
    expect(rows[0]!.text()).toContain('7 部');
    expect(rows[0]!.text()).toContain('已选其他身份：声优');
    expect(rows[0]!.attributes('aria-pressed')).toBe('false');

    await rows[0]!.trigger('click');
    expect(selection.has(20, 'staff:anime:2')).toBe(true);
    expect(selection.has(20, 'cast:anime:all')).toBe(true);
    expect(selection.people.value).toHaveLength(1);
    expect(selection.identityCount.value).toBe(2);
    expect(wrapper.text()).toContain('1 人');
    expect(wrapper.text()).toContain('2 身份');
  });

  it('keeps tray and toolbar while only rows and pagination are pending', () => {
    const selection = createCoStarSelection([
      {
        person: candidatePayload.items[0]!.person,
        positionKey: 'staff:anime:2',
        positionLabel: '导演',
      },
    ]);
    const wrapper = mount(CandidatePicker, {
      props: {
        cancel: vi.fn(),
        executeView: vi.fn(async () => true),
        positionLabel,
        resource: resource({ viewPending: true }),
        retry: vi.fn(async () => true),
        selection,
      },
    });

    expect(wrapper.text()).toContain('已选人物');
    expect(wrapper.text()).toContain('共同');
    expect(wrapper.find('input[name="candidateSearch"]').exists()).toBe(true);
    expect(wrapper.find('button.candidate-row').exists()).toBe(false);
    expect(wrapper.find('.candidate-row-skeletons').exists()).toBe(true);
    expect(wrapper.findAll('.candidate-row--skeleton')).toHaveLength(candidateView.pageSize);
    expect(wrapper.findComponent(AdaptivePagination).props('pending')).toBe(true);
    expect(wrapper.find('.candidate-pagination-skeleton').exists()).toBe(false);
    expect(wrapper.get('.candidate-position-results').attributes('aria-busy')).toBe(
      'true',
    );
  });

  it('uses the same candidate card structure for first load and hides unknown pagination', () => {
    const wrapper = mount(CandidatePicker, {
      props: {
        cancel: vi.fn(), executeView: vi.fn(async () => true), positionLabel,
        resource: resource({ payload: null, phase: 'pending' }),
        retry: vi.fn(async () => true), selection: createCoStarSelection([]),
      },
    });
    expect(wrapper.findAll('.candidate-row--skeleton')).toHaveLength(candidateView.pageSize);
    expect(wrapper.find('.candidate-row__portrait .n-skeleton').exists()).toBe(true);
    expect(wrapper.find('button.candidate-row').exists()).toBe(false);
    expect(wrapper.findComponent(AdaptivePagination).exists()).toBe(false);
  });

  it('debounces search as a view-only request and resets page', async () => {
    vi.useFakeTimers();
    const executeView = vi.fn(
      async (_input: unknown, _view: unknown) => true,
    );
    const wrapper = mount(CandidatePicker, {
      props: {
        cancel: vi.fn(),
        executeView,
        positionLabel,
        resource: resource({
          view: Object.freeze({ ...candidateView, page: 4 }),
        }),
        retry: vi.fn(async () => true),
        selection: createCoStarSelection(),
      },
    });

    await wrapper.get('input[name="candidateSearch"]').setValue('林');
    expect(executeView).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(240);

    expect(executeView).toHaveBeenCalledWith(
      { positionKey: 'staff:anime:2' },
      expect.objectContaining({
        page: 1,
        search: '林',
      }),
    );
    expect(executeView.mock.calls[0]![0]).not.toHaveProperty('selection');
  });

  it('keeps the position filter with the toolbar controls and preserves position changes', async () => {
    vi.useFakeTimers();
    const setCompact = installResponsiveMatchMedia(window, false);
    const executeView = vi.fn(async (_input: unknown, _view: unknown) => true);
    const wrapper = mount(CandidatePicker, {
      props: {
        cancel: vi.fn(), executeView, positionLabel,
        resource: resource({ view: { ...candidateView, page: 4, search: '林' } }),
        retry: vi.fn(), selection: createCoStarSelection(),
      },
    });
    const toolbar = wrapper.get('.candidate-toolbar');
    const position = toolbar.get('.search-sort-toolbar__filters').getComponent(NSelect);

    expect(wrapper.find('.candidate-position-browser').exists()).toBe(false);
    expect(toolbar.getComponent(NInput).props('size')).toBe('medium');
    expect(position.props()).toMatchObject({ size: 'medium', menuSize: 'medium' });

    setCompact(true);
    await nextTick();
    expect(toolbar.getComponent(NInput).props('size')).toBe('small');
    expect(position.props()).toMatchObject({ size: 'small', menuSize: 'small' });

    await toolbar.get('input[name="candidateSearch"]').setValue('旧搜索');
    position.vm.$emit('update:value', 'cast:anime:all');
    await nextTick();
    await vi.advanceTimersByTimeAsync(240);
    expect(executeView).toHaveBeenCalledOnce();
    expect(executeView).toHaveBeenCalledWith(
      { positionKey: 'cast:anime:all' },
      expect.objectContaining({ page: 1, search: '' }),
    );
    expect(toolbar.get<HTMLInputElement>('input[name="candidateSearch"]').element.value).toBe('');
    wrapper.unmount();
  });

  it('uses the same filter slot and compact size in the initial candidate skeleton', async () => {
    installCompactMatchMedia(window);
    const wrapper = mount(CandidateWorkspaceSkeleton);
    await nextTick();
    const toolbar = wrapper.get('.candidate-toolbar');
    const position = toolbar.get('.search-sort-toolbar__filters').getComponent(NSelect);

    expect(wrapper.find('.candidate-position-browser').exists()).toBe(false);
    expect(toolbar.getComponent(NInput).props()).toMatchObject({ size: 'small', disabled: true });
    expect(position.props()).toMatchObject({ size: 'small', menuSize: 'small', disabled: true, loading: true });
    wrapper.unmount();
  });

  it('drops a pending search debounce when a primary query starts', async () => {
    vi.useFakeTimers();
    const executeView = vi.fn(async () => true);
    const wrapper = mount(CandidatePicker, {
      props: {
        cancel: vi.fn(),
        executeView,
        positionLabel,
        resource: resource(),
        retry: vi.fn(async () => true),
        selection: createCoStarSelection(),
      },
    });

    await wrapper.get('input[name="candidateSearch"]').setValue('旧查询');
    await wrapper.setProps({
      resource: resource({
        phase: 'pending',
        view: Object.freeze({
          ...candidateView,
          search: '',
        }),
      }),
    });
    await nextTick();
    await vi.advanceTimersByTimeAsync(240);

    expect(executeView).not.toHaveBeenCalled();
    expect(
      (wrapper.get('input[name="candidateSearch"]').element as HTMLInputElement)
        .value,
    ).toBe('');
  });

  it('shows the stable accessible selection limit without mutating accepted identities', async () => {
    const selection = createCoStarSelection(
      Array.from({ length: 10 }, (_, index) => ({
        person: {
          id: index + 1,
          name: `Person ${index + 1}`,
          nameCN: null,
        },
        positionKey: 'staff:anime:2',
        positionLabel: '导演',
      })),
    );
    const limitedPayload = Object.freeze({
      ...candidatePayload,
      items: Object.freeze([
      Object.freeze({
          person: Object.freeze({
            id: 99,
            name: 'Eleventh',
            nameCN: '第十一人',
          }),
        rank: 11,
        positionKeys: Object.freeze(['staff:anime:2']),
        workCount: 1,
        }),
      ]),
    });
    const wrapper = mount(CandidatePicker, {
      props: {
        cancel: vi.fn(),
        executeView: vi.fn(async () => true),
        positionLabel,
        resource: resource({ payload: limitedPayload }),
        retry: vi.fn(async () => true),
        selection,
      },
    });

    await wrapper.get('button.candidate-row').trigger('click');

    expect(selection.personCount.value).toBe(10);
    expect(wrapper.get('[role="alert"]').text()).toBe('最多选择 10 人');
  });

  it('reveals and retains focus on candidate results only after an accepted page', async () => {
    vi.useFakeTimers();
    const executeView = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const wrapper = mount(CandidatePicker, {
      attachTo: document.body,
      props: {
        cancel: vi.fn(),
        executeView,
        positionLabel,
        resource: resource(),
        retry: vi.fn(async () => true),
        selection: createCoStarSelection(),
      },
    });
    const results = wrapper.get('.candidate-position-results');
    const scrollIntoView = vi.fn();
    Object.defineProperty(results.element, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    const pagination = wrapper.findComponent(AdaptivePagination);

    pagination.vm.$emit('page', 2);
    await flushPromises();
    expect(scrollIntoView).not.toHaveBeenCalled();

    pagination.vm.$emit('page', 2);
    await flushPromises();
    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(results.element);
    expect(results.classes()).toContain('is-reveal-attention');

    await vi.advanceTimersByTimeAsync(900);
    expect(document.activeElement).toBe(results.element);
    expect(results.classes()).not.toContain('is-reveal-attention');
    wrapper.unmount();
  });

  it('restores keyboard focus after removing an identity or the final person', async () => {
    const selection = createCoStarSelection(
      candidatePayload.items.map((item) => ({
        person: item.person,
        positionKey: item.positionKeys[0]!,
        positionLabel: positionLabel(item.positionKeys[0]!),
      })),
    );
    const wrapper = mount(CandidatePicker, {
      attachTo: document.body,
      props: {
        cancel: vi.fn(),
        executeView: vi.fn(async () => true),
        positionLabel,
        resource: resource(),
        retry: vi.fn(async () => true),
        selection,
      },
    });
    const firstIdentity = wrapper.findAll<HTMLButtonElement>(
      '.candidate-selected-position',
    )[0]!;
    expect(firstIdentity.element.tagName).toBe('BUTTON');
    expect(firstIdentity.attributes('aria-label')).toBe('移除共同的导演身份');
    expect(firstIdentity.get('.n-tag').text()).toBe('导演');
    expect(firstIdentity.find('button, [role="button"], [tabindex]').exists()).toBe(false);
    firstIdentity.element.focus();
    await firstIdentity.trigger('click');

    const survivingIdentity = wrapper.get<HTMLButtonElement>(
      '.candidate-selected-position',
    );
    expect(document.activeElement).toBe(survivingIdentity.element);

    const finalPersonRemove = wrapper.get<HTMLButtonElement>(
      '.candidate-selected-person__remove',
    );
    finalPersonRemove.element.focus();
    await finalPersonRemove.trigger('click');
    expect(document.activeElement).toBe(
      wrapper.get('.candidate-selected-tray-toggle').element,
    );
    expect(document.activeElement).not.toBe(document.body);
    wrapper.unmount();
  });
});

describe('co-star zero-person topology', () => {
  it('preserves the oracle empty copy and emits the exact opening control', async () => {
    const wrapper = mount(CoStarEmptyState);
    const action = wrapper.get('button');

    expect(wrapper.text()).toContain('尚未选择人物');
    expect(action.text()).toBe('选择人物');
    await action.trigger('click');
    expect(wrapper.emitted('select')?.[0]?.[0]).toBe(action.element);
  });

  it('uses the oracle desktop action to identify the persistent rail', async () => {
    vi.useFakeTimers();
    Reflect.deleteProperty(window, 'matchMedia');
    const wrapper = mount(CoStarWorkspace, {
      attachTo: document.body,
      props: {
        cancel: vi.fn(),
        executeView: vi.fn(async () => true),
        positionLabel,
        resource: resource(),
        retry: vi.fn(async () => true),
        selection: createCoStarSelection(),
      },
    });
    const rail = wrapper.get('.co-star-candidate-rail');
    const scrollIntoView = vi.fn();
    Object.defineProperty(rail.element, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });

    expect(rail.classes()).not.toContain('is-attention');
    await wrapper.get('.co-star-empty button').trigger('click');
    await flushPromises();
    expect(rail.classes()).toContain('is-attention');
    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(
      wrapper.get('input[name="candidateSearch"]').element,
    );

    await vi.advanceTimersByTimeAsync(900);
    expect(rail.classes()).not.toContain('is-attention');
    expect(document.activeElement).toBe(
      wrapper.get('input[name="candidateSearch"]').element,
    );
    wrapper.unmount();
  });

  it('opens the compact picker in flow from the empty action and closes it with Escape', async () => {
    const targetWindow = window;
    installCompactMatchMedia(targetWindow);
    const wrapper = mount(CoStarWorkspace, {
      attachTo: document.body,
      props: {
        cancel: vi.fn(),
        executeView: vi.fn(async () => true),
        positionLabel,
        resource: resource(),
        retry: vi.fn(async () => true),
        selection: createCoStarSelection(),
        targetWindow,
      },
    });
    await nextTick();
    const entry = wrapper.get<HTMLButtonElement>('.co-star-mobile-entry');
    const panel = wrapper.get<HTMLElement>('#co-star-mobile-picker-panel');
    expect(entry.attributes()).toMatchObject({
      'aria-controls': 'co-star-mobile-picker-panel',
      'aria-expanded': 'false',
    });
    expect(entry.attributes('aria-haspopup')).toBeUndefined();
    expect(panel.attributes()).toMatchObject({
      'aria-hidden': 'true',
      inert: 'true',
      role: 'region',
    });
    const action = wrapper.get('.co-star-empty button');
    (action.element as HTMLElement).focus();
    await action.trigger('click');
    await nextTick();

    expect(entry.attributes('aria-expanded')).toBe('true');
    expect(panel.attributes('aria-hidden')).toBeUndefined();
    expect(panel.attributes('inert')).toBeUndefined();
    expect(wrapper.element.contains(panel.element)).toBe(true);
    expect(document.body.querySelector('.n-drawer-container')).toBeNull();
    expect(panel.find('.candidate-picker__heading').exists()).toBe(false);
    expect(panel.get('.candidate-picker').classes()).not.toContain('is-drawer');
    expect(
      panel.find('button[aria-label="关闭人物选择"]').exists(),
    ).toBe(false);
    const search = panel.get<HTMLInputElement>(
      'input[name="candidateSearch"]',
    );
    expect(document.activeElement).toBe(search.element);
    await search.trigger('keydown', { key: 'Escape' });
    await nextTick();

    expect(entry.attributes('aria-expanded')).toBe('false');
    expect(panel.attributes()).toMatchObject({
      'aria-hidden': 'true',
      inert: 'true',
    });
    expect(document.activeElement).toBe(entry.element);
    wrapper.unmount();
  });

  it('toggles the in-flow picker from its summary without moving focus', async () => {
    installCompactMatchMedia(window);
    const wrapper = mount(CoStarWorkspace, {
      attachTo: document.body,
      props: {
        cancel: vi.fn(),
        executeView: vi.fn(async () => true),
        positionLabel,
        resource: resource(),
        retry: vi.fn(async () => true),
        selection: createCoStarSelection(),
        targetWindow: window,
      },
    });
    await nextTick();
    const entry = wrapper.get<HTMLButtonElement>('.co-star-mobile-entry');
    entry.element.focus();

    await entry.trigger('click');
    await nextTick();
    expect(entry.attributes('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(entry.element);

    await entry.trigger('click');
    await nextTick();
    expect(entry.attributes('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(entry.element);
    wrapper.unmount();
  });

  it('returns focus to the persistent mobile entry when the empty opener disappears', async () => {
    const targetWindow = window;
    installCompactMatchMedia(targetWindow);
    const selection = createCoStarSelection();
    const wrapper = mount(CoStarWorkspace, {
      attachTo: document.body,
      props: {
        cancel: vi.fn(),
        executeView: vi.fn(async () => true),
        positionLabel,
        resource: resource(),
        retry: vi.fn(async () => true),
        selection,
        targetWindow,
      },
    });
    await nextTick();
    const opener = wrapper.get('.co-star-empty button');
    await opener.trigger('click');
    await nextTick();

    selection.toggle({
      person: candidatePayload.items[0]!.person,
      positionKey: 'staff:anime:2',
      positionLabel: '导演',
    });
    await nextTick();
    expect(opener.element.isConnected).toBe(false);

    const search = wrapper.get<HTMLInputElement>(
      '#co-star-mobile-picker-panel input[name="candidateSearch"]',
    );
    search.element.focus();
    await search.trigger('keydown', { key: 'Escape' });
    await nextTick();

    expect(document.activeElement).toBe(
      wrapper.get('.co-star-mobile-entry').element,
    );
    wrapper.unmount();
  });

  it('moves rail focus to the compact entry without opening the accordion', async () => {
    const targetWindow = window;
    const setCompact = installResponsiveMatchMedia(targetWindow, false);
    const wrapper = mount(CoStarWorkspace, {
      attachTo: document.body,
      props: {
        cancel: vi.fn(),
        executeView: vi.fn(async () => true),
        positionLabel,
        resource: resource(),
        retry: vi.fn(async () => true),
        selection: createCoStarSelection(),
        targetWindow,
      },
    });
    await nextTick();
    const desktopSearch = wrapper.get<HTMLInputElement>(
      'input[name="candidateSearch"]',
    );
    desktopSearch.element.focus();
    desktopSearch.element.blur();
    expect(document.activeElement).toBe(document.body);

    setCompact(true);
    await nextTick();

    const entry = wrapper.get<HTMLButtonElement>('.co-star-mobile-entry');
    expect(document.activeElement).toBe(entry.element);
    expect(entry.attributes('aria-expanded')).toBe('false');
    expect(document.activeElement).not.toBe(document.body);
    wrapper.unmount();
  });

  it('moves accordion focus to desktop search and leaves external focus alone', async () => {
    const targetWindow = window;
    const setCompact = installResponsiveMatchMedia(targetWindow, true);
    const external = document.createElement('button');
    document.body.append(external);
    const wrapper = mount(CoStarWorkspace, {
      attachTo: document.body,
      props: {
        cancel: vi.fn(),
        executeView: vi.fn(async () => true),
        positionLabel,
        resource: resource(),
        retry: vi.fn(async () => true),
        selection: createCoStarSelection(),
        targetWindow,
      },
    });
    await nextTick();
    const entry = wrapper.get<HTMLButtonElement>('.co-star-mobile-entry');
    entry.element.focus();
    await entry.trigger('click');
    await nextTick();
    const panelSearch = wrapper.get<HTMLInputElement>(
      '#co-star-mobile-picker-panel input[name="candidateSearch"]',
    );
    panelSearch.element.focus();
    expect(document.activeElement).toBe(panelSearch.element);
    panelSearch.element.blur();
    expect(document.activeElement).toBe(document.body);

    setCompact(false);
    await nextTick();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    const desktopSearch = wrapper.get<HTMLInputElement>(
      'input[name="candidateSearch"]',
    );
    expect(document.activeElement).toBe(desktopSearch.element);
    expect(document.activeElement).not.toBe(document.body);

    external.focus();
    setCompact(true);
    await nextTick();
    expect(document.activeElement).toBe(external);
    setCompact(false);
    await nextTick();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(document.activeElement).toBe(external);

    wrapper.unmount();
    external.remove();
  });

  it('moves compact summary focus to desktop search at 780px', async () => {
    const targetWindow = window;
    const setCompact = installResponsiveMatchMedia(targetWindow, true);
    const wrapper = mount(CoStarWorkspace, {
      attachTo: document.body,
      props: {
        cancel: vi.fn(),
        executeView: vi.fn(async () => true),
        positionLabel,
        resource: resource(),
        retry: vi.fn(async () => true),
        selection: createCoStarSelection(),
        targetWindow,
      },
    });
    await nextTick();
    wrapper.get<HTMLButtonElement>('.co-star-mobile-entry').element.focus();

    setCompact(false);
    await nextTick();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(document.activeElement).toBe(
      wrapper.get<HTMLInputElement>('input[name="candidateSearch"]').element,
    );
    expect(document.activeElement).not.toBe(document.body);
    wrapper.unmount();
  });
});
