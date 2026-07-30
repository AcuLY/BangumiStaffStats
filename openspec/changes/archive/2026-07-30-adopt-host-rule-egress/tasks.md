| Boundary | Declaration |
|---|---|
| Status | Implemented, source-audited, committed, pushed, accepted by green Actions and an exact `linux/amd64` bundle, migrated, deployed, rollback-tested, and live-accepted. |
| Owner | Operations apply agent for the repository block; main agent for spec, audit, Git lifecycle, host migration, deployment, and acceptance. |
| Repository writable paths | `operations/README.md`; `operations/env.example`; `operations/bin/build-bundle.sh`; `operations/bin/deploy`; `operations/bin/validate-isolated`; `operations/lib/common.sh`; rename/rewrite of `operations/test/updater-proxy.sh`; deletion of `operations/compose.updater-proxy.yaml`; this file's task markers. |
| Live writable paths | New `/root/myserver-proxy-global/`; one named rollback unit; exact backed-up proxy consumer definitions; `/srv/bgmss-v2` only through admitted operations. |
| Read-only protected inputs | All other repository paths; application proxy fallback code; contracts/data/routes/observability/update units; SSH/Docker/Nginx definitions; stopped loader; unrelated services; secrets; `mypc`. |
| Deletion complement | Exact obsolete overlay/transport code and proven superseded live proxy inputs/bridge instance only. |
| Mutable refs | This file's task markers and main-agent Git lifecycle only. |
| Consumes | Reviewed artifacts, host/mypc inspection, sanitized rules, accepted build artifacts. |
| Produces | Simplified operations, host-global gateway, migrated/deployed services, acceptance evidence. |
| Dependencies | Group 1 before 2; green Actions before 3.5; host gateway before removing any consumer; every live check before rollback cancellation. |
| Deliverables | Repository code/tests/docs, safe proxy migration, deployed footer/product, real query and observability proof. |
| Acceptance | Commands and live checks below; strict OpenSpec and diff audit by main agent. |
| Non-goals | Product/source refactor, new proxy service API, Mihomo global mode, hand-written firewall controller, secret publication, Nginx route change, reboot. |
| Stop/rollback conditions | Stop on authority conflict, dirty overlap, public listener, invalid rules/image, SSH/DNS/Docker/Nginx regression, recursion/bypass, failed Actions, or missing exact rollback. |

## 1. Repository operations implementation

- [x] 1.1 Preflight the exact branch/HEAD/dirty paths; inspect every proxy
  reference and retain the existing workflow-prefix, deploy transaction,
  rollback, Compose closure, and isolated validation coverage.
- [x] 1.2 Remove the tracked proxy overlay and simplify release-env/Compose/
  deploy logic so proxy mode, URL, network, and overlay are neither accepted,
  stored, preserved, nor projected.
- [x] 1.3 Rename the existing proxy test to an accurately named runtime test;
  remove proxy-mode cases while preserving calling-shell closure, obsolete
  argument rejection, deployment transaction, previous/current rollback, and
  workflow-prefix assertions. Update the bundle gate.
- [x] 1.4 Remove overlay projection from isolated validation and update
  operations README/env guidance to require external host-transparent
  rule egress without tracking global host secrets/configuration.
- [x] 1.5 Run Bash syntax, Compose/static runtime tests, relevant isolated
  validation preparation, `git diff --check`, and strict change validation;
  hand the unstaged candidate to the main agent with exact results.
- [x] 1.6 Add the one-time locked migration for an exact closed legacy proxy
  release: raw+overlay recovery only when normalization fails, clean-old
  candidate recovery and rollback after normalization, strict rejection of
  every nonclosed legacy shape, and focused runtime regression coverage.

## 2. Main-agent repository audit and CI

- [x] 2.1 Audit the actual operations diff for zero P0/P1 findings, especially
  release-env backward compatibility, rollback bytes, ambient environment,
  base-only Compose, test preservation, and deletion complement.
- [x] 2.2 Commit the footer change as one phase and the operations correction
  as a second phase; push the topic branch and obtain green applicable
  Development Actions without running a local build.
- [x] 2.3 Verify the accepted `linux/amd64` bundle identifies the exact green
  commit before any Bangumi production release write.

## 3. Host-global proxy migration

- [x] 3.1 Re-run live preflight: record Mihomo image digest/config, proxy
  consumers, Docker networks, routes/rules/nftables/listeners, SSH/Nginx/
  Docker state, public routes, and exact files to back up. Confirm the legacy
  loader remains stopped.
- [x] 3.2 Export only sanitized live `mypc` target rules, validate the
  DIRECT/Proxy mapping and count/hash, then create an offline-valid
  `/root/myserver-proxy-global` candidate using the pinned existing Mihomo
  image, host networking, `NET_ADMIN`, `/dev/net/tun`, loopback-only
  listeners, rule mode, DNS/fake-IP exceptions, and restart policy.
- [x] 3.3 Create exact rollback preimages/script, arm one seven-minute
  transient rollback unit, start the host-TUN candidate beside the old bridge
  proxy, and verify a second/new SSH session plus unchanged Nginx/Docker.
- [x] 3.4 With all proxy variables removed, verify expected DIRECT and Proxy
  outcomes from the host and temporary clients on `bgmss-v2_backend`,
  `bgmss_default`, and `bgmtl_default`; confirm outcomes in Mihomo and confirm
  no public proxy/controller/DNS listener.
- [x] 3.5 Remove explicit proxy inputs one service at a time, recreate only
  its service, deploy the accepted Bangumi bundle through the simplified
  transaction, and keep the old loader stopped. Stop the old bridge proxy only
  after inspection proves it has no consumers.
- [x] 3.6 Verify root legacy and `/v2/`, API live/ready/metrics, Prometheus,
  journald, Archive identity, updater upstream reachability, one real public
  user ranking request including collection and images, and all unrelated
  service health.
- [x] 3.7 Restart the new proxy container and verify transparent routing and
  service recovery. Test fail-open stop/cleanup and start recovery without
  restarting Docker or the host. Remove only the unused old network and
  temporary migration exception after proof, then cancel the rollback unit.

## 4. Final acceptance and lifecycle

- [x] 4.1 Run strict validation for both active changes and the repository,
  inspect final Git/live state, and confirm zero P0/P1 findings or unowned
  residue.
- [x] 4.2 Sync and archive completed changes, make the lifecycle commit, push,
  obtain final green Actions, merge to `master`, and verify deployed revision
  versus merged revision explicitly.
- [x] 4.3 Report investigated, specified, implemented, verified, committed,
  pushed, merged, released, deployed, rollback-ready, and live-query states
  separately; include any intentionally retained dormant fallback or backup.
