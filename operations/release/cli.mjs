import path from 'node:path';
import process from 'node:process';

import {
  assertSafeRelativePath,
  requireCanonicalPath,
} from '../lib/path-policy.mjs';
import { SubprocessError } from '../lib/subprocess.mjs';

const MAX_DIAGNOSTIC_DEPTH = 8;
const MAX_DIAGNOSTIC_NODES = 16;
const MAX_DIAGNOSTIC_TEXT = 2_048;
const MAX_DIAGNOSTIC_OUTPUT = 4_096;
const MAX_DIAGNOSTIC_REPORT = 16_384;
const ANSI_ESCAPE = /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\))/gu;
const PEM_BLOCK_PATTERN =
  /-----BEGIN [A-Z0-9 ]{0,64}PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z0-9 ]{0,64}PRIVATE KEY-----|$)/giu;
const BEARER_VALUE_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/giu;
const CREDENTIAL_FIELD_NAME =
  String.raw`(?:(?:[A-Za-z0-9][A-Za-z0-9.-]{0,63})[_-])*(?:authorization|auth|cookie|credential|passwd|password|private[_-]?key|secret|ssh[_-]?key|token)`;
const JSON_NAMED_FIELD_PATTERN = new RegExp(
  String.raw`(["'])(${CREDENTIAL_FIELD_NAME})\1(\s*:\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,}\]]+)`,
  'giu',
);
const NAMED_FIELD_PATTERN = new RegExp(
  String.raw`\b(${CREDENTIAL_FIELD_NAME})(\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;}\]]+)`,
  'giu',
);
const OPAQUE_VALUE_PATTERN =
  /\b(?:gh[oprsu]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9_-]{20,})\b/gu;
const LONG_OPAQUE_FRAGMENT_PATTERN =
  /(?<![A-Za-z0-9._~+/-])[A-Za-z0-9._~+/-]{256,}={0,2}(?![A-Za-z0-9._~+/-])/gu;
const URL_USERINFO_PATTERN =
  /([a-z][a-z0-9+.-]{1,31}:\/\/)[^/\s@]+@/giu;
const PRIVATE_KEY_BEGIN_PATTERN =
  /-----BEGIN [A-Z0-9 ]{0,64}PRIVATE KEY-----/iu;
const PRIVATE_KEY_END_PATTERN =
  /-----END [A-Z0-9 ]{0,64}PRIVATE KEY-----/iu;
const TRUNCATED_LEADING_LINE_PATTERN = /^[^\r\n]+/u;
const MACHINE_HOME = /\/(home|Users)\/[^/\s]+/gu;

export class ReleaseCliError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'ReleaseCliError';
  }
}

function fail(message) {
  throw new ReleaseCliError(message);
}

export function parseOptions(argv, {
  allowed,
  booleans = [],
  required = [],
} = {}) {
  const admitted = new Set(allowed ?? []);
  const flags = new Set(booleans);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (
      typeof name !== 'string' ||
      !/^--[a-z][a-z0-9-]{0,63}$/u.test(name) ||
      !admitted.has(name) ||
      values.has(name)
    ) {
      fail(`unknown or duplicate option: ${String(name)}`);
    }
    if (flags.has(name)) {
      values.set(name, true);
      continue;
    }
    const value = argv[index + 1];
    if (
      typeof value !== 'string' ||
      value.length === 0 ||
      value.length > 4096 ||
      value.includes('\0') ||
      value.startsWith('--')
    ) {
      fail(`option ${name} requires one bounded value`);
    }
    values.set(name, value);
    index += 1;
  }
  for (const name of required) {
    if (!values.has(name)) fail(`missing required option ${name}`);
  }
  return values;
}

export function optionPath(values, name, {
  type = 'any',
  allowMissing = false,
  below,
} = {}) {
  const value = values.get(name);
  if (typeof value !== 'string') fail(`${name} is not a path option`);
  return requireCanonicalPath(path.resolve(value), {
    allowMissing,
    below,
    label: name,
    type,
  });
}

