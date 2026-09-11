## Capability Boundary

- **Status:** local residual correction.
- **Owner:** Frontend ranking/shared pagination.
- **Writable paths:** AdaptivePagination, exact ranking toolbar/pagination CSS,
  focused ranking/shared-consumer tests, design authorities, this change, root spec later.
- **Read-only protected inputs:** page/view/request semantics, consumers’ data,
  Naive private implementation, Backend/contracts/external state.
- **Deletion complement:** preserve page, size-picker, jumper, summaries,
  accepted-response reveal, labels, and every consumer.
- **Mutable refs:** current dirty worktree only.
- **Consumes:** Naive public pagination render props and public size props.
- **Produces:** size-consistent toolbar and native keyboard/touch pagination.
- **Dependencies:** existing AdaptivePagination/SortDirectionButton; no package.
- **Deliverables:** source/tests/browser/build evidence.
- **Acceptance:** 28/34 visible toolbar, >=44 targets, Tab/Enter page operation.
- **Non-goals:** pagination/data semantics or private DOM patching.
- **Operations deferred:** full gate/lifecycle/Git/deploy.
- **Stop/rollback conditions:** page emit drift, overflow, focus loss, styling regression.

## ADDED Requirements

### Requirement: Ranking controls and pagination SHALL share public geometry and input access

Ranking search, sort, and order SHALL visibly resolve to Naive medium 34px at
desktop and small 28px below 780px while exposing at least 44px effective
targets. AdaptivePagination previous/page/next/fast-jump actions SHALL be native
focusable buttons with accessible names, current/disabled state, visible focus,
and at least 44px effective targets. Public Naive theme keys SHALL space adjacent
targets so they meet without overlap and SHALL reserve matching inline edge
space without a private implementation selector. The shared implementation
SHALL serve all five consumers without changing their page/page-size events or
accepted-result reveal behavior.

#### Scenario: Rendered ranking toolbar is measured
- **WHEN** a non-zero ranking result renders its toolbar at desktop or compact width
- **THEN** Input, Select, and direction Button SHALL have equal visible height
  for that public size and each effective target SHALL be at least 44px

#### Scenario: Keyboard user changes page
- **WHEN** focus reaches a noncurrent pagination button and Enter or Space is used
- **THEN** the existing page event SHALL fire once and accepted-result reveal
  SHALL run exactly as for pointer activation

#### Scenario: Current or disabled page control renders
- **WHEN** the page item is current, pending, first-prev, or last-next
- **THEN** the native button SHALL expose current/disabled state and SHALL not emit

#### Scenario: Pagination renders in every consumer
- **WHEN** ranking, candidates, partners, person items, or co-star works use the
  shared pagination
- **THEN** keyboard semantics, target size, wrapping, and horizontal containment
  SHALL be identical without consumer-local DOM patches
