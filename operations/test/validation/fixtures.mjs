import fs from 'node:fs';
import path from 'node:path';

import { stringify } from 'yaml';

import {
  renderCompose,
  renderReleaseEnvironment,
} from '../../compose/render.mjs';
import { canonicalJsonDigest } from '../../lib/canonical-json.mjs';
import { sha256, sha256File } from '../../lib/digest.mjs';
import { COMMON_COMMIT } from '../../release/constants.mjs';
import {
  expectedValidationAuthority,
  materializeSecurityProjection,
} from '../../validation/authority.mjs';
import {
  API_BIND,
  HOST_ALIAS,
  LEGACY_ROOT,
  NETWORKS,
  PRODUCTION_ROOT,
  PROJECT,
  PROMETHEUS,
  REMOTE_ROOT,
  REPOSITORY_ROOT,
  SERVICES,
  TRANSFER_ROLES,
  validationAliases,
} from '../../validation/constants.mjs';
import { runOverlay } from '../../validation/render-policy.mjs';
import { controllerFilesDigest } from '../../validation/package.mjs';

const digest = (character) => `sha256:${character.repeat(64)}`;
const oid = (character) => character.repeat(40);
const runId = `run-${'1'.repeat(32)}`;
const dataVersion = (character) => `dv1-${character.repeat(64)}`;

function seal(id, character) {
  return {
    count: 1,
    coverage: 'closed test projection',
    digest: digest(character),
    id,
  };
}

export function validActionsAuthority() {
  const headSha = oid('1');
  const repositoryId = '987654321';
  const workflowRunId = '123456';
  const creationEpochMs = 1_785_200_001_000;
  return {
    artifact: {
      creationEpochMs,
      digest: digest('f'),
      expirationEpochMs: creationEpochMs + 24 * 60 * 60 * 1000,
      expired: false,
      headRepositoryId: repositoryId,
      headSha,
      id: '789012',
      name: `bgmss-operations-validation-${headSha}`,
      repositoryId,
      runId: workflowRunId,
      sizeInBytes: 4096,
    },
    repository: {
      id: repositoryId,
      name: 'BangumiStaffStats',
      owner: 'AcuLY',
    },
    run: {
      attempt: 2,
      attemptStartedEpochMs: 1_785_200_000_000,
      conclusion: 'success',
      event: 'push',
      headRepositoryFullName: 'AcuLY/BangumiStaffStats',
      headRepositoryId: repositoryId,
      headSha,
      id: workflowRunId,
      status: 'completed',
      workflowPathAtRef:
        '.github/workflows/operations.yml@refs/heads/codex/formal-rewrite',
    },
    workflow: {
      id: '456789',
      name: 'operations-verification',
      path: '.github/workflows/operations.yml',
    },
  };
}

