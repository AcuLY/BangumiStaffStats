# contracts-producer-runtime-inputs Specification

## Purpose
TBD - created by archiving change contracts-define-producer-runtime-input-manifest. Update Purpose after archive.
## Requirements
### Requirement: Producer runtime Contracts SHALL have one closed manifest

Contracts SHALL publish one canonical
`contracts/artifacts/producer-runtime-inputs-v1.json` authority containing
exactly 42 unique, bytewise-sorted records: the Archive index, all 32 and only
its declared files, the six accepted Archive runtime inputs, and the three
accepted Catalog schemas. Each record SHALL contain only normalized repository
relative POSIX `path`, nonnegative safe-integer `size`, and lowercase
`sha256:` digest. The document SHALL bind exact `fileCount`, `totalSize`, and a
canonical `fileSetDigest`; unknown fields and noncanonical bytes SHALL fail.

#### Scenario: The current producer closure is verified
- **WHEN** the manifest is validated against the accepted Contracts authority
- **THEN** exactly 42 records, every source byte/size/digest, the total, and file-set digest agree
- **AND** no unrelated Contracts file enters the closure

#### Scenario: The Archive fixture index evolves
- **WHEN** an indexed path/digest is added, removed, renamed, or changed without the reviewed manifest update
- **THEN** verification fails before any runtime package is accepted

#### Scenario: An undeclared runtime file is proposed
- **WHEN** a manifest record is outside the exact derivation or duplicates/reorders another record
- **THEN** validation rejects the manifest

### Requirement: Runtime input verification SHALL be path- and type-safe

The validator SHALL resolve every path under one explicit canonical repository
root without following symlinks. Every parent SHALL be a real directory and
every leaf a tracked regular Git `100644` file. Absolute, empty, dot, parent,
backslash, NUL, non-ASCII, duplicate, symlink, hard escape, special-file, and
mode-drift inputs SHALL fail. It SHALL compare actual bytes against both the
manifest and, for indexed files, the Archive index.

#### Scenario: A source leaf changes type or bytes
- **WHEN** a selected leaf becomes a symlink/special file, changes mode, size, or digest, or escapes its root
- **THEN** verification fails without reading outside the root or writing any source

#### Scenario: Verification succeeds
- **WHEN** all exact paths/types/modes/bytes and canonical declarations agree
- **THEN** the CLI emits only the bounded manifest digest, file count, and total size
- **AND** leaves no generated file or process

### Requirement: Updater packaging SHALL consume rather than redefine this authority

An Updater artifact that embeds producer Contracts SHALL copy exactly the
records and bytes admitted by this manifest from its attested source identity.
Its component statement SHALL contain exactly one logical
`contracts/producer-runtime-inputs-v1` input whose SHA-256 is the exact
canonical manifest digest. It SHALL not add, drop, regenerate, or independently
reinterpret a Contracts runtime path.

#### Scenario: Updater packages the accepted closure
- **WHEN** the Updater artifact source identity and manifest digest agree with this authority
- **THEN** its embedded Contracts subtree contains exactly these 42 files with identical bytes

#### Scenario: Updater attempts a partial or broadened copy
- **WHEN** an embedded Contracts file is missing, extra, regenerated, or differs
- **THEN** artifact verification fails before release assembly
