import assert from 'node:assert/strict';
import test from 'node:test';

import {
  failureRecord,
  OperationsFailure,
  preservePrimaryFailure,
  runWithCleanup,
} from '../../lib/failures.mjs';

test('cleanup failure remains secondary to the primary operation failure', async () => {
  await assert.rejects(
    () =>
      runWithCleanup(
        async () => {
          const error = new Error('activation failed');
          error.code = 'ACTIVATION_FAILED';
          throw error;
        },
        async () => {
          const error = new Error('rollback failed');
          error.code = 'ROLLBACK_FAILED';
          throw error;
        },
        {
          actionStage: 'activation',
          cleanupStage: 'rollback',
        },
      ),
    (error) => {
      assert.equal(error instanceof OperationsFailure, true);
      assert.equal(error.primary.stage, 'activation');
      assert.equal(error.primary.code, 'ACTIVATION_FAILED');
      assert.deepEqual(
        error.secondary.map((entry) => entry.stage),
        ['rollback'],
      );
      return true;
    },
  );
});

test('additional cleanup faults append without replacing the first primary', () => {
  const first = preservePrimaryFailure(
    Object.assign(new Error('first'), { code: 'FIRST_FAILED' }),
    Object.assign(new Error('cleanup one'), { code: 'CLEANUP_ONE_FAILED' }),
    {
      primaryStage: 'install',
      secondaryStage: 'rollback',
    },
  );
  const second = preservePrimaryFailure(
    first,
    Object.assign(new Error('cleanup two'), { code: 'CLEANUP_TWO_FAILED' }),
    {
      secondaryStage: 'cleanup',
    },
  );
  assert.equal(second.primary.stage, 'install');
  assert.deepEqual(
    second.secondary.map((entry) => entry.stage),
    ['rollback', 'cleanup'],
  );
});

test('a cleanup-only fault becomes the primary recorded failure', async () => {
  await assert.rejects(
    () =>
      runWithCleanup(
        async () => 'completed',
        async () => {
          throw Object.assign(new Error('cleanup failed'), {
            code: 'CLEANUP_FAILED',
          });
        },
        { cleanupStage: 'cleanup' },
      ),
    (error) =>
      error instanceof OperationsFailure &&
      error.primary.stage === 'cleanup' &&
      error.primary.code === 'CLEANUP_FAILED' &&
      error.secondary.length === 0,
  );
});

test('failure records redact credential-shaped diagnostics', () => {
  const record = failureRecord(
    new Error('request failed token=foundation-canary'),
    'request',
  );
  assert.equal(record.message.includes('foundation-canary'), false);
  assert.equal(record.message.includes('[REDACTED]'), true);
});
