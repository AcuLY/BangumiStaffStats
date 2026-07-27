#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';

import {
  TMP_ROOT,
  compareComponentDirectories,
  ensureUnderTmpDirectory,
  lockedRuntimePackages,
  normalizedTarBytes,
  packageStaticArtifact,
  readNormalizedTar,
  removeUnderTmp,
  requireUnderTmp,
} from './artifact.mjs';
import {
  APPLICATION_VERSION,
  ARCHIVE_CAST_RULES_VERSION,
  ARCHIVE_COMPATIBILITY_MATRIX_DIGEST,
  ARCHIVE_DOMAIN_RULES_VERSION,
  verifyComponentDirectory,
} from '../../contracts/artifacts/lib/validation.mjs';
import { attestFrontendCandidate } from './check.mjs';
import { captureTrackedRegularFilesAtRevision } from '../../contracts/artifacts/lib/git-checkout.mjs';

const TEST_ROOT = path.join(TMP_ROOT, 'unit-tests');
const REVISION = '1'.repeat(40);
const TREE = '2'.repeat(40);

function reset() {
  removeUnderTmp(TEST_ROOT, 'Frontend artifact unit-test root');
  ensureUnderTmpDirectory(TEST_ROOT, 'Frontend artifact unit-test root');
}

function fixtureDist(name, reverse = false) {
  const root = path.join(TEST_ROOT, name);
  ensureUnderTmpDirectory(path.join(root, 'assets'), 'fixture assets directory');
  const entries = [
    ['index.html', '<!doctype html><div id="app"></div><script type="module" src="/assets/app-a1.js"></script>\n'],
    ['assets/app-a1.js', 'document.querySelector(\"#app\").textContent=\"fixture\";\n'],
    ['assets/style-a1.css', ':root{color:#111}\n'],
  ];
  for (const [relative, value] of reverse ? entries.reverse() : entries) {
    const target = requireUnderTmp(
      path.join(root, ...relative.split('/')),
      `fixture file ${relative}`,
    );
    fs.writeFileSync(target, value, { flag: 'wx' });
    requireUnderTmp(target, `fixture file ${relative}`);
  }
  return root;
}

function runGit(root, arguments_, { input, environment = {} } = {}) {
  const result = spawnSync('git', ['-C', root, ...arguments_], {
    encoding: 'utf8',
    input,
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: '1',
      HOME: path.join(root, '.test-home'),
      ...environment,
    },
  });
  assert.equal(
    result.status,
    0,
    `git ${arguments_.join(' ')} failed:\n${result.stdout}\n${result.stderr}`,
  );
  return result.stdout.trim();
}

function writeTestFile(root, relative, value) {
  const target = requireUnderTmp(
    path.join(root, ...relative.split('/')),
    `Git fixture file ${relative}`,
  );
  ensureUnderTmpDirectory(path.dirname(target), `Git fixture parent ${relative}`);
  fs.writeFileSync(target, value, { flag: 'wx' });
  requireUnderTmp(target, `Git fixture file ${relative}`);
}

function gitCheckout(name) {
  const root = path.join(TEST_ROOT, name);
  ensureUnderTmpDirectory(root, `Git fixture ${name}`);
  runGit(root, ['init', '--quiet']);
  runGit(root, ['config', 'user.name', 'Artifact Test']);
  runGit(root, ['config', 'user.email', 'artifact-test@example.invalid']);
  writeTestFile(root, '.gitignore', 'ignored/\nartifact-output/\n');
  writeTestFile(root, 'tracked.txt', 'accepted\n');
  runGit(root, ['add', '.gitignore', 'tracked.txt']);
  runGit(root, ['commit', '--quiet', '-m', 'fixture']);
  return {
    root,
    revision: runGit(root, ['rev-parse', 'HEAD']),
    tree: runGit(root, ['rev-parse', 'HEAD^{tree}']),
  };
}

