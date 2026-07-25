import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import {
  adaptPartnersSuccess,
  decodePartnersError,
  decodePartnersPayload,
  decodePartnersSuccess,
} from '../../src/api/adapters/partners';
import {
  createPartnersDriver,
  decodeRetryAfterSeconds,
  decodePartnersApiError,
  PartnersApiError,
} from '../../src/api/partners';
import {
  createApiClient,
  type FetchImplementation,
} from '../../src/api/client';
import { ApiDecodeError } from '../../src/api/errors';
import type {
  ErrorCodeV1,
  PartnersResultErrorEnvelopeV1,
} from '../../src/api/generated/partners/types.gen';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);

function golden(filename: 'global.json' | 'personal.json') {
  return JSON.parse(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'contracts/goldens/api/partners/cases',
        filename,
      ),
      'utf8',
    ),
  ) as {
    cases: Array<{
      expected: { body: unknown };
      request: {
        input: {
          candidatePositionKey?: string;
          source: { personId: number; positionKeys: string[] };
        };
        query: Record<string, unknown>;
        view?: Record<string, unknown>;
      };
    }>;
  };
}

function jsonResponse(
  value: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json', ...headers },
    status,
  });
}

function errorEnvelope(
  code: ErrorCodeV1,
  retryable = false,
): PartnersResultErrorEnvelopeV1 {
  return {
    error: {
      code,
      fieldErrors: {
        '/input/source/personId': ['PERSON_NOT_IN_QUERY_RESULT'],
      },
      message: 'backend display text is not trusted',
      retryable,
    },
    meta: {
      requestId: 'server-partners-error',
    },
  };
}

describe('partners response adapter', () => {
  it('preserves fixed leaders, server ranks, nullable evidence, and scope omission', () => {
    const globalEnvelope = decodePartnersSuccess(
      golden('global.json').cases[0]!.expected.body,
    );
    const global = adaptPartnersSuccess(globalEnvelope);
    const personal = decodePartnersPayload(
      golden('personal.json').cases[1]!.expected.body,
      'personal',
    );

    expect(global).toMatchObject({
      requestId: 'req-partners-global',
      scope: 'global',
      workUnit: 'series',
    });
    expect(global).not.toHaveProperty('collection');
    expect(global.summary.leaders.map((leader) => leader.metric)).toEqual([
      'count',
      'average',
      'overall',
    ]);
    expect(global.items.map((item) => item.rank)).toEqual([1, 2]);
    expect(global.items[0]!.positionKeys).toEqual([
      'staff:anime:2',
      'cast:anime:main',
    ]);
    expect(personal.summary.leaders.map((leader) => leader.metric)).toEqual([
      'count',
      'average',
      'overall',
      'preference',
    ]);
    expect(personal.items[0]!.preference).toMatchObject({
      comparableCount: 0,
      comparableSeriesCount: 0,
      effectiveEvidence: 0,
      evidenceWeight: { denominator: '1', numerator: '0' },
      mean: null,
      score: null,
    });
    expect(Object.isFrozen(personal.items)).toBe(true);
    expect(Object.isFrozen(personal.items[0]!.metrics)).toBe(true);
    expect(Object.isFrozen(personal.summary.leaders)).toBe(true);
  });

  it('rejects extra members, wrong scope structures, and malformed errors', () => {
    const success = structuredClone(
      golden('global.json').cases[0]!.expected.body,
    ) as Record<string, unknown>;
    success.unexpected = true;
    expect(() => decodePartnersSuccess(success)).toThrow(ApiDecodeError);

    expect(() =>
      decodePartnersPayload(
        golden('personal.json').cases[0]!.expected.body,
        'global',
      ),
    ).toThrow(ApiDecodeError);

    expect(() =>
      decodePartnersError({
        error: {
          code: 'SERVER_BUSY',
          fieldErrors: {},
          message: 'busy',
          retryable: true,
        },
        meta: {},
      }),
    ).toThrow(ApiDecodeError);
  });
});

