## Task Boundary

| Field | Declaration |
|---|---|
| Status | investigated and specified: complete; apply admitted on `codex/formal-rewrite` at `665c300f10c2ba572caede29951e63ea2349da7c`; implemented: no; verified: no; committed: no; pushed: no; released: no; deployed: no |
| Owner | Main agent admits/reviews/marks/lifecycles the change. Apply group A owns Backend, B owns Updater, and C owns Frontend/Contracts. Apply agents do not edit OpenSpec artifacts, stage, commit, or mutate refs/remotes. |
| Writable paths | A: `backend/Dockerfile`, `backend/build/**`, and only the persistent-inventory handling in `backend/scripts/check.sh`. B: `updater/Dockerfile`, `updater/build/**`. C: `frontend/build/**`, `frontend/package.json`, `frontend/vite.config.ts`, only the persistent-inventory handling in `frontend/scripts/check-architecture.mjs`, `contracts/artifacts/**`, `.github/workflows/ci.yml`. Main-agent lifecycle only: this change's `.openspec.yaml`, proposal, design, tasks, and `specs/**`. Generated local output stays below each owned build/artifact `.tmp/**`. |
| Read-only protected inputs | `PRODUCT.md`, `DESIGN.md`, `tmp-formal-development/**`, oracle `644b7748674e553f863d0ffd61d029f86fdc0717`, root OpenSpec outside this change, root config, accepted `contracts/openapi/openapi.yaml`, `contracts/schemas/**`, `contracts/goldens/**`, all component paths not explicitly writable, external repositories, refs/remotes, registries, hosts, services, secrets, and production state. |
| Deletion complement | None. No apply task deletes or moves a protected file. |
| Mutable refs | None. |
| Consumes | Approved strict-valid four-artifact change; completed dependency trees; clean accepted candidate snapshot; pinned component toolchains/locks; accepted Archive/OpenAPI contracts and valid-minimal fixture; existing component quality gates. |
| Produces | Three immutable component artifact sets with checksums/SBOM/statements, one compatibility manifest, artifact-only local smoke, and test/build-only CI. |
| Dependencies | Exact direct IDs: `produce-immutable-archive`, `derive-position-catalog-and-cast`, `implement-backend-archive-consumer`, `implement-backend-http-and-observability`, `implement-image-proxy`, `implement-query-result-set`, `implement-statistics-series-sort-evidence`, `expose-dynamic-catalog`, `admit-public-collection-client`, `implement-bounded-query-cache`, `expose-rankings`, `expose-candidates`, `expose-person-detail`, `expose-partners`, `expose-co-star`, `implement-frontend-query-shell`, `implement-frontend-ranking-results`, `implement-frontend-person-inspector`, `implement-frontend-co-star-vertical`, `harden-frontend-design-and-accessibility`. All active changes at admission must also be completed/archived; when specified these are `complete-backend-development-observability`, `implement-frontend-co-star-vertical`, `restore-frontend-oracle-fidelity`, and `admit-public-collection-client`. |
| Deliverables | Two digest-pinned Dockerfiles; owner-local deterministic build/checksum/SBOM/statement/smoke helpers and tests; exact frontend build-config changes; Contracts schemas/fixtures/validators/assembler/coordinator; `.github/workflows/ci.yml`; ignored local outputs only. |
| Acceptance | Existing full component gates; two clean identical builds; checksum/SBOM/manifest positive and negative gates; artifact-only updater/API/frontend smoke; proportional packaged-frontend browser smoke; CI static policy audit; strict OpenSpec; exact-path/residue/diff checks. |
| Non-goals | Product/source behavior changes, dependency upgrades, signing/publication, Compose, release/deploy, activation, production configuration, or production claims. |
| Operations deferred | nginx/systemd/timers/production Compose; production paths/users/permissions/TLS/secrets; Archive activation/restart/rollback/cleanup/`update_activated`; registry/release/deploy/SSH; production monitoring/SLO; cutover/observation/migration/legacy removal. |
| Stop/rollback conditions | Stop on branch/HEAD/admission mismatch, unfinished dependency/active change, unreviewed/invalid spec, unleased dirty path, overlap, protected mutation, unpinned input, nondeterminism, evidence incompatibility, source-dependent smoke, UI drift, credential/publication/deploy/activation behavior, or residue. Roll back only exact uncommitted owned files with narrow patches and ignored `.tmp` outputs; never use `reset --hard`, checkout rollback, `git clean`, broad recursive deletion, `git add -A`, or external mutation. |

