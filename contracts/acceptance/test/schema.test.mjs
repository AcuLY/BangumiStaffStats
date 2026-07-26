import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { isDeepStrictEqual } from 'node:util';

import { loadAcceptanceConfiguration } from '../lib/config.mjs';
import {
  validateAcceptanceInput,
  validateResult,
} from '../lib/contracts.mjs';
import { REQUIRED_MEASUREMENTS } from '../lib/measurements.mjs';
import { resultOutputDigest } from '../lib/output-digest.mjs';
import { OFFICIAL_PROVENANCE_IDENTITY } from '../lib/provenance.mjs';

const SCHEMA_ROOT = path.resolve(import.meta.dirname, '..', 'schemas');
const INPUT_SCHEMA = readSchema('acceptance-input-v1.schema.json');
const RESULT_SCHEMA = readSchema('result-v1.schema.json');

function readSchema(name) {
  return JSON.parse(fs.readFileSync(path.join(SCHEMA_ROOT, name), 'utf8'));
}

function resolveLocalReference(root, reference) {
  assert.match(reference, /^#(?:\/|$)/u);
  return reference
    .slice(2)
    .split('/')
    .filter(Boolean)
    .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce((value, segment) => value?.[segment], root);
}

function schemaErrors(root, value) {
  function check(schema, candidate, location) {
    if (schema === true) return [];
    if (schema === false) return [`${location}: rejected by false schema`];
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
      return [`${location}: invalid test schema node`];
    }

    const errors = [];
    if (schema.$ref) {
      const target = resolveLocalReference(root, schema.$ref);
      if (!target) errors.push(`${location}: unresolved ${schema.$ref}`);
      else errors.push(...check(target, candidate, location));
    }

    const types = Array.isArray(schema.type)
      ? schema.type
      : schema.type
        ? [schema.type]
        : [];
    if (types.length > 0 && !types.some((type) => matchesType(candidate, type))) {
      errors.push(`${location}: wrong type`);
      return errors;
    }
    if (Object.hasOwn(schema, 'const') && !isDeepStrictEqual(candidate, schema.const)) {
      errors.push(`${location}: const mismatch`);
    }
    if (
      schema.enum &&
      !schema.enum.some((entry) => isDeepStrictEqual(candidate, entry))
    ) {
      errors.push(`${location}: enum mismatch`);
    }

    if (typeof candidate === 'string') {
      if (schema.minLength !== undefined && candidate.length < schema.minLength) {
        errors.push(`${location}: shorter than minLength`);
      }
      if (schema.maxLength !== undefined && candidate.length > schema.maxLength) {
        errors.push(`${location}: longer than maxLength`);
      }
      if (schema.pattern && !new RegExp(schema.pattern, 'u').test(candidate)) {
        errors.push(`${location}: pattern mismatch`);
      }
    }

    if (typeof candidate === 'number') {
      if (schema.minimum !== undefined && candidate < schema.minimum) {
        errors.push(`${location}: below minimum`);
      }
      if (schema.maximum !== undefined && candidate > schema.maximum) {
        errors.push(`${location}: above maximum`);
      }
      if (
        schema.exclusiveMinimum !== undefined &&
        candidate <= schema.exclusiveMinimum
      ) {
        errors.push(`${location}: below exclusiveMinimum`);
      }
      if (
        schema.exclusiveMaximum !== undefined &&
        candidate >= schema.exclusiveMaximum
      ) {
        errors.push(`${location}: above exclusiveMaximum`);
      }
    }

    if (Array.isArray(candidate)) {
      if (schema.minItems !== undefined && candidate.length < schema.minItems) {
        errors.push(`${location}: fewer than minItems`);
      }
      if (schema.maxItems !== undefined && candidate.length > schema.maxItems) {
        errors.push(`${location}: more than maxItems`);
      }
      if (schema.uniqueItems) {
        for (let left = 0; left < candidate.length; left += 1) {
          for (let right = left + 1; right < candidate.length; right += 1) {
            if (isDeepStrictEqual(candidate[left], candidate[right])) {
              errors.push(`${location}: duplicate array item`);
            }
          }
        }
      }
      if (Array.isArray(schema.prefixItems)) {
        schema.prefixItems.forEach((entry, index) => {
          if (index < candidate.length) {
            errors.push(...check(entry, candidate[index], `${location}[${index}]`));
          }
        });
      }
      if (schema.items && !Array.isArray(schema.items)) {
        const offset = Array.isArray(schema.prefixItems)
          ? schema.prefixItems.length
          : 0;
        for (let index = offset; index < candidate.length; index += 1) {
          errors.push(
            ...check(schema.items, candidate[index], `${location}[${index}]`),
          );
        }
      }
      if (schema.contains) {
        const count = candidate.filter(
          (entry) => check(schema.contains, entry, location).length === 0,
        ).length;
        const minimum = schema.minContains ?? 1;
        const maximum = schema.maxContains ?? Number.MAX_SAFE_INTEGER;
        if (count < minimum || count > maximum) {
          errors.push(`${location}: contains count is ${count}`);
        }
      }
    }

    if (isObject(candidate)) {
      for (const required of schema.required ?? []) {
        if (!Object.hasOwn(candidate, required)) {
          errors.push(`${location}: missing ${required}`);
        }
      }
      const declared = schema.properties ?? {};
      for (const [key, entry] of Object.entries(declared)) {
        if (Object.hasOwn(candidate, key)) {
          errors.push(...check(entry, candidate[key], `${location}.${key}`));
        }
      }
      if (schema.additionalProperties === false) {
        for (const key of Object.keys(candidate)) {
          if (!Object.hasOwn(declared, key)) {
            errors.push(`${location}: additional property ${key}`);
          }
        }
      }
    }

    for (const entry of schema.allOf ?? []) {
      errors.push(...check(entry, candidate, location));
    }
    if (schema.anyOf) {
      const matches = schema.anyOf.filter(
        (entry) => check(entry, candidate, location).length === 0,
      ).length;
      if (matches === 0) errors.push(`${location}: no anyOf branch matched`);
    }
    if (schema.oneOf) {
      const matches = schema.oneOf.filter(
        (entry) => check(entry, candidate, location).length === 0,
      ).length;
      if (matches !== 1) errors.push(`${location}: ${matches} oneOf branches matched`);
    }
    if (schema.not && check(schema.not, candidate, location).length === 0) {
      errors.push(`${location}: forbidden not schema matched`);
    }
    if (schema.if) {
      const branch =
        check(schema.if, candidate, location).length === 0
          ? schema.then
          : schema.else;
      if (branch) errors.push(...check(branch, candidate, location));
    }
    return errors;
  }

  return check(root, value, '$');
}

