## Why

The accepted single-host runtime passed green Actions and an isolated
`myserver` rehearsal. Its original bundle is now installed privately at
`/srv/bgmss-v2`, the exact legacy loader is intentionally stopped, and the old
serving path remains public and healthy. The first real updater run failed
safely with `HTTPS_REQUEST_FAILED` and published nothing because direct GitHub
Raw traffic is unreliable. The reviewed explicit-proxy implementation now has
a replacement green artifact, so the remaining work is one bounded private
upgrade and retry followed by the already planned host integration and
reversible traffic switch.

## What Changes

- Preserve the completed private deployment of source
  `bd3197d639a32831f3fbcfab698cc387393d2928` as the exact recovery baseline,
  admit replacement bundle source
  `016160f7a63d68639a50e226c052fe75d5888f5f`, and transactionally upgrade the
  same `/srv/bgmss-v2` root/project/loopback ports.
- Require an exact current-baseline, capacity, collision, legacy-health,
  proxy-endpoint/network, operations-byte, and replacement-artifact preflight
  before the recovery write.
- Project only updater onto existing external network `proxy-net` with
  `BGMSS_HTTPS_PROXY=http://myserver-proxy:7897`; API and Prometheus remain off
  that network. After private projection checks, permit exactly one real
  updater retry and prohibit live traffic until the active Archive is valid
  and differs from the known minimal fixture.
- Preserve the completed historical stop of exact legacy
  `bgmss-loader-1`; recovery may only re-inspect the same stopped identity and
  has no authority to restart, stop again, replace, or reconfigure it. The
  legacy API/MySQL/Redis serving path remains online until public cutover;
  loader bytes, data, image, policy, and Compose configuration remain
  unchanged.
- Back up the exact current Nginx configuration, integrate the new frontend and
  `/api/v1/` upstream into the existing `search.bgmss.fun` TLS vhost, validate
  and reload atomically, and restore the backup immediately if public probes
  fail. Preserve the admitted candidate below `/srv/bgmss-v2` and perform one
  legacy rollback/forward-cutover drill. Existing legacy `/statistics`,
  `/timeline`, and `/proxy` routes remain present.
- Install and enable only the planned weekly updater timer and Nginx logrotate
  configuration; retain the existing host journal and verify the Compose
  journald driver/tags without installing the repository's global retention
  drop-in.
- Keep the legacy `bgmss` API/MySQL/Redis serving path running as the first
  production rollback channel; the intentionally stopped loader is not part
  of rollback. Legacy retirement remains out of scope.
- Preserve all product behavior and visuals. Classification:
  **PRESERVE_ORACLE** at
  `644b7748674e553f863d0ffd61d029f86fdc0717`; this change activates accepted
  operations bytes and introduces no product behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `operations-single-host-deployment`: Add exact, capacity-gated production
  activation, live Nginx cutover, first-real-Archive admission, host
  observability installation, and legacy-preserving rollback requirements.

## Impact

