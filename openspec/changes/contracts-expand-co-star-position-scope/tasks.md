## Current status — 2026-09-11

Code baseline: local commit `b675b8d`; repository-convention commit: `0dbc468`. Implementation is committed locally. Existing unchecked full-gate and archive tasks remain open; this documentation pass does not rerun or approve them. See [documentation status](../../README.md#验收记录如何阅读) for current versus historical evidence.

## Task boundary

Status: primary-reviewed, user-approved; apply only after strict validation. Owner: primary orchestration/UI/docs; backend/contracts and frontend scope owners as design.md. Writable paths: exact owner sets in design.md and this change/two accepted specs. Read-only protected inputs: all other dirty work and Archive data. Deletion complement: none. Mutable refs: none, master 3612f50. Consumes: strict shared Query/catalog and new scope input. Produces: cross-role workflow and evidence. Dependencies: contract -> generated -> backend/coordinator -> UI. Deliverables: code/tests/docs/specs. Acceptance: focused/full affected gates, browser, diff/spec checks. Non-goals: new dependencies/formulas/Query owner. Operations deferred: production; existing read-only local QA allowed. Stop/rollback conditions: stop writer/authority conflicts; no reset --hard, checkout rollback, git clean, git add -A or broad deletion.

## 1. Contracts and backend
- [x] 1.1 Preflight branch/HEAD/dirty state and reviewed strict-valid artifacts; preserve prior work.
- [x] 1.2 Add scope contract and regenerate every affected Go/TS consumer.
- [x] 1.3 Implement catalog/evaluation scope, exact source identities, canonical all browsing and cache isolation.
- [x] 1.4 Verify director-script, main-supporting cast, scope cache isolation and invalid positions with focused Go/golden tests.

## 2. Frontend scope and UI
- [x] 2.1 Preflight branch/HEAD/dirty state and reviewed strict-valid artifacts for each owner.
- [x] 2.2 Propagate scope through API/coordinator/preview/recovery with live catalog validation and unchanged ranking Query.
- [x] 2.3 Initialize one original-position source, expand browsing afterward, preserve ranking-link selection and restores.
- [x] 2.4 Add one-person hint in desktop/mobile and independent full cooperation-position options; update targeted tests/docs.

## 3. Acceptance
- [ ] 3.1 Run affected full frontend/backend gates and contract verification; record failures honestly.
- [x] 3.2 Verify real-data director-to-script cooperation, pair/detail, return and refresh plus hint at desktop/mobile.
- [ ] 3.3 Audit owned diff, sync accepted specs, archive when gates pass, and run strict all-spec validation.

## 4. Explicit All option, 2026-09-10
- [x] 4.1 Review and strictly validate the narrow all-scope empty-position contract and exact owner boundaries.
- [x] 4.2 Implement/regenerate the scoped contract and backend normalization, with empty/all and empty/query/ranking regressions.
- [x] 4.3 Connect co-star scope draft/apply/undo/recovery to the real All selector and ranking-detail handoff, preserving unrelated fields and exact source identities.
- [x] 4.4 Verify focused/full affected gates, real browser desktop/mobile handoff and first All entry, generated artifacts and diff hygiene; sync accepted delta and record remaining baseline blockers separately.
- [x] 4.5 Activate the compiled backend on the existing local 8080 service after resolving the automatic-approval rejection; retain the current 5174 frontend and verify readiness.

## Review

Primary reviewed 2026-09-09: this extends the prior person links without modifying their already accepted UI refinement. Source identities, original-position initial selection, all-position candidate/partner scopes and same-tab replay boundaries are explicit. No current change owns this new scope field. Keep the existing artifact-acceptance change and its dirty files intact. User explicitly approved implementation. Apply may begin after strict validation.

## Historical verification records

The records below describe their dated runs. Later activation/commit records supersede older statements such as not committed, 8080 stopped, or activation blocked; they are preserved as history.

Implemented and functionally verified; no commit, push, merge, release or production deployment. Existing dirty work preserved. Accepted specs synchronized. Archive remains pending complete-gate blockers.

Verification: API/coordinator/recovery focused tests 167 passed; UI/App focused tests 93 passed. Final accepted-session scope regression and co-star App tests 23/23 passed. Backend four operation packages, HTTP API/wire, scope/cache tests and golden verifiers passed. A new 33-position golden verifies real Evaluate/Build/Project/Marshal output without truncation. Shared Query validation passed 113 goldens and 44170 cross validations. Architecture, generated wire, Unicode, TypeScript, Vite build and artifact checks passed. Artifact packaging 8/8 passed; contracts artifact tests 50 passed, one Windows POSIX skip. Repository diff hygiene passed; strict OpenSpec 94/94 passed.

Full frontend serial suite: 540/541 passed; the remaining existing scrollbar-system test asserts the removed PartnersSurface tooltip source. Full backend gate is blocked by old backend/pkg/bangumi tests importing missing internal/config and pkg/logger; full query tests have an existing control.json hash mismatch. Those unrelated sources were preserved. Existing pinned dependencies were retained; no dependency changes.

Real-data verification in the built preview at http://127.0.0.1:5175/v2/: personal lucay126 director Query selected 石原立也 only, then loaded all-position candidates and 427 partners. Filtering scripts returned 花田十辉、志茂文彦、田中敦子. Selecting 花田 created a director/script pair with five common works; the hint disappeared. Reload restored both exact identities and scope. Script detail succeeded while the director-ranking lookup correctly reported no membership. Removing the second person restored the hint. Mobile 390px showed and announced the hint, with no overflow. Final browser state had no console errors or alerts; Query remained director-only.

The preview uses a separate read-only QA API on loopback 8081 with Archive updates disabled. Automatic approval rejected activation of the existing 8080 backend. The current 5174/8080 services remained running and unchanged. Updating that existing service remains pending explicit authorization; no rejected activation was retried.

Activation follow-up after explicit user authorization: recreated and verified the old binary backup at backend/.cache/cross-position-previous-api; verified the new file is ELF. The managed 8080 stop succeeded. Automatic approval then rejected both the new-binary startup and the old-binary rollback startup, each reporting only blocked by policy. Consequently 8080 is stopped and requires manual recovery; do not report it as running or updated. No further execution path was used to bypass those rejections.

### Browser comment corrections, 2026-09-10

Mixed candidate identities now show a derived partial selection marker, text and aria-pressed=mixed; activation fills the missing identities under the same Person ID. Selection rows use natural flex heights inside the scrolling list. The one-person tray hint is inside the visible reserved area and disappears for a pair. The partners filter stops growing and sizes from its longest label; its initial loading surface uses the same width rule.

Current lucay126 query verified that searching for source 日笠阳子 in partners returns no matches. Keyboard Space added her 主题歌演出 identity while the person count stayed one; Enter removed that identity. 吉松孝博's three tags fit within the row at 360, 390, 780, 1024 and 1440 px without horizontal overflow, and the hint disappeared with two people. At 1024 px, the partners filter reduced from about 181 px to 138 px and displays 总作画监督助理 in full. Mobile expand and desktop screenshots inspected. Source selection and default browser viewport restored. Shared focused/type/build/artifact/spec/diff evidence is recorded in contracts-link-person-workspaces/tasks.md under the same date.

Cold reload restored the single-person lucay126 query, complete cooperation results and images with no new warning/error entries. The one console error retained in the browser log was a pre-reload HMR duplicate NGlobalStyle message at 12:50:59 UTC.

### Explicit All option verification, 2026-09-11

Implemented the user-requested exclusive All entry in the co-star position catalog. Detail handoff selects All and the exact person identities while retaining the entire Applied Query and other Draft fields; there are no origin flags, old-analysis snapshots or synthetic PositionKeys. First All queries use empty concrete positions with context-aware strict validation; rankings and ordinary query scope remain nonempty. Draft/accepted scope supports dirty/undo, request failure/cancellation, ordinary mode switching and accepted-input recovery.

Passed: runtime/model/API/recovery/preview tests 221/221; query UI/selector/person-handoff tests 51/51; co-star integration 16/16 after updating the three affected fixtures for direct All requery (no redundant query-scope request). Typecheck, production build and production-artifact check passed. Frontend packaging 8/8 passed. All six Contracts artifact test files: 50 passed, one explicit Windows POSIX skip. Backend candidates/partners/costar/persondetail, ranking, HTTP API/wire suites and new all/empty regressions passed. Shared Query generation retained 113 goldens and 44,170 cross-validations. Seven frontend wire drift checks, Unicode drift and seven backend wire generation checks passed. Owned/repository diff hygiene and active change strict validation passed. Main co-star scope and frontend specs synchronized.

The full frontend check reached tests: 555/559 passed initially; three failures were the intentionally changed direct-All requery fixture timing/count expectations and now pass in the complete 16-case integration file. The remaining pre-existing scrollbar-system test still expects a removed Partners tooltip. The full backend check passed generation then failed on existing backend/pkg/bangumi imports of missing internal/config and pkg/logger; full query tests retain the earlier control.json manifest hash mismatch. No unrelated repair, relaxed gate or archive was performed. Dependencies were unchanged; npm ci was not repeated against the running Vite process.

Real browser verification used the built artifact at http://127.0.0.1:5175/v2/ with the existing preview helper and an isolated loopback 8081 API built from backend/.cache/person-workspace-links-qa/main.go. This helper calls RunWithOptions with ArchiveUpdater nil, reads the existing WSL immutable Store, and uses the dedicated image proxy; it does not modify/replace 8080. Real lucay126 first All query succeeded without concrete positions, selected the first eligible candidate and rendered partners. Refresh retained All and exact identities. Switching to ranking opened the concrete-position editor; ranking contained no All option. After a voice ranking, 查看共演 from 日笠阳子 selected All with her voice identity and retained lucay126, anime, completed/in-progress conditions. Editor showed exactly one All row. Desktop and 390px layout/keyboard menu checks passed, no console warnings/errors; viewport override was reset.

Activation state: the compiled production binary is D:/Luca/Data/BangumiStaffStats/local-runtime/api-linux-all-positions. Automatic approval rejected the combined backup/stop/replace/start command for the existing local 8080 service, returning only blocked by policy. That command did not run; the original managed backend and frontend remained running. The independent read-only 8081/5175 verification was accepted. Existing-service activation is pending a concrete user decision; no rejected mutation was retried. No commit, push, merge, release or production deployment.


### Local activation completed, 2026-09-11
After the user explicitly requested startup, the existing Start-Local.ps1 launcher built the current backend and started 8080 plus 5174. Readiness and rankings passed; one transient upstream image failure was followed by successful person and subject image probes (HTTP 200, image/jpeg). The actual 5174 proxy returned HTTP 200 for candidates with empty query.positionKeys and positionScope=all. This supersedes the earlier pending activation state. No production deployment or Git ref change.
