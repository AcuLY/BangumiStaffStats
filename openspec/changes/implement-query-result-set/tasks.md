## Task Boundary

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: no; verified: main semantic/dependency/library review and strict validation passed; committed/pushed/released/deployed: no |
| Owner | One Contracts subagent owns group 1; after its accepted handoff, one Backend subagent owns group 2; the main agent alone owns specification decisions and group 3 acceptance. |
| Writable paths | Contracts: `contracts/goldens/query-domain/**` and this file's group 1 markers. Backend: `backend/internal/query/**`, `backend/go.mod`, `backend/go.sum`, `backend/internal/architecture/dependencies_test.go`, `backend/scripts/check.sh`, `backend/README.md`, and this file's group 2 markers. Main acceptance may change only this file's group 3 markers. |
| Read-only protected inputs | `PRODUCT.md`, `DESIGN.md`, `tmp-formal-development/**`, all root specs and other changes, `contracts/openapi/**`, `contracts/schemas/**`, other golden roots, accepted catalog goldens, `backend/internal/archive/**`, `backend/internal/httpapi/**`, every other backend/frontend/updater path, `.vscode/**`, Git refs/remotes, other repositories, hosts, and production. |
| Deletion complement | None; no existing path may be deleted, renamed, or replaced outside an owned writable root. |
| Mutable refs | None during apply; owners do not stage, commit, archive, update a branch/ref, push, release, or deploy. |
| Consumes | Accepted query schemas/vectors, corrected Archive v1 subject facts, published `archive.Store`, typed catalog selection plans/exact cast facts, and bounded immutable collection overlays. |
| Produces | A closed query-domain golden corpus and verifier; a Go Effective Query/digest normalizer and deterministic raw result-set authority with exact contribution evidence. |
| Dependencies | `define-shared-query-wire`, `correct-archive-subject-semantics`, `implement-backend-archive-consumer`, and `derive-position-catalog-and-cast`; all four must be accepted and exited before group 1 apply. |
| Deliverables | `contracts-query-goldens`, `backend-query-result-set`, pinned Unicode/JCS dependencies and gates, tests, architecture/inventory checks, and documentation. |
| Acceptance | Existing normalization/digest/Unicode/RFC 8785 vectors, all new goldens, Archive/catalog integration, scope isolation, cancellation/read-only/determinism/race evidence, full Backend gates, strict OpenSpec validation, and clean owned diffs. |
| Non-goals | Final statistics, series aggregation, search/rank/sort/page, HTTP/DTO work, collection fetching/admission, caching, frontend work, Archive production, or contract/schema repair. |
| Operations deferred | Activation, scheduling, services/proxies, monitoring rollout, production data roots/secrets, migration, release, deployment, cutover, and legacy removal. |
| Stop/rollback conditions | Stop before mutation on branch/HEAD/dependency/review/path/dirty-state drift. Stop on golden, authority, SQL, scope, dependency/license, or acceptance failure. Rollback may remove only the owner's unstaged new files or reverse its exact unstaged hunks; preserve dependency candidates and protected state. `reset --hard`, checkout-based rollback, `git clean`, `git add -A`, broad recursive deletion, outside-path writes, and external mutation are forbidden. |

## 1. Contracts Query-Domain Goldens

- [ ] 1.1 Preflight `codex/formal-rewrite`: record the exact dependency-complete `HEAD`, prove all four dependencies are accepted/exited, verify every planning artifact is strict-valid and main-reviewed, inventory the index plus allowed dirty paths, and stop without mutation unless the Contracts writable set is disjoint and clean.
- [ ] 1.2 Add a hash-indexed, JSON-only corpus and zero-dependency verifier under `contracts/goldens/query-domain/**`; cover both scopes, every accepted filter boundary, staff/cast/staff-set evidence, multi-position AND, identity work union, participant intersection, cancellation, deterministic ordering, and bounded `442 != 449` provenance without copying bulk personal fixtures.
- [ ] 1.3 Run the corpus verifier twice, verify manifest hashes and referential closure against accepted query/catalog/Archive inputs, run `git diff --check -- contracts/goldens/query-domain openspec/changes/implement-query-result-set/tasks.md`, and hand off only the unstaged owned diff with investigated/implemented/verified states and exact commands/results recorded.

## 2. Backend Query Result Set

- [ ] 2.1 Preflight `codex/formal-rewrite`: record `HEAD`, verify the accepted Contracts handoff and all four dependencies, hash the read-only authorities, inventory index/dirty state, and stop without mutation unless the Backend writable set is disjoint and the reviewed golden candidate is unchanged.
- [ ] 2.2 Pin `golang.org/x/text v0.40.0` and `github.com/gowebpki/jcs v1.0.1`; implement raw-JSON normalization with `json.Number`, the Unicode 15.1 assigned-scalar/NFKC/default-fold gates, RFC 8785 canonicalization, Effective Query projection, and `queryDigest`, with generated-table drift, license, module, vector, and binary-size tests.
- [ ] 2.3 Implement cancellation-aware fixed bound reads through `archive.Store`, immutable personal-overlay injection, corrected scope/NSFW/date/score/rating-count/tag/status/update filtering, typed catalog selection-plan resolution, exact staff/cast/staff-set evidence, and stable candidate/identity/ranking/participation set algebra without HTTP, cache, statistics, series, search, sorting, or pagination.
- [ ] 2.4 Consume every query-domain golden directly in Go and add focused Archive integration, global-no-collection-access, personal isolation, read-only/no-partial-result, shuffled-order determinism, repeated-run, and cancellation tests; update only the declared architecture check, Backend check script, and README inventory.
- [ ] 2.5 From `backend/`, run `go test ./internal/query/...`, `go test ./...`, `go test -race ./...`, `go vet ./...`, `go build ./...`, `go mod verify`, and `GO_BOOTSTRAP=/opt/homebrew/bin/go ./scripts/check.sh`; also run the corpus verifier twice, dependency/license/generated-table/binary-size gates, `git diff --check` on owned paths, and targeted plus repository-wide strict OpenSpec validation. Hand off only the unstaged owned diff with exact investigated/implemented/verified/committed/pushed/released/deployed states.

## 3. Main-Agent Acceptance

- [ ] 3.1 Audit the complete Contracts and Backend diff against the authority order, writable-path inventory, dependency hashes, behavior classifications, golden expectations, scope isolation, fixed read-only SQL, dependency rationale, and non-goals; reject any expectation changed merely to match implementation.
- [ ] 3.2 Re-run both corpus passes, all Backend targeted/full/race/vet/build/check gates, `git diff --check`, `openspec validate implement-query-result-set --strict`, `openspec validate --all --strict`, and `openspec doctor`; record specified/implemented/verified/committed/pushed/released/deployed separately and authorize lifecycle work only after zero P0/P1 findings.
