> Supersession (2026-09-08): `contracts-remove-query-sharing` retires the query-sharing feature and overrides the sharing-specific requirements, preservation clauses, and acceptance assumptions below. URL fragments are cleared without parsing or replay. Header now has an always available same-tab “回到旧版” link to `https://search.bgmss.fun/old/` immediately left of theme. Exact accepted workspace recovery remains frontend-local through validated v2 JSON session storage; v1 fragment-based storage is discarded. Completed evidence below remains historical, and unrelated requirements are unchanged.

## Context

The application keeps one in-memory QueryStore and coordinated result resources.
Refreshing the document recreates both, so a normal `/ranking` or `/co-star`
load falls back to the first-query state. The explicit share flow already
defines a strict, versioned payload containing the last-successful Applied
Query plus the accepted operation workspace, validates it against generated
query-wire types and semantic constraints, and replays it through ordinary
coordinator operations. That flow deliberately excludes response bodies and
transient state.

The change is frontend-only. `PRODUCT.md` governs the intentional refresh
delta; `DESIGN.md`, the generated query wire, and the existing query/share
architecture remain protected authorities.

| Boundary | Declaration |
|---|---|
| Status | Planned until all artifacts are strict-valid and the main-agent zero-P0/P1 review approves apply; then implemented and verified task by task. |
| Owner | Frontend; the primary agent is the single implementation owner. |
| Writable paths | `PRODUCT.md`; `frontend/ARCHITECTURE.md`; `frontend/scripts/check-architecture.mjs` only for `src/features/query/session.ts` and `tests/features/query/session.test.ts` inventory entries; `frontend/src/app/App.vue`; `frontend/src/features/query/session.ts`; `frontend/tests/setup.ts` only for per-test tab-session cleanup; `frontend/tests/features/query/session.test.ts`; `frontend/tests/features/query/components.test.ts`; `openspec/changes/frontend-persist-query-session/**`; lifecycle-only `openspec/specs/frontend-query-shell/spec.md` and the exact archive destination. |
| Read-only protected inputs | `DESIGN.md`; `.impeccable/design.json`; all architecture-check behavior outside the two exact inventory entries; `frontend/src/app/routes.ts`; `frontend/src/features/query/{model,share,store,coordinator}.ts`; generated query-wire files; `contracts/**`; backend/updater/operations; oracle commit; unrelated OpenSpec state. |
| Deletion complement | No deletes, renames, wire regeneration, dependency edits, architecture-check behavior change, broad formatting/cleanup, nested OpenSpec root, or write outside the exact paths. |
| Mutable refs | Local `codex/persist-query-results` worktree only. Browser tests and runtime may mutate only the versioned same-origin session key in their active tab. |
| Consumes | Last-successful Applied Query, accepted share-compatible workspace, canonical share encoder/decoder, query coordinator replay, route mode, and native session storage. |
| Produces | A validated tab-session envelope, one ordinary replay after eligible refresh, current backend results, product/spec updates, and acceptance evidence. |
| Dependencies | Direction is `App.vue -> query/session.ts -> query/share.ts + query/model.ts -> generated query-wire adapter/types`; session persistence never depends on components, stores, APIs, or backend code. No new library. |
| Deliverables | Session persistence owner, composition-root integration, product rule, delta spec, architecture documentation and exact inventory registration, global tab-session test isolation, tests, browser evidence, and completed lifecycle artifacts. |
| Acceptance | Focused session/app Vitest, typecheck/build/full frontend gate as toolchain permits, ranking and co-star browser refresh, strict OpenSpec change/all validation, and `git diff --check`. |
| Non-goals | Cached responses, offline results, permanent saved searches, cross-tab synchronization, dirty-Draft recovery, new controls, URL payloads, backend/schema/statistics changes, or visual restyling. |
| Operations deferred | Repository operations definitions, host validation, live activation, rollback deployment, legacy retirement, commit, push, PR, merge, release, and deployment remain out of scope. |
| Stop/rollback conditions | Stop for authority conflict, overlapping edits, generated-contract changes, broader persistence/security needs, or acceptance failures outside scope. Roll back by exact reverse patches to owned files only. |

## Goals / Non-Goals

**Goals:**

- Restore the last successful ranking or co-star workspace after refreshing the
  same tab and route.
- Re-query the backend so restored results use current data and existing
  latest-only/error behavior.
- Preserve both mode workspaces only when they describe the same Applied Query.
- Keep storage and replay failures isolated from normal first-query behavior.
- Preserve explicit-share priority and all existing visual/interaction rules.

**Non-Goals:**

- Persisting response payloads, dirty Draft, arbitrary navigation history,
  scroll/focus/disclosure state, or collection refresh intent.
- Adding a user-visible save/history feature or cross-device synchronization.
- Changing query wire schemas, APIs, backend cache behavior, or dependencies.

## Decisions

### 1. Persist a versioned envelope of canonical share fragments

Use one versioned key, `bgmss-query-session-v1`, in `sessionStorage`. Its small
closed envelope contains optional ranking and co-star canonical v1 share
fragments. On every read, each fragment goes through the existing `readShare`
contract and semantic validation before it can be replayed.

