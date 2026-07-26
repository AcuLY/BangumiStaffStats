import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

import { throwIfAborted } from './abort-context.mjs';
import { copyCacheTree } from './cache.mjs';
import { requireInputCacheAttestation } from './cache-input.mjs';
import {
  canonicalJson,
  canonicalJsonDigest,
} from './canonical-json.mjs';
import { commandEvidence } from './evidence.mjs';
import {
  assertNoSymlinkAncestors,
  isStrictlyBelow,
  requireCanonicalPath,
  resolveProspectiveCanonicalPath,
} from './paths.mjs';
import { runCommand, sanitizedEnvironment } from './runner.mjs';
import {
  assertSameSeal,
  assertTrustedSeal,
  sealDirectoryTree,
  sealDistributionTree,
  sealSingleFileDistribution,
  sha256File,
} from './seal.mjs';

export class ToolAdmissionError extends Error {}
const privateToolAttestations = new WeakMap();

function fail(message) {
  throw new ToolAdmissionError(message);
}

const VERSION_ARGUMENTS = Object.freeze({
  git: ['--version'],
  node: ['--version'],
  go: ['version'],
  uv: ['--version'],
  python: ['--version'],
  docker: ['--version'],
  tar: ['--version'],
  queryNode: ['--version'],
  queryGo: ['version'],
});

function normalizedVersion(stdout, stderr) {
  return `${stdout}\n${stderr}`
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)[0];
}

function npmPackageRoot(cliPath, label) {
  const root = requireCanonicalPath(path.dirname(path.dirname(cliPath)), {
    label,
    type: 'directory',
  });
  if (
    path.basename(root) !== 'npm' ||
    requireCanonicalPath(path.join(root, 'bin', 'npm-cli.js'), {
      label: `${label} CLI`,
      type: 'file',
    }) !== cliPath
  ) {
    fail(`${label} does not contain the admitted npm CLI`);
  }
  return root;
}

function pythonDistributionRoot(executable) {
  const root = requireCanonicalPath(path.dirname(path.dirname(executable)), {
    label: 'CPython distribution root',
    type: 'directory',
  });
  if (!isStrictlyBelow(executable, root)) {
    fail('Python executable is not inside its distribution root');
  }
  return root;
}

function binaryDistributionRoot(executable, label) {
  const root = requireCanonicalPath(path.dirname(path.dirname(executable)), {
    label,
    type: 'directory',
  });
  if (!isStrictlyBelow(executable, root)) {
    fail(`${label} does not contain its admitted executable`);
  }
  return root;
}

function closure(root, seal, {
  shape = 'directory',
  sealKind = 'directoryTree',
  sealOptions = Object.freeze({}),
  classification,
  copied = false,
  hermetic = false,
}) {
  return Object.freeze({
    root,
    seal,
    shape,
    sealKind,
    sealOptions,
    classification,
    copied,
    hermetic,
  });
}

function closureIdentity(declaration) {
  return Object.freeze({
    shape: declaration.shape,
    classification: declaration.classification,
    rootDigest: declaration.seal.digest,
    identityDigest: declaration.seal.identityDigest,
    copied: declaration.copied,
    hermetic: declaration.hermetic,
  });
}

async function sealRuntimeClosure(declaration) {
  if (declaration.sealKind === 'directoryTree') {
    return sealDirectoryTree(declaration.root);
  }
  if (declaration.sealKind === 'distributionTree') {
    return sealDistributionTree(declaration.root, declaration.sealOptions);
  }
  if (declaration.sealKind === 'singleFile') {
    return sealSingleFileDistribution(declaration.root);
  }
  fail(`unknown runtime closure seal kind ${declaration.sealKind}`);
}

function closureSpecification(root, {
  shape = 'directory',
  sealKind = 'directoryTree',
  sealOptions = Object.freeze({}),
  classification,
  copied = false,
  hermetic = false,
} = {}) {
  return Object.freeze({
    root,
    shape,
    sealKind,
    sealOptions,
    classification,
    copied,
    hermetic,
  });
}

function runtimeClosureIdentities(runtimeRoots) {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(runtimeRoots).map(([name, declaration]) => [
        name,
        closureIdentity(declaration),
      ]),
    ),
  );
}

export function deriveNestedDirectoryTreeSeal(
  distributionSeal,
  nestedRoot,
  label = 'nested runtime directory',
) {
  if (!distributionSeal || typeof distributionSeal.root !== 'string') {
    fail(`${label} parent distribution seal is invalid`);
  }
  const parentRoot = requireCanonicalPath(distributionSeal.root, {
    label: `${label} parent distribution`,
    type: 'directory',
  });
  const canonicalRoot = requireCanonicalPath(nestedRoot, {
    label,
    type: 'directory',
  });
  if (
    path.resolve(nestedRoot) !== canonicalRoot ||
    !isStrictlyBelow(canonicalRoot, parentRoot)
  ) {
    fail(`${label} is not below its parent distribution`);
  }
  const parentPlan = validateSealDocument(distributionSeal, {
    allowInternalSymlinks: true,
    expectedRoot: parentRoot,
    label: `${label} parent distribution`,
  });
  const prefix = path
    .relative(parentRoot, canonicalRoot)
    .split(path.sep)
    .join('/');
  if (!canonicalSealPath(prefix)) {
    fail(`${label} has a non-canonical parent prefix`);
  }
  const byPath = new Map(
    parentPlan.map((item) => [item.entry.path, item]),
  );
  const prefixParts = prefix.split('/');
  for (let index = 1; index <= prefixParts.length; index += 1) {
    const ancestor = prefixParts.slice(0, index).join('/');
    if (byPath.get(ancestor)?.entry.kind !== 'directory') {
      fail(`${label} root traverses a link or missing parent`);
    }
  }
  const selected = parentPlan.filter(
    (item) =>
      item.entry.path === prefix ||
      item.entry.path.startsWith(`${prefix}/`),
  );
  if (selected.length === 0 || selected[0].entry.path !== prefix) {
    fail(`${label} is missing from its parent distribution seal`);
  }
  const localPath = (entryPath) =>
    entryPath === prefix ? '.' : entryPath.slice(prefix.length + 1);
  const entries = [];
  const identities = [];
  for (const item of selected) {
    if (!['directory', 'file'].includes(item.entry.kind)) {
      fail(`${label} contains a link or shape mismatch`);
    }
    const relative = localPath(item.entry.path);
    entries.push({ ...item.entry, path: relative });
    identities.push({ ...item.identity, path: relative });
  }
  entries.sort((left, right) => left.path.localeCompare(right.path, 'en'));
  identities.sort((left, right) =>
    left.path.localeCompare(right.path, 'en'),
  );
  const directories = new Set(
    entries
      .filter((entry) => entry.kind === 'directory')
      .map((entry) => entry.path),
  );
  if (!directories.has('.')) {
    fail(`${label} does not contain one real root directory`);
  }
  for (const entry of entries) {
    if (entry.path === '.') continue;
    const parent = path.posix.dirname(entry.path);
    if (!directories.has(parent)) {
      fail(`${label} contains an entry without its sealed parent`);
    }
  }
  const contentCanonical = canonicalJson(entries);
  const identityCanonical = canonicalJson(identities);
  // This is a closure-comparison projection, not an admitted copy authority.
  // It deliberately remains outside seal.mjs's private mint provenance and is
  // accepted only by later physical post-gate reseal comparisons.
  const derived = Object.freeze({
    root: canonicalRoot,
    entries: Object.freeze(
      entries.map((entry) => Object.freeze(entry)),
    ),
    digest: canonicalJsonDigest(entries),
    canonical: contentCanonical,
    identities: Object.freeze(
      identities.map((identity) => Object.freeze(identity)),
    ),
    identityDigest: canonicalJsonDigest(identities),
    identityCanonical,
  });
  validateSealDocument(derived, {
    allowInternalSymlinks: false,
    expectedRoot: canonicalRoot,
    label,
  });
  return derived;
}

