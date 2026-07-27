import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import {
  canonicalJson,
  canonicalJsonDigest,
} from './canonical-json.mjs';
import { requireInputCacheAttestation } from './cache-input.mjs';
import {
  listPackageLockPathsAtRevision,
  readRawRegularGitBlob,
} from './git-attestation.mjs';
import {
  assertSafeRelativePath,
  requireCanonicalPath,
  sha256Bytes,
} from './paths.mjs';
import {
  decodeUtf8Strict,
  parseJsonStrict,
} from './strict-json.mjs';

export const CACHE_AUTHORITY_COUNT = 18;
export const NPM_LOCK_AUTHORITY_COUNT = 13;
export const PRODUCT_PACKAGE_LOCK_PATHS = Object.freeze([
  'contracts/goldens/api/candidates/package-lock.json',
  'contracts/goldens/api/catalog/package-lock.json',
  'contracts/goldens/api/co-star/package-lock.json',
  'contracts/goldens/api/partners/package-lock.json',
  'contracts/goldens/api/person-detail/package-lock.json',
  'contracts/goldens/api/rankings/package-lock.json',
  'contracts/goldens/query/package-lock.json',
  'contracts/schemas/archive/tooling/package-lock.json',
  'contracts/schemas/catalog/tooling/package-lock.json',
  'contracts/schemas/update-status/tooling/package-lock.json',
  'frontend/package-lock.json',
]);

const ACCEPTANCE_PACKAGE_LOCK_PATH =
  'contracts/acceptance/package-lock.json';
const ORACLE_PACKAGE_LOCK_PATH = 'frontend/package-lock.json';
const QUERY_MANIFEST_PATH = 'contracts/goldens/query/manifest.json';
export const QUERY_GO_MODULE_LOCK_PATHS = Object.freeze([
  'contracts/goldens/query/fixtures/go-module/go.mod.lock',
  'contracts/goldens/query/fixtures/go-module/go.sum.lock',
]);
const GO_MODULE_INVENTORY_PATH = 'inventories/go-module.json';
const OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const RAW_DIGEST = /^[0-9a-f]{64}$/u;
const PHASES = Object.freeze(['preAdmission', 'postCleanup']);
const COUNTS = Object.freeze({
  authorities: CACHE_AUTHORITY_COUNT,
  npmLocks: NPM_LOCK_AUTHORITY_COUNT,
  productLocks: PRODUCT_PACKAGE_LOCK_PATHS.length,
  goFiles: 2,
  queryModuleLocks: QUERY_GO_MODULE_LOCK_PATHS.length,
  uvLocks: 1,
});
const NPM_AUTHORITIES = Object.freeze([
  Object.freeze({
    logicalOwner: 'harness',
    logicalPath: ACCEPTANCE_PACKAGE_LOCK_PATH,
    frozenPath: `locks/harness/${ACCEPTANCE_PACKAGE_LOCK_PATH}`,
  }),
  Object.freeze({
    logicalOwner: 'oracle',
    logicalPath: ORACLE_PACKAGE_LOCK_PATH,
    frozenPath: `locks/oracle/${ORACLE_PACKAGE_LOCK_PATH}`,
  }),
  ...PRODUCT_PACKAGE_LOCK_PATHS.map((logicalPath) =>
    Object.freeze({
      logicalOwner: 'product',
      logicalPath,
      frozenPath: `locks/product/${logicalPath}`,
    }),
  ),
]);

export class CacheCompatibilityError extends Error {}

function fail(message) {
  throw new CacheCompatibilityError(message);
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

function exactObjectId(value, label) {
  if (typeof value !== 'string' || !OBJECT_ID.test(value)) {
    fail(`${label} must be one exact Git object ID`);
  }
  return value;
}

function digest(value, label, { prefix = true } = {}) {
  if (
    typeof value !== 'string' ||
    !(prefix ? DIGEST : RAW_DIGEST).test(value)
  ) {
    fail(`${label} must be one SHA-256 identity`);
  }
  return value;
}

function nonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function assertExactArray(actual, expected, label) {
  if (
    !Array.isArray(actual) ||
    actual.length !== expected.length ||
    actual.some((entry, index) => entry !== expected[index])
  ) {
    fail(`${label} is not the exact ordered authority set`);
  }
}

function canonicalWithoutTrailingNewline(value) {
  return canonicalJson(value).slice(0, -1);
}

function readFrozenRegularFile(root, relative, label, expectedSha256) {
  assertSafeRelativePath(relative, `${label} path`);
  const absolute = requireCanonicalPath(
    path.join(root, ...relative.split('/')),
    {
      label,
      type: 'file',
      below: root,
    },
  );
  const information = fs.lstatSync(absolute, { bigint: true });
  if (
    information.isSymbolicLink() ||
    !information.isFile() ||
    information.nlink !== 1n ||
    Number(information.mode & 0o777n) !== 0o444
  ) {
    fail(`${label} must be a single-link 0444 regular file`);
  }
  const bytes = fs.readFileSync(absolute);
  const identity = sha256Bytes(bytes);
  if (
    expectedSha256 !== undefined &&
    identity !==
      (expectedSha256.startsWith('sha256:')
        ? expectedSha256
        : `sha256:${expectedSha256}`)
  ) {
    fail(`${label} differs from its immutable digest`);
  }
  return Object.freeze({
    absolute,
    relative,
    byteCount: bytes.length,
    sha256: identity,
    bytes,
  });
}

function readFrozenReference(root, reference, label, { canonical = false } = {}) {
  const declaration = exactObject(
    reference,
    ['byteCount', 'path', 'sha256'],
    `${label} reference`,
  );
  nonNegativeInteger(declaration.byteCount, `${label} reference byteCount`);
  digest(declaration.sha256, `${label} reference sha256`, { prefix: false });
  const file = readFrozenRegularFile(
    root,
    declaration.path,
    label,
    declaration.sha256,
  );
  if (file.byteCount !== declaration.byteCount) {
    fail(`${label} byte count differs from its immutable reference`);
  }
  const document = parseJsonStrict(
    decodeUtf8Strict(file.bytes, label),
    label,
  );
  if (
    canonical &&
    decodeUtf8Strict(file.bytes, label) !== canonicalWithoutTrailingNewline(document)
  ) {
    fail(`${label} is not canonical JSON without trailing bytes`);
  }
  return Object.freeze({ declaration, document, file });
}

function lockRecord(value, label) {
  const record = exactObject(
    value,
    ['packageEntries', 'path', 'resolvedIntegrityEntries', 'sha256'],
    label,
  );
  assertSafeRelativePath(record.path, `${label}.path`);
  digest(record.sha256, `${label}.sha256`, { prefix: false });
  nonNegativeInteger(record.packageEntries, `${label}.packageEntries`);
  nonNegativeInteger(
    record.resolvedIntegrityEntries,
    `${label}.resolvedIntegrityEntries`,
  );
  return record;
}

function packageLockFacts(bytes, label) {
  const document = parseJsonStrict(decodeUtf8Strict(bytes, label), label);
  if (
    !document ||
    typeof document !== 'object' ||
    Array.isArray(document) ||
    !document.packages ||
    typeof document.packages !== 'object' ||
    Array.isArray(document.packages)
  ) {
    fail(`${label} has no package-lock packages authority`);
  }
  const packages = Object.values(document.packages);
  return Object.freeze({
    packageEntries: packages.length,
    resolvedIntegrityEntries: packages.filter(
      (entry) =>
        entry &&
        typeof entry === 'object' &&
        typeof entry.resolved === 'string' &&
        typeof entry.integrity === 'string',
    ).length,
  });
}

function gitEvidence(blob) {
  return Object.freeze({
    revision: blob.revision,
    mode: blob.mode,
    blobOid: blob.blobOid,
    byteCount: blob.byteCount,
    sha256: blob.sha256,
  });
}

function equalBytes(left, right, label) {
  if (!left.equals(right)) fail(`${label} bytes differ`);
}

function goModuleVersionRecords(bytes, label) {
  const records = new Map();
  const source = decodeUtf8Strict(bytes, label);
  for (const [lineIndex, line] of source.split(/\r?\n/u).entries()) {
    if (line === '') continue;
    const match =
      /^(\S+) (v[0-9][A-Za-z0-9.+_-]*)(\/go\.mod)? (h1:[A-Za-z0-9+/]+={0,2})$/u.exec(
        line,
      );
    if (!match) fail(`${label} has an invalid line ${lineIndex + 1}`);
    const moduleVersion = `${match[1]}@${match[2]}`;
    const checksumKind = match[3] ? 'goMod' : 'module';
    const key = `${moduleVersion}\0${checksumKind}`;
    if (records.has(key)) {
      fail(`${label} duplicates ${moduleVersion} ${checksumKind}`);
    }
    records.set(key, Object.freeze({
      checksum: match[4],
      checksumKind,
      module: match[1],
      moduleVersion,
      version: match[2],
    }));
  }
  if (records.size === 0) fail(`${label} has no module checksum authority`);
  return Object.freeze(
    [...records.values()].sort((left, right) => {
      const leftKey = `${left.moduleVersion}\0${left.checksumKind}`;
      const rightKey = `${right.moduleVersion}\0${right.checksumKind}`;
      return leftKey.localeCompare(rightKey, 'en');
    }),
  );
}

function moduleVersions(records) {
  return Object.freeze([
    ...new Set(records.map((record) => record.moduleVersion)),
  ].sort((left, right) => left.localeCompare(right, 'en')));
}

function escapedGoModulePath(modulePath) {
  let escaped = '';
  for (const character of modulePath) {
    escaped += /[A-Z]/u.test(character)
      ? `!${character.toLowerCase()}`
      : character;
  }
  return escaped;
}

function assertGoCacheRelativePath(value, label) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 4096 ||
    path.posix.isAbsolute(value) ||
    value.includes('\0') ||
    value.includes('\\') ||
    value.split('/').some(
      (part) =>
        part === '' ||
        part === '.' ||
        part === '..' ||
        !/^[A-Za-z0-9._@!+-]+$/u.test(part),
    )
  ) {
    fail(`${label} is not a safe Go cache path`);
  }
  return value;
}

