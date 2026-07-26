import fs from 'node:fs';
import path from 'node:path';

import { canonicalJson, canonicalJsonDigest } from './canonical-json.mjs';
import { requireCanonicalPath } from './paths.mjs';
import { sha256File } from './seal.mjs';
import { readJsonStrict } from './strict-json.mjs';

export class CacheSeedError extends Error {}

export const GO_TOOLCHAIN_MODULE = 'golang.org/toolchain';
export const GO_TOOLCHAIN_VERSION = 'v0.0.1-go1.26.5.darwin-arm64';

function goToolchainRelativeRoot() {
  const parts = GO_TOOLCHAIN_MODULE.split('/');
  const name = parts.pop();
  return path.join(...parts, `${name}@${GO_TOOLCHAIN_VERSION}`);
}

function fail(message) {
  throw new CacheSeedError(message);
}

function ensureDestination(destination) {
  if (fs.existsSync(destination)) fail(`cache destination already exists: ${destination}`);
  fs.mkdirSync(destination, { recursive: true, mode: 0o700 });
}

function copyRegularFile(source, destination) {
  const information = fs.lstatSync(source);
  if (information.isSymbolicLink() || !information.isFile()) {
    fail(`cache source is not a regular file: ${source}`);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_FICLONE);
  const copied = fs.statSync(destination);
  if (copied.dev === information.dev && copied.ino === information.ino) {
    fail(`cache seed created a hard link: ${source}`);
  }
  fs.chmodSync(destination, information.mode & 0o777);
}

