import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createInflateRaw } from 'node:zlib';

import { verifyFullArchiveSeal } from './archive.mjs';
import { canonicalJson } from './canonical-json.mjs';
import {
  isStrictlyBelow,
  requireCanonicalPath,
} from './paths.mjs';
import {
  assertSameSeal,
  sealDirectoryTree,
} from './seal.mjs';
import { readJsonStrict } from './strict-json.mjs';

export class ProvenanceAcceptanceError extends Error {}

function fail(message) {
  throw new ProvenanceAcceptanceError(message);
}

const RELEASE_NAME = 'dump-2026-07-21.210441Z.zip';
const RELEASE_URL =
  `https://github.com/bangumi/Archive/releases/download/archive/${RELEASE_NAME}`;
const ARCHIVE_REVISION = '536b2864f8f23ee4ffd171ebfbe4c41fe1be2df1';
const COMMON_REVISION = '6a8442c17143a870357a5ff812362e8b5cfe9f9d';
const COMMON_URL =
  `https://raw.githubusercontent.com/bangumi/common/${COMMON_REVISION}/subject_staffs.yml`;
const RELEASE_DIGEST =
  'sha256:e1120169088407c66a94dacacda4dffaabe0e2e08cbcc8238c880f6c0140dd57';
const LATEST_DIGEST =
  'sha256:f97498acdfff461603f14862b80211707e89250ed55f1883c60051d58b2d9f24';
const COMMON_DIGEST =
  'sha256:0d5ac602157e33114029df611ea9dd46df32997e57c3a361b9e6f92250304394';
const PROVENANCE_DIGEST =
  'sha256:03bc5f971baa71ce7a6bf3a9b8220dd686af5ef5810866c5d8272318c657e904';
const RELEASE_SIZE = 419_054_508;
const LATEST_SIZE = 539;
const COMMON_SIZE = 37_723;

export const OFFICIAL_PROVENANCE_IDENTITY = Object.freeze({
  provenanceDigest: PROVENANCE_DIGEST,
  releaseAssetDigest: RELEASE_DIGEST,
  releaseMetadataDigest: LATEST_DIGEST,
  commonDigest: COMMON_DIGEST,
});

const MEMBERS = Object.freeze([
  Object.freeze({
    path: 'character.jsonlines',
    role: 'consumed',
    sha256: 'sha256:21e639f3631b220445046d0d8a2055e4b4546e1bdf769f309432770dc2489763',
    size: 159_005_307,
  }),
  Object.freeze({
    path: 'episode.jsonlines',
    role: 'unconsumed',
    sha256: 'sha256:0d7020de68ba7b4ee838cf5ed30766a9153b429efb45ace4c97c2871832c68e7',
    size: 332_792_564,
  }),
  Object.freeze({
    path: 'person-characters.jsonlines',
    role: 'consumed',
    sha256: 'sha256:a50c3c06ae3ecd275c1fe8d6b4036945fa63d4f68bae350fcf36904338a81833',
    size: 23_060_687,
  }),
  Object.freeze({
    path: 'person-relations.jsonlines',
    role: 'unconsumed',
    sha256: 'sha256:d7b4993d9af733fd34c6de5dcd0e0eca98e64da0623f1b26c5bb040e76262e11',
    size: 8_118_624,
  }),
  Object.freeze({
    path: 'person.jsonlines',
    role: 'consumed',
    sha256: 'sha256:3dcd54652c32614dcd6419009f52626059e7307a92d9cda093f28be3f04c9352',
    size: 69_393_113,
  }),
  Object.freeze({
    path: 'subject-characters.jsonlines',
    role: 'consumed',
    sha256: 'sha256:f5eecc8af7dcbad678ea627fc0672780251d3ab3a2316fc72ee5cd087efbed90',
    size: 27_097_066,
  }),
  Object.freeze({
    path: 'subject-persons.jsonlines',
    role: 'consumed',
    sha256: 'sha256:4b18d140a225be0a5a6899439ad22fd68febb822fa6f3be5c0ca534bc84fd9bb',
    size: 147_319_819,
  }),
  Object.freeze({
    path: 'subject-relations.jsonlines',
    role: 'consumed',
    sha256: 'sha256:7a93957f733c4dfce23f57f19fc9d2b3cdf31c39d2d7d0ec7c55b93172320630',
    size: 73_219_448,
  }),
  Object.freeze({
    path: 'subject.jsonlines',
    role: 'consumed',
    sha256: 'sha256:128844607c9f65decb32444c9ba15596ce041530e5524c77a7877aaefbd43c15',
    size: 914_540_505,
  }),
]);

