# updater-packaged-producer-inputs Specification

## Purpose
Define native and OCI Updater artifacts that embed the exact attested Contracts and Catalog producer-input authority as immutable self-describing files and prove it with finite non-root, read-only, networkless smoke.
## Requirements
### Requirement: Updater artifacts SHALL embed the exact producer input authority

The Updater native runtime bundle and OCI image SHALL embed exactly the 42
Contracts files admitted by the accepted producer-runtime manifest plus exactly
the two governed Catalog YAML files. The build SHALL select bytes and Git modes
from its attested candidate, never an ignored/dirty live path, and SHALL reject
manifest/source disagreement before creating artifact output. Embedded
Contracts paths SHALL preserve the layout required by `contract-check`; the
Catalog files SHALL remain exact siblings.

#### Scenario: A clean candidate is packaged
- **WHEN** the attested manifest, 42 Contracts blobs, and catalog pair all agree
- **THEN** native and OCI producer subtrees contain identical logical bytes at their fixed paths
- **AND** no other repository file is embedded

#### Scenario: Authority or source bytes drift
- **WHEN** a record/blob/path/mode/digest/count/order differs or a live file is substituted
- **THEN** build fails before bundle/image publication

### Requirement: Packaged producer inputs SHALL be immutable and self-describing

Every embedded file SHALL be a regular non-symlink read-only file below a
non-writable fixed producer root. Native producer members SHALL use modes
`0444`/`0555` and deterministic archive ownership `0:0`; OCI producer members
SHALL use modes `0444`/`0555` and ownership `65532:65532`. The OCI root's
nearest ancestor `/opt/bgmss` SHALL not grant runtime UID/GID `65532` write
permission; the built image and verifier SHALL therefore prevent both mutation
inside the producer root and rename/removal/replacement of that root through
its parent.

Canonical producer-input metadata SHALL be the exact closed schema version 1
document defined by this change: fixed native/OCI roots, Contracts
manifest/file-set/count/total, the ordered two catalog byte records and
canonical config digest, and the accepted common commit. The common commit
SHALL come only from the admitted
`contracts/goldens/archive/vectors/data-version.json` `input.commonCommit`;
the fixture vector's catalog digest is not the packaged catalog digest.
Native metadata, outer build metadata v2, the three exact
`org.bangumi-staff-stats.*` OCI labels, and the Updater component statement
SHALL agree; the statement SHALL include
`contracts/producer-runtime-inputs-v1`.

#### Scenario: Artifact evidence is inspected offline
- **WHEN** the native bundle, OCI rootfs/config, build metadata, and component statement are verified
- **THEN** every producer input identity and fixed path agrees without reading product source

#### Scenario: One copy or evidence record differs
- **WHEN** native/OCI bytes, modes, paths, labels, metadata, or statement input disagree
- **THEN** verification fails before compatibility or release assembly

#### Scenario: A writable ancestor could replace the fixed root
- **WHEN** `/opt/bgmss/producer` is read-only but `/opt/bgmss` grants write permission to runtime UID/GID `65532`
- **THEN** artifact verification fails before publication
- **AND** no runtime artifact may rely only on the child root mode for immutability

### Requirement: Embedded producer inputs SHALL pass finite networkless smoke

The accepted Updater image SHALL run `contract-check` against its embedded
Contracts root and load the embedded catalog pair through the built package
against those schemas. Both commands SHALL run non-root, read-only, source-free,
and networkless and SHALL reproduce the metadata identities. Smoke SHALL not
mount repository Contracts/config, run `produce`, acquire source data, write an
Archive/status/pointer, schedule, activate, or leave a process/container/file.
All smoke containers SHALL be labeled with a unique per-run owner and cleanup
SHALL refuse to remove a container whose current label does not match.

#### Scenario: Embedded runtime inputs are complete
- **WHEN** smoke runs with only the accepted image and empty disposable writable state
- **THEN** contract-check and catalog digest validation pass from embedded bytes
- **AND** the container exits without input mutation or residue

#### Scenario: Runtime falls back to external state
- **WHEN** a check requires a source/config mount, network, product checkout, writable input, or actual producer execution
- **THEN** smoke fails and no artifact is accepted
