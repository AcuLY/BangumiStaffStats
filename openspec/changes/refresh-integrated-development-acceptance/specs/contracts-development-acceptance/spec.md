## Capability Boundary

| Field | Declaration |
|---|---|
| Status | H4 `930690068a02eeec3c7b140c29796aef3b4a719a` is pushed but exact-head Actions `30402531154` passed supervisor 8/21 and failed 13/21 because unrelated PID 1 denied `/proc/1/exe`; all other Development gates were green and no remote write followed. H4 is superseded; H5 specification commit `e06365f943a2c85280b9786ac4705bb7d303267b` is pushed and implementation is pending; verified/archived/released/deployed/activated: no. |
| Owner | Main-agent specification/audit/lifecycle owner and one bounded remote execution owner. |
| Writable paths | This change, later synchronized `openspec/specs/contracts-development-acceptance/spec.md`, archive lifecycle, exactly existing `contracts/acceptance/lib/runner.mjs`, `contracts/acceptance/lib/process-closure-worker.mjs`, `contracts/acceptance/test/core.test.mjs`, and the proposal-declared run-owned remote complement only. H4 workflow/supervisor behavior, the H3 start barrier, and the closed package inventory remain unchanged. |
| Read-only protected inputs | Final Product, failed Harness source, oracle, every implementation path outside the exact allowance, other OpenSpec, Git objects outside lifecycle commits, and all non-admitted remote state. |
| Deletion complement | No tracked/pre-existing object; only identity-proven run-created files/containers and conditionally run-pulled fixed image refs. |
| Mutable refs | Exact change/root-spec/archive, main-agent commits/push, one run root, run containers, and conditionally owned image refs. |
| Consumes | Product exact-head Actions, superseded fixed-image failure, Harness package, Linux `/proc` and preserved Darwin process-discovery behavior, fixed container digests, remote Docker capability, and prior non-green lifecycle semantics. |
| Produces | Final H5 ownership-aware Linux terminal/opaque correction with preserved H3/H4 behavior, exact supervisor Actions gate, ordered Product/H5/archive identities, exact difference proof, separately attributed targeted evidence, cleanup/non-interference/audit closure. |
| Dependencies | Product Actions → superseded H2/H3/H4 implementations and failed runs → reviewed H5 specification → H5 implementation/review/commit/Actions including supervisor 21/21 → identity proof → remote admission/gates → cleanup/audit → archive. |
| Deliverables | Strict-valid specification, separate focused H5 implementation/tests commit, exact evidence fields including superseded attempts, synchronized root requirement, archive identity, zero residue. |
| Acceptance | Proposal/design acceptance and every scenario below. |
| Non-goals | Formal 56-cell result, product/Operations implementation, release/deploy/production/SLO claim, local product execution. |
| Operations deferred | Receipt/code rebinding and all Operations candidate/host validation remain separate. |
| Stop/rollback conditions | Any identity, ownership, result, exception, cleanup, or protected-state mismatch fails closed without broadening mutation or claims. |

## ADDED Requirements

### Requirement: An authorized targeted refresh SHALL preserve dual source identity

An authorized non-green acceptance refresh SHALL bind one final
acceptance-free Product revision/tree, one corrected descendant Harness H5
implementation revision/tree, and one descendant archived-refresh
revision/tree as distinct identities. H5 SHALL also descend the Harness source
used by superseded run `6e0140e1c4dda68bb263c1d8` and superseded H2
`1e3ecf120da02d642a5d63f75a6795ba2946e11d`, plus H3
`cd203aa777e14879a7baf1bafd01ee319af246c5` and failed H4
`930690068a02eeec3c7b140c29796aef3b4a719a`. The complete Development
workflow SHALL succeed at the exact Product head before remote mutation. Git
ancestry and a complete sorted path/status/mode/blob-or-byte inventory SHALL
prove that Product and H5 differ only in the unchanged exact receipt-declared
acceptance and lifecycle path families plus exact `.github/workflows/ci.yml`;
the non-allowed difference count SHALL be zero. No new OpenSpec change
directory MAY widen those families.

