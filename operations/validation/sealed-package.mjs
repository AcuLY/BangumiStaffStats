import fs from 'node:fs';
import path from 'node:path';

import { canonicalJsonDigest, deepFreeze } from '../lib/canonical-json.mjs';
import { sha256File } from '../lib/digest.mjs';
import {
  requireCanonicalPath,
  resolveContainedPath,
} from '../lib/path-policy.mjs';
import { readCanonicalJson } from '../lib/strict-json.mjs';
import { MAXIMUMS } from './constants.mjs';
import { assertInputSemantics } from './policy.mjs';
import {
  parseValidationInput,
  parseValidationPreflight,
} from './schema.mjs';

export class SealedValidationPackageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SealedValidationPackageError';
  }
}

function fail(message) {
  throw new SealedValidationPackageError(message);
}

function identity(file, expectedMode) {
  const information = fs.lstatSync(file, { bigint: true });
  if (
    !information.isFile() ||
    information.isSymbolicLink() ||
    information.nlink !== 1n ||
    Number(information.size) < 1 ||
    Number(information.size) > MAXIMUMS.transferFileBytes ||
    Number(information.mode & 0o777n) !== expectedMode
  ) {
    fail(`validation package file identity is unsafe: ${path.basename(file)}`);
  }
  return information;
}

function sameIdentity(left, right) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.nlink === right.nlink &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs
  );
}

export function verifySealedValidationPackage(packageDirectory) {
  const root = requireCanonicalPath(path.resolve(packageDirectory), {
    label: 'validation package root',
    type: 'directory',
  });
  const rootEntries = fs
    .readdirSync(root, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, 'en'));
  if (
    rootEntries.length !== 2 ||
    rootEntries[0].name !== 'files' ||
    !rootEntries[0].isDirectory() ||
    rootEntries[0].isSymbolicLink() ||
    rootEntries[1].name !== 'validation-input-v1.json' ||
    !rootEntries[1].isFile() ||
    rootEntries[1].isSymbolicLink()
  ) {
    fail('validation package root does not have its exact closed shape');
  }
  const inputPath = resolveContainedPath(root, 'validation-input-v1.json', {
    allowMissing: false,
    label: 'validation input',
  });
  const inputBefore = identity(inputPath, 0o400);
  if (Number(inputBefore.size) > MAXIMUMS.inputBytes) {
    fail('validation input exceeds its closed size bound');
  }
  const inputBytes = fs.readFileSync(inputPath);
  const input = parseValidationInput(inputBytes);
  const { roles } = assertInputSemantics(input);
  const filesRoot = requireCanonicalPath(path.join(root, 'files'), {
    below: root,
    label: 'validation package files root',
    type: 'directory',
  });
  const entries = fs
    .readdirSync(filesRoot, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, 'en'));
  const expectedNames = input.transfer.files.map((record) => record.id).sort();
  if (
    entries.length !== expectedNames.length ||
    entries.some(
      (entry, index) =>
        entry.name !== expectedNames[index] ||
        !entry.isFile() ||
        entry.isSymbolicLink(),
    )
  ) {
    fail('validation package transfer file set is not exact');
  }
  const files = new Map();
  for (const record of input.transfer.files) {
    const candidate = resolveContainedPath(filesRoot, record.id, {
      allowMissing: false,
      label: `validation package transfer ${record.role}`,
    });
    const expectedMode = record.mode === '0500' ? 0o500 : 0o400;
    const before = identity(candidate, expectedMode);
    if (
      Number(before.size) !== record.size ||
      sha256File(candidate) !== record.sha256
    ) {
      fail(`validation package transfer identity differs: ${record.role}`);
    }
    const after = fs.lstatSync(candidate, { bigint: true });
    if (!sameIdentity(before, after)) {
      fail(`validation package transfer changed while read: ${record.role}`);
    }
    files.set(record.role, candidate);
  }
  const preflightPath = files.get('preflight-evidence');
  const preflight = parseValidationPreflight(fs.readFileSync(preflightPath));
  if (
    canonicalJsonDigest(preflight) !== input.preflight.digest ||
    sha256File(preflightPath) !== input.preflight.digest
  ) {
    fail('validation preflight evidence differs from its input seal');
  }
  const inputAfter = fs.lstatSync(inputPath, { bigint: true });
  if (
    !sameIdentity(inputBefore, inputAfter) ||
    canonicalJsonDigest(readCanonicalJson(inputPath)) !==
      canonicalJsonDigest(input)
  ) {
    fail('validation input changed while its package was verified');
  }
  return deepFreeze({
    files,
    input,
    inputDigest: sha256File(inputPath),
    inputPath,
    packageRoot: root,
    preflight,
    roles,
  });
}
