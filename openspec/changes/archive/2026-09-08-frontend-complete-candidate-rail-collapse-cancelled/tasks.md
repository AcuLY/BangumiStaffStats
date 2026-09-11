## Task Boundary
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

Forbidden: destructive rollback, reset --hard, git clean, git add -A, broad deletion, undeclared writes and external mutation.

## 1. Implement — Frontend primary
- [x] 1.1 Recheck master/HEAD and exact current dirty slices; read all artifacts, review capability/state/focus boundaries and pass strict validation before applying.
- [ ] 1.2 Add the desktop disclosure, mounted hidden/inert picker and 56px layout.
- [ ] 1.3 Preserve explicit reveal and 779/780 focus transfers, selection and view state; add regressions.

## 2. Accept — primary
- [ ] 2.1 Run component/typecheck/build/affected gate and desktop/mobile/keyboard browser checks; inspect current user edits and git diff --check.
- [ ] 2.2 Sync and archive after acceptance, run strict all validation; keep Git/production integration out of scope.

## Planning review
Primary reviewed the current CoStarWorkspace focus owner and reveal functions, current rail card/mobile styles, and xicons. Collapse changes only local presentation. All recent user changes remain authoritative.
