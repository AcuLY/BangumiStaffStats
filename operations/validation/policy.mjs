import fs from 'node:fs';
import path from 'node:path';

import { stringify } from 'yaml';

import { renderCompose, renderReleaseEnvironment } from '../compose/render.mjs';
import {
  canonicalJson,
  canonicalJsonDigest,
  deepFreeze,
} from '../lib/canonical-json.mjs';
import { assertSha256, sha256, sha256File } from '../lib/digest.mjs';
import { COMMON_COMMIT } from '../release/constants.mjs';
import {
  API_BIND,
  CLAIM,
  HOST_ALIAS,
  LEGACY_ROOT,
  NETWORKS,
  PRODUCTION_ROOT,
  PROJECT,
  PROMETHEUS,
  REPOSITORY_ROOT,
  REMOTE_ROOT,
  SERVICES,
  TRANSFER_ROLES,
  validationAliases,
} from './constants.mjs';
import {
  expectedValidationAuthority,
  materializeSecurityProjection,
} from './authority.mjs';
import { runOverlay } from './render-policy.mjs';
import { controllerFilesDigest } from './package.mjs';
import {
  validateValidationInput,
  validateValidationPreflight,
  validateValidationResources,
  validateValidationResult,
} from './schema.mjs';

export class ValidationPolicyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationPolicyError';
  }
}

function fail(message) {
  throw new ValidationPolicyError(message);
}

function exactStrings(left, right) {
  return [...left].sort().join('\0') === [...right].sort().join('\0');
}

function requireRoleMap(input) {
  const roles = new Map();
  const identifiers = new Set();
  const names = new Set();
  let totalSize = 0;
  for (const record of input.transfer.files) {
    const expectedMode = ['archive-smoke', 'remote-entry'].includes(
      record.role,
    )
      ? '0500'
      : '0400';
    if (
      roles.has(record.role) ||
      identifiers.has(record.id) ||
      names.has(record.remoteName) ||
      record.remoteName !== `files/${record.id}` ||
      record.mode !== expectedMode
    ) {
      fail('validation transfer contains a duplicate or mismatched identity');
    }
    roles.set(record.role, record);
    identifiers.add(record.id);
    names.add(record.remoteName);
    totalSize += record.size;
  }
  if (
    !exactStrings(roles.keys(), TRANSFER_ROLES) ||
    input.transfer.fileCount !== input.transfer.files.length ||
    input.transfer.totalSize !== totalSize
  ) {
    fail('validation transfer role set or total is not closed');
  }
  return roles;
}

function fileId(roles, role) {
  const record = roles.get(role);
  if (!record) fail(`validation transfer role is absent: ${role}`);
  return record.id;
}

function assertActionsTransportSemantics(transport, operationsRevision) {
  const authority = transport.actions;
  if (
    authority.repository.owner !== 'AcuLY' ||
    authority.repository.name !== 'BangumiStaffStats' ||
    authority.workflow.name !== 'operations-verification' ||
    authority.workflow.path !== '.github/workflows/operations.yml' ||
    authority.run.headSha !== operationsRevision ||
    authority.run.headRepositoryId !== authority.repository.id ||
    authority.run.headRepositoryFullName !== 'AcuLY/BangumiStaffStats' ||
    !authority.run.workflowPathAtRef.startsWith(
      '.github/workflows/operations.yml@',
    ) ||
    authority.run.status !== 'completed' ||
    authority.run.conclusion !== 'success' ||
    !['pull_request', 'push', 'workflow_dispatch'].includes(
      authority.run.event,
    ) ||
    authority.artifact.name !==
      `bgmss-operations-validation-${authority.run.headSha}` ||
    authority.artifact.expired !== false ||
    authority.artifact.runId !== authority.run.id ||
    authority.artifact.repositoryId !== authority.repository.id ||
    authority.artifact.headRepositoryId !== authority.repository.id ||
    authority.artifact.headSha !== authority.run.headSha ||
    authority.artifact.creationEpochMs <
      authority.run.attemptStartedEpochMs ||
    authority.artifact.expirationEpochMs <=
      authority.artifact.creationEpochMs ||
    authority.artifact.expirationEpochMs -
        authority.artifact.creationEpochMs >
      24 * 60 * 60 * 1000
  ) {
    fail('validation Actions transport authority drifted');
  }
  return authority;
}

