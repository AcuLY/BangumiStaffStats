import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { mount } from '@vue/test-utils';
import { NRadioGroup, NSelect, NTag } from 'naive-ui';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { decodePersonDetailPayload } from '../../../src/api/adapters/personDetail';
import { packAdaptiveAppearanceRows } from '../../../src/features/person-detail/adaptiveAppearanceLayout';
import AdaptiveAppearanceList from '../../../src/features/person-detail/components/AdaptiveAppearanceList.vue';
import PersonDetailSurface from '../../../src/features/person-detail/components/PersonDetailSurface.vue';
import PersonDetailSkeleton from '../../../src/features/person-detail/components/PersonDetailSkeleton.vue';
import PersonInspector from '../../../src/features/person-detail/components/PersonInspector.vue';
import PersonItemBrowser from '../../../src/features/person-detail/components/PersonItemBrowser.vue';
import RatingEvidence from '../../../src/features/person-detail/components/RatingEvidence.vue';
import AdaptivePagination from '../../../src/features/ranking/components/AdaptivePagination.vue';
import type {
  PersonDetailPayload,
  PersonDetailRatingSet,
  PersonDetailView,
} from '../../../src/features/person-detail/model';
import {
  closestTimelinePointIndex,
  timelineHitSizeInViewBox,
} from '../../../src/features/person-detail/ratingTimelineGeometry';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);
const wrappers: ReturnType<typeof mount>[] = [];

