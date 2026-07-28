# operations-single-host-runtime Specification

## Capability Boundary

| Field | Declaration |
|---|---|
| Status | Investigated: complete; specified: complete only after strict validation and main-agent approval; implemented: no; verified: no; committed: no; pushed: no; released: no; deployed: no. |
| Owner | Operations single-host runtime/recovery apply group. |
| Writable paths | `operations/compose/**`, `operations/config/**`, `operations/prometheus/**`, `operations/nginx/**`, `operations/systemd/**`, `operations/bin/**`, `operations/runbooks/**`, `operations/test/runtime/**`, and operations-root documentation assigned by tasks; generated output only below ignored `operations/.tmp/**`. |
| Read-only protected inputs | Root authorities/oracle/OpenSpec outside this change; product and Contracts sources/artifacts; release/workflow and isolated-validation owner paths; external refs/registries/releases/hosts/secrets/production state. Repository templates may name `/srv/bgmss-v2`, `bgmss_v2`, and `127.0.0.1:18080`, but this apply SHALL NOT write that host root, install templates, start the project, or mutate Nginx/systemd/TLS. |
| Deletion complement | None. Runtime tests may remove only their exact run-owned local temporary roots. Production cleanup definitions SHALL be bounded but SHALL NOT execute in this apply. |
| Mutable refs | Only listed repository worktree files. Production pointers, links, Compose references, services, data, and host refs remain non-mutable until later activation approval. |
| Consumes | Published release-manifest contract from `operations-release-assembly`; immutable Backend/Updater/Frontend artifacts; Archive/current/update-status contracts; API `/livez`, `/readyz`, `/metrics`; guide resource/retention/topology requirements. |
| Produces | Production-boundary Compose and env definitions; Prometheus config; Nginx/systemd templates; fixed deploy/update/activate/rollback/check/cleanup entrypoints; secret interfaces; policy/failure tests; and operator runbooks. |
| Dependencies | `operations-release-assembly`, `backend-container-listener`, `backend-observability`, `updater-development-status`, Backend Archive consumer, updater Archive producer, Archive compatibility/current-pointer contracts, and the operations guide. Direction is published immutable release + Archive contracts → Operations runtime; Operations never weakens consumer/producer gates. |
| Deliverables | The exact writable paths plus deterministic rendered-config, transaction, rollback, retention, security, and recovery tests. |
| Acceptance | Exact production rendering; Compose config and policy checks; unit/failure tests for locks/install/activation/rollback/cleanup; secret/interface scan; Nginx/systemd syntax/static validation without install; resource/port/mount/network/logging assertions; canonical events/status; documentation command tests; strict OpenSpec; exact paths; residue; and diff hygiene. |
| Non-goals | Starting or modifying production, changing application behavior, building on the host, serving Frontend from a long-lived container, public metrics, full observability stack, user data persistence, migration/cutover, legacy compatibility service, or legacy deletion. |
| Operations deferred | Installation under `/srv/bgmss-v2`; creation of users/groups/secrets; image pull; production Compose start; Nginx/systemd/TLS/DNS/firewall mutation; real weekly run; SLO/capacity sign-off; public preview/cutover; dual-stack operation; stability windows; and legacy retirement. |
| Stop/rollback conditions | Repository apply stops on product-owner edit need, mutable/unpinned dependency, unsafe path/command, resource/secret leak, duplicated semantic validation, unbounded retention/deletion, or live-host mutation. Defined production transactions stop before activation on invalid manifest/checksum/compatibility/space/ownership and restore the previous exact release or data state on post-switch failure; unresolved rollback failure preserves evidence and requires manual recovery. |

## ADDED Requirements

### Requirement: Production definitions SHALL have one exact reserved topology

