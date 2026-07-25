## Context

`runtimecache` already provides correct weighted LRU, detached singleflight,
collection freshness, and executor primitives. Each of the five service
constructors currently instantiates those defaults independently, however, and
`app.serveRuntime` invokes all five constructors. The resulting process can own
five 190 MiB result caches, five collection/negative caches, and five separate
two-running/eight-queued admission gates.

The Backend guide section 5.2 and the accepted
`backend-bounded-query-cache` capability describe process budgets, not
per-operation reservations. Public collection admission is still blocked on an
external immutable tag, but cache ownership does not need that adapter: the
provider remains a separate injected dependency and may be nil.

| Boundary | Declaration |
|---|---|
| Status | strict-valid, main-agent approved, implemented, and verified; commit pending |
| Owner | One Backend implementation agent; main agent reviews the specification and accepts the candidate. |
| Writable paths | `backend/internal/runtimecache/result.go`, `backend/internal/runtimecache/result_test.go`, new `backend/internal/runtimecache/runtime.go`, new `backend/internal/runtimecache/runtime_test.go`, `backend/internal/ranking/{service.go,service_test.go}`, `backend/internal/{candidates,persondetail,partners,costar}/{cache.go,service.go,service_test.go}`, `backend/internal/app/{run.go,run_test.go}`, `backend/internal/architecture/dependencies_test.go`, `backend/README.md`, and this change's task markers |
| Read-only protected inputs | `runtimecache` collection/LRU/executor/detached/error files and tests; every other Backend file; Contracts, Updater, Frontend, oracle/guides, sibling changes, refs/remotes, external repositories/services/hosts |
| Deletion complement | All repository paths outside the writable list; no listed existing file may be deleted |
| Mutable refs | None |
| Consumes | Existing cache primitives and the five production service implementations |
| Produces | One process resource owner, a pooled heterogeneous typed result LRU, compatible isolated service construction, and shared production assembly |
| Dependencies | Accepted cache/query implementations. Dependency direction is `app -> five query services -> runtimecache`; `runtimecache` imports no service, transport, provider, or app package. |
| Deliverables | Runtime owner, pooled result cache, service/app wiring, aggregate stats, focused sharing/budget/concurrency tests, README correction |
| Acceptance | Focused/repeated/race tests, app assembly proof, full `go test ./...`, `go test -race ./internal/runtimecache ./internal/app ./internal/ranking ./internal/candidates ./internal/persondetail ./internal/partners ./internal/costar`, `go vet ./...`, build/check scripts, strict OpenSpec, diff hygiene |
| Non-goals | Public-client module/tag/adapter, API/statistical changes, HTTP metrics exposure, Redis/persistence/SWR, frontend work |
| Operations deferred | Resource tuning in deployment, production monitoring/load tests, service configuration, release, deploy, cutover, activation |
| Stop/rollback conditions | Stop on owner overlap, protected-path drift, type-unsafe pooled reads, inability to prove exact global bounds, or any need for the unpublished collection module. Revert only unstaged writable-path edits; do not clean/reset unrelated state. |

No new library is required. Oracle comparison is limited to proving that no
Frontend path or API-visible response semantics change; the immutable oracle
commit remains untouched.

## Goals / Non-Goals

**Goals:**

- Own exactly one collection cache, negative cache, executor, and result pool
  per API process.
- Preserve the existing typed `ResultStore[V]` boundary and clone/cost
  guarantees while applying one LRU across heterogeneous result core types.
- Preserve existing package-level unit-test construction without forcing every
  focused test to assemble the full application.
- Expose one authoritative aggregate resource snapshot for later
  observability wiring.

**Non-Goals:**

- Change collection provider behavior, endpoint output, result keys, cost
  functions, freshness, timeout, or cancellation semantics.
- Add per-operation memory quotas or operational configuration.
- Implement or admit the external collection client.

## Decisions

### 1. Introduce one explicit query-runtime owner

Add a `runtimecache` owner constructed from the existing executor, collection,
and result configurations. It constructs exactly one `Executor`, one
`CollectionCache` (which already owns both positive and negative stores), and
one shared result pool. `app.serveRuntime` constructs this owner once and passes
the same pointer to all five services.

The owner does not contain a collection provider or Archive store. Those remain
service dependencies, so later client admission only replaces the nil provider
argument. `internal/app` is the composition root and therefore imports
`runtimecache` directly to construct this process owner; the architecture
allowlist admits exactly that edge. Routing construction through ranking or
another domain service was rejected because it gives one operation ownership
of all other operations' process resources.

Alternative rejected: a package global singleton. It would hide lifecycle and
make isolated/race tests order-dependent.

### 2. Use one heterogeneous result LRU behind typed stores

