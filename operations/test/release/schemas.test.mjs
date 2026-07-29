import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  canonicalJson,
  canonicalJsonDigest,
} from '../../lib/canonical-json.mjs';
import { sha256 } from '../../lib/digest.mjs';
import { compileStrictSchema } from '../../lib/schema.mjs';
import {
  parseCanonicalJson,
  readJsonStrict,
} from '../../lib/strict-json.mjs';
import { assertVersionTag } from '../../release/cli.mjs';
import {
  assertSelectedTargetArguments,
  parseAcceptedDevelopment,
  readAcceptedDevelopment,
  recomputeGitSourceArchiveIdentity,
  recomputeGitSourceInventory,
  verifySupersededAttemptLineage,
} from '../../release/receipt.mjs';
import {
  executableFromPath,
  GitRepository,
} from '../../release/git.mjs';
import {
  assertPublishedReleaseAuthority,
} from '../../release/publication.mjs';
import {
  ACCEPTANCE_RUNTIME_IMAGES,
  ACCEPTANCE_SELECTED_TARGET_ARGV,
  ACCEPTANCE_SELECTED_TARGET_PATTERN,
  ACCEPTANCE_SELECTED_TARGET_TEST_NAMES,
  ACCEPTED_BUILD_DEFINITION_PATHS,
  ACCEPTED_DEVELOPMENT_PATH,
  ACCEPTED_DEVELOPMENT_SHA256,
  FROZEN_PRODUCT,
} from '../../release/constants.mjs';
import {
  admitDockerCapability,
  MINIMUM_DOCKER_API_VERSION,
  parseDockerVersionEvidence,
} from '../../release/docker-capability.mjs';

const FIXTURES = path.join(import.meta.dirname, 'fixtures');
const SCHEMAS = path.resolve(import.meta.dirname, '..', '..', 'schemas');

test('accepted Harness selected-target manifest is the exact corrected H3 21-test order', () => {
  assert.deepEqual(ACCEPTANCE_SELECTED_TARGET_TEST_NAMES, [
    'Backend Go content authority is the exact 62-record localeCompare set with four assets per record',
    'Backend Go lock cleanup validates the complete closed set before unlink and proves absence',
    'Backend Go lock cleanup rejects missing, extra, changed, linked, symlinked, or temporary state without broad deletion',
    'Backend Go lock cleanup rejects an equal-attribute inode rebind at the private-staging boundary without deleting either inode',
    'Backend owner handshake fixes seed, materialization, acceptance environment, write denial, and reseal order',
    'Backend materialization closed plan rejects every widening before the networkless seam',
    'Backend check closed plan rejects every broader network profile before execution',
    'Linux process inventory uses only bounded procfs evidence and exact argv/cwd identity',
    'owned Linux cleanup rejects PID reuse or argv drift before signaling',
    'Darwin process inventory preserves absolute ps and lsof behavior',
    'runner rejects and force-cleans a reparented child with empty env and escaped cwd',
    'escaped fixture fallback cleans only an exact owned process identity',
    'runner cleans reparented children before reporting nonzero and timeout outcomes',
    'evidence validation opens every registered file and rejects tamper or residue',
    'failed result evidence registration closes files written before a cell aborts',
    'parent failure evidence budget reserves exactly two terminal descriptors',
    'evidence recursion ignores cache authority bindings but closes explicit screenshots',
    'canonical result output is exclusively written and verified after re-read',
    'parent supervisor replaces a fake partial result with one canonical fail-fast result',
    'parent failure registration uses a unique index and folds a full direct-fail evidence array',
    'parent supervisor quarantines corrupt worker evidence and still writes one closed 56-cell failure',
  ]);
});

test('accepted Harness selected-target argv is one canonical anchored 21-name alternation', () => {
  const selected = new RegExp(ACCEPTANCE_SELECTED_TARGET_PATTERN, 'u');
  for (const name of ACCEPTANCE_SELECTED_TARGET_TEST_NAMES) {
    assert.equal(selected.test(name), true, name);
    assert.equal(selected.test(`extra ${name}`), false, name);
    assert.equal(selected.test(`${name} extra`), false, name);
    assert.equal(selected.test(`${name}\n`), false, name);
  }
  assert.doesNotThrow(() =>
    assertSelectedTargetArguments(ACCEPTANCE_SELECTED_TARGET_ARGV),
  );

  const broad = [...ACCEPTANCE_SELECTED_TARGET_ARGV];
  broad[3] = '.*';
  assert.throws(
    () => assertSelectedTargetArguments(broad),
    /fixed inventory and order/u,
  );

  const extra = [...ACCEPTANCE_SELECTED_TARGET_ARGV];
  extra[3] = `(?:${ACCEPTANCE_SELECTED_TARGET_PATTERN}|unexpected extra test)`;
  assert.throws(
    () => assertSelectedTargetArguments(extra),
    /fixed inventory and order/u,
  );
});

