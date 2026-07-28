## Execution Boundary

| Field | Declaration |
|---|---|
| Status | H4 `930690068a02eeec3c7b140c29796aef3b4a719a` is implemented/pushed, but exact-head Actions `30402531154` passed supervisor 8/21 and failed 13/21 because unrelated PID 1 denied `/proc/1/exe`; every other Development gate was green and no remote write followed. H4 is superseded; H5 specification commit `e06365f943a2c85280b9786ac4705bb7d303267b` is pushed and implementation is pending. |
| Owner | Main agent owns identities, specification, admission, audit, lifecycle, and Git. One delegated execution owner may perform the closed Git-evidence and remote/container command set. |
| Writable paths | This change, its later synchronized root spec/archive, H5 changes only existing `contracts/acceptance/lib/runner.mjs`, `contracts/acceptance/lib/process-closure-worker.mjs`, and `contracts/acceptance/test/core.test.mjs`, one exact absent remote run root, uniquely labelled run containers, and only conditionally owned fixed image references. H4 workflow/supervisor behavior, the H3 start barrier, and the closed package inventory remain unchanged. |
| Read-only protected inputs | Product `34176077787b7942741ae412d3f012c732a51ee0`, failed Harness source, H2 `1e3ecf120da02d642a5d63f75a6795ba2946e11d`, H3 `cd203aa777e14879a7baf1bafd01ee319af246c5`, failed H4 `930690068a02eeec3c7b140c29796aef3b4a719a`, every implementation path outside the exact H5 allowance, oracle, other OpenSpec, Git history outside main-agent commits, `/srv/bgmss/**`, `/srv/bgmss-v2/**`, `/srv/bgmss-ops-validation/**`, legacy/production containers, networks, volumes, Nginx/systemd/TLS, listeners, processes, routes, and data. |
| Deletion complement | No tracked or pre-existing object. Cleanup is limited to exact manifest-bound run files/directories, run containers by immutable ID and label, and a fixed image reference only if this run alone pulled and still exclusively owns it. |
| Mutable refs | Lifecycle commits/push, one run root, run containers, and conditionally run-owned image references. No tag, release, product ref, deployment ref, service, route, port, network, volume, or production/legacy object. |
| Consumes | Exact-head Product and H3 Actions; failed runs `6e0140e1c4dda68bb263c1d8`, `351a80613c7a782c1d41ba61`, `9af7301665f286f015a2397f`, `8fb2588bd5699acc97454a93`, and H4 Actions `30402531154`; H2/H3/H4 failure evidence; existing monitor-start API; no-exec `/tmp`; exact Product/H5 Git inventories; fixed Node/Python OCI graphs; read-only `myserver` capability/protected-state preflight. |
| Produces | Final H5 ownership-aware terminal/opaque-process correction with preserved H3/H4 behavior, exact supervisor Actions gate, ordered Product/H5/archive identities, two source archive attestations, separately attributed targeted evidence, exact cleanup/non-interference evidence, and an archived refresh consumable by Operations. |
| Dependencies | Product Actions green → superseded H2/H3/H4 evidence → H5 spec → H5 implementation/tests/review/clean commit → exact-head H5 Actions including supervisor 21/21 → P/H5 proof → read-only remote admission → isolated gates → cleanup/postflight → zero-P0/P1 → archive. |
| Deliverables | Strict-valid H5 specification, separate focused H5 implementation/tests commit and identity, complete bounded evidence including all superseded attempts, synchronized root spec, H5 archive identity, clean/pushed branch, and zero remote residue. |
| Acceptance | Every checklist item below, with no broader command, exception, mutation, or claim. |
| Non-goals | Local product test/build/Docker; full 56-cell formal acceptance; product/Operations implementation; release, deploy, activation, production readiness, or SLO claims. |
| Operations deferred | Receipt/schema/verifier rebinding, candidate assembly, Operations Actions, and `/srv/bgmss-ops-validation` remain in the separate Operations change. |
| Stop/rollback conditions | Stop before writes on any identity, ancestry, diff, Actions, capability, ownership, or protected-state mismatch. After a run-owned write, preserve the primary failure and clean only identity-matching run objects; never broaden cleanup or modify protected state. |

