import { mount } from '@vue/test-utils';
import { NDrawerContent } from 'naive-ui';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CandidatePayload } from '../../../src/api/adapters/candidates';
import CandidatePicker from '../../../src/features/co-star/components/CandidatePicker.vue';
import CoStarEmptyState from '../../../src/features/co-star/components/CoStarEmptyState.vue';
import CoStarWorkspace from '../../../src/features/co-star/components/CoStarWorkspace.vue';
import type {
  CandidateResource,
  CandidateView,
} from '../../../src/features/co-star/model';
import { createCoStarSelection } from '../../../src/features/co-star/selection';

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
      workCount: 7,
    }),
    Object.freeze({
      person: Object.freeze({
        id: 8,
        name: 'Last Match',
        nameCN: null,
      }),
      rank: 8,
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

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(window, 'matchMedia');
});

describe('candidate picker', () => {
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
    expect(wrapper.find('.candidate-row').exists()).toBe(false);
    expect(wrapper.find('.candidate-row-skeletons').exists()).toBe(true);
    expect(wrapper.find('.candidate-pagination-skeleton').exists()).toBe(true);
    expect(wrapper.get('.candidate-position-results').attributes('aria-busy')).toBe(
      'true',
    );
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

    expect(rail.classes()).not.toContain('is-attention');
    await wrapper.get('.co-star-empty button').trigger('click');
    expect(rail.classes()).toContain('is-attention');

    await vi.advanceTimersByTimeAsync(900);
    expect(rail.classes()).not.toContain('is-attention');
  });

  it('uses the compact bottom Drawer and restores focus after close', async () => {
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
    const action = wrapper.get('.co-star-empty button');
    (action.element as HTMLElement).focus();
    await action.trigger('click');
    await nextTick();

    expect(wrapper.get('.co-star-mobile-entry').attributes('aria-expanded')).toBe(
      'true',
    );
    const close = document.body.querySelector<HTMLButtonElement>(
      'button[aria-label="关闭人物选择"]',
    );
    expect(close).not.toBeNull();
    const scrollbarProps = wrapper
      .findComponent(NDrawerContent)
      .props('scrollbarProps') as {
      containerStyle: { overscrollBehavior: string };
      onWheel: (event: WheelEvent) => void;
    };
    expect(scrollbarProps.containerStyle).toEqual({
      overscrollBehavior: 'contain',
    });
    const scrollContainer = document.createElement('div');
    Object.defineProperties(scrollContainer, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 300 },
      scrollTop: { configurable: true, value: 200, writable: true },
    });
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    scrollbarProps.onWheel({
      currentTarget: scrollContainer,
      deltaY: 1,
      preventDefault,
      stopPropagation,
    } as unknown as WheelEvent);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();

    close!.click();
    await nextTick();
    await new Promise((resolve) => window.setTimeout(resolve, 400));

    expect(wrapper.get('.co-star-mobile-entry').attributes('aria-expanded')).toBe(
      'false',
    );
    expect(document.activeElement).toBe(action.element);
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

    document.body
      .querySelector<HTMLButtonElement>(
        'button[aria-label="关闭人物选择"]',
      )
      ?.click();
    await nextTick();
    await new Promise((resolve) => window.setTimeout(resolve, 400));

    expect(document.activeElement).toBe(
      wrapper.get('.co-star-mobile-entry').element,
    );
    wrapper.unmount();
  });
});
