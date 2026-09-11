## Capability Boundary

| Field | Boundary |
|---|---|
| Status | INTENTIONAL_DELTA; SQLite v2 profile evidence, apply blocked until primary review and strict-valid complete planning |
| Owner | Contracts owns canonical schemas, golden semantics and generated identities; Backend owns production writer/reader; primary owns integration and acceptance |
| Writable paths | `contracts/schemas/archive/{producer-case.schema.json,README.md,tooling/build_sqlite_fixtures.py,tooling/verify.mjs,tooling/refresh_derived_fixtures.py,tooling/test_refresh_derived_fixtures.py}`; canonical files named by `contracts/goldens/archive/index.json` plus that index; producer files named by `contracts/goldens/archive/producer/index.json` plus that index; `contracts/artifacts/{producer-runtime-inputs-v1.json,lib/validation.mjs,test/contracts.test.mjs}` and existing generated JSON fixture files below `contracts/artifacts/fixtures/`; generated `backend/internal/archivebuild/assets/schema.sql`; mechanical digest/version bindings in `backend/build/{artifact.go,artifact_test.go}`; this delta spec; its root capability during primary-owned sync only |
| Read-only protected inputs | PRODUCT.md, accepted data decisions and guides, original official dump, all existing real Archive versions and pointers, query/statistics/API contracts, unrelated dirty work, live/production resources |
| Deletion complement | Replace only the reviewed v1-derived contract identities and obsolete v1-only assumptions; preserve exact source domains, table/index inventory, fixture paths/outcomes, and previous real snapshot bytes |
| Mutable refs | None; current master worktree, no staging, commit, push or merge |
| Consumes | Canonical Archive DDL/matrix, existing closed canonical and producer indexes, person.jsonlines summary, backend guide's optional Archive plain-text summary, existing artifact identity construction |
| Produces | Closed v2 canonical/producer evidence, literal normalized biography projections, regenerated runtime-input/artifact bindings and deterministic verification |
| Dependencies | Reviewed contracts-restore-person-profile-evidence proposal/design/tasks; Contracts v2 precedes Backend writer/reader verification; frontend consumes the existing optional person.summary wire field |
| Deliverables | Complete canonical v2 contract, reproducible evidence and exact verification results within this capability |
| Acceptance | `python contracts/schemas/archive/tooling/build_sqlite_fixtures.py --check`; `npm --prefix contracts/schemas/archive/tooling run verify`; bounded refresh --check and its tests; `node --test contracts/artifacts/test/*.test.mjs`; Backend builder parity and build/artifact tests; git diff --check |
| Non-goals | New dependencies, HTML/BBCode interpretation, profile network enrichment, sidecars, dual-version production readers, new Backend admission/smoke pipelines, statistical changes or general infrastructure |
| Operations deferred | No live activation, scheduler run, release, deployment, production pointer or existing Archive mutation; a fresh local candidate belongs to the separately bounded Backend task |
| Stop/rollback conditions | Stop on concurrent overlap, unsupported source normalization, undeclared path or fixture drift, authority conflict or failed acceptance; preserve old binary/pointer/snapshot and revert only owned hunks |

This capability owns the later SQLite v2 delta after the completed v1 parity
scope of backend-embed-go-archive-builder. Earlier v1 draft-correction and fixed
byte-seal requirements describe their historical transitions; this change
supersedes only the explicitly modified version/evidence requirements below.
It does not reinstate a consumer admission layer removed by the accepted Go
writer/reader architecture.

Additional exact derivative writers approved after the complete identity-residue scan: `contracts/artifacts/test/producer-runtime-inputs.test.mjs`, `contracts/artifacts/schemas/component-statement-v1.schema.json`, `backend/build/build.sh`, `contracts/goldens/query-domain/manifest.json`, and `contracts/goldens/query-domain/verify.mjs`. They may change only the reviewed v2 SQL/matrix/runtime-input identities, supported version expectation and Archive authority identifier; query fixture data and semantics remain read-only.

## MODIFIED Requirements

### Requirement: Contracts SHALL define producer cases before implementation

The Contracts owner SHALL retain strict, language-neutral cases under
`producer/**` for a complete seven-source valid build, identical regeneration,
identical duplicate, contract-permitted unresolved raw position,
malformed/unknown-field record, conflicting duplicate, missing required
reference, missing/extra source, and digest/size mismatch. Expected evidence
SHALL fix each exact input byte sequence and digest, exclusive accounting
result, canonical logical rows/counts, dataVersion inputs/result, stable
producer outcome, first failure, and whether a final candidate may exist. No
case may contain downloaded full-dump, secret, user, pointer, or `current.json`
data.

