## Task Boundary

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: no; verified: main semantic/dependency review and strict validation passed; committed/pushed/released/deployed: no |
| Owner | One Contracts owner applies; main agent reviews affected active specs and accepts. |
| Writable paths | `contracts/schemas/archive/schema.sql`, `contracts/schemas/archive/README.md`, `contracts/schemas/archive/compatibility-matrix.json`, `contracts/schemas/archive/tooling/build_sqlite_fixtures.py`, `contracts/schemas/archive/tooling/verify.mjs`, `contracts/goldens/archive/index.json`, `contracts/goldens/archive/valid/minimal/**`, `contracts/goldens/archive/invalid/bundles/**`, `contracts/goldens/archive/vectors/data-version.json`, `tmp-formal-development/formal-development-master-plan.md`, and this file's task markers. |
| Read-only protected inputs | `PRODUCT.md`, `DESIGN.md`, backend/data guides and accepted decisions, root specs, archived and other active changes, all backend/updater/frontend code and tests, editor/cache state, refs/remotes, external repositories, hosts, and production. |
| Deletion complement | None; preserve exactly the existing 31 indexed golden paths and all unrelated paths. |
| Mutable refs | None during apply; implementation owner SHALL NOT stage, commit, archive, push, release, deploy, or modify refs. |
| Consumes | Reviewed artifacts, current Archive/query contracts, current corpus/tooling, product NSFW semantics, and accepted date decision. |
| Produces | Corrected pre-production Archive v1 contract evidence and master DAG only. |
| Dependencies | Completed Archive/query contracts; proof no formal/public v1 exists; main-reviewed amendments to `implement-backend-archive-consumer`, `produce-immutable-archive`, and `implement-query-result-set` before apply. |
| Deliverables | Corrected DDL/docs/matrix/tooling, deterministically regenerated corpus/vector identities, and master-plan row/edges/count. |
| Acceptance | Semantic rejection matrix, nine sentinels, exact closed path set, double deterministic generation, pinned cross-language verifier, strict validation, diff/scope/residue gates. |
| Non-goals | No runtime/product implementation, v2, dual compatibility, new dependency, full Archive acquisition, or operations. |
| Operations deferred | No current switch, migration, schedule, retention, restart, rollback, release, deploy, host, or production action. |
| Stop/rollback conditions | Stop on precondition, authority, overlap, path, dirty-state, deterministic, or validation mismatch; propose v2 if a formal/public v1 exists and revert only owned unstaged bytes. Never use reset-hard, checkout rollback, git clean, `git add -A`, broad deletion, or external writes. |

## 1. Contracts implementation

- [ ] 1.1 Preflight branch/HEAD/index and allowed dirty paths; prove the exact 31 indexed paths and absence of any formal produced/published/activated/released/deployed Archive v1; confirm all four artifacts are main-reviewed and the consumer/producer/query active specs already depend on this correction and describe their later adaptation; stop without mutation on mismatch.
- [ ] 1.2 Update only `schema.sql` and `README.md` with required `nsfw`, canonical nullable `air_date`, explicit nullable precision 1/2/3, exact null/shape/calendar/leap constraints, and required `idx_subject_filter_date_id`; retain application/user/manifest/SQLite version 1 and document the one-time pre-production exception.
- [ ] 1.3 Update only the matrix and two tooling programs: replace the old subject index, expand four sentinels to nine, build the four approved subject rows, and execute table-driven rejection for missing/invalid NSFW, malformed/trailing/impossible dates, year zero, leap boundaries, and all null/precision mismatches without adding a dependency.
- [ ] 1.4 Run the builder in approved write mode to regenerate only the existing valid/invalid bundle bytes, vector, and index; require source accounting/table counts and every schema/dataVersion/SQLite/manifest/pointer digest to derive from final bytes, with the indexed relative path set unchanged at exactly 31.
- [ ] 1.5 Update only `tmp-formal-development/formal-development-master-plan.md`: add the correction row and DAG edge after both contract definitions, change the main-repository count 27→28, and add the correction as an exact direct dependency of consumer, producer, and query-result changes without altering the Wave 5 direct-19 list.
- [ ] 1.6 Run builder `--check` twice from clean disposable roots and compare reports/seals; run pinned `npm ci --ignore-scripts` plus `npm run verify`, including strict schemas, SQLite self-test/integrity, nine sentinels, 31-path closed index, vector/digest checks, and temporary Python/Go model generation; run targeted consumer-input contract readers only when they require no runtime implementation change.
- [ ] 1.7 Remove only validated Archive-owned `.cache`, `.tmp`, and `tooling/node_modules` disposable roots; run targeted/all strict OpenSpec validation, doctor, `git diff --check`, exact writable/protected-path diff, golden physical/index equality, no-current/no-generated/no-residue checks, and report exact investigated/implemented/verified status without staging.

## 2. Main-agent acceptance

- [ ] 2.1 Recheck the no-public-v1 proof, affected active-spec amendments, exact owned diff, DDL calendar arithmetic, NSFW/date query semantics, regenerated identities, DAG count/edges, and zero protected/external mutation; rerun every material gate.
- [ ] 2.2 Record accepted Contracts status and downstream adaptation handoff accurately; leave backend/updater/query implementation for fresh owner turns and perform sync/archive/stage/commit only as a separate main-owned lifecycle step, with no push, release, deploy, activation, or operations claim.
