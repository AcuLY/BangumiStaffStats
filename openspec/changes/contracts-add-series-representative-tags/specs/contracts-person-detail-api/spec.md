## Capability Boundary
| Field | Boundary |
|---|---|
| Status | Specified; apply requires strict validation and primary review |
| Owner | Contracts |
| Writable paths | contracts/schemas/person-detail/success-envelope-v1.schema.json; contracts/goldens/api/person-detail/{cases/*.json,verify.mjs}; this delta and matching root specification |
| Read-only protected inputs | PRODUCT/DESIGN, accepted data decisions, Archive, query/statistics, unrelated dirty edits |
| Deletion complement | All existing work evidence, controls and recent NTag/xicons/divider changes |
| Mutable refs | None |
| Consumes | Owned person-detail schema/goldens and representative tag facts |
| Produces | Representative series metadata across declared producer/consumer boundary |
| Dependencies | Contracts -> Backend -> Frontend |
| Deliverables | Contract-aligned implementation and regression evidence |
| Acceptance | Operation goldens/generated checks, focused tests, affected component gates and browser series view where applicable |
| Non-goals | Member/summary tag aggregation, new sources, Archive/statistics or dependency changes |
| Operations deferred | Git integration, releases and production/host mutation |
| Stop/rollback conditions | Conflicting edits, contract/semantic drift, failed acceptance; no destructive cleanup |

## ADDED Requirements
### Requirement: Series person-detail work SHALL expose representative metadata
GlobalSeriesWorkV1 and PersonalSeriesWorkV1 SHALL contain required metaTags using the same constraints as subject works: a unique array of at most 16 strings, each 1–255 characters. When the representative has no tags, metaTags SHALL be encoded as []. Go and TypeScript producers/consumers SHALL agree through generated types and operation goldens.

#### Scenario: Invalid metadata is rejected
- **WHEN** a series work omits metaTags or contains null, duplicate, empty or oversized values
- **THEN** the closed person-detail schema SHALL reject it

#### Scenario: Empty representative metadata
- **WHEN** the representative has no meta tags
- **THEN** the response SHALL contain an empty array
