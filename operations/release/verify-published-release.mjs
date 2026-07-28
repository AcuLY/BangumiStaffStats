#!/usr/bin/env node

import path from 'node:path';

import { canonicalJson } from '../lib/canonical-json.mjs';
import { assertSha256 } from '../lib/digest.mjs';
import {
  optionPath,
  parseOptions,
  runCli,
} from './cli.mjs';
import { verifyPublishedRelease } from './publication.mjs';

async function main(argv) {
  const options = parseOptions(argv, {
    allowed: ['--asset-root', '--expected-digest', '--manifest'],
    required: ['--expected-digest', '--manifest'],
  });
  const manifestPath = optionPath(options, '--manifest', { type: 'file' });
  const result = verifyPublishedRelease({
    assetRoot: options.has('--asset-root')
      ? optionPath(options, '--asset-root', { type: 'directory' })
      : path.dirname(manifestPath),
    expectedDigest: assertSha256(options.get('--expected-digest')),
    manifestPath,
  });
  process.stdout.write(
    canonicalJson({
      manifestDigest: result.digest,
      release: result.manifest.release,
      target: result.manifest.target,
    }),
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(import.meta.filename)
) {
  runCli(main);
}
