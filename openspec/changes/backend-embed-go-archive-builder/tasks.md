## Task Boundary

| Field | Boundary |
|---|---|
| Status | Local specification/implementation/focused verification; no commit/push/release/deploy inference |
| Owner | Primary agent coordinates; Backend builder, Backend runtime, Contracts/Operations each have one non-overlapping implementation owner |
| Writable paths | Exact paths declared in proposal; root specs only during final sync/archive |
| Read-only protected inputs | Product/design/public API/statistics/query semantics, real Archive data, unrelated worktrees, remotes, hosts, production, routing, legacy |
| Deletion complement | Only Python updater, updater-only artifacts/status fixtures, update/data rollback wrappers, and Archive systemd units after Go parity |
| Mutable refs | `codex/embed-go-archive-builder` only |
| Consumes | Existing contracts/goldens/schema/config, current Store/dataVersion caches, modernc SQLite, official input shapes |
| Produces | Go builder/scheduler/hot swap, one Backend artifact, reduced Operations topology, reconciled specs/docs |
| Dependencies | Parent `411f54b`, strict-valid planning, Go toolchain, existing fixture authority |
| Deliverables | Focused vertical tests, accumulated full affected gates, strict OpenSpec, exact diff/lifecycle report |
| Acceptance | Contract-equivalent Go build, A-to-B live swap, old cleanup, no Python/systemd production dependency, unchanged query behavior |
| Non-goals | ORM, distributed scheduling, authenticated collection, public/UI/statistics changes, unrelated cleanup |
| Operations deferred | Real Archive run, host writes, push/merge/release/deploy/live deletion/routing/legacy retirement |
| Stop/rollback conditions | Stop on authority, schema/dataVersion/catalog/quality/query drift, unbounded memory, unsafe deletion, overlap, or failed parity; rollback parent `411f54b` |

Forbidden: `git reset --hard`, checkout rollback, `git clean`, `git add -A`,
broad deletion, writes outside declared paths, and any external mutation.

## 1. Planning and authority — owner: primary agent

- [x] 1.1 Preflight dedicated worktree/branch at `411f54b`, prove only this
  change is dirty, review all planning artifacts, and stop on overlap.
- [x] 1.2 Run strict OpenSpec validation and complete a zero-P0/P1 review with
  no ORM, distributed lock, queue, lease, or unrelated capability.
- [x] 1.3 Reconcile `AGENTS.md`, `openspec/config.yaml`, formal master plan, and
  Backend/data/Operations guides from Python producer/systemd ownership to the
  approved embedded Go boundary before implementation.

## 2. Go Archive builder — owner: Backend builder

- [x] 2.1 Preflight only `backend/internal/archivebuild/**`, embedded producer
  inputs, and Backend module files; copy/check canonical schema and governed
  catalog bytes and promote the already locked YAML module to direct use.
- [x] 2.2 Implement bounded official latest/release/common acquisition, digest
  checks, exact ZIP inventory, safe streaming extraction, cancellation, and
  deterministic errors using Go standard packages.
- [x] 2.3 Implement strict streaming JSONLines normalization/accounting and all
  20 SQLite tables plus indexes from the canonical schema without ORM.
- [x] 2.4 Implement common/display/staff-set compilation, exact staff/cast
  derivation, quality classification, and deterministic duplicate/reference
  behavior equivalent to existing goldens.
- [x] 2.5 Implement dataVersion/manifest finalization, necessary one-time SQLite
  checks, same-root staging, inactive atomic publication, no-change, and owned
  staging cleanup without smoke or duplicate admission.
- [x] 2.6 Add acquisition, producer golden, catalog derivation, invalid-input,
  no-change, cancellation, and offline end-to-end tests; run only this focused
  Go package gate while developing.

## 3. Store replacement and embedded schedule — owner: Backend runtime

- [x] 3.1 Preflight only Backend archive/app/runtime/observability paths and
  verify StoreProvider/dataVersion cache assumptions remain unchanged.
- [x] 3.2 Replace full startup admission with minimal contained immutable/read-
  only open and add narrow `State.Replace` ownership/rollback/close behavior.
- [x] 3.3 Add one app-level RW maintenance gate around complete HTTP requests;
  activation waits for existing request and bounded detached executor work,
  then swaps Store/pointer/readiness without listener restart.
- [x] 3.4 Add one startup freshness check plus fixed UTC+8 Sunday 04:15
  `time.Timer` loop, serial six-hour runs, cancellation, and no persistent job
  system.
- [x] 3.5 Replace status-file reading with bounded in-process update events,
  state, and low-cardinality metrics.
- [x] 3.6 Add focused State, gate, scheduler, failure preservation, and fixture
  A-to-B live query integration tests.

## 4. Single-component artifact and runtime — owner: Contracts/Operations

- [x] 4.1 Preflight exact artifact/Operations/workflow paths and verify no
  concurrent owner overlaps before editing.
- [x] 4.2 Embed/check producer inputs in the Backend artifact and change release
  identity/coordinator/build metadata from Backend+Updater+Frontend to
  Backend+Frontend.
- [x] 4.3 Remove updater service/image/env/tool/status inputs from Compose,
  bundles, deploy/rollback/check/isolated validation, alerts, and CI; mount only
  the Archive data path writable into the otherwise read-only API container.
- [x] 4.4 After focused Go parity passes, delete Python `updater/**`, updater-
  only fixtures/status contracts, update/data-rollback commands, and Archive
  systemd service/timer; preserve historical archived changes and language-
  neutral Archive/catalog contracts.
- [x] 4.5 Run focused artifact schema/coordinator and Operations static/runtime
  tests proving no remaining deployed Python updater/systemd dependency.

## 5. Integrated acceptance and lifecycle — owner: primary agent

- [x] 5.1 Audit the combined diff against the 19 delta specs and run focused
  Backend builder/runtime, contract artifact, and Operations tests plus
  `git diff --check` and strict OpenSpec validation.
- [ ] 5.2 After accumulated work is ready for unified monitoring, run the full
  Backend/Contracts/Operations gates and one complete Archive build/read/query
  acceptance; do not repeat that heavy build for intermediate fixes.
- [ ] 5.3 Reconcile documentation, sync accepted specs, archive the change only
  after all affected gates pass, and report committed/pushed/released/deployed
  states separately. No external action is authorized here.
