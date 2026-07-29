| Field | Declaration |
|---|---|
| Status | B2 private apply and one safe proxy updater failure complete; timestamp-fix artifact deployment and public integration await amended-change commit/push. |
| Owner | Main agent directly owns spec, task state, Git, exact `myserver` implementation, audit, and acceptance. |
| Writable paths | This change, exact local `/tmp/bgmss-production-artifact-30449279352`, existing `/srv/bgmss-v2` only through declared transactions, exact new incoming `/srv/bgmss-v2/incoming/run-30449279352`, and the exact `myserver` paths/objects declared by proposal/spec, including the Nginx temporary path. Installed operations/proxy definitions remain read-only. |
| Read-only protected inputs | Accepted repository/artifact bytes outside the closed inventory; historical current release; legacy stack/root; loader image/labels/policy/mounts/config/data; existing proxy/network lifecycle/config/credentials; TLS material; and every undeclared host/repository object. |
| Deletion complement | No protected object and no removal of the existing `bgmss-v2` project/root; deployment restores exact B2 application/env state and may remove only identity-matching new run-owned temporaries, while cutover failure restores exact Nginx bytes. |
| Mutable refs | Change lifecycle, branch commit/push, runtime refs/project only through declared transactions, exact Nginx active file/backup, and new timer links. |
| Consumes | Current private B2 `016160f7a63d68639a50e226c052fe75d5888f5f`; accepted product `8282996f3f0cb0e2cde2a91ce71d425217ffa9d6`; replacement run `30449279352`, source `be48847bc26bcda28c9f08f6807f5dec40d479f4`, artifact `8723283346`; failed updater UUID `1f1ef640-6ece-4c53-8cf1-2df480746891`; exact `proxy-net`/`http://myserver-proxy:7897`; expanded `myserver`; pinned Prometheus image; existing TLS vhost. |
| Produces | Live new stack with real Archive, planned observability, reversible traffic routing, and retained legacy rollback. |
| Dependencies | Timestamp-fix/activation lifecycle strict-valid/zero-P0/P1/commit/push → exact B2/status/artifact/operations/proxy preflight → transactional deploy → one new updater invocation/real Archive → host integration → cutover/rollback drill → final audit. |
| Deliverables | Proposal deliverables only. |
| Acceptance | Delta scenarios, unchanged runtime checks, exact state report, archive, commit, and push. |
| Non-goals | Proposal non-goals only. |
| Operations deferred | Proposal deferred items only. |
| Stop/rollback conditions | Stop before writes on drift; restore exact legacy Nginx state on any cutover failure; never mutate protected state to force progress. |

## 1. Main-agent specification approval

- [x] 1.1 Review proposal, delta spec, design, tasks, exact host scope, known-failure exclusions, first-real-Archive gate, and rollback drill; run change and all-spec strict validation and record zero P0/P1 findings.
- [x] 1.2 Verify branch `codex/minimal-single-host-ops`, repository HEAD, allowed dirty state limited to this change, green run/artifact identity, and no implementation-byte drift; explicitly approve apply or stop.
- [x] 1.3 Strict-validate and independently review the proxy recovery amendment, sync/archive `support-explicit-updater-proxy`, narrowly commit/push only OpenSpec lifecycle bytes, and require the remote branch to equal that commit before recovery writes.
- [x] 1.4 Strict-validate/review the timestamp correction and exact production amendment, sync/archive `accept-official-archive-asset-timestamps`, narrowly commit/push only OpenSpec lifecycle/handoff bytes, and require the remote branch to equal that commit before the newly authorized deployment or updater invocation.

## 2. Deployment-owner admission and artifact transfer

- [x] 2.1 Re-preflight exact local transfer-root absence plus `myserver` boot ID, architecture, exact `MemTotal`/`MemAvailable` byte gates, disk, Docker/Compose/Nginx/tools, exact root/project/ports/backup/temporary/unit/logrotate absences, all declared legacy identities/content markers/probes, active Nginx hash, and exact pre-existing top3/proxy exclusions before any write.
- [x] 2.2 Download Actions run `30426027299` artifact ID `8713954047` with its exact admitted name only to `/tmp/bgmss-production-artifact-30426027299`, verify source revision, platform, closed inventory, and all checksums locally, then create and transfer only to `/srv/bgmss-v2/incoming/run-30426027299`.
- [x] 2.3 Recheck the exact historical private baseline/collisions; admit run `30444069918` artifact `8721121158` plus the declared three-file operations inventory, create `/srv/bgmss-v2/incoming/run-30444069918`, and transfer the exact closed bundle/operations bytes while preserving historical operations for rollback.
- [ ] 2.4 Recheck exact B2 current/previous env hashes, failed status/minimal-only data, installed operations hashes/modes, collision paths, and absent run `30449279352`; admit artifact `8723283346` from `/tmp/bgmss-production-artifact-30449279352` with exact run/name/source/tree/platform/nine-file inventory/eight checksums, then create and transfer only to `/srv/bgmss-v2/incoming/run-30449279352`.

