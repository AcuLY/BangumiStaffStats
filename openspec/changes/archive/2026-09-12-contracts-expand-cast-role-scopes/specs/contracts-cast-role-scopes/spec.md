## Capability Boundary

See proposal.md and design.md for the shared change boundary. Status: specified; Owner: capability prefix owner. Writable paths: the owner's cast-related source/test/contracts paths declared in design.md. Read-only protected inputs: unrelated dirty hunks, existing data, operations, dependency versions and other active changes. Deletion complement: no files removed. Mutable refs: none. Consumes: exact eligible role 1..6 facts and shared catalog/query schemas. Produces: seven scopes and six role labels. Dependencies: contracts before consumers. Deliverables: implementation and regression evidence. Acceptance: proportional focused and complete affected-component gates, generated checks and browser QA. Non-goals: formulas, inferred credits, redesign. Operations deferred: all external mutations. Stop/rollback conditions: stop conflicts/failing gates; reverse owned hunks only.

## ADDED Requirements

### Requirement: Closed cast scope and role label domain
Contracts SHALL admit cast:<anime|game>:main|supporting|guest|minor|narrator|voice-library|all and map individual scopes to role 1..6 respectively. All SHALL cover 1..6. The label domain SHALL be 主役, 配角, 客串, 闲角, 旁白, 声库. Shared JSON schemas/OpenAPI are authoritative for generated Go and TypeScript consumers.

#### Scenario: Each individual role is selectable
- **WHEN** a catalog is produced for anime or game
- **THEN** it exposes seven cast choices, with the individual role labels wrapped in 声优（） and no 仅, while all remains 声优

#### Scenario: Invalid or mismatched identity fails closed
- **WHEN** a scope is unknown or its exactCast predicate does not match its numeric role
- **THEN** validation rejects it rather than treating it as all

#### Scenario: Truthful role response
- **WHEN** a detail or co-star contribution has role 4, 5 or 6
- **THEN** its role label is respectively 闲角, 旁白 or 声库, accepted by generated consumers
