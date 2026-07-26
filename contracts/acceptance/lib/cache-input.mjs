import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs';
import path from 'node:path';

import { ACCEPTANCE_LOCK_SHA256 } from './package-policy.mjs';
import { requireCanonicalPath } from './paths.mjs';
import { readJsonStrict } from './strict-json.mjs';

const TOP_LEVEL_FIELDS = Object.freeze([
  'caches',
  'freezePolicy',
  'kind',
  'limitations',
  'oracle',
  'productCandidate',
  'provisioning',
  'root',
  'schemaVersion',
  'supplemental',
  'validation',
]);
const CACHE_NAMES = Object.freeze(['npm', 'goModule', 'uv', 'browser']);
const INVENTORY_FILES = Object.freeze({
  npm: 'npm.json',
  goModule: 'go-module.json',
  uv: 'uv.json',
  browser: 'browser.json',
  historicalGo: 'go-historical.json',
});
const privateAttestations = new WeakMap();
const FIXED_HOST_TOOLS = Object.freeze({
  git: Object.freeze({
    requestedPaths: Object.freeze(['/usr/bin/git']),
    version: 'git version 2.39.5 (Apple Git-154)',
    sha256: '7588ceab299393618d6f8861502ac0588d1594025f301d9a61a898215b5571d3',
  }),
  docker: Object.freeze({
    requestedPaths: Object.freeze([
      '/opt/homebrew/bin/docker',
      '/opt/homebrew/Cellar/docker/29.5.3/bin/docker',
    ]),
    version: 'Docker version 29.5.3, build d1c06ef6b4',
    sha256: 'dcba162cc55a94c9e6e308e9ab9b5969c46a916e86ec6acff38cdf037d183812',
  }),
  tar: Object.freeze({
    requestedPaths: Object.freeze(['/usr/bin/tar', '/usr/bin/bsdtar']),
    version: 'bsdtar 3.5.3 - libarchive 3.7.4 zlib/1.2.12 liblzma/5.4.3 bz2lib/1.0.8',
    sha256: 'aa870c0534e2317cc62d228127e7af58582827f8380e16cb89c9454c1bc870d6',
  }),
});

export class CacheAdmissionError extends Error {}

function fail(message) {
  throw new CacheAdmissionError(message);
}

function exactObject(value, fields, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (
    actual.length !== expected.length ||
    actual.some((field, index) => field !== expected[index])
  ) {
    fail(`${label} has unexpected fields`);
  }
  return value;
}

function digestText(value, label, { prefix = true } = {}) {
  const expression = prefix ? /^sha256:[0-9a-f]{64}$/u : /^[0-9a-f]{64}$/u;
  if (typeof value !== 'string' || !expression.test(value)) {
    fail(`${label} is not one SHA-256 identity`);
  }
  return value;
}

function integer(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(`${label} is not a non-negative safe integer`);
  }
  return value;
}

function text(value, label, { exact, pattern, max = 4096 } = {}) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > max ||
    value.includes('\0') ||
    (exact !== undefined && value !== exact) ||
    (pattern && !pattern.test(value))
  ) {
    fail(`${label} is invalid`);
  }
  return value;
}

async function fileSha256(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

function sortedDirectoryEntries(directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, 'en'));
}

function collectFrozenTree(root) {
  const files = [];
  const directories = [];
  let directoryCount = 0;
  function visit(directory, prefix) {
    const directoryInformation = fs.lstatSync(directory, { bigint: true });
    if (
      directoryInformation.isSymbolicLink() ||
      !directoryInformation.isDirectory() ||
      Number(directoryInformation.mode & 0o777n) !== 0o555
    ) {
      fail(`frozen cache directory is not one 0555 real directory: ${prefix || '.'}`);
    }
    directoryCount += 1;
    directories.push(prefix || '.');
    for (const entry of sortedDirectoryEntries(directory)) {
      const absolute = path.join(directory, entry.name);
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const information = fs.lstatSync(absolute, { bigint: true });
      if (information.isSymbolicLink()) fail(`frozen cache contains symlink ${relative}`);
      if (information.isDirectory()) {
        visit(absolute, relative);
      } else if (information.isFile()) {
        const mode = Number(information.mode & 0o777n);
        if (
          information.nlink !== 1n ||
          (mode !== 0o444 && mode !== 0o555)
        ) {
          fail(`frozen cache file is linked or has an unsealed mode: ${relative}`);
        }
        files.push(Object.freeze({
          executable: mode === 0o555,
          path: relative,
          size: Number(information.size),
        }));
      } else {
        fail(`frozen cache contains special file ${relative}`);
      }
    }
  }
  visit(root, '');
  directories.sort((left, right) => left.localeCompare(right, 'en'));
  files.sort((left, right) => left.path.localeCompare(right.path, 'en'));
  return Object.freeze({
    directories: Object.freeze(directories),
    directoryCount,
    files: Object.freeze(files),
  });
}

