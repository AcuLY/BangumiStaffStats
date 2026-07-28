#!/usr/bin/env node
import fs from 'node:fs';

import { PROFILE_NAMES } from '../compose/model.mjs';
import { renderCompose } from '../compose/render.mjs';

function parseArguments(argv) {
  if (
    argv.length !== 2 ||
    argv[0] !== '--profile' ||
    !PROFILE_NAMES.includes(argv[1])
  ) {
    throw new Error(
      'usage: render-compose.mjs --profile production|validation',
    );
  }
  return argv[1];
}

try {
  fs.writeSync(1, renderCompose(parseArguments(process.argv.slice(2))));
} catch (error) {
  fs.writeSync(2, `render-compose: ${error.message}\n`);
  process.exitCode = 1;
}
