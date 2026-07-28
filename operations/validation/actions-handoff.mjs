import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { canonicalJson, deepFreeze } from '../lib/canonical-json.mjs';
import { sha256File } from '../lib/digest.mjs';
import { requireCanonicalPath } from '../lib/path-policy.mjs';
import { parseJsonStrict } from '../lib/strict-json.mjs';
import {
  EXACT_HANDOFF_FILES,
  MAXIMUMS,
  REPOSITORY_ROOT,
} from './constants.mjs';

const REPOSITORY_OWNER = 'AcuLY';
const REPOSITORY_NAME = 'BangumiStaffStats';
const REPOSITORY = `${REPOSITORY_OWNER}/${REPOSITORY_NAME}`;
const GITHUB_HOST = 'github.com';
const WORKFLOW_NAME = 'operations-verification';
const WORKFLOW_PATH = '.github/workflows/operations.yml';
const GITHUB_API_VERSION = '2022-11-28';
const ARTIFACT_MAXIMUM_AGE_MS = 24 * 60 * 60 * 1000;
const ALLOWED_EVENTS = Object.freeze([
  'pull_request',
  'push',
  'workflow_dispatch',
]);

export class ActionsHandoffError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'ActionsHandoffError';
  }
}

function fail(message, cause) {
  throw new ActionsHandoffError(message, cause ? { cause } : undefined);
}

function ghExecutable() {
  const candidates = [
    '/usr/bin/gh',
    '/usr/local/bin/gh',
    '/opt/homebrew/bin/gh',
    ...String(process.env.PATH ?? '')
      .split(path.delimiter)
      .filter((entry) => path.isAbsolute(entry))
      .map((entry) => path.join(entry, 'gh')),
  ];
  for (const candidate of candidates) {
    try {
      if (!path.isAbsolute(candidate)) continue;
      const resolved = fs.realpathSync.native(candidate);
      const canonical = requireCanonicalPath(resolved, {
        label: 'GitHub CLI executable',
        requireSingleLink: true,
        type: 'file',
      });
      const information = fs.lstatSync(canonical);
      if (
        !information.isSymbolicLink() &&
        information.nlink === 1 &&
        canonical !== REPOSITORY_ROOT &&
        !canonical.startsWith(`${REPOSITORY_ROOT}${path.sep}`) &&
        (information.mode & 0o111) !== 0
      ) {
        return canonical;
      }
    } catch {}
  }
  fail('authenticated GitHub CLI is unavailable');
}

function ghEnvironment() {
  const environment = {
    HOME: process.env.HOME,
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    NO_COLOR: '1',
    PATH: '/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin',
    TZ: 'UTC',
  };
  for (const name of ['GH_CONFIG_DIR', 'GH_ENTERPRISE_TOKEN', 'GH_HOST', 'GH_TOKEN']) {
    if (
      typeof process.env[name] === 'string' &&
      process.env[name].length > 0 &&
      !process.env[name].includes('\0')
    ) {
      environment[name] = process.env[name];
    }
  }
  return environment;
}

function runGh(argumentsList, label) {
  const result = spawnSync(ghExecutable(), argumentsList, {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    env: ghEnvironment(),
    maxBuffer: 4 * 1024 * 1024,
    shell: false,
    timeout: 120_000,
    windowsHide: true,
  });
  if (
    result.error ||
    result.status !== 0 ||
    result.signal !== null ||
    typeof result.stdout !== 'string' ||
    result.stdout.length > 4 * 1024 * 1024 ||
    typeof result.stderr !== 'string' ||
    result.stderr.length > 4 * 1024 * 1024
  ) {
    fail(`${label} failed without an authenticated bounded result`, result.error);
  }
  return result.stdout;
}

