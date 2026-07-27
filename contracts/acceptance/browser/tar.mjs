import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  assertSafeRelativePath,
  isStrictlyBelow,
  requireCanonicalPath,
  resolveRunRelative,
} from '../lib/paths.mjs';
import { sha256File } from '../lib/seal.mjs';

const BLOCK_BYTES = 512;
const DEFAULT_MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;
const DEFAULT_MAX_EXPANDED_BYTES = 512 * 1024 * 1024;
const DEFAULT_MAX_ENTRIES = 20_000;

export class SafeTarError extends Error {}

function fail(message) {
  throw new SafeTarError(message);
}

function isZeroBlock(block) {
  return block.every((byte) => byte === 0);
}

function fieldText(header, start, length, label) {
  const field = header.subarray(start, start + length);
  const nul = field.indexOf(0);
  const value = field.subarray(0, nul === -1 ? field.length : nul);
  const remainder = nul === -1 ? Buffer.alloc(0) : field.subarray(nul);
  if (remainder.some((byte) => byte !== 0)) {
    fail(`${label} has data after NUL`);
  }
  if (value.some((byte) => byte < 0x20 || byte > 0x7e)) {
    fail(`${label} must be printable ASCII`);
  }
  return value.toString('ascii');
}

function octalField(header, start, length, label) {
  const raw = header
    .subarray(start, start + length)
    .toString('ascii')
    .replaceAll('\0', '')
    .trim();
  if (raw === '') return 0;
  if (!/^[0-7]+$/u.test(raw)) fail(`${label} is not an octal integer`);
  const value = Number.parseInt(raw, 8);
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(`${label} is outside the safe integer range`);
  }
  return value;
}

function verifyHeaderChecksum(header, label) {
  const expected = octalField(header, 148, 8, `${label} checksum`);
  let actual = 0;
  for (let index = 0; index < header.length; index += 1) {
    actual += index >= 148 && index < 156 ? 0x20 : header[index];
  }
  if (actual !== expected) fail(`${label} checksum mismatch`);
}

function validatePaxComment(payload, expectedRevision) {
  if (!expectedRevision) fail('PAX metadata is forbidden');
  const text = payload.toString('utf8');
  if (Buffer.from(text, 'utf8').length !== payload.length) {
    fail('Git PAX comment is not valid UTF-8');
  }
  const match = /^([1-9][0-9]*) comment=([0-9a-f]{40})\n$/u.exec(text);
  if (!match || match[2] !== expectedRevision) {
    fail('Git PAX comment does not bind the fixed oracle revision');
  }
  if (Number(match[1]) !== payload.length) {
    fail('Git PAX record length is not canonical');
  }
}

function normalizedEntryPath(raw, { stripPrefix, directory }) {
  if (raw.startsWith('/') || raw.includes('\\') || raw.includes('\0')) {
    fail(`archive entry has an unsafe path: ${raw}`);
  }
  let value = raw;
  if (stripPrefix !== undefined) {
    if (!value.startsWith(stripPrefix)) {
      fail(`archive entry is outside the fixed prefix ${stripPrefix}: ${raw}`);
    }
    value = value.slice(stripPrefix.length);
  }
  if (directory) value = value.replace(/\/+$/u, '');
  if (value === '') return null;
  try {
    assertSafeRelativePath(value, 'archive entry path');
  } catch (error) {
    fail(error.message);
  }
  return value;
}

