## Task Boundary

| Field | Boundary |
|---|---|
| Status | Local residual implementation and focused verification complete |
| Owner | Frontend; primary agent owns all writes and acceptance |
| Writable paths | Exact proposal paths, this change, and explicit ownership-transfer notes |
| Read-only protected inputs | Query/API/statistics/candidate limits/final profile data, Backend/updater/Archive, external state |
| Deletion complement | Preserve all fields/results/actions/recovery/pagination/selection/skeleton sections/tests |
| Mutable refs | Current dirty worktree only |
| Consumes | Naive public render/placement APIs, responsive state, nullable input, final geometry |
| Produces | Ten closed residual fixes and direct regression evidence |
| Dependencies | Existing Vue/Naive/native DOM; no package |
| Deliverables | Source/docs/tests, strict specs, focused build/browser evidence |
| Acceptance | Every listed defect verified at relevant widths/input methods; no new P0/P1 |
| Non-goals | Backend performance/images, schema/data changes, full gate/lifecycle/deploy |
| Operations deferred | Full Frontend gate, sync/archive, commit/push/release/deploy/host mutation |
| Stop/rollback conditions | State/request drift, hidden recovery, pointer-only page action, body focus, overflow, selection or skeleton regression |

Forbidden: reset/checkout rollback, git clean, `git add -A`, broad deletion,
undeclared writes, external mutation, and production operations.

## 1. Planning and ownership — primary

- [x] 1.1 Recheck branch/HEAD/dirty paths, review all artifacts with zero P0/P1,
  strict-validate, and add exact next-write transfer notes to the four older
  active Frontend/Contracts changes before implementation.
- [x] 1.2 Update DESIGN/sidecar only for corrected selector placement, toolbar
  visible/effective geometry, pagination access, responsive focus, feedback,
  all-position copy, and skeleton mirroring.

## 2. Query and ranking shared interaction — Frontend

- [x] 2.1 Remove PositionSelector’s no-flip override and add real near-fold
  pointer/keyboard tests that prove viewport visibility without parent-height
  or horizontal-scroll change.
- [x] 2.2 Project one visible primary query feedback instance while preserving
  child/global feedback and all coordinator recovery state; add failure/cancel/
  child-operation tests.
- [x] 2.3 Replace ranking toolbar’s 44px visible overrides with public 34/28px
  geometry plus 44px effective hit regions; add desktop/compact measurements.
- [x] 2.4 Render native accessible prev/page/next/fast-jump buttons through
  AdaptivePagination public APIs, keep page events/reveal unchanged, and add
  keyboard/current/disabled/target-size tests across representative consumers.
- [x] 2.5 Align PositionSelector’s Light/Dark trigger text, placeholder,
  background, default/hover/focus boundary, and suffix icon with same-size Naive
  Select through project semantic tokens; remove only the suffix divider/fill
  while preserving its 44px target, rotation, search, and focus behavior.
- [x] 2.6 Refactor PositionSelector to public Naive DynamicInput rows with
  `min=1`, single-value replacement per row, unique-position disabling,
  ordered non-null model projection, stable external reconciliation, one open
  Popover, 44px add/remove click height, and shared “职位” / “选择职位” copy in both modes.
- [x] 2.7 Restore the pre-Dynamic compact catalog chrome at bounded 480px,
  preserve vertical-only scrolling, remove only the duplicate raw-Popover
  shadow, keep mode-specific semantics in Info help without a duplicate visible
  hint, preserve zero field right padding, and render size-matched square default
  DynamicInput actions with 44px click height without circle/quaternary/secondary variants.
- [x] 2.8 Use a start-aligned flex row with a fill-remaining selector and fixed
  right action group; keep shared 8px selector/action and action/action gaps,
  avoid `space-between`, and keep the last action flush with the field edge.

## 3. Co-star and person detail residuals — Frontend

- [x] 3.1 Transfer focus between disappearing rail/Drawer branches at 779/780
  without opening Drawer or moving external focus; add both-direction tests.
- [x] 3.2 Preserve explicit null all-position state ahead of stale payload and
  replace obsolete first-position help copy; test pending/view transition.
- [x] 3.3 Align PersonDetailSkeleton copy/portrait/edge geometry with final
  PersonProfile at desktop, 636px Drawer, and <=520px; add rendered geometry
  assertions rather than source-only checks.

## 4. Focused acceptance and deferred lifecycle — primary

- [x] 4.1 Run focused query/ranking/person/co-star/App Vitest, typecheck, Vite
  build, Impeccable detector, strict OpenSpec, and `git diff --check`.
- [x] 4.2 Browser-check 352/390/636/779/780/961: near-fold selector, toolbar
  borders/hit targets, keyboard pagination, one feedback owner, breakpoint focus,
  nullable pending state, skeleton/final geometry, overflow, and clean console.
- [x] 4.3 Keep complete accumulated gate, root sync/archive, Git integration,
  release, and deployment deferred until separately authorized.
- [x] 4.4 Add focused source/component assertions and browser-computed Light/
  Dark comparisons for PositionSelector versus adjacent Naive Select, including
  rest/hover/focus, placeholder typography, suffix hit geometry, overflow, and
  console; run typecheck, detector, strict validation, and `git diff --check`
  without the complete accumulated gate.
- [x] 4.5 Add focused DynamicInput tests for initial empty/selected rows,
  replacement, insertion/removal/minimum, duplicate prevention, parent reset,
  menu/focus ownership, both-mode copy, Light/Dark and narrow layout; run
  typecheck, detector, strict validation, and `git diff --check` without the
  complete accumulated gate.
