import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import { requireCanonicalPath } from './paths.mjs';
import { readJsonStrict } from './strict-json.mjs';

export class ApiJourneyError extends Error {}

const OPERATIONS = Object.freeze([
  'rankings',
  'candidates',
  'person-detail',
  'partners',
  'co-star',
]);

function fail(message) {
  throw new ApiJourneyError(message);
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value;
}

function requireArray(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  return value;
}

function schemaFiles(root) {
  const files = [];
  function visit(directory) {
    for (const entry of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && entry.name.endsWith('.schema.json')) files.push(absolute);
    }
  }
  for (const directory of [
    'query',
    'rankings',
    'candidates',
    'person-detail',
    'partners',
    'co-star',
  ]) {
    visit(path.join(root, directory));
  }
  return files;
}

function catalogSchemaDocument(candidateRoot) {
  const openapi = readJsonStrict(
    path.join(candidateRoot, 'contracts', 'openapi', 'openapi.yaml'),
  );
  const schemas = structuredClone(
    requireObject(openapi.components?.schemas, 'OpenAPI component schemas'),
  );
  function rewriteReferences(value) {
    if (Array.isArray(value)) {
      for (const item of value) rewriteReferences(item);
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (
        key === '$ref' &&
        typeof item === 'string' &&
        item.startsWith('#/components/schemas/')
      ) {
        value[key] = `#/$defs/${item.slice('#/components/schemas/'.length)}`;
      } else {
        rewriteReferences(item);
      }
    }
  }
  rewriteReferences(schemas);
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'urn:bgmss:acceptance:catalog-success',
    $ref: '#/$defs/CatalogSuccessEnvelopeV1',
    $defs: schemas,
  };
}

export function loadApiSchemaValidators(candidateRoot) {
  const root = requireCanonicalPath(candidateRoot, {
    label: 'API validator candidate root',
    type: 'directory',
  });
  const packagePath = requireCanonicalPath(
    path.join(root, 'contracts', 'goldens', 'api', 'rankings', 'package.json'),
    { label: 'API validator package', type: 'file' },
  );
  const require = createRequire(packagePath);
  let Ajv2020;
  let addFormats;
  try {
    Ajv2020 = require('ajv/dist/2020').default;
    addFormats = require('ajv-formats').default;
  } catch (error) {
    fail(`accepted API validator closure is unavailable: ${error.message}`);
  }
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    validateFormats: true,
  });
  addFormats(ajv);
  const schemaRoot = path.join(root, 'contracts', 'schemas');
  const documents = schemaFiles(schemaRoot).map((file) => readJsonStrict(file));
  for (const document of documents) {
    if (typeof document.$id !== 'string') fail('API schema omits $id');
    ajv.addSchema(document);
  }
  const catalogDocument = catalogSchemaDocument(root);
  ajv.addSchema(catalogDocument);
  const validators = {};
  for (const operation of OPERATIONS) {
    validators[operation] = {};
    for (const kind of ['request', 'success-envelope']) {
      const file = path.join(
        schemaRoot,
        operation,
        `${kind}-v1.schema.json`,
      );
      const document = readJsonStrict(file);
      const validator = ajv.getSchema(document.$id);
      if (!validator) fail(`API ${operation} ${kind} schema did not compile`);
      validators[operation][kind === 'request' ? 'request' : 'success'] = validator;
    }
  }
  const errorDocument = readJsonStrict(
    path.join(schemaRoot, 'query', 'error-envelope-v1.schema.json'),
  );
  validators.error = ajv.getSchema(errorDocument.$id);
  if (!validators.error) fail('API error envelope schema did not compile');
  validators.catalog = ajv.getSchema(catalogDocument.$id);
  if (!validators.catalog) fail('OpenAPI catalog success schema did not compile');
  return Object.freeze(validators);
}

function assertSchema(validator, value, label) {
  if (!validator(value)) {
    fail(`${label} violates accepted schema: ${JSON.stringify(validator.errors)}`);
  }
}

