## Context

The repository now has independent quality gates for Go, Python, Vue, shared
contracts, and immutable development artifacts. `produce-development-artifacts`
adds checksum/SBOM/component statements, one compatibility manifest, and a
minimal artifact-only smoke, but intentionally does not prove complete product
journeys or full-Archive characteristics.

This change is the final development gate described by
`tmp-formal-development/formal-development-master-plan.md`. It owns no product
code and has no repair authority. It consumes accepted immutable inputs and
reports whether the whole candidate is acceptable. A failure is therefore a
routing result: it names the failed owner/capability and stops; it is not an
invitation for the harness owner to edit that layer.

The relevant existing boundaries are:

- Contracts owns Archive/OpenAPI schemas and the cross-language goldens.
- Updater produces an inactive immutable Archive and exposes terminating
  `doctor` and `contract-check` artifact commands.
- Backend loads an Archive only through an explicit `current.json`, is the sole
  statistics authority, and exposes loopback API/health/metrics routes.
- Frontend is a relative-URL Vite SPA that must be served from its packaged
  artifact beside a same-origin `/api/**` reverse proxy.
- The immutable visual/interaction oracle is commit
  `644b7748674e553f863d0ffd61d029f86fdc0717`, specifically its accepted
  `frontend/src/workbench/**` surface.
- The checked-in minimal Archive is suitable for contract and artifact smoke,
  but the final performance and representative-journey gate requires a real,
  full, inactive Archive supplied locally by the caller.

## Goals / Non-Goals

**Goals:**

- Provide one command that makes a strict, machine-readable final development
  decision from attested immutable inputs.
- Re-run and record the existing contract/component/race/artifact gates without
  duplicating their business assertions.
- Prove the immutable Updater artifact, packaged Backend API, full Archive, and
  packaged Frontend at real process/HTTP/browser boundaries.
- Compare preserved frontend behavior against the fixed oracle while isolating
  only exact, already-approved production additions.
- Characterize bounded development performance on a recorded machine profile.
- Leave no product mutation, generated tracked evidence, process, container,
  listener, or copied Archive behind.

**Non-Goals:**

- Fixing or extending Backend, Updater, Frontend, Contracts artifacts, schemas,
  goldens, component tests, or build definitions.
- Producing/downloading a new full Archive during the final decision, relying
  on live personal-collection state, or treating the minimal fixture as a full
  Archive.
- A release, deployment, activation, migration, production load test,
  production resource plan, SLO, or production-readiness certification.
- Redesigning the frontend, accepting reviewer-preference differences, or
  changing the fixed oracle.

## Change Boundary

| Field | Declaration |
|---|---|
| Status | investigated: complete; specified: complete; implemented: no; verified: no; committed: no; pushed: no; released: no; deployed: no |
| Owner | One Contracts acceptance apply agent owns implementation; the main agent owns specification review, final acceptance, task markers, and repository lifecycle. |
| Writable paths | Apply: only `contracts/acceptance/**`. OpenSpec lifecycle: only this change's `.openspec.yaml`, proposal, design, tasks, and `specs/**`; the apply agent cannot edit them. Generated evidence: only ignored `contracts/acceptance/.tmp/**`, absent at handoff. |
| Read-only protected inputs | Every repository path outside the exact owned paths, including all Backend/Updater/Frontend code and tests, artifact code, existing Contracts schemas/goldens/OpenAPI, root documents/config, `.impeccable/**`, root specs and sibling changes; oracle `644b7748674e553f863d0ffd61d029f86fdc0717`; accepted artifact/full-Archive inputs; external repositories, refs/remotes, registries, hosts, services, secrets, production paths/state, and public Internet. |
| Deletion complement | None. Only one harness-created run directory below `contracts/acceptance/.tmp/**` may be removed by exact path after containment/type/ownership checks. |
| Mutable refs | None. |
| Consumes | Archived `produce-development-artifacts` and `close-release-readiness-identities`; one clean accepted product-candidate revision/tree named by the artifacts; one later clean harness/control revision/tree; three accepted component roots and their compatibility manifest; one caller-supplied official full inactive Archive; fixed oracle; existing contract/golden/component/race/artifact commands; pinned current and historical-golden toolchains; caller-provisioned sealed caches; pinned browser runtime. |
| Produces | Versioned acceptance input/result/budget/exception schemas, a closed matrix, local orchestrator, browser journeys, focused/negative tests, README, and ignored per-run evidence. Only a green complete matrix emits `development-accepted-operations-pending`. |
| Dependencies | Exact direct dependencies: `produce-development-artifacts` and `close-release-readiness-identities`, both completed and archived. Their transitive closure supplies all component capabilities. Apply additionally requires no active change besides this acceptance change, no dirty product candidate, and no dirty harness/control checkout. |
| Deliverables | Only `contracts/acceptance/**`: CLI and libraries, schemas, matrix, oracle-exception registry, browser scenarios, development budgets, tests, package manifest/lock, README, and narrow `.gitignore`. No run output is committed. |
| Acceptance | Clean/immutable input attestation; existing contract/component/race/artifact gates; full-Archive temporary activation copy; immutable Updater artifact checks; packaged Backend API/UI E2E; fixed-oracle shadow/golden comparison; required browser matrix; bounded performance measurements; tamper/timeout/network/residue negatives; strict OpenSpec/exact-path/residue/diff checks. |
| Non-goals | Product or existing-test fixes, dependency changes outside this owner, new product behavior, full-Archive acquisition, personal live-network E2E, signing/publication/release/deploy/activation, production benchmarks/resource sizing/SLO/readiness claims. |
| Operations deferred | Production Compose/nginx/systemd/timers; users/paths/permissions/TLS/secrets; real pointer activation/restart/rollback/cleanup/`update_activated`; registry/release/deploy/SSH; production monitoring/SLO; cutover, observation, migration, rollback drill, and legacy removal. |
| Stop/rollback conditions | Stop on unarchived dependency, another active change, dirty/mixed/mutable input, missing full Archive, unreviewed spec, path overlap, undeclared dependency/network/state, product mutation, fixture-backed production path, oracle drift, timeout, residue, unbounded benchmark, or attempted owner repair. Roll back only this change's uncommitted files and its own validated ignored run root. |

Dependency direction is:

