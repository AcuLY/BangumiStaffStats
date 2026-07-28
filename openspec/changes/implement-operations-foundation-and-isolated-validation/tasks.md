## Task Boundary

| Field | Declaration |
|---|---|
| Status | Investigated: complete; specified: complete after strict validation/main-agent approval; implemented, verified, committed, pushed, released, deployed: no at task creation. |
| Owner | Main agent reviews/amends specs, selects exact base/evidence, audits, commits/pushes, and performs lifecycle. Subagents own the disjoint substantive implementation groups below. A main-agent mechanical correction is allowed only under the root governance rule and never expands external state. |
| Writable paths | Foundation/release: `.gitignore` exact `/operations/.tmp/` line, `operations/{package.json,package-lock.json,lib/**,schemas/release-*.schema.json,release/**,test/helpers/**,test/release/**}`, `.github/workflows/{operations,release,deploy}.yml`. Runtime: `operations/{compose/**,config/**,prometheus/**,nginx/**,systemd/**,bin/**,runbooks/**,test/runtime/**}`. Validation: `operations/{validation/**,test/validation/**}`. Integration documentation: `operations/README.md`. Generated local state: `operations/.tmp/**`, absent at handoff. Planning/lifecycle: only this change and future synchronized root operations specs. Remote validation after admission: only `/srv/bgmss-ops-validation/**`, Compose project `bgmss_ops_validation` services `api`/`updater`/`prometheus`, project containers/network, API `127.0.0.1:19090:8080`, no named volume, and the six sealed previously absent image references/three captured image identities defined by the specs. |
| Read-only protected inputs | All root authorities/oracle/product/Contracts/build sources and evidence; `.github/workflows/ci.yml`; OpenSpec outside this change; other owner groups while concurrent; registries/releases/environments/secrets/refs. On `myserver`, `/srv/bgmss/**`, `/srv/bgmss-v2/**`, other `/srv/**`, all pre-existing Docker/Compose images/tags/volumes/networks/containers/projects, Nginx/systemd/TLS/DNS/firewall/users/cron, public listeners, legacy data/processes, and every undeclared path/ref. |
| Deletion complement | No tracked or pre-existing state. Only closed run-owned local `.tmp` paths, remote validation path inventory, captured project resources, and still-identity-matching run-created image references may be removed. |
| Mutable refs | Exact listed worktree files; main-agent commits/push/lifecycle; admitted validation root pointers/links and captured project/image refs. No tag, release, registry, Environment, secret, production/legacy ref, daemon, public route, or named volume is mutable. |
| Consumes | Archived authorized CI/remote development-acceptance lifecycle bundle and frozen product revision/tree; accepted build/contracts/tool identities; explicit `not-materialized-for-authorized-closure` prior-artifact status; full inactive/minimal Archives; approved Operations specs; read-only host facts. The formal Darwin/ARM64 matrix remains explicitly unexecuted. |
| Produces | Repository Operations implementation/tests/workflows, accepted-development receipt, two clean frozen-product AMD64 validation sets/candidate, tag-release policy, canonical host validation result, cleanup/non-interference evidence, synchronized/archived specs, and green Actions. |
| Dependencies | Complete and archive `complete-integrated-development-acceptance`; then foundation; release and runtime may implement in parallel after foundation; validation depends on both; clean AMD64 build depends on committed implementation; remote write depends on main-agent acceptance of read-only host preflight. |
| Deliverables | Every path and evidence named above; no generated or remote validation residue. |
| Acceptance | All three capability acceptance sets, exact commands below, zero P0/P1 main-agent audit, strict validation, staged commit boundaries, push, and green branch Actions; released/deployed remain false. Browser/oracle rerun is not applicable because exact path gates prohibit UI/product edits; preservation authority is the immutable oracle contract plus green Frontend source/artifact Actions evidence, not an unexecuted formal browser matrix. |
| Non-goals | Product or contract changes; use of ARM64 bytes as AMD64; production release/deploy/activation; Nginx/systemd/TLS/users/firewall/public-route mutation; real scheduled acquisition; SLO/cutover/observation; or legacy retirement/deletion. |
| Operations deferred | GHCR/GitHub Release/tag execution, Environment/secrets/forced-command setup, `/srv/bgmss-v2` mutation/start, host integration/reload, real timer/update, preview/cutover, stability windows, and old-stack cleanup. |
| Stop/rollback conditions | Every group stops on branch/HEAD/review/dirty/owned-path mismatch and preserves state for audit. Never use `git reset --hard`, checkout-based rollback, `git clean`, `git add -A`, broad recursive deletion, unresolved variables/globs as deletion targets, or writes outside the exact owner. Remote validation stops before writes on any collision/fact/space/identity ambiguity; after mutation it restores/cleans only captured run-owned state and preserves primary plus secondary faults. |

