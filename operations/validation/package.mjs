import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { stringify } from 'yaml';

import { canonicalJson, canonicalJsonDigest, deepFreeze } from '../lib/canonical-json.mjs';
import { sha256File } from '../lib/digest.mjs';
import { writeCanonicalJsonFile } from '../lib/immutable-output.mjs';
import {
  requireCanonicalPath,
  resolveContainedPath,
} from '../lib/path-policy.mjs';
import { parseJsonStrict } from '../lib/strict-json.mjs';
import { renderCompose, renderReleaseEnvironment } from '../compose/render.mjs';
import { copyImmutableFile } from '../release/files.mjs';
import {
  COMMON_COMMIT,
  REPOSITORY_ROOT as RELEASE_REPOSITORY_ROOT,
} from '../release/constants.mjs';
import { inspectOciArchive } from '../release/oci.mjs';
import {
  API_BIND,
  HOST_ALIAS,
  INPUT_SCHEMA_VERSION,
  LEGACY_ROOT,
  MAXIMUMS,
  NETWORKS,
  OPERATIONS_ROOT,
  PRODUCTION_ROOT,
  PROJECT,
  PROMETHEUS,
  REMOTE_ROOT,
  REPOSITORY_ROOT,
  SERVICES,
  TRANSFER_ROLES,
  validationAliases,
} from './constants.mjs';
import {
  assertProductionValidationRenderParity,
  runOverlay,
} from './render-policy.mjs';
import { expectedValidationAuthority } from './authority.mjs';
import { validateValidationInput } from './schema.mjs';

export class ValidationPackageError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'ValidationPackageError';
  }
}

function fail(message, cause) {
  throw new ValidationPackageError(message, cause ? { cause } : undefined);
}

function git(...args) {
  const result = spawnSync('/usr/bin/git', args, {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    env: {
      HOME: process.env.HOME,
      LANG: 'C.UTF-8',
      LC_ALL: 'C.UTF-8',
      PATH: '/usr/bin:/bin',
      TZ: 'UTC',
    },
    maxBuffer: 4 * 1024 * 1024,
    shell: false,
    timeout: 60_000,
  });
  if (result.error || result.status !== 0 || result.signal !== null) {
    fail('repository identity command failed', result.error);
  }
  return result.stdout.trim();
}

export function currentOperationsIdentity() {
  if (REPOSITORY_ROOT !== RELEASE_REPOSITORY_ROOT) {
    fail('release and validation repository roots disagree');
  }
  const revision = git('rev-parse', '--verify', 'HEAD');
  const tree = git('rev-parse', '--verify', 'HEAD^{tree}');
  const branch = git('branch', '--show-current');
  const status = git(
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
    '--ignored=no',
  );
  if (
    branch !== 'codex/formal-rewrite' ||
    !/^[0-9a-f]{40}$/u.test(revision) ||
    !/^[0-9a-f]{40}$/u.test(tree) ||
    status !== ''
  ) {
    fail('validation requires the clean committed operations branch identity');
  }
  return deepFreeze({ revision, tree });
}

function preparePackageRoot(packageDirectory) {
  const root = path.resolve(packageDirectory);
  fs.mkdirSync(root, { mode: 0o700 });
  const canonical = requireCanonicalPath(root, {
    label: 'validation package root',
    type: 'directory',
  });
  if (fs.readdirSync(canonical).length !== 0) {
    fail('validation package root must be new and empty');
  }
  fs.mkdirSync(path.join(canonical, 'files'), { mode: 0o700 });
  return canonical;
}

function writeControlSource(root, name, bytes, mode = 0o400) {
  const control = path.join(root, 'control');
  if (!fs.existsSync(control)) fs.mkdirSync(control, { mode: 0o700 });
  const target = path.join(control, name);
  fs.writeFileSync(target, bytes, {
    flag: 'wx',
    mode: 0o600,
  });
  fs.chmodSync(target, mode);
  return requireCanonicalPath(target, {
    below: root,
    label: `validation control source ${name}`,
    requireSingleLink: true,
    type: 'file',
  });
}

