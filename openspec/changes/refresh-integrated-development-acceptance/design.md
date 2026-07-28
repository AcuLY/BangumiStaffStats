## Context

Product P is the acceptance-free revision
`34176077787b7942741ae412d3f012c732a51ee0`. It contains the archived Updater
runtime-pruning correction and no `contracts/acceptance/**`. Harness H is a
descendant merge of P and the earlier acceptance control line. H supplies the
existing acceptance package but is not a substitute product source.

The formal acceptance runner still requires the full Darwin/ARM64 Archive,
artifact, API, browser/oracle, performance, and residue matrix. This refresh
does not have those inputs and must not synthesize its formal verdict. Its
purpose is narrower: re-prove the corrected Product's directly affected
Updater closure, re-prove the accepted Harness control surfaces, and preserve
the exact non-green lifecycle boundary needed by Operations.

The first admitted acquisition attempt
`20b2f5df80c7a941d9a6b3e9` made no test claim: three pulls stopped at the
unreachable Docker Hub registry, then exact cleanup and every protected seal
closed unchanged. Subsequent read-only investigation also proved the original
Node root `sha256:6f7b03f7d42f...6ecb20` did not exist; it was a transcribed
digest, not an immutable object. That failed attempt remains failure evidence
only. This revision corrects the root and fixes an identity-equivalent
Tencent VPC mirror transport before another admitted run.

The next admitted run `6e0140e1c4dda68bb263c1d8` acquired and verified the
fixed images and proved Product `RuntimePruneTests` 22/22. Harness supervisor
execution stopped at 17/21: each of the four failures was caused by the fixed
Node 24.18.0 bookworm-slim config image intentionally lacking `/bin/ps` and
`/usr/sbin/lsof`. The selected core set did not execute. All run-owned remote
state was boundedly cleaned. This run is superseded failure evidence only and
cannot contribute a successful Harness gate or lifecycle claim. Its bounded
evidence manifest SHA-256 is
`0e3ae22bd8165e7a164bd21f4f516bfa08988cdc8bde5f5d89c1ed49c0ec078c`;
	the run summary remains `fail-closed` / not archivable. H2
	`1e3ecf120da02d642a5d63f75a6795ba2946e11d` removed the external Linux
	inventory dependency and passed exact-head Actions, but remote run
	`9af7301665f286f015a2397f` still passed only 17/21 supervisor tests. The
	parent bypassed the existing monitor-start handshake, and the fake-Docker
	fixture assumed executable `/tmp`. Its selected set and verify-after did not
	run; exact cleanup and all 80 protected fields closed. Evidence-manifest
	SHA-256 is
	`6ccd7891d015bbbcbed868fdf4837cd81a87a7e01f71f6892356bee7025c3b54`.
	A narrow H3 implementation and fresh run are required.

The executor's initially saved 7,340-byte postflight program was later proved
to be a doubly escaped source extraction rather than the actual bytes supplied
to the earlier SSH standard input. Its mismatch and route-parser exception
therefore are not authoritative protected-state evidence and do not justify
relaxing a seal. A read-only rerun from the actual transmitted bytes proved
network, volume, normalized Nginx, listener, process, legacy-root, route,
run-root, and image seals exactly equal. Only the existing-container aggregate
differed: despite excluding State/Health, it still included the entirely
mutable Docker `NetworkSettings` object, and the preflight had retained only
an aggregate digest so the differing container could not be localized. This
revision excludes that object only, strengthens per-container diagnostics,
and leaves every other protected seal exact. Every future before/postflight
comparison must bind the actual transmitted program bytes and use the
identical byte digest. The real rerun program SHA-256 was
`22ec7fa006997a94fffa21a7344dcfc402b1a4bcff1bc06751fc0cfbda7b88c4`.