export function assertInputSemantics(input) {
  validateValidationInput(input);
  const roles = requireRoleMap(input);
  const aliases = validationAliases(input.source.product.revision);
  const composeVersion =
    input.authority.security.projection.services.find(
      (entry) => entry.service === 'api',
    )?.labels['com.docker.compose.version'];
  if (
    typeof composeVersion !== 'string' ||
    !/^2[.][0-9]+[.][0-9]+(?:[-+][A-Za-z0-9.-]+)?$/u.test(composeVersion)
  ) {
    fail('validation input does not bind an admitted Compose v2 authority');
  }
  const expectedAuthority = expectedValidationAuthority({
    appRevision: input.source.product.revision,
    appVersion: input.candidate.applicationVersion,
    commonCommit: COMMON_COMMIT,
    composeVersion,
    imageRuntimeDefaults: {
      api: input.images.api.runtimeDefaults,
      updater: input.images.updater.runtimeDefaults,
    },
    minimalArchive: input.minimalArchive,
    runId: input.runId,
  });
  if (canonicalJson(input.authority) !== canonicalJson(expectedAuthority)) {
    fail('validation input authority differs from the local closed model');
  }
  assertActionsTransportSemantics(
    input.transport,
    input.source.operations.revision,
  );
  if (
    input.remote.hostAlias !== HOST_ALIAS ||
    input.remote.root !== REMOTE_ROOT ||
    input.remote.productionRoot !== PRODUCTION_ROOT ||
    input.remote.legacyRoot !== LEGACY_ROOT ||
    input.remote.project !== PROJECT ||
    input.remote.apiBind !== API_BIND ||
    input.remote.outboundEgress !== true ||
    canonicalJson(input.remote.networks) !== canonicalJson(NETWORKS) ||
    canonicalJson(input.remote.services) !== canonicalJson(SERVICES) ||
    input.states.deployed !== false ||
    input.states.productionActivated !== false ||
    input.states.released !== false
  ) {
    fail('validation input remote boundary or state claim drifted');
  }
  if (
    input.images.api.archiveFileId !== fileId(roles, 'api-image') ||
    input.images.updater.archiveFileId !== fileId(roles, 'updater-image') ||
    input.images.api.validationAlias !== aliases.api ||
    input.images.updater.validationAlias !== aliases.updater ||
    input.images.prometheus.validationAlias !== aliases.prometheus ||
    input.images.prometheus.reference !== PROMETHEUS.reference ||
    input.images.prometheus.indexDigest !== PROMETHEUS.indexDigest ||
    input.images.prometheus.amd64ManifestDigest !==
      PROMETHEUS.amd64ManifestDigest ||
    input.images.prometheus.amd64ManifestSize !==
      PROMETHEUS.amd64ManifestSize ||
    input.images.prometheus.runtimeUid !== PROMETHEUS.runtimeUid ||
    input.images.prometheus.runtimeGid !== PROMETHEUS.runtimeGid ||
    canonicalJson(input.images.prometheus.runtimeDefaults) !==
      canonicalJson(PROMETHEUS.runtimeDefaults) ||
    input.runtime.controllerFilesDigest !== controllerFilesDigest()
  ) {
    fail('validation input image binding drifted');
  }
  const bindings = {
    'candidate-document': input.candidate.candidateDocumentFileId,
    'candidate-inventory': input.candidate.completeInventoryFileId,
    compatibility: input.runtime.compatibilityFileId,
    compose: input.runtime.composeFileId,
    frontend: input.runtime.frontendFileId,
    'minimal-manifest': input.minimalArchive.manifestFileId,
    'minimal-sqlite': input.minimalArchive.sqliteFileId,
    'preflight-evidence': input.preflight.fileId,
    'prometheus-config': input.runtime.prometheusConfigFileId,
    'prometheus-rules': input.runtime.prometheusRulesFileId,
    'release-environment': input.runtime.releaseEnvironmentFileId,
    'remote-entry': input.runtime.remoteEntryFileId,
    'run-overlay': input.runtime.runOverlayFileId,
    'archive-smoke': input.runtime.smokeFileId,
  };
  for (const [role, identifier] of Object.entries(bindings)) {
    if (identifier !== fileId(roles, role)) {
      fail(`validation input file binding drifted: ${role}`);
    }
  }
  const expectedControllerFiles = {
    compose: sha256(renderCompose('validation')),
    'release-environment': sha256(
      renderReleaseEnvironment('validation', {
        apiImage:
          `localhost/bgmss-validation-seal/api@${input.images.api.manifest.digest}`,
        appRevision: input.source.product.revision,
        appVersion: input.candidate.applicationVersion,
        archiveSmokeDigest: roles.get('archive-smoke').sha256,
        commonCommit: COMMON_COMMIT,
        manifestDigest: input.candidate.candidateDocumentSha256,
        schemaVersion: 'runtime-release-v1',
        updaterImage:
          `localhost/bgmss-validation-seal/updater@${input.images.updater.manifest.digest}`,
      }),
    ),
    'run-overlay': sha256(
      stringify(runOverlay(input.runId), {
        aliasDuplicateObjects: false,
        lineWidth: 0,
        sortMapEntries: true,
      }),
    ),
  };
  for (const [role, digest] of Object.entries(expectedControllerFiles)) {
    if (roles.get(role).sha256 !== digest) {
      fail(`validation sealed runtime source drifted: ${role}`);
    }
  }
  for (const [role, relative] of [
    [
      'minimal-manifest',
      'contracts/goldens/archive/valid/minimal/archive-manifest.json',
    ],
    [
      'minimal-sqlite',
      'contracts/goldens/archive/valid/minimal/bangumi.sqlite',
    ],
    ['prometheus-config', 'operations/prometheus/prometheus.yml'],
    ['prometheus-rules', 'operations/prometheus/rules.yml'],
    ['remote-entry', 'operations/validation/remote/entry.sh'],
  ]) {
    const source = path.join(REPOSITORY_ROOT, ...relative.split('/'));
    const information = fs.lstatSync(source);
    const record = roles.get(role);
    if (
      !information.isFile() ||
      information.isSymbolicLink() ||
      information.nlink !== 1 ||
      record.size !== information.size ||
      record.sha256 !== sha256File(source)
    ) {
      fail(`validation current controller source drifted: ${role}`);
    }
  }
  if (
    input.candidate.candidateDocumentSha256 !==
      roles.get('candidate-document').sha256 ||
    input.transport.externalInventorySha256 !==
      roles.get('candidate-inventory').sha256 ||
    input.preflight.digest !== roles.get('preflight-evidence').sha256 ||
    input.minimalArchive.manifestDigest !==
      roles.get('minimal-manifest').sha256 ||
    input.minimalArchive.sqliteDigest !== roles.get('minimal-sqlite').sha256 ||
    input.minimalArchive.sqliteSize !== roles.get('minimal-sqlite').size
  ) {
    fail('validation input sealed-file identity drifted');
  }
  for (const role of ['api', 'updater']) {
    const image = input.images[role];
    if (
      image.config.mediaType !== 'application/vnd.oci.image.config.v1+json' ||
      image.manifest.mediaType !==
        'application/vnd.oci.image.manifest.v1+json' ||
      image.config.digest === image.manifest.digest ||
      image.graphDigest !== canonicalJsonDigest({
        configDigest: image.config.digest,
        rootfsDiffIds: image.rootfsDiffIds,
      })
    ) {
      fail(`validation ${role} OCI descriptor binding is invalid`);
    }
  }
  return deepFreeze({ input, roles });
}

