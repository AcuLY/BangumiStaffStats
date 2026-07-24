## Task Boundary

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: no; verified: main semantic/authority/path review and strict OpenSpec gates passed; committed/pushed/released/deployed: no |
| Owner | Contracts owner completes Group 1 and stops for main acceptance; only then one Backend owner completes Group 2; main agent performs Group 3 acceptance/lifecycle. |
| Writable paths | Planning plus the exact sequential Contracts and Backend sets enumerated in `proposal.md`; each owner may update only its own markers here. |
| Read-only protected inputs | Every protected path/state in `proposal.md`, including other owners' markers, Archive internals, module files, refs/remotes, external state, and production. |
| Deletion complement | None. |
| Mutable refs | None during apply. Main-owned later lifecycle is not an apply task. |
| Consumes | Three exited dependencies, accepted Contracts handoff, accepted Store/HTTP/observability and shared query/error wire. |
| Produces | Strict catalog OpenAPI/goldens, generated Go wire, read-only projection, exact route, runtime/telemetry tests, and review evidence. |
| Dependencies | Exactly `derive-position-catalog-and-cast`, `implement-backend-archive-consumer`, and `implement-backend-http-and-observability`; all exit before Group 1. Group 1 is main-accepted before Group 2. |
| Deliverables | All artifacts and implementation evidence required by the four delta specs. |
| Acceptance | Closed contract/generation, Go unit/fuzz/race/vet/build/architecture, existing-regression, strict OpenSpec/diff/inventory/residue gates. Browser acceptance is not applicable because this change renders no UI. |
| Non-goals | Query/statistics/cache/collection/UI, updater/Archive changes, active staff sets, operations, release, or deploy. |
| Operations deferred | Production roots/activation/reload/rollback, monitoring, release, deployment, migration, and cutover. |
| Stop/rollback conditions | Stop on dependency/review/index/dirty-path/owner/handoff drift or protected-path need. Never use reset-hard, checkout rollback, git clean, `git add -A`, broad recursive deletion, or external mutation; remove only exact owned disposable roots after containment checks. |

## 1. Contracts Owner — Exact Catalog API Wire

- [ ] 1.1 Preflight on the approved branch: record branch/HEAD, empty index, complete allowed dirty paths and active owners; prove the three exact dependencies are accepted/synchronized/archived and absent from active changes; prove this change is strict-valid and main-approved; stop before writes on any mismatch.
- [ ] 1.2 Update only `contracts/openapi/openapi.yaml` with the strict input-free `GET /catalog` operation and closed discriminated catalog components while preserving all existing paths/components and using bounds no narrower than the exited producer contract.
- [ ] 1.3 Create only `contracts/goldens/api/catalog/**` with a closed path/digest index, strict verifier/tool lock, success/error/unknown/dormant/synthetic cases, ordering/reference/capability matrices, exact tool/command identity, deterministic Go generation replay, declaration inventory, and compile evidence.
- [ ] 1.4 Run the catalog verifier from a clean owned tool state, OpenAPI validation, fatal-UTF-8/unknown-field/closed-inventory negatives, deterministic generation replay and temporary compile; verify every existing shared query component remains unchanged and leave owned cache/temp/install roots physically and index absent.
- [ ] 1.5 Run `openspec validate expose-dynamic-catalog --strict`, `openspec validate --all --strict`, `openspec doctor`, and `git diff --check -- openspec/changes/expose-dynamic-catalog contracts/openapi/openapi.yaml contracts/goldens/api/catalog`; report exact investigated/implemented/verified state and exact hashes, then stop unstaged for main-agent Contracts acceptance.

## 2. Backend Owner — Read-only Projection and Exact Route

- [ ] 2.1 Preflight anew: record branch/HEAD, empty index, allowed dirty paths/owners; verify the same three dependencies have exited, Group 1 is main-accepted with exact OpenAPI/index/case hashes, generation inputs match, and only the exact Backend paths are writable; stop on mismatch.
- [ ] 2.2 Generate only `backend/internal/httpapi/wire/catalog.gen.go` through the owned catalog generation/check scripts and add the exact compile/contract test; adapt only `backend/scripts/prepare-query-wire.mjs` so the existing query generator selects its accepted empty-path/query-component projection from the larger OpenAPI, and prove `query_wire.gen.go` stays byte-identical; do not modify Contracts, module files, or tool versions.
- [ ] 2.3 Implement `backend/internal/catalog/{catalog.go,store.go}` and tests: fixed `archive.Store` reads, exhaustive row/domain/reference validation, deterministic immutable DTO projection, rows/cancellation cleanup, all five types, dynamic/no-credit positions, groups/ordering, main/all, 101–106, empty and synthetic staff sets, capabilities, and every corruption case.
- [ ] 2.4 Implement the exact input-free catalog handler and route in the enumerated HTTP files, including complete-before-commit encoding, `no-cache` success, `no-store` errors, request-ID/dataVersion envelope, method/query/body rejection, not-ready/internal/deadline/cancel behavior, and no partial/empty fallback.
- [ ] 2.5 Integrate the read-only current-Store provider in the enumerated app files; extend only the closed catalog event/metric values in the enumerated observability files; update exact route/dependency inventory, check script, and scoped README while preserving health/image/startup/shutdown behavior.
- [ ] 2.6 Run every catalog API golden and targeted unit/property/fuzz test, catalog generation `--check`, full backend tests, `go test -race ./...`, `go vet ./...`, build, architecture route/dependency inventory, event redaction/exactly-once and metric parse/cardinality/concurrency tests; prove no new module, route, mutable Store API, cache, or protected-path drift.
- [ ] 2.7 Run the Contracts verifier plus `openspec validate expose-dynamic-catalog --strict`, `openspec validate --all --strict`, `openspec doctor`, `git diff --check -- openspec/changes/expose-dynamic-catalog contracts/openapi/openapi.yaml contracts/goldens/api/catalog backend`; verify exact physical/index inventory and zero owned cache/temp residue, report exact states, and stop unstaged for main review.

## 3. Main-agent Acceptance and Lifecycle

- [ ] 3.1 Review each owner block separately for authority, exact paths, generated-wire parity, unknown/dormant behavior, read-only Store use, HTTP/telemetry regressions, zero P0/P1 findings, test evidence, and honest status; return failures to the owning block without broadening apply.
- [ ] 3.2 After both blocks pass, run final strict contract/Go/OpenSpec/diff/inventory/residue acceptance and record implemented versus verified versus committed/pushed/released/deployed state. Sync/archive/stage/commit may occur only as a separate main-owned lifecycle action; push/release/deploy/activation remain unauthorized.
