# Archive contract v1

This directory is the language-neutral authority for immutable Archive snapshots.
Future Python producers and Go consumers must consume these tracked files rather
than maintain private copies.

## Authorities

- `archive-manifest.schema.json` defines the strict snapshot manifest.
- `current-pointer.schema.json` defines an inert, path-free activation pointer.
- `data-version-input.schema.json` defines the semantic inputs to `dataVersion`.
- `fixture-index.schema.json` defines the closed golden inventory.
- `producer-case.schema.json` defines one strict, compact producer-only case.
- `producer-index.schema.json` defines the separately closed producer inventory.
- `compatibility-matrix.json` fixes the only supported v1 compatibility tuple,
  validation order, required SQLite objects, and sentinel queries.
- `schema.sql` is the canonical SQLite v1 DDL.

The verifier reads every manifest, pointer, index, vector, matrix, schema, and
tool package JSON file as raw bytes and requires fatal UTF-8 decoding before
parsing. Replacement-character recovery is not an accepted contract path.

## Manifest string semantics

`generatedAt` uses the named schema format
`bgmss-utc-generated-at-v1`. Its only accepted spellings are exact UTC
`YYYY-MM-DDTHH:mm:ssZ` or `YYYY-MM-DDTHH:mm:ss.<fraction>Z`, with 1 through 6
fraction digits. Year is `0001..9999`; month/day must be a real Gregorian date;
hour is `00..23`; minute and second are `00..59`. Year 1900 is not leap, year
2000 is leap, and year 0000, hour 24, minute 60, second 60, fractional precision
0 or 7, offsets, rollover, and normalization are rejected as
`MANIFEST_SCHEMA_INVALID`.

Both manifest URL fields use the named schema format
`bgmss-unicode-scalar-url-v1` while retaining their existing pattern and
inclusive `minLength: 12` / `maxLength: 2048` keywords. Fatal UTF-8 decoding is
followed by strict JSON-string validation: a legal high/low surrogate pair
decodes to one Unicode scalar value, while an isolated high or low surrogate
escape is rejected rather than replaced with U+FFFD. Bounds count Unicode
scalar values, never UTF-8 bytes or UTF-16 code units. Consequently
`https://😀` has 9 scalar values and is too short despite occupying 12 bytes;
`https://` plus 2039 `a` characters plus `😀` has exactly 2048 scalar values
and is valid despite occupying 2051 bytes.

The indexed `vectors/manifest-string-semantics.json` is the shared Node,
Python, and isolated-Go evidence. It fixes 25 JSON-string cases plus one
ephemeral raw-byte recipe that preserves the `archiveAssetUrl` string
delimiters and replaces exactly its payload with bytes `C3 28`. It remains one
of the closed corpus's fixed 32 paths; the pre-snapshot raw-domain correction
regenerates schema-dependent bytes without adding or removing a path.

## Producer-only evidence

The accepted consumer corpus and producer evidence are two disjoint closed
inventories. `contracts/goldens/archive/index.json` continues to own exactly
the 32 canonical consumer paths outside `producer/**`.
`contracts/goldens/archive/producer/index.json` owns every other regular,
non-symlink file below `producer/` and uses paths relative to that directory.
Neither index may contain a path owned by the other. Producer cases are never
dispatched as manifest, pointer, vector, or SQLite consumer fixtures.

Each producer case is standalone and fixes:

- the exact UTF-8 bytes, byte size, SHA-256, declared size, and declared
  SHA-256 for every present JSONLines source;
- exact compact JSON-as-YAML `subject_staffs.yml` evidence and catalog-config
  bytes with their sizes and digests;
- the complete dataVersion input, canonical LF preimage, byte length, and
  result;
- exclusive per-source imported/duplicate/invalid/unresolved accounting;
- canonical logical projections, per-projection
  `bgmss-producer-logical-rows-v1` digests, all 20 SQLite table counts, and the
  four bounded quality counts; and
- one stable outcome, bounded first failure, and whether a final candidate is
  allowed.

`bgmss-producer-source-set-v1` binds compact synthetic source evidence without
pretending to be an upstream ZIP. It sorts sources by UTF-8 basename and hashes
an LF record containing the algorithm, source count, and each basename byte
length/value, exact source size, and exact source digest. That result is the
case's synthetic `archiveDigest`; common/catalog digests and the canonical
`schema.sql` digest are independently recomputed before dataVersion.

