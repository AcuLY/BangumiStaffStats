# contracts-archive-goldens Specification

## Purpose
TBD - created by archiving change produce-immutable-archive. Update Purpose after archive.
## Requirements
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
inventories separately and reject any cross-index path. Neither the producer
schemas nor cases alter the Archive manifest, pointer, SQLite schema,
compatibility tuple, canonical fixture outcome, or accepted consumer behavior.
The protected root-index SHA-256 SHALL remain
`11db96ca6ea576c123864743bb05267b620edcf8dab67ebe1a8d5a7e224f2077`;
the SHA-256 of its `LC_ALL=C` sorted `<path><TAB><digest><LF>` table SHALL
remain `1799b375ff5490a4ef5c940d72d7d1db8ba61032f7b21bc2c738cccb3f9243fa`.

The positive and rejection cases SHALL cover all five registered source type
codes, all six integer cast roles, directed relation codes `2/3`, another
valid relation code outside the series predicate, and wrong-type/out-of-domain
values. Expected rows SHALL preserve raw numeric values and source direction;
no case may encode `main`, `support`, `guest`, `sequel`, or `prequel` as stored
Archive values.

#### Scenario: Contracts handoff precedes updater work
- **WHEN** both strict schemas, all case bytes, expected results, hashes, the closed producer sub-index, and the governed canonical 32-file seal pass independent Contracts review
- **THEN** the Updater owner MAY consume them read-only
- **AND** any needed schema/semantic change SHALL stop for a separate Contracts-authority amendment rather than be implemented privately

#### Scenario: A producer failure case is evaluated
- **WHEN** one declared fatal record/source/digest invariant is violated
- **THEN** the case SHALL name one bounded first failure and assert that no final Archive candidate exists

#### Scenario: A syntactically valid relationship dangles
- **WHEN** one relationship line references an Archive identity absent from the complete input set
- **THEN** that line SHALL contribute once to its source `invalid` count and no logical/SQLite row
- **AND** the otherwise valid candidate SHALL complete without `SOURCE_REFERENCE_MISSING`

#### Scenario: Canonical and producer inventories are confused
- **WHEN** a producer path enters the root index, a canonical path enters the producer sub-index, either inventory has an unindexed/missing/duplicate/hash-drifted/symlink/non-regular path, or any accepted canonical byte changes
- **THEN** Contracts acceptance SHALL fail before updater handoff

### Requirement: Canonical catalog fixtures SHALL follow governed row algorithms

The canonical 32-path Archive corpus SHALL remain a closed generator-owned
inventory, but its prior byte seal is superseded by this reviewed correction.
For its existing three anime positions, common `production` category, and
compact featured members, `valid/minimal` SHALL apply the exact bounded row
algorithms of the accepted `updater-position-catalog` compiler/SQLite adapter:

- exact staff uses `rule:{positionKey}` and the numeric ID string; same-type
  cast main/all use `exclusive:cast:{subjectType}` and `1|1..6`;
- ordinary staff and cast positions have no `catalog_position_member` rows;
  that table represents only sorted exact-staff membership of a `staffSet`;
- cast main/all use governed labels/names and 10-step display order;
- every selectable fixture staff/cast position has all five fixed capabilities
  in canonical order;
- the compact featured group is `shortcut:anime:featured`, and the stored
  common category produces `bangumi:anime:production`; and
- group members use the SQLite adapter's deterministic zero-based display
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
updated to their independently recomputed values. No verifier algorithm,
inventory rule, semantic check, input, error condition, or producer seal SHALL
change.

#### Scenario: The valid minimal bundle is regenerated

- **WHEN** the canonical builder emits the minimal catalog and reseals all
  identity-bearing outputs
- **THEN** every position/member/group/group-member/capability/rule row for the
  bounded fixture matches the governed Updater row algorithms
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
