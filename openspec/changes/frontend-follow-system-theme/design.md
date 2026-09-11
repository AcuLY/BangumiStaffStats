> Supersession (2026-09-08): `contracts-remove-query-sharing` retires the query-sharing feature and overrides the sharing-specific requirements, preservation clauses, and acceptance assumptions below. URL fragments are cleared without parsing or replay. Header now has an always available same-tab “回到旧版” link to `https://search.bgmss.fun/old/` immediately left of theme. Exact accepted workspace recovery remains frontend-local through validated v2 JSON session storage; v1 fragment-based storage is discarded. Completed evidence below remains historical, and unrelated requirements are unchanged.

## Context

`app/theme.ts` is the sole theme owner. The current implementation follows the
system by default, but after a manual toggle it opens a contextual fixed-state
Popover with a separate return-to-system action. That makes a familiar icon
toggle carry a second preference-management flow. Vue’s public theme switch
keeps the same capability behind one button by inferring `auto` whenever the
new resolved appearance matches the current system appearance.

## Goals / Non-Goals

**Goals:**

- Follow the system initially and while no explicit preference exists.
- Keep the Header interaction to one direct Light/Dark action with no Popover,
  menu, settings page, fixed-state copy, or secondary reset action.
- Infer and persist `auto` when toggling reaches the current system appearance;
  otherwise persist the explicit Light/Dark appearance.
- Converge already-open tabs and clean up all media/storage listeners.
- Fail safely when storage, matchMedia, or event APIs are unavailable.

**Non-Goals:**

- No visible three-state control, contextual reset surface, expiry,
  cookie/server/cross-device preference, token redesign, dependency, or settings surface.

## Change Boundary

| Field | Boundary |
|---|---|
| Status | Local specified/implemented/focused-verified/document-synchronized only |
| Owner | Frontend App theme owner; primary agent accepts |
| Writable paths | This change, `frontend/src/app/theme.ts`, `frontend/src/app/App.vue`, `frontend/src/features/query/components/AppHeader.vue`, `frontend/src/shared/styles/base.css`, exact theme/Header tests, `DESIGN.md`, `.impeccable/design.json`, root `frontend-query-shell` spec |
| Read-only protected inputs | App provider/tokens, query/URL/share/resource state, other source/tests, packages/generated files, Backend/updater/Archive/external state |
| Deletion complement | Contextual theme Popover/follow-reset plumbing/styles and superseded v1/v2 storage contracts; preserve resolved API/application, one-click action, error tolerance, and cleanup |
| Mutable refs | Current dirty worktree and task markers only |
| Consumes | matchMedia, localStorage, storage events, Document/defaultView, Vue/Naive public APIs |
| Produces | System-following `auto` default, inferred durable `auto|light|dark`, one visible toggle, cross-tab convergence |
| Dependencies | Existing browser/Vue/Naive APIs; no package |
| Deliverables | Strict artifacts, implementation/tests, focused build/browser evidence, synchronized design/root constraints |
| Acceptance | System initial/change, direct toggle, automatic return to `auto`, tab sync, fallback/cleanup, no theme Popover or query side effect |
| Non-goals | Any visible three-state/reset UI, TTL, server/cross-device preference, redesign |
| Operations deferred | Change archive, full gate, Git/release/deploy/host mutation |
| Stop/rollback conditions | Explicit override loss, failure to infer `auto`, remaining contextual theme UI, stale listener, incorrect document/meta, storage exception, side effect, failed checks |

Dependency direction remains `system media + local explicit preference +
storage events -> one theme owner -> existing provider/document/Header ->
DESIGN narrative + root acceptance contract`. Theme state never enters query,
route, share, resource, or server ownership.

## Decisions

1. **Expose only the resolved theme.** `theme` remains the public read-only
   `light|dark` ref used by the provider, document, and Header. The internal
   `ThemePreference` is `auto|light|dark`; no following/reset state is wired
   through App or exposed to the Header.
2. **Store one durable inferred preference.** `bgmss-theme-preference-v3`
   accepts `auto`, `light`, or `dark`. Absence and invalid values resolve to
   `auto`; superseded v1/v2 records remain ignored.
3. **Make the toggle Vue-style.** Clicking the sun/moon button first computes
   the opposite resolved theme. If that theme equals the current system theme,
   persist `auto`; otherwise persist the explicit `light` or `dark`. The visual
   result is immediate and the click opens no secondary interface.
4. **Keep one gated media listener.** When the preference is `auto`, system
   changes update the resolved theme; explicit Light/Dark ignores them. Disposal
   removes the media listener regardless of current preference.
5. **Synchronize browser tabs.** One `storage` listener accepts v3
   `auto|light|dark`; key removal and invalid values converge to `auto`. Local
   writes update the initiating owner and the event updates other documents.
6. **Feature-detect and fail safe.** Missing matchMedia resolves Light; blocked
   or malformed storage is treated as no preference; storage failures never
   prevent in-memory switching. Disposal removes media/storage listeners and
   existing document markers.

Oracle comparison keeps Header order, icon baseline, primary one-click action,
and resolved theme presentation as `PRESERVE_ORACLE`; durable preference,
Vue-style inferred auto persistence, system following, and tab convergence are the authorized
`INTENTIONAL_DELTA`; no new capability or dependency is introduced.

## Risks / Trade-offs

- **The user cannot explicitly pin a theme equal to the current system** -> this
  is the deliberate Vue trade-off: matching the current system means `auto`,
  keeping the interaction to one direct button.
- **Another tab changes the preference** -> storage events converge all open
  tabs without routing/query effects.
- **Storage is blocked** -> the current page still keeps the manual theme in
  memory; a future page safely returns to system mode.
- **Old v2 data remains in storage** -> it is inert and cannot trigger expiry;
  no migration silently turns a temporary record into a permanent preference.

## Migration Plan

Strict-validate the revised artifacts, replace explicit follow/reset state with
inferred `auto|light|dark`, remove the contextual Header UI and styles, update
focused tests, then run theme/Header/App tests, typecheck, build, detector,
diff, and live initial/system/manual/auto/reload evidence.
Roll back only exact owned theme/Header/test/document hunks. Change archive and
every Git/deployment state remain deferred.

## Open Questions

None.