The missing-required-reference case SHALL represent a syntactically valid
relationship line whose referenced Archive identity is absent. It SHALL count
that physical line exactly once as `invalid`, exclude the dangling logical and
SQLite row, retain a referentially complete candidate, and finish as `VALID`
with no first failure. `SOURCE_REFERENCE_MISSING` SHALL NOT remain an exposed
fatal producer outcome. Malformed records and conflicting duplicates remain
fatal and SHALL NOT be reclassified as ordinary invalid accounting.

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
paths it indexes SHALL remain a closed deterministic inventory governed by the
canonical-catalog-fixture requirement below. The fixture builder SHALL
regenerate and compare that canonical corpus independently of `producer/**`;
the shared verifier SHALL validate the canonical and producer closed
inventories separately and reject any cross-index path. The reviewed v2 change SHALL regenerate schema-dependent identities and add
normalized nullable summary to person logical projections, ordered after the existing careers key. Previously locked
v1 root-index and sorted path/digest seals SHALL be replaced only with the
independently recomputed v2 seals. The canonical 32-path and producer 15-case
inventories SHALL remain unchanged. Unrelated semantic inputs, source
accounting, catalog/statistical rows and existing case outcomes SHALL not
change merely to accommodate the version bump.

The positive and rejection cases SHALL cover all five registered source type
codes, all six integer cast roles, directed relation codes `2/3`, another
valid relation code outside the series predicate, and wrong-type/out-of-domain
values. Expected rows SHALL preserve raw numeric values and source direction;
no case may encode `main`, `support`, `guest`, `sequel`, or `prequel` as stored
Archive values.

#### Scenario: Contracts handoff precedes Backend builder work
- **WHEN** both strict schemas, all case bytes, expected results, hashes, the closed producer sub-index, and the governed canonical 32-file seal pass independent Contracts review
- **THEN** the Backend builder SHALL consume the accepted evidence read-only
- **AND** any needed schema/semantic change SHALL stop for a separate Contracts-authority amendment rather than be implemented privately

#### Scenario: A producer failure case is evaluated
- **WHEN** one declared fatal record/source/digest invariant is violated
- **THEN** the case SHALL name one bounded first failure and assert that no final Archive candidate exists

#### Scenario: A syntactically valid relationship dangles
- **WHEN** one relationship line references an Archive identity absent from the complete input set
- **THEN** that line SHALL contribute once to its source `invalid` count and no logical/SQLite row
- **AND** the otherwise valid candidate SHALL complete without `SOURCE_REFERENCE_MISSING`

#### Scenario: Canonical and producer inventories are confused
- **WHEN** a producer path enters the root index, a canonical path enters the producer sub-index, either inventory has an unindexed/missing/duplicate/hash-drifted/symlink/non-regular path, or any byte changes outside the reviewed v2-derived evidence
- **THEN** Contracts acceptance SHALL fail before Backend handoff

The real Go builder SHALL execute every indexed producer case. Valid cases
SHALL match dataVersion, source accounting, all 20 table counts, all four
quality counts, all eight logical projection digests including person.summary,
and candidate permission. Rejected cases SHALL return their stable first
failure and publish nothing. Biography examples SHALL be compact synthetic
text, never copied real biographies or downloaded dumps.

#### Scenario: Person logical evidence includes biography
- **WHEN** a producer case contains a valid, absent, null, whitespace-only, control-bearing or markup-like summary
- **THEN** its person projection SHALL contain the exact normalized string or null under contracts-archive-manifest
- **AND** source bytes/digests, dataVersion and person logical digest SHALL be recomputed independently

#### Scenario: Existing source failure remains a failure
- **WHEN** a malformed record, source-set mismatch, declared digest/size mismatch or conflicting duplicate case is regenerated for v2
- **THEN** its existing first failure, exclusive accounting and candidate permission SHALL retain their accepted meanings
- **AND** regenerating expected bytes SHALL not convert an implementation error into accepted evidence

### Requirement: Canonical catalog fixtures SHALL follow governed row algorithms

The canonical 32-path Archive corpus SHALL remain a closed generator-owned
inventory, but its prior byte seal is superseded by the reviewed SQLite v2 profile-evidence change.
For its existing three anime positions, common `production` category, and
compact featured members, `valid/minimal` SHALL apply the exact bounded row
algorithms of the accepted Backend catalog builder:

- exact staff uses `rule:{positionKey}` and the numeric ID string; same-type
  cast main/all use `exclusive:cast:{subjectType}` and `1|1..6`;
- ordinary staff and cast positions have no `catalog_position_member` rows;
  that table represents only sorted exact-staff membership of a `staffSet`;
- cast main/all use governed labels/names and 10-step display order;
- every selectable fixture staff/cast position has all five fixed capabilities
  in canonical order;
- the compact featured group is `shortcut:anime:featured`, and the stored
  common category produces `bangumi:anime:production`; and
- group members use the accepted deterministic zero-based display
  order.

This bounded fixture SHALL NOT be expanded into the full production
configuration or invent missing five-type common positions, game cast,
complete featured references, or a cast-anchor group.

