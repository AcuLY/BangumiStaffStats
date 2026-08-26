## Capability Boundary

| Field | Boundary |
|---|---|
| Status | Modified package inventory |
| Owner | Backend |
| Writable paths | Architecture dependency test, command deletion, this delta and lifecycle root spec |
| Read-only protected inputs | Remaining package graph and external dependency policy |
| Deletion complement | Remove only the archive-smoke command node/edge |
| Mutable refs | Local topic branch only |
| Consumes | Existing Backend package graph |
| Produces | API-only command graph |
| Dependencies | Contracts -> Backend |
| Deliverables | Updated architecture allowlist and passing graph test |
| Acceptance | Backend architecture and full check gates |
| Non-goals | Change any remaining package dependency |
| Operations deferred | None beyond rollout |
| Stop/rollback conditions | Stop on new/reverse edge or dependency drift |

## MODIFIED Requirements

### Requirement: Package dependencies SHALL follow the approved direction

The foundation SHALL enforce `cmd/api -> app -> {archive,httpapi}`,
`httpapi -> {imageproxy,observability,wire}`,
`imageproxy -> standard library`, `observability -> standard library`, and
`query -> {archive,cache,collection}` for later admitted query work.
`archive`, `imageproxy`, `query`, `cache`, `collection`, and `observability`
MUST NOT import transport or application layers. Production imports outside
the standard library SHALL remain limited to the generated wire runtime and
the approved SQLite driver/VFS. Cycles, unknown packages, nested modules, and
production `workbench` naming SHALL be rejected.

#### Scenario: Foundation graph is valid
- **WHEN** the architecture test inspects the real module
- **THEN** all current packages and external imports SHALL follow the approved direction

#### Scenario: A reverse edge or cycle is introduced
- **WHEN** a package violates the allowed graph or imports an unapproved production dependency
- **THEN** the architecture test SHALL fail with the offending edge/package
