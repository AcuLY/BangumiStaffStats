import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  attestFullArchive,
  materializeFullArchive,
  verifyFullArchiveSeal,
  verifyMaterializedArchiveSeal,
} from '../lib/archive.mjs';
import { canonicalJson } from '../lib/canonical-json.mjs';
import { readJsonStrict } from '../lib/strict-json.mjs';

const SCHEMA_SQL_DIGEST =
  'sha256:3cce7ce75fb4a7d2943ee8b9fb7c5df2639fae8fa0a2e07bddb3e1519ffdc8e0';
const SOURCE_NAMES = [
  'subject.jsonlines',
  'person.jsonlines',
  'character.jsonlines',
  'subject-persons.jsonlines',
  'subject-characters.jsonlines',
  'person-characters.jsonlines',
  'subject-relations.jsonlines',
];

function digest(text) {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

function dataVersion(manifest) {
  const preimage = [
    'bgmss-archive-data-version-v1',
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
  return `dv1-${createHash('sha256').update(preimage).digest('hex')}`;
}

function sqliteDigest(filePath) {
  const hash = createHash('sha256');
  const descriptor = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let position = 0;
    while (true) {
      const bytes = fs.readSync(descriptor, buffer, 0, buffer.length, position);
      if (bytes === 0) break;
      hash.update(buffer.subarray(0, bytes));
      position += bytes;
    }
  } finally {
    fs.closeSync(descriptor);
  }
  return `sha256:${hash.digest('hex')}`;
}

function baseManifest(sqliteSize, sqliteSha256) {
  const release = 'dump-2026-07-21.210441Z';
  const commonCommit = '6a8442c17143a870357a5ff812362e8b5cfe9f9d';
  const manifest = {
    manifestSchemaVersion: 1,
    sqliteSchemaVersion: 1,
    dataVersionAlgorithm: 'bgmss-archive-data-version-v1',
    dataVersion: '',
    generatorVersion: '0.1.0',
    generatedAt: '2026-07-25T19:32:02Z',
    archiveRelease: release,
    archiveAssetUrl:
      `https://github.com/bangumi/Archive/releases/download/archive/${release}.zip`,
    archiveAssetName: `${release}.zip`,
    archiveSize: 419_054_508,
    archiveDigest: digest('synthetic-control-flow-archive'),
    commonCommit,
    commonSubjectStaffsUrl:
      `https://raw.githubusercontent.com/bangumi/common/${commonCommit}/subject_staffs.yml`,
    commonSize: 37_723,
    commonDigest: digest('synthetic-control-flow-common'),
    schemaSqlDigest: SCHEMA_SQL_DIGEST,
    catalogConfigDigest: digest('catalog'),
    domainRulesVersion: 'domain-raw-v1',
    castRulesVersion: 'cast-exact-v1',
    sourceFiles: SOURCE_NAMES.map((name, index) => ({
      name,
      size: 10_000_000 + index,
      digest: digest(name),
      recordsTotal: 100_000 + index,
      imported: 99_999 + index,
      duplicate: 0,
      invalid: 1,
      unresolved: 0,
    })),
    tableCounts: {
      archive_meta: 1,
      subject: 100_000,
      subject_rating_bucket: 1_000_000,
      subject_tag: 200_000,
      person: 10_000,
      person_career: 10_000,
      character: 10_000,
      subject_relation: 50_000,
      staff_position: 200,
      staff_position_category: 20,
      staff_credit: 50_000,
      cast_credit: 20_000,
      staff_set: 0,
      staff_set_member: 0,
      catalog_position: 200,
      catalog_position_member: 0,
      catalog_group: 20,
      catalog_group_member: 200,
      catalog_capability: 1000,
      catalog_selection_rule: 200,
    },
    qualitySummary: {
      NO_CHARACTERS: 100,
      NO_CAST_RELATIONS: 100,
      FILTERED_BY_VALID_CV: 100,
      UNKNOWN_STAFF_POSITION: 1,
    },
    sqliteFile: 'bangumi.sqlite',
    sqliteSize,
    sqliteDigest: sqliteSha256,
  };
  manifest.dataVersion = dataVersion(manifest);
  return manifest;
}

function makeSQLite(filePath, size = 64 * 1024 * 1024) {
  const descriptor = fs.openSync(filePath, 'wx', 0o600);
  try {
    const header = Buffer.alloc(100);
    header.write('SQLite format 3\u0000', 0, 'ascii');
    header.writeUInt16BE(4096, 16);
    header.writeUInt32BE(1, 60);
    header.writeUInt32BE(1_111_969_107, 68);
    fs.writeSync(descriptor, header, 0, header.length, 0);
    fs.ftruncateSync(descriptor, size);
  } finally {
    fs.closeSync(descriptor);
  }
}

function makeSyntheticFullShapeFixture(temporaryRoot, mutateManifest = () => {}) {
  const preparation = path.join(temporaryRoot, `prepare-${Math.random()}`);
  fs.mkdirSync(preparation, { mode: 0o700 });
  const sqlitePath = path.join(preparation, 'bangumi.sqlite');
  makeSQLite(sqlitePath);
  const manifest = baseManifest(fs.statSync(sqlitePath).size, sqliteDigest(sqlitePath));
  mutateManifest(manifest);
  if (
    manifest.dataVersion === '' ||
    manifest.dataVersion !== dataVersion(manifest)
  ) {
    manifest.dataVersion = dataVersion(manifest);
  }
  const versionRoot = path.join(temporaryRoot, manifest.dataVersion);
  fs.renameSync(preparation, versionRoot);
  fs.writeFileSync(
    path.join(versionRoot, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { flag: 'wx', mode: 0o600 },
  );
  fs.chmodSync(sqlitePath.replace(preparation, versionRoot), 0o444);
  fs.chmodSync(path.join(versionRoot, 'manifest.json'), 0o444);
  fs.chmodSync(versionRoot, 0o555);
  return { manifest, versionRoot };
}

function unlockTree(root) {
  let information;
  try {
    information = fs.lstatSync(root);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  if (!information.isSymbolicLink() && information.isDirectory()) {
    fs.chmodSync(root, 0o700);
    for (const name of fs.readdirSync(root)) {
      unlockTree(path.join(root, name));
    }
  } else if (!information.isSymbolicLink()) {
    fs.chmodSync(root, 0o600);
  }
}

test('synthetic full-shape control-flow fixture is copied read-only (non-final evidence)', async (t) => {
  const temporaryRoot = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), 'bgmss-archive-test-')),
  );
  t.after(() => {
    unlockTree(temporaryRoot);
    fs.rmSync(temporaryRoot, { recursive: true, force: false });
  });
  const sourceRoot = path.join(temporaryRoot, 'source');
  const runRoot = path.join(temporaryRoot, 'run');
  fs.mkdirSync(sourceRoot);
  fs.mkdirSync(runRoot);
  const { manifest, versionRoot } = makeSyntheticFullShapeFixture(sourceRoot);

  const attestation = await attestFullArchive({
    versionRoot,
    expectedDataVersion: manifest.dataVersion,
  });
  assert.equal(attestation.identity.dataVersion, manifest.dataVersion);
  assert.equal(attestation.facts.sourceRecords, 700_021);
  await verifyFullArchiveSeal(attestation);

  const materialized = await materializeFullArchive({ attestation, runRoot });
  assert.deepEqual(
    { ...readJsonStrict(materialized.pointerPath) },
    {
      dataVersion: manifest.dataVersion,
      manifestDigest: attestation.identity.manifestDigest,
      pointerSchemaVersion: 1,
    },
  );
  assert.equal(
    fs.readFileSync(materialized.pointerPath, 'utf8'),
    canonicalJson(materialized.pointer),
  );
  for (const filePath of [
    materialized.pointerPath,
    path.join(materialized.versionRoot, 'manifest.json'),
    path.join(materialized.versionRoot, 'bangumi.sqlite'),
  ]) {
    assert.equal(fs.statSync(filePath).mode & 0o777, 0o444);
  }
  for (const directory of [
    materialized.archiveRoot,
    path.join(materialized.archiveRoot, 'versions'),
    materialized.versionRoot,
  ]) {
    assert.equal(fs.statSync(directory).mode & 0o777, 0o555);
  }
  const sourceSQLite = fs.statSync(path.join(versionRoot, 'bangumi.sqlite'));
  const copiedSQLite = fs.statSync(
    path.join(materialized.versionRoot, 'bangumi.sqlite'),
  );
  assert.notEqual(
    `${sourceSQLite.dev}:${sourceSQLite.ino}`,
    `${copiedSQLite.dev}:${copiedSQLite.ino}`,
  );
  await assert.rejects(
    materializeFullArchive({ attestation, runRoot }),
    /target already exists/u,
  );
  await verifyMaterializedArchiveSeal(materialized);
  fs.chmodSync(materialized.pointerPath, 0o600);
  fs.writeFileSync(materialized.pointerPath, `${canonicalJson(materialized.pointer)} `);
  await assert.rejects(
    verifyMaterializedArchiveSeal(materialized),
    /materialized Archive output/u,
  );
});

