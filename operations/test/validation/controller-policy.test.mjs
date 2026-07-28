import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  ActionsHandoffError,
  validateActionsAuthorityMetadata,
} from '../../validation/actions-handoff.mjs';

function source(relative) {
  return fs.readFileSync(
    new URL(`../../validation/${relative}`, import.meta.url),
    'utf8',
  );
}

function validRawActionsMetadata() {
  const head = '1'.repeat(40);
  const repository = {
    full_name: 'AcuLY/BangumiStaffStats',
    id: 987654321,
    name: 'BangumiStaffStats',
    owner: { login: 'AcuLY' },
  };
  const workflow = {
    id: 456789,
    name: 'operations-verification',
    path: '.github/workflows/operations.yml',
    state: 'active',
  };
  const run = {
    conclusion: 'success',
    event: 'push',
    head_repository: repository,
    head_sha: head,
    id: 123456,
    name: 'operations-verification',
    path:
      '.github/workflows/operations.yml@refs/heads/codex/formal-rewrite',
    repository,
    run_attempt: 2,
    run_started_at: '2026-07-28T00:00:00Z',
    status: 'completed',
    updated_at: '2026-07-28T00:10:00Z',
    workflow_id: workflow.id,
  };
  const artifact = {
    created_at: '2026-07-28T00:05:00Z',
    digest: `sha256:${'a'.repeat(64)}`,
    expired: false,
    expires_at: '2026-07-29T00:05:00Z',
    id: 789012,
    name: `bgmss-operations-validation-${head}`,
    size_in_bytes: 4096,
    workflow_run: {
      head_repository_id: repository.id,
      head_sha: head,
      id: run.id,
      repository_id: repository.id,
    },
  };
  return {
    artifact,
    nowEpochMs: Date.parse('2026-07-28T00:15:00Z'),
    repository,
    run,
    runAttempt: structuredClone(run),
    workflow,
  };
}

test('SSH controller terminates the complete local process group', () => {
  const value = source('ssh.mjs');
  assert.match(value, /detached: true/u);
  assert.match(value, /process\.kill\(-child\.pid, 'SIGTERM'\)/u);
  assert.match(value, /process\.kill\(-child\.pid, 'SIGKILL'\)/u);
  assert.match(value, /StrictHostKeyChecking=yes/u);
  assert.match(value, /BatchMode=yes/u);
  assert.match(value, /ForwardAgent=no/u);
  assert.match(value, /stdout\.truncated\) terminate\('output-limit'\)/u);
  assert.match(value, /stderr\.truncated\) terminate\('output-limit'\)/u);
});

test('controller signals terminate active transfer groups and enter sealed recovery', () => {
  const ssh = source('ssh.mjs');
  const controller = source('validate-myserver.mjs');
  assert.match(ssh, /activeTerminators/u);
  assert.match(ssh, /terminateActiveSshProcesses/u);
  for (const signal of ['SIGHUP', 'SIGINT', 'SIGTERM']) {
    assert.match(controller, new RegExp(`'${signal}'`, 'u'));
  }
  assert.match(controller, /terminateActiveSshProcesses/u);
  const dispatched = controller.indexOf('remoteMutated = true;');
  const bootstrap = controller.indexOf('const bootstrapResult = await runSshScript');
  assert.ok(dispatched > 0 && dispatched < bootstrap);
  assert.match(controller, /if \(remoteMutated\)/u);
  assert.match(controller, /markerDigest \?\? 'discover'/u);
  assert.doesNotMatch(controller, /ledgerHead \?\? 'discover'/u);
  assert.match(
    controller,
    /markerDigest \?\? 'discover',\s*'discover'/u,
  );
  assert.match(controller, /assertControllerActive\(\)/u);
});

test('Actions authority rejects wrong repository, workflow, attempt, age, and artifact linkage', () => {
  const valid = validRawActionsMetadata();
  const authority = validateActionsAuthorityMetadata(valid);
  assert.equal(authority.repository.owner, 'AcuLY');
  assert.equal(authority.workflow.path, '.github/workflows/operations.yml');
  assert.equal(authority.run.attempt, 2);

  const repository = validRawActionsMetadata();
  repository.repository.full_name = 'foreign/BangumiStaffStats';
  assert.throws(
    () => validateActionsAuthorityMetadata(repository),
    ActionsHandoffError,
  );

  const workflow = validRawActionsMetadata();
  workflow.workflow.path = '.github/workflows/ci.yml';
  assert.throws(
    () => validateActionsAuthorityMetadata(workflow),
    ActionsHandoffError,
  );

  const attempt = validRawActionsMetadata();
  attempt.runAttempt.run_attempt = 1;
  assert.throws(
    () => validateActionsAuthorityMetadata(attempt),
    ActionsHandoffError,
  );

  const old = validRawActionsMetadata();
  old.artifact.expires_at = '2026-07-30T00:05:00Z';
  old.nowEpochMs =
    Date.parse(old.artifact.created_at) + 24 * 60 * 60 * 1000 + 1;
  assert.throws(
    () => validateActionsAuthorityMetadata(old),
    ActionsHandoffError,
  );

  const retainedTooLong = validRawActionsMetadata();
  retainedTooLong.artifact.expires_at = '2026-07-29T00:05:00.001Z';
  assert.throws(
    () => validateActionsAuthorityMetadata(retainedTooLong),
    ActionsHandoffError,
  );

  const artifact = validRawActionsMetadata();
  artifact.artifact.workflow_run.id += 1;
  assert.throws(
    () => validateActionsAuthorityMetadata(artifact),
    ActionsHandoffError,
  );
});

