import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { canonicalJson, canonicalJsonDigest } from '../lib/canonical-json.mjs';
import {
  ensureGeneratedDirectory,
  removeGeneratedPath,
  requireGeneratedPath,
} from '../lib/generated-path.mjs';
import { parseJsonStrict, readJsonStrict, StrictJsonError } from '../lib/strict-json.mjs';
import {
  ARCHIVE_MANIFEST_SCHEMA_DIGEST,
  ARCHIVE_SCHEMA_SQL_DIGEST,
  ArtifactValidationError,
  PRODUCER_RUNTIME_INPUTS_MANIFEST_DIGEST,
  assembleCompatibilityManifest,
  parseChecksumInventory,
  sha256Bytes,
  validateComponentStatement,
  validateSpdxDocument,
  verifyComponentDirectory,
} from '../lib/validation.mjs';

const ARTIFACTS_ROOT = path.resolve(import.meta.dirname, '..');
const REPOSITORY_ROOT = path.resolve(ARTIFACTS_ROOT, '..', '..');
const POSITIVE = path.join(ARTIFACTS_ROOT, 'fixtures', 'positive');
const NEGATIVE = path.join(ARTIFACTS_ROOT, 'fixtures', 'negative');
const TMP = path.join(ARTIFACTS_ROOT, '.tmp', 'contracts-tests');

function generatedOptions(label) {
  return {
    repositoryRoot: REPOSITORY_ROOT,
    temporaryRoot: path.join(ARTIFACTS_ROOT, '.tmp'),
    label,
  };
}

function requireTestPath(candidate, label = 'Contracts test path') {
  return requireGeneratedPath(candidate, generatedOptions(label));
}

function resetTmp() {
  removeGeneratedPath(TMP, generatedOptions('Contracts test root'));
  ensureGeneratedDirectory(TMP, generatedOptions('Contracts test root'));
}

function copyFixtures() {
  resetTmp();
  const roots = {};
  for (const component of ['backend', 'frontend', 'updater']) {
    roots[component] = path.join(TMP, component);
    requireTestPath(roots[component], `${component} fixture copy`);
    fs.cpSync(path.join(POSITIVE, component), roots[component], { recursive: true });
    requireTestPath(roots[component], `${component} fixture copy`);
  }
  return roots;
}

function statementPath(root) {
  return path.join(root, 'component-statement.json');
}

function readStatement(root) {
  return readJsonStrict(statementPath(root));
}

function writeStatement(root, value) {
  const target = requireTestPath(statementPath(root), 'component statement fixture');
  fs.writeFileSync(target, canonicalJson(value));
  requireTestPath(target, 'component statement fixture');
}

function mutateStatement(root, mutate) {
  const value = readStatement(root);
  mutate(value);
  writeStatement(root, value);
  return value;
}

function refreshSbomEvidence(root, statement) {
  const sbomPath = path.join(root, statement.sbom.path);
  const source = fs.readFileSync(sbomPath);
  const sbom = readJsonStrict(sbomPath);
  statement.sbom.size = source.length;
  statement.sbom.sha256 = sha256Bytes(source);
  statement.sbom.documentNamespace = sbom.documentNamespace;
  statement.sbom.packageCount = sbom.packages.length;
}

function expectFailure(action, pattern) {
  assert.throws(action, (error) => {
    assert.ok(
      error instanceof ArtifactValidationError ||
        error instanceof StrictJsonError ||
        error instanceof Error,
    );
    assert.match(error.message, pattern);
    return true;
  });
}

test('all JSON schemas are strict parseable documents with closed top-level objects', () => {
  const schemaRoot = path.join(ARTIFACTS_ROOT, 'schemas');
  for (const name of fs.readdirSync(schemaRoot).sort()) {
    if (!name.endsWith('.json')) continue;
    const schema = readJsonStrict(path.join(schemaRoot, name));
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(schema.type, 'object');
    assert.equal(schema.additionalProperties, false);
  }
});

test('three complete positive component directories validate offline', () => {
  for (const component of ['backend', 'frontend', 'updater']) {
    const result = verifyComponentDirectory(path.join(POSITIVE, component), component);
    assert.equal(result.statement.component, component);
    assert.equal(result.statement.schemaVersion, 1);
  }
});

test('canonical assembly is independent of component input order', () => {
  const roots = ['backend', 'frontend', 'updater'].map((component) =>
    path.join(POSITIVE, component),
  );
  const canonical = assembleCompatibilityManifest(roots).canonical;
  const permutations = [
    [roots[2], roots[0], roots[1]],
    [roots[1], roots[2], roots[0]],
    [...roots].reverse(),
  ];
  for (const permutation of permutations) {
    assert.equal(assembleCompatibilityManifest(permutation).canonical, canonical);
  }
});

