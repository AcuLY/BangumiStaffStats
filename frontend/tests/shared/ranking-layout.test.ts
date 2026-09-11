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
  it('shares complete row geometry with contextual lists without sharing workspace layout', () => {
    const contexts = ['.ranked-person-results', '.ranking-workspace'];
    for (const descendant of [
      '.ranking-columns,',
      '.ranking-columns__metrics,',
      '.ranking-columns__metrics.is-global,',
      '.ranked-person-list,',
      '.ranked-person-row__progress.is-signed',
      '.ranked-person-row__identity',
    ]) {
      expect(ruleBody(`${contexts[0]} ${descendant}`)).toBe(
        ruleBody(`${contexts[1]} ${descendant}`),
      );
    }

    const narrowQuery = baseCss.indexOf('@container ranking-pane (max-width: 380px)');
    expect(ruleBody('.ranked-person-results .ranking-columns,', narrowQuery)).toContain(
      'grid-template-areas: "rank identity metrics";',
    );
    expect(ruleBody('.ranked-person-results .ranked-person-row__avatar', narrowQuery)).toContain(
      'display: none;',
    );
    expect(baseCss).not.toContain('.ranked-person-results > .ranking-surface');
    expect(baseCss).not.toContain('.ranked-person-results .ranking-toolbar');
  });

  it('reserves the complete personal metric reference width', () => {
    const outerGrid = ruleBody(
      '.ranking-workspace .ranking-columns,\n' +
        '.ranking-workspace .ranked-person-row',
    );

    expect(outerGrid).toContain(
      '--ranking-columns: 22px 36px minmax(0, 1fr) minmax(196px, 40%);',
    );
  });

  it('keeps ranking header and row metrics on one spaced track definition', () => {
    const rankingMetrics = ruleBody(
      '.ranking-workspace .ranking-columns__metrics,\n' +
        '.ranking-workspace .ranked-person-row__metrics',
    );

    expect(rankingMetrics).toContain('--ranking-count-track: 40px;');
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

  it('hides avatars on narrow rows while keeping names and metrics on one line', () => {
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
    const narrowGrid = ruleBody(
      '.ranking-workspace .ranking-columns,',
      narrowQueryStart,
    );
    expect(narrowGrid).toContain('grid-template-areas: "rank identity metrics";');
    expect(narrowGrid).toContain(
      'grid-template-columns: 22px minmax(0, 1fr) minmax(196px, 40%);',
    );
    expect(
      ruleBody('.ranking-workspace .ranked-person-row__avatar', narrowQueryStart),
    ).toContain('display: none;');
    expect(
      ruleBody('.ranking-columns > :nth-child(2)', narrowQueryStart),
    ).toContain('display: none;');
  });
});
