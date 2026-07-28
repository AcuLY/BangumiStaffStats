import fs from 'node:fs';
import path from 'node:path';

import { deepFreeze } from './canonical-json.mjs';
import { sha256File } from './digest.mjs';

export class PathPolicyError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'PathPolicyError';
  }
}

function fail(message, cause) {
  throw new PathPolicyError(message, cause ? { cause } : undefined);
}

function containsControl(value) {
  return /[\u0000-\u001f\u007f]/u.test(value);
}

export function assertAbsoluteNormalizedPath(value, label = 'path') {
  if (
    typeof value !== 'string' ||
    value.length < 2 ||
    value.length > 4096 ||
    !path.posix.isAbsolute(value) ||
    value.includes('\\') ||
    containsControl(value) ||
    value.endsWith('/') ||
    path.posix.normalize(value) !== value ||
    value.split('/').some((part) => part === '.' || part === '..')
  ) {
    fail(`${label} must be an absolute normalized POSIX path below /`);
  }
  return value;
}

export function assertSafeRelativePath(value, label = 'path') {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 4096 ||
    path.posix.isAbsolute(value) ||
    value.includes('\\') ||
    containsControl(value) ||
    path.posix.normalize(value) !== value
  ) {
    fail(`${label} must be normalized relative POSIX text`);
  }
  const segments = value.split('/');
  if (
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === '.' ||
        segment === '..' ||
        !/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/u.test(segment),
    )
  ) {
    fail(`${label} contains an unsafe path segment`);
  }
  return value;
}

export function isStrictlyContained(candidate, root) {
  const normalizedCandidate = path.resolve(candidate);
  const normalizedRoot = path.resolve(root);
  return (
    normalizedCandidate !== normalizedRoot &&
    normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`)
  );
}

export function assertNoSymlinkTraversal(candidate, label = 'path') {
  const absolute = path.resolve(assertAbsoluteNormalizedPath(candidate, label));
  if (absolute !== candidate) fail(`${label} must already be normalized`);
  const parsed = path.parse(absolute);
  let current = parsed.root;
  for (const segment of absolute
    .slice(parsed.root.length)
    .split(path.sep)
    .filter(Boolean)) {
    current = path.join(current, segment);
    let information;
    try {
      information = fs.lstatSync(current);
    } catch (error) {
      if (error?.code === 'ENOENT') return absolute;
      fail(`${label} ancestor cannot be inspected`, error);
    }
    if (information.isSymbolicLink()) {
      fail(`${label} traverses symbolic link ${current}`);
    }
  }
  return absolute;
}

export function requireCanonicalPath(
  candidate,
  {
    label = 'path',
    type = 'any',
    below,
    allowMissing = false,
    requireSingleLink = false,
  } = {},
) {
  const absolute = assertNoSymlinkTraversal(candidate, label);
  if (below) {
    const canonicalBoundary = fs.realpathSync.native(
      assertNoSymlinkTraversal(
        assertAbsoluteNormalizedPath(path.resolve(below), `${label} boundary`),
        `${label} boundary`,
      ),
    );
    if (!isStrictlyContained(absolute, canonicalBoundary)) {
      fail(`${label} must be strictly below ${canonicalBoundary}`);
    }
  }

  let information;
  try {
    information = fs.lstatSync(absolute);
  } catch (error) {
    if (allowMissing && error?.code === 'ENOENT') return absolute;
    fail(`${label} cannot be inspected`, error);
  }
  if (information.isSymbolicLink()) fail(`${label} must not be a symbolic link`);
  const canonical = fs.realpathSync.native(absolute);
  if (canonical !== absolute) fail(`${label} must use its canonical spelling`);
  if (type === 'file' && !information.isFile()) {
    fail(`${label} must be a regular file`);
  }
  if (type === 'directory' && !information.isDirectory()) {
    fail(`${label} must be a directory`);
  }
  if (
    type === 'any' &&
    !information.isFile() &&
    !information.isDirectory()
  ) {
    fail(`${label} must be a regular file or directory`);
  }
  if (requireSingleLink && information.isFile() && information.nlink !== 1) {
    fail(`${label} must have exactly one hard link`);
  }
  return canonical;
}

export function resolveContainedPath(
  root,
  relative,
  { label = 'contained path', allowMissing = true } = {},
) {
  const canonicalRoot = requireCanonicalPath(root, {
    label: `${label} root`,
    type: 'directory',
  });
  const safeRelative = assertSafeRelativePath(relative, label);
  const candidate = path.resolve(canonicalRoot, ...safeRelative.split('/'));
  if (!isStrictlyContained(candidate, canonicalRoot)) {
    fail(`${label} escapes its root`);
  }
  assertNoSymlinkTraversal(candidate, label);
  if (!allowMissing) {
    requireCanonicalPath(candidate, {
      label,
      below: canonicalRoot,
    });
  }
  return candidate;
}

export function ensureContainedDirectory(root, relative, mode = 0o700) {
  const canonicalRoot = requireCanonicalPath(root, {
    label: 'directory root',
    type: 'directory',
  });
  const safeRelative = assertSafeRelativePath(relative, 'directory path');
  let current = canonicalRoot;
  for (const segment of safeRelative.split('/')) {
    current = path.join(current, segment);
    try {
      fs.mkdirSync(current, { mode });
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        fail(`cannot create contained directory ${current}`, error);
      }
    }
    requireCanonicalPath(current, {
      label: 'contained directory',
      type: 'directory',
      below: canonicalRoot,
    });
  }
  return current;
}

function pathType(information) {
  if (information.isFile()) return 'file';
  if (information.isDirectory()) return 'directory';
  if (information.isSymbolicLink()) return 'symlink';
  return 'special';
}

export function capturePathIdentity(
  candidate,
  { label = 'path identity', includeDigest = false, below } = {},
) {
  const canonical = requireCanonicalPath(candidate, {
    label,
    below,
    requireSingleLink: includeDigest,
  });
  const information = fs.lstatSync(canonical, { bigint: true });
  const type = pathType(information);
  if (type === 'special' || type === 'symlink') {
    fail(`${label} cannot identify a special file or symbolic link`);
  }
  if (includeDigest && type !== 'file') {
    fail(`${label} digest requires a regular file`);
  }
  return deepFreeze({
    path: canonical,
    type,
    device: String(information.dev),
    inode: String(information.ino),
    mode: Number(information.mode & 0o7777n),
    links: Number(information.nlink),
    size: Number(information.size),
    modifiedNs: String(information.mtimeNs),
    ...(includeDigest ? { sha256: sha256File(canonical) } : {}),
  });
}

export function assertPathIdentity(
  candidate,
  expected,
  { label = 'path identity', includeDigest = Object.hasOwn(expected, 'sha256') } = {},
) {
  const actual = capturePathIdentity(candidate, {
    label,
    includeDigest,
  });
  const keys = Object.keys(expected).sort();
  if (
    keys.length !== Object.keys(actual).length ||
    keys.some((key) => actual[key] !== expected[key])
  ) {
    fail(`${label} changed after it was captured`);
  }
  return actual;
}
