## Context

Product revision `34176077787b7942741ae412d3f012c732a51ee0`
already owns the API/updater Dockerfiles, frontend build, health endpoints,
metrics, and component build helpers. The missing layer is a normal
single-host runtime. The host already runs the legacy project, so validation
must use a separate root, Compose project, images, network, ports, and data.

The previously explored release-receipt and sealed-handoff control plane is
preserved on `codex/ops-authority-superseded` but is not a dependency or
deliverable of this change.

| Field | Declaration |
|---|---|
| Status | Design ready for main-agent review; implementation and remote validation have not started. |
| Owner | Main agent owns decisions/audit/acceptance. One Actions-bundle owner and one runtime/template owner implement disjoint paths. |
| Writable paths | Exact repository and isolated-host paths declared by the proposal. |
| Read-only protected inputs | Product source/contracts/CI and all existing host state declared by the proposal. |
| Deletion complement | Only exact run-owned validation objects; production and legacy deletion are absent. |
| Mutable refs | Implementation branch, manual build artifact, validation root/project/ports/images only. |
| Consumes | Product build helpers and runtime endpoints, the valid minimal Archive fixture, operations guide, and admitted host tools. |
| Produces | One deployment bundle, one minimal runtime/config set, and one isolated validation result. |
| Dependencies | Development Actions → manual AMD64 bundle → read-only host preflight → isolated Compose validation → cleanup/audit → archive. |
| Deliverables | Files, green Actions, bundle run, remote validation, archived spec, push, report. |
| Acceptance | Proposal acceptance plus every scenario in the delta spec. |
| Non-goals | The proposal's excluded proof/release/activation/retirement systems. |
| Operations deferred | Public activation, production install/enable, live traffic, and legacy retirement. |
| Stop/rollback conditions | Preserve the legacy baseline; restore validation-local previous state and remove only run-owned objects on failure. |

Dependency direction is Product artifacts → Operations bundle → Compose/runtime
scripts → isolated host validation. Operations never writes back into Product
owners.

## Goals / Non-Goals

**Goals:**

- Build one AMD64 deployment bundle in GitHub Actions without a registry.
- Run API, updater, and Prometheus with Compose on a 2-core/4-GiB host.
- Support installation, readiness checks, weekly update activation, and
  separate application/data rollback with a small Bash control surface.
- Provide inert production Nginx/systemd/logrotate/Prometheus configuration.
- Rehearse startup, pointer switching/restoration, logging, and cleanup on
  `myserver` without affecting legacy state.

**Non-Goals:**

- Reproducibility proofs, receipt/handoff schemas, release publication,
  deployment credentials, public activation, exhaustive failure injection, or
  a general-purpose controller.
- Any product behavior or visual change.

## Decisions

### 1. Use one short-lived Actions bundle instead of a registry release

The manual workflow reuses the accepted pinned tool setup and invokes each
component's existing single-build entrypoint for `linux/amd64`. It packages:

- `api.oci.tar`;
- `updater.oci.tar`;
- the Backend binary bundle containing `archive-smoke`;
- `frontend.tar`;
- the valid minimal Archive fixture for bounded validation;
- `build.json` with source revision/tree/version; and
- `SHA256SUMS`.

It uploads one artifact with one-day retention. This is enough to transfer
tested bytes to `myserver` and avoids GHCR credentials and a release control
plane. Alternative rejected: building source on the target host, because it
adds host language toolchains; a future public release may add a registry.

### 2. Keep Compose conventional and environment-driven

One static `operations/compose.yaml` defines `api`, `updater`, and
`prometheus`. API and Prometheus are long-running; updater is one-shot. API and
Prometheus ports bind only `127.0.0.1`; the project name, root, image tags, and
ports come from a root-owned env file. Services use non-root users,
`read_only`, `init`, dropped capabilities, `no-new-privileges`, bounded
CPU/memory/PIDs, tmpfs, and journald logging.

