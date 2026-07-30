import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  assertCanonicalJson,
  canonicalJsonDigest,
} from './canonical-json.mjs';
import { parseJsonStrict } from './strict-json.mjs';
import {
  assertSafeRelativePath,
  sha256Bytes,
} from './validation.mjs';

export const PRODUCER_RUNTIME_INPUTS_FILE_COUNT = 42;
export const PRODUCER_RUNTIME_INPUTS_LOGICAL_PATH =
  'contracts/producer-runtime-inputs-v1';
export const PRODUCER_RUNTIME_INPUTS_MANIFEST_PATH =
  'contracts/artifacts/producer-runtime-inputs-v1.json';

const ARCHIVE_INDEX_PATH = 'contracts/goldens/archive/index.json';
const ARCHIVE_GOLDEN_ROOT = 'contracts/goldens/archive';
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/u;
const EXPLICIT_RUNTIME_INPUTS = Object.freeze([
  'contracts/schemas/archive/archive-manifest.schema.json',
  'contracts/schemas/archive/compatibility-matrix.json',
  'contracts/schemas/archive/current-pointer.schema.json',
  'contracts/schemas/archive/data-version-input.schema.json',
  'contracts/schemas/archive/fixture-index.schema.json',
  'contracts/schemas/archive/schema.sql',
  'contracts/schemas/catalog/display-config.schema.json',
  'contracts/schemas/catalog/quality-report.schema.json',
  'contracts/schemas/catalog/staff-set-config.schema.json',
]);

export class ProducerRuntimeInputsError extends Error {}

function fail(message) {
  throw new ProducerRuntimeInputsError(message);
}

function assertObject(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
}

function assertExactKeys(value, expected, label) {
  assertObject(value, label);
  const actual = Object.keys(value).sort();
  const canonicalExpected = [...expected].sort();
  if (
    actual.length !== canonicalExpected.length ||
    actual.some((key, index) => key !== canonicalExpected[index])
  ) {
    fail(
      `${label} must contain exactly ${canonicalExpected.join(', ')}`,
    );
  }
}

function assertSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(`${label} must be a nonnegative safe integer`);
  }
}

function assertDigest(value, label) {
  if (typeof value !== 'string' || !DIGEST_RE.test(value)) {
    fail(`${label} must be a lowercase SHA-256 digest`);
  }
}

function canonicalRepositoryRoot(repositoryRoot) {
  if (typeof repositoryRoot !== 'string' || repositoryRoot.length === 0) {
    fail('repository root must be an explicit canonical path');
  }
  const requested = path.resolve(repositoryRoot);
  if (requested !== repositoryRoot) {
    fail(`repository root must be absolute and normalized: ${requested}`);
  }
  let information;
  try {
    information = fs.lstatSync(requested);
  } catch (error) {
    fail(`repository root is unavailable: ${error.message}`);
  }
  if (information.isSymbolicLink() || !information.isDirectory()) {
    fail('repository root must be a real directory');
  }
  const canonical = fs.realpathSync.native(requested);
  if (canonical !== requested) {
    fail(`repository root must use its canonical path: ${canonical}`);
  }
  const gitRoot = runGit(canonical, ['rev-parse', '--show-toplevel'])
    .stdout.toString('utf8')
    .trim();
  if (gitRoot !== canonical || fs.realpathSync.native(gitRoot) !== canonical) {
    fail(`repository root is not the Git checkout root: ${canonical}`);
  }
  return canonical;
}

function gitEnvironment() {
  const environment = { ...process.env, GIT_LITERAL_PATHSPECS: '1' };
  for (const name of [
    'GIT_ALTERNATE_OBJECT_DIRECTORIES',
    'GIT_COMMON_DIR',
    'GIT_DIR',
    'GIT_INDEX_FILE',
    'GIT_OBJECT_DIRECTORY',
    'GIT_WORK_TREE',
  ]) {
    delete environment[name];
  }
  return environment;
}

