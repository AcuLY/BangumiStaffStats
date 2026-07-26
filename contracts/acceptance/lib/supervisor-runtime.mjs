import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

import { canonicalJsonDigest } from './canonical-json.mjs';
import { CommandError, runCommand, sanitizedEnvironment } from './runner.mjs';
import {
  acceptedRuntimeOwnershipPlan,
  requireDockerEndpoint,
} from './runtime.mjs';
import { parseJsonStrict } from './strict-json.mjs';

export class SupervisorRuntimeOwnershipError extends Error {}

function fail(message, options) {
  throw new SupervisorRuntimeOwnershipError(message, options);
}

function escapedExpression(value) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function exactNotFound(kind, name, outcome) {
  if (outcome.status !== 1) return false;
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
  return expression.test(outcome.stderr);
}

function commandToken(value) {
  return value.replaceAll(/[^A-Za-z0-9._-]+/gu, '-').slice(0, 80);
}

function readCaptured(runRoot, declaration) {
  if (!declaration || declaration.truncated) {
    fail('supervisor Docker output is absent or truncated');
  }
  return fs.readFileSync(path.join(runRoot, declaration.path), 'utf8');
}

function removeCaptured(runRoot, result) {
  for (const declaration of [result.stdout, result.stderr]) {
    const candidate = path.join(runRoot, declaration.path);
    if (fs.existsSync(candidate)) fs.unlinkSync(candidate);
  }
  const directory = path.join(runRoot, 'evidence', 'commands');
  if (fs.existsSync(directory) && fs.readdirSync(directory).length === 0) {
    fs.rmdirSync(directory);
  }
}

function frozenFacts(facts) {
  return Object.freeze(facts.map((fact) => Object.freeze({ ...fact })));
}

