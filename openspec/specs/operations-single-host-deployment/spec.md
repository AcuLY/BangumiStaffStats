# operations-single-host-deployment Specification

## Purpose
Define the bounded GitHub Actions bundle, single-host Compose runtime,
transactional update and rollback commands, simple host observability
templates, and legacy-safe isolated validation required for a normal
`linux/amd64` deployment and its accepted same-host production activation.
## Requirements
### Requirement: Actions SHALL produce one bounded AMD64 deployment bundle

The already registered Development manual-dispatch entry SHALL call one
same-revision reusable read-only workflow that builds the accepted Product once
for `linux/amd64` and uploads one short-lived bundle containing API and updater
OCI archives, the Backend tool bundle, frontend static archive, minimal Archive
fixture, source/version metadata, and SHA-256 inventory. Push and pull-request
runs SHALL NOT call the bundle workflow. It SHALL NOT publish a registry image,
release, tag, deployment, credential, receipt, attestation graph, or second
reproducibility build.

The Development workflow policy SHALL continue to require exactly five
reviewed SHA-pinned external Actions and SHALL admit exactly one local
same-revision reusable workflow reference:
`./.github/workflows/operations-preview.yml`. It SHALL reject every other
local path, URL, Docker action, mutable external reference, YAML anchor, or
alias.

#### Scenario: Bundle build succeeds

- **WHEN** the exact branch head passes Development Actions and all component single-build commands and checksum generation succeed
- **THEN** one one-day artifact SHALL contain only the declared deployment files and bind the exact head/tree/version

#### Scenario: Bundle input or build fails

- **WHEN** the source is dirty/mismatched, a component build fails, an expected file is absent, or checksum generation fails
- **THEN** no bundle SHALL be admitted for remote validation

#### Scenario: Workflow authority differs from the reviewed caller

- **WHEN** the Development workflow contains an external Action outside the five reviewed immutable releases or a local reference other than the one same-revision operations workflow
- **THEN** the CI policy gate SHALL fail before product or bundle admission

### Requirement: Compose SHALL run the minimal single-host topology

Compose SHALL define long-running API and Prometheus services plus a one-shot
updater. Host ports SHALL bind to loopback, writable data SHALL be isolated
below the configured root, services SHALL use bounded resources and hardened
non-root settings, and stdout/stderr SHALL use journald. No Docker socket,
legacy path, public metrics endpoint, mutable `latest`, shared writable
volume, host network/PID namespace, or project-managed proxy network is
allowed.

The base Compose file SHALL be the only project topology. API, updater, and
Prometheus SHALL remain only on the project backend network. Operations SHALL
NOT project dedicated or generic proxy variables into a service, attach a
service to a proxy network, or encode a proxy mode, URL, or network in release
state. Host egress policy SHALL be an external prerequisite supplied
transparently below the application boundary.

The common Compose wrapper SHALL derive only project, image, root, port, and
resource topology from the validated root-managed release env. Conflicting
calling-shell proxy variables SHALL NOT change the rendered project topology
or become service environment entries.

#### Scenario: Runtime starts from an admitted env

- **WHEN** the env names present local image identities, a valid Archive root,
  unique project, and free loopback ports
- **THEN** API `/livez` and `/readyz`, API `/metrics`, Prometheus readiness,
  and the API scrape SHALL succeed

#### Scenario: Direct runtime remains closed

- **WHEN** an admitted release is rendered
- **THEN** API, updater, and Prometheus SHALL remain only on the backend
  network and no service SHALL receive a dedicated or generic proxy input

#### Scenario: Proxy runtime is projected

- **WHEN** host-transparent rule egress is active for an admitted release
- **THEN** destinations MAY be routed by the host's DIRECT/Proxy policy
- **AND** Compose SHALL project no service proxy input, proxy network, or
  proxy overlay

#### Scenario: Calling shell conflicts with release authority

- **WHEN** the calling shell exports proxy transport, URL, network, or generic
  proxy values