## 1. Admission and shared Operations foundation

- [ ] 1.1 **Foundation owner preflight.** After the development acceptance
  lifecycle bundle is synchronized, archived, committed, and explicitly
  authorized for Operations without a canonical formal result, verify branch
  `codex/formal-rewrite`; compare `HEAD` and `HEAD^{tree}` with the full
  main-agent-approved base OIDs recorded in the handoff; require a clean
  staged/unstaged/untracked non-ignored state; require no active change except
  this one; run
  `openspec validate implement-operations-foundation-and-isolated-validation --strict --json`;
  and stop without edits on any mismatch.
- [ ] 1.2 Record a canonical local authorization input below
  `operations/.tmp/inputs/**` that binds lifecycle status
  `development-acceptance-closed-by-authorized-ci-and-remote-evidence`, frozen
  product revision/tree, acceptance implementation, green Actions head/run,
  archived lifecycle commit, remote package/targeted counts, narrow Linux
  fixture exception, unexecuted formal cells, cleanup/audit facts, Operations
  base identity, accepted tool/build/contract identities, and exact
  `priorDevelopmentArtifacts.status=not-materialized-for-authorized-closure`.
  Reject fabricated prior component/compatibility digests, a formal result
  digest, or synthesized `development-accepted-operations-pending` verdict.
  Have the main agent compare it with the archived acceptance evidence before
  use.
- [ ] 1.3 Add only `/operations/.tmp/` to root `.gitignore`; create the
  Operations package/lock with exact Node 24.18.0, npm 11.16.0, Ajv 8.20.0,
  YAML 2.9.0, and a lock-selected patched `fast-uri` 3.1.4 closure; reject
  vulnerable YAML <2.8.3 and `fast-uri` 3.1.0/3.1.1/3.1.3; disable install
  scripts/audit/fund/update-notifier in fixed commands; and add final script
  names for release, runtime, validation, and aggregate gates so later owners
  do not edit package control files.
- [ ] 1.4 Implement shared canonical JSON, strict schema, SHA-256, subprocess
  environment, safe-path, immutable-output, run-root, and primary/secondary
  failure helpers under `operations/lib/**`, with path containment and
  identity tests under `operations/test/helpers/**`.
- [ ] 1.5 Add positive/negative schema fixtures and tests that reject duplicate
  JSON keys, unknown fields, non-canonical bytes, unsafe paths, malformed
  digests/OIDs/image refs, secret-shaped evidence, nondeterministic values,
  and overwrite of an existing content address.
- [ ] 1.6 Audit both library licenses, exact lock closure, advisory output, and
  absence from Frontend/API/Updater/host runtime; record the commands and
  decisions in the owner handoff without weakening a failure.
- [ ] 1.7 Run
  `npm --prefix operations ci --ignore-scripts --no-audit --no-fund`,
  `npm --prefix operations run test:foundation`,
  `npm --prefix operations run check:dependencies`,
  `git diff --check`, the exact owned-path diff, and `git status --short`;
  remove only run-owned `operations/.tmp/**`; report implemented/verified
  separately and do not stage.
- [ ] 1.8 Main agent audits the foundation at zero P0/P1, stages only its exact
  paths without `git add -A`, verifies the proposed index, and creates a
  foundation commit whose parent/base/path set is recorded before release and
  runtime groups start.