test('normalized ustar is independent of filesystem creation order', () => {
  reset();
  const first = normalizedTarBytes(fixtureDist('dist-a'));
  const second = normalizedTarBytes(fixtureDist('dist-b', true));
  assert.deepEqual(first, second);
  const entries = readNormalizedTar(first);
  assert.deepEqual(
    entries.map((entry) => entry.path),
    ['assets/app-a1.js', 'assets/style-a1.css', 'index.html'],
  );
});

test('runtime SBOM closure starts from exact root production dependencies', () => {
  const dependencies = lockedRuntimePackages();
  const names = new Set(dependencies.map((entry) => entry.name));
  for (const name of ['ajv', 'ajv-formats', 'naive-ui', 'pinia', 'vue']) {
    assert.ok(names.has(name), `missing ${name}`);
  }
  assert.ok(!names.has('vite'));
  assert.ok(dependencies.length > 5);
});

test('artifact smoke script consumes one explicit published root without rebuilding', () => {
  const packageDocument = JSON.parse(
    fs.readFileSync(path.join(import.meta.dirname, '..', 'package.json'), 'utf8'),
  );
  assert.equal(
    packageDocument.scripts['artifact:smoke'],
    'node build/smoke.mjs smoke',
  );
  assert.ok(!packageDocument.scripts['artifact:smoke'].includes('check.mjs'));
  const guide = fs.readFileSync(path.join(import.meta.dirname, 'README.md'), 'utf8');
  assert.match(
    guide,
    /npm run artifact:smoke -- build\/\.tmp\/published\/sha256-<component-tree-digest>/,
  );
});

test('two package runs emit byte-identical Contracts-valid component directories', () => {
  reset();
  const dist = fixtureDist('dist');
  const expectedStaticPayload = normalizedTarBytes(dist);
  const first = packageStaticArtifact({
    distRoot: dist,
    outputRoot: path.join(TEST_ROOT, 'first'),
    sourceRevision: REVISION,
    sourceTree: TREE,
  });
  const second = packageStaticArtifact({
    distRoot: dist,
    outputRoot: path.join(TEST_ROOT, 'second'),
    sourceRevision: REVISION,
    sourceTree: TREE,
  });
  compareComponentDirectories(first, second);
  const verified = verifyComponentDirectory(first, 'frontend');
  assert.equal(verified.statement.component, 'frontend');
  assert.equal(verified.statement.applicationVersion, APPLICATION_VERSION);
  assert.equal(
    verified.statement.compatibility.archive.domainRulesVersion,
    ARCHIVE_DOMAIN_RULES_VERSION,
  );
  assert.equal(
    verified.statement.compatibility.archive.castRulesVersion,
    ARCHIVE_CAST_RULES_VERSION,
  );
  assert.equal(
    verified.statement.compatibility.archive.compatibilityMatrixDigest,
    ARCHIVE_COMPATIBILITY_MATRIX_DIGEST,
  );

  const staticPayload = fs.readFileSync(
    path.join(first, ...verified.statement.artifacts[0].path.split('/')),
  );
  assert.deepEqual(staticPayload, expectedStaticPayload);
  assert.equal(staticPayload.includes(Buffer.from(APPLICATION_VERSION)), false);

  const sbom = JSON.parse(
    fs.readFileSync(path.join(first, verified.statement.sbom.path), 'utf8'),
  );
  const applicationPackage = sbom.packages.find(
    (entry) => entry.primaryPackagePurpose === 'APPLICATION',
  );
  assert.equal(applicationPackage.versionInfo, APPLICATION_VERSION);
});

test('artifact verifier rejects post-package byte drift', () => {
  reset();
  const output = packageStaticArtifact({
    distRoot: fixtureDist('dist'),
    outputRoot: path.join(TEST_ROOT, 'output'),
    sourceRevision: REVISION,
    sourceTree: TREE,
  });
  const statement = verifyComponentDirectory(output, 'frontend').statement;
  const artifactPath = path.join(output, ...statement.artifacts[0].path.split('/'));
  requireUnderTmp(artifactPath, 'tampered artifact');
  fs.chmodSync(artifactPath, 0o644);
  fs.appendFileSync(artifactPath, 'tamper');
  requireUnderTmp(artifactPath, 'tampered artifact');
  assert.throws(() => verifyComponentDirectory(output, 'frontend'), /size drift|digest drift/);
});

