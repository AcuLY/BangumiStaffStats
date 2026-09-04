## Capability Boundary

| Field | Boundary |
|---|---|
| Status | Modified artifact inventory |
| Owner | Backend |
| Writable paths | Backend build/Docker/test/docs paths, this delta and lifecycle root spec |
| Read-only protected inputs | API source, OCI runtime behavior, contracts and other artifacts |
| Deletion complement | Remove only archive-smoke executable/member/metadata/test expectations |
| Mutable refs | Local topic branch only |
| Consumes | Existing deterministic API build and schema-v2 metadata |
| Produces | One-executable Backend bundle plus unchanged API OCI artifact |
| Dependencies | Backend source -> artifact; Operations consumes accepted artifact |
| Deliverables | Updated builder/verifier/SBOM/component evidence and tests |
| Acceptance | Build unit/shell/full Backend/artifact checks and two-build determinism where environment permits |
| Non-goals | Change API binary/runtime image behavior or artifact schema field meaning |
| Operations deferred | Release and deployment |
| Stop/rollback conditions | Stop on extra/missing executable, evidence drift or reproducibility regression |

## MODIFIED Requirements

### Requirement: Backend builds SHALL be deterministic and content-addressed

For one clean candidate source identity, target OS/architecture, Go 1.26.5
toolchain, locked modules, and declared normalized build inputs, Backend SHALL
produce a byte-identical API binary bundle and local OCI image archive across
two isolated builds. The binary bundle SHALL contain one normalized same-target
`bgmss-api` executable plus canonical build metadata. Build paths, timestamps,
UID/GID, modes, archive order, compression headers, and Go link metadata SHALL
be normalized. Final local output SHALL be content-addressed and SHALL never be
overwritten with different bytes. The acceptance-capable build entrypoint
SHALL derive revision/tree/epoch from the canonical checkout it actually
builds, SHALL require a clean matching index, tracked worktree, and untracked
non-ignored set, and SHALL reject caller identity overrides that do not exactly
restate that derived candidate before writing output. Clean verification SHALL
compare raw worktree bytes and executable modes with every stage-zero Git
tree/index entry and reject content-hiding state.

#### Scenario: Implementation is still dirty
- **WHEN** Backend build-control source differs from the attested candidate commit
- **THEN** pure/synthetic tests may validate the implementation, but no clean-attested artifact or reproducibility claim is emitted

#### Scenario: Backend is rebuilt from identical inputs
- **WHEN** two builds run with fresh caches/output roots and the same source, target platform, pinned toolchain/base images, and normalized inputs
- **THEN** the one-executable bundle, OCI bytes, checksum inventory, SPDX SBOM, component statement, and inner executable evidence are byte-identical

#### Scenario: An existing content address has different bytes
- **WHEN** publication would replace an existing local content-addressed directory with non-identical content
- **THEN** the build fails without modifying the existing artifact

#### Scenario: Backend source differs from its declared candidate
- **WHEN** candidate identity, tracked bytes/modes, or declared inputs disagree
- **THEN** the build fails before copying source or creating an artifact

### Requirement: The Backend runtime image SHALL be minimal and immutable

The runtime image SHALL contain `bgmss-api` and only required runtime
trust/data files. It SHALL not contain any second Backend executable, source,
module cache, compiler, or build tool. It SHALL remain non-root, immutable, and
accept Archive/status inputs only through explicit read-only mounts/arguments.
Numeric user parsing SHALL reject UID zero in canonical or leading-zero form,
with or without a group field.

#### Scenario: The local runtime image is inspected
- **WHEN** image metadata and filesystem are checked after a local `push=false` build
- **THEN** the API SHALL be the only Backend executable in both the runtime image and distributable binary bundle

#### Scenario: A root UID uses a non-canonical spelling
- **WHEN** the runtime config user is `00`, `000:123`, or another numeric encoding of UID zero
- **THEN** artifact verification rejects the image before it can be accepted

## ADDED Requirements

### Requirement: Backend binary bundle SHALL contain only the API executable

The normalized Backend bundle SHALL contain exactly `bin/bgmss-api` and
`metadata/build.json` below their required directories. The API SHALL be a
regular non-symlink file built for the statement target with `CGO_ENABLED=0`,
deterministic Go flags, and executable mode `0555`. `metadata/build.json`
SHALL retain schema version 2 and bind one closed role/path/size/SHA-256 record.
Verification SHALL reject an unsafe, missing, extra, duplicate,
non-executable, wrong-target, or digest-mismatched member. Outer checksum,
SBOM, and component evidence SHALL bind the complete bundle bytes.

#### Scenario: The API bundle is consumed
- **WHEN** the accepted bundle is verified and `bin/bgmss-api` is extracted through the declared member
- **THEN** its size and digest SHALL match canonical bundle metadata
- **AND** no second Backend command, source, or build tool SHALL be present

#### Scenario: Inner bundle content drifts
- **WHEN** the executable/member/mode/role/path/size/digest differs or an extra member appears
- **THEN** verification SHALL fail before the bundle can be accepted

## REMOVED Requirements

### Requirement: Backend binary bundle SHALL expose exact producer gates

**Reason:** The producer no longer executes a Backend validation command and the distributable artifact no longer needs a second binary.

**Migration:** Keep schema v2, replace the closed two-entry executable inventory with one `bgmss-api` entry, and update every artifact/operations consumer atomically.
