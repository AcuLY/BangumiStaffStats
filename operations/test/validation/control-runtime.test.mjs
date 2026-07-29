import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertExactOperationsControlNpmArguments,
  assertExactOperationsControlRuntime,
  assertOperationsControlManifest,
  createClosedOperationsControlEnvironment,
  OPERATIONS_CONTROL_ENVIRONMENT,
  OPERATIONS_CONTROL_SCRIPT_SHELL,
  OperationsControlRuntimeError,
  prepareOperationsControlLaunch,
} from '../../validation/control-runtime.mjs';

const OPERATIONS_ROOT = path.resolve(import.meta.dirname, '..', '..');
const REPOSITORY_ROOT = path.dirname(OPERATIONS_ROOT);
const PREFLIGHT_LIFECYCLE_SCRIPT =
  '"$BGMSS_OPS_TOOL_DIR/node" --import ./validation/control-runtime-preload.mjs validation/preflight-myserver.mjs';

function fixture() {
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), 'bgmss-control-runtime-')),
  );
  const toolDirectory = path.join(root, 'bin');
  const npmRoot = path.join(root, 'lib', 'node_modules', 'npm');
  const npmBin = path.join(npmRoot, 'bin');
  fs.mkdirSync(toolDirectory, { recursive: true });
  fs.mkdirSync(npmBin, { recursive: true });
  const node = path.join(toolDirectory, 'node');
  const npmExecutable = path.join(npmBin, 'npm-cli.js');
  fs.writeFileSync(node, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  fs.writeFileSync(npmExecutable, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  fs.writeFileSync(
    path.join(npmRoot, 'package.json'),
    JSON.stringify({
      bin: { npm: 'bin/npm-cli.js' },
      name: 'npm',
      version: '11.16.0',
    }),
  );
  fs.symlinkSync(
    '../lib/node_modules/npm/bin/npm-cli.js',
    path.join(toolDirectory, 'npm'),
  );
  const environment = {
    BGMSS_OPS_CONTROL_ENVIRONMENT: OPERATIONS_CONTROL_ENVIRONMENT,
    BGMSS_OPS_TOOL_DIR: toolDirectory,
    NODE: node,
    npm_command: 'run-script',
    npm_config_globalconfig: '/dev/null',
    npm_config_ignore_scripts: 'true',
    npm_config_node_options: '',
    npm_config_npm_version: '11.16.0',
    npm_config_script_shell: OPERATIONS_CONTROL_SCRIPT_SHELL,
    npm_config_userconfig: '/dev/null',
    npm_execpath: npmExecutable,
    npm_lifecycle_event: 'preflight:myserver',
    npm_lifecycle_script: PREFLIGHT_LIFECYCLE_SCRIPT,
    npm_node_execpath: node,
  };
  return {
    cleanup: () => fs.rmSync(root, { force: true, recursive: true }),
    environment,
    launchEnvironment: {
      BGMSS_OPS_CONTROL_ENVIRONMENT: OPERATIONS_CONTROL_ENVIRONMENT,
      BGMSS_OPS_GH: node,
      BGMSS_OPS_TOOL_DIR: toolDirectory,
      HOME: root,
    },
    node,
    npmExecutable,
    root,
    toolDirectory,
  };
}

function assertFixture(value, overrides = {}) {
  return assertExactOperationsControlRuntime({
    cwd: OPERATIONS_ROOT,
    environment: value.environment,
    execArgv: [
      '--import',
      './validation/control-runtime-preload.mjs',
    ],
    execPath: value.node,
    expectedLifecycleEvent: 'preflight:myserver',
    nodeVersion: '24.18.0',
    probeNpmVersion: () => '11.16.0',
    ...overrides,
  });
}

test('remote control admits only one exact tool-directory Node/npm pair', () => {
  const value = fixture();
  try {
    assert.deepEqual(assertFixture(value), {
      nodeVersion: '24.18.0',
      npmVersion: '11.16.0',
      toolDirectory: value.toolDirectory,
    });

    assert.throws(
      () => assertFixture(value, { nodeVersion: '24.19.0' }),
      OperationsControlRuntimeError,
    );
    assert.throws(
      () =>
        assertFixture(value, {
          probeNpmVersion: () => '11.17.0',
        }),
      OperationsControlRuntimeError,
    );
    assert.throws(
      () =>
        assertFixture(value, {
          environment: {
            ...value.environment,
            npm_config_ignore_scripts: 'false',
          },
        }),
      OperationsControlRuntimeError,
    );
    assert.throws(
      () =>
        assertFixture(value, {
          execArgv: [
            '--loader',
            path.join(value.root, 'foreign-loader.mjs'),
            '--import',
            './validation/control-runtime-preload.mjs',
          ],
        }),
      OperationsControlRuntimeError,
    );
    assert.throws(
      () =>
        assertFixture(value, {
          environment: {
            ...value.environment,
            NODE_OPTIONS: '--import=/tmp/foreign-preload.mjs',
          },
        }),
      OperationsControlRuntimeError,
    );
    assert.throws(
      () =>
        assertFixture(value, {
          environment: {
            ...value.environment,
            npm_config_script_shell: '/bin/sh',
          },
        }),
      OperationsControlRuntimeError,
    );

    const wrongLifecycle = {
      ...value.environment,
      npm_lifecycle_event: 'validate:myserver',
    };
    assert.throws(
      () => assertFixture(value, { environment: wrongLifecycle }),
      OperationsControlRuntimeError,
    );

    const foreignNpm = path.join(
      path.dirname(value.toolDirectory),
      'foreign-npm-cli.js',
    );
    fs.writeFileSync(foreignNpm, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    const wrongNpm = {
      ...value.environment,
      npm_execpath: foreignNpm,
    };
    assert.throws(
      () => assertFixture(value, { environment: wrongNpm }),
      OperationsControlRuntimeError,
    );

    const foreignNode = path.join(value.root, 'foreign-node');
    fs.writeFileSync(foreignNode, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    assert.throws(
      () => assertFixture(value, { execPath: foreignNode }),
      OperationsControlRuntimeError,
    );

    const hardlinkNode = path.join(value.root, 'hardlink-node');
    fs.linkSync(value.node, hardlinkNode);
    assert.throws(
      () => assertFixture(value),
      OperationsControlRuntimeError,
    );
    fs.unlinkSync(hardlinkNode);

    const externalNode = path.join(value.root, 'external-node');
    fs.renameSync(value.node, externalNode);
    fs.symlinkSync(externalNode, value.node);
    assert.throws(
      () => assertFixture(value, { execPath: externalNode }),
      OperationsControlRuntimeError,
    );
  } finally {
    value.cleanup();
  }
});

test('control launcher fixes exact npm --ignore-scripts run argv and rejects drift', () => {
  const value = fixture();
  const lifecycleArguments = [
    '--candidate',
    '/tmp/accepted-candidate',
    '--workflow-run-id',
    '123',
  ];
  try {
    const launch = prepareOperationsControlLaunch({
      argv: ['preflight:myserver', ...lifecycleArguments],
      environment: value.launchEnvironment,
      execArgv: [],
      execPath: value.node,
      nodeVersion: '24.18.0',
      probeNpmVersion: () => '11.16.0',
    });
    const expected = [
      value.npmExecutable,
      '--silent',
      '--userconfig=/dev/null',
      '--globalconfig=/dev/null',
      '--script-shell=/bin/bash',
      '--node-options=',
      '--prefix',
      OPERATIONS_ROOT,
      '--ignore-scripts',
      'run',
      'preflight:myserver',
      '--',
      ...lifecycleArguments,
    ];
    assert.deepEqual(launch.args, expected);
    assert.equal(launch.environment.NPM_CONFIG_IGNORE_SCRIPTS, 'true');
    assert.doesNotThrow(() =>
      assertExactOperationsControlNpmArguments(launch.args, {
        lifecycleArguments,
        lifecycleEvent: 'preflight:myserver',
        npmExecutable: value.npmExecutable,
      }),
    );

    const withoutIgnoreScripts = expected.filter(
      (argument) => argument !== '--ignore-scripts',
    );
    const ignoreScriptsAfterRun = [...expected];
    ignoreScriptsAfterRun.splice(
      ignoreScriptsAfterRun.indexOf('--ignore-scripts'),
      1,
    );
    ignoreScriptsAfterRun.splice(
      ignoreScriptsAfterRun.indexOf('run') + 1,
      0,
      '--ignore-scripts',
    );
    const widened = [...expected];
    widened.splice(widened.indexOf('run'), 0, '--if-present');
    const disabled = [...expected];
    disabled[disabled.indexOf('--ignore-scripts')] = '--ignore-scripts=false';
    for (const argumentsValue of [
      withoutIgnoreScripts,
      ignoreScriptsAfterRun,
      widened,
      disabled,
    ]) {
      assert.throws(
        () =>
          assertExactOperationsControlNpmArguments(argumentsValue, {
            lifecycleArguments,
            lifecycleEvent: 'preflight:myserver',
            npmExecutable: value.npmExecutable,
          }),
        OperationsControlRuntimeError,
      );
    }
  } finally {
    value.cleanup();
  }
});

test('control manifest rejects every target pre/post lifecycle hook', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(OPERATIONS_ROOT, 'package.json'), 'utf8'),
  );
  assert.doesNotThrow(() => assertOperationsControlManifest(manifest));
  for (const hook of [
    'prepreflight:myserver',
    'postpreflight:myserver',
    'prevalidate:myserver',
    'postvalidate:myserver',
  ]) {
    const malicious = structuredClone(manifest);
    malicious.scripts[hook] = 'node malicious-hook.mjs';
    assert.throws(
      () => assertOperationsControlManifest(malicious),
      new RegExp(`forbidden lifecycle hook: ${hook}`, 'u'),
    );
  }
});