export async function attestRuntimeClosureSpecifications(specifications) {
  const declarations = Object.entries(specifications);
  const outcomes = await Promise.allSettled(
    declarations.map(async ([name, specification]) => [
      name,
      closure(
        specification.root,
        await sealRuntimeClosure(specification),
        specification,
      ),
    ]),
  );
  const rejectedIndex = outcomes.findIndex(
    (outcome) => outcome.status === 'rejected',
  );
  if (rejectedIndex !== -1) throw outcomes[rejectedIndex].reason;
  const runtimeRoots = Object.fromEntries(
    outcomes.map((outcome) => outcome.value),
  );
  const frozenRoots = Object.freeze(runtimeRoots);
  return Object.freeze({
    runtimeClosures: runtimeClosureIdentities(frozenRoots),
    runtimeRoots: frozenRoots,
  });
}

export async function attestInputRuntimeClosures(input) {
  const toolPath = (name) =>
    requireCanonicalPath(input.tools[name].path, {
      label: `${name} runtime executable`,
      type: 'file',
    });
  const currentNode = toolPath('node');
  const currentNpm = toolPath('npm');
  const currentGo = toolPath('go');
  const python = toolPath('python');
  const uv = toolPath('uv');
  const docker = toolPath('docker');
  const queryNode = toolPath('queryNode');
  const queryNpm = toolPath('queryNpm');
  const queryGo = toolPath('queryGo');
  const queryGofmt = toolPath('queryGofmt');
  const currentNodeRoot = binaryDistributionRoot(
    currentNode,
    'current Node distribution root',
  );
  const queryNodeRoot = binaryDistributionRoot(
    queryNode,
    'historical Query Node distribution root',
  );
  const currentNpmRoot = npmPackageRoot(
    currentNpm,
    'current npm package root',
  );
  const queryNpmRoot = npmPackageRoot(
    queryNpm,
    'historical Query npm package root',
  );
  const currentGoRoot = binaryDistributionRoot(
    currentGo,
    'current Go distribution root',
  );
  const historicalGoRoot = binaryDistributionRoot(
    queryGo,
    'historical Query Go GOROOT',
  );
  const exactHistoricalGoRoot =
    '/opt/homebrew/Cellar/go/1.25.4/libexec';
  if (
    historicalGoRoot !== exactHistoricalGoRoot ||
    queryGo !== path.join(exactHistoricalGoRoot, 'bin', 'go') ||
    queryGofmt !== path.join(exactHistoricalGoRoot, 'bin', 'gofmt')
  ) {
    fail('historical Query Go tools are not inside the exact owner-fixed GOROOT');
  }
  const pythonRoot = pythonDistributionRoot(python);
  const browserRoot = requireCanonicalPath(input.caches.browser, {
    label: 'browser distribution source',
    type: 'directory',
  });
  const browserExecutable = requireCanonicalPath(
    input.browser.executablePath,
    {
      label: 'browser distribution executable',
      type: 'file',
    },
  );
  if (!isStrictlyBelow(browserExecutable, browserRoot)) {
    fail('browser executable is not inside the admitted browser cache');
  }
  const specifications = Object.freeze({
    currentNodeSource: closureSpecification(currentNodeRoot, {
      sealKind: 'distributionTree',
      sealOptions: Object.freeze({ allowInternalSymlinks: true }),
      classification: 'read-only-source',
    }),
    queryNode: closureSpecification(queryNodeRoot, {
      sealKind: 'distributionTree',
      sealOptions: Object.freeze({ allowInternalSymlinks: true }),
      classification: 'owner-fixed-in-place',
    }),
    currentNpmSource: closureSpecification(currentNpmRoot, {
      classification: 'read-only-source',
    }),
    queryNpm: closureSpecification(queryNpmRoot, {
      classification: 'owner-fixed-in-place',
    }),
    currentGoSource: closureSpecification(currentGoRoot, {
      sealKind: 'distributionTree',
      classification: 'read-only-source',
    }),
    historicalGo: closureSpecification(historicalGoRoot, {
      classification: 'owner-fixed-in-place',
    }),
    pythonSource: closureSpecification(pythonRoot, {
      sealKind: 'distributionTree',
      sealOptions: Object.freeze({ allowInternalSymlinks: true }),
      classification: 'read-only-source',
    }),
    uvSource: closureSpecification(uv, {
      shape: 'single-file',
      sealKind: 'singleFile',
      classification: 'read-only-source',
    }),
    dockerSource: closureSpecification(docker, {
      shape: 'single-file',
      sealKind: 'singleFile',
      classification: 'read-only-source',
    }),
    browserSource: closureSpecification(browserRoot, {
      classification: 'read-only-source',
    }),
  });
  const physicalSpecifications = Object.freeze(
    Object.fromEntries(
      Object.entries(specifications).filter(
        ([name]) => !['currentNpmSource', 'queryNpm'].includes(name),
      ),
    ),
  );
  const physical =
    await attestRuntimeClosureSpecifications(physicalSpecifications);
  const derivedSeals = Object.freeze({
    currentNpmSource: deriveNestedDirectoryTreeSeal(
      physical.runtimeRoots.currentNodeSource.seal,
      currentNpmRoot,
      'current npm package root',
    ),
    queryNpm: deriveNestedDirectoryTreeSeal(
      physical.runtimeRoots.queryNode.seal,
      queryNpmRoot,
      'historical Query npm package root',
    ),
  });
  const runtimeRoots = Object.freeze(
    Object.fromEntries(
      Object.entries(specifications).map(([name, specification]) => [
        name,
        physical.runtimeRoots[name] ??
          closure(
            specification.root,
            derivedSeals[name],
            specification,
          ),
      ]),
    ),
  );
  return Object.freeze({
    runtimeClosures: runtimeClosureIdentities(runtimeRoots),
    runtimeRoots,
  });
}

