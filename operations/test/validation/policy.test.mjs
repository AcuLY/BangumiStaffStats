import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canonicalJsonDigest,
} from '../../lib/canonical-json.mjs';
import {
  assertInputSemantics,
  assertResourcesSemantics,
  assertResultSemantics,
  comparePreflights,
  ValidationPolicyError,
} from '../../validation/policy.mjs';
import {
  fixtureDataVersion,
  fixtureDigest,
  validCommands,
  validCommandProof,
  validContinuousHealth,
  validHealthEvidence,
  validInput,
  validPreflight,
  validResources,
} from './fixtures.mjs';

function clone(value) {
  return structuredClone(value);
}

test('sealed input requires one exact unique transfer role mapping', () => {
  const input = validInput();
  assert.equal(assertInputSemantics(input).roles.size, 18);
  const duplicate = clone(input);
  duplicate.transfer.files[1].role = duplicate.transfer.files[0].role;
  assert.throws(
    () => assertInputSemantics(duplicate),
    ValidationPolicyError,
  );
  const mismatched = clone(input);
  mismatched.runtime.remoteEntryFileId = mismatched.runtime.composeFileId;
  assert.throws(
    () => assertInputSemantics(mismatched),
    ValidationPolicyError,
  );
  const authorityDrift = clone(validInput());
  authorityDrift.authority.security.projection.services[0].environment.EXTRA =
    '1';
  assert.throws(
    () => assertInputSemantics(authorityDrift),
    ValidationPolicyError,
  );
  const runtimeDrift = clone(validInput());
  runtimeDrift.transfer.files.find(
    (entry) => entry.role === 'compose',
  ).sha256 = fixtureDigest('f');
  assert.throws(
    () => assertInputSemantics(runtimeDrift),
    ValidationPolicyError,
  );
});

test('sealed input requires exact Actions authority linkage and one-day retention', () => {
  assert.equal(
    assertInputSemantics(validInput()).input.transport.actions.workflow.path,
    '.github/workflows/operations.yml',
  );

  const wrongRepository = validInput();
  wrongRepository.transport.actions.artifact.repositoryId = '111';
  assert.throws(
    () => assertInputSemantics(wrongRepository),
    ValidationPolicyError,
  );

  const wrongRun = validInput();
  wrongRun.transport.actions.artifact.runId = '654321';
  assert.throws(
    () => assertInputSemantics(wrongRun),
    ValidationPolicyError,
  );

  const oldArtifact = validInput();
  oldArtifact.transport.actions.artifact.expirationEpochMs += 1;
  assert.throws(
    () => assertInputSemantics(oldArtifact),
    ValidationPolicyError,
  );
});

test('postflight comparison preserves concrete drift without overclaim', () => {
  const before = validPreflight();
  const after = clone(before);
  after.capacity.availableBytes -= 1024;
  assert.equal(comparePreflights(before, after).equal, true);

  const drift = clone(after);
  drift.protected.legacyTree.digest = fixtureDigest('f');
  assert.deepEqual(comparePreflights(before, drift).differences, [
    'protected',
  ]);

  const insufficient = clone(after);
  insufficient.capacity.availableBytes =
    insufficient.capacity.requiredBytes - 1;
  assert.deepEqual(comparePreflights(before, insufficient).differences, [
    'capacity.admission',
  ]);

  for (const [field, value] of [
    ['dockerNegotiatedApiVersion', '1.44'],
    ['dockerServerMinimumApiVersion', '1.46'],
    ['dockerServerApiVersion', '1.44'],
  ]) {
    const unsupported = clone(before);
    unsupported.host[field] = value;
    assert.throws(
      () => comparePreflights(unsupported, unsupported),
      ValidationPolicyError,
    );
  }

  const remoteDocker = clone(before);
  remoteDocker.host.dockerEndpoint = 'ssh://foreign.invalid';
  assert.throws(
    () => comparePreflights(remoteDocker, remoteDocker),
    ValidationPolicyError,
  );

  const missingHostCapability = clone(before);
  delete missingHostCapability.host.hostCapabilities.utilLinuxSetsidFork;
  assert.throws(
    () => comparePreflights(missingHostCapability, missingHostCapability),
    ValidationPolicyError,
  );
});

test('resource evidence requires exact network and image ownership', () => {
  const input = validInput();
  const resources = validResources(input);
  assert.equal(
    assertResourcesSemantics(resources, input).networks.length,
    2,
  );
  const externalRuntime = clone(resources);
  externalRuntime.networks[1].internal = false;
  assert.throws(
    () => assertResourcesSemantics(externalRuntime, input),
    ValidationPolicyError,
  );
  const foreignReference = clone(resources);
  foreignReference.images[0].references[0] =
    'localhost/foreign/image:replacement';
  assert.throws(
    () => assertResourcesSemantics(foreignReference, input),
    ValidationPolicyError,
  );
});

