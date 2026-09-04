## Capability Boundary

| Field | Boundary |
|---|---|
| Status | Modified lifecycle phase stream |
| Owner | Updater |
| Writable paths | Updater CLI/status writer/tests and shared contract paths declared in proposal; lifecycle root spec |
| Read-only protected inputs | Producer phase semantics outside removed gate, terminal status persistence and external state |
| Deletion complement | Remove only smoke phase reporting/acceptance |
| Mutable refs | Local topic branch only |
| Consumes | Remaining producer phases and contracts-update-status |
| Produces | Ordered smoke-free lifecycle events/status documents |
| Dependencies | Producer -> lifecycle observer -> shared status contract |
| Deliverables | Event/status tests and consumers agree on phase sequence |
| Acceptance | Focused CLI/status tests and full Updater gate |
| Non-goals | Add a new state machine or change publication/status persistence semantics |
| Operations deferred | Deployment and production timer execution |
| Stop/rollback conditions | Stop on invented/reordered phase or terminal-event drift |

## MODIFIED Requirements

### Requirement: Phase reporting SHALL observe but not redefine production

The producer service SHALL expose one optional synchronous observer used by the
CLI to report completion of the existing phases `preflight`, `acquisition`,
`identity`, `build`, `manifest`, and `publication`. A `phase_completed` event
SHALL appear only after that phase's existing gates have passed. The observer
SHALL not add a second state machine, reorder work, change dataVersion,
introduce a fallible gate after publication, or claim activation.

#### Scenario: Failure interrupts a phase
- **WHEN** an existing gate fails or cancellation is observed within a phase
- **THEN** that phase SHALL NOT emit `phase_completed`
- **AND** the terminal failure SHALL name the interrupted phase

#### Scenario: Publication completes
- **WHEN** the existing exclusive rename commit point succeeds
- **THEN** `publication` MAY be reported complete
- **AND** neither an event nor status document SHALL use `update_activated` or imply that `current.json` changed

### Requirement: Status observability SHALL remain development-only

The status writer SHALL use the Python standard library and existing
`jsonschema` only. Tests SHALL use injected UUID, wall-clock, monotonic clock,
observer, and filesystem fault seams so exact smoke-free events and documents
are deterministic. Apply SHALL add no timer, lock, daemon, fixed production
path, activation, exporter, deployment, remote action, or new dependency.

#### Scenario: Development acceptance runs
- **WHEN** focused cases and the full updater quality matrix execute locally
- **THEN** publication/no-change/failure/cancellation behavior, exact event ordering, schema conformance, and atomic fault behavior SHALL pass
- **AND** no network, production directory, `current.json`, or external state SHALL be touched