function projectedReadOnlyContentSeal(sourceSeal) {
  const entries = sourceSeal.entries.map((entry) =>
    ['directory', 'file'].includes(entry.kind)
      ? Object.freeze({ ...entry, mode: entry.mode & ~0o222 })
      : entry,
  );
  return Object.freeze({
    entries: Object.freeze(entries),
    digest: canonicalJsonDigest(entries),
    canonical: canonicalJson(entries),
  });
}

function assertNewInodeClosure(
  sourceSeal,
  copiedSeal,
  label,
  expectedContentSeal = sourceSeal,
) {
  if (
    expectedContentSeal.digest !== copiedSeal.digest ||
    expectedContentSeal.canonical !== copiedSeal.canonical
  ) {
    const sourceEntries = new Map(
      expectedContentSeal.entries.map((entry) => [entry.path, entry]),
    );
    const copiedEntries = new Map(
      copiedSeal.entries.map((entry) => [entry.path, entry]),
    );
    const differingPath = [
      ...new Set([...sourceEntries.keys(), ...copiedEntries.keys()]),
    ]
      .sort((left, right) => left.localeCompare(right, 'en'))
      .find(
        (relative) =>
          canonicalJson(sourceEntries.get(relative) ?? null) !==
          canonicalJson(copiedEntries.get(relative) ?? null),
      );
    const sourceEntry = sourceEntries.get(differingPath);
    const copiedEntry = copiedEntries.get(differingPath);
    const differingField =
      sourceEntry === undefined || copiedEntry === undefined
        ? 'entry'
        : [
            ...new Set([
              ...Object.keys(sourceEntry),
              ...Object.keys(copiedEntry),
            ]),
          ]
            .sort()
            .find(
              (field) =>
                canonicalJson(sourceEntry[field] ?? null) !==
                canonicalJson(copiedEntry[field] ?? null),
            ) ?? 'entry';
    fail(
      `${label} copy differs from its expected admitted projection at ${
        differingPath ?? '(unknown entry)'
      } field ${differingField}; admitted=${
        canonicalJson(sourceEntry ?? null).trim()
      }; copied=${canonicalJson(copiedEntry ?? null).trim()}`,
    );
  }
  const sourceIdentities = new Set(
    sourceSeal.identities.map(
      (identity) => `${identity.device}:${identity.inode}`,
    ),
  );
  if (
    copiedSeal.identities.some((identity) =>
      sourceIdentities.has(`${identity.device}:${identity.inode}`))
  ) {
    fail(`${label} copy shares an inode with its admitted source`);
  }
}

const RUNTIME_COPY_WORKERS = 8;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;

function exactObjectFields(value, fields, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} is not one object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (
    actual.length !== expected.length ||
    actual.some((field, index) => field !== expected[index])
  ) {
    fail(`${label} has unexpected fields`);
  }
}

function canonicalSealPath(relative, { root = false } = {}) {
  if (root && relative === '.') return true;
  return (
    typeof relative === 'string' &&
    relative !== '' &&
    relative !== '.' &&
    !path.posix.isAbsolute(relative) &&
    path.posix.normalize(relative) === relative &&
    !relative.split('/').some((part) => part === '' || part === '..') &&
    !/[\0-\u001f\u007f]/u.test(relative)
  );
}

function pathInsideRoot(root, relative, label) {
  if (relative === '.') return root;
  const absolute = path.resolve(root, ...relative.split('/'));
  if (!isStrictlyBelow(absolute, root)) {
    fail(`${label} escapes its root`);
  }
  return absolute;
}

function assertDisjointCopyPaths(source, destination, label) {
  if (
    !path.isAbsolute(destination) ||
    path.resolve(destination) !== destination
  ) {
    fail(`${label} destination is not one normalized absolute path`);
  }
  assertNoSymlinkAncestors(destination, `${label} destination`);
  const canonicalDestination = resolveProspectiveCanonicalPath(
    destination,
    `${label} destination`,
  );
  if (
    canonicalDestination === source ||
    isStrictlyBelow(canonicalDestination, source) ||
    isStrictlyBelow(source, canonicalDestination)
  ) {
    fail(`${label} source and destination overlap`);
  }
  if (canonicalDestination !== destination) {
    fail(`${label} destination is not one prospective canonical path`);
  }
}

