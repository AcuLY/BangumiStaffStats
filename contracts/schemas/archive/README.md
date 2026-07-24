# Archive contract v1

This directory is the language-neutral authority for immutable Archive snapshots.
Future Python producers and Go consumers must consume these tracked files rather
than maintain private copies.

## Authorities

- `archive-manifest.schema.json` defines the strict snapshot manifest.
- `current-pointer.schema.json` defines an inert, path-free activation pointer.
- `data-version-input.schema.json` defines the semantic inputs to `dataVersion`.
- `fixture-index.schema.json` defines the closed golden inventory.
- `compatibility-matrix.json` fixes the only supported v1 compatibility tuple,
  validation order, required SQLite objects, and sentinel queries.
- `schema.sql` is the canonical SQLite v1 DDL.

The verifier reads every manifest, pointer, index, vector, matrix, schema, and
tool package JSON file as raw bytes and requires fatal UTF-8 decoding before
parsing. Replacement-character recovery is not an accepted contract path.

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
