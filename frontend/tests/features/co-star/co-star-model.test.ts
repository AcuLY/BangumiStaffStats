import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { decodeCoStarPayload } from '../../../src/api/adapters/coStar';
import {
  coStarInput,
  coStarInputMatchesSelection,
  coStarSortOptions,
  defaultCoStarView,
  projectCoStarMatrix,
  updateCoStarView,
} from '../../../src/features/co-star/coStar';
import type { SelectedIdentity } from '../../../src/features/co-star/model';
import { createCoStarSelection } from '../../../src/features/co-star/selection';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);

function groupPayload() {
  const golden = JSON.parse(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'contracts/goldens/api/co-star/cases/group.json',
      ),
      'utf8',
    ),
  ) as { cases: Array<{ expected: { body: unknown } }> };
  return decodeCoStarPayload(
    golden.cases[0]!.expected.body,
    'global',
  );
}

function identity(
  personId: number,
  positionKey: string,
): SelectedIdentity {
  return {
    person: {
      id: personId,
      name: `Person ${personId}`,
      nameCN: personId === 1 ? '一号' : null,
    },
    positionKey,
    positionLabel: `职位 ${positionKey}`,
  };
}

describe('co-star input and view model', () => {
  it('preserves selected person and identity order without adding refresh state', () => {
    const selection = createCoStarSelection([
      identity(2, 'staff:anime:2'),
      identity(1, 'staffset:anime:creative'),
      identity(2, 'cast:anime:main'),
      identity(3, 'staff:anime:101'),
    ]);
    const input = coStarInput(selection.people.value);

    expect(input).toEqual({
      participants: [
        {
          personId: 2,
          positionKeys: ['staff:anime:2', 'cast:anime:main'],
        },
        {
          personId: 1,
          positionKeys: ['staffset:anime:creative'],
        },
        {
          personId: 3,
          positionKeys: ['staff:anime:101'],
        },
      ],
    });
    expect(input).not.toHaveProperty('refreshCollection');
    expect(Object.isFrozen(input.participants)).toBe(true);
    expect(
      coStarInputMatchesSelection(input, selection.people.value),
    ).toBe(true);
    expect(
      coStarInputMatchesSelection(
        {
          participants: [...input.participants].reverse(),
        },
        selection.people.value,
      ),
    ).toBe(false);
  });

  it('uses scope defaults and exposes only legal sort choices for each work unit', () => {
    expect(defaultCoStarView('personal').sort).toBe('personalScore');
    expect(defaultCoStarView('global').sort).toBe('globalScore');
    expect(coStarSortOptions('global', 'subject')).toEqual([
      { label: '评分', value: 'globalScore' },
    ]);
    expect(coStarSortOptions('personal', 'series')).toEqual([
      { label: '我的系列均分', value: 'personalScore' },
      { label: '全站评分', value: 'globalScore' },
      { label: '收藏日期', value: 'collectionUpdatedAt' },
      { label: '系列规模', value: 'seriesSize' },
    ]);

    const current = {
      ...defaultCoStarView('personal'),
      page: 4,
    };
    expect(updateCoStarView(current, { page: 3 }).page).toBe(3);
    expect(updateCoStarView(current, { search: '共同' })).toMatchObject({
      page: 1,
      search: '共同',
    });
    expect(updateCoStarView(current, { pageSize: 20 })).toMatchObject({
      page: 1,
      pageSize: 20,
    });
  });
});

describe('co-star display-only matrix projection', () => {
  it('mirrors exact server cells without deriving best-pair or aggregate metrics', () => {
    const payload = groupPayload();
    if (payload.data.kind !== 'group') {
      throw new Error('Expected group golden');
    }
    const rows = projectCoStarMatrix(payload.data);

    expect(rows).toHaveLength(3);
    expect(rows[0]!.cells).toHaveLength(3);
    expect(rows[0]!.cells[0]!.kind).toBe('diagonal');
    expect(rows[0]!.cells[0]!.metrics).toBe(
      payload.data.participants[0]!.metrics,
    );
    expect(rows[0]!.cells[1]!.metrics).toBe(
      payload.data.matrix.pairs[0]!.metrics,
    );
    expect(rows[1]!.cells[0]!.metrics).toBe(
      payload.data.matrix.pairs[0]!.metrics,
    );
    expect(rows[0]!.cells[2]!.metrics).toBe(
      payload.data.matrix.pairs[1]!.metrics,
    );
    expect(rows[1]!.cells[2]!.metrics).toBe(
      payload.data.matrix.pairs[2]!.metrics,
    );
    expect(rows[0]!.cells[1]).not.toHaveProperty('best');
    expect(rows[0]!.cells[1]).not.toHaveProperty('rank');
    expect(Object.isFrozen(rows)).toBe(true);
    expect(Object.isFrozen(rows[0]!.cells)).toBe(true);
  });
});
