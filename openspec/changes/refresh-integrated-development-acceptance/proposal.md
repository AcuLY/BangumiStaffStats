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
The Harness therefore needs one narrow Linux portability correction before a
fresh run can produce acceptance evidence.

## What Changes

- Freeze final Product revision
  `34176077787b7942741ae412d3f012c732a51ee0` and require the complete
  Development workflow to succeed at that exact head before remote mutation.
- Bind one corrected descendant Harness implementation revision H2 that
  contains the existing acceptance package, this same active change, and only
  the declared acceptance-process correction; prove by complete Git
  byte-and-mode inventory that it differs from Product only in the unchanged
  exact acceptance/lifecycle path families.
- Replace Linux Harness process and owned-cwd discovery with Node built-in
  `/proc` reads shared by the runner and process-closure worker. Preserve the
  existing Darwin `ps`/`lsof` behavior, reject PID reuse by
  PID/UID/start-time/executable identity, parse NUL-delimited argv exactly, and
  fail closed on races that are not confirmed disappearance, malformed input,
  permission failure, or cwd escape.
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
| Status | Investigated: fixed-image failure classified; specification revision in progress; corrected Harness implementation/verification/commit/push/archive: no; released/deployed/activated: no. |
| Owner | Main agent owns specification, identity decisions, audit, acceptance, Git, and lifecycle. One delegated execution owner may run the closed remote command set because the remote/container detail is context-heavy and independently bounded. |
| Writable paths | Repository planning: `openspec/changes/refresh-integrated-development-acceptance/**`, followed by synchronization to `openspec/specs/contracts-development-acceptance/spec.md` and archive lifecycle. Harness implementation: only existing `contracts/acceptance/lib/runner.mjs`, `contracts/acceptance/lib/process-closure-worker.mjs`, `contracts/acceptance/test/core.test.mjs`, and `contracts/acceptance/test/supervisor.test.mjs`. The closed package inventory is unchanged. Remote only after H2 review, exact-head Product Actions, and read-only admission: one previously absent regular root `/srv/bgmss-development-acceptance-refresh-<run-id>/**`; uniquely named run-labeled networkless containers; and only the two fixed Tencent-mirror RepoDigest/config image identities if that run proves both identities absent and pulls them. |
| Read-only protected inputs | Product `34176077787b7942741ae412d3f012c732a51ee0`; oracle; every product, UI, API, statistical, non-acceptance Contracts, Operations, workflow, package-lock, and Harness implementation path outside the exact writable list; every OpenSpec outside this change and its later root-spec sync; Git history outside main-agent commits; external registries except exact image reads; and all remote state outside the admitted run root/container/image complement. On `myserver`, `/srv/bgmss/**`, `/srv/bgmss-v2/**`, `/srv/bgmss-ops-validation/**`, pre-existing containers/images/networks/volumes, Nginx/systemd/TLS/configuration, listeners, processes, and legacy data remain read-only. |
| Deletion complement | No tracked file and no pre-existing remote object. Cleanup may remove only run-created files/directories from the exact owned manifest, run-labeled containers by immutable ID, and an exact image reference only if the run pulled it, its identity still matches, and no pre-existing or foreign reference/container uses it. No Docker prune, Git clean, glob cleanup, broad recursive target, network, volume, Compose, or service deletion. |
| Mutable refs | This change, later synchronized root spec/archive, main-agent commits/push, exact run root files, run containers, and conditionally run-pulled fixed image references. No product/Harness source ref, tag, release, registry publication, production/legacy ref, route, service, volume, network, or public port is mutable. |
| Consumes | Final Product revision/tree and exact-head Development Actions; the failed Harness run and its source identity; existing acceptance package/supervisor/targeted harness; Linux `/proc` ABI and existing Darwin `ps`/`lsof` contract; corrected fixed Node 24.18.0/npm 11.16.0 and Python 3.14.6 OCI root/child/config/layer identities; Tencent VPC mirror reachability; current `myserver` Docker capability; prior non-green lifecycle semantics and explicit 56-cell unexecuted inventory. |
| Produces | Minimal H2 Linux process-inventory correction with Darwin parity; exact Product/H2 ancestry and difference proof; two immutable source identities; verified OCI acquisition graphs; Product-owned 22-test Updater evidence; Harness-owned package/supervisor/selected-targeted evidence; superseded-failure/unexecuted/cleanup/non-interference/audit evidence; one archived refresh identity consumable by Operations. |
| Dependencies | Product exact-head Development run must be green; H2 must descend Product and the failed Harness source; Product/H2 non-allowed byte-or-mode difference count must be zero; H2 code/audit must prove no Linux external-process inventory dependency and preserve Darwin behavior; read-only remote collision/protected-state preflight must pass before writes. |
| Deliverables | Strict-valid proposal/design/delta/tasks in a clean specification-revision commit before implementation; reviewed H2 implementation and focused tests in only the declared files; separate clean H2 implementation commit; canonical run input/result summaries and hashed logs kept only as bounded execution evidence; archived refresh plus synchronized root requirement; no remote or generated residue. |
| Acceptance | Pinned OpenSpec strict validation and diff hygiene; exact-head Product Actions; Git ancestry and full byte/mode inventory; Linux positive/negative process-inventory coverage without `ps`/`lsof` or another external binary and preserved Darwin behavior; fixed OCI root/child/config/layer and in-container version verification; Product `RuntimePruneTests` with actual count; Harness `verify-package`, 21/21 supervisor tests, and the frozen selected targeted set with every selected test passing; one byte-identical protected-seal program and robust same-input route parser before/after; networkless/read-only container execution; before/after legacy/container/network/volume/Nginx/route comparison; exact cleanup; zero P0/P1 review. |
| Non-goals | No product/UI/API/statistical or non-acceptance contract implementation change; no host package injection, `apt`, derived runtime image, mutable image, or acceptance failure waiver; no local product test/build/Docker; no full formal 56-cell Archive/API/browser/oracle/performance execution; no canonical formal result; no `development-accepted-operations-pending`; no Operations candidate build; no release, deployment, production activation, or SLO claim. |
| Operations deferred | Operations receipt/code rebinding, AMD64 candidate assembly, Operations Actions, `/srv/bgmss-ops-validation` runtime validation, and every release/deploy/production/host-integration action remain in the separate Operations change. |
| Stop/rollback conditions | Stop before remote writes on non-green/mismatched Product Actions, dirty or wrong revisions, ancestry/difference failure, absent tool capability, existing/symlinked root, image ownership ambiguity, protected-state inventory failure, or undeclared network/port/volume need. After an owned write, preserve the primary failure, clean only identity-matching run-owned objects, report ambiguous residue, and never touch protected state to force success. |

This change touches no other repository. Its implementation mutation is
closed to the four declared existing acceptance paths, and its only external mutation
is the explicitly bounded isolated validation above; production state remains
unchanged. Apply is blocked until proposal, specification, design, and tasks
are complete, strict-valid, and approved by the main agent.
