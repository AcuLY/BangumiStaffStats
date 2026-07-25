import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';

import {
  assembleArtifactSet,
  attestSmokeControlPlane,
  controlPlaneEnvironment,
  smokeArtifactSet,
} from '../bin/coordinator.mjs';
import {
  ensureGeneratedDirectory,
  removeGeneratedPath,
  requireGeneratedPath,
} from '../lib/generated-path.mjs';
import { verifyComponentDirectory } from '../lib/validation.mjs';

const POSITIVE = path.resolve(import.meta.dirname, '..', 'fixtures', 'positive');
const ARTIFACTS_ROOT = path.resolve(import.meta.dirname, '..');
const REPOSITORY_ROOT = path.resolve(ARTIFACTS_ROOT, '..', '..');
const TMP_ROOT = path.join(ARTIFACTS_ROOT, '.tmp');
const TEST_ROOT = path.join(TMP_ROOT, 'coordinator-attestation-tests');

function generatedOptions(label) {
  return {
    repositoryRoot: REPOSITORY_ROOT,
    temporaryRoot: TMP_ROOT,
    label,
  };
}

function resetTestRoot() {
  removeGeneratedPath(TEST_ROOT, generatedOptions('coordinator attestation tests'));
  ensureGeneratedDirectory(TEST_ROOT, generatedOptions('coordinator attestation tests'));
}

function writeGenerated(filePath, value) {
  requireGeneratedPath(filePath, generatedOptions('coordinator test file'));
  ensureGeneratedDirectory(
    path.dirname(filePath),
    generatedOptions('coordinator test file parent'),
  );
  fs.writeFileSync(filePath, value, { flag: 'wx' });
  requireGeneratedPath(filePath, generatedOptions('coordinator test file'));
}

function runGit(root, arguments_, { input } = {}) {
  const result = spawnSync('git', ['-C', root, ...arguments_], {
    encoding: 'utf8',
    input,
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: '1',
      HOME: path.join(root, '.test-home'),
    },
  });
  assert.equal(
    result.status,
    0,
    `git ${arguments_.join(' ')} failed:\n${result.stdout}\n${result.stderr}`,
  );
  return result.stdout.trim();
}

function attestedCheckout(name) {
  const root = path.join(TEST_ROOT, name, 'checkout');
  ensureGeneratedDirectory(root, generatedOptions(`checkout ${name}`));
  runGit(root, ['init', '--quiet']);
  runGit(root, ['config', 'user.name', 'Coordinator Test']);
  runGit(root, ['config', 'user.email', 'coordinator-test@example.invalid']);
  writeGenerated(path.join(root, '.gitignore'), 'ignored/\n');
  writeGenerated(path.join(root, 'control', 'helper.sh'), 'accepted\n');
  writeGenerated(path.join(root, 'tracked.txt'), 'accepted\n');
  runGit(root, ['add', '.gitignore', 'control/helper.sh', 'tracked.txt']);
  runGit(root, ['commit', '--quiet', '-m', 'fixture']);
  return {
    root,
    revision: runGit(root, ['rev-parse', 'HEAD']),
    tree: runGit(root, ['rev-parse', 'HEAD^{tree}']),
  };
}

function statementRoots(name, source) {
  const base = path.join(TEST_ROOT, name, 'components');
  const roots = {};
  for (const component of ['backend', 'frontend', 'updater']) {
    const root = path.join(base, component);
    ensureGeneratedDirectory(root, generatedOptions(`${component} statement root`));
    writeGenerated(
      path.join(root, 'component-statement.json'),
      `${JSON.stringify({ component, source })}\n`,
    );
    roots[component] = root;
  }
  return roots;
}

function assembledSnapshot() {
  const root = path.join(TMP_ROOT, 'assembled');
  if (!fs.existsSync(root)) return [];
  const result = [];
  function visit(directory, prefix) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name, 'en'),
    )) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute, relative);
      else if (entry.isFile()) {
        result.push([
          relative,
          fs.statSync(absolute).size,
          fs.readFileSync(absolute, 'hex'),
        ]);
      }
    }
  }
  visit(root, '');
  return result;
}