function readFrozenGoCacheFile(root, relative, label, expectedSha256) {
  assertGoCacheRelativePath(relative, `${label} path`);
  const absolute = requireCanonicalPath(
    path.join(root, ...relative.split('/')),
    {
      label,
      type: 'file',
      below: root,
    },
  );
  const information = fs.lstatSync(absolute, { bigint: true });
  if (
    information.isSymbolicLink() ||
    !information.isFile() ||
    information.nlink !== 1n ||
    Number(information.mode & 0o777n) !== 0o444
  ) {
    fail(`${label} must be a single-link 0444 regular file`);
  }
  const bytes = fs.readFileSync(absolute);
  const identity = sha256Bytes(bytes);
  if (identity !== `sha256:${expectedSha256}`) {
    fail(`${label} differs from its sealed inventory digest`);
  }
  return Object.freeze({
    byteCount: bytes.length,
    bytes,
    sha256: identity,
  });
}

function validateGoModuleInventory({ input, manifest, root }) {
  const declaration = manifest.caches?.goModule;
  const expectedInventoryPath = path.join(
    root,
    ...GO_MODULE_INVENTORY_PATH.split('/'),
  );
  const goModuleRoot = requireCanonicalPath(
    input.caches?.goModule ?? declaration?.root,
    {
      label: 'sealed Go module cache',
      type: 'directory',
      below: root,
    },
  );
  if (
    declaration?.root !== goModuleRoot ||
    declaration?.inventoryPath !== expectedInventoryPath
  ) {
    fail('Go module cache root or inventory path is not the admitted fixed path');
  }
  digest(
    declaration.inventorySha256,
    'Go module inventory declaration digest',
    { prefix: false },
  );
  const frozen = readFrozenRegularFile(
    root,
    GO_MODULE_INVENTORY_PATH,
    'Go module inventory',
    declaration.inventorySha256,
  );
  const document = exactObject(
    parseJsonStrict(
      decodeUtf8Strict(frozen.bytes, 'Go module inventory'),
      'Go module inventory',
    ),
    ['entries', 'name', 'schemaVersion'],
    'Go module inventory',
  );
  if (document.schemaVersion !== 1 || document.name !== 'go-module') {
    fail('Go module inventory identity is invalid');
  }
  if (!Array.isArray(document.entries)) {
    fail('Go module inventory entries must be an array');
  }
  let previousPath = null;
  const entries = new Map();
  for (const [index, raw] of document.entries.entries()) {
    const entry = exactObject(
      raw,
      ['executable', 'path', 'sha256', 'size'],
      `Go module inventory entry ${index}`,
    );
    assertGoCacheRelativePath(
      entry.path,
      `Go module inventory entry ${index}.path`,
    );
    digest(entry.sha256, `Go module inventory entry ${index}.sha256`, {
      prefix: false,
    });
    nonNegativeInteger(entry.size, `Go module inventory entry ${index}.size`);
    if (
      typeof entry.executable !== 'boolean' ||
      (previousPath !== null &&
        previousPath.localeCompare(entry.path, 'en') >= 0)
    ) {
      fail(`Go module inventory entry ${index} is invalid or reordered`);
    }
    previousPath = entry.path;
    entries.set(entry.path, entry);
  }
  return Object.freeze({
    entries,
    file: frozen,
    root: goModuleRoot,
  });
}

function requiredQueryCacheFiles(queryRecords, inventory) {
  const byModuleVersion = new Map();
  for (const record of queryRecords) {
    const existing = byModuleVersion.get(record.moduleVersion) ?? {
      module: record.module,
      version: record.version,
      checksums: new Map(),
    };
    existing.checksums.set(record.checksumKind, record.checksum);
    byModuleVersion.set(record.moduleVersion, existing);
  }
  const required = [];
  for (const declaration of [...byModuleVersion.values()].sort((left, right) =>
    `${left.module}@${left.version}`.localeCompare(
      `${right.module}@${right.version}`,
      'en',
    ))) {
    const versionRoot = [
      'cache',
      'download',
      ...escapedGoModulePath(declaration.module).split('/'),
      '@v',
    ].join('/');
    const suffixes = declaration.checksums.has('module')
      ? ['.info', '.mod', '.zip', '.ziphash']
      : ['.mod'];
    for (const suffix of suffixes) {
      const relative = `${versionRoot}/${declaration.version}${suffix}`;
      const entry = inventory.entries.get(relative);
      if (!entry || entry.executable) {
        fail(
          `sealed Go cache is missing Query module byte ` +
            `${declaration.module}@${declaration.version}${suffix}`,
        );
      }
      const file = readFrozenGoCacheFile(
        inventory.root,
        relative,
        `Query Go cache file ${relative}`,
        entry.sha256,
      );
      if (file.byteCount !== entry.size) {
        fail(`Query Go cache file size differs from inventory: ${relative}`);
      }
      if (
        suffix === '.ziphash' &&
        decodeUtf8Strict(file.bytes, `Query Go cache ziphash ${relative}`) !==
          declaration.checksums.get('module')
      ) {
        fail(`Query Go cache checksum differs for ${declaration.module}@${declaration.version}`);
      }
      required.push(Object.freeze({
        path: relative,
        sha256: entry.sha256,
        size: entry.size,
      }));
    }
  }
  required.sort((left, right) => left.path.localeCompare(right.path, 'en'));
  return Object.freeze(required);
}

