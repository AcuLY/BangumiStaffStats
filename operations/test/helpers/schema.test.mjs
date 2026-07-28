import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  AUTHORIZATION_SCHEMA_VERSION,
  AUTHORIZED_LIFECYCLE_STATUS,
  buildOperationsAuthorizationInput,
  operationsAuthorizationInputDigest,
  parseOperationsAuthorizationInput,
} from '../../lib/authorization-input.mjs';
import { canonicalJson } from '../../lib/canonical-json.mjs';
import {
  assertEvidenceSafe,
  EvidencePolicyError,
} from '../../lib/evidence-policy.mjs';
import {
  compileStrictSchema,
  isContainerImageReference,
  parseAndValidateCanonicalJson,
  SchemaValidationError,
} from '../../lib/schema.mjs';
import { parseJsonStrict, readJsonStrict } from '../../lib/strict-json.mjs';

const fixture = (name) =>
  fs.readFileSync(new URL(`fixtures/${name}`, import.meta.url), 'utf8');
const boundariesSchema = readJsonStrict(
  new URL('../../schemas/foundation-boundaries-v1.schema.json', import.meta.url),
);
const validateBoundaries = compileStrictSchema(boundariesSchema, {
  label: 'foundation boundaries v1',
});

test('strict schema accepts only the closed boundary formats', () => {
  const valid = parseAndValidateCanonicalJson(
    fixture('boundaries.valid.json'),
    validateBoundaries,
  );
  assert.equal(valid.schemaVersion, 'foundation-boundaries-v1');
  for (const name of [
    'boundaries.invalid-absolute-path.json',
    'boundaries.invalid-digest.json',
    'boundaries.invalid-image-reference.json',
    'boundaries.invalid-oid.json',
    'boundaries.invalid-relative-path.json',
  ]) {
    assert.throws(
      () =>
        parseAndValidateCanonicalJson(fixture(name), validateBoundaries, {
          label: name,
        }),
      SchemaValidationError,
    );
  }
});

test('container image references close tags, digests, and registry ports', () => {
  const digest = `sha256:${'a'.repeat(64)}`;
  assert.equal(
    isContainerImageReference(
      `prom/prometheus:v3.13.1-distroless@${digest}`,
    ),
    true,
  );
  assert.equal(
    isContainerImageReference(`prom/prometheus@${digest}`),
    true,
  );
  assert.equal(
    isContainerImageReference('localhost/bgmss-api:v0.1.0'),
    true,
  );
  assert.equal(
    isContainerImageReference(`registry.example:65535/bgmss/api@${digest}`),
    true,
  );
  for (const value of [
    'prom/prometheus',
    'prom/prometheus:latest',
    `prom/prometheus:latest@${digest}`,
    `registry.example:0/bgmss/api@${digest}`,
    `registry.example:65536/bgmss/api@${digest}`,
  ]) {
    assert.equal(isContainerImageReference(value), false, value);
  }
});

test('authorization input fixture binds the authorized non-formal closure', () => {
  const value = parseOperationsAuthorizationInput(
    fixture('authorization.valid.json'),
  );
  assert.equal(value.schemaVersion, AUTHORIZATION_SCHEMA_VERSION);
  assert.equal(value.lifecycleStatus, AUTHORIZED_LIFECYCLE_STATUS);
  assert.equal(value.applicationVersion, 'v0.1.0');
  assert.equal(value.acceptanceControl.formalResultPresent, false);
  assert.equal(value.acceptanceControl.formalVerdictPresent, false);
  assert.equal(
    value.authorities.priorDevelopmentArtifacts.reusePolicy,
    'ephemeral-ci-output-is-not-a-reusable-operations-input',
  );
  assert.equal(
    value.authorities.priorDevelopmentArtifacts.status,
    'not-materialized-for-authorized-closure',
  );
  assert.match(
    operationsAuthorizationInputDigest(value),
    /^sha256:[0-9a-f]{64}$/u,
  );
});

test('authorization builder fixes authority constants and deterministic order', () => {
  const source = parseOperationsAuthorizationInput(
    fixture('authorization.valid.json'),
  );
  const fields = JSON.parse(JSON.stringify(source));
  delete fields.schemaVersion;
  delete fields.lifecycleStatus;
  fields.remoteEvidence.unexecutedFormalCells.reverse();
  const built = buildOperationsAuthorizationInput(fields);
  assert.equal(built.schemaVersion, AUTHORIZATION_SCHEMA_VERSION);
  assert.equal(built.lifecycleStatus, AUTHORIZED_LIFECYCLE_STATUS);
  assert.deepEqual(built.remoteEvidence.unexecutedFormalCells, [
    'archive/full',
    'browser/oracle',
    'performance/budget',
  ]);
  assert.throws(
    () =>
      buildOperationsAuthorizationInput({
        ...fields,
        schemaVersion: AUTHORIZATION_SCHEMA_VERSION,
      }),
    /fixed by the builder/u,
  );
});

test('authorization validation rejects unknown and fabricated evidence', () => {
  assert.throws(
    () =>
      parseOperationsAuthorizationInput(
        fixture('authorization.unknown-field.json'),
      ),
    SchemaValidationError,
  );

  const valid = JSON.parse(fixture('authorization.valid.json'));
  valid.formalResultDigest =
    'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';
  assert.throws(
    () => parseOperationsAuthorizationInput(canonicalJson(valid)),
    SchemaValidationError,
  );

  delete valid.formalResultDigest;
  valid.authorities.priorDevelopmentArtifacts.artifactSetDigest =
    'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
  assert.throws(
    () => parseOperationsAuthorizationInput(canonicalJson(valid)),
    SchemaValidationError,
  );

  delete valid.authorities.priorDevelopmentArtifacts.artifactSetDigest;
  valid.remoteEvidence.exceptions[0].rationale =
    'development-accepted-operations-pending';
  assert.throws(
    () => parseOperationsAuthorizationInput(canonicalJson(valid)),
    EvidencePolicyError,
  );
});

test('evidence policy rejects secret-shaped and nondeterministic fields', () => {
  assert.throws(
    () =>
      assertEvidenceSafe(
        parseJsonStrict(fixture('authorization.secret-shaped.json')),
      ),
    EvidencePolicyError,
  );
  assert.throws(
    () =>
      assertEvidenceSafe(
        parseJsonStrict(fixture('authorization.nondeterministic.json')),
      ),
    EvidencePolicyError,
  );
});
