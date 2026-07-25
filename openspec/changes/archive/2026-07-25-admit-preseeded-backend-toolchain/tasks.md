| Boundary | Declaration |
|---|---|
| Status | Proposed; apply blocked until strict-valid main-agent approval. |
| Owner | One Backend apply subagent; main agent owns spec/lifecycle/acceptance. |
| Writable paths | `backend/scripts/check.sh`, new `backend/scripts/check-toolchain-mode.sh`, new `backend/scripts/check-toolchain-mode-test.sh`, the acceptance-mode `GOTOOLCHAIN` branch only in seven wire-generator scripts, and this file's markers. |
| Read-only protected inputs | Every other tracked path; paused `contracts/acceptance/**`; all frozen/external evidence. |
| Deletion complement | No tracked deletion; exact mode-specific runtime cleanup only. |
| Mutable refs | None during apply. |
| Consumes | Reviewed change artifacts, baseline script, pinned Go/module closure. |
| Produces | Script extension, executable evidence, completed markers. |
| Dependencies | Existing Bash/macOS/Go; no additions. |
| Deliverables | Accepted script diff with default/sealed/negative/failure/reseal evidence. |
| Acceptance | Commands below, strict OpenSpec, inventory/diff checks, independent zero-P0/P1 review. |
| Non-goals | Other code/docs/contracts, product behavior, artifacts in this block, external repos/state, operations. |
| Operations deferred | Release/deploy/migration/production activation/retirement. |
| Stop/rollback conditions | Stop on branch/HEAD/dirty-scope drift, unsafe path, mutation, residue, regression, or review finding; no reset/checkout/git-clean/broad deletion. |

## 1. Backend gate implementation

- [x] 1.1 Preflight `codex/formal-rewrite`, record the reviewed spec commit and
  exact HEAD, allow only the already-reviewed untracked
  `contracts/acceptance/**` handoff plus this change, prove
  `backend/scripts/check.sh` unchanged from that HEAD, and stop on any other
  dirty path or active writer.
- [x] 1.2 Add a focused shell helper and contract test; wire the exact
  set-versus-unset `BGMSS_ACCEPTANCE_GOROOT` fixed-path admission,
  cache/GOROOT/bin/file/link/executable/version/architecture/conflict checks,
  exported child binding, and mode-specific cleanup into
  `backend/scripts/check.sh`; update only the persistent inventory entries
  required by the two new scripts.
- [x] 1.3 Make only the `GOTOOLCHAIN` assignment in the seven wire-generator
  scripts select `local` when the exact acceptance variable is present and
  retain `go1.26.5+auto` otherwise; prove each still selects the exported
  admitted `GO_BOOTSTRAP`.
- [x] 1.4 Run the focused committed shell contract test, including rejection
  before product checks for set-empty, partial, relative, dot-segment, trailing,
  out-of-root, symlink-component, linked executable, wrong-version,
  caller presence of `GO_BOOTSTRAP` including set-empty, and stale writable
  directories or dangling exact-root symlinks, proving the supplied closure
  and outside sentinels remain unchanged.
- [x] 1.5 In the focused fixture, inject a post-admission command failure plus
  trappable SIGTERM and SIGINT cases; prove each original nonzero or
  signal-derived status, exact disposable-root cleanup, unchanged outside
  sentinel, and unchanged final closure seal.
- [x] 1.6 Run the ordinary full `cd backend && ./scripts/check.sh` regression
  with the pinned bootstrap and prove `.cache`/`.tmp` are absent afterward.
- [x] 1.7 Preseed a fresh complete module/toolchain closure with the exact
  cache-root `.seed-complete` witness and admitted
  Go 1.26.5 GOROOT, record its byte/inode/mode/link seal, run the full gate
  under outer network and closure-write denial, prove all child generators
  bind the exact admitted Go, and compare post-gate plus unconditional-final
  seals on success.
- [x] 1.8 Force one post-admission command failure under the same protections;
  prove the original nonzero status, exact disposable-root cleanup, unchanged
  outside sentinels, and unchanged final closure seal.
- [x] 1.9 Run the repository persistent-inventory check,
  `git diff --check -- backend/scripts
  openspec/changes/admit-preseeded-backend-toolchain`,
  `openspec validate admit-preseeded-backend-toolchain --strict`,
  `openspec validate --all --strict`, and obtain an independent safety review
  with zero open P0/P1 findings. Record investigated, implemented, verified,
  committed, pushed, released, and deployed states separately; apply leaves
  commit/push/lifecycle to the main agent.

## 2. Main-agent acceptance and lifecycle

- [x] 2.1 Audit the exact diff and all evidence, rerun proportional negative,
  ordinary, sealed-success, failure-cleanup, final-reseal, inventory,
  `git diff --check`, and strict OpenSpec gates; stop on any discrepancy.
- [x] 2.2 Commit and push the accepted prerequisite, sync its delta to the main
  capability, archive it, strict-validate the resulting repository, and select
  the new clean product candidate before integrated acceptance resumes.
