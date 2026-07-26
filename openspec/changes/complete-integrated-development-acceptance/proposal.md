## Why

All production capabilities and their immutable development artifacts are
accepted independently, but the repository still lacks one repeatable,
read-only decision that proves those exact parts work together. This final
development change adds that decision without repairing product code or
starting release, deployment, activation, or production operations.

## What Changes

- Add one Contracts-owned local harness that fails closed while orchestrating
  the existing Go, Python, TypeScript, schema/golden, artifact, and race gates.
- Exercise an accepted full inactive Archive through a disposable local
  current-pointer copy, the real packaged Backend API, the immutable Updater
  artifact, and the packaged Frontend; no production entry may import a
  fixture, prototype module, or test adapter.
- Run real global-scope API/UI journeys for ranking, candidates, person detail,
  partners, and co-star, including cancellation/latest-response and resource
  state checks already exposed by the production application.
- Compare the packaged Frontend with fixed oracle commit
  `644b7748674e553f863d0ffd61d029f86fdc0717` through a parallel shadow run,
  machine-readable DOM/geometry/style/interaction goldens, and bounded
  screenshot differences. Only an exception explicitly mapped to
  `PRODUCT.md`, `DESIGN.md`, or an accepted capability may pass.
- Run the Light/Dark browser matrix at 360, 390, 779, 780, 1024, and 1440
  pixels, with keyboard/focus, Drawer/scroll, overflow, duplicate-ID,
  console/unhandled-rejection, failed-resource, and network-origin checks.
- Characterize full-Archive startup, representative global queries, browser
  journeys, CPU, peak memory, and output sizes with reviewed development
  budgets. Emit a strict machine-readable result document, but keep every run
  result, screenshot, trace, process file, and copied Archive byte untracked
  and disposable.
- Make every failed matrix cell block the final development-acceptance verdict
  and point back to the owning capability. The harness never edits a failed
  owner and never weakens an expectation in order to pass.

## Capabilities

### New Capabilities

- `contracts-development-acceptance`: the final read-only development
  acceptance matrix, input attestation, full-Archive/API/UI/oracle/browser
  orchestration, development performance characterization, result schema, and
  fail-closed verdict.

### Modified Capabilities

None.

## Impact

### Status

- investigated: complete
- specified: complete
- implemented: no
- verified: no
- committed: no
- pushed: no
- released: no
- deployed: no

### Owner

- Specification: one OpenSpec subagent; the main agent reviews and may amend.
- Apply: one Contracts acceptance implementation agent.
- Final acceptance, task markers, repository lifecycle, and the final status
  statement: main agent.

### Writable paths

- OpenSpec lifecycle only:
  `openspec/changes/complete-integrated-development-acceptance/.openspec.yaml`,
  `openspec/changes/complete-integrated-development-acceptance/proposal.md`,
  `openspec/changes/complete-integrated-development-acceptance/design.md`,
  `openspec/changes/complete-integrated-development-acceptance/tasks.md`, and
  `openspec/changes/complete-integrated-development-acceptance/specs/**`.
  The apply owner SHALL NOT edit these paths.
- Apply implementation: only `contracts/acceptance/**`.
- Generated local state and evidence: only the ignored
  `contracts/acceptance/.tmp/**` root, which SHALL be absent at handoff.

### Read-only protected inputs

- All tracked and untracked repository paths outside this change's OpenSpec
  files and `contracts/acceptance/**`, including `PRODUCT.md`, `DESIGN.md`,
  `.impeccable/**`, `tmp-formal-development/**`, `.github/**`,
  `backend/**`, `updater/**`, `frontend/**`, `contracts/artifacts/**`,
  `contracts/openapi/**`, `contracts/schemas/**`, `contracts/goldens/**`,
  `openspec/specs/**`, and every sibling active or archived change.
- Oracle commit `644b7748674e553f863d0ffd61d029f86fdc0717`,
  the clean accepted product-candidate revision/tree named by the artifacts,
  the later clean harness/control revision/tree, the three component artifact
  roots, their compatibility manifest, and the caller-supplied full inactive
  Archive. The two repository identities are distinct and both are immutable
  inputs.
- Git refs/remotes, external repositories, registries, releases,
  deployments, hosts, services, secrets, production paths, production state,
  and the public Internet.

### Deletion complement

None. Apply may replace files only within `contracts/acceptance/**` and SHALL
NOT delete, move, clean, or rewrite a protected input. Cleanup may remove only
one run root that the harness itself created below
`contracts/acceptance/.tmp/**`.

