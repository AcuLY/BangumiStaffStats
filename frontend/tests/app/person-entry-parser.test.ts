import { describe, expect, it } from 'vitest';
import * as entry from '../../src/app/personEntry';
import { createDefaultDraft, normalizeUid } from '../../src/features/query/model';

const search = '?entry=bangumi-person&user=luca&person=42&type=anime';
describe('restricted person entry parser', () => {
  it.each(['book', 'anime', 'music', 'game', 'real'])('accepts only a single supported %s type', subjectType => {
    expect(entry.parsePersonEntry('/ranking', search.replace('type=anime', `type=${subjectType}`)))
      .toEqual({ kind: 'valid', intent: { uid: 'luca', personId: 42, subjectType } });
  });
  it.each(['/', '/index.html', '/ranking/', '/Ranking', '/co-star', '/old/ranking', '/v2/ranking', null])('does not repair logical path %s', path => {
    expect(entry.parsePersonEntry(path, search).kind).toBe('invalid');
  });
  it.each([
    search + '&extra=true', search + '&user=luca', search + '&person=42', search + '&type=anime', search + '&entry=bangumi-person',
    search.replace('&user=luca', ''), search.replace('&person=42', ''), search.replace('&type=anime', ''), search.replace('entry=bangumi-person&', ''),
    search.replace('bangumi-person', 'other'), search.replace('type=anime', 'type=all'), search + '&',
    '?extra=1', '?user=a&user=b', '?user=a&filter=1', '?entry%ZZ=x',
    ...['0', '-1', '+1', '1.0', '1e3', 'NaN', 'Infinity', '9007199254740992', ' 42', '４２', '42/'].map(id => search.replace('person=42', `person=${encodeURIComponent(id)}`)),
    ...['%', '%GG', '%E0%A4%A', '%C0%AF', '%ED%A0%80', '%F4%90%80%80', '%80'].map(uid => search.replace('user=luca', `user=${uid}`)),
  ])('fails closed for %s', value => expect(entry.parsePersonEntry('/ranking', value).kind).toBe('invalid'));
  it.each([' 张 三+&🙂 ', '\u0085Luca\u0085', 'a'.repeat(256), '🙂'.repeat(64), '\uFEFFname'])('uses shared UID validation, not an ASCII grammar (%s)', uid => {
    const result = entry.parsePersonEntry('/ranking', search.replace('user=luca', `user=${encodeURIComponent(uid)}`));
    expect(result).toEqual({ kind: 'valid', intent: { uid: normalizeUid(uid), personId: 42, subjectType: 'anime' } });
  });
  it.each(['', '   ', 'a\u0000b', 'a\nb', 'a\u007Fb', 'a\u0085b', 'a'.repeat(257), '🙂'.repeat(65)])('rejects invalid UID before executing (%s)', uid => {
    expect(entry.parsePersonEntry('/ranking', search.replace('user=luca', `user=${encodeURIComponent(uid)}`)).kind).toBe('invalid');
  });
  it('accepts the maximum safe ID and positive decimal leading zeroes', () => {
    expect(entry.parsePersonEntry('/ranking', search.replace('person=42', 'person=9007199254740991'))).toMatchObject({ kind: 'valid', intent: { personId: Number.MAX_SAFE_INTEGER } });
    expect(entry.parsePersonEntry('/ranking', search.replace('person=42', 'person=00042'))).toMatchObject({ kind: 'valid', intent: { personId: 42 } });
  });
  it('leaves absent or ordinary user-only URLs as prefill, never execution', () => {
    expect(entry.parsePersonEntry('/ranking', '')).toEqual({ kind: 'none' });
    expect(entry.parsePersonEntry('/ranking', '?user=luca')).toEqual({ kind: 'none' });
  });
  it('builds a fresh default draft overriding only the entry fields', () => {
    expect(entry.createPersonEntryDraft).toBeTypeOf('function');
    const intent = { uid: '张三', personId: 42, subjectType: 'game' as const };
    const draft = entry.createPersonEntryDraft(intent);
    expect(draft).toEqual({ ...createDefaultDraft('张三'), subjectType: 'game',
      collectionStatuses: ['wish', 'completed', 'in_progress', 'on_hold', 'dropped'], positionScope: 'all', positionKeys: [] });
    draft.globalScore.enabled = true;
    draft.collectionStatuses.pop();
    expect(entry.createPersonEntryDraft(intent).globalScore.enabled).toBe(false);
    expect(entry.createPersonEntryDraft(intent).collectionStatuses).toHaveLength(5);
  });
});
