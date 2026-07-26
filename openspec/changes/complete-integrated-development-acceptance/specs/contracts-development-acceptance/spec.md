# contracts-development-acceptance Specification

## Capability Boundary

| Field | Declaration |
|---|---|
| Status | investigated: complete; specified: complete; implemented: no; verified: no; committed: no; pushed: no; released: no; deployed: no |
| Owner | One Contracts acceptance apply agent implements only this capability; the main agent reviews the specification and owns final acceptance and repository lifecycle. |
| Writable paths | Apply: only `contracts/acceptance/**`. OpenSpec lifecycle: only this change's `.openspec.yaml`, proposal, design, tasks, and `specs/**`; apply cannot edit them. Generated evidence: only ignored `contracts/acceptance/.tmp/**`, absent at handoff. |
| Read-only protected inputs | Every path outside the exact owned paths, especially Backend/Updater/Frontend source/tests/build definitions, existing Contracts artifacts/schemas/goldens/OpenAPI, root documents/config, `.impeccable/**`, root specs and sibling changes; fixed oracle `644b7748674e553f863d0ffd61d029f86fdc0717`; accepted candidate/artifact/full-Archive inputs; external repositories, refs/remotes, registries, hosts, services, secrets, production state, and public Internet. |
| Deletion complement | None. Cleanup may delete only one harness-created run root below `contracts/acceptance/.tmp/**` after exact containment, type, and ownership validation. |
| Mutable refs | None. |
| Consumes | Archived `produce-development-artifacts`; one clean accepted product-candidate revision/tree named by the artifacts; one later clean harness/control revision/tree; three component artifact roots and compatibility manifest; caller-supplied official full inactive Archive; existing component/contract/race/artifact commands; fixed oracle; pinned current and historical-golden toolchains; caller-provisioned sealed caches; pinned browser. |
| Produces | A versioned closed matrix, strict input/result/budget/exception schemas, local orchestrator, browser scenarios, focused/negative tests, README, and ignored per-run evidence. Only a complete green result emits `development-accepted-operations-pending`. |
| Dependencies | Sole exact direct dependency: `produce-development-artifacts`, completed and archived. Apply also requires no active change besides this acceptance change, no dirty product candidate, and no dirty harness/control checkout. |
| Deliverables | Only tracked source/config/schema/test/lock/docs below `contracts/acceptance/**`; no generated run result, screenshot, trace, browser, cache, Archive copy, process file, or credential. |
| Acceptance | Immutable-input attestation; existing cross-language/component/race/artifact gates; full-Archive disposable runtime; immutable Updater artifact checks; packaged Backend/API/Frontend E2E; oracle shadow/golden and browser matrix; bounded development performance; negative/tamper/timeout/network/residue gates; strict OpenSpec/exact-path/residue/diff checks. |
| Non-goals | Product fixes/refactors/tests/dependency changes outside the owner, new API/UI behavior, Archive acquisition/production, live personal-network E2E, release/deploy/activation, production load/resource/SLO/readiness claims. |
| Operations deferred | Production Compose/nginx/systemd/timers, users/paths/permissions/TLS/secrets, real pointer activation/restart/rollback/cleanup/`update_activated`, registry/release/deploy/SSH, production monitoring/SLO, cutover/observation/migration/rollback drill/legacy removal. |
| Stop/rollback conditions | Stop on an unarchived dependency, another active change, dirty/mixed/mutable/missing input, unreviewed artifacts, path overlap, undeclared dependency/network/state, protected mutation, fixture-backed production path, oracle drift, timeout, residue, unbounded benchmark, or owner-repair attempt. Roll back only uncommitted owned files and the validated owned run root. |

## ADDED Requirements

### Requirement: Admission SHALL bind product and harness identities

The acceptance CLI SHALL require one strict input document and SHALL attest the
clean accepted product-candidate revision/tree named by the artifacts, the
later clean harness/control revision/tree containing this acceptance
implementation, Backend/Updater/Frontend component roots, compatibility
manifest, full inactive Archive version, fixed oracle, exact current
toolchain executables, exact historical Query-golden Node/npm/Go/gofmt
executables, sealed dependency/tool caches, and browser identity before it
starts an expensive gate. All three component statements and the compatibility
manifest SHALL name the same product-candidate revision/tree and target
platform.

The harness/control tree MAY differ from the product candidate only below
`contracts/acceptance/**` and the reviewed OpenSpec lifecycle paths needed to
record artifact archival and this acceptance change. Every protected product
and artifact implementation blob and executable mode SHALL be identical
between the two trees. The dependency `produce-development-artifacts` SHALL be
archived in the harness/control tree, no other active change besides this
acceptance change SHALL exist there, and neither checkout SHALL be dirty.

The CLI SHALL reject unknown input fields, duplicate JSON keys, unsafe or
relative paths, symlinks, special files, mixed identities, mutable inputs,
untracked non-ignored candidate paths, non-stage-zero index entries,
`assume-unchanged`/`skip-worktree`, Git replacement refs, or an input whose
raw tracked blobs/executable modes do not equal the named tree. Cache inputs
SHALL be regular, non-symlink, read-only trees with a complete exact lockfile
closure and content seals recorded before and after use.

#### Scenario: Accepted immutable inputs are admitted

- **WHEN** one clean product candidate, one clean compatible harness/control
  revision, three validated component roots, their exact compatibility
  manifest, one valid full inactive Archive, fixed oracle, current and
  historical-golden tools, sealed caches, and pinned browser all agree
- **THEN** the CLI SHALL record their content identities and proceed to the
  closed acceptance matrix

#### Scenario: A candidate or input identity is ambiguous

- **WHEN** any source/tree/platform/manifest/Archive/tool identity disagrees,
  an input can change during admission, or Git state can hide a different
  byte/mode
- **THEN** admission SHALL fail before starting a component, container, API, or
  browser process

### Requirement: An earlier prepared cache MAY be reused only by exact dependency-authority compatibility

The frozen cache manifest's product revision SHALL be interpreted only as the
immutable `preparedFromRevision` that supplied the cache's dependency
authorities. It SHALL NOT replace the accepted product identity, authorize a
caller compatibility override, or be rewritten/relabelled for a later
candidate. Whether preparation and accepted revisions match or differ, the
harness SHALL perform the same compatibility proof before any cache copy,
package installation, component, container, API, or browser process and SHALL
repeat it after cleanup.

The proof SHALL use raw regular `100644` Git blobs from exact object IDs with
replacement refs and lazy fetching disabled. It SHALL admit exactly 18
dependency files:

- 11 product locks mapped from frozen
  `locks/product/<repo-path>/package-lock.json` to that exact repository path
  in both preparation and accepted-product commits;
- frozen `locks/harness/contracts/acceptance/package-lock.json` mapped to the
  accepted harness/control `contracts/acceptance/package-lock.json`;
