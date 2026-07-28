#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { canonicalJson, deepFreeze } from '../lib/canonical-json.mjs';
import { sha256 } from '../lib/digest.mjs';
import { writeImmutableFile } from '../lib/immutable-output.mjs';
import {
  isStrictlyContained,
  requireCanonicalPath,
} from '../lib/path-policy.mjs';
import {
  buildSanitizedEnvironment,
  runSubprocess,
} from '../lib/subprocess.mjs';
import { parseCanonicalJson } from '../lib/strict-json.mjs';
import { createRunRoot } from '../lib/run-root.mjs';
import { assembleReleaseCandidate } from './candidate.mjs';
import {
  ACCEPTED_DEVELOPMENT_SHA256,
  APPLICATION_VERSION,
  BUILD_TOOLCHAIN,
  FROZEN_PRODUCT,
  REPOSITORY_ROOT,
} from './constants.mjs';
import { parseDockerVersionEvidence } from './docker-capability.mjs';
import {
  optionPath,
  parseOptions,
  runCli,
} from './cli.mjs';
import { compareTrees } from './files.mjs';
import {
  createDetachedCheckout,
  executableFromPath,
  GitRepository,
} from './git.mjs';
import {
  readAcceptedDevelopment,
  verifyAcceptedDevelopmentRepository,
} from './receipt.mjs';
import { cleanupOwnedRunRoot } from './owned-cleanup.mjs';

function fail(message) {
  throw new Error(message);
}

function admittedArchitecture(value, label) {
  const normalized =
    value === 'x86_64'
      ? 'amd64'
      : value === 'aarch64'
        ? 'arm64'
        : value;
  if (!['amd64', 'arm64'].includes(normalized)) {
    fail(`${label} architecture is not admitted`);
  }
  return normalized;
}

function pathDirectories(searchPath = process.env.PATH) {
  const directories = [];
  for (const entry of String(searchPath ?? '').split(path.delimiter)) {
    if (!path.isAbsolute(entry)) continue;
    try {
      const canonical = requireCanonicalPath(fs.realpathSync.native(entry), {
        label: 'build PATH entry',
        type: 'directory',
      });
      if (!directories.includes(canonical)) directories.push(canonical);
    } catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes(error?.code)) throw error;
    }
  }
  if (directories.length === 0) fail('build PATH has no canonical directory');
  return directories;
}

function dockerBuildxPlugin() {
  const candidates = [];
  try {
    candidates.push(executableFromPath('docker-buildx'));
  } catch {}
  for (const candidate of [
    '/usr/libexec/docker/cli-plugins/docker-buildx',
    '/usr/local/lib/docker/cli-plugins/docker-buildx',
    ...(typeof process.env.HOME === 'string'
      ? [path.join(process.env.HOME, '.docker', 'cli-plugins', 'docker-buildx')]
      : []),
  ]) {
    try {
      const canonical = requireCanonicalPath(fs.realpathSync.native(candidate), {
        label: 'Docker Buildx CLI plugin',
        type: 'file',
      });
      if ((fs.statSync(canonical).mode & 0o111) !== 0) candidates.push(canonical);
    } catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes(error?.code)) throw error;
    }
  }
  const unique = [...new Set(candidates)];
  if (unique.length === 0) fail('exact Docker Buildx CLI plugin is unavailable');
  return unique[0];
}

function extraEnvironment(setRoot, builderName, buildxPlugin) {
  if (!/^bgmss-operations-[0-9a-f]{12}$/u.test(builderName)) {
    fail('owned Buildx builder name is invalid');
  }
  const dockerConfig = path.join(setRoot, 'docker-config');
  fs.mkdirSync(dockerConfig, { mode: 0o700 });
  writeImmutableFile({
    bytes: canonicalJson({
      cliPluginsExtraDirs: [path.dirname(buildxPlugin)],
    }),
    mode: 0o400,
    relativePath: 'config.json',
    root: dockerConfig,
  });
  const extra = {
    BUILDX_BUILDER: builderName,
    DOCKER_CONFIG: dockerConfig,
    DOCKER_DEFAULT_PLATFORM: 'linux/amd64',
    GOTOOLCHAIN: 'go1.26.5+auto',
    NPM_CONFIG_CACHE: path.join(setRoot, 'npm-cache'),
    PYTHONDONTWRITEBYTECODE: '1',
    UV_CACHE_DIR: path.join(setRoot, 'uv-cache'),
    UV_NO_PROGRESS: '1',
  };
  fs.mkdirSync(extra.NPM_CONFIG_CACHE, { mode: 0o700 });
  fs.mkdirSync(extra.UV_CACHE_DIR, { mode: 0o700 });
  return extra;
}

