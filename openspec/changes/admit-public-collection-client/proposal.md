## Why

Personal-scope services already own bounded collection/result caches, but the
production app still passes a nil collection provider. The locally accepted
anonymous client must be consumed through its fixed public `v0.1.0` contract
so personal rankings, candidates, detail, partners, and co-star requests can
run without fixtures or credentials.

## What Changes

- Add one thin backend adapter from package `collection` at module
  `github.com/AcuLY/bangumi-collection-go` `v0.1.0` to the internal immutable
  collection snapshot.
- Map closed subject/status enums, every DTO field, and sanitized upstream
  failures without leaking external types into handlers or caches.
- Construct one concurrency-safe anonymous client for the process and wire the
  same provider into every personal-scope service.
- Pin the public module tag in `backend/go.mod` with no `replace`.

## Capability

### New Capability

- `backend-public-collection-source`: admitted anonymous collection source for
  all production personal-scope operations.

## Impact

| Boundary | Declaration |
|---|---|
| Status | Investigated/specified/main-agent reviewed: complete; dependency publication/implemented/verified/committed: no. Apply is gated on a public immutable `v0.1.0`. |
| Owner | One backend implementation agent after `expose-co-star` releases shared app wiring; main agent owns spec edits and acceptance. |
| Writable paths | `backend/internal/publiccollection/**`, `backend/internal/app/run.go`, `backend/internal/app/run_test.go`, `backend/go.mod`, `backend/go.sum`, narrowly required backend architecture/check inventory, and this change's task markers. |
| Read-only protected inputs | External repository worktree and refs during main-repo apply; external client source/tag; existing service/cache/query/statistics packages; contracts/frontend/updater; other OpenSpec changes; remotes and operations state. |
| Consumes | Fixed public external module `v0.1.0`; accepted internal `runtimecache.CollectionSnapshot`/failure contract; ranking, candidates, person-detail, partners, and co-star provider interfaces. |
| Produces | One tested adapter and one process-wide anonymous provider wired to all five production services. |
| Dependencies | `harden-bangumi-collection-go-v0-1-0` published as fixed public `v0.1.0`; `implement-query-result-set`; explicit shared-path handoff from `expose-co-star`. |
| Deliverables | Enum/field/error mapping, empty collection behavior, production assembly, consumer contract tests, fixed module checksum. |
| Acceptance | No credentials or auth headers; exact mapping and error matrix tests; all personal routes exercise the same injected provider; full backend check/race/vet/build; clean module graph with `v0.1.0` and no `replace`. |
| Non-goals | OAuth/private collections, client retry/cache duplication, external-client changes, handler DTO changes, new environment configuration, operations, deployment, or release of the main repository. |
| Stop conditions | Stop before apply if `v0.1.0` is absent/mutable/incompatible, a shared app owner remains active, a mapping needs an unapproved client change, or formal module resolution needs a local replace/pseudo-version. |
| External state | Main-repo apply performs no external mutation. Pushing/tagging the external repository is a separate explicitly authorized lifecycle action. |
