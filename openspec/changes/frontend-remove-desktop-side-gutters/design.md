## Context

The shell sets `overflow-y: scroll` on `html`, so the vertical scrollbar track is present whether or not the document is tall. A later desktop media rule additionally sets `scrollbar-gutter: stable both-edges`; Chromium therefore reserves a second empty strip opposite the real scrollbar. Read-only production inspection at a 1440px browser viewport measured the root/app rectangle from approximately x=9.87 to x=1430.13 while the visual viewport was approximately 1430.13px wide, proving the left strip is layout geometry rather than `body` margin.

The page operates as a dense analysis tool. `PRODUCT.md` rejects whitespace that reduces browsing density, while `DESIGN.md` requires Header chrome to span the viewport and separately constrains Header, Query, Main, and Footer content to one 1280px line. Those contracts distinguish the outer chrome from the centered inner content.

## Change Boundary

| Field | Boundary |
|---|---|
| Status | Specified; apply only after strict validation and main-agent zero-P0/P1 review |
| Owner | Frontend |
| Writable paths | `frontend/src/shared/styles/base.css`; `frontend/tests/shared/scrollbar-system.test.ts`; `openspec/changes/frontend-remove-desktop-side-gutters/**`; lifecycle sync only at `openspec/specs/frontend-oracle-fidelity/spec.md` |
| Read-only protected inputs | `AGENTS.md`, `PRODUCT.md`, `DESIGN.md`, `.impeccable/**`, `tmp-formal-development/**`, oracle `644b7748674e553f863d0ffd61d029f86fdc0717`, all other tracked/untracked files, production URL |
| Deletion complement | No deletions |
| Mutable refs | Local `codex/remove-desktop-side-gutters` working tree only; no remote refs |
| Consumes | Existing root scrollbar styling, user report/screenshot, live computed geometry, design authorities |
| Produces | One CSS rule removal, one focused regression update, OpenSpec evidence |
| Dependencies | Existing CSS and frontend test/build toolchain; dependency direction remains `frontend tests -> frontend styles`, with no backend/contracts/updater dependency |
| Deliverables | Outer shell/chrome covers all non-scrollbar viewport width; inner 1280px content line remains centered |
| Acceptance | Focused test, full frontend check/build, layout detector, representative browser geometry, strict OpenSpec, `git diff --check` |
| Non-goals | Content max-width/gutters, component layout, scrollbar tokens, mobile behavior, copy/data/API changes, dependencies, sidecar refresh |
| Operations deferred | Release/deploy/activation/cache/public-route work; no repository operations definition or external mutation |
| Stop/rollback conditions | Stop on overlap, authority conflict, failing gates, overflow, alignment drift, mobile regression, or out-of-scope writes; rollback exact owned lines via inverse patch only |

## Goals / Non-Goals

**Goals:**

- Eliminate the synthetic gutter on the edge opposite the real vertical scrollbar.
- Preserve the always-present vertical scrollbar, scrollbar tokens, and stable available width across short/long content.
- Preserve the 1280px shared content line and all responsive component behavior.
- Make the intended viewport-edge geometry executable in a focused regression test.

**Non-Goals:**

- Do not stretch the analytical content beyond 1280px or remove its ordinary 12/16px responsive gutters.
- Do not change scrollbar width, colors, interaction, query-editor scroll ownership, or forced-colors behavior.
- Do not change mobile layout or any application state/API behavior.
- Do not release or deploy this correction.

## Decisions

### Remove only the desktop `stable both-edges` override

Keep the base `overflow-y: scroll` and `scrollbar-gutter: auto`. With a permanently scrollable root, the real scrollbar remains allocated on its native edge, so removing the media override eliminates only the mirrored empty strip.

Alternatives considered:

- `scrollbar-gutter: stable`: unnecessary because `overflow-y: scroll` already reserves the real track, and it adds no value over `auto` in this shell.
- Compensating with negative margins or `100vw`: would obscure the root cause and risk horizontal overflow under zoom or classic scrollbars.
- Matching the gutter color to the Header: would cosmetically hide one state while retaining wasted layout width and inconsistent surfaces.

### Test the forbidden behavior rather than a CSS implementation replacement

The focused test will continue to require the base shell scrollbar tier and `scrollbar-gutter: auto`, but will reject `stable both-edges`. Browser acceptance will compare root/app geometry to the visual viewport and verify that only the real scrollbar edge is excluded.

### Preserve oracle behavior outside the reported correction

The oracle comparison remains source/rendered evidence for content hierarchy, inner geometry, breakpoints, themes, and interaction. The only **INTENTIONAL_DELTA** is removal of the mirrored root gutter, governed by the user report plus PRODUCT/DESIGN density and full-width chrome rules. No **NEW_CAPABILITY** is introduced.

## Risks / Trade-offs

- **Risk: content shifts when document height changes** -> The root retains `overflow-y: scroll`, so the real scrollbar track remains present for both short and long documents.
- **Risk: inner content appears to move by half a scrollbar width** -> Acceptance checks the Header/Query/Main/Footer content line together; all are centered in the same post-scrollbar containing block.
- **Risk: overlay-scrollbar platforms mask the regression** -> Static regression forbids `both-edges`, while Chromium geometry verifies a classic visible shell scrollbar.
- **Risk: an unrelated dirty file is overwritten** -> Preflight rechecks the exact two implementation paths and stops on overlap; all existing untracked files remain protected.

## Migration Plan

1. Remove the desktop media block that applies `stable both-edges` to `html`.
2. Update the focused scrollbar test to forbid the symmetric gutter.
3. Run focused, full frontend, layout, and browser geometry acceptance.
4. Sync and archive the accepted delta locally. Release and deployment remain separate, unauthorized states.

Rollback is the inverse two-file patch restoring the media block and prior assertion; no data or schema migration exists.

## Open Questions

None. The user-visible defect, computed source, and controlling layout contracts identify one bounded correction.
