## Capability Boundary

- **Status:** local intentional copy correction.
- **Owner:** Frontend ranking driver.
- **Writable paths:** rankings API/test, this change, root spec at sync.
- **Read-only protected inputs:** generated DTOs, Backend/API contracts, UI layout, external state.
- **Deletion complement:** preserve status/code validation and every non-timeout message.
- **Mutable refs:** current local worktree only.
- **Consumes:** stable rankings error codes.
- **Produces:** factual ranking timeout copy.
- **Dependencies:** accepted ApiClient and generated rankings contract.
- **Deliverables:** adapter/test/browser error evidence.
- **Acceptance:** timeout and collection-unavailable messages remain distinct.
- **Non-goals:** wire/status/retry/request-timeout changes.
- **Operations deferred:** all remote/live integration.
- **Stop/rollback conditions:** stop on code/status acceptance drift or failed checks.

## MODIFIED Requirements

### Requirement: Frontend SHALL consume rankings through one strict driver

The formal SPA SHALL issue same-origin `POST /api/v1/rankings` only through the
accepted native-fetch client and a rankings driver registered with the existing
Query Coordinator. The driver SHALL serialize the last-successful Applied
Query and current ranking view, propagate AbortSignal, strictly decode the
generated success/error contract, and require the response requestId.
The shared client MAY expose an operation-supplied strict error-envelope decoder
but SHALL preserve existing catalog behavior and SHALL not turn display messages
or arbitrary error bodies into typed application failures.

Stable status/error codes and collection warning codes SHALL drive behavior.
`UPSTREAM_TIMEOUT` SHALL display “人物排行查询超时，请重试” without claiming a
collection failure. `UPSTREAM_UNAVAILABLE` and `UPSTREAM_PROTOCOL_ERROR` SHALL
retain the collection-unavailable recovery copy. The frontend SHALL not parse
display messages, contact Bangumi directly, ship a fixture, create a second
Applied Query owner, or compute ranking statistics.

#### Scenario: A stale personal response succeeds

- **WHEN** the endpoint returns a valid result with `COLLECTION_STALE`
- **THEN** the ranking resource SHALL become ready, retain the result, and expose the stable stale warning

#### Scenario: A superseded view request returns late

- **WHEN** an older ranking view response resolves after a newer request
- **THEN** the coordinator SHALL reject the stale response and preserve the newer resource

#### Scenario: Ranking request times out after collection succeeds

- **WHEN** a valid 504 error carries `UPSTREAM_TIMEOUT`
- **THEN** the local message SHALL identify the ranking query timeout and offer
  retry without saying the collection is unavailable
