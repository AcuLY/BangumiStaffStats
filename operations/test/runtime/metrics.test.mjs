import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const metricsSource = fs.readFileSync(
  new URL('../../../backend/internal/observability/metrics.go', import.meta.url),
  'utf8',
);
const rules = fs.readFileSync(
  new URL('../../prometheus/rules.yml', import.meta.url),
  'utf8',
);

function exportedMetricNames() {
  const names = new Set(
    [...metricsSource.matchAll(/"(bgmss_[a-z0-9_]+)"/gu)].map(
      (match) => match[1],
    ),
  );
  assert.match(
    metricsSource,
    /"bgmss_updater_" \+ prefix \+ "_info"/u,
  );
  assert.match(
    metricsSource,
    /"bgmss_updater_" \+ prefix \+ "_duration_seconds"/u,
  );
  for (const prefix of ['last_attempt', 'last_success']) {
    names.add(`bgmss_updater_${prefix}_info`);
    names.add(`bgmss_updater_${prefix}_duration_seconds`);
    names.add(`bgmss_updater_${prefix}_time_seconds`);
  }
  return names;
}

test('every repository alert refers to an actually exported API metric', () => {
  const exported = exportedMetricNames();
  const referenced = new Set(
    [...rules.matchAll(/\b(bgmss_[a-z0-9_]+)\b/gu)].map(
      (match) => match[1],
    ),
  );
  assert.ok(referenced.size > 0);
  for (const name of referenced) {
    assert.ok(exported.has(name), `Prometheus rule invents ${name}`);
  }
  assert.equal(referenced.has('bgmss_updater_last_success_time_seconds'), false);
});

test('Prometheus remains private and independent from API readiness', () => {
  const composeSource = fs.readFileSync(
    new URL('../../compose/model.mjs', import.meta.url),
    'utf8',
  );
  assert.match(composeSource, /prometheus\.depends_on\?\.api/u);
  assert.match(
    composeSource,
    /api\.depends_on !== undefined/u,
  );
  assert.match(
    composeSource,
    /Object\.hasOwn\(prometheus, 'ports'\)/u,
  );
});
