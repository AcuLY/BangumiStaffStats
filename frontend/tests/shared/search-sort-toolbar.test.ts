import { enableAutoUnmount, mount, type VueWrapper } from '@vue/test-utils';
import { NButton, NInput, NSelect } from 'naive-ui';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { h, nextTick } from 'vue';

import SearchSortToolbar from '../../src/shared/components/SearchSortToolbar.vue';
import SortDirectionButton from '../../src/shared/components/SortDirectionButton.vue';

const defaultProps = {
  search: '',
  sort: 'count',
  order: 'desc',
  options: [
    { label: '作品数', value: 'count' },
    { label: '均分', value: 'average' },
  ],
  searchLabel: '搜索候选人物',
  sortLabel: '排序依据',
} as const;

function installResponsiveMatchMedia(initialMatches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const media = {
    matches: initialMatches,
    media: '(width < 780px)',
    addEventListener: (
      _type: string,
      listener: (event: MediaQueryListEvent) => void,
    ) => listeners.add(listener),
    removeEventListener: (
      _type: string,
      listener: (event: MediaQueryListEvent) => void,
    ) => listeners.delete(listener),
  };
  vi.stubGlobal('matchMedia', vi.fn(() => media));

  return (matches: boolean) => {
    media.matches = matches;
    const event = Object.assign(new Event('change'), {
      matches,
      media: media.media,
    }) as MediaQueryListEvent;
    listeners.forEach((listener) => listener(event));
  };
}

function expectControlSize(wrapper: VueWrapper, size: 'small' | 'medium') {
  expect(wrapper.getComponent(NInput).props('size')).toBe(size);
  expect(wrapper.getComponent(NSelect).props('size')).toBe(size);
  expect(wrapper.getComponent(NSelect).props('menuSize')).toBe(size);
  expect(wrapper.getComponent(SortDirectionButton).props('size')).toBe(size);
  expect(wrapper.getComponent(NButton).props('size')).toBe(size);
}

enableAutoUnmount(afterEach);
afterEach(() => vi.unstubAllGlobals());

