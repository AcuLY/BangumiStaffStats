## Why

The current contextual “已固定为…” / “改为跟随系统” surface turns a familiar
Light/Dark button into a preference-management flow. The Vue documentation
site demonstrates a lower-burden model: keep one direct toggle and infer
`auto` whenever the toggled appearance matches the current system appearance.

## What Changes

- With no manual preference, resolve from `prefers-color-scheme: dark` and keep
  listening for system changes.
- Keep the existing Header theme action as the only visible control. Each
  activation immediately toggles the resolved Light/Dark appearance and opens
  no Popover, menu, settings page, or secondary reset action.
- Persist `bgmss-theme-preference-v3` as `auto`, `light`, or `dark` with no
  expiry. After toggling, store `auto` when the new resolved theme matches the
  current system theme; otherwise store the explicit `light` or `dark` value.
- Synchronize `auto`, explicit Light/Dark, removal, and invalid-value recovery
  across already-open tabs through the browser `storage` event.
- Remove the expiry timestamp, timer, and open-page expiry behavior. Invalid,
  blocked, or unavailable storage still fails safely to system following, then
  Light when `matchMedia` is unavailable.
- Preserve the resolved `light|dark` provider, CSS tokens, meta theme-color,
  URL/query/share isolation, button order, one-click primary action, and cleanup.

This is an `INTENTIONAL_DELTA` authorized by the user. Header visual identity
and theme token presentation remain `PRESERVE_ORACLE` against
`644b7748674e553f863d0ffd61d029f86fdc0717`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `frontend-query-shell`: replace the contextual reset surface with Vue-style
  `auto|light|dark` persistence behind the existing one-click theme action and
  keep live same-browser tab synchronization.

## Impact

- **Status:** local specification, implementation, focused verification, and
  governing-document synchronization only; not committed, pushed, merged,
  released, or deployed.
- **Owner:** Frontend App theme owner; primary agent owns acceptance.
- **Writable paths:**
  `openspec/changes/frontend-follow-system-theme/**`;
  `frontend/src/app/theme.ts`;
  `frontend/src/app/App.vue`;
  `frontend/src/features/query/components/AppHeader.vue`;
  `frontend/src/shared/styles/base.css`;
  `frontend/tests/app/theme.test.ts`;
  `frontend/tests/features/query/components.test.ts`;
  `DESIGN.md`;
  `.impeccable/design.json`;
  `openspec/specs/frontend-query-shell/spec.md`.
- **Read-only protected inputs:** App provider/theme tokens, query/store/URL/
  share/resource state, all other frontend source/tests, package/generated
  files, Backend/updater/Archive, remotes, hosts, and production.
- **Deletion complement:** remove only the contextual theme Popover, its
  follow/reset plumbing and styles, plus superseded v1/v2 persistence; preserve
  resolved Light/Dark application, one-click toggle, error tolerance, and cleanup.
- **Mutable refs:** current dirty worktree and task markers only; no Git or
  external ref mutation.
- **Consumes:** `matchMedia('(prefers-color-scheme: dark)')`, localStorage,
  browser `storage` events, target Document/defaultView, existing Vue/Naive APIs.
- **Produces:** system-following `auto` default, durable inferred
  `auto|light|dark` preference, one visible toggle, and same-browser convergence.
- **Dependencies:** existing browser, Vue, and Naive UI APIs only; no package.
- **Deliverables:** strict artifacts, theme/Header implementation/tests,
  focused Vitest/typecheck/build/detector/diff and browser evidence, plus
  synchronized DESIGN/Impeccable/root-spec constraints.
- **Acceptance:** absent/`auto` follows system; one click toggles directly and
  stores explicit Light/Dark when it differs from the system; toggling back to
  the current system appearance stores `auto` and resumes following without a
  second control; storage events synchronize all valid states; invalid/
  unavailable APIs do not throw; disposal removes listeners; query/URL/share/
  network state is unchanged.
- **Non-goals:** Popover/menu/settings surface, always-visible three-state
  selector, explicit reset action, TTL, cookie/server or cross-device sync,
  token redesign, dependencies, broad cleanup, full gate, lifecycle, or production.
- **Operations deferred:** change archive, complete accumulated gate,
  commit/push/PR/merge/release/deploy, and all host/production mutation.
- **Stop/rollback conditions:** stop on a system change overriding explicit
  Light/Dark, failure to recover `auto` when the toggle matches the system,
  any remaining contextual theme UI, stale listener, incorrect meta state,
  storage error, query/URL/share side effect, failed evidence, or undeclared write;
  roll back only exact owned hunks.
- **External state:** no other repository, remote ref, service, host, or
  production state is mutated.

Apply is blocked until proposal, delta spec, design, and tasks are complete,
strict-valid, and reviewed by the primary agent with zero unresolved P0/P1.
