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
const API_GOLDEN_ROOT = path.join(
  REPOSITORY_ROOT,
  'contracts',
  'goldens',
  'api',
);
const API_GOLDEN_PACKAGES = Object.freeze([
  'catalog',
  'rankings',
  'candidates',
  'person-detail',
  'partners',
  'co-star',
]);
const API_GOLDEN_AJV_DECLARATIONS = Object.freeze({
  ajv: '8.20.0',
  'ajv-formats': '3.0.1',
});
const API_GOLDEN_AJV_IMPORTS = Object.freeze([
  'ajv/dist/2020.js',
  'ajv-formats',
]);
const TMP_ROOT = path.join(ARTIFACTS_ROOT, '.tmp');
const RESIDUE_TEST_ROOT = path.join(TMP_ROOT, 'ci-residue-policy-test');
const TOOLCHAIN_VALIDATOR =
  'node contracts/artifacts/bin/ci-toolchain-identity.mjs';
const GO_PREPARATION_STEP = `\
      - name: Prepare exact Go toolchain in isolated cache
        shell: bash
        env:
          GOMODCACHE: \${{ runner.temp }}/bgmss-ci-go-mod
          GOTOOLCHAIN: go1.26.5+auto
        run: go version >/dev/null
`;
const TOOLCHAIN_VALIDATOR_STEP = `\
      - name: Verify exact toolchains
        shell: bash
        env:
          GOMODCACHE: \${{ runner.temp }}/bgmss-ci-go-mod
          GOTOOLCHAIN: go1.26.5+auto
        run: ${TOOLCHAIN_VALIDATOR}
`;
const EXPECTED_ACTION_REFERENCES = [
  'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
  'actions/setup-go@b7ad1dad31e06c5925ef5d2fc7ad053ef454303e',
  'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
  'astral-sh/setup-uv@c771a70e6277c0a99b617c7a806ffedaca235ff9',
  'docker/setup-buildx-action@bb05f3f5519dd87d3ba754cc423b652a5edd6d2c',
];

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