The refresh SHALL transfer and attest separate immutable Product and H5
source archives and complete extracted inventories. Product SHALL own the
Updater `RuntimePruneTests`; H5 SHALL own package verification,
supervisor, and selected targeted acceptance-control tests. No result MAY
represent an H5 command as executed from Product or relabel one source
archive as the other.

#### Scenario: Product and Harness are compatible

- **WHEN** exact-head Product Actions are green, H5 descends Product, the failed Harness source, H2, H3, and failed H4, both source archives/inventories validate, and every changed mode/blob is in the exact declared acceptance/lifecycle set
- **THEN** Product-owned and Harness-owned targeted gates may run under their respective immutable identities

#### Scenario: Product or Harness identity is widened

- **WHEN** Actions names another head/tree, ancestry fails, one non-declared path/mode/blob differs, an archive/inventory is mixed, or Harness evidence is attributed to Product
- **THEN** the refresh SHALL stop before remote test execution and SHALL NOT authorize Operations receipt rebinding

### Requirement: Harness process attribution SHALL work without external Linux inventory binaries

On Linux, the Harness runner and process-closure worker SHALL use one shared
Node-built-in process-inventory contract over numeric `/proc/<pid>` entries.
They SHALL NOT spawn, probe, install, or inject `ps`, `lsof`, a shell, or
another external process-inventory binary. The implementation SHALL be
limited to existing `contracts/acceptance/lib/runner.mjs`,
`contracts/acceptance/lib/process-closure-worker.mjs`,
`contracts/acceptance/lib/supervisor.mjs`,
`contracts/acceptance/test/core.test.mjs`, and
`contracts/acceptance/test/supervisor.test.mjs`; no package-inventory file or
new module MAY change. `runner.mjs` SHALL export pure platform-inventory and
complete-command helpers for static import by the worker and reuse by the core
test. Importing either module SHALL spawn/signal no process, create no worker,
write no file, and take no inventory at module top level. The existing Darwin
absolute `ps`/`lsof` commands, parsing, and observable safety behavior SHALL
remain unchanged. The H3 correction itself SHALL change only
`contracts/acceptance/lib/supervisor.mjs` and
`contracts/acceptance/test/supervisor.test.mjs`. H4 SHALL preserve the H3
supervisor barrier and may change only `.github/workflows/ci.yml`,
`contracts/acceptance/lib/runner.mjs`,
`contracts/acceptance/lib/process-closure-worker.mjs`,
`contracts/acceptance/lib/supervisor.mjs`,
`contracts/acceptance/test/core.test.mjs`, and
`contracts/acceptance/test/supervisor.test.mjs`. The H4 supervisor delta SHALL
be limited to Linux termination signaling and SHALL preserve the H3
monitor-start barrier.
H5 SHALL preserve all H3/H4 workflow and supervisor behavior and may change
only `contracts/acceptance/lib/runner.mjs`,
`contracts/acceptance/lib/process-closure-worker.mjs`, and
`contracts/acceptance/test/core.test.mjs`.

Each complete live Linux entry SHALL bind PID, UID, kernel start time, and executable
read-link as the immutable process identity; parent PID and process-group ID
SHALL come from the same validated `stat` generation. The inventory SHALL
read and validate `/proc/<pid>/stat`, `/proc/<pid>/status`,
`/proc/<pid>/exe`, `/proc/<pid>/cwd`, and bounded raw
`/proc/<pid>/cmdline`. It SHALL parse argv by NUL bytes without whitespace
joining or shell interpretation, read `stat` again to reject PID reuse, and
use canonical path-segment containment for owned cwd.

The `stat` parser SHALL consume PID plus the complete parenthesized `comm`
field before indexing Linux fields 4, 5, and 22; whole-row whitespace splitting
is forbidden because `comm` may contain spaces or closing parentheses. Every
numeric field SHALL be canonical and within safe bounds.

