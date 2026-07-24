import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const disposableRoots = [
  'node_modules',
  'dist',
  'coverage',
  '.cache',
  '.tmp',
];

for (const relative of disposableRoots) {
  const target = path.resolve(frontendRoot, relative);
  if (path.dirname(target) !== frontendRoot) {
    throw new Error(`refusing to clean non-frontend path: ${target}`);
  }
  fs.rmSync(target, { force: true, recursive: true });
}

console.log(`removed frontend disposable roots with Node ${process.version}`);
