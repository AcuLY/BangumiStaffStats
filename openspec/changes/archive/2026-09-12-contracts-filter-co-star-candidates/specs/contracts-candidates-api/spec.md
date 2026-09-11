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
### Requirement: Candidates contract SHALL separate input, view, and frontend state
The candidates request SHALL be a closed object containing required query, required input.positionKey (a permitted position or null for all-position aggregation), optional input.positionScope, optional input.participants and optional view. input.participants SHALL be an array of 0–10 distinct PersonIdentityV1 people with nonempty unique positionKeys and at most 20 identities overall. Omission and [] SHALL mean no selection constraint. All IDs and positions SHALL obey the existing exact identity validation and operation position scope. Selected UI flags, labels, images and response bodies SHALL NOT be accepted as participant input.

Search, sort, order, page and pageSize SHALL remain view fields. Personal scope SHALL allow count, average and globalAverage; global scope SHALL allow only count and average.

#### Scenario: Current position is omitted or unknown
- **WHEN** input.positionKey is absent or not allowed by the operation scope
- **THEN** the request SHALL fail with FIELD_INVALID at /input/positionKey

#### Scenario: Explicit selected identities constrain membership
- **WHEN** a candidate request contains valid input.participants
- **THEN** those identities SHALL constrain candidate membership without altering Shared Query or exposing UI state

#### Scenario: Invalid participants
- **WHEN** participants contain duplicate people, duplicate positions, null, invalid IDs, unsupported positions, more than 10 people or more than 20 identities
- **THEN** the endpoint SHALL reject the request with a field error before candidate computation

#### Scenario: Frontend selection flags are supplied
- **WHEN** the request supplies undeclared selected-person flags or response-only metadata
- **THEN** the closed contract SHALL reject them

### Requirement: Candidates response SHALL keep complete counts distinct from view totals
The success response SHALL carry ordered positionCounts for every operation browse position, each representing the complete unsearched unique-person count after the participant-membership filter. It SHALL separately carry current position, workUnit, ranked items and pagination total after search. Each item SHALL contain backend rank, person reference, returned valid positionKeys and subject/series workCount.

Ranks SHALL be assigned on the complete eligible sorted set before search/paging. Position counts SHALL change when participants change but SHALL NOT change with view fields or current-position selection. Candidate metrics SHALL retain their existing full eligible query contribution scope for surviving identities, rather than changing to common-work metrics.

#### Scenario: Search matches rank gaps
- **WHEN** search retains ranks 2 and 8 of the participant-constrained candidate set
- **THEN** ranks SHALL remain 2 and 8, pagination total SHALL be 2, and position counts SHALL remain unchanged

#### Scenario: Page is beyond the searched list
- **WHEN** a valid page is beyond the searched candidates
- **THEN** the endpoint SHALL return success with empty items, unchanged position counts and searched total