function validateSealDocument(
  seal,
  {
    allowInternalSymlinks,
    expectedRoot,
    label,
    rootKind = 'directory',
  },
) {
  exactObjectFields(
    seal,
    [
      'canonical',
      'digest',
      'entries',
      'identities',
      'identityCanonical',
      'identityDigest',
      'root',
    ],
    `${label} seal`,
  );
  if (
    seal.root !== expectedRoot ||
    !Array.isArray(seal.entries) ||
    !Array.isArray(seal.identities) ||
    seal.entries.length === 0 ||
    seal.entries.length !== seal.identities.length ||
    seal.canonical !== canonicalJson(seal.entries) ||
    seal.digest !== canonicalJsonDigest(seal.entries) ||
    seal.identityCanonical !== canonicalJson(seal.identities) ||
    seal.identityDigest !== canonicalJsonDigest(seal.identities)
  ) {
    fail(`${label} seal is not self-consistent`);
  }
  const entries = [];
  const identities = [];
  let previousPath = null;
  for (const [index, entry] of seal.entries.entries()) {
    const entryLabel = `${label} seal entry ${index}`;
    if (!entry || typeof entry.kind !== 'string') {
      fail(`${entryLabel} has an invalid kind`);
    }
    const fields =
      entry.kind === 'directory'
        ? ['kind', 'mode', 'path']
        : entry.kind === 'file'
          ? ['kind', 'mode', 'path', 'sha256', 'size']
          : entry.kind === 'symlink'
            ? ['kind', 'path', 'target']
            : null;
    if (fields === null) fail(`${entryLabel} has an invalid kind`);
    exactObjectFields(entry, fields, entryLabel);
    if (
      !canonicalSealPath(entry.path, { root: index === 0 }) ||
      (previousPath !== null &&
        previousPath.localeCompare(entry.path, 'en') >= 0)
    ) {
      fail(`${entryLabel} path is not canonical and ordered`);
    }
    previousPath = entry.path;
    if (
      ['directory', 'file'].includes(entry.kind) &&
      (!Number.isInteger(entry.mode) ||
        entry.mode < 0 ||
        entry.mode > 0o777)
    ) {
      fail(`${entryLabel} mode is invalid`);
    }
    if (
      entry.kind === 'file' &&
      (!Number.isSafeInteger(entry.size) ||
        entry.size < 0 ||
        !SHA256_PATTERN.test(entry.sha256))
    ) {
      fail(`${entryLabel} file identity is invalid`);
    }
    if (
      entry.kind === 'symlink' &&
      (!allowInternalSymlinks ||
        typeof entry.target !== 'string' ||
        entry.target === '' ||
        entry.target.includes('\0'))
    ) {
      fail(`${entryLabel} symlink is invalid`);
    }
    entries.push(entry);
  }
  previousPath = null;
  for (const [index, identity] of seal.identities.entries()) {
    const identityLabel = `${label} seal identity ${index}`;
    exactObjectFields(
      identity,
      ['device', 'inode', 'kind', 'links', 'path'],
      identityLabel,
    );
    if (
      !canonicalSealPath(identity.path, { root: index === 0 }) ||
      (previousPath !== null &&
        previousPath.localeCompare(identity.path, 'en') >= 0) ||
      !['directory', 'file', 'symlink'].includes(identity.kind) ||
      !Number.isSafeInteger(identity.device) ||
      identity.device < 0 ||
      !Number.isSafeInteger(identity.inode) ||
      identity.inode < 0 ||
      !Number.isSafeInteger(identity.links) ||
      identity.links < 1
    ) {
      fail(`${identityLabel} is invalid or unordered`);
    }
    previousPath = identity.path;
    identities.push(identity);
  }
  if (
    entries[0].path !== '.' ||
    entries[0].kind !== rootKind ||
    identities[0].path !== '.' ||
    identities[0].kind !== rootKind
  ) {
    fail(`${label} seal is missing its exact root entry`);
  }
  const directories = new Set(
    entries
      .filter((entry) => entry.kind === 'directory')
      .map((entry) => entry.path),
  );
  for (const [index, entry] of entries.entries()) {
    const identity = identities[index];
    if (
      identity.path !== entry.path ||
      identity.kind !== entry.kind ||
      (['file', 'symlink'].includes(entry.kind) &&
        identity.links !== 1)
    ) {
      fail(`${label} seal entry and identity shape differs at ${entry.path}`);
    }
    if (entry.path !== '.') {
      const parent = path.posix.dirname(entry.path);
      if (!directories.has(parent)) {
        fail(`${label} seal entry lacks its parent at ${entry.path}`);
      }
    }
    if (entry.kind === 'symlink') {
      const sourcePath = pathInsideRoot(
        expectedRoot,
        entry.path,
        `${label} symlink`,
      );
      const resolved = path.resolve(path.dirname(sourcePath), entry.target);
      if (
        resolved === expectedRoot ||
        !isStrictlyBelow(resolved, expectedRoot)
      ) {
        fail(`${label} seal symlink escapes its root at ${entry.path}`);
      }
    }
  }
  return Object.freeze(
    entries.map((entry, index) =>
      Object.freeze({ entry, identity: identities[index], index }),
    ),
  );
}

function reusableSourceSeal(
  admittedSourceSeal,
  source,
  label,
  options,
) {
  if (admittedSourceSeal === undefined) return null;
  if (admittedSourceSeal?.root !== source) {
    fail(`${label} admitted source seal does not identify its source`);
  }
  assertTrustedSeal(admittedSourceSeal, `${label} admitted source seal`);
  validateSealDocument(admittedSourceSeal, {
    expectedRoot: source,
    label,
    ...options,
  });
  return admittedSourceSeal;
}

function assertSourcePlanUnchanged(plan, source, label) {
  for (const item of plan) {
    const sourcePath = pathInsideRoot(
      source,
      item.entry.path,
      `${label} source entry`,
    );
    let information;
    try {
      information = fs.lstatSync(sourcePath);
    } catch (error) {
      fail(`${label} source entry is unavailable: ${item.entry.path}`, {
        cause: error,
      });
    }
    const actualKind = information.isDirectory()
      ? 'directory'
      : information.isFile()
        ? 'file'
        : information.isSymbolicLink()
          ? 'symlink'
          : 'special';
    if (
      actualKind !== item.entry.kind ||
      information.dev !== item.identity.device ||
      information.ino !== item.identity.inode ||
      information.nlink !== item.identity.links ||
      (['directory', 'file'].includes(actualKind) &&
        (information.mode & 0o777) !== item.entry.mode) ||
      (actualKind === 'file' && information.size !== item.entry.size)
    ) {
      fail(`${label} source changed before copy at ${item.entry.path}`);
    }
    if (actualKind === 'symlink') {
      if (fs.readlinkSync(sourcePath) !== item.entry.target) {
        fail(`${label} source symlink changed before copy at ${item.entry.path}`);
      }
      const canonicalTarget = fs.realpathSync.native(sourcePath);
      if (
        canonicalTarget === source ||
        !isStrictlyBelow(canonicalTarget, source)
      ) {
        fail(`${label} source symlink resolves outside its root`);
      }
    }
  }
}

function distributionCopyPlan({
  source,
  destination,
  sourceSeal,
  allowInternalSymlinks,
}) {
  const admitted = validateSealDocument(sourceSeal, {
    allowInternalSymlinks,
    expectedRoot: source,
    label: 'runtime distribution',
  });
  if (
    !path.isAbsolute(destination) ||
    path.resolve(destination) !== destination
  ) {
    fail('runtime distribution destination is not one normalized absolute path');
  }
  assertNoSymlinkAncestors(destination, 'runtime distribution destination');
  const plan = admitted.map((item) =>
    Object.freeze({
      ...item,
      sourcePath: pathInsideRoot(
        source,
        item.entry.path,
        'runtime distribution source entry',
      ),
      destinationPath: pathInsideRoot(
        destination,
        item.entry.path,
        'runtime distribution destination entry',
      ),
    }),
  );
  assertSourcePlanUnchanged(plan, source, 'runtime distribution');
  return Object.freeze({
    directories: Object.freeze(
      plan
        .filter((item) => item.entry.kind === 'directory')
        .sort((left, right) => {
          const leftDepth =
            left.entry.path === '.' ? 0 : left.entry.path.split('/').length;
          const rightDepth =
            right.entry.path === '.' ? 0 : right.entry.path.split('/').length;
          return leftDepth - rightDepth || left.index - right.index;
        }),
    ),
    files: Object.freeze(
      plan.filter((item) => item.entry.kind === 'file'),
    ),
    symlinks: Object.freeze(
      plan.filter((item) => item.entry.kind === 'symlink'),
    ),
  });
}