export function validPreflight() {
  return {
    absence: {
      imageReferences: [
        `localhost/bgmss-backend-api:${oid('2')}-amd64`,
        `localhost/bgmss-ops-validation-api:${oid('2')}-amd64`,
        PROMETHEUS.validationAlias,
        PROMETHEUS.reference,
        `localhost/bgmss-ops-validation-updater:${oid('2')}-amd64`,
        `localhost/bgmss-updater-artifact:${oid('2')}-amd64`,
      ].sort(),
      imagesAbsent: true,
      namedVolumesAbsent: true,
      portFree: true,
      projectAbsent: true,
      rootAbsent: true,
    },
    capacity: {
      availableBytes: 20_000_000_000,
      availableInodes: 200_000,
      requiredBytes: 10_000_000_000,
    },
    conclusion: 'admitted',
    host: {
      alias: HOST_ALIAS,
      architecture: 'x86_64',
      composePluginPath:
        '/usr/libexec/docker/cli-plugins/docker-compose',
      composeVersion: '2.27.1',
      containerCapabilities: {
        composeConfigHash: true,
        composeConfigQuiet: true,
        composeCreateNoBuild: true,
        composeCreateNoRecreate: true,
        composeEnvFile: true,
        composeFile: true,
        composeProfiles: true,
        composeProjectName: true,
        dockerImageInspect: true,
        dockerLabelFilter: true,
        dockerManifestVerbose: true,
        dockerPlatformPull: true,
        dockerServerLinuxAmd64: true,
      },
      dockerClientVersion: '26.1.4',
      dockerConfig: '/run/bgmss-docker-config-absent',
      dockerEndpoint: 'unix:///var/run/docker.sock',
      dockerNegotiatedApiVersion: '1.45',
      dockerServerApiVersion: '1.45',
      dockerServerMinimumApiVersion: '1.24',
      dockerServerVersion: '26.1.4',
      hostCapabilities: {
        bashAssociativeArrays: true,
        bashDynamicFileDescriptors: true,
        bashMapfile: true,
        coreutilsDateMilliseconds: true,
        coreutilsMvNoClobber: true,
        coreutilsMvNoTargetDirectory: true,
        coreutilsSyncFileSystem: true,
        curlMaxFilesize: true,
        findutilsPrintf: true,
        utilLinuxSetsidFork: true,
      },
      kernelName: 'Linux',
      kernelRelease: '5.14.0-503.19.1.el9_5.x86_64',
      uid: 0,
    },
    protected: {
      docker: {
        containers: seal('docker-containers', '1'),
        images: seal('docker-images', '2'),
        networks: seal('docker-networks', '3'),
        volumes: seal('docker-volumes', '4'),
      },
      legacyRoot: { state: 'absent' },
      legacyTree: seal('legacy-bounded-tree', '5'),
      listeners: seal('listeners', '6'),
      nginx: seal('nginx-tree', '7'),
      processes: seal('processes', '8'),
      productionRoot: { state: 'absent' },
      systemd: {
        etc: seal('systemd-etc-tree', '9'),
        runtime: seal('systemd-runtime', 'a'),
        vendor: seal('systemd-vendor-tree', 'b'),
      },
      tls: {
        letsencrypt: seal('tls-letsencrypt-tree', 'c'),
        pki: seal('tls-pki-tree', 'd'),
      },
    },
    schemaVersion: 'operations-validation-preflight-v1',
    tools: {
      identity: seal('required-tools', 'e'),
      names: ['awk', 'docker-compose-plugin'],
    },
  };
}

