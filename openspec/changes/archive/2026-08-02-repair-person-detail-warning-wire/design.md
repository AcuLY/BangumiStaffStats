## Context

See `proposal.md` for motivation. Production revision `a714fe7e865c93a4c2f4ed4b9dcbf2ef9ea7286a` allocates the person-detail warning slice from a nil base. Go JSON therefore emits `null` for a fresh collection, while the unchanged JSON Schema requires `[]`. Production logs show successful personal detail HTTP responses, and the public failure is reproducible with a schema-invalid fresh response.

The local Windows host lacks the repository’s exact artifact toolchain and running Docker daemon. The accepted path is therefore the existing GitHub Actions Product gate plus manual one-day `linux/amd64` bundle workflow. The existing host deploy command already verifies checksums, image labels, topology, readiness, and transactional rollback.

## Goals / Non-Goals

**Goals:**

- Correct only the Backend’s empty warning-set serialization.
- Prove RED/GREEN behavior at the envelope boundary.
- Admit only a Product revision that has already passed the complete Product workflow.
- Deploy one exact AMD64 bundle through the existing transaction and verify the original user-visible path.

**Non-Goals:**

- No contract, generated consumer, frontend, statistics, cache, query, collection, Archive, dependency, topology, Nginx, timer, or legacy-service change.
- No merge, tag, release, image registry, data refresh, or retention cleanup.

## Change Boundary

| Field | Declaration |
|---|---|
| Status | Exact user-authorized production repair. |
| Owner | Main agent; Backend correction followed sequentially by Operations admission/deploy. |
| Writable paths | Repository and external paths exactly as declared in `proposal.md`; no parent-directory implied authority. |
| Read-only protected inputs | Existing schemas/goldens/generated consumers, production Archive, host configuration, current/previous release contents, unrelated containers, Nginx, systemd, timers, and legacy root. |
| Deletion complement | Exact run-owned local bundle/download and remote incoming transfer root only after successful acceptance; deploy’s existing inactive-candidate cleanup on failure. |
| Mutable refs | Repair branch, GitHub workflow/artifact, and deploy-owned current/previous application refs only. |
| Consumes | Existing contract, current master, deployed revision/state, Actions workflow, and operations scripts. |
| Produces | Backend Product commit, admission-pin commit, green manual run, checksum-bound bundle, deployed revision, and lifecycle evidence. |
| Dependencies | Planning strict-valid/reviewed → Backend RED/GREEN → Product green → pin → manual Product+bundle green → preflight → deploy → verification. Dependency direction is `operations -> accepted Backend artifact`; Operations never changes Backend semantics. |
| Deliverables | Proposal deliverables only. |
| Acceptance | Proposal acceptance plus strict OpenSpec, exact git status/ref checks, and fresh public browser evidence. |
| Non-goals | Proposal non-goals only. |
| Operations deferred | Proposal deferred actions only. |
| Stop/rollback conditions | Proposal stop conditions; on post-activation failure use exact application rollback and re-run all host/public checks. |

## Decisions

### 1. Preserve the contract and allocate an empty slice at the producer

Use a non-nil empty destination when cloning warning codes. This keeps the type and semantics unchanged while ensuring JSON emits `[]`.

Alternatives rejected:

- Relax schema/frontend to accept `null`: weakens a stable cross-language contract and makes “no warnings” ambiguous.
- Frontend normalization: masks an invalid producer and leaves other consumers exposed.
- Custom JSON marshaling: disproportionate for one slice allocation and broadens risk.

### 2. Build the hotfix from current `master`, not the broader post-production frontend branch

The production repair branch starts from `94329c934867302113107d758e5658d7aa05cd1a` and ports only the person-detail code/test. This avoids deploying unrelated frontend fidelity and Windows tooling changes.

Alternative rejected: deploy the current `codex/post-production-frontend-fixes` head. It contains unrelated visual/tooling deltas outside the user’s reported blocker and would widen production scope.

### 3. Use two-stage immutable artifact admission

First commit and push the strict-valid plan plus Backend fix. Push CI runs the complete Product job but not the bundle job. Only after that exact Product commit is green, update the single accepted Product revision in `operations/bin/build-bundle.sh`, commit/push, and manually dispatch CI. The manual run must pass Product again before the reusable workflow emits the bundle.

Alternative rejected: locally build with mismatched Node/npm/Go/uv/Buildx and no Docker daemon. Repository policy explicitly prefers the green Actions authority in this situation.

### 4. Use the existing production transaction unchanged

Transfer the admitted artifact to one absent `/srv/bgmss-v2/incoming/run-<run-id>/` and invoke `/srv/bgmss-v2/operations/bin/deploy` with the existing root/project/ports/Prometheus pin/profile. Do not edit host scripts, Compose, Nginx, or Archive.

Before mutation, bind the current/previous revisions, active data version, health, metrics, Prometheus, container identities, operation lock availability, disk capacity, root/`/v2/` public probes, and absent candidate paths. The current release is the rollback target.

### 5. Verify the exact original symptom at raw and browser boundaries

After deployment:

1. Send the same personal ranking/detail flow for `lucay126` and assert the raw response has `warningCodes: []`.
2. Open `https://search.bgmss.fun/v2/ranking`, run the personal query, select a person, and require a rendered inspector with no console error or failure copy.
3. Run host operations check, inspect recent API logs, and verify `/livez`, `/readyz`, catalog data version, metrics, Prometheus target, legacy `/`, and V2 entry/assets.

## Risks / Trade-offs

- **Product workflow fails for an unrelated platform issue** → Stop before pinning or host mutation; inspect and correct only if within declared scope.
- **Bundle workflow produces a mismatched or expired artifact** → Reject it; do not transfer or deploy.
- **Deploy readiness fails** → Existing deploy transaction restores the previous application and verifies it before returning nonzero.
- **Raw wire is fixed but browser still fails** → Do not call deployment successful; inspect response schema/chunk/console evidence and roll back if the new revision introduced the failure.
- **Remote incoming artifact consumes disk** → Preflight capacity and remove only the exact run-owned incoming root after final verification.

## Migration Plan

1. Strict-validate and review planning with zero P0/P1 findings.
2. Implement and RED/GREEN-test the Backend correction; commit and push the Product candidate.
3. Require exact Product workflow success for that commit.
4. Advance only the accepted Product revision, verify the operations test and diff, commit/push, then manual-dispatch CI.
5. Download and verify the one-day bundle; transfer to one absent incoming root.
6. Re-preflight live state and run the existing deploy transaction.
7. Verify raw response, browser, host health/observability, logs, public routes, and non-interference.
8. Sync the Backend delta, archive the change with evidence, and push lifecycle documentation separately.

Rollback: run `/srv/bgmss-v2/operations/bin/rollback-app --root /srv/bgmss-v2`, then require the previous revision, ready/catalog/metrics/Prometheus, public legacy root, and `/v2/` to pass. The application rollback does not alter Archive data.
