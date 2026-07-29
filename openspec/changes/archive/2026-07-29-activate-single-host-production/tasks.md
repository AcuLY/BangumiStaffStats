| Field | Declaration |
|---|---|
| Status | Production apply and acceptance complete; final OpenSpec sync/archive and lifecycle commit/push remain. |
| Owner | Main agent directly owns spec, task state, Git, exact `myserver` implementation, audit, and acceptance. |
| Writable paths | This change; exact incoming `/srv/bgmss-v2/incoming/run-30452886753`; installed Compose target/temporary; updater data transaction; and exact systemd/logrotate/Nginx paths declared by proposal/spec. Application release/env/images and all other operations/proxy definitions remain read-only. |
| Read-only protected inputs | Accepted repository/artifact bytes outside the closed inventory; historical current release; legacy stack/root; loader image/labels/policy/mounts/config/data; existing proxy/network lifecycle/config/credentials; TLS material; and every undeclared host/repository object. |
| Deletion complement | No protected object and no removal of the existing `bgmss-v2` project/root; projection failure restores exact old Compose bytes, updater failure retains exact application/minimal-data state, and cutover failure restores exact Nginx bytes. |
| Mutable refs | Change lifecycle, branch commit/push, runtime refs/project only through declared transactions, exact Nginx active file/backup, and new timer links. |
| Consumes | Current private source `be48847bc26bcda28c9f08f6807f5dec40d479f4`; current/previous env SHA-256 `76de7645452162d04afe0679e346d6b61661c80aec15036814ec1ae5c58ab1ce`/`f2f63a26d9178e3f9effd6acb8b1ca195056be2050b157bf871386d45c280646`; failed updater UUID `6d7dd3d4-9eb4-472e-af09-0561dc313617`; status SHA `a10facccaa15ea9383414350c6a09550a0b2d23927573308292a0ff62ac1d3da`; exact operations source/run `1505c5d7c36f457ed8d9e3be542e2422fe2811fc`/`30452886753`; exact old/new Compose identities; `proxy-net`/`http://myserver-proxy:7897`; expanded `myserver`; pinned Prometheus image; existing TLS vhost. |
| Produces | Live new stack with real Archive, planned observability, reversible traffic routing, and retained legacy rollback. |
| Dependencies | SQLite-storage/activation lifecycle strict-valid/zero-P0/P1/commit/push → exact current/status/Compose/proxy preflight → one-file transaction → one new updater invocation/real Archive → host integration → cutover/rollback drill → final audit. |
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
- [x] 1.5 Require both jobs green in exact-head run `30452886753`; strict-validate/review and sync/archive `route-production-sqlite-temp-to-data-disk`; prepare this exact Compose handoff as one narrow commit; and keep the Compose write/updater blocked until push succeeds and the remote branch equals that commit.

## 2. Deployment-owner admission and artifact transfer

- [x] 2.1 Re-preflight exact local transfer-root absence plus `myserver` boot ID, architecture, exact `MemTotal`/`MemAvailable` byte gates, disk, Docker/Compose/Nginx/tools, exact root/project/ports/backup/temporary/unit/logrotate absences, all declared legacy identities/content markers/probes, active Nginx hash, and exact pre-existing top3/proxy exclusions before any write.
- [x] 2.2 Download Actions run `30426027299` artifact ID `8713954047` with its exact admitted name only to `/tmp/bgmss-production-artifact-30426027299`, verify source revision, platform, closed inventory, and all checksums locally, then create and transfer only to `/srv/bgmss-v2/incoming/run-30426027299`.
- [x] 2.3 Recheck the exact historical private baseline/collisions; admit run `30444069918` artifact `8721121158` plus the declared three-file operations inventory, create `/srv/bgmss-v2/incoming/run-30444069918`, and transfer the exact closed bundle/operations bytes while preserving historical operations for rollback.
- [x] 2.4 Recheck exact B2 current/previous env hashes, failed status/minimal-only data, installed operations hashes/modes, collision paths, and absent run `30449279352`; admit artifact `8723283346` from `/tmp/bgmss-production-artifact-30449279352` with exact run/name/source/tree/platform/nine-file inventory/eight checksums, then create and transfer only to `/srv/bgmss-v2/incoming/run-30449279352`.
- [x] 2.5 Recheck exact current source/env/status/minimal-data/capacity/health/loader/proxy baseline and old Compose blob/SHA/mode; transfer candidate blob `0daee531f811ff826bba1836897eb9cc54d6d529`, retain exact old bytes, atomically install SHA-256 `13d0608d29b38cedc62821bb02f5646bf702e9419b8ee946c60c8580485cb272`, and verify the new projection differs only by updater `SQLITE_TMPDIR`.

