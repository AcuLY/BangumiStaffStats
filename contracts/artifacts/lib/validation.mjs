import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  assertCanonicalJson,
  canonicalJson,
  canonicalJsonDigest,
} from './canonical-json.mjs';
import { parseJsonStrict } from './strict-json.mjs';

export const COMPONENTS = Object.freeze(['backend', 'frontend', 'updater']);
export const OPENAPI_DIGEST =
  'sha256:e7aba7c34b0d6f74e533e8e9fd31c8f0aa40ed15c440669ec87a7204c963cf11';
export const ARCHIVE_MANIFEST_SCHEMA_DIGEST =
  'sha256:5a2b0cd7294312e9dcbdd413a1b01c4218652c4c39fd7472b74e40622e7a3e73';
export const ARCHIVE_SCHEMA_SQL_DIGEST =
  'sha256:3cce7ce75fb4a7d2943ee8b9fb7c5df2639fae8fa0a2e07bddb3e1519ffdc8e0';
export const BUILDKIT_VERSION = '0.27.1';
export const DOCKER_BUILDX_VERSION = '0.34.1';
export const BUILDKIT_IMAGE_DIGEST =
  'sha256:1e110c71d389d6d24f67b9438e2f7b8da749a6ff407b22a1631e025c95599368';
export const SUPPORTED_ARCHIVE_MANIFEST_SCHEMA = 1;
export const SUPPORTED_ARCHIVE_SQLITE_SCHEMA = 1;

const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;
const GIT_OBJECT_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const TOKEN_RE = /^[a-z0-9][a-z0-9._-]*$/;
const BASE_IMAGE_RE = /^[A-Za-z0-9._/:+-]+@sha256:[0-9a-f]{64}$/;
const SPDX_NAMESPACE_RE =
  /^https:\/\/spdx\.bangumi-staff-stats\.invalid\/(backend|updater|frontend)\/sha256-([0-9a-f]{64})$/;
const SPDX_ID_RE = /^SPDXRef-(?:DOCUMENT|Package-[A-Za-z0-9.-]+)$/;
const SPDX_PACKAGE_ID_RE = /^SPDXRef-Package-[A-Za-z0-9.-]+$/;
const ISO_TIMESTAMP_RE =
  /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})\b/;
const UUID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const HOST_PATH_RE =
  /(?:^|[=:])(?:\/(?:Users|home|private\/var\/folders|tmp)\/|[A-Za-z]:\\)/;

const TOOLCHAIN_REQUIREMENTS = Object.freeze({
  backend: Object.freeze(['buildkit', 'docker-buildx', 'go']),
  frontend: Object.freeze(['node', 'npm', 'vite']),
  updater: Object.freeze(['buildkit', 'docker-buildx', 'python', 'uv']),
});

export class ArtifactValidationError extends Error {}

function fail(label, message) {
  throw new ArtifactValidationError(`${label}: ${message}`);
}

function assertObject(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(label, 'must be an object');
  }
}

function exactKeys(value, required, optional, label) {
  assertObject(value, label);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(label, `unknown field ${JSON.stringify(key)}`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(label, `missing field ${JSON.stringify(key)}`);
  }
}

function assertString(value, label, { min = 1, max = 4096, pattern } = {}) {
  if (typeof value !== 'string') fail(label, 'must be a string');
  if (value.length < min || value.length > max) {
    fail(label, `length must be between ${min} and ${max}`);
  }
  if (pattern && !pattern.test(value)) fail(label, 'has an invalid format');
}

function assertInteger(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    fail(label, `must be a safe integer >= ${minimum}`);
  }
}

function assertDigest(value, label) {
  assertString(value, label, { pattern: DIGEST_RE });
}

export function assertSafeRelativePath(value, label = 'path') {
  assertString(value, label, { max: 1024 });
  if (value.includes('\\') || value.includes('\0') || value.startsWith('/')) {
    fail(label, 'must be a normalized relative POSIX path');
  }
  const segments = value.split('/');
  if (
    segments.some(
      (segment) =>
        segment === '' ||
        segment === '.' ||
        segment === '..' ||
        !/^[A-Za-z0-9._-]+$/.test(segment),
    )
  ) {
    fail(label, 'must contain only safe normalized path segments');
  }
  return value;
}

function assertArray(value, label, minimum = 0) {
  if (!Array.isArray(value) || value.length < minimum) {
    fail(label, `must be an array with at least ${minimum} item(s)`);
  }
}

function assertStrictlySortedUnique(values, selector, label) {
  let previous;
  const seen = new Set();
  for (const [index, value] of values.entries()) {
    const key = selector(value);
    if (typeof key !== 'string') fail(`${label}[${index}]`, 'sort key must be a string');
    if (seen.has(key)) fail(label, `contains duplicate sort key ${JSON.stringify(key)}`);
    if (previous !== undefined && previous >= key) {
      fail(label, `must be strictly sorted; ${JSON.stringify(key)} follows ${JSON.stringify(previous)}`);
    }
    seen.add(key);
    previous = key;
  }
}