export function validInput() {
  const preflight = validPreflight();
  const aliases = validationAliases(oid('2'));
  const files = TRANSFER_ROLES.map((role, index) => {
    const id = `f${String(index + 1).padStart(4, '0')}`;
    return {
      id,
      mode: ['archive-smoke', 'remote-entry'].includes(role) ? '0500' : '0400',
      remoteName: `files/${id}`,
      role,
      sha256:
        role === 'preflight-evidence'
          ? canonicalJsonDigest(preflight)
          : digest(((index % 6) + 1).toString()),
      size: 100 + index,
    };
  });
  const id = (role) => files.find((entry) => entry.role === role).id;
  const file = (role) => files.find((entry) => entry.role === role);
  file('compose').sha256 = sha256(renderCompose('validation'));
  file('run-overlay').sha256 = sha256(
    stringify(runOverlay(runId), {
      aliasDuplicateObjects: false,
      lineWidth: 0,
      sortMapEntries: true,
    }),
  );
  file('release-environment').sha256 = sha256(
    renderReleaseEnvironment('validation', {
      apiImage: `localhost/bgmss-validation-seal/api@${digest('2')}`,
      appRevision: oid('2'),
      appVersion: 'v0.1.0',
      archiveSmokeDigest: file('archive-smoke').sha256,
      commonCommit: COMMON_COMMIT,
      manifestDigest: file('candidate-document').sha256,
      schemaVersion: 'runtime-release-v1',
      updaterImage:
        `localhost/bgmss-validation-seal/updater@${digest('4')}`,
    }),
  );
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
    file(role).sha256 = sha256File(source);
    file(role).size = fs.statSync(source).size;
  }
  const minimalArchive = {
    dataVersion: dataVersion('a'),
    manifestDigest: file('minimal-manifest').sha256,
    manifestFileId: id('minimal-manifest'),
    sqliteDigest: file('minimal-sqlite').sha256,
    sqliteFileId: id('minimal-sqlite'),
    sqliteSize: file('minimal-sqlite').size,
  };
  const imageRuntimeDefaults = {
    api: {
      command: [],
      entrypoint: ['/usr/local/bin/bgmss-api'],
      environment: {
        PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        SSL_CERT_FILE: '/etc/ssl/certs/ca-certificates.crt',
      },
      labels: {
        'org.opencontainers.image.version': 'v0.1.0',
      },
      user: '65532:65532',
    },
    updater: {
      command: [],
      entrypoint: [
        '/usr/local/bin/python',
        '-m',
        'bangumi_staff_stats_updater',
      ],
      environment: {
        HOME: '/nonexistent',
        LANG: 'C.UTF-8',
        LC_ALL: 'C.UTF-8',
        PATH: '/usr/local/bin:/usr/bin:/bin',
        PYTHONDONTWRITEBYTECODE: '1',
        PYTHONHASHSEED: '0',
        PYTHONPATH: '/opt/runtime',
        PYTHONUNBUFFERED: '1',
      },
      labels: {
        'org.opencontainers.image.version': 'v0.1.0',
      },
      user: '65532:65532',
    },
  };
  const apiRootfsDiffIds = [digest('7')];
  const updaterRootfsDiffIds = [digest('8')];
  return {
    authority: expectedValidationAuthority({
      appRevision: oid('2'),
      appVersion: 'v0.1.0',
      commonCommit: COMMON_COMMIT,
      composeVersion: preflight.host.composeVersion,
      imageRuntimeDefaults,
      minimalArchive,
      runId,
    }),
    bounds: {
      apiReadySeconds: 60,
      commandOutputBytes: 4194304,
      producerCpu: '1.0',
      producerIoPriority: 'idle',
      producerMemoryBytes: 671088640,
      producerTimeoutSeconds: 21600,
    },
    candidate: {
      applicationVersion: 'v0.1.0',
      candidateDocumentFileId: id('candidate-document'),
      candidateDocumentSha256: file('candidate-document').sha256,
      completeInventoryFileId: id('candidate-inventory'),
      contentAddress: digest('a'),
      publicationState: 'unpublished-validation',
      target: 'linux/amd64',
    },
    claim: 'isolated-validation-input-production-not-activated',
    images: {
      api: {
        archiveFileId: id('api-image'),
        config: {
          digest: digest('1'),
          mediaType: 'application/vnd.oci.image.config.v1+json',
          size: 100,
        },
        declaredLoadReference:
          `localhost/bgmss-backend-api:${oid('2')}-amd64`,
        graphDigest: canonicalJsonDigest({
          configDigest: digest('1'),
          rootfsDiffIds: apiRootfsDiffIds,
        }),
        manifest: {
          digest: digest('2'),
          mediaType: 'application/vnd.oci.image.manifest.v1+json',
          size: 200,
        },
        rootfsDiffIds: apiRootfsDiffIds,
        runtimeDefaults: imageRuntimeDefaults.api,
        validationAlias: aliases.api,
      },
      prometheus: {
        amd64ManifestDigest: PROMETHEUS.amd64ManifestDigest,
        amd64ManifestSize: PROMETHEUS.amd64ManifestSize,
        configIdentityPolicy: 'capture-after-exact-digest-pull',
        indexDigest: PROMETHEUS.indexDigest,
        reference: PROMETHEUS.reference,
        runtimeDefaults: PROMETHEUS.runtimeDefaults,
        runtimeGid: PROMETHEUS.runtimeGid,
        runtimeUid: PROMETHEUS.runtimeUid,
        validationAlias: PROMETHEUS.validationAlias,
      },
      updater: {
        archiveFileId: id('updater-image'),
        config: {
          digest: digest('3'),
          mediaType: 'application/vnd.oci.image.config.v1+json',
          size: 300,
        },
        declaredLoadReference:
          `localhost/bgmss-updater-artifact:${oid('2')}-amd64`,
        graphDigest: canonicalJsonDigest({
          configDigest: digest('3'),
          rootfsDiffIds: updaterRootfsDiffIds,
        }),
        manifest: {
          digest: digest('4'),
          mediaType: 'application/vnd.oci.image.manifest.v1+json',
          size: 400,
        },
        rootfsDiffIds: updaterRootfsDiffIds,
        runtimeDefaults: imageRuntimeDefaults.updater,
        validationAlias: aliases.updater,
      },
    },
    minimalArchive,
    preflight: {
      digest: canonicalJsonDigest(preflight),
      fileId: id('preflight-evidence'),
    },
    remote: {
      apiBind: API_BIND,
      hostAlias: HOST_ALIAS,
      legacyRoot: LEGACY_ROOT,
      networks: NETWORKS,
      outboundEgress: true,
      productionRoot: PRODUCTION_ROOT,
      project: PROJECT,
      root: REMOTE_ROOT,
      services: SERVICES,
    },
    runId,
    runtime: {
      compatibilityFileId: id('compatibility'),
      composeFileId: id('compose'),
      controllerFilesDigest: controllerFilesDigest(),
      frontendFileId: id('frontend'),
      prometheusConfigFileId: id('prometheus-config'),
      prometheusRulesFileId: id('prometheus-rules'),
      releaseEnvironmentFileId: id('release-environment'),
      remoteEntryFileId: id('remote-entry'),
      runOverlayFileId: id('run-overlay'),
      smokeFileId: id('archive-smoke'),
    },
    schemaVersion: 'operations-validation-input-v1',
    source: {
      operations: { revision: oid('1'), tree: oid('3') },
      product: { revision: oid('2'), tree: oid('4') },
    },
    states: {
      deployed: false,
      productionActivated: false,
      released: false,
    },
    transfer: {
      fileCount: files.length,
      files,
      totalSize: files.reduce((sum, entry) => sum + entry.size, 0),
    },
    transport: {
      actions: validActionsAuthority(),
      candidateArchiveSha256: digest('6'),
      externalInventorySha256: file('candidate-inventory').sha256,
    },
  };
}

