## Capability Boundary

| Boundary | Declaration |
|---|---|
| Status | strict-valid and main-agent approved; implementation authorized |
| Owner | Backend implementation agent; main agent reviews/accepts |
| Writable paths | `backend/internal/runtimecache/result.go`, `backend/internal/runtimecache/result_test.go`, new `backend/internal/runtimecache/runtime.go`, new `backend/internal/runtimecache/runtime_test.go`, `backend/internal/ranking/{service.go,service_test.go}`, `backend/internal/{candidates,persondetail,partners,costar}/{cache.go,service.go,service_test.go}`, `backend/internal/app/{run.go,run_test.go}`, `backend/internal/architecture/dependencies_test.go`, `backend/README.md`, and this change's task markers |
| Read-only protected inputs | Existing collection/LRU/executor/detached/error implementations/tests; all other Backend paths; Contracts, Updater, Frontend, guides/oracle, sibling changes, refs/remotes, external state |
| Deletion complement | Every repository path outside the writable list; no existing writable file may be deleted |
| Mutable refs | None |
| Consumes | Accepted bounded-cache primitives and five production query services |
| Produces | One process-wide query-resource owner and shared production assembly |
| Dependencies | `app -> ranking/candidates/persondetail/partners/costar -> runtimecache`; public collection admission remains a later injected dependency |
| Deliverables | Shared collection/negative cache, executor, heterogeneous result pool, aggregate stats, compatible isolated constructors, production wiring and tests |
| Acceptance | Deterministic cross-operation budget/eviction, mixed-operation queue saturation, shared collection loading, app identity, compatibility, race/full Backend, strict validation and hygiene |
| Non-goals | Public-client admission, contract/API/statistical changes, per-operation quotas, Redis/persistence/SWR, frontend or operations work |
| Operations deferred | Production configuration/sizing, monitoring rollout, load test, deploy, release, cutover, activation |
| Stop/rollback conditions | Stop on protected drift, owner overlap, type-unsafe pooled access, unprovable global limits, or unpublished-client dependency; revert only unstaged writable-path edits |

## MODIFIED Requirements

### Requirement: Runtime caches SHALL be weighted, bounded, and result-neutral

The Backend SHALL use a shared `map + container/list + sync.Mutex` weighted-LRU
kernel for collection, result, and negative caches. One API process SHALL
construct exactly one query-runtime owner for ranking, candidates, person
detail, partners, and co-star. That owner SHALL contain exactly one positive
collection cache, its one negative cache, and one result LRU covering every
operation. Isolated service construction MAY create a private owner only for
focused tests or non-process use; production app assembly SHALL construct the
shared owner directly at the app composition root and SHALL NOT delegate that
process-owner factory to one of the five domain service packages.

Each process cache SHALL enforce maximum total cost, item count, and per-item
cost. Replacement SHALL update cost atomically and eviction SHALL be
deterministic global least-recently-used order. The collection defaults SHALL
be 64 MiB, 4096 entries, and 8 MiB per item. The result defaults SHALL be
190 MiB total across all operations, 512 total entries across all operations,
and 32 MiB per item. The negative defaults SHALL be 2 MiB and 4096 entries.
The Backend SHALL NOT multiply these defaults per service or statically divide
the result cost/item budget among operations.

A miss, eviction, oversize value, or cache publication failure SHALL only cause
recomputation and SHALL NOT change a successful business result. Values SHALL
be immutable after publication. Cache reads SHALL return clones or other
ownership-safe values; sorting, pagination, and handlers SHALL NOT mutate
cached slices or maps. A heterogeneous shared result pool SHALL preserve the
typed `ResultStore` boundary and SHALL fail closed without panic or cross-cast
if an entry does not match its typed facade.

The process owner SHALL expose one aggregate snapshot for executor, positive
collection, negative collection, and result state. Result `Cost`, `Items`, and
cumulative LRU counters SHALL cover all operations exactly once. Any
store-level result snapshot over a shared pool SHALL be documented as an alias
of that same aggregate pool and SHALL NOT be summed across services.

#### Scenario: An oversize value is computed
- **WHEN** a successful value exceeds the process result cache's 32 MiB per-item or 190 MiB total-cost limit
- **THEN** the caller SHALL receive the successful value and the shared cache SHALL not retain it

#### Scenario: One operation uses available global capacity
- **WHEN** one typed core exceeds a hypothetical one-fifth share but fits the global total and per-item limits
- **THEN** the shared result pool SHALL admit it subject only to global LRU eviction and SHALL NOT reject it because of an operation quota

#### Scenario: Mixed operations reach the process limit
- **WHEN** different operation types publish values whose combined cost or count exceeds the shared limit
- **THEN** one deterministic cross-operation LRU SHALL evict until aggregate cost is at most 190 MiB and aggregate count is at most 512

#### Scenario: A cached value is projected
- **WHEN** one request sorts, filters, or paginates a cached core
- **THEN** later readers SHALL observe the original immutable core

#### Scenario: Aggregate resource state is observed
- **WHEN** all five production services use one process owner and its statistics are read
- **THEN** collection, negative, result, and executor state SHALL each be reported once, and summing five service aliases SHALL NOT be an allowed totals calculation

### Requirement: Shared work SHALL be detached and bounded

Same-key loads and computations SHALL use independent singleflight groups.
Shared work SHALL run with an explicit timeout not derived from the first
waiter's context. Cancelling one waiter SHALL stop only that wait, not work
still useful to another waiter. Once no result is published, a later caller
SHALL be able to retry.