function assertNoNondeterministicStatementValues(value, label, location = '$') {
  if (typeof value === 'string') {
    if (ISO_TIMESTAMP_RE.test(value)) fail(label, `${location} contains a timestamp`);
    if (UUID_RE.test(value)) fail(label, `${location} contains a random UUID`);
    if (HOST_PATH_RE.test(value)) fail(label, `${location} contains a host path`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertNoNondeterministicStatementValues(entry, label, `${location}[${index}]`),
    );
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (
        /^(?:host|hostname|user|username|timestamp|time|created|uuid|random|nonce|environment|env)$/i.test(
          key,
        )
      ) {
        fail(label, `${location}.${key} is nondeterministic or host-specific`);
      }
      assertNoNondeterministicStatementValues(entry, label, `${location}.${key}`);
    }
  }
}

function validateSource(value, label) {
  exactKeys(value, ['revision', 'tree'], [], label);
  assertString(value.revision, `${label}.revision`, { pattern: GIT_OBJECT_RE });
  assertString(value.tree, `${label}.tree`, { pattern: GIT_OBJECT_RE });
}

function validateTarget(value, label) {
  exactKeys(value, ['os', 'architecture'], [], label);
  assertString(value.os, `${label}.os`, { max: 64, pattern: TOKEN_RE });
  assertString(value.architecture, `${label}.architecture`, {
    max: 64,
    pattern: TOKEN_RE,
  });
}

function validateToolchain(value, component, label) {
  assertArray(value, label, 1);
  for (const [index, tool] of value.entries()) {
    const itemLabel = `${label}[${index}]`;
    exactKeys(tool, ['name', 'version'], [], itemLabel);
    assertString(tool.name, `${itemLabel}.name`, { max: 64, pattern: TOKEN_RE });
    assertString(tool.version, `${itemLabel}.version`, { max: 128 });
  }
  assertStrictlySortedUnique(value, (tool) => tool.name, label);
  const present = new Set(value.map((tool) => tool.name));
  for (const required of TOOLCHAIN_REQUIREMENTS[component]) {
    if (!present.has(required)) fail(label, `missing required ${component} tool ${required}`);
  }
  const versions = new Map(value.map((tool) => [tool.name, tool.version]));
  if (component === 'frontend') {
    for (const forbidden of ['buildkit', 'docker-buildx']) {
      if (versions.has(forbidden)) fail(label, `frontend must not declare ${forbidden}`);
    }
  } else {
    if (versions.get('buildkit') !== BUILDKIT_VERSION) {
      fail(label, `buildkit must equal ${BUILDKIT_VERSION}`);
    }
    if (versions.get('docker-buildx') !== DOCKER_BUILDX_VERSION) {
      fail(label, `docker-buildx must equal ${DOCKER_BUILDX_VERSION}`);
    }
  }
}

function validateBaseImages(value, component, label) {
  assertArray(value, label);
  if (component === 'frontend' && value.length !== 0) {
    fail(label, 'frontend must not declare a base image');
  }
  if (component !== 'frontend' && value.length === 0) {
    fail(label, `${component} must declare at least one digest-pinned base image`);
  }
  for (const [index, image] of value.entries()) {
    const itemLabel = `${label}[${index}]`;
    exactKeys(image, ['reference'], [], itemLabel);
    assertString(image.reference, `${itemLabel}.reference`, {
      max: 512,
      pattern: BASE_IMAGE_RE,
    });
  }
  assertStrictlySortedUnique(value, (image) => image.reference, label);
}

function validateInputs(value, component, label) {
  assertArray(value, label, 1);
  for (const [index, input] of value.entries()) {
    const itemLabel = `${label}[${index}]`;
    exactKeys(input, ['path', 'sha256'], [], itemLabel);
    assertSafeRelativePath(input.path, `${itemLabel}.path`);
    assertDigest(input.sha256, `${itemLabel}.sha256`);
  }
  assertStrictlySortedUnique(value, (input) => input.path, label);
  const buildkitImage = value.find(
    (input) => input.path === 'toolchain/buildkit-image',
  );
  if (component === 'frontend') {
    if (buildkitImage) fail(label, 'frontend must not declare a BuildKit image input');
  } else if (!buildkitImage) {
    fail(label, `missing ${component} BuildKit image input`);
  } else if (buildkitImage.sha256 !== BUILDKIT_IMAGE_DIGEST) {
    fail(label, `BuildKit image must equal ${BUILDKIT_IMAGE_DIGEST}`);
  }
}

function validateVersionRange(value, label) {
  exactKeys(value, ['minimum', 'maximum'], [], label);
  assertInteger(value.minimum, `${label}.minimum`, 1);
  assertInteger(value.maximum, `${label}.maximum`, 1);
  if (value.minimum > value.maximum) fail(label, 'minimum must not exceed maximum');
}

function validateArchiveCompatibility(value, label) {
  exactKeys(
    value,
    [
      'manifestSchemaVersion',
      'sqliteSchemaVersion',
      'manifestSchemaDigest',
      'schemaSqlDigest',
    ],
    [],
    label,
  );
  validateVersionRange(value.manifestSchemaVersion, `${label}.manifestSchemaVersion`);
  validateVersionRange(value.sqliteSchemaVersion, `${label}.sqliteSchemaVersion`);
  assertDigest(value.manifestSchemaDigest, `${label}.manifestSchemaDigest`);
  assertDigest(value.schemaSqlDigest, `${label}.schemaSqlDigest`);
}

