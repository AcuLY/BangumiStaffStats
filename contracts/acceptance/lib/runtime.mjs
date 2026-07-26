import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

import {
  currentAbortSignal,
  throwIfAborted,
} from './abort-context.mjs';
import { ACCEPTANCE_ROOT } from './constants.mjs';
import { canonicalJsonDigest } from './canonical-json.mjs';
import {
  assertAbsolutePathSyntax,
  assertNoSymlinkAncestors,
  requireCanonicalPath,
} from './paths.mjs';
import { CommandError, runCommand, sanitizedEnvironment } from './runner.mjs';
import { decodeUtf8Strict, parseJsonStrict, readJsonStrict } from './strict-json.mjs';

export class RuntimeAcceptanceError extends Error {}

function fail(message) {
  throw new RuntimeAcceptanceError(message);
}

export function sampledMemoryHighWater(samples) {
  if (
    !Array.isArray(samples) ||
    samples.length === 0 ||
    samples.some((value) => !Number.isSafeInteger(value) || value < 0)
  ) {
    fail('Backend memory samples are absent or outside the closed integer range');
  }
  return Math.max(...samples);
}

export function normalizeBackendMemoryPolicy({
  currentMemoryBytes,
  memoryHardLimitBytes,
  memorySampleCount,
  memorySwapHardLimitBytes,
  oomKilled,
  sampledHighWaterMemoryBytes,
}) {
  for (const [label, value] of [
    ['Backend current memory bytes', currentMemoryBytes],
    ['Backend observed high-water memory bytes', sampledHighWaterMemoryBytes],
    ['Backend memory sample count', memorySampleCount],
  ]) {
    if (!Number.isSafeInteger(value) || value < 0) {
      fail(`${label} is absent or outside the closed integer range`);
    }
  }
  if (memorySampleCount < 1) fail('Backend memory sample count is zero');
  if (
    memoryHardLimitBytes !== 1_073_741_824 ||
    memorySwapHardLimitBytes !== 1_073_741_824 ||
    oomKilled !== false
  ) {
    fail('Backend hard memory cap or OOM state differs from the accepted policy');
  }
  if (
    currentMemoryBytes > memoryHardLimitBytes ||
    sampledHighWaterMemoryBytes > memoryHardLimitBytes
  ) {
    fail('Backend observed memory exceeds its enforced hard cap');
  }
  return Object.freeze({
    currentMemoryBytes,
    memoryHardLimitBytes,
    memorySampleCount,
    memorySwapHardLimitBytes,
    oomKilled,
    sampledHighWaterMemoryBytes,
  });
}

function sortedStrings(value) {
  if (!Array.isArray(value)) return Object.freeze([]);
  return Object.freeze(
    value
      .filter((entry) => typeof entry === 'string')
      .sort((left, right) => left.localeCompare(right, 'en')),
  );
}

function requiredArray(value, label) {
  if (!Array.isArray(value)) fail(`${label} Docker inventory is not an array`);
  return value;
}

export function normalizeDockerResourceInventory({
  containers,
  images,
  networks,
  volumes,
}) {
  const normalized = {
    containers: requiredArray(containers, 'container')
      .map((container) => ({
        id: String(container.Id ?? ''),
        imageId: String(container.ImageID ?? ''),
        names: sortedStrings(container.Names),
        mounts: requiredArray(container.Mounts ?? [], 'container mount')
          .map((mount) => ({
            destination: String(mount.Destination ?? ''),
            name: String(mount.Name ?? ''),
            propagation: String(mount.Propagation ?? ''),
            readWrite: mount.RW === true,
            source: String(mount.Source ?? ''),
            type: String(mount.Type ?? ''),
          }))
          .sort((left, right) =>
            `${left.destination}\0${left.source}`.localeCompare(
              `${right.destination}\0${right.source}`,
              'en',
            ),
          ),
      }))
      .sort((left, right) => left.id.localeCompare(right.id, 'en')),
    images: requiredArray(images, 'image')
      .map((image) => ({
        id: String(image.Id ?? ''),
        repoDigests: sortedStrings(image.RepoDigests),
        repoTags: sortedStrings(image.RepoTags),
      }))
      .sort((left, right) => left.id.localeCompare(right.id, 'en')),
    networks: requiredArray(networks, 'network')
      .map((network) => ({
        attachable: network.Attachable === true,
        driver: String(network.Driver ?? ''),
        id: String(network.Id ?? ''),
        ingress: network.Ingress === true,
        internal: network.Internal === true,
        name: String(network.Name ?? ''),
        scope: String(network.Scope ?? ''),
      }))
      .sort((left, right) =>
        `${left.name}\0${left.id}`.localeCompare(
          `${right.name}\0${right.id}`,
          'en',
        ),
      ),
    volumes: requiredArray(volumes, 'volume')
      .map((volume) => ({
        driver: String(volume.Driver ?? ''),
        mountpoint: String(volume.Mountpoint ?? ''),
        name: String(volume.Name ?? ''),
        scope: String(volume.Scope ?? ''),
      }))
      .sort((left, right) => left.name.localeCompare(right.name, 'en')),
  };
  return Object.freeze({
    ...normalized,
    digest: canonicalJsonDigest(normalized),
  });
}