The 15 cases cover a complete seven-source build, byte-identical regeneration,
an identical duplicate, a permitted raw unknown staff position, malformed and
unknown-field records, a true primary-key conflict, a missing required
reference, missing and extra sources, declared digest and size mismatches, and
three raw-domain rejection families. The positive case contains source type
codes `1/2/3/4/6`, cast roles `1..6`, directed relation rows `2 -> 6` with
codes `1` and `2`, and `6 -> 2` with code `3`. Code `1` is valid outside the
series predicate. The rejection cases exercise another numeric subject code
and a numeric-looking string, an out-of-range cast role and a numeric-looking
string, plus non-positive, JSON-unsafe, and numeric-looking-string relation
codes. Stored logical rows retain only the accepted integer roles and relation
codes; the `cast:anime:main` catalog rule is the numeric predicate
`roleType=1`.

For every failed case, accounting, logical projections, row counts, and their
digests are verifier-only counterfactual recomputation evidence over the
declared bytes. They are not evidence that a producer processed, persisted, or
published those rows. Source-set, declared-size, and declared-digest gates take
precedence over record and reference failures, and only `VALID` permits a final
candidate. These are tiny contract vectors only: they are not downloaded
Archive data and introduce no manifest, pointer, SQLite, compatibility, or
runtime-schema change.

The Python fixture builder regenerates and compares only the canonical
32-entry corpus and proves its fixed root-index and sorted path/digest seals.
The shared Node verifier performs fatal UTF-8 decoding, strict 2020-12 schema
compilation, closed inventory/hash checks, and independent semantic
recomputation for both corpora.

The same builder exercises the `staff_set.set_key` length check through
isolated real-SQLite rows: exact lengths 15 and 96 admit both parent and member
rows, while otherwise equivalent lengths 14 and 97 are rejected. Catalog/query
grammar remains the stricter syntax authority.

The digest construction is deliberately acyclic:

```text
semantic inputs -> dataVersion
final SQLite bytes -> sqliteDigest
manifest bytes -> manifestDigest
pointer and golden index -> manifestDigest
```

The manifest never contains its own digest. `dataVersion` is the SHA-256 of the
fixed UTF-8/LF preimage documented in `data-version-input.schema.json` and the
golden vector. The SQLite filename is always `bangumi.sqlite`.

`compatibility-matrix.json.canonicalSchema` binds both the canonical DDL bytes
and the schema actually stored in SQLite. Its `schemaSqlDigest` must equal the
SHA-256 of `schema.sql`, and every manifest's `schemaSqlDigest` must equal that
same matrix value. This dual binding prevents a manifest, matrix, or DDL file
from independently claiming a different canonical schema.

The actual-schema seal uses `bgmss-sqlite-schema-objects-v1`. It selects every
non-reserved `sqlite_schema` row whose type is `table`, `index`, `view`, or
`trigger` and whose `sql` is not null, ordered with SQLite `BINARY` collation by
`(type, name, tbl_name)`. The corrected v1 contains exactly 35 such objects:
20 explicit tables and 15 explicit indexes. SQLite-created autoindexes are
excluded because their definitions have null `sql` and their names are
reserved.

The seal preimage starts with the algorithm line and `count=<decimal>`, then
serializes `type`, `name`, `table` (the `tbl_name` value), and `sql` for each
ordered row as `<field>=<UTF-8-byte-length>:<raw-UTF-8-bytes>\n`. The matrix
stores the SHA-256 of that complete preimage plus its object count. The verifier
derives the record from the opened database rather than trusting object names:
an altered, extra, or missing stored definition, including a weakened
constraint that leaves all names and sentinels intact, fails the required-object
stage as `SQLITE_REQUIRED_OBJECT_MISSING`.

The pointer schema does not authorize activation. This change intentionally
ships no file named `current.json`; all `current-pointer.json` files under
`contracts/goldens/archive/` are inert test evidence. Runtime paths, filesystem
permissions, scheduling, switching, rollback, retention, and deployment remain
outside this contract.

## Corrected subject semantics

