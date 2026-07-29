# operations-single-host-deployment Specification

## Purpose
Define the bounded GitHub Actions bundle, single-host Compose runtime,
transactional update and rollback commands, simple host observability
templates, and legacy-safe isolated validation required for a normal
`linux/amd64` deployment without claiming production activation.

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

The base topology SHALL retain direct updater transport. Release env SHALL
encode exact mode `direct` or `proxy`; proxy mode SHALL require both a strictly
validated `BGMSS_UPDATER_HTTPS_PROXY` and `BGMSS_UPDATER_PROXY_NETWORK`, while
direct mode SHALL forbid both. The URL rules SHALL match the updater capability
and the network name SHALL be 1–128 ASCII bytes matching
`[A-Za-z0-9][A-Za-z0-9_.-]*`. An optional tracked overlay SHALL be selected
only for valid proxy mode, map the URL only to updater's
`BGMSS_HTTPS_PROXY`, attach only updater to that named pre-existing external
network, publish no port, and leave API/Prometheus projection unchanged.
Operations SHALL inspect but SHALL NOT create, alter, or remove the external
network or proxy service.

The common Compose wrapper SHALL derive mode, URL, and network exclusively
from the root-managed `current.env` after exact validation. It SHALL remove
ambient `BGMSS_UPDATER_TRANSPORT`, `BGMSS_UPDATER_HTTPS_PROXY`, and
`BGMSS_UPDATER_PROXY_NETWORK` from the Compose child process, or provide an
equivalent isolation that prevents shell-over-`--env-file` precedence. A
conflicting calling-shell value SHALL neither select the overlay nor replace
the updater URL/network.

#### Scenario: Runtime starts from an admitted env

- **WHEN** the env names present local image identities, a valid Archive root, unique project, and free loopback ports
- **THEN** API `/livez` and `/readyz`, API `/metrics`, Prometheus readiness, and the API scrape SHALL succeed

#### Scenario: Optional updater proxy is projected

- **WHEN** an admitted release contains the valid proxy URL/network pair and the named external network exists
- **THEN** only updater SHALL receive the dedicated proxy input and external-network attachment in addition to its unchanged hardening, resources, mounts, logging, and one-shot lifecycle

#### Scenario: Calling shell conflicts with release authority

- **WHEN** `current.env` contains one admitted direct/proxy mode while the calling shell exports conflicting transport, URL, or network values
- **THEN** Compose projection SHALL equal the validated `current.env`, with no ambient selection, replacement, or bypass

#### Scenario: Runtime authority is widened

- **WHEN** a service uses host networking/PID, a public bind, Docker socket, legacy mount, unbounded resource, root user, undeclared writable path, an invalid mode/pair/network, or proxy projection reaches API/Prometheus
- **THEN** static/Compose validation SHALL fail before startup

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