- frozen `locks/oracle/frontend/package-lock.json` mapped to the fixed
  oracle's `frontend/package-lock.json`;
- product `backend/go.mod` and `backend/go.sum`; and
- product `updater/uv.lock`; and
- accepted-product-only
  `contracts/goldens/query/fixtures/go-module/go.mod.lock` and
  `contracts/goldens/query/fixtures/go-module/go.sum.lock`.

Preparation and accepted-product Git trees SHALL have the exact same 11
product-lock path set; the accepted harness/control tree SHALL add exactly its
one acceptance lock; the fixed oracle's admitted lock set SHALL be exactly its
frontend lock. The manifest declaration and canonical npm-lock-inventory
arrays SHALL contain the same exact 13 records in the same order with matching
path, digest, package count, and integrity count. The manifest SHALL bind the
inventory path/byte-count/digest; the inventory SHALL bind the preparation and
fixed-oracle revisions. Every lock SHALL equal its frozen byte and its
appropriate preparation/accepted owner blob.

The Go pair SHALL separately equal the preparation blob, exact frozen
`go/backend/*` byte, and accepted-product blob. The manifest-bound Go
validation document SHALL identify the preparation revision and bind its
actual `backend/go.sum` path/digest; it SHALL NOT be treated as a `go.mod`
authority. The uv lock SHALL equal the preparation and accepted-product blobs.
The manifest SHALL separately bind the uv validation document and closure plan
by exact path/byte-count/digest; the validation document SHALL bind the plan by
path/digest; and both documents SHALL agree on preparation revision, uv-lock
path, and uv-lock digest. No self-digest, nonexistent reverse reference, or
frozen uv-lock copy may be claimed.

The two Query module locks SHALL be exact regular `100644` accepted-product
blobs and SHALL equal the Query manifest's independently sealed path, byte
count, and SHA-256 evidence. They MAY be absent from
`preparedFromRevision`; no preparation blob or frozen-cache-manifest record may
be invented for them. Reuse in that case SHALL require the Query `go.sum`
module/version set to be a subset of the Backend-seeded source/target Go
closure and every exact required module cache file to be present in the sealed
cache inventory. An extra Query version, missing cache byte, checksum mismatch,
or unbound lock SHALL fail before cache copy or process launch.

One canonical run-relative evidence envelope SHALL contain distinct
`preAdmission` and `postCleanup` phases. Each phase SHALL record the four
revisions, exact counts, each authority's logical owner/path and scope,
available tree mode/blob OID, byte digest/comparison, immutable
manifest/root seals, and its own
`authoritySetSha256`. The envelope SHALL NOT contain its own file digest.
`admission.sources` SHALL bind the pre-admission phase, the final
residue/seal cell SHALL bind the post-cleanup phase, and the canonical result
SHALL record the envelope path plus externally computed `evidenceSha256`, both
phase digests, and the same revisions.

#### Scenario: Earlier preparation remains authoritative

- **WHEN** the immutable cache was prepared from a different product revision,
  all 18 closed authorities satisfy their applicable preparation/current owner
  rules, and every npm/Go/uv plus Query module-subset/cache-file binding is
  exact before and after the run
- **THEN** admission SHALL record the distinct preparation and current
  identities plus canonical compatibility evidence and MAY use the sealed
  dependency closure offline

#### Scenario: Preparation and candidate revisions are identical

- **WHEN** the cache preparation revision equals the accepted product revision
- **THEN** the same 18-authority proof SHALL still run and revision equality
  alone SHALL NOT substitute for byte, mode, count, mapping, and digest checks

#### Scenario: A cache authority is stale or ambiguous

- **WHEN** any declared lock, Go file, uv lock, source object, mode, owner/path
  mapping, frozen copy, inventory record, validation record, directed
  closure-plan binding, count/order, or pre-admission seal is missing, added,
  duplicated, reordered, changed, unreadable, linked, or inconsistent
- **THEN** admission SHALL fail closed before copying cache bytes or starting
  an expensive process and SHALL NOT rewrite the frozen manifest or emit a
  green verdict

#### Scenario: A cache authority changes after admission

- **WHEN** the post-cleanup compatibility phase differs from pre-admission or
  finds a missing, changed, unreadable, linked, or inconsistent source/cache
  authority or seal
- **THEN** no later process SHALL start, final verification SHALL fail, and no
  green verdict SHALL be emitted

### Requirement: The matrix and result SHALL be closed and machine-readable

`contracts/acceptance/**` SHALL define one versioned, closed acceptance matrix
and strict schemas for input, result, development budgets, and oracle
exceptions. Every required cell SHALL have a stable ID, phase, owning
capability, fixed command or scenario ID, required inputs, timeout, and
evidence fields. Runtime input SHALL NOT add a command, assertion, exception,
threshold, route, or matrix cell.

Component statements and their compatibility manifest SHALL remain owned by
`admission.artifacts`. Full-Archive and official-provenance admission SHALL run
in a distinct `admission.archive` cell owned by
`contracts-archive-manifest`, after component admission and before any owner
gate or runtime. A damaged Archive or provenance input SHALL therefore never be
attributed to the component-artifact owner.

The canonical result SHALL identify both product-candidate and harness/control
revision/tree identities, compatibility manifest, component statements, full
Archive, oracle, toolchains, browser, cache preparation provenance and the
required compatibility identity/evidence digest, machine profile, budgets,
exact matrix version, cell status/duration/evidence, input/output seals, and
final verdict.
Required cells SHALL be exactly `pass|fail|blocked`; they SHALL never be
skipped. A fail-fast run SHALL mark every unrun dependent cell `blocked` by the
originating failure. Result evidence SHALL use run-relative paths and SHA-256
without absolute paths, usernames, secrets, raw response bodies, or unbounded
logs.

#### Scenario: Every required cell passes

- **WHEN** the canonical result contains the exact closed cell set, every cell
  is `pass`, all seals and cleanup checks pass, and the result validates
- **THEN** the only green verdict SHALL be
  `development-accepted-operations-pending`

#### Scenario: A cell fails or evidence is missing

- **WHEN** one cell fails, times out, is absent, has invalid evidence, or cannot
  run because a prior cell failed
- **THEN** the result SHALL record `fail` or `blocked`, exit nonzero, and SHALL
  NOT emit a green verdict

### Requirement: Existing owner gates SHALL remain authoritative

The harness SHALL invoke the existing cross-language Contracts verifiers,
Backend full check including race/vet/build, Updater
pytest/mypy/Ruff/locked-build gates, Frontend
wire/architecture/unit/type/build/artifact gates, component artifact
validators, and compatibility coordinator smoke. The matrix SHALL name the
owner capability for each gate and SHALL use fixed repository-owned
entrypoints, sanitized environments, bounded output, and timeouts.

