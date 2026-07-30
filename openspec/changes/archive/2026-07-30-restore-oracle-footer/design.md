## Context

The production shell currently renders a generic `.app-footer` whose only
content is an implementation-facing sentence about query scope and Archive
version. The approved oracle renders a semantic footer navigation containing
two public links, a separator, wrapping behavior, inherited color, visible
focus, and a minimum hit target. No higher authority approved replacing that
footer.

This is a narrow fidelity repair. The oracle supplies the observable contract;
the new Vue architecture and semantic tokens remain authoritative for the
implementation shape.

| Boundary | Declaration |
|---|---|
| Status | Apply-ready only after every artifact is complete, strict-valid, and main-agent reviewed. |
| Owner | Frontend |
| Writable paths | `frontend/src/app/App.vue`; footer-only declarations in `frontend/src/shared/styles/base.css`; one focused test below `frontend/tests/app/`; this change's task markers. |
| Read-only protected inputs | Product/design authorities, immutable oracle commit, all non-footer source and tests, manifests, lockfiles, generated files, and `.impeccable/design.json`. |
| Deletion complement | Only the exact unapproved sentence and superseded footer-only rules may be removed. |
| Mutable refs | Task markers during apply; main-agent Git lifecycle only. |
| Consumes | Oracle footer markup/behavior, current SPA shell, current semantic tokens. |
| Produces | Restored footer markup/style and focused regression evidence. |
| Dependencies | `frontend-oracle-fidelity` → this repair; oracle evidence → markup/style/test. No reverse dependency into statistics or APIs. |
| Deliverables | Source, style, test, full frontend gate, built browser evidence. |
| Acceptance | Focused test, `npm run check`, built browser QA, strict OpenSpec validation, `git diff --check`. |
| Non-goals | New copy, new links, footer redesign, dependencies, APIs, data behavior, `.impeccable` regeneration, deployment. |
| Operations deferred | Release and production activation are outside this change. |
| Stop/rollback conditions | Stop on authority conflict, dirty overlap, unexpected artifact drift, or viewport/theme/accessibility failure. Restore only owned preimages on candidate rollback. |

## Goals / Non-Goals

**Goals:**

- Reproduce the oracle footer's text, destinations, external-link semantics,
  ordering, separator, navigation label, wrapping, focus, and hit targets.
- Remove the unexplained Archive/query-scope sentence completely.
- Protect the behavior with a focused regression that does not freeze private
  Vue or Naive UI internals.

**Non-Goals:**

- Recreate the oracle's component organization or obsolete CSS architecture.
- Change legal or feedback destinations.
- Add a freshness explanation elsewhere.
- Change the app's statistical or Archive semantics.

## Decisions

### Render the oracle links directly in the existing shell footer

`App.vue` will keep one semantic `<footer>` and render the oracle `<nav
aria-label="站点信息">`, “问题反馈” link, separator, and ICP link. Both links keep
the oracle destinations and `target="_blank" rel="noopener noreferrer"`.

Alternatives considered:

- **Delete the footer entirely:** removes the bad sentence but remains an
  oracle regression and loses legal/feedback navigation.
- **Replace the sentence with friendlier freshness copy:** invents another
  unapproved delta and does not answer the fidelity defect.
- **Create a new component:** unnecessary indirection for static markup owned
  only by the shell.

### Express oracle behavior through current semantic tokens

Footer-only rules will center and wrap the nav, inherit tertiary color, retain
the current workspace width, provide the repository minimum touch target, and
show the standard focus outline/brand hover color. This reproduces outward
behavior without copying obsolete implementation structure.

No library or package change is required.

### Test public behavior, not private structure

One focused app test will assert the semantic navigation, exact visible copy,
exact destinations, safe external-link attributes, and absence of the
unapproved sentence. Browser QA will cover Light/Dark and desktop/mobile
rendering from the built artifact.

Oracle comparison separates:

- **PRESERVE_ORACLE:** all footer content and interaction in this change.
- **INTENTIONAL_DELTA:** none.
- **NEW_CAPABILITY:** none.

## Risks / Trade-offs

- **The current top border/min-height may differ from the oracle** → compare
  the built footer at desktop and mobile, and retain only rules that reproduce
  the oracle rather than unrelated shell decoration.
- **Long legal/feedback text may wrap on narrow screens** → use the oracle's
  wrapping centered nav and verify 360px plus desktop.
- **A source-only assertion could miss layout drift** → require built browser
  QA in addition to the focused test and full frontend gate.

## Migration Plan

1. Apply the exact markup, style, and focused regression in one Frontend block.
2. Run focused and complete frontend checks, then built browser QA.
3. Hand the owned diff to the main agent for audit.
4. Release/deployment, if later authorized, uses the normal accepted artifact
   workflow; no data or configuration migration exists.

Candidate rollback restores only the three owned preimages. No live rollback
is authorized here.

## Open Questions

None. The oracle is explicit and no higher-authority delta exists.
