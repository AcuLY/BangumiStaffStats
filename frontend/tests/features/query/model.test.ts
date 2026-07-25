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

describe('query model', () => {
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
