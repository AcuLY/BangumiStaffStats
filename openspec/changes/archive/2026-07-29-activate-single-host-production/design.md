## Context

Explicit-proxy source
`be48847bc26bcda28c9f08f6807f5dec40d479f4` is deployed privately at
`/srv/bgmss-v2`; its API/Prometheus/catalog are healthy on loopback. The exact
legacy loader is stopped while the legacy serving path remains public and
healthy. Earlier direct updater attempt
`72f6dc91-2738-4388-9f0b-a9d7a3d388c7` failed safely with
`HTTPS_REQUEST_FAILED`. Proxy updater run
`1f1ef640-6ece-4c53-8cf1-2df480746891` then exposed an unsupported timestamp
comparison. Accepted product
`8282996f3f0cb0e2cde2a91ce71d425217ffa9d6` removed it entirely, and artifact
source `be48847bc26bcda28c9f08f6807f5dec40d479f4` passed run `30449279352`
before private deployment. Its one authorized updater run
`6d7dd3d4-9eb4-472e-af09-0561dc313617` authenticated and acquired the official
426 MiB Archive, then failed after 402 seconds with `SQLITE_BUILD_FAILED`.
The builder explicitly uses `PRAGMA temp_store=FILE`; updater `/tmp` is a
256 MiB tmpfs, while no kernel or Docker OOM occurred and more than 50 GiB of
disk remained. It published no version, left only the minimal fixture active,
and left status SHA-256
`a10facccaa15ea9383414350c6a09550a0b2d23927573308292a0ff62ac1d3da`.

The legacy `bgmss` API/MySQL/Redis serving path must remain running; legacy
loader container
`84d7ca5dcf10b5aae2eb44bf942f2730c3a155ae771aec57946ddfea1eff2bc9`
is intentionally stopped and is not a rollback dependency. Existing unrelated
failures in top3 and the temporary Bangumi proxy are outside this change and
are excluded from both writable scope and acceptance probes.

| Field | Declaration |
|---|---|
| Status | Completed: exact operations source `1505c5d7c36f457ed8d9e3be542e2422fe2811fc` passed run `30452886753`; the one-file Compose correction, single updater run, real Archive publication, host integration, Nginx cutover, and rollback/forward drill all passed. |
| Owner | Main agent directly owns decisions, spec, repository lifecycle, exact remote steps, audit, and acceptance. |
| Writable paths | Exact repository and `myserver` paths/objects in the proposal and delta spec, including `/srv/bgmss-v2/incoming/run-30452886753`, the single installed Compose target/temporary, updater data transaction, systemd/logrotate targets, and Nginx candidate/backup/temporary. Application release/env/images and other installed operations/proxy definitions remain read-only. |
| Read-only protected inputs | Product/operations implementation outside the closed inventory; legacy project/root and every field including the exact stopped loader state; proxy/network lifecycle/config; TLS material; unrelated host state; and every undeclared object. |
| Deletion complement | No protected object and no removal of the existing `bgmss-v2` project/root. Projection failure restores the exact old Compose bytes; updater failure retains the exact application/minimal-data baseline; Nginx failure restores the exact backup. |
| Mutable refs | OpenSpec/Git lifecycle, runtime refs/project containers only under the existing transaction, exact Nginx active file/backup, and new timer links. |
| Consumes | Current private source/env/status/minimal-data baseline; exact old/new Compose blobs and hashes; exact-head run `30452886753`; existing `proxy-net`/`myserver-proxy:7897`; expanded host; existing TLS vhost; product endpoints; and pinned Prometheus image. |
| Produces | Live new frontend/API, real Archive, metrics/logging/update timer, and exact legacy traffic rollback. |
| Dependencies | Exact-head Actions and lifecycle → current/capacity/Compose gate → one-file transaction → one updater run and real Archive → private checks → host templates → Nginx cutover → public/legacy checks. |
| Deliverables | Proposal deliverables only. |
| Acceptance | Delta scenarios and unchanged main-spec runtime/transaction requirements. |
| Non-goals | Proposal non-goals only. |
| Operations deferred | Legacy retirement, unrelated-service repair, second real Archive/data rollback, and extended soak. |
| Stop/rollback conditions | Proposal and delta stop/rollback conditions only. |

