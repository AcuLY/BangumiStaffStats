#!/usr/bin/env node
import fs from 'node:fs';

import { PROFILE_NAMES } from '../compose/model.mjs';
import { renderReleaseEnvironment } from '../compose/render.mjs';
import { readCanonicalJson } from '../lib/strict-json.mjs';

function parseArguments(argv) {
  if (
    argv.length !== 4 ||
    argv[0] !== '--profile' ||
    !PROFILE_NAMES.includes(argv[1]) ||
    argv[2] !== '--release'
  ) {
    throw new Error(
      'usage: render-release-env.mjs --profile production|validation --release /absolute/runtime-release-v1.json',
    );
  }
  return {
    profile: argv[1],
    release: readCanonicalJson(argv[3]),
  };
}

try {
  const input = parseArguments(process.argv.slice(2));
  fs.writeSync(1, renderReleaseEnvironment(input.profile, input.release));
} catch (error) {
  fs.writeSync(2, `render-release-env: ${error.message}\n`);
  process.exitCode = 1;
}
