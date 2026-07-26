import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { copyCacheTree } from './cache.mjs';
import { requireInputCacheAttestation } from './cache-input.mjs';
import { commandEvidence } from './evidence.mjs';
import {
  assertNoSymlinkAncestors,
  isStrictlyBelow,
  requireCanonicalPath,
} from './paths.mjs';
import { runCommand, sanitizedEnvironment } from './runner.mjs';
import {
  assertSameSeal,
  sealDirectoryTree,
  sealDistributionTree,
  sealSingleFileDistribution,
  sha256File,
} from './seal.mjs';

export class ToolAdmissionError extends Error {}
const privateToolAttestations = new WeakMap();

function fail(message) {
  throw new ToolAdmissionError(message);
}

const VERSION_ARGUMENTS = Object.freeze({
  git: ['--version'],
  node: ['--version'],
  go: ['version'],
  uv: ['--version'],
  python: ['--version'],
  docker: ['--version'],
  tar: ['--version'],
  queryNode: ['--version'],
  queryGo: ['version'],
});

function normalizedVersion(stdout, stderr) {
  return `${stdout}\n${stderr}`
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)[0];
}

function npmPackageRoot(cliPath, label) {
  const root = requireCanonicalPath(path.dirname(path.dirname(cliPath)), {
    label,
    type: 'directory',
  });
  if (
    path.basename(root) !== 'npm' ||
    requireCanonicalPath(path.join(root, 'bin', 'npm-cli.js'), {
      label: `${label} CLI`,
      type: 'file',
    }) !== cliPath
  ) {
    fail(`${label} does not contain the admitted npm CLI`);
  }
  return root;
}

function pythonDistributionRoot(executable) {
  const root = requireCanonicalPath(path.dirname(path.dirname(executable)), {
    label: 'CPython distribution root',
    type: 'directory',
  });
  if (!isStrictlyBelow(executable, root)) {
    fail('Python executable is not inside its distribution root');
  }
  return root;
}

function binaryDistributionRoot(executable, label) {
  const root = requireCanonicalPath(path.dirname(path.dirname(executable)), {
    label,
    type: 'directory',
  });
  if (!isStrictlyBelow(executable, root)) {
    fail(`${label} does not contain its admitted executable`);
  }
  return root;
}

function closure(root, seal, {
  shape = 'directory',
  sealKind = 'directoryTree',
  sealOptions = Object.freeze({}),
  classification,
  copied = false,
  hermetic = false,
}) {
  return Object.freeze({
    root,
    seal,
    shape,
    sealKind,
    sealOptions,
    classification,
    copied,
    hermetic,
  });
}

function closureIdentity(declaration) {
  return Object.freeze({
    shape: declaration.shape,
    classification: declaration.classification,
    rootDigest: declaration.seal.digest,
    identityDigest: declaration.seal.identityDigest,
    copied: declaration.copied,
    hermetic: declaration.hermetic,
  });
}

async function sealRuntimeClosure(declaration) {
  if (declaration.sealKind === 'directoryTree') {
    return sealDirectoryTree(declaration.root);
  }
  if (declaration.sealKind === 'distributionTree') {
    return sealDistributionTree(declaration.root, declaration.sealOptions);
  }
  if (declaration.sealKind === 'singleFile') {
    return sealSingleFileDistribution(declaration.root);
  }
  fail(`unknown runtime closure seal kind ${declaration.sealKind}`);
}

function closureSpecification(root, {
  shape = 'directory',
  sealKind = 'directoryTree',
  sealOptions = Object.freeze({}),
  classification,
  copied = false,
  hermetic = false,
} = {}) {
  return Object.freeze({
    root,
    shape,
    sealKind,
    sealOptions,
    classification,
    copied,
    hermetic,
  });
}

function runtimeClosureIdentities(runtimeRoots) {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(runtimeRoots).map(([name, declaration]) => [
        name,
        closureIdentity(declaration),
      ]),
    ),
  );
}

