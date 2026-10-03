# frontend-query-progress

## Purpose

Expose honest live query progress while retaining existing query results, cancellation boundaries and statistical authority.

## Requirements

### Requirement: Accessible Chinese progress
The frontend SHALL show live Chinese stage text and an accessible progress indicator for active query requests. A known total SHALL represent only its current phase; otherwise the indicator SHALL remain indeterminate.

#### Scenario: Unknown collection total
- **WHEN** a successful page update has completed but no total
- **THEN** the UI reports the page count with an indeterminate bar.

### Requirement: Request lifecycle admission
The sole API fetch owner SHALL parse streaming frames and reuse existing result decoders. Progress SHALL be isolated by request identity, retired on completion/cancel/error/replacement, and not leaked into a later request. Interrupted streams SHALL use explicit retry rather than claim completion or transparently replay.

#### Scenario: Retry after disconnect
- **WHEN** a stream ends before its result
- **THEN** the UI stops progress and presents the existing Chinese failure/retry path; retry starts fresh.
