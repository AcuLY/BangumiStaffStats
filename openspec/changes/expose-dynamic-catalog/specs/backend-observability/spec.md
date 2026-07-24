## Capability Boundary

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: no; verified: main semantic/authority/path review and strict OpenSpec gates passed |
| Owner | Backend owner extends only the closed catalog observations after Contracts acceptance; main agent reviews. |
| Writable paths | Exactly the observability source/test paths enumerated in `proposal.md` and Backend task markers. |
| Read-only protected inputs | All Contracts, other backend paths, updater/frontend, root specs, authorities, refs/remotes, external state, and production. |
| Deletion complement | None; existing event/metric enums, series, tests, and redaction guarantees remain intact. |
| Mutable refs | None. |
| Consumes | Accepted observability capability, exact catalog route/operation, and accepted catalog error semantics. |
| Produces | Closed catalog route/operation observations using existing event and metric families only. |
| Dependencies | Exactly the three exited dependencies named by the proposal, then Contracts acceptance. |
| Deliverables | Catalog inventory additions and concurrency/redaction/cardinality regression tests. |
| Acceptance | Exactly-once terminal events, fixed labels, cancellation, redaction, parse/cardinality/race/full/OpenSpec gates. |
| Non-goals | New metric families, catalog contents/counts as telemetry, dashboards/alerts/exporters, operations, or deployment. |
| Operations deferred | External scrape configuration, monitoring, alerting, retention, SLOs, deployment, and production exposure. |
| Stop/rollback conditions | Stop on arbitrary/high-cardinality data, new sink/family, existing-series drift, protected-path need, or dependency/contract mismatch. |

## ADDED Requirements

### Requirement: Catalog observations SHALL use only closed existing telemetry

The exact catalog route SHALL extend the existing closed route and operation
inventories with only `catalog`. It SHALL use the existing HTTP
count/duration/response-byte metric families and the existing typed
`query_completed`/`query_rejected` event constructors. A terminal JSON
response SHALL produce exactly one mutually exclusive terminal event for the
typed request; cancellation before commit SHALL emit neither. Metric outcome,
status class, and cancellation behavior SHALL remain those of the accepted
HTTP middleware.

A catalog event SHALL contain only request ID, fixed operation, terminal
status/error classification, duration, response bytes, bounded content
length, and closed safe field paths already admitted by the event contract.
No event or label SHALL contain dataVersion, PositionKey, subject type, group,
rule, capability, row/entity count, SQL, query string, body, Archive path or
digest, raw error, or arbitrary value. Catalog SHALL add no metric family,
label dimension, remote sink, dashboard, alert, or history.

#### Scenario: Catalog requests terminate
- **WHEN** success, invalid input, wrong method, not-ready, internal failure, deadline, and cancellation cases run
- **THEN** committed JSON outcomes produce exactly one closed terminal event and one fixed catalog metric observation
- **AND** cancellation before commit produces no terminal event and uses only the accepted canceled metric outcome

#### Scenario: Catalog values are offered to telemetry
- **WHEN** tests offer dataVersion, keys, labels, counts, SQL, paths, raw errors, or attacker-controlled values
- **THEN** constructors and closed labels SHALL make those values unrepresentable or reject them
- **AND** event/metric inventories and series cardinality SHALL remain bounded under race tests
