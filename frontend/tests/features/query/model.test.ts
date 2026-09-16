import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type {
  CatalogPosition,
  CatalogSnapshot,
  SubjectType,
} from '../../../src/api/adapters/catalog';
import {
  createDefaultDraft,
  draftFromEffective,
  draftSemanticSignature,
  isCanonicalAppliedQuery,
  normalizeQueryTagV1,
  summarizeQuery,
  trimQueryTextV1,
  validateDraft,
} from '../../../src/features/query/model';
import { catalogFixture } from './fixtures';

interface QueryGoldenCase {
  catalog: {
    positions: Array<{
      key: string;
      selectable: boolean;
      subjectType: SubjectType;
    }>;
  };
  expected: { effective: Record<string, unknown> };
  id: string;
  submitted: Record<string, any>;
}

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);
const queryGoldens = JSON.parse(
  fs.readFileSync(
    path.join(
      repositoryRoot,
      'contracts/goldens/query/cases/queries.json',
    ),
    'utf8',
  ),
) as {
  cases: QueryGoldenCase[];
  negativeCases: Array<Record<string, any> & { id: string }>;
};
const unicodeGoldens = JSON.parse(
  fs.readFileSync(
    path.join(
      repositoryRoot,
      'contracts/goldens/query/cases/unicode.json',
    ),
    'utf8',
  ),
) as {
  foldCases: Array<{ expected: string; id: string; input: string }>;
  rejectionCases: Array<{ id: string; input?: string }>;
  trimCases: Array<{ expected: string; id: string; input: string }>;
};

function catalogForGolden(testCase: QueryGoldenCase): CatalogSnapshot {
  const positions: CatalogPosition[] = testCase.catalog.positions.map(
    (position, index) => ({
      capabilities: ['rankings', 'candidates'],
      categories: [],
      displayOrder: index,
      key: position.key,
      kind: 'staff',
      label: position.key,
      names: { cn: position.key, en: null, jp: null },
      selectable: position.selectable,
      subjectType: position.subjectType,
    }),
  );
  return {
    dataVersion: 'dv1-test',
    filterCapabilities: [
      {
        applications: [
          { operation: 'rankings' },
          { operation: 'candidates' },
        ],
        field: 'mergeSeries',
        scopes: ['personal', 'global'],
        subjectTypes: ['anime'],
      },
    ],
    groups: [],
    positions,
    positionsByKey: new Map(
      positions.map((position) => [position.key, position]),
    ),
    requestId: 'golden',
    selectionRules: [],
    sortCapabilities: [],
    subjectTypes: [
      { key: 'book', label: '书籍' },
      { key: 'anime', label: '动画' },
      { key: 'music', label: '音乐' },
      { key: 'game', label: '游戏' },
      { key: 'real', label: '三次元' },
    ],
  };
}

function draftForGolden(testCase: QueryGoldenCase) {
  const submitted = testCase.submitted;
  const draft = createDefaultDraft(submitted.uid ?? '');
  draft.scope = submitted.scope;
  draft.subjectType = submitted.subjectType;
  draft.positionKeys = [...submitted.positionKeys];
  if (Object.hasOwn(submitted, 'positionScope')) {
    Object.assign(draft, { positionScope: submitted.positionScope });
  }
  draft.includeNSFW = submitted.includeNSFW ?? false;
  draft.mergeSeries = submitted.mergeSeries ?? false;
  if (submitted.scope === 'personal') {
    draft.collectionStatuses = [...submitted.collectionStatuses];
  }
  const assignRange = (
    target: { enabled: boolean; max: string; min: string },
    value: { max?: number | string; min?: number | string } | undefined,
  ) => {
    if (!value) {
      return;
    }
    target.enabled = true;
    target.min = value.min === undefined ? '' : String(value.min);
    target.max = value.max === undefined ? '' : String(value.max);
  };
  const filters = submitted.filters;
  if (filters) {
    assignRange(draft.subjectDate, filters.subjectDate);
    assignRange(draft.collectionUpdatedAt, filters.collectionUpdatedAt);
    assignRange(draft.personalScore, filters.personalScore);
    assignRange(draft.globalScore, filters.globalScore);
    assignRange(draft.scoreDifference, filters.scoreDifference);
    assignRange(draft.ratingCount, filters.ratingCount);
    if (filters.tags?.include) {
      draft.positiveTags = {
        enabled: true,
        values: filters.tags.include.map(
          (group: { anyOf: string[] }) => group.anyOf.join('/'),
        ),
      };
    }
    if (filters.tags?.exclude) {
      draft.negativeTags = {
        enabled: true,
        values: filters.tags.exclude.map(
          (group: { allOf: string[] }) => group.allOf.join('+'),
        ),
      };
    }
  }
  return draft;
}

