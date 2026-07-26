import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';

import {
  CiToolchainIdentityError,
  EXPECTED_TOOLCHAIN,
  collectToolchainIdentity,
  parseBuildxState,
  parseBuildxVersion,
  parseGoVersion,
  parseNodeVersion,
  parseNpmVersion,
  parseUvVersionJson,
} from '../bin/ci-toolchain-identity.mjs';

const VALID_NODE = Object.freeze({
  DriverOpts: {
    image: EXPECTED_TOOLCHAIN.buildkitImage,
  },
  Name: 'ci-builder0',
  Platforms: ['linux/amd64', 'linux/arm64'],
  Status: 'running',
  Version: `v${EXPECTED_TOOLCHAIN.buildkitVersion}`,
});

function builder(overrides = {}) {
  return {
    Current: true,
    Driver: 'docker-container',
    Name: 'ci-builder',
    Nodes: [{ ...VALID_NODE, DriverOpts: { ...VALID_NODE.DriverOpts } }],
    ...overrides,
  };
}

function builderEvidence(...records) {
  return `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
}

function rejects(parser, source, pattern) {
  assert.throws(
    () => parser(source),
    (error) =>
      error instanceof CiToolchainIdentityError && pattern.test(error.message),
  );
}

test('pure version parsers admit the exact semantic tool identities', () => {
  assert.equal(parseNodeVersion('v24.18.0\n'), '24.18.0');
  assert.equal(parseNpmVersion('11.16.0\r\n'), '11.16.0');
  assert.deepEqual(parseGoVersion('go version go1.26.5 linux/amd64\n'), {
    target: 'linux/amd64',
    version: '1.26.5',
  });
  assert.equal(
    parseBuildxVersion(
      'github.com/docker/buildx v0.34.1 Homebrew release build\n',
    ),
    '0.34.1',
  );
});

test('plain-text version parsers reject malformed, wrong, or ambiguous evidence', () => {
  for (const [parser, source, pattern] of [
    [parseNodeVersion, '24.18.0\n', /grammar/],
    [parseNodeVersion, 'v24.18.0 (release)\n', /grammar/],
    [parseNodeVersion, 'v24.18.0\nv24.18.0\n', /exactly one/],
    [parseNodeVersion, 'v24.18.1\n', /must equal 24\.18\.0/],
    [parseNpmVersion, 'npm 11.16.0\n', /grammar/],
    [parseNpmVersion, '11.16.1\n', /must equal 11\.16\.0/],
    [parseGoVersion, 'go1.26.5\n', /grammar/],
    [parseGoVersion, 'go version go1.26.4 linux/amd64\n', /must equal 1\.26\.5/],
    [parseGoVersion, 'go version go1.26.5\n', /grammar/],
    [parseBuildxVersion, 'docker buildx v0.34.1\n', /grammar/],
    [
      parseBuildxVersion,
      'github.com/docker/buildx v0.34.0 release\n',
      /must equal 0\.34\.1/,
    ],
    [
      parseBuildxVersion,
      'github.com/docker/buildx v0.34.1\nsecond identity\n',
      /exactly one/,
    ],
  ]) {
    rejects(parser, source, pattern);
  }
});

test('uv JSON admits semantic identity with informational build metadata', () => {
  assert.deepEqual(
    parseUvVersionJson(
      JSON.stringify({
        package_name: 'uv',
        version: '0.11.32',
        commit_info: {
          short_commit_hash: '3010295ae',
          commit_hash: '3010295ae7ff572de459987ad70db315a62ecd61',
          commit_date: '2026-07-23',
          last_tag: null,
          commits_since_last_tag: 0,
        },
        target_triple: 'x86_64-unknown-linux-gnu',
      }),
    ),
    {
      packageName: 'uv',
      targetTriple: 'x86_64-unknown-linux-gnu',
      version: '0.11.32',
    },
  );
});

test('uv parser rejects human presentation, malformed, ambiguous, and wrong identity', () => {
  for (const [source, pattern] of [
    ['', /bounded text/],
    ['uv 0.11.32 (3010295ae 2026-07-23)\n', /malformed/],
    ['{"package_name":"uv"', /malformed/],
    [
      '{"package_name":"uv","version":"0.11.32","version":"0.11.31"}',
      /duplicate object key/,
    ],
    ['{"package_name":"uvx","version":"0.11.32"}', /package_name/],
    ['{"package_name":"uv","version":"0.11.31"}', /must equal 0\.11\.32/],
    ['{"package_name":"uv"}', /semantic version string/],
    [
      '{"package_name":"uv","version":"0.11.32","target_triple":""}',
      /target_triple/,
    ],
    [
      '{"package_name":"uv","version":"0.11.32","commit_info":"unknown"}',
      /commit_info/,
    ],
  ]) {
    rejects(parseUvVersionJson, source, pattern);
  }
});

test('Buildx state admits identical formatter duplicates for one current builder', () => {
  const accepted = builder();
  const equivalent = {
    Nodes: accepted.Nodes.map((node) => ({
      Version: node.Version,
      Status: node.Status,
      Platforms: [...node.Platforms],
      Name: node.Name,
      DriverOpts: { ...node.DriverOpts },
    })),
    Name: accepted.Name,
    Driver: accepted.Driver,
    Current: accepted.Current,
  };
  assert.deepEqual(
    parseBuildxState(
      builderEvidence(
        accepted,
        equivalent,
        {
          Current: false,
          Driver: 'docker',
          Name: 'default',
          Nodes: [],
        },
      ),
    ),
    {
      driver: 'docker-container',
      name: 'ci-builder',
      nodes: [
        {
          image: EXPECTED_TOOLCHAIN.buildkitImage,
          name: 'ci-builder0',
          platforms: ['linux/amd64', 'linux/arm64'],
          status: 'running',
          version: '0.27.1',
        },
      ],
    },
  );
});

test('Buildx state rejects malformed or ambiguous current-builder evidence', () => {
  const second = builder({ Name: 'other-builder' });
  const conflicting = builder({
    Nodes: [{ ...VALID_NODE, Status: 'stopped' }],
  });
  for (const [source, pattern] of [
    ['not json\n', /malformed/],
    ['{}\n\n', /empty record/],
    [builderEvidence({ ...builder(), Current: false }), /exactly one current/],
    [builderEvidence(builder(), second), /exactly one current/],
    [builderEvidence(builder(), conflicting), /conflicting records/],
    [builderEvidence(builder({ Name: '' })), /name must be bounded text/],
  ]) {
    rejects(parseBuildxState, source, pattern);
  }
});

test('Buildx state rejects unsafe driver, node, BuildKit, image, and platform evidence', () => {
  const cases = [
    [builder({ Driver: 'docker' }), /driver must equal docker-container/],
    [builder({ Nodes: [] }), /at least one node/],
    [builder({ Nodes: [null] }), /must be one JSON object/],
    [
      builder({
        Nodes: [
          { ...VALID_NODE },
          { ...VALID_NODE, DriverOpts: { ...VALID_NODE.DriverOpts } },
        ],
      }),
      /duplicate node/,
    ],
    [builder({ Nodes: [{ ...VALID_NODE, Status: 'stopped' }] }), /not running/],
    [
      builder({ Nodes: [{ ...VALID_NODE, Version: 'v0.27.0' }] }),
      /BuildKit version/,
    ],
    [
      builder({ Nodes: [{ ...VALID_NODE, DriverOpts: undefined }] }),
      /DriverOpts must be one JSON object/,
    ],
    [
      builder({ Nodes: [{ ...VALID_NODE, DriverOpts: { image: 'latest' } }] }),
      /BuildKit image/,
    ],
    [
      builder({ Nodes: [{ ...VALID_NODE, Platforms: ['linux/arm64'] }] }),
      /does not advertise linux\/amd64/,
    ],
    [
      builder({ Nodes: [{ ...VALID_NODE, Platforms: ['linux/amd64', null] }] }),
      /malformed platform inventory/,
    ],
  ];
  for (const [record, pattern] of cases) {
    rejects(parseBuildxState, builderEvidence(record), pattern);
  }
});

test('collector executes only the fixed commands and feeds every pure parser', () => {
  const calls = [];
  const outputs = new Map([
    ['npm\u0000--version', '11.16.0\n'],
    ['go\u0000version', 'go version go1.26.5 linux/amd64\n'],
    [
      'uv\u0000self\u0000version\u0000--output-format\u0000json',
      '{"package_name":"uv","version":"0.11.32","target_triple":"x86_64-unknown-linux-gnu"}\n',
    ],
    [
      'docker\u0000buildx\u0000version',
      'github.com/docker/buildx v0.34.1 release\n',
    ],
    [
      "docker\u0000buildx\u0000ls\u0000--format\u0000{{json .}}",
      builderEvidence(builder()),
    ],
  ]);
  const result = collectToolchainIdentity({
    nodeVersion: 'v24.18.0',
    execute(command, args) {
      const key = [command, ...args].join('\0');
      calls.push([command, args]);
      assert.ok(outputs.has(key), `unexpected command ${key}`);
      return outputs.get(key);
    },
  });

  assert.deepEqual(calls, [
    ['npm', ['--version']],
    ['go', ['version']],
    ['uv', ['self', 'version', '--output-format', 'json']],
    ['docker', ['buildx', 'version']],
    ['docker', ['buildx', 'ls', '--format', '{{json .}}']],
  ]);
  assert.equal(result.node, '24.18.0');
  assert.equal(result.npm, '11.16.0');
  assert.equal(result.go.version, '1.26.5');
  assert.equal(result.uv.version, '0.11.32');
  assert.equal(result.buildx, '0.34.1');
  assert.equal(result.builder.nodes[0].version, '0.27.1');
});

test('CLI rejects arguments before collecting host evidence', () => {
  const script = path.resolve(
    import.meta.dirname,
    '..',
    'bin',
    'ci-toolchain-identity.mjs',
  );
  const result = spawnSync(process.execPath, [script, 'unexpected'], {
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /usage: ci-toolchain-identity\.mjs/);
});