function buildEnvironment(setRoot, builderName, buildxPlugin) {
  const extra = extraEnvironment(setRoot, builderName, buildxPlugin);
  return buildSanitizedEnvironment({
    allowedExtraNames: Object.keys(extra),
    extra,
    pathEntries: pathDirectories(),
    runRoot: setRoot,
  });
}

async function command({
  args,
  cwd,
  environment,
  executable,
  timeoutMs = 7_200_000,
}) {
  return await runSubprocess({
    args,
    command: executable,
    cwd,
    environment,
    maxOutputBytes: 64 * 1024 * 1024,
    timeoutMs,
  });
}

function capturedPath(output, expression, label, checkoutRoot) {
  const matches = [...output.matchAll(expression)];
  if (matches.length !== 1) fail(`${label} did not emit exactly one artifact root`);
  const candidate = path.resolve(matches[0][1]);
  const canonical = requireCanonicalPath(candidate, {
    label,
    type: 'directory',
  });
  if (!isStrictlyContained(canonical, checkoutRoot)) {
    fail(`${label} escaped its isolated checkout`);
  }
  return canonical;
}

async function assertTool(commandSpec, expected, label) {
  const result = await command(commandSpec);
  if (result.stdout.trim() !== expected) {
    fail(`${label} must be exactly ${expected}, got ${result.stdout.trim()}`);
  }
}

async function assertToolPrefix(commandSpec, expectedPrefix, label) {
  const result = await command(commandSpec);
  const actual = result.stdout.trim();
  if (
    actual !== expectedPrefix &&
    !actual.startsWith(`${expectedPrefix} `)
  ) {
    fail(`${label} must start with ${expectedPrefix}, got ${actual}`);
  }
}

async function preparePython({ environment, setRoot, uv }) {
  await command({
    args: ['python', 'install', BUILD_TOOLCHAIN.pythonVersion],
    cwd: setRoot,
    environment,
    executable: uv,
    timeoutMs: 900_000,
  });
  const found = await command({
    args: ['python', 'find', BUILD_TOOLCHAIN.pythonVersion],
    cwd: setRoot,
    environment,
    executable: uv,
  });
  const python = requireCanonicalPath(found.stdout.trim(), {
    label: 'exact Python interpreter',
    type: 'file',
  });
  await assertTool(
    {
      args: ['--version'],
      cwd: setRoot,
      environment,
      executable: python,
    },
    `Python ${BUILD_TOOLCHAIN.pythonVersion}`,
    'Python',
  );
  return python;
}

