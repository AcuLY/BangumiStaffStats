import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import SafeImage from '../../src/shared/components/SafeImage.vue';
import { personImageCandidates } from '../../src/shared/media/bangumiImage';

afterEach(() => {
  vi.useRealTimers();
});

describe('SafeImage', () => {
  it('keeps a stable 3:4 box and distinguishes missing from loading', () => {
    const missing = mount(SafeImage, {
      props: {
        alt: '林明',
        sources: [],
        width: 45,
      },
    });
    expect(missing.attributes('data-image-state')).toBe('missing');
    expect(missing.attributes('style')).toContain('--safe-image-width: 45px');
    expect(missing.attributes('style')).toContain('--safe-image-height: 60px');
    expect(missing.find('img').exists()).toBe(false);
    expect(missing.get('[role="img"]').attributes('aria-label')).toBe(
      '林明 暂无图片',
    );

    const loading = mount(SafeImage, {
      props: {
        alt: '林明',
        sources: ['/api/v1/images/bangumi/persons/12?type=small'],
        width: 45,
      },
    });
    expect(loading.attributes('data-image-state')).toBe('loading');
    expect(loading.get('[role="status"]').attributes('aria-label')).toBe(
      '林明 图片加载中',
    );
    expect(loading.get('img').attributes()).toMatchObject({
      alt: '林明',
      height: '60',
      src: '/api/v1/images/bangumi/persons/12?type=small',
      width: '45',
    });
  });

  it('moves through loaded and all-candidates-error states', async () => {
    const wrapper = mount(SafeImage, {
      props: {
        alt: '林明',
        sources: [
          '/api/v1/images/bangumi/persons/12?type=small',
          '/api/v1/images/bangumi/persons/12?type=medium',
        ],
        width: 36,
      },
    });

    await wrapper.get('img').trigger('load');
    expect(wrapper.attributes('data-image-state')).toBe('loaded');
    expect(wrapper.find('.safe-image__fallback').exists()).toBe(false);

    await wrapper.get('img').trigger('error');
    expect(wrapper.attributes('data-image-state')).toBe('loading');
    expect(wrapper.get('img').attributes('src')).toContain('type=medium');
    await wrapper.get('img').trigger('error');
    expect(wrapper.attributes('data-image-state')).toBe('error');
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.get('[role="img"]').attributes('aria-label')).toBe(
      '林明 图片加载失败',
    );
  });

  it('advances each timed-out source and clears its timer on unmount', async () => {
    vi.useFakeTimers();
    const wrapper = mount(SafeImage, {
      props: {
        alt: '林明',
        sources: [
          '/api/v1/images/bangumi/persons/12?type=small',
          '/api/v1/images/bangumi/persons/12?type=medium',
        ],
        timeoutMs: 100,
        width: 36,
      },
    });

    await vi.advanceTimersByTimeAsync(100);
    expect(wrapper.get('img').attributes('src')).toContain('type=medium');
    expect(wrapper.attributes('data-image-state')).toBe('loading');
    await vi.advanceTimersByTimeAsync(100);
    expect(wrapper.attributes('data-image-state')).toBe('error');
    expect(vi.getTimerCount()).toBe(0);

    await wrapper.setProps({
      sources: ['/api/v1/images/bangumi/persons/13?type=small'],
    });
    expect(vi.getTimerCount()).toBe(1);
    wrapper.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects arbitrary image URLs and hides decorative state copy', () => {
    const wrapper = mount(SafeImage, {
      props: {
        alt: '林明',
        decorative: true,
        sources: [
          'https://api.bgm.tv/v0/persons/12/image?type=small',
          '//example.test/image',
        ],
        width: 36,
      },
    });

    expect(wrapper.attributes('data-image-state')).toBe('missing');
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.find('[role]').exists()).toBe(false);
    expect(wrapper.get('.safe-image__fallback').attributes('aria-hidden')).toBe(
      'true',
    );
  });
});

describe('Bangumi image policy', () => {
  it('derives only bounded same-origin person candidates by CSS width and DPR', () => {
    expect(personImageCandidates(12, 36, 2)).toEqual([
      '/api/v1/images/bangumi/persons/12?type=small',
      '/api/v1/images/bangumi/persons/12?type=medium',
      '/api/v1/images/bangumi/persons/12?type=large',
    ]);
    expect(personImageCandidates(12, 60, 2)[0]).toContain('type=medium');
    expect(personImageCandidates(0, 36, 2)).toEqual([]);
    expect(personImageCandidates(Number.NaN, 36, 2)).toEqual([]);
  });
});
