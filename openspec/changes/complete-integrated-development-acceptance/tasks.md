## Task Boundary

| Field | Declaration |
|---|---|
| Status | investigated: complete; specified: complete; implemented: no; verified: no; committed: no; pushed: no; released: no; deployed: no |
| Owner | One Contracts acceptance apply agent owns all implementation below `contracts/acceptance/**`; the main agent owns spec review/amendment, task markers, final acceptance, commits/push, and archive lifecycle. |
| Writable paths | Apply only `contracts/acceptance/**`. OpenSpec lifecycle only this change's `.openspec.yaml`, proposal, design, tasks, and `specs/**`, never edited by apply. Generated evidence only ignored `contracts/acceptance/.tmp/**`, absent at handoff. |
| Read-only protected inputs | Every other repository path, including Backend/Updater/Frontend source/tests/build definitions, existing Contracts artifacts/schemas/goldens/OpenAPI, `.github/**`, root docs/config, `.impeccable/**`, root specs and sibling changes; oracle `644b7748674e553f863d0ffd61d029f86fdc0717`; accepted artifacts/full Archive; external repositories, refs/remotes, registries, hosts, services, secrets, production state, and public Internet. |
| Deletion complement | None. The harness may remove only one exact run root that it created below `contracts/acceptance/.tmp/**` after containment/type/ownership checks. |
| Mutable refs | None. |
| Consumes | Archived `produce-development-artifacts`; one clean accepted product-candidate revision/tree named by the artifacts; one later clean harness/control revision/tree; three accepted component roots and compatibility manifest; caller-supplied official full inactive Archive; fixed oracle; existing gates; pinned current and historical-golden toolchains; caller-provisioned sealed caches; pinned browser. |
| Produces | Tracked acceptance CLI/libraries, schemas, matrix, budgets, exception registry, browser scenarios, tests, README, package/lock, and `.gitignore`; ignored canonical per-run result/evidence only. |
| Dependencies | Sole exact direct dependency `produce-development-artifacts`, completed and archived. Apply additionally requires no sibling active change and no dirty product candidate. |
| Deliverables | Only `contracts/acceptance/**`; no product change and no committed run output/cache/browser/Archive copy. |
| Acceptance | Input attestation; existing contract/component/race/artifact gates; full-Archive temporary runtime; immutable Updater and packaged API/UI E2E; oracle/browser matrix; development performance; negatives/residue; strict OpenSpec/exact-path/diff checks. |
| Non-goals | Product/test fixes or dependency changes outside owner, new behavior, Archive acquisition/production, live personal E2E, release/deploy/activation, production benchmark/resource/SLO/readiness claims. |
| Operations deferred | Production Compose/nginx/systemd/timers, users/paths/permissions/TLS/secrets, real activation/restart/rollback/cleanup/`update_activated`, registry/release/deploy/SSH, production monitoring/SLO, cutover/observation/migration/rollback drill/legacy removal. |
| Stop/rollback conditions | Stop on dependency/active-change/dirty-state mismatch, unreviewed artifacts, path overlap, missing/mixed/mutable input, undeclared dependency/network/state, product mutation, fixture-backed production path, oracle drift, timeout, residue, unbounded benchmark, or repair attempt. Roll back only uncommitted owned files and the validated owned run root. |

Forbidden throughout: `git reset --hard`, checkout-based rollback,
`git clean`, `git add -A`, broad recursive deletion, glob/derived deletion
targets, writes outside exact owned paths, ref mutation, and external-state
mutation. The apply owner reports exact files and commands but does not stage,
commit, push, sync, archive, or update task markers.

## 1. Apply admission and owned skeleton

- [ ] 1.1 Record branch, exact harness/control `HEAD`, tree,
  index/worktree/untracked state, active
  OpenSpec list, current and historical Query-golden tool versions, sealed
  cache identities, and owned-path preimage; verify
  `produce-development-artifacts` is completed/archived, this is the only
  active change, all four artifacts are strict-valid and main-agent approved,
  no protected product path or harness/control checkout is dirty, and
  `contracts/acceptance/**` has no conflicting owner. Record the distinct
  product-candidate identity named by the artifacts, the immutable cache
  preparation revision separately from that candidate, allow that revision
  difference only through the same exact 18-authority proof, and stop without
  mutation on every other mismatch.
