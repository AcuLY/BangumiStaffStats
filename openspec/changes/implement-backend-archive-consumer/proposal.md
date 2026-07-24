## Why

The backend foundation only checks Archive contract evidence; it cannot open a real immutable snapshot or gate startup. This change adds the Wave 2 read-only consumer required by later catalog and query work.

## What Changes

- Strictly parse one `current.json` for runtime selection, while exposing the
  same fixed-path validation as a pointer-independent development smoke for an
  inactive producer candidate.
- Decode pointer and manifest files from fatal UTF-8 bytes before JSON parsing;
  malformed source bytes cannot become replacement characters even when all
  surrounding shapes and digests are otherwise valid.
- Enforce the accepted `harden-archive-manifest-string-semantics` contract at
  the real Go manifest boundary: exact calendar-valid UTC `generatedAt`,
  Unicode-scalar URL bounds, raw isolated-surrogate rejection before
  `encoding/json` replacement, and the shared indexed string vector.
- Validate manifest/digest/version/object/count and SQLite invariants, keep the
  compatibility matrix's exact sentinel values scoped to its minimal golden,
  then open SQLite read-only/no-create.
- Keep readiness false and close every candidate handle on failure; close the published store once during application shutdown.
- Add a bounded `archive-smoke` CLI plus full shared-golden, mutation,
  concurrency, race, and lifecycle tests.

Behavior classification: `NEW_CAPABILITY`. The prototype oracle `644b7748674e553f863d0ffd61d029f86fdc0717` has no runtime Archive consumer or visible behavior to preserve.

## Capabilities

### New Capabilities

- `backend-archive-consumer`: Strict immutable Archive loading, validation, atomic publication, readiness state, and lifecycle.

### Modified Capabilities

None.

## Impact

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: no; verified: independent driver review, main semantic audit, targeted/all strict validation, and doctor passed; committed: determined by containing Git history; pushed/released/deployed: no |
| Owner | Backend owner implements; main agent reviews and accepts. |
| Writable paths | Planning: `openspec/changes/implement-backend-archive-consumer/**`. Apply: `backend/internal/archive/**`, `backend/internal/app/run.go`, `backend/internal/app/run_test.go`, `backend/cmd/api/main.go`, `backend/cmd/archive-smoke/**`, `backend/go.mod`, `backend/go.sum`, `backend/internal/architecture/dependencies_test.go`, `backend/scripts/check.sh`, `backend/README.md`, and this change's task markers. |
| Read-only protected inputs | `contracts/**`, root `openspec/specs/**`, formal guides/master plan, `PRODUCT.md`, `DESIGN.md`, all other backend/frontend/updater files, other changes, Git refs/remotes, hosts, and production. |
| Deletion complement | None; no existing file or authority may be deleted. |
| Mutable refs | None during apply; no stage, commit, archive, branch/ref mutation, or push. |
| Consumes | The accepted `correct-archive-subject-semantics` and `harden-archive-manifest-string-semantics` revisions of `contracts-archive-manifest`, `backend-runtime-foundation`, the corrected shared goldens, and a caller-approved local Archive root. |
| Produces | One internal read-only store/readiness state, startup assembly, and development-only candidate-smoke CLI; no HTTP, producer, activation, or operations artifact. |
| Dependencies | Implemented `define-archive-manifest-contract` and `bootstrap-backend-runtime`, plus accepted/exited `correct-archive-subject-semantics` and `harden-archive-manifest-string-semantics` before final consumer acceptance; exact Go `1.26.5`; pinned SQLite dependencies named in design. |
| Deliverables | Consumer package with fatal UTF-8 contract decoding, exact generated-time/Unicode-scalar/surrogate validation, shared manifest-string vector execution, and canonical actual-SQLite schema-object seal verification; minimal startup wiring, candidate-smoke CLI, dependency/architecture/check updates, and tests. |
| Acceptance | Corrected shared valid/invalid goldens and all indexed manifest-string cases through the real Go decoder, invalid-UTF-8 pointer/manifest mutations, weakened-definition/extra-object mutations, extra path/write/concurrency/lifecycle cases, `go test ./...`, `go test -race ./...`, vet/build, dependency/inventory checks, strict change/all validation, and no residue. |
| Non-goals | Archive production or activation, pointer switching/hot reload/rollback, HTTP/readiness routes, observability, catalog/domain/query behavior, operations, deployment, or legacy work. |
| Operations deferred | Production roots, scheduling, activation, restart, rollback, retention, systemd/Compose/nginx, release, and deployment remain later work. |
| Stop/rollback conditions | Stop on authority/dependency/path drift, overlapping writes, or a failed gate. Close the unpublished candidate, keep not-ready, and revert only this owned candidate; never rewrite protected input or external state. |

Official dependency research is read-only; this change touches no other repository or external mutable state. Apply remains blocked until all four artifacts strictly validate and pass main-agent review.
