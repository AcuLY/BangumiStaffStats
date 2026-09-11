## Capability Boundary

| Field | Boundary |
|---|---|
| Status | Modified closed phase enum |
| Owner | Contracts |
| Writable paths | Update-status schema/tooling/goldens, Python/Go consumers in declared paths, this delta and lifecycle root spec |
| Read-only protected inputs | Other contracts, status field/status/error semantics and external state |
| Deletion complement | Remove only the `smoke` phase value and replace smoke-based negative fixture baselines |
| Mutable refs | Local topic branch only |
| Consumes | Existing update-status v1 document shape |
| Produces | Smoke-free v1 phase enum and deterministic indexed goldens |
| Dependencies | Contracts -> Updater writer and Backend observability reader |
| Deliverables | Schema, goldens/index, verifier and both language consumers agree |
| Acceptance | Contracts verifier plus focused Python/Go status tests |
| Non-goals | Change schema version, fields, terminal statuses or error relationships |
| Operations deferred | Rollout of new status producer/consumer |
| Stop/rollback conditions | Stop on producer/consumer/schema/golden disagreement |

## MODIFIED Requirements

### Requirement: The status document SHALL contain one closed terminal snapshot

`contracts/schemas/update-status/update-status-v1.schema.json` SHALL be the
sole cross-language authority for `update-status.json`. The root SHALL contain
exactly `last_attempt` and `last_success`: `last_attempt` SHALL be one terminal
record and `last_success` SHALL be either the most recent successful terminal
record or JSON null. Each record SHALL contain exactly `time`, `status`,
`phase`, `duration_seconds`, `dataVersion`, and `error_code`, with no history,
raw exception, path, source body, secret, or entity data.

`time` SHALL use the exact calendar-valid UTC
`YYYY-MM-DDTHH:mm:ss[.1..6]Z` subset. `duration_seconds` SHALL be a finite
non-negative JSON number. `dataVersion` SHALL be JSON null until known or an
exact `dv1-` plus 64 lowercase hexadecimal identity. `phase` SHALL be one of
`preflight`, `acquisition`, `identity`, `build`, `manifest`, `publication`, or
`complete`.

#### Scenario: First valid attempt fails
- **WHEN** no prior status exists and a run fails during an admitted phase
- **THEN** `last_attempt` SHALL carry status `failed`, a non-null stable `error_code`, and the known-or-null `dataVersion`
- **AND** `last_success` SHALL be null

#### Scenario: A successful terminal record is represented
- **WHEN** an attempt terminates as `no-change` or `published`
- **THEN** its `error_code` SHALL be null
- **AND** the same complete record SHALL be valid as both `last_attempt` and `last_success`

### Requirement: Indexed goldens SHALL prove producer and consumer agreement

`contracts/goldens/update-status/index.json` SHALL enumerate the exact case
inventory and expected result under the golden-index schema. Cases SHALL cover
first failure, cancellation with retained success, no-change, publication, and
invalid mutations, including rejection of the removed `smoke` phase. The
Contracts verifier SHALL read only contained regular non-symlink indexed files,
reject missing/extra cases, compile both schemas, and produce deterministic
zero-network results.

#### Scenario: The closed golden bundle is verified
- **WHEN** the verifier runs from a clean checkout
- **THEN** every positive and negative expectation SHALL match
- **AND** no schema, golden, cache, temporary file, or lockfile byte SHALL be modified
- **AND** `.cache/`, `.tmp/`, and `tooling/node_modules/` SHALL be absent at handoff

#### Scenario: The bundle drifts
- **WHEN** an indexed file is missing, extra, linked, malformed, or produces a result different from its declaration
- **THEN** verification SHALL fail closed
