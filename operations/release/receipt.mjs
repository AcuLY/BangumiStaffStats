import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

import {
  canonicalJson,
  canonicalJsonDigest,
  deepFreeze,
} from '../lib/canonical-json.mjs';
import {
  assertGitOid,
  assertSha256,
  sha256,
} from '../lib/digest.mjs';
import { assertEvidenceSafe } from '../lib/evidence-policy.mjs';
import {
  compileStrictSchema,
  parseAndValidateCanonicalJson,
} from '../lib/schema.mjs';
import {
  assertSafeRelativePath,
  requireCanonicalPath,
} from '../lib/path-policy.mjs';
import {
  decodeUtf8Strict,
  parseJsonStrict,
  readJsonStrict,
} from '../lib/strict-json.mjs';
import {
  ACCEPTANCE_LIFECYCLE_STATUS,
  ACCEPTANCE_RUNTIME_IMAGES,
  ACCEPTANCE_SELECTED_TARGET_ARGV,
  ACCEPTANCE_SELECTED_TARGET_TEST_NAMES,
  ACCEPTED_BUILD_DEFINITION_PATHS,
  ACCEPTED_CONTRACT_AUTHORITY_PATHS,
  ACCEPTED_DEVELOPMENT_PATH,
  ACCEPTED_DEVELOPMENT_SHA256,
  ACCEPTED_TOOLCHAIN_NAMES,
  APPLICATION_VERSION,
  BUILD_TOOLCHAIN,
  FROZEN_PRODUCT,
} from './constants.mjs';
import {
  assertProductHarnessDifferenceInventory,
  verifyProductHarnessDifference,
} from './product-harness-difference.mjs';

const SCHEMA_URL = new URL(
  '../schemas/release-accepted-development-v1.schema.json',
  import.meta.url,
);
const schema = readJsonStrict(SCHEMA_URL);
const validateSchema = compileStrictSchema(schema, {
  label: 'accepted development receipt schema',
});

const ROOT_ACCEPTANCE_SPEC =
  'openspec/specs/contracts-development-acceptance/spec.md';
const ARCHIVED_REFRESH_PROPOSAL =
  /^openspec\/changes\/archive\/[0-9]{4}-[0-9]{2}-[0-9]{2}-refresh-integrated-development-acceptance\/proposal\.md$/u;
const EXPECTED_UNEXECUTED_CELL_COUNT = 56;
const EXPECTED_SUPERVISOR_TEST_COUNT = 21;

const FIXED_ARGV = Object.freeze({
  offlineInstall: Object.freeze([
    'npm',
    'ci',
    '--ignore-scripts',
    '--omit=optional',
    '--offline',
    '--no-audit',
    '--no-fund',
  ]),
  runtimePrune: Object.freeze([
    'python',
    '-m',
    'unittest',
    '-v',
    'build.test_artifact.RuntimePruneTests',
  ]),
  supervisor: Object.freeze([
    'node',
    '--test',
    'contracts/acceptance/test/supervisor.test.mjs',
  ]),
  verifyPackage: Object.freeze([
    'node',
    'contracts/acceptance/bin/acceptance.mjs',
    'verify-package',
  ]),
});

const TOOLCHAIN_VERSIONS = Object.freeze({
  buildkit: BUILD_TOOLCHAIN.buildkitVersion,
  'docker-buildx': BUILD_TOOLCHAIN.buildxVersion,
  go: BUILD_TOOLCHAIN.goVersion.replace(/^go/u, ''),
  node: BUILD_TOOLCHAIN.nodeVersion,
  npm: BUILD_TOOLCHAIN.npmVersion,
  python: BUILD_TOOLCHAIN.pythonVersion,
  uv: BUILD_TOOLCHAIN.uvVersion,
});

function validateReceiptSchema(value, label) {
  // AJV's object-array uniqueness helper assumes Object.prototype methods.
  // Validate an ordinary canonical projection while retaining the
  // null-prototype strict-parser value as the receipt authority.
  validateSchema(JSON.parse(canonicalJson(value)), label);
  return value;
}

export class AcceptedDevelopmentError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'AcceptedDevelopmentError';
  }
}

function fail(message, cause) {
  throw new AcceptedDevelopmentError(message, cause ? { cause } : undefined);
}

function assertInjectedAuthority() {
  try {
    assertGitOid(FROZEN_PRODUCT.revision, 'final Product revision');
    assertGitOid(FROZEN_PRODUCT.tree, 'final Product tree');
    assertSha256(
      ACCEPTED_DEVELOPMENT_SHA256,
      'accepted-development canonical digest',
    );
  } catch (error) {
    fail('final accepted-development authority tokens have not been injected', error);
  }
}

function assertFixedSequence(actual, expected, label) {
  if (
    actual.length !== expected.length ||
    actual.some((entry, index) => entry !== expected[index])
  ) {
    fail(`${label} must retain its fixed inventory and order`);
  }
}

function assertCountedRun(run, {
  failed,
  format,
  outcome,
  runId,
  skipped,
  sourceRevision,
  runtimeConfigImageId,
}) {
  if (
    run.failed !== failed ||
    run.skipped !== skipped ||
    run.outcome !== outcome ||
    run.resultFormat !== format ||
    run.runId !== runId ||
    run.sourceRevision !== sourceRevision ||
    run.runtimeConfigImageId !== runtimeConfigImageId ||
    run.passed + run.failed + run.skipped !== run.total ||
    run.testNames.length !== run.total
  ) {
    fail('accepted test evidence counts, source, runtime, or outcome drifted');
  }
}

function assertCommandResult(result, {
  argv,
  runId,
  sourceRevision,
  runtimeConfigImageId,
}) {
  assertFixedSequence(result.argv, argv, 'accepted command arguments');
  if (
    result.runId !== runId ||
    result.sourceRevision !== sourceRevision ||
    result.runtimeConfigImageId !== runtimeConfigImageId
  ) {
    fail('accepted command evidence source or runtime attribution drifted');
  }
}