| Field | Declaration |
|---|---|
| Status | H2 Actions green and remote supervisor failure classified/cleaned; H3 handshake/no-exec-fixture design complete; H3 implementation/fresh execution/verification/archive not started. |
| Owner | Main agent: identities, specification, audit, lifecycle, commits/push. Delegated execution owner: exact remote/container command set and evidence handoff only. |
| Writable paths | Same exact repository/lifecycle and remote run-owned paths declared by the proposal. H3 implementation is limited to existing `contracts/acceptance/lib/supervisor.mjs` and `contracts/acceptance/test/supervisor.test.mjs`; the prior H2 process-inventory files remain read-only. No package-inventory, product, non-acceptance Harness, or Operations implementation write. |
| Read-only protected inputs | P, failed Harness source, oracle, all implementation outside the exact four-path allowance, other OpenSpec, and all remote state outside the admitted run complement. |
| Deletion complement | No tracked or pre-existing object. Only manifest-bound run files, immutable-ID run containers, and safely proven run-pulled fixed image refs. |
| Mutable refs | This change/root-spec/archive lifecycle, main-agent commits/push, one run root, run containers, and conditionally run-pulled images. |
| Consumes | P exact-head Development result, failed H run/source, Harness acceptance package, Linux `/proc` and existing Darwin inventory behavior, fixed image digests, existing remote host/Docker and protected-state facts. |
| Produces | Minimal H3 supervisor-start ordering and no-exec-fixture correction, P/H3 ancestry/delta proof, separated P/H3 test evidence, immutable source identities, cleanup/non-interference audit, H3 implementation and archive identities. |
| Dependencies | P Actions green → superseded H2 evidence → H3 implementation/review/clean commit and exact-head Actions → P/H3 proof → remote read-only admission → isolated tests → cleanup/non-interference → zero-P0/P1 → archive. |
| Deliverables | Proposal/delta/design/tasks, exact two-file H3 change, clean H3 implementation commit, evidence values/digests recorded into the change, synchronized root spec, archive commit. |
| Acceptance | Proposal acceptance table plus the closed commands and invariants below. |
| Non-goals | Formal matrix or product/Operations implementation; release/deploy/activation; host toolchain installation; production readiness. |
| Operations deferred | Receipt/schema/code rebinding and every Operations candidate/host-validation step. |
| Stop/rollback conditions | Any failed identity, ownership, protected-state, command-selection, result, cleanup, or audit invariant stops; cleanup never broadens past the exact run complement. |

## Goals / Non-Goals

**Goals:**

- Make P, H3 implementation, and H3 archive distinct, ordered identities.
- Prove every non-declared P/H3 product path has identical Git mode and blob.
- Execute the corrected Product Updater tests from P, not H3.
- Replace only Linux process/owned-cwd discovery with fail-closed Node built-in
  `/proc` reads while preserving current Darwin `ps`/`lsof` behavior.
- Execute Harness package/supervisor/selected control tests from corrected H3,
  not P or the failed Harness source.
- Leave `myserver`, both worktrees, and all protected resources unchanged.

**Non-Goals:**

- No full formal result, browser/oracle screenshot, Archive/API run, benchmark,
  or production claim.
- No local product test/build/Docker.
- No tool installation on `myserver`; Node and Python execute in containers.
- No host `ps`/`lsof` injection, `apt`, derived runtime image, mutable image,
  fallback process identity, or accepted test exception.
- No Compose, network, volume, published port, service reload, or product
  deployment.

## Decisions

### 1. Treat P and corrected H2 as separate immutable sources

H2 SHALL descend both P and the Harness revision used by the superseded run.
Before transfer, Git SHALL produce complete sorted mode/blob inventories for
P and H2 and one changed-path inventory. The allowed difference set remains
closed to:

- `contracts/acceptance/**`;
- active and archived
  `complete-integrated-development-acceptance` lifecycle paths;
- `openspec/specs/contracts-development-acceptance/spec.md`;
- this active refresh change;
- the exact planning-only active
  `implement-operations-foundation-and-isolated-validation` change already
  present on the control line.

No new OpenSpec change directory is added. No `operations/**`, product, build,
non-acceptance Contracts, workflow, package-lock authority, or other path may
differ. The H2 implementation is restricted to the existing
`contracts/acceptance/**` family already admitted by this closure. Every
allowed changed path records status, mode, and blob/byte digest; non-allowed
difference count must be zero.

