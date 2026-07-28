#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { canonicalJson, deepFreeze } from '../lib/canonical-json.mjs';
import { writeImmutableFile } from '../lib/immutable-output.mjs';
import { requireCanonicalPath } from '../lib/path-policy.mjs';
import { createRunRoot } from '../lib/run-root.mjs';
import { parseCanonicalJson } from '../lib/strict-json.mjs';
import { doubleBuildReleaseCandidate } from './build-amd64.mjs';
import {
  assertVersionTag,
  optionPath,
  parseOptions,
  runCli,
} from './cli.mjs';
import {
  ACCEPTED_DEVELOPMENT_PATH,
  REPOSITORY_ROOT,
  registryRepositories,
} from './constants.mjs';
import { descriptorForFile, inventoryTree, writeCanonicalFile } from './files.mjs';
import { GitRepository } from './git.mjs';
import { cleanupOwnedRunRoot } from './owned-cleanup.mjs';
import {
  readAcceptedDevelopment,
  verifyAcceptedDevelopmentRepository,
} from './receipt.mjs';
import { verifyTagBaseline } from './tag-baseline.mjs';
import { writeDeterministicTar } from './tar.mjs';

function fail(message) {
  throw new Error(message);
}

function ensureOutput(outputPath) {
  const output = path.resolve(outputPath);
  fs.mkdirSync(output, { mode: 0o700, recursive: true });
  return requireCanonicalPath(output, {
    label: 'tag release output',
    type: 'directory',
  });
}

function registryPlan(candidate, repository, tag) {
  const repositories = registryRepositories(repository);
  return deepFreeze({
    entries: [
      {
        archivePath: 'release/backend-api-linux-amd64.oci.tar',
        component: 'backend',
        destinationRepository: repositories.backend,
        loadReference: candidate.images.api.declaredLoadReference,
        versionTag: tag,
      },
      {
        archivePath: 'release/updater-image-linux-amd64.oci.tar',
        component: 'updater',
        destinationRepository: repositories.updater,
        loadReference: candidate.images.updater.declaredLoadReference,
        versionTag: tag,
      },
    ],
    schemaVersion: 1,
  });
}

async function admitTag({
  acceptanceInput,
  output,
  tag,
}) {
  const tmpRoot = path.join(output, '.tag-admission-runs');
  const run = createRunRoot({
    directories: ['environment'],
    purpose: 'tag-baseline-admission',
    tmpRoot,
  });
  let result;
  let primaryError;
  try {
    const git = new GitRepository({
      repositoryRoot: REPOSITORY_ROOT,
      runRoot: path.join(run.runRoot, 'environment'),
    });
    const receipt = await verifyAcceptedDevelopmentRepository({
      filePath: acceptanceInput,
      git,
    });
    result = await verifyTagBaseline({
      acceptanceReceipt: receipt,
      git,
      tag,
    });
  } catch (error) {
    primaryError = error;
  }
  let cleanupError;
  if (fs.existsSync(run.runRoot)) {
    try {
      cleanupOwnedRunRoot(run.runRoot, {
        expectedPurpose: 'tag-baseline-admission',
        tmpRoot,
      });
    } catch (error) {
      cleanupError = error;
    }
  }
  if (primaryError && cleanupError) {
    throw new AggregateError(
      [primaryError, cleanupError],
      'tag admission and owned cleanup both failed',
    );
  }
  if (primaryError) throw primaryError;
  if (cleanupError) throw cleanupError;
  return result;
}

export async function prepareTagRelease({
  acceptanceInput = ACCEPTED_DEVELOPMENT_PATH,
  outputPath,
  repository = 'AcuLY/BangumiStaffStats',
  tag,
}) {
  const releaseTag = assertVersionTag(tag);
  const output = ensureOutput(outputPath);
  const canonicalAcceptance = requireCanonicalPath(acceptanceInput, {
    label: 'tag release acceptance input',
    type: 'file',
  });
  readAcceptedDevelopment(canonicalAcceptance);
  const source = await admitTag({
    acceptanceInput: canonicalAcceptance,
    output,
    tag: releaseTag,
  });
  const built = await doubleBuildReleaseCandidate({
    acceptanceInput: canonicalAcceptance,
    candidateKind: 'tag-release',
    output,
    releaseTag,
    sourceRef: source.revision,
  });
  const candidateDocumentPath = path.join(
    built.candidateRoot,
    'tag-release-candidate-v1.json',
  );
  const candidate = parseCanonicalJson(
    fs.readFileSync(candidateDocumentPath, 'utf8'),
    'tag-release-candidate-v1.json',
  );
  const metadataRoot = path.join(output, 'metadata');
  fs.mkdirSync(metadataRoot, { mode: 0o700 });
  if (fs.readdirSync(metadataRoot).length !== 0) {
    fail('tag release metadata output must be empty');
  }
  writeCanonicalFile({
    relativePath: 'registry-publication-plan.json',
    root: metadataRoot,
    value: registryPlan(candidate, repository, releaseTag),
  });
  const transfer = path.join(output, 'transfer');
  fs.mkdirSync(transfer, { mode: 0o700 });
  if (fs.readdirSync(transfer).length !== 0) {
    fail('tag release transfer output must be empty');
  }
  const candidateMembers = inventoryTree(built.candidateRoot).map((entry) => ({
    mode: entry.mode === '0555' ? 0o555 : 0o444,
    path: `candidate/${entry.path}`,
    source: path.join(built.candidateRoot, ...entry.path.split('/')),
  }));
  const archive = writeDeterministicTar({
    archivePath: path.join(transfer, 'tag-release-candidate.tar'),
    members: [
      ...candidateMembers,
      {
        mode: 0o444,
        path: 'candidate-complete-inventory.json',
        source: built.completeInventory,
      },
      {
        mode: 0o444,
        path: 'registry-publication-plan.json',
        source: path.join(metadataRoot, 'registry-publication-plan.json'),
      },
    ],
  });
  writeImmutableFile({
    bytes:
      `${archive.sha256.slice(7)}  tag-release-candidate.tar\n`,
    mode: 0o444,
    relativePath: 'tag-release-candidate.tar.sha256',
    root: transfer,
  });
  return deepFreeze({
    archive: descriptorForFile(transfer, 'tag-release-candidate.tar'),
    checksum: descriptorForFile(
      transfer,
      'tag-release-candidate.tar.sha256',
    ),
    contentAddress: built.contentAddress,
    source,
    transfer,
  });
}

async function main(argv) {
  const options = parseOptions(argv, {
    allowed: ['--acceptance-input', '--output', '--tag'],
    required: ['--output', '--tag'],
  });
  const result = await prepareTagRelease({
    acceptanceInput: options.has('--acceptance-input')
      ? optionPath(options, '--acceptance-input', { type: 'file' })
      : ACCEPTED_DEVELOPMENT_PATH,
    outputPath: options.get('--output'),
    tag: options.get('--tag'),
  });
  process.stdout.write(canonicalJson(result));
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(import.meta.filename)
) {
  runCli(main);
}