test('accepted-development schema rejects selected-target reordering without constraining supervisor names', () => {
  const schema = readJsonStrict(
    path.join(SCHEMAS, 'release-accepted-development-v1.schema.json'),
  );
  const validateSelectedTargetNames = compileStrictSchema(
    {
      $schema: schema.$schema,
      ...schema.$defs.selectedTargetTestNames,
    },
    {
      label: 'accepted selected-target names schema',
    },
  );
  assert.doesNotThrow(() =>
    validateSelectedTargetNames(ACCEPTANCE_SELECTED_TARGET_TEST_NAMES),
  );
  const reordered = [...ACCEPTANCE_SELECTED_TARGET_TEST_NAMES];
  [reordered[7], reordered[8]] = [reordered[8], reordered[7]];
  assert.throws(() => validateSelectedTargetNames(reordered));

  const harness =
    schema.properties.testEvidence.properties.harness.properties;
  assert.ok(
    schema.$defs.argv.items.maxLength >=
      ACCEPTANCE_SELECTED_TARGET_PATTERN.length,
  );
  assert.equal(harness.supervisor.$ref, '#/$defs/testRun');
  assert.equal(
    harness.targeted.allOf[1].properties.testNames.$ref,
    '#/$defs/selectedTargetTestNames',
  );
  assert.equal(schema.$defs.testRun.properties.testNames.prefixItems, undefined);
});

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