function runGhToFile(argumentsList, label, output) {
  const descriptor = fs.openSync(output, 'wx', 0o600);
  let result;
  try {
    result = spawnSync(ghExecutable(), argumentsList, {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
      env: ghEnvironment(),
      maxBuffer: 4 * 1024 * 1024,
      shell: false,
      stdio: ['ignore', descriptor, 'pipe'],
      timeout: 20 * 60 * 1000,
      windowsHide: true,
    });
  } finally {
    fs.closeSync(descriptor);
  }
  if (
    result.error ||
    result.status !== 0 ||
    result.signal !== null ||
    typeof result.stderr !== 'string' ||
    result.stderr.length > 4 * 1024 * 1024
  ) {
    fail(`${label} failed without an authenticated bounded result`, result.error);
  }
}

function unzipExecutable() {
  for (const candidate of [
    '/usr/bin/unzip',
    '/bin/unzip',
    '/usr/local/bin/unzip',
  ]) {
    try {
      const canonical = requireCanonicalPath(candidate, {
        label: 'unzip executable',
        requireSingleLink: true,
        type: 'file',
      });
      if (
        canonical !== REPOSITORY_ROOT &&
        !canonical.startsWith(`${REPOSITORY_ROOT}${path.sep}`) &&
        (fs.statSync(canonical).mode & 0o111) !== 0
      ) {
        return canonical;
      }
    } catch {}
  }
  fail('fixed unzip executable is unavailable');
}

function runUnzip(argumentsList, label) {
  const result = spawnSync(unzipExecutable(), argumentsList, {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    env: {
      LANG: 'C.UTF-8',
      LC_ALL: 'C.UTF-8',
      PATH: '/usr/bin:/bin:/usr/local/bin',
      TZ: 'UTC',
    },
    maxBuffer: 4 * 1024 * 1024,
    shell: false,
    timeout: 10 * 60 * 1000,
    windowsHide: true,
  });
  if (
    result.error ||
    result.status !== 0 ||
    result.signal !== null ||
    typeof result.stdout !== 'string' ||
    result.stdout.length > 4 * 1024 * 1024 ||
    typeof result.stderr !== 'string' ||
    result.stderr.length > 4 * 1024 * 1024
  ) {
    fail(`${label} failed closed`, result.error);
  }
  return result.stdout;
}

function apiArguments(endpoint, { paginate = false } = {}) {
  const result = [
    'api',
    '--method',
    'GET',
    '-H',
    `X-GitHub-Api-Version: ${GITHUB_API_VERSION}`,
    '--hostname',
    GITHUB_HOST,
    endpoint,
  ];
  if (paginate) result.push('--paginate', '--slurp');
  return result;
}

