| Field | Declaration |
|---|---|
| Status | User-authorized production repair; tasks remain incomplete until their observed evidence is recorded. |
| Owner | Main agent; Backend and Operations groups execute sequentially with no subagent. |
| Writable paths | Exact repository, branch, GitHub, and host paths/refs declared in proposal/design. |
| Read-only protected inputs | Existing contracts/generated consumers, production Archive, host configuration, current/previous release contents, Nginx/systemd/timers, unrelated containers, and legacy application. |
| Deletion complement | Exact run-owned downloaded bundle and remote incoming transfer root after success; existing deploy cleanup for an inactive failed candidate only. |
| Mutable refs | Local/remote repair branch, GitHub manual run/artifact, and deploy-owned current/previous application refs. |
| Consumes | Strict-valid planning, current master/deployed state, existing artifact workflow, and existing deploy/rollback commands. |
| Produces | Contract-conforming Backend Product commit, admission commit, one green manual run and bundle, deployed revision, and acceptance/lifecycle evidence. |
| Dependencies | Group 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. No later group may begin if its predecessor is not accepted. |
| Deliverables | Proposal and design deliverables only. |
| Acceptance | Exact tests/workflows/checksums/live API/browser/host/non-interference evidence; states must distinguish investigated, implemented, verified, committed, pushed, artifact-admitted, deployed, and archived. |
| Non-goals | Contract/frontend/topology/Archive/Nginx/timer/legacy changes, unrelated post-production fixes, PR/merge/tag/release, or cleanup outside exact run-owned artifacts. |
| Operations deferred | Every operation not explicitly named in groups 5–8. |
| Stop/rollback conditions | Stop on branch/HEAD/dirty-state/artifact/host drift or any failed gate. Never use reset hard, checkout rollback, git clean, git add -A, broad deletion, Archive-pointer mutation, or undeclared writes. Use only existing application rollback after activation. |

## 1. Planning and authority

- [x] 1.1 Preflight branch `codex/deploy-person-detail-warning-fix` at master `94329c934867302113107d758e5658d7aa05cd1a`, require dirty state limited to this change’s planning artifacts, confirm no active conflicting change, and inspect the existing contract, deployed implementation, public response, current/previous release state, and user authorization. Preflight observed no active change in this worktree; production remained `a714fe7e865c93a4c2f4ed4b9dcbf2ef9ea7286a` with `1150a94e77dcd7e269bf58a96f5df93ba451882a` previous, and the live `lucay126` detail response returned HTTP 200 with `warningCodes: null`.
- [x] 1.2 Complete proposal, delta spec, design, and tasks; run `npx --yes @fission-ai/openspec@1.7.0 validate repair-person-detail-warning-wire --strict` and main-agent review; record zero P0/P1 findings before product edits. OpenSpec 1.7.0 reported the change valid and apply-ready; main-agent boundary/dependency/rollback review found zero P0/P1 findings.

## 2. Backend person-detail producer

- [x] 2.1 Re-preflight exact branch/HEAD and planning-only dirty state, then add the focused fresh personal collection regression in `backend/internal/persondetail/service_test.go` without touching contracts or generated consumers. Preflight bound HEAD `94329c934867302113107d758e5658d7aa05cd1a`; only the active planning root was dirty before the test edit.
- [x] 2.2 Prove RED by running only `TestServicePersonalUsesOneAdmittedCollectionAndEmitsCompleteEvidence` against the deployed nil-slice behavior, change only the clone allocation in `backend/internal/persondetail/service.go`, and prove GREEN with the focused test plus `go test ./internal/persondetail -count=1`. RED failed at `service_test.go:247` because the fresh warning slice was nil; after the one-line allocation correction, focused and complete `internal/persondetail` tests passed.
- [x] 2.3 Review exact diff and `git diff --check`; require strict OpenSpec validation, no unrelated paths, no contract/frontend change, and clean generated residue before committing the planning plus Backend Product candidate. Review found only the two declared Backend files plus the active planning root, strict validation and diff hygiene passed, and no contract/frontend/generated path changed.