function validateCompatibility(value, component, label) {
  exactKeys(value, ['archive', 'openapiDigest'], [], label);
  validateArchiveCompatibility(value.archive, `${label}.archive`);
  if (component === 'updater') {
    if (value.openapiDigest !== null) fail(`${label}.openapiDigest`, 'must be null for updater');
  } else {
    assertDigest(value.openapiDigest, `${label}.openapiDigest`);
    if (value.openapiDigest !== OPENAPI_DIGEST) {
      fail(`${label}.openapiDigest`, `must equal accepted OpenAPI digest ${OPENAPI_DIGEST}`);
    }
  }
}

function validateArtifact(value, label) {
  exactKeys(value, ['path', 'size', 'sha256'], [], label);
  assertSafeRelativePath(value.path, `${label}.path`);
  assertInteger(value.size, `${label}.size`);
  assertDigest(value.sha256, `${label}.sha256`);
}

function validateArtifacts(value, label) {
  assertArray(value, label, 1);
  value.forEach((artifact, index) => validateArtifact(artifact, `${label}[${index}]`));
  assertStrictlySortedUnique(value, (artifact) => artifact.path, label);
}

function validateEvidence(value, label) {
  exactKeys(value, ['path', 'size', 'sha256'], [], label);
  assertSafeRelativePath(value.path, `${label}.path`);
  assertInteger(value.size, `${label}.size`, 1);
  assertDigest(value.sha256, `${label}.sha256`);
}

function validateSbomEvidence(value, label) {
  exactKeys(
    value,
    ['path', 'size', 'sha256', 'documentNamespace', 'packageCount'],
    [],
    label,
  );
  assertSafeRelativePath(value.path, `${label}.path`);
  assertInteger(value.size, `${label}.size`, 1);
  assertDigest(value.sha256, `${label}.sha256`);
  assertString(value.documentNamespace, `${label}.documentNamespace`, {
    max: 512,
    pattern: SPDX_NAMESPACE_RE,
  });
  assertInteger(value.packageCount, `${label}.packageCount`, 1);
}

export function validateComponentStatement(value, label = 'component statement') {
  exactKeys(
    value,
    [
      'schemaVersion',
      'component',
      'source',
      'target',
      'toolchain',
      'baseImages',
      'inputs',
      'compatibility',
      'artifacts',
      'artifactSetDigest',
      'checksumInventory',
      'sbom',
    ],
    [],
    label,
  );
  if (value.schemaVersion !== 1) fail(`${label}.schemaVersion`, 'must equal 1');
  if (!COMPONENTS.includes(value.component)) {
    fail(`${label}.component`, `must be one of ${COMPONENTS.join(', ')}`);
  }
  validateSource(value.source, `${label}.source`);
  validateTarget(value.target, `${label}.target`);
  validateToolchain(value.toolchain, value.component, `${label}.toolchain`);
  validateBaseImages(value.baseImages, value.component, `${label}.baseImages`);
  validateInputs(value.inputs, value.component, `${label}.inputs`);
  validateCompatibility(value.compatibility, value.component, `${label}.compatibility`);
  validateArtifacts(value.artifacts, `${label}.artifacts`);
  assertDigest(value.artifactSetDigest, `${label}.artifactSetDigest`);
  const expectedArtifactSetDigest = canonicalJsonDigest(value.artifacts);
  if (value.artifactSetDigest !== expectedArtifactSetDigest) {
    fail(
      `${label}.artifactSetDigest`,
      `must equal canonical artifact inventory digest ${expectedArtifactSetDigest}`,
    );
  }
  validateEvidence(value.checksumInventory, `${label}.checksumInventory`);
  validateSbomEvidence(value.sbom, `${label}.sbom`);
  if (value.checksumInventory.path === value.sbom.path) {
    fail(label, 'checksum inventory and SBOM paths must differ');
  }
  const namespace = SPDX_NAMESPACE_RE.exec(value.sbom.documentNamespace);
  if (!namespace || namespace[1] !== value.component) {
    fail(`${label}.sbom.documentNamespace`, 'must contain the matching component ID');
  }
  assertNoNondeterministicStatementValues(value, label);
  return value;
}

export function sha256Bytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export function sha256File(filePath) {
  const hash = createHash('sha256');
  const descriptor = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let count;
    do {
      count = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (count > 0) hash.update(buffer.subarray(0, count));
    } while (count > 0);
  } finally {
    fs.closeSync(descriptor);
  }
  return `sha256:${hash.digest('hex')}`;
}

export function parseChecksumInventory(source, label = 'SHA256SUMS') {
  if (typeof source !== 'string') fail(label, 'must be UTF-8 text');
  if (!source.endsWith('\n')) fail(label, 'must end with exactly one newline');
  if (source.includes('\r') || source.endsWith('\n\n')) {
    fail(label, 'must use canonical LF lines without blank records');
  }
  const lines = source.slice(0, -1).split('\n');
  if (lines.length === 0 || (lines.length === 1 && lines[0] === '')) {
    fail(label, 'must not be empty');
  }
  const entries = lines.map((line, index) => {
    const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
    if (!match) fail(`${label}:${index + 1}`, 'must be <sha256><two spaces><path>');
    const relativePath = assertSafeRelativePath(match[2], `${label}:${index + 1} path`);
    return { path: relativePath, sha256: `sha256:${match[1]}` };
  });
  assertStrictlySortedUnique(entries, (entry) => entry.path, label);
  return entries;
}

