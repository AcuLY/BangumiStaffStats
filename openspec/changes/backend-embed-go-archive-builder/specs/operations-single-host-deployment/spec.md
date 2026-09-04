## Capability Boundary

| Field | Declaration |
|---|---|
| Status | Modified by `backend-embed-go-archive-builder`; repository definitions only, not deployed. |
| Owner | Operations owns the reduced single-host topology, bundle/deploy definitions, templates, and isolated validation; Backend owns scheduling/build/activation semantics. |
| Writable paths | This delta spec, `operations/{compose.yaml,env.example,README.md,bin,lib,systemd,test}/**`, `.github/workflows/operations-preview.yml`, and exact Operations CI assertions declared by the change. |
| Read-only protected inputs | Product/API/query semantics, Backend/Frontend artifact bytes, real Archive roots, active hosts/services/routes, legacy state, production, secrets, remotes, and archived OpenSpec. |
| Deletion complement | Archive updater service/timer, host `update` and `rollback-data` commands, updater Compose/image/env/tool state, and exact updater-only validation/tests after accepted Backend replacement. |
| Mutable refs | Local `codex/embed-go-archive-builder` only; no host or remote refs. |
| Consumes | Accepted Backend and Frontend artifacts, current contract-valid Archive, Prometheus image pin, and Backend builder/scheduler observability. |
| Produces | One Backend/Frontend deployment bundle, API plus Prometheus Compose topology, writable API Archive mount, and updater-free templates/validation. |
| Dependencies | `backend-build-artifact`, `contracts-artifact-compatibility`, `backend-archive-builder`, and existing single-host routing/egress authority. |
| Deliverables | Reduced bundle/build/deploy scripts, Compose/env/docs, monitoring rules, isolated tests, and deletion of updater wrappers/units. |
| Acceptance | Rendered topology has only API and Prometheus, no Updater image/service/systemd unit/status file/data rollback; API rootfs remains read-only and Archive bind is the sole product-data write authority. |
| Non-goals | Live deployment, public routing change, host scheduler replacement, ORM, multi-instance coordination, durable job queue, or unrelated host cleanup. |
| Operations deferred | Push/release/deploy, real Archive update, host unit/file deletion, live version deletion, routing, legacy retirement, and production migration require separate explicit authorization. |
| Stop/rollback conditions | Stop on artifact/schema drift, unintended host authority, unsafe writable mount/deletion, legacy overlap, or failed isolated validation; roll back owned repository definitions only. |

## ADDED Requirements

### Requirement: Embedded builder temporary storage SHALL remain on the Archive disk

The API's embedded Go Archive builder SHALL place staging directories, partial
downloads, candidate SQLite files, and file-backed SQLite temporary state below
the configured writable Archive root. The container `/tmp` tmpfs SHALL remain
bounded and SHALL NOT become the storage location for a complete-source build.
Prometheus SHALL receive no Archive write mount or builder temporary-storage
configuration.

#### Scenario: API builder projection uses disk-backed state
- **WHEN** Compose renders an admitted release and the embedded builder starts a candidate build
- **THEN** all complete-source mutable data SHALL remain below the API's Archive bind mount
- **AND** API and Prometheus SHALL retain their declared root-filesystem, resource, security, and network boundaries

#### Scenario: Temporary-storage authority widens
- **WHEN** builder staging resolves outside the Archive mount, uses an undeclared host path, grants Prometheus data-write authority, or makes the image root writable
- **THEN** Operations validation SHALL fail before deployment

## MODIFIED Requirements

### Requirement: Actions SHALL produce one bounded AMD64 deployment bundle

The already registered Development manual-dispatch entry SHALL call one
same-revision reusable read-only workflow that builds the accepted Product once
for `linux/amd64` and uploads one short-lived bundle containing the Backend API
OCI archive, frontend static archive, minimal Archive fixture, source/version
metadata, and SHA-256 inventory. Push and pull-request runs SHALL NOT call the
bundle workflow. The bundle SHALL contain no Updater OCI archive, Python
runtime, Backend command/tool payload, release, tag, deployment, credential,
receipt, attestation graph, registry publication, or second reproducibility
build.