- **THEN** the rendered project SHALL equal the validated release topology
- **AND** no calling-shell proxy value SHALL select or alter project topology
  or become a service environment entry

#### Scenario: Project proxy projection is absent

- **WHEN** the admitted release is rendered under any calling-shell proxy
  environment
- **THEN** API, updater, and Prometheus SHALL remain only on the backend
  network
- **AND** none SHALL receive a dedicated or generic proxy input from
  operations
- **AND** no proxy overlay, mode, URL, network, or external network SHALL
  appear in the project topology or release state

#### Scenario: Runtime authority is widened

- **WHEN** a service uses host networking/PID, a public bind, Docker socket,
  legacy mount, unbounded resource, root user, undeclared writable path,
  proxy input/network/overlay, or calling-shell topology bypass
- **THEN** static or Compose validation SHALL fail before startup

### Requirement: Host commands SHALL install, update, check, and roll back

State-changing host commands SHALL share one non-waiting fixed lock. Bundle
installation SHALL verify checksums, install versioned bytes, start and verify
API, and switch frontend last. Archive update SHALL keep the updater one-shot,
atomically switch `current.json`, restart/verify API, and restore the previous
pointer on failure. Application and data rollback SHALL remain separate and
health checks SHALL be read-only.

Deploy SHALL accept only the root, bundle, version, project, loopback ports,
pinned Prometheus image, and reviewed profile inputs. It SHALL NOT accept,
preserve, or write application proxy mode/URL/network inputs. Root/project/
ports/Prometheus/profile topology SHALL remain immutable, and application
rollback SHALL restore the exact previous release env and links without
introducing proxy state.

As a one-time upgrade input only, an existing current env MAY contain the exact
closed retired `proxy` transport trio with a canonical URL/network pair. Deploy
SHALL recognize it before the lock but SHALL perform migration only after
acquiring and rechecking the shared lock. It SHALL require the exact installed
retired overlay and existing external network, save the original bytes, rewrite
the same old images/topology without proxy state, force-recreate API and
Prometheus from base Compose, and verify readiness. If this normalization
fails, it SHALL restore the original env and recover only through that validated
legacy overlay. Once normalization succeeds, the verified clean old release
SHALL replace both rollback slots and the overlay SHALL be removed before
candidate activation; candidate recovery and later application rollback SHALL
never restore legacy proxy state. Any partial, modified, direct-mode, generic
proxy, or otherwise noncanonical legacy state SHALL fail before the lock.

#### Scenario: Deployment becomes ready

- **WHEN** bundle checksums pass, images load, the current Archive is valid,
  and the candidate API becomes ready
- **THEN** the candidate env and frontend link SHALL become current while the
  previous values remain available for rollback

#### Scenario: Proxy mode changes explicitly

- **WHEN** deploy is asked to select either a direct or proxy transport mode
- **THEN** it SHALL reject the obsolete argument before the state lock,
  Docker call, release creation, or state mutation

#### Scenario: Existing transport mode is preserved

- **WHEN** deploy inspects a proxy-free release or the exact closed retired
  proxy release admitted for one-time migration
- **THEN** it SHALL preserve all non-proxy release authority
- **AND** no transport mode, URL, or network SHALL be persisted into the
  candidate or retained after successful normalization

#### Scenario: Obsolete proxy arguments are supplied

- **WHEN** deploy receives a proxy transport, URL, network, or any unknown
  argument
- **THEN** it SHALL reject the request before the state lock, Docker call,
  release creation, or state mutation

#### Scenario: Exact legacy proxy release is upgraded

- **WHEN** current state is one exact closed retired proxy release and the
  validated legacy overlay/network remain available
- **THEN** deploy SHALL establish and verify the same old release base-only
  under the shared lock before candidate work
- **AND** successful deployment SHALL retain only that clean old release as
  previous state and remove the retired overlay

#### Scenario: Legacy normalization or candidate readiness fails

- **WHEN** base-only normalization of the old release fails
- **THEN** deploy SHALL restore the exact raw legacy env and recover with the
  validated legacy overlay
