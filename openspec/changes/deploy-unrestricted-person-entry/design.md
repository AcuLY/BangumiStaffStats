## Context

User-approved implementation is linked as `add-unrestricted-person-entry`. Production already runs the new app at https://search.bgmss.fun/ with legacy under /old/. `/srv/bgmss-v2/operations/bin/check --root /srv/bgmss-v2` passed preflight; root and legacy both returned HTTP 200. Internal health is `/livez` and `/readyz`, not `/api/v1/health/ready`.

## Goals / Non-Goals

Deliver the reviewed feature through the existing reproducible build and deployment workflow. Preserve production data, routing, limits, secrets and unrelated services. Do not deploy unreviewed worker output, invent an alternate container bundle, modify Nginx, bypass artifact checks or claim focused tests replace complete applicable gates.

## Change boundary

| Field | Boundary |
|---|---|
| Status | User-authorized, specified; no activation yet |
| Owner | Primary only |
| Writable paths | Exact new release/bundle and four state env/symlink paths in proposal; this change and later its own accepted spec; dedicated workspace toolchains/qa/evidence |
| Read-only protected inputs | Nginx, live Compose/config/scripts, all Archive data and previous releases, legacy/other services, other repos/credentials |
| Deletion complement | Only owned temporary QA processes, builder and rejected candidate identified by normal deploy cleanup |
| Mutable refs | Current local branch, scoped feature remote ref and reviewed PR/master integration from proposal; no force updates |
| Consumes | Green reviewed feature, repository-pinned tools, closed Backend/Frontend bundle |
| Produces | Accepted deployment and rollback/readback evidence |
| Dependencies | Feature → verification → review/commit/integration → bundle → readiness → static switch → public acceptance |
| Deliverables | Functional production application URL and accurate evidence; script publication is user-owned |
| Acceptance | tasks.md and capability scenarios, normal operations check, representative browser feature checks |
| Non-goals | Data migration/refresh/rollback, route/config/toolchain-policy redesign, other applications |
| Operations deferred | Unnamed resources and bypassing failing gates |
| Stop/rollback conditions | Changed preimage, approval denial, auth failure, mismatched bundle or failed health/function → stop/normal app rollback |

## Decisions

1. Consume existing `operations/bin/build-bundle.sh` and `/srv/bgmss-v2/operations/bin/deploy`; do not reimplement their closed inventory, checksum, image identity and frontend-last ordering. Use `development-artifacts` CI workflow_dispatch for the operations-preview bundle when existing authenticated GitHub tooling is available; a locally reproduced bundle must use the same script and exact tools, never approximate metadata.
2. Preserve the current deployment as rollback: API revision `806037b87f422cb14bf4a873367be43a3b8fa44f`; current frontend `releases/806037b87f422cb14bf4a873367be43a3b8fa44f/frontend`. Before mutation recapture all state. Existing previous frontend is `releases/3f7de5ca8eb37056c7f9ff3f08ddebfd7fbe880c/frontend` and must not be deleted.
3. Keep Nginx byte-identical: preflight SHA256 `74e51de5c7f676cc36b13b14c3764afcbd7a602a2c391637d1f9104a5644e148`; Compose SHA256 `473ab9b7c01c257ddf94b731ac69e68f326c4a43ce6941a7c5b99c7d3be87a83`. Protect Archive current.json (`dv1-d6be9192955e263057e72f4f796ef836a0f1a0119d6c77d908ca73d83dfc90b5`); application deploy never deliberately writes its pointer. Normal existing service-owned archive scheduling is not replaced or manually invoked.
4. Exact Node24.18.0/npm11.16.0 are in dedicated workspace toolchains, Go1.26.5 via normal automatic toolchain cache. Never replace Hermes Node. If local BuildKit is needed, use isolated Docker configuration under workspace toolchains with Buildx0.34.1 and `bgmss-entry-builder`, pinned BuildKit0.27.1 image from repository policy. Do not switch system/default builder or install global plugins. No application dependency upgrades.
5. QA may run only on free loopback 18081/15174 under workspace `qa/`. A real-data QA API must disable ArchiveUpdater via existing app.RunWithOptions and read immutable production archive; never run normal cmd/api against production data as a second updater. Alternatively use a dedicated archive copy/fixture. Existing production and unrelated ports remain occupied by their owners.
6. Reuse existing GitHub authentication through approved tooling; never print/copy credentials. If a remote temporary staging root is needed, record and verify its exact absent path first; no writes to the user's original mypc working tree. Develop in the current local branch under repository agreement, publish a scoped feature ref/PR rather than force-updating master.

## Risks / Trade-offs

- Unrestricted may increase memory/cold-query cost → test representative real personal requests and watch API memory/health before acceptance; no hidden filtering or first-page shortcuts.
- Shared Query changes require OpenAPI/build pin updates → contracts owns reproducing current contract/golden identities; operations cannot weaken checks to ship mismatched outputs.
- Baseline tests may already fail → record exact baseline and fix only demonstrated in-scope prerequisites, otherwise stop deployment rather than masking failures.
- Local server has other services and no swap → constrained parallelism and temporary resources; no broad build-cache pruning or daemon restart.
- Existing image differs from master → candidate behavior is tested from the actual committed tree, not inferred from prior release labels.

## Migration Plan

No data migration. After source/bundle acceptance, save exact current/previous env and symlink targets in workspace evidence, verify bundle SHA256 inventory and compatibility, deploy new revision into absent release directory with project/ports/image pin unchanged. The script loads candidate API, waits for existing dataVersion readiness and only then changes static frontend. Run normal operations check plus public API/application-entry/feature tests. On failure use `/srv/bgmss-v2/operations/bin/rollback-app --root /srv/bgmss-v2`, verify prior API/frontend and routes without touching data. Test this mechanism against an isolated owned root or equivalent focused existing-script checks before real activation.

## Open Questions

No product decisions remain. Authentication, exact candidate revision and bundle root are runtime-discovered values that must be recorded, verified and explicitly passed before activation, not guessed placeholders or provider defaults.
