## Capability Boundary

- **Status/Owner:** Modified; Contracts owns person-detail wire closure.
- **Writable paths:** Person-detail accepted spec, result-error path vocabulary, and its refresh-specific error fixtures/tests.
- **Read-only protected inputs:** Person-detail request/result semantics, shared query/view components, and archived changes.
- **Deletion complement:** Preserve strict unknown-field rejection, scope/section validation, results, and collection metadata.
- **Mutable refs:** Local topic branch only.
- **Consumes/Produces:** Consumes shared query/person-detail components; produces the closed person-detail contract consumed by backend/frontend.
- **Dependencies/Deliverables:** Existing validators only; no refresh-specific vocabulary remains.
- **Acceptance:** Person-detail contract checks and backend/frontend gates.
- **Non-goals/Operations deferred:** No detail behavior change; no remote/live mutation.
- **Stop/rollback conditions:** Stop on contract conflict; roll back the isolated branch.

## MODIFIED Requirements

### Requirement: Person detail SHALL use one closed operation contract

The request SHALL contain required shared `query`, required
`input.personId`, and optional shared `PersonDetailViewV1`. It SHALL reject
mode, image URLs, frontend revision, Drawer state, and unknown fields.
Scope/section-specific sort values SHALL fail with a stable field error.

#### Scenario: An unknown field is supplied
- **WHEN** a person-detail request contains an undeclared top-level member
- **THEN** the closed request SHALL reject it before collection or Archive evaluation
