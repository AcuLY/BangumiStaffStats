## Capability Boundary

Status: implemented interaction delta. Owner: primary. Writable paths: frontend detail preview, App and the existing inspector resource requirement as enumerated in design.md. Read-only protected inputs: unrelated requirements and dirty hunks. Deletion complement: none. Mutable refs: none. Consumes: shared Query and existing typed API drivers. Produces: isolated per-origin resources. Dependencies: contracts-person-workspace-links. Deliverables: source/tests/spec. Acceptance: request-race, preservation and browser tests. Non-goals: new statistical or Query authority. Operations deferred: all. Stop/rollback conditions: preserve existing concurrent work; undo owned hunks only.

## MODIFIED Requirements

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
