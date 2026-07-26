import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { ACCEPTANCE_ROOT } from './constants.mjs';
import { verifyAcceptanceInventory } from './inventory.mjs';
import { readJsonStrict } from './strict-json.mjs';

export class PackagePolicyError extends Error {}

function fail(message) {
  throw new PackagePolicyError(message);
}

const EXPECTED_LOCK_PACKAGES = Object.freeze([
  '',
  'node_modules/@playwright/test',
  'node_modules/fsevents',
  'node_modules/playwright',
  'node_modules/playwright-core',
]);
export const ACCEPTANCE_LOCK_SHA256 =
  '712239f1581ac943c81bf8d16e3573935ed9079be8c1d741a92c6f04bfcef17d';
const EXPECTED_RESOLVED_INTEGRITY = Object.freeze({
  'node_modules/@playwright/test': Object.freeze({
    resolved:
      'https://mirrors.tencent.com/npm/@playwright/test/-/test-1.61.0.tgz',
    integrity:
      'sha512-cKA5B6lpFEMyMGjxF54QihfYpB4FkEGH+qZhtArDEG+wezQAJY8Pq6C7T1SjWz+FFzt3TbyoXBQYk/0292TdJA==',
  }),
  'node_modules/fsevents': Object.freeze({
    resolved: 'https://mirrors.tencent.com/npm/fsevents/-/fsevents-2.3.2.tgz',
    integrity:
      'sha512-xiqMQR4xAeHTuB9uWm+fFRcIOgKBMiOBP+eXiyT7jsgVCq1bkVygt00oASowB7EdtpOHaaPgKt812P9ab+DDKA==',
  }),
  'node_modules/playwright': Object.freeze({
    resolved:
      'https://mirrors.tencent.com/npm/playwright/-/playwright-1.61.0.tgz',
    integrity:
      'sha512-Z+7BeeqQPRRzklHsVFP4KTGIyMxKUmfeRA4WisM6G3/XW6nwGeX6fX9qYaDa+CiUqpOkb2f6X3nar05R3kSuJQ==',
  }),
  'node_modules/playwright-core': Object.freeze({
    resolved:
      'https://mirrors.tencent.com/npm/playwright-core/-/playwright-core-1.61.0.tgz',
    integrity:
      'sha512-caX7TrY3Ml6egyDX0WUcTHDxodl/b51y5wJOdCEA36QviK/s2g081hvmGs8eaE3DWb6NYZQ6BjO/QkNRPenoPA==',
  }),
});

function fileSha256(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

export function verifyPackagePolicy(root = ACCEPTANCE_ROOT) {
  const manifestPath = path.join(root, 'package.json');
  const lockPath = path.join(root, 'package-lock.json');
  const manifest = readJsonStrict(manifestPath);
  const lock = readJsonStrict(lockPath);
  if (fileSha256(lockPath) !== ACCEPTANCE_LOCK_SHA256) {
    fail('package-lock.json bytes differ from the reviewed lock identity');
  }
  const expectedManifestKeys = [
    'devDependencies',
    'engines',
    'license',
    'name',
    'packageManager',
    'private',
    'scripts',
    'type',
    'version',
  ];
  if (Object.keys(manifest).sort().join('\n') !== expectedManifestKeys.join('\n')) {
    fail('package.json fields differ from the closed inventory');
  }
  if (
    manifest.name !== '@bangumi-staff-stats/development-acceptance' ||
    manifest.private !== true ||
    manifest.type !== 'module' ||
    manifest.license !== 'MIT' ||
    manifest.packageManager !== 'npm@11.16.0' ||
    manifest.engines?.node !== '24.18.0' ||
    manifest.engines?.npm !== '11.16.0'
  ) {
    fail('package identity/toolchain is not exact');
  }
  if (
    Object.keys(manifest.scripts).sort().join('\n') !==
      ['acceptance', 'check', 'test'].join('\n') ||
    manifest.scripts.acceptance !== 'node bin/acceptance.mjs' ||
    manifest.scripts.check !==
      'npm run test && node bin/acceptance.mjs verify-package' ||
    manifest.scripts.test !==
      'node --test test/*.test.mjs browser/*.test.mjs'
  ) {
    fail('acceptance scripts differ from the closed command registry');
  }
  if (
    Object.keys(manifest.devDependencies ?? {}).join(',') !== '@playwright/test' ||
    manifest.devDependencies['@playwright/test'] !== '1.61.0'
  ) {
    fail('the only direct development dependency must be @playwright/test@1.61.0');
  }
  if (manifest.dependencies !== undefined || manifest.optionalDependencies !== undefined) {
    fail('runtime and direct optional dependencies are forbidden');
  }
  for (const name of Object.keys(manifest.scripts)) {
    if (/^(?:pre|post)(?:install|prepare|pack|publish)$/u.test(name)) {
      fail(`install/package lifecycle script is forbidden: ${name}`);
    }
  }
  if (
    lock.name !== manifest.name ||
    lock.version !== manifest.version ||
    lock.lockfileVersion !== 3 ||
    lock.requires !== true
  ) {
    fail('package lock identity is invalid');
  }
  const packages = lock.packages;
  if (
    !packages ||
    Object.keys(packages).sort().join('\n') !== [...EXPECTED_LOCK_PACKAGES].sort().join('\n')
  ) {
    fail('package lock closure differs from the reviewed five-entry closure');
  }
  for (const name of [
    'node_modules/@playwright/test',
    'node_modules/playwright',
    'node_modules/playwright-core',
  ]) {
    const declaration = packages[name];
    if (declaration.version !== '1.61.0') fail(`${name} is not pinned to 1.61.0`);
    if (name !== 'node_modules/@playwright/test' && declaration.license !== 'Apache-2.0') {
      fail(`${name} license is not Apache-2.0`);
    }
    if (declaration.hasInstallScript) fail(`${name} unexpectedly has an install script`);
  }
  for (const [name, expected] of Object.entries(EXPECTED_RESOLVED_INTEGRITY)) {
    const declaration = packages[name];
    if (
      declaration.resolved !== expected.resolved ||
      declaration.integrity !== expected.integrity
    ) {
      fail(`${name} resolved URL or integrity differs from the reviewed lock`);
    }
  }
  const fsevents = packages['node_modules/fsevents'];
  if (
    fsevents.version !== '2.3.2' ||
    fsevents.optional !== true ||
    fsevents.license !== 'MIT' ||
    fsevents.hasInstallScript !== true
  ) {
    fail('Playwright optional fsevents closure changed');
  }
  const installPolicy = Object.freeze({
    command: 'npm ci --ignore-scripts --omit=optional --offline --no-audit --no-fund',
    browserDownload: false,
    directDependencyCount: 1,
    installedPackageCount: 3,
    optionalInstallScriptPackagesOmitted: Object.freeze(['fsevents@2.3.2']),
    productionBundleImpactBytes: 0,
  });
  if (fs.existsSync(path.join(root, 'node_modules'))) {
    fail('persistent acceptance node_modules is forbidden');
  }
  const inventory = verifyAcceptanceInventory(root);
  return Object.freeze({ manifest, lock, installPolicy, inventory });
}