test('duplicate and unknown fields fail closed', () => {
  const duplicate = fs.readFileSync(path.join(NEGATIVE, 'duplicate-field.json'), 'utf8');
  assert.throws(() => parseJsonStrict(duplicate, 'duplicate fixture'), StrictJsonError);
  const roots = copyFixtures();
  mutateStatement(roots.backend, (statement) => {
    statement.unknown = true;
  });
  expectFailure(() => verifyComponentDirectory(roots.backend, 'backend'), /unknown field/);
});

test('unsafe paths and component substitution fail closed', () => {
  const roots = copyFixtures();
  mutateStatement(roots.backend, (statement) => {
    statement.artifacts[0].path = '../escape';
    statement.artifactSetDigest = canonicalJsonDigest(statement.artifacts);
  });
  expectFailure(() => verifyComponentDirectory(roots.backend, 'backend'), /safe normalized path/);

  const second = copyFixtures();
  expectFailure(
    () => verifyComponentDirectory(second.backend, 'updater'),
    /substituted component/,
  );
});

test('missing, extra, digest-drift, and size-drift files fail closed', () => {
  let roots = copyFixtures();
  fs.rmSync(path.join(roots.backend, 'artifacts', 'backend-fixture.txt'));
  expectFailure(() => verifyComponentDirectory(roots.backend), /missing\/extra file mismatch/);

  roots = copyFixtures();
  fs.writeFileSync(path.join(roots.backend, 'artifacts', 'extra.txt'), 'extra\n');
  expectFailure(() => verifyComponentDirectory(roots.backend), /missing\/extra file mismatch/);

  roots = copyFixtures();
  fs.appendFileSync(path.join(roots.backend, 'artifacts', 'backend-fixture.txt'), 'tamper');
  expectFailure(() => verifyComponentDirectory(roots.backend), /size drift|digest drift/);

  roots = copyFixtures();
  mutateStatement(roots.backend, (statement) => {
    statement.artifacts[0].size += 1;
    statement.artifactSetDigest = canonicalJsonDigest(statement.artifacts);
  });
  expectFailure(() => verifyComponentDirectory(roots.backend), /size drift/);
});

test('checksum inventory rejects unsafe, duplicate, and unsorted entries', () => {
  const digest = '0'.repeat(64);
  expectFailure(() => parseChecksumInventory(`${digest}  ../escape\n`), /safe normalized/);
  expectFailure(
    () => parseChecksumInventory(`${digest}  z\n${digest}  a\n`),
    /strictly sorted/,
  );
  expectFailure(
    () => parseChecksumInventory(`${digest}  a\n${digest}  a\n`),
    /duplicate/,
  );
});

test('mixed source, platform, Archive range, and OpenAPI facts fail assembly', () => {
  let roots = copyFixtures();
  mutateStatement(roots.updater, (statement) => {
    statement.source.tree = 'd'.repeat(40);
  });
  expectFailure(
    () => assembleCompatibilityManifest(Object.values(roots)),
    /mixed source/,
  );

  roots = copyFixtures();
  mutateStatement(roots.frontend, (statement) => {
    statement.target.architecture = 'amd64';
  });
  expectFailure(
    () => assembleCompatibilityManifest(Object.values(roots)),
    /mixed target/,
  );

  roots = copyFixtures();
  for (const root of Object.values(roots)) {
    mutateStatement(root, (statement) => {
      statement.compatibility.archive.manifestSchemaVersion = {
        minimum: 2,
        maximum: 2,
      };
    });
  }
  expectFailure(
    () => assembleCompatibilityManifest(Object.values(roots)),
    /accepted schema version/,
  );

  roots = copyFixtures();
  mutateStatement(roots.frontend, (statement) => {
    statement.compatibility.openapiDigest = `sha256:${'d'.repeat(64)}`;
  });
  expectFailure(() => verifyComponentDirectory(roots.frontend), /accepted OpenAPI/);
});

test('Archive schema digest drift fails before assembly', () => {
  const roots = copyFixtures();
  for (const root of Object.values(roots)) {
    mutateStatement(root, (statement) => {
      statement.compatibility.archive.manifestSchemaDigest = `sha256:${'e'.repeat(64)}`;
    });
  }
  expectFailure(
    () => assembleCompatibilityManifest(Object.values(roots)),
    /accepted Archive manifest schema/,
  );
  assert.notEqual(ARCHIVE_MANIFEST_SCHEMA_DIGEST, ARCHIVE_SCHEMA_SQL_DIGEST);
});

