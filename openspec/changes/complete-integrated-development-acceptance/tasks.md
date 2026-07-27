## Task Boundary

| Field | Declaration |
|---|---|
| Status | investigated: complete; specified: complete; implemented: no; verified: no; committed: no; pushed: no; released: no; deployed: no |
| Owner | One Contracts acceptance apply agent owns all implementation below `contracts/acceptance/**`; the main agent owns spec review/amendment, task markers, final acceptance, commits/push, and archive lifecycle. |
| Writable paths | Apply only `contracts/acceptance/**`. OpenSpec lifecycle only this change's `.openspec.yaml`, proposal, design, tasks, and `specs/**`, never edited by apply. Generated evidence only ignored `contracts/acceptance/.tmp/**`, absent at handoff. |
| Read-only protected inputs | Every other repository path, including Backend/Updater/Frontend source/tests/build definitions, existing Contracts artifacts/schemas/goldens/OpenAPI, `.github/**`, root docs/config, `.impeccable/**`, root specs and sibling changes; oracle `644b7748674e553f863d0ffd61d029f86fdc0717`; accepted artifacts/full Archive; external repositories, refs/remotes, registries, hosts, services, secrets, production state, and public Internet. |
| Deletion complement | None. The harness may remove only one exact run root that it created below `contracts/acceptance/.tmp/**` after containment/type/ownership checks. |
| Mutable refs | None. |
| Consumes | Archived `produce-development-artifacts` and `close-release-readiness-identities`; one clean accepted product-candidate revision/tree named by the artifacts; one later clean harness/control revision/tree; three accepted component roots and compatibility manifest; caller-supplied official full inactive Archive; fixed oracle; existing gates; pinned current and historical Query-golden toolchains; caller-provisioned sealed caches; pinned browser. |
| Produces | Tracked acceptance CLI/libraries, schemas, matrix, budgets, exception registry, browser scenarios, tests, README, package/lock, and `.gitignore`; ignored canonical per-run result/evidence only. |
| Dependencies | Exact direct dependencies `produce-development-artifacts` and `close-release-readiness-identities`, both completed and archived. Apply additionally requires no sibling active change and no dirty product candidate. |
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
  `produce-development-artifacts` and `close-release-readiness-identities` are
  completed/archived, this is the only active change, all four artifacts are
  strict-valid and main-agent approved,
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
  for the API Catalog's exact oapi-codegen v2.8.0 command, derive only the
  canonical one-version list beside the four accepted proxy files, use that
  run-owned `file://` proxy under the network sandbox, and re-attest the list
  immediately afterward;
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
  shared OpenAPI, dereferenced bundles, or cross-fed projections; keep every
  Query command under the outer network-denial sandbox except the exact
  `--verify-codegen-projections` command, which macOS requires to run directly
  so its verifier-owned child sandboxes can apply; lock that direct command's
  Node/argv/cwd/environment/timeout; pre/post seal the accepted tracked
  verifier plus strict-valid manifest; cross-bind the manifest's exact four
  operation plans (inner `(deny network*)` plus telemetry-write-denial
  profile/digest, wrapper/child argv, cwd, environment and module seals) to
  the successful runtime summary's exact ordered operations, zero stderr and
  eight `0600` two-file seal boundaries;
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
- [x] 3.7 Close the Backend owner sealed-toolchain handshake and cache
  lifetime. Require an absent target; eagerly seed the Harness-owned
  `backend/.cache/go-mod`; validate its exact Go 1.26.5 GOROOT; use the
  admitted Go to run one fixed offline module materialization command with
  `GOFLAGS=-mod=readonly`; and prove `backend/go.mod`/`go.sum` unchanged.
  Seal the complete expanded cache, invoke `backend/scripts/check.sh` only
  with exact `BGMSS_ACCEPTANCE_GOROOT` and no caller `GO_BOOTSTRAP` or legacy
  `BGMSS_GO_*`, and deny target writes in both the check and independent
  query-binary measurement. Re-seal unconditionally after each operation,
  preserve the first Backend command/measurement error as primary when
  seal/cleanup also fails, then remove only candidate-owned
  `backend/.cache` and `backend/.tmp` with bounded retries and fail on
  cleanup-only residue. Add focused plan/environment/order, materialization
  authority, write-denial, seal-mutation, success/failure precedence,
  upstream `module@version/.gitignore`, retry, and surviving-residue coverage
  without weakening Git path, ignore-control, or the bootstrap marker guard.