When an authoritative owner gate fixes a historical toolchain identity that
differs from the current product toolchain, the harness SHALL attest, record,
and invoke that exact historical executable set for that gate. Specifically,
the Query golden's Node 24.16/npm 11.13/Go 1.25.4 identities SHALL remain
distinct from the current Frontend Node 24.18/npm 11.16 and Backend Go 1.26.5
identities. The harness SHALL NOT rewrite the golden, substitute another tool,
or omit either family from the canonical result.

The Query golden owner gate SHALL run its base verifier and cleanup-safety
probe before creating `.tmp`, prepare both codegen projections, and execute the
locked Redocly lint command against
`.tmp/codegen-a/source/openapi/openapi.yaml`. Lint SHALL exit zero and report
exactly zero errors and nine warnings. Only then SHALL the gate produce the two
exact Redocly bundles and run two independent
`openapi-typescript@7.13.0` commands: A SHALL consume the prepared
`.tmp/codegen-a/source/openapi/openapi.yaml` and B SHALL consume the prepared
`.tmp/codegen-b/source/openapi/openapi.yaml`, creating
`.tmp/query-a.d.ts` and `.tmp/query-b.d.ts` respectively. Only after those four
outputs exist SHALL it run `--verify-codegen-projections`, whose owned
verifier remains the sole executor of the exact `oapi-codegen` primary/replay,
format, and compile checks. The gate SHALL then use the owner's guarded
cleanup command. It SHALL NOT skip either TypeScript generation, feed the
expanded full shared OpenAPI or a generated dereferenced bundle to
TypeScript, cross-feed A/B projections, duplicate the Go generator outside
the verifier, treat command evidence as a substitute for the actual lint
process, or clean generated bytes before their verification.

Every Query command except `--verify-codegen-projections` SHALL remain under
the Harness outer host network-denial sandbox. That one verifier command SHALL
instead run directly with its exact historical Node executable, fixed
argv/cwd/environment and timeout because macOS rejects applying its four
verifier-owned child sandboxes from an already-sandboxed parent. The Harness
SHALL seal the accepted tracked verifier blob and strict-valid Query manifest,
including verifier self-identity, before and after the direct command. The
manifest SHALL bind each of the exact four operation plans to the accepted
inner sandbox profile text/digest containing `(deny network*)` and the
telemetry-directory write denial, plus exact executable, wrapper/child argv,
cwd, environment and module input/pre/post seals. The Harness SHALL parse the
single `candidate-success Go stderr evidence` runtime summary and require
exactly the ordered `primaryGeneration`, `deterministicReplay`, `gofmt`, and
`compileSmoke` operations, zero accepted stderr for all four, and exactly
eight `0600` two-file module-seal boundaries. The static authority and runtime
summary SHALL be accepted only together. A missing/changed profile, verifier,
manifest, runtime summary, operation, order or seal; an extra Go operation;
or an outer nested sandbox SHALL fail `owner.contracts`.

The Archive tooling `npm ci` SHALL remain offline under the Harness outer
network/runtime-root sandbox. The one exact subsequent
`contracts/schemas/archive/tooling/verify.mjs` command SHALL run directly with
the accepted current Node executable, empty argument vector, exact tooling
cwd, fixed fifteen-minute timeout, and the closed Archive environment
including `GOENV=off`, `GOWORK=off`, `GOTOOLCHAIN=local`, `GOPROXY=off`, and
`GOSUMDB=off`. This is required because the verifier itself launches a
bootstrap and every Go/gofmt child through `/usr/bin/sandbox-exec`, while
macOS rejects those inner profiles when the verifier has an outer sandbox.

Before and after the direct command, the Harness SHALL seal the accepted
tracked verifier, package/lock, persistent Archive schema/builder/matrix/golden
authority, the lock-installed dependency closure, and admitted current
Node/npm/Go/gofmt/CPython runtime authority. It SHALL accept only exit zero,
no signal or timeout, empty stderr, and one bounded strict-JSON report. That
report SHALL cross-bind the exact ordered six schemas, the exact two-line
quicktype 26.0.0 `--version` identity (`quicktype version 26.0.0` followed by
`Visit quicktype.io for more info.`),
effective Go environment, canonical Go/gofmt executables, bootstrap profile
and discovery argv, accepted telemetry mode, inner sandbox profile, policy
self-test, forged-control-key rejection, closed telemetry diagnostics, and
exactly sixteen ordered Go/gofmt records to the accepted static command plan.
Every recorded Go/gofmt child SHALL use the accepted
`/usr/bin/sandbox-exec` wrapper and inner `(deny network*)` plus
telemetry-write-denial profile with its exact executable, cwd and argv.
Missing/extra/reordered commands, report forgery, authority drift, output
truncation or stderr, an attempted outer nested sandbox, or cleanup residue
SHALL fail `owner.contracts`.

The Go telemetry directory is a shared machine-global diagnostic path, not an
acceptance-owned input. Its report SHALL have the exact closed
`before`/`after` seal variants and a `changed` boolean equal to the comparison
of those two values. Concurrent foreign Go activity MAY make `changed` true;
that fact alone SHALL NOT fail the cell or be reported as a mutation of owned
authority.

The canonical result SHALL label this boundary
`verifier-owned-inner-sandbox/direct-local-children`. It SHALL claim
kernel-enforced network denial only for the bootstrap and sixteen Go/gofmt
children, not for the accepted verifier process or its quicktype, CPython and
other local inspection children. Those direct local children are admitted
only through the immutable reviewed verifier and locked local dependency/tool
authority; no public origin is an accepted input.

#### Scenario: Query Go children provide the network boundary

- **WHEN** the Harness invokes the locked
  `--verify-codegen-projections` command without an outer macOS sandbox
- **THEN** the verifier SHALL remain the sole Go executor and all four exact Go
  operations SHALL be cross-bound between the accepted manifest plans and the
  successful closed runtime summary
- **AND** every other Query command SHALL retain the Harness outer network
  sandbox

#### Scenario: Archive Go children provide the network boundary

- **WHEN** the Harness invokes the exact accepted Archive verifier directly
  after its networkless offline install
- **THEN** its bootstrap and exactly sixteen ordered Go/gofmt children SHALL
  be cross-bound to the accepted static authority and successful strict-JSON
  report, with every such child using the exact inner network-denial profile
- **AND** the evidence SHALL identify non-Go local children as direct rather
  than claiming an outer kernel sandbox

#### Scenario: Archive direct-command authority or report drifts

- **WHEN** the executable, argv, cwd, environment, timeout, tracked or
  installed authority, report shape, schema order, sandbox profile, telemetry
  diagnostics, child command count/order, stdout bound, stderr, or pre/post
  seal differs
- **THEN** `owner.contracts` SHALL fail and all dependent cells SHALL be
  blocked

