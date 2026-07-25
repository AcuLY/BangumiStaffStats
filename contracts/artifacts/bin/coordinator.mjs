#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

import { canonicalJson, assertCanonicalJson } from '../lib/canonical-json.mjs';
import {
  ensureGeneratedDirectory,
  removeGeneratedPath,
  requireGeneratedPath,
} from '../lib/generated-path.mjs';
import { deriveCleanCheckoutIdentity } from '../lib/git-checkout.mjs';
import {
  assembleCompatibilityManifest,
  sha256Bytes,
  sha256File,
  verifyComponentDirectory,
} from '../lib/validation.mjs';

const ARTIFACTS_ROOT = path.resolve(import.meta.dirname, '..');
const REPOSITORY_ROOT = path.resolve(ARTIFACTS_ROOT, '..', '..');
const TMP_ROOT = path.join(ARTIFACTS_ROOT, '.tmp');
const ASSEMBLED_ROOT = path.join(TMP_ROOT, 'assembled');
const SMOKE_RUNS_ROOT = path.join(TMP_ROOT, 'smoke-runs');
const FIXTURE_ROOT = path.join(
  REPOSITORY_ROOT,
  'contracts',
  'goldens',
  'archive',
  'valid',
  'minimal',
);
const SOURCE_OBJECT_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const DIRECT_CONTROL_PLANE_PATHS = Object.freeze([
  'backend/build/path-policy.sh',
  'backend/build/smoke.sh',
  'contracts/artifacts/bin/coordinator.mjs',
  'contracts/artifacts/lib/canonical-json.mjs',
  'contracts/artifacts/lib/generated-path.mjs',
  'contracts/artifacts/lib/git-checkout.mjs',
  'contracts/artifacts/lib/strict-json.mjs',
  'contracts/artifacts/lib/validation.mjs',
  'frontend/build/artifact.mjs',
  'frontend/build/smoke.mjs',
  'updater/build/artifact.py',
  'updater/build/runtime_prune.py',
  'updater/build/smoke.py',
]);
const RECURSIVE_CONTROL_PLANE_ROOTS = Object.freeze([
  'contracts/goldens',
  'contracts/openapi',
  'contracts/schemas',
]);

function fail(message) {
  throw new Error(message);
}

function generatedPathOptions(label) {
  return {
    repositoryRoot: REPOSITORY_ROOT,
    temporaryRoot: TMP_ROOT,
    label,
  };
}

function requireDirectory(candidate, label) {
  const resolved = path.resolve(candidate);
  const information = fs.lstatSync(resolved);
  if (information.isSymbolicLink() || !information.isDirectory()) {
    fail(`${label} must be a real directory`);
  }
  return resolved;
}

function snapshot(root) {
  const entries = [];
  function visit(directory, prefix) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name, 'en'),
    )) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) fail(`snapshot rejects symlink ${relative}`);
      if (entry.isDirectory()) visit(absolute, relative);
      else if (entry.isFile()) {
        entries.push({
          path: relative,
          size: fs.statSync(absolute).size,
          sha256: sha256File(absolute),
        });
      } else {
        fail(`snapshot rejects special file ${relative}`);
      }
    }
  }
  visit(root, '');
  return canonicalJson(entries);
}

function writeImmutableManifest(canonical) {
  const digest = sha256Bytes(canonical);
  const destination = path.join(ASSEMBLED_ROOT, digest.replace(':', '-'));
  ensureGeneratedDirectory(
    destination,
    generatedPathOptions('assembled manifest directory'),
  );
  const manifestPath = path.join(destination, 'compatibility-manifest.json');
  requireGeneratedPath(
    manifestPath,
    generatedPathOptions('assembled compatibility manifest'),
  );
  if (fs.existsSync(manifestPath)) {
    const existing = fs.readFileSync(manifestPath, 'utf8');
    assertCanonicalJson(existing, JSON.parse(existing), manifestPath);
    if (existing !== canonical) fail('content address already contains different manifest bytes');
  } else {
    fs.writeFileSync(manifestPath, canonical, { flag: 'wx', mode: 0o444 });
    requireGeneratedPath(
      manifestPath,
      generatedPathOptions('assembled compatibility manifest'),
    );
  }
  return { digest, manifestPath };
}

export function controlPlaneEnvironment(pycache) {
  const environment = { ...process.env };
  for (const name of [
    'BASH_ENV',
    'ENV',
    'NODE_OPTIONS',
    'NODE_PATH',
    'PYTHONHOME',
    'PYTHONINSPECT',
    'PYTHONPATH',
    'PYTHONSTARTUP',
  ]) {
    delete environment[name];
  }
  environment.PYTHONDONTWRITEBYTECODE = '1';
  environment.PYTHONNOUSERSITE = '1';
  environment.PYTHONPYCACHEPREFIX = pycache;
  environment.PYTHONSAFEPATH = '1';
  return environment;
}

