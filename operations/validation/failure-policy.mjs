import { deepFreeze } from '../lib/canonical-json.mjs';

export class ValidationFailurePolicyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationFailurePolicyError';
  }
}

function fail(message) {
  throw new ValidationFailurePolicyError(message);
}

export function removalDecision({
  foreignConsumers = [],
  observed,
  recorded,
}) {
  if (
    recorded === null ||
    observed === null ||
    typeof recorded !== 'object' ||
    typeof observed !== 'object' ||
    Array.isArray(recorded) ||
    Array.isArray(observed) ||
    !Array.isArray(foreignConsumers)
  ) {
    fail('cleanup identity decision requires closed records');
  }
  const keys = Object.keys(recorded).sort();
  if (
    keys.length === 0 ||
    keys.join('\0') !== Object.keys(observed).sort().join('\0')
  ) {
    return deepFreeze({
      action: 'preserve',
      code: 'IDENTITY_FIELD_SET_CHANGED',
    });
  }
  for (const key of keys) {
    if (recorded[key] !== observed[key]) {
      return deepFreeze({
        action: 'preserve',
        code: 'IDENTITY_VALUE_CHANGED',
      });
    }
  }
  if (foreignConsumers.length !== 0) {
    return deepFreeze({
      action: 'preserve',
      code: 'FOREIGN_CONSUMER_PRESENT',
    });
  }
  return deepFreeze({ action: 'remove', code: null });
}

export function failureDisposition({
  cleanupSucceeded,
  previousHealthy,
  rollbackSucceeded,
  switchChanged,
}) {
  for (const value of [
    cleanupSucceeded,
    previousHealthy,
    rollbackSucceeded,
    switchChanged,
  ]) {
    if (typeof value !== 'boolean') {
      fail('failure disposition inputs must be booleans');
    }
  }
  if (!switchChanged) {
    return deepFreeze({
      cleanup: cleanupSucceeded ? 'succeeded' : 'failed',
      preservePrevious: true,
      rollback: 'not-needed',
      terminal: cleanupSucceeded ? 'failed' : 'failed-with-residue',
    });
  }
  if (previousHealthy && rollbackSucceeded) {
    return deepFreeze({
      cleanup: cleanupSucceeded ? 'succeeded' : 'failed',
      preservePrevious: true,
      rollback: 'succeeded',
      terminal: cleanupSucceeded ? 'failed' : 'failed-with-residue',
    });
  }
  return deepFreeze({
    cleanup: cleanupSucceeded ? 'succeeded' : 'failed',
    preservePrevious: true,
    rollback: 'failed',
    terminal: 'manual-recovery',
  });
}
