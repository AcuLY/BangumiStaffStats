import { createHash } from 'node:crypto';
import fs from 'node:fs';

export const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
export const GIT_OID_PATTERN = /^[0-9a-f]{40}$/u;

export class DigestError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'DigestError';
  }
}

function asBytes(value, label) {
  if (typeof value === 'string' || value instanceof Uint8Array) return value;
  throw new TypeError(`${label} must be a string or Uint8Array`);
}

function fileIdentity(information) {
  return {
    device: String(information.dev),
    inode: String(information.ino),
    links: Number(information.nlink),
    mode: String(information.mode),
    modifiedNs: String(information.mtimeNs),
    size: String(information.size),
    type: information.isFile() ? 'file' : 'other',
  };
}

function assertDigestFileIdentity(actual, expected) {
  if (
    Object.keys(expected).some((key) => actual[key] !== expected[key])
  ) {
    throw new DigestError('digest input identity changed while it was read');
  }
}

export function sha256(value) {
  return `sha256:${createHash('sha256').update(asBytes(value, 'digest input')).digest('hex')}`;
}

export function sha256File(filePath) {
  const initialInformation = fs.lstatSync(filePath, { bigint: true });
  if (!initialInformation.isFile() || initialInformation.isSymbolicLink()) {
    throw new DigestError('digest input must be a real regular file');
  }
  if (initialInformation.nlink !== 1n) {
    throw new DigestError('digest input must not be hard linked');
  }
  const initialIdentity = fileIdentity(initialInformation);
  const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0);
  let descriptor;
  try {
    descriptor = fs.openSync(filePath, flags);
    const openedInformation = fs.fstatSync(descriptor, { bigint: true });
    const openedIdentity = fileIdentity(openedInformation);
    assertDigestFileIdentity(openedIdentity, initialIdentity);

    const hash = createHash('sha256');
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let totalBytes = 0n;
    while (totalBytes < openedInformation.size) {
      const remaining = openedInformation.size - totalBytes;
      const requested =
        remaining > BigInt(buffer.length)
          ? buffer.length
          : Number(remaining);
      const bytesRead = fs.readSync(
        descriptor,
        buffer,
        0,
        requested,
        null,
      );
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      totalBytes += BigInt(bytesRead);
    }
    if (totalBytes !== openedInformation.size) {
      throw new DigestError('digest input ended before its captured size');
    }

    assertDigestFileIdentity(
      fileIdentity(fs.fstatSync(descriptor, { bigint: true })),
      openedIdentity,
    );
    assertDigestFileIdentity(
      fileIdentity(fs.lstatSync(filePath, { bigint: true })),
      openedIdentity,
    );
    return `sha256:${hash.digest('hex')}`;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

export function assertSha256(value, label = 'SHA-256 digest') {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new DigestError(`${label} must use sha256:<64 lowercase hex>`);
  }
  return value;
}

export function assertGitOid(value, label = 'Git object ID') {
  if (typeof value !== 'string' || !GIT_OID_PATTERN.test(value)) {
    throw new DigestError(`${label} must be exactly 40 lowercase hex characters`);
  }
  return value;
}
