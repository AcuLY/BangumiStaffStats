#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const INCLUDED = new Set([
  'bin',
  'compose',
  'config',
  'nginx',
  'prometheus',
  'runbooks',
  'systemd',
  'test/runtime',
]);
const SECRET_VALUE = [
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/u,
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/u,
  /\b(?:gh[oprsu]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /\bsk-[A-Za-z0-9_-]{20,}\b/u,
  /:\/\/[^/\s:@]+:[^/\s@]+@/u,
];
const ASSIGNED_SECRET =
  /(?:password|private[_-]?key|registry[_-]?auth|secret|ssh[_-]?key|token)\s*[:=]\s*["']?[^\s"'${][^\s"']*/iu;

function walk(directory) {
  const results = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`secret scan refuses symbolic link ${absolute}`);
    }
    if (entry.isDirectory()) results.push(...walk(absolute));
    else if (entry.isFile()) results.push(absolute);
    else throw new Error(`secret scan refuses special file ${absolute}`);
  }
  return results;
}

const files = [...INCLUDED]
  .flatMap((relative) => {
    const absolute = path.join(ROOT, relative);
    return fs.existsSync(absolute)
      ? fs.statSync(absolute).isDirectory()
        ? walk(absolute)
        : [absolute]
      : [];
  })
  .sort((left, right) => left.localeCompare(right, 'en'));

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  for (const pattern of SECRET_VALUE) {
    if (pattern.test(source)) throw new Error(`secret-shaped value in ${file}`);
  }
  if (ASSIGNED_SECRET.test(source)) {
    throw new Error(`assigned secret-shaped field in ${file}`);
  }
}
