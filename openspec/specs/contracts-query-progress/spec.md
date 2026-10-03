# contracts-query-progress

## Purpose

Expose honest live query progress while retaining existing query results, cancellation boundaries and statistical authority.

## Requirements

### Requirement: Optional streaming compatibility
The five existing query POST operations SHALL accept optional text/event-stream negotiation without changing their request schema, default JSON semantics, cache keys or statistical authority.

#### Scenario: JSON and SSE clients
- **WHEN** a caller opts into SSE
- **THEN** the server sends progress events and one terminal result preserving the original status and JSON envelope.

### Requirement: Honest event framing
Progress events SHALL contain a phase and Chinese message, MAY contain completed and total counters, and SHALL omit total when it is not known. Terminal result headers SHALL be allowlisted. An interrupted stream without result SHALL NOT be interpreted as success.

#### Scenario: Unknown total
- **WHEN** collection pagination has no validated total
- **THEN** the event omits total and the UI can show indeterminate progress.
