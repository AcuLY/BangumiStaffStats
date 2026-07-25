## Why

The completed backend, updater, frontend, and shared contracts still need one
repeatable development-only packaging boundary before integrated acceptance can
run against immutable bytes instead of source checkouts. This change adds that
boundary without starting release, deployment, activation, or production
operations.

## What Changes

- Build the Go API and Python updater as locally smokeable immutable component
  artifacts, and package the Vite production output as an immutable static
  artifact.
- Emit deterministic SHA-256 checksum inventories and SPDX 2.3 JSON SBOMs for
  every component artifact.
- Let the Contracts owner validate and assemble the three component statements
  into one versioned compatibility manifest bound to one clean source revision,
  target platform, Archive schema, OpenAPI, and component digests.
- Add a local, artifact-only smoke harness and a least-privilege GitHub Actions
  workflow that performs tests and local builds only.
- Require byte-identical repeated builds for the same source, platform, pinned
  toolchain, and declared build inputs. No product API, query semantics,
  appearance, interaction, copy, or responsive behavior changes.

## Capabilities

### New Capabilities

- `contracts-artifact-compatibility`: versioned component statements,
  checksums, SPDX SBOM validation, cross-layer compatibility manifest, and the
  artifact-only local smoke coordinator.
- `backend-build-artifact`: reproducible Go API bundle and digest-pinned local
  container definition.
- `updater-build-artifact`: reproducible updater wheel/bundle and digest-pinned
  local container definition.
- `frontend-build-artifact`: reproducible static frontend bundle with no
  user-visible behavior change.

### Modified Capabilities

None.

## Impact

### Status

- investigated: complete
- specified: main-agent approved after all four artifacts passed strict
  validation
- implemented: no
- verified: no
- committed: no
- pushed: no
- released: no
- deployed: no

### Owner

- Specification: one OpenSpec subagent; main agent reviews and may amend.
- Apply group A: one Backend implementation agent.
- Apply group B: one Updater implementation agent.
- Apply group C: one combined Frontend/Contracts implementation agent.
- Main agent owns dependency admission, task-marker updates, diff review,
  acceptance, and repository lifecycle. The three apply groups have disjoint
  source paths; group C alone assembles the cross-layer manifest after reading
  group A and B outputs.

### Writable/Owned paths

- OpenSpec lifecycle only:
  `openspec/changes/produce-development-artifacts/.openspec.yaml`,
  `openspec/changes/produce-development-artifacts/proposal.md`,
  `openspec/changes/produce-development-artifacts/design.md`,
  `openspec/changes/produce-development-artifacts/tasks.md`, and
  `openspec/changes/produce-development-artifacts/specs/**`. Apply agents SHALL
  NOT edit these paths.
- Backend group:
  `backend/Dockerfile` and `backend/build/**`.
- Updater group:
  `updater/Dockerfile` and `updater/build/**`.
- Frontend/Contracts group:
  `frontend/build/**`, `frontend/package.json`, `frontend/vite.config.ts`,
  `contracts/artifacts/**`, and `.github/workflows/ci.yml`.
- Generated local outputs SHALL stay below the owner-controlled ignored
  `backend/build/.tmp/**`, `updater/build/.tmp/**`,
  `frontend/build/.tmp/**`, or `contracts/artifacts/.tmp/**` roots created by
  this change.

### Read-only protected inputs

- `PRODUCT.md`, `DESIGN.md`,
  `tmp-formal-development/formal-development-master-plan.md`, all other
  `tmp-formal-development/**`, and oracle commit
  `644b7748674e553f863d0ffd61d029f86fdc0717`.
- All `openspec/specs/**`, all sibling active/archived changes, and all root
  repository configuration outside this change.
- `contracts/openapi/openapi.yaml`, `contracts/schemas/**`, and
  `contracts/goldens/**`.
- All `backend/**` except `backend/Dockerfile` and `backend/build/**`; all
  `updater/**` except `updater/Dockerfile` and `updater/build/**`; all
  `frontend/**` except the three exact frontend paths/prefixes declared writable
  above.
- The external `bangumi-collection-go` repository, remote refs, registries,
  releases, deployments, hosts, services, secrets, and production state.

### Deletion complement

None. Apply may replace files only inside its exact owned paths and SHALL NOT
delete or move any protected input.

### Mutable refs

None. This change does not create, move, push, or tag a ref.

### Consumes

- The clean committed source tree and pinned Go, Python/uv, Node/npm, and Vite
  inputs established by the nineteen direct dependencies below.
- The accepted Archive manifest/current-pointer schemas and valid minimal local
  Archive fixture, the OpenAPI document, package/module lock data, and existing
  component test/build commands.
- The already accepted `/livez`, `/readyz`, and `/metrics` development
  interfaces for artifact-only API smoke.

### Produces

- One content-addressed local artifact set per source revision and target
  platform: Backend API bundle, updater wheel/bundle, frontend static bundle,
  sorted SHA-256 inventories, and one SPDX 2.3 JSON SBOM per component.
- One strictly validated compatibility manifest that references only immutable
  artifact/SBOM/checksum digests and the accepted Archive/OpenAPI compatibility
  facts.
- One local artifact-only smoke entrypoint and one test/build-only CI workflow
  with no publication or deployment authority.