function validateQueryModuleAuthorities({
  input,
  manifest,
  root,
  startIndex,
}) {
  const acceptedManifest = readRawRegularGitBlob({
    repositoryRoot: input.product.root,
    revision: input.product.revision,
    relativePath: QUERY_MANIFEST_PATH,
  });
  const queryManifest = parseJsonStrict(
    decodeUtf8Strict(acceptedManifest.bytes, 'accepted Query manifest'),
    'accepted Query manifest',
  );
  const moduleInputs = exactObject(
    queryManifest?.codegen?.go?.moduleInputs,
    ['goMod', 'goSum'],
    'Query manifest moduleInputs',
  );
  const inputDeclarations = [
    ['goMod', QUERY_GO_MODULE_LOCK_PATHS[0]],
    ['goSum', QUERY_GO_MODULE_LOCK_PATHS[1]],
  ].map(([name, expectedPath]) => {
    const declaration = exactObject(
      moduleInputs[name],
      ['bytes', 'path', 'sha256'],
      `Query manifest moduleInputs.${name}`,
    );
    if (declaration.path !== expectedPath) {
      fail(`Query manifest ${name} path differs from the accepted lock path`);
    }
    nonNegativeInteger(declaration.bytes, `Query manifest ${name} bytes`);
    digest(declaration.sha256, `Query manifest ${name} sha256`, {
      prefix: false,
    });
    return declaration;
  });
  const acceptedLocks = QUERY_GO_MODULE_LOCK_PATHS.map((logicalPath, offset) => {
    const accepted = readRawRegularGitBlob({
      repositoryRoot: input.product.root,
      revision: input.product.revision,
      relativePath: logicalPath,
    });
    const declaration = inputDeclarations[offset];
    if (
      accepted.byteCount !== declaration.bytes ||
      accepted.sha256 !== `sha256:${declaration.sha256}`
    ) {
      fail(`accepted Query module lock differs from manifest: ${logicalPath}`);
    }
    return accepted;
  });

  const backendGoSum = readRawRegularGitBlob({
    repositoryRoot: input.product.root,
    revision: input.product.revision,
    relativePath: 'backend/go.sum',
  });
  const backendRecords = goModuleVersionRecords(
    backendGoSum.bytes,
    'accepted backend/go.sum',
  );
  const queryRecords = goModuleVersionRecords(
    acceptedLocks[1].bytes,
    'accepted Query go.sum lock',
  );
  const backendByRecord = new Map(
    backendRecords.map((record) => [
      `${record.moduleVersion}\0${record.checksumKind}`,
      record,
    ]),
  );
  for (const record of queryRecords) {
    const backend = backendByRecord.get(
      `${record.moduleVersion}\0${record.checksumKind}`,
    );
    if (!backend) {
      fail(`Query module/version is outside the Backend-seeded closure: ${record.moduleVersion}`);
    }
    if (backend.checksum !== record.checksum) {
      fail(`Query module checksum differs from backend/go.sum: ${record.moduleVersion}`);
    }
  }
  const queryVersions = moduleVersions(queryRecords);
  const backendVersions = moduleVersions(backendRecords);
  const inventory = validateGoModuleInventory({ input, manifest, root });
  const requiredCacheFiles = requiredQueryCacheFiles(queryRecords, inventory);
  const compatibility = Object.freeze({
    backendModuleVersionCount: backendVersions.length,
    backendModuleVersionsSha256: canonicalJsonDigest(backendVersions),
    moduleChecksumSetSha256: canonicalJsonDigest(
      queryRecords.map(({ checksum, checksumKind, moduleVersion }) => ({
        checksum,
        checksumKind,
        moduleVersion,
      })),
    ),
    moduleVersionCount: queryVersions.length,
    moduleVersions: queryVersions,
    moduleVersionsSha256: canonicalJsonDigest(queryVersions),
    requiredCacheFileCount: requiredCacheFiles.length,
    requiredCacheFiles,
    requiredCacheFilesSha256: canonicalJsonDigest(requiredCacheFiles),
  });
  return Object.freeze({
    authorities: acceptedLocks.map((accepted, offset) => Object.freeze({
      index: startIndex + offset,
      kind: 'query-go-module-lock',
      logicalOwner: 'product',
      logicalPath: accepted.path,
      scope: 'accepted-product-only',
      frozenPath: null,
      git: Object.freeze({
        preparation: null,
        accepted: gitEvidence(accepted),
      }),
      frozen: null,
      bindings: Object.freeze([
        Object.freeze({
          kind: 'query-manifest-module-input',
          path: QUERY_MANIFEST_PATH,
          sha256: acceptedManifest.sha256,
        }),
        ...(offset === 1
          ? [
              Object.freeze({
                kind: 'go-module-inventory',
                path: GO_MODULE_INVENTORY_PATH,
                sha256: inventory.file.sha256,
              }),
              Object.freeze({
                kind: 'backend-go-sum',
                path: 'backend/go.sum',
                sha256: backendGoSum.sha256,
              }),
            ]
          : []),
      ]),
      comparisons: Object.freeze({
        preparationToFrozen: 'not-applicable',
        acceptedToFrozen: 'manifest-sealed',
        preparationToAccepted: 'not-applicable',
      }),
      compatibility: offset === 1 ? compatibility : null,
    })),
    goModuleInventorySha256: inventory.file.sha256,
    queryManifestSha256: acceptedManifest.sha256,
  });
}

