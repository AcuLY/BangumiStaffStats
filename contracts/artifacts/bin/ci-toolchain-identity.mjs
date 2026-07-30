#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

import { parseJsonStrict } from '../lib/strict-json.mjs';

export const EXPECTED_TOOLCHAIN = Object.freeze({
  buildkitImage:
    'docker.io/moby/buildkit:v0.27.1@sha256:' +
    '1e110c71d389d6d24f67b9438e2f7b8da749a6ff407b22a1631e025c95599368',
  buildkitVersion: '0.27.1',
  buildxVersion: '0.34.1',
  goVersion: '1.26.5',
  nodeVersion: '24.18.0',
  npmVersion: '11.16.0',
  uvVersion: '0.11.32',
});

const MAX_COMMAND_OUTPUT_BYTES = 4 * 1024 * 1024;
const COMMAND_TIMEOUT_MS = 30_000;

export class CiToolchainIdentityError extends Error {}

function fail(message) {
  throw new CiToolchainIdentityError(message);
}

function exactSingleLine(source, label) {
  if (
    typeof source !== 'string' ||
    source.length === 0 ||
    source.length > MAX_COMMAND_OUTPUT_BYTES ||
    source.includes('\0')
  ) {
    fail(`${label} must be bounded text`);
  }
  const lines = source.split(/\r?\n/u);
  if (lines.at(-1) === '') lines.pop();
  if (
    lines.length !== 1 ||
    lines[0] === '' ||
    lines[0] !== lines[0].trim()
  ) {
    fail(`${label} must contain exactly one unannotated identity line`);
  }
  return lines[0];
}

function exactSemanticVersion(actual, expected, label) {
  if (actual !== expected) {
    fail(`${label} must equal ${expected}, received ${actual}`);
  }
  return actual;
}

export function parseNodeVersion(source) {
  const line = exactSingleLine(source, 'Node identity');
  const match = line.match(/^v([0-9]+\.[0-9]+\.[0-9]+)$/u);
  if (!match) fail('Node identity does not use the documented version grammar');
  return exactSemanticVersion(
    match[1],
    EXPECTED_TOOLCHAIN.nodeVersion,
    'Node version',
  );
}

export function parseNpmVersion(source) {
  const line = exactSingleLine(source, 'npm identity');
  if (!/^[0-9]+\.[0-9]+\.[0-9]+$/u.test(line)) {
    fail('npm identity does not use the documented semantic version grammar');
  }
  return exactSemanticVersion(
    line,
    EXPECTED_TOOLCHAIN.npmVersion,
    'npm version',
  );
}

