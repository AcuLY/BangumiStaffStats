#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { canonicalJson, canonicalJsonDigest } from '../../contracts/artifacts/lib/canonical-json.mjs';
import {
  ensureGeneratedDirectory as ensureSafeGeneratedDirectory,
  removeGeneratedPath as removeSafeGeneratedPath,
  requireGeneratedPath as requireSafeGeneratedPath,
} from '../../contracts/artifacts/lib/generated-path.mjs';
import {
  ARCHIVE_MANIFEST_SCHEMA_DIGEST,
  ARCHIVE_SCHEMA_SQL_DIGEST,
  OPENAPI_DIGEST,
  sha256Bytes,
  sha256File,
  verifyComponentDirectory,
} from '../../contracts/artifacts/lib/validation.mjs';

export const FRONTEND_ROOT = path.resolve(import.meta.dirname, '..');
export const REPOSITORY_ROOT = path.resolve(FRONTEND_ROOT, '..');
export const BUILD_ROOT = path.resolve(import.meta.dirname);
export const TMP_ROOT = path.join(BUILD_ROOT, '.tmp');
export const NODE_VERSION = '24.18.0';
export const NPM_VERSION = '11.16.0';
export const VITE_VERSION = '8.1.5';

const TAR_BLOCK_SIZE = 512;
const FORBIDDEN_PATH_RE = /(?:fixture|snapshot|workbench|test|coverage)/i;
const DIRECT_UPSTREAM_RE = /https?:\/\/(?:api\.)?(?:bgm\.tv|bangumi\.tv)\/v0\//i;

export class FrontendArtifactError extends Error {}

function fail(message) {
  throw new FrontendArtifactError(message);
}

function requireExactToolchain() {
  if (process.version !== `v${NODE_VERSION}`) {
    fail(`requires Node v${NODE_VERSION}, received ${process.version}`);
  }
}

function assertSafePath(value, label = 'path') {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.startsWith('/') ||
    value.includes('\\') ||
    value.includes('\0')
  ) {
    fail(`${label} must be a normalized relative POSIX path`);
  }
  const parts = value.split('/');
  if (
    parts.some(
      (part) =>
        part === '' ||
        part === '.' ||
        part === '..' ||
        !/^[A-Za-z0-9._-]+$/.test(part),
    )
  ) {
    fail(`${label} contains an unsafe path segment: ${value}`);
  }
  return value;
}

function generatedPathOptions(label) {
  return {
    repositoryRoot: REPOSITORY_ROOT,
    temporaryRoot: TMP_ROOT,
    label,
  };
}

export function requireUnderTmp(candidate, label = 'generated path') {
  try {
    return requireSafeGeneratedPath(candidate, generatedPathOptions(label));
  } catch (error) {
    fail(error.message);
  }
}

export function ensureUnderTmpDirectory(candidate, label = 'generated directory') {
  try {
    return ensureSafeGeneratedDirectory(candidate, generatedPathOptions(label));
  } catch (error) {
    fail(error.message);
  }
}

export function removeUnderTmp(candidate, label = 'generated path') {
  try {
    removeSafeGeneratedPath(candidate, generatedPathOptions(label));
  } catch (error) {
    fail(error.message);
  }
}

function ensureFreshDirectory(directory) {
  const resolved = requireUnderTmp(directory);
  if (fs.existsSync(resolved)) fail(`refusing to overwrite existing output ${resolved}`);
  return ensureUnderTmpDirectory(resolved);
}

function walkRegularFiles(root) {
  const result = [];
  function visit(directory, prefix) {
    const entries = fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name, 'en'),
    );
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      assertSafePath(relative, 'artifact path');
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) fail(`symlink is forbidden in static output: ${relative}`);
      if (entry.isDirectory()) {
        visit(absolute, relative);
      } else if (entry.isFile()) {
        result.push({ path: relative, absolute });
      } else {
        fail(`special file is forbidden in static output: ${relative}`);
      }
    }
  }
  const information = fs.lstatSync(root);
  if (information.isSymbolicLink() || !information.isDirectory()) {
    fail(`static root must be a real directory: ${root}`);
  }
  visit(root, '');
  return result;
}