test('a failed exact npm probe cannot leave repository residue', () => {
  const before = fs.readdirSync(OPERATIONS_ROOT).sort();
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), 'bgmss-control-probe-')),
  );
  try {
    const toolDirectory = path.join(root, 'bin');
    const npmRoot = path.join(root, 'lib', 'node_modules', 'npm');
    const npmBin = path.join(npmRoot, 'bin');
    fs.mkdirSync(toolDirectory, { recursive: true });
    fs.mkdirSync(npmBin, { recursive: true });
    const copiedNode = path.join(toolDirectory, 'node');
    fs.copyFileSync(process.execPath, copiedNode);
    fs.chmodSync(copiedNode, 0o755);
    const npmExecutable = path.join(npmBin, 'npm-cli.js');
    fs.writeFileSync(
      npmExecutable,
      [
        "const fs = require('node:fs');",
        "const path = require('node:path');",
        "fs.writeFileSync(path.join(process.env.HOME, 'probe-residue'), 'x');",
      ].join('\n'),
      { mode: 0o755 },
    );
    fs.writeFileSync(
      path.join(npmRoot, 'package.json'),
      JSON.stringify({
        bin: { npm: 'bin/npm-cli.js' },
        name: 'npm',
        version: '11.16.0',
      }),
    );
    fs.symlinkSync(
      '../lib/node_modules/npm/bin/npm-cli.js',
      path.join(toolDirectory, 'npm'),
    );
    assert.throws(
      () =>
        assertExactOperationsControlRuntime({
          environment: {
            BGMSS_OPS_CONTROL_ENVIRONMENT:
              OPERATIONS_CONTROL_ENVIRONMENT,
            BGMSS_OPS_TOOL_DIR: toolDirectory,
            NODE: copiedNode,
            npm_command: 'run-script',
            npm_config_globalconfig: '/dev/null',
            npm_config_ignore_scripts: 'true',
            npm_config_node_options: '',
            npm_config_npm_version: '11.16.0',
            npm_config_script_shell: OPERATIONS_CONTROL_SCRIPT_SHELL,
            npm_config_userconfig: '/dev/null',
            npm_execpath: npmExecutable,
            npm_lifecycle_event: 'preflight:myserver',
            npm_lifecycle_script: PREFLIGHT_LIFECYCLE_SCRIPT,
            npm_node_execpath: copiedNode,
          },
          cwd: OPERATIONS_ROOT,
          execArgv: [
            '--import',
            './validation/control-runtime-preload.mjs',
          ],
          execPath: copiedNode,
          expectedLifecycleEvent: 'preflight:myserver',
          nodeVersion: '24.18.0',
        }),
      OperationsControlRuntimeError,
    );
    assert.deepEqual(fs.readdirSync(OPERATIONS_ROOT).sort(), before);
    assert.equal(
      fs.existsSync(path.join(OPERATIONS_ROOT, 'probe-residue')),
      false,
    );
  } finally {
    fs.rmSync(root, { force: true, recursive: true });
  }
});

