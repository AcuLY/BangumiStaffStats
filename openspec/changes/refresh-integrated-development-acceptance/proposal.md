## Why

The accepted development lifecycle predates the Updater runtime-pruning
correction, while the final acceptance-free Product revision intentionally
does not contain `contracts/acceptance/**`. Operations therefore needs a new
same-product acceptance closure that keeps Product-owned checks and
Harness-owned checks on their actual revisions instead of attributing Harness
evidence to Product.

The admitted fixed-image run `6e0140e1c4dda68bb263c1d8` then proved the
Product-owned Updater tests 22/22, but the Harness supervisor stopped at 17/21:
all four failures came from the fixed Node 24.18.0 bookworm-slim config image
not containing `/bin/ps` or `/usr/sbin/lsof`. The selected core set never ran.
That run was boundedly cleaned and remains superseded failure evidence only.
The first correction H2 then passed exact-head Actions, Product 22/22, package
verification, and offline installation, but isolated run
`9af7301665f286f015a2397f` proved four remaining Harness defects: the parent
supervisor bypassed the process-monitor start handshake, a transient
unowned-PID generation change could fail an otherwise orderly closure, and a
fake-Docker test fixture attempted to execute from the required no-exec
`/tmp`. Supervisor result was 17/21; selected tests and post-install package
verification did not run. A preceding controller attempt
`351a80613c7a782c1d41ba61` also failed before archive creation because it used
an unsupported `dd` flag. Both attempts were exactly cleaned, protected state
was unchanged, and neither is accepted evidence. H3
`cd203aa777e14879a7baf1bafd01ee319af246c5` then implemented the awaited
monitor-start barrier, passed exact-head Development Actions, and preserved
Product 22/22 plus package/offline-install success. Fresh isolated run
`8fb2588bd5699acc97454a93` nevertheless stopped at supervisor 13/21 because
the shared Linux inventory rejected an unrelated terminal `/proc` entry
before it applied process ownership. Selected core and verify-after did not
run; seven containers, both run-owned fixed images, and all 5,495 run-root
objects were exactly removed, and all 80 protected stable fields remained
equal. The Harness therefore needs one final narrow H4 process-inventory
correction and an Actions gate for the exact supervisor suite before a fresh
run can close acceptance.

H4 `930690068a02eeec3c7b140c29796aef3b4a719a` added that gate and the
terminal-process correction, but exact-head Actions run `30402531154` exposed
one further fail-closed boundary: the GitHub runner denied
`/proc/1/exe`, so one unrelated live process replaced 13 supervisor outcomes
before ownership filtering. The other Development gates were green and no
remote write followed. H4 is superseded failure evidence, not an accepted
Harness identity. One minimal H5 correction must independently prove a
different UID before classifying permission-denied
command evidence as digest-bound opaque evidence while preserving strict
failure for same-UID, relationship-owned, retained, raced, or malformed
evidence.

H5 `3091e54603b91c56cbdda7d30be7f3a08c7957a9` closed that permission
boundary, but exact-head Actions run `30406392084` exposed one narrower Linux
ABI case before ownership filtering: PID 2's canonical zero process-group
field was rejected before status or `Kthread` classification. Backend,
Updater, Frontend, and all 51 artifact tests were green; the supervisor
stopped at 8/21 with 13 instances of the same parser failure, and no remote
write followed. H5 is superseded fail-closed evidence. H6 must admit a zero
process-group observation only after the existing double-sampled,
different-UID `Kthread: 1` proof; every complete live process, terminal
tombstone, permission-denied opaque process, owned relation, and signal target
still requires a positive process group. The raw start-time tick is a stable
generation token rather than a signal target and may canonically be zero.

H6 `c59c78627253719acee3520711e42cecf063f8d5` closed that ABI case, but
exact-head Actions run `30408640851` exposed the next host boundary before any
supervised command started: PID 1252 had the Harness real UID while one
live-only `/proc` field denied access with `EACCES`/`EPERM`. Backend, Updater,
Frontend, all 51 artifact tests, and 8/21 supervisor tests were green; the
remaining 13 supervisor tests failed closed and no remote write followed. The
log does not prove what PID 1252 executes or whether it is a Harness ancestor.
H6 is therefore superseded evidence. H7 may admit this shape only when a
bounded, stable `/proc/<pid>/stat` parent-chain proof establishes that the
denied generation is a strict ancestor of the current Harness process.

## What Changes

- Freeze final Product revision
  `34176077787b7942741ae412d3f012c732a51ee0` and require the complete
  Development workflow to succeed at that exact head before remote mutation.
