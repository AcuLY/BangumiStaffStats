import assert from 'node:assert/strict';
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const OPERATIONS = path.resolve(import.meta.dirname, '..', '..');
const DATA_VERSION = `dv1-${'1'.repeat(64)}`;
const RUN_ID = `run-${'2'.repeat(32)}`;
const SHELL_HARNESS = String.raw`
source "$OPS_TEST_OPERATIONS/bin/lib/common.sh"
source "$OPS_TEST_OPERATIONS/bin/lib/health.sh"
source "$OPS_TEST_OPERATIONS/bin/lib/transaction.sh"

OPS_ROOT="$OPS_TEST_ROOT"
OPS_PROJECT="bgmss_runtime_behavior"
OPS_PORT="19090"
OPS_PROFILE="validation"
OPS_COMMAND_DIR="/usr/bin"
export OPS_ROOT OPS_PROJECT OPS_PORT OPS_PROFILE OPS_COMMAND_DIR

ops_load_release_env() {
  OPS_RELEASE_ENV=(
    [BGMSS_APP_REVISION]="${'${OPS_TEST_REVISION}'}"
    [BGMSS_APP_VERSION]="v1.0.0"
    [BGMSS_RELEASE_ROOT]="${'${OPS_ROOT}'}/releases/v1.0.0"
  )
}
ops_manifest_value() {
  printf '%s\n' "sha256:${'${OPS_TEST_DIGEST}'}"
}
ops_verify_data_inventory() {
  return 0
}
ops_read_current_field() {
  printf '%s\n' "$OPS_TEST_DATA_VERSION"
}
ops_readlink_frontend() {
  printf '%s\n' "releases/v1.0.0/frontend"
}
ops_current_api_identity() {
  /usr/bin/tr -d '\n' < "${'${OPS_ROOT}'}/api.identity"
}
ops_wait_healthy() {
  [[ "$1" == "$OPS_TEST_DATA_VERSION" ]]
}
ops_run_updater() {
  : > "$1"
  if [[ "$OPS_TEST_SCENARIO" == "no-change" ]]; then
    return 0
  fi
  return 124
}
ops_updater_status() {
  if [[ "$1" == "status" && "$OPS_TEST_SCENARIO" == "no-change" ]]; then
    printf '%s\n' "no-change"
    return 0
  fi
  return 1
}
ops_log_result() {
  printf '{"action":"%s","event":"operation_terminal","status":"%s"}\n' \
    "$1" "$3"
}
ops_emit_failure() {
  printf '{"code":"%s","event":"operation_failed","phase":"%s"}\n' \
    "$1" "$2" >&2
}
ops_record_manual_recovery() {
  printf '{"event":"manual_recovery_required"}\n' >&2
}
ops_emit_update_activated() {
  printf '{"event":"update_activated"}\n'
}

set +e
ops_update_archive "$OPS_TEST_RUN_ID"
result=$?
set -e
printf 'RESULT=%s\n' "$result"
printf 'TX=%s\n' "$OPS_TRANSACTION_ACTIVE"
exit "$result"
`;

function capture(candidate) {
  const information = lstatSync(candidate);
  return {
    bytes: information.isFile()
      ? readFileSync(candidate).toString('base64')
      : null,
    device: String(information.dev),
    gid: information.gid,
    inode: String(information.ino),
    links: information.nlink,
    mode: information.mode & 0o777,
    size: information.size,
    type: information.isDirectory() ? 'directory' : 'file',
    uid: information.uid,
  };
}

function captureTree(root, relative = '') {
  const candidate = relative === '' ? root : path.join(root, relative);
  const result = [[relative || '.', capture(candidate)]];
  if (lstatSync(candidate).isDirectory()) {
    for (const name of readdirSync(candidate).sort()) {
      const child = relative === '' ? name : `${relative}/${name}`;
      result.push(...captureTree(root, child));
    }
  }
  return result;
}

