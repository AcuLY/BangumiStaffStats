import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { deflateRawSync } from 'node:zlib';

import { canonicalJson } from '../lib/canonical-json.mjs';
import {
  OFFICIAL_PROVENANCE_MANIFEST,
  verifyReviewedZip,
} from '../lib/provenance.mjs';

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1
        ? 0xedb88320 ^ (value >>> 1)
        : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function makeZip(entries) {
  const locals = [];
  const centrals = [];
  let localOffset = 0;
  for (const declaration of entries) {
    const name = Buffer.from(declaration.name, 'utf8');
    const content = Buffer.from(declaration.content);
    const declaredSize = declaration.declaredSize ?? content.length;
    const compressed = deflateRawSync(content);
    const checksum = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0008, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(name.length, 26);
    const descriptor = Buffer.alloc(16);
    descriptor.writeUInt32LE(0x08074b50, 0);
    descriptor.writeUInt32LE(checksum, 4);
    descriptor.writeUInt32LE(compressed.length, 8);
    descriptor.writeUInt32LE(declaredSize, 12);
    const localRecord = Buffer.concat([local, name, compressed, descriptor]);
    locals.push(localRecord);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0008, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(declaredSize, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(localOffset, 42);
    centrals.push(Buffer.concat([central, name]));
    localOffset += localRecord.length;
  }
  const centralDirectory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...locals, centralDirectory, end]);
}