export function protectedPreflightProjection(preflight) {
  validateValidationPreflight(preflight);
  return deepFreeze({
    absence: preflight.absence,
    host: preflight.host,
    protected: preflight.protected,
    tools: preflight.tools,
  });
}

export function comparePreflights(before, after) {
  validateValidationPreflight(before);
  validateValidationPreflight(after);
  if (
    before.conclusion !== 'admitted' ||
    Object.entries(before.absence)
      .filter(([name]) => name !== 'imageReferences')
      .some(([, value]) => value !== true) ||
    before.capacity.availableBytes < before.capacity.requiredBytes ||
    before.capacity.availableInodes < 100000
  ) {
    fail('validation baseline was not an admitted preflight');
  }
  const beforeProjection = protectedPreflightProjection(before);
  const afterProjection = protectedPreflightProjection(after);
  const beforeDigest = canonicalJsonDigest(beforeProjection);
  const afterDigest = canonicalJsonDigest(afterProjection);
  const differences = [];
  for (const field of [
    'imagesAbsent',
    'namedVolumesAbsent',
    'portFree',
    'projectAbsent',
    'rootAbsent',
  ]) {
    if (after.absence[field] !== before.absence[field]) {
      differences.push(`absence.${field}`);
    }
  }
  if (
    canonicalJson(after.absence.imageReferences) !==
      canonicalJson(before.absence.imageReferences)
  ) {
    differences.push('absence.imageReferences');
  }
  if (after.capacity.requiredBytes !== before.capacity.requiredBytes) {
    differences.push('capacity.requiredBytes');
  }
  if (
    after.capacity.availableBytes < after.capacity.requiredBytes ||
    after.capacity.availableInodes < 100000
  ) {
    differences.push('capacity.admission');
  }
  for (const field of ['host', 'protected', 'tools']) {
    if (canonicalJson(after[field]) !== canonicalJson(before[field])) {
      differences.push(field);
    }
  }
  return deepFreeze({
    afterDigest,
    beforeDigest,
    differences,
    equal:
      differences.length === 0 &&
      beforeDigest === afterDigest &&
      canonicalJson(beforeProjection) === canonicalJson(afterProjection),
  });
}

