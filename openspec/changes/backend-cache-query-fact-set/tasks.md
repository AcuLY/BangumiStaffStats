## Task Boundary

| Field | Boundary |
|---|---|
| Status | Local specification, implementation, and focused verification |
| Owner | Backend query |
| Writable paths | `openspec/changes/backend-cache-query-fact-set/**`; `backend/internal/query/archive_loader.go`; `backend/internal/query/archive_loader_cache_test.go` |
| Read-only protected inputs | Product/design/root specs, Archive bytes, existing tests, other packages/components, remotes/hosts/production |
| Deletion complement | Preserve loaders, fixed SQL, query behavior, tests, gates, caches, and unrelated work |
| Mutable refs | Exact writable local files only; no Git ref mutation |
| Consumes | Published immutable Store, exact Store object identity, subject type, caller context |
| Produces | One complete immutable process-local FactSet per exact Store-and-subject-type key |
| Dependencies | Existing Go stdlib/query/archive only; no new dependency |
| Deliverables | Strict-valid change, implementation, focused tests, race/diff evidence |
| Acceptance | Reuse/coalescing, isolation, cancellation/failure retry, no partial publication, unchanged query results |
| Non-goals | Warmup/eviction/wire/query/statistical/timeout/observability change, full gate, external operations |
| Operations deferred | Root-spec sync/archive, batched full gate, commit/push/merge/release/deploy/service/host/production mutation |
| Stop/rollback conditions | Stop on branch/HEAD/ownership drift, overlapping concurrent edit, aliasing/poisoning/partial value, race/leak/result drift, failed acceptance, or out-of-scope write; patch only exact owned files |

Forbidden throughout: `git reset --hard`, checkout-based rollback, `git clean`,
`git add -A`, broad recursive deletion, undeclared writes, external repository
mutation, host work, production operations, or release/deployment work.

## 1. Backend query preflight and implementation

- [x] 1.1 Reconfirm branch `codex/remove-archive-admission`, HEAD
  `411f54bbd631d01600baf56962ab2ae4a4d0f122`, allowed dirty worktree, no active
  conflicting owner, no new overlap in the exact writable paths, and complete
  strict-valid artifacts reviewed/approved by the main agent; stop on mismatch.
- [x] 1.2 In `backend/internal/query/archive_loader.go`, implement exact
  Store-object-and-subject-type keyed coalescing of complete successful FactSet
  loads with caller cancellation and retry after unsuccessful attempts.
- [x] 1.3 In `backend/internal/query/archive_loader_cache_test.go`, verify
  sequential/concurrent reuse, key isolation, canceled waiter behavior,
  failed/canceled build non-publication, retry, and complete-value reuse without
  changing existing loader tests.

## 2. Focused Backend query acceptance

- [x] 2.1 Run `go test ./internal/query` and
  `go test -race ./internal/query` from `backend`; cross-language and browser
  acceptance are not applicable because no contract, generated artifact,
  frontend, or rendered behavior changes.
- [x] 2.2 Run
  `npx --yes @fission-ai/openspec@1.6.0 validate backend-cache-query-fact-set --strict`,
  `gofmt` on the exact owned Go files, and `git diff --check --` on the exact
  owned paths; inspect the exact diff for result/SQL/scope drift.
- [x] 2.3 Record status honestly: investigated/specified/implemented/verified
  may complete locally; committed, pushed, merged, released, deployed, root-spec
  sync/archive, and full Backend gate remain not performed/deferred.
