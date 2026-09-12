## Capability Boundary

See proposal.md and design.md for the shared change boundary. Status: specified; Owner: capability prefix owner. Writable paths: the owner's cast-related source/test/contracts paths declared in design.md. Read-only protected inputs: unrelated dirty hunks, existing data, operations, dependency versions and other active changes. Deletion complement: no files removed. Mutable refs: none. Consumes: exact eligible role 1..6 facts and shared catalog/query schemas. Produces: seven scopes and six role labels. Dependencies: contracts before consumers. Deliverables: implementation and regression evidence. Acceptance: proportional focused and complete affected-component gates, generated checks and browser QA. Non-goals: formulas, inferred credits, redesign. Operations deferred: all external mutations. Stop/rollback conditions: stop conflicts/failing gates; reverse owned hunks only.

## ADDED Requirements

### Requirement: Exact role scopes preserve statistics and identity
The backend SHALL evaluate each individual cast scope against only its exact eligible numeric role, while retaining current deduplication, work filters and statistical calculations. SharedQuery SHALL keep one cast scope per subject type. All-position browsing SHALL use the all cast identity only when it exists; explicit individual identities SHALL remain valid for operation/detail input.

#### Scenario: Supporting role excludes unrelated main credits
- **WHEN** supporting is selected for a person with both main and supporting credits
- **THEN** only supporting credits contribute to its selected work and character result

#### Scenario: All-position browsing does not duplicate cast roles
- **WHEN** all-position candidates are browsed with all seven scopes available
- **THEN** only the all cast identity is automatically included, and explicitly chosen individual identities still work in co-star and detail

#### Scenario: All is a superset
- **WHEN** eligible credits contain every role from 1 through 6
- **THEN** all includes them all while each individual scope includes only its role