function validateNpmInventory({
  inventory,
  manifestLocks,
  preparedFromRevision,
  oracleRevision,
}) {
  const document = exactObject(
    inventory,
    [
      'schemaVersion',
      'productRevision',
      'oracleRevision',
      'locks',
      'pairCount',
      'integrityCount',
      'urlCount',
      'pairs',
    ],
    'npm lock inventory',
  );
  if (
    document.schemaVersion !== 1 ||
    document.productRevision !== preparedFromRevision ||
    document.oracleRevision !== oracleRevision
  ) {
    fail('npm lock inventory revision identity is inconsistent');
  }
  if (!Array.isArray(document.locks)) {
    fail('npm lock inventory locks must be an array');
  }
  if (
    document.locks.length !== NPM_LOCK_AUTHORITY_COUNT ||
    manifestLocks.length !== NPM_LOCK_AUTHORITY_COUNT
  ) {
    fail('npm lock authority count must equal 13');
  }
  for (const [index, authority] of NPM_AUTHORITIES.entries()) {
    const expectedPath = authority.frozenPath;
    const inventoryRecord = lockRecord(
      document.locks[index],
      `npm lock inventory record ${index}`,
    );
    const manifestRecord = lockRecord(
      manifestLocks[index],
      `cache manifest lock record ${index}`,
    );
    if (
      inventoryRecord.path !== expectedPath ||
      inventoryRecord.path !== manifestRecord.path ||
      inventoryRecord.sha256 !== manifestRecord.sha256 ||
      inventoryRecord.packageEntries !== manifestRecord.packageEntries ||
      inventoryRecord.resolvedIntegrityEntries !==
        manifestRecord.resolvedIntegrityEntries
    ) {
      fail(`npm lock record ${index} is missing, reordered, or inconsistent`);
    }
  }
  if (!Array.isArray(document.pairs)) {
    fail('npm lock inventory pairs must be an array');
  }
  nonNegativeInteger(document.pairCount, 'npm lock inventory pairCount');
  nonNegativeInteger(document.integrityCount, 'npm lock inventory integrityCount');
  nonNegativeInteger(document.urlCount, 'npm lock inventory urlCount');
  if (document.pairCount !== document.pairs.length) {
    fail('npm lock inventory pair count is inconsistent');
  }
  const pairs = new Set();
  const urls = new Set();
  const integrities = new Set();
  let previous = null;
  for (const [index, raw] of document.pairs.entries()) {
    const pair = exactObject(raw, ['integrity', 'resolved'], `npm pair ${index}`);
    if (
      typeof pair.resolved !== 'string' ||
      !/^https:\/\/[^\s]+$/u.test(pair.resolved) ||
      typeof pair.integrity !== 'string' ||
      !/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(pair.integrity)
    ) {
      fail(`npm pair ${index} is invalid`);
    }
    const key = `${pair.resolved}\0${pair.integrity}`;
    if (pairs.has(key) || (previous !== null && previous.localeCompare(key, 'en') >= 0)) {
      fail(`npm pair ${index} is duplicated or reordered`);
    }
    pairs.add(key);
    urls.add(pair.resolved);
    integrities.add(pair.integrity);
    previous = key;
  }
  if (
    urls.size !== document.urlCount ||
    integrities.size !== document.integrityCount
  ) {
    fail('npm lock inventory URL or integrity count is inconsistent');
  }
}

function exactPackageLockSets(input, preparedFromRevision) {
  const productExpected = [...PRODUCT_PACKAGE_LOCK_PATHS];
  const harnessExpected = [
    ACCEPTANCE_PACKAGE_LOCK_PATH,
    ...PRODUCT_PACKAGE_LOCK_PATHS,
  ].sort((left, right) => left.localeCompare(right, 'en'));
  assertExactArray(
    listPackageLockPathsAtRevision({
      repositoryRoot: input.product.root,
      revision: preparedFromRevision,
    }),
    productExpected,
    'preparation product package locks',
  );
  assertExactArray(
    listPackageLockPathsAtRevision({
      repositoryRoot: input.product.root,
      revision: input.product.revision,
    }),
    productExpected,
    'accepted product package locks',
  );
  assertExactArray(
    listPackageLockPathsAtRevision({
      repositoryRoot: input.harness.root,
      revision: input.harness.revision,
    }),
    harnessExpected,
    'accepted harness package locks',
  );
  assertExactArray(
    listPackageLockPathsAtRevision({
      repositoryRoot: input.harness.root,
      revision: input.oracle.revision,
    }),
    [ORACLE_PACKAGE_LOCK_PATH],
    'fixed oracle admitted package locks',
  );
}

function sourceBlob(input, preparedFromRevision, authority) {
  if (authority.logicalOwner === 'harness') {
    return Object.freeze({
      preparation: null,
      accepted: readRawRegularGitBlob({
        repositoryRoot: input.harness.root,
        revision: input.harness.revision,
        relativePath: authority.logicalPath,
      }),
    });
  }
  if (authority.logicalOwner === 'oracle') {
    return Object.freeze({
      preparation: null,
      accepted: readRawRegularGitBlob({
        repositoryRoot: input.harness.root,
        revision: input.oracle.revision,
        relativePath: authority.logicalPath,
      }),
    });
  }
  return Object.freeze({
    preparation: readRawRegularGitBlob({
      repositoryRoot: input.product.root,
      revision: preparedFromRevision,
      relativePath: authority.logicalPath,
    }),
    accepted: readRawRegularGitBlob({
      repositoryRoot: input.product.root,
      revision: input.product.revision,
      relativePath: authority.logicalPath,
    }),
  });
}

function npmAuthorities({
  input,
  root,
  manifestLocks,
  inventory,
  inventorySha256,
  preparedFromRevision,
}) {
  return NPM_AUTHORITIES.map((authority, index) => {
    const frozen = readFrozenRegularFile(
      root,
      authority.frozenPath,
      `frozen npm authority ${index}`,
      manifestLocks[index].sha256,
    );
    const sources = sourceBlob(input, preparedFromRevision, authority);
    equalBytes(
      frozen.bytes,
      sources.accepted.bytes,
      `${authority.logicalOwner} ${authority.logicalPath}`,
    );
    if (sources.preparation) {
      equalBytes(
        frozen.bytes,
        sources.preparation.bytes,
        `preparation ${authority.logicalPath}`,
      );
    }
    const facts = packageLockFacts(
      frozen.bytes,
      `frozen npm authority ${authority.frozenPath}`,
    );
    const expected = inventory.locks[index];
    if (
      facts.packageEntries !== expected.packageEntries ||
      facts.resolvedIntegrityEntries !== expected.resolvedIntegrityEntries
    ) {
      fail(`npm package/integrity counts differ for ${authority.frozenPath}`);
    }
    return Object.freeze({
      index,
      kind: 'npm-lock',
      logicalOwner: authority.logicalOwner,
      logicalPath: authority.logicalPath,
      scope:
        authority.logicalOwner === 'product'
          ? 'preparation-and-accepted-product'
          : authority.logicalOwner === 'harness'
            ? 'accepted-harness'
            : 'fixed-oracle',
      frozenPath: authority.frozenPath,
      git: Object.freeze({
        preparation: sources.preparation
          ? gitEvidence(sources.preparation)
          : null,
        accepted: gitEvidence(sources.accepted),
      }),
      frozen: Object.freeze({
        byteCount: frozen.byteCount,
        sha256: frozen.sha256,
      }),
      bindings: Object.freeze([
        Object.freeze({
          kind: 'npm-lock-inventory',
          path: 'npm-lock-inventory.json',
          sha256: inventorySha256,
        }),
      ]),
      comparisons: Object.freeze({
        preparationToFrozen: sources.preparation ? 'equal' : 'not-applicable',
        acceptedToFrozen: 'equal',
        preparationToAccepted: sources.preparation
          ? 'equal'
          : 'not-applicable',
      }),
      compatibility: null,
    });
  });
}