export function parseGoVersion(source) {
  const line = exactSingleLine(source, 'Go identity');
  const match = line.match(
    /^go version go([0-9]+\.[0-9]+\.[0-9]+) ([A-Za-z0-9._-]+\/[A-Za-z0-9._-]+)$/u,
  );
  if (!match) fail('Go identity does not use the documented version grammar');
  exactSemanticVersion(
    match[1],
    EXPECTED_TOOLCHAIN.goVersion,
    'Go version',
  );
  return Object.freeze({
    target: match[2],
    version: match[1],
  });
}

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be one JSON object`);
  }
  return value;
}

export function parseUvVersionJson(source) {
  if (
    typeof source !== 'string' ||
    source.length === 0 ||
    source.length > MAX_COMMAND_OUTPUT_BYTES ||
    source.includes('\0')
  ) {
    fail('uv version JSON must be bounded text');
  }
  let value;
  try {
    value = parseJsonStrict(source, 'uv version JSON');
  } catch (error) {
    fail(`uv version JSON is malformed: ${error.message}`);
  }
  record(value, 'uv version JSON');
  if (value.package_name !== 'uv') {
    fail(`uv package_name must equal uv, received ${String(value.package_name)}`);
  }
  if (typeof value.version !== 'string') {
    fail('uv version must be one semantic version string');
  }
  exactSemanticVersion(
    value.version,
    EXPECTED_TOOLCHAIN.uvVersion,
    'uv version',
  );
  if (
    Object.hasOwn(value, 'target_triple') &&
    (typeof value.target_triple !== 'string' || value.target_triple === '')
  ) {
    fail('uv target_triple must be informational text when present');
  }
  if (
    Object.hasOwn(value, 'commit_info') &&
    value.commit_info !== null &&
    (!value.commit_info ||
      typeof value.commit_info !== 'object' ||
      Array.isArray(value.commit_info))
  ) {
    fail('uv commit_info must be an informational object or null');
  }
  return Object.freeze({
    packageName: value.package_name,
    targetTriple: value.target_triple ?? null,
    version: value.version,
  });
}

export function parseBuildxVersion(source) {
  const line = exactSingleLine(source, 'Buildx identity');
  const match = line.match(
    /^github\.com\/docker\/buildx v([0-9]+\.[0-9]+\.[0-9]+)(?: [\x21-\x7e](?:[\x20-\x7e]*[\x21-\x7e])?)?$/u,
  );
  if (!match) {
    fail('Buildx identity does not use the documented version grammar');
  }
  return exactSemanticVersion(
    match[1],
    EXPECTED_TOOLCHAIN.buildxVersion,
    'Buildx version',
  );
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function buildxRecords(source) {
  if (
    typeof source !== 'string' ||
    source.length === 0 ||
    source.length > MAX_COMMAND_OUTPUT_BYTES ||
    source.includes('\0')
  ) {
    fail('Buildx builder evidence must be bounded JSON lines');
  }
  const lines = source.split(/\r?\n/u);
  if (lines.at(-1) === '') lines.pop();
  if (lines.length === 0 || lines.some((line) => line.trim() === '')) {
    fail('Buildx builder evidence contains an empty record');
  }
  return lines.map((line, index) => {
    try {
      return record(
        parseJsonStrict(line, `Buildx builder record ${index}`),
        `Buildx builder record ${index}`,
      );
    } catch (error) {
      if (error instanceof CiToolchainIdentityError) throw error;
      fail(`Buildx builder record ${index} is malformed: ${error.message}`);
    }
  });
}

function nonemptyText(value, label) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 256 ||
    value.includes('\0')
  ) {
    fail(`${label} must be bounded text`);
  }
  return value;
}

export function parseBuildxState(source) {
  const current = new Map();
  for (const builder of buildxRecords(source)) {
    if (builder.Current !== true) continue;
    const name = nonemptyText(builder.Name, 'current Buildx builder name');
    const identity = stableJson(builder);
    const previous = current.get(name);
    if (previous && previous.identity !== identity) {
      fail(`current Buildx builder ${name} has conflicting records`);
    }
    current.set(name, { builder, identity });
  }
  if (current.size !== 1) {
    fail(
      `Buildx evidence must contain exactly one current builder, received ${current.size}`,
    );
  }
  const [{ builder }] = current.values();
  if (builder.Driver !== 'docker-container') {
    fail(
      `current Buildx builder driver must equal docker-container, received ` +
        `${String(builder.Driver)}`,
    );
  }
  if (!Array.isArray(builder.Nodes) || builder.Nodes.length === 0) {
    fail('current Buildx builder must contain at least one node');
  }
  const nodes = [];
  const nodeNames = new Set();
  for (const [index, nodeValue] of builder.Nodes.entries()) {
    const node = record(nodeValue, `current Buildx node ${index}`);
    const name = nonemptyText(node.Name, `current Buildx node ${index} name`);
    if (nodeNames.has(name)) {
      fail(`current Buildx builder contains duplicate node ${name}`);
    }
    nodeNames.add(name);
    if (node.Status !== 'running') {
      fail(`current Buildx node ${name} is not running`);
    }
    if (node.Version !== `v${EXPECTED_TOOLCHAIN.buildkitVersion}`) {
      fail(
        `BuildKit version must equal v${EXPECTED_TOOLCHAIN.buildkitVersion}, ` +
          `received ${String(node.Version)}`,
      );
    }
    const driverOptions = record(
      node.DriverOpts,
      `current Buildx node ${name} DriverOpts`,
    );
    if (driverOptions.image !== EXPECTED_TOOLCHAIN.buildkitImage) {
      fail(
        `BuildKit image must equal ${EXPECTED_TOOLCHAIN.buildkitImage}, ` +
          `received ${String(driverOptions.image)}`,
      );
    }
    if (
      !Array.isArray(node.Platforms) ||
      node.Platforms.length === 0 ||
      node.Platforms.some(
        (platform) =>
          typeof platform !== 'string' ||
          platform.length === 0 ||
          platform.length > 256 ||
          platform.includes('\0'),
      )
    ) {
      fail(`current Buildx node ${name} has a malformed platform inventory`);
    }
    if (!node.Platforms.includes('linux/amd64')) {
      fail(`current Buildx node ${name} does not advertise linux/amd64`);
    }
    nodes.push(Object.freeze({
      image: driverOptions.image,
      name,
      platforms: Object.freeze([...node.Platforms]),
      status: node.Status,
      version: EXPECTED_TOOLCHAIN.buildkitVersion,
    }));
  }
  return Object.freeze({
    driver: builder.Driver,
    name: builder.Name,
    nodes: Object.freeze(nodes),
  });
}

function executeFixedCommand(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: process.env,
    maxBuffer: MAX_COMMAND_OUTPUT_BYTES,
    shell: false,
    timeout: COMMAND_TIMEOUT_MS,
  });
  if (
    result.error ||
    result.signal !== null ||
    result.status !== 0 ||
    typeof result.stdout !== 'string' ||
    typeof result.stderr !== 'string' ||
    result.stderr !== ''
  ) {
    fail(`toolchain command failed closed: ${command} ${args.join(' ')}`);
  }
  return result.stdout;
}

export function collectToolchainIdentity({
  nodeVersion = process.version,
  execute = executeFixedCommand,
} = {}) {
  if (typeof execute !== 'function') {
    fail('toolchain command collector must be one function');
  }
  const node = parseNodeVersion(nodeVersion);
  const npm = parseNpmVersion(execute('npm', ['--version']));
  const go = parseGoVersion(execute('go', ['version']));
  const uv = parseUvVersionJson(
    execute('uv', ['self', 'version', '--output-format', 'json']),
  );
  const buildx = parseBuildxVersion(
    execute('docker', ['buildx', 'version']),
  );
  const builder = parseBuildxState(
    execute('docker', ['buildx', 'ls', '--format', '{{json .}}']),
  );
  return Object.freeze({
    builder,
    buildx,
    go,
    node,
    npm,
    uv,
  });
}

function main(argv) {
  if (argv.length !== 0) fail('usage: ci-toolchain-identity.mjs');
  const identity = collectToolchainIdentity();
  process.stdout.write(
    `CI toolchain identity accepted: ${JSON.stringify(identity)}\n`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(import.meta.filename)
) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`CI toolchain identity error: ${error.message}\n`);
    process.exitCode = 1;
  }
}
