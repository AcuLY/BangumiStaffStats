import fs from 'node:fs';

import { canonicalJsonDigest, deepFreeze } from '../lib/canonical-json.mjs';
import { assertSha256, sha256 } from '../lib/digest.mjs';
import { assertEvidenceSafe } from '../lib/evidence-policy.mjs';
import {
  compileStrictSchema,
  parseAndValidateCanonicalJson,
} from '../lib/schema.mjs';
import { decodeUtf8Strict, readJsonStrict } from '../lib/strict-json.mjs';
import {
  ACCEPTANCE_ACTIONS_HEAD,
  ACCEPTANCE_ACTIONS_TREE,
  ACCEPTANCE_ARCHIVE,
  ACCEPTANCE_IMPLEMENTATION,
  ACCEPTANCE_LIFECYCLE_STATUS,
  ACCEPTANCE_MATRIX_DIGEST,
  ACCEPTED_DEVELOPMENT_PATH,
  ACCEPTED_DEVELOPMENT_SHA256,
  APPLICATION_VERSION,
  FROZEN_PRODUCT,
} from './constants.mjs';

const SCHEMA_URL = new URL(
  '../schemas/release-accepted-development-v1.schema.json',
  import.meta.url,
);
const schema = readJsonStrict(SCHEMA_URL);
const validateSchema = compileStrictSchema(schema, {
  label: 'accepted development receipt schema',
});

export class AcceptedDevelopmentError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'AcceptedDevelopmentError';
  }
}

function fail(message, cause) {
  throw new AcceptedDevelopmentError(message, cause ? { cause } : undefined);
}

function assertSortedByPath(records, label) {
  const paths = records.map((record) => record.path);
  const sorted = [...paths].sort((left, right) => left.localeCompare(right, 'en'));
  if (new Set(paths).size !== paths.length || paths.some((entry, index) => entry !== sorted[index])) {
    fail(`${label} must be unique and path-sorted`);
  }
}

function assertFixedReceipt(value) {
  if (
    value.schemaVersion !== 'operations-accepted-development-v1' ||
    value.lifecycleStatus !== ACCEPTANCE_LIFECYCLE_STATUS ||
    value.applicationVersion !== APPLICATION_VERSION ||
    value.frozenProduct.revision !== FROZEN_PRODUCT.revision ||
    value.frozenProduct.tree !== FROZEN_PRODUCT.tree ||
    value.acceptanceControl.implementationRevision !== ACCEPTANCE_IMPLEMENTATION ||
    value.acceptanceControl.archiveLifecycleCommit !== ACCEPTANCE_ARCHIVE ||
    value.actionsEvidence.headRevision !== ACCEPTANCE_ACTIONS_HEAD ||
    value.actionsEvidence.headTree !== ACCEPTANCE_ACTIONS_TREE ||
    value.remoteEvidence.formalMatrix.sha256 !== ACCEPTANCE_MATRIX_DIGEST ||
    value.remoteEvidence.formalMatrix.cellCount !== 56 ||
    value.remoteEvidence.formalMatrix.unexecutedCells.length !== 56 ||
    value.priorDevelopmentArtifacts.status !==
      'not-materialized-for-authorized-closure' ||
    value.priorDevelopmentArtifacts.componentOrCompatibilityDigestsPresent !== false
  ) {
    fail('accepted development receipt disagrees with fixed Operations authority');
  }
  assertSortedByPath(value.authorities.buildDefinitions, 'build authorities');
  assertSortedByPath(value.authorities.contracts, 'contract authorities');
  assertSortedByPath(value.authorities.lifecycle, 'lifecycle authorities');
  const toolNames = value.authorities.toolchains.map((entry) => entry.name);
  const sortedTools = [...toolNames].sort((left, right) => left.localeCompare(right, 'en'));
  if (
    new Set(toolNames).size !== toolNames.length ||
    toolNames.some((entry, index) => entry !== sortedTools[index])
  ) {
    fail('toolchain authorities must be unique and name-sorted');
  }
  return deepFreeze(value);
}

export function parseAcceptedDevelopment(source) {
  const value = parseAndValidateCanonicalJson(source, validateSchema, {
    label: 'accepted development receipt',
    policy: assertEvidenceSafe,
  });
  return assertFixedReceipt(value);
}

export function readAcceptedDevelopment(filePath = ACCEPTED_DEVELOPMENT_PATH) {
  const bytes = fs.readFileSync(filePath);
  const digest = sha256(bytes);
  if (
    filePath === ACCEPTED_DEVELOPMENT_PATH &&
    digest !== assertSha256(ACCEPTED_DEVELOPMENT_SHA256)
  ) {
    fail('checked-in accepted development receipt bytes drifted');
  }
  const value = parseAcceptedDevelopment(decodeUtf8Strict(bytes, filePath));
  return deepFreeze({
    digest,
    path: filePath,
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

export async function verifyAcceptedDevelopmentRepository({
  git,
  filePath = ACCEPTED_DEVELOPMENT_PATH,
} = {}) {
  if (!git || typeof git.fileAtRevision !== 'function') {
    throw new TypeError('receipt repository verification requires a GitRepository');
  }
  const receipt = readAcceptedDevelopment(filePath);
  const { value } = receipt;
  const identities = [
    [value.frozenProduct.revision, value.frozenProduct.tree],
    [
      value.acceptanceControl.implementationRevision,
      value.acceptanceControl.implementationTree,
    ],
    [
      value.acceptanceControl.archiveLifecycleCommit,
      value.acceptanceControl.archiveLifecycleTree,
    ],
    [value.actionsEvidence.headRevision, value.actionsEvidence.headTree],
  ];
  for (const [revision, expectedTree] of identities) {
    if ((await git.tree(revision)) !== expectedTree) {
      fail(`accepted Git tree drifted for ${revision}`);
    }
  }
  const records = [
    value.actionsEvidence.workflowAuthority,
    ...value.authorities.buildDefinitions,
    ...value.authorities.contracts,
    ...value.authorities.lifecycle,
    value.authorities.versionFile,
  ];
  for (const record of records) await verifyRepositoryFile(git, record);

  const matrixAuthority = await git.fileAtRevision(
    value.acceptanceControl.implementationRevision,
    value.remoteEvidence.formalMatrix.path,
  );
  if (
    matrixAuthority.gitBlob !== value.remoteEvidence.formalMatrix.gitBlob ||
    matrixAuthority.sha256 !== value.remoteEvidence.formalMatrix.sha256
  ) {
    fail('formal matrix authority drifted');
  }
  const matrix = JSON.parse(matrixAuthority.bytes);
  const cells = matrix?.cells?.map((entry) => entry.id);
  if (
    !Array.isArray(cells) ||
    cells.length !== 56 ||
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
