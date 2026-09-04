import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const frontendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const baseCss = fs
  .readFileSync(path.join(frontendRoot, 'src/shared/styles/base.css'), 'utf8')
  .replaceAll('\r\n', '\n');

function ruleBody(selector: string, afterIndex = 0): string {
  const selectorIndex = baseCss.indexOf(selector, afterIndex);
  if (selectorIndex < 0) {
    throw new Error(`Missing CSS selector: ${selector}`);
  }

  const bodyStart = baseCss.indexOf('{', selectorIndex);
  const bodyEnd = baseCss.indexOf('}', bodyStart);
  return baseCss.slice(bodyStart + 1, bodyEnd);
}

describe('ranking metric layout', () => {
  it('reserves the complete personal metric reference width', () => {
    const outerGrid = ruleBody(
      '.ranking-workspace .ranking-columns,\n' +
        '.ranking-workspace .ranked-person-row',
    );

    expect(outerGrid).toContain(
      '--ranking-columns: 22px 36px minmax(0, 1fr) minmax(180px, 40%);',
    );
  });

  it('keeps ranking header and row metrics on one spaced track definition', () => {
    const rankingMetrics = ruleBody(
      '.ranking-workspace .ranking-columns__metrics,\n' +
        '.ranking-workspace .ranked-person-row__metrics',
    );

    expect(rankingMetrics).toContain('--ranking-count-track: 24px;');
    expect(rankingMetrics).toContain('--ranking-score-track: 40px;');
    expect(rankingMetrics).toContain('--ranking-preference-track: 48px;');
    expect(rankingMetrics).toContain(
      'minmax(var(--ranking-count-track), 1fr)',
    );
    expect(rankingMetrics).toContain(
      'repeat(2, minmax(var(--ranking-score-track), 1fr))',
    );
    expect(rankingMetrics).toContain(
      'minmax(var(--ranking-preference-track), 1fr);',
    );
    expect(rankingMetrics).toContain('column-gap: var(--space-2);');
  });

  it('preserves the three-track global variant and co-star base rule', () => {
    const compatibilityLayer = baseCss.indexOf(
      '/* Approved-oracle compatibility layer for the production ranking surface. */',
    );
    const globalMetrics = ruleBody(
      '.ranking-workspace .ranking-columns__metrics.is-global,\n' +
        '.ranking-workspace .ranked-person-row__metrics.is-global',
    );
    const sharedBase = ruleBody(
      '.ranking-columns__metrics,\n.ranked-person-row__metrics',
      compatibilityLayer,
    );

    expect(globalMetrics).toContain(
      'repeat(2, minmax(var(--ranking-score-track), 1fr));',
    );
    expect(globalMetrics).not.toContain('--ranking-preference-track');
    expect(sharedBase).toContain('gap: 0;');
  });

  it('reflows the complete metric group before narrow identities collapse', () => {
    const wideQueryStart = baseCss.indexOf(
      '@container ranking-pane (width > 380px)',
    );
    const narrowQueryStart = baseCss.indexOf(
      '@container ranking-pane (max-width: 380px)',
    );
    const wideQuery = baseCss.slice(wideQueryStart, narrowQueryStart);

    expect(wideQueryStart).toBeGreaterThan(-1);
    expect(wideQuery).toContain('.ranking-workspace .ranked-person-row');
    expect(wideQuery).toContain(
      'grid-template-areas: "rank avatar identity metrics";',
    );
    expect(baseCss).toContain(
      '@container ranking-pane (max-width: 380px)',
    );
    expect(baseCss).not.toContain(
      '@container ranking-pane (max-width: 340px)',
    );
  });
});