function matchesType(value, type) {
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return isObject(value);
  if (type === 'integer') return Number.isSafeInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === type;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertSchemaAccepts(schema, value, label) {
  assert.deepEqual(schemaErrors(schema, value), [], label);
}

function assertSchemaRejects(schema, value, label) {
  assert.notEqual(schemaErrors(schema, value).length, 0, label);
}

function digest(fill = '0') {
  return `sha256:${fill.repeat(64)}`;
}

function runtimeClosuresFixture() {
  const closure = (shape, classification, copied, hermetic) => ({
    shape,
    classification,
    rootDigest: digest('d'),
    identityDigest: digest('e'),
    copied,
    hermetic,
  });
  return {
    currentNodeSource: closure('directory', 'read-only-source', false, false),
    currentNode: closure('directory', 'run-owned-copy', true, true),
    queryNode: closure('directory', 'owner-fixed-in-place', false, false),
    currentNpmSource: closure('directory', 'read-only-source', false, false),
    currentNpm: closure('directory', 'run-owned-copy', true, true),
    queryNpm: closure('directory', 'owner-fixed-in-place', false, false),
    currentGoSource: closure('directory', 'read-only-source', false, false),
    currentGo: closure('directory', 'run-owned-copy', true, true),
    historicalGo: closure('directory', 'owner-fixed-in-place', false, false),
    pythonSource: closure('directory', 'read-only-source', false, false),
    python: closure('directory', 'run-owned-copy', true, true),
    uvSource: closure('single-file', 'read-only-source', false, false),
    uv: closure('single-file', 'run-owned-copy', true, true),
    dockerSource: closure('single-file', 'read-only-source', false, false),
    docker: closure('single-file', 'run-owned-copy', true, true),
    browserSource: closure('directory', 'read-only-source', false, false),
    browserCopy: closure('directory', 'run-owned-copy', true, true),
  };
}

function inputFixture() {
  const objectId = '1'.repeat(40);
  const absolute = '/private/tmp/acceptance-schema-input';
  const productRoot = `${absolute}/product`;
  const cacheRoot = `${absolute}/cache`;
  return {
    schemaVersion: 1,
    product: { root: productRoot, revision: objectId, tree: objectId },
    harness: { root: `${absolute}/harness`, revision: objectId, tree: objectId },
    artifacts: {
      backendRoot:
        `${productRoot}/backend/build/.tmp/artifacts/sha256-backend`,
      updaterRoot:
        `${productRoot}/updater/build/.tmp/published/sha256-updater`,
      frontendRoot:
        `${productRoot}/frontend/build/.tmp/published/sha256-frontend`,
      compatibilityManifest:
        `${productRoot}/contracts/artifacts/.tmp/assembled/sha256-compatibility/compatibility-manifest.json`,
    },
    archive: {
      versionRoot: `${absolute}/archive`,
      dataVersion: `dv1-${'2'.repeat(64)}`,
      provenanceRoot: `${absolute}/provenance`,
      provenanceManifest: `${absolute}/provenance/provenance.json`,
      provenanceDigest: OFFICIAL_PROVENANCE_IDENTITY.provenanceDigest,
    },
    oracle: {
      revision: '644b7748674e553f863d0ffd61d029f86fdc0717',
      tree: objectId,
      npmCache: `${cacheRoot}/npm`,
    },
    tools: Object.fromEntries(
      [
        'git',
        'node',
        'npm',
        'go',
        'uv',
        'python',
        'docker',
        'tar',
        'queryNode',
        'queryNpm',
        'queryGo',
        'queryGofmt',
      ].map((name) => [
        name,
        {
          path: `${absolute}/bin/${name}`,
          version: '1.0.0',
          sha256: digest('1'),
          ...(name === 'docker'
            ? { endpoint: 'unix:///private/tmp/docker.sock' }
            : {}),
        },
      ]),
    ),
    caches: {
      npm: `${cacheRoot}/npm`,
      goModule: `${cacheRoot}/go`,
      uv: `${cacheRoot}/uv`,
      browser: `${cacheRoot}/browser`,
      root: cacheRoot,
      manifest: `${cacheRoot}/cache-manifest.json`,
      digest: digest('2'),
    },
    browser: {
      name: 'chromium',
      version: '149.0.7827.55',
      executablePath: `${cacheRoot}/browser/chromium`,
      executableDigest: digest('3'),
    },
  };
}

function resultFixture(matrix) {
  const measurements = Object.entries(REQUIRED_MEASUREMENTS).map(
    ([id, declaration]) => ({
      id,
      value:
        declaration.budgetId === null
          ? 1
          : declaration.comparison === 'lt'
            ? declaration.value - 1
            : declaration.value,
      unit: declaration.unit,
      budgetId: declaration.budgetId,
      decision: declaration.decision,
    }),
  );
  const result = {
    schemaVersion: 1,
    matrixVersion: matrix.matrixVersion,
    runId: `run-${'a'.repeat(24)}`,
    classification: 'development characterization on this recorded profile',
    identities: {
      product: { revision: '1'.repeat(40), tree: '2'.repeat(40) },
      harness: { revision: '3'.repeat(40), tree: '4'.repeat(40) },
      components: {
        backend: {
          artifactSetDigest: digest('1'),
          statementDigest: digest('2'),
        },
        updater: {
          artifactSetDigest: digest('3'),
          statementDigest: digest('4'),
        },
        frontend: {
          artifactSetDigest: digest('5'),
          statementDigest: digest('6'),
        },
      },
      compatibility: digest('7'),
      archive: {
        dataVersion: `dv1-${'8'.repeat(64)}`,
        manifestDigest: digest('9'),
        sqliteDigest: digest('a'),
        ...OFFICIAL_PROVENANCE_IDENTITY,
      },
      oracle: {
        revision: '644b7748674e553f863d0ffd61d029f86fdc0717',
        tree: 'b'.repeat(40),
        buildDigest: digest('b'),
      },
      tools: Object.fromEntries(
        [
          'docker',
          'git',
          'go',
          'node',
          'npm',
          'python',
          'queryGo',
          'queryGofmt',
          'queryNode',
          'queryNpm',
          'tar',
          'uv',
        ].map((name) => [
          name,
          { version: `${name} 1`, sha256: digest('d') },
        ]),
      ),
      browser: {
        name: 'chromium',
        version: '149',
        executableDigest: digest('c'),
      },
      historicalGo: {
        rootDigest: digest('f'),
        ownerFixedInPlace: true,
        copied: false,
        hermetic: false,
      },
      runtimeClosures: runtimeClosuresFixture(),
      budgets: {
        profileId: 'darwin-arm64-development-v1',
        digest:
          'sha256:19857455c671b06eefc0930532c21d752d123b248882419bafd84b6fbb16978e',
      },
      cacheCompatibility: {
        schemaVersion: 1,
        preparedFromRevision: '0'.repeat(40),
        productRevision: '1'.repeat(40),
        harnessRevision: '3'.repeat(40),
        oracleRevision: '644b7748674e553f863d0ffd61d029f86fdc0717',
        authorities: 18,
        npmLocks: 13,
        productLocks: 11,
        goFiles: 2,
        queryModuleLocks: 2,
        uvLocks: 1,
        cacheManifestSha256: digest('1'),
        cacheRootSha256: digest('2'),
        evidencePath: 'evidence/cache-compatibility.json',
        evidenceSha256: digest('3'),
        preAdmissionAuthoritySetSha256: digest('4'),
        postCleanupAuthoritySetSha256: digest('5'),
      },
    },
    machine: {
      profileId: 'darwin-arm64-development-v1',
      os: 'darwin',
      architecture: 'arm64',
      release: 'test',
      logicalCpuCount: 8,
      memoryBytes: 1024,
      dockerVersion: '29.5.3',
    },
    measurements,
    cells: matrix.cells.map((cell) => ({
      id: cell.id,
      owner: cell.owner,
      status: 'pass',
      durationMs: 1,
      evidence: cell.evidence.map((kind) => ({
        kind,
        path: `evidence/${cell.id}/${kind}.json`,
        sha256: digest('a'),
        summary: `${kind} accepted`,
      })),
      failure: null,
    })),
    seals: {
      inputBefore: digest('d'),
      inputAfter: digest('d'),
      outputDigest: digest('0'),
      residue: {
        processes: 0,
        listeners: 0,
        containers: 0,
        images: 0,
        networks: 0,
        files: 0,
      },
    },
    lifecycle: {
      specified: true,
      implemented: true,
      verified: true,
      committed: true,
      pushed: false,
      released: false,
      deployed: false,
    },
    verdict: 'development-accepted-operations-pending',
  };
  result.seals.outputDigest = resultOutputDigest(result);
  return result;
}

function failedResultFixture(matrix) {
  const result = resultFixture(matrix);
  result.measurements = [];
  result.cells = matrix.cells.map((cell, index) =>
    index === 0
      ? {
          id: cell.id,
          owner: cell.owner,
          status: 'fail',
          durationMs: cell.timeoutMs,
          evidence: [],
          failure: {
            code: 'ADMISSION_FAILED',
            summary: 'admission failed closed',
            blockedBy: null,
          },
        }
      : {
          id: cell.id,
          owner: cell.owner,
          status: 'blocked',
          durationMs: 0,
          evidence: [],
          failure: {
            code: 'BLOCKED_BY_FAILURE',
            summary: 'blocked by admission.input',
            blockedBy: 'admission.input',
          },
        },
  );
  result.lifecycle.implemented = false;
  result.lifecycle.verified = false;
  result.lifecycle.committed = false;
  result.verdict = null;
  result.seals.outputDigest = resultOutputDigest(result);
  return result;
}

function mutated(value, mutate, { refreshDigest = false } = {}) {
  const copy = structuredClone(value);
  mutate(copy);
  if (refreshDigest && copy.seals && Object.hasOwn(copy.seals, 'outputDigest')) {
    copy.seals.outputDigest = resultOutputDigest(copy);
  }
  return copy;
}

function walkSchema(schema, visit, pointer = '#') {
  if (!schema || typeof schema !== 'object') return;
  visit(schema, pointer);
  if (Array.isArray(schema)) {
    schema.forEach((entry, index) => walkSchema(entry, visit, `${pointer}/${index}`));
    return;
  }
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'enum' || key === 'required') continue;
    walkSchema(value, visit, `${pointer}/${key}`);
  }
}