async function prepareBuilder({
  buildxPlugin,
  docker,
  environment,
  markCreated,
  setRoot,
}) {
  const builderName = environment.BUILDX_BUILDER;
  const common = { cwd: setRoot, environment, executable: docker };
  const dockerIdentity = await command({
    ...common,
    args: [
      'version',
      '--format',
      '{{json .}}',
    ],
  });
  const dockerCapability = parseDockerVersionEvidence(
    dockerIdentity.stdout,
  );
  const endpoint = await command({
    ...common,
    args: [
      'context',
      'inspect',
      'default',
      '--format',
      '{{json .Endpoints.docker.Host}}',
    ],
  });
  if (endpoint.stdout.trim() !== '"unix:///var/run/docker.sock"') {
    fail('Docker must use the local default Unix daemon');
  }
  const buildxVersion = await command({
    ...common,
    args: ['buildx', 'version'],
  });
  if (
    !new RegExp(
      `^github\\.com/docker/buildx v${BUILD_TOOLCHAIN.buildxVersion.replaceAll('.', '\\.')} [0-9a-f]+(?:-dirty)?$`,
      'u',
    ).test(buildxVersion.stdout.trim())
  ) {
    fail(`Docker Buildx must be exactly v${BUILD_TOOLCHAIN.buildxVersion}`);
  }
  const pluginVersion = await command({
    args: ['version'],
    cwd: setRoot,
    environment,
    executable: buildxPlugin,
  });
  if (!pluginVersion.stdout.includes(` v${BUILD_TOOLCHAIN.buildxVersion} `)) {
    fail('direct Buildx plugin identity differs from Docker CLI Buildx');
  }
  await command({
    ...common,
    args: [
      'buildx',
      'create',
      '--name',
      builderName,
      '--driver',
      'docker-container',
      '--driver-opt',
      `image=${BUILD_TOOLCHAIN.buildkitImage}`,
      '--use',
    ],
    timeoutMs: 300_000,
  });
  markCreated();
  const inspected = await command({
    ...common,
    args: ['buildx', 'inspect', builderName, '--bootstrap'],
    timeoutMs: 900_000,
  });
  const output = inspected.stdout;
  const platforms = /^Platforms:\s+(.+)$/mu
    .exec(output)?.[1]
    .split(',')
    .map((entry) => entry.trim().replace(/\*$/u, '')) ?? [];
  if (
    !/^Driver:\s+docker-container$/mu.test(output) ||
    !output.includes(`image="${BUILD_TOOLCHAIN.buildkitImage}"`) ||
    !new RegExp(
      `^BuildKit version:\\s+v${BUILD_TOOLCHAIN.buildkitVersion.replaceAll('.', '\\.')}$`,
      'mu',
    ).test(output) ||
    !platforms.includes('linux/amd64')
  ) {
    fail('owned Buildx builder differs from the fixed driver/image/version/platform');
  }
  return deepFreeze({
    buildkitImage: BUILD_TOOLCHAIN.buildkitImage,
    buildkitVersion: BUILD_TOOLCHAIN.buildkitVersion,
    buildxVersion: BUILD_TOOLCHAIN.buildxVersion,
    ...dockerCapability,
    dockerEndpoint: 'unix:///var/run/docker.sock',
  });
}

async function removeBuilder({ docker, environment, setRoot }) {
  const builderName = environment.BUILDX_BUILDER;
  await command({
    args: ['buildx', 'rm', builderName],
    cwd: setRoot,
    environment,
    executable: docker,
    timeoutMs: 300_000,
  });
}

