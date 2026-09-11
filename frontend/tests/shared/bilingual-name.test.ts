import { describe, expect, it } from 'vitest';

import {
  bilingualNameTitle,
  resolveBilingualName,
} from '../../src/shared/names/bilingualName';

describe('bilingual name presentation', () => {
  it.each([
    [{ name: 'Hayashi Akira', nameCN: '林明' }, ['林明', 'Hayashi Akira']],
    [{ name: '石原立也', nameCN: '石原立也' }, ['石原立也', '石原立也']],
    [{ name: 'AIR', nameCN: null }, ['AIR', 'AIR']],
    [{ name: '', nameCN: '只有中文名' }, ['只有中文名', '只有中文名']],
  ] as const)('resolves Chinese first and original second', (source, expected) => {
    const names = resolveBilingualName(source);

    expect([names.primary, names.secondary]).toEqual(expected);
    expect(bilingualNameTitle(source)).toBe(expected.join('\n'));
  });
});
