## Capability Boundary

| Field | Declaration |
|---|---|
| Status | Optional updater proxy projection specified; repository apply pending. |
| Owner | Operations implementation owner; main agent specification/audit/acceptance. |
| Writable paths | Operations paths/tests declared in the proposal and this delta. |
| Read-only protected inputs | Product artifacts, host/proxy state, base API/Prometheus behavior, unrelated operations files, production, and every undeclared path. |
| Deletion complement | No persistent object; existing exact test-temporary cleanup only. |
| Mutable refs | This change task state, implementation commit A, accepted-product pin commit B, and later Git lifecycle only. |
| Consumes | Accepted dedicated updater input, base Compose topology, release env, deploy/rollback transaction. |
| Produces | Optional paired proxy release fields and tracked updater-only Compose overlay. |
| Dependencies | Accepted updater implementation and implementation commit A before `build-bundle.sh` is pinned to A in commit B; no runtime application in this change. |
| Deliverables | Overlay, release/deploy support, tests/docs, and green bundle/Actions gates. |
| Acceptance | Requirement scenarios plus unchanged static, isolated, bundle, shell, Compose, and full Actions gates. |
| Non-goals | Proxy lifecycle, host routing, transparent interception, public binds, other service network changes, runtime deployment, or retry. |
| Operations deferred | Exact production network/endpoint projection and updater retry remain in the activation change. |
| Stop/rollback conditions | Reject incomplete/invalid pair or unavailable external network before updater creation; existing previous-env rollback remains authoritative. |

## MODIFIED Requirements

### Requirement: Compose SHALL run the minimal single-host topology

Compose SHALL define long-running API and Prometheus services plus a one-shot
updater. Host ports SHALL bind to loopback, writable data SHALL be isolated
below the configured root, services SHALL use bounded resources and hardened
non-root settings, and stdout/stderr SHALL use journald. No Docker socket,
legacy path, public metrics endpoint, mutable `latest`, or shared writable
volume is allowed.

The base topology SHALL retain direct updater transport. Release env SHALL
encode exact mode `direct` or `proxy`; proxy mode SHALL require both a strictly
validated `BGMSS_UPDATER_HTTPS_PROXY` and
`BGMSS_UPDATER_PROXY_NETWORK`, while direct mode SHALL forbid both. The URL
rules SHALL match the updater capability and the network name SHALL be 1–128
ASCII bytes matching `[A-Za-z0-9][A-Za-z0-9_.-]*`. An optional tracked overlay
SHALL be selected only for valid proxy mode, map the URL only to updater's
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
