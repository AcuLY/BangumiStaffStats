import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson, deepFreeze } from '../lib/canonical-json.mjs';
import { assertGitOid, assertSha256 } from '../lib/digest.mjs';
import { isContainerImageReference } from '../lib/schema.mjs';
import { readJsonStrict } from '../lib/strict-json.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = readJsonStrict(
  path.join(HERE, '..', 'config', 'runtime-profiles.json'),
);

const VERSION_PATTERN =
  /^v(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/u;
const DIGEST_IMAGE_PATTERN = /@sha256:[0-9a-f]{64}$/u;
const INTERPOLATION_PATTERN =
  /^\$\{BGMSS_[A-Z_]+:\?BGMSS_[A-Z_]+ required\}(?:\/bin\/archive-smoke)?$/u;

export const PRODUCTION_PROFILE = 'production';
export const VALIDATION_PROFILE = 'validation';
export const PROFILE_NAMES = deepFreeze([
  PRODUCTION_PROFILE,
  VALIDATION_PROFILE,
]);
export const PROMETHEUS = deepFreeze({ ...CONFIG.prometheus });

export class RuntimeModelError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RuntimeModelError';
  }
}

function fail(message) {
  throw new RuntimeModelError(message);
}

function requireExactKeys(value, keys, label) {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join('\0') !== [...keys].sort().join('\0')
  ) {
    fail(`${label} must have the exact closed field set`);
  }
  return value;
}

function requiredVariable(name) {
  return `\${${name}:?${name} required}`;
}

function profile(name) {
  if (!PROFILE_NAMES.includes(name)) fail('runtime profile is not admitted');
  const selected = CONFIG.profiles[name];
  requireExactKeys(selected, ['apiBind', 'project', 'root'], 'runtime profile');
  return selected;
}

export function assertRuntimeRelease(value) {
  requireExactKeys(
    value,
    [
      'apiImage',
      'appRevision',
      'appVersion',
      'archiveSmokeDigest',
      'commonCommit',
      'manifestDigest',
      'schemaVersion',
      'updaterImage',
    ],
    'runtime release',
  );
  if (value.schemaVersion !== 'runtime-release-v1') {
    fail('runtime release schema version is not admitted');
  }
  if (!VERSION_PATTERN.test(value.appVersion)) {
    fail('runtime release version is invalid');
  }
  assertGitOid(value.appRevision, 'runtime app revision');
  assertGitOid(value.commonCommit, 'runtime common commit');
  assertSha256(value.archiveSmokeDigest, 'archive-smoke digest');
  assertSha256(value.manifestDigest, 'release manifest digest');
  for (const [label, image] of [
    ['API image', value.apiImage],
    ['Updater image', value.updaterImage],
  ]) {
    if (
      !isContainerImageReference(image) ||
      !DIGEST_IMAGE_PATTERN.test(image)
    ) {
      fail(`${label} must be an immutable digest reference`);
    }
  }
  return deepFreeze({ ...value });
}

export function runtimeReleaseEnvironment(profileName, releaseValue) {
  const selected = profile(profileName);
  const release = assertRuntimeRelease(releaseValue);
  const validationTag = `${release.appRevision}-amd64`;
  return deepFreeze({
    BGMSS_API_IMAGE:
      profileName === PRODUCTION_PROFILE
        ? release.apiImage
        : `localhost/bgmss-ops-validation-api:${validationTag}`,
    BGMSS_APP_REVISION: release.appRevision,
    BGMSS_APP_VERSION: release.appVersion,
    BGMSS_COMMON_COMMIT: release.commonCommit,
    BGMSS_RELEASE_MANIFEST_DIGEST: release.manifestDigest,
    BGMSS_RELEASE_ROOT: `${selected.root}/releases/${release.appVersion}`,
    BGMSS_UPDATER_IMAGE:
      profileName === PRODUCTION_PROFILE
        ? release.updaterImage
        : `localhost/bgmss-ops-validation-updater:${validationTag}`,
  });
}