test('input and result schemas resolve every ref and close every typed container', () => {
  for (const [name, schema] of [
    ['input', INPUT_SCHEMA],
    ['result', RESULT_SCHEMA],
  ]) {
    walkSchema(schema, (node, pointer) => {
      if (node.$ref) {
        assert.ok(
          resolveLocalReference(schema, node.$ref),
          `${name} ${pointer} has unresolved ${node.$ref}`,
        );
      }
      if (node.type === 'object') {
        assert.equal(
          node.additionalProperties,
          false,
          `${name} ${pointer} is an open object`,
        );
      }
      if (node.type === 'array') {
        assert.ok(node.items, `${name} ${pointer} has no item schema`);
        assert.ok(
          Number.isSafeInteger(node.maxItems),
          `${name} ${pointer} has no finite maxItems`,
        );
      }
    });
  }

  assert.deepEqual(INPUT_SCHEMA.properties.archive.required, [
    'versionRoot',
    'dataVersion',
    'provenanceRoot',
    'provenanceManifest',
    'provenanceDigest',
  ]);
  assert.deepEqual(
    RESULT_SCHEMA.$defs.identities.properties.archive.required,
    [
      'dataVersion',
      'manifestDigest',
      'sqliteDigest',
      'provenanceDigest',
      'releaseAssetDigest',
      'releaseMetadataDigest',
      'commonDigest',
    ],
  );
  assert.deepEqual(
    RESULT_SCHEMA.$defs.cacheCompatibilityIdentity.required,
    [
      'schemaVersion',
      'preparedFromRevision',
      'productRevision',
      'harnessRevision',
      'oracleRevision',
      'authorities',
      'npmLocks',
      'productLocks',
      'goFiles',
      'queryModuleLocks',
      'uvLocks',
      'cacheManifestSha256',
      'cacheRootSha256',
      'evidencePath',
      'evidenceSha256',
      'preAdmissionAuthoritySetSha256',
      'postCleanupAuthoritySetSha256',
    ],
  );
});