```text
accepted source + component locks/contracts
  -> accepted component artifacts + compatibility manifest
  -> caller-supplied full inactive Archive
  -> acceptance input attestation
  -> existing gates
  -> disposable local runtime
  -> API/UI/oracle/browser/performance matrix
  -> canonical result
  -> green development verdict or blocking owner-routed failure
```

No arrow points back into a product owner. The harness may observe and report a
failure but cannot repair or redefine it.

## Decisions

### 1. Use one closed matrix and one canonical result as the decision boundary

`contracts/acceptance/matrix.json` will enumerate every required cell with a
stable ID, owner capability, phase, command/scenario ID, timeout, required
inputs, and result fields. The orchestrator accepts no arbitrary shell command
from a caller or environment. It validates the closed matrix and runs cells in
the fixed order needed to preserve failure attribution:

1. admission and immutable-input attestation;
2. existing cross-language and component gates;
3. artifact compatibility/smoke;
4. full-Archive/runtime API checks;
5. packaged browser journeys and oracle shadow;
6. performance characterization;
7. residue, input-reseal, and verdict.

Every cell has `pass` or `fail`; required cells cannot be skipped. A canonical
JSON result contains the complete cell set even after a fail-fast execution:
unrun cells are recorded as `blocked` with the originating failed cell and
cannot contribute to a green verdict. Paths, usernames, raw logs, secrets, and
response bodies are excluded; evidence is referenced by run-relative path and
SHA-256.

Alternative considered: a shell script that streams component exits. Rejected
because it cannot strictly validate input/result shape, close the command set,
or distinguish failed, blocked, and missing evidence.

### 2. Attest exact bytes before starting any expensive process

The CLI consumes an explicit input document naming:

- the clean accepted product-candidate revision/tree named by the artifacts;
- the later clean harness/control revision/tree that contains this harness;
- Backend, Updater, and Frontend artifact roots;
- the assembled compatibility manifest;
- one full inactive Archive version root;
- the fixed oracle commit;
- exact current executables, the separate historical Query-golden
  Node/npm/Go/gofmt executables, immutable dependency/tool cache roots and
  their seals, and the browser channel.

It reuses the artifact validator and Git checkout identity logic created by the
dependency instead of copying their schema rules. It verifies all three
component statements share the candidate revision/tree and target, and the
compatibility manifest digest names exactly those statements. It separately
attests the harness/control checkout and proves that its diff from the product
candidate is confined to `contracts/acceptance/**` and the reviewed OpenSpec
lifecycle paths. Every protected product and artifact implementation
blob/mode SHALL be identical in the two trees. Dependency archival and the
sole-active-change rule are evaluated in the harness/control revision, not in
the earlier product-candidate planning snapshot.

After admission it creates one local, no-hardlink clone below the run root,
checks out the exact candidate detached, and verifies its revision/tree and
tracked blob/mode inventory again. Existing gates that legitimately create
`node_modules`, `dist`, `.cache`, `.tmp`, virtual environments, or generated
checks run only in that clone. The clean live harness/control checkout remains
an independently identified, attested read-only input and executes only the
acceptance-owned orchestrator. The clone gives the artifact coordinator the
real product-candidate Git object identity it requires without adding a
worktree or administrative record to the live repository.

The Backend owner has one narrower lifetime exception: its sealed Go module
copy remains below `backend/.cache/go-mod` through the fixed Backend check and
the immediately following independent query-binary measurement. The Harness
then performs exact, bounded removal of `backend/.cache` and `backend/.tmp`
before any coordinator re-attestation. This keeps upstream cache control files
such as `module@version/.gitignore` out of later Git authority scans without
weakening the accepted path grammar or treating ignored dependency bytes as
tracked source.

That exception begins with a Harness-owned eager preparation step, not the
ordinary Backend bootstrap path. The Harness copies the exact locked download
and Go 1.26.5 toolchain closure into the absent fixed target, validates its
completion marker and GOROOT, and derives the canonical sorted unique set of
exact `module@version` records from only the non-`/go.mod`
content-checksum lines in the accepted `backend/go.sum`. For this frozen
candidate the set contains exactly 62 unique records. Ordering compares each
literal `${module}@${version}` with ECMAScript
`localeCompare(other, "en")`; its terminal-LF newline-list SHA-256 is
`65d2972c8632a90b2e3331071db6016db037480e7fe04a615e44931656f31bb7`.
Every record must own the matching `.info`, `.mod`, `.zip`, and `.ziphash`
bytes in the sealed seed. While the target remains writable, one fixed
offline `owner-backend-go-mod-download` command uses argv
`["mod", "download", "--", ...contentSet]`, `GOFLAGS=-mod=readonly`, and
`GOPROXY=off` to pre-expand only that checksum-authorized set.

The earlier no-argument form expanded the main module's ordinary build/test
set but omitted packages needed when the Product's fixed `go mod tidy`
traversed its accepted tool dependency and test graph; the later read-denied
tidy consequently attempted to create cache `.lock` files. Conversely,
`download all` traverses the complete module graph and requests historical or
test-only module ZIPs that have only `go.mod` checksum authority and are
intentionally absent. The exact content set is the closed middle: derivation
from already admitted content authority, not acquisition or expansion to the
`.mod`-only historical graph. `all`, package/module patterns, floating or
different versions, version ranges, missing/reordered/duplicate records, and
every proxy other than `off` remain forbidden.

The Harness seals `backend/go.mod` and `backend/go.sum` around materialization
and rejects either source-authority change. It re-attests the original
download/toolchain seed. Pinned Go 1.26.5 leaves one zero-byte cache `.lock`
beside each explicit content version. The Harness requires exactly the 62
canonical content-derived lock paths, whose newline-list SHA-256 is
`0429a1eb475367e7950d45e11c826632893b8a08892b78985da17bedb30e7f28`;
each must be a single-link `0644` regular file with no symlink ancestry. It
then unlinks only those exact contained files, rejects missing, extra, changed,
or surviving lock/temporary state, and seals the complete expanded
module/toolchain tree, including content, mode, directory identity, inode, and
link identity. The evidence command ID remains
`owner-backend-go-mod-download`; it must not retain the obsolete `-all`
suffix. The Product's original `go mod tidy` remains in the Backend owner check
and must succeed under complete cache write denial without changing `go.mod`,
`go.sum`, or the expanded-cache seal.

