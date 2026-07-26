import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { throwIfAborted } from './abort-context.mjs';
import { canonicalJson } from './canonical-json.mjs';
import {
  isStrictlyBelow,
  requireCanonicalPath,
  resolveRunRelative,
} from './paths.mjs';
import {
  assertSameSeal,
  sealDirectory,
} from './seal.mjs';
import { readJsonStrict } from './strict-json.mjs';

const MANIFEST_FILENAME = 'manifest.json';
const SQLITE_FILENAME = 'bangumi.sqlite';
const POINTER_FILENAME = 'current.json';
const GENERATOR_VERSION = '0.1.0';
const DATA_VERSION_ALGORITHM = 'bgmss-archive-data-version-v1';
const SCHEMA_SQL_DIGEST =
  'sha256:3cce7ce75fb4a7d2943ee8b9fb7c5df2639fae8fa0a2e07bddb3e1519ffdc8e0';
const SQLITE_APPLICATION_ID = 1_111_969_107;
const KNOWN_MINIMAL_SQLITE_DIGEST =
  'sha256:5c45a4b1337f3a4baaf0c965e0eb2cbceba9f4755d643f308e47a40c5cf7dcdc';
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MIN_FULL_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MIN_FULL_SQLITE_BYTES = 64 * 1024 * 1024;
const MIN_COMMON_BYTES = 1024;
const MIN_SOURCE_RECORDS = 100_000;
const MIN_SOURCE_BYTES = 64 * 1024 * 1024;
const SQLITE_HEADER_BYTES = 100;

const DATA_VERSION = /^dv1-[0-9a-f]{64}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const RELEASE = /^dump-[0-9]{4}-[0-9]{2}-[0-9]{2}\.[0-9]{6}Z$/u;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u;

const MANIFEST_FIELDS = Object.freeze([
  'manifestSchemaVersion',
  'sqliteSchemaVersion',
  'dataVersionAlgorithm',
  'dataVersion',
  'generatorVersion',
  'generatedAt',
  'archiveRelease',
  'archiveAssetUrl',
  'archiveAssetName',
  'archiveSize',
  'archiveDigest',
  'commonCommit',
  'commonSubjectStaffsUrl',
  'commonSize',
  'commonDigest',
  'schemaSqlDigest',
  'catalogConfigDigest',
  'domainRulesVersion',
  'castRulesVersion',
  'sourceFiles',
  'tableCounts',
  'qualitySummary',
  'sqliteFile',
  'sqliteSize',
  'sqliteDigest',
]);

const SOURCE_FIELDS = Object.freeze([
  'name',
  'size',
  'digest',
  'recordsTotal',
  'imported',
  'duplicate',
  'invalid',
  'unresolved',
]);

const SOURCE_NAMES = Object.freeze([
  'subject.jsonlines',
  'person.jsonlines',
  'character.jsonlines',
  'subject-persons.jsonlines',
  'subject-characters.jsonlines',
  'person-characters.jsonlines',
  'subject-relations.jsonlines',
]);
const SOURCE_TOKENS = Object.freeze([
  'subject',
  'person',
  'character',
  'subjectPersons',
  'subjectCharacters',
  'personCharacters',
  'subjectRelations',
]);

const TABLE_NAMES = Object.freeze([
  'archive_meta',
  'subject',
  'subject_rating_bucket',
  'subject_tag',
  'person',
  'person_career',
  'character',
  'subject_relation',
  'staff_position',
  'staff_position_category',
  'staff_credit',
  'cast_credit',
  'staff_set',
  'staff_set_member',
  'catalog_position',
  'catalog_position_member',
  'catalog_group',
  'catalog_group_member',
  'catalog_capability',
  'catalog_selection_rule',
]);

const QUALITY_NAMES = Object.freeze([
  'NO_CHARACTERS',
  'NO_CAST_RELATIONS',
  'FILTERED_BY_VALID_CV',
  'UNKNOWN_STAFF_POSITION',
]);

const privateAttestations = new WeakMap();
const privateMaterializedArchives = new WeakMap();

