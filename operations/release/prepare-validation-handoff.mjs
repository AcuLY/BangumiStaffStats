#!/usr/bin/env node

import path from 'node:path';

import { parseOptions, optionPath, runCli } from './cli.mjs';
import {
  handoffSummary,
  prepareValidationHandoff,
} from './handoff.mjs';

async function main(argv) {
  const options = parseOptions(argv, {
    allowed: ['--candidate', '--output'],
    required: ['--candidate', '--output'],
  });
  const handoff = prepareValidationHandoff({
    candidateRoot: optionPath(options, '--candidate', { type: 'directory' }),
    outputDirectory: optionPath(options, '--output', { allowMissing: true }),
  });
  process.stdout.write(handoffSummary(handoff));
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(import.meta.filename)
) {
  runCli(main);
}
