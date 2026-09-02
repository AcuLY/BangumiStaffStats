## Capability Boundary

- **Status/Owner:** Modified; Contracts owns the rankings wire.
- **Writable paths:** Rankings schema, OpenAPI component, goldens/verifier, and generated Go/TypeScript rankings models.
- **Read-only protected inputs:** Shared query semantics, statistical results, unrelated endpoints, and archived changes.
- **Deletion complement:** Preserve the closed request, view defaults, personal/global result union, errors, and collection metadata.
- **Mutable refs:** Local topic branch only.
- **Consumes/Produces:** Consumes shared query/view components; produces the authoritative rankings request contract for backend and frontend consumers.
- **Dependencies/Deliverables:** Existing generators only; a request with required query and optional view, with no explicit refresh member.
- **Acceptance:** Rankings schema/golden/verifier and generated-model drift checks plus backend/frontend gates.
- **Non-goals/Operations deferred:** No result or statistical change; no remote or live mutation.
- **Stop/rollback conditions:** Stop on shared-contract conflict or broader compatibility requirement; roll back the isolated branch.

## MODIFIED Requirements

### Requirement: Rankings SHALL have one closed versioned wire contract

The contract SHALL define `POST /api/v1/rankings` with a JSON body containing
required `query` and optional `view`, and SHALL reject every unknown member.
Rankings SHALL not accept `input`, mode, requestId, queryRevision, dataVersion,
theme, or UI state.

View defaults SHALL be search `""`, sort `count`, order `desc`, page `1`, and
pageSize `10`. Sort SHALL be `count|average|overall|preference`; preference SHALL
be rejected for global scope. Page size SHALL be exactly `5|10|20`.
The OpenAPI operation SHALL declare 405 with `Allow: POST`, 502 for upstream
protocol/decode failure, and the accepted 400/403/404/413/415/429/500/503/504
families; every response SHALL use the stable envelope and no-store headers.

Average and overall SHALL cross the wire as nullable integer hundredths.
Preference SHALL retain canonical base-10 rational numerator/denominator strings
and its comparable/effective evidence counts. Missing evidence SHALL be null,
never zero. Person references SHALL contain only positive ID, name, and optional
Chinese name; arbitrary image URLs SHALL not enter the DTO.

#### Scenario: A global request asks for preference
- **WHEN** a global rankings request selects preference sort
- **THEN** the contract SHALL reject the view with a stable field error

#### Scenario: A personal row has no rating evidence
- **WHEN** an eligible person has no valid personal rating evidence
- **THEN** average, overall, and preference SHALL be null rather than zero
