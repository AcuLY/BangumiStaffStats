## 1. Review and implementation

- [x] 1.1 Inspect dirty baseline, current OpenAPI delta and all pins; review scope and user-authorized 350 KiB budget.
- [x] 1.2 Validate this change strictly before implementation.
- [x] 1.3 Synchronize explicit digest pins and fixtures, protect OpenAPI LF, add source/pin regression.
- [x] 1.4 Raise checker to 350 KiB and update frontend documentation.

## 2. Acceptance and lifecycle

- [ ] 2.1 Run pinned frontend check and contract artifact tests; run Backend build tests and shell syntax check.
- [x] 2.2 Verify artifact threshold around 358400 bytes and audit exact owned diff.
- [x] 2.3 Synchronize accepted specs and run strict all-spec validation.
- [ ] 2.4 Archive only after the required full frontend gate can pass on a stable source tree.

The original product changes remain independent and are not marked complete by this packaging follow-up. No commit, push or deployment is authorized.

## Verification evidence, 2026-09-09

Implemented locally on master 3612f50; no commit/push/deploy. OpenAPI source still hashes to 999272f4fcd204c1dfecbe1948c77abcf29230dc1e8a76eb7549c386cab09260 after implementation. All five prior explicit artifact pins now agree. Frontend packaging also now emits accepted SQLite compatibility 1..2.

Passed:
- Node 24.18.0 / npm 11.16.0 frontend artifact:test: 8/8, including repeatable packaging, tamper rejection, and nested-base smoke.
- Contracts artifact suite: 50 passed, 0 failed, 1 explicit Windows POSIX-only skip. New source/Backend-pin regression passed.
- Go 1.26.5 linux/amd64 test binary under WSL Ubuntu: 13 selected packaging tests passed, including path policy, package options, deterministic tar, OCI admission/rejection, SPDX and endpoint probes. This subset excludes tests that invoke a Go compiler inside WSL, which is not installed.
- Backend build.sh shell syntax passed. Native Windows full artifact Go test was attempted but failed on existing POSIX archive path handling; no claim of a green native full suite.
- Existing dist passes the new budget: initial gzip 312952 bytes in 3 initial files, total gzip 375384 bytes. This is the pre-existing dist, not a successful rebuild of current concurrent source.
- Isolated copies of that dist exercised the actual checker with added incompressible JavaScript comments: 358399 bytes passed; 358400 bytes failed specifically on the gzip budget. Production dist was not modified by the boundary probe.
- Strict OpenSpec validation: 91/91 (36 changes, 55 specs). Accepted specs synchronized. Old 300 KiB/old OpenAPI pin residue absent from active checker, packaging code, fixtures and accepted specs; historical evidence retained.
- Owned git diff --check passed; pre-existing dirty hunks preserved.

Full frontend gate remains blocked outside this change:
- npm run check passed architecture, all seven wire checks and Unicode drift, then returned 530/531 tests; one App person-workspace-links test timed out waiting for the preview panel.
- A focused retry reported async component loader errors and was stopped; it is not a pass.
- npm run build then failed typecheck in CoStarAnalysisSkeleton.vue (undefined name) and CoStarSurface.vue (unknown[] position keys). CoStarAnalysisSkeleton.vue was modified during this turn by another writer (observed mtime 18:48:59 then 18:52:04); no edits were made to that source by this change.
- No fresh npm ci or product/browser rerun was needed for packaging-only changes with unchanged dependencies. No latest-source build or complete original product acceptance is claimed.

Task 2.1 and archival remain pending a stable source tree and green complete gates; the requested contract synchronization and budget implementation are verified by the focused checks above.