function visitRegularTree(root, prefix, entries) {
  for (const entry of fs
    .readdirSync(root, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
    const absolute = path.join(root, entry.name);
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const information = fs.lstatSync(absolute);
    if (information.isSymbolicLink()) fail(`cache contains symlink ${absolute}`);
    if (information.isDirectory()) {
      visitRegularTree(absolute, relative, entries);
    } else if (information.isFile()) {
      entries.push(relative);
    } else {
      fail(`cache contains special file ${absolute}`);
    }
  }
}

export function copyCacheTree(source, destination) {
  const root = requireCanonicalPath(source, {
    label: 'cache source',
    type: 'directory',
  });
  ensureDestination(destination);
  function visit(sourceDirectory, destinationDirectory) {
    for (const entry of fs.readdirSync(sourceDirectory, { withFileTypes: true })) {
      const sourcePath = path.join(sourceDirectory, entry.name);
      const destinationPath = path.join(destinationDirectory, entry.name);
      const information = fs.lstatSync(sourcePath);
      if (information.isSymbolicLink()) fail(`cache contains symlink ${sourcePath}`);
      if (information.isDirectory()) {
        // Caller-owned cache inputs are frozen read-only. Keep the new tree
        // writable while populating it; copying a 0555 mode before descending
        // would make the first nested file impossible to create.
        fs.mkdirSync(destinationPath, { mode: 0o700 });
        visit(sourcePath, destinationPath);
      } else if (information.isFile()) {
        copyRegularFile(sourcePath, destinationPath);
      } else {
        fail(`cache contains special file ${sourcePath}`);
      }
    }
    const sourceMode = fs.lstatSync(sourceDirectory).mode & 0o777;
    fs.chmodSync(destinationDirectory, sourceMode);
  }
  visit(root, destination);
  return destination;
}

function npmCacacheRoot(source) {
  const root = requireCanonicalPath(source, {
    label: 'npm cache source',
    type: 'directory',
  });
  if (path.basename(root) === '_cacache') return root;
  return requireCanonicalPath(path.join(root, '_cacache'), {
    label: 'npm content cache source',
    type: 'directory',
  });
}

function integrityPath(cacheRoot, integrity) {
  const match = /^(sha512|sha256)-([A-Za-z0-9+/]+={0,2})$/u.exec(integrity);
  if (!match) fail(`unsupported package integrity: ${integrity}`);
  const hexadecimal = Buffer.from(match[2], 'base64').toString('hex');
  if (hexadecimal.length < 8) fail(`short package integrity: ${integrity}`);
  return path.join(
    cacheRoot,
    'content-v2',
    match[1],
    hexadecimal.slice(0, 2),
    hexadecimal.slice(2, 4),
    hexadecimal.slice(4),
  );
}

export function collectLockIntegrities(lockPaths) {
  const integrities = new Set();
  for (const lockPath of lockPaths) {
    const lock = readJsonStrict(lockPath);
    const packages = lock.packages;
    if (!packages || typeof packages !== 'object' || Array.isArray(packages)) {
      fail(`lockfile has no package closure: ${lockPath}`);
    }
    for (const declaration of Object.values(packages)) {
      if (declaration?.integrity) integrities.add(declaration.integrity);
    }
  }
  return Object.freeze([...integrities].sort());
}

export function seedNpmCache({ source, destination, lockPaths }) {
  const cacache = npmCacacheRoot(source);
  ensureDestination(destination);
  const destinationCache = path.join(destination, '_cacache');
  fs.mkdirSync(destinationCache, { mode: 0o700 });
  const indexSource = path.join(cacache, 'index-v5');
  if (fs.existsSync(indexSource)) {
    copyCacheTree(indexSource, path.join(destinationCache, 'index-v5'));
  }
  for (const integrity of collectLockIntegrities(lockPaths)) {
    const sourcePath = integrityPath(cacache, integrity);
    if (!fs.existsSync(sourcePath)) {
      fail(`npm cache is missing locked content ${integrity}`);
    }
    const relative = path.relative(cacache, sourcePath);
    copyRegularFile(sourcePath, path.join(destinationCache, relative));
  }
  fs.writeFileSync(path.join(destination, '.seed-complete'), 'npm-cache-v1\n', {
    flag: 'wx',
    mode: 0o400,
  });
  return destination;
}

function escapeModulePath(modulePath) {
  let result = '';
  for (const character of modulePath) {
    if (/[A-Z]/u.test(character)) result += `!${character.toLowerCase()}`;
    else result += character;
  }
  return result;
}

function goModules(goSumPath) {
  const modules = new Map();
  const source = fs.readFileSync(goSumPath, 'utf8');
  for (const [lineNumber, line] of source.split(/\r?\n/u).entries()) {
    if (!line) continue;
    const match = /^(\S+) (\S+) h1:[A-Za-z0-9+/=]+$/u.exec(line);
    if (!match) fail(`invalid go.sum line ${lineNumber + 1}`);
    const goModOnly = match[2].endsWith('/go.mod');
    const version = goModOnly ? match[2].slice(0, -'/go.mod'.length) : match[2];
    if (!/^v[0-9][A-Za-z0-9.+_-]*$/u.test(version)) {
      fail(`invalid Go module version on line ${lineNumber + 1}`);
    }
    const key = `${match[1]}@${version}`;
    const previous = modules.get(key);
    modules.set(key, {
      module: match[1],
      version,
      needsZip: Boolean(previous?.needsZip || !goModOnly),
    });
  }
  return [...modules.values()].sort((left, right) =>
    `${left.module}@${left.version}`.localeCompare(
      `${right.module}@${right.version}`,
      'en',
    ),
  );
}

function goModuleSeedPaths(sourceRoot, goSumPath) {
  const sourceDownload = path.join(sourceRoot, 'cache', 'download');
  const paths = [];
  for (const declaration of goModules(goSumPath)) {
    const escaped = escapeModulePath(declaration.module);
    const versionRoot = path.join('cache', 'download', ...escaped.split('/'), '@v');
    const requiredSuffixes = declaration.needsZip
      ? ['.info', '.mod', '.zip', '.ziphash']
      : ['.mod'];
    for (const suffix of requiredSuffixes) {
      const relative = path.join(versionRoot, `${declaration.version}${suffix}`);
      const sourcePath = path.join(sourceRoot, relative);
      if (!fs.existsSync(sourcePath)) {
        fail(
          `Go cache is missing ${declaration.module}@${declaration.version}${suffix}`,
        );
      }
      paths.push(relative);
    }
    for (const suffix of ['.info', '.zip', '.ziphash']) {
      const relative = path.join(versionRoot, `${declaration.version}${suffix}`);
      if (!paths.includes(relative) && fs.existsSync(path.join(sourceRoot, relative))) {
        paths.push(relative);
      }
    }
  }
  if (!fs.existsSync(sourceDownload)) fail('Go cache has no download directory');
  return paths;
}

function goToolchainSeedPaths(sourceRoot) {
  const toolchainRelative = goToolchainRelativeRoot();
  const toolchainRoot = path.join(sourceRoot, toolchainRelative);
  const information = fs.lstatSync(toolchainRoot);
  if (information.isSymbolicLink() || !information.isDirectory()) {
    fail('Go 1.26.5 toolchain source is not a real directory');
  }
  const descendants = [];
  visitRegularTree(toolchainRoot, toolchainRelative, descendants);
  const required = [
    `${toolchainRelative}/VERSION`,
    `${toolchainRelative}/bin/go`,
    `${toolchainRelative}/bin/gofmt`,
    `${toolchainRelative}/pkg/tool/darwin_arm64/compile`,
    `${toolchainRelative}/src/runtime/runtime.go`,
  ];
  for (const relative of required) {
    if (!descendants.includes(relative)) {
      fail(`Go 1.26.5 toolchain source is incomplete: ${relative}`);
    }
  }
  if (descendants.length < 1_000) {
    fail('Go 1.26.5 toolchain source is implausibly small');
  }
  return descendants;
}

export function createGoSeedPlan({ source, goSumPath }) {
  const sourceRoot = requireCanonicalPath(source, {
    label: 'Go module cache source',
    type: 'directory',
  });
  const canonicalGoSum = requireCanonicalPath(goSumPath, {
    label: 'backend go.sum',
    type: 'file',
  });
  const modulePaths = goModuleSeedPaths(sourceRoot, canonicalGoSum);
  const toolchainPaths = goToolchainSeedPaths(sourceRoot);
  const paths = Object.freeze([...new Set([...modulePaths, ...toolchainPaths])].sort());
  return Object.freeze({
    sourceRoot,
    goSumPath: canonicalGoSum,
    paths,
    moduleFileCount: modulePaths.length,
    toolchainFileCount: toolchainPaths.length,
  });
}

export async function sealGoSeedPlan(plan, root = plan.sourceRoot) {
  const entries = [];
  for (const relative of plan.paths) {
    const absolute = path.join(root, relative);
    const information = fs.lstatSync(absolute);
    if (information.isSymbolicLink() || !information.isFile()) {
      fail(`Go seed path is not a regular file: ${relative}`);
    }
    entries.push({
      path: relative,
      mode: information.mode & 0o777,
      size: information.size,
      sha256: await sha256File(absolute),
    });
  }
  return Object.freeze({
    entries: Object.freeze(entries),
    canonical: canonicalJson(entries),
    digest: canonicalJsonDigest(entries),
  });
}

function assertSameGoSeal(before, after, label) {
  if (before.canonical !== after.canonical || before.digest !== after.digest) {
    fail(`${label} changed while the isolated cache was seeded`);
  }
}

export async function seedGoModuleCache({ source, destination, goSumPath }) {
  const plan = createGoSeedPlan({ source, goSumPath });
  const sourceBefore = await sealGoSeedPlan(plan);
  ensureDestination(destination);
  for (const relative of plan.paths) {
    copyRegularFile(
      path.join(plan.sourceRoot, relative),
      path.join(destination, relative),
    );
  }
  const [sourceAfter, destinationSeal] = await Promise.all([
    sealGoSeedPlan(plan),
    sealGoSeedPlan(plan, destination),
  ]);
  assertSameGoSeal(sourceBefore, sourceAfter, 'Go seed source');
  assertSameGoSeal(sourceBefore, destinationSeal, 'Go seed destination');
  const marker = {
    schemaVersion: 1,
    sourceDigest: sourceBefore.digest,
    moduleFileCount: plan.moduleFileCount,
    toolchainFileCount: plan.toolchainFileCount,
    toolchainVersion: 'go1.26.5',
  };
  fs.writeFileSync(path.join(destination, '.seed-complete'), canonicalJson(marker), {
    flag: 'wx',
    mode: 0o400,
  });
  return Object.freeze({
    destination,
    marker: Object.freeze(marker),
    sourceBefore,
    sourceAfter,
    destinationSeal,
  });
}

function requireExactObjectKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((name, index) => name !== wanted[index])
  ) {
    fail(`${label} has unexpected fields`);
  }
}

