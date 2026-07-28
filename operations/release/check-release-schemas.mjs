#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { createStrictAjv } from '../lib/schema.mjs';
import { readJsonStrict } from '../lib/strict-json.mjs';
import { OPERATIONS_ROOT } from './constants.mjs';
import { readAcceptedDevelopment } from './receipt.mjs';

const SCHEMA_NAMES = Object.freeze([
  'release-accepted-development-v1.schema.json',
  'release-complete-inventory-v1.schema.json',
  'release-manifest-v1.schema.json',
  'release-registry-evidence-v1.schema.json',
  'release-tag-candidate-v1.schema.json',
  'release-validation-candidate-v1.schema.json',
]);

function fail(message) {
  throw new Error(message);
}

function main() {
  const schemasRoot = path.join(OPERATIONS_ROOT, 'schemas');
  const ajv = createStrictAjv();
  const ids = new Set();
  for (const name of SCHEMA_NAMES) {
    const filePath = path.join(schemasRoot, name);
    const information = fs.lstatSync(filePath);
    if (information.isSymbolicLink() || !information.isFile()) {
      fail(`release schema must be a regular file: ${name}`);
    }
    const schema = readJsonStrict(filePath);
    if (
      typeof schema.$id !== 'string' ||
      ids.has(schema.$id) ||
      schema.$schema !== 'https://json-schema.org/draft/2020-12/schema'
    ) {
      fail(`release schema identity is missing or duplicated: ${name}`);
    }
    ids.add(schema.$id);
    ajv.compile(schema);
  }
  const actual = fs
    .readdirSync(schemasRoot)
    .filter((name) => name.startsWith('release-') && name.endsWith('.schema.json'))
    .sort((left, right) => left.localeCompare(right, 'en'));
  if (
    actual.length !== SCHEMA_NAMES.length ||
    actual.some((entry, index) => entry !== SCHEMA_NAMES[index])
  ) {
    fail('release schema file set differs from the closed checker inventory');
  }
  readAcceptedDevelopment();
  process.stdout.write(`release schemas passed: ${SCHEMA_NAMES.length}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`release schema check error: ${error.message}\n`);
  process.exitCode = 1;
}