export const OFFICIAL_PROVENANCE_MANIFEST = Object.freeze({
  archive: Object.freeze({
    asset: Object.freeze({
      contentType: 'application/zip',
      members: MEMBERS,
      name: RELEASE_NAME,
      path: RELEASE_NAME,
      sha256: RELEASE_DIGEST,
      size: RELEASE_SIZE,
      url: RELEASE_URL,
    }),
    latest: Object.freeze({
      path: 'aux/latest.json',
      sha256: LATEST_DIGEST,
      size: LATEST_SIZE,
    }),
    revision: ARCHIVE_REVISION,
  }),
  common: Object.freeze({
    revision: COMMON_REVISION,
    subjectStaffs: Object.freeze({
      path: 'subject_staffs.yml',
      sha256: COMMON_DIGEST,
      size: COMMON_SIZE,
      url: COMMON_URL,
    }),
  }),
  kind: 'bgmss-official-archive-provenance',
  schemaVersion: 1,
});

const EXPECTED_LATEST = Object.freeze({
  browser_download_url: RELEASE_URL,
  content_type: 'application/zip',
  created_at: '2026-07-21T21:04:41Z',
  digest: RELEASE_DIGEST,
  id: 485_155_893,
  label: '',
  name: RELEASE_NAME,
  node_id: 'RA_kwDOGogJqs4c6uQ1',
  size: RELEASE_SIZE,
  updated_at: '2026-07-21T21:05:00Z',
  url: 'https://api.github.com/repos/bangumi/Archive/releases/assets/485155893',
});

const privateAttestations = new WeakMap();

function treeEntry(seal, relative) {
  const entry = seal.entries.find((candidate) => candidate.path === relative);
  if (!entry) fail(`provenance seal omits ${relative}`);
  return entry;
}

function validateFrozenLayout(seal) {
  const expected = [
    '.',
    'aux',
    'aux/latest.json',
    RELEASE_NAME,
    'provenance.json',
    'subject_staffs.yml',
  ];
  if (
    seal.entries.length !== expected.length ||
    seal.entries.some((entry, index) => entry.path !== expected[index])
  ) {
    fail('provenance root layout is not the exact reviewed closure');
  }
  for (const entry of seal.entries) {
    const expectedMode = entry.kind === 'directory' ? 0o555 : 0o444;
    if (entry.mode !== expectedMode) {
      fail(`provenance ${entry.kind} is not read-only: ${entry.path}`);
    }
  }
}

function assertExactJson(actual, expected, label) {
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    fail(`${label} differs from the exact reviewed document`);
  }
}

function bindArchiveManifest(provenance, archiveAttestation) {
  const archive = archiveAttestation?.manifest;
  if (!archive || typeof archive !== 'object') {
    fail('official provenance requires one admitted full Archive');
  }
  const asset = provenance.archive.asset;
  const common = provenance.common;
  if (
    archive.archiveAssetName !== asset.name ||
    archive.archiveAssetUrl !== asset.url ||
    archive.archiveSize !== asset.size ||
    archive.archiveDigest !== asset.sha256 ||
    archive.commonCommit !== common.revision ||
    archive.commonSubjectStaffsUrl !== common.subjectStaffs.url ||
    archive.commonSize !== common.subjectStaffs.size ||
    archive.commonDigest !== common.subjectStaffs.sha256
  ) {
    fail('Archive manifest is not bound to the official provenance inputs');
  }
  const expectedConsumed = new Map(
    MEMBERS.filter((member) => member.role === 'consumed').map((member) => [
      member.path,
      member,
    ]),
  );
  if (
    !Array.isArray(archive.sourceFiles) ||
    archive.sourceFiles.length !== expectedConsumed.size
  ) {
    fail('Archive manifest does not account for seven consumed release members');
  }
  for (const source of archive.sourceFiles) {
    const expected = expectedConsumed.get(source.name);
    if (
      !expected ||
      source.size !== expected.size ||
      source.digest !== expected.sha256
    ) {
      fail(`Archive source is not bound to official ZIP member ${source.name}`);
    }
    expectedConsumed.delete(source.name);
  }
  if (expectedConsumed.size !== 0) {
    fail('Archive manifest omits an official consumed ZIP member');
  }
}

async function readAt(descriptor, length, position, label) {
  const buffer = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    const { bytesRead } = await descriptor.read(
      buffer,
      offset,
      length - offset,
      position + offset,
    );
    if (bytesRead === 0) fail(`${label} is truncated`);
    offset += bytesRead;
  }
  return buffer;
}