function prepareRoot() {
  const root = realpathSync(
    mkdtempSync(path.join(tmpdir(), 'bgmss-update-behavior-')),
  );
  for (const relative of [
    'compose',
    'data',
    `data/versions/${DATA_VERSION}`,
    'recovery',
    'releases/v1.0.0/frontend',
  ]) {
    mkdirSync(path.join(root, relative), { recursive: true });
  }
  writeFileSync(
    path.join(root, 'compose/release.env'),
    'fixed release environment\n',
  );
  writeFileSync(
    path.join(root, 'data/current.json'),
    `${JSON.stringify({
      dataVersion: DATA_VERSION,
      manifestDigest: `sha256:${'3'.repeat(64)}`,
      pointerSchemaVersion: 1,
    })}\n`,
  );
  writeFileSync(
    path.join(root, `data/versions/${DATA_VERSION}/archive.sqlite3`),
    'immutable archive bytes\n',
  );
  writeFileSync(
    path.join(root, `data/versions/${DATA_VERSION}/manifest.json`),
    '{"immutable":true}\n',
  );
  writeFileSync(path.join(root, 'api.identity'), 'api-container-fixed\n');
  return root;
}

function runScenario(scenario) {
  const root = prepareRoot();
  const watched = {
    api: capture(path.join(root, 'api.identity')),
    current: capture(path.join(root, 'data/current.json')),
    release: capture(path.join(root, 'compose/release.env')),
    versions: captureTree(path.join(root, 'data/versions')),
  };
  const recoveryBefore = readdirSync(path.join(root, 'recovery')).sort();
  const result = spawnSync(
    'bash',
    ['--noprofile', '--norc', '-c', SHELL_HARNESS],
    {
      encoding: 'utf8',
      env: {
        LANG: 'C.UTF-8',
        LC_ALL: 'C.UTF-8',
        OPS_TEST_DATA_VERSION: DATA_VERSION,
        OPS_TEST_DIGEST: '4'.repeat(64),
        OPS_TEST_OPERATIONS: OPERATIONS,
        OPS_TEST_REVISION: '5'.repeat(40),
        OPS_TEST_ROOT: root,
        OPS_TEST_RUN_ID: RUN_ID,
        OPS_TEST_SCENARIO: scenario,
        PATH: '/usr/bin:/bin',
        TZ: 'UTC',
      },
    },
  );
  const after = {
    api: capture(path.join(root, 'api.identity')),
    current: capture(path.join(root, 'data/current.json')),
    release: capture(path.join(root, 'compose/release.env')),
    versions: captureTree(path.join(root, 'data/versions')),
  };
  const recoveryAfter = readdirSync(path.join(root, 'recovery')).sort();
  return {
    cleanup() {
      rmSync(root, { force: true, recursive: true });
    },
    recoveryAfter,
    recoveryBefore,
    result,
    watched,
    after,
  };
}

test('real update transaction keeps identities on no-change', () => {
  const scenario = runScenario('no-change');
  try {
    assert.equal(scenario.result.status, 0, scenario.result.stderr);
    assert.deepEqual(scenario.after, scenario.watched);
    assert.deepEqual(scenario.recoveryAfter, scenario.recoveryBefore);
    assert.match(scenario.result.stdout, /"event":"operation_terminal"/u);
    assert.match(scenario.result.stdout, /"status":"no-change"/u);
    assert.match(scenario.result.stdout, /^RESULT=0$/mu);
    assert.match(scenario.result.stdout, /^TX=no$/mu);
    assert.doesNotMatch(
      `${scenario.result.stdout}\n${scenario.result.stderr}`,
      /update_activated/u,
    );
  } finally {
    scenario.cleanup();
  }
});

test('real update transaction keeps identities when the updater times out', () => {
  const scenario = runScenario('timeout');
  try {
    assert.equal(scenario.result.status, 1);
    assert.deepEqual(scenario.after, scenario.watched);
    assert.deepEqual(scenario.recoveryAfter, scenario.recoveryBefore);
    assert.match(scenario.result.stderr, /"code":"UPDATER_FAILED"/u);
    assert.match(scenario.result.stdout, /^RESULT=1$/mu);
    assert.match(scenario.result.stdout, /^TX=no$/mu);
    assert.doesNotMatch(
      `${scenario.result.stdout}\n${scenario.result.stderr}`,
      /update_activated/u,
    );
    assert.doesNotMatch(scenario.result.stderr, /manual_recovery_required/u);
  } finally {
    scenario.cleanup();
  }
});
