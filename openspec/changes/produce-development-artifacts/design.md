## Context

Backend, updater, frontend, and shared wire/schema work already have independent
test and build gates, but final integrated acceptance needs immutable component
bytes and one cross-layer compatibility decision. The current source structure
supports narrow packaging without changing product code:

- Backend is a Go 1.26.5 module with a `cmd/api` entrypoint and a complete
  `backend/scripts/check.sh` gate.
- Updater is a Python 3.14.6/uv 0.11.32 one-shot package that already builds a
  wheel and exposes `doctor` and `contract-check`.
- Frontend is a Node 24.18.0/npm 11.16.0 Vite SPA with unit, type, build, and
  production-artifact checks.
- Contracts owns Archive schemas/goldens and OpenAPI. It is therefore the only
  valid owner for deciding whether independently built components may be used
  together.

The change is development-only. It can define and locally exercise container
images, but cannot publish, deploy, configure, schedule, or activate them.

## Goals / Non-Goals

**Goals:**

- Produce byte-reproducible Backend, Updater, and Frontend artifacts for one
  clean candidate tree and target platform.
- Bind every artifact to sorted checksums, a deterministic SPDX 2.3 JSON SBOM,
  and a strict component statement.
- Assemble those statements into one Contracts-owned compatibility manifest
  and prove the assembled set through artifact-only local smoke.
- Keep three implementation groups path-disjoint so Backend, Updater, and
  Frontend/Contracts work can proceed in parallel.
- Add least-privilege test/build-only CI without adding a publication path.

**Non-Goals:**

- Product behavior, API, statistics, frontend appearance/interaction, source
  architecture, or dependency upgrades.
- Signing, hosted provenance, package publication, registry push, GitHub
  Release, deployment, Archive activation, or production operations.
- Cross-platform byte identity. Reproducibility is defined for the same source
  tree, declared inputs, target OS/architecture, and pinned toolchain.

## Change Boundary

| Field | Declaration |
|---|---|
| Status | investigated and specified: complete; apply admitted at `665c300f10c2ba572caede29951e63ea2349da7c`; implemented: no; verified: no; committed: no; pushed: no; released: no; deployed: no |
| Owner | Apply group A owns Backend; group B owns Updater; group C owns Frontend/Contracts and alone assembles the manifest. Main agent owns admission, task markers, audit, acceptance, and repository lifecycle. |
| Writable paths | A: `backend/Dockerfile`, `backend/build/**`, and only persistent-inventory handling in `backend/scripts/check.sh`. B: `updater/Dockerfile`, `updater/build/**`. C: `frontend/build/**`, `frontend/package.json`, `frontend/vite.config.ts`, only persistent-inventory handling in `frontend/scripts/check-architecture.mjs`, `contracts/artifacts/**`, `.github/workflows/ci.yml`. OpenSpec lifecycle: only this change's `.openspec.yaml`, proposal, design, tasks, and `specs/**`; apply agents cannot edit them. |
| Read-only protected inputs | `PRODUCT.md`, `DESIGN.md`, all `tmp-formal-development/**`, oracle `644b7748674e553f863d0ffd61d029f86fdc0717`, root config, root specs and sibling changes, `contracts/openapi/openapi.yaml`, `contracts/schemas/**`, `contracts/goldens/**`, every Backend/Updater/Frontend path not explicitly writable, external repositories, refs/remotes, registries, hosts, services, secrets, and production state. |
| Deletion complement | None. No protected file may be deleted or moved. |
| Mutable refs | None. |
| Consumes | One clean accepted candidate tree; pinned component toolchains and locks; accepted Archive/OpenAPI contracts and the valid minimal local Archive fixture; existing full component checks; accepted health/metrics routes. |
| Produces | Three content-addressed component artifact sets, three checksum inventories, three SPDX SBOMs, three component statements, one compatibility manifest, one artifact-only local smoke harness, and one test/build-only CI workflow. |
| Dependencies | Exact direct IDs: `produce-immutable-archive`, `derive-position-catalog-and-cast`, `implement-backend-archive-consumer`, `implement-backend-http-and-observability`, `implement-image-proxy`, `implement-query-result-set`, `implement-statistics-series-sort-evidence`, `expose-dynamic-catalog`, `admit-public-collection-client`, `implement-bounded-query-cache`, `expose-rankings`, `expose-candidates`, `expose-person-detail`, `expose-partners`, `expose-co-star`, `implement-frontend-query-shell`, `implement-frontend-ranking-results`, `implement-frontend-person-inspector`, `implement-frontend-co-star-vertical`, `harden-frontend-design-and-accessibility`. All active changes must also be completed/archived before apply; this admission condition does not change the exact DAG edges. |
| Deliverables | Two digest-pinned Dockerfiles; per-component deterministic build/checksum/SBOM/smoke helpers; exact frontend build-config adjustments; Contracts schemas/validators/fixtures/coordinator; `.github/workflows/ci.yml`. Generated bytes remain ignored. |
| Acceptance | Existing component gates; two isolated byte-identical builds; offline checksum/SBOM/manifest validation; mixed/tampered input rejection; artifact-only updater/API/frontend smoke; CI policy audit; strict OpenSpec; exact-path/residue/diff checks. |
| Non-goals | Product edits, dependency upgrades, source refactors, signing/publication, Compose, release/deploy, activation, and production configuration or claims. |
| Operations deferred | nginx/systemd/timers/production Compose; users/paths/permissions/TLS/secrets; `current.json` activation, restart/rollback/cleanup and `update_activated`; registry/release/deploy/SSH; production scrape/alert/retention/SLO; cutover, observation, migration, and legacy removal. |
| Stop/rollback conditions | Stop on unfinished dependencies/active changes, unapproved spec, dirty admission tree, path overlap, unpinned base/tool, protected mutation, nondeterminism, checksum/SBOM/manifest disagreement, source-dependent smoke, UI behavior drift, credential/publication/deploy step, or Archive activation. Roll back only this change's uncommitted owned paths and ignored local `.tmp` outputs. |

