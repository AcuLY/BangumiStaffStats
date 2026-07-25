#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

import {
  FRONTEND_ROOT,
  NPM_VERSION,
  NODE_VERSION,
  TMP_ROOT,
  compareComponentDirectories,
  ensureUnderTmpDirectory,
  packageStaticArtifact,
  publishComponentDirectory,
  removeUnderTmp,
  requireUnderTmp,
} from './artifact.mjs';
import { smokeFrontend } from './smoke.mjs';
import {
  captureTrackedRegularFilesAtRevision,
  deriveCleanCheckoutIdentity,
} from '../../contracts/artifacts/lib/git-checkout.mjs';

const REPOSITORY_ROOT = path.resolve(FRONTEND_ROOT, '..');
const REPRO_ROOT = path.join(TMP_ROOT, 'reproducibility');

function fail(message) {
  throw new Error(message);
}

function run(command, arguments_, options) {
  const result = spawnSync(command, arguments_, {
    ...options,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    fail(`${command} ${arguments_.join(' ')} failed with ${result.status}`);
  }
}

function output(command, arguments_, cwd = REPOSITORY_ROOT) {
  const result = spawnSync(command, arguments_, {
    cwd,
    encoding: 'utf8',
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) fail(`${command} ${arguments_.join(' ')} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function copyTrackedTree(prefix, destination, sourceIdentity) {
  ensureUnderTmpDirectory(destination, `${prefix} candidate destination`);
  const files = captureTrackedRegularFilesAtRevision({
    repositoryRoot: REPOSITORY_ROOT,
    revision: sourceIdentity.revision,
    prefix,
  });
  for (const file of files) {
    const repositoryRelative = file.path;
    const relative =
      repositoryRelative === prefix
        ? path.basename(prefix)
        : repositoryRelative.slice(prefix.length + 1);
    const target = path.join(destination, ...relative.split('/'));
    requireUnderTmp(target, `${prefix} candidate file ${relative}`);
    ensureUnderTmpDirectory(
      path.dirname(target),
      `${prefix} candidate parent ${relative}`,
    );
    fs.writeFileSync(target, file.bytes, {
      flag: 'wx',
      mode: file.mode === '100755' ? 0o755 : 0o644,
    });
    requireUnderTmp(target, `${prefix} candidate file ${relative}`);
  }
}

function checkToolchain() {
  if (process.version !== `v${NODE_VERSION}`) {
    fail(`requires Node v${NODE_VERSION}, received ${process.version}`);
  }
  const npmVersion = output('npm', ['--version'], FRONTEND_ROOT);
  if (npmVersion !== NPM_VERSION) {
    fail(`requires npm ${NPM_VERSION}, received ${npmVersion}`);
  }
}

function isolatedBuild(label, sourceIdentity, targetArchitecture) {
  const root = path.join(REPRO_ROOT, label);
  const workspace = path.join(root, 'workspace');
  const source = path.join(workspace, 'frontend');
  const cache = path.join(root, 'npm-cache');
  const component = path.join(root, 'component');
  ensureUnderTmpDirectory(root, `isolated ${label} root`);
  copyTrackedTree('frontend', source, sourceIdentity);
  copyTrackedTree('contracts', path.join(workspace, 'contracts'), sourceIdentity);
  ensureUnderTmpDirectory(cache, `isolated ${label} npm cache`);
  const environment = {
    ...process.env,
    CI: '1',
    npm_config_cache: cache,
    npm_config_audit: 'false',
    npm_config_fund: 'false',
    npm_config_update_notifier: 'false',
  };
  run(
    'npm',
    ['ci', '--ignore-scripts', '--no-audit', '--no-fund'],
    { cwd: source, env: environment },
  );
  run('npm', ['run', 'build'], { cwd: source, env: environment });
  run('npm', ['run', 'check:artifact'], { cwd: source, env: environment });
  packageStaticArtifact({
    distRoot: path.join(source, 'dist'),
    outputRoot: component,
    sourceRevision: sourceIdentity.revision,
    sourceTree: sourceIdentity.tree,
    targetArchitecture,
    packageLockPath: path.join(source, 'package-lock.json'),
    viteConfigPath: path.join(source, 'vite.config.ts'),
  });
  return component;
}

function acceptanceOptions(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith('--') || value === undefined || values.has(name)) {
      fail('options must be unique --name value pairs');
    }
    values.set(name, value);
  }
  const allowed = new Set(['--target-arch', '--source-revision', '--source-tree']);
  for (const name of values.keys()) {
    if (!allowed.has(name)) fail(`unknown option ${name}`);
  }
  const architecture =
    values.get('--target-arch') ?? (process.arch === 'x64' ? 'amd64' : process.arch);
  if (!['amd64', 'arm64'].includes(architecture)) {
    fail('target architecture must be amd64 or arm64');
  }
  return {
    architecture,
    suppliedRevision: values.get('--source-revision'),
    suppliedTree: values.get('--source-tree'),
  };
}

export function attestFrontendCandidate({
  repositoryRoot = REPOSITORY_ROOT,
  suppliedRevision,
  suppliedTree,
} = {}) {
  return deriveCleanCheckoutIdentity({
    repositoryRoot,
    suppliedRevision,
    suppliedTree,
  });
}

export async function runFrontendAcceptance(argv) {
  const options = acceptanceOptions(argv);
  const sourceIdentity = attestFrontendCandidate(options);
  checkToolchain();
  requireUnderTmp(REPRO_ROOT, 'reproducibility root');
  if (fs.existsSync(REPRO_ROOT)) removeUnderTmp(REPRO_ROOT, 'reproducibility root');
  ensureUnderTmpDirectory(REPRO_ROOT, 'reproducibility root');
  const first = isolatedBuild('first', sourceIdentity, options.architecture);
  const second = isolatedBuild('second', sourceIdentity, options.architecture);
  compareComponentDirectories(first, second);
  const published = publishComponentDirectory(first, path.join(TMP_ROOT, 'published'));
  await smokeFrontend(published);
  process.stdout.write(`FRONTEND_ARTIFACT_ROOT=${published}\n`);
  process.stdout.write(`frontend reproducibility passed: ${published}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  try {
    await runFrontendAcceptance(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`frontend reproducibility error: ${error.message}\n`);
    process.exitCode = 1;
  }
}
