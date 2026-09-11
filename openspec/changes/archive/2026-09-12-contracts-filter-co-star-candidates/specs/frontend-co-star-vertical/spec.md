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
## ADDED Requirements
### Requirement: Candidate views SHALL follow the exact selected group
The UI SHALL send current exact participant identities in each candidate view request. Adding/removing a person or identity SHALL immediately invalidate the displayed candidate membership, cancel superseded requests and request page 1 while preserving search, sort/order, page size and candidate position. Rows from a different participant set SHALL NOT be actionable during loading, failure or cancellation. Retry SHALL use the current desired participants. Candidate statistics SHALL remain server-owned.

#### Scenario: Rapid group changes
- **WHEN** A changes to AB and then back to A before the AB response completes
- **THEN** only the latest A membership SHALL become actionable

#### Scenario: Candidate refresh fails or is cancelled
- **WHEN** the selection-constrained refresh fails or is cancelled
- **THEN** old incompatible rows SHALL remain hidden or non-actionable, selected-person removal SHALL remain usable, and retry SHALL use the latest selection

#### Scenario: Clear all people
- **WHEN** the user removes the final selected person
- **THEN** candidates SHALL become unconstrained again without auto-selecting another person

#### Scenario: Initial default and saved selection
- **WHEN** an ordinary first query succeeds with no selection
- **THEN** the existing default-person rule SHALL run once and the follow-up candidate request SHALL contain that person's identities
- **AND** restoring a saved partners or multi-person analysis SHALL constrain its first candidate request using those saved identities without substituting a default

## MODIFIED Requirements
### Requirement: Candidate picker and tray SHALL provide one complete identity owner

At 780px and above, `/co-star` SHALL show the candidate picker as a desktop rail
with the DESIGN 348/320/300px responsive widths. The desktop rail SHALL remain
visible and SHALL NOT expose a whole-rail collapse control.
Below 780px, the selection entry SHALL stay in the content flow after the Query
Workspace and disclose the same CandidatePicker inline. The 0-person action
SHALL reveal that entry/panel. It SHALL NOT open a picker Drawer, lock the body,
make the App inert, or insert selection controls into the Header.
The same panel SHALL show selected people and identity
counts, ordered removable identities, whole-person removal, ordered
server-provided position counts, current-position selection, search, legal
scope-specific sort/order, rank, work count, 5/10/20 pagination, pending,
empty, error, cancel, and retry states.

Single-position candidate activation SHALL toggle its current
`personId + positionKey`. A mixed all-position row SHALL atomically add its
missing returned identities or remove that row's identities when all are selected;
partial selection SHALL have an explicit mixed state without duplicating the person.
The UI MAY overlay selected/current-other-identity
state locally and SHALL send exact identities only as input.participants to `/candidates`, without changing the
server rank/count. The tray SHALL be the only complete identity mutation
surface; analysis participant cards SHALL remain read-only. The UI SHALL
prevent more than 10 unique people or 20 total identities and expose a stable
accessible limit error.

#### Scenario: The same person has another selected identity
- **WHEN** a candidate row is not selected for the current position but the person has another selected position
- **THEN** the row SHALL retain its server rank and work count and expose the other selected identity as local presentation
- **AND** activating it SHALL add only the current identity

#### Scenario: Candidate search is pending
- **WHEN** debounced search has been sent for the current position
- **THEN** the selected tray, accepted position counts, toolbar, and focus SHALL remain visible
- **AND** only candidate rows and pagination SHALL enter an accessible pending state

#### Scenario: Mobile picker closes
- **WHEN** a keyboard user collapses the inline candidate panel after adding or removing an identity
- **THEN** focus SHALL return to the opening control when it still exists
- **AND** the selected order and corresponding analysis request SHALL remain intact
