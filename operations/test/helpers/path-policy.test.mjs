import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  assertAbsoluteNormalizedPath,
  assertPathIdentity,
  assertSafeRelativePath,
  capturePathIdentity,
  PathPolicyError,
  requireCanonicalPath,
  resolveContainedPath,
} from '../../lib/path-policy.mjs';
import {
  cleanupRunRoot,
  createRunRoot,
} from '../../lib/run-root.mjs';

function ownedRun(t, purpose) {
  const run = createRunRoot({ purpose });
  t.after(() => cleanupRunRoot(run.runRoot));
  return run;
}

test('relative and absolute path syntax is closed', () => {
  assert.equal(
    assertAbsoluteNormalizedPath('/srv/bgmss-ops-validation'),
    '/srv/bgmss-ops-validation',
  );
  assert.equal(assertSafeRelativePath('evidence/result.json'), 'evidence/result.json');
  assert.equal(
    assertSafeRelativePath('.bgmss-operations-run.json'),
    '.bgmss-operations-run.json',
  );
  for (const value of [
    '../escape',
    './result',
    '.',
    '..',
    '.-hidden',
    'a//b',
    '/absolute',
    'a\\b',
  ]) {
    assert.throws(() => assertSafeRelativePath(value), PathPolicyError);
  }
  for (const value of [
    '/',
    '/srv/bgmss-ops-validation/',
    '/srv/../etc',
    'relative',
  ]) {
    assert.throws(() => assertAbsoluteNormalizedPath(value), PathPolicyError);
  }
});

test('contained paths reject traversal and symbolic-link ancestors', (t) => {
  const run = ownedRun(t, 'path-containment-test');
  fs.mkdirSync(path.join(run.runRoot, 'real'), { mode: 0o700 });
  fs.symlinkSync('real', path.join(run.runRoot, 'linked'));
  assert.equal(
    resolveContainedPath(run.runRoot, 'real/result.json'),
    path.join(run.runRoot, 'real/result.json'),
  );
  assert.throws(
    () => resolveContainedPath(run.runRoot, 'linked/result.json'),
    PathPolicyError,
  );
  fs.unlinkSync(path.join(run.runRoot, 'linked'));
  assert.throws(
    () => resolveContainedPath(run.runRoot, '../outside'),
    PathPolicyError,
  );
});

test('captured path identity detects byte and metadata replacement', (t) => {
  const run = ownedRun(t, 'path-identity-test');
  const filePath = path.join(run.runRoot, 'identity.txt');
  fs.writeFileSync(filePath, 'accepted\n', { mode: 0o600 });
  const identity = capturePathIdentity(filePath, {
    includeDigest: true,
    below: run.runRoot,
  });
  assert.equal(
    requireCanonicalPath(filePath, {
      type: 'file',
      below: run.runRoot,
      requireSingleLink: true,
    }),
    filePath,
  );
  assert.deepEqual(assertPathIdentity(filePath, identity), identity);
  fs.writeFileSync(filePath, 'changed\n');
  assert.throws(
    () => assertPathIdentity(filePath, identity),
    PathPolicyError,
  );
});

test('single-link identity rejects hard-linked evidence', (t) => {
  const run = ownedRun(t, 'hard-link-test');
  const first = path.join(run.runRoot, 'first.txt');
  const second = path.join(run.runRoot, 'second.txt');
  fs.writeFileSync(first, 'bytes\n', { mode: 0o600 });
  fs.linkSync(first, second);
  assert.throws(
    () =>
      requireCanonicalPath(first, {
        type: 'file',
        below: run.runRoot,
        requireSingleLink: true,
      }),
    PathPolicyError,
  );
  fs.unlinkSync(second);
});