export function assertResourcesSemantics(resources, input, {
  allowPartial = false,
} = {}) {
  validateValidationResources(resources);
  if (
    resources.runId !== input.runId ||
    resources.project !== PROJECT ||
    (!allowPartial && resources.namedVolumeObserved !== false) ||
    (resources.securityProjection === null) !==
      (resources.securityProjectionDigest === null)
  ) {
    fail('validation resource boundary drifted');
  }
  const containerIds = new Set();
  const containerNames = new Set();
  for (const container of resources.containers) {
    if (
      container.runId !== input.runId ||
      containerIds.has(container.id) ||
      containerNames.has(container.name)
    ) {
      fail('validation container identity is duplicated or cross-run');
    }
    containerIds.add(container.id);
    containerNames.add(container.name);
  }
  const networkNames = new Set();
  const networkIds = new Set();
  for (const network of resources.networks) {
    if (
      network.runId !== input.runId ||
      networkIds.has(network.id) ||
      networkNames.has(network.name) ||
      (network.name.endsWith('_runtime') && network.internal !== true) ||
      (network.name.endsWith('_outbound') && network.internal !== false)
    ) {
      fail('validation network identity or isolation drifted');
    }
    networkIds.add(network.id);
    networkNames.add(network.name);
  }
  const imageRoles = new Set();
  for (const image of resources.images) {
    if (imageRoles.has(image.role)) {
      fail('validation image role is duplicated');
    }
    imageRoles.add(image.role);
    const expected =
      image.role === 'prometheus'
        ? [
            input.images.prometheus.reference,
            input.images.prometheus.validationAlias,
          ]
        : [
            input.images[image.role].declaredLoadReference,
            input.images[image.role].validationAlias,
          ];
    if (
      !exactStrings(image.references, expected) ||
      image.manifestDigest !==
        (image.role === 'prometheus'
          ? input.images.prometheus.amd64ManifestDigest
          : input.images[image.role].manifest.digest) ||
      image.configDigest !==
        (image.role === 'prometheus'
          ? image.runtimeId
          : input.images[image.role].config.digest) ||
      image.runtimeId !== image.configDigest ||
      image.graphDigest !== canonicalJsonDigest({
        configDigest: image.configDigest,
        rootfsDiffIds: image.rootfsDiffIds,
      }) ||
      (image.role !== 'prometheus' &&
        (image.graphDigest !== input.images[image.role].graphDigest ||
          canonicalJson(image.rootfsDiffIds) !==
            canonicalJson(input.images[image.role].rootfsDiffIds)))
    ) {
      fail(`validation ${image.role} image identity drifted`);
    }
    assertSha256(image.configDigest, `validation ${image.role} config digest`);
    assertSha256(image.graphDigest, `validation ${image.role} graph digest`);
    assertSha256(image.runtimeId, `validation ${image.role} runtime ID`);
  }
  if (resources.securityProjection !== null) {
    const imageRuntimeIds = Object.fromEntries(
      resources.images.map((image) => [image.role, image.runtimeId]),
    );
    const composeConfigHashes = Object.fromEntries(
      resources.securityProjection.services
        .filter((service) => service.service !== 'updater')
        .map((service) => [
          service.service,
          service.labels['com.docker.compose.config-hash'],
        ]),
    );
    if (
      Object.values(composeConfigHashes).some(
        (value) =>
          typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value),
      )
    ) {
      fail('validation Compose config-hash materialization is invalid');
    }
    const materialized = materializeSecurityProjection(
      input.authority.security.projection,
      { composeConfigHashes, imageRuntimeIds },
    );
    if (
      canonicalJson(resources.securityProjection) !==
        canonicalJson(materialized) ||
      resources.securityProjectionDigest !==
        canonicalJsonDigest(resources.securityProjection)
    ) {
      fail('validation resource security projection drifted');
    }
  }
  if (
    !allowPartial &&
    (!exactStrings(networkNames, NETWORKS) ||
      !exactStrings(imageRoles, ['api', 'prometheus', 'updater']) ||
      resources.containers.length !== 3 ||
      !resources.pathManifest ||
      resources.securityProjection === null ||
      ![
        ['api', `/${PROJECT}-api-1`],
        ['prometheus', `/${PROJECT}-prometheus-1`],
        ['updater', `/${PROJECT}-updater-produce`],
      ].every(([service, name]) =>
        resources.containers.some(
          (entry) =>
            entry.service === service &&
            entry.name === name &&
            entry.securityDigest ===
              serviceSecurityDigest(input, service, resources),
        ),
      ))
  ) {
    fail('successful validation resource evidence is incomplete');
  }
  return resources;
}

