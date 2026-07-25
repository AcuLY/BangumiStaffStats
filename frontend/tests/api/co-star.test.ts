import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import {
  adaptCoStarSuccess,
  decodeCoStarPayload,
  decodeCoStarSuccess,
} from '../../src/api/adapters/coStar';
import {
  CoStarApiError,
  type CoStarDriverRequest,
  createCoStarDriver,
  decodeCoStarApiError,
  decodeCoStarRetryAfterSeconds,
} from '../../src/api/coStar';
import {
  createApiClient,
  type FetchImplementation,
} from '../../src/api/client';
import { ApiDecodeError } from '../../src/api/errors';
import type {
  CoStarRequestV1,
  CoStarResultErrorEnvelopeV1,
  ErrorCodeV1,
} from '../../src/api/generated/co-star/types.gen';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);

type GoldenName = 'global' | 'group' | 'personal';

function golden(filename: GoldenName) {
  return JSON.parse(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'contracts/goldens/api/co-star/cases',
        `${filename}.json`,
      ),
      'utf8',
    ),
  ) as {
    cases: Array<{
      expected: { body: unknown };
      request: CoStarRequestV1;
    }>;
  };
}

function goldenBody(filename: GoldenName): unknown {
  return golden(filename).cases[0]!.expected.body;
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
): CoStarResultErrorEnvelopeV1 {
  return {
    error: {
      code,
      fieldErrors: {},
      message: 'backend display text is not trusted',
      retryable,
    },
    meta: {
      requestId: 'server-co-star-error',
    },
  };
}

function semanticError(value: unknown): ApiDecodeError {
  try {
    decodeCoStarSuccess(value);
  } catch (error) {
    expect(error).toBeInstanceOf(ApiDecodeError);
    return error as ApiDecodeError;
  }
  throw new Error('Expected semantic decode failure');
}

function driverRequest(
  filename: GoldenName = 'global',
): CoStarDriverRequest {
  const request = golden(filename).cases[0]!.request;
  return {
    input: request.input,
    query: request.query,
    refreshCollection: false as const,
    signal: new AbortController().signal,
    transactionId: 'co-star-transaction',
    view: request.view ?? {
      order: 'desc',
      page: 1,
      pageSize: 10,
      search: '',
      sort: 'globalScore',
    },
  };
}

