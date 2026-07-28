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
H3 `cd203aa777e14879a7baf1bafd01ee319af246c5` then closed the
monitor-start/no-exec-fixture defects and passed exact-head Development
Actions run `30394299808`. Fresh isolated run
`8fb2588bd5699acc97454a93` passed Product 22/22, package verification,
and offline install, but supervisor passed only 13/21. The full log's
common cause was a stable terminal PID encountered by the Linux inventory
before ownership filtering. Selected core and verify-after did not run.
The run was exactly cleaned, all 80 protected fields matched, and evidence
manifest SHA-256 is
`134705b09199e2c2b2bf7df794af1ec7133913e3e8851239bd72215b009871a0`.
It remains fail-closed / not archivable. A narrow H4 inventory correction
and an exact supervisor Actions gate are required.

H4 `930690068a02eeec3c7b140c29796aef3b4a719a` implemented that correction
and gate. Exact-head Actions run `30402531154` passed Backend, Updater,
Frontend, and package artifacts, but supervisor passed 8/21 and failed 13/21:
all 13 failures came from the same permission denial while globally reading
unrelated PID 1 `/proc/1/exe`. No remote admission or write followed. H4 is
therefore superseded fail-closed evidence. H5 is a smaller follow-up limited
to stable different-UID opaque live evidence.

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
| Status | H4 `930690068a02eeec3c7b140c29796aef3b4a719a` is implemented/pushed but Actions `30402531154` passed supervisor 8/21 and failed 13/21 on unrelated PID 1 `/proc/1/exe` `EACCES`; other Development gates were green and no remote write followed. H5 specification correction is in progress; verification/archive not started. |
| Owner | Main agent: identities, specification, audit, lifecycle, commits/push. Delegated execution owner: exact remote/container command set and evidence handoff only. |
| Writable paths | Same exact repository/lifecycle and remote run-owned paths declared by the proposal. H5 implementation is limited to existing `contracts/acceptance/lib/runner.mjs`, `contracts/acceptance/lib/process-closure-worker.mjs`, and `contracts/acceptance/test/core.test.mjs`. H4 workflow/supervisor code, the H3 start barrier, package/inventory files, product, non-acceptance Harness, and Operations remain read-only. |
| Read-only protected inputs | P, failed Harness/H2/H3/H4 sources, oracle, all implementation outside the exact H5 allowance, other OpenSpec, and all remote state outside the admitted run complement. |
| Deletion complement | No tracked or pre-existing object. Only manifest-bound run files, immutable-ID run containers, and safely proven run-pulled fixed image refs. |
| Mutable refs | This change/root-spec/archive lifecycle, main-agent commits/push, one run root, run containers, and conditionally run-pulled images. |
| Consumes | P exact-head Development result, failed H run/source, Harness acceptance package, Linux `/proc` and existing Darwin inventory behavior, fixed image digests, existing remote host/Docker and protected-state facts. |
| Produces | Final H5 ownership-aware terminal/opaque-process correction, preserved H3/H4 ordering and signaling, exact supervisor Actions gate, P/H5 ancestry/delta proof, separated P/H5 test evidence, immutable source identities, cleanup/non-interference audit, H5 implementation and archive identities. |
| Dependencies | P Actions green → superseded H2/H3/H4 evidence → H5 implementation/review/clean commit and exact-head Actions including supervisor 21/21 → P/H5 proof → remote read-only admission → isolated tests → cleanup/non-interference → zero-P0/P1 → archive. |
| Deliverables | Proposal/delta/design/tasks, closed H5 correction, clean H5 implementation commit, evidence values/digests recorded into the change, synchronized root spec, archive commit. |
| Acceptance | Proposal acceptance table plus the closed commands and invariants below. |
| Non-goals | Formal matrix or product/Operations implementation; release/deploy/activation; host toolchain installation; production readiness. |
| Operations deferred | Receipt/schema/code rebinding and every Operations candidate/host-validation step. |
| Stop/rollback conditions | Any failed identity, ownership, protected-state, command-selection, result, cleanup, or audit invariant stops; cleanup never broadens past the exact run complement. |

## Goals / Non-Goals

**Goals:**

