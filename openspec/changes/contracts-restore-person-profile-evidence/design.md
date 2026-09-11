## Context

The existing person-detail wire already permits an optional summary of 1..8192 Unicode scalars. Official `person.jsonlines` has real biography text (confirmed for person 5119), but `insertPerson` drops it and `loadPerson` selects only names. The original two-row role list was replaced by a slash paragraph in the production card; six distinct cast records therefore look repetitive.

## Goals / Non-Goals

Goals: faithfully present exact cast evidence and real Archive biographies, keep storage bounded, regenerate every affected identity, and preserve existing card/divider/tooltip fixes. Non-goals: new dependencies, live API enrichment, frontend aggregation, interpreted HTML/BBCode, restoring prototype fixtures, a new Archive admission layer, or remote deployment.

## Change Boundary

| Field | Boundary |
|---|---|
| Status | Specification under primary review; no implementation until strict validation |
| Owner | Primary: planning/integration; Contracts: canonical schema and generated evidence; Backend: producer and person-detail reads; Frontend: role presentation |
| Writable paths | Exact inventory below and this change; the four proposal-named root specs during sync |
| Read-only protected inputs | PRODUCT.md, accepted data decisions, all other implementation files and dirty hunks, existing immutable runtime Archives, secrets, remote refs and live production |
| Deletion complement | Only obsolete card contribution formatting; preserve all evidence, unrelated components, snapshots and pending work |
| Mutable refs | None; current master worktree only |
| Consumes | Official local dump, existing canonical schema/tooling/goldens, exact contribution wire, current adaptive row packer |
| Produces | SQLite 2 profile column, reproducible identities, API biography, two-row cast cards |
| Dependencies | Contracts → Go producer → person-detail projection; independent role list consumes unchanged wire |
| Deliverables | Code and evidence, fresh inactive local candidate, browser verification and recorded gate outcomes |
| Acceptance | Commands in tasks.md; real summary and six-role examples; original, wide and mobile card geometry |
| Non-goals | General schema redesign, live profile requests, new caches/admission, statistics changes, credentials or networking changes |
| Operations deferred | Production and existing active local pointer/process activation; only new inactive files and an isolated loopback validation process are in scope until target/rollback review |
| Stop/rollback conditions | Conflicting changes, authority mismatch, unavailable source, unsafe path or failed acceptance; never repair by mutating a published SQLite file |

### Exact implementation inventory

- Contracts owner: `contracts/schemas/archive/schema.sql`, `compatibility-matrix.json`, `producer-case.schema.json`, `README.md`, `tooling/build_sqlite_fixtures.py`, `tooling/verify.mjs`, optional new `tooling/refresh_derived_fixtures.py`; the existing closed paths indexed by `contracts/goldens/archive/index.json` and `contracts/goldens/archive/producer/index.json` plus those two indexes; `contracts/artifacts/lib/validation.mjs`, `contracts/artifacts/producer-runtime-inputs-v1.json`, existing statement/fixture files under `contracts/artifacts/fixtures/` whose sealed schema/runtime input identity changes; `backend/internal/archivebuild/assets/schema.sql` as a byte-identical generated copy; `backend/build/artifact_test.go` only for SQLite version expectations.
- Backend owner: `backend/internal/archivebuild/records.go`, `evidence.go`, `types.go`, `builder_test.go`, `run_test.go`, new `summary_test.go`; `backend/internal/persondetail/archive.go`, new `archive_summary_test.go`. Additional test-only files require a recorded inventory amendment if a fixed v1 assertion is discovered.
- Frontend owner: new `frontend/src/features/person-detail/components/AdaptiveRoleList.vue`; `frontend/src/features/person-detail/components/PersonItemBrowser.vue`; `frontend/tests/features/person-detail/components.test.ts`, optionally new `frontend/tests/features/person-detail/adaptive-role-list.test.ts`; `DESIGN.md` only for the role-list rule. Existing `PersonProfile.vue` already reads optional summary and keeps its approved fallback; no profile rewrite is needed.
- Primary integration: this change, the four named root specs, and temporary validation/build files confined to `backend/.tmp/person-profile-v2/` and `frontend/.tmp/person-profile-v2/`. New inactive local candidate paths must be resolved and recorded before use. Existing runtime files are not writable by this inventory.

