import { mount } from '@vue/test-utils';
import { NDatePicker, NEmpty, NPagination, NPopconfirm, NSelect } from 'naive-ui';
import { h, nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

import AppProviders from '../../src/app/AppProviders.vue';

const originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo');

describe('Chinese component defaults', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalScrollTo) Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo);
    else Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
  });
  it.each(['light', 'dark'] as const)('localizes component portals in %s mode', async (theme) => {
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
    const wrapper = mount(AppProviders, {
      attachTo: document.body,
      props: { theme },
      slots: {
        default: () => [
          h(NEmpty),
          h(NSelect, { options: [] }),
          h(NPagination, { pageCount: 5, showQuickJumper: true }),
          h(NDatePicker, { show: true, type: 'month', value: new Date(2026, 0, 1).getTime(), actions: ['clear', 'confirm'] }),
          h(NDatePicker, { show: true, type: 'date', value: new Date(2026, 0, 1).getTime() }),
          h(NPopconfirm, { show: true }, { default: () => '确认继续？', trigger: () => h('button', '操作') }),
        ],
      },
    });
    await nextTick();
    const text = document.body.textContent ?? '';
    expect(text).toContain('无数据');
    expect(text).toContain('请选择');
    expect(text).toContain('跳至');
    expect(text).toContain('清除');
    expect(text).toContain('确认');
    expect(text).toContain('取消');
    expect(text).toContain('2026年');
    expect(text).not.toMatch(/No Data|Please Select|Go to|January|Confirm|Cancel|Clear/);
    wrapper.unmount();
  });
});