## 3. Product candidate admission

- [ ] 3.1 Push only `refs/heads/codex/deploy-person-detail-warning-fix`, verify remote equality, and require the exact Product candidate’s `development-artifacts` push run to complete successfully; do not dispatch or admit a bundle yet.
- [ ] 3.2 Inspect the Product run’s Backend, Frontend, Updater, Contracts, artifact-smoke, and residue jobs; record exact run/commit evidence and stop on any non-green required gate.

## 4. Operations bundle pin

- [ ] 4.1 Re-preflight the exact green Product commit and clean worktree, then change only `operations/bin/build-bundle.sh`’s accepted Product revision to that exact 40-hex commit while preserving every other admission/policy byte.
- [ ] 4.2 Run `bash operations/test/runtime.sh`, strict OpenSpec validation, shell syntax, exact one-line pin diff, `git diff --check`, and zero-P0/P1 review; commit/push the admission change and verify remote equality.

## 5. Exact AMD64 artifact

- [ ] 5.1 Manually dispatch `ci.yml` for the repair branch, require the exact admission commit’s complete Product job and `operations-preview / build one linux/amd64 operations bundle` job to succeed, and record run/job/artifact identities.
- [ ] 5.2 Download the one-day `operations-preview-<source-revision>` artifact into an exact run-owned local root; verify closed inventory, `SHA256SUMS`, `build.json` source revision/tree/platform/image names, frontend `/v2/` entry assets, and non-fixture deployment metadata before any host write.

## 6. Production preflight and transaction

- [ ] 6.1 On `myserver`, bind `/srv/bgmss-v2`, project `bgmss-v2`, ports `18080`/`19090`, Prometheus pin, current/previous revisions and refs, current real Archive data version, operation lock availability, release/incoming-path absence, disk capacity, container identities, `/livez`, `/readyz`, catalog, metrics, Prometheus, recent logs, public legacy `/`, and public `/v2/`; stop on drift.
- [ ] 6.2 Transfer only the admitted bundle to absent `/srv/bgmss-v2/incoming/run-<run-id>/`, reverify checksum/metadata on-host, and invoke the existing `/srv/bgmss-v2/operations/bin/deploy` with unchanged root/project/ports/Prometheus/profile inputs. Require the new revision current and the preimage retained as previous; do not run updater or mutate Nginx/data.

## 7. Live acceptance and cleanup

- [ ] 7.1 Re-run the `lucay126` personal rankings/detail flow and assert raw HTTP 200, schema-valid `warningCodes: []`, correct person identity, and no `null`; verify a second request/cache hit remains valid.
- [ ] 7.2 Verify in a fresh browser that personal ranking selection renders the inspector with no “人物详情加载失败” or console error; close the task-opened browser afterward.
- [ ] 7.3 Run the host operations check; verify current revision/image label, current/previous refs, `/livez`, `/readyz`, catalog/data-version agreement, metrics, Prometheus target, recent logs without new panic/5xx, public legacy root, V2 entry/deferred asset/API, and unchanged Archive/Nginx/legacy identities.
- [ ] 7.4 Remove only the exact run-owned incoming transfer and local downloaded artifact after acceptance; confirm no operation lock/temp candidate residue and retain the previous release for rollback.

## 8. Specification lifecycle

- [ ] 8.1 Record exact Product/admission/manual-run/artifact/deploy/browser/host evidence in this task file, sync the delta into `openspec/specs/backend-person-detail-api/spec.md`, mark all tasks honestly, archive the change, and run strict validation for all specs.
- [ ] 8.2 Commit/push only lifecycle/spec evidence, verify remote equality and clean hotfix worktree, then report deployed revision, rollback revision, and any intentionally unmerged/deferred state without claiming merge/tag/release.
