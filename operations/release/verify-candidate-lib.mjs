import fs from 'node:fs';
import path from 'node:path';

import {
  validateCompatibilityManifest,
  verifyComponentDirectory,
} from '../../contracts/artifacts/lib/validation.mjs';
import { canonicalJsonDigest, deepFreeze } from '../lib/canonical-json.mjs';
import { assertEvidenceSafe } from '../lib/evidence-policy.mjs';
import {
  requireCanonicalPath,
  resolveContainedPath,
} from '../lib/path-policy.mjs';
import {
  compileStrictSchema,
  parseAndValidateCanonicalJson,
} from '../lib/schema.mjs';
import { parseCanonicalJson, readJsonStrict } from '../lib/strict-json.mjs';
import {
  ACCEPTED_DEVELOPMENT_SHA256,
  APPLICATION_VERSION,
  BUILD_TOOLCHAIN,
  COMPONENTS,
  FROZEN_PRODUCT,
  TARGET,
} from './constants.mjs';
import { admitDockerCapability } from './docker-capability.mjs';
import {
  completeInventoryDocument,
  descriptorForFile,
  inventoryTree,
  verifyChecksumInventory,
} from './files.mjs';
import { inspectOciArchive } from './oci.mjs';
import { parseAcceptedDevelopment } from './receipt.mjs';
import { inspectTarFile } from './tar.mjs';

const VALIDATION_SCHEMA = readJsonStrict(
  new URL('../schemas/release-validation-candidate-v1.schema.json', import.meta.url),
);
const TAG_SCHEMA = readJsonStrict(
  new URL('../schemas/release-tag-candidate-v1.schema.json', import.meta.url),
);
const validateValidation = compileStrictSchema(VALIDATION_SCHEMA, {
  label: 'validation candidate schema',
});
const validateTag = compileStrictSchema(TAG_SCHEMA, {
  label: 'tag release candidate schema',
});

export class CandidateVerificationError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'CandidateVerificationError';
  }
}

function fail(message, cause) {
  throw new CandidateVerificationError(
    message,
    cause ? { cause } : undefined,
  );
}

function sameDescriptor(expected, actual, label) {
  for (const field of ['mode', 'path', 'sha256', 'size']) {
    if (expected[field] !== actual[field]) {
      fail(`${label}.${field} differs from the candidate file`);
    }
  }
}

function verifyDescriptor(root, expected, label) {
  const actual = descriptorForFile(root, expected.path);
  sameDescriptor(expected, actual, label);
  return actual;
}

function readCandidateDocument(root) {
  const candidates = [
    ['tag-release-candidate-v1.json', validateTag, 'tag-release'],
    ['validation-candidate-v1.json', validateValidation, 'validation'],
  ].filter(([relative]) => fs.existsSync(path.join(root, relative)));
  if (candidates.length !== 1) {
    fail('candidate root must contain exactly one unpublished candidate document');
  }
  if (fs.existsSync(path.join(root, 'release-manifest.json'))) {
    fail('published release manifests are not candidate inputs');
  }
  const [relative, validate, kind] = candidates[0];
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  const value = parseAndValidateCanonicalJson(source, validate, {
    label: relative,
    policy: assertEvidenceSafe,
  });
  return { kind, relative, source, value };
}

function expectedSource(candidate, kind) {
  if (kind === 'validation') {
    if (
      candidate.source.product.revision !== FROZEN_PRODUCT.revision ||
      candidate.source.product.tree !== FROZEN_PRODUCT.tree
    ) {
      fail('validation candidate source differs from the frozen product');
    }
    return candidate.source.product;
  }
  if (
    candidate.releaseTag !== candidate.applicationVersion ||
    candidate.source.frozenBaseline.revision !== FROZEN_PRODUCT.revision ||
    candidate.source.frozenBaseline.tree !== FROZEN_PRODUCT.tree ||
    candidate.source.operationsController.revision !==
      candidate.source.release.revision ||
    candidate.source.operationsController.tree !==
      candidate.source.release.tree
  ) {
    fail('tag candidate does not bind its version and frozen baseline');
  }
  return candidate.source.release;
}

