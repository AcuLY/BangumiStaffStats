import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  GeneratedPathError,
  ensureGeneratedDirectory,
  removeGeneratedPath,
  requireGeneratedPath,
} from '../lib/generated-path.mjs';

const ARTIFACTS_ROOT = path.resolve(import.meta.dirname, '..');
const REPOSITORY_ROOT = path.resolve(ARTIFACTS_ROOT, '..', '..');
const TMP_ROOT = path.join(ARTIFACTS_ROOT, '.tmp');
const TEST_ROOT = path.join(TMP_ROOT, 'generated-path-tests');

function actualOptions(label) {
  return {
    repositoryRoot: REPOSITORY_ROOT,
    temporaryRoot: TMP_ROOT,
    label,
  };
}

function reset() {
  removeGeneratedPath(TEST_ROOT, actualOptions('generated-path test root'));
  ensureGeneratedDirectory(TEST_ROOT, actualOptions('generated-path test root'));
}

function fixture(name) {
  const root = path.join(TEST_ROOT, name);
  const repository = path.join(root, 'repository');
  const artifacts = path.join(repository, 'contracts', 'artifacts');
  const external = path.join(root, 'external');
  ensureGeneratedDirectory(artifacts, actualOptions(`${name} fake repository`));
  ensureGeneratedDirectory(external, actualOptions(`${name} external directory`));
  const sentinel = requireGeneratedPath(
    path.join(external, 'sentinel.txt'),
    actualOptions(`${name} sentinel`),
  );
  fs.writeFileSync(sentinel, 'unchanged\n', { flag: 'wx' });
  return {
    repository,
    temporary: path.join(artifacts, '.tmp'),
    external,
    sentinel,
  };
}

function options(value, label) {
  return {
    repositoryRoot: value.repository,
    temporaryRoot: value.temporary,
    label,
  };
}

test('tmp-root symlink is rejected before recursive creation or external writes', () => {
  reset();
  const value = fixture('tmp-root-symlink');
  fs.symlinkSync(value.external, value.temporary, 'dir');
  assert.throws(
    () =>
      ensureGeneratedDirectory(
        path.join(value.temporary, 'escaped', 'output'),
        options(value, 'tmp-root symlink output'),
      ),
    (error) =>
      error instanceof GeneratedPathError &&
      /temporary root crosses symlink/.test(error.message),
  );
  assert.equal(fs.readFileSync(value.sentinel, 'utf8'), 'unchanged\n');
  assert.equal(fs.existsSync(path.join(value.external, 'escaped')), false);
});

test('existing child symlink is rejected before recursive creation or external writes', () => {
  reset();
  const value = fixture('child-symlink');
  ensureGeneratedDirectory(value.temporary, {
    ...options(value, 'real tmp root'),
    allowTemporaryRoot: true,
  });
  const child = path.join(value.temporary, 'child');
  fs.symlinkSync(value.external, child, 'dir');
  assert.throws(
    () =>
      ensureGeneratedDirectory(
        path.join(child, 'escaped', 'output'),
        options(value, 'child symlink output'),
      ),
    (error) =>
      error instanceof GeneratedPathError &&
      /crosses symlink/.test(error.message),
  );
  assert.equal(fs.readFileSync(value.sentinel, 'utf8'), 'unchanged\n');
  assert.equal(fs.existsSync(path.join(value.external, 'escaped')), false);
});

test('parent traversal and absolute escape are rejected without touching sentinel', () => {
  reset();
  const value = fixture('lexical-escape');
  ensureGeneratedDirectory(value.temporary, {
    ...options(value, 'real tmp root'),
    allowTemporaryRoot: true,
  });
  assert.throws(
    () =>
      ensureGeneratedDirectory(
        `${value.temporary}/../escaped`,
        options(value, 'parent traversal output'),
      ),
    /parent traversal/,
  );
  assert.throws(
    () =>
      ensureGeneratedDirectory(
        path.join(value.external, 'absolute-escape'),
        options(value, 'absolute escape output'),
      ),
    /must remain below/,
  );
  assert.equal(fs.readFileSync(value.sentinel, 'utf8'), 'unchanged\n');
  assert.equal(fs.existsSync(path.join(value.external, 'absolute-escape')), false);
});