async function buildSet({
  checkout,
  docker,
  buildxPlugin,
  go,
  node,
  npm,
  setRoot,
  shell,
  uv,
}) {
  const builderName = `bgmss-operations-${sha256(setRoot).slice(7, 19)}`;
  const environment = buildEnvironment(setRoot, builderName, buildxPlugin);
  let primaryError;
  let result;
  let builderCreated = false;
  try {
    const builderToolchain = await prepareBuilder({
      buildxPlugin,
      docker,
      environment,
      markCreated: () => {
        builderCreated = true;
      },
      setRoot,
    });
    const [, , , goIdentity] = await Promise.all([
      assertTool(
        {
          args: ['--version'],
          cwd: checkout.root,
          environment,
          executable: node,
        },
        `v${BUILD_TOOLCHAIN.nodeVersion}`,
        'Node',
      ),
      assertTool(
        {
          args: ['--version'],
          cwd: checkout.root,
          environment,
          executable: npm,
        },
        BUILD_TOOLCHAIN.npmVersion,
        'npm',
      ),
      assertToolPrefix(
        {
          args: ['--version'],
          cwd: checkout.root,
          environment,
          executable: uv,
        },
        `uv ${BUILD_TOOLCHAIN.uvVersion}`,
        'uv',
      ),
      command({
        args: ['version'],
        cwd: checkout.root,
        environment,
        executable: go,
      }),
    ]);
    const goMatch = new RegExp(
      `^go version ${BUILD_TOOLCHAIN.goVersion.replaceAll('.', '\\.')} linux/(amd64|arm64)$`,
      'u',
    ).exec(goIdentity.stdout.trim());
    if (!goMatch) {
      fail(`Go must be exactly ${BUILD_TOOLCHAIN.goVersion} on an admitted Linux host`);
    }
    const python = await preparePython({ environment, setRoot, uv });
    const backendPromise = command({
      args: ['build/check.sh', '--target-arch', 'amd64'],
      cwd: path.join(checkout.root, 'backend'),
      environment,
      executable: shell,
    });
    const frontendPromise = command({
      args: [
        'build/check.mjs',
        '--target-arch',
        'amd64',
        '--source-revision',
        checkout.revision,
        '--source-tree',
        checkout.tree,
      ],
      cwd: path.join(checkout.root, 'frontend'),
      environment,
      executable: node,
    });
    const [backend, frontend] = await Promise.all([
      backendPromise,
      frontendPromise,
    ]);
    const updaterRoot = path.join(checkout.root, 'updater');
    await command({
      args: ['-m', 'venv', '--copies', '.venv'],
      cwd: updaterRoot,
      environment,
      executable: python,
      timeoutMs: 300_000,
    });
    await command({
      args: [
        'sync',
        '--frozen',
        '--python',
        BUILD_TOOLCHAIN.pythonVersion,
      ],
      cwd: updaterRoot,
      environment,
      executable: uv,
      timeoutMs: 900_000,
    });
    const updaterPython = requireCanonicalPath(
      fs.realpathSync.native(
        path.join(updaterRoot, '.venv', 'bin', 'python'),
      ),
      {
        label: 'Updater virtual environment Python',
        type: 'file',
      },
    );
    const updaterArguments = [
      'build/check.py',
      '--python',
      updaterPython,
      '--uv',
      uv,
      '--docker',
      docker,
      '--contracts-root',
      path.join(checkout.root, 'contracts'),
      '--target',
      'linux/amd64',
      '--source-revision',
      checkout.revision,
      '--source-tree',
      checkout.tree,
    ];
    if (environment.BUILDX_BUILDER) {
      updaterArguments.push('--builder', environment.BUILDX_BUILDER);
    }
    const updater = await command({
      args: updaterArguments,
      cwd: updaterRoot,
      environment,
      executable: updaterPython,
    });
    result = deepFreeze({
      backend: capturedPath(
        backend.stdout,
        /^BACKEND_ARTIFACT_ROOT=(.+)$/gmu,
        'Backend artifact root',
        checkout.root,
      ),
      frontend: capturedPath(
        frontend.stdout,
        /^FRONTEND_ARTIFACT_ROOT=(.+)$/gmu,
        'Frontend artifact root',
        checkout.root,
      ),
      toolchain: {
        ...builderToolchain,
        goHostArchitecture: admittedArchitecture(goMatch[1], 'Go host'),
        goVersion: BUILD_TOOLCHAIN.goVersion.slice(2),
        nodeVersion: BUILD_TOOLCHAIN.nodeVersion,
        npmVersion: BUILD_TOOLCHAIN.npmVersion,
        pythonVersion: BUILD_TOOLCHAIN.pythonVersion,
        uvVersion: BUILD_TOOLCHAIN.uvVersion,
      },
      updater: capturedPath(
        updater.stdout,
        /^updater artifact accepted at (.+)$/gmu,
        'Updater artifact root',
        checkout.root,
      ),
    });
    await checkout.repository.assertCleanCheckout({
      revision: checkout.revision,
      tree: checkout.tree,
    });
  } catch (error) {
    primaryError = error;
  }
  let cleanupError;
  if (builderCreated) {
    try {
      await removeBuilder({ docker, environment, setRoot });
    } catch (error) {
      cleanupError = error;
    }
  }
  if (primaryError && cleanupError) {
    throw new AggregateError(
      [primaryError, cleanupError],
      'component build and owned Buildx cleanup both failed',
    );
  }
  if (primaryError) throw primaryError;
  if (cleanupError) throw cleanupError;
  return result;
}

