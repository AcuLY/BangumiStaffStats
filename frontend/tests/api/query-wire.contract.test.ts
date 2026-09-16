import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  decodeCandidatesInput,
  decodeCandidatesView,
  decodeCatalogContext,
  decodeCoStarInput,
  decodeCoStarView,
  decodeEffectiveQuery,
  decodeEffectiveQueryForOperation,
  decodeErrorEnvelope,
  decodePartnersInput,
  decodePartnersView,
  decodePersonDetailInput,
  decodePersonDetailView,
  decodeQueryDigestProjection,
  decodeRankingsView,
  decodeSharedQuery,
  decodeSharedQueryForOperation,
  parseWireJson,
  parseWireUtf8,
} from '../../src/api/adapters/queryWire';
import { ApiDecodeError } from '../../src/api/errors';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const casesRoot = path.join(repositoryRoot, 'contracts/goldens/query/cases');

interface QueryCase {
  catalog: unknown;
  expected: {
    effective: unknown;
    projection: unknown;
  };
  id: string;
  submitted: unknown;
}

interface ErrorCase {
  envelope: unknown;
  id: string;
}

interface ViewCase {
  expectedView: unknown;
  id: string;
  operation: OperationName;
  submittedInput?: unknown;
  submittedView: unknown;
}

type OperationName =
  | 'candidates'
  | 'coStar'
  | 'partners'
  | 'personDetail'
  | 'rankings';

type JsonRecord = Record<string, unknown>;

function readCaseFile<T>(name: string): T {
  return JSON.parse(
    fs.readFileSync(path.join(casesRoot, name), 'utf8'),
  ) as T;
}

function expectDecodeFailure(run: () => unknown): void {
  expect(run).toThrow(ApiDecodeError);
  try {
    run();
  } catch (error) {
    expect(error).toMatchObject({
      kind: 'schema-mismatch',
      name: 'ApiDecodeError',
    });
  }
}

const queries = readCaseFile<{
  cases: QueryCase[];
  negativeCases: Array<{ id: string; submitted: unknown }>;
}>('queries.json');
const errors = readCaseFile<{
  cases: ErrorCase[];
  negativeCases: ErrorCase[];
}>('errors.json');
const views = readCaseFile<{
  cases: ViewCase[];
  negativeCases: Array<
    ViewCase & {
      generatedParticipants?: {
        count: number;
        positionKeysPerPerson: string[];
      };
    }
  >;
}>('views.json');
const unknownFields = readCaseFile<{
  cases: Array<{
    baseCase: string;
    id: string;
    pointer: string;
    target: 'catalog' | 'error' | 'query';
  }>;
  injectedProperty: string;
  injectedValue: unknown;
}>('unknown-fields.json');
const textualInvalid = readCaseFile<{
  cases: Array<{ id: string; text: string }>;
}>('textual-invalid.json');

const viewDecoders: Record<OperationName, (value: unknown) => unknown> = {
  candidates: decodeCandidatesView,
  coStar: decodeCoStarView,
  partners: decodePartnersView,
  personDetail: decodePersonDetailView,
  rankings: decodeRankingsView,
};
const inputDecoders: Partial<
  Record<OperationName, (value: unknown) => unknown>
> = {
  candidates: decodeCandidatesInput,
  coStar: decodeCoStarInput,
  partners: decodePartnersInput,
  personDetail: decodePersonDetailInput,
};

function findCase<T extends { id: string }>(
  cases: T[],
  id: string,
): T {
  const found = cases.find((item) => item.id === id);
  if (!found) {
    throw new Error(`Missing shared golden case ${id}`);
  }
  return found;
}

function cloneRecord(value: unknown): JsonRecord {
  const clone = structuredClone(value);
  if (!clone || typeof clone !== 'object' || Array.isArray(clone)) {
    throw new Error('Expected a golden object');
  }
  return clone as JsonRecord;
}