export function serializeChecksumInventory(artifacts) {
  validateArtifacts(artifacts, 'checksum artifacts');
  return artifacts
    .map((artifact) => `${artifact.sha256.slice('sha256:'.length)}  ${artifact.path}\n`)
    .join('');
}

function readCanonicalJson(filePath, label) {
  const source = fs.readFileSync(filePath, 'utf8');
  const value = parseJsonStrict(source, label);
  assertCanonicalJson(source, value, label);
  return { source, value };
}

function assertRegularFile(filePath, label) {
  let information;
  try {
    information = fs.lstatSync(filePath);
  } catch (error) {
    fail(label, `cannot read file: ${error.message}`);
  }
  if (information.isSymbolicLink() || !information.isFile()) {
    fail(label, 'must be a regular non-symlink file');
  }
  return information;
}

function resolveContained(root, relativePath, label) {
  assertSafeRelativePath(relativePath, label);
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...relativePath.split('/'));
  if (resolved === resolvedRoot || !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    fail(label, 'escapes the component root');
  }
  return resolved;
}

function listRegularFiles(root) {
  const results = [];
  function visit(directory, prefix) {
    const entries = fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name, 'en'),
    );
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      assertSafeRelativePath(relative, `component file ${relative}`);
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) fail(`component file ${relative}`, 'symlinks are forbidden');
      if (entry.isDirectory()) {
        visit(absolute, relative);
      } else if (entry.isFile()) {
        results.push(relative);
      } else {
        fail(`component file ${relative}`, 'special files are forbidden');
      }
    }
  }
  visit(root, '');
  return results.sort();
}

function evidenceFor(filePath, relativePath) {
  const information = assertRegularFile(filePath, relativePath);
  return {
    path: relativePath,
    size: information.size,
    sha256: sha256File(filePath),
  };
}

function validateSpdxPackage(value, label) {
  exactKeys(
    value,
    [
      'SPDXID',
      'name',
      'downloadLocation',
      'filesAnalyzed',
      'licenseConcluded',
      'licenseDeclared',
      'copyrightText',
    ],
    [
      'versionInfo',
      'supplier',
      'checksums',
      'primaryPackagePurpose',
      'externalRefs',
      'comment',
    ],
    label,
  );
  assertString(value.SPDXID, `${label}.SPDXID`, { pattern: SPDX_PACKAGE_ID_RE });
  assertString(value.name, `${label}.name`, { max: 256 });
  if (Object.hasOwn(value, 'versionInfo')) {
    assertString(value.versionInfo, `${label}.versionInfo`, { max: 256 });
  }
  if (Object.hasOwn(value, 'supplier')) {
    assertString(value.supplier, `${label}.supplier`, { max: 256 });
  }
  if (value.downloadLocation !== 'NOASSERTION') {
    fail(`${label}.downloadLocation`, 'must equal NOASSERTION');
  }
  if (value.filesAnalyzed !== false) fail(`${label}.filesAnalyzed`, 'must equal false');
  assertString(value.licenseConcluded, `${label}.licenseConcluded`, { max: 128 });
  assertString(value.licenseDeclared, `${label}.licenseDeclared`, { max: 128 });
  assertString(value.copyrightText, `${label}.copyrightText`, { max: 512 });
  if (Object.hasOwn(value, 'primaryPackagePurpose')) {
    if (!['APPLICATION', 'LIBRARY'].includes(value.primaryPackagePurpose)) {
      fail(`${label}.primaryPackagePurpose`, 'must be APPLICATION or LIBRARY');
    }
  }
  if (Object.hasOwn(value, 'comment')) {
    assertString(value.comment, `${label}.comment`, { min: 0, max: 512 });
  }
  if (Object.hasOwn(value, 'checksums')) {
    assertArray(value.checksums, `${label}.checksums`, 1);
    if (value.checksums.length !== 1) fail(`${label}.checksums`, 'must contain one SHA256');
    const checksum = value.checksums[0];
    exactKeys(checksum, ['algorithm', 'checksumValue'], [], `${label}.checksums[0]`);
    if (checksum.algorithm !== 'SHA256') {
      fail(`${label}.checksums[0].algorithm`, 'must equal SHA256');
    }
    assertString(checksum.checksumValue, `${label}.checksums[0].checksumValue`, {
      pattern: /^[0-9a-f]{64}$/,
    });
  }
  if (Object.hasOwn(value, 'externalRefs')) {
    assertArray(value.externalRefs, `${label}.externalRefs`);
    if (value.externalRefs.length > 1) fail(`${label}.externalRefs`, 'must contain at most one purl');
    for (const [index, externalRef] of value.externalRefs.entries()) {
      const refLabel = `${label}.externalRefs[${index}]`;
      exactKeys(
        externalRef,
        ['referenceCategory', 'referenceType', 'referenceLocator'],
        [],
        refLabel,
      );
      if (
        externalRef.referenceCategory !== 'PACKAGE-MANAGER' ||
        externalRef.referenceType !== 'purl'
      ) {
        fail(refLabel, 'must be a PACKAGE-MANAGER purl');
      }
      assertString(externalRef.referenceLocator, `${refLabel}.referenceLocator`, {
        max: 1024,
        pattern: /^pkg:[A-Za-z0-9.+_-]+\/[A-Za-z0-9._~/%+-]+@[A-Za-z0-9._~+:-]+$/,
      });
    }
  }
}