describe('unrestricted query core', () => {
  const subjectTypes = ['book', 'anime', 'music', 'game', 'real'] as const;

  it.each(subjectTypes)('preserves explicit all for %s in both scopes and modes', (subjectType) => {
    for (const scope of ['personal', 'global'] as const) {
      for (const mode of ['ranking', 'co-star'] as const) {
        for (const operationScope of ['query', 'all'] as const) {
          const draft = Object.assign(createDefaultDraft('luca'), {
            subjectType, scope, positionScope: 'all' as const,
          });
          const result = validateDraft(draft, mode, catalogFixture(), operationScope);
          expect(result.errors).toEqual({});
          expect(result.query).toEqual({
            scope, subjectType, positionKeys: [], positionScope: 'all',
            includeNSFW: false, mergeSeries: false,
            ...(scope === 'personal' ? { uid: 'luca', collectionStatuses: ['completed', 'in_progress'] } : {}),
          });
          expect(isCanonicalAppliedQuery(result.query!, operationScope)).toBe(true);
          expect(draftFromEffective(result.query!)).toEqual({ ...draft, uid: scope === 'personal' ? 'luca' : '' });
          expect(draftSemanticSignature(draftFromEffective(result.query!))).toBe(draftSemanticSignature(draft));
          expect(summarizeQuery(result.query!, catalogFixture(), operationScope)[0]).toBe('不限');
          expect(draft.positionKeys).toEqual([]);
        }
      }
    }
  });

  it.each(subjectTypes)('does not infer ranking all from empty positions for %s', (subjectType) => {
    for (const scope of ['personal', 'global'] as const) {
      const draft = Object.assign(createDefaultDraft('luca'), { subjectType, scope });
      expect(validateDraft(draft, 'ranking', catalogFixture(), 'all').errors.positionKeys).toBeTruthy();
    }
  });

  it.each([
    ['all', ['staff:anime:2']], ['all', [' ']],
    [null, []], ['query', []], ['unknown', []],
    [null, ['staff:anime:2']], ['query', ['staff:anime:2']], ['unknown', ['staff:anime:2']],
  ])('rejects scope %j with exact keys %j without mutating the draft', (positionScope, keys) => {
    for (const scope of ['personal', 'global'] as const) {
      for (const mode of ['ranking', 'co-star'] as const) {
        for (const operationScope of ['query', 'all'] as const) {
          const draft = Object.assign(createDefaultDraft('luca'), { scope, positionScope, positionKeys: keys });
          const before = structuredClone(draft);
          // Exercise malformed runtime values that TypeScript alone cannot prevent.
          const result = validateDraft(draft as ReturnType<typeof createDefaultDraft>, mode, catalogFixture(), operationScope);
          expect(result.query).toBeNull();
          expect(result.errors.positionKeys).toBeTruthy();
          expect(draft).toEqual(before);
        }
      }
    }
  });

  it('rejects malformed query-wide scope during canonical validation even for operation all', () => {
    const base = validateDraft(Object.assign(createDefaultDraft('luca'), {
      positionKeys: ['staff:anime:2'],
    }), 'ranking', catalogFixture()).query!;
    for (const positionScope of [null, 'query', 'unknown', 'all']) {
      for (const operationScope of ['query', 'all'] as const) {
        expect(isCanonicalAppliedQuery({ ...base, positionScope } as typeof base, operationScope)).toBe(false);
      }
    }
  });

  it('preserves legacy absent-scope effective and draft signatures', () => {
    const draft = createDefaultDraft('luca');
    draft.positionKeys = ['staff:anime:2', 'staff:anime:101', 'staff:anime:2'];
    const result = validateDraft(draft, 'ranking', catalogFixture());
    expect(JSON.stringify(result.query)).toBe('{"scope":"personal","uid":"luca","collectionStatuses":["completed","in_progress"],"subjectType":"anime","positionKeys":["staff:anime:2","staff:anime:101"],"includeNSFW":false,"mergeSeries":false}');
    expect(draftSemanticSignature(draft)).toBe('{"scope":"personal","subjectType":"anime","positionKeys":["staff:anime:2","staff:anime:101"],"includeNSFW":false,"mergeSeries":false,"subjectDate":null,"globalScore":null,"ratingCount":null,"positiveTags":null,"negativeTags":null,"uid":"luca","collectionStatuses":["completed","in_progress"],"collectionUpdatedAt":null,"personalScore":null,"scoreDifference":null}');
    expect(draftFromEffective(result.query!)).not.toHaveProperty('positionScope');
    const legacyEmpty = createDefaultDraft('luca');
    const explicit = Object.assign(createDefaultDraft('luca'), { positionScope: 'all' as const });
    expect(draftSemanticSignature(explicit)).not.toBe(draftSemanticSignature(legacyEmpty));
    expect(validateDraft(legacyEmpty, 'co-star', catalogFixture(), 'all').query).not.toHaveProperty('positionScope');
  });

  it('normalizes wish first without changing manual defaults', () => {
    const draft = createDefaultDraft('luca');
    expect(draft.collectionStatuses).toEqual(['completed', 'in_progress']);
    expect(draft).not.toHaveProperty('positionScope');
    draft.positionKeys = ['staff:anime:2'];
    draft.collectionStatuses = ['dropped', 'wish', 'on_hold', 'completed', 'wish', 'in_progress'];
    const result = validateDraft(draft, 'ranking', catalogFixture());
    expect(result.errors).toEqual({});
    expect(result.query).toHaveProperty('collectionStatuses', ['wish', 'completed', 'in_progress', 'on_hold', 'dropped']);
    expect(isCanonicalAppliedQuery(result.query!)).toBe(true);
    expect(validateDraft(draftFromEffective(result.query!), 'ranking', catalogFixture()).query).toEqual(result.query);
    expect(isCanonicalAppliedQuery({ ...result.query!, collectionStatuses: ['completed', 'wish'] } as NonNullable<typeof result.query>)).toBe(false);
    expect(draftSemanticSignature(draftFromEffective(result.query!))).toBe(draftSemanticSignature(draft));
  });

  it.each([
    ['book', '想读'], ['anime', '想看'], ['music', '想听'], ['game', '想玩'], ['real', '想看'],
  ] as const)('summarizes wish for %s as %s', (subjectType, label) => {
    const query = {
      scope: 'personal' as const, uid: 'luca', subjectType,
      positionScope: 'all' as const, positionKeys: [],
      collectionStatuses: ['wish'] as const, includeNSFW: false, mergeSeries: false,
    };
    expect(summarizeQuery(query, catalogFixture())).toContain(label);
  });
});