#### Scenario: Query codegen prerequisites are incomplete

- **WHEN** lint did not actually exit zero with zero errors and nine warnings,
  or either Redocly bundle or either independent TypeScript output was not
  produced by its fixed command before the Query codegen verifier runs
- **THEN** `owner.contracts` SHALL fail, all dependent cells SHALL be blocked,
  and guarded Query cleanup SHALL still run

#### Scenario: Query lint source or warning baseline drifts

- **WHEN** Redocly lint is omitted, consumes anything other than the prepared
  `codegen-a` closed source, reports an error, or reports a warning count other
  than nine
- **THEN** command closure SHALL fail before bundle or generated-output
  evidence can establish a pass
- **AND** the expanded shared OpenAPI's ten-warning result SHALL remain a
  negative rather than update the accepted baseline

#### Scenario: Query TypeScript input is not its paired source projection

- **WHEN** either TypeScript command consumes the expanded full shared OpenAPI,
  a dereferenced bundle, or the other command's source projection
- **THEN** the closed Query command plan or output seal SHALL fail before the
  Query owner gate can pass

All package/module/browser bytes used by owner gates SHALL come from
caller-provisioned sealed cache inputs. The caller MAY prepare those exact
lockfile-pinned bytes before admission outside the harness, but cache
acquisition is not an acceptance cell and SHALL write no repository or
production path. After admission the harness SHALL copy required cache bytes
with new inodes into the owned run root, use package-manager offline modes,
enforce host/Docker network denial, and re-seal both the source caches and
copies. Exact tool executables and their runtime closures SHALL be
independently attested and re-sealed. Every non-system tool distribution root
SHALL have a complete canonical inventory of directory/file modes, file sizes
and digests, and any required safe internal symlink targets. Hard links,
special entries, escaping links, missing/new entries, and pre/post differences
SHALL fail. A copied current-tool closure SHALL preserve every admitted path,
byte, size, file kind, and safe symlink target with new inodes while applying
one closed mode projection that removes every write bit. During
materialization, no copied executable SHALL become executable until every
copied directory and non-executable file is already non-writable; the original
execute bits MAY then be enabled without restoring write bits. The harness
SHALL validate the full copied tree against that deterministic projection,
record admitted source modes and copied projected modes separately, and use
the projected copied seal for every later re-seal. It SHALL NOT retry, delete,
ignore, or bless a runtime file that changes after an executable becomes
visible. Each owner gate SHALL run under an outer sandbox that denies writes
to its admitted runtime roots. Both installed npm package roots and the
admitted CPython distribution are runtime closures; a launcher-file digest
alone SHALL NOT identify either tool. macOS platform libraries below
`/System/Library` and `/usr/lib` are bound to the recorded development profile
and SHALL NOT be described as copied tool bytes. No matrix cell may contact a
public registry or other public origin.

#### Scenario: A copied interpreter is discovered by another local process

- **WHEN** a same-user process observes or executes a copied interpreter as
  soon as its execute bit becomes visible
- **THEN** the complete copied closure SHALL already be non-writable, its
  projected seal SHALL remain byte/mode/path identical, and no bytecode,
  metadata file, or new runtime entry SHALL be created

#### Scenario: A copied closure changes after materialization

- **WHEN** any copied path, byte, size, kind, safe-link target, projected mode,
  or inode-independence proof differs before or after its owning gate
- **THEN** the owning cell SHALL fail closed without a retry or exception

Because the authoritative Query golden hard-codes
Node 24.16/npm 11.13 and
`/opt/homebrew/Cellar/go/1.25.4/libexec/bin/{go,gofmt}`, and clears injected
environment, those complete canonical historical runtime roots MAY be invoked
in place as the sole reviewed owner-fixed exception to copied tool closures.
Before the Query gate, the harness SHALL inventory the complete historical npm
package root and every directory and regular file in that GOROOT, reject hard
links and special entries, content-seal both trees, and cross-bind the fixed
executables plus the `go`/`gofmt` frozen cache mirror. The outer gate sandbox
SHALL deny writes to both runtime roots and deny network. After the gate, both
complete inventories and content seals SHALL match exactly. The result SHALL
identify this as an owner-fixed in-place exception and SHALL NOT claim a
copied, read-only-source, or hermetic new-inode historical tool closure.

#### Scenario: The owner-fixed historical GOROOT remains sealed

- **WHEN** the Query golden runs its hard-coded Node/npm and Go 1.25.4
  code-generation, formatting, and compile commands
- **THEN** the complete pre/post historical npm and GOROOT inventories and
  digests SHALL match, `go`/`gofmt` SHALL match the frozen mirror, and the
  sandbox SHALL have denied runtime-root writes and public network access

#### Scenario: The historical tool exception is widened or misreported

- **WHEN** another tool path uses the owner-fixed exception, an admitted
  runtime contains an escaping link, hard link, or special entry, any runtime
  byte/mode/path changes, the mirror digest differs, or evidence describes an
  in-place tree as a copied hermetic closure
- **THEN** the owner gate and final verdict SHALL fail

Before running a source gate, the harness SHALL create a no-hardlink local
clone below its owned run root, check out the exact candidate detached, and
re-attest its revision/tree and tracked blob/mode inventory. Every disposable
source-gate write, including `node_modules`, virtual environments, `dist`,
`.cache`, `.tmp`, generated checks, and artifact coordinator state, SHALL stay
inside that clone. The live harness/control checkout SHALL remain clean and
read-only and SHALL gain no worktree metadata, ref, index, cache, or generated
file.

Acceptance-owned tests SHALL cover only orchestration, schema, command closure,
redaction, failure/timeout propagation, input immutability, network/process
policy, oracle-exception validation, canonical results, and residue. They
SHALL NOT copy or replace query, statistics, API, Archive, or frontend business
expected values.

Owner-gate cleanup SHALL remove only its exact declared generated roots after
canonical containment/type checks and SHALL use bounded retry semantics for
transient non-empty-directory races. If an owner command already failed, a
later generated-root cleanup error SHALL be recorded as secondary cleanup
evidence but SHALL NOT replace the originating command identity, exit status,
logs, failure code, or owner attribution. If every owner command passed, any
cleanup error or surviving generated root SHALL fail that same owner cell.
Cleanup SHALL never ignore residue merely to preserve an earlier error.

The Backend owner gate MAY retain its seeded `backend/.cache/go-mod` only
between the fixed Backend check and the immediately following independent
query-binary measurement. After that measurement, or after either Backend
operation fails, the Harness SHALL remove the exact candidate-owned
`backend/.cache` and `backend/.tmp` roots with the same bounded, fail-closed
cleanup semantics before any later clean-checkout re-attestation or artifact
coordinator invocation. It SHALL NOT relax tracked-path syntax, ignore-control
attestation, or coordinator source identity merely because a module cache
contains upstream paths such as `module@version/.gitignore`.

