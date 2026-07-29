#!/usr/bin/env node

import { spawn } from 'node:child_process';

import {
  OperationsControlRuntimeError,
  prepareOperationsControlLaunch,
} from './control-runtime.mjs';

function run(argv) {
  const launch = prepareOperationsControlLaunch({ argv });
  return new Promise((resolve, reject) => {
    const child = spawn(launch.command, launch.args, {
      cwd: launch.cwd,
      env: launch.environment,
      shell: false,
      stdio: 'inherit',
      windowsHide: true,
    });
    const forward = (signal) => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill(signal);
      }
    };
    const handlers = new Map(
      ['SIGHUP', 'SIGINT', 'SIGTERM'].map((signal) => {
        const handler = () => forward(signal);
        process.on(signal, handler);
        return [signal, handler];
      }),
    );
    const removeHandlers = () => {
      for (const [signal, handler] of handlers) {
        process.off(signal, handler);
      }
    };
    child.once('error', (error) => {
      removeHandlers();
      reject(error);
    });
    child.once('exit', (code, signal) => {
      removeHandlers();
      if (signal !== null) {
        reject(new Error(`remote-control lifecycle terminated by ${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });
}

async function main() {
  const exitCode = await run(process.argv.slice(2));
  process.exitCode = exitCode;
}

main().catch((error) => {
  const message =
    error instanceof OperationsControlRuntimeError
      ? error.message
      : 'remote-control launcher failed closed';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
