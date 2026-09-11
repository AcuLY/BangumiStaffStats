## Capability Boundary

| Field | Boundary |
|---|---|
| Status | Modified release identity |
| Owner | Contracts |
| Writable paths | Backend identity consumers/evidence within declared paths, this delta and lifecycle root spec |
| Read-only protected inputs | Root VERSION, API releaseinfo, other component identities and compatibility contracts |
| Deletion complement | Remove only archive-smoke identity requirements |
| Mutable refs | Local topic branch only |
| Consumes | Existing API link-time identity and artifact evidence |
| Produces | Single Backend binary identity closure |
| Dependencies | Contracts -> Backend artifact |
| Deliverables | Coherent API-only identity requirement and tests |
| Acceptance | Artifact metadata/SBOM/component statement identity checks |
| Non-goals | Change application version or cross-component compatibility identity |
| Operations deferred | Release/deploy |
| Stop/rollback conditions | Stop on identity/evidence disagreement |

## MODIFIED Requirements

### Requirement: Backend binary and artifact identities SHALL agree

The distributable `bgmss-api` binary SHALL contain link-time `Version=v0.1.0`
and the exact 40-hex source revision. Source/development execution MAY use
`dev` and `unknown`. API observability build metadata, bundle metadata, OCI
version/revision labels, Backend component statement, and SPDX package
`versionInfo` SHALL agree with the binary identity. No second distributable
Backend command identity SHALL be required or emitted.

#### Scenario: Packaged binary is inspected
- **WHEN** the API binary and OCI image are read from a Backend artifact
- **THEN** binary inspection, labels, metadata, statement, and SPDX SHALL agree on version/revision

#### Scenario: Build flags or evidence disagree
- **WHEN** the API binary lacks identity or any label/metadata/evidence value differs
- **THEN** Backend artifact verification SHALL fail