Each revision is transferred as its own Git archive. The controller records
commit/tree, archive SHA-256/size/mode, and a complete extracted
path/mode/content SHA-256 inventory. A single relabelled source archive was
rejected because it would erase evidence ownership.

### 2. Use exact fixed container toolchains

Node gates use:

`mirror.ccs.tencentyun.com/library/node@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d`

whose unique linux/amd64 child is
`sha256:d45d78e7929b46875bbd4e29bea672d5bc48186c6c3588306521c815e78352d6`
and config/image ID is
`sha256:2f35c3d18013b7d65e31c40f0602e4c0a65a18efc65c16e2b98497f13f4da921`;
gates assert Node 24.18.0/npm 11.16.0. Python gates use:

`mirror.ccs.tencentyun.com/library/python@sha256:86f975aca15cf04a40b399eebede9aea7c82eae084d1f1a0a6ef6bcaae871a30`,

whose unique linux/amd64 child is
`sha256:f70215e5dbe2a47dee6d23f9c6d358bf3c148f59cce2fd165b61118e9d80f2bb`
and config/image ID is
`sha256:c42d4d39d945cdfc11f65c2bdbcbc174b9d01563225ca182aff28c25248378c4`.

The registry name is transport, not image authority. Before pull, the run
fetches raw OCI index, unique linux/amd64 child, config, and layer descriptors
from the two exact mirror RepoDigests; it locally recomputes every digest,
requires every descriptor size and layer availability, and records the graph.
The run neither resolves a tag nor changes daemon/mirror/proxy configuration.
After pull, `RepoDigests`, immutable config ID, OS/architecture, config
diff-IDs, and the recorded graph must agree. Version checks and every later
container use the immutable config image ID. The fixed Node config's absence
of `/bin/ps` and `/usr/sbin/lsof` is a supported slim-image property, not
authority to install a host package, run `apt`, inject a binary, derive a
replacement image, or change the immutable runtime identity.

Actual gates run with `--network none`, a read-only container root, `/tmp`
tmpfs, no host toolchain, no port, no Docker network, and only writable
run-owned source/cache mounts. A separate run-owned npm-cache preparation may
use the network before evidence begins; it is recorded as a prerequisite, not
as acceptance evidence. The actual Harness install is:

`npm ci --ignore-scripts --omit=optional --offline --no-audit --no-fund`.

Unsupported image digest/platform/version or an unsealed cache fails before
tests. Read-only preflight records the engine platform and whether each fixed
RepoDigest and config image ID already exist. When both identities are absent,
the exact mirror RepoDigest pull is the run's first bounded image mutation;
the pulled graph, OS, architecture, and runtime versions are verified before
cache preparation or any gate. A missing/ambiguous descriptor, digest/size
mismatch, Docker Hub fallback, pre-existing config ownership, failed pull, or
identity check stops and invokes only the declared owned-image cleanup.

### 3. Make Linux process attribution self-contained and fail closed

Only these Harness paths may change:

- `contracts/acceptance/lib/runner.mjs`;
- `contracts/acceptance/lib/process-closure-worker.mjs`;
- necessary `contracts/acceptance/test/core.test.mjs`;
- necessary `contracts/acceptance/test/supervisor.test.mjs`.

The closed package file inventory remains unchanged. `runner.mjs` SHALL export
the pure platform inventory and complete-command helpers;
`process-closure-worker.mjs` SHALL statically import those helpers. This does
not form a static cycle because `runner.mjs` only constructs the worker URL
inside `createProcessClosureMonitor`; importing either module MUST perform no
top-level process spawn, process signal, filesystem write, worker creation, or
inventory read. `core.test.mjs` SHALL reuse the exported complete-command
helper rather than retain an independent platform parser.

