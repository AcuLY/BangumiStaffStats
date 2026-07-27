#!/usr/bin/env node

import { main } from '../lib/cli.mjs';

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`development acceptance error: ${error.message}\n`);
  process.exitCode = 1;
}
