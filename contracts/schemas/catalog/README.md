# Catalog contract v1

This directory is the language-neutral authority for dynamic common positions,
display groups, dormant staff sets, exact cast derivation, quality evidence,
and `catalogConfigDigest`.

## Authorities

- `display-config.schema.json` defines the governed capability matrix, exact
  featured shortcuts, cast-group anchors, and additional display groups.
- `staff-set-config.schema.json` defines the dormant `staffset:*` extension.
- `derivation-case.schema.json` defines compact common/Archive inputs, exact
  projections, and the positive/negative semantic matrix.
- `quality-report.schema.json` defines bounded diagnostic and blocking
  evidence.
- `golden-index.schema.json` defines the closed corpus inventory.

Every JSON object is closed. Identifiers and JSON-safe integers are bounded.
The verifier fatal-decodes UTF-8 before JSON parsing, compiles all schemas with
AJV 8.20.0 in strict 2020-12 mode, rejects symlinks and extra/missing files,
checks every indexed SHA-256, and independently recomputes all catalog,
configuration, cast, and quality semantics.

`catalogConfigDigest` is SHA-256 over one fixed-field compact JSON document
followed by LF. Display array order is semantic. Staff sets sort by subject
type, positive display order, and key; their members sort by ASCII
PositionKey. Duplicate members fail instead of being removed.

The current active staff-set document has an empty `sets` array. Synthetic
cases prove the future extension without activating it. Cast is derived only
from exact same-subject `(subjectId, characterId)` joins and the global
`valid_cv` person set. The Archive input explicitly closes every subject,
person, and character reference. `subjectCharacters.type/order` is the sole
raw role/order authority; `personCharacters` carries only the exact
person-character identity edge. Raw roles remain integers `1..6`; main selects
`1` and all selects every eligible exact edge. Duplicate, conflicting, or
phantom relations block the case instead of producing a partial projection.
The animation/game cast shortcut follows the pinned common category key
`music` with Chinese label `声音类`; no private category-key alias is admitted.
Subject relations are present only as negative evidence and are never
traversed.

## Local verification

Run from the repository root:

```sh
mkdir -p contracts/schemas/catalog/.tmp/system
TMPDIR="$PWD/contracts/schemas/catalog/.tmp/system" \
  npm_config_engine_strict=true \
  npm_config_cache="$PWD/contracts/schemas/catalog/.cache/npm" \
  npm ci --prefix contracts/schemas/catalog/tooling --ignore-scripts
TMPDIR="$PWD/contracts/schemas/catalog/.tmp/system" \
  npm_config_engine_strict=true \
  node contracts/schemas/catalog/tooling/verify.mjs
```

The command removes no evidence and never rewrites expected bytes or hashes.
`.cache`, `.tmp`, and `tooling/node_modules` are disposable local state below
this catalog root and must be absent at handoff.
