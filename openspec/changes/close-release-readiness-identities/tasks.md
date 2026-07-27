## Task Boundary

| Field | Declaration |
|---|---|
| Status | specified after strict validation; implementation not started |
| Owner | Main agent reviews specs and accepts results; three non-overlapping subagent implementation blocks |
| Writable paths | Exact paths declared in the proposal and grouped below |
| Read-only protected inputs | Product/design authorities, immutable oracle, frontend UI/runtime source, unrelated changes/specs, external repos/state |
| Deletion complement | None; only existing bounded fixture regeneration and ignored build-root cleanup |
| Mutable refs | Current branch through reviewed staged commits only |
| Consumes | Existing contracts, production producer semantics, component builders, acceptance failure evidence |
| Produces | Closed release-readiness production candidate and reproducible artifacts |
| Dependencies | Prior archived development capabilities; acceptance resumes only after this change archives |
| Deliverables | Code, regenerated authoritative fixtures, tests, and lifecycle records |
| Acceptance | Owner checks, cross-language negatives, reproducibility, strict OpenSpec, exact paths, no residue, diff hygiene |
| Non-goals | Product/UI changes, dependency upgrades, release/deploy/host mutation |
| Operations deferred | Following operations OpenSpec and isolated `myserver` validation |
| Stop/rollback conditions | Stop on preflight mismatch, unsupported rule ambiguity, UI/source drift, non-reproducibility, undeclared network/external write; remove only uncommitted owned output |

## 1. Contracts authority block

- [ ] 1.1 Preflight branch/HEAD/status, reviewed artifacts, exact writable
  paths, absent generated residue, and no overlapping implementation owner.
- [ ] 1.2 Make Catalog generation evidence declare and compile with the exact
  runtime plus UUID module closure; add fail-closed drift coverage and prove it
  with a fresh owned cache and denied public network.
- [ ] 1.3 Add the exact production domain/cast pair to the Archive
  compatibility tuple and regenerate minimal/vectors/derived SQLite,
  manifests, pointers, indexes, and producer-runtime input evidence using the
  existing bounded tooling.
- [ ] 1.4 Add root `VERSION`, application version, rule-pair fields, and
  compatibility-matrix digest to component/final compatibility schemas,
  validators, assemblers, fixtures, and tamper/mismatch tests.
- [ ] 1.5 Run Contracts schema/golden/catalog/artifact tests, repeated assembly,
  strict OpenSpec, exact inventory/path/residue checks, and diff hygiene.

## 2. Backend consumer and artifact block

- [ ] 2.1 Preflight branch/HEAD/status, reviewed Contracts authority, exact
  Backend writable paths, absent build residue, and no overlapping owner.
- [ ] 2.2 Make Archive admission compare domain/cast versions against the exact
  compatibility tuple before dataVersion/SQLite work and add wrong-pair
  precedence tests.
- [ ] 2.3 Implement releaseinfo defaults plus link-time `v0.1.0`/revision
  injection for both binaries, API observability propagation, and exclusive
  canonical `archive-smoke --build-info`.
- [ ] 2.4 Bind application/rule identity into Backend bundle metadata, OCI
  version/revision labels, component statement, and SPDX while preserving
  normal runtime and Archive-smoke output.
- [ ] 2.5 Run Go format/vet/test/race, Backend artifact source/toolchain tests,
  two fresh reproducibility builds, artifact-only smoke, exact paths/residue,
  and diff hygiene.

## 3. Updater and Frontend artifact block

- [ ] 3.1 Preflight branch/HEAD/status, reviewed Contracts authority, exact
  Updater/Frontend-build writable paths, absent build residue, and no
  overlapping owner.
- [ ] 3.2 Remove caller override authority for production domain/cast versions;
  consume the exact matrix tuple and add construction/contract negative tests.
- [ ] 3.3 Bind root application version and exact rule pair into Updater
  metadata, component statement, OCI labels, runtime bundle, and SPDX.
- [ ] 3.4 Bind root application version and exact compatible rule pair into
  Frontend artifact evidence without modifying frontend UI/runtime source or
  emitted visual/interaction behavior.
- [ ] 3.5 Run Updater format/lint/type/unit/property/build/reproducibility and
  artifact smoke, Frontend build/artifact/reproducibility checks, an exact
  frontend UI-source no-diff gate, paths/residue, and diff hygiene.

## 4. Integration, commits, and lifecycle

- [ ] 4.1 Main agent audits each block for spec conformance and zero P0/P1,
  runs cross-language Archive consumer/producer negatives, and verifies no
  frontend presentation/runtime file changed.
- [ ] 4.2 Assemble and verify two fresh three-component artifact sets for
  `linux/arm64`, reject mixed version/rule identities, and run artifact-only
  smoke.
- [ ] 4.3 Create staged commits by coherent owner block, push only after local
  gates pass, and distinguish implemented/verified/committed/pushed from
  released/deployed.
- [ ] 4.4 Sync and archive this change after all tasks pass, remove ignored
  outputs, and hand the clean revision to complete integrated acceptance.
