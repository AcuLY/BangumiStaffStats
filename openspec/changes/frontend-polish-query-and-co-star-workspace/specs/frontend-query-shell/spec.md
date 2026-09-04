## Capability Boundary

- **Status:** local intentional interaction polish.
- **Owner:** Frontend query shell, primary agent.
- **Writable paths:** QueryWorkspace silent-no-op/reveal slices, QueryEditor
  footer-copy deletion, exact query transition/attention/footer rules in base
  CSS, exact PositionCatalogBrowser list padding and PositionSelector leaf-close
  slices, App mode-loader/placeholder/reveal slices, coordinator applied-query/
  silent-no-op path, focused query/App tests, this change, root spec later.
- **Read-only protected inputs:** Query state/form fields, catalog/API contracts,
  other component rules, Backend/updater/Archive, and external state.
- **Deletion complement:** preserve all query fields, leaves, groups, selection,
  focus, results, and tests.
- **Mutable refs:** current local worktree only.
- **Consumes:** existing in-flow disclosure and catalog hierarchy.
- **Produces:** vertical disclosure motion, unindented position leaves, and
  direct target-mode loading from the current Applied Query.
- **Dependencies:** Vue Transition and existing semantic tokens; no package.
- **Deliverables:** CSS/component-test/browser/build evidence.
- **Acceptance:** height visibly interpolates with synchronized durations;
  leaves align without responsive overflow or state change.
- **Non-goals:** query/catalog semantics, field/layout redesign, dependencies.
- **Operations deferred:** full gate, lifecycle, Git integration, deployment.
- **Stop/rollback conditions:** state/focus/motion/overflow/test regression.

## ADDED Requirements

### Requirement: Query-shell interaction polish SHALL preserve reveal and feedback coherence

The in-flow Query Workspace SHALL preserve one disclosure, Draft/Applied state,
focus ownership, and document scroll ownership. Its editor SHALL animate
vertical expansion and collapse together with opacity: 160ms ease-out on enter
and 120ms ease-in on leave. The summary corner transition SHALL use the same
directional durations. Reduced-motion preference SHALL make both height and
opacity transitions immediate. Intermediate frames SHALL not show an
opacity-only panel whose document height has already jumped to its final state.

The hierarchical catalog SHALL preserve category disclosure, canonical
PositionKey selection, accessible focus, and responsive targets. Disclosed
position leaves SHALL have no extra inline-start list indentation relative to
their category content line; vertical group separation remains unchanged.
Activating a leaf SHALL update canonical selection and close the catalog,
restoring focus to the selector trigger; category disclosure SHALL remain open
until explicitly changed.

When an Applied Query exists and the user switches to a mode whose primary
resource is absent or does not match the current query revision, the shell SHALL
immediately load that target operation from the immutable Applied Query. It
SHALL NOT submit or overwrite a dirty Draft, advance revision solely for the
mode switch, or render an applied-only state asking the user to apply the same
conditions again. A matching accepted target resource SHALL be reused without
another request.

Submitting an unchanged Draft while an Applied Query exists SHALL be a silent
no-op: no transport, feedback/error status, editor collapse, revision, focus,
or result change. Real pending work SHALL remain named by the disabled submit
control and operation live region; the Query Editor footer SHALL not duplicate
that state with a separate left-side “查询中” label.

Activating the co-star first-query “设置查询条件” action SHALL scroll the
document to top, expand Query Workspace, and apply a temporary focus-colored
outline to the complete parameter panel. Desktop fine-pointer personal scope
SHALL focus UID; compact/touch/global SHALL focus the labelled Query Workspace
without forcing a text keyboard. Attention expiry SHALL not clear focus.
Ordinary summary disclosure SHALL not apply the temporary panel emphasis.
Reduced-motion preference SHALL remove smooth scroll/outline transition without
removing the resulting position, editor focus, or visible emphasis state.

#### Scenario: Query Editor opens or closes

- **WHEN** the user toggles the Query Workspace with motion enabled
- **THEN** both panel height and opacity SHALL interpolate over the established
  directional duration while results move with the panel in document flow
- **AND** summary corners SHALL finish at the same transition boundary

#### Scenario: Reduced motion is requested

- **WHEN** `prefers-reduced-motion: reduce` applies
- **THEN** height, opacity, and corner changes SHALL complete without animation
  while disclosure state and focus behavior remain unchanged

#### Scenario: A category is disclosed

- **WHEN** one or more position leaves appear under a catalog category
- **THEN** the leaf list SHALL add no left margin or inline-start padding
- **AND** leaf identity, target size, selected state, and compact layout SHALL
  remain unchanged

#### Scenario: A position leaf is activated

- **WHEN** the user selects or removes a position through a catalog leaf
- **THEN** canonical selection SHALL update and the catalog SHALL close with
  focus restored to its trigger

#### Scenario: Applied query is submitted unchanged

- **WHEN** Draft is semantically equal to Applied Query and submit is activated
- **THEN** no request or visible feedback SHALL occur and the editor SHALL stay open

#### Scenario: A real query is pending

- **WHEN** a primary operation is pending
- **THEN** the disabled submit action/live region SHALL communicate it without
  a duplicate left footer status

#### Scenario: Co-star first-query action reveals parameters

- **WHEN** the user activates “设置查询条件” from the co-star empty state
- **THEN** the document SHALL move to top, Query Workspace SHALL expand and
  briefly receive a whole-panel focus outline
- **AND** desktop personal focus SHALL enter UID while compact/touch/global
  focus SHALL remain on the labelled workspace after attention ends

#### Scenario: Summary opens normally

- **WHEN** the user activates the Query Workspace summary directly
- **THEN** disclosure SHALL preserve its existing behavior without the temporary
  whole-panel emphasis

#### Scenario: A different mode has no current result

- **WHEN** an Applied Query exists, Draft may be dirty, and the user switches to
  the other mode without a current-revision target resource
- **THEN** the target primary operation SHALL start from the Applied Query while
  Draft and query revision remain unchanged
- **AND** the mode SHALL show its real pending/result/error state rather than an
  instruction to apply the same query again

#### Scenario: A target-mode result is already current

- **WHEN** the user returns to a mode whose accepted primary resource matches
  the Applied Query and revision
- **THEN** that resource SHALL be reused without a duplicate request