The Development workflow policy SHALL continue to require exactly the five
reviewed SHA-pinned external Actions needed by the reduced operations workflow
and exactly one local same-revision reusable workflow reference,
`./.github/workflows/operations-preview.yml`. It SHALL reject every other
local path, URL, Docker action, mutable external reference, YAML anchor, or
alias.

#### Scenario: Bundle build succeeds
- **WHEN** the exact branch head passes Development Actions and the Backend/Frontend single-build commands and checksum generation succeed
- **THEN** one one-day artifact SHALL contain only the declared deployment files and bind the exact head/tree/version

#### Scenario: Bundle input or build fails
- **WHEN** source is dirty or mismatched, either remaining component build fails, an expected file is absent, an obsolete updater file appears, or checksum generation fails
- **THEN** no bundle SHALL be admitted for remote validation

#### Scenario: Workflow authority differs from the reviewed caller
- **WHEN** the Development workflow contains an external Action outside the reviewed immutable releases or a local reference other than the same-revision operations workflow
- **THEN** the CI policy gate SHALL fail before product or bundle admission

### Requirement: Compose SHALL run the minimal single-host topology

Compose SHALL define only long-running API and Prometheus services. Host ports
SHALL bind to loopback; services SHALL use bounded resources, hardened non-root
settings, read-only image root filesystems, and journald stdout/stderr. API
SHALL receive one writable Archive bind mount because its embedded Go builder
owns staging, publication, pointer activation, and old-version cleanup.
Prometheus SHALL not receive that mount. No Updater service/image, Python
runtime, systemd Archive scheduler, update-status mount, Docker socket, legacy
path, public metrics endpoint, mutable `latest`, shared writable volume, host
network/PID namespace, or project-managed proxy network is allowed.

The base Compose file SHALL be the only project topology. API and Prometheus
SHALL remain only on the project backend network. Operations SHALL NOT project
dedicated or generic proxy variables into a service, attach a proxy network,
or encode a proxy mode, URL, or network in release state. Host egress policy
SHALL remain an external transparent prerequisite. The common Compose wrapper
SHALL derive only project, Backend/Prometheus image, root, port, and resource
topology from the validated root-managed release env; calling-shell proxy
variables SHALL NOT alter it.

#### Scenario: Runtime starts from an admitted env
- **WHEN** env names valid local Backend/Prometheus images, a valid Archive root, unique project, and free loopback ports
- **THEN** API `/livez`, `/readyz`, and `/metrics`, Prometheus readiness, and the API scrape SHALL succeed

#### Scenario: Runtime remains closed
- **WHEN** an admitted release is rendered
- **THEN** API and Prometheus SHALL remain only on the backend network, API alone SHALL receive the Archive write mount, and neither service SHALL receive a proxy input

#### Scenario: Host-transparent proxy routing is active
- **WHEN** the host's DIRECT/Proxy rule egress is active for an admitted release
- **THEN** destinations MAY be routed by host policy while Compose projects no proxy input, overlay, mode, URL, or external proxy network

#### Scenario: Calling shell conflicts with release authority
- **WHEN** the calling shell exports proxy transport, URL, network, or generic proxy values
- **THEN** the rendered project SHALL equal the validated release topology and no calling-shell value SHALL enter service environment or topology

#### Scenario: Runtime authority is widened
- **WHEN** a service uses host networking/PID, public bind, Docker socket, legacy mount, unbounded resource, root user, undeclared writable path, updater/status-file dependency, proxy projection, or calling-shell topology bypass
- **THEN** static or Compose validation SHALL fail before startup

### Requirement: Host commands SHALL install, update, check, and roll back

State-changing application deployment and application rollback commands SHALL
share one non-waiting fixed lock. Bundle installation SHALL verify checksums,
install versioned Backend/Frontend bytes, load only the Backend product image,
start and verify API, and switch frontend last. `check` SHALL remain read-only.
The embedded Backend builder alone SHALL update `current.json`, replace the
Store, and delete old Archive versions while the API runs. Operations SHALL
install no `update` command and no `rollback-data` command; application
rollback SHALL operate only on release env/frontend state.

Deploy SHALL accept only root, bundle, version, project, loopback ports, pinned
Prometheus image, and reviewed profile inputs. It SHALL NOT accept or persist
an Updater image, Archive tool payload, status-file path, application proxy
mode/URL/network, or data-rollback slot. Root/project/ports/Prometheus/profile
topology SHALL remain immutable. Application rollback SHALL restore the exact
previous accepted Backend env/frontend state without changing Archive data.