Dependency direction is accepted immutable artifact → dedicated production
root/Compose → real Archive → private acceptance → existing Nginx TLS boundary.
No live-host state writes back into repository or product owners.

## Goals / Non-Goals

**Goals:**

- Activate the accepted new product on `search.bgmss.fun` without building on
  the host or publishing a new release system.
- Preserve the legacy stack as an immediately available traffic rollback.
- Admit a real updater-produced Archive before serving users.
- Install only the already planned update, metrics, and log configuration.

**Non-Goals:**

- Product, visual, API, contract, or dependency changes.
- TLS/DNS/firewall changes, unrelated host repairs, legacy retirement, or a
  new observability/control system.

## Decisions

### 1. Upgrade only from exact green Actions artifacts

The initial private deployment used run `30426027299`/artifact `8713954047`.
The completed timestamp-fix deployment admitted only run `30449279352`, artifact
`8723283346`, name
`operations-preview-be48847bc26bcda28c9f08f6807f5dec40d479f4`, source
`be48847bc26bcda28c9f08f6807f5dec40d479f4`, tree
`52dd582016d40569327c0b87f9fad1cadf5252bb`, size `63282532`, GitHub digest
`sha256:e7aec802a2f95ece998d369e834813bab1800f0cf9e59e2c63466e9932a32bb0`,
and `linux/amd64`. It is downloaded to
`/tmp/bgmss-production-artifact-30449279352`, then transferred only to
`/srv/bgmss-v2/incoming/run-30449279352`; no local or host rebuild is allowed.
The extracted bundle has exactly nine files, eight checksum entries, and no
symlink or AppleDouble entry. If identity, closed inventory, or checksums
differ, deployment stops.

The bundle intentionally excludes operations definitions. B2 already
installed the following inventory, and the exact bytes are unchanged in the
new source. This deployment re-verifies but does not replace them:

| Repository path | Git mode / blob | SHA-256 | Host target / mode |
|---|---|---|---|
| `operations/bin/deploy` | `100755` / `9adeb63e2398eb1f5ce52ea176a67b41c0672a42` | `aa4b519d452be3aa16a9d1bdef1615f99039c6f148dd1fe7b4b483e2c33adf94` | `/srv/bgmss-v2/operations/bin/deploy` / `0555` |
| `operations/lib/common.sh` | `100644` / `0a0a95ab3ecbd98f6c2015e647fdad424626df7d` | `6d0c7df4c98dba7ad0af3756cba9166ae330ae5282a08b5fb9d414ddae249f8a` | `/srv/bgmss-v2/operations/lib/common.sh` / `0444` |
| `operations/compose.updater-proxy.yaml` | `100644` / `0570c3bc02a9883dd44b8ce7c52a1dd26f009200` | `6a1c65dbe7dee0701a3ad697d3a6b9dccdc89fe6a6e11ff3c62671f79fdc7dfa` | `/srv/bgmss-v2/compose/compose.updater-proxy.yaml` / `0644` |

The resulting current/previous env SHA-256 values are
`76de7645452162d04afe0679e346d6b61661c80aec15036814ec1ae5c58ab1ce`
and `f2f63a26d9178e3f9effd6acb8b1ca195056be2050b157bf871386d45c280646`.
No further application deployment is authorized by this amendment.

Exact-head operations source
`1505c5d7c36f457ed8d9e3be542e2422fe2811fc` changes only the updater Compose
projection, its focused tests, documentation, and OpenSpec. Installed
`compose.yaml` is Git blob
`00951ee0ffe23e4d2e5723857a54d2eceee51a63` with SHA-256
`dfe55f7124454075b36131302b14dd3dd4ef10c310328bfefa62169ba29a3a2a`;
the candidate is blob `0daee531f811ff826bba1836897eb9cc54d6d529`
with SHA-256
`13d0608d29b38cedc62821bb02f5646bf702e9419b8ee946c60c8580485cb272`.
Both are mode `0644`. The old bytes are copied under exact incoming root
`/srv/bgmss-v2/incoming/run-30452886753`, the candidate is transferred there,
and a same-directory temporary atomically replaces only the installed Compose
file. Static projection failure atomically restores the saved old bytes before
any updater invocation.

