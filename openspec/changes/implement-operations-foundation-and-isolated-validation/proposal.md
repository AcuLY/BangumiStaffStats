## Why

The accepted Backend, Updater, Frontend, and compatibility artifacts still
have no operations-owned path from one clean AMD64 candidate to a verifiable
release bundle, fail-closed single-host configuration, or repeatable recovery
procedure. Development acceptance must finish first; this change then creates
the deferred operations foundation and proves it only in an isolated namespace
on the approved `myserver` host, without activating the new production root or
changing the legacy service.

## What Changes

- Add strict operations-owned AMD64 release assembly and provenance validation
  that consume the formally accepted product revision/tree, build definitions,
  statement/compatibility contracts, and tool identities. Operations performs
  two new clean `linux/amd64` builds; it does not relabel the accepted
  Darwin/ARM64 artifact bytes as AMD64 or redefine product semantics.
- Add repository deployment definitions for the reserved production boundary
  `/srv/bgmss-v2`, Compose project `bgmss_v2`, and API publication
  `127.0.0.1:18080:8080`, including Compose, Prometheus, Nginx/systemd
  templates, secret interfaces, install/activation/rollback wrappers,
  retention checks, and operator documentation.
- Add read-only `operations.yml` verification, protected-tag `release.yml`,
  and approval-gated `deploy.yml`. Creating these workflows does not authorize
  running a release or deployment in this change. The current isolated
  validation candidate rebuilds the frozen accepted product identity; a later
  release run must instead prove the tag commit's product inputs equal that
  baseline and build every published artifact twice from the exact tag commit.
- Add deterministic tests and failure injection for manifest/checksum drift,
  lock contention, insufficient disk, interrupted installation, incompatible
  snapshots, failed readiness, rollback failure, foreign residue, secret
  leakage, and unbounded cleanup.
- Build a clean `linux/amd64` candidate from the accepted source identity and
  validate it on `myserver` only below `/srv/bgmss-ops-validation`, with
  Compose project `bgmss_ops_validation`, services `api`, `updater`, and
  `prometheus`, no named volumes, and API publication
  `127.0.0.1:19090:8080`.
- Capture a machine-readable preflight/result/resource manifest, prove
  readiness, metrics scrape, release/data rollback behavior, and cleanup, then
  re-enumerate the host to show that no live or foreign resource changed.
- Preserve oracle `644b7748674e553f863d0ffd61d029f86fdc0717`
  (`PRESERVE_ORACLE`): this change edits no frontend behavior or product
  contract. Repository operations, release, recovery, and isolated host
  validation are `NEW_CAPABILITY` governed by
  `tmp-formal-development/backend-operations-implementation-guide.md` and the
  operations boundary in `openspec/specs/contracts-rewrite-baseline/spec.md`.
  There is no `INTENTIONAL_DELTA`.

## Capabilities

### New Capabilities

- `operations-release-assembly`: Reproducible AMD64 release candidate
  assembly, strict release manifest/checksums, GitHub release/deploy workflow
  policy, and immutable provenance/secret boundaries.
- `operations-single-host-runtime`: Reserved single-host Compose,
  Prometheus, host-integration templates, activation, rollback, retention,
  security, and operator-recovery definitions for `/srv/bgmss-v2`.
- `operations-isolated-host-validation`: Exact collision preflight,
  run-owned installation, failure-path exercise, evidence, and bounded cleanup
  for the non-live `myserver:/srv/bgmss-ops-validation` namespace.

### Modified Capabilities

None. Existing Contracts, Backend, Updater, Frontend, development artifact,
release-identity, and development-acceptance requirements remain unchanged and
are consumed read-only.

## Impact