describe('partners native-fetch driver', () => {
  it('uses the same-origin client, never sends refreshCollection, and correlates the projection', async () => {
    const fixture = golden('personal.json').cases[0]!;
    const fetchImplementation = vi.fn<FetchImplementation>(async () =>
      jsonResponse(fixture.expected.body),
    );
    const driver = createPartnersDriver(
      createApiClient(fetchImplementation),
    );
    const controller = new AbortController();

    const response = await driver.execute({
      input: fixture.request.input,
      query: fixture.request.query as never,
      refreshCollection: false,
      signal: controller.signal,
      transactionId: 'partners-local-1',
      view: fixture.request.view ?? {},
    });

    expect(response).toMatchObject({
      requestId: 'req-partners-personal',
      staleCollection: false,
      transactionId: 'partners-local-1',
    });
    expect(fetchImplementation).toHaveBeenCalledWith(
      '/api/v1/partners',
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

  it('maps only operation-declared status/code pairs to local recovery copy', () => {
    const busy = decodePartnersApiError(
      errorEnvelope('SERVER_BUSY', true),
      503,
    );
    expect(busy).toBeInstanceOf(PartnersApiError);
    expect(busy).toMatchObject({
      code: 'SERVER_BUSY',
      requestId: 'server-partners-error',
      retryable: true,
      retryAfterSeconds: null,
      status: 503,
    });
    expect(busy.message).toBe('合作人物服务正在准备，请稍后重试');
    expect(busy.message).not.toContain('backend display text');

    const missing = decodePartnersApiError(
      errorEnvelope('PERSON_NOT_IN_QUERY_RESULT'),
      400,
    );
    expect(missing.message).toContain('已不在当前查询结果中');

    expect(() =>
      decodePartnersApiError(errorEnvelope('INTERNAL_ERROR'), 400),
    ).toThrow(ApiDecodeError);
  });

  it('accepts only canonical bounded Retry-After seconds', () => {
    expect(decodeRetryAfterSeconds('1')).toBe(1);
    expect(decodeRetryAfterSeconds('60')).toBe(60);
    expect(decodeRetryAfterSeconds(undefined)).toBeNull();
    expect(decodeRetryAfterSeconds(null)).toBeNull();
    expect(decodeRetryAfterSeconds('0')).toBeNull();
    expect(decodeRetryAfterSeconds('01')).toBeNull();
    expect(decodeRetryAfterSeconds('61')).toBeNull();
    expect(decodeRetryAfterSeconds('1, 2')).toBeNull();
    expect(decodeRetryAfterSeconds('Wed, 21 Oct 2015 07:28:00 GMT')).toBeNull();
  });

  it('performs at most one bounded-jitter retry for retryable 429 through the same client and transaction', async () => {
    const fixture = golden('global.json').cases[0]!;
    const fetchImplementation = vi
      .fn<FetchImplementation>()
      .mockResolvedValueOnce(
        jsonResponse(errorEnvelope('RATE_LIMITED', true), 429, {
          'retry-after': '2',
        }),
      )
      .mockResolvedValueOnce(jsonResponse(fixture.expected.body));
    const wait = vi.fn(async () => undefined);
    const driver = createPartnersDriver(
      createApiClient(fetchImplementation),
      {
        random: () => 0.5,
        wait,
      },
    );
    const controller = new AbortController();

    const response = await driver.execute({
      input: fixture.request.input,
      query: fixture.request.query as never,
      refreshCollection: false,
      signal: controller.signal,
      transactionId: 'partners-retry-transaction',
      view: fixture.request.view ?? {},
    });

    expect(response.transactionId).toBe('partners-retry-transaction');
    expect(wait).toHaveBeenCalledWith(2_100, controller.signal);
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(fetchImplementation.mock.calls[0]![0]).toBe('/api/v1/partners');
    expect(fetchImplementation.mock.calls[1]![0]).toBe('/api/v1/partners');
    expect(fetchImplementation.mock.calls[0]![1]!.body).toBe(
      fetchImplementation.mock.calls[1]![1]!.body,
    );
    const body = JSON.parse(
      String(fetchImplementation.mock.calls[1]![1]!.body),
    ) as Record<string, unknown>;
    expect(body).not.toHaveProperty('refreshCollection');
  });

  it.each([
    {
      code: 'UPSTREAM_UNAVAILABLE' as const,
      label: 'retryable upstream error',
      retryable: true,
      status: 503,
    },
    {
      code: 'RATE_LIMITED' as const,
      label: 'non-retryable 429',
      retryable: false,
      status: 429,
    },
  ])(
    'does not automatically retry a $label even with valid Retry-After',
    async ({ code, retryable, status }) => {
      const fixture = golden('global.json').cases[0]!;
      const fetchImplementation = vi.fn<FetchImplementation>(async () =>
        jsonResponse(errorEnvelope(code, retryable), status, {
          'retry-after': '2',
        }),
      );
      const wait = vi.fn(async () => undefined);
      const driver = createPartnersDriver(
        createApiClient(fetchImplementation),
        { wait },
      );

      await expect(
        driver.execute({
          input: fixture.request.input,
          query: fixture.request.query as never,
          refreshCollection: false,
          signal: new AbortController().signal,
          transactionId: 'partners-ineligible-retry',
          view: fixture.request.view ?? {},
        }),
      ).rejects.toMatchObject({
        code,
        retryAfterSeconds: 2,
        retryable,
      });
      expect(fetchImplementation).toHaveBeenCalledOnce();
      expect(wait).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['missing', undefined],
    ['zero', '0'],
    ['leading-zero', '01'],
    ['out-of-range', '61'],
    ['duplicated', '2, 3'],
    ['http-date', 'Wed, 21 Oct 2015 07:28:00 GMT'],
  ])(
    'does not guess or retry %s Retry-After metadata',
    async (_label, retryAfter) => {
      const fixture = golden('global.json').cases[0]!;
      const responseHeaders: Record<string, string> = retryAfter
        ? { 'retry-after': retryAfter }
        : {};
      const fetchImplementation = vi.fn<FetchImplementation>(async () =>
        jsonResponse(errorEnvelope('RATE_LIMITED', true), 429, responseHeaders),
      );
      const wait = vi.fn(async () => undefined);
      const driver = createPartnersDriver(
        createApiClient(fetchImplementation),
        { wait },
      );

      await expect(
        driver.execute({
          input: fixture.request.input,
          query: fixture.request.query as never,
          refreshCollection: false,
          signal: new AbortController().signal,
          transactionId: 'partners-invalid-retry',
          view: fixture.request.view ?? {},
        }),
      ).rejects.toMatchObject({
        code: 'RATE_LIMITED',
        retryAfterSeconds: null,
      });
      expect(fetchImplementation).toHaveBeenCalledOnce();
      expect(wait).not.toHaveBeenCalled();
    },
  );

  it('never performs a third attempt and aborts a pending bounded wait', async () => {
    const fixture = golden('global.json').cases[0]!;
    const alwaysBusy = vi.fn<FetchImplementation>(async () =>
      jsonResponse(errorEnvelope('SERVER_BUSY', true), 503, {
        'retry-after': '1',
      }),
    );
    const immediateDriver = createPartnersDriver(
      createApiClient(alwaysBusy),
      {
        random: () => 0,
        wait: async () => undefined,
      },
    );
    await expect(
      immediateDriver.execute({
        input: fixture.request.input,
        query: fixture.request.query as never,
        refreshCollection: false,
        signal: new AbortController().signal,
        transactionId: 'partners-two-attempt-limit',
        view: fixture.request.view ?? {},
      }),
    ).rejects.toMatchObject({ code: 'SERVER_BUSY' });
    expect(alwaysBusy).toHaveBeenCalledTimes(2);

    const abortFetch = vi.fn<FetchImplementation>(async () =>
      jsonResponse(errorEnvelope('SERVER_BUSY', true), 503, {
        'retry-after': '1',
      }),
    );
    const abortController = new AbortController();
    const abortDriver = createPartnersDriver(
      createApiClient(abortFetch),
    );
    const pending = abortDriver.execute({
      input: fixture.request.input,
      query: fixture.request.query as never,
      refreshCollection: false,
      signal: abortController.signal,
      transactionId: 'partners-abort-wait',
      view: fixture.request.view ?? {},
    });
    await vi.waitFor(() => {
      expect(abortFetch).toHaveBeenCalledOnce();
    });
    abortController.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(abortFetch).toHaveBeenCalledOnce();
  });

  it('rejects a valid response from another source or requested page', async () => {
    const fixture = golden('global.json').cases[0]!;
    const driver = createPartnersDriver(
      createApiClient(
        vi.fn<FetchImplementation>(async () =>
          jsonResponse(fixture.expected.body),
        ),
      ),
    );

    await expect(
      driver.execute({
        input: {
          source: {
            personId: 99,
            positionKeys: ['staffset:anime:creative'],
          },
        },
        query: fixture.request.query as never,
        refreshCollection: false,
        signal: new AbortController().signal,
        transactionId: 'partners-projection-mismatch',
        view: {},
      }),
    ).rejects.toMatchObject({
      kind: 'schema-mismatch',
      name: 'ApiDecodeError',
    });
  });
});
