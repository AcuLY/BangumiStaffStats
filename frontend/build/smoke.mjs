#!/usr/bin/env node

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';

import { sha256File, verifyComponentDirectory } from '../../contracts/artifacts/lib/validation.mjs';
import {
  TMP_ROOT,
  ensureUnderTmpDirectory,
  readNormalizedTar,
  removeUnderTmp,
  requireUnderTmp,
} from './artifact.mjs';

const SMOKE_ROOT = path.join(TMP_ROOT, 'smoke');

function fail(message) {
  throw new Error(message);
}

function snapshot(root) {
  const result = new Map();
  function visit(directory, prefix) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) fail(`symlink is forbidden: ${relative}`);
      if (entry.isDirectory()) visit(absolute, relative);
      else if (entry.isFile()) result.set(relative, sha256File(absolute));
      else fail(`special file is forbidden: ${relative}`);
    }
  }
  visit(root, '');
  return result;
}

function sameSnapshot(before, after) {
  return (
    before.size === after.size &&
    [...before].every(([name, digest]) => after.get(name) === digest)
  );
}

function extractFrontend(componentRoot, destination) {
  const validation = verifyComponentDirectory(componentRoot, 'frontend');
  const tarArtifacts = validation.statement.artifacts.filter((entry) =>
    entry.path.endsWith('.tar'),
  );
  if (tarArtifacts.length !== 1) fail('Frontend statement must contain exactly one static tar');
  const tarPath = path.join(componentRoot, ...tarArtifacts[0].path.split('/'));
  const entries = readNormalizedTar(fs.readFileSync(tarPath));
  if (entries.length === 0) fail('static tar is empty');
  ensureUnderTmpDirectory(destination, 'static extraction root');
  for (const entry of entries) {
    const target = path.join(destination, ...entry.path.split('/'));
    const resolved = path.resolve(target);
    if (!resolved.startsWith(`${path.resolve(destination)}${path.sep}`)) {
      fail(`tar entry escapes extraction root: ${entry.path}`);
    }
    requireUnderTmp(target, `static extraction file ${entry.path}`);
    ensureUnderTmpDirectory(
      path.dirname(target),
      `static extraction parent ${entry.path}`,
    );
    requireUnderTmp(target, `static extraction file ${entry.path}`);
    fs.writeFileSync(target, entry.bytes, { flag: 'wx', mode: 0o444 });
    requireUnderTmp(target, `static extraction file ${entry.path}`);
  }
  return entries;
}

function contentType(file) {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.json')) return 'application/json; charset=utf-8';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  if (file.endsWith('.png')) return 'image/png';
  return 'application/octet-stream';
}

function createStaticServer(staticRoot, requestedPaths) {
  return http.createServer((request, response) => {
    const parsed = new URL(request.url ?? '/', 'http://127.0.0.1');
    let decoded;
    try {
      decoded = decodeURIComponent(parsed.pathname);
    } catch {
      response.writeHead(400).end();
      return;
    }
    const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
    requestedPaths.push(relative);
    if (
      !relative ||
      relative.includes('\\') ||
      relative.split('/').some((part) => part === '' || part === '.' || part === '..')
    ) {
      response.writeHead(404).end();
      return;
    }
    const candidate = path.resolve(staticRoot, ...relative.split('/'));
    if (!candidate.startsWith(`${path.resolve(staticRoot)}${path.sep}`)) {
      response.writeHead(404).end();
      return;
    }
    let information;
    try {
      information = fs.lstatSync(candidate);
    } catch {
      response.writeHead(404).end();
      return;
    }
    if (information.isSymbolicLink() || !information.isFile()) {
      response.writeHead(404).end();
      return;
    }
    const immutable = relative.startsWith('assets/');
    response.writeHead(200, {
      'content-type': contentType(relative),
      'content-length': information.size,
      'cache-control': immutable
        ? 'public, max-age=31536000, immutable'
        : 'no-store',
      'x-content-type-options': 'nosniff',
    });
    fs.createReadStream(candidate).pipe(response);
  });
}