export class ArchiveAcceptanceError extends Error {}

function fail(message) {
  throw new ArchiveAcceptanceError(message);
}

function exactObject(value, fields, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (
    actual.length !== expected.length ||
    actual.some((field, index) => field !== expected[index])
  ) {
    fail(`${label} must contain exactly ${expected.join(', ')}`);
  }
  return value;
}

function integer(value, label, { minimum = 0 } = {}) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    fail(`${label} must be a safe integer >= ${minimum}`);
  }
  return value;
}

function string(value, label, { pattern, exact, max = 2048 } = {}) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > max ||
    [...value].some((character) => {
      const point = character.codePointAt(0);
      return point >= 0xd800 && point <= 0xdfff;
    }) ||
    (pattern && !pattern.test(value)) ||
    (exact !== undefined && value !== exact)
  ) {
    fail(`${label} is invalid`);
  }
  return value;
}

function namedCounts(value, names, label) {
  const counts = exactObject(value, names, label);
  for (const name of names) integer(counts[name], `${label}.${name}`);
  return counts;
}

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function validGeneratedAt(value) {
  if (typeof value !== 'string') return false;
  const match = value.match(
    /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.[0-9]{1,6})?Z$/u,
  );
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const days = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return (
    year >= 1 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= days[month - 1] &&
    Number(hourText) <= 23 &&
    Number(minuteText) <= 59 &&
    Number(secondText) <= 59
  );
}

function manifestDataVersion(manifest) {
  const preimage = [
    DATA_VERSION_ALGORITHM,
    `archiveRelease=${manifest.archiveRelease}`,
    `archiveDigest=${manifest.archiveDigest}`,
    `commonCommit=${manifest.commonCommit}`,
    `commonDigest=${manifest.commonDigest}`,
    `manifestSchemaVersion=${manifest.manifestSchemaVersion}`,
    `sqliteSchemaVersion=${manifest.sqliteSchemaVersion}`,
    `schemaSqlDigest=${manifest.schemaSqlDigest}`,
    `domainRulesVersion=${manifest.domainRulesVersion}`,
    `castRulesVersion=${manifest.castRulesVersion}`,
    `catalogConfigDigest=${manifest.catalogConfigDigest}`,
    '',
  ].join('\n');
  return `dv1-${createHash('sha256').update(preimage, 'utf8').digest('hex')}`;
}

function validateSourceFiles(value) {
  if (!Array.isArray(value) || value.length !== SOURCE_NAMES.length) {
    fail('manifest.sourceFiles must contain all seven official source files');
  }
  let sourceBytes = 0;
  let sourceRecords = 0;
  for (const [index, expectedName] of SOURCE_NAMES.entries()) {
    const label = `manifest.sourceFiles[${index}]`;
    const source = exactObject(value[index], SOURCE_FIELDS, label);
    string(source.name, `${label}.name`, { exact: expectedName });
    integer(source.size, `${label}.size`);
    string(source.digest, `${label}.digest`, { pattern: DIGEST });
    for (const field of [
      'recordsTotal',
      'imported',
      'duplicate',
      'invalid',
      'unresolved',
    ]) {
      integer(source[field], `${label}.${field}`);
    }
    if (
      source.recordsTotal !==
      source.imported + source.duplicate + source.invalid + source.unresolved
    ) {
      fail(`${label} source accounting is inconsistent`);
    }
    sourceBytes += source.size;
    sourceRecords += source.recordsTotal;
    if (!Number.isSafeInteger(sourceBytes) || !Number.isSafeInteger(sourceRecords)) {
      fail('manifest source accounting exceeds the safe integer range');
    }
  }
  if (sourceBytes < MIN_SOURCE_BYTES || sourceRecords < MIN_SOURCE_RECORDS) {
    fail('manifest source accounting is too small to be a full Archive');
  }
  return Object.freeze({ sourceBytes, sourceRecords });
}