Archive v1 was corrected before its first formal snapshot. No produced,
published, activated, released, or deployed v1 exists, so the manifest and
SQLite schema versions remain 1 while the canonical `schemaSqlDigest`,
`dataVersion`, SQLite/manifest/pointer identities, vector, and indexed golden
bytes replace the earlier draft. The earlier draft is not a supported
alternative. Any later semantic schema change requires a new version.

Every `subject` stores an authoritative `nsfw` integer constrained to 0 or 1.
Producer input must be an actual boolean: missing, null, numeric, string, or
otherwise coerced values fail before insertion. Effective
`includeNSFW=false` selects only `nsfw=0`; `includeNSFW=true` removes that
exclusion and includes both safe and NSFW subjects.

`air_date` and `air_date_precision` are null together, or contain one exact
canonical pair: `YYYY`/1, `YYYY-MM`/2, or `YYYY-MM-DD`/3. The DDL enforces
ASCII digit shape, rejects embedded NUL/trailing bytes, checks year
`0001..9999`, real month/day bounds, and Gregorian leap years without SQLite
date normalization. Precision is derived only from the registered raw string
shape. Month filters and quarter/timeline derivation use only precision 2 or 3;
null and year-only dates are excluded rather than inferred as January or Q1.

## Raw upstream domains

Archive storage preserves upstream numeric facts instead of converting them to
display labels. `cast_credit.role_type` is an integer in the exact range
`1..6`; main cast is the query predicate `role_type = 1`, while all cast
includes every eligible exact row in `1..6`. `subject_relation.relation_type`
is the exact positive JSON-safe integer (`1..9007199254740991`) and each row
keeps the dump direction `subject_id -> related_subject_id`. Series eligibility
is downstream logic and never rewrites, filters, or reverses the stored fact.

The source adapter is a closed map: `1=book`, `2=anime`, `3=music`, `4=game`,
and `6=real`. Other subject codes, non-integer source values, cast roles outside
`1..6`, and non-positive or unsafe relation codes fail before finalization.
The deterministic fixture round-trips all five normalized subject types, all
six cast roles, directed relation codes `2` and `3`, and the locked 52-code
relation domain. Its sorted newline-delimited domain seals are
`5a78c4f014c3f76d16b2d902afb0e5f0ae25540fce9485c6a908f39abff55000`
for subject types,
`c5d161527c5f9d09a2ed9cd76c4063481472f14da4dda40d19468bbfab4421a7`
for cast roles, and
`a12d764c98b4064df39a139914790aade8b6e887ca3d50e7b4c6a955ea4cd9ca`
for relation types.

## Local verification

Run commands from the repository root:

```sh
mkdir -p contracts/schemas/archive/.tmp/system
TMPDIR="$PWD/contracts/schemas/archive/.tmp/system" \
  PYTHONDONTWRITEBYTECODE=1 \
  python3 contracts/schemas/archive/tooling/build_sqlite_fixtures.py --check
TMPDIR="$PWD/contracts/schemas/archive/.tmp/system" \
  npm_config_engine_strict=true \
  npm_config_cache="$PWD/contracts/schemas/archive/.cache/npm" \
  npm ci --prefix contracts/schemas/archive/tooling --ignore-scripts
TMPDIR="$PWD/contracts/schemas/archive/.tmp/system" \
  npm_config_engine_strict=true \
  npm_config_cache="$PWD/contracts/schemas/archive/.cache/npm" \
  npm --prefix contracts/schemas/archive/tooling run verify
```

The acceptance workflow additionally redirects all Go caches below this
directory and denies Go telemetry writes. `.cache`, `.tmp`, and
`tooling/node_modules` are disposable and must not survive candidate sealing.
The shared Go telemetry directory's before/after byte seals are diagnostic:
unrelated editor processes may change them. After either accepted discovery
mode (`off` or `local`), every verifier-owned Go or gofmt child is run
fail-closed through the exact `sandbox-exec` profile that denies writes below
the canonical telemetry directory. The direct wrapper remains unconditional
because the shared mode may change before a later child starts. Inherited
`ARCHIVE_GO_*` claims are ignored and removed from child environments; no
global process is stopped or reconfigured to force seal equality.
The lockfile also pins quicktype's `stream-json` transitive dependency to 2.1.0:
quicktype 26 declares Node 20 support while its later 3.x transitive release
requires Node 22. This compatibility override preserves the approved quicktype
version and the contract's Node 20.19 baseline.