test('container components require exact BuildKit and Buildx evidence', () => {
  let roots = copyFixtures();
  mutateStatement(roots.backend, (statement) => {
    statement.toolchain = statement.toolchain.filter(
      (tool) => tool.name !== 'buildkit',
    );
  });
  expectFailure(
    () => verifyComponentDirectory(roots.backend),
    /missing required backend tool buildkit/,
  );

  roots = copyFixtures();
  mutateStatement(roots.updater, (statement) => {
    statement.toolchain.find((tool) => tool.name === 'docker-buildx').version =
      '0.34.0';
  });
  expectFailure(
    () => verifyComponentDirectory(roots.updater),
    /docker-buildx must equal 0\.34\.1/,
  );

  roots = copyFixtures();
  mutateStatement(roots.backend, (statement) => {
    statement.inputs.find(
      (input) => input.path === 'toolchain/buildkit-image',
    ).sha256 = `sha256:${'f'.repeat(64)}`;
  });
  expectFailure(
    () => verifyComponentDirectory(roots.backend),
    /BuildKit image must equal sha256:1e110c71/,
  );

  roots = copyFixtures();
  mutateStatement(roots.frontend, (statement) => {
    statement.toolchain.push({ name: 'buildkit', version: '0.27.1' });
    statement.toolchain.sort((left, right) =>
      left.name.localeCompare(right.name, 'en'),
    );
  });
  expectFailure(
    () => verifyComponentDirectory(roots.frontend),
    /frontend must not declare buildkit/,
  );
});

test('Updater statements require one exact sorted producer-runtime manifest input', () => {
  const producerPath = 'contracts/producer-runtime-inputs-v1';
  const cases = [
    {
      name: 'missing',
      mutate(statement) {
        statement.inputs = statement.inputs.filter(
          (input) => input.path !== producerPath,
        );
      },
      expected: /exactly one producer-runtime manifest input/u,
    },
    {
      name: 'duplicate',
      mutate(statement) {
        const binding = statement.inputs.find(
          (input) => input.path === producerPath,
        );
        statement.inputs.push(structuredClone(binding));
        statement.inputs.sort((left, right) =>
          left.path.localeCompare(right.path, 'en'),
        );
      },
      expected: /duplicate sort key/u,
    },
    {
      name: 'misnamed',
      mutate(statement) {
        statement.inputs.find(
          (input) => input.path === producerPath,
        ).path = `${producerPath}-v2`;
        statement.inputs.sort((left, right) =>
          left.path.localeCompare(right.path, 'en'),
        );
      },
      expected: /exactly one producer-runtime manifest input/u,
    },
    {
      name: 'malformed',
      mutate(statement) {
        statement.inputs.find(
          (input) => input.path === producerPath,
        ).sha256 = 'SHA256:INVALID';
      },
      expected: /invalid format/u,
    },
    {
      name: 'digest drift',
      mutate(statement) {
        statement.inputs.find(
          (input) => input.path === producerPath,
        ).sha256 = `sha256:${'f'.repeat(64)}`;
      },
      expected: new RegExp(
        `must equal ${PRODUCER_RUNTIME_INPUTS_MANIFEST_DIGEST}`,
        'u',
      ),
    },
    {
      name: 'reordered',
      mutate(statement) {
        statement.inputs.reverse();
      },
      expected: /strictly sorted/u,
    },
  ];
  for (const negative of cases) {
    const roots = copyFixtures();
    mutateStatement(roots.updater, negative.mutate);
    expectFailure(
      () => verifyComponentDirectory(roots.updater, 'updater'),
      negative.expected,
    );
  }
});

test('incomplete SPDX runtime closure fails closed', () => {
  const roots = copyFixtures();
  const statement = readStatement(roots.updater);
  const sbomPath = path.join(roots.updater, statement.sbom.path);
  const sbom = readJsonStrict(sbomPath);
  sbom.packages = sbom.packages.filter(
    (entry) => entry.SPDXID === 'SPDXRef-Package-artifact',
  );
  sbom.relationships = sbom.relationships.filter(
    (entry) => entry.relationshipType === 'DESCRIBES',
  );
  fs.writeFileSync(sbomPath, canonicalJson(sbom));
  refreshSbomEvidence(roots.updater, statement);
  writeStatement(roots.updater, statement);
  expectFailure(() => verifyComponentDirectory(roots.updater), /runtime dependency/);
});

