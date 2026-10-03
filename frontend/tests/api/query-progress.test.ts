import { describe, expect, it, vi } from 'vitest';
import { createApiClient, type FetchImplementation } from '../../src/api/client';
import { createQueryProgressOwner } from '../../src/features/query/progress';

const progress = { phase: 'collection_page', message: '正在获取收藏分页（已完成 2 页）', completed: 2 };
const frame = (event: string, data: unknown) => `event: ${event}\r\ndata: ${JSON.stringify(data)}\r\n\r\n`;
const result = (status = 200) => ({ status, headers: { 'X-Request-ID': 'abc', 'Retry-After': '2' }, body: { ok: true } });
const request = { reference: '/api/v1/rankings', method: 'POST' as const, decode: (value: unknown) => value };
function stream(text: string, split = false) {
  const bytes = new TextEncoder().encode(text);
  return new Response(new ReadableStream({ start(controller) {
    if (split) for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
    else controller.enqueue(bytes);
    controller.close();
  } }), { headers: { 'content-type': 'text/event-stream; charset=utf-8' } });
}

describe('query SSE transport', () => {
  it('negotiates only query POSTs; decodes byte-split UTF-8, CRLF, heartbeat and unknown events', async () => {
    const update = vi.fn(); const finish = vi.fn();
    const fetcher = vi.fn<FetchImplementation>(async () => stream(': heartbeat\r\n\r\n' + frame('future', {}) + frame('progress', progress) + frame('result', result()), true));
    const client = createApiClient(fetcher, () => ({ update, finish }));
    expect(await client.request(request)).toEqual({ ok: true });
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('accept')).toBe('text/event-stream');
    expect(update).toHaveBeenCalledExactlyOnceWith(progress);
    expect(finish).toHaveBeenCalledOnce();
  });

  it('supports multiline data and original JSON fallback', async () => {
    const client = createApiClient(async () => stream('event: result\ndata: {"status":200,\ndata: "headers":{},"body":{"ok":true}}\n\n'));
    expect(await client.request(request)).toEqual({ ok: true });
    expect(await createApiClient(async () => new Response('{"ok":true}')).request(request)).toEqual({ ok: true });
  });

  it('preserves result error status and retry metadata for the existing decoder', async () => {
    const client = createApiClient(async () => stream(frame('result', result(503))));
    const error = new Error('稍后重试');
    const decodeError = vi.fn((value, status, metadata) => {
      expect(status).toBe(503); expect(metadata.header('Retry-After')).toBe('2');
      expect(metadata.header('X-Request-ID')).toBe('abc'); expect(value).toEqual({ ok: true });
      return error;
    });
    await expect(client.request({ ...request, decodeError })).rejects.toBe(error);
  });

  it.each([
    frame('progress', { ...progress, total: 0 }),
    frame('progress', { ...progress, total: 1 }),
    frame('progress', { ...progress, extra: true }),
    frame('result', { ...result(), status: 0 }),
    frame('result', { ...result(), headers: { 'Set-Cookie': 'forbidden' } }),
    'event: result\ndata: oops\n\n',
    frame('progress', progress),
    'event: result\ndata: {"status":200}',
  ])('fails closed and retires progress for malformed or interrupted streams', async (text) => {
    const owner = createQueryProgressOwner();
    const client = createApiClient(async () => stream(text), owner.observe);
    await expect(client.request(request)).rejects.toBeInstanceOf(Error);
    expect(owner.active.value).toEqual([]);
  });

  it('bounds unterminated frames before they can grow without limit', async () => {
    const owner = createQueryProgressOwner();
    const client = createApiClient(async () => stream('data: ' + 'x'.repeat(16 * 1024 * 1024)), owner.observe);
    await expect(client.request(request)).rejects.toMatchObject({ kind: 'schema-mismatch' });
    expect(owner.active.value).toEqual([]);
  });

  it('cancels a pending reader immediately and retries as a new isolated POST', async () => {
    const cancel = vi.fn(); let controller!: ReadableStreamDefaultController;
    const owner = createQueryProgressOwner();
    const fetcher = vi.fn().mockImplementationOnce(async () => new Response(new ReadableStream({
      start(value) { controller = value; }, cancel,
    }), { headers: { 'content-type': 'text/event-stream' } })).mockImplementationOnce(async () => stream(frame('result', result())));
    const client = createApiClient(fetcher, owner.observe);
    const abort = new AbortController();
    const pending = client.request({ ...request, signal: abort.signal });
    await Promise.resolve();
    controller.enqueue(new TextEncoder().encode(frame('progress', progress)));
    await Promise.resolve();
    abort.abort();
    expect(owner.active.value).toEqual([]);
    await expect(pending).rejects.toMatchObject({ kind: 'network-failure' });
    expect(cancel).toHaveBeenCalledOnce();
    expect(await client.request(request)).toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(owner.active.value).toEqual([]);
  });
});
