## Capability Boundary

| Field | Declaration |
|---|---|
| Status | B2 private activation and one safe proxy updater failure completed; timestamp-fix artifact deployment, one new updater invocation, and public integration remain explicitly authorized and pending. |
| Owner | Operations. Main agent directly owns specification, exact remote apply, audit, and acceptance. |
| Writable paths | This change and exact local `/tmp/bgmss-production-artifact-30449279352`. On `myserver`, only existing `/srv/bgmss-v2/**` through declared transactions, including new `/srv/bgmss-v2/incoming/run-30449279352`, new release, and current/previous refs; `/etc/nginx/nginx.conf`, absent `/etc/nginx/nginx.conf.pre-bgmss-v2`, transient `/etc/nginx/.nginx.conf.bgmss-v2.tmp`, `/etc/systemd/system/bgmss-archive-update.{service,timer}`, `/etc/logrotate.d/bgmss-nginx`, Compose project `bgmss-v2` only through transactional replacement/restore, admitted API/updater images, pinned Prometheus image, and loopback ports `18080`/`19090`. Installed operations/proxy definitions and `proxy-net` remain read-only. |
| Read-only protected inputs | Accepted implementation/artifacts outside the closed inventory; historical current release until transaction commit; `/srv/bgmss/**`; every Compose project `bgmss` object/field; exact stopped loader ID `84d7ca5dcf10b5aae2eb44bf942f2730c3a155ae771aec57946ddfea1eff2bc9` including running state/image/labels/restart policy/mounts/config/data; existing `proxy-net` and `myserver-proxy` lifecycle/config/credentials; TLS keys/certificates; DNS/firewall/SSH; every unrelated vhost, route, service, process, container, image, volume, network, log, data path, and host file. |
| Deletion complement | No protected object and no removal of the existing `bgmss-v2` project/root. The exact local transfer root and identity-matching new run-owned incoming temporaries may be removed after transfer/rollback. Deployment failure SHALL restore and verify exact B2 application/env state without altering installed operations/proxy definitions; the exact Nginx backup restores traffic. No prune, legacy cleanup, broad deletion, or Archive retention cleanup. |
| Mutable refs | Branch documentation commit/push, runtime current/previous application and data refs under its lock, project `bgmss-v2` only through declared transactions, exact Nginx active file/backup, and new systemd enablement links. |
| Consumes | Current private B2 `016160f7a63d68639a50e226c052fe75d5888f5f`; accepted product `8282996f3f0cb0e2cde2a91ce71d425217ffa9d6`; green run `30449279352`; bundle source `be48847bc26bcda28c9f08f6807f5dec40d479f4`; artifact `8723283346`; failed updater UUID `1f1ef640-6ece-4c53-8cf1-2df480746891`; existing `proxy-net`/`myserver-proxy:7897`; pinned Prometheus digest; expanded `myserver`; existing TLS vhost; and accepted runtime endpoints. |
| Produces | A live, observable, independently named new stack with a real Archive and a reversible public traffic switch while the legacy API/MySQL/Redis serving path remains running and the exact loader remains intentionally stopped. |
| Dependencies | Exact B2/current-status/capacity/collision gate; exact replacement artifact and installed-operations identity admission; read-only proxy/network/listener inspection; updater-only projection; internal deployment health; the single newly authorized updater invocation succeeds; Nginx syntax/hash success; content-aware public probe success. |
| Deliverables | Production root/runtime, real Archive, host timer/log configuration, live frontend/API, exact Nginx rollback, archived OpenSpec, commit, and push. |
| Acceptance | All scenarios below plus the unchanged isolated-validation requirements in the main capability. |
| Non-goals | Product changes, build/release systems, TLS/DNS/firewall/secrets, extended observability, unrelated-service repair, load/soak sign-off, or legacy retirement. |
| Operations deferred | Legacy shutdown/deletion, extended capacity testing, and in-stack production data rollback until a second real Archive exists. |
| Stop/rollback conditions | Stop before writes on any gate failure; deployment failure restores and verifies exact B2 application/env state without removing its project/root or altering installed operations/proxy definitions; restore and reload the exact Nginx backup on any cutover failure; never repair protected state to force success. |

