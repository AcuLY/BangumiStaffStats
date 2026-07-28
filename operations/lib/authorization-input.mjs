import fs from 'node:fs';

import {
  canonicalJson,
  canonicalJsonDigest,
  deepFreeze,
} from './canonical-json.mjs';
import { assertEvidenceSafe } from './evidence-policy.mjs';
import { writeCanonicalJsonFile } from './immutable-output.mjs';
import {
  compileStrictSchema,
  parseAndValidateCanonicalJson,
} from './schema.mjs';
import {
  ensureOperationsTemporaryRoot,
} from './run-root.mjs';
import {
  decodeUtf8Strict,
  parseJsonStrict,
  readJsonStrict,
} from './strict-json.mjs';

export const AUTHORIZATION_SCHEMA_VERSION = 'operations-authorization-input-v1';
export const AUTHORIZED_LIFECYCLE_STATUS =
  'development-acceptance-closed-by-authorized-ci-and-remote-evidence';

const SCHEMA_URL = new URL(
  '../schemas/authorization-input-v1.schema.json',
  import.meta.url,
);
const AUTHORIZATION_SCHEMA = readJsonStrict(SCHEMA_URL);
const validateSchema = compileStrictSchema(AUTHORIZATION_SCHEMA, {
  label: 'Operations authorization input v1',
});

function lexical(left, right) {
  return left.localeCompare(right, 'en');
}

function canonicalClone(value) {
  return parseJsonStrict(canonicalJson(value), 'authorization input clone');
}

function normalizedAuthorizationInput(fields) {
  if (
    fields === null ||
    typeof fields !== 'object' ||
    Array.isArray(fields)
  ) {
    throw new TypeError('authorization input fields must be an object');
  }
  if (
    Object.hasOwn(fields, 'schemaVersion') ||
    Object.hasOwn(fields, 'lifecycleStatus')
  ) {
    throw new TypeError(
      'authorization schemaVersion and lifecycleStatus are fixed by the builder',
    );
  }
  const value = canonicalClone({
    ...fields,
    lifecycleStatus: AUTHORIZED_LIFECYCLE_STATUS,
    schemaVersion: AUTHORIZATION_SCHEMA_VERSION,
  });
  if (Array.isArray(value.remoteEvidence?.unexecutedFormalCells)) {
    value.remoteEvidence.unexecutedFormalCells.sort(lexical);
  }
  if (Array.isArray(value.remoteEvidence?.exceptions)) {
    value.remoteEvidence.exceptions.sort((left, right) =>
      lexical(left.id, right.id),
    );
  }
  if (Array.isArray(value.authorities?.toolchains)) {
    value.authorities.toolchains.sort((left, right) =>
      lexical(`${left.name}\0${left.version}`, `${right.name}\0${right.version}`),
    );
  }
  for (const name of ['buildDefinitions', 'contracts']) {
    if (Array.isArray(value.authorities?.[name])) {
      value.authorities[name].sort((left, right) =>
        lexical(left.path, right.path),
      );
    }
  }
  return value;
}

export function validateOperationsAuthorizationInput(value) {
  assertEvidenceSafe(value, {
    label: 'Operations authorization input',
  });
  return validateSchema(value, 'Operations authorization input');
}

export function buildOperationsAuthorizationInput(fields) {
  return validateOperationsAuthorizationInput(
    normalizedAuthorizationInput(fields),
  );
}

export function parseOperationsAuthorizationInput(source) {
  return parseAndValidateCanonicalJson(source, validateSchema, {
    label: 'Operations authorization input',
    policy: assertEvidenceSafe,
  });
}

export function readOperationsAuthorizationInput(filePath) {
  return parseOperationsAuthorizationInput(
    decodeUtf8Strict(fs.readFileSync(filePath), filePath),
  );
}

export function operationsAuthorizationInputDigest(value) {
  return canonicalJsonDigest(validateOperationsAuthorizationInput(value));
}

export function writeOperationsAuthorizationInput({ fields }) {
  const value = buildOperationsAuthorizationInput(fields);
  const temporaryRoot = ensureOperationsTemporaryRoot();
  return deepFreeze({
    value,
    output: writeCanonicalJsonFile({
      root: temporaryRoot,
      relativePath: 'inputs/operations-authorization-input-v1.json',
      value,
      expectedSha256: canonicalJsonDigest(value),
    }),
  });
}

export function authorizationSchemaBytes() {
  return Buffer.from(fs.readFileSync(SCHEMA_URL));
}