test('published release fixture and schema constants equal the canonical accepted-development receipt', () => {
  const receipt = readAcceptedDevelopment();
  const manifest = readJsonStrict(
    path.join(FIXTURES, 'release-manifest.valid.json'),
  );
  const schema = readJsonStrict(
    path.join(SCHEMAS, 'release-manifest-v1.schema.json'),
  );
  const expected = {
    frozenProduct: receipt.value.frozenProduct,
    receiptDigest: receipt.digest,
  };
  assert.equal(
    canonicalJson(manifest.acceptedDevelopment),
    canonicalJson(expected),
  );
  const acceptedProperties = schema.properties.acceptedDevelopment.properties;
  const productConstants =
    acceptedProperties.frozenProduct.allOf[1].properties;
  assert.equal(
    productConstants.revision.const,
    receipt.value.frozenProduct.revision,
  );
  assert.equal(
    productConstants.tree.const,
    receipt.value.frozenProduct.tree,
  );
  assert.equal(
    acceptedProperties.receiptDigest.const,
    receipt.digest,
  );
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
    assert.ok(schema.required.includes('sourceEpoch'));
    assert.deepEqual(
      { ...schema.properties.sourceEpoch },
      {
        maximum: 8_589_934_591,
        minimum: 315_532_800,
        type: 'integer',
      },
    );
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
  const docker28 = JSON.stringify({
    Client: {
      ApiVersion: '1.48',
      DefaultAPIVersion: '1.48',
      Version: '28.0.4+azure-1',
    },
    Server: {
      ApiVersion: '1.48',
      Arch: 'x86_64',
      Components: [],
      MinAPIVersion: '1.24',
      Os: 'linux',
      Version: '28.0.4+azure-1',
    },
  });
  const admitted = parseDockerVersionEvidence(`${docker28}\n`);
  assert.equal(admitted.dockerClientVersion, '28.0.4+azure-1');
  assert.equal(admitted.dockerServerArchitecture, 'amd64');
  assert.equal(MINIMUM_DOCKER_API_VERSION, '1.45');

  const docker29 = JSON.parse(docker28);
  docker29.Client.APIVersion = docker29.Client.ApiVersion;
  docker29.Server.APIVersion = docker29.Server.ApiVersion;
  delete docker29.Client.ApiVersion;
  delete docker29.Server.ApiVersion;
  assert.doesNotThrow(() =>
    parseDockerVersionEvidence(JSON.stringify(docker29)),
  );

  const missingServerMinimum = JSON.parse(docker28);
  delete missingServerMinimum.Server.MinAPIVersion;
  for (const invalid of [
    '{',
    '{}',
    '{"Client":{},"Client":{},"Server":{}}',
    JSON.stringify(missingServerMinimum),
    JSON.stringify({
      ...docker29,
      Client: {
        ...docker29.Client,
        ApiVersion: docker29.Client.APIVersion,
      },
    }),
  ]) {
    assert.throws(() => parseDockerVersionEvidence(invalid));
  }

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

test('checked-in accepted-development receipt retains its dual-identity closure', () => {
  const receipt = readAcceptedDevelopment();
  const bytes = fs.readFileSync(ACCEPTED_DEVELOPMENT_PATH, 'utf8');
  assert.ok(bytes.endsWith('\n'));
  assert.ok(!bytes.endsWith('\n\n'));
  assert.equal(receipt.digest, ACCEPTED_DEVELOPMENT_SHA256);
  assert.equal(receipt.size, Buffer.byteLength(bytes));
  assert.equal(
    canonicalJson(receipt.value.frozenProduct),
    canonicalJson(FROZEN_PRODUCT),
  );
  assert.equal(
    receipt.value.actionsEvidence.headRevision,
    receipt.value.frozenProduct.revision,
  );
  assert.equal(
    receipt.value.actionsEvidence.headTree,
    receipt.value.frozenProduct.tree,
  );
  assert.equal(
    receipt.value.acceptanceControl.productHarnessDifference.productRevision,
    receipt.value.frozenProduct.revision,
  );
  assert.equal(
    receipt.value.acceptanceControl.productHarnessDifference.harnessRevision,
    receipt.value.acceptanceControl.implementationRevision,
  );
  assert.equal(
    receipt.value.sourceArchives.product.revision,
    receipt.value.frozenProduct.revision,
  );
  assert.equal(
    receipt.value.sourceArchives.harness.revision,
    receipt.value.acceptanceControl.implementationRevision,
  );
  for (const archive of Object.values(receipt.value.sourceArchives)) {
    assert.equal(
      archive.archiveCommand,
      'git archive --format=tar --prefix=source/ --output=<run-owned-file> <revision>',
    );
    assert.equal(
      archive.archiveFormat,
      'git-archive-source-prefixed-tar-v1',
    );
    assert.equal(archive.memberPrefix, 'source/');
    assert.equal(
      archive.inventorySchemaVersion,
      'operations-source-archive-member-inventory-v1',
    );
    assert.ok(archive.archiveSize > 0);
    assert.match(archive.archiveMode, /^0(?:400|440|444|600|640|644)$/u);
  }
  assert.deepEqual(
    receipt.value.authorities.buildDefinitions.map((entry) => entry.path),
    ACCEPTED_BUILD_DEFINITION_PATHS,
  );
  assert.equal(
    receipt.value.remoteEvidence.runtimes.node.rootDigest,
    ACCEPTANCE_RUNTIME_IMAGES.node.rootDigest,
  );
  assert.equal(
    receipt.value.remoteEvidence.runtimes.node.amd64ManifestDigest,
    ACCEPTANCE_RUNTIME_IMAGES.node.amd64ManifestDigest,
  );
  assert.equal(
    receipt.value.remoteEvidence.runtimes.node.configImageId,
    ACCEPTANCE_RUNTIME_IMAGES.node.configImageId,
  );
  assert.equal(
    receipt.value.testEvidence.product.sourceRevision,
    receipt.value.frozenProduct.revision,
  );
  assert.equal(
    receipt.value.testEvidence.harness.sourceRevision,
    receipt.value.acceptanceControl.implementationRevision,
  );
  assert.equal(
    receipt.value.testEvidence.harness.targeted.failed,
    0,
  );
  assert.equal(
    receipt.value.testEvidence.harness.targeted.outcome,
    'passed',
  );
  assert.equal(
    receipt.value.testEvidence.harness.targeted.passed,
    receipt.value.testEvidence.harness.targeted.total,
  );
  assert.equal(
    Object.hasOwn(receipt.value.testEvidence.harness, 'exception'),
    false,
  );
  assert.deepEqual(
    receipt.value.remoteEvidence.evidenceBundle.acceptedRunIds,
    [
      receipt.value.testEvidence.product.runId,
      receipt.value.testEvidence.harness.runId,
    ],
  );
  assert.deepEqual(
    receipt.value.remoteEvidence.evidenceBundle.supersededRunIds,
    receipt.value.remoteEvidence.supersededAttempts.map(
      (entry) => entry.runId,
    ),
  );
  assert.ok(
    receipt.value.remoteEvidence.supersededAttempts.every(
      (entry) =>
        entry.accepted === false &&
        entry.status === 'superseded-not-accepted' &&
        entry.sourceRevision !== receipt.value.frozenProduct.revision &&
        entry.sourceRevision !==
          receipt.value.acceptanceControl.archiveLifecycleCommit,
    ),
  );
  assert.ok(
    receipt.value.remoteEvidence.audit.reviewedEvidenceDigests.includes(
      receipt.value.actionsEvidence.log.sha256,
    ),
  );
  assert.equal(
    receipt.value.remoteEvidence.audit.productRevision,
    receipt.value.frozenProduct.revision,
  );
  assert.equal(
    receipt.value.remoteEvidence.audit.harnessRevision,
    receipt.value.acceptanceControl.implementationRevision,
  );
  assert.equal(
    receipt.value.remoteEvidence.audit.archiveRevision,
    receipt.value.acceptanceControl.archiveLifecycleCommit,
  );
  assert.equal(
    receipt.value.remoteEvidence.protectedState.beforeSemanticSha256,
    receipt.value.remoteEvidence.protectedState.afterSemanticSha256,
  );
  assert.equal(
    receipt.value.remoteEvidence.protectedState.executedSealProgram.executed,
    true,
  );
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
});

test('accepted-development verifier rejects identity, attribution, and graph widening', () => {
  const receipt = readAcceptedDevelopment();
  const duplicatePath = structuredClone(receipt.value);
  duplicatePath.authorities.buildDefinitions[1].path =
    duplicatePath.authorities.buildDefinitions[0].path;
  assert.throws(
    () => parseAcceptedDevelopment(canonicalJson(duplicatePath)),
    /fixed inventory and order/u,
  );

  const missingRuntimePrune = structuredClone(receipt.value);
  missingRuntimePrune.authorities.buildDefinitions[11].path =
    'updater/build/other.py';
  assert.throws(
    () => parseAcceptedDevelopment(canonicalJson(missingRuntimePrune)),
    /fixed inventory and order/u,
  );

  const duplicateTool = structuredClone(receipt.value);
  duplicateTool.authorities.toolchains[1].name =
    duplicateTool.authorities.toolchains[0].name;
  assert.throws(
    () => parseAcceptedDevelopment(canonicalJson(duplicateTool)),
    /fixed inventory and order/u,
  );

  const actionsFromHarness = structuredClone(receipt.value);
  actionsFromHarness.actionsEvidence.headRevision =
    actionsFromHarness.acceptanceControl.implementationRevision;
  assert.throws(
    () => parseAcceptedDevelopment(canonicalJson(actionsFromHarness)),
    /fixed Operations authority/u,
  );

  const productAuthorityFromHarness = structuredClone(receipt.value);
  productAuthorityFromHarness.authorities.buildDefinitions[0].revision =
    productAuthorityFromHarness.acceptanceControl.implementationRevision;
  assert.throws(
    () =>
      parseAcceptedDevelopment(canonicalJson(productAuthorityFromHarness)),
    /Product authority/u,
  );

  const harnessEvidenceFromProduct = structuredClone(receipt.value);
  harnessEvidenceFromProduct.testEvidence.harness.sourceRevision =
    harnessEvidenceFromProduct.frozenProduct.revision;
  assert.throws(
    () =>
      parseAcceptedDevelopment(canonicalJson(harnessEvidenceFromProduct)),
    /test evidence is attributed/u,
  );

  const failedAcceptedTarget = structuredClone(receipt.value);
  failedAcceptedTarget.testEvidence.harness.targeted.failed = 1;
  failedAcceptedTarget.testEvidence.harness.targeted.passed -= 1;
  failedAcceptedTarget.testEvidence.harness.targeted.outcome =
    'accepted-with-classified-exception';
  assert.throws(
    () => parseAcceptedDevelopment(canonicalJson(failedAcceptedTarget)),
    /does not satisfy/u,
  );

  const reorderedAcceptedTargets = structuredClone(receipt.value);
  [
    reorderedAcceptedTargets.testEvidence.harness.targeted.testNames[7],
    reorderedAcceptedTargets.testEvidence.harness.targeted.testNames[8],
  ] = [
    reorderedAcceptedTargets.testEvidence.harness.targeted.testNames[8],
    reorderedAcceptedTargets.testEvidence.harness.targeted.testNames[7],
  ];
  assert.throws(
    () => parseAcceptedDevelopment(canonicalJson(reorderedAcceptedTargets)),
    /fixed inventory and order/u,
  );

  const acceptedException = structuredClone(receipt.value);
  acceptedException.testEvidence.harness.exception = {
    classification: 'historical-failure',
  };
  assert.throws(
    () => parseAcceptedDevelopment(canonicalJson(acceptedException)),
    /does not satisfy/u,
  );

  const supersededFromProduct = structuredClone(receipt.value);
  supersededFromProduct.remoteEvidence.supersededAttempts[0].sourceRevision =
    supersededFromProduct.frozenProduct.revision;
  assert.throws(
    () => parseAcceptedDevelopment(canonicalJson(supersededFromProduct)),
    /superseded attempt identity/u,
  );

  const supersededFromArchive = structuredClone(receipt.value);
  supersededFromArchive.remoteEvidence.supersededAttempts[0].sourceRevision =
    supersededFromArchive.acceptanceControl.archiveLifecycleCommit;
  assert.throws(
    () => parseAcceptedDevelopment(canonicalJson(supersededFromArchive)),
    /superseded attempt identity/u,
  );

  const supersededFromHistoricalHarness = structuredClone(receipt.value);
  supersededFromHistoricalHarness.remoteEvidence.supersededAttempts[0]
    .sourceRevision = '7777777777777777777777777777777777777777';
  assert.doesNotThrow(() =>
    parseAcceptedDevelopment(canonicalJson(supersededFromHistoricalHarness)),
  );

  const supersededRuntimeDrift = structuredClone(receipt.value);
  supersededRuntimeDrift.remoteEvidence.supersededAttempts[0]
    .runtimeConfigImageId =
      `sha256:${'f'.repeat(64)}`;
  assert.throws(
    () => parseAcceptedDevelopment(canonicalJson(supersededRuntimeDrift)),
    /superseded attempt identity/u,
  );

  const acceptedSupersededAttempt = structuredClone(receipt.value);
  acceptedSupersededAttempt.remoteEvidence.supersededAttempts[0].status =
    'accepted';
  assert.throws(
    () => parseAcceptedDevelopment(canonicalJson(acceptedSupersededAttempt)),
    /does not satisfy/u,
  );

  const supersededMembershipDrift = structuredClone(receipt.value);
  supersededMembershipDrift.remoteEvidence.evidenceBundle
    .supersededRunIds[0] = supersededMembershipDrift.testEvidence.product.runId;
  assert.throws(
    () => parseAcceptedDevelopment(canonicalJson(supersededMembershipDrift)),
    /evidence-bundle run membership/u,
  );

  const overlappingRunMembership = structuredClone(receipt.value);
  const acceptedHarnessRunId =
    overlappingRunMembership.testEvidence.harness.runId;
  overlappingRunMembership.remoteEvidence.supersededAttempts[0].runId =
    acceptedHarnessRunId;
  overlappingRunMembership.remoteEvidence.evidenceBundle
    .supersededRunIds[0] = acceptedHarnessRunId;
  assert.throws(
    () => parseAcceptedDevelopment(canonicalJson(overlappingRunMembership)),
    /superseded attempt identity/u,
  );

  const unscopedAudit = structuredClone(receipt.value);
  unscopedAudit.remoteEvidence.audit.archiveRevision =
    unscopedAudit.acceptanceControl.implementationRevision;
  assert.throws(
    () => parseAcceptedDevelopment(canonicalJson(unscopedAudit)),
    /audit scope or revision binding/u,
  );

  const actionsLogTamper = structuredClone(receipt.value);
  actionsLogTamper.actionsEvidence.log.sha256 =
    canonicalJsonDigest({ actionsLogTamper: true });
  assert.throws(
    () => parseAcceptedDevelopment(canonicalJson(actionsLogTamper)),
    /omits reviewed evidence/u,
  );

  const omittedActionsLogReview = structuredClone(receipt.value);
  const actionsLogDigest = omittedActionsLogReview.actionsEvidence.log.sha256;
  const actionsLogIndex =
    omittedActionsLogReview.remoteEvidence.audit.reviewedEvidenceDigests
      .indexOf(actionsLogDigest);
  assert.notEqual(actionsLogIndex, -1);
  omittedActionsLogReview.remoteEvidence.audit.reviewedEvidenceDigests[
    actionsLogIndex
  ] = canonicalJsonDigest({ omittedActionsLogReview: true });
  assert.throws(
    () => parseAcceptedDevelopment(canonicalJson(omittedActionsLogReview)),
    /omits reviewed evidence/u,
  );

  const omittedReviewedEvidence = structuredClone(receipt.value);
  const reviewedDigests =
    omittedReviewedEvidence.remoteEvidence.audit.reviewedEvidenceDigests;
  const bundleDigest =
    omittedReviewedEvidence.remoteEvidence.evidenceBundle.sha256;
  const bundleIndex = reviewedDigests.indexOf(bundleDigest);
  assert.notEqual(bundleIndex, -1);
  let replacementIndex = 0;
  let replacementDigest;
  do {
    replacementDigest = canonicalJsonDigest({
      omittedReviewedEvidence: replacementIndex,
    });
    replacementIndex += 1;
  } while (reviewedDigests.includes(replacementDigest));
  reviewedDigests[bundleIndex] = replacementDigest;
  assert.throws(
    () => parseAcceptedDevelopment(canonicalJson(omittedReviewedEvidence)),
    /omits reviewed evidence/u,
  );

  const protectedProjectionDrift = structuredClone(receipt.value);
  protectedProjectionDrift.remoteEvidence.protectedState.afterSemanticSha256 =
    protectedProjectionDrift.remoteEvidence.protectedState
      .beforeSemanticSha256 === `sha256:${'f'.repeat(64)}`
      ? `sha256:${'e'.repeat(64)}`
      : `sha256:${'f'.repeat(64)}`;
  assert.throws(
    () => parseAcceptedDevelopment(canonicalJson(protectedProjectionDrift)),
    /protected-state projection/u,
  );

  const relabelledArchive = structuredClone(receipt.value);
  relabelledArchive.sourceArchives.harness.archiveSha256 =
    relabelledArchive.sourceArchives.product.archiveSha256;
  assert.throws(
    () => parseAcceptedDevelopment(canonicalJson(relabelledArchive)),
    /mixed or relabelled/u,
  );

  const wrongNodeRoot = structuredClone(receipt.value);
  wrongNodeRoot.remoteEvidence.runtimes.node.rootDigest =
    'sha256:6f7b03f7d42f2d5afd5c6c51d917732a316b94908531295d9d23c4c1936ecb20';
  assert.throws(
    () => parseAcceptedDevelopment(canonicalJson(wrongNodeRoot)),
    /does not satisfy/u,
  );

  const wrongNodeLayer = structuredClone(receipt.value);
  wrongNodeLayer.remoteEvidence.runtimes.node.layers[0].size += 1;
  assert.throws(
    () => parseAcceptedDevelopment(canonicalJson(wrongNodeLayer)),
    /runtime image graph/u,
  );

  const wrongPythonDiffId = structuredClone(receipt.value);
  wrongPythonDiffId.remoteEvidence.runtimes.python.configDiffIds[0] =
    'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
  assert.throws(
    () => parseAcceptedDevelopment(canonicalJson(wrongPythonDiffId)),
    /runtime image graph/u,
  );

  const wrongNodeDescriptorSize = structuredClone(receipt.value);
  wrongNodeDescriptorSize.remoteEvidence.runtimes.node.rootSize = 3930;
  assert.throws(
    () => parseAcceptedDevelopment(canonicalJson(wrongNodeDescriptorSize)),
    /does not satisfy/u,
  );

  const widenedDifference = structuredClone(receipt.value);
  widenedDifference.acceptanceControl.productHarnessDifference
    .nonAllowedDifferenceCount = 1;
  assert.throws(
    () => parseAcceptedDevelopment(canonicalJson(widenedDifference)),
    /does not satisfy/u,
  );
});

test('accepted-development reader rejects every alternate file whose bytes do not have the fixed receipt digest', () => {
  assert.throws(
    () =>
      readAcceptedDevelopment(
        path.join(FIXTURES, 'release-manifest.valid.json'),
      ),
    /fixed canonical digest/u,
  );
});

test('accepted-development reader rejects coordinated Actions-log and audit-digest tampering', () => {
  const receipt = readAcceptedDevelopment();
  const changed = structuredClone(receipt.value);
  const originalDigest = changed.actionsEvidence.log.sha256;
  const reviewed = changed.remoteEvidence.audit.reviewedEvidenceDigests;
  const reviewedIndex = reviewed.indexOf(originalDigest);
  assert.notEqual(reviewedIndex, -1);
  let replacementIndex = 0;
  let replacementDigest;
  do {
    replacementDigest = canonicalJsonDigest({
      coordinatedActionsLogTamper: replacementIndex,
    });
    replacementIndex += 1;
  } while (reviewed.includes(replacementDigest));
  changed.actionsEvidence.log.sha256 = replacementDigest;
  reviewed[reviewedIndex] = replacementDigest;

  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'bgmss-actions-log-tamper-'),
  );
  const temporaryReceipt = path.join(temporaryRoot, 'accepted-development.json');
  try {
    fs.writeFileSync(temporaryReceipt, canonicalJson(changed), 'utf8');
    assert.throws(
      () => readAcceptedDevelopment(temporaryReceipt),
      /fixed canonical digest/u,
    );
  } finally {
    fs.rmSync(temporaryRoot, { force: true, recursive: true });
  }
});

