# frontend-cast-role-scopes

## Purpose

Expose the six upstream cast roles as individual selectable scopes and truthful role labels while preserving exact eligible credit semantics, catalog-driven presentation and the all scope.

## Requirements

### Requirement: Catalog-driven role choices and truthful tags
The frontend SHALL render seven catalog-provided cast options with the approved labels and preserve selected exact identities in query/recovery/detail/co-star. It SHALL display actual backend role labels, including minor, narrator and voice-library, without inferring roles or statistics.

#### Scenario: Role selection replaces the previous scope
- **WHEN** a user selects another cast scope for the same subject type
- **THEN** the existing cast scope is replaced using the established selector interaction and the new name contains no 仅

#### Scenario: Labels remain usable across viewports
- **WHEN** the selector or detail is rendered on desktop or mobile with any of the six role labels
- **THEN** the existing keyboard semantics, tag layout and viewport containment are preserved

#### Scenario: Explicit identity survives recovery
- **WHEN** a successful query or co-star selection uses an individual cast scope and the tab is refreshed
- **THEN** normal recovery retains that scope and reloads results instead of substituting all or main
