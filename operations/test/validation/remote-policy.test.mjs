import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';

const read = (name) =>
  fs.readFileSync(
    new URL(`../../validation/remote/${name}`, import.meta.url),
    'utf8',
  );

test('preflight seals complete protected trees with explicit fail-closed bounds', () => {
  const source = read('preflight.sh');
  assert.match(source, /find "\$root" -xdev -print0/u);
  assert.doesNotMatch(source, /maxdepth/u);
  assert.match(
    source,
    /tree_records "\$legacy_root" 4096 0 600 metadata/u,
  );
  assert.match(source, /tree_records \/etc\/letsencrypt 10000 0 600 metadata/u);
  assert.match(source, /tree_records \/etc\/pki\/tls 10000 0 600 metadata/u);
  assert.match(source, /local regular_mode="\$\{5:-content\}"/u);
  assert.match(source, /stat -c '[^']*%Z'/u);
  assert.match(source, /regular secret bytes never read/u);
  assert.match(source, /live data bytes never read/u);
  assert.match(source, /tree_records \/etc\/nginx 10000 536870912 300/u);
  assert.match(
    source,
    /tree_records \/etc\/systemd\/system 10000 536870912 300/u,
  );
  assert.match(source, /nice -n 10 ionice -c 3/u);
  assert.match(source, /timeout --signal=TERM --kill-after=5s/u);
  assert.match(source, /consumed <= content_limit/u);
  assert.match(source, /file_count <= maximum_count/u);
  assert.match(source, /maximum_lines=100000; maximum_bytes=16777216/u);
});

