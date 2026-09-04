## Why

The local `POST /api/v1/candidates` operation computes and returns a successful
HTTP 200 response, but its nested position-count entries serialize as Go field
names `PositionKey` and `Count`. The accepted candidates schema requires
`positionKey` and `count`, so the strict Frontend decoder rejects valid candidate
results and shows a generic co-star query error.

## What Changes

- Map internal candidate position counts into an explicit JSON boundary type
  whose members use the accepted lower-camel field names.
- Add an exact raw-envelope regression that rejects the accidental upper-camel
  keys and confirms both personal/global serialization remain schema-shaped.
- Re-run focused Backend candidates tests, the existing Frontend candidates
  decoder test, and the real local co-star query without changing computation,
  error copy, or Frontend schema tolerance.

This is a `PRESERVE_ORACLE` and accepted-contract correction: observable co-star
candidate loading remains the behavior governed by PRODUCT, oracle
`644b7748674e553f863d0ffd61d029f86fdc0717`, and the existing candidates JSON
schema/goldens. No new API behavior or compatibility alias is introduced.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `backend-candidates-api`: require the success projection to serialize nested
  position-count members with the exact accepted JSON field names.

## Impact

- **Status:** local investigated/specification/implementation/focused
  verification only; not committed, pushed, released, or deployed.
- **Owner:** Backend candidates response projection; primary agent reviews and
  accepts the correction.
- **Writable paths:**
  `openspec/changes/backend-fix-candidate-summary-json/**`,
  `backend/internal/candidates/projection.go`,
  `backend/internal/candidates/projection_test.go`, and the exact
  `openspec/specs/backend-candidates-api/spec.md` only during later sync/archive.
- **Read-only protected inputs:** PRODUCT/DESIGN, `contracts/**` schemas,
  OpenAPI/generated wire types, Frontend decoder/API/query/co-star state,
  candidates computation/view/cache/service files, other dirty worktree paths,
  updater/Archive, original worktree, remotes, hosts, and production.
- **Deletion complement:** remove no API field, test, query path, candidate row,
  cache entry, or error behavior; replace only accidental default JSON casing at
  the projection boundary.
- **Mutable refs:** current local worktree and the already-running local Backend
  process only; no repository ref or external state.
- **Consumes:** existing internal `PositionCount`, candidates page projection,
  and accepted candidates success schema/goldens.
- **Produces:** schema-conformant `positionKey`/`count` JSON in
  `data.summary.positionCounts`.
- **Dependencies:** existing Go standard `encoding/json`, accepted
  `contracts-candidates-api` and `backend-candidates-api`; no new dependency.
- **Deliverables:** strict OpenSpec, one boundary DTO mapping, focused raw JSON
  regression, focused Go/Vitest results, and local browser response evidence.
- **Acceptance:** live candidates response remains HTTP 200 and contains only
  lower-camel nested count keys; the strict Frontend decoder accepts it; co-star
  renders candidate selection instead of the generic query error; no relevant
  console/backend error or unrelated response drift.
- **Non-goals:** changing candidate membership/rank/count values, cache keys,
  collection loading, timeouts, request/error schemas, Frontend decoding/copy,
  other APIs, dependencies, or production.
- **Operations deferred:** complete Backend/Frontend gates, root-spec sync and
  archive, commit/push/PR/merge/release/deploy and production mutation remain in
  the later accumulated batch.
- **Stop/rollback conditions:** stop on contract conflict, any response member
  beyond casing drift, changed candidate values/order, focused test failure,
  browser failure after Backend restart, or need to edit protected paths;
  rollback only the exact declared projection/change/test paths.

Apply is blocked until proposal, design, delta spec, and tasks are complete,
strict-valid, and reviewed by the primary agent with zero unresolved P0/P1.

`contracts-add-all-position-candidates` receives the next write for all further
`projection.go`/projection-test contract changes after this completed casing
correction. The lower-camel DTO mapping remains frozen and MUST be preserved.