The runner and worker SHALL thereby share one process-inventory contract. On
Linux it uses only Node built-ins to enumerate numeric `/proc/<pid>` entries
and read `stat`, `status`, `exe`, `cwd`, and raw `cmdline`; it MUST NOT spawn
or probe `ps`, `lsof`, a shell, or any other external inventory binary. On
Darwin it retains the existing absolute `/bin/ps` and `/usr/sbin/lsof`
commands, parsing, and safety behavior. Windows remains explicitly
unsupported.

For each Linux PID, one bounded snapshot reads and validates:

- PID, parent PID, process-group ID, and start-time field from `/proc/<pid>/stat`;
- one unambiguous real UID from `/proc/<pid>/status`;
- absolute executable and cwd link targets from `/proc/<pid>/exe` and
  `/proc/<pid>/cwd`;
- a bounded raw `/proc/<pid>/cmdline`, parsed as NUL-delimited bytes into an
  exact argv array without whitespace joining, empty-middle-field removal, or
  text-shell interpretation.

The `stat` parser SHALL recognize the PID and complete parenthesized `comm`
field before indexing Linux fields 4 (parent PID), 5 (process group), and 22
(start time); it MUST NOT whitespace-split the whole row because `comm` may
contain spaces or closing parentheses. Numeric fields must be canonical,
positive where required, and within JavaScript safe-integer bounds.

The snapshot reads `stat` before and after the other fields. Its immutable
identity tuple is PID + UID + kernel start time + executable link target. A
changed tuple, a PID that disappears and reappears, an invalid relationship,
an unbounded/malformed field, unexpected empty argv, a relative or malformed
link, `EACCES`/`EPERM`, or any other permission/format ambiguity fails closed.
`ENOENT`/`ESRCH` during enumeration is treated as a normal exit only after a
bounded confirmation proves that exact PID entry remains absent; otherwise
the snapshot rejects the race. It never silently converts a partial row into
an absent process.

Closure ancestry, new-host-process detection, owned-cwd before/after
difference, escaped-fixture command matching, and pre-signal cleanup
revalidation all use the same identity tuple. Cwd ownership is accepted only
when the read-link target equals the canonical run root or is contained below
it by path-segment comparison; lexical-prefix matches, deleted/relative
targets, symlink escape, and changed identity are rejected. Before every
identity-addressed signal from escaped/closure cleanup, a fresh snapshot must
match both immutable identity and the exact argv required by that owned
process. PID reuse or any mismatch MUST preserve the process and fail rather
than signal it.

Focused tests SHALL prove positive operation when `/bin/ps` and
`/usr/sbin/lsof` are absent, worker/runner semantic parity, confirmed
disappearance handling, exact NUL argv parsing, cwd containment, and cleanup
of an exact owned identity. Negative tests SHALL prove malformed/truncated
`stat`, ambiguous/missing UID, malformed/oversized cmdline, permission
failure, unreadable/escaped cwd or executable, PID reuse, and unexpected
external-inventory execution all fail closed without signaling a foreign
process. Darwin tests and/or platform-injected coverage SHALL prove the
existing `ps`/`lsof` command and observable behavior remain unchanged.

### 3a. Close the H3 supervisor start barrier and no-exec fixture

H2 exposed an ordering bug outside the shared `/proc` parser. The parent
created the closure monitor, forked the supervised worker, and sent a raw
`start` message without awaiting the existing
`startProcessClosureMonitor()` acknowledgement. The worker could therefore
send its first checkpoint while the monitor was still taking its first Linux
inventory; the parent could acknowledge that checkpoint before the ledger had
retained the worker. A detached late writer could lose its parent relation, or
an orderly worker could exit, before the parent had a usable closure.

H3 changes only `contracts/acceptance/lib/supervisor.mjs` and
`contracts/acceptance/test/supervisor.test.mjs`. The supervisor SHALL await the
shared monitor-start handshake after fork and before it can acknowledge the
first checkpoint or accept terminal/result IPC. A worker checkpoint arriving
during that wait remains queued and unacknowledged, so the worker remains live
and attributable. Startup timeout/failure remains bounded by the suite/startup
deadline, accepts no worker result, and terminates only the identity-proven
worker closure. The existing late-descendant, orderly-success, and
direct-failure-primary tests are mandatory regressions; an explicit delayed
start/early checkpoint case SHALL prove ordering without a sleep-only race
assertion.