function relationshipKey(value) {
  return `${value.spdxElementId}\0${value.relationshipType}\0${value.relatedSpdxElement}`;
}

export function validateSpdxDocument(value, statement, label = 'SPDX document') {
  exactKeys(
    value,
    [
      'spdxVersion',
      'dataLicense',
      'SPDXID',
      'name',
      'documentNamespace',
      'creationInfo',
      'packages',
      'relationships',
    ],
    ['documentDescribes'],
    label,
  );
  if (value.spdxVersion !== 'SPDX-2.3') fail(`${label}.spdxVersion`, 'must equal SPDX-2.3');
  if (value.dataLicense !== 'CC0-1.0') fail(`${label}.dataLicense`, 'must equal CC0-1.0');
  if (value.SPDXID !== 'SPDXRef-DOCUMENT') {
    fail(`${label}.SPDXID`, 'must equal SPDXRef-DOCUMENT');
  }
  assertString(value.name, `${label}.name`, {
    max: 512,
    pattern: /^[A-Za-z0-9._/+@-]+$/,
  });
  assertString(value.documentNamespace, `${label}.documentNamespace`, {
    max: 512,
    pattern: SPDX_NAMESPACE_RE,
  });
  const namespace = SPDX_NAMESPACE_RE.exec(value.documentNamespace);
  if (!namespace || namespace[1] !== statement.component) {
    fail(`${label}.documentNamespace`, 'must contain the statement component');
  }
  if (value.documentNamespace !== statement.sbom.documentNamespace) {
    fail(`${label}.documentNamespace`, 'does not match statement SBOM evidence');
  }

  exactKeys(value.creationInfo, ['created', 'creators'], ['licenseListVersion'], `${label}.creationInfo`);
  if (value.creationInfo.created !== '1970-01-01T00:00:00Z') {
    fail(`${label}.creationInfo.created`, 'must equal 1970-01-01T00:00:00Z');
  }
  assertArray(value.creationInfo.creators, `${label}.creationInfo.creators`, 1);
  for (const [index, creator] of value.creationInfo.creators.entries()) {
    assertString(creator, `${label}.creationInfo.creators[${index}]`, {
      max: 256,
      pattern: /^Tool: [A-Za-z0-9._/+@ -]+$/,
    });
  }
  assertStrictlySortedUnique(
    value.creationInfo.creators.map((creator) => ({ creator })),
    (entry) => entry.creator,
    `${label}.creationInfo.creators`,
  );
  if (Object.hasOwn(value.creationInfo, 'licenseListVersion')) {
    assertString(value.creationInfo.licenseListVersion, `${label}.creationInfo.licenseListVersion`, {
      max: 32,
      pattern: /^[0-9]+\.[0-9]+\.[0-9]+$/,
    });
  }

  assertArray(value.packages, `${label}.packages`, 1);
  value.packages.forEach((entry, index) =>
    validateSpdxPackage(entry, `${label}.packages[${index}]`),
  );
  assertStrictlySortedUnique(value.packages, (entry) => entry.SPDXID, `${label}.packages`);
  if (value.packages.length !== statement.sbom.packageCount) {
    fail(
      `${label}.packages`,
      `count ${value.packages.length} does not match statement count ${statement.sbom.packageCount}`,
    );
  }
  const packagesById = new Map(value.packages.map((entry) => [entry.SPDXID, entry]));
  const packageIds = new Set(packagesById.keys());

  if (Object.hasOwn(value, 'documentDescribes')) {
    assertArray(value.documentDescribes, `${label}.documentDescribes`, 1);
    value.documentDescribes.forEach((id, index) =>
      assertString(id, `${label}.documentDescribes[${index}]`, {
        pattern: SPDX_PACKAGE_ID_RE,
      }),
    );
    assertStrictlySortedUnique(
      value.documentDescribes.map((id) => ({ id })),
      (entry) => entry.id,
      `${label}.documentDescribes`,
    );
    for (const id of value.documentDescribes) {
      if (!packageIds.has(id)) fail(`${label}.documentDescribes`, `unknown package ${id}`);
    }
  }

  assertArray(value.relationships, `${label}.relationships`, 1);
  for (const [index, relationship] of value.relationships.entries()) {
    const itemLabel = `${label}.relationships[${index}]`;
    exactKeys(
      relationship,
      ['spdxElementId', 'relationshipType', 'relatedSpdxElement'],
      [],
      itemLabel,
    );
    assertString(relationship.spdxElementId, `${itemLabel}.spdxElementId`, {
      pattern: SPDX_ID_RE,
    });
    assertString(relationship.relatedSpdxElement, `${itemLabel}.relatedSpdxElement`, {
      pattern: SPDX_ID_RE,
    });
    if (!['DESCRIBES', 'DEPENDS_ON'].includes(relationship.relationshipType)) {
      fail(`${itemLabel}.relationshipType`, 'must be DESCRIBES or DEPENDS_ON');
    }
    for (const id of [relationship.spdxElementId, relationship.relatedSpdxElement]) {
      if (id !== 'SPDXRef-DOCUMENT' && !packageIds.has(id)) {
        fail(itemLabel, `references unknown SPDX ID ${id}`);
      }
    }
    if (
      relationship.relationshipType === 'DESCRIBES' &&
      relationship.spdxElementId !== 'SPDXRef-DOCUMENT'
    ) {
      fail(itemLabel, 'DESCRIBES must originate at SPDXRef-DOCUMENT');
    }
    if (
      relationship.relationshipType === 'DEPENDS_ON' &&
      relationship.spdxElementId === 'SPDXRef-DOCUMENT'
    ) {
      fail(itemLabel, 'DEPENDS_ON must originate at a package');
    }
  }
  assertStrictlySortedUnique(value.relationships, relationshipKey, `${label}.relationships`);

  const describedIds = new Set(value.documentDescribes ?? []);
  for (const relationship of value.relationships) {
    if (relationship.relationshipType === 'DESCRIBES') {
      describedIds.add(relationship.relatedSpdxElement);
    }
  }
  if (describedIds.size === 0) fail(label, 'must describe at least one artifact package');

  const artifactDigests = new Map();
  for (const artifact of statement.artifacts) {
    const digest = artifact.sha256.slice(7);
    if (artifactDigests.has(digest)) {
      fail(
        label,
        `statement artifacts ${artifactDigests.get(digest)} and ${artifact.path} ` +
          `share digest ${digest}; artifact identity is ambiguous`,
      );
    }
    artifactDigests.set(digest, artifact.path);
  }

  const artifactDigestOwners = new Map(
    [...artifactDigests.keys()].map((digest) => [digest, []]),
  );
  for (const packageRecord of value.packages) {
    for (const checksum of packageRecord.checksums ?? []) {
      if (artifactDigestOwners.has(checksum.checksumValue)) {
        artifactDigestOwners.get(checksum.checksumValue).push(packageRecord.SPDXID);
      }
    }
  }

  const describedArtifactDigests = new Set();
  for (const describedId of describedIds) {
    const packageRecord = packagesById.get(describedId);
    const checksums = packageRecord?.checksums ?? [];
    if (checksums.length !== 1) {
      fail(label, `described package ${describedId} must bind one statement artifact digest`);
    }
    const digest = checksums[0].checksumValue;
    if (!artifactDigests.has(digest)) {
      fail(
        label,
        `described package ${describedId} checksum does not name a statement artifact`,
      );
    }
    if (describedArtifactDigests.has(digest)) {
      fail(label, `multiple described packages bind statement artifact digest ${digest}`);
    }
    describedArtifactDigests.add(digest);
  }

  const missingArtifactDigests = [...artifactDigests.keys()].filter(
    (digest) => !describedArtifactDigests.has(digest),
  );
  if (
    describedArtifactDigests.size !== artifactDigests.size ||
    missingArtifactDigests.length > 0
  ) {
    fail(
      label,
      `described artifact digests must exactly equal statement artifacts; missing ` +
        `${missingArtifactDigests.join(', ') || 'none'}`,
    );
  }
  for (const [digest, artifactPath] of artifactDigests) {
    const owners = artifactDigestOwners.get(digest);
    if (owners.length !== 1) {
      fail(
        label,
        `statement artifact ${artifactPath} digest ${digest} has ${owners.length} ` +
          'SPDX package checksum owners; artifact identity is ambiguous',
      );
    }
    if (!describedIds.has(owners[0])) {
      fail(
        label,
        `statement artifact ${artifactPath} is bound by non-described package ${owners[0]}`,
      );
    }
  }

  const dependedOnIds = new Set(
    value.relationships
      .filter((entry) => entry.relationshipType === 'DEPENDS_ON')
      .map((entry) => entry.relatedSpdxElement),
  );
  for (const packageRecord of value.packages) {
    if (!describedIds.has(packageRecord.SPDXID) && !dependedOnIds.has(packageRecord.SPDXID)) {
      fail(label, `runtime package ${packageRecord.SPDXID} is absent from dependency relationships`);
    }
  }
  if (value.packages.length <= describedIds.size) {
    fail(label, 'must include at least one locked runtime dependency package');
  }

  const namespaceDigest = namespace[2];
  const contentDigests = new Set([
    statement.artifactSetDigest.slice(7),
    statement.checksumInventory.sha256.slice(7),
    ...statement.artifacts.map((entry) => entry.sha256.slice(7)),
  ]);
  if (!contentDigests.has(namespaceDigest)) {
    fail(`${label}.documentNamespace`, 'suffix is not derived from declared component content');
  }
  return value;
}

