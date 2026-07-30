## Capability Boundary

| Boundary | Declaration |
|---|---|
| Status | Modified by this change after strict validation and main-agent review. |
| Owner | Operations |
| Repository writable paths | The operations files enumerated in proposal/tasks plus this change's lifecycle files. |
| Live writable paths | The new host gateway, exact backed-up explicit-proxy consumer definitions, the admitted `/srv/bgmss-v2` transaction, and one temporary rollback unit. |
| Read-only protected inputs | Product/components/contracts/data, Nginx routing, observability templates, update units, SSH/Docker/Nginx definitions, stopped loader, unrelated services, secrets, and `mypc`. |
| Deletion complement | Project overlay/transport state and exact superseded host proxy inputs/bridge instance only after proof. |
| Mutable refs | Task markers and main-agent Git lifecycle only. |
| Consumes | Host transparent rule egress and accepted build artifacts. |
| Produces | One closed project topology and live transparent scenario egress. |
| Dependencies | Host gateway before consumer migration; green Actions before release deploy. |
| Deliverables | Repository simplification, safe live migration, deployed product and acceptance evidence. |
| Acceptance | Operations tests, Actions, host/network/controller probes, routes, real product flow, observability, restart and rollback. |
| Non-goals | Product semantics, per-service proxy, Mihomo global mode, bespoke routing control plane, secret publication, host reboot. |
| Stop/rollback conditions | Stop on route/listener/config drift, SSH/DNS/Docker/Nginx failure, container bypass, recursion, or missing rollback; restore exact preimages only. |

## MODIFIED Requirements

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

#### Scenario: SQLite temporary storage authority widens

- **WHEN** the value differs, resolves outside the Archive mount, appears on
  API or Prometheus, replaces `/tmp`, changes a resource/security/mount/
  network boundary, or becomes operator-controlled release state
- **THEN** operations verification and deployment SHALL fail before another
  production updater invocation

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
