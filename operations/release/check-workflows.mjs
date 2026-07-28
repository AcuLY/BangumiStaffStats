import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parseDocument } from 'yaml';

const MODULE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
export const REPOSITORY_ROOT = path.resolve(MODULE_DIRECTORY, '..', '..');

export const WORKFLOW_PATHS = Object.freeze([
  '.github/workflows/ci.yml',
  '.github/workflows/operations.yml',
  '.github/workflows/release.yml',
  '.github/workflows/deploy.yml',
]);

const WORKFLOW_NAMES = Object.freeze({
  '.github/workflows/ci.yml': 'development-artifacts',
  '.github/workflows/operations.yml': 'operations-verification',
  '.github/workflows/release.yml': 'protected-version-release',
  '.github/workflows/deploy.yml': 'production-deploy',
});

const CI_SHA256 =
  'ad34efcc8a957e8758db945d25911181f10d41e6dd0d18b6b6919247e75cd1bc';

const REVIEWED_ACTIONS = Object.freeze({
  'actions/checkout':
    '3d3c42e5aac5ba805825da76410c181273ba90b1',
  'actions/setup-go':
    'b7ad1dad31e06c5925ef5d2fc7ad053ef454303e',
  'actions/setup-node':
    '820762786026740c76f36085b0efc47a31fe5020',
  'actions/upload-artifact':
    '043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
  'actions/download-artifact':
    '3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c',
  'astral-sh/setup-uv':
    'c771a70e6277c0a99b617c7a806ffedaca235ff9',
  'docker/setup-buildx-action':
    'bb05f3f5519dd87d3ba754cc423b652a5edd6d2c',
  'oras-project/setup-oras':
    '1d808f7d7f6995cc68b7bf507bfe5c5446e1dc9d',
});

const TOP_LEVEL_KEYS = Object.freeze([
  'concurrency',
  'jobs',
  'name',
  'on',
  'permissions',
]);
const JOB_KEYS = Object.freeze([
  'env',
  'environment',
  'if',
  'name',
  'needs',
  'outputs',
  'permissions',
  'runs-on',
  'steps',
  'timeout-minutes',
]);
const STEP_KEYS = Object.freeze([
  'env',
  'id',
  'if',
  'name',
  'run',
  'shell',
  'uses',
  'with',
]);
const PERMISSION_KEYS = new Set([
  'actions',
  'attestations',
  'checks',
  'contents',
  'deployments',
  'id-token',
  'issues',
  'models',
  'packages',
  'pages',
  'pull-requests',
  'security-events',
  'statuses',
]);

const OPERATIONS_TRIGGER_PATHS = Object.freeze([
  'operations/**',
  '.gitignore',
  '.github/workflows/ci.yml',
  '.github/workflows/operations.yml',
  '.github/workflows/release.yml',
  '.github/workflows/deploy.yml',
  'backend/build/**',
  'updater/build/**',
  'frontend/build/**',
  'contracts/artifacts/**',
  'contracts/acceptance/**',
  'openspec/**',
  'VERSION',
]);

const BUILDKIT_DRIVER =
  'image=docker.io/moby/buildkit:v0.27.1@sha256:1e110c71d389d6d24f67b9438e2f7b8da749a6ff407b22a1631e025c95599368';

