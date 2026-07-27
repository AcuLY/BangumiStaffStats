import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { canonicalJson } from './canonical-json.mjs';
import {
  CACHE_AUTHORITY_COUNT,
  NPM_LOCK_AUTHORITY_COUNT,
  PRODUCT_PACKAGE_LOCK_PATHS,
} from './cache-compatibility.mjs';
import {
  MATRIX_VERSION,
  ORACLE_REVISION,
  PHASES,
  RESULT_VERDICT,
  RUN_ID_PATTERN,
} from './constants.mjs';
import {
  assertAbsolutePathSyntax,
  assertSafeRelativePath,
} from './paths.mjs';
import {
  measurementPasses,
  REQUIRED_MEASUREMENTS,
} from './measurements.mjs';
import { resultOutputDigest } from './output-digest.mjs';
import { OFFICIAL_PROVENANCE_IDENTITY } from './provenance.mjs';

export class ContractError extends Error {}

function fail(label, message) {
  throw new ContractError(`${label}: ${message}`);
}

function object(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(label, 'must be an object');
  }
  return value;
}

function exactKeys(value, required, optional, label) {
  const input = object(value, label);
  const actual = Object.keys(input).sort();
  const permitted = [...required, ...optional].sort();
  for (const key of required) {
    if (!Object.hasOwn(input, key)) fail(label, `missing ${key}`);
  }
  for (const key of actual) {
    if (!permitted.includes(key)) fail(label, `unknown field ${key}`);
  }
  return input;
}

function string(value, label, { pattern, min = 1, max = 4096 } = {}) {
  if (
    typeof value !== 'string' ||
    value.length < min ||
    value.length > max ||
    value.includes('\0') ||
    (pattern && !pattern.test(value))
  ) {
    fail(label, 'is invalid bounded text');
  }
  return value;
}

function integer(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    fail(label, `must be an integer between ${min} and ${max}`);
  }
  return value;
}

function finite(value, label, { min = 0, max = Number.MAX_VALUE } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    fail(label, 'must be a finite number in range');
  }
  return value;
}

function array(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    fail(label, `must be an array with ${min}..${max} items`);
  }
  return value;
}

function boolean(value, label) {
  if (typeof value !== 'boolean') fail(label, 'must be boolean');
  return value;
}

function enumeration(value, values, label) {
  if (!values.includes(value)) fail(label, `must be one of ${values.join(', ')}`);
  return value;
}

function unique(values, selector, label) {
  const seen = new Set();
  for (const [index, value] of values.entries()) {
    const identity = selector(value, index);
    if (seen.has(identity)) fail(label, `duplicate ${identity}`);
    seen.add(identity);
  }
}

const OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const DATA_VERSION = /^dv1-[0-9a-f]{64}$/u;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function checkout(value, label) {
  const input = exactKeys(value, ['root', 'revision', 'tree'], [], label);
  assertAbsolutePathSyntax(input.root, `${label}.root`);
  string(input.revision, `${label}.revision`, { pattern: OBJECT_ID });
  string(input.tree, `${label}.tree`, { pattern: OBJECT_ID });
}

function tool(value, label, { docker = false } = {}) {
  const input = exactKeys(
    value,
    ['path', 'version', 'sha256', ...(docker ? ['endpoint'] : [])],
    [],
    label,
  );
  assertAbsolutePathSyntax(input.path, `${label}.path`);
  string(input.version, `${label}.version`, { max: 128 });
  string(input.sha256, `${label}.sha256`, { pattern: DIGEST });
  if (docker) {
    string(input.endpoint, `${label}.endpoint`, {
      pattern: /^unix:\/\/\/[^\0\\]{1,4095}$/u,
      max: 4103,
    });
    assertAbsolutePathSyntax(
      input.endpoint.slice('unix://'.length),
      `${label}.endpoint socket`,
    );
  }
}