async function hashFiles(root, files, concurrency = 24) {
  const result = new Map();
  let cursor = 0;
  async function worker() {
    while (cursor < files.length) {
      const current = files[cursor];
      cursor += 1;
      result.set(
        current.path,
        await fileSha256(path.join(root, ...current.path.split('/'))),
      );
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
  return result;
}

async function frozenTreeSeal(root, frozen = collectFrozenTree(root)) {
  const hashes = await hashFiles(root, frozen.files);
  const document = {
    directories: frozen.directories,
    files: frozen.files.map((entry) => ({
      executable: entry.executable,
      path: entry.path,
      sha256: hashes.get(entry.path),
      size: entry.size,
    })),
  };
  return Object.freeze({
    digest: `sha256:${createHash('sha256')
      .update(canonicalWithoutNewline(document))
      .digest('hex')}`,
    document: Object.freeze(document),
    hashes,
  });
}

export async function sealFrozenCacheTree(root) {
  const canonical = requireCanonicalPath(root, {
    label: 'frozen cache tree',
    type: 'directory',
  });
  return frozenTreeSeal(canonical);
}

function canonicalWithoutNewline(value) {
  function serialize(input) {
    if (
      input === null ||
      typeof input === 'boolean' ||
      typeof input === 'string'
    ) {
      return JSON.stringify(input);
    }
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) fail('cache manifest contains a non-finite number');
      return JSON.stringify(input);
    }
    if (Array.isArray(input)) return `[${input.map(serialize).join(',')}]`;
    if (input && typeof input === 'object') {
      return `{${Object.keys(input)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${serialize(input[key])}`)
        .join(',')}}`;
    }
    fail(`cache manifest contains unsupported ${typeof input}`);
  }
  return serialize(value);
}

function validateReference(root, reference, label, hashes, frozenFiles) {
  exactObject(reference, ['byteCount', 'path', 'sha256'], label);
  text(reference.path, `${label}.path`, {
    pattern: /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/u,
  });
  integer(reference.byteCount, `${label}.byteCount`);
  digestText(reference.sha256, `${label}.sha256`, { prefix: false });
  const file = frozenFiles.get(reference.path);
  if (
    !file ||
    file.size !== reference.byteCount ||
    hashes.get(reference.path) !== reference.sha256
  ) {
    fail(`${label} does not identify exact frozen bytes`);
  }
  return path.join(root, ...reference.path.split('/'));
}

function inventoryDocument(value, expectedName, label) {
  const inventory = exactObject(value, ['entries', 'name', 'schemaVersion'], label);
  if (inventory.schemaVersion !== 1 || inventory.name !== expectedName) {
    fail(`${label} identity is invalid`);
  }
  if (!Array.isArray(inventory.entries)) fail(`${label}.entries must be an array`);
  let previous = null;
  for (const [index, raw] of inventory.entries.entries()) {
    const entry = exactObject(
      raw,
      ['executable', 'path', 'sha256', 'size'],
      `${label}.entries[${index}]`,
    );
    if (
      typeof entry.executable !== 'boolean' ||
      !Number.isSafeInteger(entry.size) ||
      entry.size < 0 ||
      !/^[0-9a-f]{64}$/u.test(entry.sha256) ||
      !/^[A-Za-z0-9._@!+-]+(?:\/[A-Za-z0-9._@!+-]+)*$/u.test(entry.path) ||
      (previous !== null &&
        previous.localeCompare(entry.path, 'en') >= 0)
    ) {
      fail(`${label}.entries[${index}] is invalid or unsorted`);
    }
    previous = entry.path;
  }
  return inventory;
}

function manifestCacheRoot(input, manifest, name) {
  const declaration = manifest.caches[name];
  const supplied = input.caches[name];
  if (declaration.root !== supplied) {
    fail(`${name} cache root differs from the admitted input`);
  }
  return requireCanonicalPath(supplied, {
    label: `${name} frozen cache`,
    type: 'directory',
    below: input.caches.root,
  });
}

async function validateInventory({
  root,
  inventoryPath,
  expectedName,
  declaration,
}) {
  const inventorySource = fs.readFileSync(inventoryPath, 'utf8');
  const inventory = inventoryDocument(
    readJsonStrict(inventoryPath),
    expectedName,
    `${expectedName} inventory`,
  );
  if (inventorySource !== canonicalWithoutNewline(inventory)) {
    fail(`${expectedName} inventory is not canonical JSON without trailing bytes`);
  }
  const inventorySha256 = await fileSha256(inventoryPath);
  const frozen = collectFrozenTree(root);
  if (
    inventory.entries.length !== frozen.files.length ||
    declaration.fileCount !== inventory.entries.length ||
    declaration.inventorySha256 !== inventorySha256 ||
    declaration.cacheDigest !== `sha256:${inventorySha256}`
  ) {
    fail(`${expectedName} inventory count or identity mismatch`);
  }
  const hashes = await hashFiles(root, frozen.files);
  let byteCount = 0;
  let executableFileCount = 0;
  for (const [index, expected] of inventory.entries.entries()) {
    const actual = frozen.files[index];
    if (
      actual.path !== expected.path ||
      actual.size !== expected.size ||
      actual.executable !== expected.executable ||
      hashes.get(actual.path) !== expected.sha256
    ) {
      fail(`${expectedName} frozen cache differs at ${expected.path}`);
    }
    byteCount += actual.size;
    if (actual.executable) executableFileCount += 1;
  }
  if (
    declaration.byteCount !== byteCount ||
    declaration.executableFileCount !== executableFileCount ||
    declaration.noHardlinks !== true ||
    declaration.noSymlinks !== true ||
    (declaration.newInodesFromSource !== true &&
      !(expectedName === 'npm' && declaration.isolatedNewFiles === true))
  ) {
    fail(`${expectedName} frozen cache summary is inconsistent`);
  }
  return Object.freeze({
    byteCount,
    digest: declaration.cacheDigest,
    executableFileCount,
    fileCount: inventory.entries.length,
    inventoryPath,
    root,
  });
}

function validateManifestCore(input, manifest, root, frozenFiles, hashes) {
  exactObject(manifest, TOP_LEVEL_FIELDS, 'cache manifest');
  if (
    manifest.schemaVersion !== 1 ||
    manifest.kind !== 'bangumi-staff-stats-development-acceptance-input-cache-v1' ||
    manifest.root !== root
  ) {
    fail('cache manifest identity or root is invalid');
  }
  const preparation = exactObject(
    manifest.productCandidate,
    ['revision'],
    'cache manifest productCandidate',
  );
  text(preparation.revision, 'cache manifest productCandidate.revision', {
    pattern: /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u,
  });
  if (
    manifest.oracle?.revision !== input.oracle.revision ||
    manifest.oracle?.npmCache !== input.caches.npm
  ) {
    fail('cache manifest oracle identity differs from acceptance input');
  }
  exactObject(manifest.caches, CACHE_NAMES, 'cache manifest.caches');
  exactObject(
    manifest.freezePolicy,
    [
      'consumerPolicy',
      'directoryMode',
      'executableRegularFileMode',
      'hardlinksAllowed',
      'manifestGeneratedBeforeFreeze',
      'regularFileMode',
      'state',
      'symlinksAllowed',
    ],
    'cache manifest.freezePolicy',
  );
  if (
    manifest.freezePolicy.consumerPolicy !==
      'copy sealed source cache into a run-owned writable cache before package-manager use' ||
    manifest.freezePolicy.directoryMode !== '0555' ||
    manifest.freezePolicy.regularFileMode !== '0444' ||
    manifest.freezePolicy.executableRegularFileMode !== '0555' ||
    manifest.freezePolicy.state !== 'sealed-read-only' ||
    manifest.freezePolicy.hardlinksAllowed !== false ||
    manifest.freezePolicy.symlinksAllowed !== false ||
    manifest.freezePolicy.manifestGeneratedBeforeFreeze !== true
  ) {
    fail('cache manifest freeze policy is not exact');
  }
  if (
    !Array.isArray(manifest.limitations) ||
    manifest.limitations.length !== 3 ||
    manifest.limitations.some((entry) => typeof entry !== 'string' || entry.length === 0)
  ) {
    fail('cache manifest limitations are not the reviewed bounded list');
  }
  exactObject(
    manifest.validation,
    [
      'browserExecutableDigestMatchesInventory',
      'goCompileExitCode',
      'goFreshGoproxyOffExitCode',
      'npmCacheVerifyExitCode',
      'npmExactLockUrlIndexClosure',
      'npmForeignOptionalClosureIncluded',
      'uvFreshCopiedCacheFrozenOfflineSyncExitCode',
      'uvImportProbeExitCode',
    ],
    'cache manifest.validation',
  );
  if (
    manifest.validation.browserExecutableDigestMatchesInventory !== true ||
    manifest.validation.goCompileExitCode !== 0 ||
    manifest.validation.goFreshGoproxyOffExitCode !== 0 ||
    manifest.validation.npmCacheVerifyExitCode !== 0 ||
    manifest.validation.npmExactLockUrlIndexClosure !== true ||
    manifest.validation.npmForeignOptionalClosureIncluded !== true ||
    manifest.validation.uvFreshCopiedCacheFrozenOfflineSyncExitCode !== 0 ||
    manifest.validation.uvImportProbeExitCode !== 0
  ) {
    fail('cache manifest validation record is not green');
  }
  const supplemental = exactObject(
    manifest.supplemental,
    ['dockerEndpoint', 'historicalGo', 'lockClosure', 'toolIdentities'],
    'cache manifest.supplemental',
  );
  if (supplemental.dockerEndpoint?.endpoint !== input.tools.docker.endpoint) {
    fail('cache manifest Docker endpoint differs from admitted input');
  }
  validateReference(
    root,
    supplemental.toolIdentities,
    'cache manifest tool identities',
    hashes,
    frozenFiles,
  );
  validateReference(
    root,
    supplemental.lockClosure.inventory,
    'cache manifest lock inventory',
    hashes,
    frozenFiles,
  );
  if (
    !Array.isArray(supplemental.lockClosure.locks) ||
    supplemental.lockClosure.locks.length !== 13
  ) {
    fail('cache manifest lock closure must contain exactly 13 locks');
  }
  for (const [index, declaration] of supplemental.lockClosure.locks.entries()) {
    exactObject(
      declaration,
      ['packageEntries', 'path', 'resolvedIntegrityEntries', 'sha256'],
      `cache manifest lock ${index}`,
    );
    integer(declaration.packageEntries, `cache manifest lock ${index}.packageEntries`);
    integer(
      declaration.resolvedIntegrityEntries,
      `cache manifest lock ${index}.resolvedIntegrityEntries`,
    );
    text(declaration.path, `cache manifest lock ${index}.path`, {
      pattern: /^locks\/(?:harness|oracle|product)\/[A-Za-z0-9._/-]+\/package-lock\.json$/u,
    });
    digestText(declaration.sha256, `cache manifest lock ${index}.sha256`, {
      prefix: false,
    });
    const frozen = frozenFiles.get(declaration.path);
    if (!frozen || hashes.get(declaration.path) !== declaration.sha256) {
      fail(`cache manifest lock ${index} bytes differ`);
    }
  }
  return supplemental;
}

function sealedExecutable(value, label, { version = true } = {}) {
  const fields = ['requestedPath', 'canonicalPath', 'sha256', ...(version ? ['version'] : [])];
  const declaration = exactObject(value, fields, label);
  text(declaration.requestedPath, `${label}.requestedPath`, { pattern: /^\/[^\0]+$/u });
  text(declaration.canonicalPath, `${label}.canonicalPath`, { pattern: /^\/[^\0]+$/u });
  digestText(declaration.sha256, `${label}.sha256`, { prefix: false });
  if (version) text(declaration.version, `${label}.version`, { max: 128 });
  return declaration;
}

function matchSealedTool(input, toolName, sealed, label, { version = true } = {}) {
  const declaration = input.tools[toolName];
  if (
    ![sealed.requestedPath, sealed.canonicalPath].includes(declaration.path) ||
    declaration.sha256 !== `sha256:${sealed.sha256}` ||
    (version && declaration.version !== sealed.version)
  ) {
    fail(`${label} differs from the sealed tool identity`);
  }
}

function validateSealedToolIdentities(input, document) {
  const identity = exactObject(
    document,
    ['browser', 'current', 'docker', 'historicalQuery', 'schemaVersion'],
    'sealed tool identities',
  );
  if (identity.schemaVersion !== 1) fail('sealed tool identities schemaVersion is invalid');
  const current = exactObject(
    identity.current,
    ['go', 'node', 'npm', 'python', 'uv'],
    'sealed tool identities.current',
  );
  for (const name of ['go', 'node', 'npm', 'python', 'uv']) {
    const sealed = sealedExecutable(current[name], `sealed current ${name}`);
    matchSealedTool(input, name, sealed, `current ${name}`);
  }
  const historical = exactObject(
    identity.historicalQuery,
    ['go', 'gofmt', 'node', 'npm'],
    'sealed tool identities.historicalQuery',
  );
  for (const [name, toolName, includeVersion] of [
    ['node', 'queryNode'],
    ['npm', 'queryNpm'],
    ['go', 'queryGo'],
    ['gofmt', 'queryGofmt', false],
  ]) {
    const sealed = sealedExecutable(
      historical[name],
      `sealed historical ${name}`,
      { version: includeVersion !== false },
    );
    matchSealedTool(
      input,
      toolName,
      sealed,
      `historical ${name}`,
      { version: includeVersion !== false },
    );
  }
  if (input.tools.queryGofmt.version !== 'go1.25.4') {
    fail('historical gofmt version label is not the fixed Go 1.25.4 identity');
  }
  for (const [name, expected] of Object.entries(FIXED_HOST_TOOLS)) {
    const declaration = input.tools[name];
    if (
      !expected.requestedPaths.includes(declaration.path) ||
      declaration.version !== expected.version ||
      declaration.sha256 !== `sha256:${expected.sha256}`
    ) {
      fail(`${name} differs from the fixed development-profile tool identity`);
    }
  }
  return Object.freeze(identity);
}

export async function attestInputCaches(input) {
  const root = requireCanonicalPath(input.caches.root, {
    label: 'frozen cache root',
    type: 'directory',
  });
  const manifestPath = requireCanonicalPath(input.caches.manifest, {
    label: 'frozen cache manifest',
    type: 'file',
    below: root,
  });
  if (manifestPath !== path.join(root, 'manifest.json')) {
    fail('cache manifest must be the exact root manifest.json');
  }
  const manifestSource = fs.readFileSync(manifestPath, 'utf8');
  const manifestDigest = `sha256:${await fileSha256(manifestPath)}`;
  if (manifestDigest !== input.caches.digest) {
    fail('cache manifest digest differs from the admitted identity');
  }
  const manifest = readJsonStrict(manifestPath);
  if (manifestSource !== canonicalWithoutNewline(manifest)) {
    fail('cache manifest is not canonical JSON without trailing bytes');
  }
  const rootFrozen = collectFrozenTree(root);
  const rootSeal = await frozenTreeSeal(root, rootFrozen);
  const rootHashes = rootSeal.hashes;
  const frozenFiles = new Map(rootFrozen.files.map((entry) => [entry.path, entry]));
  const supplemental = validateManifestCore(
    input,
    manifest,
    root,
    frozenFiles,
    rootHashes,
  );
  const sealedToolIdentities = validateSealedToolIdentities(
    input,
    readJsonStrict(path.join(root, ...supplemental.toolIdentities.path.split('/'))),
  );
  const harnessLock = supplemental.lockClosure.locks.find(
    (declaration) =>
      declaration.path === 'locks/harness/contracts/acceptance/package-lock.json',
  );
  if (
    !harnessLock ||
    harnessLock.sha256 !== ACCEPTANCE_LOCK_SHA256 ||
    (await fileSha256(
      requireCanonicalPath(
        path.join(input.harness.root, 'contracts', 'acceptance', 'package-lock.json'),
        {
          label: 'live acceptance package lock',
          type: 'file',
          below: input.harness.root,
        },
      ),
    )) !== ACCEPTANCE_LOCK_SHA256
  ) {
    fail('sealed harness package lock differs from the reviewed live lock identity');
  }
  const summaries = {};
  for (const name of CACHE_NAMES) {
    const cacheRoot = manifestCacheRoot(input, manifest, name);
    const inventoryPath = requireCanonicalPath(
      manifest.caches[name].inventoryPath,
      {
        label: `${name} inventory`,
        type: 'file',
        below: root,
      },
    );
    if (
      inventoryPath !==
      path.join(root, 'inventories', INVENTORY_FILES[name])
    ) {
      fail(`${name} inventory path is not fixed`);
    }
    summaries[name] = await validateInventory({
      root: cacheRoot,
      inventoryPath,
      expectedName: name === 'goModule' ? 'go-module' : name,
      declaration: manifest.caches[name],
    });
    validateReference(
      root,
      manifest.caches[name].validation,
      `${name} validation`,
      rootHashes,
      frozenFiles,
    );
  }
  const historical = supplemental.historicalGo;
  const historicalRoot = requireCanonicalPath(historical.root, {
    label: 'historical Go cache',
    type: 'directory',
    below: root,
  });
  const historicalInventoryPath = requireCanonicalPath(historical.inventoryPath, {
    label: 'historical Go inventory',
    type: 'file',
    below: root,
  });
  summaries.historicalGo = await validateInventory({
    root: historicalRoot,
    inventoryPath: historicalInventoryPath,
    expectedName: 'go-historical',
    declaration: historical,
  });
  for (const [name, entryName] of [
    ['queryGo', 'bin/go'],
    ['queryGofmt', 'bin/gofmt'],
  ]) {
    const entry = readJsonStrict(historicalInventoryPath).entries.find(
      (candidate) => candidate.path === entryName,
    );
    if (!entry || input.tools[name].sha256 !== `sha256:${entry.sha256}`) {
      fail(`${name} digest differs from the sealed historical tool identity`);
    }
  }
  if (
    input.browser.executablePath !== manifest.caches.browser.executablePath ||
    input.browser.executableDigest !==
      `sha256:${manifest.caches.browser.executableSha256}` ||
    !manifest.caches.browser.version.endsWith(input.browser.version)
  ) {
    fail('browser identity differs from the sealed browser cache');
  }
  const attestation = Object.freeze({
    digest: manifestDigest,
    manifest: Object.freeze(manifest),
    preparedFromRevision: manifest.productCandidate.revision,
    root,
    rootSeal: rootSeal.digest,
    toolIdentities: sealedToolIdentities,
    summaries: Object.freeze(summaries),
    total: Object.freeze({
      byteCount: Object.values(summaries).reduce(
        (sum, summary) => sum + summary.byteCount,
        0,
      ),
      fileCount: Object.values(summaries).reduce(
        (sum, summary) => sum + summary.fileCount,
        0,
      ),
      rootDirectoryCount: rootFrozen.directoryCount,
      rootFileCount: rootFrozen.files.length,
    }),
  });
  privateAttestations.set(attestation, Object.freeze({
    input,
    rootManifestDigest: manifestDigest,
    rootSealDigest: rootSeal.digest,
  }));
  return attestation;
}

export async function verifyInputCacheSeal(attestation) {
  const privateState = privateAttestations.get(attestation);
  if (!privateState) fail('cache attestation was not issued by this module');
  const current = await attestInputCaches(privateState.input);
  if (
    current.digest !== privateState.rootManifestDigest ||
    current.rootSeal !== privateState.rootSealDigest ||
    current.preparedFromRevision !== attestation.preparedFromRevision ||
    JSON.stringify(current.total) !== JSON.stringify(attestation.total) ||
    CACHE_NAMES.some(
      (name) => current.summaries[name].digest !== attestation.summaries[name].digest,
    ) ||
    current.summaries.historicalGo.digest !==
      attestation.summaries.historicalGo.digest
  ) {
    fail('frozen input cache changed during acceptance');
  }
  return current;
}

export function requireInputCacheAttestation(attestation, input) {
  const privateState = privateAttestations.get(attestation);
  if (!privateState || privateState.input !== input) {
    fail('cache attestation does not bind this exact validated acceptance input');
  }
  return attestation;
}
