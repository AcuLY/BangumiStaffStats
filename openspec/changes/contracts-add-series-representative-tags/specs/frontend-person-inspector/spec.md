## Capability Boundary
| Field | Boundary |
|---|---|
| Status | Specified; apply requires strict validation and primary review |
| Owner | Frontend |
| Writable paths | frontend/src/features/person-detail/components/PersonItemBrowser.vue; frontend/src/api/generated/person-detail/{types.gen.ts,schemas.gen.ts}; frontend/tests/{api/person-detail.test.ts,features/person-detail/components.test.ts}; this delta and matching root specification |
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
### Requirement: Person series cards SHALL show the returned representative metadata
Detailed series cards SHALL display API metaTags through the existing subject-card NTag metadata layout. They SHALL preserve the user's current names, tags, member layout and other interactions. The frontend SHALL NOT derive tags from member works or statistical summaries; an empty array SHALL omit the metadata row.

#### Scenario: Representative and member tags differ
- **WHEN** a series representative has tags different from another member
- **THEN** the series card metadata SHALL contain only the representative's tags

#### Scenario: Representative metadata is empty
- **WHEN** the representative has no meta tags
- **THEN** an empty array SHALL remain empty through projection and display
