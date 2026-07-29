## Context

The initial product-bearing bundle
`bd3197d639a32831f3fbcfab698cc387393d2928` is already deployed privately at
`/srv/bgmss-v2`; its API/Prometheus/catalog are healthy on loopback. The exact
legacy loader is stopped while the legacy serving path remains public and
healthy. Updater attempt `72f6dc91-2738-4388-9f0b-a9d7a3d388c7` failed safely
with `HTTPS_REQUEST_FAILED`, published no version, and left the minimal fixture
active. The explicit-proxy implementation is accepted at A2
`7d2aa05853e55499a35d0afd9f6e4cb2dd3be17a`; replacement artifact source B2
`016160f7a63d68639a50e226c052fe75d5888f5f` passed both jobs in run
`30444069918`.

The legacy `bgmss` API/MySQL/Redis serving path must remain running; legacy
loader container
`84d7ca5dcf10b5aae2eb44bf942f2730c3a155ae771aec57946ddfea1eff2bc9`
is intentionally stopped and is not a rollback dependency. Existing unrelated
failures in top3 and the temporary Bangumi proxy are outside this change and
are excluded from both writable scope and acceptance probes.

| Field | Declaration |
|---|---|
| Status | Partial private activation complete; exact proxy-artifact recovery is specified and awaits amended-change validation, review, commit, and push. |
| Owner | Main agent owns decisions/spec/audit/acceptance. One production-deployment subagent owns the exact remote steps. |
| Writable paths | Exact repository, replacement local transfer root, and `myserver` paths/objects in the proposal and delta spec, including existing root transactions, new incoming root, three closed runtime definitions, and the Nginx temporary path. |
| Read-only protected inputs | Product/operations implementation outside the closed inventory; legacy project/root and every field including the exact stopped loader state; proxy/network lifecycle/config; TLS material; unrelated host state; and every undeclared object. |
| Deletion complement | No protected object and no removal of the existing `bgmss-v2` project/root. Recovery failure restores the historical application/env/operations state; Nginx failure restores the exact backup. |
| Mutable refs | OpenSpec/Git lifecycle, runtime refs/project containers only under the existing transaction, exact Nginx active file/backup, and new timer links. |
| Consumes | Historical private baseline plus exact admitted replacement artifact `8721121158`, existing `proxy-net`/`myserver-proxy:7897`, expanded host, existing TLS vhost, product endpoints, and pinned Prometheus image. |
| Produces | Live new frontend/API, real Archive, metrics/logging/update timer, and exact legacy traffic rollback. |
| Dependencies | Reboot/capacity gate → artifact gate → private deploy → real Archive → private checks → host templates → Nginx cutover → public/legacy checks. |
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
Recovery admits only run `30444069918`, artifact `8721121158`, name
`operations-preview-016160f7a63d68639a50e226c052fe75d5888f5f`, source
`016160f7a63d68639a50e226c052fe75d5888f5f`, tree
`d9217a277e587fbc7ab32a477a7b4241bcd77c81`, and `linux/amd64`. It is downloaded
to `/tmp/bgmss-production-artifact-30444069918`, then transferred only to
`/srv/bgmss-v2/incoming/run-30444069918`; no local or host rebuild is allowed.
If identity, closed inventory, or checksums differ, recovery stops.

The bundle intentionally excludes operations definitions. Recovery therefore
admits only this closed, separately transferred runtime inventory:

| Repository path | Git mode / blob | SHA-256 | Host target / mode |
|---|---|---|---|
| `operations/bin/deploy` | `100755` / `9adeb63e2398eb1f5ce52ea176a67b41c0672a42` | `aa4b519d452be3aa16a9d1bdef1615f99039c6f148dd1fe7b4b483e2c33adf94` | `/srv/bgmss-v2/operations/bin/deploy` / `0555` |
| `operations/lib/common.sh` | `100644` / `0a0a95ab3ecbd98f6c2015e647fdad424626df7d` | `6d0c7df4c98dba7ad0af3756cba9166ae330ae5282a08b5fb9d414ddae249f8a` | `/srv/bgmss-v2/operations/lib/common.sh` / `0444` |
| `operations/compose.updater-proxy.yaml` | `100644` / `0570c3bc02a9883dd44b8ce7c52a1dd26f009200` | `6a1c65dbe7dee0701a3ad697d3a6b9dccdc89fe6a6e11ff3c62671f79fdc7dfa` | `/srv/bgmss-v2/compose/compose.updater-proxy.yaml` / `0644` |

Existing `deploy` and `common.sh` bytes are copied to an identity-bound rollback
directory before replacement. A failed candidate restores them and removes
only the newly introduced overlay.

The historical rollback identity is closed as follows:

| Historical path/state | Git mode / blob at `bd3197d…` | SHA-256 | Host mode |
|---|---|---|---|
| `operations/bin/deploy` | `100755` / `b477edc7e6a10eb15f299b93134e4f5f99479176` | `43892f9fde8b06439f5e013c0749f96f40c40a111228f8ac3a155db5d3f5e825` | `0555` |
| `operations/lib/common.sh` | `100644` / `5183f264cbf99023d955ecfc970602a40bdcede5` | `2d963d890aa0154c9592041f77dd9fb620c739f87d3093cd9ffd7281b9a37320` | `0444` |
| `operations/compose.updater-proxy.yaml` | absent | absent | absent |

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
but is not production data. After private deployment, `update` performs the
first real publication. Cutover requires a non-minimal active version and
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
makes no extra acquisition request. The single production updater retry is the
only live CONNECT/destination-TLS/publication attempt.

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
2. Strict-validate/review this recovery amendment, synchronize/archive the
   proxy change, commit/push, and require the remote branch to match.
3. Re-preflight the exact historical current release, health, stopped loader,
   free/collision paths, proxy identity/connectivity, and target-byte hashes.
4. Admit/transfer replacement artifact `8721121158` and the closed three-file
   operations inventory, preserving prior operations bytes for rollback.
5. Transactionally deploy B2 with exact proxy URL/network, verify that only
   updater receives them, then run exactly one updater retry and require one
   non-minimal active Archive with observer agreement.
6. Install/validate the systemd and logrotate configuration; leave global
   journald unchanged and enable—but do not start—the weekly timer.
7. Create the exact Nginx backup, narrowly integrate the new frontend/API,
   validate, reload, and run public plus retained-legacy probes.
8. Restore/reload/probe the legacy backup once, then reapply/reload/probe the
   retained candidate; on any failure leave the legacy backup active.
9. Archive/sync the OpenSpec and commit/push the documentation lifecycle.

## Open Questions

None. The user has authorized production activation; legacy retirement remains
explicitly deferred.
