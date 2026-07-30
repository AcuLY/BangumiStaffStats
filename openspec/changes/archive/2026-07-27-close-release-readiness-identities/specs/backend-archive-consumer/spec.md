## Capability Boundary

| Field | Declaration |
|---|---|
| Status | specified; implementation pending |
| Owner | Backend |
| Writable paths | `backend/internal/archive/**` |
| Read-only protected inputs | Contracts authorities, updater/frontend source, external Archive roots |
| Deletion complement | None |
| Mutable refs | None |
| Consumes | Tracked Archive compatibility matrix and manifest |
| Produces | Fail-closed read-only Archive admission |
| Dependencies | Updated `contracts-archive-manifest` |
| Deliverables | Consumer validation and precedence tests |
| Acceptance | Unit/golden/race tests and exact wrong-pair failure |
| Non-goals | Schema/fixture mutation, inferred compatibility, API behavior change |
| Operations deferred | Real pointer activation/restart/rollback |
| Stop/rollback conditions | Stop on duplicated constants, fail-open token handling, or changed error precedence |

## ADDED Requirements

### Requirement: Backend SHALL admit only the matrix rule pair

Backend Archive admission SHALL compare manifest domain/cast rule versions with
the exact tracked compatibility tuple together with the existing version,
algorithm, application-id, and schema identities. This compatibility check
SHALL occur after strict JSON/accounting validation and before dataVersion,
path, digest, or SQLite work.

#### Scenario: Rule pair matches
- **WHEN** the manifest uses `domain-raw-v1` and `cast-exact-v1` with all other supported fields
- **THEN** Backend SHALL continue through normal immutable Archive admission

#### Scenario: Rule pair is unknown
- **WHEN** either rule token is valid syntax but not the supported tuple
- **THEN** Backend SHALL return `ARCHIVE_VERSION_UNSUPPORTED` without opening SQLite
