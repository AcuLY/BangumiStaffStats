#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { canonicalJson } from '../lib/canonical-json.mjs';
import { createRunRoot } from '../lib/run-root.mjs';
import { requireCanonicalPath } from '../lib/path-policy.mjs';
import { assertExactOperationsControlRuntime } from './control-runtime.mjs';
import {
  approvedGithubCliExecutable,
  parseWorkflowRunId,
  verifyAuthenticatedActionsHandoff,
} from './actions-handoff.mjs';
import { MAXIMUMS } from './constants.mjs';
import {
  createValidationPackage,
  currentOperationsIdentity,
} from './package.mjs';
import { parseValidationPreflight } from './schema.mjs';
import { verifyDownloadedHandoff } from './sealed-handoff.mjs';
import { runSshScript } from './ssh.mjs';

class ValidationPreflightCliError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'ValidationPreflightCliError';
  }
}

function fail(message, cause) {
  throw new ValidationPreflightCliError(
    message,
    cause ? { cause } : undefined,
  );
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (
      !['--candidate', '--workflow-run-id'].includes(name) ||
      value === undefined ||
      values.has(name)
    ) {
      fail(
        'usage: preflight-myserver.mjs --candidate /absolute/downloaded-handoff --workflow-run-id positive-decimal',
      );
    }
    values.set(name, value);
  }
  if (!values.has('--candidate') || !values.has('--workflow-run-id')) {
    fail('downloaded Actions handoff and reviewed workflow run ID are required');
  }
  const candidate = requireCanonicalPath(
    path.resolve(values.get('--candidate')),
    {
      label: 'downloaded Actions handoff',
      type: 'directory',
    },
  );
  return {
    candidate,
    workflowRunId: parseWorkflowRunId(values.get('--workflow-run-id')),
  };
}

function requiredRemoteBytes(candidateSize) {
  const projected = candidateSize * 3 + 8 * 1024 * 1024 * 1024;
  if (
    !Number.isSafeInteger(projected) ||
    projected > MAXIMUMS.transferTotalBytes
  ) {
    fail('validation capacity projection exceeds the admitted transfer bound');
  }
  return Math.max(1024 * 1024 * 1024, projected);
}

async function main() {
  assertExactOperationsControlRuntime({
    expectedLifecycleEvent: 'preflight:myserver',
  });
  approvedGithubCliExecutable();
  const argumentsValue = parseArguments(process.argv.slice(2));
  const operationsIdentity = currentOperationsIdentity();
  const run = createRunRoot({
    directories: ['authenticated', 'candidate', 'package'],
    purpose: 'isolated-host-validation',
  });
  const transport = verifyAuthenticatedActionsHandoff({
    authenticatedDownloadRoot: path.join(run.runRoot, 'authenticated'),
    handoffDirectory: argumentsValue.candidate,
    workflowHead: operationsIdentity.revision,
    workflowRunId: argumentsValue.workflowRunId,
  });
  const handoff = verifyDownloadedHandoff({
    extractionRoot: path.join(run.runRoot, 'candidate'),
    handoffDirectory: transport.directory,
  });
  const script = fs.readFileSync(
    new URL('./remote/preflight.sh', import.meta.url),
  );
  const remote = await runSshScript({
    arguments: [
      handoff.candidate.source.product.revision,
      String(requiredRemoteBytes(handoff.completeInventory.totalSize)),
      'admission',
    ],
    script,
    timeoutMs: MAXIMUMS.sshPreflightMs,
  });
  const preflight = parseValidationPreflight(remote.stdout);
  const packaged = createValidationPackage({
    handoff,
    operationsIdentity,
    packageDirectory: path.join(run.runRoot, 'package'),
    preflight,
    transport,
  });
  process.stdout.write(
    canonicalJson({
      input: packaged.inputPath,
      inputDigest: packaged.inputDigest,
      packageRoot: packaged.packageRoot,
      runRoot: run.runRoot,
      workflowHead: transport.actions.run.headSha,
      workflowRunAttempt: transport.actions.run.attempt,
      workflowRunId: transport.actions.run.id,
    }),
  );
}

main().catch((error) => {
  const message =
    error instanceof ValidationPreflightCliError
      ? error.message
      : 'isolated validation preflight failed closed';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
