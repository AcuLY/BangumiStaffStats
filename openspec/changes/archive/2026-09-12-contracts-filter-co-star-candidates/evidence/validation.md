# Verification — contracts-filter-co-star-candidates

Date: 2026-09-12. Base: master 6850ad3 (includes separately owned candidate optimization 4bea284 and its check inventory repair). No unrelated tracked changes were present at feature preflight. README.md and docs/ are earlier user-requested documentation/screenshots and remain separate from the feature commit.

## Implemented behavior
- Candidate input supports optional exact participants. Empty/omitted is unconstrained.
- Candidate identities must overlap the whole selected group's common raw works; per-person identities union before group intersection, before series aggregation.
- Invalid identity contributions are removed before position counts, all-position identity union, ranking and paging. Existing full-query candidate metrics are preserved.
- Existing valid selected/partial rows remain identity-management controls; selected tray remains removable even with no candidates.
- Selection/identity changes refresh page one, preserve view choices, and prevent stale actions through errors/cancel/retry.
- Initial default and legacy/current recovery preserve exact identities; clearing all never reselects a default.

## Backend acceptance
- Primary recheck: `go test ./internal/candidates ./internal/httpapi` — passed.
- `go vet ./...` — passed natively.
- Complete unmodified `./scripts/check.sh` — passed in an isolated LF-normalized snapshot under WSL, exit 0, final `backend checks passed`.
- Full gate includes all seven wire checks, package tests, repeat tests, fuzz, race, vet, build, CGO=0, module and source inventory/cleanup checks.
- Toolchain: Linux Go 1.26.5, Node 24.18.0, npm 11.16.0.
- Snapshot: /root/bgmss-candidate-acceptance-20260912-001818/repo; source inventory and full log: C:/Users/26552/AppData/Local/Temp/bgmss-candidate-acceptance-20260912-001818/{snapshot-files.json,acceptance.log}.
- Direct Windows/WSL shared-checkout runs encounter baseline CRLF shell/golden issues. Only the isolated acceptance copy was normalized. The committed query manifest is verified byte-identical to the successful LF snapshot.

## Frontend acceptance
- Pinned Node 24.18.0 / npm 11.16.0: npm ci --ignore-scripts --no-audit --no-fund succeeded.
- Architecture, all seven generated-wire checks and Unicode checks passed.
- Full test suite: 48 files / 568 tests passed using `vitest run --maxWorkers=2`. Default parallel Windows run encountered timeout-only failures; no gate assertions were removed.
- After the final cross-role legacy recovery correction, 37 related tests passed; primary handoff audit reran App integration/coordinator/recovery: 3 files / 83 tests passed.
- Final typecheck, production build and artifact checks passed. Initial JS gzip: 314265 bytes, below 358400-byte limit. Artifact packaging regression tests: 8/8 passed.

## Contracts acceptance
- Candidate goldens: 32 cases, including 16 participant structural/semantic cases.
- Query goldens: 113 cases / 44170 cross-validation executions; deterministic generated checks passed.
- Generated Go wire package tests and native generation replay passed.
- Artifact contract tests: 50 passed, one explicit Windows POSIX skip, zero failures.
- Accepted OpenAPI digest: sha256:b80b0c8a999e0081520aaa1020eea96723f88ceb60920eb0a7356cafeedb19e1, propagated to build/test authority and positive fixtures.

## Real browser acceptance
- Chrome against current local source at http://127.0.0.1:5175/co-star?user=lucay126, same-origin proxy to 127.0.0.1:28081.
- API runs current Go source with the retained local Archive /root/.local/share/bgmss-local/archive and no ArchiveUpdater. No production mutation or Archive writes.
- Query: lucay126, anime, completed + in_progress, main voice role; no NSFW or series merge.
- Initial default selects 伊藤美来 (cast:anime:main), filters all-position candidates to 329 pages.
- Adding 佐仓绫音 (cast:anime:all, staff:anime:33) produces an observed /candidates request containing both exact participants and page=1. Response total=960 (96 pages); their actual common-work analysis shows 13 works.
- Adding 花泽香菜 (cast:anime:all, staff:anime:33) reduces candidates to 59 pages and yields 5 three-person common works.
- Rapid removal of the third and second people returns to 329 pages. Removing the final person returns to the initial 2181-page list with zero selected people and does not auto-refill.
- Mobile 390x844: inline picker opens by keyboard Enter, identity/person removal works, Escape restores focus to selection entry. document.scrollWidth=clientWidth=390. No captured console errors or warnings.
- Screenshots: desktop.jpg and mobile.jpg. Temporary viewport override cleared. Local preview retained for further inspection.

## Lifecycle
- Primary reviewed actual backend, contract and frontend diffs. No changes to statistics/candidates.go, dependencies, production operations or prior images.
- git diff --check and strict change validation passed; after archival, openspec validate --all --strict passed 94 items with zero failures.
- Delta specs synchronized into contracts-candidates-api, backend-candidates-api and frontend-co-star-vertical; change archived after complete acceptance.
- Feature is committed locally for the separate release coordinator; push/merge/deployment are not performed by this task.