Dependency direction is component source/lock/contracts → owner-local component
artifact and statement → Contracts validation/manifest → local smoke → later
`complete-integrated-development-acceptance`. No build capability may import or
modify another owner's source, and no component may decide cross-layer
compatibility.

## Decisions

### 1. Use a strict component statement as the parallel handoff

Each component build emits a deterministic JSON statement containing only a
schema version, component ID, candidate source revision/tree identity, target
OS/architecture, pinned toolchain/base-image facts, accepted compatibility
digests/ranges, a sorted artifact inventory, checksum-inventory digest, and
SBOM digest. Paths are normalized relative paths; absolute paths, usernames,
hostnames, build timestamps, random identifiers, and environment dumps are
forbidden.

The Contracts schema is created first by group C and is read-only to groups A
and B. Groups A and B may then build independently and hand off only their
artifact directory plus statement. Group C validates both statements before
assembling the final manifest. This avoids a shared build script that could
silently rewrite another owner's files.

Alternative considered: let one root build script inspect every component
directly. Rejected because it creates an over-broad coordinator owner and makes
parallel ownership, compatibility authority, and failure attribution unclear.

### 2. Reproducibility is proven from a clean candidate snapshot

Final acceptance creates a clean detached snapshot of the exact staged
candidate. Each component is built twice with fresh disposable output/cache
roots, the same target platform, the exact pinned toolchain, and a normalized
`SOURCE_DATE_EPOCH` derived from that immutable source identity when a file
format requires it. Tar entries are sorted and normalized; gzip headers, file
modes, UID/GID, and mtimes are fixed; Go uses reproducible link/path settings;
wheel and Vite inputs are lock-frozen.