- [ ] 3.8 Close the Contracts cleanup inventory over all six installed API
  goldens. Remove each package's exact `node_modules`, `.cache`, and `.tmp`
  roots on success and failure before coordinator traversal, retain bounded
  retry and primary-error precedence, and fail on cleanup-only residue. Add a
  focused coordinator-control-plane test with ordinary dependency bytes and a
  `node_modules/.bin` symlink, plus an exact inventory assertion so a newly
  installed package cannot silently escape cleanup. Seed every schema-tooling
  npm cache only at its schema-root `.cache/npm`, never inside the inventoried
  `tooling` subtree, and cover all three exact placements and cleanup roots.
- [ ] 3.9 Close the formal Archive-owner environment and read-only-cache
  cleanup path. Pass exact `GOWORK=off` to the real Archive verifier. Before
  chmod or deletion, completely inventory each exact declared generated root
  without following links; reject a linked root/ancestor, absolute or escaping
  descendant link, special entry, and regular file with external hard links.
  Admit an npm-created relative symlink only as an un-followed leaf whose
  lexical target remains inside that root. Atomically rename the validated
  root to one absent private sibling quarantine, re-attest its root identity
  and complete relative inventory, then make only proven directories
  removable. Share one four-attempt transient-error budget across quarantine
  rename and removal while retaining primary-error precedence, cleanup-only
  blocking, and exact residue reporting/restoration. Run only after supervised
  owner-writer settlement; make no hostile same-UID concurrent-writer claim.
  Add focused coverage for the Archive environment, nested `0555` cache
  removal, real `.bin` cleanup, unsafe link/special/hard-link rejection without
  external mutation, transient rename retry, original-path rebind rejection,
  terminal quarantine residue, and primary precedence.
- [ ] 3.10 Keep the Archive `npm ci` under its offline outer sandbox, then run
  only the exact accepted Archive verifier directly so macOS can apply its
  verifier-owned bootstrap and Go/gofmt child sandboxes. Lock the direct
  Node/argv/cwd/environment/fifteen-minute timeout; pre/post seal the tracked
  verifier, package/lock, persistent Archive schema/builder/matrix/golden
  authority, installed dependency closure, and admitted current
  Node/npm/Go/gofmt/CPython runtime authority. Require exit zero, no
  timeout/signal, empty stderr, one bounded strict-JSON report, exact six
  schemas, quicktype 26.0.0, effective Go environment, bootstrap/discovery
  authority, structurally closed telemetry diagnostics whose derived
  `changed` value is recorded but not blocking, and exactly sixteen ordered
  Go/gofmt command records under the exact inner network/telemetry-write
  denial profile. Report non-Go children honestly as direct local children.
  Add focused tests for nested-sandbox regression, exact plan execution,
  forged/truncated/stderr reports, authority changes, wrong schema/order/count,
  profile/executable/cwd/argv/environment drift, and post-command re-seal.
- [x] 3.11 Admit the release-readiness lifecycle delta only through the exact
  product-side active prefix, harness-side dated archive prefix, and six
  reviewed main-spec files for `close-release-readiness-identities`. Require
  both exact dependency archive directories in the harness tree. Add focused
  positives for the real lifecycle delta and negatives for a wrong archive
  date, sibling change, extra main spec, or any product/runtime path.