The Contracts owner SHALL likewise remove `node_modules`, `.cache`, and
`.tmp` below every installed `contracts/goldens/api/{catalog,rankings,
candidates,person-detail,partners,co-star}` package, in addition to its Query
and schema generated roots, before the artifact coordinator recursively
attests `contracts/goldens`. An ignored dependency file or internal
`node_modules/.bin` symlink SHALL NOT be admitted as coordinator control-plane
input. Cleanup SHALL use the same exact-root, bounded, primary-preserving
semantics and prove every declared API-golden root absent.

The Archive owner SHALL invoke its real verifier with the exact hermetic Go
environment, including `GOWORK=off`; an inherited host workspace SHALL never
participate in module selection. A declared generated root may contain admitted
read-only cache directories. Before changing permissions or deleting any byte,
cleanup SHALL completely inventory that exact canonical root without following
links. It SHALL reject a symlink root or ancestor, every absolute or lexically
escaping descendant symlink, every special entry, and every regular file whose
link count proves an external hard-link identity. A relative descendant
symlink whose lexical target remains within the same exact root MAY be admitted
only as an inventoried leaf; cleanup SHALL unlink it without following or
chmodding it.

After a clean inventory, cleanup SHALL atomically rename the exact root to one
absent private quarantine name in the same canonical parent and SHALL re-attest
the same root device/inode/type plus the complete relative inventory before any
chmod or deletion. An identity mismatch SHALL be restored without chmod or
deletion and SHALL fail closed. Cleanup SHALL add write/search permission only
to proven directories in that quarantine; it SHALL NOT chmod regular files or
symlinks. It SHALL then use the quarantined path for the same four-attempt
bounded removal. On terminal failure it SHALL restore surviving bytes to the
declared root if that path is absent, or otherwise report both exact paths as
residue; neither case may be hidden by the original-root absence check.
Primary-error preservation, cleanup evidence, and residue-blocking settlement
remain unchanged.

Quarantine acquisition and removal SHALL share one four-attempt budget for the
declared transient filesystem errors. A failed rename MAY retry only while the
declared root retains the inventoried identity and the quarantine path remains
absent. Owner cleanup SHALL start only after the owner command and its
supervised descendant closure have stopped. This stable-owner settlement is a
required precondition; the Harness SHALL NOT claim descriptor-relative
protection against a hostile foreign process with the same UID concurrently
rewriting the unpredictable quarantine. Failure to establish settlement SHALL
block owner cleanup and defer only to guarded whole-run-root cleanup.

#### Scenario: An existing owner gate succeeds

- **WHEN** its accepted entrypoint exits successfully in the isolated clone
  without changing a protected live input
- **THEN** the harness SHALL record the bounded command identity and evidence
  digest as that matrix cell's pass

#### Scenario: An owner gate fails

- **WHEN** an existing contract, test, race, build, artifact, or smoke
  entrypoint exits nonzero, times out, mutates input, or emits invalid evidence
- **THEN** the harness SHALL attribute the failure to that owner and stop
  without editing or weakening its implementation or expectations

#### Scenario: Owner cleanup also encounters a transient or terminal error

- **WHEN** an owner entrypoint fails and generated-root cleanup must retry or
  also fails
- **THEN** bounded cleanup SHALL still run and residue SHALL remain blocking
- **AND** the canonical cell failure SHALL preserve the original command
  result while separately registering the cleanup outcome

#### Scenario: Backend module-cache control files would poison later re-attestation

- **WHEN** the sealed Go cache seeds an upstream
  `module@version/.gitignore` below candidate-owned `backend/.cache/go-mod`
- **THEN** the Backend owner SHALL finish both fixed operations, remove the
  exact Backend generated roots, and prove them absent before the artifact
  coordinator re-attests the candidate
- **AND** a cleanup failure or surviving root SHALL fail the Backend owner
  cell without weakening the Git path or ignore-control validator

#### Scenario: API-golden install output would enter coordinator control-plane traversal

- **WHEN** a fixed Contracts package install leaves ordinary dependency bytes
  or a `node_modules/.bin` symlink below any installed API golden
- **THEN** the Contracts owner SHALL remove that package's exact
  `node_modules`, `.cache`, and `.tmp` roots before the coordinator recursively
  enumerates `contracts/goldens`
- **AND** missing cleanup coverage, cleanup failure, or surviving output SHALL
  fail the Contracts owner cell rather than be misattributed to artifact
  compatibility or treated as tracked control-plane input

#### Scenario: Archive owner receives ambient workspace state and frozen caches

- **WHEN** the host exports any Go workspace state and the admitted Archive npm
  cache contains nested `0555` directories
- **THEN** the Archive verifier SHALL still receive exact `GOWORK=off`
- **AND** cleanup SHALL validate the unchanged tree, atomically quarantine and
  re-attest that exact root, make only its proven directories removable,
  remove it within four bounded attempts, and prove both declared and
  quarantine paths absent
- **AND** a normal root-contained relative npm `.bin` symlink SHALL be removed
  as an un-followed leaf, while a linked root/ancestor, absolute or escaping
  link, special entry, or externally hard-linked regular file SHALL fail closed
  without changing external mode or bytes
- **AND** replacing the declared root after inventory SHALL never authorize
  deletion of the replacement; an earlier command error remains the canonical
  primary failure and every quarantine residue remains separately blocking
- **AND** transient quarantine-rename errors SHALL consume and retry within the
  same four-attempt budget as removal, provided the original identity and absent
  quarantine are unchanged

### Requirement: A full inactive Archive SHALL be proven without mutating it

The full-Archive input SHALL be a regular non-symlink version directory
containing exact `manifest.json` and `bangumi.sqlite` bytes from an official
complete seven-source Archive release produced by the accepted Updater. A
separate caller-supplied read-only provenance root SHALL contain canonical
`provenance.json`, the official release ZIP, pinned `aux/latest.json`, and
pinned `subject_staffs.yml`.

The accepted release identity is exactly:

- Archive commit `536b2864f8f23ee4ffd171ebfbe4c41fe1be2df1`,
  `aux/latest.json` size 539 and digest
  `sha256:f97498acdfff461603f14862b80211707e89250ed55f1883c60051d58b2d9f24`;
- asset `dump-2026-07-21.210441Z.zip`, size 419054508 and digest
  `sha256:e1120169088407c66a94dacacda4dffaabe0e2e08cbcc8238c880f6c0140dd57`;
- common commit `6a8442c17143a870357a5ff812362e8b5cfe9f9d`,
  `subject_staffs.yml` size 37723 and digest
  `sha256:0d5ac602157e33114029df611ea9dd46df32997e57c3a361b9e6f92250304394`.

