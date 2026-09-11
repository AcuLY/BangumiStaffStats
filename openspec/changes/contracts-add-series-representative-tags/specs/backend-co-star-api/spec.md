## Capability Boundary
| Field | Boundary |
|---|---|
| Status | Specified; apply requires strict validation and primary review |
| Owner | Backend |
| Writable paths | backend/internal/costar/{types.go,build.go,projection.go,clone.go,cache.go,build_test.go,cache_test.go,view_test.go}; backend/internal/httpapi/wire/co_star.gen.go; this delta and matching root specification |
| Read-only protected inputs | PRODUCT/DESIGN, accepted data decisions, Archive, query/statistics, unrelated dirty edits |
| Deletion complement | All existing work evidence, controls and recent NTag/xicons/divider changes |
| Mutable refs | None |
| Consumes | Owned co-star schema/goldens and representative tag facts |
| Produces | Representative series metadata across declared producer/consumer boundary |
| Dependencies | Contracts -> Backend -> Frontend |
| Deliverables | Contract-aligned implementation and regression evidence |
| Acceptance | Operation goldens/generated checks, focused tests, affected component gates and browser series view where applicable |
| Non-goals | Member/summary tag aggregation, new sources, Archive/statistics or dependency changes |
| Operations deferred | Git integration, releases and production/host mutation |
| Stop/rollback conditions | Conflicting edits, contract/semantic drift, failed acceptance; no destructive cleanup |

## ADDED Requirements
### Requirement: Common series metadata SHALL come from its displayed representative
Both scope projections SHALL populate metaTags from the existing displayed representative's meta tag facts using the stable bounded tag-name policy. Other members SHALL NOT contribute tags to this card field. Cloning and cache accounting SHALL include the field, while shared-work intersection, summary and metrics remain unchanged.

#### Scenario: Representative and member tags differ
- **WHEN** a series representative has tags different from another member
- **THEN** the series card metadata SHALL contain only the representative's tags

#### Scenario: Representative metadata is empty
- **WHEN** the representative has no meta tags
- **THEN** an empty array SHALL remain empty through projection and display
