## Capability Boundary

| Field | Boundary |
|---|---|
| Status | Modified capability; implementation blocked until strict validation and main-agent review |
| Owner | Updater |
| Writable paths | Producer CLI/service, smoke-specific Updater tests/docs, this delta, lifecycle root spec |
| Read-only protected inputs | Acquisition, builder, manifest, contracts, schemas, goldens, existing Archives |
| Deletion complement | Remove only the Go smoke input/phase/outcomes and its tests |
| Mutable refs | Local topic branch only |
| Consumes | Existing Python contract, SQLite, identity, manifest and publication gates |
| Produces | Inactive Archive publication without a Go subprocess |
| Dependencies | Contracts -> Updater; API startup remains the Go consumer boundary |
| Deliverables | Smoke-free CLI/service plus tests and documentation |
| Acceptance | Frozen Updater quality gates, producer integration, residual-reference audit |
| Non-goals | Change Archive bytes, identity, publication atomicity, activation or schedule |
| Operations deferred | Live update rollout and host cleanup |
| Stop/rollback conditions | Stop on any lost producer gate, non-atomic publication or unrelated edit |

## MODIFIED Requirements

### Requirement: Identity, quality, and manifest SHALL be deterministic

The producer SHALL use the authoritative schema, compatibility tuple,
`bgmss-archive-data-version-v1`, and acyclic digest graph. Before manifest
creation it SHALL finish indexes and pass schema/object/index, foreign-key,
`integrity_check`, exact table/accounting/quality invariants, logical-row
digests, and read-only reopen. Same validated semantic inputs SHALL yield the
same dataVersion and logical rows regardless of generated time/run directory;
generated time, physical SQLite bytes, paths, and activation state MUST NOT
enter dataVersion.

Schema validation SHALL require both the corrected canonical `schema.sql`
digest and the actual 35-object `bgmss-sqlite-schema-objects-v1` seal from the
fresh database. A matching name set or copied digest claim SHALL NOT permit a
weakened or extra explicit object to reach manifest creation or inactive
publication.

The real Python manifest finalizer SHALL execute the exited string contract
before writing `manifest.json`: `generatedAt` SHALL be the exact
calendar-valid UTC `YYYY-MM-DDTHH:mm:ss[.1..6]Z` subset with year
`0001..9999`; each URL SHALL contain only Unicode scalar values and be bounded
inclusively at 12 through 2048 scalars, never encoded bytes; and surrogate code
points SHALL be rejected rather than normalized or replaced. Every indexed
`manifest-string-semantics.json` case, including the exact `C3 28` raw-byte
recipe, SHALL pass through this runtime finalizer boundary. The Contracts
isolated Python probe alone SHALL NOT satisfy producer acceptance.

#### Scenario: Identical semantics are regenerated
- **WHEN** the same source/common/schema/rules/catalog inputs are rebuilt in another staging root
- **THEN** dataVersion, accounting, counts, and canonical logical-row digests SHALL match

#### Scenario: Manifest strings cross the producer boundary
- **WHEN** the indexed valid and invalid timestamp, scalar-length, surrogate, and raw-byte cases are applied to the real finalizer
- **THEN** valid cases SHALL produce canonical manifest bytes
- **AND** every invalid case SHALL fail before inactive publication with no final candidate

### Requirement: Dependency and acceptance scope SHALL remain minimal

PyYAML `6.0.3` SHALL be the sole added runtime dependency and only safe-load
strictly bounded common YAML; all other producer work SHALL use the Python
standard library and existing `jsonschema`. Frozen install, exact dependency
and MIT-license inventory, wheel/import, unit/property/fault tests, full
updater quality gates, disposable complete-source producer validation, strict
OpenSpec/Git checks, and absence of `.cache/.tmp/.venv` SHALL gate acceptance.

#### Scenario: The development candidate is accepted
- **WHEN** all synthetic/offline gates and explicitly invoked disposable complete-source producer validation pass
- **THEN** only inactive producer capability SHALL be claimed
- **AND** scheduler, lock, `current.json`, activation, restart, push, release, deploy, and production readiness SHALL remain absent

## ADDED Requirements

### Requirement: Producer validation SHALL precede inactive atomic publication

After every producer-owned contract, configuration, acquisition, build,
schema/object/index, integrity, accounting, quality, digest, deterministic,
manifest, read-only-reopen, and cancellation gate passes, the producer SHALL
atomically rename the fixed `versions/<dataVersion>/{manifest.json,bangumi.sqlite}`
directory to the previously absent inactive output path. It SHALL not accept,
inspect, or invoke a Go executable. An existing independently valid same
version SHALL return stable no-change; any collision SHALL fail without
overwrite. The producer SHALL never read or write `current.json`.

Rename SHALL be the sole commit point after every fallible producer validation
and cancellation gate. No fallible gate SHALL run after it; cross-device copy,
replace, merge, or file-by-file fallback is forbidden. A pre-existing or raced
non-identical/invalid target SHALL be byte-preserved and rejected.

#### Scenario: Producer accepts the staged candidate
- **WHEN** every producer gate passes, cancellation is clear, the final path is absent, and same-filesystem rename succeeds
- **THEN** exactly the closed manifest/SQLite pair SHALL appear atomically as an inactive version with no pointer or activation claim

#### Scenario: Producer rejects or publication collides
- **WHEN** any producer gate fails, the final path is non-identical/invalid, rename fails, or cancellation arrives before completion
- **THEN** no new final candidate SHALL remain and every prior version SHALL be byte-preserved

## REMOVED Requirements

### Requirement: Go validation SHALL precede inactive atomic publication

**Reason:** The user removed the dedicated cross-language pre-publication smoke gate; producer validation remains authoritative for inactive publication and real API startup remains authoritative for Go admission.

**Migration:** Remove the CLI executable argument, subprocess phase, command binary, artifact member and operations mount together. Existing live deployments require a separately authorized breaking-boundary migration.