The Backend check receives the validated fixed GOROOT only through
`BGMSS_ACCEPTANCE_GOROOT`; caller `GO_BOOTSTRAP` and every legacy
`BGMSS_GO_*` lazy-bootstrap input are absent. The existing lazy bootstrap
remains available only to Harness consumers whose contract still requires it,
including the Archive consumer. Both the Backend check and the independent
query-binary measurement deny writes to the complete target cache in their
outer sandboxes. The Harness compares the full seal unconditionally after the
check and after the measurement, preserves the first command or measurement
failure as primary if a later seal or cleanup also fails, and only then enters
the existing bounded generated-root cleanup.

The Backend check is not fully networkless internally: its unchanged Product
test matrix intentionally creates ephemeral `127.0.0.1` HTTP listeners and
clients. A blanket `(deny network*)` rejects those tests before they exercise
the Product. The exact Backend-check profile therefore starts from deny-all,
adds only inbound local-address and outbound remote-address
`localhost:*`, and appends the existing complete-cache literal/subpath write
denials. A focused sandbox probe must successfully bind and call one ephemeral
loopback server while a public TCP connection fails with the platform's
permission error. Materialization and the independent query-binary compile
retain full network denial; no Backend owner command may reach a non-loopback
address.

The Contracts owner cleanup inventory is closed over every package it
installs. Besides Query and schema roots, it removes `node_modules`, `.cache`,
and `.tmp` for all six API goldens before artifact compatibility. This ordering
is required because the coordinator deliberately walks all of
`contracts/goldens` as tracked control-plane input; a tracked ignore rule does
not authorize dependency files or `.bin` symlinks to participate in that
walk.

Every schema-tooling package receives its seeded npm cache only at the owning
schema root's `.cache/npm`, never below `tooling/.cache`. Schema verifiers may
exclude their declared root-level generated cache while continuing to reject
any cache byte inside the tooling subtree whose closed inventory they attest.
The cleanup inventory names those exact schema-root `.cache` paths.

The API Catalog golden invokes the locked
`github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen@v2.8.0` tool. Go
resolves an explicit `module@version` command only after consulting that
module's local version list for deprecation metadata, even when all exact
module bytes are already present. The Harness therefore materializes the
single canonical `v2.8.0\n` list beside no-hardlink copies of the four seeded
and sealed v2.8.0 proxy files in a dedicated run-control directory outside the
Catalog golden's verifier-owned `.cache`. It points `GOPROXY` at that
run-owned `file://` proxy and rechecks the list identity immediately after the
command, before whole-run cleanup. This separation is required because the
Catalog verifier removes its own `.cache` on both success and failure; that
cleanup must not erase the proxy authority before the Harness can re-attest
it. The outer sandbox still denies all network access; no version discovery,
fallback proxy, or unsealed module byte is admitted.

The Archive contract command inherits the same closed Go environment as the
other hermetic Go consumers and additionally fixes `GOWORK=off`; an ambient
workspace can neither alter module selection nor make a valid candidate fail.
Its seeded npm cache can contain admitted `0555` directory layers. Before
removing any declared generated root, cleanup performs a complete no-follow
inventory while the tree is still unchanged. A symlink root, symlink ancestor,
absolute or lexically escaping descendant symlink, special entry, or regular
file with an external hard-link identity fails closed. A relative descendant
symlink whose lexical target remains inside the exact root is recorded as a
leaf and is never followed or chmodded; this preserves the normal
`node_modules/.bin` output covered by the closed Contracts cleanup inventory.

After that inventory, cleanup creates one absent, private quarantine name in
the same canonical parent, atomically renames the exact root there, and proves
the quarantined root has the same device/inode/type and complete relative
inventory. An identity mismatch is restored without chmod or deletion and
fails closed. Only the proven quarantined root may gain owner-write/search
permission on directories; regular files and symlinks are never chmodded.
Removal uses the quarantined name for the existing four-attempt bounded retry.
A terminal removal failure restores the remaining tree to the declared root
when that path is absent; otherwise both the declared and quarantine paths are
reported as blocking residue. The random quarantine name is recorded only in
bounded cleanup evidence and cannot authorize a glob or broad deletion. A
command failure remains primary and cleanup residue remains independently
blocking.

The four-attempt budget covers both acquisition of the quarantine by atomic
rename and its removal. A transient rename failure is retried only while the
declared root still has the inventoried identity and the quarantine name
remains absent; otherwise cleanup fails closed. This cleanup runs after the
owner command and its supervised descendant closure have stopped. The stable
owner-settlement invariant is therefore a precondition, not an adversarial
filesystem claim: the Harness does not promise descriptor-relative resistance
to a hostile foreign process with the same UID racing inside an unpredictable
quarantine. If owned-writer settlement cannot be established, owner-root
cleanup does not start and the parent retains responsibility for guarded whole
run-root cleanup and a blocking result.

The Query golden remains authoritative even though it intentionally records an
older Node/npm/Go toolchain than the current Frontend and Backend gates. The
harness therefore admits and records both toolchain families and invokes each
owner with its exact required family; it never rewrites the golden, substitutes
the current tools, or hides the historical identity.

All owner installs are offline. Before admission, the caller may provision one
dedicated cache from the exact repository lockfiles and pinned toolchain
artifacts. Admission requires complete dependency closure, regular
non-symlink bytes, content seals, and read-only cache inputs. The harness
copies the required package/module/browser cache bytes with new inodes into
its owned run root, applies offline package-manager settings plus host/Docker
network denial, and verifies source and copied cache seals after the run.

The cache manifest's recorded product revision is the immutable
`preparedFromRevision`: it explains which commit supplied the dependency
authorities when the cache was built, but it neither labels nor replaces the
accepted product candidate. The manifest is never rewritten, rebased, copied
under a new identity, or supplemented by a caller-provided compatibility
boolean. Whether the prepared and accepted revisions match or differ,
admission executes the same closed compatibility proof before copying cache
bytes or launching any process.

That proof reads raw regular `100644` Git blobs from exact object IDs with
replacement refs and lazy fetching disabled. Its authority set contains
exactly 18 files. The exact mappings are:

- the 11 product locks at frozen
  `locks/product/<repo-path>/package-lock.json`, mapped to the same
  `<repo-path>/package-lock.json` in both preparation and accepted-product
  commits;
- frozen
  `locks/harness/contracts/acceptance/package-lock.json`, mapped only to
  `contracts/acceptance/package-lock.json` in the accepted harness/control
  commit;
