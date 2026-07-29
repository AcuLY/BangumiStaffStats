## Why

The accepted single-host runtime and explicit updater proxy are installed
privately at `/srv/bgmss-v2`; the exact legacy loader is intentionally
stopped, and the old serving path remains public and healthy. Direct updater
access first failed safely with `HTTPS_REQUEST_FAILED`. The subsequent proxy
run `1f1ef640-6ece-4c53-8cf1-2df480746891` fetched official metadata but
published nothing because the product incorrectly compared two unrelated
timestamp fields. That unsupported check is now removed and accepted by green
Actions. The remaining work is one bounded private artifact upgrade, one new
updater invocation, and the already planned host integration and reversible
traffic switch.

## What Changes

- Preserve completed private source
  `016160f7a63d68639a50e226c052fe75d5888f5f` as the exact recovery baseline,
  admit replacement bundle source
  `be48847bc26bcda28c9f08f6807f5dec40d479f4`, and transactionally upgrade the
  same `/srv/bgmss-v2` root/project/loopback ports.
- Require an exact current-baseline, capacity, collision, legacy-health,
  proxy-endpoint/network, operations-byte, and replacement-artifact preflight
  before the recovery write.
- Preserve the installed updater-only projection onto existing external
  network `proxy-net` with
  `BGMSS_HTTPS_PROXY=http://myserver-proxy:7897`; API and Prometheus remain off
  that network. After private projection checks, permit exactly one newly
  authorized updater invocation and prohibit live traffic until the active
  Archive is valid and differs from the known minimal fixture.
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
| Status | Partially applied: B2 is healthy and private, the exact legacy loader is stopped, and updater run `1f1ef640-6ece-4c53-8cf1-2df480746891` failed safely without publication. Timestamp-fix artifact `8723283346` is admitted; one bounded deployment and one new updater invocation are authorized after this amendment is committed and pushed. |
| Owner | Main agent directly owns specification, decisions, repository lifecycle, exact remote implementation, audit, and final acceptance. |
| Writable paths | This change in the repository; exact local replacement transfer root `/tmp/bgmss-production-artifact-30449279352`; on `myserver`, existing `/srv/bgmss-v2/**` only through declared lock/transactions, including new exact incoming root `/srv/bgmss-v2/incoming/run-30449279352`, the new release, and current/previous refs; `/etc/nginx/nginx.conf`; new absent backup `/etc/nginx/nginx.conf.pre-bgmss-v2`; exact transient `/etc/nginx/.nginx.conf.bgmss-v2.tmp`; new `/etc/systemd/system/bgmss-archive-update.service`; new `/etc/systemd/system/bgmss-archive-update.timer`; new `/etc/logrotate.d/bgmss-nginx`; Docker project/containers `bgmss-v2` only through deploy/update rollback transactions; exact admitted API/updater image tags; the pinned Prometheus image; loopback ports `18080` and `19090`. The installed operations/proxy definitions and existing `proxy-net` remain read-only. |
| Read-only protected inputs | All product and operations implementation bytes outside the admitted artifact; exact installed operations/proxy definitions; historical runs/artifacts/releases; current B2 application/env/status/data until transactional replacement; all host paths and services not listed writable; `/srv/bgmss/**`; all legacy Compose project `bgmss` bytes/objects; exact stopped loader ID `84d7ca5dcf10b5aae2eb44bf942f2730c3a155ae771aec57946ddfea1eff2bc9` including running state/image/labels/restart policy/mounts/config/data; existing `proxy-net` and `myserver-proxy` lifecycle/config/credentials (inspection and connection only); TLS certificate/key files; DNS, firewall, SSH, unrelated Nginx vhosts/routes, `bgmtl`, QiBlood, top3, jobs, and all unrelated Docker/systemd state. |
| Deletion complement | No legacy or unrelated file, service, container, image, network, volume, log, or data. The exact local transfer root and identity-matching run-owned incoming temporaries may be removed after verified transfer/rollback. Deployment failure SHALL restore exact B2 application/env state through the existing transaction and SHALL NOT remove the existing `bgmss-v2` project/root or alter installed operations/proxy definitions; a cutover failure may restore `/etc/nginx/nginx.conf` from the exact backup. The production root and backup are preserved for diagnosis unless later exact cleanup is approved. No prune, broad glob, or historical data deletion. |
| Mutable refs | This branch and its documentation commit/push; `/srv/bgmss-v2/state/current.env` and current/previous application/data pointers under the existing transaction lock; project `bgmss-v2` only through transactional replacement/restore; the exact Nginx active file and backup; the two new systemd unit enablement links. |
| Consumes | Current private B2 `016160f7a63d68639a50e226c052fe75d5888f5f`; accepted timestamp-fix product `8282996f3f0cb0e2cde2a91ce71d425217ffa9d6`; green final source `be48847bc26bcda28c9f08f6807f5dec40d479f4`; Actions run `30449279352`; artifact ID `8723283346`, name `operations-preview-be48847bc26bcda28c9f08f6807f5dec40d479f4`, size `63282532`, digest `sha256:e7aec802a2f95ece998d369e834813bab1800f0cf9e59e2c63466e9932a32bb0`, tree `52dd582016d40569327c0b87f9fad1cadf5252bb`, platform `linux/amd64`; failed status SHA `156ec67a19d497df8fc62a9e39b5fae46a79356c81483cf9d246e9143703ed46`; pinned Prometheus digest; expanded `myserver`; existing TLS vhost; existing `proxy-net`/`myserver-proxy:7897`; accepted API/updater/frontend behavior and health/metrics endpoints. |
| Produces | One live `/srv/bgmss-v2` deployment with a non-minimal Archive, API/Prometheus on loopback, new frontend and `/api/v1/` on `search.bgmss.fun`, an enabled weekly update timer, existing-journal logs plus bounded per-site Nginx logs, and an exact Nginx rollback file while the legacy API/MySQL/Redis serving path remains running and the exact loader remains intentionally stopped. |
| Dependencies | Current `/srv/bgmss-v2` images identify B2, current/previous env SHA-256 equal `f2f63a26d9178e3f9effd6acb8b1ca195056be2050b157bf871386d45c280646`/`a74981042693c818b72fe0065128be8ca12a63d630473a643b2f6b12109dc757`, failed status and minimal-only data match the recorded baseline, the local replacement root exists with the admitted closed artifact while new incoming and host-integration targets are absent, and installed operations bytes remain exact. Capacity gates, `linux/amd64`, Docker/Compose/Nginx health, legacy serving health, stopped-loader identity, read-only proxy inspection, updater-only projection, successful single new invocation before traffic, and `nginx -t` before every reload remain mandatory. |
| Deliverables | Reviewed/strict-valid OpenSpec; production root and runtime; non-minimal Archive; installed timer/logging configuration; successful internal and public probes; preserved legacy rollback channel; archived change; commit and push. |
| Acceptance | Exact B2/status/replacement-artifact/installed-operations/proxy preflight; checksum and build metadata verification; updater-only proxy Compose projection with API/Prometheus excluded; `/livez`, `/readyz`, catalog, metrics, Prometheus scrape, journald driver/tag/log checks; exact legacy loader stopped with same identity/config/policy and old serving probes healthy; exactly one newly authorized updater invocation reaches terminal success with active data version unequal to the minimal fixture; systemd/logrotate/Nginx validation; public frontend bytes equal the new deployed `index.html` and public `/api/v1/catalog` JSON reports the accepted real version; declared healthy legacy probes remain healthy while exact pre-existing excluded failures stay unchanged; one hash-bound Nginx rollback-to-legacy and forward-cutover drill; automatic restoration on any failed cutover probe. |
| Non-goals | No product code or visual change; no new build, registry, release, TLS certificate, DNS, firewall, secret, Grafana/Loki/Tempo/Alertmanager, enterprise proof system, load/soak campaign, top3/proxy/jobs repair, or legacy shutdown/deletion. |
| Operations deferred | Legacy retirement; a second real Archive needed before the new stack has an in-stack production data rollback target; extended load/soak and SLO sign-off. Until then, rollback is the exact Nginx restore to the still-running legacy API/MySQL/Redis serving path; the loader is not a rollback dependency. |
| Stop/rollback conditions | Stop before writes on capacity, artifact, B2/status/root/project/port/backup, installed-operations, tool, stopped-loader, or legacy-serving-baseline failure. Deployment failure restores and verifies exact B2 application/env state; it SHALL NOT remove the existing project/root, alter installed operations/proxy definitions, or alter the stopped loader. During cutover, restore the exact Nginx backup and reload if syntax or any required public probe fails. Never repair or remove protected legacy/unrelated state as part of this change. |

This change touches no other repository. It explicitly authorizes only the
named `myserver` production state and branch push above. The recovery apply may
resume only after these amended artifacts are strict-valid, reviewed with zero
P0/P1 findings, committed, pushed, and the remote branch matches that commit.