function parseTar(
  bytes,
  {
    allowGitPaxRevision,
    maxEntries,
    maxExpandedBytes,
    stripPrefix,
  },
) {
  if (!Buffer.isBuffer(bytes)) fail('archive bytes must be a Buffer');
  if (bytes.length === 0 || bytes.length % BLOCK_BYTES !== 0) {
    fail('archive must contain complete 512-byte records');
  }
  const entries = [];
  const paths = new Map();
  let expandedBytes = 0;
  let offset = 0;
  let zeroBlocks = 0;
  let sawGitPax = false;
  while (offset < bytes.length) {
    const header = bytes.subarray(offset, offset + BLOCK_BYTES);
    if (isZeroBlock(header)) {
      zeroBlocks += 1;
      offset += BLOCK_BYTES;
      if (zeroBlocks === 2) break;
      continue;
    }
    if (zeroBlocks !== 0) fail('archive has a single zero block before data');
    if (header.length !== BLOCK_BYTES) fail('archive header is truncated');
    const label = `archive header ${entries.length + 1}`;
    verifyHeaderChecksum(header, label);
    const magic = header.subarray(257, 263).toString('binary');
    if (magic !== 'ustar\0' && magic !== 'ustar ') {
      fail(`${label} is not a POSIX ustar header`);
    }
    const name = fieldText(header, 0, 100, `${label} name`);
    const prefix = fieldText(header, 345, 155, `${label} prefix`);
    const rawPath = prefix ? `${prefix}/${name}` : name;
    const size = octalField(header, 124, 12, `${label} size`);
    const mode = octalField(header, 100, 8, `${label} mode`);
    const typeByte = header[156];
    const type = typeByte === 0 ? '0' : String.fromCharCode(typeByte);
    const linkName = fieldText(header, 157, 100, `${label} link name`);
    const payloadStart = offset + BLOCK_BYTES;
    const payloadEnd = payloadStart + size;
    const nextOffset =
      payloadStart + Math.ceil(size / BLOCK_BYTES) * BLOCK_BYTES;
    if (payloadEnd > bytes.length || nextOffset > bytes.length) {
      fail(`${label} payload is truncated`);
    }
    const payload = bytes.subarray(payloadStart, payloadEnd);

    if (type === 'g') {
      if (
        sawGitPax ||
        entries.length !== 0 ||
        rawPath !== 'pax_global_header' ||
        linkName !== ''
      ) {
        fail('only one leading fixed Git PAX comment is permitted');
      }
      validatePaxComment(payload, allowGitPaxRevision);
      sawGitPax = true;
      offset = nextOffset;
      continue;
    }
    if (linkName !== '') fail(`${label} contains a forbidden link target`);
    if (type !== '0' && type !== '5') {
      fail(`${label} has forbidden tar entry type ${JSON.stringify(type)}`);
    }
    if (type === '5' && size !== 0) {
      fail(`${label} directory entry has a payload`);
    }
    const relative = normalizedEntryPath(rawPath, {
      stripPrefix,
      directory: type === '5',
    });
    if (relative !== null) {
      if (paths.has(relative)) fail(`archive has duplicate path ${relative}`);
      for (const existing of paths.keys()) {
        if (
          existing.startsWith(`${relative}/`) ||
          relative.startsWith(`${existing}/`) &&
            paths.get(existing) === 'file'
        ) {
          fail(`archive path collides with another entry: ${relative}`);
        }
      }
      paths.set(relative, type === '5' ? 'directory' : 'file');
      if (type === '0') {
        expandedBytes += size;
        if (expandedBytes > maxExpandedBytes) {
          fail('archive exceeds the expanded-byte limit');
        }
      }
      entries.push(
        Object.freeze({
          kind: type === '5' ? 'directory' : 'file',
          mode,
          payload,
          path: relative,
          size,
        }),
      );
      if (entries.length > maxEntries) fail('archive has too many entries');
    }
    offset = nextOffset;
  }
  if (zeroBlocks < 2) fail('archive has no canonical two-block terminator');
  if (bytes.subarray(offset).some((byte) => byte !== 0)) {
    fail('archive contains data after its terminator');
  }
  return Object.freeze({
    entries: Object.freeze(entries),
    expandedBytes,
    gitPaxRevision: sawGitPax ? allowGitPaxRevision : null,
  });
}