The fixture builder SHALL regenerate every affected SQLite, manifest, pointer,
dataVersion vector, negative bundle, and root-index digest from source
semantics. It SHALL not hand-patch generated bytes, change the existing
canonical path set, mutate `producer/**`, or relax Archive/catalog validation.
Two complete regenerations SHALL be byte-identical and every indexed artifact
SHALL retain its declared validation-stage outcome.

After the final corpus is sealed, the verifier's exact canonical-root-index
SHA-256 and sorted `<path><TAB><digest><LF>` table SHA-256 literals SHALL be
updated to their independently recomputed values. Only schema-version and biography expectations SHALL change. Catalog algorithms, inventory rules, unrelated semantic inputs and stable error conditions SHALL remain enforced; producer seals SHALL be refreshed only by the separately bounded producer generator.

#### Scenario: The valid minimal bundle is regenerated

- **WHEN** the canonical builder emits the minimal catalog and reseals all
  identity-bearing outputs
- **THEN** every position/member/group/group-member/capability/rule row for the
  bounded fixture matches the governed Backend row algorithms
- **AND** the closed canonical inventory and all positive/negative verifier
  outcomes pass without adding or removing a path

#### Scenario: A fixture-only legacy row or manual patch remains

- **WHEN** a rule uses `select:*`, `positionId=*`, or `roleType=*`; a cast
  position contains another cast position; a cast label/name/order or
  capability row differs from the governed bounded projection; a shortcut
  lacks the `shortcut:` namespace; the stored common category lacks its
  Bangumi group; member order is not zero-based; or a generated identity is
  edited outside deterministic regeneration
- **THEN** Contracts acceptance SHALL fail before Backend handoff
- **AND** Backend SHALL not be broadened to normalize the stale evidence

## ADDED Requirements

### Requirement: Derived profile evidence SHALL regenerate within closed inventories

`build_sqlite_fixtures.py` SHALL remain the canonical SQLite/manifest/pointer
fixture generator. One dependency-free
`contracts/schemas/archive/tooling/refresh_derived_fixtures.py` MAY supplement
it only to refresh the declared producer identities/projections/index,
canonical matrix/verifier seals, producer-runtime-input manifest, existing
artifact fixture JSON identities, byte-identical embedded schema and exact
artifact compatibility bindings. It SHALL expose write and check modes and
fail on any output outside its explicit closed file inventory. The paired
`test_refresh_derived_fixtures.py` SHALL verify normalization/scalar bounds,
output confinement and deterministic checking without depending on production
code. No new orchestration, dependency or proof system is authorized.

The canonical path writer set SHALL be exactly `contracts/goldens/archive/`
joined with each file path already declared by its root index, plus that index.
The producer path writer set SHALL be exactly
`contracts/goldens/archive/producer/` joined with each existing sub-index path,
plus that sub-index. Artifact fixture writing SHALL touch only existing JSON
fixture files needed to propagate the reviewed SQL/matrix/runtime-input
identity and SQLite range changes; fixture meanings and unrelated bytes SHALL
remain unchanged. The runtime-input manifest SHALL retain its existing
42-file inventory. Backend embedded DDL and artifact bindings SHALL remain
derivatives of the Contracts canonical values, not competing authorities.

Refresh SHALL preserve intentionally invalid fixture mutations so each
negative case still reaches the same stable validation stage. In particular,
the unsupported-schema case SHALL use an unsupported SQLite version after
v2 becomes current; it SHALL not become accidentally valid because its old
negative value was 2. Two full refreshes from identical sources SHALL produce
identical bytes, and check mode SHALL report drift without mutating outputs.

#### Scenario: All derived evidence is refreshed
- **WHEN** the reviewed v2 DDL and bounded synthetic biography inputs are regenerated
- **THEN** canonical/producer indexes, dataVersion preimages/results, logical digests, runtime-input manifest, artifact fixtures and embedded DDL SHALL agree
- **AND** two complete regenerations SHALL be byte-identical with unchanged closed path sets

#### Scenario: An old unsupported-version fixture used version 2
- **WHEN** the canonical supported SQLite version becomes 2
- **THEN** the existing unsupported-schema fixture SHALL deterministically identify version 1 or another unsupported value
- **AND** Contracts verification SHALL still return ARCHIVE_VERSION_UNSUPPORTED at compatibility, before later gates

#### Scenario: Check mode detects a stale derivative
- **WHEN** one generated digest, person projection, embedded SQL byte or artifact version range differs from the canonical v2 value
- **THEN** check mode SHALL fail and name the affected derivative without rewriting it
- **AND** generated expectations SHALL not be hand-patched to bypass regeneration

#### Scenario: A generator is asked to write outside the owned set
- **WHEN** a target is unindexed, escapes the declared repository path, or aliases an unrelated file through a symlink
- **THEN** refresh SHALL reject it before writing that target
- **AND** existing snapshots, pointers and unrelated dirty files SHALL remain unchanged
