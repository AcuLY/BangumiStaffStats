## Context

The updater's standard-library client currently constructs
`ProxyHandler({})`, correctly preventing ambient proxy inheritance but also
making the approved host proxy unusable. Direct GitHub Raw requests on
`myserver` are intermittently black-holed; authenticated HTTPS through the
existing `myserver-proxy:7897` CONNECT endpoint is stable. The solution crosses
the updater transport boundary and operations projection, but must not weaken
source identity or broaden production authority.

| Field | Declaration |
|---|---|
| Status | Design implemented and accepted; repository and Actions gates are complete, with production application deferred to the activation change. |
| Owner | Main agent owns design/spec/audit/acceptance. One implementation subagent owns the exact repository block. |
| Writable paths | Exact paths declared in the proposal, plus this change's artifacts/task state. |
| Read-only protected inputs | Product/contracts, backend/frontend, unrelated updater/operations behavior, `myserver`, the running proxy, production roots/services, and every undeclared repository path. |
| Deletion complement | No persistent object. Existing exact test-temporary cleanup only. |
| Mutable refs | Change task state, implementation commit A, exact accepted-product pin commit B, and branch push. No host, deployment, release, or public ref. |
| Consumes | Strict HTTPS client, one-shot producer request, release env, Compose base file, operations transaction/rollback, and read-only proxy topology evidence. |
| Produces | Dedicated proxy input and optional tracked Compose overlay without new dependencies. |
| Dependencies | Approved OpenSpec → A1 `25791670b38914c4d7d1e885df5d719c061acf50` → B1 `2ed66558f55ed13f16dcafedf61afd5797b512cb` → failed run `30443632555` → focused typing fix A2 `7d2aa05853e55499a35d0afd9f6e4cb2dd3be17a` → final B2 `016160f7a63d68639a50e226c052fe75d5888f5f` → green run `30444069918`/artifact `8721121158` → activation amendment → separately authorized production application. |
| Deliverables | Proposal deliverables only. |
| Acceptance | Satisfied: delta scenarios, existing updater/operations gates, full Development Actions, and exact artifact inventory/checksums all passed at B2. |
| Non-goals | Proposal non-goals only. |
| Operations deferred | Proposal deferred items only. |
| Stop/rollback conditions | Proposal stop/rollback conditions only. |

Dependency direction is dedicated configuration → validated proxy handler →
existing HTTPS origin/redirect/TLS/content gates; and release env → optional
Compose overlay → updater container only. Proxy state never becomes an updater
or repository-owned object.

## Goals / Non-Goals

**Goals:**

- Allow a caller to opt into one explicit, validated HTTP CONNECT proxy for
  HTTPS acquisition.
- Preserve direct mode and every existing source/TLS/content gate.
- Persist an optional URL/network pair in release state and project it only
  onto the one-shot updater.
- Keep deployment and rollback transactional.

**Non-Goals:**

- Generic environment proxy inheritance, credentials, HTTPS interception,
  custom CA bundles, destination expansion, retries, transparent routing, or
  proxy lifecycle management.
- Any product/API/frontend/data-semantic change.

## Decisions

### 1. Use one dedicated environment input

`BGMSS_HTTPS_PROXY` is read only when the `produce` command constructs its
request. Absence means the existing direct client. A configured value is at
most 320 ASCII bytes and must be canonical
`http://HOST:PORT`: `HOST` is at most 253 lowercase ASCII DNS-label bytes,
each label is 1–63 lowercase letters/digits/hyphens without edge hyphens, and
`PORT` is canonical decimal `1..65535`; userinfo, trailing slash, path, query,
fragment, defaulted/zero-padded port, IPv6 literal, and any other spelling are
rejected. Empty or invalid values fail before staging or external network
access, while sanitized lifecycle event/status evidence remains allowed.
Generic upper/lower-case HTTP, HTTPS, ALL, and NO proxy variables remain
ignored, and imports remain environment-side-effect free.

Alternative rejected: inheriting `HTTPS_PROXY`, because ambient process state
would silently change acquisition authority. Alternative rejected: embedding
credentials, because the existing local proxy needs none and secrets must not
enter release env or logs.

### 2. Keep HTTPS validation above the proxy transport

`StrictHTTPSClient` builds an explicit HTTPS-only transport when the dedicated
value exists and otherwise retains `ProxyHandler({})`. The configured path
must never call ambient proxy-bypass resolution, so `NO_PROXY=*` cannot bypass
it. Existing URL and redirect allowlists run before/after requests, while
Python's normal TLS verification applies to the destination through CONNECT.
Status, length, digest, ZIP, commit, and cancellation gates are unchanged. The
proxy value is never emitted in events or errors.

