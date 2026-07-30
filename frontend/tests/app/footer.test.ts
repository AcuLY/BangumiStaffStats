import { createPinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import App from '../../src/app/App.vue';

describe('formal SPA footer', () => {
  it('preserves the oracle site-information links and copy', () => {
    window.history.replaceState({}, '', '/ranking');
    const wrapper = mount(App, {
      attachTo: document.body,
      global: {
        plugins: [createPinia()],
        stubs: { teleport: true },
      },
      props: {
        services: {
          catalogApi: {
            load: async () => {
              throw new TypeError('offline');
            },
          },
          targetWindow: window,
        },
      },
    });

    const nav = wrapper.get('footer nav[aria-label="站点信息"]');
    const links = nav.findAll('a');

    expect(links).toHaveLength(2);
    expect(links[0]?.text()).toBe('问题反馈');
    expect(links[0]?.attributes()).toMatchObject({
      href: 'https://bgm.tv/group/topic/407903',
      rel: 'noopener noreferrer',
      target: '_blank',
    });
    expect(links[1]?.text()).toBe('粤ICP备2024321317号');
    expect(links[1]?.attributes()).toMatchObject({
      href: 'https://beian.miit.gov.cn/',
      rel: 'noopener noreferrer',
      target: '_blank',
    });
    expect(wrapper.text()).not.toContain(
      'Bangumi Staff Statistics · 数据口径以当前查询与 Archive 版本为准',
    );

    wrapper.unmount();
  });
});
