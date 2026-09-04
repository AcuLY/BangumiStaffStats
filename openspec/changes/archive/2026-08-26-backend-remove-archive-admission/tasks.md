## Task Boundary

| Field | Boundary |
|---|---|
| Status | Local specified/implemented/verified states only until separately committed; never infer push/release/deploy |
| Owner | Primary agent; Backend runtime/tests and exact authority/spec/docs reconciliation |
| Writable paths | `openspec/changes/backend-remove-archive-admission/**`; declared Backend files in proposal; `tmp-formal-development/{formal-development-master-plan.md,backend-development-implementation-guide.md}`; exact affected root specs only during sync/archive |
| Read-only protected inputs | Product/design/data decisions, contracts, updater, frontend, original dirty worktree, local Archive bytes, remotes, hosts, production |
| Deletion complement | Admission-owned Backend code/tests/assertions only; no contract, producer, query/statistics, Archive-data, unrelated smoke/test, or unrelated work deletion |
| Mutable refs | `codex/remove-archive-admission` based on `411f54b`; no remote ref |
| Consumes | Existing current pointer, producer-published SQLite, Store/query/runtime/operations interfaces |
| Produces | Direct-open Backend, reconciled docs/specs/tests, local API/UI evidence |
| Dependencies | Completed smoke removal `411f54b`; updater validation/publication; existing HTTP/query/operations capabilities |
| Deliverables | Focused/full Backend checks, strict OpenSpec, searches, diff checks, local complete-Archive API/UI validation |
| Acceptance | No Backend Archive admission path/claim; startup performs no hash/integrity/FK/schema/count scan; preserved APIs/dataVersion/query behavior |
| Non-goals | Updater/schema/API/UI/statistics/dependency/hot-reload/fallback/external changes |
| Operations deferred | Push, PR, merge, tag, release, deploy, host/public-route/legacy mutation |
| Stop/rollback conditions | Stop on branch/HEAD/dirty mismatch, authority conflict, producer drift, overlapping edit, behavior drift, or failed gate; stop candidate and return to `411f54b` |

Forbidden throughout: `git reset --hard`, checkout-based rollback, `git clean`,
`git add -A`, broad recursive deletion, writes outside declared paths, external
repository mutation, or any production operation.

## 1. Planning and authority reconciliation — owner: primary agent

- [x] 1.1 Preflight `codex/remove-archive-admission` at parent `411f54b`, verify
  only this change is dirty, confirm original worktree/Archive/external state are
  protected, and stop on mismatch.
- [x] 1.2 Review proposal, design, four delta specs, and this task boundary
  against `PRODUCT.md`, the formal master plan, Backend guide, root specs, and
  user intent; record zero P0/P1 planning findings and run
  `npx --yes @fission-ai/openspec@1.6.0 validate backend-remove-archive-admission --strict`.
- [x] 1.3 Update only
  `tmp-formal-development/formal-development-master-plan.md` and
  `tmp-formal-development/backend-development-implementation-guide.md` so
  producer validation remains authoritative and Backend direct-open/readiness
  no longer claims admission.

## 2. Backend direct-open implementation — owner: Backend

- [x] 2.1 In `backend/internal/archive/**`, delete the candidate-admission API,
  manifest/digest/compatibility/integrity/FK/schema/count gates and obsolete
  outcomes; implement contained `current.json`/explicit-version direct open,
  query-only bounded SQLite setup, `archive_meta.data_version` identity,
  atomic publication, and existing Store close/query safety.
- [x] 2.2 Replace admission-only Archive golden/mutation/contract tests with
  focused direct-open, unsafe-path, read-only/query, sidecar, identity,
  publication-race, concurrent-read, active-row shutdown, and cancellation
  coverage; delete only now-unowned admission test files through exact patches.
- [x] 2.3 Update dependent Backend service/integration tests to use direct
  version/current open without recreating manifest or admission helpers; keep
  query/statistics expectations unchanged.
- [x] 2.4 Update app startup and observability mappings/tests so one direct-open
  failure retains sanitized degraded serving while admission-specific runtime
  codes/claims disappear; update `backend/README.md` accordingly.

## 3. Automated acceptance — owner: primary agent

- [x] 3.1 Run `gofmt` on exact changed Go files, focused
  `go test ./internal/archive ./internal/app ./internal/observability`, and
  affected query-service tests; correct only in-scope failures.
- [x] 3.2 Run `backend/scripts/check.sh` in the documented environment,
  including build/test/vet/race/inventory gates, and record any environment
  limitation separately from code failures.

  Evidence: the documented script was attempted under WSL three times and
  stopped before product checks because the host lacked Linux Go/Node and its
  `/tmp` bootstrap directories were reclaimed during the run. Independent
  Go 1.26.5 `go vet ./...`, `go test -race ./... -count=1`,
  `CGO_ENABLED=0 go test ./... -count=1`, and `CGO_ENABLED=0 go build ./cmd/api`
  all passed; the script limitation remains environment-only and explicit.
- [x] 3.3 Run repository searches proving no Backend Archive admission,
  candidate-admission API, or removed gate functions remain; confirm updater
  producer validation is unchanged; run strict change/all OpenSpec validation
  and `git diff --check`.

## 4. Local complete-Archive deployment acceptance — owner: primary agent

- [x] 4.1 Build the Backend from this branch into a task temporary directory,
  start it locally against
  `D:/Luca/Data/BangumiStaffStats/archive`, and verify startup no longer hashes
  or integrity-scans the Archive.
- [x] 4.2 Verify `/livez`, `/readyz`, `/api/v1/catalog`, and `/metrics` all
  succeed and consistently report
  `dv1-e64e0aaba6064c2fdee9d2b20a8e777303893001ddbb97a607b4b15087b8ae3c`.
- [x] 4.3 Through the existing local Vite 5173 browser session, verify ranking
  and co-star render nonempty without overlay or relevant console errors; no
  product/oracle visual delta is claimed.

## 5. Lifecycle closeout — owner: primary agent

- [x] 5.1 Audit the complete diff for exact scope, preserved updater/frontend/
  original worktree, LF/CRLF stability, and no residue; record implemented,
  verified, committed, pushed, released, and deployed states separately.
- [x] 5.2 After all gates pass, sync the four deltas, archive the change with the
  repository skill, run `openspec validate --all --strict`, and leave push,
  release, and production deployment undone unless separately authorized.