function assertRuntimeImage(actual, expected, expectedLayerCount, label) {
  for (const key of [
    'amd64ManifestDigest',
    'amd64ManifestSize',
    'architecture',
    'configDigest',
    'configImageId',
    'configSize',
    'os',
    'rootDigest',
    'rootSize',
    'transportReference',
  ]) {
    if (actual[key] !== expected[key]) {
      fail(`${label} runtime image ${key} drifted`);
    }
  }
  for (const key of ['nodeVersion', 'npmVersion', 'pythonVersion']) {
    if (Object.hasOwn(expected, key) && actual[key] !== expected[key]) {
      fail(`${label} runtime image ${key} drifted`);
    }
  }
  if (
    actual.layers.length !== expectedLayerCount ||
    actual.configDiffIds.length !== expectedLayerCount ||
    canonicalJson(actual.layers) !== canonicalJson(expected.layers) ||
    canonicalJson(actual.configDiffIds) !==
      canonicalJson(expected.configDiffIds) ||
    actual.repoDigests.length !== 1 ||
    actual.repoDigests[0] !== expected.transportReference
  ) {
    fail(`${label} runtime image graph or RepoDigest closure drifted`);
  }
}

function assertLifecycleAuthorities(authorities, archiveRevision) {
  const paths = authorities.map((entry) => entry.path);
  if (
    paths.length !== 2 ||
    !ARCHIVED_REFRESH_PROPOSAL.test(paths[0]) ||
    paths[1] !== ROOT_ACCEPTANCE_SPEC ||
    authorities.some((entry) => entry.revision !== archiveRevision)
  ) {
    fail('lifecycle authorities must bind the archived refresh and root spec');
  }
}

export function assertSelectedTargetArguments(argv) {
  assertFixedSequence(
    argv,
    ACCEPTANCE_SELECTED_TARGET_ARGV,
    'Harness selected-target arguments',
  );
}

function assertRemoteEvidenceClosure({
  actionsEvidence,
  archiveRevision,
  harnessEvidence,
  harnessRevision,
  productEvidence,
  productRevision,
  remoteEvidence,
}) {
  const attempts = remoteEvidence.supersededAttempts;
  const attemptRunIds = attempts.map((entry) => entry.runId);
  const acceptedRunIds = [productEvidence.runId, harnessEvidence.runId];
  if (
    new Set(attemptRunIds).size !== attemptRunIds.length ||
    attemptRunIds.some((runId) => acceptedRunIds.includes(runId)) ||
    attempts.some(
      (entry) =>
        entry.accepted !== false ||
        entry.sourceRevision === productRevision ||
        entry.sourceRevision === archiveRevision ||
        entry.runtimeConfigImageId !==
          ACCEPTANCE_RUNTIME_IMAGES.node.configImageId ||
        entry.status !== 'superseded-not-accepted' ||
        entry.log.path === entry.evidence.path,
    )
  ) {
    fail('superseded attempt identity, attribution, or non-acceptance drifted');
  }

  const bundle = remoteEvidence.evidenceBundle;
  assertFixedSequence(
    bundle.acceptedRunIds,
    acceptedRunIds,
    'accepted evidence-bundle run membership',
  );
  assertFixedSequence(
    bundle.supersededRunIds,
    attemptRunIds,
    'superseded evidence-bundle run membership',
  );

  const audit = remoteEvidence.audit;
  if (
    audit.productRevision !== productRevision ||
    audit.harnessRevision !== harnessRevision ||
    audit.archiveRevision !== archiveRevision ||
    audit.scope !== 'exact-product-harness-archive-evidence'
  ) {
    fail('acceptance audit scope or revision binding drifted');
  }

  const protectedState = remoteEvidence.protectedState;
  if (
    protectedState.projectionAlgorithm !==
      'canonical-protected-state-projection-v1' ||
    protectedState.beforeSemanticSha256 !==
      protectedState.afterSemanticSha256 ||
    protectedState.beforeRaw.path === protectedState.afterRaw.path ||
    protectedState.executedSealProgram.executed !== true ||
    protectedState.executedSealProgram.executionId !== harnessEvidence.runId
  ) {
    fail('protected-state projection, executed program, or semantic seal drifted');
  }

  const reviewedEvidence = new Set(audit.reviewedEvidenceDigests);
  const requiredEvidenceDigests = [
    bundle.sha256,
    actionsEvidence.log.sha256,
    productEvidence.runtimePrune.resultLog.sha256,
    harnessEvidence.verifyPackageBefore.log.sha256,
    harnessEvidence.offlineInstall.log.sha256,
    harnessEvidence.verifyPackageAfter.log.sha256,
    harnessEvidence.supervisor.resultLog.sha256,
    harnessEvidence.targeted.resultLog.sha256,
    remoteEvidence.formalMatrix.sha256,
    protectedState.beforeRaw.sha256,
    protectedState.afterRaw.sha256,
    ...attempts.flatMap((entry) => [
      entry.evidence.sha256,
      entry.log.sha256,
    ]),
  ];
  if (
    requiredEvidenceDigests.some((digest) => !reviewedEvidence.has(digest)) ||
    !audit.reviewedProgramDigests.includes(
      protectedState.executedSealProgram.sha256,
    )
  ) {
    fail('acceptance audit omits reviewed evidence or executed program identity');
  }
}

