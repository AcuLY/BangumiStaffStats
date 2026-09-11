## Capability Boundary

| Field | Declaration |
|---|---|
| Status | Retired by `backend-embed-go-archive-builder`; specification only until strict validation and implementation acceptance. |
| Owner | Contracts owns removal of the cross-process status-file contract; Backend observability owns the replacement process-local state. |
| Writable paths | This delta spec, `contracts/schemas/update-status/**`, `contracts/goldens/update-status/**`, and the exact status-contract references declared by this change. |
| Read-only protected inputs | Product/query semantics, Archive schema/dataVersion contracts, unrelated Contracts artifacts, frontend, real Archive data, hosts, production, remotes, and historical archived OpenSpec. |
| Deletion complement | Only the update-status schemas, goldens, verifier/package files, and exact file-contract references after Backend in-process observability is accepted. |
| Mutable refs | Local `codex/embed-go-archive-builder` only; no remote refs. |
| Consumes | Existing update-status schema/goldens as migration evidence and the accepted Backend observability replacement. |
| Produces | No cross-process update-status artifact; Backend-owned in-memory lifecycle observations replace this capability. |
| Dependencies | `backend-archive-builder`, `backend-observability`, and removal of the Python updater status writer/reader. |
| Deliverables | Exact contract deletion, reference cleanup, and focused Backend observability tests proving the replacement. |
| Acceptance | No runtime argument, mount, reader, writer, schema, golden, alert, or artifact assembly step requires `update-status.json`; strict OpenSpec and affected gates pass. |
| Non-goals | Persistent job history, a new status API, dashboard, queue, retry service, or changes to public query behavior. |
| Operations deferred | Production activation, live status-file deletion, deployment, host writes, and monitoring rollout require separate authorization. |
| Stop/rollback conditions | Stop if any accepted external consumer still requires the file contract or replacement would change public API/query semantics; roll back only owned local changes. |

## REMOVED Requirements

### Requirement: The status document SHALL contain one closed terminal snapshot

**Reason**: The Go API now owns scheduling, building, activation, and observability in one process, so a cross-process `update-status.json` handoff is no longer produced or consumed.

**Migration**: Represent the current run and last terminal result directly in Backend-owned bounded in-memory observability; remove the API flag, read-only file mount, schema, and status reader.

### Requirement: Terminal state combinations SHALL be closed and consistent

**Reason**: These combinations existed solely to validate the retired cross-process JSON document.

**Migration**: Preserve only the lifecycle states required by `backend-observability` as typed Go state and metrics, without a durable file or cross-language schema.

### Requirement: Indexed goldens SHALL prove producer and consumer agreement

**Reason**: There is no longer a separate Python producer and Go file consumer requiring shared update-status goldens.

**Migration**: Replace relevant success, no-change, failure, and cancellation cases with focused Go builder/observability tests; delete only the updater-status golden corpus.
