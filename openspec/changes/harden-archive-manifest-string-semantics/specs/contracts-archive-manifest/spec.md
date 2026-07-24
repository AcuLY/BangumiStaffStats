## Capability Boundary

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; planning strict validation: passed; main-agent review: passed; implemented/runtime-verified/committed/pushed/released/deployed: no |
| Owner | Contracts owner applies only the declared schema/docs/tool/vector paths; main agent reviews dependency ordering and acceptance; runtime owners adapt later. |
| Writable paths | Planning: this change directory. Apply: exact persistent/disposable paths in `proposal.md`; no root spec, runtime, or other active-change path. |
| Read-only protected inputs | Higher authorities, root specs, archived/completed/other active changes, accepted baseline goldens, all other Contracts paths, all runtime code/tests, refs/remotes, external systems, hosts, and production. |
| Deletion complement | Preserve accepted baseline paths/bytes; remove only validated disposable roots and, after a failed unpublished apply, the new vector candidate. |
| Mutable refs | None. |
| Consumes | Accepted/exited subject correction, authoritative manifest schema/tooling, corrected 31-file corpus, and read-only implementation divergence evidence. |
| Produces | Exact timestamp and Unicode-scalar URL semantics, one indexed vector, stable cross-language outcomes, and downstream acceptance prerequisites. |
| Dependencies | Accepted Archive contract plus completed `correct-archive-subject-semantics`; consumer and producer final acceptance depend on this hardening exiting. |
| Deliverables | Schema/docs/tooling/vector/index evidence and master dependency record only. |
| Acceptance | Exact 32-path closed index, unchanged prior 31 golden bytes, all 25 string cases plus one raw-byte recipe agreeing in Node/Python/Go, deterministic and strict gates, no residue. |
| Non-goals | Runtime implementation, new dependency/version, origin/normalization policy, UI/query/statistics, nested OpenSpec, or operations. |
| Operations deferred | Acquisition, current pointer, production paths/data, activation, migration, scheduling, locking, retention, restart, release, deployment, hosts, and secrets. |
| Stop/rollback conditions | Stop on correction/baseline/dependency/owner/path or verification drift; revert only owned unstaged candidate bytes and validated disposable/new-vector paths, never protected or external state. |

## ADDED Requirements

### Requirement: Manifest generated time SHALL be exact UTC and calendar-valid

`generatedAt` SHALL be ASCII
`YYYY-MM-DDTHH:mm:ssZ` or
`YYYY-MM-DDTHH:mm:ss.<fraction>Z`, where fraction contains exactly 1 through 6
digits. Year SHALL be `0001..9999`; month SHALL be `01..12`; day SHALL exist in
that Gregorian month under the standard divisible-by-4/100/400 leap rule, so
1900 is not leap and 2000 is leap; hour SHALL be `00..23`; minute and second
SHALL be `00..59`. Hour 24, minute 60, leap second 60,
normalization/rollover, an offset, lowercase `z`, whitespace, a missing
fraction, or more than six fractional digits SHALL NOT be accepted.

After fatal UTF-8 decode and strict JSON parsing, any lexical or semantic
timestamp failure SHALL produce `MANIFEST_SCHEMA_INVALID` at the manifest
schema/string stage. Source accounting, compatibility, dataVersion, path,
digest, and SQLite checks SHALL NOT run for that manifest.

#### Scenario: Canonical leap-day UTC time is supplied
- **WHEN** `generatedAt` uses year 2000 or 2024 on February 29 and has no fraction, `.1`, or `.123456` before `Z`
- **THEN** manifest-string validation SHALL accept the timestamp
- **AND** no timezone conversion, precision expansion, or normalization SHALL occur

#### Scenario: Shape matches but calendar and time are impossible
- **WHEN** `generatedAt` is `2024-13-99T25:61:61Z`, a February 29 in 1900, year `0000`, hour `24`, minute `60`, or second `60`
- **THEN** validation SHALL return `MANIFEST_SCHEMA_INVALID`
- **AND** no source-accounting or later validation stage SHALL run

#### Scenario: UTC spelling or fractional precision drifts
- **WHEN** a timestamp uses an offset, lowercase `z`, empty fractional part representing zero digits, seven fractional digits, trailing data, or surrounding whitespace
- **THEN** validation SHALL return `MANIFEST_SCHEMA_INVALID` without normalization

### Requirement: Manifest URL bounds SHALL validate and count Unicode scalar values

`archiveAssetUrl` and `commonSubjectStaffsUrl` SHALL first be decoded from fatal
UTF-8 and strict JSON strings containing only Unicode scalar values. A legal
JSON high/low surrogate pair SHALL decode to one scalar value; an isolated
high or low surrogate escape SHALL produce `MANIFEST_SCHEMA_INVALID` before
length evaluation. Go validation SHALL inspect raw JSON string escapes before
`encoding/json` can replace an isolated surrogate with U+FFFD.

Both schema properties SHALL retain their current pattern and length keywords
and SHALL declare the named format `bgmss-unicode-scalar-url-v1`. The strict
Contracts validator SHALL register and assert that format before schema
compilation; URL scalar validation MUST NOT exist only as an unbound
post-schema helper.

