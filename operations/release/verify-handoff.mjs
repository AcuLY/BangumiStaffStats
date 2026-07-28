#!/usr/bin/env node

import path from 'node:path';

import { canonicalJson } from '../lib/canonical-json.mjs';
import {
  assertRepository,
  optionPath,
  parseOptions,
  runCli,
} from './cli.mjs';
import { verifyAndExtractHandoff } from './verify-handoff-lib.mjs';

async function main(argv) {
  const options = parseOptions(argv, {
    allowed: [
      '--archive',
      '--checksum',
      '--inventory',
      '--kind',
      '--output',
      '--repository',
    ],
    required: ['--archive', '--checksum', '--kind', '--output'],
  });
  const kind = options.get('--kind');
  const result = verifyAndExtractHandoff({
    archivePath: optionPath(options, '--archive', { type: 'file' }),
    checksumPath: optionPath(options, '--checksum', { type: 'file' }),
    inventoryPath: options.has('--inventory')
      ? optionPath(options, '--inventory', { type: 'file' })
      : undefined,
    kind,
    outputRoot: optionPath(options, '--output', { type: 'directory' }),
    repository: assertRepository(
      options.get('--repository') ?? 'AcuLY/BangumiStaffStats',
    ),
  });
  process.stdout.write(
    canonicalJson({
      archiveDigest: result.archiveDigest,
      candidateKind: result.kind,
      contentAddress: result.completeInventory.contentAddress,
    }),
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(import.meta.filename)
) {
  runCli(main);
}