A raced `ENOENT`/`ESRCH` MAY omit an entry only after bounded confirmation
that the exact PID remains absent. Unconfirmed PID disappearance or
reappearance, changed identity, malformed/truncated/unbounded fields, missing
or ambiguous UID, unexpected empty argv, invalid executable/cwd link, or cwd
escape SHALL fail closed except for the exact different-UID opaque cases
below. Permission failure SHALL also fail closed outside those cases. Before
signaling an owned process, the Harness
SHALL re-read and match its exact PID/UID/start-time/executable identity and
expected argv for every identity-addressed escaped/closure cleanup signal. A
mismatch SHALL preserve the process and fail.

A stable Linux `Z`, `X`, or `x` process SHALL be represented as a terminal
tombstone bound to PID, real UID, kernel start time, `comm`, state, parent PID,
and process-group ID. The Harness SHALL NOT invent or require unavailable
terminal `exe`, `cwd`, or `cmdline` fields. The inventory digest SHALL include
terminal tombstones, but a tombstone unrelated to the owned ledger, target
process group, or an exactly retained parent generation SHALL NOT make
owned-cwd or closure discovery fail.

An already retained complete owned process that becomes terminal in the same
generation SHALL remain attributed, receive no further signal, and be awaited
boundedly until confirmed absent. A first-observed terminal PID selected by
the target process group or exact retained-parent relation lacks a complete
signal identity and SHALL fail closed without signalling. A persistent owned
tombstone, terminal-to-live transition, changed start time/UID/`comm`,
ambiguous relation change, or unconfirmed disappearance SHALL fail. Every
complete live signal path SHALL retain the existing exact executable and argv
revalidation.

A live Linux PID MAY be represented as `opaque` only when bounded
`stat`/`status`/`stat` sampling first proves a stable generation and one
unambiguous real UID different from the Harness real UID, and a live-only
`exe`, `cwd`, or `cmdline` read then fails with `EACCES`/`EPERM`, or both
status samples contain exactly one canonical `Kthread: 1` row. The
kernel-thread case SHALL perform no live-only command/cwd reads; empty
cmdline, missing exe/cwd, or `ENOENT`/`ESRCH` alone SHALL NOT prove a kernel
thread. Classification SHALL repeat UID, optional kernel-thread flag, and
`stat` sampling and require unchanged PID,
UID, start time, `comm`, parent PID, and process group, with both samples
nonterminal. A normal scheduling transition among nonterminal
`R`/`S`/`D`/`I` states SHALL NOT be identity drift. The opaque entry SHALL
bind its explicit kind, exact `permission-denied` or `kernel-thread` reason,
final observed nonterminal state, and all stable fields into the inventory
and digest, but SHALL contain no invented command, cwd, or argv. A
kernel-thread flag used for classification SHALL remain exactly `1`;
missing, zero, duplicated, malformed, or drifting flags SHALL fail.

Opaque is a third entry kind and SHALL NOT satisfy Linux complete-live
predicates. Linux live entries remain `kind === "live"` and every common
identity/cwd/command/signal consumer SHALL explicitly reject opaque without
changing the legacy Darwin entry schema. An unrelated opaque entry SHALL be
excluded from owned-cwd and closure ownership. An opaque PID already retained
in the ledger, in the target process group, or below an exactly retained
parent SHALL fail closed as ambiguous owned evidence with zero signal. An
opaque entry observed while freshly revalidating an expected cleanup PID,
including after a global Map miss, SHALL be an identity mismatch and SHALL NOT
count as absence.
The opaque generation key used for before/after new-process comparison SHALL
bind kind, PID, UID, start time, `comm`, and reason, but SHALL exclude
nonterminal state, parent PID, and process group. The full inventory digest
SHALL still bind those observed fields. Normal state/relation changes across
independent snapshots SHALL therefore not invent a new generation; relation
drift within one classification sample remains failure.
Stable live-to-terminal transition and double-confirmed disappearance SHALL
continue through the existing tombstone/absence contracts and SHALL NOT
become opaque. Same-UID denial, unreadable/malformed UID, non-permission
failure, malformed or oversized evidence, terminal-to-live reuse, unconfirmed
disappearance or reappearance, or any sampled identity/relation drift SHALL fail closed
and SHALL NOT become opaque.

