#!/usr/bin/env node

import path from 'node:path';

import { canonicalJson } from '../lib/canonical-json.mjs';
import { parseOptions, optionPath, runCli } from './cli.mjs';
import { verifyCandidateStructure } from './verify-candidate-lib.mjs';

async function main(argv) {
  const options = parseOptions(argv, {
    allowed: ['--root'],
    required: ['--root'],
  });
  const root = optionPath(options, '--root', { type: 'directory' });
  const result = verifyCandidateStructure(root);
  process.stdout.write(
    canonicalJson({
      candidateDocument: result.candidateDocument,
      contentAddress: result.completeInventory.contentAddress,
      source: result.source,
      target: result.candidate.target,
    }),
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(import.meta.filename)
) {
  runCli(main);
}
