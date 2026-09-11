## Task boundary

| Boundary | Declaration |
|---|---|
| Status | Specified; main-agent reviewed; strict validation required before apply |
| Owner | backend_design for contracts/backend/generated consumers; primary for frontend/docs/acceptance; primary may delegate non-overlapping presentation files |
| Writable paths | Exact Owned files in design.md plus this change and two declared accepted specs |
| Read-only protected inputs | Other dirty work, active changes, archive data, operations and guides |
| Deletion complement | None |
| Mutable refs | None; master 3612f50 |
| Consumes | Approved interaction and existing Query/identity authorities |
| Produces | Working linked workspaces and validation evidence |
| Dependencies | Contract -> generators -> producers/consumers -> final acceptance |
| Deliverables | Code/tests/docs and synchronized archived OpenSpec |
| Acceptance | Commands below and browser evidence |
| Non-goals | Dependencies, formulas, new routes, third column, persisted responses |
| Operations deferred | No live or external changes |
| Stop/rollback conditions | Stop conflicting concurrent writes/authority mismatch; exact hunks only; forbid reset --hard, checkout rollback, git clean, git add -A and broad deletion |

## 1. Contracts and backend
- [x] 1.1 Preflight master/HEAD/dirty baseline and verify reviewed strict-valid artifacts before editing owned files.
- [x] 1.2 Add identity-scoped person-detail input and ranking location schemas, generate affected consumers with existing tools.
- [x] 1.3 Implement scoped evidence/cache admission and exact ranking location, including null membership/search behavior.
- [x] 1.4 Run focused Go and golden tests; record results.

## 2. Frontend
- [x] 2.1 Preflight master/HEAD/dirty baseline and verify reviewed strict-valid artifacts before editing owned files.
- [x] 2.2 Add typed isolated preview requests and backend ranking location mapping with latest-response protection.
- [x] 2.3 Add detail actions and responsive co-star card/drawer, preserve mounted analysis and return scroll/focus.
- [x] 2.4 Connect ranking-to-partners and exact ranking location through ordinary Header navigation without origin state or applying Draft.
- [x] 2.5 Add integration/regression tests and update PRODUCT.md, DESIGN.md and frontend/ARCHITECTURE.md.