An installed pre-removal release containing Updater image/tool/status or
systemd state is protected external migration input, not an accepted new
release shape. Repository development commands SHALL not delete, rewrite, or
claim recovery through that live state; a future activation SHALL preflight and
retire it under separate explicit authorization. Existing one-time transparent
egress migration behavior MAY normalize only its already accepted proxy
preimage and SHALL NOT copy obsolete updater fields into the new candidate.

#### Scenario: Deployment becomes ready
- **WHEN** bundle checksums pass, the Backend image loads, current Archive is valid, and candidate API becomes ready
- **THEN** candidate env/frontend link SHALL become current while previous application values remain available for application rollback
- **AND** Archive pointer/version state SHALL remain owned by the running Backend

#### Scenario: Obsolete updater or proxy arguments are supplied
- **WHEN** deploy receives an Updater image, data-update/data-rollback option, tool payload, status-file option, proxy transport/URL/network, or unknown argument
- **THEN** it SHALL reject the request before the state lock, Docker call, release creation, or mutation

#### Scenario: Candidate readiness fails
- **WHEN** candidate API readiness fails during application deployment
- **THEN** deploy SHALL restore and verify the previous application env/frontend state without changing Archive data

#### Scenario: Concurrent application mutation is attempted
- **WHEN** another deployment or application rollback owns the lock
- **THEN** the new command SHALL exit without changing application, frontend, or Archive state

#### Scenario: Live pre-removal updater state is encountered
- **WHEN** a future activation sees installed updater image/service/timer/tool/status/data-rollback state
- **THEN** activation SHALL stop for an explicitly authorized migration and this development change SHALL not mutate those live bytes

### Requirement: Operations topology SHALL not carry Archive smoke tools

New deployment bundles, release directories, Compose definitions, application
links, rollback transactions, isolated validation, and host checks SHALL
contain no dedicated Archive smoke command, Backend tool payload, Updater
service/image/argument/mount, or updater tool link. Existing live legacy tool
links/releases remain protected external migration input and SHALL NOT prove a
new single-Backend release can be activated safely.

#### Scenario: A clean single-Backend bundle is assembled
- **WHEN** Operations assembles and validates a new deployment bundle
- **THEN** its closed inventory SHALL contain no Updater archive, Backend tool archive, release tools directory, tool symlink, executable mount, smoke argument, or updater command

#### Scenario: A live pre-removal topology is encountered
- **WHEN** future activation sees a current/rollback release requiring an updater or removed command
- **THEN** activation SHALL stop until a separately authorized migration defines exact rollback and retirement
- **AND** development SHALL not delete or rewrite the live legacy bytes

### Requirement: Host templates SHALL provide only the planned observability

Repository Nginx, logrotate, Prometheus, and journal templates SHALL serve
frontend/API through the host boundary, keep metrics/UI loopback-only, retain
seven days/512 MiB of Prometheus data, bound logs, and cover health, embedded
builder/update, 5xx, upstream, queue, and cache checks. Weekly scheduling SHALL
be owned by the Go API and SHALL require no Archive systemd service/timer or
update-status file. Templates SHALL NOT add Grafana, Loki, Tempo,
Alertmanager, node exporter, tracing, or another scheduler.

#### Scenario: Templates validate inertly
- **WHEN** templates are checked with Nginx temporary-prefix validation, Compose config, and Prometheus config parsing
- **THEN** they SHALL validate without installation, enablement, reload, public routing, service mutation, or systemd Archive units

#### Scenario: Monitoring fails independently
- **WHEN** Prometheus is unavailable while API and current Archive remain valid
- **THEN** API readiness and embedded scheduling/build ownership SHALL continue independently

### Requirement: Isolated validation SHALL not affect the legacy project

Remote validation SHALL begin with a read-only preflight and use one absent
run-owned transfer root, one absent run-owned runtime root, unique Compose
project, run-tagged images, and free loopback validation ports. It SHALL
exercise startup, API Archive-write projection against validation-only data,
health, metrics, Prometheus, journald, application restart/rollback, template
validation, and exact cleanup. It SHALL not run a real Archive acquisition,
install systemd units, invoke updater/data-rollback commands, or mutate a
protected current Archive. Production and legacy paths, projects, routes,
services, ports, data, and images SHALL remain unchanged.