export function ownedRuntimeResidue(inventory, { names, images }) {
  const reservedContainers = new Set([
    names.relay,
    names.backend,
    names.updaterDoctor,
    names.updaterContract,
  ]);
  const containers = inventory.containers.filter((container) =>
    container.names.some((name) =>
      reservedContainers.has(name.startsWith('/') ? name.slice(1) : name),
    ),
  );
  const imageReferences = new Set([images.backend, images.updater]);
  const matchingImages = inventory.images.filter((image) =>
    image.repoTags.some((reference) => imageReferences.has(reference)),
  );
  const networks = inventory.networks.filter(
    (network) => network.name === names.network,
  );
  return Object.freeze({
    containers: containers.length,
    images: matchingImages.length,
    networks: networks.length,
    mounts: containers.reduce(
      (total, container) => total + container.mounts.length,
      0,
    ),
    containerIds: Object.freeze(containers.map((container) => container.id)),
    imageIds: Object.freeze(matchingImages.map((image) => image.id)),
    networkIds: Object.freeze(networks.map((network) => network.id)),
  });
}

export function assertDockerInventoryUnchanged(before, after) {
  if (
    typeof before?.digest !== 'string' ||
    typeof after?.digest !== 'string'
  ) {
    fail('Docker resource inventory digest is absent');
  }
  if (before.digest !== after.digest) {
    fail('Docker global resource inventory changed during acceptance');
  }
}

function safeRunToken(runId) {
  if (!/^run-[0-9a-f]{24}$/u.test(runId)) fail('runtime run ID is invalid');
  return runId.slice(4);
}

export function acceptedRuntimeOwnershipPlan({ runId, artifacts }) {
  const token = safeRunToken(runId);
  const updaterRoot = artifacts.roots.updater;
  const updaterMetadataPath = requireCanonicalPath(
    path.join(updaterRoot, 'artifacts', 'build-metadata.json'),
    { label: 'Updater build metadata', type: 'file' },
  );
  const updaterMetadata = readJsonStrict(updaterMetadataPath);
  const updaterReference =
    updaterMetadata?.artifacts?.image?.oci?.reference;
  if (
    typeof updaterReference !== 'string' ||
    !/^bgmss-updater-artifact:[0-9a-f]{12}-arm64$/u.test(
      updaterReference,
    )
  ) {
    fail('Updater build metadata has an invalid image reference');
  }
  return Object.freeze({
    names: Object.freeze({
      network: `bgmss-accept-${token}`,
      backend: `bgmss-accept-api-${token}`,
      relay: `bgmss-accept-relay-${token}`,
      updaterDoctor: `bgmss-accept-doctor-${token}`,
      updaterContract: `bgmss-accept-contract-${token}`,
    }),
    images: Object.freeze({
      backend:
        `localhost/bgmss-backend-api:${artifacts.statements.backend.source.revision}-arm64`,
      updater: updaterReference,
    }),
    archives: Object.freeze({
      backend: artifactPath(
        artifacts.roots.backend,
        artifacts.statements.backend,
        '.oci.tar',
      ),
      updater: artifactPath(
        artifacts.roots.updater,
        artifacts.statements.updater,
        '.oci.tar',
      ),
    }),
  });
}

function commandOutput(runRoot, result, stream = 'stdout') {
  const declaration = result[stream];
  if (declaration.truncated) fail(`${result.id} ${stream} was truncated`);
  return decodeUtf8Strict(fs.readFileSync(path.join(runRoot, declaration.path)));
}

function exactJson(output, expected, label) {
  const value = parseJsonStrict(output);
  if (
    JSON.stringify(value, Object.keys(value).sort()) !==
    JSON.stringify(expected, Object.keys(expected).sort())
  ) {
    fail(`${label} returned an unexpected JSON document`);
  }
  return value;
}

function artifactPath(root, statement, suffix) {
  const matches = statement.artifacts.filter((artifact) => artifact.path.endsWith(suffix));
  if (matches.length !== 1) fail(`artifact statement must name one ${suffix}`);
  return requireCanonicalPath(path.join(root, ...matches[0].path.split('/')), {
    label: `${suffix} artifact`,
    type: 'file',
  });
}

function assertDockerMountPath(value, label) {
  const canonical = requireCanonicalPath(value, { label, type: 'directory' });
  if (canonical.includes(',') || canonical.includes(':')) {
    fail(`${label} cannot be represented by the fixed Docker mount policy`);
  }
  return canonical;
}

export function requireDockerEndpoint(value) {
  if (typeof value !== 'string' || !value.startsWith('unix://')) {
    fail('Docker endpoint must be one explicit Unix socket');
  }
  const socketPath = value.slice('unix://'.length);
  assertAbsolutePathSyntax(socketPath, 'Docker socket');
  assertNoSymlinkAncestors(socketPath, 'Docker socket');
  const information = fs.lstatSync(socketPath);
  if (!information.isSocket() || fs.realpathSync.native(socketPath) !== socketPath) {
    fail('Docker endpoint is not one canonical Unix socket');
  }
  return value;
}

