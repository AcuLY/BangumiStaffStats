#!/usr/bin/env node

import { canonicalJson } from '../lib/canonical-json.mjs';
import { parseJsonStrict } from '../lib/strict-json.mjs';
import { schemaSources } from './schema.mjs';

const schemas = schemaSources();
for (const [name, source] of Object.entries(schemas)) {
  const value = parseJsonStrict(source.toString('utf8'), `${name} schema`);
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    value.$schema !== 'https://json-schema.org/draft/2020-12/schema' ||
    typeof value.$id !== 'string' ||
    value.additionalProperties !== false
  ) {
    throw new Error(`validation ${name} schema is not strict and self-identifying`);
  }
}

process.stdout.write(
  canonicalJson({
    schemas: Object.keys(schemas).sort(),
    status: 'ok',
  }),
);