async function copyPlannedRuntimeFiles(files) {
  let cursor = 0;
  let stopScheduling = false;
  const failures = [];
  async function worker() {
    while (!stopScheduling) {
      const position = cursor;
      cursor += 1;
      if (position >= files.length) return;
      const item = files[position];
      try {
        throwIfAborted();
        await pipeline(
          fs.createReadStream(item.sourcePath),
          fs.createWriteStream(item.destinationPath, {
            flags: 'wx',
            mode: 0o600,
          }),
        );
        throwIfAborted();
        fs.chmodSync(
          item.destinationPath,
          item.entry.mode & ~0o333,
        );
      } catch (error) {
        failures.push({ error, index: item.index });
        stopScheduling = true;
        throw error;
      }
    }
  }
  const outcomes = await Promise.allSettled(
    Array.from(
      { length: Math.min(RUNTIME_COPY_WORKERS, files.length) },
      worker,
    ),
  );
  if (failures.length > 0) {
    failures.sort((left, right) => left.index - right.index);
    throw failures[0].error;
  }
  const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
  if (rejected) throw rejected.reason;
}

export async function copyRuntimeDistribution({
  sourceRoot,
  destinationRoot,
  allowInternalSymlinks = false,
  admittedSourceSeal,
}) {
  throwIfAborted();
  const source = requireCanonicalPath(sourceRoot, {
    label: 'runtime distribution source',
    type: 'directory',
  });
  assertDisjointCopyPaths(
    source,
    destinationRoot,
    'runtime distribution',
  );
  if (fs.existsSync(destinationRoot)) {
    fail(`runtime distribution destination already exists: ${destinationRoot}`);
  }
  const sourceSeal =
    reusableSourceSeal(
      admittedSourceSeal,
      source,
      'runtime distribution',
      { allowInternalSymlinks },
    ) ??
    (await sealDistributionTree(source, {
      allowInternalSymlinks,
    }));
  const destination = destinationRoot;
  const plan = distributionCopyPlan({
    source,
    destination,
    sourceSeal,
    allowInternalSymlinks,
  });
  throwIfAborted();
  fs.mkdirSync(path.dirname(destination), {
    recursive: true,
    mode: 0o700,
  });
  for (const item of plan.directories) {
    throwIfAborted();
    fs.mkdirSync(item.destinationPath, { mode: 0o700 });
  }
  assertDisjointCopyPaths(
    source,
    destination,
    'runtime distribution',
  );
  for (const item of plan.symlinks) {
    throwIfAborted();
    fs.symlinkSync(item.entry.target, item.destinationPath);
  }
  await copyPlannedRuntimeFiles(plan.files);
  for (const item of [...plan.directories].reverse()) {
    throwIfAborted();
    fs.chmodSync(item.destinationPath, item.entry.mode & ~0o222);
  }
  for (const item of plan.files) {
    if ((item.entry.mode & 0o111) === 0) continue;
    throwIfAborted();
    fs.chmodSync(item.destinationPath, item.entry.mode & ~0o222);
  }
  throwIfAborted();
  const copiedRoot = requireCanonicalPath(destination, {
    label: 'copied runtime distribution',
    type: 'directory',
  });
  const copiedSeal = await sealDistributionTree(copiedRoot, {
    allowInternalSymlinks,
  });
  assertNewInodeClosure(
    sourceSeal,
    copiedSeal,
    'runtime distribution',
    projectedReadOnlyContentSeal(sourceSeal),
  );
  const sourceAfter = await sealDistributionTree(source, {
    allowInternalSymlinks,
  });
  assertSameSeal(
    sourceSeal,
    sourceAfter,
    'runtime distribution source',
  );
  return Object.freeze({ sourceSeal, copiedSeal, root: copiedRoot });
}

export async function copySingleFileRuntime({
  sourcePath,
  destinationPath,
  admittedSourceSeal,
}) {
  throwIfAborted();
  const source = requireCanonicalPath(sourcePath, {
    label: 'single-file runtime source',
    type: 'file',
  });
  assertDisjointCopyPaths(
    source,
    destinationPath,
    'single-file runtime',
  );
  if (fs.existsSync(destinationPath)) {
    fail(`single-file runtime destination already exists: ${destinationPath}`);
  }
  const sourceSeal =
    reusableSourceSeal(
      admittedSourceSeal,
      source,
      'single-file runtime',
      { allowInternalSymlinks: false, rootKind: 'file' },
    ) ??
    (await sealSingleFileDistribution(source));
  validateSealDocument(sourceSeal, {
    allowInternalSymlinks: false,
    expectedRoot: source,
    label: 'single-file runtime',
    rootKind: 'file',
  });
  throwIfAborted();
  fs.mkdirSync(path.dirname(destinationPath), {
    recursive: true,
    mode: 0o700,
  });
  assertDisjointCopyPaths(source, destinationPath, 'single-file runtime');
  await pipeline(
    fs.createReadStream(source),
    fs.createWriteStream(destinationPath, {
      flags: 'wx',
      mode: 0o600,
    }),
  );
  throwIfAborted();
  fs.chmodSync(
    destinationPath,
    (fs.lstatSync(source).mode & 0o777) & ~0o222,
  );
  const copied = requireCanonicalPath(destinationPath, {
    label: 'copied single-file runtime',
    type: 'file',
  });
  const copiedSeal = await sealSingleFileDistribution(copied);
  assertNewInodeClosure(
    sourceSeal,
    copiedSeal,
    'single-file runtime',
    projectedReadOnlyContentSeal(sourceSeal),
  );
  const sourceAfter = await sealSingleFileDistribution(source);
  assertSameSeal(
    sourceSeal,
    sourceAfter,
    'single-file runtime source',
  );
  return Object.freeze({ sourceSeal, copiedSeal, path: copied });
}

