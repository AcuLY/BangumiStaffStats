> Supersession (2026-09-08): `contracts-remove-query-sharing` retires the query-sharing feature and overrides the sharing-specific requirements, preservation clauses, and acceptance assumptions below. URL fragments are cleared without parsing or replay. Header now has an always available same-tab “回到旧版” link to `https://search.bgmss.fun/old/` immediately left of theme. Exact accepted workspace recovery remains frontend-local through validated v2 JSON session storage; v1 fragment-based storage is discarded. Completed evidence below remains historical, and unrelated requirements are unchanged.

## Why

A successful query currently disappears when the document is refreshed, even
though the application already has a validated replay path for restoring the
same applied query and operation workspace from an explicit share link. A
page refresh should return the user to the last successful result in that tab
without exposing personal filters in the URL or serving a stale cached
response.

## What Changes

- Persist the current mode's last-successful Applied Query and accepted
  operation workspace in versioned, tab-scoped browser session storage.
- On a normal document refresh, validate and replay that state once through
  the existing query coordinator so the backend remains the result authority.
- Preserve separate ranking and co-star workspaces only while they refer to
  the same Applied Query; a successful semantically new query invalidates the
  other mode's older saved workspace.
- Keep explicit share fragments higher priority than session recovery, and
  fail safely when storage is unavailable, malformed, incompatible, or a
  replay request fails.
- Do not persist response bodies, dirty Draft, request/revision identifiers,
  collection-refresh intent, theme, loading state, focus, scroll, or other
  transient UI state.

This is an **INTENTIONAL_DELTA** to refresh behavior governed by the Query
Application Contract in `PRODUCT.md`. Existing query, share, route, loading,
error, responsive, and visual behavior remains **PRESERVE_ORACLE** against
`644b7748674e553f863d0ffd61d029f86fdc0717` outside this delta.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `frontend-query-shell`: Add tab-scoped restoration of the last successful
  query workspace after a normal document refresh, with validated replay,
  explicit-share precedence, and failure-safe storage behavior.

## Impact

| Boundary | Declaration |
|---|---|
| Status | Planned; apply is blocked until proposal, delta spec, design, and tasks pass strict validation and main-agent zero-P0/P1 review. |
| Owner | Frontend; the primary agent owns specification, implementation, and acceptance. |
| Writable paths | `PRODUCT.md`; `frontend/ARCHITECTURE.md`; `frontend/scripts/check-architecture.mjs` only for two exact persistent-inventory entries; `frontend/src/app/App.vue`; `frontend/src/features/query/session.ts`; `frontend/tests/setup.ts` only for tab-session test isolation; `frontend/tests/features/query/session.test.ts`; `frontend/tests/features/query/components.test.ts`; `openspec/changes/frontend-persist-query-session/**`; lifecycle-only sync/archive writes to `openspec/specs/frontend-query-shell/spec.md` and `openspec/changes/archive/**/frontend-persist-query-session/**`. |
| Read-only protected inputs | `DESIGN.md`; `.impeccable/design.json`; all `frontend/scripts/check-architecture.mjs` behavior outside the exact inventory additions; `frontend/src/app/routes.ts`; `frontend/src/features/query/{model,share,store,coordinator}.ts`; `frontend/src/api/generated/query-wire/**`; `contracts/**`; all backend, updater, operations, legacy-oracle, and unrelated OpenSpec paths. |
| Deletion complement | No deletion, rename, generated-wire rewrite, dependency change, architecture-check behavior change beyond admitting the two owned new files, broad cleanup, or modification outside the exact writable paths. |
| Mutable refs | Local branch `codex/persist-query-results` and its working-tree files only; no remote ref. Runtime mutation is limited to the versioned same-origin `sessionStorage` entry in the active browser tab during tests or normal use. |
| Consumes | Existing canonical share payload validation, QueryStore Applied Query, accepted operation workspace, query coordinator replay, route mode, and browser `sessionStorage`. |
| Produces | Versioned tab-session recovery state, ordinary coordinator requests after refresh, restored ranking/co-star results, focused tests, and updated product/spec lifecycle artifacts. |
| Dependencies | Vue/Pinia application shell, native Web Storage, existing query-wire generated types and share semantics; no new library or contract dependency. |
| Deliverables | Product rule, frontend-query-shell delta, persistence owner, application integration, architecture documentation/inventory alignment, global tab-session test isolation, unit/integration tests, and verification evidence. |
| Acceptance | Focused Vitest for session and component replay; frontend typecheck/build/full `npm run check` where the pinned toolchain is available; representative browser refresh in ranking and co-star modes; strict change/all OpenSpec validation; `git diff --check`. |
| Non-goals | Offline result cache, response snapshot, cross-tab or cross-browser history, permanent saved queries, URL changes, automatic collection refresh, dirty-Draft persistence, backend/API/schema/statistics changes, visual redesign, or new user controls/copy on the success path. |
| Operations deferred | Commit, push, pull request, merge, release, deployment, host/service mutation, and production activation are not authorized. No other repository or external live state is touched. |
| Stop/rollback conditions | Stop on authority conflict, overlapping concurrent edits, generated-contract pressure, unexpected visual/route drift, or failed acceptance requiring broader scope. Roll back only the exact owned edits by patching them; never reset, checkout, clean, or delete unrelated work. |