### Mutable refs

None.

### Consumes

- The completed and archived `produce-development-artifacts` capability,
  including three accepted component artifact roots and their strict
  compatibility manifest from one clean product-candidate revision/tree and
  target platform.
- One later clean harness/control revision/tree containing only the accepted
  `contracts/acceptance/**` implementation and OpenSpec lifecycle changes on
  top of that product candidate. Every protected product and artifact
  implementation blob/mode SHALL still equal the candidate.
- A caller-supplied, immutable, inactive full Archive candidate produced by the
  accepted Updater, plus its dataVersion, manifest, and SQLite identities.
- A separate caller-supplied frozen provenance root containing the exact
  official release ZIP, `aux/latest.json` from pinned Archive revision
  `536b2864f8f23ee4ffd171ebfbe4c41fe1be2df1`,
  `subject_staffs.yml` from pinned common revision
  `6a8442c17143a870357a5ff812362e8b5cfe9f9d`, and one canonical provenance
  manifest. The official ZIP has a reviewed exact nine-member allowlist:
  seven consumed members bound to the inactive Archive source accounts and
  two fixed unconsumed upstream members. The harness admits these bytes
  offline and never fetches release metadata during a matrix run.
- Existing component checks, cross-language contract verifiers, Archive/API
  goldens, OpenAPI, race gates, production routes, fixed oracle commit,
  `PRODUCT.md`, `DESIGN.md`, and the accepted frontend capability specs.
- Pinned current Go, Python/uv, Node/npm, Docker/BuildKit, the exact historical
  Node/npm/Go identities still mandated by the authoritative Query golden, and
  a separately locked browser-test runtime owned only by
  `contracts/acceptance/**`.
- Caller-provisioned, immutable dependency caches whose complete lockfile
  closure and content seals are attested before the networkless acceptance
  matrix starts, plus independently attested exact tool paths and runtime
  closures. A cache MAY have been prepared from an earlier product revision;
  its recorded revision is preparation provenance, never the current product
  identity. Such a cache is reusable only when admission proves the exact
  byte/mode compatibility of the closed 18-file dependency authority:
  13 package locks (11 product, one harness, one fixed oracle),
  `backend/go.mod`, `backend/go.sum`, `updater/uv.lock`, and the accepted
  Product candidate's two
  `contracts/goldens/query/fixtures/go-module/*.lock` files, including the
  frozen npm inventory and Go/uv validation/closure-plan bindings. The two
  Query module locks MAY be absent from `preparedFromRevision`; in that case
  reuse additionally requires their closed module/version set to be a subset of
  the Backend-seeded source/target Go closure and every exact required module
  cache file to be present and sealed. Cache acquisition remains outside the
  harness; this compatibility attestation is required acceptance evidence.
- Exact non-system tool distributions SHALL have complete canonical runtime
  roots, inventories, content seals, and write-denial boundaries. This
  includes both installed npm package roots and the admitted CPython
  distribution, not only their launcher files.
- One reviewed owner-fixed exception covers the authoritative Query golden's
  hard-coded Node 24.16/npm 11.13 paths and
  `/opt/homebrew/Cellar/go/1.25.4/libexec` GOROOT. The harness SHALL inventory
  and seal those complete runtime roots, cross-bind `go`/`gofmt` to the frozen
  cache mirror, deny writes while the gate runs, and re-seal afterward. It
  SHALL NOT claim that these owner-fixed closures were copied to new inodes or
  substitute other paths.
- The official Archive release anchor is the exact
  `dump-2026-07-21.210441Z.zip` identity
  `sha256:e1120169088407c66a94dacacda4dffaabe0e2e08cbcc8238c880f6c0140dd57`
  with size `419054508`. The pinned `latest.json` is 539 bytes with SHA-256
  `f97498acdfff461603f14862b80211707e89250ed55f1883c60051d58b2d9f24`;
  the pinned common file is 37723 bytes with SHA-256
  `0d5ac602157e33114029df611ea9dd46df32997e57c3a361b9e6f92250304394`.

### Produces

- A tracked, versioned acceptance matrix; strict input, result, exception, and
  development-budget schemas; a local CLI/orchestrator; focused harness tests;
  and documentation, all below `contracts/acceptance/**`.
- For each run, one canonical machine-readable result and diagnostic
  screenshots/traces below the ignored run root. Results identify both the
  product-candidate and harness/control revision/tree, artifact manifest,
  Archive, oracle, toolchain, browser, cache preparation provenance and
  current-candidate compatibility evidence, host profile, commands,
  durations, memory, byte counts, and every pass/fail/blocked decision.
