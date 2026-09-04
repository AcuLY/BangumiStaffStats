## ADDED Requirements

### Requirement: Generated-path safety SHALL accept canonical native syntax

Contracts generated-path guards SHALL accept non-empty native absolute path
syntax on the running host while enforcing the same repository/tmp containment,
canonical-realpath, symlink, non-directory, and traversal rules on Windows and
POSIX. A foreign ambiguous separator SHALL remain rejected.

#### Scenario: Windows artifact tooling uses path.join
- **WHEN** a Windows component supplies a generated path built with native
  `path.join()` below its declared temporary root
- **THEN** the guard SHALL admit it and continue through all existing safety checks

#### Scenario: A path attempts lexical or resolved escape
- **WHEN** either slash form carries a `..` segment, or resolution leaves the
  declared temporary root
- **THEN** the guard SHALL fail before creation, removal, or external writes

#### Scenario: A path crosses unsafe filesystem state
- **WHEN** an admitted native path crosses a symlink, non-directory, or
  non-canonical existing ancestor
- **THEN** the existing fail-closed rejection SHALL remain unchanged

### Requirement: Source executable-mode verification SHALL reflect host capabilities

Artifact source attestation SHALL always require exact HEAD and stage-0 index
mode equality and raw worktree blob equality. On hosts that expose POSIX execute
bits, it SHALL additionally compare worktree execute bits with HEAD. On Windows,
where worktree execute-bit mutation is not representable, it SHALL NOT invent a
`stat`-mode drift signal or require WSL.

#### Scenario: Git executable mode drifts on any host
- **WHEN** the stage-0 index mode differs from HEAD
- **THEN** source attestation SHALL fail before artifact output

#### Scenario: POSIX worktree executable mode drifts
- **WHEN** a POSIX worktree execute bit differs while HEAD/index remain equal
- **THEN** source attestation SHALL fail on the worktree mode comparison

#### Scenario: Windows worktree is attested
- **WHEN** HEAD/index modes agree and raw worktree bytes match on Windows
- **THEN** attestation SHALL accept the unmodified file without a synthetic
  POSIX execute-bit comparison