### 2. Keep production isolated from the legacy stack

The new topology uses `/srv/bgmss-v2`, project/network prefix `bgmss-v2`, and
loopback ports `18080`/`19090`. It mounts no legacy path or volume. The expanded
memory gate provides room for both stacks and the bounded updater.

The post-reboot legacy loader was not reaching its normal hourly sleep: it
failed on a casts foreign-key error and was immediately restarted by
`unless-stopped`. The user authorized stopping this background updater, and
the completed historical step stopped exact container ID
`84d7ca5dcf10b5aae2eb44bf942f2730c3a155ae771aec57946ddfea1eff2bc9`
after its project/service labels and protected fields matched the recorded
baseline. Recovery now requires that same container to remain present and
stopped with unchanged identity, `unless-stopped` policy, bytes, mounts,
configuration, and data while the legacy API/MySQL/Redis serving path remains
healthy. This change has no further write authority over the loader and does
not repair its application error.

### 3. Separate private bootstrap from traffic eligibility

The bundle fixture is sufficient to start and verify image/runtime integrity,
but is not production data. After replacement deployment, `update` performs
the first real publication. Cutover requires a non-minimal active version and
agreement across readiness, catalog, API metrics, and Prometheus. Because the
first `previous.json` can refer to the fixture, the old stack—not
`rollback-data`—is the admitted production rollback until a later real update
creates a second production data version.

Alternative rejected: serving the fixture temporarily, because it would expose
incomplete data. The first direct attempt proved transport resolution was
required, so the separately reviewed proxy change adds only explicit transport:
release env selects mode `proxy`, URL `http://myserver-proxy:7897`, and existing
external network `proxy-net`; only updater joins it. API and Prometheus remain
closed. Preflight is limited to read-only proxy/network identity and listener
inspection plus static Compose projection; it creates no probe container and
makes no extra acquisition request. The new Compose value is the fixed
updater-only `SQLITE_TMPDIR=/var/lib/bgmss/archive`, which routes SQLite
file-backed temporary work to the existing writable disk-backed Archive mount
while retaining the 256 MiB `/tmp` tmpfs. API and Prometheus receive no
`SQLITE_TMPDIR`; all resource, security, mount, network, and proxy boundaries
remain otherwise identical. After static projection succeeds, this amendment
authorizes exactly one new production updater invocation as the only remaining
live CONNECT/destination-TLS/publication attempt.

### 4. Patch one existing TLS vhost with an exact backup

The live Nginx SHA-256 is captured and rechecked, then the file is backed up to
the fixed, preflight-absent
`/etc/nginx/nginx.conf.pre-bgmss-v2`. Only the `search.bgmss.fun` TLS block
changes: frontend root, new `/api/v1/` proxy, and per-site logs. Existing
legacy auxiliary locations remain. The rendered candidate is retained at
`/srv/bgmss-v2/config/nginx/nginx.conf`. A structure-aware transformer rejects
non-unique blocks or any diff outside the declared block/fields. The exact
same-directory temporary plus rename activates bytes atomically, and active
hashes must equal candidate/backup as appropriate. Every reload is preceded by
`nginx -t`; failed public content probes restore the backup and reload it.
Frontend acceptance hashes the identity-encoded public response against the
deployed `index.html`; API acceptance parses catalog JSON and matches the
accepted real version. After the first successful cutover, one zero-downtime
reload drill restores/probes the captured old frontend and then
reapplies/probes the retained candidate.

Alternative rejected: replacing Nginx with the repository's standalone test
configuration, because it would discard existing TLS/vhost integration.

### 5. Install only planned host operations

