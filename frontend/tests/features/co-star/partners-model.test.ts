import { describe, expect, it } from 'vitest';

import type { PartnerItem } from '../../../src/api/adapters/partners';
import type { SelectedPerson } from '../../../src/features/co-star/model';
import {
  activatePartner,
  defaultPartnersView,
  partnerSortOptions,
  partnersInput,
  partnersInputMatchesSelection,
  updatePartnersView,
} from '../../../src/features/co-star/partners';
import {
  createCoStarSelection,
  MAX_SELECTED_PEOPLE,
} from '../../../src/features/co-star/selection';

function source(): SelectedPerson {
  const person = Object.freeze({
    id: 1,
    name: 'Source',
    nameCN: '来源',
  });
  return Object.freeze({
    identities: Object.freeze([
      Object.freeze({
        person,
        positionKey: 'staffset:anime:creative',
        positionLabel: '创作人员',
      }),
      Object.freeze({
        person,
        positionKey: 'staff:anime:2',
        positionLabel: '导演',
      }),
    ]),
    person,
  });
}

function partner(id = 2): PartnerItem {
  return Object.freeze({
    metrics: Object.freeze({
      average: 850,
      overall: 720,
      ratedWorkCount: 2,
      workCount: 2,
    }),
    person: Object.freeze({
      id,
      name: `Partner ${id}`,
      nameCN: id === 2 ? '合作方' : null,
    }),
    positionKeys: Object.freeze([
      'staff:anime:2',
      'cast:anime:main',
    ]),
    rank: 8,
  });
}

describe('partners view and source model', () => {
  it('preserves canonical ordered source identities and omits an all-position sentinel', () => {
    const selected = source();
    const all = partnersInput(selected);
    const castOnly = partnersInput(selected, 'cast:anime:main');

    expect(all).toEqual({
      source: {
        personId: 1,
        positionKeys: [
          'staffset:anime:creative',
          'staff:anime:2',
        ],
      },
    });
    expect(all).not.toHaveProperty('candidatePositionKey');
    expect(castOnly.candidatePositionKey).toBe('cast:anime:main');
    expect(partnersInputMatchesSelection(all, selected)).toBe(true);
    expect(
      partnersInputMatchesSelection(
        {
          source: {
            personId: 1,
            positionKeys: [
              'staff:anime:2',
              'staffset:anime:creative',
            ],
          },
        },
        selected,
      ),
    ).toBe(false);
  });

  it('resets only server pagination and structurally omits personal-only sort choices globally', () => {
    const current = Object.freeze({
      ...defaultPartnersView,
      page: 4,
    });

    expect(updatePartnersView(current, { page: 3 }).page).toBe(3);
    expect(updatePartnersView(current, { search: '林' })).toMatchObject({
      page: 1,
      search: '林',
    });
    expect(updatePartnersView(current, { pageSize: 20 })).toMatchObject({
      page: 1,
      pageSize: 20,
    });
    expect(partnerSortOptions('global', 'series')).toEqual([
      { label: '系列数', value: 'count' },
      { label: '均分', value: 'average' },
      { label: '综合分', value: 'overall' },
    ]);
    expect(partnerSortOptions('personal', 'subject')).toContainEqual({
      label: '相对偏好',
      value: 'preference',
    });
  });
});

describe('partner activation', () => {
  it('atomically appends the server-returned contributing identities after the source', () => {
    const selected = source();
    const selection = createCoStarSelection(selected.identities);

    expect(
      activatePartner(
        selection,
        partner(),
        (positionKey) =>
          positionKey === 'cast:anime:main' ? '主要声优' : '导演',
      ),
    ).toEqual({ ok: true });

    expect(
      selection.people.value.map((person) => ({
        id: person.person.id,
        positions: person.identities.map(
          (identity) => identity.positionKey,
        ),
      })),
    ).toEqual([
      {
        id: 1,
        positions: [
          'staffset:anime:creative',
          'staff:anime:2',
        ],
      },
      {
        id: 2,
        positions: ['staff:anime:2', 'cast:anime:main'],
      },
    ]);
  });

  it('keeps the accepted tray unchanged when adding the partner would exceed a limit', () => {
    const selection = createCoStarSelection(
      Array.from({ length: MAX_SELECTED_PEOPLE }, (_, index) => ({
        person: {
          id: index + 1,
          name: `Person ${index + 1}`,
          nameCN: null,
        },
        positionKey: 'staff:anime:2',
        positionLabel: '导演',
      })),
    );
    const before = selection.identities.value;

    expect(
      activatePartner(selection, partner(99), () => '合作身份'),
    ).toMatchObject({
      ok: false,
      reason: 'participant-limit',
    });
    expect(selection.identities.value).toBe(before);
  });
});
