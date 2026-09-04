## Task Boundary

| Field | Boundary |
|---|---|
| Status | Compact-selector revision verified; prior full gate retained; lifecycle deferred |
| Owner | Frontend interaction/focus layer; primary agent accepts |
| Writable paths | Exact proposal paths and older-change transfer notes |
| Read-only protected inputs | API/contracts/data/query/Backend/updater/external state |
| Deletion complement | Preserve controls/results/actions/states/tests |
| Mutable refs | Current worktree only |
| Consumes | Accepted views, stable regions, focus/reduced-motion tokens |
| Produces | Reveal helper, focus-safe transitions, compact catalog/targets |
| Dependencies | Existing Vue/Naive/native DOM; no package |
| Deliverables | Source/tests/spec/build/detector/browser evidence |
| Acceptance | All audited P1/P2 resolved across desktop/compact/breakpoints |
| Non-goals | Data/pagination/route/restyle/dependency/deploy changes |
| Operations deferred | Sync/archive, Git/release/deploy |
| Stop/rollback conditions | Request/focus/selection/overflow/visual/test regression |

Forbidden: reset/checkout rollback, git clean, broad deletion/staging,
`git add -A`, undeclared writes, external mutation, and production operations.

## 1. Planning and ownership

- [x] 1.1 Preflight branch/HEAD/dirty paths, reconcile active change write
  ledgers/cumulative requirement titles/DESIGN, strict-validate, and stop on mismatch.

## 2. Shared reveal and pagination consumers

- [x] 2.1 Add the DOM-only reveal composable and shared semantic attention style
  with retained focus, scroll margin, forced-colors, and reduced motion.
- [x] 2.2 Apply accepted-response page/page-size reveal to RankingResults,
  PersonItemBrowser, and CoStarWorkBrowser with focused tests.
- [x] 2.3 Apply the same contract to CandidatePicker and PartnersSurface without
  changing search/sort/latest-only behavior; add focused tests.

## 3. Query shell and responsive targets

- [x] 3.1 Keep compact/global QueryWorkspace focus after attention timeout and
  align desktop/compact focus policy tests/specs.
- [x] 3.2 Fully unmount desktop PositionSelector Popover in compact mode, close
  on breakpoint change, and reveal/focus/attend compact dialog by input method.
- [x] 3.3 Restore compact Query Editor effective targets to 44px while retaining
  Naive small visible geometry; add 390/779/780/961 source/browser checks.
- [x] 3.4 Align compact PositionSelector with neighboring 28px Naive controls,
  use one anchored Popover without parent-height change, and verify 352/390 plus
  779/780 cleanup, focus, outside-dismissal, and overflow behavior.
- [x] 3.5 Move catalog search into the trigger combobox, remove the duplicate
  panel field, align compact list height to Naive small
  selector, and verify rounded bottom clipping plus trigger typing.
- [x] 3.6 Remove catalog/arrow-specific focus borders and align menu radius,
  neutral shadow, open/close, search, selection, and keyboard states with Naive
  selector behavior.
- [x] 3.7 Align group, option, selected, search, pending, and disabled item
  geometry to measured Naive small/medium menu metrics and verify computed
  dimensions at 375/780px.
- [x] 3.8 Align catalog group labels with the Naive menu tertiary-gray heading
  token while preserving primary selectable-option text; verify Light/Dark at
  375px.
- [x] 3.9 Apply the corrected interactive-menu evidence: restore primary group
  labels, add 4px group block padding, and match Naive's inset 6px rounded
  300ms option/group state fade across Light/Dark, compact/desktop,
  pointer/keyboard, selected, disabled, and reduced-motion states.

## 4. Co-star topology, locators, and destructive focus

- [x] 4.1 Reveal/focus desktop candidate rail and stable analysis region across
  Partners -> CoStar topology replacement.
- [x] 4.2 Add whole-browser attention to person/co-star preference locators while
  retaining exact search and input focus.
- [x] 4.3 Restore nearest surviving tray/picker focus after identity/person
  removal, including 2->1 and 1->0 topology changes; add keyboard tests.
- [x] 4.4 Bound ordinary default selection by complete returned identity sets and
  the 20-identity limit without partial identities or user-action limit errors.

## 5. Focused acceptance and deferred lifecycle

- [x] 5.1 Run focused query/ranking/person/co-star/App Vitest, Vue typecheck/build,
  detector, strict coordinated changes, and `git diff --check`.
- [x] 5.2 Browser-check Light/Dark at 390/779/780/961 plus dynamic 780->390:
  accepted pagination, compact catalog near fold, candidate/analysis reveal,
  locator attention, removal focus, target geometry, ID/overflow/log state.
- [x] 5.3 After the accumulated batch, run the complete Frontend gate under
  pinned Node 24.18.0 and retain the completed browser matrix.
- [ ] 5.4 During a separately authorized lifecycle pass, sync/archive in
  dependency order; keep commit/push/release/deploy false in this session.