function assertHttpSuccess(
  response,
  expectedDataVersion,
  label,
  { cacheControl = 'private, no-store' } = {},
) {
  if (response.status !== 200) fail(`${label} returned HTTP ${response.status}`);
  const contentType = response.headers['content-type'] ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    fail(`${label} did not return application/json`);
  }
  if (response.headers['cache-control'] !== cacheControl) {
    fail(`${label} returned an unexpected cache policy`);
  }
  const document = requireObject(response.document, `${label} response`);
  const meta = requireObject(document.meta, `${label} meta`);
  if (meta.dataVersion !== expectedDataVersion) {
    fail(`${label} returned an unexpected dataVersion`);
  }
  if (
    typeof meta.requestId !== 'string' ||
    meta.requestId.length === 0 ||
    response.headers['x-request-id'] !== meta.requestId
  ) {
    fail(`${label} request identity is inconsistent`);
  }
  return document;
}

export function assertCatalogResponse(response, expectedDataVersion, validator) {
  const document = assertHttpSuccess(response, expectedDataVersion, 'catalog', {
    cacheControl: 'no-cache',
  });
  assertSchema(validator, document, 'catalog success');
  const data = requireObject(document.data, 'catalog data');
  const positions = requireArray(data.positions, 'catalog positions');
  if (positions.length === 0) fail('catalog has no positions');
  for (const [index, position] of positions.entries()) {
    requireObject(position, `catalog position ${index}`);
    if (
      typeof position.key !== 'string' ||
      !['anime', 'book', 'game', 'music', 'real'].includes(position.subjectType) ||
      !Array.isArray(position.capabilities) ||
      !['selectable', 'unavailable'].includes(position.status)
    ) {
      fail(`catalog position ${index} is malformed`);
    }
  }
  return positions;
}

function normalizedSearch(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase('und').trim();
}

function itemDisplayText(operation, item) {
  let reference;
  switch (operation) {
    case 'rankings':
    case 'candidates':
    case 'partners':
      reference = item?.person;
      break;
    case 'person-detail':
      reference =
        item?.character ??
        item?.subject ??
        item?.representative;
      break;
    case 'co-star':
      reference = item?.subject ?? item?.representative;
      break;
    default:
      fail(`unsupported API operation ${operation}`);
  }
  return normalizedSearch(
    [reference?.name, reference?.nameCN]
      .filter((value) => typeof value === 'string')
      .join('\n'),
  );
}

function itemSortValue(operation, section, sort, item) {
  switch (operation) {
    case 'rankings':
      if (sort === 'count') return item?.workCount;
      if (sort === 'average') return item?.average;
      if (sort === 'overall') return item?.overall;
      return undefined;
    case 'candidates':
      return sort === 'count' ? item?.workCount : undefined;
    case 'partners':
      if (sort === 'count') return item?.metrics?.workCount;
      if (sort === 'average') return item?.metrics?.average;
      if (sort === 'overall') return item?.metrics?.overall;
      return undefined;
    case 'person-detail':
      if (section === 'characters') {
        if (sort === 'workCount') return item?.workCount;
        if (sort === 'role') return 7 - Number(item?.primaryRole);
        return undefined;
      }
      if (sort === 'globalScore') return item?.globalScore;
      if (sort === 'seriesSize') {
        return item?.kind === 'series' ? item?.memberCount : 1;
      }
      return undefined;
    case 'co-star':
      if (sort === 'globalScore') return item?.globalScore;
      if (sort === 'seriesSize') {
        return item?.kind === 'series' ? item?.memberCount : 1;
      }
      return undefined;
    default:
      return undefined;
  }
}

function assertPrimaryOrder(values, order, label) {
  for (let index = 1; index < values.length; index += 1) {
    const left = values[index - 1];
    const right = values[index];
    if (left == null) {
      if (right != null) fail(`${label} placed a present value after a missing value`);
      continue;
    }
    if (right == null) continue;
    if (
      (order === 'asc' && left > right) ||
      (order === 'desc' && left < right)
    ) {
      fail(`${label} did not honor ${order} primary ordering`);
    }
  }
}

