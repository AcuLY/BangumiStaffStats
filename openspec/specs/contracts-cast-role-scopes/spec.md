# contracts-cast-role-scopes

## Purpose

Expose the six upstream cast roles as individual selectable scopes and truthful role labels while preserving exact eligible credit semantics, catalog-driven presentation and the all scope.

## Requirements

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