test('remote scripts use only the exact validation root and avoid broad deletion', () => {
  for (const name of [
    'bootstrap.sh',
    'entry.sh',
    'launch.sh',
    'ownership-ledger.sh',
    'preflight.sh',
    'recover.sh',
    'transfer-agent.sh',
  ]) {
    const source = read(name);
    assert.match(source, /\/srv\/bgmss-ops-validation/u);
    assert.doesNotMatch(source, /\brm\s+-[A-Za-z]*r/u);
    assert.doesNotMatch(source, /docker compose down/u);
    assert.doesNotMatch(source, /docker image rm[^\n]*--force/u);
    assert.doesNotMatch(source, /\/srv\/bgmss-v2\//u);
    assert.doesNotMatch(source, /\/srv\/bgmss\//u);
    assert.doesNotMatch(source, /\b(node|npm|go|python3?)\b/u);
    assert.doesNotMatch(source, /unset[^\n]*(?:\\\n[^\n]*)*SHELLOPTS/u);
  }
});

test('every remote Bash script reaches argument validation after sanitization', () => {
  for (const name of [
    'bootstrap.sh',
    'entry.sh',
    'launch.sh',
    'preflight.sh',
    'recover.sh',
    'transfer-agent.sh',
  ]) {
    const script = new URL(
      `../../validation/remote/${name}`,
      import.meta.url,
    );
    const result = spawnSync('/bin/bash', [script.pathname], {
      encoding: 'utf8',
      timeout: 5_000,
    });
    assert.notEqual(result.status, 0, name);
    assert.doesNotMatch(result.stderr, /SHELLOPTS: readonly variable/u, name);
  }
});

test('bootstrap and launch seal ownership before executing a descriptor-open payload', () => {
  const bootstrap = read('bootstrap.sh');
  const launch = read('launch.sh');
  assert.match(
    bootstrap,
    /\[\[ ! -e "\$target_root" && ! -L "\$target_root" \]\]/u,
  );
  assert.match(bootstrap, /rootDevice:\$rootDevice/u);
  assert.match(bootstrap, /rootInode:\$rootInode/u);
  assert.match(bootstrap, /trap cleanup_partial ERR/u);
  assert.match(bootstrap, /trap on_exit EXIT/u);
  assert.match(bootstrap, /trap 'on_signal HUP' HUP/u);
  assert.match(bootstrap, /trap 'on_signal INT' INT/u);
  assert.match(bootstrap, /trap 'on_signal TERM' TERM/u);
  assert.match(bootstrap, /append_closed/u);
  assert.match(bootstrap, /ledger_append bootstrap-closed bootstrap/u);
  assert.match(
    bootstrap,
    /setsid --fork \/usr\/bin\/bash "\/proc\/self\/fd\/\$\{agent_fd\}" watchdog/u,
  );
  assert.match(launch, /length == 18/u);
  assert.match(launch, /verify_transferred_identity/u);
  assert.match(launch, /"\$expected_head"/u);
  assert.match(launch, /sha256sum \/proc\/self\/fd\/9/u);
  assert.match(
    launch,
    /exec \/usr\/bin\/bash \/proc\/self\/fd\/9/u,
  );
});

test('entry has disconnect recovery and identity-gated cleanup', () => {
  const source = read('entry.sh');
  assert.match(source, /trap on_signal HUP INT TERM/u);
  assert.match(source, /setsid --fork \/usr\/bin\/bash "\$entry_fd_path"/u);
  assert.match(source, /--watchdog "\$run_id" "\$input_digest"/u);
  assert.match(source, /watchdogSession == \.watchdogPid/u);
  const finish = source.slice(
    source.indexOf('finish() {'),
    source.indexOf('on_error() {'),
  );
  assert.ok(
    finish.indexOf('stop_watchdog || add_secondary') <
      finish.indexOf('cleanup_all'),
  );
  assert.match(source, /verify_container_record/u);
  assert.match(source, /container_security_digest/u);
  assert.match(source, /oci_archive_graph_identity/u);
  assert.match(source, /prometheus_graph_identity/u);
  assert.match(source, /verify_image_graph_record "\$record" "\$reference"/u);
  assert.match(source, /graphDigest/u);
  assert.match(source, /IMAGE_FOREIGN_CONSUMER/u);
  assert.match(source, /runtime_intent/u);
  assert.match(source, /ledger_append_entry object-creating/u);
  assert.match(source, /ledger_append_entry object-created/u);
  assert.match(source, /ledger_append_entry object-removing/u);
  assert.match(source, /ledger_append_entry runtime-closed/u);
  assert.match(source, /runtime_replace_owned/u);
  assert.match(source, /runtime_namespace_intent/u);
  assert.match(source, /validate_command_invocation/u);
  assert.match(source, /argvDigest:\$argvDigest/u);
  assert.match(
    source,
    /logical_argv.*==.*contract_argv/u,
  );
  assert.match(source, /ledger_resource_event resource-creating/u);
  assert.match(source, /ledger_resource_event resource-closed/u);
  assert.match(source, /ledger_resource_state/u);
  assert.match(source, /resource_cleanup_safe="false"/u);
  assert.match(source, /"\$agent_fd_path" cleanup/u);
  assert.doesNotMatch(source, /path_snapshot/u);
  assert.doesNotMatch(source, /\.path-manifest/u);
  assert.doesNotMatch(source, /discover_interrupted_resources/u);
  assert.match(source, /docker image rm "\$reference"/u);
  assert.match(source, /runtime_remove_owned/u);
});

test('remote validation performs one acquisition and preserves typed minimal identity', () => {
  const source = read('entry.sh');
  assert.equal(
    (source.match(/create_updater produce "\$\{project\}_outbound"/gu) ?? [])
      .length,
    1,
  );
  assert.doesNotMatch(source, /create_updater nochange/u);
  assert.match(source, /pageSize:5/u);
  assert.match(source, /typedQuery:true/u);
  assert.match(source, /minimal_query_digest_before/u);
  assert.match(source, /minimal_prometheus_digest_before/u);
  assert.match(source, /UPDATER_CHANGED_CURRENT_POINTER/u);
  assert.match(source, /updater-current-deny/u);
  assert.match(source, /peak_memory" -gt 0/u);
});

test('recovery preserves unknown or replaced state', () => {
  const source = read('recover.sh');
  assert.match(source, /readonly observed_phase=/u);
  assert.match(source, /bootstrap\|transfer/u);
  assert.match(source, /entry-preparing/u);
  assert.match(source, /cleanup\)/u);
  assert.match(source, /run-owned/u);
  assert.match(source, /latest_identity_for/u);
  assert.match(source, /ledger_verify_identity/u);
  assert.match(source, /ownership_nonce/u);
  assert.match(source, /marker_selector.*discover/u);
  assert.match(source, /head_selector.*discover/u);
  assert.doesNotMatch(source, /find[^\n]*-delete/u);
});

test('ownership ledger is hash chained, fsynced, and exact-identity based', () => {
  const ledger = read('ownership-ledger.sh');
  const agent = read('transfer-agent.sh');
  assert.match(ledger, /payloadDigest/u);
  assert.match(ledger, /previous:\$previous/u);
  assert.match(ledger, /sequence:\$sequence/u);
  assert.match(
    ledger,
    /sync -f -- "\/proc\/self\/fd\/\$\{append_fd\}"/u,
  );
  assert.doesNotMatch(
    ledger,
    /^[ \t]*sync -f -- "\$ledger_path"/mu,
  );
  assert.match(ledger, /ctime:\$ctime/u);
  assert.match(ledger, /device:\$device/u);
  assert.match(ledger, /digest:\$digest/u);
  assert.match(ledger, /inode:\$inode/u);
  assert.match(ledger, /links:\$links/u);
  assert.match(ledger, /ledger_begin_transaction/u);
  assert.match(ledger, /ledger_append_transaction/u);
  assert.match(agent, /object-creating/u);
  assert.match(agent, /object-created/u);
  assert.match(agent, /object-removing/u);
  assert.match(agent, /transfer-closed/u);
  assert.match(agent, /transfer-aborted/u);
  assert.match(agent, /comm -23/u);
  assert.match(agent, /comm -13/u);
  assert.match(agent, /ledger_verify_identity "\$identity"/u);
  assert.match(agent, /\[\[ "\$self_session" == "\$\$" \]\]/u);
  assert.doesNotMatch(agent, /\brm\s+-[A-Za-z]*r/u);
});

test('same-shape replacements and inserted paths are never deletion authority', () => {
  const expected = {
    ctime: '10',
    device: '7',
    digest: `sha256:${'a'.repeat(64)}`,
    gid: '0',
    inode: '41',
    links: '1',
    mode: '400',
    mtime: '10',
    path: 'evidence/result.json',
    size: '4',
    type: 'file',
    uid: '0',
  };
  const sameShapeReplacement = {
    ...expected,
    ctime: '11',
    inode: '42',
  };
  assert.notDeepEqual(sameShapeReplacement, expected);

  const sealedUniverse = new Set(['.', 'evidence', 'evidence/result.json']);
  const insertedUniverse = new Set([
    ...sealedUniverse,
    'evidence/external-result.json',
  ]);
  assert.notDeepEqual([...insertedUniverse].sort(), [...sealedUniverse].sort());
});
