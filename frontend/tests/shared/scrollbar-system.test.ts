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
const queryWorkspaceSource = fs.readFileSync(
  path.join(
    frontendRoot,
    'src/features/query/components/QueryWorkspace.vue',
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
const coStarCss = [
  'co-star.css',
  'co-star-analysis.css',
]
  .map((file) =>
    fs.readFileSync(
      path.join(frontendRoot, 'src/features/co-star', file),
      'utf8',
    ),
  )
  .join('\n');

describe('oracle scrollbar system', () => {
  it('keeps the internal page scroller and Query Editor on the 10px shell tier', () => {
    expect(baseCss).toContain('--scrollbar-shell-size: 10px;');
    expect(baseCss).toMatch(
      /html,\s*body\s*\{[^}]*height:\s*100%;[^}]*overflow:\s*hidden;/s,
    );
    expect(baseCss).toMatch(
      /\.app-shell\s*\{[^}]*display:\s*grid;[^}]*height:\s*100dvh;[^}]*overflow:\s*hidden;/s,
    );
    expect(baseCss).toMatch(
      /\.app-page-scroll\s*\{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior-y:\s*contain;/s,
    );
    expect(baseCss).toMatch(
      /:where\(\.app-page-scroll, \.query-editor__scroll\)::\-webkit-scrollbar\s*\{[^}]*width:\s*var\(--scrollbar-shell-size\);[^}]*height:\s*var\(--scrollbar-shell-size\);/s,
    );
    expect(baseCss).toMatch(
      /\.query-editor__scroll\s*\{[^}]*overflow-y:\s*auto;[^}]*scrollbar-gutter:\s*auto;/s,
    );
  });

  it('keeps approved share chrome out of the oracle header grid', () => {
    expect(baseCss).toMatch(
      /\.app-header__bar\s*\{[^}]*position:\s*relative;[^}]*grid-template-columns:\s*minmax\(0, 1fr\)\s*268px\s*minmax\(0, 1fr\);[^}]*gap:\s*var\(--space-4\);/s,
    );
    expect(baseCss).toMatch(
      /\.share-action\s*\{[^}]*position:\s*absolute;[^}]*left:\s*calc\(50% \+ 142px\);/s,
    );
    expect(baseCss).toMatch(
      /@media \(width < 780px\)[\s\S]*?\.app-header__bar\s*\{[^}]*grid-template-columns:\s*var\(--touch-target\)\s*minmax\(140px, 170px\)\s*var\(--touch-target\);[^}]*gap:\s*var\(--space-2\);/,
    );
    expect(baseCss).toMatch(
      /@media \(width < 780px\)[\s\S]*?\.share-action\s*\{[^}]*right:\s*60px;/,
    );
  });

  it('keeps approved refresh chrome out of the oracle footer flow', () => {
    expect(baseCss).toMatch(
      /\.query-editor__footer\s*\{[^}]*position:\s*relative;[^}]*display:\s*flex;[^}]*justify-content:\s*flex-start;/s,
    );
    expect(baseCss).toMatch(
      /\.query-refresh-action\s*\{[^}]*position:\s*absolute;[^}]*right:\s*0;[^}]*bottom:\s*0;/s,
    );
    expect(baseCss).toMatch(
      /@media \(width < 780px\)[\s\S]*?\.query-refresh-action\s*\{[^}]*right:\s*auto;[^}]*left:\s*0;/,
    );
    expect(baseCss).toMatch(
      /@media \(width < 780px\)[\s\S]*?\.query-editor__actions\s*\{[^}]*width:\s*100%;[^}]*justify-content:\s*flex-end;/,
    );
  });

  it('restores oracle ranking rail, control, and compact sort geometry', () => {
    expect(personCss).toMatch(
      /\.ranking-workspace\s*\{[^}]*grid-template-columns:\s*clamp\(360px, 32%, 410px\) minmax\(0, 1fr\);/s,
    );
    expect(baseCss).toMatch(
      /\.ranking-workspace \.ranking-columns,\s*\.ranking-workspace \.ranked-person-row\s*\{[^}]*grid-template-areas:\s*initial;/s,
    );
    expect(baseCss).toMatch(
      /\.ranking-workspace \.ranked-person-row__rank,\s*\.ranking-workspace \.ranked-person-row__avatar,\s*\.ranking-workspace \.ranked-person-row__identity,\s*\.ranking-workspace \.ranked-person-row__metrics\s*\{[^}]*grid-area:\s*auto;/s,
    );
    expect(personCss).toContain(
      '@container person-inspector (max-width: 480px)',
    );
    expect(personCss).toMatch(
      /@container person-inspector \(max-width: 480px\)[\s\S]*?\.person-profile__content\s*\{[^}]*grid-template-areas:\s*"name career"\s*"secondary career";[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 45%\);/,
    );
    expect(baseCss).toMatch(
      /@media \(width < 780px\)[\s\S]*?\.ranking-workspace\s+\.ranked-person-list:not\(:has\(\.ranked-person-row\[aria-current="true"\]\)\)\s*>\s*\.ranked-person-row:first-child\s*\{[^}]*box-shadow:\s*inset 0 0 0 1px var\(--brand\);/s,
    );
    expect(baseCss).toMatch(
      /\.ranking-workspace \.ranking-search-control,[\s\S]*?\.ranking-workspace \.ranking-sort-control\s*\{[^}]*min-height:\s*0;/,
    );
    expect(baseCss).toMatch(
      /\.ranking-workspace \.ranking-search-control input\s*\{[^}]*min-height:\s*0;/s,
    );
    expect(baseCss).toMatch(
      /@media \(width < 780px\)[\s\S]*?\.ranking-toolbar\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 96px auto;[\s\S]*?\.ranking-order-button\s*\{[^}]*width:\s*auto;[^}]*padding:\s*6px 10px;/,
    );
    expect(baseCss).not.toContain(
      '.ranking-order-button__content > span:first-child',
    );
    expect(baseCss).not.toMatch(
      /\.ranking-order-button span\s*\{[^}]*position:\s*absolute;/s,
    );
  });

  it('portals the fixed Query Editor outside transformed header chrome', () => {
    expect(queryWorkspaceSource).toContain('<teleport to="body">');
    expect(queryWorkspaceSource).not.toContain(':disabled="compact"');
  });

  it('keeps one mobile chrome layer around the bounded Query Editor scroller', () => {
    expect(baseCss).toMatch(
      /\.app-header\s*\{[^}]*background:\s*var\(--chrome-background\);[^}]*backdrop-filter:\s*blur\(16px\) saturate\(135%\);/s,
    );
    expect(baseCss).toMatch(
      /\.query-editor-overlay\s*\{[^}]*position:\s*fixed;[^}]*background:\s*var\(--chrome-background\);[^}]*backdrop-filter:\s*blur\(16px\) saturate\(135%\);/s,
    );
    expect(baseCss).toMatch(
      /@media \(width < 780px\)[\s\S]*?\.query-editor-overlay\s*\{[^}]*position:\s*fixed;[^}]*max-height:\s*calc\(100dvh - var\(--header-bar-height\) - 44px\);[^}]*overscroll-behavior-y:\s*none;/,
    );
    expect(baseCss).toMatch(
      /@media \(width < 780px\)[\s\S]*?\.query-editor__scroll\s*\{[^}]*max-height:\s*inherit;[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior-y:\s*contain;/,
    );
  });

  it('keeps the desktop co-star participant matrix flush with the oracle surface', () => {
    expect(coStarCss).toMatch(
      /@media \(width >= 780px\)[\s\S]*?\.co-star-surface > \.selected-people-panel\s*\{[^}]*padding:\s*0;/,
    );
    expect(coStarCss).toMatch(
      /\.candidate-toolbar \.ranking-order-button\s*\{[^}]*width:\s*auto;[^}]*padding:\s*6px 10px;/s,
    );
    expect(coStarCss).not.toMatch(
      /\.candidate-toolbar[\s\S]*?\.ranking-order-button__content\s*> span\s*\{[^}]*position:\s*absolute;/,
    );
    expect(coStarCss).toMatch(
      /\.candidate-toolbar \.candidate-search-control,\s*\.candidate-toolbar \.candidate-sort-select,\s*\.candidate-toolbar \.ranking-order-button\s*\{[^}]*min-height:\s*44px;/s,
    );
    expect(coStarCss).toMatch(
      /\.candidate-position-browser\s*\{[^}]*margin-bottom:\s*var\(--space-3\);/s,
    );
    expect(coStarCss).toMatch(
      /@media \(width < 480px\)[\s\S]*?\.co-star-section-heading\s*\{[^}]*display:\s*flex;/s,
    );
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

  it('uses public shell overrides for both Drawer scroll owners', () => {
    expect(personDrawerSource).toContain(
      ':theme-overrides="shellScrollbarThemeOverrides"',
    );
    expect(personDrawerSource).toContain(
      'class="person-detail-drawer__scroll"',
    );
    expect(candidateDrawerSource).toContain(
      "containerClass: 'co-star-picker-drawer__scroll'",
    );
    expect(candidateDrawerSource).toContain(
      'themeOverrides: shellScrollbarThemeOverrides',
    );
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
