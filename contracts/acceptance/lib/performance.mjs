import fs from 'node:fs';
import path from 'node:path';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip, gzipSync } from 'node:zlib';

import { REQUIRED_MEASUREMENTS, measurementPasses } from './measurements.mjs';
import { requireCanonicalPath } from './paths.mjs';

export class PerformanceAcceptanceError extends Error {}

function fail(message) {
  throw new PerformanceAcceptanceError(message);
}

const PROFILE_BUDGETS = Object.freeze({
  backendReadyMs: 'backendReadyMs',
  backendShutdownMs: 'backendShutdownMs',
  backendMemoryHardLimitBytes: 'backendMemoryHardLimitBytes',
  browserJourneyMs: 'browserJourneyMs',
  suiteMs: 'suiteMs',
});

function declarationBudget(budgets, budgetId) {
  if (Object.hasOwn(PROFILE_BUDGETS, budgetId)) {
    const name = PROFILE_BUDGETS[budgetId];
    return Object.freeze({
      comparison: 'lte',
      unit:
        name.endsWith('Bytes') ? 'bytes' : 'milliseconds',
      value: budgets.profile.ceilings[name],
    });
  }
  return budgets.invariants[budgetId] ?? null;
}

function assertClosedBudgets(budgets) {
  for (const [id, declaration] of Object.entries(REQUIRED_MEASUREMENTS)) {
    if (declaration.budgetId === null) continue;
    const configured = declarationBudget(budgets, declaration.budgetId);
    if (
      !configured ||
      configured.comparison !== declaration.comparison ||
      configured.unit !== declaration.unit ||
      configured.value !== declaration.value
    ) {
      fail(`closed budget declaration drifted for ${id}`);
    }
  }
}

function nonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(`${label} must be a non-negative safe integer`);
  }
  return value;
}

export class MeasurementRecorder {
  #measurements = new Map();

  constructor(budgets) {
    assertClosedBudgets(budgets);
    this.budgets = budgets;
  }

  record(id, value, unit = REQUIRED_MEASUREMENTS[id]?.unit) {
    const declaration = REQUIRED_MEASUREMENTS[id];
    if (!declaration) fail(`unknown closed measurement ${id}`);
    if (this.#measurements.has(id)) fail(`duplicate closed measurement ${id}`);
    if (unit !== declaration.unit) {
      fail(`${id} uses ${unit ?? '(missing)'} instead of ${declaration.unit}`);
    }
    nonNegativeInteger(value, id);
    const decision =
      declaration.budgetId === null
        ? 'observed'
        : measurementPasses(value, declaration)
          ? 'pass'
          : 'fail';
    const measurement = Object.freeze({
      id,
      value,
      unit,
      budgetId: declaration.budgetId,
      decision,
    });
    this.#measurements.set(id, measurement);
    return measurement;
  }

  has(id) {
    return this.#measurements.has(id);
  }

