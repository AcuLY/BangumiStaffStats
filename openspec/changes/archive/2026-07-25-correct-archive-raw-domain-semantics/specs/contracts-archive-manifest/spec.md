## Capability Boundary

| Boundary | Declaration |
|---|---|
| Status | specified correction; implementation and verification pending |
| Owner | Contracts correction owner; main agent accepts and controls producer isolation/recovery |
| Writable paths | Exact Contracts, canonical 32-file corpus, change, root-spec, and dated archive paths declared by the proposal |
| Read-only protected inputs | Isolated producer candidate, updater, catalog change, guides/decisions, other contracts/specs/code, external state, and production |
| Deletion complement | Only the exact active-to-archive OpenSpec move; no product deletion and no canonical path-set change |
| Mutable refs | One named recovery stash and one accepted local correction commit, each under its separately assigned owner |
| Consumes | Accepted Archive v1 authority/corpus plus `DR-DATA-CAST-002`, `DR-DATA-SERIES-002`, and locked local dump evidence |
| Produces | Corrected unpublished SQLite v1 authority and regenerated canonical identities |
| Dependencies | Strict-valid reviewed change, no formal v1, quiescent owners, and verified producer isolation |
| Deliverables | DDL/matrix/tooling/corpus correction, exact identity inventory, synchronized root spec |
| Acceptance | Numeric round trips, five-type mapping, deterministic 32-path regeneration, schema/object/digest gates |
| Non-goals | Product/query changes, producer implementation, inferred relations/cast, activation, or dual-v1 support |
| Operations deferred | Acquisition, scheduling, activation, rollback operations, release, deploy, and production |
| Stop/rollback conditions | Stop on published v1, authority drift, path-set drift, overlap, or unrecoverable producer snapshot; preserve prior commit/stash |

## ADDED Requirements

### Requirement: Raw Archive domain codes SHALL remain lossless

The authoritative SQLite v1 SHALL store
`cast_credit.role_type` as an `INTEGER` in the exact upstream range `1..6`.
It SHALL store `subject_relation.relation_type` as the exact positive
JSON-safe upstream integer and SHALL preserve the source direction
`subject_id -> related_subject_id`. Neither producer nor contract tooling
SHALL translate either value to a text label, collapse two values, invert an
edge, or discard a valid code.

The source adapter SHALL map subject types only and totally as `1=book`,
`2=anime`, `3=music`, `4=game`, and `6=real`. Any other subject type, cast role
outside `1..6`, non-positive/unsafe relation code, or wrong JSON value type
SHALL fail the source semantic gate before a candidate is admitted.

Series membership remains a downstream predicate over raw relation facts:
under `DR-DATA-SERIES-002`, codes `2/3/4/5/6/9/10/11/12` are eligible for the
same-type undirected closure while other valid relation rows remain stored
without becoming series edges. `cast:{type}:main` selects raw role `1`; the
same type's `all` predicate includes every eligible exact role `1..6`.

#### Scenario: Complete raw domains round-trip

- **WHEN** contract evidence contains all five subject codes, all six cast
  roles, both directed codes `2` and `3`, and every distinct positive relation
  code in the locked local evidence
- **THEN** SQLite SHALL return the same integer values and source/related
  identities exactly
- **AND** no stored cast or relation value SHALL be a derived text label

#### Scenario: Main and all remain query predicates

- **WHEN** eligible exact cast rows contain role `1` and any roles `2..6`
- **THEN** main SHALL select only role `1`
- **AND** all SHALL contain every eligible exact row including role `1`

#### Scenario: A raw code is malformed or unsupported

- **WHEN** a subject type is outside `1/2/3/4/6`, a cast role is outside
  `1..6`, or a relation code is non-integral, non-positive, or outside the
  JSON-safe range
- **THEN** producer validation SHALL fail before SQLite finalization
- **AND** it SHALL NOT guess, stringify, clamp, invert, or silently omit it

### Requirement: Pre-first-snapshot correction SHALL replace every draft identity

This correction SHALL retain manifest schema version 1, SQLite schema version
1, and `bgmss-archive-data-version-v1` only after proving that no formal
Archive v1 was produced, published, activated, released, or deployed. The
changed canonical SQL SHALL propagate through the schema SQL digest,
35-object seal, dataVersion, every schema-dependent SQLite digest, manifest
digest, inert pointer identity, vector, and canonical index digest.

The canonical corpus SHALL retain exactly its existing 32-path set. Only the
regenerated corrected identities are accepted; prior draft-v1 bytes or
digests SHALL not remain as a second compatibility tuple.

#### Scenario: The unpublished draft is corrected

- **WHEN** the no-formal-v1 preflight passes and all corrected artifacts are
  regenerated in dependency order
- **THEN** every schema, object, dataVersion, SQLite, manifest, pointer, and
  index identity SHALL agree on the corrected v1
- **AND** two clean generations SHALL be byte-identical over the fixed path set

#### Scenario: A formal v1 or stale identity exists

- **WHEN** a formal/public v1 is found or any old draft schema/dataVersion
  identity remains accepted
- **THEN** in-place correction SHALL stop
- **AND** a new versioned compatibility change SHALL be required
