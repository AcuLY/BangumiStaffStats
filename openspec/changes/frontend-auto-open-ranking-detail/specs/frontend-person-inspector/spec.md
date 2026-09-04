## Capability Boundary

- **Status:** user-authorized local Inspector activation/geometry delta.
- **Owner:** Frontend person Inspector.
- **Writable paths:** App except transferred target-mode/co-star-default slices, PersonDetailSkeleton, PersonInspector,
  PersonDetailSurface, PersonProfile, RatingEvidence, StatEvidencePopover,
  shared AppIcon, person-detail CSS except transferred work-toolbar size rules,
  ranking/person component tests excluding new toolbar cases, this change,
  root spec at later sync.
- **Read-only protected inputs:** ranking/person-detail API/generated contracts,
  coordinator/query state, SafeImage implementation/proxy, Backend, external state.
- **Deletion complement:** preserve manual activation, latest-only requests,
  exact shares, drawers, content/evidence/images/tests.
- **Mutable refs:** current local worktree only.
- **Consumes:** accepted first ranking item, existing detail executor/resource,
  share workspace, compact drawer, SafeImage 3:4 dimensions.
- **Produces:** first-result activation, reusable pending skeleton, fixed portrait,
  stable evidence/chart interactions, and an accessible gap-free compact Drawer.
- **Dependencies:** accepted ranking/person-detail/query coordination; no package.
- **Deliverables:** source/CSS/tests/browser state and geometry evidence.
- **Acceptance:** one first-ID request for ordinary success, exact shares remain
  exact, compact automatic success keeps the drawer closed while manual row
  activation opens it, skeleton shared, portrait stays 3:4, hierarchy/focus/
  hover/scroll boundaries remain stable.
- **Non-goals:** person API/evidence/content/query/image-proxy changes.
- **Operations deferred:** full gate/lifecycle and all external integration.
- **Stop/rollback conditions:** wrong/double/stale request, share/drawer/focus/
  image geometry regression, overflow, or failed checks.

## ADDED Requirements

### Requirement: Inspector SHALL default ordinary ranking success to the first person

When an ordinary changed primary ranking query succeeds with at least one item,
App SHALL select the first item in the accepted backend order and start exactly
one request through the existing coordinated person-detail executor. Desktop
SHALL display that Inspector in place. Compact SHALL keep the existing detail
drawer closed after automatic selection and SHALL open it only when the user
activates a ranking row. Manual later row activation and latest-only stale
response protection SHALL remain unchanged.

An unchanged refresh SHALL rerun the current selected detail and SHALL fall back
to the accepted first person only when no selection exists. Ranking view-only
search/sort/page changes SHALL NOT replace the selected person automatically.
A share replay SHALL preserve its encoded workspace: an encoded detail selects
that exact person/view, while an omitted detail SHALL NOT invent a first-person
selection.

#### Scenario: Ordinary ranking query returns people

- **WHEN** an ordinary changed ranking query accepts items A, B, and C in that
  backend order
- **THEN** A SHALL become selected and exactly one person-detail request for A
  SHALL start through the existing coordinator
- **AND** B/C remain available for manual activation without a second owner

#### Scenario: Compact ordinary query succeeds

- **WHEN** the same ordinary query succeeds below 780px
- **THEN** the accepted first person MAY remain selected and its coordinated
  detail request MAY complete, but the Inspector drawer SHALL remain closed
- **AND** activating a ranking row SHALL open the existing drawer with its
  ordinary close/focus behavior

#### Scenario: Ranking share omits detail

- **WHEN** a valid ranking share accepts rankings but contains no detail workspace
- **THEN** no person-detail request SHALL be invented and no person SHALL be
  selected solely because the ranking contains items

### Requirement: Inspector profile loading and portrait geometry SHALL remain stable

App and PersonInspector SHALL reuse one person-detail skeleton component for
the same pending information hierarchy. Its profile portrait track SHALL mirror
the real SafeImage geometry. The real portrait SHALL keep the SafeImage 3:4
dimensions and align to the start of its text region; adjacent name, career,
secondary name, and summary height SHALL NOT stretch or squash the portrait.
Desktop and wider compact drawers SHALL use 160×213; narrow layouts at or below
520px SHALL use 96×128. Every compact/drawer portrait SHALL have no corner radius. In each person work card,
the “参与职位” value SHALL use emphasized data weight while its label retains
the existing secondary hierarchy.

