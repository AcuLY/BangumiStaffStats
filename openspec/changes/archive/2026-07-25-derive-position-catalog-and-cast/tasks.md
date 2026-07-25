## Task Boundary

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: Contracts yes, Updater yes; verified: Contracts and Updater main acceptance passed, including double contract verification, 183 Python tests, strict type/lint/format/build gates, two independent complete-source builds, real Go consumer smoke, strict change/all validation, doctor, diff, inventory, and zero disposable residue; committed: Contracts yes, Updater yes; pushed/released/deployed: no |
| Owner | Contracts owner first; after main acceptance, Updater owner; main agent performs final review. |
| Writable paths | Planning change; Contracts and Updater sets exactly as declared in `proposal.md`, with each owner limited to its own markers. |
| Read-only protected inputs | Archive/query Contracts/root specs, archived dependency, all updater paths outside the exact set, backend/frontend, authorities, other changes/tasks, refs/remotes, hosts, production. |
| Deletion complement | None. |
| Mutable refs | None. |
| Consumes | Exited producer and exited `correct-archive-raw-domain-semantics`; Contracts catalog evidence; exact Archive/common/config inputs. |
| Produces | Strict catalog schemas/goldens, governed config, deterministic catalog/cast/quality rows, and an augmented inactive producer candidate. |
| Dependencies | `produce-immutable-archive` accepted/synchronized/archived; `correct-archive-raw-domain-semantics` already exited; Contracts accepted before Updater. |
| Deliverables | Closed Contracts package; versioned config; compiler/integration/tests; synthetic and complete-source evidence. |
| Acceptance | Contract, Python, producer/Go, complete-source, OpenSpec, diff/inventory/index, and residue gates pass. Browser checks are not applicable because no UI is writable. |
| Non-goals | Authority repair here, inference, legacy mapping, active sets, API/query/domain/UI/collection/activation/operations. |
| Operations deferred | Production roots/credentials/runs, schedule/lock, activation/retention/restart, monitoring, release/deploy/cutover. |
| Stop/rollback conditions | Hard-stop on unmet producer dependency or raw-domain authority drift; otherwise stop on path/source/config/quality/gate drift. Remove only owned staging/candidate; never reset-hard, checkout rollback, clean, broad-delete, stage, commit, archive, push, or mutate external state. |

## 1. Contracts owner

- [x] 1.1 Preflight branch/HEAD/index/allowed dirty state, strict-reviewed artifacts, exact writable/protected inventories, archived accepted producer, and exited `correct-archive-raw-domain-semantics`. Confirm the former TEXT/raw-numeric/private-mapping conflict remains absent across root schema, producer goldens/verifier, and Go consumer; otherwise stop before any Contracts write.
- [x] 1.2 Add strict catalog configuration, staff-set, derivation-case, quality-report, and closed-index JSON Schemas plus catalog-local `ajv@8.20.0` package/lock/verifier/documentation under `contracts/schemas/catalog/**`; keep install scripts disabled and all cache/temp/install state disposable below that root.
- [x] 1.3 Add the closed `contracts/goldens/catalog/**` corpus for five-type dynamic positions, order/multi-category/fallback/groups, exact fixed anime/game shortcuts, official 101–106 and position-104 sentinel, exact/global-`valid_cv` cast, all reconciled raw roles, quality classes, empty/synthetic staff sets, canonical digest equivalence/drift, and invalid all-or-nothing cases.
- [x] 1.4 Run catalog-local clean install/strict verifier, fatal-UTF-8 and closed-inventory negatives, semantic recomputation, canonical digest tests, and exact protected-path/hash/diff/residue checks. Then run `openspec validate derive-position-catalog-and-cast --strict`, `openspec validate --all --strict`, `openspec doctor`, and `git diff --check -- openspec/changes/derive-position-catalog-and-cast contracts/schemas/catalog contracts/goldens/catalog`.
- [x] 1.5 Hand off exact schema/index/case/tool hashes and commands/results to main review as an unstaged Contracts candidate; do not mark Updater tasks or claim implementation outside this block.

## 2. Updater owner

- [x] 2.1 After Contracts acceptance, preflight branch/HEAD/index/allowed dirty state, strict artifacts, exact Contracts seal, accepted archived producer, reconciled raw-role authority, exact writable/protected inventories, and the single existing producer orchestration file to integrate. Stop if any protected file or overlapping owner is required.
- [x] 2.2 Add `updater/config/catalog/display-v1.yaml`, `staff-sets-v1.yaml` with exactly empty active sets, and owned documentation; implement fatal-UTF-8/duplicate-key-safe YAML parsing, strict schema validation, canonical fixed-field bytes, and deterministic `catalogConfigDigest` under the catalog module subtree.
- [x] 2.3 Implement complete five-type common position/category parsing and structured diff, exact `staff:{type}:{id}` rows/rules/capabilities, deterministic ordering, multi-parent/fallback groups, fixed featured/cast groups, no-credit selectable positions, and unresolved unknown-position preservation without placeholders.
- [x] 2.4 Implement dormant staff-set compilation and goldens: strict key/type/label/order/member rules, sorted members, conservative capabilities, custom-group reference, empty active output, and all-or-nothing rejection.
- [x] 2.5 Implement bounded temporary-SQLite exact cast joins, global `valid_cv`, reconciled raw numeric role preservation, `main=1`/all subset rules, official 101–106 staff-only separation, and an absolute ban on relation/series/cross-work inference.
- [x] 2.6 Implement exact `NO_CHARACTERS`, `NO_CAST_RELATIONS`, and `FILTERED_BY_VALID_CV` counts plus bounded sorted samples and blocking matrices; add complete-source role/common/unknown-position/diff/bound reports without publishing inferred or partial rows.
- [x] 2.7 Integrate through one reviewed producer pre-finalization adapter so catalog/cast/config/rules enter final indexes, integrity/read-only/logical-row gates, manifest/dataVersion, accepted Go smoke, and inactive atomic publication. Prove no schema/manifest/algorithm/finalized-version/current-pointer change.
- [x] 2.8 Execute every catalog and accepted producer golden plus unit/property/fault/determinism/cleanup tests; run the archived producer's documented exact full Python format/lint/type/test/build commands and one disposable complete-source Python-to-Go smoke with bounded memory. Then run strict change/all validation, doctor, scoped diff/inventory/index/residue checks, and report exact investigated/implemented/verified state without staging or claiming API/UI/operations/commit/push/release/deploy.

## 3. Main-agent acceptance

- [x] 3.1 Independently review the two sequential owner diffs/seals and rerun material Contracts, Python, producer/Go, complete-source, OpenSpec, protected-path, inventory, index, and residue gates; reject any private role mapping, authority drift, cross-work cast, extra writable path, or partial catalog.
- [x] 3.2 Record investigated/specified/implemented/verified/committed/pushed/released/deployed states separately and stop. Any sync/archive/commit/push or subsequent API/UI/operations work requires its own later coordination and authorization.