test('closed measurement and cell registries equal their imperative owners', () => {
  const measurementIds = new Set();
  for (const alternative of RESULT_SCHEMA.$defs.measurement.oneOf) {
    const definition = resolveLocalReference(RESULT_SCHEMA, alternative.$ref);
    const declaration = definition.properties.id;
    for (const id of declaration.enum ?? [declaration.const]) {
      measurementIds.add(id);
    }
  }
  assert.deepEqual(
    [...measurementIds].sort(),
    Object.keys(REQUIRED_MEASUREMENTS).sort(),
  );

  const { matrix } = loadAcceptanceConfiguration();
  assert.deepEqual(
    RESULT_SCHEMA.$defs.cellResult.properties.id.enum,
    matrix.cells.map((cell) => cell.id),
  );
  assert.deepEqual(
    RESULT_SCHEMA.properties.cells.prefixItems.map((entry) => {
      const properties = entry.allOf[1].properties;
      return {
        id: properties.id.const,
        owner: properties.owner.const,
      };
    }),
    matrix.cells.map(({ id, owner }) => ({ id, owner })),
  );
  const timeoutByCell = new Map();
  const timeoutSchema = resolveLocalReference(
    RESULT_SCHEMA,
    RESULT_SCHEMA.allOf[0].properties.cells.items.$ref,
  );
  for (const entry of timeoutSchema.allOf) {
    const declaration = entry.if.properties.id;
    for (const id of declaration.enum ?? [declaration.const]) {
      timeoutByCell.set(id, entry.then.properties.durationMs.maximum);
    }
  }
  assert.deepEqual(
    [...timeoutByCell.entries()].sort(),
    matrix.cells.map(({ id, timeoutMs }) => [id, timeoutMs]).sort(),
  );
  assert.deepEqual(
    new Set(RESULT_SCHEMA.$defs.cellResult.properties.owner.enum),
    new Set(matrix.cells.map((cell) => cell.owner)),
  );
});