An acceptance-capable producer SHALL derive the source revision and tree from
the canonical checkout it actually reads. Before copying source, building, or
publishing, it SHALL prove that `HEAD`, `HEAD^{tree}`, the index, tracked
worktree, and all untracked non-ignored paths describe one clean candidate.
That proof compares every tracked path's raw worktree bytes and executable
mode with the exact Git blob/mode, rejects `assume-unchanged`,
`skip-worktree`, and non-stage-zero index entries, and cannot be weakened by
repository-local attributes, filters, exclude configuration, or an untracked
ignore-control file. Source snapshots are materialized only from tracked
regular blobs in that candidate; ignored live-worktree files never enter them.
Caller-supplied revision, tree, or epoch values may only restate and exactly
match that derived identity; they cannot override it. Ignored owner-local
cache/output roots do not make the candidate dirty. A mismatch fails before
artifact output is created. Pure packaging functions may accept synthetic
fixtures for focused tests, but their output is not acceptance evidence unless
the production entrypoint has completed this checkout attestation.

Outputs are published locally only after validation into an owner-controlled
content-addressed directory. An existing content address with different bytes
is a hard failure; scripts never overwrite it. Generated output stays under
the build directory's ignored `.tmp/` subtree.

Alternative considered: accept only functional equivalence. Rejected because
checksums and compatibility manifests would not identify one immutable input.

### 3. Package the native deliverable and verify a pinned container definition

Backend emits a reproducible API binary bundle and local OCI image archive.
Its multi-stage Dockerfile pins every base by a literal, non-overridable
digest in each `FROM`, contains no source or build tool in the runtime stage,
runs as a non-root user, and accepts the Archive as a read-only runtime input.

Updater emits a reproducible wheel/bundle and local OCI image archive. Its
multi-stage Dockerfile likewise pins bases, installs the locked wheel/runtime
closure, contains no source or build tool, runs non-root, requires an explicit
one-shot command, and has no scheduler or activation wrapper.

Frontend emits a normalized static tar archive from the checked Vite `dist/`
tree. No web-server image is introduced because choosing production static
hosting belongs to operations.

Alternative considered: ship only container images. Rejected because native
artifacts make reproducibility/SBOM inspection and local smoke independent of a
registry, while Dockerfiles still prove the intended immutable runtime shape.

### 4. Use deterministic SPDX 2.3 JSON without new product dependencies

Owner-local build helpers derive dependency evidence from the Go module/build
metadata, `uv.lock`/built wheel metadata, and `package-lock.json`/static
artifact. SPDX document namespaces and element IDs derive from content digests,
not random UUIDs. Each document describes the exact artifact digest and locked
runtime closure and is validated offline by Contracts-owned validators.

No new runtime or frontend library is approved. If implementation requires an
SBOM library/tool that changes a product lock/module file, apply stops for a
spec amendment documenting purpose, alternatives, ownership, cost, integrity
pin, and a reproducibility gate.

Alternative considered: depend on an unpinned host `syft` executable. Rejected
because its version and output would be undeclared build inputs.

### 5. Contracts alone decides compatibility

The final manifest is canonical JSON and binds:

- one component statement/digest for Backend, Updater, and Frontend;
- one source revision/tree identity and compatible target platform;
- Archive manifest/SQLite schema compatibility and relevant accepted schema
  digests;
- the OpenAPI digest consumed by Backend and Frontend;
- artifact, checksum-inventory, and SBOM digests and sizes.

The assembler rejects unknown/duplicate fields, unsafe paths, missing/extra
files, digest/size drift, mixed source identity or platform, unsupported
Archive ranges, OpenAPI disagreement, incomplete/non-deterministic SBOMs, or a
statement that does not describe its actual artifact directory. It writes
nothing final until all inputs pass.

Alternative considered: trust component version strings. Rejected because
equal labels do not prove equal wire contracts or bytes.

### 6. Smoke only assembled artifacts and disposable local fixtures

The smoke coordinator creates a new disposable directory, materializes the
accepted valid-minimal Archive as a local fixture, and never touches an
existing Archive root or `current.json`. It then:

1. runs updater `doctor` and `contract-check` from the built wheel/image;
2. starts the built API with the disposable fixture mounted read-only, checks
   `/livez`, `/readyz`, and `/metrics`, then terminates it;
3. serves the static frontend artifact from a disposable loopback-only server
   and verifies the entry document and every referenced built asset.