function assertCommandSemantics(commands, input, producer) {
  const contracts = input.authority.commands.records;
  if (
    input.authority.commands.digest !== canonicalJsonDigest(contracts) ||
    commands.length !== contracts.length
  ) {
    fail('validation command authority count or digest drifted');
  }
  const byId = new Map();
  for (const command of commands) {
    if (byId.has(command.id)) {
      fail('validation command evidence contains a duplicate ID');
    }
    byId.set(command.id, command);
  }
  for (const contract of contracts) {
    const command = byId.get(contract.id);
    const {
      specDigest: ignoredSpecDigest,
      ...contractSpec
    } = contract;
    const monotonicDuration =
      command &&
      BigInt(command.endedMonotonicNs) -
        BigInt(command.startedMonotonicNs);
    if (
      !command ||
      contract.specDigest !== canonicalJsonDigest(contractSpec) ||
      command.argvDigest !== canonicalJsonDigest(contract.argv) ||
      command.specDigest !== contract.specDigest ||
      command.exitCode !== contract.expectedExitCode ||
      command.outcome !== contract.expectedOutcome ||
      command.proof !== contract.proof ||
      command.durationMs > contract.maximumDurationMs ||
      command.endedEpochMs < command.startedEpochMs ||
      monotonicDuration < 0n ||
      command.durationMs !== Number(monotonicDuration / 1_000_000n) ||
      Math.abs(
        command.endedEpochMs -
          command.startedEpochMs -
          command.durationMs,
      ) > 5_000
    ) {
      fail(`validation command contract failed: ${contract.id}`);
    }
  }
  const produce = byId.get('updater-produce');
  if (
    !producer ||
    !produce ||
    Math.floor(produce.durationMs / 1000) !== producer.durationSeconds
  ) {
    fail('validation producer command is not bound to producer evidence');
  }
  return byId;
}

function serviceSecurityDigest(input, service, resources) {
  const projection = (
    resources?.securityProjection ??
    input.authority.security.projection
  ).services.find(
    (entry) => entry.service === service,
  );
  if (!projection) fail(`validation security service is absent: ${service}`);
  return canonicalJsonDigest(projection);
}

function resourceImage(resources, role) {
  const image = resources.images.find((entry) => entry.role === role);
  if (!image) fail(`validation continuous image is absent: ${role}`);
  return image;
}

function resourceContainer(resources, service) {
  const name = `/${PROJECT}-${service}-1`;
  const container = resources.containers.find(
    (entry) => entry.service === service && entry.name === name,
  );
  if (!container) {
    fail(`validation continuous container is absent: ${service}`);
  }
  return container;
}

function stateProjectionAuthority(input, dataVersion, manifestDigest) {
  return {
    pointerDigest: canonicalJsonDigest({
      dataVersion,
      manifestDigest,
      pointerSchemaVersion: 1,
    }),
    projectionDigests: {
      buildDigest: canonicalJsonDigest({
        revision: input.source.product.revision,
        version: input.candidate.applicationVersion,
      }),
      metricsDigest: canonicalJsonDigest({
        build: {
          revision: input.source.product.revision,
          version: input.candidate.applicationVersion,
        },
        snapshot: { dataVersion },
      }),
      prometheusDigest: canonicalJsonDigest({
        job: 'bgmss-api',
        up: 1,
      }),
      readyDigest: canonicalJsonDigest({ dataVersion, ready: true }),
      typedQueryDigest: canonicalJsonDigest({
        dataVersion,
        page: 1,
        pageSize: 5,
        typed: true,
      }),
    },
  };
}

function semanticProjectionDigests(projections) {
  return {
    buildDigest: projections.buildDigest,
    metricsDigest: projections.metricsDigest,
    prometheusDigest: projections.prometheusDigest,
    readyDigest: projections.readyDigest,
    typedQueryDigest: projections.typedQueryDigest,
  };
}

function observedProjectionDigests(state) {
  return {
    prometheusScrapeDigest: state.projections.prometheusScrapeDigest,
    queryResultDigest: state.projections.queryResultDigest,
  };
}