test('acceptance input schema and imperative validator accept the same closed fixture', () => {
  const input = inputFixture();
  assertSchemaAccepts(INPUT_SCHEMA, input, 'input schema rejected the valid fixture');
  assert.equal(validateAcceptanceInput(input), input);

  const cases = [
    mutated(input, (value) => {
      value.command = '/bin/sh';
    }),
    mutated(input, (value) => {
      delete value.archive.provenanceDigest;
    }),
    mutated(input, (value) => {
      value.archive.extra = true;
    }),
    mutated(input, (value) => {
      value.archive.provenanceDigest = digest('A');
    }),
    mutated(input, (value) => {
      value.archive.versionRoot = '../archive';
    }),
    mutated(input, (value) => {
      value.archive.versionRoot = '/private/tmp/../archive';
    }),
    mutated(input, (value) => {
      value.archive.versionRoot = '/../archive';
    }),
    mutated(input, (value) => {
      value.archive.versionRoot = '/./archive';
    }),
    mutated(input, (value) => {
      value.archive.versionRoot = '/private//tmp/archive';
    }),
    mutated(input, (value) => {
      value.archive.versionRoot = '/private/tmp/archive/';
    }),
    mutated(input, (value) => {
      value.archive.versionRoot = '/private/tmp\\archive';
    }),
  ];
  for (const [index, candidate] of cases.entries()) {
    assertSchemaRejects(INPUT_SCHEMA, candidate, `schema accepted input case ${index}`);
    assert.throws(
      () => validateAcceptanceInput(candidate),
      `imperative validator accepted input case ${index}`,
    );
  }
});

