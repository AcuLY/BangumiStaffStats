import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test, { after } from 'node:test';

import {
  canonicalJson,
  canonicalJsonDigest,
} from '../lib/canonical-json.mjs';
import {
  ensureGeneratedDirectory,
  removeGeneratedPath,
  requireGeneratedPath,
} from '../lib/generated-path.mjs';
import {
  PRODUCER_RUNTIME_INPUTS_FILE_COUNT,
  PRODUCER_RUNTIME_INPUTS_MANIFEST_PATH,
  readProducerRuntimeInputsManifest,
  validateProducerRuntimeInputs,
  verifyProducerRuntimeInputs,
} from '../lib/runtime-inputs.mjs';
import {
  APPLICATION_VERSION,
  ARCHIVE_CAST_RULES_VERSION,
  ARCHIVE_COMPATIBILITY_MATRIX_DIGEST,
  ARCHIVE_DOMAIN_RULES_VERSION,
  PRODUCER_RUNTIME_INPUTS_MANIFEST_DIGEST,
  sha256Bytes,
} from '../lib/validation.mjs';

const ARTIFACTS_ROOT = path.resolve(import.meta.dirname, '..');
const REPOSITORY_ROOT = path.resolve(ARTIFACTS_ROOT, '..', '..');
const TMP_ROOT = path.join(ARTIFACTS_ROOT, '.tmp');
const TEST_ROOT = path.join(TMP_ROOT, 'producer-runtime-inputs-tests');
const ARCHIVE_INDEX_PATH = 'contracts/goldens/archive/index.json';
const ARCHIVE_ROOT = 'contracts/goldens/archive';
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

function generatedOptions(label) {
  return {
    repositoryRoot: REPOSITORY_ROOT,
    temporaryRoot: TMP_ROOT,
    label,
  };
}

function requireTestPath(candidate, label = 'producer runtime input test path') {
  return requireGeneratedPath(candidate, generatedOptions(label));
}

function resetCase(name) {
  const root = path.join(TEST_ROOT, name);
  removeGeneratedPath(root, generatedOptions(`producer runtime case ${name}`));
  ensureGeneratedDirectory(
    root,
    generatedOptions(`producer runtime case ${name}`),
  );
  return root;
}

function writeOwned(filePath, bytes) {
  requireTestPath(filePath);
  ensureGeneratedDirectory(
    path.dirname(filePath),
    generatedOptions('producer runtime test parent'),
  );
  fs.writeFileSync(filePath, bytes);
  requireTestPath(filePath);
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function runGit(root, arguments_) {
  const result = spawnSync('git', ['-C', root, ...arguments_], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: '1',
      HOME: path.join(root, '.test-home'),
    },
  });
  assert.equal(
    result.status,
    0,
    `git ${arguments_.join(' ')} failed:\n${result.stdout}\n${result.stderr}`,
  );
  return result.stdout.trim();
}

function manifestPaths(root) {
  const index = JSON.parse(
    fs.readFileSync(path.join(root, ARCHIVE_INDEX_PATH), 'utf8'),
  );
  return [
    ARCHIVE_INDEX_PATH,
    ...index.files.map((entry) => `${ARCHIVE_ROOT}/${entry.path}`),
    ...EXPLICIT_RUNTIME_INPUTS,
  ].sort();
}

function manifestForRoot(root) {
  const files = manifestPaths(root).map((relativePath) => {
    const bytes = fs.readFileSync(path.join(root, relativePath));
    return {
      path: relativePath,
      size: bytes.length,
      sha256: sha256(bytes),
    };
  });
  return {
    schemaVersion: 1,
    fileCount: files.length,
    totalSize: files.reduce((total, entry) => total + entry.size, 0),
    files,
    fileSetDigest: canonicalJsonDigest(files),
  };
}

function rebindManifest(manifest) {
  manifest.fileCount = manifest.files.length;
  manifest.totalSize = manifest.files.reduce(
    (total, entry) => total + entry.size,
    0,
  );
  manifest.fileSetDigest = canonicalJsonDigest(manifest.files);
  return manifest;
}

