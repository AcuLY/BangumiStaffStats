import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EXPECTED_NODE_VERSION = '24.18.0';
const EXPECTED_NPM_VERSION = '11.16.0';
const OPERATIONS_ROOT = path.resolve(import.meta.dirname, '..');
const REPOSITORY_ROOT = path.dirname(OPERATIONS_ROOT);

export const OPERATIONS_CONTROL_ENVIRONMENT =
  'operations-control-environment-v1';
export const OPERATIONS_CONTROL_SCRIPT_SHELL = '/bin/bash';

const CONTROL_PRELOAD_ARGUMENTS = Object.freeze([
  '--import',
  './validation/control-runtime-preload.mjs',
]);
const CONTROL_LIFECYCLE_SCRIPTS = Object.freeze({
  'preflight:myserver':
    '"$BGMSS_OPS_TOOL_DIR/node" --import ./validation/control-runtime-preload.mjs validation/preflight-myserver.mjs',
  'validate:myserver':
    '"$BGMSS_OPS_TOOL_DIR/node" --import ./validation/control-runtime-preload.mjs validation/validate-myserver.mjs',
});
const CONTROL_LIFECYCLE_HOOK_NAMES = Object.freeze([
  'prepreflight:myserver',
  'postpreflight:myserver',
  'prevalidate:myserver',
  'postvalidate:myserver',
]);
const CONTROL_ENVIRONMENT_KEYS = Object.freeze([
  'BGMSS_OPS_CONTROL_ENVIRONMENT',
  'BGMSS_OPS_GH',
  'BGMSS_OPS_TOOL_DIR',
  'GH_CONFIG_DIR',
  'GH_TOKEN',
  'HOME',
  'SSH_AUTH_SOCK',
]);

export class OperationsControlRuntimeError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'OperationsControlRuntimeError';
  }
}

function fail(message, cause) {
  throw new OperationsControlRuntimeError(
    message,
    cause ? { cause } : undefined,
  );
}

function canonicalDirectory(value, label) {
  if (
    typeof value !== 'string' ||
    !path.isAbsolute(value) ||
    path.normalize(value) !== value
  ) {
    fail(`${label} must be an absolute normalized directory`);
  }
  let canonical;
  let information;
  try {
    canonical = fs.realpathSync.native(value);
    information = fs.lstatSync(value);
  } catch (error) {
    fail(`${label} is unavailable`, error);
  }
  if (canonical !== value || !information.isDirectory()) {
    fail(`${label} must be one canonical directory`);
  }
  return canonical;
}

function canonicalExecutable(
  value,
  label,
  {
    allowSymlink = false,
    requireCanonical = true,
    requireSingleLink = false,
  } = {},
) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) {
    fail(`${label} must be an absolute file`);
  }
  let canonical;
  let information;
  let pathInformation;
  try {
    canonical = fs.realpathSync.native(value);
    information = fs.statSync(canonical);
    pathInformation = fs.lstatSync(value);
  } catch (error) {
    fail(`${label} is unavailable`, error);
  }
  if (
    (requireCanonical && canonical !== value) ||
    (!allowSymlink && pathInformation.isSymbolicLink()) ||
    !information.isFile() ||
    (information.mode & 0o111) === 0 ||
    (requireSingleLink && information.nlink !== 1)
  ) {
    fail(`${label} must be one canonical executable file`);
  }
  return canonical;
}

function assertFixedSequence(actual, expected, label) {
  if (
    !Array.isArray(actual) ||
    actual.length !== expected.length ||
    actual.some((entry, index) => entry !== expected[index])
  ) {
    fail(`${label} must retain its exact closed arguments`);
  }
}

export function assertOperationsControlManifest(manifest) {
  if (
    manifest === null ||
    typeof manifest !== 'object' ||
    Array.isArray(manifest) ||
    manifest.scripts === null ||
    typeof manifest.scripts !== 'object' ||
    Array.isArray(manifest.scripts) ||
    manifest.packageManager !== `npm@${EXPECTED_NPM_VERSION}` ||
    manifest.engines?.node !== EXPECTED_NODE_VERSION ||
    manifest.engines?.npm !== EXPECTED_NPM_VERSION ||
    Object.entries(CONTROL_LIFECYCLE_SCRIPTS).some(
      ([name, script]) => manifest.scripts[name] !== script,
    )
  ) {
    fail('Operations package Node/npm authority drifted');
  }
  const hook = CONTROL_LIFECYCLE_HOOK_NAMES.find((name) =>
    Object.hasOwn(manifest.scripts, name),
  );
  if (hook !== undefined) {
    fail(`Operations package declares forbidden lifecycle hook: ${hook}`);
  }
  return manifest;
}

