## Why

The accepted single-host runtime and explicit updater proxy are installed
privately at `/srv/bgmss-v2`; the exact legacy loader is intentionally
stopped, and the old serving path remains public and healthy. Direct updater
access first failed safely with `HTTPS_REQUEST_FAILED`. The subsequent proxy
run `1f1ef640-6ece-4c53-8cf1-2df480746891` exposed and safely rejected an
unsupported timestamp comparison. Source
`be48847bc26bcda28c9f08f6807f5dec40d479f4` is now deployed privately with
that comparison removed. Its only authorized updater run
`6d7dd3d4-9eb4-472e-af09-0561dc313617` authenticated and acquired the official
Archive, then failed without publication while SQLite file-backed temporary
work was constrained by the updater's 256 MiB `/tmp` tmpfs. The remaining
work is one bounded Compose-file correction, one new updater invocation, and
the already planned host integration and reversible traffic switch.

## What Changes

- Preserve completed private source
  `be48847bc26bcda28c9f08f6807f5dec40d479f4`, current env SHA-256
  `76de7645452162d04afe0679e346d6b61661c80aec15036814ec1ae5c58ab1ce`,
  and previous env SHA-256
  `f2f63a26d9178e3f9effd6acb8b1ca195056be2050b157bf871386d45c280646`
  as the exact application recovery baseline; no application image or release
  ref changes in this recovery.
- Admit exact operations source
  `1505c5d7c36f457ed8d9e3be542e2422fe2811fc` and transactionally replace only
  `/srv/bgmss-v2/compose/compose.yaml`, retaining its exact prior bytes for
  immediate rollback.
- Require an exact current-baseline, capacity, collision, legacy-health,
  proxy-endpoint/network, operations-byte, and replacement-artifact preflight
  before the recovery write.