test('superseded attempt repository lineage admits repeated historical Harness sources only', async () => {
  const productRevision = '1111111111111111111111111111111111111111';
  const historicalHarness = '2222222222222222222222222222222222222222';
  const harnessRevision = '3333333333333333333333333333333333333333';
  const archiveRevision = '4444444444444444444444444444444444444444';
  const unrelatedRevision = '5555555555555555555555555555555555555555';
  const postHarnessRevision = '6666666666666666666666666666666666666666';
  const ancestry = new Set([
    `${productRevision}:${historicalHarness}`,
    `${productRevision}:${harnessRevision}`,
    `${productRevision}:${archiveRevision}`,
    `${productRevision}:${postHarnessRevision}`,
    `${historicalHarness}:${harnessRevision}`,
    `${historicalHarness}:${archiveRevision}`,
    `${harnessRevision}:${archiveRevision}`,
  ]);
  const git = {
    async isAncestor(ancestor, descendant) {
      return ancestor === descendant || ancestry.has(`${ancestor}:${descendant}`);
    },
  };
  await assert.doesNotReject(() =>
    verifySupersededAttemptLineage({
      archiveRevision,
      git,
      harnessRevision,
      productRevision,
      supersededAttempts: [
        { sourceRevision: historicalHarness },
        { sourceRevision: historicalHarness },
        { sourceRevision: harnessRevision },
      ],
    }),
  );
  for (const sourceRevision of [
    productRevision,
    archiveRevision,
    unrelatedRevision,
    postHarnessRevision,
  ]) {
    await assert.rejects(
      () =>
        verifySupersededAttemptLineage({
          archiveRevision,
          git,
          harnessRevision,
          productRevision,
          supersededAttempts: [{ sourceRevision }],
        }),
      /strict Product-to-Harness lineage/u,
    );
  }
});

