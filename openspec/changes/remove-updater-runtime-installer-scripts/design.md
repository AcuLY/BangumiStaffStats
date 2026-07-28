## Context

uv 0.11.32 installs target-scheme command shims below `<target>/bin` and
records them as `bin/**` in a distribution `RECORD`. The frozen Updater native
artifact passes a checkout-local Python interpreter to uv, so
`site-packages/bin/jsonschema` contains that absolute path. Its two internal
reproducibility builds share one interpreter and pass, while Operations'
independent checkouts use distinct interpreters and expose the byte drift.
The Docker build has the same unnecessary command shim under `/opt/runtime`,
although its path happens to be stable.

| Field | Declaration |
|---|---|
| Status | Root cause complete; design complete after main-agent review; apply/verification/commit/push/release/deploy not complete. |
| Owner | One delegated Updater implementation owner; main agent controls specification, integration decisions, audit, and acceptance. |
| Writable paths | `updater/build/runtime_prune.py`, `updater/build/test_artifact.py`, and this change. |
| Read-only protected inputs | All other repository and external paths, including the existing callers of `prune_runtime_tree`. |
| Deletion complement | Only generated direct `<runtime-root>/bin/**` files/directories and their exact installed-distribution `RECORD` rows before publication; no tracked deletion. |
| Mutable refs | None during implementation. |
| Consumes | Existing native and Docker calls to the shared prune helper, uv target layout, and installed wheel metadata. |
| Produces | One shared closed pruning rule used unchanged by native and OCI builds. |
| Dependencies | Updater correction precedes refreshed Development Actions and a separately specified same-source remote targeted acceptance refresh; the active Operations change consumes only that newly closed frozen result. Direction is Updater correction → Development Actions → remote acceptance refresh → Operations receipt/candidate. |
| Deliverables | Closed prune/verify logic, producer-shaped regression tests, strict OpenSpec and Actions evidence. |
| Acceptance | Static checks locally; complete exact-head Development Actions; separate same-source remote package/supervisor/targeted/cleanup/audit evidence; then Operations independent checkout comparison. |
| Non-goals | No tool/dependency upgrade, public behavior, runtime module, artifact schema, or Operations comparison change. |
| Operations deferred | All live release/deployment/activation and host mutation. |
| Stop/rollback conditions | Same as the capability boundary; rollback is limited to this owner's exact uncommitted files/generated ignored output. |

## Goals / Non-Goals

**Goals:**

- Remove path-bearing installer command shims from both published Updater
  runtime forms without removing importable dependencies.
- Keep installed metadata internally valid and deletion ownership closed.
- Make output independent of the Python interpreter's absolute path.

**Non-Goals:**

- Preserve or expose third-party console scripts as product interfaces.
- Rewrite shebangs, weaken reproducibility comparison, or normalize artifacts
  after their producer statement is emitted.
- Change the Updater's supported launcher, dependencies, or product behavior.

## Decisions

### 1. Remove the direct runtime-root `bin` subtree instead of rewriting it

Neither `jsonschema` nor the wheel-generated `bgmss-updater` command shim is a
supported runtime interface: native packaging creates its own stable launcher
outside the install root, and OCI invokes the module directly. Removing these
files eliminates the interpreter path rather than replacing it with another
host convention. Rewriting shebangs was rejected because it would retain an
unused command surface and require defining a portable interpreter contract
for commands that are never executed.

### 2. Close deletion against installed `RECORD` ownership

The helper will treat only the install root's direct real `bin` directory as
installer output. Before deletion it will enumerate regular descendants,
parse all distribution `RECORD` files, and require an exact one-owner mapping
between on-disk files and safe `bin/**` rows. It then removes those rows,
deletes the files and empty directories, and runs the existing complete
runtime verifier. An unrecorded, duplicate, linked, special, missing, or
digest-mismatched entry fails rather than being silently cleaned.

Deleting a broad name anywhere below the runtime was rejected because Python
packages may legitimately contain their own nested `bin` directories.

### 3. Use the existing shared prune helper for native and OCI output

`artifact.py` already calls the helper on the native install root and the
Dockerfile calls it on `/opt/runtime`. Implementing the rule once keeps both
closures aligned without changing either protected caller or the artifact
schema.

### 4. Prove path independence with two producer-shaped roots

Tests will create two otherwise identical installed trees whose recorded
console-script bytes contain different absolute interpreter paths. After
independent pruning, their closed file inventories and bytes must match.
Negative fixtures cover unclosed ownership and post-prune verification.

The oracle comparison is preservation-only: no visual, interaction, API, or
business behavior changes, so no new prototype screenshot is required.

## Risks / Trade-offs

- **A future dependency requires a console script at runtime** → It must be
  introduced as an explicit supported interface through a separate OpenSpec;
  this correction fails any retained direct `bin`.
- **A malformed `RECORD` causes partial deletion** → Validate the complete
  ownership/digest set before the first delete, then atomically rewrite each
  surviving `RECORD` with existing temporary-file replacement.
- **The test models the wrong uv target layout** → Use the exact observed
  `bin/jsonschema` row and exercise both native-shaped absolute paths.
- **Refreshed acceptance broadens scope** → Freeze only the reviewed product
  commit, require exact-head Development green, and update Operations receipt
  metadata in the already approved Operations change.

## Migration Plan

1. Implement and statically audit the two exact files.
2. Commit and push the correction with its planning artifacts.
3. Require exact-head Development success; do not use a prior green run.
4. Synchronize/archive this change, then complete and archive a separate
   same-source remote targeted acceptance refresh for the new product
   revision/tree.
5. Update the Operations frozen-product receipt/build-definition and refresh
   lifecycle digests,
   then resume its unchanged independent candidate comparison.
6. If any gate fails, make no release/deployment/production-host mutation and correct
   only the responsible change.

## Open Questions

None.