export async function attestRuntimeClosureSpecifications(specifications) {
  const runtimeRoots = {};
  for (const [name, specification] of Object.entries(specifications)) {
    runtimeRoots[name] = closure(
      specification.root,
      await sealRuntimeClosure(specification),
      specification,
    );
  }
  const frozenRoots = Object.freeze(runtimeRoots);
  return Object.freeze({
    runtimeClosures: runtimeClosureIdentities(frozenRoots),
    runtimeRoots: frozenRoots,
  });
}

export async function attestInputRuntimeClosures(input) {
  const toolPath = (name) =>
    requireCanonicalPath(input.tools[name].path, {
      label: `${name} runtime executable`,
      type: 'file',
    });
  const currentNode = toolPath('node');
  const currentNpm = toolPath('npm');
  const currentGo = toolPath('go');
  const python = toolPath('python');
  const uv = toolPath('uv');
  const docker = toolPath('docker');
  const queryNode = toolPath('queryNode');
  const queryNpm = toolPath('queryNpm');
  const queryGo = toolPath('queryGo');
  const queryGofmt = toolPath('queryGofmt');
  const currentNodeRoot = binaryDistributionRoot(
    currentNode,
    'current Node distribution root',
  );
  const queryNodeRoot = binaryDistributionRoot(
    queryNode,
    'historical Query Node distribution root',
  );
  const currentNpmRoot = npmPackageRoot(
    currentNpm,
    'current npm package root',
  );
  const queryNpmRoot = npmPackageRoot(
    queryNpm,
    'historical Query npm package root',
  );
  const currentGoRoot = binaryDistributionRoot(
    currentGo,
    'current Go distribution root',
  );
  const historicalGoRoot = binaryDistributionRoot(
    queryGo,
    'historical Query Go GOROOT',
  );
  const exactHistoricalGoRoot =
    '/opt/homebrew/Cellar/go/1.25.4/libexec';
  if (
    historicalGoRoot !== exactHistoricalGoRoot ||
    queryGo !== path.join(exactHistoricalGoRoot, 'bin', 'go') ||
    queryGofmt !== path.join(exactHistoricalGoRoot, 'bin', 'gofmt')
  ) {
    fail('historical Query Go tools are not inside the exact owner-fixed GOROOT');
  }
  const pythonRoot = pythonDistributionRoot(python);
  const browserRoot = requireCanonicalPath(input.caches.browser, {
    label: 'browser distribution source',
    type: 'directory',
  });
  const browserExecutable = requireCanonicalPath(
    input.browser.executablePath,
    {
      label: 'browser distribution executable',
      type: 'file',
    },
  );
  if (!isStrictlyBelow(browserExecutable, browserRoot)) {
    fail('browser executable is not inside the admitted browser cache');
  }
  const specifications = Object.freeze({
    currentNodeSource: closureSpecification(currentNodeRoot, {
      sealKind: 'distributionTree',
      sealOptions: Object.freeze({ allowInternalSymlinks: true }),
      classification: 'read-only-source',
    }),
    queryNode: closureSpecification(queryNodeRoot, {
      sealKind: 'distributionTree',
      sealOptions: Object.freeze({ allowInternalSymlinks: true }),
      classification: 'owner-fixed-in-place',
    }),
    currentNpmSource: closureSpecification(currentNpmRoot, {
      classification: 'read-only-source',
    }),
    queryNpm: closureSpecification(queryNpmRoot, {
      classification: 'owner-fixed-in-place',
    }),
    currentGoSource: closureSpecification(currentGoRoot, {
      sealKind: 'distributionTree',
      classification: 'read-only-source',
    }),
    historicalGo: closureSpecification(historicalGoRoot, {
      classification: 'owner-fixed-in-place',
    }),
    pythonSource: closureSpecification(pythonRoot, {
      sealKind: 'distributionTree',
      sealOptions: Object.freeze({ allowInternalSymlinks: true }),
      classification: 'read-only-source',
    }),
    uvSource: closureSpecification(uv, {
      shape: 'single-file',
      sealKind: 'singleFile',
      classification: 'read-only-source',
    }),
    dockerSource: closureSpecification(docker, {
      shape: 'single-file',
      sealKind: 'singleFile',
      classification: 'read-only-source',
    }),
    browserSource: closureSpecification(browserRoot, {
      classification: 'read-only-source',
    }),
  });
  return attestRuntimeClosureSpecifications(specifications);
}

