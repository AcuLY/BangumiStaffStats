#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

import { canonicalJson } from '../lib/canonical-json.mjs';
import { assertGitOid, sha256File } from '../lib/digest.mjs';
import {
  assertSafeRelativePath,
  requireCanonicalPath,
} from '../lib/path-policy.mjs';
import { readJsonStrict } from '../lib/strict-json.mjs';

const DEFINITIONS = readJsonStrict(
  new URL('../config/controller-files.json', import.meta.url),
);

function parseArguments(argv) {
  if (
    argv.length !== 4 ||
    argv[0] !== '--controller-revision' ||
    argv[2] !== '--payload-root'
  ) {
    throw new Error(
      'usage: build-controller-manifest.mjs --controller-revision <40hex> --payload-root /absolute/root',
    );
  }
  return {
    controllerRevision: assertGitOid(argv[1], 'controller revision'),
    payloadRoot: requireCanonicalPath(argv[3], {
      label: 'controller payload root',
      type: 'directory',
    }),
  };
}

function describe(payloadRoot, relativePath) {
  const safe = assertSafeRelativePath(relativePath, 'controller file');
  const absolute = requireCanonicalPath(
    path.join(payloadRoot, ...safe.split('/')),
    {
      below: payloadRoot,
      label: `controller file ${safe}`,
      requireSingleLink: true,
      type: 'file',
    },
  );
  const information = fs.statSync(absolute);
  const executable = (information.mode & 0o111) !== 0;
  return {
    mode:
      safe === 'compose/updater-current-deny'
        ? '0000'
        : executable
          ? '0555'
          : '0444',
    path: safe,
    sha256: sha256File(absolute),
    size: information.size,
  };
}

try {
  const input = parseArguments(process.argv.slice(2));
  const manifest = {
    bootstrap: describe(input.payloadRoot, DEFINITIONS.bootstrap),
    controllerRevision: input.controllerRevision,
    files: DEFINITIONS.files.map((relative) =>
      describe(input.payloadRoot, relative),
    ),
    schemaVersion: 'controller-manifest-v1',
  };
  fs.writeSync(1, canonicalJson(manifest));
} catch (error) {
  fs.writeSync(2, `build-controller-manifest: ${error.message}\n`);
  process.exitCode = 1;
}