function validateManifest(manifest, expectedDataVersion) {
  exactObject(manifest, MANIFEST_FIELDS, 'manifest');
  integer(manifest.manifestSchemaVersion, 'manifest.manifestSchemaVersion', {
    minimum: 1,
  });
  integer(manifest.sqliteSchemaVersion, 'manifest.sqliteSchemaVersion', {
    minimum: 1,
  });
  if (manifest.manifestSchemaVersion !== 1 || manifest.sqliteSchemaVersion !== 1) {
    fail('manifest schema versions are unsupported');
  }
  string(manifest.dataVersionAlgorithm, 'manifest.dataVersionAlgorithm', {
    exact: DATA_VERSION_ALGORITHM,
  });
  string(manifest.dataVersion, 'manifest.dataVersion', {
    pattern: DATA_VERSION,
  });
  string(manifest.generatorVersion, 'manifest.generatorVersion', {
    exact: GENERATOR_VERSION,
  });
  if (!validGeneratedAt(manifest.generatedAt)) {
    fail('manifest.generatedAt is invalid');
  }
  string(manifest.archiveRelease, 'manifest.archiveRelease', {
    pattern: RELEASE,
  });
  const assetName = `${manifest.archiveRelease}.zip`;
  string(manifest.archiveAssetName, 'manifest.archiveAssetName', {
    exact: assetName,
    max: 255,
  });
  string(manifest.archiveAssetUrl, 'manifest.archiveAssetUrl', {
    exact:
      `https://github.com/bangumi/Archive/releases/download/archive/` +
      assetName,
  });
  integer(manifest.archiveSize, 'manifest.archiveSize');
  if (manifest.archiveSize < MIN_FULL_ARCHIVE_BYTES) {
    fail('manifest archive asset is too small to be a full Archive');
  }
  string(manifest.archiveDigest, 'manifest.archiveDigest', { pattern: DIGEST });
  string(manifest.commonCommit, 'manifest.commonCommit', { pattern: COMMIT });
  string(
    manifest.commonSubjectStaffsUrl,
    'manifest.commonSubjectStaffsUrl',
    {
      exact:
        `https://raw.githubusercontent.com/bangumi/common/` +
        `${manifest.commonCommit}/subject_staffs.yml`,
    },
  );
  integer(manifest.commonSize, 'manifest.commonSize');
  if (manifest.commonSize < MIN_COMMON_BYTES) {
    fail('manifest common catalog is too small to be official input');
  }
  string(manifest.commonDigest, 'manifest.commonDigest', { pattern: DIGEST });
  string(manifest.schemaSqlDigest, 'manifest.schemaSqlDigest', {
    exact: SCHEMA_SQL_DIGEST,
  });
  string(manifest.catalogConfigDigest, 'manifest.catalogConfigDigest', {
    pattern: DIGEST,
  });
  string(manifest.domainRulesVersion, 'manifest.domainRulesVersion', {
    exact: 'domain-raw-v1',
  });
  string(manifest.castRulesVersion, 'manifest.castRulesVersion', {
    exact: 'cast-exact-v1',
  });
  const sourceFacts = validateSourceFiles(manifest.sourceFiles);
  const tableCounts = namedCounts(
    manifest.tableCounts,
    TABLE_NAMES,
    'manifest.tableCounts',
  );
  namedCounts(manifest.qualitySummary, QUALITY_NAMES, 'manifest.qualitySummary');
  if (
    tableCounts.archive_meta !== 1 ||
    tableCounts.subject < 10_000 ||
    tableCounts.person < 1000 ||
    tableCounts.character < 1000 ||
    tableCounts.staff_credit < 1000
  ) {
    fail('manifest table counts are too small or inconsistent for a full Archive');
  }
  string(manifest.sqliteFile, 'manifest.sqliteFile', {
    exact: SQLITE_FILENAME,
  });
  integer(manifest.sqliteSize, 'manifest.sqliteSize');
  if (manifest.sqliteSize < MIN_FULL_SQLITE_BYTES) {
    fail('manifest SQLite is too small to be a full Archive');
  }
  string(manifest.sqliteDigest, 'manifest.sqliteDigest', { pattern: DIGEST });
  if (manifest.sqliteDigest === KNOWN_MINIMAL_SQLITE_DIGEST) {
    fail('known minimal Archive SQLite identity is forbidden');
  }
  if (
    manifest.dataVersion !== expectedDataVersion ||
    manifest.dataVersion !== manifestDataVersion(manifest)
  ) {
    fail('manifest dataVersion does not match its expected canonical identity');
  }
  return sourceFacts;
}