Every retained Linux PID omitted from a full `/proc` directory listing SHALL
still receive two bounded `lstat` absence confirmations. If either check finds
the PID, the Harness SHALL take a targeted complete live-or-terminal snapshot
and revalidate its generation; one Map miss SHALL NOT count as cleanup
success. Runner finalization SHALL pass every retained non-root ledger record
through this rule.

On Linux, runner and supervisor cleanup SHALL NOT send TERM/KILL to a negative
process-group ID. They MAY signal the exact directly spawned child through its
trusted `ChildProcess` handle while its closure monitor remains active, then
MAY signal only complete live descendants after fresh exact identity and argv
revalidation. Retained and first-observed terminal evidence SHALL receive zero
TERM/KILL attempts. Darwin process-group termination SHALL remain unchanged.

The parent supervisor SHALL start the closure monitor through the shared
`startProcessClosureMonitor` handshake and await its `started` response before
acknowledging the worker's first checkpoint or trusting terminal/result IPC.
The worker may send that checkpoint while the monitor starts, but it SHALL
remain blocked on the parent acknowledgement. Monitor-start failure or timeout
SHALL preserve the primary failure, stop only the proven worker closure, and
SHALL NOT accept worker output. This ordering SHALL retain the supervised
worker identity before an orderly exit and SHALL observe a detached descendant
while parent ancestry still exists.

#### Scenario: Fixed slim Linux image has no ps or lsof

- **WHEN** the Harness runs in the declared Node 24.18.0 bookworm-slim config image and `/bin/ps` and `/usr/sbin/lsof` are absent
- **THEN** runner, worker, owned-cwd, escaped-fixture, and cleanup process attribution SHALL operate through Node-built-in `/proc` reads without an external executable

#### Scenario: Linux process evidence is raced or ambiguous

- **WHEN** a PID is reused, one identity field changes, cwd escapes, cmdline is malformed, permission is denied outside the exact different-UID opaque case, an entry disappears without confirmed absence, or any partial row cannot be validated
- **THEN** the Harness SHALL fail before signaling that process and SHALL NOT reinterpret the ambiguity as cleanup success

#### Scenario: Unrelated terminal process exists

- **WHEN** a stable terminal PID is outside the exact owned ledger, target process group, and retained-parent closure
- **THEN** the Harness SHALL bind it into host inventory evidence without reading unavailable live-only fields and SHALL continue owned discovery

#### Scenario: Unrelated different-UID live process denies command evidence

- **WHEN** a stably sampled live PID has a real UID different from the Harness, is unrelated to the target group and retained parent chain, and one live-only command field denies access with `EACCES` or `EPERM`
- **THEN** the Harness SHALL bind a digest-visible opaque entry, omit no PID, and continue without treating it as complete live or owned-cwd evidence

#### Scenario: Unrelated different-UID kernel thread has no command evidence

- **WHEN** two stable status samples for an unrelated different-UID live PID each contain exactly one canonical `Kthread: 1` row
- **THEN** the Harness SHALL bind a kernel-thread-reason opaque entry without reading cmdline, exe, or cwd

#### Scenario: Kernel-thread inference is not authoritative

- **WHEN** `Kthread` is missing, zero, duplicated, malformed, or changes, or only empty cmdline or missing exe/cwd suggests a kernel thread
- **THEN** the Harness SHALL NOT infer a kernel thread and SHALL fail closed if complete live evidence cannot be obtained

#### Scenario: Opaque classification is unsafe