describe('query model', () => {
  it('accepts an empty concrete position list only for an explicit all co-star query', () => {
    const catalog = catalogFixture();
    const draft = createDefaultDraft('luca');
    draft.collectionStatuses = ['completed'];
    draft.subjectDate = { enabled: true, min: '2020-01', max: '' };

    const result = validateDraft(draft, 'co-star', catalog, 'all');

    expect(result.errors).toEqual({});
    expect(result.query).toMatchObject({
      uid: 'luca', positionKeys: [], collectionStatuses: ['completed'],
      filters: { subjectDate: { min: '2020-01' } },
    });
    expect(isCanonicalAppliedQuery(result.query!, 'all')).toBe(true);
    expect(isCanonicalAppliedQuery(result.query!)).toBe(false);
    expect(summarizeQuery(result.query!, catalog, 'all')[0]).toBe('全部职位');
    expect(validateDraft(draft, 'co-star', catalog).errors.positionKeys).toBeTruthy();
    expect(validateDraft(draft, 'ranking', catalog, 'all').errors.positionKeys).toBeTruthy();
    expect(validateDraft(draft, 'co-star', null, 'all').errors.positionKeys).toBeTruthy();
  });

  it('keeps concrete ranking keys and validates other fields while all is selected', () => {
    const catalog = catalogFixture();
    const draft = createDefaultDraft('luca');
    draft.positionKeys = ['staff:anime:2'];
    const result = validateDraft(draft, 'co-star', catalog, 'all');
    expect(result.query?.positionKeys).toEqual(['staff:anime:2']);
    expect(summarizeQuery(result.query!, catalog)[0]).toBe(
      catalog.positionsByKey.get('staff:anime:2')!.label,
    );
    expect(summarizeQuery(result.query!, catalog, 'all')[0]).toBe('全部职位');
    draft.uid = '';
    expect(validateDraft(draft, 'co-star', catalog, 'all').errors.uid).toBeTruthy();
    draft.uid = 'luca';
    draft.positionKeys = ['staff:anime:999999'];
    expect(validateDraft(draft, 'co-star', catalog, 'all').errors.positionKeys).toBeTruthy();
  });

  it('normalizes personal input, ordered positions, and structured tag groups', () => {
    const catalog = catalogFixture();
    const draft = createDefaultDraft('  luca  ');
    draft.positionKeys = [
      'staff:anime:2',
      'staff:anime:101',
      'staff:anime:2',
    ];
    draft.positiveTags.enabled = true;
    draft.positiveTags.values = ['科幻 / Sci-Fi', '原创'];
    draft.negativeTags.enabled = true;
    draft.negativeTags.values = ['崩坏 + 总集篇'];

    const result = validateDraft(draft, 'ranking', catalog);

    expect(result.errors).toEqual({});
    expect(result.query).toMatchObject({
      scope: 'personal',
      uid: 'luca',
      positionKeys: ['staff:anime:2', 'staff:anime:101'],
      filters: {
        tags: {
          include: [{ anyOf: ['sci-fi', '科幻'] }, { anyOf: ['原创'] }],
          exclude: [{ allOf: ['崩坏', '总集篇'] }],
        },
      },
    });
  });

  it('global submission ignores dormant invalid personal fields without deleting them', () => {
    const catalog = catalogFixture();
    const draft = createDefaultDraft('x'.repeat(300));
    draft.scope = 'global';
    draft.positionKeys = ['staff:anime:2'];
    draft.collectionUpdatedAt = { enabled: true, min: 'invalid', max: '' };
    draft.personalScore = { enabled: true, min: '99', max: '' };
    draft.scoreDifference = { enabled: true, min: '99', max: '' };

    const result = validateDraft(draft, 'ranking', catalog);

    expect(result.errors).toEqual({});
    expect(result.query).not.toHaveProperty('uid');
    expect(result.query).not.toHaveProperty('collectionStatuses');
    expect(
      result.query?.filters &&
        Object.hasOwn(result.query.filters, 'collectionUpdatedAt'),
    ).not.toBe(true);
    expect(draft.collectionUpdatedAt.enabled).toBe(true);
    expect(draft.personalScore.min).toBe('99');
  });

  it('rejects exclusive cast selections and unavailable positions', () => {
    const catalog = catalogFixture();
    const draft = createDefaultDraft('luca');
    draft.positionKeys = ['cast:anime:main', 'cast:anime:all'];
    expect(validateDraft(draft, 'ranking', catalog).errors).toHaveProperty(
      'positionKeys',
    );

    draft.positionKeys = ['staff:book:1'];
    expect(validateDraft(draft, 'ranking', catalog).errors).toHaveProperty(
      'positionKeys',
    );
  });

  it.each(['anime', 'game'] as const)('validates every individual %s cast scope and keeps scopes exclusive', (subjectType) => {
    const catalog = catalogFixture();
    const draft = createDefaultDraft('luca');
    draft.subjectType = subjectType;
    for (const scope of ['main', 'supporting', 'guest', 'minor', 'narrator', 'voice-library', 'all']) {
      const key = `cast:${subjectType}:${scope}`;
      draft.positionKeys = [key];
      const result = validateDraft(draft, 'ranking', catalog);
      expect(result.errors).toEqual({});
      expect(result.query?.positionKeys).toEqual([key]);
      draft.positionKeys = [key, `cast:${subjectType}:${scope === 'all' ? 'supporting' : 'all'}`];
      expect(validateDraft(draft, 'ranking', catalog).errors).toHaveProperty('positionKeys');
    }
  });

  it('uses canonical dirty signatures for semantically equal numeric forms', () => {
    const catalog = catalogFixture();
    const draft = createDefaultDraft('luca');
    draft.positionKeys = ['staff:anime:2'];
    draft.globalScore = { enabled: true, min: '08.0', max: '9.00' };
    const query = validateDraft(draft, 'ranking', catalog).query;
    expect(query).not.toBeNull();

    const restored = draftFromEffective(query!);
    expect(draftSemanticSignature(draft)).toBe(
      draftSemanticSignature(restored),
    );
  });

  it('summarizes every enabled filter without truncating query meaning', () => {
    const catalog = catalogFixture();
    const draft = createDefaultDraft('luca');
    draft.positionKeys = ['staff:anime:2'];
    draft.subjectDate = { enabled: true, min: '2020-01', max: '2024-12' };
    draft.personalScore = { enabled: true, min: '7', max: '' };
    draft.ratingCount = { enabled: true, min: '100', max: '' };
    draft.positiveTags = { enabled: true, values: ['科幻/原创'] };
    const query = validateDraft(draft, 'ranking', catalog).query;

    expect(summarizeQuery(query!, catalog).join(' · ')).toContain(
      '播出时间 2020-01–2024-12',
    );
    expect(summarizeQuery(query!, catalog).join(' · ')).toContain(
      '我的评分 ≥ 7',
    );
    expect(summarizeQuery(query!, catalog).join(' · ')).toContain(
      '评分人数 ≥ 100',
    );
    expect(summarizeQuery(query!, catalog).join(' · ')).toContain(
      '正向标签 原创/科幻',
    );
  });

  it.each(queryGoldens.cases)(
    'matches the accepted Effective Query for $id',
    (testCase) => {
      const result = validateDraft(
        draftForGolden(testCase),
        'ranking',
        catalogForGolden(testCase),
      );

      expect(result.errors).toEqual({});
      expect(result.query).toEqual(testCase.expected.effective);
    },
  );

  it('enforces UID bytes/controls, Unicode 15.1 tags, and anime-only series', () => {
    const catalog = catalogFixture();
    const draft = createDefaultDraft('界'.repeat(86));
    draft.positionKeys = ['staff:anime:2'];
    expect(validateDraft(draft, 'ranking', catalog).errors).toHaveProperty(
      'uid',
    );

    draft.uid = 'Alice\u0000';
    expect(validateDraft(draft, 'ranking', catalog).errors).toHaveProperty(
      'uid',
    );

    draft.uid = 'Alice';
    draft.positiveTags = { enabled: true, values: ['\u{1cc00}'] };
    expect(validateDraft(draft, 'ranking', catalog).errors).toHaveProperty(
      'tags',
    );

    draft.positiveTags.enabled = false;
    draft.subjectType = 'book';
    draft.positionKeys = ['staff:book:1'];
    draft.mergeSeries = true;
    expect(validateDraft(draft, 'ranking', catalog).errors).toHaveProperty(
      'mergeSeries',
    );
  });

  it.each(unicodeGoldens.trimCases)(
    'matches pinned TrimV1 case $id',
    ({ expected, input }) => {
      expect(trimQueryTextV1(input)).toBe(expected);
    },
  );

  it.each(unicodeGoldens.foldCases)(
    'matches pinned Unicode 15.1 fold case $id',
    ({ expected, input }) => {
      expect(normalizeQueryTagV1(input)).toBe(expected);
      expect(normalizeQueryTagV1(expected)).toBe(expected);
    },
  );

  it.each(
    unicodeGoldens.rejectionCases.filter(
      (testCase): testCase is { id: string; input: string } =>
        testCase.input !== undefined,
    ),
  )('rejects pinned Unicode case $id', ({ input }) => {
    expect(normalizeQueryTagV1(input)).toBeNull();
  });

  it.each([
    ['personal-uid-empty-after-trim', 'uid'],
    ['personal-uid-control', 'uid'],
    ['uid-utf8-byte-limit', 'uid'],
    ['global-non-anime-series', 'mergeSeries'],
    ['tag-empty-after-trim', 'tags'],
    ['tag-group-limit', 'tags'],
    ['tag-token-per-group-limit', 'tags'],
    ['tag-total-token-limit', 'tags'],
    ['tag-post-unicode-15-1', 'tags'],
    ['tag-byte-limit', 'tags'],
  ] as const)(
    'rejects Draft-expressible accepted negative %s',
    (id, expectedField) => {
      const golden = queryGoldens.negativeCases.find(
        (testCase) => testCase.id === id,
      )!;
      const draft = createDefaultDraft('Alice');
      draft.positionKeys = ['staff:anime:2'];

      if (id === 'personal-uid-empty-after-trim' || id === 'personal-uid-control') {
        draft.uid = golden.submitted.uid;
      } else if (id === 'uid-utf8-byte-limit') {
        draft.uid = golden.generatedUid.value.repeat(
          golden.generatedUid.repeat,
        );
      } else if (id === 'global-non-anime-series') {
        draft.scope = 'global';
        draft.subjectType = 'book';
        draft.positionKeys = ['staff:book:1'];
        draft.mergeSeries = golden.submitted.mergeSeries;
      } else {
        draft.scope = 'global';
        draft.positiveTags.enabled = true;
        if (id === 'tag-empty-after-trim' || id === 'tag-post-unicode-15-1') {
          draft.positiveTags.values = [
            golden.submitted.filters.tags.include[0].anyOf.join('/'),
          ];
        } else if (id === 'tag-group-limit') {
          draft.positiveTags.values = Array.from(
            { length: golden.generatedTagGroups },
            (_, index) => `tag${index}`,
          );
        } else if (id === 'tag-token-per-group-limit') {
          draft.positiveTags.values = [
            Array.from(
              { length: golden.generatedTagTokens },
              (_, index) => `tag${index}`,
            ).join('/'),
          ];
        } else if (id === 'tag-total-token-limit') {
          draft.positiveTags.values = Array.from(
            { length: golden.generatedTotalTagTokens.groups },
            (_, group) =>
              Array.from(
                {
                  length:
                    golden.generatedTotalTagTokens.tokensPerGroup,
                },
                (_, token) => `g${group}t${token}`,
              ).join('/'),
          );
        } else if (id === 'tag-byte-limit') {
          draft.positiveTags.values = [
            golden.generatedToken.value.repeat(golden.generatedToken.repeat),
          ];
        }
      }

      expect(
        validateDraft(draft, 'ranking', catalogFixture()).errors,
      ).toHaveProperty(expectedField);
    },
  );
});
