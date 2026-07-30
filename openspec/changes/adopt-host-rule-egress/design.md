## Context

The current `myserver-proxy` is a normal Docker bridge service. It has no TUN
device, `NET_ADMIN`, host networking, policy route, redirect listener, or host
DNS ownership. Selected Compose services join `proxy-net` and receive
dedicated proxy variables; every other request remains direct. Its one
`MATCH` rule also means that traffic explicitly sent to it is not classified
by target.

Live `mypc` proves the intended semantics: the host is transparently captured,
Mihomo stays in `rule` mode, DNS/fake-IP supplies destination identity, and
inline rules select direct, proxy, AI, Apple, or fallback groups. The server
does not need the desktop UI, personal publishing node, or Windows startup
mechanism, but it does need the same transparent-capture and destination-rule
model.

The host supports the minimal Linux implementation: CentOS 9, kernel 5.14,
iptables-nft/nftables, `/dev/net/tun`, forwarding, Docker 26, and Mihomo
v1.19.25 are present.

## Goals / Non-Goals

**Goals:**

- Capture host OUTPUT and Docker bridge/FORWARD egress without application
  proxy variables.
- Decide DIRECT or Proxy by destination while preserving local connectivity,
  bootstrap, inbound reply paths, and host administration.
- Remove the Bangumi operations overlay and release proxy state instead of
  retaining an unused alternate topology.
- Migrate without interrupting root legacy serving, `/v2/`, SSH, Nginx,
  Docker, bgmtl, or the stopped legacy loader.
- Fail open during initial adoption and retain an exact automatic rollback.

**Non-Goals:**

- Use Mihomo `global` mode.
- Copy `mypc` proxy credentials, personal SSH publishing behavior, GUI, or
  Windows-only configuration.
- Build custom REDIR/TPROXY/nftables ownership when Mihomo's documented Linux
  `auto-route` + `auto-redirect` path works on this host.
- Track global host secrets or the full host proxy configuration in this
  repository.
- Remove dormant application-level proxy fallback APIs outside the production
  deployment boundary.

## Decisions

### One host-owned transparent gateway

The final proxy uses the already installed Mihomo version and image digest,
not `latest`, with:

- host network namespace;
- only `NET_ADMIN` plus `/dev/net/tun`;
- no privileged mode or host PID namespace;
- `mode: rule`;
- TUN `stack: mixed`, `auto-route`, `auto-redirect`, and
  `auto-detect-interface`;
- DNS hijack for TCP/UDP port 53 and a Mihomo-owned fake-IP resolver;
- controller, DNS, and optional mixed port bound only to loopback;
- `allow-lan: false`;
- boot persistence through Docker plus `restart: always`.

Host networking is required because TUN and the automatically managed route/
nftables state must live in the host namespace. The official Mihomo TUN
contract says `auto-route` installs global routes and Linux
`auto-redirect` handles forwarded/router traffic; that claim is treated as an
implementation mechanism, not acceptance evidence. Host and each actual
Docker bridge network must still pass live tests.

### Scenario rules preserve behavior, not personal infrastructure

Only the sanitized live `mypc` rule list is reused. Actions map as follows:

| `mypc` target | `myserver` target |
|---|---|
| `DIRECT`, `❌不代理`, `🍎苹果服务` | `DIRECT` |
| `Proxy`, `🤖AI服务`, `⚓️其他流量` | `Proxy` |

Before those rules, server safety rules force loopback, RFC1918, link-local,
Docker networks, cloud metadata, local service discovery, proxy bootstrap, and
the temporary old-proxy source to DIRECT. The final unmatched public outcome
is Proxy. The server retains one explicit Proxy selector so the existing node
can be changed without rewriting rules.

DNS bootstrap values and the proxy upstream endpoint must not recurse through
the TUN. Bangumi hosts that perform application-side public-IP validation are
excluded from fake-IP synthesis while their resulting connections remain
captured and rule-routed.

### The project no longer owns proxy selection

`operations/compose.yaml` remains the only Bangumi Compose file. No service
receives `BGMSS_HTTPS_PROXY`, `BGMSS_IMAGE_HTTPS_PROXY`, generic proxy
variables, or an external proxy network from operations.

Release env, deploy CLI, common Compose wrapper, isolated validation, and
runtime tests no longer encode `direct|proxy`, URL, or network. Existing
application-level proxy fallback code is left dormant and read-only in this
change; production proves that those inputs are absent. This keeps host
network policy in one owner without broadening the correction into unrelated
application refactors.

