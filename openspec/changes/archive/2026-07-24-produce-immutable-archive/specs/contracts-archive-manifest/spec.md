## Capability Boundary

| Boundary | Declaration |
|---|---|
| Status | Existing accepted Archive contract amendment implemented and main-accepted; canonical consumer fixtures and producer-only evidence are separately closed and verified. |
| Owner | Contracts owner applies the bounded tooling/evidence amendment; existing producer and consumer runtimes remain separate owners. |
| Writable paths | Exact Contracts paths declared by `proposal.md`; no accepted runtime schema, compatibility tuple, canonical fixture, or consumer path. |
| Read-only protected inputs | Root fixture index, its 32 canonical paths/bytes, remaining Archive authority, accepted consumer, updater runtime, and all external state. |
| Consumes | Accepted corrected, string-hardened, raw-domain-preserving `contracts-archive-manifest`. |
| Produces | One separately closed producer evidence subtree without changing canonical consumer evidence. |
| Dependencies | Accepted/exited Archive contract corrections and accepted Archive consumer. |
| Non-goals | Archive schema/version change, runtime implementation, activation, operations, or consumer-test reinterpretation. |
| Stop/rollback conditions | Any canonical byte/index drift, cross-index ambiguity, or need to change runtime meaning stops apply. |

## MODIFIED Requirements

### Requirement: Golden corpus is closed and language neutral

`contracts/goldens/archive/index.json` SHALL list every canonical consumer
golden outside `producer/**` exactly once with relative path, SHA-256, case id,
validation stage, and expected stable outcome. It and all 32 accepted paths and
bytes it indexes SHALL remain byte-identical. Verification SHALL reject an
unindexed, missing, duplicate, hash-drifted, symlink, or non-regular canonical
golden.

The canonical corpus SHALL retain one tiny internally consistent valid Archive
and the exact accepted invalid JSON/bundle/vector inventory. It SHALL cover
strict unknown fields/digests/path forms, `MANIFEST_ACCOUNTING_INVALID`,
`DATA_VERSION_MISMATCH`, `SQLITE_DIGEST_MISMATCH`, `SQLITE_FORMAT_INVALID`,
`ARCHIVE_VERSION_UNSUPPORTED`, `SQLITE_DATA_VERSION_MISMATCH`,
`SQLITE_REQUIRED_OBJECT_MISSING`, and `SQLITE_TABLE_COUNT_MISMATCH`. The
count-mismatch bundle SHALL keep every earlier gate valid and change exactly
one manifest count so its first failure is the final table-count gate.

Producer-only language-neutral evidence MAY exist only below `producer/**`.
It SHALL use its own strict schemas and `producer/index.json`; that sub-index
SHALL list every other producer file exactly once with relative path, SHA-256
and unique case id. Shared Contracts tooling SHALL validate the canonical root
index and producer sub-index as two disjoint closed inventories, reject any
cross-index path, and report both counts separately. A producer vector SHALL
never be dispatched as a consumer manifest/pointer/bundle case or change the
accepted consumer corpus outcome.

Neither corpus SHALL contain downloaded full Archive data, a real user
collection, token, secret, or production pointer.

#### Scenario: Closed corpus is verified
- **WHEN** the verifier walks canonical paths below `contracts/goldens/archive/**`
- **THEN** their path set SHALL equal the unchanged root-index path set exactly
- **AND** every canonical case SHALL produce its indexed outcome in the fixed precedence

#### Scenario: Closed producer corpus is verified
- **WHEN** the verifier walks `contracts/goldens/archive/producer/**`
- **THEN** every non-index file SHALL appear exactly once in the producer sub-index and pass its strict schema, digest, and semantic recomputation
- **AND** no producer path SHALL appear in the canonical root index or be executed as a consumer fixture

#### Scenario: Corrupt bytes still match their manifest digest
- **WHEN** the canonical corrupt-SQLite case has a manifest whose SQLite digest matches the deliberately corrupt bytes
- **THEN** validation SHALL pass the digest gate and fail specifically as `SQLITE_FORMAT_INVALID`

#### Scenario: Fixture bytes drift
- **WHEN** a canonical or producer golden is added, removed, replaced, symlinked, cross-indexed, or changed without its owning exact index and expected result
- **THEN** contract verification SHALL fail before candidate acceptance
- **AND** canonical fixture regeneration SHALL NOT rewrite or bless producer evidence