export function validResources(input = validInput()) {
  const imageRuntimeIds = {
    api: input.images.api.config.digest,
    prometheus: digest('5'),
    updater: input.images.updater.config.digest,
  };
  const securityProjection = materializeSecurityProjection(
    input.authority.security.projection,
    {
      composeConfigHashes: {
        api: 'a'.repeat(64),
        prometheus: 'b'.repeat(64),
      },
      imageRuntimeIds,
    },
  );
  const securityDigest = (service) =>
    canonicalJsonDigest(
      securityProjection.services.find(
        (entry) => entry.service === service,
      ),
    );
  const container = (service, character, suffix) => ({
    id: character.repeat(64),
    name: `/bgmss_ops_validation-${service}-${suffix}`,
    project: PROJECT,
    runId: input.runId,
    securityDigest: securityDigest(service),
    service,
  });
  return {
    containers: [
      container('api', '1', '1'),
      container('prometheus', '2', '1'),
      container('updater', '3', 'produce'),
    ],
    images: [
      {
        configDigest: input.images.api.config.digest,
        graphDigest: input.images.api.graphDigest,
        manifestDigest: input.images.api.manifest.digest,
        references: [
          input.images.api.declaredLoadReference,
          input.images.api.validationAlias,
        ].sort(),
        role: 'api',
        runtimeId: input.images.api.config.digest,
        rootfsDiffIds: input.images.api.rootfsDiffIds,
      },
      {
        configDigest: digest('5'),
        graphDigest: canonicalJsonDigest({
          configDigest: digest('5'),
          rootfsDiffIds: [digest('6')],
        }),
        manifestDigest: input.images.prometheus.amd64ManifestDigest,
        references: [
          input.images.prometheus.reference,
          input.images.prometheus.validationAlias,
        ].sort(),
        role: 'prometheus',
        runtimeId: digest('5'),
        rootfsDiffIds: [digest('6')],
      },
      {
        configDigest: input.images.updater.config.digest,
        graphDigest: input.images.updater.graphDigest,
        manifestDigest: input.images.updater.manifest.digest,
        references: [
          input.images.updater.declaredLoadReference,
          input.images.updater.validationAlias,
        ].sort(),
        role: 'updater',
        runtimeId: input.images.updater.config.digest,
        rootfsDiffIds: input.images.updater.rootfsDiffIds,
      },
    ],
    namedVolumeObserved: false,
    networks: [
      {
        id: '4'.repeat(64),
        internal: false,
        name: `${PROJECT}_outbound`,
        project: PROJECT,
        runId: input.runId,
      },
      {
        id: '5'.repeat(64),
        internal: true,
        name: `${PROJECT}_runtime`,
        project: PROJECT,
        runId: input.runId,
      },
    ],
    pathManifest: {
      device: '1',
      directoryCount: 10,
      fileCount: 20,
      inventoryDigest: digest('6'),
      markerDigest: digest('1'),
      rootInode: '2',
    },
    port: { hostIp: '127.0.0.1', published: 19090, target: 8080 },
    project: PROJECT,
    runId: input.runId,
    schemaVersion: 'operations-validation-resources-v1',
    securityProjection,
    securityProjectionDigest: canonicalJsonDigest(securityProjection),
  };
}