function buildFixture(name) {
  const caseRoot = resetCase(name);
  const root = path.join(caseRoot, 'repository');
  ensureGeneratedDirectory(root, generatedOptions(`repository ${name}`));
  const indexFiles = [];
  for (let index = 0; index < 32; index += 1) {
    const relativePath = `fixtures/case-${String(index).padStart(2, '0')}.json`;
    const bytes = Buffer.from(`fixture-${index}\n`, 'utf8');
    writeOwned(path.join(root, ARCHIVE_ROOT, relativePath), bytes);
    indexFiles.push({
      path: relativePath,
      digest: sha256(bytes),
    });
  }
  writeOwned(
    path.join(root, ARCHIVE_INDEX_PATH),
    canonicalJson({
      indexSchemaVersion: 1,
      files: indexFiles,
    }),
  );
  for (const [index, relativePath] of EXPLICIT_RUNTIME_INPUTS.entries()) {
    writeOwned(
      path.join(root, relativePath),
      Buffer.from(`explicit-${index}\n`, 'utf8'),
    );
  }
  runGit(root, ['init', '--quiet']);
  runGit(root, ['add', '--all']);
  const manifest = manifestForRoot(root);
  assert.equal(manifest.files.length, PRODUCER_RUNTIME_INPUTS_FILE_COUNT);
  return { caseRoot, root, manifest };
}

function selectedFixturePath(root) {
  return path.join(root, ARCHIVE_ROOT, 'fixtures/case-00.json');
}

function writeManifest(root, manifest, name = 'producer-runtime-inputs-v1.json') {
  const destination =
    name === 'producer-runtime-inputs-v1.json'
      ? path.join(root, PRODUCER_RUNTIME_INPUTS_MANIFEST_PATH)
      : path.join(root, 'contracts', 'artifacts', name);
  writeOwned(destination, canonicalJson(manifest));
  return destination;
}

after(() => {
  removeGeneratedPath(
    TEST_ROOT,
    generatedOptions('producer runtime input test cleanup'),
  );
});