function pathContains(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.posix.sep}`);
}

function requireStrictInputChild(candidate, root, label) {
  if (candidate === root || !pathContains(root, candidate)) {
    fail(label, `must be strictly below ${root}`);
  }
}

function requireDisjointInputPaths(left, right, label) {
  if (pathContains(left, right) || pathContains(right, left)) {
    fail(label, 'paths must be disjoint');
  }
}

export function validateAcceptanceInput(value) {
  const input = exactKeys(
    value,
    [
      'schemaVersion',
      'product',
      'harness',
      'artifacts',
      'archive',
      'oracle',
      'tools',
      'caches',
      'browser',
    ],
    [],
    'acceptance input',
  );
  if (input.schemaVersion !== 1) fail('acceptance input.schemaVersion', 'must equal 1');
  checkout(input.product, 'acceptance input.product');
  checkout(input.harness, 'acceptance input.harness');
  const artifacts = exactKeys(
    input.artifacts,
    ['backendRoot', 'updaterRoot', 'frontendRoot', 'compatibilityManifest'],
    [],
    'acceptance input.artifacts',
  );
  for (const [name, candidate] of Object.entries(artifacts)) {
    assertAbsolutePathSyntax(candidate, `acceptance input.artifacts.${name}`);
  }
  const archive = exactKeys(
    input.archive,
    [
      'versionRoot',
      'dataVersion',
      'provenanceRoot',
      'provenanceManifest',
      'provenanceDigest',
    ],
    [],
    'acceptance input.archive',
  );
  assertAbsolutePathSyntax(archive.versionRoot, 'acceptance input.archive.versionRoot');
  assertAbsolutePathSyntax(
    archive.provenanceRoot,
    'acceptance input.archive.provenanceRoot',
  );
  assertAbsolutePathSyntax(
    archive.provenanceManifest,
    'acceptance input.archive.provenanceManifest',
  );
  string(archive.dataVersion, 'acceptance input.archive.dataVersion', {
    pattern: DATA_VERSION,
  });
  string(
    archive.provenanceDigest,
    'acceptance input.archive.provenanceDigest',
    { pattern: DIGEST },
  );
  if (
    archive.provenanceDigest !==
    OFFICIAL_PROVENANCE_IDENTITY.provenanceDigest
  ) {
    fail(
      'acceptance input.archive.provenanceDigest',
      'does not equal the reviewed official provenance manifest',
    );
  }
  const oracle = exactKeys(
    input.oracle,
    ['revision', 'tree', 'npmCache'],
    [],
    'acceptance input.oracle',
  );
  if (oracle.revision !== ORACLE_REVISION) {
    fail('acceptance input.oracle.revision', `must equal ${ORACLE_REVISION}`);
  }
  string(oracle.tree, 'acceptance input.oracle.tree', { pattern: OBJECT_ID });
  assertAbsolutePathSyntax(oracle.npmCache, 'acceptance input.oracle.npmCache');
  const tools = exactKeys(
    input.tools,
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
    ],
    [],
    'acceptance input.tools',
  );
  for (const [name, declaration] of Object.entries(tools)) {
    tool(declaration, `acceptance input.tools.${name}`, { docker: name === 'docker' });
  }
  const caches = exactKeys(
    input.caches,
    ['npm', 'goModule', 'uv', 'browser', 'root', 'manifest', 'digest'],
    [],
    'acceptance input.caches',
  );
  for (const [name, candidate] of Object.entries(caches)) {
    if (name === 'digest') continue;
    assertAbsolutePathSyntax(candidate, `acceptance input.caches.${name}`);
  }
  string(caches.digest, 'acceptance input.caches.digest', { pattern: DIGEST });
  if (oracle.npmCache !== caches.npm) {
    fail(
      'acceptance input.oracle.npmCache',
      'must equal the exact sealed npm cache authority',
    );
  }
  const browser = exactKeys(
    input.browser,
    ['name', 'version', 'executablePath', 'executableDigest'],
    [],
    'acceptance input.browser',
  );
  if (browser.name !== 'chromium') fail('acceptance input.browser.name', 'must be chromium');
  string(browser.version, 'acceptance input.browser.version', { max: 64 });
  assertAbsolutePathSyntax(
    browser.executablePath,
    'acceptance input.browser.executablePath',
  );
  string(browser.executableDigest, 'acceptance input.browser.executableDigest', {
    pattern: DIGEST,
  });
  for (const [name, prefix] of [
    ['backendRoot', 'backend/build/.tmp/artifacts'],
    ['updaterRoot', 'updater/build/.tmp/published'],
    ['frontendRoot', 'frontend/build/.tmp/published'],
  ]) {
    requireStrictInputChild(
      artifacts[name],
      path.posix.join(input.product.root, prefix),
      `acceptance input.artifacts.${name}`,
    );
  }
  requireStrictInputChild(
    artifacts.compatibilityManifest,
    path.posix.join(
      input.product.root,
      'contracts/artifacts/.tmp/assembled',
    ),
    'acceptance input.artifacts.compatibilityManifest',
  );
  for (const name of ['npm', 'goModule', 'uv', 'browser', 'manifest']) {
    requireStrictInputChild(
      caches[name],
      caches.root,
      `acceptance input.caches.${name}`,
    );
  }
  requireStrictInputChild(
    browser.executablePath,
    caches.browser,
    'acceptance input.browser.executablePath',
  );
  requireStrictInputChild(
    archive.provenanceManifest,
    archive.provenanceRoot,
    'acceptance input.archive.provenanceManifest',
  );
  if (
    archive.provenanceManifest !==
    path.posix.join(archive.provenanceRoot, 'provenance.json')
  ) {
    fail(
      'acceptance input.archive.provenanceManifest',
      'must be the exact provenance.json inside provenanceRoot',
    );
  }
  const artifactRoots = [
    artifacts.backendRoot,
    artifacts.updaterRoot,
    artifacts.frontendRoot,
    path.posix.dirname(artifacts.compatibilityManifest),
  ];
  for (let left = 0; left < artifactRoots.length; left += 1) {
    for (let right = left + 1; right < artifactRoots.length; right += 1) {
      requireDisjointInputPaths(
        artifactRoots[left],
        artifactRoots[right],
        'acceptance input.artifacts',
      );
    }
  }
  const independentRoots = [
    ['product', input.product.root],
    ['harness', input.harness.root],
    ['cache', caches.root],
    ['archive', archive.versionRoot],
    ['provenance', archive.provenanceRoot],
  ];
  for (let left = 0; left < independentRoots.length; left += 1) {
    for (let right = left + 1; right < independentRoots.length; right += 1) {
      requireDisjointInputPaths(
        independentRoots[left][1],
        independentRoots[right][1],
        `acceptance input ${independentRoots[left][0]}/${independentRoots[right][0]}`,
      );
    }
  }
  const runTemporaryRoot = path.posix.join(
    input.harness.root,
    'contracts/acceptance/.tmp',
  );
  for (const candidate of [
    caches.root,
    archive.versionRoot,
    archive.provenanceRoot,
    ...artifactRoots,
  ]) {
    if (pathContains(runTemporaryRoot, candidate)) {
      fail('acceptance input', 'protected input overlaps the owned run temporary root');
    }
  }
  return input;
}

const FIXED_ACTIONS = new Set([
  'admit-input',
  'admit-sources',
  'admit-artifacts',
  'admit-archive',
  'admit-tools',
  'owner-gate:contracts',
  'owner-gate:backend',
  'owner-gate:updater',
  'owner-gate:frontend',
  'artifact-verify-components',
  'artifact-coordinator-smoke',
  'archive-validate-full',
  'archive-copy-inactive',
  'updater-artifact-doctor',
  'updater-artifact-contract',
  'backend-artifact-start',
  'api-health',
  'api-catalog',
  'api-rankings',
  'api-candidates',
  'api-person-detail',
  'api-partners',
  'api-co-star',
  'api-malformed-limits',
  'api-cancellation',
  'frontend-artifact-serve',
  'oracle-materialize',
  'browser-shared-journeys',
  'browser-safe-image-failure',
  'measure-development-profile',
  'cleanup-and-reseal',
  'validate-final-result',
]);
const BROWSER_ACTION = /^browser-cell:(light|dark):(360|390|779|780|1024|1440):(default|reduced)$/u;
const MATRIX_CANONICAL_SHA256 =
  'b47336541ee3d63331a660de09a2583a77ca76c16f4ec762aa992d5a2fb08736';
const BUDGETS_CANONICAL_SHA256 =
  '19857455c671b06eefc0930532c21d752d123b248882419bafd84b6fbb16978e';
export const BUDGETS_IDENTITY_DIGEST =
  `sha256:${BUDGETS_CANONICAL_SHA256}`;
const EXPECTED_BROWSER_ACTIONS = new Set(
  [360, 390, 779, 780, 1024, 1440].flatMap((width) =>
    ['light', 'dark'].flatMap((theme) =>
      ['default', 'reduced'].map(
        (motion) => `browser-cell:${theme}:${width}:${motion}`,
      ),
    ),
  ),
);

export function validateMatrix(value) {
  const matrix = exactKeys(
    value,
    ['schemaVersion', 'matrixVersion', 'cells'],
    [],
    'matrix',
  );
  if (matrix.schemaVersion !== 1) fail('matrix.schemaVersion', 'must equal 1');
  if (matrix.matrixVersion !== MATRIX_VERSION) {
    fail('matrix.matrixVersion', `must equal ${MATRIX_VERSION}`);
  }
  const cells = array(matrix.cells, 'matrix.cells', { min: 1, max: 256 });
  const seen = new Set();
  let lastPhase = -1;
  const browserActions = new Set();
  for (const [index, raw] of cells.entries()) {
    const label = `matrix.cells[${index}]`;
    const cell = exactKeys(
      raw,
      ['id', 'phase', 'owner', 'kind', 'action', 'requires', 'timeoutMs', 'evidence'],
      [],
      label,
    );
    string(cell.id, `${label}.id`, {
      pattern: /^[a-z][a-z0-9.-]{2,95}$/u,
      max: 96,
    });
    if (seen.has(cell.id)) fail(`${label}.id`, `duplicate ${cell.id}`);
    seen.add(cell.id);
    enumeration(cell.phase, PHASES, `${label}.phase`);
    const phase = PHASES.indexOf(cell.phase);
    if (phase < lastPhase) fail(label, 'phases must be monotonic');
    lastPhase = phase;
    string(cell.owner, `${label}.owner`, {
      pattern: /^[a-z][a-z0-9-]{2,95}$/u,
      max: 96,
    });
    enumeration(
      cell.kind,
      ['attestation', 'command', 'scenario', 'measurement', 'seal'],
      `${label}.kind`,
    );
    string(cell.action, `${label}.action`, { max: 128 });
    if (!FIXED_ACTIONS.has(cell.action) && !BROWSER_ACTION.test(cell.action)) {
      fail(`${label}.action`, 'is not in the closed action registry');
    }
    if (BROWSER_ACTION.test(cell.action)) {
      if (browserActions.has(cell.action)) {
        fail(`${label}.action`, `duplicate browser matrix action ${cell.action}`);
      }
      browserActions.add(cell.action);
    }
    const dependencies = array(cell.requires, `${label}.requires`, { max: 16 });
    unique(dependencies, (entry) => entry, `${label}.requires`);
    for (const [dependencyIndex, dependency] of dependencies.entries()) {
      string(dependency, `${label}.requires[${dependencyIndex}]`, {
        pattern: /^[a-z][a-z0-9.-]{2,95}$/u,
      });
      if (!seen.has(dependency)) {
        fail(`${label}.requires`, `dependency is absent or not earlier: ${dependency}`);
      }
    }
    integer(cell.timeoutMs, `${label}.timeoutMs`, { min: 100, max: 7_200_000 });
    const evidence = array(cell.evidence, `${label}.evidence`, { min: 1, max: 32 });
    unique(evidence, (entry) => entry, `${label}.evidence`);
    for (const [evidenceIndex, entry] of evidence.entries()) {
      string(entry, `${label}.evidence[${evidenceIndex}]`, {
        pattern: /^[a-z][a-zA-Z0-9]{0,63}$/u,
        max: 64,
      });
    }
  }
  if (
    browserActions.size !== EXPECTED_BROWSER_ACTIONS.size ||
    [...EXPECTED_BROWSER_ACTIONS].some((action) => !browserActions.has(action))
  ) {
    fail(
      'matrix.cells',
      'must contain the exact browser viewport/theme/motion Cartesian product',
    );
  }
  if (cells.at(-1)?.id !== 'residue.verdict') {
    fail('matrix.cells', 'final cell must be residue.verdict');
  }
  const matrixDigest = createHash('sha256')
    .update(canonicalJson(matrix))
    .digest('hex');
  if (matrixDigest !== MATRIX_CANONICAL_SHA256) {
    fail('matrix', 'differs from the exact closed matrix declaration');
  }
  return matrix;
}

function bound(value, label, unit) {
  const input = exactKeys(value, ['comparison', 'value', 'unit'], [], label);
  enumeration(input.comparison, ['lt', 'lte'], `${label}.comparison`);
  integer(input.value, `${label}.value`, { min: 1 });
  if (input.unit !== unit) fail(`${label}.unit`, `must equal ${unit}`);
}

export function validateBudgets(value) {
  const budgets = exactKeys(
    value,
    ['schemaVersion', 'profile', 'invariants', 'timeouts'],
    [],
    'budgets',
  );
  if (budgets.schemaVersion !== 1) fail('budgets.schemaVersion', 'must equal 1');
  const profile = exactKeys(
    budgets.profile,
    ['id', 'label', 'os', 'architecture', 'ceilings'],
    [],
    'budgets.profile',
  );
  if (profile.id !== 'darwin-arm64-development-v1') {
    fail('budgets.profile.id', 'unknown development profile');
  }
  if (profile.label !== 'development characterization on this recorded profile') {
    fail('budgets.profile.label', 'must use the non-production characterization label');
  }
  if (profile.os !== 'darwin' || profile.architecture !== 'arm64') {
    fail('budgets.profile', 'must name the reviewed darwin/arm64 profile');
  }
  const ceilings = exactKeys(
    profile.ceilings,
    [
      'backendReadyMs',
      'backendShutdownMs',
      'browserJourneyMs',
      'suiteMs',
      'backendMemoryHardLimitBytes',
    ],
    [],
    'budgets.profile.ceilings',
  );
  for (const [name, value_] of Object.entries(ceilings)) {
    integer(value_, `budgets.profile.ceilings.${name}`, { min: 1, max: 7_200_000_000 });
  }
  const invariants = exactKeys(
    budgets.invariants,
    [
      'frontendInitialJavaScriptGzipBytes',
      'backendQueryTestBinaryBytes',
      'apiRequestMs',
      'cacheResultItems',
      'cacheResultBytes',
      'cacheResultPerItemBytes',
    ],
    [],
    'budgets.invariants',
  );
  bound(
    invariants.frontendInitialJavaScriptGzipBytes,
    'budgets.invariants.frontendInitialJavaScriptGzipBytes',
    'bytes',
  );
  bound(
    invariants.backendQueryTestBinaryBytes,
    'budgets.invariants.backendQueryTestBinaryBytes',
    'bytes',
  );
  bound(invariants.apiRequestMs, 'budgets.invariants.apiRequestMs', 'milliseconds');
  bound(invariants.cacheResultItems, 'budgets.invariants.cacheResultItems', 'items');
  bound(invariants.cacheResultBytes, 'budgets.invariants.cacheResultBytes', 'bytes');
  bound(
    invariants.cacheResultPerItemBytes,
    'budgets.invariants.cacheResultPerItemBytes',
    'bytes',
  );
  if (
    invariants.frontendInitialJavaScriptGzipBytes.comparison !== 'lt' ||
    invariants.frontendInitialJavaScriptGzipBytes.value !== 307200 ||
    invariants.backendQueryTestBinaryBytes.comparison !== 'lte' ||
    invariants.backendQueryTestBinaryBytes.value !== 16777216 ||
    invariants.apiRequestMs.comparison !== 'lt' ||
    invariants.apiRequestMs.value !== 30000
  ) {
    fail('budgets.invariants', 'accepted hard bounds were changed');
  }
  const timeouts = exactKeys(
    budgets.timeouts,
    ['commandMs', 'archiveCopyMs', 'runtimeMs', 'browserCellMs', 'suiteMs', 'gracefulStopMs'],
    [],
    'budgets.timeouts',
  );
  for (const [name, value_] of Object.entries(timeouts)) {
    integer(value_, `budgets.timeouts.${name}`, { min: 1, max: 7_200_000 });
  }
  const budgetsDigest = createHash('sha256')
    .update(canonicalJson(budgets))
    .digest('hex');
  if (budgetsDigest !== BUDGETS_CANONICAL_SHA256) {
    fail('budgets', 'differs from the exact closed budget declaration');
  }
  return budgets;
}

function assertResolvableAuthority(authority, root, label) {
  const input = exactKeys(authority, ['path', 'heading'], [], label);
  string(input.path, `${label}.path`, {
    pattern: /^(?:PRODUCT\.md|DESIGN\.md|openspec\/specs\/[a-z0-9-]+\/spec\.md)$/u,
  });
  string(input.heading, `${label}.heading`, { min: 2, max: 200 });
  const absolute = path.join(root, ...input.path.split('/'));
  const source = fs.readFileSync(absolute, 'utf8');
  const heading = input.path.startsWith('openspec/')
    ? `### ${input.heading}`
    : `### ${input.heading}`;
  const alternate = `## ${input.heading}`;
  if (!source.split(/\r?\n/u).some((line) => line === heading || line === alternate)) {
    fail(label, `unresolvable authority heading ${input.heading}`);
  }
}

