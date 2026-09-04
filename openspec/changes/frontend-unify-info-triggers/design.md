## Context

The audit found five interactive info-trigger classes using three SVG owners.
Query triggers establish the user-selected reference: a 16px ring-and-filled-dot
glyph inside a 24px, 6px-radius control, with a 44px pseudo-element hit target.
Person evidence instead uses AppIcon and a circular brand-soft active state;
partners and series explanations use CoStarIcon inside 44px square buttons with
different colors and no shared expanded presentation.

## Goals / Non-Goals

**Goals:**

- Make every interactive info/help icon visibly identical to the current query
  trigger in all themes and supported viewports.
- Remove glyph duplication by giving the three public icon wrappers one shared
  InfoIcon source.
- Keep every existing Tooltip/Popover interaction, accessible name/state,
  placement, content, focus, and Escape behavior.
- Preserve 44px effective targets without expanding the visible 24px box.

**Non-Goals:**

- No help-copy, placement/timing, data, empty-state illustration, unrelated icon,
  dependency, broad CSS, or feature behavior change.

## Change Boundary

| Field | Boundary |
|---|---|
| Status | Local specified/implemented/focused-verified only |
| Owner | Frontend shared design system; primary agent accepts |
| Writable paths | Exact proposal paths and two supersession notes |
| Read-only protected inputs | Product/design authorities, help content/state owners, empty-state illustration, unrelated icons/features, APIs/contracts/Backend/updater/Archive/external state |
| Deletion complement | Only duplicate info SVG branches and superseded local presentation rules; preserve controls/labels/events/targets/content |
| Mutable refs | Current dirty worktree and task markers only |
| Consumes | Query trigger reference, three icon wrapper APIs, native button and Naive Tooltip/Popover contracts |
| Produces | One InfoIcon and one `.info-trigger` visual/effective-target contract |
| Dependencies | Existing Vue/CSS/semantic tokens; no package |
| Deliverables | Strict artifacts, source/style/tests, focused build/browser evidence |
| Acceptance | Identical 16/24/44 geometry, glyph, radius and states across five classes; behavior and empty illustration preserved |
| Non-goals | Copy/placement/data/empty-state/unrelated icon/broad cleanup/lifecycle |
| Operations deferred | Root sync/archive, full gate, Git/release/deploy/host mutation |
| Stop/rollback conditions | Tooltip/Popover, a11y, target, layout, theme, illustration, test, or scope regression |

Dependency direction remains `shared InfoIcon + .info-trigger -> existing feature
wrappers/triggers -> unchanged Tooltip/Popover state owners`. Shared presentation
does not become an interaction or feature-state owner.

## Decisions

1. **Extract the exact query glyph.** `InfoIcon.vue` renders the reference
   `r=9`, 1.9px ring/stem, and filled dot. QueryIcon, AppIcon, and CoStarIcon
   delegate only `name="info"` to it and retain their existing public props,
   class names, and every other icon branch. This removes drift without forcing
   feature imports across boundaries.
2. **Use one explicit class contract.** Every interactive button receives
   `.info-trigger`. Base CSS owns its 24px visible box, 6px radius, tertiary
   color, transparent surface, `::before` 44px hit target, text-primary hover,
   and existing focus ring. Existing semantic classes remain only for layout and
   test/feature targeting.
3. **Delete conflicting local presentation.** Stat, partner, and series blocks
   stop owning width/height/radius/color/background/cursor/hit geometry. Their
   surrounding layout and Tooltip/Popover content styles remain unchanged.
4. **Do not style `aria-expanded` separately.** The chosen query reference has
   no persistent expanded background; hover/focus communicate the active
   interaction while `aria-expanded` communicates state accessibly.
5. **Keep decorative info separate.** CoStarSurface's 28px empty-state icon uses
   the shared glyph through CoStarIcon but is not a button and receives no
   `.info-trigger` box or interaction state.
6. **Verify both structure and rendering.** A shared source regression asserts
   one glyph owner and class coverage. Existing feature tests retain interaction
   semantics. Browser evidence measures query, person, and partners triggers in
   Light/Dark and compact/desktop conditions.

Oracle comparison classifies help content/interaction and empty illustration as
`PRESERVE_ORACLE`; trigger presentation alignment is the authorized
`INTENTIONAL_DELTA`; no new capability is introduced.

## Risks / Trade-offs

- **44px co-star buttons shrink visibly to 24px** -> retain 44px through the same
  `::before` geometry and measure adjacent text/layout at intermediate widths.
- **Delegating info breaks wrapper-specific selectors/tests** -> pass each
  wrapper's existing class to InfoIcon and update only source assertions that
  intentionally inspect the old branch.
- **Popover activation loses its brand-soft state** -> this is the requested
  alignment to query; preserve the focus ring and accessible expanded state.
- **Pseudo hit targets overlap neighboring controls** -> measure center spacing
  and test representative headings/metric rows at compact widths.

## Migration Plan

Add exact supersession notes, strict-validate, introduce InfoIcon and the shared
class, migrate each trigger, delete only conflicting local styles, then run
focused query/person/partners/co-star/shared tests, typecheck/build/detector/
diff, and browser geometry/state checks. Roll back only owned hunks. Root
sync/archive and every Git/deployment state remain deferred.

## Open Questions

None.
