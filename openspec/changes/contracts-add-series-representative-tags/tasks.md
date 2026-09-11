## Task Boundary
| Field | Boundary |
|---|---|
| Status | Implemented and focused checks passed; complete component gates remain blocked by the recorded existing failures |
| Owner | Primary specification/acceptance/frontend owner; delegated contracts/backend owner |
| Writable paths | This change; contracts/schemas/{person-detail,co-star}/success-envelope-v1.schema.json; contracts/goldens/api/{person-detail,co-star}/{cases/*.json,verify.mjs}; backend/internal/{persondetail,costar}/{types.go,build.go,projection.go,clone.go,cache.go,build_test.go,cache_test.go,view_test.go}; backend/internal/httpapi/wire/{person_detail,co_star}.gen.go; frontend/src/api/generated/{person-detail,co-star}/{types.gen.ts,schemas.gen.ts}; frontend/src/features/person-detail/components/PersonItemBrowser.vue; frontend/src/features/co-star/components/CoStarWorkBrowser.vue; frontend/tests/{api/{person-detail,co-star}.test.ts,features/{person-detail/components,co-star/co-star-components}.test.ts}; tmp-formal-development/backend-development-implementation-guide.md; exact affected root specs |
| Read-only protected inputs | PRODUCT.md, DESIGN.md, accepted data decisions, Archive store/schema, query/statistics, other active changes and recent user UI edits |
| Deletion complement | Retain all names, member order, dates used for sorting, roles/counts, pagination, tag summaries, metrics and request budgets |
| Mutable refs | None; current master worktree only |
| Consumes | Existing representative ID and subject meta tags already loaded in fact sets |
| Produces | Required bounded metaTags on both personal/global series work variants of both operations |
| Dependencies | Contracts -> Backend -> Frontend; no new dependency |
| Deliverables | Reviewed specifications, schemas/goldens/generated consumers, production projections and UI, test/browser evidence |
| Acceptance | Schema/golden validation, generated drift checks, representative-vs-member and empty-tag tests, affected backend/frontend gates, browser series cards |
| Non-goals | Change representative selection, aggregate tag semantics, Archive schema/dataVersion, statistics, runtime budgets, unrelated audit issues |
| Operations deferred | Production deployment, external services, Git commit/push/merge/release; local runtime validation recorded separately |
| Stop/rollback conditions | Conflicting user/concurrent edit, expanded query/statistics semantics, changed generated isolation or failed acceptance; no destructive rollback |

Forbidden: reset --hard, checkout rollback, git clean, git add -A, broad deletion, undeclared writes and external/production mutation.

## 1. Contracts and Backend — delegated owner
- [x] 1.1 Recheck master/HEAD/dirty slices and primary-reviewed strictly valid artifacts; preserve concurrent UI changes.
- [x] 1.2 Add the required series metaTags fields to both operation schemas and representative/empty/invalid goldens; validate them.
- [x] 1.3 Carry representative meta tags through persondetail and costar build/projection/cloning/accounting; add focused provenance/empty/cache regressions.
- [ ] 1.4 Regenerate isolated Go and TypeScript consumers using pinned toolchains; run operation golden and focused backend checks, then the affected backend gate. Report any baseline failures without deleting unrelated files.

## 2. Frontend — primary owner
- [x] 2.1 Recheck current component diffs and completed concurrent NTag work before editing the series branches.
- [x] 2.2 Render returned representative tags in both series card lists using their current NTag metadata geometry; update exact consumer regressions.
- [ ] 2.3 Run generated checks, focused frontend regressions, typecheck/build and full affected gate; verify personal/global series cards and empty tags in desktop/mobile browser.

## 3. Acceptance and lifecycle — primary
- [x] 3.1 Audit exact production/schema/generated/test changes, record local runtime readiness and distinguish it from production deployment.
- [x] 3.2 Sync the accepted deltas to the six root specs and validate all specs strictly.
- [ ] 3.3 Archive only when all required acceptance is green; the existing full-gate blockers remain unresolved.

## Planning review
Primary reviewed field placement, two-operation coverage, representative provenance, no Archive/schema/statistics change, generator isolation and concurrent frontend ownership. Strict validation remains required before apply.

## Contracts / Backend evidence

- Rechecked current master at `3612f50b25e5a4324823fb576bdfdbb4553a3bff` and the scoped dirty state; existing profile/scatter/query/UI changes remain intact. OpenSpec apply state was ready after primary strict validation/review.
- Pinned Node 24.18.0: person-detail golden verifier passed 13 cases; co-star verifier passed 6 cases. Both operation verifiers additionally exercise both series scope schemas for representative metadata, empty arrays, Unicode scalar limits, missing/null/duplicate/empty/oversized values and arrays above 16 entries.
- Fixed Go 1.26.5 on Windows: `go test ./internal/persondetail ./internal/costar` passed. Added actual build/projection tests for representative-only tags, an unmatched representative, both scopes and empty arrays; cache cloning and retained string/slice costs are covered. Owned `git diff --check` passed.
- Both existing Go generators completed `--write` and `--check` with pinned Node 24.18.0/npm 11.16.0 and Go 1.26.5: person-detail under WSL/Linux and co-star under Git Bash/Windows. The generated diffs retain the previously accepted scatter/query schema changes. TypeScript generation is explicitly reserved for the primary agent's coordinated producer/consumer handoff; no frontend files or services were changed by this implementation block.
- A wider source-tree `go test ./internal/persondetail ./internal/costar ./internal/httpapi/wire` retained green operation packages but failed the pre-existing `TestCatalogGeneratedWireIsCatalogOnlyAndCurrent` fixed catalog digest expectation (actual `8004c0bda795efc5ee659d09f87bd2b248cb2690731c87d6107cca1200dd4434`). No unrelated generated catalog file or assertion was changed.
- Primary authorized the independent ordinary validation copy at `.tmp/design-audit-fixes/backend-check/`. It contains 1,410 current tracked regular files and explicitly required new tests/specification/tooling files (19,700,294 bytes), copied without hard links, runtime caches, logs, credentials or live/user data. Published runtime stores are excluded; small version-controlled contract fixtures remain test inputs. Source bytes were preserved initially. Before gate execution, both cleanup targets were verified as exactly this copy's `backend/.cache` and `backend/.tmp`; the source `backend/.tmp/person-profile-v2` remains untouched.
- The unmodified gate's raw-byte attempt stopped on CRLF in `check-toolchain-mode.sh:2` (`$'\\r': command not found`); log: `.tmp/design-audit-fixes/backend-check/backend-gate.log`. A subsequent validation-only export normalized 799 UTF-8 text files to LF within the copy; source workspace bytes were not rewritten.
- The LF gate passed all seven Go wire generation drift checks, formatting/mod-tidy checks, HTTP API/observability/app/publiccollection/architecture/query/ranking/candidates/persondetail/partners/costar/runtimecache tests, the repeated cache/statistics runs, fuzz checks, statistics benchmarks and `internal/httpapi/wire` tests (including the previously CRLF-blocked catalog digest). It then failed at `go test ./internal/archive/contracttest`: that directory does not exist in the current controlled source. No obsolete gate command was removed and no substitute package was introduced. Remaining archive/all-package/race/vet/build/inventory gates were not reached. Log: `.tmp/design-audit-fixes/backend-check/backend-gate-lf.log`. Full Backend acceptance remains blocked by this pre-existing script/inventory mismatch.
- The gate exited with status 1 and completed its own cleanup: the validation copy's `backend/.cache` and `backend/.tmp` are absent, while the original `backend/.tmp/person-profile-v2` still exists. Final owned-path `git diff --check` passed. Task 1.4 remains unchecked for the primary's TypeScript handoff and explicit full-gate disposition.

## Primary integration evidence — 2026-09-09

- Frontend series NTag rendering and both TypeScript consumers are implemented. Final person-detail/co-star generated drift checks passed with Node 24.18.0. The representative/empty-field golden and Backend provenance/clone/accounting checks above remain acceptance evidence.
- Latest full Vitest passed 45 files / 507 tests with maxWorkers=2. Latest vue-tsc and production build passed. Individual field/unit tests passed; tasks 1.4 and 2.3 remain unchecked only for the unresolved complete component-gate portions and any browser state not explicitly recorded.
- The user manually restored the B2 local API. Personal series cards in both surfaces and global co-star/person-detail series cards now render representative tags. Global candidates, co-star, rankings and person-detail returned HTTP 200; /readyz returned ready with the existing dataVersion. Empty tags are covered by tests; no synthetic empty-tag browser scenario is claimed.
- The six accepted deltas are synchronized into root specifications. All 87 specifications/changes passed strict validation. The two ambiguous empty-tag sentences were clarified to explicitly require [] when the representative has no tags; schema/data semantics are unchanged.
- Full Frontend acceptance is still blocked: the latest production initial-JS gzip is 309511 bytes against a 307200 budget. Full Backend check.sh is still blocked at its existing absent internal/archive/contracttest target. Neither constraint was bypassed or weakened; the change remains active and unarchived.
- Scoped git diff --check passed after preserving tracked LF in owned files. Unrelated shared-worktree edits are retained. No Git integration or production deployment occurred.
- Detailed evidence and remaining runtime work: C:/Users/26552/.codex/visualizations/2026/09/08/01a07fbe-21f1-7a13-801f-bff6dfd1b44e/design-fixes/progress.md.