## 1. Admit the Harness implementation

- [x] 1.1 Confirm the Harness branch contains merge base
  `4bbb1214d2145b89f8c7f8ce29f64d7454eb8f80`, has Product
  `34176077787b7942741ae412d3f012c732a51ee0` as an ancestor, and is dirty
  only below this active change; confirm Product has no
  `contracts/acceptance/**`.
- [x] 1.2 Require pinned OpenSpec 1.6.0 strict validation and diff hygiene,
  then obtain main-agent approval of proposal, design, delta spec, and this
  task boundary before any remote mutation.
- [x] 1.3 Stage only the four revised artifacts below this active change;
  create and push one clean specification-revision commit before delegating
  implementation. Include no implementation, generated evidence, archive,
  root-spec sync, amend, rebase, tag, or release.
- [x] 1.4 Implement the H4 correction only in `.github/workflows/ci.yml`,
  `contracts/acceptance/lib/runner.mjs`,
  `contracts/acceptance/lib/process-closure-worker.mjs`,
  `contracts/acceptance/lib/supervisor.mjs`,
  `contracts/acceptance/test/core.test.mjs`, and
  `contracts/acceptance/test/supervisor.test.mjs`. Preserve the H3
  monitor-start barrier. Export pure inventory and
  complete-command helpers from `runner.mjs`; statically import them in the
  worker and reuse the complete-command helper from the core test. Keep module
  import free of top-level process spawn/signal, worker creation, filesystem
  write, or inventory read. Use Node built-ins over `/proc`; do not add a
  module, package-inventory edit, external executable, `apt`, host dependency,
  derived image, fallback exception, or package/inventory change. Add only the
  exact supervisor command to the existing Development workflow.
- [x] 1.5 Prove by focused positive/negative coverage and read-only review:
  Linux works with `/bin/ps` and `/usr/sbin/lsof` absent; runner and worker
  share PID/UID/start-time/executable identity; exact NUL argv and canonical
  cwd containment close; unrelated terminal tombstones do not poison
  ownership; same-generation owned tombstones receive zero signal and must be
  boundedly reaped; first-observed owned tombstones and reuse fail closed;
  retained PIDs omitted before `/proc` enumeration still receive two absence
  confirmations; Linux runner/supervisor issue no negative-PGID TERM/KILL and
  signal only the trusted direct child plus freshly proven live descendants;
  parenthesized `stat` comm fields are parsed without
  whole-row whitespace splitting; confirmed `ENOENT` races omit only vanished
  PIDs; reuse, permission/format ambiguity, malformed fields, and escape fail
  before signaling; imports have no top-level mutation; Darwin `ps`/`lsof`
  behavior is unchanged.
- [x] 1.6 Stage only the changed subset of the exact six H4 files, create
  and push one clean corrected Harness implementation commit, and record its
  commit/tree as H4. Prove H4 descends Product, the failed Harness source, H2,
  H3, and the specification-revision commit. Do not amend, rebase, tag,
  release, add another OpenSpec change, or include generated evidence.

## 2. Freeze Product and Harness identities

- [ ] 2.1 Retain the successful Product workflow evidence and require the
  complete `development-artifacts` workflow, now including the exact 21-test
  supervisor command, to conclude success at exact H5 head; record workflow,
  run/job URL, commit/tree, conclusion, timestamps, supervisor 21/21, and
  immutable log/archive digests.
- [ ] 2.2 Prove `P <= H2 <= H3 <= failed-H4 <= H5` and `failed H <= H5`
  ancestry and generate complete sorted Git
  path/mode/blob inventories plus an exact changed-path
  status/old-mode/new-mode/old-blob/new-blob inventory. Reject every changed
  path outside the closed acceptance/lifecycle families and exact
  `.github/workflows/ci.yml` in the design, including any `operations/**`,
  other workflow, product, build,
  non-acceptance Contracts, or package-lock change.
