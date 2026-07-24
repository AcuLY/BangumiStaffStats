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

The pointer schema does not authorize activation. This change intentionally
ships no file named `current.json`; all `current-pointer.json` files under
`contracts/goldens/archive/` are inert test evidence. Runtime paths, filesystem
permissions, scheduling, switching, rollback, retention, and deployment remain
outside this contract.

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
The lockfile also pins quicktype's `stream-json` transitive dependency to 2.1.0:
quicktype 26 declares Node 20 support while its later 3.x transitive release
requires Node 22. This compatibility override preserves the approved quicktype
version and the contract's Node 20.19 baseline.
