## Why

Complete-Archive personal rankings and person detail each spend about 16–18
seconds rebuilding the same immutable series index. The index is bound to the
single process Store/dataVersion and can be safely shared instead of rescanned
for every operation result key.

## What Changes

- Cache one immutable `SeriesIndex` per Archive Store and coalesce concurrent
  loads; failures/cancellation are not cached.
- Start a non-blocking read-only warmup after Store publication so readiness
  remains immediate and the first user query can reuse completed/in-flight work.
- Preserve every statistical rule, result cache key, API response, request
  deadline, Archive admission removal, and shutdown behavior.
- Add focused cache/concurrency/cancellation tests and real complete-Archive
  timing evidence only; defer the full Backend gate to the session batch.

Externally visible behavior is `PRESERVE_ORACLE` against
`644b7748674e553f863d0ffd61d029f86fdc0717`; only latency changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `backend-statistics-authority`: share the immutable series index across
  operation services for the lifetime of one Store, with non-blocking warmup.

## Impact

- **Status:** local specification/implementation/focused verification only.
- **Owner:** Backend statistics; app only invokes warmup after publication.
- **Writable paths:** `openspec/changes/backend-cache-series-index/**`,
  `backend/internal/statistics/source.go`,
  `backend/internal/statistics/source_test.go`, `backend/internal/app/run.go`,
  `backend/internal/app/run_test.go`, and the exact root spec at later sync.
- **Read-only protected inputs:** Archive/store/query/statistical contracts,
  frontend/updater/operations, local Archive bytes, original worktree, remotes,
  hosts, and production.
- **Deletion complement:** remove no query, formula, gate, test, or unrelated
  work; no Archive validation/admission path is restored.
- **Mutable refs:** current local topic worktree only.
- **Consumes:** published immutable Store, `archive_meta.dataVersion`, current
  `LoadSeriesIndex` callers and process context.
- **Produces:** one shared immutable series index per Store and focused timing
  evidence.
- **Dependencies:** accepted statistics/query runtime and direct-open Store.
- **Deliverables:** cache/warmup implementation, focused tests, local benchmark,
  strict change validation, diff check.
- **Acceptance:** one successful build per Store under sequential/concurrent
  calls; cancellation/failure retry; readiness unchanged; later personal
  operations avoid the repeated ~16-second SQLite scan.
- **Non-goals:** caching FactSet/people, changing formulas/wire/timeouts,
  blocking startup, dependencies, admission, deployment, or broad tuning.
- **Operations deferred:** complete gate, commit/push/PR/release/deploy and host
  mutation remain batched/deferred.
- **Stop/rollback conditions:** stop on identity leakage, mutable result,
  readiness delay, goroutine/race/shutdown issue, or focused test/timing failure;
  restore exact files and keep the native runtime/image proxy configuration.

Apply is blocked until proposal/design/spec/tasks are strict-valid and reviewed.
