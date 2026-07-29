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
legacy path, public metrics endpoint, mutable `latest`, or shared writable
volume is allowed.

The base topology SHALL retain direct updater and image transport. Release env
SHALL encode exact mode `direct` or `proxy`; proxy mode SHALL require both a
strictly validated `BGMSS_UPDATER_HTTPS_PROXY` and
`BGMSS_UPDATER_PROXY_NETWORK`, while direct mode SHALL forbid both. The URL
rules SHALL match the updater capability and the network name SHALL be 1–128
ASCII bytes matching `[A-Za-z0-9][A-Za-z0-9_.-]*`.

The tracked proxy overlay SHALL be selected only for valid proxy mode. It
SHALL map the release URL to updater-only `BGMSS_HTTPS_PROXY` and API-only
`BGMSS_IMAGE_HTTPS_PROXY`, attach only API and updater to the named
pre-existing external network, publish no additional port, and leave
Prometheus projection unchanged. Operations SHALL inspect but SHALL NOT
create, alter, or remove the external network or proxy service.

The common Compose wrapper SHALL derive mode, URL, and network exclusively
from the root-managed `current.env` after exact validation. It SHALL remove
ambient `BGMSS_UPDATER_TRANSPORT`, `BGMSS_UPDATER_HTTPS_PROXY`, and
`BGMSS_UPDATER_PROXY_NETWORK` from the Compose child process, or provide an
equivalent isolation that prevents shell-over-`--env-file` precedence. A
conflicting calling-shell value SHALL neither select the overlay nor replace
the URL/network. API and updater SHALL receive no generic HTTP/HTTPS/ALL/NO
proxy input from this projection.

#### Scenario: Runtime starts from an admitted env

- **WHEN** the env names present local image identities, a valid Archive root, unique project, and free loopback ports
- **THEN** API `/livez` and `/readyz`, API `/metrics`, Prometheus readiness, and the API scrape SHALL succeed

#### Scenario: Direct runtime remains closed

- **WHEN** a valid direct release is rendered
- **THEN** API, updater, and Prometheus SHALL remain on the backend network and no service SHALL receive a dedicated proxy input

#### Scenario: Proxy runtime is projected

- **WHEN** a valid proxy release is rendered and its named external network exists
- **THEN** API SHALL receive only the image proxy input, updater SHALL retain only its updater proxy input, both SHALL join the external network, and Prometheus SHALL receive neither input nor attachment

#### Scenario: Calling shell conflicts with release authority

- **WHEN** `current.env` contains one admitted direct/proxy mode while the calling shell exports conflicting transport, URL, network, or generic proxy values
- **THEN** Compose projection SHALL equal the validated `current.env`, with no ambient selection, replacement, or bypass

#### Scenario: Runtime authority is widened

- **WHEN** a service uses host networking/PID, a public bind, Docker socket, legacy mount, unbounded resource, root user, undeclared writable path, invalid mode/pair/network, swapped or generic proxy input, Prometheus external-network attachment, or release-authorized mode/URL/network bypass
- **THEN** static or Compose validation SHALL fail before startup

### Requirement: Production image egress repair SHALL be reversible

On `myserver`, the accepted replacement application SHALL first deploy through
the existing `/srv/bgmss-v2` transaction while the old overlay remains active.
After application health succeeds, operations SHALL take the existing
non-waiting lock, verify and back up the installed overlay, atomically replace
only `/srv/bgmss-v2/compose/compose.updater-proxy.yaml` among installed
operations definitions, and force-recreate API so the new environment and
network projection take effect.

The transaction SHALL preserve the current Archive and proxy release fields.
It SHALL NOT invoke updater or change base Compose, operations commands,
Prometheus, Nginx, systemd, logrotate, proxy/network lifecycle, public routing,
or legacy state. After successful acceptance, the admitted replacement
application, overlay, and proxy projection become the current baseline; the
earlier one-time activation preimages remain historical evidence and SHALL NOT
be reused as current-state admission values.

#### Scenario: Production repair succeeds

