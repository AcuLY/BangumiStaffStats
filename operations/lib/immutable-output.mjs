import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { canonicalJsonBytes, deepFreeze } from './canonical-json.mjs';
import { assertSha256, sha256 } from './digest.mjs';
import {
  assertPathIdentity,
  assertSafeRelativePath,
  capturePathIdentity,
  ensureContainedDirectory,
  requireCanonicalPath,
  resolveContainedPath,
} from './path-policy.mjs';

export class ImmutableOutputError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'ImmutableOutputError';
  }
}

function fail(message, cause) {
  throw new ImmutableOutputError(message, cause ? { cause } : undefined);
}

function asBuffer(bytes) {
  if (typeof bytes === 'string') return Buffer.from(bytes, 'utf8');
  if (bytes instanceof Uint8Array) return Buffer.from(bytes);
  throw new TypeError('immutable output bytes must be text or Uint8Array');
}

function fsyncDirectory(directory) {
  const descriptor = fs.openSync(directory, fs.constants.O_RDONLY);
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function unlinkCaptured(candidate, identity) {
  assertPathIdentity(candidate, identity, {
    label: 'temporary immutable output',
    requireSingleLink: identity.links === 1,
  });
  fs.unlinkSync(candidate);
}

export function writeImmutableFile({
  root,
  relativePath,
  bytes,
  expectedSha256,
  mode = 0o400,
}) {
  const canonicalRoot = requireCanonicalPath(root, {
    label: 'immutable output root',
    type: 'directory',
  });
  const safeRelative = assertSafeRelativePath(
    relativePath,
    'immutable output path',
  );
  if (!Number.isInteger(mode) || mode < 0 || mode > 0o777 || (mode & 0o222) !== 0) {
    fail('immutable output mode must be non-writable and within 0000..0777');
  }
  const content = asBuffer(bytes);
  const digest = sha256(content);
  if (expectedSha256 !== undefined && assertSha256(expectedSha256) !== digest) {
    fail('immutable output bytes differ from the expected digest');
  }

  const segments = safeRelative.split('/');
  const name = segments.pop();
  const parent =
    segments.length === 0
      ? canonicalRoot
      : ensureContainedDirectory(canonicalRoot, segments.join('/'));
  const destination = resolveContainedPath(canonicalRoot, safeRelative, {
    label: 'immutable output path',
  });
  const temporary = path.join(
    parent,
    `.bgmss-output-${randomBytes(16).toString('hex')}`,
  );
  let descriptor;
  let temporaryIdentity;
  try {
    descriptor = fs.openSync(
      temporary,
      fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,
      0o600,
    );
    fs.writeFileSync(descriptor, content);
    fs.fsyncSync(descriptor);
    fs.fchmodSync(descriptor, mode);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    temporaryIdentity = capturePathIdentity(temporary, {
      label: 'temporary immutable output',
      includeDigest: true,
      below: canonicalRoot,
    });
    if (temporaryIdentity.sha256 !== digest) {
      fail('temporary immutable output changed before publication');
    }
    try {
      fs.linkSync(temporary, destination);
    } catch (error) {
      if (error?.code === 'EEXIST') {
        fail(`immutable output already exists: ${safeRelative}`, error);
      }
      fail(`immutable output cannot be published: ${safeRelative}`, error);
    }
    unlinkCaptured(temporary, {
      ...temporaryIdentity,
      links: 2,
    });
    temporaryIdentity = undefined;
    fsyncDirectory(parent);
  } catch (error) {
    if (descriptor !== undefined) {
      try {
        fs.closeSync(descriptor);
      } catch {
        // The primary error remains authoritative.
      }
    }
    if (temporaryIdentity && fs.existsSync(temporary)) {
      try {
        unlinkCaptured(temporary, temporaryIdentity);
      } catch {
        // Preserve ambiguous temporary state rather than replacing the primary error.
      }
    }
    if (error instanceof ImmutableOutputError) throw error;
    fail(`immutable output failed: ${safeRelative}`, error);
  }

  const identity = capturePathIdentity(destination, {
    label: 'published immutable output',
    includeDigest: true,
    below: canonicalRoot,
  });
  if (identity.sha256 !== digest || identity.links !== 1) {
    fail('published immutable output identity is not closed');
  }
  if ((identity.mode & 0o222) !== 0) {
    fail('published immutable output is writable');
  }
  return deepFreeze({
    path: destination,
    relativePath: safeRelative,
    sha256: digest,
    size: content.length,
    mode: identity.mode,
  });
}

export function writeCanonicalJsonFile({
  root,
  relativePath,
  value,
  expectedSha256,
  mode = 0o400,
}) {
  return writeImmutableFile({
    root,
    relativePath,
    bytes: canonicalJsonBytes(value),
    expectedSha256,
    mode,
  });
}

export function writeContentAddressedBlob({
  root,
  bytes,
  prefix = 'content-addresses',
  suffix = '',
}) {
  const content = asBuffer(bytes);
  const digest = sha256(content);
  const safePrefix = assertSafeRelativePath(prefix, 'content-address prefix');
  if (typeof suffix !== 'string' || !/^(?:\.[A-Za-z0-9][A-Za-z0-9._-]{0,31})?$/u.test(suffix)) {
    fail('content-address suffix must be empty or one safe extension');
  }
  return writeImmutableFile({
    root,
    relativePath: `${safePrefix}/sha256-${digest.slice('sha256:'.length)}${suffix}`,
    bytes: content,
    expectedSha256: digest,
  });
}

export function assertImmutableFile(candidate, expectedSha256) {
  const identity = capturePathIdentity(candidate, {
    label: 'immutable file',
    includeDigest: true,
  });
  if (identity.links !== 1 || (identity.mode & 0o222) !== 0) {
    fail('immutable file must be single-linked and non-writable');
  }
  if (
    expectedSha256 !== undefined &&
    identity.sha256 !== assertSha256(expectedSha256)
  ) {
    fail('immutable file digest differs from its accepted identity');
  }
  return identity;
}