Alternative rejected: raw IP/hosts pinning, because live tests showed
intermittent failure across all four GitHub Raw addresses. Alternative
rejected: disabling TLS verification or adding a custom CA.

### 3. Make proxy projection an optional operations overlay

The base Compose topology remains direct and unchanged. A tracked
`compose.updater-proxy.yaml` is included by the common Compose wrapper only
when root-managed release env contains both
`BGMSS_UPDATER_HTTPS_PROXY` and `BGMSS_UPDATER_PROXY_NETWORK`. The overlay maps
the former to container-only `BGMSS_HTTPS_PROXY` and adds only updater to the
named pre-existing external network; API and Prometheus are unchanged. The
external network is inspected but never created, altered, or removed.

Release env records an explicit `direct` or `proxy` transport mode; proxy mode
requires the URL/network pair and direct mode forbids it. `deploy` accepts
`preserve` (default), `direct`, or `proxy`: preserve copies the current mode
(and treats a pre-change env with no mode as direct), direct explicitly removes
the pair, and proxy requires a complete validated pair. The network name is
1–128 ASCII bytes matching `[A-Za-z0-9][A-Za-z0-9_.-]*`. Candidate/previous env
therefore restores exact routing on normal application rollback. Core
root/project/ports/Prometheus/profile topology remains immutable. Direct-mode
isolated validation remains available, and static validation additionally
renders the proxy overlay with safe synthetic values.

The common wrapper reads and validates transport mode and pair only from the
root-managed `current.env`. Before invoking Compose it removes ambient
`BGMSS_UPDATER_TRANSPORT`, `BGMSS_UPDATER_HTTPS_PROXY`, and
`BGMSS_UPDATER_PROXY_NETWORK` from the child process so Compose interpolation
cannot apply its normal shell-over-`--env-file` precedence. A tracked
`operations/test/updater-proxy.sh`, invoked by `build-bundle.sh` before product
builds, renders direct and proxy projections with deliberately conflicting
ambient values and requires the resulting updater environment/network to equal
`current.env`; it also exercises invalid pairs/modes and previous-env mode
preservation.

Alternative rejected: hard-coding `proxy-net` or `myserver-proxy`, because the
repository deployment capability should remain portable. Alternative
rejected: host TUN/NAT, because it adds privileged, opaque host state.

## Risks / Trade-offs

- **The external proxy/network may disappear** → fail the update before
  publication; API remains on the existing Archive and deployment rollback is
  unaffected.
- **An invalid proxy could redirect transport** → strict credential-free URL
  validation plus unchanged destination TLS/origin checks.
- **Release env schema changes on an existing private deployment** → deploy
  writes a complete candidate env atomically and retains the previous env;
  production activation must preflight the exact external network/endpoint
  before changing it.
- **Updater joins a shared network** → only the already hardened terminating
  updater joins it; no port is published and no other new service joins.
- **Calling-shell variables can outrank `--env-file`** → the wrapper clears the
  three transport keys for the Compose child and Actions exercises conflicting
  ambient values.

## Migration Plan

1. Implement updater input/validation and operations overlay/release support
   and complete the main-agent candidate audit. Completed in A1
   `25791670b38914c4d7d1e885df5d719c061acf50`.
2. Pin A1 in B1 `2ed66558f55ed13f16dcafedf61afd5797b512cb`.
   Run `30443632555` passed all pytest behavior but failed mypy because one
   test inspected an untyped private standard-library attribute. A2
   `7d2aa05853e55499a35d0afd9f6e4cb2dd3be17a` changed only that assertion and
   B2 `016160f7a63d68639a50e226c052fe75d5888f5f` repinned the accepted product.
   Run `30444069918` then passed both jobs and emitted artifact `8721121158`,
   `operations-preview-016160f7a63d68639a50e226c052fe75d5888f5f`,
   digest `sha256:dcbe316408344c80754cc0248fb924356c5f578d16bf8fe5f36ca34a2dee2ed8`.
3. Amend `activate-single-host-production` with exact B2/run/artifact and exact
   `proxy-net`/`http://myserver-proxy:7897` read-only preflight/projection.
4. Deploy the new revision transactionally, verify the projected updater
   environment/network/TLS path, and permit one production updater retry.
5. On deployment/projection failure, restore the previous release env,
   transport mode, and application bytes; leave public traffic on the legacy
   serving path.

## Open Questions

None.