- **WHEN** normalization succeeds but candidate readiness later fails
- **THEN** deploy SHALL recover the verified clean old release without the
  overlay or proxy state

#### Scenario: Candidate readiness fails

- **WHEN** candidate API readiness fails after an application or data switch
- **THEN** the command SHALL restore and verify the previous state before
  returning nonzero

#### Scenario: Concurrent mutation is attempted

- **WHEN** another deployment, update, or rollback owns the lock
- **THEN** the new command SHALL exit without changing application, frontend,
  or data state

### Requirement: Host templates SHALL provide only the planned observability

Repository Nginx, systemd, logrotate, Prometheus, and journal templates SHALL
serve frontend/API through the host boundary, keep metrics/UI loopback-only,
schedule one weekly bounded update, retain seven days/512 MiB of Prometheus
data, bound logs, and cover the guide's initial health/update/5xx/upstream/
queue/cache checks. They SHALL NOT add Grafana, Loki, Tempo, Alertmanager,
node exporter, or tracing.

#### Scenario: Templates validate inertly

- **WHEN** the templates are checked with Nginx temporary-prefix validation,
  `systemd-analyze verify`, Compose config, and Prometheus config parsing
- **THEN** they SHALL validate without installation, enablement, reload, public routing, or service mutation

#### Scenario: Monitoring fails independently

- **WHEN** Prometheus is unavailable while the API and Archive remain valid
- **THEN** API readiness SHALL remain successful and the business service SHALL continue

### Requirement: Isolated validation SHALL not affect the legacy project

Remote validation SHALL begin with a read-only preflight and use one absent
run-owned `/tmp/bgmss-ops-minimal-input-<run-id>` transfer root, one absent
run-owned `/srv/bgmss-ops-validation-minimal-<run-id>` runtime root, unique
Compose project, run-tagged images, and free loopback ports `19090`/`19091`.
It SHALL
exercise startup, health, metrics, Prometheus, journald, validation-local
pointer switch/restore, application restart/rollback, template validation,
and exact cleanup of both roots. Production and legacy paths, projects, routes,
services, ports, data, and images SHALL remain unchanged.

#### Scenario: Isolated validation succeeds

- **WHEN** preflight passes and every runtime, rollback, template, cleanup, and before/after legacy comparison passes
- **THEN** the capability MAY be reported as repository-defined and isolated-validated, but not production-activated or deployed

#### Scenario: Host collision or drift is observed

- **WHEN** the root/project already exists, either port is occupied, a run-owned identity changes, or any protected legacy field differs
- **THEN** validation SHALL stop, clean only still-matching run-owned objects, and SHALL NOT modify protected state to force success

### Requirement: Production updater SQLite temporary storage SHALL use the Archive disk

The production updater SHALL set exactly
`SQLITE_TMPDIR=/var/lib/bgmss/archive` so SQLite file-backed temporary tables
and indices use the existing writable, disk-backed Archive bind mount instead
of the bounded `/tmp` tmpfs. This input SHALL apply only to updater. API and
Prometheus SHALL receive no `SQLITE_TMPDIR`; the updater's `/tmp` tmpfs,
resource limits, security controls, Archive mount, project-only network, and
publication transaction SHALL remain unchanged.

#### Scenario: Updater projection uses disk-backed SQLite temporary storage

- **WHEN** Compose renders an admitted updater release
- **THEN** updater SHALL receive the exact fixed `SQLITE_TMPDIR`
- **AND** API and Prometheus SHALL not receive it
- **AND** all three services SHALL retain only their existing project network
  and resource/security settings

#### Scenario: Direct updater projection uses disk-backed SQLite temporary storage

- **WHEN** Compose renders an admitted updater release without host proxy
  routing
- **THEN** updater SHALL receive the exact fixed `SQLITE_TMPDIR`, API and
  Prometheus SHALL not receive it, and all three services SHALL retain only
  their project network and resource/security settings

#### Scenario: Proxy updater projection uses the same disk-backed SQLite temporary storage

- **WHEN** Compose renders an admitted updater release while host-transparent
  rule egress is active
