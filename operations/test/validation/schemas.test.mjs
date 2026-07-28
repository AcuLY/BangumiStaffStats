import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalJsonDigest } from '../../lib/canonical-json.mjs';
import {
  schemaSources,
  validateValidationInput,
  validateValidationPreflight,
  validateValidationResources,
  validateValidationResult,
} from '../../validation/schema.mjs';
import {
  fixtureDigest,
  validInput,
  validPreflight,
  validResources,
} from './fixtures.mjs';

function clone(value) {
  return structuredClone(value);
}

test('validation schemas accept one closed success-input evidence set', () => {
  const input = validInput();
  const preflight = validPreflight();
  const resources = validResources(input);
  assert.equal(validateValidationInput(input), input);
  assert.equal(validateValidationPreflight(preflight), preflight);
  assert.equal(validateValidationResources(resources), resources);
});

test('validation schemas reject unknown fields and unsafe digest/platform data', () => {
  const unknown = validInput();
  unknown.remote.extra = true;
  assert.throws(() => validateValidationInput(unknown));

  const platform = validInput();
  platform.candidate.target = 'linux/arm64';
  assert.throws(() => validateValidationInput(platform));

  const digest = validInput();
  digest.images.api.config.digest = 'sha256:not-a-digest';
  assert.throws(() => validateValidationInput(digest));
});

test('validation schemas reject weakened Actions repository, workflow, attempt, and artifact authority', () => {
  const repository = validInput();
  repository.transport.actions.repository.owner = 'foreign';
  assert.throws(() => validateValidationInput(repository));

  const workflow = validInput();
  workflow.transport.actions.workflow.path = '.github/workflows/ci.yml';
  assert.throws(() => validateValidationInput(workflow));

  const attempt = validInput();
  attempt.transport.actions.run.attempt = 0;
  assert.throws(() => validateValidationInput(attempt));

  const artifact = validInput();
  artifact.transport.actions.artifact.expired = true;
  assert.throws(() => validateValidationInput(artifact));
});

test('authority projection schemas stay structurally aligned and reject weakened input', () => {
  const sources = schemaSources();
  const schemas = Object.fromEntries(
    Object.entries(sources).map(([name, source]) => [
      name,
      JSON.parse(source.toString('utf8')),
    ]),
  );
  assert.deepEqual(
    schemas.input.$defs.securityProjection,
    schemas.resources.$defs.securityProjection,
  );
  assert.deepEqual(
    schemas.input.$defs.serviceSecurityProjection,
    schemas.result.$defs.serviceSecurityProjection,
  );
  assert.deepEqual(
    schemas.result.$defs.continuousHealthState.properties.projections.required,
    [
      'buildDigest',
      'metricsDigest',
      'prometheusDigest',
      'prometheusScrapeDigest',
      'queryResultDigest',
      'readyDigest',
      'typedQueryDigest',
    ],
  );

  const command = clone(validInput());
  command.authority.commands.records.pop();
  assert.throws(() => validateValidationInput(command));

  const continuous = clone(validInput());
  continuous.authority.continuousHealth.policy.intervalSeconds = 31;
  assert.throws(() => validateValidationInput(continuous));
});

test('failed result can preserve bounded partial evidence without a green claim', () => {
  const input = validInput();
  const before = validPreflight();
  const resources = validResources(input);
  resources.containers = [];
  resources.images = [];
  resources.networks = [];
  resources.pathManifest = null;
  resources.securityProjection = null;
  resources.securityProjectionDigest = null;
  const result = {
    claim:
      'isolated-operations-validation-failed-production-not-activated',
    cleanup: {
      namedVolumesNeverObserved: true,
      residue: ['container:replacement'],
      rootAbsent: false,
      status: 'failed',
      zeroResidue: false,
    },
    commands: [],
    continuousHealth: null,
    conclusion: 'failed',
    deployed: false,
    errors: {
      primary: 'CONTAINER_IDENTITY_CHANGED',
      secondary: ['CLEANUP_FAILED'],
    },
    exercises: {
      actionsCoveredExercises: {
        candidateDigest: input.candidate.contentAddress,
        operationsRevision: input.source.operations.revision,
        updaterNoChange: true,
        updaterTimeout: true,
        workflowHead: input.transport.actions.run.headSha,
        workflowRunAttempt: input.transport.actions.run.attempt,
        workflowRunId: input.transport.actions.run.id,
      },
      remoteExercises: {
        archiveCorruptionRejected: null,
        frontendRollback: null,
        lockContentionRejected: null,
        postSwitchRollback: null,
        updaterFailure: null,
      },
    },
    health: {
      full: null,
      minimal: null,
      reactivated: null,
      rolledBack: null,
    },
    inputDigest: canonicalJsonDigest(input),
    nonInterference: {
      afterDigest: fixtureDigest('1'),
      beforeDigest: fixtureDigest('2'),
      differences: [ "absence.rootAbsent" ],
      equal: false,
    },
    preflightDigest: canonicalJsonDigest(before),
    producer: null,
    productionActivated: false,
    released: false,
    resourcesDigest: canonicalJsonDigest(resources),
    runId: input.runId,
    schemaVersion: 'operations-validation-result-v1',
    securityProjection: null,
    securityProjectionDigest: null,
    source: input.source,
    statuses: {
      cleanup: 'failed',
      primary: 'failed',
      rollback: 'not-needed',
    },
    transport: input.transport,
  };
  assert.equal(validateValidationResult(result), result);

  const overclaim = clone(result);
  overclaim.claim =
    'isolated-operations-validated-production-not-activated';
  overclaim.unexpected = true;
  assert.throws(() => validateValidationResult(overclaim));
});
