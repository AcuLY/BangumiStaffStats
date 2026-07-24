## Capability Boundary

| Boundary | Declaration |
|---|---|
| Status | specified: approved; implemented: no; verified: main authority review and strict planning gates passed |
| Owner | Correction owner updates bounded Contracts authority; producer/catalog consume it read-only. |
| Writable paths | Exact Contracts paths in proposal plus this task's markers. |
| Read-only protected inputs | All other Contracts/runtime/state, especially active Updater work. |
| Consumes | Accepted 1–64 staff-set slug grammar and unpublished Archive v1. |
| Produces | Corrected staff-set key bound and regenerated identities/evidence. |
| Dependencies | Raw-domain correction exited; producer Contracts accepted. |
| Non-goals | Staff-set activation, catalog/query semantics, version bump, operations. |
| Stop/rollback conditions | Stop on formal v1, path-set drift, overlap, or failed deterministic gates. |

## MODIFIED Requirements

### Requirement: Archive SQLite schema is strict and versioned

The `staff_set.set_key` check SHALL accept inclusive text length `15..96`.
Fifteen is the exact minimum for the accepted
`staffset:{book|anime|music|game|real}:{slug}` family with a one-character
slug. This correction SHALL NOT change the one-character slug allowance, the
96-byte full-key maximum, table/index inventory, manifest/SQLite version, or
dataVersion algorithm.

The canonical schema SQL/object seals and every dependent canonical and
producer identity SHALL be regenerated deterministically while retaining the
exact existing 32-file canonical path set and 15-case producer path set.

#### Scenario: Inclusive staff-set key bounds are exercised
- **WHEN** real SQLite receives valid staff-set keys of exact lengths 15 and 96
- **THEN** both inserts SHALL succeed under the canonical DDL
- **AND** otherwise equivalent keys of lengths 14 and 97 SHALL fail the DDL check

#### Scenario: Corrected schema identities are rebuilt
- **WHEN** the corrected DDL is built twice from identical inputs
- **THEN** schema/object/dataVersion/SQLite/manifest/pointer/vector/index and producer-case identities SHALL match across runs
- **AND** no canonical or producer indexed path SHALL be added, removed, or reinterpreted
