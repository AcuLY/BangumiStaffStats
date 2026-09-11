## Capability Boundary
| Boundary | Declaration |
|---|---|
| Status | Implemented and verified; reviewed and strictly validated before apply |
| Owner | Primary specification/integration; contracts owner schemas and generated consumers; backend owner candidates; frontend owner query/selection presentation |
| Writable paths | Owner-specific lists in design.md; this change; PRODUCT.md; README.md; accepted contracts-candidates-api, backend-candidates-api and frontend-co-star-vertical specs |
| Read-only protected inputs | DESIGN.md; data decision/master/implementation guides; unrelated changes; docs/images and community draft; Archive/runtime data; operations/; existing dirty work |
| Deletion complement | None |
| Mutable refs | Local master: exact owned feature commit after acceptance; no push or deployment. Planning began at 4bea284; release coordinator added 6850ad3 |
| Consumes | Shared Query, explicit participant identities, current catalog, immutable Archive and public collections |
| Produces | Effective candidate identity membership and selection-bound views |
| Dependencies | contracts -> generated consumers -> backend statistics and frontend API -> selection UI |
| Deliverables | Contract, bounded filtering, stale-response-safe picker, regression tests and synchronized specs |
| Acceptance | Candidate contract goldens/generators; backend ./scripts/check.sh; frontend npm ci --ignore-scripts --no-audit --no-fund and npm run check; artifact contract tests; desktop/mobile browser; git diff --check; strict OpenSpec |
| Non-goals | Metric/formula changes, ranking/partners result changes, new dependencies, new recommendation system |
| Operations deferred | No production mutation, push or deployment; release coordinator handles integration separately |
| Stop/rollback conditions | Stop on overlapping concurrent edits or authority conflict; undo only owned hunks; no reset --hard, checkout rollback, git clean, git add -A or broad deletion |
## MODIFIED Requirements
### Requirement: Backend SHALL compute candidate sets independently per ordered position
For a normalized query and immutable Archive/usable collection, the Backend SHALL apply common filters and evaluate candidate membership independently per operation browse position. Ranking multi-position AND semantics SHALL NOT collapse candidates.

With participants, the Backend SHALL union each person's selected identity raw works, then intersect all participants' raw work sets. A candidate identity SHALL survive only if it contributes to at least one work in that intersection. An all-position person row SHALL contain only surviving identities. Already-selected valid identities SHALL remain usable for existing identity-management toggles. No shared work SHALL yield zero eligible candidates. Candidate counts and metrics SHALL be built from the surviving identities' complete query-filtered contributions with the existing lightweight evaluator.

#### Scenario: A person matches only the second position
- **WHEN** a two-position query has a person eligible only for its second position
- **THEN** that person SHALL contribute only to that position count/list

#### Scenario: One selected person
- **WHEN** A is selected by its exact positions
- **THEN** each offered candidate identity SHALL share a raw work with A in that identity scope

#### Scenario: Pairwise cooperation without a shared group work
- **WHEN** A and B share X, C shares Y with A and Z with B, but C does not participate in X
- **THEN** C SHALL NOT be a candidate for the selected AB group

#### Scenario: Multiple identities and series
- **WHEN** participants have multiple selected identities and mergeSeries is enabled
- **THEN** each person's identities SHALL be unioned before raw-work intersection and distinct works of one series SHALL NOT create a match

#### Scenario: Empty and missing selection contributions
- **WHEN** selected identities have no common eligible raw work
- **THEN** candidates and all position counts SHALL be empty or zero without unconstrained fallback

### Requirement: Candidate core SHALL use bounded immutable cache semantics
The candidate core key SHALL include operation version, dataVersion, queryDigest, position scope/current-position input, canonical participant identities and personal collection digest only in personal mode. Participant order and per-person identity order SHALL NOT alter semantics. Search, sort, order, page and pageSize SHALL remain excluded. Published values and query facts SHALL remain immutable; failed cache admission SHALL NOT change successful business results.

#### Scenario: Two pages use one candidate core
- **WHEN** requests differ only by page or participant ordering
- **THEN** they SHALL share an eligible core while receiving separate projected views

#### Scenario: Selected identity changes
- **WHEN** participant membership or any selected identity changes
- **THEN** the requests SHALL NOT reuse an incompatible candidate core