Smoke rejects source-tree module imports, source mounts, undeclared network
access, artifact modification, fixture escape, and residual processes/files.
It does not run updater `produce`, activate data, or claim production readiness.

The coordinator itself is a checked-in test harness, not a distributed product
artifact. Before it uses any checked-in smoke helper, validator, or accepted
fixture, it SHALL prove that the canonical checkout is clean, that its
`HEAD`/tree equal the assembled manifest source identity, and that every such
control-plane path is a tracked regular non-symlink file from that tree.
Changing a helper or fixture without rebuilding the candidate therefore fails
before smoke. Product subprocesses still run from disposable working
directories with product source absent from import/search paths and without
source mounts.

Alternative considered: use Docker Compose. Rejected because Compose topology,
service policy, and production-like orchestration are explicitly deferred.

### 7. CI is least-privilege and statically auditable

`.github/workflows/ci.yml` grants only `contents: read`, uses pinned action
revisions, installs exact toolchain versions, runs existing component checks,
the reproducibility build, compatibility assembly, and local smoke, and ends.
It has no `packages`, `id-token`, `deployments`, environment, secrets, registry
login, push, upload-to-release, release, deploy, SSH, or activation step.
Container builds use local output only with `push=false`.

The Contracts tests parse the workflow and reject prohibited permissions,
events, commands, and action classes. Workflow creation does not authorize a
branch push or remote execution.

Alternative considered: add separate release and deployment jobs disabled by
conditions. Rejected because dormant production authority is still outside
this change.

### 8. Frontend build changes cannot redesign the product

Frontend changes are restricted to `frontend/build/**`, `package.json` scripts,
deterministic Vite build settings, and the exact persistent-inventory handling
in `scripts/check-architecture.mjs`. The inventory-only amendment must list
every tracked build file exactly and ignore only generated `build/.tmp/**`; it
cannot weaken dependency, source, HTML, architecture, or product gates. The
package lock remains a read-only reproducibility input. The owner may not edit
`index.html`, Vue, CSS, assets, tests, route behavior, API clients, or product
dependencies. The existing unit/type/build/artifact checks and accepted
oracle/design matrix remain the preservation evidence; this change adds only
artifact-byte and static-serving checks. There is no intentional visual or
interaction delta.

## Risks / Trade-offs

- [OCI output can inherit nondeterministic metadata] → Pin bases and toolchain,
  normalize timestamps/ownership, build twice from fresh roots, and compare
  bytes/digests before acceptance.
- [SBOM generation can omit transitive runtime dependencies] → Derive from
  authoritative locks plus built metadata and verify expected package closure
  offline.
- [Parallel builds can mix candidates] → Bind every statement to the same
  clean candidate tree/platform and let Contracts reject any mismatch.
- [Smoke may accidentally test source instead of artifacts] → Run from a
  disposable directory with no source on module/search paths and audit opened
  paths/arguments in tests.
- [CI policy can drift into release authority] → Validate the workflow as data
  and fail on write permissions, registry/release/deploy/SSH/environment or
  activation vocabulary/actions.
- [Strict reproducibility increases build time] → Run full duplicate builds at
  artifact acceptance/CI; owner-local focused tests may use one build while
  implementation is in progress.

## Migration Plan

1. After all exact dependencies and active changes are complete/archived and
   the main agent approves this strict-valid change, group C implements the
   statement/manifest contracts while groups A and B implement their disjoint
   build paths.
2. Each group runs focused tests and one owner-local build; group C also
   implements the frontend artifact.
3. From one clean detached candidate snapshot, run two isolated builds per
   component, assemble the compatibility manifest, and run artifact-only smoke.
4. Run existing full component gates, CI policy checks, strict OpenSpec, exact
   path/residue checks, and main-agent read-only acceptance.

There is no deployed-state migration. Before commit, rollback deletes only
this change's owned uncommitted files and ignored local outputs. After a local
commit, normal Git reversal is sufficient; no remote, release, deployed, or
production state exists.

## Open Questions

None. Any newly required dependency, writable path, publication mechanism, or
production behavior requires a reviewed spec amendment before apply continues.
