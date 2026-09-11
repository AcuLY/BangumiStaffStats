## Capability Boundary

| Field | Boundary |
|---|---|
| Status | Planned |
| Owner | Backend |
| Writable paths | Backend inventory in this change's design.md |
| Read-only protected inputs | Canonical Contracts files, unrelated dirty work, existing active Archive and public wire |
| Deletion complement | No data or endpoint removal |
| Mutable refs | None |
| Consumes | Producer-published SQLite v2 person.summary |
| Produces | Existing optional person.summary response |
| Dependencies | Contracts v2 and Go producer normalization |
| Deliverables | Producer/read implementation and meaningful tests |
| Acceptance | Producer parity, bounded summary cases, actual person-detail response and Backend gate |
| Non-goals | Network enrichment, new cache/admission or statistics changes |
| Operations deferred | Existing active/production runtime changes |
| Stop/rollback conditions | Invalid contract, overlapping write or failed tests; preserve old snapshots |

## ADDED Requirements

### Requirement: Person biographies SHALL flow from the immutable Archive
The Go producer SHALL preserve the canonical normalized bounded person summary in SQLite v2. Person-detail SHALL read that optional stored value and expose it through the existing person.summary field without another source, synthetic biography, statistical transformation or request-time upstream fetch. Its existing dataVersion-bound core cache SHALL remain the only detail cache owner.

#### Scenario: An official person has a biography
- **WHEN** official person input contains a nonblank summary and a v2 candidate is built and queried
- **THEN** person-detail SHALL return the normalized stored biography as person.summary
- **AND** the value SHALL remain identical across work search, sort, page and character views

#### Scenario: Biography is absent
- **WHEN** the source summary is missing, null or blank after normalization
- **THEN** SQLite SHALL store NULL and person-detail SHALL omit summary
- **AND** no placeholder biography SHALL be persisted or fetched from another source

#### Scenario: Biography exceeds the wire bound
- **WHEN** valid source text exceeds 8192 Unicode scalars
- **THEN** the producer SHALL apply the canonical scalar-safe normalization/truncation before storage
- **AND** the response SHALL satisfy the existing wire bound without splitting a Unicode scalar