- [ ] 2.3 Create separate `git archive` inputs for P and H5. Record for each
  commit/tree, archive SHA-256/size/mode, and a complete extracted
  path/mode/content-SHA-256 inventory; verify archive identity against the Git
  inventory before transfer.

## 3. Admit one isolated remote run

- [ ] 3.1 Select one opaque run ID and perform a read-only `myserver`
  preflight. Require the exact `/srv/bgmss-development-acceptance-refresh-<run-id>`
  root absent and non-symlinked; verify Docker engine/API and linux/amd64
  capability without installing host tools or changing state. Record exact
  fixed mirror RepoDigest and config-image-ID pre-existence. Fetch and
  locally hash the exact raw OCI roots, unique linux/amd64 children, configs,
  and every layer descriptor; require declared digest/size/availability
  before admission without resolving a tag or changing daemon/proxy/mirror
  configuration.
- [ ] 3.2 Seal protected preflight evidence: `/srv/bgmss` lstat, realpath,
  filesystem identity, complete path-bound lstat metadata
  inventory digest, and type/count/logical-size distribution without opening
  or hashing regular-file contents or emitting secret/live-data path names;
  add Git identity/status digest only if it is a Git worktree, otherwise
  record `non-git-published-root`. Also seal stable existing-container inspect
  projection, network/volume inventories, `nginx -T` digest,
  listeners/process facts, and an actual Host/SNI loopback route
  status/header/body digest. For each existing container, retain sorted
  redacted per-container and aggregate digests over ID/name/image,
  canonical `Config`, mounts, declared/exposed ports and host bindings, restart
  policy, and stable HostConfig. Exclude whole `State`/`Health` and
  `NetworkSettings` as observation; keep network attachment/configuration under
  the separate exact network seal and fail any stable per-container change.
  Hash and size the actual protected-seal program
  bytes sent to SSH, require the remote program to report that digest/version,
  and reserve the identical byte array for postflight; extracted/escaped
  command text is not evidence. The route parser must consume one captured
  response, validate numeric status, split normalized headers only at the
  first colon while preserving duplicates, and keep body bytes separate. Stop
  for main-agent admission on any ambiguity.
- [ ] 3.3 After admission only, create the exact run root, ownership marker,
  closed write/delete manifest, P/H5 archive copies, and uniquely labelled
  containers. If both fixed image identities were absent, make the two exact
  Tencent-mirror RepoDigest pulls the first bounded image mutations; verify
  `RepoDigests`, declared config image IDs/diff-IDs, descriptor graph,
  linux/amd64, and in-container versions, then use only config image IDs.
  Create no tag, Docker Hub fallback, Compose project, network, volume,
  published port, listener, daemon/proxy/mirror/service change, or
  production/legacy path.

## 4. Execute separately attributed container gates

- [ ] 4.1 If required, prepare a run-owned npm cache as a separately recorded
  prerequisite, then seal it. Acceptance evidence begins only after
  preparation; every actual gate uses its verified immutable config image ID,
  `--network none`, read-only container root, `/tmp` no-exec tmpfs, no
  port/network/volume/Compose state, and only declared run-owned writable
  mounts. Supervisor and selected-core gates also use Docker `--init`.
- [ ] 4.2 From the P archive, assert Python image/platform/version and execute
  exactly `python -m unittest -v build.test_artifact.RuntimePruneTests` below
  `updater/`. Record all discovered names, actual count, result, command,
  image/container identity, and complete log digest; require every test to
  pass.
- [ ] 4.3 From the H5 archive, assert Node 24.18.0 and npm 11.16.0, assert
  `/bin/ps` and `/usr/sbin/lsof` are absent, run
  `verify-package`, then exact offline install
  `npm ci --ignore-scripts --omit=optional --offline --no-audit --no-fund`,
  followed by the 21-test supervisor suite. Record exact commands, names,
  pass/fail/skip counts, TAP/log digests, and image/container identities.