The input/result schemas SHALL bind the canonical provenance root and manifest
digest. Admission SHALL validate the provenance manifest against those exact
constants, validate that pinned `latest.json` names the exact release
URL/name/content type/size/digest, and content-seal the complete provenance
root. Canonical `provenance.json` SHALL have the exact closed shape
`{schemaVersion:1,kind:"bgmss-official-archive-provenance",archive:{revision,latest:{path,size,sha256},asset:{path,name,url,contentType,size,sha256,members:[{path,role,size,sha256}]}},common:{revision,subjectStaffs:{path,url,size,sha256}}}`;
all nested objects SHALL reject undeclared fields, `role` SHALL be exactly
`consumed` or `unconsumed`, and members SHALL be path-sorted.

A bounded safe ZIP reader SHALL reject encryption, duplicate names, traversal,
links, unsupported members, entries outside the reviewed exact nine-member
allowlist, missing allowlisted entries, and decompression-limit violations. It
SHALL stream and hash all nine regular `.jsonlines` members. The seven
`consumed` members SHALL be exactly the Archive manifest's seven
`sourceFiles`, with every uncompressed name/size/digest matching its source
account. The only `unconsumed` members SHALL be
`episode.jsonlines` (size 332792564, digest
`sha256:0d7020de68ba7b4ee838cf5ed30766a9153b429efb45ace4c97c2871832c68e7`)
and `person-relations.jsonlines` (size 8118624, digest
`sha256:d7b4993d9af733fd34c6de5dcd0e0eca98e64da0623f1b26c5bb040e76262e11`).
Unconsumed members SHALL be admitted only as reviewed official upstream bytes
and SHALL NOT participate in Updater source accounting. The pinned common
bytes SHALL match the Archive manifest's common commit/URL/size/digest.

Before copying, the harness SHALL validate the Archive contract,
manifest/SQLite/schema/dataVersion digests, complete source accounting, and
generator compatibility. It SHALL reject known minimal fixtures,
self-consistent synthetic producer cases, missing sources, and any Archive or
provenance input that changes before cleanup completes.

For runtime only, the harness SHALL byte-copy the validated version into one
owned run root, derive a canonical `current.json`, make the complete copy
read-only, and mount only that copy. Hard links, symlinks, writes beside the
input, and reuse of a production/current activation root are forbidden. The
real Go consumer SHALL then accept that exact independently sealed activation
copy before any packaged runtime starts.

#### Scenario: Official full Archive is accepted

- **WHEN** the frozen release ZIP and common bytes match their pinned upstream
  metadata, the exact nine-member ZIP allowlist is present, all seven consumed
  members match the inactive version's source accounts, both unconsumed
  members match their reviewed identities, and the standalone version passes
  every pre-copy Contracts gate
- **THEN** a byte-identical disposable activation copy SHALL be created below
  the owned run root, the real Go consumer SHALL accept that copy, and both
  source roots SHALL remain unchanged

#### Scenario: A self-consistent synthetic Archive is supplied

- **WHEN** a manifest and schema-valid SQLite agree with each other but the
  official ZIP/common anchor is missing, changed, extra, or does not match all
  seven source accounts or either reviewed unconsumed member
- **THEN** provenance admission SHALL fail before runtime and no official or
  full-Archive acceptance claim SHALL be emitted

#### Scenario: Minimal, synthetic, damaged, or mutable Archive is supplied

- **WHEN** the input matches a checked-in minimal/synthetic identity, omits a
  source, violates any manifest/SQLite gate, is linked, or changes during the
  run
- **THEN** full-Archive acceptance SHALL fail and no supplied or production
  pointer SHALL be created or modified

### Requirement: Immutable Updater and packaged Backend SHALL run at real boundaries

The accepted Updater artifact SHALL run its terminating `doctor` and
`contract-check` commands in a read-only, non-root, networkless environment
against accepted Contracts. It SHALL write only bounded temporary interpreter
state and SHALL leave no process/container/file residue.

The packaged Backend artifact SHALL start as non-root with a read-only root
filesystem, dropped capabilities, bounded tmpfs, internal local network, and
the disposable full Archive mounted read-only. It SHALL become live and ready,
export the expected metrics/dataVersion, serve catalog/rankings/candidates/
person-detail/partners/co-star from the real Archive, honor request limits and
cancellation, and terminate cleanly.

#### Scenario: Real artifact runtime succeeds

- **WHEN** the accepted Updater and Backend artifacts run against the accepted
  Contracts and disposable full Archive
- **THEN** terminating Updater checks and Backend health/readiness/metrics plus
  representative global API journeys SHALL pass without importing product
  source at runtime

#### Scenario: Runtime escapes its boundary

- **WHEN** either artifact runs as root, writes a protected/input path, imports
  source, contacts an external network, leaves a process/container, or fails
  readiness/API/shutdown evidence
- **THEN** integrated acceptance SHALL fail even if its command exits zero

### Requirement: Packaged Frontend E2E SHALL use only the real Backend

The frontend server SHALL expose only the accepted packaged static artifact
and SHALL reverse-proxy same-origin `/api/**` to the packaged Backend. Browser
journeys SHALL cover `/`, `/ranking`, and `/co-star`; dynamic catalog and
query application; ranking/candidates selection; person detail; partners;
pair and group co-star; search/sort/page/view changes; loading/error/empty
resource states available without fixture injection; cancellation/latest
response; theme/mode transitions; and share behavior.

The runtime bundle SHALL contain no prototype/fixture/test import, frontend
statistics authority, alternate request/state layer, or direct Bangumi
upstream. Runtime request and response validation SHALL use the accepted
OpenAPI and API goldens; person/position IDs SHALL be selected from live global
responses. Personal scope SHALL remain in existing component/contract gates
and SHALL NOT make final E2E depend on mutable public collection state.

#### Scenario: Global real-data journey succeeds

- **WHEN** a browser drives the packaged SPA through the same-origin server and
  chooses valid entities from live full-Archive responses
- **THEN** every visible state and operation SHALL be backed by the packaged
  real Backend and validated against accepted contracts

#### Scenario: A production journey uses a fixture or upstream

- **WHEN** the browser or bundle imports a prototype/fixture/test adapter,
  calculates authoritative statistics, bypasses the packaged Backend, or
  requests a non-loopback/public origin
- **THEN** integrated acceptance SHALL fail before that response can establish
  a pass

### Requirement: Preserved frontend behavior SHALL be compared with the fixed oracle

The harness SHALL materialize the oracle from Git commit
`644b7748674e553f863d0ffd61d029f86fdc0717` without moving a ref or creating a
Git worktree, and SHALL build it only from locked locally pre-provisioned
bytes. Candidate and oracle SHALL run in the same attested browser, locale,
timezone, DPR, font set, motion preference, theme, viewport, and seeded clock.