export function validCommands(input = validInput(), producerSeconds = 100) {
  return input.authority.commands.records.map((contract, index) => {
    const durationMs =
      contract.id === 'updater-produce' ? producerSeconds * 1000 : 1;
    const startedEpochMs = 1_785_200_100_000 + index * 200_000;
    const startedMonotonicNs =
      1_000_000_000_000n + BigInt(index) * 200_000_000_000n;
    return {
      argvDigest: canonicalJsonDigest(contract.argv),
      durationMs,
      endedEpochMs: startedEpochMs + durationMs,
      endedMonotonicNs:
        `${startedMonotonicNs + BigInt(durationMs) * 1_000_000n}`,
      exitCode: contract.expectedExitCode,
      id: contract.id,
      outcome: contract.expectedOutcome,
      outputDigest: digest(
        String((index % 9) + 1),
      ),
      proof: contract.proof,
      specDigest: contract.specDigest,
      startedEpochMs,
      startedMonotonicNs: `${startedMonotonicNs}`,
    };
  });
}

export function validCommandProof(
  commandId,
  input = validInput(),
  producerSeconds = 100,
) {
  const command = validCommands(input, producerSeconds).find(
    (entry) => entry.id === commandId,
  );
  return {
    passed: true,
    proofCommandId: command.id,
    proofDigest: command.outputDigest,
  };
}

export function validHealthState(
  dataVersion,
  manifestDigest,
  input = validInput(),
  resources = validResources(input),
) {
  const container = (service) =>
    resources.containers.find((entry) => entry.service === service);
  const image = (role) =>
    resources.images.find((entry) => entry.role === role);
  return {
    api: {
      containerId: container('api').id,
      imageReference:
        input.authority.continuousHealth.expected.apiImage,
      imageRuntimeId: image('api').runtimeId,
      restartCount: 0,
      running: true,
      securityDigest: container('api').securityDigest,
      startDigest: digest('a'),
    },
    apiRevision: input.source.product.revision,
    apiVersion: input.candidate.applicationVersion,
    dataVersion,
    failureCode: null,
    pointer: {
      digest: canonicalJsonDigest({
        dataVersion,
        manifestDigest,
        pointerSchemaVersion: 1,
      }),
      inode: '12345',
      mode: '0644',
    },
    projections: {
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
      prometheusScrapeDigest: canonicalJsonDigest({
        series: [{ job: 'bgmss-api', up: 1 }],
      }),
      queryResultDigest: canonicalJsonDigest({
        data: { items: [{ dataVersion }] },
        meta: {
          dataVersion,
          pagination: { page: 1, pageSize: 5 },
        },
      }),
      readyDigest: canonicalJsonDigest({ dataVersion, ready: true }),
      typedQueryDigest: canonicalJsonDigest({
        dataVersion,
        page: 1,
        pageSize: 5,
        typed: true,
      }),
    },
    prometheus: {
      containerId: container('prometheus').id,
      imageReference:
        input.authority.continuousHealth.expected.prometheusImage,
      imageRuntimeId: image('prometheus').runtimeId,
      restartCount: 0,
      running: true,
      securityDigest: container('prometheus').securityDigest,
      startDigest: digest('9'),
    },
  };
}

