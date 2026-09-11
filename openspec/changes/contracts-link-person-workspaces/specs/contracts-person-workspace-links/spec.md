## Capability Boundary

Status: reviewed additive capability. Owner: backend_design for contracts/backend/generated consumers. Writable paths: the contracts/backend Owned files enumerated in ../../design.md. Read-only protected inputs: all other files and pre-existing hunks. Deletion complement: none. Mutable refs: none. Consumes: shared Query and canonical identity contracts. Produces: scoped person detail and exact ranking location. Dependencies: schema before generator/consumer. Deliverables: wire, Go implementation and tests. Acceptance: golden verification, affected Go tests and backend gate. Non-goals: formulas or new routes. Operations deferred: all. Stop/rollback conditions: stop on authority/concurrent-write conflicts; no reset/clean/checkout or unrelated deletion.

## ADDED Requirements

### Requirement: Explicit identity detail
The person-detail operation SHALL accept optional nonempty unique input.positionKeys contained in the submitted Query. It SHALL return the person's evidence under precisely those identities without requiring membership under all Query positions, using server statistical authority and identity-isolated caching. Omitting the field SHALL preserve existing behavior.

#### Scenario: Participant with only one queried position
- **WHEN** Query selects director and writer but the inspected participant selects director only
- **THEN** detail returns director evidence, the client retains the shared Query, and character sections are available only if the inspected identity scope includes cast

#### Scenario: Invalid identity or cache collision
- **WHEN** identities are empty, duplicate, outside Query, or another person's/identity scope was cached
- **THEN** invalid input is rejected and a valid request cannot reuse a different identity scope's evidence

### Requirement: Authoritative exact ranking location
Rankings SHALL accept optional view.locatePersonId and return optional data.location with personId, nullable rank and nullable page. The backend SHALL compute rank before search and target page after search using requested sort, direction and page size, without changing requested pagination.

#### Scenario: Ranked person off the visible page
- **WHEN** a person belongs to the full ranking outside the requested page
- **THEN** location returns its exact full-set rank and its page while the ordinary page and summary remain unchanged

#### Scenario: Missing person or filtered name
- **WHEN** the person is outside the full ranking or excluded only by search
- **THEN** outside ranking returns null rank/page, while search-only exclusion returns its rank and null page