The Contracts inventory additionally includes `backend/build/artifact.go` (sealed matrix digest and SQLite supported ranges), `contracts/artifacts/test/contracts.test.mjs` (fixed matrix-digest expectations), and `contracts/schemas/archive/tooling/test_refresh_derived_fixtures.py` for meaningful generator tests. These are mechanical contract consumers; the runtime Archive loader remains unchanged. The person logical projection appends `summary` after `careers`.

Verification inventory amendments: Backend may update only the two new test path entries in `backend/scripts/check.sh`'s closed source inventory. Contracts may update only the schema-derived totalSize/fileSetDigest expectation in `contracts/artifacts/test/producer-runtime-inputs.test.mjs`, with the same binding maintained by the deterministic refresh tool. These are required acceptance consumers of this change; no platform-gate bypass or unrelated script refactor is authorized.

Frontend may also update `frontend/scripts/check-architecture.mjs` only to register the new role component and its test in the closed inventory. Its existing unrelated changes and checks remain intact.

Final derived-binding inventory amendment: Contracts may mechanically update `contracts/artifacts/schemas/component-statement-v1.schema.json`, `backend/build/build.sh`, `contracts/goldens/query-domain/manifest.json`, and `contracts/goldens/query-domain/verify.mjs` for the accepted SQL/matrix/runtime-input identities and Archive schema-v2 authority identifier. Preserve every query/statistical fixture and rule. The refresh tool owns these fixed derivative bindings as well.

## Decisions

1. Advance SQLite alone to version 2. Keep manifest/pointer version 1 and the dv1 algorithm/prefix; schema bytes already participate in dataVersion. The canonical DDL and single supported producer/artifact compatibility tuple move together. Existing snapshots are retained unchanged and require the previous application for rollback. This follows the contract's mandatory new-version rule after a formal v1 exists. Do not implement dual-schema reads or new consumer admission.
2. Add nullable `person.summary` with 1..8192 Unicode-scalar bounds. Normalize CRLF then remaining CR to LF; remove U+0000..U+001F controls except TAB/LF; trim Unicode White_Space; take the first 8192 scalars and trim again. Missing/null/blank becomes NULL. The producer and independent fixture recomputation follow the same explicit algorithm. Plain text means it is rendered as text, never interpreted as HTML or BBCode; no speculative markup regex stripping.
3. The person-detail SELECT/Scan copies the stored optional summary unchanged. The existing immutable-core cache remains bound to dataVersion, so a new Archive identity separates old cached values. The existing public schema and generated API models need no change.
4. Role lists use only cast contributions on ranking work/series cards. Show `配音角色`, normal-weight character names and compact existing role tags, measured into at most two rows using the existing adaptiveAppearanceLayout helper. Excess entries use `… +N` in the final row and a full accessible tooltip. Hover/focus/click opens, Escape/leave/blur closes. Keep exact role entries/counts; stable role priority ordering is presentation only. Do not sum overlapping series counts or discard separate character identities.
5. Ordinary staff query positions stay in the accepted query/profile and are not repeated in each card. A staff-only item has no empty role cell. Subject entries show no synthetic `1`; series entries display the server workCount on the role tag.

## Risks / Trade-offs

- A v2 application queried against a v1 Store lacks the new column → build/verify a fresh inactive v2 candidate before any coordinated activation; retain old binary/pointer.
- Schema digests affect many golden identities → use bounded deterministic generators, keep the closed inventory unchanged and independently verify it.
- Long/multilingual text and hidden roles → cap biography by scalars; test fallback names, multiple equal-role characters, two-row overflow, narrow widths and keyboard access.
- Existing work overlaps several frontend files → apply only explicit hunks on their current content; no reset/checkout/stashing or broad staging.

## Migration Plan

Regenerate contract evidence, implement producer/consumer, run focused and affected gates, then build a fresh inactive candidate from the existing official source set. Start a separate loopback-only verification process against that candidate and verify real summary/roles. Review the exact local runtime switch and rollback before touching active state. No production activation, commit, push, or merge is included.

## Review

Primary review completed: zero P0/P1 findings. Checked version advancement against the post-first-snapshot rule; independent source/normalization evidence; exact immutable dataVersion binding; no new Backend admission or runtime network source; role presentation without frontend statistical aggregation; bounded writer inventory and preservation of dirty work. Apply still requires successful strict validation. The pre-existing embedded-builder v1 parity work and frontend polish/loading changes retain ownership of their unrelated behavior; this new change owns only the later v2 biography and cast-card deltas.
