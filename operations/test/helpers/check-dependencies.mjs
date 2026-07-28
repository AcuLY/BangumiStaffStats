import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson } from '../../lib/canonical-json.mjs';
import { runWithCleanup } from '../../lib/failures.mjs';
import {
  cleanupRunRoot,
  createRunRoot,
  OPERATIONS_ROOT,
} from '../../lib/run-root.mjs';
import {
  buildSanitizedEnvironment,
  runSubprocess,
} from '../../lib/subprocess.mjs';
import { parseJsonStrict, readJsonStrict } from '../../lib/strict-json.mjs';

const REPOSITORY_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const EXPECTED_NODE = '24.18.0';
const EXPECTED_NPM = '11.16.0';
const EXPECTED_PACKAGES = new Map([
  ['', ['1.0.0', 'MIT']],
  ['node_modules/ajv', ['8.20.0', 'MIT']],
  ['node_modules/fast-deep-equal', ['3.1.3', 'MIT']],
  ['node_modules/fast-uri', ['3.1.4', 'BSD-3-Clause']],
  ['node_modules/json-schema-traverse', ['1.0.0', 'MIT']],
  ['node_modules/require-from-string', ['2.0.2', 'MIT']],
  ['node_modules/yaml', ['2.9.0', 'ISC']],
]);
const VULNERABLE_FAST_URI = new Set(['3.1.0', '3.1.1', '3.1.3']);

function fail(message) {
  throw new Error(message);
}

function assertExactPackageControl() {
  const manifest = readJsonStrict(path.join(OPERATIONS_ROOT, 'package.json'));
  const lock = readJsonStrict(path.join(OPERATIONS_ROOT, 'package-lock.json'));
  if (
    manifest.packageManager !== `npm@${EXPECTED_NPM}` ||
    manifest.engines?.node !== EXPECTED_NODE ||
    manifest.engines?.npm !== EXPECTED_NPM
  ) {
    fail('Operations Node/npm identities drifted');
  }
  if (
    Object.keys(manifest.dependencies ?? {}).sort().join(',') !== 'ajv,yaml' ||
    manifest.dependencies.ajv !== '8.20.0' ||
    manifest.dependencies.yaml !== '2.9.0'
  ) {
    fail('Operations direct dependency closure drifted');
  }
  const packageNames = Object.keys(lock.packages ?? {}).sort();
  const expectedNames = [...EXPECTED_PACKAGES.keys()].sort();
  if (
    packageNames.length !== expectedNames.length ||
    packageNames.some((name, index) => name !== expectedNames[index])
  ) {
    fail('Operations lock package closure is not exact');
  }
  for (const [name, [version, license]] of EXPECTED_PACKAGES) {
    const entry = lock.packages[name];
    if (entry?.version !== version || entry?.license !== license) {
      fail(`Operations lock identity drifted for ${name || 'root'}`);
    }
    if (entry.hasInstallScript === true) {
      fail(`Operations dependency declares an install script: ${name}`);
    }
  }
  const fastUri = lock.packages['node_modules/fast-uri']?.version;
  const yaml = lock.packages['node_modules/yaml']?.version;
  if (
    fastUri !== '3.1.4' ||
    VULNERABLE_FAST_URI.has(fastUri) ||
    yaml !== '2.9.0'
  ) {
    fail('Operations lock selected a prohibited vulnerable dependency');
  }
  return { lock, manifest };
}

function assertProductRuntimeIsolation() {
  const frozenManifestBlobs = new Map([
    ['backend/go.mod', '89ac999e2844294af3644a0158f7dc73623b3cbd'],
    ['backend/go.sum', '882cfe61b47ffac824fbbd7539306339f999d2f7'],
    ['frontend/package-lock.json', '6c6e9a3abdf5b8ebd9b9b20d55c031aee75fea67'],
    ['frontend/package.json', '32f813c62fbd35f72fd81d857cff40dde7058316'],
    ['updater/pyproject.toml', '5794f3bba889f23e1860cf3625bc223dd1554fbd'],
    ['updater/uv.lock', 'e12e3398086fa4fcf70a12b8586972db7885c28e'],
  ]);
  for (const [relative, expectedBlob] of frozenManifestBlobs) {
    const bytes = fs.readFileSync(path.join(REPOSITORY_ROOT, relative));
    const header = Buffer.from(`blob ${bytes.length}\0`, 'utf8');
    const actualBlob = createHash('sha1')
      .update(header)
      .update(bytes)
      .digest('hex');
    if (actualBlob !== expectedBlob) {
      fail(`protected product dependency manifest drifted: ${relative}`);
    }
  }
}

