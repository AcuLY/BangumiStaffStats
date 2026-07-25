## Why

The immutable Archive producer can already terminate as published, no-change,
failed, or canceled, but it exposes only one final CLI document. Development
cannot yet verify the stable updater event stream or the atomic
`update-status.json` state that the Go exporter will later consume.

## What Changes

- Define a closed JSON Schema and positive/negative goldens for
  `update-status.json`, containing only the last attempt and last success.
- **BREAKING** Replace the `produce` subcommand's single terminal
  `ARCHIVE_READY` document with stable one-line JSON events for
  `updater_started`, `phase_completed`, `update_no_change`,
  `update_published`, and `update_failed`.
- Add a caller-selected, atomic status writer and terminal behavior for
  published, no-change, failed, and canceled runs.
- Add deterministic fault and cancellation tests without scheduling,
  activation, deployment, or production-directory assumptions.

## Capabilities

### New Capabilities

- `contracts-update-status`: closed shared `update-status.json` schema and
  language-neutral golden vectors.
- `updater-development-status`: one-shot lifecycle events and atomic terminal
  status persistence for the existing immutable Archive producer.

### Modified Capabilities

None.

## Impact

| Field | Declaration |
|---|---|
| Status | Investigated: complete. Specified: complete when all four artifacts are strict-valid. Implemented/verified/committed: no. Pushed/released/deployed: no. Apply remains blocked until strict validation and main-agent review. |
| Behavior classification | `NEW_CAPABILITY` under `tmp-formal-development/backend-development-implementation-guide.md` section 13.3. No frontend or oracle-visible behavior changes; oracle commit `644b7748674e553f863d0ffd61d029f86fdc0717` remains untouched. |
| Owner | Contracts owner for `contracts-update-status`; Updater owner for `updater-development-status`. The two owners may apply their path-disjoint blocks in parallel after review. |
| Writable paths | Contracts apply owner: `contracts/schemas/update-status/{.gitignore,update-status-v1.schema.json,golden-index.schema.json}`, `contracts/schemas/update-status/tooling/{verify.mjs,package.json,package-lock.json}`, `contracts/goldens/update-status/index.json`, `contracts/goldens/update-status/cases/{first-failure.json,canceled.json,no-change.json,published.json,invalid.json}`. Updater apply owner: `updater/src/bangumi_staff_stats_updater/{cli.py,update_status.py}`, `updater/src/bangumi_staff_stats_updater/producer/service.py`, `updater/tests/{test_cli.py,test_update_status.py}`, `updater/tests/producer/test_service.py`. Apply owners do not edit `tasks.md` or stage files; after each unstaged handoff the main agent alone may update this change's task markers during acceptance. |
| Read-only protected inputs | `PRODUCT.md`, `DESIGN.md`, oracle commit `644b7748674e553f863d0ffd61d029f86fdc0717`, `tmp-formal-development/{formal-development-master-plan.md,backend-development-implementation-guide.md,backend-operations-implementation-guide.md}`, existing root OpenSpec specs and archived changes, all non-listed `contracts/**` and `updater/**`, all `backend/**`, `frontend/**`, external repositories, remotes, host/service state, and production data. |
| Deletion complement | None. No pre-existing file may be deleted, moved, or broadly reformatted. |
| Mutable refs | None. Apply may not create, move, push, tag, or delete any Git ref. |
| Consumes | Accepted `produce-immutable-archive` terminal outcomes and stable `ProducerError.code`; the one-shot CLI exit contract; development observability authority in backend guide section 13.3. |
| Produces | Closed status schema/goldens, a schema verifier, five stable JSON event types, and an atomic caller-selected status file containing only last-attempt/last-success terminal state. |
| Dependencies | `establish-formal-rewrite-baseline`, `bootstrap-updater-runtime`, `produce-immutable-archive`, and `implement-backend-http-and-observability`. |
| Deliverables | Contracts schema/index/cases/verifier plus a local `.gitignore` limited to `.cache/`, `.tmp/`, and `tooling/node_modules/`; updater event serializer, phase reporting hook, status reader/writer, CLI wiring; published/no-change/failure/cancellation/fault tests. |
| Acceptance | Contract positive and negative cases pass strict validation; updater tests prove exact event order/whitelist, exit codes, status transitions, prior-success retention, atomic replacement, byte preservation on pre-commit failure, and no activation claim; full updater pytest/mypy/Ruff/build gates, strict OpenSpec validation, and `git diff --check` pass. |
| Non-goals | Changing Archive identity/content/publication semantics; adding a daemon, scheduler, lock, retry policy, history store, exporter, backend metric, frontend behavior, or new dependency. |
| Operations deferred | Fixed production paths, `current.json` switching, `update_activated`, timer, `flock`, systemd, nginx, production Compose, secrets, retention, alerting, deployment, release, migration, restart, readiness polling, and rollback activation remain deferred. |
| Stop/rollback conditions | Stop before mutation if an owner needs a non-listed path, new dependency, external/remote state, production path, activation behavior, or incompatible producer change. On apply rejection, discard only this change's uncommitted writable-path edits. Atomic status-write failure must preserve the prior file byte-for-byte; an already published inactive Archive is never deleted or relabeled as activated. |
| External state | No other repository or external state is read or mutated by apply. Push, tag, release, deploy, host mutation, and production activation require separate later authorization. |
