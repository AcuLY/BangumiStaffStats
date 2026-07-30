import { describe, expect, it } from 'vitest';

import {
  formatHundredths,
  formatRational,
  rankingProgress,
} from '../../../src/features/ranking/format';
import {
  defaultRankingView,
  updateRankingView,
} from '../../../src/features/ranking/model';

describe('ranking view model', () => {
  it('resets page only for search/sort/order/page-size changes', () => {
    const current = {
      ...defaultRankingView,
      page: 4,
    };

    expect(updateRankingView(current, { page: 3 }).page).toBe(3);
    expect(updateRankingView(current, { search: '林' })).toMatchObject({
      page: 1,
      search: '林',
    });
    expect(updateRankingView(current, { sort: 'average' })).toMatchObject({
      page: 1,
      sort: 'average',
    });
    expect(updateRankingView(current, { order: 'asc' })).toMatchObject({
      order: 'asc',
      page: 1,
    });
    expect(updateRankingView(current, { pageSize: 20 })).toMatchObject({
      page: 1,
      pageSize: 20,
    });
  });

  it('formats nullable hundredths and arbitrary-size rationals without float loss', () => {
    expect(formatHundredths(825)).toBe('8.25');
    expect(formatHundredths(null)).toBe('—');
    expect(
      formatRational({
        numerator: '123456789012345678901234567890',
        denominator: '100000000000000000000000000000',
      }),
    ).toBe('+1.23');
    expect(
      formatRational({
        numerator: '-1',
        denominator: '8',
      }),
    ).toBe('−0.13');
    expect(
      formatRational({
        numerator: '0',
        denominator: '1',
      }),
    ).toBe('0.00');
  });

  it('uses the backend scale unchanged for linear and signed progress', () => {
    const item = {
      average: 825,
      overall: 677,
      person: { id: 12, name: 'Hayashi', nameCN: '林明' },
      preference: {
        comparableCount: 6,
        comparableSeriesCount: 6,
        effectiveEvidence: 6,
        evidenceWeight: { numerator: '6', denominator: '11' },
        mean: { numerator: '1', denominator: '2' },
        score: { numerator: '-3', denominator: '10' },
      },
      rank: 2,
      workCount: 7,
    };

    expect(
      rankingProgress(item, {
        kind: 'linear',
        max: 10,
        metric: 'count',
      }),
    ).toEqual({ direction: 'positive', percent: 70 });
    expect(
      rankingProgress(item, {
        kind: 'linear',
        max: { numerator: '3', denominator: '5' },
        metric: 'preference',
      }),
    ).toEqual({ direction: 'negative', percent: 50 });
  });
});