function validateGoAuthority({
  input,
  root,
  preparedFromRevision,
  validationReference,
  startIndex,
}) {
  if (validationReference.path !== 'validation/go-cache.json') {
    fail('Go validation path is not the fixed validation/go-cache.json');
  }
  const validation = readFrozenReference(
    root,
    validationReference,
    'Go validation',
  );
  const document = exactObject(
    validation.document,
    [
      'schemaVersion',
      'source',
      'destination',
      'candidateRevision',
      'goSumPath',
      'goSumSha256',
      'marker',
      'copySealMatchesSource',
      'allCopiedFilesNewInodes',
      'noSymlinks',
      'currentToolchain',
      'historicalQueryToolchain',
      'offlineValidation',
    ],
    'Go validation document',
  );
  if (
    document.schemaVersion !== 1 ||
    document.candidateRevision !== preparedFromRevision ||
    document.goSumPath !== 'backend/go.sum' ||
    document.copySealMatchesSource !== true ||
    document.allCopiedFilesNewInodes !== true ||
    document.noSymlinks !== true
  ) {
    fail('Go validation revision, closure copy, or go.sum binding is inconsistent');
  }
  digest(document.goSumSha256, 'Go validation goSumSha256', {
    prefix: false,
  });
  return ['backend/go.mod', 'backend/go.sum'].map((logicalPath, offset) => {
    const frozenPath = `go/${logicalPath}`;
    const frozen = readFrozenRegularFile(
      root,
      frozenPath,
      `frozen ${logicalPath}`,
    );
    const preparation = readRawRegularGitBlob({
      repositoryRoot: input.product.root,
      revision: preparedFromRevision,
      relativePath: logicalPath,
    });
    const accepted = readRawRegularGitBlob({
      repositoryRoot: input.product.root,
      revision: input.product.revision,
      relativePath: logicalPath,
    });
    equalBytes(frozen.bytes, preparation.bytes, `preparation ${logicalPath}`);
    equalBytes(frozen.bytes, accepted.bytes, `accepted ${logicalPath}`);
    if (
      logicalPath === 'backend/go.sum' &&
      frozen.sha256 !== `sha256:${document.goSumSha256}`
    ) {
      fail('Go validation does not bind the actual backend/go.sum digest');
    }
    return Object.freeze({
      index: startIndex + offset,
      kind: 'go-file',
      logicalOwner: 'product',
      logicalPath,
      scope: 'preparation-and-accepted-product',
      frozenPath,
      git: Object.freeze({
        preparation: gitEvidence(preparation),
        accepted: gitEvidence(accepted),
      }),
      frozen: Object.freeze({
        byteCount: frozen.byteCount,
        sha256: frozen.sha256,
      }),
      bindings: Object.freeze(
        logicalPath === 'backend/go.sum'
          ? [
              Object.freeze({
                kind: 'go-validation-go-sum',
                path: validationReference.path,
                sha256: validation.file.sha256,
              }),
            ]
          : [],
      ),
      comparisons: Object.freeze({
        preparationToFrozen: 'equal',
        acceptedToFrozen: 'equal',
        preparationToAccepted: 'equal',
      }),
      compatibility: null,
    });
  });
}

function validateUvAuthority({
  input,
  root,
  preparedFromRevision,
  validationReference,
  planReference,
  index,
}) {
  if (
    validationReference.path !== 'validation/uv-cache.json' ||
    planReference.path !== 'uv-closure-plan.json'
  ) {
    fail('uv validation or closure-plan path is not fixed');
  }
  for (const forbidden of [
    'uv/updater/uv.lock',
    'locks/product/updater/uv.lock',
  ]) {
    if (fs.existsSync(path.join(root, ...forbidden.split('/')))) {
      fail(`a nonexistent frozen uv-lock copy is claimed at ${forbidden}`);
    }
  }
  const validation = readFrozenReference(
    root,
    validationReference,
    'uv validation',
  );
  const plan = readFrozenReference(root, planReference, 'uv closure plan');
  const validationDocument = exactObject(
    validation.document,
    [
      'schemaVersion',
      'source',
      'destination',
      'candidateRevision',
      'lockPath',
      'lockSha256',
      'closurePlan',
      'copyPolicy',
      'allDestinationInodesDistinctFromLocalSources',
      'destinationSymlinkCount',
      'destinationHardlinkCount',
      'offlineSync',
    ],
    'uv validation document',
  );
  const validationPlan = exactObject(
    validationDocument.closurePlan,
    [
      'path',
      'sha256',
      'registryLockPackageCount',
      'registryPackagesWithBytes',
      'markerExcludedPackages',
      'dynamicBuildRequirements',
      'archiveObjectCount',
      'simpleIndexFileCount',
      'selectionPolicy',
    ],
    'uv validation closure plan binding',
  );
  const planDocument = exactObject(
    plan.document,
    [
      'schemaVersion',
      'candidateRevision',
      'lockPath',
      'lockSha256',
      'target',
      'sourceCache',
      'destinationCache',
      'selectionPolicy',
      'packages',
      'simpleIndexFileCount',
      'archiveIds',
      'dynamicBuildRequirements',
    ],
    'uv closure plan document',
  );
  if (
    validationDocument.schemaVersion !== 1 ||
    planDocument.schemaVersion !== 1 ||
    validationDocument.candidateRevision !== preparedFromRevision ||
    planDocument.candidateRevision !== preparedFromRevision ||
    validationDocument.lockPath !== 'updater/uv.lock' ||
    planDocument.lockPath !== 'updater/uv.lock' ||
    validationDocument.lockSha256 !== planDocument.lockSha256 ||
    validationPlan.path !== planReference.path ||
    validationPlan.sha256 !== planReference.sha256 ||
    validationPlan.sha256 !== plan.file.sha256.slice('sha256:'.length)
  ) {
    fail('uv validation and closure plan directed bindings are inconsistent');
  }
  digest(validationDocument.lockSha256, 'uv validation lockSha256', {
    prefix: false,
  });
  const preparation = readRawRegularGitBlob({
    repositoryRoot: input.product.root,
    revision: preparedFromRevision,
    relativePath: 'updater/uv.lock',
  });
  const accepted = readRawRegularGitBlob({
    repositoryRoot: input.product.root,
    revision: input.product.revision,
    relativePath: 'updater/uv.lock',
  });
  equalBytes(preparation.bytes, accepted.bytes, 'updater/uv.lock authority');
  if (preparation.sha256 !== `sha256:${validationDocument.lockSha256}`) {
    fail('uv directed frozen digest authority differs from updater/uv.lock');
  }
  return Object.freeze({
    index,
    kind: 'uv-lock',
    logicalOwner: 'product',
    logicalPath: 'updater/uv.lock',
    scope: 'preparation-and-accepted-product',
    frozenPath: null,
    git: Object.freeze({
      preparation: gitEvidence(preparation),
      accepted: gitEvidence(accepted),
    }),
    frozen: null,
    bindings: Object.freeze([
      Object.freeze({
        kind: 'uv-validation',
        path: validationReference.path,
        sha256: validation.file.sha256,
      }),
      Object.freeze({
        kind: 'uv-closure-plan',
        path: planReference.path,
        sha256: plan.file.sha256,
      }),
    ]),
    comparisons: Object.freeze({
      preparationToFrozen: 'directed-digest-authority',
      acceptedToFrozen: 'directed-digest-authority',
      preparationToAccepted: 'equal',
    }),
    compatibility: null,
  });
}

function phaseDigest(phase) {
  return canonicalJsonDigest({
    schemaVersion: phase.schemaVersion,
    phase: phase.phase,
    revisions: phase.revisions,
    counts: phase.counts,
    authorities: phase.authorities,
    seals: phase.seals,
  });
}

function validateGitAuthority(
  value,
  {
    label,
    revision,
  },
) {
  const document = exactObject(
    value,
    ['revision', 'mode', 'blobOid', 'byteCount', 'sha256'],
    label,
  );
  if (document.revision !== revision || document.mode !== '100644') {
    fail(`${label} does not bind the exact revision and 100644 mode`);
  }
  exactObjectId(document.blobOid, `${label}.blobOid`);
  nonNegativeInteger(document.byteCount, `${label}.byteCount`);
  digest(document.sha256, `${label}.sha256`);
  return document;
}