- [ ] 1.2 Create only `contracts/acceptance/{bin,lib,schemas,test,browser}/`,
  a README, a narrow `.gitignore` for `.tmp/`, and the acceptance-only
  `package.json`/lock. Pin exactly one direct development dependency
  `@playwright/test`; use install scripts disabled and record the reviewed
  version, license, transitive closure, alternatives, local-only cost, and zero
  product-bundle impact.
- [ ] 1.3 Add an exact persistent-file inventory and a path-policy test that
  rejects symlinks, special files, nested OpenSpec/skills, unexpected direct
  dependencies, tracked `.tmp` output, or any file outside the declared
  acceptance inventory.

## 2. Closed contracts and canonical result core

- [ ] 2.1 Implement strict duplicate-key/fatal-UTF-8 JSON parsing and canonical
  JSON writing plus schemas for acceptance input, result, budgets, oracle
  exceptions, and matrix. Reject unknown fields, unsafe/absolute evidence
  paths, non-finite numbers, invalid units, duplicate IDs, and undeclared
  statuses. Require the result's closed cache-compatibility identity to bind
  the preparation/product/harness/oracle revisions, exact authority counts,
  cache seals, and canonical evidence digest without adding an input override.
- [ ] 2.2 Define the closed `matrix.json` with stable admission, owner-gate,
  artifact, full-Archive, runtime, API, browser/oracle, performance, and
  residue cell IDs; give every cell one owner capability, fixed command or
  scenario ID, required inputs/evidence, and finite timeout. Require
  `admission.sources` to bind the `preAdmission` cache-compatibility phase and
  the final residue/seal cell to bind `postCleanup`; require the result
  descriptor to store the evidence path/file digest and both phase digests,
  then update the matrix canonical digest.
- [ ] 2.3 Define `budgets.json` with the existing `<300 KiB` reachable initial
  JavaScript, `<=16 MiB` query-test binary, accepted cache logical bounds,
  `<30s` API hard bound, and finite readiness/browser/gate/suite limits; include
  one explicit development machine profile and forbid runtime overrides or
  learned widening.
- [ ] 2.4 Define the closed oracle exception registry for only exact
  approved-addition/dynamic-data slots, each mapped to a resolvable
  `PRODUCT.md`, `DESIGN.md`, or archived capability requirement; reject
  wildcards, whole-page masks, threshold changes, and runtime exceptions.
- [ ] 2.5 Implement the result state machine so fail-fast execution records all
  later dependent cells as `blocked`, required cells can never be skipped, a
  green verdict requires every cell `pass`, and bounded logs are represented
  only by run-relative path/digest/sanitized summary.

## 3. Immutable admission and isolated gate runner

- [ ] 3.1 Reuse the dependency's artifact and Git-checkout validators to attest
  the exact product-candidate revision/tree/blob modes, the distinct clean
  harness/control revision/tree, stage-zero indexes, hidden Git bits,
  replacement refs, untracked state, three component statements, target, and
  compatibility manifest. Prove the two trees differ only in
  `contracts/acceptance/**` and reviewed OpenSpec lifecycle paths while all
  protected product/artifact implementation blobs and modes remain identical.
  Add a closed raw-Git-blob reader for the exact 18 cache dependency
  authorities with replacement refs/lazy fetch disabled and fixed `100644`
  mode, while representing the two accepted-product-only Query module locks
  without inventing preparation blobs; add focused
  mixed/tampered/dirty/link/forbidden-diff/missing-object negative tests.
- [ ] 3.2 Implement the owned run-root allocator and exact cleanup policy with
  canonical containment, no-symlink directory walk, recorded ownership marker,
  bounded unique ID, sanitized environment, no inherited injection variables,
  output limits, and postcondition checks.
- [ ] 3.3 Materialize a no-hardlink local clone below the run root, detach it at
  the exact accepted candidate, re-attest its tree/blob/mode inventory, and
  prove the live harness/control checkout gains no worktree metadata, ref,
  index, cache, generated path, or dirty state.