- Only a fully green run may emit the exact verdict
  `development-accepted-operations-pending`.

### Dependencies

The sole exact direct dependency is `produce-development-artifacts`. It SHALL
be completed and archived before apply. Its transitive closure supplies every
earlier Backend, Updater, Frontend, and Contracts capability; no wave alias or
additional direct edge is introduced. Apply is also blocked if any other
active change besides this acceptance change, a dirty product-code candidate,
or a dirty harness/control checkout exists at admission.

### Deliverables

- Contracts-owned CLI, schemas, matrix, oracle exception registry, browser
  scenarios, development performance budgets, tests, README, and pinned local
  acceptance dependencies under `contracts/acceptance/**`.
- A read-only orchestration path for existing contract/component/race gates,
  accepted artifacts, a full inactive Archive, real Backend API, immutable
  Updater artifact, packaged Frontend, oracle shadow, and browser matrix.
- No committed run result, screenshot, trace, Archive copy, tool cache,
  browser binary, build output, process file, or credential.

### Acceptance

- The exact dependency is archived in the harness/control revision; both
  repository identities are clean and attested; the harness/control revision
  differs from the accepted product candidate only in
  `contracts/acceptance/**` and reviewed OpenSpec lifecycle paths; all three
  component statements and the compatibility manifest bind the same accepted
  product-candidate revision/tree and target; the full Archive is immutable
  and compatible.
- Before any cache copy, install, component, container, API, or browser
  process, the harness proves the exact closed 18-file dependency authority
  across the immutable preparation commit, accepted product/harness/oracle
  commits, frozen cache bytes, and npm/Go/uv authority documents. It records
  preparation and current revisions in one canonical evidence envelope with
  distinct pre-admission and post-cleanup authority-set digests; the result
  binds the envelope's external file digest. It never rewrites or relabels the
  frozen cache manifest. A pre-admission missing object, wrong
  owner/path/mode/count/order, or byte/digest disagreement fails before any
  process; a post-cleanup disagreement blocks all later work and the verdict.
- Existing cross-language contract, component full-check, artifact-only smoke,
  Go race, and strict OpenSpec gates pass without source mutation.
- The Archive contract verifier runs with the complete hermetic Go workspace
  lock, including exact `GOWORK=off`. Its seeded npm and Go caches may be
  read-only after admission; owner cleanup validates the complete declared
  root before mutation, atomically quarantines and re-attests that same root,
  rejects special or externally linked files and unsafe links, makes only
  owned directories removable, and then performs the existing bounded cleanup
  without changing primary-error precedence. Quarantine acquisition and
  removal share one four-attempt transient-error budget. Cleanup starts only
  after the supervised owner closure has stopped and does not claim protection
  from a hostile same-UID foreign process racing inside its random quarantine.
  An npm-created relative symlink whose lexical target remains inside that
  exact root is an inventoried leaf: cleanup unlinks it without following or
  chmodding it.
- The Query owner gate actually runs the locked Redocly lint against the
  prepared `codegen-a` closed source projection and accepts only exit zero with
  exactly zero errors and nine warnings before either bundle or TypeScript/Go
  verification may establish a pass. Its exact Go verifier runs without an
  unsupported outer macOS sandbox only after the accepted Query owner binds
  `(deny network*)` into each of its four verifier-owned child sandboxes; all
  other Query commands retain Harness outer network denial. The Harness
  cross-binds that direct run to the accepted tracked verifier blob and
  strict-valid Query manifest: the manifest supplies each operation's exact
  profile text/digest, wrapper/child argv, cwd, environment and module seals,
  while the runtime summary must report exactly the four ordered operations,
  zero accepted stderr and eight `0600` two-file module-seal boundaries. The
  verifier and manifest are content-sealed before and after the command.
- The Archive verifier has the same narrowly reviewed macOS nesting exception.
  Its npm install remains offline under the Harness outer network sandbox, but
  the exact accepted `verify.mjs` command runs directly because it creates its
  own bootstrap and per-command `sandbox-exec` children. The Harness seals the
  verifier, package/lock, persistent Archive schema/builder/golden authority,
  installed locked dependency closure, and current Node/Go runtime authority
  before and after that command. It accepts only the exact direct
  Node/argv/cwd/environment/timeout, empty stderr, one bounded strict-JSON
  report, and the report's exact sixteen ordered Go/gofmt invocations under
  the accepted inner `(deny network*)` profile. Evidence identifies the
  verifier process and its non-Go local children as a direct reviewed boundary;
  it does not falsely claim an outer syscall sandbox for them.