function payload(filename: 'characters.json' | 'global.json' | 'personal.json', caseIndex = 0) {
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
  return decodePersonDetailPayload(document.cases[caseIndex]!.expected.body);
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
  // The placeholder now consumes the same production profile CSS as ready content.
  const effectiveStyle = fs.readFileSync(
    path.join(repositoryRoot, 'frontend/src/features/person-detail/person-detail.css'),
    'utf8',
  ) + '\n' + componentStyle;
  const resolvedStyle = effectiveStyle
    .replaceAll('var(--person-detail-inline, 16px)', layout === 'desktop' ? '16px' : layout === 'drawer-compact' ? '12px' : '24px')
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
  it('keeps fixed labels and disabled controls while data and complete tags wait', () => {
    const wrapper = mount(PersonDetailSkeleton, {
      props: { personal: true, hasCharacterCount: true, workUnit: 'series', section: 'characters', pageSize: 5 },
    });
    wrappers.push(wrapper);
    expect(wrapper.get('.detail-skeleton__metrics').text()).toContain('参与系列');
    expect(wrapper.get('.detail-skeleton__metrics').text()).toContain('角色数');
    expect(wrapper.get('.detail-skeleton__metrics').text()).toContain('我的均分');
    expect(wrapper.findAll('.metric-unit__value .app-skeleton')).toHaveLength(9);
    expect(wrapper.findAll('.metric-unit__label .app-skeleton')).toHaveLength(0);
    expect(wrapper.text()).toContain('代表条目标签');
    expect(wrapper.text()).toContain('系列均分分布');
    expect(wrapper.findAll('.score-bar__track .app-skeleton')).toHaveLength(10);
    expect(wrapper.findAllComponents(NRadioGroup).every(group => group.props('disabled'))).toBe(true);
    expect(wrapper.findAll('.character-role-card')).toHaveLength(5);
    expect(wrapper.findComponent(AdaptivePagination).exists()).toBe(false);
  });
  it('uses the same compact profile layout on desktop with section-aligned insets', () => {
    const fixture = mountSkeletonGeometry('desktop');
    try {
      const root = fixture.wrapper.get('.person-detail-skeleton').element;
      const profile = fixture.wrapper.get('.detail-skeleton__profile').element;
      const portrait = fixture.wrapper.get(
        '.detail-skeleton__portrait',
      ).element;
      const copy = fixture.wrapper.get(
        '.detail-skeleton__identity',
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
      expect(portraitStyle.width).toBe('96px');
      expect(portraitStyle.height).toBe('128px');
      expect(portraitStyle.borderRadius).toBe('12px');
      expect(pixels(profileStyle.paddingLeft)).toBe(16);
      const metricsStyle = getComputedStyle(
        fixture.wrapper.get('.detail-skeleton__metrics').element,
      );
      expect(pixels(metricsStyle.marginLeft)).toBe(16);
      expect(pixels(metricsStyle.marginRight)).toBe(16);
      expect(getComputedStyle(
        fixture.wrapper.get('.person-inspector__section').element,
      ).getPropertyValue('--person-section-inline')).toBe('16px');
      expect(portraitStyle.alignSelf).toBe('start');
      expect(copyStyle.padding).toBe('4px 0px');
      expect(copyStyle.alignContent).toBe('start');
      expect(copyStyle.alignItems).toBe('start');
      expect(getComputedStyle(fixture.wrapper.get('.detail-skeleton__metrics').element).gridTemplateColumns)
        .toBe('repeat(3, minmax(0, 1fr))');
    } finally {
      fixture.cleanup();
    }
  });

  it('uses mobile profile geometry in wider Drawers too', () => {
    const fixture = mountSkeletonGeometry('drawer-wide');
    try {
      const root = fixture.wrapper.get('.person-detail-skeleton').element;
      const profile = fixture.wrapper.get('.detail-skeleton__profile').element;
      const portrait = fixture.wrapper.get(
        '.detail-skeleton__portrait',
      ).element;
      const copy = fixture.wrapper.get(
        '.detail-skeleton__identity',
      ).element;
      const rootStyle = getComputedStyle(root);
      const profileStyle = getComputedStyle(profile);
      const portraitStyle = getComputedStyle(portrait);
      const copyStyle = getComputedStyle(copy);

      expect(portraitStyle.width).toBe('96px');
      expect(portraitStyle.height).toBe('128px');
      expect(portraitStyle.borderRadius).toBe('12px');
      expect(pixels(rootStyle.paddingLeft)).toBe(0);
      expect(pixels(profileStyle.paddingLeft)).toBe(24);
      expect(copyStyle.padding).toBe('4px 0px');
      expect(getComputedStyle(fixture.wrapper.get('.detail-skeleton__metrics').element).gridTemplateColumns)
        .toBe('repeat(3, minmax(0, 1fr))');
    } finally {
      fixture.cleanup();
    }
  });

  it('renders compact drawer geometry with 12px insets and a rounded 96 by 128 portrait', () => {
    const fixture = mountSkeletonGeometry('drawer-compact');
    try {
      const root = fixture.wrapper.get('.person-detail-skeleton').element;
      const profile = fixture.wrapper.get('.detail-skeleton__profile').element;
      const portrait = fixture.wrapper.get(
        '.detail-skeleton__portrait',
      ).element;
      const copy = fixture.wrapper.get(
        '.detail-skeleton__identity',
      ).element;
      const rootStyle = getComputedStyle(root);
      const profileStyle = getComputedStyle(profile);
      const portraitStyle = getComputedStyle(portrait);
      const copyStyle = getComputedStyle(copy);
      const portraitInlineStart =
        pixels(rootStyle.paddingLeft) + pixels(profileStyle.paddingLeft);

      expect(portraitStyle.width).toBe('96px');
      expect(portraitStyle.height).toBe('128px');
      expect(portraitStyle.borderRadius).toBe('12px');
      expect(portraitStyle.alignSelf).toBe('start');
      expect(profileStyle.alignContent).toBe('start');
      expect(profileStyle.alignItems).toBe('start');
      expect(copyStyle.padding).toBe('4px 0px');
      expect(copyStyle.alignContent).toBe('start');
      expect(copyStyle.alignItems).toBe('start');
      expect(portraitInlineStart).toBe(12);
      expect(pixels(profileStyle.paddingTop)).toBe(12);
      const metricsStyle = getComputedStyle(
        fixture.wrapper.get('.detail-skeleton__metrics').element,
      );
      expect(pixels(metricsStyle.marginLeft)).toBe(12);
      expect(pixels(metricsStyle.marginRight)).toBe(12);
      expect(pixels(metricsStyle.marginBottom)).toBe(0);
      expect(metricsStyle.borderRadius).toBe('12px');
      expect(metricsStyle.backgroundColor).toBe('rgba(0, 0, 0, 0)');
    } finally {
      fixture.cleanup();
    }
  });
});

