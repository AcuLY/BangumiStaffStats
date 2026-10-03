import { ApiDecodeError, ApiTransportError } from './errors';

export interface QueryProgress {
  readonly phase: string;
  readonly message: string;
  readonly completed?: number;
  readonly total?: number;
}

export interface QueryProgressSubscription {
  update(progress: QueryProgress): void;
  finish(): void;
}

export type QueryProgressObserver = (reference: string) => QueryProgressSubscription;

export function isProgressQuery(reference: string, method: string): boolean {
  return method === 'POST' && /^\/api\/v1\/(rankings|candidates|person-detail|partners|co-star)$/.test(reference);
}

// A generous terminal-frame ceiling also bounds malformed/unterminated SSE buffering.
const maxFrameCharacters = 16 * 1024 * 1024;
const phases = new Set(['starting', 'collection', 'collection_page', 'collection_cache',
  'collection_validate', 'cache', 'waiting', 'sqlite', 'filter', 'compute', 'aggregate',
  'projection', 'complete']);
const forwardedHeaders = new Set(['content-type', 'x-request-id', 'retry-after', 'server-timing', 'cache-control']);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidFrame(): never {
  throw new ApiDecodeError('schema-mismatch', '查询进度响应格式不正确，请重试');
}

function decodeProgress(value: unknown): QueryProgress {
  if (!record(value) || Object.keys(value).some((key) => !['phase', 'message', 'completed', 'total'].includes(key))
    || typeof value.phase !== 'string' || !phases.has(value.phase)
    || typeof value.message !== 'string' || value.message.length > 200
    || (value.completed !== undefined && (!Number.isSafeInteger(value.completed) || Number(value.completed) < 0))
    || (value.total !== undefined && (!Number.isSafeInteger(value.total) || Number(value.total) < 1))
    || (value.total !== undefined && value.completed !== undefined && Number(value.completed) > Number(value.total))) {
    return invalidFrame();
  }
  return value as unknown as QueryProgress;
}

function decodeResult(value: unknown): Response {
  if (!record(value) || Object.keys(value).some((key) => !['status', 'headers', 'body'].includes(key))
    || !Number.isInteger(value.status) || Number(value.status) < 200 || Number(value.status) > 599
    || !record(value.headers) || !record(value.body)) return invalidFrame();
  const headers = new Headers();
  for (const [name, content] of Object.entries(value.headers)) {
    if (!forwardedHeaders.has(name.toLowerCase()) || typeof content !== 'string') return invalidFrame();
    try { headers.set(name, content); } catch { return invalidFrame(); }
  }
  try {
    return new Response(JSON.stringify(value.body), { status: Number(value.status), headers });
  } catch { return invalidFrame(); }
}

/** Decode framing only. The operation's existing decoder still owns its result envelope. */
export async function readQueryStream(
  response: Response,
  onProgress: (progress: QueryProgress) => void,
  signal?: AbortSignal,
): Promise<Response> {
  if (!response.body) throw new ApiTransportError('network-failure', '查询连接已中断，请重试');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let buffer = '';
  let event = '';
  let data: string[] = [];
  let frameCharacters = 0;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    if (signal?.aborted) throw new ApiTransportError('network-failure', '查询已取消');
    while (true) {
      const chunk = await reader.read();
      if (signal?.aborted) throw new ApiTransportError('network-failure', '查询已取消');
      try { buffer += decoder.decode(chunk.value, { stream: !chunk.done }); }
      catch (cause) { throw new ApiDecodeError('invalid-utf8', '查询进度文本编码不正确', { cause }); }
      // CRLF can itself straddle network chunks. Keep its final CR until the next read.
      while (true) {
        const boundary = buffer.search(/[\r\n]/);
        if (boundary === -1 || (!chunk.done && boundary === buffer.length - 1 && buffer[boundary] === '\r')) break;
        frameCharacters += boundary;
        if (frameCharacters > maxFrameCharacters) return invalidFrame();
        const line = buffer.slice(0, boundary);
        const width = buffer[boundary] === '\r' && buffer[boundary + 1] === '\n' ? 2 : 1;
        buffer = buffer.slice(boundary + width);
        if (line === '') {
          if (data.length > 0 && (event === 'progress' || event === 'result')) {
            let value: unknown;
            try { value = JSON.parse(data.join('\n')); }
            catch (cause) { throw new ApiDecodeError('invalid-json', '查询进度响应不是有效 JSON', { cause }); }
            if (event === 'result') return decodeResult(value);
            onProgress(decodeProgress(value));
          }
          event = '';
          data = [];
          frameCharacters = 0;
        } else if (!line.startsWith(':')) {
          const colon = line.indexOf(':');
          const field = colon === -1 ? line : line.slice(0, colon);
          let value = colon === -1 ? '' : line.slice(colon + 1);
          if (value.startsWith(' ')) value = value.slice(1);
          if (field === 'event') event = value;
          if (field === 'data' && (event === '' || event === 'progress' || event === 'result')) data.push(value);
        }
      }
      if (frameCharacters + buffer.length > maxFrameCharacters) return invalidFrame();
      if (chunk.done) throw new ApiTransportError('network-failure', '查询连接已中断，请重试');
    }
  } catch (cause) {
    if (cause instanceof ApiDecodeError || cause instanceof ApiTransportError) throw cause;
    throw new ApiTransportError('network-failure', '查询连接已中断，请重试', { cause });
  } finally {
    signal?.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