The shared pool uses the existing `WeightedLRU` with `ResultKey` and a private
entry envelope containing a retained value plus its ownership-safe clone
function/type identity. Before the runtime is exposed, app construction
supplies one opaque canonical result binding from each of the five domain
packages. Each binding fixes operation, value type, clone function, and cost
function, and constructs one typed same-key detached group per runtime.
`ResultStore[V]` remains the typed facade and can consume only a
pre-registered binding whose operation and `V` match; it cannot supply or
replace clone/cost policy or create an independent same-operation load group at
facade construction. An absent, duplicate, or mismatched binding fails
construction before any cache access, never panics, and never cross-casts a
result.

Because `ResultKey` contains the versioned operation, one global LRU can hold
all five types without collisions. Eviction order and the 190 MiB/512 counters
are global across operations. The 32 MiB per-item check remains global and
unchanged. There are no five static shares: a 32 MiB valid core can use
available process capacity regardless of operation, and colder entries from
other operations are evicted by the same LRU.

Alternative rejected: divide 190 MiB and 512 entries among five typed LRUs.
That creates arbitrary per-operation starvation, ceases to be one LRU, and
makes future operation additions change existing quotas.

Alternative rejected: serialize cores into bytes. It would add conversion
cost, weaken compile-time ownership, and risk changing retained-cost semantics.

### 3. Preserve isolated constructors, require shared construction in app

Each package keeps the current `NewService(stores, provider, Config)` shape as
an explicit isolated convenience for focused tests. It constructs one local
runtime owner and delegates to a new shared-runtime constructor. The production
app must use the shared-runtime constructor; tests assert that all five
services receive the same owner.

Existing feature cache constructors used by cache-focused tests also remain.
Production service construction gains a shared-pool path without requiring
unrelated test rewrites. Both paths execute the same service initialization
logic after resources are created.

Alternative rejected: variadic optional resources. Omission would be easy in
production and the call site would not reveal whether limits are shared.

### 4. Define aggregate statistics once

The runtime owner exposes one snapshot containing:

- executor running/queued gauges and started/rejected cumulative counters;
- positive and negative collection LRU snapshots;
- one result LRU snapshot covering all operations.

Result `Cost` and `Items` are process totals and cumulative result counters
count every operation once. A typed store may retain its existing `Stats`
method for focused-test compatibility, but for a shared pool that snapshot is
an alias of the same aggregate result pool and must never be summed across
services. Later HTTP observability must consume the runtime-owner snapshot
once. Per-operation diagnostic counters, if ever needed, are separate from
budget state and are outside this change.

### 5. Prove sharing with small deterministic limits

Focused tests use small injected limits rather than allocating production-size
values. Two or more different typed stores publish entries into one pool and
prove global LRU eviction, total item/cost bounds, and acceptance of an entry
larger than a hypothetical one-fifth share but within global/per-item limits.
Mixed-operation work saturates one two-running/eight-queued executor and proves
the next computation receives `SERVER_BUSY`. Two call sites requesting one
collection key prove a single shared positive/negative and singleflight owner.

App tests exercise a factored assembly boundary or injected runtime factory to
prove one owner is constructed and passed to all five services. Source-text
matching alone is not sufficient acceptance evidence.

## Risks / Trade-offs

- [A private heterogeneous entry could be read through the wrong typed facade]
  → Pre-register the five canonical operation/type/clone/cost bindings at
  runtime construction, preserve operation and private type identity in every
  entry, and test wrong-type-first, duplicate/conflicting binding, concurrent
  construction, and fail-closed read behavior under no panic.
- [A compatibility constructor could be used accidentally by production]
  → Give the shared constructor an explicit name, use only it in app assembly,
  and add an app-level identity test.
- [Global LRU changes which operation is evicted under mixed load]
  → This is the intended process budget; deterministic cross-operation
  eviction tests record the contract.
- [Five store-level stats could be summed and over-report resource state]
  → Document and test the runtime-owner snapshot as the only aggregate
  authority; each shared alias reports the same pool, not a shard.
- [Creating resources before discovering a constructor failure leaves partial
  objects] → Constructors remain local and side-effect-free; return the error,
  abandon the unreachable objects, mark runtime not live/ready, and close the
  Archive exactly as current app failure paths require.

## Migration Plan

1. Add the result pool and process owner with focused tests.
2. Add shared-runtime service constructors while retaining isolated wrappers.
3. Change app assembly to construct once and pass the same owner to all five
   services; keep the provider placeholder unchanged.
4. Run focused, race, full Backend, strict-spec, and hygiene gates.

There is no deployed-state migration. Before commit, rollback is removal of
only this change's new files and restoration of its writable files. Production
deployment and rollback remain deferred.

## Open Questions

None. The external provider is intentionally unresolved and remains injectable.