## 3. Deployment-owner private production activation

- [x] 3.1 Create the exact `/srv/bgmss-v2` layout and permissions, install reviewed operations/config bytes, seed the bundle fixture, and deploy source `bd3197d639a32831f3fbcfab698cc387393d2928` as project `bgmss-v2` on `127.0.0.1:18080/19090`.
- [x] 3.2 Verify Compose hardening/resources/mounts/log driver, API live/ready/catalog/metrics, Prometheus readiness/scrape, journald logs, and unchanged legacy state before running the updater.
- [x] 3.3 Re-inspect legacy loader container ID `84d7ca5dcf10b5aae2eb44bf942f2730c3a155ae771aec57946ddfea1eff2bc9`, require it to still be running with project `bgmss`/service `loader` labels and image/restart-policy/mounts/config equal to the recorded baseline, stop only that literal ID under the user's explicit authorization, require the same protected fields to remain unchanged while it stays present but stopped, and verify the old API/MySQL/Redis serving path remains healthy.
- [x] 3.4 Record direct updater run `72f6dc91-2738-4388-9f0b-a9d7a3d388c7`, terminal `HTTPS_REQUEST_FAILED`, no publication, unchanged minimal fixture, and no public cutover.
- [x] 3.5 Install only the three admitted operations definitions with exact modes, transactionally deploy B2 to the same root/project/ports using `--updater-transport proxy --updater-https-proxy http://myserver-proxy:7897 --updater-proxy-network proxy-net`, and verify only updater receives the exact URL/network while API and Prometheus remain excluded.
- [x] 3.6 Invoke updater exactly once after B2 private/proxy projection checks; record run `1f1ef640-6ece-4c53-8cf1-2df480746891`, terminal `ARCHIVE_IDENTITY_INVALID`, status SHA `156ec67a19d497df8fc62a9e39b5fae46a79356c81483cf9d246e9143703ed46`, no publication/staging residue, unchanged minimal-only data, unchanged observers, safe memory/OOM state, and no public cutover.
- [x] 3.7 Transactionally deploy source `be48847bc26bcda28c9f08f6807f5dec40d479f4`, re-verify updater-only proxy projection/private health, invoke updater exactly once, and record run `6d7dd3d4-9eb4-472e-af09-0561dc313617` failing safely with `SQLITE_BUILD_FAILED`, status SHA `a10facccaa15ea9383414350c6a09550a0b2d23927573308292a0ff62ac1d3da`, no publication/residue/OOM, unchanged minimal data, and no public cutover.
- [x] 3.8 Invoke updater exactly once as run `6eb4dd5e-c921-4251-b189-0ae522343219`; publish/activate `dv1-9d794033f12b8bcd60d8c890115a76ca52060ae13b357b3c32e036f94bb67888`; require matching readiness/catalog/metrics/Prometheus, status SHA `a1062bdfee005bfc05be2023853062012383c7c96f2a91b4b6d9e4fd7d19ba37`, no residue/OOM/restart, and retain the minimal fixture as previous.

## 4. Deployment-owner host integration and traffic cutover

- [x] 4.1 Install/validate the exact updater systemd unit/timer and Nginx logrotate file, leave global journald SHA unchanged, reload only the systemd manager, enable without starting the timer, and verify timer/service remain inactive.
- [x] 4.2 Back up Nginx hash `6775e97ba227f4309106f89d5e1358b33c22ef5520ddba5b36a9da1a8615693c`, render the bounded candidate, atomically validate/reload hash `6fe8171ebd4a45eaa94cdba27f561d9207d433cd8bf1ef4e727c2e57a31fb7df`, and verify new frontend/catalog while retaining legacy route statuses.
- [x] 4.3 Atomically restore/probe the exact legacy backup, then reapply/probe the retained candidate; finish on the candidate with both directions syntax/content-valid and no protected legacy identity change.

## 5. Main-agent production acceptance and lifecycle

- [x] 5.1 Independently audit private/public health, real data version, same-ID/same-policy legacy loader intentionally stopped, Prometheus and Compose journald logs, enabled-inactive timer, logrotate, memory/OOM, other Docker identities, exact Nginx candidate/active/backup hashes and bounded diff, rollback path, legacy coexistence, known exclusions, unchanged global journal configuration, and zero persistent undeclared writes or deletions.
- [x] 5.2 Record investigated/implemented/verified/deployed states, synchronize the operations delta, archive this completed change, run strict all-spec and diff checks, and prepare one narrow OpenSpec lifecycle commit; require its push and remote equality before reporting completion.
