> Supersession (2026-09-08): `contracts-remove-query-sharing` retires the query-sharing feature and overrides the sharing-specific requirements, preservation clauses, and acceptance assumptions below. URL fragments are cleared without parsing or replay. Header now has an always available same-tab “回到旧版” link to `https://search.bgmss.fun/old/` immediately left of theme. Exact accepted workspace recovery remains frontend-local through validated v2 JSON session storage; v1 fragment-based storage is discarded. Completed evidence below remains historical, and unrelated requirements are unchanged.

## Capability Boundary

- **Status:** Proposed correction to an accepted ranking/detail presentation contract.
- **Owner:** Frontend App projection.
- **Writable paths:** This change, `frontend/src/app/App.vue`, `frontend/tests/app/rankings.integration.test.ts`, and exact ownership-transfer notes.
- **Read-only protected inputs:** Coordinator/query/API contracts, detail components/CSS, Backend, other dirty paths, external state.
- **Deletion complement:** Preserve all ranking/detail states, first-person order/request, share/refresh/compact behavior, skeleton content, and tests.
- **Mutable refs:** Current local dirty worktree only.
- **Consumes:** Existing ranking and person-detail resource phases plus selected person ID.
- **Produces:** Continuous desktop companion skeleton ownership through detail pending.
- **Dependencies:** Existing coordinator and components only; no new state/request/dependency.
- **Deliverables:** App projection, timing regression, rendered transition evidence.
- **Acceptance:** No single-column/full-width frame, one detail request, truthful pending state, unchanged zero/share/compact behavior.
- **Non-goals:** Ranking/person semantics, API, data, animation, or redesign.
- **Operations deferred:** Full gate, sync/archive, Git/release/deploy/host mutation.
- **Stop/rollback conditions:** Double/stale request, share/drawer/zero-result drift, false loading, or failed checks.

## ADDED Requirements

### Requirement: Accepted ranking SHALL preserve companion detail layout until detail settles

At desktop widths, when a changed primary ranking request accepts one or more people and the automatically selected person's coordinated detail resource is pending, the ranking workspace SHALL retain its two-column geometry and SHALL keep rendering the same person-detail-shaped companion skeleton used during primary pending. The left ranking result SHALL NOT expand into the Inspector column. The companion skeleton SHALL be replaced directly by the existing ready, error, or deferred detail surface when the detail resource leaves pending. No artificial minimum duration or second request/state owner SHALL be introduced.

#### Scenario: Ranking accepts before first detail settles

- **WHEN** a desktop changed ranking request accepts people while the exactly-once first-person detail request remains pending
- **THEN** ready ranking rows and the companion person-detail skeleton SHALL coexist in the same two-column workspace
- **AND** the workspace SHALL NOT enter its single-column class or reserve an empty right frame

#### Scenario: First detail settles

- **WHEN** the pending selected detail becomes ready or error
- **THEN** the existing detail surface SHALL replace the companion skeleton without changing ranking width
- **AND** automatic selection order, exact share replay, compact Drawer, refresh,
  and no-person column semantics SHALL remain unchanged; later complete-zero
  interior presentation is outside this timing slice
