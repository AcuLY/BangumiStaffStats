import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createGunzip } from 'node:zlib';

import { assertSafeRelativePath, requireCanonicalPath } from '../lib/path-policy.mjs';
import { sha256File } from '../lib/digest.mjs';
import { deepFreeze } from '../lib/canonical-json.mjs';

const BLOCK = 512;
const ZERO_BLOCK = Buffer.alloc(BLOCK);
const MAX_ARCHIVE_SIZE = 512 * 1024 * 1024;
const MAX_MEMBER_SIZE = 256 * 1024 * 1024;
const MAX_JSON_BYTES = 4 * 1024 * 1024;
const MAX_MEMBER_COUNT = 8192;
const MAX_USTAR_MTIME = 0o77_777_777_777;
const DEFAULT_HEADER_POLICY = deepFreeze({
  allowedDirectories: [],
  expectedMtime: 0,
});

export class ReleaseTarError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'ReleaseTarError';
  }
}

function fail(message, cause) {
  throw new ReleaseTarError(message, cause ? { cause } : undefined);
}

export function assertTarExpansionBounds({
  expandedBytes,
  memberCount,
}) {
  if (
    !Number.isSafeInteger(expandedBytes) ||
    expandedBytes < 0 ||
    expandedBytes > MAX_ARCHIVE_SIZE
  ) {
    fail('tar exceeds the expanded-byte bound');
  }
  if (
    !Number.isSafeInteger(memberCount) ||
    memberCount < 0 ||
    memberCount > MAX_MEMBER_COUNT
  ) {
    fail('tar exceeds the member-count bound');
  }
  return true;
}

function sameFileIdentity(actual, expected) {
  return (
    actual.isFile() &&
    !actual.isSymbolicLink() &&
    actual.dev === expected.dev &&
    actual.ino === expected.ino &&
    actual.nlink === expected.nlink &&
    actual.mode === expected.mode &&
    actual.size === expected.size &&
    actual.mtimeNs === expected.mtimeNs
  );
}

function parseString(buffer, start, length) {
  const field = buffer.subarray(start, start + length);
  const nul = field.indexOf(0);
  const bytes = nul < 0 ? field : field.subarray(0, nul);
  if (bytes.some((value) => value < 0x20 || value > 0x7e)) {
    fail('tar header contains non-ASCII text');
  }
  return bytes.toString('ascii');
}

function parseOctal(buffer, start, length, label) {
  const value = parseString(buffer, start, length).trim();
  if (!/^[0-7]+$/u.test(value)) fail(`tar ${label} is not canonical octal`);
  const parsed = Number.parseInt(value, 8);
  if (!Number.isSafeInteger(parsed)) fail(`tar ${label} is unsafe`);
  return parsed;
}

function headerPolicy({
  allowedDirectories = [],
  expectedMtime = 0,
} = {}) {
  if (
    !Array.isArray(allowedDirectories) ||
    allowedDirectories.length > 32
  ) {
    throw new TypeError('tar allowed directories must be one bounded array');
  }
  const normalized = allowedDirectories.map((entry) =>
    assertSafeRelativePath(entry, 'tar allowed directory'),
  );
  if (new Set(normalized).size !== normalized.length) {
    throw new TypeError('tar allowed directories must be unique');
  }
  if (
    !Number.isSafeInteger(expectedMtime) ||
    expectedMtime < 0 ||
    expectedMtime > MAX_USTAR_MTIME
  ) {
    throw new TypeError('tar expected mtime is outside the USTAR bound');
  }
  return deepFreeze({
    allowedDirectories: normalized,
    expectedMtime,
  });
}

function headerChecksum(header) {
  let total = 0;
  for (let index = 0; index < BLOCK; index += 1) {
    total += index >= 148 && index < 156 ? 0x20 : header[index];
  }
  return total;
}