- **WHEN** UID is the Harness UID or is unreadable, the PID is retained or relationship-owned, a non-permission/malformed failure occurs, terminal evidence returns to live, disappearance/reappearance is unconfirmed, or generation/UID/relation changes
- **THEN** the Harness SHALL fail closed, preserve the PID, and send zero signals

Normal scheduling changes among nonterminal `R`/`S`/`D`/`I` samples are
allowed, while a stable live-to-terminal transition and double-confirmed
absence continue through the existing H4 contracts rather than this failure
scenario.

#### Scenario: Owned process becomes terminal

- **WHEN** an exactly retained owned live generation becomes terminal
- **THEN** the Harness SHALL retain its ownership, send no terminal signal, require bounded confirmed disappearance, and fail if it persists or its generation changes

#### Scenario: A terminal process is first observed as an owned candidate

- **WHEN** a tombstone first appears in the target process group or below an exactly retained parent but has no previously complete signal identity
- **THEN** the Harness SHALL fail closed without dropping or signalling that PID

#### Scenario: A retained terminal is absent from the directory listing

- **WHEN** one full Linux `/proc` inventory omits a retained terminal PID
- **THEN** the Harness SHALL require two bounded absence confirmations, re-read and fail on reuse if either check finds the PID, and SHALL NOT accept the single omission as cleanup success

#### Scenario: Linux cleanup stops a process closure

- **WHEN** the runner or supervisor stops a Linux child and its owned closure
- **THEN** it SHALL use the trusted child handle plus identity-proven live descendant signals, SHALL issue no negative-PGID TERM/KILL, and SHALL make zero TERM/KILL attempts against terminal evidence

#### Scenario: Darwin process inventory is used

- **WHEN** the same Harness process contract executes on Darwin
- **THEN** its existing absolute `ps`/`lsof` commands, parsing, identity checks, owned-cwd behavior, and foreign-process safety SHALL remain unchanged

### Requirement: Targeted refresh execution SHALL be fixed, isolated, and attributable

The refresh SHALL run on the explicitly approved `myserver` only below one
previously absent owned root
`/srv/bgmss-development-acceptance-refresh-<run-id>`. Actual gates SHALL use
the corrected exact Tencent-mirror RepoDigest/root, unique linux/amd64 child,
config image ID, and layer graph for Node 24.18.0/npm 11.16.0 and Python
3.14.6 declared by the change. The registry name SHALL be transport only:
raw OCI bytes, descriptor sizes, `RepoDigests`, config diff-IDs, OS/arch, and
in-container versions SHALL validate, no tag may resolve, and every gate
SHALL run by config image ID. Gates SHALL use `--network none`, read-only
container roots, `/tmp` no-exec tmpfs, no published port, no Compose project,
no Docker network or volume, and only run-owned writable mounts. Supervisor
and selected-core containers SHALL use Docker's built-in `--init` reaper; this
does not relax owned-terminal attribution or bounded disappearance. Host Node,
npm, Python, Go, or application toolchains SHALL NOT be admission gates.

Run `6e0140e1c4dda68bb263c1d8` SHALL remain superseded failure evidence:
Product `RuntimePruneTests` passed 22/22, Harness supervisor stopped at 17/21
because the fixed image lacked `/bin/ps` and `/usr/sbin/lsof`, and selected
core did not execute. Its evidence manifest SHA-256 is
`0e3ae22bd8165e7a164bd21f4f516bfa08988cdc8bde5f5d89c1ed49c0ec078c`;
its status is `fail-closed` / not archivable. No passed sub-gate from that run
MAY enter H5 accepted `testEvidence` or be represented as fresh closure.

Controller attempt `351a80613c7a782c1d41ba61` SHALL remain a
`controller-precondition-failed` superseded attempt: unsupported
`dd oflag=excl` failed before archive creation, its owner marker and nine empty
directories were exactly removed, and its protected postflight matched.
H2 run `9af7301665f286f015a2397f` SHALL remain fail-closed superseded evidence:
Product passed 22/22 and Harness package/offline-install prerequisites passed,
but supervisor passed only 17/21; selected tests and verify-after did not run.
Its evidence-manifest digest is
`6ccd7891d015bbbcbed868fdf4837cd81a87a7e01f71f6892356bee7025c3b54`.
No passed prerequisite from either attempt MAY enter H5 accepted
`testEvidence`.

