## Capability Boundary

- **Status:** local intentional layout correction.
- **Owner:** Frontend ranking/shared pagination.
- **Writable paths:** shared ranking/pagination CSS, focused ranking/person/co-star tests, this change, root spec later.
- **Read-only protected inputs:** ranking payloads, view requests, page events, Backend/contracts/external state.
- **Deletion complement:** preserve every metric, header, row, page/size/jump action, result, label, and reveal behavior.
- **Mutable refs:** current dirty worktree only.
- **Consumes:** current ranking DOM order, container breakpoint, AdaptivePagination public nodes.
- **Produces:** aligned compact columns and deterministic shared pagination placement.
- **Dependencies:** existing CSS/Vue/Naive only.
- **Deliverables:** source/tests/browser/build evidence.
- **Acceptance:** 568px metric centers align; <=340px retains two rows; pagination has no implicit-column drift or overflow.
- **Non-goals:** ranking/pagination semantics or new controls.
- **Operations deferred:** full gate/lifecycle/Git/deploy.
- **Stop/rollback conditions:** metric/header drift, page event drift, hidden action, overflow, consumer regression.

## ADDED Requirements

### Requirement: Compact ranking columns and shared pagination SHALL retain one layout owner

At compact widths above the narrow two-line container threshold, ranking header
and row SHALL place rank, avatar, identity, and metric groups on the same four
tracks. At the established narrow container threshold the header and row SHALL
switch together to the same two-line area map. AdaptivePagination SHALL reset
obsolete responsive child placement at its shared owner so summary, pages, and
tools follow DOM order unless a consumer explicitly supplies a stronger layout;
page actions SHALL remain nowrap and tools SHALL wrap when needed.

#### Scenario: Ranking renders at 568px
- **WHEN** the compact ranking header and first result row are measured
- **THEN** every metric heading SHALL share the horizontal track of its value
  and no unused metric track SHALL remain to the right

#### Scenario: Ranking pane crosses the narrow container threshold
- **WHEN** the same result renders immediately above and at the established
  narrow threshold
- **THEN** header and row SHALL change from one line to two lines together
  without changing metric order or meaning

#### Scenario: Shared pagination renders in person works
- **WHEN** AdaptivePagination is outside Ranking Workspace in a compact person
  detail dialog
- **THEN** summary, pages, and tools SHALL remain in natural order, tools MAY
  wrap, and scrollWidth SHALL not exceed clientWidth by more than one pixel

#### Scenario: Other pagination consumers render
- **WHEN** ranking, candidates, partners, or co-star works use the same component
- **THEN** their explicit higher-level layout and page/page-size events SHALL
  remain unchanged