## 2. Release assembly and workflow policy

- [ ] 2.1 **Release owner preflight.** Verify the exact foundation commit,
  branch, strict-valid reviewed artifacts, clean state except any explicitly
  recorded disjoint Runtime-owner paths, and that all Release writable paths
  are otherwise unchanged. Stop on product/Contracts/runtime/validation path
  overlap.
- [ ] 2.2 Add the main-agent-audited canonical
  `operations/release/accepted-development.json` receipt plus receipt,
  `validation-candidate-v1`, tag-release-candidate-v1, and published
  `release-manifest-v1` schemas, canonical validators, and negative fixtures.
  Bind the authorized lifecycle/CI/remote/exception/unexecuted-cell evidence,
  frozen product, acceptance control, archived lifecycle, and Operations/tag
  identities separately; bind exact target,
  components, OCI graph/config, Backend `archive-smoke`, Frontend,
  compatibility/OpenAPI/Archive facts, Prometheus digest, checksums, and
  published-vs-unpublished state.
- [ ] 2.3 Implement the AMD64 build coordinator so it creates two distinct
  run-owned clean local Git checkouts of the exact frozen accepted product
  commit, proves raw Git cleanliness/modes/no hidden flags, installs exact
  frozen toolchains/dependencies in separate caches, prepends the exact Node
  24.18.0/npm 11.16.0 tool directory, sets
  `DOCKER_DEFAULT_PLATFORM=linux/amd64`, binds the selected Buildx/BuildKit
  identities, invokes the accepted Backend/Updater/Frontend build entrypoints
  for `linux/amd64`, and requires real Backend/Updater/coordinator AMD64 smokes
  to prove QEMU/binfmt execution. It independently verifies the new
  statements/artifacts, assembles compatibility, and compares the two complete
  sets byte-for-byte. It must reject ARM64 bytes as AMD64 and remove no
  source/evidence on failure.
- [ ] 2.4 Implement deterministic validation-candidate assembly, verification,
  checksum inventory, content-addressed publication below
  `operations/.tmp/**`, and tamper/mix/platform/archive/path/nondeterminism
  tests; never rewrite an upstream component statement or artifact.
- [ ] 2.5 Implement tag-release candidate and published-manifest verification
  without pushing: require the exact protected tag commit, prove all product/
  build/contract inputs equal the frozen accepted baseline and all intervening
  paths are limited to the exact audited `contracts/acceptance/**` restoration
  and fixes through `b56ce858`, its archived lifecycle/main spec, or approved
  Operations/lifecycle; double-build that tag commit, bind its new statements,
  then prove final GHCR graph/config/layer equivalence,
  immutable Frontend/checksum/compatibility bytes, tag/version, and Prometheus
  digest. Reject both validation and tag candidates at the production deploy
  boundary.
- [ ] 2.6 Create `.github/workflows/operations.yml` with relevant
  pull-request/push/manual triggers, exact tool/action pins, `contents: read`,
  local double AMD64 build/assembly/tests/residue, and no secret/login/upload/
  Environment/SSH/host state.
- [ ] 2.7 Create `.github/workflows/release.yml` for only a protected `v*` tag
  exactly matching `VERSION`, with job-scoped minimum contents/packages write,
  accepted-baseline comparison, two clean builds of that exact tag commit
  (never promotion of the validation candidate), GHCR digest verification,
  immutable Release assets, concurrency, conflict refusal, and no
  deploy/production authority.
- [ ] 2.8 Create `.github/workflows/deploy.yml` with only
  `workflow_dispatch`, strict version/manifest-digest inputs, one production
  concurrency group and Environment approval, one secret-reading deploy job,
  existing-release verification, and one bounded forced remote command; no
  checkout/build/arbitrary shell/mutable tag/second deployment implementation.
- [ ] 2.9 Parse all four workflows (including protected `ci.yml`) with
  duplicate-key rejection and test permissions, triggers, action pins,
  commands, environments, secret flow, uploads, registry, SSH, and host
  boundaries. Add adversarial fixtures for each forbidden authority.