For shared states, the harness SHALL compare normalized role/name/state DOM
snapshots, geometry, typography, colors, borders, radius, shadow, visibility,
focus, overflow, scroll ownership, responsive transitions, action traces, and
paired screenshots. The exception registry SHALL permit only exact
selector/property/state or rectangular dynamic masks mapped to a governing
`PRODUCT.md`, `DESIGN.md`, or accepted capability requirement. Wildcards,
whole-page masks, runtime exceptions, changed thresholds, and unresolvable
authorities SHALL fail. Dynamic data slots MAY mask content pixels only; their
geometry, hierarchy, formatting, and interaction SHALL remain compared.

#### Scenario: Preserved surface matches

- **WHEN** the same shared route/state is rendered in the candidate and oracle
  under one matrix cell
- **THEN** every unexcepted semantic, geometry, style, interaction, focus,
  responsive, and bounded screenshot comparison SHALL pass

#### Scenario: An unclassified difference appears

- **WHEN** appearance, copy, state, interaction, focus, scroll, responsive
  behavior, or screenshot bytes differ outside one exact approved exception
- **THEN** the oracle cell SHALL fail; reviewer preference or a newly generated
  candidate golden SHALL NOT waive it

### Requirement: The complete browser matrix SHALL be fail-closed

Light and Dark contexts at 360, 390, 779, 780, 1024, and 1440 CSS pixels SHALL
cover shared query, ranking, person inspector/Drawer, co-star, loading/error/
empty, and approved-addition states. The matrix SHALL verify keyboard-only
operation, visible focus, focus return, Escape close, mask/inert/background
behavior, tooltip, scroll ownership/chaining, reduced motion, horizontal
overflow, duplicate IDs, accessible names, console errors/warnings, unhandled
rejections, failed resources, and every network request.

The network allowlist SHALL contain only the declared loopback frontend origin
and its same-origin packaged API/image routes. A console error, unhandled
rejection, failed resource, direct `api.bgm.tv`/image request, analytics or
other public request, unexpected horizontal overflow, duplicate ID, or missing
required focus/accessibility evidence SHALL fail its cell.

One exact SafeImage failure-state cell MAY abort same-origin
`/api/v1/images/bangumi/**` requests without fulfilling or rewriting them. The
cell SHALL record those aborts separately and pass only when affected images
reach the accepted stable error state without layout shift, console error,
retry escape, or direct upstream request. No other failed resource or
intercepted response is permitted.

#### Scenario: Required viewport and theme matrix is clean

- **WHEN** every required route/state runs at all twelve viewport/theme
  combinations with both default and reduced-motion contexts where applicable
- **THEN** interaction, accessibility, console, resource, network, overflow,
  and oracle evidence SHALL all pass

#### Scenario: Browser evidence is incomplete

- **WHEN** one required viewport/theme/state is omitted, browser automation
  cannot inspect it, or a required error/network/focus check is missing
- **THEN** the matrix SHALL fail rather than skip or infer that cell

### Requirement: Development performance budgets SHALL be bounded and explicit

A versioned `budgets.json` SHALL define immutable development-only commands,
machine profiles, measurement units, timeouts, and hard ceilings. Runtime input
SHALL NOT learn, widen, or override a budget. At minimum:

- reachable initial Frontend JavaScript gzip SHALL remain below 300 KiB;
- the Backend query test binary SHALL remain at or below 16 MiB;
- observed cache logical bytes/items SHALL remain within accepted cache
  capability budgets;
- every representative API request SHALL finish below the existing 30-second
  hard request bound;
- full-Archive readiness, browser journeys, component gates, and the complete
  suite SHALL each have finite reviewed timeouts.

The result SHALL record the full Archive source/table counts and byte sizes;
artifact/compressed sizes; cold readiness and shutdown; cold/warm global API
durations/response bytes; Backend CPU, current memory, 250 ms sampled
high-water memory, exact 1 GiB memory and swap hard limits, OOM-kill state,
cache, and request metrics; browser ready/action durations, transferred bytes,
requests and DOM size; and the OS/architecture/CPU/memory class, Docker,
toolchain, and browser versions. Machine-sensitive verdicts SHALL use one
reviewed named profile. The output SHALL call itself development
characterization and SHALL NOT claim a production SLO, capacity, or readiness
result. The sampled high-water value SHALL NOT be named or represented as an
exact cgroup peak. The hard memory decision SHALL instead require both Docker
`Memory` and `MemorySwap` to equal 1,073,741,824 bytes and
`OOMKilled=false`; a missing sample, sampler failure, different hard limit, or
OOM kill SHALL fail closed.

The recorded suite duration SHALL extend through runtime cleanup, protected
input re-sealing, and complete evidence validation. Canonical result
serialization/write/validation SHALL remain inside the final cell and suite
watchdogs even though a self-describing result cannot include the duration of
its own terminal write.

#### Scenario: Measurements fit the reviewed development profile

- **WHEN** every required measurement is finite, complete, correctly unitized,
  and within its invariant or named-profile ceiling
- **THEN** the performance cells SHALL pass and record the exact machine/input
  identities

#### Scenario: Budget evidence is absent or exceeded

- **WHEN** a required measurement is missing/non-finite, a command is
  unbounded, a hard/profile ceiling is exceeded, or runtime input changes a
  threshold
- **THEN** development acceptance SHALL fail without reclassifying the result
  as a production benchmark

### Requirement: Browser automation SHALL be acceptance-only and pinned

The capability MAY add exactly one direct development dependency,
`@playwright/test`, under `contracts/acceptance/**`, pinned exactly with a
locked transitive closure. It SHALL own browser control, contexts,
console/network inspection, screenshots, and timeouts and SHALL contribute
zero Backend, Updater, Frontend runtime, or production bundle bytes. Browser
binaries SHALL be pre-provisioned version-attested inputs; install-time or
run-time browser download is forbidden.

Acceptance SHALL verify the direct-dependency allowlist, lockfile, licenses,
no install scripts, offline `npm ci --ignore-scripts`, local cache containment,
focused tests, and zero product-manifest/bundle change. No second
browser/visual-diff library, application state/request layer, or statistical
library is authorized.

#### Scenario: Pinned acceptance dependency is used

- **WHEN** the harness installs and runs its locked acceptance package from the
  owned temporary root
- **THEN** only the reviewed Playwright dependency and pre-provisioned browser
  SHALL be used, with no production byte or manifest change

#### Scenario: Dependency or browser escapes the admission contract

- **WHEN** a package is unpinned/unlocked, has an install script, adds another
  direct browser stack, downloads a browser, writes outside the run root, or
  affects a product bundle
- **THEN** dependency acceptance SHALL fail before browser cells run

### Requirement: Failure, cleanup, and handoff SHALL preserve all inputs