test('source inventory recomputation binds tree, path, mode, exact content digest, count, and bytes', async () => {
  const revision = '1111111111111111111111111111111111111111';
  const tree = '2222222222222222222222222222222222222222';
  const firstBlob = '3333333333333333333333333333333333333333';
  const secondBlob = '4444444444444444444444444444444444444444';
  const directoryTree = '5555555555555555555555555555555555555555';
  const nestedDirectoryTree =
    '6666666666666666666666666666666666666666';
  const git = {
    async blobSha256(blob) {
      return blob === firstBlob
        ? `sha256:${'a'.repeat(64)}`
        : `sha256:${'b'.repeat(64)}`;
    },
    async text(args) {
      if (args[0] === 'ls-tree') {
        return (
          `100644 blob ${firstBlob}\tREADME.md\0` +
          `040000 tree ${directoryTree}\toperations\0` +
          `040000 tree ${nestedDirectoryTree}\toperations/bin\0` +
          `100755 blob ${secondBlob}\toperations/bin/check.sh\0`
        );
      }
      if (args[0] === 'cat-file' && args[1] === '-s') {
        return args[2] === firstBlob ? '12\n' : '34\n';
      }
      throw new Error(`unexpected Git arguments: ${args.join(' ')}`);
    },
    async tree(actualRevision) {
      assert.equal(actualRevision, revision);
      return tree;
    },
  };
  const result = await recomputeGitSourceInventory({
    git,
    revision,
    tree,
  });
  assert.equal(result.inventoryEntryCount, 5);
  assert.equal(result.inventoryTotalBytes, 46);
  assert.match(result.inventorySha256, /^sha256:[0-9a-f]{64}$/u);

  await assert.rejects(
    () =>
      recomputeGitSourceInventory({
        git,
        revision,
        tree: '5555555555555555555555555555555555555555',
      }),
    /tree drifted/u,
  );

  const linkedGit = {
    ...git,
    async text(args) {
      if (args[0] === 'ls-tree') {
        return `120000 blob ${firstBlob}\tlinked\0`;
      }
      return await git.text(args);
    },
  };
  await assert.rejects(
    () =>
      recomputeGitSourceInventory({
        git: linkedGit,
        revision,
        tree,
      }),
    /non-regular/u,
  );

  const outputRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'bgmss-source-archive-output-'),
  );
  try {
    await assert.rejects(
      () =>
        recomputeGitSourceArchiveIdentity({
          git: {
            ...git,
            async command(args) {
              assert.deepEqual(args.slice(0, 3), [
                'archive',
                '--format=tar',
                '--prefix=source/',
              ]);
              assert.match(args[3], /^--output=.+\/source\.tar$/u);
              assert.equal(args[4], revision);
              return {
                stderrTruncated: false,
                stdout: 'unexpected archive stdout',
                stdoutTruncated: false,
              };
            },
          },
          outputRoot,
          revision,
          tree,
        }),
      /unexpected output/u,
    );
  } finally {
    fs.rmSync(outputRoot, { force: true, recursive: true });
  }
});