function injectUnknown(
  value: unknown,
  pointer: string,
  property: string,
  injectedValue: unknown,
): unknown {
  const root = cloneRecord(value);
  let target: unknown = root;
  if (pointer !== '') {
    for (const rawPart of pointer.slice(1).split('/')) {
      const part = rawPart.replaceAll('~1', '/').replaceAll('~0', '~');
      if (!target || typeof target !== 'object') {
        throw new Error(`Invalid golden pointer ${pointer}`);
      }
      target = (target as JsonRecord)[part];
    }
  }
  if (!target || typeof target !== 'object' || Array.isArray(target)) {
    throw new Error(`Golden pointer is not an object: ${pointer}`);
  }
  (target as JsonRecord)[property] = injectedValue;
  return root;
}

function unknownBase(
  target: 'catalog' | 'error' | 'query',
  id: string,
): unknown {
  switch (target) {
    case 'query': {
      return findCase(queries.cases, id).submitted;
    }
    case 'catalog': {
      return findCase(queries.cases, id).catalog;
    }
    case 'error': {
      return findCase(errors.cases, id).envelope;
    }
  }
}

function unknownDecoder(
  target: 'catalog' | 'error' | 'query',
): (value: unknown) => unknown {
  switch (target) {
    case 'query':
      return decodeSharedQuery;
    case 'catalog':
      return decodeCatalogContext;
    case 'error':
      return decodeErrorEnvelope;
  }
}

describe('query-wide unrestricted wire compatibility', () => {
  it.each(['book', 'anime', 'music', 'game', 'real'])('accepts explicit all and wish for %s without operation-scope rewriting', (subjectType) => {
    for (const scope of ['global', 'personal']) {
      const query = {
        scope, subjectType, positionScope: 'all', positionKeys: [], includeNSFW: false, mergeSeries: false,
        ...(scope === 'personal' ? { uid: 'luca', collectionStatuses: ['wish', 'completed', 'in_progress', 'on_hold', 'dropped'] } : {}),
      };
      expect(decodeSharedQuery(query)).toBe(query);
      expect(decodeEffectiveQuery(query)).toBe(query);
      for (const operationScope of ['query', 'all'] as const) {
        expect(decodeSharedQueryForOperation(query, operationScope)).toBe(query);
        expect(decodeEffectiveQueryForOperation(query, operationScope)).toBe(query);
      }
    }
  });

  it.each([null, 'query', 'unknown', 'all'])('rejects invalid query scope %s independently of operation all', (positionScope) => {
    for (const scope of ['global', 'personal']) {
      for (const positionKeys of [[], ['staff:anime:2']]) {
        if (positionScope === 'all' && positionKeys.length === 0) continue;
        const query = {
          scope, subjectType: 'anime', positionScope, positionKeys, includeNSFW: false, mergeSeries: false,
          ...(scope === 'personal' ? { uid: 'luca', collectionStatuses: ['wish'] } : {}),
        };
        for (const decode of [decodeSharedQueryForOperation, decodeEffectiveQueryForOperation]) {
          for (const operationScope of ['query', 'all'] as const) {
            expectDecodeFailure(() => decode(query, operationScope));
          }
        }
        expectDecodeFailure(() => decodeSharedQuery(query));
        expectDecodeFailure(() => decodeEffectiveQuery(query));
      }
    }
  });
});

describe('shared query wire positive cases', () => {
  it('admits empty positions only through explicit all operation decoding', () => {
    const submitted = {
      scope: 'global', subjectType: 'anime', positionKeys: [],
      includeNSFW: false, mergeSeries: false,
    };
    expect(decodeSharedQueryForOperation(submitted, 'all')).toEqual(submitted);
    expect(decodeEffectiveQueryForOperation(submitted, 'all')).toEqual(submitted);
    for (const decode of [decodeSharedQueryForOperation, decodeEffectiveQueryForOperation]) {
      expectDecodeFailure(() => decode(submitted));
      expectDecodeFailure(() => decode(submitted, 'query'));
      expectDecodeFailure(() => decode({ ...submitted, hiddenPosition: true }, 'all'));
      expectDecodeFailure(() => decode({ ...submitted, subjectType: 'unsupported' }, 'all'));
    }
    expectDecodeFailure(() => decodeSharedQuery(submitted));
    expectDecodeFailure(() => decodeEffectiveQuery(submitted));
  });

  it.each(queries.cases)('$id validates query, catalog, and effective output', (entry) => {
    expect(decodeSharedQuery(entry.submitted)).toBe(entry.submitted);
    expect(decodeCatalogContext(entry.catalog)).toBe(entry.catalog);
    expect(decodeEffectiveQuery(entry.expected.effective)).toBe(
      entry.expected.effective,
    );
    expect(decodeQueryDigestProjection(entry.expected.projection)).toBe(
      entry.expected.projection,
    );
  });

  it.each(errors.cases)('$id validates the shared error envelope', (entry) => {
    expect(decodeErrorEnvelope(entry.envelope)).toBe(entry.envelope);
  });

  it.each(views.cases)('$id validates submitted operation input and views', (entry) => {
    if (entry.submittedInput !== undefined) {
      expect(inputDecoders[entry.operation]?.(entry.submittedInput)).toBe(
        entry.submittedInput,
      );
    }
    expect(viewDecoders[entry.operation](entry.submittedView)).toBe(
      entry.submittedView,
    );
    expect(viewDecoders[entry.operation](entry.expectedView)).toBe(
      entry.expectedView,
    );
  });
});

