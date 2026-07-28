import { canonicalJsonDigest, deepFreeze } from '../lib/canonical-json.mjs';
import {
  composeModel,
  VALIDATION_PROFILE,
  validateComposeModel,
} from '../compose/model.mjs';
import {
  PROMETHEUS,
  REMOTE_ROOT,
  validationAliases,
} from './constants.mjs';
import { runOverlay } from './render-policy.mjs';

export const CONTINUOUS_HEALTH_INTERVAL_SECONDS = 30;
export const CONTINUOUS_HEALTH_MAXIMUM_SAMPLES = 721;
export const CONTINUOUS_HEALTH_MINIMUM_SAMPLES = 2;

function commandContract(
  id,
  argv,
  proof,
  {
    expectedExitCode = 0,
    expectedOutcome = 'succeeded',
    maximumDurationMs = 300_000,
  } = {},
) {
  const contract = {
    argv,
    expectedExitCode,
    expectedOutcome,
    id,
    maximumDurationMs,
    proof,
  };
  return {
    ...contract,
    specDigest: canonicalJsonDigest(contract),
  };
}

export const COMMAND_CONTRACTS = deepFreeze([
  commandContract(
    'image-load-api',
    ['docker', 'load', '--input', '@api-oci'],
    'setup-image',
    { maximumDurationMs: 600_000 },
  ),
  commandContract(
    'image-load-updater',
    ['docker', 'load', '--input', '@updater-oci'],
    'setup-image',
    { maximumDurationMs: 600_000 },
  ),
  commandContract(
    'image-pull-prometheus',
    [
      'docker',
      'pull',
      '--platform',
      'linux/amd64',
      '@prometheus-reference',
    ],
    'setup-image',
    { maximumDurationMs: 600_000 },
  ),
  commandContract(
    'compose-config',
    ['docker', 'compose', '@sealed-compose', 'config', '--quiet'],
    'setup-compose',
  ),
  commandContract(
    'compose-create',
    [
      'docker',
      'compose',
      '@sealed-compose',
      '--profile',
      'oneshot',
      'create',
      '--no-build',
      '--no-recreate',
      'api',
      'prometheus',
    ],
    'setup-compose',
  ),
  commandContract(
    'compose-start-api',
    ['docker', 'compose', '@sealed-compose', 'start', 'api'],
    'setup-runtime',
  ),
  commandContract(
    'compose-start-prometheus',
    ['docker', 'compose', '@sealed-compose', 'start', 'prometheus'],
    'setup-runtime',
  ),
  commandContract(
    'frontend-install',
    ['internal', 'frontend-install', '@frontend-archive', '@release-root'],
    'frontend',
  ),
  commandContract(
    'frontend-hash',
    ['internal', 'frontend-tree-hash', '@frontend-root'],
    'frontend',
  ),
  commandContract(
    'frontend-rollback',
    ['internal', 'frontend-switch-failure-rollback', '@frontend-link'],
    'exercise-frontend-rollback',
  ),
  commandContract(
    'minimal-health',
    ['internal', 'capture-health-state', '@minimal-data-version'],
    'health-minimal',
  ),
  commandContract(
    'updater-doctor',
    ['docker', 'start', '--attach', '@updater-doctor-container'],
    'updater',
  ),
  commandContract(
    'updater-contract',
    ['docker', 'start', '--attach', '@updater-contract-container'],
    'updater',
  ),
  commandContract(
    'updater-intentional-failure',
    ['docker', 'start', '--attach', '@updater-failure-container'],
    'exercise-updater-failure',
    { expectedExitCode: 1, expectedOutcome: 'expected-failure' },
  ),
  commandContract(
    'updater-produce',
    [
      'timeout',
      '--signal=TERM',
      '--kill-after=30s',
      '21600',
      'nice',
      '-n',
      '10',
      'ionice',
      '-c',
      '3',
      'docker',
      'start',
      '--attach',
      '@updater-produce-container',
    ],
    'producer',
    { maximumDurationMs: 21_600_000 },
  ),
  commandContract(
    'producer-minimal-health',
    ['internal', 'verify-continuous-health-chain', '@producer-window'],
    'producer-health',
  ),
  commandContract(
    'archive-smoke-full',
    [
      '@archive-smoke',
      '-archive-root',
      '@data-root',
      '-data-version',
      '@full-data-version',
    ],
    'producer-archive',
  ),
  commandContract(
    'archive-corruption',
    [
      '@archive-smoke',
      '-archive-root',
      '@fault-root',
      '-data-version',
      '@full-data-version',
    ],
    'exercise-archive-corruption',
    { expectedExitCode: 1, expectedOutcome: 'expected-failure' },
  ),
  commandContract(
    'full-switch',
    ['internal', 'pointer-switch', '@full-data-version'],
    'switch-full',
  ),
  commandContract(
    'full-health',
    ['internal', 'capture-health-state', '@full-data-version'],
    'health-full',
  ),
  commandContract(
    'rollback-switch',
    ['internal', 'pointer-rollback', '@minimal-data-version'],
    'switch-rollback',
  ),
  commandContract(
    'rollback-health',
    ['internal', 'capture-health-state', '@minimal-data-version'],
    'health-rollback',
  ),
  commandContract(
    'post-switch-failure',
    ['internal', 'pointer-invalid-switch-exercise'],
    'exercise-post-switch-rollback',
    { expectedExitCode: 1, expectedOutcome: 'expected-failure' },
  ),
  commandContract(
    'post-switch-recovery',
    ['internal', 'pointer-automatic-rollback', '@minimal-data-version'],
    'exercise-post-switch-rollback',
  ),
  commandContract(
    'lock-contention',
    ['internal', 'cleanup-lock-contention-exercise'],
    'exercise-lock-contention',
    { expectedExitCode: 1, expectedOutcome: 'expected-failure' },
  ),
  commandContract(
    'reactivate-switch',
    ['internal', 'pointer-reactivate', '@full-data-version'],
    'switch-reactivate',
  ),
  commandContract(
    'reactivated-health',
    ['internal', 'capture-health-state', '@full-data-version'],
    'health-reactivated',
  ),
  commandContract(
    'cleanup-resources',
    ['internal', 'cleanup-run-owned-resources'],
    'cleanup',
  ),
]);