The fixed container keeps `/tmp` mounted `noexec`. The generated fake-Docker
fixture SHALL be created in an explicitly run-owned exec-capable directory,
spawned directly without a shell/evaluation widening, and removed by the
existing exact fixture cleanup. The test SHALL prove that its no-exec
`os.tmpdir()` run root does not need to become executable and leaves no
fixture residue.

### 4. Freeze one Product test owner and three Harness gates

P owns:

`python -m unittest -v build.test_artifact.RuntimePruneTests`

from P's `updater/` copy. The expected discovered class currently has 22 test
methods, but evidence records the actual executed count and names rather than
accepting a declaration.

Corrected H3 owns:

1. `node contracts/acceptance/bin/acceptance.mjs verify-package` before install;
2. the offline install, then
   `node --test contracts/acceptance/test/supervisor.test.mjs` with exact
   21/21 success;
3. one exact-name-pattern run against
   `contracts/acceptance/test/core.test.mjs`.

The selected core set is closed to the Backend content/lock/handshake/
materialization/check/query-measurement families; the three reparented-runner
tests; and the evidence/result/parent-supervisor families named in tasks.
TAP parsing records actual pass/fail/skip and selected names. All 21 supervisor
tests and every frozen selected core test must pass. The former
`escaped fixture process identity differs before cleanup` classification is
not an exception for H3: observing it again proves the Linux inventory
correction did not close and fails the run. Any failure, missing selected
name, widened pattern, or count drift fails.

Afterward the run removes only generated `node_modules`/`.tmp` from the
run-owned H copy and `updater/build/.tmp` plus Python cache residue from the
run-owned P copy, then repeats `verify-package` and both source inventories.

### 5. Use one absent remote root and no runtime topology

The main agent selects one opaque run ID and exact root:

`/srv/bgmss-development-acceptance-refresh-<run-id>`.

Read-only preflight requires it absent and non-symlinked, captures the fixed
images' pre-existence, and seals protected state: `/srv/bgmss` lstat,
realpath, filesystem identity, complete path-bound lstat
metadata inventory digest, and type/count/logical-size distribution. Regular
file contents are deliberately not opened or hashed, and secret/live-data
path names are not emitted. When and only when that root is a Git worktree,
its Git identity and status digest are added. The seal also includes the
existing-container stable inspect projection, Docker network/volume
inventories, `nginx -T` digest, current listeners/process facts, and one actual
Host/SNI loopback route status/header/body digest. A non-Git published legacy
root is an explicit filesystem state, not an admission failure.

For each pre-existing container, the stable inspect record is canonical and
closed to immutable identity/configuration: container ID and name, image ID,
a redacted digest of `Config`, mounts, declared/exposed ports and host port
bindings, restart policy, and the stable host-configuration fields. The entire
`State`/`Health` and `NetworkSettings` objects are excluded because their PID,
timestamps, health counters/logs, sandbox/endpoint IDs, dynamic addresses, and
runtime counters are observations rather than immutable container
configuration. Network attachment/configuration remains independently bound by
the exact Docker-network seal. Preflight records the sorted container IDs and
one redacted canonical record digest per container as well as their aggregate;
postflight compares each record before comparing the aggregate, so a mismatch
is attributable without emitting environment values, bind-source secrets, or
other sensitive configuration. Count, ID, name, image, Config digest, mount,
declared-port/port-binding, restart-policy, or stable HostConfig drift fails.
No other protected seal is weakened.