function sha256Bytes(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function tarString(bytes) {
  const end = bytes.indexOf(0);
  return bytes.subarray(0, end === -1 ? bytes.length : end).toString('utf8');
}

function tarSize(bytes) {
  const value = tarString(bytes).trim();
  if (!/^[0-7]+$/u.test(value)) {
    fail('OCI archive contains an invalid tar size');
  }
  const size = Number.parseInt(value, 8);
  if (!Number.isSafeInteger(size) || size < 0) {
    fail('OCI archive tar size is outside the safe integer range');
  }
  return size;
}

function readExact(descriptor, buffer, position, label) {
  let offset = 0;
  while (offset < buffer.length) {
    const count = fs.readSync(
      descriptor,
      buffer,
      offset,
      buffer.length - offset,
      position + offset,
    );
    if (count === 0) fail(`OCI archive ended inside ${label}`);
    offset += count;
  }
}

function readOciTarEntry(archivePath, target, maximumBytes) {
  const descriptor = fs.openSync(archivePath, 'r');
  try {
    const archiveSize = fs.fstatSync(descriptor).size;
    let position = 0;
    while (position + 512 <= archiveSize) {
      const header = Buffer.alloc(512);
      readExact(descriptor, header, position, 'a tar header');
      if (header.every((byte) => byte === 0)) break;
      const name = tarString(header.subarray(0, 100));
      const prefix = tarString(header.subarray(345, 500));
      const entry = prefix === '' ? name : `${prefix}/${name}`;
      const size = tarSize(header.subarray(124, 136));
      const payload = position + 512;
      const padded = Math.ceil(size / 512) * 512;
      if (payload + padded > archiveSize) {
        fail('OCI archive entry exceeds the archive boundary');
      }
      if (entry === target) {
        if (![0, 48].includes(header[156])) {
          fail(`OCI archive ${target} is not a regular file`);
        }
        if (size > maximumBytes) {
          fail(`OCI archive ${target} exceeds its closed size limit`);
        }
        const bytes = Buffer.alloc(size);
        readExact(descriptor, bytes, payload, target);
        return bytes;
      }
      position = payload + padded;
    }
  } finally {
    fs.closeSync(descriptor);
  }
  fail(`OCI archive is missing ${target}`);
}

function exactOciImageId(archivePath) {
  const index = parseJsonStrict(
    readOciTarEntry(archivePath, 'index.json', 1024 * 1024).toString('utf8'),
  );
  if (
    index?.schemaVersion !== 2 ||
    !Array.isArray(index.manifests) ||
    index.manifests.length !== 1
  ) {
    fail('OCI archive index does not declare one image manifest');
  }
  const manifestDigest = index.manifests[0]?.digest;
  if (!/^sha256:[0-9a-f]{64}$/u.test(manifestDigest)) {
    fail('OCI archive index has an invalid manifest digest');
  }
  const manifestBytes = readOciTarEntry(
    archivePath,
    `blobs/sha256/${manifestDigest.slice(7)}`,
    8 * 1024 * 1024,
  );
  if (sha256Bytes(manifestBytes) !== manifestDigest) {
    fail('OCI archive manifest bytes differ from their digest');
  }
  const manifest = parseJsonStrict(manifestBytes.toString('utf8'));
  const imageId = manifest?.config?.digest;
  if (!/^sha256:[0-9a-f]{64}$/u.test(imageId)) {
    fail('OCI archive manifest has an invalid config digest');
  }
  const configBytes = readOciTarEntry(
    archivePath,
    `blobs/sha256/${imageId.slice(7)}`,
    8 * 1024 * 1024,
  );
  if (sha256Bytes(configBytes) !== imageId) {
    fail('OCI archive config bytes differ from their digest');
  }
  return imageId;
}

export class SupervisorRuntimeOwnership {
  constructor({
    allocation,
    artifacts,
    budgets,
    docker,
    dockerEndpoint,
  }) {
    this.runId = allocation.runId;
    this.runRoot = allocation.runRoot;
    this.budgets = budgets;
    this.docker = docker.path;
    this.endpoint = requireDockerEndpoint(dockerEndpoint);
    this.plan = acceptedRuntimeOwnershipPlan({
      runId: this.runId,
      artifacts,
    });
    this.expected = new Map(
      ['backend', 'updater'].map((component) => [
        this.plan.images[component],
        exactOciImageId(this.plan.archives[component]),
      ]),
    );
    this.loaded = new Map();
    this.pending = new Set();
    this.commands = [];
    this.prepared = false;
    this.environment = sanitizedEnvironment({
      runRoot: this.runRoot,
      pathEntries: [path.dirname(this.docker), '/usr/bin', '/bin'],
      extra: {
        DOCKER_CLI_HINTS: 'false',
        DOCKER_HOST: this.endpoint,
      },
    });
  }

  facts() {
    return Object.freeze({
      commands: frozenFacts(this.commands),
      loaded: Object.freeze(
        Object.fromEntries(
          [...this.loaded.entries()].sort(([left], [right]) =>
            left.localeCompare(right, 'en'),
          ),
        ),
      ),
      names: this.plan.names,
      pending: Object.freeze([...this.pending].sort()),
      prepared: this.prepared,
      schemaVersion: 1,
    });
  }

  async #docker(id, args, { acceptStatusOne = false, timeoutMs } = {}) {
    let result;
    let caught;
    try {
      result = await runCommand({
        id: `supervisor:${id}`,
        executable: this.docker,
        args,
        cwd: this.runRoot,
        environment: this.environment,
        timeoutMs: timeoutMs ?? 30_000,
        gracefulStopMs: this.budgets.timeouts.gracefulStopMs,
        runRoot: this.runRoot,
        signal: this.commandSignal,
      });
    } catch (error) {
      caught = error;
      result = error?.result;
    }
    if (!result) {
      fail(
        `supervisor Docker command ${id} failed before a bounded result existed`,
        { cause: caught },
      );
    }
    let stdout;
    let stderr;
    try {
      stdout = readCaptured(this.runRoot, result.stdout);
      stderr = readCaptured(this.runRoot, result.stderr);
    } finally {
      removeCaptured(this.runRoot, result);
    }
    const outcome = Object.freeze({
      durationMs: result.durationMs,
      id,
      signal: result.signal,
      status: result.status,
      stderr,
      stdout,
      timedOut: result.timedOut,
    });
    this.commands.push({
      durationMs: outcome.durationMs,
      id,
      signal: outcome.signal,
      status: outcome.status,
      stderrDigest: canonicalJsonDigest(outcome.stderr),
      stdoutDigest: canonicalJsonDigest(outcome.stdout),
      timedOut: outcome.timedOut,
    });
    if (
      caught &&
      !(
        acceptStatusOne &&
        caught instanceof CommandError &&
        result.status === 1 &&
        !result.timedOut
      )
    ) {
      fail(`supervisor Docker command ${id} failed`, { cause: caught });
    }
    return outcome;
  }

  async #inspect(kind, name, { format } = {}) {
    const args = [kind, 'inspect'];
    if (format) args.push('--format', format);
    args.push(name);
    const outcome = await this.#docker(
      `inspect-${kind}-${commandToken(name)}`,
      args,
      { acceptStatusOne: true },
    );
    if (outcome.status === 0) {
      return Object.freeze({ exists: true, output: outcome.stdout.trim() });
    }
    if (!exactNotFound(kind, name, outcome)) {
      fail(`supervisor received an ambiguous ${kind} inspect failure`);
    }
    return Object.freeze({ exists: false, output: '' });
  }

  async #assertAbsent(kind, name) {
    if ((await this.#inspect(kind, name)).exists) {
      fail(`reserved supervisor ${kind} already exists: ${name}`);
    }
  }

  async prepare({ signal } = {}) {
    if (signal !== undefined && !(signal instanceof AbortSignal)) {
      fail('supervisor runtime preparation signal is invalid');
    }
    this.commandSignal = signal;
    try {
      if (
        this.prepared ||
        this.loaded.size !== 0 ||
        this.pending.size !== 0
      ) {
        fail('supervisor runtime ownership was prepared more than once');
      }
      for (const image of Object.values(this.plan.images)) {
        await this.#assertAbsent('image', image);
      }
      for (const name of [
        this.plan.names.backend,
        this.plan.names.relay,
        this.plan.names.updaterDoctor,
        this.plan.names.updaterContract,
      ]) {
        await this.#assertAbsent('container', name);
      }
      await this.#assertAbsent('network', this.plan.names.network);
      for (const component of ['backend', 'updater']) {
        const image = this.plan.images[component];
        this.pending.add(image);
        await this.#docker(
          `load-${component}`,
          ['image', 'load', '--input', this.plan.archives[component]],
          { timeoutMs: 300_000 },
        );
        const inspection = await this.#inspect('image', image, {
          format: '{{.Id}}',
        });
        if (
          !inspection.exists ||
          inspection.output !== this.expected.get(image)
        ) {
          fail(
            `supervisor loaded ${component} with an unexpected image ID`,
          );
        }
        this.loaded.set(image, inspection.output);
        this.pending.delete(image);
      }
      this.prepared = true;
      return this.facts();
    } finally {
      this.commandSignal = undefined;
    }
  }

  async #residue() {
    const residue = {
      containers: 0,
      images: 0,
      networks: 0,
    };
    for (const name of [
      this.plan.names.backend,
      this.plan.names.relay,
      this.plan.names.updaterDoctor,
      this.plan.names.updaterContract,
    ]) {
      if ((await this.#inspect('container', name)).exists) {
        residue.containers += 1;
      }
    }
    if ((await this.#inspect('network', this.plan.names.network)).exists) {
      residue.networks = 1;
    }
    const owned = new Set([...this.pending, ...this.loaded.keys()]);
    for (const image of Object.values(this.plan.images)) {
      const referenceExists = (await this.#inspect('image', image)).exists;
      const identityExists =
        owned.has(image) &&
        (
          await this.#inspect('image', this.expected.get(image))
        ).exists;
      if (referenceExists || identityExists) residue.images += 1;
    }
    return Object.freeze(residue);
  }

  async verifyReleased() {
    const residue = await this.#residue();
    if (Object.values(residue).some((count) => count !== 0)) {
      fail('supervisor-owned Docker resources remain after worker exit');
    }
    return residue;
  }

  async cleanup() {
    const failures = [];
    const containers = [
      this.plan.names.backend,
      this.plan.names.relay,
      this.plan.names.updaterDoctor,
      this.plan.names.updaterContract,
    ];
    for (const name of containers) {
      try {
        if ((await this.#inspect('container', name)).exists) {
          await this.#docker(
            `remove-container-${commandToken(name)}`,
            ['container', 'rm', '--force', name],
          );
        }
        await this.#assertAbsent('container', name);
      } catch (error) {
        failures.push(error);
      }
    }
    try {
      if ((await this.#inspect('network', this.plan.names.network)).exists) {
        await this.#docker(
          `remove-network-${commandToken(this.plan.names.network)}`,
          ['network', 'rm', this.plan.names.network],
        );
      }
      await this.#assertAbsent('network', this.plan.names.network);
    } catch (error) {
      failures.push(error);
    }
    const owned = new Set([...this.pending, ...this.loaded.keys()]);
    for (const image of owned) {
      try {
        const ownedId = this.expected.get(image);
        const inspection = await this.#inspect('image', image, {
          format: '{{.Id}}',
        });
        if (inspection.exists) {
          if (inspection.output !== ownedId) {
            fail(`supervisor-owned image reference changed identity: ${image}`);
          }
          const references = await this.#docker(
            `references-image-${commandToken(image)}`,
            [
              'container',
              'ls',
              '--all',
              '--quiet',
              '--no-trunc',
              '--filter',
              `ancestor=${ownedId}`,
            ],
          );
          if (references.stdout.trim() !== '') {
            fail(
              `supervisor-owned image has a foreign container reference: ${image}`,
            );
          }
          await this.#docker(
            `remove-image-${commandToken(image)}`,
            ['image', 'rm', image],
          );
        }
        await this.#assertAbsent('image', image);
        this.pending.delete(image);
      } catch (error) {
        failures.push(error);
      }
    }
    let residue;
    try {
      residue = await this.#residue();
      if (Object.values(residue).some((count) => count !== 0)) {
        failures.push(
          new SupervisorRuntimeOwnershipError(
            'supervisor-owned Docker identity remains after cleanup',
          ),
        );
      }
    } catch (error) {
      failures.push(error);
      residue = Object.freeze({
        containers: 1,
        images: 1,
        networks: 1,
      });
    }
    return Object.freeze({
      failures: Object.freeze(
        failures.map((error) =>
          error instanceof Error ? error.message : String(error),
        ),
      ),
      facts: this.facts(),
      residue,
    });
  }
}