function archiveIdentity(root) {
  const archiveRoot = requireCanonicalPath(root, {
    label: 'minimal Archive root',
    type: 'directory',
  });
  const manifestPath = resolveContainedPath(
    archiveRoot,
    'archive-manifest.json',
    {
      allowMissing: false,
      label: 'minimal Archive manifest',
    },
  );
  const sqlitePath = resolveContainedPath(archiveRoot, 'bangumi.sqlite', {
    allowMissing: false,
    label: 'minimal Archive SQLite',
  });
  const files = fs
    .readdirSync(archiveRoot, { withFileTypes: true })
    .map((entry) => entry.name)
    .sort();
  if (
    files.join('\0') !==
    ['archive-manifest.json', 'bangumi.sqlite', 'current-pointer.json'].join(
      '\0',
    )
  ) {
    fail('minimal Archive fixture does not have its exact closed file set');
  }
  const manifest = parseJsonStrict(
    fs.readFileSync(manifestPath, 'utf8'),
    'minimal Archive manifest',
  );
  const sqliteDigest = sha256File(sqlitePath);
  const sqliteSize = fs.statSync(sqlitePath).size;
  if (
    manifest === null ||
    typeof manifest !== 'object' ||
    Array.isArray(manifest) ||
    !/^dv1-[0-9a-f]{64}$/u.test(manifest.dataVersion) ||
    manifest.sqliteFile !== 'bangumi.sqlite' ||
    manifest.sqliteDigest !== sqliteDigest ||
    manifest.sqliteSize !== sqliteSize ||
    manifest.commonCommit !== COMMON_COMMIT
  ) {
    fail('minimal Archive bytes disagree with their accepted manifest');
  }
  return deepFreeze({
    dataVersion: manifest.dataVersion,
    manifestDigest: sha256File(manifestPath),
    manifestPath,
    sqliteDigest,
    sqlitePath,
    sqliteSize,
  });
}

export function controllerFilesDigest() {
  const paths = [
    '../VERSION',
    '../contracts/artifacts/lib/canonical-json.mjs',
    '../contracts/artifacts/lib/strict-json.mjs',
    '../contracts/artifacts/lib/validation.mjs',
    '../contracts/schemas/archive/compatibility-matrix.json',
    'compose/model.mjs',
    'compose/render.mjs',
    'config/runtime-profiles.json',
    'lib/canonical-json.mjs',
    'lib/digest.mjs',
    'lib/evidence-policy.mjs',
    'lib/immutable-output.mjs',
    'lib/path-policy.mjs',
    'lib/schema.mjs',
    'lib/strict-json.mjs',
    'prometheus/prometheus.yml',
    'prometheus/rules.yml',
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
    'validation/actions-handoff.mjs',
    'validation/authority.mjs',
    'validation/constants.mjs',
    'validation/package.mjs',
    'validation/policy.mjs',
    'validation/render-policy.mjs',
    'validation/remote/bootstrap.sh',
    'validation/remote/entry.sh',
    'validation/remote/launch.sh',
    'validation/remote/ownership-ledger.sh',
    'validation/remote/preflight.sh',
    'validation/remote/recover.sh',
    'validation/remote/transfer-agent.sh',
    'validation/schema.mjs',
    'validation/schemas/validation-input-v1.schema.json',
    'validation/schemas/validation-preflight-v1.schema.json',
    'validation/schemas/validation-resources-v1.schema.json',
    'validation/schemas/validation-result-v1.schema.json',
    'validation/sealed-handoff.mjs',
    'validation/sealed-package.mjs',
    'validation/ssh.mjs',
    'validation/validate-myserver.mjs',
  ];
  return canonicalJsonDigest(
    paths.map((relative) => {
      const absolute = path.join(OPERATIONS_ROOT, ...relative.split('/'));
      const information = fs.lstatSync(absolute);
      if (
        !information.isFile() ||
        information.isSymbolicLink() ||
        information.nlink !== 1
      ) {
        fail(`controller input identity is unsafe: ${relative}`);
      }
      return {
        mode: (information.mode & 0o111) === 0 ? '0444' : '0555',
        path: relative,
        sha256: sha256File(absolute),
        size: information.size,
      };
    }),
  );
}

