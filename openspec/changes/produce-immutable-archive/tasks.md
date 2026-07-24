## Task Boundary

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: no; verified: main semantic/dependency review, strict change/all validation, and doctor passed; committed: determined by containing Git history; pushed/released/deployed: no |
| Owner | Contracts owner first, Updater owner second, main agent acceptance last. |
| Writable paths | Each owner may write only its exact `proposal.md` path set and its own task markers. |
| Read-only protected inputs | Schemas/other contracts, accepted consumer, guides/specs, other code/changes, refs/remotes, hosts/production. |
| Deletion complement | None. |
| Mutable refs | None. |
| Consumes | Accepted foundations/consumer, the corrected and string-hardened Archive contract and Contracts cases, and an explicit source/build request. |
| Produces | Indexed synthetic cases; then one inactive validated Archive version or bounded no-change/failure. |
| Dependencies | Apply blocked until `correct-archive-subject-semantics` and `harden-archive-manifest-string-semantics` have exited and `implement-backend-archive-consumer` plus pointer-free `backend/cmd/archive-smoke` are accepted. |
| Deliverables | Goldens, producer, tests/lock/docs, complete-source Python-to-Go smoke. |
| Acceptance | Owner-local gates, reproducibility/failure matrices, full smoke, Python/dependency/OpenSpec/inventory/residue checks. |
| Non-goals | `current.json`, activation/rollback, schedule/daemon/lock/restart, business/API work, operations. |
| Operations deferred | Production roots/credentials/runs, activation/retention/restart/deploy. |
| Stop/rollback conditions | Stop on mismatch; remove only exact owned staging/candidate. Never reset-hard, checkout rollback, clean, broad delete, external write, stage, commit, archive, or push. |

## 1. Contracts owner

- [ ] 1.1 Preflight branch/HEAD/index and allowed dirty paths; verify strict-reviewed artifacts, the accepted/exited Archive subject and manifest-string corrections, exact Contracts writable/protected inventories, and no overlap; stop before mutation on mismatch.
- [ ] 1.2 Add the declared compact producer input/expected cases under `producer/**`, then update only `index.json`; record exact accounting, logical rows/counts, dataVersion and first outcomes without schema drift, downloaded data, pointer, or `current.json`.
- [ ] 1.3 Verify the closed regular-file/hash inventory and every case independently, run contract/OpenSpec/diff/residue gates, and hand off exact hashes to main review without staging.

## 2. Updater owner

- [ ] 2.1 After Contracts acceptance, preflight the same repository gates and prove accepted `backend/cmd/archive-smoke` validates the fixed staging layout without pointer/current, applies full-data invariants, emits bounded JSON identity, and closes; otherwise stop.
- [ ] 2.2 Pin only PyYAML `6.0.3`, update the frozen lock/docs, and gate exact version, MIT license, CPython 3.14 wheel/import, graph, and no extra direct dependency.
- [ ] 2.3 Implement one-shot request/CLI, exact HTTPS resolution/acquisition, ZIP/common verification, cancellation, and unique same-output-root/same-filesystem staging with canonical path checks and bounded sanitized outcomes.
- [ ] 2.4 Implement streamed seven-source decoding, exclusive accounting, fresh deterministic SQLite construction, raw permitted unresolved evidence, canonical schema SQL plus actual 35-object seal verification, and schema/reference/quality/integrity/read-only/logical-row gates.
- [ ] 2.5 Implement authoritative dataVersion/digest/manifest finalization with exact calendar-valid UTC generated time, Unicode-scalar URL bounds, and surrogate rejection; execute every indexed `manifest-string-semantics.json` case and exact `C3 28` recipe through that real Python boundary; run accepted Go candidate smoke inside staging, pre-commit cancellation, no-fallback atomic inactive `versions/<dataVersion>` publication as the last fallible gate, valid no-change/collision behavior, and zero `current.json` access.
- [ ] 2.6 Test all accepted producer goldens and manifest-string cases plus size/digest/ZIP/path/cancel/parse/conflict/reference/quality/SQLite/consumer/rename fault injection, reproducibility, bounded memory, and prior-version preservation.
- [ ] 2.7 Run full pytest/mypy/Ruff/build/CLI/dependency/inventory checks and one explicit disposable complete-source Python-to-Go smoke; verify no final failure candidate or `.cache/.tmp/.venv`, then strict change/all/doctor and report without staging.

## 3. Main-agent acceptance

- [ ] 3.1 Audit both disjoint owner diffs and evidence, rerun material offline/full-source/Go/OpenSpec/inventory gates, and confirm protected bytes, prior versions, external state, refs, and `current.json` remained untouched.
- [ ] 3.2 Record exact investigated/implemented/verified/committed/pushed/released/deployed state; stop without later change work, archive, stage, commit, push, release, deploy, activation, or operations.
