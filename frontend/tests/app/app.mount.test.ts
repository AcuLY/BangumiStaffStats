import { nextTick } from 'vue';
import { describe, expect, it } from 'vitest';

describe('formal SPA mount', () => {
  it('mounts one semantic ready surface through the production entry', async () => {
    document.body.innerHTML = '<div id="app"></div>';

    await import('../../src/app/main');
    await nextTick();

    expect(document.title).toBe('Bangumi Staff Statistics');
    expect(document.querySelectorAll('[data-app-root]')).toHaveLength(1);
    expect(document.querySelectorAll('main')).toHaveLength(1);
    expect(
      document.querySelector('[data-app-root]')?.getAttribute('data-app-ready'),
    ).toBe('true');
    expect(document.querySelectorAll('[id="main-content"]')).toHaveLength(1);
    expect(document.querySelectorAll('.app-brand-mark')).toHaveLength(0);
    expect(document.querySelector('.app-brand-name')?.textContent).toBe(
      'Bangumi Staff Statistics',
    );
    expect(document.body.textContent).toContain('应用基础已就绪');
    expect(document.body.textContent).toContain('数据请求');
    expect(document.body.textContent).toContain('尚未发起');
  });
});
