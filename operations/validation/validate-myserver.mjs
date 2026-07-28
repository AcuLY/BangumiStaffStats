#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  canonicalJson,
  canonicalJsonDigest,
} from '../lib/canonical-json.mjs';
import { sha256File } from '../lib/digest.mjs';
import { writeCanonicalJsonFile } from '../lib/immutable-output.mjs';
import { requireCanonicalPath } from '../lib/path-policy.mjs';
import { parseJsonStrict } from '../lib/strict-json.mjs';
import {
  verifyAuthenticatedActionsHandoff,
} from './actions-handoff.mjs';
import {
  CLAIM,
  MAXIMUMS,
  REMOTE_ROOT,
  REPOSITORY_ROOT,
} from './constants.mjs';
import { currentOperationsIdentity } from './package.mjs';
import {
  assertResourcesSemantics,
  assertResultSemantics,
  comparePreflights,
} from './policy.mjs';
import {
  parseValidationPreflight,
  validateValidationResources,
} from './schema.mjs';
import { verifyDownloadedHandoff } from './sealed-handoff.mjs';
import { verifySealedValidationPackage } from './sealed-package.mjs';
import {
  receiveFileToRemote,
  runSshScript,
  terminateActiveSshProcesses,
} from './ssh.mjs';

class ValidationCliError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'ValidationCliError';
  }
}

function fail(message, cause) {
  throw new ValidationCliError(message, cause ? { cause } : undefined);
}

let requestedSignal = null;

function installSignalRecovery() {
  const handlers = new Map();
  for (const signal of ['SIGHUP', 'SIGINT', 'SIGTERM']) {
    const handler = () => {
      if (requestedSignal !== null) return;
      requestedSignal = signal;
      terminateActiveSshProcesses(`controller-${signal.toLowerCase()}`);
    };
    handlers.set(signal, handler);
    process.on(signal, handler);
  }
  return () => {
    for (const [signal, handler] of handlers) {
      process.off(signal, handler);
    }
  };
}

function assertControllerActive() {
  if (requestedSignal !== null) {
    fail(`isolated validation interrupted by ${requestedSignal}`);
  }
}

function parseArguments(argv) {
  if (argv.length !== 2 || argv[0] !== '--input') {
    fail('usage: validate-myserver.mjs --input /absolute/package/validation-input-v1.json');
  }
  const input = requireCanonicalPath(path.resolve(argv[1]), {
    label: 'validation input',
    requireSingleLink: true,
    type: 'file',
  });
  if (path.basename(input) !== 'validation-input-v1.json') {
    fail('validation input must use its exact sealed filename');
  }
  return { input, packageRoot: path.dirname(input) };
}

function parseCanonicalObject(source, label) {
  const value = parseJsonStrict(source, label);
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    canonicalJson(value) !== source
  ) {
    fail(`${label} is not one canonical JSON object`);
  }
  return value;
}

function renderBootstrapScript() {
  const bootstrap = fs.readFileSync(
    new URL('./remote/bootstrap.sh', import.meta.url),
    'utf8',
  );
  const library = fs.readFileSync(
    new URL('./remote/ownership-ledger.sh', import.meta.url),
  );
  const agent = fs.readFileSync(
    new URL('./remote/transfer-agent.sh', import.meta.url),
  );
  const rendered = bootstrap
    .replace(
      '__OWNERSHIP_LEDGER_LIBRARY_BASE64__',
      library.toString('base64'),
    )
    .replace('__TRANSFER_AGENT_BASE64__', agent.toString('base64'));
  if (
    rendered.includes('__OWNERSHIP_LEDGER_LIBRARY_BASE64__') ||
    rendered.includes('__TRANSFER_AGENT_BASE64__')
  ) {
    fail('remote bootstrap helper embedding is incomplete');
  }
  return {
    agentDigest: sha256File(
      new URL('./remote/transfer-agent.sh', import.meta.url),
    ),
    libraryDigest: sha256File(
      new URL('./remote/ownership-ledger.sh', import.meta.url),
    ),
    script: Buffer.from(rendered),
  };
}

function transferDeadline() {
  return String(Math.floor(Date.now() / 1000) + 25_200);
}