function exactVersionLayout(versionRoot) {
  const entries = fs
    .readdirSync(versionRoot, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, 'en'));
  const expected = [SQLITE_FILENAME, MANIFEST_FILENAME];
  if (
    entries.length !== expected.length ||
    entries.some((entry, index) => entry.name !== expected[index])
  ) {
    fail(
      `Archive version root must contain exactly ${MANIFEST_FILENAME} and ${SQLITE_FILENAME}`,
    );
  }
  for (const entry of entries) {
    const filePath = path.join(versionRoot, entry.name);
    const information = fs.lstatSync(filePath, { bigint: true });
    if (
      entry.isSymbolicLink() ||
      !entry.isFile() ||
      !information.isFile() ||
      information.nlink !== 1n ||
      (Number(information.mode & 0o777n) & 0o222) !== 0
    ) {
      fail(`${entry.name} must be one immutable, unlinked regular file`);
    }
  }
  const root = fs.lstatSync(versionRoot, { bigint: true });
  if (!root.isDirectory() || (Number(root.mode & 0o777n) & 0o222) !== 0) {
    fail('Archive version root must be an immutable real directory');
  }
}

function fileIdentity(filePath) {
  const information = fs.lstatSync(filePath, { bigint: true });
  if (
    !information.isFile() ||
    information.isSymbolicLink() ||
    information.nlink !== 1n
  ) {
    fail(`${path.basename(filePath)} is not an unlinked regular file`);
  }
  return Object.freeze({
    device: information.dev,
    inode: information.ino,
    mode: information.mode & 0o777n,
    size: information.size,
  });
}

function directoryIdentity(directory) {
  const information = fs.lstatSync(directory, { bigint: true });
  if (!information.isDirectory() || information.isSymbolicLink()) {
    fail('Archive version root is not a real directory');
  }
  return Object.freeze({
    device: information.dev,
    inode: information.ino,
    mode: information.mode & 0o777n,
  });
}

