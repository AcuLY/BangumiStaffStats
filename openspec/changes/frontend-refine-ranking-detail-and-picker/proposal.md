## Why

Rendered checks at 568px and 961px exposed nine remaining presentation and
interaction defects: ranking headers do not share row tracks, person-work fact
grids shrink and leave open borders, shared pagination inherits obsolete grid
placement, the compact detail chrome carries an unwanted title, co-star summary
surfaces drift in padding/height/type, and compact person selection still uses a
modal bottom Drawer after the user explicitly requested an in-flow accordion.

## What Changes

- Align compact ranking headers and row values on the same named grid tracks.
- Stretch person-work facts across the complete card so role facts use the
  available width and every divider meets the card edge.
- Reset AdaptivePagination's leaked legacy child placement so summary, pages,
  and tools compose predictably in ranking, candidates, and person works.
- Remove the visible compact “人物详情” drawer title while preserving the
  labelled dialog, close action, focus trap, and scroll ownership.
- Remove desktop padding from the selected-people co-star overview.
- Match the compact query and selected-person summaries in one-line height,
  action size, and type scale; render query separators at normal weight.
- **BREAKING (interaction topology):** replace the compact co-star bottom
  picker Drawer with an accessible, vertically animated in-flow accordion under
  the selected-person summary. The desktop rail is unchanged.
- Add focused component/App regressions and rendered 568px/961px evidence.

All listed visual fixes and the compact accordion are user-authorized
`INTENTIONAL_DELTA` behavior. Unmentioned query, selection, ranking, person
detail, data, API, route, desktop rail, and visual behavior remains
`PRESERVE_ORACLE` against `644b7748674e553f863d0ffd61d029f86fdc0717`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `frontend-ranking-results`: compact headers and values share tracks, and
  shared pagination composes without leaked legacy placement.
- `frontend-person-inspector`: person-work facts close their borders and the
  compact detail dialog uses close-only chrome without a visible title.
- `frontend-co-star-vertical`: selected overview padding is removed and compact
  selection becomes an in-flow accordion instead of a bottom Drawer.
- `frontend-query-shell`: compact query/selection summaries share typography and
  single-line geometry, with normal-weight separators.

## Impact

- **Status:** local specification and implementation; not committed, pushed,
  merged, released, or deployed.
- **Owner:** Frontend; the primary agent owns specification, shared CSS,
  cross-breakpoint behavior, browser evidence, and final acceptance.
- **Writable paths:** this change; exact ownership-transfer notes in affected
  active changes; `DESIGN.md`, `.impeccable/design.json`;
  `frontend/src/app/App.vue`;
  `frontend/src/shared/styles/base.css`;
  `frontend/src/features/person-detail/person-detail.css` and
  `frontend/src/features/person-detail/components/{PersonDetailSurface,PersonItemBrowser}.vue`;
  `frontend/src/features/co-star/{co-star.css,co-star-analysis.css}` and
  `frontend/src/features/co-star/components/{MobileCandidateEntry,CoStarWorkspace,CoStarSurface}.vue`;
  focused ranking, person-detail, co-star, query, and App tests.
- **Read-only protected inputs:** API/generated contracts, query/statistical
  semantics, candidate ordering/limits, payloads, Archive/updater/backend,
  unrelated components/tests, remotes, hosts, and production.
- **Deletion complement:** delete no selection, result, metric, pagination
  action, detail content, close action, accessible name, desktop rail, query
  stage, route, test coverage, or recovery state; remove only obsolete compact
  Drawer presentation and the visible detail-title node.
- **Mutable refs:** current dirty local worktree and this change only; no Git or
  external ref mutation.
- **Consumes:** existing Vue/Naive/native disclosure primitives, 780px compact
  breakpoint, shared 44px target token, current accepted query/selection state,
  and incumbent CSS grid contracts.
- **Produces:** aligned compact ranking, closed person-work facts, stable shared
  pagination, close-only detail chrome, matched compact summaries, and an
  accessible in-flow person-picker accordion.
- **Dependencies:** existing Vue 3, Naive UI, CSS grid/container queries, and
  native button/region semantics only; no package change.
- **Deliverables:** strict-valid proposal/design/delta specs/tasks, source and
  tests, focused Vitest/typecheck/build/detector/diff evidence, and 568px/961px
  Browser screenshots with clean console and interaction checks.
- **Acceptance:** the nine annotated defects are absent; accordion toggle,
  Escape/focus, breakpoint transfer, and removal actions remain keyboard-safe;
  page and card scrollWidth stay contained; desktop rail/data behavior is
  unchanged.
- **Non-goals:** backend/data/API changes, broad redesign, new dependencies,
  unrelated CSS cleanup, full accumulated gate, lifecycle integration, or
  deployment.
- **Operations deferred:** root-spec sync/archive, complete accumulated gate,
  commit/push/PR/merge/release/deploy, and any host/production mutation.
- **Stop/rollback conditions:** stop on selection/request drift, lost recovery or
  focus, hidden content remaining tabbable, accordion clipping, pagination emit
  drift, horizontal overflow, desktop regression, failed focused acceptance, or
  any required write outside the declared paths; roll back only exact owned
  hunks with a normal patch.
- **External state:** no other repository, remote ref, service, host, or
  production state is mutated.

Apply is blocked until proposal, delta specs, design, and tasks are complete,
strict-valid, and reviewed/approved by the primary agent with zero unresolved
P0/P1 planning findings.
