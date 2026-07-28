import fs from 'node:fs';

import { assertEvidenceSafe } from '../lib/evidence-policy.mjs';
import {
  compileStrictSchema,
  parseAndValidateCanonicalJson,
} from '../lib/schema.mjs';
import { readJsonStrict } from '../lib/strict-json.mjs';

const SCHEMAS = Object.freeze({
  input: readJsonStrict(
    new URL('./schemas/validation-input-v1.schema.json', import.meta.url),
  ),
  preflight: readJsonStrict(
    new URL('./schemas/validation-preflight-v1.schema.json', import.meta.url),
  ),
  resources: readJsonStrict(
    new URL('./schemas/validation-resources-v1.schema.json', import.meta.url),
  ),
  result: readJsonStrict(
    new URL('./schemas/validation-result-v1.schema.json', import.meta.url),
  ),
});

const VALIDATORS = Object.freeze(
  Object.fromEntries(
    Object.entries(SCHEMAS).map(([name, schema]) => [
      name,
      compileStrictSchema(schema, {
        label: `Operations validation ${name} schema`,
      }),
    ]),
  ),
);

function validate(name, value) {
  assertEvidenceSafe(value, {
    label: `Operations validation ${name}`,
  });
  return VALIDATORS[name](value, `Operations validation ${name}`);
}

function parse(name, source) {
  return parseAndValidateCanonicalJson(source, VALIDATORS[name], {
    label: `Operations validation ${name}`,
    policy: assertEvidenceSafe,
  });
}

export const validateValidationInput = (value) => validate('input', value);
export const validateValidationPreflight = (value) =>
  validate('preflight', value);
export const validateValidationResources = (value) =>
  validate('resources', value);
export const validateValidationResult = (value) => validate('result', value);

export const parseValidationInput = (source) => parse('input', source);
export const parseValidationPreflight = (source) => parse('preflight', source);
export const parseValidationResources = (source) =>
  parse('resources', source);
export const parseValidationResult = (source) => parse('result', source);

export function schemaSources() {
  return Object.freeze(
    Object.fromEntries(
      Object.keys(SCHEMAS).map((name) => [
        name,
        fs.readFileSync(
          new URL(`./schemas/validation-${name}-v1.schema.json`, import.meta.url),
        ),
      ]),
    ),
  );
}