H3 run `8fb2588bd5699acc97454a93` SHALL remain fail-closed superseded
evidence. Product passed 22/22 and Harness verify/offline-install passed, but
supervisor passed 13/21 and selected core plus verify-after did not run. Its
supervisor log SHA-256 is
`0870a2aa2f0ee4ca186f989a862654bd16481d161da2bf5289bbdadf177d2300`;
its evidence-manifest SHA-256 is
`134705b09199e2c2b2bf7df794af1ec7133913e3e8851239bd72215b009871a0`.
All seven containers, both run-owned images, and 5,495 run-root records were
exactly cleaned; all 80 protected stable fields matched. No passed H3
prerequisite MAY enter H5 accepted `testEvidence`.

Product SHALL execute
`python -m unittest -v build.test_artifact.RuntimePruneTests` from Product's
Updater copy and record actual names/count/TAP/log digest. Harness SHALL pass
`verify-package`, perform its exact offline no-script npm install, pass all 21
supervisor tests, and run one frozen exact-name selected core set. The selected
set and actual TAP pass/fail/skip counts SHALL be recorded. All 21 supervisor
tests and every selected core test, including
`escaped fixture fallback cleans only an exact owned process identity`, SHALL
pass. The selected manifest SHALL contain the Linux procfs positive test,
owned-cleanup PID-reuse/argv-drift test, and platform-injected Darwin parity
test; it SHALL NOT contain a test whose declaration skips on Linux. The former
`escaped fixture process identity differs before cleanup` classification is
superseded failure evidence, not an H5 exception. Every failure, missing
selected name, extra selected name, or result-parse ambiguity SHALL fail the
refresh.

Before any new remote write, exact-head Development Actions SHALL itself run
`node --test contracts/acceptance/test/supervisor.test.mjs` and record 21/21.
The Actions gate does not replace the fixed-image remote run, which repeats the
same suite and the frozen selected core set under the exact networkless,
read-only, no-exec, init-reaped container contract.

The fixed test environment SHALL keep `/tmp` as a no-exec tmpfs. A generated
fixture that must be spawned, including fake Docker, SHALL use an explicitly
run-owned, exec-capable location, SHALL be invoked without a shell or command
evaluation widening, and SHALL be removed and proven absent. A test SHALL NOT
make `/tmp` executable or weaken the container mount to accommodate a fixture.

#### Scenario: Fixed Product and Harness gates close

- **WHEN** Product Updater tests pass, Harness package and all 21 supervisor tests pass, the selected-name set is exact, and every selected core test passes
- **THEN** evidence SHALL separately record each source identity, command, actual count, TAP/log digest, runtime image identity, and the superseded failed-run classification

#### Scenario: Execution uses a broader capability

- **WHEN** a gate uses host toolchains, an injected process binary, `apt`, a derived image, network access, a mutable/unverified image, another source revision, port/network/volume/Compose state, a widened test pattern, or any exception
- **THEN** the run SHALL fail and SHALL NOT emit lifecycle closure evidence

### Requirement: Refresh cleanup SHALL prove non-interference and preserve formal omissions

Before the first write, the refresh SHALL record the absent/non-symlinked run
root and image pre-existence. For legacy `/srv/bgmss`, it SHALL record lstat,
realpath, filesystem identity, a complete path-bound lstat
metadata inventory digest, and type/count/logical-size distribution. It SHALL
NOT open or hash regular-file contents or emit secret/live-data path names.
When and only when that root is a Git worktree, it SHALL additionally record
Git identity and status digest. A non-Git published legacy root SHALL be
represented explicitly and SHALL NOT be mislabeled as Git. The preflight
SHALL also record stable existing container/network/volume inventories,
`nginx -T` digest, listener/process facts, and one actual Host/SNI loopback
route status/header/body digest.