function sameObservedProjectionDigests(left, right) {
  return (
    canonicalJson(observedProjectionDigests(left)) ===
    canonicalJson(observedProjectionDigests(right))
  );
}

function assertHealthState(
  state,
  input,
  resources,
  dataVersion,
  manifestDigest,
) {
  const expected = input.authority.continuousHealth.expected;
  const dynamic = stateProjectionAuthority(
    input,
    dataVersion,
    manifestDigest,
  );
  const apiContainer = resourceContainer(resources, 'api');
  const prometheusContainer = resourceContainer(resources, 'prometheus');
  const apiImage = resourceImage(resources, 'api');
  const prometheusImage = resourceImage(resources, 'prometheus');
  if (
    state.failureCode !== null ||
    state.dataVersion !== dataVersion ||
    state.apiRevision !== expected.apiRevision ||
    state.apiVersion !== expected.apiVersion ||
    state.pointer.digest !== dynamic.pointerDigest ||
    state.pointer.mode !== expected.pointerMode ||
    canonicalJson(semanticProjectionDigests(state.projections)) !==
      canonicalJson(dynamic.projectionDigests) ||
    state.api.containerId !== apiContainer.id ||
    state.api.imageReference !== expected.apiImage ||
    state.api.imageRuntimeId !== apiImage.runtimeId ||
    state.api.securityDigest !== apiContainer.securityDigest ||
    state.api.securityDigest !==
      serviceSecurityDigest(input, 'api', resources) ||
    state.prometheus.containerId !== prometheusContainer.id ||
    state.prometheus.imageReference !== expected.prometheusImage ||
    state.prometheus.imageRuntimeId !== prometheusImage.runtimeId ||
    state.prometheus.securityDigest !== prometheusContainer.securityDigest ||
    state.prometheus.securityDigest !==
      serviceSecurityDigest(input, 'prometheus', resources)
  ) {
    fail('continuous health state differs from sealed input authority');
  }
}

function assertContinuousState(state, input, resources) {
  assertHealthState(
    state,
    input,
    resources,
    input.minimalArchive.dataVersion,
    input.minimalArchive.manifestDigest,
  );
}

function assertContinuousHealth(
  evidence,
  input,
  resources,
  producer,
  commands,
  minimalState,
) {
  const authority = input.authority.continuousHealth;
  const produce = commands.get('updater-produce');
  if (
    evidence === null ||
    evidence.authorityDigest !== authority.digest ||
    evidence.intervalSeconds !== authority.policy.intervalSeconds ||
    evidence.count !== evidence.samples.length ||
    evidence.count < authority.policy.minimumSamples ||
    evidence.count > authority.policy.maximumSamples ||
    !produce ||
    evidence.proofCommandId !== produce.id ||
    evidence.proofDigest !== produce.outputDigest ||
    !proofMatches(
      evidence.verificationProof,
      'producer-minimal-health',
      commands,
    )
  ) {
    fail('continuous health authority, interval, or count drifted');
  }
  const { verificationProof, ...unverifiedEvidence } = evidence;
  if (
    verificationProof.proofDigest !==
    canonicalJsonDigest(unverifiedEvidence)
  ) {
    fail('continuous health verification proof does not bind its evidence');
  }
  const first = evidence.samples[0];
  const last = evidence.samples.at(-1);
  if (
    canonicalJson(evidence.before) !== canonicalJson(minimalState) ||
    canonicalJson(evidence.before) !== canonicalJson(first.state) ||
    canonicalJson(evidence.after) !== canonicalJson(last.state) ||
    canonicalJson(evidence.before) !== canonicalJson(evidence.after) ||
    evidence.firstDigest !== first.chainDigest ||
    evidence.lastDigest !== last.chainDigest ||
    first.ordinal !== 0 ||
    first.elapsedMs !== 0 ||
    first.previousDigest !== null ||
    evidence.startedEpochMs !== first.observedEpochMs ||
    evidence.startedMonotonicNs !== first.observedMonotonicNs ||
    evidence.endedEpochMs !== last.observedEpochMs ||
    evidence.endedMonotonicNs !== last.observedMonotonicNs
  ) {
    fail('continuous health before/after or first/last binding drifted');
  }
  assertContinuousState(evidence.before, input, resources);
  let previous = null;
  let previousObserved = null;
  const startedMonotonic = BigInt(evidence.startedMonotonicNs);
  for (const [index, sample] of evidence.samples.entries()) {
    const observedMonotonic = BigInt(sample.observedMonotonicNs);
    const elapsedMs = Number(
      (observedMonotonic - startedMonotonic) / 1_000_000n,
    );
    const stateDigest = canonicalJsonDigest(sample.state);
    const chainDigest = canonicalJsonDigest({
      elapsedMs,
      observedEpochMs: sample.observedEpochMs,
      observedMonotonicNs: sample.observedMonotonicNs,
      ordinal: index,
      previousDigest: previous,
      stateDigest,
    });
    const intervalMs =
      previousObserved === null
        ? 0
        : Number((observedMonotonic - previousObserved) / 1_000_000n);
    if (
      sample.ordinal !== index ||
      sample.elapsedMs !== elapsedMs ||
      observedMonotonic < startedMonotonic ||
      Math.abs(
        sample.observedEpochMs -
          evidence.startedEpochMs -
          sample.elapsedMs,
      ) > authority.policy.intervalToleranceMs ||
      (index > 0 &&
        Math.abs(
          intervalMs - authority.policy.intervalSeconds * 1000,
        ) > authority.policy.intervalToleranceMs) ||
      sample.previousDigest !== previous ||
      sample.stateDigest !== stateDigest ||
      sample.chainDigest !== chainDigest ||
      canonicalJson(sample.state) !== canonicalJson(evidence.before)
    ) {
      fail('continuous health sample chain, interval, or state drifted');
    }
    assertContinuousState(sample.state, input, resources);
    previous = sample.chainDigest;
    previousObserved = observedMonotonic;
  }
  const producerStart = BigInt(produce.startedMonotonicNs);
  const producerEnd = BigInt(produce.endedMonotonicNs);
  const firstObserved = BigInt(first.observedMonotonicNs);
  const lastObserved = BigInt(last.observedMonotonicNs);
  if (
    firstObserved < producerStart ||
    Number((firstObserved - producerStart) / 1_000_000n) >
      authority.policy.maximumStartDelayMs ||
    lastObserved > producerEnd ||
    Number((producerEnd - lastObserved) / 1_000_000n) >
      authority.policy.maximumEndGapMs ||
    evidence.startedEpochMs < produce.startedEpochMs ||
    evidence.endedEpochMs > produce.endedEpochMs
  ) {
    fail('continuous health samples do not cover the producer duration');
  }
}