- [ ] 2.10 Run
  `npm --prefix operations run test:release`,
  `npm --prefix operations run check:workflows`,
  `npm --prefix operations run check:release-schemas`,
  `git diff --check`, exact owned-path/residue checks, and strict OpenSpec.
  Record results, remove only run-owned temporary fixtures, and do not run any
  tag, login, registry push, Release creation, Environment, SSH, or deploy.

## 3. Single-host runtime and recovery definitions

- [ ] 3.1 **Runtime owner preflight.** Verify the exact foundation commit,
  branch, reviewed artifacts, and clean state except exact disjoint
  Release-owner paths recorded in the handoff. Prove no runtime owner file,
  product path, `/srv`, host, or external state has changed before editing.
- [ ] 3.2 Implement the single parameterized Compose model plus exact
  production interfaces/pins. Its validator SHALL accept only
  `/srv/bgmss-v2` + `bgmss_v2` +
  `127.0.0.1:18080:8080` or the exact isolated tuple; services are
  long-lived `api`/`prometheus` and one-shot `updater`; mounts are exact bind
  mounts; no named/legacy volumes, public metrics, mutable image tag, extra
  service, Docker socket, source, or undeclared secret is allowed.
- [ ] 3.3 Add runtime security/resource policy: explicit API
  `0.0.0.0:8080`, non-root users, capability drop/no-new-privileges, read-only
  API Archive/status, bounded Updater/Prometheus writers, API 1536 MiB,
  `GOMEMLIMIT=1024MiB`, Prometheus 512 MiB/7-day/512 MiB TSDB, journald, low
  priority Updater, exact request/update/readiness bounds, and a reviewed
  digest-pinned AMD64 Prometheus image.
- [ ] 3.4 Implement fixed host path/ownership/secret-interface preflight and
  rendering under `operations/bin/**`; accept only the reserved production
  tuple or sealed validation tuple, use restrictive umask/sanitized
  environment, never print secrets/environment dumps, and refuse symlink,
  device, owner, permission, free-space, or unknown-path ambiguity.
- [ ] 3.5 Implement the shared non-waiting `flock` and application install/
  activation transaction: strict version + published-manifest digest,
  checksums/compatibility/space, immutable install, captured previous
  image/Compose/Frontend refs, atomic switch, API restart, 60-second readiness,
  expected build/data/minimal query, canonical success/failure, and exact app
  rollback.
- [ ] 3.6 Implement the one-shot Archive wrapper: pinned Updater and exact
  `archive-smoke`, no-change/pre-switch failure behavior, six-hour timeout and
  low priority, new version validation, atomic current switch, restart/
  readiness/data/app checks, exactly one `update_activated`, previous-pointer
  rollback, and terminal manual-recovery state if previous also fails.
- [ ] 3.7 Implement separate application rollback, data rollback, run checks,
  and closed retention/cleanup. Refuse cross-dimension rollback, active/
  previous/symlink/device/foreign/unknown targets, broad recursion, and legacy
  volume deletion; preserve primary and secondary errors.
- [ ] 3.8 Add Prometheus scrape/retention config and reproducible checks for
  readiness, stale Archive, 5xx/upstream/queue/RSS/cache/oversize/update and
  app/data/manifest mismatch. Verify Prometheus failure cannot make API
  unready/restart and metrics/UI has no host/public bind.
- [ ] 3.9 Add inert Nginx and systemd templates: static current Frontend,
  approved API/image proxies to `127.0.0.1:18080`, private metrics, path-only
  `$uri` logs, `strict-origin-when-cross-origin`, no legacy host or
  `/statistics`, exact
  `OnCalendar=Sun *-*-* 03:30:00 Asia/Shanghai` plus `Persistent=true`, fixed
  oneshot, and no secret or free-form shell. Add syntax/static fixtures but no
  installation/reload.
