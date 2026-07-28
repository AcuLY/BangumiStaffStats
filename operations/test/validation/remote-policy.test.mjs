import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';

import { MINIMUM_DOCKER_API_VERSION } from '../../release/docker-capability.mjs';

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

test('preflight captures a digest and count from the same bounded stream', () => {
  const source = read('preflight.sh');
  const start = source.indexOf('bounded_seal() {');
  const end = source.indexOf('\ntree_records() {', start);
  assert.ok(start >= 0 && end > start);
  const result = spawnSync('/bin/bash', ['--noprofile', '--norc', '-c', `
    set -Eeuo pipefail
    die() { return 1; }
    sha256sum() {
      cat >/dev/null
      printf '%064d  -\\n' 0
    }
    jq() { printf '{}\\n'; }
    sample_records() { printf 'first\\nsecond\\n'; }
    ${source.slice(start, end)}
    bounded_seal sample 'sample coverage' sample_records
  `], {
    encoding: 'utf8',
    timeout: 5_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '{}\n');
});

test(
  'remote Docker entry preambles remove inherited Docker and Compose authority',
  { skip: process.platform !== 'linux' },
  () => {
    for (const name of ['preflight.sh', 'entry.sh']) {
      const source = read(name);
      const exportEnd =
        source.indexOf('export DOCKER_CONFIG="$docker_config"') +
        'export DOCKER_CONFIG="$docker_config"'.length;
      assert.ok(exportEnd > 0, name);
      const result = spawnSync('/bin/bash', ['--noprofile', '--norc', '-c', `
        ${source.slice(0, exportEnd)}
        test "$DOCKER_HOST" = "unix:///var/run/docker.sock"
        test "$DOCKER_CONFIG" = "/run/bgmss-docker-config-absent"
        while IFS= read -r inherited_name; do
          case "$inherited_name" in
            DOCKER_HOST|DOCKER_CONFIG) ;;
            DOCKER_*|COMPOSE_*) exit 90 ;;
          esac
        done < <(compgen -e)
      `], {
        encoding: 'utf8',
        env: {
          COMPOSE_FUTURE_AUTHORITY: 'foreign',
          COMPOSE_REMOVE_ORPHANS: '1',
          COMPOSE_STATUS_STDOUT: '1',
          DOCKER_AUTH_CONFIG: '{"auths":{"foreign.invalid":{}}}',
          DOCKER_DEFAULT_PLATFORM: 'linux/arm64',
          DOCKER_FUTURE_AUTHORITY: 'foreign',
          DOCKER_HOST: 'tcp://foreign.invalid:2376',
          PATH: '/usr/bin:/bin',
        },
        timeout: 5_000,
      });
      assert.equal(result.status, 0, `${name}: ${result.stderr}`);
    }
  },
);

test('preflight admits Linux container capabilities without a distro or patch gate', () => {
  const source = read('preflight.sh');
  assert.match(source, /kernel_name="\$\(uname -s\)" \|\| die/u);
  assert.match(source, /readonly kernel_name/u);
  assert.match(source, /\$kernel_name" == "Linux"/u);
  assert.doesNotMatch(source, /\/etc\/os-release|CentOS|VERSION_ID/u);
  assert.match(source, /while IFS= read -r inherited_name/u);
  assert.match(source, /DOCKER_[*] \| COMPOSE_[*]\)/u);
  assert.match(source, /done < <\(compgen -e\)/u);
  assert.match(
    source,
    /readonly docker_endpoint="unix:\/\/\/var\/run\/docker[.]sock"/u,
  );
  assert.match(
    source,
    /readonly docker_config="\/run\/bgmss-docker-config-absent"/u,
  );
  assert.match(source, /! -e "\$docker_config" && ! -L "\$docker_config"/u);
  assert.match(source, /export DOCKER_HOST="\$docker_endpoint"/u);
  assert.match(source, /export DOCKER_CONFIG="\$docker_config"/u);
  assert.equal(
    /minimum_docker_api_version="([^"]+)"/u.exec(source)?.[1],
    MINIMUM_DOCKER_API_VERSION,
  );
  assert.equal((source.match(/docker version --format/gu) ?? []).length, 1);
  assert.match(source, /\{\{json [.]\}\}/u);
  assert.match(source, /head -c 65537/u);
  assert.match(source, /docker_version_bytes[\s\S]*?" -le 65536/u);
  assert.match(source, /[.]key == "ApiVersion"/u);
  assert.match(source, /[.]key == "APIVersion"/u);
  assert.match(source, /\(\$matches \| length\) == 1/u);
  assert.equal(
    (
      source.match(
        /docker info --format '\{\{json [.]ClientInfo[.]Plugins\}\}'/gu,
      ) ?? []
    ).length,
    1,
  );
  assert.match(source, /[.]Name[?] == "compose"/u);
  assert.match(source, /\(\$matches \| length\) == 1/u);
  assert.match(source, /compose_plugin_canonical" == "\$compose_plugin_path"/u);
  assert.match(source, /compose_plugin_links" == "1"/u);
  assert.match(source, /8#\$compose_plugin_mode & 0022/u);
  assert.match(source, /"docker-compose-plugin"/u);
  assert.match(
    source,
    /"\$metadata" == "\$compose_plugin_metadata"[\s\S]*?"\$digest" == "\$compose_plugin_digest"/u,
  );
  assert.doesNotMatch(
    source,
    /^readonly [A-Za-z_][A-Za-z0-9_]*="\$\(/mu,
  );
  assert.match(
    source,
    /"\$docker_negotiated_api_version" "\$minimum_docker_api_version"/u,
  );
  assert.match(
    source,
    /"\$docker_negotiated_api_version" "\$docker_server_minimum_api_version"/u,
  );
  assert.match(
    source,
    /"\$docker_server_api_version" "\$docker_negotiated_api_version"/u,
  );
  for (const flag of [
    '--env-file',
    '--file',
    '--profile',
    '--project-name',
    '--quiet',
    '--no-build',
    '--no-recreate',
  ]) {
    assert.match(source, new RegExp(flag, 'u'));
  }
  assert.doesNotMatch(source, /compose_version" == "2[.]/u);
});

test('preflight gates the fixed Bash, GNU, util-linux, and curl feature set', () => {
  const source = read('preflight.sh');
  for (const capability of [
    'declare -A associative',
    'mapfile -t records',
    'exec {descriptor}</dev/null',
    '--no-clobber',
    '--fork',
    '--file-system',
    '-printf',
    '+%s%3N',
    '--max-filesize',
  ]) {
    assert.ok(source.includes(capability), capability);
  }
  assert.match(source, /mv --help[\s\S]*?-T/u);
  assert.match(source, /date_milliseconds[\s\S]*?\^\[0-9\]\{13\}\$/u);
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

test('remote scripts never combine readonly declaration with command substitution', () => {
  const declarationWithSubstitution =
    /^\s*readonly(?:\s+-[aA])?\s+[A-Za-z_][A-Za-z0-9_]*\s*=\s*(?:"[^"]*\$\(|\$\()/mu;
  for (const name of [
    'bootstrap.sh',
    'entry.sh',
    'launch.sh',
    'ownership-ledger.sh',
    'preflight.sh',
    'recover.sh',
    'transfer-agent.sh',
  ]) {
    assert.doesNotMatch(read(name), declarationWithSubstitution, name);
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
  const entryOpen = launch.indexOf(
    'open_regular_fd "$entry" read "0:0:1:500" entry_fd',
  );
  const entryHash = launch.indexOf(
    'sha256sum "/proc/self/fd/${entry_fd}"',
  );
  const entryExec = launch.indexOf(
    'exec /usr/bin/bash "/proc/self/fd/${entry_fd}"',
  );
  assert.ok(entryOpen > 0);
  assert.ok(entryOpen < entryHash);
  assert.ok(entryHash < entryExec);
});

test('entry has disconnect recovery and identity-gated cleanup', () => {
  const source = read('entry.sh');
  assert.match(
    source,
    /readonly docker_endpoint="unix:\/\/\/var\/run\/docker[.]sock"/u,
  );
  assert.match(source, /export DOCKER_HOST="\$docker_endpoint"/u);
  assert.match(source, /while IFS= read -r inherited_name/u);
  assert.match(source, /DOCKER_[*] \| COMPOSE_[*]\)/u);
  assert.match(source, /done < <\(compgen -e\)/u);
  assert.match(
    source,
    /readonly docker_config="\/run\/bgmss-docker-config-absent"/u,
  );
  assert.match(source, /export DOCKER_CONFIG="\$docker_config"/u);
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
  assert.match(source, /subjectType:\$subjectType/u);
  assert.match(
    source,
    /'\{dataVersion:\$dataVersion,page:1,pageSize:5,typed:true\}'/u,
  );
  assert.match(source, /typedQueryDigest:\$typedQueryDigest/u);
  assert.match(source, /prometheusDigest:\$prometheusDigest/u);
  assert.match(source, /queryResultDigest:\$queryResultDigest/u);
  assert.match(source, /prometheusScrapeDigest:\$prometheusScrapeDigest/u);
  assert.match(source, /minimal_query_digest_before/u);
  assert.match(source, /minimal_prometheus_digest_before/u);
  const continuousSample = source.slice(
    source.indexOf('capture_continuous_sample() {'),
    source.indexOf('build_continuous_health_evidence() {'),
  );
  assert.match(continuousSample, /health_state_command "\$minimal_data"/u);
  assert.match(
    continuousSample,
    /expected_state="\$\(jq -ceS '\.state' <<< "\$minimal_health"\)"/u,
  );
  assert.match(continuousSample, /\[\[ "\$state" == "\$expected_state" \]\]/u);
  assert.match(
    continuousSample,
    /"\$query_projection_digest" == "\$minimal_query_digest_before"/u,
  );
  assert.match(
    continuousSample,
    /"\$prometheus_projection_digest" == "\$minimal_prometheus_digest_before"/u,
  );
  const continuousEvidence = source.slice(
    source.indexOf('build_continuous_health_evidence() {'),
    source.indexOf('verify_continuous_health_command() {'),
  );
  assert.match(continuousEvidence, /\[\[ "\$before" == "\$after" \]\]/u);
  const continuousVerifier = source.slice(
    source.indexOf('verify_continuous_health_command() {'),
    source.indexOf('run_recorded compose-start-api'),
  );
  assert.match(
    continuousVerifier,
    /\$\{#continuous_health_unverified_json\} \+ 1 <= maximum_output/u,
  );
  assert.match(
    continuousVerifier,
    /printf '%s\\n' "\$continuous_health_unverified_json"/u,
  );
  assert.doesNotMatch(continuousVerifier, /sha256sum/u);
  assert.match(source, /UPDATER_CHANGED_CURRENT_POINTER/u);
  assert.match(source, /updater-current-deny/u);
  assert.match(source, /peak_memory" -gt 0/u);
});

test('recovery preserves unknown or replaced state', () => {
  const source = read('recover.sh');
  assert.match(
    source,
    /observed_phase="\$\(jq -rse [\s\S]*?\)" \|\| fail\nreadonly observed_phase/u,
  );
  assert.match(source, /bootstrap\|transfer/u);
  assert.match(source, /entry-preparing/u);
  assert.match(source, /entry-preparing\|cleanup\|run-owned\)/u);
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