## ADDED Requirements

### Requirement: Production activation SHALL pass exact admission gates

The completed B2 deployment established the current private baseline. Before
the next write, activation on `myserver` SHALL require boot ID
`54ecbe53-bba8-46e9-b9a2-d93603470866`, `MemTotal >= 8053063680` and
`MemAvailable >= 4294967296` bytes computed from `/proc/meminfo`,
`linux/amd64`, healthy enabled Docker and Nginx, valid Compose v2/required
tools, at least 20 GiB free disk, healthy declared legacy probes, and exact
legacy loader ID
`84d7ca5dcf10b5aae2eb44bf942f2730c3a155ae771aec57946ddfea1eff2bc9`
present but stopped with unchanged protected fields.

Existing `/srv/bgmss-v2`, project `bgmss-v2`, loopback ports
`18080`/`19090`, current frontend/tools links, API/Prometheus/catalog/metrics,
and current images SHALL identify source
`016160f7a63d68639a50e226c052fe75d5888f5f`. Current/previous env SHA-256
SHALL equal
`f2f63a26d9178e3f9effd6acb8b1ca195056be2050b157bf871386d45c280646`
and `a74981042693c818b72fe0065128be8ca12a63d630473a643b2f6b12109dc757`.
`/srv/bgmss-v2/data/update-status.json` SHALL be mode/owner `0600`/
`65532:65532`, SHA-256
`156ec67a19d497df8fc62a9e39b5fae46a79356c81483cf9d246e9143703ed46`,
and report the recorded acquisition failure without success. `current.json`
SHALL identify only
`dv1-0a1fa3e9acdb06be34e3535b3c68e322e7d3f4cd87ac30cd4b608b2276ba3ca1`,
`previous.json` SHALL be absent, and exactly that fixture version SHALL exist.

The exact remote incoming root
`/srv/bgmss-v2/incoming/run-30449279352`, Nginx
backup/temporary/candidate, updater unit/timer identities, and logrotate file
SHALL be absent before the write. Local root
`/tmp/bgmss-production-artifact-30449279352` SHALL contain only artifact ID
`8723283346`, name
`operations-preview-be48847bc26bcda28c9f08f6807f5dec40d479f4`, source
`be48847bc26bcda28c9f08f6807f5dec40d479f4`, tree
`52dd582016d40569327c0b87f9fad1cadf5252bb`, run `30449279352`, size
`63282532`, GitHub digest
`sha256:e7aec802a2f95ece998d369e834813bab1800f0cf9e59e2c63466e9932a32bb0`,
`linux/amd64`, the exact nine-file inventory, eight valid checksum entries,
and no symlink or AppleDouble entry.

Existing external network `proxy-net` and endpoint `myserver-proxy:7897`
SHALL pass read-only identity/network/listener inspection and SHALL NOT be
created, altered, or removed. Preflight SHALL NOT create a probe container or
make an acquisition request. The already installed operations definitions
SHALL match this closed, read-only inventory:

| Host target | Git mode / blob | SHA-256 | Installed mode |
|---|---|---|---|
| `/srv/bgmss-v2/operations/bin/deploy` | `100755` / `9adeb63e2398eb1f5ce52ea176a67b41c0672a42` | `aa4b519d452be3aa16a9d1bdef1615f99039c6f148dd1fe7b4b483e2c33adf94` | `0555` |
| `/srv/bgmss-v2/operations/lib/common.sh` | `100644` / `0a0a95ab3ecbd98f6c2015e647fdad424626df7d` | `6d0c7df4c98dba7ad0af3756cba9166ae330ae5282a08b5fb9d414ddae249f8a` | `0444` |
| `/srv/bgmss-v2/compose/compose.updater-proxy.yaml` | `100644` / `0570c3bc02a9883dd44b8ce7c52a1dd26f009200` | `6a1c65dbe7dee0701a3ad697d3a6b9dccdc89fe6a6e11ff3c62671f79fdc7dfa` | `0644` |