- [ ] 3.12 Correct the Catalog Go proxy lifetime exposed by formal
  `owner.contracts` execution. Copy only the four admitted oapi-codegen v2.8.0
  proxy assets with new inodes into a dedicated run-control proxy outside the
  verifier-owned `.cache`, create the exact read-only one-version list there,
  pass exact `GOWORK=off`, and re-attest the list immediately after the
  Catalog command. Add focused coverage proving the verifier may remove its
  private cache without making the proxy authority disappear, while a reused
  inode, nested proxy, missing/changed list, or wrong Go environment fails
  closed.
- [x] 3.13 Correct the `admission.tools` parent-supervised timeout exposed by
  two formal cold-closure runs. Set the closed matrix and result-schema
  authority to exactly 600,000 ms for this cell only; keep source attestation,
  current-tool/browser new-inode copying, projected re-sealing, and candidate
  clone materialization inside the same supervised cell; add an exact
  matrix/schema synchronization assertion; and retain the two-hour suite
  watchdog, fail/blocked state machine, no-runtime-override rule, and timeout
  negative coverage unchanged.
- [x] 3.14 Correct the Backend module-set widening exposed by formal
  `owner.backend` execution. Rename the misleading materialization command ID
  from `owner-backend-go-mod-download-all` to exact
  `owner-backend-go-mod-download` and change its argv from
  `["mod", "download", "all"]` to exact `["mod", "download"]`; retain
  `GOPROXY=off`, `GOSUMDB=off`, network denial, the accepted Go/GOROOT,
  module-source seals, target lifetime, error precedence, and all later
  write-denial/re-seal boundaries. Add focused rejection of the obsolete ID,
  `all`, module patterns/queries, or any non-off proxy and prove the
  no-argument command materializes the frozen build/test closure without
  changing `go.mod`, `go.sum`, or the seeded download/toolchain authority.
- [ ] 3.15 Close the checksum-authorized tidy closure exposed by the next
  formal `owner.backend` execution. Derive the exact canonical sorted unique
  62-record content set from non-`/go.mod` checksums in accepted
  `backend/go.sum`, order literal `${module}@${version}` values with
  ECMAScript `localeCompare(other, "en")`, and require terminal-LF
  newline-list SHA-256
  `65d2972c8632a90b2e3331071db6016db037480e7fe04a615e44931656f31bb7`,
  and prove each exact version has the admitted four-file seed. Change the
  existing closed materialization argv to
  `["mod", "download", "--", ...contentSet]` before the cache seal; reject
  `all`, patterns, `.mod`-only/floating/substituted versions, set/count/order
  drift, or non-off proxy. Validate the exact 62 zero-byte `0644` single-link
  content-derived lock paths and their canonical path-list SHA-256
  `0429a1eb475367e7950d45e11c826632893b8a08892b78985da17bedb30e7f28`,
  unlink only those contained paths, and reject missing/extra/changed/surviving
  locks or module/source/seed mutation. Prove the unchanged Product
  `go mod tidy` then succeeds under full target write denial and retain command
  identity, error precedence, evidence, later query measurement, and cleanup
  boundaries.
- [ ] 3.16 Close the Backend test-loopback boundary revealed by the
  checksum-closure A/B. Replace the Backend check's blanket network denial
  with one exact deny-all profile that re-allows only inbound local-address
  and outbound remote-address `localhost:*`, while retaining literal/subpath
  write denial over the sealed Go cache. Prove an ephemeral loopback
  listener/client succeeds and representative public TCP is denied; reject
  every broader profile; and keep materialization plus independent
  query-binary measurement fully networkless. Run the unchanged complete
  Product check under that profile and prove source/cache seals remain fixed.

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
- [ ] 6.5 Correct the orderly terminal-failure settlement exposed by formal
  `owner.backend` execution. Bifurcate worker code zero from code one before
  release/result validation: retain strict green validation only for zero;
  for one acknowledged failed cell, close the worker closure, run common
  parent cleanup exactly once, re-seal, and emit the canonical fail/blocked
  result with the direct cell failure as primary. Cover parent-prepared images
  before runtime handoff, already-released resources, cleanup failure/true
  residue as secondary, and later evidence/canonicalization failures without
  duplicate cleanup or `SUPERVISOR_RESULT_INVALID` misclassification.

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