function assertOperationsIdentity(input) {
  const current = currentOperationsIdentity();
  if (
    canonicalJson(current) !== canonicalJson(input.source.operations)
  ) {
    fail('current committed Operations identity differs from the sealed input');
  }
}

function transferRole(input, role) {
  const records = input.transfer.files.filter((entry) => entry.role === role);
  if (records.length !== 1) {
    fail(`sealed transfer role is not unique: ${role}`);
  }
  return records[0];
}

function assertTransferSource(input, role, source) {
  const record = transferRole(input, role);
  const canonical = requireCanonicalPath(source, {
    label: `re-authenticated ${role} source`,
    requireSingleLink: true,
    type: 'file',
  });
  const information = fs.statSync(canonical);
  if (
    information.size !== record.size ||
    sha256File(canonical) !== record.sha256
  ) {
    fail(`re-authenticated ${role} bytes differ from the sealed transfer`);
  }
}

function assertHandoffMatchesInput(handoff, input) {
  const candidatePath = path.join(
    handoff.candidateRoot,
    handoff.candidateDocument,
  );
  if (
    handoff.archiveDigest !== input.transport.candidateArchiveSha256 ||
    handoff.externalInventoryDigest !==
      input.transport.externalInventorySha256 ||
    handoff.completeInventory.contentAddress !== input.candidate.contentAddress ||
    sha256File(candidatePath) !== input.candidate.candidateDocumentSha256 ||
    canonicalJson(handoff.candidate.source.operationsController) !==
      canonicalJson(input.source.operations) ||
    canonicalJson(handoff.candidate.source.product) !==
      canonicalJson(input.source.product) ||
    handoff.candidate.applicationVersion !== input.candidate.applicationVersion ||
    handoff.candidate.publicationState !== input.candidate.publicationState
  ) {
    fail('live authenticated Actions handoff differs from the sealed input');
  }
  for (const role of ['api', 'updater']) {
    const expected = input.images[role];
    const observed = handoff.candidate.images[role];
    if (
      observed.declaredLoadReference !== expected.declaredLoadReference ||
      canonicalJson(observed.config) !== canonicalJson(expected.config) ||
      canonicalJson(observed.manifest) !== canonicalJson(expected.manifest)
    ) {
      fail(`live authenticated ${role} image differs from the sealed input`);
    }
  }
  const candidatePathFor = (relative) =>
    path.join(handoff.candidateRoot, ...relative.split('/'));
  for (const [role, source] of [
    [
      'accepted-receipt',
      candidatePathFor('accepted-development.json'),
    ],
    [
      'archive-smoke',
      candidatePathFor(handoff.candidate.assets.archiveSmoke.path),
    ],
    [
      'candidate-checksums',
      candidatePathFor('payload-checksums.sha256'),
    ],
    ['candidate-document', candidatePath],
    ['candidate-inventory', handoff.externalInventoryPath],
    [
      'compatibility',
      candidatePathFor(
        handoff.candidate.assets.compatibilityManifest.path,
      ),
    ],
    [
      'frontend',
      candidatePathFor(handoff.candidate.assets.frontend.path),
    ],
    [
      'api-image',
      candidatePathFor(handoff.candidate.images.api.archive.path),
    ],
    [
      'updater-image',
      candidatePathFor(handoff.candidate.images.updater.archive.path),
    ],
  ]) {
    assertTransferSource(input, role, source);
  }
  for (const [role, relative] of [
    [
      'minimal-manifest',
      'contracts/goldens/archive/valid/minimal/archive-manifest.json',
    ],
    [
      'minimal-sqlite',
      'contracts/goldens/archive/valid/minimal/bangumi.sqlite',
    ],
    ['prometheus-config', 'operations/prometheus/prometheus.yml'],
    ['prometheus-rules', 'operations/prometheus/rules.yml'],
    ['remote-entry', 'operations/validation/remote/entry.sh'],
  ]) {
    assertTransferSource(
      input,
      role,
      path.join(REPOSITORY_ROOT, ...relative.split('/')),
    );
  }
}

