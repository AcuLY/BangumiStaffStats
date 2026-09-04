## Context

`query.LoadFactSet` executes seven complete Archive reads for every operation
core. The process publishes one immutable `archive.Store`; the same subject
type therefore yields the same complete FactSet for every ranking, candidate,
person-detail, partner, and co-star request. The existing
`statistics.LoadSeriesIndex` cache establishes the local pattern for sharing a
Store-bound immutable value and coalescing concurrent loads.

## Goals / Non-Goals

**Goals:** cache exactly one successful complete FactSet for each exact Store
object and subject type, coalesce concurrent loads, keep cancellation local to
waiting callers where possible, publish no unsuccessful/partial value, and
preserve query outputs.

**Non-Goals:** no eager warmup, eviction, mutable/hot-reloaded Store support,
new API or dependency, timeout/observability change, query/statistical rule
change, external mutation, or full-gate run in this focused block.

## Change Boundary

| Field | Boundary |
|---|---|
| Status | Local specification, implementation, and focused verification |
| Owner | Backend query |
| Writable paths | `openspec/changes/backend-cache-query-fact-set/**`; `backend/internal/query/archive_loader.go`; `backend/internal/query/archive_loader_cache_test.go` |
| Read-only protected inputs | Product/design/root specs, Archive bytes, existing tests, all other packages/components, remotes/hosts/production |
| Deletion complement | Preserve every loader, fixed SQL statement, test, gate, query rule, and unrelated edit |
| Mutable refs | Exact writable local files only; no Git ref mutation |
| Consumes | Published immutable Store, exact Store object identity, subject type, caller context |
| Produces | Complete immutable process-lifetime FactSet per Store-and-subject-type key |
| Dependencies | Existing stdlib `context`/`sync`, Archive Store, query loader; no addition |
| Deliverables | Strict-valid change, source, focused tests, race/diff evidence |
| Acceptance | Reuse/coalescing, key isolation, cancellation/failure retry, no partial value, identical results |
| Non-goals | Warmup/eviction/wire/semantics/timeouts/observability/full gate/deployment |
| Operations deferred | Root-spec sync/archive, batched full gate, integration and all release/deploy states |
| Stop/rollback conditions | Stop on aliasing, poisoned/partial cache, caller-visible mutation, race/leak/result drift, test failure, or scope violation; patch only exact owned files |

Dependency direction remains `operation service -> query -> archive.Store`; the
cache is package-local and introduces no reverse or cross-component edge.

## Decisions

Use a package-local `sync.Map` keyed by `{*archive.Store, subjectType}`. The
pointer is the exact runtime Store identity; using dataVersion alone could
alias separate test or future process-local Store objects. Subject type remains
an exact key component, so no domain can reuse another domain's facts.

Each key maps to an entry containing a completion channel, one complete
FactSet, and a terminal error. The `LoadOrStore` winner performs the existing
loader once. Other callers wait for completion or their own context. This
matches the proven SeriesIndex pattern without adding `singleflight` or another
dependency.

The winner stores the FactSet only after the complete loader succeeds and the
winner context remains live. On error or cancellation it stores only the error,
removes the map entry, then releases waiters; a later caller creates a fresh
entry and retries. A canceled waiter returns its own context cause without
deleting or stopping an in-flight successful load. If the winning load itself
is canceled, all current waiters observe that failed attempt and a later call
retries.

FactSet is already the query package's immutable input snapshot. The cache
shares its complete slice-backed value under that existing contract; production
callers only read it and derive new indexes/slices. No partial field or derived
operation result is cached.

Alternatives rejected: dataVersion-only keys can alias distinct Store objects;
per-operation caches duplicate memory and ownership; deep-copying the complete
Archive universe on every hit preserves DB latency but adds large repeated CPU
and allocation cost despite the established immutable-value contract; eager
warmup broadens startup behavior and is unnecessary for this block.

Oracle comparison is preservation-only: existing query goldens and archive
loader assertions must remain unchanged. There is no intentional product delta
or new capability.

## Risks / Trade-offs

- **Process-lifetime retained memory** -> at most one value per requested
  subject type for the process's single published Store; no hot reload exists.
- **Winning caller cancellation fails a shared attempt** -> delete the entry and
  permit immediate retry; never publish a partial value.
- **Accidental caller mutation of shared slices** -> retain and test the
  existing immutable FactSet caller contract; all production consumers remain
  read-only.
- **Key leakage across Stores/types** -> exact composite-key isolation tests.
- **Concurrency regression** -> focused concurrent and race-enabled tests.

## Migration Plan

Create and strict-validate the focused change, implement the package-local
cache and focused tests, then run query tests and race validation. Root-spec
sync/archive, the complete Backend gate, commit/push/release, service restart,
and deployment remain deferred to the session batch. Rollback is a normal patch
removing only the cache wrapper/test/change files while leaving the underlying
loader intact.

Repository definitions, isolated host validation, live activation, rollback
of a live service, and legacy retirement are all outside this Backend change.

## Open Questions

None.