- [ ] 4.4 Run one exact-name selected core set containing all and only these
  21 top-level tests, and compare the observed-name set to this frozen
  manifest before interpreting TAP:
  - `Backend Go content authority is the exact 62-record localeCompare set with four assets per record`
  - `Backend Go lock cleanup validates the complete closed set before unlink and proves absence`
  - `Backend Go lock cleanup rejects missing, extra, changed, linked, symlinked, or temporary state without broad deletion`
  - `Backend Go lock cleanup rejects an equal-attribute inode rebind at the private-staging boundary without deleting either inode`
  - `Backend owner handshake fixes seed, materialization, acceptance environment, write denial, and reseal order`
  - `Backend materialization closed plan rejects every widening before the networkless seam`
  - `Backend check closed plan rejects every broader network profile before execution`
  - `Linux process inventory uses only bounded procfs evidence and exact argv/cwd identity`
  - `owned Linux cleanup rejects PID reuse or argv drift before signaling`
  - `Darwin process inventory preserves absolute ps and lsof behavior`
  - `runner rejects and force-cleans a reparented child with empty env and escaped cwd`
  - `escaped fixture fallback cleans only an exact owned process identity`
  - `runner cleans reparented children before reporting nonzero and timeout outcomes`
  - `evidence validation opens every registered file and rejects tamper or residue`
  - `failed result evidence registration closes files written before a cell aborts`
  - `parent failure evidence budget reserves exactly two terminal descriptors`
  - `evidence recursion ignores cache authority bindings but closes explicit screenshots`
  - `canonical result output is exclusively written and verified after re-read`
  - `parent supervisor replaces a fake partial result with one canonical fail-fast result`
  - `parent failure registration uses a unique index and folds a full direct-fail evidence array`
  - `parent supervisor quarantines corrupt worker evidence and still writes one closed 56-cell failure`
- [ ] 4.5 Require every frozen selected test to pass, including
  `escaped fixture fallback cleans only an exact owned process identity`.
  Treat `escaped fixture process identity differs before cleanup`, any other
  failure, any missing/extra selected name, external process-inventory
  execution, terminal ownership/reaping ambiguity, or parse ambiguity as a
  failed H5 run with no exception.
- [ ] 4.6 Remove only generated dependency/temp/cache residue from the
  run-owned source copies, repeat `verify-package`, and repeat both complete
  extracted source inventories. Require byte/mode identity with their sealed
  pre-execution inventories.

## 5. Close cleanup, evidence, and audit

- [ ] 5.1 Pull only the bounded input/result summaries and complete
  logs/TAP/inventories to the controller; record SHA-256 and size for every
  evidence file. Do not create a canonical formal result or mark any of the
  56 Archive/artifact/API/browser/oracle/performance/residue cells executed.
- [ ] 5.2 Stop/remove run containers only by captured immutable ID and run
  label; delete manifest files individually and directories bottom-up. Remove
  a fixed mirror RepoDigest/config image only when this run pulled it, both
  identities still match the recorded graph, and no pre-existing/foreign
  reference or container uses either identity.
  Forbid recursive/glob cleanup, Docker prune, Git clean, Compose down, and
  network/volume/service/legacy/production deletion.
- [ ] 5.3 Repeat every protected preflight seal and require exact equality;
  first require the actual postflight program bytes/digest/version to equal
  preflight and the robust route parser to consume the same input structure;
  require the run root, containers, archives, caches, dependency trees, and
  source residue absent. Preserve and report any ownership-ambiguous image
  instead of force-removing it.
- [ ] 5.4 Obtain an independent read-only review of identities, attribution,
  fixed commands, result parsing, superseded-failure classification,
  no-exception H5 result, evidence digests, cleanup, and protected-state
  comparison. Resolve every P0/P1 before lifecycle closure.

## 6. Record and archive the refresh