test('Archive validation rejects unknown fields, unofficial identity, and minimal data', async (t) => {
  const temporaryRoot = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), 'bgmss-archive-negative-')),
  );
  t.after(() => {
    unlockTree(temporaryRoot);
    fs.rmSync(temporaryRoot, { recursive: true, force: false });
  });

  const cases = [
    {
      name: 'unknown manifest field',
      mutate(manifest) {
        manifest.unreviewed = true;
      },
      pattern: /must contain exactly/u,
    },
    {
      name: 'unofficial release URL',
      mutate(manifest) {
        manifest.archiveAssetUrl = 'https://example.invalid/archive.zip';
      },
      pattern: /archiveAssetUrl is invalid/u,
    },
    {
      name: 'known minimal SQLite digest',
      mutate(manifest) {
        manifest.sqliteDigest =
          'sha256:5c45a4b1337f3a4baaf0c965e0eb2cbceba9f4755d643f308e47a40c5cf7dcdc';
      },
      pattern: /known minimal/u,
    },
    {
      name: 'incomplete source accounting',
      mutate(manifest) {
        manifest.sourceFiles.pop();
      },
      pattern: /seven official/u,
    },
  ];
  for (const declaration of cases) {
    await t.test(declaration.name, async () => {
      const caseRoot = path.join(temporaryRoot, declaration.name.replaceAll(' ', '-'));
      fs.mkdirSync(caseRoot);
      const { manifest, versionRoot } = makeSyntheticFullShapeFixture(
        caseRoot,
        declaration.mutate,
      );
      await assert.rejects(
        attestFullArchive({
          versionRoot,
          expectedDataVersion: manifest.dataVersion,
        }),
        declaration.pattern,
      );
    });
  }
});