## 1. Main-agent admission and path leases

- [x] 1.1 Record the current branch and HEAD; prove each of the exact twenty
  direct dependency changes has completed its exit gate and every active change
  is completed/archived. Stop without apply on any missing dependency, active
  implementation, unapproved external-client admission, or authority conflict.
  Recorded `codex/formal-rewrite` at
  `665c300f10c2ba572caede29951e63ea2349da7c`: all 20 direct dependencies are
  archived and this is the only active change.
- [x] 1.2 Run
  `openspec validate produce-development-artifacts --strict` and
  `openspec validate --all --strict`; record explicit main-agent review/approval
  of proposal, four specs, design, tasks, exact paths, non-goals, and operations
  deferral before delegating. Both strict gates passed with all 44 items valid.
- [x] 1.3 Record the allowed initial dirty state, require no unowned changes,
  lease the exact A/B/C writable paths to three agents, and prohibit those
  agents from OpenSpec markers, staging, commits, refs/remotes, or external
  state. Generated output is allowed only in the four declared ignored `.tmp`
  roots. Admission began from a clean worktree. A owns only
  `backend/Dockerfile`, `backend/build/**`, and the exact persistent-inventory
  handling in `backend/scripts/check.sh`; B owns only
  `updater/Dockerfile` and `updater/build/**`; C owns only
  `frontend/build/**`, `frontend/package.json`, `frontend/vite.config.ts`,
  the exact persistent-inventory handling in
  `frontend/scripts/check-architecture.mjs`, `contracts/artifacts/**`, and
  `.github/workflows/ci.yml`.

## 2. Frontend/Contracts group: contract envelope

- [ ] 2.1 Preflight group C by printing branch, HEAD, and
  `git status --short`; verify they match the main-agent record, this change is
  strict-valid/reviewed, no C-owned path was dirty before its lease, and any
  later dirty path belongs exactly to group A or B. Stop safely on mismatch.
- [ ] 2.2 In `contracts/artifacts/**`, implement and test closed versioned
  schemas/validators plus positive/negative fixtures for component statements,
  canonical compatibility manifests, sorted checksum inventories, and
  deterministic SPDX 2.3 JSON. Cover duplicate/unknown fields, unsafe paths,
  missing/extra/substituted files, digest/size drift, mixed source/platform,
  Archive-range/OpenAPI drift, incomplete SBOM, host/random/time leakage, and
  deterministic input-order independence.
- [ ] 2.3 Publish the reviewed component-statement schema/fixture interface as
  a read-only handoff to groups A and B; do not assemble a final manifest or
  modify another owner's files before their independently validated statements
  exist.

## 3. Backend group

- [ ] 3.1 Preflight group A by printing branch, HEAD, and
  `git status --short`; verify they match the main-agent record, this change is
  strict-valid/reviewed, no A-owned path was dirty before its lease, and any
  later dirty path belongs exactly to group B or C. Stop safely on mismatch.
- [ ] 3.2 Implement `backend/Dockerfile` and `backend/build/**`: digest-pinned
  non-root multi-stage image, reproducible Go API binary bundle/local OCI
  archive, normalized content-addressed output, narrow ignore/cleanup handling,
  and no runtime source/build tools or publication/deployment behavior. Update
  only the persistent-inventory handling in `backend/scripts/check.sh` so it
  lists every new tracked build file exactly and ignores generated
  `backend/build/.tmp/**`; do not weaken any source, dependency, forbidden-file,
  deferred-feature, or product gate.
- [ ] 3.3 Emit and test the complete sorted SHA-256 inventory, deterministic
  SPDX 2.3 Go runtime closure, and strict Backend component statement bound to
  candidate source/platform, Archive compatibility, exact OpenAPI digest, and
  actual binary/image metadata. The production build entrypoint must derive
  and verify a clean checkout `HEAD`/tree/index/worktree/untracked identity,
  raw-compare every tracked blob/mode, reject `assume-unchanged`/
  `skip-worktree` and mismatched
  overrides before output, and include negative tests for tracked, staged,
  untracked, nested-ignore, local-filter, index-flag, and supplied-identity
  drift.