function verifyComponent(root, candidate, component, source) {
  const expectedRoot = `components/${component}`;
  const record = candidate.components[component];
  if (record.root !== expectedRoot) fail(`${component} root path drifted`);
  const componentRoot = resolveContainedPath(root, expectedRoot, {
    allowMissing: false,
    label: `${component} candidate root`,
  });
  const verified = verifyComponentDirectory(componentRoot, component);
  const statement = verified.statement;
  if (
    statement.applicationVersion !== candidate.applicationVersion ||
    statement.source.revision !== source.revision ||
    statement.source.tree !== source.tree ||
    statement.target.os !== TARGET.os ||
    statement.target.architecture !== TARGET.architecture ||
    statement.artifactSetDigest !== record.artifactSetDigest
  ) {
    fail(`${component} statement differs from candidate identity`);
  }
  verifyDescriptor(root, record.statement, `${component} statement`);
  if (record.statement.path !== `${expectedRoot}/component-statement.json`) {
    fail(`${component} statement path is not fixed`);
  }
  if (canonicalJsonDigest(inventoryTree(componentRoot)) !== record.treeDigest) {
    fail(`${component} copied tree digest differs from candidate`);
  }
  return verified;
}

function verifyImage(root, image, expectedArchivePath, loadReference) {
  if (
    image.archive.path !== expectedArchivePath ||
    image.declaredLoadReference !== loadReference
  ) {
    fail(`candidate image identity drifted: ${expectedArchivePath}`);
  }
  verifyDescriptor(root, image.archive, `${expectedArchivePath} archive`);
  const graph = inspectOciArchive({
    archivePath: path.join(root, ...expectedArchivePath.split('/')),
    declaredLoadReference: loadReference,
  });
  if (canonicalJsonDigest(graph) !== canonicalJsonDigest({
    config: image.config,
    indexDigest: image.indexDigest,
    layers: image.layers,
    manifest: image.manifest,
  })) {
    fail(`candidate OCI graph differs from archive: ${expectedArchivePath}`);
  }
}

function verifyToolchain(toolchain) {
  const expected = {
    buildkitImage: BUILD_TOOLCHAIN.buildkitImage,
    buildkitVersion: BUILD_TOOLCHAIN.buildkitVersion,
    buildxVersion: BUILD_TOOLCHAIN.buildxVersion,
    dockerEndpoint: 'unix:///var/run/docker.sock',
    dockerServerOs: 'linux',
    goVersion: BUILD_TOOLCHAIN.goVersion.slice(2),
    nodeVersion: BUILD_TOOLCHAIN.nodeVersion,
    npmVersion: BUILD_TOOLCHAIN.npmVersion,
    pythonVersion: BUILD_TOOLCHAIN.pythonVersion,
    uvVersion: BUILD_TOOLCHAIN.uvVersion,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (toolchain[key] !== value) {
      fail(`candidate toolchain.${key} differs from the admitted identity`);
    }
  }
  try {
    const admittedDocker = admitDockerCapability(toolchain);
    if (
      admittedDocker.dockerServerArchitecture !==
      toolchain.dockerServerArchitecture
    ) {
      fail('candidate Docker server architecture is not normalized');
    }
  } catch (error) {
    fail('candidate Docker capability evidence is not admitted', error);
  }
  if (
    !['amd64', 'arm64'].includes(toolchain.dockerServerArchitecture) ||
    !['amd64', 'arm64'].includes(toolchain.goHostArchitecture)
  ) {
    fail('candidate toolchain records an unsupported host architecture');
  }
}

