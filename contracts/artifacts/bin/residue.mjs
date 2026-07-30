#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  captureTrackedRegularFilesAtRevision,
  deriveCleanCheckoutIdentity,
} from '../lib/git-checkout.mjs';

const ARTIFACTS_ROOT = path.resolve(import.meta.dirname, '..');
const REPOSITORY_ROOT = path.resolve(ARTIFACTS_ROOT, '..', '..');
const BUILD_ROOTS = Object.freeze([
  'backend/build',
  'updater/build',
  'frontend/build',
  'contracts/artifacts',
]);

function fail(message) {
  throw new Error(message);
}

function normalizedRelative(value, label) {
  if (
    typeof value !== 'string' ||
    !value ||
    value.startsWith('/') ||
    value.includes('\\') ||
    value.includes('\0') ||
    value.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    fail(`${label} must be a normalized relative POSIX path`);
  }
  return value;
}

export function auditBuildRoot({
  root,
  repositoryRelative,
  trackedPaths,
}) {
  const relativeRoot = normalizedRelative(repositoryRelative, 'build root');
  const absoluteRoot = path.resolve(root);
  const rootInformation = fs.lstatSync(absoluteRoot);
  if (rootInformation.isSymbolicLink() || !rootInformation.isDirectory()) {
    fail(`${relativeRoot} must be a real directory`);
  }
  const expected = new Set();
  const allowedDirectories = new Set(['']);
  for (const value of trackedPaths) {
    const tracked = normalizedRelative(value, 'tracked path');
    if (!tracked.startsWith(`${relativeRoot}/`)) {
      fail(`tracked path escapes ${relativeRoot}: ${tracked}`);
    }
    const local = tracked.slice(relativeRoot.length + 1);
    if (local === '.tmp' || local.startsWith('.tmp/')) {
      fail(`${relativeRoot}/.tmp must remain generated-only`);
    }
    expected.add(local);
    const parts = local.split('/');
    for (let length = 1; length < parts.length; length += 1) {
      allowedDirectories.add(parts.slice(0, length).join('/'));
    }
  }

  const seen = new Set();
  function visit(directory, prefix) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name, 'en'),
    )) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      const information = fs.lstatSync(absolute);
      if (prefix === '' && entry.name === '.tmp') {
        if (information.isSymbolicLink() || !information.isDirectory()) {
          fail(`${relativeRoot}/.tmp must be a real generated directory`);
        }
        continue;
      }
      if (information.isSymbolicLink()) {
        fail(`generated residue symlink outside .tmp: ${relativeRoot}/${relative}`);
      }
      if (information.isDirectory()) {
        if (!allowedDirectories.has(relative)) {
          fail(`generated residue directory outside .tmp: ${relativeRoot}/${relative}`);
        }
        visit(absolute, relative);
      } else if (information.isFile()) {
        if (!expected.has(relative)) {
          fail(`generated residue file outside .tmp: ${relativeRoot}/${relative}`);
        }
        seen.add(relative);
      } else {
        fail(`generated special-file residue outside .tmp: ${relativeRoot}/${relative}`);
      }
    }
  }
  visit(absoluteRoot, '');
  for (const relative of expected) {
    if (!seen.has(relative)) fail(`tracked build file is missing: ${relativeRoot}/${relative}`);
  }
  return Object.freeze({
    root: relativeRoot,
    trackedFiles: expected.size,
  });
}

export function auditRepositoryBuildResidue(repositoryRoot = REPOSITORY_ROOT) {
  const identity = deriveCleanCheckoutIdentity({ repositoryRoot });
  return BUILD_ROOTS.map((relativeRoot) => {
    const tracked = captureTrackedRegularFilesAtRevision({
      repositoryRoot: identity.repositoryRoot,
      revision: identity.revision,
      prefix: relativeRoot,
    }).map((entry) => entry.path);
    return auditBuildRoot({
      root: path.join(identity.repositoryRoot, ...relativeRoot.split('/')),
      repositoryRelative: relativeRoot,
      trackedPaths: tracked,
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  try {
    if (process.argv.length !== 2) {
      fail('usage: residue.mjs');
    }
    const results = auditRepositoryBuildResidue();
    process.stdout.write(
      `build residue audit passed: ${results
        .map((entry) => `${entry.root}=${entry.trackedFiles}`)
        .join(', ')}\n`,
    );
  } catch (error) {
    process.stderr.write(`build residue audit error: ${error.message}\n`);
    process.exitCode = 1;
  }
}
