import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const root = new URL('../../schemas/', import.meta.url);
const read = relative => JSON.parse(fs.readFileSync(new URL(relative, root), 'utf8'));
const ajv = new Ajv2020({ strict: true, allErrors: true, validateFormats: true });
addFormats(ajv);
const queryNames = ['shared-query-v1', 'effective-query-v1', 'query-digest-projection-v1', 'operation-components-v1'];
for (const name of queryNames) ajv.addSchema(read(`query/${name}.schema.json`));
const shared = read('query/shared-query-v1.schema.json');
const validate = name => ajv.getSchema(read(`query/${name}.schema.json`).$id);
const scopes = ['personal', 'global'];
const types = ['book', 'anime', 'music', 'game', 'real'];
const make = (scope, subjectType) => ({ scope, ...(scope === 'personal' ? { uid: 'Example', collectionStatuses: ['wish'] } : {}), subjectType, positionScope: 'all', positionKeys: [] });

for (const name of queryNames.slice(0, 3)) {
  test(`${name}: explicit unrestricted selection is exclusive and closed`, () => {
    for (const scope of scopes) for (const type of types) {
      const query = make(scope, type);
      if (name !== 'shared-query-v1') Object.assign(query, { includeNSFW: false, mergeSeries: false });
      if (name === 'query-digest-projection-v1') delete query.uid;
      const check = validate(name);
      assert.equal(check(query), true, JSON.stringify(check.errors));
      for (const positionScope of [null, '', 'specific', 'ALL', false, 0, {}]) {
        assert.equal(check({ ...query, positionScope }), false, `invalid scope ${JSON.stringify(positionScope)}`);
      }
      assert.equal(check({ ...query, positionKeys: [`staff:${type}:1`] }), false, 'all cannot contain concrete keys');
      const missing = { ...query }; delete missing.positionKeys;
      assert.equal(check(missing), false, 'positionKeys remains mandatory');
      assert.equal(check({ ...query, unexpected: true }), false, 'unknown fields remain forbidden');
      const legacy = { ...query }; delete legacy.positionScope;
      assert.equal(check(legacy), false, 'ordinary empty query remains invalid');
      if (scope === 'personal') {
        assert.equal(check({ ...query, collectionStatuses: ['wish', 'completed', 'in_progress', 'on_hold', 'dropped'] }), true);
        assert.equal(check({ ...query, collectionStatuses: ['unknown'] }), false);
      }
      legacy.positionKeys = [`staff:${type}:1`];
      assert.equal(check(legacy), true, JSON.stringify(check.errors));
    }
  });
}

test('operation shared query retains legacy empty keys but rejects all plus keys', () => {
  const check = ajv.compile({ $ref: `${shared.$id}#/$defs/OperationSharedQueryV1` });
  for (const scope of scopes) {
    const legacy = make(scope, 'anime'); delete legacy.positionScope;
    legacy.collectionStatuses && (legacy.collectionStatuses = ['completed']);
    assert.equal(check(legacy), true, JSON.stringify(check.errors));
    assert.equal(check({ ...legacy, positionScope: 'all' }), true, JSON.stringify(check.errors));
    assert.equal(check({ ...legacy, positionScope: 'all', positionKeys: ['staff:anime:1'] }), false);
  }
});

test('wire status has the canonical wish-first order', () => {
  assert.deepEqual(shared.$defs.CollectionStatusV1.enum, ['wish', 'completed', 'in_progress', 'on_hold', 'dropped']);
});

const openapi = JSON.parse(fs.readFileSync(new URL('../../openapi/openapi.yaml', import.meta.url), 'utf8'));
for (const [endpoint, component] of [['rankings', 'Rankings'], ['candidates', 'Candidates'], ['person-detail', 'PersonDetail'], ['partners', 'Partners'], ['co-star', 'CoStar']]) {
  test(`${endpoint}: referenced request authority accepts unrestricted query without weakening legacy validation`, () => {
    const schema = read(`${endpoint}/request-v1.schema.json`);
    ajv.addSchema(schema);
    const check = ajv.getSchema(schema.$id);
    assert.equal(openapi.components.schemas[`${component}RequestV1`].$ref, `../schemas/${endpoint}/request-v1.schema.json`);
    const fixture = JSON.parse(fs.readFileSync(new URL(`../api/${endpoint}/cases/global.json`, import.meta.url), 'utf8')).cases[0].request;
    assert.equal(check(fixture), true, JSON.stringify(check.errors));
    const request = { ...fixture, query: make('global', 'anime') };
    assert.equal(check(request), true, JSON.stringify(check.errors));
    assert.equal(check({ ...request, query: { ...request.query, positionKeys: ['staff:anime:2'] } }), false);
    assert.equal(check({ ...request, query: { ...request.query, positionScope: null } }), false);
  });
}

for (const [name, definition] of [['effective-query-v1', 'OperationEffectiveQueryV1'], ['query-digest-projection-v1', 'OperationQueryDigestProjectionV1']]) {
  test(`${definition}: legacy empty-key compatibility is preserved`, () => {
    const schema = read(`query/${name}.schema.json`);
    const check = ajv.compile({ $ref: `${schema.$id}#/$defs/${definition}` });
    const legacy = { scope: 'global', subjectType: 'anime', positionKeys: [], includeNSFW: false, mergeSeries: false };
    assert.equal(check(legacy), true);
    assert.equal(check({ ...legacy, positionScope: 'all' }), true);
    assert.equal(check({ ...legacy, positionScope: 'all', positionKeys: ['staff:anime:2'] }), false);
  });
}