test('coordinator validates all owners before immutable canonical assembly', () => {
  const accepted = assembleArtifactSet({
    backend: path.join(POSITIVE, 'backend'),
    frontend: path.join(POSITIVE, 'frontend'),
    updater: path.join(POSITIVE, 'updater'),
  });
  assert.match(accepted.digest, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(
    accepted.manifest.components.map((entry) => entry.component),
    ['backend', 'frontend', 'updater'],
  );
  for (const component of ['backend', 'frontend', 'updater']) {
    assert.equal(
      verifyComponentDirectory(path.join(POSITIVE, component), component).statement.component,
      component,
    );
  }
});

test('smoke checkout attestation accepts an exact clean tracked control plane', () => {
  resetTestRoot();
  const checkout = attestedCheckout('clean');
  const identity = attestSmokeControlPlane({
    repositoryRoot: checkout.root,
    source: { revision: checkout.revision, tree: checkout.tree },
    controlPlanePaths: ['control/helper.sh'],
  });
  assert.equal(identity.revision, checkout.revision);
  assert.equal(identity.tree, checkout.tree);
});

test('smoke subprocess environment removes source and startup fallback hooks', () => {
  const names = [
    'BASH_ENV',
    'ENV',
    'NODE_OPTIONS',
    'NODE_PATH',
    'PYTHONHOME',
    'PYTHONINSPECT',
    'PYTHONPATH',
    'PYTHONSTARTUP',
  ];
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) process.env[name] = `/substituted/${name}`;
    const environment = controlPlaneEnvironment('/generated/pycache');
    for (const name of names) assert.equal(Object.hasOwn(environment, name), false);
    assert.equal(environment.PYTHONDONTWRITEBYTECODE, '1');
    assert.equal(environment.PYTHONNOUSERSITE, '1');
    assert.equal(environment.PYTHONPYCACHEPREFIX, '/generated/pycache');
    assert.equal(environment.PYTHONSAFEPATH, '1');
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test('coordinator sanitized environment launches the updater helper from a disposable cwd', () => {
  resetTestRoot();
  const runRoot = path.join(TEST_ROOT, 'sanitized-updater-helper');
  const pycache = path.join(runRoot, 'pycache');
  ensureGeneratedDirectory(
    runRoot,
    generatedOptions('sanitized updater helper cwd'),
  );
  writeGenerated(
    path.join(runRoot, 'artifact.py'),
    "raise RuntimeError('ambient cwd artifact module was imported')\n",
  );
  writeGenerated(
    path.join(runRoot, 'runtime_prune.py'),
    "raise RuntimeError('ambient cwd runtime_prune module was imported')\n",
  );
  const environment = controlPlaneEnvironment(pycache);
  const helper = path.join(REPOSITORY_ROOT, 'updater', 'build', 'smoke.py');
  const python =
    process.env.BGMSS_TEST_PYTHON ??
    path.join(REPOSITORY_ROOT, 'updater', '.venv', 'bin', 'python');
  const result = spawnSync(python, [helper, '--help'], {
    cwd: runRoot,
    env: environment,
    encoding: 'utf8',
  });
  assert.equal(
    result.status,
    0,
    `sanitized helper launch failed:\n${result.stdout}\n${result.stderr}`,
  );
  assert.match(result.stdout, /usage: smoke\.py/);
  assert.equal(Object.hasOwn(environment, 'PYTHONPATH'), false);
  assert.equal(environment.PYTHONSAFEPATH, '1');
  for (const forbidden of [
    'ambient cwd artifact module was imported',
    'ambient cwd runtime_prune module was imported',
    'ModuleNotFoundError',
  ]) {
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, new RegExp(forbidden));
  }
});

test('smoke rejects dirty, mismatched, untracked, symlinked, and substituted control planes before manifest or subprocess', () => {
  resetTestRoot();
  const cases = [
    {
      name: 'dirty',
      prepare(checkout) {
        const tracked = path.join(checkout.root, 'tracked.txt');
        requireGeneratedPath(tracked, generatedOptions('dirty tracked fixture'));
        fs.appendFileSync(tracked, 'dirty\n');
        requireGeneratedPath(tracked, generatedOptions('dirty tracked fixture'));
        return ['control/helper.sh'];
      },
      expected: /raw tracked bytes differ/,
    },
    {
      name: 'mismatch',
      source() {
        return { revision: 'f'.repeat(40), tree: 'e'.repeat(40) };
      },
      expected: /supplied source revision/,
    },
    {
      name: 'untracked',
      prepare(checkout) {
        writeGenerated(
          path.join(checkout.root, 'control', 'untracked.sh'),
          '#!/bin/sh\nexit 0\n',
        );
        return ['control/untracked.sh'];
      },
      expected: /not a tracked regular blob/,
    },
    {
      name: 'symlink',
      prepare(checkout) {
        const helper = path.join(checkout.root, 'control', 'helper.sh');
        requireGeneratedPath(helper, generatedOptions('symlinked control helper'));
        fs.unlinkSync(helper);
        fs.symlinkSync('../tracked.txt', helper);
        return ['control/helper.sh'];
      },
      expected: /must not traverse a symlink/,
    },
    {
      name: 'substituted',
      prepare(checkout) {
        const helper = path.join(checkout.root, 'control', 'helper.sh');
        requireGeneratedPath(helper, generatedOptions('substituted control helper'));
        fs.writeFileSync(helper, '#!/bin/sh\nexit 99\n');
        requireGeneratedPath(helper, generatedOptions('substituted control helper'));
        return ['control/helper.sh'];
      },
      expected: /raw tracked bytes differ/,
    },
    {
      name: 'index-flag',
      prepare(checkout) {
        runGit(checkout.root, [
          'update-index',
          '--assume-unchanged',
          'control/helper.sh',
        ]);
        return ['control/helper.sh'];
      },
      expected: /assume-unchanged|hidden flags/,
    },
    {
      name: 'nested-ignore',
      prepare(checkout) {
        writeGenerated(
          path.join(checkout.root, 'nested', '.gitignore'),
          '*\n',
        );
        writeGenerated(
          path.join(checkout.root, 'nested', 'payload.txt'),
          'hidden\n',
        );
        return ['control/helper.sh'];
      },
      expected: /untracked ignore-control/,
    },
    {
      name: 'hostile-filter',
      prepare(checkout) {
        writeGenerated(
          path.join(checkout.root, '.gitattributes'),
          'control/helper.sh filter=conceal\n',
        );
        runGit(checkout.root, ['add', '.gitattributes']);
        runGit(checkout.root, ['commit', '--quiet', '-m', 'attributes']);
        checkout.revision = runGit(checkout.root, ['rev-parse', 'HEAD']);
        checkout.tree = runGit(checkout.root, ['rev-parse', 'HEAD^{tree}']);
        runGit(
          checkout.root,
          ['config', 'filter.conceal.clean', "sed 's/.*/accepted/'"],
        );
        const helper = path.join(checkout.root, 'control', 'helper.sh');
        fs.writeFileSync(helper, 'substituted\n');
        runGit(checkout.root, ['diff', '--quiet', '--', 'control/helper.sh']);
        return ['control/helper.sh'];
      },
      expected: /raw tracked bytes differ/,
    },
  ];

  for (const fixtureCase of cases) {
    const checkout = attestedCheckout(fixtureCase.name);
    const controlPlanePaths =
      fixtureCase.prepare?.(checkout) ?? ['control/helper.sh'];
    const source =
      fixtureCase.source?.(checkout) ?? {
        revision: checkout.revision,
        tree: checkout.tree,
      };
    const roots = statementRoots(fixtureCase.name, source);
    const beforeManifest = assembledSnapshot();
    let subprocesses = 0;
    assert.throws(
      () =>
        smokeArtifactSet(
          roots,
          {
            repositoryRoot: checkout.root,
            fixtureRoot: path.join(checkout.root, 'unused-fixture'),
            controlPlanePaths,
            runCommand() {
              subprocesses += 1;
            },
          },
        ),
      fixtureCase.expected,
      fixtureCase.name,
    );
    assert.equal(subprocesses, 0, `${fixtureCase.name} started a subprocess`);
    assert.deepEqual(
      assembledSnapshot(),
      beforeManifest,
      `${fixtureCase.name} wrote a final manifest`,
    );
  }
});