test('green result is impossible with partial health, residue, or overclaim', () => {
  const input = validInput();
  const before = validPreflight();
  const after = clone(before);
  after.capacity.availableBytes -= 4096;
  const resources = validResources(input);
  const minimal = fixtureDataVersion('a');
  const full = fixtureDataVersion('b');
  const fullManifestDigest = fixtureDigest('2');
  const result = {
    claim: 'isolated-operations-validated-production-not-activated',
    cleanup: {
      namedVolumesNeverObserved: true,
      residue: [],
      rootAbsent: true,
      status: 'succeeded',
      zeroResidue: true,
    },
    commands: validCommands(input, 100),
    continuousHealth: validContinuousHealth(input, resources, 100),
    conclusion:
      'isolated-operations-validated-production-not-activated',
    deployed: false,
    errors: { primary: null, secondary: [] },
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
        archiveCorruptionRejected:
          validCommandProof('archive-corruption', input, 100),
        frontendRollback:
          validCommandProof('frontend-rollback', input, 100),
        lockContentionRejected:
          validCommandProof('lock-contention', input, 100),
        postSwitchRollback:
          validCommandProof('post-switch-recovery', input, 100),
        updaterFailure:
          validCommandProof('updater-intentional-failure', input, 100),
      },
    },
    health: {
      full: validHealthEvidence(
        'full-health',
        full,
        fullManifestDigest,
        input,
        resources,
      ),
      minimal: validHealthEvidence(
        'minimal-health',
        minimal,
        input.minimalArchive.manifestDigest,
        input,
        resources,
      ),
      reactivated: validHealthEvidence(
        'reactivated-health',
        full,
        fullManifestDigest,
        input,
        resources,
      ),
      rolledBack: validHealthEvidence(
        'rollback-health',
        minimal,
        input.minimalArchive.manifestDigest,
        input,
        resources,
      ),
    },
    inputDigest: canonicalJsonDigest(input),
    nonInterference: comparePreflights(before, after),
    preflightDigest: canonicalJsonDigest(before),
    producer: {
      dataVersion: full,
      durationSeconds: 100,
      inputRows: 10,
      manifestDigest: fullManifestDigest,
      memoryLimitBytes: 671088640,
      oomKilled: false,
      outputRows: 20,
      peakMemoryBytes: 1000,
      proofCommandId: 'updater-produce',
      proofDigest: validCommands(input, 100).find(
        (entry) => entry.id === 'updater-produce',
      ).outputDigest,
      qualityDigest: fixtureDigest('3'),
      sqliteDigest: fixtureDigest('4'),
      statusDigest: fixtureDigest('5'),
      upstreamDigest: fixtureDigest('6'),
      upstreamRelease: 'dump-2026-07-28.000000Z',
    },
    productionActivated: false,
    released: false,
    resourcesDigest: canonicalJsonDigest(resources),
    runId: input.runId,
    schemaVersion: 'operations-validation-result-v1',
    securityProjection: resources.securityProjection,
    securityProjectionDigest: resources.securityProjectionDigest,
    source: input.source,
    statuses: {
      cleanup: 'succeeded',
      primary: 'succeeded',
      rollback: 'succeeded',
    },
    transport: input.transport,
  };
  for (const evidence of Object.values(result.health)) {
    result.commands.find(
      (command) => command.id === evidence.proofCommandId,
    ).outputDigest = evidence.stateDigest;
  }
  result.commands.find(
    (command) =>
      command.id ===
      result.continuousHealth.verificationProof.proofCommandId,
  ).outputDigest = result.continuousHealth.verificationProof.proofDigest;
  assert.equal(
    assertResultSemantics({ after, before, input, resources, result }),
    result,
  );
  const partial = clone(result);
  partial.health.full = null;
  assert.throws(
    () =>
      assertResultSemantics({
        after,
        before,
        input,
        resources,
        result: partial,
      }),
    ValidationPolicyError,
  );
  const residue = clone(result);
  residue.cleanup.residue = ['container:foreign'];
  assert.throws(
    () =>
      assertResultSemantics({
        after,
        before,
        input,
        resources,
        result: residue,
      }),
    ValidationPolicyError,
  );
  const wrongAttempt = clone(result);
  wrongAttempt.transport.actions.run.attempt += 1;
  assert.throws(
    () =>
      assertResultSemantics({
        after,
        before,
        input,
        resources,
        result: wrongAttempt,
      }),
    ValidationPolicyError,
  );
  const resultSecurityDrift = clone(result);
  resultSecurityDrift.securityProjection.services[0].environment.EXTRA = '1';
  assert.throws(
    () =>
      assertResultSemantics({
        after,
        before,
        input,
        resources,
        result: resultSecurityDrift,
      }),
    ValidationPolicyError,
  );
  for (const mutate of [
    (value) => {
      value.commands.shift();
    },
    (value) => {
      value.commands[1].id = value.commands[0].id;
    },
    (value) => {
      value.commands.find(
        (entry) => entry.id === 'archive-corruption',
      ).exitCode = 0;
    },
    (value) => {
      value.commands.find(
        (entry) => entry.id === 'updater-produce',
      ).proof = 'setup';
    },
    (value) => {
      value.commands.find(
        (entry) => entry.id === 'compose-create',
      ).argvDigest = fixtureDigest('9');
    },
  ]) {
    const commandDrift = clone(result);
    mutate(commandDrift);
    assert.throws(
      () =>
        assertResultSemantics({
          after,
          before,
          input,
          resources,
          result: commandDrift,
        }),
      ValidationPolicyError,
    );
  }

  for (const mutate of [
    (value) => {
      value.continuousHealth = true;
    },
    (value) => {
      value.continuousHealth.samples[1].state.failureCode =
        'MID_RUN_FAILURE';
    },
    (value) => {
      value.continuousHealth.samples[1].state.api.restartCount = 1;
    },
    (value) => {
      value.continuousHealth.after.pointer.inode = '99999';
    },
    (value) => {
      value.continuousHealth.samples[1].state.projections.readyDigest =
        fixtureDigest('1');
    },
    (value) => {
      value.continuousHealth.samples[1].state.projections.queryResultDigest =
        fixtureDigest('1');
    },
    (value) => {
      value.continuousHealth.samples[1].previousDigest =
        fixtureDigest('1');
    },
    (value) => {
      value.continuousHealth.count += 1;
    },
    (value) => {
      value.continuousHealth.samples[1].observedEpochMs += 1;
    },
    (value) => {
      value.continuousHealth.verificationProof.proofDigest =
        fixtureDigest('9');
    },
  ]) {
    const continuityDrift = clone(result);
    mutate(continuityDrift);
    assert.throws(() =>
      assertResultSemantics({
        after,
        before,
        input,
        resources,
        result: continuityDrift,
      }),
    );
  }

  const detachedHealthProof = clone(result);
  detachedHealthProof.health.minimal.proofDigest = fixtureDigest('8');
  detachedHealthProof.commands.find(
    (command) => command.id === 'minimal-health',
  ).outputDigest = fixtureDigest('8');
  assert.throws(() =>
    assertResultSemantics({
      after,
      before,
      input,
      resources,
      result: detachedHealthProof,
    }),
  );

  const detachedContinuousProof = clone(result);
  detachedContinuousProof.continuousHealth.verificationProof.proofDigest =
    fixtureDigest('8');
  detachedContinuousProof.commands.find(
    (command) => command.id === 'producer-minimal-health',
  ).outputDigest = fixtureDigest('8');
  assert.throws(() =>
    assertResultSemantics({
      after,
      before,
      input,
      resources,
      result: detachedContinuousProof,
    }),
  );

  const rollbackProjectionDrift = clone(result);
  rollbackProjectionDrift.health.rolledBack.state.projections.queryResultDigest =
    fixtureDigest('8');
  rollbackProjectionDrift.health.rolledBack.stateDigest = canonicalJsonDigest(
    rollbackProjectionDrift.health.rolledBack.state,
  );
  rollbackProjectionDrift.health.rolledBack.proofDigest =
    rollbackProjectionDrift.health.rolledBack.stateDigest;
  rollbackProjectionDrift.commands.find(
    (command) => command.id === 'rollback-health',
  ).outputDigest = rollbackProjectionDrift.health.rolledBack.stateDigest;
  assert.throws(() =>
    assertResultSemantics({
      after,
      before,
      input,
      resources,
      result: rollbackProjectionDrift,
    }),
  );
});

test('security authority is closed over environment, command, mount, restart, and digest', () => {
  const input = validInput();
  const resources = validResources(input);
  assert.equal(assertResourcesSemantics(resources, input), resources);

  for (const mutate of [
    (value) => {
      value.securityProjection.services[0].environment.EXTRA = '1';
    },
    (value) => {
      value.securityProjection.services[0].command.push('--extra');
    },
    (value) => {
      value.securityProjection.services[0].mounts.push({
        bindCreateHostPath: false,
        propagation: 'rprivate',
        readOnly: true,
        source: '/srv/bgmss-ops-validation/extra',
        target: '/extra',
        type: 'bind',
      });
    },
    (value) => {
      value.securityProjection.services[0].restart = 'no';
    },
    (value) => {
      value.securityProjectionDigest = fixtureDigest('f');
    },
  ]) {
    const drift = clone(resources);
    mutate(drift);
    assert.throws(
      () => assertResourcesSemantics(drift, input),
      ValidationPolicyError,
    );
  }
});
