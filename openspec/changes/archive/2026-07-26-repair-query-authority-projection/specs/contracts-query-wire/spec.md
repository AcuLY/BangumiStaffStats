## ADDED Requirements

### Requirement: Query authority evidence SHALL use one closed owned projection

The Query golden verifier SHALL derive its authority from one deterministic
projection of the shared OpenAPI document containing zero paths, exactly the 17
accepted Query component schemas, exactly the nine accepted shared error
responses, and the accepted fixed Query description. It SHALL audit and copy
only that projected OpenAPI plus the seven Query schema files. Endpoint paths,
endpoint-only components, and rankings/candidates/person-detail/partners/co-star
schema roots SHALL remain outside Query ownership and generated-tree inventory.

The canonical authority/projection evidence SHALL change when an owned Query
component changes and SHALL remain byte-identical when an unrelated path,
component, header, response, description, or endpoint schema is added. Both
disposable codegen trees, the backend Query generator, and the frontend Query
generator SHALL agree on the public Query component inventory and generated
wire bytes.

#### Scenario: Independent endpoints exist in the shared authority

- **WHEN** the shared OpenAPI contains accepted endpoint paths and external
  endpoint schema references
- **THEN** Query verification SHALL select and validate only its closed
  projection without traversing or copying those references

#### Scenario: Unrelated authority changes

- **WHEN** a synthetic unrelated path and component are added outside the
  Query projection
- **THEN** the canonical Query projection digest and generated Query bytes
  SHALL remain unchanged

#### Scenario: Owned Query authority changes

- **WHEN** a selected Query component is missing or its content changes
- **THEN** Query verification SHALL fail or produce different projection
  evidence before accepting generated wire bytes
