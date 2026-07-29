## Why

The production frontend, backend, and updater are complete, but the repository
does not yet contain a small, executable single-host deployment path. The
current completion target is intentionally limited to container deployment,
the observability already required by the operations guide, and an isolated
`myserver` rehearsal that cannot affect the running legacy project.

## What Changes

- Add one manual GitHub Actions workflow that performs one `linux/amd64`
  build from the accepted product revision and uploads a short-lived deployment
  bundle containing the two OCI images, frontend static files, checksums, and
  source/version metadata.
- Add one Docker Compose topology for the API, one-shot updater, and
  Prometheus, with loopback-only host ports, bounded resources, journald
  logging, and no shared writable state with the legacy project.
- Add small host scripts for bundle installation, health checks, weekly
  Archive update/activation, application or data rollback, and isolated
  validation. They use one fixed `flock`, preserve explicit current/previous
  rollback references, and restore the previous state when readiness fails.
  Automatic historical release or Archive deletion is outside this minimal
  path.
- Add inert Nginx, systemd timer/service, log rotation, Prometheus scrape/rule,
  and operator documentation matching the existing operations guide.
- Validate the bundle and topology in one absent run-owned directory on
  `myserver`; validate Nginx/systemd templates without enabling a public route
  or changing the running legacy project.
- Preserve the product oracle and all frontend/API/statistical behavior.
  Classification: **PRESERVE_ORACLE** at
  `644b7748674e553f863d0ffd61d029f86fdc0717`; this change adds operations
  capability only.

## Capabilities

### New Capabilities

- `operations-single-host-deployment`: Minimal single-host build, Compose,
  update, rollback, health/metrics/logging, host templates, and isolated
  validation behavior.

### Modified Capabilities

None.

## Impact

| Field | Declaration |
|---|---|
| Status | Specifying a minimal deployment path. No implementation, release, public activation, or legacy retirement is yet claimed. |
| Owner | Main agent owns scope/specification/audit/Git/acceptance. Separate implementation owners may implement the Actions bundle and the host runtime/templates in parallel after approval. |
| Writable paths | This change; new `.github/workflows/operations-preview.yml`; new `operations/README.md`, `operations/.gitignore`, `operations/compose.yaml`, `operations/bin/**`, `operations/lib/**`, `operations/nginx/**`, `operations/prometheus/**`, and `operations/systemd/**`; one absent `/tmp/bgmss-ops-minimal-input-<run-id>/**` transfer root and one absent `/srv/bgmss-ops-validation-minimal-<run-id>/**` runtime root on `myserver` during isolated validation. |
| Read-only protected inputs | All `backend/**`, `updater/**`, `frontend/**`, `contracts/**`, existing `.github/workflows/ci.yml`, root product/design/planning documents outside this change, and all other repository paths. On `myserver`, all pre-existing paths, the running legacy project, `/srv/bgmss/**`, `/srv/bgmss-v2/**`, existing Docker objects, Nginx/systemd/TLS configuration, public routes/listeners, secrets, users, firewall, DNS, and data remain read-only. |
| Deletion complement | No tracked or pre-existing object. Validation cleanup may remove only the exact run-owned Compose project, containers, network, images loaded under run-specific tags, the exact absent-created validation root, and the exact absent-created transfer root after identity/name checks. No prune, volume deletion, broad glob, legacy cleanup, or production-root deletion. |
| Mutable refs | This branch and its commits/push; one manual Actions run/artifact; one unique validation Compose project; loopback ports `19090` and `19091` only after confirming they are free; run-tagged images and the exact validation root. |
| Consumes | Accepted product revision `34176077787b7942741ae412d3f012c732a51ee0`; existing component Dockerfiles/build helpers; `/livez`, `/readyz`, `/metrics`; valid minimal Archive fixture for bounded startup/rollback rehearsal; the operations guide; Docker/Compose, Nginx, systemd, curl, and flock capability on `myserver`. |
| Produces | A short-lived AMD64 deployment bundle; minimal Compose/runtime scripts and host templates; green Development Actions; isolated health, metrics, log, update-pointer, rollback, cleanup, and legacy-noninterference evidence. |
| Dependencies | Product revision and Development Actions must be green before the manual bundle is admitted. The bundle must succeed before any remote write. Read-only host/path/port/project preflight must pass before creating the validation root. |
| Deliverables | Repository deployment files, one pushed implementation branch, successful Development and bundle Actions, one cleaned isolated `myserver` rehearsal, synchronized/archived OpenSpec, and a concise operator report. |
| Acceptance | Pinned OpenSpec strict validation; YAML/shell/static policy checks; green `development-artifacts`; one successful manual AMD64 bundle run; checksum verification; `docker compose config`; API `/livez`, `/readyz`, `/metrics`; Prometheus readiness and API scrape; journald driver; bounded update-pointer switch plus restoration; application restart/rollback; Nginx/systemd template validation; old project identities/listeners/routes unchanged; exact run-owned cleanup. |
| Non-goals | No sealed handoff, acceptance receipt authority, reproducible double build, release schema, attestation graph, new control runtime, fault-injection matrix, zero-residue proof framework, registry publication, GHCR release, production traffic cutover, TLS/DNS/firewall mutation, secret installation, legacy retirement, SLO sign-off, Grafana/Loki/Tempo/Alertmanager, or frontend/backend/updater product change. |
| Operations deferred | Public Nginx activation/reload, enabling the production timer, production secret/user installation, `/srv/bgmss-v2` activation, release publication, live traffic switch, extended load/soak observation, and legacy shutdown require explicit later activation approval. |
| Stop/rollback conditions | Stop before writes if branch/head, Actions, host architecture, Docker/Compose, both run-owned path absences, project-name uniqueness, free loopback ports, disk, or legacy baseline checks fail. After owned writes, stop the exact project, restore any validation-local current/previous pointer or release env, remove only run-owned objects and both exact run roots, and report any ambiguous residue without touching legacy state. |

This change touches no other repository. Apply remains blocked until proposal,
specification, design, and tasks are complete, strictly valid, and approved by
the main agent.