- **THEN** updater SHALL receive the exact fixed `SQLITE_TMPDIR`
- **AND** API, updater, and Prometheus SHALL receive no application proxy
  input or proxy-network attachment

#### Scenario: SQLite temporary storage authority widens

- **WHEN** the value differs, resolves outside the Archive mount, appears on
  API or Prometheus, replaces `/tmp`, changes a resource/security/mount/
  network boundary, or becomes operator-controlled release state
- **THEN** operations verification and deployment SHALL fail before another
  production updater invocation

### Requirement: Live traffic SHALL require a real Archive

The public V2 runtime SHALL use a contract-valid, non-fixture Archive. API
readiness, catalog, metrics, and the Prometheus scrape SHALL agree on its
current data version. Update failure SHALL retain or restore the last accepted
pointer rather than activate partial or fixture data.

Updater and API acquisition traffic SHALL use the host-transparent egress
authority. The project SHALL retain only its base Compose topology and SHALL
receive no dedicated or generic proxy variable, proxy overlay, or proxy
network. The intentionally stopped legacy loader SHALL remain stopped and
SHALL NOT be treated as a rollback dependency.

#### Scenario: Real Archive is active

- **WHEN** public V2 traffic is enabled
- **THEN** the current Archive SHALL be contract-valid and non-fixture
- **AND** readiness, catalog, metrics, and Prometheus SHALL report the same
  data version

#### Scenario: Update fails or remains invalid

- **WHEN** updater execution fails, publishes no valid terminal result, or
  runtime observers disagree
- **THEN** the last accepted Archive pointer SHALL remain or be restored
- **AND** public routing and the stopped legacy loader SHALL remain unchanged

#### Scenario: Host egress remains external to the project

- **WHEN** updater or API acquisition needs DIRECT or Proxy egress
- **THEN** the host gateway SHALL classify the destination transparently
- **AND** no application proxy input, overlay, or proxy-network attachment
  SHALL appear in the project

#### Scenario: Legacy background updater remains retired

- **WHEN** the new updater schedule and current Archive are healthy
- **THEN** the old loader SHALL remain present but stopped unless a separately
  approved retirement change removes it

#### Scenario: Loader stop changes protected state

- **WHEN** the loader identity/config/policy differs or its stopped state harms
  the old serving path
- **THEN** operations SHALL stop before another update, integration, or
  routing mutation and SHALL NOT replace or repair the loader

### Requirement: Nginx cutover SHALL be atomic and reversible

Path migration SHALL create one exact absent, change-specific backup without
overwriting the historical
`/etc/nginx/nginx.conf.pre-bgmss-v2`. It SHALL modify only the existing
`search.bgmss.fun` TLS server so `/` and every path outside `/v2/**` again use
the retained legacy frontend at `/srv/bgmss/frontend/dist`, exact `/v2`
redirects to `/v2/`, `/v2/` serves
`/srv/bgmss-v2/current-frontend` with base-aware SPA fallback, and
`/v2/api/v1/` proxies to the unchanged `127.0.0.1:18080/api/v1/` backend
path. Existing `/statistics`, `/timeline`, `/proxy`, per-site logs, TLS, and
every unrelated location/server byte SHALL remain present and equivalent.

The admitted candidate SHALL be retained at
`/srv/bgmss-v2/config/nginx/nginx.conf`. Migration SHALL record and recheck the
active preflight SHA-256 before the first write, require the new backup hash to
equal it, and use a structure-aware transformation whose diff is bounded to
the named TLS block and reviewed path locations. It SHALL copy through the
exact same-directory temporary and atomic rename, run `nginx -t` before each
reload, and verify the active hash equals the intended candidate or backup.
It SHALL restore the new backup, revalidate, and reload if reload or any
required content-aware public probe fails.