function assertFixedReceipt(value) {
  assertInjectedAuthority();
  const product = value.frozenProduct;
  const harnessRevision = value.acceptanceControl.implementationRevision;
  const harnessTree = value.acceptanceControl.implementationTree;
  const archiveRevision = value.acceptanceControl.archiveLifecycleCommit;

  if (
    value.schemaVersion !== 'operations-accepted-development-v1' ||
    value.lifecycleStatus !== ACCEPTANCE_LIFECYCLE_STATUS ||
    value.applicationVersion !== APPLICATION_VERSION ||
    product.revision !== FROZEN_PRODUCT.revision ||
    product.tree !== FROZEN_PRODUCT.tree ||
    value.actionsEvidence.headRevision !== product.revision ||
    value.actionsEvidence.headTree !== product.tree ||
    value.actionsEvidence.workflowAuthority.path !== '.github/workflows/ci.yml' ||
    value.actionsEvidence.workflowAuthority.revision !== product.revision ||
    value.acceptanceControl.formalResultPresent !== false ||
    value.acceptanceControl.formalVerdictPresent !== false ||
    harnessRevision === product.revision ||
    archiveRevision === product.revision ||
    archiveRevision === harnessRevision ||
    value.priorDevelopmentArtifacts.status !==
      'not-materialized-for-authorized-closure' ||
    value.priorDevelopmentArtifacts.componentOrCompatibilityDigestsPresent !==
      false
  ) {
    fail('accepted development receipt disagrees with fixed Operations authority');
  }

  const runUrlSuffix = `/actions/runs/${value.actionsEvidence.runId}`;
  if (
    !value.actionsEvidence.runUrl.endsWith(runUrlSuffix) ||
    value.actionsEvidence.jobUrl !==
      `${value.actionsEvidence.runUrl}/job/${value.actionsEvidence.jobId}`
  ) {
    fail('Development Actions run/job identities disagree');
  }

  const difference = assertProductHarnessDifferenceInventory(
    value.acceptanceControl.productHarnessDifference,
  );
  if (
    difference.productRevision !== product.revision ||
    difference.harnessRevision !== harnessRevision
  ) {
    fail('Product/Harness difference inventory names another source identity');
  }

  const productArchive = value.sourceArchives.product;
  const harnessArchive = value.sourceArchives.harness;
  if (
    productArchive.revision !== product.revision ||
    productArchive.tree !== product.tree ||
    harnessArchive.revision !== harnessRevision ||
    harnessArchive.tree !== harnessTree ||
    productArchive.archiveSha256 === harnessArchive.archiveSha256 ||
    productArchive.inventorySha256 === harnessArchive.inventorySha256
  ) {
    fail('Product and Harness source archive identities are mixed or relabelled');
  }

  assertFixedSequence(
    value.authorities.buildDefinitions.map((entry) => entry.path),
    ACCEPTED_BUILD_DEFINITION_PATHS,
    'build definition authorities',
  );
  assertFixedSequence(
    value.authorities.contracts.map((entry) => entry.path),
    ACCEPTED_CONTRACT_AUTHORITY_PATHS,
    'contract authorities',
  );
  assertFixedSequence(
    value.authorities.toolchains.map((entry) => entry.name),
    ACCEPTED_TOOLCHAIN_NAMES,
    'toolchain authorities',
  );
  for (const entry of [
    ...value.authorities.buildDefinitions,
    ...value.authorities.contracts,
    value.authorities.versionFile,
  ]) {
    if (entry.revision !== product.revision) {
      fail(`Product authority is attributed to another revision: ${entry.path}`);
    }
  }
  if (
    value.authorities.versionFile.path !== 'VERSION' ||
    value.authorities.toolchains.some(
      (entry) => entry.version !== TOOLCHAIN_VERSIONS[entry.name],
    ) ||
    !value.authorities.toolchains
      .find((entry) => entry.name === 'node')
      .identity.includes(ACCEPTANCE_RUNTIME_IMAGES.node.rootDigest) ||
    !value.authorities.toolchains
      .find((entry) => entry.name === 'python')
      .identity.includes(ACCEPTANCE_RUNTIME_IMAGES.python.rootDigest)
  ) {
    fail('Product VERSION or toolchain authority drifted');
  }
  assertLifecycleAuthorities(value.authorities.lifecycle, archiveRevision);

  assertRuntimeImage(
    value.remoteEvidence.runtimes.node,
    ACCEPTANCE_RUNTIME_IMAGES.node,
    5,
    'Node',
  );
  assertRuntimeImage(
    value.remoteEvidence.runtimes.python,
    ACCEPTANCE_RUNTIME_IMAGES.python,
    4,
    'Python',
  );
  if (
    value.remoteEvidence.formalMatrix.cellCount !==
      EXPECTED_UNEXECUTED_CELL_COUNT ||
    value.remoteEvidence.formalMatrix.unexecutedCells.length !==
      EXPECTED_UNEXECUTED_CELL_COUNT
  ) {
    fail('protected-state or unexecuted formal-cell closure drifted');
  }

  const productEvidence = value.testEvidence.product;
  const harnessEvidence = value.testEvidence.harness;
  if (
    productEvidence.sourceRevision !== product.revision ||
    harnessEvidence.sourceRevision !== harnessRevision ||
    productEvidence.runId === harnessEvidence.runId
  ) {
    fail('Product/Harness test evidence is attributed to another source');
  }
  assertFixedSequence(
    productEvidence.runtimePrune.argv,
    FIXED_ARGV.runtimePrune,
    'Product RuntimePruneTests arguments',
  );
  assertCountedRun(productEvidence.runtimePrune, {
    failed: 0,
    format: 'unittest-log',
    outcome: 'passed',
    runId: productEvidence.runId,
    runtimeConfigImageId: ACCEPTANCE_RUNTIME_IMAGES.python.configImageId,
    skipped: 0,
    sourceRevision: product.revision,
  });

  assertCommandResult(harnessEvidence.verifyPackageBefore, {
    argv: FIXED_ARGV.verifyPackage,
    runId: harnessEvidence.runId,
    runtimeConfigImageId: ACCEPTANCE_RUNTIME_IMAGES.node.configImageId,
    sourceRevision: harnessRevision,
  });
  assertCommandResult(harnessEvidence.offlineInstall, {
    argv: FIXED_ARGV.offlineInstall,
    runId: harnessEvidence.runId,
    runtimeConfigImageId: ACCEPTANCE_RUNTIME_IMAGES.node.configImageId,
    sourceRevision: harnessRevision,
  });
  assertCommandResult(harnessEvidence.verifyPackageAfter, {
    argv: FIXED_ARGV.verifyPackage,
    runId: harnessEvidence.runId,
    runtimeConfigImageId: ACCEPTANCE_RUNTIME_IMAGES.node.configImageId,
    sourceRevision: harnessRevision,
  });
  assertFixedSequence(
    harnessEvidence.supervisor.argv,
    FIXED_ARGV.supervisor,
    'Harness supervisor arguments',
  );
  assertCountedRun(harnessEvidence.supervisor, {
    failed: 0,
    format: 'tap',
    outcome: 'passed',
    runId: harnessEvidence.runId,
    runtimeConfigImageId: ACCEPTANCE_RUNTIME_IMAGES.node.configImageId,
    skipped: 0,
    sourceRevision: harnessRevision,
  });
  if (
    harnessEvidence.supervisor.total !== EXPECTED_SUPERVISOR_TEST_COUNT ||
    harnessEvidence.supervisor.passed !== EXPECTED_SUPERVISOR_TEST_COUNT
  ) {
    fail('Harness supervisor evidence must retain exact 21/21 success');
  }

  assertSelectedTargetArguments(harnessEvidence.targeted.argv);
  assertCountedRun(harnessEvidence.targeted, {
    failed: 0,
    format: 'tap',
    outcome: 'passed',
    runId: harnessEvidence.runId,
    runtimeConfigImageId: ACCEPTANCE_RUNTIME_IMAGES.node.configImageId,
    skipped: 0,
    sourceRevision: harnessRevision,
  });
  assertFixedSequence(
    harnessEvidence.targeted.testNames,
    ACCEPTANCE_SELECTED_TARGET_TEST_NAMES,
    'Harness selected-target test names',
  );
  if (
    harnessEvidence.targeted.total !==
      ACCEPTANCE_SELECTED_TARGET_TEST_NAMES.length ||
    harnessEvidence.targeted.passed !==
      ACCEPTANCE_SELECTED_TARGET_TEST_NAMES.length
  ) {
    fail('Harness selected-target evidence must retain exact all-green closure');
  }
  assertRemoteEvidenceClosure({
    actionsEvidence: value.actionsEvidence,
    archiveRevision,
    harnessEvidence,
    harnessRevision,
    productEvidence,
    productRevision: product.revision,
    remoteEvidence: value.remoteEvidence,
  });

  return deepFreeze(value);
}

