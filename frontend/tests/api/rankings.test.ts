import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import {
  adaptRankingsSuccess,
  decodeRankingPayload,
  decodeRankingsError,
  decodeRankingsSuccess,
} from '../../src/api/adapters/rankings';
import { createApiClient, type FetchImplementation } from '../../src/api/client';
import { ApiDecodeError } from '../../src/api/errors';
import type {
  ErrorCodeV1,
  ResultErrorEnvelopeV1,
} from '../../src/api/generated/rankings/types.gen';
import {
  createRankingsDriver,
  decodeRankingsApiError,
  RankingsApiError,
} from '../../src/api/rankings';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);

function golden(filename: 'global.json' | 'personal.json') {
  return JSON.parse(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'contracts/goldens/api/rankings/cases',
        filename,
      ),
      'utf8',
    ),
  ) as {
    cases: Array<{
      expected: { body: unknown };
      request: {
        query: Record<string, unknown>;
        view: Record<string, unknown>;
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
      requestId: 'server-error-request',
    },
  };
}

describe('rankings response adapter', () => {
  it('strictly adapts personal and global generated unions', () => {
    const personalEnvelope = decodeRankingsSuccess(
      golden('personal.json').cases[0]!.expected.body,
    );
    const personal = adaptRankingsSuccess(personalEnvelope);
    const global = decodeRankingPayload(
      golden('global.json').cases[0]!.expected.body,
    );

    expect(personal).toMatchObject({
      requestId: 'req-rankings-personal-search',
      scope: 'personal',
      summary: {
        personCount: 8,
        workCount: 21,
      },
    });
    expect(personal.items.map((item) => item.rank)).toEqual([2, 8]);
    expect(personal.collection?.warningCodes).toEqual([]);
    expect(global.scope).toBe('global');
    expect(global.items[0]).not.toHaveProperty('preference');
    expect(global).not.toHaveProperty('collection');
    expect(Object.isFrozen(personal.items)).toBe(true);
    expect(Object.isFrozen(personal.items[0]!.person)).toBe(true);
  });

  it('rejects additional members and malformed success or error shapes', () => {
    const success = structuredClone(
      golden('global.json').cases[0]!.expected.body,
    ) as Record<string, unknown>;
    success.unexpected = true;

    expect(() => decodeRankingsSuccess(success)).toThrow(ApiDecodeError);
    expect(() =>
      decodeRankingsError({
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

describe('rankings native-fetch driver', () => {
  it('keeps the local transaction ID distinct from the server request ID', async () => {
    const fixture = golden('personal.json').cases[0]!;
    const fetchImplementation = vi.fn<FetchImplementation>(async () =>
      jsonResponse(fixture.expected.body),
    );
    const driver = createRankingsDriver(
      createApiClient(fetchImplementation),
    );
    const controller = new AbortController();

    const response = await driver.execute({
      query: fixture.request.query as never,
      refreshCollection: false,
      signal: controller.signal,
      transactionId: 'rankings-local-7',
      view: fixture.request.view,
    });

    expect(response.transactionId).toBe('rankings-local-7');
    expect(response.requestId).toBe('req-rankings-personal-search');
    expect(response.requestId).not.toBe(response.transactionId);
    expect(fetchImplementation).toHaveBeenCalledWith(
      '/api/v1/rankings',
      expect.objectContaining({
        method: 'POST',
        signal: controller.signal,
      }),
    );
    const body = JSON.parse(
      String(fetchImplementation.mock.calls[0]![1]!.body),
    ) as Record<string, unknown>;
    expect(body).toEqual({
      query: fixture.request.query,
      refreshCollection: false,
      view: fixture.request.view,
    });
  });

  it('accepts only status/code pairs declared by the rankings operation', () => {
    const accepted = decodeRankingsApiError(errorEnvelope('NOT_READY'), 503);
    expect(accepted).toBeInstanceOf(RankingsApiError);
    expect(accepted).toMatchObject({
      code: 'NOT_READY',
      requestId: 'server-error-request',
      status: 503,
    });
    expect(accepted.message).not.toContain('backend display text');
    expect(Object.isFrozen(accepted.fieldErrors)).toBe(true);
    expect(Object.isFrozen(accepted.fieldErrors['/view/sort'])).toBe(true);

    expect(() =>
      decodeRankingsApiError(errorEnvelope('INTERNAL_ERROR'), 400),
    ).toThrow(ApiDecodeError);
    expect(() =>
      decodeRankingsApiError(errorEnvelope('UPSTREAM_UNAVAILABLE'), 502),
    ).toThrow(ApiDecodeError);
    expect(() =>
      decodeRankingsApiError(errorEnvelope('PERSON_NOT_IN_QUERY_RESULT'), 400),
    ).toThrow(ApiDecodeError);
  });

  it('propagates a strictly decoded stable API failure through the client', async () => {
    const driver = createRankingsDriver(
      createApiClient(
        vi.fn<FetchImplementation>(async () =>
          jsonResponse(errorEnvelope('NOT_READY'), 503),
        ),
      ),
    );

    await expect(
      driver.execute({
        query: {
          scope: 'global',
          subjectType: 'anime',
          positionKeys: ['staff:anime:2'],
        },
        refreshCollection: false,
        signal: new AbortController().signal,
        transactionId: 'rankings-local-error',
        view: {
          order: 'desc',
          page: 1,
          pageSize: 10,
          search: '',
          sort: 'count',
        },
      }),
    ).rejects.toMatchObject({
      code: 'NOT_READY',
      message: '排行服务正在准备，请稍后重试',
      requestId: 'server-error-request',
    });
  });

  it('rejects a valid envelope that does not match the requested projection', async () => {
    const fixture = golden('global.json').cases[0]!;
    const driver = createRankingsDriver(
      createApiClient(
        vi.fn<FetchImplementation>(async () =>
          jsonResponse(fixture.expected.body),
        ),
      ),
    );

    await expect(
      driver.execute({
        query: fixture.request.query as never,
        refreshCollection: false,
        signal: new AbortController().signal,
        transactionId: 'rankings-projection-mismatch',
        view: {
          ...fixture.request.view,
          sort: 'count',
        },
      }),
    ).rejects.toMatchObject({
      kind: 'schema-mismatch',
      name: 'ApiDecodeError',
    });
  });
});