export function assertVersionTag(value, label = 'release tag') {
  if (typeof value !== 'string' || !/^v(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/u.test(value)) {
    fail(`${label} must be a strict vMAJOR.MINOR.PATCH value`);
  }
  return value;
}

export function assertRepository(value) {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/u.test(value)
  ) {
    fail('repository must be one bounded owner/name identifier');
  }
  return value;
}

export function assertCandidateRelativePath(value, label = 'candidate path') {
  return assertSafeRelativePath(value, label);
}

function property(value, name) {
  try {
    return value?.[name];
  } catch {
    return undefined;
  }
}

function redactTruncatedTailBoundary(source) {
  const privateKeyEnd = PRIVATE_KEY_END_PATTERN.exec(source);
  const privateKeyBegin = PRIVATE_KEY_BEGIN_PATTERN.exec(source);
  let text = source;
  if (
    privateKeyEnd &&
    (!privateKeyBegin || privateKeyBegin.index > privateKeyEnd.index)
  ) {
    text = [
      '[REDACTED PRIVATE KEY TAIL]',
      source.slice(privateKeyEnd.index + privateKeyEnd[0].length),
    ].join('');
  }
  return text.replace(
    TRUNCATED_LEADING_LINE_PATTERN,
    '[REDACTED TRUNCATED OUTPUT LINE]',
  );
}