- frozen `locks/oracle/frontend/package-lock.json`, mapped only to
  `frontend/package-lock.json` in the fixed oracle commit;
- product `backend/go.mod` and `backend/go.sum`; and
- product `updater/uv.lock`; and
- accepted-product-only
  `contracts/goldens/query/fixtures/go-module/go.mod.lock` and
  `contracts/goldens/query/fixtures/go-module/go.sum.lock`.

The preparation and accepted-product trees SHALL each contain exactly the same
11 product package-lock paths. The accepted harness/control tree SHALL contain
those same 11 plus exactly its acceptance lock, and the fixed oracle's admitted
lock set SHALL be exactly its frontend lock. The manifest lock declaration and
canonical npm-lock-inventory arrays SHALL each contain the exact same 13
entries in the same order with the same path, digest, package count, and
integrity count. The manifest SHALL bind the inventory's exact relative path,
byte count, and SHA-256; the inventory SHALL bind
`productRevision=preparedFromRevision` and the fixed oracle revision. Every
lock byte SHALL equal its frozen copy and appropriate preparation/accepted
owner Git blob.

The Go pair SHALL separately equal its preparation blob, exact frozen
`go/backend/{go.mod,go.sum}` byte, and accepted-product blob. The manifest
SHALL bind the frozen Go-validation document; that document SHALL identify
`candidateRevision=preparedFromRevision` and bind only its actual
`goSumPath=backend/go.sum` and matching digest. It SHALL NOT be represented as
an authority over `go.mod`.

The two Query module locks SHALL be exact regular `100644` blobs in the
accepted Product candidate and SHALL equal the Query manifest's independently
sealed path, size, and digest evidence. They MAY be absent from
`preparedFromRevision` and therefore SHALL NOT be fabricated as preparation
blobs or retroactively inserted into the immutable cache manifest. Instead,
the compatibility proof SHALL parse the accepted Query `go.sum` into a closed
module/version set, prove that set is a subset of the Backend source/target
module closure used to seed the frozen Go cache, and prove every exact required
module cache file is present in the sealed cache inventory. Any extra Query
version, missing cache byte, checksum disagreement, or unbound lock fails
before cache copy or process launch.

The uv lock SHALL equal the preparation and accepted-product blobs. The
manifest SHALL separately bind the uv-validation document and closure plan by
exact relative path, byte count, and SHA-256. The validation document SHALL
bind the plan by its exact path and SHA-256. The validation document and plan
SHALL agree on `candidateRevision=preparedFromRevision`,
`lockPath=updater/uv.lock`, and the lock digest. Neither document is required
to contain a self-digest or a reverse reference that its immutable bytes do
not provide. Because no frozen uv-lock copy exists, evidence SHALL describe
this as preparation-to-accepted byte equality plus directed dual frozen
digest authority, not as a copied lock byte.

Missing/unreadable source objects, duplicate/extra/reordered declarations,
wrong owner/path/mode, source symlinks, count drift, authority-reference
tampering, or any byte/digest disagreement fails admission before cache copy,
package installation, component execution, container, API, or browser work.

The orchestrator writes one final canonical run-relative compatibility
evidence envelope with distinct `preAdmission` and `postCleanup` phases. Each
phase records the four revisions, exact authority counts, every authority's
logical owner/path, authority scope, available Git tree mode/blob OID, byte
digest and comparison, the
immutable manifest/root seals, and its own `authoritySetSha256`. The envelope
does not contain its own file digest. Matrix evidence descriptors bind the
pre-admission phase from `admission.sources` and the post-cleanup phase from
the final residue/seal cell; the canonical result records the envelope's
run-relative path and externally computed `evidenceSha256` plus both phase
digests and the same revisions. A post-cleanup mismatch cannot undo completed
work, but it blocks the final verdict and any later process launch.

Exact tool executables and the runtime files they load are admitted separately
and re-sealed after use. For every non-system runtime distribution, the
harness derives one exact canonical root, inventories directory/file modes,
file sizes and digests, and safe internal symlink targets where the
distribution requires them. It rejects hard links, special entries, escaping
links, missing/new entries, and any pre/post difference. The owning gate runs
under an outer sandbox that denies writes to each admitted runtime root.
The closed `admission.tools` cell includes source attestation, all current-tool
and browser new-inode copies, their complete projected seals, and candidate
clone materialization. These byte-scale operations are deliberately kept
inside one parent-supervised cell so no copy can occur before or outside the
admission decision. Its reviewed timeout is 600,000 ms: finite and well below
the two-hour suite watchdog, but large enough for a cold copy and full re-seal
of every admitted distribution on the recorded machine profile. Neither
runtime input nor observed duration can widen this value, and a timeout is a
terminal failure rather than a retry signal.
For a copied current-tool closure, source modes remain part of admission while
the copied mode is the deterministic source mode with every write bit removed.
Materialization withholds all copied execute bits until every directory and
non-executable file in the copied tree is already non-writable, then enables
only the admitted execute bits without restoring write access. The destination
is fully sealed against that derived projection before use and that projected
seal remains the later re-seal authority. This ordering prevents same-user
interpreter discovery from rewriting bytecode between copy and admission
without weakening byte, path, size, link, or new-inode comparison.
Installed current/historical npm package roots and the admitted CPython
distribution are part of this rule; hashing only `npm-cli.js` or the Python
launcher is insufficient. Platform libraries below `/System/Library` and
`/usr/lib` are bound to the recorded macOS development profile rather than
misreported as copied tool bytes.