export async function copyBrowserDistribution({
  sourceRoot,
  sourceExecutable,
  destinationRoot,
  expectedExecutableDigest,
  admittedSourceSeal,
}) {
  throwIfAborted();
  const root = requireCanonicalPath(sourceRoot, {
    label: 'browser distribution source',
    type: 'directory',
  });
  const executable = requireCanonicalPath(sourceExecutable, {
    label: 'browser distribution executable',
    type: 'file',
  });
  if (!isStrictlyBelow(executable, root)) {
    fail('browser executable is not inside the admitted browser cache');
  }
  assertDisjointCopyPaths(
    root,
    destinationRoot,
    'browser distribution',
  );
  const relativeExecutable = path.relative(root, executable);
  const sourceSeal =
    reusableSourceSeal(
      admittedSourceSeal,
      root,
      'browser distribution',
      { allowInternalSymlinks: false },
    ) ?? (await sealDirectoryTree(root));
  validateSealDocument(sourceSeal, {
    allowInternalSymlinks: false,
    expectedRoot: root,
    label: 'browser distribution',
  });
  throwIfAborted();
  copyCacheTree(root, destinationRoot);
  throwIfAborted();
  const copiedRoot = requireCanonicalPath(destinationRoot, {
    label: 'copied browser distribution',
    type: 'directory',
  });
  const copiedSeal = await sealDirectoryTree(copiedRoot);
  if (
    sourceSeal.digest !== copiedSeal.digest ||
    sourceSeal.canonical !== copiedSeal.canonical ||
    sourceSeal.identityDigest === copiedSeal.identityDigest
  ) {
    fail('browser distribution copy is not an exact new-inode tree');
  }
  const copiedExecutable = requireCanonicalPath(
    path.join(copiedRoot, relativeExecutable),
    {
      label: 'copied browser executable',
      type: 'file',
    },
  );
  const copiedInformation = fs.lstatSync(copiedExecutable);
  if (
    copiedInformation.nlink !== 1 ||
    (copiedInformation.mode & 0o111) === 0 ||
    (await sha256File(copiedExecutable)) !== expectedExecutableDigest
  ) {
    fail('copied browser executable identity is invalid');
  }
  const sourceAfter = await sealDirectoryTree(root);
  assertSameSeal(sourceSeal, sourceAfter, 'browser distribution source');
  return Object.freeze({
    root: copiedRoot,
    executablePath: copiedExecutable,
    executableDigest: expectedExecutableDigest,
    sourceSeal,
    copiedSeal,
  });
}