function validateFrozenAuthority(value, label) {
  const document = exactObject(
    value,
    ['byteCount', 'sha256'],
    label,
  );
  nonNegativeInteger(document.byteCount, `${label}.byteCount`);
  digest(document.sha256, `${label}.sha256`);
  return document;
}

function validateBinding(value, expected, label) {
  const document = exactObject(value, ['kind', 'path', 'sha256'], label);
  if (
    document.kind !== expected.kind ||
    document.path !== expected.path ||
    document.sha256 !== expected.sha256
  ) {
    fail(`${label} differs from the exact directed binding`);
  }
}

function validateQueryCompatibility(value, label) {
  const document = exactObject(
    value,
    [
      'backendModuleVersionCount',
      'backendModuleVersionsSha256',
      'moduleChecksumSetSha256',
      'moduleVersionCount',
      'moduleVersions',
      'moduleVersionsSha256',
      'requiredCacheFileCount',
      'requiredCacheFiles',
      'requiredCacheFilesSha256',
    ],
    label,
  );
  nonNegativeInteger(
    document.backendModuleVersionCount,
    `${label}.backendModuleVersionCount`,
  );
  nonNegativeInteger(document.moduleVersionCount, `${label}.moduleVersionCount`);
  nonNegativeInteger(
    document.requiredCacheFileCount,
    `${label}.requiredCacheFileCount`,
  );
  for (const name of [
    'backendModuleVersionsSha256',
    'moduleChecksumSetSha256',
    'moduleVersionsSha256',
    'requiredCacheFilesSha256',
  ]) {
    digest(document[name], `${label}.${name}`);
  }
  if (
    !Array.isArray(document.moduleVersions) ||
    document.moduleVersions.length !== document.moduleVersionCount
  ) {
    fail(`${label}.moduleVersions count is inconsistent`);
  }
  let previousModule = null;
  for (const [index, moduleVersion] of document.moduleVersions.entries()) {
    if (
      typeof moduleVersion !== 'string' ||
      !/^\S+@v[0-9][A-Za-z0-9.+_-]*$/u.test(moduleVersion) ||
      (previousModule !== null &&
        previousModule.localeCompare(moduleVersion, 'en') >= 0)
    ) {
      fail(`${label}.moduleVersions[${index}] is invalid or reordered`);
    }
    previousModule = moduleVersion;
  }
  if (
    document.moduleVersionsSha256 !==
    canonicalJsonDigest(document.moduleVersions)
  ) {
    fail(`${label}.moduleVersions digest is inconsistent`);
  }
  if (
    !Array.isArray(document.requiredCacheFiles) ||
    document.requiredCacheFiles.length !== document.requiredCacheFileCount
  ) {
    fail(`${label}.requiredCacheFiles count is inconsistent`);
  }
  let previousPath = null;
  for (const [index, raw] of document.requiredCacheFiles.entries()) {
    const file = exactObject(
      raw,
      ['path', 'sha256', 'size'],
      `${label}.requiredCacheFiles[${index}]`,
    );
    assertGoCacheRelativePath(
      file.path,
      `${label}.requiredCacheFiles[${index}].path`,
    );
    digest(file.sha256, `${label}.requiredCacheFiles[${index}].sha256`, {
      prefix: false,
    });
    nonNegativeInteger(file.size, `${label}.requiredCacheFiles[${index}].size`);
    if (
      previousPath !== null &&
      previousPath.localeCompare(file.path, 'en') >= 0
    ) {
      fail(`${label}.requiredCacheFiles is duplicated or reordered`);
    }
    previousPath = file.path;
  }
  if (
    document.requiredCacheFilesSha256 !==
    canonicalJsonDigest(document.requiredCacheFiles)
  ) {
    fail(`${label}.requiredCacheFiles digest is inconsistent`);
  }
  return document;
}

function validateAuthorityRecord(authority, expected, phase, index) {
  const label = `${phase.phase} authority ${index}`;
  const document = exactObject(
    authority,
    [
      'index',
      'kind',
      'logicalOwner',
      'logicalPath',
      'scope',
      'frozenPath',
      'git',
      'frozen',
      'bindings',
      'comparisons',
      'compatibility',
    ],
    label,
  );
  if (
    document.index !== index ||
    document.kind !== expected.kind ||
    document.logicalOwner !== expected.logicalOwner ||
    document.logicalPath !== expected.logicalPath ||
    document.scope !== expected.scope ||
    document.frozenPath !== expected.frozenPath
  ) {
    fail(`${label} is missing, added, reordered, or assigned to the wrong owner`);
  }
  const git = exactObject(
    document.git,
    ['preparation', 'accepted'],
    `${label}.git`,
  );
  const acceptedRevision =
    expected.logicalOwner === 'harness'
      ? phase.revisions.harnessRevision
      : expected.logicalOwner === 'oracle'
        ? phase.revisions.oracleRevision
        : phase.revisions.productRevision;
  const accepted = validateGitAuthority(git.accepted, {
    label: `${label}.git.accepted`,
    revision: acceptedRevision,
  });
  const hasPreparation =
    expected.scope === 'preparation-and-accepted-product';
  let preparation = null;
  if (hasPreparation) {
    preparation = validateGitAuthority(git.preparation, {
      label: `${label}.git.preparation`,
      revision: phase.revisions.preparedFromRevision,
    });
    if (
      preparation.blobOid !== accepted.blobOid ||
      preparation.byteCount !== accepted.byteCount ||
      preparation.sha256 !== accepted.sha256
    ) {
      fail(`${label} preparation and accepted Git authorities differ`);
    }
  } else if (git.preparation !== null) {
    fail(`${label} must not claim a preparation authority`);
  }
  if (!Array.isArray(document.bindings)) {
    fail(`${label}.bindings must be the exact directed binding array`);
  }
  const comparisons = exactObject(
    document.comparisons,
    [
      'preparationToFrozen',
      'acceptedToFrozen',
      'preparationToAccepted',
    ],
    `${label}.comparisons`,
  );
  if (expected.kind === 'query-go-module-lock') {
    if (document.frozen !== null) {
      fail(`${label} must not invent a frozen Query module lock`);
    }
    if (
      comparisons.preparationToFrozen !== 'not-applicable' ||
      comparisons.acceptedToFrozen !== 'manifest-sealed' ||
      comparisons.preparationToAccepted !== 'not-applicable'
    ) {
      fail(`${label} has an invalid accepted-product-only disclosure`);
    }
    validateBinding(
      document.bindings[0],
      {
        kind: 'query-manifest-module-input',
        path: QUERY_MANIFEST_PATH,
        sha256: phase.seals.queryManifestSha256,
      },
      `${label}.bindings[0]`,
    );
    const isGoSum = expected.logicalPath === QUERY_GO_MODULE_LOCK_PATHS[1];
    if (document.bindings.length !== (isGoSum ? 3 : 1)) {
      fail(`${label} has an invalid Query module binding set`);
    }
    if (!isGoSum) {
      if (document.compatibility !== null) {
        fail(`${label} must not duplicate the Query go.sum compatibility proof`);
      }
      return;
    }
    validateBinding(
      document.bindings[1],
      {
        kind: 'go-module-inventory',
        path: GO_MODULE_INVENTORY_PATH,
        sha256: phase.seals.goModuleInventorySha256,
      },
      `${label}.bindings[1]`,
    );
    const backendGoSum = phase.authorities.find(
      (candidate) =>
        candidate.kind === 'go-file' &&
        candidate.logicalPath === 'backend/go.sum',
    );
    validateBinding(
      document.bindings[2],
      {
        kind: 'backend-go-sum',
        path: 'backend/go.sum',
        sha256: backendGoSum?.git?.accepted?.sha256,
      },
      `${label}.bindings[2]`,
    );
    validateQueryCompatibility(
      document.compatibility,
      `${label}.compatibility`,
    );
    return;
  }
  if (document.compatibility !== null) {
    fail(`${label} must not claim a Query module compatibility proof`);
  }
  if (expected.kind === 'uv-lock') {
    if (document.frozen !== null || document.bindings.length !== 2) {
      fail(`${label} must use the uv validation and closure-plan dual authority`);
    }
    validateBinding(
      document.bindings[0],
      {
        kind: 'uv-validation',
        path: 'validation/uv-cache.json',
        sha256: phase.seals.uvValidationSha256,
      },
      `${label}.bindings[0]`,
    );
    validateBinding(
      document.bindings[1],
      {
        kind: 'uv-closure-plan',
        path: 'uv-closure-plan.json',
        sha256: phase.seals.uvClosurePlanSha256,
      },
      `${label}.bindings[1]`,
    );
    if (
      comparisons.preparationToFrozen !== 'directed-digest-authority' ||
      comparisons.acceptedToFrozen !== 'directed-digest-authority' ||
      comparisons.preparationToAccepted !== 'equal'
    ) {
      fail(`${label} has an invalid uv comparison disclosure`);
    }
    return;
  }
  const frozen = validateFrozenAuthority(document.frozen, `${label}.frozen`);
  if (
    frozen.byteCount !== accepted.byteCount ||
    frozen.sha256 !== accepted.sha256
  ) {
    fail(`${label} frozen and accepted authorities differ`);
  }
  if (
    comparisons.acceptedToFrozen !== 'equal' ||
    comparisons.preparationToFrozen !==
      (hasPreparation ? 'equal' : 'not-applicable') ||
    comparisons.preparationToAccepted !==
      (hasPreparation ? 'equal' : 'not-applicable')
  ) {
    fail(`${label} has an invalid byte-comparison disclosure`);
  }
  if (expected.kind === 'npm-lock') {
    if (document.bindings.length !== 1) {
      fail(`${label} must bind exactly one npm inventory`);
    }
    validateBinding(
      document.bindings[0],
      {
        kind: 'npm-lock-inventory',
        path: 'npm-lock-inventory.json',
        sha256: phase.seals.npmInventorySha256,
      },
      `${label}.bindings[0]`,
    );
    return;
  }
  const isGoSum = expected.logicalPath === 'backend/go.sum';
  if (document.bindings.length !== (isGoSum ? 1 : 0)) {
    fail(`${label} misstates the Go validation authority`);
  }
  if (isGoSum) {
    validateBinding(
      document.bindings[0],
      {
        kind: 'go-validation-go-sum',
        path: 'validation/go-cache.json',
        sha256: phase.seals.goValidationSha256,
      },
      `${label}.bindings[0]`,
    );
  }
}