function assertTransportMatchesInput(transport, input) {
  if (
    canonicalJson(transport.actions) !==
      canonicalJson(input.transport.actions)
  ) {
    fail('live authenticated Actions authority differs from the sealed input');
  }
}

function assertFreshPreflight(before, fresh) {
  const comparison = comparePreflights(before, fresh);
  if (!comparison.equal) {
    fail('fresh preflight differs from the admitted baseline');
  }
  if (
    canonicalJsonDigest(fresh) !== canonicalJsonDigest(before) &&
    canonicalJson(fresh.capacity) === canonicalJson(before.capacity)
  ) {
    fail('fresh preflight serialization differs without a capacity observation');
  }
  return comparison;
}

async function runPreflight(input, requiredBytes, mode = 'admission') {
  if (mode !== 'admission' && mode !== 'observation') {
    fail('remote preflight mode is not admitted');
  }
  const script = fs.readFileSync(
    new URL('./remote/preflight.sh', import.meta.url),
  );
  const result = await runSshScript({
    arguments: [
      input.source.product.revision,
      String(requiredBytes),
      mode,
    ],
    script,
    timeoutMs: MAXIMUMS.sshPreflightMs,
  });
  return parseValidationPreflight(result.stdout);
}

function exactRemoteEnvelope(value, sealed) {
  if (
    Object.keys(value).sort().join(',') !==
      'inputDigest,outcome,resources,runId,schemaVersion' ||
    value.schemaVersion !== 'operations-validation-remote-v1' ||
    value.runId !== sealed.input.runId ||
    value.inputDigest !== sealed.inputDigest ||
    value.outcome === null ||
    typeof value.outcome !== 'object' ||
    Array.isArray(value.outcome) ||
    Object.keys(value.outcome).sort().join(',') !==
      'cleanup,commands,continuousHealth,errors,exercises,health,producer,statuses'
  ) {
    fail('remote validation envelope has an invalid closed shape');
  }
  validateValidationResources(value.resources);
  assertResourcesSemantics(value.resources, sealed.input, {
    allowPartial: value.outcome.statuses.primary !== 'succeeded',
  });
  return value;
}

function buildResult({ after, before, envelope, sealed }) {
  const nonInterference = comparePreflights(before, after);
  const remoteSucceeded =
    envelope.outcome.statuses.primary === 'succeeded' &&
    envelope.outcome.statuses.rollback === 'succeeded' &&
    envelope.outcome.statuses.cleanup === 'succeeded' &&
    envelope.outcome.cleanup.zeroResidue === true &&
    envelope.outcome.cleanup.rootAbsent === true &&
    envelope.outcome.cleanup.namedVolumesNeverObserved === true &&
    nonInterference.equal === true &&
    envelope.outcome.errors.primary === null;
  const result = {
    claim: remoteSucceeded
      ? CLAIM
      : 'isolated-operations-validation-failed-production-not-activated',
    cleanup: envelope.outcome.cleanup,
    commands: envelope.outcome.commands,
    continuousHealth: envelope.outcome.continuousHealth,
    conclusion: remoteSucceeded ? CLAIM : 'failed',
    deployed: false,
    errors: envelope.outcome.errors,
    exercises: {
      actionsCoveredExercises: {
        candidateDigest: sealed.input.candidate.contentAddress,
        operationsRevision: sealed.input.source.operations.revision,
        updaterNoChange: true,
        updaterTimeout: true,
        workflowHead: sealed.input.transport.actions.run.headSha,
        workflowRunAttempt: sealed.input.transport.actions.run.attempt,
        workflowRunId: sealed.input.transport.actions.run.id,
      },
      remoteExercises: envelope.outcome.exercises.remoteExercises,
    },
    health: envelope.outcome.health,
    inputDigest: sealed.inputDigest,
    nonInterference,
    preflightDigest: canonicalJsonDigest(before),
    producer: envelope.outcome.producer,
    productionActivated: false,
    released: false,
    resourcesDigest: canonicalJsonDigest(envelope.resources),
    runId: sealed.input.runId,
    schemaVersion: 'operations-validation-result-v1',
    securityProjection: envelope.resources.securityProjection,
    securityProjectionDigest: envelope.resources.securityProjectionDigest,
    source: sealed.input.source,
    statuses: envelope.outcome.statuses,
    transport: sealed.input.transport,
  };
  assertResultSemantics({
    after,
    before,
    input: sealed.input,
    resources: envelope.resources,
    result,
  });
  return result;
}