#### Scenario: Public path split succeeds
- **WHEN** the candidate validates/reloads, `/` hashes exactly to the retained legacy `index.html`, `/v2/` hashes exactly to the deployed new `index.html`, new static/deferred assets resolve, both new SPA modes remain below `/v2/`, and `/v2/api/v1/catalog` reports the accepted real data version
- **THEN** legacy SHALL own the root while the new stack receives only `/v2/**` traffic, with both serving stacks still running and the loader still intentionally stopped

#### Scenario: Candidate configuration or public probe fails
- **WHEN** syntax, reload, legacy-root content, new frontend/assets/routes, or new API acceptance fails
- **THEN** the exact new backup SHALL be restored/reloaded and the previously active public state SHALL be required to recover before returning failure

#### Scenario: Reserved prefix cannot fall through
- **WHEN** a missing or malformed `/v2/**` static, SPA, or API request is made
- **THEN** Nginx SHALL resolve it within the new-stack locations or return a new-stack error and SHALL NOT serve legacy HTML as a successful fallback

#### Scenario: Existing legacy auxiliary routes are probed
- **WHEN** `/statistics`, `/timeline`, and `/proxy` are requested after the path split
- **THEN** their existing upstream ownership and declared healthy or known-excluded status SHALL remain unchanged

### Requirement: Production host integration SHALL remain minimal

Activation SHALL begin only after the intentionally stopped legacy loader and
healthy old serving path have been verified. It SHALL install and enable the
reviewed weekly updater service/timer, keep the timer active and waiting
between one-shot service runs, install the Nginx logrotate file, retain
loopback-only Prometheus with the reviewed seven-day/512 MiB policy, leave the
existing global journal configuration unchanged, and verify API, metrics,
scrape, Compose journald driver/tag/logs, systemd, logrotate, Nginx, capacity,
and legacy coexistence after cutover. Beyond the already-authorized exact
loader stop, it SHALL NOT further stop, disable, retire, or mutate any legacy
object, delete unrelated logs, or repair unrelated pre-existing host failures.

#### Scenario: Minimal production integration is healthy

- **WHEN** the timer is enabled and active with a future trigger, templates
  validate, runtime checks pass, and legacy identities and declared probes
  remain healthy
- **THEN** production activation MAY be reported complete with the legacy
  API/MySQL/Redis serving path as rollback and the loader explicitly excluded
  from rollback

#### Scenario: Integration harms the legacy stack

- **WHEN** a protected legacy identity, container, route, listener, or declared probe changes or fails during activation
- **THEN** traffic SHALL roll back and no legacy repair or retirement action SHALL be attempted by this change

### Requirement: Host egress SHALL be transparently rule-routed

The production host SHALL run one boot-persistent Mihomo gateway in the host
network namespace with only the capability and TUN device needed for Linux
`auto-route` and `auto-redirect`. Host OUTPUT and Docker bridge/FORWARD egress
SHALL enter the gateway without application proxy variables. Mihomo SHALL
remain in `rule` mode and SHALL use target identity to select DIRECT or Proxy;
it SHALL NOT use Mihomo `global` mode.

Controller, DNS, and optional mixed listeners SHALL bind only to loopback.
Local/private/link-local/metadata/Docker/bootstrap traffic SHALL be protected
from proxying and recursion. Scenario rules SHALL preserve the sanitized
`mypc` direct/proxy decisions after mapping its presentation groups to the
server's DIRECT/Proxy topology, and unmatched public destinations SHALL use
Proxy. Proxy credentials and upstream endpoints SHALL remain secret.

The initial production policy SHALL be fail-open: `strict-route` remains off,
and stopping the gateway SHALL remove only its own route/firewall state so
ordinary direct administration remains possible. Docker and an exact restart
policy SHALL restore the gateway automatically after boot or process failure.

#### Scenario: Host request is classified by target

- **WHEN** a host process with every proxy variable removed requests one
  protected direct target and one proxied public target
- **THEN** both requests SHALL complete
- **AND** Mihomo SHALL report DIRECT for the first and Proxy for the second

#### Scenario: Docker request is classified by target

- **WHEN** temporary clients on each production Docker bridge make the same
  requests without proxy variables or proxy-network attachment