export function serializeReleaseEnvironment(environment) {
  requireExactKeys(
    environment,
    [
      'BGMSS_API_IMAGE',
      'BGMSS_APP_REVISION',
      'BGMSS_APP_VERSION',
      'BGMSS_COMMON_COMMIT',
      'BGMSS_RELEASE_MANIFEST_DIGEST',
      'BGMSS_RELEASE_ROOT',
      'BGMSS_UPDATER_IMAGE',
    ],
    'runtime release environment',
  );
  for (const [name, value] of Object.entries(environment)) {
    if (
      typeof value !== 'string' ||
      value.length === 0 ||
      value.length > 4096 ||
      /[\0\r\n\t "'`$\\]/u.test(value)
    ) {
      fail(`${name} is not safe closed environment text`);
    }
  }
  return `${Object.entries(environment)
    .sort(([left], [right]) => left.localeCompare(right, 'en'))
    .map(([name, value]) => `${name}=${value}`)
    .join('\n')}\n`;
}

function logging(project, service) {
  return {
    driver: 'journald',
    options: {
      tag: `${project}-${service}`,
    },
  };
}

function security({ user, memory, cpus, pids }) {
  return {
    cap_drop: ['ALL'],
    cpus,
    init: true,
    mem_limit: memory,
    pids_limit: pids,
    read_only: true,
    security_opt: ['no-new-privileges:true'],
    user,
  };
}

function bind(source, target, readOnly) {
  return {
    bind: {
      create_host_path: false,
    },
    read_only: readOnly,
    source,
    target,
    type: 'bind',
  };
}

function buildComposeModel(profileName) {
  const selected = profile(profileName);
  const validation = profileName === VALIDATION_PROFILE;
  const pullPolicy = validation ? 'never' : 'always';
  const model = {
    name: selected.project,
    networks: {
      outbound: {
        internal: false,
        name: `${selected.project}_outbound`,
      },
      runtime: {
        internal: true,
        name: `${selected.project}_runtime`,
      },
    },
    services: {
      api: {
        ...security({
          cpus: 1.5,
          memory: '1536m',
          pids: 256,
          user: '65532:65532',
        }),
        command: [
          '-listen-address',
          '0.0.0.0:8080',
          '-archive-root',
          '/var/lib/bgmss/archive',
          '-update-status',
          '/var/lib/bgmss/archive/update-status.json',
        ],
        environment: {
          GOMEMLIMIT: '1024MiB',
        },
        image: requiredVariable('BGMSS_API_IMAGE'),
        labels: {
          'fun.bgmss.app-revision': requiredVariable('BGMSS_APP_REVISION'),
          'fun.bgmss.app-version': requiredVariable('BGMSS_APP_VERSION'),
          'fun.bgmss.role': 'api',
        },
        logging: logging(selected.project, 'api'),
        networks: ['outbound', 'runtime'],
        ports: [
          {
            host_ip: selected.apiBind.hostIp,
            mode: 'host',
            protocol: 'tcp',
            published: String(selected.apiBind.published),
            target: selected.apiBind.target,
          },
        ],
        pull_policy: pullPolicy,
        restart: 'unless-stopped',
        stop_grace_period: '30s',
        tmpfs: ['/tmp:rw,noexec,nosuid,nodev,size=16m'],
        volumes: [
          bind(
            `${selected.root}/data`,
            '/var/lib/bgmss/archive',
            true,
          ),
        ],
      },
      prometheus: {
        ...security({
          cpus: 0.5,
          memory: '512m',
          pids: 128,
          user: `${PROMETHEUS.runtimeUser}:${PROMETHEUS.runtimeGroup}`,
        }),
        command: [
          '--config.file=/etc/prometheus/prometheus.yml',
          '--storage.tsdb.path=/prometheus',
          '--storage.tsdb.retention.time=7d',
          '--storage.tsdb.retention.size=512MB',
          '--web.listen-address=0.0.0.0:9090',
          '--web.enable-lifecycle=false',
          '--log.format=json',
        ],
        depends_on: {
          api: {
            condition: 'service_started',
            required: true,
          },
        },
        image: validation ? PROMETHEUS.validationAlias : PROMETHEUS.image,
        labels: {
          'fun.bgmss.role': 'prometheus',
        },
        logging: logging(selected.project, 'prometheus'),
        networks: ['runtime'],
        pull_policy: pullPolicy,
        restart: 'unless-stopped',
        stop_grace_period: '30s',
        volumes: [
          bind(
            `${selected.root}/observability/prometheus/prometheus.yml`,
            '/etc/prometheus/prometheus.yml',
            true,
          ),
          bind(
            `${selected.root}/observability/prometheus/rules.yml`,
            '/etc/prometheus/rules.yml',
            true,
          ),
          bind(
            `${selected.root}/observability/prometheus/tsdb`,
            '/prometheus',
            false,
          ),
        ],
      },
      updater: {
        ...security({
          cpus: 1,
          memory: '640m',
          pids: 256,
          user: '65532:65532',
        }),
        command: [
          'produce',
          '--output-root',
          '/var/lib/bgmss/archive',
          '--contracts-root',
          '/opt/bgmss/producer/contracts',
          '--catalog-config',
          '/opt/bgmss/producer/catalog/display-v1.yaml',
          '--common-commit',
          requiredVariable('BGMSS_COMMON_COMMIT'),
          '--archive-smoke',
          '/opt/bgmss/release/archive-smoke',
          '--status-file',
          '/var/lib/bgmss/archive/update-status.json',
        ],
        image: requiredVariable('BGMSS_UPDATER_IMAGE'),
        labels: {
          'fun.bgmss.app-version': requiredVariable('BGMSS_APP_VERSION'),
          'fun.bgmss.role': 'updater',
        },
        logging: logging(selected.project, 'updater'),
        networks: ['outbound'],
        profiles: ['oneshot'],
        pull_policy: pullPolicy,
        restart: 'no',
        stop_grace_period: '30s',
        tmpfs: [
          '/tmp:rw,noexec,nosuid,nodev,size=64m',
          '/work:rw,noexec,nosuid,nodev,size=64m',
        ],
        volumes: [
          bind(
            `${selected.root}/data`,
            '/var/lib/bgmss/archive',
            false,
          ),
          bind(
            `${selected.root}/compose/updater-current-deny`,
            '/var/lib/bgmss/archive/current.json',
            true,
          ),
          bind(
            `${requiredVariable('BGMSS_RELEASE_ROOT')}/bin/archive-smoke`,
            '/opt/bgmss/release/archive-smoke',
            true,
          ),
        ],
      },
    },
  };
  return model;
}

export function composeModel(profileName) {
  return deepFreeze(buildComposeModel(profileName));
}

function allStrings(value, output = []) {
  if (typeof value === 'string') output.push(value);
  else if (Array.isArray(value)) value.forEach((entry) => allStrings(entry, output));
  else if (value && typeof value === 'object') {
    Object.values(value).forEach((entry) => allStrings(entry, output));
  }
  return output;
}

export function validateComposeModel(model, profileName) {
  const selected = profile(profileName);
  requireExactKeys(model, ['name', 'networks', 'services'], 'Compose model');
  if (model.name !== selected.project) fail('Compose project drifted');
  if (
    Object.keys(model.services).sort().join(',') !==
    'api,prometheus,updater'
  ) {
    fail('Compose services drifted from the closed topology');
  }
  if (Object.hasOwn(model, 'volumes')) fail('named volumes are forbidden');
  if (
    Object.keys(model.networks).sort().join(',') !== 'outbound,runtime' ||
    model.networks.runtime.internal !== true ||
    model.networks.runtime.name !== `${selected.project}_runtime` ||
    model.networks.outbound.internal !== false ||
    model.networks.outbound.name !== `${selected.project}_outbound`
  ) {
    fail('Compose networks are not the exact runtime/outbound pair');
  }
  const { api, prometheus, updater } = model.services;
  if (
    api.ports.length !== 1 ||
    api.ports[0].host_ip !== '127.0.0.1' ||
    api.ports[0].published !== String(selected.apiBind.published) ||
    api.ports[0].target !== 8080 ||
    Object.hasOwn(prometheus, 'ports') ||
    Object.hasOwn(updater, 'ports')
  ) {
    fail('runtime port publication is not closed');
  }
  if (
    api.depends_on !== undefined ||
    updater.depends_on !== undefined ||
    prometheus.depends_on?.api?.condition !== 'service_started'
  ) {
    fail('Prometheus must depend on API without an API monitoring dependency');
  }
  for (const [name, service] of Object.entries(model.services)) {
    if (
      service.read_only !== true ||
      service.cap_drop?.join(',') !== 'ALL' ||
      service.security_opt?.join(',') !== 'no-new-privileges:true' ||
      service.logging?.driver !== 'journald' ||
      service.logging?.options?.tag !== `${selected.project}-${name}`
    ) {
      fail(`${name} security policy drifted`);
    }
  }
  if (
    api.user !== '65532:65532' ||
    updater.user !== '65532:65532' ||
    prometheus.user !== '65532:65532' ||
    [...(api.networks ?? [])].sort().join(',') !== 'outbound,runtime' ||
    updater.networks?.join(',') !== 'outbound' ||
    prometheus.networks?.join(',') !== 'runtime'
  ) {
    fail('runtime user or service-network ownership drifted');
  }
  if (
    api.mem_limit !== '1536m' ||
    api.environment.GOMEMLIMIT !== '1024MiB' ||
    updater.mem_limit !== '640m' ||
    prometheus.mem_limit !== '512m'
  ) {
    fail('runtime memory policy drifted');
  }
  if (
    updater.restart !== 'no' ||
    updater.profiles?.join(',') !== 'oneshot' ||
    api.restart !== 'unless-stopped' ||
    prometheus.restart !== 'unless-stopped'
  ) {
    fail('runtime lifecycle policy drifted');
  }
  const strings = allStrings(model);
  for (const value of strings.filter((entry) => entry.includes('${'))) {
    if (!INTERPOLATION_PATTERN.test(value)) {
      fail(`unbounded Compose interpolation: ${value}`);
    }
  }
  for (const forbidden of [
    '/var/run/docker.sock',
    '/run/docker.sock',
    '/srv/bgmss/',
    ':latest',
    'node_modules',
    '/.git',
    '/statistics',
  ]) {
    if (strings.some((value) => value.includes(forbidden))) {
      fail(`forbidden Compose capability: ${forbidden}`);
    }
  }
  const sources = Object.values(model.services)
    .flatMap((service) => service.volumes ?? [])
    .map((volume) => volume.source);
  if (
    sources.some(
      (source) =>
        !source.startsWith(`${selected.root}/`) &&
        !source.startsWith(requiredVariable('BGMSS_RELEASE_ROOT')),
    )
  ) {
    fail('Compose bind mount escapes the admitted root');
  }
  if (
    profileName === PRODUCTION_PROFILE &&
    prometheus.image !== PROMETHEUS.image
  ) {
    fail('production Prometheus image drifted');
  }
  if (
    profileName === VALIDATION_PROFILE &&
    (prometheus.image !== PROMETHEUS.validationAlias ||
      prometheus.pull_policy !== 'never')
  ) {
    fail('validation Prometheus alias or pull policy drifted');
  }
  if (canonicalJson(model) !== canonicalJson(buildComposeModel(profileName))) {
    fail('Compose model differs from the exact closed profile');
  }
  return deepFreeze(model);
}
