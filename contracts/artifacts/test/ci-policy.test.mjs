import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { auditBuildRoot } from '../bin/residue.mjs';
import {
  ensureGeneratedDirectory,
  removeGeneratedPath,
  requireGeneratedPath,
} from '../lib/generated-path.mjs';

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const WORKFLOW_PATH = path.join(REPOSITORY_ROOT, '.github', 'workflows', 'ci.yml');
const ARTIFACTS_ROOT = path.resolve(import.meta.dirname, '..');
const TMP_ROOT = path.join(ARTIFACTS_ROOT, '.tmp');
const RESIDUE_TEST_ROOT = path.join(TMP_ROOT, 'ci-residue-policy-test');

function generatedOptions(label) {
  return {
    repositoryRoot: REPOSITORY_ROOT,
    temporaryRoot: TMP_ROOT,
    label,
  };
}

function writeGenerated(relative, value) {
  const destination = path.join(RESIDUE_TEST_ROOT, ...relative.split('/'));
  requireGeneratedPath(destination, generatedOptions(`CI residue ${relative}`));
  ensureGeneratedDirectory(
    path.dirname(destination),
    generatedOptions(`CI residue parent ${relative}`),
  );
  fs.writeFileSync(destination, value, { flag: 'wx' });
  requireGeneratedPath(destination, generatedOptions(`CI residue ${relative}`));
}

function workflow() {
  return fs.readFileSync(WORKFLOW_PATH, 'utf8');
}

test('CI has exactly read-only repository permission', () => {
  const source = workflow();
  assert.match(source, /^permissions:\n  contents: read\n/m);
  assert.doesNotMatch(source, /^\s+(?:actions|checks|deployments|discussions|id-token|issues|packages|pages|pull-requests|repository-projects|security-events|statuses):/m);
  assert.doesNotMatch(source, /:\s*write\s*$/m);
});

test('every action reference is pinned to one full immutable commit', () => {
  const source = workflow();
  const uses = [...source.matchAll(/^\s*uses:\s*([^\s]+)\s*$/gm)].map((match) => match[1]);
  assert.ok(uses.length >= 4);
  for (const reference of uses) {
    assert.match(reference, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[0-9a-f]{40}$/);
  }
  assert.doesNotMatch(
    source,
    /^\s*uses:\s*(?:\.{1,2}\/|docker:\/\/|https?:\/\/)/m,
    'local and URL actions are not accepted as immutable action references',
  );
  assert.doesNotMatch(
    source,
    /(^|[ \t])[&*][A-Za-z_][A-Za-z0-9_-]*(?=[ \t\n,}\]])/m,
    'YAML anchors and aliases can hide mutable action configuration',
  );
  assert.match(source, /persist-credentials:\s*false/);
});

test('CI contains no publication, credential, deployment, or activation authority', () => {
  const source = workflow();
  const forbidden = [
    [/\$\{\{\s*secrets\./i, 'secret reference'],
    [/^\s*environment:/im, 'GitHub environment'],
    [/\bid-token\b/i, 'OIDC permission'],
    [/\bdocker\s+login\b/i, 'registry login'],
    [/\bnpm\s+publish\b/i, 'package publication'],
    [/\bgh\s+release\b/i, 'release command'],
    [/\bgit\s+(?:tag|push)\b/i, 'Git ref mutation'],
    [/\bscp\b|\bssh\b/i, 'remote shell or copy'],
    [/\bcurrent\.json\b|\bupdate_activated\b/i, 'Archive activation'],
    [/\bcompose\b/i, 'Compose topology'],
    [/\b(?:deploy|deployment|production host)\b/i, 'deployment behavior'],
    [/actions\/upload-artifact|docker\/login-action|docker\/build-push-action/i, 'upload action'],
  ];
  for (const [pattern, label] of forbidden) {
    assert.doesNotMatch(source, pattern, label);
  }
});

test('CI runs exact component gates, reproducibility, assembly, and local smoke', () => {
  const source = workflow();
  for (const required of [
    'go-version: 1.26.5',
    'node-version: 24.18.0',
    'npm install --global npm@11.16.0',
    'version: 0.11.32',
    'version: v0.34.1',
    'driver-opts: image=docker.io/moby/buildkit:v0.27.1@sha256:1e110c71d389d6d24f67b9438e2f7b8da749a6ff407b22a1631e025c95599368',
    'uv python install 3.14.6',
    `test "$(docker buildx version | awk '{print $2}')" = "v0.34.1"`,
    "docker buildx ls --format '{{json .}}'",
    'entry.Current === true',
    "builder.Driver !== 'docker-container'",
    "node.Version !== 'v0.27.1'",
    'node.DriverOpts?.image !== expectedImage',
    'backend/build/check.sh --target-arch amd64',
    'uv run --frozen pytest',
    '.venv/bin/python build/check.py',
    'npm run check',
    'npm run artifact:check -- --target-arch amd64',
    'node --test contracts/artifacts/test/*.test.mjs',
    'contracts/artifacts/bin/coordinator.mjs smoke',
    'node contracts/artifacts/bin/residue.mjs',
    'git diff --check',
  ]) {
    assert.ok(source.includes(required), `missing CI gate: ${required}`);
  }
  assert.doesNotMatch(source, /--push(?:\s|=)/);
  assert.match(source, /--output|build\/check/);
});

test('CI residue gate closes all four build roots and rejects non-tmp residue', () => {
  const source = workflow();
  assert.match(
    source,
    /node contracts\/artifacts\/bin\/residue\.mjs\n\s+git diff --check/,
  );
  const residueSource = fs.readFileSync(
    path.join(ARTIFACTS_ROOT, 'bin', 'residue.mjs'),
    'utf8',
  );
  for (const root of [
    'backend/build',
    'updater/build',
    'frontend/build',
    'contracts/artifacts',
  ]) {
    assert.ok(residueSource.includes(`'${root}'`), `residue gate omits ${root}`);
  }

  removeGeneratedPath(
    RESIDUE_TEST_ROOT,
    generatedOptions('CI residue test root'),
  );
  ensureGeneratedDirectory(
    RESIDUE_TEST_ROOT,
    generatedOptions('CI residue test root'),
  );
  writeGenerated('tracked.txt', 'tracked\n');
  writeGenerated('nested/tracked.txt', 'tracked\n');
  writeGenerated('.tmp/generated/cache.txt', 'generated\n');
  const trackedPaths = [
    'synthetic/build/nested/tracked.txt',
    'synthetic/build/tracked.txt',
  ];
  assert.equal(
    auditBuildRoot({
      root: RESIDUE_TEST_ROOT,
      repositoryRelative: 'synthetic/build',
      trackedPaths,
    }).trackedFiles,
    2,
  );

  writeGenerated('residue.txt', 'forbidden\n');
  assert.throws(
    () =>
      auditBuildRoot({
        root: RESIDUE_TEST_ROOT,
        repositoryRelative: 'synthetic/build',
        trackedPaths,
      }),
    /generated residue file outside .tmp/,
  );
  removeGeneratedPath(
    RESIDUE_TEST_ROOT,
    generatedOptions('CI residue test root'),
  );
});