- Bind one final corrected descendant Harness implementation revision H7 that
  descends failed H6 `c59c78627253719acee3520711e42cecf063f8d5`, H5
  `3091e54603b91c56cbdda7d30be7f3a08c7957a9`, and failed H4
  `930690068a02eeec3c7b140c29796aef3b4a719a`,
  descends H3 `cd203aa777e14879a7baf1bafd01ee319af246c5` and the superseded H2
  implementation `1e3ecf120da02d642a5d63f75a6795ba2946e11d`,
  contains the existing acceptance package, this same active change, and only
  the declared acceptance-process correction; prove by complete Git
  byte-and-mode inventory that it differs from Product only in the unchanged
  exact acceptance/lifecycle path families.
- Complete Linux Harness process and owned-cwd discovery with Node built-in
  `/proc` reads shared by the runner and process-closure worker. Preserve the
  existing Darwin `ps`/`lsof` behavior, reject PID reuse by
  PID/UID/start-time/executable identity, parse NUL-delimited argv exactly, and
  fail closed on races that are not resolved by a bounded stable-generation
  reread, confirmed disappearance, malformed input, permission failure, or
  cwd escape. The parent supervisor must await the existing monitor-start
  handshake before acknowledging worker progress.
- Separate stable terminal `/proc` tombstones from complete live-process
  entries. Unrelated terminal entries must not poison global inventory, while
  an already observed or relationship-proven owned terminal remains bound to
  its exact generation, is never signalled through an incomplete identity,
  and fails closed when ownership or reuse is ambiguous.
- Remove Linux negative-PGID TERM/KILL from both runner and supervisor cleanup.
  Signal only the directly spawned child through its trusted `ChildProcess`
  handle while the closure monitor remains active, then signal only
  freshly identity-and-argv-proven live descendants. Keep terminal evidence
  at zero signal, require double confirmed absence even when a retained PID
  was missing from the initial `/proc` directory listing, and preserve the
  existing Darwin process-group behavior.
- Add the exact 21-test supervisor suite to Development Actions so a green
  Harness head proves this control gate before another remote write.
- Represent a stable different-UID live Linux process as a third,
  digest-bound opaque entry only when its complete command evidence is denied
  with `EACCES` or `EPERM`, or when two stable status samples explicitly prove
  the kernel's `Kthread: 1` flag. A proven kernel thread must not require
  meaningless `cmdline`/`exe`/`cwd`; empty cmdline or missing exe alone is
  never proof. Bind the opaque reason, exclude unrelated opaque entries from
  owned-cwd discovery, and fail closed with zero signal if an opaque entry is
  retained, belongs to the target process group, or has an exactly retained
  parent. Same-UID, unreadable UID, non-authoritative, malformed,
  transitioned, or raced evidence never receives this classification.
- Parse canonical zero Linux process-group and start-time values as
  provisional stat evidence. Preserve zero start time as a stable generation
  token for every entry kind. A zero process group may survive classification
  solely as an unrelated different-UID `kernel-thread` opaque entry proven by
  two canonical `Kthread: 1` status samples. Reject zero process group for
  complete live entries, terminal tombstones, permission-denied opaque
  entries, retained or relationship-owned evidence, cleanup revalidation, and
  all signal targets.
- Represent a same-UID permission-denied process as a separate
  `harness-ancestor-permission-denied` opaque reason only after a bounded,
  cycle-free, double-sampled `stat` chain proves that exact PID/start/`comm`/
  parent/process-group generation is a strict ancestor of the validated
  Harness PID. Bind the Harness anchor and chain proof into evidence; keep the
  entry unrelated, excluded from owned-cwd/closure discovery, and ineligible
  for retention, target-group/parent ownership, cleanup, or signaling. Every
  same-UID sibling, descendant, self, unproven or drifting chain remains a
  fail-closed error.
- On `myserver`, run the Product Updater pruning tests from Product and the
  package, supervisor, and selected targeted acceptance tests from Harness in
  fixed digest-addressed, networkless, read-only containers below one absent
  run-owned root.
- Acquire the corrected fixed OCI roots only through the Tencent VPC Docker
  Hub mirror already reachable from `myserver`, verify the complete
  root-to-linux/amd64-child-to-config/layer graph by digest and size, and run
  every gate by immutable config image ID rather than by tag or registry name.
- Run preflight and postflight with one byte-identical protected-seal program.
  Keep every proven-stable seal exact; for existing containers only, bind
  sorted redacted per-container identity/config/image/mount/declared-port/
  restart/HostConfig digests while treating the wholly mutable Docker
  `State`/`Health` and `NetworkSettings` objects as observations covered where
  applicable by the separate exact network seal.
- Record both immutable source archive identities/inventories, exact commands,
  selected test names and actual counts, TAP/log digests, the superseded
  failed-run classification, cleanup, protected-state comparison, and
  zero-P0/P1 audit without emitting a canonical formal result or claiming
  `development-accepted-operations-pending`.
