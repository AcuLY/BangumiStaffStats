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

| Field | Declaration |
|---|---|
| Status | Design complete after main-agent review; execution/verification/archive not started. |
| Owner | Main agent: identities, specification, audit, lifecycle, commits/push. Delegated execution owner: exact remote/container command set and evidence handoff only. |
| Writable paths | Same exact repository/lifecycle and remote run-owned paths declared by the proposal. No product, Harness package, or Operations implementation write. |
| Read-only protected inputs | P, containing H, oracle, all source/Contracts/Operations implementation, other OpenSpec, and all remote state outside the admitted run complement. |
| Deletion complement | No tracked or pre-existing object. Only manifest-bound run files, immutable-ID run containers, and safely proven run-pulled fixed image refs. |
| Mutable refs | This change/root-spec/archive lifecycle, main-agent commits/push, one run root, run containers, and conditionally run-pulled images. |
| Consumes | P exact-head Development result, H acceptance package, fixed image digests, existing remote host/Docker and protected-state facts. |
| Produces | P/H ancestry/delta proof, separated P/H test evidence, immutable source identities, cleanup/non-interference audit, H implementation and archive identities. |
| Dependencies | P Actions green → H clean commit → P/H proof → remote read-only admission → isolated tests → cleanup/non-interference → zero-P0/P1 → archive. |
| Deliverables | Proposal/delta/design/tasks, clean H implementation commit, evidence values/digests recorded into the change, synchronized root spec, archive commit. |
| Acceptance | Proposal acceptance table plus the closed commands and invariants below. |
| Non-goals | Formal matrix or product/Operations implementation; release/deploy/activation; host toolchain installation; production readiness. |
| Operations deferred | Receipt/schema/code rebinding and every Operations candidate/host-validation step. |
| Stop/rollback conditions | Any failed identity, ownership, protected-state, command-selection, result, cleanup, or audit invariant stops; cleanup never broadens past the exact run complement. |

## Goals / Non-Goals

**Goals:**

- Make P, H implementation, and H archive distinct, ordered identities.
- Prove every non-declared P/H product path has identical Git mode and blob.
- Execute the corrected Product Updater tests from P, not H.
- Execute Harness package/supervisor/selected control tests from H, not P.
- Leave `myserver`, both worktrees, and all protected resources unchanged.

**Non-Goals:**

- No full formal result, browser/oracle screenshot, Archive/API run, benchmark,
  or production claim.
- No local product test/build/Docker.
- No tool installation on `myserver`; Node and Python execute in containers.
- No Compose, network, volume, published port, service reload, or product
  deployment.

## Decisions

### 1. Treat P and H as separate immutable sources

H SHALL descend P. Before transfer, Git SHALL produce complete sorted
mode/blob inventories for both revisions and one changed-path inventory. The
allowed difference set is closed to:

- `contracts/acceptance/**`;
- active and archived
  `complete-integrated-development-acceptance` lifecycle paths;
- `openspec/specs/contracts-development-acceptance/spec.md`;
- this active refresh change;
- the exact planning-only active
  `implement-operations-foundation-and-isolated-validation` change already
  present on the control line.

No `operations/**`, product, build, non-acceptance Contracts, workflow,
package-lock authority, or other path may differ. Every allowed changed path
records status, mode, and blob/byte digest; non-allowed difference count must
be zero.

Each revision is transferred as its own Git archive. The controller records
commit/tree, archive SHA-256/size/mode, and a complete extracted
path/mode/content SHA-256 inventory. A single relabelled source archive was
rejected because it would erase evidence ownership.

### 2. Use exact fixed container toolchains

Node gates use:

`node@sha256:6f7b03f7d42f2d5afd5c6c51d917732a316b94908531295d9d23c4c1936ecb20`

and assert Node 24.18.0/npm 11.16.0. Python gates use:

`python:3.14.6-slim-bookworm@sha256:86f975aca15cf04a40b399eebede9aea7c82eae084d1f1a0a6ef6bcaae871a30`.

Actual gates run with `--network none`, a read-only container root, `/tmp`
tmpfs, no host toolchain, no port, no Docker network, and only writable
run-owned source/cache mounts. A separate run-owned npm-cache preparation may
use the network before evidence begins; it is recorded as a prerequisite, not
as acceptance evidence. The actual Harness install is:

`npm ci --ignore-scripts --omit=optional --offline --no-audit --no-fund`.

Unsupported image digest/platform/version or an unsealed cache fails before
tests. Read-only preflight records the engine platform and whether each fixed
reference already exists. When a fixed reference is absent, registry
reachability and image platform are not guessed from an unauthenticated
manifest probe: after main-agent admission, the exact digest pull is the
run's first bounded image mutation, and the pulled reference's immutable ID,
digest, OS, architecture, and runtime version are verified before cache
preparation or any gate. A failed pull or identity check stops and invokes
only the declared owned-image cleanup.