test('control environment rejects every inherited startup injection authority', () => {
  const home = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), 'bgmss-control-home-')),
  );
  const base = {
    BGMSS_OPS_CONTROL_ENVIRONMENT: OPERATIONS_CONTROL_ENVIRONMENT,
    BGMSS_OPS_GH: process.execPath,
    BGMSS_OPS_TOOL_DIR: path.dirname(process.execPath),
    HOME: home,
  };
  try {
    assert.deepEqual(
      Object.keys(createClosedOperationsControlEnvironment(base)).sort(),
      [
        'BGMSS_OPS_CONTROL_ENVIRONMENT',
        'BGMSS_OPS_GH',
        'BGMSS_OPS_TOOL_DIR',
        'GH_HOST',
        'HOME',
        'LANG',
        'LC_ALL',
        'NO_COLOR',
        'NPM_CONFIG_AUDIT',
        'NPM_CONFIG_CACHE',
        'NPM_CONFIG_FUND',
        'NPM_CONFIG_GLOBALCONFIG',
        'NPM_CONFIG_IGNORE_SCRIPTS',
        'NPM_CONFIG_LOGS_DIR',
        'NPM_CONFIG_UPDATE_NOTIFIER',
        'NPM_CONFIG_USERCONFIG',
        'PATH',
        'TZ',
      ],
    );
    for (const name of [
      'NODE_OPTIONS',
      'NODE_PATH',
      'NODE_LOADER',
      'NODE_PRELOAD',
      'BASH_ENV',
      'ENV',
      'KSH_ENV',
      'npm_config_node_options',
      'NPM_CONFIG_SCRIPT_SHELL',
      'npm_config_shell',
      'LD_PRELOAD',
      'LD_AUDIT',
      'DYLD_INSERT_LIBRARIES',
      'DYLD_LIBRARY_PATH',
    ]) {
      assert.throws(
        () =>
          createClosedOperationsControlEnvironment({
            ...base,
            [name]: 'injected-authority',
          }),
        OperationsControlRuntimeError,
        name,
      );
    }
  } finally {
    fs.rmSync(home, { force: true, recursive: true });
  }
});