- Make P, H5 implementation, and H5 archive distinct, ordered identities.
- Prove every non-declared P/H5 product path has identical Git mode and blob.
- Execute the corrected Product Updater tests from P, not H5.
- Replace only Linux process/owned-cwd discovery with fail-closed Node built-in
  `/proc` reads while preserving current Darwin `ps`/`lsof` behavior.
- Execute Harness package/supervisor/selected control tests from corrected H5,
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

### 1. Treat P and corrected H5 as separate immutable sources

H5 SHALL descend P, the Harness revision used by the superseded run, H2, H3
`cd203aa777e14879a7baf1bafd01ee319af246c5`, and failed H4
`930690068a02eeec3c7b140c29796aef3b4a719a`.
Before transfer, Git SHALL produce complete sorted mode/blob inventories for
P and H5 and one changed-path inventory. The allowed difference set remains
closed to:

- `contracts/acceptance/**`;
- exact `.github/workflows/ci.yml`;
- active and archived
  `complete-integrated-development-acceptance` lifecycle paths;
- `openspec/specs/contracts-development-acceptance/spec.md`;
- this active refresh change;
- the exact planning-only active
  `implement-operations-foundation-and-isolated-validation` change already
  present on the control line.

No new OpenSpec change directory is added. No `operations/**`, product, build,
non-acceptance Contracts, other workflow, package-lock authority, or other
path may differ. The H4 implementation is restricted to the exact workflow
and acceptance files declared by the proposal. Every
allowed changed path records status, mode, and blob/byte digest; non-allowed
difference count must be zero. The accumulated Harness implementation remains
restricted to the exact workflow and acceptance files declared by the
proposal; H5 narrows its new delta to `runner.mjs`,
`process-closure-worker.mjs`, and `core.test.mjs`.

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
- necessary `contracts/acceptance/lib/supervisor.mjs`;
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

H3 changed only `contracts/acceptance/lib/supervisor.mjs` and
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

H4 SHALL preserve that start/acknowledgement ordering while narrowing Linux
termination only. On Linux, the parent SHALL signal the directly spawned
worker through its trusted `ChildProcess` handle while the closure monitor
continues polling until the worker closes; afterward it SHALL clean only
freshly identity-and-argv-proven live descendants through
`terminateOwnedProcesses`. It SHALL NOT issue TERM/KILL to a negative PGID.
Darwin SHALL retain the existing process-group termination behavior.

The fixed container keeps `/tmp` mounted `noexec`. The generated fake-Docker
fixture SHALL be created in an explicitly run-owned exec-capable directory,
spawned directly without a shell/evaluation widening, and removed by the
existing exact fixture cleanup. The test SHALL prove that its no-exec
`os.tmpdir()` run root does not need to become executable and leaves no
fixture residue.

### 3b. Make Linux terminal-process evidence ownership-aware in H4

H3 exposed a pre-existing H2 inventory defect rather than a barrier
regression. `snapshotLinuxProcessInventory` attempted to read complete
`exe`/`cwd`/`cmdline` evidence for every numeric `/proc` PID and rejected any
`Z`, `X`, or `x` state before the runner or closure worker applied ownership.
One unrelated terminal PID could therefore replace an otherwise valid
supervisor result with `SUPERVISOR_PROCESS_LEDGER`.

H4 SHALL preserve the H3 supervisor barrier and separate Linux inventory into
two bounded forms:

- a complete live entry with the existing PID, real UID, kernel start time,
  executable, cwd, exact argv, parent PID, and process-group evidence; and
- a stable terminal tombstone containing PID, real UID, kernel start time,
  `comm`, terminal state, and final observed parent/process-group relation,
  without attempting unreadable `exe`, `cwd`, or `cmdline`.

For every PID, bounded `stat`/`status`/`stat` reads SHALL establish one stable
generation before classification. A live-to-terminal transition during
complete evidence acquisition SHALL be reclassified only after another
bounded stable terminal confirmation. Terminal-to-disappearance may be
omitted only through the existing double absence confirmation.
Terminal-to-live reuse, changed start time, changed UID or `comm`, an
ambiguous relation change, permission/format failure, or an unconfirmed race
fails closed.

