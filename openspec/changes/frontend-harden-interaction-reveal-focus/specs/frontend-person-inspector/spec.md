## Capability Boundary

- **Status:** local Inspector reveal hardening.
- **Owner:** Frontend person Inspector.
- **Writable paths:** PersonInspector/PersonItemBrowser reveal/pagination slices,
  exact person CSS, shared helper, focused tests, this change, root spec later.
- **Read-only protected inputs:** person data/view semantics/API/Backend.
- **Deletion complement:** preserve browser controls/results/locator copy/states.
- **Mutable refs:** current worktree only.
- **Consumes:** accepted person-detail view and stable work browser.
- **Produces:** page and preference target reveal/attention.
- **Dependencies:** existing executeView and Inspector scroll owner.
- **Deliverables:** source/tests/browser/build evidence.
- **Acceptance:** pagination and locator reveal target without focus loss/overflow.
- **Non-goals:** person metrics/content/pagination semantics.
- **Operations deferred:** full gate/lifecycle/Git/deployment.
- **Stop/rollback conditions:** request/focus/scroll/Drawer regression.

## ADDED Requirements

### Requirement: Inspector work navigation SHALL reveal accepted results

After accepted work/series/character pagination, the PersonItemBrowser SHALL
scroll into its owning Inspector/Drawer view, focus its labelled region, and
briefly emphasize it. Preference “定位” actions SHALL keep exact search/input
focus and add whole-browser attention. Failed/stale requests SHALL not reveal.

#### Scenario: Person-item page succeeds
- **WHEN** page or page size commits
- **THEN** the work browser SHALL become visible/focused/emphasized in its scroll owner

#### Scenario: Preference work is located
- **WHEN** a preference item returns an accepted exact search result
- **THEN** search input focus SHALL remain and the complete work browser SHALL receive attention
