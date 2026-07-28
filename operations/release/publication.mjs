import fs from 'node:fs';
import path from 'node:path';

import {
  validateCompatibilityManifest,
  validateComponentStatement,
  validateSpdxDocument,
} from '../../contracts/artifacts/lib/validation.mjs';
import { canonicalJson, deepFreeze } from '../lib/canonical-json.mjs';
import { assertSha256, sha256File } from '../lib/digest.mjs';
import { assertEvidenceSafe } from '../lib/evidence-policy.mjs';
import { writeImmutableFile } from '../lib/immutable-output.mjs';
import {
  assertPathIdentity,
  capturePathIdentity,
  requireCanonicalPath,
} from '../lib/path-policy.mjs';
import { createRunRoot } from '../lib/run-root.mjs';
import {
  compileStrictSchema,
  parseAndValidateCanonicalJson,
} from '../lib/schema.mjs';
import { parseCanonicalJson, readJsonStrict } from '../lib/strict-json.mjs';
import {
  ACCEPTED_DEVELOPMENT_SHA256,
  APPLICATION_VERSION,
  FROZEN_PRODUCT,
  IMAGE_MEDIA_TYPES,
  PROMETHEUS,
  RELEASE_ASSET_NAMES,
  TARGET,
  registryRepositories,
} from './constants.mjs';
import {
  copyImmutableFile,
  descriptorForFile,
  inventoryTree,
  serializeChecksumInventory,
  verifyChecksumInventory,
  writeCanonicalFile,
} from './files.mjs';
import { cleanupOwnedRunRoot } from './owned-cleanup.mjs';
import { inspectTarFile } from './tar.mjs';
import { verifyCandidateStructure } from './verify-candidate-lib.mjs';

const REGISTRY_SCHEMA = readJsonStrict(
  new URL('../schemas/release-registry-evidence-v1.schema.json', import.meta.url),
);
const RELEASE_SCHEMA = readJsonStrict(
  new URL('../schemas/release-manifest-v1.schema.json', import.meta.url),
);
const validateRegistryEvidence = compileStrictSchema(REGISTRY_SCHEMA, {
  label: 'registry evidence schema',
});
const validateReleaseManifest = compileStrictSchema(RELEASE_SCHEMA, {
  label: 'published release manifest schema',
});
const RELEASE_FILES = Object.freeze([
  'release-manifest.json',
  'payload-checksums.sha256',
  ...RELEASE_ASSET_NAMES,
].sort((left, right) => left.localeCompare(right, 'en')));

export class ReleasePublicationError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'ReleasePublicationError';
  }
}

function fail(message, cause) {
  throw new ReleasePublicationError(
    message,
    cause ? { cause } : undefined,
  );
}

function ensureEmptyOutput(outputPath) {
  const output = path.resolve(outputPath);
  fs.mkdirSync(output, { mode: 0o700, recursive: true });
  const canonical = requireCanonicalPath(output, {
    label: 'published release output',
    type: 'directory',
  });
  if (fs.readdirSync(canonical).length !== 0) {
    fail('published release output must be empty');
  }
  return canonical;
}

function sameGraph(candidateImage, registryImage, label) {
  if (
    canonicalJson(candidateImage.config) !==
      canonicalJson(registryImage.config) ||
    canonicalJson(candidateImage.layers) !==
      canonicalJson(registryImage.layers)
  ) {
    fail(`${label} registry config/layers differ from the candidate image graph`);
  }
  if (
    registryImage.manifest.mediaType !== IMAGE_MEDIA_TYPES.manifest ||
    registryImage.config.mediaType !== IMAGE_MEDIA_TYPES.config ||
    registryImage.layers.some(
      (entry) => entry.mediaType !== IMAGE_MEDIA_TYPES.layer,
    )
  ) {
    fail(`${label} registry graph uses an unaccepted OCI media type`);
  }
}

function validateRegistry(candidate, evidence, repository) {
  const repositories = registryRepositories(repository);
  const expectedComponents = ['backend', 'updater'];
  if (
    evidence.images.some(
      (entry, index) => entry.component !== expectedComponents[index],
    )
  ) {
    fail('registry evidence images must be backend/updater sorted');
  }
  const result = {};
  for (const entry of evidence.images) {
    const candidateImage =
      entry.component === 'backend'
        ? candidate.images.api
        : candidate.images.updater;
    const expectedRepository = repositories[entry.component];
    if (
      entry.repository !== expectedRepository ||
      entry.versionTag !== candidate.releaseTag ||
      entry.platform.os !== TARGET.os ||
      entry.platform.architecture !== TARGET.architecture ||
      entry.immutableReference !==
        `${expectedRepository}@${entry.manifest.digest}`
    ) {
      fail(`${entry.component} registry publication identity drifted`);
    }
    sameGraph(candidateImage, entry, entry.component);
    result[entry.component] = deepFreeze({
      config: entry.config,
      immutableReference: entry.immutableReference,
      layers: entry.layers,
      manifest: entry.manifest,
    });
  }
  return deepFreeze(result);
}

