import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { compileStrictSchema } from '../../lib/schema.mjs';
import { readJsonStrict } from '../../lib/strict-json.mjs';
import { readAcceptedDevelopment } from '../../release/receipt.mjs';

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
  const receipt = readAcceptedDevelopment();
  const fixture = readJsonStrict(
    new URL('../release/fixtures/release-manifest.valid.json', import.meta.url),
  );
  const acceptedDevelopment = {
    frozenProduct: { ...receipt.value.frozenProduct },
    receiptDigest: receipt.digest,
  };
  assert.deepEqual(
    {
      frozenProduct: { ...fixture.acceptedDevelopment.frozenProduct },
      receiptDigest: fixture.acceptedDevelopment.receiptDigest,
    },
    acceptedDevelopment,
  );
  const transaction = fs.readFileSync(
    new URL('../../bin/lib/transaction.sh', import.meta.url),
    'utf8',
  );
  for (const value of [
    acceptedDevelopment.receiptDigest,
    acceptedDevelopment.frozenProduct.revision,
    acceptedDevelopment.frozenProduct.tree,
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
  const fixedAuthority = [
    [
      'OPS_ACCEPTED_DEVELOPMENT_SHA256',
      acceptedDevelopment.receiptDigest,
    ],
    [
      'OPS_FINAL_PRODUCT_REVISION',
      acceptedDevelopment.frozenProduct.revision,
    ],
    [
      'OPS_FINAL_PRODUCT_TREE',
      acceptedDevelopment.frozenProduct.tree,
    ],
  ];
  const assertFixedAuthority = (source) => {
    for (const [name, value] of fixedAuthority) {
      assert.ok(
        source.includes(`readonly ${name}="${value}"`),
        `runtime fixed authority ${name} differs from the canonical receipt`,
      );
    }
  };
  assertFixedAuthority(transaction);
  for (const [name, value] of fixedAuthority) {
    const changed = transaction.replace(
      `readonly ${name}="${value}"`,
      `readonly ${name}="__MUTATED_${name}__"`,
    );
    assert.throws(() => assertFixedAuthority(changed));
  }
  for (const binding of [
    '--arg acceptedDevelopmentSha256 "$OPS_ACCEPTED_DEVELOPMENT_SHA256"',
    '--arg finalProductRevision "$OPS_FINAL_PRODUCT_REVISION"',
    '--arg finalProductTree "$OPS_FINAL_PRODUCT_TREE"',
    '.acceptedDevelopment.receiptDigest ==\n      $acceptedDevelopmentSha256',
    '.acceptedDevelopment.frozenProduct.revision ==\n      $finalProductRevision',
    '.acceptedDevelopment.frozenProduct.tree ==\n      $finalProductTree',
  ]) {
    assert.ok(
      transaction.includes(binding),
      `missing fixed accepted-development transaction binding ${binding}`,
    );
  }
});
