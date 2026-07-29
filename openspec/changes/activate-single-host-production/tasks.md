| Field | Declaration |
|---|---|
| Status | Apply-ready only after strict validation and explicit main-agent approval. |
| Owner | Main agent: spec/audit/task state/Git/acceptance. Deployment subagent: exact `myserver` implementation. |
| Writable paths | This change, exact local `/tmp/bgmss-production-artifact-30426027299`, only the running-to-stopped state of legacy loader container ID `84d7ca5dcf10b5aae2eb44bf942f2730c3a155ae771aec57946ddfea1eff2bc9` after its labels and protected fields still match baseline, and the exact `myserver` paths/objects declared by proposal/spec, including the fixed remote incoming and Nginx temporary paths. |
| Read-only protected inputs | Accepted repository bytes/artifact; legacy stack/root except exact loader running-state transition; loader image/labels/policy/mounts/config/data; TLS material; and every undeclared host/repository object. |
| Deletion complement | No protected object; only exact new-project stop/removal and exact Nginx restore are admitted. |
| Mutable refs | Change lifecycle, branch commit/push, new runtime refs/project, exact legacy-loader running-to-stopped state, exact Nginx active file/backup, and new timer links. |
| Consumes | Run `30426027299`, source `bd3197d639a32831f3fbcfab698cc387393d2928`, expanded `myserver`, pinned Prometheus image, existing TLS vhost. |
| Produces | Live new stack with real Archive, planned observability, reversible traffic routing, and retained legacy rollback. |
| Dependencies | Strict-valid approval → host/artifact preflight → private deploy → real Archive → host integration → cutover/rollback drill → final audit. |
| Deliverables | Proposal deliverables only. |
| Acceptance | Delta scenarios, unchanged runtime checks, exact state report, archive, commit, and push. |
| Non-goals | Proposal non-goals only. |
| Operations deferred | Proposal deferred items only. |
| Stop/rollback conditions | Stop before writes on drift; restore exact legacy Nginx state on any cutover failure; never mutate protected state to force progress. |

## 1. Main-agent specification approval

- [x] 1.1 Review proposal, delta spec, design, tasks, exact host scope, known-failure exclusions, first-real-Archive gate, and rollback drill; run change and all-spec strict validation and record zero P0/P1 findings.
- [x] 1.2 Verify branch `codex/minimal-single-host-ops`, repository HEAD, allowed dirty state limited to this change, green run/artifact identity, and no implementation-byte drift; explicitly approve apply or stop.

## 2. Deployment-owner admission and artifact transfer

- [x] 2.1 Re-preflight exact local transfer-root absence plus `myserver` boot ID, architecture, exact `MemTotal`/`MemAvailable` byte gates, disk, Docker/Compose/Nginx/tools, exact root/project/ports/backup/temporary/unit/logrotate absences, all declared legacy identities/content markers/probes, active Nginx hash, and exact pre-existing top3/proxy exclusions before any write.
- [x] 2.2 Download Actions run `30426027299` artifact ID `8713954047` with its exact admitted name only to `/tmp/bgmss-production-artifact-30426027299`, verify source revision, platform, closed inventory, and all checksums locally, then create and transfer only to `/srv/bgmss-v2/incoming/run-30426027299`.

## 3. Deployment-owner private production activation

- [x] 3.1 Create the exact `/srv/bgmss-v2` layout and permissions, install reviewed operations/config bytes, seed the bundle fixture, and deploy source `bd3197d639a32831f3fbcfab698cc387393d2928` as project `bgmss-v2` on `127.0.0.1:18080/19090`.
- [x] 3.2 Verify Compose hardening/resources/mounts/log driver, API live/ready/catalog/metrics, Prometheus readiness/scrape, journald logs, and unchanged legacy state before running the updater.
- [x] 3.3 Re-inspect legacy loader container ID `84d7ca5dcf10b5aae2eb44bf942f2730c3a155ae771aec57946ddfea1eff2bc9`, require it to still be running with project `bgmss`/service `loader` labels and image/restart-policy/mounts/config equal to the recorded baseline, stop only that literal ID under the user's explicit authorization, require the same protected fields to remain unchanged while it stays present but stopped, and verify the old API/MySQL/Redis serving path remains healthy.
- [ ] 3.4 Record the single failed updater run `72f6dc91-2738-4388-9f0b-a9d7a3d388c7` and its no-publication `HTTPS_REQUEST_FAILED` state; keep further updater execution and all 4.x work blocked until an exact reviewed transport resolution amends this change, then require terminal success, a valid active data version unequal to the minimal fixture, matching readiness/catalog/metrics/scrape versions, and safe post-update memory/OOM state.

## 4. Deployment-owner host integration and traffic cutover

- [ ] 4.1 Install and validate the exact updater systemd unit/timer and Nginx logrotate file, leave global journald unchanged, reload only the systemd manager, use `systemctl enable` without starting the timer, and verify it is enabled but inactive.
- [ ] 4.2 Recheck the active Nginx preflight hash, create a hash-equal exact backup, render a structure/diff-bounded candidate below `/srv/bgmss-v2`, activate through the exact same-directory temporary, validate/reload it, and require new frontend byte hash plus real-version catalog JSON while preserving declared legacy bytes/probes; automatically restore the backup on any failure.
- [ ] 4.3 Drill one atomic Nginx rollback to the hash-equal legacy backup with captured old-frontend/healthy-route probes, then validate/reapply the retained candidate with new-frontend/catalog probes; leave the legacy configuration active if either direction fails.

## 5. Main-agent production acceptance and lifecycle

- [ ] 5.1 Independently audit private/public health, real data version, same-ID/same-policy legacy loader intentionally stopped, Prometheus and Compose journald logs, enabled-inactive timer, logrotate, memory/OOM, other Docker identities, exact Nginx candidate/active/backup hashes and bounded diff, rollback command, legacy coexistence, known exclusions, unchanged global journal configuration, and zero undeclared writes or deletions.
- [ ] 5.2 Record investigated/implemented/verified/deployed states, synchronize the operations delta, archive this completed change, run strict all-spec and diff checks, narrowly stage/commit/push only the OpenSpec lifecycle, and report remaining deferred items.
