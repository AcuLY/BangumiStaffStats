## Capability Boundary

- **Status:** Existing Archive manifest/schema capability preserved; only the production producer/consumer handoff changes from Python-plus-Go to one Go Backend artifact.
- **Owner:** Contracts remains the sole manifest, DDL, dataVersion, pointer, compatibility, and golden authority; Backend consumes it as both writer and reader.
- **Writable paths:** This delta spec and exact Contracts artifact metadata/tests declared by the change; accepted Archive schema/golden semantics remain unchanged unless an explicit parity correction is required.
- **Read-only protected inputs:** Existing schema versions, dataVersion algorithm/preimage, DDL/table/index semantics, compatibility tuple, accepted golden bytes, real Archives, public behavior, and unrelated paths.
- **Deletion complement:** Only Python-updater-specific runtime handoff assertions or packaged-input ownership records may be removed; no Archive schema, golden, vector, pointer contract, or validation outcome is deleted.
- **Mutable refs:** Local `codex/embed-go-archive-builder` only.
- **Consumes:** Existing manifest/dataVersion schemas, DDL, compatibility matrix, canonical/producer goldens, and the Go builder/consumer boundary.
- **Produces:** The same language-neutral manifest and SQLite contract with Backend recorded as the production producer.
- **Dependencies:** `backend-archive-builder`, `backend-archive-consumer`, `contracts-archive-goldens`, and Backend artifact compatibility changes.
- **Deliverables:** Updated cross-runtime ownership requirements and Go finalizer proof against existing vectors.
- **Acceptance:** Contract bytes/outcomes remain stable; the real Go builder and Go consumer pass their applicable indexed vectors without a Python production runtime.
- **Non-goals:** Schema/dataVersion/rule-version changes, weaker validation, a Backend-private contract copy, or removal of independent Contracts development tooling merely because it is written in Python/Node.
- **Operations deferred:** Runtime activation, real Archive production, release/deploy, and host mutation.
- **Stop/rollback conditions:** Stop on any manifest/dataVersion/schema/golden outcome drift or private duplicate authority; rollback is parent `411f54b`.

## ADDED Requirements

### Requirement: Go producer and consumer SHALL share one contract without duplicate production admission

The Backend-owned Go Archive builder SHALL be the only production writer and
the Backend Archive Store SHALL remain the only production reader. Both SHALL
consume the same Contracts-owned DDL, manifest/dataVersion semantics,
compatibility tuple, and indexed goldens. The builder SHALL complete the
necessary construction-time checks before inactive publication; the consumer
SHALL perform only the minimal contained immutable/read-only open, identity
read, and lightweight query required to use a selected candidate. Neither side
SHALL introduce a private schema, manifest model authority, second producer, or
standalone smoke executable.

#### Scenario: One Go artifact writes and reads an Archive
- **WHEN** the real Go builder produces a candidate and the real Go consumer opens it for activation
- **THEN** both boundaries SHALL agree on dataVersion, supported versions, DDL identity, and manifest/SQLite identity through the shared contract
- **AND** no Python production finalizer or separate Go smoke process SHALL participate

#### Scenario: A private contract or weakened reader is proposed
- **WHEN** Backend code redefines the Archive schema privately or skips the minimal identity/read boundary needed for safe use
- **THEN** Contracts and Backend acceptance SHALL fail before publication or activation

## MODIFIED Requirements

### Requirement: One authoritative Archive contract bundle
The repository SHALL define `contracts-archive-manifest` only through the root OpenSpec capability and the tracked artifacts under `contracts/schemas/archive/**` and `contracts/goldens/archive/**`. `schema.sql`, `archive-manifest.schema.json`, `current-pointer.schema.json`, `data-version-input.schema.json`, `fixture-index.schema.json`, and `compatibility-matrix.json` SHALL be the machine-readable authorities; the closed golden corpus SHALL be the language-neutral producer/consumer evidence. No Go package, Python/Node Contracts tool, frontend, nested OpenSpec, generated model, or embedded Backend resource copy SHALL become a second authority.

