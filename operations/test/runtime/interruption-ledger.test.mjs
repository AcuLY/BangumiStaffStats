import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const OPERATIONS = path.resolve(import.meta.dirname, '..', '..');
const RUN_ID = `run-${'7'.repeat(32)}`;

const COMMON_HARNESS = String.raw`
source "$OPS_TEST_OPERATIONS/bin/lib/common.sh"
source "$OPS_TEST_OPERATIONS/bin/lib/controller.sh"
source "$OPS_TEST_OPERATIONS/bin/lib/health.sh"
source "$OPS_TEST_OPERATIONS/bin/lib/transaction.sh"

OPS_ROOT="$OPS_TEST_ROOT"
OPS_PROJECT="bgmss_runtime_ledger"
OPS_PORT="19090"
OPS_PROFILE="validation"
OPS_COMMAND_DIR="/usr/bin"
export OPS_ROOT OPS_PROJECT OPS_PORT OPS_PROFILE OPS_COMMAND_DIR

ops_emit_failure() {
  printf 'FAILURE=%s:%s\n' "$1" "$2" >&2
}

ops_stat_value() {
  local format="$1"
  local candidate="$2"
  local value
  if [[ "$OPS_TEST_FORCE_ZERO_MODE" == yes &&
        ( "$candidate" == "$OPS_ROOT/compose/updater-current-deny" ||
          "$candidate" == "$OPS_ROOT/data/current.json" ||
          "$candidate" == "$OPS_ROOT/data/foreign-current" ) ]]; then
    case "$format" in
      '%a')
        printf '%s\n' 0
        return 0
        ;;
      '%u:%g:%a')
        printf '%s\n' '0:0:0'
        return 0
        ;;
      '%u:%g:%h:%a')
        value="$(/usr/bin/stat -Lc '%h' -- "$candidate")" || return
        printf '0:0:%s:0\n' "$value"
        return 0
        ;;
    esac
  fi
  case "$format" in
    '%u')
      printf '%s\n' 0
      ;;
    '%g')
      printf '%s\n' 0
      ;;
    '%u:%g')
      printf '%s\n' '0:0'
      ;;
    '%u:%g:%a')
      value="$(/usr/bin/stat -Lc '%a' -- "$candidate")" || return
      printf '0:0:%s\n' "$value"
      ;;
    '%u:%g:%h')
      value="$(/usr/bin/stat -Lc '%h' -- "$candidate")" || return
      printf '0:0:%s\n' "$value"
      ;;
    '%u:%g:%h:%a')
      value="$(/usr/bin/stat -Lc '%h:%a' -- "$candidate")" || return
      printf '0:0:%s\n' "$value"
      ;;
    *)
      /usr/bin/stat -Lc "$format" -- "$candidate"
      ;;
  esac
}

ops_lstat_value() {
  if [[ "$1" == '%u:%g' ]]; then
    printf '%s\n' '0:0'
  else
    /usr/bin/stat -c "$1" -- "$2"
  fi
}
`;

function runHarness(root, body, extraEnvironment = {}) {
  return spawnSync(
    'bash',
    ['--noprofile', '--norc', '-c', `${COMMON_HARNESS}\n${body}`],
    {
      encoding: 'utf8',
      env: {
        LANG: 'C.UTF-8',
        LC_ALL: 'C.UTF-8',
        OPS_TEST_OPERATIONS: OPERATIONS,
        OPS_TEST_FORCE_ZERO_MODE: 'no',
        OPS_TEST_ROOT: root,
        PATH: '/usr/bin:/bin',
        TZ: 'UTC',
        ...extraEnvironment,
      },
    },
  );
}