#### Scenario: Every replacement admission gate passes
- **WHEN** all host, capacity, collision, legacy, and artifact assertions match
- **THEN** apply MAY create only the declared production objects

#### Scenario: An admission gate fails
- **WHEN** any required identity, capacity, path, project, port, tool, legacy probe, proxy, operations byte, checksum, platform, revision, or Actions assertion differs
- **THEN** activation SHALL stop before the first replacement write and SHALL NOT change protected state

### Requirement: Live traffic SHALL require a real Archive

The production root currently uses the bundle's known minimal Archive only for
the private loopback runtime. Before replacement deployment, the newly
authorized updater invocation, or public route change, the operator SHALL
re-inspect legacy loader container ID
`84d7ca5dcf10b5aae2eb44bf942f2730c3a155ae771aec57946ddfea1eff2bc9`,
require the same ID/project/service/image/restart-policy/mounts/config to remain
present but stopped, and verify legacy API/MySQL/Redis probes remain healthy.
The loader SHALL NOT be restarted, replaced, reconfigured, or treated as a
rollback dependency.

Replacement deployment SHALL preserve exact transport `proxy`, URL
`http://myserver-proxy:7897`, and network `proxy-net`. Compose projection SHALL
attach only updater to that external network and pass only updater the
container input `BGMSS_HTTPS_PROXY`; API and Prometheus SHALL remain absent
from `proxy-net`. After candidate health, read-only proxy/network/listener
inspection, and static projection checks pass, the operator MAY invoke the
updater exactly once under this new authorization. No other updater invocation
or acquisition request is authorized. A successful invocation SHALL publish
and activate a contract-valid data version different from
`dv1-0a1fa3e9acdb06be34e3535b3c68e322e7d3f4cd87ac30cd4b608b2276ba3ca1`;
the API readiness, catalog, metrics, and Prometheus scrape SHALL all report the
same real version. Until a second real Archive is available, production data
rollback SHALL use the retained legacy stack rather than activating the
minimal fixture.

#### Scenario: First real Archive becomes ready
- **WHEN** the updater publishes a non-minimal version and every runtime observer agrees on that version
- **THEN** the new stack MAY proceed to public traffic activation

#### Scenario: Update fails or remains minimal
- **WHEN** the updater fails, reports no valid terminal result, leaves the minimal version active, or observers disagree
- **THEN** the exact legacy loader SHALL remain stopped, public routing SHALL remain on the legacy stack, and the new project MAY remain private for diagnosis

#### Scenario: Proxy transport is projected exactly
- **WHEN** source `be48847bc26bcda28c9f08f6807f5dec40d479f4` deploys with the admitted transport URL/network pair and private checks pass
- **THEN** only updater SHALL join `proxy-net` with `BGMSS_HTTPS_PROXY=http://myserver-proxy:7897`, and exactly one newly authorized production updater invocation MAY run

#### Scenario: Proxy deployment widens authority
- **WHEN** API or Prometheus joins `proxy-net`, another proxy value/network is projected, the endpoint/network is mutated, or another updater invocation is requested after the newly authorized attempt
- **THEN** deployment SHALL stop, retain or restore legacy public routing, and SHALL NOT force progress

#### Scenario: Legacy background updater is retired
- **WHEN** literal container ID `84d7ca5dcf10b5aae2eb44bf942f2730c3a155ae771aec57946ddfea1eff2bc9` passes the required baseline re-inspection and is stopped under the user's explicit authorization
- **THEN** the same container ID/image/labels/policy/mounts/config SHALL remain present but stopped while the old serving path remains healthy