export function assertApiViewSemantics({
  operation,
  request,
  document,
  label = operation,
}) {
  const view = requireObject(request?.view, `${label} view`);
  const data = requireObject(document?.data, `${label} data`);
  const items = requireArray(data.items, `${label} items`);
  const pagination = requireObject(
    document?.meta?.pagination,
    `${label} pagination`,
  );
  if (
    pagination.page !== view.page ||
    pagination.pageSize !== view.pageSize ||
    !Number.isSafeInteger(pagination.total) ||
    pagination.total < 0 ||
    items.length > view.pageSize
  ) {
    fail(`${label} did not honor the requested page`);
  }
  const offset = (view.page - 1) * view.pageSize;
  if (items.length > 0 && pagination.total < offset + items.length) {
    fail(`${label} pagination total is inconsistent with the returned page`);
  }
  if (operation === 'rankings' && data.metricScale?.metric !== view.sort) {
    fail(`${label} metric scale did not bind the requested ranking sort`);
  }
  if (operation === 'person-detail' && data.section !== view.section) {
    fail(`${label} did not honor the requested detail section`);
  }
  const search = normalizedSearch(view.search);
  if (search !== '') {
    if (items.length === 0) fail(`${label} search returned no representative item`);
    for (const [index, item] of items.entries()) {
      if (!itemDisplayText(operation, item).includes(search)) {
        fail(`${label} item ${index} does not match the requested search`);
      }
    }
  }
  const values = items.map((item) =>
    itemSortValue(operation, view.section, view.sort, item),
  );
  if (values.length > 0 && values.every((value) => value !== undefined)) {
    assertPrimaryOrder(values, view.order, `${label} ${view.sort}`);
  }
  return Object.freeze({
    itemCount: items.length,
    page: pagination.page,
    pageSize: pagination.pageSize,
    total: pagination.total,
  });
}

async function acceptedPost({
  runtime,
  validators,
  operation,
  body,
  dataVersion,
}) {
  assertSchema(validators[operation].request, body, `${operation} request`);
  const cold = await runtime.request(`/api/v1/${operation}`, {
    method: 'POST',
    body,
  });
  const coldDocument = assertHttpSuccess(cold, dataVersion, operation);
  assertSchema(validators[operation].success, coldDocument, `${operation} success`);
  assertApiViewSemantics({
    operation,
    request: body,
    document: coldDocument,
    label: operation,
  });
  const warm = await runtime.request(`/api/v1/${operation}`, {
    method: 'POST',
    body,
  });
  const warmDocument = assertHttpSuccess(warm, dataVersion, `${operation} warm`);
  assertSchema(validators[operation].success, warmDocument, `${operation} warm success`);
  assertApiViewSemantics({
    operation,
    request: body,
    document: warmDocument,
    label: `${operation} warm`,
  });
  return Object.freeze({
    request: body,
    cold,
    warm,
    document: coldDocument,
  });
}

async function acceptedVariant({
  runtime,
  validators,
  operation,
  body,
  dataVersion,
  label,
}) {
  assertSchema(validators[operation].request, body, `${label} request`);
  const response = await runtime.request(`/api/v1/${operation}`, {
    method: 'POST',
    body,
  });
  const document = assertHttpSuccess(response, dataVersion, label);
  assertSchema(validators[operation].success, document, `${label} success`);
  assertApiViewSemantics({ operation, request: body, document, label });
  return Object.freeze({ body, response, document });
}

function positionSupports(position, capabilities) {
  return (
    position.status === 'selectable' &&
    capabilities.every((capability) => position.capabilities.includes(capability))
  );
}

function uniquePeople(items) {
  const people = new Map();
  for (const item of items) {
    const person = item?.person;
    if (Number.isSafeInteger(person?.id) && person.id > 0 && !people.has(person.id)) {
      people.set(person.id, person);
    }
  }
  return [...people.values()];
}

async function chooseRealPosition({
  runtime,
  validators,
  positions,
  dataVersion,
}) {
  const capable = positions.filter((position) =>
    positionSupports(position, [
      'rankings',
      'candidates',
      'personDetail',
      'partners',
      'coStar',
    ]),
  );
  for (const position of capable) {
    const query = {
      scope: 'global',
      subjectType: position.subjectType,
      positionKeys: [position.key],
    };
    const candidates = await acceptedPost({
      runtime,
      validators,
      operation: 'candidates',
      body: {
        query,
        input: { positionKey: position.key },
        view: { sort: 'count', order: 'desc', page: 1, pageSize: 20 },
      },
      dataVersion,
    });
    const people = uniquePeople(
      requireArray(candidates.document.data?.items, 'candidate items'),
    );
    if (people.length >= 3) return Object.freeze({ position, query, candidates, people });
  }
  fail('catalog has no all-capability position with three real candidates');
}

