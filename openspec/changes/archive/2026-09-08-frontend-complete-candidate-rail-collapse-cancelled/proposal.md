## Why
Audit C10 found that DESIGN.md's desktop rail disclosure (retaining 56px when collapsed) has no entry point. Implement the specified behavior while preserving the user's new candidate surface and all selection interactions.

## What Changes
- Provide an accessible desktop collapse/expand action using the current NButton and xicons.
- Retain the mounted picker and all view/selection state while removing collapsed content from display, accessibility and Tab order.
- Set the collapsed desktop rail to 56px. A reveal action reopens it; retain the existing mobile accordion and focus-transfer contract.
- NEW_CAPABILITY relative to oracle 644b7748674e553f863d0ffd61d029f86fdc0717, explicitly specified by DESIGN.md and included in the user's audit-fix instruction.

## Capabilities
### New Capabilities
- None.
### Modified Capabilities
- `frontend-co-star-vertical`: desktop rail disclosure and focus continuity.

## Impact
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

No other repository or external state is writable. Apply waits for full artifacts, strict validation and primary review. No reset --hard, checkout rollback, git clean, git add -A, broad deletion or undeclared writes.