function assertNewInodeClosure(sourceSeal, copiedSeal, label) {
  if (
    sourceSeal.digest !== copiedSeal.digest ||
    sourceSeal.canonical !== copiedSeal.canonical
  ) {
    fail(`${label} copy differs from its admitted source bytes`);
  }
  const sourceIdentities = new Set(
    sourceSeal.identities.map(
      (identity) => `${identity.device}:${identity.inode}`,
    ),
  );
  if (
    copiedSeal.identities.some((identity) =>
      sourceIdentities.has(`${identity.device}:${identity.inode}`))
  ) {
    fail(`${label} copy shares an inode with its admitted source`);
  }
}

export async function copyRuntimeDistribution({
  sourceRoot,
  destinationRoot,
  allowInternalSymlinks = false,
}) {
  const source = requireCanonicalPath(sourceRoot, {
    label: 'runtime distribution source',
    type: 'directory',
  });
  if (fs.existsSync(destinationRoot)) {
    fail(`runtime distribution destination already exists: ${destinationRoot}`);
  }
  const sourceSeal = await sealDistributionTree(source, {
    allowInternalSymlinks,
  });
  fs.mkdirSync(path.dirname(destinationRoot), {
    recursive: true,
    mode: 0o700,
  });
  function copyDirectory(sourceDirectory, destinationDirectory) {
    const directoryInformation = fs.lstatSync(sourceDirectory);
    fs.mkdirSync(destinationDirectory, { mode: 0o700 });
    for (const entry of fs
      .readdirSync(sourceDirectory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
      const sourcePath = path.join(sourceDirectory, entry.name);
      const destinationPath = path.join(destinationDirectory, entry.name);
      const information = fs.lstatSync(sourcePath);
      if (information.isDirectory()) {
        copyDirectory(sourcePath, destinationPath);
      } else if (information.isFile()) {
        fs.copyFileSync(
          sourcePath,
          destinationPath,
          fs.constants.COPYFILE_EXCL,
        );
        fs.chmodSync(destinationPath, information.mode & 0o777);
      } else if (information.isSymbolicLink() && allowInternalSymlinks) {
        fs.symlinkSync(fs.readlinkSync(sourcePath), destinationPath);
      } else {
        fail(`runtime distribution changed while copying ${sourcePath}`);
      }
    }
    fs.chmodSync(destinationDirectory, directoryInformation.mode & 0o777);
  }
  copyDirectory(source, destinationRoot);
  const copiedRoot = requireCanonicalPath(destinationRoot, {
    label: 'copied runtime distribution',
    type: 'directory',
  });
  const copiedSeal = await sealDistributionTree(copiedRoot, {
    allowInternalSymlinks,
  });
  assertNewInodeClosure(sourceSeal, copiedSeal, 'runtime distribution');
  assertSameSeal(
    sourceSeal,
    await sealDistributionTree(source, { allowInternalSymlinks }),
    'runtime distribution source',
  );
  return Object.freeze({ sourceSeal, copiedSeal, root: copiedRoot });
}

export async function copySingleFileRuntime({
  sourcePath,
  destinationPath,
}) {
  const source = requireCanonicalPath(sourcePath, {
    label: 'single-file runtime source',
    type: 'file',
  });
  if (fs.existsSync(destinationPath)) {
    fail(`single-file runtime destination already exists: ${destinationPath}`);
  }
  const sourceSeal = await sealSingleFileDistribution(source);
  fs.mkdirSync(path.dirname(destinationPath), {
    recursive: true,
    mode: 0o700,
  });
  fs.copyFileSync(source, destinationPath, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(destinationPath, fs.lstatSync(source).mode & 0o777);
  const copied = requireCanonicalPath(destinationPath, {
    label: 'copied single-file runtime',
    type: 'file',
  });
  const copiedSeal = await sealSingleFileDistribution(copied);
  assertNewInodeClosure(sourceSeal, copiedSeal, 'single-file runtime');
  assertSameSeal(
    sourceSeal,
    await sealSingleFileDistribution(source),
    'single-file runtime source',
  );
  return Object.freeze({ sourceSeal, copiedSeal, path: copied });
}

export async function copyBrowserDistribution({
  sourceRoot,
  sourceExecutable,
  destinationRoot,
  expectedExecutableDigest,
}) {
  const root = requireCanonicalPath(sourceRoot, {
    label: 'browser distribution source',
    type: 'directory',
  });
  const executable = requireCanonicalPath(sourceExecutable, {
    label: 'browser distribution executable',
    type: 'file',
  });
  if (!isStrictlyBelow(executable, root)) {
    fail('browser executable is not inside the admitted browser cache');
  }
  const relativeExecutable = path.relative(root, executable);
  const sourceSeal = await sealDirectoryTree(root);
  copyCacheTree(root, destinationRoot);
  const copiedRoot = requireCanonicalPath(destinationRoot, {
    label: 'copied browser distribution',
    type: 'directory',
  });
  const copiedSeal = await sealDirectoryTree(copiedRoot);
  if (
    sourceSeal.digest !== copiedSeal.digest ||
    sourceSeal.canonical !== copiedSeal.canonical ||
    sourceSeal.identityDigest === copiedSeal.identityDigest
  ) {
    fail('browser distribution copy is not an exact new-inode tree');
  }
  const copiedExecutable = requireCanonicalPath(
    path.join(copiedRoot, relativeExecutable),
    {
      label: 'copied browser executable',
      type: 'file',
    },
  );
  const copiedInformation = fs.lstatSync(copiedExecutable);
  if (
    copiedInformation.nlink !== 1 ||
    (copiedInformation.mode & 0o111) === 0 ||
    (await sha256File(copiedExecutable)) !== expectedExecutableDigest
  ) {
    fail('copied browser executable identity is invalid');
  }
  const sourceAfter = await sealDirectoryTree(root);
  assertSameSeal(sourceSeal, sourceAfter, 'browser distribution source');
  return Object.freeze({
    root: copiedRoot,
    executablePath: copiedExecutable,
    executableDigest: expectedExecutableDigest,
    sourceSeal,
    copiedSeal,
  });
}

export async function attestTools({
  input,
  runRoot,
  budgets,
  cacheAttestation,
}) {
  requireInputCacheAttestation(cacheAttestation, input);
  const tools = {};
  const identities = {};
  const evidence = [];
  const pathEntries = new Set(['/usr/bin', '/bin']);
  for (const [name, declaration] of Object.entries(input.tools)) {
    const executable = requireCanonicalPath(declaration.path, {
      label: `${name} executable`,
      type: 'file',
    });
    if ((fs.statSync(executable).mode & 0o111) === 0) {
      fail(`${name} executable is not executable`);
    }
    const digest = await sha256File(executable);
    if (digest !== declaration.sha256) {
      fail(`${name} executable digest differs from the admitted identity`);
    }
    tools[name] = Object.freeze({ ...declaration, path: executable });
    pathEntries.add(path.dirname(executable));
  }
  const environment = sanitizedEnvironment({
    runRoot,
    pathEntries: [...pathEntries],
  });
  for (const name of Object.keys(VERSION_ARGUMENTS)) {
    const result = await runCommand({
      id: `tool-${name}`,
      executable: tools[name].path,
      args: VERSION_ARGUMENTS[name],
      cwd: runRoot,
      environment,
      timeoutMs: 30_000,
      gracefulStopMs: budgets.timeouts.gracefulStopMs,
      runRoot,
    });
    const stdout = fs.readFileSync(path.join(runRoot, result.stdout.path), 'utf8');
    const stderr = fs.readFileSync(path.join(runRoot, result.stderr.path), 'utf8');
    const version = normalizedVersion(stdout, stderr);
    if (version !== input.tools[name].version) {
      fail(`${name} version mismatch: expected ${input.tools[name].version}, received ${version}`);
    }
    identities[name] = version;
    evidence.push(...commandEvidence(result));
  }
  for (const [name, nodeName] of [
    ['npm', 'node'],
    ['queryNpm', 'queryNode'],
  ]) {
    const result = await runCommand({
      id: `tool-${name}`,
      executable: tools[nodeName].path,
      args: [tools[name].path, '--version'],
      cwd: runRoot,
      environment,
      timeoutMs: 30_000,
      gracefulStopMs: budgets.timeouts.gracefulStopMs,
      runRoot,
    });
    const stdout = fs.readFileSync(path.join(runRoot, result.stdout.path), 'utf8');
    const stderr = fs.readFileSync(path.join(runRoot, result.stderr.path), 'utf8');
    const version = normalizedVersion(stdout, stderr);
    if (version !== input.tools[name].version) {
      fail(`${name} version mismatch: expected ${input.tools[name].version}, received ${version}`);
    }
    identities[name] = version;
    evidence.push(...commandEvidence(result));
  }
  identities.queryGofmt = input.tools.queryGofmt.version;
  if (
    identities.node !== 'v24.18.0' ||
    identities.npm !== '11.16.0' ||
    !identities.go.includes('go1.26.5') ||
    !identities.uv.startsWith('uv 0.11.32') ||
    identities.python !== 'Python 3.14.6' ||
    identities.queryNode !== 'v24.16.0' ||
    identities.queryNpm !== '11.13.0' ||
    !identities.queryGo.includes('go1.25.4') ||
    identities.queryGofmt !== 'go1.25.4'
  ) {
    fail('accepted current or historical toolchain versions are not present');
  }
  const dockerSocket = input.tools.docker.endpoint.slice('unix://'.length);
  assertNoSymlinkAncestors(dockerSocket, 'Docker endpoint');
  const socketInformation = fs.lstatSync(dockerSocket);
  if (
    !socketInformation.isSocket() ||
    fs.realpathSync.native(dockerSocket) !== dockerSocket
  ) {
    fail('Docker endpoint is not one canonical Unix socket');
  }
  const browserSourceExecutable = requireCanonicalPath(input.browser.executablePath, {
    label: 'browser executable',
    type: 'file',
  });
  if ((fs.statSync(browserSourceExecutable).mode & 0o111) === 0) {
    fail('browser executable is not executable');
  }
  const browserDigest = await sha256File(browserSourceExecutable);
  if (browserDigest !== input.browser.executableDigest) {
    fail('browser executable digest differs from admitted identity');
  }
  const inputRuntimeClosureAttestation =
    await attestInputRuntimeClosures(input);
  const inputRuntimeRoots =
    inputRuntimeClosureAttestation.runtimeRoots;
  const historicalGoRoot = inputRuntimeRoots.historicalGo.root;
  const historicalGoSeal = inputRuntimeRoots.historicalGo.seal;
  const sourceTools = Object.freeze({ ...tools });
  const currentNodeRoot = inputRuntimeRoots.currentNodeSource.root;
  const currentNpmRoot = inputRuntimeRoots.currentNpmSource.root;
  const currentGoRoot = inputRuntimeRoots.currentGoSource.root;
  const pythonRoot = inputRuntimeRoots.pythonSource.root;
  const runtimeCopyRoot = path.join(runRoot, 'runtime', 'tools');
  const currentNodeCopy = await copyRuntimeDistribution({
    sourceRoot: currentNodeRoot,
    destinationRoot: path.join(runtimeCopyRoot, 'current-node'),
    allowInternalSymlinks: true,
  });
  const currentGoCopy = await copyRuntimeDistribution({
    sourceRoot: currentGoRoot,
    destinationRoot: path.join(runtimeCopyRoot, 'current-go'),
  });
  const pythonCopy = await copyRuntimeDistribution({
    sourceRoot: pythonRoot,
    destinationRoot: path.join(runtimeCopyRoot, 'python'),
    allowInternalSymlinks: true,
  });
  const uvCopy = await copySingleFileRuntime({
    sourcePath: sourceTools.uv.path,
    destinationPath: path.join(runtimeCopyRoot, 'uv', 'uv'),
  });
  const dockerCopy = await copySingleFileRuntime({
    sourcePath: sourceTools.docker.path,
    destinationPath: path.join(runtimeCopyRoot, 'docker', 'docker'),
  });
  for (const [label, admitted, copied] of [
    [
      'current Node source',
      inputRuntimeRoots.currentNodeSource.seal,
      currentNodeCopy.sourceSeal,
    ],
    [
      'current Go source',
      inputRuntimeRoots.currentGoSource.seal,
      currentGoCopy.sourceSeal,
    ],
    [
      'CPython source',
      inputRuntimeRoots.pythonSource.seal,
      pythonCopy.sourceSeal,
    ],
    ['uv source', inputRuntimeRoots.uvSource.seal, uvCopy.sourceSeal],
    [
      'Docker source',
      inputRuntimeRoots.dockerSource.seal,
      dockerCopy.sourceSeal,
    ],
  ]) {
    assertSameSeal(admitted, copied, label);
  }
  const copiedExecutable = (sourceRoot, copiedRoot, sourceExecutable, label) =>
    requireCanonicalPath(
      path.join(copiedRoot, path.relative(sourceRoot, sourceExecutable)),
      { label, type: 'file', below: copiedRoot },
    );
  tools.node = Object.freeze({
    ...sourceTools.node,
    path: copiedExecutable(
      currentNodeRoot,
      currentNodeCopy.root,
      sourceTools.node.path,
      'copied current Node executable',
    ),
  });
  tools.npm = Object.freeze({
    ...sourceTools.npm,
    path: copiedExecutable(
      currentNodeRoot,
      currentNodeCopy.root,
      sourceTools.npm.path,
      'copied current npm CLI',
    ),
  });
  tools.go = Object.freeze({
    ...sourceTools.go,
    path: copiedExecutable(
      currentGoRoot,
      currentGoCopy.root,
      sourceTools.go.path,
      'copied current Go executable',
    ),
  });
  tools.python = Object.freeze({
    ...sourceTools.python,
    path: copiedExecutable(
      pythonRoot,
      pythonCopy.root,
      sourceTools.python.path,
      'copied CPython executable',
    ),
  });
  tools.uv = Object.freeze({ ...sourceTools.uv, path: uvCopy.path });
  tools.docker = Object.freeze({
    ...sourceTools.docker,
    path: dockerCopy.path,
  });
  const currentNpmCopyRoot = npmPackageRoot(
    tools.npm.path,
    'copied current npm package root',
  );
  const currentNpmSourceSeal = await sealDirectoryTree(currentNpmRoot);
  assertSameSeal(
    inputRuntimeRoots.currentNpmSource.seal,
    currentNpmSourceSeal,
    'current npm source',
  );
  const currentNpmCopySeal = await sealDirectoryTree(currentNpmCopyRoot);
  assertNewInodeClosure(
    currentNpmSourceSeal,
    currentNpmCopySeal,
    'current npm package',
  );
  const runtimeRootsDraft = {
    currentNodeSource: inputRuntimeRoots.currentNodeSource,
    currentNode: closure(
      currentNodeCopy.root,
      currentNodeCopy.copiedSeal,
      {
        sealKind: 'distributionTree',
        sealOptions: Object.freeze({ allowInternalSymlinks: true }),
        classification: 'run-owned-copy',
        copied: true,
        hermetic: true,
      },
    ),
    queryNode: inputRuntimeRoots.queryNode,
    currentNpmSource: inputRuntimeRoots.currentNpmSource,
    currentNpm: closure(
      currentNpmCopyRoot,
      currentNpmCopySeal,
      {
        classification: 'run-owned-copy',
        copied: true,
        hermetic: true,
      },
    ),
    queryNpm: inputRuntimeRoots.queryNpm,
    currentGoSource: inputRuntimeRoots.currentGoSource,
    currentGo: closure(
      currentGoCopy.root,
      currentGoCopy.copiedSeal,
      {
        sealKind: 'distributionTree',
        classification: 'run-owned-copy',
        copied: true,
        hermetic: true,
      },
    ),
    historicalGo: inputRuntimeRoots.historicalGo,
    pythonSource: inputRuntimeRoots.pythonSource,
    python: closure(
      pythonCopy.root,
      pythonCopy.copiedSeal,
      {
        sealKind: 'distributionTree',
        sealOptions: Object.freeze({ allowInternalSymlinks: true }),
        classification: 'run-owned-copy',
        copied: true,
        hermetic: true,
      },
    ),
    uvSource: inputRuntimeRoots.uvSource,
    uv: closure(
      uvCopy.path,
      uvCopy.copiedSeal,
      {
        shape: 'single-file',
        sealKind: 'singleFile',
        classification: 'run-owned-copy',
        copied: true,
        hermetic: true,
      },
    ),
    dockerSource: inputRuntimeRoots.dockerSource,
    docker: closure(
      dockerCopy.path,
      dockerCopy.copiedSeal,
      {
        shape: 'single-file',
        sealKind: 'singleFile',
        classification: 'run-owned-copy',
        copied: true,
        hermetic: true,
      },
    ),
  };
  const cacheRoots = {};
  for (const [name, candidate] of Object.entries(input.caches)) {
    if (name === 'digest') continue;
    cacheRoots[name] = requireCanonicalPath(candidate, {
      label: `${name} cache`,
      type: name === 'manifest' ? 'file' : 'directory',
    });
  }
  const copiedBrowser = await copyBrowserDistribution({
    sourceRoot: cacheRoots.browser,
    sourceExecutable: browserSourceExecutable,
    destinationRoot: path.join(runRoot, 'runtime', 'browser'),
    expectedExecutableDigest: browserDigest,
  });
  runtimeRootsDraft.browserSource = inputRuntimeRoots.browserSource;
  runtimeRootsDraft.browserCopy = closure(
    copiedBrowser.root,
    copiedBrowser.copiedSeal,
    {
      classification: 'run-owned-copy',
      copied: true,
      hermetic: true,
    },
  );
  assertSameSeal(
    inputRuntimeRoots.browserSource.seal,
    copiedBrowser.sourceSeal,
    'browser distribution source',
  );
  const runtimeRoots = Object.freeze(runtimeRootsDraft);
  const runtimeClosures = runtimeClosureIdentities(runtimeRoots);
  const machine = Object.freeze({
    profileId: 'darwin-arm64-development-v1',
    os: process.platform,
    architecture: process.arch,
    release: os.release(),
    logicalCpuCount: os.cpus().length,
    memoryBytes: os.totalmem(),
    dockerVersion: identities.docker,
  });
  if (machine.os !== 'darwin' || machine.architecture !== 'arm64') {
    fail('host does not match the reviewed darwin/arm64 development profile');
  }
  const identityRecords = Object.freeze(
    Object.fromEntries(
      Object.keys(identities).map((name) => [
        name,
        Object.freeze({
          version: identities[name],
          sha256: tools[name].sha256,
        }),
      ]),
    ),
  );
  const attestation = Object.freeze({
    tools: Object.freeze(tools),
    identities: identityRecords,
    cacheRoots: Object.freeze(cacheRoots),
    browser: Object.freeze({
      name: input.browser.name,
      version: input.browser.version,
      sourceExecutablePath: browserSourceExecutable,
      executablePath: copiedBrowser.executablePath,
      executableDigest: browserDigest,
      sourceRoot: cacheRoots.browser,
      root: copiedBrowser.root,
      rootDigest: copiedBrowser.copiedSeal.digest,
    }),
    runtimeRoots,
    runtimeClosures,
    historicalGoRoot,
    historicalGoSeal,
    machine,
    evidence: Object.freeze(evidence),
  });
  privateToolAttestations.set(attestation, Object.freeze({
    browser: Object.freeze({
      sourcePath: browserSourceExecutable,
      sourceRoot: cacheRoots.browser,
      sourceSeal: copiedBrowser.sourceSeal,
      copiedPath: copiedBrowser.executablePath,
      copiedRoot: copiedBrowser.root,
      copiedSeal: copiedBrowser.copiedSeal,
      sha256: browserDigest,
    }),
    dockerSocket: Object.freeze({
      path: dockerSocket,
      device: socketInformation.dev,
      inode: socketInformation.ino,
      mode: socketInformation.mode,
    }),
    historicalGoRoot,
    historicalGoSeal,
    runtimeRoots,
    tools: Object.freeze(
      Object.fromEntries(
        Object.entries(tools).map(([name, declaration]) => [
          name,
          Object.freeze({
            path: declaration.path,
            sha256: declaration.sha256,
          }),
        ]),
      ),
    ),
  }));
  return attestation;
}

export async function verifyToolSeal(attestation) {
  const sealed = privateToolAttestations.get(attestation);
  if (!sealed) fail('tool attestation was not issued by this module');
  for (const [name, declaration] of Object.entries(sealed.tools)) {
    const canonical = requireCanonicalPath(declaration.path, {
      label: `${name} resealed executable`,
      type: 'file',
    });
    if (
      canonical !== declaration.path ||
      (await sha256File(canonical)) !== declaration.sha256
    ) {
      fail(`${name} executable changed during acceptance`);
    }
  }
  if (
    (await sha256File(sealed.browser.sourcePath)) !== sealed.browser.sha256 ||
    (await sha256File(sealed.browser.copiedPath)) !== sealed.browser.sha256
  ) {
    fail('browser executable changed during acceptance');
  }
  await verifyRuntimeClosures(attestation);
  const socket = fs.lstatSync(sealed.dockerSocket.path);
  if (
    !socket.isSocket() ||
    socket.dev !== sealed.dockerSocket.device ||
    socket.ino !== sealed.dockerSocket.inode ||
    socket.mode !== sealed.dockerSocket.mode
  ) {
    fail('Docker endpoint identity changed during acceptance');
  }
  return attestation;
}

export async function verifyRuntimeClosures(attestation, names) {
  const sealed = privateToolAttestations.get(attestation);
  if (!sealed) fail('tool attestation was not issued by this module');
  const selected = names === undefined
    ? Object.keys(sealed.runtimeRoots)
    : names;
  if (!Array.isArray(selected) || selected.length === 0) {
    fail('runtime closure reseal requires at least one named closure');
  }
  if (new Set(selected).size !== selected.length) {
    fail('runtime closure reseal names must be unique');
  }
  for (const name of selected) {
    const declaration = sealed.runtimeRoots[name];
    if (!declaration) fail(`unknown runtime closure ${name}`);
    const current = await sealRuntimeClosure(declaration);
    assertSameSeal(
      declaration.seal,
      current,
      `${name} runtime root`,
    );
  }
  return attestation;
}