const COMMANDS_DIGEST = canonicalJsonDigest(COMMAND_CONTRACTS);

function fail(message) {
  throw new TypeError(message);
}

function resolveText(value, environment) {
  if (typeof value !== 'string') return value;
  return value.replace(
    /\$\{(BGMSS_[A-Z_]+):\?\1 required\}/gu,
    (_, name) => {
      if (!Object.hasOwn(environment, name)) {
        fail(`security projection cannot resolve ${name}`);
      }
      return environment[name];
    },
  );
}

function resolveValue(value, environment) {
  if (typeof value === 'string') return resolveText(value, environment);
  if (Array.isArray(value)) {
    return value.map((entry) => resolveValue(entry, environment));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        resolveValue(entry, environment),
      ]),
    );
  }
  return value;
}

function memoryBytes(value) {
  const match = /^(?<amount>[1-9][0-9]*)m$/u.exec(value);
  if (!match) fail('security projection memory limit is not admitted');
  return Number(match.groups.amount) * 1024 * 1024;
}

function stopSeconds(value) {
  const match = /^(?<amount>[1-9][0-9]*)s$/u.exec(value);
  if (!match) fail('security projection stop period is not admitted');
  return Number(match.groups.amount);
}

function sortedMap(value) {
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right, 'en'),
    ),
  );
}

function composeGeneratedLabels(service, composeVersion) {
  if (service === 'updater') return {};
  if (!/^2[.][0-9]+[.][0-9]+(?:[-+][A-Za-z0-9.-]+)?$/u.test(
    composeVersion,
  )) {
    fail('security projection requires an admitted Compose v2 version');
  }
  return {
    'com.docker.compose.config-hash': `@compose-config-hash:${service}`,
    'com.docker.compose.container-number': '1',
    'com.docker.compose.depends_on':
      service === 'prometheus' ? 'api:service_started:false' : '',
    'com.docker.compose.image': `@image-runtime-id:${service}`,
    'com.docker.compose.oneoff': 'False',
    'com.docker.compose.project.config_files':
      `${REMOTE_ROOT}/compose/compose.yaml,${REMOTE_ROOT}/compose/run-overlay.yaml`,
    'com.docker.compose.project.working_dir': `${REMOTE_ROOT}/compose`,
    'com.docker.compose.version': composeVersion,
  };
}