  snapshot({ complete = false, passing = false } = {}) {
    const missing = Object.keys(REQUIRED_MEASUREMENTS).filter(
      (id) => !this.#measurements.has(id),
    );
    if (complete && missing.length > 0) {
      fail(`missing required closed measurements: ${missing.join(', ')}`);
    }
    const result = Object.keys(REQUIRED_MEASUREMENTS)
      .filter((id) => this.#measurements.has(id))
      .map((id) => this.#measurements.get(id));
    if (
      passing &&
      result.some(
        (measurement) =>
          measurement.budgetId !== null && measurement.decision !== 'pass',
      )
    ) {
      const failed = result
        .filter(
          (measurement) =>
            measurement.budgetId !== null && measurement.decision !== 'pass',
        )
        .map((measurement) => measurement.id);
      fail(`development budget exceeded: ${failed.join(', ')}`);
    }
    return Object.freeze(result);
  }
}

function sumArtifactBytes(statement) {
  if (!Array.isArray(statement?.artifacts) || statement.artifacts.length === 0) {
    fail('component statement has no artifact inventory');
  }
  return statement.artifacts.reduce(
    (total, artifact) =>
      total + nonNegativeInteger(artifact.size, `${statement.component} artifact size`),
    0,
  );
}

async function gzipFileSize(filePath) {
  let bytes = 0;
  const counter = new Writable({
    write(chunk, _encoding, callback) {
      bytes += chunk.length;
      callback();
    },
  });
  await pipeline(
    fs.createReadStream(filePath),
    createGzip(),
    counter,
  );
  return nonNegativeInteger(bytes, `compressed size for ${path.basename(filePath)}`);
}

async function compressedArtifactBytes(root, statement) {
  let total = 0;
  for (const artifact of statement.artifacts) {
    const filePath = requireCanonicalPath(
      path.join(root, ...artifact.path.split('/')),
      {
        below: root,
        label: `${statement.component} measured artifact`,
        type: 'file',
      },
    );
    if (fs.statSync(filePath).size !== artifact.size) {
      fail(`${statement.component} artifact size changed before measurement`);
    }
    total += await gzipFileSize(filePath);
  }
  return nonNegativeInteger(total, `${statement.component} compressed bytes`);
}

function htmlAttributes(tag) {
  const attributes = new Map();
  const pattern =
    /\s([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu;
  for (const match of tag.matchAll(pattern)) {
    attributes.set(
      match[1].toLowerCase(),
      match[2] ?? match[3] ?? match[4] ?? '',
    );
  }
  return attributes;
}

function localFrontendReference(root, reference) {
  if (
    typeof reference !== 'string' ||
    reference === '' ||
    /^(?:[a-z]+:)?\/\//iu.test(reference)
  ) {
    fail('initial frontend module reference is not one local path');
  }
  const pathname = reference.split(/[?#]/u, 1)[0].replace(/^\/+/u, '');
  if (
    pathname === '' ||
    pathname.includes('\\') ||
    pathname.split('/').some((part) => part === '' || part === '.' || part === '..')
  ) {
    fail('initial frontend module reference is unsafe');
  }
  return requireCanonicalPath(path.join(root, ...pathname.split('/')), {
    below: root,
    label: 'initial frontend JavaScript',
    type: 'file',
  });
}

export function initialJavaScriptGzipBytes(frontendRoot) {
  const root = requireCanonicalPath(frontendRoot, {
    label: 'measured frontend root',
    type: 'directory',
  });
  const source = fs.readFileSync(
    requireCanonicalPath(path.join(root, 'index.html'), {
      below: root,
      label: 'measured frontend index',
      type: 'file',
    }),
    'utf8',
  );
  const files = new Set();
  for (const match of source.matchAll(/<(script|link)\b[^>]*>/giu)) {
    const tag = match[1].toLowerCase();
    const attributes = htmlAttributes(match[0]);
    const moduleScript =
      tag === 'script' && attributes.get('type')?.toLowerCase() === 'module';
    const modulePreload =
      tag === 'link' && attributes.get('rel')?.toLowerCase() === 'modulepreload';
    if (!moduleScript && !modulePreload) continue;
    const reference = moduleScript
      ? attributes.get('src')
      : attributes.get('href');
    const filePath = localFrontendReference(root, reference);
    if (path.extname(filePath).toLowerCase() !== '.js') {
      fail('initial frontend module reference is not JavaScript');
    }
    files.add(filePath);
  }
  if (files.size === 0) fail('frontend artifact has no initial JavaScript module');
  return [...files].reduce(
    (total, filePath) => total + gzipSync(fs.readFileSync(filePath)).byteLength,
    0,
  );
}

export async function recordArtifactMeasurements(
  recorder,
  artifactAttestation,
  frontendRoot,
) {
  for (const component of ['backend', 'updater', 'frontend']) {
    recorder.record(
      `artifact.${component}Bytes`,
      sumArtifactBytes(artifactAttestation.statements[component]),
    );
    recorder.record(
      `artifact.${component}CompressedBytes`,
      await compressedArtifactBytes(
        artifactAttestation.roots[component],
        artifactAttestation.statements[component],
      ),
    );
  }
  recorder.record(
    'frontend.initialJavaScriptGzipBytes',
    initialJavaScriptGzipBytes(frontendRoot),
  );
}

export function recordArchiveMeasurements(
  recorder,
  archiveAttestation,
  copyDurationMs,
) {
  const facts = archiveAttestation.facts;
  recorder.record('archive.manifestBytes', facts.manifestBytes);
  recorder.record('archive.sqliteBytes', facts.sqliteBytes);
  recorder.record('archive.sourceCount', Object.keys(facts.sources).length);
  recorder.record('archive.tableCount', Object.keys(facts.tableCounts).length);
  recorder.record('archive.sourceBytes', facts.sourceBytes);
  recorder.record('archive.sourceRecords', facts.sourceRecords);
  recorder.record('archive.copyMs', copyDurationMs);
  for (const [source, values] of Object.entries(facts.sources)) {
    recorder.record(`archive.source.${source}.bytes`, values.bytes);
    recorder.record(`archive.source.${source}.records`, values.records);
  }
  for (const [table, rows] of Object.entries(facts.tableCounts)) {
    recorder.record(`archive.table.${table}.rows`, rows);
  }
}

export function recordApiMeasurements(recorder, apiJourney) {
  for (const [source, target] of [
    ['rankings', 'rankings'],
    ['candidates', 'candidates'],
    ['personDetail', 'personDetail'],
    ['partners', 'partners'],
    ['pair', 'coStarPair'],
    ['group', 'coStarGroup'],
  ]) {
    const timing = apiJourney.timings[source];
    if (!timing) fail(`API journey omitted ${source} timing`);
    for (const suffix of ['coldMs', 'warmMs', 'coldBytes', 'warmBytes']) {
      recorder.record(`api.${target}.${suffix}`, timing[suffix]);
    }
  }
}

function metricLines(source, name, label) {
  const values = [];
  for (const line of source.split(/\r?\n/u)) {
    if (!line.startsWith(name)) continue;
    const match = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+([0-9]+(?:\.[0-9]+)?)$/u.exec(
      line,
    );
    if (!match || match[1] !== name) fail(`invalid ${label} metric line`);
    const value = Number(match[3]);
    if (!Number.isFinite(value) || value < 0) fail(`invalid ${label} metric value`);
    values.push({ labels: match[2] ?? '', value });
  }
  return values;
}

export function parseBackendMetrics(source) {
  if (typeof source !== 'string' || source.length === 0) {
    fail('Backend metrics text is absent');
  }
  const resultItems = metricLines(
    source,
    'bgmss_query_cache_items',
    'cache items',
  ).find((entry) => entry.labels.includes('cache="result"'))?.value;
  const resultBytes = metricLines(
    source,
    'bgmss_query_cache_retained_bytes',
    'cache retained bytes',
  ).find((entry) => entry.labels.includes('cache="result"'))?.value;
  const requests = metricLines(
    source,
    'bgmss_http_requests_total',
    'HTTP request count',
  ).reduce((total, entry) => total + entry.value, 0);
  if (
    !Number.isSafeInteger(resultItems) ||
    !Number.isSafeInteger(resultBytes) ||
    !Number.isSafeInteger(requests)
  ) {
    fail('Backend metrics omit integer result-cache or request counters');
  }
  return Object.freeze({
    cacheResultBytes: resultBytes,
    cacheResultItems: resultItems,
    cacheResultPerItemBytes:
      resultItems === 0 ? 0 : Math.ceil(resultBytes / resultItems),
    requestCount: requests,
  });
}

export function recordBackendMeasurements(
  recorder,
  {
    cpuNanoseconds,
    metricsText,
    sampledHighWaterMemoryBytes,
    queryTestBinaryBytes,
    readyMs,
    shutdownMs,
  },
) {
  const metrics = parseBackendMetrics(metricsText);
  recorder.record('backend.queryTestBinaryBytes', queryTestBinaryBytes);
  recorder.record('backend.readyMs', readyMs);
  recorder.record('backend.shutdownMs', shutdownMs);
  recorder.record('backend.cpuNanoseconds', cpuNanoseconds);
  recorder.record(
    'backend.sampledHighWaterMemoryBytes',
    sampledHighWaterMemoryBytes,
  );
  recorder.record('backend.cacheResultItems', metrics.cacheResultItems);
  recorder.record('backend.cacheResultBytes', metrics.cacheResultBytes);
  recorder.record(
    'backend.cacheResultPerItemBytes',
    metrics.cacheResultPerItemBytes,
  );
  recorder.record('backend.requestCount', metrics.requestCount);
}

export function recordBrowserMeasurements(recorder, facts) {
  for (const [id, value] of [
    ['browser.readyMs', facts.readyMs],
    ['browser.actionMs', facts.actionMs],
    ['browser.journeyMs', facts.journeyMs],
    ['browser.transferBytes', facts.transferBytes],
    ['browser.requestCount', facts.requestCount],
    ['browser.domNodes', facts.domNodes],
  ]) {
    recorder.record(id, value);
  }
}

export function recordSuiteMeasurement(recorder, durationMs) {
  recorder.record('suite.durationMs', durationMs);
}
