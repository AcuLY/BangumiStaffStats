## Capability Boundary

| Field | Declaration |
|---|---|
| Status | Python updater event/status capability retired; Backend observability owns direct process-local reporting. |
| Owner | Backend observability owns the replacement lifecycle state; Updater cleanup removes the old writer/events. |
| Writable paths | This delta spec and exact updater event/status implementation/tests after replacement acceptance. |
| Read-only protected inputs | Existing event/error identities as migration evidence, unrelated observability and public API behavior, production, hosts, remotes, and archived OpenSpec. |
| Deletion complement | Python updater lifecycle-event emitter, update-status writer/tests, and exact status-file CLI options. |
| Mutable refs | Local `codex/embed-go-archive-builder` only. |
| Consumes | Accepted Backend builder state and Backend observability interface. |
| Produces | Direct bounded Go logs/metrics for current/last run; no stdout protocol or persisted status file. |
| Dependencies | `backend-archive-builder`, `backend-observability`, and retirement of `contracts-update-status`. |
| Deliverables | Removal of Python events/status writer and focused Go lifecycle observability tests. |
| Acceptance | Success, no-change, failure, and cancellation are observable without `update-status.json`, Python, or cross-process parsing. |
| Non-goals | Durable history, public status API, dashboard, queue, or retry control plane. |
| Operations deferred | Alert rollout, production logging verification, deployment, and host status-file cleanup. |
| Stop/rollback conditions | Stop if the replacement leaks secrets/paths or changes query readiness on build failure; roll back owned local changes. |

## REMOVED Requirements

### Requirement: Produce SHALL emit one stable lifecycle stream

**Reason**: The Python `produce` CLI and its stdout/stderr protocol are removed.

**Migration**: Emit bounded builder lifecycle logs and metrics directly from the Go process without a cross-process event stream.

### Requirement: Phase reporting SHALL observe but not redefine production

**Reason**: The optional Python observer and CLI phase events no longer exist.

**Migration**: Let the Go builder update Backend-owned phase state at existing successful phase boundaries without introducing a second state machine.

### Requirement: Terminal status SHALL be atomically persisted

**Reason**: No separate producer/consumer process boundary requires durable `update-status.json`.

**Migration**: Keep current/last terminal state in bounded process memory; restart begins with no historical run status and performs the required asynchronous freshness check.

### Requirement: Status observability SHALL remain development-only

**Reason**: Update observability becomes an ordinary production responsibility of the Backend scheduler/builder rather than a development-only Python writer.

**Migration**: Specify bounded production-safe logs/metrics under `backend-observability`; do not add a timer service, file exporter, or new dependency.
