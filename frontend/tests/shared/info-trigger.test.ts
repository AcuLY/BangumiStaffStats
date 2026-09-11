import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { ArrowDownOutline, InformationCircleOutline, OpenOutline } from '@vicons/ionicons5';
import AppIcon from '../../src/shared/components/AppIcon.vue';
import InfoIcon from '../../src/shared/components/InfoIcon.vue';
import QueryIcon from '../../src/features/query/components/QueryIcon.vue';
import CoStarIcon from '../../src/features/co-star/components/CoStarIcon.vue';

const frontendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const source = (relativePath: string) =>
  fs.readFileSync(path.join(frontendRoot, relativePath), 'utf8');

const infoIconSource = source('src/shared/components/InfoIcon.vue');
const appIconSource = source('src/shared/components/AppIcon.vue');
const queryIconSource = source('src/features/query/components/QueryIcon.vue');
const coStarIconSource = source(
  'src/features/co-star/components/CoStarIcon.vue',
);
const queryEditorSource = source(
  'src/features/query/components/QueryEditor.vue',
);
const statEvidenceSource = source(
  'src/features/person-detail/components/StatEvidencePopover.vue',
);
const partnersSource = source(
  'src/features/co-star/components/PartnersSurface.vue',
);
const coStarWorksSource = source(
  'src/features/co-star/components/CoStarWorkBrowser.vue',
);
const coStarSurfaceSource = source(
  'src/features/co-star/components/CoStarSurface.vue',
);
const baseCss = source('src/shared/styles/base.css');
const personCss = source('src/features/person-detail/person-detail.css');
const partnersCss = source('src/features/co-star/partners.css');
const coStarOracleCss = source('src/features/co-star/co-star-oracle.css');

describe('shared info trigger', () => {
  it('uses one library information glyph at every wrapper boundary', () => {
    for (const component of [AppIcon, QueryIcon, CoStarIcon]) {
      const wrapper = mount(component, { props: { name: 'info', size: 16 } });
      expect(wrapper.findComponent(InfoIcon).exists()).toBe(true);
      expect(wrapper.findComponent(InformationCircleOutline).exists()).toBe(true);
      expect(wrapper.get('.info-icon').attributes('aria-hidden')).toBe('true');
      expect(wrapper.get('.info-icon').attributes('width')).toBe('16');
      expect(wrapper.get('.info-icon').attributes('height')).toBe('16');
      expect(wrapper.findAll('svg')).toHaveLength(1);
      expect(wrapper.find('[tabindex]').exists()).toBe(false);
      wrapper.unmount();
    }
    for (const source of [infoIconSource, appIconSource, queryIconSource, coStarIconSource]) {
      expect(source).not.toMatch(/<(?:svg|path|circle)\b/);
    }
  });

  it.each([
    'arrow-down', 'check', 'chevron-down', 'chevron-left', 'chevron-right',
    'close', 'edit', 'external-link', 'image', 'moon', 'people', 'person',
    'plus', 'refresh', 'search', 'sun', 'warning',
  ] as const)('renders the %s library icon at the requested size', (name) => {
    const wrapper = mount(AppIcon, { props: { name, size: 28 } });
    expect(wrapper.get('.app-icon').attributes('width')).toBe('28');
    expect(wrapper.get('.app-icon').attributes('height')).toBe('28');
    expect(wrapper.get('.app-icon').attributes('aria-hidden')).toBe('true');
    expect(wrapper.get('svg').attributes('viewBox')).toBe('0 0 512 512');
    expect(wrapper.find('[tabindex]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('keeps a straight sorting arrow and external navigation glyph', () => {
    const arrow = mount(AppIcon, { props: { name: 'arrow-down' } });
    expect(arrow.findComponent(ArrowDownOutline).exists()).toBe(true);
    arrow.unmount();
    const external = mount(QueryIcon, { props: { name: 'external-link' } });
    expect(external.findComponent(OpenOutline).exists()).toBe(true);
    external.unmount();
  });

  it('applies one visible and effective target contract to every trigger', () => {
    expect(baseCss).toMatch(
      /\.info-trigger\s*\{[^}]*width:\s*24px;[^}]*height:\s*24px;[^}]*margin-block:\s*-4px;[^}]*border-radius:\s*var\(--radius-control\);[^}]*color:\s*var\(--text-tertiary\);[^}]*background:\s*transparent;/s,
    );
    expect(baseCss).toMatch(
      /\.info-trigger::before\s*\{[^}]*inset:\s*-10px;/s,
    );
    expect(baseCss).toMatch(
      /\.info-trigger:hover\s*\{[^}]*color:\s*var\(--text-primary\);/s,
    );
    expect(baseCss).toMatch(
      /\.info-trigger:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--focus\);[^}]*outline-offset:\s*2px;/s,
    );

    expect(queryEditorSource.match(/info-trigger/g)).toHaveLength(3);
    expect(statEvidenceSource).toContain(
      'class="stat-evidence__trigger info-trigger"',
    );
    expect(partnersSource).not.toContain(
      'class="partners-metric-info info-trigger"',
    );
    expect(coStarWorksSource).toContain(
      'class="subject-work-row__series-info info-trigger"',
    );
  });

  it('removes local presentation drift and excludes the decorative empty icon', () => {
    expect(personCss).not.toMatch(/\.stat-evidence__trigger\s*\{/);
    expect(partnersCss).not.toMatch(/\.partners-metric-info\s*\{/);
    expect(coStarOracleCss).not.toMatch(
      /\.subject-work-row__series-info\s*\{/,
    );
    expect(coStarSurfaceSource).toContain(
      '<co-star-icon name="info" :size="28" />',
    );
    expect(coStarSurfaceSource).not.toContain(
      'analysis-empty__icon info-trigger',
    );
  });
});
