import { describe, expect, it } from 'vitest';

import {
  defaultPersonDetailView,
  formatSignedHundredths,
  rationalDecimal,
  updatePersonDetailView,
} from '../../../src/features/person-detail/model';

describe('person-detail presentation model', () => {
  it('keeps the approved globalScore default for personal and global detail requests', () => {
    expect(defaultPersonDetailView).toEqual({
      order: 'desc',
      page: 1,
      pageSize: 10,
      search: '',
      section: 'works',
      sort: 'globalScore',
    });
    expect(
      updatePersonDetailView(
        { ...defaultPersonDetailView, page: 4 },
        { search: '导演' },
      ),
    ).toMatchObject({
      page: 1,
      search: '导演',
      sort: 'globalScore',
    });
  });

  it('formats canonical rationals with BigInt precision and one shared signed convention', () => {
    expect(
      rationalDecimal(
        {
          numerator: '900719925474099300',
          denominator: '100000000000000000',
        },
        true,
      ),
    ).toBe('+9.01');
    expect(
      rationalDecimal(
        { numerator: '-1', denominator: '8' },
        true,
      ),
    ).toBe('−0.13');
    expect(
      rationalDecimal(
        { numerator: '0', denominator: '999999999999999999' },
        true,
      ),
    ).toBe('0.00');
    expect(rationalDecimal(null, true)).toBe('—');
    expect(formatSignedHundredths(80)).toBe('+0.80');
    expect(formatSignedHundredths(-80)).toBe('−0.80');
    expect(formatSignedHundredths(0)).toBe('0.00');
    expect(formatSignedHundredths(null)).toBe('—');
  });
});