function allHealthPresent(health) {
  return Object.values(health).every((entry) => entry !== null);
}

function proofMatches(value, commandId, commands) {
  const command = commands.get(commandId);
  return (
    value?.passed === true &&
    value.proofCommandId === commandId &&
    value.proofDigest === command?.outputDigest
  );
}

function assertHealthEvidence(
  evidence,
  commandId,
  commands,
  input,
  resources,
  dataVersion,
  manifestDigest,
) {
  if (
    !evidence ||
    evidence.proofCommandId !== commandId ||
    evidence.proofDigest !== commands.get(commandId)?.outputDigest ||
    evidence.stateDigest !== canonicalJsonDigest(evidence.state) ||
    evidence.proofDigest !== evidence.stateDigest
  ) {
    fail(`validation health evidence is not command-bound: ${commandId}`);
  }
  assertHealthState(
    evidence.state,
    input,
    resources,
    dataVersion,
    manifestDigest,
  );
}

function allExercisesPassed(exercises, input, commands) {
  return (
    proofMatches(
      exercises.remoteExercises.archiveCorruptionRejected,
      'archive-corruption',
      commands,
    ) &&
    proofMatches(
      exercises.remoteExercises.frontendRollback,
      'frontend-rollback',
      commands,
    ) &&
    proofMatches(
      exercises.remoteExercises.lockContentionRejected,
      'lock-contention',
      commands,
    ) &&
    proofMatches(
      exercises.remoteExercises.postSwitchRollback,
      'post-switch-recovery',
      commands,
    ) &&
    proofMatches(
      exercises.remoteExercises.updaterFailure,
      'updater-intentional-failure',
      commands,
    ) &&
    exercises.actionsCoveredExercises.updaterNoChange === true &&
    exercises.actionsCoveredExercises.updaterTimeout === true &&
    exercises.actionsCoveredExercises.workflowRunId ===
      input.transport.actions.run.id &&
    exercises.actionsCoveredExercises.workflowRunAttempt ===
      input.transport.actions.run.attempt &&
    exercises.actionsCoveredExercises.workflowHead ===
      input.transport.actions.run.headSha &&
    exercises.actionsCoveredExercises.operationsRevision ===
      input.source.operations.revision &&
    exercises.actionsCoveredExercises.candidateDigest ===
      input.candidate.contentAddress
  );
}