function executionEvidence() {
  const hostArchitecture =
    process.arch === 'x64' ? 'amd64' : process.arch === 'arm64' ? 'arm64' : null;
  if (process.platform !== 'linux' || hostArchitecture === null) {
    fail('AMD64 candidate build requires a Linux amd64/arm64 host');
  }
  if (hostArchitecture === 'amd64') {
    return deepFreeze({
      emulation: null,
      hostArchitecture,
      mode: 'native-amd64',
    });
  }
  const binfmt = '/proc/sys/fs/binfmt_misc/qemu-x86_64';
  const information = fs.lstatSync(binfmt);
  if (information.isSymbolicLink() || !information.isFile()) {
    fail('arm64 build host lacks an admitted qemu-x86_64 binfmt record');
  }
  const evidence = fs.readFileSync(binfmt);
  const text = evidence.toString('utf8');
  if (!text.startsWith('enabled\n') || !/^flags: .*F/mu.test(text)) {
    fail('qemu-x86_64 binfmt is not enabled with the fix-binary flag');
  }
  return deepFreeze({
    emulation: {
      evidenceDigest: sha256(evidence),
      provider: 'docker-buildx',
      target: 'linux/amd64',
    },
    hostArchitecture,
    mode: 'admitted-qemu-binfmt',
  });
}

async function verifyArchiveSmoke({ candidateRoot, environment, source }) {
  const smoke = requireCanonicalPath(
    path.join(candidateRoot, 'release', 'archive-smoke'),
    {
      below: candidateRoot,
      label: 'standalone archive-smoke',
      type: 'file',
    },
  );
  const result = await command({
    args: ['--build-info'],
    cwd: candidateRoot,
    environment,
    executable: smoke,
    timeoutMs: 60_000,
  });
  const buildInfo = parseCanonicalJson(
    result.stdout,
    'archive-smoke --build-info',
  );
  if (
    Object.keys(buildInfo).length !== 2 ||
    buildInfo.revision !== source.revision ||
    buildInfo.version !== APPLICATION_VERSION
  ) {
    fail('archive-smoke build identity differs from the candidate');
  }
}

