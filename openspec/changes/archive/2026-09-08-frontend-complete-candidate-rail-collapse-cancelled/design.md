## Context
CoStarWorkspace owns desktop/mobile presentation and focus transitions. Its mounted CandidatePicker owns local search, sort and tray state. DESIGN requires a 56px collapsed desktop rail; recent user edits require keeping the shared selection card, NTag and xicons.

## Change Boundary
| Field | Boundary |
|---|---|
| Status | Specified; apply requires complete artifacts, strict validation and primary review |
| Owner | Frontend primary |
| Writable paths | This change; frontend/src/features/co-star/components/CoStarWorkspace.vue; frontend/src/features/co-star/co-star.css; frontend/tests/features/co-star/components.test.ts; openspec/specs/frontend-co-star-vertical/spec.md |
| Read-only protected inputs | PRODUCT, DESIGN, API/contracts/statistics, recent NTag/xicons/scroll/layout changes, other active changes |
| Deletion complement | Candidate/search/sort/page/tray/selection state, existing mobile accordion and breakpoint focus rules |
| Mutable refs | None; current master worktree |
| Consumes | Current compact breakpoint, selected identities and candidate component |
| Produces | Local desktop rail disclosure retaining 56px |
| Dependencies | Existing Vue/Naive UI/xicons only |
| Deliverables | Specification, component/CSS, keyboard/state regression and browser evidence |
| Acceptance | Toggle keeps state and makes hidden content unfocusable, 56px collapsed width, correct 779/780 focus transfer, affected frontend checks/build |
| Non-goals | New API/state persistence, mobile redesign, candidate computation or other audit changes |
| Operations deferred | Git integration, release, production/host mutation |
| Stop/rollback conditions | Concurrent conflicting edit, lost focus/selection, overflow or failed acceptance; no destructive cleanup |

## Goals / Non-Goals
Make the desktop rail hide/reopen without changing selection or requests. Keep existing mobile behavior and every current candidate affordance. No new persistence or API.

## Decisions
- CoStarWorkspace holds a local railCollapsed ref. It defaults expanded and is independent from mobile pickerExpanded.
- A named native NButton using existing left/right xicons remains visible in a small rail action row. aria-expanded and aria-controls describe the mounted panel.
- v-show plus inert/aria-hidden remove collapsed content from display and focus while preserving its component state. The desktop grid uses 56px for the rail only while collapsed.
- A deliberate picker reveal expands before focusing search. Crossing from focused mobile panel/summary to desktop also expands before the existing focus transfer. A focused desktop rail still hands focus to the mobile entry at the compact breakpoint.
- No animation is added; current reduced-motion behavior remains applicable.

## Risks / Trade-offs
- Unmounting would lose picker view -> preserve component mounting.
- Restoring focus into a hidden panel -> reopen before existing focus transfer.
- New button overlaps tray -> separate action row, current 44px target.
- Recent user styles -> edit only rail disclosure classes, preserving outer card tokens and mobile CSS.