describe('co-star response adapter', () => {
  it('preserves pair/group, nullable zero evidence, scope omission, and deep immutability', () => {
    const global = adaptCoStarSuccess(
      decodeCoStarSuccess(goldenBody('global')),
    );
    const group = decodeCoStarPayload(goldenBody('group'), 'global');
    const personal = decodeCoStarPayload(
      goldenBody('personal'),
      'personal',
    );

    expect(global).toMatchObject({
      scope: 'global',
      data: {
        kind: 'pair',
        workUnit: 'series',
      },
    });
    expect(global).not.toHaveProperty('collection');
    expect(group.data).toMatchObject({
      kind: 'group',
      matrix: {
        pairs: [
          { leftPersonId: 1, rightPersonId: 2 },
          { leftPersonId: 1, rightPersonId: 3 },
          { leftPersonId: 2, rightPersonId: 3 },
        ],
      },
    });
    expect(personal.data.summary).toMatchObject({
      average: null,
      commonWorkCount: 0,
      ratedWorkCount: 0,
    });
    expect(personal.data).toHaveProperty('preference.mean', null);
    expect(personal.data).toHaveProperty('preference.score', null);
    if (group.data.kind !== 'group') {
      throw new Error('Expected group golden');
    }
    expect(Object.isFrozen(group.data.matrix.pairs)).toBe(true);
    expect(Object.isFrozen(global.data.items[0])).toBe(true);
  });

  it('rejects reordered matrix, rating datasets, and item participants', () => {
    const reorderedMatrix = structuredClone(
      goldenBody('group'),
    ) as {
      data: { matrix: { pairs: unknown[] } };
    };
    reorderedMatrix.data.matrix.pairs.reverse();
    expect(semanticError(reorderedMatrix).issues).toContainEqual({
      keyword: 'co-star-semantic',
      path: '/data/matrix/pairs',
    });

    const reorderedRatings = structuredClone(
      goldenBody('global'),
    ) as {
      data: { ratings: { datasets: unknown[] } };
    };
    [
      reorderedRatings.data.ratings.datasets[1],
      reorderedRatings.data.ratings.datasets[2],
    ] = [
      reorderedRatings.data.ratings.datasets[2],
      reorderedRatings.data.ratings.datasets[1],
    ];
    expect(semanticError(reorderedRatings).issues).toContainEqual({
      keyword: 'co-star-semantic',
      path: '/data/ratings/datasets',
    });

    const reorderedParticipants = structuredClone(
      goldenBody('global'),
    ) as {
      data: { items: Array<{ participants: unknown[] }> };
    };
    reorderedParticipants.data.items[0]!.participants.reverse();
    expect(semanticError(reorderedParticipants).issues).toContainEqual({
      keyword: 'co-star-semantic',
      path: '/data/items/0/participants',
    });
  });

  it('enforces the complete empty-common-set contract beyond JSON Schema', () => {
    const withTag = structuredClone(goldenBody('personal')) as {
      data: { tags: { meta: unknown[] } };
    };
    withTag.data.tags.meta.push({ count: 1, name: 'TV' });
    expect(semanticError(withTag).issues[0]).toEqual({
      keyword: 'co-star-semantic',
      path: '/data/summary/commonWorkCount',
    });

    const withDataset = structuredClone(goldenBody('personal')) as {
      data: { ratings: { datasets: unknown[] } };
    };
    const globalCommon = (
      structuredClone(goldenBody('global')) as {
        data: { ratings: { datasets: Array<Record<string, unknown>> } };
      }
    ).data.ratings.datasets[0]!;
    withDataset.data.ratings.datasets.push({
      ...globalCommon,
      personal: structuredClone(globalCommon.global),
    });
    expect(semanticError(withDataset).issues[0]).toEqual({
      keyword: 'co-star-semantic',
      path: '/data/summary/commonWorkCount',
    });

    const withPreference = structuredClone(
      goldenBody('personal'),
    ) as {
      data: {
        preference: {
          mean: { denominator: string; numerator: string } | null;
        };
      };
    };
    withPreference.data.preference.mean = {
      denominator: '1',
      numerator: '1',
    };
    expect(semanticError(withPreference).issues[0]).toEqual({
      keyword: 'co-star-semantic',
      path: '/data/preference',
    });

    const withPagination = structuredClone(
      goldenBody('personal'),
    ) as {
      meta: { pagination: { total: number } };
    };
    withPagination.meta.pagination.total = 1;
    expect(semanticError(withPagination).issues[0]).toEqual({
      keyword: 'co-star-semantic',
      path: '/data/summary/commonWorkCount',
    });
  });

  it('rejects structural extras, scope mismatches, and status/code mismatches', () => {
    const extra = structuredClone(goldenBody('global')) as Record<
      string,
      unknown
    >;
    extra.unexpected = true;
    expect(() => decodeCoStarSuccess(extra)).toThrow(ApiDecodeError);
    expect(() =>
      decodeCoStarPayload(goldenBody('personal'), 'global'),
    ).toThrow(ApiDecodeError);
    expect(() =>
      decodeCoStarApiError(errorEnvelope('RATE_LIMITED'), 503),
    ).toThrow(ApiDecodeError);
  });
});

