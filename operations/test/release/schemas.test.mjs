import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { canonicalJson } from '../../lib/canonical-json.mjs';
import { compileStrictSchema } from '../../lib/schema.mjs';
import {
  parseCanonicalJson,
  readJsonStrict,
} from '../../lib/strict-json.mjs';
import { assertVersionTag } from '../../release/cli.mjs';
import {
  parseAcceptedDevelopment,
  readAcceptedDevelopment,
} from '../../release/receipt.mjs';
import {
  assertPublishedReleaseAuthority,
} from '../../release/publication.mjs';
import { ACCEPTED_DEVELOPMENT_SHA256 } from '../../release/constants.mjs';
import {
  admitDockerCapability,
  MINIMUM_DOCKER_API_VERSION,
} from '../../release/docker-capability.mjs';

const FIXTURES = path.join(import.meta.dirname, 'fixtures');
const SCHEMAS = path.resolve(import.meta.dirname, '..', '..', 'schemas');

test('published release fixture is canonical and satisfies its strict schema', () => {
  const schema = readJsonStrict(
    path.join(SCHEMAS, 'release-manifest-v1.schema.json'),
  );
  const validate = compileStrictSchema(schema, {
    label: 'published release manifest schema',
  });
  const source = fs.readFileSync(
    path.join(FIXTURES, 'release-manifest.valid.json'),
    'utf8',
  );
  const manifest = parseCanonicalJson(source, 'published release fixture');
  assert.equal(source, canonicalJson(manifest));
  assert.doesNotThrow(() => validate(manifest));
});

test('all release tag authorities reject leading zeroes and prereleases', () => {
  for (const invalid of [
    'v01.2.3',
    'v1.02.3',
    'v1.2.03',
    'v1.2.3-rc.1',
    '1.2.3',
  ]) {
    assert.throws(() => assertVersionTag(invalid));
  }
  assert.equal(assertVersionTag('v0.1.0'), 'v0.1.0');

  const schema = readJsonStrict(
    path.join(SCHEMAS, 'release-manifest-v1.schema.json'),
  );
  const validate = compileStrictSchema(schema);
  const manifest = readJsonStrict(
    path.join(FIXTURES, 'release-manifest.valid.json'),
  );
  for (const invalid of ['v01.2.3', 'v1.2.3-rc.1']) {
    const changed = structuredClone(manifest);
    changed.release.tag = invalid;
    changed.release.version = invalid;
    assert.throws(() => validate(changed));
  }
});

test('both unpublished candidate schemas bind the exact build toolchain closure', () => {
  for (const name of [
    'release-tag-candidate-v1.schema.json',
    'release-validation-candidate-v1.schema.json',
  ]) {
    const schema = readJsonStrict(path.join(SCHEMAS, name));
    assert.ok(schema.required.includes('toolchain'));
    assert.equal(schema.$defs.toolchain.additionalProperties, false);
    assert.equal(
      schema.$defs.toolchain.properties.buildxVersion.const,
      '0.34.1',
    );
    assert.equal(
      schema.$defs.toolchain.properties.buildkitVersion.const,
      '0.27.1',
    );
    assert.equal(
      schema.$defs.toolchain.properties.nodeVersion.const,
      '24.18.0',
    );
    assert.equal(
      schema.$defs.toolchain.properties.npmVersion.const,
      '11.16.0',
    );
    assert.ok(
      schema.$defs.toolchain.required.includes(
        'dockerNegotiatedApiVersion',
      ),
    );
    assert.ok(
      schema.$defs.toolchain.required.includes('dockerServerApiVersion'),
    );
    assert.ok(
      schema.$defs.toolchain.required.includes(
        'dockerServerMinimumApiVersion',
      ),
    );
  }
});

test('Docker admission uses API capability while preserving version evidence', () => {
  const admitted = admitDockerCapability({
    dockerClientVersion: '28.0.4+azure-1',
    dockerNegotiatedApiVersion: '1.48',
    dockerServerApiVersion: '1.48',
    dockerServerArchitecture: 'x86_64',
    dockerServerMinimumApiVersion: '1.24',
    dockerServerOs: 'linux',
    dockerServerVersion: '28.0.4+azure-1',
  });
  assert.equal(admitted.dockerClientVersion, '28.0.4+azure-1');
  assert.equal(admitted.dockerServerArchitecture, 'amd64');
  assert.equal(MINIMUM_DOCKER_API_VERSION, '1.45');

  for (const changed of [
    { dockerNegotiatedApiVersion: '1.44' },
    { dockerNegotiatedApiVersion: '1.49' },
    {
      dockerNegotiatedApiVersion: '1.45',
      dockerServerMinimumApiVersion: '1.46',
    },
    { dockerServerOs: 'windows' },
    { dockerServerVersion: '28.0.4 vendor' },
  ]) {
    assert.throws(() =>
      admitDockerCapability({
        ...admitted,
        ...changed,
      }),
    );
  }
});

test('checked-in accepted-development receipt retains its fixed closure', () => {
  const receipt = readAcceptedDevelopment();
  assert.equal(
    receipt.value.lifecycleStatus,
    'development-acceptance-closed-by-authorized-ci-and-remote-evidence',
  );
  assert.equal(
    receipt.value.priorDevelopmentArtifacts.status,
    'not-materialized-for-authorized-closure',
  );
  assert.equal(
    receipt.value.remoteEvidence.formalMatrix.unexecutedCells.length,
    56,
  );

  const duplicatePath = structuredClone(receipt.value);
  duplicatePath.authorities.buildDefinitions[1].path =
    duplicatePath.authorities.buildDefinitions[0].path;
  assert.throws(
    () => parseAcceptedDevelopment(canonicalJson(duplicatePath)),
    /fixed inventory and order/u,
  );

  const duplicateTool = structuredClone(receipt.value);
  duplicateTool.authorities.toolchains[1].name =
    duplicateTool.authorities.toolchains[0].name;
  assert.throws(
    () => parseAcceptedDevelopment(canonicalJson(duplicateTool)),
    /fixed inventory and order/u,
  );
});

test('published authority rejects drift and manifest schema rejects unknown fields', () => {
  const schema = readJsonStrict(
    path.join(SCHEMAS, 'release-manifest-v1.schema.json'),
  );
  const validate = compileStrictSchema(schema);
  const manifest = readJsonStrict(
    path.join(FIXTURES, 'release-manifest.valid.json'),
  );
  manifest.acceptedDevelopment.receiptDigest =
    ACCEPTED_DEVELOPMENT_SHA256;
  assert.doesNotThrow(() => assertPublishedReleaseAuthority(manifest));
  for (const mutate of [
    (value) => {
      value.acceptedDevelopment.receiptDigest =
        'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    },
    (value) => {
      value.source.operationsController.revision =
        'ffffffffffffffffffffffffffffffffffffffff';
    },
    (value) => {
      value.release.version = 'v0.2.0';
    },
  ]) {
    const changed = structuredClone(manifest);
    mutate(changed);
    assert.throws(() => assertPublishedReleaseAuthority(changed));
  }
  const unknown = structuredClone(manifest);
  unknown.unreviewed = true;
  assert.throws(() => validate(unknown));
});
