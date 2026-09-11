## Task Boundary

| Field | Boundary |
|---|---|
| Status | Contracts, Backend and Frontend implemented; final runtime verification and existing full-gate blockers remain open |
| Owner | Primary reviews/coordinates/owns Frontend; Contracts and Backend each own the exact blocks in design.md |
| Writable paths | This change now; exact design.md implementation inventory only after primary apply authorization |
| Read-only protected inputs | Current accepted user UI decisions, ranking contracts/goldens/formulas, B2 owned data/generators, unrelated dirty work, real Archive and active services |
| Deletion complement | Only the superseded ranking private maximum scan after equivalent shared implementation; preserve all other behavior |
| Mutable refs | None |
| Consumes | Complete partner population, rankings scale schema/algorithm/formatter, current accepted design |
| Produces | Reviewed plan; later authoritative scale and stable cooperation progress |
| Dependencies | Strict review before apply; Contracts before consumers; explicit handoff for B2 generator/gate and primary C1/C2/NTag/xicons/AppViewport files |
| Deliverables | Coherent code/contracts/generated outputs/docs, exact test/browser evidence and lifecycle completion |
| Acceptance | Commands below, representative states and git diff hygiene |
| Non-goals | New runtime/cache/request/dependency, frontend population statistics, unrelated cleanup or redesign |
| Operations deferred | No host/service/pointer/runtime activation, production, release, push or other repository write |
| Stop/rollback conditions | Authority conflict, ownership overlap, undeclared output or acceptance failure; never use reset --hard, checkout rollback, git clean, git add -A, hidden stash or broad deletion |

## 1. Planning — Primary review boundary

- [x] 1.1 Inspect current branch/HEAD/dirty ownership, active changes and actual rankings/partners schema/producer/consumer; prove that leaders cannot supply the negative absolute maximum.
- [x] 1.2 Complete proposal/design/three deltas/tasks, run strict validation and inspect only this change's diff.
- [x] 1.3 Primary reviews the product/architecture/ownership boundary, records any amendments and explicitly authorizes implementation; source work remains blocked until then.

## 2. Contracts — Schema, goldens and partners generation

- [x] 2.1 Preflight current branch/HEAD, preserve all accepted dirty changes, confirm strict-reviewed artifacts and obtain the generator handoff from the B2 owner before touching the exact Contracts/generated inventory.
- [x] 2.2 Add required global/personal metricScale using references to the existing rankings definitions; extend the three existing success case files and verifier with exact off-page negative, zero, null, scope-invalid and metric-mismatch evidence; do not change request/error or ranking semantics.
- [x] 2.3 Regenerate partners Go/TypeScript consumers with existing commands and verify schema, projection isolation and typed round-trip; prove other operation/ranking generated outputs remain unchanged. Stop for inventory amendment if additional generated writes are required.

## 3. Backend — Reuse complete-set scale evaluation

- [x] 3.1 Preflight branch/HEAD/dirty state and approved artifacts; confirm non-overlapping statistics/ranking/partners files and B2 release of check.sh before its two inventory entries are edited.
- [x] 3.2 Move existing ranking maximum behavior to the bounded context-aware statistics helper and reuse already-built PersonSortEntry slices in both projections; attach partners scale to Page/wire while leaving cached Core, cache keys and cost unchanged.
- [ ] 3.3 Prove rankings equivalence and partner empty/missing/zero/positive/negative/fractional maxima, off-page and searched-out maxima, candidate-position-filtered populations, sort/order/page invariance, cancellation and returned-value ownership. Run focused tests then the coordinated full Backend gate; record actual blockers without changing unrelated harness policies.

## 4. Frontend — Primary integration on current UI

- [x] 4.1 Preflight branch/HEAD/dirty state and reviewed artifacts; wait for current C1/C2/NTag/xicons/AppViewport/typography writes to finish on shared component paths, then preserve those exact current hunks.
- [x] 4.2 Adapt/freeze metricScale and validate it against the requested sort; minimally generalize the existing ranking formatter's structural input type and use its arithmetic for cooperation rows; add only the decorative progress layer and signed-center styles.
- [ ] 4.3 Verify missing/wrong-scale rejection, null/zero rendering, +1/5 versus -4/5 length/direction, stable widths after search/page/order, intact pending/error rows+scale and unchanged ranking conversion; run focused API/formatter/component tests then the full Frontend gate.

