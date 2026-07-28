#!/usr/bin/env node

import path from 'node:path';

import { canonicalJson } from '../lib/canonical-json.mjs';
import {
  assertRepository,
  optionPath,
  parseOptions,
  runCli,
} from './cli.mjs';
import { publishRelease } from './publication.mjs';

async function main(argv) {
  const options = parseOptions(argv, {
    allowed: [
      '--candidate',
      '--output',
      '--registry-evidence',
      '--repository',
    ],
    required: [
      '--candidate',
      '--output',
      '--registry-evidence',
      '--repository',
    ],
  });
  const result = publishRelease({
    candidateRoot: optionPath(options, '--candidate', { type: 'directory' }),
    outputPath: options.get('--output'),
    registryEvidencePath: optionPath(options, '--registry-evidence', {
      type: 'file',
    }),
    repository: assertRepository(options.get('--repository')),
  });
  process.stdout.write(
    canonicalJson({
      manifestDigest: result.digest,
      output: result.root,
      release: result.manifest.release,
    }),
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(import.meta.filename)
) {
  runCli(main);
}
