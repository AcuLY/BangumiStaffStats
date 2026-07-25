import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import {
  adaptCandidatesSuccess,
  decodeCandidatePayload,
  decodeCandidatesError,
  decodeCandidatesSuccess,
} from '../../src/api/adapters/candidates';
import {
  CandidatesApiError,
  createCandidatesDriver,
  decodeCandidatesApiError,
} from '../../src/api/candidates';
import { createApiClient, type FetchImplementation } from '../../src/api/client';
import { ApiDecodeError } from '../../src/api/errors';
import type {
  ErrorCodeV1,
  ResultErrorEnvelopeV1,
} from '../../src/api/generated/candidates/types.gen';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);

function golden(filename: 'global.json' | 'personal.json') {
  return JSON.parse(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'contracts/goldens/api/candidates/cases',
        filename,
      ),
      'utf8',
    ),
  ) as {
    cases: Array<{
      expected: { body: unknown };
      request: {
        input: { positionKey: string };
        query: Record<string, unknown>;
        refreshCollection?: boolean;
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

function errorEnvelope(code: ErrorCodeV1): ResultErrorEnvelopeV1 {
  return {
    error: {
      code,
      fieldErrors: {
        '/view/sort': ['UNSUPPORTED_VALUE'],
      },
      message: 'backend display text is not trusted',
      retryable: code === 'NOT_READY',
    },
    meta: {
      requestId: 'server-candidate-error',
    },
  };
}

describe('candidates response adapter', () => {
  it('strictly adapts personal and global generated unions without deriving ranks', () => {
    const personalEnvelope = decodeCandidatesSuccess(
      golden('personal.json').cases[0]!.expected.body,
    );
    const personal = adaptCandidatesSuccess(personalEnvelope);
    const global = decodeCandidatePayload(
      golden('global.json').cases[1]!.expected.body,
    );

    expect(personal).toMatchObject({
      positionKey: 'staff:anime:2',
      requestId: 'req-candidates-personal-average',
      scope: 'personal',
    });
    expect(personal.collection?.warningCodes).toEqual([]);
    expect(global.scope).toBe('global');
    expect(global.items.map((item) => item.rank)).toEqual([2, 8]);
    expect(global.positionCounts).toEqual([
      { count: 8, positionKey: 'staff:anime:2' },
    ]);
    expect(global).not.toHaveProperty('collection');
    expect(Object.isFrozen(global.items)).toBe(true);
    expect(Object.isFrozen(global.items[0]!.person)).toBe(true);
  });

  it('rejects extra members, global collection metadata, and malformed errors', () => {
    const success = structuredClone(
      golden('global.json').cases[0]!.expected.body,
    ) as {
      meta: Record<string, unknown>;
      unexpected?: boolean;
    };
    success.unexpected = true;
    expect(() => decodeCandidatesSuccess(success)).toThrow(ApiDecodeError);

    const globalWithCollection = structuredClone(
      golden('global.json').cases[0]!.expected.body,
    ) as {
      meta: Record<string, unknown>;
    };
    globalWithCollection.meta.collection = {
      fetchedAt: '2026-07-25T00:00:00Z',
      stale: false,
      warningCodes: [],
    };
    expect(() =>
      decodeCandidatePayload(globalWithCollection, 'global'),
    ).toThrow(
      ApiDecodeError,
    );

    expect(() =>
      decodeCandidatesError({
        error: {
          code: 'NOT_READY',
          fieldErrors: {},
          message: 'not ready',
          retryable: true,
        },
        meta: {},
      }),
    ).toThrow(ApiDecodeError);
  });
});

describe('candidates native-fetch driver', () => {
  it('uses same-origin fetch, omits a false/global refresh, and correlates projection metadata', async () => {
    const fixture = golden('global.json').cases[1]!;
    const fetchImplementation = vi.fn<FetchImplementation>(async () =>
      jsonResponse(fixture.expected.body),
    );
    const driver = createCandidatesDriver(
      createApiClient(fetchImplementation),
    );
    const controller = new AbortController();

    const response = await driver.execute({
      input: fixture.request.input,
      query: fixture.request.query as never,
      refreshCollection: true,
      signal: controller.signal,
      transactionId: 'candidates-local-4',
      view: fixture.request.view ?? {},
    });

    expect(response.transactionId).toBe('candidates-local-4');
    expect(response.requestId).toBe('req-candidates-rank-gap');
    expect(response.requestId).not.toBe(response.transactionId);
    expect(fetchImplementation).toHaveBeenCalledWith(
      '/api/v1/candidates',
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

  it('sends refresh only for personal primary requests', async () => {
    const fixture = golden('personal.json').cases[2]!;
    const fetchImplementation = vi.fn<FetchImplementation>(async () =>
      jsonResponse(fixture.expected.body),
    );
    const driver = createCandidatesDriver(
      createApiClient(fetchImplementation),
    );

    await driver.execute({
      input: fixture.request.input,
      query: fixture.request.query as never,
      refreshCollection: true,
      signal: new AbortController().signal,
      transactionId: 'candidates-personal-refresh',
      view: fixture.request.view ?? {},
    });

    const body = JSON.parse(
      String(fetchImplementation.mock.calls[0]![1]!.body),
    ) as Record<string, unknown>;
    expect(body.refreshCollection).toBe(true);
  });

  it('accepts only status/code pairs declared by candidates', () => {
    const accepted = decodeCandidatesApiError(
      errorEnvelope('NOT_READY'),
      503,
    );
    expect(accepted).toBeInstanceOf(CandidatesApiError);
    expect(accepted).toMatchObject({
      code: 'NOT_READY',
      requestId: 'server-candidate-error',
      status: 503,
    });
    expect(accepted.message).not.toContain('backend display text');
    expect(Object.isFrozen(accepted.fieldErrors)).toBe(true);

    expect(() =>
      decodeCandidatesApiError(errorEnvelope('INTERNAL_ERROR'), 400),
    ).toThrow(ApiDecodeError);
    expect(() =>
      decodeCandidatesApiError(
        errorEnvelope('PERSON_NOT_IN_QUERY_RESULT'),
        400,
      ),
    ).toThrow(ApiDecodeError);
  });

  it('rejects a valid envelope for the wrong input, scope, page, or count order', async () => {
    const fixture = golden('global.json').cases[0]!;
    const driver = createCandidatesDriver(
      createApiClient(
        vi.fn<FetchImplementation>(async () =>
          jsonResponse(fixture.expected.body),
        ),
      ),
    );

    await expect(
      driver.execute({
        input: { positionKey: 'staff:anime:2' },
        query: fixture.request.query as never,
        refreshCollection: false,
        signal: new AbortController().signal,
        transactionId: 'candidates-projection-mismatch',
        view: {},
      }),
    ).rejects.toMatchObject({
      kind: 'schema-mismatch',
      name: 'ApiDecodeError',
    });
  });
});