- [x] 4.6 Add focused menu-width/overflow/chrome and default-action assertions; browser-
  check Light/Dark at desktop and 352px for menu viewport bounds, absent
  horizontal scroll, rectangular action background/border/radius, hit geometry,
  and clean console; run typecheck, detector, strict validation, and
  `git diff --check` without the complete accumulated gate.
- [x] 4.7 Add focused spacing assertions and browser-check 893px plus 352px for
  8px selector/action geometry, non-overlapping actions, a flush final
  right edge, and absent horizontal overflow; rerun the lightweight selector
  gate without the complete accumulated gate.

Row-spacing evidence: focused query/PositionSelector tests passed 34/34 and
Vue typecheck passed. Impeccable layout detection returned `[]`, the change is
strict-valid, the synchronized sidecar parses, and `git diff --check` passes.
At 893px and 352px the selector-to-actions and action-to-action gaps both
resolved to 7.99px browser geometry from the 8px token; the final action stayed
flush to the zero-inset field edge. Adding a second row preserved the same
geometry. Desktop
had zero page overflow; compact stayed within the accepted 1px subpixel
rounding allowance. Console warning/error output was empty, and the temporary
viewport was restored to 893×807.

Corrected menu/action evidence: focused query/PositionSelector tests passed
34/34 and Vue typecheck passed. Impeccable detection returned `[]`, the change
is strict-valid, the sidecar parses, and `git diff --check` passes. Mode-specific
ranking/co-star semantics remain in Info help without a duplicate visible hint,
and zero position-field right padding is preserved. At 893px the Light/Dark catalog is a compact 480px surface; at
352px it is about 318px with list scrollWidth equal to clientWidth and page
scrollWidth within clientWidth + 1. The catalog alone owns the Naive-equivalent
6px radius/background/menu shadow; the raw Popover wrapper shadow resolves to
none, eliminating the square outer layer. Add/remove actions are 34/28px square
default Buttons with 44px click height and public Naive
border tokens, and no circle/quaternary/secondary classes. The isolated Dark
audit produced no console warning/error.

Direct follow-up correction evidence: ranking and co-star expose their complete
position semantics only through the title Info Tooltip and accessible name; no
visible helper remains. At 893px the actions resolve to 33.99px squares; at
352px they resolve to 27.99px squares, both with 43.99px click height. The
selector flexes through the remaining row width, both visual gaps resolve to
7.99px, and the final action stays flush right without `space-between`. Clean
compact reload has zero horizontal overflow. Focused
query tests passed 35/35, Vue typecheck passed, Impeccable returned `[]`, the
sidecar parses, `git diff --check` passes, and both modes produced no console
warning/error.

Menu/action evidence: focused query/PositionSelector tests passed 34/34, Vue
typecheck passed, Impeccable detection returned `[]`, the change is
strict-valid, the synchronized sidecar parses, and `git diff --check` passes.
At 893px Light and Dark the catalog resolved to 640px content width with
`list.scrollWidth === list.clientWidth`; at 352px it resolved to about 318px
after accounting for the 10px shell scrollbar, with a 300px list, hidden
horizontal overflow, and page scrollWidth within clientWidth + 1. Rectangular
secondary action Buttons resolved to 34/28px visible size, 44px hit regions,
6px radius, visible theme-appropriate background, and Naive public border
tokens. The isolated Dark desktop/compact audit produced no console warning/
error.

Dynamic-row evidence: focused query/PositionSelector tests passed 34/34, Vue
typecheck passed, Impeccable detection returned `[]`, the change is
strict-valid, the design sidecar parses with synchronized DynamicInput rules,
and `git diff --check` passes. Browser checks verified shared “职位” /
“选择职位” copy in ranking and co-star, one-row replacement, add-and-autofocus,
duplicate disabling, ordered two-row projection, row removal with a disabled
last remove action, and same-row mutually exclusive replacement. At 893px
Light controls stayed 34px; at 352px Dark controls stayed 28px with 44px add/
remove hit regions. Both widths had zero horizontal overflow, and the isolated
Light/Dark audit tab produced no console warning/error.

Selector color evidence: focused PositionSelector/query tests passed 33/33 and
Vue typecheck passed. Impeccable detection returned `[]`; the change is
strict-valid and `git diff --check` passes. In an isolated localhost origin,
computed Light and Dark values matched the adjacent same-size Naive Select for
34px control height, 21px text line-height, background, entered text,
placeholder, 16px suffix icon, default outline, brand-hover boundary, active
brand boundary, and theme-specific focus shadow. The suffix remained a 44px
wide button with a 44px pseudo hit height, no divider or independent hover
fill. Both themes had zero horizontal overflow and no console warning/error.

Browser evidence covered native pagination buttons, labels, current/disabled
state, non-overlapping 44px hit geometry, pointer activation, and containment.
The in-app Browser keyboard driver could not repeatedly advance Tab or synthesize
Enter/Space even on control native buttons; no private key handler was added to
work around that tool limitation, and activation remains the browser-native
button behavior exercised by focused unit click/event tests.

`frontend-stabilize-ranking-result-layout` owns the next write only for the
root `html`/`body` minimum-width declarations and their exact viewport-scrollbar
test. All other completed residual tasks and evidence remain frozen here.

`frontend-auto-open-ranking-detail` owns the next write for primary ranking
pending, complete-zero/first-query empty presentation, exact base-CSS slices,
and focused ranking/query assertions. This change retains only the accepted
toolbar/pagination geometry when those controls render; no historical checkbox
is reopened.
