# Verification record

## Implemented and focused verification

- Frontend: cast-only `配音角色`, normal-weight names and role tags, two measured rows, final-row `… +N`, complete accessible tooltip, exact server series counts. Focused Vitest: 24 tests / 2 files passed.
- Backend: SQLite schema 2, bounded summary normalization and storage, logical projection, person-detail read-through. Full archivebuild package including all 15 producer cases passed; person-detail package passed in Linux, including biography wire/view/cache isolation and omission tests.
- Contracts: canonical/embedded DDL identical; 32 canonical paths and 15 producer cases retained. Native Python 3.11.9 / SQLite 3.45.1 canonical check and deterministic refresh check passed (65 derivatives, zero drift). Eight generator tests passed on Windows and Linux. Linux Node 24.18.0 / npm 11.16.0 artifact tests: 48/48 passed. All 32 canonical files, 16 canonical cases, 25 string vectors and 15 producer cases passed independent semantic verification.
- Independent Backend checks in the Linux/LF export: all 21 packages passed ordinary and race tests, CGO-disabled tests, vet, build and module verification. Query test binary remained below 16 MiB.

## Full-gate limitations outside the implemented block

- Actual Backend `./scripts/check.sh` passed the wire/format/dependency/business/repeated/fuzz/benchmark steps, then failed because it still invokes the retired `./internal/archive/contracttest` directory. Only the two new test inventory entries were added; the obsolete gate was not bypassed.
- Full Frontend `npm run check` passed architecture, all generated API wire checks and Unicode checks, then reported 455 passed / 18 failed, 2 unhandled errors, in ranking/query/co-star integration and component tests. All 24 role/person tests passed. Representative unrelated failures are the stale 380px layout assertion and a candidate fixture without `items`.
- Separate Frontend typecheck/build and production-artifact inspection passed. Frontend artifact tests passed 5/8; three cases retain a stale OpenAPI seal (`e7aba7...` versus current `999272...`) from other API work.
- Full Archive verifier CLI reaches its existing macOS-only Go telemetry sandbox guard. Native canonical regeneration is green; Ubuntu SQLite 3.37.2 differs physically from the pinned generation reference 3.45.1, although semantic validation passes.
- Query-domain verifier accepts the updated Archive authority but encounters the pre-existing shared-query-cases seal mismatch. Whole-worktree diff checking reports concurrently edited unrelated frontend accessibility/ranking spec whitespace; owned paths are clean.

These are failed or environment-blocked gates, not passing gates. The verification export is a normalized LF copy with a disposable Git fixture for tests, not another source branch/worktree. Source commits, push, merge, release and production deployment are absent.

## Real source and candidate

The production builder replayed the exact original official `dump-2026-09-01.210329Z.zip` and pinned common file. ZIP/common digests and all seven extracted source size/digests matched the old manifest. The fresh candidate has SQLite schema 2 and dataVersion `dv1-e0d052a68237aa9d145aca8edf2d86dc60c16644bedd2c467ac71f383e191778`.

All 20 table counts, all seven source-accounting entries and all four quality counts exactly match the old snapshot. No source refresh or statistical change was introduced. The isolated candidate remains under the path recorded in local-verification.md.

At loopback 8081, person 5119 returns a real 2034-character Archive summary. The global work count remains 479; the personal UI remains 82 works with the same 2096-person / 458-subject ranking summary. The old binary+Archive copy passed readiness and an actual global person-detail query on isolated port 8082; that recovery test process was stopped.

## Rendered evidence

- Real six-character case at 961px: two 20px rows separated by the existing 4px gap; three visible names and `… +3`; full tooltip contains all six names/tags; Escape closes without losing focus.
- Phone at 390px: all role lists use at most two rows; clicking the overflow exposes six entries; work-card horizontal overflow is zero.
- Real biography at desktop and phone: 2034 text characters rendered as text nodes; default height 46.17px for two 23.1px lines; keyboard/click expansion and collapse verified; phone document has no horizontal overflow.
- Concurrent timeline-contract updates occurred during validation. The isolated server was recompiled from current source, then the query was replayed so its metadata and frontend contract were fresh; the final rendered biography passed after that synchronization.

## Active-runtime and lifecycle state

The user explicitly approved switching the local 8080 Backend and Archive. On the activation preflight, 8080 was already stopped, while 5174 remained listening. The verified new immutable version was copied into the active Archive versions directory, and the pointer was atomically switched.

Automatic tool approval then rejected both the hidden launcher invocation and the supervised invocation of the existing backend.sh start command, returning only `blocked by policy`. No startup command executed. The pointer was immediately restored to the original v1 dataVersion, and matching SHA-256 values confirmed that the original API binary was unchanged. 8080 remains stopped as it was at entry. The new version, full rollback copy and isolated 8081/5181 preview remain available. This is a tool-policy blocker, not a missing user approval; no further alternate startup path was attempted.

Sync/archive remains pending while the recorded whole-gate failures and the blocked active-runtime launch are unresolved. No later lifecycle state is inferred from focused checks.

Subsequent user manual startup: the user started `.tmp/rating-work-points/api-linux` through backend.sh. The 8080 process became active (observed PID 10989), but current.json still selected v1 because backend.sh replaces only the binary. Live person-detail then returned HTTP 500 INTERNAL_ERROR; read-only PRAGMA inspection confirmed v1 person columns lack summary. The v2 copy already staged in the active versions directory is present and has the real 2034-character summary. Isolated 8081 returned HTTP 200 for the same request. The required recovery is a coordinated stop, atomic pointer switch to the staged v2 snapshot, and launch of the verified candidate api-v2, followed by a fresh frontend query. No additional runtime mutation was made during this diagnosis.
