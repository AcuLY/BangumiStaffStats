## Capability Boundary

| Boundary | Declaration |
|---|---|
| Status | specified: approved; implemented: no; verified: main dependency review and strict planning gates passed |
| Owner | Correction owner updates bounded Go binding/tests only. |
| Writable paths | Exact five Go paths in proposal plus task markers. |
| Read-only protected inputs | Other backend/updater/contracts/product state. |
| Consumes | Corrected canonical schema/object seals and regenerated corpus. |
| Produces | Read-only consumer binding and boundary regression evidence. |
| Dependencies | Corrected Contracts candidate precedes Go adaptation. |
| Non-goals | Producer/catalog/query/HTTP behavior, fallback, operations. |
| Stop/rollback conditions | Stop on Contracts drift, extra path need, or failed startup/integrity gates. |

## MODIFIED Requirements

### Requirement: Candidate load validates every compatibility gate before publication

The consumer SHALL bind to the corrected canonical schema SQL and 35-object
definition seals. Its real-SQLite contract evidence SHALL accept a valid
15-character staff-set key under the corrected DDL and reject the superseded
schema identity. Loader behavior remains read-only and all existing gate
precedence remains unchanged.

#### Scenario: Corrected draft-v1 fixture is loaded
- **WHEN** the regenerated canonical fixture carries the corrected schema/object seals
- **THEN** candidate validation SHALL pass all existing startup gates
- **AND** the bound consumer SHALL expose no fallback to the superseded lower-bound definition