#### Scenario: Loader stop changes protected state
- **WHEN** the loader identity/config/policy differs or its stop harms the old serving path
- **THEN** apply SHALL stop before another updater attempt, host integration, or cutover and SHALL NOT replace or repair the loader

### Requirement: Nginx cutover SHALL be atomic and reversible

Activation SHALL create the exact absent backup
`/etc/nginx/nginx.conf.pre-bgmss-v2`, modify only the existing
`search.bgmss.fun` TLS server so its frontend root resolves to
`/srv/bgmss-v2/current-frontend`, add `/api/v1/` proxying to
`127.0.0.1:18080`, and add the planned per-site logs while retaining the
existing `/statistics`, `/timeline`, and `/proxy` locations. The admitted
candidate SHALL be retained at `/srv/bgmss-v2/config/nginx/nginx.conf`. It
SHALL record and recheck the active preflight SHA-256 before each first write,
require the backup hash to equal it, and use a structure-aware transformation
whose diff changes only that TLS block's frontend root, per-site log
directives using the existing log format, and new `/api/v1/` location while
the retained legacy locations and every other byte/server block remain
unchanged. Activation SHALL copy through the exact same-directory temporary
and atomic rename, run `nginx -t` before each reload, and verify the active
hash equals the intended candidate or backup. It SHALL restore the backup,
revalidate, and reload if the reload or required content-aware public probes
fail, and SHALL perform one successful rollback-to-legacy and
forward-cutover drill before completion.

#### Scenario: Public cutover succeeds
- **WHEN** the candidate configuration validates and reloads, the public frontend response with identity encoding hashes exactly to the deployed new `index.html`, and `/api/v1/catalog` parses as JSON with the accepted real `dataVersion` and a non-empty catalog
- **THEN** the new stack SHALL receive production traffic while the legacy API/MySQL/Redis serving containers remain running and the exact loader remains intentionally stopped

#### Scenario: Candidate configuration or public probe fails
- **WHEN** syntax, reload, frontend, or API acceptance fails
- **THEN** the exact backup SHALL be restored and reloaded, and legacy probes SHALL be required to recover before returning failure

#### Scenario: Basic traffic rollback is drilled
- **WHEN** the first new-stack cutover succeeds
- **THEN** activation SHALL atomically restore/reload the hash-equal legacy backup, require the public frontend to match the captured old `index.html` and declared healthy legacy routes, and then atomically reapply/reload the retained candidate and repeat the content-aware new frontend/API probes without stopping either stack

### Requirement: Production host integration SHALL remain minimal

Activation SHALL begin only after the intentionally stopped legacy loader and
healthy old serving path have been verified. It SHALL install the reviewed weekly updater service/timer and Nginx
logrotate file; run `systemctl enable` without starting the persistent timer in
the current boot; retain loopback-only Prometheus with the reviewed seven-day/
512 MiB policy; leave the existing global journal configuration unchanged;
and verify API, metrics, scrape, Compose journald driver/tag/logs, systemd,
logrotate, Nginx, capacity, and legacy coexistence after cutover. Beyond the
already-authorized exact loader stop, it SHALL NOT further stop, disable,
retire, or mutate any legacy object, delete unrelated logs, or repair
unrelated pre-existing host failures.

#### Scenario: Minimal production integration is healthy
- **WHEN** the timer is enabled but inactive in the current boot, templates validate, runtime checks pass, and legacy identities and declared probes remain healthy
- **THEN** production activation MAY be reported complete with the legacy API/MySQL/Redis serving path as rollback and the loader explicitly excluded from rollback

#### Scenario: Integration harms the legacy stack
- **WHEN** a protected legacy identity, container, route, listener, or declared probe changes or fails during activation
- **THEN** traffic SHALL roll back and no legacy repair or retirement action SHALL be attempted by this change