- [ ] 3.10 Add operator runbooks for preflight/install/update/no-change/
  application rollback/data rollback/double failure/checks/retention/manual
  recovery. Every command must use the one fixed entrypoint and explicitly
  label repository-defined, installed, activated, released, and deployed
  states.
- [ ] 3.11 Run
  `npm --prefix operations run test:runtime`,
  `npm --prefix operations run check:compose`,
  `npm --prefix operations run check:host-templates`,
  `npm --prefix operations run check:secrets`,
  `bash -n operations/bin/*.sh`,
  `git diff --check`, exact owned-path/residue checks, and strict OpenSpec.
  Exercise success and every local injected failure; do not touch
  `/srv`, Docker, Nginx, systemd, TLS, or a remote host.

## 4. Isolated validation controller and payload

- [ ] 4.1 **Validation owner preflight.** Verify the exact reviewed Release and
  Runtime candidate path sets, branch/base OIDs, approved specs, and no
  Validation-owner drift. Treat all host state as read-only; no SSH command in
  this implementation group may write before the later Group 7 admission.
- [ ] 4.2 Add strict validation input/result/resource schemas and fixtures
  binding Operations/frozen-product/release-candidate identities, full/minimal
  Archives, exact host facts/root/project/services/API bind, all six image
  references and three manifest/config/runtime identities, path manifest,
  commands/durations, primary/rollback/cleanup status, and protected
  before/after evidence without secrets.
- [ ] 4.3 Implement a read-only SSH preflight that verifies
  `myserver`, `x86_64`/CentOS Stream 9/Docker 26.1.4/Compose 2.27.1,
  Nginx/systemd and required tools, disk/inodes, absent validation root/project/
  services/network/named volumes, free `127.0.0.1:19090`, and absence of all
  six image refs. Inventory protected root identities/static configs, projects,
  resources, listeners, and processes without reading secret/live-data bytes.
- [ ] 4.4 Implement the local sealed transfer and fixed remote payload:
  no free-form shell values; create only the absent validation root; closed
  file/path/mode/size/digest/device inventory; production-vs-validation render
  diff permitting only the exact tuple/release/evidence substitutions; and
  record each created object before load/pull/start.
- [ ] 4.5 Implement global image ownership: load the exact Backend/Updater
  archives, capture each artifact tag + OCI manifest/config + Docker runtime
  ID before aliasing, pull only the pinned Prometheus digest/architecture,
  create the three exact validation aliases, use `pull_policy: never`, and
  reject replacement/shared/colliding refs.
- [ ] 4.6 Implement artifact-only success validation: Frontend install/hash/
  link rollback, Updater `doctor` and embedded contract check, API minimal
  Archive startup, `/livez`, `/readyz`, expected data/build identities,
  minimal typed query, internal Prometheus scrape, minimal→full activation,
  full→minimal rollback, and final full reactivation. Never run real
  acquisition, Nginx/systemd, public routing, or product source.
- [ ] 4.7 Implement safe remote lock-contention and post-switch readiness
  failure/rollback exercises, and local disposable fault coverage for invalid
  manifests/platform/checksums, disk, interrupted staging, foreign
  replacement, updater no-change/failure/timeout, incompatible Archive,
  Frontend/app failure, previous failure, SIGTERM, and cleanup faults.
- [ ] 4.8 Implement identity cleanup: recheck container/network ID +
  project/service/run labels; recheck all image refs against captured
  manifest/config/runtime identity and foreign consumers; remove no image with
  force; remove files individually and directories bottom-up only from the
  unchanged closed manifest; preserve/report replacements and unknown entries.
- [ ] 4.9 Implement final non-interference/residue comparison and canonical
  result validation. Require validation root/project/resources/listener/
  process/six image refs absent, no named volume ever present, and protected
  before/after facts unchanged; state only isolated verification and keep
  released/deployed false.
- [ ] 4.10 Run
  `npm --prefix operations run test:validation`,
  `npm --prefix operations run check:validation-schemas`,
  `npm --prefix operations run test:remote-fixtures`,
  `git diff --check`, exact owned-path/residue checks, and strict OpenSpec
  entirely against local fakes/disposable roots. Do not contact `myserver`
  mutably or leave `operations/.tmp/**`.