One migration-only exception admits the exact closed legacy release env with
`BGMSS_UPDATER_TRANSPORT=proxy`, its canonical URL/network pair, and the exact
installed retired overlay. After acquiring the shared operations lock, deploy
first writes a proxy-free env with the same old images/topology, force-recreates
API and Prometheus through base Compose, and waits for readiness. A failure in
this normalization step restores the original bytes and uses only the strictly
validated legacy overlay to recover. Success establishes the verified clean old
application as both rollback slots and removes the overlay before candidate
work; every later candidate failure and application rollback is therefore
base-only. Unknown, partial, modified, direct-mode, or generic-proxy legacy
state remains a lock-free rejection.

The large existing proxy test also covers workflow-prefix, deploy transaction,
and rollback behavior. It is renamed and reduced to retain those independent
assertions rather than deleted wholesale. It additionally exercises successful
legacy normalization, exact raw recovery when normalization fails, clean-old
recovery when candidate readiness fails, and `rollback-app` across the
migration boundary.

### Dual-instance migration with an armed rollback

The bridge proxy stays running while a separately named host-TUN candidate is
validated. Before activation, the operator records routes/rules/nftables,
container definitions, proxy inputs, listeners, service state, and exact
backups. A narrowly named transient systemd rollback runs after seven minutes
unless canceled.

The host gateway is activated first. Host requests and temporary containers
on `bgmss-v2_backend`, `bgmss_default`, and `bgmtl_default` then make one
known-direct and one known-proxy request with all proxy variables removed;
Mihomo connection evidence must show the expected rule outcome.

Explicit proxy inputs are removed one service at a time and only that service
is recreated. The legacy loader remains stopped. The old bridge proxy is
stopped only after it has no remaining consumer and real product acceptance
passes. Its network is removed only when Docker proves it has no endpoints.

### Initial runtime is deliberately fail-open

`strict-route` is off for the first production adoption. Stopping the
host-TUN Compose must remove its own routing state and restore ordinary direct
host egress; Docker restarts the gateway after process failure. This favors
service and administrative reachability during adoption. A later fail-closed
policy would be a separate explicitly reviewed host-security change.

## Risks / Trade-offs

- **Transparent routing can lock out SSH or public replies** → keep two SSH
  sessions and console access, bind listeners to loopback, protect local/
  metadata/bootstrap paths, arm timed rollback, and verify a new external SSH
  session before cancellation.
- **Docker forwarding may bypass or conflict with nftables ordering** →
  require probes from each real network plus controller route evidence; do not
  infer coverage from host curl.
- **Fake-IP can conflict with application public-address checks** → exclude
  the exact validated Bangumi image hosts from fake-IP while retaining TUN
  capture of their real IP connections.
- **The old bridge proxy can recurse through the new gateway** → temporarily
  route its exact source directly and remove that exception only after the old
  instance stops.
- **Removing proxy release state is a broad operations edit** → retain
  workflow, deploy transaction, rollback, Compose closure, and isolated
  validation assertions in a renamed runtime test and use Actions as the
  authoritative build gate.
- **Global host configuration affects unrelated services** → repository code
  does not own the global config; live writes are limited to exact inspected
  files and verified service recreations.

## Migration Plan

1. Simplify repository operations and obtain green Development Actions.
2. Export and validate only the sanitized live `mypc` rules; pin the existing
   server Mihomo image and validate an offline candidate configuration.
3. Record live preimages, create the host-TUN candidate, and arm the timed
   rollback.
4. Start the candidate and verify SSH, Nginx, Docker, DNS, host direct/proxy
   outcomes, and every relevant Docker network.
5. Remove explicit proxy settings one consumer at a time. Under the existing
   Bangumi operations lock, normalize its exact legacy proxy release to a
   verified clean old base-only rollback point, then deploy the accepted bundle
   and keep the old loader stopped.
6. Verify root legacy, `/v2/`, real user collection/ranking/image flows,
   Archive, health, metrics, logs, updater reachability, and restart behavior.
7. Stop the old bridge proxy, remove only the now-unused network/temporary
   exception, repeat acceptance, and cancel the rollback unit.
8. Sync/archive the OpenSpecs, commit/push/merge the final evidence state, and
   report repository, release, deployment, and live verification separately.

Rollback stops only the new host-TUN instance, restores exact backed-up
service definitions/inputs, restarts the old bridge proxy and affected
services, and verifies SSH plus both public routes. It never flushes the
firewall, restarts Docker, starts the old loader, or mutates product data.

## Open Questions

None. The user chose host-global scenario routing; the live `mypc` inspection
resolved its intended semantics.