Repository production definitions SHALL render only for application root
`/srv/bgmss-v2`, Compose project `bgmss_v2`, and API publication
`127.0.0.1:18080:8080`. Long-lived services SHALL be `api` and `prometheus`;
`updater` SHALL be one-shot with no restart policy. API SHALL explicitly listen
on `0.0.0.0:8080` inside the private Compose network. Prometheus SHALL scrape
API `/metrics` every 30 seconds and expose no host or public port. Frontend
files SHALL be installed into versioned host directories for host Nginx, not
served by another long-lived container. No service SHALL join a legacy
network or share a legacy writable path/volume. Prometheus SHALL be exact
`prom/prometheus:v3.13.1-distroless@sha256:214f8427c8fba80c327bb94a75feb802ae12f2d6ca30812aa6e7d22f09bbea80`;
its admitted `linux/amd64` child manifest SHALL be
`sha256:335b5796a6e4355530475575253f84de20b8ad07bf899f65ed218451ce4c60b4`
with descriptor size `4067`. It SHALL run as UID/GID `65532` without any
shell-dependent health or control command.

#### Scenario: Production configuration is rendered
- **WHEN** the exact production profile is rendered and normalized
- **THEN** its root, project, services, loopback API bind, internal networks, mounts, restart policies, and absence of named/legacy volumes match the closed topology

#### Scenario: A setting could expose or collide with a service
- **WHEN** a wildcard/public bind, another port/root/project, public metrics, extra long-lived service, mutable image tag, legacy network, or shared writable path appears
- **THEN** configuration verification fails before any Compose command

### Requirement: Filesystem, privilege, and secret boundaries SHALL be explicit

The production layout SHALL use versioned immutable releases, an atomic
`current-frontend` link, root-owned Compose/release definitions, `data/current.json`,
`data/update-status.json`, `data/versions`, actual
`data/.bgmss-stage-*` producer paths, a fixed host lock, Prometheus TSDB, and a
separate secret directory. Each release SHALL contain the verified standalone
`bin/archive-smoke`. The data root SHALL be root-owned, Updater-group-writable,
and sticky (`01770`); existing `current.json` SHALL remain root-owned. API
SHALL mount Archive and status inputs read-only. Updater SHALL receive the
actual data root as `produce --output-root`, may write only the
`.bgmss-stage-*`, `versions`, and `update-status.json` objects it owns, and
SHALL neither read nor write `current.json`. The root wrapper SHALL verify a
closed ownership/inventory policy before and after the producer and SHALL be
the sole current-pointer writer. Prometheus SHALL write only its TSDB; Nginx
SHALL read only the current Frontend tree. Runtime containers SHALL be non-root, drop unnecessary
capabilities, use `no-new-privileges`, and receive no Docker socket, source
tree, compiler, package manager, SSH material, registry credential, or
undeclared host path. Secret values SHALL be untracked host files, never image
layers, manifests, build arguments, logs, or Frontend variables.

#### Scenario: Service mounts and privileges are audited
- **WHEN** Compose and example interfaces are rendered
- **THEN** every path has one declared reader/writer, runtime privilege is minimal, and no secret value or Docker control plane enters a container

#### Scenario: Ownership could cross a boundary
- **WHEN** API receives a writable Archive, Updater receives host control, Prometheus writes application data, Nginx writes releases, or a secret/source/tool path is mounted
- **THEN** the policy gate fails

### Requirement: Application installation SHALL be one locked reversible transaction

The fixed deployment entry SHALL accept only a strict release version and
published release-manifest digest. After acquiring the shared non-waiting host
`flock`, it SHALL record the previous manifest, exact image digests, Compose
reference, and Frontend link; verify checksums, source/version/platform and
current Archive compatibility; pull exact image digests; install the Frontend
into a new versioned directory; atomically replace the API release reference;
start or restart the single API; require `/readyz`, expected
`bgmss_build_info`, expected `dataVersion`, and a minimal query within 60
seconds; and only then atomically replace `current-frontend` last. These two
references SHALL NOT be represented as one cross-file atomic operation.
Success SHALL commit one current release state. Failure at any later step
SHALL restore all captured references in reverse order, restart, and verify
the previous state before releasing the lock. The production host SHALL never
build source or follow `latest`.