test('real npm child runs only the selected target when hooks contain markers', () => {
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), 'bgmss-control-hooks-')),
  );
  try {
    const markerProgram = path.join(root, 'write-marker.mjs');
    const beforeMarker = path.join(root, 'before-ran');
    const targetMarker = path.join(root, 'target-ran');
    const afterMarker = path.join(root, 'after-ran');
    fs.writeFileSync(
      markerProgram,
      [
        "import fs from 'node:fs';",
        "if (process.env.npm_config_ignore_scripts !== 'true') process.exit(92);",
        "fs.writeFileSync(process.argv[2], 'ran', { flag: 'wx' });",
        '',
      ].join('\n'),
      'utf8',
    );
    const shellArgument = (value) => `'${value.replaceAll("'", "'\"'\"'")}'`;
    const markerCommand = (marker) =>
      `${shellArgument(process.execPath)} ${shellArgument(markerProgram)} ${shellArgument(marker)}`;
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({
        name: 'bgmss-control-hook-fixture',
        private: true,
        scripts: {
          controlled: markerCommand(targetMarker),
          postcontrolled: markerCommand(afterMarker),
          precontrolled: markerCommand(beforeMarker),
        },
        version: '1.0.0',
      }),
      'utf8',
    );

    const toolDirectory = fs.realpathSync.native(
      path.dirname(process.execPath),
    );
    const npmExecutable = fs.realpathSync.native(
      path.join(
        path.dirname(toolDirectory),
        'lib',
        'node_modules',
        'npm',
        'bin',
        'npm-cli.js',
      ),
    );
    const result = spawnSync(
      process.execPath,
      [
        npmExecutable,
        '--silent',
        '--userconfig=/dev/null',
        '--globalconfig=/dev/null',
        '--script-shell=/bin/bash',
        '--node-options=',
        '--prefix',
        root,
        '--ignore-scripts',
        'run',
        'controlled',
        '--',
      ],
      {
        cwd: REPOSITORY_ROOT,
        encoding: 'utf8',
        env: {
          HOME: root,
          LANG: 'C',
          LC_ALL: 'C',
          NO_COLOR: '1',
          NPM_CONFIG_AUDIT: 'false',
          NPM_CONFIG_CACHE: path.join(root, '.npm-cache'),
          NPM_CONFIG_FUND: 'false',
          NPM_CONFIG_GLOBALCONFIG: '/dev/null',
          NPM_CONFIG_LOGS_DIR: path.join(root, '.npm-logs'),
          NPM_CONFIG_UPDATE_NOTIFIER: 'false',
          NPM_CONFIG_USERCONFIG: '/dev/null',
          PATH: `${toolDirectory}:/usr/bin:/bin`,
          TZ: 'UTC',
        },
        timeout: 60_000,
      },
    );
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(targetMarker), true);
    assert.equal(fs.existsSync(beforeMarker), false);
    assert.equal(fs.existsSync(afterMarker), false);
  } finally {
    fs.rmSync(root, { force: true, recursive: true });
  }
});