export function validateOracleExceptions(value, { authorityRoot }) {
  const registry = exactKeys(
    value,
    ['schemaVersion', 'oracleRevision', 'screenshotThreshold', 'entries'],
    [],
    'oracle exceptions',
  );
  if (registry.schemaVersion !== 1) fail('oracle exceptions.schemaVersion', 'must equal 1');
  if (registry.oracleRevision !== ORACLE_REVISION) {
    fail('oracle exceptions.oracleRevision', `must equal ${ORACLE_REVISION}`);
  }
  const threshold = exactKeys(
    registry.screenshotThreshold,
    ['maxDifferentPixelRatio', 'maxColorDelta'],
    [],
    'oracle exceptions.screenshotThreshold',
  );
  if (
    threshold.maxDifferentPixelRatio !== 0.002 ||
    threshold.maxColorDelta !== 8
  ) {
    fail('oracle exceptions.screenshotThreshold', 'reviewed threshold was changed');
  }
  const entries = array(registry.entries, 'oracle exceptions.entries', { max: 64 });
  unique(entries, (entry) => entry?.id, 'oracle exceptions.entries');
  for (const [index, raw] of entries.entries()) {
    const label = `oracle exceptions.entries[${index}]`;
    const entry = exactKeys(
      raw,
      ['id', 'classification', 'route', 'state', 'selector', 'properties', 'authority'],
      [],
      label,
    );
    string(entry.id, `${label}.id`, {
      pattern: /^[a-z][a-z0-9.-]{2,95}$/u,
    });
    enumeration(
      entry.classification,
      ['approved-addition', 'dynamic-data'],
      `${label}.classification`,
    );
    enumeration(entry.route, ['/', '/ranking', '/co-star'], `${label}.route`);
    string(entry.state, `${label}.state`, {
      pattern: /^[a-z][a-z0-9-]{1,63}$/u,
    });
    string(entry.selector, `${label}.selector`, { min: 2, max: 256 });
    if (
      entry.selector.includes('*') ||
      ['html', 'body', '#app', '[data-app-root]', '.app-shell'].includes(entry.selector)
    ) {
      fail(`${label}.selector`, 'wildcard or whole-page selectors are forbidden');
    }
    const properties = array(entry.properties, `${label}.properties`, {
      min: 1,
      max: 3,
    });
    unique(properties, (property) => property, `${label}.properties`);
    for (const property of properties) {
      enumeration(
        property,
        ['text-content', 'content-pixels', 'image-source'],
        `${label}.properties`,
      );
    }
    assertResolvableAuthority(entry.authority, authorityRoot, `${label}.authority`);
  }
  return registry;
}