function htmlReferences(html) {
  const result = new Set();
  for (const match of html.matchAll(/\s(?:src|href)=["']([^"'#?]+)[^"']*["']/giu)) {
    const reference = match[1];
    if (reference.startsWith('data:')) {
      continue;
    }
    if (/^(?:[a-z]+:)?\/\//iu.test(reference)) {
      fail(`entry document contains a non-local reference: ${reference}`);
    }
    result.add(reference.replace(/^\/+/, ''));
  }
  return [...result].sort();
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') fail('server did not bind an ephemeral TCP port');
  return address.port;
}

async function close(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
}

function prepare(componentRoot) {
  const resolved = path.resolve(componentRoot);
  const before = snapshot(resolved);
  requireUnderTmp(SMOKE_ROOT, 'smoke root');
  if (fs.existsSync(SMOKE_ROOT)) removeUnderTmp(SMOKE_ROOT, 'smoke root');
  ensureUnderTmpDirectory(SMOKE_ROOT, 'smoke root');
  const staticRoot = path.join(SMOKE_ROOT, 'static');
  const entries = extractFrontend(resolved, staticRoot);
  return { resolved, before, staticRoot, entries };
}

export async function smokeFrontend(componentRoot) {
  const prepared = prepare(componentRoot);
  const requests = [];
  const server = createStaticServer(prepared.staticRoot, requests);
  let port;
  try {
    port = await listen(server);
    const base = `http://127.0.0.1:${port}`;
    const entryResponse = await fetch(`${base}/`);
    if (!entryResponse.ok) fail(`entry request failed with ${entryResponse.status}`);
    const entryText = await entryResponse.text();
    for (const reference of htmlReferences(entryText)) {
      const response = await fetch(`${base}/${reference}`);
      if (!response.ok) fail(`referenced asset failed: ${reference} (${response.status})`);
      if (
        reference.startsWith('assets/') &&
        response.headers.get('cache-control') !== 'public, max-age=31536000, immutable'
      ) {
        fail(`hashed asset lacks immutable cache evidence: ${reference}`);
      }
    }
    for (const entry of prepared.entries) {
      const response = await fetch(`${base}/${entry.path}`);
      if (!response.ok) fail(`static file failed: ${entry.path}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.equals(entry.bytes)) fail(`served bytes drifted: ${entry.path}`);
    }
    const escape = await fetch(`${base}/%2e%2e/package.json`);
    if (escape.status !== 404) fail('escaping/source fallback request must return 404');
  } finally {
    if (server.listening) await close(server);
    const after = snapshot(prepared.resolved);
    if (!sameSnapshot(prepared.before, after)) {
      fail('artifact bytes changed during static smoke');
    }
    removeUnderTmp(SMOKE_ROOT, 'smoke root');
  }
  return { port, requests };
}

async function serveFrontend(componentRoot) {
  const prepared = prepare(componentRoot);
  const requests = [];
  const server = createStaticServer(prepared.staticRoot, requests);
  const port = await listen(server);
  process.stdout.write(`${JSON.stringify({ url: `http://127.0.0.1:${port}/` })}\n`);
  const shutdown = async () => {
    if (server.listening) await close(server);
    const after = snapshot(prepared.resolved);
    removeUnderTmp(SMOKE_ROOT, 'smoke root');
    if (!sameSnapshot(prepared.before, after)) process.exitCode = 1;
  };
  await new Promise((resolve) => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
  });
  await shutdown();
}

async function main(argv) {
  const [command, componentRoot] = argv;
  if (!componentRoot || !['smoke', 'serve'].includes(command)) {
    fail('usage: smoke.mjs smoke|serve <frontend-component-root>');
  }
  if (command === 'smoke') {
    const result = await smokeFrontend(componentRoot);
    process.stdout.write(`frontend artifact smoke passed: ${result.requests.length} requests\n`);
  } else {
    await serveFrontend(componentRoot);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`frontend smoke error: ${error.message}\n`);
    process.exitCode = 1;
  }
}
