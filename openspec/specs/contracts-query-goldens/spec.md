# contracts-query-goldens Specification

## Purpose
Define a closed language-neutral Query Domain golden corpus that locks exact normalized-query, digest, filtering, catalog-identity result-set, and participant set-algebra outputs before and independently of Backend implementation.
## Requirements
### Requirement: Query-domain goldens SHALL be closed and language-neutral

`contracts/goldens/query-domain/**` SHALL contain a schema-versioned manifest
with the exact lexically sorted regular-file inventory and SHA-256 for every
case. Cases SHALL use JSON facts and expected JSON outputs only, reference
existing query/Archive/catalog authority identities instead of copying them,
and contain no secret, real token, bulk personal fixture, pointer, cache, or
runtime-specific value.

#### Scenario: Golden inventory is verified
- **WHEN** the zero-dependency verifier scans the directory
- **THEN** every declared file SHALL exist once with its declared hash and no undeclared case or generated residue SHALL remain

### Requirement: Cases SHALL define result-set inputs and exact outputs

Each successful case SHALL identify a submitted-query vector or inline closed
query, catalog plan, synthetic Archive facts, optional synthetic collection,
and expected Effective Query/queryDigest. It SHALL also declare sorted eligible
Subjects, per-position candidate people/Subjects/contributions, ranking people
and work unions, total participating Subjects, and requested participant
unions/intersections. Failure cases SHALL declare one stable code/path or
context outcome and no partial result.

The corpus SHALL cover both scopes; non-access of collection data in global;
all filter families; NSFW and year/month/day precision; public/meta/personal
tag sources and Boolean logic; missing ratings; exact staff, cast main/all,
staff set, positions with no credit, and 101–106 separation; multi-position
AND/work union; identity union/person intersection; deterministic duplicates
and order; cancellation; and a bounded oracle-provenance `449 -> 442` case.

#### Scenario: Scope and filter matrix runs
- **WHEN** Go or a future independent consumer executes every declared case
- **THEN** it SHALL produce the same normalized query, digest, eligible set, identity evidence, and actual-participation set without scope leakage

#### Scenario: Identity matrix runs
- **WHEN** staff, cast, staff-set, duplicate-credit, no-credit, multi-position, and multi-person cases run
- **THEN** their candidate, union, intersection, contribution, and stable-order outputs SHALL match exactly

### Requirement: Goldens SHALL precede and remain independent of Backend apply

The Contracts block SHALL pass inventory, authority-reference, semantic, and
diff checks before Backend implementation begins. Backend tests SHALL consume
the committed case JSON directly; they SHALL not rewrite expected outcomes
into Go fixtures. This capability SHALL not change OpenAPI, JSON Schema,
Archive DDL, catalog authority, or runtime code.

#### Scenario: Backend needs a different expected result
- **WHEN** implementation disagrees with a golden or requires a schema/semantic change
- **THEN** apply SHALL stop for Contracts/main review rather than modifying the expected file to match code