function expectedAuthorities() {
  return Object.freeze([
    ...NPM_AUTHORITIES.map((authority) =>
      Object.freeze({
        kind: 'npm-lock',
        logicalOwner: authority.logicalOwner,
        logicalPath: authority.logicalPath,
        scope:
          authority.logicalOwner === 'product'
            ? 'preparation-and-accepted-product'
            : authority.logicalOwner === 'harness'
              ? 'accepted-harness'
              : 'fixed-oracle',
        frozenPath: authority.frozenPath,
      }),
    ),
    Object.freeze({
      kind: 'go-file',
      logicalOwner: 'product',
      logicalPath: 'backend/go.mod',
      scope: 'preparation-and-accepted-product',
      frozenPath: 'go/backend/go.mod',
    }),
    Object.freeze({
      kind: 'go-file',
      logicalOwner: 'product',
      logicalPath: 'backend/go.sum',
      scope: 'preparation-and-accepted-product',
      frozenPath: 'go/backend/go.sum',
    }),
    Object.freeze({
      kind: 'uv-lock',
      logicalOwner: 'product',
      logicalPath: 'updater/uv.lock',
      scope: 'preparation-and-accepted-product',
      frozenPath: null,
    }),
    ...QUERY_GO_MODULE_LOCK_PATHS.map((logicalPath) =>
      Object.freeze({
        kind: 'query-go-module-lock',
        logicalOwner: 'product',
        logicalPath,
        scope: 'accepted-product-only',
        frozenPath: null,
      }),
    ),
  ]);
}

function validatePhaseShape(phase, expectedName) {
  const document = exactObject(
    phase,
    [
      'schemaVersion',
      'phase',
      'revisions',
      'counts',
      'authorities',
      'seals',
      'authoritySetSha256',
    ],
    `${expectedName} cache compatibility phase`,
  );
  if (document.schemaVersion !== 1 || document.phase !== expectedName) {
    fail(`${expectedName} cache compatibility phase identity is invalid`);
  }
  exactObject(
    document.revisions,
    [
      'preparedFromRevision',
      'productRevision',
      'harnessRevision',
      'oracleRevision',
    ],
    `${expectedName} revisions`,
  );
  for (const [name, revision] of Object.entries(document.revisions)) {
    exactObjectId(revision, `${expectedName} ${name}`);
  }
  exactObject(
    document.counts,
    [
      'authorities',
      'npmLocks',
      'productLocks',
      'goFiles',
      'queryModuleLocks',
      'uvLocks',
    ],
    `${expectedName} counts`,
  );
  if (!isDeepStrictEqual(document.counts, COUNTS)) {
    fail(`${expectedName} authority counts are not exact`);
  }
  if (
    !Array.isArray(document.authorities) ||
    document.authorities.length !== CACHE_AUTHORITY_COUNT
  ) {
    fail(`${expectedName} authority set must contain exactly 18 records`);
  }
  exactObject(
    document.seals,
    [
      'cacheManifestSha256',
      'cacheRootSha256',
      'npmInventorySha256',
      'goValidationSha256',
      'goModuleInventorySha256',
      'queryManifestSha256',
      'uvValidationSha256',
      'uvClosurePlanSha256',
    ],
    `${expectedName} seals`,
  );
  for (const [name, identity] of Object.entries(document.seals)) {
    digest(identity, `${expectedName} seals.${name}`);
  }
  const expected = expectedAuthorities();
  document.authorities.forEach((authority, index) => {
    validateAuthorityRecord(authority, expected[index], document, index);
  });
  digest(document.authoritySetSha256, `${expectedName} authoritySetSha256`);
  if (document.authoritySetSha256 !== phaseDigest(document)) {
    fail(`${expectedName} authority-set digest is inconsistent`);
  }
  return document;
}