- The harness runs the immutable Updater artifact checks and starts the
  packaged Backend against a disposable read-only copy of the supplied full
  Archive. Health, readiness, metrics, catalog, ranking, candidates, person
  detail, partners, co-star, cancellation, and shutdown checks pass against
  real process boundaries.
- The packaged Frontend alone drives the accepted real Backend routes. The
  production bundle contains no fixture/prototype/test import, no frontend
  statistical authority, and no direct Bangumi API/image-upstream request.
- Oracle shadow/golden and browser matrix cells pass at all required
  viewport/theme/state combinations. Approved additions are isolated by
  explicit exception records; unclassified appearance, interaction, copy,
  state, focus, or responsive drift fails.
- Development budgets and measurements are complete and machine-readable.
  They characterize the reviewed machine and full Archive only; they are not
  production SLOs or capacity claims.
- Any command failure, timeout, unexpected skip, missing evidence, input or
  output mutation, network escape, residual process/container/file, schema
  violation, or matrix failure prevents the green verdict.
- The formal `run` command is supervised by a separate parent process. The
  worker reports one closed, ordered cell/deadline checkpoint stream; the
  parent enforces every cell and suite deadline outside the worker event loop.
  A stalled worker is killed through its exact process group and owned
  descendant ledger, after which the parent performs guarded cleanup,
  re-sealing, and the canonical fail/blocked result write.
- Focused harness tests, a negative/tamper suite, strict OpenSpec validation,
  exact-path/residue audits, and `git diff --check` pass.

### Behavior classification

- `NEW_CAPABILITY`: the read-only integrated development-acceptance harness,
  matrix, schemas, budgets, evidence format, and verdict.
- `PRESERVE_ORACLE`: all existing frontend appearance, interaction, copy,
  state, focus, and responsive behavior remains governed by oracle
  `644b7748674e553f863d0ffd61d029f86fdc0717`.
- `INTENTIONAL_DELTA`: none. Existing approved production additions are
  exception inputs, not new deltas created by this change.

### Non-goals

- Any fix, refactor, test addition, dependency change, generated-wire update,
  schema/golden change, API behavior change, or frontend behavior/style change
  outside `contracts/acceptance/**`.
- Downloading or producing a new upstream Archive as part of the final
  decision, exercising personal queries that require mutable public-network
  state, or treating a tiny checked-in fixture as the full-Archive gate.
- Signing, publication, release, deployment, production activation,
  production load testing, production resource sizing, SLO certification, or
  a claim that operations or production readiness is complete.

### Operations deferred

Production Compose, nginx/systemd/timers, `/srv`, users, permissions, TLS,
secrets, real `current.json` activation, restart/readiness rollback, cleanup
and `update_activated`, registry/release/deploy/SSH, production
scrape/alert/retention/SLO, cutover, observation windows, migration, rollback
drills, and legacy removal.

### Stop/rollback conditions

Stop before apply if the dependency is active/unaccepted, another active
change exists, the candidate or protected input is dirty, the full Archive or
artifact set is absent/incompatible/mutable, the main agent has not approved
all four strict-valid artifacts, or implementation would need an undeclared
path, dependency, network, ref, or external-state mutation. Stop during apply
or acceptance on product/source mutation, fixture-backed production behavior,
oracle drift, unexpected network access, residual state, unbounded benchmark,
deployment/activation behavior, or an attempt to turn a failed cell into a
pass by editing another owner. Rollback deletes only this change's uncommitted
files and its own ignored run root; it never resets or cleans the repository.

### External state

The harness may create bounded loopback listeners and disposable local
processes/containers, read local Docker state, and read the declared full
Archive, immutable artifact roots, and caller-provisioned sealed caches. The
harness and every matrix cell SHALL NOT contact the public Internet or mutate
another repository, ref, remote, registry, service, host, production path, or
production state. Preparing the exact lockfile-pinned cache before admission
is a separate caller-owned tooling prerequisite; it SHALL write no repository
or production path and SHALL be frozen before its identity becomes an input.
Any push, pull request, tag, release, deployment, host mutation, Archive
activation, or later operations change requires separate explicit
authorization.

Apply is blocked until proposal, specs, design, and tasks are complete, pass
strict validation, and are explicitly reviewed and approved by the main
agent.
