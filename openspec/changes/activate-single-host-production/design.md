## Context

The product-bearing implementation is fixed at
`bd3197d639a32831f3fbcfab698cc387393d2928`; Development and the single
`linux/amd64` operations bundle passed in Actions run `30426027299`, and that
bundle already passed isolated validation on `myserver`. Production activation
was intentionally deferred. The user has now authorized it and expanded the
host from 3.57 GiB to 7.5 GiB RAM; the new boot currently exposes about
6.0 GiB available.

The legacy `bgmss` API/MySQL/Redis serving path must remain running; legacy
loader container
`84d7ca5dcf10b5aae2eb44bf942f2730c3a155ae771aec57946ddfea1eff2bc9`
is intentionally stopped and is not a rollback dependency. Existing unrelated
failures in top3 and the temporary Bangumi proxy are outside this change and
are excluded from both writable scope and acceptance probes.

| Field | Declaration |
|---|---|
| Status | Proposal and design complete; apply pending strict validation and main-agent approval. |
| Owner | Main agent owns decisions/spec/audit/acceptance. One production-deployment subagent owns the exact remote steps. |
| Writable paths | Exact repository, local transfer, and `myserver` paths/objects in the proposal and delta spec, including both fixed incoming roots, only the running-to-stopped state of legacy loader ID `84d7ca5dcf10b5aae2eb44bf942f2730c3a155ae771aec57946ddfea1eff2bc9` after its labels and protected fields still match baseline, and the Nginx temporary path. |
| Read-only protected inputs | Product/operations implementation, legacy project/root and all its state except the exact loader running-state transition; loader image/labels/policy/mounts/config/data; TLS material; unrelated host state; and every undeclared object. |
| Deletion complement | No protected object; only exact new-project stop/removal is allowed on failure, with the production root preserved. |
| Mutable refs | OpenSpec/Git lifecycle, new runtime refs, running-to-stopped state of exact legacy-loader ID `84d7ca5dcf10b5aae2eb44bf942f2730c3a155ae771aec57946ddfea1eff2bc9`, exact Nginx active file/backup, project `bgmss-v2`, and new timer links. |
| Consumes | Exact admitted bundle, expanded host, existing TLS vhost, product endpoints, and pinned Prometheus image. |
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

### 1. Reuse the exact green Actions artifact

The deployment downloads run `30426027299` and admits its exact artifact rather
than rebuilding locally or on `myserver`. This preserves the already verified
source/platform/checksum binding and avoids host toolchain drift. If the
artifact expires or its identity differs, apply stops; a same-revision Actions
rerun is required rather than substituting another build.

### 2. Keep production isolated from the legacy stack

The new topology uses `/srv/bgmss-v2`, project/network prefix `bgmss-v2`, and
loopback ports `18080`/`19090`. It mounts no legacy path or volume. The expanded
memory gate provides room for both stacks and the bounded updater.

The post-reboot legacy loader is not reaching its normal hourly sleep: it fails
on a casts foreign-key error and is immediately restarted by
`unless-stopped`. Running the new updater concurrently would violate the
serialization and CPU assumptions. The user subsequently authorized stopping
this background updater because the old serving stack will soon be retired.
Apply therefore re-inspects exact loader container ID
`84d7ca5dcf10b5aae2eb44bf942f2730c3a155ae771aec57946ddfea1eff2bc9`,
requires it to still be running with project `bgmss`/service `loader` labels
and all protected fields equal to the recorded baseline, stops only that
literal ID, and verifies the legacy API/MySQL/Redis serving path remains
healthy. The same container remains present and stopped with its
`unless-stopped` policy; its bytes, mounts, configuration, and data are not
changed, and its application error is not repaired here.

### 3. Separate private bootstrap from traffic eligibility

The bundle fixture is sufficient to start and verify image/runtime integrity,
but is not production data. After private deployment, `update` performs the
first real publication. Cutover requires a non-minimal active version and
agreement across readiness, catalog, API metrics, and Prometheus. Because the
first `previous.json` can refer to the fixture, the old stack—not
`rollback-data`—is the admitted production rollback until a later real update
creates a second production data version.

Alternative rejected: serving the fixture temporarily, because it would expose
incomplete data. Alternative rejected: changing updater code now, because the
retained old stack already provides the safe first-release rollback without
changing accepted product bytes.

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
- **The legacy loader has no idle window** → stop only its captured container
  under explicit user authorization, retain the same identity/policy in
  stopped state, and verify old serving health before any later action.
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

1. Strict-validate and approve this change.
2. Record the post-reboot host, legacy, Nginx hash/content markers, exact byte
   capacity, path/project/port/unit/logrotate, and known-failure baseline; stop
   on drift.
3. Download and verify artifact ID `8713954047` at exact absent local
   `/tmp/bgmss-production-artifact-30426027299`, create
   `/srv/bgmss-v2/incoming/run-30426027299`, and transfer only there.
4. Create `/srv/bgmss-v2`, install reviewed operations bytes, seed the fixture,
   and deploy privately.
5. Re-inspect and stop only legacy loader ID
   `84d7ca5dcf10b5aae2eb44bf942f2730c3a155ae771aec57946ddfea1eff2bc9`,
   leave it stopped with unchanged identity/config/policy, verify old serving
   health, then obtain one non-minimal active Archive and complete private
   health/metrics/logging acceptance.
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
