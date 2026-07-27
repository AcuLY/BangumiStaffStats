#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  seedGoModuleCache,
  validateSeededGoToolchain,
} from '../lib/cache.mjs';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

async function seed() {
  const target = required('BGMSS_GO_TARGET_CACHE');
  if (!fs.existsSync(path.join(target, '.seed-complete'))) {
    if (fs.existsSync(target)) {
      throw new Error('Go target cache exists without an ownership marker');
    }
    await seedGoModuleCache({
      source: required('BGMSS_GO_SOURCE_CACHE'),
      destination: target,
      goSumPath: path.join(required('BGMSS_GO_BACKEND_ROOT'), 'go.sum'),
    });
  }
  validateSeededGoToolchain(target);
  return target;
}

try {
  const moduleCache = await seed();
  const goRoot = fs.realpathSync.native(required('BGMSS_GO_ROOT'));
  const goExecutable = fs.realpathSync.native(required('BGMSS_GO_EXECUTABLE'));
  if (
    goExecutable !== path.join(goRoot, 'bin', 'go') ||
    !fs.lstatSync(goRoot).isDirectory() ||
    !fs.lstatSync(goExecutable).isFile() ||
    fs.lstatSync(goExecutable).nlink !== 1
  ) {
    throw new Error('admitted copied Go executable/root identity is invalid');
  }
  const args = process.argv.slice(2);
  const environment = { ...process.env };
  for (const name of Object.keys(environment)) {
    if (
      name.startsWith('BGMSS_') ||
      name === 'GIT_DIR' ||
      name === 'GIT_WORK_TREE' ||
      name === 'GOFLAGS'
    ) {
      delete environment[name];
    }
  }
  environment.GOROOT = goRoot;
  environment.GOMODCACHE = moduleCache;
  environment.GOPROXY = 'off';
  environment.GOSUMDB = 'off';
  environment.GOTOOLCHAIN = 'local';
  const result = spawnSync(goExecutable, args, {
    env: environment,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} catch (error) {
  process.stderr.write(`Go bootstrap error: ${error.message}\n`);
  process.exitCode = 1;
}
