# Icon migration evidence

## Implementation

Naive UI 2.44.1's installed README.md line 82 (README.zh-CN.md line 84)
recommends xicons. The sole added dependency is @vicons/ionicons5 0.13.0,
MIT licensed, sideEffects=false, Vue 3 components with no added dependencies.
All existing lockfile package entries were compared and remain unchanged.

AppIcon explicitly imports 17 outline components and maps existing semantic
names; InfoIcon imports InformationCircleOutline. QueryIcon and CoStarIcon
delegate to those shared owners. The library owns all glyph paths. Final
rendering uses the vendor's Vue SVG component directly to preserve the
existing SVG root, width/height, currentColor, classes and aria-hidden behavior.
An intermediate NIcon wrapper was removed to avoid unnecessary runtime/DOM
overhead. No budget was relaxed.

BGMSS image/favicon were not edited. Existing unrelated chart edits were
preserved; this task did not write either chart. A source scan found inline
SVG drawing elements only in CoStarRatings.vue and RatingEvidence.vue, both
data-chart owners. No business-icon drawing remains in application sources.
Unused example icons AirplaneOutline, LogoYoutube and AccessibilityOutline
were absent from the generated JavaScript; imports are explicit and limited
to the chosen family.

## Validation

Commands use Node 24.18.0 and npm 11.16.0 through the existing pinned npx flow.

- Final icon and SafeImage tests: 26 tests passed, validating all mappings,
  shared information glyph, sizes, decorative accessibility and fallbacks.
- Vue typecheck and Vite production build passed after the final direct-SVG
  change.
- Broader test run: 499 of 501 passed; the two failures were existing drawer
  root-inert assertions in rankings.integration.test.ts. A later focused query
  run encountered a concurrent QueryWorkspace scrollIntoView change while its
  test still expected scrollTo; no query/drawer code was changed for this task.
- The complete frontend check stops at existing inventory extras:
  ContentDivider.vue, vite-dev.err.log and vite-dev.out.log. They were preserved.
- Production artifact acceptance fails the initial JavaScript gzip budget:
  309420 bytes versus 307200 bytes. The direct-SVG change reduced the earlier
  310228-byte measurement but did not bring the full current checkout under
  budget. No unrelated module or threshold was modified to mask this failure.
- Owned diff hygiene passed. Strict all-spec validation passed 84 items before
  the final documentation wording adjustment; final change strict validation
  also passed.

## Rendered checks

The actual built artifact was served on temporary loopback port 5190 using the
repository catalog fixture (not a live backend). In-app browser checks at 360
and 1440 CSS pixels confirmed 18px Header icons, 16px help icons, the library's
512x512 viewBox, preserved BGMSS asset, no persistent horizontal overflow,
keyboard traversal and theme switching. Help disclosure was exercised in the
development preview. Both themes rendered with inherited currentColor and no
console errors in the fresh production page. The temporary viewport overrides,
tabs and QA server were cleaned up after verification.

## State

Implemented, focused-verified and specifications synchronized. Full acceptance
and archival remain blocked by the recorded gates. No commit, push, release,
deployment or changes to unrelated runtime services.
