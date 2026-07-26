const observed = (unit) => Object.freeze({
  budgetId: null,
  decision: 'observed',
  unit,
});

const budgeted = (unit, budgetId, comparison, value) => Object.freeze({
  budgetId,
  comparison,
  decision: 'pass',
  unit,
  value,
});

const declarations = {
  'archive.manifestBytes': observed('bytes'),
  'archive.sqliteBytes': observed('bytes'),
  'archive.sourceCount': observed('count'),
  'archive.tableCount': observed('count'),
  'archive.sourceBytes': observed('bytes'),
  'archive.sourceRecords': observed('count'),
  'archive.copyMs': observed('milliseconds'),
  'artifact.backendBytes': observed('bytes'),
  'artifact.updaterBytes': observed('bytes'),
  'artifact.frontendBytes': observed('bytes'),
  'artifact.backendCompressedBytes': observed('bytes'),
  'artifact.updaterCompressedBytes': observed('bytes'),
  'artifact.frontendCompressedBytes': observed('bytes'),
  'frontend.initialJavaScriptGzipBytes': budgeted(
    'bytes',
    'frontendInitialJavaScriptGzipBytes',
    'lt',
    307_200,
  ),
  'backend.queryTestBinaryBytes': budgeted(
    'bytes',
    'backendQueryTestBinaryBytes',
    'lte',
    16_777_216,
  ),
  'backend.readyMs': budgeted(
    'milliseconds',
    'backendReadyMs',
    'lte',
    120_000,
  ),
  'backend.shutdownMs': budgeted(
    'milliseconds',
    'backendShutdownMs',
    'lte',
    15_000,
  ),
  'backend.cpuNanoseconds': observed('nanoseconds'),
  'backend.sampledHighWaterMemoryBytes': observed('bytes'),
  'backend.cacheResultItems': budgeted(
    'items',
    'cacheResultItems',
    'lte',
    512,
  ),
  'backend.cacheResultBytes': budgeted(
    'bytes',
    'cacheResultBytes',
    'lte',
    199_229_440,
  ),
  'backend.cacheResultPerItemBytes': budgeted(
    'bytes',
    'cacheResultPerItemBytes',
    'lte',
    33_554_432,
  ),
  'backend.requestCount': observed('count'),
  'browser.readyMs': observed('milliseconds'),
  'browser.actionMs': observed('milliseconds'),
  'browser.journeyMs': budgeted(
    'milliseconds',
    'browserJourneyMs',
    'lte',
    120_000,
  ),
  'browser.transferBytes': observed('bytes'),
  'browser.requestCount': observed('count'),
  'browser.domNodes': observed('count'),
  'suite.durationMs': budgeted(
    'milliseconds',
    'suiteMs',
    'lte',
    7_200_000,
  ),
};

for (const source of [
  'subject',
  'person',
  'character',
  'subjectPersons',
  'subjectCharacters',
  'personCharacters',
  'subjectRelations',
]) {
  declarations[`archive.source.${source}.bytes`] = observed('bytes');
  declarations[`archive.source.${source}.records`] = observed('count');
}

for (const table of [
  'archive_meta',
  'subject',
  'subject_rating_bucket',
  'subject_tag',
  'person',
  'person_career',
  'character',
  'subject_relation',
  'staff_position',
  'staff_position_category',
  'staff_credit',
  'cast_credit',
  'staff_set',
  'staff_set_member',
  'catalog_position',
  'catalog_position_member',
  'catalog_group',
  'catalog_group_member',
  'catalog_capability',
  'catalog_selection_rule',
]) {
  declarations[`archive.table.${table}.rows`] = observed('count');
}

for (const endpoint of [
  'rankings',
  'candidates',
  'personDetail',
  'partners',
  'coStarPair',
  'coStarGroup',
]) {
  declarations[`api.${endpoint}.coldMs`] = budgeted(
    'milliseconds',
    'apiRequestMs',
    'lt',
    30_000,
  );
  declarations[`api.${endpoint}.warmMs`] = budgeted(
    'milliseconds',
    'apiRequestMs',
    'lt',
    30_000,
  );
  declarations[`api.${endpoint}.coldBytes`] = observed('bytes');
  declarations[`api.${endpoint}.warmBytes`] = observed('bytes');
}

export const REQUIRED_MEASUREMENTS = Object.freeze(
  Object.fromEntries(
    Object.entries(declarations).map(([id, declaration]) => [
      id,
      Object.freeze(declaration),
    ]),
  ),
);

export function measurementPasses(value, declaration) {
  if (declaration.budgetId === null) return true;
  return declaration.comparison === 'lt'
    ? value < declaration.value
    : value <= declaration.value;
}
