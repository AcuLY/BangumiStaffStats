import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertCanonicalJson,
  canonicalJson,
  canonicalJsonDigest,
  CanonicalJsonError,
  deepFreeze,
} from '../../lib/canonical-json.mjs';

test('canonical JSON sorts keys recursively and emits one trailing newline', () => {
  const value = {
    z: [{ b: 2, a: 1 }],
    a: 'value',
  };
  const source = '{"a":"value","z":[{"a":1,"b":2}]}\n';
  assert.equal(canonicalJson(value), source);
  assert.match(canonicalJsonDigest(value), /^sha256:[0-9a-f]{64}$/u);
  assert.equal(assertCanonicalJson(source, value), value);
  assert.throws(
    () => assertCanonicalJson(`${source}\n`, value),
    CanonicalJsonError,
  );
});

test('canonical JSON rejects ambiguous JavaScript values', () => {
  assert.throws(() => canonicalJson(Number.POSITIVE_INFINITY), CanonicalJsonError);
  assert.throws(() => canonicalJson({ missing: undefined }), CanonicalJsonError);
  assert.throws(() => canonicalJson(new Date(0)), CanonicalJsonError);
  const sparse = [];
  sparse[1] = 'value';
  assert.throws(() => canonicalJson(sparse), CanonicalJsonError);
  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(() => canonicalJson(cyclic), CanonicalJsonError);
});

test('deepFreeze closes nested evidence values', () => {
  const value = deepFreeze({ nested: [{ value: true }] });
  assert.equal(Object.isFrozen(value), true);
  assert.equal(Object.isFrozen(value.nested), true);
  assert.equal(Object.isFrozen(value.nested[0]), true);
  assert.throws(() => {
    value.nested[0].value = false;
  }, TypeError);
});