export async function attestTools({
  input,
  runRoot,
  budgets,
  cacheAttestation,
}) {
  requireInputCacheAttestation(cacheAttestation, input);
  const tools = {};
  const identities = {};
  const evidence = [];
  const pathEntries = new Set(['/usr/bin', '/bin']);
  for (const [name, declaration] of Object.entries(input.tools)) {
    const executable = requireCanonicalPath(declaration.path, {
      label: `${name} executable`,
      type: 'file',
    });
    if ((fs.statSync(executable).mode & 0o111) === 0) {
      fail(`${name} executable is not executable`);
    }
    const digest = await sha256File(executable);
    if (digest !== declaration.sha256) {
      fail(`${name} executable digest differs from the admitted identity`);
    }
    tools[name] = Object.freeze({ ...declaration, path: executable });
    pathEntries.add(path.dirname(executable));
  }
  const environment = sanitizedEnvironment({
    runRoot,
    pathEntries: [...pathEntries],
  });
  for (const name of Object.keys(VERSION_ARGUMENTS)) {
    const result = await runCommand({
      id: `tool-${name}`,
      executable: tools[name].path,
      args: VERSION_ARGUMENTS[name],
      cwd: runRoot,
      environment,
      timeoutMs: 30_000,
      gracefulStopMs: budgets.timeouts.gracefulStopMs,
      runRoot,
    });
    const stdout = fs.readFileSync(path.join(runRoot, result.stdout.path), 'utf8');
    const stderr = fs.readFileSync(path.join(runRoot, result.stderr.path), 'utf8');
    const version = normalizedVersion(stdout, stderr);
    if (version !== input.tools[name].version) {
      fail(`${name} version mismatch: expected ${input.tools[name].version}, received ${version}`);
    }
    identities[name] = version;
    evidence.push(...commandEvidence(result));
  }
  for (const [name, nodeName] of [
    ['npm', 'node'],
    ['queryNpm', 'queryNode'],
  ]) {
    const result = await runCommand({
      id: `tool-${name}`,
      executable: tools[nodeName].path,
      args: [tools[name].path, '--version'],
      cwd: runRoot,
      environment,
      timeoutMs: 30_000,
      gracefulStopMs: budgets.timeouts.gracefulStopMs,
      runRoot,
    });
    const stdout = fs.readFileSync(path.join(runRoot, result.stdout.path), 'utf8');
    const stderr = fs.readFileSync(path.join(runRoot, result.stderr.path), 'utf8');
    const version = normalizedVersion(stdout, stderr);
    if (version !== input.tools[name].version) {
      fail(`${name} version mismatch: expected ${input.tools[name].version}, received ${version}`);
    }
    identities[name] = version;
    evidence.push(...commandEvidence(result));
  }
  identities.queryGofmt = input.tools.queryGofmt.version;
  if (
    identities.node !== 'v24.18.0' ||
    identities.npm !== '11.16.0' ||
    !identities.go.includes('go1.26.5') ||
    !identities.uv.startsWith('uv 0.11.32') ||
    identities.python !== 'Python 3.14.6' ||
    identities.queryNode !== 'v24.16.0' ||
    identities.queryNpm !== '11.13.0' ||
    !identities.queryGo.includes('go1.25.4') ||
    identities.queryGofmt !== 'go1.25.4'
  ) {
    fail('accepted current or historical toolchain versions are not present');
  }
  const dockerSocket = input.tools.docker.endpoint.slice('unix://'.length);
  assertNoSymlinkAncestors(dockerSocket, 'Docker endpoint');
  const socketInformation = fs.lstatSync(dockerSocket);
  if (
    !socketInformation.isSocket() ||
    fs.realpathSync.native(dockerSocket) !== dockerSocket
  ) {
    fail('Docker endpoint is not one canonical Unix socket');
  }
  const browserSourceExecutable = requireCanonicalPath(input.browser.executablePath, {
    label: 'browser executable',
    type: 'file',
  });
  if ((fs.statSync(browserSourceExecutable).mode & 0o111) === 0) {
    fail('browser executable is not executable');
  }
  const browserDigest = await sha256File(browserSourceExecutable);
  if (browserDigest !== input.browser.executableDigest) {
    fail('browser executable digest differs from admitted identity');
  }
  const inputRuntimeClosureAttestation =
    await attestInputRuntimeClosures(input);
  const inputRuntimeRoots =
    inputRuntimeClosureAttestation.runtimeRoots;
  const historicalGoRoot = inputRuntimeRoots.historicalGo.root;
  const historicalGoSeal = inputRuntimeRoots.historicalGo.seal;
  const sourceTools = Object.freeze({ ...tools });
  const currentNodeRoot = inputRuntimeRoots.currentNodeSource.root;
  const currentNpmRoot = inputRuntimeRoots.currentNpmSource.root;
  const currentGoRoot = inputRuntimeRoots.currentGoSource.root;
  const pythonRoot = inputRuntimeRoots.pythonSource.root;
  const runtimeCopyRoot = path.join(runRoot, 'runtime', 'tools');
  const copyOutcomes = await Promise.allSettled([
    copyRuntimeDistribution({
      sourceRoot: currentNodeRoot,
      destinationRoot: path.join(runtimeCopyRoot, 'current-node'),
      allowInternalSymlinks: true,
      admittedSourceSeal: inputRuntimeRoots.currentNodeSource.seal,
    }),
    copyRuntimeDistribution({
      sourceRoot: currentGoRoot,
      destinationRoot: path.join(runtimeCopyRoot, 'current-go'),
      admittedSourceSeal: inputRuntimeRoots.currentGoSource.seal,
    }),
    copyRuntimeDistribution({
      sourceRoot: pythonRoot,
      destinationRoot: path.join(runtimeCopyRoot, 'python'),
      allowInternalSymlinks: true,
      admittedSourceSeal: inputRuntimeRoots.pythonSource.seal,
    }),
    copySingleFileRuntime({
      sourcePath: sourceTools.uv.path,
      destinationPath: path.join(runtimeCopyRoot, 'uv', 'uv'),
      admittedSourceSeal: inputRuntimeRoots.uvSource.seal,
    }),
    copySingleFileRuntime({
      sourcePath: sourceTools.docker.path,
      destinationPath: path.join(runtimeCopyRoot, 'docker', 'docker'),
      admittedSourceSeal: inputRuntimeRoots.dockerSource.seal,
    }),
  ]);
  const rejectedCopy = copyOutcomes.find(
    (outcome) => outcome.status === 'rejected',
  );
  if (rejectedCopy) throw rejectedCopy.reason;
  const [
    currentNodeCopy,
    currentGoCopy,
    pythonCopy,
    uvCopy,
    dockerCopy,
  ] = copyOutcomes.map((outcome) => outcome.value);
  for (const [label, admitted, copied] of [
    [
      'current Node source',
      inputRuntimeRoots.currentNodeSource.seal,
      currentNodeCopy.sourceSeal,
    ],
    [
      'current Go source',
      inputRuntimeRoots.currentGoSource.seal,
      currentGoCopy.sourceSeal,
    ],
    [
      'CPython source',
      inputRuntimeRoots.pythonSource.seal,
      pythonCopy.sourceSeal,
    ],
    ['uv source', inputRuntimeRoots.uvSource.seal, uvCopy.sourceSeal],
    [
      'Docker source',
      inputRuntimeRoots.dockerSource.seal,
      dockerCopy.sourceSeal,
    ],
  ]) {
    assertSameSeal(admitted, copied, label);
  }
  const copiedExecutable = (sourceRoot, copiedRoot, sourceExecutable, label) =>
    requireCanonicalPath(
      path.join(copiedRoot, path.relative(sourceRoot, sourceExecutable)),
      { label, type: 'file', below: copiedRoot },
    );
  tools.node = Object.freeze({
    ...sourceTools.node,
    path: copiedExecutable(
      currentNodeRoot,
      currentNodeCopy.root,
      sourceTools.node.path,
      'copied current Node executable',
    ),
  });
  tools.npm = Object.freeze({
    ...sourceTools.npm,
    path: copiedExecutable(
      currentNodeRoot,
      currentNodeCopy.root,
      sourceTools.npm.path,
      'copied current npm CLI',
    ),
  });
  tools.go = Object.freeze({
    ...sourceTools.go,
    path: copiedExecutable(
      currentGoRoot,
      currentGoCopy.root,
      sourceTools.go.path,
      'copied current Go executable',
    ),
  });
  tools.python = Object.freeze({
    ...sourceTools.python,
    path: copiedExecutable(
      pythonRoot,
      pythonCopy.root,
      sourceTools.python.path,
      'copied CPython executable',
    ),
  });
  tools.uv = Object.freeze({ ...sourceTools.uv, path: uvCopy.path });
  tools.docker = Object.freeze({
    ...sourceTools.docker,
    path: dockerCopy.path,
  });
  const currentNpmCopyRoot = npmPackageRoot(
    tools.npm.path,
    'copied current npm package root',
  );
  const currentNpmSourceSeal = inputRuntimeRoots.currentNpmSource.seal;
  const currentNpmCopySeal = await sealDirectoryTree(currentNpmCopyRoot);
  assertNewInodeClosure(
    currentNpmSourceSeal,
    currentNpmCopySeal,
    'current npm package',
    projectedReadOnlyContentSeal(currentNpmSourceSeal),
  );
  const runtimeRootsDraft = {
    currentNodeSource: inputRuntimeRoots.currentNodeSource,
    currentNode: closure(
      currentNodeCopy.root,
      currentNodeCopy.copiedSeal,
      {
        sealKind: 'distributionTree',
        sealOptions: Object.freeze({ allowInternalSymlinks: true }),
        classification: 'run-owned-copy',
        copied: true,
        hermetic: true,
      },
    ),
    queryNode: inputRuntimeRoots.queryNode,
    currentNpmSource: inputRuntimeRoots.currentNpmSource,
    currentNpm: closure(
      currentNpmCopyRoot,
      currentNpmCopySeal,
      {
        classification: 'run-owned-copy',
        copied: true,
        hermetic: true,
      },
    ),
    queryNpm: inputRuntimeRoots.queryNpm,
    currentGoSource: inputRuntimeRoots.currentGoSource,
    currentGo: closure(
      currentGoCopy.root,
      currentGoCopy.copiedSeal,
      {
        sealKind: 'distributionTree',
        classification: 'run-owned-copy',
        copied: true,
        hermetic: true,
      },
    ),
    historicalGo: inputRuntimeRoots.historicalGo,
    pythonSource: inputRuntimeRoots.pythonSource,
    python: closure(
      pythonCopy.root,
      pythonCopy.copiedSeal,
      {
        sealKind: 'distributionTree',
        sealOptions: Object.freeze({ allowInternalSymlinks: true }),
        classification: 'run-owned-copy',
        copied: true,
        hermetic: true,
      },
    ),
    uvSource: inputRuntimeRoots.uvSource,
    uv: closure(
      uvCopy.path,
      uvCopy.copiedSeal,
      {
        shape: 'single-file',
        sealKind: 'singleFile',
        classification: 'run-owned-copy',
        copied: true,
        hermetic: true,
      },
    ),
    dockerSource: inputRuntimeRoots.dockerSource,
    docker: closure(
      dockerCopy.path,
      dockerCopy.copiedSeal,
      {
        shape: 'single-file',
        sealKind: 'singleFile',
        classification: 'run-owned-copy',
        copied: true,
        hermetic: true,
      },
    ),
  };
  const cacheRoots = {};
  for (const [name, candidate] of Object.entries(input.caches)) {
    if (name === 'digest') continue;
    cacheRoots[name] = requireCanonicalPath(candidate, {
      label: `${name} cache`,
      type: name === 'manifest' ? 'file' : 'directory',
    });
  }
  const copiedBrowser = await copyBrowserDistribution({
    sourceRoot: cacheRoots.browser,
    sourceExecutable: browserSourceExecutable,
    destinationRoot: path.join(runRoot, 'runtime', 'browser'),
    expectedExecutableDigest: browserDigest,
    admittedSourceSeal: inputRuntimeRoots.browserSource.seal,
  });
  runtimeRootsDraft.browserSource = inputRuntimeRoots.browserSource;
  runtimeRootsDraft.browserCopy = closure(
    copiedBrowser.root,
    copiedBrowser.copiedSeal,
    {
      classification: 'run-owned-copy',
      copied: true,
      hermetic: true,
    },
  );
  assertSameSeal(
    inputRuntimeRoots.browserSource.seal,
    copiedBrowser.sourceSeal,
    'browser distribution source',
  );
  const runtimeRoots = Object.freeze(runtimeRootsDraft);
  const runtimeClosures = runtimeClosureIdentities(runtimeRoots);
  const machine = Object.freeze({
    profileId: 'darwin-arm64-development-v1',
    os: process.platform,
    architecture: process.arch,
    release: os.release(),
    logicalCpuCount: os.cpus().length,
    memoryBytes: os.totalmem(),
    dockerVersion: identities.docker,
  });
  if (machine.os !== 'darwin' || machine.architecture !== 'arm64') {
    fail('host does not match the reviewed darwin/arm64 development profile');
  }
  const identityRecords = Object.freeze(
    Object.fromEntries(
      Object.keys(identities).map((name) => [
        name,
        Object.freeze({
          version: identities[name],
          sha256: tools[name].sha256,
        }),
      ]),
    ),
  );
  const attestation = Object.freeze({
    tools: Object.freeze(tools),
    identities: identityRecords,
    cacheRoots: Object.freeze(cacheRoots),
    browser: Object.freeze({
      name: input.browser.name,
      version: input.browser.version,
      sourceExecutablePath: browserSourceExecutable,
      executablePath: copiedBrowser.executablePath,
      executableDigest: browserDigest,
      sourceRoot: cacheRoots.browser,
      root: copiedBrowser.root,
      rootDigest: copiedBrowser.copiedSeal.digest,
    }),
    runtimeRoots,
    runtimeClosures,
    historicalGoRoot,
    historicalGoSeal,
    machine,
    evidence: Object.freeze(evidence),
  });
  privateToolAttestations.set(attestation, Object.freeze({
    browser: Object.freeze({
      sourcePath: browserSourceExecutable,
      sourceRoot: cacheRoots.browser,
      sourceSeal: copiedBrowser.sourceSeal,
      copiedPath: copiedBrowser.executablePath,
      copiedRoot: copiedBrowser.root,
      copiedSeal: copiedBrowser.copiedSeal,
      sha256: browserDigest,
    }),
    dockerSocket: Object.freeze({
      path: dockerSocket,
      device: socketInformation.dev,
      inode: socketInformation.ino,
      mode: socketInformation.mode,
    }),
    historicalGoRoot,
    historicalGoSeal,
    runtimeRoots,
    tools: Object.freeze(
      Object.fromEntries(
        Object.entries(tools).map(([name, declaration]) => [
          name,
          Object.freeze({
            path: declaration.path,
            sha256: declaration.sha256,
          }),
        ]),
      ),
    ),
  }));
  return attestation;
}

