## Capability Boundary

| Field | Declaration |
|---|---|
| Status | Production activation specified and explicitly authorized; apply is pending. |
| Owner | Operations. Main agent owns specification/audit/acceptance; one deployment subagent owns the exact remote apply. |
| Writable paths | This change and exact absent local `/tmp/bgmss-production-artifact-30426027299`. On `myserver`, only `/srv/bgmss-v2/**` including `/srv/bgmss-v2/incoming/run-30426027299`; running-to-stopped state of legacy loader container ID `84d7ca5dcf10b5aae2eb44bf942f2730c3a155ae771aec57946ddfea1eff2bc9` after its project `bgmss`/service `loader` labels and protected fields still match the recorded baseline; `/etc/nginx/nginx.conf`, absent `/etc/nginx/nginx.conf.pre-bgmss-v2`, transient `/etc/nginx/.nginx.conf.bgmss-v2.tmp`, `/etc/systemd/system/bgmss-archive-update.{service,timer}`, `/etc/logrotate.d/bgmss-nginx`, Compose project `bgmss-v2`, admitted API/updater images, pinned Prometheus image, and loopback ports `18080`/`19090`. |
| Read-only protected inputs | Accepted repository implementation and Actions artifact; `/srv/bgmss/**`; every Compose project `bgmss` object and field except exact running-state transition above; the loader image, labels, restart policy, mounts, config, and data remain read-only; TLS keys/certificates; DNS/firewall/SSH; every unrelated vhost, route, service, process, container, image, volume, network, log, data path, and host file. |
| Deletion complement | No protected object. The unchanged exact local transfer root may be removed after transfer. Failure cleanup may affect only exact `bgmss-v2` objects; the exact Nginx backup restores traffic. No prune, legacy cleanup, broad deletion, or Archive retention cleanup. |
| Mutable refs | Branch documentation commit/push, new runtime current/previous application and data refs under its lock, project `bgmss-v2`, exact legacy-loader running-to-stopped state, exact Nginx active file/backup, and new systemd enablement links. |
| Consumes | Green run `30426027299`, bundle source `bd3197d639a32831f3fbcfab698cc387393d2928`, pinned Prometheus digest, expanded `myserver`, existing TLS vhost, and accepted runtime endpoints. |
| Produces | A live, observable, independently named new stack with a real Archive and a reversible public traffic switch while the legacy API/MySQL/Redis serving path remains running and the exact loader remains intentionally stopped. |
| Dependencies | Exact byte capacity and collision gate; exact artifact ID/name/head admission; internal deployment health; real updater success; Nginx syntax/hash success; content-aware public probe success. |
| Deliverables | Production root/runtime, real Archive, host timer/log configuration, live frontend/API, exact Nginx rollback, archived OpenSpec, commit, and push. |
| Acceptance | All scenarios below plus the unchanged isolated-validation requirements in the main capability. |
| Non-goals | Product changes, build/release systems, TLS/DNS/firewall/secrets, extended observability, unrelated-service repair, load/soak sign-off, or legacy retirement. |
| Operations deferred | Legacy shutdown/deletion, extended capacity testing, and in-stack production data rollback until a second real Archive exists. |
| Stop/rollback conditions | Stop before writes on any gate failure; stop only the new project before cutover; restore and reload the exact Nginx backup on any cutover failure; never repair protected state to force success. |

## ADDED Requirements

### Requirement: Production activation SHALL pass exact admission gates

Production activation on `myserver` SHALL require a changed post-reboot boot
identity, `MemTotal >= 8053063680` and
`MemAvailable >= 4294967296` bytes computed from `/proc/meminfo`,
`linux/amd64`,
healthy enabled Docker and Nginx, valid Compose v2 and required host tools, at
least 20 GiB free disk, absent local transfer root
`/tmp/bgmss-production-artifact-30426027299`, absent `/srv/bgmss-v2`, absent Compose project
`bgmss-v2`, free loopback ports `18080` and `19090`, absent exact Nginx backup
and temporary, absent updater unit/timer files and loaded unit identities,
absent logrotate file, healthy declared legacy probes, and an admitted bundle
with artifact ID `8713954047`, name
`operations-preview-bd3197d639a32831f3fbcfab698cc387393d2928`, source
`bd3197d639a32831f3fbcfab698cc387393d2928`, run `30426027299`, `linux/amd64`
platform, closed inventory, and valid checksums.

#### Scenario: Every production admission gate passes
- **WHEN** all host, capacity, collision, legacy, and artifact assertions match
- **THEN** apply MAY create only the declared production objects

#### Scenario: An admission gate fails
- **WHEN** any required identity, capacity, path, project, port, tool, legacy probe, checksum, platform, revision, or Actions assertion differs
- **THEN** activation SHALL stop before the first production write and SHALL NOT change protected state

### Requirement: Live traffic SHALL require a real Archive

The production root MAY use the bundle's known minimal Archive only to start
and validate the private loopback runtime. Before any later updater attempt or
public route change, the operator SHALL re-inspect legacy loader container ID
`84d7ca5dcf10b5aae2eb44bf942f2730c3a155ae771aec57946ddfea1eff2bc9`;
require it to still be running with project `bgmss`/service `loader` labels and
image, restart policy, mounts, and config equal to the recorded baseline; stop
only that literal ID; require it to remain the same stopped ID with
`unless-stopped`; and verify the legacy API/MySQL/Redis serving containers and
probes remain healthy. Under the user's explicit authorization, that loader
SHALL remain stopped and SHALL NOT be restarted, replaced, reconfigured, or
treated as a rollback dependency by this change. A successful new one-shot
updater SHALL publish and activate a
contract-valid data version
different from
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