Different-key expensive computations from ranking, candidates, person detail,
partners, and co-star SHALL all pass through the one process executor with at
most two running tasks and eight queued tasks in total. A full shared queue
SHALL fail promptly with typed `SERVER_BUSY` and retry guidance. Production
SHALL NOT construct one executor per service. All computation and loading SHALL
occur outside cache locks.

#### Scenario: One of two same-key waiters cancels
- **WHEN** two callers share a load and one caller cancels
- **THEN** the cancelled caller SHALL return its context cause while the other caller may receive the shared result

#### Scenario: The compute queue is full
- **WHEN** two tasks run and eight different-key tasks are queued
- **THEN** another task SHALL fail without starting and expose `SERVER_BUSY`

#### Scenario: Mixed operations fill the compute queue
- **WHEN** two tasks from any operations run and eight tasks from any other combination of operations are queued on the process executor
- **THEN** another operation's task SHALL fail without starting and expose `SERVER_BUSY`

#### Scenario: Isolated package test constructs a service
- **WHEN** a focused service test uses the compatibility constructor without app assembly
- **THEN** it SHALL receive one valid private owner with the same timeout, cancellation, queue, and cache semantics

### Requirement: Collection cache SHALL implement exact freshness semantics

The five production query services SHALL share the process owner's one
collection cache and its positive, negative, and detached-load state.
Collection keys SHALL separate personal identities using a one-way UID digest
and include subject type plus the canonical ordered collection-status set. Raw
UIDs SHALL not enter keys, metrics, or errors. Positive values SHALL carry an
immutable query collection snapshot, canonical digest, fetchedAt, freshUntil,
and staleUntil.

The collection digest SHALL deterministically cover subject ID/type, status,
rate, comment, tags, volume/episode progress, private, and updatedAt evidence in
stable order. Public empty collections SHALL be positive values.

A normal request SHALL use a positive value until freshUntil. Explicit refresh
SHALL bypass only the fresh hit and SHALL not clear either cache. Only timeout,
network, upstream 429, and upstream 5xx failures MAY fall back to a positive
value before staleUntil, which is 30 minutes after fresh expiry. Not-found and
not-public outcomes SHALL never use stale. Negative not-found SHALL live two
minutes and negative forbidden SHALL live 30 seconds; other failures SHALL not
be negative-cached.

The process defaults SHALL remain one 64 MiB/4096-entry positive cache with an
8 MiB per-item limit and one 2 MiB/4096-entry negative cache; they SHALL NOT be
created or counted once per service. The collection provider SHALL remain an
injected dependency and MAY be absent until its separately governed admission;
absence SHALL NOT cause the process resources to be duplicated.

#### Scenario: Two operations load the same collection
- **WHEN** two production services concurrently request the same collection key
- **THEN** one process collection cache and detached load SHALL supply both without duplicate retained positive or negative entries

#### Scenario: Explicit refresh returns unchanged content
- **WHEN** refresh bypasses a fresh collection and the upstream digest is unchanged
- **THEN** the new collection metadata SHALL publish and existing result cores MAY be reused by collection digest

#### Scenario: Temporary refresh failure has eligible stale data
- **WHEN** a temporary upstream failure occurs before staleUntil
- **THEN** the prior value SHALL be returned with stale true and warning code `COLLECTION_STALE`

#### Scenario: A forbidden collection fails
- **WHEN** upstream establishes that anonymous collection access is forbidden
- **THEN** no stale positive value SHALL be served and the shared negative result SHALL expire after 30 seconds

#### Scenario: Provider admission remains pending
- **WHEN** app assembly has no admitted public collection provider
- **THEN** it SHALL still construct one shared runtime while personal collection access remains unavailable through the existing service error semantics

### Requirement: Result cache SHALL use semantic core keys

Each result key SHALL contain versioned operation, dataVersion, queryDigest,
inputDigest, and collectionDigest only for personal scope. Rankings SHALL use a
fixed empty input digest. Search, sort, order, page, pageSize, and detail
section SHALL not enter the expensive-core key. Personal lookup SHALL first
establish the usable collection digest; global and personal key spaces SHALL
never collide.

Result values SHALL be compact typed pre-view cores, not HTTP envelopes or page
responses. All five typed facades SHALL publish into one process-wide result
LRU, whose operation-bearing keys provide cross-type separation. Cache hits and
misses SHALL return behaviorally identical results. Per-operation cost
functions and ownership-safe clones SHALL remain authoritative for each typed
core while global LRU accounting SHALL use their retained-cost results. The
runtime SHALL accept exactly one canonical binding per operation before facade
construction; that binding fixes the operation, core type, clone, and cost
policy and one typed same-key detached group per runtime. Facades SHALL NOT
replace those policies or create separate same-operation load groups. An
absent, duplicate, or mismatched binding—including a wrong type offered before
the canonical facade—SHALL fail closed without panic, replacement, statistic
drift, or cache promotion.

#### Scenario: Two views address one core
- **WHEN** only search, sort, order, or pagination differs
- **THEN** both requests SHALL address the same result-cache key and project independent response views

#### Scenario: Archive publication changes
- **WHEN** dataVersion changes while every query and input field remains equal
- **THEN** the request SHALL address a different result-cache key

#### Scenario: Different operations share capacity without sharing values
- **WHEN** two typed stores use equal data/query/input digest strings under different versioned operations
- **THEN** their values SHALL occupy distinct keys in one global LRU and neither typed facade SHALL read or cast the other's core

#### Scenario: A wrong facade is constructed first
- **WHEN** a facade type does not match the operation's canonical runtime binding, or a second binding conflicts in type, clone, or cost policy
- **THEN** construction SHALL fail before cache access even if no correct facade has yet been constructed
- **AND** the canonical facade SHALL remain constructible with unchanged cache contents, LRU order, and statistics