function fallbackRemoteEnvelope({
  after,
  primary,
  recoveryAttempted,
  recoverySucceeded,
  sealed,
  secondary,
}) {
  const absence = after.absence;
  const zeroResidue =
    absence.rootAbsent === true &&
    absence.projectAbsent === true &&
    absence.namedVolumesAbsent === true &&
    absence.imagesAbsent === true &&
    absence.portFree === true;
  return exactRemoteEnvelope(
    {
      inputDigest: sealed.inputDigest,
      outcome: {
        cleanup: {
          namedVolumesNeverObserved: absence.namedVolumesAbsent,
          residue: zeroResidue ? [] : ['remote-validation-residue'],
          rootAbsent: absence.rootAbsent,
          status: zeroResidue ? 'succeeded' : 'failed',
          zeroResidue,
        },
        commands: [],
        continuousHealth: null,
        errors: { primary, secondary: [...new Set(secondary)].sort() },
        exercises: {
          remoteExercises: {
            archiveCorruptionRejected: null,
            frontendRollback: null,
            lockContentionRejected: null,
            postSwitchRollback: null,
            updaterFailure: null,
          },
        },
        health: {
          full: null,
          minimal: null,
          reactivated: null,
          rolledBack: null,
        },
        producer: null,
        statuses: {
          cleanup: zeroResidue ? 'succeeded' : 'failed',
          primary: 'failed',
          rollback: recoveryAttempted
            ? recoverySucceeded
              ? 'succeeded'
              : 'failed'
            : 'not-needed',
        },
      },
      resources: {
        containers: [],
        images: [],
        namedVolumeObserved: !absence.namedVolumesAbsent,
        networks: [],
        pathManifest: null,
        port: { hostIp: '127.0.0.1', published: 19090, target: 8080 },
        project: 'bgmss_ops_validation',
        runId: sealed.input.runId,
        schemaVersion: 'operations-validation-resources-v1',
        securityProjection: null,
        securityProjectionDigest: null,
      },
      runId: sealed.input.runId,
      schemaVersion: 'operations-validation-remote-v1',
    },
    sealed,
  );
}

function prepareReverificationRoots(runRoot, suffix = '') {
  const authenticated = path.join(runRoot, 'authenticated');
  requireCanonicalPath(authenticated, {
    below: runRoot,
    label: 'original authenticated handoff',
    type: 'directory',
  });
  const reauthenticatedName = `reauthenticated${suffix}`;
  const candidateName = `candidate-recheck${suffix}`;
  for (const name of [reauthenticatedName, candidateName]) {
    const candidate = path.join(runRoot, name);
    if (fs.existsSync(candidate)) {
      fail(`one-shot validation reverification root already exists: ${name}`);
    }
  }
  return {
    authenticated,
    candidate: path.join(runRoot, candidateName),
    reauthenticated: path.join(runRoot, reauthenticatedName),
  };
}