test('multi-artifact SPDX must describe every wheel and OCI artifact digest', () => {
  const baseStatement = readJsonStrict(
    path.join(POSITIVE, 'updater', 'component-statement.json'),
  );
  const baseSbom = readJsonStrict(path.join(POSITIVE, 'updater', baseStatement.sbom.path));
  const wheelDigest = 'a'.repeat(64);
  const ociDigest = 'b'.repeat(64);

  for (const [describedDigest, missingDigest] of [
    [wheelDigest, ociDigest],
    [ociDigest, wheelDigest],
  ]) {
    const statement = structuredClone(baseStatement);
    statement.artifacts = [
      {
        path: 'artifacts/updater-image-linux-arm64.oci.tar',
        size: 2,
        sha256: `sha256:${ociDigest}`,
      },
      {
        path: 'artifacts/updater-runtime.whl',
        size: 1,
        sha256: `sha256:${wheelDigest}`,
      },
    ];
    statement.artifactSetDigest = canonicalJsonDigest(statement.artifacts);
    const sbom = structuredClone(baseSbom);
    const artifactPackage = sbom.packages.find(
      (entry) => entry.SPDXID === 'SPDXRef-Package-artifact',
    );
    artifactPackage.checksums[0].checksumValue = describedDigest;
    expectFailure(
      () => validateSpdxDocument(sbom, statement),
      new RegExp(
        `described artifact digests must exactly equal statement artifacts; missing ${missingDigest}`,
      ),
    );
  }
});

test('SPDX rejects non-statement described checksums and digest ambiguity', () => {
  const statement = readJsonStrict(
    path.join(POSITIVE, 'updater', 'component-statement.json'),
  );
  const sbom = readJsonStrict(path.join(POSITIVE, 'updater', statement.sbom.path));
  const artifactPackage = sbom.packages.find(
    (entry) => entry.SPDXID === 'SPDXRef-Package-artifact',
  );
  artifactPackage.checksums[0].checksumValue = 'f'.repeat(64);
  expectFailure(
    () => validateSpdxDocument(sbom, statement),
    /checksum does not name a statement artifact/,
  );

  const duplicateStatement = structuredClone(statement);
  duplicateStatement.artifacts.push({
    ...duplicateStatement.artifacts[0],
    path: 'artifacts/updater-copy.oci.tar',
  });
  duplicateStatement.artifacts.sort((left, right) =>
    left.path.localeCompare(right.path, 'en'),
  );
  duplicateStatement.artifactSetDigest = canonicalJsonDigest(
    duplicateStatement.artifacts,
  );
  expectFailure(
    () =>
      validateSpdxDocument(
        readJsonStrict(path.join(POSITIVE, 'updater', statement.sbom.path)),
        duplicateStatement,
      ),
    /share digest .* artifact identity is ambiguous/,
  );

  const ownerAmbiguitySbom = readJsonStrict(
    path.join(POSITIVE, 'updater', statement.sbom.path),
  );
  const runtimePackage = ownerAmbiguitySbom.packages.find(
    (entry) => entry.SPDXID === 'SPDXRef-Package-python-runtime',
  );
  runtimePackage.checksums = structuredClone(
    ownerAmbiguitySbom.packages.find(
      (entry) => entry.SPDXID === 'SPDXRef-Package-artifact',
    ).checksums,
  );
  expectFailure(
    () => validateSpdxDocument(ownerAmbiguitySbom, statement),
    /SPDX package checksum owners; artifact identity is ambiguous/,
  );
});

test('host, random UUID, and wall-clock timestamp leakage fail closed', () => {
  const cases = [
    ['/Users/example/build', /host path/],
    ['550e8400-e29b-41d4-a716-446655440000', /random UUID/],
    ['2026-07-25T12:34:56Z', /timestamp/],
  ];
  for (const [value, pattern] of cases) {
    const roots = copyFixtures();
    const statement = readStatement(roots.frontend);
    statement.toolchain[0].version = value;
    expectFailure(() => validateComponentStatement(statement), pattern);
  }
});

test('negative fixture registry stays synchronized with exercised cases', () => {
  const registry = readJsonStrict(path.join(NEGATIVE, 'cases.json'));
  assert.equal(registry.schemaVersion, 1);
  assert.deepEqual(registry.cases, [...registry.cases].sort());
  assert.deepEqual(registry.cases, [
    'archive-range',
    'buildkit-image-drift',
    'container-toolchain-drift',
    'digest-drift',
    'duplicate-field',
    'extra-file',
    'host-leakage',
    'incomplete-sbom',
    'missing-file',
    'mixed-platform',
    'mixed-source',
    'openapi-drift',
    'producer-runtime-input-digest-drift',
    'producer-runtime-input-duplicate',
    'producer-runtime-input-malformed',
    'producer-runtime-input-misnamed',
    'producer-runtime-input-missing',
    'producer-runtime-input-reordered',
    'random-leakage',
    'sbom-artifact-digest-ambiguity',
    'sbom-missing-oci',
    'sbom-missing-wheel',
    'sbom-nonstatement-artifact',
    'size-drift',
    'substituted-component',
    'timestamp-leakage',
    'unknown-field',
    'unsafe-path',
  ]);
});