export function verifyComponentDirectory(componentRoot, expectedComponent) {
  const resolvedRoot = path.resolve(componentRoot);
  let rootInformation;
  try {
    rootInformation = fs.lstatSync(resolvedRoot);
  } catch (error) {
    fail(componentRoot, `cannot read component directory: ${error.message}`);
  }
  if (rootInformation.isSymbolicLink() || !rootInformation.isDirectory()) {
    fail(componentRoot, 'component root must be a real directory');
  }
  const statementPath = path.join(resolvedRoot, 'component-statement.json');
  assertRegularFile(statementPath, 'component-statement.json');
  const statementDocument = readCanonicalJson(statementPath, 'component-statement.json');
  const statement = validateComponentStatement(
    statementDocument.value,
    'component-statement.json',
  );
  if (expectedComponent && statement.component !== expectedComponent) {
    fail(
      'component-statement.json.component',
      `substituted component ${statement.component}; expected ${expectedComponent}`,
    );
  }

  const checksumPath = resolveContained(
    resolvedRoot,
    statement.checksumInventory.path,
    'checksumInventory.path',
  );
  const sbomPath = resolveContained(resolvedRoot, statement.sbom.path, 'sbom.path');
  if (path.resolve(statementPath) === checksumPath || path.resolve(statementPath) === sbomPath) {
    fail('component statement', 'evidence path collides with component-statement.json');
  }
  const actualChecksumEvidence = evidenceFor(checksumPath, statement.checksumInventory.path);
  for (const field of ['size', 'sha256']) {
    if (actualChecksumEvidence[field] !== statement.checksumInventory[field]) {
      fail(`checksumInventory.${field}`, 'does not match the evidence file');
    }
  }
  const actualSbomEvidence = evidenceFor(sbomPath, statement.sbom.path);
  for (const field of ['size', 'sha256']) {
    if (actualSbomEvidence[field] !== statement.sbom[field]) {
      fail(`sbom.${field}`, 'does not match the evidence file');
    }
  }

  const allFiles = listRegularFiles(resolvedRoot);
  const evidencePaths = new Set([
    'component-statement.json',
    statement.checksumInventory.path,
    statement.sbom.path,
  ]);
  const actualArtifactPaths = allFiles.filter((file) => !evidencePaths.has(file));
  const declaredArtifactPaths = statement.artifacts.map((entry) => entry.path);
  if (
    actualArtifactPaths.length !== declaredArtifactPaths.length ||
    actualArtifactPaths.some((file, index) => file !== declaredArtifactPaths[index])
  ) {
    fail(
      'component artifacts',
      `missing/extra file mismatch; declared ${JSON.stringify(declaredArtifactPaths)}, actual ${JSON.stringify(actualArtifactPaths)}`,
    );
  }
  for (const artifact of statement.artifacts) {
    const artifactPath = resolveContained(resolvedRoot, artifact.path, `artifact ${artifact.path}`);
    const actual = evidenceFor(artifactPath, artifact.path);
    if (actual.size !== artifact.size) fail(artifact.path, 'size drift');
    if (actual.sha256 !== artifact.sha256) fail(artifact.path, 'digest drift');
  }

  const checksumSource = fs.readFileSync(checksumPath, 'utf8');
  const checksumEntries = parseChecksumInventory(
    checksumSource,
    statement.checksumInventory.path,
  );
  if (checksumEntries.length !== statement.artifacts.length) {
    fail(statement.checksumInventory.path, 'does not cover the complete artifact inventory');
  }
  for (const [index, entry] of checksumEntries.entries()) {
    const artifact = statement.artifacts[index];
    if (entry.path !== artifact.path || entry.sha256 !== artifact.sha256) {
      fail(statement.checksumInventory.path, `entry ${index} does not match statement artifacts`);
    }
  }

  const sbomDocument = readCanonicalJson(sbomPath, statement.sbom.path);
  validateSpdxDocument(sbomDocument.value, statement, statement.sbom.path);
  return {
    root: resolvedRoot,
    statement,
    statementEvidence: {
      path: 'component-statement.json',
      size: Buffer.byteLength(statementDocument.source),
      sha256: sha256Bytes(statementDocument.source),
    },
    checksumInventory: checksumEntries,
    sbom: sbomDocument.value,
  };
}

