import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RELEASE_ROOT = path.dirname(fileURLToPath(import.meta.url));
export const OPERATIONS_ROOT = path.dirname(RELEASE_ROOT);
export const REPOSITORY_ROOT = path.dirname(OPERATIONS_ROOT);

export const APPLICATION_VERSION = 'v0.1.0';
export const TARGET = Object.freeze({ architecture: 'amd64', os: 'linux' });
export const SOURCE_EPOCH_RANGE = Object.freeze({
  maximum: 8_589_934_591,
  minimum: 315_532_800,
});

// These three fail-closed tokens are replaced together only after the
// main-agent-audited acceptance refresh has been archived. They intentionally
// fail Git OID/SHA-256 validation and therefore cannot become release
// authority in an intermediate checkout.
export const FROZEN_PRODUCT = Object.freeze({
  revision: '__BGMSS_FINAL_PRODUCT_REVISION__',
  tree: '__BGMSS_FINAL_PRODUCT_TREE__',
});
export const ACCEPTANCE_LIFECYCLE_STATUS =
  'development-acceptance-closed-by-authorized-ci-and-remote-evidence';

export const ACCEPTED_DEVELOPMENT_PATH = path.join(
  RELEASE_ROOT,
  'accepted-development.json',
);
export const ACCEPTED_DEVELOPMENT_SHA256 =
  '__BGMSS_ACCEPTED_DEVELOPMENT_SHA256__';

export const ACCEPTED_BUILD_DEFINITION_PATHS = Object.freeze([
  'backend/build/build.sh',
  'backend/build/check.sh',
  'backend/build/smoke.sh',
  'contracts/artifacts/bin/artifacts.mjs',
  'contracts/artifacts/bin/coordinator.mjs',
  'contracts/artifacts/lib/validation.mjs',
  'frontend/build/artifact.mjs',
  'frontend/build/check.mjs',
  'frontend/build/smoke.mjs',
  'updater/build/artifact.py',
  'updater/build/check.py',
  'updater/build/runtime_prune.py',
  'updater/build/smoke.py',
]);

export const ACCEPTED_CONTRACT_AUTHORITY_PATHS = Object.freeze([
  'contracts/artifacts/schemas/checksum-inventory-v1.schema.json',
  'contracts/artifacts/schemas/compatibility-manifest-v1.schema.json',
  'contracts/artifacts/schemas/component-statement-v1.schema.json',
  'contracts/artifacts/producer-runtime-inputs-v1.json',
  'contracts/openapi/openapi.yaml',
  'contracts/schemas/archive/archive-manifest.schema.json',
  'contracts/schemas/archive/compatibility-matrix.json',
  'contracts/schemas/archive/schema.sql',
]);

export const ACCEPTED_TOOLCHAIN_NAMES = Object.freeze([
  'buildkit',
  'docker-buildx',
  'go',
  'node',
  'npm',
  'python',
  'uv',
]);

