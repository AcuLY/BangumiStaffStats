## Task Boundary

| Field | Boundary |
|---|---|
| Status | Planned, strict review pending |
| Owner | Primary orchestrates; Contracts, Backend and Frontend have separate exact blocks |
| Writable paths | Exact inventory in design.md and this change; four named root specs at final sync |
| Read-only protected inputs | Existing data, unrelated dirty work, public wire, query/statistics, active processes, remotes and production |
| Deletion complement | Only obsolete card-summary formatter; retain all source/evidence and old snapshots |
| Mutable refs | None |
| Consumes | Existing official local source set and accepted contracts/oracle |
| Produces | v2 profile storage/read and oracle-compatible role presentation |
| Dependencies | Strict review before implementation; Contracts before Backend parity; frontend role block independent |
| Deliverables | Implemented fixes, verified fresh candidate, regenerated artifacts, recorded gates |
| Acceptance | Explicit commands below plus rendered evidence and diff hygiene |
| Non-goals | New dependencies, admission/cache systems, upstream enrichment or broad refactor |
| Operations deferred | Existing active and production state until exact target/rollback review |
| Stop/rollback conditions | Authority conflict, concurrent overlap or failed required acceptance; preserve all unrelated hunks and prior runtime |

## 1. Planning — Primary

- [x] 1.1 Preflight current branch/dirty ownership, inspect governing code/docs and confirm source biography exists.
- [x] 1.2 Complete proposal/design/four deltas/tasks, strict-validate and record primary zero-P0/P1 review before apply.

## 2. Contracts — Contracts owner

- [x] 2.1 Reconfirm exact inventory; update SQLite v2 DDL, tuple and nullable bounded summary semantics; preserve unrelated inputs.
- [x] 2.2 Add bounded deterministic regeneration for existing consumer/producer/artifact inventories; regenerate canonical and embedded bytes and every derived identity.
- [ ] 2.3 Run Python fixture --check, Archive Node verifier and `node --test contracts/artifacts/test/*.test.mjs`; record exact evidence and review diff.

## 3. Backend — Backend owner

- [x] 3.1 Reconfirm owned files; implement v2 version constant, canonical summary normalization/insert/logical projection and person-detail SELECT/Scan.
- [x] 3.2 Verify valid/missing/null/blank/control/Unicode/overlong summaries and exact read-through with focused `go test` for archivebuild/persondetail after fixtures are regenerated.
- [ ] 3.3 Run the affected full Backend `./scripts/check.sh` with pinned Go 1.26.5; record failures honestly and stop scope expansion.

## 4. Frontend — Frontend owner

- [x] 4.1 Reconfirm owned files; restore two-row cast-only AdaptiveRoleList and `配音角色` on both subject/series cards, preserving existing geometry and exact counts.
- [x] 4.2 Add meaningful cases for six equal-role characters, name fallback, series count, staff-only omission, overflow and keyboard/touch closing; update obsolete paragraph expectations.
- [ ] 4.3 Run focused person-detail tests, then pinned `npm ci --ignore-scripts --no-audit --no-fund` and `npm run check`; reconcile the durable role-list design rule.

## 5. Local candidate and rendered acceptance — Primary

- [x] 5.1 Resolve and record exact source/candidate/binary/port paths; build an inactive v2 candidate from the existing official source set without mutating published SQLite or pointers.
- [x] 5.2 Verify a real person biography through an isolated Backend endpoint and real role-list UI at desktop/mobile widths; preserve data on repeated roles and verify overflow/focus/console.
- [ ] 5.3 Review actual diffs and generated reproducibility, run `git diff --check`, and record the exact active-runtime status and any remaining activation boundary.

## 6. Specification lifecycle — Primary

- [ ] 6.1 Sync the accepted four deltas, archive this completed change, and run `openspec validate --all --strict` once required implementation/verification is complete.

## Verification evidence

See verification.md and local-verification.md for passed focused checks, full-gate failures/environment limitations, real candidate/rollback evidence and the pending active-runtime decision. No commit, push, merge, release or deployment has been performed by this change.