function decodeMemberName(bytes) {
  const name = bytes.toString('utf8');
  if (
    Buffer.from(name, 'utf8').compare(bytes) !== 0 ||
    !/^[A-Za-z0-9-]+\.jsonlines$/u.test(name)
  ) {
    fail('ZIP member name is unsafe or not canonical UTF-8');
  }
  return name;
}

async function parseCentralDirectory(
  descriptor,
  information,
  {
    expectedMembers = MEMBERS,
    expectedArchiveSize = RELEASE_SIZE,
  } = {},
) {
    if (
      !information.isFile() ||
      information.nlink !== 1n ||
      information.size !== BigInt(expectedArchiveSize)
    ) {
      fail('official ZIP identity changed before inspection');
    }
    const tailLength = Math.min(Number(information.size), 65_557);
    const tailOffset = Number(information.size) - tailLength;
    const tail = await readAt(descriptor, tailLength, tailOffset, 'ZIP tail');
    let eocd = -1;
    for (let index = tail.length - 22; index >= 0; index -= 1) {
      if (tail.readUInt32LE(index) === 0x06054b50) {
        eocd = index;
        break;
      }
    }
    if (eocd < 0 || eocd + 22 !== tail.length) {
      fail('ZIP has no exact un-commented end-of-central-directory record');
    }
    const disk = tail.readUInt16LE(eocd + 4);
    const centralDisk = tail.readUInt16LE(eocd + 6);
    const entriesOnDisk = tail.readUInt16LE(eocd + 8);
    const entryCount = tail.readUInt16LE(eocd + 10);
    const centralSize = tail.readUInt32LE(eocd + 12);
    const centralOffset = tail.readUInt32LE(eocd + 16);
    const commentLength = tail.readUInt16LE(eocd + 20);
    const reviewedCentralSize = expectedMembers.reduce(
      (total, member) => total + 46 + Buffer.byteLength(member.path, 'utf8'),
      0,
    );
    if (
      disk !== 0 ||
      centralDisk !== 0 ||
      entriesOnDisk !== expectedMembers.length ||
      entryCount !== expectedMembers.length ||
      centralSize === 0xffffffff ||
      centralOffset === 0xffffffff ||
      commentLength !== 0 ||
      centralSize !== reviewedCentralSize ||
      centralOffset + centralSize !== tailOffset + eocd
    ) {
      fail('ZIP central directory is split, ZIP64, commented, or inconsistent');
    }
    const central = await readAt(
      descriptor,
      centralSize,
      centralOffset,
      'ZIP central directory',
    );
    const entries = [];
    const seen = new Set();
    let cursor = 0;
    while (cursor < central.length) {
      if (
        cursor + 46 > central.length ||
        central.readUInt32LE(cursor) !== 0x02014b50
      ) {
        fail('ZIP central directory entry is malformed');
      }
      const versionMadeBy = central.readUInt16LE(cursor + 4);
      const versionNeeded = central.readUInt16LE(cursor + 6);
      const flags = central.readUInt16LE(cursor + 8);
      const method = central.readUInt16LE(cursor + 10);
      const modifiedTime = central.readUInt16LE(cursor + 12);
      const modifiedDate = central.readUInt16LE(cursor + 14);
      const crc32 = central.readUInt32LE(cursor + 16);
      const compressedSize = central.readUInt32LE(cursor + 20);
      const uncompressedSize = central.readUInt32LE(cursor + 24);
      const nameLength = central.readUInt16LE(cursor + 28);
      const extraLength = central.readUInt16LE(cursor + 30);
      const comment = central.readUInt16LE(cursor + 32);
      const diskStart = central.readUInt16LE(cursor + 34);
      const internalAttributes = central.readUInt16LE(cursor + 36);
      const externalAttributes = central.readUInt32LE(cursor + 38);
      const localOffset = central.readUInt32LE(cursor + 42);
      const end = cursor + 46 + nameLength + extraLength + comment;
      if (
        end > central.length ||
        versionMadeBy !== 20 ||
        versionNeeded !== 20 ||
        flags !== 0x0008 ||
        method !== 8 ||
        compressedSize === 0 ||
        compressedSize === 0xffffffff ||
        uncompressedSize === 0xffffffff ||
        extraLength !== 0 ||
        comment !== 0 ||
        diskStart !== 0 ||
        internalAttributes !== 0 ||
        externalAttributes !== 0
      ) {
        fail('ZIP member uses an unsupported encoding or attribute');
      }
      const name = decodeMemberName(
        central.subarray(cursor + 46, cursor + 46 + nameLength),
      );
      if (seen.has(name)) fail(`ZIP contains duplicate member ${name}`);
      seen.add(name);
      const expected = expectedMembers.find((member) => member.path === name);
      if (!expected) fail(`ZIP contains unreviewed member ${name}`);
      if (uncompressedSize !== expected.size) {
        fail(`ZIP member ${name} has an unexpected uncompressed size`);
      }
      entries.push({
        ...expected,
        compressedSize,
        crc32,
        flags,
        localOffset,
        method,
        modifiedDate,
        modifiedTime,
        name,
      });
      cursor = end;
    }
    if (cursor !== central.length || entries.length !== expectedMembers.length) {
      fail('ZIP central directory does not contain the exact reviewed members');
    }
    for (const expected of expectedMembers) {
      if (!seen.has(expected.path)) fail(`ZIP omits member ${expected.path}`);
    }
    const ordered = [...entries].sort(
      (left, right) => left.localOffset - right.localOffset,
    );
    if (ordered[0]?.localOffset !== 0) {
      fail('ZIP has bytes before its first reviewed local member');
    }
    for (const [index, entry] of ordered.entries()) {
      const local = await readAt(descriptor, 30, entry.localOffset, entry.name);
      if (
        local.readUInt32LE(0) !== 0x04034b50 ||
        local.readUInt16LE(4) !== 20 ||
        local.readUInt16LE(6) !== entry.flags ||
        local.readUInt16LE(8) !== entry.method ||
        local.readUInt16LE(10) !== entry.modifiedTime ||
        local.readUInt16LE(12) !== entry.modifiedDate ||
        local.readUInt32LE(14) !== 0 ||
        local.readUInt32LE(18) !== 0 ||
        local.readUInt32LE(22) !== 0
      ) {
        fail(`ZIP local header differs for ${entry.name}`);
      }
      const localNameLength = local.readUInt16LE(26);
      const localExtraLength = local.readUInt16LE(28);
      if (localExtraLength !== 0) {
        fail(`ZIP local header has unsupported extra data for ${entry.name}`);
      }
      const localName = decodeMemberName(
        await readAt(
          descriptor,
          localNameLength,
          entry.localOffset + 30,
          `${entry.name} local name`,
        ),
      );
      if (localName !== entry.name) fail(`ZIP local name differs for ${entry.name}`);
      entry.dataOffset = entry.localOffset + 30 + localNameLength;
      const descriptorOffset = entry.dataOffset + entry.compressedSize;
      const regionEnd = descriptorOffset + 16;
      const nextOffset =
        index + 1 < ordered.length
          ? ordered[index + 1].localOffset
          : centralOffset;
      if (regionEnd !== nextOffset) {
        fail(`ZIP local region is not exact and contiguous for ${entry.name}`);
      }
      const dataDescriptor = await readAt(
        descriptor,
        16,
        descriptorOffset,
        `${entry.name} descriptor`,
      );
      if (
        dataDescriptor.readUInt32LE(0) !== 0x08074b50 ||
        dataDescriptor.readUInt32LE(4) !== entry.crc32 ||
        dataDescriptor.readUInt32LE(8) !== entry.compressedSize ||
        dataDescriptor.readUInt32LE(12) !== entry.size
      ) {
        fail(`ZIP data descriptor differs for ${entry.name}`);
      }
    }
    return entries;
}