#### Scenario: Detail waits after ranking acceptance

- **WHEN** the first person is selected but its detail response is still pending
- **THEN** the Inspector SHALL continue with the same profile/metrics/section
  skeleton used during primary ranking pending

#### Scenario: Person text is taller than its portrait context

- **WHEN** the person has long names, careers, or a multi-line summary
- **THEN** the portrait SHALL remain at its 3:4 image-derived dimensions while
  text follows existing wrap/clamp/expand behavior without distorting the image

#### Scenario: Compact profile and work role are rendered

- **WHEN** person detail is displayed in a narrow container or compact drawer
- **THEN** its 96×128 portrait SHALL meet the profile edge without rounded
  corners
- **AND** every work card SHALL render the participation-role value in strong
  weight without changing the label or server-provided text

### Requirement: Inspector presentation SHALL preserve hierarchy and stable interaction geometry

The profile identity and biography SHALL occupy natural top-aligned rows beside
the fixed portrait; spare portrait height SHALL NOT vertically distribute or
center the biography. Drawer “人物详情” SHALL use the 24px Panel typography step,
while “评分分布” and peer section headings SHALL use the 20px Section step.

Metric evidence triggers SHALL use the shared AppIcon information-circle
resource, remain optically centered in the 24px visible box, retain the existing
44px effective target and accessible name, and preserve hover/focus/click/Escape
Popover behavior. Each non-empty rating bucket SHALL render its count immediately
above the visible bar. Its tooltip SHALL remain stable while the pointer moves
within the bar hit area and SHALL NOT intercept pointer hit-testing or flicker.

Opening a compact Drawer SHALL focus its labelled dialog container, not paint a
persistent close-button focus ring. Keyboard traversal SHALL retain visible
focus and wrap within the dialog. The Drawer SHALL lock the actual document
scroll owner while preserving scroll position and sticky Header placement, so
its existing Header-bottom top boundary never exposes Query Editor or ranking
content when the background page is scrolled. Closing SHALL restore the exact
prior overflow, background accessibility state, and opener focus.

#### Scenario: Profile and section hierarchy are rendered

- **WHEN** a compact Inspector displays a portrait, identity, biography, Drawer
  title, and rating section
- **THEN** identity and biography SHALL begin at the top in natural sequence
- **AND** “人物详情” SHALL be 24px and SHALL not be smaller than the 20px
  “评分分布” heading

#### Scenario: Metric evidence and score bars are inspected

- **WHEN** evidence help and a non-empty rating bar render and receive pointer or
  keyboard interaction
- **THEN** the shared information icon SHALL be centered with its accessible
  label and the count SHALL sit above the corresponding fill
- **AND** tooltip visibility SHALL remain stable without pointer interception or
  layout movement

#### Scenario: Drawer opens over an expanded query

- **WHEN** the page is scrolled, Query Editor is expanded, and a ranking person
  opens the compact Drawer
- **THEN** the sticky Header SHALL occupy the reserved top strip and no query or
  ranking content SHALL appear between viewport top and Drawer
- **AND** initial focus SHALL be on the dialog, keyboard focus SHALL remain
  visible inside it, and close SHALL restore the previous scroll/accessibility
  state

`frontend-refine-ranking-detail-and-picker` receives next-write ownership of
compact detail chrome. Its close-only bar supersedes the visible 24px “人物详情”
title requirement; the dialog's accessible name, focus, close, and scroll
contracts remain unchanged.

`frontend-unify-info-triggers` receives next-write ownership of the metric
evidence info glyph and trigger presentation. Its query-reference glyph, 24px
visible box, 6px radius, token colors, and shared focus/target contract
supersede only the AppIcon/circular/brand-soft presentation above; evidence
content, Popover semantics, accessible name, effective 44px target, and
hover/focus/click/Escape behavior remain unchanged.