function labelsFor(
  service,
  runtimeLabels,
  modelLabels,
  runId,
  composeVersion,
) {
  return sortedMap({
    ...runtimeLabels,
    ...composeGeneratedLabels(service, composeVersion),
    'com.docker.compose.project': 'bgmss_ops_validation',
    'com.docker.compose.service': service,
    ...modelLabels,
    ...runOverlay(runId).services[service].labels,
  });
}

function expectedEntrypoint(service) {
  if (service === 'api') return ['/usr/local/bin/bgmss-api'];
  if (service === 'prometheus') return ['/bin/prometheus'];
  if (service === 'updater') {
    return [
      '/usr/local/bin/python',
      '-m',
      'bangumi_staff_stats_updater',
    ];
  }
  fail('security projection service is not admitted');
}

function serviceProjection(
  name,
  service,
  environment,
  imageRuntimeDefaults,
  runId,
  composeVersion,
) {
  const resolved = resolveValue(service, environment);
  if (
    !imageRuntimeDefaults ||
    canonicalJsonDigest({
      command: imageRuntimeDefaults.command,
      entrypoint: imageRuntimeDefaults.entrypoint,
      environment: imageRuntimeDefaults.environment,
      labels: imageRuntimeDefaults.labels,
      user: imageRuntimeDefaults.user,
    }) !== canonicalJsonDigest(imageRuntimeDefaults) ||
    canonicalJsonDigest(imageRuntimeDefaults.entrypoint) !==
      canonicalJsonDigest(expectedEntrypoint(name))
  ) {
    fail(`security projection ${name} image runtime defaults drifted`);
  }
  return {
    capAdd: [],
    capDrop: [...resolved.cap_drop].sort(),
    command: [...resolved.command],
    entrypoint: [...imageRuntimeDefaults.entrypoint],
    environment: sortedMap({
      ...imageRuntimeDefaults.environment,
      ...(resolved.environment ?? {}),
    }),
    image: resolved.image,
    init: resolved.init,
    labels: labelsFor(
      name,
      imageRuntimeDefaults.labels,
      resolved.labels,
      runId,
      composeVersion,
    ),
    logging: {
      driver: resolved.logging.driver,
      options: Object.fromEntries(
        Object.entries(resolved.logging.options).sort(([left], [right]) =>
          left.localeCompare(right, 'en'),
        ),
      ),
    },
    maximumProcesses: resolved.pids_limit,
    memoryBytes: memoryBytes(resolved.mem_limit),
    mounts: [...(resolved.volumes ?? [])]
      .map((mount) => ({
        bindCreateHostPath: mount.bind.create_host_path,
        propagation: 'rprivate',
        readOnly: mount.read_only,
        source: mount.source,
        target: mount.target,
        type: mount.type,
      }))
      .sort((left, right) => left.target.localeCompare(right.target, 'en')),
    nanoCpus: Math.round(resolved.cpus * 1_000_000_000),
    networks: [...(resolved.networks ?? [])]
      .map((network) => `bgmss_ops_validation_${network}`)
      .sort(),
    ports: [...(resolved.ports ?? [])]
      .map((port) => ({
        hostIp: port.host_ip,
        protocol: port.protocol,
        published: Number(port.published),
        target: port.target,
      }))
      .sort((left, right) => left.target - right.target),
    privileged: false,
    readOnlyRootFilesystem: resolved.read_only,
    restart: resolved.restart,
    securityOptions: [...resolved.security_opt].sort(),
    service: name,
    stopGracePeriodSeconds: stopSeconds(resolved.stop_grace_period),
    tmpfs: [...(resolved.tmpfs ?? [])].sort(),
    user: resolved.user,
  };
}

export function expectedSecurityProjection({
  appRevision,
  appVersion,
  commonCommit,
  composeVersion,
  imageRuntimeDefaults,
  runId,
}) {
  const aliases = validationAliases(appRevision);
  const environment = {
    BGMSS_API_IMAGE: aliases.api,
    BGMSS_APP_REVISION: appRevision,
    BGMSS_APP_VERSION: appVersion,
    BGMSS_COMMON_COMMIT: commonCommit,
    BGMSS_RELEASE_MANIFEST_DIGEST: `sha256:${'0'.repeat(64)}`,
    BGMSS_RELEASE_ROOT: `${REMOTE_ROOT}/releases/${appVersion}`,
    BGMSS_UPDATER_IMAGE: aliases.updater,
  };
  const model = validateComposeModel(
    composeModel(VALIDATION_PROFILE),
    VALIDATION_PROFILE,
  );
  const services = Object.entries(model.services)
    .map(([name, service]) =>
      serviceProjection(
        name,
        service,
        environment,
        name === 'prometheus'
          ? PROMETHEUS.runtimeDefaults
          : imageRuntimeDefaults?.[name],
        runId,
        composeVersion,
      ),
    )
    .sort((left, right) => left.service.localeCompare(right.service, 'en'));
  if (services.find((entry) => entry.service === 'prometheus')?.image !==
      PROMETHEUS.validationAlias) {
    fail('security projection Prometheus image drifted');
  }
  return deepFreeze({
    schemaVersion: 'operations-validation-security-projection-v1',
    services,
  });
}

