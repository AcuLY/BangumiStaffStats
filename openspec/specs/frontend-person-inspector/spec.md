# frontend-person-inspector Specification

## Purpose
Define an adaptive ranking person inspector backed by one strict coordinated person-detail resource, with keyboard-accessible desktop and mobile presentation and server-authoritative evidence, search, sorting, and pagination views.
## Requirements
### Requirement: Person detail SHALL use one strict coordinated resource

The SPA SHALL send same-origin `POST /api/v1/person-detail` requests through
the accepted native-fetch client and existing query coordinator. Requests
SHALL contain the current Applied Query, explicit person input, and server-side
view. The adapter SHALL strictly decode generated success/error contracts.
The frontend SHALL NOT create a second Applied Query owner, ship fixtures,
contact Bangumi directly, or recompute detail statistics.

#### Scenario: A superseded person resolves late
- **WHEN** person B is focused after person A and A resolves last
- **THEN** only person B SHALL become the visible detail

#### Scenario: A detail view refresh is pending
- **WHEN** search, sort, section, page, or pageSize changes for accepted detail
- **THEN** the accepted header and aggregate evidence SHALL remain visible while only the item browser is pending

### Requirement: Ranking activation SHALL expose one adaptive inspector

Every ranking row SHALL open its person detail. At desktop widths the detail
SHALL appear beside the ranking list; at compact widths it SHALL appear in a
dismissible drawer using the same content and state. Activation, dismissal,
and restored focus SHALL be keyboard operable with visible focus, at least
44px controls, reduced-motion support, and no horizontal overflow.

#### Scenario: A mobile row is activated
- **WHEN** a keyboard or pointer user activates a ranking row on a compact viewport
- **THEN** the drawer SHALL open, identify the selected person, and expose an accessible close control

### Requirement: Person evidence and item views SHALL remain server-authoritative

The inspector SHALL preserve the oracle's outward hierarchy for person
identity, participation summary, metrics, preference evidence, tags, rating
distribution, timeline, works/series, and cast-only characters. It SHALL
display response values and omission semantics unchanged. Works, characters,
search, sort, order, page, and pageSize SHALL be requested as server view state;
the frontend SHALL not derive aggregates from a page or invent missing values.
Images SHALL use only the shared same-origin SafeImage lifecycle.

#### Scenario: Global detail omits personal evidence
- **WHEN** a valid global response contains no preference evidence
- **THEN** the inspector SHALL omit the personal section without rendering a placeholder value

#### Scenario: Cast capability is absent
- **WHEN** the accepted query cannot request the characters section
- **THEN** the inspector SHALL not offer a character-view control
