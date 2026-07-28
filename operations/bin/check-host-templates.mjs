#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

const nginx = read('nginx/search.bgmss.fun.conf');
assert.match(nginx, /server_name search\.bgmss\.fun;/u);
assert.match(nginx, /root \/srv\/bgmss-v2\/current-frontend;/u);
assert.match(nginx, /server 127\.0\.0\.1:18080;/u);
assert.match(nginx, /\$request_method \$uri \$server_protocol/u);
assert.doesNotMatch(nginx, /\$request_uri|\$request(?:[ "';])/u);
assert.match(
  nginx,
  /Referrer-Policy "strict-origin-when-cross-origin" always;/u,
);
assert.match(nginx, /location = \/metrics[\s\S]*?return 404;/u);
assert.doesNotMatch(nginx, /\/statistics|ssl_certificate|\/srv\/bgmss(?:\/|;)/u);
assert.doesNotMatch(nginx, /proxy_pass\s+http:\/\/[^;]*(?:9090|prometheus)/u);

const service = read('systemd/bgmss-v2-archive-update.service');
assert.match(
  service,
  /^ExecStart=\/srv\/bgmss-v2\/bin\/bgmss-ops update$/mu,
);
assert.match(service, /^TimeoutStartSec=6h$/mu);
assert.match(service, /^Nice=10$/mu);
assert.match(service, /^IOSchedulingPriority=7$/mu);
assert.doesNotMatch(service, /(?:bash|sh) -c|EnvironmentFile|password|secret|token/iu);

const timer = read('systemd/bgmss-v2-archive-update.timer');
assert.match(
  timer,
  /^OnCalendar=Sun \*-\*-\* 03:30:00 Asia\/Shanghai$/mu,
);
assert.match(timer, /^Persistent=true$/mu);
assert.match(timer, /^Unit=bgmss-v2-archive-update\.service$/mu);

const journal = read('systemd/bgmss-v2-journal-policy.conf');
assert.match(journal, /^SystemMaxUse=512M$/mu);
assert.match(journal, /^MaxRetentionSec=14day$/mu);
assert.match(journal, /^RateLimitIntervalSec=30s$/mu);
assert.match(journal, /^RateLimitBurst=1000$/mu);

const logrotate = read('nginx/bgmss-v2.logrotate');
assert.match(logrotate, /^\s*rotate 14$/mu);
assert.match(logrotate, /^\s*size 32M$/mu);

const sudoers = read('config/bgmss-v2-deploy.sudoers');
assert.ok(
  sudoers.split('\n').includes(
    'Cmnd_Alias BGMSS_V2_DEPLOY = /usr/local/sbin/bgmss-v2-deploy --sudo-stdin',
  ),
);
assert.match(
  sudoers,
  /^bgmss-deploy ALL=\(root\) NOPASSWD: BGMSS_V2_DEPLOY$/mu,
);
assert.doesNotMatch(
  sudoers,
  /SETENV|\/(?:usr\/)?bin\/(?:ba|z|da)?sh|\/bin\/env|!authenticate|\*|\?|\[|\]|\^|\$|\\[.:sS]/iu,
);

const authorizedKeyOptions = read(
  'config/bgmss-v2-deploy.authorized-key-options',
);
assert.equal(
  authorizedKeyOptions,
  'restrict,command="/usr/local/sbin/bgmss-v2-deploy --ssh-forced-command"\n',
);

const deployment = read('bin/bgmss-v2-deploy');
const deployLock = deployment.indexOf(
  'flock -n "$BGMSS_BOOTSTRAP_LOCK_FD"',
);
const deploySource = deployment.indexOf(
  'source "${BGMSS_CONTROLLER_PAYLOAD}/bin/lib/common.sh"',
);
assert.ok(deployLock >= 0 && deploySource > deployLock);
assert.match(
  deployment,
  /printf '%s\\t%s\\n' "\$requested_version" "\$requested_manifest" \|\n\s+\/usr\/bin\/sudo -n -- "\$BGMSS_DEPLOY_PATH" --sudo-stdin/u,
);
assert.match(deployment, /"\$\{SUDO_USER:-\}" != "bgmss-deploy"/u);
assert.match(
  deployment,
  /"\$\{SUDO_COMMAND:-\}" != "\$\{BGMSS_DEPLOY_PATH\} --sudo-stdin"/u,
);
assert.doesNotMatch(
  deployment,
  /-n "\$\{SUDO_COMMAND:-\}"[\s\S]{0,100}"\$\{SUDO_COMMAND/u,
);
assert.match(
  deployment,
  /split\("\\n"\)[\s\S]*?select\(length == 2 and \.\[1\] == ""\)[\s\S]*?capture\(/u,
);
assert.doesNotMatch(
  deployment,
  /\/usr\/bin\/sudo -n -- "\$BGMSS_DEPLOY_PATH"[\s\\\n]+--version|eval|sudo -[^\n]*\b(?:env|SETENV)\b/iu,
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

const operator = read('bin/bgmss-ops');
const operatorLock = operator.indexOf(
  '/usr/bin/flock -n "$BGMSS_BOOTSTRAP_LOCK_FD"',
);
const operatorSource = operator.indexOf(
  'source "${BGMSS_OPS_SCRIPT_DIR}/lib/common.sh"',
);
assert.ok(operatorLock >= 0 && operatorSource > operatorLock);

const health = read('bin/lib/health.sh');
assert.match(health, /\.data\.positions\[\]/u);
assert.match(health, /\.status == "selectable"/u);
assert.match(health, /index\("rankings"\) != null/u);
assert.match(health, /\/api\/v1\/rankings/u);
assert.doesNotMatch(health, /staff:(?:anime|book|game|music|real):/u);

const transaction = read('bin/lib/transaction.sh');
assert.match(transaction, /ops_acquisition_intent\(\)/u);
assert.match(transaction, /ops_record_acquisition_object\(\)/u);
assert.match(
  transaction,
  /ops_acquire_release_into[\s\S]*?ops_relinquish_acquisition_subtree[\s\S]*?ops_seal_acquisition_tree/u,
);
assert.match(transaction, /ops_transaction_ref_identity\(\)/u);
assert.match(
  transaction,
  /ops_transaction_publish_tracked_file\(\)[\s\S]*?ops_creation_guard_begin[\s\S]*?ops_transaction_ref_seal_after/u,
);
assert.match(
  transaction,
  /ops_transaction_publish_tracked_symlink\(\)[\s\S]*?ops_creation_guard_begin[\s\S]*?ops_transaction_ref_seal_after/u,
);
assert.match(
  transaction,
  /UPDATER_CONTAINER_COLLISION[\s\S]*?run --detach --no-deps[\s\S]*?ops_seal_updater_container/u,
);
assert.match(
  transaction,
  /ops_stop_updater_containers\(\)[\s\S]*?ops_updater_container_matches[\s\S]*?"\$docker" stop --time 30/u,
);
assert.doesNotMatch(transaction, /down --remove-orphans/u);