async function main() {
  const removeSignalRecovery = installSignalRecovery();
  try {
  const argumentsValue = parseArguments(process.argv.slice(2));
  let sealed = verifySealedValidationPackage(argumentsValue.packageRoot);
  if (sealed.inputPath !== argumentsValue.input) {
    fail('validation input does not identify its sealed package root');
  }
  assertOperationsIdentity(sealed.input);
  const runRoot = requireCanonicalPath(path.dirname(sealed.packageRoot), {
    label: 'validation local run root',
    type: 'directory',
  });
  const recheck = prepareReverificationRoots(runRoot);
  const transport = verifyAuthenticatedActionsHandoff({
    authenticatedDownloadRoot: recheck.reauthenticated,
    handoffDirectory: recheck.authenticated,
    workflowHead: sealed.input.transport.actions.run.headSha,
    workflowRunId: sealed.input.transport.actions.run.id,
  });
  assertTransportMatchesInput(transport, sealed.input);
  const handoff = verifyDownloadedHandoff({
    extractionRoot: recheck.candidate,
    handoffDirectory: transport.directory,
  });
  assertHandoffMatchesInput(handoff, sealed.input);

  const before = sealed.preflight;
  const fresh = await runPreflight(
    sealed.input,
    before.capacity.requiredBytes,
  );
  assertFreshPreflight(before, fresh);

  // Repeat every local and remote read-only authority immediately before the
  // first remote mutation.
  sealed = verifySealedValidationPackage(argumentsValue.packageRoot);
  assertOperationsIdentity(sealed.input);
  const finalRecheck = prepareReverificationRoots(runRoot, '-final');
  const finalTransport = verifyAuthenticatedActionsHandoff({
    authenticatedDownloadRoot: finalRecheck.reauthenticated,
    handoffDirectory: finalRecheck.authenticated,
    workflowHead: sealed.input.transport.actions.run.headSha,
    workflowRunId: sealed.input.transport.actions.run.id,
  });
  assertTransportMatchesInput(finalTransport, sealed.input);
  const finalHandoff = verifyDownloadedHandoff({
    extractionRoot: finalRecheck.candidate,
    handoffDirectory: finalTransport.directory,
  });
  assertHandoffMatchesInput(finalHandoff, sealed.input);
  const immediatelyBefore = await runPreflight(
    sealed.input,
    before.capacity.requiredBytes,
  );
  assertFreshPreflight(before, immediatelyBefore);

  const bootstrap = renderBootstrapScript();
  const launchScript = fs.readFileSync(
    new URL('./remote/launch.sh', import.meta.url),
  );
  const recoverScript = fs.readFileSync(
    new URL('./remote/recover.sh', import.meta.url),
  );
  const entry = sealed.files.get('remote-entry');
  const entryDigest = sha256File(entry);
  const ownershipNonce =
    `sha256:${randomBytes(32).toString('hex')}`;
  let markerDigest;
  let ledgerHead;
  let remoteMutated = false;
  let envelope;
  let remoteFailure = null;
  let recoveryAttempted = false;
  let recoverySucceeded = false;
  const recoverySecondary = [];
  try {
    // From dispatch onward the remote may have performed the first exclusive
    // create even if the SSH response is lost.
    remoteMutated = true;
    const bootstrapResult = await runSshScript({
      arguments: [
        sealed.input.runId,
        sealed.inputDigest,
        bootstrap.libraryDigest,
        bootstrap.agentDigest,
        transferDeadline(),
        ownershipNonce,
      ],
      script: bootstrap.script,
      timeoutMs: MAXIMUMS.sshPreflightMs,
    });
    const bootstrapValue = parseCanonicalObject(
      bootstrapResult.stdout,
      'remote validation bootstrap',
    );
    if (
      Object.keys(bootstrapValue).sort().join(',') !==
        'ledgerDevice,ledgerHead,ledgerInode,markerDigest,rootDevice,rootInode,runId' ||
      bootstrapValue.runId !== sealed.input.runId ||
      !/^sha256:[0-9a-f]{64}$/u.test(bootstrapValue.markerDigest) ||
      !/^sha256:[0-9a-f]{64}$/u.test(bootstrapValue.ledgerHead) ||
      !/^[0-9]+$/u.test(bootstrapValue.ledgerDevice) ||
      !/^[0-9]+$/u.test(bootstrapValue.ledgerInode)
    ) {
      fail('remote validation bootstrap identity is invalid');
    }
    markerDigest = bootstrapValue.markerDigest;
    ledgerHead = bootstrapValue.ledgerHead;
    assertControllerActive();
    let transfer = await receiveFileToRemote({
      agentArguments: [
        sealed.input.runId,
        sealed.inputDigest,
        markerDigest,
        ledgerHead,
        'input',
        'validation-input-v1.json',
        sealed.inputDigest,
        String(fs.statSync(sealed.inputPath).size),
        '0400',
        transferDeadline(),
      ],
      source: sealed.inputPath,
    });
    let transferValue = parseCanonicalObject(
      transfer.stdout,
      'remote validation input transfer',
    );
    if (
      Object.keys(transferValue).sort().join(',') !==
        'ledgerHead,path,status' ||
      transferValue.path !== 'incoming/validation-input-v1.json' ||
      transferValue.status !== 'closed' ||
      !/^sha256:[0-9a-f]{64}$/u.test(transferValue.ledgerHead)
    ) {
      fail('remote validation input transfer identity is invalid');
    }
    ledgerHead = transferValue.ledgerHead;
    for (const record of sealed.input.transfer.files) {
      assertControllerActive();
      transfer = await receiveFileToRemote({
        agentArguments: [
          sealed.input.runId,
          sealed.inputDigest,
          markerDigest,
          ledgerHead,
          'file',
          record.id,
          record.sha256,
          String(record.size),
          record.mode,
          transferDeadline(),
        ],
        source: path.join(sealed.packageRoot, record.remoteName),
      });
      transferValue = parseCanonicalObject(
        transfer.stdout,
        `remote validation transfer ${record.role}`,
      );
      if (
        Object.keys(transferValue).sort().join(',') !==
          'ledgerHead,path,status' ||
        transferValue.path !== `incoming/${record.remoteName}` ||
        transferValue.status !== 'closed' ||
        !/^sha256:[0-9a-f]{64}$/u.test(transferValue.ledgerHead)
      ) {
        fail(`remote validation transfer identity is invalid: ${record.role}`);
      }
      ledgerHead = transferValue.ledgerHead;
    }
    assertControllerActive();
    const remote = await runSshScript({
      arguments: [
        sealed.input.runId,
        sealed.inputDigest,
        entryDigest,
        markerDigest,
        ledgerHead,
      ],
      script: launchScript,
      timeoutMs: MAXIMUMS.remoteRunMs,
    });
    envelope = exactRemoteEnvelope(
      parseCanonicalObject(remote.stdout, 'remote validation result'),
      sealed,
    );
  } catch (error) {
    remoteFailure = error;
    if (remoteMutated) {
      recoveryAttempted = true;
      try {
        await runSshScript({
          arguments: [
            sealed.input.runId,
            sealed.inputDigest,
            entryDigest,
            ownershipNonce,
            markerDigest ?? 'discover',
            'discover',
          ],
          script: recoverScript,
          timeoutMs: MAXIMUMS.sshPreflightMs,
        });
        recoverySucceeded = true;
      } catch {
        recoverySecondary.push('SEALED_RECOVERY_FAILED');
      }
    }
  }

  if (remoteFailure === null) assertControllerActive();
  const after = await runPreflight(
    sealed.input,
    before.capacity.requiredBytes,
    'observation',
  );
  if (remoteFailure !== null) {
    envelope = fallbackRemoteEnvelope({
      after,
      primary:
        requestedSignal === null
          ? 'REMOTE_VALIDATION_FAILED'
          : 'REMOTE_VALIDATION_INTERRUPTED',
      recoveryAttempted,
      recoverySucceeded,
      sealed,
      secondary: recoverySecondary,
    });
  }
  const result = buildResult({ after, before, envelope, sealed });
  const evidenceRoot = path.join(runRoot, 'validation-evidence');
  fs.mkdirSync(evidenceRoot, { mode: 0o700 });
  if (fs.readdirSync(evidenceRoot).length !== 0) {
    fail('validation evidence root must be new and empty');
  }
  const written = {};
  for (const [name, value] of [
    ['validation-before-v1.json', before],
    ['validation-resources-v1.json', envelope.resources],
    ['validation-after-v1.json', after],
    ['validation-result-v1.json', result],
  ]) {
    written[name] = writeCanonicalJsonFile({
      root: evidenceRoot,
      relativePath: name,
      value,
    });
  }
  process.stdout.write(
    canonicalJson({
      evidenceRoot,
      result: written['validation-result-v1.json'].path,
      resultDigest: written['validation-result-v1.json'].sha256,
      runId: sealed.input.runId,
      status: result.conclusion,
    }),
  );
  if (result.conclusion === 'failed') process.exitCode = 1;
  } finally {
    removeSignalRecovery();
  }
}

main().catch((error) => {
  const message =
    error instanceof ValidationCliError
      ? error.message
      : 'isolated remote validation failed closed';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
