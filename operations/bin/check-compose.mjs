#!/usr/bin/env node
import assert from 'node:assert/strict';

import { parseDocument } from 'yaml';

import { canonicalJson } from '../lib/canonical-json.mjs';
import {
  composeModel,
  PROFILE_NAMES,
  PROMETHEUS,
  validateComposeModel,
} from '../compose/model.mjs';
import { renderCompose } from '../compose/render.mjs';

for (const profile of PROFILE_NAMES) {
  const expected = composeModel(profile);
  const source = renderCompose(profile);
  const document = parseDocument(source, {
    maxAliasCount: 0,
    prettyErrors: false,
    strict: true,
    uniqueKeys: true,
  });
  if (document.errors.length !== 0 || document.warnings.length !== 0) {
    throw new Error(`${profile} Compose YAML is not strict`);
  }
  const parsed = document.toJS({
    maxAliasCount: 0,
    mapAsMap: false,
  });
  validateComposeModel(parsed, profile);
  assert.equal(canonicalJson(parsed), canonicalJson(expected));
}

assert.equal(
  PROMETHEUS.image,
  'prom/prometheus:v3.13.1-distroless@sha256:214f8427c8fba80c327bb94a75feb802ae12f2d6ca30812aa6e7d22f09bbea80',
);
assert.equal(
  PROMETHEUS.amd64Manifest,
  'sha256:335b5796a6e4355530475575253f84de20b8ad07bf899f65ed218451ce4c60b4',
);
assert.equal(PROMETHEUS.amd64DescriptorSize, 4067);
assert.equal(PROMETHEUS.runtimeUser, 65532);
assert.equal(PROMETHEUS.runtimeGroup, 65532);