export const ACCEPTANCE_SELECTED_TARGET_TEST_NAMES = Object.freeze([
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

function escapeRegularExpression(value) {
  return value.replace(/[\\^$.*+?()[\]{}|]/gu, '\\$&');
}

export const ACCEPTANCE_SELECTED_TARGET_PATTERN =
  `^(?:${ACCEPTANCE_SELECTED_TARGET_TEST_NAMES
    .map(escapeRegularExpression)
    .join('|')})$(?![\\s\\S])`;

export const ACCEPTANCE_SELECTED_TARGET_ARGV = Object.freeze([
  'node',
  '--test',
  '--test-name-pattern',
  ACCEPTANCE_SELECTED_TARGET_PATTERN,
  'contracts/acceptance/test/core.test.mjs',
]);

export const ACCEPTANCE_RUNTIME_IMAGES = Object.freeze({
  node: Object.freeze({
    amd64ManifestDigest:
      'sha256:d45d78e7929b46875bbd4e29bea672d5bc48186c6c3588306521c815e78352d6',
    amd64ManifestSize: 1929,
    architecture: 'amd64',
    configDiffIds: Object.freeze([
      'sha256:81f823b9617547261c907396f63f770deaa554748ff739bedfa650e3bb74595a',
      'sha256:e8e8bcb08674cd0ecf9850d66bc246bb95fa086eb6c988ab48d0404501029ddc',
      'sha256:ec5d0255c8bf10ce4313e611ec0a35f9de699c6284e69e4c4fdcc5ea6e82adbf',
      'sha256:625ca884ca91515900d06a970e88957ac4d2e8963c4a0cc699e069ef7e3c7371',
      'sha256:7ad824b880674ec5cd6d6ef28d7d4783bcd5194ccf30ae225d5eeed0093ff31a',
    ]),
    configDigest:
      'sha256:2f35c3d18013b7d65e31c40f0602e4c0a65a18efc65c16e2b98497f13f4da921',
    configImageId:
      'sha256:2f35c3d18013b7d65e31c40f0602e4c0a65a18efc65c16e2b98497f13f4da921',
    configSize: 6827,
    layers: Object.freeze([
      Object.freeze({
        digest:
          'sha256:597c6c618d36213af657a6a8444a5d87801f9a219682b206ad21ccb8f3e57bbd',
        size: 28232643,
      }),
      Object.freeze({
        digest:
          'sha256:af54a8f1f08bff19af42c05615745e74742a74437bb1c5e1e99bf0dcb8048257',
        size: 3311,
      }),
      Object.freeze({
        digest:
          'sha256:35e38e1826d7cdf22ea45a4223741e4cc126db5a2a07cf2072b229270180f920',
        size: 50334796,
      }),
      Object.freeze({
        digest:
          'sha256:15f27b93c93d3aaa4df09438a96bad3709b6cbbc38659014d17cc61d8d4fabb9',
        size: 1712639,
      }),
      Object.freeze({
        digest:
          'sha256:3f4664f9b20d6f144b2674c2c40de02509aabd87eae0a2d31a62de37444d13e8',
        size: 448,
      }),
    ]),
    npmVersion: '11.16.0',
    nodeVersion: '24.18.0',
    os: 'linux',
    rootDigest:
      'sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d',
    rootSize: 3929,
    transportReference:
      'mirror.ccs.tencentyun.com/library/node@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d',
  }),
  python: Object.freeze({
    amd64ManifestDigest:
      'sha256:f70215e5dbe2a47dee6d23f9c6d358bf3c148f59cce2fd165b61118e9d80f2bb',
    amd64ManifestSize: 1751,
    architecture: 'amd64',
    configDiffIds: Object.freeze([
      'sha256:81f823b9617547261c907396f63f770deaa554748ff739bedfa650e3bb74595a',
      'sha256:88ded20513bbb0399023378e80dbaf890a2ef38e88f9025b4997c735286a1044',
      'sha256:7bb16f3d38f0926965028ca5205d7493ba4a31a6cd5d147b804af96e6214817b',
      'sha256:821a723c8d9c144a7dc22080d3f33417252ccec2a2a0a7902574ec80643acd68',
    ]),
    configDigest:
      'sha256:c42d4d39d945cdfc11f65c2bdbcbc174b9d01563225ca182aff28c25248378c4',
    configImageId:
      'sha256:c42d4d39d945cdfc11f65c2bdbcbc174b9d01563225ca182aff28c25248378c4',
    configSize: 4954,
    layers: Object.freeze([
      Object.freeze({
        digest:
          'sha256:597c6c618d36213af657a6a8444a5d87801f9a219682b206ad21ccb8f3e57bbd',
        size: 28232643,
      }),
      Object.freeze({
        digest:
          'sha256:b3c0372e9a70cbddcdce9556e198340bc9a962df8817055a65da673095863355',
        size: 3520805,
      }),
      Object.freeze({
        digest:
          'sha256:6766af63796a43dfc1a7e5d2b453f06260d39ed534df6e986abf0661528470fd',
        size: 13011443,
      }),
      Object.freeze({
        digest:
          'sha256:81ec15f604cb77969e09c5429c44bbe14aa4df208f060591375d325f39529ece',
        size: 248,
      }),
    ]),
    os: 'linux',
    pythonVersion: '3.14.6',
    rootDigest:
      'sha256:86f975aca15cf04a40b399eebede9aea7c82eae084d1f1a0a6ef6bcaae871a30',
    rootSize: 9124,
    transportReference:
      'mirror.ccs.tencentyun.com/library/python@sha256:86f975aca15cf04a40b399eebede9aea7c82eae084d1f1a0a6ef6bcaae871a30',
  }),
});

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