function pathEntryExists(candidate) {
  try {
    fs.lstatSync(candidate);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function sameIdentity(actual, expected, label) {
  for (const field of Object.keys(expected)) {
    if (actual[field] !== expected[field]) {
      fail(`${label} identity changed during acceptance`);
    }
  }
}

function sqliteHeader(sqlitePath) {
  const descriptor = fs.openSync(
    sqlitePath,
    fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
  );
  try {
    const header = Buffer.alloc(SQLITE_HEADER_BYTES);
    const bytes = fs.readSync(descriptor, header, 0, header.length, 0);
    if (
      bytes !== SQLITE_HEADER_BYTES ||
      header.subarray(0, 16).toString('ascii') !== 'SQLite format 3\u0000' ||
      header.readUInt32BE(60) !== 1 ||
      header.readUInt32BE(68) !== SQLITE_APPLICATION_ID
    ) {
      fail('SQLite header, user_version, or application_id is invalid');
    }
  } finally {
    fs.closeSync(descriptor);
  }
}

function sealEntry(seal, relative) {
  const entry = seal.entries.find((candidate) => candidate.path === relative);
  if (!entry) fail(`Archive seal is missing ${relative}`);
  return entry;
}

function freezeManifest(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeManifest(child);
    Object.freeze(value);
  }
  return value;
}

export async function attestFullArchive({
  versionRoot,
  expectedDataVersion,
}) {
  string(expectedDataVersion, 'expected Archive dataVersion', {
    pattern: DATA_VERSION,
  });
  const root = requireCanonicalPath(versionRoot, {
    label: 'full Archive version root',
    type: 'directory',
  });
  if (path.basename(root) !== expectedDataVersion) {
    fail('Archive version directory name does not match expected dataVersion');
  }
  exactVersionLayout(root);
  const paths = Object.freeze({
    manifest: path.join(root, MANIFEST_FILENAME),
    sqlite: path.join(root, SQLITE_FILENAME),
  });
  const identities = Object.freeze({
    root: directoryIdentity(root),
    manifest: fileIdentity(paths.manifest),
    sqlite: fileIdentity(paths.sqlite),
  });
  const sourceSeal = await sealDirectory(root);
  const manifestEntry = sealEntry(sourceSeal, MANIFEST_FILENAME);
  const sqliteEntry = sealEntry(sourceSeal, SQLITE_FILENAME);
  if (manifestEntry.size <= 0 || manifestEntry.size > MAX_MANIFEST_BYTES) {
    fail('Archive manifest size is invalid');
  }
  const manifest = readJsonStrict(paths.manifest);
  const sourceFacts = validateManifest(manifest, expectedDataVersion);
  if (
    sqliteEntry.size !== manifest.sqliteSize ||
    sqliteEntry.sha256 !== manifest.sqliteDigest
  ) {
    fail('Archive SQLite size or SHA-256 does not match the manifest');
  }
  sqliteHeader(paths.sqlite);
  const verifiedSeal = await sealDirectory(root);
  assertSameSeal(sourceSeal, verifiedSeal, 'full Archive input');
  for (const [name, filePath] of Object.entries(paths)) {
    sameIdentity(fileIdentity(filePath), identities[name], `${name} source file`);
  }
  sameIdentity(directoryIdentity(root), identities.root, 'Archive source root');

  const attestation = Object.freeze({
    root,
    manifest: freezeManifest(manifest),
    identity: Object.freeze({
      dataVersion: manifest.dataVersion,
      manifestDigest: manifestEntry.sha256,
      sqliteDigest: sqliteEntry.sha256,
    }),
    facts: Object.freeze({
      manifestBytes: manifestEntry.size,
      sqliteBytes: sqliteEntry.size,
      sourceBytes: sourceFacts.sourceBytes,
      sourceRecords: sourceFacts.sourceRecords,
      sources: Object.freeze(
        Object.fromEntries(
          manifest.sourceFiles.map((source, index) => [
            SOURCE_TOKENS[index],
            Object.freeze({
              bytes: source.size,
              records: source.recordsTotal,
            }),
          ]),
        ),
      ),
      tableCounts: Object.freeze({ ...manifest.tableCounts }),
    }),
    sourceSeal,
  });
  privateAttestations.set(attestation, Object.freeze({ identities, paths }));
  return attestation;
}

async function copyRegularFile(sourcePath, destinationPath, expected) {
  throwIfAborted();
  const source = await fs.promises.open(
    sourcePath,
    fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
  );
  let destination;
  const digest = createHash('sha256');
  let size = 0;
  try {
    const before = await source.stat({ bigint: true });
    if (
      !before.isFile() ||
      before.nlink !== 1n ||
      Number(before.size) !== expected.size
    ) {
      fail(`${path.basename(sourcePath)} changed before byte-copy`);
    }
    destination = await fs.promises.open(
      destinationPath,
      fs.constants.O_WRONLY |
        fs.constants.O_CREAT |
        fs.constants.O_EXCL |
        (fs.constants.O_NOFOLLOW ?? 0),
      0o400,
    );
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let position = 0;
    while (true) {
      throwIfAborted();
      const { bytesRead } = await source.read(buffer, 0, buffer.length, position);
      if (bytesRead === 0) break;
      digest.update(buffer.subarray(0, bytesRead));
      let written = 0;
      while (written < bytesRead) {
        throwIfAborted();
        const result = await destination.write(
          buffer,
          written,
          bytesRead - written,
          position + written,
        );
        if (result.bytesWritten === 0) {
          fail(`short write while copying ${path.basename(sourcePath)}`);
        }
        written += result.bytesWritten;
      }
      position += bytesRead;
      size += bytesRead;
    }
    await destination.sync();
    throwIfAborted();
    const after = await source.stat({ bigint: true });
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.mode !== after.mode ||
      before.size !== after.size ||
      before.nlink !== after.nlink
    ) {
      fail(`${path.basename(sourcePath)} changed during byte-copy`);
    }
  } finally {
    await destination?.close();
    await source.close();
  }
  const copiedDigest = `sha256:${digest.digest('hex')}`;
  if (size !== expected.size || copiedDigest !== expected.sha256) {
    fail(`${path.basename(sourcePath)} bytes changed during byte-copy`);
  }
  return Object.freeze({ size, sha256: copiedDigest });
}

