import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { compileStrictSchema } from '../../lib/schema.mjs';
import { readJsonStrict } from '../../lib/strict-json.mjs';

const CONFIG = path.resolve(import.meta.dirname, '..', '..', 'config');
const readSchema = (name) => readJsonStrict(path.join(CONFIG, name));

test('runtime release and update event schemas close their field sets', () => {
  const validateRelease = compileStrictSchema(
    readSchema('runtime-release-v1.schema.json'),
  );
  const release = {
    apiImage: `ghcr.io/aculy/bangumi-staff-stats-api@sha256:${'a'.repeat(64)}`,
    appRevision: 'b'.repeat(40),
    appVersion: 'v1.2.3',
    archiveSmokeDigest: `sha256:${'c'.repeat(64)}`,
    commonCommit: 'd'.repeat(40),
    manifestDigest: `sha256:${'e'.repeat(64)}`,
    schemaVersion: 'runtime-release-v1',
    updaterImage:
      `ghcr.io/aculy/bangumi-staff-stats-updater@sha256:${'f'.repeat(64)}`,
  };
  assert.doesNotThrow(() => validateRelease(structuredClone(release)));
  for (const mutate of [
    (value) => {
      value.appVersion = 'v01.2.3';
    },
    (value) => {
      value.apiImage = 'ghcr.io/aculy/bangumi-staff-stats-api:latest';
    },
    (value) => {
      value.unreviewed = true;
    },
  ]) {
    const changed = structuredClone(release);
    mutate(changed);
    assert.throws(() => validateRelease(changed));
  }

  const validateEvent = compileStrictSchema(
    readSchema('update-activated-v1.schema.json'),
  );
  const event = {
    app_version: 'v1.2.3',
    duration_seconds: 10,
    event: 'update_activated',
    new_data_version: `dv1-${'1'.repeat(64)}`,
    old_data_version: `dv1-${'2'.repeat(64)}`,
    run_id: `run-${'3'.repeat(32)}`,
  };
  assert.doesNotThrow(() => validateEvent(structuredClone(event)));
  for (const mutate of [
    (value) => {
      value.duration_seconds = 21601;
    },
    (value) => {
      value.event = 'update_started';
    },
    (value) => {
      value.extra = true;
    },
  ]) {
    const changed = structuredClone(event);
    mutate(changed);
    assert.throws(() => validateEvent(changed));
  }
});

test('host release admission binds the published fixture authority constants', () => {
  const fixture = readJsonStrict(
    new URL('../release/fixtures/release-manifest.valid.json', import.meta.url),
  );
  const transaction = fs.readFileSync(
    new URL('../../bin/lib/transaction.sh', import.meta.url),
    'utf8',
  );
  for (const value of [
    fixture.acceptedDevelopment.receiptDigest,
    fixture.acceptedDevelopment.frozenProduct.revision,
    fixture.acceptedDevelopment.frozenProduct.tree,
    fixture.compatibility.archive.commonCommit,
    fixture.compatibility.archive.compatibilityMatrixDigest,
    fixture.compatibility.archive.manifestSchemaDigest,
    fixture.compatibility.archive.schemaSqlDigest,
    fixture.compatibility.openapiDigest,
    fixture.images.prometheus.reference,
    fixture.images.prometheus.amd64ManifestDigest,
  ]) {
    assert.ok(transaction.includes(value), `missing runtime authority ${value}`);
  }
  assert.match(
    transaction,
    /\.source\.operationsController == \.source\.release/u,
  );
  assert.match(
    transaction,
    /\.source\.operationsController\.revision == \$controllerRevision/u,
  );
});