The authoritative Query golden is one reviewed exception to copied tool
closures: it hard-codes the exact Node 24.16 executable identity and
`/opt/homebrew/Cellar/go/1.25.4/libexec/bin/{go,gofmt}`, clears child
environments, and actually runs npm-backed code generation and Go
compilation. Rewriting the golden or substituting the frozen two-binary Go
mirror would violate the owner gate, while that mirror cannot execute without
the original GOROOT. The harness therefore inventories and content-seals the
complete canonical historical npm package root and GOROOT, cross-binds the
fixed executables and the `go`/`gofmt` cache mirror, and keeps those runtime
roots non-writable before re-inventory and re-seal. Every Query command runs
under the Harness outer network-denial sandbox except
`--verify-codegen-projections`: macOS rejects its verifier-owned child
sandboxes when the verifier is already sandboxed, so that one command runs
directly with fixed Node/argv/cwd/environment/timeout. The accepted Query
verifier remains the sole Go executor. Before the direct command, the Harness
seals the accepted tracked `verify.mjs` blob and strict-valid `manifest.json`,
including the verifier self-identity. It treats the manifest as the closed
static authority for the four operation plans: exact inner profile text and
digest containing both `(deny network*)` and the telemetry-directory write
denial, executable, child/wrapper argv, cwd, environment, and module
input/pre/post seals. It then parses the verifier's single
`candidate-success Go stderr evidence` runtime summary and requires exactly
`primaryGeneration`, `deterministicReplay`, `gofmt`, and `compileSmoke` in the
closed order; zero accepted stderr for all four operations; and exactly eight
`0600` boundaries sealing two module files per boundary. The same verifier
and manifest seals must match after the command. Neither the static manifest
without a successful runtime summary nor the runtime summary without the
accepted static authority is sufficient. The result records this owner-fixed
in-place exception and SHALL NOT describe it as a copied or hermetic
new-inode tool closure. Any missing, linked, special, changed, or newly
created runtime entry blocks acceptance.

The Archive verifier needs a second, independently closed direct-command
exception for the same operating-system constraint. The accepted verifier
starts one bootstrap `sandbox-exec` process to discover Go telemetry state and
then starts every Go/gofmt operation through another `sandbox-exec` profile.
macOS returns `sandbox_apply: Operation not permitted` when the Harness first
wraps that verifier in its own sandbox, before any contract assertion runs.
The offline `npm ci` therefore retains its Harness outer network/runtime-root
sandbox, while only the exact subsequent
`contracts/schemas/archive/tooling/verify.mjs` command runs directly with the
accepted current Node executable, no arguments, fixed tooling cwd, the closed
Archive environment including `GOENV=off`, `GOWORK=off`,
`GOTOOLCHAIN=local`, `GOPROXY=off`, `GOSUMDB=off`, and the fixed fifteen-minute
timeout.

Before that direct command, the Harness binds the accepted tracked verifier,
package/lock, persistent schema inventory, builders, compatibility matrix and
goldens to the already-attested product-candidate tree; binds the installed
`npm ci` closure to that lock; and reuses the admitted current Node, npm, Go,
gofmt and CPython runtime seals. The same static and runtime authority is
re-sealed after the command, excluding only the declared generated
`node_modules`, `.cache`, and `.tmp` roots that are already covered by exact
owner cleanup. The direct result must be exit zero without timeout or signal,
write no outer stderr, and emit one bounded strict-JSON report. The Harness
cross-checks that report against the accepted Archive authority: exact six
schema order, the exact two-line quicktype 26.0.0 `--version` identity
(`quicktype version 26.0.0` followed by `Visit quicktype.io for more info.`),
effective Go environment, canonical Go/gofmt
executables, bootstrap profile and discovery argv, accepted telemetry mode,
inner profile, policy self-test, ignored forged-control keys, closed telemetry
diagnostic envelope, and exactly sixteen ordered Go/gofmt records whose
wrapper, profile, executable, cwd and argv match the verifier's closed plan.
The telemetry directory is a shared machine-global Go diagnostic root rather
than an owned input. Its closed `before`/`after` seals and derived `changed`
boolean must be structurally valid and internally consistent, but concurrent
foreign Go activity may legitimately make `changed` true; that value alone is
not blocking authority and SHALL NOT be relabelled as an owned immutable seal.
Any extra/missing command, forged report, authority drift, output
truncation/stderr, or cleanup residue fails `owner.contracts`.

This exception is deliberately reported as
`verifier-owned-inner-sandbox/direct-local-children`. Only the bootstrap and
sixteen Go/gofmt children carry kernel-enforced `(deny network*)`; the
accepted verifier process, quicktype, CPython and other local inspection
children do not have an outer syscall sandbox. Their admission comes from the
immutable reviewed verifier and locked local dependency/tool closure, not from
a claim that the host denied every possible socket. No public origin is an
intended or accepted input, and any future requirement for host-enforced
network denial of those non-Go children requires changing the authoritative
Archive verifier rather than silently widening this exception.

Cache provisioning is not a matrix cell or evidence of product acceptance.
The admission-time and final cache-to-source compatibility attestations are
matrix evidence; they prove only that the prepared dependency closure remains
exactly authoritative for the accepted candidate.

The full Archive gate accepts only a version directory containing regular,
non-symlink `manifest.json` and `bangumi.sqlite` plus a separately supplied
frozen official provenance root. That root contains:

- canonical `provenance.json`;
- the exact 419054508-byte
  `dump-2026-07-21.210441Z.zip` with digest
  `sha256:e1120169088407c66a94dacacda4dffaabe0e2e08cbcc8238c880f6c0140dd57`;
- the exact 539-byte `aux/latest.json` bytes from Archive commit
  `536b2864f8f23ee4ffd171ebfbe4c41fe1be2df1`, with digest
  `sha256:f97498acdfff461603f14862b80211707e89250ed55f1883c60051d58b2d9f24`;
- the exact 37723-byte `subject_staffs.yml` bytes from common commit
  `6a8442c17143a870357a5ff812362e8b5cfe9f9d`, with digest
  `sha256:0d5ac602157e33114029df611ea9dd46df32997e57c3a361b9e6f92250304394`.

`provenance.json` is canonical JSON with no undeclared fields and the exact
shape
`{schemaVersion:1,kind:"bgmss-official-archive-provenance",archive:{revision,latest:{path,size,sha256},asset:{path,name,url,contentType,size,sha256,members:[{path,role,size,sha256}]}},common:{revision,subjectStaffs:{path,url,size,sha256}}}`.
Every object is closed, each member role is exactly `consumed` or
`unconsumed`, and `members` is sorted by path.

Admission validates the provenance manifest against these reviewed constants,
re-seals the complete root, and checks that `latest.json` names the exact ZIP
URL/name/content type/size/digest. A bounded safe ZIP reader rejects
encryption, duplicate names, traversal, links, unsupported members, entries
outside the reviewed exact nine-member allowlist, missing allowlisted entries,
and decompression-limit violations. The seven `consumed` regular
`.jsonlines` members are exactly the seven names in
`manifest.json.sourceFiles`, and every uncompressed name/size/digest is bound
to that source account. The remaining reviewed `unconsumed` upstream members
are exactly:

