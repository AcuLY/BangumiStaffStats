## Capability Boundary

- **Status/Owner:** Modified; Backend owns candidates transport/evaluation.
- **Writable paths:** Candidates request/operation models, handler/service source, and focused tests.
- **Read-only protected inputs:** Contracts authorities, statistical evaluation, other operations, and archived changes.
- **Deletion complement:** Preserve strict JSON closure, collection loading for personal scope, global isolation, errors, and pagination.
- **Mutable refs:** Local topic branch only.
- **Consumes/Produces:** Consumes the generated candidates contract; produces authoritative candidate responses.
- **Dependencies/Deliverables:** Existing runtime/cache only; no deleted request-field validation branch remains.
- **Acceptance:** Candidate handler/service tests and backend full gate.
- **Non-goals/Operations deferred:** No candidate metric or deployment change.
- **Stop/rollback conditions:** Stop if removal requires statistical expansion; roll back the isolated branch.

## MODIFIED Requirements

### Requirement: Candidates endpoint SHALL reuse strict result transport

The API SHALL expose only same-origin `POST /api/v1/candidates`, reject query
parameters, enforce the bounded strict JSON body, propagate cancellation, and
emit result-operation request IDs, private no-store headers, stable status/code
errors, pagination metadata, and personal collection freshness. Global mode
SHALL never fetch collection data or emit personal collection members.

#### Scenario: Unknown request member is supplied
- **WHEN** a candidates request contains an undeclared top-level member
- **THEN** the handler SHALL return 400 `INVALID_REQUEST` before evaluation

#### Scenario: Archive is not ready
- **WHEN** the route is registered but no Archive store is published
- **THEN** the endpoint SHALL return retryable 503 `NOT_READY` without evaluating candidates