function copyReleaseAssets(candidateRoot, stageRoot) {
  const sources = new Map([
    ['archive-smoke', 'release/archive-smoke'],
    [
      'backend-component-statement.json',
      'release/backend-component-statement.json',
    ],
    ['backend.spdx.json', 'release/backend.spdx.json'],
    ['compatibility-manifest.json', 'release/compatibility-manifest.json'],
    [
      'frontend-component-statement.json',
      'release/frontend-component-statement.json',
    ],
    [
      'frontend-static-linux-amd64.tar',
      'release/frontend-static-linux-amd64.tar',
    ],
    ['frontend.spdx.json', 'release/frontend.spdx.json'],
    [
      'updater-component-statement.json',
      'release/updater-component-statement.json',
    ],
    ['updater.spdx.json', 'release/updater.spdx.json'],
  ]);
  for (const asset of RELEASE_ASSET_NAMES) {
    const relative = sources.get(asset);
    if (!relative) fail(`release asset source is undefined: ${asset}`);
    copyImmutableFile({
      destinationRelative: asset,
      destinationRoot: stageRoot,
      mode: asset === 'archive-smoke' ? 0o555 : 0o444,
      source: path.join(candidateRoot, ...relative.split('/')),
    });
  }
}

function publishStage(stageRoot, outputRoot) {
  const identities = new Map(
    RELEASE_FILES.map((relative) => [
      relative,
      capturePathIdentity(path.join(stageRoot, relative), {
        includeDigest: true,
        label: `staged release file ${relative}`,
      }),
    ]),
  );
  for (const relative of RELEASE_FILES) {
    const source = path.join(stageRoot, relative);
    const destination = path.join(outputRoot, relative);
    if (fs.existsSync(destination)) fail(`release output exists: ${relative}`);
    fs.renameSync(source, destination);
    const actual = capturePathIdentity(destination, {
      includeDigest: true,
      label: `published release file ${relative}`,
    });
    const expected = identities.get(relative);
    for (const key of [
      'device',
      'inode',
      'links',
      'mode',
      'modifiedNs',
      'sha256',
      'size',
      'type',
    ]) {
      if (actual[key] !== expected[key]) {
        fail(`published release file identity changed: ${relative}`);
      }
    }
  }
  const descriptor = fs.openSync(outputRoot, fs.constants.O_RDONLY);
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

export function publishRelease({
  candidateRoot,
  outputPath,
  registryEvidencePath,
  repository,
}) {
  const candidateResult = verifyCandidateStructure(candidateRoot);
  const candidate = candidateResult.candidate;
  if (
    candidate.schemaVersion !== 'operations-tag-release-candidate-v1' ||
    candidate.publicationState !== 'unpublished-tag-release'
  ) {
    fail('publication accepts only an unpublished tag-release candidate');
  }
  const registryIdentity = capturePathIdentity(registryEvidencePath, {
    includeDigest: true,
    label: 'registry publication evidence',
  });
  const registryEvidence = parseAndValidateCanonicalJson(
    fs.readFileSync(registryIdentity.path, 'utf8'),
    validateRegistryEvidence,
    {
      label: 'registry evidence',
      policy: assertEvidenceSafe,
    },
  );
  assertPathIdentity(registryIdentity.path, registryIdentity, {
    includeDigest: true,
    label: 'registry publication evidence',
  });
  const images = validateRegistry(candidate, registryEvidence, repository);
  const output = ensureEmptyOutput(outputPath);
  const tmpRoot = path.join(output, '.publication-runs');
  const run = createRunRoot({
    directories: ['stage'],
    purpose: 'release-publication',
    tmpRoot,
  });
  const stage = path.join(run.runRoot, 'stage');
  let primaryError;
  let result;
  try {
    copyReleaseAssets(candidateResult.root, stage);
    const payload = RELEASE_ASSET_NAMES.map((asset) =>
      descriptorForFile(stage, asset),
    );
    writeImmutableFile({
      bytes: serializeChecksumInventory(payload),
      mode: 0o444,
      relativePath: 'payload-checksums.sha256',
      root: stage,
    });
    const provenance = [
      'backend-component-statement.json',
      'backend.spdx.json',
      'frontend-component-statement.json',
      'frontend.spdx.json',
      'updater-component-statement.json',
      'updater.spdx.json',
    ]
      .sort((left, right) => left.localeCompare(right, 'en'))
      .map((relative) => descriptorForFile(stage, relative));
    const manifest = {
      acceptedDevelopment: {
        frozenProduct: FROZEN_PRODUCT,
        receiptDigest: candidate.receipt.sha256,
      },
      assets: {
        archiveSmoke: descriptorForFile(stage, 'archive-smoke'),
        compatibilityManifest: descriptorForFile(
          stage,
          'compatibility-manifest.json',
        ),
        frontend: descriptorForFile(
          stage,
          'frontend-static-linux-amd64.tar',
        ),
        payloadChecksums: descriptorForFile(
          stage,
          'payload-checksums.sha256',
        ),
        provenance,
      },
      compatibility: candidate.compatibility,
      images: {
        api: images.backend,
        prometheus: PROMETHEUS,
        updater: images.updater,
      },
      publicationState: 'published',
      release: {
        tag: candidate.releaseTag,
        version: candidate.applicationVersion,
      },
      schemaVersion: 'operations-release-manifest-v1',
      source: {
        operationsController: candidate.source.operationsController,
        release: candidate.source.release,
      },
      target: TARGET,
    };
    validateReleaseManifest(manifest);
    assertEvidenceSafe(manifest, { label: 'published release manifest' });
    writeCanonicalFile({
      relativePath: 'release-manifest.json',
      root: stage,
      value: manifest,
    });
    const stagedFiles = inventoryTree(stage).map((entry) => entry.path);
    if (
      stagedFiles.length !== RELEASE_FILES.length ||
      stagedFiles.some((entry, index) => entry !== RELEASE_FILES[index])
    ) {
      fail('staged release differs from the exact eleven-file closure');
    }
    publishStage(stage, output);
    cleanupOwnedRunRoot(run.runRoot, {
      expectedPurpose: 'release-publication',
      tmpRoot,
    });
    result = verifyPublishedRelease({
      assetRoot: output,
      expectedDigest: sha256File(
        path.join(output, 'release-manifest.json'),
      ),
      manifestPath: path.join(output, 'release-manifest.json'),
    });
  } catch (error) {
    primaryError = error;
  }
  let cleanupError;
  if (fs.existsSync(run.runRoot)) {
    try {
      cleanupOwnedRunRoot(run.runRoot, {
        expectedPurpose: 'release-publication',
        tmpRoot,
      });
    } catch (error) {
      cleanupError = error;
    }
  }
  if (primaryError && cleanupError) {
    throw new AggregateError(
      [primaryError, cleanupError],
      'release publication and owned cleanup both failed',
    );
  }
  if (primaryError) throw primaryError;
  if (cleanupError) throw cleanupError;
  return result;
}

function verifyManifestAsset(root, descriptor, expectedPath, label) {
  if (descriptor.path !== expectedPath) fail(`${label} path drifted`);
  const actual = descriptorForFile(root, expectedPath);
  for (const key of ['mode', 'path', 'sha256', 'size']) {
    if (actual[key] !== descriptor[key]) fail(`${label}.${key} drifted`);
  }
  return actual;
}

function verifyProvenance(root, manifest) {
  const expected = [
    'backend-component-statement.json',
    'backend.spdx.json',
    'frontend-component-statement.json',
    'frontend.spdx.json',
    'updater-component-statement.json',
    'updater.spdx.json',
  ].sort((left, right) => left.localeCompare(right, 'en'));
  if (
    manifest.assets.provenance.some(
      (entry, index) => entry.path !== expected[index],
    )
  ) {
    fail('release provenance path set drifted');
  }
  const statements = {};
  for (const component of ['backend', 'frontend', 'updater']) {
    const statementPath = `${component}-component-statement.json`;
    const spdxPath = `${component}.spdx.json`;
    verifyManifestAsset(
      root,
      manifest.assets.provenance.find((entry) => entry.path === statementPath),
      statementPath,
      `${component} statement`,
    );
    verifyManifestAsset(
      root,
      manifest.assets.provenance.find((entry) => entry.path === spdxPath),
      spdxPath,
      `${component} SPDX`,
    );
    const statement = parseCanonicalJson(
      fs.readFileSync(path.join(root, statementPath), 'utf8'),
      statementPath,
    );
    validateComponentStatement(statement, statementPath);
    if (
      statement.component !== component ||
      statement.applicationVersion !== manifest.release.version ||
      statement.source.revision !== manifest.source.release.revision ||
      statement.source.tree !== manifest.source.release.tree ||
      statement.target.os !== TARGET.os ||
      statement.target.architecture !== TARGET.architecture
    ) {
      fail(`${component} statement differs from the published release`);
    }
    const spdx = parseCanonicalJson(
      fs.readFileSync(path.join(root, spdxPath), 'utf8'),
      spdxPath,
    );
    validateSpdxDocument(spdx, statement, spdxPath);
    statements[component] = statement;
  }
  return statements;
}

export function assertPublishedReleaseAuthority(manifest) {
  if (
    manifest.release.tag !== APPLICATION_VERSION ||
    manifest.release.version !== APPLICATION_VERSION ||
    canonicalJson(manifest.acceptedDevelopment.frozenProduct) !==
      canonicalJson(FROZEN_PRODUCT) ||
    manifest.acceptedDevelopment.receiptDigest !==
      ACCEPTED_DEVELOPMENT_SHA256 ||
    canonicalJson(manifest.source.operationsController) !==
      canonicalJson(manifest.source.release)
  ) {
    fail('published release authority differs from the admitted release closure');
  }
  return manifest;
}

export function verifyPublishedRelease({
  assetRoot,
  expectedDigest,
  manifestPath,
}) {
  const manifestFile = requireCanonicalPath(manifestPath, {
    label: 'published release manifest',
    requireSingleLink: true,
    type: 'file',
  });
  const expected = assertSha256(expectedDigest, 'expected release manifest digest');
  const manifestIdentity = capturePathIdentity(manifestFile, {
    includeDigest: true,
    label: 'published release manifest',
  });
  if (manifestIdentity.sha256 !== expected) {
    fail('published release manifest digest differs from the expected digest');
  }
  const manifest = parseAndValidateCanonicalJson(
    fs.readFileSync(manifestIdentity.path, 'utf8'),
    validateReleaseManifest,
    {
      label: 'release-manifest.json',
      policy: assertEvidenceSafe,
    },
  );
  assertPathIdentity(manifestIdentity.path, manifestIdentity, {
    includeDigest: true,
    label: 'published release manifest',
  });
  assertPublishedReleaseAuthority(manifest);
  const root = requireCanonicalPath(assetRoot ?? path.dirname(manifestFile), {
    label: 'published release asset root',
    type: 'directory',
  });
  const files = inventoryTree(root).map((entry) => entry.path);
  if (
    files.length !== RELEASE_FILES.length ||
    files.some((entry, index) => entry !== RELEASE_FILES[index])
  ) {
    fail('published release root differs from the exact eleven-file closure');
  }
  verifyManifestAsset(root, manifest.assets.archiveSmoke, 'archive-smoke', 'archive-smoke');
  if (manifest.assets.archiveSmoke.mode !== '0555') {
    fail('published archive-smoke must be executable and immutable');
  }
  verifyManifestAsset(
    root,
    manifest.assets.frontend,
    'frontend-static-linux-amd64.tar',
    'Frontend asset',
  );
  const frontendMembers = inspectTarFile(
    path.join(root, 'frontend-static-linux-amd64.tar'),
  );
  if (
    frontendMembers.length === 0 ||
    frontendMembers.some((entry) => !entry.path.startsWith('frontend/')) ||
    !frontendMembers.some((entry) => entry.path === 'frontend/index.html')
  ) {
    fail('published Frontend tar root is invalid');
  }
  verifyManifestAsset(
    root,
    manifest.assets.compatibilityManifest,
    'compatibility-manifest.json',
    'compatibility manifest',
  );
  const compatibility = parseCanonicalJson(
    fs.readFileSync(path.join(root, 'compatibility-manifest.json'), 'utf8'),
    'compatibility-manifest.json',
  );
  validateCompatibilityManifest(compatibility);
  if (
    compatibility.source.revision !== manifest.source.release.revision ||
    compatibility.source.tree !== manifest.source.release.tree
  ) {
    fail('published compatibility manifest source drifted');
  }
  verifyManifestAsset(
    root,
    manifest.assets.payloadChecksums,
    'payload-checksums.sha256',
    'payload checksums',
  );
  verifyChecksumInventory({
    inventoryPath: path.join(root, 'payload-checksums.sha256'),
    requiredPaths: RELEASE_ASSET_NAMES,
    root,
  });
  verifyProvenance(root, manifest);
  const repositories = registryRepositories('AcuLY/BangumiStaffStats');
  for (const [name, repository] of [
    ['api', repositories.backend],
    ['updater', repositories.updater],
  ]) {
    const image = manifest.images[name];
    if (
      image.immutableReference !== `${repository}@${image.manifest.digest}` ||
      image.manifest.mediaType !== IMAGE_MEDIA_TYPES.manifest ||
      image.config.mediaType !== IMAGE_MEDIA_TYPES.config ||
      image.layers.some(
        (entry) => entry.mediaType !== IMAGE_MEDIA_TYPES.layer,
      )
    ) {
      fail(`published ${name} image identity drifted`);
    }
  }
  return deepFreeze({
    digest: expected,
    manifest,
    root,
  });
}

export function publicationSchemas() {
  return deepFreeze({
    registryEvidence: REGISTRY_SCHEMA,
    releaseManifest: RELEASE_SCHEMA,
  });
}
