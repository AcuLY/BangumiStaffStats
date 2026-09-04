## Task Boundary

| Field | Boundary |
|---|---|
| Status | Local investigated/specified correction; heavy gates deferred |
| Owner | Backend candidates projection; primary agent accepts |
| Writable paths | Change artifacts and completed lower-camel projection/test slices only; later all-position projection writes transferred; root spec later |
| Read-only protected inputs | Product/design, contracts/generated, Frontend, computation/cache/service/handler, unrelated worktree/external state |
| Deletion complement | Preserve all fields/values; remove accidental upper-camel wire keys only |
| Mutable refs | Current worktree and loopback Backend process |
| Consumes | Internal PositionCount and accepted candidates schema |
| Produces | Exact lower-camel candidates summary JSON |
| Dependencies | Existing standard-library JSON projection and accepted contracts |
| Deliverables | DTO mapping, raw JSON regression, focused/runtime evidence |
| Acceptance | Exact keys, strict decoder acceptance, successful local co-star query |
| Non-goals | Algorithm/cache/request/error/schema/frontend/dependency/deploy changes |
| Operations deferred | Complete gates, sync/archive, commit/push/release/deploy |
| Stop/rollback conditions | Scope/path/contract/value/order/test/runtime mismatch |

Forbidden: reset/checkout rollback, git clean, broad deletion/staging, protected
path edits, external writes, and production operations.

## 1. Planning and preflight — owner: primary agent

- [x] 1.1 Verify branch/HEAD/dirty paths, capture the real HTTP 200 malformed
  response, review proposal/design/spec/tasks with zero unresolved P0/P1, and
  strict-validate before implementation.

## 2. Candidate response correction — owner: Backend candidates projection

- [x] 2.1 Add a private position-count response DTO in `projection.go` and map
  internal counts into exact `positionKey`/`count` members without value/order
  or scope changes.
- [x] 2.2 Add `projection_test.go` raw-JSON coverage that requires lower-camel
  keys/values and forbids the upper-camel aliases hidden by Go struct decoding.

## 3. Focused acceptance — owner: primary agent

- [x] 3.1 Run focused candidates Go tests, the Frontend candidates decoder test,
  strict OpenSpec validation, and `git diff --check` without starting complete
  component gates.
- [x] 3.2 Restart only the existing loopback Backend with its current Archive/
  configuration, inspect the live response body, reload the browser, and prove
  the same co-star query renders candidates with no generic error or new logs.

  Evidence: `go test ./internal/candidates` passed and the focused Frontend
  candidates Vitest passed 6/6. The change is strict-valid and diff checks are
  clean. The loopback Backend was rebuilt and restarted with the unchanged
  Archive, update-status, proxy, and `127.0.0.1:8080` arguments; `/readyz`
  returned 200 under PID 33596. The real personal Director candidates response
  returned HTTP 200 with `[{"positionKey":"staff:anime:2","count":259}]` and no
  upper-camel aliases. After reload, the co-star query reached “尚未选择人物”
  without the generic error, and opening “选择人物” rendered candidates 1—10 /
  259. No new browser error/warn entry was emitted; displayed log entries all
  predated this correction and came from the earlier HMR session.

## 4. Deferred lifecycle — owner: primary agent

- [ ] 4.1 In the later accumulated batch, run complete affected gates, sync the
  backend-candidates-api root spec, archive/validate all, and keep commit/push/
  release/deploy unperformed unless separately authorized.
