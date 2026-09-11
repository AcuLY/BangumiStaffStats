## Capability Boundary
| Field | Boundary |
|---|---|
| Status | Specified; apply requires strict validation and primary review |
| Owner | Contracts |
| Writable paths | contracts/schemas/co-star/success-envelope-v1.schema.json; contracts/goldens/api/co-star/{cases/*.json,verify.mjs}; this delta and matching root specification |
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
### Requirement: Co-star series work SHALL expose representative metadata
GlobalSeriesWorkV1 and PersonalSeriesWorkV1 SHALL contain required metaTags using the existing subject-work field constraints. The array SHALL contain at most 16 unique nonempty strings of at most 255 characters; when the representative has no tags, metaTags SHALL be []. Go and TypeScript producers/consumers SHALL agree through operation goldens and generated types.

#### Scenario: Invalid metadata is rejected
- **WHEN** a series work omits metaTags or contains null, duplicate, empty or oversized values
- **THEN** the closed co-star schema SHALL reject it

#### Scenario: Empty representative metadata
- **WHEN** the representative has no meta tags
- **THEN** the response SHALL contain an empty array