function parseHeader(header, policy = DEFAULT_HEADER_POLICY) {
  if (header.length !== BLOCK) fail('short tar header');
  if (header.equals(ZERO_BLOCK)) return null;
  const storedChecksum = parseOctal(header, 148, 8, 'checksum');
  if (storedChecksum !== headerChecksum(header)) fail('tar header checksum mismatch');
  const magic = parseString(header, 257, 6);
  const version = parseString(header, 263, 2);
  if (magic !== 'ustar' || version !== '00') {
    fail('release tar must use the USTAR 00 format');
  }
  const name = parseString(header, 0, 100);
  const prefix = parseString(header, 345, 155);
  const rawMemberPath = prefix ? `${prefix}/${name}` : name;
  const typeByte = header[156];
  const directory = typeByte === 0x35;
  const regular = typeByte === 0 || typeByte === 0x30;
  if (!directory && !regular) {
    fail(`tar member has an unsupported type: ${rawMemberPath}`);
  }
  if (
    directory &&
    (!rawMemberPath.endsWith('/') || rawMemberPath.endsWith('//'))
  ) {
    fail(`tar directory member is not canonically terminated: ${rawMemberPath}`);
  }
  const memberPath = directory
    ? rawMemberPath.slice(0, -1)
    : rawMemberPath;
  assertSafeRelativePath(memberPath, 'tar member path');
  if (directory && !policy.allowedDirectories.includes(memberPath)) {
    fail(`tar contains an unadmitted directory member: ${memberPath}`);
  }
  const mode = parseOctal(header, 100, 8, 'mode');
  const uid = parseOctal(header, 108, 8, 'uid');
  const gid = parseOctal(header, 116, 8, 'gid');
  const size = parseOctal(header, 124, 12, 'size');
  const mtime = parseOctal(header, 136, 12, 'mtime');
  if (size > MAX_MEMBER_SIZE) fail(`tar member exceeds size bound: ${memberPath}`);
  if (
    (
      directory
        ? mode !== 0o555 || size !== 0
        : ![0o444, 0o555, 0o644, 0o755].includes(mode)
    ) ||
    uid !== 0 ||
    gid !== 0 ||
    mtime !== policy.expectedMtime
  ) {
    fail(`tar member metadata is not normalized: ${memberPath}`);
  }
  if (
    parseString(header, 157, 100) !== '' ||
    parseString(header, 257 + 8, 32) !== '' ||
    parseString(header, 329, 16) !== ''
  ) {
    fail(`tar member contains link, owner, or device metadata: ${memberPath}`);
  }
  return deepFreeze({
    mode,
    mtime,
    path: memberPath,
    size,
    type: directory ? 'directory' : 'file',
  });
}

function inspectOpenedTar(descriptor, information, policy) {
  const members = [];
  const seen = new Set();
  let offset = 0;
  let zeros = 0;
  while (offset < Number(information.size)) {
    const header = Buffer.alloc(BLOCK);
    const count = fs.readSync(descriptor, header, 0, BLOCK, offset);
    if (count !== BLOCK) fail('tar archive ends inside a header');
    offset += BLOCK;
    const parsed = parseHeader(header, policy);
    if (parsed === null) {
      zeros += 1;
      if (zeros === 2) break;
      continue;
    }
    if (zeros !== 0) fail('tar archive contains an isolated zero block');
    if (seen.has(parsed.path)) fail(`duplicate tar member: ${parsed.path}`);
    seen.add(parsed.path);
    members.push(deepFreeze({ ...parsed, offset }));
    assertTarExpansionBounds({
      expandedBytes: offset,
      memberCount: members.length,
    });
    offset += Math.ceil(parsed.size / BLOCK) * BLOCK;
    if (offset > Number(information.size)) {
      fail(`tar member exceeds archive boundary: ${parsed.path}`);
    }
  }
  if (zeros !== 2) fail('tar archive lacks two terminating zero blocks');
  const trailing = Buffer.alloc(BLOCK);
  while (offset < Number(information.size)) {
    const count = fs.readSync(
      descriptor,
      trailing,
      0,
      Math.min(BLOCK, Number(information.size) - offset),
      offset,
    );
    if (count <= 0) fail('tar trailing bytes cannot be read');
    if (trailing.subarray(0, count).some((byte) => byte !== 0)) {
      fail('tar archive contains non-zero trailing bytes');
    }
    offset += count;
  }
  return deepFreeze(members);
}

