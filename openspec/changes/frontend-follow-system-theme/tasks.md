## Task Boundary

| Field | Boundary |
|---|---|
| Status | Vue-style revision specified; implementation and renewed acceptance pending |
| Owner | Frontend App theme owner; primary agent accepts |
| Writable paths | This change; `frontend/src/app/theme.ts`; `frontend/src/app/App.vue`; `frontend/src/features/query/components/AppHeader.vue`; `frontend/src/shared/styles/base.css`; `frontend/tests/app/theme.test.ts`; `frontend/tests/features/query/components.test.ts`; `DESIGN.md`; `.impeccable/design.json`; `openspec/specs/frontend-query-shell/spec.md` |
| Read-only protected inputs | Provider/tokens, query/URL/share/resource state, other source/tests, packages/generated files, Backend/updater/Archive/external state |
| Deletion complement | Contextual theme Popover/follow-reset plumbing/styles and superseded v1/v2 persistence; preserve resolved application, one-click action, error cleanup |
| Mutable refs | Current dirty worktree and task markers only |
| Consumes | matchMedia, localStorage, storage events, Document/defaultView, Vue/Naive APIs |
| Produces | Default system-following `auto`, inferred durable `auto|light|dark`, one visible toggle, tab convergence |
| Dependencies | Existing browser/Vue/Naive APIs; no package |
| Deliverables | Theme/Header implementation/tests, focused build/browser/OpenSpec evidence, synchronized design/root constraints |
| Acceptance | System initial/change, direct toggle, automatic return to `auto`, tab sync, fallback/dispose, no secondary UI or query side effect |
| Non-goals | Visible three-state/reset UI, TTL, server/cross-device preference, redesign |
| Operations deferred | Change archive, full gate, Git/release/deploy/host mutation |
| Stop/rollback conditions | Stop on dirty overlap outside owned hunks, explicit preference loss, failure to infer `auto`, remaining theme Popover, stale listener, incorrect document/meta, storage error, side effect, failed checks, undeclared write |

Forbidden: reset/checkout rollback, git clean, `git add -A`, broad deletion,
undeclared/generated/Backend/external writes, and production operations.

## 1. Planning and ownership — primary

- [x] 1.1 Verify branch/HEAD/dirty owned files, review the revised proposal,
  design, delta spec, and tasks, strict-validate, and confirm zero unresolved P0/P1.

## 2. Theme owner implementation — primary

- [x] 2.1 Change `bgmss-theme-preference-v3` to validated durable
  `auto|light|dark`, infer `auto` when the toggled result matches the system,
  and preserve document/meta application plus failure-safe fallbacks.
- [x] 2.2 Keep preference state internal, retain one gated media listener,
  synchronize valid storage set/removal events across open tabs, and remove
  `followingSystem` / `followSystem()` from the public owner.

## 3. Header direct action — primary

- [x] 3.1 Remove following/reset wiring from App and remove the theme Popover,
  fixed-state copy, reset action, and their styles from Header.
- [x] 3.2 Preserve the existing Header order, desktop/mobile geometry, 44px
  target, keyboard focus, resolved icon, and destination action label.

## 4. Focused regressions — primary

- [x] 4.1 Rewrite deterministic owner tests for initial/`auto` following,
  explicit opposite choice, toggle-back-to-auto, storage convergence, invalid/
  unavailable APIs, URL isolation, legacy-key exclusion, and disposal.
- [x] 4.2 Update focused Header/App assertions for one direct toggle, absence of
  theme preference surfaces, compact behavior, and unchanged destination labels.

## 5. Focused acceptance — primary

- [x] 5.1 Run theme/Header/App tests, Vue typecheck, Vite build, Impeccable
  detector, strict validation, and `git diff --check` without the complete
  accumulated gate.
- [x] 5.2 Browser-check system initial/live change, explicit one-click persistence,
  toggle-back-to-auto, reload, desktop/mobile layout, keyboard operation,
  document/meta/provider, URL/query isolation, and console where available.
- [x] 5.3 Keep change archive, complete accumulated gate, Git integration,
  release/deployment, and all host/production mutation deferred; record exact evidence.

  Evidence: the focused theme/Header/App Vitest slice passed 38/38. With the
  repository-pinned Node 24.18.0 and npm 11.16.0, Vue typecheck and the Vite
  production build passed; the build retained only the existing >500 kB chunk
  warning. Impeccable detection returned `[]`; the change and root capability
  are strict-valid, the sidecar assertions pass, and the exact theme diff passes
  `git diff --check`.

  Browser evidence on `/ranking` verified one permanent theme button and no
  theme Popover/copy/reset action; Light `auto` changed live to Dark when the
  emulated system changed, explicit Light ignored later Dark system changes and
  survived reload, and a second toggle back to the current system appearance
  restored live following. URL and page state stayed unchanged. A fresh tab had
  no framework overlay or console warning/error. At the 390px override the DOM
  measured 380px client/scroll width, the direct button toggled twice back to
  `auto`, and no theme surface appeared. The native button retained focus and
  its destination label; the in-app Browser keypress driver did not synthesize
  the native button click, so separate physical-key activation remains a manual
  browser spot-check rather than a claimed automated proof.

  The complete accumulated frontend gate remains outside this block and is not
  green: the pinned-runtime architecture gate reports three unrelated inventory
  extras, and the separately continued full Vitest run passed 434/442 with eight
  failures in pre-existing scrollbar, mount-timeout, ranking, and co-star work.
  Change archive, Git integration, release, deployment, and all external
  mutation remain deferred.

## 6. Governing-document synchronization — primary

- [x] 6.1 Revise the durable system-first theme rule in `DESIGN.md` and mirror
  its narrative/do/don't entries in `.impeccable/design.json` without
  regenerating unrelated tokens or component examples.
- [x] 6.2 Intelligently merge the revised theme delta into the root
  `frontend-query-shell` requirement, preserve unrelated requirement content,
  strict-validate the change and all affected specs, parse the sidecar, and run
  `git diff --check`.

  Evidence: `DESIGN.md` and the Impeccable sidecar contain the same Vue-style
  inferred-auto rule and matching do/don't guidance. The root
  `frontend-query-shell` theme paragraph and scenarios match the revised delta;
  the sidecar parses and its exact theme assertions pass. The change and root
  capability are strict-valid and the exact theme diff passes `git diff --check`.