function validateStaticTree(distRoot) {
  const files = walkRegularFiles(distRoot);
  const names = files.map((entry) => entry.path);
  if (names.filter((name) => name === 'index.html').length !== 1) {
    fail('static output must contain exactly one index.html');
  }
  if (names.some((name) => name.endsWith('.map'))) {
    fail('source maps are forbidden in the static artifact');
  }
  if (names.some((name) => FORBIDDEN_PATH_RE.test(name))) {
    fail('static output contains a fixture/prototype/test path');
  }
  const textual = files
    .filter((entry) => /\.(?:css|html|js|json|svg|txt)$/u.test(entry.path))
    .map((entry) => fs.readFileSync(entry.absolute, 'utf8'))
    .join('\n');
  if (DIRECT_UPSTREAM_RE.test(textual)) {
    fail('static output contains a direct Bangumi API target');
  }
  return files;
}

function writeOctal(header, offset, length, value) {
  const encoded = value.toString(8).padStart(length - 1, '0');
  if (encoded.length > length - 1) fail(`tar numeric field overflow: ${value}`);
  header.write(encoded, offset, length - 1, 'ascii');
  header[offset + length - 1] = 0;
}

function splitTarPath(relative) {
  const bytes = Buffer.byteLength(relative, 'utf8');
  if (bytes <= 100) return { name: relative, prefix: '' };
  const separators = [...relative.matchAll(/\//g)].map((match) => match.index);
  for (const separator of separators.reverse()) {
    const prefix = relative.slice(0, separator);
    const name = relative.slice(separator + 1);
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100) {
      return { name, prefix };
    }
  }
  fail(`tar path is too long for normalized ustar: ${relative}`);
}

function tarHeader(relative, size) {
  const { name, prefix } = splitTarPath(relative);
  const header = Buffer.alloc(TAR_BLOCK_SIZE);
  header.write(name, 0, 100, 'utf8');
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header[156] = '0'.charCodeAt(0);
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  if (prefix) header.write(prefix, 345, 155, 'utf8');
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  const encoded = checksum.toString(8).padStart(6, '0');
  header.write(encoded, 148, 6, 'ascii');
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

export function normalizedTarBytes(distRoot) {
  const files = validateStaticTree(distRoot);
  const chunks = [];
  for (const entry of files) {
    const contents = fs.readFileSync(entry.absolute);
    chunks.push(tarHeader(entry.path, contents.length), contents);
    const padding = (TAR_BLOCK_SIZE - (contents.length % TAR_BLOCK_SIZE)) % TAR_BLOCK_SIZE;
    if (padding) chunks.push(Buffer.alloc(padding));
  }
  chunks.push(Buffer.alloc(TAR_BLOCK_SIZE * 2));
  return Buffer.concat(chunks);
}

function decodeTarString(block, offset, length) {
  const end = block.indexOf(0, offset);
  return block
    .subarray(offset, end === -1 || end > offset + length ? offset + length : end)
    .toString('utf8');
}

function decodeTarOctal(block, offset, length, label) {
  const value = decodeTarString(block, offset, length).trim();
  if (!/^[0-7]+$/.test(value)) fail(`invalid normalized tar ${label}`);
  return Number.parseInt(value, 8);
}

export function readNormalizedTar(tarBytes) {
  if (!Buffer.isBuffer(tarBytes) || tarBytes.length % TAR_BLOCK_SIZE !== 0) {
    fail('tar bytes must be a whole number of 512-byte blocks');
  }
  const entries = [];
  let offset = 0;
  while (offset + TAR_BLOCK_SIZE <= tarBytes.length) {
    const header = tarBytes.subarray(offset, offset + TAR_BLOCK_SIZE);
    if (header.every((byte) => byte === 0)) {
      const trailer = tarBytes.subarray(offset);
      if (trailer.length < TAR_BLOCK_SIZE * 2 || !trailer.every((byte) => byte === 0)) {
        fail('normalized tar has a malformed zero trailer');
      }
      return entries;
    }
    const checksumBytes = Buffer.from(header);
    checksumBytes.fill(0x20, 148, 156);
    const expectedChecksum = checksumBytes.reduce((sum, byte) => sum + byte, 0);
    const actualChecksum = decodeTarOctal(header, 148, 8, 'checksum');
    if (actualChecksum !== expectedChecksum) fail('normalized tar checksum mismatch');
    if (decodeTarOctal(header, 100, 8, 'mode') !== 0o644) {
      fail('normalized tar file mode must be 0644');
    }
    if (
      decodeTarOctal(header, 108, 8, 'uid') !== 0 ||
      decodeTarOctal(header, 116, 8, 'gid') !== 0 ||
      decodeTarOctal(header, 136, 12, 'mtime') !== 0
    ) {
      fail('normalized tar identity and time fields must be zero');
    }
    if (header[156] !== '0'.charCodeAt(0)) fail('normalized tar permits regular files only');
    if (decodeTarString(header, 257, 6) !== 'ustar') fail('normalized tar must use ustar');
    const name = decodeTarString(header, 0, 100);
    const prefix = decodeTarString(header, 345, 155);
    const relative = prefix ? `${prefix}/${name}` : name;
    assertSafePath(relative, 'tar entry');
    const size = decodeTarOctal(header, 124, 12, 'size');
    const dataStart = offset + TAR_BLOCK_SIZE;
    const dataEnd = dataStart + size;
    if (dataEnd > tarBytes.length) fail(`truncated tar entry: ${relative}`);
    entries.push({ path: relative, bytes: Buffer.from(tarBytes.subarray(dataStart, dataEnd)) });
    offset = dataStart + Math.ceil(size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
  }
  fail('normalized tar is missing its zero trailer');
}

function sha256IntegrityToHex(integrity) {
  if (typeof integrity !== 'string' || !integrity.startsWith('sha256-')) return undefined;
  const decoded = Buffer.from(integrity.slice('sha256-'.length), 'base64');
  return decoded.length === 32 ? decoded.toString('hex') : undefined;
}

function resolveLockedDependency(packages, fromPath, dependencyName) {
  const segments = fromPath ? fromPath.split('/') : [];
  for (let index = segments.length; index >= 0; index -= 1) {
    const prefix = segments.slice(0, index).join('/');
    const candidate = prefix
      ? `${prefix}/node_modules/${dependencyName}`
      : `node_modules/${dependencyName}`;
    if (Object.hasOwn(packages, candidate)) return candidate;
  }
  fail(`package-lock cannot resolve ${dependencyName} from ${fromPath || '<root>'}`);
}

export function lockedRuntimePackages(packageLockPath = path.join(FRONTEND_ROOT, 'package-lock.json')) {
  const lock = JSON.parse(fs.readFileSync(packageLockPath, 'utf8'));
  if (lock.lockfileVersion !== 3 || !lock.packages || !lock.packages['']) {
    fail('package-lock must use npm lockfileVersion 3 with a root package');
  }
  const packages = lock.packages;
  const rootDependencies = packages[''].dependencies;
  if (!rootDependencies || Object.keys(rootDependencies).length === 0) {
    fail('package-lock root runtime dependency set is empty');
  }
  const queue = Object.keys(rootDependencies)
    .sort()
    .map((name) => resolveLockedDependency(packages, '', name));
  const seen = new Set();
  const result = [];
  while (queue.length > 0) {
    const packagePath = queue.shift();
    if (seen.has(packagePath)) continue;
    seen.add(packagePath);
    const record = packages[packagePath];
    if (!record || typeof record.version !== 'string') {
      fail(`runtime package lacks a locked version: ${packagePath}`);
    }
    const name = packagePath.slice(packagePath.lastIndexOf('node_modules/') + 'node_modules/'.length);
    result.push({
      name,
      version: record.version,
      integrity: record.integrity,
    });
    const optionalPeers = new Set(
      Object.entries(record.peerDependenciesMeta ?? {})
        .filter(([, metadata]) => metadata?.optional === true)
        .map(([dependency]) => dependency),
    );
    const dependencies = {
      ...(record.dependencies ?? {}),
      ...(record.optionalDependencies ?? {}),
      ...Object.fromEntries(
        Object.entries(record.peerDependencies ?? {}).filter(
          ([dependency]) => !optionalPeers.has(dependency),
        ),
      ),
    };
    for (const dependency of Object.keys(dependencies).sort()) {
      const resolved = resolveLockedDependency(packages, packagePath, dependency);
      if (!seen.has(resolved)) queue.push(resolved);
    }
    queue.sort();
  }
  result.sort((left, right) =>
    `${left.name}\0${left.version}`.localeCompare(`${right.name}\0${right.version}`, 'en'),
  );
  const identities = result.map((entry) => `${entry.name}\0${entry.version}`);
  if (new Set(identities).size !== identities.length) {
    fail('runtime package closure contains duplicate package identities');
  }
  return result;
}

function stableSpdxId(value) {
  return `SPDXRef-Package-${createHash('sha256').update(value).digest('hex').slice(0, 24)}`;
}

function packagePurl(name, version) {
  const encodedName = name.startsWith('@')
    ? `%40${name.slice(1).split('/').map(encodeURIComponent).join('/')}`
    : encodeURIComponent(name);
  return `pkg:npm/${encodedName}@${encodeURIComponent(version)}`;
}

export function makeSpdx(artifact, runtimePackages) {
  const artifactId = 'SPDXRef-Package-artifact';
  const packages = [
    {
      SPDXID: artifactId,
      name: artifact.path,
      versionInfo: '1',
      downloadLocation: 'NOASSERTION',
      filesAnalyzed: false,
      checksums: [
        {
          algorithm: 'SHA256',
          checksumValue: artifact.sha256.slice('sha256:'.length),
        },
      ],
      licenseConcluded: 'NOASSERTION',
      licenseDeclared: 'NOASSERTION',
      copyrightText: 'NOASSERTION',
      primaryPackagePurpose: 'APPLICATION',
    },
  ];
  const relationships = [
    {
      spdxElementId: 'SPDXRef-DOCUMENT',
      relationshipType: 'DESCRIBES',
      relatedSpdxElement: artifactId,
    },
  ];
  for (const dependency of runtimePackages) {
    const dependencyId = stableSpdxId(`${dependency.name}@${dependency.version}`);
    const packageRecord = {
      SPDXID: dependencyId,
      name: dependency.name,
      versionInfo: dependency.version,
      downloadLocation: 'NOASSERTION',
      filesAnalyzed: false,
      licenseConcluded: 'NOASSERTION',
      licenseDeclared: 'NOASSERTION',
      copyrightText: 'NOASSERTION',
      primaryPackagePurpose: 'LIBRARY',
      externalRefs: [
        {
          referenceCategory: 'PACKAGE-MANAGER',
          referenceType: 'purl',
          referenceLocator: packagePurl(dependency.name, dependency.version),
        },
      ],
    };
    const integrity = sha256IntegrityToHex(dependency.integrity);
    if (integrity) {
      packageRecord.checksums = [{ algorithm: 'SHA256', checksumValue: integrity }];
    }
    packages.push(packageRecord);
    relationships.push({
      spdxElementId: artifactId,
      relationshipType: 'DEPENDS_ON',
      relatedSpdxElement: dependencyId,
    });
  }
  packages.sort((left, right) => left.SPDXID.localeCompare(right.SPDXID, 'en'));
  relationships.sort((left, right) =>
    `${left.spdxElementId}\0${left.relationshipType}\0${left.relatedSpdxElement}`.localeCompare(
      `${right.spdxElementId}\0${right.relationshipType}\0${right.relatedSpdxElement}`,
      'en',
    ),
  );
  return {
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name: `bangumi-staff-stats-frontend-${artifact.sha256.slice(7, 23)}`,
    documentNamespace:
      'https://spdx.bangumi-staff-stats.invalid/frontend/' +
      `sha256-${artifact.sha256.slice('sha256:'.length)}`,
    creationInfo: {
      created: '1970-01-01T00:00:00Z',
      creators: ['Tool: bgmss-frontend-build/1'],
    },
    packages,
    relationships,
  };
}

function fileEvidence(filePath, relativePath) {
  const information = fs.lstatSync(filePath);
  if (information.isSymbolicLink() || !information.isFile()) {
    fail(`evidence must be a regular file: ${relativePath}`);
  }
  return {
    path: relativePath,
    size: information.size,
    sha256: sha256File(filePath),
  };
}

function requireDigest(filePath, expected, label) {
  const actual = sha256File(filePath);
  if (actual !== expected) fail(`${label} drifted: expected ${expected}, got ${actual}`);
  return actual;
}

function writeImmutable(filePath, bytes) {
  const destination = requireUnderTmp(filePath, 'generated file');
  ensureUnderTmpDirectory(path.dirname(destination), 'generated file parent');
  requireUnderTmp(destination, 'generated file');
  fs.writeFileSync(destination, bytes, { flag: 'wx', mode: 0o444 });
  requireUnderTmp(destination, 'generated file');
}

export function packageStaticArtifact({
  distRoot,
  outputRoot,
  sourceRevision,
  sourceTree,
  targetOS = 'linux',
  targetArchitecture = 'arm64',
  packageLockPath = path.join(FRONTEND_ROOT, 'package-lock.json'),
  viteConfigPath = path.join(FRONTEND_ROOT, 'vite.config.ts'),
}) {
  requireExactToolchain();
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(sourceRevision)) {
    fail('source revision must be a lowercase Git object ID');
  }
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(sourceTree)) {
    fail('source tree must be a lowercase Git object ID');
  }
  if (
    !/^[a-z0-9][a-z0-9._-]*$/.test(targetOS) ||
    !/^[a-z0-9][a-z0-9._-]*$/.test(targetArchitecture)
  ) {
    fail('target platform must use normalized lowercase tokens');
  }
  const output = ensureFreshDirectory(outputRoot);
  const artifactsDirectory = path.join(output, 'artifacts');
  ensureUnderTmpDirectory(artifactsDirectory, 'artifacts directory');
  const artifactName = `frontend-static-${targetOS}-${targetArchitecture}.tar`;
  const artifactPath = path.join(artifactsDirectory, artifactName);
  writeImmutable(artifactPath, normalizedTarBytes(path.resolve(distRoot)));
  const artifact = {
    path: `artifacts/${artifactName}`,
    size: fs.statSync(artifactPath).size,
    sha256: sha256File(artifactPath),
  };
  const artifacts = [artifact];

  const checksumPath = path.join(output, 'SHA256SUMS');
  writeImmutable(
    checksumPath,
    `${artifact.sha256.slice('sha256:'.length)}  ${artifact.path}\n`,
  );
  const runtimePackages = lockedRuntimePackages(packageLockPath);
  const sbom = makeSpdx(artifact, runtimePackages);
  const sbomPath = path.join(output, 'frontend.spdx.json');
  writeImmutable(sbomPath, canonicalJson(sbom));

  requireDigest(
    path.join(REPOSITORY_ROOT, 'contracts', 'openapi', 'openapi.yaml'),
    OPENAPI_DIGEST,
    'OpenAPI',
  );
  requireDigest(
    path.join(
      REPOSITORY_ROOT,
      'contracts',
      'schemas',
      'archive',
      'archive-manifest.schema.json',
    ),
    ARCHIVE_MANIFEST_SCHEMA_DIGEST,
    'Archive manifest schema',
  );
  requireDigest(
    path.join(REPOSITORY_ROOT, 'contracts', 'schemas', 'archive', 'schema.sql'),
    ARCHIVE_SCHEMA_SQL_DIGEST,
    'Archive SQL schema',
  );
  const statement = {
    schemaVersion: 1,
    component: 'frontend',
    source: { revision: sourceRevision, tree: sourceTree },
    target: { os: targetOS, architecture: targetArchitecture },
    toolchain: [
      { name: 'node', version: NODE_VERSION },
      { name: 'npm', version: NPM_VERSION },
      { name: 'vite', version: VITE_VERSION },
    ],
    baseImages: [],
    inputs: [
      {
        path: 'frontend/package-lock.json',
        sha256: sha256File(packageLockPath),
      },
      {
        path: 'frontend/vite.config.ts',
        sha256: sha256File(viteConfigPath),
      },
      {
        path: 'contracts/openapi/openapi.yaml',
        sha256: OPENAPI_DIGEST,
      },
    ].sort((left, right) => left.path.localeCompare(right.path, 'en')),
    compatibility: {
      archive: {
        manifestSchemaVersion: { minimum: 1, maximum: 1 },
        sqliteSchemaVersion: { minimum: 1, maximum: 1 },
        manifestSchemaDigest: ARCHIVE_MANIFEST_SCHEMA_DIGEST,
        schemaSqlDigest: ARCHIVE_SCHEMA_SQL_DIGEST,
      },
      openapiDigest: OPENAPI_DIGEST,
    },
    artifacts,
    artifactSetDigest: canonicalJsonDigest(artifacts),
    checksumInventory: fileEvidence(checksumPath, 'SHA256SUMS'),
    sbom: {
      ...fileEvidence(sbomPath, 'frontend.spdx.json'),
      documentNamespace: sbom.documentNamespace,
      packageCount: sbom.packages.length,
    },
  };
  writeImmutable(path.join(output, 'component-statement.json'), canonicalJson(statement));
  verifyComponentDirectory(output, 'frontend');
  return output;
}

function treeInventory(root) {
  return walkRegularFiles(root).map((entry) => ({
    path: entry.path,
    size: fs.statSync(entry.absolute).size,
    sha256: sha256File(entry.absolute),
  }));
}

export function compareComponentDirectories(firstRoot, secondRoot) {
  const first = treeInventory(firstRoot);
  const second = treeInventory(secondRoot);
  if (canonicalJson(first) !== canonicalJson(second)) {
    fail('repeated component builds emitted different paths or bytes');
  }
  return first;
}

function componentTreeDigest(root) {
  return sha256Bytes(canonicalJson(treeInventory(root))).slice('sha256:'.length);
}

export function publishComponentDirectory(stageRoot, publishRoot) {
  verifyComponentDirectory(stageRoot, 'frontend');
  const root = requireUnderTmp(publishRoot, 'publish root');
  ensureUnderTmpDirectory(root, 'publish root');
  const destination = path.join(root, `sha256-${componentTreeDigest(stageRoot)}`);
  requireUnderTmp(destination, 'published component');
  if (fs.existsSync(destination)) {
    compareComponentDirectories(stageRoot, destination);
    return destination;
  }
  const temporary = `${destination}.publishing`;
  requireUnderTmp(temporary, 'temporary published component');
  if (fs.existsSync(temporary)) {
    removeUnderTmp(temporary, 'temporary published component');
  }
  fs.cpSync(stageRoot, temporary, { recursive: true });
  requireUnderTmp(temporary, 'temporary published component');
  requireUnderTmp(destination, 'published component');
  fs.renameSync(temporary, destination);
  requireUnderTmp(destination, 'published component');
  return destination;
}

function optionMap(values) {
  const result = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith('--') || value === undefined) fail('options must be --name value pairs');
    if (result.has(key)) fail(`duplicate option ${key}`);
    result.set(key, value);
  }
  return result;
}