test('Archive layout rejects extra, symbolic, linked, writable, and mutated inputs', async (t) => {
  const temporaryRoot = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), 'bgmss-archive-layout-')),
  );
  t.after(() => {
    unlockTree(temporaryRoot);
    fs.rmSync(temporaryRoot, { recursive: true, force: false });
  });

  await t.test('extra entry', async () => {
    const caseRoot = path.join(temporaryRoot, 'extra');
    fs.mkdirSync(caseRoot);
    const { manifest, versionRoot } = makeSyntheticFullShapeFixture(caseRoot);
    fs.chmodSync(versionRoot, 0o755);
    fs.writeFileSync(path.join(versionRoot, 'current.json'), '{}');
    fs.chmodSync(versionRoot, 0o555);
    await assert.rejects(
      attestFullArchive({
        versionRoot,
        expectedDataVersion: manifest.dataVersion,
      }),
      /must contain exactly/u,
    );
  });

  await t.test('hard-linked SQLite', async () => {
    const caseRoot = path.join(temporaryRoot, 'linked');
    fs.mkdirSync(caseRoot);
    const { manifest, versionRoot } = makeSyntheticFullShapeFixture(caseRoot);
    fs.linkSync(
      path.join(versionRoot, 'bangumi.sqlite'),
      path.join(caseRoot, 'second-link.sqlite'),
    );
    await assert.rejects(
      attestFullArchive({
        versionRoot,
        expectedDataVersion: manifest.dataVersion,
      }),
      /unlinked regular file/u,
    );
  });

  await t.test('writable manifest', async () => {
    const caseRoot = path.join(temporaryRoot, 'writable');
    fs.mkdirSync(caseRoot);
    const { manifest, versionRoot } = makeSyntheticFullShapeFixture(caseRoot);
    fs.chmodSync(path.join(versionRoot, 'manifest.json'), 0o644);
    await assert.rejects(
      attestFullArchive({
        versionRoot,
        expectedDataVersion: manifest.dataVersion,
      }),
      /immutable/u,
    );
  });

  await t.test('mutation after attestation', async () => {
    const caseRoot = path.join(temporaryRoot, 'mutation');
    const runRoot = path.join(temporaryRoot, 'mutation-run');
    fs.mkdirSync(caseRoot);
    fs.mkdirSync(runRoot);
    const { manifest, versionRoot } = makeSyntheticFullShapeFixture(caseRoot);
    const attestation = await attestFullArchive({
      versionRoot,
      expectedDataVersion: manifest.dataVersion,
    });
    const sqlitePath = path.join(versionRoot, 'bangumi.sqlite');
    fs.chmodSync(sqlitePath, 0o644);
    const descriptor = fs.openSync(sqlitePath, 'r+');
    try {
      fs.writeSync(descriptor, Buffer.from([1]), 0, 1, 4096);
    } finally {
      fs.closeSync(descriptor);
    }
    fs.chmodSync(sqlitePath, 0o444);
    await assert.rejects(
      materializeFullArchive({ attestation, runRoot }),
      /changed during acceptance/u,
    );
    assert.equal(fs.existsSync(path.join(runRoot, 'archive')), false);
  });

  await t.test('symbolic version root', async () => {
    const caseRoot = path.join(temporaryRoot, 'symbolic');
    fs.mkdirSync(caseRoot);
    const { manifest, versionRoot } = makeSyntheticFullShapeFixture(caseRoot);
    const linkedRoot = path.join(temporaryRoot, manifest.dataVersion);
    fs.symlinkSync(versionRoot, linkedRoot);
    await assert.rejects(
      attestFullArchive({
        versionRoot: linkedRoot,
        expectedDataVersion: manifest.dataVersion,
      }),
      /must not be a symlink/u,
    );
  });
});