- [ ] 3.4 Implement the fixed command registry/process runner with explicit
  executables/arguments/cwds/environments, process groups, timeouts, graceful
  stop, bounded forced cleanup, and stable owner attribution. Run the complete
  stateful matrix in one worker behind a separate parent supervisor; use a
  closed ordered cell/deadline checkpoint channel so the parent enforces every
  cell and suite timeout outside the worker event loop and exclusively writes
  a canonical fail/blocked result after killing a stalled owned worker
  closure. No input or environment value may add a shell command.
- [ ] 3.5 Wire existing Contracts verifiers, `backend/scripts/check.sh`,
  Updater pytest/mypy/Ruff/locked-build gates, Frontend full check, component
  artifact validators, and compatibility coordinator smoke to run only inside
  the isolated clone; use the historical Query-golden tools separately from
  the current product tools; seed only exact package/module/browser bytes from
  sealed caller caches with new inodes; for copied current-tool closures,
  preserve paths/bytes/sizes/kinds/safe links, deterministically remove every
  write bit, withhold execute bits until the complete copied tree is
  non-writable, and validate the full destination against that projected mode
  seal before use; fully inventory/seal all non-system
  runtime roots, including current/historical npm and CPython; fully
  inventory/seal the Query golden's owner-fixed historical npm root and GOROOT
  in place, cross-bind fixed executables and the `go`/`gofmt` frozen mirror,
  deny writes to every admitted runtime root, and re-seal after each owning
  gate; enforce offline package-manager modes plus host/Docker network denial;
  before any seed/process, prove all 13 package locks, `backend/go.mod`,
  `backend/go.sum`, `updater/uv.lock`, and the two accepted Product Query
  module locks across their exact applicable preparation/current owners,
  frozen bytes, and npm/Go/uv authority documents; allow the Query locks to be
  absent from `preparedFromRevision` only after proving their module/version set
  is a subset of the Backend-seeded source/target closure and every exact
  required module cache file is sealed and present; after Query A/B projection
  preparation, actually execute the locked Redocly lint against
  `.tmp/codegen-a/source/openapi/openapi.yaml`, require exit zero with zero
  errors and nine warnings, produce both Redocly bundles, and bind each locked
  `openapi-typescript` command to its own
  `.tmp/codegen-{a,b}/source/openapi/openapi.yaml` and reject the expanded
  shared OpenAPI, dereferenced bundles, or cross-fed projections;
  enforce the actual directed manifest-to-validation/plan bindings, record the
  canonical `preAdmission` evidence, repeat it as `postCleanup`, and bind both
  phases through the final evidence descriptor; record exact
  exit/duration/evidence digests without copying business assertions or
  misreporting an in-place closure, Go-validation scope, or absent frozen
  uv-lock byte.
- [x] 3.6 Make owner-gate generated-root cleanup exact and bounded under
  transient directory races. Preserve an originating command failure and its
  logs/code as primary when cleanup also fails, record cleanup as secondary
  evidence/residue, and fail the owner cell on cleanup alone after otherwise
  successful commands. Add focused primary-precedence, retry, and surviving
  residue tests.

## 4. Full Archive and packaged runtime

- [ ] 4.1 In a distinct `admission.archive` cell owned by
  `contracts-archive-manifest`, admit a separate frozen official provenance
  root containing canonical manifest, pinned Archive `latest.json`, exact
  release ZIP, and pinned common YAML. Validate the reviewed upstream
  commits/file digests, exact ZIP identity, safe/exact nine-member ZIP
  structure, all seven consumed member size/digests against the inactive
  Archive source accounts, both reviewed unconsumed member identities, and the
  common identity; then
  validate regular `manifest.json`/`bangumi.sqlite` through existing
  schema/digest/dataVersion/object/sentinel gates, generator compatibility,
  and reject missing/tampered provenance or checked-in
  minimal/self-consistent synthetic identities. Re-seal both input roots
  before/after.