- `episode.jsonlines`, size 332792564, digest
  `sha256:0d7020de68ba7b4ee838cf5ed30766a9153b429efb45ace4c97c2871832c68e7`;
- `person-relations.jsonlines`, size 8118624, digest
  `sha256:d7b4993d9af733fd34c6de5dcd0e0eca98e64da0623f1b26c5bb040e76262e11`.

The safe reader streams and hashes all nine members, while only the seven
`consumed` members participate in Updater source accounting. The pinned common
bytes bind the common commit/URL/size/digest. Admission then applies the
existing manifest/SQLite/dataVersion/schema/source-accounting and Updater
generator checks before any copy. Because the real Go `archive-smoke`
consumer accepts an activation-root rather than a standalone version-root,
the harness creates the independently sealed read-only activation copy and
runs that consumer against the copy before any packaged runtime starts. The
known minimal fixture identities and self-consistent synthetic producer cases
are rejected. Both Archive and provenance roots re-seal after the run.

This work belongs to a dedicated `admission.archive` matrix cell owned by
`contracts-archive-manifest`; `admission.artifacts` owns only component
statements and their compatibility manifest. This preserves correct failure
attribution before any owner gate or runtime starts.

The harness snapshots all protected tracked paths plus supplied immutable
inputs before execution and compares them after cleanup. A mismatch converts
the run to failure even if all functional cells passed.

Alternative considered: trust caller labels and only run the API. Rejected
because a minimal fixture, mixed artifact set, or mutated Archive could then be
misreported as final integration evidence.

### 3. Materialize activation only inside a disposable acceptance root

The supplied full Archive remains inactive and read-only. The harness copies
the exact manifest and SQLite bytes into:

```text
contracts/acceptance/.tmp/<run-id>/archive/
  current.json
  versions/<dataVersion>/manifest.json
  versions/<dataVersion>/bangumi.sqlite
```

It writes a canonical pointer derived from the already validated
dataVersion/manifest digest, makes the complete copy read-only, and snapshots
it before processes start. This is development fixture materialization, not
activation of the supplied Archive or any production path. Hard links and
symlinks are forbidden because a defective consumer could mutate the source.

The packaged API uses this copy through a loopback-only, internal-network,
read-only container with dropped capabilities and a bounded writable tmpfs.
The immutable Updater artifact runs `doctor` and `contract-check` separately
with no network and no write outside its tmpfs. The frontend artifact is
served by the acceptance process and proxies only same-origin `/api/**` to the
loopback API.

Alternative considered: add `current.json` beside the supplied Archive.
Rejected because even a local final acceptance must not mutate or activate an
input owned by another stage.

### 4. Reuse existing gates; do not create a parallel business test suite

The matrix invokes the accepted commands for:

- Contracts schema/golden verifiers and API-golden consumers;
- `backend/scripts/check.sh`, including full Go tests, fuzz seeds,
  benchmarks, race, vet, build, and module verification;
- Updater pytest/mypy/Ruff/locked-wheel gates;
- Frontend wire/architecture/unit/type/build/artifact gates;
- component artifact validation and the compatibility coordinator smoke.

For the historical Query golden, the Harness preserves the owner's closed
sequence and source roles: after preparing `codegen-a` and `codegen-b`, it
actually runs the locked Redocly lint command against
`codegen-a/source/openapi/openapi.yaml` and accepts only exit zero with exactly
zero errors and nine warnings. It then produces both Redocly bundles, and each
locked TypeScript command consumes its own
`source/openapi/openapi.yaml`. The expanded shared OpenAPI and dereferenced
bundles are not substitutes for those paired source projections; the Query
owner verifier remains the authority for the resulting TypeScript and Go
seals. A focused Harness negative SHALL prove a missing lint process, a changed
source, or any other error/warning count cannot pass; the expanded shared
OpenAPI's known ten-warning result remains a negative rather than a new
baseline.

The acceptance owner adds tests only for its orchestration behavior:
schema/closed-matrix validation, command closure, fail/timeout/blocked
semantics, input immutability, redaction, network policy, process cleanup,
oracle exception validation, result canonicalization, and residue. It does not
copy query/statistics/API expected values. Runtime requests are sourced from
the accepted API goldens and validated against OpenAPI/golden consumers.

Alternative considered: rewrite end-to-end expectations in the harness.
Rejected because that would make Contracts acceptance a second statistics or
API authority.

### 5. Keep real API/UI journeys global and network-independent

The full-Archive runtime phase exercises:

- `/livez`, `/readyz`, `/metrics`, and `/api/v1/catalog`;
- global ranking and candidates queries;
- person detail for a person selected from the real ranking response;
- partners for that person;
- pair and group co-star journeys using real candidates;
- pagination/search/sort/view changes, request cancellation/latest-response
  behavior visible from the frontend, and clean termination.

The harness obtains IDs and position keys from the live catalog/results rather
than hard-coding full-Archive contents, while structural and semantic
assertions remain those of OpenAPI and the accepted goldens. Personal queries
remain covered by component/contract gates because they require mutable public
collection state; the final E2E never contacts Bangumi or any other public
origin.

The browser network observer permits only the acceptance loopback origin and
its same-origin API/image paths. Any direct `api.bgm.tv`, image upstream,
registry, analytics, or other non-loopback request fails before its response
can be used.

One explicit SafeImage failure-state cell may abort, without fulfilling or
rewriting, exact same-origin `/api/v1/images/bangumi/**` browser requests.
Those aborts are recorded separately and pass only when every affected
SafeImage reaches its accepted stable error state without layout shift,
console error, retry escape, or direct upstream request. Other failed
resources remain failures. This keeps the final journey network-independent
without inserting fixture image bytes into a production path.

Alternative considered: exercise one live UID. Rejected because privacy,
availability, rate limiting, and mutable collection state would make the final
verdict non-repeatable.

### 6. Separate preservation evidence from approved additions

The harness materializes the oracle frontend from the fixed Git object without
moving a ref or creating a worktree. The oracle source and lock are copied
under the run root and built from a pre-provisioned offline cache. Absence of
required locked bytes is an admission failure, not permission to fetch or
skip. Candidate and oracle are served in parallel to the same pinned local
Chromium runtime, locale, timezone, DPR, reduced-motion setting, font set,
theme, viewport, and seeded clock.

