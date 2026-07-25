# contracts-update-status Specification

## Purpose
TBD - created by archiving change complete-updater-development-status. Update Purpose after archive.
## Requirements
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
`preflight`, `acquisition`, `identity`, `build`, `manifest`, `smoke`,
`publication`, or `complete`.

#### Scenario: First valid attempt fails
- **WHEN** no prior status exists and a run fails during an admitted phase
- **THEN** `last_attempt` SHALL carry status `failed`, a non-null stable
  `error_code`, and the known-or-null `dataVersion`
- **AND** `last_success` SHALL be null

#### Scenario: A successful terminal record is represented
- **WHEN** an attempt terminates as `no-change` or `published`
- **THEN** its `error_code` SHALL be null
- **AND** the same complete record SHALL be valid as both `last_attempt` and
  `last_success`

### Requirement: Terminal state combinations SHALL be closed and consistent

`status` SHALL be exactly `failed`, `canceled`, `no-change`, or `published`.
`failed` SHALL require a stable uppercase error code other than `CANCELED`;
`canceled` SHALL require exact `CANCELED`; `no-change` and `published` SHALL
require null `error_code`. A non-null `last_success` SHALL allow only
`no-change` or `published`.

#### Scenario: Failure preserves an earlier success
- **WHEN** `last_attempt` is failed or canceled and a prior success exists
- **THEN** `last_success` SHALL remain a complete successful record
- **AND** the two records MAY have different time, phase, duration, and
  `dataVersion`

#### Scenario: A contradictory or expanded document is checked
- **WHEN** a document has an unknown field, invalid enum, malformed time,
  negative duration, invalid `dataVersion`, missing error, success error, or
  failed `last_success`
- **THEN** schema validation SHALL reject it

### Requirement: Indexed goldens SHALL prove producer and consumer agreement

`contracts/goldens/update-status/index.json` SHALL enumerate the exact case
inventory and expected result under the golden-index schema. Cases SHALL cover
first failure, cancellation with retained success, no-change, publication, and
invalid mutations. The Contracts verifier SHALL read only contained regular
non-symlink indexed files, reject missing/extra cases, compile both schemas,
and produce deterministic zero-network results.

#### Scenario: The closed golden bundle is verified
- **WHEN** the verifier runs from a clean checkout
- **THEN** every positive and negative expectation SHALL match
- **AND** no schema, golden, cache, temporary file, or lockfile byte SHALL be
  modified
- **AND** `.cache/`, `.tmp/`, and `tooling/node_modules/` SHALL be absent at
  handoff

#### Scenario: The bundle drifts
- **WHEN** an indexed file is missing, extra, linked, malformed, or produces a
  result different from its declaration
- **THEN** verification SHALL fail closed