The host inventory digest SHALL bind both complete live entries and terminal
tombstones, but unrelated tombstones SHALL not enter an owned closure or make
owned-cwd discovery fail. A tombstone is ownership-relevant when its PID was
already retained in the exact ledger, its final process group equals the
owned process group, or its final parent is an exact retained generation.
For an already retained complete entry that becomes terminal in the same
generation, the ledger keeps the prior complete identity, records terminal
completion, never signals the tombstone, and waits boundedly for it to
disappear. A first-observed terminal candidate without a complete signal
identity is retained as ambiguous owned evidence and fails closed; it is
never silently dropped and never signalled. A persistent owned tombstone or
PID-generation mismatch remains a failure.

`terminateOwnedProcesses` SHALL compare both live entries and terminal
tombstones on every fresh read. A same-generation terminal receives no signal
and completes cleanup only after confirmed disappearance; a complete live
entry still requires the existing full identity and exact argv match before
each signal. A different generation, UID, `comm`, executable, or argv
preserves the PID and fails. Darwin behavior and the H3 monitor-start barrier
remain observably unchanged.

For every retained Linux PID omitted from a full `/proc` directory listing,
cleanup SHALL perform the same two bounded `lstat` absence confirmations
before treating it as reaped. If either confirmation observes the PID, cleanup
SHALL take a targeted complete live-or-terminal snapshot and revalidate the
generation; a reuse or ambiguity fails closed. Runner finalization SHALL pass
all retained non-root ledger records through this check and MUST NOT discard a
record merely because one global inventory Map omitted it.

Linux runner and supervisor cleanup SHALL never send TERM/KILL to a negative
PGID. They may signal the exact directly spawned child through its trusted
`ChildProcess` handle while the monitor remains active, then signal only
complete live descendants after the existing fresh identity and exact argv
checks. A retained or first-observed terminal receives zero TERM/KILL attempts.
Darwin's existing process-group behavior remains unchanged.

Focused tests SHALL cover an unrelated stable zombie beside an owned live
process, live-to-terminal transition, an already observed owned terminal with
zero signal and bounded reap, a first-observed relationship-proven terminal
failure, pre-directory-listing terminal disappearance with two absence
confirmations, terminal generation/relation races, live/terminal PID reuse,
and Linux runner/supervisor cleanup with no negative-PGID TERM/KILL. The
existing H3 delayed-start, malformed-IPC, late-writer, orderly,
direct-failure, evidence, and runtime-prepare regressions remain mandatory.

Development Actions SHALL execute
`node --test contracts/acceptance/test/supervisor.test.mjs` as an explicit
gate at the exact Harness head. The final fixed-image supervisor and selected
core containers SHALL use Docker's built-in `--init` reaper while preserving
`--network none`, read-only roots, and `/tmp` no-exec. The reaper is only
environment hygiene: it cannot replace terminal ownership, generation,
zero-signal, or bounded-disappearance tests and cannot turn ambiguous owned
evidence into success.

### 3c. Admit only stable unrelated different-UID opaque live evidence in H5

The H4 Actions failure is not a waiver for unreadable process identity.
Linux must first establish a stable live PID generation through bounded
`stat` → `status` → `stat` sampling and obtain one unambiguous real UID.
Only when that UID differs from the Harness real UID may either `EACCES` or
`EPERM` while reading live-only `exe`, `cwd`, or `cmdline` evidence, or an
authoritative `Kthread: 1` status row, produce a third `opaque` entry. A
kernel-thread classification SHALL observe exactly one canonical
`Kthread: 1` row in both status samples and SHALL not read meaningless
live-only command fields. Empty cmdline or `exe`/`cwd` `ENOENT` alone is never
kernel-thread proof. H5 SHALL repeat UID, optional kernel-thread flag, and
`stat` sampling and require
unchanged PID, UID, start time, `comm`, parent PID, and process group, with
both samples nonterminal. Normal scheduling changes among nonterminal
`R`/`S`/`D`/`I` states are not identity drift. A live-to-terminal transition
and a double-confirmed disappearance
continue through the H4 tombstone/absence contracts and never become opaque.
UID failure, same-UID denial, any non-permission evidence failure, malformed
or oversized input, terminal-to-live reuse, unconfirmed disappearance or
reappearance, or relation/generation drift remains fail closed.

