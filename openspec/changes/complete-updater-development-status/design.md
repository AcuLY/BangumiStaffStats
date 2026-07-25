## Context

`producer.service.produce` already has one irreversible commit point: exclusive
rename of a fully validated candidate into `versions/<dataVersion>`. It returns
`published` or `no-change` and raises bounded `ProducerError` values, while
`cli.py` currently collapses each result to one final document. There is no
shared status schema, phase observer, or persistent attempt/success snapshot.

This is a development observability change, not an operations change. It does
not select a production directory, coordinate concurrent writers, activate
`current.json`, or add `update_activated`. The immutable prototype oracle is
unaffected because this is `NEW_CAPABILITY` below the updater boundary.

## Change Boundary

| Field | Declaration |
|---|---|
| Status | Investigated/specified: complete after strict validation and main-agent review. Implemented/verified/committed/pushed/released/deployed: no. |
| Owner | Contracts owner for schema/goldens; Updater owner for events/writer/tests. |
| Writable paths | Contracts apply owner: `contracts/schemas/update-status/{.gitignore,update-status-v1.schema.json,golden-index.schema.json}`, `contracts/schemas/update-status/tooling/{verify.mjs,package.json,package-lock.json}`, `contracts/goldens/update-status/index.json`, `contracts/goldens/update-status/cases/{first-failure.json,canceled.json,no-change.json,published.json,invalid.json}`. Updater apply owner: `updater/src/bangumi_staff_stats_updater/{cli.py,update_status.py}`, `updater/src/bangumi_staff_stats_updater/producer/service.py`, `updater/tests/{test_cli.py,test_update_status.py}`, `updater/tests/producer/test_service.py`. Neither apply owner edits shared task markers or stages files; the main agent alone updates markers after unstaged handoff/acceptance. |
| Read-only protected inputs | PRODUCT/DESIGN/oracle; master plan and development/operations guides; existing Archive/catalog/query contracts and goldens; non-listed updater paths; backend/frontend; other changes/specs; external repositories, refs/remotes, services, hosts, and production state. |
| Deletion complement | None. |
| Mutable refs | None. |
| Consumes | Existing producer terminal outcomes/cancellation/error codes; guide section 13.3; existing `jsonschema` and standard library. |
| Produces | Two path-disjoint capability blocks: closed contract bundle, then a contract-consuming event/status implementation. |
| Dependencies | `establish-formal-rewrite-baseline` → `bootstrap-updater-runtime` → `produce-immutable-archive`; `implement-backend-http-and-observability` supplies the future exporter boundary; within this change `contracts-update-status` → `updater-development-status`. |
| Deliverables | Closed schema/goldens/verifier and local three-entry `.gitignore`; event serializer; phase observer; atomic status module; CLI wiring; deterministic terminal/fault tests. |
| Acceptance | Contract verifier and strict schema cases; focused updater tests; full pytest/mypy/Ruff/format/wheel/entry-point gates; no residue; strict OpenSpec and Git checks. |
| Non-goals | New producer algorithm, second state machine, history, retry, exporter/metric, new dependency, activation, scheduling, fixed production paths, remote/external change. |
| Operations deferred | `current.json`, `update_activated`, timer, `flock`, systemd, production ownership/modes/directories, deployment, restart/readiness loop, scrape/retention/alerts, and rollback activation. |
| Stop/rollback conditions | Stop before a non-listed write, schema-whitelist expansion, dependency addition, fixed host assumption, activation claim, or change to the Archive commit point. Rejected apply is rolled back only inside owned paths; prior status bytes and any already published inactive Archive are preserved. |

## Goals / Non-Goals

**Goals:**

- Make updater outcomes machine-readable as a bounded event stream.
- Persist only the latest attempt and success under one shared contract.
- Observe existing producer phases without changing their semantics.
- Make every success/failure/cancellation and filesystem fault deterministic in
  tests.

**Non-Goals:**

- Operational concurrency control, scheduling, activation, deployment, or
  production directory policy.
- Historical event storage or replay.
- Go exporter implementation.

## Decisions

### 1. One closed status document, not an append-only log

