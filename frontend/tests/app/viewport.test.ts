import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import AppViewport from '../../src/app/AppViewport.vue';

afterEach(() => vi.unstubAllGlobals());

it('reserves the measured header height and updates it after the header resizes', async () => {
  let headerHeight = 60;
  let notifyHeaderResize = () => {};
  const disconnect = vi.fn();
  const originalRect = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('app-header')
      ? new DOMRect(0, 0, 800, headerHeight)
      : originalRect.call(this);
  });
  vi.stubGlobal('ResizeObserver', class {
    constructor(private callback: ResizeObserverCallback) {}
    observe(element: Element) {
      if (element.classList.contains('app-header')) {
        notifyHeaderResize = () => this.callback([], this as unknown as ResizeObserver);
      }
    }
    unobserve() {}
    disconnect = disconnect;
  });
  const wrapper = mount(AppViewport, {
    slots: { header: '<button>Header action</button>', default: '<main class="app-main">Content</main>' },
  });
  try {
    await flushPromises();
    expect((wrapper.element as HTMLElement).style.getPropertyValue('--app-header-height')).toBe('60px');
    expect(wrapper.find('.app-page-scroll .app-main').exists()).toBe(true);
    expect(wrapper.find('.app-page-scroll .app-header').exists()).toBe(false);
    headerHeight = 88;
    notifyHeaderResize();
    await flushPromises();
    expect((wrapper.element as HTMLElement).style.getPropertyValue('--app-header-height')).toBe('88px');
  } finally {
    wrapper.unmount();
  }
  expect(disconnect).toHaveBeenCalled();
});