export function assertExactOperationsControlNpmArguments(
  actual,
  {
    lifecycleArguments,
    lifecycleEvent,
    npmExecutable,
    shell = OPERATIONS_CONTROL_SCRIPT_SHELL,
  } = {},
) {
  if (
    !Array.isArray(lifecycleArguments) ||
    lifecycleArguments.some((entry) => typeof entry !== 'string') ||
    CONTROL_LIFECYCLE_SCRIPTS[lifecycleEvent] === undefined ||
    typeof npmExecutable !== 'string' ||
    typeof shell !== 'string'
  ) {
    throw new TypeError('exact Operations npm arguments are invalid');
  }
  assertFixedSequence(
    actual,
    [
      npmExecutable,
      '--silent',
      '--userconfig=/dev/null',
      '--globalconfig=/dev/null',
      `--script-shell=${shell}`,
      '--node-options=',
      '--prefix',
      OPERATIONS_ROOT,
      '--ignore-scripts',
      'run',
      lifecycleEvent,
      '--',
      ...lifecycleArguments,
    ],
    'control launcher npm arguments',
  );
  return actual;
}

function injectionVariable(name) {
  const normalized = name.toLowerCase();
  return (
    [
      'bash_env',
      'env',
      'ksh_env',
      'node_import',
      'node_loader',
      'node_options',
      'node_path',
      'node_preload',
      'npm_config_node_options',
      'npm_config_script_shell',
      'npm_config_shell',
    ].includes(normalized) ||
    normalized.startsWith('dyld_') ||
    normalized.startsWith('ld_')
  );
}

export function assertNoOperationsStartupInjection(
  environment,
  { controller = false } = {},
) {
  if (
    environment === null ||
    typeof environment !== 'object' ||
    Array.isArray(environment)
  ) {
    throw new TypeError('control environment must be one object');
  }
  for (const [name, value] of Object.entries(environment)) {
    if (!injectionVariable(name) || value === '') continue;
    if (
      controller &&
      name.toLowerCase() === 'npm_config_script_shell' &&
      value === OPERATIONS_CONTROL_SCRIPT_SHELL
    ) {
      continue;
    }
    fail(`remote control rejects inherited startup authority: ${name}`);
  }
}

function exactControlShell() {
  // Keep the reviewed invocation path literal across platforms where /bin is
  // either a directory or the system usr-merge symlink, while closing the
  // resolved executable identity itself.
  const canonicalShell = canonicalExecutable(
    OPERATIONS_CONTROL_SCRIPT_SHELL,
    'Operations control script shell',
    {
      allowSymlink: true,
      requireCanonical: false,
      requireSingleLink: true,
    },
  );
  if (
    canonicalShell === REPOSITORY_ROOT ||
    canonicalShell.startsWith(`${REPOSITORY_ROOT}${path.sep}`)
  ) {
    fail('Operations control script shell is outside its fixed authority');
  }
  return OPERATIONS_CONTROL_SCRIPT_SHELL;
}

function requiredEnvironmentValue(environment, name) {
  const value = environment[name];
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.includes('\0')
  ) {
    fail(`${name} is required by the closed control environment`);
  }
  return value;
}

function optionalEnvironmentValue(environment, name) {
  const value = environment[name];
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || value.includes('\0')) {
    fail(`${name} is invalid in the closed control environment`);
  }
  return value;
}

