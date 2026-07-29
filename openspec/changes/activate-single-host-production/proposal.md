## Why

The accepted single-host runtime has passed green Actions and an isolated
`myserver` rehearsal, and the user has now explicitly authorized production
activation. `myserver` has been expanded to 7.5 GiB RAM and rebooted
successfully, so the remaining work is one bounded live install and reversible
traffic switch while the legacy stack remains available.

## What Changes

- Admit the existing green `linux/amd64` bundle for source revision
  `bd3197d639a32831f3fbcfab698cc387393d2928` and install it under the dedicated
  `/srv/bgmss-v2` root with Compose project `bgmss-v2` and loopback ports
  `18080`/`19090`.
- Require a post-reboot capacity, collision, legacy-health, and artifact
  preflight before the first production write.
- Bootstrap the new runtime from the bundle fixture, run one real updater
  publication, and prohibit live traffic until the active Archive is valid and
  differs from the known minimal fixture.
- Under the user's later explicit authorization, capture and stop the exact
  restart-looping legacy `bgmss-loader-1` and leave that background updater
  stopped. The legacy API/MySQL/Redis serving path remains online until public
  cutover; loader bytes, data, image, policy, and Compose configuration remain
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
| Status | Specified and explicitly authorized; production apply has not started. |
| Owner | Main agent owns specification, decisions, audit, Git lifecycle, and final acceptance. One deployment subagent owns the exact remote implementation after approval. |
| Writable paths | This change in the repository; exact absent local transfer root `/tmp/bgmss-production-artifact-30426027299`; on `myserver`, new `/srv/bgmss-v2/**`, including exact transfer root `/srv/bgmss-v2/incoming/run-30426027299`; only the running state of legacy loader container ID `84d7ca5dcf10b5aae2eb44bf942f2730c3a155ae771aec57946ddfea1eff2bc9`, transitioning from running to stopped after its project `bgmss`/service `loader` labels and protected fields still match the recorded baseline; `/etc/nginx/nginx.conf`; new absent backup `/etc/nginx/nginx.conf.pre-bgmss-v2`; exact transient `/etc/nginx/.nginx.conf.bgmss-v2.tmp`; new `/etc/systemd/system/bgmss-archive-update.service`; new `/etc/systemd/system/bgmss-archive-update.timer`; new `/etc/logrotate.d/bgmss-nginx`; Docker project/network/containers `bgmss-v2`; exact admitted API/updater image tags; the pinned Prometheus image; loopback ports `18080` and `19090`. |
| Read-only protected inputs | All product and operations implementation bytes outside this change; Actions run `30426027299` and its admitted artifact; all host paths and services not listed writable; `/srv/bgmss/**`; all legacy Compose project `bgmss` bytes/objects except the exact running-state transition above; the loader image, labels, restart policy, mounts, config, data, and every other field remain read-only; existing TLS certificate/key files; DNS, firewall, SSH, unrelated Nginx vhosts/routes, `bgmtl`, QiBlood, top3, jobs, proxy, and all unrelated Docker/systemd state. |
| Deletion complement | No legacy or unrelated file, service, container, image, network, volume, log, or data. The exact local transfer root may be removed after verified transfer only if its identity is unchanged. Failed activation may stop/remove only project `bgmss-v2` objects and may restore `/etc/nginx/nginx.conf` from the exact backup; the production root and backup are preserved for diagnosis unless a later exact cleanup is approved. No prune, broad glob, or historical data deletion. |
| Mutable refs | This branch and its documentation commit/push; `/srv/bgmss-v2/state/current.env` and current/previous application/data pointers under the existing transaction lock; project `bgmss-v2`; running-to-stopped state of exact legacy loader ID `84d7ca5dcf10b5aae2eb44bf942f2730c3a155ae771aec57946ddfea1eff2bc9`; the exact Nginx active file and backup; the two new systemd unit enablement links. |
| Consumes | Green Development and operations-bundle run `30426027299`; artifact ID `8713954047`, name `operations-preview-bd3197d639a32831f3fbcfab698cc387393d2928`, and source `bd3197d639a32831f3fbcfab698cc387393d2928`; pinned Prometheus digest; expanded `myserver`; existing TLS vhost; accepted API/updater/frontend behavior and health/metrics endpoints. |
| Produces | One live `/srv/bgmss-v2` deployment with a non-minimal Archive, API/Prometheus on loopback, new frontend and `/api/v1/` on `search.bgmss.fun`, an enabled weekly update timer, existing-journal logs plus bounded per-site Nginx logs, and an exact Nginx rollback file while the legacy API/MySQL/Redis serving path remains running and the exact loader remains intentionally stopped. |
| Dependencies | New boot ID; `/proc/meminfo` gates `MemTotal >= 8053063680` and `MemAvailable >= 4294967296` bytes; `linux/amd64`; Docker/Compose and Nginx healthy; root/project/ports/backup/temporary/config/unit/logrotate identities absent; legacy baseline healthy; exact artifact ID/name/checksum/head/platform admission; real updater success before traffic; `nginx -t` before every reload. |
| Deliverables | Reviewed/strict-valid OpenSpec; production root and runtime; non-minimal Archive; installed timer/logging configuration; successful internal and public probes; preserved legacy rollback channel; archived change; commit and push. |
| Acceptance | Capacity/collision/legacy preflight; checksum and build metadata verification; hardened Compose projection; `/livez`, `/readyz`, catalog, metrics, Prometheus scrape, journald driver/tag/log checks; exact legacy loader stopped with same identity/config/policy and old serving probes healthy; updater terminal success with active data version unequal to the minimal fixture; systemd/logrotate/Nginx validation; public frontend bytes equal the new deployed `index.html` and public `/api/v1/catalog` JSON reports the accepted real version; declared healthy legacy probes remain healthy while the Nginx bytes for the exact pre-existing `search.bgmss.fun/proxy` and top3 failures stay unchanged; one hash-bound Nginx rollback-to-legacy and forward-cutover drill; automatic restoration on any failed cutover probe. |
| Non-goals | No product code or visual change; no new build, registry, release, TLS certificate, DNS, firewall, secret, Grafana/Loki/Tempo/Alertmanager, enterprise proof system, load/soak campaign, top3/proxy/jobs repair, or legacy shutdown/deletion. |
| Operations deferred | Legacy retirement; a second real Archive needed before the new stack has an in-stack production data rollback target; extended load/soak and SLO sign-off. Until then, rollback is the exact Nginx restore to the still-running legacy API/MySQL/Redis serving path; the loader is not a rollback dependency. |
| Stop/rollback conditions | Stop before writes on capacity, artifact, root/project/port/backup, tool, or legacy-baseline failure. If the exact legacy loader cannot be stopped while retaining the same identity/config/policy or if its stop harms the old serving path, stop apply and report; do not replace or repair it. The loader remains intentionally stopped and is not part of rollback. Before cutover, stop only the exact new project on failure. During cutover, restore the exact Nginx backup and reload if syntax or any required public probe fails. Never repair or remove protected legacy/unrelated state as part of this change. |

This change touches no other repository. It explicitly authorizes only the
named `myserver` production state and branch push above. Apply remains blocked
until proposal, specs, design, and tasks are complete, strictly valid, reviewed,
and approved by the main agent.
