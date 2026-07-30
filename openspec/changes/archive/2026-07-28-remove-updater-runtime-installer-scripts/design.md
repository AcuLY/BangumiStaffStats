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
| Status | Root cause/design/implementation/zero-P0/P1 audit/commit/push/synchronization/archive complete; exact-head Product Development run `30373636575` succeeded at `4b5bdf9f27ea0e3db95009a7fcb3ef912c3948c2` / tree `72028c6356616bf0e5905529d807247ad390af9e`; release/deploy not performed. |
| Owner | One delegated Updater implementation owner; main agent controls specification, integration decisions, audit, and acceptance. |
| Writable paths | `updater/build/runtime_prune.py`, `updater/build/test_artifact.py`, and this change. |
| Read-only protected inputs | All other repository and external paths, including the existing callers of `prune_runtime_tree`. |
| Deletion complement | Only generated direct `<runtime-root>/bin/**` files/directories and their exact installed-distribution `RECORD` rows before publication; no tracked deletion. |
| Mutable refs | None during implementation. |
| Consumes | Existing native and Docker calls to the shared prune helper, uv target layout, and installed wheel metadata. |
| Produces | One shared closed pruning rule used unchanged by native and OCI builds. |
| Dependencies | Updater correction precedes refreshed Development Actions and a separately specified same-product, dual-identity remote targeted acceptance refresh; the active Operations change consumes only that newly closed frozen result. Direction is Updater correction → Development Actions → remote acceptance refresh → Operations receipt/candidate. |
| Deliverables | Closed prune/verify logic, producer-shaped regression tests, strict OpenSpec and Actions evidence. |
| Acceptance | Static checks locally; complete exact-head Development Actions; acceptance-free product identity plus compatible acceptance-control identity, their exact non-harness/lifecycle byte-and-mode equality, isolated remote package/supervisor/targeted/cleanup/audit evidence, and then Operations independent checkout comparison. |
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

The destructive phase is descriptor-relative. After one complete admission
and one complete pre-delete rescan, the helper atomically renames the admitted
`bin` directory with an atomic no-replace primitive: Linux uses
`renameat2(RENAME_NOREPLACE)` and Darwin uses
`renameatx_np(RENAME_EXCL)`. Unsupported kernels/filesystems fail closed
rather than falling back to check-then-rename. The helper proves that the
moved directory has the admitted identity, proves the public `bin` name was
not recreated, and rescans every child before the first unlink. It then opens
every intermediate directory with `O_DIRECTORY | O_NOFOLLOW` and deletes only
through held parent descriptors. The quarantine boundary compares the stable
directory identity rather than treating a rename-permitted root-directory
timestamp change as content drift.

Pruning starts only after the installer has exited, inside one producer-owned
private disposable work root, before any publication. Stable owner-writer
settlement is therefore a precondition: the helper detects deterministic
replacement at every declared revalidation boundary, but does not claim
resistance to a hostile same-UID process mutating a pathname between the last
identity check and the kernel pathname operation. If exclusive ownership
cannot be established, the producer must not call pruning.

The helper tracks whether the first admitted entry has actually been removed.
Before that point, failure may restore only a root whose device, inode, type,
and mode still match admission, and restoration also uses no-replace rename.
After that point, failure deliberately leaves terminal quarantine residue and
the original `RECORD`; the generated work root is failed and disposable, so a
partial tree is never relabelled as public `bin` and can never verify or
publish. Verification rejects either public `bin` or quarantine residue.

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
- **A malformed `RECORD` or late pathname replacement causes partial or
  escaping deletion** → Validate the complete ownership/digest set, isolate
  the exact admitted tree by atomic no-replace descriptor-relative rename,
  rescan before the first unlink, delete only through held non-following
  descriptors, restore only before any successful deletion, and otherwise
  leave a terminal failed work root; only a fully successful deletion may
  atomically rewrite each surviving `RECORD`.
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
   dual-identity remote targeted acceptance refresh: the new acceptance-free
   product revision/tree supplies Updater bytes and the compatible control
   revision/tree supplies only the acceptance harness/lifecycle delta.
5. Update the Operations frozen-product receipt/build-definition and refresh
   lifecycle digests,
   then resume its unchanged independent candidate comparison.
6. If any gate fails, make no release/deployment/production-host mutation and correct
   only the responsible change.

## Open Questions

None.