function boundedDiagnosticText(value, maximum = MAX_DIAGNOSTIC_TEXT, {
  tail = false,
  truncatedBoundary = false,
} = {}) {
  let source;
  try {
    source = String(value ?? 'unknown failure');
  } catch {
    source = 'unrenderable failure';
  }
  source = source
    .replace(ANSI_ESCAPE, '')
    .replaceAll('\0', '');
  if (truncatedBoundary) {
    source = redactTruncatedTailBoundary(source);
  }
  let text = source
    .replace(PEM_BLOCK_PATTERN, '[REDACTED PRIVATE KEY]')
    .replace(URL_USERINFO_PATTERN, '$1[REDACTED]@')
    .replace(BEARER_VALUE_PATTERN, 'Bearer [REDACTED]')
    .replace(JSON_NAMED_FIELD_PATTERN, '$1$2$1$3[REDACTED]')
    .replace(NAMED_FIELD_PATTERN, '$1$2[REDACTED]')
    .replace(OPAQUE_VALUE_PATTERN, '[REDACTED TOKEN]')
    .replace(LONG_OPAQUE_FRAGMENT_PATTERN, '[REDACTED OPAQUE VALUE]')
    .replace(MACHINE_HOME, '/$1/[USER]')
    .replace(/[\u0000-\u001f\u007f]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  if (text.length === 0) text = 'unknown failure';
  if (text.length <= maximum) return text;
  return tail
    ? `…${text.slice(-(maximum - 1))}`
    : `${text.slice(0, maximum - 1)}…`;
}

function diagnosticName(error) {
  return boundedDiagnosticText(property(error, 'name') ?? 'Error', 128);
}

function diagnosticMessage(error) {
  if (
    error !== null &&
    (typeof error === 'object' || typeof error === 'function')
  ) {
    return boundedDiagnosticText(
      property(error, 'message') ?? 'unknown failure',
    );
  }
  return boundedDiagnosticText(error);
}

function subprocessDetails(error, label, lines) {
  if (!(error instanceof SubprocessError)) return;
  const result = property(error, 'result');
  if (!result || typeof result !== 'object') return;
  const commandValue = property(result, 'command');
  const command =
    typeof commandValue === 'string'
      ? boundedDiagnosticText(path.basename(commandValue), 128)
      : 'unknown';
  const exitCode = property(result, 'exitCode');
  const signal = boundedDiagnosticText(property(result, 'signal') ?? 'none', 64);
  const termination = boundedDiagnosticText(
    property(result, 'terminationReason') ?? 'none',
    64,
  );
  const durationMs = property(result, 'durationMs');
  const stdoutTruncated = property(result, 'stdoutTruncated') === true;
  const stderrTruncated = property(result, 'stderrTruncated') === true;
  lines.push(
    `${label}.subprocess: command=${command} exit=${
      Number.isInteger(exitCode) ? exitCode : 'none'
    } signal=${signal} termination=${termination} duration-ms=${
      Number.isSafeInteger(durationMs) && durationMs >= 0
        ? durationMs
        : 'unknown'
    } stdout-truncated=${stdoutTruncated} stderr-truncated=${stderrTruncated}`,
  );
  const stderrTail = property(result, 'stderrTail');
  const stderr = property(result, 'stderr');
  const selectedStderr =
    typeof stderrTail === 'string' ? stderrTail : stderr;
  if (
    typeof selectedStderr === 'string' &&
    selectedStderr.trim().length > 0
  ) {
    lines.push(
      `${label}.${typeof stderrTail === 'string' ? 'stderr-tail' : 'stderr-capture'}: ${boundedDiagnosticText(
        selectedStderr,
        MAX_DIAGNOSTIC_OUTPUT,
        {
          tail: true,
          truncatedBoundary:
            stderrTruncated && typeof stderrTail === 'string',
        },
      )}`,
    );
  }
  const stdoutTail = property(result, 'stdoutTail');
  const stdout = property(result, 'stdout');
  const selectedStdout =
    typeof stdoutTail === 'string' ? stdoutTail : stdout;
  if (
    typeof selectedStdout === 'string' &&
    selectedStdout.trim().length > 0
  ) {
    lines.push(
      `${label}.${typeof stdoutTail === 'string' ? 'stdout-tail' : 'stdout-capture'}: ${boundedDiagnosticText(
        selectedStdout,
        MAX_DIAGNOSTIC_OUTPUT,
        {
          tail: true,
          truncatedBoundary:
            stdoutTruncated && typeof stdoutTail === 'string',
        },
      )}`,
    );
  }
}

function aggregateChildLabel(error, parent, index) {
  const cleanupPair = /cleanup.*failed|both failed/iu.test(
    diagnosticMessage(error),
  );
  if (cleanupPair && index === 0) return `${parent}.primary`;
  if (cleanupPair && index === 1) return `${parent}.cleanup`;
  return `${parent}.error-${index + 1}`;
}

export function formatReleaseCliError(error) {
  const lines = [];
  const seen = new WeakSet();
  let nodes = 0;

  function visit(current, label, depth) {
    if (nodes >= MAX_DIAGNOSTIC_NODES) {
      lines.push(`${label}: diagnostic node limit reached`);
      return;
    }
    if (depth > MAX_DIAGNOSTIC_DEPTH) {
      lines.push(`${label}: diagnostic depth limit reached`);
      return;
    }
    nodes += 1;
    const object =
      current !== null &&
      (typeof current === 'object' || typeof current === 'function');
    if (object) {
      if (seen.has(current)) {
        lines.push(`${label}: circular error reference`);
        return;
      }
      seen.add(current);
    }
    lines.push(
      `${label}: ${diagnosticName(current)}: ${diagnosticMessage(current)}`,
    );
    subprocessDetails(current, label, lines);

    const aggregateErrors =
      current instanceof AggregateError
        ? property(current, 'errors')
        : undefined;
    if (aggregateErrors && typeof aggregateErrors[Symbol.iterator] === 'function') {
      let index = 0;
      for (const child of aggregateErrors) {
        if (nodes >= MAX_DIAGNOSTIC_NODES) {
          lines.push(`${label}: diagnostic node limit reached`);
          break;
        }
        visit(child, aggregateChildLabel(current, label, index), depth + 1);
        index += 1;
      }
    } else {
      const cause = property(current, 'cause');
      if (cause !== undefined && cause !== null && cause !== current) {
        visit(cause, `${label}.cause`, depth + 1);
      }
    }
  }

  visit(error, 'root', 0);
  let report = [
    `operations release error: ${diagnosticName(error)}: ${diagnosticMessage(error)}`,
    ...lines.map((line) => `operations release diagnostic ${line}`),
  ].join('\n');
  if (report.length > MAX_DIAGNOSTIC_REPORT) {
    report = `${report.slice(0, MAX_DIAGNOSTIC_REPORT - 2)}…`;
  }
  return `${report}\n`;
}

export function runCli(main) {
  Promise.resolve()
    .then(() => main(process.argv.slice(2)))
    .catch((error) => {
      process.stderr.write(formatReleaseCliError(error));
      process.exitCode = 1;
    });
}
