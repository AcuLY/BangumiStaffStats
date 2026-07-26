import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson, canonicalJsonDigest } from './canonical-json.mjs';
import { loadAcceptanceConfiguration } from './config.mjs';
import {
  validateAcceptanceInput,
  validateResult,
} from './contracts.mjs';
import { validateEvidenceFiles } from './evidence-validation.mjs';
import { verifyPackagePolicy } from './package-policy.mjs';
import {
  allocateRunRoot,
  attestOwnedRunRoot,
  cleanupRunRoot,
} from './run-root.mjs';
import { sanitizeSummary } from './runner.mjs';
import {
  decodeUtf8Strict,
  parseJsonStrict,
  readJsonStrict,
} from './strict-json.mjs';
import {
  attestSupervisorProtectedInputs,
  resealSupervisorProtectedInputs,
} from './supervisor-inputs.mjs';
import { SupervisorRuntimeOwnership } from './supervisor-runtime.mjs';
import {
  createWorkerCheckpointWriter,
  superviseAcceptanceWorker,
  supervisedFailureCells,
} from './supervisor.mjs';

const WORKER_MODULE = fileURLToPath(
  new URL('../bin/acceptance.mjs', import.meta.url),
);

function usage() {
  throw new Error(
    'usage: acceptance.mjs verify-package | validate-input FILE | ' +
      'validate-result FILE | run INPUT | cleanup RUN_ROOT',
  );
}

function exactFileArgument(values, command) {
  if (values.length !== 1 || !path.isAbsolute(values[0])) {
    throw new Error(`${command} requires one absolute path`);
  }
  return values[0];
}

