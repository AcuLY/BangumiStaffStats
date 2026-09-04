import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

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
  it('owns the exact query-reference glyph once', () => {
    expect(infoIconSource).toContain('stroke-width="1.9"');
    expect(infoIconSource).toContain('<circle cx="12" cy="12" r="9" />');
    expect(infoIconSource).toContain('<path d="M12 11v6" />');
    expect(infoIconSource).toContain(
      '<circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none" />',
    );

    for (const wrapperSource of [
      appIconSource,
      queryIconSource,
      coStarIconSource,
    ]) {
      expect(wrapperSource).toContain("import InfoIcon from");
      expect(wrapperSource).toContain('v-if="name === \'info\'"');
      expect(wrapperSource).not.toContain('<circle cx="12" cy="12" r="9"');
      expect(wrapperSource).not.toMatch(/M12 1(?:0\.5|1)v/);
    }
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
    expect(partnersSource).toContain(
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
