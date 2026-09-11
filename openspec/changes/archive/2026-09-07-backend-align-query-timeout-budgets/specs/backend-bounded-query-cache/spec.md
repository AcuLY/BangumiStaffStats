## Capability Boundary

| Field | Scope |
| --- | --- |
| Status | Specified; apply follows strict validation and primary review. |
| Owner | Capability prefix owner, implemented by primary agent. |
| Writable paths | Corresponding exact capability source/test/doc paths in proposal.md Impact and this delta. |
| Read-only protected inputs | Higher authorities, contracts, dependency module, other active changes and unrelated dirty work. |
| Deletion complement | No source deletion. |
| Mutable refs | None. |
| Consumes | Existing capability and the user-approved budgets. |
| Produces | Bounded runtime/template behavior and focused tests. |
| Dependencies | Existing app composition and shared timeout ownership; no import boundary changes. |
| Deliverables | Updated implementation, docs and accepted specification. |
| Acceptance | Focused and affected-component gates in tasks.md. |
| Non-goals | Upstream DTO repair, new UI or dependencies. |
| Operations deferred | All production and remote actions; local restart is separately authorized in this session. |
| Stop/rollback conditions | Stop on conflict or overlap; preserve prior rate edit and unrelated work. |

## MODIFIED Requirements

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

The production collection worker SHALL have a 90-second timeout including
all pagination, limiter waits and retries. Every shared result worker SHALL
have a 20-second timeout starting before executor admission, including queue
waiting, Archive reads and computation. Cache TTLs SHALL remain unchanged.

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

#### Scenario: Collection pagination outlasts thirty seconds
- **WHEN** a complete collection load requires more than 30 but less than 90 seconds and no other failure occurs
- **THEN** its worker SHALL remain eligible to return a complete snapshot within the 120-second request budget

#### Scenario: A result worker exhausts its budget while queued
- **WHEN** executor waiting consumes a result worker's full 20-second budget
- **THEN** the worker SHALL fail with the existing timeout classification without starting computation or caching a partial result