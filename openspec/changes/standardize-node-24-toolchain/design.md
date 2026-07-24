## Context

Node `24.18.0` is the current Latest LTS; Node 20 is EOL. NVM `0.40.3` is
already installed, and Node `24.16.0` is available as a bootstrap runtime.
This change uses standard NVM behavior instead of custom filesystem mutation.

## Change Boundary

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: no; verified: planning review and strict validation only; committed: no planning or implementation commit; pushed: no; released: no; deployed: no |
| Owner | Main owns the concise spec, standard NVM update, acceptance, and lifecycle. |
| Writable paths | Planning: `openspec/config.yaml` and the five active change artifacts. Apply: `.nvmrc`, `.node-version`, task checkboxes, NVM-managed target/cache, and `alias/default`. Lifecycle: exact dated archive and root capability spec. |
| Read-only protected inputs | All application/product/design/contracts content, manifests/locks, unrelated Git state, startup files, NVM scripts, older runtimes/aliases, Homebrew, external repos, remotes, and production. |
| Deletion complement | No old runtime, global, shell file, application file, or unrelated cache is deleted. NVM may clean only its own install transient and replace `alias/default`; archive may remove only this accepted active change. |
| Mutable refs | Local `codex/formal-rewrite` for exact planning/final commits only. |
| Consumes | Approved change, official release status, NVM `0.40.3`, current local runtime/default state. |
| Produces | Node `24.18.0`, two pins, NVM default, accepted capability, downstream handoff. |
| Dependencies | macOS arm64, NVM, official Node download availability. Direction: Node toolchain → Impeccable v4 → frontend foundation. |
| Deliverables | Planning commit, standard installation, verification, archive/root spec, final commit. |
| Acceptance | Exact pins and Node/default/project/fresh-shell/OpenSpec resolution pass; no unrelated diff or protected mutation. |
| Non-goals | Product implementation, frontend package selection, NVM/shell redesign, old-runtime deletion, operations. |
| Operations deferred | Push/PR/tag/release/deploy and all production/host operations beyond this local tool update. |
| Stop/rollback conditions | Stop on unexpected drift or verification failure; restore default with NVM and remove only exact pins, retaining installed Node. |

## Decisions

### Use standard NVM installation and alias commands

Run the existing NVM implementation in a clean shell:

```sh
source /Users/luca/.nvm/nvm.sh
nvm install 24.18.0
nvm alias default 24.18.0
```

This is the maintained path for an explicitly authorized local tool update.
No custom alias writer, archive extractor, inode/xattr protocol, or global
package migration is introduced.

### Pin the repository at the exact patch

`.nvmrc` and `.node-version` both contain:

```text
24.18.0
```

The exact patch keeps local shells, IDEs, and CI-compatible version managers
aligned. Floating `24` or `lts/*` aliases are not used as project pins.

### Keep rollback narrow

If acceptance fails, restore the previous default with
`nvm alias default 20` and remove only the two exact uncommitted pins. Keep the
installed Node 24 tree for inspection or later reuse; do not recursively delete
NVM state.

## Verification

After installation:

1. verify `nvm version 24.18.0`, `nvm alias default`, and both pin bytes;
2. verify an explicitly initialized clean NVM shell resolves Node `v24.18.0`;
3. verify repository `nvm use` resolves the same runtime and expected bundled
   npm;
4. run strict targeted/all OpenSpec validation and doctor with absolute Node
   `24.18.0` plus the existing read-only OpenSpec `1.6.0` JS entrypoint;
5. verify Git diff/status contains only the declared paths.

## Risks / Trade-offs

- NVM download failure stops the change without a fallback mirror.
- The already-running Codex process may retain its inherited Node 20 PATH until
  a later application restart; fresh-shell and absolute-path checks are the
  acceptance authority.
- Standard NVM may update its own cache. That cache is tool-owned and is not a
  repository artifact.

## Migration Plan

1. Approve and commit this concise OpenSpec.
2. Install Node, set the default alias, and create pins.
3. Run the verification matrix.
4. Sync/archive and commit the accepted result.
5. Rebind the Impeccable change to the resulting commit and proceed.

## Open Questions

None.