export function createClosedOperationsControlEnvironment(
  environment = process.env,
) {
  assertNoOperationsStartupInjection(environment);
  if (
    requiredEnvironmentValue(
      environment,
      'BGMSS_OPS_CONTROL_ENVIRONMENT',
    ) !== OPERATIONS_CONTROL_ENVIRONMENT
  ) {
    fail('remote control was not started through the closed launcher');
  }
  const toolDirectory = canonicalDirectory(
    requiredEnvironmentValue(environment, 'BGMSS_OPS_TOOL_DIR'),
    'BGMSS_OPS_TOOL_DIR',
  );
  const home = canonicalDirectory(
    requiredEnvironmentValue(environment, 'HOME'),
    'HOME',
  );
  const githubCli = canonicalExecutable(
    requiredEnvironmentValue(environment, 'BGMSS_OPS_GH'),
    'BGMSS_OPS_GH',
    { requireSingleLink: true },
  );
  if (
    githubCli === REPOSITORY_ROOT ||
    githubCli.startsWith(`${REPOSITORY_ROOT}${path.sep}`)
  ) {
    fail('BGMSS_OPS_GH must remain outside the repository');
  }
  const result = {
    BGMSS_OPS_CONTROL_ENVIRONMENT: OPERATIONS_CONTROL_ENVIRONMENT,
    BGMSS_OPS_GH: githubCli,
    BGMSS_OPS_TOOL_DIR: toolDirectory,
    GH_HOST: 'github.com',
    HOME: home,
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    NO_COLOR: '1',
    NPM_CONFIG_AUDIT: 'false',
    NPM_CONFIG_CACHE: '/dev/null',
    NPM_CONFIG_FUND: 'false',
    NPM_CONFIG_GLOBALCONFIG: '/dev/null',
    NPM_CONFIG_IGNORE_SCRIPTS: 'true',
    NPM_CONFIG_LOGS_DIR: '/dev/null',
    NPM_CONFIG_UPDATE_NOTIFIER: 'false',
    NPM_CONFIG_USERCONFIG: '/dev/null',
    PATH: `${toolDirectory}:/usr/bin:/bin`,
    TZ: 'UTC',
  };
  for (const name of CONTROL_ENVIRONMENT_KEYS.slice(3)) {
    if (name === 'HOME') continue;
    const value = optionalEnvironmentValue(environment, name);
    if (value !== undefined) result[name] = value;
  }
  if (
    result.SSH_AUTH_SOCK !== undefined &&
    !path.isAbsolute(result.SSH_AUTH_SOCK)
  ) {
    fail('SSH_AUTH_SOCK must be one absolute credential interface');
  }
  return Object.freeze(result);
}

export function prepareOperationsControlLaunch({
  argv,
  environment = process.env,
  execArgv = process.execArgv,
  execPath = process.execPath,
  nodeVersion = process.versions.node,
  probeNpmVersion = defaultNpmVersionProbe,
} = {}) {
  if (!Array.isArray(argv) || argv.some((entry) => typeof entry !== 'string')) {
    throw new TypeError('control launch arguments must be one string array');
  }
  const [lifecycleEvent, ...lifecycleArguments] = argv;
  const lifecycleScript = CONTROL_LIFECYCLE_SCRIPTS[lifecycleEvent];
  if (lifecycleScript === undefined) {
    fail('control launcher requires one exact remote-control lifecycle');
  }
  assertFixedSequence(execArgv, [], 'control launcher Node arguments');
  if (nodeVersion !== EXPECTED_NODE_VERSION) {
    fail(`remote control requires Node ${EXPECTED_NODE_VERSION}`);
  }
  const childEnvironment =
    createClosedOperationsControlEnvironment(environment);
  const toolDirectory = childEnvironment.BGMSS_OPS_TOOL_DIR;
  const admittedNode = canonicalExecutable(
    path.join(toolDirectory, 'node'),
    'admitted launcher Node',
    { requireSingleLink: true },
  );
  const runningNode = canonicalExecutable(
    execPath,
    'running launcher Node',
    { requireSingleLink: true },
  );
  if (admittedNode !== runningNode) {
    fail('control launcher Node does not belong to BGMSS_OPS_TOOL_DIR');
  }
  const npmExecutable = canonicalExecutable(
    path.join(
      path.dirname(toolDirectory),
      'lib',
      'node_modules',
      'npm',
      'bin',
      'npm-cli.js',
    ),
    'control launcher npm CLI',
  );
  const npmWrapper = canonicalExecutable(
    path.join(toolDirectory, 'npm'),
    'control launcher npm entry',
    { allowSymlink: true, requireCanonical: false },
  );
  if (npmWrapper !== npmExecutable) {
    fail('control launcher npm entry does not resolve to its exact CLI');
  }
  assertOperationsControlManifest(
    readJson(
      path.join(OPERATIONS_ROOT, 'package.json'),
      'Operations package manifest',
    ),
  );
  const npmManifest = readJson(
    path.join(path.dirname(path.dirname(npmExecutable)), 'package.json'),
    'control launcher npm package manifest',
  );
  if (
    npmManifest.name !== 'npm' ||
    npmManifest.version !== EXPECTED_NPM_VERSION ||
    npmManifest.bin?.npm !== 'bin/npm-cli.js' ||
    probeNpmVersion({
      execPath: admittedNode,
      npmExecutable,
      toolDirectory,
    }) !== EXPECTED_NPM_VERSION
  ) {
    fail(`remote control requires npm ${EXPECTED_NPM_VERSION}`);
  }
  const shell = exactControlShell();
  const npmArguments = [
    npmExecutable,
    '--silent',
    '--userconfig=/dev/null',
    '--globalconfig=/dev/null',
    `--script-shell=${shell}`,
    '--node-options=',
    '--prefix',
    OPERATIONS_ROOT,
    '--ignore-scripts',
    'run',
    lifecycleEvent,
    '--',
    ...lifecycleArguments,
  ];
  assertExactOperationsControlNpmArguments(npmArguments, {
    lifecycleArguments,
    lifecycleEvent,
    npmExecutable,
    shell,
  });
  return Object.freeze({
    args: Object.freeze(npmArguments),
    command: admittedNode,
    cwd: REPOSITORY_ROOT,
    environment: childEnvironment,
  });
}

