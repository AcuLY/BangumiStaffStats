import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

import {
  assertSafeRelativePath,
  isStrictlyBelow,
  requireCanonicalPath,
} from '../lib/paths.mjs';
import { assertSameSeal, sealDirectory } from '../lib/seal.mjs';

const HISTORY_FILES = Object.freeze({
  candidate: Object.freeze({
    '/': 'index.html',
    '/co-star': 'index.html',
    '/ranking': 'index.html',
  }),
  oracle: Object.freeze({
    '/': 'person-workbench-empty.html',
    '/co-star': 'person-workbench.html',
    '/ranking': 'person-workbench.html',
  }),
});
const API_REQUEST_HEADER_ALLOWLIST = new Set([
  'accept',
  'content-type',
  'if-modified-since',
  'if-none-match',
  'range',
]);
const API_RESPONSE_HEADER_ALLOWLIST = new Set([
  'cache-control',
  'content-disposition',
  'content-type',
  'etag',
  'last-modified',
  'vary',
]);
const MAX_API_REQUEST_BYTES = 8 * 1024 * 1024;
const MAX_API_RESPONSE_BYTES = 64 * 1024 * 1024;
const MAX_REQUEST_TARGET_BYTES = 8 * 1024;

const MIME_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
});

export class AcceptanceServerError extends Error {}
class AcceptanceRequestError extends AcceptanceServerError {}

function fail(message) {
  throw new AcceptanceServerError(message);
}

function rejectRequest(message) {
  throw new AcceptanceRequestError(message);
}

function requestTarget(rawTarget) {
  if (
    typeof rawTarget !== 'string' ||
    rawTarget.length === 0 ||
    Buffer.byteLength(rawTarget) > MAX_REQUEST_TARGET_BYTES ||
    !rawTarget.startsWith('/') ||
    rawTarget.startsWith('//') ||
    rawTarget.includes('\\') ||
    rawTarget.includes('#') ||
    /[\u0000-\u001f\u007f]/u.test(rawTarget)
  ) {
    rejectRequest('request target is not a bounded origin-form path');
  }
  const queryIndex = rawTarget.indexOf('?');
  const rawPath = queryIndex === -1 ? rawTarget : rawTarget.slice(0, queryIndex);
  if (/%(?:2f|5c)/iu.test(rawPath)) {
    rejectRequest('request target contains an encoded separator');
  }
  let pathname;
  try {
    pathname = decodeURIComponent(rawPath);
  } catch {
    rejectRequest('request target has invalid percent encoding');
  }
  if (
    pathname.includes('\0') ||
    pathname.includes('\\') ||
    pathname.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    rejectRequest('request target contains an unsafe path segment');
  }
  return Object.freeze({ pathname, raw: rawTarget });
}

function errorResponse(response, status, message) {
  const bytes = Buffer.from(`${message}\n`, 'utf8');
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-length': bytes.length,
    'content-type': 'text/plain; charset=utf-8',
    'x-content-type-options': 'nosniff',
  });
  response.end(bytes);
}

function closedRequestHeaders(headers) {
  const result = {};
  for (const name of API_REQUEST_HEADER_ALLOWLIST) {
    const value = headers[name];
    if (typeof value === 'string' && value.length <= 4096) result[name] = value;
  }
  return Object.freeze(result);
}

function responseBody(value) {
  let body;
  if (Buffer.isBuffer(value)) body = value;
  else if (value instanceof Uint8Array) body = Buffer.from(value);
  else if (typeof value === 'string') body = Buffer.from(value, 'utf8');
  else fail('API adapter response body must be bytes or text');
  if (body.length > MAX_API_RESPONSE_BYTES) {
    fail('API adapter response exceeds the bounded response size');
  }
  return body;
}

function responseStatus(value) {
  if (!Number.isInteger(value) || value < 100 || value > 599) {
    fail('API adapter response has an invalid HTTP status');
  }
  return value;
}

function closedResponseHeaders(value) {
  if (value === undefined) return {};
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail('API adapter response headers must be an object');
  }
  const result = {};
  for (const [rawName, rawValue] of Object.entries(value)) {
    const name = rawName.toLowerCase();
    if (!API_RESPONSE_HEADER_ALLOWLIST.has(name)) continue;
    if (
      typeof rawValue !== 'string' ||
      rawValue.length === 0 ||
      rawValue.length > 4096 ||
      /[\r\n\0]/u.test(rawValue)
    ) {
      fail(`API adapter response header ${name} is invalid`);
    }
    result[name] = rawValue;
  }
  return result;
}