async function oversizedRequest(runtime, validators) {
  const response = await runtime.requestRaw('/api/v1/rankings', {
    method: 'POST',
    bodyBytes: Buffer.from(`{"padding":"${'x'.repeat(65_536)}"}`),
    contentType: 'application/json',
    timeoutMs: 30_000,
  });
  const document = response.document;
  if (response.status !== 413) fail(`oversized request returned HTTP ${response.status}`);
  assertSchema(validators.error, document, 'oversized request error');
  if (document.error?.code !== 'REQUEST_TOO_LARGE') {
    fail('oversized request did not return REQUEST_TOO_LARGE');
  }
  return Object.freeze({
    status: response.status,
    bytes: response.bytes.length,
    code: document.error.code,
  });
}

function assertErrorResponse(response, validators, status, code, label) {
  if (response.status !== status) {
    fail(`${label} returned HTTP ${response.status}, expected ${status}`);
  }
  const contentType = String(response.headers['content-type'] ?? '').toLowerCase();
  if (!contentType.startsWith('application/json')) {
    fail(`${label} did not return application/json`);
  }
  assertSchema(validators.error, response.document, `${label} error`);
  if (response.document.error?.code !== code) {
    fail(`${label} did not return ${code}`);
  }
  return response.document;
}

async function malformedAndLimitRequests(runtime, validators, rankingBody) {
  const malformed = await runtime.requestRaw('/api/v1/rankings', {
    method: 'POST',
    bodyBytes: Buffer.from('{"query":'),
    contentType: 'application/json',
  });
  assertErrorResponse(
    malformed,
    validators,
    400,
    'INVALID_JSON',
    'malformed JSON request',
  );
  const invalidLimitBody = {
    ...rankingBody,
    view: {
      ...rankingBody.view,
      pageSize: 100,
    },
  };
  const invalidLimit = await runtime.requestRaw('/api/v1/rankings', {
    method: 'POST',
    bodyBytes: Buffer.from(JSON.stringify(invalidLimitBody)),
    contentType: 'application/json',
  });
  const limitDocument = assertErrorResponse(
    invalidLimit,
    validators,
    400,
    'INVALID_REQUEST',
    'invalid page-size request',
  );
  if (
    !limitDocument.error?.fieldErrors ||
    typeof limitDocument.error.fieldErrors !== 'object' ||
    Array.isArray(limitDocument.error.fieldErrors) ||
    Object.keys(limitDocument.error.fieldErrors).length === 0
  ) {
    fail('invalid page-size request omitted bounded field details');
  }
  const oversized = await oversizedRequest(runtime, validators);
  return Object.freeze({
    malformed: Object.freeze({
      status: malformed.status,
      bytes: malformed.bytes.length,
      code: malformed.document.error.code,
    }),
    invalidLimit: Object.freeze({
      status: invalidLimit.status,
      bytes: invalidLimit.bytes.length,
      code: invalidLimit.document.error.code,
    }),
    oversized,
  });
}

const CANCELED_RANKINGS_SERIES =
  'bgmss_http_requests_total{method="POST",operation="rankings",outcome="canceled",route="rankings",status_class="none"}';

function metricCounter(metrics, series) {
  for (const line of metrics.split(/\r?\n/u)) {
    if (!line.startsWith(`${series} `)) continue;
    const value = Number(line.slice(series.length + 1));
    if (!Number.isSafeInteger(value) || value < 0) {
      fail(`metric ${series} is not a non-negative integer counter`);
    }
    return value;
  }
  return 0;
}

async function canceledRankingsCounter(runtime) {
  const response = await runtime.request('/metrics');
  if (response.status !== 200) fail('cancellation metrics request failed');
  return Object.freeze({
    counter: metricCounter(response.text, CANCELED_RANKINGS_SERIES),
    bytes: response.bytes.length,
  });
}

