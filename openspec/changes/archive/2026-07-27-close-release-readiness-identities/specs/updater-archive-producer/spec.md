## Capability Boundary

| Field | Declaration |
|---|---|
| Status | specified; implementation pending |
| Owner | Updater |
| Writable paths | `updater/src/bangumi_staff_stats_updater/{archive_contract.py,producer/**}`, `updater/tests/**` |
| Read-only protected inputs | Contracts authorities, Backend/frontend source, external Archive roots |
| Deletion complement | None; owned test temporaries only |
| Mutable refs | None |
| Consumes | Tracked compatibility matrix and formal production rule semantics |
| Produces | Archive manifests using the exact supported production pair |
| Dependencies | Updated `contracts-archive-manifest` |
| Deliverables | Producer construction/contract logic and tests |
| Acceptance | Format/lint/type/unit/property and producer/Go-consumer integration |
| Non-goals | Additional pair, caller-defined semantics, activation, scheduling |
| Operations deferred | Periodic run, credentials, publishing, pointer activation |
| Stop/rollback conditions | Stop if an external caller can override the pair or matrix drift is tolerated |

## ADDED Requirements

### Requirement: Updater SHALL own one non-overridable production rule pair

Production Archive construction SHALL derive
`domainRulesVersion=domain-raw-v1` and
`castRulesVersion=cast-exact-v1` from the tracked compatibility authority.
Public construction APIs and CLI paths SHALL not accept an override that can
produce another syntactically valid pair. Contract-check SHALL reject matrix
drift before production work starts.

#### Scenario: Normal production request is constructed
- **WHEN** an admitted request enters the producer
- **THEN** its manifest and SQLite identity SHALL use the exact supported pair

#### Scenario: A caller attempts another pair
- **WHEN** code or serialized input supplies a different domain or cast version
- **THEN** construction SHALL reject it before staging or external acquisition