- **WHEN** the admitted application deploys, the overlay preimage matches, API is recreated with the exact proxy projection, and health/image/Prometheus checks pass
- **THEN** the bounded image route SHALL return an accepted final image while all protected runtime state remains unchanged

#### Scenario: Overlay activation fails

- **WHEN** overlay installation, API recreation, projection, health, image, or isolation verification fails
- **THEN** operations SHALL restore the exact prior overlay, force-recreate API under the restored projection, verify API is detached from the external network, and use normal application rollback if the replacement release must also be reverted

### Requirement: Host commands SHALL install, update, check, and roll back

State-changing host commands SHALL share one non-waiting fixed lock. Bundle
installation SHALL verify checksums, install versioned bytes, start and verify
API, and switch frontend last. Archive update SHALL keep the updater
one-shot, atomically switch `current.json`, restart/verify API, and restore the
previous pointer on failure. Application and data rollback SHALL remain
separate and health checks SHALL be read-only.

Deploy SHALL accept one explicit updater transport request: `preserve`
(default), `direct`, or `proxy`. Before opening the state lock or loading
images, preserve SHALL reject proxy arguments and resolve to the current mode,
treating a pre-change env with no mode as direct; direct SHALL reject proxy
arguments and explicitly remove the pair; proxy SHALL require and validate the
complete URL/network pair. It SHALL write the resolved mode and candidate
release env atomically. Root/project/ports/Prometheus/profile topology SHALL
remain immutable. The previous release env SHALL retain its exact prior mode
so application rollback restores it. The common Compose wrapper SHALL select
the proxy overlay only from valid proxy mode and SHALL reject missing,
duplicate, or mode-inconsistent fields.

#### Scenario: Deployment becomes ready

- **WHEN** bundle checksums pass, images load, the current Archive is valid, and the candidate API becomes ready
- **THEN** the candidate env and frontend link SHALL become current while the previous values remain available for rollback

#### Scenario: Proxy mode changes explicitly

- **WHEN** deploy explicitly requests proxy with a complete valid pair or explicitly requests direct
- **THEN** the candidate SHALL adopt that exact mode while preserving the exact prior env for application rollback

#### Scenario: Existing transport mode is preserved

- **WHEN** deploy uses its default preserve request on an existing direct, proxy, or pre-change release env
- **THEN** the candidate SHALL retain the exact current mode and pair, with a pre-change env interpreted only as direct

#### Scenario: Candidate readiness fails

- **WHEN** candidate API readiness fails after an application or data switch
- **THEN** the command SHALL restore and verify the previous state before returning nonzero

#### Scenario: Concurrent mutation is attempted

- **WHEN** another deployment, update, or rollback owns the lock
- **THEN** the new command SHALL exit without changing application, frontend, or data state

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
resource limits, security controls, Archive mount, proxy behavior, and
publication transaction SHALL remain unchanged.

#### Scenario: Direct updater projection uses disk-backed SQLite temporary storage
- **WHEN** Compose renders a valid direct updater release
- **THEN** updater SHALL receive the exact fixed `SQLITE_TMPDIR`, API and Prometheus SHALL not receive it, and all three services SHALL retain their existing networks and resource/security settings

#### Scenario: Proxy updater projection uses the same disk-backed SQLite temporary storage
- **WHEN** Compose renders a valid proxy updater release
- **THEN** updater SHALL receive both the exact fixed `SQLITE_TMPDIR` and the exact dedicated proxy input while API and Prometheus receive neither

#### Scenario: SQLite temporary storage authority widens
- **WHEN** the value differs, resolves outside the Archive mount, appears on API or Prometheus, replaces `/tmp`, changes a resource/security/mount boundary, or becomes operator-controlled release state
- **THEN** operations verification and deployment SHALL fail before another production updater invocation

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
`be48847bc26bcda28c9f08f6807f5dec40d479f4`. Current/previous env SHA-256
SHALL equal
`76de7645452162d04afe0679e346d6b61661c80aec15036814ec1ae5c58ab1ce`
and `f2f63a26d9178e3f9effd6acb8b1ca195056be2050b157bf871386d45c280646`.
`/srv/bgmss-v2/data/update-status.json` SHALL be mode/owner `0600`/
`65532:65532`, SHA-256
`a10facccaa15ea9383414350c6a09550a0b2d23927573308292a0ff62ac1d3da`,
and report recorded run `6d7dd3d4-9eb4-472e-af09-0561dc313617` as
`SQLITE_BUILD_FAILED` without success. `current.json`
SHALL identify only
`dv1-0a1fa3e9acdb06be34e3535b3c68e322e7d3f4cd87ac30cd4b608b2276ba3ca1`,
`previous.json` SHALL be absent, and exactly that fixture version SHALL exist.