test('canonical 42-file manifest validates deterministically and the CLI is bounded', () => {
  const fixture = buildFixture('positive');
  const first = validateProducerRuntimeInputs(fixture.root, fixture.manifest);
  const second = validateProducerRuntimeInputs(
    fixture.root,
    structuredClone(fixture.manifest),
  );
  assert.deepEqual(second, first);
  assert.equal(first.fileCount, 42);
  assert.equal(
    first.fileSetDigest,
    canonicalJsonDigest(fixture.manifest.files),
  );

  const manifestPath = writeManifest(fixture.root, fixture.manifest);
  const read = readProducerRuntimeInputsManifest(manifestPath);
  assert.equal(canonicalJson(read.manifest), canonicalJson(fixture.manifest));
  const verified = verifyProducerRuntimeInputs(fixture.root);
  assert.deepEqual(verified, {
    manifestDigest: sha256Bytes(canonicalJson(fixture.manifest)),
    fileCount: fixture.manifest.fileCount,
    totalSize: fixture.manifest.totalSize,
    fileSetDigest: fixture.manifest.fileSetDigest,
  });

  const cli = spawnSync(
    process.execPath,
    [
      path.join(ARTIFACTS_ROOT, 'bin', 'artifacts.mjs'),
      'verify-producer-runtime-inputs',
      fixture.root,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(
    cli.stdout,
    canonicalJson({
      manifestDigest: verified.manifestDigest,
      fileCount: verified.fileCount,
      totalSize: verified.totalSize,
    }),
  );
  assert.equal(cli.stderr, '');
});

test('tracked authority manifest is canonical and bound to the accepted digest', () => {
  const manifestPath = path.join(
    REPOSITORY_ROOT,
    PRODUCER_RUNTIME_INPUTS_MANIFEST_PATH,
  );
  const { manifest, source } = readProducerRuntimeInputsManifest(manifestPath);
  assert.equal(manifest.fileCount, 42);
  assert.equal(sha256Bytes(source), PRODUCER_RUNTIME_INPUTS_MANIFEST_DIGEST);
  assert.deepEqual(
    verifyProducerRuntimeInputs(REPOSITORY_ROOT),
    {
      manifestDigest: PRODUCER_RUNTIME_INPUTS_MANIFEST_DIGEST,
      fileCount: 42,
      totalSize: 1780037,
      fileSetDigest:
        'sha256:d019d832a16165a891ec94c282e0b9e365760e09e5a7d4334f3978a3f91237f9',
    },
  );
  const runtimeSchema = JSON.parse(
    fs.readFileSync(
      path.join(
        ARTIFACTS_ROOT,
        'schemas',
        'producer-runtime-inputs-v1.schema.json',
      ),
      'utf8',
    ),
  );
  assert.equal(runtimeSchema.properties.fileCount.const, 42);
  assert.equal(runtimeSchema.properties.files.minItems, 42);
  assert.equal(runtimeSchema.properties.files.maxItems, 42);
  const statementSchema = JSON.parse(
    fs.readFileSync(
      path.join(ARTIFACTS_ROOT, 'schemas', 'component-statement-v1.schema.json'),
      'utf8',
    ),
  );
  const updaterRule = statementSchema.allOf.find(
    (entry) => entry.if?.properties?.component?.const === 'updater',
  );
  assert.equal(
    updaterRule.then.properties.inputs.contains.properties.path.const,
    'contracts/producer-runtime-inputs-v1',
  );
  assert.equal(
    updaterRule.then.properties.inputs.contains.properties.sha256.const,
    PRODUCER_RUNTIME_INPUTS_MANIFEST_DIGEST,
  );
});

test('malformed, duplicate-key, noncanonical, and unknown-field manifests fail', () => {
  const fixture = buildFixture('json-shape');
  const artifactsRoot = path.join(fixture.root, 'contracts', 'artifacts');
  const malformed = path.join(artifactsRoot, 'malformed.json');
  writeOwned(malformed, '{"fileCount":42\n');
  assert.throws(
    () => readProducerRuntimeInputsManifest(malformed),
    /manifest is invalid/u,
  );

  const duplicate = path.join(artifactsRoot, 'duplicate.json');
  writeOwned(
    duplicate,
    '{"fileCount":42,"fileCount":42}\n',
  );
  assert.throws(
    () => readProducerRuntimeInputsManifest(duplicate),
    /duplicate object key/u,
  );

  const noncanonical = path.join(artifactsRoot, 'noncanonical.json');
  writeOwned(noncanonical, `${JSON.stringify(fixture.manifest, null, 2)}\n`);
  assert.throws(
    () => readProducerRuntimeInputsManifest(noncanonical),
    /not canonical JSON/u,
  );

  const unknown = structuredClone(fixture.manifest);
  unknown.unknown = true;
  assert.throws(
    () => validateProducerRuntimeInputs(fixture.root, unknown),
    /must contain exactly/u,
  );
  const unknownRecord = structuredClone(fixture.manifest);
  unknownRecord.files[0].unknown = true;
  assert.throws(
    () => validateProducerRuntimeInputs(fixture.root, unknownRecord),
    /must contain exactly/u,
  );
});

test('absolute, empty, dot, parent, backslash, NUL, and non-ASCII paths fail', () => {
  const unsafePaths = [
    '/absolute',
    '',
    '.',
    '..',
    'contracts/../escape',
    'contracts\\escape',
    'contracts/escape\0file',
    'contracts/档案.json',
  ];
  for (const [index, unsafePath] of unsafePaths.entries()) {
    const fixture = buildFixture(`unsafe-path-${index}`);
    fixture.manifest.files[0].path = unsafePath;
    assert.throws(
      () => validateProducerRuntimeInputs(fixture.root, fixture.manifest),
      /path|normalized|safe/u,
    );
  }
});

test('duplicate, reordered, missing, extra, and index-unlisted records fail', () => {
  let fixture = buildFixture('duplicate-record');
  fixture.manifest.files[1] = structuredClone(fixture.manifest.files[0]);
  assert.throws(
    () => validateProducerRuntimeInputs(fixture.root, fixture.manifest),
    /duplicate path/u,
  );

  fixture = buildFixture('reordered-record');
  [fixture.manifest.files[0], fixture.manifest.files[1]] = [
    fixture.manifest.files[1],
    fixture.manifest.files[0],
  ];
  assert.throws(
    () => validateProducerRuntimeInputs(fixture.root, fixture.manifest),
    /bytewise sorted/u,
  );

  fixture = buildFixture('missing-record');
  fixture.manifest.files.pop();
  rebindManifest(fixture.manifest);
  assert.throws(
    () => validateProducerRuntimeInputs(fixture.root, fixture.manifest),
    /fileCount must equal 42/u,
  );

  fixture = buildFixture('extra-record');
  fixture.manifest.files.push({
    path: 'contracts/schemas/catalog/unlisted.schema.json',
    size: 0,
    sha256: `sha256:${'0'.repeat(64)}`,
  });
  rebindManifest(fixture.manifest);
  assert.throws(
    () => validateProducerRuntimeInputs(fixture.root, fixture.manifest),
    /fileCount must equal 42/u,
  );

  fixture = buildFixture('index-unlisted-record');
  fixture.manifest.files[1] = {
    path: 'contracts/goldens/archive/fixtures/unlisted.json',
    size: 0,
    sha256: `sha256:${'0'.repeat(64)}`,
  };
  fixture.manifest.files.sort((left, right) =>
    left.path.localeCompare(right.path, 'en'),
  );
  rebindManifest(fixture.manifest);
  assert.throws(
    () => validateProducerRuntimeInputs(fixture.root, fixture.manifest),
    /closure mismatch/u,
  );
});

test('file count, total size, file-set digest, record size, and record digest drift fail', () => {
  let fixture = buildFixture('file-count-drift');
  fixture.manifest.fileCount = 41;
  assert.throws(
    () => validateProducerRuntimeInputs(fixture.root, fixture.manifest),
    /fileCount must equal 42/u,
  );

  fixture = buildFixture('total-size-drift');
  fixture.manifest.totalSize += 1;
  assert.throws(
    () => validateProducerRuntimeInputs(fixture.root, fixture.manifest),
    /totalSize must equal/u,
  );

  fixture = buildFixture('file-set-drift');
  fixture.manifest.fileSetDigest = `sha256:${'f'.repeat(64)}`;
  assert.throws(
    () => validateProducerRuntimeInputs(fixture.root, fixture.manifest),
    /fileSetDigest must equal/u,
  );

  fixture = buildFixture('record-size-drift');
  fixture.manifest.files[1].size += 1;
  rebindManifest(fixture.manifest);
  assert.throws(
    () => validateProducerRuntimeInputs(fixture.root, fixture.manifest),
    /size drift/u,
  );

  fixture = buildFixture('record-digest-drift');
  fixture.manifest.files[1].sha256 = `sha256:${'f'.repeat(64)}`;
  rebindManifest(fixture.manifest);
  assert.throws(
    () => validateProducerRuntimeInputs(fixture.root, fixture.manifest),
    /digest drift/u,
  );
});

test('Archive index count, duplicate path, and indexed digest disagreement fail', () => {
  let fixture = buildFixture('index-count');
  let index = JSON.parse(
    fs.readFileSync(path.join(fixture.root, ARCHIVE_INDEX_PATH), 'utf8'),
  );
  index.files.pop();
  writeOwned(path.join(fixture.root, ARCHIVE_INDEX_PATH), canonicalJson(index));
  assert.throws(
    () => validateProducerRuntimeInputs(fixture.root, fixture.manifest),
    /exactly 32 files/u,
  );

  fixture = buildFixture('index-duplicate');
  index = JSON.parse(
    fs.readFileSync(path.join(fixture.root, ARCHIVE_INDEX_PATH), 'utf8'),
  );
  index.files[1] = structuredClone(index.files[0]);
  writeOwned(path.join(fixture.root, ARCHIVE_INDEX_PATH), canonicalJson(index));
  assert.throws(
    () => validateProducerRuntimeInputs(fixture.root, fixture.manifest),
    /duplicate path/u,
  );

  fixture = buildFixture('index-digest-disagreement');
  index = JSON.parse(
    fs.readFileSync(path.join(fixture.root, ARCHIVE_INDEX_PATH), 'utf8'),
  );
  index.files[0].digest = `sha256:${'f'.repeat(64)}`;
  writeOwned(path.join(fixture.root, ARCHIVE_INDEX_PATH), canonicalJson(index));
  fixture.manifest = manifestForRoot(fixture.root);
  assert.throws(
    () => validateProducerRuntimeInputs(fixture.root, fixture.manifest),
    /index digest disagreement/u,
  );
});

test('missing, untracked, symlink, hard-link, special-file, and mode drift fail safely', () => {
  let fixture = buildFixture('missing-source');
  fs.unlinkSync(selectedFixturePath(fixture.root));
  assert.throws(
    () => validateProducerRuntimeInputs(fixture.root, fixture.manifest),
    /input is missing/u,
  );

  fixture = buildFixture('untracked-source');
  runGit(fixture.root, [
    'rm',
    '--cached',
    '--quiet',
    '--',
    path.relative(fixture.root, selectedFixturePath(fixture.root)),
  ]);
  assert.throws(
    () => validateProducerRuntimeInputs(fixture.root, fixture.manifest),
    /not tracked by Git/u,
  );

  fixture = buildFixture('symlink-source');
  const symlinkTarget = selectedFixturePath(fixture.root);
  const symlinkSource = path.join(fixture.caseRoot, 'outside-symlink-source');
  writeOwned(symlinkSource, 'outside\n');
  fs.unlinkSync(symlinkTarget);
  fs.symlinkSync(symlinkSource, symlinkTarget);
  assert.throws(
    () => validateProducerRuntimeInputs(fixture.root, fixture.manifest),
    /crosses a symlink/u,
  );

  fixture = buildFixture('hard-link-source');
  const hardLinkTarget = selectedFixturePath(fixture.root);
  const hardLinkSource = path.join(fixture.caseRoot, 'outside-hard-link-source');
  writeOwned(hardLinkSource, fs.readFileSync(hardLinkTarget));
  fs.unlinkSync(hardLinkTarget);
  fs.linkSync(hardLinkSource, hardLinkTarget);
  assert.throws(
    () => validateProducerRuntimeInputs(fixture.root, fixture.manifest),
    /exactly one hard link/u,
  );

  fixture = buildFixture('special-source');
  const specialTarget = selectedFixturePath(fixture.root);
  fs.unlinkSync(specialTarget);
  const fifo = spawnSync('mkfifo', [specialTarget], { encoding: 'utf8' });
  assert.equal(fifo.status, 0, fifo.stderr);
  assert.throws(
    () => validateProducerRuntimeInputs(fixture.root, fixture.manifest),
    /not a regular file/u,
  );

  fixture = buildFixture('filesystem-mode-drift');
  fs.chmodSync(selectedFixturePath(fixture.root), 0o755);
  assert.throws(
    () => validateProducerRuntimeInputs(fixture.root, fixture.manifest),
    /executable mode drift/u,
  );

  fixture = buildFixture('git-mode-drift');
  const modePath = path.relative(
    fixture.root,
    selectedFixturePath(fixture.root),
  );
  runGit(fixture.root, ['update-index', '--chmod=+x', '--', modePath]);
  assert.throws(
    () => validateProducerRuntimeInputs(fixture.root, fixture.manifest),
    /Git mode must be 100644/u,
  );
});

test('Updater statement emitter binds the exact logical manifest input', () => {
  const helper = path.join(ARTIFACTS_ROOT, 'statement.py');
  const updaterPython = path.join(
    REPOSITORY_ROOT,
    'updater',
    '.venv',
    'bin',
    'python',
  );
  const python =
    process.env.BGMSS_TEST_PYTHON ??
    (fs.existsSync(updaterPython) ? updaterPython : '/usr/bin/python3');
  const program = String.raw`
import importlib.util
import json
import pathlib
import sys

helper = pathlib.Path(sys.argv[1])
contracts_root = pathlib.Path(sys.argv[2])
specification = importlib.util.spec_from_file_location("statement_under_test", helper)
module = importlib.util.module_from_spec(specification)
specification.loader.exec_module(module)
metadata = json.loads(sys.stdin.read())
statement = module.emit_component_statement(
    artifacts=[{"path": "artifacts/updater.bin", "size": 1, "sha256": "a" * 64}],
    checksum_path="SHA256SUMS",
    checksum_sha256="b" * 64,
    checksum_size=1,
    contracts_root=contracts_root,
    metadata=metadata,
    sbom_path="sbom.spdx.json",
    sbom_sha256="c" * 64,
    sbom_size=1,
    source_revision="d" * 40,
    source_tree="e" * 40,
    target_architecture="arm64",
    target_os="linux",
)
sys.stdout.write(json.dumps(statement, separators=(",", ":"), sort_keys=True) + "\n")
`;
  const metadata = {
    artifacts: {
      bundle: {
        sha256: `sha256:${'a'.repeat(64)}`,
      },
    },
    buildDefinitionSha256: 'b'.repeat(64),
    component: 'updater',
    inputs: {
      producerRuntimeInputsManifestSha256:
        PRODUCER_RUNTIME_INPUTS_MANIFEST_DIGEST,
      sourceSnapshotSha256: 'c'.repeat(64),
      uvLockSha256: 'd'.repeat(64),
    },
    runtimePackages: [
      { name: 'bangumi-staff-stats-updater', version: '0.1.0' },
      { name: 'jsonschema', version: '4.26.0' },
    ],
    sbomPackageCount: 2,
    toolchain: {
      buildkit: '0.27.1',
      buildkitImage:
        'docker.io/moby/buildkit:v0.27.1@sha256:' + '1e110c71d389d6d24f67b9438e2f7b8da749a6ff407b22a1631e025c95599368',
      dockerBuildx: '0.34.1',
      python: '3.14.6',
      pythonBaseImage: `python:3.14.6@sha256:${'e'.repeat(64)}`,
      uv: '0.11.32',
      uvBaseImage: `ghcr.io/astral-sh/uv:0.11.32@sha256:${'f'.repeat(64)}`,
    },
  };
  const run = (value) =>
    spawnSync(
      python,
      [
        '-I',
        '-B',
        '-S',
        '-c',
        program,
        helper,
        path.join(REPOSITORY_ROOT, 'contracts'),
      ],
      {
        encoding: 'utf8',
        input: JSON.stringify(value),
      },
    );

  const accepted = run(metadata);
  assert.equal(accepted.status, 0, accepted.stderr);
  const statement = JSON.parse(accepted.stdout);
  assert.deepEqual(statement.inputs[0], {
    path: 'contracts/producer-runtime-inputs-v1',
    sha256: PRODUCER_RUNTIME_INPUTS_MANIFEST_DIGEST,
  });
  assert.equal(statement.applicationVersion, APPLICATION_VERSION);
  assert.equal(
    statement.compatibility.archive.domainRulesVersion,
    ARCHIVE_DOMAIN_RULES_VERSION,
  );
  assert.equal(
    statement.compatibility.archive.castRulesVersion,
    ARCHIVE_CAST_RULES_VERSION,
  );
  assert.equal(
    statement.compatibility.archive.compatibilityMatrixDigest,
    ARCHIVE_COMPATIBILITY_MATRIX_DIGEST,
  );

  const missing = structuredClone(metadata);
  delete missing.inputs.producerRuntimeInputsManifestSha256;
  const missingResult = run(missing);
  assert.notEqual(missingResult.status, 0);
  assert.match(
    missingResult.stderr,
    /producerRuntimeInputsManifestSha256 must be a lowercase SHA-256 digest/u,
  );

  const drifted = structuredClone(metadata);
  drifted.inputs.producerRuntimeInputsManifestSha256 = '0'.repeat(64);
  const driftedResult = run(drifted);
  assert.notEqual(driftedResult.status, 0);
  assert.match(driftedResult.stderr, /Contracts input drift/u);
});
