import assert from 'node:assert/strict';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { renderCompose } from '../../compose/render.mjs';

const OPERATIONS = path.resolve(import.meta.dirname, '..', '..');
const read = (relative) =>
  readFileSync(path.join(OPERATIONS, relative), 'utf8');
const mode = (relative) => statSync(path.join(OPERATIONS, relative)).mode & 0o777;

test('controller executable modes generate an exact 0555 manifest contract', () => {
  assert.equal(mode('bin/assemble-controller-package.mjs'), 0o755);
  assert.equal(mode('bin/bgmss-v2-deploy'), 0o755);
  assert.equal(mode('bin/bgmss-ops'), 0o755);

  const definitions = JSON.parse(read('config/controller-files.json'));
  const temporary = mkdtempSync(path.join(tmpdir(), 'bgmss-runtime-test-'));
  const payload = path.join(temporary, 'payload');
  try {
    for (const relative of [definitions.bootstrap, ...definitions.files]) {
      const destination = path.join(payload, relative);
      mkdirSync(path.dirname(destination), { recursive: true });
      if (relative === 'compose/compose.yaml') {
        writeFileSync(destination, renderCompose('production'), {
          mode: 0o644,
        });
      } else {
        const sourceRelative = relative.startsWith(
          'observability/prometheus/',
        )
          ? relative.slice('observability/'.length)
          : relative;
        const source = path.join(OPERATIONS, sourceRelative);
        copyFileSync(source, destination);
        chmodSync(destination, statSync(source).mode & 0o777);
      }
    }
    const result = spawnSync(
      process.execPath,
      [
        path.join(OPERATIONS, 'bin/build-controller-manifest.mjs'),
        '--controller-revision',
        'a'.repeat(40),
        '--payload-root',
        payload,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    const manifest = JSON.parse(result.stdout);
    assert.equal(manifest.bootstrap.path, 'bin/bgmss-v2-deploy');
    assert.equal(manifest.bootstrap.mode, '0555');
    assert.equal(
      manifest.files.find((entry) => entry.path === 'bin/bgmss-ops')?.mode,
      '0555',
    );
    assert.equal(
      manifest.files.find(
        (entry) => entry.path === 'bin/lib/transaction.sh',
      )?.mode,
      '0444',
    );
    assert.equal(
      manifest.files.find(
        (entry) => entry.path === 'compose/updater-current-deny',
      )?.mode,
      '0000',
    );
  } finally {
    rmSync(temporary, { force: true, recursive: true });
  }
});

test('controller authority and global lock precede sourced mutable context', () => {
  const deployment = read('bin/bgmss-v2-deploy');
  const operator = read('bin/bgmss-ops');
  const sudoers = read('config/bgmss-v2-deploy.sudoers');
  const authorizedKey = read(
    'config/bgmss-v2-deploy.authorized-key-options',
  );
  assert.ok(
    deployment.indexOf('flock -n "$BGMSS_BOOTSTRAP_LOCK_FD"') <
      deployment.indexOf(
        'source "${BGMSS_CONTROLLER_PAYLOAD}/bin/lib/common.sh"',
      ),
  );
  assert.ok(
    deployment.indexOf('/usr/bin/jq -cS . "$BGMSS_CONTROLLER_MANIFEST"') <
      deployment.indexOf(
        'source "${BGMSS_CONTROLLER_PAYLOAD}/bin/lib/common.sh"',
      ),
  );
  assert.ok(
    operator.indexOf('/usr/bin/flock -n "$BGMSS_BOOTSTRAP_LOCK_FD"') <
      operator.indexOf('source "${BGMSS_OPS_SCRIPT_DIR}/lib/common.sh"'),
  );
  assert.ok(
    deployment.includes(
      String.raw`--version\ (v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*))`,
    ),
  );
  assert.match(
    deployment,
    /printf '%s\\t%s\\n' "\$requested_version" "\$requested_manifest" \|\n\s+\/usr\/bin\/sudo -n -- "\$BGMSS_DEPLOY_PATH" --sudo-stdin/u,
  );
  assert.match(
    deployment,
    /"\$\{SUDO_USER:-\}" != "bgmss-deploy"[\s\S]*?"\$\{SUDO_COMMAND:-\}" != "\$\{BGMSS_DEPLOY_PATH\} --sudo-stdin"/u,
  );
  assert.doesNotMatch(
    deployment,
    /-n "\$\{SUDO_COMMAND:-\}"[\s\S]{0,100}"\$\{SUDO_COMMAND/u,
  );
  assert.match(
    deployment,
    /split\("\\n"\)[\s\S]*?select\(length == 2 and \.\[1\] == ""\)[\s\S]*?capture\([\s\S]*?@tsv/u,
  );
  assert.match(
    deployment,
    /elif \[\[ "\$\{SUDO_USER:-\}" == "bgmss-deploy" \]\]; then\n\s+exit 69/u,
  );
  assert.doesNotMatch(
    deployment,
    /\/usr\/bin\/sudo -n -- "\$BGMSS_DEPLOY_PATH"[\s\\\n]+--version|eval|sudo -[^\n]*\b(?:env|SETENV)\b/iu,
  );
  assert.equal(
    sudoers,
    [
      'Defaults:bgmss-deploy env_reset, use_pty, !set_home',
      '',
      'Cmnd_Alias BGMSS_V2_DEPLOY = /usr/local/sbin/bgmss-v2-deploy --sudo-stdin',
      '',
      'bgmss-deploy ALL=(root) NOPASSWD: BGMSS_V2_DEPLOY',
      '',
    ].join('\n'),
  );
  assert.doesNotMatch(
    sudoers,
    /SETENV|\/(?:usr\/)?bin\/(?:ba|z|da)?sh|\/bin\/env|!authenticate|\*|\?|\[|\]|\^|\$|\\[.:sS]/iu,
  );
  assert.equal(
    authorizedKey,
    'restrict,command="/usr/local/sbin/bgmss-v2-deploy --ssh-forced-command"\n',
  );
  assert.doesNotMatch(
    authorizedKey,
    /environment=|permitopen=|permitlisten=|pty|agent-forwarding|port-forwarding|user-rc|X11-forwarding/iu,
  );
  assert.match(deployment, /bootstrap_tmp_digests=\("" ""\)/u);
  assert.match(
    deployment,
    /register_bootstrap_tmp_file\(\)[\s\S]*?stat -Lc '%d'[\s\S]*?stat -Lc '%i'[\s\S]*?sha256sum/u,
  );
  assert.match(
    deployment,
    /bootstrap_tmp_file_matches "\$index" \|\| return 78\n\s+\/usr\/bin\/unlink -- "\$candidate"/u,
  );
  assert.match(
    deployment,
    /cleanup_bootstrap_tmp_at_exit\(\)[\s\S]*?trap - EXIT[\s\S]*?exit 78/u,
  );
  assert.doesNotMatch(deployment, /\brm\s+-f\b/u);
});

test('Bash entrypoints and environment sanitizer pass their real preambles', () => {
  for (const relative of ['bin/bgmss-ops', 'bin/bgmss-v2-deploy']) {
    const result = spawnSync(
      'bash',
      ['--noprofile', '--norc', path.join(OPERATIONS, relative)],
      {
        encoding: 'utf8',
        env: { PATH: '/usr/bin:/bin' },
      },
    );
    assert.equal(
      result.status,
      69,
      `${relative} must reach its deliberate installed-path refusal`,
    );
  }
  if (process.platform === 'linux') {
    const sanitizer = spawnSync(
      'bash',
      [
        '--noprofile',
        '--norc',
        '-c',
        [
          'source "$1"',
          'ops_sanitize_process',
          'test -n "$SHELLOPTS"',
          'test "$DOCKER_HOST" = "unix:///var/run/docker.sock"',
          'test "$DOCKER_CONFIG" = "/run/bgmss-docker-config-absent"',
          'test -z "${DOCKER_API_VERSION+x}"',
          'test -z "${DOCKER_AUTH_CONFIG+x}"',
          'test -z "${DOCKER_CERT_PATH+x}"',
          'test -z "${DOCKER_CONTEXT+x}"',
          'test -z "${DOCKER_CUSTOM_HEADERS+x}"',
          'test -z "${DOCKER_DEFAULT_PLATFORM+x}"',
          'test -z "${DOCKER_FUTURE_AUTHORITY+x}"',
          'test -z "${DOCKER_TLS+x}"',
          'test -z "${DOCKER_TLS_VERIFY+x}"',
          'test -z "${COMPOSE_FUTURE_AUTHORITY+x}"',
          'test -z "${COMPOSE_REMOVE_ORPHANS+x}"',
          'test -z "${COMPOSE_STATUS_STDOUT+x}"',
        ].join('; '),
        'runtime-sanitizer-test',
        path.join(OPERATIONS, 'bin/lib/common.sh'),
      ],
      {
        encoding: 'utf8',
        env: {
          COMPOSE_FUTURE_AUTHORITY: 'foreign',
          COMPOSE_REMOVE_ORPHANS: '1',
          COMPOSE_STATUS_STDOUT: '1',
          DOCKER_API_VERSION: '0.1',
          DOCKER_AUTH_CONFIG: '{"auths":{"foreign.invalid":{}}}',
          DOCKER_CERT_PATH: '/tmp/foreign',
          DOCKER_CONFIG: '/tmp/foreign',
          DOCKER_CONTEXT: 'foreign',
          DOCKER_CUSTOM_HEADERS: 'X-Foreign=value',
          DOCKER_DEFAULT_PLATFORM: 'linux/arm64',
          DOCKER_FUTURE_AUTHORITY: 'foreign',
          DOCKER_HOST: 'tcp://foreign.invalid:2376',
          DOCKER_TLS: '1',
          DOCKER_TLS_VERIFY: '1',
          PATH: '/usr/bin:/bin',
        },
      },
    );
    assert.equal(sanitizer.status, 0, sanitizer.stderr);
  }
  for (const source of [
    read('bin/bgmss-ops'),
    read('bin/bgmss-v2-deploy'),
    read('bin/lib/common.sh'),
  ]) {
    assert.doesNotMatch(source, /unset[\s\S]{0,240}\bSHELLOPTS\b/u);
    assert.match(source, /unix:\/\/\/var\/run\/docker[.]sock/u);
    assert.match(source, /\/run\/bgmss-docker-config-absent/u);
    assert.match(source, /export DOCKER_HOST=/u);
    assert.match(source, /export DOCKER_CONFIG=/u);
    assert.match(source, /while IFS= read -r inherited_name/u);
    assert.match(source, /DOCKER_[*] \| COMPOSE_[*]\)/u);
    assert.match(source, /done < <\(compgen -e\)/u);
    assert.match(
      source,
      /! -e "\$(?:OPS|BGMSS)_DOCKER_CONFIG" && ! -L "\$(?:OPS|BGMSS)_DOCKER_CONFIG"/u,
    );
  }
});

test('fresh-root, immutable-data, atomic-ref, and bounded updater policies stay present', () => {
  const controller = read('bin/lib/controller.sh');
  const common = read('bin/lib/common.sh');
  const health = read('bin/lib/health.sh');
  const transaction = read('bin/lib/transaction.sh');
  const compose = read('compose/model.mjs');
  const allShell = [
    controller,
    common,
    transaction,
    read('bin/lib/preflight.sh'),
    read('bin/lib/retention.sh'),
    health,
    read('bin/bgmss-ops'),
    read('bin/bgmss-v2-deploy'),
  ].join('\n');

  assert.match(
    controller,
    /ops_bootstrap_stage_template\(\)[\s\S]*?"\/srv\/\.bgmss-v2-stage\.XXXXXXXX"/u,
  );
  assert.match(controller, /stage="\$\("\$mktemp" -d "\$template"\)"/u);
  assert.match(controller, /"\$mv" -Tn -- "\$stage" "\$OPS_ROOT"/u);
  assert.doesNotMatch(allShell, /\brm\s+-[A-Za-z]*r/u);
  assert.doesNotMatch(controller, /\brm\s+-f\b/u);
  assert.doesNotMatch(common, /\brm\s+-f\b/u);
  assert.doesNotMatch(health, /\brm\s+-f\b/u);
  assert.doesNotMatch(transaction, /\brm\s+-f\b/u);
  assert.match(
    health,
    /ops_cleanup_health_temporaries\(\)[\s\S]*?ops_cleanup_registered_temporary_path "\$temporary"/u,
  );
  assert.match(
    health,
    /ops_make_temporary_file \\\n\s+query_response[\s\S]*?creation_result=\$\?[\s\S]*?ops_cleanup_health_temporaries[\s\S]*?return "\$creation_result"/u,
  );
  assert.match(
    health,
    /ops_cleanup_health_temporaries \\\n\s+"\$ready" "\$metrics" "\$catalog" "\$query" "\$query_response" \|\|[\s\S]*?return "\$OPS_MANUAL_RECOVERY_EXIT"/u,
  );
  assert.match(transaction, /ops_creation_guard_begin/u);
  assert.match(transaction, /ops_register_temporary_path/u);
  assert.match(transaction, /TEMPORARY_IDENTITY_CHANGED/u);
  assert.match(transaction, /OPS_TRANSACTION_TEMP_DIGESTS/u);
  assert.match(transaction, /TEMPORARY_SYMLINK_IDENTITY_CHANGED/u);
  assert.match(transaction, /OPS_TRANSACTION_TEMP_SYMLINK_TARGETS/u);
  assert.match(transaction, /ACQUISITION_FOREIGN_OBJECT_PRESERVED/u);
  assert.match(controller, /BOOTSTRAP_FOREIGN_OBJECT_PRESERVED/u);
  assert.doesNotMatch(controller, /ops_bootstrap_stage_path_allowed/u);
  assert.match(controller, /"\$mkdir" -m "\$mode" -- "\$destination"/u);
  assert.match(controller, /set -o noclobber; : > "\$destination"/u);
  assert.match(transaction, /"\$chown" \\\n\s+"\$\{OPS_ROOT_UID\}:\$\{OPS_RUNTIME_GID\}"/u);
  assert.match(transaction, /"\$chmod" 0550 "\$directory"/u);
  assert.match(transaction, /"\$chmod" 0440 \\/u);
  assert.match(transaction, /directoryInode:\$directoryInode/u);
  assert.match(transaction, /sqliteDigest:\$sqliteDigest/u);
  assert.match(common, /destination_inode/u);
  assert.match(common, /temporary_inode/u);
  assert.match(common, /ops_lstat_value/u);
  assert.match(transaction, /ulimit -f 2048/u);
  assert.match(transaction, /OPS_UPDATER_OUTPUT_MAX_BYTES/u);
  assert.match(transaction, /OPS_FRONTEND_EXPANDED_MAX_BYTES/u);
  assert.match(transaction, /OPS_RELEASE_TOTAL_MAX_BYTES/u);
  assert.match(transaction, /--max-filesize "\$maximum_size"/u);
  assert.doesNotMatch(transaction, /ops_resume_initial_archive/u);
  assert.match(transaction, /"INITIAL_STATUS_COLLISION"/u);
  assert.match(transaction, /ops_require_empty_versions \|\| return/u);
  assert.match(
    compose,
    /`\$\{selected\.root\}\/compose\/updater-current-deny`,\s+'\/var\/lib\/bgmss\/archive\/current\.json',\s+true/gu,
  );
  assert.ok(
    transaction.indexOf('ops_require_strict_fresh_archive_state || return') <
      transaction.indexOf(
        'ops_acquire_release "$version" "$manifest_digest" "$run_id"',
      ),
  );
  assert.ok(
    transaction.indexOf('ops_create_fresh_current_mask') <
      transaction.indexOf(
        'ops_run_updater "$output" "$candidate_env" "$run_id"',
      ),
  );
  const updaterResult = transaction.indexOf(
    'local updater_result=0 cleanup_result=0',
  );
  const stopFreshCandidate = transaction.indexOf(
    'ops_stop_fresh_candidate "$candidate_env"',
    updaterResult,
  );
  const removeFreshMask = transaction.indexOf(
    'ops_remove_fresh_current_mask',
    stopFreshCandidate,
  );
  assert.ok(
    updaterResult >= 0 &&
      stopFreshCandidate > updaterResult &&
      removeFreshMask > stopFreshCandidate,
  );
  const retention = read('bin/lib/retention.sh');
  for (const identity of [
    'file_devices',
    'file_inodes',
    'file_owners',
    'file_modes',
    'file_links',
    'file_sizes',
    'file_digests',
    'directory_devices',
    'directory_inodes',
    'directory_owners',
    'directory_modes',
  ]) {
    assert.ok(retention.includes(identity), `cleanup omits ${identity}`);
  }
  assert.match(retention, /DATA_MARKER_REPLACED/u);
  assert.match(retention, /marker_device/u);
  assert.match(retention, /marker_inode/u);
  assert.match(retention, /marker_digest/u);
  assert.match(
    common,
    /readonly OPS_UPDATE_TIMEOUT_SECONDS="21000"/u,
  );
  assert.match(
    read('systemd/bgmss-v2-archive-update.service'),
    /^TimeoutStartSec=6h$/mu,
  );
  assert.ok(21_000 < 6 * 60 * 60);
});

test('typed health and rollback evidence remain closed and non-hardcoded', () => {
  const health = read('bin/lib/health.sh');
  const transaction = read('bin/lib/transaction.sh');
  const retention = read('bin/lib/retention.sh');
  assert.match(health, /\.data\.positions\[\]/u);
  assert.match(health, /\.status == "selectable"/u);
  assert.match(health, /index\("rankings"\) != null/u);
  assert.match(health, /\/api\/v1\/rankings/u);
  assert.match(health, /pageSize:5/u);
  assert.match(health, /\.meta\.pagination\.page == 1/u);
  assert.match(health, /\.meta\.pagination\.pageSize == 5/u);
  assert.match(health, /\.data\.items \| type == "array" and length <= 5/u);
  assert.doesNotMatch(health, /staff:(?:anime|book|game|music|real):/u);
  assert.match(
    transaction,
    /\{kind:"application",runId:\$runId,status:"succeeded"\}/u,
  );
  assert.match(
    transaction,
    /\{kind:"data",runId:\$runId,status:"succeeded"\}/u,
  );
  assert.match(retention, /keys == \["kind","runId","status"\]/u);
});

test('all production mutations install and close interruption transactions', () => {
  const operator = read('bin/bgmss-ops');
  const deployment = read('bin/bgmss-v2-deploy');
  const transaction = read('bin/lib/transaction.sh');
  for (const entry of [operator, deployment]) {
    assert.match(entry, /OPS_LOCK_FD="\$BGMSS_BOOTSTRAP_LOCK_FD"[\s\S]{0,80}ops_install_transaction_traps/u);
    assert.doesNotMatch(entry, /trap 'ops_release_lock' EXIT/u);
  }
  for (const signal of ['HUP 129', 'INT 130', 'TERM 143']) {
    assert.ok(transaction.includes(`ops_handle_transaction_signal ${signal}`));
  }
  for (const expected of [
    'ops_transaction_arm "install" "$run_id" "acquisition"',
    'ops_transaction_transition "app"',
    'ops_transaction_transition "data"',
    'ops_transaction_transition "publishing"',
    'ops_transaction_transition "published"',
    'ops_transaction_arm "install" "$run_id" "fresh"',
    'ops_transaction_arm "update" "$run_id" "updater"',
  ]) {
    assert.ok(transaction.includes(expected), `missing transaction edge ${expected}`);
  }
  assert.match(transaction, /ops_cleanup_registered_bootstrap_stage/u);
  assert.match(transaction, /ops_cleanup_registered_temporaries/u);
  assert.match(transaction, /ops_transaction_capture_secondary/u);
  assert.match(transaction, /ops_transaction_capture_evidence/u);
  assert.match(
    transaction,
    /ops_persist_previous_app\(\)[\s\S]*?ops_transaction_publish_tracked_file secondary/u,
  );
  assert.equal(
    [
      ...transaction.matchAll(
        /ops_transaction_publish_tracked_file evidence "\$marker"/gu,
      ),
    ].length,
    2,
  );
  assert.doesNotMatch(
    transaction,
    /^\s{2}ops_transaction_seal_(?:secondary|evidence)_current \|\| return$/gmu,
  );
  assert.match(
    transaction,
    /published\) ops_transaction_compensate_published/u,
  );
  assert.match(
    transaction,
    /publishing\) ops_transaction_compensate_publishing/u,
  );
  const publishing = transaction.indexOf(
    'ops_transaction_transition "publishing"',
  );
  const published = transaction.indexOf(
    'ops_transaction_transition "published"',
  );
  const data = transaction.indexOf(
    'ops_transaction_transition "data"',
    published,
  );
  assert.ok(
    publishing <
      transaction.indexOf('ops_record_managed_data_version', publishing) &&
      transaction.indexOf('ops_record_managed_data_version', publishing) <
        published &&
      published < data,
  );
  const acquisition = transaction.slice(
    transaction.indexOf('ops_acquire_release()'),
    transaction.indexOf('ops_require_fresh_app_state()'),
  );
  assert.ok(
    acquisition.indexOf('OPS_TRANSACTION_RUNTIME_STAGE=""') <
      acquisition.indexOf('ops_cleanup_acquisition_root'),
  );
  assert.match(
    transaction,
    /ops_rollback_app\(\)[\s\S]*?data_identity=[\s\S]*?ops_check_bounded_api_logs/u,
  );
  assert.match(
    transaction,
    /ops_rollback_data\(\)[\s\S]*?app_front_identity=[\s\S]*?ops_check_bounded_api_logs/u,
  );
  assert.match(
    transaction,
    /ops_emit_update_activated \\\n[\s\S]{0,280}ops_transaction_disarm/u,
  );
  assert.match(
    transaction,
    /ops_transaction_publish_tracked_file evidence "\$marker"; then[\s\S]{0,600}ops_log_result "rollback-app"[\s\S]{0,100}ops_transaction_disarm/u,
  );
  assert.match(
    transaction,
    /ops_transaction_publish_tracked_file evidence "\$marker"; then[\s\S]{0,600}ops_log_result "rollback-data"[\s\S]{0,100}ops_transaction_disarm/u,
  );
  const common = read('bin/lib/common.sh');
  assert.match(common, /"\$mv" -Tn -- "\$temporary" "\$destination"/u);
  assert.match(common, /ATOMIC_NO_CLOBBER_FAILED/u);

  const freshCompensation = transaction.slice(
    transaction.indexOf('ops_transaction_compensate_fresh()'),
    transaction.indexOf('ops_transaction_compensate_acquisition()'),
  );
  assert.match(freshCompensation, /FRESH_CURRENT_CREATION_UNRECORDED/u);
  assert.doesNotMatch(
    freshCompensation,
    /OPS_FRESH_MASK_(?:DEVICE|INODE|DIGEST)="\$\(/u,
  );
  const acquisitionCompensation = transaction.slice(
    transaction.indexOf('ops_transaction_compensate_acquisition()'),
    transaction.indexOf('ops_stop_updater_containers()'),
  );
  assert.doesNotMatch(
    acquisitionCompensation,
    /OPS_TRANSACTION_ACQUISITION_(?:DEVICE|INODE)="\$\(/u,
  );

  const acquisitionCreation = transaction.slice(
    transaction.indexOf('ops_acquire_release()'),
    transaction.indexOf('ops_require_fresh_app_state()'),
  );
  assert.match(
    acquisitionCreation,
    /OPS_TRANSACTION_ACQUISITION_STATE="creating"[\s\S]*?ops_create_acquisition_directory \\\n\s+"\$acquisition_root" 0700 0 0[\s\S]*?OPS_TRANSACTION_ACQUISITION_STATE="recorded"/u,
  );
  assert.match(
    acquisitionCreation,
    /ops_acquire_release_into[\s\S]*?ops_relinquish_acquisition_subtree[\s\S]*?ops_seal_acquisition_tree[\s\S]*?OPS_TRANSACTION_RUNTIME_STAGE=""/u,
  );
  assert.match(transaction, /ops_acquisition_intent\(\)/u);
  assert.match(transaction, /ops_record_acquisition_object\(\)/u);
  assert.match(transaction, /ops_verify_acquisition_tree_ledger\(\)/u);
  assert.doesNotMatch(
    transaction,
    /ops_seal_acquisition_tree\(\)[\s\S]{0,600}\bfind\b[\s\S]{0,600}OPS_TRANSACTION_ACQUISITION_PATHS\+=/u,
  );
  assert.match(
    transaction,
    /ops_transaction_ref_identity\(\)[\s\S]*?'%d'[\s\S]*?'%i'[\s\S]*?'%u:%g'[\s\S]*?'%a'[\s\S]*?'%h'/u,
  );
  assert.match(
    transaction,
    /ops_run_updater\(\)[\s\S]*?UPDATER_CONTAINER_COLLISION[\s\S]*?run --detach --no-deps[\s\S]*?ops_seal_updater_container/u,
  );
  assert.match(
    transaction,
    /ops_stop_updater_containers\(\)[\s\S]*?ops_updater_container_matches[\s\S]*?"\$docker" stop --time 30 \\\n\s+"\$OPS_TRANSACTION_UPDATER_CONTAINER_ID"/u,
  );
  assert.doesNotMatch(transaction, /down --remove-orphans/u);

  const controllerRuntime = read('bin/lib/controller.sh');
  const bootstrapCleanup = controllerRuntime.slice(
    controllerRuntime.indexOf('ops_cleanup_registered_bootstrap_stage()'),
    controllerRuntime.indexOf('ops_cleanup_bootstrap_stage()'),
  );
  assert.doesNotMatch(
    bootstrapCleanup,
    /OPS_BOOTSTRAP_STAGE_(?:DEVICE|INODE)="\$\(/u,
  );
  assert.doesNotMatch(bootstrapCleanup, /ops_bootstrap_object_path_expected/u);
  const bootstrapCreation = controllerRuntime.slice(
    controllerRuntime.indexOf('ops_create_bootstrap_stage()'),
    controllerRuntime.indexOf('ops_update_bootstrap_stage_mode()'),
  );
  assert.ok(
    bootstrapCreation.indexOf('stage="$("$mktemp" -d "$template")"') <
      bootstrapCreation.indexOf('ops_register_bootstrap_object "$stage"'),
  );
});