## 3. Deployment-owner private production activation

- [x] 3.1 Create the exact `/srv/bgmss-v2` layout and permissions, install reviewed operations/config bytes, seed the bundle fixture, and deploy source `bd3197d639a32831f3fbcfab698cc387393d2928` as project `bgmss-v2` on `127.0.0.1:18080/19090`.
- [x] 3.2 Verify Compose hardening/resources/mounts/log driver, API live/ready/catalog/metrics, Prometheus readiness/scrape, journald logs, and unchanged legacy state before running the updater.
- [x] 3.3 Re-inspect legacy loader container ID `84d7ca5dcf10b5aae2eb44bf942f2730c3a155ae771aec57946ddfea1eff2bc9`, require it to still be running with project `bgmss`/service `loader` labels and image/restart-policy/mounts/config equal to the recorded baseline, stop only that literal ID under the user's explicit authorization, require the same protected fields to remain unchanged while it stays present but stopped, and verify the old API/MySQL/Redis serving path remains healthy.
- [x] 3.4 Record direct updater run `72f6dc91-2738-4388-9f0b-a9d7a3d388c7`, terminal `HTTPS_REQUEST_FAILED`, no publication, unchanged minimal fixture, and no public cutover.
- [x] 3.5 Install only the three admitted operations definitions with exact modes, transactionally deploy B2 to the same root/project/ports using `--updater-transport proxy --updater-https-proxy http://myserver-proxy:7897 --updater-proxy-network proxy-net`, and verify only updater receives the exact URL/network while API and Prometheus remain excluded.
- [x] 3.6 Invoke updater exactly once after B2 private/proxy projection checks; record run `1f1ef640-6ece-4c53-8cf1-2df480746891`, terminal `ARCHIVE_IDENTITY_INVALID`, status SHA `156ec67a19d497df8fc62a9e39b5fae46a79356c81483cf9d246e9143703ed46`, no publication/staging residue, unchanged minimal-only data, unchanged observers, safe memory/OOM state, and no public cutover.
- [ ] 3.7 Transactionally deploy source `be48847bc26bcda28c9f08f6807f5dec40d479f4` from the newly admitted bundle without changing installed operations/proxy definitions, re-verify updater-only projection and private health, then invoke updater exactly once under this new authorization; require terminal success, a valid active version unequal to the minimal fixture, matching readiness/catalog/metrics/scrape versions, and safe memory/OOM state. On failure keep public traffic on legacy and do not begin 4.x.

## 4. Deployment-owner host integration and traffic cutover

- [ ] 4.1 Install and validate the exact updater systemd unit/timer and Nginx logrotate file, leave global journald unchanged, reload only the systemd manager, use `systemctl enable` without starting the timer, and verify it is enabled but inactive.
- [ ] 4.2 Recheck the active Nginx preflight hash, create a hash-equal exact backup, render a structure/diff-bounded candidate below `/srv/bgmss-v2`, activate through the exact same-directory temporary, validate/reload it, and require new frontend byte hash plus real-version catalog JSON while preserving declared legacy bytes/probes; automatically restore the backup on any failure.
- [ ] 4.3 Drill one atomic Nginx rollback to the hash-equal legacy backup with captured old-frontend/healthy-route probes, then validate/reapply the retained candidate with new-frontend/catalog probes; leave the legacy configuration active if either direction fails.

## 5. Main-agent production acceptance and lifecycle

- [ ] 5.1 Independently audit private/public health, real data version, same-ID/same-policy legacy loader intentionally stopped, Prometheus and Compose journald logs, enabled-inactive timer, logrotate, memory/OOM, other Docker identities, exact Nginx candidate/active/backup hashes and bounded diff, rollback command, legacy coexistence, known exclusions, unchanged global journal configuration, and zero undeclared writes or deletions.
- [ ] 5.2 Record investigated/implemented/verified/deployed states, synchronize the operations delta, archive this completed change, run strict all-spec and diff checks, narrowly stage/commit/push only the OpenSpec lifecycle, and report remaining deferred items.