test('env-isolated launcher blocks real Node, shell, and npm startup payloads', () => {
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), 'bgmss-control-injection-')),
  );
  try {
    const nodeMarker = path.join(root, 'node-options-ran');
    const shellMarker = path.join(root, 'shell-startup-ran');
    const npmShellMarker = path.join(root, 'npm-script-shell-ran');
    const nodePayload = path.join(root, 'payload.mjs');
    const shellPayload = path.join(root, 'payload.sh');
    const npmShell = path.join(root, 'npm-shell.sh');
    fs.writeFileSync(
      nodePayload,
      `import fs from 'node:fs';\nfs.writeFileSync(${JSON.stringify(nodeMarker)}, 'ran');\n`,
      'utf8',
    );
    fs.writeFileSync(
      shellPayload,
      `#!/bin/sh\nprintf ran > ${JSON.stringify(shellMarker)}\n`,
      { encoding: 'utf8', mode: 0o755 },
    );
    fs.writeFileSync(
      npmShell,
      `#!/bin/sh\nprintf ran > ${JSON.stringify(npmShellMarker)}\nexit 91\n`,
      { encoding: 'utf8', mode: 0o755 },
    );

    const toolDirectory = fs.realpathSync.native(
      path.dirname(process.execPath),
    );
    const launch = spawnSync(
      '/usr/bin/env',
      [
        '-i',
        `BGMSS_OPS_CONTROL_ENVIRONMENT=${OPERATIONS_CONTROL_ENVIRONMENT}`,
        `BGMSS_OPS_GH=${process.execPath}`,
        `BGMSS_OPS_TOOL_DIR=${toolDirectory}`,
        `HOME=${root}`,
        'LANG=C.UTF-8',
        'LC_ALL=C.UTF-8',
        'NO_COLOR=1',
        `PATH=${toolDirectory}:/usr/bin:/bin`,
        'TZ=UTC',
        process.execPath,
        path.join(
          OPERATIONS_ROOT,
          'validation',
          'control-launch.mjs',
        ),
        'preflight:myserver',
      ],
      {
        cwd: REPOSITORY_ROOT,
        encoding: 'utf8',
        env: {
          ...process.env,
          BASH_ENV: shellPayload,
          ENV: shellPayload,
          NODE_OPTIONS: `--import=${nodePayload}`,
          NODE_PATH: root,
          NPM_CONFIG_NODE_OPTIONS: `--import=${nodePayload}`,
          NPM_CONFIG_SCRIPT_SHELL: npmShell,
          npm_config_script_shell: npmShell,
        },
        timeout: 60_000,
      },
    );
    assert.notEqual(launch.status, 0);
    assert.match(
      launch.stderr,
      /downloaded Actions handoff and reviewed workflow run ID are required/u,
    );
    for (const marker of [nodeMarker, shellMarker, npmShellMarker]) {
      assert.equal(fs.existsSync(marker), false, marker);
    }
  } finally {
    fs.rmSync(root, { force: true, recursive: true });
  }
});
