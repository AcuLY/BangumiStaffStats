import assert from 'node:assert/strict';
import test from 'node:test';

import {
  failureDisposition,
  removalDecision,
} from '../../validation/failure-policy.mjs';

test('invalid manifest, platform, checksum, disk, timeout, and interrupted staging are pre-switch failures', () => {
  for (const scenario of [
    'invalid-manifest',
    'invalid-platform',
    'checksum-mismatch',
    'insufficient-disk',
    'interrupted-staging',
    'updater-failure',
    'updater-timeout',
    'incompatible-archive',
    'application-install-failure',
  ]) {
    const result = failureDisposition({
      cleanupSucceeded: true,
      previousHealthy: true,
      rollbackSucceeded: false,
      switchChanged: false,
    });
    assert.deepEqual(
      result,
      {
        cleanup: 'succeeded',
        preservePrevious: true,
        rollback: 'not-needed',
        terminal: 'failed',
      },
      scenario,
    );
  }
});

test('post-switch API and Frontend failures restore the prior accepted state', () => {
  for (const scenario of [
    'post-switch-readiness',
    'frontend-switch',
    'sigterm-after-switch',
  ]) {
    const result = failureDisposition({
      cleanupSucceeded: true,
      previousHealthy: true,
      rollbackSucceeded: true,
      switchChanged: true,
    });
    assert.equal(result.rollback, 'succeeded', scenario);
    assert.equal(result.preservePrevious, true, scenario);
    assert.equal(result.terminal, 'failed', scenario);
  }
});

test('rollback failure preserves both states and requires manual recovery', () => {
  const result = failureDisposition({
    cleanupSucceeded: false,
    previousHealthy: false,
    rollbackSucceeded: false,
    switchChanged: true,
  });
  assert.deepEqual(result, {
    cleanup: 'failed',
    preservePrevious: true,
    rollback: 'failed',
    terminal: 'manual-recovery',
  });
});

test('cleanup deletes an exact identity and preserves replacements or consumers', () => {
  const recorded = {
    id: 'abc',
    labels: 'project/run/service',
    name: 'validation-api',
  };
  assert.deepEqual(
    removalDecision({
      observed: recorded,
      recorded,
    }),
    { action: 'remove', code: null },
  );
  assert.deepEqual(
    removalDecision({
      observed: { ...recorded, id: 'replacement' },
      recorded,
    }),
    { action: 'preserve', code: 'IDENTITY_VALUE_CHANGED' },
  );
  assert.deepEqual(
    removalDecision({
      foreignConsumers: ['foreign-container'],
      observed: recorded,
      recorded,
    }),
    { action: 'preserve', code: 'FOREIGN_CONSUMER_PRESENT' },
  );
});

test('cleanup preserves same-inode content mutation observed immediately before unlink', () => {
  const recorded = {
    device: '1',
    digest: `sha256:${'a'.repeat(64)}`,
    gid: 0,
    inode: '42',
    links: 1,
    mode: 400,
    mtime: 100,
    size: 64,
    uid: 0,
  };
  assert.deepEqual(
    removalDecision({
      observed: {
        ...recorded,
        digest: `sha256:${'b'.repeat(64)}`,
        mtime: 101,
      },
      recorded,
    }),
    { action: 'preserve', code: 'IDENTITY_VALUE_CHANGED' },
  );
});
