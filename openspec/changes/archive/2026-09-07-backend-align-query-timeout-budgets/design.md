## Context

The current 30-second outer request and collection worker budgets are equal; the detached compute worker can run for 120 seconds after its waiter has already timed out. Large collections require many paginated, rate-limited HTTP attempts. The user approved explicit nested budgets without changing query semantics.

## Goals / Non-Goals

Goals: 10s page attempts, 90s complete collection loads including limiter waits/retries, 20s shared result computation including executor queue, 120s outer HTTP requests, 125s HTTP writes, and a compatible 130s repository proxy wait.

Non-goals: change cancellation ownership, caches, query outputs, upstream DTO validation, library versions, frontend, or production deployment.

## Change boundary

| Field | Decision |
| --- | --- |
| Status | Specified; strict validation and primary review precede apply. |
| Owner | Primary agent; backend runtime and operations template have separate writable blocks. |
| Writable paths | Exact paths in proposal.md Impact, unchanged. |
| Read-only protected inputs | Product/design, data decisions, master plan/guides, contracts, dependencies, unrelated dirty work and other active changes. |
| Deletion complement | No source deletion; archive only this completed change. |
| Mutable refs | None. |
| Consumes | Existing constructors, singleflight, executor, HTTP middleware and Nginx template. |
| Produces | Defaults, targeted regression tests, docs and four capability deltas. |
| Dependencies | Page attempt → collection load → shared compute/queue → HTTP response → proxy; imports retain existing direction. |
| Deliverables | Scoped diff and recorded evidence. |
| Acceptance | Commands and checkpoints in tasks.md. |
| Non-goals | No dependency or architectural changes, no upstream-protocol fix. |
| Operations deferred | Production unchanged; existing local launcher may restart local API as already authorized. |
| Stop/rollback conditions | Stop on overlap or unrelated failure requiring wider scope; preserve preceding rate edit and revert only owned timeout changes if requested. |

## Decisions

1. Configure the public collection client explicitly with `WithRequestTimeout(10*time.Second)` alongside `WithRateLimit(5,10)`. The library's per-attempt context excludes its rate-limiter wait, which is bounded by the 90-second collection worker. Retry count/backoff stay unchanged and cannot extend that worker's deadline.
2. Change existing collection/result defaults, without introducing a budget service or per-operation executor. The shared result worker's context is created before `Executor.Do`, so the 20-second budget includes queueing, fact reads and computation for all operations using that worker. The default collection plus compute budgets total 110 seconds, leaving 10 seconds inside the 120-second request for request handling/projection.
3. Preserve independent same-key workers. A canceled waiter still does not cancel work used by others; no new guarantee is made that non-cooperative code can be forcibly stopped. Existing context-aware work and timeout error classification remain authoritative.
4. Set the standard-library server WriteTimeout to 125 seconds and the repository Nginx read timeout to 130 seconds. Only raising the business timeout would leave the current 35-second transport/proxy cutoff in place. Nginx read timeout remains its existing inactivity timeout, not a newly introduced total deadline.

## Risks / Trade-offs

- Longer collection waits retain in-flight work longer → existing shared rate, concurrency, singleflight and cache limits remain in force.
- Reducing the shared computation budget affects every query operation → run focused deadline/queue tests and the complete affected backend gate.
- Large-user responses may independently violate the admitted DTO contract → record the failure separately; do not weaken protocol validation in this change.
- A deployed old proxy can still time out at 35 seconds → document that the repository template is updated but production requires separate deployment authorization.

## Migration Plan

Validate and review artifacts, implement defaults/tests/docs, run acceptance, sync/archive specs, then restart the already authorized local API via the existing launcher. No production migration or remote ref mutation occurs.

## Open Questions

None for the accepted timeout values. Large-collection protocol compatibility remains separate.