test('API golden packages own exact AJV declarations and bare imports', () => {
  assert.deepEqual(API_GOLDEN_PACKAGES, [
    'catalog',
    'rankings',
    'candidates',
    'person-detail',
    'partners',
    'co-star',
  ]);
  const discoveredPackages = fs
    .readdirSync(API_GOLDEN_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(
    discoveredPackages,
    [...API_GOLDEN_PACKAGES].sort(),
    'API golden package coverage must be exact',
  );

  for (const packageName of API_GOLDEN_PACKAGES) {
    const packageRoot = path.join(API_GOLDEN_ROOT, packageName);
    const manifest = JSON.parse(
      fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
    );
    const lock = JSON.parse(
      fs.readFileSync(path.join(packageRoot, 'package-lock.json'), 'utf8'),
    );
    assert.equal(
      lock.lockfileVersion,
      3,
      `${packageName} must use the exact lockfile format`,
    );
    for (const [label, declarations] of [
      ['manifest', manifest.devDependencies],
      ['lock root', lock.packages?.['']?.devDependencies],
    ]) {
      assert.deepEqual(
        {
          ajv: declarations?.ajv,
          'ajv-formats': declarations?.['ajv-formats'],
        },
        API_GOLDEN_AJV_DECLARATIONS,
        `${packageName} ${label} must declare exact package-local AJV versions`,
      );
    }
    assert.deepEqual(
      {
        ajv: lock.packages?.['node_modules/ajv']?.version,
        'ajv-formats':
          lock.packages?.['node_modules/ajv-formats']?.version,
      },
      API_GOLDEN_AJV_DECLARATIONS,
      `${packageName} lock must resolve the exact package-local AJV versions`,
    );
    for (const declarationGroup of [
      'dependencies',
      'optionalDependencies',
      'peerDependencies',
    ]) {
      assert.equal(
        manifest[declarationGroup]?.ajv,
        undefined,
        `${packageName} must declare ajv only as a development dependency`,
      );
      assert.equal(
        manifest[declarationGroup]?.['ajv-formats'],
        undefined,
        `${packageName} must declare ajv-formats only as a development dependency`,
      );
    }

    const source = fs.readFileSync(path.join(packageRoot, 'verify.mjs'), 'utf8');
    const importedAjvSpecifiers = [
      ...source.matchAll(
        /^\s*import\s+.+?\s+from\s+["']((?:ajv|ajv-formats)(?:\/[^"']*)?)["'];\s*$/gm,
      ),
    ].map((match) => match[1]);
    assert.deepEqual(
      importedAjvSpecifiers,
      API_GOLDEN_AJV_IMPORTS,
      `${packageName} must use the exact package-local AJV bare imports`,
    );
    assert.equal(
      source.split('import Ajv2020 from "ajv/dist/2020.js";').length - 1,
      1,
      `${packageName} must import Ajv2020 exactly once`,
    );
    assert.equal(
      source.split('import addFormats from "ajv-formats";').length - 1,
      1,
      `${packageName} must import addFormats exactly once`,
    );
    for (const [pattern, label] of [
      [/\bfrontend\b/i, 'Frontend dependency provider'],
      [/\bpathToFileURL\b/, 'URL-built dependency import'],
      [/\b[A-Z][A-Z0-9_]*_TOOL_ROOT\b/, 'tool-root environment escape hatch'],
      [/\bNODE_PATH\b/, 'NODE_PATH dependency provider'],
      [
        /node_modules[\\/]+(?:ajv|ajv-formats)(?:[\\/]|["'`])/,
        'constructed node_modules AJV provider',
      ],
    ]) {
      assert.doesNotMatch(source, pattern, `${packageName}: ${label}`);
    }
  }
});

test('CI has exactly read-only repository permission', () => {
  const source = workflow();
  assert.match(source, /^permissions:\n  contents: read\n/m);
  assert.doesNotMatch(source, /^\s+(?:actions|checks|deployments|discussions|id-token|issues|packages|pages|pull-requests|repository-projects|security-events|statuses):/m);
  assert.doesNotMatch(source, /:\s*write\s*$/m);
});

test('CI uses exactly the five reviewed immutable action releases', () => {
  const source = workflow();
  const uses = [...source.matchAll(/^\s*uses:\s*([^\s]+)\s*$/gm)].map((match) => match[1]);
  assert.deepEqual(uses, EXPECTED_ACTION_REFERENCES);
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

test('CI invokes one semantic toolchain validator before every product gate', () => {
  const source = workflow();
  assert.equal(
    source.split(TOOLCHAIN_VALIDATOR).length - 1,
    1,
    'the repository-owned validator must have one workflow invocation',
  );
  assert.ok(
    source.includes(TOOLCHAIN_VALIDATOR_STEP),
    'the validator must select final Go in an isolated runner cache',
  );
  assert.ok(
    source.includes(`${GO_PREPARATION_STEP}\n${TOOLCHAIN_VALIDATOR_STEP}`),
    'one exact Go preparation step must immediately precede semantic admission',
  );
  assert.equal(
    source.split('run: go version >/dev/null').length - 1,
    1,
    'one preparation command may warm the isolated Go toolchain cache',
  );
  assert.ok(
    source.indexOf(TOOLCHAIN_VALIDATOR) <
      source.indexOf('- name: Run Backend source gates'),
    'tool identities must be admitted before product builds begin',
  );
  for (const [pattern, label] of [
    [/\buv --version\b/, 'uv human presentation check'],
    [/\bBUILDX_STATE\b/, 'Buildx state environment bridge'],
    [/\bbuildx_state=/, 'inline Buildx state collector'],
    [/\|\s*awk\b/, 'inline output field parser'],
    [/\bnode\s+<<['"]?NODE\b/, 'inline Node heredoc validator'],
    [/\btest "\$\(node --version\)"/, 'inline Node presentation check'],
  ]) {
    assert.doesNotMatch(source, pattern, label);
  }
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
    '- name: Install reviewed Go bootstrap',
    'go-version: 1.26.4',
    'GOMODCACHE: ${{ runner.temp }}/bgmss-ci-go-mod',
    'GOTOOLCHAIN: go1.26.5+auto',
    'node-version: 24.18.0',
    'npm install --global npm@11.16.0',
    'version: 0.11.32',
    'version: v0.34.1',
    'driver-opts: image=docker.io/moby/buildkit:v0.27.1@sha256:1e110c71d389d6d24f67b9438e2f7b8da749a6ff407b22a1631e025c95599368',
    'uv python install 3.14.6',
    TOOLCHAIN_VALIDATOR,
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
