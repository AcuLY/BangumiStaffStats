## Why

The same interactive “more information” action currently uses three different
SVG geometries and four different trigger surfaces across query, person detail,
partners, and co-star work rows. Users therefore see inconsistent ring weight,
dot shape, box size, radius, color, and expanded feedback for one semantic role.

## What Changes

- Treat the current query-stage info trigger as the visual authority.
- Introduce one shared InfoIcon asset matching that exact 16px query glyph and
  reuse it through QueryIcon, AppIcon, and CoStarIcon.
- Apply one shared interactive trigger contract everywhere: 24px visible box,
  44px effective hit target, 6px control radius, tertiary default color,
  transparent background, text-primary hover, and the existing focus ring.
- Preserve each Tooltip/Popover's copy, placement, open/close owner, keyboard
  behavior, and accessible name/state.
- Keep the non-interactive 28px co-star empty-state info illustration separate.
- Add focused shared and feature regressions plus rendered query/person/co-star
  evidence in Light/Dark and compact/desktop states.

This is an `INTENTIONAL_DELTA` authorized by the user and governed by DESIGN's
icon-family/control consistency rules. All tooltip content, feature semantics,
and behavior outside the trigger presentation remain `PRESERVE_ORACLE` against
`644b7748674e553f863d0ffd61d029f86fdc0717`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `frontend-design-system`: define one reusable glyph and visual trigger
  contract for interactive info/help controls.
- `frontend-accessibility`: require the unified visible control to retain a
  44px effective target, accessible name/state, focus, and keyboard dismissal.

## Impact

- **Status:** local specification, implementation, and focused verification
  only; not committed, pushed, merged, released, or deployed.
- **Owner:** Frontend shared design system; the primary agent owns cross-surface
  sequencing and acceptance.
- **Writable paths:**
  `openspec/changes/frontend-unify-info-triggers/**`;
  exact supersession notes in
  `openspec/changes/frontend-auto-open-ranking-detail/proposal.md` and
  `openspec/changes/frontend-auto-open-ranking-detail/specs/frontend-person-inspector/spec.md`;
  `frontend/src/shared/components/{InfoIcon,AppIcon}.vue`;
  `frontend/src/features/query/components/{QueryIcon,QueryEditor}.vue`;
  `frontend/src/features/person-detail/components/StatEvidencePopover.vue`;
  `frontend/src/features/co-star/components/{CoStarIcon,PartnersSurface,CoStarWorkBrowser}.vue`;
  exact info-trigger declarations in
  `frontend/src/shared/styles/base.css`,
  `frontend/src/features/person-detail/person-detail.css`,
  `frontend/src/features/co-star/{partners,co-star-oracle}.css`;
  `frontend/tests/shared/info-trigger.test.ts`;
  focused query/person-detail/partners/co-star component tests.
- **Read-only protected inputs:** PRODUCT/DESIGN/sidecar; tooltip/popover copy,
  placement and state owners; non-info icons; co-star empty-state illustration;
  every API/query/result/data contract; Backend/updater/Archive; unrelated
  source/tests; remotes, hosts, and production.
- **Deletion complement:** delete only duplicated `info` SVG branches and
  superseded local trigger presentation rules; preserve every control, label,
  tooltip/popover, event, focus path, state, target, and decorative empty icon.
- **Mutable refs:** current local dirty worktree and this change's task markers
  only; no Git or external ref mutation.
- **Consumes:** current query trigger visual, AppIcon/QueryIcon/CoStarIcon public
  APIs, native buttons, Naive Tooltip/Popover, semantic tokens, and 44px target.
- **Produces:** one shared info glyph and one shared interactive trigger system
  used by five trigger classes across three product surfaces.
- **Dependencies:** existing Vue/CSS/Naive UI only; no package or generated
  artifact change.
- **Deliverables:** strict-valid proposal/design/two delta specs/tasks, shared
  asset/style/source/test changes, focused Vitest/typecheck/build/detector/diff
  evidence, and rendered compact/desktop Light/Dark interaction evidence.
- **Acceptance:** every interactive info trigger renders the same 16px glyph in
  a 24px visible box with a 44px effective target, 6px radius, identical token
  colors and hover/focus presentation; tooltip content and keyboard/click/
  Escape behavior remain unchanged; decorative empty-state info remains 28px;
  no overflow, layout drift, console error, or framework overlay.
- **Non-goals:** changing help copy, tooltip placement/timing, statistical
  evidence, empty-state illustration, unrelated icons/controls, dependencies,
  broad CSS cleanup, full accumulated gate, lifecycle, or production.
- **Operations deferred:** root spec sync/archive, complete accumulated gate,
  commit/push/PR/merge/release/deploy, and all host/production mutation.
- **Stop/rollback conditions:** stop on lost Tooltip/Popover state, inaccessible
  label/focus/Escape, target overlap, layout shift, empty-state drift, dark-theme
  contrast regression, failed focused checks, or required writes outside scope;
  roll back only exact owned hunks with a normal patch.
- **External state:** no other repository, remote ref, service, host, or
  production state is mutated.

Apply is blocked until proposal, design, both delta specs, and tasks are
complete, strict-valid, and reviewed by the primary agent with zero unresolved
P0/P1.
