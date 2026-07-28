import fs from 'node:fs';
import path from 'node:path';

import { canonicalJson, deepFreeze } from '../lib/canonical-json.mjs';
import { assertEvidenceSafe } from '../lib/evidence-policy.mjs';
import {
  assertPathIdentity,
  capturePathIdentity,
  requireCanonicalPath,
} from '../lib/path-policy.mjs';
import {
  compileStrictSchema,
  parseAndValidateCanonicalJson,
} from '../lib/schema.mjs';
import { parseCanonicalJson, readJsonStrict } from '../lib/strict-json.mjs';
import { assertVersionTag } from './cli.mjs';
import { registryRepositories } from './constants.mjs';
import { copyImmutableFile } from './files.mjs';
import { extractTarFile, inspectTarFile } from './tar.mjs';
import { verifyCandidateStructure } from './verify-candidate-lib.mjs';

const COMPLETE_INVENTORY_SCHEMA = readJsonStrict(
  new URL('../schemas/release-complete-inventory-v1.schema.json', import.meta.url),
);
const validateCompleteInventory = compileStrictSchema(
  COMPLETE_INVENTORY_SCHEMA,
  { label: 'complete candidate inventory schema' },
);

export class HandoffVerificationError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'HandoffVerificationError';
  }
}

function fail(message, cause) {
  throw new HandoffVerificationError(
    message,
    cause ? { cause } : undefined,
  );
}

function assertEmptyOutput(outputRoot) {
  const output = requireCanonicalPath(outputRoot, {
    label: 'handoff extraction root',
    type: 'directory',
  });
  if (fs.readdirSync(output).length !== 0) {
    fail('handoff extraction root must be empty');
  }
  return output;
}

function validateChecksum(checksumPath, archiveIdentity, archiveName) {
  const checksumIdentity = capturePathIdentity(checksumPath, {
    includeDigest: true,
    label: 'handoff checksum',
  });
  const expected = `${archiveIdentity.sha256.slice(7)}  ${archiveName}\n`;
  if (fs.readFileSync(checksumIdentity.path, 'utf8') !== expected) {
    fail('handoff checksum is not the exact canonical archive binding');
  }
  assertPathIdentity(checksumIdentity.path, checksumIdentity, {
    includeDigest: true,
    label: 'handoff checksum',
  });
  return checksumIdentity;
}

function readCompleteInventory(inventoryPath) {
  return parseAndValidateCanonicalJson(
    fs.readFileSync(inventoryPath, 'utf8'),
    validateCompleteInventory,
    {
      label: 'candidate-complete-inventory.json',
      policy: assertEvidenceSafe,
    },
  );
}

export function assertCompleteInventoryMatches(supplied, recomputed) {
  validateCompleteInventory(supplied);
  validateCompleteInventory(recomputed);
  if (canonicalJson(supplied) !== canonicalJson(recomputed)) {
    fail('external complete inventory differs from the extracted candidate');
  }
  return supplied;
}

export function assertClosedHandoffMembers({
  completeInventory,
  kind,
  members,
}) {
  const expectedMembers = [
    ...completeInventory.files.map((entry) => `candidate/${entry.path}`),
    ...(kind === 'tag-release'
      ? [
          'candidate-complete-inventory.json',
          'registry-publication-plan.json',
        ]
      : []),
  ].sort((left, right) => left.localeCompare(right, 'en'));
  const actualMembers = [...members].sort((left, right) =>
    left.localeCompare(right, 'en'),
  );
  if (
    expectedMembers.length !== actualMembers.length ||
    expectedMembers.some((entry, index) => entry !== actualMembers[index])
  ) {
    fail('handoff tar members differ from the complete candidate closure');
  }
  return completeInventory;
}

function verifyRegistryPlan(planPath, candidate, repository) {
  const plan = parseCanonicalJson(
    fs.readFileSync(planPath, 'utf8'),
    'registry-publication-plan.json',
  );
  const repositories = registryRepositories(repository);
  const expected = {
    entries: [
      {
        archivePath: 'release/backend-api-linux-amd64.oci.tar',
        component: 'backend',
        destinationRepository: repositories.backend,
        loadReference: candidate.images.api.declaredLoadReference,
        versionTag: candidate.releaseTag,
      },
      {
        archivePath: 'release/updater-image-linux-amd64.oci.tar',
        component: 'updater',
        destinationRepository: repositories.updater,
        loadReference: candidate.images.updater.declaredLoadReference,
        versionTag: candidate.releaseTag,
      },
    ],
    schemaVersion: 1,
  };
  if (canonicalJson(plan) !== canonicalJson(expected)) {
    fail('registry publication plan differs from the closed tag candidate plan');
  }
  return plan;
}