export function withInspectedTarFile(archivePath, callback, options) {
  if (typeof callback !== 'function') throw new TypeError('tar callback is required');
  const policy = options === undefined
    ? DEFAULT_HEADER_POLICY
    : headerPolicy(options);
  const archive = requireCanonicalPath(archivePath, {
    label: 'tar archive',
    requireSingleLink: true,
    type: 'file',
  });
  const initial = fs.lstatSync(archive, { bigint: true });
  if (
    !initial.isFile() ||
    initial.isSymbolicLink() ||
    initial.nlink !== 1n ||
    initial.size > BigInt(MAX_ARCHIVE_SIZE)
  ) {
    fail('tar archive identity or size is outside the accepted bound');
  }
  const descriptor = fs.openSync(
    archive,
    fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
  );
  const information = fs.fstatSync(descriptor, { bigint: true });
  if (!sameFileIdentity(information, initial)) {
    fs.closeSync(descriptor);
    fail('tar archive changed before inspection');
  }
  try {
    const members = inspectOpenedTar(descriptor, information, policy);
    const result = callback(
      deepFreeze({ archive, descriptor, identity: information, members }),
    );
    if (result && typeof result.then === 'function') {
      fail('tar inspection callback must be synchronous');
    }
    if (
      !sameFileIdentity(fs.fstatSync(descriptor, { bigint: true }), information) ||
      !sameFileIdentity(fs.lstatSync(archive, { bigint: true }), initial)
    ) {
      fail('tar archive changed during inspection');
    }
    return result;
  } finally {
    fs.closeSync(descriptor);
  }
}

export function inspectTarFile(archivePath) {
  return withInspectedTarFile(archivePath, ({ members }) => members);
}

export function extractTarFile({
  admitMember,
  archivePath,
  destinationRoot,
}) {
  if (typeof admitMember !== 'function') {
    throw new TypeError('tar extraction requires a member admission function');
  }
  const destination = requireCanonicalPath(destinationRoot, {
    label: 'tar extraction root',
    type: 'directory',
  });
  if (fs.readdirSync(destination).length !== 0) {
    fail('tar extraction root must be empty');
  }
  return withInspectedTarFile(
    archivePath,
    ({ descriptor: input, members }) => {
      const admitted = members.map((member) => {
        if (![0o444, 0o555].includes(member.mode)) {
          fail(`handoff tar member mode is not immutable: ${member.path}`);
        }
        const decision = admitMember(member);
        if (decision !== true) {
          fail(`handoff tar member is outside the closed set: ${member.path}`);
        }
        return member;
      });
      const extracted = [];
      const buffer = Buffer.allocUnsafe(1024 * 1024);
      for (const member of admitted) {
        const output = path.join(
          destination,
          ...member.path.split('/'),
        );
        const parent = path.dirname(output);
        fs.mkdirSync(parent, { mode: 0o700, recursive: true });
        requireCanonicalPath(parent, {
          below: destination,
          label: `tar extraction parent ${member.path}`,
          type: 'directory',
        });
        if (fs.existsSync(output)) {
          fail(`tar extraction destination exists: ${member.path}`);
        }
        const temporary = path.join(
          parent,
          `.bgmss-tar-extract-${randomBytes(16).toString('hex')}`,
        );
        const outputDescriptor = fs.openSync(
          temporary,
          fs.constants.O_CREAT |
            fs.constants.O_EXCL |
            fs.constants.O_WRONLY |
            (fs.constants.O_NOFOLLOW ?? 0),
          0o600,
        );
        const hash = createHash('sha256');
        let copied = 0;
        let temporaryIdentity;
        try {
          while (copied < member.size) {
            const count = fs.readSync(
              input,
              buffer,
              0,
              Math.min(buffer.length, member.size - copied),
              member.offset + copied,
            );
            if (count === 0) break;
            const bytes = buffer.subarray(0, count);
            hash.update(bytes);
            let written = 0;
            while (written < count) {
              written += fs.writeSync(
                outputDescriptor,
                bytes,
                written,
                count - written,
              );
            }
            copied += count;
          }
          if (copied !== member.size) {
            fail(`tar member ended early during extraction: ${member.path}`);
          }
          fs.fsyncSync(outputDescriptor);
          fs.fchmodSync(outputDescriptor, member.mode);
          fs.fsyncSync(outputDescriptor);
          temporaryIdentity = fs.fstatSync(outputDescriptor, { bigint: true });
        } finally {
          fs.closeSync(outputDescriptor);
        }
        fs.renameSync(temporary, output);
        const directory = fs.openSync(parent, fs.constants.O_RDONLY);
        try {
          fs.fsyncSync(directory);
        } finally {
          fs.closeSync(directory);
        }
        if (
          !sameFileIdentity(
            fs.lstatSync(output, { bigint: true }),
            temporaryIdentity,
          )
        ) {
          fail(`tar output identity changed during extraction: ${member.path}`);
        }
        extracted.push(
          deepFreeze({
            mode: member.mode === 0o555 ? '0555' : '0444',
            path: member.path,
            sha256: `sha256:${hash.digest('hex')}`,
            size: member.size,
          }),
        );
      }
      return deepFreeze(extracted);
    },
  );
}