test('normalized absolute paths reject control bytes in every schema-owned path', () => {
  const input = inputFixture();
  input.archive.provenanceManifest =
    '/private/tmp/provenance/provenance\u0001.json';
  assertSchemaRejects(INPUT_SCHEMA, input, 'schema accepted a control byte');
  assert.throws(() => validateAcceptanceInput(input));
});

test('result schema and imperative validator accept the same canonical green result', () => {
  const { matrix, budgets } = loadAcceptanceConfiguration();
  const result = resultFixture(matrix);
  assertSchemaAccepts(RESULT_SCHEMA, result, 'result schema rejected a green result');
  assert.equal(validateResult(result, matrix, budgets), result);
});

test('result schema and imperative validator accept the same fail-fast result', () => {
  const { matrix, budgets } = loadAcceptanceConfiguration();
  const result = failedResultFixture(matrix);
  assertSchemaAccepts(
    RESULT_SCHEMA,
    result,
    'result schema rejected a valid fail-fast result',
  );
  assert.equal(validateResult(result, matrix, budgets), result);
  const beforeCacheAdmission = structuredClone(result);
  beforeCacheAdmission.identities.cacheCompatibility = null;
  beforeCacheAdmission.seals.inputBefore = digest('0');
  beforeCacheAdmission.seals.inputAfter = digest('0');
  beforeCacheAdmission.seals.outputDigest =
    resultOutputDigest(beforeCacheAdmission);
  assertSchemaAccepts(
    RESULT_SCHEMA,
    beforeCacheAdmission,
    'result schema rejected an early fail-fast result',
  );
  assert.equal(
    validateResult(beforeCacheAdmission, matrix, budgets),
    beforeCacheAdmission,
  );
  const overTimeout = structuredClone(result);
  overTimeout.cells[0].durationMs = matrix.cells[0].timeoutMs + 1;
  overTimeout.seals.outputDigest = resultOutputDigest(overTimeout);
  assertSchemaRejects(
    RESULT_SCHEMA,
    overTimeout,
    'result schema accepted a failed cell beyond its closed timeout',
  );
  assert.throws(
    () => validateResult(overTimeout, matrix, budgets),
    /exceeds the closed cell timeout/u,
  );
});

