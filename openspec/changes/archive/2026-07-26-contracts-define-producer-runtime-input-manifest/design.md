## Context

Updater `contract-check` validates the Archive index and its 32 listed files.
`produce` also reads six Archive contract inputs and three Catalog schemas.
Those exact 42 Contracts files are the complete runtime closure. The two
Catalog YAML documents are Updater-owned configuration and therefore remain
outside this Contracts manifest.

## Change Boundary

| Field | Declaration |
|---|---|
| Status | Contracts authority only; local and uncommitted until accepted. |
| Owner | Contracts implementation subagent. |
| Writable paths | One manifest/schema/lib/CLI command/test, exact component statement schema/emitter/validator and affected artifact tests, plus this change. |
| Read-only protected inputs | Selected shared authority and every other repository/external path. |
| Deletion complement | None. |
| Mutable refs | None during apply. |
| Consumes | Archive index, indexed files, six Archive schema/data inputs, three Catalog schemas. |
| Produces | Closed canonical file inventory, verifier, and Updater statement binding. |
| Dependencies | Existing strict/canonical JSON and safe-relative-path conventions; Node standard library only. |
| Deliverables | Manifest, schema, validator command, tests. |
| Acceptance | Exact derivation/current bytes/modes, canonical determinism, negative fixtures, full artifact tests, no residue. |
| Non-goals | Runtime packaging, source authority changes, component statement/release changes, deploy. |
| Operations deferred | Release assembly/transfer/deploy/activation. |
| Stop/rollback conditions | Stop if the closure is not exact, another owner must change, or any external mutation is needed. |

## Decisions

### Define one exact 42-file closure

The path set is:

1. `contracts/goldens/archive/index.json`;
2. exactly the 32 safe relative files declared by its `files[].path`;
3. six explicit Archive inputs:
   `archive-manifest.schema.json`, `current-pointer.schema.json`,
   `data-version-input.schema.json`, `fixture-index.schema.json`,
   `compatibility-matrix.json`, and `schema.sql`; and
4. three explicit Catalog schemas:
   `display-config.schema.json`, `staff-set-config.schema.json`, and
   `quality-report.schema.json`.

The validator rejects any change to those counts or derivation. Unused
producer-case/golden-index schemas, READMEs, OpenAPI, API schemas, artifact
control code, and all other goldens remain outside the runtime closure.

### Use a canonical tracked manifest

`producer-runtime-inputs-v1.json` SHALL be canonical JSON with one terminal LF
and exactly:

```text
schemaVersion
fileCount
totalSize
files[] { path, size, sha256 }
fileSetDigest
```

Records are strict ASCII-path byte order and unique. `fileSetDigest` is SHA-256
over the existing repository canonical JSON encoding of the `files` array,
including its terminal LF. All digests use `sha256:<64 lowercase hex>`.

### Validate both declared bytes and source authority

The pure validator accepts an explicit repository root and parsed manifest. It
validates the closed shape and canonical derivation, then walks every path
segment without following symlinks, requires a regular file and Git mode
`100644`, and compares size/digest to actual bytes. It validates indexed file
digests against both the Archive index and the manifest. The CLI defaults only
to its canonical repository root and prints a bounded digest/count result.

Tests use disposable roots for all destructive/type/path negatives; they do
not mutate selected authority.

### Bind the authority in ordinary component evidence

The existing Updater statement emitter SHALL accept
`metadata.inputs.producerRuntimeInputsManifestSha256` and emit a fourth logical
input:

```text
contracts/producer-runtime-inputs-v1
```

The component-statement schema and offline validator SHALL require exactly one
such input for `component: updater`, with a valid SHA-256 digest. This binding
does not expose a repository path inside the runtime image; it names the
versioned logical authority. Existing Backend and Frontend input rules remain
unchanged. Synthetic statement and coordinator fixtures SHALL be updated
without weakening other checks.

## Dependency Direction

```text
Contracts Archive/Catalog authority
              ↓
producer-runtime-inputs-v1.json
              ↓
Updater artifact packaging
              ↓
Operations release assembly
```

## Risks / Trade-offs

- Intentional schema/golden updates must also update the manifest, which is the
  desired fail-closed review point.
- Shipping all 32 indexed fixtures is larger than the handful currently
  executed by `contract-check`, but preserves the index's closed integrity and
  prevents a partial fixture authority.

## Migration Plan

1. Add schema, validator, and tests.
2. Materialize the current exact manifest without editing authority inputs.
3. Add the required Updater component-statement input and offline negatives.
4. Run full Contracts artifact gates and independent closure recomputation.
5. Main agent audits, syncs, archives, and commits.
6. The later Updater change packages only the accepted manifest records.