function runGit(repositoryRoot, arguments_) {
  const result = spawnSync('git', arguments_, {
    cwd: repositoryRoot,
    env: gitEnvironment(),
    encoding: null,
    maxBuffer: 1024 * 1024,
  });
  if (result.error) {
    fail(`git ${arguments_.join(' ')} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(
      `git ${arguments_.join(' ')} failed: ` +
        `${result.stderr.toString('utf8').trim() || `status ${result.status}`}`,
    );
  }
  return result;
}

function assertSourcePath(repositoryRoot, relativePath) {
  assertSafeRelativePath(relativePath, 'producer runtime input path');
  let current = repositoryRoot;
  const segments = relativePath.split('/');
  let information;
  for (const [index, segment] of segments.entries()) {
    current = path.join(current, segment);
    try {
      information = fs.lstatSync(current);
    } catch (error) {
      fail(`producer runtime input is missing: ${relativePath} (${error.message})`);
    }
    if (information.isSymbolicLink()) {
      fail(`producer runtime input crosses a symlink: ${relativePath}`);
    }
    if (index < segments.length - 1 && !information.isDirectory()) {
      fail(`producer runtime input parent is not a directory: ${relativePath}`);
    }
    if (index === segments.length - 1 && !information.isFile()) {
      fail(`producer runtime input is not a regular file: ${relativePath}`);
    }
    if (fs.realpathSync.native(current) !== current) {
      fail(`producer runtime input escapes the canonical root: ${relativePath}`);
    }
  }
  if (information.nlink !== 1) {
    fail(`producer runtime input must have exactly one hard link: ${relativePath}`);
  }
  if ((information.mode & 0o111) !== 0) {
    fail(`producer runtime input has executable mode drift: ${relativePath}`);
  }
  return { absolute: current, information };
}

function readSourceBytes(repositoryRoot, relativePath) {
  const inspected = assertSourcePath(repositoryRoot, relativePath);
  const noFollow = fs.constants.O_NOFOLLOW ?? 0;
  let descriptor;
  try {
    descriptor = fs.openSync(
      inspected.absolute,
      fs.constants.O_RDONLY | noFollow,
    );
    const before = fs.fstatSync(descriptor);
    if (
      !before.isFile() ||
      before.nlink !== 1 ||
      (before.mode & 0o111) !== 0 ||
      before.dev !== inspected.information.dev ||
      before.ino !== inspected.information.ino
    ) {
      fail(`producer runtime input changed during inspection: ${relativePath}`);
    }
    const bytes = fs.readFileSync(descriptor);
    const after = fs.fstatSync(descriptor);
    if (
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.mode !== before.mode ||
      after.nlink !== before.nlink ||
      after.size !== before.size ||
      bytes.length !== after.size
    ) {
      fail(`producer runtime input changed while reading: ${relativePath}`);
    }
    return bytes;
  } catch (error) {
    if (error instanceof ProducerRuntimeInputsError) throw error;
    fail(`producer runtime input cannot be read safely: ${relativePath} (${error.message})`);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function parseArchiveIndex(repositoryRoot) {
  const bytes = readSourceBytes(repositoryRoot, ARCHIVE_INDEX_PATH);
  let index;
  try {
    index = parseJsonStrict(bytes.toString('utf8'), ARCHIVE_INDEX_PATH);
  } catch (error) {
    fail(`Archive fixture index is invalid: ${error.message}`);
  }
  assertExactKeys(index, ['indexSchemaVersion', 'files'], 'Archive fixture index');
  if (index.indexSchemaVersion !== 1) {
    fail('Archive fixture index schemaVersion must equal 1');
  }
  if (!Array.isArray(index.files) || index.files.length !== 32) {
    fail('Archive fixture index must declare exactly 32 files');
  }
  const entries = new Map();
  for (const [indexNumber, entry] of index.files.entries()) {
    const label = `Archive fixture index files[${indexNumber}]`;
    assertObject(entry, label);
    if (!Object.hasOwn(entry, 'path') || !Object.hasOwn(entry, 'digest')) {
      fail(`${label} must declare path and digest`);
    }
    assertSafeRelativePath(entry.path, `${label}.path`);
    assertDigest(entry.digest, `${label}.digest`);
    const repositoryPath = `${ARCHIVE_GOLDEN_ROOT}/${entry.path}`;
    if (entries.has(repositoryPath)) {
      fail(`Archive fixture index contains duplicate path ${entry.path}`);
    }
    entries.set(repositoryPath, entry.digest);
  }
  return entries;
}

function deriveClosure(indexEntries) {
  const paths = [
    ARCHIVE_INDEX_PATH,
    ...indexEntries.keys(),
    ...EXPLICIT_RUNTIME_INPUTS,
  ].sort();
  if (
    paths.length !== PRODUCER_RUNTIME_INPUTS_FILE_COUNT ||
    new Set(paths).size !== paths.length
  ) {
    fail('producer runtime input closure must contain exactly 42 unique paths');
  }
  return paths;
}

function validateManifestShape(manifest) {
  assertExactKeys(
    manifest,
    ['schemaVersion', 'fileCount', 'totalSize', 'files', 'fileSetDigest'],
    'producer runtime input manifest',
  );
  if (manifest.schemaVersion !== 1) {
    fail('producer runtime input manifest schemaVersion must equal 1');
  }
  if (manifest.fileCount !== PRODUCER_RUNTIME_INPUTS_FILE_COUNT) {
    fail('producer runtime input manifest fileCount must equal 42');
  }
  assertSafeInteger(manifest.totalSize, 'producer runtime input manifest totalSize');
  assertDigest(
    manifest.fileSetDigest,
    'producer runtime input manifest fileSetDigest',
  );
  if (
    !Array.isArray(manifest.files) ||
    manifest.files.length !== PRODUCER_RUNTIME_INPUTS_FILE_COUNT
  ) {
    fail('producer runtime input manifest files must contain exactly 42 records');
  }
  let previous;
  const seen = new Set();
  for (const [index, record] of manifest.files.entries()) {
    const label = `producer runtime input manifest files[${index}]`;
    assertExactKeys(record, ['path', 'size', 'sha256'], label);
    assertSafeRelativePath(record.path, `${label}.path`);
    assertSafeInteger(record.size, `${label}.size`);
    assertDigest(record.sha256, `${label}.sha256`);
    if (seen.has(record.path)) {
      fail(`producer runtime input manifest contains duplicate path ${record.path}`);
    }
    if (
      previous !== undefined &&
      Buffer.compare(Buffer.from(previous, 'ascii'), Buffer.from(record.path, 'ascii')) >= 0
    ) {
      fail('producer runtime input manifest files must be bytewise sorted');
    }
    seen.add(record.path);
    previous = record.path;
  }
  const expectedFileSetDigest = canonicalJsonDigest(manifest.files);
  if (manifest.fileSetDigest !== expectedFileSetDigest) {
    fail(
      `producer runtime input manifest fileSetDigest must equal ${expectedFileSetDigest}`,
    );
  }
  const totalSize = manifest.files.reduce((total, record) => {
    const next = total + record.size;
    if (!Number.isSafeInteger(next)) {
      fail('producer runtime input manifest totalSize exceeds a safe integer');
    }
    return next;
  }, 0);
  if (manifest.totalSize !== totalSize) {
    fail(`producer runtime input manifest totalSize must equal ${totalSize}`);
  }
}

function assertExactClosure(manifest, expectedPaths) {
  const actualPaths = manifest.files.map((record) => record.path);
  const missing = expectedPaths.filter((entry) => !actualPaths.includes(entry));
  const extra = actualPaths.filter((entry) => !expectedPaths.includes(entry));
  if (missing.length > 0 || extra.length > 0) {
    fail(
      'producer runtime input manifest closure mismatch: ' +
        `missing=${missing.join(',') || 'none'} extra=${extra.join(',') || 'none'}`,
    );
  }
}

function assertTrackedModes(repositoryRoot, expectedPaths) {
  const output = runGit(repositoryRoot, [
    'ls-files',
    '--stage',
    '-z',
    '--',
    ...expectedPaths,
  ]).stdout;
  const records = output
    .toString('utf8')
    .split('\0')
    .filter((record) => record.length > 0);
  const tracked = new Map();
  for (const record of records) {
    const match =
      /^(100644|100755) ([0-9a-f]{40}|[0-9a-f]{64}) ([0-3])\t(.+)$/u.exec(
        record,
      );
    if (!match) fail(`Git returned an invalid runtime input record: ${record}`);
    if (match[3] !== '0') {
      fail(`producer runtime input has a non-zero Git stage: ${match[4]}`);
    }
    if (tracked.has(match[4])) {
      fail(`Git returned duplicate runtime input path ${match[4]}`);
    }
    tracked.set(match[4], match[1]);
  }
  for (const relativePath of expectedPaths) {
    const mode = tracked.get(relativePath);
    if (mode === undefined) {
      fail(`producer runtime input is not tracked by Git: ${relativePath}`);
    }
    if (mode !== '100644') {
      fail(`producer runtime input Git mode must be 100644: ${relativePath}`);
    }
  }
  if (tracked.size !== expectedPaths.length) {
    fail('Git runtime input inventory contains an unexpected path');
  }
}

export function readProducerRuntimeInputsManifest(manifestPath) {
  let information;
  try {
    information = fs.lstatSync(manifestPath);
  } catch (error) {
    fail(`producer runtime input manifest is unavailable: ${error.message}`);
  }
  if (information.isSymbolicLink() || !information.isFile()) {
    fail('producer runtime input manifest must be a regular non-symlink file');
  }
  const source = fs.readFileSync(manifestPath, 'utf8');
  let manifest;
  try {
    manifest = parseJsonStrict(source, manifestPath);
    assertCanonicalJson(source, manifest, manifestPath);
  } catch (error) {
    fail(`producer runtime input manifest is invalid: ${error.message}`);
  }
  return { manifest, source };
}

export function validateProducerRuntimeInputs(repositoryRoot, manifest) {
  const root = canonicalRepositoryRoot(repositoryRoot);
  validateManifestShape(manifest);
  const indexEntries = parseArchiveIndex(root);
  const expectedPaths = deriveClosure(indexEntries);
  assertExactClosure(manifest, expectedPaths);
  assertTrackedModes(root, expectedPaths);
  const records = new Map(manifest.files.map((record) => [record.path, record]));
  for (const relativePath of expectedPaths) {
    const bytes = readSourceBytes(root, relativePath);
    const record = records.get(relativePath);
    const digest = sha256Bytes(bytes);
    if (record.size !== bytes.length) {
      fail(`producer runtime input size drift: ${relativePath}`);
    }
    if (record.sha256 !== digest) {
      fail(`producer runtime input digest drift: ${relativePath}`);
    }
    const indexDigest = indexEntries.get(relativePath);
    if (indexDigest !== undefined && indexDigest !== digest) {
      fail(`Archive fixture index digest disagreement: ${relativePath}`);
    }
  }
  return Object.freeze({
    fileCount: manifest.fileCount,
    totalSize: manifest.totalSize,
    fileSetDigest: manifest.fileSetDigest,
  });
}

export function verifyProducerRuntimeInputs(
  repositoryRoot,
  manifestPath = path.join(repositoryRoot, PRODUCER_RUNTIME_INPUTS_MANIFEST_PATH),
) {
  const { manifest, source } = readProducerRuntimeInputsManifest(manifestPath);
  const result = validateProducerRuntimeInputs(repositoryRoot, manifest);
  return Object.freeze({
    manifestDigest: sha256Bytes(source),
    ...result,
  });
}
