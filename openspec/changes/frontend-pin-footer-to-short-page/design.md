## Context

The shell is `#app > .app-shell > header + .app-page-scroll`, with main and
footer inside `.app-page-scroll`. The desktop main minimum height subtracts the
footer, but the compact override replaces it with 420px. Because neither shell
wrapper distributes unused height, a short compact page renders the footer
after 420px instead of at the viewport bottom.

## Goals / Non-Goals

**Goals:**

- Keep the footer at the viewport bottom on short pages.
- Keep it after content on long pages without overlay or a nested scroll area.
- Preserve Header, main widths, footer content, safe-area padding, focus, and
  all current query/result state geometry.

**Non-Goals:**

- No fixed/sticky footer, markup/copy/link changes, new breakpoint, page-height
  JavaScript, new dependency, broad shell redesign, or lifecycle operation.

## Change Boundary

| Field | Boundary |
|---|---|
| Status | Local specified/implemented/focused-verified only |
| Owner | Frontend shell/footer; primary agent accepts |
| Writable paths | This change; shell/footer-only `base.css`; exact shared shell test |
| Read-only protected inputs | App/footer markup and copy, product/design authorities, all feature state/styles, APIs/contracts, Backend/updater/Archive, external state |
| Deletion complement | Preserve all markup, links, safe-area/focus rules, main/result states, and viewport scroll ownership |
| Mutable refs | Current dirty worktree and task markers only |
| Consumes | Existing App/Header/page-scroll/main/footer DOM order and CSS flexbox |
| Produces | Normal-flow short-page sticky footer |
| Dependencies | Existing Frontend shell and `frontend-oracle-fidelity`; no package |
| Deliverables | Strict artifacts, CSS/test, focused build/browser evidence |
| Acceptance | Footer bottom within 1px on short 605×807; no overlay on long page; no overflow/new scroll owner |
| Non-goals | Footer redesign, fixed positioning, feature/data/API changes, broad cleanup |
| Operations deferred | Sync/archive, full gate, Git/release/deploy/host mutation |
| Stop/rollback conditions | Overlap, header shift, footer overlay, nested scroll, horizontal overflow, link/focus drift, failed checks |

Dependency direction remains `App DOM order -> shell flex height distribution ->
existing footer`; footer layout never owns feature state or viewport scrolling.

## Decisions

1. **Use the existing shell wrappers as a flex height chain.** `.app-shell`
   becomes a column flexbox and `.app-page-scroll` becomes a growing column
   flexbox. The footer uses `margin-top: auto`. This consumes unused height on
   short pages while intrinsic main content still grows the document.
2. **Keep the footer in normal flow.** `position: fixed` or `sticky` would cover
   result content, require padding compensation, complicate safe areas, and
   create a second responsive contract.
3. **Preserve the viewport as scroll owner.** No height clamp or overflow rule is
   added to `.app-page-scroll` or `.app-main`; long results continue scrolling
   through the document root.
4. **Verify source contract plus rendered geometry.** A focused CSS regression
   prevents removal of the flex chain or addition of fixed positioning, while
   Browser measurements cover short and long pages at the annotated width.

Oracle comparison keeps footer content, links, order, focus and touch behavior
as `PRESERVE_ORACLE`; only short-page vertical placement is the authorized
`INTENTIONAL_DELTA`. No new capability is introduced.

## Risks / Trade-offs

- **Flex growth shifts Header or result spacing** -> keep Header/main/footer
  spacing declarations unchanged and measure their rendered rectangles.
- **Long pages become internally scrollable** -> add no overflow/height cap and
  assert documentElement remains the only shell scroll owner.
- **Safe-area footer padding changes its computed height** -> retain the current
  footer rule intact except for `margin-top: auto` and measure the bottom edge.

## Migration Plan

Strict-validate artifacts, patch only the three shell/footer declarations, add
one source regression, then run focused Vitest/typecheck/build/detector/diff and
605px short/long Browser checks. Roll back only those exact CSS/test hunks if a
stop condition occurs. Root sync/archive and all Git/deployment states remain
deferred.

## Open Questions

None.