function sameCanonical(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function assertSupportedArchiveCompatibility(archive, label) {
  if (archive.manifestSchemaDigest !== ARCHIVE_MANIFEST_SCHEMA_DIGEST) {
    fail(`${label}.manifestSchemaDigest`, 'does not match the accepted Archive manifest schema');
  }
  if (archive.schemaSqlDigest !== ARCHIVE_SCHEMA_SQL_DIGEST) {
    fail(`${label}.schemaSqlDigest`, 'does not match the accepted Archive SQL schema');
  }
  const manifestRange = archive.manifestSchemaVersion;
  if (
    manifestRange.minimum > SUPPORTED_ARCHIVE_MANIFEST_SCHEMA ||
    manifestRange.maximum < SUPPORTED_ARCHIVE_MANIFEST_SCHEMA
  ) {
    fail(`${label}.manifestSchemaVersion`, 'does not include the accepted schema version');
  }
  const sqliteRange = archive.sqliteSchemaVersion;
  if (
    sqliteRange.minimum > SUPPORTED_ARCHIVE_SQLITE_SCHEMA ||
    sqliteRange.maximum < SUPPORTED_ARCHIVE_SQLITE_SCHEMA
  ) {
    fail(`${label}.sqliteSchemaVersion`, 'does not include the accepted schema version');
  }
}

export function assembleCompatibilityManifest(componentRoots) {
  if (!Array.isArray(componentRoots) || componentRoots.length !== 3) {
    fail('assembly', 'requires exactly three component directories');
  }
  const validated = componentRoots.map((root) => verifyComponentDirectory(root));
  validated.sort((left, right) => left.statement.component.localeCompare(right.statement.component));
  const componentNames = validated.map((entry) => entry.statement.component);
  if (!sameCanonical(componentNames, COMPONENTS)) {
    fail('assembly', `requires exactly ${COMPONENTS.join(', ')}`);
  }
  const first = validated[0].statement;
  for (const entry of validated.slice(1)) {
    const statement = entry.statement;
    if (!sameCanonical(statement.source, first.source)) {
      fail('assembly', 'mixed source revision/tree identities');
    }
    if (!sameCanonical(statement.target, first.target)) {
      fail('assembly', 'mixed target platforms');
    }
    if (!sameCanonical(statement.compatibility.archive, first.compatibility.archive)) {
      fail('assembly', 'mixed Archive compatibility declarations');
    }
  }
  assertSupportedArchiveCompatibility(first.compatibility.archive, 'assembly.archive');
  const backend = validated.find((entry) => entry.statement.component === 'backend').statement;
  const frontend = validated.find((entry) => entry.statement.component === 'frontend').statement;
  const updater = validated.find((entry) => entry.statement.component === 'updater').statement;
  if (
    backend.compatibility.openapiDigest !== OPENAPI_DIGEST ||
    frontend.compatibility.openapiDigest !== OPENAPI_DIGEST ||
    backend.compatibility.openapiDigest !== frontend.compatibility.openapiDigest
  ) {
    fail('assembly', 'Backend/Frontend OpenAPI digests disagree or drift from accepted OpenAPI');
  }
  if (updater.compatibility.openapiDigest !== null) {
    fail('assembly', 'Updater must not claim an OpenAPI dependency');
  }

  const manifest = {
    schemaVersion: 1,
    source: first.source,
    target: first.target,
    compatibility: {
      archive: first.compatibility.archive,
      openapiDigest: OPENAPI_DIGEST,
    },
    components: validated.map((entry) => ({
      component: entry.statement.component,
      statement: entry.statementEvidence,
      artifacts: entry.statement.artifacts,
      artifactSetDigest: entry.statement.artifactSetDigest,
      checksumInventory: entry.statement.checksumInventory,
      sbom: entry.statement.sbom,
    })),
  };
  validateCompatibilityManifest(manifest);
  return { manifest, canonical: canonicalJson(manifest), components: validated };
}

export function validateCompatibilityManifest(value, label = 'compatibility manifest') {
  exactKeys(value, ['schemaVersion', 'source', 'target', 'compatibility', 'components'], [], label);
  if (value.schemaVersion !== 1) fail(`${label}.schemaVersion`, 'must equal 1');
  validateSource(value.source, `${label}.source`);
  validateTarget(value.target, `${label}.target`);
  exactKeys(value.compatibility, ['archive', 'openapiDigest'], [], `${label}.compatibility`);
  validateArchiveCompatibility(value.compatibility.archive, `${label}.compatibility.archive`);
  assertSupportedArchiveCompatibility(value.compatibility.archive, `${label}.compatibility.archive`);
  if (value.compatibility.openapiDigest !== OPENAPI_DIGEST) {
    fail(`${label}.compatibility.openapiDigest`, 'does not match accepted OpenAPI');
  }
  assertArray(value.components, `${label}.components`, 3);
  if (value.components.length !== 3) fail(`${label}.components`, 'must contain exactly three items');
  for (const [index, component] of value.components.entries()) {
    const itemLabel = `${label}.components[${index}]`;
    exactKeys(
      component,
      ['component', 'statement', 'artifacts', 'artifactSetDigest', 'checksumInventory', 'sbom'],
      [],
      itemLabel,
    );
    if (!COMPONENTS.includes(component.component)) {
      fail(`${itemLabel}.component`, 'has an invalid component');
    }
    validateEvidence(component.statement, `${itemLabel}.statement`);
    validateArtifacts(component.artifacts, `${itemLabel}.artifacts`);
    assertDigest(component.artifactSetDigest, `${itemLabel}.artifactSetDigest`);
    if (component.artifactSetDigest !== canonicalJsonDigest(component.artifacts)) {
      fail(`${itemLabel}.artifactSetDigest`, 'does not match canonical artifacts');
    }
    validateEvidence(component.checksumInventory, `${itemLabel}.checksumInventory`);
    validateSbomEvidence(component.sbom, `${itemLabel}.sbom`);
    const namespace = SPDX_NAMESPACE_RE.exec(component.sbom.documentNamespace);
    if (!namespace || namespace[1] !== component.component) {
      fail(`${itemLabel}.sbom.documentNamespace`, 'does not match component');
    }
  }
  assertStrictlySortedUnique(value.components, (entry) => entry.component, `${label}.components`);
  if (!sameCanonical(value.components.map((entry) => entry.component), COMPONENTS)) {
    fail(`${label}.components`, `must contain exactly ${COMPONENTS.join(', ')}`);
  }
  assertNoNondeterministicStatementValues(value, label);
  return value;
}