The root has only `last_attempt` and `last_success`; each has the six fields
named by the development guide. A successful attempt becomes both records.
Failure/cancellation replaces only the attempt and retains the prior success.
The schema itself constrains terminal/error combinations.

Alternative considered: retain a run array or JSON Lines history. Rejected
because the guide explicitly forbids history and operations owns retention.

### 2. Caller-selected exact status filename

`produce` gains required `--status-file` pointing to an absolute file named
`update-status.json`; the caller owns its parent directory. This permits local
development acceptance without embedding a future production path. Existing
status is strictly validated before any download/build work so invalid or
unsafe state is never overwritten.

Alternative considered: derive the file below `output_root`. Rejected because
that would prematurely define production layout and couple status observation
to Archive publication.

### 3. Same-directory replace is the status commit point

The writer creates an owner-unique regular temp file beside the target, writes
canonical compact JSON plus one LF, flushes/fsyncs, uses `os.replace`, then
fsyncs the directory. Pre-replace faults preserve the prior target exactly and
remove only the owned temp. A target symlink, special file, non-canonical
parent, oversized input, or invalid document is rejected.

Status persistence is intentionally separate from Archive publication. If
status persistence fails after an inactive Archive has already been published,
the Archive is retained, the CLI emits sanitized `update_failed` for the status
failure, and returns non-zero; it never deletes immutable data or claims
activation. This rare partial observability outcome is testable and must be
handled later by operations rather than concealed.

Alternative considered: make the status write part of Archive rename. Rejected
because two files in distinct roots cannot share one portable atomic commit.

### 4. A synchronous observer reports completed existing phases

`produce` accepts an optional observer and emits completion data after existing
phase gates. The observer is not a workflow engine and cannot direct the
producer. The CLI tracks the active phase for terminal failure status. Exact
phases are `preflight`, `acquisition`, `identity`, `build`, `manifest`, `smoke`,
and `publication`; terminal status may use `complete`.

Alternative considered: infer phases from log messages. Rejected because
string parsing is unstable and would encourage unstructured logging.

### 5. Persist before emitting the terminal event

For a terminal producer outcome, the CLI first atomically commits the next
status and then emits exactly one matching terminal event. Thus
`update_no_change` and `update_published` imply durable status. A status commit
failure instead yields `update_failed` with a stable status error.

Nonterminal events go to stdout; the terminal success event also goes to
stdout. `update_failed` goes to stderr. Existing `doctor`,
`contract-check`, parser, and version behavior remain unchanged; only valid
`produce` invocations use the lifecycle stream.

### 6. No new library is admitted

JSON Schema validation uses existing `jsonschema`; serialization, UUID/time,
secure file inspection, temp creation, flushing, replacement, and directory
sync use the standard library. Therefore there is no bundle/runtime/supply
chain cost or dependency rollback.

## Risks / Trade-offs

- [Status write can fail after inactive publication] → Preserve the immutable
  Archive, return a stable non-zero status failure, emit no false
  `update_published`, and cover the outcome with fault injection.
- [Phase callbacks accidentally alter producer behavior] → Make the observer
  synchronous, return-value-free, optional, and test identical result identity
  with and without it.
- [Events grow or leak data] → Closed serializer keys, bounded counters/quality
  summaries, no raw exception/message/path/body fields, and exact-output tests.
- [Two processes race on one status file] → One writer per path remains a
  development caller precondition; `flock` is explicitly deferred.
- [Directory fsync portability differs] → Test supported development platforms;
  fail closed with a stable status code rather than silently weakening atomic
  durability.

## Migration Plan

1. Contracts owner implements and verifies the closed schema/goldens.
2. Updater owner may build against the approved schema shape in parallel, but
   final acceptance waits for the exact Contracts bytes.
3. Run focused contract/updater tests and full updater gates in a clean local
   environment.
4. Main agent reviews the combined diff; no remote, release, deployment, or
   activation follows from acceptance.

Rollback before commit removes only owned new files and reverts listed updater
hunks. After a local status file has been written during tests, tests delete
only their temporary directory. No Archive or user production file is used.

## Open Questions

None. Production path, locking, ownership/modes, exporter retention, and
activation events are deliberately deferred to a later operations OpenSpec.