- Synchronize and archive this refresh so Operations may rebind its
  accepted-development receipt to Product → Harness implementation → Harness
  archive.

Externally visible product behavior is `PRESERVE_ORACLE`; immutable oracle
`644b7748674e553f863d0ffd61d029f86fdc0717` and every product/UI byte are
unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `contracts-development-acceptance`: Add a dual-identity same-product
  targeted refresh path that preserves the formal matrix as explicitly
  unexecuted and attributes each check to its real Product or Harness source.

## Impact

| Field | Declaration |
|---|---|
| Status | H8 implementation `49f28990e28fb8e817a167a244861f4d7ddb71b8` (tree `9448da3d61ec1d4f434d5e93bf0c0e93669fca24`) is pushed. Exact-head Actions `30416513861` attempt 1 passed Backend, Updater, Frontend, and artifact tests 51/51; supervisor passed 20/21, with only the orderly-exit probe timing out because its permanent acknowledgement listener retained the fork IPC channel. Attempt 2 was cancelled after that deterministic test-fixture cause was established. No remote write followed. The exact one-shot listener correction, green Actions, remote evidence, and archive remain pending. |
| Owner | Main agent owns specification, identity decisions, audit, acceptance, Git, and lifecycle. One delegated execution owner may run the closed remote command set because the remote/container detail is context-heavy and independently bounded. |
| Writable paths | Repository planning: `openspec/changes/refresh-integrated-development-acceptance/**`, followed by synchronization to `openspec/specs/contracts-development-acceptance/spec.md` and archive lifecycle. H8 implementation is limited to existing `contracts/acceptance/lib/runner.mjs`, `contracts/acceptance/lib/cli.mjs`, `contracts/acceptance/test/core.test.mjs`, and the exact permanent-to-one-shot IPC probe-listener correction in `contracts/acceptance/test/supervisor.test.mjs`; worker fixture, workflow, supervisor implementation, package/inventory files, product code, and H3-H7 behavior outside the exact sealed-baseline allowance remain unchanged. Remote only after H8 review, exact-head H8 Actions, and read-only admission: one previously absent regular root `/srv/bgmss-development-acceptance-refresh-<run-id>/**`; uniquely named run-labeled networkless containers; and only the two fixed Tencent-mirror RepoDigest/config image identities if that run proves both identities absent and pulls them. |
| Read-only protected inputs | Product `34176077787b7942741ae412d3f012c732a51ee0`; failed H6 `c59c78627253719acee3520711e42cecf063f8d5`; failed H7 `71825163abae2bb399b80394459accb04b659a01`; oracle; every product, UI, API, statistical, non-acceptance Contracts, Operations, workflow, package-lock, and Harness implementation path outside the exact writable list; every OpenSpec outside this change and its later root-spec sync; Git history outside main-agent commits; external registries except exact image reads; and all remote state outside the admitted run root/container/image complement. On `myserver`, `/srv/bgmss/**`, `/srv/bgmss-v2/**`, `/srv/bgmss-ops-validation/**`, pre-existing containers/images/networks/volumes, Nginx/systemd/TLS/configuration, listeners, processes, and legacy data remain read-only. |
| Deletion complement | No tracked file and no pre-existing remote object. Cleanup may remove only run-created files/directories from the exact owned manifest, run-labeled containers by immutable ID, and an exact image reference only if the run pulled it, its identity still matches, and no pre-existing or foreign reference/container uses it. No Docker prune, Git clean, glob cleanup, broad recursive target, network, volume, Compose, or service deletion. |
| Mutable refs | This change, later synchronized root spec/archive, main-agent commits/push, exact run root files, run containers, and conditionally run-pulled fixed image references. No product/Harness source ref, tag, release, registry publication, production/legacy ref, route, service, volume, network, or public port is mutable. |
| Consumes | Final Product revision/tree and exact-head Development Actions; the failed Harness run and its source identity; existing acceptance package/supervisor/targeted harness; Linux `/proc` ABI and existing Darwin `ps`/`lsof` contract; corrected fixed Node 24.18.0/npm 11.16.0 and Python 3.14.6 OCI root/child/config/layer identities; Tencent VPC mirror reachability; current `myserver` Docker capability; prior non-green lifecycle semantics and explicit 56-cell unexecuted inventory. |
| Produces | Final H8 pre-ownership sealed-baseline correction over the H7 Linux process model, with preserved H3-H7 behavior and Darwin parity; an exact supervisor Actions gate; exact Product/H8 ancestry and difference proof; two immutable source identities; verified OCI acquisition graphs; Product-owned 22-test Updater evidence; Harness-owned package/supervisor/selected-targeted evidence; superseded-failure/unexecuted/cleanup/non-interference/audit evidence; one archived refresh identity consumable by Operations. |
| Dependencies | Product exact-head Development run remains green; H8 must descend Product, H2, H3, failed H4, failed H5, failed H6, and failed H7; Product/H8 non-allowed byte-or-mode difference count must be zero; H8 code/audit must preserve the prior model while admitting only an exact same-UID permission-denied generation sealed before the current process lifetime can create an owned child; exact-head H8 Actions including supervisor 21/21 and read-only remote collision/protected-state preflight must pass before writes. |
| Deliverables | Strict-valid proposal/design/delta/tasks before implementation; reviewed H8 implementation and focused tests in only the four declared files; separate clean H8 implementation commits; canonical run input/result summaries and hashed logs kept only as bounded execution evidence; archived refresh plus synchronized root requirement; no remote or generated residue. |
| Acceptance | Pinned OpenSpec strict validation and diff hygiene; exact-head Product Actions; Git ancestry and full byte/mode inventory; Linux positive/negative process-inventory coverage without `ps`/`lsof` or another external binary and preserved Darwin behavior; fixed OCI root/child/config/layer and in-container version verification; Product `RuntimePruneTests` with actual count; Harness `verify-package`, 21/21 supervisor tests, and the frozen selected targeted set with every selected test passing; one byte-identical protected-seal program and robust same-input route parser before/after; networkless/read-only container execution; before/after legacy/container/network/volume/Nginx/route comparison; exact cleanup; zero P0/P1 review. |
| Non-goals | No product/UI/API/statistical or non-acceptance contract implementation change; no host package injection, `apt`, derived runtime image, mutable image, or acceptance failure waiver; no local product test/build/Docker; no full formal 56-cell Archive/API/browser/oracle/performance execution; no canonical formal result; no `development-accepted-operations-pending`; no Operations candidate build; no release, deployment, production activation, or SLO claim. |
| Operations deferred | Operations receipt/code rebinding, AMD64 candidate assembly, Operations Actions, `/srv/bgmss-ops-validation` runtime validation, and every release/deploy/production/host-integration action remain in the separate Operations change. |
| Stop/rollback conditions | Stop before remote writes on non-green/mismatched Product Actions, dirty or wrong revisions, ancestry/difference failure, absent tool capability, existing/symlinked root, image ownership ambiguity, protected-state inventory failure, or undeclared network/port/volume need. After an owned write, preserve the primary failure, clean only identity-matching run-owned objects, report ambiguous residue, and never touch protected state to force success. |