export function parseAcceptedDevelopment(source) {
  const value = parseAndValidateCanonicalJson(source, validateReceiptSchema, {
    label: 'accepted development receipt',
    policy: assertEvidenceSafe,
  });
  return assertFixedReceipt(value);
}

export function readAcceptedDevelopment(filePath = ACCEPTED_DEVELOPMENT_PATH) {
  assertInjectedAuthority();
  const bytes = fs.readFileSync(filePath);
  const digest = sha256(bytes);
  if (digest !== assertSha256(ACCEPTED_DEVELOPMENT_SHA256)) {
    fail('accepted development receipt bytes differ from the fixed canonical digest');
  }
  const value = parseAcceptedDevelopment(decodeUtf8Strict(bytes, filePath));
  return deepFreeze({
    digest,
    path: filePath,
    size: bytes.byteLength,
    value,
  });
}

async function verifyRepositoryFile(git, expected) {
  const actual = await git.fileAtRevision(expected.revision, expected.path);
  for (const key of ['gitBlob', 'mode', 'path', 'revision', 'sha256']) {
    if (actual[key] !== expected[key]) {
      fail(`repository authority drifted: ${expected.path} (${key})`);
    }
  }
}

const SOURCE_PREFIX = 'source/';
const SOURCE_ARCHIVE_FORMAT = 'git-archive-source-prefixed-tar-v1';
const SOURCE_INVENTORY_SCHEMA =
  'operations-source-archive-member-inventory-v1';
const TAR_BLOCK_SIZE = 512;
const MAX_SOURCE_ARCHIVE_BYTES = 8 * 1024 * 1024 * 1024;
const MAX_SOURCE_ARCHIVE_MEMBERS = 100_000;

function parseSourceTreeListing(output) {
  if (typeof output !== 'string' || !output.endsWith('\0')) {
    fail('Git source inventory must be non-empty NUL-terminated text');
  }
  const records = output.split('\0');
  records.pop();
  const entries = [];
  const paths = new Set();
  for (const record of records) {
    const match =
      /^(040000) tree ([0-9a-f]{40})\t(.+)$|^(100644|100755) blob ([0-9a-f]{40})\t(.+)$/u.exec(
        record,
      );
    if (!match) {
      fail(
        'Git source inventory contains a non-tree, non-regular, or malformed entry',
      );
    }
    const directory = match[1] === '040000';
    const mode = directory ? match[1] : match[4];
    const gitObject = directory ? match[2] : match[5];
    const rawPath = directory ? match[3] : match[6];
    const gitPath = assertSafeRelativePath(
      rawPath,
      'Git source inventory path',
    );
    const memberPath = assertSafeRelativePath(
      `${SOURCE_PREFIX}${gitPath}`,
      'prefixed source inventory path',
    );
    if (paths.has(memberPath)) {
      fail('Git source inventory contains a duplicate path');
    }
    paths.add(memberPath);
    entries.push({
      gitObject,
      mode,
      path: memberPath,
      type: directory ? 'directory' : 'file',
    });
  }
  if (entries.length === 0) fail('Git source inventory must not be empty');
  entries.push({
    gitObject: null,
    mode: '040000',
    path: SOURCE_PREFIX.slice(0, -1),
    type: 'directory',
  });
  entries.sort((left, right) => left.path.localeCompare(right.path, 'en'));
  for (let index = 1; index < entries.length; index += 1) {
    if (
      entries[index - 1].path.localeCompare(entries[index].path, 'en') >= 0
    ) {
      fail('Git source inventory is not in fixed path order');
    }
  }
  return entries;
}