export async function verifyCacheCompatibilityPhase({
  input,
  cacheAttestation,
  phase,
}) {
  if (!PHASES.includes(phase)) {
    fail(`cache compatibility phase must be one of ${PHASES.join(', ')}`);
  }
  const root = requireCanonicalPath(cacheAttestation?.root, {
    label: 'cache compatibility root',
    type: 'directory',
  });
  const manifest = cacheAttestation?.manifest;
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    fail('cache compatibility requires the admitted frozen cache manifest');
  }
  digest(cacheAttestation.digest, 'cache manifest digest');
  digest(cacheAttestation.rootSeal, 'cache root seal');
  const preparedFromRevision = exactObjectId(
    cacheAttestation.preparedFromRevision ??
      manifest.productCandidate?.revision,
    'cache preparedFromRevision',
  );
  if (manifest.productCandidate?.revision !== preparedFromRevision) {
    fail('cache manifest preparation revision is inconsistent');
  }
  exactObjectId(input.product.revision, 'accepted product revision');
  exactObjectId(input.harness.revision, 'accepted harness revision');
  exactObjectId(input.oracle.revision, 'fixed oracle revision');
  exactPackageLockSets(input, preparedFromRevision);

  const lockClosure = exactObject(
    manifest.supplemental?.lockClosure,
    ['integrityCount', 'inventory', 'locks', 'pairCount', 'urlCount'],
    'cache manifest lock closure',
  );
  if (!Array.isArray(lockClosure.locks)) {
    fail('cache manifest lock closure locks must be an array');
  }
  const inventoryReference = readFrozenReference(
    root,
    lockClosure.inventory,
    'npm lock inventory',
    { canonical: true },
  );
  validateNpmInventory({
    inventory: inventoryReference.document,
    manifestLocks: lockClosure.locks,
    preparedFromRevision,
    oracleRevision: input.oracle.revision,
  });
  if (
    lockClosure.pairCount !== inventoryReference.document.pairCount ||
    lockClosure.integrityCount !== inventoryReference.document.integrityCount ||
    lockClosure.urlCount !== inventoryReference.document.urlCount
  ) {
    fail('cache manifest and npm inventory aggregate counts differ');
  }

  const authorities = npmAuthorities({
    input,
    root,
    manifestLocks: lockClosure.locks,
    inventory: inventoryReference.document,
    inventorySha256: inventoryReference.file.sha256,
    preparedFromRevision,
  });
  const goAuthorities = validateGoAuthority({
    input,
    root,
    preparedFromRevision,
    validationReference: manifest.caches?.goModule?.validation,
    startIndex: authorities.length,
  });
  authorities.push(...goAuthorities);
  const uvValidationReference = manifest.caches?.uv?.validation;
  const uvPlanReference = manifest.caches?.uv?.closurePlan;
  authorities.push(
    validateUvAuthority({
      input,
      root,
      preparedFromRevision,
      validationReference: uvValidationReference,
      planReference: uvPlanReference,
      index: authorities.length,
    }),
  );
  const queryModules = validateQueryModuleAuthorities({
    input,
    manifest,
    root,
    startIndex: authorities.length,
  });
  authorities.push(...queryModules.authorities);
  if (
    authorities.length !== CACHE_AUTHORITY_COUNT ||
    authorities.some((authority, index) => authority.index !== index)
  ) {
    fail('cache authority set is missing, added, or reordered');
  }

  const goValidation = readFrozenRegularFile(
    root,
    manifest.caches.goModule.validation.path,
    'Go validation seal',
    manifest.caches.goModule.validation.sha256,
  );
  const uvValidation = readFrozenRegularFile(
    root,
    manifest.caches.uv.validation.path,
    'uv validation seal',
    manifest.caches.uv.validation.sha256,
  );
  const uvPlan = readFrozenRegularFile(
    root,
    manifest.caches.uv.closurePlan.path,
    'uv closure plan seal',
    manifest.caches.uv.closurePlan.sha256,
  );
  const document = {
    schemaVersion: 1,
    phase,
    revisions: {
      preparedFromRevision,
      productRevision: input.product.revision,
      harnessRevision: input.harness.revision,
      oracleRevision: input.oracle.revision,
    },
    counts: COUNTS,
    authorities: Object.freeze(authorities),
    seals: {
      cacheManifestSha256: cacheAttestation.digest,
      cacheRootSha256: cacheAttestation.rootSeal,
      npmInventorySha256: inventoryReference.file.sha256,
      goValidationSha256: goValidation.sha256,
      goModuleInventorySha256: queryModules.goModuleInventorySha256,
      queryManifestSha256: queryModules.queryManifestSha256,
      uvValidationSha256: uvValidation.sha256,
      uvClosurePlanSha256: uvPlan.sha256,
    },
  };
  document.authoritySetSha256 = phaseDigest(document);
  return Object.freeze(document);
}

export async function attestCacheCompatibilityPhase(arguments_) {
  requireInputCacheAttestation(
    arguments_.cacheAttestation,
    arguments_.input,
  );
  return verifyCacheCompatibilityPhase(arguments_);
}

export function createCacheCompatibilityEnvelope({
  preAdmission,
  postCleanup,
}) {
  const before = validatePhaseShape(preAdmission, 'preAdmission');
  const after = validatePhaseShape(postCleanup, 'postCleanup');
  if (
    !isDeepStrictEqual(before.revisions, after.revisions) ||
    !isDeepStrictEqual(before.counts, after.counts) ||
    !isDeepStrictEqual(before.authorities, after.authorities) ||
    !isDeepStrictEqual(before.seals, after.seals)
  ) {
    fail('post-cleanup cache compatibility differs from pre-admission');
  }
  return Object.freeze({
    schemaVersion: 1,
    kind: 'bgmss-cache-compatibility-evidence-v1',
    revisions: before.revisions,
    counts: before.counts,
    preAdmission: before,
    postCleanup: after,
  });
}

export function cacheCompatibilityResultIdentity({
  envelopePath,
  evidenceSha256,
  envelope,
}) {
  assertSafeRelativePath(
    envelopePath,
    'cache compatibility evidence path',
  );
  digest(evidenceSha256, 'cache compatibility evidenceSha256');
  const document = exactObject(
    envelope,
    [
      'schemaVersion',
      'kind',
      'revisions',
      'counts',
      'preAdmission',
      'postCleanup',
    ],
    'cache compatibility envelope',
  );
  if (
    document.schemaVersion !== 1 ||
    document.kind !== 'bgmss-cache-compatibility-evidence-v1'
  ) {
    fail('cache compatibility envelope identity is invalid');
  }
  const before = validatePhaseShape(document.preAdmission, 'preAdmission');
  const after = validatePhaseShape(document.postCleanup, 'postCleanup');
  createCacheCompatibilityEnvelope({
    preAdmission: before,
    postCleanup: after,
  });
  if (
    !isDeepStrictEqual(document.revisions, before.revisions) ||
    !isDeepStrictEqual(document.counts, before.counts)
  ) {
    fail('cache compatibility envelope summary differs from its phases');
  }
  const canonicalEvidenceSha256 = sha256Bytes(
    Buffer.from(canonicalJson(document), 'utf8'),
  );
  if (evidenceSha256 !== canonicalEvidenceSha256) {
    fail('cache compatibility evidence file digest differs from the envelope');
  }
  return Object.freeze({
    schemaVersion: 1,
    ...document.revisions,
    ...document.counts,
    cacheManifestSha256: before.seals.cacheManifestSha256,
    cacheRootSha256: before.seals.cacheRootSha256,
    evidencePath: envelopePath,
    evidenceSha256,
    preAdmissionAuthoritySetSha256: before.authoritySetSha256,
    postCleanupAuthoritySetSha256: after.authoritySetSha256,
  });
}