export async function verifyFullArchiveSeal(attestation) {
  const privateState = privateAttestations.get(attestation);
  if (!privateState) fail('Archive attestation was not issued by this module');
  const currentSeal = await sealDirectory(attestation.root);
  assertSameSeal(attestation.sourceSeal, currentSeal, 'full Archive input');
  sameIdentity(
    directoryIdentity(attestation.root),
    privateState.identities.root,
    'Archive source root',
  );
  for (const [name, filePath] of Object.entries(privateState.paths)) {
    sameIdentity(
      fileIdentity(filePath),
      privateState.identities[name],
      `${name} source file`,
    );
  }
  return currentSeal;
}

export async function materializeFullArchive({ attestation, runRoot }) {
  throwIfAborted();
  const privateState = privateAttestations.get(attestation);
  if (!privateState) fail('Archive attestation was not issued by this module');
  const canonicalRunRoot = requireCanonicalPath(runRoot, {
    label: 'acceptance run root',
    type: 'directory',
  });
  await verifyFullArchiveSeal(attestation);

  const archiveRoot = resolveRunRelative(
    canonicalRunRoot,
    'archive',
    'disposable Archive root',
  );
  if (
    attestation.root === canonicalRunRoot ||
    isStrictlyBelow(attestation.root, canonicalRunRoot) ||
    isStrictlyBelow(canonicalRunRoot, attestation.root)
  ) {
    fail('full Archive input and disposable run root must be disjoint');
  }
  if (pathEntryExists(archiveRoot)) {
    fail('disposable Archive target already exists');
  }
  try {
    fs.mkdirSync(archiveRoot, { mode: 0o700 });
  } catch (error) {
    if (error?.code === 'EEXIST') fail('disposable Archive target already exists');
    throw error;
  }
  const versionsRoot = path.join(archiveRoot, 'versions');
  fs.mkdirSync(versionsRoot, { mode: 0o700 });
  const destinationVersion = path.join(
    versionsRoot,
    attestation.identity.dataVersion,
  );
  fs.mkdirSync(destinationVersion, { mode: 0o700 });

  const copied = {};
  for (const name of [MANIFEST_FILENAME, SQLITE_FILENAME]) {
    throwIfAborted();
    copied[name] = await copyRegularFile(
      path.join(attestation.root, name),
      path.join(destinationVersion, name),
      sealEntry(attestation.sourceSeal, name),
    );
  }
  await verifyFullArchiveSeal(attestation);

  const pointer = Object.freeze({
    pointerSchemaVersion: 1,
    dataVersion: attestation.identity.dataVersion,
    manifestDigest: attestation.identity.manifestDigest,
  });
  const pointerPath = path.join(archiveRoot, POINTER_FILENAME);
  fs.writeFileSync(pointerPath, canonicalJson(pointer), {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o400,
  });

  for (const name of [MANIFEST_FILENAME, SQLITE_FILENAME]) {
    const sourceInformation = fs.statSync(path.join(attestation.root, name), {
      bigint: true,
    });
    const destinationPath = path.join(destinationVersion, name);
    const destinationInformation = fs.statSync(destinationPath, {
      bigint: true,
    });
    if (
      destinationInformation.nlink !== 1n ||
      (sourceInformation.dev === destinationInformation.dev &&
        sourceInformation.ino === destinationInformation.ino)
    ) {
      fail(`${name} destination must be an independent byte-copy`);
    }
    fs.chmodSync(destinationPath, 0o444);
  }
  fs.chmodSync(pointerPath, 0o444);
  fs.chmodSync(destinationVersion, 0o555);
  fs.chmodSync(versionsRoot, 0o555);
  fs.chmodSync(archiveRoot, 0o555);

  const outputSeal = await sealDirectory(archiveRoot);
  const expectedOutputPaths = [
    POINTER_FILENAME,
    `versions/${attestation.identity.dataVersion}/${SQLITE_FILENAME}`,
    `versions/${attestation.identity.dataVersion}/${MANIFEST_FILENAME}`,
  ];
  if (
    outputSeal.entries.length !== expectedOutputPaths.length ||
    outputSeal.entries.some(
      (entry, index) => entry.path !== expectedOutputPaths[index],
    )
  ) {
    fail('disposable Archive output layout is not closed');
  }
  for (const [label, directory] of [
    ['Archive root', archiveRoot],
    ['Archive versions root', versionsRoot],
    ['Archive version root', destinationVersion],
  ]) {
    const information = fs.lstatSync(directory);
    if (
      information.isSymbolicLink() ||
      !information.isDirectory() ||
      (information.mode & 0o777) !== 0o555
    ) {
      fail(`${label} is not one read-only real directory`);
    }
  }
  for (const name of [MANIFEST_FILENAME, SQLITE_FILENAME]) {
    const entry = sealEntry(
      outputSeal,
      `versions/${attestation.identity.dataVersion}/${name}`,
    );
    if (
      entry.mode !== 0o444 ||
      entry.size !== copied[name].size ||
      entry.sha256 !== copied[name].sha256
    ) {
      fail(`${name} disposable copy is not byte-identical and read-only`);
    }
  }
  const pointerEntry = sealEntry(outputSeal, POINTER_FILENAME);
  if (pointerEntry.mode !== 0o444) {
    fail('disposable current pointer is not read-only');
  }
  const materialized = Object.freeze({
    archiveRoot,
    versionRoot: destinationVersion,
    pointerPath,
    pointer,
    identity: attestation.identity,
    outputSeal,
  });
  privateMaterializedArchives.set(
    materialized,
    Object.freeze({
      directories: Object.freeze({
        archiveRoot: directoryIdentity(archiveRoot),
        versionsRoot: directoryIdentity(versionsRoot),
        versionRoot: directoryIdentity(destinationVersion),
      }),
      files: Object.freeze({
        pointer: fileIdentity(pointerPath),
        manifest: fileIdentity(path.join(destinationVersion, MANIFEST_FILENAME)),
        sqlite: fileIdentity(path.join(destinationVersion, SQLITE_FILENAME)),
      }),
    }),
  );
  return materialized;
}

export async function verifyMaterializedArchiveSeal(materialized) {
  const privateState = privateMaterializedArchives.get(materialized);
  if (!privateState) {
    fail('materialized Archive attestation was not issued by this module');
  }
  throwIfAborted();
  const currentSeal = await sealDirectory(materialized.archiveRoot);
  assertSameSeal(
    materialized.outputSeal,
    currentSeal,
    'materialized Archive output',
  );
  for (const [name, identity] of Object.entries(privateState.directories)) {
    sameIdentity(
      directoryIdentity(
        name === 'archiveRoot'
          ? materialized.archiveRoot
          : name === 'versionsRoot'
            ? path.join(materialized.archiveRoot, 'versions')
            : materialized.versionRoot,
      ),
      identity,
      `materialized Archive ${name}`,
    );
  }
  for (const [name, identity] of Object.entries(privateState.files)) {
    sameIdentity(
      fileIdentity(
        name === 'pointer'
          ? materialized.pointerPath
          : path.join(
              materialized.versionRoot,
              name === 'manifest' ? MANIFEST_FILENAME : SQLITE_FILENAME,
            ),
      ),
      identity,
      `materialized Archive ${name}`,
    );
  }
  return currentSeal;
}