function apiObject(endpoint, label) {
  const value = parseJsonStrict(
    runGh(apiArguments(endpoint), label),
    `${label} response`,
  );
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} did not return one object`);
  }
  return value;
}

function apiPages(endpoint, label) {
  const value = parseJsonStrict(
    runGh(apiArguments(endpoint, { paginate: true }), label),
    `${label} response`,
  );
  const pages = Array.isArray(value) ? value : [value];
  if (
    pages.length === 0 ||
    pages.some(
      (page) =>
        page === null || typeof page !== 'object' || Array.isArray(page),
    )
  ) {
    fail(`${label} did not return a bounded object page set`);
  }
  return pages;
}

function positiveDecimal(value, label) {
  if (
    typeof value === 'number' &&
    (!Number.isSafeInteger(value) || value < 1)
  ) {
    fail(`${label} must be a positive bounded decimal`);
  }
  const text = String(value);
  if (!/^[1-9][0-9]{0,19}$/u.test(text)) {
    fail(`${label} must be a positive bounded decimal`);
  }
  return text;
}

function positiveInteger(value, label, maximum = Number.MAX_SAFE_INTEGER) {
  if (
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > maximum
  ) {
    fail(`${label} must be a positive bounded integer`);
  }
  return value;
}

function githubEpoch(value, label) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(value)
  ) {
    fail(`${label} is not an exact GitHub UTC time`);
  }
  const epoch = Date.parse(value);
  if (!Number.isSafeInteger(epoch)) {
    fail(`${label} is outside the bounded epoch`);
  }
  return epoch;
}

function repositoryIdentity(repository, label) {
  if (
    repository === null ||
    typeof repository !== 'object' ||
    Array.isArray(repository) ||
    repository.name !== REPOSITORY_NAME ||
    repository.full_name !== REPOSITORY ||
    repository.owner?.login !== REPOSITORY_OWNER
  ) {
    fail(`${label} is not the exact Operations repository`);
  }
  return {
    id: positiveDecimal(repository.id, `${label} ID`),
    name: REPOSITORY_NAME,
    owner: REPOSITORY_OWNER,
  };
}

function workflowIdentity(workflow) {
  if (
    workflow === null ||
    typeof workflow !== 'object' ||
    Array.isArray(workflow) ||
    workflow.name !== WORKFLOW_NAME ||
    workflow.path !== WORKFLOW_PATH ||
    workflow.state !== 'active'
  ) {
    fail('GitHub Actions workflow is not the exact active Operations workflow');
  }
  return {
    id: positiveDecimal(workflow.id, 'GitHub Actions workflow ID'),
    name: WORKFLOW_NAME,
    path: WORKFLOW_PATH,
  };
}

function runIdentity(run, label, repository, workflow, head) {
  const runRepository = repositoryIdentity(run?.repository, `${label} repository`);
  const headRepository = repositoryIdentity(
    run?.head_repository,
    `${label} head repository`,
  );
  const attemptStartedEpochMs = githubEpoch(
    run?.run_started_at,
    `${label} attempt start`,
  );
  const updatedEpochMs = githubEpoch(run?.updated_at, `${label} update`);
  const identity = {
    attempt: positiveInteger(
      run?.run_attempt,
      `${label} attempt`,
      2_147_483_647,
    ),
    attemptStartedEpochMs,
    conclusion: run?.conclusion,
    event: run?.event,
    headRepositoryFullName: REPOSITORY,
    headRepositoryId: headRepository.id,
    headSha: run?.head_sha,
    id: positiveDecimal(run?.id, `${label} ID`),
    status: run?.status,
    workflowPathAtRef: run?.path,
  };
  if (
    runRepository.id !== repository.id ||
    headRepository.id !== repository.id ||
    positiveDecimal(run?.workflow_id, `${label} workflow ID`) !== workflow.id ||
    run?.name !== WORKFLOW_NAME ||
    typeof identity.workflowPathAtRef !== 'string' ||
    !identity.workflowPathAtRef.startsWith(`${WORKFLOW_PATH}@`) ||
    !/^\.github\/workflows\/operations[.]yml@[A-Za-z0-9_./-]{1,255}$/u.test(
      identity.workflowPathAtRef,
    ) ||
    identity.headSha !== head ||
    identity.status !== 'completed' ||
    identity.conclusion !== 'success' ||
    !ALLOWED_EVENTS.includes(identity.event) ||
    updatedEpochMs < attemptStartedEpochMs
  ) {
    fail(`${label} is not the exact completed green Operations run`);
  }
  return { identity, updatedEpochMs };
}

function artifactIdentity({
  artifact,
  head,
  nowEpochMs,
  repository,
  run,
  runUpdatedEpochMs,
}) {
  if (
    artifact === null ||
    typeof artifact !== 'object' ||
    Array.isArray(artifact) ||
    artifact.name !== `bgmss-operations-validation-${head}` ||
    artifact.expired !== false ||
    typeof artifact.digest !== 'string' ||
    !/^sha256:[0-9a-f]{64}$/u.test(artifact.digest)
  ) {
    fail('GitHub Actions artifact metadata is not the exact live handoff');
  }
  const creationEpochMs = githubEpoch(
    artifact.created_at,
    'GitHub Actions artifact creation',
  );
  const expirationEpochMs = githubEpoch(
    artifact.expires_at,
    'GitHub Actions artifact expiration',
  );
  if (
    !Number.isSafeInteger(nowEpochMs) ||
    creationEpochMs > nowEpochMs ||
    nowEpochMs - creationEpochMs > ARTIFACT_MAXIMUM_AGE_MS ||
    expirationEpochMs <= nowEpochMs ||
    expirationEpochMs <= creationEpochMs ||
    expirationEpochMs - creationEpochMs > ARTIFACT_MAXIMUM_AGE_MS ||
    creationEpochMs < run.attemptStartedEpochMs ||
    creationEpochMs > runUpdatedEpochMs
  ) {
    fail('GitHub Actions artifact is stale or outside the exact run attempt');
  }
  const workflowRun = artifact.workflow_run;
  const linkedRunId = positiveDecimal(
    workflowRun?.id,
    'GitHub Actions artifact workflow run ID',
  );
  const linkedRepositoryId = positiveDecimal(
    workflowRun?.repository_id,
    'GitHub Actions artifact repository ID',
  );
  const linkedHeadRepositoryId = positiveDecimal(
    workflowRun?.head_repository_id,
    'GitHub Actions artifact head repository ID',
  );
  if (
    linkedRunId !== run.id ||
    linkedRepositoryId !== repository.id ||
    linkedHeadRepositoryId !== repository.id ||
    workflowRun?.head_sha !== head
  ) {
    fail('GitHub Actions artifact is not bound to the exact repository and run');
  }
  return {
    creationEpochMs,
    digest: artifact.digest,
    expirationEpochMs,
    expired: false,
    headRepositoryId: linkedHeadRepositoryId,
    headSha: head,
    id: positiveDecimal(artifact.id, 'GitHub Actions artifact ID'),
    name: artifact.name,
    repositoryId: linkedRepositoryId,
    runId: linkedRunId,
    sizeInBytes: positiveInteger(
      artifact.size_in_bytes,
      'GitHub Actions artifact size',
      MAXIMUMS.transferTotalBytes,
    ),
  };
}

export function validateActionsAuthorityMetadata({
  artifact,
  nowEpochMs = Date.now(),
  repository,
  run,
  runAttempt,
  workflow,
}) {
  const repositoryValue = repositoryIdentity(
    repository,
    'GitHub Actions repository',
  );
  const workflowValue = workflowIdentity(workflow);
  const head = parseWorkflowHead(run?.head_sha);
  const current = runIdentity(
    run,
    'GitHub Actions current run',
    repositoryValue,
    workflowValue,
    head,
  );
  const attempt = runIdentity(
    runAttempt,
    'GitHub Actions run attempt',
    repositoryValue,
    workflowValue,
    head,
  );
  if (
    canonicalJson(current.identity) !== canonicalJson(attempt.identity) ||
    current.updatedEpochMs !== attempt.updatedEpochMs
  ) {
    fail('GitHub Actions current run and exact attempt metadata differ');
  }
  return deepFreeze({
    artifact: artifactIdentity({
      artifact,
      head,
      nowEpochMs,
      repository: repositoryValue,
      run: current.identity,
      runUpdatedEpochMs: current.updatedEpochMs,
    }),
    repository: repositoryValue,
    run: current.identity,
    workflow: workflowValue,
  });
}

function namedArtifact(runId, artifactName) {
  const pages = apiPages(
    `repos/${REPOSITORY}/actions/runs/${runId}/artifacts?per_page=100`,
    'GitHub Actions artifact listing',
  );
  const artifacts = pages.flatMap((page) => {
    if (!Array.isArray(page.artifacts)) {
      fail('GitHub Actions artifact listing lacks its artifact array');
    }
    return page.artifacts;
  });
  const matching = artifacts.filter(
    (artifact) => artifact?.name === artifactName,
  );
  if (matching.length !== 1) {
    fail('green operations run lacks one unambiguous exact-name artifact');
  }
  return matching[0];
}

function authenticatedActionsAuthority(runId, head, nowEpochMs = Date.now()) {
  const repository = apiObject(
    `repos/${REPOSITORY}`,
    'GitHub Actions repository verification',
  );
  const workflow = apiObject(
    `repos/${REPOSITORY}/actions/workflows/operations.yml`,
    'GitHub Actions workflow verification',
  );
  const run = apiObject(
    `repos/${REPOSITORY}/actions/runs/${runId}`,
    'GitHub Actions run verification',
  );
  const attemptNumber = positiveInteger(
    run.run_attempt,
    'GitHub Actions current run attempt',
    2_147_483_647,
  );
  const runAttempt = apiObject(
    `repos/${REPOSITORY}/actions/runs/${runId}/attempts/${attemptNumber}`,
    'GitHub Actions run attempt verification',
  );
  const listedArtifact = namedArtifact(
    runId,
    `bgmss-operations-validation-${head}`,
  );
  const listed = validateActionsAuthorityMetadata({
    artifact: listedArtifact,
    nowEpochMs,
    repository,
    run,
    runAttempt,
    workflow,
  });
  const exactArtifact = apiObject(
    `repos/${REPOSITORY}/actions/artifacts/${listed.artifact.id}`,
    'GitHub Actions exact artifact verification',
  );
  const exact = validateActionsAuthorityMetadata({
    artifact: exactArtifact,
    nowEpochMs,
    repository,
    run,
    runAttempt,
    workflow,
  });
  if (canonicalJson(listed) !== canonicalJson(exact)) {
    fail('GitHub Actions listed and exact artifact metadata differ');
  }
  return exact;
}

function exactHandoffEntries(root, label) {
  const entries = fs
    .readdirSync(root, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, 'en'));
  if (
    entries.map((entry) => entry.name).join('\0') !==
      EXACT_HANDOFF_FILES.join('\0') ||
    entries.some((entry) => !entry.isFile() || entry.isSymbolicLink())
  ) {
    fail(`${label} must contain the exact regular handoff file set`);
  }
  for (const entry of entries) {
    const information = fs.lstatSync(path.join(root, entry.name));
    if (
      !information.isFile() ||
      information.isSymbolicLink() ||
      information.nlink !== 1 ||
      information.size < 1 ||
      information.size > MAXIMUMS.transferFileBytes
    ) {
      fail(`${label} contains an unsafe handoff file`);
    }
  }
}

function downloadAuthenticatedArtifact(authority, download) {
  const archive = path.join(download, '.authenticated-artifact.zip');
  runGhToFile(
    apiArguments(
      `repos/${REPOSITORY}/actions/artifacts/${authority.artifact.id}/zip`,
    ),
    'GitHub Actions authenticated artifact byte download',
    archive,
  );
  const archiveInformation = fs.lstatSync(archive);
  if (
    !archiveInformation.isFile() ||
    archiveInformation.isSymbolicLink() ||
    archiveInformation.nlink !== 1 ||
    archiveInformation.size !== authority.artifact.sizeInBytes ||
    sha256File(archive) !== authority.artifact.digest
  ) {
    fail('downloaded GitHub Actions artifact bytes differ from their authority');
  }
  const members = runUnzip(
    ['-Z1', archive],
    'GitHub Actions artifact inventory verification',
  )
    .split('\n')
    .filter((entry) => entry.length > 0)
    .sort();
  if (members.join('\0') !== EXACT_HANDOFF_FILES.join('\0')) {
    fail('GitHub Actions artifact archive has an unsafe or unexpected member');
  }
  runUnzip(
    ['-qq', archive, '-d', download],
    'GitHub Actions artifact extraction',
  );
  fs.unlinkSync(archive);
  exactHandoffEntries(download, 'authenticated GitHub Actions handoff');
}

function compareFiles(leftRoot, rightRoot) {
  exactHandoffEntries(leftRoot, 'supplied Actions handoff');
  exactHandoffEntries(rightRoot, 'authenticated Actions handoff');
  for (const name of EXACT_HANDOFF_FILES) {
    const leftBytes = fs.readFileSync(path.join(leftRoot, name));
    const rightBytes = fs.readFileSync(path.join(rightRoot, name));
    if (!leftBytes.equals(rightBytes)) {
      fail(`supplied handoff differs from authenticated Actions bytes: ${name}`);
    }
  }
}

export function parseWorkflowRunId(value) {
  const text = String(value);
  if (!/^[1-9][0-9]{0,19}$/u.test(text)) {
    throw new TypeError('workflow run ID must be a positive bounded decimal');
  }
  return text;
}

export function parseWorkflowHead(value) {
  const text = String(value);
  if (!/^[0-9a-f]{40}$/u.test(text)) {
    throw new TypeError('workflow head must be an exact Git object ID');
  }
  return text;
}

export function resolveSuccessfulWorkflowRun(workflowHead) {
  const head = parseWorkflowHead(workflowHead);
  const workflow = workflowIdentity(
    apiObject(
      `repos/${REPOSITORY}/actions/workflows/operations.yml`,
      'GitHub Actions workflow discovery',
    ),
  );
  const pages = apiPages(
    `repos/${REPOSITORY}/actions/workflows/${workflow.id}/runs?head_sha=${head}&status=success&per_page=100`,
    'GitHub Actions successful run discovery',
  );
  const candidates = pages
    .flatMap((page) => {
      if (!Array.isArray(page.workflow_runs)) {
        fail('GitHub Actions workflow run discovery lacks its run array');
      }
      return page.workflow_runs;
    })
    .filter((run) => {
      const runId = String(run?.id ?? '');
      return (
        /^[1-9][0-9]{0,19}$/u.test(runId) &&
        run.head_sha === head &&
        String(run.workflow_id) === workflow.id &&
        run.name === WORKFLOW_NAME &&
        run.status === 'completed' &&
        run.conclusion === 'success' &&
        ALLOWED_EVENTS.includes(run.event)
      );
    });
  const authenticated = [];
  for (const candidate of candidates) {
    const runId = String(candidate.id);
    try {
      const authority = authenticatedActionsAuthority(runId, head);
      authenticated.push(authority);
    } catch (error) {
      if (!(error instanceof ActionsHandoffError)) throw error;
    }
  }
  if (authenticated.length !== 1) {
    fail(
      authenticated.length === 0
        ? 'no live green Operations Actions handoff exists for the exact head'
        : 'multiple live green Operations Actions handoffs exist for the exact head; select one run ID',
    );
  }
  return authenticated[0].run.id;
}

export function verifyAuthenticatedActionsHandoff({
  authenticatedDownloadRoot,
  handoffDirectory,
  workflowHead,
  workflowRunId,
}) {
  const runId = parseWorkflowRunId(workflowRunId);
  const head = parseWorkflowHead(workflowHead);
  const handoff = requireCanonicalPath(handoffDirectory, {
    label: 'supplied Actions handoff',
    type: 'directory',
  });
  const downloadRoot = path.resolve(authenticatedDownloadRoot);
  fs.mkdirSync(downloadRoot, { mode: 0o700 });
  const download = requireCanonicalPath(downloadRoot, {
    label: 'authenticated Actions download root',
    type: 'directory',
  });
  if (fs.readdirSync(download).length !== 0) {
    fail('authenticated Actions download root must be new and empty');
  }

  const before = authenticatedActionsAuthority(runId, head);
  downloadAuthenticatedArtifact(before, download);
  compareFiles(handoff, download);
  const after = authenticatedActionsAuthority(runId, head);
  if (canonicalJson(before) !== canonicalJson(after)) {
    fail('GitHub Actions authority changed during authenticated download');
  }
  return deepFreeze({
    actions: after,
    directory: download,
  });
}