`oracle-exceptions.json` is a closed, schema-validated registry. Each entry
names one route/state/selector/property or exact rectangular mask, one
classification (`approved-addition` or `dynamic-data`), and a governing
`PRODUCT.md`, `DESIGN.md`, or archived capability requirement. Wildcards,
whole-page masks, threshold changes, free-form runtime additions, and an
exception whose authority cannot be resolved are rejected.

For stable preserved regions, comparison records:

- normalized accessibility/DOM role/name/state snapshots;
- bounding boxes, computed typography, color, border, radius, shadow,
  visibility, focus, overflow, scroll owner, and responsive transition facts;
- action traces for keyboard, focus return, Escape, mask/inert behavior,
  Drawer open/close, theme, mode, selector, list, tooltip, and scroll;
- paired screenshots with exact dynamic masks and a narrow fixed
  anti-alias-only threshold.

Dynamic result text/media may be masked only at exact registered slots; slot
geometry, hierarchy, formatting, and interaction remain compared. Production
additions are tested separately as new capability behavior and must not alter
surrounding preserved regions. A non-registered difference fails.

Alternative considered: save a new candidate screenshot as the golden.
Rejected because it would let the implementation redefine the oracle and
would commit generated evidence.

### 7. Use one acceptance-only browser dependency

`contracts/acceptance/package.json` and its lock may add exactly one
acceptance-only direct development dependency: `@playwright/test`, pinned to an
exact reviewed version. It provides Chromium control, isolated contexts,
network/console instrumentation, accessibility/DOM inspection, screenshots,
and process-safe timeouts. It contributes zero Backend, Updater, or Frontend
runtime/bundle bytes. Browser binaries are pre-provisioned and version-attested
inputs; the change does not download them.

Alternatives considered:

- The interactive Browser connector: useful for main-agent spot checks but not
  a repository-owned, repeatable, machine-readable gate.
- Hand-written Chrome DevTools Protocol control: avoids a dependency but adds
  a large bespoke protocol/client/timeout surface to a security-sensitive
  harness.
- Cypress or a second visual-diff stack: larger duplicate runtime and no value
  over the single Playwright owner.

The lockfile, offline `npm ci --ignore-scripts`, package license, dependency
inventory, no-install-script policy, exact direct-dependency allowlist,
harness unit tests, and proof of zero production-bundle impact are mandatory
acceptance gates. The local Node module and browser cache live only below the
ignored run root and are absent at handoff.

### 8. Treat performance as bounded development characterization

`budgets.json` defines versioned hard development ceilings already grounded in
accepted component contracts:

- Frontend reachable initial JavaScript gzip remains below 300 KiB.
- Backend query test binary remains at or below 16 MiB.
- Cache metrics never exceed their accepted aggregate logical budgets.
- API request cells remain below the existing 30-second hard request bound.
- Full-Archive readiness, each browser journey, and the whole suite have
  explicit timeouts; no benchmark can run unbounded.

The result additionally records, without converting observations into an SLO:

- full-Archive manifest/SQLite/source/table counts and sizes;
- API cold readiness and graceful shutdown duration;
- cold/warm durations and response bytes for representative global endpoints;
- Backend container CPU time, current memory, a 250 ms sampled high-water,
  exact 1 GiB memory/swap hard-limit inspection, `OOMKilled=false`, cache
  items/bytes, and request counts from local metrics/runtime inspection; the
  sampled high-water is never described as an exact cgroup peak;
- browser navigation/ready/action durations, transferred bytes, request count,
  and DOM size;
- component artifact and frontend compressed sizes;
- machine OS/architecture, logical CPU count, memory class, Docker, toolchain,
  and browser versions.

Machine-sensitive ceilings live in a named reviewed profile and can be changed
only by a later OpenSpec amendment; the runtime cannot learn or widen them.
The report says “development characterization on this recorded profile,” not
“production capacity” or “SLO met.”

Alternative considered: record timings but never fail. Rejected because the
master plan requires performance budgets, not merely telemetry. Alternative
considered: reuse deferred production resource targets as SLOs. Rejected
because production sizing and acceptance belong to a later operations change.

### 9. Fail closed and preserve complete diagnostics without committing them

The public formal `run` command is a parent supervisor, while the complete
stateful matrix executes in one child worker. This is a run-level boundary,
not a process-per-cell design: the worker may retain the accepted Backend,
browser, servers, and other reviewed state across cells. Before each action it
sends one closed, monotonically ordered checkpoint containing the run
identity, matrix sequence, cell ID, phase, and declared deadline. The parent
uses its own monotonic clock to enforce the current cell and whole-suite
deadlines outside the worker event loop, so a synchronous loop, microtask
starvation, stalled I/O, or an unresponsive dependency cannot suppress the
watchdog.

The worker runs in a separately controllable process group and all observed
descendants remain bound by the stable-identity ancestry ledger. On a
deadline, malformed/out-of-order checkpoint, lost worker, or worker-side
cleanup failure, the parent terminates that exact owned closure, performs
guarded run-root and named-runtime cleanup, re-seals protected inputs, and is
the sole writer of the canonical 56-cell fail/blocked result from the last
accepted checkpoint. The parent never trusts a partial worker result as
canonical. In-process revocable action/output gates remain defense in depth
for responsive failures; they are not the proof of hard timeout enforcement.

An orderly worker terminal code is a separate closed branch. Code zero is the
only branch permitted to prove every supervisor-prepared runtime resource
released and validate a green worker result against parent facts. Code one
with one IPC-acknowledged direct failed cell is already a legitimate matrix
failure: the parent must not first apply green release/result validation to
resources it prepared before the worker reached runtime handoff. It closes the
worker process group, performs the common external cleanup exactly once,
re-seals protected inputs, and writes the canonical fail/blocked result with
that acknowledged cell failure as primary. Only after the parent has validated
the acknowledged prefix and direct-failure evidence, any new cleanup, residue,
failure-evidence registration, re-seal, or canonical-write fault remains a
blocking secondary fact and may not replace the originating cell identity or
be relabelled as an invalid worker result. If an earlier acknowledged passing
cell's evidence fails parent validation, that earlier evidence defect remains
the primary `SUPERVISOR_EVIDENCE_INVALID` boundary instead.

