| Field | Declaration |
|---|---|
| Status | Apply pending. |
| Owner | Main agent directly owns all sequential groups. |
| Writable paths | Proposal writable paths and mutable refs only. |
| Read-only protected inputs | Proposal protected inputs only. |
| Deletion complement | Proposal deletion complement only. |
| Mutable refs | Proposal mutable refs only. |
| Consumes | Reviewed proposal/specs/design and recorded live preimages. |
| Produces | `/v2/` artifact, deployed release, reversible same-vhost path split, archived evidence. |
| Dependencies | 1 spec approval → 2 implementation → 3 green artifact/deploy → 4 cutover → 5 acceptance/archive. |
| Deliverables | Proposal deliverables only. |
| Acceptance | Proposal acceptance only. Commands/results SHALL distinguish implemented, verified, committed, pushed, and deployed. |
| Non-goals | Proposal non-goals only. |
| Operations deferred | Proposal deferred items only. |
| Stop/rollback conditions | Stop on any declared mismatch/failure. Never use `reset --hard`, checkout rollback, `git clean`, `git add -A`, broad recursive deletion, undeclared writes, or unrelated repair. |

## 1. Main-agent specification approval

- [x] 1.1 Verify branch `codex/minimal-single-host-ops`, HEAD `406fb5ae29acd34d1789efb5350b88c4703c1834`, allowed dirty state limited to this change, completed prior production activation, and no active conflicting owner; strict-validate the change/all specs and record zero P0/P1 findings.
- [x] 1.2 Commit/push only the reviewed OpenSpec planning block so implementation begins from an exact remote-visible specification.

## 2. Main-agent frontend and operations implementation

- [x] 2.1 Re-preflight the exact pushed specification commit and dirty-state absence; implement the normalized base-path utility, production `/v2/` Vite base, base-aware routes/share/header/API/image URLs, nested-base artifact smoke resolution, and focused root plus `/v2/` tests only in declared frontend paths.
- [x] 2.2 Update only the repository Nginx template/documentation for the legacy-root/new-`/v2/**` split, including prefix containment and rollback semantics.
- [x] 2.3 Review the exact diff for visual/interaction/state/contract/dependency drift; run non-build static checks locally only, then commit/push the implementation. Do not run Node, frontend, backend, container, or artifact builds on the local machine.
- [x] 2.4 Amend the exact artifact-checker scope after run `30469305349` proves all 376 frontend tests, typecheck, and Vite build green but the legacy root-only favicon resolver rejects `/v2/assets/**`; require the correction to accept only the exact `/v2/` prefix, strict-validate, commit, and push without a local build.

## 3. Actions artifact and transactional application deploy

- [ ] 3.1 Require exact-head Development Actions green, admit one exact `linux/amd64` bundle, and inspect its frontend index/assets plus metadata/checksums for source identity and `/v2/` base.
- [ ] 3.2 Re-preflight `myserver` boot/topology, `/srv/bgmss-v2` project/current/previous refs, loopback API/Prometheus, Archive version, legacy root/containers/stopped-loader identity, active Nginx hash, exact backup/candidate targets, capacity, and absence of undeclared collisions.
- [ ] 3.3 Transfer only the admitted bundle to one new exact incoming root and transactionally deploy it through the existing `operations/bin/deploy`; require unchanged real Archive plus healthy loopback API/catalog/metrics/Prometheus before any public routing write.

## 4. Atomic same-vhost path cutover

- [ ] 4.1 Recheck the active Nginx preimage, create one exact absent change-specific backup, render/retain the reviewed candidate, and prove its bounded diff changes only the `search.bgmss.fun` TLS path ownership while preserving auxiliary and unrelated routes.
- [ ] 4.2 Atomically install only after `nginx -t`; reload and content-probe legacy `/`, representative legacy asset/auxiliary routes, new `/v2/`, both new SPA modes, new static/deferred assets, `/v2/api/v1/catalog`, and image proxy. Restore/reload the exact backup and prove prior-state recovery on any failure.
- [ ] 4.3 Verify the final active/candidate hashes, both stacks, Archive, containers, timer/logrotate/Prometheus, and protected host identities have no undeclared drift.

## 5. Main-agent acceptance and lifecycle

- [ ] 5.1 Record exact implementation/Actions/artifact/deploy/Nginx/public evidence, complete all tasks, sync all three deltas to main specs, archive the change, and strict-validate all specs.
- [ ] 5.2 Commit/push only the lifecycle/evidence block, require remote equality and a clean worktree, then report the final legacy/new URLs and rollback state.