export function materializeSecurityProjection(
  projection,
  { composeConfigHashes, imageRuntimeIds },
) {
  const services = projection.services.map((service) => ({
    ...service,
    labels: sortedMap(
      Object.fromEntries(
        Object.entries(service.labels).map(([name, value]) => {
          if (value === `@compose-config-hash:${service.service}`) {
            value = composeConfigHashes[service.service];
          } else if (value === `@image-runtime-id:${service.service}`) {
            value = imageRuntimeIds[service.service];
          }
          if (
            typeof value !== 'string' ||
            value.startsWith('@compose-config-hash:') ||
            value.startsWith('@image-runtime-id:')
          ) {
            fail(
              `security projection ${service.service} materialization is incomplete`,
            );
          }
          return [name, value];
        }),
      ),
    ),
  }));
  return deepFreeze({
    schemaVersion: projection.schemaVersion,
    services,
  });
}

export function expectedCommandAuthority() {
  return deepFreeze({
    digest: COMMANDS_DIGEST,
    records: COMMAND_CONTRACTS,
  });
}

export function expectedContinuousHealthAuthority({
  appRevision,
  appVersion,
  minimalArchive,
}) {
  const aliases = validationAliases(appRevision);
  const expected = {
    apiImage: aliases.api,
    apiRevision: appRevision,
    apiVersion: appVersion,
    dataVersion: minimalArchive.dataVersion,
    pointerDigest: canonicalJsonDigest({
      dataVersion: minimalArchive.dataVersion,
      manifestDigest: minimalArchive.manifestDigest,
      pointerSchemaVersion: 1,
    }),
    pointerMode: '0644',
    projectionDigests: {
      buildDigest: canonicalJsonDigest({
        revision: appRevision,
        version: appVersion,
      }),
      metricsDigest: canonicalJsonDigest({
        build: {
          revision: appRevision,
          version: appVersion,
        },
        snapshot: {
          dataVersion: minimalArchive.dataVersion,
        },
      }),
      prometheusDigest: canonicalJsonDigest({
        job: 'bgmss-api',
        up: 1,
      }),
      readyDigest: canonicalJsonDigest({
        dataVersion: minimalArchive.dataVersion,
        ready: true,
      }),
      typedQueryDigest: canonicalJsonDigest({
        dataVersion: minimalArchive.dataVersion,
        page: 1,
        pageSize: 5,
        typed: true,
      }),
    },
    prometheusImage: aliases.prometheus,
  };
  const policy = {
    intervalToleranceMs: 5_000,
    intervalSeconds: CONTINUOUS_HEALTH_INTERVAL_SECONDS,
    maximumEndGapMs:
      (CONTINUOUS_HEALTH_INTERVAL_SECONDS + 5) * 1_000,
    maximumSamples: CONTINUOUS_HEALTH_MAXIMUM_SAMPLES,
    maximumStartDelayMs: 5_000,
    minimumSamples: CONTINUOUS_HEALTH_MINIMUM_SAMPLES,
  };
  return deepFreeze({
    digest: canonicalJsonDigest({ expected, policy }),
    expected,
    policy,
  });
}

export function expectedValidationAuthority({
  appRevision,
  appVersion,
  commonCommit,
  composeVersion,
  imageRuntimeDefaults,
  minimalArchive,
  runId,
}) {
  const projection = expectedSecurityProjection({
    appRevision,
    appVersion,
    commonCommit,
    composeVersion,
    imageRuntimeDefaults,
    runId,
  });
  return deepFreeze({
    commands: expectedCommandAuthority(),
    continuousHealth: expectedContinuousHealthAuthority({
      appRevision,
      appVersion,
      minimalArchive,
    }),
    security: {
      digest: canonicalJsonDigest(projection),
      projection,
    },
  });
}
