## Why

On compact short-result pages, `.app-main` keeps only its 420px minimum while
the surrounding page shell does not distribute the remaining viewport height.
The footer therefore stops well above the viewport bottom and leaves a large
blank region beneath the legal/navigation links.

## What Changes

- Make the existing App shell and page-scroll wrapper a normal-flow vertical
  flex height chain.
- Push the existing footer to the viewport bottom only when preceding content
  is short; long pages continue to place it after content without overlap.
- Preserve footer copy, links, touch targets, themes, semantic navigation, and
  the viewport as the only shell scroll owner.
- Add a focused source regression and rendered compact/long-page evidence.

The short-page bottom alignment is an `INTENTIONAL_DELTA` authorized by the
user. Footer content and interaction remain `PRESERVE_ORACLE` against
`644b7748674e553f863d0ffd61d029f86fdc0717` and the accepted
`frontend-oracle-fidelity` capability.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `frontend-oracle-fidelity`: require the existing site footer to meet the
  viewport bottom on short pages while remaining in normal document flow on
  long pages.

## Impact

- **Status:** local specification, implementation, and focused verification
  only; not committed, pushed, merged, released, or deployed.
- **Owner:** Frontend shell/footer; the primary agent owns implementation and
  acceptance.
- **Writable paths:**
  `openspec/changes/frontend-pin-footer-to-short-page/**`;
  shell/footer-only declarations in `frontend/src/shared/styles/base.css`;
  `frontend/tests/shared/shell-layout.test.ts`.
- **Read-only protected inputs:** `PRODUCT.md`, `DESIGN.md`, sidecar, footer
  markup/copy/destinations in `frontend/src/app/App.vue`, every non-shell CSS
  rule, query/ranking/co-star/person state, APIs/contracts, Backend/updater/
  Archive, remotes, hosts, and production.
- **Deletion complement:** delete no markup, link, separator, focus rule, safe-
  area padding, content state, or scroll owner; replace only the insufficient
  shell height-composition declarations.
- **Mutable refs:** this local dirty worktree and this change's task markers
  only; no Git or external ref mutation.
- **Consumes:** the existing `#app > .app-shell > header + .app-page-scroll`
  topology, semantic footer, viewport scroll owner, and compact main minimum.
- **Produces:** a normal-flow sticky footer for short pages and unchanged
  after-content placement for long pages.
- **Dependencies:** existing CSS flexbox and accepted Frontend shell; no new
  dependency.
- **Deliverables:** strict-valid proposal/design/delta spec/tasks, exact CSS and
  source test, focused Vitest/typecheck/build/detector/diff evidence, and 605px
  short/long browser geometry with clean console.
- **Acceptance:** on a short 605×807 page the footer bottom differs from the
  viewport bottom by at most one CSS pixel; on a long result page the footer
  follows content and does not overlay it; document scrollWidth stays bounded,
  the footer is not fixed/sticky positioned, and its links remain unchanged.
- **Non-goals:** footer redesign/copy/link changes, fixed overlays, Header/query/
  result geometry changes, new scroll containers, dependencies, Backend/data/
  API work, broad CSS cleanup, complete accumulated gate, or lifecycle work.
- **Operations deferred:** root spec sync/archive, complete accumulated gate,
  commit/push/PR/merge/release/deploy, and any host/production mutation.
- **Stop/rollback conditions:** stop on footer overlap, a new nested scroll
  owner, header/layout shift, long-page regression, horizontal overflow, link/
  accessibility drift, failed focused checks, or required writes outside the
  declared paths; roll back only exact owned hunks with a normal patch.
- **External state:** no other repository, remote ref, service, host, or
  production state is mutated.

Apply is blocked until proposal, delta spec, design, and tasks are complete,
strict-valid, and reviewed by the primary agent with zero unresolved P0/P1.
