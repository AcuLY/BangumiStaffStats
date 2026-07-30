## Why

The production SPA replaced the approved prototype footer links with the
implementation-facing sentence “数据口径以当前查询与 Archive 版本为准”.
That sentence is not an approved product delta, is unclear to ordinary users,
and violates the repository's oracle-fidelity contract.

## What Changes

- Restore the oracle footer's “问题反馈” and ICP filing links, destinations,
  external-link behavior, ordering, separator, and accessible navigation.
- Remove the unapproved Archive/query-scope sentence from the rendered
  product.
- Restore the oracle-compatible centered, wrapping, keyboard-visible,
  touch-target-safe footer presentation in both themes and supported
  viewports.
- Add focused source/render regression coverage, then run the complete
  frontend and browser acceptance gates.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `frontend-oracle-fidelity`: extend the explicit fidelity boundary to the
  site footer and prohibit unapproved implementation terminology there.

## Impact

| Boundary | Declaration |
|---|---|
| Status | Proposed; apply is blocked until proposal, spec, design, and tasks are complete, strict-valid, and reviewed by the main agent. |
| Owner | Frontend |
| Writable paths | `frontend/src/app/App.vue`; the footer-only rules in `frontend/src/shared/styles/base.css`; one focused footer test below `frontend/tests/app/`; this change's OpenSpec lifecycle files. |
| Read-only protected inputs | `PRODUCT.md`; `DESIGN.md`; oracle commit `644b7748674e553f863d0ffd61d029f86fdc0717`, especially `frontend/src/workbench/components/WorkbenchFooter.vue` and its footer rules; existing frontend architecture, package manifests, and unrelated source/tests. |
| Deletion complement | No deletion except the exact unapproved footer text and obsolete footer-only declarations that are replaced by the oracle-compatible rules. |
| Mutable refs | This change's task markers only during apply; Git refs only during main-agent lifecycle work. |
| Consumes | Existing Vue SPA shell, semantic tokens, and oracle footer evidence. |
| Produces | Oracle-compatible footer markup, styling, and focused regression evidence. |
| Dependencies | Existing `frontend-oracle-fidelity` and `frontend-design-system` capabilities. |
| Deliverables | Updated footer source/style, focused regression, full frontend acceptance, browser evidence. |
| Acceptance | Focused footer test; `cd frontend && npm run check`; built-artifact browser QA in Light/Dark and desktop/mobile; repository-wide strict OpenSpec validation; `git diff --check`. |
| Non-goals | Redesigning the footer; changing legal/feedback destinations; introducing new explanatory copy; changing APIs, data semantics, dependencies, or operations. |
| Operations deferred | No release, deployment, public-route mutation, or live-host write is authorized by this Frontend change. |
| Stop/rollback conditions | Stop on oracle/authority conflict, unexpected package/generated drift, unrelated dirty overlap, or a visual/accessibility regression. Roll back only the exact owned footer candidate; never use destructive Git cleanup. |

External behavior classification: **PRESERVE_ORACLE**. The exact footer copy,
links, ordering, and interaction come from oracle commit
`644b7748674e553f863d0ffd61d029f86fdc0717`; no intentional delta or new
capability is introduced.
