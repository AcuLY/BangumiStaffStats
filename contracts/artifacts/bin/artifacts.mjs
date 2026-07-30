#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  assertCanonicalJson,
  canonicalJson,
} from '../lib/canonical-json.mjs';
import {
  ensureGeneratedDirectory,
  removeGeneratedPath,
  requireGeneratedPath as requireSafeGeneratedPath,
} from '../lib/generated-path.mjs';
import { readJsonStrict } from '../lib/strict-json.mjs';
import { verifyProducerRuntimeInputs } from '../lib/runtime-inputs.mjs';
import {
  assembleCompatibilityManifest,
  sha256Bytes,
  validateCompatibilityManifest,
  verifyComponentDirectory,
} from '../lib/validation.mjs';

const ARTIFACTS_ROOT = path.resolve(import.meta.dirname, '..');
const REPOSITORY_ROOT = path.resolve(ARTIFACTS_ROOT, '..', '..');
const TMP_ROOT = path.join(ARTIFACTS_ROOT, '.tmp');

function usage() {
  throw new Error(
    'usage: artifacts.mjs verify-component <root> [component] | ' +
      'verify-manifest <manifest.json> | ' +
      'verify-producer-runtime-inputs [repository-root] | ' +
      'assemble --output <contracts/artifacts/.tmp/path.json> <backend> <updater> <frontend>',
  );
}

function generatedPathOptions(label) {
  return {
    repositoryRoot: REPOSITORY_ROOT,
    temporaryRoot: TMP_ROOT,
    label,
  };
}

function requireGeneratedPath(candidate, label = 'generated output') {
  return requireSafeGeneratedPath(candidate, generatedPathOptions(label));
}

function writeImmutable(filePath, bytes) {
  const destination = requireGeneratedPath(filePath);
  ensureGeneratedDirectory(
    path.dirname(destination),
    generatedPathOptions('generated output parent'),
  );
  requireGeneratedPath(destination);
  if (fs.existsSync(destination)) {
    const existing = fs.readFileSync(destination, 'utf8');
    if (existing !== bytes) {
      throw new Error(`refusing to overwrite ${destination} with different bytes`);
    }
    return;
  }
  const temporary = `${destination}.publishing`;
  requireGeneratedPath(temporary, 'temporary generated output');
  if (fs.existsSync(temporary)) {
    removeGeneratedPath(
      temporary,
      generatedPathOptions('temporary generated output'),
    );
  }
  fs.writeFileSync(temporary, bytes, { encoding: 'utf8', flag: 'wx', mode: 0o444 });
  requireGeneratedPath(temporary, 'temporary generated output');
  requireGeneratedPath(destination);
  fs.renameSync(temporary, destination);
  requireGeneratedPath(destination);
}

function main(argv) {
  const [command, ...rest] = argv;
  if (command === 'verify-component') {
    if (rest.length < 1 || rest.length > 2) usage();
    const result = verifyComponentDirectory(rest[0], rest[1]);
    process.stdout.write(
      `${result.statement.component} ${result.statement.artifactSetDigest}\n`,
    );
    return;
  }
  if (command === 'verify-manifest') {
    if (rest.length !== 1) usage();
    const source = fs.readFileSync(rest[0], 'utf8');
    const value = readJsonStrict(rest[0]);
    assertCanonicalJson(source, value, rest[0]);
    validateCompatibilityManifest(value, rest[0]);
    process.stdout.write(`${sha256Bytes(source)}\n`);
    return;
  }
  if (command === 'verify-producer-runtime-inputs') {
    if (rest.length > 1) usage();
    const repositoryRoot =
      rest.length === 0 ? REPOSITORY_ROOT : path.resolve(rest[0]);
    const result = verifyProducerRuntimeInputs(repositoryRoot);
    process.stdout.write(
      canonicalJson({
        manifestDigest: result.manifestDigest,
        fileCount: result.fileCount,
        totalSize: result.totalSize,
      }),
    );
    return;
  }
  if (command === 'assemble') {
    if (rest[0] !== '--output' || rest.length !== 5) usage();
    const output = rest[1];
    const roots = rest.slice(2);
    const assembled = assembleCompatibilityManifest(roots);
    writeImmutable(output, assembled.canonical);
    process.stdout.write(`${sha256Bytes(assembled.canonical)}  ${path.resolve(output)}\n`);
    return;
  }
  usage();
}

try {
  main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`artifact contract error: ${error.message}\n`);
  process.exitCode = 1;
}