function octalField(value, length) {
  const octal = value.toString(8);
  if (octal.length > length - 1) fail('tar numeric field exceeds USTAR bound');
  return Buffer.from(`${octal.padStart(length - 1, '0')}\0`, 'ascii');
}

function assignText(header, offset, length, value) {
  const bytes = Buffer.from(value, 'ascii');
  if (bytes.length > length) fail('tar text field exceeds USTAR bound');
  bytes.copy(header, offset);
}

function splitUstarPath(memberPath) {
  const bytes = Buffer.byteLength(memberPath, 'ascii');
  if (bytes <= 100) return { name: memberPath, prefix: '' };
  const separators = [...memberPath.matchAll(/\//gu)].map((entry) => entry.index);
  for (let index = separators.length - 1; index >= 0; index -= 1) {
    const separator = separators[index];
    const prefix = memberPath.slice(0, separator);
    const name = memberPath.slice(separator + 1);
    if (
      Buffer.byteLength(prefix, 'ascii') <= 155 &&
      Buffer.byteLength(name, 'ascii') <= 100
    ) {
      return { name, prefix };
    }
  }
  fail(`tar path exceeds USTAR bounds: ${memberPath}`);
}

function makeHeader({
  mode,
  mtime = 0,
  path: memberPath,
  size,
  type = 'file',
}) {
  assertSafeRelativePath(memberPath, 'tar output member path');
  if (
    !['directory', 'file'].includes(type) ||
    (type === 'directory'
      ? mode !== 0o555 || size !== 0
      : ![0o444, 0o555].includes(mode)) ||
    !Number.isSafeInteger(mtime) ||
    mtime < 0 ||
    mtime > MAX_USTAR_MTIME
  ) {
    fail('tar output member type or metadata is invalid');
  }
  const { name, prefix } = splitUstarPath(
    type === 'directory' ? `${memberPath}/` : memberPath,
  );
  const header = Buffer.alloc(BLOCK);
  assignText(header, 0, 100, name);
  octalField(mode, 8).copy(header, 100);
  octalField(0, 8).copy(header, 108);
  octalField(0, 8).copy(header, 116);
  octalField(size, 12).copy(header, 124);
  octalField(mtime, 12).copy(header, 136);
  Buffer.from('        ', 'ascii').copy(header, 148);
  header[156] = type === 'directory' ? 0x35 : 0x30;
  assignText(header, 257, 6, 'ustar');
  assignText(header, 263, 2, '00');
  assignText(header, 345, 155, prefix);
  const checksum = headerChecksum(header);
  const checksumText = `${checksum.toString(8).padStart(6, '0')}\0 `;
  assignText(header, 148, 8, checksumText);
  return header;
}

export function writeDeterministicTar({ archivePath, members }) {
  if (!Array.isArray(members) || members.length === 0) {
    throw new TypeError('tar members must be a non-empty array');
  }
  const output = path.resolve(archivePath);
  const parent = requireCanonicalPath(path.dirname(output), {
    label: 'tar output parent',
    type: 'directory',
  });
  if (fs.existsSync(output)) fail('tar output already exists');
  const normalized = members
    .map((member) => {
      const type = member.type ?? 'file';
      const memberPath = assertSafeRelativePath(
        member.path,
        'tar output member',
      );
      const mtime = member.mtime ?? 0;
      if (type === 'directory') {
        if (
          member.source !== undefined ||
          member.mode !== 0o555 ||
          !Number.isSafeInteger(mtime) ||
          mtime < 0 ||
          mtime > MAX_USTAR_MTIME
        ) {
          fail(`tar directory member is invalid: ${memberPath}`);
        }
        return {
          identity: null,
          mode: member.mode,
          mtime,
          path: memberPath,
          size: 0,
          source: null,
          type,
        };
      }
      if (type !== 'file') {
        fail(`tar output member has an unsupported type: ${memberPath}`);
      }
      if (
        !Number.isSafeInteger(mtime) ||
        mtime < 0 ||
        mtime > MAX_USTAR_MTIME
      ) {
        fail(`tar output member mtime is invalid: ${memberPath}`);
      }
      const source = requireCanonicalPath(member.source, {
        label: `tar source ${member.path}`,
        requireSingleLink: true,
        type: 'file',
      });
      const information = fs.lstatSync(source, { bigint: true });
      if (
        !information.isFile() ||
        information.isSymbolicLink() ||
        information.nlink !== 1n ||
        information.size > BigInt(MAX_MEMBER_SIZE)
      ) {
        fail(`tar source identity or size is invalid: ${member.path}`);
      }
      return {
        identity: information,
        mode: member.mode,
        mtime,
        path: memberPath,
        size: Number(information.size),
        source,
        type,
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path, 'en'));
  if (
    normalized.some(
      (member, index) =>
        index > 0 && normalized[index - 1].path === member.path,
    )
  ) {
    fail('tar output members contain duplicate paths');
  }
  if (normalized.length > MAX_MEMBER_COUNT) fail('tar output has too many members');
  const mtimes = new Set(normalized.map((member) => member.mtime));
  if (mtimes.size !== 1) {
    fail('tar output members must use one normalized mtime');
  }
  const projectedSize =
    normalized.reduce(
      (total, member) => total + BLOCK + Math.ceil(member.size / BLOCK) * BLOCK,
      0,
    ) +
    BLOCK * 2;
  if (projectedSize > MAX_ARCHIVE_SIZE) fail('tar output exceeds size bound');
  const temporary = path.join(
    parent,
    `.bgmss-tar-${randomBytes(16).toString('hex')}`,
  );
  const outputDescriptor = fs.openSync(
    temporary,
    fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,
    0o600,
  );
  let temporaryIdentity;
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    for (const member of normalized) {
      fs.writeSync(outputDescriptor, makeHeader(member));
      if (member.type === 'directory') continue;
      const inputDescriptor = fs.openSync(
        member.source,
        fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
      );
      let copied = 0;
      try {
        const opened = fs.fstatSync(inputDescriptor, { bigint: true });
        if (!sameFileIdentity(opened, member.identity)) {
          fail(`tar source changed before read: ${member.path}`);
        }
        while (copied < member.size) {
          const count = fs.readSync(
            inputDescriptor,
            buffer,
            0,
            Math.min(buffer.length, member.size - copied),
            null,
          );
          if (count === 0) break;
          let written = 0;
          while (written < count) {
            written += fs.writeSync(
              outputDescriptor,
              buffer,
              written,
              count - written,
            );
          }
          copied += count;
        }
        if (
          !sameFileIdentity(
            fs.fstatSync(inputDescriptor, { bigint: true }),
            opened,
          ) ||
          !sameFileIdentity(
            fs.lstatSync(member.source, { bigint: true }),
            member.identity,
          )
        ) {
          fail(`tar source changed during read: ${member.path}`);
        }
      } finally {
        fs.closeSync(inputDescriptor);
      }
      if (copied !== member.size) fail(`tar source ended early: ${member.path}`);
      const padding = (BLOCK - (member.size % BLOCK)) % BLOCK;
      if (padding) fs.writeSync(outputDescriptor, ZERO_BLOCK.subarray(0, padding));
    }
    fs.writeSync(outputDescriptor, ZERO_BLOCK);
    fs.writeSync(outputDescriptor, ZERO_BLOCK);
    fs.fsyncSync(outputDescriptor);
    fs.fchmodSync(outputDescriptor, 0o444);
    fs.fsyncSync(outputDescriptor);
    temporaryIdentity = fs.fstatSync(outputDescriptor, { bigint: true });
  } finally {
    fs.closeSync(outputDescriptor);
  }
  fs.renameSync(temporary, output);
  const directory = fs.openSync(parent, fs.constants.O_RDONLY);
  try {
    fs.fsyncSync(directory);
  } finally {
    fs.closeSync(directory);
  }
  if (
    !sameFileIdentity(
      fs.lstatSync(output, { bigint: true }),
      temporaryIdentity,
    )
  ) {
    fail('tar output identity changed during publication');
  }
  const allowedDirectories = normalized
    .filter((member) => member.type === 'directory')
    .map((member) => member.path);
  withInspectedTarFile(
    output,
    () => undefined,
    {
      allowedDirectories,
      expectedMtime: normalized[0].mtime,
    },
  );
  return deepFreeze({
    path: output,
    sha256: sha256File(output),
    size: fs.statSync(output).size,
  });
}

export function writePrefixedTar({
  archivePath,
  prefix,
  sourceArchive,
}) {
  const safePrefix = assertSafeRelativePath(prefix, 'tar member prefix');
  const output = path.resolve(archivePath);
  const parent = requireCanonicalPath(path.dirname(output), {
    label: 'prefixed tar output parent',
    type: 'directory',
  });
  if (fs.existsSync(output)) fail('prefixed tar output already exists');
  const temporary = path.join(
    parent,
    `.bgmss-prefix-tar-${randomBytes(16).toString('hex')}`,
  );
  try {
    return withInspectedTarFile(
      sourceArchive,
      ({ descriptor: input, members }) => {
        const mapped = members.map((member) => ({
          ...member,
          mode: (member.mode & 0o111) === 0 ? 0o444 : 0o555,
          path: `${safePrefix}/${member.path}`,
        }));
        const projected =
          mapped.reduce(
            (total, member) =>
              total + BLOCK + Math.ceil(member.size / BLOCK) * BLOCK,
            0,
          ) +
          BLOCK * 2;
        if (projected > MAX_ARCHIVE_SIZE) fail('prefixed tar exceeds size bound');
        const outputDescriptor = fs.openSync(
          temporary,
          fs.constants.O_CREAT |
            fs.constants.O_EXCL |
            fs.constants.O_WRONLY,
          0o600,
        );
        let temporaryIdentity;
        try {
          const buffer = Buffer.allocUnsafe(1024 * 1024);
          for (const member of mapped) {
            fs.writeSync(outputDescriptor, makeHeader(member));
            let copied = 0;
            while (copied < member.size) {
              const count = fs.readSync(
                input,
                buffer,
                0,
                Math.min(buffer.length, member.size - copied),
                member.offset + copied,
              );
              if (count === 0) break;
              let written = 0;
              while (written < count) {
                written += fs.writeSync(
                  outputDescriptor,
                  buffer,
                  written,
                  count - written,
                );
              }
              copied += count;
            }
            if (copied !== member.size) {
              fail(`prefixed tar member ended early: ${member.path}`);
            }
            const padding = (BLOCK - (member.size % BLOCK)) % BLOCK;
            if (padding) {
              fs.writeSync(outputDescriptor, ZERO_BLOCK.subarray(0, padding));
            }
          }
          fs.writeSync(outputDescriptor, ZERO_BLOCK);
          fs.writeSync(outputDescriptor, ZERO_BLOCK);
          fs.fsyncSync(outputDescriptor);
          fs.fchmodSync(outputDescriptor, 0o444);
          fs.fsyncSync(outputDescriptor);
          temporaryIdentity = fs.fstatSync(outputDescriptor, { bigint: true });
        } finally {
          fs.closeSync(outputDescriptor);
        }
        fs.renameSync(temporary, output);
        const directory = fs.openSync(parent, fs.constants.O_RDONLY);
        try {
          fs.fsyncSync(directory);
        } finally {
          fs.closeSync(directory);
        }
        if (
          !sameFileIdentity(
            fs.lstatSync(output, { bigint: true }),
            temporaryIdentity,
          )
        ) {
          fail('prefixed tar output identity changed during publication');
        }
        return deepFreeze({
          path: output,
          sha256: sha256File(output),
          size: fs.statSync(output).size,
        });
      },
    );
  } catch (error) {
    try {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    } catch {}
    if (error instanceof ReleaseTarError) throw error;
    fail('cannot create prefixed tar', error);
  }
}

export async function extractGzipTarMember({
  allowedDirectories = [],
  archivePath,
  destinationPath,
  expectedMtime = 0,
  memberPath,
  mode = 0o555,
}) {
  const policy = headerPolicy({
    allowedDirectories,
    expectedMtime,
  });
  const archive = requireCanonicalPath(archivePath, {
    label: 'gzip tar archive',
    requireSingleLink: true,
    type: 'file',
  });
  const initialArchive = fs.lstatSync(archive, { bigint: true });
  if (
    !initialArchive.isFile() ||
    initialArchive.isSymbolicLink() ||
    initialArchive.nlink !== 1n ||
    initialArchive.size > BigInt(MAX_ARCHIVE_SIZE)
  ) {
    fail('gzip tar archive identity or size is outside the accepted bound');
  }
  const selected = assertSafeRelativePath(memberPath, 'gzip tar selected member');
  if (![0o444, 0o555].includes(mode)) fail('extracted member mode is invalid');
  const destination = path.resolve(destinationPath);
  const parent = requireCanonicalPath(path.dirname(destination), {
    label: 'extracted member parent',
    type: 'directory',
  });
  if (fs.existsSync(destination)) fail('extracted member destination exists');
  const temporary = path.join(
    parent,
    `.bgmss-extract-${randomBytes(16).toString('hex')}`,
  );
  const output = fs.openSync(
    temporary,
    fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,
    0o600,
  );
  const input = fs.openSync(
    archive,
    fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
  );
  const openedArchive = fs.fstatSync(input, { bigint: true });
  if (!sameFileIdentity(openedArchive, initialArchive)) {
    fs.closeSync(input);
    fs.closeSync(output);
    fs.unlinkSync(temporary);
    fail('gzip tar archive changed before extraction');
  }
  const hash = createHash('sha256');
  let pending = Buffer.alloc(0);
  let current = null;
  let remaining = 0;
  let padding = 0;
  let zeros = 0;
  let selectedCount = 0;
  let selectedSize = 0;
  let expandedBytes = 0;
  const seen = new Map();
  function consume() {
    while (true) {
      if (current) {
        if (remaining > 0) {
          if (pending.length === 0) return;
          const count = Math.min(remaining, pending.length);
          const bytes = pending.subarray(0, count);
          if (current.path === selected) {
            let written = 0;
            while (written < bytes.length) {
              written += fs.writeSync(
                output,
                bytes,
                written,
                bytes.length - written,
              );
            }
            hash.update(bytes);
          }
          pending = pending.subarray(count);
          remaining -= count;
          if (remaining > 0) return;
        }
        if (padding > 0) {
          if (pending.length < padding) return;
          if (pending.subarray(0, padding).some((byte) => byte !== 0)) {
            fail(`gzip tar member has non-zero padding: ${current.path}`);
          }
          pending = pending.subarray(padding);
        }
        current = null;
        padding = 0;
        continue;
      }
      if (zeros >= 2) {
        if (pending.some((byte) => byte !== 0)) {
          fail('gzip tar has non-zero trailing bytes');
        }
        pending = Buffer.alloc(0);
        return;
      }
      if (pending.length < BLOCK) return;
      const header = pending.subarray(0, BLOCK);
      pending = pending.subarray(BLOCK);
      const parsed = parseHeader(header, policy);
      if (parsed === null) {
        zeros += 1;
        continue;
      }
      if (zeros !== 0) fail('gzip tar contains an isolated zero block');
      if (seen.has(parsed.path)) fail(`duplicate gzip tar member: ${parsed.path}`);
      seen.set(parsed.path, parsed.type);
      assertTarExpansionBounds({
        expandedBytes,
        memberCount: seen.size,
      });
      if (parsed.path === selected) {
        if (parsed.type !== 'file') {
          fail(`gzip tar selected member is not a regular file: ${selected}`);
        }
        selectedCount += 1;
        selectedSize = parsed.size;
      }
      current = parsed;
      remaining = parsed.size;
      padding = (BLOCK - (parsed.size % BLOCK)) % BLOCK;
    }
  }
  try {
    const compressed = fs.createReadStream(archive, {
      autoClose: false,
      fd: input,
      start: 0,
    });
    const stream = compressed.pipe(createGunzip());
    for await (const chunk of stream) {
      expandedBytes += chunk.length;
      try {
        assertTarExpansionBounds({
          expandedBytes,
          memberCount: seen.size,
        });
      } catch (error) {
        compressed.destroy();
        stream.destroy();
        throw error;
      }
      pending = pending.length === 0 ? chunk : Buffer.concat([pending, chunk]);
      consume();
    }
    consume();
    if (current || pending.length !== 0 || zeros < 2) {
      fail('gzip tar stream ended before its normalized terminator');
    }
    for (const requiredDirectory of policy.allowedDirectories) {
      if (seen.get(requiredDirectory) !== 'directory') {
        fail(`gzip tar omits required directory: ${requiredDirectory}`);
      }
    }
    if (selectedCount !== 1) fail(`gzip tar does not contain exactly one ${selected}`);
    if (
      !sameFileIdentity(
        fs.fstatSync(input, { bigint: true }),
        openedArchive,
      ) ||
      !sameFileIdentity(
        fs.lstatSync(archive, { bigint: true }),
        initialArchive,
      )
    ) {
      fail('gzip tar archive changed during extraction');
    }
    fs.fsyncSync(output);
    fs.fchmodSync(output, mode);
    fs.fsyncSync(output);
    const temporaryIdentity = fs.fstatSync(output, { bigint: true });
    fs.closeSync(output);
    fs.renameSync(temporary, destination);
    const directory = fs.openSync(parent, fs.constants.O_RDONLY);
    try {
      fs.fsyncSync(directory);
    } finally {
      fs.closeSync(directory);
    }
    if (
      !sameFileIdentity(
        fs.lstatSync(destination, { bigint: true }),
        temporaryIdentity,
      )
    ) {
      fail('extracted member identity changed during publication');
    }
    fs.closeSync(input);
    const information = fs.statSync(destination);
    if (information.size !== selectedSize) fail('extracted member size mismatch');
    return deepFreeze({
      mode: mode === 0o555 ? '0555' : '0444',
      path: destination,
      sha256: `sha256:${hash.digest('hex')}`,
      size: selectedSize,
    });
  } catch (error) {
    try {
      fs.closeSync(output);
    } catch {}
    try {
      fs.closeSync(input);
    } catch {}
    try {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    } catch {}
    if (error instanceof ReleaseTarError) throw error;
    fail('cannot extract gzip tar member', error);
  }
}

export const RELEASE_TAR_LIMITS = deepFreeze({
  archiveBytes: MAX_ARCHIVE_SIZE,
  jsonBytes: MAX_JSON_BYTES,
  memberBytes: MAX_MEMBER_SIZE,
  memberCount: MAX_MEMBER_COUNT,
});