describe('shared query wire structural negatives', () => {
  it.each(unknownFields.cases)('$id rejects an unknown object field', (entry) => {
    const value = injectUnknown(
      unknownBase(entry.target, entry.baseCase),
      entry.pointer,
      unknownFields.injectedProperty,
      unknownFields.injectedValue,
    );
    expectDecodeFailure(() => unknownDecoder(entry.target)(value));
  });

  it.each(errors.negativeCases)('$id rejects an invalid error envelope', (entry) => {
    expectDecodeFailure(() => decodeErrorEnvelope(entry.envelope));
  });

  const structuralViewIds = new Set([
    'view-page-zero',
    'view-page-fractional',
    'view-page-unsafe',
    'view-page-size-invalid',
    'detail-person-id-zero',
    'detail-person-id-unsafe',
    'partners-duplicate-position-key',
    'co-star-participant-limit',
  ]);
  const structuralViews = views.negativeCases.filter((entry) =>
    structuralViewIds.has(entry.id),
  );

  it.each(structuralViews)('$id rejects unsafe operation structure', (entry) => {
    let input = entry.submittedInput;
    if (entry.generatedParticipants) {
      input = {
        participants: Array.from(
          { length: entry.generatedParticipants.count },
          (_, index) => ({
            personId: index + 1,
            positionKeys: entry.generatedParticipants?.positionKeysPerPerson,
          }),
        ),
      };
    }
    if (input !== undefined) {
      expectDecodeFailure(() => inputDecoders[entry.operation]?.(input));
    } else {
      expectDecodeFailure(() =>
        viewDecoders[entry.operation](entry.submittedView),
      );
    }
  });

  it.each(textualInvalid.cases.slice(0, 3))(
    '$id rejects malformed or trailing JSON text',
    (entry) => {
      expect(() => parseWireJson(entry.text)).toThrowError(
        expect.objectContaining({ kind: 'invalid-json' }),
      );
    },
  );

  it('rejects unsafe integer structure after JSON parsing', () => {
    const entry = findCase(textualInvalid.cases, 'unsafe-json-integer');
    const parsed = parseWireJson(entry.text);
    expectDecodeFailure(() => decodeSharedQuery(parsed));
  });

  it('rejects malformed UTF-8 before JSON validation', () => {
    expect(() => parseWireUtf8(Uint8Array.of(0xff))).toThrowError(
      expect.objectContaining({ kind: 'invalid-utf8' }),
    );
  });

});


it('preserves independent position scopes for all four operations and rejects unsupported scopes', () => {
  const entries = [
    { decode: decodeCandidatesInput, input: { positionKey: null } },
    { decode: decodePartnersInput, input: { source: { personId: 1, positionKeys: ['staff:anime:2'] } } },
    { decode: decodeCoStarInput, input: { participants: [
      { personId: 1, positionKeys: ['staff:anime:2'] },
      { personId: 2, positionKeys: ['staff:anime:3'] },
    ] } },
    { decode: decodePersonDetailInput, input: { personId: 2, positionKeys: ['staff:anime:3'] } },
  ];
  for (const { decode, input } of entries) {
    for (const positionScope of ['query', 'all']) {
      expect(decode({ ...input, positionScope })).toEqual({ ...input, positionScope });
    }
    expect(() => decode({ ...input, positionScope: 'other' })).toThrow(ApiDecodeError);
  }
});
