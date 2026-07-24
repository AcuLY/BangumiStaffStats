## Task Boundary

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: no; verified: independent driver review, main semantic audit, targeted/all strict validation, and doctor passed; committed: determined by containing Git history; pushed/released/deployed: no |
| Owner | One backend owner applies; main agent reviews and accepts. |
| Writable paths | `backend/internal/archive/**`, `backend/internal/app/run.go`, `backend/internal/app/run_test.go`, `backend/cmd/api/main.go`, `backend/go.mod`, `backend/go.sum`, `backend/internal/architecture/dependencies_test.go`, `backend/scripts/check.sh`, `backend/README.md`, and this file's markers. |
| Read-only protected inputs | `contracts/**`, root specs, guides, all other code/changes, refs/remotes, hosts, production. |
| Deletion complement | None. |
| Mutable refs | None during apply. |
| Consumes | Approved artifacts, Archive/runtime root specs, shared corpus, caller-approved root. |
| Produces | Internal read-only consumer, startup assembly, tests, and guards. |
| Dependencies | Contract/runtime foundations, Go `1.26.5`, exact driver/libc pins. |
| Deliverables | Loader/store/state, app lifecycle, dependency/inventory updates, acceptance evidence. |
| Acceptance | Full corpus and mutation/concurrency/lifecycle tests; full/race/vet/CGO-free build, strict validation, clean scope/residue. |
| Non-goals | HTTP, observability, producer, activation/reload/rollback, catalog/query, operations. |
| Operations deferred | Root convention, pointer switch, restart, scheduler, retention, release/deploy. |
| Stop/rollback conditions | Stop on mismatch; close unpublished resources and revert only owned bytes. Never use reset-hard, checkout rollback, clean, `git add -A`, broad deletion, external writes, stage, commit, archive, or push. |

## 1. Backend implementation

- [ ] 1.1 Preflight branch/HEAD/index, allowed dirty paths, exact writable/protected inventory, dependency root specs, shared corpus hashes, and reviewed strict-valid artifacts; stop without mutation on mismatch.
- [ ] 1.2 Record baseline backend checks, then pin `modernc.org/sqlite v1.54.0` plus resolved `modernc.org/libc v1.74.1` and update only the declared module, architecture, inventory/check, and README paths.
- [ ] 1.3 Implement one-read strict pointer/manifest decoding, `os.Root` containment/type/symlink checks, fixed runtime path derivation, shared and consumer-only typed/sanitized error codes, dataVersion/digest/schema/object/sentinel/count gates, and candidate cleanup.
- [ ] 1.4 Implement the exact `net/url` DSN, DELETE/no-sidecar immutable preconditions, four-connection pragma verification, bounded 4/4 pool, no-create/write rejection, `integrity_check(1)`, and foreign-key check.
- [ ] 1.5 Implement single-assignment atomic store/readiness, losing-candidate cleanup, idempotent shutdown, and explicit `-archive-root` app/cmd assembly without routes or observability.
- [ ] 1.6 Test every indexed golden group plus temporary missing/path/symlink/type/sidecar/write/schema/table/index/metadata/sentinel/count mutation, pointer-one-read, publication race, cancellation, concurrent read, and repeated close cases.
- [ ] 1.7 End the owner block by running targeted/full tests, a separate host-toolchain `go test -race ./...`, vet, ordinary `CGO_ENABLED=0` test/build, architecture/dependency/inventory guards, strict change/all validation, diff checks, and residue checks; report exact commands/status without staging.

## 2. Main-agent acceptance

- [ ] 2.1 Recheck HEAD/index/allowed dirty state and artifact approval, audit the complete owned diff and direct authority usage, then rerun all material gates.
- [ ] 2.2 Confirm zero out-of-scope or external mutation and accurately record investigated/implemented/verified/committed/pushed/released/deployed status; stop without stage, commit, archive, push, release, deploy, or later feature work.