- [ ] 6.1 Update this change with exact P/failed-H/H2/H3/failed-H4/H5 identities,
  Actions run, source
  archive/inventory/difference digests, test names/counts/results/log digests,
  all superseded controller/H2/H3/H4 failed runs (including Product 22/22, Harness supervisor
  17/21, selected-core unexecuted, fail-closed/not-archivable status, evidence
  manifest SHA-256
  `0e3ae22bd8165e7a164bd21f4f516bfa08988cdc8bde5f5d89c1ed49c0ec078c`,
  and real seal-program SHA-256
  `22ec7fa006997a94fffa21a7344dcfc402b1a4bcff1bc06751fc0cfbda7b88c4`
  for `6e0140e1c4dda68bb263c1d8`), verified
  OCI graphs, image/container identities, no-exception H5 result,
  cleanup/postflight,
  unexecuted-cell inventory, and zero-P0/P1 review. Check tasks only when
  their evidence exists.
- [ ] 6.2 Re-run pinned strict validation and diff hygiene, synchronize the
  delta to `openspec/specs/contracts-development-acceptance/spec.md`, archive
  the change, and create/push one clean H5 archive commit. Record its
  commit/tree and prove
  `P <= H2 <= H3 implementation <= failed-H4 <= H5 implementation <= H5 archive`.
- [ ] 6.3 Hand Product, H5 implementation, H5 archive, exact Actions, dual
  source, separated test, cleanup/non-interference, superseded-failure, and audit
  evidence to the Operations change. The maximum claim is
  `development-acceptance-closed-by-authorized-ci-and-remote-evidence`;
  released, deployed, activated, production-ready, SLO-complete, and
  `development-accepted-operations-pending` remain false.

## 7. Correct and verify H3 after the isolated H2 failure

- [x] 7.1 Classify controller run `351a80613c7a782c1d41ba61` as
  `controller-precondition-failed`, prove its archive was never created, remove
  only its owner marker and nine empty directories bottom-up, and require its
  byte-identical postflight to match all 80 protected stable fields.
- [x] 7.2 Classify H2 run `9af7301665f286f015a2397f` as fail-closed /
  not archivable. Record Product 22/22, Harness verify-before/offline-install
  success, supervisor 17/21 with the exact four failures, selected and
  verify-after not executed, seven-container/image/5,495-record cleanup,
  80-field protected-state equality, and evidence-manifest SHA-256
  `6ccd7891d015bbbcbed868fdf4837cd81a87a7e01f71f6892356bee7025c3b54`.
  Do not reuse either run ID or combine a passed prerequisite with future
  accepted evidence.
- [x] 7.3 In existing `contracts/acceptance/lib/supervisor.mjs`, replace the
  raw monitor-start message with an awaited
  `startProcessClosureMonitor()` barrier before first-checkpoint
  acknowledgement or terminal/result trust. Bound startup failure, accept no
  worker result on failure, and terminate only the identity-proven closure.
  Change no other implementation file.
- [x] 7.4 In existing `contracts/acceptance/test/supervisor.test.mjs`, retain
  the late-writer, orderly-pass, and direct-failure-primary regressions; add a
  deterministic delayed-start/early-checkpoint ordering regression; and move
  the generated fake-Docker executable to an explicitly run-owned
  exec-capable fixture directory with exact cleanup. Keep `/tmp` no-exec and
  change no other test/package file.
- [x] 7.5 Obtain independent review with zero P0/P1, run only allowed static
  checks locally, create one clean H3 implementation commit containing exactly
  those two files, push it, and require the complete Development Actions to
  succeed at that exact H3 revision before any new remote write.
- [x] 7.6 Under a new opaque run ID, attempt the complete dual-source,
  fixed-image sequence once with no retry, exception, or production mutation;
  fail closed before selected/verify-after when supervisor is not 21/21, then
  complete exact cleanup and byte-identical postflight.
- [x] 7.7 Supersede the prospective H3 archive path after the fresh H3
  failure. Do not synchronize, archive, or hand H3 to Operations; retain H2,
  H3, and controller attempts under `supersededAttempts` and carry the final
  lifecycle work into section 8.
