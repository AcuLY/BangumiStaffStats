import fs from 'node:fs';
import path from 'node:path';

import { throwIfAborted } from './abort-context.mjs';
import { canonicalJson } from './canonical-json.mjs';
import { resolveRunRelative } from './paths.mjs';
import { sha256File } from './seal.mjs';

export async function writeEvidence({
  runRoot,
  relative,
  kind,
  value,
  summary,
}) {
  throwIfAborted();
  const absolute = resolveRunRelative(runRoot, relative, 'evidence path');
  fs.mkdirSync(path.dirname(absolute), { recursive: true, mode: 0o700 });
  const bytes = Buffer.isBuffer(value)
    ? value
    : Buffer.from(typeof value === 'string' ? value : canonicalJson(value));
  throwIfAborted();
  fs.writeFileSync(absolute, bytes, { flag: 'wx', mode: 0o600 });
  throwIfAborted();
  return Object.freeze({
    kind,
    path: path.relative(runRoot, absolute).split(path.sep).join('/'),
    sha256: await sha256File(absolute),
    summary,
  });
}

export function commandEvidence(result) {
  return Object.freeze([
    {
      kind: 'logs',
      path: result.stdout.path,
      sha256: result.stdout.sha256,
      summary: `stdout ${result.stdout.bytes} bytes${result.stdout.truncated ? ' truncated' : ''}`,
    },
    {
      kind: 'logs',
      path: result.stderr.path,
      sha256: result.stderr.sha256,
      summary: `stderr ${result.stderr.bytes} bytes${result.stderr.truncated ? ' truncated' : ''}`,
    },
  ]);
}