Validation loads OCI archives under run-specific local tags. Production may
later use digest references through the same env fields. No service mounts the
Docker socket or a legacy path.

### 3. Use one small host transaction model

All state-changing commands take the fixed root-local `flock`. `deploy`
verifies `SHA256SUMS`, loads images, installs a versioned frontend/tool bundle,
writes a candidate env, starts the API, waits for `/readyz`, and switches the
frontend symlink last. Failure restores the previous env/link and restarts the
previous API.

`update` runs the fixed updater service, obtains its terminal data version,
creates `current.json` atomically, restarts API, and restores the previous
pointer if readiness fails. `rollback-app` and `rollback-data` change only
their own dimension. Each successful switch maintains explicit current and
previous rollback references. Historical release and Archive pruning is not
automatic: the operations guide requires a separate successful rollback drill
before an older version may be deleted.

This deliberately avoids inode ledgers, a control runtime, or recovery
schemas. Strict argument validation, canonical fixed roots, atomic rename, a
single lock, and readiness-based rollback are the required safety boundary.

### 4. Reuse product health and expose only simple observability

The host check reads `/livez`, `/readyz`, and `/metrics`; Prometheus scrapes
the API every 30 seconds and retains seven days/512 MiB. Initial rules cover
API down/not-ready, sustained 5xx/upstream failures, queue/cache pressure, and
updater failure/age. Compose logs go to journald; host templates bound journal
size and rotate Nginx access/error logs. No additional observability stack is
introduced.

The reviewed Prometheus input for the AMD64 rehearsal is
`prom/prometheus:v3.13.1-distroless@sha256:214f8427c8fba80c327bb94a75feb802ae12f2d6ca30812aa6e7d22f09bbea80`.
The isolated validator may pull that exact digest when absent and must remove
the image afterward only when the current run introduced it.

### 5. Validate host integration inertly

Remote preflight records architecture, Docker/Compose availability, exact
absence of the validation root/project, free loopback ports, disk, and a
read-only legacy snapshot. It then creates only
`/srv/bgmss-ops-validation-minimal-<run-id>`, starts a unique project, checks
health/metrics/Prometheus/logging, performs validation-local pointer
switch/restore and restart rollback, and validates Nginx/systemd templates.

Nginx is checked with a temporary prefix/config and systemd units with
`systemd-analyze verify`; neither is installed, enabled, reloaded, or routed.
Postflight compares the legacy snapshot and removes only the run-owned project
and root.

## Risks / Trade-offs

- **Actions artifacts are not a public release channel** → one-day retention
  and manual transfer are accepted for this deployment rehearsal; registry
  publication remains deferred.
- **The minimal golden Archive is not a full weekly production build** →
  updater image `doctor`/contract checks and the complete update command are
  exercised, while the bounded pointer transaction is rehearsed with the
  fixture; a real weekly run occurs only during approved production rollout.
- **Bash has fewer structural guarantees than the superseded controller** →
  keep commands small, use exact roots/arguments, one lock, atomic files,
  readiness rollback, shell syntax/static checks, and isolated execution.
- **Fixed validation ports may be occupied** → preflight stops without writes;
  it never kills or reconfigures the occupant.

## Migration Plan

1. Commit and push the reviewed OpenSpec.
2. Implement and statically validate the Actions bundle and runtime files.
3. Push and require green Development Actions.
4. Dispatch the AMD64 bundle workflow and download its single artifact.
5. Preflight `myserver`, transfer the bundle/config into a fresh validation
   root, run isolated validation, and clean it.
6. Synchronize/archive the capability and report repository-defined and
   isolated-validated states separately.
7. Only a later explicit activation approval may install `/srv/bgmss-v2`,
   enable systemd, or reload Nginx.

## Open Questions

None for repository implementation or isolated validation. Production
hostname/TLS installation and activation timing are deferred decisions.