#### Scenario: A compatible application release activates
- **WHEN** manifest, checksums, disk, current Archive compatibility, exact images, Frontend install, readiness, build identity, data identity, and minimal query pass
- **THEN** the new release becomes current and the previous accepted release remains available for bounded rollback

#### Scenario: Post-switch readiness fails
- **WHEN** the candidate fails readiness, build/data identity, timeout, or minimal query after references changed
- **THEN** the entry restores and verifies the exact previous app/Frontend state and exits nonzero with both primary and rollback evidence

### Requirement: Archive update and activation SHALL be finite, serialized, and reversible

The weekly systemd timer SHALL use
`OnCalendar=Sun *-*-* 03:30:00 Asia/Shanghai`, `Persistent=true`, and invoke
one root-managed oneshot wrapper with a six-hour hard timeout and low CPU/I/O
priority. Deploy,
schema release, scheduled/manual update, and data rollback SHALL share one
fixed non-waiting `flock`. The wrapper SHALL run the release-manifest-pinned
Updater image once with the accepted embedded contracts/catalog and exact
standalone `releases/<version>/bin/archive-smoke` mounted read-only and
executable as `/opt/bgmss/release/archive-smoke`, leaving current data
untouched on no-change or failure. It SHALL pass the actual data root to
`produce --output-root`; only the wrapper may inspect and replace
`current.json`. For a published version it SHALL validate paths, permissions,
manifest/SQLite digests, schema/domain/cast compatibility, and disk; atomically
switch `current.json`; restart API; and require expected readiness/data/app
identity within 60 seconds. Success SHALL emit exactly one canonical
LF-terminated JSON event with exactly `event`, `run_id`, `app_version`,
`old_data_version`, `new_data_version`, and `duration_seconds`, where `event`
is `update_activated`. Failure SHALL restore the prior pointer, restart and
verify it, and SHALL stop automatic cycling if both new and previous states
fail.

#### Scenario: A new snapshot activates
- **WHEN** one updater run publishes a valid compatible snapshot and the restarted API becomes ready with the expected identities
- **THEN** current changes once, one `update_activated` event records run/old/new/duration/app version, and bounded retention may proceed

#### Scenario: Update is unchanged or fails before switch
- **WHEN** updater reports no-change, acquisition/digest/space/quality failure, timeout, or lock contention
- **THEN** current and API stay unchanged, no `update_activated` event is emitted, and the stable status/exit/journal result identifies the outcome

#### Scenario: New and previous snapshots both fail
- **WHEN** post-switch readiness fails and restoring the previous pointer also fails verification
- **THEN** the wrapper stops retrying, releases no success claim, preserves both states/evidence, and requires manual recovery

### Requirement: Application and data rollback SHALL remain separate

Application rollback SHALL restore the previous API image digests, release
manifest, Compose reference, and Frontend link while retaining the current
compatible data pointer. Data rollback SHALL restore only the previous
compatible `current.json` and restart the current application release. A
combined state transition SHALL occur only for a later explicitly approved
schema release transaction whose manifest declares it. Every rollback SHALL
validate compatibility, `/readyz`, exact app/data identities, a minimal query,
logs, and metrics.

#### Scenario: An operator rolls back data
- **WHEN** the previous snapshot is compatible with the current application and its bytes pass validation
- **THEN** only the data pointer and API process generation change

#### Scenario: A rollback crosses state dimensions
- **WHEN** an ordinary app rollback also changes data or an ordinary data rollback also changes app/Frontend
- **THEN** the command refuses the transaction before switching either state

### Requirement: Resource, log, metric, and retention policy SHALL be bounded