test('candidate capture returns only raw-verified tracked regular blobs', () => {
  reset();
  const fixture = gitCheckout('git-capture');
  writeTestFile(fixture.root, 'frontend/.gitignore', 'ignored/\n');
  writeTestFile(fixture.root, 'frontend/index.html', '<main>accepted</main>\n');
  runGit(fixture.root, ['add', 'frontend/.gitignore', 'frontend/index.html']);
  runGit(fixture.root, ['commit', '--quiet', '-m', 'frontend']);
  writeTestFile(fixture.root, 'frontend/ignored/injected.js', 'injected\n');
  const identity = attestFrontendCandidate({ repositoryRoot: fixture.root });
  const captured = captureTrackedRegularFilesAtRevision({
    repositoryRoot: fixture.root,
    revision: identity.revision,
    prefix: 'frontend',
  });
  assert.deepEqual(
    captured.map((entry) => entry.path),
    ['frontend/.gitignore', 'frontend/index.html'],
  );
  assert.equal(captured[1].bytes.toString('utf8'), '<main>accepted</main>\n');
  assert.equal(captured.some((entry) => entry.path.includes('injected')), false);
});

test('acceptance source identity rejects staged, tracked, untracked, and supplied drift before output', () => {
  reset();
  const clean = gitCheckout('git-clean');
  assert.deepEqual(
    attestFrontendCandidate({
      repositoryRoot: clean.root,
      suppliedRevision: clean.revision,
      suppliedTree: clean.tree,
    }),
    {
      revision: clean.revision,
      tree: clean.tree,
      repositoryRoot: clean.root,
    },
  );
  writeTestFile(clean.root, 'ignored/cache.txt', 'ignored\n');
  assert.equal(attestFrontendCandidate({ repositoryRoot: clean.root }).tree, clean.tree);

  const cases = [
    {
      name: 'git-staged',
      prepare(fixture) {
        fs.appendFileSync(path.join(fixture.root, 'tracked.txt'), 'staged\n');
        runGit(fixture.root, ['add', 'tracked.txt']);
      },
      expected: /index differs from HEAD/,
    },
    {
      name: 'git-tracked',
      prepare(fixture) {
        fs.appendFileSync(path.join(fixture.root, 'tracked.txt'), 'worktree\n');
      },
      expected: /raw tracked bytes differ/,
    },
    {
      name: 'git-executable-mode',
      prepare(fixture) {
        fs.chmodSync(path.join(fixture.root, 'tracked.txt'), 0o755);
      },
      expected: /tracked executable mode differs/,
    },
    {
      name: 'git-untracked',
      prepare(fixture) {
        writeTestFile(fixture.root, 'unexpected.txt', 'untracked\n');
      },
      expected: /untracked non-ignored/,
    },
    {
      name: 'git-assume-unchanged',
      prepare(fixture) {
        runGit(fixture.root, ['update-index', '--assume-unchanged', 'tracked.txt']);
      },
      expected: /assume-unchanged|hidden flags/,
    },
    {
      name: 'git-skip-worktree',
      prepare(fixture) {
        runGit(fixture.root, ['update-index', '--skip-worktree', 'tracked.txt']);
      },
      expected: /skip-worktree|hidden flags/,
    },
    {
      name: 'git-non-stage-zero',
      prepare(fixture) {
        const object = runGit(fixture.root, ['rev-parse', 'HEAD:tracked.txt']);
        runGit(fixture.root, ['update-index', '--force-remove', 'tracked.txt']);
        runGit(
          fixture.root,
          ['update-index', '--index-info'],
          {
            input:
              `100644 ${object} 1\ttracked.txt\n` +
              `100644 ${object} 2\ttracked.txt\n` +
              `100644 ${object} 3\ttracked.txt\n`,
          },
        );
      },
      expected: /non-stage-zero/,
    },
    {
      name: 'git-nested-ignore',
      prepare(fixture) {
        writeTestFile(fixture.root, 'nested/.gitignore', '*\n');
        writeTestFile(fixture.root, 'nested/payload.txt', 'hidden\n');
      },
      expected: /untracked ignore-control/,
    },
    {
      name: 'git-info-exclude',
      prepare(fixture) {
        fs.writeFileSync(
          path.join(fixture.root, '.git', 'info', 'exclude'),
          'hidden-by-info.txt\n',
        );
        writeTestFile(fixture.root, 'hidden-by-info.txt', 'hidden\n');
      },
      expected: /untracked non-ignored/,
    },
    {
      name: 'git-local-exclude',
      prepare(fixture) {
        const excludes = path.join(fixture.root, '.git', 'hostile-excludes');
        fs.writeFileSync(excludes, 'hidden-by-config.txt\n');
        runGit(fixture.root, ['config', 'core.excludesFile', excludes]);
        writeTestFile(fixture.root, 'hidden-by-config.txt', 'hidden\n');
      },
      expected: /untracked non-ignored/,
    },
    {
      name: 'git-global-exclude',
      prepare(fixture) {
        const home = path.join(fixture.root, '.git', 'hostile-home');
        fs.mkdirSync(home);
        const excludes = path.join(home, 'global-excludes');
        fs.writeFileSync(excludes, 'hidden-by-global.txt\n');
        fs.writeFileSync(
          path.join(home, '.gitconfig'),
          `[core]\n\texcludesFile = ${excludes}\n`,
        );
        writeTestFile(fixture.root, 'hidden-by-global.txt', 'hidden\n');
        fixture.environment = { HOME: home };
      },
      expected: /untracked non-ignored/,
    },
    {
      name: 'git-hostile-filter',
      prepare(fixture) {
        writeTestFile(
          fixture.root,
          '.gitattributes',
          'tracked.txt filter=conceal\n',
        );
        runGit(fixture.root, ['add', '.gitattributes']);
        runGit(fixture.root, ['commit', '--quiet', '-m', 'attributes']);
        runGit(
          fixture.root,
          ['config', 'filter.conceal.clean', "sed 's/.*/accepted/'"],
        );
        fs.writeFileSync(path.join(fixture.root, 'tracked.txt'), 'substituted\n');
        runGit(fixture.root, ['diff', '--quiet', '--', 'tracked.txt']);
      },
      expected: /raw tracked bytes differ/,
    },
    {
      name: 'git-replace-ref',
      prepare(fixture) {
        const replacement = runGit(
          fixture.root,
          ['commit-tree', 'HEAD^{tree}'],
          { input: 'replacement\n' },
        );
        runGit(fixture.root, ['replace', fixture.revision, replacement]);
      },
      expected: /replacement refs/,
    },
    {
      name: 'git-revision-mismatch',
      supplied(fixture) {
        return {
          suppliedRevision: 'f'.repeat(40),
          suppliedTree: fixture.tree,
        };
      },
      expected: /supplied source revision/,
    },
    {
      name: 'git-tree-mismatch',
      supplied(fixture) {
        return {
          suppliedRevision: fixture.revision,
          suppliedTree: 'e'.repeat(40),
        };
      },
      expected: /supplied source tree/,
    },
  ];

  for (const fixtureCase of cases) {
    const fixture = gitCheckout(fixtureCase.name);
    fixtureCase.prepare?.(fixture);
    const output = path.join(fixture.root, 'artifact-output');
    const previousEnvironment = new Map();
    for (const [name, value] of Object.entries(fixture.environment ?? {})) {
      previousEnvironment.set(name, process.env[name]);
      process.env[name] = value;
    }
    try {
      assert.throws(
        () =>
          attestFrontendCandidate({
            repositoryRoot: fixture.root,
            ...(fixtureCase.supplied?.(fixture) ?? {}),
          }),
        fixtureCase.expected,
      );
    } finally {
      for (const [name, value] of previousEnvironment) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
    assert.equal(fs.existsSync(output), false, `${fixtureCase.name} created artifact output`);
  }
});
