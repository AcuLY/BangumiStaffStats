## Capability Boundary

- **Status/Owner:** Modified; Contracts owns co-star wire closure.
- **Writable paths:** Co-star accepted spec and refresh-specific error fixtures/tests.
- **Read-only protected inputs:** Co-star topology, identity limits, result semantics, and archived changes.
- **Deletion complement:** Preserve strict closure, participant limits, scope-specific results, and collection metadata.
- **Mutable refs:** Local topic branch only.
- **Consumes/Produces:** Consumes shared query/co-star components; produces the co-star contract consumed by backend/frontend.
- **Dependencies/Deliverables:** Existing validators only; generic unknown-member rejection remains.
- **Acceptance:** Co-star contract checks and backend/frontend gates.
- **Non-goals/Operations deferred:** No co-star evaluation change; no remote/live mutation.
- **Stop/rollback conditions:** Stop on contract conflict; roll back the isolated branch.

## MODIFIED Requirements

### Requirement: Co-star wire SHALL encode one closed pair or group analysis

`POST /api/v1/co-star` SHALL accept `query`, 2–10 ordered unique participants
with positive JSON-safe person IDs and ordered-unique non-empty opaque query
PositionKeys, and optional view. Total identities SHALL not exceed 20.
The endpoint SHALL reject zero/one participant, duplicates, excessive people,
excessive identities, and unknown members with stable field/error codes.

Success SHALL be a closed scope-specific pair/group union with workUnit,
ordered participants, summary, tags, rating datasets, optional personal
preference, group-only matrix, current work items, pagination, request metadata,
and personal-only collection metadata.

#### Scenario: One participant is submitted
- **WHEN** a request contains one participant
- **THEN** it SHALL be rejected because one-person analysis belongs to partners

#### Scenario: A global group succeeds
- **WHEN** a global request with three participants succeeds
- **THEN** it SHALL contain the group matrix and omit preference, personal rating members, and collection metadata
