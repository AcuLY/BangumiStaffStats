## Capability Boundary

| Field | Declaration |
|---|---|
| Status | Modified by `backend-embed-go-archive-builder`; the closed input authority is preserved while its runtime consumer changes. |
| Owner | Contracts owns the canonical manifest/verifier; Backend artifact owns consumption and embedding. |
| Writable paths | This delta spec and exact producer-runtime manifest/schema/verifier/component-binding files declared by the change. |
| Read-only protected inputs | Archive/catalog schema and golden bytes outside an explicitly regenerated manifest, product/query semantics, frontend, real Archive data, hosts, production, remotes, and archived OpenSpec. |
| Deletion complement | Updater-only consumer bindings and fixtures after the Backend binding passes; the 42-file authority is retained. |
| Mutable refs | Local `codex/embed-go-archive-builder` only. |
| Consumes | The existing canonical 42-file producer-runtime manifest, governed catalog pair, and clean Backend source identity. |
| Produces | One exact Backend component input binding and embedded builder input set. |
| Dependencies | `backend-build-artifact`, `contracts-artifact-compatibility`, and `backend-archive-builder`. |
| Deliverables | Backend statement/schema validation, exact embedded-byte checks, and removal of Updater consumer references. |
| Acceptance | Backend evidence contains one exact manifest binding; embedded Contracts bytes match all 42 records; absent/extra/regenerated/drifted input fails. |
| Non-goals | Expanding or redefining the input closure, changing Archive/catalog semantics, or creating a second manifest. |
| Operations deferred | Release/deployment, real acquisition, and host mutation. |
| Stop/rollback conditions | Stop on manifest/source disagreement or any need to reinterpret an admitted contract; roll back owned local changes only. |

## ADDED Requirements

### Requirement: Backend artifact SHALL consume rather than redefine this authority

The Backend artifact that embeds Archive-builder Contracts SHALL copy or
compile exactly the records and bytes admitted by the canonical manifest from
its attested source identity. Its component statement SHALL contain exactly
one logical `contracts/producer-runtime-inputs-v1` input whose SHA-256 is the
exact canonical manifest digest. It SHALL also bind the governed display and
staff-set catalog inputs required by the Go builder and SHALL NOT add, drop,
regenerate, or independently reinterpret a Contracts runtime path.

#### Scenario: Backend packages the accepted closure
- **WHEN** the Backend artifact source identity, producer-runtime manifest, and governed catalog digests agree
- **THEN** the built `bgmss-api` and its evidence bind exactly the admitted Contracts closure and catalog pair
- **AND** no external runtime mount is required for those immutable inputs

#### Scenario: Backend attempts a partial or broadened copy
- **WHEN** an admitted input is missing, extra, regenerated, substituted from a dirty path, or differs in bytes or digest
- **THEN** Backend artifact verification fails before compatibility or deployment assembly

## REMOVED Requirements

### Requirement: Updater packaging SHALL consume rather than redefine this authority

**Reason**: The separate Updater artifact and component statement are retired.

**Migration**: Use `Backend artifact SHALL consume rather than redefine this authority`; preserve the existing canonical manifest and verification rules unchanged.