An opaque entry SHALL bind all stable fields, its explicit kind, and its exact
`permission-denied` or `kernel-thread` reason into the global inventory and
digest; it is neither a complete live entry nor a terminal tombstone. Every
Linux complete-live predicate and every complete
identity, complete-command, owned-cwd, and signal path SHALL explicitly
exclude `kind === "opaque"`; Linux live entries remain `kind === "live"`,
while unchanged legacy Darwin entries keep their existing schema. Unrelated
opaque evidence is excluded from owned-cwd and closure ownership. An opaque
PID already retained in the ledger, in the target process group, or parented
by an exact retained generation is ambiguous owned evidence: record/fail
closed and send zero signals. A fresh cleanup or targeted Map-miss snapshot
that observes opaque evidence for an expected PID is an identity mismatch,
never confirmed absence.

The worker SHALL receive the same validated Harness real UID through its
existing immutable inventory options so runner and worker classification are
identical. Darwin, H3 monitor-start ordering, H4 terminal behavior, H4 direct
child/descendant signaling, the workflow command, and selected top-level test
counts remain unchanged.

Focused synthetic coverage SHALL prove different-UID permission denial and a
twice-proven different-UID `Kthread: 1` can coexist as unrelated digest-bound
opaque evidence. Kernel-thread proof SHALL perform zero live-only reads;
missing/zero/drifting `Kthread`, empty cmdline, or missing exe without that
proof remains failure. Same-UID, unreadable UID, target-group, exact-parent,
retained-PID, cleanup/Map-miss, and all sampled identity/relation races fail
before signal; opaque evidence never becomes live by negation; and worker
behavior matches runner behavior. These assertions SHALL be folded into the
already selected Linux inventory/owned-cleanup top-level tests so the
selected manifest remains exactly 21.

### 4. Freeze one Product test owner and three Harness gates

P owns:

`python -m unittest -v build.test_artifact.RuntimePruneTests`

from P's `updater/` copy. The expected discovered class currently has 22 test
methods, but evidence records the actual executed count and names rather than
accepting a declaration.

Corrected H5 owns:

1. `node contracts/acceptance/bin/acceptance.mjs verify-package` before install;
2. the offline install, then
   `node --test contracts/acceptance/test/supervisor.test.mjs` with exact
   21/21 success;
3. one exact-name-pattern run against
   `contracts/acceptance/test/core.test.mjs`.

The selected core set is closed to the Backend content/lock/handshake/
materialization/check families; the Linux procfs positive and owned-cleanup
identity tests; injected Darwin parity; the three reparented-runner tests; and
the evidence/result/parent-supervisor families named in tasks. A test declared
to skip on Linux is excluded from this fixed Linux run.
TAP parsing records actual pass/fail/skip and selected names. All 21 supervisor
tests and every frozen selected core test must pass. The former
`escaped fixture process identity differs before cleanup` classification is
not an exception for H5: observing it again proves the Linux inventory
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
closed file manifest, transfers P/H5 archives, and uses uniquely named
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

- **[H5 contains planning-only lifecycle paths absent from P]** → Bind the exact
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
- **[The former Linux fixture mismatch returns]** → H5 keeps the exception
  entirely, so the former exact mismatch or any other failure blocks closure.
- **[Displayed command text differs from executed seal bytes]** → Hash the
  actual transport byte array before each SSH invocation, require the remote
  program to report the same digest/version, and reject reconstructed or
  doubly escaped source.

## Migration Plan

1. Retain P's exact-head Development Actions and all H2/H3/H4 failures as
   superseded evidence only.
2. Strict-validate and main-review this H5 OpenSpec revision before code.
3. Implement/review only the declared H5 inventory/test paths, then
   commit and push H5 and require exact-head Development Actions including
   supervisor 21/21.
4. Prove P/H5 plus failed-H/H5, H2/H5, H3/H5, and failed-H4/H5
   ancestry/differences; perform
   read-only preflight, attest the fixed mirror OCI graphs, then run the closed
   remote container gates under a new opaque run ID.
5. Pull/hash bounded evidence, clean the run complement, repeat protected
   inventories, and obtain independent zero-P0/P1 review.
6. Record exact identities/results, sync the delta, archive the change, commit,
   push, and hand P/H5/archive identities to Operations.

Failure before remote mutation changes no external state. Failure afterward
invokes only the exact identity cleanup above; it never modifies Product,
legacy, production, or host integration.

## Open Questions

None. Actual fresh run ID, H5 OIDs, test counts, source/archive digests, container
IDs, and log/TAP digests are evidence outputs and must not be guessed.
