## Task Boundary

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: no; verified: planning review and strict validation only; committed: no planning or implementation commit; pushed: no; released: no; deployed: no |
| Owner | Main owns this low-context standard tool update and all lifecycle work. |
| Writable paths | `.nvmrc`, `.node-version`, checkboxes below, NVM-managed v24.18.0/cache/default, exact archive/root-spec lifecycle. |
| Read-only protected inputs | All undeclared repository, host, external, remote, and production state. |
| Deletion complement | No old runtime/global/shell/app deletion; only NVM install transients, exact rollback pins, and accepted archive lifecycle. |
| Mutable refs | Local `codex/formal-rewrite` planning/final commits only. |
| Consumes | Approved planning commit, NVM `0.40.3`, official Node distribution. |
| Produces | Installed/pinned/default Node `24.18.0`, acceptance evidence, archived capability. |
| Dependencies | macOS arm64, NVM, official download. |
| Deliverables | Planning commit, verified tool update, final archive commit, Impeccable handoff. |
| Acceptance | Tasks and strict OpenSpec/Git verification pass; unrelated state is unchanged. |
| Non-goals | Product/dependency implementation, old-runtime deletion, operations. |
| Operations deferred | Push/PR/tag/release/deploy and production changes. |
| Stop/rollback conditions | Stop on drift/failure; restore default `20`, remove exact pins if uncommitted, retain Node 24 installation. |

## 1. Planning — main

- [x] 1.1 Verify branch, HEAD, empty index, allowed worktree state, official Node `24.18.0` Latest LTS status, NVM `0.40.3`, and current default `20`.
- [x] 1.2 Run targeted and repository-wide strict OpenSpec validation, doctor, `git diff --check`, and main semantic review.
- [ ] 1.3 Mark the four Status rows approved and commit only `openspec/config.yaml` plus this change's five artifacts as `docs(openspec): approve Node 24 toolchain`.

## 2. Standard NVM update — main

- [ ] 2.1 Recheck the planning commit, index/worktree envelope, NVM/default state, and official version immediately before mutation.
- [ ] 2.2 In a clean shell source `/Users/luca/.nvm/nvm.sh`, run `nvm install 24.18.0`, then `nvm alias default 24.18.0`; do not use global migration flags.
- [ ] 2.3 Use `apply_patch` to add `.nvmrc` and `.node-version` with exact `24.18.0\n`.

## 3. Acceptance — main

- [ ] 3.1 Verify installed/default/project/fresh-shell Node `v24.18.0` and bundled npm; record the inherited-process restart caveat.
- [ ] 3.2 Run targeted/all strict OpenSpec validation and doctor with absolute Node `24.18.0`, plus `git diff --check` and exact status/diff checks.
- [ ] 3.3 Verify startup files, older runtimes/aliases, manifests/locks, application files, remotes, and production state were not changed.
- [ ] 3.4 Update the four Status rows truthfully, sync/archive the capability, stage only the accepted envelope, and commit `chore(toolchain): standardize Node 24.18.0` without push.

Rollback before acceptance uses standard `nvm alias default 20` and removes
only exact uncommitted pins. The installed Node 24 tree is retained.
