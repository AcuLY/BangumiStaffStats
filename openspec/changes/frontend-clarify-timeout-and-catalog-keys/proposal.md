## Why

The complete Catalog legitimately repeats one canonical position under several
display groups, while the former flat Select required unique option values and
produced duplicate-key warnings. That correction is implemented, but the menu
still exposes every group at once and becomes an empty-looking overlay on
narrow screens instead of the PRODUCT/DESIGN category browser. Separately,
every `UPSTREAM_TIMEOUT` was described as a collection outage even when a later
query computation timed out.

## What Changes

- Preserve a stable group-scoped occurrence identity for every displayed
  Catalog copy while Query Draft, tags, validation, share state, and requests
  retain only canonical PositionKeys.
- Replace the flat menu with a custom two-level browser: category disclosure
  rows first and selectable position leaves second. Categories never select a
  whole group or cascade; the hand-curated shortcut group opens initially.
- Keep desktop and compact browsing in one anchored body-portal panel with
  viewport-aware placement and the same responsive browser content.
- Close either presentation when pointer activation occurs outside the trigger
  and browser, while inside selection/search/disclosure remains open.
- Switch non-empty search to one flat result per canonical PositionKey with all
  parent-category context; preserve duplicate synchronization, one tag,
  exclusivity, ordering, loading/error/retry, and query semantics.
- Map `UPSTREAM_TIMEOUT` to an operation-specific query-timeout message with a
  retry action; reserve “收藏数据暂时不可用” for actual upstream unavailable or
  protocol failures.
- Add focused component/API/browser regressions for identity, hierarchy,
  search, keyboard/touch behavior, narrow widths, and clean console output.

The accurate timeout copy and hierarchical responsive selector are
`INTENTIONAL_DELTA` behavior. The selector delta is explicitly authorized by
the user's current request and governed by PRODUCT.md lines 33-34, DESIGN.md
lines 323-325, and the accepted frontend implementation guide; it replaces
the oracle's flat external menu while preserving its query truth. Other visual
tokens, Catalog contents, results, and query semantics remain `PRESERVE_ORACLE`
against `644b7748674e553f863d0ffd61d029f86fdc0717`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `frontend-query-shell`: require unique occurrence identities, progressive
  category disclosure, canonical flat search, and desktop/compact presentations
  over one shared PositionKey selection.
- `frontend-ranking-results`: distinguish ranking request timeout copy from
  collection-unavailable copy.
- `frontend-co-star-vertical`: apply the same truthful timeout classification
  to candidates, person detail, partners, and co-star operations.

## Impact

- **Status:** local specification/implementation/focused verification only;
  not committed, pushed, merged, released, or deployed.
- **Owner:** Frontend; primary agent owns specification review and acceptance.
- **Writable paths:**
  `openspec/changes/frontend-clarify-timeout-and-catalog-keys/**`,
  `frontend/src/api/{rankings,candidates,coStar,partners,personDetail}.ts`,
  `frontend/src/features/query/components/PositionSelector.vue`,
  `frontend/src/features/query/components/PositionCatalogBrowser.vue`,
  `frontend/tests/api/{rankings,candidates,co-star,partners,person-detail}.test.ts`,
  `frontend/tests/features/query/components.test.ts`, and exact affected root
  specs during later sync/archive.
- **Read-only protected inputs:** PRODUCT.md, DESIGN.md,
  `.impeccable/design.json`, QueryEditor/query model/store/coordinator,
  Catalog/API/generated contracts, Backend/updater/Archive, result layouts,
  original dirty worktree, remotes, hosts, and production.
- **Deletion complement:** remove no Catalog group/position/shortcut, selected
  value/tag, query field, API behavior, generated contract, test coverage, or
  unrelated work; replace only inaccurate timeout branches and the obsolete
  flat Select presentation/adapter.
- **Mutable refs:** local `codex/remove-archive-admission` worktree only; no
  external or remote ref.
- **Consumes:** existing Catalog groups/positions/order, canonical PositionKey,
  Naive UI 2.44.1 public Popover/Input/Tag APIs, stable API error codes,
  PRODUCT/DESIGN, and the `<780px` compact-layout contract.
- **Produces:** unique occurrences with canonical synchronized selection,
  a hierarchical desktop/compact position browser, canonical flat search, and
  truthful operation timeout copy.
- **Dependencies:** accepted frontend capabilities, existing Naive UI 2.44.1,
  and the native local Backend; no new package or external system.
- **Deliverables:** code/tests, strict OpenSpec, focused typecheck/build/layout
  checks, browser DOM/console/screenshots/interactions, and no duplicate-key
  warning or responsive overflow.
- **Acceptance:** categories disclose independently and are never selectable;
  shortcut opens initially; leaves remain unique by occurrence and synchronize
  to one canonical key/tag; search is flat/deduplicated with category context;
  main/all exclusivity and order persist; the portal anchors without clipping;
  390px/320px use a bounded full-width panel and 44px touch
  targets; outside click, Escape/focus/keyboard work; timeout and unavailable
  copy differ.
- **Non-goals:** Catalog/API/generated DTO/Backend/request-timeout changes,
  group selection/cascade, static enums, different query semantics, form/result
  redesign, new dependency, theme change, or new retry loop.
- **Operations deferred:** accumulated full Frontend gate, root-spec sync/
  archive, commit/push/PR/merge/release/deploy, host and production mutation.
- **Stop/rollback conditions:** stop on overlapping edits, PRODUCT/DESIGN
  conflict, canonical selection drift, selectable/cascading groups, duplicate
  tags/keys, inaccessible disclosure, hover-only behavior, mobile overlay/
  overflow, clipped desktop panel, or failed focused checks; restore only the
  exact declared Frontend paths without touching Backend/runtime state.

`frontend-polish-query-and-co-star-workspace` receives the next write only for
the exact `.position-catalog-browser__positions` inline-start padding rule and
its new alignment assertion plus PositionSelector's post-leaf close/focus slice.
This change keeps every catalog identity,
hierarchy, search, responsive, outside-click, and timeout-copy output frozen.

`frontend-harden-interaction-reveal-focus` receives the subsequent compact
catalog scroll/focus/attention and 779/780 Popover-container unmount slices plus
their tests. It SHALL preserve canonical selection, leaf-close, Escape and
desktop positioning outputs.

Apply is blocked until the revised proposal, design, delta specs, and tasks are
strict-valid and reviewed by the primary agent with zero unresolved P0/P1.

`frontend-close-session-ui-residuals` receives the next write for
PositionSelector viewport-aware flip/placement and truthful co-star
all-position help. This change retains canonical occurrence identity, hierarchy,
search, selection/exclusivity, outside/Escape behavior, and all five factual
timeout mappings; its earlier compact in-flow/no-overlay shell is superseded.