async function digestCompressedMember(descriptor, member) {
  const digest = createHash('sha256');
  let size = 0;
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      size += chunk.length;
      if (size > member.size) {
        callback(new ProvenanceAcceptanceError(
          `ZIP member ${member.name} exceeds its decompression limit`,
        ));
        return;
      }
      digest.update(chunk);
      callback();
    },
  });
  await pipeline(
    descriptor.createReadStream({
      start: member.dataOffset,
      end: member.dataOffset + member.compressedSize - 1,
      autoClose: false,
    }),
    createInflateRaw(),
    sink,
  );
  const sha256 = `sha256:${digest.digest('hex')}`;
  if (size !== member.size || sha256 !== member.sha256) {
    fail(`ZIP member ${member.name} differs from its official identity`);
  }
  return Object.freeze({ name: member.name, sha256, size });
}

export async function verifyReviewedZip({
  zipPath,
  expectedMembers = MEMBERS,
  expectedArchiveSize = RELEASE_SIZE,
}) {
  const descriptor = await fs.promises.open(
    zipPath,
    fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
  );
  try {
    const before = await descriptor.stat({ bigint: true });
    const entries = await parseCentralDirectory(descriptor, before, {
      expectedMembers,
      expectedArchiveSize,
    });
    const facts = [];
    for (const entry of entries) {
      facts.push(await digestCompressedMember(descriptor, entry));
    }
    const after = await descriptor.stat({ bigint: true });
    for (const field of ['dev', 'ino', 'mode', 'nlink', 'size']) {
      if (before[field] !== after[field]) {
        fail('official ZIP identity changed during streamed verification');
      }
    }
    facts.sort((left, right) => left.name.localeCompare(right.name, 'en'));
    return Object.freeze(facts);
  } finally {
    await descriptor.close();
  }
}