The reviewed systemd updater timer/service and logrotate rule are installed
from repository bytes. The timer is enabled after the first real update but is
not started in the current boot, preventing `Persistent=true` from immediately
running a second update. The repository's global journald retention drop-in is
not installed because it would delete unrelated host logs; acceptance checks
only the Compose journald driver/tag and existing persistent entries.
Prometheus remains the loopback-only Compose service. Grafana, exporters,
tracing, alert-routing systems, and custom proof controllers remain absent.

## Risks / Trade-offs

- **The real updater may take time or fail upstream** → keep all public traffic
  on the old serving stack and leave the private candidate available for
  diagnosis.
- **The legacy loader had no idle window** → retain the already stopped captured
  container with the same identity/policy and verify old serving health before
  every later action.
- **The first new-stack data rollback target is the fixture** → forbid that
  production rollback and restore traffic to the still-running legacy stack.
- **Nginx editing can affect unrelated routes** → exact backup, narrow
  structure-aware server-block transformation, hash/diff equality, atomic
  replacement, `nginx -t`, retained locations, and content-aware probes.
- **Both stacks can contend for memory** → require at least 7.5 GiB total and
  4 GiB available at start, retain Compose limits, and recheck memory/OOM after
  update and cutover.
- **Known unrelated 502 routes can obscure acceptance** → record them before
  apply and exclude only those exact pre-existing failures; do not repair or
  broaden exclusions.

## Migration Plan

1. Historical completed steps: strict validation; post-reboot/admission
   preflight; run `30426027299` transfer; private baseline deployment; exact
   legacy-loader stop; and one safe failed updater attempt with no publication.
2. Completed B2 recovery: proxy OpenSpec lifecycle, artifact transfer,
   operations installation, transactional B2 deploy, static projection, and
   one safe failed updater invocation with no publication.
3. Completed timestamp recovery: archive the timestamp change, deploy exact
   source `be48847bc26bcda28c9f08f6807f5dec40d479f4`, and record one safe
   `SQLITE_BUILD_FAILED` run with no publication.
4. Require green exact-head run `30452886753`; sync/archive the focused SQLite
   storage change; validate/commit/push this production amendment; and require
   the remote branch to match.
5. Re-preflight exact current/previous env, failed status, minimal-only data,
   health, stopped loader, capacity/collision paths, proxy identity, and old
   Compose identity. Transfer candidate Compose bytes, retain exact old bytes,
   atomically install, and verify exact updater-only SQLite/proxy projection.
6. Run exactly one newly authorized updater invocation and require one
   non-minimal active Archive with observer agreement.
7. Install/validate the systemd and logrotate configuration; leave global
   journald unchanged and enable—but do not start—the weekly timer.
8. Create the exact Nginx backup, narrowly integrate the new frontend/API,
   validate, reload, and run public plus retained-legacy probes.
9. Restore/reload/probe the legacy backup once, then reapply/reload/probe the
   retained candidate; on any failure leave the legacy backup active.
10. Archive/sync the OpenSpec and commit/push the documentation lifecycle.

## Open Questions

None. Production activation is complete. Updater run
`6eb4dd5e-c921-4251-b189-0ae522343219` published
`dv1-9d794033f12b8bcd60d8c890115a76ca52060ae13b357b3c32e036f94bb67888`
in 1092.718 seconds. Final status SHA-256 is
`a1062bdfee005bfc05be2023853062012383c7c96f2a91b4b6d9e4fd7d19ba37`;
installed Compose SHA-256 is
`13d0608d29b38cedc62821bb02f5646bf702e9419b8ee946c60c8580485cb272`;
active/candidate Nginx SHA-256 is
`6fe8171ebd4a45eaa94cdba27f561d9207d433cd8bf1ef4e727c2e57a31fb7df`;
and exact rollback Nginx SHA-256 is
`6775e97ba227f4309106f89d5e1358b33c22ef5520ddba5b36a9da1a8615693c`.
Legacy retirement, a second real Archive before in-stack data rollback, and
extended load/soak remain explicitly deferred.