## 3. Acceptance and lifecycle
- [ ] 3.1 Run frontend npm ci --ignore-scripts --no-audit --no-fund and npm run check using pinned Node/npm; run backend ./scripts/check.sh and node --test contracts/artifacts/test/*.test.mjs.
- [x] 3.2 Verify rendered desktop/narrow/959-960px behavior, keyboard/return/selection changes, console and build; distinguish live API and fixture evidence.
- [x] 3.3 Audit owned diff, synchronize three accepted specs, and run strict validation; record repository-wide diff hygiene separately from owned paths.
- [ ] 3.4 Resolve remaining acceptance blockers before archive; do not mark failed gates passed.

## Review

Primary review 2026-09-09: behavior matches explicit user approval; ownership is bounded; no competing change owns cross-module links. Existing dirty changes are inputs and remain preserved. No new dependencies, external writes or ref changes. Identity scope is explicit, rankings remain server authoritative, and asynchronous navigation is invalidated on query/selection/mode change. Approved to apply once strict validation passes.

## Evidence

Single-person surface correction (2026-09-09): measured the single panel's transparent override, 16px top padding and nested 20px list padding against the multi-person panel. Partners now inherits the shared surface-panel appearance, uses 12/16/16px overview and 16px body sections at desktop, and 0/12/16px overview plus 16/12px body sections below 780px. Removed nested list padding and aligned plain section heading line-height/margin. Moved the summary container query to its actual inner width to preserve the prior responsive leader behavior. Ready and full loading surfaces share these selectors. Browser confirmed rgb(250,250,251) at 961px, matching multi-person; 390px retained the shared transparent mobile shell and no overflow. Original participant selection and viewport restored. Typecheck, final production build and owned diff hygiene passed.

Implemented and functionally verified on master 3612f50 with all prior dirty work retained. Not committed, pushed, merged, released or deployed. Specs synchronized; archival intentionally pending unsuccessful complete gates.

Passed:
- Pinned Node v24.18.0 / npm 11.16.0. npm ci --ignore-scripts --no-audit --no-fund passed after temporarily stopping the exact owned 5174 Vite process which held the rolldown native library; 5174 was restored.
- Frontend npm run test: 47 files / 531 tests passed. After final focus/unique-ID corrections, focused app/inspector/workspace tests: 3 files / 45 passed. Final snapshot-admission guard: 11/11 workspace tests passed. Typecheck and final Vite production build passed.
- All seven frontend wire generation checks passed (query, catalog, rankings, candidates, person-detail, partners, co-star).
- Backend go test ./internal/persondetail ./internal/ranking ./internal/httpapi passed; relevant wire tests passed. Rankings/person-detail goldens including added structural positive/negative cases passed. Shared-query verifier passed 113 goldens, 95370 NFKC assertions, 44170 cross-validations and repeated generation checks.
- Strict OpenSpec validation passed 90/90 (35 changes, 55 specs).
- Owned code/docs/contracts/spec paths pass git diff --check. Repository-wide diff check still reports pre-existing CRLF whitespace in openspec/specs/frontend-ranking-results/spec.md; no edits made there.

Rendered verification:
- Browser skill/plugin absent; bundled Playwright Chromium used under frontend-testing-debugging. No application fixtures used for browser acceptance.
- Built current linux/amd64 production API plus a disposable QA entrypoint with ArchiveUpdater:nil. QA listens on 127.0.0.1:8081 and reads /root/.local/share/bgmss-local/archive via SQLite mode=ro/query_only. Existing 8080 backend and Archive scheduler unchanged.
- Development browser used 5174 with browser request forwarding to the read-only 8081 API; then production artifact independently verified at http://127.0.0.1:5175/v2/ with /v2/api proxy to 8081, without browser interception.
- Real global director Query returned 3430 people / 14581 works. Followed Joseph Barbera into single-person partners; opened William Hanna detail inline, verified authoritative rank 2, navigated to selected Person ID 49038 in ranking and returned to Barbera analysis.
- Widths 360,390,768,779,780,781,917,959 use one drawer; 960,1024,1185,1440 use one inline detail card after media-query settlement. All had no horizontal overflow. Light/dark checked. No page errors or duplicate IDs in detail states. Keyboard Enter, Escape, 959/960 transitions, restored original detail-trigger focus and released background inert verified.
- Screenshots: supplied visualization workspace person-links-desktop.png, person-links-mobile.png, person-links-dark.png.

Incomplete complete gates (not reported passed):
- frontend npm run check stops on existing exact-inventory extras vite-dev.err.log and vite-dev.out.log. New source/test files were registered; logs preserved.
- check:query-unicode fails DerivedAge.txt fixed hash (existing authority unchanged).
- check:artifact after build reports initial JavaScript gzip 312956 >= 307200 bytes. This remains a release acceptance blocker; no budget increase or dependency change made.
- frontend artifact:test: 5/8 pass, remaining fail VERSION requires v0.1.0 plus LF. Contracts artifact tests: 28/48 pass, failures include the same VERSION CRLF authority and Windows temporary Git-root assertions. Those inputs/validation behavior were not modified by this feature.
- backend scripts/check.sh stops in unchanged generate-catalog-wire.sh:100 because shasum is unavailable in Git Bash. Full wire tests also hit unchanged catalog_contract_test.go:65 fixed hash; relevant wire tests independently passed.

### Environment correction follow-up, 2026-09-09

This follow-up supersedes the environment diagnoses above, without claiming complete acceptance.

- Moved the two Vite logs into ignored `frontend/.cache/diagnostic-logs-20260909/`, retaining their contents.
- Restored LF bytes for VERSION, official Unicode inputs, catalog generated Go, the reported 83 Go formatting failures, and affected artifact/schema fixtures. Original-byte restorations were checked against Git HEAD or the accepted producer manifest before writing. Added scoped `.gitattributes` rules to prevent recurrence. Regenerated the Unicode TypeScript table with the pinned generator.
- Replaced the catalog generator's `shasum` invocation with SHA-256 from its already-required Node runtime; the expected digest is unchanged.
- Normalized Git's root path separators before canonical path comparison on Windows. Added a nested-root rejection regression and isolated POSIX FIFO/permission assertions as an explicit Windows skip; portable non-regular-file and Git-mode rejection still run.
- Removed the linked workspace's direct generated Query type import; derive the input type from its existing coordinator driver boundary. No runtime behavior changed.
- Passed using Node 24.18.0: frontend architecture, Unicode drift, typecheck, and 11/11 workspace-link tests. Contracts artifact suite: 49 passed, 0 failed, 1 explicit POSIX-only skip on Windows.
- Backend full check passed all seven wire generation checks, then stopped on checkout CRLF formatting. After restoring those exact Git-equivalent Go bytes, Go 1.26.5 `gofmt -l cmd internal` returned no paths and `go test ./internal/httpapi/wire` passed. The remainder of the full backend gate was not rerun.
- Frontend artifact tests now expose a separate authority mismatch: current OpenAPI hashes to `sha256:999272f4fcd204c1dfecbe1948c77abcf29230dc1e8a76eb7549c386cab09260`, while the accepted artifact constant remains `sha256:e7aba7c34b0d6f74e533e8e9fd31c8f0aa40ed15c440669ec87a7204c963cf11`. Three artifact tests remain failed. This needs contract/artifact reconciliation, not a relaxed environment check.
- Initial JavaScript budget remains unchanged. The 300 KiB threshold predates this feature (commit `1937357`, 2026-07-24; accepted frontend-foundation spec).
- Follow-up owned diff hygiene passed; unrelated existing whitespace in DESIGN.md and co-star presentation/test files remains outside this correction. No commit, push, archive or deployment performed.

### User browser comments refinement (2026-09-09)

Implemented the five explicit comments: removed the duplicated co-star person/position and numeric rank summaries; grouped desktop return/ranking buttons in one row; removed the ranking top action bar; moved ranking career information left and placed 查看共演 at the profile right. Header co-star navigation retains the prior return behavior. Forwarded a profile-action slot through existing detail components; removed obsolete summary CSS/computed label. Kept lookup failure/unranked feedback local.

Fixed the existing Vue style-src descriptor collision for co-star-oracle.css by retaining its CoStarParticipants import through CSS @import; no visual rule or dependency changed. Updated app regression readiness to wait for actionable participants in the actual analysis, not shared loading cards.

Verification: 34/34 focused app/detail tests pass; typecheck and Vite production build pass; owned diff hygiene passes; active change strict validation passes. Current in-app browser at 5174 with the user's lucay126 query verified both navigation directions and the requested 961px arrangement. At 390px the ranking name/career share the same left coordinate, 查看共演 stays at the right, and there is no horizontal overflow or ranking top action bar. Temporary viewport override reset. No commit, push or deployment.

### Profile inline disclosure refinement (2026-09-09)
Implemented inline final-line 展开 without generated ellipsis and added a right navigation icon to 查看共演. Existing expand/collapse behavior preserved. Focused app/detail tests 34/34, typecheck and production build passed. Current in-app browser verified 961px and 390px, expand/collapse and no horizontal overflow; temporary viewport reset. Cross-position cooperation is investigation/proposal only and does not change Query or backend behavior in this follow-up.

### Browser comment corrections, 2026-09-10

User requested removal of the extra cross-mode return controls and origin state. Removed both return flags, old-analysis snapshots, origin scroll snapshots and ranking-view rollback. Header now uses ordinary mode navigation; detail-local close/focus restoration and exact ranking location remain. Updated PRODUCT, DESIGN and the linked-workspace delta/main spec to match. No new navigation state, dependencies, contracts or backend changes.

Focused verification on Node 24.18.0: co-star component/selection/partners suites, linked App navigation and shared toolbar tests passed (8 files, 80 tests). Typecheck, Vite production build, production-artifact check and repository-wide git diff --check passed. Both linked-workspace and cross-position changes pass strict OpenSpec validation. Current 5174 browser verified ordinary Header navigation retains the current single-person selection and has no extra return controls. This is a bounded correction; the owning changes remain active with their existing unrelated acceptance work pending. No commit, push or deployment.