async function delay(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function cleanupToken(value) {
  return value.replaceAll(/[^A-Za-z0-9._-]+/gu, '-').slice(0, 96);
}

function escapedExpression(value) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function exactNotFound(error, kind, name, readCommandError) {
  if (!(error instanceof CommandError) || error.result?.status !== 1) return false;
  const stderr = readCommandError(error);
  const escaped = escapedExpression(name);
  const expression =
    kind === 'container'
      ? new RegExp(
          `^Error response from daemon: No such container: ${escaped}\\n$`,
          'u',
        )
      : kind === 'image'
        ? new RegExp(
            `^Error response from daemon: No such image: ${escaped}(?::latest)?\\n$`,
            'u',
          )
        : new RegExp(
            `^Error response from daemon: network ${escaped} not found\\n$`,
            'u',
          );
  return expression.test(stderr);
}

async function inspectedExists(
  runDocker,
  kind,
  name,
  phase,
  readCommandError,
) {
  try {
    await runDocker(
      `cleanup-${phase}-${kind}-${cleanupToken(name)}`,
      [kind, 'inspect', name],
      { expectStatus: 0, timeoutMs: 30_000 },
    );
    return true;
  } catch (error) {
    if (exactNotFound(error, kind, name, readCommandError)) return false;
    throw error;
  }
}

async function inspectBackendState(
  runDocker,
  name,
  phase,
  readCommandOutput,
) {
  const result = await runDocker(
    `cleanup-state-${phase}-container-${cleanupToken(name)}`,
    [
      'container',
      'inspect',
      '--format',
      '{"Running":{{.State.Running}},"OOMKilled":{{.State.OOMKilled}},"Error":{{json .State.Error}},"ExitCode":{{.State.ExitCode}}}',
      name,
    ],
    { expectStatus: 0, timeoutMs: 30_000 },
  );
  const state = parseJsonStrict(readCommandOutput(result));
  const object = state && typeof state === 'object' && !Array.isArray(state)
    ? state
    : null;
  if (
    !object ||
    Object.keys(object).join(',') !== 'Running,OOMKilled,Error,ExitCode' ||
    typeof object.Running !== 'boolean' ||
    typeof object.OOMKilled !== 'boolean' ||
    typeof object.Error !== 'string' ||
    !Number.isSafeInteger(object.ExitCode)
  ) {
    fail(`Backend ${phase} state is invalid`);
  }
  return Object.freeze({ ...object });
}

export async function cleanupOwnedRuntimeResources({
  runDocker,
  names,
  images,
  loadedImages,
  loadedImageIds = new Map(),
  ownedContainers = new Set([
    names.relay,
    names.backend,
    names.updaterDoctor,
    names.updaterContract,
  ]),
  ownedNetworks = new Set([names.network]),
  gracefulStopMs = 15_000,
  readCommandError = (error) => error.result?.stderrText ?? '',
  readCommandOutput = (result) => result.stdoutText ?? '',
}) {
  if (typeof runDocker !== 'function') fail('runtime cleanup runner is absent');
  const failures = [];
  const containers = [
    names.relay,
    names.backend,
    names.updaterDoctor,
    names.updaterContract,
  ];
  let backendShutdownDurationMs = 0;
  let backendStateBefore = null;
  let backendStateAfter = null;
  for (const container of containers) {
    try {
      const exists = await inspectedExists(
        runDocker,
        'container',
        container,
        'pre',
        readCommandError,
      );
      if (exists && !ownedContainers.has(container)) {
        throw new RuntimeAcceptanceError(
          `unowned container appeared in the reserved runtime identity: ${container}`,
        );
      }
      if (exists && container === names.backend) {
        let forceRemoval = false;
        let gracefulFailure = null;
        try {
          backendStateBefore = await inspectBackendState(
            runDocker,
            container,
            'before-stop',
            readCommandOutput,
          );
          if (
            backendStateBefore.Running !== true ||
            backendStateBefore.OOMKilled !== false ||
            backendStateBefore.Error !== ''
          ) {
            throw new RuntimeAcceptanceError(
              'Backend was not healthy and running before graceful stop',
            );
          }
        } catch (error) {
          gracefulFailure = error;
          forceRemoval = true;
        }
        if (!gracefulFailure) {
          const started = performance.now();
          try {
            await runDocker(
              `cleanup-stop-container-${cleanupToken(container)}`,
              [
                'container',
                'stop',
                '--time',
                String(Math.ceil(gracefulStopMs / 1000)),
                container,
              ],
              { timeoutMs: gracefulStopMs + 5_000 },
            );
          } catch (error) {
            gracefulFailure = error;
            forceRemoval = true;
          }
          backendShutdownDurationMs = Math.round(performance.now() - started);
        }
        if (gracefulFailure || backendShutdownDurationMs > gracefulStopMs) {
          failures.push(
            new RuntimeAcceptanceError(
              gracefulFailure
                ? 'Backend graceful stop failed'
                : 'Backend graceful stop exceeded the accepted ceiling',
              gracefulFailure ? { cause: gracefulFailure } : undefined,
            ),
          );
        }
        if (!gracefulFailure && backendShutdownDurationMs <= gracefulStopMs) {
          try {
            backendStateAfter = await inspectBackendState(
              runDocker,
              container,
              'after-stop',
              readCommandOutput,
            );
            if (
              backendStateAfter.Running !== false ||
              backendStateAfter.OOMKilled !== false ||
              backendStateAfter.Error !== '' ||
              backendStateAfter.ExitCode !== 0
            ) {
              throw new RuntimeAcceptanceError(
                'Backend did not terminate cleanly after graceful stop',
              );
            }
          } catch (error) {
            failures.push(error);
            forceRemoval = true;
          }
        }
        await runDocker(
          `cleanup-remove-container-${cleanupToken(container)}`,
          [
            'container',
            'rm',
            ...(forceRemoval ? ['--force'] : []),
            container,
          ],
          { timeoutMs: 30_000 },
        );
      } else if (exists) {
        await runDocker(
          `cleanup-remove-container-${cleanupToken(container)}`,
          ['container', 'rm', '--force', container],
          { timeoutMs: 30_000 },
        );
      }
      if (
        await inspectedExists(
          runDocker,
          'container',
          container,
          'post',
          readCommandError,
        )
      ) {
        throw new RuntimeAcceptanceError(
          `owned runtime container remains after cleanup: ${container}`,
        );
      }
    } catch (error) {
      failures.push(error);
    }
  }
  try {
    const exists = await inspectedExists(
      runDocker,
      'network',
      names.network,
      'pre',
      readCommandError,
    );
    if (exists && !ownedNetworks.has(names.network)) {
      throw new RuntimeAcceptanceError(
        `unowned network appeared in the reserved runtime identity: ${names.network}`,
      );
    }
    if (exists) {
      await runDocker(
        `cleanup-remove-network-${cleanupToken(names.network)}`,
        ['network', 'rm', names.network],
        { timeoutMs: 30_000 },
      );
    }
    if (
      await inspectedExists(
        runDocker,
        'network',
        names.network,
        'post',
        readCommandError,
      )
    ) {
      throw new RuntimeAcceptanceError(
        `owned runtime network remains after cleanup: ${names.network}`,
      );
    }
  } catch (error) {
    failures.push(error);
  }
  for (const image of [images.backend, images.updater]) {
    try {
      const exists = await inspectedExists(
        runDocker,
        'image',
        image,
        'pre',
        readCommandError,
      );
      if (exists && loadedImages.has(image)) {
        const expectedImageId = loadedImageIds.get(image);
        if (!/^sha256:[0-9a-f]{64}$/u.test(expectedImageId)) {
          throw new RuntimeAcceptanceError(
            `owned runtime image ID is absent: ${image}`,
          );
        }
        const identity = await runDocker(
          `cleanup-identity-image-${cleanupToken(image)}`,
          ['image', 'inspect', '--format', '{{.Id}}', image],
          { timeoutMs: 30_000 },
        );
        if (readCommandOutput(identity).trim() !== expectedImageId) {
          throw new RuntimeAcceptanceError(
            `owned runtime image changed identity: ${image}`,
          );
        }
        const references = await runDocker(
          `cleanup-references-image-${cleanupToken(image)}`,
          [
            'container',
            'ls',
            '--all',
            '--quiet',
            '--no-trunc',
            '--filter',
            `ancestor=${expectedImageId}`,
          ],
          { timeoutMs: 30_000 },
        );
        if (readCommandOutput(references).trim() !== '') {
          throw new RuntimeAcceptanceError(
            `owned runtime image has a foreign container reference: ${image}`,
          );
        }
        await runDocker(
          `cleanup-remove-image-${cleanupToken(image)}`,
          ['image', 'rm', image],
          { timeoutMs: 60_000 },
        );
      } else if (exists) {
        throw new RuntimeAcceptanceError(
          `unowned image appeared in the reserved runtime identity: ${image}`,
        );
      }
      if (
        await inspectedExists(
          runDocker,
          'image',
          image,
          'post',
          readCommandError,
        )
      ) {
        throw new RuntimeAcceptanceError(
          `owned runtime image remains after cleanup: ${image}`,
        );
      }
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new RuntimeAcceptanceError(
      `runtime cleanup failed for ${failures.length} owned resources`,
      { cause: failures[0] },
    );
  }
  return Object.freeze({
    containers: Object.freeze([...containers]),
    images: Object.freeze([images.backend, images.updater]),
    network: names.network,
    backendShutdownDurationMs,
    backendStateBefore,
    backendStateAfter,
  });
}

export class AcceptedRuntime {
  constructor({
    runId,
    runRoot,
    docker,
    dockerEndpoint: endpoint,
    artifacts,
    archiveRoot,
    contractsRoot,
    budgets,
    supervisorPreparedImages = false,
  }) {
    const ownership = acceptedRuntimeOwnershipPlan({ runId, artifacts });
    this.runId = runId;
    this.runRoot = requireCanonicalPath(runRoot, {
      label: 'runtime run root',
      type: 'directory',
    });
    this.docker = requireCanonicalPath(docker, {
      label: 'Docker executable',
      type: 'file',
    });
    this.dockerEndpoint = requireDockerEndpoint(endpoint);
    this.artifacts = artifacts;
    this.archiveRoot = assertDockerMountPath(archiveRoot, 'runtime Archive root');
    this.contractsRoot = assertDockerMountPath(contractsRoot, 'runtime Contracts root');
    this.budgets = budgets;
    this.names = ownership.names;
    this.images = ownership.images;
    this.archives = ownership.archives;
    this.supervisorPreparedImages = supervisorPreparedImages;
    this.loaded = new Set();
    this.loadedImageIds = new Map();
    this.ownedContainers = new Set();
    this.ownedNetworks = new Set();
    this.created = new Set();
    this.commands = [];
    this.requestSequence = 0;
    this.cleanupSequence = 0;
    this.memoryPeakBytes = 0;
    this.memorySampleCount = 0;
    this.memorySampler = null;
    this.memorySamplePromise = null;
    this.memorySamplerFailure = null;
    this.environment = sanitizedEnvironment({
      runRoot: this.runRoot,
      pathEntries: [path.dirname(this.docker), '/usr/bin', '/bin'],
      extra: {
        DOCKER_CLI_HINTS: 'false',
        DOCKER_HOST: this.dockerEndpoint,
      },
    });
  }

  #updaterImageInformation() {
    const root = this.artifacts.roots.updater;
    const metadataPath = requireCanonicalPath(
      path.join(root, 'artifacts', 'build-metadata.json'),
      { label: 'Updater build metadata', type: 'file' },
    );
    const metadata = readJsonStrict(metadataPath);
    const reference = metadata?.artifacts?.image?.oci?.reference;
    const manifestDigest = metadata?.artifacts?.image?.oci?.manifest?.digest;
    if (
      typeof reference !== 'string' ||
      !/^bgmss-updater-artifact:[0-9a-f]{12}-arm64$/u.test(reference)
    ) {
      fail('Updater build metadata has an invalid image reference');
    }
    if (!/^sha256:[0-9a-f]{64}$/u.test(manifestDigest)) {
      fail('Updater build metadata has an invalid OCI manifest digest');
    }
    return Object.freeze({ reference, imageId: manifestDigest });
  }

  async #docker(id, args, { expectStatus = 0, timeoutMs } = {}) {
    const result = await runCommand({
      id: `docker:${id}`,
      executable: this.docker,
      args,
      cwd: this.runRoot,
      environment: this.environment,
      timeoutMs: timeoutMs ?? this.budgets.timeouts.runtimeMs,
      gracefulStopMs: this.budgets.timeouts.gracefulStopMs,
      runRoot: this.runRoot,
      expectStatus,
    });
    this.commands.push(result);
    return result;
  }

  async #assertAbsent(kind, name) {
    try {
      await this.#docker(
        `preflight-${kind}-${name}`,
        [kind, 'inspect', name],
        { timeoutMs: 30_000 },
      );
    } catch (error) {
      if (
        exactNotFound(
          error,
          kind,
          name,
          (candidate) => commandOutput(this.runRoot, candidate.result, 'stderr'),
        )
      ) {
        return;
      }
      throw error;
    }
    fail(`${kind} already exists: ${name}`);
  }

  async prepare() {
    for (const image of Object.values(this.images)) {
      if (this.supervisorPreparedImages) {
        const inspection = await this.#docker(
          `preflight-supervisor-image-${cleanupToken(image)}`,
          ['image', 'inspect', '--format', '{{.Id}}', image],
          { timeoutMs: 30_000 },
        );
        const imageId = commandOutput(this.runRoot, inspection).trim();
        if (!/^sha256:[0-9a-f]{64}$/u.test(imageId)) {
          fail(`supervisor-prepared image has an invalid ID: ${image}`);
        }
        this.loadedImageIds.set(image, imageId);
      } else {
        await this.#assertAbsent('image', image);
      }
      this.loaded.add(image);
    }
    for (const container of [
      this.names.backend,
      this.names.relay,
      this.names.updaterDoctor,
      this.names.updaterContract,
    ]) {
      await this.#assertAbsent('container', container);
      this.ownedContainers.add(container);
    }
    await this.#assertAbsent('network', this.names.network);
    this.ownedNetworks.add(this.names.network);

    const backendArchive = this.archives.backend;
    const updaterArchive = this.archives.updater;
    if (!this.supervisorPreparedImages) {
      for (const [component, archive, image] of [
        ['backend', backendArchive, this.images.backend],
        ['updater', updaterArchive, this.images.updater],
      ]) {
        await this.#docker(
          `load-${component}`,
          ['image', 'load', '--input', archive],
          { timeoutMs: 300_000 },
        );
        await this.#docker(
          `inspect-${component}`,
          ['image', 'inspect', '--format', '{{.Id}}', image],
          { timeoutMs: 30_000 },
        );
        const inspection = this.commands.at(-1);
        const imageId = commandOutput(this.runRoot, inspection).trim();
        if (!/^sha256:[0-9a-f]{64}$/u.test(imageId)) {
          fail(`${component} image load produced an invalid image ID`);
        }
        this.loadedImageIds.set(image, imageId);
      }
    }
    const backendShape = await this.#docker('backend-shape', [
      'image',
      'inspect',
      '--format',
      '{{json .Config.User}} {{json .Config.Entrypoint}}',
      this.images.backend,
    ]);
    if (
      commandOutput(this.runRoot, backendShape).trim() !==
      '"65532:65532" ["/usr/local/bin/bgmss-api"]'
    ) {
      fail('Backend image user or entrypoint differs from the accepted shape');
    }
    const updaterShape = await this.#docker('updater-shape', [
      'image',
      'inspect',
      '--format',
      '{{json .Config.User}} {{json .Config.Entrypoint}}',
      this.images.updater,
    ]);
    if (!commandOutput(this.runRoot, updaterShape).trim().startsWith('"65532:65532" ')) {
      fail('Updater image does not declare the accepted non-root user');
    }
    return Object.freeze({
      images: this.images,
      backendArchive,
      updaterArchive,
    });
  }

  async runUpdaterDoctor() {
    const result = await this.#docker('updater-doctor', [
      'run',
      '--rm',
      '--name',
      this.names.updaterDoctor,
      '--pull',
      'never',
      '--network',
      'none',
      '--read-only',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--tmpfs',
      '/tmp:rw,noexec,nosuid,nodev,size=8m',
      '--user',
      '65532:65532',
      this.images.updater,
      'doctor',
    ]);
    const value = exactJson(
      commandOutput(this.runRoot, result),
      { code: 'FOUNDATION_READY', status: 'ok', version: '0.1.0' },
      'Updater doctor',
    );
    return Object.freeze({ result, value });
  }

  async runUpdaterContract() {
    const result = await this.#docker('updater-contract', [
      'run',
      '--rm',
      '--name',
      this.names.updaterContract,
      '--pull',
      'never',
      '--network',
      'none',
      '--read-only',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--tmpfs',
      '/tmp:rw,noexec,nosuid,nodev,size=8m',
      '--user',
      '65532:65532',
      '--mount',
      `type=bind,src=${this.contractsRoot},dst=/contracts,readonly`,
      this.images.updater,
      'contract-check',
      '--contracts-root',
      '/contracts',
    ]);
    const value = exactJson(
      commandOutput(this.runRoot, result),
      { code: 'VALID', status: 'ok' },
      'Updater contract check',
    );
    return Object.freeze({ result, value });
  }

  async startBackend() {
    await this.#docker('network-create', [
      'network',
      'create',
      '--driver',
      'bridge',
      '--internal',
      this.names.network,
    ]);
    this.created.add(`network:${this.names.network}`);
    const network = await this.#docker('network-policy', [
      'network',
      'inspect',
      '--format',
      '{{json .Internal}} {{json .Driver}}',
      this.names.network,
    ]);
    if (commandOutput(this.runRoot, network).trim() !== 'true "bridge"') {
      fail('runtime network is not an internal bridge');
    }

    await this.#docker('backend-create', [
      'container',
      'create',
      '--name',
      this.names.backend,
      '--pull',
      'never',
      '--network',
      this.names.network,
      '--read-only',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--tmpfs',
      '/tmp:rw,noexec,nosuid,nodev,size=16m',
      '--memory',
      '1g',
      '--memory-swap',
      '1g',
      '--user',
      '65532:65532',
      '--mount',
      `type=bind,src=${this.archiveRoot},dst=/archive,readonly`,
      this.images.backend,
      '-archive-root',
      '/archive',
    ]);
    this.created.add(`container:${this.names.backend}`);
    await this.#docker('backend-start', ['container', 'start', this.names.backend]);
    await this.#sampleBackendMemory();
    this.memorySampler = setInterval(() => {
      if (this.memorySamplePromise) return;
      this.memorySamplePromise = this.#sampleBackendMemory()
        .catch((error) => {
          this.memorySamplerFailure ??= error;
        })
        .finally(() => {
          this.memorySamplePromise = null;
        });
    }, 250);
    this.memorySampler.unref();

    const relayPath = requireCanonicalPath(path.join(ACCEPTANCE_ROOT, 'lib', 'relay.py'), {
      label: 'acceptance relay',
      type: 'file',
    });
    await this.#docker('relay-run', [
      'run',
      '--detach',
      '--name',
      this.names.relay,
      '--pull',
      'never',
      '--network',
      `container:${this.names.backend}`,
      '--read-only',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--tmpfs',
      '/tmp:rw,noexec,nosuid,nodev,size=8m',
      '--user',
      '65532:65532',
      '--entrypoint',
      '/usr/local/bin/python',
      '--mount',
      `type=bind,src=${relayPath},dst=/relay.py,readonly`,
      this.images.updater,
      '/relay.py',
      'daemon',
    ]);
    this.created.add(`container:${this.names.relay}`);

    const relayState = await this.#docker('relay-state', [
      'container',
      'inspect',
      '--format',
      '{{.State.Running}} {{.Config.User}}',
      this.names.relay,
    ]);
    if (commandOutput(this.runRoot, relayState).trim() !== 'true 65532:65532') {
      fail('relay did not remain running as the accepted non-root user');
    }

    const started = performance.now();
    let latestError;
    while (performance.now() - started < this.budgets.profile.ceilings.backendReadyMs) {
      try {
        const response = await this.request('/readyz', { timeoutMs: 2_000 });
        if (
          response.status === 200 &&
          response.document?.data?.status === 'ready'
        ) {
          return Object.freeze({
            transport: 'fixed-internal-docker-exec-bridge',
            readyDurationMs: Math.round(performance.now() - started),
          });
        }
        latestError = new Error(`status ${response.status}`);
      } catch (error) {
        latestError = error;
      }
      await delay(100);
    }
    fail(`Backend did not become ready: ${latestError?.message ?? 'timeout'}`);
  }

  async request(pathname, { method = 'GET', body, timeoutMs = 30_000 } = {}) {
    let encoded;
    if (body !== undefined) {
      if (method !== 'POST') fail('only POST may carry a JSON request body');
      encoded = Buffer.from(JSON.stringify(body));
    }
    return this.requestRaw(pathname, {
      method,
      bodyBytes: encoded,
      contentType: encoded ? 'application/json' : undefined,
      timeoutMs,
    });
  }

  async requestRaw(
    pathname,
    {
      method = 'GET',
      bodyBytes,
      contentType,
      timeoutMs = 30_000,
      signal,
    } = {},
  ) {
    if (!this.created.has(`container:${this.names.relay}`)) {
      fail('Backend runtime has not started');
    }
    if (
      typeof pathname !== 'string' ||
      !pathname.startsWith('/') ||
      pathname.startsWith('//') ||
      pathname.includes('\\') ||
      pathname.includes('\0') ||
      pathname.includes('..')
    ) {
      fail('API request path is unsafe');
    }
    if (!['GET', 'POST'].includes(method)) fail('API request method is not closed');
    if (
      bodyBytes !== undefined &&
      (!Buffer.isBuffer(bodyBytes) || bodyBytes.length > 128 * 1024)
    ) {
      fail('raw API request body must be one bounded Buffer');
    }
    if (bodyBytes !== undefined && method !== 'POST') {
      fail('only POST may carry a request body');
    }
    const started = performance.now();
    if (signal?.aborted) throw signal.reason ?? new Error('API request aborted');
    const sequence = this.requestSequence;
    this.requestSequence += 1;
    const arguments_ = [
      'container',
      'exec',
      '--user',
      '65532:65532',
      this.names.relay,
      '/usr/local/bin/python',
      '/relay.py',
      'request',
      '--method',
      method,
      '--path',
      pathname,
    ];
    if (bodyBytes !== undefined) {
      arguments_.push(
        '--body-base64',
        bodyBytes.toString('base64'),
        '--content-type',
        contentType ?? 'application/octet-stream',
      );
    }
    const command = await this.#docker(`bridge-request-${sequence}`, arguments_, {
      timeoutMs,
    });
    const response = parseJsonStrict(commandOutput(this.runRoot, command));
    if (
      !response ||
      typeof response !== 'object' ||
      Array.isArray(response) ||
      Object.keys(response).sort().join(',') !== 'bodyBase64,headers,status' ||
      !Number.isSafeInteger(response.status) ||
      response.status < 100 ||
      response.status > 599 ||
      !response.headers ||
      typeof response.headers !== 'object' ||
      Array.isArray(response.headers) ||
      typeof response.bodyBase64 !== 'string'
    ) {
      fail('internal HTTP bridge returned an invalid response envelope');
    }
    const responseBytes = Buffer.from(response.bodyBase64, 'base64');
    if (
      responseBytes.toString('base64') !== response.bodyBase64 ||
      responseBytes.length > 700 * 1024
    ) {
      fail('internal HTTP bridge returned an invalid bounded body');
    }
    const responseContentType = String(response.headers['content-type'] ?? '');
    const text = decodeUtf8Strict(responseBytes);
    const document = responseContentType.includes('application/json')
      ? parseJsonStrict(text)
      : null;
    return Object.freeze({
      status: response.status,
      headers: Object.freeze(
        Object.fromEntries(
          Object.entries(response.headers).map(([name, value]) => [
            name,
            Array.isArray(value) ? value.join(', ') : String(value ?? ''),
          ]),
        ),
      ),
      bytes: responseBytes,
      text,
      document,
      durationMs: Math.round(performance.now() - started),
    });
  }

  async cancelRequest(pathname, body) {
    if (
      typeof pathname !== 'string' ||
      !pathname.startsWith('/api/') ||
      pathname.includes('..') ||
      pathname.includes('\\')
    ) {
      fail('cancellation request path is unsafe');
    }
    const encoded = Buffer.from(JSON.stringify(body));
    if (encoded.length > 65_536) fail('cancellation request is too large');
    const sequence = this.requestSequence;
    this.requestSequence += 1;
    const result = await this.#docker(`bridge-cancel-${sequence}`, [
      'container',
      'exec',
      '--user',
      '65532:65532',
      this.names.relay,
      '/usr/local/bin/python',
      '/relay.py',
      'cancel',
      '--path',
      pathname,
      '--body-base64',
      encoded.toString('base64'),
    ], { timeoutMs: 30_000 });
    const value = parseJsonStrict(commandOutput(this.runRoot, result));
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).join(',') !== 'canceled' ||
      value.canceled !== true
    ) {
      fail('internal bridge cancellation result is invalid');
    }
    return Object.freeze({ canceled: true, result });
  }

  async #engineJson(pathname, timeoutMs = 30_000, maxBytes = 2 * 1024 * 1024) {
    const socketPath = this.dockerEndpoint.slice('unix://'.length);
    const signal = currentAbortSignal();
    throwIfAborted();
    return new Promise((resolve, reject) => {
      let settled = false;
      const request = http.request(
        {
          method: 'GET',
          path: pathname,
          socketPath,
          signal,
          headers: {
            accept: 'application/json',
            connection: 'close',
          },
        },
        (response) => {
          const chunks = [];
          let bytes = 0;
          response.on('data', (chunk) => {
            bytes += chunk.length;
            if (bytes > maxBytes) {
              request.destroy(
                new RuntimeAcceptanceError(
                  'Docker Engine response exceeded the closed bound',
                ),
              );
              return;
            }
            chunks.push(chunk);
          });
          response.on('end', () => {
            if (settled) return;
            settled = true;
            if (response.statusCode !== 200) {
              reject(
                new RuntimeAcceptanceError(
                  `Docker Engine response status was ${response.statusCode}`,
                ),
              );
              return;
            }
            try {
              resolve(
                parseJsonStrict(
                  decodeUtf8Strict(Buffer.concat(chunks)),
                  'Docker Engine response',
                ),
              );
            } catch (error) {
              reject(error);
            }
          });
        },
      );
      request.setTimeout(timeoutMs, () => {
        request.destroy(
          new RuntimeAcceptanceError('Docker Engine request timed out'),
        );
      });
      request.once('error', (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      });
      request.end();
    });
  }

  async #sampleBackendMemory() {
    if (!this.created.has(`container:${this.names.backend}`)) return;
    const statistics = await this.#engineJson(
      `/containers/${encodeURIComponent(this.names.backend)}/stats?stream=false&one-shot=true`,
    );
    const usage = statistics?.memory_stats?.usage;
    if (!Number.isSafeInteger(usage) || usage < 0) {
      fail('Backend sampled memory usage is absent or outside the closed integer range');
    }
    this.memoryPeakBytes = Math.max(this.memoryPeakBytes, usage);
    this.memorySampleCount += 1;
  }

  async #stopMemorySampler() {
    clearInterval(this.memorySampler);
    this.memorySampler = null;
    await this.memorySamplePromise;
    this.memorySamplePromise = null;
    if (this.memorySamplerFailure) throw this.memorySamplerFailure;
  }

  async resourceInventory() {
    const [containers, images, networks, volumeDocument] = await Promise.all([
      this.#engineJson('/containers/json?all=1&size=0', 30_000, 8 * 1024 * 1024),
      this.#engineJson('/images/json?all=1&digests=1', 30_000, 8 * 1024 * 1024),
      this.#engineJson('/networks', 30_000, 8 * 1024 * 1024),
      this.#engineJson('/volumes', 30_000, 8 * 1024 * 1024),
    ]);
    return normalizeDockerResourceInventory({
      containers,
      images,
      networks,
      volumes: volumeDocument?.Volumes ?? [],
    });
  }

  async performanceSnapshot() {
    if (!this.created.has(`container:${this.names.backend}`)) {
      fail('Backend runtime has not started');
    }
    const metrics = await this.request('/metrics');
    if (metrics.status !== 200 || metrics.text.length === 0) {
      fail('Backend performance metrics request failed');
    }
    await this.#sampleBackendMemory();
    await this.#stopMemorySampler();
    const statistics = await this.#engineJson(
      `/containers/${encodeURIComponent(this.names.backend)}/stats?stream=false&one-shot=true`,
    );
    const inspection = await this.#engineJson(
      `/containers/${encodeURIComponent(this.names.backend)}/json`,
    );
    const cpuNanoseconds = statistics?.cpu_stats?.cpu_usage?.total_usage;
    const currentMemory = statistics?.memory_stats?.usage;
    if (!Number.isSafeInteger(cpuNanoseconds) || cpuNanoseconds < 0) {
      fail('Backend CPU nanoseconds is absent or outside the closed integer range');
    }
    const memoryHardLimitBytes = inspection?.HostConfig?.Memory;
    const memorySwapHardLimitBytes = inspection?.HostConfig?.MemorySwap;
    const oomKilled = inspection?.State?.OOMKilled;
    const memoryPolicy = normalizeBackendMemoryPolicy({
      currentMemoryBytes: currentMemory,
      memoryHardLimitBytes,
      memorySampleCount: this.memorySampleCount,
      memorySwapHardLimitBytes,
      oomKilled,
      sampledHighWaterMemoryBytes: this.memoryPeakBytes,
    });
    return Object.freeze({
      cpuNanoseconds,
      ...memoryPolicy,
      memorySampleIntervalMs: 250,
      metricsText: metrics.text,
    });
  }

  async cleanup() {
    clearInterval(this.memorySampler);
    this.memorySampler = null;
    try {
      await this.memorySamplePromise;
    } catch {
      // Cleanup remains authoritative even when a background observation failed.
    }
    this.memorySamplePromise = null;
    const cleanupSequence = this.cleanupSequence;
    this.cleanupSequence += 1;
    return cleanupOwnedRuntimeResources({
      runDocker: (id, args, options) =>
        this.#docker(`cleanup-${cleanupSequence}-${id}`, args, options),
      names: this.names,
      images: this.images,
      loadedImages: this.loaded,
      loadedImageIds: this.loadedImageIds,
      ownedContainers: this.ownedContainers,
      ownedNetworks: this.ownedNetworks,
      gracefulStopMs: this.budgets.profile.ceilings.backendShutdownMs,
      readCommandError: (error) =>
        commandOutput(this.runRoot, error.result, 'stderr'),
      readCommandOutput: (result) => commandOutput(this.runRoot, result),
    });
  }
}
