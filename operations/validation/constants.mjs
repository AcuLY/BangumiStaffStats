import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const VALIDATION_ROOT = path.dirname(fileURLToPath(import.meta.url));
export const OPERATIONS_ROOT = path.dirname(VALIDATION_ROOT);
export const REPOSITORY_ROOT = path.dirname(OPERATIONS_ROOT);

export const HOST_ALIAS = 'myserver';
export const REMOTE_ROOT = '/srv/bgmss-ops-validation';
export const PRODUCTION_ROOT = '/srv/bgmss-v2';
export const LEGACY_ROOT = '/srv/bgmss';
export const PROJECT = 'bgmss_ops_validation';
export const API_BIND = '127.0.0.1:19090:8080';
export const API_PORT = 19090;
export const SERVICES = Object.freeze(['api', 'prometheus', 'updater']);
export const NETWORKS = Object.freeze([
  `${PROJECT}_outbound`,
  `${PROJECT}_runtime`,
]);

export const EXPECTED_HOST = Object.freeze({
  architecture: 'x86_64',
  osId: 'centos',
  osVersionId: '9',
});

export const PROMETHEUS = Object.freeze({
  amd64ManifestDigest:
    'sha256:335b5796a6e4355530475575253f84de20b8ad07bf899f65ed218451ce4c60b4',
  amd64ManifestSize: 4067,
  indexDigest:
    'sha256:214f8427c8fba80c327bb94a75feb802ae12f2d6ca30812aa6e7d22f09bbea80',
  reference:
    'prom/prometheus:v3.13.1-distroless@sha256:214f8427c8fba80c327bb94a75feb802ae12f2d6ca30812aa6e7d22f09bbea80',
  runtimeDefaults: Object.freeze({
    command: Object.freeze([
      '--config.file=/etc/prometheus/prometheus.yml',
      '--storage.tsdb.path=/prometheus',
    ]),
    entrypoint: Object.freeze(['/bin/prometheus']),
    environment: Object.freeze({
      PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      SSL_CERT_FILE: '/etc/ssl/certs/ca-certificates.crt',
    }),
    labels: Object.freeze({
      'io.prometheus.image.variant': 'distroless',
      'org.opencontainers.image.authors': 'The Prometheus Authors',
      'org.opencontainers.image.description':
        'The Prometheus monitoring system and time series database',
      'org.opencontainers.image.documentation':
        'https://prometheus.io/docs',
      'org.opencontainers.image.licenses': 'Apache License 2.0',
      'org.opencontainers.image.source':
        'https://github.com/prometheus/prometheus',
      'org.opencontainers.image.title': 'Prometheus',
      'org.opencontainers.image.url':
        'https://github.com/prometheus/prometheus',
      'org.opencontainers.image.vendor': 'Prometheus',
    }),
    user: '65532',
  }),
  runtimeGid: 65532,
  runtimeUid: 65532,
  validationAlias:
    'localhost/bgmss-ops-validation-prometheus:v3.13.1-distroless-amd64',
});

export const MAXIMUMS = Object.freeze({
  commandOutputBytes: 4 * 1024 * 1024,
  evidenceBytes: 4 * 1024 * 1024,
  fileCount: 8192,
  handoffArchiveBytes: 512 * 1024 * 1024,
  inputBytes: 4 * 1024 * 1024,
  remoteRunMs: 7 * 60 * 60 * 1000,
  remoteStopMs: 30 * 1000,
  sshPreflightMs: 10 * 60 * 1000,
  transferFileBytes: 8 * 1024 * 1024 * 1024,
  transferTotalBytes: 16 * 1024 * 1024 * 1024,
});

export const CLAIM =
  'isolated-operations-validated-production-not-activated';
export const INPUT_SCHEMA_VERSION = 'operations-validation-input-v1';
export const PREFLIGHT_SCHEMA_VERSION = 'operations-validation-preflight-v1';
export const RESOURCE_SCHEMA_VERSION = 'operations-validation-resources-v1';
export const RESULT_SCHEMA_VERSION = 'operations-validation-result-v1';

export const EXACT_HANDOFF_FILES = Object.freeze([
  'candidate-complete-inventory.json',
  'validation-candidate.tar',
  'validation-candidate.tar.sha256',
]);

export const TRANSFER_ROLES = Object.freeze([
  'accepted-receipt',
  'api-image',
  'archive-smoke',
  'candidate-checksums',
  'candidate-document',
  'candidate-inventory',
  'compatibility',
  'compose',
  'frontend',
  'minimal-manifest',
  'minimal-sqlite',
  'preflight-evidence',
  'prometheus-config',
  'prometheus-rules',
  'remote-entry',
  'release-environment',
  'run-overlay',
  'updater-image',
]);

export function validationAliases(productRevision) {
  if (!/^[0-9a-f]{40}$/u.test(productRevision)) {
    throw new TypeError('validation alias requires an exact product revision');
  }
  return Object.freeze({
    api: `localhost/bgmss-ops-validation-api:${productRevision}-amd64`,
    prometheus: PROMETHEUS.validationAlias,
    updater:
      `localhost/bgmss-ops-validation-updater:${productRevision}-amd64`,
  });
}