export function assertResultSemantics({
  after,
  before,
  input,
  resources,
  result,
}) {
  assertInputSemantics(input);
  validateValidationResult(result);
  const nonInterference = comparePreflights(before, after);
  const resourcesDigest = canonicalJsonDigest(resources);
  const inputDigest = canonicalJsonDigest(input);
  assertSha256(result.preflightDigest, 'validation result preflight digest');
  if (
    result.runId !== input.runId ||
    canonicalJson(result.source) !== canonicalJson(input.source) ||
    result.inputDigest !== inputDigest ||
    result.preflightDigest !== canonicalJsonDigest(before) ||
    result.resourcesDigest !== resourcesDigest ||
    canonicalJson(result.nonInterference) !==
      canonicalJson(nonInterference) ||
    canonicalJson(result.transport) !== canonicalJson(input.transport) ||
    result.deployed !== false ||
    result.productionActivated !== false ||
    result.released !== false
  ) {
    fail('validation result authority, digest, or state claim drifted');
  }
  const succeeded =
    result.conclusion === CLAIM &&
    result.claim === CLAIM;
  assertResourcesSemantics(resources, input, { allowPartial: !succeeded });
  if (succeeded) {
    const commands = assertCommandSemantics(
      result.commands,
      input,
      result.producer,
    );
    if (
      result.statuses.primary !== 'succeeded' ||
      result.statuses.rollback !== 'succeeded' ||
      result.statuses.cleanup !== 'succeeded' ||
      result.cleanup.status !== 'succeeded' ||
      result.cleanup.zeroResidue !== true ||
      result.cleanup.rootAbsent !== true ||
      result.cleanup.namedVolumesNeverObserved !== true ||
      result.cleanup.residue.length !== 0 ||
      result.errors.primary !== null ||
      canonicalJson(result.securityProjection) !==
        canonicalJson(resources.securityProjection) ||
      result.securityProjectionDigest !==
        canonicalJsonDigest(result.securityProjection) ||
      result.errors.secondary.length !== 0 ||
      !allHealthPresent(result.health) ||
      !allExercisesPassed(result.exercises, input, commands) ||
      result.producer === null ||
      result.producer.proofCommandId !== 'updater-produce' ||
      result.producer.proofDigest !==
        commands.get('updater-produce')?.outputDigest ||
      result.producer.peakMemoryBytes < 1 ||
      result.producer.peakMemoryBytes > result.producer.memoryLimitBytes ||
      result.producer.dataVersion !== result.health.full.state.dataVersion ||
      result.health.full.state.dataVersion !==
        result.health.reactivated.state.dataVersion ||
      result.health.minimal.state.dataVersion !==
        result.health.rolledBack.state.dataVersion ||
      result.health.minimal.state.dataVersion !==
        input.minimalArchive.dataVersion ||
      result.health.full.state.dataVersion === input.minimalArchive.dataVersion ||
      result.nonInterference.equal !== true
    ) {
      fail('successful validation result lacks a complete green proof');
    }
    assertHealthEvidence(
      result.health.minimal,
      'minimal-health',
      commands,
      input,
      resources,
      input.minimalArchive.dataVersion,
      input.minimalArchive.manifestDigest,
    );
    assertHealthEvidence(
      result.health.rolledBack,
      'rollback-health',
      commands,
      input,
      resources,
      input.minimalArchive.dataVersion,
      input.minimalArchive.manifestDigest,
    );
    assertHealthEvidence(
      result.health.full,
      'full-health',
      commands,
      input,
      resources,
      result.producer.dataVersion,
      result.producer.manifestDigest,
    );
    assertHealthEvidence(
      result.health.reactivated,
      'reactivated-health',
      commands,
      input,
      resources,
      result.producer.dataVersion,
      result.producer.manifestDigest,
    );
    if (
      !sameObservedProjectionDigests(
        result.health.minimal.state,
        result.health.rolledBack.state,
      ) ||
      !sameObservedProjectionDigests(
        result.health.full.state,
        result.health.reactivated.state,
      )
    ) {
      fail('validation live query or scrape projection identity drifted');
    }
    assertContinuousHealth(
      result.continuousHealth,
      input,
      resources,
      result.producer,
      commands,
      result.health.minimal.state,
    );
  } else if (
    result.conclusion !== 'failed' ||
    result.claim !==
      'isolated-operations-validation-failed-production-not-activated' ||
    result.statuses.primary !== 'failed' ||
    result.errors.primary === null
  ) {
    fail('failed validation result overclaims or omits its primary failure');
  }
  return result;
}