Each pre-existing container's stable inspect projection SHALL contain its ID,
name, image ID, redacted canonical `Config` digest, mounts, declared/exposed
ports and host port bindings, restart policy, and stable HostConfig fields.
It SHALL exclude the entire `State`/`Health` and `NetworkSettings` objects;
their PID/timestamps/health records/sandbox/endpoint/dynamic-address/runtime
fields are observations, while network attachment/configuration remains
covered by the separate exact network seal. Preflight SHALL retain sorted
redacted per-container record digests plus their aggregate, and postflight
SHALL compare each record so a mismatch is localized without disclosing
configuration values. Container count/ID/name/image/config/mount/declared
port/port-binding/restart/stable-host-config drift SHALL fail. Every other
protected seal remains exact.

Preflight and postflight SHALL execute one byte-identical protected-seal
program. The controller SHALL hash and size the actual byte array supplied to
each SSH standard input, and each execution SHALL report the same program
digest/version. Reconstructed source, escaped display text, logs, or extracted
command strings SHALL NOT substitute for transmitted bytes. Each phase's route
facts SHALL come from one captured Host/SNI loopback response parsed by that
same program: status is a validated bounded decimal status, header lines split
only on their first colon after CRLF normalization with duplicate fields
preserved, and body remains a separate byte sequence. Parser ambiguity SHALL
fail closed rather than produce or compare a partial seal.

When both a fixed RepoDigest and its config image ID are absent, the exact
mirror RepoDigest pull MAY be the first bounded post-admission mutation.
Before pull, the run SHALL recompute and bind the root, unique linux/amd64
child, config, and every layer digest/size. After pull, the immutable config
ID, `RepoDigests`, diff-IDs, OS, architecture, and runtime version SHALL
validate before cache preparation or tests. A tag lookup, descriptor
ambiguity, Docker Hub fallback, pre-existing config ownership, digest/size
mismatch, registry probe, or pull failure SHALL fail closed. Cleanup SHALL
remove only
manifest-bound run files and directories bottom-up, run containers by
immutable ID/label, and a fixed image reference only when this run pulled it
and its ownership/identity remain exclusive. Broad recursive cleanup,
wildcard deletion, Docker prune, Git clean, Compose down, network/volume
removal, service change, and production or legacy mutation SHALL be forbidden.

Postflight SHALL first require its actual program digest/version to equal
preflight, then require every protected seal unchanged and all run roots,
containers, archives, caches, dependency trees, and source residue absent or
explicitly report an ambiguous cached image that was safely preserved.
Zero-P0/P1 review SHALL precede lifecycle archive.

The highest result SHALL remain
`development-acceptance-closed-by-authorized-ci-and-remote-evidence`. All 56
formal Archive/artifact/API/browser/oracle/performance/residue cells SHALL
remain explicitly unexecuted. The refresh SHALL NOT emit a canonical formal
result, synthesize `development-accepted-operations-pending`, or claim release,
deployment, activation, production readiness, or SLO completion.

#### Scenario: Cleanup and protected-state comparison close

- **WHEN** the exact same transmitted seal bytes execute before and after, run-owned cleanup succeeds, every protected before/after seal matches, no run residue remains, and the audit has zero P0/P1
- **THEN** the change MAY synchronize/archive and pass its Product, Harness implementation, and Harness archive identities to the separately reviewed Operations change

#### Scenario: Residue, drift, or a formal claim remains

- **WHEN** transmitted seal bytes differ, route parsing is partial/ambiguous, cleanup ownership is ambiguous, run residue or protected drift remains, an unexecuted cell is marked passed, a formal verdict is synthesized, or release/deployment/production readiness is inferred
- **THEN** the refresh SHALL fail closed, preserve exact evidence, and SHALL NOT unblock Operations receipt consumption