## 5. Primary acceptance and lifecycle

- [ ] 5.1 Compare actual rendered progress against current rankings in Light/Dark at 390, 780, 961 and 1440px, including negative/positive/zero/unavailable and a maximum outside the current page; verify current column geometry, typography, focus and selected-source behavior remain intact.
- [x] 5.2 Synchronize only the named PRODUCT and Backend guide response paragraphs, inspect actual owned diffs/generated outputs and record separate investigated/specified/implemented/verified states. Do not claim runtime activation from a local build.
- [x] 5.3 Sync the three accepted delta capabilities and run strict all-spec validation.
- [ ] 5.4 After required acceptance is complete, archive this change. No commit, push, merge, release or deployment is included.

## Acceptance commands

Use the pinned tools and real existing generators; equivalent commands may run only on a primary-coordinated clean verification target when the shared workspace is unsuitable. A failed full gate remains a failed full gate even when direct package tests pass.

Planning in repository-root PowerShell:

```powershell
$taskNode = 'D:/Nodejs/npm-cache/_npx/004e8352dee60470/node_modules/node/bin/node.exe'
$taskNpm = 'D:/Nodejs/npm-cache/_npx/004e8352dee60470/node_modules/npm/bin/npm-cli.js'
$taskOpenSpec = 'C:/Users/26552/AppData/Local/npm-cache/_npx/eace49ea15dbb501/node_modules/@fission-ai/openspec/bin/openspec.js'
$env:OPENSPEC_TELEMETRY = '0'
& $taskNode $taskOpenSpec validate contracts-add-partner-metric-scale --strict
git diff --check -- openspec/changes/contracts-add-partner-metric-scale
```

Contracts/Frontend after apply authorization, using the same pinned Node/npm environment (Node 24.18.0, npm 11.16.0):

```powershell
& $taskNode $taskNpm --prefix contracts/goldens/api/partners ci --ignore-scripts --no-audit --no-fund
& $taskNode $taskNpm --prefix contracts/goldens/api/partners run verify
& $taskNode $taskNpm --prefix frontend run generate:partners-wire
& $taskNode $taskNpm --prefix frontend run check:partners-wire
& $taskNode $taskNpm --prefix frontend run test -- tests/api/partners.test.ts tests/features/ranking/model.test.ts tests/features/co-star/partners-components.test.ts tests/app/co-star.integration.test.ts
& $taskNode $taskNpm --prefix frontend ci --ignore-scripts --no-audit --no-fund
& $taskNode $taskNpm --prefix frontend run check
```

Backend, from backend with Go 1.26.5 and pinned Node/npm on PATH:

```sh
./scripts/generate-partners-wire.sh --write
./scripts/generate-partners-wire.sh --check
go test ./internal/statistics ./internal/ranking ./internal/partners ./internal/httpapi ./internal/httpapi/wire
./scripts/check.sh
```

The full Backend script owns/removes its documented `.cache`/`.tmp` roots; do not run it alongside B2 or another owner's work there. The primary must resolve the disposable validation target before execution. Runtime service switching is not part of these commands.

## Evidence

Planning evidence: current branch master at `3612f50`, 48 commits ahead of origin/master; pre-existing dirty work is protected. Existing leaders use descending signed preference while ranking maximum uses absolute exact Rational. Strict validation passed. Primary subsequently reviewed and authorized Contracts/Backend implementation with Go generation released by B2; TypeScript, adapters and component/CSS integration remain primary-owned. No service startup/restart, activation or Git integration is authorized or performed by this owner.

Implementation evidence (2026-09-08):