The orchestrator launches every child in its own process group/container name
derived from a bounded random run ID, closes inherited environment variables,
sets explicit timeouts/output limits, sends graceful termination then bounded
kill, and verifies listener/process/container/image/network cleanup. For host
commands it also maintains a continuously refreshed ancestry ledger whose
stable identity follows every observed descendant through `setsid`, environment
clearing, working-directory change, and reparenting. Only a ledger-owned
identity may be signalled. Whole-host process drift is diagnostic and never
authorizes attribution, cleanup, or a failure by itself because a normal
desktop creates unrelated helpers during a multi-hour run. The unprivileged
macOS profile cannot observe an adversarial fork/session escape that completes
before the first process snapshot; the report states that sampling boundary
instead of guessing ownership or killing a reused/foreign PID. It captures
bounded stdout/stderr to run-relative files and stores their digests; the
canonical result contains only sanitized summaries.

OCI load admission separates archive content identity from daemon store
identity. An exact Docker inspection `Descriptor` is authoritative for the
manifest tuple; the daemon `Id` is only a syntactically valid, recorded opaque
runtime identity, and absent `RepoDigests` are valid while any present values
must bind the admitted manifest. Descriptor-less inspection is accepted only
for the classic store with `Id == configDigest`; containerd without a
descriptor is rejected. The first post-load `Id` is retained before all later
checks so a disappearing owned tag cannot erase cleanup accountability.
Cleanup removes only the exact run-owned tag, never a digest; an addressable
observed ID left under any reference is blocking residue.

Browser contexts expose an exact observed external-request counter and fail on
any public/non-loopback request. Host commands and containers separately prove
network denial through their sandbox/network policy. The report does not claim
that denied non-browser connection syscalls were observed when the platform
offers no syscall-level counter.

After a run root exists, any setup, cell, worker, supervision, or cleanup
failure completes parent-controlled cleanup and result validation, marks later
cells blocked, exits nonzero, and prints the run-relative result path.
Admission failures before a run root exists emit no run result. A green result
requires:

- every required cell passed;
- no blocked or skipped cell;
- no input/protected mutation;
- no unexpected network;
- no residual process/container/network/image/listener/temp path;
- a valid canonical result with the exact verdict.

Results, screenshots, traces, copied Archive bytes, browser profiles, and logs
are always ignored and deleted before handoff. A developer may preserve one
failed run temporarily for diagnosis, but it remains untracked and cannot be
used as acceptance after inputs change.

Alternative considered: commit the latest report for audit history. Rejected
because it embeds machine- and run-specific generated state and makes normal
acceptance mutate the repository.

## Risks / Trade-offs

- [A caller supplies a tiny or synthetic Archive as “full”] → Validate official
  source identity, all seven source accounts, generator/contract facts, reject
  known fixture/synthetic identities, and run the real Go consumer.
- [Copying a full SQLite file is expensive] → Stream one bounded byte copy,
  measure it separately, avoid hard links, and remove only the owned run root.
- [Oracle and production data differ] → Mask only exact registered dynamic
  slots while comparing their geometry/format and test approved additions in
  separate cells; broad masks are schema-invalid.
- [Pixel rendering varies by host] → Pin/record browser, DPR, locale, timezone,
  fonts, motion, and viewport; combine narrow screenshot tolerance with exact
  semantic/geometry/style assertions rather than relying on pixels alone.
- [Existing full gates are slow] → Keep one final ordered run, fail fast while
  recording blocked cells, and do not duplicate their assertions.
- [A failing owner command is followed by a transient generated-root removal
  race] → Always attempt exact cleanup with bounded retries, preserve the
  originating command failure as primary, and record cleanup failure/residue
  separately; cleanup failure remains blocking when no earlier command failed.
- [A seeded Go module contains an upstream `.gitignore` under a
  `module@version` directory] → Keep the cache only through the two Backend
  operations; offline-materialize and seal the complete extracted closure
  before write denial, re-seal after each operation, then remove the exact
  Backend generated roots before coordinator re-attestation; do not widen Git
  path or ignore-control admission.
- [API-golden `npm ci` output remains under recursively attested
  `contracts/goldens`] → Derive a closed cleanup inventory from the six fixed
  installed packages, remove each package's `node_modules`, `.cache`, and
  `.tmp`, and fail the Contracts owner before coordinator traversal on any
  cleanup error or residue.
- [Archive verification inherits a host Go workspace or its admitted npm cache
  is read-only] → Fix `GOWORK=off`, completely validate each exact cleanup tree
  before mutation, admit only non-escaping relative symlink leaves, atomically
  quarantine and re-attest the exact root, reject special/external-hard-link
  entries, make only owned directories removable, and retain bounded retry
  across both rename and removal plus primary-error precedence. Begin only
  after supervised owner-writer settlement; do not claim hostile same-UID race
  resistance.
- [Browser automation adds supply-chain and disk cost] → One exact
  acceptance-only package, locked transitive closure, pre-provisioned browser,
  no install scripts, no production bytes, and explicit dependency/license
  gates.
- [Container/network cleanup fails after a test failure] → Unique names,
  process groups, bounded traps, pre/post inventories, and a residue failure
  that blocks any green verdict.
- [Full-Archive timings vary across machines] → Record a named machine profile,
  separate invariant hard bounds from profile ceilings, and make no production
  SLO/capacity claim.
- [A product defect is discovered late] → Route it to the named owning
  capability and stop. This change cannot repair or waive it.

## Migration Plan

This is a development-only additive harness, so there is no runtime migration.

1. Admit apply only after `produce-development-artifacts` and
   `close-release-readiness-identities` are archived, no sibling active change
   remains, and the main agent approves all four strict-valid artifacts.
2. Implement and test only `contracts/acceptance/**`.
3. Run focused negative tests with synthetic harness inputs.
4. Main agent audits exact paths, dependency closure, result semantics,
   protected-input seals, residue, browser evidence, and performance profile.
5. Commit only the reviewed harness source/config/schema/test files, then run
   the complete final matrix from that clean harness/control commit against
   the accepted product-candidate artifacts and caller-supplied full inactive
   Archive.
6. After the green matrix, update lifecycle records in a separate commit,
   remove all ignored run output, then sync/archive this change.

Rollback before commit deletes only uncommitted
`contracts/acceptance/**` files and the validated owned `.tmp` root. After
commit, rollback is an ordinary later revert of this isolated capability; it
does not alter product artifacts, Archive data, refs/remotes, or production
state.

## Open Questions

None that blocks apply. The concrete full inactive Archive and exact accepted
artifact roots are runtime inputs selected by the main agent after both exact
dependencies are archived; their identities are evidence in the result, not
planning-time constants.