function requiredOption(options, name) {
  const value = options.get(name);
  if (!value) fail(`missing ${name}`);
  return value;
}

function usage() {
  fail(
    'usage: artifact.mjs package --dist PATH --output build/.tmp/PATH ' +
      '--source-revision HEX --source-tree HEX [--target-os linux --target-architecture arm64] | ' +
      'verify ROOT | compare FIRST SECOND | publish STAGE build/.tmp/PUBLISH',
  );
}

function main(argv) {
  const [command, ...rest] = argv;
  if (command === 'package') {
    const options = optionMap(rest);
    const allowed = new Set([
      '--dist',
      '--output',
      '--source-revision',
      '--source-tree',
      '--target-os',
      '--target-architecture',
    ]);
    for (const key of options.keys()) if (!allowed.has(key)) fail(`unknown option ${key}`);
    const output = packageStaticArtifact({
      distRoot: requiredOption(options, '--dist'),
      outputRoot: requiredOption(options, '--output'),
      sourceRevision: requiredOption(options, '--source-revision'),
      sourceTree: requiredOption(options, '--source-tree'),
      targetOS: options.get('--target-os') ?? 'linux',
      targetArchitecture: options.get('--target-architecture') ?? 'arm64',
    });
    process.stdout.write(`${output}\n`);
    return;
  }
  if (command === 'verify' && rest.length === 1) {
    const result = verifyComponentDirectory(rest[0], 'frontend');
    process.stdout.write(`${result.statement.artifactSetDigest}\n`);
    return;
  }
  if (command === 'compare' && rest.length === 2) {
    compareComponentDirectories(rest[0], rest[1]);
    process.stdout.write('byte-identical\n');
    return;
  }
  if (command === 'publish' && rest.length === 2) {
    process.stdout.write(`${publishComponentDirectory(rest[0], rest[1])}\n`);
    return;
  }
  usage();
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`frontend artifact error: ${error.message}\n`);
    process.exitCode = 1;
  }
}
