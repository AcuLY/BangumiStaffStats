import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { canonicalJsonDigest, deepFreeze } from '../lib/canonical-json.mjs';
import { sha256File } from '../lib/digest.mjs';
import {
  assertSafeRelativePath,
  ensureContainedDirectory,
  requireCanonicalPath,
  resolveContainedPath,
} from '../lib/path-policy.mjs';
import { readCanonicalJson } from '../lib/strict-json.mjs';
import { verifyCandidateStructure } from '../release/verify-candidate-lib.mjs';
import { withInspectedTarFile } from '../release/tar.mjs';
import {
  EXACT_HANDOFF_FILES,
  MAXIMUMS,
} from './constants.mjs';

export class SealedHandoffError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'SealedHandoffError';
  }
}

function fail(message, cause) {
  throw new SealedHandoffError(message, cause ? { cause } : undefined);
}

function sameIdentity(left, right) {
  return (
    left.isFile() &&
    !left.isSymbolicLink() &&
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.nlink === right.nlink &&
    left.mode === right.mode &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs
  );
}

function exactDirectoryFiles(root) {
  const entries = fs
    .readdirSync(root, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, 'en'));
  if (
    entries.length !== EXACT_HANDOFF_FILES.length ||
    entries.some(
      (entry, index) =>
        !entry.isFile() ||
        entry.isSymbolicLink() ||
        entry.name !== EXACT_HANDOFF_FILES[index],
    )
  ) {
    fail('downloaded validation handoff must contain exactly three sealed files');
  }
}

function checksumDigest(checksumPath) {
  const source = fs.readFileSync(checksumPath, 'utf8');
  const match =
    /^([0-9a-f]{64})  validation-candidate\.tar\n$/u.exec(source);
  if (!match) fail('validation handoff checksum file is not exact');
  return `sha256:${match[1]}`;
}

function validateCompleteInventory(value) {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !==
      'candidateDocument,candidateKind,contentAddress,fileCount,files,schemaVersion,totalSize' ||
    value.schemaVersion !==
      'operations-candidate-complete-inventory-v1' ||
    value.candidateKind !== 'validation' ||
    value.candidateDocument !== 'validation-candidate-v1.json' ||
    !/^sha256:[0-9a-f]{64}$/u.test(value.contentAddress) ||
    !Number.isInteger(value.fileCount) ||
    value.fileCount < 1 ||
    value.fileCount > MAXIMUMS.fileCount ||
    !Number.isSafeInteger(value.totalSize) ||
    value.totalSize < 1 ||
    value.totalSize > MAXIMUMS.transferTotalBytes ||
    !Array.isArray(value.files) ||
    value.files.length !== value.fileCount
  ) {
    fail('candidate complete inventory has an invalid closed shape');
  }
  let total = 0;
  let previous = '';
  for (const record of value.files) {
    if (
      record === null ||
      typeof record !== 'object' ||
      Array.isArray(record) ||
      Object.keys(record).sort().join(',') !== 'mode,path,sha256,size' ||
      !['0444', '0555'].includes(record.mode) ||
      !/^sha256:[0-9a-f]{64}$/u.test(record.sha256) ||
      !Number.isSafeInteger(record.size) ||
      record.size < 0 ||
      record.size > MAXIMUMS.transferFileBytes
    ) {
      fail('candidate complete inventory contains an invalid file record');
    }
    assertSafeRelativePath(record.path, 'candidate complete inventory path');
    if (previous !== '' && previous.localeCompare(record.path, 'en') >= 0) {
      fail('candidate complete inventory is not unique and path-sorted');
    }
    previous = record.path;
    total += record.size;
  }
  if (
    total !== value.totalSize ||
    canonicalJsonDigest(value.files) !== value.contentAddress
  ) {
    fail('candidate complete inventory content address differs');
  }
  return value;
}

