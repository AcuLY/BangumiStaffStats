import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const common = new URL('../../bin/lib/common.sh', import.meta.url).pathname;
const transaction = new URL(
  '../../bin/lib/transaction.sh',
  import.meta.url,
).pathname;

function digest(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function executable(file, source) {
  fs.writeFileSync(file, source, { mode: 0o700 });
}

function fixture(mode) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'bgmss-updater-wrapper-actions-'),
  );
  const commands = path.join(root, 'commands');
  fs.mkdirSync(commands, { mode: 0o700 });
  fs.mkdirSync(path.join(root, 'compose'), { mode: 0o700 });
  fs.writeFileSync(path.join(root, 'compose', 'compose.yaml'), 'services: {}\n');
  fs.writeFileSync(path.join(root, 'release.env'), 'APP_VERSION=v1.0.0\n');
  const pointer = path.join(root, 'current.json');
  fs.writeFileSync(pointer, '{"pointerSchemaVersion":1}\n');

  executable(
    path.join(commands, 'timeout'),
    `#!/usr/bin/env bash
set -Eeuo pipefail
[[ "$1" == "--signal=TERM" ]]
[[ "$2" == "--kill-after=30s" ]]
[[ "$3" == "21000" ]]
printf 'timeout:%s\\n' "$*" >> "$TRACE_FILE"
shift 3
[[ "$UPDATER_TEST_MODE" != "timeout" ]] || exit 124
exec "$@"
`,
  );
  executable(
    path.join(commands, 'nice'),
    `#!/usr/bin/env bash
set -Eeuo pipefail
[[ "$1" == "-n" && "$2" == "10" ]]
shift 2
exec "$@"
`,
  );
  executable(
    path.join(commands, 'ionice'),
    `#!/usr/bin/env bash
set -Eeuo pipefail
[[ "$1" == "-c" && "$2" == "2" && "$3" == "-n" && "$4" == "7" ]]
shift 4
exec "$@"
`,
  );
  executable(
    path.join(commands, 'docker'),
    `#!/usr/bin/env bash
set -Eeuo pipefail
expected=(
  compose
  --project-name bgmss_ops_validation
  --file "$OPS_TEST_ROOT/compose/compose.yaml"
  --env-file "$OPS_TEST_ROOT/release.env"
  --profile oneshot
  run --rm --no-deps updater
)
actual=("$@")
[[ "$#" -eq "\${#expected[@]}" ]]
for index in "\${!expected[@]}"; do
  [[ "\${actual[$index]}" == "\${expected[$index]}" ]]
done
printf 'docker:%s\\n' "$*" >> "$TRACE_FILE"
printf '%s\\n' '{"event":"update_no_change","status":"no-change"}'
`,
  );

  return {
    commands,
    mode,
    output: path.join(root, 'updater.log'),
    pointer,
    root,
    trace: path.join(root, 'trace.log'),
  };
}

function invoke(value) {
  const before = digest(value.pointer);
  const harness = `
set -Eeuo pipefail
source "$1"
source "$2"
OPS_ROOT="$3"
OPS_PROJECT="bgmss_ops_validation"
FAKE_COMMAND_DIR="$4"
ops_command() {
  printf '%s/%s\\n' "$FAKE_COMMAND_DIR" "$1"
}
ops_stat_value() {
  [[ "$1" == "%s" ]]
  wc -c < "$2" | tr -d ' '
}
set +e
ops_run_updater "$5" "$3/release.env"
status="$?"
set -e
printf '%s\\n' "$status"
`;
  const result = spawnSync(
    '/bin/bash',
    [
      '-c',
      harness,
      'updater-wrapper-actions',
      common,
      transaction,
      value.root,
      value.commands,
      value.output,
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        OPS_TEST_ROOT: value.root,
        TRACE_FILE: value.trace,
        UPDATER_TEST_MODE: value.mode,
      },
      timeout: 5_000,
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(digest(value.pointer), before);
  return Number.parseInt(result.stdout.trim(), 10);
}

test('Actions exercises the production updater wrapper no-change path', (t) => {
  const value = fixture('no-change');
  t.after(() => fs.rmSync(value.root, { force: true, recursive: true }));

  assert.equal(invoke(value), 0);
  assert.match(fs.readFileSync(value.output, 'utf8'), /update_no_change/u);
  const trace = fs.readFileSync(value.trace, 'utf8');
  assert.match(trace, /--signal=TERM --kill-after=30s 21000/u);
  assert.match(
    trace,
    /docker:compose --project-name bgmss_ops_validation .* run --rm --no-deps updater/u,
  );
});

test('Actions exercises the production updater wrapper timeout path', (t) => {
  const value = fixture('timeout');
  t.after(() => fs.rmSync(value.root, { force: true, recursive: true }));

  assert.equal(invoke(value), 124);
  assert.equal(fs.readFileSync(value.output, 'utf8'), '');
  const trace = fs.readFileSync(value.trace, 'utf8');
  assert.match(trace, /--signal=TERM --kill-after=30s 21000/u);
  assert.doesNotMatch(trace, /docker:/u);
});