The controller SHALL construct one exact protected-seal program as a byte
array, record its SHA-256 and size, and transmit those actual bytes for both
preflight and postflight. Reconstructed JavaScript source, shell-escaped
display text, logs, or command serialization are not substitutes for the
transport bytes. Both executions SHALL self-report the same program SHA and
version before their result can be compared. The route probe SHALL make one
Host/SNI loopback request per phase and parse that same captured response with
the same parser: status is validated as a bounded decimal HTTP status, headers
are parsed by the first colon after CRLF normalization with duplicate fields
preserved, the header-terminating blank line is handled explicitly, and body
bytes are kept separate from headers/status. Duplicate headers and values that
contain colons remain data rather than parser errors. Malformed framing,
missing status, an invalid header line, truncation, or cross-phase input
substitution fails closed with the raw bounded evidence digest rather than
throwing an unclassified parser exception or emitting a partial seal.

After admission, the run creates the root with an ownership marker and a
closed file manifest, transfers P/H2 archives, and uses uniquely named
run-labeled containers only. It creates no Compose project, Docker network,
volume, port, listener, daemon, or production path.

### 6. Make cleanup and claims exact

Cleanup stops/removes containers only by captured immutable ID and run label,
removes files individually and directories bottom-up from the closed manifest,
and conditionally removes a fixed image reference only when the run pulled it,
its identity still matches, it had no pre-existing reference, and no foreign
container uses it. Uncertain cached images may remain and are reported rather
than force-removed. Docker prune, broad recursive deletion, wildcard targets,
Git clean, Compose down, network/volume deletion, and legacy cleanup are
forbidden.

The postflight re-executes the exact same protected-seal program bytes and
repeats every protected inventory; any program digest/version difference is
itself a failed seal. It requires the run root, containers, archives, caches,
and source residue absent. The maximum lifecycle claim remains
`development-acceptance-closed-by-authorized-ci-and-remote-evidence`; all 56
formal cells remain explicitly unexecuted and no canonical result/verdict is
emitted.

## Risks / Trade-offs

- **[H2 contains planning-only lifecycle paths absent from P]** → Bind the exact
  path/mode/blob inventory; never allow a broad prefix or any implementation
  path.
- **[A selected test pattern silently widens or skips]** → Freeze exact names,
  parse TAP, and compare the observed selected-name set before interpreting
  results.
- **[Online cache preparation is mistaken for a test]** → End preparation
  before the run evidence phase; all gates remain offline/networkless.
- **[A registry name is mistaken for image authority]** → Pin the corrected
  root, child, config, and descriptor graph; recompute raw bytes and execute
  only by config image ID. Never resolve a tag or trust a mirror header alone.
- **[A remote object collides or changes concurrently]** → Stop before writes
  or preserve ambiguous residue; never compensate with broader deletion.
- **[The former Linux fixture mismatch returns]** → H2 removes the exception
  entirely, so the former exact mismatch or any other failure blocks closure.
- **[Displayed command text differs from executed seal bytes]** → Hash the
  actual transport byte array before each SSH invocation, require the remote
  program to report the same digest/version, and reject reconstructed or
  doubly escaped source.

## Migration Plan

1. Wait for exact-head P Development Actions success.
2. Strict-validate, main-review, commit, and push this OpenSpec revision by
   itself.
3. Retain H2 and runs `351a80613c7a782c1d41ba61` /
   `9af7301665f286f015a2397f` as superseded evidence only.
4. Implement/review only the two H3 supervisor/test paths, then commit and push
   H3 and require exact-head Development Actions success.
5. Prove P/H3, failed-H/H3, and H2/H3 ancestry/differences, perform read-only
   preflight, attest the fixed mirror OCI graphs, then run the closed remote
   container gates under a new opaque run ID.
6. Pull/hash bounded evidence, clean the run complement, repeat protected
   inventories, and obtain independent zero-P0/P1 review.
7. Record exact identities/results, sync the delta, archive the change, commit,
   push, and hand P/H3/archive identities to Operations.

Failure before remote mutation changes no external state. Failure afterward
invokes only the exact identity cleanup above; it never modifies Product,
legacy, production, or host integration.

## Open Questions

None. Actual fresh run ID, H3 OIDs, test counts, source/archive digests, container
IDs, and log/TAP digests are evidence outputs and must not be guessed.