### Dependencies

The exact direct dependencies are:

1. `produce-immutable-archive`
2. `derive-position-catalog-and-cast`
3. `implement-backend-archive-consumer`
4. `implement-backend-http-and-observability`
5. `implement-image-proxy`
6. `implement-query-result-set`
7. `implement-statistics-series-sort-evidence`
8. `expose-dynamic-catalog`
9. `admit-public-collection-client`
10. `implement-bounded-query-cache`
11. `expose-rankings`
12. `expose-candidates`
13. `expose-person-detail`
14. `expose-partners`
15. `expose-co-star`
16. `implement-frontend-query-shell`
17. `implement-frontend-ranking-vertical`
18. `implement-frontend-co-star-vertical`
19. `harden-frontend-design-and-accessibility`

These are the exact DAG edges and SHALL NOT be replaced by a wave or aggregate
alias. Apply is additionally blocked until every active change at admission is
completed and archived; at specification time that includes
`complete-backend-development-observability`,
`implement-frontend-co-star-vertical`, `restore-frontend-oracle-fidelity`, and
`admit-public-collection-client`. This admission gate does not add or replace a
master-plan DAG edge.

### Deliverables

- Backend and updater digest-pinned multi-stage Dockerfiles plus narrow build,
  checksum, SBOM, reproducibility, and local-smoke helpers.
- Frontend build helpers and only the exact package/Vite changes required
  to emit and verify the immutable static artifact.
- Contracts-owned schemas/validators/fixtures for component statements and the
  compatibility manifest, a cross-component local smoke coordinator, and
  `.github/workflows/ci.yml`.
- No generated artifact bytes are committed; committed files are build
  definitions, validators, fixtures, and tests. Local outputs are ignored and
  content-addressed.

### Acceptance

- Each component passes its existing full test/check/build gate before
  packaging.
- Two clean builds with the same source revision, target platform, pinned
  toolchain, and declared inputs produce byte-identical component artifacts,
  checksum inventories, and SBOMs; a changed source or declared compatibility
  input changes the bound statement.
- Checksums are sorted, relative-path-only, complete, and verified before use.
  Every SPDX document is deterministic, validates offline, describes the
  artifact named by its digest, and includes the locked runtime dependency
  closure.
- The Contracts owner rejects mixed source revisions, platforms, unsupported
  Archive schema ranges, OpenAPI drift, missing/extra files, digest drift,
  malformed SBOMs, and component-statement substitution before writing the
  final manifest.
- Local smoke runs only from assembled artifacts and read-only contract
  fixtures: updater `doctor`/contract check, API startup plus
  `/livez`/`/readyz`/`/metrics`, and static frontend entry/asset serving all
  pass without importing product source or activating an Archive.
- CI has read-only repository permission, runs test/build/local-smoke only,
  performs no registry login or push, and contains no release, deploy,
  environment, production credential, or activation step.
- Strict OpenSpec validation, exact-path audit, residue audit, and
  `git diff --check` pass.

### Behavior classification

- `NEW_CAPABILITY`: local build artifacts, checksums, SPDX SBOMs, compatibility
  manifest, artifact-only smoke, and test/build CI.
- `PRESERVE_ORACLE`: the frontend artifact SHALL preserve the external
  appearance, interaction, copy, state, and responsive behavior of oracle
  `644b7748674e553f863d0ffd61d029f86fdc0717`, including every separately
  approved product/design addition.
- `INTENTIONAL_DELTA`: none.

### Non-goals

- Product-code fixes, new API behavior, new frontend behavior, dependency
  upgrades, source refactors, or edits outside the exact owned paths.
- Signing, provenance-service integration, public distribution, registry
  login/push, GitHub Release, package publication, deployment, or activation.
- Production Compose, reverse proxy, service manager, scheduler, secrets,
  resource limits, monitoring configuration, SLOs, or production performance
  claims.

### Operations deferred

Production Compose; nginx/systemd/timers; `/srv`, users, permissions, TLS, and
secrets; `current.json` activation; restarts, readiness rollback, cleanup, and
`update_activated`; registry push; release/deploy workflows; SSH/production
environment access; production scrape/alert/retention/SLO configuration;
cutover, observation windows, rollback drills, migration, and legacy removal.

### Stop/rollback conditions

Stop before mutation if any dependency or current active change is unfinished,
the tree is not clean apart from separately owned in-flight work, the main
agent has not approved all four strict-valid artifacts, an owned path overlaps
another agent, a required base/tool digest is unpinned, or a protected/external
path would need modification. During apply, stop on non-reproducible output,
checksum/SBOM/manifest disagreement, source import during smoke, network
publication, credential request, Archive activation, product-behavior drift,
or CI steps beyond test/build. Rollback is deletion of only this change's
uncommitted owned files and ignored generated `.tmp` outputs; no ref, remote,
deployed, or production rollback exists.

### External state

No other repository or external state is writable. Creating this workflow does
not authorize pushing the branch or running a remote workflow; any future push,
pull request, tag, release, registry operation, deployment, host mutation, or
production activation requires separate explicit authorization.

Apply remains blocked until proposal, specs, design, and tasks are complete,
strictly valid, and explicitly reviewed and approved by the main agent.