This change touches no other repository. Its accumulated Harness mutation is
closed to the six H4 workflow/acceptance paths, the H5 delta is closed to
three declared inventory/test paths, H6-H7 are each closed to the same two
runner/test paths, and H8 is closed to runner/CLI/test; its only external mutation
is the explicitly bounded isolated validation above; production state remains
unchanged. Apply is blocked until proposal, specification, design, and tasks
are complete, strict-valid, and approved by the main agent.

## H8 sealed pre-ownership baseline correction

H7 Actions observed one pre-command same-UID denial for which the runner could
not prove strict ancestry. H8 does not infer what PID 1207 executes, what its
actual ancestry is, or whether it is benign. Before a production Harness
process may create any owned child, its first canonical `/proc` inventory
SHALL capture, canonicalize, and freeze every stable same-UID
permission-denied opaque generation. That per-process baseline is immutable
for the process lifetime, is identified by a canonical digest, and is passed
unchanged to every process-closure worker.

The formal CLI SHALL invoke the runner-owned seal as the first operation of
`runFormally`, before package verification, protected-input attestation,
Git helpers, runtime preparation, `spawnSync`, `spawn`, `fork`, or `Worker`.
The forked `runSupervisedWorker` Node process SHALL independently seal its
own process-lifetime baseline as its first operation; it SHALL NOT inherit,
reuse, or refresh the parent process baseline.
Standalone `runCommand`, canonical production inventory, and monitor entry
points SHALL establish the same one-time seal before their own first owned
child. Importing a module SHALL continue to take no inventory or create any
process.

After sealing, a same-UID permission-denied entry may remain environmental
only when its kind, exact reason, PID, UID, start token, and `comm` exactly
match a sealed generation. Any new generation, live-to-opaque transition,
PID reuse, baseline extension, or worker-local recapture fails before cwd or
ownership filtering. A matched entry still fails with zero signal whenever it
is retained, in the target process group, below an exact retained parent, or
targeted by cleanup, Map-miss revalidation, or a signal path. This is
pre-existence evidence only; it proves neither executable identity, ancestry,
nor benignness. A baseline member may exit without mutating the sealed
allowlist; its PID may not return as another generation. Snapshot evidence
does not claim to observe a process born and gone entirely between polls or
to prevent a command from communicating with a same-UID opaque process that
already existed before the seal.
