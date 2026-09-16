## Why

The user approved `add-unrestricted-person-entry` and explicitly requested “确认，改完直接按流程部署”. This change authorizes the existing single-host deployment workflow after the feature and its affected gates pass, with rollback and no unrelated service changes.

The user's latest instruction is “完成验收，并推送部署”. Complete application acceptance, exact-path commit and reviewed PR/CI integration before activating the verified bundle through the existing deployment workflow. Script publication remains user-owned and does not block application acceptance.

## What Changes

- NEW_CAPABILITY: release the linked feature through the existing closed linux/amd64 Backend + Frontend bundle and deploy script, excluding script distribution: the user publishes the existing script directly to Bangumi; no install documentation, download entry or bundled script copy is required.
- PRESERVE_ORACLE: all product behavior outside the approved feature, production routes, Archive pointer, service limits, secrets and other applications remain unchanged. PRODUCT.md and operations/README.md are authoritative for root=new and `/old/`=legacy; do not apply the stale inverse route note in AGENTS.md.
- INTENTIONAL_DELTA: the API image and frontend release pointer advance together after health acceptance; retain the old application slot and restore it on failure.

## Capabilities

### New Capabilities

- `operations-unrestricted-person-release`: scoped build, review, release activation and verification for the approved feature.

### Modified Capabilities

None. Existing deployment and rollback mechanisms are consumed without redesign.

## Impact

| Field | Boundary |
|---|---|
| Status | Deployment user-authorized; apply blocked on strict-valid reviewed artifacts and verified feature |
| Owner | Primary agent only for external state; feature workers have no production authority |
| Writable paths | This change; later its accepted spec/archive. Host `/srv/bgmss-v2/incoming/` new revision bundle only, `/srv/bgmss-v2/releases/` new revision only, `state/current.env`, `state/previous.env`, `current-frontend`, `previous-frontend` via existing deploy/rollback scripts; dedicated workspace `toolchains/`, `qa/`, `evidence/` below `/root/.hermes/workspace/bangumi-staff-stats/` |
| Read-only protected inputs | `/etc/nginx/nginx.conf`, existing Compose/config/operations files, `/srv/bgmss-v2/data/` including current.json, old releases, `/srv/bgmss/`, other services/repositories and credentials |
| Deletion complement | No old releases/data/services; remove only uniquely owned temporary QA/builder processes or incomplete candidate files under script ownership |
| Mutable refs | Local current master phase commits; new remote feature ref `feat/unrestricted-person-entry`, reviewed PR and master merge through the existing authenticated GitHub workflow; no force push, tags or branch deletion needed |
| Consumes | Reviewed feature commit, green affected gates, exact toolchains and existing deployment scripts |
| Produces | Verified immutable bundle, health-accepted API/frontend and accurate verification evidence |
| Dependencies | Feature contracts/code/tests → review → commit/PR/CI → bundle → API readiness → frontend switch → public verification |
| Deliverables | Working production application feature, rollback preimage and local/API/public/browser evidence; script publication is user-owned |
| Acceptance | Source/component checks; checksum and artifact compatibility; live/ready/catalog/metrics/Prometheus; target present/absent/continued browsing; root and legacy non-interference |
| Non-goals | Nginx changes, schema migration, Archive rebuild/rollback, secrets, unrelated app/container changes, new permanent services |
| Operations deferred | Any host/resource not explicitly named; any failed-gate bypass; legacy retirement |
| Stop/rollback conditions | Denied tool approval, external/dirty-state conflict, mismatched preimage/artifact, failed build/health/functionality: stop or existing application rollback; never reset/clean/force-push |

Exact host is the current Linux `VM-4-5-centos` business server. Production Compose project `bgmss-v2`, API `127.0.0.1:18080`, Prometheus `127.0.0.1:19090`. Existing image revision is `806037b87f422cb14bf4a873367be43a3b8fa44f`; preserve this as rollback target. The deployed Archive `dv1-d6be9192955e263057e72f4f796ef836a0f1a0119d6c77d908ca73d83dfc90b5` is not an application deployment target.

Read-only mypc GitHub/session discovery is authorized. Existing authenticated `C:\Program Files\GitHub CLI\gh.exe` and `D:\Git\cmd\git.exe` were verified through SSH as AcuLY with repository push/admin permission; no credential values are copied. Remote staging is limited to the new, absent `D:\Luca\Data\BangumiStaffStats\hermes-unrestricted-entry-20260914` (Test-Path returned False). The primary may create only this directory, transfer a local Git bundle into it, clone a separate temporary repository there, push the reviewed feature ref using Windows' existing SSH authentication, and download the resulting CI bundle there. The original `D:\Luca\Code\MyProject\BangumiStaffStats` remains read-only. Local-only preparation may use dedicated toolchain paths; do not upgrade Hermes/system Node or the default Docker CLI plugins. A temporary BuildKit builder uses unique name `bgmss-entry-builder` and the repository's pinned image; QA only uses currently free loopback `18081` and `15174`.

All four artifacts require strict OpenSpec validation and primary review before activation. This specification is authorization, not evidence that release or deployment occurred.