function roleMap(files) {
  const result = Object.create(null);
  for (const file of files) {
    if (Object.hasOwn(result, file.role)) {
      fail(`validation transfer role is duplicated: ${file.role}`);
    }
    result[file.role] = file.id;
  }
  const expected = [...TRANSFER_ROLES].sort();
  if (Object.keys(result).sort().join('\0') !== expected.join('\0')) {
    fail('validation transfer role set is incomplete');
  }
  return result;
}

function copyTransferFiles(root, sources) {
  const ordered = [...sources].sort((left, right) =>
    left.role.localeCompare(right.role, 'en'),
  );
  return deepFreeze(
    ordered.map((entry, index) => {
      const id = `f${String(index + 1).padStart(4, '0')}`;
      const remoteName = `files/${id}`;
      const descriptor = copyImmutableFile({
        destinationRelative: remoteName,
        destinationRoot: root,
        mode: entry.executable ? 0o500 : 0o400,
        source: entry.source,
      });
      return deepFreeze({
        id,
        mode: entry.executable ? '0500' : '0400',
        remoteName,
        role: entry.role,
        sha256: descriptor.sha256,
        size: descriptor.size,
      });
    }),
  );
}

function removeControlSources(root, sources) {
  const control = path.join(root, 'control');
  for (const source of sources) {
    if (
      path.dirname(source) !== control ||
      !fs.existsSync(source) ||
      fs.lstatSync(source).isSymbolicLink()
    ) {
      fail('validation package control source cleanup is not exact');
    }
    fs.unlinkSync(source);
  }
  fs.rmdirSync(control);
}

