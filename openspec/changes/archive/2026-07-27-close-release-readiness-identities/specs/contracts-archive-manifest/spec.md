## Capability Boundary

| Field | Declaration |
|---|---|
| Status | specified; implementation pending |
| Owner | Contracts |
| Writable paths | `contracts/schemas/archive/**`, `contracts/goldens/archive/**`, `contracts/producer-runtime-inputs-v1.json` |
| Read-only protected inputs | Product semantics, producer source, Backend source, external Archive/provenance |
| Deletion complement | None; derived fixtures regenerate only through existing bounded tooling |
| Mutable refs | None |
| Consumes | Formal producer rule semantics and existing Archive v1 contract |
| Produces | One exact supported rule tuple and regenerated language-neutral evidence |
| Dependencies | Existing `contracts-archive-manifest` |
| Deliverables | Matrix/golden/tooling/runtime-input evidence updates |
| Acceptance | Strict schemas, closed indexes, deterministic regeneration, Python/Go consumer goldens |
| Non-goals | SQLite DDL, dataVersion algorithm, query semantics, or additional rule versions |
| Operations deferred | Archive production activation and deployment |
| Stop/rollback conditions | Stop on more than one production tuple, non-determinism, or unbounded regeneration |

## ADDED Requirements

### Requirement: Archive compatibility SHALL close over the production rule pair

The sole supported Archive v1 compatibility tuple SHALL include
`domainRulesVersion=domain-raw-v1` and
`castRulesVersion=cast-exact-v1` in addition to its existing pointer,
manifest, SQLite, application-id, and dataVersion-algorithm identity.
Language-neutral minimal/vectors and all derived bytes SHALL use that same
pair. An arbitrary syntactically valid token SHALL remain schema-valid input
but SHALL be compatibility-unsupported.

#### Scenario: Exact production pair is admitted
- **WHEN** pointer, manifest, SQLite, algorithm, schema digest, and the exact rule pair match the tuple
- **THEN** compatibility admission SHALL continue to dataVersion validation

#### Scenario: One rule version differs
- **WHEN** either rule token differs while all other fields remain valid
- **THEN** admission SHALL return `ARCHIVE_VERSION_UNSUPPORTED` before dataVersion or SQLite inspection