## 5. Integrated repository acceptance and staged implementation commits

- [ ] 5.1 **Integration/documentation owner preflight.** Verify exact Release,
  Runtime, and Validation owner handoffs, no overlapping edits, no product/
  Contracts/`ci.yml` change, strict artifacts, and only the declared candidate
  paths dirty. Create `operations/README.md` only; it must route operators to
  fixed commands, distinguish local candidate/release/deploy/activation
  states, and repeat all current non-goals.
- [ ] 5.2 Run from a fresh dependency install:
  `npm --prefix operations ci --ignore-scripts --no-audit --no-fund`,
  `npm --prefix operations test`,
  `npm --prefix operations run check`,
  `npm --prefix operations run check:workflows`,
  `npm --prefix operations run check:compose`,
  `npm --prefix operations run check:host-templates`,
  `npm --prefix operations run check:secrets`,
  `openspec validate implement-operations-foundation-and-isolated-validation --strict --json`,
  `openspec validate --all --strict --json`, and `git diff --check`.
- [ ] 5.3 Audit exact tracked/untracked/ignored inventory, ensure generated
  state is only under then-removed `operations/.tmp/**`, prove every product/
  Contract/oracle/authority blob equals the approved base, and prove no nested
  OpenSpec root/skill, secret, credentialed remote, registry/login, release,
  Environment, SSH mutation, `/srv`, daemon, or Docker residue exists.
- [ ] 5.4 Main agent performs independent zero-P0/P1 spec/code/security/
  transaction/workflow review. Route substantive findings to the exact owner;
  direct fixes are limited to governance-approved simple corrections.
- [ ] 5.5 After zero P0/P1 and clean aggregate gates, main agent stages and
  commits exact reviewed path groups in useful phases (release/foundation,
  runtime/recovery, validation/docs) without `git add -A`; for each commit
  record parent, tree, subject, path list, staged diff/check, and statuses.
  Do not push until the clean AMD64/remote gates are ready unless the main
  agent explicitly chooses an earlier branch checkpoint.

## 6. Clean AMD64 candidate generation

- [ ] 6.1 **AMD64 execution owner preflight.** Require a clean committed
  Operations implementation, exact commit/tree approved by the main agent,
  archived authorized CI/remote acceptance input, frozen product OIDs, exact
  Node/npm/Go/uv/Docker/Buildx/BuildKit identities, sufficient local space,
  a working real AMD64 container-execution smoke on the admitted builder, and
  no existing target output address with different bytes. Reject the host
  default Node/npm when it differs from the admitted versions.
- [ ] 6.2 Set only task-specific absolute inputs, for example
  `BGMSS_OPS_ACCEPTANCE_INPUT=/absolute/path/to/accepted-input.json` and
  `BGMSS_OPS_AMD64_OUTPUT=/absolute/path/under/operations/.tmp/amd64`, then run
  with the exact Node 24.18.0/npm 11.16.0 directory prepended to `PATH` and
  `DOCKER_DEFAULT_PLATFORM=linux/amd64`,
  `npm --prefix operations run build:amd64 -- --acceptance-input "$BGMSS_OPS_ACCEPTANCE_INPUT" --output "$BGMSS_OPS_AMD64_OUTPUT"`.
  The command must create two isolated frozen-product checkouts/caches and no
  external ref or registry write.
- [ ] 6.3 Run
  `npm --prefix operations run verify:candidate -- --root "$BGMSS_OPS_AMD64_OUTPUT/published/<content-address>"`,
  upstream offline component/compatibility validators, and a second independent
  digest/inventory comparison. Require exact `linux/amd64`, byte-identical
  sets, product/controller identities, image graphs, Frontend/archive-smoke,
  Prometheus pin, and canonical candidate/checksums.
- [ ] 6.4 Main agent audits the candidate and records exact roots/digests and
  zero P0/P1. Preserve the accepted content-addressed input only until remote
  validation completes; remove all other run-owned checkouts/caches and prove
  no Git/Docker/process/residue escaped `operations/.tmp/**`.