- [x] 7.8 Classify fresh H3 run `8fb2588bd5699acc97454a93` as fail-closed /
  not archivable. Record Product 22/22, Harness verify/offline-install success,
  supervisor 13/21 with eight failures sharing terminal-process inventory
  precedence, selected/verify-after unexecuted, seven-container/two-image/
  5,495-record exact cleanup, 80-field equality, supervisor log SHA-256
  `0870a2aa2f0ee4ca186f989a862654bd16481d161da2bf5289bbdadf177d2300`,
  and evidence-manifest SHA-256
  `134705b09199e2c2b2bf7df794af1ec7133913e3e8851239bd72215b009871a0`.

## 8. Correct and verify H4 after the isolated H3 failure

- [x] 8.1 Revise and main-agent approve proposal, design, delta spec, and
  tasks before implementation. Keep the H4 code boundary to
  `.github/workflows/ci.yml`, `contracts/acceptance/lib/runner.mjs`,
  `contracts/acceptance/lib/process-closure-worker.mjs`,
  `contracts/acceptance/lib/supervisor.mjs`,
  `contracts/acceptance/test/core.test.mjs`, and
  `contracts/acceptance/test/supervisor.test.mjs`; limit the supervisor delta
  to Linux direct-child/identity-proven closure signaling and preserve the H3
  monitor-start barrier.
- [x] 8.2 Implement bounded Linux live entries plus terminal tombstones.
  Bind terminal generation through stable `stat`/UID rereads; handle
  live-to-terminal and terminal-to-disappearance explicitly; include
  tombstones in inventory digest; allow unrelated tombstones to remain
  diagnostic without poisoning owned-cwd or closure discovery.
- [x] 8.3 Make runner/worker closure and cleanup ownership-aware. Retain and
  boundedly await a same-generation owned tombstone without signalling it;
  reject a first-observed relationship-owned tombstone, a persistent owned
  tombstone, PID reuse, identity/relation ambiguity, or incomplete signal
  identity. Preserve exact live executable/argv checks before every signal,
  require two absence confirmations even for a retained PID omitted before
  `/proc` enumeration, remove Linux negative-PGID TERM/KILL from runner and
  supervisor cleanup, and preserve Darwin behavior plus the H3 start barrier.
- [x] 8.4 Add focused synthetic coverage for unrelated tombstone plus owned
  live process, live-to-terminal, zero-signal owned terminal and bounded reap,
  first-observed owned terminal failure, terminal generation/relation races,
  live/terminal PID reuse, pre-enumeration disappearance confirmation, and
  Linux runner/supervisor zero negative-PGID signaling within the frozen
  selected Linux inventory/owned-cleanup tests and existing supervisor tests
  so the selected manifest stays exactly 21.
  Retain the H3 malformed-IPC, late-writer,
  orderly, direct-failure, evidence, runtime-prepare, delayed-start, and
  no-exec regressions.
- [x] 8.5 Add the exact command
  `node --test contracts/acceptance/test/supervisor.test.mjs` to Development
  Actions. Use no new package, host process utility, test waiver, or hidden
  retry. Static checks and pinned OpenSpec validation may run locally; all
  executable product/Harness tests remain Actions or isolated-remote owned.
- [x] 8.6 Obtain independent zero-P0/P1 review, stage only the H4 allowance,
  and create/push clean H4 implementation
  `930690068a02eeec3c7b140c29796aef3b4a719a`. Its exact-head Actions did not
  reach the required supervisor result, so it remained fail closed and
  correctly blocked remote mutation.
- [x] 8.7 Do not execute an H4 remote run after the failed Actions gate.
  Supersede this identity and move the complete isolated run unchanged to H5
  task 9.7 and detailed sections 2–5.
- [x] 8.8 Record H4 and Actions `30402531154` as superseded failure evidence
  only. Move final synchronization, archive, and Operations receipt to H5
  task 9.8 and section 6.