async function readRequestBody(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_API_REQUEST_BYTES) {
      throw new AcceptanceRequestError('API request exceeds the bounded body size');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function serveApi(request, response, target, apiRequest) {
  if (typeof apiRequest !== 'function') {
    errorResponse(response, 503, 'API transport unavailable');
    return;
  }
  if (!['GET', 'HEAD', 'POST'].includes(request.method ?? '')) {
    response.setHeader('allow', 'GET, HEAD, POST');
    errorResponse(response, 405, 'Method not allowed');
    return;
  }
  const controller = new AbortController();
  request.once('aborted', () => controller.abort());
  const body = await readRequestBody(request);
  const adapted = await apiRequest(
    Object.freeze({
      body,
      headers: closedRequestHeaders(request.headers),
      method: request.method,
      path: target.raw,
      signal: controller.signal,
    }),
  );
  if (adapted === null || typeof adapted !== 'object' || Array.isArray(adapted)) {
    fail('API adapter returned an invalid response');
  }
  const responseBytes = responseBody(adapted.body);
  const responseHeaders = closedResponseHeaders(adapted.headers);
  responseHeaders['content-length'] = String(responseBytes.length);
  responseHeaders['x-content-type-options'] = 'nosniff';
  response.writeHead(responseStatus(adapted.status), responseHeaders);
  response.end(request.method === 'HEAD' ? undefined : responseBytes);
}

function staticRelativePath(target, historyFiles) {
  if (Object.hasOwn(historyFiles, target.pathname)) {
    return historyFiles[target.pathname];
  }
  const relative = target.pathname.replace(/^\/+/u, '');
  if (relative === '') return null;
  try {
    return assertSafeRelativePath(relative, 'static request path');
  } catch {
    return null;
  }
}

function serveStatic(request, response, target, root, historyFiles) {
  if (!['GET', 'HEAD'].includes(request.method ?? '')) {
    response.setHeader('allow', 'GET, HEAD');
    errorResponse(response, 405, 'Method not allowed');
    return;
  }
  const relative = staticRelativePath(target, historyFiles);
  if (!relative) {
    errorResponse(response, 404, 'Not found');
    return;
  }
  const absolute = path.join(root, ...relative.split('/'));
  if (!isStrictlyBelow(absolute, root)) {
    errorResponse(response, 400, 'Unsafe path');
    return;
  }
  let information;
  try {
    information = fs.lstatSync(absolute);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      errorResponse(response, 404, 'Not found');
      return;
    }
    throw error;
  }
  if (!information.isFile() || information.isSymbolicLink()) {
    errorResponse(response, 404, 'Not found');
    return;
  }
  const body = fs.readFileSync(absolute);
  response.writeHead(200, {
    'cache-control': 'no-store',
    'content-length': body.length,
    'content-type':
      MIME_TYPES[path.extname(absolute).toLowerCase()] ??
      'application/octet-stream',
    'x-content-type-options': 'nosniff',
  });
  response.end(request.method === 'HEAD' ? undefined : body);
}

async function listenLoopback(server) {
  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen({ exclusive: true, host: '127.0.0.1', port: 0 });
  });
  const address = server.address();
  if (
    address === null ||
    typeof address === 'string' ||
    address.address !== '127.0.0.1'
  ) {
    server.close();
    fail('static server did not bind exact IPv4 loopback');
  }
  return address.port;
}

async function closeServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeIdleConnections?.();
    server.closeAllConnections?.();
  });
}

function closedServerOptions(options) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    fail('server options must be an object');
  }
  const allowed = new Set(['apiRequest', 'kind', 'root', 'runRoot']);
  const unknown = Object.keys(options).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    fail(`server options contain unknown fields: ${unknown.sort().join(', ')}`);
  }
  return options;
}

export async function startAcceptanceServer(options) {
  const { apiRequest, kind, root, runRoot } = closedServerOptions(options);
  if (!Object.hasOwn(HISTORY_FILES, kind)) {
    fail('server kind must be candidate or oracle');
  }
  if (kind === 'oracle' && apiRequest !== undefined) {
    fail('oracle server must not have an API transport');
  }
  const canonicalRunRoot = requireCanonicalPath(runRoot, {
    label: 'browser run root',
    type: 'directory',
  });
  const canonicalRoot = requireCanonicalPath(root, {
    below: canonicalRunRoot,
    label: `${kind} static root`,
    type: 'directory',
  });
  const historyFiles = HISTORY_FILES[kind];
  for (const relative of new Set(Object.values(historyFiles))) {
    requireCanonicalPath(path.join(canonicalRoot, relative), {
      below: canonicalRoot,
      label: `${kind} history entry`,
      type: 'file',
    });
  }
  const before = await sealDirectory(canonicalRoot);
  const faults = [];
  const rejections = [];
  const server = http.createServer((request, response) => {
    Promise.resolve()
      .then(async () => {
        const target = requestTarget(request.url);
        if (target.pathname.startsWith('/api/')) {
          if (kind !== 'candidate') {
            errorResponse(response, 404, 'Not found');
            return;
          }
          await serveApi(request, response, target, apiRequest);
          return;
        }
        serveStatic(request, response, target, canonicalRoot, historyFiles);
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        if (error instanceof AcceptanceRequestError) rejections.push(message);
        else faults.push(message);
        if (!response.headersSent) errorResponse(response, 400, 'Rejected request');
        else response.destroy();
      });
  });
  server.on('clientError', (error, socket) => {
    rejections.push(error.message);
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  });
  const port = await listenLoopback(server);
  let closed = false;
  return Object.freeze({
    facts: Object.freeze({
      apiTransport: kind === 'candidate' ? 'closed-callback' : 'none',
      historyRoutes: Object.freeze(Object.keys(historyFiles).sort()),
      host: '127.0.0.1',
      kind,
      port,
      rootDigest: before.digest,
    }),
    origin: `http://127.0.0.1:${port}`,
    async close() {
      if (closed) {
        return Object.freeze({
          faults: Object.freeze([...faults]),
          rejections: Object.freeze([...rejections]),
        });
      }
      closed = true;
      await closeServer(server);
      const after = await sealDirectory(canonicalRoot);
      assertSameSeal(before, after, `${kind} static root`);
      if (faults.length > 0) {
        fail(`${kind} static server recorded faults: ${faults.join('; ')}`);
      }
      return Object.freeze({
        faults: Object.freeze([]),
        rejections: Object.freeze([...rejections]),
        rootDigest: after.digest,
      });
    },
  });
}
