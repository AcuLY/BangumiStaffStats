## Capability Boundary

- **Status/Owner:** Modified; Frontend owns Query Editor and primary coordinator state.
- **Writable paths:** Query Editor/Workspace/coordinator, app wiring, primary API drivers, focused tests, and accepted frontend query-shell spec.
- **Read-only protected inputs:** Product/design visual system, statistical results, backend cache authority, unrelated surfaces, and archived changes.
- **Deletion complement:** Preserve one primary apply action, validation, pending/cancel/recovery, revision, stale warnings, sharing, and responsive accessibility.
- **Mutable refs:** Local topic branch only.
- **Consumes/Produces:** Consumes generated contracts and operation drivers; produces visible query/application state without statistical computation.
- **Dependencies/Deliverables:** Existing Vue/Pinia/Naive UI only; no refresh action or refresh-only state.
- **Acceptance:** Focused component/coordinator/integration tests, full frontend gate, and rendered mobile/desktop QA.
- **Non-goals/Operations deferred:** No Query Editor redesign or deployment change.
- **Stop/rollback conditions:** Stop on oracle conflict outside the intentional button removal; roll back the isolated branch.

## ADDED Requirements

### Requirement: Personal queries SHALL surface collection freshness

An ordinary personal operation that succeeds with stale collection metadata
and `COLLECTION_STALE` SHALL commit the usable result and announce the stable
warning without parsing server text or starting an automatic retry.

#### Scenario: Ordinary personal query returns stale data
- **WHEN** a personal operation succeeds with stale collection metadata and `COLLECTION_STALE`
- **THEN** the usable result SHALL commit and the stable stale warning SHALL be announced
- **AND** no background or automatic retry SHALL start

## REMOVED Requirements

### Requirement: Personal collection refresh SHALL have explicit recovery states

**Reason:** The explicit collection-refresh action and request capability are deleted end to end.

**Migration:** Users apply a personal query through the single primary query action; ordinary cache expiry and stale-warning behavior remain automatic.