async function npmAudit(run) {
  if (process.versions.node !== EXPECTED_NODE) {
    fail(`dependency audit requires Node ${EXPECTED_NODE}`);
  }
  const npmExecutable = process.env.npm_execpath;
  if (
    typeof npmExecutable !== 'string' ||
    !path.isAbsolute(npmExecutable) ||
    !fs.lstatSync(npmExecutable).isFile() ||
    fs.realpathSync.native(npmExecutable) !== npmExecutable ||
    path.basename(npmExecutable) !== 'npm-cli.js'
  ) {
    fail('dependency audit cannot identify the invoking npm CLI');
  }
  const environment = buildSanitizedEnvironment({
    runRoot: run.runRoot,
    pathEntries: [path.dirname(process.execPath), '/usr/local/bin', '/usr/bin', '/bin']
      .filter((entry) => fs.existsSync(entry))
      .map((entry) => fs.realpathSync.native(entry))
      .filter((entry, index, values) => values.indexOf(entry) === index),
  });
  const npmVersion = await runSubprocess({
    command: process.execPath,
    args: [npmExecutable, '--version', '--no-update-notifier'],
    cwd: OPERATIONS_ROOT,
    environment,
    timeoutMs: 30_000,
  });
  if (npmVersion.stdout.trim() !== EXPECTED_NPM) {
    fail(`dependency audit requires npm ${EXPECTED_NPM}`);
  }
  const audit = await runSubprocess({
    command: process.execPath,
    args: [
      npmExecutable,
      'audit',
      '--omit=dev',
      '--json',
      '--ignore-scripts',
      '--no-fund',
      '--no-update-notifier',
      '--audit-level=low',
    ],
    cwd: OPERATIONS_ROOT,
    environment,
    acceptedExitCodes: [0, 1],
    timeoutMs: 120_000,
    maxOutputBytes: 16 * 1024 * 1024,
  });
  const report = parseJsonStrict(audit.stdout, 'npm audit output');
  const vulnerabilities = report.metadata?.vulnerabilities;
  if (
    audit.exitCode !== 0 ||
    !vulnerabilities ||
    Object.values(vulnerabilities).some((count) => count !== 0)
  ) {
    fail('npm audit reported a dependency advisory or incomplete result');
  }
  return {
    command:
      'npm audit --omit=dev --json --ignore-scripts --no-fund --no-update-notifier --audit-level=low',
    npmVersion: EXPECTED_NPM,
    vulnerabilities,
  };
}

const packageControl = assertExactPackageControl();
assertProductRuntimeIsolation();
let dependencyRun;
const audit = await runWithCleanup(
  async () => {
    dependencyRun = createRunRoot({
      purpose: 'dependency-audit',
      directories: ['home', 'tmp'],
    });
    return await npmAudit(dependencyRun);
  },
  async () => {
    if (dependencyRun) cleanupRunRoot(dependencyRun.runRoot);
  },
  {
    actionStage: 'dependency-audit',
    cleanupStage: 'dependency-audit-cleanup',
  },
);

process.stdout.write(
  canonicalJson({
    advisoryAudit: audit,
    dependencyClosure: [...EXPECTED_PACKAGES].map(
      ([packagePath, [version, license]]) => ({
        license,
        packagePath,
        version,
      }),
    ),
    directLibraries: [
      { license: 'MIT', name: 'ajv', version: '8.20.0' },
      { license: 'ISC', name: 'yaml', version: '2.9.0' },
    ],
    lockfileVersion: packageControl.lock.lockfileVersion,
    productRuntimeIsolation: true,
    schemaVersion: 'operations-dependency-audit-v1',
  }),
);