const MEASUREMENT_UNITS = Object.freeze([
  'bytes',
  'items',
  'milliseconds',
  'count',
  'nanoseconds',
  'percent',
]);

export function validateResultEvidenceDescriptor(
  value,
  label = 'result evidence descriptor',
) {
  const evidence = exactKeys(value, ['kind', 'path', 'sha256', 'summary'], [], label);
  string(evidence.kind, `${label}.kind`, {
    pattern: /^[a-z][a-zA-Z0-9]{0,63}$/u,
  });
  assertSafeRelativePath(evidence.path, `${label}.path`);
  string(evidence.sha256, `${label}.sha256`, { pattern: DIGEST });
  string(evidence.summary, `${label}.summary`, { max: 512 });
  assertNoSensitiveStrings(evidence, label);
  return evidence;
}

function assertNoSensitiveStrings(value, label = '$') {
  if (typeof value === 'string') {
    if (
      value.includes('/Users/') ||
      value.includes('/home/') ||
      /(?:password|secret|authorization|bearer|token)=/iu.test(value)
    ) {
      fail(label, 'contains an absolute user path or secret-like value');
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoSensitiveStrings(entry, `${label}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      assertNoSensitiveStrings(entry, `${label}.${key}`);
    }
  }
}

export function validateResult(value, matrix, budgets) {
  if (!budgets) fail('result', 'validated budgets are required');
  const result = exactKeys(
    value,
    [
      'schemaVersion',
      'matrixVersion',
      'runId',
      'classification',
      'identities',
      'machine',
      'measurements',
      'cells',
      'seals',
      'lifecycle',
      'verdict',
    ],
    [],
    'result',
  );
  if (result.schemaVersion !== 1 || result.matrixVersion !== MATRIX_VERSION) {
    fail('result', 'schema or matrix version mismatch');
  }
  string(result.runId, 'result.runId', { pattern: RUN_ID_PATTERN });
  if (result.classification !== 'development characterization on this recorded profile') {
    fail('result.classification', 'must not imply production characterization');
  }
  const declaredGreen =
    Array.isArray(result.cells) &&
    result.cells.every((cell) => cell?.status === 'pass');
  const identities = exactKeys(
    result.identities,
    [
      'product',
      'harness',
      'components',
      'compatibility',
      'archive',
      'oracle',
      'tools',
      'browser',
      'historicalGo',
      'runtimeClosures',
      'budgets',
      'cacheCompatibility',
    ],
    [],
    'result.identities',
  );
  for (const name of ['product', 'harness']) {
    const identity = exactKeys(
      identities[name],
      ['revision', 'tree'],
      [],
      `result.identities.${name}`,
    );
    string(identity.revision, `result.identities.${name}.revision`, {
      pattern: OBJECT_ID,
    });
    string(identity.tree, `result.identities.${name}.tree`, { pattern: OBJECT_ID });
  }
  const components = exactKeys(
    identities.components,
    ['backend', 'updater', 'frontend'],
    [],
    'result.identities.components',
  );
  for (const [name, component] of Object.entries(components)) {
    const declaration = exactKeys(
      component,
      ['artifactSetDigest', 'statementDigest'],
      [],
      `result.identities.components.${name}`,
    );
    string(
      declaration.artifactSetDigest,
      `result.identities.components.${name}.artifactSetDigest`,
      { pattern: DIGEST },
    );
    string(
      declaration.statementDigest,
      `result.identities.components.${name}.statementDigest`,
      { pattern: DIGEST },
    );
  }
  string(identities.compatibility, 'result.identities.compatibility', {
    pattern: DIGEST,
  });
  const archive = exactKeys(
    identities.archive,
    [
      'dataVersion',
      'manifestDigest',
      'sqliteDigest',
      'provenanceDigest',
      'releaseAssetDigest',
      'releaseMetadataDigest',
      'commonDigest',
    ],
    [],
    'result.identities.archive',
  );
  string(archive.dataVersion, 'result.identities.archive.dataVersion', {
    pattern: DATA_VERSION,
  });
  string(archive.manifestDigest, 'result.identities.archive.manifestDigest', {
    pattern: DIGEST,
  });
  string(archive.sqliteDigest, 'result.identities.archive.sqliteDigest', {
    pattern: DIGEST,
  });
  for (const name of [
    'provenanceDigest',
    'releaseAssetDigest',
    'releaseMetadataDigest',
    'commonDigest',
  ]) {
    string(archive[name], `result.identities.archive.${name}`, {
      pattern: DIGEST,
    });
    if (archive[name] !== OFFICIAL_PROVENANCE_IDENTITY[name]) {
      fail(
        `result.identities.archive.${name}`,
        'does not equal the reviewed official provenance identity',
      );
    }
  }
  const oracle = exactKeys(
    identities.oracle,
    ['revision', 'tree', 'buildDigest'],
    [],
    'result.identities.oracle',
  );
  if (oracle.revision !== ORACLE_REVISION) fail('result.identities.oracle', 'wrong revision');
  string(oracle.tree, 'result.identities.oracle.tree', { pattern: OBJECT_ID });
  string(oracle.buildDigest, 'result.identities.oracle.buildDigest', { pattern: DIGEST });
  if (identities.cacheCompatibility === null) {
    if (declaredGreen) {
      fail(
        'result.identities.cacheCompatibility',
        'green result requires the admitted compatibility identity',
      );
    }
  } else {
    const cacheCompatibility = exactKeys(
    identities.cacheCompatibility,
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
    [],
    'result.identities.cacheCompatibility',
  );
  if (cacheCompatibility.schemaVersion !== 1) {
    fail('result.identities.cacheCompatibility.schemaVersion', 'must equal 1');
  }
  for (const name of [
    'preparedFromRevision',
    'productRevision',
    'harnessRevision',
    'oracleRevision',
  ]) {
    string(
      cacheCompatibility[name],
      `result.identities.cacheCompatibility.${name}`,
      { pattern: OBJECT_ID },
    );
  }
  if (
    cacheCompatibility.productRevision !== identities.product.revision ||
    cacheCompatibility.harnessRevision !== identities.harness.revision ||
    cacheCompatibility.oracleRevision !== identities.oracle.revision
  ) {
    fail(
      'result.identities.cacheCompatibility',
      'revision identities do not match the accepted result identities',
    );
  }
  const exactCacheCounts = {
    authorities: CACHE_AUTHORITY_COUNT,
    npmLocks: NPM_LOCK_AUTHORITY_COUNT,
    productLocks: PRODUCT_PACKAGE_LOCK_PATHS.length,
    goFiles: 2,
    queryModuleLocks: 2,
    uvLocks: 1,
  };
  for (const [name, expected] of Object.entries(exactCacheCounts)) {
    if (cacheCompatibility[name] !== expected) {
      fail(
        `result.identities.cacheCompatibility.${name}`,
        `must equal ${expected}`,
      );
    }
  }
  for (const name of [
    'cacheManifestSha256',
    'cacheRootSha256',
    'evidenceSha256',
    'preAdmissionAuthoritySetSha256',
    'postCleanupAuthoritySetSha256',
  ]) {
    string(
      cacheCompatibility[name],
      `result.identities.cacheCompatibility.${name}`,
      { pattern: DIGEST },
    );
  }
    assertSafeRelativePath(
      cacheCompatibility.evidencePath,
      'result.identities.cacheCompatibility.evidencePath',
    );
  }
  const toolIdentities = object(identities.tools, 'result.identities.tools');
  const expectedTools = [
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
  ];
  exactKeys(toolIdentities, expectedTools, [], 'result.identities.tools');
  for (const name of expectedTools) {
    const identity = exactKeys(
      toolIdentities[name],
      ['version', 'sha256'],
      [],
      `result.identities.tools.${name}`,
    );
    string(identity.version, `result.identities.tools.${name}.version`, {
      max: 128,
    });
    string(identity.sha256, `result.identities.tools.${name}.sha256`, {
      pattern: DIGEST,
    });
  }
  const browser = exactKeys(
    identities.browser,
    ['name', 'version', 'executableDigest'],
    [],
    'result.identities.browser',
  );
  if (browser.name !== 'chromium') fail('result.identities.browser.name', 'must be chromium');
  string(browser.version, 'result.identities.browser.version', { max: 64 });
  string(browser.executableDigest, 'result.identities.browser.executableDigest', {
    pattern: DIGEST,
  });
  const historicalGo = exactKeys(
    identities.historicalGo,
    ['rootDigest', 'ownerFixedInPlace', 'copied', 'hermetic'],
    [],
    'result.identities.historicalGo',
  );
  string(
    historicalGo.rootDigest,
    'result.identities.historicalGo.rootDigest',
    { pattern: DIGEST },
  );
  if (
    historicalGo.ownerFixedInPlace !== true ||
    historicalGo.copied !== false ||
    historicalGo.hermetic !== false
  ) {
    fail(
      'result.identities.historicalGo',
      'must disclose the exact owner-fixed-in-place non-hermetic exception',
    );
  }
  const runtimeClosures = exactKeys(
    identities.runtimeClosures,
    [
      'currentNodeSource',
      'currentNode',
      'queryNode',
      'currentNpmSource',
      'currentNpm',
      'queryNpm',
      'currentGoSource',
      'currentGo',
      'historicalGo',
      'pythonSource',
      'python',
      'uvSource',
      'uv',
      'dockerSource',
      'docker',
      'browserSource',
      'browserCopy',
    ],
    [],
    'result.identities.runtimeClosures',
  );
  const expectedRuntimeClosures = Object.freeze({
    currentNodeSource: ['directory', 'read-only-source', false, false],
    currentNode: ['directory', 'run-owned-copy', true, true],
    queryNode: ['directory', 'owner-fixed-in-place', false, false],
    currentNpmSource: ['directory', 'read-only-source', false, false],
    currentNpm: ['directory', 'run-owned-copy', true, true],
    queryNpm: ['directory', 'owner-fixed-in-place', false, false],
    currentGoSource: ['directory', 'read-only-source', false, false],
    currentGo: ['directory', 'run-owned-copy', true, true],
    historicalGo: ['directory', 'owner-fixed-in-place', false, false],
    pythonSource: ['directory', 'read-only-source', false, false],
    python: ['directory', 'run-owned-copy', true, true],
    uvSource: ['single-file', 'read-only-source', false, false],
    uv: ['single-file', 'run-owned-copy', true, true],
    dockerSource: ['single-file', 'read-only-source', false, false],
    docker: ['single-file', 'run-owned-copy', true, true],
    browserSource: ['directory', 'read-only-source', false, false],
    browserCopy: ['directory', 'run-owned-copy', true, true],
  });
  for (const [name, expected] of Object.entries(expectedRuntimeClosures)) {
    const declaration = exactKeys(
      runtimeClosures[name],
      [
        'shape',
        'classification',
        'rootDigest',
        'identityDigest',
        'copied',
        'hermetic',
      ],
      [],
      `result.identities.runtimeClosures.${name}`,
    );
    enumeration(
      declaration.shape,
      [expected[0]],
      `result.identities.runtimeClosures.${name}.shape`,
    );
    enumeration(
      declaration.classification,
      [expected[1]],
      `result.identities.runtimeClosures.${name}.classification`,
    );
    string(
      declaration.rootDigest,
      `result.identities.runtimeClosures.${name}.rootDigest`,
      { pattern: DIGEST },
    );
    string(
      declaration.identityDigest,
      `result.identities.runtimeClosures.${name}.identityDigest`,
      { pattern: DIGEST },
    );
    if (
      declaration.copied !== expected[2] ||
      declaration.hermetic !== expected[3]
    ) {
      fail(
        `result.identities.runtimeClosures.${name}`,
        'does not match the reviewed runtime closure disclosure',
      );
    }
  }
  const budgetsIdentity = exactKeys(
    identities.budgets,
    ['profileId', 'digest'],
    [],
    'result.identities.budgets',
  );
  if (
    budgetsIdentity.profileId !== budgets.profile.id ||
    budgetsIdentity.profileId !== 'darwin-arm64-development-v1'
  ) {
    fail('result.identities.budgets.profileId', 'does not match the reviewed profile');
  }
  if (budgetsIdentity.digest !== BUDGETS_IDENTITY_DIGEST) {
    fail('result.identities.budgets.digest', 'does not match the closed budgets');
  }
  const machine = exactKeys(
    result.machine,
    ['profileId', 'os', 'architecture', 'release', 'logicalCpuCount', 'memoryBytes', 'dockerVersion'],
    [],
    'result.machine',
  );
  if (
    machine.profileId !== 'darwin-arm64-development-v1' ||
    machine.os !== 'darwin' ||
    machine.architecture !== 'arm64'
  ) {
    fail('result.machine', 'does not match the reviewed profile');
  }
  string(machine.release, 'result.machine.release', { max: 128 });
  integer(machine.logicalCpuCount, 'result.machine.logicalCpuCount', { min: 1, max: 4096 });
  integer(machine.memoryBytes, 'result.machine.memoryBytes', { min: 1 });
  string(machine.dockerVersion, 'result.machine.dockerVersion', { max: 128 });
  const measurements = array(result.measurements, 'result.measurements', { max: 512 });
  unique(measurements, (measurement) => measurement?.id, 'result.measurements');
  const measured = new Map();
  for (const [index, raw] of measurements.entries()) {
    const label = `result.measurements[${index}]`;
    const measurement = exactKeys(
      raw,
      ['id', 'value', 'unit', 'budgetId', 'decision'],
      [],
      label,
    );
    string(measurement.id, `${label}.id`, { pattern: TOKEN });
    const declaration = REQUIRED_MEASUREMENTS[measurement.id];
    if (!declaration) fail(`${label}.id`, 'is not in the closed measurement registry');
    finite(measurement.value, `${label}.value`);
    enumeration(measurement.unit, MEASUREMENT_UNITS, `${label}.unit`);
    if (measurement.unit !== declaration.unit) {
      fail(`${label}.unit`, `must equal ${declaration.unit}`);
    }
    enumeration(measurement.decision, ['pass', 'fail', 'observed'], `${label}.decision`);
    if (
      measurement.budgetId !== declaration.budgetId ||
      measurement.decision !==
        (declaration.budgetId === null
          ? 'observed'
          : measurementPasses(measurement.value, declaration)
            ? 'pass'
            : 'fail')
    ) {
      fail(label, 'budget identity or decision differs from the closed measurement declaration');
    }
    measured.set(measurement.id, measurement);
  }
  const cells = array(result.cells, 'result.cells', {
    min: matrix.cells.length,
    max: matrix.cells.length,
  });
  for (const [index, raw] of cells.entries()) {
    const label = `result.cells[${index}]`;
    const cell = exactKeys(
      raw,
      ['id', 'owner', 'status', 'durationMs', 'evidence', 'failure'],
      [],
      label,
    );
    if (cell.id !== matrix.cells[index].id || cell.owner !== matrix.cells[index].owner) {
      fail(label, 'does not match the closed matrix cell');
    }
    enumeration(cell.status, ['pass', 'fail', 'blocked'], `${label}.status`);
    integer(cell.durationMs, `${label}.durationMs`, { max: 7_200_000 });
    if (cell.durationMs > matrix.cells[index].timeoutMs) {
      fail(`${label}.durationMs`, 'exceeds the closed cell timeout');
    }
    const evidence = array(cell.evidence, `${label}.evidence`, { max: 64 });
    evidence.forEach((entry, evidenceIndex) =>
      validateResultEvidenceDescriptor(
        entry,
        `${label}.evidence[${evidenceIndex}]`,
      ),
    );
    if (cell.status === 'pass') {
      if (cell.failure !== null) fail(`${label}.failure`, 'must be null for pass');
      const kinds = new Set(evidence.map((entry) => entry.kind));
      for (const required of matrix.cells[index].evidence) {
        if (!kinds.has(required)) {
          fail(`${label}.evidence`, `missing required evidence kind ${required}`);
        }
      }
    } else {
      const failure_ = exactKeys(
        cell.failure,
        ['code', 'summary', 'blockedBy'],
        [],
        `${label}.failure`,
      );
      string(failure_.code, `${label}.failure.code`, {
        pattern: /^[A-Z][A-Z0-9_]{2,63}$/u,
      });
      string(failure_.summary, `${label}.failure.summary`, { max: 512 });
      if (cell.status === 'blocked') {
        string(failure_.blockedBy, `${label}.failure.blockedBy`, {
          pattern: /^[a-z][a-z0-9.-]{2,95}$/u,
        });
      } else if (failure_.blockedBy !== null) {
        fail(`${label}.failure.blockedBy`, 'must be null for a direct failure');
      }
    }
  }
  const seals = exactKeys(
    result.seals,
    ['inputBefore', 'inputAfter', 'outputDigest', 'residue'],
    [],
    'result.seals',
  );
  for (const name of ['inputBefore', 'inputAfter', 'outputDigest']) {
    string(seals[name], `result.seals.${name}`, { pattern: DIGEST });
  }
  if (declaredGreen && seals.inputBefore !== seals.inputAfter) {
    fail('result.seals', 'protected input seal changed');
  }
  const residue = exactKeys(
    seals.residue,
    ['processes', 'listeners', 'containers', 'images', 'networks', 'files'],
    [],
    'result.seals.residue',
  );
  for (const [name, count] of Object.entries(residue)) {
    integer(count, `result.seals.residue.${name}`, { max: 1_000_000 });
  }
  const lifecycle = exactKeys(
    result.lifecycle,
    ['specified', 'implemented', 'verified', 'committed', 'pushed', 'released', 'deployed'],
    [],
    'result.lifecycle',
  );
  for (const name of ['specified', 'implemented', 'verified', 'committed', 'pushed']) {
    boolean(lifecycle[name], `result.lifecycle.${name}`);
  }
  if (lifecycle.released !== false || lifecycle.deployed !== false) {
    fail('result.lifecycle', 'released and deployed must remain false');
  }
  const green = cells.every((cell) => cell.status === 'pass');
  const directFailures = cells
    .map((cell, index) => ({ cell, index }))
    .filter(({ cell }) => cell.status === 'fail');
  if (!green) {
    if (directFailures.length !== 1) {
      fail('result.cells', 'non-green result requires exactly one direct failure');
    }
    const [{ cell: directFailure, index: failedIndex }] = directFailures;
    for (let index = 0; index < cells.length; index += 1) {
      const cell = cells[index];
      if (index < failedIndex && cell.status !== 'pass') {
        fail(`result.cells[${index}]`, 'cell before the direct failure must pass');
      }
      if (index > failedIndex) {
        if (
          cell.status !== 'blocked' ||
          cell.failure?.code !== 'BLOCKED_BY_FAILURE' ||
          cell.failure?.blockedBy !== directFailure.id ||
          cell.failure?.summary !== `blocked by ${directFailure.id}`
        ) {
          fail(
            `result.cells[${index}]`,
            'cell after the direct failure is not the exact fail-fast blocked shape',
          );
        }
      }
    }
  }
  if (seals.outputDigest !== resultOutputDigest(result)) {
    fail('result.seals.outputDigest', 'does not match the canonical result content');
  }
  if (green) {
    const requiredIds = Object.keys(REQUIRED_MEASUREMENTS);
    if (
      measurements.length !== requiredIds.length ||
      requiredIds.some((id) => !measured.has(id))
    ) {
      fail('result.measurements', 'missing required closed measurement');
    }
    if (Object.values(residue).some((count) => count !== 0)) {
      fail('result.seals.residue', 'green result requires zero residue');
    }
    if (
      measurements.some(
        (measurement) =>
          measurement.budgetId !== null && measurement.decision !== 'pass',
      )
    ) {
      fail('result.measurements', 'green result requires every budget decision to pass');
    }
    if (
      !lifecycle.specified ||
      !lifecycle.implemented ||
      !lifecycle.verified ||
      !lifecycle.committed
    ) {
      fail(
        'result.lifecycle',
        'green result requires specified, implemented, verified, and committed',
      );
    }
  }
  if (green && result.verdict !== RESULT_VERDICT) {
    fail('result.verdict', 'green result has no exact verdict');
  }
  if (!green && result.verdict !== null) {
    fail('result.verdict', 'non-green result must not emit a verdict');
  }
  assertNoSensitiveStrings(result);
  return result;
}

export function evaluateBound(measurement, declaration, label = 'measurement') {
  finite(measurement.value, `${label}.value`);
  if (measurement.unit !== declaration.unit) fail(label, 'uses the wrong unit');
  const passed =
    declaration.comparison === 'lt'
      ? measurement.value < declaration.value
      : measurement.value <= declaration.value;
  return Object.freeze({
    ...measurement,
    budgetId: measurement.budgetId,
    decision: passed ? 'pass' : 'fail',
  });
}
