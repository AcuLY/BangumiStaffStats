import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { decodePersonDetailPayload } from '../../../src/api/adapters/personDetail';
import PersonDetailSurface from '../../../src/features/person-detail/components/PersonDetailSurface.vue';
import PersonInspector from '../../../src/features/person-detail/components/PersonInspector.vue';
import type { PersonDetailView } from '../../../src/features/person-detail/model';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);
const wrappers: ReturnType<typeof mount>[] = [];

function payload(filename: 'characters.json' | 'global.json' | 'personal.json') {
  const document = JSON.parse(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'contracts/goldens/api/person-detail/cases',
        filename,
      ),
      'utf8',
    ),
  ) as { cases: Array<{ expected: { body: unknown } }> };
  return decodePersonDetailPayload(document.cases[0]!.expected.body);
}

function resource(
  detail = payload('global.json'),
  patch: Record<string, unknown> = {},
) {
  return {
    error: null,
    feedback: null,
    input: { personId: detail.person.id },
    payload: detail,
    phase: 'ready' as const,
    view: {
      order: 'desc',
      page: 1,
      pageSize: detail.pagination.pageSize,
      search: '',
      section: detail.section,
      sort: detail.section === 'characters' ? 'role' : 'globalScore',
    } satisfies PersonDetailView,
    viewPending: false,
    ...patch,
  };
}

function positionLabel(positionKey: string, exactPositionKey?: string) {
  if (positionKey === 'staffset:anime:directors') {
    return {
      detail: exactPositionKey ? '具体职位：导演' : undefined,
      label: '导演集合',
    };
  }
  return { label: '导演' };
}

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.style.overflow = '';
});

describe('person inspector production presentation', () => {
  it('renders the global hierarchy, omits personal sections, and never exposes opaque staff keys', async () => {
    const wrapper = mount(PersonInspector, {
      props: {
        executeView: vi.fn(async () => true),
        positionLabel,
        resource: resource(),
        retry: vi.fn(async () => true),
      },
    });
    wrappers.push(wrapper);

    expect(wrapper.text()).toContain('金标导演');
    expect(wrapper.text()).toContain('参与概览');
    expect(wrapper.text()).toContain('评分分布');
    expect(wrapper.text()).toContain('导演');
    expect(wrapper.text()).not.toContain('staff:anime:2');
    expect(wrapper.text()).not.toContain('我的评分');
    expect(wrapper.text()).not.toContain('相对偏好');
    expect(
      wrapper.find('option[value="name"]').exists(),
    ).toBe(false);

    await wrapper
      .get('button[aria-label="查看综合分计算证据"]')
      .trigger('click');
    expect(wrapper.text()).toContain('5 个 × 5.00 分');
    expect(wrapper.text()).toContain('1 + 5 = 6');
    expect(wrapper.text()).toContain('最终综合分');
  });

  it('renders personal calculation evidence with shared signed formatting and preserves identity during view pending', async () => {
    const personal = payload('personal.json');
    const wrapper = mount(PersonInspector, {
      props: {
        executeView: vi.fn(async () => true),
        positionLabel,
        resource: resource(personal, {
          viewPending: true,
        }),
        retry: vi.fn(async () => true),
      },
    });
    wrappers.push(wrapper);

    expect(wrapper.text()).toContain('金标导演');
    expect(wrapper.text()).toContain('+0.13');
    expect(wrapper.text()).toContain('我的标签');
    expect(wrapper.find('.person-item-skeletons').exists()).toBe(true);
    expect(wrapper.find('.person-profile').exists()).toBe(true);
    await wrapper
      .get('button[aria-label="查看相对偏好计算证据"]')
      .trigger('click');
    expect(wrapper.text()).toContain('平均差异');
    expect(wrapper.text()).toContain('+0.80');
    expect(wrapper.text()).toContain('样本权重');
    expect(wrapper.text()).toContain('0.17');
  });

  it('offers name sorting only for the server-side character section', () => {
    const wrapper = mount(PersonInspector, {
      props: {
        executeView: vi.fn(async () => true),
        positionLabel,
        resource: resource(payload('characters.json')),
        retry: vi.fn(async () => true),
      },
    });
    wrappers.push(wrapper);

    expect(wrapper.find('option[value="role"]').exists()).toBe(true);
    expect(wrapper.find('option[value="workCount"]').exists()).toBe(true);
    expect(wrapper.find('option[value="name"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('金标主角');
  });

  it('opens the compact surface as a modal drawer, focuses close, and restores body scrolling on close', async () => {
    const wrapper = mount(PersonDetailSurface, {
      attachTo: document.body,
      props: {
        compact: true,
        executeView: vi.fn(async () => true),
        open: true,
        positionLabel,
        resource: resource(),
        retry: vi.fn(async () => true),
        targetWindow: window,
      },
    });
    wrappers.push(wrapper);
    await vi.waitFor(() => {
      expect(document.activeElement?.getAttribute('aria-label')).toBe(
        '关闭人物详情',
      );
    });
    expect(document.body.style.overflow).toBe('hidden');
    const close = document.body.querySelector<HTMLButtonElement>(
      '.person-detail-drawer__bar button',
    )!;
    close.click();
    expect(wrapper.emitted('close')).toHaveLength(1);
    await wrapper.setProps({ open: false });
    expect(document.body.style.overflow).toBe('');
  });
});
