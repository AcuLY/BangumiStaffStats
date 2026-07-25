import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { mount } from '@vue/test-utils';
import { NSelect } from 'naive-ui';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { decodePersonDetailPayload } from '../../../src/api/adapters/personDetail';
import { packAdaptiveAppearanceRows } from '../../../src/features/person-detail/adaptiveAppearanceLayout';
import AdaptiveAppearanceList from '../../../src/features/person-detail/components/AdaptiveAppearanceList.vue';
import PersonDetailSurface from '../../../src/features/person-detail/components/PersonDetailSurface.vue';
import PersonInspector from '../../../src/features/person-detail/components/PersonInspector.vue';
import RatingEvidence from '../../../src/features/person-detail/components/RatingEvidence.vue';
import type { PersonDetailView } from '../../../src/features/person-detail/model';
import {
  closestTimelinePointIndex,
  timelineHitSizeInViewBox,
} from '../../../src/features/person-detail/ratingTimelineGeometry';

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
    acceptedQuery: {
      positionKeys: ['staff:anime:2'],
    },
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
  document.getElementById('app')?.remove();
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
    expect(
      wrapper.find('.person-profile .profile-metrics--extended').exists(),
    ).toBe(true);
    expect(wrapper.text()).toContain('作品标签');
    expect(wrapper.text()).toContain('评分分布');
    expect(wrapper.text()).toContain('导演');
    expect(wrapper.text()).not.toContain('staff:anime:2');
    expect(wrapper.text()).not.toContain('我的评分');
    expect(wrapper.text()).not.toContain('相对偏好');
    const globalSortOptions =
      wrapper.getComponent(NSelect).props('options') ?? [];
    expect(
      globalSortOptions.some((option) => option.value === 'name'),
    ).toBe(false);

    await wrapper
      .get('button[aria-label="查看综合分计算证据"]')
      .trigger('click');
    expect(document.body.textContent).toContain('5 个 × 5.00 分');
    expect(document.body.textContent).toContain('1 + 5 = 6');
    expect(document.body.textContent).toContain('最终综合分');
  });

  it('keeps the profile position line on the accepted query across server work views', async () => {
    const detail = payload('global.json');
    const wrapper = mount(PersonInspector, {
      props: {
        executeView: vi.fn(async () => true),
        positionLabel,
        resource: resource(detail, {
          acceptedQuery: {
            positionKeys: ['staffset:anime:directors'],
          },
        }),
        retry: vi.fn(async () => true),
      },
    });
    wrappers.push(wrapper);

    expect(wrapper.get('.person-profile__career').text()).toContain(
      '导演集合',
    );
    await wrapper.setProps({
      resource: resource(
        Object.freeze({
          ...detail,
          items: Object.freeze([]),
        }),
        {
          acceptedQuery: {
            positionKeys: ['staffset:anime:directors'],
          },
          view: {
            ...resource(detail).view,
            page: 2,
            search: '没有命中',
          },
        },
      ),
    });
    expect(wrapper.get('.person-profile__career').text()).toContain(
      '导演集合',
    );
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
    expect(wrapper.text()).toContain('收藏标签');
    expect(wrapper.find('.person-item-skeletons').exists()).toBe(true);
    expect(wrapper.find('.person-profile').exists()).toBe(true);
    await wrapper
      .get('button[aria-label="查看相对偏好计算证据"]')
      .trigger('click');
    expect(document.body.textContent).toContain('平均差异');
    expect(document.body.textContent).toContain('+0.80');
    expect(document.body.textContent).toContain('样本权重');
    expect(document.body.textContent).toContain('0.17');
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

    const sortValues = (
      wrapper.getComponent(NSelect).props('options') ?? []
    ).map((option) => option.value);
    expect(sortValues).toEqual(['role', 'workCount', 'name']);
    expect(wrapper.text()).toContain('金标主角');
  });

  it('keeps every overflowed character appearance keyboard and touch reachable', async () => {
    expect(
      packAdaptiveAppearanceRows(
        [80, 80, 80, 80],
        200,
        12,
        36,
      ),
    ).toEqual([
      { entries: [0, 1] },
      { entries: [2, 3] },
    ]);
    expect(
      packAdaptiveAppearanceRows(
        [180, 180, 180],
        300,
        12,
        36,
      ),
    ).toEqual([{ entries: [0], hiddenCount: 2 }]);

    const detail = payload('characters.json');
    const item = detail.items[0];
    if (!item || !('character' in item)) {
      throw new Error('character golden must contain a character item');
    }
    const appearance = item.appearances[0]!;
    const wrapper = mount(AdaptiveAppearanceList, {
      attachTo: document.body,
      props: {
        item: Object.freeze({
          ...item,
          appearances: Object.freeze([
            appearance,
            Object.freeze({
              ...appearance,
              subject: Object.freeze({
                ...appearance.subject,
                id: 2,
                name: 'Second Work',
                nameCN: '第二部作品',
              }),
            }),
            Object.freeze({
              ...appearance,
              subject: Object.freeze({
                ...appearance.subject,
                id: 3,
                name: 'Third Work',
                nameCN: '第三部作品',
              }),
            }),
          ]),
          workCount: 3,
        }),
      },
    });
    wrappers.push(wrapper);

    const overflow = wrapper.get(
      'button.character-role-card__source-more',
    );
    expect(overflow.attributes('aria-expanded')).toBe('false');
    await overflow.trigger('click');
    expect(overflow.attributes('aria-expanded')).toBe('true');
    await vi.waitFor(() => {
      expect(
        document.body.querySelectorAll(
          '.character-role-source-tooltip a',
        ),
      ).toHaveLength(3);
    });
    expect(document.body.textContent).toContain('第三部作品');
    await overflow.trigger('keydown', { key: 'Escape' });
    expect(overflow.attributes('aria-expanded')).toBe('false');
    await overflow.trigger('focus');
    expect(overflow.attributes('aria-expanded')).toBe('true');
  });

  it('preserves 4-unit timeline dots while exposing real 44px hits and adjacent-point keys', async () => {
    const detail = payload('global.json');
    const firstPoint = detail.ratings.global.timeline[0]!;
    const wrapper = mount(RatingEvidence, {
      attachTo: document.body,
      props: {
        payload: Object.freeze({
          ...detail,
          ratings: Object.freeze({
            ...detail.ratings,
            global: Object.freeze({
              ...detail.ratings.global,
              timeline: Object.freeze([
                firstPoint,
                Object.freeze({
                  ...firstPoint,
                  quarter: 2,
                  average: 840,
                }),
              ]),
            }),
          }),
        }),
      },
    });
    wrappers.push(wrapper);
    const timeControl = wrapper
      .findAll('.n-radio-button')
      .find((control) => control.text().includes('按时间'));
    if (!timeControl) {
      throw new Error('time chart control must exist');
    }
    await timeControl.trigger('click');

    const dots = wrapper.findAll(
      'circle.rating-time-chart__visible-point',
    );
    const hits = wrapper.findAll(
      'rect.rating-time-chart__hit-target',
    );
    expect(dots.map((dot) => dot.attributes('r'))).toEqual(['4', '4']);
    expect(hits).toHaveLength(2);
    expect(hits[0]!.attributes('tabindex')).toBe('0');
    expect(hits[0]!.attributes('aria-label')).toContain('方向键');
    const focusNext = vi.spyOn(
      hits[1]!.element as SVGElement,
      'focus',
    );
    await hits[0]!.trigger('keydown', { key: 'ArrowRight' });
    expect(focusNext).toHaveBeenCalledOnce();

    const hitSize = timelineHitSizeInViewBox(330, 236);
    expect((hitSize.width * 330) / 440).toBeCloseTo(44);
    expect((hitSize.height * 236) / 236).toBeCloseTo(44);
    expect(
      closestTimelinePointIndex(
        104,
        50,
        { height: 236, left: 0, top: 0, width: 440 },
        [
          { x: 100, y: 50 },
          { x: 112, y: 50 },
        ],
      ),
    ).toBe(0);
  });

  it('opens the compact surface as an isolated modal drawer and restores focus after Escape', async () => {
    const appRoot = document.createElement('div');
    appRoot.id = 'app';
    const opener = document.createElement('button');
    opener.textContent = '打开人物详情';
    appRoot.append(opener);
    document.body.append(appRoot);
    opener.focus();
    const wrapper = mount(PersonDetailSurface, {
      attachTo: appRoot,
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
      expect(document.activeElement).toBe(
        document.body.querySelector('.person-detail-drawer__close'),
      );
    });
    expect(document.body.style.overflow).toBe('hidden');
    expect(appRoot.inert).toBe(true);
    expect(appRoot.getAttribute('aria-hidden')).toBe('true');
    const backdrop = document.body.querySelector<HTMLButtonElement>(
      '.person-detail-drawer__backdrop',
    )!;
    expect(backdrop).not.toBeNull();
    expect(
      document.body.querySelector(
        '.person-detail-drawer__close-hit > .person-detail-drawer__close',
      ),
    ).not.toBeNull();
    backdrop.click();
    expect(wrapper.emitted('close')).toHaveLength(1);
    document.body
      .querySelector<HTMLElement>('.person-detail-drawer')!
      .dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          key: 'Escape',
        }),
      );
    expect(wrapper.emitted('close')).toHaveLength(2);
    await wrapper.setProps({ open: false });
    expect(document.body.style.overflow).toBe('');
    expect(appRoot.inert).toBe(false);
    expect(appRoot.hasAttribute('aria-hidden')).toBe(false);
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(opener);
    });
  });
});

describe('person-detail oracle cascade guards', () => {
  it('keeps compact portrait, narrow ranking, and drawer scroll ownership free of legacy overrides', () => {
    const personCss = fs.readFileSync(
      path.join(
        repositoryRoot,
        'frontend/src/features/person-detail/person-detail.css',
      ),
      'utf8',
    );
    const baseCss = fs.readFileSync(
      path.join(repositoryRoot, 'frontend/src/shared/styles/base.css'),
      'utf8',
    );

    expect(personCss).not.toContain('width: 112px !important');
    expect(personCss).not.toContain('height: 149px !important');
    expect(personCss).toMatch(
      /\.person-detail-drawer__scroll\s*\{[^}]*overflow:\s*hidden;/s,
    );
    expect(baseCss).not.toContain('grid-template-areas: none');
  });
});