The production profile SHALL enforce the guide's single-stack baseline:
API hard memory limit 1536 MiB, `GOMEMLIMIT=1024MiB`, existing product cache
and concurrency semantics, 30-second request bound, Prometheus hard limit 512
MiB with seven-day/512 MiB TSDB retention, and a one-shot low-priority Updater
with an initial hard limit of 640 MiB. Isolated full-Archive validation SHALL
measure peak memory and prove no OOM within that cap; failure SHALL stop before
production activation and require a reviewed specification amendment. This
measurement SHALL NOT be reported as the formal development benchmark. Compose logs
SHALL use journald; application journal retention SHALL be 7–14 days and at
most 512 MiB through documented host policy. Nginx logging SHALL exclude query
strings and use bounded rotation. Prometheus rules SHALL cover only signals
actually exported by the API, including available 5xx/upstream/queue/cache/
oversize/update failure metrics. Bounded `bgmss-ops check` host facts SHALL
cover readiness, API RSS, last Archive success older than nine days, and
manifest/app/data identity consistency; no unexported product metric may be
invented. Prometheus failure SHALL NOT
make API unready or restart API.

#### Scenario: Runtime policy is rendered and queried
- **WHEN** Compose, Prometheus, logging templates, and run checks are inspected
- **THEN** exact limits/retention/private scrape and every first-line check are bounded and reproducible

#### Scenario: Monitoring becomes a product dependency
- **WHEN** Prometheus failure blocks API readiness, metrics/UI is publicly published, or an unapproved Grafana/Loki/Tempo/OTel/Alertmanager/node-exporter service appears
- **THEN** acceptance fails

### Requirement: Cleanup SHALL retain recovery state and reject unknown residue

Cleanup definitions SHALL retain only current and previous accepted
application/Frontend releases, current and previous successful snapshots,
bounded status/log/TSDB state, and explicitly documented immutable recovery
evidence. They SHALL clean only `.bgmss-stage-*` directories carrying a completed run
identity and only releases/snapshots proven neither current nor previous.
Before removal they SHALL verify exact root, no symlink traversal, device,
ownership marker, closed inventory, free-space/recovery gates, and one
successful rollback exercise. Unknown, replaced, active, unresolved, or
out-of-root paths SHALL be preserved and reported. No normal deploy,
Compose-down, or updater command SHALL delete a legacy volume.

#### Scenario: Expired owned state is eligible
- **WHEN** current/previous identities are healthy, rollback was exercised, and an older closed run/release passes every ownership/path check
- **THEN** cleanup removes only that enumerated state and records what changed

#### Scenario: Cleanup target is ambiguous
- **WHEN** a path is symlinked, active, foreign, unmarked, outside the root, on another device, or contains an unknown entry
- **THEN** cleanup stops without broad recursive deletion

### Requirement: Host integration templates SHALL be inert until explicitly installed

Nginx templates for `search.bgmss.fun` SHALL serve the versioned Frontend
link, proxy only approved API/image routes to `127.0.0.1:18080`, keep metrics
private, log `$uri` rather than `$request_uri`, and set
`Referrer-Policy: strict-origin-when-cross-origin`. They SHALL NOT define a
legacy host, `/statistics`, certificate path/value, or cutover action.
Systemd templates SHALL
define the fixed persistent timer and bounded oneshot wrapper without embedding
secrets or arbitrary shell. Repository tests MAY syntax-check these files in
an isolated root, but this change SHALL not copy them into `/etc`, reload
Nginx/systemd, bind public ports, create users, or start the production
project.

#### Scenario: Repository host templates are validated
- **WHEN** template syntax, fixed paths/commands, headers, routes, timeouts, and secret absence are checked without installation
- **THEN** definitions are accepted as inert production inputs only

#### Scenario: Apply attempts live host integration
- **WHEN** an implementation or validation command would write `/etc`, reload a daemon, alter TLS/DNS/firewall/users, bind public traffic, or start `bgmss_v2`
- **THEN** it stops and requires a later explicit activation approval