async function computeGitSourceInventory({
  git,
  revision,
  tree,
}) {
  if (
    !git ||
    typeof git.blobSha256 !== 'function' ||
    typeof git.text !== 'function' ||
    typeof git.tree !== 'function'
  ) {
    throw new TypeError('source inventory recomputation requires a GitRepository');
  }
  const resolvedTree = await git.tree(revision);
  if (resolvedTree !== tree) {
    fail(`source inventory tree drifted for ${revision}`);
  }
  const raw = await git.text([
    'ls-tree',
    '-r',
    '-t',
    '-z',
    '--full-tree',
    revision,
    '--',
  ]);
  const rawEntries = parseSourceTreeListing(raw);
  const blobs = new Map();
  for (const { gitObject, type } of rawEntries) {
    if (type !== 'file' || blobs.has(gitObject)) continue;
    const sizeText = (
      await git.text(['cat-file', '-s', gitObject])
    ).trim();
    if (!/^(?:0|[1-9][0-9]{0,15})$/u.test(sizeText)) {
      fail(`Git blob size is invalid for ${gitObject}`);
    }
    const size = Number(sizeText);
    if (!Number.isSafeInteger(size)) {
      fail(`Git blob size is outside the safe range for ${gitObject}`);
    }
    blobs.set(gitObject, {
      sha256: assertSha256(
        await git.blobSha256(gitObject),
        `Git blob ${gitObject} source digest`,
      ),
      size,
    });
  }
  const entries = rawEntries.map(({ gitObject, mode, path, type }) => {
    const blob = type === 'file' ? blobs.get(gitObject) : undefined;
    return {
      mode,
      path,
      sha256: blob?.sha256 ?? null,
      size: blob?.size ?? 0,
      type,
    };
  });
  const authority = {
    entries,
    memberPrefix: SOURCE_PREFIX,
    revision,
    schemaVersion: SOURCE_INVENTORY_SCHEMA,
    tree,
  };
  const inventoryTotalBytes = entries.reduce(
    (total, entry) => total + entry.size,
    0,
  );
  if (!Number.isSafeInteger(inventoryTotalBytes)) {
    fail(`source inventory byte total is outside the safe range for ${revision}`);
  }
  return deepFreeze({
    authority,
    inventoryEntryCount: entries.length,
    inventorySha256: canonicalJsonDigest(authority),
    inventoryTotalBytes,
  });
}

export async function recomputeGitSourceInventory(options) {
  const inventory = await computeGitSourceInventory(options);
  return deepFreeze({
    inventoryEntryCount: inventory.inventoryEntryCount,
    inventorySha256: inventory.inventorySha256,
    inventoryTotalBytes: inventory.inventoryTotalBytes,
  });
}

function parseTarText(header, start, length, label) {
  const field = header.subarray(start, start + length);
  const nul = field.indexOf(0);
  const bytes = nul < 0 ? field : field.subarray(0, nul);
  if (bytes.some((value) => value < 0x20 || value > 0x7e)) {
    fail(`source archive ${label} contains non-ASCII text`);
  }
  return bytes.toString('ascii');
}

function parseTarOctal(header, start, length, label) {
  const text = parseTarText(header, start, length, label).trim();
  if (!/^[0-7]+$/u.test(text)) {
    fail(`source archive ${label} is not canonical octal`);
  }
  const value = Number.parseInt(text, 8);
  if (!Number.isSafeInteger(value)) {
    fail(`source archive ${label} is outside the safe integer range`);
  }
  return value;
}

function tarHeaderChecksum(header) {
  let total = 0;
  for (let index = 0; index < TAR_BLOCK_SIZE; index += 1) {
    total += index >= 148 && index < 156 ? 0x20 : header[index];
  }
  return total;
}

function readDescriptorRegion(descriptor, offset, size, label) {
  const bytes = Buffer.alloc(size);
  let read = 0;
  while (read < size) {
    const count = fs.readSync(
      descriptor,
      bytes,
      read,
      size - read,
      offset + read,
    );
    if (count === 0) fail(`${label} ended before its declared size`);
    read += count;
  }
  return bytes;
}

function parsePaxRecords(bytes, label) {
  const records = new Map();
  let offset = 0;
  while (offset < bytes.length) {
    const space = bytes.indexOf(0x20, offset);
    if (space < 0) fail(`${label} lacks a record length separator`);
    const lengthText = bytes.subarray(offset, space).toString('ascii');
    if (!/^[1-9][0-9]{0,9}$/u.test(lengthText)) {
      fail(`${label} record length is invalid`);
    }
    const length = Number(lengthText);
    const end = offset + length;
    if (end > bytes.length || bytes[end - 1] !== 0x0a) {
      fail(`${label} record exceeds its payload`);
    }
    const payload = bytes.subarray(space + 1, end - 1);
    const equals = payload.indexOf(0x3d);
    if (equals < 1) fail(`${label} record lacks a key/value separator`);
    const key = payload.subarray(0, equals).toString('ascii');
    const value = decodeUtf8Strict(
      payload.subarray(equals + 1),
      `${label} ${key}`,
    );
    if (!/^[a-z][a-z0-9._-]{0,63}$/u.test(key) || records.has(key)) {
      fail(`${label} contains an invalid or duplicate key`);
    }
    records.set(key, value);
    offset = end;
  }
  return records;
}