#### Scenario: The Backend writer and reader need the Archive shape
- **WHEN** `backend-archive-builder` and the Backend Archive consumer implement their real contract boundaries
- **THEN** both SHALL consume the same tracked schemas, DDL, compatibility matrix, and indexed goldens
- **AND** neither SHALL redefine the Archive contract in a private fixture, schema, or embedded semantic copy

#### Scenario: A nested contract control plane is proposed
- **WHEN** an apply task proposes another `openspec/`, generated OpenSpec skill set, or authoritative Archive schema below `backend/`, `updater/`, or `frontend/`
- **THEN** review SHALL reject it before apply

### Requirement: Manifest string evidence SHALL be closed and cross-language

`contracts/goldens/archive/vectors/manifest-string-semantics.json` SHALL be the
single language-neutral vector for the 25 string case ids plus one raw-byte
recipe fixed by the approved design. Each string case SHALL record its target
field, ASCII `jsonStringLiteral`, expected Unicode scalar length and UTF-8 byte
length or null for an invalid scalar sequence, and expected manifest-string
outcome. The raw-byte recipe SHALL start from the otherwise-valid minimal
manifest, retain the `archiveAssetUrl` JSON string delimiters, replace exactly
that string's payload with bytes `C3 28`, and expect
`MANIFEST_SCHEMA_INVALID` at fatal UTF-8 decode before JSON parsing.
`contracts/goldens/archive/index.json` SHALL index it exactly once as
a regular non-symlink vector with its exact digest. The accepted 32 indexed
paths and all prior golden bytes SHALL remain unchanged.

The Contracts verifier SHALL continue to consume the tracked vector through
strict Node manifest validation, one Python semantic probe, and one isolated Go
semantic probe as independent development evidence. Every language SHALL parse
the same `jsonStringLiteral`, reject isolated surrogates before replacement,
and recompute scalar/byte facts and expected outcome from the same tracked
bytes. The malformed-UTF-8 recipe SHALL be materialized as an ephemeral byte
mutation because malformed bytes cannot be stored directly in valid JSON; all
ephemeral output SHALL remain below the declared disposable root and be absent
at exit. No tooling implementation or runtime-private persistent copy SHALL
become authority, and Contracts' Python probe SHALL not create a production
Python dependency.

`backend-archive-builder` and the Backend Archive consumer SHALL remain blocked
from final acceptance until the real Go manifest finalizer/decoder executes
this exact indexed vector at both applicable runtime boundaries. The isolated
Contracts Go probe alone SHALL NOT count as Backend runtime adaptation.

#### Scenario: Closed vector is verified independently
- **WHEN** Node, Python, and isolated Go read the indexed vector after fatal UTF-8 decoding
- **THEN** all 25 string case ids, the raw-byte recipe, JSON string literals, recomputed scalar/byte facts, and `VALID` or `MANIFEST_SCHEMA_INVALID` outcomes SHALL match exactly
- **AND** the two documented emoji counterexamples SHALL prove that byte count never decides acceptance

#### Scenario: Vector inventory or expected result drifts
- **WHEN** the vector is missing, unindexed, duplicated, hash-drifted, symlinked, non-regular, gains or loses a case, or any independent implementation reports a different length/outcome
- **THEN** Contracts acceptance SHALL fail before downstream handoff
- **AND** the index SHALL NOT be regenerated to bless unexplained drift

#### Scenario: Go producer or consumer lacks runtime proof
- **WHEN** Contracts evidence passes but the real Go finalizer or consumer decoder has not executed the same indexed vector
- **THEN** the owning Backend block SHALL remain unaccepted
- **AND** Contracts tooling SHALL NOT claim the missing runtime implementation

## REMOVED Requirements

### Requirement: Python producer and Go consumer handoffs remain separate
**Reason:** The user selected one Backend-owned Go production writer and reader, so the Python-writer/Go-reader runtime split is obsolete.

**Migration:** `backend-archive-builder` becomes the writer while the shared Contracts artifacts remain authoritative; the real Go finalizer and consumer each prove their applicable contract boundary without a standalone smoke process.