- **THEN** every client SHALL complete through the same expected rule outcomes

#### Scenario: Host-local service remains private

- **WHEN** the gateway is active
- **THEN** SSH, Nginx, Docker, loopback health/metrics, metadata, service
  discovery, and inbound response paths SHALL remain reachable
- **AND** controller, DNS, and mixed listeners SHALL not bind a public
  interface

#### Scenario: Gateway stops or configuration is invalid

- **WHEN** the candidate fails validation, route/DNS/network checks fail, or
  the gateway is stopped during rollback testing
- **THEN** no stale gateway-owned route/firewall state SHALL block direct host
  administration
- **AND** the prior bridge proxy and exact service preimages SHALL remain
  available until migration acceptance

### Requirement: Production migration SHALL be staged and reversible

The host-global gateway SHALL first run beside the existing bridge proxy under
an exact timed automatic rollback. Before activation, operations SHALL record
route/rule/nftables/listener/service/container baselines and exact consumer
preimages. It SHALL NOT flush firewall state, restart Docker, alter SSH/Nginx,
start the stopped loader, or mutate product data.

Explicit proxy inputs SHALL be removed one consumer at a time only after
transparent host and Docker-network checks pass. The Bangumi replacement
SHALL deploy through the admitted `/srv/bgmss-v2` transaction using only the
base Compose topology. The old bridge proxy SHALL stop only after Docker and
configuration inspection prove no remaining consumer; its network SHALL be
removed only when it has no endpoints.

The automatic rollback SHALL remain armed until a new external SSH session,
root legacy path, `/v2/`, real user collection/ranking/image flow, Archive,
health, metrics, logs, and proxy restart checks all pass.

#### Scenario: Migration succeeds

- **WHEN** the host gateway, every Docker network, each recreated consumer,
  the accepted Bangumi release, public routes, and real query flow pass
- **THEN** the old proxy MAY stop and the rollback MAY be canceled
- **AND** no running consumer SHALL retain an explicit proxy input or
  `proxy-net` attachment

#### Scenario: Migration check fails

- **WHEN** SSH, DNS, routing, direct/proxy classification, a Docker network,
  service recreation, public route, real product flow, observability, or
  restart verification fails
- **THEN** the timed or manual rollback SHALL stop only the new gateway,
  restore exact consumer preimages, restart the old bridge proxy and affected
  services, and verify both public routes
- **AND** it SHALL NOT clear unrelated firewall state, restart Docker, start
  the loader, or change product data

### Requirement: V2 SPA entry HTML SHALL identify the active release

The exact `/v2/`, exact `/v2/index.html`, and named `/v2/**` SPA fallback
responses SHALL return the currently active `index.html` bytes and SHALL NOT
allow mtime/size-derived validators from a previous release to produce a
successful stale revalidation. Those responses SHALL disable ETag generation,
ignore `If-Modified-Since`, and emit `Cache-Control: no-store`.

The ordinary `/v2/` static prefix location SHALL retain its existing direct
asset behavior so content-hashed JS, CSS, fonts, and images are not assigned the
SPA-entry policy.

#### Scenario: Previous release validators collide

- **WHEN** a client requests `/v2/`, `/v2/index.html`, or an SPA route with the
  previous release's `If-None-Match` and `If-Modified-Since` values
- **THEN** Nginx SHALL return `200`, `Cache-Control: no-store`, and HTML that
  references the active release's asset
- **AND** it SHALL NOT return `304` solely because normalized mtime and byte
  length collide

#### Scenario: Hashed asset is requested

- **WHEN** a client requests an existing content-hashed asset below `/v2/`
- **THEN** Nginx SHALL serve that asset through the unchanged static prefix
  location
- **AND** the SPA-entry-only non-storable policy SHALL NOT be projected onto it

#### Scenario: Live repair fails

- **WHEN** the active vhost preimage drifts or syntax, reload, content, legacy
  root, API, or browser acceptance fails
- **THEN** the exact repair backup SHALL be restored and reloaded
- **AND** no unrelated vhost or application state SHALL be changed