function extractMember({
  archiveDescriptor,
  destination,
  expected,
  member,
}) {
  const safe = assertSafeRelativePath(expected.path, 'candidate member path');
  const segments = safe.split('/');
  const name = segments.pop();
  const parent =
    segments.length === 0
      ? destination
      : ensureContainedDirectory(destination, segments.join('/'), 0o700);
  const outputPath = path.join(parent, name);
  if (fs.existsSync(outputPath) || fs.lstatSync(parent).isSymbolicLink()) {
    fail(`candidate extraction destination exists: ${safe}`);
  }
  const descriptor = fs.openSync(
    outputPath,
    fs.constants.O_CREAT |
      fs.constants.O_EXCL |
      fs.constants.O_WRONLY |
      (fs.constants.O_NOFOLLOW ?? 0),
    0o600,
  );
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  let copied = 0;
  try {
    while (copied < member.size) {
      const count = fs.readSync(
        archiveDescriptor,
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
          descriptor,
          bytes,
          written,
          count - written,
        );
      }
      copied += count;
    }
    fs.fsyncSync(descriptor);
    fs.fchmodSync(descriptor, expected.mode === '0555' ? 0o555 : 0o444);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  if (
    copied !== expected.size ||
    `sha256:${hash.digest('hex')}` !== expected.sha256
  ) {
    fail(`candidate tar member differs from inventory: ${safe}`);
  }
  const information = fs.lstatSync(outputPath, { bigint: true });
  if (
    !information.isFile() ||
    information.isSymbolicLink() ||
    information.nlink !== 1n ||
    Number(information.size) !== expected.size ||
    sha256File(outputPath) !== expected.sha256
  ) {
    fail(`candidate extracted identity differs: ${safe}`);
  }
}

function extractCandidate({ archivePath, destination, inventory }) {
  const output = path.resolve(destination);
  fs.mkdirSync(output, { mode: 0o700 });
  const canonicalOutput = requireCanonicalPath(output, {
    label: 'candidate extraction root',
    type: 'directory',
  });
  if (fs.readdirSync(canonicalOutput).length !== 0) {
    fail('candidate extraction root must be new and empty');
  }
  withInspectedTarFile(
    archivePath,
    ({ descriptor, members }) => {
      if (
        members.length !== inventory.files.length ||
        members.some((member, index) => {
          const expected = inventory.files[index];
          return (
            member.path !== `candidate/${expected.path}` ||
            member.size !== expected.size ||
            member.mode !==
              (expected.mode === '0555' ? 0o555 : 0o444)
          );
        })
      ) {
        fail('candidate tar member set differs from complete inventory');
      }
      for (let index = 0; index < members.length; index += 1) {
        extractMember({
          archiveDescriptor: descriptor,
          destination: canonicalOutput,
          expected: inventory.files[index],
          member: members[index],
        });
      }
    },
  );
  return canonicalOutput;
}

export function verifyDownloadedHandoff({
  extractionRoot,
  handoffDirectory,
}) {
  const handoff = requireCanonicalPath(handoffDirectory, {
    label: 'downloaded validation handoff',
    type: 'directory',
  });
  exactDirectoryFiles(handoff);
  const archivePath = resolveContainedPath(
    handoff,
    'validation-candidate.tar',
    {
      allowMissing: false,
      label: 'validation candidate archive',
    },
  );
  const archiveInformation = fs.lstatSync(archivePath, { bigint: true });
  if (
    !archiveInformation.isFile() ||
    archiveInformation.isSymbolicLink() ||
    archiveInformation.nlink !== 1n ||
    archiveInformation.size < 1n ||
    archiveInformation.size > BigInt(MAXIMUMS.handoffArchiveBytes)
  ) {
    fail('validation candidate archive identity or size is not admitted');
  }
  const expectedArchiveDigest = checksumDigest(
    path.join(handoff, 'validation-candidate.tar.sha256'),
  );
  const archiveDigest = sha256File(archivePath);
  if (archiveDigest !== expectedArchiveDigest) {
    fail('validation candidate archive digest differs');
  }
  const inventoryPath = path.join(
    handoff,
    'candidate-complete-inventory.json',
  );
  const inventory = validateCompleteInventory(
    readCanonicalJson(inventoryPath),
  );
  const extracted = extractCandidate({
    archivePath,
    destination: extractionRoot,
    inventory,
  });
  const verified = verifyCandidateStructure(extracted);
  if (
    canonicalJsonDigest(verified.completeInventory) !==
    canonicalJsonDigest(inventory)
  ) {
    fail('reverified candidate differs from the external inventory');
  }
  if (
    !sameIdentity(
      fs.lstatSync(archivePath, { bigint: true }),
      archiveInformation,
    )
  ) {
    fail('validation candidate archive changed during verification');
  }
  return deepFreeze({
    archiveDigest,
    archivePath,
    candidate: verified.candidate,
    candidateDocument: verified.candidateDocument,
    candidateRoot: verified.root,
    completeInventory: inventory,
    externalInventoryDigest: sha256File(inventoryPath),
    externalInventoryPath: inventoryPath,
  });
}