test('result structural negative corpus is rejected by schema and imperative validator', () => {
  const { matrix, budgets } = loadAcceptanceConfiguration();
  const result = resultFixture(matrix);
  const cases = [
    mutated(
      result,
      (value) => {
        value.identities.extra = true;
      },
      { refreshDigest: true },
    ),
    mutated(
      result,
      (value) => {
        delete value.identities.archive.provenanceDigest;
      },
      { refreshDigest: true },
    ),
    mutated(
      result,
      (value) => {
        value.identities.archive.commonDigest = digest('A');
      },
      { refreshDigest: true },
    ),
    mutated(
      result,
      (value) => {
        delete value.identities.cacheCompatibility.evidenceSha256;
      },
      { refreshDigest: true },
    ),
    mutated(
      result,
      (value) => {
        value.identities.cacheCompatibility.extra = true;
      },
      { refreshDigest: true },
    ),
    mutated(
      result,
      (value) => {
        value.identities.cacheCompatibility.authorities = 15;
      },
      { refreshDigest: true },
    ),
    mutated(
      result,
      (value) => {
        value.identities.cacheCompatibility.queryModuleLocks = 1;
      },
      { refreshDigest: true },
    ),
    mutated(
      result,
      (value) => {
        value.identities.cacheCompatibility.evidencePath =
          '/absolute/evidence.json';
      },
      { refreshDigest: true },
    ),
    mutated(
      result,
      (value) => {
        value.identities.tools.tar.sha256 = 'sha256:tampered';
      },
      { refreshDigest: true },
    ),
    mutated(
      result,
      (value) => {
        value.machine.profileId = 'unreviewed';
      },
      { refreshDigest: true },
    ),
    mutated(
      result,
      (value) => {
        value.measurements[0].id = 'runtime.learnedBudget';
      },
      { refreshDigest: true },
    ),
    mutated(
      result,
      (value) => {
        value.measurements[0].unit = 'percent';
      },
      { refreshDigest: true },
    ),
    mutated(
      result,
      (value) => {
        value.measurements[1].id = value.measurements[0].id;
      },
      { refreshDigest: true },
    ),
    mutated(
      result,
      (value) => {
        value.cells[0].id = 'runtime.injected';
      },
      { refreshDigest: true },
    ),
    mutated(
      result,
      (value) => {
        [value.cells[0], value.cells[1]] = [value.cells[1], value.cells[0]];
      },
      { refreshDigest: true },
    ),
    mutated(
      result,
      (value) => {
        value.cells[0].durationMs = matrix.cells[0].timeoutMs + 1;
      },
      { refreshDigest: true },
    ),
    mutated(
      result,
      (value) => {
        value.cells[0].evidence[0].path = '/private/tmp/raw.log';
      },
      { refreshDigest: true },
    ),
    mutated(
      result,
      (value) => {
        value.cells[0].failure = {
          code: 'FAILED',
          summary: 'must not exist on pass',
          blockedBy: null,
        };
      },
      { refreshDigest: true },
    ),
    mutated(
      result,
      (value) => {
        value.seals.residue.unknown = 0;
      },
      { refreshDigest: true },
    ),
    mutated(
      result,
      (value) => {
        value.lifecycle.released = true;
      },
      { refreshDigest: true },
    ),
  ];

  for (const [index, candidate] of cases.entries()) {
    assertSchemaRejects(RESULT_SCHEMA, candidate, `schema accepted result case ${index}`);
    assert.throws(
      () => validateResult(candidate, matrix, budgets),
      `imperative validator accepted result case ${index}`,
    );
  }
});

