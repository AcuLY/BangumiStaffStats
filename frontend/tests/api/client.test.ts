import { describe, expect, it, vi } from 'vitest';

import {
  assertSafeApiReference,
  createApiClient,
  type FetchImplementation,
} from '../../src/api/client';
import { ApiDecodeError, ApiTransportError } from '../../src/api/errors';

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    headers: {
      'content-type': 'application/json',
    },
    status,
  });
}

describe('native fetch API client', () => {
  it('forwards a safe relative request and returns decoder output', async () => {
    const response = jsonResponse({ value: 42 });
    const fetchImplementation = vi.fn<FetchImplementation>(async () => response);
    const client = createApiClient(fetchImplementation);
    const controller = new AbortController();

    const result = await client.request({
      body: '{"query":true}',
      decode: (value) => {
        const record = value as { value: number };
        return record.value;
      },
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
      reference: '/api/query?revision=1',
      signal: controller.signal,
    });

    expect(result).toBe(42);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(fetchImplementation).toHaveBeenCalledWith('/api/query?revision=1', {
      body: '{"query":true}',
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
      signal: controller.signal,
    });
  });

  it.each([
    'https://api.bgm.tv/v0/subjects',
    '//api.example.test/query',
    'http:query',
    '/other/query',
    '/api/../admin',
    '/api/%2e%2e/admin',
    '/api//query',
    '/api/%2Fquery',
    '/api/%5cquery',
    '/api/%252e%252e/admin',
    '/api/%255cquery',
    '/api/%00',
    '/api/\\query',
    '/api/query#fragment',
    '/api/query\n',
  ])('rejects unsafe reference before fetch: %s', async (reference) => {
    const fetchImplementation = vi.fn<FetchImplementation>();
    const client = createApiClient(fetchImplementation);

    await expect(
      client.request({
        decode: (value) => value,
        reference,
      }),
    ).rejects.toMatchObject({
      kind: 'invalid-reference',
      name: 'ApiTransportError',
    });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('accepts only canonical relative API references', () => {
    expect(assertSafeApiReference('/api/v1/query')).toBe('/api/v1/query');
    expect(assertSafeApiReference('/api/v1/query?mode=ranking')).toBe(
      '/api/v1/query?mode=ranking',
    );
    expect(assertSafeApiReference('/api/v1/query?name=%E6%98%9F%E9%87%8E')).toBe(
      '/api/v1/query?name=%E6%98%9F%E9%87%8E',
    );
  });

  it('keeps invalid-reference errors fixed and independent of user input', () => {
    const secret = `do-not-leak-${'x'.repeat(10_000)}`;

    expect(() => assertSafeApiReference(`/api/%25${secret}`)).toThrowError(
      expect.objectContaining({
        kind: 'invalid-reference',
        message: 'The API reference is not a safe relative path',
        name: 'ApiTransportError',
      }),
    );

    try {
      assertSafeApiReference(`/api/%25${secret}`);
    } catch (error) {
      expect(error).toBeInstanceOf(ApiTransportError);
      expect((error as Error).message).not.toContain(secret);
      expect((error as Error).message.length).toBeLessThan(100);
    }
  });

  it('bounds network and HTTP failures', async () => {
    const networkClient = createApiClient(
      vi.fn<FetchImplementation>(async () => {
        throw new TypeError('offline');
      }),
    );
    await expect(
      networkClient.request({
        decode: (value) => value,
        reference: '/api/query',
      }),
    ).rejects.toMatchObject({
      kind: 'network-failure',
      name: 'ApiTransportError',
    });

    const httpClient = createApiClient(
      vi.fn<FetchImplementation>(async () =>
        jsonResponse({ error: true }, 503),
      ),
    );
    await expect(
      httpClient.request({
        decode: (value) => value,
        reference: '/api/query',
      }),
    ).rejects.toMatchObject({
      kind: 'http-status',
      name: 'ApiTransportError',
      status: 503,
    });
  });

  it('keeps JSON and decoder failures in bounded decode categories', async () => {
    const invalidJsonClient = createApiClient(
      vi.fn<FetchImplementation>(
        async () => new Response('{', { status: 200 }),
      ),
    );
    await expect(
      invalidJsonClient.request({
        decode: (value) => value,
        reference: '/api/query',
      }),
    ).rejects.toBeInstanceOf(ApiDecodeError);
    await expect(
      invalidJsonClient.request({
        decode: (value) => value,
        reference: '/api/query',
      }),
    ).rejects.toMatchObject({ kind: 'invalid-json' });

    const decoderClient = createApiClient(
      vi.fn<FetchImplementation>(async () => jsonResponse({ value: 1 })),
    );
    await expect(
      decoderClient.request({
        decode: () => {
          throw new Error('not this shape');
        },
        reference: '/api/query',
      }),
    ).rejects.toMatchObject({
      kind: 'schema-mismatch',
      name: 'ApiDecodeError',
    });
  });

  it('exposes stable error classes without leaking unbounded details', () => {
    const transport = new ApiTransportError('http-status', 'failed', {
      status: 429,
    });
    const decode = new ApiDecodeError('schema-mismatch', 'failed', {
      issues: Array.from({ length: 12 }, (_, index) => ({
        keyword: 'type',
        path: `/field/${index}`,
      })),
    });

    expect(transport.status).toBe(429);
    expect(decode.issues).toHaveLength(8);
  });
});