export function validHealthEvidence(
  commandId,
  dataVersion,
  manifestDigest,
  input = validInput(),
  resources = validResources(input),
  producerSeconds = 100,
) {
  const command = validCommands(input, producerSeconds).find(
    (entry) => entry.id === commandId,
  );
  const state = validHealthState(
    dataVersion,
    manifestDigest,
    input,
    resources,
  );
  const stateDigest = canonicalJsonDigest(state);
  return {
    proofCommandId: command.id,
    proofDigest: stateDigest,
    state,
    stateDigest,
  };
}

export function validContinuousHealth(
  input = validInput(),
  resources = validResources(input),
  producerSeconds = 100,
) {
  const commands = validCommands(input, producerSeconds);
  const produce = commands.find((entry) => entry.id === 'updater-produce');
  const verification = commands.find(
    (entry) => entry.id === 'producer-minimal-health',
  );
  const state = validHealthState(
    input.minimalArchive.dataVersion,
    input.minimalArchive.manifestDigest,
    input,
    resources,
  );
  const interval =
    input.authority.continuousHealth.policy.intervalSeconds;
  const count = Math.floor((producerSeconds - 1) / interval) + 1;
  const startedEpochMs = produce.startedEpochMs + 1_000;
  const startedMonotonicNs =
    BigInt(produce.startedMonotonicNs) + 1_000_000_000n;
  const samples = [];
  let previousDigest = null;
  for (let ordinal = 0; ordinal < count; ordinal += 1) {
    const elapsedMs = ordinal * interval * 1000;
    const observedEpochMs = startedEpochMs + elapsedMs;
    const observedMonotonicNs =
      `${startedMonotonicNs + BigInt(elapsedMs) * 1_000_000n}`;
    const stateDigest = canonicalJsonDigest(state);
    const chainDigest = canonicalJsonDigest({
      elapsedMs,
      observedEpochMs,
      observedMonotonicNs,
      ordinal,
      previousDigest,
      stateDigest,
    });
    samples.push({
      chainDigest,
      elapsedMs,
      observedEpochMs,
      observedMonotonicNs,
      ordinal,
      previousDigest,
      state,
      stateDigest,
    });
    previousDigest = chainDigest;
  }
  const evidence = {
    after: state,
    authorityDigest: input.authority.continuousHealth.digest,
    before: state,
    count,
    endedEpochMs: samples.at(-1).observedEpochMs,
    endedMonotonicNs: samples.at(-1).observedMonotonicNs,
    firstDigest: samples[0].chainDigest,
    intervalSeconds: interval,
    lastDigest: samples.at(-1).chainDigest,
    proofCommandId: produce.id,
    proofDigest: produce.outputDigest,
    samples,
    startedEpochMs,
    startedMonotonicNs: `${startedMonotonicNs}`,
    status: 'passed',
  };
  return {
    ...evidence,
    verificationProof: {
      passed: true,
      proofCommandId: verification.id,
      proofDigest: canonicalJsonDigest(evidence),
    },
  };
}

export const fixtureDigest = digest;
export const fixtureDataVersion = dataVersion;
