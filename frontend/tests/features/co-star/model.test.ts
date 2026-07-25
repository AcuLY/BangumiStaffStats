import { describe, expect, it } from 'vitest';

import {
  candidateSortOptions,
  defaultCandidateView,
  updateCandidateView,
} from '../../../src/features/co-star/model';
import {
  createCoStarSelection,
  MAX_SELECTED_IDENTITIES,
  MAX_SELECTED_PEOPLE,
} from '../../../src/features/co-star/selection';

function identity(
  personId: number,
  positionKey: string,
  positionLabel = positionKey,
) {
  return {
    person: {
      id: personId,
      name: `Person ${personId}`,
      nameCN: personId === 1 ? '人物一' : null,
    },
    positionKey,
    positionLabel,
  };
}

describe('co-star candidate view model', () => {
  it('resets only server view pagination and preserves legal scope sorts', () => {
    const current = Object.freeze({
      ...defaultCandidateView,
      page: 4,
    });

    expect(updateCandidateView(current, { page: 3 }).page).toBe(3);
    expect(updateCandidateView(current, { search: '林' })).toMatchObject({
      page: 1,
      search: '林',
    });
    expect(updateCandidateView(current, { sort: 'average' })).toMatchObject({
      page: 1,
      sort: 'average',
    });
    expect(updateCandidateView(current, { order: 'asc' })).toMatchObject({
      order: 'asc',
      page: 1,
    });
    expect(updateCandidateView(current, { pageSize: 20 })).toMatchObject({
      page: 1,
      pageSize: 20,
    });

    expect(candidateSortOptions('global', 'subject')).toEqual([
      { label: '作品数', value: 'count' },
      { label: '均分', value: 'average' },
    ]);
    expect(candidateSortOptions('personal', 'series')).toEqual([
      { label: '系列数', value: 'count' },
      { label: '我的均分', value: 'average' },
      { label: '全站均分', value: 'globalAverage' },
    ]);
  });
});

describe('ordered co-star identity selection', () => {
  it('toggles only the exact identity and preserves first person/identity order', () => {
    const selection = createCoStarSelection();

    expect(selection.toggle(identity(2, 'staff:anime:2', '导演'))).toEqual({
      ok: true,
    });
    selection.toggle(identity(1, 'cast:anime:all', '声优'));
    selection.toggle(identity(2, 'staff:anime:74', '总导演'));

    expect(
      selection.people.value.map((person) => ({
        id: person.person.id,
        positions: person.identities.map(
          (selected) => selected.positionLabel,
        ),
      })),
    ).toEqual([
      { id: 2, positions: ['导演', '总导演'] },
      { id: 1, positions: ['声优'] },
    ]);
    expect(selection.identityCount.value).toBe(3);

    selection.toggle(identity(2, 'staff:anime:2', '导演'));
    expect(selection.has(2, 'staff:anime:2')).toBe(false);
    expect(selection.has(2, 'staff:anime:74')).toBe(true);
    expect(selection.people.value.map((item) => item.person.id)).toEqual([
      2,
      1,
    ]);

    selection.removePerson(2);
    expect(selection.people.value.map((item) => item.person.id)).toEqual([1]);
    expect(selection.identities.value).toHaveLength(1);
  });

  it('prevents the eleventh person without losing the accepted ten', () => {
    const selection = createCoStarSelection(
      Array.from({ length: MAX_SELECTED_PEOPLE }, (_, index) =>
        identity(index + 1, 'staff:anime:2', '导演'),
      ),
    );

    expect(
      selection.toggle(
        identity(MAX_SELECTED_PEOPLE + 1, 'staff:anime:2', '导演'),
      ),
    ).toEqual({
      message: '最多选择 10 人',
      ok: false,
      reason: 'participant-limit',
    });
    expect(selection.personCount.value).toBe(MAX_SELECTED_PEOPLE);
    expect(selection.identityCount.value).toBe(MAX_SELECTED_PEOPLE);
    expect(selection.limitError.value).toBe('最多选择 10 人');
  });

  it('prevents the twenty-first identity and rejects duplicate restore input', () => {
    const selection = createCoStarSelection(
      Array.from({ length: MAX_SELECTED_IDENTITIES }, (_, index) =>
        identity(
          (index % MAX_SELECTED_PEOPLE) + 1,
          `staff:anime:${index + 1}`,
        ),
      ),
    );

    expect(
      selection.toggle(identity(1, 'staff:anime:999', '新增身份')),
    ).toEqual({
      message: '最多选择 20 个身份',
      ok: false,
      reason: 'identity-limit',
    });
    expect(selection.identityCount.value).toBe(MAX_SELECTED_IDENTITIES);

    const before = selection.identities.value;
    expect(
      selection.replace([
        identity(1, 'staff:anime:2'),
        identity(1, 'staff:anime:2'),
      ]),
    ).toEqual({
      message: '人物身份不能重复',
      ok: false,
      reason: 'invalid-identity',
    });
    expect(selection.identities.value).toBe(before);
  });
});
