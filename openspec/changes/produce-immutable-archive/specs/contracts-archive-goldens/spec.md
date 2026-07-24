## Capability Boundary

| Boundary | Declaration |
|---|---|
| Status | specified: approved; implemented: yes; verified: builder, 15-case closed corpus, shared verifier/codegen, raw-domain coverage, canonical 32-file seal, strict OpenSpec, residue, and main acceptance gates passed |
| Owner | Contracts owner writes and verifies; Updater is read-only consumer. |
| Writable paths | New `contracts/schemas/archive/producer-case.schema.json`, new `contracts/schemas/archive/producer-index.schema.json`, existing Archive `README.md`, `tooling/build_sqlite_fixtures.py`, `tooling/verify.mjs`, new `contracts/goldens/archive/producer/**`, and Contracts task markers. |
| Read-only protected inputs | Root `contracts/goldens/archive/index.json`, all 32 paths it indexes, every remaining Archive schema/golden, updater/backend code, root specs, and other changes/state. |
| Deletion complement | None. |
| Mutable refs | None. |
| Consumes | The corrected, string-hardened, raw-domain-preserving closed Archive contract and SQLite v1 authority. |
| Produces | Closed, indexed synthetic producer inputs and expected results. |
| Dependencies | Accepted `contracts-archive-manifest` after exited `correct-archive-subject-semantics`, `harden-archive-manifest-string-semantics`, and `correct-archive-raw-domain-semantics`; no runtime implementation dependency. |
| Deliverables | Producer case/index schemas, positive/accounting/failure cases, expected logical rows/counts/identity, one separately closed producer index, and canonical-corpus-preserving verifier/builder documentation. |
| Acceptance | The accepted root index and 32 canonical paths/bytes remain byte-identical; the producer subtree is separately schema-valid, hash-closed, semantically recomputed, and independently reviewed before updater apply. |
| Non-goals | Full downloaded Archive, schema changes, producer/backend implementation, activation or operations. |
| Operations deferred | Real acquisition, production data/root, scheduling, retention and deployment. |
| Stop/rollback conditions | Schema/meaning need or index drift stops this block; remove only its new candidate bytes. |

## ADDED Requirements

### Requirement: Contracts SHALL define producer cases before implementation

The Contracts owner SHALL first add strict, language-neutral cases under
`producer/**` for a complete seven-source valid build, identical regeneration,
identical duplicate, contract-permitted unresolved raw position,
malformed/unknown-field record, conflicting duplicate, missing required
reference, missing/extra source, and digest/size mismatch. Expected evidence
SHALL fix each exact input byte sequence and digest, exclusive accounting
result, canonical logical rows/counts, dataVersion inputs/result, stable
producer outcome, first failure, and whether a final candidate may exist. No
case may contain downloaded full-dump, secret, user, pointer, or `current.json`
data.

`producer-case.schema.json` and `producer-index.schema.json` SHALL be strict
JSON Schema 2020-12 documents with closed objects, bounded strings/arrays and
JSON-safe integers. `producer/index.json` SHALL list every other file below
`producer/` exactly once with relative path, SHA-256 and unique case id. The
shared verifier SHALL fatal-UTF-8 decode and schema-validate both schemas,
sub-index and cases, recompute the closed regular non-symlink inventory, every
digest, accounting equation, logical row/count projection, dataVersion preimage
and stable outcome, and reject any unexplained or internally contradictory
expected value.

The corrected root `contracts/goldens/archive/index.json` and all 32 canonical
paths and bytes it indexes SHALL remain byte-identical. The fixture builder
SHALL regenerate and compare that canonical corpus independently of
`producer/**`; the shared verifier SHALL validate the canonical and producer
closed inventories separately and reject any cross-index path. Neither the
producer schemas nor cases alter the Archive manifest, pointer, SQLite schema,
compatibility tuple, canonical fixture outcome, or accepted consumer behavior.
The protected root-index SHA-256 SHALL remain
`db3e9d2f81a90f8c7b36e9d6a0010bb35c54b4b0890d21ea4ecbe2f0b0979801`;
the SHA-256 of its `LC_ALL=C` sorted `<path><TAB><digest><LF>` table SHALL
remain `cd6c1609e94d86b665b1c053874266c48f09826fcb11c8691b1c6249c1d3927c`.

The positive and rejection cases SHALL cover all five registered source type
codes, all six integer cast roles, directed relation codes `2/3`, another
valid relation code outside the series predicate, and wrong-type/out-of-domain
values. Expected rows SHALL preserve raw numeric values and source direction;
no case may encode `main`, `support`, `guest`, `sequel`, or `prequel` as stored
Archive values.

#### Scenario: Contracts handoff precedes updater work
- **WHEN** both strict schemas, all case bytes, expected results, hashes, the closed producer sub-index, and the unchanged canonical 32-file seal pass independent Contracts review
- **THEN** the Updater owner MAY consume them read-only
- **AND** any needed schema/semantic change SHALL stop for a separate Contracts-authority amendment rather than be implemented privately

#### Scenario: A producer failure case is evaluated
- **WHEN** one declared record/source/digest invariant is violated
- **THEN** the case SHALL name one bounded first failure and assert that no final Archive candidate exists

#### Scenario: Canonical and producer inventories are confused
- **WHEN** a producer path enters the root index, a canonical path enters the producer sub-index, either inventory has an unindexed/missing/duplicate/hash-drifted/symlink/non-regular path, or any accepted canonical byte changes
- **THEN** Contracts acceptance SHALL fail before updater handoff