test('Actions handoff discovery rejects exact-name ambiguity and rechecks authority after download', () => {
  const actions = source('actions-handoff.mjs');
  assert.match(actions, /artifact\?\.name === artifactName/u);
  assert.match(actions, /if \(matching\.length !== 1\)/u);
  assert.match(actions, /actions\/runs\/\$\{runId\}\/attempts\/\$\{attemptNumber\}/u);
  assert.match(actions, /actions\/artifacts\/\$\{listed\.artifact\.id\}/u);
  assert.match(actions, /canonicalJson\(before\) !== canonicalJson\(after\)/u);
  assert.match(actions, /ARTIFACT_MAXIMUM_AGE_MS/u);
});

test('validation repeats Actions, package, identity, and preflight before mutation', () => {
  const value = source('validate-myserver.mjs');
  const bootstrap = value.indexOf("new URL('./remote/bootstrap.sh'");
  assert.ok(bootstrap > 0);
  assert.ok(
    value.lastIndexOf('verifyAuthenticatedActionsHandoff', bootstrap) <
      bootstrap,
  );
  assert.ok(
    value.lastIndexOf('verifySealedValidationPackage', bootstrap) <
      bootstrap,
  );
  assert.ok(value.lastIndexOf('assertOperationsIdentity', bootstrap) < bootstrap);
  assert.ok(value.lastIndexOf('runPreflight(', bootstrap) < bootstrap);
  assert.equal(
    (value.match(/verifyAuthenticatedActionsHandoff\(\{/gu) ?? []).length,
    2,
  );
  assert.ok((value.match(/await runPreflight\(/gu) ?? []).length >= 3);
});

test('capacity projection fails instead of clipping above sixteen GiB', () => {
  const value = source('preflight-myserver.mjs');
  assert.match(
    value,
    /projected > MAXIMUMS\.transferTotalBytes/u,
  );
  assert.match(
    value,
    /validation capacity projection exceeds the admitted transfer bound/u,
  );
  assert.doesNotMatch(value, /Math\.min\([^)]*transferTotalBytes/u);
});

test('controller seals local command, security, and continuous-health authority', () => {
  const packageSource = source('package.mjs');
  const controller = source('validate-myserver.mjs');
  const policy = source('policy.mjs');
  assert.match(packageSource, /expectedValidationAuthority/u);
  assert.match(packageSource, /'validation\/authority\.mjs'/u);
  assert.match(
    controller,
    /cleanup,commands,continuousHealth,errors,exercises,health,producer,statuses/u,
  );
  assert.match(
    controller,
    /securityProjection: envelope\.resources\.securityProjection/u,
  );
  assert.match(policy, /assertCommandSemantics/u);
  assert.match(policy, /assertContinuousHealth/u);
  assert.match(policy, /const expectedAuthority = expectedValidationAuthority\(\{/u);
  assert.match(
    policy,
    /canonicalJson\(input\.authority\) !== canonicalJson\(expectedAuthority\)/u,
  );
  assert.match(
    policy,
    /validation input authority differs from the local closed model/u,
  );
});

test('controller digest closes preflight and its transitive repository dependencies', () => {
  const packageSource = source('package.mjs');
  assert.match(
    packageSource,
    /images[.]api[.]declaredLoadReference,\s*expectedMtime: 0/u,
  );
  assert.match(
    packageSource,
    /images[.]updater[.]declaredLoadReference,\s*expectedMtime: handoff[.]candidate[.]sourceEpoch/u,
  );
  for (const relative of [
    '../VERSION',
    '../contracts/artifacts/lib/canonical-json.mjs',
    '../contracts/artifacts/lib/strict-json.mjs',
    '../contracts/artifacts/lib/validation.mjs',
    '../contracts/schemas/archive/compatibility-matrix.json',
    'lib/canonical-json.mjs',
    'lib/digest.mjs',
    'lib/evidence-policy.mjs',
    'lib/immutable-output.mjs',
    'lib/path-policy.mjs',
    'lib/schema.mjs',
    'lib/strict-json.mjs',
    'release/constants.mjs',
    'release/docker-capability.mjs',
    'release/files.mjs',
    'release/oci.mjs',
    'release/receipt.mjs',
    'release/tar.mjs',
    'release/verify-candidate-lib.mjs',
    'schemas/release-accepted-development-v1.schema.json',
    'schemas/release-tag-candidate-v1.schema.json',
    'schemas/release-validation-candidate-v1.schema.json',
    'validation/remote/preflight.sh',
  ]) {
    assert.ok(packageSource.includes(`'${relative}'`), relative);
  }
});