function writeSupervisorInputCopy({ input, runRoot }) {
  const output = path.join(runRoot, 'supervised-input.json');
  const bytes = Buffer.from(canonicalJson(input));
  const descriptor = fs.openSync(
    output,
    fs.constants.O_CREAT |
      fs.constants.O_EXCL |
      fs.constants.O_WRONLY,
    0o400,
  );
  try {
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  const directory = fs.openSync(runRoot, 'r');
  try {
    fs.fsyncSync(directory);
  } finally {
    fs.closeSync(directory);
  }
  return verifySupervisorInputCopy({
    digest: canonicalJsonDigest(input),
    input,
    path: output,
  });
}

function verifySupervisorInputCopy(copy) {
  const descriptor = fs.openSync(
    copy.path,
    fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
  );
  let bytes;
  let information;
  try {
    information = fs.fstatSync(descriptor);
    bytes = fs.readFileSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  const current = fs.lstatSync(copy.path);
  if (
    !information.isFile() ||
    information.nlink !== 1 ||
    !current.isFile() ||
    current.isSymbolicLink() ||
    current.nlink !== 1 ||
    current.dev !== information.dev ||
    current.ino !== information.ino
  ) {
    throw new Error('supervisor input copy is not one regular file');
  }
  const source = decodeUtf8Strict(bytes, copy.path);
  if (
    source !== canonicalJson(copy.input) ||
    canonicalJsonDigest(parseJsonStrict(source, copy.path)) !== copy.digest
  ) {
    throw new Error('supervisor input copy changed after its parent seal');
  }
  return Object.freeze({ ...copy });
}

async function actualInputAfter(input, inputBefore, supervisorInput) {
  try {
    if (supervisorInput) verifySupervisorInputCopy(supervisorInput);
    return await resealSupervisorProtectedInputs(input, inputBefore);
  } catch (error) {
    return Object.freeze({
      digest: canonicalJsonDigest({
        kind: 'supervisor-input-reseal-failure',
        summary: sanitizeSummary(
          error instanceof Error ? error.message : String(error),
        ),
      }),
      document: null,
      error: sanitizeSummary(
        error instanceof Error ? error.message : String(error),
      ),
    });
  }
}

async function writeParentFailure({
  cleanup,
  configuration,
  input,
  inputBefore,
  reason,
  runAllocation,
  supervisorInput,
  suiteStarted,
  workerOutput,
  cells,
}) {
  const inputAfter = await actualInputAfter(
    input,
    inputBefore,
    supervisorInput,
  );
  const { writeSupervisedCanonicalFailure } =
    await import('./orchestrator.mjs');
  const output = await writeSupervisedCanonicalFailure({
    cells,
    cleanup,
    configuration,
    input,
    inputAfter,
    inputBefore,
    reason,
    runId: runAllocation.runId,
    runRoot: runAllocation.runRoot,
    suiteDurationMs: performance.now() - suiteStarted,
    workerOutput,
  });
  process.stderr.write(
    `acceptance failed under parent supervision; result: ${path.join(
      runAllocation.runRoot,
      output.path,
    )}\n`,
  );
  return output;
}

async function runFormally(filePath, configuration) {
  verifyPackagePolicy();
  const input = validateAcceptanceInput(readJsonStrict(filePath));
  const inputBefore = await attestSupervisorProtectedInputs(input);
  const runAllocation = allocateRunRoot();
  const suiteStarted = performance.now();
  const preparationController = new AbortController();
  const preparationTimer = setTimeout(
    () =>
      preparationController.abort(
        Object.assign(
          new Error('acceptance suite expired during parent runtime preparation'),
          { code: 'SUPERVISOR_SUITE_TIMEOUT' },
        ),
      ),
    configuration.budgets.timeouts.suiteMs,
  );
  let runtimeOwnership;
  let supervisorInput;
  try {
    supervisorInput = writeSupervisorInputCopy({
      input,
      runRoot: runAllocation.runRoot,
    });
    runtimeOwnership = new SupervisorRuntimeOwnership({
      allocation: runAllocation,
      artifacts: inputBefore.artifacts,
      budgets: configuration.budgets,
      docker: input.tools.docker,
      dockerEndpoint: input.tools.docker.endpoint,
    });
    await runtimeOwnership.prepare({
      signal: preparationController.signal,
    });
  } catch (error) {
    clearTimeout(preparationTimer);
    let external = null;
    const cleanupFailures = [];
    if (runtimeOwnership !== undefined) {
      try {
        external = await runtimeOwnership.cleanup();
      } catch (cleanupError) {
        cleanupFailures.push(cleanupError);
      }
    }
    const cleanup = Object.freeze({
      cleanupFailures: Object.freeze(cleanupFailures),
      external,
      observedProcessCount: 0,
      terminatedDescendantCount: 0,
    });
    const cells = supervisedFailureCells({
      matrix: configuration.matrix,
      acceptedCells: [],
      code: preparationController.signal.aborted
        ? 'SUPERVISOR_SUITE_TIMEOUT'
        : 'SUPERVISOR_RUNTIME_PREPARE',
      summary: sanitizeSummary(
        error instanceof Error ? error.message : String(error),
      ),
      durationMs: performance.now() - suiteStarted,
    });
    await writeParentFailure({
      cells,
      cleanup,
      configuration,
      input,
      inputBefore,
      reason: error,
      runAllocation,
      supervisorInput,
      suiteStarted,
      workerOutput: Object.freeze({
        stderrBytes: 0,
        stderrTruncated: false,
        stdoutBytes: 0,
        stdoutTruncated: false,
      }),
    });
    return 1;
  }
  clearTimeout(preparationTimer);
  try {
    return await superviseAcceptanceWorker({
      cleanupExternalOwnership: () => runtimeOwnership.cleanup(),
      configuration,
      inputBeforeDigest: inputBefore.digest,
      inputDocumentDigest: supervisorInput.digest,
      inputPath: supervisorInput.path,
      nodeExecutable: input.tools.node.path,
      runId: runAllocation.runId,
      runRoot: runAllocation.runRoot,
      suiteStartedAt: suiteStarted,
      validateExternalOwnershipRelease: () =>
        runtimeOwnership.verifyReleased(),
      validateWorkerResult: async ({ acceptedCells, code, runId, runRoot }) => {
        verifySupervisorInputCopy(supervisorInput);
        const inputAfter =
          await resealSupervisorProtectedInputs(input, inputBefore);
        const result = validateResult(
          readJsonStrict(path.join(runRoot, 'result.json')),
          configuration.matrix,
          configuration.budgets,
        );
        if (
          result.runId !== runId ||
          result.seals.inputBefore !== inputBefore.digest ||
          result.seals.inputAfter !== inputAfter.digest ||
          (code === 0 && result.verdict === null) ||
          (code === 1 && result.verdict !== null)
        ) {
          throw new Error('worker result differs from parent-supervised facts');
        }
        for (const [index, accepted] of acceptedCells.entries()) {
          if (canonicalJson(result.cells[index]) !== canonicalJson(accepted)) {
            throw new Error(
              `worker result changed acknowledged cell ${accepted.id}`,
            );
          }
        }
        await validateEvidenceFiles({
          runRoot,
          cells: result.cells,
        });
      },
      workerModule: WORKER_MODULE,
      writeSupervisedFailure: async ({
        cells,
        cleanup,
        reason,
        workerOutput,
      }) =>
        writeParentFailure({
          cells,
          cleanup,
          configuration,
          input,
          inputBefore,
          reason,
          runAllocation,
          supervisorInput,
          suiteStarted,
          workerOutput,
        }),
    });
  } catch (error) {
    if (fs.existsSync(path.join(runAllocation.runRoot, 'result.json'))) {
      throw error;
    }
    let external = null;
    const cleanupFailures = [];
    try {
      external = await runtimeOwnership.cleanup();
    } catch (cleanupError) {
      cleanupFailures.push(cleanupError);
    }
    const cleanup = Object.freeze({
      cleanupFailures: Object.freeze(cleanupFailures),
      external,
      observedProcessCount: 0,
      terminatedDescendantCount: 0,
    });
    const cells = supervisedFailureCells({
      matrix: configuration.matrix,
      acceptedCells: [],
      code:
        typeof error?.code === 'string' &&
        /^[A-Z][A-Z0-9_]{2,63}$/u.test(error.code)
          ? error.code
          : 'SUPERVISOR_WORKER_START',
      summary: sanitizeSummary(
        error instanceof Error ? error.message : String(error),
      ),
      durationMs: performance.now() - suiteStarted,
    });
    await writeParentFailure({
      cells,
      cleanup,
      configuration,
      input,
      inputBefore,
      reason: error,
      runAllocation,
      supervisorInput,
      suiteStarted,
      workerOutput: Object.freeze({
        stderrBytes: 0,
        stderrTruncated: false,
        stdoutBytes: 0,
        stdoutTruncated: false,
      }),
    });
    return 1;
  }
}

export async function runSupervisedWorker(argv) {
  if (
    process.env.BGMSS_ACCEPTANCE_SUPERVISED_WORKER !== '1' ||
    typeof process.send !== 'function'
  ) {
    throw new Error('hidden supervised-worker entrypoint is parent-only');
  }
  const [
    command,
    inputPath,
    runRoot,
    inputBeforeDigest,
    inputDocumentDigest,
  ] = argv;
  if (
    command !== '__supervised-worker' ||
    !path.isAbsolute(inputPath) ||
    !path.isAbsolute(runRoot) ||
    inputPath !== path.join(runRoot, 'supervised-input.json') ||
    !/^sha256:[0-9a-f]{64}$/u.test(inputBeforeDigest) ||
    !/^sha256:[0-9a-f]{64}$/u.test(inputDocumentDigest) ||
    argv.length !== 5
  ) {
    throw new Error('hidden supervised-worker arguments are invalid');
  }
  const configuration = loadAcceptanceConfiguration();
  const inputSource = decodeUtf8Strict(
    (() => {
      const descriptor = fs.openSync(
        inputPath,
        fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
      );
      try {
        const information = fs.fstatSync(descriptor);
        if (!information.isFile() || information.nlink !== 1) {
          throw new Error('hidden supervised-worker input is not regular');
        }
        return fs.readFileSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
    })(),
    inputPath,
  );
  const input = validateAcceptanceInput(
    parseJsonStrict(inputSource, inputPath),
  );
  if (
    inputSource !== canonicalJson(input) ||
    canonicalJsonDigest(input) !== inputDocumentDigest
  ) {
    throw new Error('hidden supervised-worker input seal is invalid');
  }
  const runAllocation = attestOwnedRunRoot(runRoot);
  const checkpoint = createWorkerCheckpointWriter({
    runId: runAllocation.runId,
    matrixVersion: configuration.matrix.matrixVersion,
  });
  const { runAcceptance } = await import('./orchestrator.mjs');
  return runAcceptance({
    checkpoint,
    configuration,
    input,
    packagePolicyVerified: true,
    runAllocation,
    supervisorInputBefore: inputBeforeDigest,
    supervisorPreparedImages: true,
  });
}

export async function main(argv, { runAcceptance } = {}) {
  const [command, ...values] = argv;
  if (command === '__supervised-worker') {
    return runSupervisedWorker(argv);
  }
  const configuration = loadAcceptanceConfiguration();
  if (command === 'verify-package') {
    if (values.length !== 0) usage();
    const result = verifyPackagePolicy();
    process.stdout.write(`${canonicalJson(result.installPolicy)}`);
    return 0;
  }
  if (command === 'validate-input') {
    const filePath = exactFileArgument(values, command);
    validateAcceptanceInput(readJsonStrict(filePath));
    process.stdout.write('acceptance input is valid\n');
    return 0;
  }
  if (command === 'validate-result') {
    const filePath = exactFileArgument(values, command);
    validateResult(
      readJsonStrict(filePath),
      configuration.matrix,
      configuration.budgets,
    );
    process.stdout.write('acceptance result is valid\n');
    return 0;
  }
  if (command === 'cleanup') {
    const runRoot = exactFileArgument(values, command);
    cleanupRunRoot(runRoot);
    process.stdout.write('acceptance run root removed\n');
    return 0;
  }
  if (command === 'run') {
    const filePath = exactFileArgument(values, command);
    if (typeof runAcceptance === 'function') {
      return runAcceptance({
        input: validateAcceptanceInput(readJsonStrict(filePath)),
        configuration,
      });
    }
    return runFormally(filePath, configuration);
  }
  usage();
}
