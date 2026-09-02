## Capability Boundary

- **Status/Owner:** Modified; Contracts owns the candidates wire.
- **Writable paths:** Candidates schema, goldens/verifier, and generated Go/TypeScript candidates models.
- **Read-only protected inputs:** Shared query semantics, candidate metrics, unrelated endpoints, and archived changes.
- **Deletion complement:** Preserve closed input/view separation, scope-specific sorts, results, errors, and collection metadata.
- **Mutable refs:** Local topic branch only.
- **Consumes/Produces:** Consumes shared query and candidate components; produces the authoritative candidates request contract for backend/frontend.
- **Dependencies/Deliverables:** Existing generators only; required query/input and optional view with no explicit refresh member.
- **Acceptance:** Candidate schema/golden/verifier and generated-model drift checks plus backend/frontend gates.
- **Non-goals/Operations deferred:** No candidate evaluation or UI selection redesign; no remote/live mutation.
- **Stop/rollback conditions:** Stop on shared-contract conflict or scope expansion; roll back the isolated branch.

## MODIFIED Requirements

### Requirement: Candidates contract SHALL separate input, view, and frontend state

The candidates request SHALL be a closed object containing required `query`,
required `input.positionKey`, and optional `view`. `input.positionKey` SHALL be
one of the ordered submitted query positions. Search, sort, order, page, and
pageSize SHALL be view fields. Selected state, alternate identities, query
revision, request ID, data version, theme, image URL, and work lists SHALL NOT
be request or response fields.

Personal scope SHALL allow `count`, `average`, and `globalAverage`; global scope
SHALL allow only `count` and `average`.

#### Scenario: Current position is omitted or unknown
- **WHEN** input positionKey is absent or is not a member of query.positionKeys
- **THEN** the request SHALL fail with `FIELD_INVALID` at `/input/positionKey`

#### Scenario: Frontend selection is supplied
- **WHEN** a request or response contains selected-person state
- **THEN** the closed contract SHALL reject it
