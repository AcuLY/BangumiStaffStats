| Field | Declaration |
|---|---|
| Status | Production accepted, archived, and lifecycle-pushed. |
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
- [x] 2.5 Record that run `30469940208` passed the complete Product job but the bundle assembler rejected the legitimate Product delta against its prior reviewed revision; advance only `operations/bin/build-bundle.sh`'s accepted Product revision to exact green implementation commit `6dd47e3b34a0fdb035f3c2a13fd84e7cc8eb2af8`, preserving every other admission/policy check, then strict-validate, review, commit, and push.
- [x] 2.6 Record the remote isolated Nginx regression proving `/v2/ranking` reaches the new index while exact `/v2/` internally falls into the legacy index; add one exact `/v2/` new-index location to the declared Nginx template/candidate, preserve every other route byte, and require remote syntax plus content-hash validation before commit/push.

## 3. Actions artifact and transactional application deploy

- [x] 3.1 Require exact-head Development Actions green, admit one exact
  `linux/amd64` bundle, and inspect its frontend index/assets plus
  metadata/checksums for source identity and `/v2/` base. Run `30480275932`
  passed Product and bundle jobs at
  `ae70b2ada2529741bfc8bcfd4a248835bb2f915d`; artifact `8735918334`
  declared source tree `4bd528a2a8d73a1aedebe3d7bd34271ab3c32c5f`,
  passed checksums, and referenced only the reviewed `/v2/assets/**` entry
  files.
- [x] 3.2 Re-preflight `myserver` boot/topology, `/srv/bgmss-v2` project/current/previous refs, loopback API/Prometheus, Archive version, legacy root/containers/stopped-loader identity, active Nginx hash, exact backup/candidate targets, capacity, and absence of undeclared collisions. The preflight bound data version
  `dv1-9d794033f12b8bcd60d8c890115a76ca52060ae13b357b3c32e036f94bb67888`,
  legacy root index `465c124b…`, new index `d561e410…`, active Nginx
  `6fe8171e…`, candidate `d013b166…`, and the stopped loader
  `84d7ca5dcf10…`.
- [x] 3.3 Transfer only the admitted bundle to one new exact incoming root and transactionally deploy it through the existing `operations/bin/deploy`; require unchanged real Archive plus healthy loopback API/catalog/metrics/Prometheus before any public routing write. The bundle was reverified below
  `/srv/bgmss-v2/incoming/run-30480275932/`; the normal deploy command made
  `ae70b2ada2529741bfc8bcfd4a248835bb2f915d` current and retained
  `9a5884048f6ed19d086f899f6459a8080683bb0a` as previous with the real
  Archive and all loopback gates unchanged.

## 4. Atomic same-vhost path cutover

- [x] 4.1 Recheck the active Nginx preimage, create one exact absent change-specific backup, render/retain the reviewed candidate, and prove its bounded diff changes only the `search.bgmss.fun` TLS path ownership while preserving auxiliary and unrelated routes. The retained final preimage is
  `/srv/bgmss-v2/incoming/run-30480275932/nginx.conf.path-split-final-preimage`
  with SHA-256 `6fe8171e…`; the reviewed candidate and final active bytes are
  `d013b166…`.
- [x] 4.2 Atomically install only after `nginx -t`; reload and content-probe legacy `/`, representative legacy asset/auxiliary routes, new `/v2/`, both new SPA modes, new static/deferred assets, `/v2/api/v1/catalog`, and image proxy. Restore/reload the exact backup and prove prior-state recovery on any failure. Two fail-closed probe-script mismatches exercised exact restoration before the
  corrected target-state probe passed. Final public evidence is legacy root
  `465c124b…`, new `/v2/` plus both SPA modes `d561e410…`, same-origin
  `/v2/api/v1/catalog` at the accepted data version, and image HTTP 200
  `image/jpeg` with 32959 bytes; legacy auxiliary statuses remained
  `/statistics` 404, `/timeline` 400, and `/proxy` 502.
- [x] 4.3 Verify the final active/candidate hashes, both stacks, Archive, containers, timer/logrotate/Prometheus, and protected host identities have no undeclared drift. Nginx, Docker, qiblood, and the new weekly Archive timer are
  active and enabled; the timer next fires on 2026-08-02, Prometheus reports
  the API target `up`, API/Prometheus remain restartable, legacy bgmtl and
  bgmss app containers retain `unless-stopped`, and the deliberately retired
  loader remains manually stopped with its admitted `unless-stopped` policy.

## 5. Main-agent acceptance and lifecycle

- [x] 5.1 Record exact implementation/Actions/artifact/deploy/Nginx/public
  evidence, complete all tasks, sync all three deltas to main specs, archive
  the change, and strict-validate all specs. The three deltas were merged into
  their main specs, this change was archived at
  `openspec/changes/archive/2026-07-30-route-new-ui-under-v2`, and strict
  validation passed with zero failures.
- [x] 5.2 Commit/push only the lifecycle/evidence block, require remote equality
  and a clean worktree, then report the final legacy/new URLs and rollback
  state. Lifecycle archive/spec commit
  `2ebee00a7752ed5472e58d97016ecd380fd2f042` was pushed before this sole
  completion-marker follow-up; final remote equality and a clean worktree are
  required for handoff.
