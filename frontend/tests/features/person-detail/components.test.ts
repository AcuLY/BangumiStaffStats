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
import PersonDetailSkeleton from '../../../src/features/person-detail/components/PersonDetailSkeleton.vue';
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
  document.documentElement.style.overflow = '';
  document.getElementById('app')?.remove();
});

function cssBlock(source: string, marker: string): string {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error(`CSS block is missing: ${marker}`);
  }
  const open = source.indexOf('{', markerIndex);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') {
      depth += 1;
    } else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(open + 1, index);
      }
    }
  }
  throw new Error(`CSS block is not closed: ${marker}`);
}

function mountSkeletonGeometry(
  layout: 'desktop' | 'drawer-wide' | 'drawer-compact',
) {
  const source = fs.readFileSync(
    path.join(
      repositoryRoot,
      'frontend/src/features/person-detail/components/PersonDetailSkeleton.vue',
    ),
    'utf8',
  );
  const componentStyle = source.match(/<style scoped>([\s\S]*?)<\/style>/)?.[1];
  if (!componentStyle) {
    throw new Error('PersonDetailSkeleton scoped style is missing');
  }
  let effectiveStyle = componentStyle;
  if (layout !== 'desktop') {
    effectiveStyle += cssBlock(componentStyle, '@media (width < 780px)');
  }
  if (layout === 'drawer-compact') {
    effectiveStyle += cssBlock(
      componentStyle,
      '@container person-detail-skeleton (max-width: 480px)',
    );
    effectiveStyle += cssBlock(componentStyle, '@media (max-width: 520px)');
  }
  const resolvedStyle = effectiveStyle
    .replace(/:global\(([^)]+)\)/g, '$1')
    .replaceAll('var(--divider)', '#d8d8de')
    .replaceAll('var(--radius-card)', '12px')
    .replaceAll('var(--radius-control)', '8px')
    .replaceAll('var(--space-1)', '4px')
    .replaceAll('var(--space-2)', '8px')
    .replaceAll('var(--space-3)', '12px')
    .replaceAll('var(--space-4)', '16px');
  const style = document.createElement('style');
  style.textContent = resolvedStyle;
  document.head.append(style);

  const host = document.createElement('section');
  if (layout !== 'desktop') {
    host.className = 'person-detail-drawer';
  }
  document.body.append(host);
  const wrapper = mount(PersonDetailSkeleton, { attachTo: host });

  return {
    cleanup() {
      wrapper.unmount();
      host.remove();
      style.remove();
    },
    wrapper,
  };
}

function pixels(value: string): number {
  return value === '' ? 0 : Number.parseFloat(value);
}