function zipDirectory(bytes) {
  const eocd = bytes.length - 22;
  const centralOffset = bytes.readUInt32LE(eocd + 16);
  const entries = [];
  let cursor = centralOffset;
  while (cursor < eocd) {
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    entries.push({
      centralOffset: cursor,
      localOffset: bytes.readUInt32LE(cursor + 42),
    });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return { centralOffset, entries, eocd };
}

function insertUnindexedByte(bytes, position) {
  const before = zipDirectory(bytes);
  const changed = Buffer.concat([
    bytes.subarray(0, position),
    Buffer.from([0]),
    bytes.subarray(position),
  ]);
  const eocd = before.eocd + 1;
  changed.writeUInt32LE(before.centralOffset + 1, eocd + 16);
  for (const entry of before.entries) {
    const central = entry.centralOffset + 1;
    if (entry.localOffset >= position) {
      changed.writeUInt32LE(entry.localOffset + 1, central + 42);
    }
  }
  return changed;
}

function member(name, content, overrides = {}) {
  const bytes = Buffer.from(content);
  return {
    path: name,
    role: 'consumed',
    sha256: sha256(bytes),
    size: bytes.length,
    ...overrides,
  };
}

test('official provenance manifest remains one deterministic closed document', () => {
  assert.equal(
    sha256(Buffer.from(canonicalJson(OFFICIAL_PROVENANCE_MANIFEST))),
    'sha256:03bc5f971baa71ce7a6bf3a9b8220dd686af5ef5810866c5d8272318c657e904',
  );
  assert.equal(OFFICIAL_PROVENANCE_MANIFEST.archive.asset.members.length, 9);
  assert.deepEqual(
    OFFICIAL_PROVENANCE_MANIFEST.archive.asset.members
      .filter((entry) => entry.role === 'unconsumed')
      .map((entry) => entry.path),
    ['episode.jsonlines', 'person-relations.jsonlines'],
  );
});

test('safe ZIP reader streams reviewed members and rejects extra, duplicate, traversal, and digest changes', async (t) => {
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), 'bgmss-provenance-zip-')),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  async function verify(name, entries, expectedMembers) {
    const zipPath = path.join(root, `${name}.zip`);
    const bytes = makeZip(entries);
    fs.writeFileSync(zipPath, bytes);
    return verifyReviewedZip({
      zipPath,
      expectedArchiveSize: bytes.length,
      expectedMembers,
    });
  }

  const acceptedEntries = [
    { name: 'alpha.jsonlines', content: 'alpha\n' },
    { name: 'beta.jsonlines', content: 'beta\n' },
  ];
  const acceptedMembers = acceptedEntries.map((entry) =>
    member(entry.name, entry.content),
  );
  assert.deepEqual(
    await verify('accepted', acceptedEntries, acceptedMembers),
    acceptedMembers.map((entry) => ({
      name: entry.path,
      sha256: entry.sha256,
      size: entry.size,
    })),
  );
  await assert.rejects(
    verify('extra', acceptedEntries, acceptedMembers.slice(0, 1)),
    /central directory/u,
  );
  await assert.rejects(
    verify(
      'duplicate',
      [
        { name: 'alpha.jsonlines', content: 'alpha\n' },
        { name: 'alpha.jsonlines', content: 'again\n' },
      ],
      [member('alpha.jsonlines', 'alpha\n'), member('alpha.jsonlines', 'again\n')],
    ),
    /duplicate member/u,
  );
  await assert.rejects(
    verify(
      'traversal',
      [{ name: '../evil.jsonlines', content: 'evil\n' }],
      [member('../evil.jsonlines', 'evil\n')],
    ),
    /member name is unsafe/u,
  );
  await assert.rejects(
    verify(
      'digest',
      [{ name: 'alpha.jsonlines', content: 'alpha\n' }],
      [member('alpha.jsonlines', 'alpha\n', { sha256: sha256('different') })],
    ),
    /differs from its official identity/u,
  );

  const oneEntry = [{ name: 'alpha.jsonlines', content: 'alpha\n' }];
  const oneMember = [member('alpha.jsonlines', 'alpha\n')];
  const baseline = makeZip(oneEntry);
  for (const [name, offset, value] of [
    ['local-crc', 14, 1],
    ['local-size', 18, 1],
    ['local-time', 10, 1],
  ]) {
    const changed = Buffer.from(baseline);
    changed.writeUInt32LE(value, offset);
    const zipPath = path.join(root, `${name}.zip`);
    fs.writeFileSync(zipPath, changed);
    await assert.rejects(
      verifyReviewedZip({
        zipPath,
        expectedArchiveSize: changed.length,
        expectedMembers: oneMember,
      }),
      /local header differs/u,
    );
  }
  const oversizedCentral = Buffer.from(baseline);
  oversizedCentral.writeUInt32LE(
    0xffffffff,
    oversizedCentral.length - 22 + 12,
  );
  const oversizedPath = path.join(root, 'oversized-central.zip');
  fs.writeFileSync(oversizedPath, oversizedCentral);
  await assert.rejects(
    verifyReviewedZip({
      zipPath: oversizedPath,
      expectedArchiveSize: oversizedCentral.length,
      expectedMembers: oneMember,
    }),
    /central directory/u,
  );
  const prefix = insertUnindexedByte(baseline, 0);
  const prefixPath = path.join(root, 'prefix.zip');
  fs.writeFileSync(prefixPath, prefix);
  await assert.rejects(
    verifyReviewedZip({
      zipPath: prefixPath,
      expectedArchiveSize: prefix.length,
      expectedMembers: oneMember,
    }),
    /before its first/u,
  );
  const twoEntryBaseline = makeZip(acceptedEntries);
  const secondOffset = zipDirectory(twoEntryBaseline).entries[1].localOffset;
  const gap = insertUnindexedByte(twoEntryBaseline, secondOffset);
  const gapPath = path.join(root, 'gap.zip');
  fs.writeFileSync(gapPath, gap);
  await assert.rejects(
    verifyReviewedZip({
      zipPath: gapPath,
      expectedArchiveSize: gap.length,
      expectedMembers: acceptedMembers,
    }),
    /not exact and contiguous/u,
  );
  await assert.rejects(
    verify(
      'bomb',
      [{ name: 'alpha.jsonlines', content: 'alpha\n'.repeat(128), declaredSize: 4 }],
      [member('alpha.jsonlines', 'xxxx')],
    ),
    /decompression limit/u,
  );
});