function readJson(filePath, label) {
  try {
    const information = fs.lstatSync(filePath);
    if (
      fs.realpathSync.native(filePath) !== filePath ||
      !information.isFile() ||
      information.isSymbolicLink() ||
      information.nlink !== 1 ||
      information.size === 0 ||
      information.size > 1024 * 1024
    ) {
      fail(`${label} must be one bounded canonical regular file`);
    }
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      fail(`${label} must be one JSON object`);
    }
    return value;
  } catch (error) {
    if (error instanceof OperationsControlRuntimeError) throw error;
    fail(`${label} is unreadable`, error);
  }
}

function defaultNpmVersionProbe({ execPath, npmExecutable, toolDirectory }) {
  const result = spawnSync(
    execPath,
    [npmExecutable, '--version', '--no-update-notifier'],
    {
      cwd: OPERATIONS_ROOT,
      encoding: 'utf8',
      env: {
        // npm 11's --version fast path returns before cache/log creation.
        // Route every remaining config-derived write address through the
        // non-directory null device so even an unexpected probe failure
        // cannot create repository or toolchain residue.
        HOME: '/dev/null',
        LANG: 'C',
        LC_ALL: 'C',
        NPM_CONFIG_AUDIT: 'false',
        NPM_CONFIG_CACHE: '/dev/null',
        NPM_CONFIG_FUND: 'false',
        NPM_CONFIG_GLOBALCONFIG: '/dev/null',
        NPM_CONFIG_IGNORE_SCRIPTS: 'true',
        NPM_CONFIG_LOGS_DIR: '/dev/null',
        NPM_CONFIG_UPDATE_NOTIFIER: 'false',
        NPM_CONFIG_USERCONFIG: '/dev/null',
        PATH: `${toolDirectory}:/usr/bin:/bin`,
        TZ: 'UTC',
      },
      maxBuffer: 64 * 1024,
      shell: false,
      timeout: 30_000,
    },
  );
  if (
    result.error ||
    result.status !== 0 ||
    result.signal !== null ||
    result.stderr !== ''
  ) {
    fail('exact npm version probe failed closed', result.error);
  }
  return result.stdout.trim();
}