function hashDescriptorRegion(descriptor, start, size, label) {
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  let offset = 0;
  while (offset < size) {
    const count = fs.readSync(
      descriptor,
      buffer,
      0,
      Math.min(buffer.length, size - offset),
      start + offset,
    );
    if (count === 0) fail(`${label} ended while hashing`);
    hash.update(buffer.subarray(0, count));
    offset += count;
  }
  return `sha256:${hash.digest('hex')}`;
}

function hashDescriptor(descriptor, size, label) {
  return hashDescriptorRegion(descriptor, 0, size, label);
}

function sameArchiveIdentity(actual, expected) {
  return (
    actual.isFile() &&
    !actual.isSymbolicLink() &&
    actual.dev === expected.dev &&
    actual.ino === expected.ino &&
    actual.nlink === expected.nlink &&
    actual.mode === expected.mode &&
    actual.size === expected.size &&
    actual.mtimeNs === expected.mtimeNs &&
    actual.ctimeNs === expected.ctimeNs
  );
}

function inspectSourceArchive({
  archivePath,
  expectedInventory,
  initialIdentity,
  revision,
}) {
  const noFollow = fs.constants.O_NOFOLLOW;
  if (!Number.isInteger(noFollow)) {
    fail('source archive verification requires O_NOFOLLOW');
  }
  const descriptor = fs.openSync(
    archivePath,
    fs.constants.O_RDONLY | noFollow,
  );
  try {
    const identity = fs.fstatSync(descriptor, { bigint: true });
    if (
      !identity.isFile() ||
      identity.isSymbolicLink() ||
      identity.nlink !== 1n ||
      identity.dev !== initialIdentity.dev ||
      identity.ino !== initialIdentity.ino ||
      identity.size < BigInt(TAR_BLOCK_SIZE * 2) ||
      identity.size > BigInt(MAX_SOURCE_ARCHIVE_BYTES)
    ) {
      fail('source archive output identity or size is outside the closed bound');
    }
    const archiveSize = Number(identity.size);
    if (!Number.isSafeInteger(archiveSize)) {
      fail('source archive size is outside the safe integer range');
    }
    const archiveSha256 = hashDescriptor(
      descriptor,
      archiveSize,
      `source archive ${revision}`,
    );
    const members = [];
    const seen = new Set();
    let globalComment;
    let pendingPax;
    let offset = 0;
    let zeroBlocks = 0;
    while (offset < archiveSize) {
      const header = readDescriptorRegion(
        descriptor,
        offset,
        TAR_BLOCK_SIZE,
        'source archive header',
      );
      offset += TAR_BLOCK_SIZE;
      if (header.every((byte) => byte === 0)) {
        zeroBlocks += 1;
        if (zeroBlocks === 2) break;
        continue;
      }
      if (zeroBlocks !== 0) {
        fail('source archive contains an isolated zero block');
      }
      if (
        parseTarOctal(header, 148, 8, 'header checksum') !==
        tarHeaderChecksum(header)
      ) {
        fail('source archive header checksum drifted');
      }
      if (
        parseTarText(header, 257, 6, 'magic') !== 'ustar' ||
        parseTarText(header, 263, 2, 'version') !== '00'
      ) {
        fail('source archive is not the Git USTAR/PAX form');
      }
      const name = parseTarText(header, 0, 100, 'member name');
      const prefix = parseTarText(header, 345, 155, 'member prefix');
      let memberPath = prefix ? `${prefix}/${name}` : name;
      const mode = parseTarOctal(header, 100, 8, 'member mode');
      const size = parseTarOctal(header, 124, 12, 'member size');
      const typeFlag = header[156];
      const dataOffset = offset;
      const paddedSize = Math.ceil(size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
      if (
        !Number.isSafeInteger(paddedSize) ||
        dataOffset + paddedSize > archiveSize
      ) {
        fail(`source archive member exceeds its boundary: ${memberPath}`);
      }
      if (typeFlag === 0x67 || typeFlag === 0x78) {
        if (size > 1024 * 1024) {
          fail('source archive PAX metadata exceeds the closed bound');
        }
        const pax = parsePaxRecords(
          readDescriptorRegion(
            descriptor,
            dataOffset,
            size,
            `source archive PAX header ${memberPath}`,
          ),
          `source archive PAX header ${memberPath}`,
        );
        if (typeFlag === 0x67) {
          if (
            pax.size !== 1 ||
            !pax.has('comment') ||
            globalComment !== undefined
          ) {
            fail('source archive global PAX authority is not closed');
          }
          globalComment = pax.get('comment');
        } else {
          if (pax.size !== 1 || !pax.has('path') || pendingPax !== undefined) {
            fail('source archive member PAX authority is not closed');
          }
          pendingPax = pax;
        }
        offset += paddedSize;
        continue;
      }
      if (pendingPax !== undefined) {
        memberPath = pendingPax.get('path');
        pendingPax = undefined;
      }
      const directory = typeFlag === 0x35;
      const regular = typeFlag === 0 || typeFlag === 0x30;
      if (!directory && !regular) {
        fail(`source archive member type is not admitted: ${memberPath}`);
      }
      if (directory) {
        if (!memberPath.endsWith('/') || size !== 0) {
          fail(`source archive directory is malformed: ${memberPath}`);
        }
        memberPath = memberPath.slice(0, -1);
      }
      const safePath = assertSafeRelativePath(
        memberPath,
        'source archive member path',
      );
      if (
        (safePath !== 'source' && !safePath.startsWith(SOURCE_PREFIX)) ||
        seen.has(safePath)
      ) {
        fail(`source archive member prefix or uniqueness drifted: ${safePath}`);
      }
      seen.add(safePath);
      members.push({
        mode,
        path: safePath,
        sha256:
          regular
            ? hashDescriptorRegion(
                descriptor,
                dataOffset,
                size,
                `source archive member ${safePath}`,
              )
            : null,
        size,
        type: directory ? 'directory' : 'file',
      });
      if (members.length > MAX_SOURCE_ARCHIVE_MEMBERS) {
        fail('source archive member count exceeds the closed bound');
      }
      offset += paddedSize;
    }
    if (
      zeroBlocks !== 2 ||
      pendingPax !== undefined ||
      globalComment !== revision
    ) {
      fail('source archive termination or embedded revision authority drifted');
    }
    while (offset < archiveSize) {
      const size = Math.min(TAR_BLOCK_SIZE, archiveSize - offset);
      const trailing = readDescriptorRegion(
        descriptor,
        offset,
        size,
        'source archive trailing bytes',
      );
      if (trailing.some((byte) => byte !== 0)) {
        fail('source archive contains non-zero trailing bytes');
      }
      offset += size;
    }
    members.sort((left, right) => left.path.localeCompare(right.path, 'en'));
    const expected = expectedInventory.authority.entries;
    if (members.length !== expected.length) {
      fail('source archive member inventory count drifted');
    }
    for (let index = 0; index < expected.length; index += 1) {
      const actual = members[index];
      const wanted = expected[index];
      const executable =
        actual.type === 'file' && (actual.mode & 0o111) !== 0;
      if (
        actual.path !== wanted.path ||
        actual.type !== wanted.type ||
        actual.size !== wanted.size ||
        actual.sha256 !== wanted.sha256 ||
        (actual.type === 'directory' && (actual.mode & 0o111) === 0) ||
        (
          actual.type === 'file' &&
          executable !== (wanted.mode === '100755')
        )
      ) {
        fail(`source archive member inventory drifted at ${wanted.path}`);
      }
    }
    const finalIdentity = fs.fstatSync(descriptor, { bigint: true });
    const pathIdentity = fs.lstatSync(archivePath, { bigint: true });
    if (
      !sameArchiveIdentity(finalIdentity, identity) ||
      !sameArchiveIdentity(pathIdentity, identity)
    ) {
      fail('source archive changed during same-file verification');
    }
    return deepFreeze({
      archiveMode: `0${Number(identity.mode & 0o777n)
        .toString(8)
        .padStart(3, '0')}`,
      archiveSha256,
      archiveSize,
    });
  } finally {
    fs.closeSync(descriptor);
  }
}

export async function recomputeGitSourceArchiveIdentity({
  archiveMode = '0600',
  git,
  outputRoot = git?.runRoot,
  revision,
  tree,
}) {
  if (!git || typeof git.command !== 'function') {
    throw new TypeError('source archive recomputation requires a GitRepository');
  }
  if (!/^0(?:400|440|444|600|640|644)$/u.test(archiveMode)) {
    throw new TypeError('source archive outer mode is outside the closed set');
  }
  const root = requireCanonicalPath(outputRoot, {
    label: 'source archive run root',
    type: 'directory',
  });
  const inventory = await computeGitSourceInventory({
    git,
    revision,
    tree,
  });
  const archiveDirectory = fs.mkdtempSync(
    path.join(root, 'source-archive-'),
  );
  const archivePath = path.join(archiveDirectory, 'source.tar');
  const noFollow = fs.constants.O_NOFOLLOW;
  if (!Number.isInteger(noFollow)) {
    fail('source archive generation requires O_NOFOLLOW');
  }
  const descriptor = fs.openSync(
    archivePath,
    fs.constants.O_CREAT |
      fs.constants.O_EXCL |
      fs.constants.O_WRONLY |
      noFollow,
    0o600,
  );
  fs.fchmodSync(descriptor, 0o600);
  const initialIdentity = fs.fstatSync(descriptor, { bigint: true });
  fs.closeSync(descriptor);
  let verified;
  try {
    const archive = await git.command(
      [
        'archive',
        '--format=tar',
        `--prefix=${SOURCE_PREFIX}`,
        `--output=${archivePath}`,
        revision,
      ],
      {
        maxOutputBytes: 1024 * 1024,
        timeoutMs: 600_000,
      },
    );
    if (
      archive.stdout !== '' ||
      archive.stderr !== '' ||
      archive.stdoutTruncated ||
      archive.stderrTruncated
    ) {
      fail(`source archive command emitted unexpected output for ${revision}`);
    }
    const modeDescriptor = fs.openSync(
      archivePath,
      fs.constants.O_RDONLY | noFollow,
    );
    try {
      const outputIdentity = fs.fstatSync(modeDescriptor, { bigint: true });
      if (
        !outputIdentity.isFile() ||
        outputIdentity.isSymbolicLink() ||
        outputIdentity.nlink !== 1n ||
        outputIdentity.dev !== initialIdentity.dev ||
        outputIdentity.ino !== initialIdentity.ino
      ) {
        fail('source archive output path no longer names its run-owned file');
      }
      fs.fchmodSync(
        modeDescriptor,
        Number.parseInt(archiveMode.slice(1), 8),
      );
    } finally {
      fs.closeSync(modeDescriptor);
    }
    verified = inspectSourceArchive({
      archivePath,
      expectedInventory: inventory,
      initialIdentity,
      revision,
    });
    return deepFreeze({
      ...verified,
      inventoryEntryCount: inventory.inventoryEntryCount,
      inventorySha256: inventory.inventorySha256,
      inventoryTotalBytes: inventory.inventoryTotalBytes,
    });
  } finally {
    if (fs.existsSync(archivePath)) {
      const current = fs.lstatSync(archivePath, { bigint: true });
      if (
        current.isFile() &&
        !current.isSymbolicLink() &&
        current.dev === initialIdentity.dev &&
        current.ino === initialIdentity.ino
      ) {
        fs.unlinkSync(archivePath);
      }
    }
    if (
      fs.existsSync(archiveDirectory) &&
      fs.readdirSync(archiveDirectory).length === 0
    ) {
      fs.rmdirSync(archiveDirectory);
    }
  }
}

async function verifySourceArchive(git, expected) {
  if (
    expected.archiveFormat !== SOURCE_ARCHIVE_FORMAT ||
    expected.memberPrefix !== SOURCE_PREFIX ||
    expected.inventorySchemaVersion !== SOURCE_INVENTORY_SCHEMA
  ) {
    fail('source archive format is not the fixed source/-prefixed Git tar form');
  }
  const actual = await recomputeGitSourceArchiveIdentity({
    archiveMode: expected.archiveMode,
    git,
    revision: expected.revision,
    tree: expected.tree,
  });
  for (const key of [
    'archiveMode',
    'archiveSha256',
    'archiveSize',
    'inventoryEntryCount',
    'inventorySha256',
    'inventoryTotalBytes',
  ]) {
    if (actual[key] !== expected[key]) {
      fail(`source archive identity drifted for ${expected.revision} (${key})`);
    }
  }
}

export async function verifySupersededAttemptLineage({
  archiveRevision,
  git,
  harnessRevision,
  productRevision,
  supersededAttempts,
}) {
  if (
    !git ||
    typeof git.isAncestor !== 'function' ||
    !Array.isArray(supersededAttempts)
  ) {
    throw new TypeError(
      'superseded attempt lineage verification requires Git and attempts',
    );
  }
  for (const attempt of supersededAttempts) {
    const sourceRevision = attempt?.sourceRevision;
    try {
      assertGitOid(sourceRevision, 'superseded attempt source revision');
    } catch (error) {
      fail('superseded attempt source revision is invalid', error);
    }
    if (
      sourceRevision === productRevision ||
      sourceRevision === archiveRevision ||
      !(await git.isAncestor(productRevision, sourceRevision)) ||
      !(await git.isAncestor(sourceRevision, harnessRevision))
    ) {
      fail(
        `superseded attempt source is outside the strict Product-to-Harness lineage: ${sourceRevision}`,
      );
    }
  }
}

export async function verifyAcceptedDevelopmentRepository({
  git,
  filePath = ACCEPTED_DEVELOPMENT_PATH,
} = {}) {
  if (
    !git ||
    typeof git.command !== 'function' ||
    typeof git.fileAtRevision !== 'function' ||
    typeof git.isAncestor !== 'function' ||
    typeof git.text !== 'function'
  ) {
    throw new TypeError('receipt repository verification requires a GitRepository');
  }
  const receipt = readAcceptedDevelopment(filePath);
  const { value } = receipt;
  const product = value.frozenProduct;
  const harness = {
    revision: value.acceptanceControl.implementationRevision,
    tree: value.acceptanceControl.implementationTree,
  };
  const archive = {
    revision: value.acceptanceControl.archiveLifecycleCommit,
    tree: value.acceptanceControl.archiveLifecycleTree,
  };

  for (const identity of [
    product,
    harness,
    archive,
    {
      revision: value.actionsEvidence.headRevision,
      tree: value.actionsEvidence.headTree,
    },
  ]) {
    if ((await git.tree(identity.revision)) !== identity.tree) {
      fail(`accepted Git tree drifted for ${identity.revision}`);
    }
  }
  if (
    !(await git.isAncestor(product.revision, harness.revision)) ||
    !(await git.isAncestor(harness.revision, archive.revision))
  ) {
    fail('accepted Product, Harness implementation, and Harness archive ancestry drifted');
  }
  await verifySupersededAttemptLineage({
    archiveRevision: archive.revision,
    git,
    harnessRevision: harness.revision,
    productRevision: product.revision,
    supersededAttempts: value.remoteEvidence.supersededAttempts,
  });
  await verifyProductHarnessDifference({
    expected: value.acceptanceControl.productHarnessDifference,
    git,
    harnessRevision: harness.revision,
    productRevision: product.revision,
  });
  await verifySourceArchive(git, value.sourceArchives.product);
  await verifySourceArchive(git, value.sourceArchives.harness);

  const records = [
    value.actionsEvidence.workflowAuthority,
    ...value.authorities.buildDefinitions,
    ...value.authorities.contracts,
    ...value.authorities.lifecycle,
    value.authorities.versionFile,
  ];
  for (const record of records) await verifyRepositoryFile(git, record);

  const matrixAuthority = await git.fileAtRevision(
    harness.revision,
    value.remoteEvidence.formalMatrix.path,
  );
  if (
    matrixAuthority.gitBlob !== value.remoteEvidence.formalMatrix.gitBlob ||
    matrixAuthority.sha256 !== value.remoteEvidence.formalMatrix.sha256
  ) {
    fail('formal matrix authority drifted');
  }
  const matrix = parseJsonStrict(
    matrixAuthority.bytes,
    value.remoteEvidence.formalMatrix.path,
  );
  const cells = matrix?.cells?.map((entry) => entry.id);
  if (
    !Array.isArray(cells) ||
    cells.length !== EXPECTED_UNEXECUTED_CELL_COUNT ||
    canonicalJsonDigest(cells) !==
      canonicalJsonDigest(value.remoteEvidence.formalMatrix.unexecutedCells)
  ) {
    fail('receipt unexecuted-cell inventory differs from the formal matrix');
  }
  return receipt;
}

export function acceptedDevelopmentSchema() {
  return deepFreeze(schema);
}
