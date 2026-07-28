import path from 'node:path';
import process from 'node:process';

import {
  assertSafeRelativePath,
  requireCanonicalPath,
} from '../lib/path-policy.mjs';

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

export function runCli(main) {
  Promise.resolve()
    .then(() => main(process.argv.slice(2)))
    .catch((error) => {
      process.stderr.write(`operations release error: ${error.message}\n`);
      process.exitCode = 1;
    });
}