export function assertExactOperationsControlRuntime({
  cwd = process.cwd(),
  environment = process.env,
  execArgv = process.execArgv,
  execPath = process.execPath,
  expectedLifecycleEvent,
  nodeVersion = process.versions.node,
  probeNpmVersion = defaultNpmVersionProbe,
} = {}) {
  if (
    expectedLifecycleEvent !== 'preflight:myserver' &&
    expectedLifecycleEvent !== 'validate:myserver'
  ) {
    throw new TypeError('expected remote-control lifecycle event is invalid');
  }
  if (nodeVersion !== EXPECTED_NODE_VERSION) {
    fail(`remote control requires Node ${EXPECTED_NODE_VERSION}`);
  }
  assertFixedSequence(
    execArgv,
    CONTROL_PRELOAD_ARGUMENTS,
    'remote control Node preload arguments',
  );
  assertNoOperationsStartupInjection(environment, { controller: true });
  if (
    environment.BGMSS_OPS_CONTROL_ENVIRONMENT !==
      OPERATIONS_CONTROL_ENVIRONMENT ||
    environment.npm_config_script_shell !==
      OPERATIONS_CONTROL_SCRIPT_SHELL ||
    environment.npm_config_ignore_scripts !== 'true' ||
    environment.npm_config_node_options !== '' ||
    environment.npm_config_userconfig !== '/dev/null' ||
    environment.npm_config_globalconfig !== '/dev/null' ||
    exactControlShell() !== OPERATIONS_CONTROL_SCRIPT_SHELL ||
    cwd !== OPERATIONS_ROOT
  ) {
    fail('remote control environment or exact script shell drifted');
  }
  if (
    environment.npm_lifecycle_event !== expectedLifecycleEvent ||
    environment.npm_command !== 'run-script' ||
    environment.npm_lifecycle_script !==
      CONTROL_LIFECYCLE_SCRIPTS[expectedLifecycleEvent]
  ) {
    fail('remote control must run through its exact npm lifecycle script');
  }

  const toolDirectory = canonicalDirectory(
    environment.BGMSS_OPS_TOOL_DIR,
    'BGMSS_OPS_TOOL_DIR',
  );
  if (path.basename(toolDirectory) !== 'bin') {
    fail('BGMSS_OPS_TOOL_DIR must be the exact toolchain bin directory');
  }
  const admittedNode = canonicalExecutable(
    path.join(toolDirectory, 'node'),
    'admitted Node',
    { requireSingleLink: true },
  );
  const runningNode = canonicalExecutable(
    execPath,
    'running Node',
    { requireSingleLink: true },
  );
  if (admittedNode !== runningNode) {
    fail('running Node does not belong to BGMSS_OPS_TOOL_DIR');
  }

  const admittedNpm = canonicalExecutable(
    path.join(toolDirectory, 'npm'),
    'admitted npm',
    { allowSymlink: true, requireCanonical: false },
  );
  const invokingNpm = canonicalExecutable(
    environment.npm_execpath,
    'invoking npm CLI',
  );
  if (
    admittedNpm !== invokingNpm ||
    path.basename(invokingNpm) !== 'npm-cli.js'
  ) {
    fail('invoking npm does not belong to BGMSS_OPS_TOOL_DIR');
  }
  for (const [name, value] of [
    ['NODE', environment.NODE],
    ['npm_node_execpath', environment.npm_node_execpath],
  ]) {
    if (
      canonicalExecutable(value, name, { requireSingleLink: true }) !==
      runningNode
    ) {
      fail(`${name} does not identify the running admitted Node`);
    }
  }

  const npmRoot = path.resolve(path.dirname(invokingNpm), '..');
  const expectedNpmRoot = path.join(
    path.dirname(toolDirectory),
    'lib',
    'node_modules',
    'npm',
  );
  if (
    npmRoot !== expectedNpmRoot ||
    path.join(npmRoot, 'bin', 'npm-cli.js') !== invokingNpm
  ) {
    fail('invoking npm CLI has an unexpected package layout');
  }
  const npmManifest = readJson(
    path.join(npmRoot, 'package.json'),
    'invoking npm package manifest',
  );
  if (
    npmManifest.name !== 'npm' ||
    npmManifest.version !== EXPECTED_NPM_VERSION ||
    npmManifest.bin?.npm !== 'bin/npm-cli.js' ||
    environment.npm_config_npm_version !== EXPECTED_NPM_VERSION
  ) {
    fail(`remote control requires npm ${EXPECTED_NPM_VERSION}`);
  }

  assertOperationsControlManifest(
    readJson(
      path.join(OPERATIONS_ROOT, 'package.json'),
      'Operations package manifest',
    ),
  );
  const probedNpmVersion = probeNpmVersion({
    execPath: runningNode,
    npmExecutable: invokingNpm,
    toolDirectory,
  });
  if (probedNpmVersion !== EXPECTED_NPM_VERSION) {
    fail(`remote control requires npm ${EXPECTED_NPM_VERSION}`);
  }

  return Object.freeze({
    nodeVersion,
    npmVersion: probedNpmVersion,
    toolDirectory,
  });
}
