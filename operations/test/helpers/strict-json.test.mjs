import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  decodeUtf8Strict,
  parseCanonicalJson,
  parseJsonStrict,
  StrictJsonError,
} from '../../lib/strict-json.mjs';

const fixture = (name) =>
  fs.readFileSync(new URL(`fixtures/${name}`, import.meta.url), 'utf8');

test('strict JSON detects duplicate keys before JavaScript can overwrite them', () => {
  assert.throws(
    () =>
      parseJsonStrict(
        fixture('authorization.duplicate-key.json'),
        'duplicate fixture',
      ),
    (error) =>
      error instanceof StrictJsonError &&
      error.message.includes('duplicate object key'),
  );
});

test('strict JSON rejects malformed UTF-8 and a BOM', () => {
  assert.throws(
    () => decodeUtf8Strict(Uint8Array.from([0xc3, 0x28])),
    StrictJsonError,
  );
  assert.throws(
    () =>
      decodeUtf8Strict(
        Uint8Array.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d, 0x0a]),
      ),
    StrictJsonError,
  );
});

test('canonical parsing rejects valid but non-canonical JSON bytes', () => {
  assert.throws(
    () =>
      parseCanonicalJson(
        fixture('authorization.noncanonical.json'),
        'noncanonical fixture',
      ),
    /must be canonical JSON/u,
  );
  const parsed = parseCanonicalJson('{"a":1,"b":[true,null]}\n');
  assert.equal(Object.getPrototypeOf(parsed), null);
  assert.equal(Object.isFrozen(parsed.b), true);
});