- Preserve the installed updater-only projection onto existing external
  network `proxy-net` with
  `BGMSS_HTTPS_PROXY=http://myserver-proxy:7897`; API and Prometheus remain off
  that network. Require only updater to additionally receive
  `SQLITE_TMPDIR=/var/lib/bgmss/archive`, while API and Prometheus receive
  neither updater input. After private projection checks, permit exactly one
  newly authorized updater invocation and prohibit live traffic until the
  active Archive is valid and differs from the known minimal fixture.
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
| Status | Completed on `myserver`: source `be48847bc26bcda28c9f08f6807f5dec40d479f4` serves real Archive `dv1-9d794033f12b8bcd60d8c890115a76ca52060ae13b357b3c32e036f94bb67888`; updater run `6eb4dd5e-c921-4251-b189-0ae522343219` published successfully; public Nginx is on candidate hash `6fe8171ebd4a45eaa94cdba27f561d9207d433cd8bf1ef4e727c2e57a31fb7df` after a successful rollback/forward drill; the weekly timer is enabled but inactive; and the legacy serving stack remains available with its loader intentionally stopped. |
| Owner | Main agent directly owns specification, decisions, repository lifecycle, exact remote implementation, audit, and final acceptance. |
| Writable paths | This change in the repository; on `myserver`, exact new incoming root `/srv/bgmss-v2/incoming/run-30452886753` containing only `compose.yaml` and `compose.yaml.before-sqlite-temp`; `/srv/bgmss-v2/compose/compose.yaml`; exact transient `/srv/bgmss-v2/compose/.compose.yaml.sqlite-temp.tmp`; updater publication paths under `/srv/bgmss-v2/data/**` only through the existing lock/transaction; `/etc/nginx/nginx.conf`; new absent backup `/etc/nginx/nginx.conf.pre-bgmss-v2`; exact transient `/etc/nginx/.nginx.conf.bgmss-v2.tmp`; new `/etc/systemd/system/bgmss-archive-update.service`; new `/etc/systemd/system/bgmss-archive-update.timer`; new `/etc/logrotate.d/bgmss-nginx`; Docker project `bgmss-v2` only through the updater transaction; and the two new timer enablement links. Application releases/env/images, other installed operations definitions, proxy objects, and loopback ports remain read-only. |
| Read-only protected inputs | All product bytes, artifacts, images, application release/env refs, and operations bytes except the admitted Compose file; historical runs/artifacts/releases; current status/data until the updater transaction; all host paths and services not listed writable; `/srv/bgmss/**`; all legacy Compose project `bgmss` bytes/objects; exact stopped loader ID `84d7ca5dcf10b5aae2eb44bf942f2730c3a155ae771aec57946ddfea1eff2bc9` including running state/image/labels/restart policy/mounts/config/data; existing `proxy-net` and `myserver-proxy` lifecycle/config/credentials (inspection and connection only); TLS certificate/key files; DNS, firewall, SSH, unrelated Nginx vhosts/routes, `bgmtl`, QiBlood, top3, jobs, and all unrelated Docker/systemd state. |
| Deletion complement | No legacy or unrelated file, service, container, image, network, volume, log, or data. A failed Compose projection SHALL atomically restore the exact saved old Compose bytes before any updater invocation. Updater failure SHALL retain the exact current application and minimal data pointer through the existing transaction; a cutover failure may restore `/etc/nginx/nginx.conf` from the exact backup. The production root, Compose evidence root, and Nginx backup are preserved for diagnosis. No prune, broad glob, historical data deletion, or application redeploy. |
| Mutable refs | This branch and its documentation commit/push; the exact installed Compose file; current/previous data pointers under the existing transaction lock; project `bgmss-v2` only through the updater transaction; the exact Nginx active file and backup; and the two new systemd unit enablement links. Application env/release refs remain immutable. |
| Consumes | Current private source `be48847bc26bcda28c9f08f6807f5dec40d479f4`; accepted product `8282996f3f0cb0e2cde2a91ce71d425217ffa9d6`; current/previous env SHA-256 `76de7645452162d04afe0679e346d6b61661c80aec15036814ec1ae5c58ab1ce`/`f2f63a26d9178e3f9effd6acb8b1ca195056be2050b157bf871386d45c280646`; failed updater UUID `6d7dd3d4-9eb4-472e-af09-0561dc313617` and status SHA `a10facccaa15ea9383414350c6a09550a0b2d23927573308292a0ff62ac1d3da`; exact operations source `1505c5d7c36f457ed8d9e3be542e2422fe2811fc` and run `30452886753`; old Compose blob/SHA-256 `00951ee0ffe23e4d2e5723857a54d2eceee51a63`/`dfe55f7124454075b36131302b14dd3dd4ef10c310328bfefa62169ba29a3a2a`; candidate blob/SHA-256 `0daee531f811ff826bba1836897eb9cc54d6d529`/`13d0608d29b38cedc62821bb02f5646bf702e9419b8ee946c60c8580485cb272`; pinned Prometheus digest; expanded `myserver`; existing TLS vhost; and existing `proxy-net`/`myserver-proxy:7897`. |
| Produces | One live `/srv/bgmss-v2` deployment with a non-minimal Archive, API/Prometheus on loopback, new frontend and `/api/v1/` on `search.bgmss.fun`, an enabled weekly update timer, existing-journal logs plus bounded per-site Nginx logs, and an exact Nginx rollback file while the legacy API/MySQL/Redis serving path remains running and the exact loader remains intentionally stopped. |
| Dependencies | Current `/srv/bgmss-v2` images identify source `be48847bc26bcda28c9f08f6807f5dec40d479f4`; current/previous env, failed status, minimal-only data, old Compose hash/mode, and absent new incoming/temporary/integration targets match the recorded baseline; exact-head Actions run `30452886753` has both jobs green; and the remote branch equals the accepted amendment commit. Capacity gates, Docker/Compose/Nginx health, legacy serving health, stopped-loader identity, read-only proxy inspection, updater-only exact SQLite/proxy projection, successful single new invocation before traffic, and `nginx -t` before every reload remain mandatory. |
| Deliverables | Reviewed/strict-valid OpenSpec; production root and runtime; non-minimal Archive; installed timer/logging configuration; successful internal and public probes; preserved legacy rollback channel; archived change; commit and push. |
| Acceptance | Exact current source/env/status/data/Compose/proxy preflight; old/new Compose identity and transactional rollback verification; updater-only exact SQLite/proxy projection with API/Prometheus excluded; `/livez`, `/readyz`, catalog, metrics, Prometheus scrape, journald driver/tag/log checks; exact legacy loader stopped with same identity/config/policy and old serving probes healthy; exactly one newly authorized updater invocation reaches terminal success with active data version unequal to the minimal fixture; systemd/logrotate/Nginx validation; public frontend bytes equal the deployed `index.html` and public `/api/v1/catalog` JSON reports the accepted real version; declared healthy legacy probes remain healthy while exact pre-existing excluded failures stay unchanged; one hash-bound Nginx rollback-to-legacy and forward-cutover drill; automatic restoration on any failed cutover probe. |
| Non-goals | No product code or visual change; no new build, registry, release, TLS certificate, DNS, firewall, secret, Grafana/Loki/Tempo/Alertmanager, enterprise proof system, load/soak campaign, top3/proxy/jobs repair, or legacy shutdown/deletion. |
| Operations deferred | Legacy retirement; a second real Archive needed before the new stack has an in-stack production data rollback target; extended load/soak and SLO sign-off. Until then, rollback is the exact Nginx restore to the still-running legacy API/MySQL/Redis serving path; the loader is not a rollback dependency. |
| Stop/rollback conditions | Applied gates stopped on any capacity, artifact, source/status/root/project/port/backup, operations, tool, stopped-loader, or legacy-serving mismatch. Compose projection failure restored exact old Compose bytes; updater failure retained the current application/minimal data; cutover failure restored exact Nginx backup bytes. No protected legacy/unrelated state was repaired or removed. |

This change touched no other repository. It activated only the named
`myserver` production state and branch lifecycle above. All declared production
steps are complete; remaining deferred work is limited to legacy retirement, a
second real Archive before in-stack data rollback, and extended load/soak.
