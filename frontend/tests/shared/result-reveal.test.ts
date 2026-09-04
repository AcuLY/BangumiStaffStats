import { mount, shallowMount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useResultReveal } from '../../src/shared/composables/useResultReveal';
import RankingResults from '../../src/features/ranking/components/RankingResults.vue';
import AdaptivePagination from '../../src/features/ranking/components/AdaptivePagination.vue';
import { defaultRankingView, type RankingPayload } from '../../src/features/ranking/model';

const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');

function installReducedMotion(reduced: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query: string) => ({
      addEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches:
        query === '(prefers-reduced-motion: reduce)' ? reduced : false,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
    })),
  });
}

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
  if (originalMatchMedia) {
    Object.defineProperty(window, 'matchMedia', originalMatchMedia);
  } else {
    Reflect.deleteProperty(window, 'matchMedia');
  }
});

describe('result reveal', () => {
  it('scrolls, focuses, attends for 900ms, and never blurs on expiry', async () => {
    vi.useFakeTimers();
    installReducedMotion(false);
    let revealApi: ReturnType<typeof useResultReveal> | undefined;
    const Harness = defineComponent({
      setup() {
        revealApi = useResultReveal(window);
        return () =>
          h(
            'section',
            {
              ref: revealApi!.target,
              class: {
                'is-reveal-attention': revealApi!.attention.value,
              },
              tabindex: -1,
            },
            [h('input', { class: 'focus-option' })],
          );
      },
    });
    const wrapper = mount(Harness, { attachTo: document.body });
    const target = wrapper.get('section').element as HTMLElement;
    const scrollIntoView = vi.fn();
    target.scrollIntoView = scrollIntoView;

    await revealApi!.reveal();

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
      inline: 'nearest',
    });
    expect(document.activeElement).toBe(target);
    expect(wrapper.get('section').classes()).toContain('is-reveal-attention');

    await vi.advanceTimersByTimeAsync(900);
    expect(wrapper.get('section').classes()).not.toContain(
      'is-reveal-attention',
    );
    expect(document.activeElement).toBe(target);
    wrapper.unmount();
  });

  it('uses instant reduced-motion scrolling and preserves an explicit focus target', async () => {
    installReducedMotion(true);
    let revealApi: ReturnType<typeof useResultReveal> | undefined;
    const Harness = defineComponent({
      setup() {
        revealApi = useResultReveal(window);
        return () =>
          h('section', { ref: revealApi!.target, tabindex: -1 }, [
            h('input', { class: 'focus-option' }),
          ]);
      },
    });
    const wrapper = mount(Harness, { attachTo: document.body });
    const target = wrapper.get('section').element as HTMLElement;
    const input = wrapper.get('input').element as HTMLInputElement;
    const scrollIntoView = vi.fn();
    target.scrollIntoView = scrollIntoView;

    await revealApi!.reveal({ focus: input });

    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: 'auto' }),
    );
    expect(document.activeElement).toBe(input);
    revealApi!.clear();
    wrapper.unmount();
  });

  it('reveals ranking pages only after the view request is accepted', async () => {
    installReducedMotion(false);
    const payload = Object.freeze({
      dataVersion: `dv1-${'a'.repeat(64)}`,
      items: Object.freeze([]),
      metricScale: Object.freeze({ kind: 'linear', max: 1, metric: 'count' }),
      pagination: Object.freeze({ page: 1, pageSize: 10, total: 30 }),
      requestId: 'ranking-reveal',
      scope: 'global',
      summary: Object.freeze({ personCount: 30, workCount: 10, workUnit: 'subject' }),
    }) as unknown as RankingPayload;
    const executeView = vi
      .fn<(view: Readonly<typeof defaultRankingView>) => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const wrapper = shallowMount(RankingResults, {
      attachTo: document.body,
      props: {
        executeView,
        resource: {
          error: null,
          payload,
          phase: 'ready',
          view: defaultRankingView,
          viewPending: false,
        },
        retry: vi.fn(async () => true),
      },
    });
    const target = wrapper.get('.result-reveal-target').element as HTMLElement;
    const scrollIntoView = vi.fn();
    target.scrollIntoView = scrollIntoView;
    const pagination = wrapper.getComponent(AdaptivePagination);

    pagination.vm.$emit('page', 2);
    await vi.waitFor(() => expect(executeView).toHaveBeenCalledTimes(1));
    expect(scrollIntoView).not.toHaveBeenCalled();

    pagination.vm.$emit('page', 3);
    await vi.waitFor(() => expect(scrollIntoView).toHaveBeenCalledOnce());
    expect(document.activeElement).toBe(target);
    wrapper.unmount();
  });
});
