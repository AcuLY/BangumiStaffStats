# frontend-person-inspector Specification

## Purpose
Define an adaptive ranking person inspector backed by one strict coordinated person-detail resource, with keyboard-accessible desktop and mobile presentation and server-authoritative evidence, search, sorting, and pagination views.
## Requirements
### Requirement: Person detail SHALL use one strict coordinated resource

The SPA SHALL retain one coordinated ranking person-detail resource and an isolated transient co-star preview resource. Both SHALL send same-origin `POST /api/v1/person-detail` through the existing typed native-fetch drivers and strict generated response adapters, with latest-request, Applied Query revision and data/collection snapshot admission. Requests SHALL contain the current Applied Query, explicit person input and server-side view. Co-star preview MAY include the accepted identity subset in person input, and SHALL NOT overwrite retained ranking selection, evidence or view. The frontend SHALL NOT create a second Applied Query owner, persist preview response bodies, ship fixtures, contact Bangumi directly, or recompute detail statistics.

#### Scenario: A superseded person resolves late
- **WHEN** person B is focused after person A and A resolves last
- **THEN** only person B SHALL become the visible detail

#### Scenario: A detail view refresh is pending
- **WHEN** search, sort, section, page, or pageSize changes for accepted detail
- **THEN** the accepted header and aggregate evidence SHALL remain visible while only the item browser is pending

#### Scenario: Co-star preview and retained ranking coexist
- **WHEN** a co-star participant is inspected while a ranking detail is retained
- **THEN** preview results SHALL remain isolated, headings SHALL have unique IDs, and closing or resizing preview SHALL preserve usable focus and original analysis state

### Requirement: Ranking activation SHALL expose one adaptive inspector

Every ranking row SHALL open its person detail. At widths of at least 960px the detail
SHALL appear beside the ranking list; below 960px it SHALL appear in a
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
- **WHEN** the accepted detail identity scope has no cast capability
- **THEN** the inspector SHALL not offer a character-view control

### Requirement: Drawer preserves Header navigation
The person drawer SHALL keep the Header operable by pointer and keyboard while the covered page content remains inert. Switching to co-star SHALL close the drawer, preserve accepted person state and retain navigation focus. The drawer SHALL not claim page-wide aria-modal isolation.
#### Scenario: Switch modes with detail open
- **WHEN** the user activates the Header co-star tab while a person drawer is open
- **THEN** co-star becomes active and the drawer closes without blocking Header interaction
### Requirement: Section typography and tag label columns align
Person detail and co-star section headings SHALL use 18px. Tag label columns SHALL fit their text and retain a 12px gap before wrapping tag values.
#### Scenario: Narrow tag section
- **WHEN** tag groups render at a narrow viewport
- **THEN** label columns do not reserve unused 104px tracks and values wrap without horizontal overflow

### Requirement: Person series cards SHALL show the returned representative metadata
Detailed series cards SHALL display API metaTags through the existing subject-card NTag metadata layout. They SHALL preserve the user's current names, tags, member layout and other interactions. The frontend SHALL NOT derive tags from member works or statistical summaries; an empty array SHALL omit the metadata row.

#### Scenario: Representative and member tags differ
- **WHEN** a series representative has tags different from another member
- **THEN** the series card metadata SHALL contain only the representative's tags

#### Scenario: Representative metadata is empty
- **WHEN** the representative has no meta tags
- **THEN** an empty array SHALL remain empty through projection and display

### Requirement: Person entry target owns one consumable initial selection
After the entry's ranking query succeeds, the frontend SHALL open its validated person ID through the existing coordinated detail resource even if absent from the first ranking page or the whole ranking is empty. It SHALL reveal the desktop inspector or mobile drawer. This initial target SHALL take precedence over default first-person selection and saved recovery only once. Later user selection, edits, cancellation and stale-response guards SHALL keep their existing ownership.

#### Scenario: Target is not on the first page
- **WHEN** the entry query succeeds but the person is not in the returned ranking page
- **THEN** the explicit person ID SHALL still be requested and opened without frontend searching or recomputing a ranking

### Requirement: Verified no participation is a local detail empty state
Only `PERSON_NOT_IN_QUERY_RESULT` for the active target and successful active query SHALL render “该人物没有参与当前查询条件下的收藏作品” in the existing detail region, retaining the target ID and selected type context. It SHALL not invent profile/rating/work data, globally replace the ranking, or disable query editing. Entity-not-found, private/invalid UID, catalog failure, network error and canceled requests SHALL retain their actual error/retry behavior.

#### Scenario: Empty target then other person
- **WHEN** a valid target has no qualifying works, including only NSFW works or an empty public collection
- **THEN** only the target detail SHALL display the scoped empty state
- **AND** selecting another ranking person SHALL show that person's details without the consumed entry taking control again

#### Scenario: Detail fails or a response arrives late
- **WHEN** a detail request fails for a different reason or arrives after a newer selection
- **THEN** it SHALL not be converted into this empty state or overwrite the latest selection
