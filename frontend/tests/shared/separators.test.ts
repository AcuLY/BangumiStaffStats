import { describe, expect, it } from 'vitest';
import { displaySeparator, joinDisplayText } from '../../src/shared/text/separators';

describe('display separator spacing', () => {
  it.each([' · ', ' / ', ' + ', ' — '])('trims only the bracket-adjacent side of %s', separator => {
    expect(joinDisplayText(['声优（主役）', '名字'], separator)).toBe(`声优（主役）${separator.trimStart()}名字`);
    expect(joinDisplayText(['名字', '（补充）'], separator)).toBe(`名字${separator.trimEnd()}（补充）`);
    expect(joinDisplayText(['（甲）', '（乙）'], separator)).toBe(`（甲）${separator.trim()}（乙）`);
    expect(joinDisplayText(['音乐人', '声优'], separator)).toBe(`音乐人${separator}声优`);
  });

  it('preserves source whitespace and ASCII parentheses', () => {
    expect(joinDisplayText(['A (B)', 'C'], ' / ')).toBe('A (B) / C');
    expect(joinDisplayText(['声优 （主役）', ' A B '], ' · ')).toBe('声优 （主役）·  A B ');
    expect(joinDisplayText([], ' / ')).toBe('');
    expect(displaySeparator('声优（主役）', '名字', ' ·')).toBe('·');
  });
});
