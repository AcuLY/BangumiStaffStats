# backend-bounded-query-cache Specification

## Purpose
Define the bounded, immutable runtime caches and admission controls used to
reuse collection and result computation without changing successful API
semantics or leaking personal identities.

## Requirements
### Requirement: Runtime caches SHALL be weighted, bounded, and result-neutral

The Backend SHALL use a shared `map + container/list + sync.Mutex` weighted-LRU
kernel for collection, result, and negative caches. Each instance SHALL enforce
maximum total cost, item count, and per-item cost. Replacement SHALL update cost
atomically and eviction SHALL be deterministic least-recently-used order.

The collection defaults SHALL be 64 MiB, 4096 entries, and 8 MiB per item. The
result defaults SHALL be 190 MiB, 512 entries, and 32 MiB per item. The negative
defaults SHALL be 2 MiB and 4096 entries. A miss, eviction, oversize value, or
cache publication failure SHALL only cause recomputation and SHALL NOT change a
successful business result.

Values SHALL be immutable after publication. Cache reads SHALL return clones or
other ownership-safe values; sorting, pagination, and handlers SHALL NOT mutate
cached slices or maps.

#### Scenario: An oversize value is computed
- **WHEN** a successful value exceeds its cache's per-item or total-cost limit
- **THEN** the caller SHALL receive the successful value and the cache SHALL not retain it

#### Scenario: A cached value is projected
- **WHEN** one request sorts, filters, or paginates a cached core
- **THEN** later readers SHALL observe the original immutable core

### Requirement: Shared work SHALL be detached and bounded

Same-key loads and computations SHALL use independent singleflight groups.
Shared work SHALL run with an explicit timeout not derived from the first
waiter's context. Cancelling one waiter SHALL stop only that wait; it SHALL not
cancel shared work still useful to another waiter. Once no result is published,
a later caller SHALL be able to retry.

Different-key expensive computations SHALL pass through an executor with at
most two running tasks and eight queued tasks. A full queue SHALL fail promptly
with typed `SERVER_BUSY` and retry guidance. All computation and loading SHALL
occur outside cache locks.

#### Scenario: One of two same-key waiters cancels
- **WHEN** two callers share a load and one caller cancels
- **THEN** the cancelled caller SHALL return its context cause while the other caller may receive the shared result

#### Scenario: The compute queue is full
- **WHEN** two tasks run and eight different-key tasks are queued
- **THEN** another task SHALL fail without starting and expose `SERVER_BUSY`

### Requirement: Collection cache SHALL implement exact freshness semantics

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

#### Scenario: Explicit refresh returns unchanged content
- **WHEN** refresh bypasses a fresh collection and the upstream digest is unchanged
- **THEN** the new collection metadata SHALL publish and existing result cores MAY be reused by collection digest

#### Scenario: Temporary refresh failure has eligible stale data
- **WHEN** a temporary upstream failure occurs before staleUntil
- **THEN** the prior value SHALL be returned with stale true and warning code `COLLECTION_STALE`

#### Scenario: A forbidden collection fails
- **WHEN** upstream establishes that anonymous collection access is forbidden
- **THEN** no stale positive value SHALL be served and the negative result SHALL expire after 30 seconds

### Requirement: Result cache SHALL use semantic core keys

Each result key SHALL contain versioned operation, dataVersion, queryDigest,
inputDigest, and collectionDigest only for personal scope. Rankings SHALL use a
fixed empty input digest. Search, sort, order, page, pageSize, and detail section
SHALL not enter the expensive-core key. Personal lookup SHALL first establish
the usable collection digest; global and personal key spaces SHALL never
collide.

Result values SHALL be compact typed pre-view cores, not HTTP envelopes or page
responses. Cache hits and misses SHALL return behaviorally identical results.

#### Scenario: Two views address one core
- **WHEN** only search, sort, order, or pagination differs
- **THEN** both requests SHALL address the same result-cache key and project independent response views

#### Scenario: Archive publication changes
- **WHEN** dataVersion changes while every query and input field remains equal
- **THEN** the request SHALL address a different result-cache key
