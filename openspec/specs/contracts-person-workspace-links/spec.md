# contracts-person-workspace-links Specification

## Purpose
Define server-authoritative identity-scoped person detail and exact ranking location for linked workspaces.

## Requirements

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

### Requirement: Authoritative exact ranking location
Rankings SHALL accept optional view.locatePersonId and return optional data.location with personId, nullable rank and nullable page. The backend SHALL compute rank before search and target page after search using requested sort, direction and page size, without changing requested pagination.

#### Scenario: Ranked person off the visible page
- **WHEN** a person belongs to the full ranking outside the requested page
- **THEN** location returns its exact full-set rank and its page while the ordinary page and summary remain unchanged

#### Scenario: Missing person or filtered name
- **WHEN** the person is outside the full ranking or excluded only by search
- **THEN** outside ranking returns null rank/page, while search-only exclusion returns its rank and null page