function makeRoot(prefix) {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

function writeExecutable(candidate, source) {
  writeFileSync(candidate, source);
  chmodSync(candidate, 0o755);
}

test('creation guards close fresh-mask, acquisition-root, and bootstrap-stage signal windows', async (t) => {
  await t.test('fresh current mask is recorded before TERM compensation', () => {
    const root = makeRoot('bgmss-fresh-signal-');
    try {
      mkdirSync(path.join(root, 'compose'), { recursive: true });
      mkdirSync(path.join(root, 'data'), { recursive: true });
      mkdirSync(path.join(root, 'recovery'), { recursive: true });
      const source = path.join(root, 'compose', 'updater-current-deny');
      writeFileSync(source, '');
      chmodSync(source, 0o600);
      const result = runHarness(
        root,
        String.raw`
ops_atomic_replace_file() {
  /usr/bin/install -m 600 -- "$1" "$2" || return
  /usr/bin/kill -TERM "$$"
}
ops_require_strict_fresh_archive_state() {
  [[ ! -e "$OPS_ROOT/data/current.json" &&
     ! -L "$OPS_ROOT/data/current.json" ]]
}
ops_install_transaction_traps
ops_transaction_arm install "$OPS_TEST_RUN_ID" fresh
ops_create_fresh_current_mask
exit 99
`,
        {
          OPS_TEST_FORCE_ZERO_MODE: 'yes',
          OPS_TEST_RUN_ID: RUN_ID,
        },
      );
      assert.equal(result.status, 143, result.stderr);
      assert.equal(existsSync(path.join(root, 'data', 'current.json')), false);
      assert.match(result.stderr, /TRANSACTION_INTERRUPTED/u);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  await t.test('acquisition root is sealed before deferred TERM runs', () => {
    const root = makeRoot('bgmss-acquisition-signal-');
    const signalMkdir = path.join(root, 'signal-mkdir.sh');
    writeExecutable(
      signalMkdir,
      String.raw`#!/usr/bin/env bash
set -euo pipefail
/usr/bin/mkdir "$@"
/usr/bin/kill -TERM "$OPS_TEST_SIGNAL_PID"
`,
    );
    try {
      mkdirSync(path.join(root, 'recovery'), { recursive: true });
      mkdirSync(path.join(root, 'releases'), { recursive: true });
      const result = runHarness(
        root,
        String.raw`
ops_command() {
  if [[ "$1" == mkdir ]]; then
    printf '%s\n' "$OPS_TEST_SIGNAL_MKDIR"
  else
    printf '/usr/bin/%s\n' "$1"
  fi
}
ops_install_transaction_traps
ops_transaction_arm install "$OPS_TEST_RUN_ID" acquisition
OPS_TEST_SIGNAL_PID="$$"
export OPS_TEST_SIGNAL_PID
ops_acquire_release \
  v1.0.0 "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
  "$OPS_TEST_RUN_ID"
exit 99
`,
        {
          OPS_TEST_RUN_ID: RUN_ID,
          OPS_TEST_SIGNAL_MKDIR: signalMkdir,
        },
      );
      assert.equal(result.status, 143, result.stderr);
      assert.equal(
        existsSync(path.join(root, 'recovery', `.acquire-${RUN_ID}`)),
        false,
      );
      assert.match(result.stderr, /TRANSACTION_INTERRUPTED/u);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  await t.test('bootstrap stage is registered before deferred TERM cleanup', () => {
    const root = makeRoot('bgmss-bootstrap-signal-');
    const stageParent = path.join(root, 'stages');
    const signalMktemp = path.join(root, 'signal-mktemp.sh');
    mkdirSync(stageParent);
    writeExecutable(
      signalMktemp,
      String.raw`#!/usr/bin/env bash
set -euo pipefail
/usr/bin/mktemp "$@"
/usr/bin/kill -TERM "$OPS_TEST_SIGNAL_PID"
`,
    );
    try {
      const result = runHarness(
        path.join(root, 'production-root'),
        String.raw`
ops_bootstrap_stage_template() {
  printf '%s\n' "$OPS_TEST_STAGE_PARENT/.bgmss-v2-stage.XXXXXXXX"
}
ops_bootstrap_stage_path_valid() {
  case "$1" in
    "$OPS_TEST_STAGE_PARENT"/.bgmss-v2-stage.????????) return 0 ;;
    *) return 1 ;;
  esac
}
ops_command() {
  if [[ "$1" == mktemp ]]; then
    printf '%s\n' "$OPS_TEST_SIGNAL_MKTEMP"
  else
    printf '/usr/bin/%s\n' "$1"
  fi
}
ops_install_transaction_traps
OPS_TEST_SIGNAL_PID="$$"
export OPS_TEST_SIGNAL_PID
ops_create_bootstrap_stage stage
exit 99
`,
        {
          OPS_TEST_SIGNAL_MKTEMP: signalMktemp,
          OPS_TEST_STAGE_PARENT: stageParent,
        },
      );
      assert.equal(result.status, 143, result.stderr);
      assert.deepEqual(readdirSync(stageParent), []);
      assert.equal(existsSync(path.join(root, 'production-root')), false);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});

test('registered temporary cleanup preserves replaced inodes and changed sealed bytes', () => {
  const root = makeRoot('bgmss-temporary-ledger-');
  try {
    mkdirSync(path.join(root, 'recovery'), { recursive: true });
    const result = runHarness(
      root,
      String.raw`
ops_make_temporary_file replaced \
  "$OPS_ROOT/recovery/.registered-replaced.XXXXXXXX"
printf '%s\n' original > "$replaced"
ops_register_temporary_path "$replaced" sealed
printf '%s\n' foreign > "$OPS_ROOT/recovery/foreign-replacement"
/usr/bin/mv -f -- "$OPS_ROOT/recovery/foreign-replacement" "$replaced"
set +e
ops_cleanup_temporary_paths "$replaced"
replaced_status=$?
set -e

ops_make_temporary_file changed \
  "$OPS_ROOT/recovery/.registered-changed.XXXXXXXX"
printf '%s\n' original > "$changed"
ops_register_temporary_path "$changed" sealed
printf '%s\n' changed > "$changed"
set +e
ops_cleanup_temporary_paths "$changed"
changed_status=$?
set -e

printf 'REPLACED=%s\n' "$replaced"
printf 'CHANGED=%s\n' "$changed"
printf 'RESULT=%s:%s\n' "$replaced_status" "$changed_status"
[[ "$replaced_status" -eq 78 && "$changed_status" -eq 78 ]]
`,
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^RESULT=78:78$/mu);
    const replaced = /^REPLACED=(.+)$/mu.exec(result.stdout)?.[1];
    const changed = /^CHANGED=(.+)$/mu.exec(result.stdout)?.[1];
    assert.ok(replaced);
    assert.ok(changed);
    assert.equal(readFileSync(replaced, 'utf8'), 'foreign\n');
    assert.equal(readFileSync(changed, 'utf8'), 'changed\n');
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('tracked refs preserve same-value foreign replacement identities', async (t) => {
  await t.test('same-byte file on a new inode is preserved', () => {
    const root = makeRoot('bgmss-ref-file-');
    try {
      mkdirSync(path.join(root, 'compose'), { recursive: true });
      mkdirSync(path.join(root, 'recovery'), { recursive: true });
      const result = runHarness(
        root,
        String.raw`
source_file="$OPS_ROOT/recovery/source"
destination="$OPS_ROOT/compose/ref"
printf '%s\n' same > "$source_file"
/usr/bin/chmod 600 "$source_file"
ops_transaction_ref_capture app-environment "$destination" file 600
ops_transaction_publish_tracked_file app-environment "$source_file"
printf '%s\n' same > "$OPS_ROOT/recovery/foreign"
/usr/bin/chmod 600 "$OPS_ROOT/recovery/foreign"
/usr/bin/mv -Tf -- "$OPS_ROOT/recovery/foreign" "$destination"
set +e
ops_transaction_remove_tracked_ref app-environment
status=$?
set -e
printf 'RESULT=%s\n' "$status"
[[ "$status" -eq 78 && "$(/usr/bin/cat "$destination")" == same ]]
`,
      );
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /^RESULT=78$/mu);
      assert.equal(readFileSync(path.join(root, 'compose', 'ref'), 'utf8'), 'same\n');
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  await t.test('same-target symlink on a new inode is preserved', () => {
    const root = makeRoot('bgmss-ref-symlink-');
    try {
      mkdirSync(path.join(root, 'recovery'), { recursive: true });
      mkdirSync(path.join(root, 'releases', 'v1.0.0', 'frontend'), {
        recursive: true,
      });
      const result = runHarness(
        root,
        String.raw`
destination="$OPS_ROOT/current-frontend"
target="releases/v1.0.0/frontend"
ops_transaction_ref_capture app-frontend "$destination" symlink
ops_transaction_publish_tracked_symlink app-frontend "$target"
/usr/bin/ln -s -- "$target" "$OPS_ROOT/foreign-frontend"
/usr/bin/mv -Tf -- "$OPS_ROOT/foreign-frontend" "$destination"
set +e
ops_transaction_remove_tracked_ref app-frontend
status=$?
set -e
printf 'RESULT=%s\n' "$status"
[[ "$status" -eq 78 &&
   "$(/usr/bin/readlink -- "$destination")" == "$target" ]]
`,
      );
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /^RESULT=78$/mu);
      assert.equal(
        readlinkSync(path.join(root, 'current-frontend')),
        'releases/v1.0.0/frontend',
      );
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});

test('fresh final current publication is sealed before deferred TERM compensation', () => {
  const root = makeRoot('bgmss-fresh-final-signal-');
  try {
    mkdirSync(path.join(root, 'compose'), { recursive: true });
    mkdirSync(path.join(root, 'data'), { recursive: true });
    mkdirSync(path.join(root, 'recovery'), { recursive: true });
    const source = path.join(root, 'recovery', 'current-candidate');
    writeFileSync(source, '{"pointerSchemaVersion":1}\n');
    chmodSync(source, 0o600);
    const result = runHarness(
      root,
      String.raw`
ops_atomic_replace_file() {
  /usr/bin/install -m "$3" -- "$1" "$2" || return
  /usr/bin/kill -TERM "$$"
}
ops_require_strict_fresh_archive_state() {
  [[ ! -e "$OPS_ROOT/data/current.json" &&
     ! -L "$OPS_ROOT/data/current.json" ]]
}
ops_install_transaction_traps
ops_transaction_arm install "$OPS_TEST_RUN_ID" fresh
OPS_FRESH_MASK_STATE=absent
ops_publish_fresh_current "$OPS_ROOT/recovery/current-candidate"
exit 99
`,
      {
        OPS_TEST_RUN_ID: RUN_ID,
      },
    );
    assert.equal(result.status, 143, result.stderr);
    assert.equal(existsSync(path.join(root, 'data', 'current.json')), false);
    assert.match(result.stderr, /TRANSACTION_INTERRUPTED/u);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('secondary publication is sealed before deferred TERM compensation', () => {
  const root = makeRoot('bgmss-secondary-signal-');
  try {
    mkdirSync(path.join(root, 'data'), { recursive: true });
    mkdirSync(path.join(root, 'recovery'), { recursive: true });
    const source = path.join(root, 'recovery', 'previous-candidate');
    writeFileSync(source, 'previous\n');
    chmodSync(source, 0o600);
    const result = runHarness(
      root,
      String.raw`
ops_atomic_replace_file() {
  /usr/bin/install -m "$3" -- "$1" "$2" || return
  /usr/bin/kill -TERM "$$"
}
ops_transaction_compensate() {
  ops_transaction_restore_secondary
}
ops_install_transaction_traps
ops_transaction_arm update "$OPS_TEST_RUN_ID" data
ops_transaction_capture_secondary \
  "$OPS_ROOT/data/previous.json" \
  "$OPS_ROOT/recovery/.previous-before.XXXXXXXX" \
  600
ops_transaction_publish_tracked_file \
  secondary "$OPS_ROOT/recovery/previous-candidate"
exit 99
`,
      {
        OPS_TEST_RUN_ID: RUN_ID,
      },
    );
    assert.equal(result.status, 143, result.stderr);
    assert.equal(existsSync(path.join(root, 'data', 'previous.json')), false);
    assert.match(result.stderr, /TRANSACTION_INTERRUPTED/u);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('rollback evidence publication is sealed before deferred TERM compensation', () => {
  const root = makeRoot('bgmss-evidence-signal-');
  try {
    mkdirSync(path.join(root, 'recovery'), { recursive: true });
    const source = path.join(root, 'recovery', 'evidence-candidate');
    writeFileSync(source, '{"status":"succeeded"}\n');
    chmodSync(source, 0o600);
    const result = runHarness(
      root,
      String.raw`
ops_atomic_replace_file() {
  /usr/bin/install -m "$3" -- "$1" "$2" || return
  /usr/bin/kill -TERM "$$"
}
ops_transaction_compensate() {
  ops_transaction_restore_evidence
}
ops_install_transaction_traps
ops_transaction_arm rollback-data "$OPS_TEST_RUN_ID" data
ops_transaction_capture_evidence
ops_transaction_publish_tracked_file \
  evidence "$OPS_ROOT/recovery/evidence-candidate"
exit 99
`,
      {
        OPS_TEST_RUN_ID: RUN_ID,
      },
    );
    assert.equal(result.status, 143, result.stderr);
    assert.equal(
      existsSync(path.join(root, 'recovery', 'rollback-exercised.json')),
      false,
    );
    assert.match(result.stderr, /TRANSACTION_INTERRUPTED/u);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('same-label updater container is collision evidence, never a cleanup target', () => {
  const root = makeRoot('bgmss-updater-collision-');
  try {
    mkdirSync(path.join(root, 'recovery'), { recursive: true });
    const docker = path.join(root, 'fake-docker.sh');
    const log = path.join(root, 'docker.log');
    writeExecutable(
      docker,
      String.raw`#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$OPS_TEST_DOCKER_LOG"
if [[ "$*" == *"ps -aq"* &&
      "$*" == *"com.docker.compose.service=updater"* ]]; then
  printf '%064d\n' 0
fi
`,
    );
    const output = path.join(root, 'recovery', 'output');
    writeFileSync(output, '');
    chmodSync(output, 0o600);
    const result = runHarness(
      root,
      String.raw`
ops_command() {
  if [[ "$1" == docker ]]; then
    printf '%s\n' "$OPS_TEST_DOCKER"
  else
    printf '/usr/bin/%s\n' "$1"
  fi
}
ops_load_release_env() {
  OPS_RELEASE_ENV=(
    [BGMSS_APP_VERSION]=v1.0.0
    [BGMSS_COMMON_COMMIT]=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    [BGMSS_RELEASE_ROOT]="$OPS_ROOT/releases/v1.0.0"
    [BGMSS_UPDATER_IMAGE]=example.invalid/updater@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  )
}
OPS_TRANSACTION_RUN_ID="$OPS_TEST_RUN_ID"
set +e
ops_run_updater \
  "$OPS_ROOT/recovery/output" "$OPS_ROOT/recovery/environment" \
  "$OPS_TEST_RUN_ID"
status=$?
set -e
printf 'RESULT=%s\n' "$status"
[[ "$status" -eq 78 ]]
`,
      {
        OPS_TEST_DOCKER: docker,
        OPS_TEST_DOCKER_LOG: log,
        OPS_TEST_RUN_ID: RUN_ID,
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^RESULT=78$/mu);
    const commands = readFileSync(log, 'utf8');
    assert.match(commands, /ps -aq/u);
    assert.doesNotMatch(
      commands,
      /(?:^|\n)(?:stop|rm)\s|(?:^|\n)compose .*\srun\s/u,
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('health temporary cleanup covers partial creation and preserves replacements', async (t) => {
  await t.test('partial creation failure cleans every previously registered path', () => {
    const root = makeRoot('bgmss-health-partial-');
    try {
      const result = runHarness(
        root,
        String.raw`
ops_load_release_env() {
  return 0
}
ops_command() {
  printf '%s\n' /usr/bin/true
}
make_count=0
ops_make_temporary_file() {
  make_count=$((make_count + 1))
  if [[ "$make_count" -eq 4 ]]; then
    return 73
  fi
  printf -v "$1" '/registered/%s' "$1"
}
ops_cleanup_registered_temporary_path() {
  printf 'CLEAN=%s\n' "$1"
}
set +e
ops_health_once v1 "$OPS_ROOT/release.env"
status=$?
set -e
printf 'RESULT=%s\n' "$status"
[[ "$status" -eq 73 ]]
`,
      );
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(
        result.stdout.match(/^CLEAN=.+$/gmu),
        [
          'CLEAN=/registered/ready',
          'CLEAN=/registered/metrics',
          'CLEAN=/registered/catalog',
        ],
      );
      assert.match(result.stdout, /^RESULT=73$/mu);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  await t.test('normal cleanup removes exact peers but preserves a replacement', () => {
    const root = makeRoot('bgmss-health-replaced-');
    try {
      mkdirSync(path.join(root, 'recovery'), { recursive: true });
      const result = runHarness(
        root,
        String.raw`
ops_make_temporary_file ready "$OPS_ROOT/recovery/.ready.XXXXXXXX"
ops_make_temporary_file metrics "$OPS_ROOT/recovery/.metrics.XXXXXXXX"
ops_make_temporary_file catalog "$OPS_ROOT/recovery/.catalog.XXXXXXXX"
ops_make_temporary_file query "$OPS_ROOT/recovery/.query.XXXXXXXX"
ops_make_temporary_file query_response \
  "$OPS_ROOT/recovery/.query-response.XXXXXXXX"
replaced="$catalog"
printf '%s\n' foreign > "$OPS_ROOT/recovery/foreign"
/usr/bin/mv -f -- "$OPS_ROOT/recovery/foreign" "$replaced"
set +e
ops_cleanup_health_temporaries \
  "$ready" "$metrics" "$catalog" "$query" "$query_response"
status=$?
set -e
printf 'REPLACED=%s\n' "$replaced"
printf 'RESULT=%s\n' "$status"
[[ "$status" -eq 78 && -f "$replaced" ]]
`,
      );
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /^RESULT=78$/mu);
      const replaced = /^REPLACED=(.+)$/mu.exec(result.stdout)?.[1];
      assert.ok(replaced);
      assert.equal(readFileSync(replaced, 'utf8'), 'foreign\n');
      assert.deepEqual(readdirSync(path.join(root, 'recovery')), [
        path.basename(replaced),
      ]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});

test('registered temporary symlink cleanup preserves a replaced target', () => {
  const root = makeRoot('bgmss-symlink-ledger-');
  try {
    const link = path.join(root, 'current-frontend.bgmss-new');
    const result = runHarness(
      root,
      String.raw`
link="$OPS_ROOT/current-frontend.bgmss-new"
/usr/bin/ln -s -- releases/v1.0.0/frontend "$link"
ops_register_temporary_symlink "$link"
/usr/bin/unlink -- "$link"
/usr/bin/ln -s -- releases/v2.0.0/frontend "$link"
set +e
ops_cleanup_registered_temporary_symlink "$link"
status=$?
set -e
printf 'RESULT=%s\n' "$status"
[[ "$status" -eq 78 && -L "$link" ]]
`,
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^RESULT=78$/mu);
    assert.equal(readlinkSync(link), 'releases/v2.0.0/frontend');
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('fresh-mask cleanup preserves a foreign inode at the registered path', () => {
  const root = makeRoot('bgmss-fresh-ledger-');
  try {
    mkdirSync(path.join(root, 'data'), { recursive: true });
    mkdirSync(path.join(root, 'recovery'), { recursive: true });
    const current = path.join(root, 'data', 'current.json');
    writeFileSync(current, 'registered\n');
    chmodSync(current, 0o600);
    const result = runHarness(
      root,
      String.raw`
current="$OPS_ROOT/data/current.json"
OPS_FRESH_MASK_DEVICE="$(ops_stat_value '%d' "$current")"
OPS_FRESH_MASK_INODE="$(ops_stat_value '%i' "$current")"
OPS_FRESH_MASK_DIGEST="$(ops_sha256_file "$current")"
OPS_FRESH_MASK_STATE=recorded
printf '%s\n' foreign > "$OPS_ROOT/data/foreign-current"
/usr/bin/mv -f -- "$OPS_ROOT/data/foreign-current" "$current"
set +e
ops_remove_fresh_current_mask
status=$?
set -e
printf 'RESULT=%s\n' "$status"
[[ "$status" -eq 78 && -f "$current" ]]
`,
      { OPS_TEST_FORCE_ZERO_MODE: 'yes' },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^RESULT=78$/mu);
    chmodSync(current, 0o600);
    assert.equal(readFileSync(current, 'utf8'), 'foreign\n');
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('acquisition and bootstrap ledgers preserve foreign insertions', async (t) => {
  await t.test('acquisition tree refuses sealing and cleanup after a pre-seal insertion', () => {
    const root = makeRoot('bgmss-acquisition-ledger-');
    const acquisition = path.join(root, 'recovery', `.acquire-${RUN_ID}`);
    try {
      mkdirSync(path.dirname(acquisition), { recursive: true, mode: 0o700 });
      const result = runHarness(
        root,
        String.raw`
acquisition="$OPS_ROOT/recovery/.acquire-$OPS_TEST_RUN_ID"
OPS_TRANSACTION_ACQUISITION_ROOT="$acquisition"
OPS_TRANSACTION_ACQUISITION_STATE=creating
ops_acquisition_intent "$acquisition" directory
/usr/bin/mkdir -m 700 "$acquisition"
ops_record_acquisition_object "$acquisition"
OPS_TRANSACTION_ACQUISITION_STATE=recorded
owned="$acquisition/owned"
ops_acquisition_intent "$owned" file
printf '%s\n' owned > "$owned"
/usr/bin/chmod 600 "$owned"
ops_record_acquisition_object "$owned" closed
printf '%s\n' foreign > "$acquisition/foreign"
set +e
ops_seal_acquisition_tree
seal_status=$?
ops_cleanup_acquisition_root \
  "$acquisition" \
  "$OPS_TRANSACTION_ACQUISITION_DEVICE" \
  "$OPS_TRANSACTION_ACQUISITION_INODE"
status=$?
set -e
printf 'RESULT=%s:%s\n' "$seal_status" "$status"
[[ "$seal_status" -eq 78 &&
   "$status" -eq 78 &&
   -f "$acquisition/foreign" ]]
`,
        { OPS_TEST_RUN_ID: RUN_ID },
      );
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /^RESULT=78:78$/mu);
      assert.equal(readFileSync(path.join(acquisition, 'foreign'), 'utf8'), 'foreign\n');
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  await t.test('bootstrap stage refuses cleanup after an insertion', () => {
    const root = makeRoot('bgmss-bootstrap-ledger-');
    const stage = path.join(root, '.bgmss-v2-stage.12345678');
    mkdirSync(stage, { mode: 0o700 });
    try {
      const result = runHarness(
        path.join(root, 'production-root'),
        String.raw`
OPS_BOOTSTRAP_STAGE_PATH="$OPS_TEST_STAGE"
OPS_BOOTSTRAP_STAGE_STATE=creating
ops_register_bootstrap_object "$OPS_BOOTSTRAP_STAGE_PATH"
/usr/bin/mkdir "$OPS_BOOTSTRAP_STAGE_PATH/bin"
printf '%s\n' foreign > "$OPS_BOOTSTRAP_STAGE_PATH/bin/owner"
set +e
ops_install_bootstrap_directory \
  "$OPS_BOOTSTRAP_STAGE_PATH/bin" 0755 0 0
create_status=$?
ops_cleanup_registered_bootstrap_stage
status=$?
set -e
printf 'RESULT=%s:%s\n' "$create_status" "$status"
[[ "$create_status" -eq 78 &&
   "$status" -eq 78 &&
   -f "$OPS_BOOTSTRAP_STAGE_PATH/bin/owner" ]]
`,
        { OPS_TEST_STAGE: stage },
      );
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /^RESULT=78:78$/mu);
      assert.equal(
        readFileSync(path.join(stage, 'bin', 'owner'), 'utf8'),
        'foreign\n',
      );
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