describe('person detail skeleton geometry', () => {
  it('renders the desktop portrait flush and top-aligns both columns', () => {
    const fixture = mountSkeletonGeometry('desktop');
    try {
      const root = fixture.wrapper.get('.person-detail-skeleton').element;
      const profile = fixture.wrapper.get('.person-profile-skeleton').element;
      const portrait = fixture.wrapper.get(
        '.person-profile-skeleton > i',
      ).element;
      const copy = fixture.wrapper.get(
        '.person-profile-skeleton > span',
      ).element;
      const rootStyle = getComputedStyle(root);
      const profileStyle = getComputedStyle(profile);
      const portraitStyle = getComputedStyle(portrait);
      const copyStyle = getComputedStyle(copy);

      expect(fixture.wrapper.attributes('aria-busy')).toBe('true');
      expect(pixels(rootStyle.paddingLeft)).toBe(0);
      expect(profileStyle.display).toBe('grid');
      expect(profileStyle.alignContent).toBe('start');
      expect(profileStyle.alignItems).toBe('start');
      expect(portraitStyle.width).toBe('160px');
      expect(portraitStyle.height).toBe('213px');
      expect(portraitStyle.alignSelf).toBe('start');
      expect(copyStyle.padding).toBe('20px 24px 8px');
      expect(copyStyle.alignContent).toBe('start');
      expect(copyStyle.alignItems).toBe('start');
    } finally {
      fixture.cleanup();
    }
  });

  it('keeps the 636px Drawer on final-profile desktop geometry', () => {
    const fixture = mountSkeletonGeometry('drawer-wide');
    try {
      const root = fixture.wrapper.get('.person-detail-skeleton').element;
      const profile = fixture.wrapper.get('.person-profile-skeleton').element;
      const portrait = fixture.wrapper.get(
        '.person-profile-skeleton > i',
      ).element;
      const copy = fixture.wrapper.get(
        '.person-profile-skeleton > span',
      ).element;
      const rootStyle = getComputedStyle(root);
      const profileStyle = getComputedStyle(profile);
      const portraitStyle = getComputedStyle(portrait);
      const copyStyle = getComputedStyle(copy);

      expect(portraitStyle.width).toBe('160px');
      expect(portraitStyle.height).toBe('213px');
      expect(portraitStyle.borderRadius).toBe('0px');
      expect(pixels(rootStyle.paddingLeft)).toBe(0);
      expect(pixels(profileStyle.paddingLeft)).toBe(0);
      expect(copyStyle.padding).toBe('20px 24px 8px');
    } finally {
      fixture.cleanup();
    }
  });

  it('renders compact drawer geometry with a square 96 by 128 portrait and only the profile inset', () => {
    const fixture = mountSkeletonGeometry('drawer-compact');
    try {
      const root = fixture.wrapper.get('.person-detail-skeleton').element;
      const profile = fixture.wrapper.get('.person-profile-skeleton').element;
      const portrait = fixture.wrapper.get(
        '.person-profile-skeleton > i',
      ).element;
      const copy = fixture.wrapper.get(
        '.person-profile-skeleton > span',
      ).element;
      const rootStyle = getComputedStyle(root);
      const profileStyle = getComputedStyle(profile);
      const portraitStyle = getComputedStyle(portrait);
      const copyStyle = getComputedStyle(copy);
      const portraitInlineStart =
        pixels(rootStyle.paddingLeft) + pixels(profileStyle.paddingLeft);

      expect(portraitStyle.width).toBe('96px');
      expect(portraitStyle.height).toBe('128px');
      expect(portraitStyle.borderRadius).toBe('0px');
      expect(portraitStyle.alignSelf).toBe('start');
      expect(profileStyle.alignContent).toBe('start');
      expect(profileStyle.alignItems).toBe('start');
      expect(copyStyle.padding).toBe('4px 0px');
      expect(copyStyle.alignContent).toBe('start');
      expect(copyStyle.alignItems).toBe('start');
      expect(portraitInlineStart).toBe(16);
      expect(portraitInlineStart).not.toBe(20);
    } finally {
      fixture.cleanup();
    }
  });
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

    const evidenceTrigger = wrapper.get(
      'button[aria-label="查看综合分计算证据"]',
    );
    expect(evidenceTrigger.classes()).toContain('info-trigger');
    expect(evidenceTrigger.find('.app-icon').exists()).toBe(true);
    expect(evidenceTrigger.text()).toBe('');
    await evidenceTrigger.trigger('click');
    expect(document.body.textContent).toContain('5 个 × 5.00 分');
    expect(document.body.textContent).toContain('1 + 5 = 6');
    expect(document.body.textContent).toContain('最终综合分');
  });

  it('keeps a long contribution summary inside the stretched role fact', () => {
    const detail = payload('personal.json');
    const firstItem = detail.items[0];
    if (!firstItem || !('subject' in firstItem)) {
      throw new Error('personal golden must contain a subject item');
    }
    const contribution = firstItem.contributions[0];
    if (!contribution) {
      throw new Error('personal golden must contain a contribution');
    }
    const longLabel = '配音·配角与其他长名参与职位';
    const longDetail = Object.freeze({
      ...detail,
      items: Object.freeze([
        Object.freeze({
          ...firstItem,
          contributions: Object.freeze(
            Array.from({ length: 4 }, () => contribution),
          ),
        }),
        ...detail.items.slice(1),
      ]),
    });
    const wrapper = mount(PersonInspector, {
      props: {
        executeView: vi.fn(async () => true),
        positionLabel: () => ({ label: longLabel }),
        resource: resource(longDetail),
        retry: vi.fn(async () => true),
      },
    });
    wrappers.push(wrapper);

    const role = wrapper.get('.subject-work-row__role-fact dd');
    expect(role.text()).toBe(Array(4).fill(longLabel).join(' / '));
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
    const populatedScoreBar = wrapper
      .findAll('.person-score-bar')
      .find((bar) => !bar.classes().includes('is-empty'));
    expect(populatedScoreBar).toBeDefined();
    const scoreTrack = populatedScoreBar!.get('.score-bar__track');
    expect(scoreTrack.attributes('style')).toContain('--score-bar-height');
    expect(scoreTrack.find('.score-bar__value').exists()).toBe(true);
    expect(scoreTrack.get('i').attributes('style')).toBeUndefined();
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
        document.body.querySelector('.person-detail-drawer'),
      );
    });
    const dialog = document.body.querySelector<HTMLElement>(
      '.person-detail-drawer',
    )!;
    expect(dialog.getAttribute('aria-label')).toBe('人物详情');
    expect(
      dialog.querySelector('.person-detail-drawer__bar strong'),
    ).toBeNull();
    expect(document.body.style.overflow).toBe('');
    expect(document.documentElement.style.overflow).toBe('hidden');
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
    document.body
      .querySelector<HTMLElement>('.person-detail-drawer')!
      .dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          key: 'Tab',
        }),
      );
    expect(document.activeElement).toBe(
      document.body.querySelector('.person-detail-drawer__close'),
    );
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
    expect(document.documentElement.style.overflow).toBe('');
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
    const ratingSource = fs.readFileSync(
      path.join(
        repositoryRoot,
        'frontend/src/features/person-detail/components/RatingEvidence.vue',
      ),
      'utf8',
    );
    const evidenceSource = fs.readFileSync(
      path.join(
        repositoryRoot,
        'frontend/src/features/person-detail/components/StatEvidencePopover.vue',
      ),
      'utf8',
    );
    const surfaceSource = fs.readFileSync(
      path.join(
        repositoryRoot,
        'frontend/src/features/person-detail/components/PersonDetailSurface.vue',
      ),
      'utf8',
    );
    const appIconSource = fs.readFileSync(
      path.join(repositoryRoot, 'frontend/src/shared/components/AppIcon.vue'),
      'utf8',
    );
    const browserSource = fs.readFileSync(
      path.join(
        repositoryRoot,
        'frontend/src/features/person-detail/components/PersonItemBrowser.vue',
      ),
      'utf8',
    );
    const directionSource = fs.readFileSync(
      path.join(
        repositoryRoot,
        'frontend/src/features/ranking/components/SortDirectionButton.vue',
      ),
      'utf8',
    );

    expect(personCss).not.toContain('width: 112px !important');
    expect(personCss).not.toContain('height: 149px !important');
    expect(personCss).toMatch(
      /\.person-profile__portrait\s*\{[^}]*width:\s*160px;[^}]*height:\s*213px;[^}]*align-self:\s*start;[^}]*aspect-ratio:\s*3\s*\/\s*4;/s,
    );
    expect(personCss).toMatch(
      /\.subject-work-row__role-fact dd\s*\{[^}]*font-weight:\s*600;/s,
    );
    expect(personCss).toMatch(
      /\.subject-work-row__facts\.person-work-row__facts\s*\{[^}]*justify-self:\s*stretch;/s,
    );
    expect(personCss).toMatch(
      /\.subject-work-row__role-fact dd\s*\{[^}]*overflow-wrap:\s*anywhere;/s,
    );
    expect(personCss).toMatch(
      /@container person-inspector \(max-width:\s*480px\)[\s\S]*?\.person-profile__portrait\s*\{[^}]*width:\s*96px;[^}]*height:\s*128px;[^}]*border-radius:\s*0;/,
    );
    expect(personCss).toMatch(
      /@media \(width < 780px\)[\s\S]*?\.person-detail-drawer \.person-profile__portrait\s*\{[^}]*border-radius:\s*0;/,
    );
    expect(personCss).toMatch(
      /\.person-detail-drawer \.person-profile__portrait\s*\{[^}]*width:\s*96px;[^}]*height:\s*128px;[^}]*border-radius:\s*0;/s,
    );
    expect(personCss).toMatch(
      /\.person-detail-drawer__scroll\s*\{[^}]*overflow:\s*hidden;/s,
    );
    expect(personCss).toMatch(
      /\.person-profile__intro\s*\{[^}]*align-content:\s*start;[^}]*align-items:\s*start;/s,
    );
    expect(personCss).toMatch(
      /\.person-detail-drawer__bar\s*\{[^}]*justify-content:\s*flex-end;/s,
    );
    expect(personCss).not.toMatch(/\.person-detail-drawer__bar strong\s*\{/);
    expect(personCss).toMatch(
      /\.person-score-bar \.score-bar__value\s*\{[^}]*bottom:\s*calc\(var\(--score-bar-height\) \+ 4px\);/s,
    );
    expect(ratingSource).toContain('pointer-events: none;');
    expect(ratingSource).toMatch(
      /class="person-score-bar__track score-bar__track"[\s\S]*?--score-bar-height[\s\S]*?<i \/>/,
    );
    expect(evidenceSource).toContain('<app-icon name="info" :size="16" />');
    expect(evidenceSource).not.toMatch(/>\s*i\s*</);
    expect(appIconSource).toContain("| 'info'");
    expect(appIconSource).toContain("name === 'info'");
    expect(surfaceSource).toContain(
      'document.documentElement.style.overflow',
    );
    expect(surfaceSource).not.toContain('document.body.style.overflow');
    expect(surfaceSource).not.toContain('<strong>人物详情</strong>');
    expect(surfaceSource).toContain('aria-label="人物详情"');
    expect(baseCss).not.toContain('grid-template-areas: none');
    expect(browserSource).not.toContain('toolbarControlSize');
    const workToolbarSource = browserSource.match(
      /<form[\s\S]*?class="person-item-toolbar work-list-toolbar"[\s\S]*?<\/form>/,
    )?.[0];
    expect(workToolbarSource).toBeDefined();
    expect(workToolbarSource?.match(/:size="controlSize"/g)).toHaveLength(3);
    expect(workToolbarSource).toContain(':menu-size="controlSize"');
    expect(directionSource).toContain("size?: 'small' | 'medium';");
    expect(directionSource).toContain('props.size ??');
    expect(personCss).not.toMatch(
      /\.person-item-toolbar\s+:is\(input, select\)/,
    );
    expect(personCss).not.toMatch(
      /\.person-item-toolbar input\s*\{/,
    );
    expect(personCss).toMatch(
      /\.person-item-toolbar\.work-list-toolbar\s*\{[^}]*align-items:\s*center;/s,
    );
    expect(personCss).toMatch(
      /\.person-item-toolbar\.work-list-toolbar\s*\{[^}]*--person-item-toolbar-visible-size:\s*34px;/s,
    );
    expect(personCss).toMatch(
      /\.person-item-toolbar\.work-list-toolbar\s*>\s*:is\(\.n-input, \.n-select, \.ranking-order-button\)::before\s*\{[^}]*inset-block:\s*calc\([^}]*--person-item-toolbar-visible-size[^}]*content:\s*"";/s,
    );
    expect(personCss).toMatch(
      /@media \(width < 780px\)[\s\S]*?\.person-item-toolbar\.work-list-toolbar\s*\{[^}]*--person-item-toolbar-visible-size:\s*28px;/s,
    );
  });
});
