import { deepFreeze } from './canonical-json.mjs';

export class OperationsFailure extends Error {
  constructor(message, { primary, secondary = [], cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'OperationsFailure';
    this.primary = primary;
    this.secondary = secondary;
    this.report = deepFreeze({
      primary,
      secondary,
    });
  }
}

const SENSITIVE_DIAGNOSTIC_PATTERNS = Object.freeze([
  /(?:password|secret|token|authorization|bearer)=([^\s,;]+)/giu,
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gu,
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/gu,
]);

function boundedText(value, maximum = 2048) {
  let text = String(value ?? 'unknown failure')
    .replaceAll('\0', '')
    .replace(/[\r\n\t]+/gu, ' ')
    .trim();
  for (const pattern of SENSITIVE_DIAGNOSTIC_PATTERNS) {
    text = text.replace(pattern, (match) => {
      const separator = match.indexOf('=');
      return separator >= 0 ? `${match.slice(0, separator + 1)}[REDACTED]` : '[REDACTED]';
    });
  }
  if (text.length === 0) text = 'unknown failure';
  return text.length <= maximum ? text : `${text.slice(0, maximum - 1)}…`;
}

function boundedCode(value) {
  const text = String(value ?? 'UNSPECIFIED');
  return /^[A-Z][A-Z0-9_]{0,63}$/u.test(text) ? text : 'UNSPECIFIED';
}

export function failureRecord(error, stage, fallbackCode = 'UNSPECIFIED') {
  if (typeof stage !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/u.test(stage)) {
    throw new TypeError('failure stage must be a bounded lowercase identifier');
  }
  return deepFreeze({
    stage,
    code: boundedCode(error?.code ?? fallbackCode),
    name: boundedText(error?.name ?? 'Error', 128),
    message: boundedText(error?.message ?? error),
  });
}

export function preservePrimaryFailure(
  primaryError,
  secondaryError,
  {
    primaryStage = 'primary',
    secondaryStage = 'cleanup',
    primaryCode = 'PRIMARY_FAILED',
    secondaryCode = 'SECONDARY_FAILED',
  } = {},
) {
  if (primaryError === undefined || primaryError === null) {
    return new OperationsFailure('secondary operation failed', {
      primary: failureRecord(
        secondaryError,
        secondaryStage,
        secondaryCode,
      ),
      cause: secondaryError instanceof Error ? secondaryError : undefined,
    });
  }
  if (secondaryError === undefined || secondaryError === null) {
    if (primaryError instanceof OperationsFailure) return primaryError;
    return new OperationsFailure('primary operation failed', {
      primary: failureRecord(primaryError, primaryStage, primaryCode),
      cause: primaryError instanceof Error ? primaryError : undefined,
    });
  }
  const existingPrimary =
    primaryError instanceof OperationsFailure
      ? primaryError.primary
      : failureRecord(primaryError, primaryStage, primaryCode);
  const existingSecondary =
    primaryError instanceof OperationsFailure
      ? [...primaryError.secondary]
      : [];
  const secondary = failureRecord(
    secondaryError,
    secondaryStage,
    secondaryCode,
  );
  return new OperationsFailure(
    `${existingPrimary.stage} failed; ${secondary.stage} also failed`,
    {
      primary: existingPrimary,
      secondary: [...existingSecondary, secondary],
      cause: primaryError instanceof Error ? primaryError : undefined,
    },
  );
}

export async function runWithCleanup(
  action,
  cleanup,
  {
    actionStage = 'primary',
    cleanupStage = 'cleanup',
  } = {},
) {
  if (typeof action !== 'function' || typeof cleanup !== 'function') {
    throw new TypeError('action and cleanup must be functions');
  }
  let result;
  let primaryError;
  try {
    result = await action();
  } catch (error) {
    primaryError = error;
  }

  let cleanupError;
  try {
    await cleanup({
      succeeded: primaryError === undefined,
      result,
      error: primaryError,
    });
  } catch (error) {
    cleanupError = error;
  }

  if (primaryError !== undefined || cleanupError !== undefined) {
    throw preservePrimaryFailure(primaryError, cleanupError, {
      primaryStage: actionStage,
      secondaryStage: cleanupStage,
    });
  }
  return result;
}