describe('shared search and sort toolbar', () => {
  it.each([
    { compact: false, size: 'medium' },
    { compact: true, size: 'small' },
  ] as const)(
    'uses $size for every control and the select menu on initial render',
    async ({ compact, size }) => {
      installResponsiveMatchMedia(compact);
      const wrapper = mount(SearchSortToolbar, { props: defaultProps });
      await nextTick();

      expectControlSize(wrapper, size);
    },
  );

  it('updates all control sizes and the filter slot together when the viewport changes', async () => {
    const setCompact = installResponsiveMatchMedia(false);
    const wrapper = mount(SearchSortToolbar, {
      props: defaultProps,
      slots: {
        filters: ({ size }: { size: 'small' | 'medium' }) =>
          h('span', { 'data-filter-size': size }),
      },
    });
    await nextTick();

    expectControlSize(wrapper, 'medium');
    expect(wrapper.get('[data-filter-size]').attributes('data-filter-size')).toBe(
      'medium',
    );

    setCompact(true);
    await nextTick();
    expectControlSize(wrapper, 'small');
    expect(wrapper.get('[data-filter-size]').attributes('data-filter-size')).toBe(
      'small',
    );

    setCompact(false);
    await nextTick();
    expectControlSize(wrapper, 'medium');
    expect(wrapper.get('[data-filter-size]').attributes('data-filter-size')).toBe(
      'medium',
    );
  });

  it('keeps search, sort, direction, and explicit submission as separate actions', async () => {
    installResponsiveMatchMedia(false);
    const wrapper = mount(SearchSortToolbar, { props: defaultProps });
    const input = wrapper.get('input');

    await input.setValue('石原');
    expect(wrapper.emitted('search')).toEqual([['石原']]);
    expect(wrapper.emitted('sort')).toBeUndefined();
    expect(wrapper.emitted('order')).toBeUndefined();
    expect(wrapper.emitted('submit')).toBeUndefined();

    wrapper.getComponent(NSelect).vm.$emit('update:value', 'average');
    expect(wrapper.emitted('sort')).toEqual([['average']]);
    expect(wrapper.emitted('submit')).toBeUndefined();

    const directionButton = wrapper.get('button');
    expect(directionButton.attributes('type')).toBe('button');
    await directionButton.trigger('click');
    expect(wrapper.emitted('order')).toEqual([['asc']]);
    expect(wrapper.emitted('submit')).toBeUndefined();

    await wrapper.setProps({ order: 'asc' });
    expect(directionButton.attributes('aria-label')).toBe(
      '排序方向：当前升序，切换为降序',
    );
    await directionButton.trigger('click');
    expect(wrapper.emitted('order')).toEqual([['asc'], ['desc']]);

    const submit = new Event('submit', { bubbles: true, cancelable: true });
    wrapper.get('form').element.dispatchEvent(submit);
    expect(submit.defaultPrevented).toBe(true);
    expect(wrapper.emitted('submit')).toEqual([[]]);
    expect(wrapper.emitted('search')).toEqual([['石原']]);
    expect(wrapper.emitted('sort')).toEqual([['average']]);
  });

  it('keeps filter controls after search and before the sort controls in DOM order', () => {
    installResponsiveMatchMedia(false);
    const wrapper = mount(SearchSortToolbar, {
      props: defaultProps,
      slots: {
        filters: ({ size }: { size: 'small' | 'medium' }) =>
          h(NSelect, {
            size,
            menuSize: size,
            options: [{ label: '全部职位', value: 'all' }],
            value: 'all',
            'aria-label': '筛选职位',
          }),
      },
    });
    const labels = wrapper.findAll(
      '.search-sort-toolbar__search, .search-sort-toolbar__filters > *, .search-sort-toolbar__sort, .search-sort-toolbar__order',
    ).map((element) => element.attributes('aria-label'));

    expect(labels).toEqual([
      '搜索候选人物',
      '筛选职位',
      '排序依据',
      '排序方向：当前降序，切换为升序',
    ]);
    expect(wrapper.get('.search-sort-toolbar__controls').findAllComponents(NSelect)).toHaveLength(2);
  });

  it('disables every action while waiting and restores them together', async () => {
    installResponsiveMatchMedia(false);
    const wrapper = mount(SearchSortToolbar, {
      props: { ...defaultProps, disabled: true },
    });

    expect(wrapper.get('input').element.disabled).toBe(true);
    expect(wrapper.getComponent(NSelect).props('disabled')).toBe(true);
    expect(wrapper.get('button').element.disabled).toBe(true);
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('order')).toBeUndefined();
    expect(wrapper.emitted('submit')).toBeUndefined();

    await wrapper.setProps({ disabled: false });
    expect(wrapper.get('input').element.disabled).toBe(false);
    expect(wrapper.getComponent(NSelect).props('disabled')).toBe(false);
    expect(wrapper.get('button').element.disabled).toBe(false);
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('order')).toEqual([['asc']]);
  });

  it('preserves accessible labels, input identity, and the caller focus reference', async () => {
    installResponsiveMatchMedia(false);
    const wrapper = mount(SearchSortToolbar, {
      attachTo: document.body,
      props: {
        ...defaultProps,
        searchName: 'candidate-search',
        orderLabel: '候选人物排序方向',
        searchIcon: true,
      },
    });
    await nextTick();
    const input = wrapper.get('input[name="candidate-search"]');

    expect(wrapper.get('form').attributes('role')).toBe('search');
    expect(input.attributes('aria-label')).toBe('搜索候选人物');
    expect(input.attributes('placeholder')).toBe('搜索人物');
    expect(wrapper.find('[aria-label="排序依据"]').exists()).toBe(true);
    expect(wrapper.get('button').attributes('aria-label')).toBe(
      '候选人物排序方向：当前降序，切换为升序',
    );

    const exposed = wrapper.vm as unknown as {
      inputElRef: HTMLInputElement | null;
    };
    expect(exposed.inputElRef).toBe(input.element);
    exposed.inputElRef!.focus();
    expect(document.activeElement).toBe(input.element);
  });
});