export function verifyCandidateStructure(candidateRoot) {
  const root = requireCanonicalPath(candidateRoot, {
    label: 'candidate root',
    type: 'directory',
  });
  const document = readCandidateDocument(root);
  const candidate = document.value;
  if (
    candidate.applicationVersion !== APPLICATION_VERSION ||
    candidate.target.os !== TARGET.os ||
    candidate.target.architecture !== TARGET.architecture
  ) {
    fail('candidate application or target identity drifted');
  }
  verifyToolchain(candidate.toolchain);
  if (
    candidate.execution &&
    (candidate.execution.hostArchitecture !==
      candidate.toolchain.dockerServerArchitecture ||
      candidate.execution.hostArchitecture !==
        candidate.toolchain.goHostArchitecture)
  ) {
    fail('candidate execution and selected host toolchain identities disagree');
  }
  const source = expectedSource(candidate, document.kind);
  const receipt = verifyDescriptor(root, candidate.receipt, 'accepted receipt');
  if (
    candidate.receipt.path !== 'accepted-development.json' ||
    receipt.sha256 !== ACCEPTED_DEVELOPMENT_SHA256
  ) {
    fail('candidate accepted-development receipt digest drifted');
  }
  parseAcceptedDevelopment(
    fs.readFileSync(path.join(root, candidate.receipt.path), 'utf8'),
  );
  const components = Object.fromEntries(
    COMPONENTS.map((component) => [
      component,
      verifyComponent(root, candidate, component, source),
    ]),
  );
  const compatibilityPath = 'release/compatibility-manifest.json';
  if (candidate.assets.compatibilityManifest.path !== compatibilityPath) {
    fail('candidate compatibility manifest path drifted');
  }
  verifyDescriptor(
    root,
    candidate.assets.compatibilityManifest,
    'compatibility manifest',
  );
  const compatibility = parseCanonicalJson(
    fs.readFileSync(path.join(root, compatibilityPath), 'utf8'),
    compatibilityPath,
  );
  validateCompatibilityManifest(compatibility, compatibilityPath);
  if (
    compatibility.source.revision !== source.revision ||
    compatibility.source.tree !== source.tree
  ) {
    fail('compatibility manifest source differs from the candidate');
  }

  const backendLoadReference =
    `localhost/bgmss-backend-api:${source.revision}-amd64`;
  const updaterLoadReference =
    `localhost/bgmss-updater-artifact:${source.revision}-amd64`;
  verifyImage(
    root,
    candidate.images.api,
    'release/backend-api-linux-amd64.oci.tar',
    backendLoadReference,
  );
  verifyImage(
    root,
    candidate.images.updater,
    'release/updater-image-linux-amd64.oci.tar',
    updaterLoadReference,
  );
  for (const [name, expectedPath] of [
    ['archiveSmoke', 'release/archive-smoke'],
    ['frontend', 'release/frontend-static-linux-amd64.tar'],
  ]) {
    if (candidate.assets[name].path !== expectedPath) {
      fail(`candidate ${name} path drifted`);
    }
    verifyDescriptor(root, candidate.assets[name], name);
  }
  if (candidate.assets.archiveSmoke.mode !== '0555') {
    fail('archive-smoke must be immutable and executable');
  }
  const frontendMembers = inspectTarFile(
    path.join(root, candidate.assets.frontend.path),
  );
  if (
    frontendMembers.length === 0 ||
    frontendMembers.some((entry) => !entry.path.startsWith('frontend/')) ||
    !frontendMembers.some((entry) => entry.path === 'frontend/index.html')
  ) {
    fail('frontend release tar does not use the fixed frontend/ root');
  }

  const candidateDocumentPaths = new Set([
    document.relative,
    'payload-checksums.sha256',
  ]);
  const expectedPayload = inventoryTree(root)
    .filter((entry) => !candidateDocumentPaths.has(entry.path))
    .map((entry) => entry.path);
  if (candidate.payloadChecksums.path !== 'payload-checksums.sha256') {
    fail('candidate checksum inventory path drifted');
  }
  verifyDescriptor(root, candidate.payloadChecksums, 'payload checksums');
  const verifiedPayload = verifyChecksumInventory({
    inventoryPath: path.join(root, 'payload-checksums.sha256'),
    requiredPaths: expectedPayload,
    root,
  });
  if (candidate.payloadChecksums.fileCount !== verifiedPayload.length) {
    fail('candidate checksum inventory count drifted');
  }
  const completeInventory = completeInventoryDocument({
    candidateDocument: document.relative,
    candidateKind: document.kind,
    candidateRoot: root,
  });
  return deepFreeze({
    candidate,
    candidateDocument: document.relative,
    completeInventory,
    components,
    root,
    source,
  });
}
