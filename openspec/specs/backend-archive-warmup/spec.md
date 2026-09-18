# backend-archive-warmup Specification

## Purpose
Define same-process public Archive preparation before serving admission, bounded
single-generation activation and fail-closed recovery, and exact-Store derived-cache
retirement without changing query semantics, timeouts, or resource limits.

## Requirements

### Requirement: Shared public data SHALL be prepared before admission
App SHALL serially prepare the exact serving Store's complete series index and all five subject-type FactSets within one 120-second attempt, then complete the fixed readiness probe, before allowing readiness, catalog or Archive-dependent business queries. Preparation SHALL use normal public loaders in the serving process, without a real UID, Bangumi collection access, operation computation, or new Archive admission. Existing query/cache/statistics/memory limits SHALL remain unchanged.

#### Scenario: Store opened but preparation has not completed
- **WHEN** startup has a raw Store and public preparation is blocked or partial
- **THEN** readiness, catalog and valid business requests SHALL remain not-ready without starting query work, while liveness and metrics remain responsive

#### Scenario: All preparation succeeds
- **WHEN** the same Store's series index, anime/book/music/game/real facts and fixed probe succeed
- **THEN** the common prepared view SHALL admit queries, and first uncached user requests SHALL reuse that public data without a precomputed user result

#### Scenario: Startup preparation fails or serving ends
- **WHEN** preparation fails, times out, serving fails, or the process is canceled
- **THEN** preparation SHALL be canceled and joined, prepared admission SHALL remain closed, exact-Store partial caches SHALL be retired, and the Store SHALL not be closed while its preparation is still using it

### Requirement: Data switching SHALL retain at most one prepared cache generation
Activation SHALL close admission and drain old HTTP and detached users before retiring old Store-keyed caches and preparing the candidate. Old immutable data and its Store SHALL remain available for rollback until successful commit. Candidate and previous Store handles MAY coexist, but full derived-cache generations SHALL NOT. No successful cleanup SHALL run before preparation and pointer/State commit succeed.

#### Scenario: A candidate is prepared while maintenance is active
- **WHEN** the old users have drained and candidate preparation is running
- **THEN** old derived caches SHALL be retired, new valid business requests SHALL fail promptly as not-ready, health/metrics SHALL remain responsive, and no pointer commit SHALL have occurred

#### Scenario: Detached callback has not reached the executor
- **WHEN** its HTTP waiter has canceled and the old worker is registered but not yet scheduled into the executor
- **THEN** activation SHALL wait for actual completion before retiring old caches or closing the old Store

#### Scenario: Candidate activation succeeds
- **WHEN** candidate preparation, State replacement and pointer commit all succeed
- **THEN** only the prepared candidate SHALL be exposed, old caches and Store SHALL be retired, and existing successful version cleanup SHALL run

### Requirement: Failed preparation or activation SHALL recover fail-closed
A failed candidate SHALL have its partial caches retired. Changed pointer/State SHALL be restored safely. The previous Store SHALL be re-prepared using an independent recovery attempt of at most 120 seconds tied to process lifetime, and admission SHALL reopen only after restoration and preparation/probe succeed. Shutdown SHALL not start new recovery. Cancellation before cache retirement SHALL not needlessly discard a still-prepared old Store.

#### Scenario: Candidate preparation or pointer commit fails
- **WHEN** candidate preparation or commit fails after old derived caches were retired
- **THEN** old immutable data SHALL remain, candidate caches SHALL be removed, pointer/State restoration SHALL complete, and old data SHALL be re-prepared before queries resume

#### Scenario: Restore or recovery fails
- **WHEN** pointer restoration, State restoration, or old preparation fails
- **THEN** readiness and business admission SHALL remain closed, no failed generation SHALL be advertised ready, and no Store still referenced by State SHALL be closed as a losing candidate

### Requirement: Derived-cache retirement SHALL be exact and reusable
Series and FactSet caches SHALL support idempotent retirement of one drained Store, including all subject types and partial failed preparation. It SHALL NOT remove another Store's entries or alter normal loader semantics. Retired references SHALL be reclaimable; rewarming the same Store after rollback SHALL perform ordinary loading and allow later cache hits.

#### Scenario: One of two Stores is retired
- **WHEN** the lifecycle retires drained Store A while Store B has independently cached data
- **THEN** only A's entries SHALL disappear, repeated retirement SHALL be safe, B's cache hits SHALL remain, and A SHALL be reloadable

#### Scenario: A real-data generation is switched
- **WHEN** a real-data process with populated user caches prepares, switches or recovers under original CPU/memory/Go settings
- **THEN** acceptance SHALL require successful post-maintenance first queries, no OOM/restart, bounded lifetime and owned cleanup; fixture or preload-only success SHALL NOT substitute
