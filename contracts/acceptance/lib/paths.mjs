import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export class PathPolicyError extends Error {}

function fail(message) {
  throw new PathPolicyError(message);
}

export function assertAbsolutePathSyntax(value, label = 'path') {
  if (
    typeof value !== 'string' ||
    value.length < 2 ||
    value.length > 4096 ||
    !path.isAbsolute(value) ||
    /[\u0000-\u001f\u007f]/u.test(value) ||
    value.includes('\\') ||
    value.endsWith('/') ||
    path.posix.normalize(value) !== value ||
    value.split('/').some((part) => part === '.' || part === '..')
  ) {
    fail(`${label} must be an absolute normalized POSIX path`);
  }
  return value;
}

export function assertSafeRelativePath(value, label = 'path') {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 4096 ||
    path.posix.isAbsolute(value) ||
    value.includes('\0') ||
    value.includes('\\')
  ) {
    fail(`${label} must be a normalized relative POSIX path`);
  }
  const parts = value.split('/');
  if (
    parts.some(
      (part) =>
        part === '' ||
        part === '.' ||
        part === '..' ||
        !/^[A-Za-z0-9._-]+$/u.test(part),
    )
  ) {
    fail(`${label} contains an unsafe segment: ${value}`);
  }
  return value;
}

export function isStrictlyBelow(candidate, root) {
  return candidate !== root && candidate.startsWith(`${root}${path.sep}`);
}

export function requireCanonicalPath(
  candidate,
  {
    label = 'path',
    type = 'any',
    below,
    allowMissing = false,
  } = {},
) {
  const requested = path.resolve(assertAbsolutePathSyntax(candidate, label));
  if (requested !== candidate) fail(`${label} must already be normalized`);
  if (below && !isStrictlyBelow(requested, path.resolve(below))) {
    fail(`${label} must be strictly below ${path.resolve(below)}`);
  }
  let information;
  try {
    information = fs.lstatSync(requested);
  } catch (error) {
    if (allowMissing && error?.code === 'ENOENT') return requested;
    fail(`${label} is unavailable: ${error.message}`);
  }
  if (information.isSymbolicLink()) fail(`${label} must not be a symlink`);
  const canonical = fs.realpathSync.native(requested);
  if (canonical !== requested) fail(`${label} must use its canonical path: ${canonical}`);
  if (type === 'file' && !information.isFile()) fail(`${label} must be a regular file`);
  if (type === 'directory' && !information.isDirectory()) {
    fail(`${label} must be a real directory`);
  }
  if (
    type === 'any' &&
    !information.isFile() &&
    !information.isDirectory()
  ) {
    fail(`${label} must be a regular file or directory`);
  }
  assertNoSymlinkAncestors(requested, label);
  return canonical;
}

export function assertNoSymlinkAncestors(candidate, label = 'path') {
  const resolved = path.resolve(candidate);
  const parsed = path.parse(resolved);
  let current = parsed.root;
  for (const part of resolved.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    let information;
    try {
      information = fs.lstatSync(current);
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      fail(`${label} ancestor is unavailable: ${current}`);
    }
    if (information.isSymbolicLink()) {
      fail(`${label} traverses symlink ${current}`);
    }
  }
}

export function resolveProspectiveCanonicalPath(
  candidate,
  label = 'path',
) {
  const requested = path.resolve(assertAbsolutePathSyntax(candidate, label));
  if (requested !== candidate) fail(`${label} must already be normalized`);
  assertNoSymlinkAncestors(requested, label);
  const missingParts = [];
  let ancestor = requested;
  while (true) {
    let information;
    try {
      information = fs.lstatSync(ancestor);
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        fail(`${label} ancestor is unavailable: ${ancestor}`);
      }
      const parent = path.dirname(ancestor);
      if (parent === ancestor) {
        fail(`${label} has no available filesystem ancestor`);
      }
      missingParts.unshift(path.basename(ancestor));
      ancestor = parent;
      continue;
    }
    if (information.isSymbolicLink()) {
      fail(`${label} traverses symlink ${ancestor}`);
    }
    if (missingParts.length > 0 && !information.isDirectory()) {
      fail(`${label} descends from a non-directory ${ancestor}`);
    }
    let canonicalAncestor;
    try {
      canonicalAncestor = fs.realpathSync.native(ancestor);
    } catch (error) {
      fail(`${label} ancestor cannot be resolved: ${ancestor}`);
    }
    return path.join(canonicalAncestor, ...missingParts);
  }
}

export function listRegularTree(root, { ignore = new Set() } = {}) {
  const canonicalRoot = requireCanonicalPath(root, {
    label: 'tree root',
    type: 'directory',
  });
  const entries = [];
  function visit(directory, prefix) {
    for (const entry of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (ignore.has(relative)) continue;
      const absolute = path.join(directory, entry.name);
      const information = fs.lstatSync(absolute);
      if (information.isSymbolicLink()) fail(`tree contains symlink ${relative}`);
      if (information.isDirectory()) {
        entries.push({ path: `${relative}/`, mode: information.mode & 0o777 });
        visit(absolute, relative);
      } else if (information.isFile()) {
        entries.push({
          path: relative,
          mode: information.mode & 0o777,
          size: information.size,
        });
      } else {
        fail(`tree contains special file ${relative}`);
      }
    }
  }
  visit(canonicalRoot, '');
  return Object.freeze(entries);
}

export function sha256Bytes(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export function sha256FileSync(filePath) {
  const canonical = requireCanonicalPath(filePath, {
    label: 'digest input',
    type: 'file',
  });
  return sha256Bytes(fs.readFileSync(canonical));
}

export function resolveRunRelative(runRoot, relative, label = 'run path') {
  const safe = assertSafeRelativePath(relative, label);
  const candidate = path.resolve(runRoot, ...safe.split('/'));
  if (!isStrictlyBelow(candidate, path.resolve(runRoot))) {
    fail(`${label} escapes the run root`);
  }
  return candidate;
}
