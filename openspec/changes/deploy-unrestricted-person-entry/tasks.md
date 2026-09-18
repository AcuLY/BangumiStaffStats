## Task boundary

| Field | Boundary |
|---|---|
| Status | User-authorized; operations preflight done; activation not started |
| Owner | Primary operations owner |
| Writable paths | This change/accepted spec; exact new release/bundle and state env/symlinks from proposal; installed common.sh default-only 30→75 update with backup/rollback; dedicated workspace toolchains/qa/evidence |
| Read-only protected inputs | Nginx/live Compose/config/scripts (except approved common.sh default-only update)/data/old releases/legacy/other services/credentials |
| Deletion complement | Owned temporary QA/builder and failed candidate only |
| Mutable refs | Current local phase commits, scoped remote feature ref, reviewed PR/master merge |
| Consumes | Strict reviewed feature and release specs, tested candidate and pinned tools |
| Produces | Accepted production application release and actual evidence; script publication is user-owned |
| Dependencies | Feature before build/release; readback after every external mutation |
| Deliverables | Working feature and verified rollback/non-interference |
| Acceptance | Commands and scenarios below |
| Non-goals | Data/route/unrelated-service/secret changes |
| Operations deferred | Any unnamed resource and any bypass of failed checks |
| Stop/rollback conditions | New approval denial, changed preimage, conflicting writer, failed gates → stop/rollback; no reset --hard, destructive checkout, git clean, git add -A or broad deletion |

## 1. Preflight and specification — primary

- [x] 1.1 Verify local master HEAD 0387cbf391da61df3afa6ae0a357d6a754905fd7 matches remote and only owned new feature docs were dirty before this change; preserve subsequent other-owner changes.
- [x] 1.2 Read deploy/check/rollback contract and identify live project/image/mounts/ports, env, frontend pointers, protected config hashes and free QA ports. Normal operations check, root and /old/ probes passed.
- [x] 1.3 Prepare isolated pinned Node24.18.0/npm11.16.0 and Go1.26.5; official Node archive SHA256 verified. No system or Hermes tool replacement.
- [x] 1.4 Primary reviewed scope, protected state, candidate gates and rollback ordering; `OPENSPEC_TELEMETRY=0 npm exec --yes --package=@fission-ai/openspec@1.6.0 -- openspec validate deploy-unrestricted-person-entry --strict` passed, and `git diff --check` was clean. Production remains unchanged.

- [ ] 1.5 Apply the user-authorized common.sh default-only 30→75 update: verify exact preimage and single substitution, save byte/metadata-preserving backup, install/read back candidate and syntax, verify production identity/readiness and all other protected files unchanged; keep explicit backup-based rollback. No service restart or other host-script/config update.

## 2. Verify and assemble — primary

- [ ] 2.1 Recheck branch/HEAD/allowed dirty state, reviewed feature status and complete affected acceptance. Await baseline checks before interpreting regressions. Record exact results, no assumed passes.
- [ ] 2.2 Verify existing authenticated GitHub tooling; inspect exact diff, commit owned paths, publish `feat/unrestricted-person-entry`, create/review PR and require applicable checks before merge. Read back exact remote refs/PR after mutation. Do not force push or modify mypc's original working tree.
- [ ] 2.3 Invoke existing `development-artifacts` workflow_dispatch on the accepted commit and obtain its operations-preview bundle, or run the same `operations/bin/build-bundle.sh` locally with pinned Buildx0.34.1/BuildKit0.27.1 in the isolated `bgmss-entry-builder` after documenting its preimage. Do not build from dirty/invented source identities. `GITHUB_SHA` is actual `git rev-parse HEAD`; `RUNNER_TEMP` is a verified dedicated workspace QA directory.
- [ ] 2.4 Verify `SHA256SUMS`, build.json revision/platform/components, API OCI labels and compatibility manifest; run existing artifact smoke/rollback checks. Record exact candidate bundle/root/revision and checksum. Keep failed or unrelated gate evidence explicit.
- [ ] 2.5 Verify built feature in desktop/mobile using isolated QA frontend/API or existing approved CI/browser facilities. If real Archive is read, QA must use app.RunWithOptions with nil ArchiveUpdater; ordinary cmd/api is forbidden against the live archive. Cover application entry/defaults for all five types, targets on/off-page/absent, NSFW-only, errors, changed selection and recovery. Script installation, download and bundling are excluded; preserve the existing script.

## 3. Activate and read back — primary only

- [ ] 3.1 Revalidate reviewed HEAD/bundle/strict specs and live state against captured preimage immediately before mutation. Save exact current.env/previous.env and both frontend symlink targets into new workspace evidence files; verify rollback image is still present. No credentials enter evidence.
- [ ] 3.2 Stage the verified bundle under `/srv/bgmss-v2/incoming/<actual-revision>` only if absent. Reverify checksums there; old incoming/release directories remain untouched.
- [ ] 3.3 Execute the existing `/srv/bgmss-v2/operations/bin/deploy` with root `/srv/bgmss-v2`, actual verified bundle/revision, project `bgmss-v2`, ports `18080`/`19090`, and Prometheus pin `prom/prometheus:v3.13.1-distroless@sha256:214f8427c8fba80c327bb94a75feb802ae12f2d6ca30812aa6e7d22f09bbea80`. Verify API readiness precedes frontend switch; use script recovery on failure.
- [ ] 3.4 Run `/srv/bgmss-v2/operations/bin/check --root /srv/bgmss-v2`; read actual API image/revision and frontend pointer, livez/readyz/catalog/metrics/Prometheus and recent logs. Verify restart policy and applicable restart recovery without daemon or unrelated-service restarts.
- [ ] 3.5 Verify public ranking/co-star, application entry for anime and the other four types, target present/absent and continued detail browsing. Script distribution is not an application release gate. Verify /old/ and unchanged Nginx/Compose hashes plus unrelated service identities. If functionality fails, invoke existing rollback-app and verify old image/frontend/health/routes; do not roll back data.

## 4. Acceptance closure — primary

- [ ] 4.1 Save exact verification evidence, sync accepted feature/release specs and archive only completed scopes; `openspec validate --all --strict` and `git diff --check` must pass. Preserve pre-existing active change states.
- [ ] 4.2 Remove/stop only explicitly owned temporary QA/builder resources, leaving production stable and rollback release retained. Read back after cleanup.
- [ ] 4.3 Report the actual production application URL, revision and tests; distinguish any remaining integration/release/browser limitations honestly.