export function verifyAndExtractHandoff({
  archivePath,
  checksumPath,
  inventoryPath,
  kind,
  outputRoot,
  repository = 'AcuLY/BangumiStaffStats',
}) {
  if (!['tag-release', 'validation'].includes(kind)) {
    throw new TypeError('handoff kind must be validation or tag-release');
  }
  const archiveName =
    kind === 'validation'
      ? 'validation-candidate.tar'
      : 'tag-release-candidate.tar';
  const archive = requireCanonicalPath(archivePath, {
    label: 'handoff archive',
    requireSingleLink: true,
    type: 'file',
  });
  if (path.basename(archive) !== archiveName) {
    fail(`handoff archive must be named ${archiveName}`);
  }
  const archiveIdentity = capturePathIdentity(archive, {
    includeDigest: true,
    label: 'handoff archive',
  });
  const checksumIdentity = validateChecksum(
    checksumPath,
    archiveIdentity,
    archiveName,
  );
  let externalInventoryIdentity;
  if (kind === 'validation') {
    if (!inventoryPath) fail('validation handoff requires an external inventory');
    externalInventoryIdentity = capturePathIdentity(inventoryPath, {
      includeDigest: true,
      label: 'external complete inventory',
    });
  } else if (inventoryPath !== undefined) {
    fail('tag release inventory must be sealed inside its handoff archive');
  }
  const output = assertEmptyOutput(outputRoot);
  const initialMembers = inspectTarFile(archive);
  extractTarFile({
    admitMember: (member) =>
      member.path.startsWith('candidate/') ||
      (kind === 'tag-release' &&
        [
          'candidate-complete-inventory.json',
          'registry-publication-plan.json',
        ].includes(member.path)),
    archivePath: archive,
    destinationRoot: output,
  });
  if (kind === 'validation') {
    copyImmutableFile({
      destinationRelative: 'candidate-complete-inventory.json',
      destinationRoot: output,
      mode: 0o444,
      source: externalInventoryIdentity.path,
    });
  }
  const candidateRoot = requireCanonicalPath(path.join(output, 'candidate'), {
    below: output,
    label: 'extracted candidate root',
    type: 'directory',
  });
  const verified = verifyCandidateStructure(candidateRoot);
  if (
    verified.completeInventory.candidateKind !== kind ||
    (kind === 'validation' &&
      verified.candidate.schemaVersion !== 'operations-validation-candidate-v1') ||
    (kind === 'tag-release' &&
      verified.candidate.schemaVersion !==
        'operations-tag-release-candidate-v1')
  ) {
    fail('handoff candidate kind differs from the admitted handoff');
  }
  const inventoryFile = path.join(
    output,
    'candidate-complete-inventory.json',
  );
  const suppliedInventory = readCompleteInventory(inventoryFile);
  assertCompleteInventoryMatches(
    suppliedInventory,
    verified.completeInventory,
  );
  assertClosedHandoffMembers({
    completeInventory: suppliedInventory,
    kind,
    members: initialMembers.map((entry) => entry.path),
  });
  let plan;
  if (kind === 'tag-release') {
    assertVersionTag(verified.candidate.releaseTag);
    plan = verifyRegistryPlan(
      path.join(output, 'registry-publication-plan.json'),
      verified.candidate,
      repository,
    );
  }
  assertPathIdentity(archive, archiveIdentity, {
    includeDigest: true,
    label: 'handoff archive',
  });
  assertPathIdentity(checksumIdentity.path, checksumIdentity, {
    includeDigest: true,
    label: 'handoff checksum',
  });
  if (externalInventoryIdentity) {
    assertPathIdentity(
      externalInventoryIdentity.path,
      externalInventoryIdentity,
      {
        includeDigest: true,
        label: 'external complete inventory',
      },
    );
  }
  return deepFreeze({
    archiveDigest: archiveIdentity.sha256,
    candidate: verified,
    completeInventory: suppliedInventory,
    kind,
    output,
    plan,
  });
}
