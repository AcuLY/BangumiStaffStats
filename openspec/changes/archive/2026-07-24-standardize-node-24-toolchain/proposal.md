## Why

The repository currently has no Node version pin and the interactive NVM
default is Node 20, which is EOL. The formal rewrite should use the current
supported Node 24 LTS patch before frontend tooling is installed.

## What Changes

- Install Node `24.18.0` with the existing NVM `0.40.3`.
- Add root `.nvmrc` and `.node-version`, both containing `24.18.0`.
- Set the local developer's NVM default alias to `24.18.0`.
- Verify fresh-shell, explicit `nvm use`, project-pin, npm, and OpenSpec
  execution under Node 24.
- Keep older runtimes installed; do not migrate globals or edit shell startup
  files.

Behavior classification:

- `PRESERVE_ORACLE`: no product, API, statistical, visual, interaction, copy,
  state, or responsive behavior changes from oracle
  `644b7748674e553f863d0ffd61d029f86fdc0717`.
- `INTENTIONAL_DELTA`: the supported project/default development runtime moves
  from Node 20 to Node `24.18.0`.
- `NEW_CAPABILITY`: reproducible repository Node pins and a supported runtime
  gate.

## Capabilities

### New Capabilities

- `frontend-node-toolchain`: Defines the supported Node version, repository
  pins, NVM installation/default, and verification gate for frontend tooling.

### Modified Capabilities

None.

## Impact

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: complete; verified: exact Node/default/project/fresh-shell/npm/OpenSpec/Git acceptance passed; committed: planning checkpoint `6b9c801`, while implementation/archive status is determined by the containing Git history; pushed: no; released: no; deployed: no |
| Owner | Main owns specification, approval, verification, staging, commits, and archive. The standard local tool update is a low-context reversible operation and may be performed directly by main. |
| Writable paths | Planning: `openspec/config.yaml` and the five artifacts under `openspec/changes/standardize-node-24-toolchain`. Apply repository: `.nvmrc`, `.node-version`, and task checkboxes. User-authorized tool paths: NVM-managed `/Users/luca/.nvm/versions/node/v24.18.0/**`, `/Users/luca/.nvm/.cache/**`, and `/Users/luca/.nvm/alias/default`. Accepted lifecycle: the exact active change, dated archive, and `openspec/specs/frontend-node-toolchain/spec.md`. |
| Read-only protected inputs | Product/design/planning documents, root contracts/specs, all application source, package manifests/locks, Git index and unrelated worktree state, shell startup files, NVM scripts, other installed runtimes/aliases, Homebrew, external repositories, remotes, and production state. |
| Deletion complement | Do not delete old runtimes, globals, shell files, application files, or unrelated NVM state. NVM may manage its own download-cache transient and replace only `alias/default`. Main may perform the exact OpenSpec archive lifecycle after acceptance. |
| Mutable refs | Main may move only local branch `refs/heads/codex/formal-rewrite` for the planning and final commits. No tag, remote ref, PR, release, or deployment. |
| Consumes | Current branch HEAD; official Node release status; installed NVM `0.40.3`; existing Node/NVM/default-alias state; approved artifacts. |
| Produces | Node `24.18.0`, root version pins, NVM default `24.18.0`, verification evidence, and accepted `frontend-node-toolchain`. |
| Dependencies | macOS arm64, working NVM, network access to Node's official distribution through NVM, and approved planning artifacts. Direction: this change → `refresh-impeccable-tooling` → frontend foundation. |
| Deliverables | One concise planning checkpoint, installed/pinned Node 24, verification results, archived capability, and downstream handoff. |
| Acceptance | `nvm use`, a fresh NVM shell, root pins, `node`, `npm`, and the absolute OpenSpec bridge resolve and run under Node `24.18.0`; unrelated repository and protected host state remain unchanged. |
| Non-goals | Product code, frontend dependencies, Impeccable files, global-package migration, NVM upgrade, shell repair, old-runtime cleanup, operations, or another repository. |
| Operations deferred | Push, PR, tag, release, deployment, production configuration/secrets/services/timers, cutover, and legacy deletion. |
| Stop/rollback conditions | Stop on branch/index/unrelated-dirt drift, failed official download/install, unexpected shell-file/global mutation, or failed verification. Roll back the default with standard `nvm alias default 20` and remove exact pins if needed; retain the installed Node tree rather than deleting broadly. |

Apply is blocked until proposal, spec, design, and tasks are complete,
strict-valid, reviewed, and approved by main. This change touches the explicitly
authorized local developer toolchain but no other repository or remote state.
