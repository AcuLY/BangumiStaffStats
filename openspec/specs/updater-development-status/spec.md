# updater-development-status Specification

## Purpose
Define development updater observability through one stable lifecycle event stream and an atomically persisted closed terminal-status document without changing producer state, execution order, publication semantics, or dependencies.
## Requirements
### Requirement: Produce SHALL emit one stable lifecycle stream

For a syntactically valid `produce` invocation, the CLI SHALL replace the
legacy single `ARCHIVE_READY` document with newline-delimited compact JSON
events. It SHALL emit exactly one `updater_started`, zero or more
`phase_completed`, and exactly one terminal `update_no_change`,
`update_published`, or `update_failed`. All events in a run SHALL carry one
canonical UUID `run_id`.

The only permitted event fields SHALL be `event`, `run_id`, `source_release`,
`source_digest`, `phase`, `duration_seconds`, `input_rows`, `output_rows`,
`quality_summary`, `dataVersion`, and `error_code`. Fields unavailable at an
event boundary SHALL be omitted rather than guessed. Durations SHALL be
finite/non-negative seconds; counters SHALL be non-negative integers; quality
summary SHALL contain only stable uppercase quality codes with non-negative
integer counts. No event SHALL contain a raw exception, body, URL, local path,
secret, UID, collection/entity data, or unbounded message.

#### Scenario: A new inactive Archive is published
- **WHEN** all existing producer gates and atomic inactive publication succeed
- **THEN** stdout SHALL contain `updater_started`, completed phases in actual
  execution order, and one final `update_published`
- **AND** the terminal event SHALL identify the published `dataVersion`

#### Scenario: The same valid version already exists
- **WHEN** the existing producer returns `no-change`
- **THEN** stdout SHALL end with one `update_no_change`
- **AND** no publication phase SHALL be invented

#### Scenario: A producer failure or cancellation occurs
- **WHEN** a valid invocation raises a stable producer error or receives
  cancellation before its commit point
- **THEN** stderr SHALL receive exactly one terminal `update_failed` with the
  active phase and stable `error_code`
- **AND** cancellation SHALL retain `CANCELED` and exit status 130 while other
  producer failures SHALL retain their established non-zero class

### Requirement: Phase reporting SHALL observe but not redefine production

The producer service SHALL expose one optional synchronous observer used by the
CLI to report completion of the existing phases `preflight`, `acquisition`,
`identity`, `build`, `manifest`, `smoke`, and `publication`. A
`phase_completed` event SHALL appear only after that phase's existing gates
have passed. The observer SHALL not add a second state machine, reorder work,
change dataVersion, introduce a fallible gate after publication, or claim
activation.

#### Scenario: Failure interrupts a phase
- **WHEN** an existing gate fails or cancellation is observed within a phase
- **THEN** that phase SHALL NOT emit `phase_completed`
- **AND** the terminal failure SHALL name the interrupted phase

#### Scenario: Publication completes
- **WHEN** the existing exclusive rename commit point succeeds
- **THEN** `publication` MAY be reported complete
- **AND** neither an event nor status document SHALL use `update_activated` or
  imply that `current.json` changed

### Requirement: Terminal status SHALL be atomically persisted

`produce` SHALL require a caller-selected absolute `--status-file` whose
basename is exactly `update-status.json` and whose parent is an existing
canonical non-symlink directory. Before production starts, an existing target
SHALL be a bounded regular non-symlink document valid under
`contracts-update-status`; absence SHALL be allowed. The updater SHALL build
the next document from terminal state, write one owner-unique same-directory
temporary regular file, flush and sync it, atomically replace the target, sync
the parent directory, and remove only its own temporary file on failure.

Every terminal run SHALL replace `last_attempt`. `published` and `no-change`
SHALL also replace `last_success` with the same record. `failed` and
`canceled` SHALL preserve the prior `last_success` exactly or keep it null.
The durable status update SHALL precede its terminal event.

#### Scenario: The first run fails or is canceled
- **WHEN** a valid produce invocation has no prior status and terminates before
  success
- **THEN** the atomic document SHALL contain that failed/canceled
  `last_attempt` and null `last_success`

#### Scenario: Failure follows success
- **WHEN** a failed or canceled run follows a valid successful status
- **THEN** only `last_attempt` SHALL change
- **AND** the previous `last_success` value SHALL remain semantically and
  byte-for-byte equivalent after JSON decoding

#### Scenario: A no-change or published run succeeds
- **WHEN** production terminates as no-change or published
- **THEN** `last_attempt` and `last_success` SHALL be identical successful
  records
- **AND** the terminal event SHALL be emitted only after the replacement is
  durable

#### Scenario: Status input or a pre-replace operation is unsafe
- **WHEN** the path is relative, has the wrong basename, escapes through a
  symlink, names a special file, contains invalid prior state, or an injected
  write, flush, file-fsync, or replace fault occurs before the atomic replace
- **THEN** the invocation SHALL fail with a stable sanitized status error
- **AND** prior status bytes SHALL remain unchanged and no owned temporary file
  SHALL remain

#### Scenario: Parent-directory sync fails after replacement
- **WHEN** the atomic replace succeeds but the following parent-directory
  fsync fails
- **THEN** the invocation SHALL report stable `STATUS_WRITE_FAILED`
- **AND** the replacement bytes MAY already be visible, the writer SHALL NOT
  restore the old bytes or claim confirmed durability, and no owned temporary
  file SHALL remain

### Requirement: Status observability SHALL remain development-only

The status writer SHALL use the Python standard library and existing
`jsonschema` only. Tests SHALL use injected UUID, wall-clock, monotonic clock,
observer, and filesystem fault seams so exact events and documents are
deterministic. Apply SHALL add no timer, lock, daemon, fixed production path,
activation, exporter, deployment, remote action, or new dependency.

#### Scenario: Development acceptance runs
- **WHEN** focused cases and the full updater quality matrix execute locally
- **THEN** publication/no-change/failure/cancellation behavior, exact event
  ordering, schema conformance, and atomic fault behavior SHALL pass
- **AND** no network, production directory, `current.json`, or external state
  SHALL be touched
