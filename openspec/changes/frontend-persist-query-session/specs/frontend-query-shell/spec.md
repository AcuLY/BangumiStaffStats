## Capability Boundary

| Boundary | Declaration |
|---|---|
| Status | Planned; implementation is blocked until all artifacts are strict-valid and pass main-agent zero-P0/P1 review. |
| Owner | Frontend; primary agent. |
| Writable paths | `PRODUCT.md`; `frontend/ARCHITECTURE.md`; `frontend/scripts/check-architecture.mjs` only for the two new owned inventory entries; `frontend/src/app/App.vue`; `frontend/src/features/query/session.ts`; `frontend/tests/setup.ts` only for per-test tab-session cleanup; `frontend/tests/features/query/session.test.ts`; `frontend/tests/features/query/components.test.ts`; this change; lifecycle-only main spec and exact archive destination. |
| Read-only protected inputs | `DESIGN.md`; `.impeccable/design.json`; all architecture-check behavior outside the two inventory entries; routes/query store/model/share/coordinator sources except the new session owner; generated query-wire; `contracts/**`; backend/updater/operations; oracle; unrelated changes. |
| Deletion complement | No deletion, rename, dependency change, generated artifact edit, architecture-check behavior change, nested OpenSpec root, broad cleanup, or write outside the exact paths. |
| Mutable refs | Local branch/worktree only plus the versioned same-origin tab-session key during runtime or tests; no remote or live system ref. |
| Consumes | Existing share payload contract, Applied Query, accepted operation workspace, query coordinator, route mode, catalog readiness, and browser session storage. |
| Produces | Validated session recovery intent and one ordinary fresh-result replay after eligible refresh. |
| Dependencies | Frontend consumes generated query-wire and backend responses in the existing direction; persistence creates no producer, schema, request layer, or statistical authority. |
| Deliverables | Product rule, session owner, App integration, architecture documentation/inventory alignment, deterministic tab-session test isolation, tests, browser evidence, and synced/archived specification. |
| Acceptance | Focused Vitest, frontend typecheck/build/full check where pinned tools are available, ranking/co-star browser refresh, strict OpenSpec validation, and `git diff --check`. |
| Non-goals | Response/offline cache, durable or cross-tab history, dirty-Draft persistence, URL payload, automatic collection refresh, new controls, backend/contracts/statistics, or redesign. |
| Operations deferred | No operations definitions, host validation, activation, deployment rollback, retirement, commit, push, PR, merge, release, or deployment. |
| Stop/rollback conditions | Stop on authority conflict, overlapping edits, contract pressure, broader scope, or failed acceptance; reverse only exact owned patches. |

## ADDED Requirements

### Requirement: Successful query workspace SHALL survive a same-tab document refresh

After a ranking or co-star operation has successfully committed an Applied
Query and accepted workspace, the frontend SHALL retain a versioned,
tab-session-scoped recovery intent for that route. The recovery intent SHALL
contain only the current visible result's last-successful Applied Query and
share-compatible accepted operation input/view and selected identities. It
SHALL exclude response bodies, dirty Draft, pending attempts, request IDs,
query revision, dataVersion/digests, collection-refresh intent, theme,
disclosure, loading, focus, scroll, and other transient UI state.

On a subsequent ordinary document load in the same tab and route, after the
dynamic catalog is ready, the frontend SHALL validate and replay at most one
saved intent through the existing query application and operation services.
Replay SHALL issue ordinary fresh-result requests, SHALL NOT request collection
refresh, and on success SHALL restore the relevant ranking/candidate view plus
any saved person-detail, partner, or co-star selection and analysis state.
The backend SHALL remain the sole result and statistical authority.

The shell SHALL bind the captured recovery intent to the route from which it
was read. If the active route changes while catalog readiness is pending, the
shell SHALL NOT replay that captured intent for either the former or current
route during the same initialization attempt.

The frontend MAY retain separate ranking and co-star intents only while both
decode to the same Applied Query signature. Committing and saving a
semantically new Applied Query SHALL discard an older saved intent for the
other mode rather than mixing workspaces across query revisions.

#### Scenario: Ranking result is restored after refresh

- **WHEN** the current tab has a last-successful ranking query and accepted ranking view and the user refreshes `/ranking` without a share fragment
- **THEN** the shell SHALL replay that query once through the ordinary rankings operation after catalog readiness
- **AND** the current backend result and saved ranking search, sort, order, page, page size, and compatible person-detail workspace SHALL be restored without an explicit collection refresh

#### Scenario: Co-star analysis is restored after refresh

- **WHEN** the current tab has a last-successful co-star query with accepted candidate and partner or multi-person analysis state and the user refreshes `/co-star` without a share fragment
- **THEN** the shell SHALL replay the candidate operation and applicable dependent operation through their ordinary services
- **AND** it SHALL restore the saved candidate view and validated selected identities before presenting the current backend analysis

#### Scenario: Dirty Draft does not replace the visible result on refresh

- **WHEN** an accepted result is visible, the user edits Draft without successfully applying it, and then refreshes the document
- **THEN** the saved last-successful Applied Query and accepted result workspace SHALL be replayed
- **AND** the unsubmitted Draft and pending attempt SHALL NOT be persisted or presented as applied state

#### Scenario: A new query invalidates an older other-mode workspace

- **WHEN** ranking and co-star recovery intents exist for one Applied Query and a semantically new query succeeds in either mode
- **THEN** the successful mode's new intent SHALL become the session authority
- **AND** the other mode's older, query-incompatible intent SHALL be discarded

#### Scenario: Explicit share takes precedence over session recovery

- **WHEN** the initial URL contains any share fragment while a saved session intent also exists
- **THEN** the existing share consumption path SHALL be the only automatic replay attempted for that document load
- **AND** invalid or deferred share handling SHALL NOT fall back to the saved session intent or `?user=` automatic query behavior

#### Scenario: Session storage is absent or invalid

- **WHEN** session storage is unavailable, access throws, no intent exists, or saved bytes are malformed, unsupported, noncanonical, route-incompatible, or semantically invalid
- **THEN** the shell SHALL remain usable in the safe first-query state, start no recovery request, and preserve ordinary `?user=` Draft prefill when no fragment is present
- **AND** invalid saved bytes SHALL be ignored and best-effort removed without changing URL, route, theme, or visible result semantics

#### Scenario: Valid recovery request fails

- **WHEN** a validated session intent is replayed but its primary or dependent request fails or is canceled
- **THEN** the shell SHALL keep the restored query values available for editing or manual retry, expose local recovery failure feedback, and SHALL NOT present a cached response as current success
- **AND** it SHALL retain the validated saved intent for a later refresh rather than overwrite it with a partial workspace

#### Scenario: Route changes while recovery waits for the catalog

- **WHEN** the shell has captured a ranking or co-star session intent and the active route changes before catalog loading completes
- **THEN** the shell SHALL NOT start the captured intent's primary or dependent requests
- **AND** it SHALL leave the validated saved intent unchanged rather than replaying it into the newly active mode
