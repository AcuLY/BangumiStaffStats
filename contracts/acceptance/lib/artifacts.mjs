import fs from 'node:fs';
import path from 'node:path';

import { assertCanonicalJson } from '../../artifacts/lib/canonical-json.mjs';
import {
  validateCompatibilityManifest,
  verifyComponentDirectory,
} from '../../artifacts/lib/validation.mjs';
import { canonicalJsonDigest } from './canonical-json.mjs';
import { requireCanonicalPath } from './paths.mjs';
import {
  assertSameSeal,
  sealDirectoryTree,
  sha256File,
} from './seal.mjs';
import { readJsonStrict } from './strict-json.mjs';

export class ArtifactAdmissionError extends Error {}

function fail(message) {
  throw new ArtifactAdmissionError(message);
}

const privateArtifactAttestations = new WeakMap();

export async function sealImmutableArtifactRoot(root, label = 'artifact') {
  const seal = await sealDirectoryTree(root);
  for (const entry of seal.entries) {
    if ((entry.mode & 0o222) !== 0) {
      fail(`${label} contains a writable ${entry.kind}: ${entry.path}`);
    }
  }
  return seal;
}

export async function attestArtifacts(artifacts, productIdentity) {
  const roots = {
    backend: requireCanonicalPath(artifacts.backendRoot, {
      label: 'Backend artifact root',
      type: 'directory',
    }),
    updater: requireCanonicalPath(artifacts.updaterRoot, {
      label: 'Updater artifact root',
      type: 'directory',
    }),
    frontend: requireCanonicalPath(artifacts.frontendRoot, {
      label: 'Frontend artifact root',
      type: 'directory',
    }),
  };
  const statements = {};
  const componentFacts = {};
  const seals = {};
  for (const component of ['backend', 'updater', 'frontend']) {
    seals[component] = await sealImmutableArtifactRoot(
      roots[component],
      `${component} artifact`,
    );
    const verified = verifyComponentDirectory(roots[component], component);
    const statementPath = path.join(roots[component], 'component-statement.json');
    if (
      verified.statement.source.revision !== productIdentity.revision ||
      verified.statement.source.tree !== productIdentity.tree
    ) {
      fail(`${component} statement names a different product source`);
    }
    if (
      verified.statement.target.os !== 'linux' ||
      verified.statement.target.architecture !== 'arm64'
    ) {
      fail(`${component} statement target is not linux/arm64`);
    }
    statements[component] = verified.statement;
    componentFacts[component] = Object.freeze({
      artifactSetDigest: verified.statement.artifactSetDigest,
      statementDigest: await sha256File(statementPath),
      rootDigest: seals[component].digest,
      rootIdentityDigest: seals[component].identityDigest,
    });
  }
  const manifestPath = requireCanonicalPath(artifacts.compatibilityManifest, {
    label: 'compatibility manifest',
    type: 'file',
  });
  const manifestSource = fs.readFileSync(manifestPath, 'utf8');
  const compatibilityRoot = requireCanonicalPath(path.dirname(manifestPath), {
    label: 'compatibility artifact root',
    type: 'directory',
  });
  seals.compatibility = await sealImmutableArtifactRoot(
    compatibilityRoot,
    'compatibility artifact',
  );
  const manifest = readJsonStrict(manifestPath);
  assertCanonicalJson(manifestSource, manifest, manifestPath);
  validateCompatibilityManifest(manifest, manifestPath);
  if (
    manifest.source.revision !== productIdentity.revision ||
    manifest.source.tree !== productIdentity.tree ||
    manifest.target.os !== 'linux' ||
    manifest.target.architecture !== 'arm64'
  ) {
    fail('compatibility manifest names a different source or target');
  }
  for (const declaration of manifest.components) {
    const expected = componentFacts[declaration.component];
    if (
      !expected ||
      declaration.artifactSetDigest !== expected.artifactSetDigest ||
      declaration.statement.sha256 !== expected.statementDigest
    ) {
      fail(`compatibility manifest component mismatch: ${declaration.component}`);
    }
  }
  const attestation = Object.freeze({
    roots: Object.freeze(roots),
    statements: Object.freeze(statements),
    components: Object.freeze(componentFacts),
    compatibility: Object.freeze({
      path: manifestPath,
      root: compatibilityRoot,
      digest: await sha256File(manifestPath),
      canonicalDigest: canonicalJsonDigest(manifest),
      rootDigest: seals.compatibility.digest,
      rootIdentityDigest: seals.compatibility.identityDigest,
      manifest,
    }),
    seals: Object.freeze(seals),
  });
  privateArtifactAttestations.set(
    attestation,
    Object.freeze({
      roots: Object.freeze({
        ...roots,
        compatibility: compatibilityRoot,
      }),
      seals: Object.freeze(seals),
    }),
  );
  return attestation;
}

export async function verifyArtifactSeals(attestation) {
  const privateState = privateArtifactAttestations.get(attestation);
  if (!privateState) {
    fail('artifact attestation was not issued by this module');
  }
  for (const component of ['backend', 'updater', 'frontend', 'compatibility']) {
    const current = await sealImmutableArtifactRoot(
      privateState.roots[component],
      `${component} artifact`,
    );
    assertSameSeal(
      privateState.seals[component],
      current,
      `${component} artifact`,
    );
  }
  return attestation;
}