- [ ] 4.2 Stream-copy the accepted version into the owned run root, derive one
  canonical development-only `current.json`, verify copied byte identities,
  make the tree read-only, run real Go consumer acceptance against that exact
  activation copy, and prohibit hard links, symlinks, writes beside the source,
  or use of a caller/production current root.
- [ ] 4.3 Run the immutable Updater artifact as non-root/read-only/networkless
  for `doctor` and `contract-check`, with only bounded tmpfs/interpreter state;
  verify exit JSON, input immutability, termination, and zero residue.
- [ ] 4.4 Load/start the packaged Backend artifact as non-root with read-only
  rootfs/full-Archive mount, dropped capabilities, bounded tmpfs, unique
  internal network and loopback-only exposure. Verify `/livez`, `/readyz`,
  `/metrics`, dataVersion, no source import, and clean bounded shutdown.
- [ ] 4.5 Implement real global API journeys from live catalog/results for
  rankings, candidates, person detail, partners, pair/group co-star,
  pagination/search/sort/view changes, malformed/limit/cancellation behavior,
  and cold/warm calls. Validate through accepted OpenAPI/golden consumers; do
  not hard-code full-Archive IDs or contact personal collection state.

## 5. Packaged browser and oracle evidence

- [ ] 5.1 Implement one loopback static server for the accepted packaged
  Frontend with history fallback and same-origin `/api/**` reverse proxy to the
  packaged Backend. Reject traversal, source fallback, mutable artifact bytes,
  arbitrary proxy targets, and any public/non-loopback browser request.
- [ ] 5.2 Materialize the fixed oracle from Git object
  `644b7748674e553f863d0ffd61d029f86fdc0717` without a ref/worktree mutation,
  build it from its lock using only pre-provisioned offline bytes in the run
  root, and verify oracle source/tree/build identity before parallel serving.
- [ ] 5.3 Implement Playwright real-data journeys for `/`, `/ranking`, and
  `/co-star`, including dynamic catalog/apply, ranking/candidates, person
  detail, partners, pair/group co-star, search/sort/page/view, theme/mode/share,
  cancellation/latest response, loading/error/empty, and clean navigation.
- [ ] 5.4 Implement the fixed-oracle shadow/golden comparison for normalized
  role/name/state DOM, geometry, typography/color/border/radius/shadow,
  visibility/focus/overflow/scroll/responsive facts, action traces, and paired
  screenshots. Apply only schema-valid exact exceptions and keep dynamic slot
  geometry/format/interaction under comparison.
- [ ] 5.5 Run Light/Dark at 360, 390, 779, 780, 1024, and 1440 CSS pixels with
  keyboard, visible focus/return, Escape, Drawer mask/inert, tooltip, scroll,
  reduced motion, overflow, duplicate IDs, accessible names, console,
  rejection, resource, and network observers. Permit only one explicit
  browser-aborted image-route cell that proves stable SafeImage error state
  without layout shift/retry/upstream escape; every other failed resource
  fails.

## 6. Development performance and fail-closed cleanup

- [ ] 6.1 Measure and record full-Archive source/table counts and bytes,
  artifact/compressed sizes, cold readiness/shutdown, cold/warm API duration
  and response bytes, Backend CPU/current memory/250 ms sampled-high-water
  memory/exact 1 GiB memory-and-swap hard-limit/OOM/cache/request facts, browser
  ready/action duration/transfer/request/DOM size, and complete machine, Docker,
  toolchain, and browser identity with explicit units. Never label the sampled
  high-water as an exact cgroup peak.
- [ ] 6.2 Enforce invariant and named-profile budgets without runtime override;
  label output only as development characterization and add negative tests for
  missing/non-finite/wrong-unit/exceeded/unbounded measurements.