describe('co-star API driver', () => {
  it('posts only the closed request to the same-origin endpoint and verifies projection', async () => {
    const fetchImplementation = vi.fn<FetchImplementation>(
      async () => jsonResponse(goldenBody('global')),
    );
    const result = await createCoStarDriver(
      createApiClient(fetchImplementation),
    ).execute(driverRequest());
    const [reference, init] = fetchImplementation.mock.calls[0]!;
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;

    expect(reference).toBe('/api/v1/co-star');
    expect(init).toMatchObject({ method: 'POST' });
    expect(body).toEqual({
      input: golden('global').cases[0]!.request.input,
      query: golden('global').cases[0]!.request.query,
      view: golden('global').cases[0]!.request.view,
    });
    expect(body).not.toHaveProperty('refreshCollection');
    expect(result).toMatchObject({
      requestId: 'req-co-star-global-pair',
      staleCollection: false,
      transactionId: 'co-star-transaction',
    });
  });

  it('rejects responses for a different ordered participant projection', async () => {
    const response = structuredClone(goldenBody('global')) as {
      data: { participants: unknown[] };
    };
    response.data.participants.reverse();
    await expect(
      createCoStarDriver(
        createApiClient(async () => jsonResponse(response)),
      ).execute(driverRequest()),
    ).rejects.toBeInstanceOf(ApiDecodeError);
  });

  it.each([
    [undefined, null],
    ['', null],
    ['0', null],
    ['01', null],
    ['61', null],
    ['1, 2', null],
    ['Wed, 21 Oct 2015 07:28:00 GMT', null],
    ['1', 1],
    ['60', 60],
  ])('decodes only canonical bounded Retry-After %s', (value, expected) => {
    expect(decodeCoStarRetryAfterSeconds(value)).toBe(expected);
  });

  it.each([
    ['RATE_LIMITED' as const, 429],
    ['SERVER_BUSY' as const, 503],
  ])('retries eligible %s once through the same request', async (code, status) => {
    const bodies: string[] = [];
    const fetchImplementation = vi
      .fn<FetchImplementation>()
      .mockImplementationOnce(async (_reference, init) => {
        bodies.push(String(init?.body));
        return jsonResponse(errorEnvelope(code, true), status, {
          'retry-after': '2',
        });
      })
      .mockImplementationOnce(async (_reference, init) => {
        bodies.push(String(init?.body));
        return jsonResponse(goldenBody('global'));
      });
    const wait = vi.fn(async () => undefined);
    const result = await createCoStarDriver(
      createApiClient(fetchImplementation),
      { random: () => 0.5, wait },
    ).execute(driverRequest());

    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(bodies[0]).toBe(bodies[1]);
    expect(wait).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(AbortSignal),
    );
    expect(result.transactionId).toBe('co-star-transaction');
  });

  it.each([
    ['RATE_LIMITED' as const, 429, false, '2'],
    ['UPSTREAM_UNAVAILABLE' as const, 503, true, '2'],
    ['SERVER_BUSY' as const, 503, true, '01'],
  ])(
    'does not retry noneligible %s responses',
    async (code, status, retryable, retryAfter) => {
      const fetchImplementation = vi.fn<FetchImplementation>(
        async () =>
          jsonResponse(errorEnvelope(code, retryable), status, {
            'retry-after': retryAfter,
          }),
      );
      const wait = vi.fn(async () => undefined);
      await expect(
        createCoStarDriver(createApiClient(fetchImplementation), {
          wait,
        }).execute(driverRequest()),
      ).rejects.toBeInstanceOf(CoStarApiError);
      expect(fetchImplementation).toHaveBeenCalledTimes(1);
      expect(wait).not.toHaveBeenCalled();
    },
  );

  it('makes the retry wait abortable and never sends a second request', async () => {
    const controller = new AbortController();
    const fetchImplementation = vi.fn<FetchImplementation>(
      async () =>
        jsonResponse(errorEnvelope('SERVER_BUSY', true), 503, {
          'retry-after': '2',
        }),
    );
    const wait = vi.fn(
      async (_milliseconds: number, signal: AbortSignal) =>
        new Promise<void>((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () =>
              reject(
                new DOMException(
                  'The operation was aborted',
                  'AbortError',
                ),
              ),
            { once: true },
          );
        }),
    );
    const request = driverRequest();
    const result = createCoStarDriver(
      createApiClient(fetchImplementation),
      { wait },
    ).execute({
      ...request,
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(wait).toHaveBeenCalledOnce());
    controller.abort();

    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });
});