test('imperative validator retains canonical cross-field checks beyond JSON Schema', () => {
  const { matrix, budgets } = loadAcceptanceConfiguration();
  const result = resultFixture(matrix);
  const mismatchedCacheRevision = structuredClone(result);
  mismatchedCacheRevision.identities.cacheCompatibility.productRevision =
    'f'.repeat(40);
  mismatchedCacheRevision.seals.outputDigest = resultOutputDigest(
    mismatchedCacheRevision,
  );
  assertSchemaAccepts(
    RESULT_SCHEMA,
    mismatchedCacheRevision,
    'schema rejected a structurally valid cache revision identity',
  );
  assert.throws(
    () => validateResult(mismatchedCacheRevision, matrix, budgets),
    /revision identities/u,
  );

  const wrongDigest = structuredClone(result);
  wrongDigest.seals.outputDigest = digest('f');

  assertSchemaAccepts(
    RESULT_SCHEMA,
    wrongDigest,
    'the structural schema unexpectedly reimplemented the canonical digest',
  );
  assert.throws(
    () => validateResult(wrongDigest, matrix, budgets),
    /canonical result content/u,
  );

  const changedInputSeal = structuredClone(result);
  changedInputSeal.seals.inputAfter = digest('e');
  changedInputSeal.seals.outputDigest = resultOutputDigest(changedInputSeal);
  assertSchemaAccepts(RESULT_SCHEMA, changedInputSeal, 'schema rejected seal shape');
  assert.throws(
    () => validateResult(changedInputSeal, matrix, budgets),
    /protected input seal changed/u,
  );

  const missingEvidence = structuredClone(result);
  missingEvidence.cells[0].evidence = [];
  missingEvidence.seals.outputDigest = resultOutputDigest(missingEvidence);
  assertSchemaAccepts(
    RESULT_SCHEMA,
    missingEvidence,
    'schema rejected a structurally closed evidence array',
  );
  assert.throws(
    () => validateResult(missingEvidence, matrix, budgets),
    /missing required evidence kind/u,
  );

  const brokenFailFast = failedResultFixture(matrix);
  brokenFailFast.cells[1].failure.code = 'WRONG_BLOCK';
  brokenFailFast.seals.outputDigest = resultOutputDigest(brokenFailFast);
  assertSchemaAccepts(
    RESULT_SCHEMA,
    brokenFailFast,
    'schema rejected a structurally valid blocked failure',
  );
  assert.throws(
    () => validateResult(brokenFailFast, matrix, budgets),
    /exact fail-fast blocked shape/u,
  );
});