- [ ] 6.3 Inventory pre/post process groups, listeners, containers, images,
  networks, mounts, run files, live tracked paths, supplied artifact roots, and
  full Archive. Maintain stable-identity ancestry ownership across
  `setsid`/environment/CWD/reparent escapes, kill only proven owned identities,
  and retain whole-host process drift as non-attributing diagnostics so foreign
  desktop processes are neither killed nor treated as owned residue. State the
  unprivileged sub-snapshot fork-observation boundary rather than guessing PID
  ownership. Convert any mutation, observed browser external-network attempt,
  successful non-loopback connection, owned residual state, cleanup error, or
  invalid canonical result to a blocking failure; record non-browser sandbox
  denial without inventing a syscall-attempt count. Cover synchronous worker
  stalls, microtask starvation, malformed/out-of-order checkpoints, lost
  workers, and worker-side late writes with parent-supervised negative tests;
  no partial worker result may be accepted as canonical. For loaded OCI
  images, treat an exact manifest Descriptor as content authority and the
  daemon `Id` as an opaque observed digest; accept descriptor-less identity
  only for the classic store with the exact config digest. Record the first
  post-load actual ID before remaining validation, remove only the exact
  run-owned tag, and fail residue if that tag disappears while the observed ID
  remains addressable.
- [ ] 6.4 Implement the exact final verdict/report wording and separate
  `specified`, `implemented`, `verified`, `committed`, `pushed`, `released`,
  and `deployed` fields. The CLI must never imply production readiness,
  release, deployment, activation, SLO, or completed operations.

## 7. Apply-owner verification and handoff

- [ ] 7.1 Run the acceptance package offline fresh-install gate with Node
  24.18.0/npm 11.16.0, install scripts disabled, exact
  dependency/license/inventory checks, separate Query-golden legacy-tool
  attestation, sealed-cache closure/copy/reseal checks, unit tests,
  tamper/dirty/link/timeout/network/residue negatives, and coverage of every
  matrix/result/error state. Cover earlier-equal and earlier-different
  preparation revisions plus drift/missing/duplicate/extra/reordered/wrong
  owner or mode for each package-lock owner, Backend Go pair, both
  accepted-product-only Query module locks, Query module-set subset/cache-file
  proof, uv dual authority, actual Redocly lint execution/count/source,
  materialization-fault cleanup, missing source object,
  directed-reference tamper, missing/reordered/
  inconsistent `preAdmission` or `postCleanup` phase, pre/post mutation, and
  result/evidence-file/phase-digest mismatch. Record exact commands and exits.
- [ ] 7.2 Run a focused local orchestration smoke with accepted existing
  fixtures/artifact inputs only to prove control flow and failure attribution;
  label it non-final and do not let a minimal fixture satisfy the full-Archive
  matrix cell.
- [ ] 7.3 With main-agent-selected accepted component roots and one official
  full inactive Archive, run the complete CLI, validate the canonical result,
  prove the immutable earlier-prepared cache against the final committed
  product/harness/oracle authority blobs, require every matrix cell pass and
  exact verdict
  `development-accepted-operations-pending`, then remove all run output before
  handoff.
- [ ] 7.4 Re-run strict validation for this change and all OpenSpec items,
  package/path/residue tests, `git diff --check`, exact owned-path diff, live
  protected-input seals, and `git status`. Report zero P0/P1 findings plus
  exact files/commands/statuses to the main agent; do not stage or commit.

## 8. Main-agent acceptance and lifecycle

- [ ] 8.1 Main agent audits the implementation against all four artifacts,
  verifies only `contracts/acceptance/**` changed, independently checks command
  closure, exact 18-file cache compatibility and its pre/post evidence,
  artifact/full-Archive identities, canonical result, oracle evidence, browser
  matrix, budgets, negative coverage, cleanup, and zero product/ref/
  external-state mutation; route any owner defect back without fixing it here.
- [ ] 8.2 After zero P0/P1 findings and focused harness verification, main agent
  commits the exact reviewed acceptance implementation. From that clean
  harness/control revision, run the complete matrix against the separately
  identified product candidate. Only after a green matrix, update task/status
  markers in a separate lifecycle commit, re-run strict validation/residue
  checks, and separately record whether it was pushed. Released and deployed
  remain false.
- [ ] 8.3 Main agent syncs/archives this change only after the accepted commit
  exists and final verification remains green, then reports:
  “正式新版开发验收完成；运维、发布、部署、生产迁移和旧系统退役尚未开始。”
  No operations work begins without a later user-approved OpenSpec.
