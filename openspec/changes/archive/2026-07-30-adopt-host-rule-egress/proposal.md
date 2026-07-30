## Why

`myserver` currently exposes one bridge-only Mihomo endpoint and injects it
into selected services. Although Mihomo reports `mode: rule`, the installed
configuration has only `MATCH -> Proxy`; host processes and containers that
are not explicitly attached and configured bypass it entirely. This is not
the requested scenario proxy and is the direct cause of production collection
requests timing out while a manually proxied request succeeds.

The required model is the one verified on `mypc`: transparent host capture
through TUN, Mihomo remaining in `rule` mode, DNS participating in target
classification, and each destination resolving to DIRECT or Proxy without
per-application proxy configuration.

## What Changes

- Make a host-owned, boot-persistent Mihomo TUN/auto-redirect gateway the
  single egress authority for host processes and Docker bridge traffic.
- Preserve `mode: rule`; protect local, private, metadata, Docker, proxy
  bootstrap, SSH, Nginx, and health traffic from recursion or lockout.
- Seed the server policy from the sanitized live `mypc` scenario rules, map
  its direct/proxy outcomes onto the server's one DIRECT/Proxy topology, and
  use Proxy for otherwise unmatched public destinations.
- Retire the Bangumi deployment's proxy overlay, release transport
  mode/URL/network state, and per-service proxy projection. The base Compose
  topology remains the only project topology.
- Migrate existing services under a temporary dual-proxy and automatic
  rollback window, then remove their explicit proxy environments and stop the
  obsolete bridge proxy only after host and container proof succeeds.
- Verify real collection, image, updater, Archive, route, observability, SSH,
  restart-policy, and non-interference behavior.

## Capabilities

### New Capabilities

None. The host gateway is shared host infrastructure rather than a new
Bangumi product capability.

### Modified Capabilities

- `operations-single-host-deployment`: consume host-transparent rule egress
  as a host prerequisite and remove project-owned per-service proxy topology
  and release state.

## Impact

| Boundary | Declaration |
|---|---|
| Status | Proposed; repository apply and live mutation are blocked until all artifacts are complete, strict-valid, and reviewed by the main agent. |
| Owner | Operations for repository changes; main agent for specification, audit, host migration, deployment, and acceptance. |
| Repository writable paths | `operations/README.md`; `operations/env.example`; `operations/bin/build-bundle.sh`; `operations/bin/deploy`; `operations/bin/validate-isolated`; `operations/lib/common.sh`; `operations/test/updater-proxy.sh` only for removal/rename into one retained runtime test; deletion of `operations/compose.updater-proxy.yaml`; this change's task markers. |
| Live writable paths | A new `/root/myserver-proxy-global/`; exact backed-up proxy/application Compose/config files discovered during preflight; `/srv/bgmss-v2` only through its admitted operations transaction; one named temporary rollback unit. |
| Read-only protected inputs | Product source, backend/updater proxy fallback code, contracts, data, Nginx public route, Prometheus rules, systemd update units, stopped legacy loader, SSH/Docker/Nginx service definitions, unrelated host services, secrets, and live `mypc`. |
| Deletion complement | Only the tracked project proxy overlay/test name and obsolete project release-transport code/docs; on host, only explicit proxy entries proven superseded and the old proxy instance after it has no consumers. |
| Mutable refs | Task markers and main-agent Git lifecycle only. |
| Consumes | Current single-host operations, current host proxy/node, sanitized target rules from live `mypc`, verified TUN/nftables/Docker host capabilities. |
| Produces | One project topology with no proxy injection plus one live host-transparent scenario gateway and acceptance evidence. |
| Dependencies | Green Development Actions for the accepted commit before Bangumi release deployment; host gateway activation precedes removal of any explicit proxy consumer. |
| Deliverables | Simplified operations code/tests/docs, host gateway, migrated services, deployed footer repair, and real-user end-to-end proof. |
| Acceptance | Strict OpenSpec; operations runtime/static tests; Development Actions; host/controller and every relevant Docker-network egress probes; public root and `/v2/`; real query/images; health/metrics/logs; restart and rollback checks. |
| Non-goals | Mihomo `global` mode; an enterprise network controller; hand-written TPROXY chains; changing product/API/data semantics; copying personal proxy nodes or publishing profile credentials; replacing Nginx routing; restarting the host. |
| Stop/rollback conditions | Stop on unverified image/rules, public listener, SSH/Nginx/Docker regression, DNS failure, route recursion, container bypass, unrelated dirty overlap, or missing rollback authority. Automatic rollback remains armed until all required live checks pass. |

External behavior classification: **OPERATIONS_CORRECTION**. Product routes
and UI remain unchanged except for the separately specified oracle-footer
repair.