async function cancellationProbe(runtime, body, dataVersion, validators) {
  const before = await canceledRankingsCounter(runtime);
  const cancellation = await runtime.cancelRequest('/api/v1/rankings', body);
  if (!cancellation.canceled) fail('cancellation probe was not canceled');
  const started = performance.now();
  let after = before;
  while (performance.now() - started < 10_000) {
    after = await canceledRankingsCounter(runtime);
    if (after.counter > before.counter) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (after.counter <= before.counter) {
    fail('Backend did not record the canceled rankings request');
  }
  const latest = await runtime.request('/api/v1/rankings', {
    method: 'POST',
    body,
  });
  const document = assertHttpSuccess(latest, dataVersion, 'post-cancellation rankings');
  assertSchema(validators.rankings.success, document, 'post-cancellation rankings success');
  assertApiViewSemantics({
    operation: 'rankings',
    request: body,
    document,
    label: 'post-cancellation rankings',
  });
  return Object.freeze({
    canceled: true,
    counterBefore: before.counter,
    counterAfter: after.counter,
    latestDurationMs: latest.durationMs,
    latestBytes: latest.bytes.length,
  });
}

function representativeSearchText(operation, document, label) {
  const items = requireArray(document?.data?.items, `${label} items`);
  if (items.length === 0) fail(`${label} has no item for a real search journey`);
  let reference;
  const item = items[0];
  if (operation === 'rankings' || operation === 'candidates' || operation === 'partners') {
    reference = item.person;
  } else if (operation === 'person-detail') {
    reference = item.character ?? item.subject ?? item.representative;
  } else if (operation === 'co-star') {
    reference = item.subject ?? item.representative;
  }
  const source = [reference?.nameCN, reference?.name].find(
    (value) => typeof value === 'string' && value.trim() !== '',
  );
  if (!source) fail(`${label} item has no searchable display name`);
  const text = Array.from(source.trim()).slice(0, 32).join('');
  if (text === '') fail(`${label} produced an empty search`);
  return text;
}

function withView(body, view) {
  return { ...body, view };
}

function timing(result) {
  return Object.freeze({
    coldMs: result.cold.durationMs,
    warmMs: result.warm.durationMs,
    coldBytes: result.cold.bytes.length,
    warmBytes: result.warm.bytes.length,
  });
}

export class RealApiJourney {
  constructor({ runtime, candidateRoot, dataVersion }) {
    if (!/^dv1-[0-9a-f]{64}$/u.test(dataVersion)) {
      fail('API dataVersion is invalid');
    }
    this.runtime = runtime;
    this.dataVersion = dataVersion;
    this.validators = loadApiSchemaValidators(candidateRoot);
    this.timings = {};
    this.variants = {};
  }

  #once(name) {
    if (this[name] !== undefined) fail(`API ${name} phase already ran`);
  }

  #require(name) {
    if (this[name] === undefined) fail(`API ${name} phase has not run`);
    return this[name];
  }

  async runHealth() {
    this.#once('health');
    const live = await this.runtime.request('/livez');
    if (live.status !== 200 || live.document?.data?.status !== 'live') {
      fail('Backend /livez failed');
    }
    const ready = await this.runtime.request('/readyz');
    if (ready.status !== 200 || ready.document?.data?.status !== 'ready') {
      fail('Backend /readyz failed');
    }
    const metrics = await this.runtime.request('/metrics');
    if (
      metrics.status !== 200 ||
      !metrics.text.includes('bgmss_current_snapshot_info') ||
      !metrics.text.includes(this.dataVersion)
    ) {
      fail('Backend metrics omit the accepted snapshot/dataVersion');
    }
    this.health = Object.freeze({
      liveStatus: live.status,
      readyStatus: ready.status,
      metricsBytes: metrics.bytes.length,
    });
    return this.health;
  }

  async runCatalog() {
    this.#require('health');
    this.#once('catalog');
    const response = await this.runtime.request('/api/v1/catalog');
    this.positions = assertCatalogResponse(
      response,
      this.dataVersion,
      this.validators.catalog,
    );
    const capable = this.positions.filter((position) =>
      positionSupports(position, [
        'rankings',
        'candidates',
        'personDetail',
        'partners',
        'coStar',
      ]),
    );
    if (capable.length === 0) {
      fail('catalog has no position supporting the complete API journey');
    }
    this.catalog = Object.freeze({
      positionCount: this.positions.length,
      allCapabilityPositionCount: capable.length,
    });
    return this.catalog;
  }

  async runCandidates() {
    this.#require('catalog');
    this.#once('candidates');
    this.selected = await chooseRealPosition({
      runtime: this.runtime,
      validators: this.validators,
      positions: this.positions,
      dataVersion: this.dataVersion,
    });
    const candidateSearch = await acceptedVariant({
      runtime: this.runtime,
      validators: this.validators,
      operation: 'candidates',
      body: withView(this.selected.candidates.request, {
        search: representativeSearchText(
          'candidates',
          this.selected.candidates.document,
          'candidates',
        ),
        sort: 'count',
        order: 'desc',
        page: 1,
        pageSize: 5,
      }),
      dataVersion: this.dataVersion,
      label: 'candidates search variant',
    });
    const candidateSort = await acceptedVariant({
      runtime: this.runtime,
      validators: this.validators,
      operation: 'candidates',
      body: withView(this.selected.candidates.request, {
        sort: 'count',
        order: 'asc',
        page: 1,
        pageSize: 20,
      }),
      dataVersion: this.dataVersion,
      label: 'candidates sort variant',
    });
    const candidatePage = await acceptedVariant({
      runtime: this.runtime,
      validators: this.validators,
      operation: 'candidates',
      body: withView(this.selected.candidates.request, {
        sort: 'count',
        order: 'desc',
        page: 2,
        pageSize: 5,
      }),
      dataVersion: this.dataVersion,
      label: 'candidates page variant',
    });
    this.participants = Object.freeze(
      this.selected.people.slice(0, 3).map((person) =>
        Object.freeze({
          personId: person.id,
          positionKeys: Object.freeze([this.selected.position.key]),
        }),
      ),
    );
    this.timings.candidates = timing(this.selected.candidates);
    Object.assign(this.variants, {
      candidateSearchBytes: candidateSearch.response.bytes.length,
      candidateSortBytes: candidateSort.response.bytes.length,
      candidatePageBytes: candidatePage.response.bytes.length,
    });
    this.candidates = Object.freeze({
      selectedPositionKey: this.selected.position.key,
      subjectType: this.selected.position.subjectType,
      candidatePersonIds: Object.freeze(
        this.participants.map((item) => item.personId),
      ),
    });
    return this.candidates;
  }

  async runRankings() {
    this.#require('candidates');
    this.#once('rankings');
    this.rankingsResult = await acceptedPost({
      runtime: this.runtime,
      validators: this.validators,
      operation: 'rankings',
      body: {
        query: this.selected.query,
        view: { sort: 'count', order: 'desc', page: 1, pageSize: 20 },
      },
      dataVersion: this.dataVersion,
    });
    const rankingPeople = uniquePeople(
      requireArray(this.rankingsResult.document.data?.items, 'ranking items'),
    );
    if (rankingPeople.length === 0) {
      fail('real ranking response contains no person');
    }
    this.selectedPerson = rankingPeople[0];
    const rankingSearch = await acceptedVariant({
      runtime: this.runtime,
      validators: this.validators,
      operation: 'rankings',
      body: withView(this.rankingsResult.request, {
        search: representativeSearchText(
          'rankings',
          this.rankingsResult.document,
          'rankings',
        ),
        sort: 'count',
        order: 'desc',
        page: 1,
        pageSize: 5,
      }),
      dataVersion: this.dataVersion,
      label: 'rankings search variant',
    });
    const rankingSort = await acceptedVariant({
      runtime: this.runtime,
      validators: this.validators,
      operation: 'rankings',
      body: withView(this.rankingsResult.request, {
        sort: 'average',
        order: 'asc',
        page: 1,
        pageSize: 20,
      }),
      dataVersion: this.dataVersion,
      label: 'rankings sort variant',
    });
    const rankingPage = await acceptedVariant({
      runtime: this.runtime,
      validators: this.validators,
      operation: 'rankings',
      body: withView(this.rankingsResult.request, {
        sort: 'count',
        order: 'desc',
        page: 2,
        pageSize: 5,
      }),
      dataVersion: this.dataVersion,
      label: 'rankings page variant',
    });
    this.timings.rankings = timing(this.rankingsResult);
    Object.assign(this.variants, {
      rankingSearchBytes: rankingSearch.response.bytes.length,
      rankingSortBytes: rankingSort.response.bytes.length,
      rankingPageBytes: rankingPage.response.bytes.length,
    });
    this.rankings = Object.freeze({
      rankingPersonId: this.selectedPerson.id,
    });
    return this.rankings;
  }

  async runPersonDetail() {
    this.#require('rankings');
    this.#once('personDetail');
    this.personDetailResult = await acceptedPost({
      runtime: this.runtime,
      validators: this.validators,
      operation: 'person-detail',
      body: {
        query: this.selected.query,
        input: { personId: this.selectedPerson.id },
        view: { section: 'works', page: 1, pageSize: 10 },
      },
      dataVersion: this.dataVersion,
    });
    const detailSearch = await acceptedVariant({
      runtime: this.runtime,
      validators: this.validators,
      operation: 'person-detail',
      body: withView(this.personDetailResult.request, {
        section: 'works',
        search: representativeSearchText(
          'person-detail',
          this.personDetailResult.document,
          'person detail works',
        ),
        sort: 'globalScore',
        order: 'desc',
        page: 1,
        pageSize: 5,
      }),
      dataVersion: this.dataVersion,
      label: 'person-detail search variant',
    });
    const detailSort = await acceptedVariant({
      runtime: this.runtime,
      validators: this.validators,
      operation: 'person-detail',
      body: withView(this.personDetailResult.request, {
        section: 'works',
        sort: 'globalScore',
        order: 'asc',
        page: 1,
        pageSize: 20,
      }),
      dataVersion: this.dataVersion,
      label: 'person-detail sort variant',
    });
    const detailPage = await acceptedVariant({
      runtime: this.runtime,
      validators: this.validators,
      operation: 'person-detail',
      body: withView(this.personDetailResult.request, {
        section: 'works',
        sort: 'globalScore',
        order: 'desc',
        page: 2,
        pageSize: 5,
      }),
      dataVersion: this.dataVersion,
      label: 'person-detail page variant',
    });
    const detailSection = await acceptedVariant({
      runtime: this.runtime,
      validators: this.validators,
      operation: 'person-detail',
      body: withView(this.personDetailResult.request, {
        section: 'characters',
        sort: 'workCount',
        order: 'desc',
        page: 1,
        pageSize: 5,
      }),
      dataVersion: this.dataVersion,
      label: 'person-detail section variant',
    });
    this.timings.personDetail = timing(this.personDetailResult);
    Object.assign(this.variants, {
      detailSearchBytes: detailSearch.response.bytes.length,
      detailSortBytes: detailSort.response.bytes.length,
      detailPageBytes: detailPage.response.bytes.length,
      detailSectionBytes: detailSection.response.bytes.length,
    });
    this.personDetail = Object.freeze({ personId: this.selectedPerson.id });
    return this.personDetail;
  }

  async runPartners() {
    this.#require('personDetail');
    this.#once('partners');
    this.partnersResult = await acceptedPost({
      runtime: this.runtime,
      validators: this.validators,
      operation: 'partners',
      body: {
        query: this.selected.query,
        input: {
          source: {
            personId: this.selectedPerson.id,
            positionKeys: [this.selected.position.key],
          },
        },
        view: { sort: 'count', order: 'desc', page: 1, pageSize: 10 },
      },
      dataVersion: this.dataVersion,
    });
    const partnerSearch = await acceptedVariant({
      runtime: this.runtime,
      validators: this.validators,
      operation: 'partners',
      body: withView(this.partnersResult.request, {
        search: representativeSearchText(
          'partners',
          this.partnersResult.document,
          'partners',
        ),
        sort: 'count',
        order: 'desc',
        page: 1,
        pageSize: 5,
      }),
      dataVersion: this.dataVersion,
      label: 'partners search variant',
    });
    const partnerSort = await acceptedVariant({
      runtime: this.runtime,
      validators: this.validators,
      operation: 'partners',
      body: withView(this.partnersResult.request, {
        sort: 'average',
        order: 'asc',
        page: 1,
        pageSize: 20,
      }),
      dataVersion: this.dataVersion,
      label: 'partners sort variant',
    });
    const partnerPage = await acceptedVariant({
      runtime: this.runtime,
      validators: this.validators,
      operation: 'partners',
      body: withView(this.partnersResult.request, {
        sort: 'count',
        order: 'desc',
        page: 2,
        pageSize: 5,
      }),
      dataVersion: this.dataVersion,
      label: 'partners page variant',
    });
    this.timings.partners = timing(this.partnersResult);
    Object.assign(this.variants, {
      partnerSearchBytes: partnerSearch.response.bytes.length,
      partnerSortBytes: partnerSort.response.bytes.length,
      partnerPageBytes: partnerPage.response.bytes.length,
    });
    this.partners = Object.freeze({ personId: this.selectedPerson.id });
    return this.partners;
  }

  async runCoStar() {
    this.#require('partners');
    this.#once('coStar');
    this.pair = await acceptedPost({
      runtime: this.runtime,
      validators: this.validators,
      operation: 'co-star',
      body: {
        query: this.selected.query,
        input: { participants: this.participants.slice(0, 2) },
        view: { sort: 'seriesSize', order: 'desc', page: 1, pageSize: 10 },
      },
      dataVersion: this.dataVersion,
    });
    this.group = await acceptedPost({
      runtime: this.runtime,
      validators: this.validators,
      operation: 'co-star',
      body: {
        query: this.selected.query,
        input: { participants: this.participants },
        view: { sort: 'seriesSize', order: 'desc', page: 1, pageSize: 10 },
      },
      dataVersion: this.dataVersion,
    });
    if (
      this.pair.document.data?.kind !== 'pair' ||
      this.group.document.data?.kind !== 'group'
    ) {
      fail('co-star pair/group response kind is inconsistent');
    }
    const pairSearch = await acceptedVariant({
      runtime: this.runtime,
      validators: this.validators,
      operation: 'co-star',
      body: withView(this.pair.request, {
        search: representativeSearchText(
          'co-star',
          this.pair.document,
          'co-star pair',
        ),
        sort: 'seriesSize',
        order: 'desc',
        page: 1,
        pageSize: 5,
      }),
      dataVersion: this.dataVersion,
      label: 'co-star pair search variant',
    });
    const pairSort = await acceptedVariant({
      runtime: this.runtime,
      validators: this.validators,
      operation: 'co-star',
      body: withView(this.pair.request, {
        sort: 'seriesSize',
        order: 'asc',
        page: 1,
        pageSize: 20,
      }),
      dataVersion: this.dataVersion,
      label: 'co-star pair sort variant',
    });
    const pairPage = await acceptedVariant({
      runtime: this.runtime,
      validators: this.validators,
      operation: 'co-star',
      body: withView(this.pair.request, {
        sort: 'seriesSize',
        order: 'desc',
        page: 2,
        pageSize: 5,
      }),
      dataVersion: this.dataVersion,
      label: 'co-star pair page variant',
    });
    const groupSort = await acceptedVariant({
      runtime: this.runtime,
      validators: this.validators,
      operation: 'co-star',
      body: withView(this.group.request, {
        sort: 'seriesSize',
        order: 'asc',
        page: 1,
        pageSize: 20,
      }),
      dataVersion: this.dataVersion,
      label: 'co-star group sort variant',
    });
    if (
      pairSearch.document.data?.kind !== 'pair' ||
      groupSort.document.data?.kind !== 'group'
    ) {
      fail('co-star pair/group variant response kind is inconsistent');
    }
    this.timings.pair = timing(this.pair);
    this.timings.group = timing(this.group);
    Object.assign(this.variants, {
      pairSearchBytes: pairSearch.response.bytes.length,
      pairSortBytes: pairSort.response.bytes.length,
      pairPageBytes: pairPage.response.bytes.length,
      groupSortBytes: groupSort.response.bytes.length,
    });
    this.coStar = Object.freeze({ pair: 'pair', group: 'group' });
    return this.coStar;
  }

  async runMalformed() {
    this.#require('coStar');
    this.#once('malformed');
    this.malformed = await malformedAndLimitRequests(
      this.runtime,
      this.validators,
      this.rankingsResult.request,
    );
    return this.malformed;
  }

  async runCancellation() {
    this.#require('malformed');
    this.#once('cancellation');
    this.cancellation = await cancellationProbe(
      this.runtime,
      this.rankingsResult.request,
      this.dataVersion,
      this.validators,
    );
    return this.cancellation;
  }

  snapshot() {
    this.#require('cancellation');
    return Object.freeze({
      health: this.health,
      catalog: Object.freeze({
        ...this.catalog,
        selectedPositionKey: this.selected.position.key,
        subjectType: this.selected.position.subjectType,
      }),
      selectedPeople: Object.freeze({
        rankingPersonId: this.selectedPerson.id,
        candidatePersonIds: Object.freeze(
          this.participants.map((item) => item.personId),
        ),
      }),
      timings: Object.freeze({ ...this.timings }),
      variants: Object.freeze({ ...this.variants }),
      malformed: this.malformed,
      cancellation: this.cancellation,
    });
  }
}

export function createRealApiJourney(arguments_) {
  return new RealApiJourney(arguments_);
}

export async function runRealApiJourney(arguments_) {
  const journey = createRealApiJourney(arguments_);
  await journey.runHealth();
  await journey.runCatalog();
  await journey.runCandidates();
  await journey.runRankings();
  await journey.runPersonDetail();
  await journey.runPartners();
  await journey.runCoStar();
  await journey.runMalformed();
  await journey.runCancellation();
  return journey.snapshot();
}
