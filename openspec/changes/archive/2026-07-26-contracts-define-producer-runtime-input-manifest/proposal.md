## Why

The one-shot Updater needs a closed subset of shared Archive goldens and
Archive/Catalog schemas at production runtime. Today only a repository source
tree can supply that subset. Copying the whole Contracts tree would ship
unrelated API and test authority, while letting Updater or Operations invent an
allowlist would create a second Contracts authority.

## What Changes

- Add one versioned, canonical Contracts manifest for the exact producer
  runtime input closure.
- Derive the closure from `contracts/goldens/archive/index.json` and nine
  explicit Archive/Catalog schema inputs: 42 regular tracked files in total.
- Bind each path, byte size, and SHA-256 plus a canonical file-set digest.
- Add a strict schema, validator/CLI, and positive/negative tests for unsafe
  paths, duplicates/order drift, missing/extra/index-unlisted files,
  digest/size drift, symlinks, special files, malformed/noncanonical JSON, and
  source mode drift.
- Require every Updater component statement to contain the logical
  `contracts/producer-runtime-inputs-v1` input with this manifest's exact
  digest, so offline compatibility verification binds the embedded closure.
- Make this manifest the only authority an Updater artifact may use when
  embedding Contracts producer runtime inputs.

## Capabilities

### New Capabilities

- `contracts-producer-runtime-inputs`: define and verify the exact immutable
  Contracts byte closure required by a production Archive producer.

### Modified Capabilities

- `contracts-artifact-compatibility`: require Updater component evidence to
  bind the producer-runtime manifest digest.

## Impact

| Field | Declaration |
|---|---|
| Status | New Contracts development authority; not released or deployed. |
| Owner | One Contracts implementation subagent; main agent specifies, audits, accepts, and performs lifecycle work. |
| Writable paths | New `contracts/artifacts/producer-runtime-inputs-v1.json`, new schema, new `contracts/artifacts/lib/runtime-inputs.mjs`, exact command addition in `contracts/artifacts/bin/artifacts.mjs`, exact Updater-input additions in `contracts/artifacts/statement.py`, `contracts/artifacts/schemas/component-statement-v1.schema.json`, and `contracts/artifacts/lib/validation.mjs`, affected `contracts/artifacts/test/**` fixtures/tests, and this change's task/lifecycle paths. |
| Read-only protected inputs | `contracts/goldens/archive/**`, selected `contracts/schemas/archive/**` and `contracts/schemas/catalog/**`, all other Contracts/product/harness/CI files, remotes, hosts, and production. |
| Deletion complement | None. |
| Mutable refs | Current local branch only after main-agent acceptance; no remote ref during apply. |
| Consumes | Accepted Archive fixture index/files, six producer Archive inputs, three Catalog schemas, strict/canonical JSON helpers, and artifact safe-path rules. |
| Produces | Canonical v1 producer-runtime input manifest/schema/validator and an offline-verifiable Updater component-statement binding. |
| Dependencies | Node 24.18.0; no new package or lock. |
| Deliverables | One 42-file authority manifest, schema, pure validator/CLI, component-statement binding, and tests. |
| Acceptance | Exact closure recomputation, schema/manual validation, current-tree verification, deterministic canonical bytes, comprehensive negatives, full Contracts artifact tests, strict OpenSpec, diff/residue. |
| Non-goals | Copying or packaging runtime bytes, modifying source schemas/goldens, changing product semantics, Updater implementation, release assembly, deployment, or host mutation. |
| Operations deferred | Release manifest/bundle assembly, extraction, transfer, deployment and activation remain operations-owned. |
| Stop/rollback conditions | Stop on ambiguous runtime dependency, selected-source drift, schema/golden edit need, unsafe path/type/mode, dependency addition, unexpected path, or external mutation. |

This is a `NEW_CAPABILITY` with no UI/API behavior change. It touches no
external state and authorizes no push, release, deployment, or activation.
Apply starts only after strict validation and main-agent review.