const FORBIDDEN_COMMAND_PATTERNS = Object.freeze([
  {
    code: 'DANGEROUS_GIT_MUTATION',
    pattern:
      /\bgit\s+(?:am|apply|checkout|cherry-pick|clean|clone|commit|fetch|merge|pull|push|rebase|reset|restore|revert|switch|tag)\b/iu,
  },
  {
    code: 'DYNAMIC_COMMAND',
    pattern:
      /(?<![.$'"A-Za-z0-9_])(?:eval|source)(?=\s|[;&|()]|$)|\b(?:bash|sh)\s+-c\b/imu,
  },
  {
    code: 'BROAD_DELETE',
    pattern: /\brm\s+(?:-[A-Za-z]*r[A-Za-z]*f|-rf|-fr)\b/iu,
  },
  {
    code: 'REMOTE_SCRIPT_PIPE',
    pattern: /\b(?:curl|wget)\b[^\n|]*\|\s*(?:bash|sh)\b/iu,
  },
  {
    code: 'IN_PLACE_SOURCE_EDIT',
    pattern: /\b(?:perl\s+-p?i|sed\s+-[A-Za-z]*i)\b/iu,
  },
]);

export class WorkflowPolicyError extends Error {
  constructor(code, message, { source, cause } = {}) {
    super(`${source ? `${source}: ` : ''}${message}`, cause ? { cause } : undefined);
    this.name = 'WorkflowPolicyError';
    this.code = code;
    this.source = source;
  }
}

function fail(code, message, source, cause) {
  throw new WorkflowPolicyError(code, message, { source, cause });
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertObject(value, label, source) {
  if (!isObject(value)) fail('SHAPE', `${label} must be a mapping`, source);
  return value;
}

function assertExactKeys(value, expected, label, source) {
  assertObject(value, label, source);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    fail(
      'CLOSED_SHAPE',
      `${label} keys must be exactly ${wanted.join(', ')}; got ${actual.join(', ')}`,
      source,
    );
  }
}

function assertAllowedKeys(value, allowed, label, source) {
  assertObject(value, label, source);
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) {
    fail(
      'CLOSED_SHAPE',
      `${label} contains unsupported keys: ${unexpected.sort().join(', ')}`,
      source,
    );
  }
}

function auditYamlShape(value, source) {
  const state = { nodes: 0 };
  function visit(entry, depth) {
    state.nodes += 1;
    if (state.nodes > 20_000) {
      fail('YAML_SIZE', 'workflow has too many parsed nodes', source);
    }
    if (depth > 32) {
      fail('YAML_DEPTH', 'workflow nesting exceeds 32 levels', source);
    }
    if (typeof entry === 'string') {
      if (entry.length > 65_536) {
        fail('YAML_SIZE', 'workflow scalar exceeds 65536 characters', source);
      }
      if (entry.includes('\0')) {
        fail('YAML_CONTROL', 'workflow contains a NUL byte', source);
      }
      return;
    }
    if (
      entry === null ||
      typeof entry === 'boolean' ||
      (typeof entry === 'number' && Number.isFinite(entry))
    ) {
      return;
    }
    if (Array.isArray(entry)) {
      for (const child of entry) visit(child, depth + 1);
      return;
    }
    if (!isObject(entry)) {
      fail('YAML_TYPE', 'workflow contains an unsupported YAML value', source);
    }
    for (const [key, child] of Object.entries(entry)) {
      if (key === '<<' || key === '__proto__' || key === 'constructor') {
        fail('YAML_MERGE', `workflow contains forbidden key ${key}`, source);
      }
      if (key.length > 256 || /[\u0000-\u001f\u007f]/u.test(key)) {
        fail('YAML_KEY', 'workflow contains an unsafe mapping key', source);
      }
      visit(child, depth + 1);
    }
  }
  visit(value, 0);
}

export function parseWorkflowSource(sourceText, source = 'workflow') {
  if (
    typeof sourceText !== 'string' ||
    sourceText.length === 0 ||
    sourceText.length > 512 * 1024
  ) {
    fail('YAML_SIZE', 'workflow must be non-empty text below 512 KiB', source);
  }
  if (sourceText.charCodeAt(0) === 0xfeff) {
    fail('YAML_BOM', 'UTF-8 BOM is not permitted', source);
  }
  if (
    /(^|[ \t:[{,-])[&*][A-Za-z0-9_-]+(?=$|[\s,\]}])/mu.test(sourceText)
  ) {
    fail('YAML_ALIAS', 'YAML anchors and aliases are not permitted', source);
  }
  if (/^[ \t]*<<[ \t]*:/mu.test(sourceText)) {
    fail('YAML_MERGE', 'YAML merge keys are not permitted', source);
  }
  let document;
  try {
    document = parseDocument(sourceText, {
      customTags: [],
      maxAliasCount: 0,
      prettyErrors: true,
      strict: true,
      uniqueKeys: true,
      version: '1.2',
    });
  } catch (error) {
    fail('YAML_PARSE', 'workflow YAML cannot be parsed', source, error);
  }
  if (document.errors.length > 0) {
    fail(
      'YAML_PARSE',
      document.errors.map((error) => error.message).join('; '),
      source,
    );
  }
  if (document.warnings.length > 0) {
    fail(
      'YAML_WARNING',
      document.warnings.map((warning) => warning.message).join('; '),
      source,
    );
  }
  let parsed;
  try {
    parsed = document.toJS({
      mapAsMap: false,
      maxAliasCount: 0,
    });
  } catch (error) {
    fail('YAML_ALIAS', 'YAML aliases are not permitted', source, error);
  }
  auditYamlShape(parsed, source);
  return parsed;
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function assertRootPermissions(workflow, source) {
  assertExactKeys(workflow.permissions, ['contents'], 'root permissions', source);
  if (workflow.permissions.contents !== 'read') {
    fail('PERMISSIONS', 'root contents permission must be read', source);
  }
}

function assertPermissions(value, expected, label, source) {
  assertExactKeys(value, Object.keys(expected), label, source);
  for (const [key, permission] of Object.entries(value)) {
    if (!PERMISSION_KEYS.has(key)) {
      fail('PERMISSIONS', `${label} contains unknown permission ${key}`, source);
    }
    if (permission !== expected[key]) {
      fail(
        'PERMISSIONS',
        `${label}.${key} must be ${expected[key]}`,
        source,
      );
    }
  }
}

function assertConcurrency(
  concurrency,
  { group, groupPrefix, cancelInProgress },
  source,
) {
  assertExactKeys(
    concurrency,
    ['cancel-in-progress', 'group'],
    'concurrency',
    source,
  );
  if (
    (group !== undefined && concurrency.group !== group) ||
    (groupPrefix !== undefined &&
      (typeof concurrency.group !== 'string' ||
        !concurrency.group.startsWith(groupPrefix)))
  ) {
    fail('CONCURRENCY', 'concurrency group is not the reviewed value', source);
  }
  if (concurrency['cancel-in-progress'] !== cancelInProgress) {
    fail(
      'CONCURRENCY',
      `cancel-in-progress must be ${String(cancelInProgress)}`,
      source,
    );
  }
}

function stepRun(step) {
  return typeof step.run === 'string' ? step.run : '';
}

function actionName(step) {
  return typeof step.uses === 'string' ? step.uses.split('@', 1)[0] : undefined;
}

function assertActionSequence(job, expected, label, source) {
  const actual = job.steps
    .filter((step) => Object.hasOwn(step, 'uses'))
    .map(actionName);
  if (
    actual.length !== expected.length ||
    actual.some((action, index) => action !== expected[index])
  ) {
    fail(
      'ACTION_SET',
      `${label} actions must be exactly ${expected.join(', ')} in order`,
      source,
    );
  }
}

function requireAction(job, action, source) {
  const matches = job.steps.filter((step) => actionName(step) === action);
  if (matches.length !== 1) {
    fail('ACTION_SET', `job must contain exactly one ${action}`, source);
  }
  return matches[0];
}

function assertExactWith(step, expected, label, source) {
  assertExactKeys(step.with, Object.keys(expected), `${label} with`, source);
  for (const [key, value] of Object.entries(expected)) {
    if (step.with[key] !== value) {
      fail('TOOL_IDENTITY', `${label}.${key} is not the reviewed value`, source);
    }
  }
}

function assertExactToolActions(
  job,
  {
    nodeCache = false,
    go = false,
    uv = false,
    buildx = false,
    oras = false,
  } = {},
  source,
) {
  const node = requireAction(job, 'actions/setup-node', source);
  assertExactWith(
    node,
    nodeCache
      ? {
          'node-version': '24.18.0',
          'check-latest': false,
          cache: 'npm',
          'cache-dependency-path': 'operations/package-lock.json',
        }
      : {
          'node-version': '24.18.0',
          'check-latest': false,
        },
    'setup-node',
    source,
  );
  if (!allRuns(job).includes('npm@11.16.0')) {
    fail('TOOL_IDENTITY', 'job must install exact npm 11.16.0', source);
  }
  if (go) {
    assertExactWith(
      requireAction(job, 'actions/setup-go', source),
      {
        'go-version': '1.26.4',
        'check-latest': false,
        cache: false,
      },
      'setup-go',
      source,
    );
  }
  if (uv) {
    assertExactWith(
      requireAction(job, 'astral-sh/setup-uv', source),
      {
        version: '0.11.32',
        'enable-cache': false,
      },
      'setup-uv',
      source,
    );
  }
  if (buildx) {
    assertExactWith(
      requireAction(job, 'docker/setup-buildx-action', source),
      {
        version: 'v0.34.1',
        'driver-opts': BUILDKIT_DRIVER,
      },
      'setup-buildx-action',
      source,
    );
  }
  if (oras) {
    assertExactWith(
      requireAction(job, 'oras-project/setup-oras', source),
      {
        version: '1.3.2',
      },
      'setup-oras',
      source,
    );
  }
}

function allRuns(job) {
  return job.steps.map(stepRun).filter(Boolean).join('\n');
}

function findStep(job, predicate) {
  return job.steps.findIndex((step) => predicate(step, stepRun(step)));
}

function collectStrings(value, pathParts = [], result = []) {
  if (typeof value === 'string') {
    result.push({ path: pathParts.join('.'), value });
    return result;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      collectStrings(entry, [...pathParts, String(index)], result),
    );
    return result;
  }
  if (isObject(value)) {
    for (const [key, entry] of Object.entries(value)) {
      collectStrings(entry, [...pathParts, key], result);
    }
  }
  return result;
}

function assertNoProtectedWrite(run, source) {
  for (const { code, pattern } of FORBIDDEN_COMMAND_PATTERNS) {
    if (pattern.test(run)) {
      fail(code, `run step matches forbidden command ${pattern.source}`, source);
    }
  }

  const redirectionPattern =
    /(?:^|[\s|;&])(?:>{1,2}|tee(?:\s+--?[A-Za-z-]+)*)\s+["']?((?:\$GITHUB_WORKSPACE\/)?(?:PRODUCT\.md|DESIGN\.md|VERSION|backend|updater|frontend|contracts|openspec|\.github\/workflows\/ci\.yml)(?:\/[^"' \t\r\n|;&]+)?)/gimu;
  for (const match of run.matchAll(redirectionPattern)) {
    const target = match[1].replace(/^\$GITHUB_WORKSPACE\//u, '');
    if (
      /^backend\/build\/\.tmp\//u.test(target) ||
      /^updater\/build\/\.tmp\//u.test(target) ||
      /^frontend\/build\/\.tmp\//u.test(target)
    ) {
      continue;
    }
    fail(
      'PROTECTED_WRITE',
      `run step writes protected repository path ${target}`,
      source,
    );
  }

  const joined = run.replace(/\\\r?\n/gu, ' ');
  const mutationPattern =
    /\b(?:chmod|chown|cp|install|mkdir|mv|rm|touch)\b([^\n]*)/gimu;
  for (const mutation of joined.matchAll(mutationPattern)) {
    const targets = [
      ...mutation[1].matchAll(
        /(?:^|[\s"'=])((?:\$GITHUB_WORKSPACE\/)?(?:PRODUCT\.md|DESIGN\.md|VERSION|backend|updater|frontend|contracts|openspec|\.github\/workflows\/ci\.yml)(?:\/[A-Za-z0-9._/-]+)?)(?=$|[\s"'])/gmu,
      ),
    ].map((entry) => entry[1].replace(/^\$GITHUB_WORKSPACE\//u, ''));
    for (const target of targets) {
      if (
        /^backend\/build\/\.tmp(?:\/|$)/u.test(target) ||
        /^updater\/build\/\.tmp(?:\/|$)/u.test(target) ||
        /^frontend\/build\/\.tmp(?:\/|$)/u.test(target)
      ) {
        continue;
      }
      fail(
        'PROTECTED_WRITE',
        `mutation command targets protected repository path ${target}`,
        source,
      );
    }
  }
}

function assertReviewedAction(step, source) {
  if (typeof step.uses !== 'string') {
    fail('ACTION_PIN', 'uses must be a string', source);
  }
  const match = step.uses.match(/^([^@\s]+)@([0-9a-f]{40})$/u);
  if (!match) {
    fail(
      'ACTION_PIN',
      `action ${step.uses} must use one full lowercase reviewed commit`,
      source,
    );
  }
  const [, action, revision] = match;
  if (!Object.hasOwn(REVIEWED_ACTIONS, action)) {
    fail('ACTION_ALLOWLIST', `action ${action} is not reviewed`, source);
  }
  if (REVIEWED_ACTIONS[action] !== revision) {
    fail('ACTION_PIN', `action ${action} uses an unreviewed commit`, source);
  }
  return action;
}

function assertCheckout(step, { fullHistory = false, sparseOperations = false } = {}, source) {
  if (step.uses !== `actions/checkout@${REVIEWED_ACTIONS['actions/checkout']}`) {
    fail('CHECKOUT', 'reviewed checkout step is missing', source);
  }
  const withValues = assertObject(step.with, 'checkout with', source);
  if (withValues['persist-credentials'] !== false) {
    fail('CHECKOUT', 'checkout must disable stored credentials', source);
  }
  if (fullHistory && withValues['fetch-depth'] !== 0) {
    fail('CHECKOUT', 'checkout must fetch complete history', source);
  }
  if (sparseOperations) {
    if (
      typeof withValues['sparse-checkout'] !== 'string' ||
      withValues['sparse-checkout'].trim() !== 'operations'
    ) {
      fail('CHECKOUT', 'deploy checkout must contain only operations', source);
    }
  }
}

function assertJobShape(jobName, job, source) {
  assertAllowedKeys(job, JOB_KEYS, `job ${jobName}`, source);
  if (job['runs-on'] !== 'ubuntu-24.04') {
    fail('RUNNER', `job ${jobName} must use ubuntu-24.04`, source);
  }
  if (
    !Number.isInteger(job['timeout-minutes']) ||
    job['timeout-minutes'] < 1 ||
    job['timeout-minutes'] > 180
  ) {
    fail('TIMEOUT', `job ${jobName} has an invalid timeout`, source);
  }
  if (!Array.isArray(job.steps) || job.steps.length === 0) {
    fail('SHAPE', `job ${jobName} must contain steps`, source);
  }
  for (const [index, step] of job.steps.entries()) {
    assertAllowedKeys(step, STEP_KEYS, `job ${jobName} step ${index}`, source);
    if (typeof step.name !== 'string' || step.name.length === 0) {
      fail('SHAPE', `job ${jobName} step ${index} needs a name`, source);
    }
    const hasRun = Object.hasOwn(step, 'run');
    const hasUses = Object.hasOwn(step, 'uses');
    if (hasRun === hasUses) {
      fail(
        'SHAPE',
        `job ${jobName} step ${index} must use exactly one of run or uses`,
        source,
      );
    }
    if (hasRun) {
      assertAllowedKeys(
        step,
        ['env', 'if', 'name', 'run', 'shell'],
        `job ${jobName} run step ${index}`,
        source,
      );
      if (typeof step.run !== 'string' || step.run.trim().length === 0) {
        fail('SHAPE', `job ${jobName} step ${index} has empty run`, source);
      }
      if (step.shell !== 'bash') {
        fail('SHELL', `job ${jobName} run steps must declare bash`, source);
      }
      if (Object.hasOwn(step, 'if') && step.if !== 'always()') {
        fail(
          'STEP_CONDITION',
          `job ${jobName} step ${index} may use only always()`,
          source,
        );
      }
      if (Object.hasOwn(step, 'env')) {
        assertObject(step.env, `job ${jobName} step ${index} env`, source);
        for (const [key, value] of Object.entries(step.env)) {
          if (
            !/^[A-Z][A-Z0-9_]{0,63}$/u.test(key) ||
            typeof value !== 'string'
          ) {
            fail(
              'ENV',
              `job ${jobName} step ${index} has an invalid env entry`,
              source,
            );
          }
        }
      }
      assertNoProtectedWrite(step.run, source);
    } else {
      assertAllowedKeys(
        step,
        ['id', 'name', 'uses', 'with'],
        `job ${jobName} action step ${index}`,
        source,
      );
      assertReviewedAction(step, source);
    }
  }
}

function assertAllJobs(workflow, source) {
  assertObject(workflow.jobs, 'jobs', source);
  for (const [jobName, job] of Object.entries(workflow.jobs)) {
    assertJobShape(jobName, assertObject(job, `job ${jobName}`, source), source);
  }
}

function assertNoSecrets(
  workflow,
  source,
  {
    allowedSecret,
    allowedJob,
  } = {},
) {
  const references = [];
  for (const entry of collectStrings(workflow)) {
    for (const match of entry.value.matchAll(/\bsecrets\.([A-Za-z_][A-Za-z0-9_]*)/gu)) {
      references.push({
        ...entry,
        secret: match[1],
      });
    }
  }
  if (allowedSecret === undefined && references.length > 0) {
    fail('SECRET_FLOW', 'workflow may not reference repository secrets', source);
  }
  if (allowedSecret !== undefined) {
    if (
      references.length !== 1 ||
      references[0].secret !== allowedSecret ||
      !references[0].path.startsWith(`jobs.${allowedJob}.steps.`) ||
      !references[0].path.includes('.env.')
    ) {
      fail(
        'SECRET_FLOW',
        `only ${allowedJob} step env may read ${allowedSecret}`,
        source,
      );
    }
  }
}

function assertGithubTokenScope(workflow, source, allowedJobNames) {
  for (const entry of collectStrings(workflow)) {
    if (!entry.value.includes('github.token')) continue;
    if (
      !allowedJobNames.some((jobName) =>
        entry.path.startsWith(`jobs.${jobName}.steps.`),
      ) ||
      !entry.path.includes('.env.')
    ) {
      fail(
        'TOKEN_FLOW',
        'github.token may appear only in an approved step environment',
        source,
      );
    }
  }
}

function assertReleaseTokenSteps(publish, source) {
  const tokenSteps = publish.steps.filter((step) =>
    Object.values(step.env ?? {}).some((value) =>
      String(value).includes('github.token'),
    ),
  );
  if (tokenSteps.length !== 3) {
    fail(
      'TOKEN_FLOW',
      'publish must have exactly two GitHub CLI token steps and one registry login token step',
      source,
    );
  }
  let githubCliSteps = 0;
  let registrySteps = 0;
  for (const step of tokenSteps) {
    const run = stepRun(step);
    if (Object.hasOwn(step.env, 'GH_TOKEN')) {
      assertExactKeys(step.env, ['GH_TOKEN'], 'GitHub CLI token env', source);
      if (
        step.env.GH_TOKEN !== '${{ github.token }}' ||
        !/\bgh\s+release\s+(?:create|view)\b/u.test(run)
      ) {
        fail('TOKEN_FLOW', 'GH_TOKEN may serve only fixed release view/create', source);
      }
      githubCliSteps += 1;
    } else if (Object.hasOwn(step.env, 'REGISTRY_TOKEN')) {
      assertExactKeys(step.env, ['REGISTRY_TOKEN'], 'registry token env', source);
      if (
        step.env.REGISTRY_TOKEN !== '${{ github.token }}' ||
        !run.includes('oras login ghcr.io') ||
        !run.includes(`printf '%s' "$REGISTRY_TOKEN"`) ||
        /\b(?:echo|cat|tee)\b[^\n]*REGISTRY_TOKEN/iu.test(run)
      ) {
        fail(
          'TOKEN_FLOW',
          'registry token may serve only the reviewed ORAS password-stdin login',
          source,
        );
      }
      registrySteps += 1;
    } else {
      fail('TOKEN_FLOW', 'github.token appears under an unknown env key', source);
    }
    if (/\bset\s+-x\b|\bprintenv\b|\bexport\s+-p\b/iu.test(run)) {
      fail('TOKEN_FLOW', 'token step may not enable environment diagnostics', source);
    }
  }
  if (githubCliSteps !== 2 || registrySteps !== 1) {
    fail('TOKEN_FLOW', 'release token step counts differ from policy', source);
  }
}

function assertDeploySensitiveSteps(deploy, source) {
  const download = deploy.steps.find((step) =>
    stepRun(step).includes('gh release download'),
  );
  if (!download) fail('TOKEN_FLOW', 'deploy release download step is missing', source);
  assertExactKeys(download.env, ['GH_TOKEN'], 'deploy download env', source);
  if (download.env.GH_TOKEN !== '${{ github.token }}') {
    fail('TOKEN_FLOW', 'deploy download must use only github.token', source);
  }

  const transaction = deploy.steps.find((step) =>
    Object.values(step.env ?? {}).some((value) =>
      String(value).includes('secrets.BGMSS_PRODUCTION_SSH_PRIVATE_KEY'),
    ),
  );
  if (!transaction) {
    fail('SECRET_FLOW', 'deploy transaction step is missing', source);
  }
  assertExactKeys(
    transaction.env,
    [
      'BGMSS_PRODUCTION_SSH_HOST',
      'BGMSS_PRODUCTION_SSH_KNOWN_HOST',
      'BGMSS_PRODUCTION_SSH_PRIVATE_KEY',
    ],
    'deploy transaction env',
    source,
  );
  const expected = {
    BGMSS_PRODUCTION_SSH_HOST:
      '${{ vars.BGMSS_PRODUCTION_SSH_HOST }}',
    BGMSS_PRODUCTION_SSH_KNOWN_HOST:
      '${{ vars.BGMSS_PRODUCTION_SSH_KNOWN_HOST }}',
    BGMSS_PRODUCTION_SSH_PRIVATE_KEY:
      '${{ secrets.BGMSS_PRODUCTION_SSH_PRIVATE_KEY }}',
  };
  for (const [key, value] of Object.entries(expected)) {
    if (transaction.env[key] !== value) {
      fail('SECRET_FLOW', `deploy transaction ${key} differs from policy`, source);
    }
  }
  const run = stepRun(transaction);
  if (
    /\bset\s+-x\b|\bprintenv\b|\bexport\s+-p\b/iu.test(run) ||
    /\b(?:echo|cat|tee)\b[^\n]*PRIVATE_KEY/iu.test(run) ||
    !run.includes(`printf '%s\\n' "$BGMSS_PRODUCTION_SSH_PRIVATE_KEY" > "$key_file"`)
  ) {
    fail(
      'SECRET_FLOW',
      'deploy private key may only be written to its bounded runner-temp file',
      source,
    );
  }
}

function assertNoPublicationAuthority(
  workflow,
  source,
  { allowedUploadJob } = {},
) {
  for (const [jobName, job] of Object.entries(workflow.jobs)) {
    if (Object.hasOwn(job, 'environment')) {
      fail('ENVIRONMENT', `job ${jobName} may not select an Environment`, source);
    }
    const commands = allRuns(job);
    if (
      /\bdocker\s+(?:login|push)\b|\boras\s+(?:login|cp|push)\b|\bgh\s+release\b|\b(?:ssh|scp|rsync)\b/iu.test(
        commands,
      )
    ) {
      fail(
        'PUBLICATION_AUTHORITY',
        `job ${jobName} contains publication or host authority`,
        source,
      );
    }
    for (const step of job.steps) {
      if (
        step.uses ===
        `actions/download-artifact@${REVIEWED_ACTIONS['actions/download-artifact']}`
      ) {
        fail(
          'ARTIFACT_TRANSFER',
          `job ${jobName} may not download Actions artifacts`,
          source,
        );
      }
      if (
        step.uses ===
          `actions/upload-artifact@${REVIEWED_ACTIONS['actions/upload-artifact']}` &&
        jobName !== allowedUploadJob
      ) {
        fail(
          'ARTIFACT_TRANSFER',
          `job ${jobName} may not upload an Actions artifact`,
          source,
        );
      }
    }
  }
}

function triggerKeys(workflow, source) {
  return Object.keys(assertObject(workflow.on, 'on', source)).sort();
}

function assertTriggerKeys(workflow, expected, source) {
  const actual = triggerKeys(workflow, source);
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    fail(
      'TRIGGER',
      `trigger keys must be exactly ${wanted.join(', ')}; got ${actual.join(', ')}`,
      source,
    );
  }
  if (Object.hasOwn(workflow.on, 'pull_request_target')) {
    fail('TRIGGER', 'pull_request_target is forbidden', source);
  }
}

function assertCommonWorkflow(workflow, source) {
  assertExactKeys(workflow, TOP_LEVEL_KEYS, 'workflow', source);
  if (workflow.name !== WORKFLOW_NAMES[source]) {
    fail('NAME', `workflow name must be ${WORKFLOW_NAMES[source]}`, source);
  }
  assertRootPermissions(workflow, source);
  assertAllJobs(workflow, source);
}

function assertCiWorkflow(workflow, sourceText, source) {
  if (sha256Text(sourceText) !== CI_SHA256) {
    fail(
      'CI_DIGEST',
      'protected ci.yml differs from the accepted SHA-256 authority',
      source,
    );
  }
  assertTriggerKeys(
    workflow,
    ['pull_request', 'push', 'workflow_dispatch'],
    source,
  );
  if (Object.keys(workflow.jobs).length !== 1 || !workflow.jobs.verify) {
    fail('CLOSED_SHAPE', 'ci.yml must contain only verify', source);
  }
  assertConcurrency(workflow.concurrency, {
    groupPrefix: 'development-artifacts-',
    cancelInProgress: true,
  }, source);
  if (Object.hasOwn(workflow.jobs.verify, 'permissions')) {
    assertPermissions(
      workflow.jobs.verify.permissions,
      { contents: 'read' },
      'ci verify permissions',
      source,
    );
  }
  assertNoSecrets(workflow, source);
  assertGithubTokenScope(workflow, source, []);
  assertNoPublicationAuthority(workflow, source);
}

function assertOperationsWorkflow(workflow, source) {
  assertTriggerKeys(
    workflow,
    ['pull_request', 'push', 'workflow_dispatch'],
    source,
  );
  assertConcurrency(workflow.concurrency, {
    groupPrefix: 'operations-verification-',
    cancelInProgress: true,
  }, source);
  assertExactKeys(
    workflow.jobs,
    ['verify-candidate', 'verify-policy'],
    'operations jobs',
    source,
  );
  for (const [jobName, job] of Object.entries(workflow.jobs)) {
    assertPermissions(
      job.permissions,
      { contents: 'read' },
      `${jobName} permissions`,
      source,
    );
  }

  const dispatch = assertObject(
    workflow.on.workflow_dispatch,
    'workflow_dispatch',
    source,
  );
  assertExactKeys(dispatch, ['inputs'], 'workflow_dispatch', source);
  assertExactKeys(
    dispatch.inputs,
    ['verify_candidate'],
    'workflow_dispatch inputs',
    source,
  );
  assertExactKeys(
    dispatch.inputs.verify_candidate,
    ['default', 'description', 'required', 'type'],
    'verify_candidate input',
    source,
  );
  if (
    dispatch.inputs.verify_candidate.required !== true ||
    dispatch.inputs.verify_candidate.default !== false ||
    dispatch.inputs.verify_candidate.type !== 'boolean'
  ) {
    fail('TRIGGER', 'verify_candidate must be a required default-false boolean', source);
  }
  const push = assertObject(workflow.on.push, 'push trigger', source);
  if (
    !Array.isArray(push.branches) ||
    push.branches.length !== 1 ||
    push.branches[0] !== '**'
  ) {
    fail('TRIGGER', 'operations push must include every branch', source);
  }
  if (
    !Array.isArray(push['tags-ignore']) ||
    push['tags-ignore'].length !== 1 ||
    push['tags-ignore'][0] !== '**'
  ) {
    fail('TRIGGER', 'operations push must exclude every tag', source);
  }
  for (const event of ['pull_request', 'push']) {
    const trigger = assertObject(workflow.on[event], `${event} trigger`, source);
    assertExactKeys(
      trigger,
      event === 'push' ? ['branches', 'paths', 'tags-ignore'] : ['paths'],
      `${event} trigger`,
      source,
    );
    if (!Array.isArray(trigger.paths)) {
      fail('TRIGGER', `${event}.paths must be an array`, source);
    }
    const actualPaths = [...trigger.paths].sort();
    const expectedPaths = [...OPERATIONS_TRIGGER_PATHS].sort();
    if (
      actualPaths.length !== expectedPaths.length ||
      actualPaths.some((entry, index) => entry !== expectedPaths[index])
    ) {
      fail('TRIGGER', `${event} paths differ from the reviewed set`, source);
    }
  }

  const policyJob = workflow.jobs['verify-policy'];
  const candidateJob = workflow.jobs['verify-candidate'];
  assertExactKeys(
    policyJob,
    ['name', 'permissions', 'runs-on', 'steps', 'timeout-minutes'],
    'verify-policy job',
    source,
  );
  assertExactKeys(
    candidateJob,
    [
      'env',
      'if',
      'name',
      'needs',
      'permissions',
      'runs-on',
      'steps',
      'timeout-minutes',
    ],
    'verify-candidate job',
    source,
  );
  assertActionSequence(
    policyJob,
    ['actions/checkout', 'actions/setup-node'],
    'verify-policy',
    source,
  );
  assertActionSequence(
    candidateJob,
    [
      'actions/checkout',
      'actions/setup-go',
      'actions/setup-node',
      'astral-sh/setup-uv',
      'docker/setup-buildx-action',
      'actions/upload-artifact',
    ],
    'verify-candidate',
    source,
  );
  assertExactToolActions(policyJob, { nodeCache: true }, source);
  assertExactToolActions(
    candidateJob,
    {
      go: true,
      uv: true,
      buildx: true,
    },
    source,
  );
  const policyRuns = allRuns(policyJob);
  const candidateRuns = allRuns(candidateJob);
  if (!policyRuns.includes('npm --prefix operations run check')) {
    fail(
      'REQUIRED_GATE',
      'operations policy job must run the complete aggregate check',
      source,
    );
  }
  for (const command of ['build:amd64', 'verify:candidate']) {
    if (!candidateRuns.includes(command)) {
      fail('REQUIRED_GATE', `candidate job must run ${command}`, source);
    }
  }
  const verifyCommandIndex = candidateRuns.indexOf('verify:candidate');
  const handoffCommandIndex = candidateRuns.indexOf(
    'prepare-validation-handoff.mjs',
  );
  if (
    verifyCommandIndex < 0 ||
    handoffCommandIndex <= verifyCommandIndex ||
    !candidateRuns.includes('sha256sum --check validation-candidate.tar.sha256') ||
    !candidateRuns.includes('candidate-complete-inventory.json')
  ) {
    fail(
      'VALIDATION_HANDOFF',
      'sealed validation handoff must be prepared only after candidate verification',
      source,
    );
  }
  if (
    typeof candidateJob.if !== 'string' ||
    !candidateJob.if.includes("github.event_name == 'pull_request'") ||
    !candidateJob.if.includes("github.event_name == 'push'") ||
    !candidateJob.if.includes('inputs.verify_candidate')
  ) {
    fail(
      'CANDIDATE_CONDITION',
      'candidate verification must run on pull request, push, or explicit manual opt-in',
      source,
    );
  }
  if (candidateJob.needs !== 'verify-policy') {
    fail('ORDER', 'candidate verification must depend on policy verification', source);
  }
  if (candidateJob.env?.DOCKER_DEFAULT_PLATFORM !== 'linux/amd64') {
    fail('PLATFORM', 'candidate job must set linux/amd64 as Docker platform', source);
  }
  assertExactKeys(
    candidateJob.env,
    ['DOCKER_DEFAULT_PLATFORM', 'GOTOOLCHAIN'],
    'candidate env',
    source,
  );
  if (candidateJob.env?.GOTOOLCHAIN !== 'go1.26.5+auto') {
    fail('TOOL_IDENTITY', 'candidate job must bind exact Go toolchain', source);
  }
  const checkoutSteps = [
    policyJob.steps.find((step) => step.uses?.startsWith('actions/checkout@')),
    candidateJob.steps.find((step) => step.uses?.startsWith('actions/checkout@')),
  ];
  checkoutSteps.forEach((step) => {
    assertCheckout(step, { fullHistory: true }, source);
    assertExactWith(
      step,
      {
        'fetch-depth': 0,
        'persist-credentials': false,
      },
      'operations checkout',
      source,
    );
  });
  const validationUploads = candidateJob.steps.filter(
    (step) =>
      step.uses ===
      `actions/upload-artifact@${REVIEWED_ACTIONS['actions/upload-artifact']}`,
  );
  if (validationUploads.length !== 1) {
    fail(
      'VALIDATION_HANDOFF',
      'candidate job must upload exactly one sealed validation handoff',
      source,
    );
  }
  assertExactWith(
    validationUploads[0],
    {
      name: 'bgmss-operations-validation-${{ github.sha }}',
      path: [
        'operations/.tmp/actions-validation-handoff/validation-candidate.tar',
        'operations/.tmp/actions-validation-handoff/validation-candidate.tar.sha256',
        'operations/.tmp/actions-validation-handoff/candidate-complete-inventory.json',
        '',
      ].join('\n'),
      'if-no-files-found': 'error',
      'compression-level': 0,
      overwrite: false,
      'include-hidden-files': false,
      'retention-days': 1,
    },
    'validation upload-artifact',
    source,
  );
  const uploadIndex = candidateJob.steps.indexOf(validationUploads[0]);
  const buildIndex = findStep(
    candidateJob,
    (_step, run) => run.includes('prepare-validation-handoff.mjs'),
  );
  const cleanupIndex = findStep(
    candidateJob,
    (_step, run) =>
      run.includes('rm -f --') &&
      run.includes('rmdir "$handoff_output"') &&
      run.includes('actions-validation-handoff'),
  );
  if (!(buildIndex >= 0 && buildIndex < uploadIndex && uploadIndex < cleanupIndex)) {
    fail(
      'VALIDATION_HANDOFF',
      'validation upload must follow sealing and precede exact cleanup',
      source,
    );
  }
  assertNoSecrets(workflow, source);
  assertGithubTokenScope(workflow, source, []);
  assertNoPublicationAuthority(workflow, source, {
    allowedUploadJob: 'verify-candidate',
  });
}

function assertReleaseWorkflow(workflow, source) {
  assertTriggerKeys(workflow, ['push'], source);
  const push = assertObject(workflow.on.push, 'release push trigger', source);
  assertExactKeys(push, ['tags'], 'release push trigger', source);
  if (
    !Array.isArray(push.tags) ||
    push.tags.length !== 1 ||
    push.tags[0] !== 'v*'
  ) {
    fail('TRIGGER', 'release may run only for v* tags', source);
  }
  assertConcurrency(workflow.concurrency, {
    groupPrefix: 'protected-version-release-',
    cancelInProgress: false,
  }, source);
  assertExactKeys(workflow.jobs, ['prepare', 'publish'], 'release jobs', source);

  const prepare = workflow.jobs.prepare;
  const publish = workflow.jobs.publish;
  assertExactKeys(
    prepare,
    [
      'env',
      'name',
      'outputs',
      'permissions',
      'runs-on',
      'steps',
      'timeout-minutes',
    ],
    'release prepare job',
    source,
  );
  assertExactKeys(
    publish,
    [
      'env',
      'environment',
      'name',
      'needs',
      'permissions',
      'runs-on',
      'steps',
      'timeout-minutes',
    ],
    'release publish job',
    source,
  );
  assertActionSequence(
    prepare,
    [
      'actions/checkout',
      'actions/setup-go',
      'actions/setup-node',
      'astral-sh/setup-uv',
      'docker/setup-buildx-action',
      'actions/upload-artifact',
    ],
    'release prepare',
    source,
  );
  assertActionSequence(
    publish,
    [
      'actions/checkout',
      'actions/setup-node',
      'docker/setup-buildx-action',
      'oras-project/setup-oras',
      'actions/download-artifact',
    ],
    'release publish',
    source,
  );
  assertExactToolActions(
    prepare,
    {
      go: true,
      uv: true,
      buildx: true,
    },
    source,
  );
  assertExactToolActions(publish, { buildx: true, oras: true }, source);
  assertPermissions(
    prepare.permissions,
    { contents: 'read' },
    'prepare permissions',
    source,
  );
  assertPermissions(
    publish.permissions,
    { contents: 'write', packages: 'write' },
    'publish permissions',
    source,
  );
  if (Object.hasOwn(prepare, 'environment')) {
    fail('ENVIRONMENT', 'prepare may not select an Environment', source);
  }
  if (publish.environment !== 'release') {
    fail('ENVIRONMENT', 'publish must use only the release Environment', source);
  }
  if (publish.needs !== 'prepare') {
    fail('ORDER', 'publish must depend only on prepare', source);
  }
  assertExactKeys(
    prepare.outputs,
    ['artifact-digest'],
    'prepare outputs',
    source,
  );
  if (
    prepare.outputs['artifact-digest'] !==
    '${{ steps.upload.outputs.artifact-digest }}'
  ) {
    fail('ARTIFACT_TRANSFER', 'prepare output must be the upload digest', source);
  }
  assertExactKeys(
    prepare.env,
    ['DOCKER_DEFAULT_PLATFORM', 'GOTOOLCHAIN', 'RELEASE_TAG'],
    'prepare env',
    source,
  );
  if (
    prepare.env.DOCKER_DEFAULT_PLATFORM !== 'linux/amd64' ||
    prepare.env.GOTOOLCHAIN !== 'go1.26.5+auto' ||
    prepare.env.RELEASE_TAG !== '${{ github.ref_name }}'
  ) {
    fail('TOOL_IDENTITY', 'prepare environment differs from reviewed values', source);
  }
  assertExactKeys(publish.env, ['RELEASE_TAG'], 'publish env', source);
  if (publish.env.RELEASE_TAG !== '${{ github.ref_name }}') {
    fail('TAG_BINDING', 'publish tag must come only from github.ref_name', source);
  }
  assertNoSecrets(workflow, source);
  assertGithubTokenScope(workflow, source, ['publish']);
  assertReleaseTokenSteps(publish, source);

  const prepareCheckout = prepare.steps.find((step) =>
    step.uses?.startsWith('actions/checkout@'),
  );
  const publishCheckout = publish.steps.find((step) =>
    step.uses?.startsWith('actions/checkout@'),
  );
  assertCheckout(prepareCheckout, { fullHistory: true }, source);
  assertCheckout(publishCheckout, { fullHistory: true }, source);
  for (const checkout of [prepareCheckout, publishCheckout]) {
    assertExactWith(
      checkout,
      {
        'fetch-depth': 0,
        'persist-credentials': false,
        ref: '${{ github.sha }}',
      },
      'release checkout',
      source,
    );
  }
  if (
    prepareCheckout.with.ref !== '${{ github.sha }}' ||
    publishCheckout.with.ref !== '${{ github.sha }}'
  ) {
    fail('CHECKOUT', 'both release jobs must check out github.sha', source);
  }

  const uploadSteps = prepare.steps.filter(
    (step) =>
      step.uses ===
      `actions/upload-artifact@${REVIEWED_ACTIONS['actions/upload-artifact']}`,
  );
  const downloadSteps = publish.steps.filter(
    (step) =>
      step.uses ===
      `actions/download-artifact@${REVIEWED_ACTIONS['actions/download-artifact']}`,
  );
  if (uploadSteps.length !== 1 || downloadSteps.length !== 1) {
    fail(
      'ARTIFACT_TRANSFER',
      'release must have exactly one pinned upload and one pinned download',
      source,
    );
  }
  if (
    uploadSteps[0].with?.name !== 'bgmss-tag-release-candidate' ||
    downloadSteps[0].with?.name !== 'bgmss-tag-release-candidate'
  ) {
    fail('ARTIFACT_TRANSFER', 'release candidate artifact name must be exact', source);
  }
  if (
    uploadSteps[0].with?.overwrite !== false ||
    uploadSteps[0].with?.['if-no-files-found'] !== 'error' ||
    uploadSteps[0].with?.['retention-days'] !== 1
  ) {
    fail('ARTIFACT_TRANSFER', 'release candidate upload is not fail-closed', source);
  }
  for (const step of publish.steps) {
    if (
      step.uses ===
      `actions/upload-artifact@${REVIEWED_ACTIONS['actions/upload-artifact']}`
    ) {
      fail('ARTIFACT_TRANSFER', 'publish may not upload an Actions artifact', source);
    }
  }

  const prepareRuns = allRuns(prepare);
  if (
    !prepareRuns.includes('prepare-tag-release.mjs') ||
    !prepareRuns.includes('sha256sum --check') ||
    !prepareRuns.includes('VERSION') ||
    !prepareRuns.includes('refs/tags/')
  ) {
    fail(
      'REQUIRED_GATE',
      'prepare lacks tag/version, double-build, or sealed-transfer checks',
      source,
    );
  }
  assertExactWith(
    uploadSteps[0],
    {
      name: 'bgmss-tag-release-candidate',
      path: [
        '${{ runner.temp }}/bgmss-tag-release/transfer/tag-release-candidate.tar',
        '${{ runner.temp }}/bgmss-tag-release/transfer/tag-release-candidate.tar.sha256',
        '',
      ].join('\n'),
      'if-no-files-found': 'error',
      'compression-level': 0,
      overwrite: false,
      'include-hidden-files': false,
      'retention-days': 1,
    },
    'upload-artifact',
    source,
  );
  assertExactWith(
    downloadSteps[0],
    {
      name: 'bgmss-tag-release-candidate',
      path: '${{ runner.temp }}/bgmss-tag-release-download',
    },
    'download-artifact',
    source,
  );
  if (
    /\bdocker\s+(?:login|push)\b|\boras\s+(?:login|cp|push)\b|\bgh\s+release\b|\b(?:ssh|scp|rsync)\b/iu.test(
      prepareRuns,
    )
  ) {
    fail('AUTHORITY_SPLIT', 'prepare contains publish or deploy authority', source);
  }

  const verifyIndex = findStep(
    publish,
    (_step, run) =>
      run.includes('verify-handoff.mjs') &&
      run.includes('--archive') &&
      run.includes('--checksum') &&
      run.includes('--kind tag-release'),
  );
  const releaseConflictIndex = findStep(
    publish,
    (_step, run) => run.includes('gh release view'),
  );
  const loginIndex = findStep(
    publish,
    (_step, run) => run.includes('oras login ghcr.io'),
  );
  const registryConflictIndex = findStep(
    publish,
    (_step, run) => run.includes('docker manifest inspect') && run.includes('refusing replacement'),
  );
  const pushIndex = findStep(
    publish,
    (_step, run) =>
      run.includes('oras manifest fetch') &&
      run.includes('--oci-layout') &&
      run.includes('oras cp --from-oci-layout') &&
      run.includes(
        'docker buildx imagetools inspect "$destination" --raw',
      ) &&
      run.includes(
        'docker buildx imagetools inspect "$immutable_reference" --raw',
      ) &&
      run.includes('--raw') &&
      run.includes('cmp --silent "$candidate_manifest" "$manifest_file"') &&
      run.includes('sha256sum "$manifest_file"') &&
      run.includes('cmp --silent "$manifest_file" "$immutable_manifest"'),
  );
  const manifestIndex = findStep(
    publish,
    (_step, run) => run.includes('publish-release.mjs'),
  );
  const verifyPublishedIndex = findStep(
    publish,
    (_step, run) => run.includes('verify-published-release.mjs'),
  );
  const githubReleaseIndex = findStep(
    publish,
    (_step, run) => run.includes('gh release create'),
  );
  const ordered = [
    verifyIndex,
    releaseConflictIndex,
    loginIndex,
    registryConflictIndex,
    pushIndex,
    manifestIndex,
    verifyPublishedIndex,
    githubReleaseIndex,
  ];
  if (
    ordered.some((index) => index < 0) ||
    ordered.some((index, position) => position > 0 && index <= ordered[position - 1])
  ) {
    fail(
      'ORDER',
      'publish must revalidate, refuse conflicts, login, push, derive, verify, then release',
      source,
    );
  }

  const publishRuns = allRuns(publish);
  if (
    /\btar\s+(?:[^\n]*\s)?(?:-[A-Za-z]*x[A-Za-z]*|--extract)\b/iu.test(
      publishRuns,
    )
  ) {
    fail(
      'ARTIFACT_TRANSFER',
      'release handoff extraction must use the bounded repository verifier',
      source,
    );
  }
  if (
    prepareRuns.includes('bgmss-operations-validation-') ||
    prepareRuns.includes('validation-candidate.tar') ||
    publishRuns.includes('bgmss-operations-validation-') ||
    publishRuns.includes('validation-candidate.tar')
  ) {
    fail(
      'VALIDATION_HANDOFF',
      'release must reject the unpublished Operations validation handoff',
      source,
    );
  }
  for (const required of [
    'tag-release-candidate.tar.sha256',
    'registry-publication-plan.json',
    'registry-evidence.json',
    'oras manifest fetch',
    'oras cp --from-oci-layout',
    'cmp --silent "$candidate_manifest" "$manifest_file"',
    'ghcr.io/aculy/bangumi-staff-stats-api',
    'ghcr.io/aculy/bangumi-staff-stats-updater',
    'release-manifest.json',
    'payload-checksums.sha256',
    'compatibility-manifest.json',
    'frontend-static-linux-amd64.tar',
    'archive-smoke',
    'backend.spdx.json',
    'updater.spdx.json',
    'frontend.spdx.json',
    'backend-component-statement.json',
    'updater-component-statement.json',
    'frontend-component-statement.json',
    '--latest=false',
  ]) {
    if (!publishRuns.includes(required)) {
      fail('REQUIRED_ASSET', `publish lacks required ${required}`, source);
    }
  }
  if (
    /(?:^|[/:])latest(?:\b|$)/imu.test(publishRuns) ||
    /\b(?:ssh|scp|rsync)\b/iu.test(publishRuns) ||
    publishRuns.includes('production')
  ) {
    fail(
      'RELEASE_BOUNDARY',
      'release may not use latest, SSH, or production authority',
      source,
    );
  }
}

function assertDeployWorkflow(workflow, source) {
  assertTriggerKeys(workflow, ['workflow_dispatch'], source);
  assertConcurrency(workflow.concurrency, {
    group: 'production-deploy',
    cancelInProgress: false,
  }, source);
  assertExactKeys(workflow.jobs, ['deploy'], 'deploy jobs', source);
  const deploy = workflow.jobs.deploy;
  assertExactKeys(
    deploy,
    [
      'env',
      'environment',
      'name',
      'permissions',
      'runs-on',
      'steps',
      'timeout-minutes',
    ],
    'deploy job',
    source,
  );
  assertPermissions(
    deploy.permissions,
    { contents: 'read' },
    'deploy permissions',
    source,
  );
  if (deploy.environment !== 'production') {
    fail('ENVIRONMENT', 'deploy must use the production Environment', source);
  }
  assertExactKeys(
    deploy.env,
    ['RELEASE_MANIFEST_DIGEST', 'RELEASE_VERSION'],
    'deploy env',
    source,
  );
  if (
    deploy.env.RELEASE_VERSION !== '${{ inputs.version }}' ||
    deploy.env.RELEASE_MANIFEST_DIGEST !== '${{ inputs.manifest_digest }}'
  ) {
    fail('INPUT_FLOW', 'deploy inputs may flow only into bounded release env', source);
  }

  const dispatch = assertObject(
    workflow.on.workflow_dispatch,
    'workflow_dispatch',
    source,
  );
  assertExactKeys(dispatch, ['inputs'], 'workflow_dispatch', source);
  assertExactKeys(
    dispatch.inputs,
    ['manifest_digest', 'version'],
    'deploy inputs',
    source,
  );
  for (const inputName of ['manifest_digest', 'version']) {
    const input = dispatch.inputs[inputName];
    assertExactKeys(
      input,
      ['description', 'required', 'type'],
      `deploy input ${inputName}`,
      source,
    );
    if (input.required !== true || input.type !== 'string') {
      fail('TRIGGER', `deploy input ${inputName} must be a required string`, source);
    }
  }
  assertNoSecrets(workflow, source, {
    allowedSecret: 'BGMSS_PRODUCTION_SSH_PRIVATE_KEY',
    allowedJob: 'deploy',
  });
  assertGithubTokenScope(workflow, source, ['deploy']);
  assertDeploySensitiveSteps(deploy, source);
  if (deploy.steps.some((step) => Object.hasOwn(step, 'uses'))) {
    fail(
      'DEPLOY_BOUNDARY',
      'deploy may not check out code or invoke an Action controller',
      source,
    );
  }
  const variableReferences = collectStrings(deploy)
    .filter((entry) => entry.value.includes('vars.'))
    .map((entry) => ({
      ...entry,
      variables: [
        ...entry.value.matchAll(/\bvars\.([A-Za-z_][A-Za-z0-9_]*)/gu),
      ].map((match) => match[1]),
    }))
    .flatMap((entry) =>
      entry.variables.map((variable) => ({
        path: entry.path,
        variable,
      })),
    );
  if (
    variableReferences.length !== 2 ||
    variableReferences.some(
      (entry) =>
        ![
          'BGMSS_PRODUCTION_SSH_HOST',
          'BGMSS_PRODUCTION_SSH_KNOWN_HOST',
        ].includes(entry.variable) ||
        !entry.path.startsWith('steps.') ||
        !entry.path.includes('.env.'),
    )
  ) {
    fail(
      'DEPLOY_TARGET',
      'deploy may read only the fixed production host and known-host Environment variables',
      source,
    );
  }
  const runs = allRuns(deploy);
  if (
    runs.includes('bgmss-operations-validation-') ||
    runs.includes('validation-candidate.tar')
  ) {
    fail(
      'VALIDATION_HANDOFF',
      'deploy must consume only a published release, never validation handoff',
      source,
    );
  }
  for (const required of [
    'gh release download',
    'jq -cS .',
    'def exact($expected):',
    'exact(["revision", "tree"])',
    'sha256:17145d4869050dc2ff347e4dbfb60a5a6369d32890f0abc3e8f766b8ea28a80a',
    'and .operationsController == .release',
    'and .version == "v0.1.0"',
    'descriptor_count=0',
    'test "$descriptor_count" -eq 10',
    'chmod 0555 -- archive-smoke',
    'chmod 0444 --',
    'mode_descriptor_count=0',
    'test "$mode_descriptor_count" -eq 10',
    '$0 !~ /^[0-9a-f]{64}  [A-Za-z0-9][A-Za-z0-9._-]*$/',
    'LC_ALL=C sort --check payload-checksums.sha256',
    'sha256sum --check --strict payload-checksums.sha256',
    'ghcr.io/aculy/bangumi-staff-stats-api',
    'ghcr.io/aculy/bangumi-staff-stats-updater',
    'sudo -n -- /usr/local/sbin/bgmss-v2-deploy',
    '--version "$RELEASE_VERSION"',
    '--manifest-digest "$RELEASE_MANIFEST_DIGEST"',
  ]) {
    if (!runs.includes(required)) {
      fail('REQUIRED_GATE', `deploy lacks required ${required}`, source);
    }
  }
  if (
    !runs.includes(
      '[[ "$RELEASE_MANIFEST_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]]',
    ) ||
    !runs.includes('[[ "$RELEASE_VERSION" =~ ^v(')
  ) {
    fail('INPUT_VALIDATION', 'deploy inputs are not strictly validated', source);
  }
  if (
    /\b(?:docker\s+(?:build|login|push)|npm|node|scp|rsync)\b/iu.test(
      runs,
    ) ||
    /(?:^|[/:])latest(?:\b|$)/imu.test(runs) ||
    /--(?:host|path|command)(?:\b|=)|--manifest(?:[ =]|$)/iu.test(runs)
  ) {
    fail(
      'DEPLOY_BOUNDARY',
      'deploy contains code execution, build, mutable image, or free host/path/command input',
      source,
    );
  }
  const sshCommands = [
    ...runs.matchAll(/(?:^|\n)[ \t]*ssh(?=[ \t]|\\)/gu),
  ];
  if (
    sshCommands.length !== 1 ||
    !runs.includes('-- "bgmss-deploy@$BGMSS_PRODUCTION_SSH_HOST"') ||
    !runs.includes('-o StrictHostKeyChecking=yes') ||
    !runs.includes('-o "UserKnownHostsFile=$known_hosts_file"')
  ) {
    fail(
      'DEPLOY_SSH',
      'deploy must contain exactly one host-key-pinned fixed SSH invocation',
      source,
    );
  }
  if (
    !/-- "bgmss-deploy@\$BGMSS_PRODUCTION_SSH_HOST" \\\r?\n[ \t]*sudo -n -- \/usr\/local\/sbin\/bgmss-v2-deploy \\\r?\n[ \t]*--version "\$RELEASE_VERSION" \\\r?\n[ \t]*--manifest-digest "\$RELEASE_MANIFEST_DIGEST"[ \t]*$/u.test(
      runs,
    )
  ) {
    fail(
      'DEPLOY_SSH',
      'fixed passwordless root transaction may receive only version and manifest digest',
      source,
    );
  }
  const validateIndex = findStep(
    deploy,
    (_step, run) =>
      run.includes('RELEASE_VERSION') && run.includes('RELEASE_MANIFEST_DIGEST'),
  );
  const downloadIndex = findStep(
    deploy,
    (_step, run) => run.includes('gh release download'),
  );
  const verifyIndex = findStep(
    deploy,
    (_step, run) =>
      run.includes('sha256sum --check --strict') &&
      run.includes('release-manifest.canonical.json') &&
      run.includes('def published_image($repository):') &&
      run.includes('test "$descriptor_count" -eq 10'),
  );
  const transactionIndex = findStep(
    deploy,
    (step, run) =>
      run.includes('/usr/local/sbin/bgmss-v2-deploy') &&
      Object.values(step.env ?? {}).some((value) =>
        String(value).includes('secrets.BGMSS_PRODUCTION_SSH_PRIVATE_KEY'),
      ),
  );
  if (
    [validateIndex, downloadIndex, verifyIndex, transactionIndex].some(
      (index) => index < 0,
    ) ||
    !(validateIndex < downloadIndex &&
      downloadIndex < verifyIndex &&
      verifyIndex < transactionIndex)
  ) {
    fail(
      'ORDER',
      'deploy must validate, download, verify, then expose its one secret',
      source,
    );
  }
  const verifyRun = String(deploy.steps[verifyIndex].run);
  const expectedModeApplication = [
    'chmod 0555 -- archive-smoke',
    'chmod 0444 -- \\',
    '  backend-component-statement.json \\',
    '  backend.spdx.json \\',
    '  compatibility-manifest.json \\',
    '  frontend-component-statement.json \\',
    '  frontend-static-linux-amd64.tar \\',
    '  frontend.spdx.json \\',
    '  payload-checksums.sha256 \\',
    '  updater-component-statement.json \\',
    '  updater.spdx.json',
  ].join('\n');
  const descriptorIntegrityIndex = verifyRun.indexOf(
    'test "sha256:$(sha256sum "$name"',
  );
  const modeApplicationIndex = verifyRun.indexOf(expectedModeApplication);
  const descriptorModeIndex = verifyRun.indexOf(
    `test "0$(stat --format='%a' "$name")" = "$mode"`,
  );
  const chmodCommandCount = verifyRun
    .split('\n')
    .filter((line) => line.trimStart().startsWith('chmod ')).length;
  if (
    descriptorIntegrityIndex < 0 ||
    modeApplicationIndex <= descriptorIntegrityIndex ||
    descriptorModeIndex <= modeApplicationIndex ||
    chmodCommandCount !== 2
  ) {
    fail(
      'ASSET_MODE',
      'deploy must verify closed asset descriptors before applying exact target modes and rechecking them',
      source,
    );
  }
}

export function validateWorkflowSource(relativePath, sourceText) {
  if (!WORKFLOW_PATHS.includes(relativePath)) {
    fail('PATH', `workflow path is not reviewed: ${relativePath}`, relativePath);
  }
  const workflow = parseWorkflowSource(sourceText, relativePath);
  assertCommonWorkflow(workflow, relativePath);
  if (relativePath === '.github/workflows/ci.yml') {
    assertCiWorkflow(workflow, sourceText, relativePath);
  } else if (relativePath === '.github/workflows/operations.yml') {
    assertOperationsWorkflow(workflow, relativePath);
  } else if (relativePath === '.github/workflows/release.yml') {
    assertReleaseWorkflow(workflow, relativePath);
  } else if (relativePath === '.github/workflows/deploy.yml') {
    assertDeployWorkflow(workflow, relativePath);
  }
  return workflow;
}

export function validateWorkflowSet(sources) {
  assertExactKeys(sources, WORKFLOW_PATHS, 'workflow source set', 'workflows');
  const validated = Object.create(null);
  for (const relativePath of WORKFLOW_PATHS) {
    validated[relativePath] = validateWorkflowSource(
      relativePath,
      sources[relativePath],
    );
  }
  return Object.freeze(validated);
}

export function readWorkflowSources(root = REPOSITORY_ROOT) {
  const resolvedRoot = path.resolve(root);
  const sources = Object.create(null);
  for (const relativePath of WORKFLOW_PATHS) {
    const filePath = path.resolve(resolvedRoot, ...relativePath.split('/'));
    if (!filePath.startsWith(`${resolvedRoot}${path.sep}`)) {
      fail('PATH', `workflow path escapes root: ${relativePath}`, relativePath);
    }
    const information = fs.lstatSync(filePath);
    if (!information.isFile() || information.isSymbolicLink() || information.nlink !== 1) {
      fail(
        'PATH',
        'workflow must be a single-link regular file',
        relativePath,
      );
    }
    sources[relativePath] = fs.readFileSync(filePath, 'utf8');
  }
  return sources;
}

export function checkRepositoryWorkflows(root = REPOSITORY_ROOT) {
  return validateWorkflowSet(readWorkflowSources(root));
}

function isMainModule() {
  const argument = process.argv[1];
  return (
    typeof argument === 'string' &&
    import.meta.url === pathToFileURL(path.resolve(argument)).href
  );
}

if (isMainModule()) {
  try {
    checkRepositoryWorkflows();
    process.stdout.write('workflow policy accepted 4 reviewed workflows\n');
  } catch (error) {
    const code =
      error instanceof WorkflowPolicyError ? error.code : 'UNEXPECTED';
    process.stderr.write(`workflow policy rejected [${code}]: ${error.message}\n`);
    process.exitCode = 1;
  }
}
