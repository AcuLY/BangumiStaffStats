## Why

Large public collections cannot finish within the current 30-second collection and HTTP budgets. The user approved 10-second page attempts, 90-second complete collection loads, 20-second queued computations, 120-second requests, and 125-second HTTP writes. The existing 35-second reverse-proxy wait must also accommodate these bounds.

## What Changes

- INTENTIONAL_DELTA, explicitly authorized in this conversation: apply the five approved budgets, retaining the already approved shared rate of 5 requests/second and burst 10.
- Preserve detached singleflight, cancellation, retries, response schemas, cache TTLs, query semantics, and the oracle's UI behavior (`644b7748674e553f863d0ffd61d029f86fdc0717`).
- Synchronize the repository Nginx template to a 130-second upstream read wait, without deploying it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `backend-public-collection-source`: explicit 10-second attempt timeout and the previously accepted rate.
- `backend-bounded-query-cache`: 90-second collection and 20-second shared compute budgets.
- `backend-http-runtime`: 120-second request and 125-second write budgets.
- `operations-single-host-deployment`: repository proxy template waits 130 seconds.

## Impact

| Boundary | Decision |
| --- | --- |
| Status | Specified; apply requires strict validation and primary-agent review. |
| Owner | Primary agent; backend owns runtime/tests/docs, operations owns template/test/docs. |
| Writable paths | `backend/internal/publiccollection/{source.go,transport_test.go}`, `backend/internal/runtimecache/{collection.go,result.go,result_test.go}`, `backend/internal/httpapi/{middleware.go,server.go,server_test.go}`, `backend/README.md`, `operations/{nginx/bgmss.conf,test/runtime.sh,README.md}`, this change directory, and the four listed capability specs. |
| Read-only protected inputs | `PRODUCT.md`, `DESIGN.md`, accepted data decisions, master plan, implementation guides, contracts, dependency module, existing frontend work and other active changes. |
| Deletion complement | No product file deletion; only normal archival of this change. |
| Mutable refs | None; current master/worktree, no commit, push or merge. |
| Consumes | Current runtime composition, shared executor, pinned collection v0.1.1, user-approved budgets. |
| Produces | Aligned runtime defaults and proxy template, tests, docs and accepted specs. |
| Dependencies | Collection attempts inside collection load; compute budget starts before executor queue; HTTP encloses both; proxy waits beyond HTTP write budget. |
| Deliverables | Exact scoped diff and validation evidence in tasks.md. |
| Acceptance | Focused Go tests; complete `backend/scripts/check.sh` on clean LF Linux export when available; operations runtime test; strict OpenSpec and `git diff --check`; local restart/readiness/query/image checks. |
| Non-goals | Fixing the separately observed upstream protocol error; dependency upgrades; new jobs/progress UI; cache or statistical changes. |
| Operations deferred | No production host, route, service, release or deployment mutation. Local restart remains authorized by this session and uses the existing launcher. |
| Stop/rollback conditions | Preserve the preceding rate edit in source.go and all unrelated dirt; stop on overlapping concurrent changes or scope-expanding failures. Revert only this turn's scoped changes if rollback is requested. |

No other repository is modified. The only existing dirty backend file is source.go from the authorized rate change in this same conversation; the user explicitly authorized the subsequent timeout edit to that constructor.