export function validateSeededGoToolchain(destination) {
  const root = requireCanonicalPath(destination, {
    label: 'seeded Go cache',
    type: 'directory',
  });
  const marker = readJsonStrict(path.join(root, '.seed-complete'));
  requireExactObjectKeys(
    marker,
    [
      'schemaVersion',
      'sourceDigest',
      'moduleFileCount',
      'toolchainFileCount',
      'toolchainVersion',
    ],
    'Go seed marker',
  );
  if (
    marker.schemaVersion !== 1 ||
    marker.toolchainVersion !== 'go1.26.5' ||
    !/^sha256:[0-9a-f]{64}$/u.test(marker.sourceDigest) ||
    !Number.isSafeInteger(marker.moduleFileCount) ||
    marker.moduleFileCount < 1 ||
    !Number.isSafeInteger(marker.toolchainFileCount) ||
    marker.toolchainFileCount < 1_000
  ) {
    fail('Go seed marker is invalid');
  }
  const goroot = path.join(
    root,
    goToolchainRelativeRoot(),
  );
  const version = requireCanonicalPath(path.join(goroot, 'VERSION'), {
    label: 'seeded Go VERSION',
    type: 'file',
  });
  if (
    !/^go1\.26\.5\ntime [0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z\n$/u.test(
      fs.readFileSync(version, 'utf8'),
    )
  ) {
    fail('seeded Go VERSION is not go1.26.5');
  }
  for (const relative of [
    'bin/go',
    'bin/gofmt',
    'pkg/tool/darwin_arm64/compile',
    'src/runtime/runtime.go',
  ]) {
    const file = requireCanonicalPath(path.join(goroot, relative), {
      label: `seeded Go ${relative}`,
      type: 'file',
    });
    if (
      (relative.startsWith('bin/') || relative.startsWith('pkg/tool/')) &&
      (fs.statSync(file).mode & 0o111) === 0
    ) {
      fail(`seeded Go executable is not executable: ${relative}`);
    }
  }
  return Object.freeze({ goroot, marker: Object.freeze(marker) });
}