## 7. Read-only admission and isolated `myserver` validation

- [ ] 7.1 **Remote execution owner preflight.** Verify the clean committed
  Operations controller and audited AMD64 candidate, then run only
  `npm --prefix operations run preflight:myserver -- --candidate /absolute/path/to/candidate`.
  It must perform read-only SSH checks and emit a canonical preflight; any
  unexpected host/tool/root/project/service/network/volume/port/image/path/
  listener/process/space fact stops with zero remote writes.
- [ ] 7.2 Main agent reviews the preflight against the exact boundary:
  `myserver:/srv/bgmss-ops-validation`, project
  `bgmss_ops_validation`, services `api`/`updater`/`prometheus`, no named
  volume, API `127.0.0.1:19090:8080`, all six image refs absent, and all
  `/srv/bgmss`, `/srv/bgmss-v2`, Nginx/systemd/TLS/public/legacy resources
  protected. Do not proceed on ambiguity.
- [ ] 7.3 After admission, set
  `BGMSS_OPS_VALIDATION_INPUT=/absolute/path/under/operations/.tmp/validation-input-v1.json`
  and run only
  `npm --prefix operations run validate:myserver -- --input "$BGMSS_OPS_VALIDATION_INPUT"`.
  The fixed controller must transfer/execute/collect/cleanup exactly as
  specified; communicate progress at intervals under 60 seconds during long
  image/archive transfer and runtime checks.
- [ ] 7.4 Validate the canonical result, success-path identities, safe failure/
  rollback exercises, path/resource/image ownership, absence of secrets, and
  final protected-state comparison. Independently rerun the read-only preflight
  and require the validation root/project/containers/network/listener/process/
  six image refs absent and no named volume.
- [ ] 7.5 On any primary/rollback/cleanup/residue/protected-drift failure, stop,
  preserve exact evidence, do not broaden cleanup or touch live state, and
  route the defect to its owner. On clean success, record the exact input/
  result/resource digests, tool/host facts, command exits, durations, and
  conclusion `isolated-operations-validated-production-not-activated`.
- [ ] 7.6 After main-agent evidence acceptance, remove only the verified
  run-owned local candidate/validation/checkouts/caches below
  `operations/.tmp/**`; prove that directory has no residue and the repository
  is clean. Released and deployed remain false.

## 8. Final lifecycle, push, and Actions acceptance

- [ ] 8.1 Main agent audits every task against proposal/design/specs, exact
  commits, AMD64 and remote evidence, cleanup, non-interference, and all
  protected paths; require zero P0/P1 and separately record investigated,
  specified, implemented, verified, committed, pushed, released, and deployed.
- [ ] 8.2 Mark only evidence-backed task/status fields complete, re-run the
  full aggregate/local strict gates and exact status/residue checks, then sync
  all three delta specs to root specifications and archive this change using
  the OpenSpec lifecycle skill. Validate the archived change and all root specs
  strictly.
- [ ] 8.3 Commit the exact OpenSpec lifecycle delta as a separate main-agent
  commit with recorded parent/tree/path set. Prove the final branch contains no
  active change, generated output, secret, or unexpected staged/unstaged/
  untracked/ignored state.
- [ ] 8.4 Push `codex/formal-rewrite` and monitor the new commit's
  `ci.yml` and `operations.yml` GitHub Actions runs. If a check fails, inspect
  exact logs, amend the relevant OpenSpec/owner implementation through the
  established rules, rerun local gates, commit/push the correction, and wait
  for green; do not run `release.yml` or `deploy.yml`.
- [ ] 8.5 Final report links exact repository artifacts/commits and summarizes
  AMD64/host evidence and remaining deferred production steps. The maximum
  operational claim is that repository Operations definitions passed isolated
  validation; no tag/image/Release was published and `/srv/bgmss-v2`, Nginx,
  systemd, TLS, public routing, and legacy state were not activated or changed.
