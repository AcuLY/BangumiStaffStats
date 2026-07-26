import path from 'node:path';

export const ACCEPTANCE_ROOT = path.resolve(import.meta.dirname, '..');
export const REPOSITORY_ROOT = path.resolve(ACCEPTANCE_ROOT, '..', '..');
export const TMP_ROOT = path.join(ACCEPTANCE_ROOT, '.tmp');
export const MATRIX_PATH = path.join(ACCEPTANCE_ROOT, 'matrix.json');
export const BUDGETS_PATH = path.join(ACCEPTANCE_ROOT, 'budgets.json');
export const ORACLE_EXCEPTIONS_PATH = path.join(
  ACCEPTANCE_ROOT,
  'oracle-exceptions.json',
);
export const RESULT_VERDICT = 'development-accepted-operations-pending';
export const ORACLE_REVISION = '644b7748674e553f863d0ffd61d029f86fdc0717';
export const MATRIX_VERSION = 'development-acceptance-v1';
export const MAX_CAPTURE_BYTES = 1024 * 1024;
export const RUN_ID_PATTERN = /^run-[0-9a-f]{24}$/u;

export const PHASES = Object.freeze([
  'admission',
  'owner-gates',
  'artifacts',
  'archive-runtime',
  'api',
  'browser-oracle',
  'performance',
  'residue',
]);

export const ALLOWED_HARNESS_DIFF_PREFIXES = Object.freeze([
  'contracts/acceptance/',
  'openspec/changes/produce-development-artifacts/',
  'openspec/changes/archive/2026-07-25-produce-development-artifacts/',
  'openspec/changes/complete-integrated-development-acceptance/',
]);

export const ALLOWED_HARNESS_DIFF_FILES = Object.freeze([
  'openspec/specs/backend-build-artifact/spec.md',
  'openspec/specs/contracts-artifact-compatibility/spec.md',
  'openspec/specs/frontend-build-artifact/spec.md',
  'openspec/specs/updater-build-artifact/spec.md',
]);