- [ ] 3.4 Run `cd backend && ./scripts/check.sh`, then the new Backend build
  check twice with fresh cache/output roots and compare every artifact,
  checksum, SBOM, and statement byte. Run the new non-root artifact-only API
  smoke against the accepted disposable read-only Archive fixture, verify
  `/livez`, `/readyz`, `/metrics`, unchanged fixture bytes, bounded termination,
  exact A paths, no residue, and `git diff --check`. Report exact commands and
  results without staging or task-marker edits.

## 4. Updater group

- [ ] 4.1 Preflight group B by printing branch, HEAD, and
  `git status --short`; verify they match the main-agent record, this change is
  strict-valid/reviewed, no B-owned path was dirty before its lease, and any
  later dirty path belongs exactly to group A or C. Stop safely on mismatch.
- [ ] 4.2 Implement `updater/Dockerfile` and `updater/build/**`: digest-pinned
  non-root multi-stage one-shot image, reproducible frozen wheel/bundle/local
  OCI archive, normalized content-addressed output, narrow ignore/cleanup
  handling, and no source/build tools, scheduler, activation, publication, or
  deployment behavior.
- [ ] 4.3 Emit and test the complete sorted SHA-256 inventory, deterministic
  SPDX 2.3 Python runtime closure, and strict Updater component statement bound
  to candidate source/platform, Archive producer compatibility, `uv.lock`, and
  actual wheel/image metadata. The production build entrypoint must derive and
  verify a clean checkout `HEAD`/tree/index/worktree/untracked identity,
  raw-compare every tracked blob/mode, reject `assume-unchanged`/
  `skip-worktree` and mismatched
  revision/tree/epoch overrides before output, and cover each drift class plus
  nested-ignore and hostile local-filter configuration with a negative test.
  Snapshot only candidate-tracked regular blobs and prove ignored live files
  cannot alter or enter output.
- [ ] 4.4 Run the exact Python 3.14.6/uv 0.11.32 frozen
  pytest/mypy/ruff/format/lock/wheel gates from `updater/README.md`, then the new
  Updater build check twice with fresh cache/output roots and compare every
  artifact, checksum, SBOM, and statement byte. Run source-free non-root
  artifact-only `doctor` and `contract-check`, prove no `produce`, scheduling,
  pointer/activation, undeclared network, or residue, and run exact B path plus
  `git diff --check` audits. Report exact commands/results without staging or
  task-marker edits.

## 5. Frontend/Contracts group: frontend artifact

- [ ] 5.1 In only `frontend/build/**`, `frontend/package.json`,
  `frontend/vite.config.ts`, and the persistent-inventory handling in
  `frontend/scripts/check-architecture.mjs`, implement the
  reproducible normalized static tar, content-addressed output, checksum/SPDX/
  Frontend statement generation, source-free loopback static smoke, and narrow
  ignore/cleanup handling. The architecture checker shall list every new
  tracked build file exactly while ignoring only generated
  `frontend/build/.tmp/**`; all dependency, source, HTML, architecture, and
  product gates remain unchanged. Add no product dependency and edit no Vue,
  CSS, asset, `index.html`, test, API, route, or product-behavior path. The
  production artifact check must derive and verify the clean checkout
  `HEAD`/tree/index/worktree/untracked identity by raw blob/mode state before
  copying the candidate, reject `assume-unchanged`/`skip-worktree`, and cover each drift class
  plus nested-ignore and hostile local-filter configuration with a negative
  test.
- [ ] 5.2 Run Node 24.18.0/npm 11.16.0 `npm ci` and `npm run check`, then the
  new Frontend build check twice with fresh dependency/cache/output roots and
  compare every static artifact, checksum, SBOM, and statement byte. Verify the
  exact OpenAPI digest, production-artifact denylist, no source maps/fixtures/
  prototype boot/direct `api.bgm.tv` image targets, exact C paths, no residue,
  and `git diff --check`.