### 3. Freeze one Product test owner and three Harness gates

P owns:

`python -m unittest -v build.test_artifact.RuntimePruneTests`

from P's `updater/` copy. The expected discovered class currently has 22 test
methods, but evidence records the actual executed count and names rather than
accepting a declaration.

H owns:

1. `node contracts/acceptance/bin/acceptance.mjs verify-package` before install;
2. the offline install, then
   `node --test contracts/acceptance/test/supervisor.test.mjs` with exact
   21/21 success;
3. one exact-name-pattern run against
   `contracts/acceptance/test/core.test.mjs`.

The selected core set is closed to the Backend content/lock/handshake/
materialization/check/query-measurement families; the three reparented-runner
tests; and the evidence/result/parent-supervisor families named in tasks.
TAP parsing records actual pass/fail/skip and selected names. The only
permitted nonzero is exact test
`escaped fixture fallback cleans only an exact owned process identity` with
exact message
`escaped fixture process identity differs before cleanup`; it is a Darwin text
fixture mismatch on Linux and waives no production behavior. Any other
failure, missing selected name, widened pattern, or count drift fails.

Afterward the run removes only generated `node_modules`/`.tmp` from the
run-owned H copy and `updater/build/.tmp` plus Python cache residue from the
run-owned P copy, then repeats `verify-package` and both source inventories.

### 4. Use one absent remote root and no runtime topology

The main agent selects one opaque run ID and exact root:

`/srv/bgmss-development-acceptance-refresh-<run-id>`.

Read-only preflight requires it absent and non-symlinked, captures the fixed
images' pre-existence, and seals protected state: `/srv/bgmss` lstat,
realpath, filesystem identity, complete path-bound lstat
metadata inventory digest, and type/count/logical-size distribution. Regular
file contents are deliberately not opened or hashed, and secret/live-data
path names are not emitted. When and only when that root is a Git worktree,
its Git identity and status digest are added. The seal also includes the
legacy container stable inspect projection, Docker network/volume inventories,
`nginx -T` digest, current listeners/process facts, and one actual Host/SNI
loopback route status/header/body digest. A non-Git published legacy root is
an explicit filesystem state, not an admission failure.

After admission, the run creates the root with an ownership marker and a
closed file manifest, transfers P/H archives, and uses uniquely named
run-labeled containers only. It creates no Compose project, Docker network,
volume, port, listener, daemon, or production path.

### 5. Make cleanup and claims exact

Cleanup stops/removes containers only by captured immutable ID and run label,
removes files individually and directories bottom-up from the closed manifest,
and conditionally removes a fixed image reference only when the run pulled it,
its identity still matches, it had no pre-existing reference, and no foreign
container uses it. Uncertain cached images may remain and are reported rather
than force-removed. Docker prune, broad recursive deletion, wildcard targets,
Git clean, Compose down, network/volume deletion, and legacy cleanup are
forbidden.

The postflight repeats every protected inventory and requires the run root,
containers, archives, caches, and source residue absent. The maximum lifecycle
claim remains
`development-acceptance-closed-by-authorized-ci-and-remote-evidence`; all 56
formal cells remain explicitly unexecuted and no canonical result/verdict is
emitted.

## Risks / Trade-offs

- **[H contains planning-only lifecycle paths absent from P]** → Bind the exact
  path/mode/blob inventory; never allow a broad prefix or any implementation
  path.
- **[A selected test pattern silently widens or skips]** → Freeze exact names,
  parse TAP, and compare the observed selected-name set before interpreting
  results.
- **[Online cache preparation is mistaken for a test]** → End preparation
  before the run evidence phase; all gates remain offline/networkless.
- **[A remote object collides or changes concurrently]** → Stop before writes
  or preserve ambiguous residue; never compensate with broader deletion.
- **[A Linux fixture exception grows]** → Match one exact name and error only;
  any second failure blocks closure.

## Migration Plan

1. Wait for exact-head P Development Actions success.
2. Commit strict-valid refresh artifacts; that commit/tree is H implementation.
3. Prove ancestry/differences, perform read-only preflight, then run the closed
   remote container gates.
4. Pull/hash bounded evidence, clean the run complement, repeat protected
   inventories, and obtain independent zero-P0/P1 review.
5. Record exact identities/results, sync the delta, archive the change, commit,
   push, and hand P/H/archive identities to Operations.

Failure before remote mutation changes no external state. Failure afterward
invokes only the exact identity cleanup above; it never modifies Product,
legacy, production, or host integration.

## Open Questions

None. Actual run ID, H OIDs, test counts, source/archive digests, container
IDs, and log/TAP digests are evidence outputs and must not be guessed.
