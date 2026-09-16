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
        input: { positionKey: string | null };
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
    expect(Object.isFrozen(global.items[0]!.positionKeys)).toBe(true);

    const all = decodeCandidatePayload(
      golden('global.json').cases[0]!.expected.body,
    );
    expect(all.positionKey).toBeNull();
    expect(all.items[1]!.positionKeys).toEqual([
      'staff:anime:2',
      'cast:anime:all',
    ]);
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
  it('sends empty query positions only with explicit all scope', async () => {
    const fixture = golden('global.json').cases[0]!;
    const fetchImplementation = vi.fn<FetchImplementation>(async () => jsonResponse(fixture.expected.body));
    const driver = createCandidatesDriver(createApiClient(fetchImplementation));
    const request = {
      ...fixture.request,
      input: { ...fixture.request.input, positionScope: 'all' },
      query: { ...fixture.request.query, positionKeys: [] },
      signal: new AbortController().signal, transactionId: 'all-candidates',
      view: fixture.request.view ?? {},
    };
    await driver.execute(request as never);
    expect(fetchImplementation).toHaveBeenCalledOnce();
    expect(JSON.parse(String(fetchImplementation.mock.calls[0]![1]?.body))).toMatchObject({
      query: { positionKeys: [] }, input: { positionScope: 'all' },
    });
    for (const positionScope of ['query', undefined]) {
      await expect(driver.execute({ ...request,
        input: { ...request.input, positionScope },
      } as never)).rejects.toBeInstanceOf(ApiDecodeError);
    }
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it('uses same-origin fetch and correlates projection metadata', async () => {
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
    expect(
      decodeCandidatesApiError(errorEnvelope('UPSTREAM_TIMEOUT'), 504).message,
    ).toBe('候选人物查询超时，请重试');
    expect(
      decodeCandidatesApiError(errorEnvelope('UPSTREAM_UNAVAILABLE'), 503)
        .message,
    ).toBe('收藏数据暂时不可用，请稍后重试');

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


it('accepts all-position response ordering independently of the original query and still enforces query scope', async () => {
  const fixture = golden('global.json').cases[0]!;
  const fetchImplementation = vi.fn<FetchImplementation>(async () => jsonResponse(fixture.expected.body));
  const driver = createCandidatesDriver(createApiClient(fetchImplementation));
  const query = { ...fixture.request.query, positionKeys: ['staff:anime:2'] };
  const request = { query: query as never, input: { positionKey: null, positionScope: 'all' as const },
    signal: new AbortController().signal, transactionId: 'broad-candidates', view: fixture.request.view ?? {} };
  await expect(driver.execute(request)).resolves.toBeDefined();
  expect(JSON.parse(String(fetchImplementation.mock.calls[0]![1]!.body))).toMatchObject({ input: { positionScope: 'all' }, query });
  await expect(driver.execute({ ...request, input: { positionKey: null } })).rejects.toBeInstanceOf(ApiDecodeError);
});

describe('query-wide all candidates projection', () => {
  // Cloned golden envelopes exercise the production fetch client/driver, not a live service.
  function fixture(scope: 'personal' | 'global') {
    const original = golden(`${scope}.json`).cases[0]!;
    const envelope = structuredClone(original.expected.body) as {
      data: {
        positionKey: string | null;
        workUnit: string;
        summary: { positionCounts: { positionKey: string; count: number }[] };
        items: { person: { id: number }; positionKeys: string[] }[];
      };
      meta: { pagination: { page: number; pageSize: number; total: number }; collection?: unknown };
    };
    const keys = ['staff:anime:999991', 'cast:anime:all'];
    envelope.data.positionKey = null;
    envelope.data.summary.positionCounts = keys.map((positionKey) => ({
      positionKey, count: envelope.data.items.length,
    }));
    envelope.data.items.forEach((item) => { item.positionKeys = [...keys]; });
    return {
      envelope,
      request: {
        input: { positionKey: null },
        query: { ...original.request.query, positionScope: 'all', positionKeys: [] },
        view: original.request.view ?? {},
        signal: new AbortController().signal,
        transactionId: 'query-all-projection',
      },
    };
  }

  it.each(['personal', 'global'] as const)('uses response identities and preserves all three input scopes for %s', async (scope) => {
    for (const positionScope of [undefined, 'query', 'all'] as const) {
      const { envelope, request } = fixture(scope);
      const input = { ...request.input, ...(positionScope === undefined ? {} : { positionScope }) };
      const fetchImplementation = vi.fn<FetchImplementation>(async () => jsonResponse(envelope));
      const driver = createCandidatesDriver(createApiClient(fetchImplementation));
      const response = await driver.execute({ ...request, input } as never);
      expect(response.payload.items[0]!.positionKeys).toEqual(['staff:anime:999991', 'cast:anime:all']);
      expect(response.payload.scope).toBe(scope);
      expect(JSON.parse(String(fetchImplementation.mock.calls[0]![1]?.body))).toEqual({
        input, query: request.query, view: request.view,
      });
      expect(request.query.positionKeys).toEqual([]);
    }
  });

  it('accepts an exact single-position projection without changing the shared query', async () => {
    const { envelope, request } = fixture('global');
    envelope.data.positionKey = 'staff:anime:999991';
    envelope.data.items.forEach((item) => { item.positionKeys = ['staff:anime:999991']; });
    const fetchImplementation = vi.fn<FetchImplementation>(async () => jsonResponse(envelope));
    await expect(createCandidatesDriver(createApiClient(fetchImplementation)).execute({
      ...request, input: { positionKey: 'staff:anime:999991', positionScope: 'query' },
    } as never)).resolves.toBeDefined();
    expect(JSON.parse(String(fetchImplementation.mock.calls[0]![1]?.body)).query.positionKeys).toEqual([]);
  });

  it.each(['row-order', 'counts-order', 'membership', 'duplicate-count', 'duplicate-row-key',
    'single-position', 'position-echo', 'page', 'page-size', 'scope', 'work-unit'] as const)(
    'retains the typed rejection for corrupt %s', async (corruption) => {
      const { envelope, request } = fixture('global');
      if (corruption === 'row-order') envelope.data.items[0]!.positionKeys.reverse();
      if (corruption === 'counts-order') envelope.data.summary.positionCounts.reverse();
      if (corruption === 'membership') envelope.data.items[0]!.positionKeys = ['staff:anime:999992'];
      if (corruption === 'duplicate-count') envelope.data.summary.positionCounts.push({ ...envelope.data.summary.positionCounts[0]! });
      if (corruption === 'duplicate-row-key') envelope.data.items[0]!.positionKeys.push(envelope.data.items[0]!.positionKeys[0]!);
      if (corruption === 'single-position' || corruption === 'position-echo') envelope.data.positionKey = 'staff:anime:999991';
      if (corruption === 'page') envelope.meta.pagination.page = 2;
      if (corruption === 'page-size') envelope.meta.pagination.pageSize = 5;
      if (corruption === 'scope') envelope.meta.collection = {
        fetchedAt: '2026-07-25T08:00:00Z', stale: false, warningCodes: [],
      };
      if (corruption === 'work-unit') envelope.data.workUnit = 'series';
      const driver = createCandidatesDriver(createApiClient(async () => jsonResponse(envelope)));
      await expect(driver.execute({
        ...request,
        ...(corruption === 'single-position' ? { input: { positionKey: envelope.data.positionKey } } : {}),
      } as never)).rejects.toBeInstanceOf(ApiDecodeError);
    },
  );
});
