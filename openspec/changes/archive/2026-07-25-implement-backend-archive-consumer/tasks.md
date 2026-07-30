## Task Boundary

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: complete; implemented: complete; verified: owner, main-agent, and independent acceptance passed with no remaining P0-P2 finding; committed: determined by containing Git history; pushed/released/deployed: no |
| Owner | One backend owner applies; main agent reviews and accepts. |
| Writable paths | `backend/internal/archive/**`, `backend/internal/app/run.go`, `backend/internal/app/run_test.go`, `backend/cmd/api/main.go`, `backend/cmd/archive-smoke/**`, `backend/go.mod`, `backend/go.sum`, `backend/internal/architecture/dependencies_test.go`, `backend/scripts/check.sh`, `backend/README.md`, and this file's markers. |
| Read-only protected inputs | `contracts/**`, root specs, guides, all other code/changes, refs/remotes, hosts, production. |
| Deletion complement | None. |
| Mutable refs | None during apply. |
| Consumes | Approved artifacts, the corrected and string-hardened Archive/runtime root specs and shared corpus, and a caller-approved root. |
| Produces | Internal read-only consumer, startup assembly, pointer-free candidate-smoke CLI, tests, and guards. |
| Dependencies | Contract/runtime foundations, accepted/exited `correct-archive-subject-semantics` and `harden-archive-manifest-string-semantics`, Go `1.26.5`, and exact driver/libc pins. |
| Deliverables | Loader/store/state with exact timestamp/Unicode-scalar/surrogate, exhaustive raw non-null validation, JSON-Schema-integer parity, root/per-open identity binding, final cancellation gates, managed row draining, shared string-vector runtime proof, app lifecycle, dependency/inventory updates, and acceptance evidence. |
| Acceptance | Full corpus including every indexed manifest-string case through the real Go decoder; exhaustive null/integer parity, root/VFS rebound, final-cancel including lock wait, active-row shutdown, mutation/concurrency/lifecycle tests; full/race/vet/CGO-free build, strict validation, clean scope/residue. |
| Non-goals | HTTP, observability, producer, activation/reload/rollback, catalog/query, operations. |
| Operations deferred | Root convention, pointer switch, restart, scheduler, retention, release/deploy. |
| Stop/rollback conditions | Stop on mismatch; close unpublished resources and revert only owned bytes. Never use reset-hard, checkout rollback, clean, `git add -A`, broad deletion, external writes, stage, commit, archive, or push. |

## 1. Backend implementation

- [x] 1.1 Preflight branch/HEAD/index, allowed dirty paths, exact writable/protected inventory, dependency root specs, shared corpus hashes, and reviewed strict-valid artifacts; stop without mutation on mismatch.
- [x] 1.2 Record baseline backend checks, then pin `modernc.org/sqlite v1.54.0` plus resolved `modernc.org/libc v1.74.1` and update only the declared module, architecture, inventory/check, and README paths.
- [x] 1.3 Implement one-read strict pointer selection plus a shared pointer-free candidate loader, fatal UTF-8 before Go JSON parsing, raw isolated-surrogate rejection before `encoding/json` replacement, exact calendar-valid UTC generated-time validation, Unicode-scalar URL bounds, `os.Root` containment/type/symlink checks, fixed path derivation, fixed digest-before-format precedence, shared and consumer-only typed/sanitized error codes, dataVersion/digest/schema/object/count gates, minimal-golden-only exact sentinel assertions, and candidate cleanup.
- [x] 1.4 Implement a root-bound read-only `modernc.org/sqlite/vfs`, constructed `net/url` DSN, DELETE/no-sidecar immutable preconditions, four-connection pragma verification, bounded 4/4 pool, guarded single read statement, no-create/write/attach rejection, `integrity_check(1)`, and foreign-key check.
- [x] 1.5 Implement database/VFS/root close ordering, single-assignment atomic store/readiness, losing-candidate cleanup, idempotent shutdown, explicit `-archive-root` app/cmd assembly, and bounded pointer-free `archive-smoke` JSON output whose writer failure returns non-zero, without routes or observability.
- [x] 1.6 Test every indexed golden group and its fixture-scoped sentinels plus temporary missing/path/symlink/type/sidecar/write/pragma/attach/multi-statement/path-rebound/digest-precedence/schema/table/index/metadata/count mutation, pointer-free smoke without `current.json`, rejecting smoke output writer, pointer-one-read, publication race, cancellation, concurrent read, and repeated close cases.
- [x] 1.7 After `correct-archive-subject-semantics` and `harden-archive-manifest-string-semantics` exit, adapt fatal UTF-8 decoding and its pointer/manifest invalid-byte mutations, generated-time arithmetic, Unicode-scalar URL bounds, pre-decoder isolated-surrogate rejection, compiled constants, corrected sentinels, and actual `sqlite_schema` verification to the canonical 35-object seal; execute every indexed `manifest-string-semantics.json` case and exact `C3 28` recipe through the real Go decoder; exhaustively reject `null` for all required manifest/source/nested-count values; close final cancellation and archive-root/per-VFS-open rebound windows; drain Store-owned active rows before DB/VFS/root release; remove the undeclared listener flag; add weakened-definition and extra-object mutations; rerun the corrected closed corpus; then end the owner block by running targeted/full tests, a separate host-toolchain `go test -race ./...`, vet, ordinary `CGO_ENABLED=0` test/build, architecture/dependency/inventory guards, strict change/all validation, diff checks, and residue checks; report exact commands/status without staging.
- [x] 1.8 Preserve JSON Schema 2020-12 integer parity without binary floating point: accept exact zero-fraction and exponent spellings for every pointer/manifest/source/table-count/quality-count integer path, reject fractions and unsafe/overflowing magnitudes before later gates, add exhaustive real-decoder/loader regressions including the safe boundary and publication-lock cancellation, then rerun the owner material gates without staging.

## 2. Main-agent acceptance

- [x] 2.1 Recheck HEAD/index/allowed dirty state and artifact approval, audit the complete owned diff and direct authority usage, then rerun all material gates.
- [x] 2.2 Confirm zero out-of-scope or external mutation and accurately record investigated/implemented/verified/committed/pushed/released/deployed status; stop without stage, commit, archive, push, release, deploy, or later feature work.