export async function verifyToolSeal(attestation) {
  const sealed = privateToolAttestations.get(attestation);
  if (!sealed) fail('tool attestation was not issued by this module');
  for (const [name, declaration] of Object.entries(sealed.tools)) {
    const canonical = requireCanonicalPath(declaration.path, {
      label: `${name} resealed executable`,
      type: 'file',
    });
    if (
      canonical !== declaration.path ||
      (await sha256File(canonical)) !== declaration.sha256
    ) {
      fail(`${name} executable changed during acceptance`);
    }
  }
  if (
    (await sha256File(sealed.browser.sourcePath)) !== sealed.browser.sha256 ||
    (await sha256File(sealed.browser.copiedPath)) !== sealed.browser.sha256
  ) {
    fail('browser executable changed during acceptance');
  }
  await verifyRuntimeClosures(attestation);
  const socket = fs.lstatSync(sealed.dockerSocket.path);
  if (
    !socket.isSocket() ||
    socket.dev !== sealed.dockerSocket.device ||
    socket.ino !== sealed.dockerSocket.inode ||
    socket.mode !== sealed.dockerSocket.mode
  ) {
    fail('Docker endpoint identity changed during acceptance');
  }
  return attestation;
}

export async function verifyRuntimeClosures(attestation, names) {
  const sealed = privateToolAttestations.get(attestation);
  if (!sealed) fail('tool attestation was not issued by this module');
  const selected = names === undefined
    ? Object.keys(sealed.runtimeRoots)
    : names;
  if (!Array.isArray(selected) || selected.length === 0) {
    fail('runtime closure reseal requires at least one named closure');
  }
  if (new Set(selected).size !== selected.length) {
    fail('runtime closure reseal names must be unique');
  }
  for (const name of selected) {
    const declaration = sealed.runtimeRoots[name];
    if (!declaration) fail(`unknown runtime closure ${name}`);
    const current = await sealRuntimeClosure(declaration);
    assertSameSeal(
      declaration.seal,
      current,
      `${name} runtime root`,
    );
  }
  return attestation;
}
