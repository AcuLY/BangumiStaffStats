## Task Boundary

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: Contracts producer block and Updater complete; verified: 133-test offline suite plus explicit complete-source Python-to-real-Go smoke, strict Python/build/dependency/Contracts/OpenSpec gates, canonical 32-file seal, final inventory, and residue checks passed; committed: pending this phase commit; pushed/released/deployed: no |
| Owner | Contracts owner first, Updater owner second, main agent acceptance last. |
| Writable paths | Each owner may write only its exact `proposal.md` path set and its own task markers. |
| Read-only protected inputs | Root Archive golden index and its 32 canonical paths/bytes, all schemas/contracts outside the exact Contracts writable set, accepted consumer, guides/specs, other code/changes, refs/remotes, hosts/production. |
| Deletion complement | None. |
| Mutable refs | None. |
| Consumes | Accepted foundations/consumer, the corrected/string-hardened/raw-domain-preserving Archive contract and Contracts cases, and an explicit source/build request. |
| Produces | Indexed synthetic cases; then one inactive validated Archive version or bounded no-change/failure. |
| Dependencies | `correct-archive-subject-semantics`, `harden-archive-manifest-string-semantics`, `correct-archive-raw-domain-semantics`, and `correct-archive-staffset-key-bound` have exited; `implement-backend-archive-consumer` plus pointer-free `backend/cmd/archive-smoke` are accepted. |
| Deliverables | Separately indexed producer goldens/schemas and canonical-preserving Contracts tooling; producer, tests/lock/docs, complete-source Python-to-Go smoke. |
| Acceptance | Unchanged canonical 32-file seal, closed producer sub-index and semantic recomputation, owner-local gates, reproducibility/failure matrices, full smoke, Python/dependency/OpenSpec/inventory/residue checks. |
| Non-goals | `current.json`, activation/rollback, schedule/daemon/lock/restart, business/API work, operations. |
| Operations deferred | Production roots/credentials/runs, activation/retention/restart/deploy. |
| Stop/rollback conditions | Stop on mismatch; remove only exact owned staging/candidate. Never reset-hard, checkout rollback, clean, broad delete, external write, stage, commit, archive, or push. |

## 1. Contracts owner

- [x] 1.1 Re-run preflight after this amendment: verify branch/HEAD/index and allowed dirty paths; strict-reviewed artifacts; accepted/exited Archive corrections and consumer; exact expanded Contracts writable/protected inventories; corrected root-index SHA-256 `655d77b46bf3a76c67ab74d11abd250aa5ab08e770a17732148fc327f74786c6`, 32 entries, sorted `<path><TAB><digest><LF>` seal `e83b9ba65759b314398204d23ff17adf17e5761d3ff0543f98ce3512071e2357`; and no overlap. Stop before mutation on mismatch.
- [x] 1.2 Add strict `producer-case` and `producer-index` schemas plus the declared compact producer input/expected cases and closed `producer/index.json`. Adapt only the declared README/builder/verifier paths so canonical regeneration still proves the unchanged 32-file seal while the producer subtree is independently fatal-UTF-8 decoded, schema validated, hash-closed, semantically recomputed, and never dispatched as a consumer fixture. Record exact input bytes/digests, exclusive accounting, logical rows/counts, dataVersion and first outcomes without Archive runtime schema drift, downloaded data, pointer, or `current.json`.
- [x] 1.3 Verify both disjoint closed regular-file/hash inventories and every producer case independently; prove root index plus all 32 canonical paths/bytes are unchanged; run canonical build/check, shared verifier, contract/OpenSpec/diff/residue gates; and hand off exact schema/sub-index/case hashes and canonical seal to main review without staging.
- [x] 1.4 Reconcile complete-source evidence before final Updater acceptance: update the existing missing-reference producer case, strict schema, verifier, builder output, and producer sub-index so a syntactically valid dangling relationship is counted once as `invalid`, produces no dangling row, permits a valid candidate, and no longer exposes `SOURCE_REFERENCE_MISSING` as a fatal producer outcome. Preserve all 32 canonical paths, the other 14 producer cases, and every unrelated contract byte.

## 2. Updater owner

- [x] 2.1 After Contracts acceptance, preflight the same repository gates and prove accepted `backend/cmd/archive-smoke` validates the fixed staging layout without pointer/current, applies full-data invariants, emits bounded JSON identity, and closes; otherwise stop.
- [x] 2.2 Pin only PyYAML `6.0.3`, update the frozen lock/docs, and gate exact version, MIT license, CPython 3.14 wheel/import, graph, and no extra direct dependency.
- [x] 2.3 Implement one-shot request/CLI, exact HTTPS resolution/acquisition, ZIP/common verification, cancellation, and unique same-output-root/same-filesystem staging with canonical path checks and bounded sanitized outcomes.
- [x] 2.4 Implement streamed seven-source decoding, exclusive accounting, fresh deterministic SQLite construction, the closed five-type adapter, integer cast roles `1..6`, positive JSON-safe integer relation codes in source direction, nullable subject empty-string-to-NULL normalization, nonfatal per-line `invalid` accounting for syntactically valid dangling relationships, raw permitted unresolved evidence, canonical schema SQL plus actual 35-object seal verification, and schema/reference/quality/integrity/read-only/logical-row gates.
- [x] 2.5 Implement authoritative dataVersion/digest/manifest finalization with exact calendar-valid UTC generated time, Unicode-scalar URL bounds, and surrogate rejection; execute every indexed `manifest-string-semantics.json` case and exact `C3 28` recipe through that real Python boundary; run accepted Go candidate smoke inside staging, pre-commit cancellation, no-fallback atomic inactive `versions/<dataVersion>` publication as the last fallible gate, valid no-change/collision behavior, and zero `current.json` access.
- [x] 2.6 Test all accepted producer goldens and manifest-string cases plus nullable empty fields, deterministic dangling-reference invalid accounting, size/digest/ZIP/path/cancel/parse/conflict/quality/SQLite/consumer/rename fault injection, reproducibility, bounded memory, and prior-version preservation.
- [x] 2.7 Run full pytest/mypy/Ruff/build/CLI/dependency/inventory checks and one explicit disposable complete-source Python-to-Go smoke; verify no final failure candidate or `.cache/.tmp/.venv`, then strict change/all/doctor and report without staging.

## 3. Main-agent acceptance

- [x] 3.1 Audit both disjoint owner diffs and evidence, rerun material offline/full-source/Go/OpenSpec/inventory gates, and confirm protected bytes, prior versions, external state, refs, and `current.json` remained untouched.
- [ ] 3.2 Record exact investigated/implemented/verified/committed/pushed/released/deployed state; after acceptance, the main agent may perform the explicitly authorized archive/stage/commit workflow and continue later development, but must not push, release, deploy, activate, or start operations.
