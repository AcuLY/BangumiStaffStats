## Task Boundary

| Field | Boundary |
|---|---|
| Status | Local specified; implementation pending |
| Owner | Frontend shell/footer; primary agent accepts |
| Writable paths | This change; shell/footer-only `frontend/src/shared/styles/base.css`; `frontend/tests/shared/shell-layout.test.ts` |
| Read-only protected inputs | App/footer markup and copy, all feature state/styles/tests, product/design authorities, APIs/contracts, Backend/updater/Archive, external state |
| Deletion complement | Preserve markup, links, separators, safe-area/focus rules, main states, and viewport scroll ownership |
| Mutable refs | Current dirty worktree and task markers only |
| Consumes | Existing shell/header/page-scroll/main/footer DOM order |
| Produces | Normal-flow short-page sticky footer |
| Dependencies | Existing CSS flexbox and accepted footer capability; no package |
| Deliverables | CSS/source test plus focused build/browser/OpenSpec evidence |
| Acceptance | ≤1px short-page bottom gap; long-page non-overlap; no nested/horizontal scroll or footer interaction drift |
| Non-goals | Fixed footer, redesign/copy/link/feature/API changes, broad cleanup |
| Operations deferred | Full gate, sync/archive, Git/release/deploy/host mutation |
| Stop/rollback conditions | Stop on dirty overlap, header shift, overlay, nested scroll, overflow, link/focus drift, failed checks, or undeclared write |

Forbidden: reset/checkout rollback, git clean, `git add -A`, broad deletion,
undeclared/generated/Backend/external writes, and production operations.

## 1. Planning and ownership — primary

- [x] 1.1 Verify branch/HEAD/dirty paths, inspect the current shell/footer CSS,
  accepted footer capability, archived footer owner, and focused test; require
  strict-valid reviewed artifacts and zero unresolved P0/P1 before apply.

## 2. Shell footer implementation — primary

- [x] 2.1 Make `.app-shell` and `.app-page-scroll` a normal-flow column flex
  height chain and give `.app-footer` automatic leading margin, without changing
  Header/main/footer spacing, introducing fixed positioning, or adding overflow.
- [x] 2.2 Add a focused shared source regression for the flex chain, footer
  normal-flow contract, and absence of fixed/sticky positioning.

## 3. Focused acceptance — primary

- [x] 3.1 Run the exact shared test, Vue typecheck, Vite build, Impeccable
  detector, strict OpenSpec validation, and `git diff --check` without the
  complete accumulated gate.
- [x] 3.2 Browser-check 605×807 short empty-query geometry and a long ranking
  result: footer bottom gap, non-overlap, root scroll ownership, scrollWidth,
  unchanged links, framework overlay, and fresh console logs.
- [x] 3.3 Keep root spec sync/archive, complete accumulated gate, Git integration,
  release/deployment, and all host/production mutation deferred.

  Evidence: the dedicated shell-layout Vitest passed 1/1; Vue typecheck and
  Vite production build passed; Impeccable detection returned `[]`; this change
  is strict-valid and `git diff --check` passes. At 605×807 with Query Editor
  collapsed, the short page measured a 0.27px footer-bottom gap, `position:
  static`, root scrollHeight equal to clientHeight, and no horizontal overflow.
  A long ranking page measured 1167px root scrollHeight; the footer began at the
  main bottom, remained static, and `.app-page-scroll` overflow stayed visible.
  Both states kept the exact two links, no framework overlay, and no fresh
  console warning/error. Full gate and every lifecycle/external state remain
  deferred.