The exact remote incoming root
`/srv/bgmss-v2/incoming/run-30452886753`, transient
`/srv/bgmss-v2/compose/.compose.yaml.sqlite-temp.tmp`, Nginx
backup/temporary/candidate, updater unit/timer identities, and logrotate file
SHALL be absent before the write. Exact-head run `30452886753` SHALL have both
jobs green for source
`1505c5d7c36f457ed8d9e3be542e2422fe2811fc`. The installed
`/srv/bgmss-v2/compose/compose.yaml` SHALL be regular mode/owner `0644`/`0:0`,
Git blob `00951ee0ffe23e4d2e5723857a54d2eceee51a63`, and SHA-256
`dfe55f7124454075b36131302b14dd3dd4ef10c310328bfefa62169ba29a3a2a`.
The admitted candidate SHALL be regular Git mode `100644`, blob
`0daee531f811ff826bba1836897eb9cc54d6d529`, and SHA-256
`13d0608d29b38cedc62821bb02f5646bf702e9419b8ee946c60c8580485cb272`.
Apply SHALL create the exact incoming root, copy the hash-equal old file to
`compose.yaml.before-sqlite-temp`, transfer only the candidate as
`compose.yaml`, and atomically install through the exact same-directory
temporary. If projection fails, apply SHALL atomically restore and verify the
saved old file before any updater invocation.

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
attach API and updater to that external network, pass only updater
`BGMSS_HTTPS_PROXY=http://myserver-proxy:7897` plus
`SQLITE_TMPDIR=/var/lib/bgmss/archive`, and pass only API
`BGMSS_IMAGE_HTTPS_PROXY=http://myserver-proxy:7897`; Prometheus SHALL receive
none of those inputs and SHALL remain absent from `proxy-net`. Updater `/tmp`,
mounts, resources, security controls, and every other service/network value
SHALL remain unchanged. After candidate health, read-only
proxy/network/listener inspection, and static projection checks pass, the
operator MAY invoke the updater exactly once under this new authorization. No
other updater invocation or acquisition request is authorized. A successful
invocation SHALL publish and activate a contract-valid data version different from
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
- **WHEN** the admitted base Compose and proxy overlay install over their exact preimages and private checks pass
- **THEN** updater SHALL join `proxy-net` with exact updater-proxy and SQLite inputs, API SHALL join it with only the exact image-proxy input, Prometheus SHALL receive neither input nor attachment, and exactly one newly authorized production updater invocation MAY run

#### Scenario: Proxy deployment widens authority
- **WHEN** Prometheus joins `proxy-net`, API receives an updater or generic proxy input, updater receives the image or a generic proxy input, another proxy/SQLite value or network is projected, another Compose field changes, the endpoint/network is mutated, or another updater invocation is requested after the newly authorized attempt
- **THEN** deployment SHALL stop, retain or restore legacy public routing, and SHALL NOT force progress

#### Scenario: Legacy background updater is retired
- **WHEN** literal container ID `84d7ca5dcf10b5aae2eb44bf942f2730c3a155ae771aec57946ddfea1eff2bc9` passes the required baseline re-inspection and is stopped under the user's explicit authorization
- **THEN** the same container ID/image/labels/policy/mounts/config SHALL remain present but stopped while the old serving path remains healthy

#### Scenario: Loader stop changes protected state
- **WHEN** the loader identity/config/policy differs or its stop harms the old serving path
- **THEN** apply SHALL stop before another updater attempt, host integration, or cutover and SHALL NOT replace or repair the loader

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