- [ ] 5.3 Run the packaged static artifact from outside the source tree on a
  loopback ephemeral port; verify the entry and every referenced asset, no
  source fallback or byte mutation, clean shutdown, and proportional desktop
  plus mobile browser mount/console/network smoke. Reuse the already accepted
  oracle/design evidence and record that this build-only diff introduces no
  appearance, interaction, copy, state, or responsive delta.

## 6. Frontend/Contracts group: assembly, smoke, and CI

- [ ] 6.1 After groups A and B hand off owner-local outputs, validate all three
  statements offline and assemble the canonical compatibility manifest. Prove
  exact source/platform, Archive schema, OpenAPI, artifact, checksum, and SBOM
  agreement; rerun tamper/mix/order negative and deterministic assembly tests.
- [ ] 6.2 Implement the Contracts artifact-only smoke coordinator in
  `contracts/artifacts/**`: use a new disposable root and accepted read-only
  fixtures; run updater `doctor`/contract check, built API health/readiness/
  metrics, and static frontend serving without source imports/mounts, Compose,
  updater `produce`, Archive activation, external network, residual process,
  or input mutation. Before invoking any checked-in helper, validator, or
  fixture, attest that the clean canonical checkout revision/tree equals the
  assembled manifest and every invoked control-plane path is a tracked regular
  non-symlink file from that tree using raw blob/mode comparison; reject
  `assume-unchanged`/`skip-worktree` and negative-test dirty, mismatched, untracked, symlinked,
  substituted, nested-ignore, and hostile local-filter inputs before any
  product process. Add a regression that launches the Updater smoke helper
  from a disposable working directory under the coordinator's sanitized
  `PYTHONSAFEPATH=1`/no-`PYTHONPATH` environment, permits only an explicitly
  resolved attested sibling control-plane import, and keeps all product-source
  paths absent.
- [ ] 6.3 Implement `.github/workflows/ci.yml` with `contents: read`, pinned
  actions and exact toolchains, component tests/builds, reproducibility,
  compatibility assembly, and local smoke only. Keep container `push=false`;
  add a Contracts policy test that rejects write/OIDC/secret/environment/
  registry/package/release/deploy/SSH/production/activation authority or steps,
  and proves the final four-root residue audit rejects every non-`.tmp`
  untracked/generated path.
- [ ] 6.4 Run the Contracts positive/negative suites, two full clean local
  assemblies, artifact-only smoke, CI policy test, exact C path/residue audit,
  and `git diff --check`; report exact commands/results without staging or
  task-marker edits.

## 7. Main-agent integrated artifact acceptance

- [ ] 7.1 Audit every implementation diff against the three leases, all
  protected paths, dependency directions, no-new-library rule, frontend
  preservation boundary, no nested OpenSpec, and deferred-operations denylist.
  Return any product/source defect to its owning prerequisite change rather
  than expanding this change.
- [ ] 7.2 Stage only the exact approved change/product paths into an isolated
  candidate snapshot without `git add -A`; from a clean detached worktree run
  Backend `./scripts/check.sh`, exact Updater quality/build gates, Frontend
  `npm ci && npm run check`, all owner reproducibility checks, Contracts
  validation/assembly, artifact-only local and packaged-browser smoke,
  `openspec validate produce-development-artifacts --strict`,
  `openspec validate --all --strict`, and `git diff --cached --check`.
- [ ] 7.3 Prove generated artifact/cache directories are ignored and contain
  no staged files; verify exact staged paths, no untracked non-generated
  residue, no workflow or script can publish/release/deploy/activate, and all
  three component artifacts/checksums/SBOMs agree with the final compatibility
  manifest.
- [ ] 7.4 Record status fields independently: investigated, specified,
  implemented, verified, committed, pushed, released, and deployed. Only after
  zero-P0/P1 main-agent acceptance may the main agent update task markers and
  create a narrow local commit; pushed/released/deployed remain `no`.
- [ ] 7.5 Archive/sync this change only after the accepted local implementation
  commit, re-run strict-all and diff hygiene, and do not begin
  `complete-integrated-development-acceptance` until the archived capability
  and clean tree are verified.