- Shared statistics.PersonMetricScale is now used by ranking and partners; cached Core/key/cost and original rankings contract/goldens are unchanged. New check.sh entries name only metric_scale.go and metric_scale_test.go.
- Parent-authorized order: implement/test Backend first; prepare future schema/goldens and Go wire in `D:/Luca/Code/MyProject/BangumiStaffStats/.tmp/design-audit-fixes/partner-scale-check`; after its Linux tests/build passed, copy exactly the partners schema, verifier, three success case files and generated Go wire into the main worktree. Original backend/.tmp/person-profile-v2 was not cleaned or changed.
- Node 24.18.0/npm 11.16.0 partners verifier passed 14 cases in both the isolated copy and main worktree after npm ci. New cases cover complete populations, off-page negative maxima, search/order/page stability, valid zero and unavailable metrics; malformed/missing/scope-invalid/max-invalid/request-mismatched scales are rejected. Existing case meanings compared unchanged after removing the new scale/evidence fields.
- Existing Go generator `generate-partners-wire.sh --write` and `--check` passed in the isolated LF copy, projection SHA-256 `3a66b11017f2b39733b767aa2e44747aea3697ee16a5fcc47037bae9d3b1d6f9`. Typed global and personal wire round-trip now checks decoded typed envelopes, not only the union's raw JSON. TypeScript generation portion of task 2.3 remains pending for the primary.
- Linux Go 1.26.5: `go test ./... -count=1` passed all 21 Backend packages; focused `go test -race` and `go vet` passed statistics/ranking/partners/httpapi/httpapi/wire; `go build ./...` passed. Main Windows source also passed targeted scale/project/partners HTTP and wire tests plus go build. Scoped diff check returned no errors.
- Full `scripts/check.sh` is not claimed green: the existing B2 LF gate is blocked by its unchanged call to the absent internal/archive/contracttest directory. This owner did not rerun that known failing full harness or modify retired Archive checks; task 3.3 retains this unresolved full-gate boundary despite green direct tests.
- Main schema now requires metricScale. The primary was notified immediately to finish TS/adapter generation and compile the final API; the running old service requires the separately user-operated restart. No service or alternative startup mechanism was attempted.

## Primary integration evidence — 2026-09-09

- Partners TypeScript generation/drift checks passed, retaining projection 3a66b11017f2b39733b767aa2e44747aea3697ee16a5fcc47037bae9d3b1d6f9. The adapter registers the existing rankings schema, freezes the exact scale and rational maximum, and the request driver rejects wrong-sort scales.
- Cooperation rows now reuse rankingProgress with the existing metric fields. The formatter change only narrows its structural input type; arithmetic is unchanged. Progress is aria-hidden, nonnegative metrics fill from the start, preference uses the existing signed zero-centered design. Existing NTag/xicons/AppViewport/C1/C2/current user typography and padding are retained.
- Focused tests cover missing/global-invalid/wrong-sort scale rejection, frozen data, +1/5 versus -4/5 ratios, and unchanged scale when the maximum leaves the visible rows. Latest full Vitest passed 45 files / 507 tests; latest typecheck and production build passed. The full Frontend gate portion of task 4.3 remains blocked by initial-JS gzip 309511 >= 307200. The Backend gate portion of 3.3 remains blocked by the old absent archive/contracttest target despite the documented green direct tests.
- PRODUCT partners result/view paragraphs and the Backend guide response paragraph are synchronized. The three accepted deltas are synchronized into root specs; all 87 specifications/changes passed strict validation. Scoped git diff --check passed. No Git integration or production deployment occurred.
- Final Linux executable is built at .tmp/design-audit-fixes/api-linux-final. Read-only comparison confirms the currently running local API is still the prior B2 executable. The user has a pending manual stop/start request after automatic approval rejected Start-Process wsl.exe with only blocked by policy; no alternate startup was attempted.
- Task 5.1 is NOT complete: actual C8 progress and integrated C2/C1 widths still require the matching API and refreshed query reference. Current strict frontend correctly rejects old partners responses without metricScale; this is recorded as an unresolved local version mismatch, not a successful browser check. The change remains active and unarchived.
- Full implementation, browser evidence and exact user startup commands are recorded at C:/Users/26552/.codex/visualizations/2026/09/08/01a07fbe-21f1-7a13-801f-bff6dfd1b44e/design-fixes/progress.md.
