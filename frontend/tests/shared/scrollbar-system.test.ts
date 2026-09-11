import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const frontendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const baseCss = fs.readFileSync(
  path.join(frontendRoot, 'src/shared/styles/base.css'),
  'utf8',
);
const viewportSource = fs.readFileSync(
  path.join(frontendRoot, 'src/app/AppViewport.vue'), 'utf8',
);
const scrollbarCss = baseCss.slice(
  baseCss.indexOf('@supports not selector(::-webkit-scrollbar)'),
  baseCss.indexOf('.query-source-field'),
);
const personCss = fs.readFileSync(
  path.join(
    frontendRoot,
    'src/features/person-detail/person-detail.css',
  ),
  'utf8',
);
const personDrawerSource = fs.readFileSync(
  path.join(
    frontendRoot,
    'src/features/person-detail/components/PersonDetailSurface.vue',
  ),
  'utf8',
);
const candidateDrawerSource = fs.readFileSync(
  path.join(
    frontendRoot,
    'src/features/co-star/components/CoStarWorkspace.vue',
  ),
  'utf8',
);
const partnersSource = fs.readFileSync(
  path.join(
    frontendRoot,
    'src/features/co-star/components/PartnersSurface.vue',
  ),
  'utf8',
);

describe('oracle scrollbar system', () => {
  it('keeps the page scroll owner while starting the shell rail below the overlay header', () => {
    expect(baseCss).toContain('--scrollbar-shell-size: 10px;');
    expect(viewportSource).toContain('class="app-page-scroll"');
    expect(viewportSource).toContain('railInsetVerticalRight:');
    expect(viewportSource).toContain('shellScrollbarThemeOverrides');
    expect(baseCss).toMatch(
      /html\s*\{[^}]*min-width:\s*min\(320px, 100%\);/s,
    );
    expect(baseCss).toMatch(
      /body\s*\{[^}]*min-width:\s*min\(320px, 100%\);/s,
    );
    expect(baseCss).not.toContain('scrollbar-gutter: stable both-edges');
    expect(baseCss).toMatch(
      /\.query-editor__content\s*\{[^}]*overflow:\s*visible;[^}]*overscroll-behavior-y:\s*auto;/s,
    );
    expect(scrollbarCss).not.toContain('.query-editor__content');
    expect(scrollbarCss).not.toContain('.query-editor__scroll');
  });

  it('keeps lists, matrices, tooltips, and popovers on the 6px tier', () => {
    expect(baseCss).toContain('--scrollbar-component-size: 6px;');
    for (const selector of [
      '.workbench-tooltip-content',
      '.person-stat-evidence__content',
      '.character-role-source-popover',
      '.person-work-list',
      '.character-role-list',
      '.candidate-selected-people',
      '.candidate-list',
      '.co-star-matrix-scroll',
      '.co-star-rating-chart',
    ]) {
      expect(baseCss).toContain(selector);
    }
    expect(baseCss).toMatch(
      /\)\:\:\-webkit-scrollbar\s*\{[^}]*width:\s*var\(--scrollbar-component-size\);[^}]*height:\s*var\(--scrollbar-component-size\);/s,
    );
  });

  it('uses the public shell override for the page and detail Drawer', () => {
    expect(personDrawerSource).toContain(
      ':theme-overrides="drawerScrollbarThemeOverrides"',
    );
    expect(personDrawerSource).toContain(
      'class="person-detail-drawer__scroll"',
    );
    expect(personDrawerSource).toContain('trigger="none"');
    expect(candidateDrawerSource).toContain('class="co-star-picker-accordion"');
    expect(candidateDrawerSource).not.toContain('co-star-picker-drawer__scroll');
    expect(candidateDrawerSource).not.toContain('shellScrollbarThemeOverrides');
    expect(scrollbarCss).not.toMatch(/\.n-|--n-/);
  });

  it('returns native scrollbar colors to the system in forced colors', () => {
    expect(baseCss).toMatch(
      /@media \(forced-colors: active\)\s*\{[\s\S]*?scrollbar-color:\s*auto;/,
    );
  });

  it('reserves the viewport shell inside the portaled partners tooltip', () => {
    expect(partnersSource).toContain(
      'content-class="workbench-tooltip-content"',
    );
    expect(partnersSource).toContain(
      'max-width: min(336px, calc(100dvw - 72px))',
    );
    expect(partnersSource).toContain(':width="metricTooltipWidth"');
    expect(partnersSource).toContain(
      'document.documentElement.clientWidth',
    );
  });

  it('does not let person-detail CSS override the oracle ranking grid', () => {
    expect(personCss).not.toMatch(
      /\.ranking-workspace \.ranking-columns,\s*\.ranking-workspace \.ranked-person-row\s*\{[^}]*grid-template-columns:/s,
    );
  });
});