| Field | Declaration |
|---|---|
| Status | Investigated: complete; strict validation: passed; specified: pending main-agent review; implemented: no; verified: no; committed: no; pushed: no; released: no; deployed: no. |
| Owner | Operations owner, split into release/workflow, single-host runtime/recovery, and isolated-host validation apply groups. The main agent owns specification approval and final acceptance. |
| Writable paths | Repository: `operations/**`; `.github/workflows/operations.yml`; `.github/workflows/release.yml`; `.github/workflows/deploy.yml`; and only the exact root `.gitignore` addition `/operations/.tmp/`. Planning/lifecycle writes are limited to this change and its future synchronized `openspec/specs/operations-{release-assembly,single-host-runtime,isolated-host-validation}/spec.md`. External validation: only newly created regular files/directories below `myserver:/srv/bgmss-ops-validation/**`; Compose project `bgmss_ops_validation` resources for services `api`, `updater`, and `prometheus`; its project-labeled containers/network; the two artifact-declared Backend/Updater load tags; their two aliases `localhost/bgmss-ops-validation-{api,updater}:<accepted-product-revision>-amd64`; the exact pinned upstream Prometheus digest reference; and alias `localhost/bgmss-ops-validation-prometheus:<reviewed-version>-amd64`. All six image references must be named in the sealed input and proven absent before load/pull. API host publication is exactly `127.0.0.1:19090:8080`; no Docker named volume is permitted. Each of the three image identities has its refs, OCI manifest digest, config digest, and Docker runtime ID captured before any container starts. |
| Read-only protected inputs | `PRODUCT.md`, `DESIGN.md`, `VERSION`, all `tmp-formal-development/**`, oracle commit `644b7748674e553f863d0ffd61d029f86fdc0717`, `openspec/config.yaml`, every existing root spec and archived/active change outside this new change, `.github/workflows/ci.yml`, all `backend/**`, `updater/**`, `frontend/**`, `contracts/**`, the formally accepted product revision/tree and Darwin/ARM64 artifact evidence, Git history outside main-agent lifecycle actions, registries/releases/environments/secrets, and all external state except the declared validation namespace and exact six absent validation image references. On `myserver`: legacy `/srv/bgmss/**`; reserved-but-not-activated `/srv/bgmss-v2/**`; every other `/srv/**` path; all pre-existing Compose projects, containers, networks, images/tags, and volumes; `/etc/nginx/**`; `/etc/systemd/**`; Nginx/systemd runtime state; TLS material; secrets; public ports; host firewall; cron/timers; users/groups; legacy data/processes; and every port except the declared validation bind are read-only. |
| Deletion complement | No tracked repository file and no pre-existing remote path/resource may be deleted. Validation cleanup may remove only paths recorded as newly created by the same run below the exact validation root; containers/networks whose captured immutable ID plus Compose project/service/run labels still match; and each of the exact six run-created image references only when it still resolves to the captured manifest/config/runtime identity and no foreign container uses it. Unknown, replaced, shared, or pre-existing residue is preserved and reported. |
| Mutable refs | Repository worktree files listed above. Main-agent staging, commits, branch push, and OpenSpec sync/archive remain separate lifecycle actions. During validation only, the exact validation root, its run-owned `current-frontend` and `data/current.json` links/pointers, resources in Compose project `bgmss_ops_validation`, and the six sealed image references/three image identities are mutable. No other image/tag, Git tag, GitHub Release, GHCR object, Environment, secret, production pointer, systemd unit, Nginx route, or legacy ref is mutable. |
| Consumes | A completed, archived, fully green `complete-integrated-development-acceptance` result with exact verdict `development-accepted-operations-pending`; its frozen accepted product revision/tree; the accepted build definitions, statement schemas/validators, compatibility contract, exact toolchain/base identities, and Darwin/ARM64 evidence as provenance only; root application release identity; Archive/current/update-status contracts; accepted inactive validation Archive; and read-only `myserver` host/tool/resource facts. Operations itself builds and verifies two fresh clean `linux/amd64` component sets and assembles their AMD64 compatibility/release evidence. |
| Produces | Versioned operations definitions and tests; canonical release-manifest schema/document/checksum inventory; exact AMD64 candidate evidence; policy-audited operations/release/deploy workflows; production-boundary templates; activation and rollback entrypoints; operator runbooks; and a canonical isolated-validation result plus before/after non-interference and residue evidence. |
| Dependencies | Direct gate: `complete-integrated-development-acceptance` must be fully implemented, green, synchronized, archived, and leave a clean candidate before apply. Consumed capabilities include `contracts-rewrite-baseline`, `contracts-application-release-identity`, `contracts-artifact-compatibility`, `backend-build-artifact`, `updater-build-artifact`, `frontend-build-artifact`, `backend-container-listener`, `backend-observability`, `updater-development-status`, and the Archive compatibility/current-pointer contracts. |
| Deliverables | `operations/**`; the three named workflows; one exact `.gitignore` line; local static/unit/integration/failure-path gates; reproducible AMD64 release inputs; host-neutral production templates fixed to the reserved production identity; and isolated `myserver` validation/cleanup evidence. |
| Acceptance | Strict OpenSpec; exact-path and dirty-state preflight; shell/JSON/YAML/Compose/workflow policy tests; two identical clean AMD64 builds and offline component/compatibility/release-manifest verification; secret scan; local failure injection; production/validation rendering with exact project/root/port assertions; isolated host readiness, expected `dataVersion` and `bgmss_build_info`, Prometheus scrape, release/data rollback, signal/timeout/lock behavior, cleanup, zero foreign mutation, no residual validation project/process/port, and `git diff --check`. |
| Non-goals | Changing application/API/statistical/UI semantics; modifying product artifacts or their Contracts; creating a second updater/consumer; running production from source; committing secrets; publishing a tag, GHCR image, GitHub Release, or deployment; activating `/srv/bgmss-v2`; installing or changing Nginx/systemd/TLS/users/firewall; routing public traffic; production SLO certification; a real weekly Archive run; cutover; dual-stack migration; 14+7-day observation; `410`; or legacy retirement/deletion. |
| Operations deferred | Actual GHCR/GitHub Release publication, production Environment/secret setup, production deployment/activation, Nginx/systemd installation or reload, TLS/DNS/vhost change, real timer execution, production data activation, preview/public routing, migration/cutover, stability observation, and legacy retirement require later explicit state-changing approval even though their versioned definitions may be created here. |
| Stop/rollback conditions | Stop before writes if development acceptance is not green/archived, the frozen product checkout is dirty/mismatched, input identities disagree, AMD64 repeat builds differ, host architecture is not `x86_64`/`amd64`, required tools are absent/incompatible, the validation root or any of the six declared image references exists, project/service/port/path/image ownership is ambiguous, `127.0.0.1:19090` is occupied, disk capacity is insufficient, or any protected/live resource would change. After a run-owned mutation, stop further activation on digest/schema/readiness/metrics/timeout/lock/rollback failure; restore the last accepted run-owned pointer/link when possible, terminate only captured validation resources, conditionally remove only the identity-matching run-created image references and closed run-owned path manifest, preserve primary plus cleanup failure evidence, and never compensate by touching live/legacy state. |

This proposal authorizes one external-state interaction only: isolated
validation on the named host and namespace after the collision preflight. It
does not touch another repository. Apply is blocked until proposal, all three
specs, design, and tasks are complete, strict-valid, explicitly reviewed, and
approved by the main agent.
