import fs from 'node:fs';
import path from 'node:path';

import { canonicalJson, deepFreeze } from '../lib/canonical-json.mjs';
import { writeImmutableFile } from '../lib/immutable-output.mjs';
import {
  requireCanonicalPath,
} from '../lib/path-policy.mjs';
import {
  descriptorForFile,
  inventoryTree,
  writeCanonicalFile,
} from './files.mjs';
import { writeDeterministicTar } from './tar.mjs';
import { verifyCandidateStructure } from './verify-candidate-lib.mjs';

export class ReleaseHandoffError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'ReleaseHandoffError';
  }
}

function fail(message, cause) {
  throw new ReleaseHandoffError(message, cause ? { cause } : undefined);
}

function prepareOutput(outputDirectory) {
  const output = path.resolve(outputDirectory);
  fs.mkdirSync(output, { mode: 0o700, recursive: true });
  const canonical = requireCanonicalPath(output, {
    label: 'handoff output',
    type: 'directory',
  });
  if (fs.readdirSync(canonical).length !== 0) fail('handoff output must be empty');
  return canonical;
}

function checksumLine(descriptor, name) {
  return `${descriptor.sha256.slice(7)}  ${name}\n`;
}

export function prepareValidationHandoff({
  candidateRoot,
  outputDirectory,
}) {
  const verified = verifyCandidateStructure(candidateRoot);
  if (
    verified.candidate.schemaVersion !== 'operations-validation-candidate-v1' ||
    verified.candidate.publicationState !== 'unpublished-validation'
  ) {
    fail('validation handoff accepts only an unpublished validation candidate');
  }
  const output = prepareOutput(outputDirectory);
  writeCanonicalFile({
    relativePath: 'candidate-complete-inventory.json',
    root: output,
    value: verified.completeInventory,
  });
  const candidateFiles = inventoryTree(verified.root);
  const archive = writeDeterministicTar({
    archivePath: path.join(output, 'validation-candidate.tar'),
    members: candidateFiles.map((entry) => ({
      mode: entry.mode === '0555' ? 0o555 : 0o444,
      path: `candidate/${entry.path}`,
      source: path.join(verified.root, ...entry.path.split('/')),
    })),
  });
  writeImmutableFile({
    bytes: checksumLine(archive, 'validation-candidate.tar'),
    mode: 0o444,
    relativePath: 'validation-candidate.tar.sha256',
    root: output,
  });
  return deepFreeze({
    archive: descriptorForFile(output, 'validation-candidate.tar'),
    checksum: descriptorForFile(output, 'validation-candidate.tar.sha256'),
    completeInventory: descriptorForFile(
      output,
      'candidate-complete-inventory.json',
    ),
    output,
  });
}

export function handoffSummary(handoff) {
  return canonicalJson({
    archive: handoff.archive,
    checksum: handoff.checksum,
    completeInventory: handoff.completeInventory,
  });
}