export async function doubleBuildReleaseCandidate({
  acceptanceInput,
  candidateKind,
  output,
  releaseTag,
  sourceRef,
}) {
  if (!['tag-release', 'validation'].includes(candidateKind)) {
    throw new TypeError('double build candidate kind is invalid');
  }
  const canonicalAcceptanceInput = requireCanonicalPath(acceptanceInput, {
    label: 'accepted-development input',
    type: 'file',
  });
  const canonicalOutput = requireCanonicalPath(output, {
    label: 'double-build output root',
    type: 'directory',
  });
  const inputReceipt = readAcceptedDevelopment(canonicalAcceptanceInput);
  if (inputReceipt.digest !== ACCEPTED_DEVELOPMENT_SHA256) {
    fail('acceptance input differs from the fixed accepted-development receipt');
  }
  const runTmpRoot = path.join(canonicalOutput, '.build-runs');
  const run = createRunRoot({
    directories: ['controller-environment', 'set-one', 'set-two'],
    purpose: 'amd64-double-build',
    tmpRoot: runTmpRoot,
  });
  const runRoot = run.runRoot;
  let completedSummary;
  let primaryError;
  try {
    const controllerEnvironment = path.join(runRoot, 'controller-environment');
    const git = executableFromPath('git');
    const repository = new GitRepository({
      git,
      repositoryRoot: REPOSITORY_ROOT,
      runRoot: controllerEnvironment,
    });
    const receipt = await verifyAcceptedDevelopmentRepository({
      filePath: canonicalAcceptanceInput,
      git: repository,
    });
    if (receipt.digest !== inputReceipt.digest) {
      fail('acceptance receipt changed during repository verification');
    }
    const suppliedSource = sourceRef ?? FROZEN_PRODUCT.revision;
    const sourceRevision = await repository.resolve(suppliedSource);
    if (
      candidateKind === 'validation' &&
      sourceRevision !== FROZEN_PRODUCT.revision
    ) {
      fail('--source-ref may only restate the frozen product revision');
    }
    const sourceTree = await repository.tree(sourceRevision);
    if (
      candidateKind === 'validation' &&
      sourceTree !== FROZEN_PRODUCT.tree
    ) {
      fail('frozen product tree drifted');
    }
    const controllerRevision = await repository.resolve('HEAD');
    const controllerTree = await repository.tree(controllerRevision);
    if (
      candidateKind === 'tag-release' &&
      (controllerRevision !== sourceRevision || controllerTree !== sourceTree)
    ) {
      fail('tag release controller checkout must equal the exact tag commit');
    }
    const sets = [];
    for (const name of ['one', 'two']) {
      const setRoot = path.join(runRoot, `set-${name}`);
      const checkout = await createDetachedCheckout({
        destination: path.join(setRoot, 'checkout'),
        gitRepository: repository,
        revision: sourceRevision,
      });
      sets.push({ checkout, setRoot });
    }
    const executables = {
      buildxPlugin: dockerBuildxPlugin(),
      docker: executableFromPath('docker'),
      go: executableFromPath('go'),
      node: executableFromPath('node'),
      npm: executableFromPath('npm'),
      shell: executableFromPath('bash'),
      uv: executableFromPath('uv'),
    };
    // The accepted component smokes use fixed, revision-derived local image
    // references. Keep the two checkouts, caches, and Buildx builders
    // independent, but do not let their smokes race in the shared Docker
    // daemon image namespace.
    const first = await buildSet({ ...sets[0], ...executables });
    const second = await buildSet({ ...sets[1], ...executables });
    for (const component of ['backend', 'frontend', 'updater']) {
      compareTrees(
        first[component],
        second[component],
        `independent ${component} builds`,
      );
    }
    if (canonicalJson(first.toolchain) !== canonicalJson(second.toolchain)) {
      fail('independent build sets selected different toolchain identities');
    }
    const execution = executionEvidence();
    if (
      execution.hostArchitecture !== first.toolchain.dockerServerArchitecture ||
      execution.hostArchitecture !== first.toolchain.goHostArchitecture
    ) {
      fail('recorded process, Docker, and Go host architectures disagree');
    }
    const assemblyInput = {
      candidateKind,
      execution,
      outputRoot: canonicalOutput,
      releaseTag,
      source: { revision: sourceRevision, tree: sourceTree },
      sourceController: {
        revision: controllerRevision,
        tree: controllerTree,
      },
      toolchain: first.toolchain,
    };
    const assembled = await assembleReleaseCandidate({
      ...assemblyInput,
      componentRoots: first,
    });
    const independentlyAssembled = await assembleReleaseCandidate({
      ...assemblyInput,
      componentRoots: second,
    });
    if (
      canonicalJson(assembled.completeInventory) !==
        canonicalJson(independentlyAssembled.completeInventory) ||
      assembled.candidateRoot !== independentlyAssembled.candidateRoot
    ) {
      fail('independent candidate assemblies are not byte-identical');
    }
    const smokeEnvironment = path.join(runRoot, 'smoke-environment');
    fs.mkdirSync(smokeEnvironment, { mode: 0o700 });
    const smokeBuilderName =
      `bgmss-operations-${sha256(smokeEnvironment).slice(7, 19)}`;
    await verifyArchiveSmoke({
      candidateRoot: assembled.candidateRoot,
      environment: buildEnvironment(
        smokeEnvironment,
        smokeBuilderName,
        executables.buildxPlugin,
      ),
      source: { revision: sourceRevision, tree: sourceTree },
    });
    completedSummary = deepFreeze({
      candidateRoot: assembled.candidateRoot,
      completeInventory: assembled.completeInventoryPath,
      contentAddress: assembled.completeInventory.contentAddress,
    });
  } catch (error) {
    primaryError = error;
  }
  let cleanupError;
  if (fs.existsSync(runRoot)) {
    try {
      cleanupOwnedRunRoot(runRoot, {
        expectedPurpose: 'amd64-double-build',
        tmpRoot: runTmpRoot,
      });
    } catch (error) {
      cleanupError = error;
    }
  }
  if (primaryError && cleanupError) {
    throw new AggregateError(
      [primaryError, cleanupError],
      'AMD64 build and owned cleanup both failed',
    );
  }
  if (primaryError) throw primaryError;
  if (cleanupError) throw cleanupError;
  return completedSummary;
}

async function main(argv) {
  const options = parseOptions(argv, {
    allowed: ['--acceptance-input', '--output', '--source-ref'],
    required: ['--acceptance-input', '--output'],
  });
  const result = await doubleBuildReleaseCandidate({
    acceptanceInput: optionPath(options, '--acceptance-input', {
      type: 'file',
    }),
    candidateKind: 'validation',
    output: optionPath(options, '--output', { type: 'directory' }),
    sourceRef: options.get('--source-ref'),
  });
  process.stdout.write(canonicalJson(result));
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(import.meta.filename)
) {
  runCli(main);
}