describe('person inspector production presentation', () => {
  it.each([
    ['subject', 'global'],
    ['subject', 'personal'],
    ['series', 'global'],
    ['series', 'personal'],
    ['character', 'global'],
  ] as const)('keeps %s %s loading cards on their detailed and compact content structure', async (kind, scope) => {
    const initial = payload(kind === 'character' ? 'characters.json' : `${scope}.json`);
    const detail = kind === 'series'
      ? { ...initial, summary: { ...initial.summary, workUnit: 'series' as const } }
      : initial;
    const wrapper = mount(PersonItemBrowser, {
      props: {
        executeView: vi.fn(async () => true),
        payload: detail,
        pending: true,
        positionLabel,
        view: { ...resource(detail).view, pageSize: 10 },
      },
    });
    wrappers.push(wrapper);

    const skeleton = wrapper.get('.work-cards-skeleton');
    expect(skeleton.attributes('aria-hidden')).toBe('true');
    expect(skeleton.element.children).toHaveLength(10);
    expect(skeleton.findAll('button, a, input, select')).toHaveLength(0);
    expect(wrapper.get('.person-item-browser__body').attributes('aria-busy')).toBe('true');

    const pagination = wrapper.getComponent(AdaptivePagination);
    const paginationElement = pagination.element;
    expect(pagination.props('pending')).toBe(true);
    expect(pagination.props('pageSize')).toBe(detail.pagination.pageSize);
    expect(pagination.findAll('.app-skeleton')).toHaveLength(0);
    expect(pagination.findAll('button').every((button) => button.attributes('disabled') !== undefined)).toBe(true);

    if (kind === 'character') {
      expect(skeleton.findAll('.character-role-card__avatar .app-skeleton')).toHaveLength(10);
      expect(skeleton.findAll('.character-role-card__appearance')).toHaveLength(20);
      expect(skeleton.find('.subject-work-row__facts').exists()).toBe(false);
    } else {
      expect(skeleton.findAll('.subject-work-row__cover-media .app-skeleton')).toHaveLength(10);
      expect(skeleton.findAll('.subject-work-row__role-fact')).toHaveLength(0);
      expect(skeleton.findAll('.subject-work-row__score--mine')).toHaveLength(scope === 'personal' ? 10 : 0);
      expect(skeleton.findAll('.subject-work-row__series-members')).toHaveLength(kind === 'series' ? 10 : 0);
      expect(skeleton.findAll('.subject-work-row__meta')).toHaveLength(kind === 'subject' ? 10 : 0);
    }

    const densityControl = wrapper.findAllComponents(NRadioGroup).at(-1)!;
    densityControl.vm.$emit('update:value', 'compact');
    await wrapper.vm.$nextTick();

    expect(skeleton.element.children).toHaveLength(10);
    expect(skeleton.findAll('.subject-work-row__facts, .subject-work-row__series-members, .character-role-card__appearances')).toHaveLength(0);
    if (kind === 'character') {
      expect(skeleton.findAll('.character-role-card--compact')).toHaveLength(10);
      expect(skeleton.findAll('.character-role-card__avatar')).toHaveLength(10);
    } else {
      expect(skeleton.findAll('.subject-work-row--compact')).toHaveLength(10);
      expect(skeleton.findAll('.subject-work-row__compact-score')).toHaveLength(10);
      expect(skeleton.findAll('.subject-work-row__cover-media')).toHaveLength(0);
    }

    await wrapper.setProps({ pending: false });
    expect(wrapper.find('.work-cards-skeleton').exists()).toBe(false);
    expect(wrapper.getComponent(AdaptivePagination).element).toBe(paginationElement);
    expect(pagination.props('pending')).toBe(false);
  });

  it('reserves cast role names and whole tags only when the pending work query includes character statistics', async () => {
    const detail = payload('personal.json', 1);
    const wrapper = mount(PersonItemBrowser, {
      props: {
        executeView: vi.fn(async () => true),
        payload: detail,
        pending: true,
        positionLabel,
        view: resource(detail).view,
      },
    });
    wrappers.push(wrapper);

    const role = wrapper.get('.subject-work-row__role-fact');
    expect(role.get('dt').text()).toBe('配音角色');
    expect(role.findAll('.app-skeleton')).toHaveLength(2);
    expect(role.find('.work-cards-skeleton__role-tag.n-skeleton').exists()).toBe(true);
    expect(role.find('.character-role-tag').exists()).toBe(false);
    expect(wrapper.get('.work-cards-skeleton').text()).not.toContain('参与职位');

    const staff = payload('personal.json');
    await wrapper.setProps({ payload: staff, view: resource(staff).view });
    expect(wrapper.find('.subject-work-row__role-fact').exists()).toBe(false);
    expect(wrapper.find('.subject-work-row__facts--with-role').exists()).toBe(false);
    expect(wrapper.get('.subject-work-row__score--global dt').text()).toBe('全站评分');
  });

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

  it('omits ordinary staff positions and their empty role cell on subject cards', () => {
    const detail = payload('personal.json');
    const firstItem = detail.items[0];
    if (!firstItem || !('subject' in firstItem)) {
      throw new Error('personal golden must contain a subject item');
    }
    const contribution = firstItem.contributions[0];
    if (!contribution) {
      throw new Error('personal golden must contain a contribution');
    }
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
        positionLabel,
        resource: resource(longDetail),
        retry: vi.fn(async () => true),
      },
    });
    wrappers.push(wrapper);

    expect(wrapper.find('.subject-work-row__role-fact').exists()).toBe(false);
    expect(wrapper.find('.subject-work-row__facts--with-role').exists()).toBe(false);
    expect(wrapper.get('.person-profile__career').text()).toBe('制作人');
  });

  it('preserves distinct cast characters sharing a role and falls back to original names', () => {
    const detail = payload('personal.json');
    const firstItem = detail.items[0];
    if (!firstItem || !('subject' in firstItem)) {
      throw new Error('personal golden must contain a subject item');
    }
    const characters = [
      { key: 'character:31831', id: 31831, name: '斎藤葵', nameCN: '斋藤葵' },
      { key: 'character:78511', id: 78511, name: '岩田慧菜', nameCN: null },
    ];
    const wrapper = mount(PersonInspector, {
      props: {
        executeView: vi.fn(async () => true),
        positionLabel,
        resource: resource({
          ...detail,
          items: [{
            ...firstItem,
            contributions: characters.map((character) => ({
              kind: 'cast' as const,
              positionKey: 'cast:anime:all',
              character,
              roleType: 2,
              roleLabel: '配角' as const,
              provenance: 'exact' as const,
            })),
          }],
        }),
        retry: vi.fn(async () => true),
      },
    });
    wrappers.push(wrapper);

    const role = wrapper.get('.subject-work-row__role-fact');
    expect(role.get('dt').text()).toBe('配音角色');
    expect(role.findAll('.adaptive-role-list__row .adaptive-role-list__name').map((name) => name.text()))
      .toEqual(['斋藤葵', '岩田慧菜']);
    expect(role.findAll('.adaptive-role-list__row .character-role-tag').map((tag) => tag.text()))
      .toEqual(['配角', '配角']);
    for (const entry of role.findAll('.adaptive-role-list__row .adaptive-role-list__item, [data-role-measure]')) {
      const tag = entry.getComponent(NTag);
      expect(tag.props('size')).toBe('small');
      expect(tag.props('round')).toBe(true);
      expect(tag.text()).toBe('配角');
    }
    for (const metadata of wrapper.findAll('.subject-work-row__meta li')) {
      const tag = metadata.getComponent(NTag);
      expect(tag.props('size')).toBe('small');
      expect(tag.props('round')).toBe(true);
    }
    expect(role.find('.adaptive-role-list__count').exists()).toBe(false);
    expect(role.text()).not.toContain(' / ');
  });

  it('keeps exact series cast counts while omitting staff-only series role cells', async () => {
    const detail = payload('personal.json', 1);
    const series = detail.items[0];
    if (!series || !('kind' in series) || series.kind !== 'series') {
      throw new Error('second personal golden must contain a series item');
    }
    const wrapper = mount(PersonInspector, {
      props: {
        executeView: vi.fn(async () => true),
        positionLabel,
        resource: resource(detail),
        retry: vi.fn(async () => true),
      },
    });
    wrappers.push(wrapper);

    const role = wrapper.get('.subject-work-row__role-fact');
    expect(role.get('dt').text()).toBe('配音角色');
    expect(role.get('.adaptive-role-list__row .adaptive-role-list__name').text()).toBe('系列角色');
    expect(role.get('.adaptive-role-list__row .adaptive-role-list__count').text()).toBe('1');
    expect(role.text()).not.toContain('导演');
    await wrapper.setProps({
      resource: resource({
        ...detail,
        items: [{ ...series, contributions: series.contributions.filter((entry) => entry.kind === 'staff') }],
      }),
    });
    expect(wrapper.find('.subject-work-row__role-fact').exists()).toBe(false);
    expect(wrapper.find('.subject-work-row__facts--with-role').exists()).toBe(false);
  });

  it('shows only profile careers across query positions and server work views', async () => {
    const original = payload('global.json');
    const detail = {
      ...original,
      person: { ...original.person, careers: ['artist', 'seiyu'] as const },
    };
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

    expect(wrapper.get('.person-profile__career').text()).toBe(
      '音乐人 / 声优',
    );
    expect(wrapper.get('.person-profile__career').attributes('title')).toBe('音乐人 / 声优');
    expect(wrapper.get('.person-profile__summary').text()).toContain('导演集合 / 音乐人 / 声优');
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
    expect(wrapper.get('.person-profile__career').text()).toBe(
      '音乐人 / 声优',
    );
  });

  it('repeats equal or missing bilingual names and exposes their full title', () => {
    const detail = payload('global.json');
    const firstItem = detail.items[0];
    if (!firstItem || !('subject' in firstItem)) {
      throw new Error('global golden must start with a subject item');
    }
    const patchedDetail = Object.freeze({
      ...detail,
      person: Object.freeze({
        ...detail.person,
        name: '石原立也',
        nameCN: '石原立也',
      }),
      items: Object.freeze([
        Object.freeze({
          ...firstItem,
          subject: Object.freeze({
            ...firstItem.subject,
            name: 'AIR',
            nameCN: null,
          }),
        }),
      ]),
    }) as PersonDetailPayload;
    const wrapper = mount(PersonInspector, {
      props: {
        executeView: vi.fn(async () => true),
        positionLabel,
        resource: resource(patchedDetail),
        retry: vi.fn(async () => true),
      },
    });
    wrappers.push(wrapper);

    expect(wrapper.get('.person-profile__secondary-name').text()).toBe(
      '石原立也',
    );
    expect(
      wrapper.get('.person-profile__secondary-name').attributes('title'),
    ).toBe('石原立也\n石原立也');
    expect(wrapper.get('.subject-work-row__primary-link').text()).toBe('AIR');
    expect(wrapper.get('.subject-work-row__secondary').text()).toBe('AIR');
    expect(
      wrapper.get('.subject-work-row__primary-link').attributes('title'),
    ).toBe('AIR\nAIR');
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
    expect(document.body.textContent).toContain('平均差异');
    expect(document.body.textContent).toContain('+0.80');
    expect(document.body.textContent).toContain('样本权重');
    expect(document.body.textContent).toContain('0.17');
  });

  it('shows only bounded work names in score tooltips and keeps complete bar semantics', async () => {
    const detail = payload('personal.json');
    const personalRatings = detail.ratings.personal;
    if (!personalRatings) {
      throw new Error('personal golden must contain personal ratings');
    }
    const populatedBucket = personalRatings.buckets.find(
      (bucket) => bucket.count > 0,
    );
    if (!populatedBucket?.examples[0]) {
      throw new Error('personal golden must contain a populated rating bucket');
    }
    const firstExample = populatedBucket.examples[0];
    const buckets = personalRatings.buckets.map((bucket) =>
      bucket.score === populatedBucket.score
        ? Object.freeze({
            ...bucket,
            count: 6,
            examples: Object.freeze([
              firstExample,
              Object.freeze({
                ...firstExample,
                id: 2,
                key: 'subject:2',
                name: 'Second Golden Animation With A Long Original Name',
                nameCN: '第二部标题很长的金标动画作品',
              }),
            ]),
            hiddenCount: 4,
          })
        : bucket,
    ) as unknown as PersonDetailRatingSet['buckets'];
    const patchedDetail = Object.freeze({
      ...detail,
      ratings: Object.freeze({
        ...detail.ratings,
        personal: Object.freeze({
          ...personalRatings,
          buckets: Object.freeze(buckets),
        }),
      }),
    }) as PersonDetailPayload;
    const wrapper = mount(RatingEvidence, {
      attachTo: document.body,
      props: { payload: patchedDetail },
    });
    wrappers.push(wrapper);

    const bar = wrapper
      .findAll('.person-score-bar')
      .find((candidate) =>
        candidate.attributes('aria-label')?.startsWith(
          `${populatedBucket.score} 分`,
        ),
      );
    expect(bar).toBeDefined();
    expect(bar!.attributes('aria-label')).toContain('6 个');
    expect(bar!.attributes('aria-label')).toContain('金标动画');
    expect(bar!.attributes('aria-label')).toContain('另有 4 个未列出');

    await bar!.trigger('focus');
    await vi.waitFor(() => {
      expect(
        document.body.querySelector('.score-distribution-tooltip'),
      ).not.toBeNull();
    });
    const tooltip = document.body.querySelector(
      '.score-distribution-tooltip',
    )!;
    expect(
      Array.from(tooltip.querySelectorAll('li'), (item) =>
        item.textContent?.trim(),
      ),
    ).toEqual([
      '金标动画',
      '第二部标题很长的金标动画作品',
      '… +4',
    ]);
    expect(tooltip.textContent).not.toContain(`${populatedBucket.score} 分`);
    expect(tooltip.textContent).not.toContain('示例：');

    const styles = fs.readFileSync(
      path.join(
        repositoryRoot,
        'frontend/src/features/person-detail/person-detail.css',
      ),
      'utf8',
    );
    expect(styles).toMatch(
      /\.person-preference-work__copy strong\s*{[^}]*color: var\(--text-primary\);/s,
    );
    const sharedStyles = fs.readFileSync(
      path.join(repositoryRoot, 'frontend/src/shared/styles/base.css'),
      'utf8',
    );
    expect(sharedStyles).toMatch(
      /\.score-distribution-tooltip li\s*{[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;/s,
    );
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
    for (const entry of wrapper.findAll('.character-role-card__appearance')) {
      const tag = entry.getComponent(NTag);
      expect(tag.props('size')).toBe('small');
      expect(tag.props('round')).toBe(true);
      expect(tag.text()).toBe(appearance.roleLabel);
    }
    expect(overflow.attributes('aria-expanded')).toBe('false');
    await overflow.trigger('mouseenter');
    await overflow.trigger('focus');
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
    expect(document.body.querySelectorAll('.character-role-source-tooltip .character-role-tag.n-tag'))
      .toHaveLength(3);
    await overflow.trigger('keydown', { key: 'Escape' });
    expect(overflow.attributes('aria-expanded')).toBe('false');
    await overflow.trigger('focus');
    expect(overflow.attributes('aria-expanded')).toBe('true');
  });

  it('keeps an appearance popover in the drawer Tab path and restores its trigger on Escape', async () => {
    const detail = payload('characters.json');
    const item = detail.items[0];
    if (!item || !('character' in item)) throw new Error('Expected a character');
    const appearances = [1, 2, 3].map((id) => ({
      ...item.appearances[0]!,
      subject: { ...item.appearances[0]!.subject, id, name: `Work ${id}`, nameCN: null },
    }));
    const wrapper = mount(PersonDetailSurface, {
      attachTo: document.body,
      props: {
        compact: true,
        open: true,
        resource: resource({ ...detail, items: [{ ...item, appearances, workCount: 3 }] } as PersonDetailPayload),
        positionLabel,
        executeView: vi.fn(async () => true),
        retry: vi.fn(async () => true),
        targetWindow: window,
      },
    });
    wrappers.push(wrapper);
    const trigger = document.body.querySelector<HTMLButtonElement>('.character-role-card__source-more')!;
    const key = (element: Element, value: string, shiftKey = false) => element.dispatchEvent(
      new KeyboardEvent('keydown', { key: value, shiftKey, bubbles: true, cancelable: true }),
    );
    await vi.waitFor(() => expect(document.activeElement?.classList.contains('person-detail-drawer')).toBe(true));
    trigger.focus();
    await vi.waitFor(() => expect(document.querySelectorAll('[data-person-detail-popup] a')).toHaveLength(3));
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-person-detail-popup] a'));
    key(trigger, 'Tab');
    expect(document.activeElement).toBe(links[0]);
    key(links[0]!, 'Tab', true);
    expect(document.activeElement).toBe(trigger);
    key(trigger, 'Tab');
    key(links[0]!, 'Escape');
    await vi.waitFor(() => expect(trigger.getAttribute('aria-expanded')).toBe('false'));
    expect(document.activeElement).toBe(trigger);
    expect(wrapper.emitted('close')).toBeUndefined();
    trigger.blur();
    trigger.focus();
    await vi.waitFor(() => expect(document.querySelectorAll('[data-person-detail-popup] a')).toHaveLength(3));
    const last = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-person-detail-popup] a')).at(-1)!;
    last.focus();
    key(last, 'Tab');
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement?.closest('[data-person-detail-popup]')).toBeNull();
    await vi.waitFor(() => expect(trigger.getAttribute('aria-expanded')).toBe('false'));
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
                Object.freeze({ ...firstPoint, count: 1, works: [{
                  subject: { id: 101, name: 'Winter work', nameCN: '冬季作品', date: '2024-01' }, score: 700,
                }] }),
                Object.freeze({
                  ...firstPoint,
                  quarter: 2,
                  average: 840,
                  count: 1,
                  works: [{ subject: { id: 102, name: 'Spring work', nameCN: '春季作品', date: '2024-04' }, score: 840 }],
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

    expect(wrapper.find('.rating-distribution-panel__empty').exists()).toBe(false);

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

    await hits[0]!.trigger('focus');
    expect(wrapper.get('[role="tooltip"]').text()).toContain('均分');
    await hits[0]!.trigger('blur');
    expect(wrapper.find('[role="tooltip"]').exists()).toBe(false);
    expect(wrapper.find('.rating-distribution-panel__empty').exists()).toBe(false);

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

  it('keeps same-quarter works separate from the mean line and uses Chinese seasons', async () => {
    const detail = payload('global.json');
    const quarter = detail.ratings.global.timeline[0]!;
    const wrapper = mount(RatingEvidence, {
      attachTo: document.body,
      props: { payload: {
        ...detail,
        ratings: { ...detail.ratings, global: { ...detail.ratings.global, timeline: [
          { ...quarter, year: 2024, quarter: 1, average: 666, count: 3, works: [
            { subject: { id: 1, name: 'A', nameCN: '作品甲', date: '2024-01' }, score: 600 },
            { subject: { id: 2, name: 'B', nameCN: '作品乙', date: '2024-02-02' }, score: 700 },
            { subject: { id: 3, name: 'C', nameCN: '作品丙', date: '2024-03-03' }, score: 700 },
          ] },
          { ...quarter, year: 2024, quarter: 2, average: 800, count: 1, works: [
            { subject: { id: 4, name: 'D', nameCN: '作品丁', date: '2024-04' }, score: 800 },
          ] },
        ] } },
      } },
    });
    wrappers.push(wrapper);
    await wrapper.findAll('.n-radio-button').find((control) => control.text() === '按时间')!.trigger('click');
    const dots = wrapper.findAll('.rating-time-chart__visible-point');
    expect(dots).toHaveLength(4);
    expect(new Set(dots.map((dot) => dot.attributes('cx'))).size).toBe(4);
    expect(dots[1]!.attributes('cy')).toBe(dots[2]!.attributes('cy'));
    const linePoints = wrapper.get('polyline').attributes('points')!.split(' ');
    expect(linePoints).toHaveLength(2);
    expect(Number(linePoints[0]!.split(',')[1])).toBeCloseTo(18 + (1000 - 666) / 1000 * 176);
    expect(wrapper.findAll('.rating-time-chart__quarter-label').map((label) => label.text())).toEqual(['冬季', '春季']);
    const hits = wrapper.findAll('.rating-time-chart__hit-target');
    await hits[1]!.trigger('focus');
    expect(wrapper.get('[role="tooltip"]').text()).toContain('作品乙');
    expect(wrapper.get('[role="tooltip"]').text()).toContain('7.00 分');
    expect(wrapper.get('[role="tooltip"]').text()).toContain('2024-02-02');
    expect(wrapper.get('[role="tooltip"]').text()).toContain('6.66');
    expect(wrapper.text()).not.toMatch(/Q[1-4]/);
    const focusNext = vi.spyOn(hits[2]!.element as SVGElement, 'focus');
    await hits[1]!.trigger('keydown', { key: 'ArrowRight' });
    expect(focusNext).toHaveBeenCalledOnce();
  });

  it('spaces sparse quarters by calendar time and thins long-range axis labels', async () => {
    const detail = payload('global.json');
    const first = detail.ratings.global.timeline[0]!;
    const withTimeline = (timeline: typeof detail.ratings.global.timeline) => ({
      ...detail,
      ratings: { ...detail.ratings, global: { ...detail.ratings.global, timeline } },
    });
    const wrapper = mount(RatingEvidence, {
      attachTo: document.body,
      props: { payload: withTimeline([
        { ...first, year: 2000, quarter: 1, count: 1, works: [{ subject: { id: 1, name: 'A', nameCN: null, date: '2000-01' }, score: 700 }] },
        { ...first, year: 2000, quarter: 2, count: 1, works: [{ subject: { id: 2, name: 'B', nameCN: null, date: '2000-04' }, score: 700 }] },
        { ...first, year: 2025, quarter: 4, count: 1, works: [{ subject: { id: 3, name: 'C', nameCN: null, date: '2025-10' }, score: 700 }] },
      ]) },
    });
    wrappers.push(wrapper);
    await wrapper.findAll('.n-radio-button').find((control) => control.text() === '按时间')!.trigger('click');
    const dots = wrapper.findAll('.rating-time-chart__visible-point');
    const positions = dots.map((dot) => Number(dot.attributes('cx')));
    expect(positions[2]! - positions[1]!).toBeGreaterThan(100 * (positions[1]! - positions[0]!));
    const labels = wrapper.findAll('.rating-time-chart__year-label');
    expect(labels.length).toBeLessThanOrEqual(8);
    expect(labels.at(-1)!.text()).toBe('2025');
    expect(wrapper.find('.rating-time-chart__quarter-label').exists()).toBe(false);
    const labelPositions = labels.map((label) => Number(label.attributes('x')));
    expect(labelPositions.slice(1).every((x, index) => x - labelPositions[index]! >= 52)).toBe(true);
    await wrapper.setProps({ payload: withTimeline([]) });
    expect(wrapper.find('svg.rating-time-chart').exists()).toBe(false);
    expect(wrapper.get('.rating-distribution-panel__empty').text()).toContain('没有同时具备时间');
  });

  it('isolates page content while keeping Header reachable and restores focus after Escape', async () => {
    const appRoot = document.createElement('div');
    appRoot.id = 'app';
    const header = document.createElement('header');
    header.className = 'app-header';
    const modeButton = document.createElement('button');
    modeButton.textContent = '共演分析';
    header.append(modeButton);
    const page = document.createElement('div');
    page.className = 'app-page-scroll';
    appRoot.append(header, page);
    const opener = document.createElement('button');
    opener.textContent = '打开人物详情';
    page.append(opener);
    document.body.append(appRoot);
    opener.focus();
    const wrapper = mount(PersonDetailSurface, {
      attachTo: page,
      global: { stubs: { transition: false } },
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
    expect(Boolean(appRoot.inert)).toBe(false);
    expect(page.inert).toBe(true);
    expect(page.getAttribute('aria-hidden')).toBe('true');
    expect(modeButton.closest('[inert], [aria-hidden="true"]')).toBeNull();
    expect(dialog.hasAttribute('aria-modal')).toBe(false);
    dialog.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Tab', shiftKey: true }));
    expect(document.activeElement).toBe(modeButton);
    dialog.focus();
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
    expect(page.inert).toBe(true);
    expect(document.body.querySelector('.person-detail-drawer')).not.toBeNull();
    await vi.waitFor(() => {
      expect(document.body.querySelector('.person-detail-drawer')).toBeNull();
      expect(page.inert).toBe(false);
      expect(document.activeElement).toBe(opener);
    });
    expect(document.body.style.overflow).toBe('');
    expect(document.documentElement.style.overflow).toBe('');
    expect(page.inert).toBe(false);
    expect(page.hasAttribute('aria-hidden')).toBe(false);
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(opener);
    });
  });
});

describe('person-detail oracle cascade guards', () => {
  it('keeps workspace actions and a unique panel ID while moving focus across the drawer breakpoint', async () => {
    const wrapper = mount(PersonDetailSurface, {
      attachTo: document.body,
      props: {
        compact: true,
        open: true,
        inline: true,
        panelId: 'co-star-person-detail-panel',
        resource: resource(),
        positionLabel,
        executeView: vi.fn(async () => true),
        retry: vi.fn(async () => true),
        targetWindow: window,
      },
      slots: { actions: '<button class="test-return">返回共演分析</button>' },
    });
    wrappers.push(wrapper);
    await vi.waitFor(() => expect(document.activeElement?.id).toBe('co-star-person-detail-panel'));
    expect(document.querySelectorAll('#co-star-person-detail-panel')).toHaveLength(1);
    expect(document.querySelector('#person-detail-panel')).toBeNull();
    const action = document.querySelector<HTMLButtonElement>('.test-return')!;
    action.focus();
    await wrapper.setProps({ compact: false });
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(wrapper.get('.person-detail-surface').element);
      expect(document.querySelector('.person-detail-drawer')).toBeNull();
    });
    expect(document.querySelectorAll('#co-star-person-detail-panel')).toHaveLength(1);
    expect(wrapper.get('.person-detail-surface--inline .test-return').text()).toBe('返回共演分析');
    expect(document.documentElement.style.overflow).toBe('');
    await wrapper.setProps({ compact: true });
    await vi.waitFor(() => expect(document.activeElement).toBe(document.querySelector('.person-detail-drawer')));
    expect(document.querySelectorAll('#co-star-person-detail-panel')).toHaveLength(1);
    expect(document.querySelector('.test-return')?.textContent).toBe('返回共演分析');
  });

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
      /\.person-inspector \.person-profile__portrait\s*\{[^}]*width:\s*96px;[^}]*height:\s*128px;[^}]*border-radius:\s*var\(--radius-card\);/s,
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
