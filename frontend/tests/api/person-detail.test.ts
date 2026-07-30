import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import {
  adaptPersonDetailSuccess,
  decodePersonDetailPayload,
  decodePersonDetailSuccess,
} from '../../src/api/adapters/personDetail';
import { createApiClient, type FetchImplementation } from '../../src/api/client';
import { ApiDecodeError } from '../../src/api/errors';
import type {
  ErrorCodeV1,
  PersonDetailErrorEnvelopeV1,
} from '../../src/api/generated/person-detail/types.gen';
import {
  createPersonDetailDriver,
  decodePersonDetailApiError,
  PersonDetailApiError,
} from '../../src/api/personDetail';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);

function golden(filename: 'characters.json' | 'global.json' | 'personal.json') {
  return JSON.parse(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'contracts/goldens/api/person-detail/cases',
        filename,
      ),
      'utf8',
    ),
  ) as {
    cases: Array<{
      expected: { body: unknown };
      request: {
        input: { personId: number };
        query: Record<string, unknown>;
        view?: Record<string, unknown>;
      };
    }>;
  };
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json' },
    status,
  });
}

function errorEnvelope(code: ErrorCodeV1): PersonDetailErrorEnvelopeV1 {
  return {
    error: {
      code,
      fieldErrors: {
        '/input/personId': ['PERSON_NOT_IN_QUERY_RESULT'],
      },
      message: 'backend display text is not trusted',
      retryable: code === 'NOT_READY',
    },
    meta: {
      requestId: 'server-person-detail-error',
    },
  };
}

describe('person-detail response adapter', () => {
  it('strictly adapts global, personal, and character projections without inventing personal fields', () => {
    const global = decodePersonDetailPayload(
      golden('global.json').cases[0]!.expected.body,
    );
    const personal = adaptPersonDetailSuccess(
      decodePersonDetailSuccess(
        golden('personal.json').cases[0]!.expected.body,
      ),
    );
    const characters = decodePersonDetailPayload(
      golden('characters.json').cases[0]!.expected.body,
    );

    expect(global).toMatchObject({
      requestId: 'req-detail-global',
      scope: 'global',
      section: 'works',
    });
    expect(global).not.toHaveProperty('collection');
    expect(global).not.toHaveProperty('preference');
    expect(global.ratings).not.toHaveProperty('personal');
    expect(global.tags).not.toHaveProperty('personal');
    expect(personal).toMatchObject({
      requestId: 'req-detail-personal',
      scope: 'personal',
    });
    expect(personal.preference?.evidenceWeight).toEqual({
      denominator: '6',
      numerator: '1',
    });
    expect(characters).toMatchObject({
      section: 'characters',
      summary: { characterCount: 1 },
    });
    expect(Object.isFrozen(personal)).toBe(true);
    expect(Object.isFrozen(personal.items)).toBe(true);
    expect(Object.isFrozen(personal.ratings.personal?.buckets)).toBe(true);
  });

  it('rejects additional fields and a noncanonical rating bucket sequence', () => {
    const withAdditional = structuredClone(
      golden('global.json').cases[0]!.expected.body,
    ) as Record<string, unknown>;
    withAdditional.unexpected = true;
    expect(() => decodePersonDetailSuccess(withAdditional)).toThrow(
      ApiDecodeError,
    );

    const badBuckets = structuredClone(
      golden('global.json').cases[0]!.expected.body,
    ) as {
      data: { ratings: { global: { buckets: Array<{ score: number }> } } };
    };
    badBuckets.data.ratings.global.buckets[0]!.score = 2;
    expect(() => decodePersonDetailSuccess(badBuckets)).toThrowError(
      expect.objectContaining({
        kind: 'schema-mismatch',
      }),
    );
  });
});

describe('person-detail native-fetch driver', () => {
  it('posts only query, input, and view and keeps local/server request IDs separate', async () => {
    const fixture = golden('personal.json').cases[0]!;
    const fetchImplementation = vi.fn<FetchImplementation>(async () =>
      jsonResponse(fixture.expected.body),
    );
    const driver = createPersonDetailDriver(
      createApiClient(fetchImplementation),
    );
    const controller = new AbortController();

    const response = await driver.execute({
      input: fixture.request.input,
      query: fixture.request.query as never,
      signal: controller.signal,
      transactionId: 'person-detail-local-4',
      view: fixture.request.view ?? {},
    });

    expect(response.transactionId).toBe('person-detail-local-4');
    expect(response.requestId).toBe('req-detail-personal');
    expect(fetchImplementation).toHaveBeenCalledWith(
      '/api/v1/person-detail',
      expect.objectContaining({
        method: 'POST',
        signal: controller.signal,
      }),
    );
    const body = JSON.parse(
      String(fetchImplementation.mock.calls[0]![1]!.body),
    ) as Record<string, unknown>;
    expect(body).toEqual({
      input: fixture.request.input,
      query: fixture.request.query,
      view: fixture.request.view,
    });
    expect(body).not.toHaveProperty('refreshCollection');
  });

  it('accepts only declared status/code pairs and trusted local copy', () => {
    const accepted = decodePersonDetailApiError(
      errorEnvelope('PERSON_NOT_IN_QUERY_RESULT'),
      400,
    );
    expect(accepted).toBeInstanceOf(PersonDetailApiError);
    expect(accepted).toMatchObject({
      code: 'PERSON_NOT_IN_QUERY_RESULT',
      requestId: 'server-person-detail-error',
      status: 400,
    });
    expect(accepted.message).toBe(
      '该人物已不在当前查询结果中，请重新选择',
    );
    expect(accepted.message).not.toContain('backend display text');

    expect(() =>
      decodePersonDetailApiError(errorEnvelope('INTERNAL_ERROR'), 400),
    ).toThrow(ApiDecodeError);
  });

  it('rejects a valid response for another requested person or projection', async () => {
    const fixture = golden('global.json').cases[0]!;
    const driver = createPersonDetailDriver(
      createApiClient(
        vi.fn<FetchImplementation>(async () =>
          jsonResponse(fixture.expected.body),
        ),
      ),
    );

    await expect(
      driver.execute({
        input: { personId: 999 },
        query: fixture.request.query as never,
        signal: new AbortController().signal,
        transactionId: 'person-detail-mismatch',
        view: fixture.request.view ?? {},
      }),
    ).rejects.toMatchObject({
      kind: 'schema-mismatch',
      name: 'ApiDecodeError',
    });
  });
});
