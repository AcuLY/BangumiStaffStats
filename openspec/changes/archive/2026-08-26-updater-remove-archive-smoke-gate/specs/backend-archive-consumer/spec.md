## Capability Boundary

| Field | Boundary |
|---|---|
| Status | Modified capability; command removal only |
| Owner | Backend |
| Writable paths | `backend/cmd/archive-smoke/**`, command inventory/tests/docs, this delta and lifecycle root spec |
| Read-only protected inputs | `internal/archive`, API startup, contracts, schemas, goldens and existing Archives |
| Deletion complement | Delete only the dedicated command and its tests |
| Mutable refs | Local topic branch only |
| Consumes | Existing real API startup loader |
| Produces | One Backend command surface: API only |
| Dependencies | Contracts -> Backend archive consumer |
| Deliverables | Removed command and updated architecture/check inventory |
| Acceptance | Backend archive/API/check gates and residual-reference audit |
| Non-goals | Weaken or modify the shared loader or readiness |
| Operations deferred | Live rollout and legacy tool cleanup |
| Stop/rollback conditions | Stop if API startup admission changes or loses coverage |

## REMOVED Requirements

### Requirement: Candidate smoke SHALL be bounded and pointer-free

**Reason:** The dedicated pointer-free command and its cross-language pre-publication role are removed at the user's direction; real API startup remains the sole Go Archive admission boundary.

**Migration:** Delete `cmd/archive-smoke` and remove all build, Updater and Operations consumers in the same change. Do not modify `internal/archive` or API readiness behavior.