export async function attestOfficialProvenance({
  root,
  manifestPath,
  expectedDigest,
  archiveAttestation,
}) {
  await verifyFullArchiveSeal(archiveAttestation);
  const canonicalRoot = requireCanonicalPath(root, {
    label: 'official provenance root',
    type: 'directory',
  });
  const canonicalManifest = requireCanonicalPath(manifestPath, {
    label: 'official provenance manifest',
    type: 'file',
  });
  if (canonicalManifest !== path.join(canonicalRoot, 'provenance.json')) {
    fail('provenance manifest must be the exact file inside its root');
  }
  if (
    canonicalRoot === archiveAttestation.root ||
    isStrictlyBelow(canonicalRoot, archiveAttestation.root) ||
    isStrictlyBelow(archiveAttestation.root, canonicalRoot)
  ) {
    fail('Archive and provenance roots must be disjoint');
  }
  const sourceSeal = await sealDirectoryTree(canonicalRoot);
  validateFrozenLayout(sourceSeal);
  const manifestEntry = treeEntry(sourceSeal, 'provenance.json');
  if (
    expectedDigest !== PROVENANCE_DIGEST ||
    manifestEntry.sha256 !== expectedDigest
  ) {
    fail('provenance manifest digest is not the reviewed identity');
  }
  const source = fs.readFileSync(canonicalManifest, 'utf8');
  const manifest = readJsonStrict(canonicalManifest);
  if (source !== canonicalJson(manifest)) {
    fail('provenance manifest is not canonical JSON');
  }
  assertExactJson(
    manifest,
    OFFICIAL_PROVENANCE_MANIFEST,
    'provenance manifest',
  );
  for (const [relative, size, sha256] of [
    ['aux/latest.json', LATEST_SIZE, LATEST_DIGEST],
    [RELEASE_NAME, RELEASE_SIZE, RELEASE_DIGEST],
    ['subject_staffs.yml', COMMON_SIZE, COMMON_DIGEST],
  ]) {
    const entry = treeEntry(sourceSeal, relative);
    if (entry.size !== size || entry.sha256 !== sha256) {
      fail(`provenance file differs from its reviewed identity: ${relative}`);
    }
  }
  assertExactJson(
    readJsonStrict(path.join(canonicalRoot, 'aux', 'latest.json')),
    EXPECTED_LATEST,
    'pinned latest.json',
  );
  bindArchiveManifest(manifest, archiveAttestation);
  const members = await verifyReviewedZip({
    zipPath: path.join(canonicalRoot, RELEASE_NAME),
  });
  await verifyFullArchiveSeal(archiveAttestation);
  const verifiedSeal = await sealDirectoryTree(canonicalRoot);
  validateFrozenLayout(verifiedSeal);
  assertSameSeal(sourceSeal, verifiedSeal, 'official provenance input');
  const attestation = Object.freeze({
    root: canonicalRoot,
    manifestPath: canonicalManifest,
    identity: Object.freeze({
      ...OFFICIAL_PROVENANCE_IDENTITY,
    }),
    facts: Object.freeze({
      memberCount: members.length,
      members,
      releaseAssetBytes: RELEASE_SIZE,
      releaseMetadataBytes: LATEST_SIZE,
      commonBytes: COMMON_SIZE,
    }),
    sourceSeal,
  });
  privateAttestations.set(attestation, Object.freeze({ sourceSeal }));
  return attestation;
}

export async function verifyOfficialProvenanceSeal(attestation) {
  const privateState = privateAttestations.get(attestation);
  if (!privateState) {
    fail('provenance attestation was not issued by this module');
  }
  const current = await sealDirectoryTree(attestation.root);
  validateFrozenLayout(current);
  assertSameSeal(
    privateState.sourceSeal,
    current,
    'official provenance input',
  );
  return current;
}
