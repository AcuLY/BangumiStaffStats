import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';

describe('formal SPA mount', () => {
  it(
    'mounts one fixture-free query shell through the production entry',
    async () => {
      document.body.innerHTML = '<div id="app"></div>';
      window.history.replaceState({}, '', '/ranking');
      const fetch = vi.fn(async () => {
        throw new TypeError('offline');
      });
      vi.stubGlobal('fetch', fetch);

      await import('../../src/app/main');
      await nextTick();

      expect(document.title).toBe('Bangumi Staff Statistics');
      expect(document.querySelectorAll('[data-app-root]')).toHaveLength(1);
      expect(document.querySelectorAll('main')).toHaveLength(1);
      expect(
        document
          .querySelector('[data-app-root]')
          ?.getAttribute('data-app-ready'),
      ).toBe('true');
      expect(document.querySelectorAll('[id="main-content"]')).toHaveLength(1);
      expect(document.querySelectorAll('.app-brand__mark')).toHaveLength(1);
      expect(document.querySelector('.app-brand__name')?.textContent).toBe(
        'Bangumi Staff Statistics',
      );
      const siteInformation = document.querySelector(
        'footer nav[aria-label="站点信息"]',
      );
      const footerLinks = siteInformation?.querySelectorAll('a');
      expect(siteInformation).not.toBeNull();
      expect(footerLinks).toHaveLength(2);
      expect(footerLinks?.[0]?.textContent?.trim()).toBe('问题反馈');
      expect(footerLinks?.[0]?.getAttribute('href')).toBe(
        'https://bgm.tv/group/topic/407903',
      );
      expect(footerLinks?.[0]?.getAttribute('target')).toBe('_blank');
      expect(footerLinks?.[0]?.getAttribute('rel')).toBe(
        'noopener noreferrer',
      );
      expect(footerLinks?.[1]?.textContent?.trim()).toBe(
        '粤ICP备2024321317号',
      );
      expect(footerLinks?.[1]?.getAttribute('href')).toBe(
        'https://beian.miit.gov.cn/',
      );
      expect(footerLinks?.[1]?.getAttribute('target')).toBe('_blank');
      expect(footerLinks?.[1]?.getAttribute('rel')).toBe(
        'noopener noreferrer',
      );
      expect(document.body.textContent).toContain('人物排行');
      expect(document.body.textContent).toContain('共演分析');
      expect(document.body.textContent).toContain('编辑查询');
      expect(document.body.textContent).toContain('职位目录');
      expect(document.body.textContent).not.toContain('应用基础已就绪');
      expect(document.body.textContent).not.toContain(
        'Bangumi Staff Statistics · 数据口径以当前查询与 Archive 版本为准',
      );
      expect(document.body.innerHTML).not.toContain('loadFixtures');
      expect(fetch).toHaveBeenCalledWith(
        '/api/v1/catalog',
        expect.objectContaining({ method: 'GET' }),
      );
      vi.unstubAllGlobals();
    },
    10_000,
  );
});