export function createValidationPackage({
  handoff,
  operationsIdentity,
  packageDirectory,
  preflight,
  transport,
}) {
  if (
    handoff.candidate.source.operationsController.revision !==
      operationsIdentity.revision ||
    handoff.candidate.source.operationsController.tree !==
      operationsIdentity.tree ||
    transport.actions?.run?.headSha !== operationsIdentity.revision
  ) {
    fail('candidate, Actions, and committed Operations identities differ');
  }
  const packageRoot = preparePackageRoot(packageDirectory);
  const runId = `run-${randomBytes(16).toString('hex')}`;
  const aliases = validationAliases(handoff.candidate.source.product.revision);
  assertProductionValidationRenderParity();

  const composeSource = writeControlSource(
    packageRoot,
    'compose.yaml',
    renderCompose('validation'),
  );
  const releaseValue = {
    apiImage:
      `localhost/bgmss-validation-seal/api@${handoff.candidate.images.api.manifest.digest}`,
    appRevision: handoff.candidate.source.product.revision,
    appVersion: handoff.candidate.applicationVersion,
    archiveSmokeDigest: handoff.candidate.assets.archiveSmoke.sha256,
    commonCommit: COMMON_COMMIT,
    manifestDigest: sha256File(
      path.join(handoff.candidateRoot, handoff.candidateDocument),
    ),
    schemaVersion: 'runtime-release-v1',
    updaterImage:
      `localhost/bgmss-validation-seal/updater@${handoff.candidate.images.updater.manifest.digest}`,
  };
  const releaseEnvironmentSource = writeControlSource(
    packageRoot,
    'release.env',
    renderReleaseEnvironment('validation', releaseValue),
  );
  const overlaySource = writeControlSource(
    packageRoot,
    'run-overlay.yaml',
    stringify(runOverlay(runId), {
      aliasDuplicateObjects: false,
      lineWidth: 0,
      sortMapEntries: true,
    }),
  );
  const preflightSource = writeControlSource(
    packageRoot,
    'preflight.json',
    canonicalJson(preflight),
  );
  const minimal = archiveIdentity(
    path.join(
      REPOSITORY_ROOT,
      'contracts',
      'goldens',
      'archive',
      'valid',
      'minimal',
    ),
  );
  const apiImageSource = path.join(
    handoff.candidateRoot,
    ...handoff.candidate.images.api.archive.path.split('/'),
  );
  const updaterImageSource = path.join(
    handoff.candidateRoot,
    ...handoff.candidate.images.updater.archive.path.split('/'),
  );
  const apiGraph = inspectOciArchive({
    archivePath: apiImageSource,
    declaredLoadReference:
      handoff.candidate.images.api.declaredLoadReference,
    expectedMtime: 0,
    includeRuntimeDefaults: true,
  });
  const updaterGraph = inspectOciArchive({
    archivePath: updaterImageSource,
    declaredLoadReference:
      handoff.candidate.images.updater.declaredLoadReference,
    expectedMtime: handoff.candidate.sourceEpoch,
    includeRuntimeDefaults: true,
  });
  for (const [role, graph] of [
    ['api', apiGraph],
    ['updater', updaterGraph],
  ]) {
    if (
      canonicalJson(graph.config) !==
        canonicalJson(handoff.candidate.images[role].config) ||
      canonicalJson(graph.manifest) !==
        canonicalJson(handoff.candidate.images[role].manifest)
    ) {
      fail(`validation ${role} OCI runtime authority drifted`);
    }
  }

  const sources = [
    {
      role: 'accepted-receipt',
      source: path.join(handoff.candidateRoot, 'accepted-development.json'),
    },
    {
      role: 'api-image',
      source: apiImageSource,
    },
    {
      executable: true,
      role: 'archive-smoke',
      source: path.join(
        handoff.candidateRoot,
        ...handoff.candidate.assets.archiveSmoke.path.split('/'),
      ),
    },
    {
      role: 'candidate-checksums',
      source: path.join(handoff.candidateRoot, 'payload-checksums.sha256'),
    },
    {
      role: 'candidate-document',
      source: path.join(handoff.candidateRoot, handoff.candidateDocument),
    },
    {
      role: 'candidate-inventory',
      source: handoff.externalInventoryPath,
    },
    {
      role: 'compatibility',
      source: path.join(
        handoff.candidateRoot,
        ...handoff.candidate.assets.compatibilityManifest.path.split('/'),
      ),
    },
    { role: 'compose', source: composeSource },
    {
      role: 'frontend',
      source: path.join(
        handoff.candidateRoot,
        ...handoff.candidate.assets.frontend.path.split('/'),
      ),
    },
    { role: 'minimal-manifest', source: minimal.manifestPath },
    { role: 'minimal-sqlite', source: minimal.sqlitePath },
    { role: 'preflight-evidence', source: preflightSource },
    {
      role: 'prometheus-config',
      source: path.join(OPERATIONS_ROOT, 'prometheus', 'prometheus.yml'),
    },
    {
      role: 'prometheus-rules',
      source: path.join(OPERATIONS_ROOT, 'prometheus', 'rules.yml'),
    },
    { role: 'release-environment', source: releaseEnvironmentSource },
    {
      executable: true,
      role: 'remote-entry',
      source: path.join(OPERATIONS_ROOT, 'validation', 'remote', 'entry.sh'),
    },
    { role: 'run-overlay', source: overlaySource },
    {
      role: 'updater-image',
      source: updaterImageSource,
    },
  ];
  const files = copyTransferFiles(packageRoot, sources);
  removeControlSources(packageRoot, [
    composeSource,
    overlaySource,
    preflightSource,
    releaseEnvironmentSource,
  ]);
  const roles = roleMap(files);
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  if (
    !Number.isSafeInteger(totalSize) ||
    totalSize > MAXIMUMS.transferTotalBytes
  ) {
    fail('validation transfer exceeds its closed total bound');
  }

  const input = {
    authority: expectedValidationAuthority({
      appRevision: handoff.candidate.source.product.revision,
      appVersion: handoff.candidate.applicationVersion,
      commonCommit: COMMON_COMMIT,
      composeVersion: preflight.host.composeVersion,
      imageRuntimeDefaults: {
        api: apiGraph.runtimeDefaults,
        updater: updaterGraph.runtimeDefaults,
      },
      minimalArchive: minimal,
      runId,
    }),
    bounds: {
      apiReadySeconds: 60,
      commandOutputBytes: MAXIMUMS.commandOutputBytes,
      producerCpu: '1.0',
      producerIoPriority: 'idle',
      producerMemoryBytes: 640 * 1024 * 1024,
      producerTimeoutSeconds: 6 * 60 * 60,
    },
    candidate: {
      applicationVersion: handoff.candidate.applicationVersion,
      candidateDocumentFileId: roles['candidate-document'],
      candidateDocumentSha256: sha256File(
        path.join(handoff.candidateRoot, handoff.candidateDocument),
      ),
      completeInventoryFileId: roles['candidate-inventory'],
      contentAddress: handoff.completeInventory.contentAddress,
      publicationState: handoff.candidate.publicationState,
      target: 'linux/amd64',
    },
    claim: 'isolated-validation-input-production-not-activated',
    images: {
      api: {
        archiveFileId: roles['api-image'],
        config: handoff.candidate.images.api.config,
        declaredLoadReference:
          handoff.candidate.images.api.declaredLoadReference,
        graphDigest: apiGraph.graphDigest,
        manifest: handoff.candidate.images.api.manifest,
        rootfsDiffIds: apiGraph.rootfsDiffIds,
        runtimeDefaults: apiGraph.runtimeDefaults,
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
        archiveFileId: roles['updater-image'],
        config: handoff.candidate.images.updater.config,
        declaredLoadReference:
          handoff.candidate.images.updater.declaredLoadReference,
        graphDigest: updaterGraph.graphDigest,
        manifest: handoff.candidate.images.updater.manifest,
        rootfsDiffIds: updaterGraph.rootfsDiffIds,
        runtimeDefaults: updaterGraph.runtimeDefaults,
        validationAlias: aliases.updater,
      },
    },
    minimalArchive: {
      dataVersion: minimal.dataVersion,
      manifestDigest: minimal.manifestDigest,
      manifestFileId: roles['minimal-manifest'],
      sqliteDigest: minimal.sqliteDigest,
      sqliteFileId: roles['minimal-sqlite'],
      sqliteSize: minimal.sqliteSize,
    },
    preflight: {
      digest: canonicalJsonDigest(preflight),
      fileId: roles['preflight-evidence'],
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
      compatibilityFileId: roles.compatibility,
      composeFileId: roles.compose,
      controllerFilesDigest: controllerFilesDigest(),
      frontendFileId: roles.frontend,
      prometheusConfigFileId: roles['prometheus-config'],
      prometheusRulesFileId: roles['prometheus-rules'],
      releaseEnvironmentFileId: roles['release-environment'],
      remoteEntryFileId: roles['remote-entry'],
      runOverlayFileId: roles['run-overlay'],
      smokeFileId: roles['archive-smoke'],
    },
    schemaVersion: INPUT_SCHEMA_VERSION,
    source: {
      operations: operationsIdentity,
      product: handoff.candidate.source.product,
    },
    states: {
      deployed: false,
      productionActivated: false,
      released: false,
    },
    transfer: {
      fileCount: files.length,
      files,
      totalSize,
    },
    transport: {
      actions: transport.actions,
      candidateArchiveSha256: handoff.archiveDigest,
      externalInventorySha256: handoff.externalInventoryDigest,
    },
  };
  validateValidationInput(input);
  const written = writeCanonicalJsonFile({
    mode: 0o400,
    relativePath: 'validation-input-v1.json',
    root: packageRoot,
    value: input,
  });
  return deepFreeze({
    files,
    input,
    inputDigest: written.sha256,
    inputPath: written.path,
    packageRoot,
    runId,
  });
}