Validated URL text SHALL be bounded inclusively at 12 through 2048 Unicode
scalar values. UTF-8 byte count, UTF-16 code-unit count, and unvalidated
surrogate-unit count SHALL NOT decide these field bounds. The existing
exact `https://` prefix, NUL/CR/LF exclusions, and
`commonSubjectStaffsUrl` terminal `/subject_staffs.yml` rule SHALL remain in
force; this requirement SHALL NOT parse, normalize, resolve, or broaden URL
origin policy.

A raw encoding failure, fewer than 12 or more than 2048 scalar values, or another
retained shape failure SHALL return `MANIFEST_SCHEMA_INVALID` before source
accounting or any later stage.

#### Scenario: Multibyte URL is bytes-long but scalar-short
- **WHEN** `archiveAssetUrl` is `https://😀`, containing 9 scalar values and 12 UTF-8 bytes
- **THEN** validation SHALL return `MANIFEST_SCHEMA_INVALID` because the scalar length is below 12

#### Scenario: Multibyte URL is exactly the scalar maximum
- **WHEN** `archiveAssetUrl` is `https://` plus 2039 `a` characters plus `😀`, containing 2048 scalar values and 2051 UTF-8 bytes
- **THEN** manifest-string validation SHALL accept the URL
- **AND** no hidden 2048-byte or UTF-16-code-unit field cap SHALL reject it

#### Scenario: Either URL exceeds the scalar maximum
- **WHEN** an otherwise valid Archive or common URL contains 2049 scalar values
- **THEN** validation SHALL return `MANIFEST_SCHEMA_INVALID`

#### Scenario: JSON surrogate escapes are decoded strictly
- **WHEN** a URL contains one legal `\uD83D\uDE00` pair, an isolated `\uD800`, or an isolated `\uDC00`
- **THEN** the legal pair SHALL decode and count as one scalar value
- **AND** each isolated surrogate SHALL return `MANIFEST_SCHEMA_INVALID` without U+FFFD replacement

#### Scenario: Manifest bytes are not valid UTF-8
- **WHEN** malformed UTF-8 occurs in either URL's file-backed JSON bytes
- **THEN** fatal decoding SHALL fail before JSON parsing and string-length evaluation
- **AND** replacement with U+FFFD SHALL NOT create an accepted value

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
a regular non-symlink vector with its exact digest. Starting from the accepted
31-file corrected corpus, this change SHALL produce exactly 32 indexed files;
all prior 31 golden paths and bytes SHALL remain unchanged.

The Contracts verifier SHALL consume the tracked vector through strict Node
manifest validation, one Python semantic probe, and one isolated Go semantic
probe. Every language SHALL parse the same `jsonStringLiteral`, reject isolated
surrogates before replacement, and recompute scalar/byte facts and expected
outcome from the same tracked bytes. The malformed-UTF-8 recipe SHALL be
materialized as an ephemeral byte mutation because malformed bytes cannot be
stored directly in valid JSON; all ephemeral output SHALL remain below the
declared disposable root and be absent at exit. No runtime-private persistent
copy SHALL become authority.

`implement-backend-archive-consumer` and `produce-immutable-archive` SHALL
remain blocked from final acceptance until their owning changes execute this
exact indexed vector through the real Go manifest decoder and Python manifest
finalizer respectively. The isolated Contracts Go probe SHALL NOT count as
backend runtime adaptation.

#### Scenario: Closed vector is verified in three languages
- **WHEN** Node, Python, and isolated Go read the indexed vector after fatal UTF-8 decoding
- **THEN** all 25 string case ids, the raw-byte recipe, JSON string literals, recomputed scalar/byte facts, and `VALID` or `MANIFEST_SCHEMA_INVALID` outcomes SHALL match exactly
- **AND** the two documented emoji counterexamples SHALL prove that byte count never decides acceptance

#### Scenario: Vector inventory or expected result drifts
- **WHEN** the vector is missing, unindexed, duplicated, hash-drifted, symlinked, non-regular, gains or loses a case, or any language reports a different length/outcome
- **THEN** Contracts acceptance SHALL fail before downstream handoff
- **AND** the index SHALL NOT be regenerated to bless unexplained drift

#### Scenario: Consumer or producer lacks runtime proof
- **WHEN** Contracts evidence passes but the Go consumer or Python producer has not executed the same indexed vector through its real contract boundary
- **THEN** that runtime change SHALL remain unaccepted
- **AND** this Contracts change SHALL NOT claim the missing runtime implementation

### Requirement: Pre-production hardening SHALL preserve version and dependency safety

This hardening SHALL apply only after `correct-archive-subject-semantics` is
accepted/exited and only while no formal Archive manifest v1 has been produced,
published, activated, released, or deployed. Under that precondition it SHALL
retain manifest/SQLite schema version 1, the dataVersion algorithm, existing
valid bundle bytes, and all product behavior while inserting this change
directly before consumer and producer final acceptance. Query-result work
SHALL receive the rule transitively through the consumer.

#### Scenario: Accepted pre-production baseline is present
- **WHEN** the completed correction has exited, the exact corrected 31-file baseline is sealed, and no formal/public v1 exists
- **THEN** this hardening MAY add only the declared string contract evidence without a version bump
- **AND** consumer and producer final acceptance SHALL wait for this change to exit

#### Scenario: Formal v1 or baseline drift is discovered
- **WHEN** preflight finds a formal/public/activated/released/deployed v1, correction state mismatch, protected-byte drift, or an overlapping runtime owner
- **THEN** apply SHALL stop before mutation
- **AND** a versioned or separately reconciled proposal SHALL be required rather than rewriting accepted evidence