function run(command, arguments_, { cwd, timeout, pycache }) {
  const result = spawnSync(command, arguments_, {
    cwd,
    env: controlPlaneEnvironment(pycache),
    encoding: 'utf8',
    timeout,
    killSignal: 'SIGTERM',
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) {
    fail(`${command} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`${command} ${arguments_.join(' ')} failed with ${result.status}`);
  }
}

function sourceIdentityFromStatements(roots) {
  const sources = [];
  for (const component of ['backend', 'frontend', 'updater']) {
    const statementPath = path.join(roots[component], 'component-statement.json');
    let information;
    try {
      information = fs.lstatSync(statementPath);
    } catch (error) {
      fail(`${component} statement is unavailable: ${error.message}`);
    }
    if (information.isSymbolicLink() || !information.isFile()) {
      fail(`${component} statement must be a regular non-symlink file`);
    }
    let document;
    try {
      document = JSON.parse(fs.readFileSync(statementPath, 'utf8'));
    } catch (error) {
      fail(`${component} statement cannot provide a source identity: ${error.message}`);
    }
    const source = document?.source;
    if (
      !source ||
      typeof source !== 'object' ||
      Array.isArray(source) ||
      !SOURCE_OBJECT_RE.test(source.revision) ||
      !SOURCE_OBJECT_RE.test(source.tree)
    ) {
      fail(`${component} statement has no valid source identity`);
    }
    sources.push({
      component,
      revision: source.revision,
      tree: source.tree,
    });
  }
  const [expected, ...remaining] = sources;
  for (const source of remaining) {
    if (source.revision !== expected.revision || source.tree !== expected.tree) {
      fail('component statements report mixed source identities');
    }
  }
  return { revision: expected.revision, tree: expected.tree };
}

function recursiveControlPlaneFiles(repositoryRoot, relativeRoot) {
  const result = [];
  const absoluteRoot = path.join(repositoryRoot, ...relativeRoot.split('/'));
  function visit(directory, prefix) {
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch (error) {
      fail(`control-plane directory is unavailable: ${prefix} (${error.message})`);
    }
    for (const entry of entries.sort((left, right) =>
      left.name.localeCompare(right.name, 'en'),
    )) {
      const relative = `${prefix}/${entry.name}`;
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        fail(`control-plane directory contains a symlink: ${relative}`);
      }
      if (entry.isDirectory()) visit(absolute, relative);
      else if (entry.isFile()) result.push(relative);
      else fail(`control-plane directory contains a special file: ${relative}`);
    }
  }
  const information = fs.lstatSync(absoluteRoot);
  if (information.isSymbolicLink() || !information.isDirectory()) {
    fail(`control-plane root must be a real directory: ${relativeRoot}`);
  }
  visit(absoluteRoot, relativeRoot);
  return result;
}

export function defaultSmokeControlPlanePaths(repositoryRoot = REPOSITORY_ROOT) {
  return [
    ...DIRECT_CONTROL_PLANE_PATHS,
    ...RECURSIVE_CONTROL_PLANE_ROOTS.flatMap((relative) =>
      recursiveControlPlaneFiles(repositoryRoot, relative),
    ),
  ].sort();
}

export function attestSmokeControlPlane({
  repositoryRoot = REPOSITORY_ROOT,
  source,
  controlPlanePaths = defaultSmokeControlPlanePaths(repositoryRoot),
}) {
  return deriveCleanCheckoutIdentity({
    repositoryRoot,
    suppliedRevision: source.revision,
    suppliedTree: source.tree,
    controlPlanePaths,
  });
}

function resolvedComponentRoots({ backend, frontend, updater }) {
  return {
    backend: requireDirectory(backend, 'Backend root'),
    frontend: requireDirectory(frontend, 'Frontend root'),
    updater: requireDirectory(updater, 'Updater root'),
  };
}

export function assembleArtifactSet({ backend, frontend, updater }) {
  const roots = resolvedComponentRoots({ backend, frontend, updater });
  for (const component of ['backend', 'frontend', 'updater']) {
    verifyComponentDirectory(roots[component], component);
  }
  const assembled = assembleCompatibilityManifest([
    roots.updater,
    roots.backend,
    roots.frontend,
  ]);
  return {
    roots,
    ...writeImmutableManifest(assembled.canonical),
    manifest: assembled.manifest,
  };
}

export function smokeArtifactSet({
  backend,
  frontend,
  updater,
  docker = 'docker',
  python = path.join(REPOSITORY_ROOT, 'updater', '.venv', 'bin', 'python'),
}, {
  repositoryRoot = REPOSITORY_ROOT,
  fixtureRoot = FIXTURE_ROOT,
  controlPlanePaths = defaultSmokeControlPlanePaths(repositoryRoot),
  runCommand = run,
} = {}) {
  const roots = resolvedComponentRoots({ backend, frontend, updater });
  const source = sourceIdentityFromStatements(roots);
  attestSmokeControlPlane({ repositoryRoot, source, controlPlanePaths });
  const accepted = assembleArtifactSet(roots);
  const fixture = requireDirectory(fixtureRoot, 'accepted Archive fixture');
  const before = new Map([
    ['backend', snapshot(accepted.roots.backend)],
    ['frontend', snapshot(accepted.roots.frontend)],
    ['updater', snapshot(accepted.roots.updater)],
    ['fixture', snapshot(fixture)],
  ]);
  const target = accepted.manifest.target;
  const targetValue = `${target.os}/${target.architecture}`;
  ensureGeneratedDirectory(
    SMOKE_RUNS_ROOT,
    generatedPathOptions('coordinator smoke runs root'),
  );
  const runRoot = fs.mkdtempSync(path.join(SMOKE_RUNS_ROOT, 'run-'));
  requireGeneratedPath(runRoot, generatedPathOptions('coordinator smoke run'));
  const pycache = ensureGeneratedDirectory(
    path.join(runRoot, 'pycache'),
    generatedPathOptions('coordinator Python cache'),
  );
  try {
    runCommand(
      path.join(repositoryRoot, 'backend', 'build', 'smoke.sh'),
      ['--artifact-root', accepted.roots.backend],
      { cwd: runRoot, timeout: 180_000, pycache },
    );
    runCommand(
      python,
      [
        path.join(repositoryRoot, 'updater', 'build', 'smoke.py'),
        accepted.roots.updater,
        '--contracts-root',
        path.join(repositoryRoot, 'contracts'),
        '--docker',
        docker,
        '--target',
        targetValue,
      ],
      { cwd: runRoot, timeout: 300_000, pycache },
    );
    runCommand(
      process.execPath,
      [
        path.join(repositoryRoot, 'frontend', 'build', 'smoke.mjs'),
        'smoke',
        accepted.roots.frontend,
      ],
      { cwd: runRoot, timeout: 60_000, pycache },
    );
    const after = new Map([
      ['backend', snapshot(accepted.roots.backend)],
      ['frontend', snapshot(accepted.roots.frontend)],
      ['updater', snapshot(accepted.roots.updater)],
      ['fixture', snapshot(fixture)],
    ]);
    for (const [name, value] of before) {
      if (after.get(name) !== value) fail(`${name} bytes changed during artifact-only smoke`);
    }
  } finally {
    removeGeneratedPath(
      runRoot,
      generatedPathOptions('coordinator smoke run'),
    );
  }
  return accepted;
}

function options(argv) {
  const result = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith('--') || value === undefined || result.has(name)) {
      fail('options must be unique --name value pairs');
    }
    result.set(name, value);
  }
  return result;
}

function required(values, key) {
  const value = values.get(key);
  if (!value) fail(`missing ${key}`);
  return value;
}

function main(argv) {
  const [command, ...optionValues] = argv;
  if (!['assemble', 'smoke'].includes(command)) {
    fail(
      'usage: coordinator.mjs assemble|smoke --backend ROOT --frontend ROOT ' +
        '--updater ROOT [--docker PATH --python PATH]',
    );
  }
  const values = options(optionValues);
  const allowed = new Set(['--backend', '--frontend', '--updater', '--docker', '--python']);
  for (const key of values.keys()) if (!allowed.has(key)) fail(`unknown option ${key}`);
  const input = {
    backend: required(values, '--backend'),
    frontend: required(values, '--frontend'),
    updater: required(values, '--updater'),
    docker: values.get('--docker'),
    python: values.get('--python'),
  };
  const accepted =
    command === 'assemble' ? assembleArtifactSet(input) : smokeArtifactSet(input);
  process.stdout.write(`COMPATIBILITY_MANIFEST=${accepted.manifestPath}\n`);
  process.stdout.write(`COMPATIBILITY_DIGEST=${accepted.digest}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`artifact coordinator error: ${error.message}\n`);
    process.exitCode = 1;
  }
}
