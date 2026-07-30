## Why

The accepted Updater runtime bundle retains installer-generated console
scripts whose shebang embeds the absolute Python interpreter path. Two builds
from different checkout roots therefore produce different bytes even though
their declared source, lock, target, and toolchain identities are identical,
blocking the Operations cross-checkout reproducibility gate.

## What Changes

- Remove installer-generated root-level runtime `bin/**` files that are not
  part of the supported Updater runtime interface.
- Remove the corresponding rows from each installed distribution `RECORD`
  before verifying the pruned runtime.
- Reject an accepted pruned runtime if a root-level installer script directory
  or absolute interpreter shebang remains.
- Add focused producer-shaped tests for removal, `RECORD` integrity, symlink
  rejection, and independence from distinct absolute interpreter paths.
- Re-run exact-head Development Actions and a separately specified
  same-product, dual-identity remote targeted acceptance refresh before
  Operations updates its frozen product receipt and resumes candidate
  assembly. The acceptance-free product revision owns Updater checks; a later
  compatible control revision owns the acceptance harness and may differ only
  by its closed harness/lifecycle paths.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `updater-build-artifact`: Strengthen deterministic runtime packaging so
  installer-generated console scripts and their absolute interpreter paths
  cannot enter the native bundle or OCI runtime.

## Impact

| Field | Declaration |
|---|---|
| Status | Root cause investigated, specified, implemented, zero-P0/P1 audited, committed, pushed, exact-head Development verified, synchronized, and archived: yes; verified Product `4b5bdf9f27ea0e3db95009a7fcb3ef912c3948c2` / tree `72028c6356616bf0e5905529d807247ad390af9e`, Actions run `30373636575`; released and deployed: no. |
| Owner | Updater artifact apply owner; the main agent owns this specification, coordination, audit, and acceptance. |
| Writable paths | `updater/build/runtime_prune.py`, `updater/build/test_artifact.py`, and this active change. Later lifecycle work may synchronize only `openspec/specs/updater-build-artifact/spec.md` and archive this change. |
| Read-only protected inputs | All other repository paths, including `updater/build/artifact.py`, `updater/build/check.py`, `updater/Dockerfile`, Updater source/configuration/lock/README/tests outside the exact writable files, all Backend/Frontend/Contracts/Operations implementation, root authorities, other OpenSpec, external repositories, hosts, services, and production state. |
| Deletion complement | No tracked file or directory. Generated deletion is limited to the installed runtime root's exact real `bin/**` subtree and its exact `RECORD` rows before artifact publication. |
| Mutable refs | None during apply. The main agent may later commit and push the reviewed branch, then update Operations acceptance metadata in its separately approved change after exact-head Development success. |
| Consumes | The accepted `updater-build-artifact` capability; frozen `uv.lock`; uv 0.11.32 target-install behavior; existing runtime-prune verification; the observed Operations failure at product revision `3f585cfe0a0dd61fe783a839528fef25470a58db`. |
| Produces | A path-independent pruned native/OCI runtime closure and focused regression evidence. |
| Dependencies | The active `implement-operations-foundation-and-isolated-validation` candidate build pauses until this correction is implemented and synchronized/archived, exact-head Development is green, a separate acceptance-refresh OpenSpec closes dual-identity same-product remote targeted evidence, and the main agent approves updated frozen-product acceptance bytes. |
| Deliverables | The two exact implementation/test files, one modified capability delta, strict-valid planning artifacts, exact-head Actions evidence, and clean residue/diff evidence. |
| Acceptance | Static syntax and strict OpenSpec checks locally; exact-head Development Actions must pass the complete Updater artifact/reproducibility gates. A separate acceptance-refresh change must bind one acceptance-free product revision/tree and one compatible acceptance-control revision/tree: product checks run from the former, package/supervisor/targeted harness checks run from the latter, and an exact Git byte/mode comparison proves every non-harness/lifecycle product path identical before receipt rebinding. After Operations rebinds its frozen product, its two distinct checkout/cache/build sets must produce byte-and-mode-identical Updater component roots. |
| Non-goals | No package/dependency/version change; no Updater product, Archive, API, schema, CLI, scheduling, acquisition, activation, UI, or statistical behavior change; no weakening or bypass of the Operations comparison; no claim of resistance to a hostile same-UID writer inside the producer-owned private work root after writer settlement. |
| Operations deferred | Release, registry publication, production deployment/activation, Nginx/systemd/TLS/users/firewall/public-route changes, scheduling, cutover, and legacy retirement remain outside this correction. |
| Stop/rollback conditions | Stop on a required edit outside the exact writable paths, loss of `RECORD` integrity, removal of an imported runtime module, surviving installer script/shebang, dependency or public behavior drift, non-determinism, or any external mutation need. Roll back only this owner's uncommitted exact paths and generated ignored Updater build output. |

Externally visible behavior is `PRESERVE_ORACLE`: the immutable prototype
oracle `644b7748674e553f863d0ffd61d029f86fdc0717` remains unchanged because the
removed installer scripts are not a supported product interface. This change
touches no other repository or external state. Apply is blocked until
proposal, specification, design, and tasks are complete, strictly valid, and
approved by the main agent.
