## Capability Boundary

Status: user-approved extension. Owner: contracts/backend and primary spec sync. Writable paths: this delta and the existing explicit identity requirement. Read-only protected inputs: all other old requirements and dirty hunks. Deletion complement: none. Mutable refs: none. Consumes: strict Query and catalog. Produces: all-scope identity detail. Dependencies: contracts-co-star-position-scope. Deliverables: synchronized requirement and implementation. Acceptance: scope detail tests. Non-goals: altered ranking location. Operations deferred: all production. Stop/rollback conditions: preserve unrelated work.

## MODIFIED Requirements

### Requirement: Explicit identity detail
The person-detail operation SHALL accept optional nonempty unique input.positionKeys. With missing/query positionScope, identities SHALL be contained in the submitted Query; with all scope, identities SHALL be selectable supported positions of the same subject type in the live catalog. It SHALL return the person's evidence under precisely those identities without requiring membership under all Query positions, using server statistical authority and identity-isolated caching. Omitting positionKeys SHALL preserve original ranking-detail behavior.

#### Scenario: Participant with only one queried position
- **WHEN** Query selects director and writer but the inspected participant selects director only
- **THEN** detail returns director evidence, the client retains the shared Query, and character sections are available only if the inspected identity scope includes cast

#### Scenario: Invalid identity or cache collision
- **WHEN** identities are empty, duplicate, outside the permitted scope, or another person's/identity scope was cached
- **THEN** invalid input is rejected and a valid request cannot reuse a different identity scope's evidence

#### Scenario: Partner outside ranking positions
- **WHEN** a director Query opens the explicit script identity of a valid partner with all scope
- **THEN** script evidence is returned while the original ranking Query remains director-only