function mkdirContained(root, relative) {
  const segments = relative.split('/');
  let current = root;
  for (const segment of segments) {
    current = path.join(current, segment);
    if (!isStrictlyBelow(current, root)) fail('output directory escaped its root');
    try {
      fs.mkdirSync(current, { mode: 0o700 });
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const information = fs.lstatSync(current);
      if (!information.isDirectory() || information.isSymbolicLink()) {
        fail(`output parent is not a real directory: ${relative}`);
      }
    }
  }
}

function writeParsedTar(parsed, outputRoot, { preserveExecutable }) {
  fs.mkdirSync(outputRoot, { mode: 0o700 });
  const rootInformation = fs.lstatSync(outputRoot);
  if (!rootInformation.isDirectory() || rootInformation.isSymbolicLink()) {
    fail('archive output root is not a real directory');
  }
  for (const entry of parsed.entries) {
    const absolute = path.join(outputRoot, ...entry.path.split('/'));
    if (!isStrictlyBelow(absolute, outputRoot)) {
      fail(`archive output escaped its root: ${entry.path}`);
    }
    if (entry.kind === 'directory') {
      mkdirContained(outputRoot, entry.path);
      continue;
    }
    const parent = path.posix.dirname(entry.path);
    if (parent !== '.') mkdirContained(outputRoot, parent);
    const flags =
      fs.constants.O_CREAT |
      fs.constants.O_EXCL |
      fs.constants.O_WRONLY |
      (fs.constants.O_NOFOLLOW ?? 0);
    const descriptor = fs.openSync(absolute, flags, 0o600);
    try {
      fs.writeFileSync(descriptor, entry.payload);
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    fs.chmodSync(
      absolute,
      preserveExecutable && (entry.mode & 0o111) !== 0 ? 0o700 : 0o600,
    );
  }
}

export function extractTarBuffer({
  allowGitPaxRevision,
  bytes,
  maxEntries = DEFAULT_MAX_ENTRIES,
  maxExpandedBytes = DEFAULT_MAX_EXPANDED_BYTES,
  outputRelative,
  preserveExecutable = false,
  runRoot,
  stripPrefix,
}) {
  const canonicalRunRoot = requireCanonicalPath(runRoot, {
    label: 'browser run root',
    type: 'directory',
  });
  const outputRoot = resolveRunRelative(
    canonicalRunRoot,
    outputRelative,
    'archive output path',
  );
  if (fs.existsSync(outputRoot)) fail('archive output path already exists');
  const parsed = parseTar(bytes, {
    allowGitPaxRevision,
    maxEntries,
    maxExpandedBytes,
    stripPrefix,
  });
  const outputParent = path.posix.dirname(outputRelative);
  if (outputParent !== '.') mkdirContained(canonicalRunRoot, outputParent);
  writeParsedTar(parsed, outputRoot, { preserveExecutable });
  return Object.freeze({
    archiveDigest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    entries: Object.freeze(
      parsed.entries.map(({ kind, mode, path: relative, size }) =>
        Object.freeze({ kind, mode, path: relative, size }),
      ),
    ),
    expandedBytes: parsed.expandedBytes,
    gitPaxRevision: parsed.gitPaxRevision,
    outputRoot,
  });
}

export async function extractTarFile({
  archivePath,
  maxArchiveBytes = DEFAULT_MAX_ARCHIVE_BYTES,
  ...options
}) {
  const canonicalArchive = requireCanonicalPath(archivePath, {
    label: 'frontend archive',
    type: 'file',
  });
  const information = fs.lstatSync(canonicalArchive);
  if (information.nlink !== 1) fail('frontend archive must not be hard-linked');
  if (information.size <= 0 || information.size > maxArchiveBytes) {
    fail('frontend archive size is outside the accepted bound');
  }
  const before = await sha256File(canonicalArchive);
  const result = extractTarBuffer({
    ...options,
    bytes: fs.readFileSync(canonicalArchive),
  });
  const after = await sha256File(canonicalArchive);
  if (before !== after || before !== result.archiveDigest) {
    fail('frontend archive changed while it was extracted');
  }
  return Object.freeze({ ...result, sourceDigest: before });
}
