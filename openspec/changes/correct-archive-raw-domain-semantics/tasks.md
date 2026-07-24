## Task Boundary

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: candidate pending strict validation/main review; implemented/verified/committed/pushed/released/deployed: no |
| Owner | Recovery owner isolates and later restores producer work; correction owner changes Contracts/Go, archives, and commits; main agent accepts; producer owner rebuilds only after this change exits |
| Writable paths | Exact proposal writable paths only, grouped below |
| Read-only protected inputs | Exact proposal protected set, including local dump evidence and the isolated producer candidate |
| Deletion complement | Exact active-to-`2026-07-25-correct-archive-raw-domain-semantics` OpenSpec archive move only; no product deletion and no canonical path-set change |
| Mutable refs | Recovery owner alone may add the named `refs/stash` entry; correction owner alone may advance `refs/heads/codex/formal-rewrite` by one accepted local commit |
| Consumes | Accepted Archive/consumer authority, decisions/guides, fixed 32-path corpus, locked local domain evidence |
| Produces | Corrected unpublished v1, synchronized root specs, regenerated corpus, consumer binding, one local commit, recovery handoff |
| Dependencies | Strict-valid/main-reviewed plan; no formal v1; owners quiescent on overlaps; verified producer snapshot/isolation |
| Deliverables | Numeric DDL/evidence, five-type adapter coverage, all derived identities, Go seal/tests, exact hashes/results |
| Acceptance | Deterministic Contracts and Go targeted/full/race/vet/build plus strict OpenSpec/diff/inventory/residue gates |
| Non-goals | Producer reimplementation, catalog/query behavior, external/production/operations work, old draft compatibility |
| Operations deferred | Acquisition, scheduling, activation/current mutation, rollback operations, restart, release, deploy, production |
| Stop/rollback conditions | Stop on branch/HEAD/index/dirty/path/hash/authority drift, formal v1, stash mismatch, extra output, or failed gate; preserve prior commit and stash; never reset-hard, checkout rollback, clean, `git add -A`, broad-delete, push, release, deploy, or activate |

## 1. Recovery owner: isolate the producer candidate

- [ ] 1.1 Preflight `/Users/luca/dev/BangumiStaffStats` on `codex/formal-rewrite`: record HEAD, empty index, all allowed dirty paths, exact producer candidate regular-file inventory/hashes, current root-index path set/digests, prior `refs/stash`, strict-valid reviewed correction artifacts, no overlapping owner, and evidence that no formal/public/activated/released/deployed Archive v1 exists. Stop without mutation on any mismatch.
- [ ] 1.2 With owners quiescent, create one named path-scoped stash containing only the current changes/untracked files under `openspec/changes/produce-immutable-archive/**`, `contracts/goldens/archive/producer/**`, `contracts/schemas/archive/producer-case.schema.json`, `contracts/schemas/archive/producer-index.schema.json`, `contracts/schemas/archive/README.md`, `contracts/schemas/archive/tooling/build_sqlite_fixtures.py`, and `contracts/schemas/archive/tooling/verify.mjs`. Record its object id and prove its tree/reflog covers the preflight inventory, the prior stash is preserved, the index stays empty, and no producer overlap remains in the worktree. Do not apply, pop, drop, or inspect it during correction apply.

## 2. Correction owner: Contracts authority

- [ ] 2.1 Re-run branch/HEAD/index/status/OpenSpec preflight after isolation; verify the exact three locked local dump hashes, row/domain seals, fixed canonical 32-path set, declared writable/protected union, named stash object, and no formal v1. Treat all non-overlapping dirty owner paths as sealed read-only state and stop on drift.
- [ ] 2.2 Update only `schema.sql`, the fixture builder, README, and shared verifier so `cast_credit.role_type` round-trips integer `1..6`, `subject_relation.relation_type` round-trips positive JSON-safe integers in source direction, and source types map exactly `1/2/3/4/6` to `book/anime/music/game/real`. Add compact deterministic positive/invalid evidence covering all six roles, all five types, codes `2/3`, and the locked 52-code relation domain without implementing series/cast query logic.
- [ ] 2.3 Regenerate `compatibility-matrix.json` and exactly the existing 32 canonical golden paths from the corrected DDL. Propagate schema SQL/object/dataVersion/SQLite/manifest/pointer/vector/index identities in order, retain exactly 35 explicit SQLite objects and one v1 tuple, and prove no old draft identity or extra/missing/symlink/non-regular path remains.

## 3. Correction owner: Go consumer binding

- [ ] 3.1 Preflight the three exact Go writable files against HEAD and the accepted Contracts candidate, then update only the schema-object binding and contract tests needed to consume the regenerated corpus and query integer role/relation plus all five normalized subject-type sentinels. Keep the loader read-only and add no fallback, domain query, producer, HTTP, or private schema copy.
- [ ] 3.2 Run the indexed canonical cases through the real candidate loader; prove corrected bytes pass, discarded draft identities fail at existing precedence, raw numeric sentinels retain source direction/type, and Archive bytes/paths remain unchanged.

## 4. Correction owner: acceptance and handoff

- [ ] 4.1 With dependency installs locked, scripts disabled, and all npm/Go/temp/cache output confined to the accepted disposable roots, run schema compilation/code generation, canonical builder regeneration/check twice, shared verifier, exact local domain-seal checks, and clean disposable-root removal. Record exact old/new schema, object, dataVersion, SQLite, manifest, pointer, vector, root-index, and directory seals.
- [ ] 4.2 Run targeted Archive consumer/contract/smoke tests, full `go test ./...`, separate `go test -race ./...`, `go vet ./...`, and `CGO_ENABLED=0` build/test with the accepted Go telemetry write-denial boundary. Then run strict change/all validation, `openspec doctor`, `git diff --check`, exact writable/protected scope checks, fixed 32-path inventory, forbidden `current.json`/secret/path scans, and zero cache/temp/node_modules residue.
- [ ] 4.3 Hand the unstaged candidate, command results, exact path inventory/hashes, unchanged producer stash id, and explicit investigated/implemented/verified/uncommitted/unpushed/unreleased/undeployed status to main review. Stop on any P0/P1 or drift.

## 5. Correction owner: synchronize, archive, and commit

- [ ] 5.1 After main acceptance and re-proving the candidate/stash seals, synchronize only the two declared root specs, archive only this change to `openspec/changes/archive/2026-07-25-correct-archive-raw-domain-semantics/**`, rerun strict change/all/doctor and cached-diff/scope gates, and stage only the exact reviewed apply/sync/archive union with explicit paths.
- [ ] 5.2 Create one local commit with subject `fix(contracts): preserve raw Archive domain semantics`; verify its parent, exact tree delta, clean index, unchanged named stash and unrelated dirty paths, then stop without push/tag/release/deploy/activation. Hand the stash object to the recovery owner, who applies it without dropping; the producer owner must rebuild declared overlaps from the corrected authority before main review permits that exact stash entry to be removed.
