> Supersession (2026-09-08): `contracts-remove-query-sharing` retires the query-sharing feature and overrides the sharing-specific requirements, preservation clauses, and acceptance assumptions below. URL fragments are cleared without parsing or replay. Header now has an always available same-tab “回到旧版” link to `https://search.bgmss.fun/old/` immediately left of theme. Exact accepted workspace recovery remains frontend-local through validated v2 JSON session storage; v1 fragment-based storage is discarded. Completed evidence below remains historical, and unrelated requirements are unchanged.

## Capability Boundary

- **Status:** local intentional candidate-picker delta.
- **Owner:** Frontend co-star vertical.
- **Writable paths:** candidate adapter/API/model/coordinator/share/selection,
  CandidatePicker/App/co-star CSS and focused tests, generated consumers,
  PRODUCT/DESIGN/sidecar, this change, root spec later.
- **Read-only protected inputs:** Backend ranking formulas, other frontend
  surfaces/wires, external state.
- **Deletion complement:** preserve single mode, counts, tray/actions/shares/states.
- **Mutable refs:** current worktree only.
- **Consumes:** strict server-ranked mixed items and catalog labels.
- **Produces:** default all-position option and atomic identity toggles.
- **Dependencies:** existing selection owner/Vue/Naive UI; no package.
- **Deliverables:** strict adapters/state/UI/tests/browser evidence.
- **Acceptance:** all default, readable mixed rows, limits/share/responsive safety.
- **Non-goals:** client ranking/aggregation or picker redesign.
- **Operations deferred:** full gates/lifecycle/Git/deployment.
- **Stop/rollback conditions:** client derivation, partial toggle, share/limit/overflow drift.

## ADDED Requirements

### Requirement: All-position candidate browsing SHALL remain backend-authoritative

At 780px and above, `/co-star` SHALL show the candidate picker as the existing
desktop rail; below 780px it SHALL use the existing bottom Drawer. The same
panel SHALL show selected counts, ordered removable identities, server-provided
position counts, a position selector whose first/default option is “全部职位”,
search, legal sort/order, rank, work count, pagination, pending, empty, error,
cancel, and retry states. The selector SHALL not show a redundant “浏览职位”
label.

All mode SHALL display the Backend-ranked person union and each row's returned
position labels. Candidate activation SHALL atomically toggle exactly the
row's returned `personId + positionKeys`; single mode continues to toggle its
one current identity. The UI SHALL not aggregate/rerank candidates, send
selection to `/candidates`, or bypass 10-person/20-identity limits.

#### Scenario: Candidate query first succeeds
- **WHEN** candidates are accepted with more than one applied position
- **THEN** null all-position input SHALL be selected by default and mixed rows displayed

#### Scenario: A mixed row has two identities
- **WHEN** the user activates that row
- **THEN** both returned identities SHALL be added or removed atomically in query order

#### Scenario: Identity limit rejects a mixed row
- **WHEN** adding its full identity set would exceed a limit
- **THEN** no partial identities SHALL commit and the existing limit error SHALL appear

#### Scenario: Candidate search is pending
- **WHEN** mixed-view search is sent
- **THEN** tray, selector, counts, toolbar, and focus remain while only rows/page load

`frontend-refine-ranking-detail-and-picker` receives next-write ownership of the
compact picker host. Its in-flow accordion requirement supersedes this change's
former bottom-Drawer clause; mixed candidate data and selection behavior remain.