| Field | Declaration |
|---|---|
| Status | Partially applied: old artifact is healthy and private, exact legacy loader is stopped, and one direct updater attempt failed safely. Replacement proxy artifact is admitted; bounded recovery apply is explicitly authorized and ready after lifecycle review. |
| Owner | Main agent owns specification, decisions, audit, Git lifecycle, and final acceptance. One deployment subagent owns the exact remote implementation after approval. |
| Writable paths | This change in the repository; exact local replacement transfer root `/tmp/bgmss-production-artifact-30444069918`; on `myserver`, existing `/srv/bgmss-v2/**` only through its lock/transactions, including new exact incoming root `/srv/bgmss-v2/incoming/run-30444069918`, rollback copies below that root, and the three exact runtime definitions `/srv/bgmss-v2/operations/bin/deploy`, `/srv/bgmss-v2/operations/lib/common.sh`, and `/srv/bgmss-v2/compose/compose.updater-proxy.yaml`; `/etc/nginx/nginx.conf`; new absent backup `/etc/nginx/nginx.conf.pre-bgmss-v2`; exact transient `/etc/nginx/.nginx.conf.bgmss-v2.tmp`; new `/etc/systemd/system/bgmss-archive-update.service`; new `/etc/systemd/system/bgmss-archive-update.timer`; new `/etc/logrotate.d/bgmss-nginx`; Docker project/network/containers `bgmss-v2` only through deploy/update rollback transactions; exact admitted API/updater image tags; the pinned Prometheus image; loopback ports `18080` and `19090`. |
| Read-only protected inputs | All product and operations implementation bytes outside the admitted artifact and three closed runtime definitions; historical run `30426027299`/artifact `8713954047` and current old release as recovery baseline; all host paths and services not listed writable; `/srv/bgmss/**`; all legacy Compose project `bgmss` bytes/objects; exact stopped loader ID `84d7ca5dcf10b5aae2eb44bf942f2730c3a155ae771aec57946ddfea1eff2bc9` including running state/image/labels/restart policy/mounts/config/data; existing `proxy-net` and `myserver-proxy` lifecycle/config/credentials (inspection and connection only); TLS certificate/key files; DNS, firewall, SSH, unrelated Nginx vhosts/routes, `bgmtl`, QiBlood, top3, jobs, and all unrelated Docker/systemd state. |
| Deletion complement | No legacy or unrelated file, service, container, image, network, volume, log, or data. The exact local transfer root and identity-matching run-owned incoming temporaries may be removed after verified transfer/rollback; recovery may remove only the newly introduced proxy overlay after restoring the exact historical operations bytes. Recovery failure SHALL restore the historical application/env/operations state through the existing transaction and SHALL NOT remove the existing `bgmss-v2` project/root; a cutover failure may restore `/etc/nginx/nginx.conf` from the exact backup. The production root and backup are preserved for diagnosis unless later exact cleanup is approved. No prune, broad glob, or historical data deletion. |
| Mutable refs | This branch and its documentation commit/push; `/srv/bgmss-v2/state/current.env` and current/previous application/data pointers under the existing transaction lock; project `bgmss-v2` only through transactional replacement/restore; the exact Nginx active file and backup; the two new systemd unit enablement links. |
| Consumes | Accepted product A2 `7d2aa05853e55499a35d0afd9f6e4cb2dd3be17a`; green final source B2 `016160f7a63d68639a50e226c052fe75d5888f5f`; Actions run `30444069918`; artifact ID `8721121158`, name `operations-preview-016160f7a63d68639a50e226c052fe75d5888f5f`, size `63282540`, digest `sha256:dcbe316408344c80754cc0248fb924356c5f578d16bf8fe5f36ca34a2dee2ed8`; historical private baseline `bd3197d639a32831f3fbcfab698cc387393d2928`; pinned Prometheus digest; expanded `myserver`; existing TLS vhost; existing `proxy-net`/`myserver-proxy:7897`; accepted API/updater/frontend behavior and health/metrics endpoints. |
| Produces | One live `/srv/bgmss-v2` deployment with a non-minimal Archive, API/Prometheus on loopback, new frontend and `/api/v1/` on `search.bgmss.fun`, an enabled weekly update timer, existing-journal logs plus bounded per-site Nginx logs, and an exact Nginx rollback file while the legacy API/MySQL/Redis serving path remains running and the exact loader remains intentionally stopped. |
| Dependencies | Current `/srv/bgmss-v2` release/project/ports/health exactly match historical baseline; the local replacement root exists with the admitted closed artifact while the new remote incoming and host-integration targets are absent; `/proc/meminfo` gates `MemTotal >= 8053063680` and `MemAvailable >= 4294967296` bytes; `linux/amd64`; Docker/Compose and Nginx healthy; legacy serving baseline healthy and exact loader remains stopped; read-only identity/network/listener inspection confirms `proxy-net`/`myserver-proxy:7897` without mutation; exact replacement artifact and three-file Git-blob/SHA inventory admission; updater-only proxy projection; the single updater retry itself proves CONNECT/destination TLS and succeeds before traffic; `nginx -t` before every reload. |
| Deliverables | Reviewed/strict-valid OpenSpec; production root and runtime; non-minimal Archive; installed timer/logging configuration; successful internal and public probes; preserved legacy rollback channel; archived change; commit and push. |
| Acceptance | Exact old-baseline/replacement-artifact/three-file/proxy preflight; checksum and build metadata verification; updater-only proxy Compose projection with API/Prometheus excluded; `/livez`, `/readyz`, catalog, metrics, Prometheus scrape, journald driver/tag/log checks; exact legacy loader stopped with same identity/config/policy and old serving probes healthy; exactly one updater retry reaches terminal success with active data version unequal to the minimal fixture; systemd/logrotate/Nginx validation; public frontend bytes equal the new deployed `index.html` and public `/api/v1/catalog` JSON reports the accepted real version; declared healthy legacy probes remain healthy while the Nginx bytes for the exact pre-existing `search.bgmss.fun/proxy` and top3 failures stay unchanged; one hash-bound Nginx rollback-to-legacy and forward-cutover drill; automatic restoration on any failed cutover probe. |
| Non-goals | No product code or visual change; no new build, registry, release, TLS certificate, DNS, firewall, secret, Grafana/Loki/Tempo/Alertmanager, enterprise proof system, load/soak campaign, top3/proxy/jobs repair, or legacy shutdown/deletion. |
| Operations deferred | Legacy retirement; a second real Archive needed before the new stack has an in-stack production data rollback target; extended load/soak and SLO sign-off. Until then, rollback is the exact Nginx restore to the still-running legacy API/MySQL/Redis serving path; the loader is not a rollback dependency. |
| Stop/rollback conditions | Stop before writes on capacity, artifact, root/project/port/backup, tool, stopped-loader, or legacy-serving-baseline failure. Recovery failure restores and verifies the historical `bgmss-v2` application/env/operations state; it SHALL NOT remove the existing project/root or alter the stopped loader. During cutover, restore the exact Nginx backup and reload if syntax or any required public probe fails. Never repair or remove protected legacy/unrelated state as part of this change. |

This change touches no other repository. It explicitly authorizes only the
named `myserver` production state and branch push above. The recovery apply may
resume only after these amended artifacts are strict-valid, reviewed with zero
P0/P1 findings, committed, pushed, and the remote branch matches that commit.