The public formal `run` command SHALL supervise the complete stateful matrix in
one separate worker process. The worker MAY retain accepted Backend, browser,
server, and other reviewed state across cells, but before each action it SHALL
send one closed, monotonically ordered checkpoint containing the run identity,
matrix sequence, cell ID, phase, and declared deadline. The parent SHALL
enforce every cell and whole-suite deadline with its own monotonic clock
outside the worker event loop.

The worker SHALL run in an exact controllable process group whose observed
descendants are tracked by the stable-identity ancestry ledger. On a deadline,
synchronous stall, microtask starvation, stalled I/O, malformed or
out-of-order checkpoint, lost worker, or worker cleanup failure, the parent
SHALL terminate only that owned closure, perform guarded run-root and
named-runtime cleanup, re-seal protected inputs, and exclusively write the
canonical 56-cell fail/blocked result from the last accepted checkpoint. A
partial worker result SHALL NOT be trusted as canonical. Revocable in-process
Node output gates MAY provide defense in depth, but SHALL NOT substitute for
the parent watchdog.

Every child process SHALL run in a separately controllable process group or
uniquely named container with a sanitized environment, finite timeout, bounded
output, graceful-stop window, and bounded forced cleanup. Host commands SHALL
additionally maintain a continuously refreshed descendant ancestry ledger with
stable process identity and track every observed descendant through a
session/process-group change, environment clearing, working-directory change,
or reparenting. Cleanup MAY signal only an identity proven owned by that
ledger. Whole-host process snapshots are diagnostic only: an unrelated
concurrent process SHALL NOT be attributed, killed, or by itself block the
result. The harness SHALL inventory listeners, owned processes, containers,
images, networks, mounts, and run files before/after. It SHALL snapshot supplied
artifacts/Archive and protected tracked paths before execution and re-seal them
after cleanup.

For every acceptance-owned OCI image load, the admitted archive manifest
descriptor, config, platform, layers, and rootfs identities SHALL remain the
content authority while the Docker daemon's runtime image ID is an observed
store identity. When image inspection exposes a manifest `Descriptor`, its
media type, digest, and size SHALL exactly match the admitted manifest;
`RepoDigests` MAY be empty, but every value present SHALL bind that manifest,
and `Id` SHALL be one syntactically valid digest recorded without assuming it
equals either the manifest or config digest. Without a `Descriptor`, only a
classic image store whose `Id` exactly equals the admitted config digest MAY
pass; a descriptor-less containerd image store SHALL fail closed.

The Updater OCI reference read from its admitted build metadata SHALL equal
`localhost/bgmss-updater-artifact:<accepted-product-revision>-arm64`
exactly. The harness SHALL reject a shortened revision, a missing
`localhost/` repository, a substituted revision, or any other tag shape
before loading the image.

#### Scenario: Updater metadata names a substituted image

- **WHEN** the Updater build metadata image reference does not exactly bind
  the accepted Product revision and `linux/arm64` target
- **THEN** runtime admission SHALL fail before Docker loads an image

The supervisor SHALL record the first valid post-load inspected `Id` before
performing the remaining image checks. Cleanup MAY remove only the exact
run-owned repository tag and SHALL never remove an image by manifest, config,
or observed runtime digest. If the owned tag disappears while that observed
runtime identity remains addressable, including under a foreign tag, the
supervisor SHALL retain the ownership fact, report image residue, and block
the verdict rather than deleting or reporting zero residue.

The unprivileged macOS profile has no Endpoint Security/DTrace fork-event
authority. It therefore SHALL NOT claim safe attribution or cleanup of a
process that deliberately forks, changes session, and exits its parent before
the first observable ancestry sample. The fixed admitted owner commands remain
non-adversarial inputs; the process group is the primary boundary and the
ledger closes observable reparenting without risking an unrelated PID.

Any command failure, timeout, unexpected signal/skip, invalid result,
protected/input mutation, observed browser external-network attempt, successful
non-loopback command/container connection, or residual state SHALL block a
green verdict. Browser contexts SHALL report their observed attempt count;
non-browser commands and containers SHALL enforce sandbox/network denial and
record that enforcement without misrepresenting unobserved denied syscalls as
an attempt counter. Generated result/log/screenshot/trace/profile/Archive copies
SHALL remain below ignored `contracts/acceptance/.tmp/**`; none SHALL be tracked
or present at implementation handoff. Cleanup SHALL validate one exact owned
run root and SHALL NOT perform broad recursive repository cleanup.

#### Scenario: Failed run cleans up safely

- **WHEN** any cell fails or times out after processes or containers start
- **THEN** bounded cleanup SHALL run, the result SHALL preserve sanitized
  failure evidence, all inputs SHALL re-seal unchanged, and the command SHALL
  exit nonzero

#### Scenario: The matrix worker stops responding

- **WHEN** the worker misses a declared cell or suite deadline, starves its
  event loop, emits an invalid checkpoint, exits unexpectedly, or leaves
  registered writers/resources active
- **THEN** the parent SHALL kill the exact owned worker closure, complete
  guarded cleanup and re-sealing, emit one schema-valid canonical fail/blocked
  result without trusting partial worker output, and exit nonzero

#### Scenario: Functional cells pass but residue remains

- **WHEN** a process, container, network, image, listener, temporary path,
  tracked result, or changed input remains
- **THEN** the residue/final-seal cell SHALL fail and no green verdict SHALL be
  emitted

#### Scenario: A loaded image loses its owned tag

- **WHEN** a successful post-load inspection recorded one valid runtime image
  ID, later validation or cleanup finds the exact run-owned tag absent, and
  that runtime ID remains addressable
- **THEN** cleanup SHALL NOT delete by digest, image residue SHALL remain
  nonzero, and no green verdict SHALL be emitted

### Requirement: Development completion SHALL not claim operations completion

Only after every required matrix cell passes, the canonical result validates,
all inputs re-seal, and residue is absent MAY the project report:
“正式新版开发验收完成；运维、发布、部署、生产迁移和旧系统退役尚未开始。”

The final report SHALL separately state `specified`, `implemented`,
`verified`, `committed`, `pushed`, `released`, and `deployed`. Passing this
capability SHALL NOT authorize or imply a push, release, registry operation,
deployment, host mutation, real Archive activation, production observation,
or operations change.

#### Scenario: Final development acceptance is green

- **WHEN** the exact result verdict is
  `development-accepted-operations-pending` and repository lifecycle evidence
  is reported separately
- **THEN** development MAY be marked complete while released and deployed
  remain false unless separately performed and authorized

#### Scenario: Operations language is inferred from development evidence

- **WHEN** a report describes the result as production-ready, deployed,
  activated, SLO-certified, or operations-complete
- **THEN** the report SHALL be rejected even if every development matrix cell
  passed