## 9. Correct and verify H5 after exact-head H4 Actions

- [x] 9.1 Record H4 implementation
  `930690068a02eeec3c7b140c29796aef3b4a719a`, tree
  `359bf0abea2ddbfb70128a3e5259c01e5b195db4`, and Actions run
  `30402531154` as superseded fail-closed evidence: supervisor passed 8/21
  with 13 same-root-cause failures at unrelated PID 1 `/proc/1/exe` `EACCES`; Backend,
  Updater, Frontend, and package artifact gates green; no remote write.
- [x] 9.2 Revise and main-agent approve proposal, design, delta spec, and
  tasks before H5 implementation; strict-validate and commit/push this
  four-artifact revision separately. Keep the new code delta to
  `contracts/acceptance/lib/runner.mjs`,
  `contracts/acceptance/lib/process-closure-worker.mjs`, and
  `contracts/acceptance/test/core.test.mjs`; preserve H3/H4 workflow,
  supervisor, signaling, terminal, Darwin, package, and selected-count
  behavior.
- [ ] 9.3 Add one validated current-real-UID inventory input, shared unchanged
  with the closure worker. For Linux live PIDs, bind stable
  `stat`/real-UID/`stat` before classification. Only a different-UID process
  whose live-only `exe`, `cwd`, or `cmdline` read returns `EACCES`/`EPERM`
  or whose two stable status samples both contain canonical `Kthread: 1` may
  become explicit digest-bound `opaque`. A proven kernel thread performs no
  live-only reads; empty cmdline or missing exe/cwd alone proves nothing.
  Bind exact opaque reason. Same UID, UID failure, non-permission/malformed
  evidence, terminal-to-live reuse, unconfirmed disappearance/reappearance,
  and any PID/start/`comm`/parent/group/UID drift fail closed. Both samples
  must be nonterminal, but normal `R`/`S`/`D`/`I` scheduling changes are not
  identity drift. Stable live-to-terminal and double-confirmed disappearance
  continue through the H4 tombstone/absence contracts and never become opaque.
- [ ] 9.4 Make opaque a strict third kind: Linux complete-live predicates
  require `kind === "live"` and common consumers explicitly reject opaque
  while preserving the legacy Darwin schema; opaque is present in
  inventory/Map/digest but never in complete command, cwd, argv, owned-cwd, or
  signal paths. Ignore only unrelated opaque evidence. Retained PID,
  target-PGID, exact-retained-parent, cleanup revalidation, and targeted
  Map-miss opaque evidence fail closed with zero signal.
- [ ] 9.5 Fold synthetic positive/negative coverage into the existing selected
  Linux inventory/owned-cleanup top-level tests without changing the exact
  selected manifest of 21. Cover each denied live-only field, runner/worker
  parity, digest/reason binding, authoritative different-UID `Kthread: 1`
  with zero live-only reads, missing/zero/drifting Kthread, empty-cmdline or
  missing-exe non-inference, same-UID and UID failures, target group,
  retained parent/PID, cleanup/Map-miss, strict kind, sampled field races,
  terminal/disappearance transitions, non-permission/malformed input, and
  zero-signal behavior. Keep all existing H3/H4 regressions unchanged.
- [ ] 9.6 Obtain independent zero-P0/P1 review; run only local static
  `node --check`, `git diff --check`, and pinned OpenSpec strict validation;
  stage only the three H5 files and create/push one clean H5 implementation
  commit descending the H5 spec revision and failed H4.
- [ ] 9.7 Require exact-head H5 Development Actions green with supervisor
  21/21 before any remote mutation. Then prove
  `P <= H2 <= H3 <= failed-H4 <= H5`, repeat the complete isolated Product
  22/22 plus Harness package/supervisor/selected 21/21 validation under one
  new run ID, and close cleanup/protected-state/audit evidence.
- [ ] 9.8 Record exact H5/archive identities and all superseded failures, strict
  validate, synchronize, archive, commit, push, and hand only the accepted
  Product/H5/archive receipt to Operations.