#### Scenario: Isolated validation succeeds
- **WHEN** preflight passes and runtime, mount, health, application rollback, template, cleanup, and before/after legacy comparisons pass
- **THEN** capability MAY be reported repository-defined and isolated-validated, but not production-activated or deployed

#### Scenario: Host collision or drift is observed
- **WHEN** a run root/project exists, a port is occupied, run identity changes, or protected legacy field differs
- **THEN** validation SHALL stop, clean only matching run-owned objects, and SHALL NOT modify protected state to force success

### Requirement: Live traffic SHALL require a real Archive

The public V2 runtime SHALL use a contract-valid, non-fixture Archive. API
readiness, catalog, metrics, and Prometheus scrape SHALL agree on its current
data version. Embedded builder acquisition/build/open failure SHALL leave the
current pointer and Store unchanged; successful activation SHALL replace them
inside the API and then remove old versions without a host wrapper or data
rollback slot.

API collection/image and Archive acquisition traffic SHALL use the
host-transparent egress authority. The project SHALL retain only base Compose
and receive no dedicated/generic proxy variable, overlay, or proxy network.
The intentionally stopped legacy loader SHALL remain stopped and SHALL NOT be
treated as a rollback dependency.

#### Scenario: Real Archive is active
- **WHEN** public V2 traffic is enabled
- **THEN** current Archive SHALL be contract-valid and non-fixture
- **AND** readiness, catalog, metrics, and Prometheus SHALL report the same data version

#### Scenario: Embedded update fails
- **WHEN** acquisition, build, candidate open, or activation fails before a successful Store/pointer replacement
- **THEN** the last accepted Store and pointer SHALL remain active
- **AND** public routing and stopped legacy loader SHALL remain unchanged

#### Scenario: Host egress remains external to the project
- **WHEN** API acquisition needs DIRECT or Proxy egress
- **THEN** the host gateway SHALL classify the destination transparently and no application proxy input/network/overlay SHALL appear

#### Scenario: Legacy background updater remains retired
- **WHEN** the embedded Go schedule and current Archive are healthy
- **THEN** the old loader SHALL remain present but stopped unless a separately approved retirement change removes it

#### Scenario: Loader stop changes protected state
- **WHEN** loader identity/config/policy differs or its stopped state harms the old serving path
- **THEN** operations SHALL stop before integration/routing mutation and SHALL NOT repair or replace the loader

### Requirement: Production host integration SHALL remain minimal

Activation SHALL begin only after the intentionally stopped legacy loader and
healthy old serving path have been verified. It SHALL install the reduced
Backend/Frontend release, API/Prometheus Compose topology, Nginx logrotate
file, and loopback-only Prometheus with the reviewed retention policy. The
Backend's accepted in-process weekly scheduler SHALL be enabled by the API
runtime itself; activation SHALL install or enable no Archive systemd
service/timer, Python updater image/service, host update wrapper, status file,
or data rollback command. It SHALL verify API, embedded builder metrics,
scrape, Compose journald tags/logs, logrotate, Nginx, capacity, and legacy
coexistence. Beyond the already authorized loader stop, it SHALL not retire or
repair another legacy object.

#### Scenario: Minimal production integration is healthy
- **WHEN** reduced templates validate, API reports the accepted Archive and scheduler state, runtime checks pass, and legacy identities/probes remain healthy
- **THEN** production activation MAY be reported complete without any host Archive timer or Updater component

#### Scenario: Integration harms the legacy stack
- **WHEN** a protected legacy identity, container, route, listener, or declared probe changes or fails during activation
- **THEN** traffic SHALL roll back and no legacy repair or retirement action SHALL be attempted by this change

## REMOVED Requirements

### Requirement: Production updater SQLite temporary storage SHALL use the Archive disk

**Reason**: There is no production Updater service or updater-only `SQLITE_TMPDIR` projection.

**Migration**: Apply `Embedded builder temporary storage SHALL remain on the Archive disk`; keep complete-source mutable state within the API's writable Archive bind without adding an operator-controlled updater environment.
