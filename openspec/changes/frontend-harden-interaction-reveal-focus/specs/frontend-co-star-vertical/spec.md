## Capability Boundary

- **Status:** local co-star focus/reveal hardening.
- **Owner:** Frontend co-star vertical.
- **Writable paths:** CandidatePicker/CoStarWorkspace/PartnersSurface/
  CoStarSurface/CoStarWorkBrowser/App exact reveal/removal branches, co-star CSS,
  shared helper, focused tests, this change, root spec later.
- **Read-only protected inputs:** candidate/partners/co-star APIs, data/ranking/
  selection limits and Backend.
- **Deletion complement:** preserve picker/tray/pagination/topology/locator/actions/states.
- **Mutable refs:** current worktree only.
- **Consumes:** accepted views, stable rail/analysis regions, one selection owner.
- **Produces:** page/rail/topology/locator reveal and removal focus restoration.
- **Dependencies:** existing selection/watchers/Drawer focus trap/AdaptivePagination.
- **Deliverables:** source/tests/browser/build evidence.
- **Acceptance:** all audited co-star transitions retain focus and target visibility.
- **Non-goals:** candidate/analysis/pagination/selection semantics.
- **Operations deferred:** full gate/lifecycle/Git/deployment.
- **Stop/rollback conditions:** partial selection, focus/body fallback, overflow, or request drift.

## ADDED Requirements

### Requirement: Co-star cross-region actions SHALL reveal stable targets

After accepted candidate, partners, or common-work pagination, the owning result
region SHALL scroll into view, receive semantic focus, and brief attention.
Desktop “选择人物” SHALL reveal the rail and enter candidate search; compact
continues using the Drawer contract. Activating a partner that changes topology
from one to multiple people SHALL reveal/focus the stable analysis region while
the co-star surface loads. Preference locators SHALL retain exact search focus
and add work-browser attention.

Removing an identity/person with keyboard SHALL restore focus to the nearest
surviving identity/person control, then tray control/persistent picker entry;
focus SHALL not fall to body. Attention expiry SHALL never blur focus. All
scroll/attention SHALL honor reduced motion and failed/stale requests SHALL not reveal.

#### Scenario: Desktop candidate rail is requested
- **WHEN** a keyboard user activates “选择人物” in desktop empty state
- **THEN** the rail SHALL be visible/emphasized and candidate search SHALL receive focus

#### Scenario: Candidate or analysis page succeeds
- **WHEN** page/pageSize commits in candidate, partners, or common works
- **THEN** its owning result boundary SHALL become visible/focused/emphasized

#### Scenario: Partner creates co-star topology
- **WHEN** one-person partner activation commits a second person
- **THEN** the stable analysis region SHALL receive focus/attention while new analysis loads

#### Scenario: Selected identity control is removed
- **WHEN** a keyboard user removes an identity or person
- **THEN** focus SHALL move to the nearest surviving tray/picker control and not body

#### Scenario: Preference work is located
- **WHEN** a co-star preference item commits exact work search
- **THEN** search focus SHALL remain and the work browser SHALL receive attention

`frontend-refine-ranking-detail-and-picker` receives next-write ownership of
the compact picker host and breakpoint focus branch. Its accordion replaces the
Drawer/focus-trap dependency; result reveal and removal focus behavior remain.
