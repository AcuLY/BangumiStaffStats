import Ajv2020 from 'ajv/dist/2020.js';

import { deepFreeze } from './canonical-json.mjs';
import { GIT_OID_PATTERN, SHA256_PATTERN } from './digest.mjs';
import {
  assertAbsoluteNormalizedPath,
  assertSafeRelativePath,
} from './path-policy.mjs';
import { parseCanonicalJson } from './strict-json.mjs';

export class SchemaValidationError extends Error {
  constructor(message, errors = [], options) {
    super(message, options);
    this.name = 'SchemaValidationError';
    this.errors = deepFreeze(errors);
  }
}

const IMAGE_REFERENCE_PATTERN =
  /^(?=.{1,255}$)(?:(?<registry>[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::(?<port>[0-9]{1,5}))?\/)?(?<repository>[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*)(?::(?<tag>[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}))?(?:@sha256:(?<digest>[0-9a-f]{64}))?$/u;

export function isContainerImageReference(value) {
  if (typeof value !== 'string') return false;
  const match = IMAGE_REFERENCE_PATTERN.exec(value);
  if (!match) return false;
  const { digest, port, tag } = match.groups;
  if (port !== undefined) {
    const numericPort = Number(port);
    if (numericPort < 1 || numericPort > 65_535) return false;
  }
  if (tag?.toLowerCase() === 'latest') return false;
  return tag !== undefined || digest !== undefined;
}

function isAbsolutePath(value) {
  try {
    assertAbsoluteNormalizedPath(value);
    return true;
  } catch {
    return false;
  }
}

function isRelativePath(value) {
  try {
    assertSafeRelativePath(value);
    return true;
  } catch {
    return false;
  }
}

export function createStrictAjv() {
  const ajv = new Ajv2020({
    allErrors: true,
    allowMatchingProperties: false,
    coerceTypes: false,
    messages: true,
    removeAdditional: false,
    strict: true,
    strictRequired: true,
    useDefaults: false,
    validateFormats: true,
  });
  ajv.addFormat('sha256', {
    type: 'string',
    validate: (value) => SHA256_PATTERN.test(value),
  });
  ajv.addFormat('git-oid', {
    type: 'string',
    validate: (value) => GIT_OID_PATTERN.test(value),
  });
  ajv.addFormat('absolute-posix-path', {
    type: 'string',
    validate: isAbsolutePath,
  });
  ajv.addFormat('safe-relative-path', {
    type: 'string',
    validate: isRelativePath,
  });
  ajv.addFormat('container-image-reference', {
    type: 'string',
    validate: isContainerImageReference,
  });
  ajv.addFormat('bounded-identifier', {
    type: 'string',
    validate: (value) => /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,254}$/u.test(value),
  });
  return ajv;
}

function normalizedErrors(errors) {
  return (errors ?? [])
    .map((error) => ({
      instancePath: error.instancePath,
      keyword: error.keyword,
      message: error.message ?? 'schema validation failed',
      params: error.params,
      schemaPath: error.schemaPath,
    }))
    .sort((left, right) => {
      const leftKey = `${left.instancePath}\0${left.schemaPath}\0${left.keyword}`;
      const rightKey = `${right.instancePath}\0${right.schemaPath}\0${right.keyword}`;
      return leftKey.localeCompare(rightKey, 'en');
    });
}

export function compileStrictSchema(schema, { label = 'schema' } = {}) {
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) {
    throw new TypeError(`${label} must be an object`);
  }
  const ajv = createStrictAjv();
  let validate;
  try {
    validate = ajv.compile(schema);
  } catch (error) {
    throw new SchemaValidationError(`${label} cannot be compiled`, [], {
      cause: error,
    });
  }
  return function validateValue(value, valueLabel = 'document') {
    if (!validate(value)) {
      const errors = normalizedErrors(validate.errors);
      throw new SchemaValidationError(
        `${valueLabel} does not satisfy ${label}: ${errors
          .map(
            (entry) =>
              `${entry.instancePath || '/'} ${entry.message}`,
          )
          .join('; ')}`,
        errors,
      );
    }
    return deepFreeze(value);
  };
}

export function parseAndValidateCanonicalJson(
  source,
  validate,
  { label = 'document', policy } = {},
) {
  if (typeof validate !== 'function') {
    throw new TypeError('schema validator must be a function');
  }
  const value = parseCanonicalJson(source, label);
  if (policy) policy(value, { label });
  return validate(value, label);
}