test('source archive recomputation binds the complete source/-prefixed transfer tar file and member inventory', async () => {
  const gitExecutable = executableFromPath('git');
  const repositoryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'bgmss-receipt-git-'),
  );
  const runRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'bgmss-receipt-run-'),
  );
  const invoke = (args, options = {}) => {
    const result = spawnSync(gitExecutable, args, {
      cwd: repositoryRoot,
      encoding: Object.hasOwn(options, 'encoding')
        ? options.encoding
        : 'utf8',
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_SYSTEM: '/dev/null',
      },
    });
    assert.equal(result.status, 0, String(result.stderr));
    return result.stdout;
  };
  try {
    invoke(['init', '--quiet', '--initial-branch=main']);
    fs.writeFileSync(
      path.join(repositoryRoot, 'README.md'),
      'raw archive identity\n',
      'utf8',
    );
    fs.mkdirSync(path.join(repositoryRoot, 'operations'));
    fs.writeFileSync(
      path.join(repositoryRoot, 'operations', 'check.sh'),
      '#!/bin/sh\nexit 0\n',
      { encoding: 'utf8', mode: 0o755 },
    );
    invoke(['add', '--', 'README.md', 'operations/check.sh']);
    invoke([
      '-c',
      'user.name=Receipt Test',
      '-c',
      'user.email=receipt@example.invalid',
      'commit',
      '--quiet',
      '-m',
      'fixture',
    ]);
    const revision = invoke(['rev-parse', 'HEAD']).trim();
    const tree = invoke(['rev-parse', 'HEAD^{tree}']).trim();
    const repository = new GitRepository({
      git: gitExecutable,
      repositoryRoot,
      runRoot,
    });
    const actual = await recomputeGitSourceArchiveIdentity({
      git: repository,
      revision,
      tree,
    });
    const rawArchive = invoke(
      ['archive', '--format=tar', '--prefix=source/', revision],
      { encoding: null },
    );
    assert.equal(actual.archiveSha256, sha256(rawArchive));
    assert.equal(actual.archiveSize, rawArchive.byteLength);
    assert.equal(actual.archiveMode, '0600');
    assert.equal(actual.inventoryEntryCount, 4);
    assert.equal(
      actual.inventoryTotalBytes,
      Buffer.byteLength('raw archive identity\n') +
        Buffer.byteLength('#!/bin/sh\nexit 0\n'),
    );
  } finally {
    fs.rmSync(repositoryRoot, { force: true, recursive: true });
    fs.rmSync(runRoot, { force: true, recursive: true });
  }
});

test('published authority rejects drift and manifest schema rejects unknown fields', () => {
  const schema = readJsonStrict(
    path.join(SCHEMAS, 'release-manifest-v1.schema.json'),
  );
  const validate = compileStrictSchema(schema);
  const manifest = readJsonStrict(
    path.join(FIXTURES, 'release-manifest.valid.json'),
  );
  assert.doesNotThrow(() => assertPublishedReleaseAuthority(manifest));
  for (const mutate of [
    (value) => {
      value.acceptedDevelopment.receiptDigest =
        'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    },
    (value) => {
      value.acceptedDevelopment.frozenProduct.revision =
        'ffffffffffffffffffffffffffffffffffffffff';
    },
    (value) => {
      value.acceptedDevelopment.frozenProduct.tree =
        'ffffffffffffffffffffffffffffffffffffffff';
    },
  ]) {
    const changed = structuredClone(manifest);
    mutate(changed);
    assert.throws(() => validate(changed));
    assert.throws(() => assertPublishedReleaseAuthority(changed));
  }
  for (const mutate of [
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