This reuses the accepted payload boundary and automatically excludes response
bodies, request IDs, revision/dataVersion/digests, refresh intent, theme, and
transient UI state. Raw response serialization was rejected because it could
show stale statistics, substantially enlarge storage, and create a second
result authority. A new persistence schema was rejected because it would
duplicate the existing validated share semantics and require another contract.

### 2. Use tab-scoped session storage rather than URL or local storage

`sessionStorage` survives reload in the same tab but is not a durable saved
query history. Personal query filters are not silently placed in the address
bar, and state does not outlive the browser session as `localStorage` would.
No dependency is added; runtime and bundle cost is limited to a small module
and synchronous reads/writes of a bounded payload after accepted state changes.

### 3. Persist only accepted workspaces and keep modes query-consistent

The composition root observes the existing share-compatible workspace, which
is non-null only when the resource belongs to the current Applied Query and its
accepted operation input/view is available. Saving one mode retains the other
mode only if both decoded payloads have the same canonical query signature.
A semantically new successful query therefore replaces the session envelope's
query authority and drops the other mode's older workspace.

Dirty Draft is deliberately ignored. When Draft differs from the visible
result, refresh restores the last-successful Applied Query and result workspace,
matching the current share contract rather than presenting unsubmitted input as
applied state.

### 4. Replay once during initialization after catalog readiness

On a normal load without a fragment, the application reads the current route's
session entry before applying `?user=` prefill, loads the dynamic catalog, and
then invokes the existing replay function once only if the active route still
matches the route captured for that session entry. If the route changes while
catalog loading is pending, the captured entry is left untouched and no request
for its former mode is started. Replay issues the same ordinary
ranking/candidates and optional detail/partners/co-star requests used by a
share link; it never requests collection refresh.

Session writes remain gated until initialization finishes. This prevents a
partially restored primary workspace from overwriting a saved detail or
co-star analysis if a dependent replay later fails. If replay fails after its
primary request succeeds, the write gate remains closed until a later
post-initialization primary query succeeds; the validated saved entry therefore
survives without making session persistence permanently inert. After successful
replay, the accepted full workspace is written normally.

### 5. Explicit share and failures fail closed

Any URL fragment keeps existing priority. Whether that fragment is valid,
invalid, or its request is deferred, session recovery is not attempted during
the same document load. This preserves the existing rule that an invalid share
does not trigger an unrelated fallback query.

Unavailable Web Storage is treated as persistence absence. Malformed,
unsupported, or semantically invalid session data is ignored and best-effort
removed without starting a request. If a valid session replay fails, the
restored Applied Query draft remains editable, the editor stays available, a
local recovery error is shown, and the saved payload is retained for a later
refresh or manual retry.

### 6. Register the owner in existing architecture controls

`frontend/ARCHITECTURE.md` will name `features/query/session.ts` as the
tab-session recovery owner beneath the composition root. The persistent
inventory in `frontend/scripts/check-architecture.mjs` will add exactly the new
source file and its test. No other inventory entry, architecture rule, or
checker behavior changes. This is required alignment with the existing
architecture gate, not a new dependency or capability.

Vitest's shared jsdom storage survives between test cases, unlike independent
browser-test tabs. The global test setup will clear `sessionStorage` before
each case so persistence is opt-in within the tests that exercise it; this
changes no production lifecycle or individual integration-test semantics.

## Risks / Trade-offs

- **[Fresh results require network access]** -> Replay uses the backend instead
  of showing a stale cached response; failure leaves an actionable query draft
  and does not destroy the saved replay intent.
- **[Session storage can be disabled or throw]** -> Every access is guarded and
  persistence failure never blocks querying, routing, or rendering.
- **[Primary replay can momentarily precede dependent replay]** -> Session writes
  are disabled until initialization completes and remain disabled after failed
  dependent replay until a later primary query succeeds, preventing downgrade
  of saved analysis state.
- **[The route can change while catalog loading is pending]** -> Recovery binds
  the captured session entry to its initial route and rechecks that route before
  replay, so a stale-mode request is not started.
- **[A new query can invalidate another mode's saved view]** -> Query-signature
  matching preserves only compatible workspaces, avoiding mixed revisions.
- **[Session data contains public UID and filters]** -> It remains same-origin,
  tab-scoped, non-durable, absent from URLs and requests other than the ordinary
  query itself, and contains no credential, collection response, or secret.

## Migration Plan

1. Ship the new reader/writer with an empty-state fallback; existing sessions
   have no key and behave exactly as before.
2. Begin saving only after a successful accepted workspace exists.
3. A rollback removes the reader/writer integration and module. The unused
   versioned key is inert and may be ignored; no data or server migration is
   required.

Oracle preservation will be checked through source/diff review and rendered
desktop/mobile query flows: no success-path copy, layout, control, route, or
responsive change is intended. The only new visible state is the governed
refresh restoration behavior and its local failure feedback.

## Open Questions

None. The user request authorizes implementation of same-tab refresh recovery;
durable saved queries and response caching remain separate future decisions.
