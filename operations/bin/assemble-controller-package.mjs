#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { assertGitOid, sha256File } from '../lib/digest.mjs';
import {
  assertAbsoluteNormalizedPath,
  assertSafeRelativePath,
  requireCanonicalPath,
} from '../lib/path-policy.mjs';
import {
  parseCanonicalJson,
  readJsonStrict,
} from '../lib/strict-json.mjs';

const DEFINITIONS = readJsonStrict(
  new URL('../config/controller-files.json', import.meta.url),
);
const FIXED_TIME = new Date(0);

function fail(message) {
  throw new Error(message);
}

function parseArguments(argv) {
  if (
    argv.length !== 6 ||
    argv[0] !== '--operations-root' ||
    argv[2] !== '--controller-revision' ||
    argv[4] !== '--output-root'
  ) {
    fail(
      'usage: assemble-controller-package.mjs --operations-root /absolute/operations --controller-revision <40hex> --output-root /absolute/absent-root',
    );
  }
  const operationsRoot = requireCanonicalPath(argv[1], {
    label: 'operations source root',
    type: 'directory',
  });
  const outputRoot = assertAbsoluteNormalizedPath(
    argv[5],
    'controller package output root',
  );
  const outputParent = requireCanonicalPath(path.dirname(outputRoot), {
    label: 'controller package output parent',
    type: 'directory',
  });
  assertSafeRelativePath(path.basename(outputRoot), 'controller package name');
  if (path.join(outputParent, path.basename(outputRoot)) !== outputRoot) {
    fail('controller package output root must use its canonical parent');
  }
  try {
    fs.lstatSync(outputRoot);
    fail('controller package output root must be absent');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return {
    controllerRevision: assertGitOid(argv[3], 'controller revision'),
    operationsRoot,
    outputRoot,
  };
}

function assertDefinitions() {
  if (
    DEFINITIONS.schemaVersion !== 'controller-files-v1' ||
    DEFINITIONS.bootstrap !== 'bin/bgmss-v2-deploy' ||
    !Array.isArray(DEFINITIONS.files) ||
    DEFINITIONS.files.length !== 11
  ) {
    fail('controller inventory definition is invalid');
  }
  const inventory = [DEFINITIONS.bootstrap, ...DEFINITIONS.files];
  if (
    new Set(inventory).size !== inventory.length ||
    inventory.some(
      (relative) =>
        assertSafeRelativePath(relative, 'controller inventory path') !==
        relative,
    )
  ) {
    fail('controller inventory definition is not closed');
  }
  return inventory;
}

function packageMode(relative) {
  if (relative === 'compose/updater-current-deny') return '0000';
  if (
    relative === DEFINITIONS.bootstrap ||
    relative === 'bin/bgmss-ops'
  ) {
    return '0555';
  }
  return '0444';
}

function sourceFile(operationsRoot, relative) {
  return requireCanonicalPath(
    path.join(operationsRoot, ...relative.split('/')),
    {
      below: operationsRoot,
      label: `controller source ${relative}`,
      requireSingleLink: true,
      type: 'file',
    },
  );
}

function ensurePayloadDirectories(payloadRoot, inventory) {
  const directories = new Set(['']);
  for (const relative of inventory) {
    let parent = path.posix.dirname(relative);
    while (parent !== '.') {
      directories.add(parent);
      parent = path.posix.dirname(parent);
    }
  }
  for (const relative of [...directories].sort(
    (left, right) =>
      left.split('/').length - right.split('/').length ||
      left.localeCompare(right),
  )) {
    const destination =
      relative === ''
        ? payloadRoot
        : path.join(payloadRoot, ...relative.split('/'));
    fs.mkdirSync(destination, { mode: 0o755 });
  }
}

function copyInventory(operationsRoot, payloadRoot, inventory) {
  for (const relative of inventory) {
    const source = sourceFile(operationsRoot, relative);
    const destination = path.join(payloadRoot, ...relative.split('/'));
    fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(
      destination,
      relative === 'compose/updater-current-deny'
        ? 0o444
        : Number.parseInt(packageMode(relative), 8),
    );
    fs.utimesSync(destination, FIXED_TIME, FIXED_TIME);
  }
}

function buildManifest({
  controllerRevision,
  operationsRoot,
  outputRoot,
  payloadRoot,
  inventory,
}) {
  const builder = requireCanonicalPath(
    path.join(operationsRoot, 'bin/build-controller-manifest.mjs'),
    {
      below: operationsRoot,
      label: 'controller manifest builder',
      requireSingleLink: true,
      type: 'file',
    },
  );
  const result = spawnSync(
    process.execPath,
    [
      builder,
      '--controller-revision',
      controllerRevision,
      '--payload-root',
      payloadRoot,
    ],
    {
      encoding: 'utf8',
      env: {
        LANG: 'C.UTF-8',
        LC_ALL: 'C.UTF-8',
        PATH: '/usr/bin:/bin',
        TZ: 'UTC',
      },
      maxBuffer: 1024 * 1024,
    },
  );
  if (result.status !== 0 || result.signal !== null) {
    fail(
      `controller manifest builder failed: ${result.stderr.trim() || 'no diagnostic'}`,
    );
  }
  const manifest = parseCanonicalJson(
    result.stdout,
    'assembled controller manifest',
  );
  if (
    manifest.schemaVersion !== 'controller-manifest-v1' ||
    manifest.controllerRevision !== controllerRevision ||
    manifest.bootstrap.path !== DEFINITIONS.bootstrap ||
    manifest.files.length !== DEFINITIONS.files.length ||
    manifest.files.some(
      (descriptor, index) => descriptor.path !== DEFINITIONS.files[index],
    )
  ) {
    fail('assembled controller manifest has the wrong closed inventory');
  }
  const descriptors = new Map([
    [manifest.bootstrap.path, manifest.bootstrap],
    ...manifest.files.map((descriptor) => [descriptor.path, descriptor]),
  ]);
  for (const relative of inventory) {
    const descriptor = descriptors.get(relative);
    const payload = path.join(payloadRoot, ...relative.split('/'));
    const information = fs.statSync(payload);
    if (
      descriptor?.mode !== packageMode(relative) ||
      descriptor.size !== information.size ||
      descriptor.sha256 !== sha256File(payload)
    ) {
      fail(`assembled controller descriptor mismatch: ${relative}`);
    }
  }
  const manifestPath = path.join(outputRoot, 'controller-manifest.json');
  fs.writeFileSync(manifestPath, result.stdout, {
    flag: 'wx',
    mode: 0o444,
  });
  fs.utimesSync(manifestPath, FIXED_TIME, FIXED_TIME);
  fs.chmodSync(manifestPath, 0o444);
}

function closePackageModes(outputRoot, payloadRoot, inventory) {
  for (const relative of inventory) {
    fs.utimesSync(
      path.join(payloadRoot, ...relative.split('/')),
      FIXED_TIME,
      FIXED_TIME,
    );
  }
  const sentinel = path.join(
    payloadRoot,
    'compose',
    'updater-current-deny',
  );
  fs.chmodSync(sentinel, 0o000);

  const directories = new Set([outputRoot, payloadRoot]);
  for (const relative of inventory) {
    let parent = path.dirname(
      path.join(payloadRoot, ...relative.split('/')),
    );
    while (parent !== outputRoot) {
      directories.add(parent);
      parent = path.dirname(parent);
    }
  }
  for (const directory of [...directories].sort(
    (left, right) => right.length - left.length,
  )) {
    fs.utimesSync(directory, FIXED_TIME, FIXED_TIME);
    fs.chmodSync(directory, 0o555);
  }
}

function cleanupOwnedOutput(outputRoot, identity) {
  let information;
  try {
    information = fs.lstatSync(outputRoot, { bigint: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  if (
    !information.isDirectory() ||
    information.isSymbolicLink() ||
    information.dev !== identity.dev ||
    information.ino !== identity.ino
  ) {
    fail('refusing to clean a replaced controller package output root');
  }
  function reopenDirectories(candidate) {
    const current = fs.lstatSync(candidate, { bigint: true });
    if (
      current.isSymbolicLink() ||
      current.dev !== identity.dev ||
      (!current.isDirectory() && !current.isFile()) ||
      (current.isFile() && current.nlink !== 1n)
    ) {
      fail('refusing to clean changed controller package output content');
    }
    if (!current.isDirectory()) return;
    fs.chmodSync(candidate, 0o700);
    for (const name of fs.readdirSync(candidate)) {
      reopenDirectories(path.join(candidate, name));
    }
  }
  reopenDirectories(outputRoot);
  fs.rmSync(outputRoot, { force: true, recursive: true });
}

try {
  const input = parseArguments(process.argv.slice(2));
  const inventory = assertDefinitions();
  fs.mkdirSync(input.outputRoot, { mode: 0o700 });
  const outputIdentity = fs.lstatSync(input.outputRoot, { bigint: true });
  try {
    const payloadRoot = path.join(input.outputRoot, 'payload');
    ensurePayloadDirectories(payloadRoot, inventory);
    copyInventory(input.operationsRoot, payloadRoot, inventory);
    buildManifest({
      ...input,
      inventory,
      payloadRoot,
    });
    closePackageModes(input.outputRoot, payloadRoot, inventory);
  } catch (error) {
    cleanupOwnedOutput(input.outputRoot, outputIdentity);
    throw error;
  }
  fs.writeSync(1, `${input.outputRoot}\n`);
} catch (error) {
  fs.writeSync(2, `assemble-controller-package: ${error.message}\n`);
  process.exitCode = 1;
}
