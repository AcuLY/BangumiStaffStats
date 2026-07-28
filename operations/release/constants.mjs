import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RELEASE_ROOT = path.dirname(fileURLToPath(import.meta.url));
export const OPERATIONS_ROOT = path.dirname(RELEASE_ROOT);
export const REPOSITORY_ROOT = path.dirname(OPERATIONS_ROOT);

export const APPLICATION_VERSION = 'v0.1.0';
export const TARGET = Object.freeze({ architecture: 'amd64', os: 'linux' });

export const FROZEN_PRODUCT = Object.freeze({
  revision: '3f585cfe0a0dd61fe783a839528fef25470a58db',
  tree: '93e29a0c51c0305db8a43e7d029b8eaa3014a1b8',
});
export const ACCEPTANCE_IMPLEMENTATION =
  'b56ce858733b18875df3101a423c6d1b356eed54';
export const ACCEPTANCE_ARCHIVE =
  '00d15f18e51141645cb6fa04b837139ad9a0c6f3';
export const ACCEPTANCE_ACTIONS_HEAD =
  '111bc57b15d16a4aadf155ee503bc12c8065caef';
export const ACCEPTANCE_ACTIONS_TREE =
  '4489591ae54ea3b71e4ba86e41d935065276113e';
export const ACCEPTANCE_LIFECYCLE_STATUS =
  'development-acceptance-closed-by-authorized-ci-and-remote-evidence';

export const ACCEPTED_DEVELOPMENT_PATH = path.join(
  RELEASE_ROOT,
  'accepted-development.json',
);
// Updated only when the main agent explicitly approves new canonical receipt
// bytes. Receipt verification refuses a syntactically valid replacement.
export const ACCEPTED_DEVELOPMENT_SHA256 =
  'sha256:17145d4869050dc2ff347e4dbfb60a5a6369d32890f0abc3e8f766b8ea28a80a';

export const PROMETHEUS = Object.freeze({
  reference:
    'prom/prometheus:v3.13.1-distroless@sha256:214f8427c8fba80c327bb94a75feb802ae12f2d6ca30812aa6e7d22f09bbea80',
  indexDigest:
    'sha256:214f8427c8fba80c327bb94a75feb802ae12f2d6ca30812aa6e7d22f09bbea80',
  amd64ManifestDigest:
    'sha256:335b5796a6e4355530475575253f84de20b8ad07bf899f65ed218451ce4c60b4',
  amd64ManifestSize: 4067,
  runtimeGid: 65532,
  runtimeUid: 65532,
});

export const COMMON_COMMIT = '6a8442c17143a870357a5ff812362e8b5cfe9f9d';
export const OPENAPI_DIGEST =
  'sha256:e7aba7c34b0d6f74e533e8e9fd31c8f0aa40ed15c440669ec87a7204c963cf11';
export const ARCHIVE_MANIFEST_SCHEMA_DIGEST =
  'sha256:5a2b0cd7294312e9dcbdd413a1b01c4218652c4c39fd7472b74e40622e7a3e73';
export const ARCHIVE_SCHEMA_SQL_DIGEST =
  'sha256:3cce7ce75fb4a7d2943ee8b9fb7c5df2639fae8fa0a2e07bddb3e1519ffdc8e0';
export const ARCHIVE_COMPATIBILITY_MATRIX_DIGEST =
  'sha256:659121caac966df42a6201dcfb539ac1cd0f7f6a4e452495707833f7c8b889ac';
export const ACCEPTANCE_MATRIX_DIGEST =
  'sha256:531d5a5337cfd09e8f60df44614f783ed6c92e71f115d958b1bfc2477cbcb2c5';

export const BUILD_TOOLCHAIN = Object.freeze({
  buildkitImage:
    'docker.io/moby/buildkit:v0.27.1@sha256:1e110c71d389d6d24f67b9438e2f7b8da749a6ff407b22a1631e025c95599368',
  buildkitVersion: '0.27.1',
  buildxVersion: '0.34.1',
  goVersion: 'go1.26.5',
  nodeVersion: '24.18.0',
  npmVersion: '11.16.0',
  pythonVersion: '3.14.6',
  uvVersion: '0.11.32',
});

export const IMAGE_MEDIA_TYPES = Object.freeze({
  config: 'application/vnd.oci.image.config.v1+json',
  layer: 'application/vnd.oci.image.layer.v1.tar+gzip',
  manifest: 'application/vnd.oci.image.manifest.v1+json',
});

export const COMPONENTS = Object.freeze(['backend', 'frontend', 'updater']);
export const REGISTRY_COMPONENTS = Object.freeze(['backend', 'updater']);

export const RELEASE_ASSET_NAMES = Object.freeze([
  'archive-smoke',
  'backend-component-statement.json',
  'backend.spdx.json',
  'compatibility-manifest.json',
  'frontend-component-statement.json',
  'frontend-static-linux-amd64.tar',
  'frontend.spdx.json',
  'updater-component-statement.json',
  'updater.spdx.json',
]);

export function registryRepositories(repository) {
  if (repository !== 'AcuLY/BangumiStaffStats') {
    throw new Error('release repository must be exactly AcuLY/BangumiStaffStats');
  }
  return Object.freeze({
    backend: 'ghcr.io/aculy/bangumi-staff-stats-api',
    updater: 'ghcr.io/aculy/bangumi-staff-stats-updater',
  });
}
