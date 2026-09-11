# contracts-co-star-position-scope Specification

## Purpose
Define independent co-star operation positions while preserving original Query and exact person identities.

## Requirements


### Requirement: All-scope queries without concrete positions
Candidates, partners, co-star and explicit identity person-detail SHALL accept an empty Query positionKeys array only when input.positionScope is all. Rankings, ordinary shared-query normalization and missing/query operation scope SHALL continue requiring a nonempty concrete position set. All other query validation and explicit identity/catalog rules SHALL remain unchanged; no fallback key or global AND expansion SHALL be generated.

#### Scenario: First all-position candidates
- **WHEN** candidates receives valid work filters, empty query.positionKeys and input.positionScope all
- **THEN** the backend evaluates all supported candidate positions for that subject type and returns ordinary server-ranked candidates

#### Scenario: Invalid empty-position scope
- **WHEN** rankings or a query-scope operation receives empty query.positionKeys
- **THEN** it rejects the request before statistical computation

### Requirement: Independent operation position scope
Candidates, partners, co-star and explicit identity person-detail SHALL accept input.positionScope query|all with missing equivalent to query. All SHALL resolve selectable supported positions for the Query subject type while preserving every shared work/collection condition and source/participant identity. Unsupported, unknown or cross-type identities SHALL fail closed. Cache identities SHALL separate effective position scopes.

#### Scenario: Director source and script partner
- **WHEN** a director-only Query requests partners for director A with all scope
- **THEN** script B sharing a qualifying raw work appears with its actual script identity, without changing the ranking Query

#### Scenario: Source main cast and all cast partners
- **WHEN** the source explicitly selects main cast and all-position partners are requested
- **THEN** source evidence stays main-only while supporting cast partners may qualify, and default candidate output does not duplicate main/all identities

#### Scenario: Pair and detail after cross-role selection
- **WHEN** director A and script B are selected from an all-scope operation
- **THEN** pair/group/detail accept the explicit supported identities and preserve normal raw-work union/intersection and metrics

#### Scenario: Scope cache isolation
- **WHEN** query-scope and all-scope requests use the same shared Query and people
- **THEN** one scope cannot reuse the other's semantically different result
