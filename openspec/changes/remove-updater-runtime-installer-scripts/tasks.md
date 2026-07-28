## Task Boundary

| Field | Declaration |
|---|---|
| Status | Planning in progress until strict validation/main-agent approval; implementation, verification, commit, push, release, and deploy not complete. |
| Owner | One delegated Updater implementation owner for groups 1–2; main agent for specification, audit, exact staging/commit/push, Actions acceptance, sync/archive, and Operations handoff. |
| Writable paths | Implementation owner: `updater/build/runtime_prune.py` and `updater/build/test_artifact.py` only. Main agent: this active change and later exact synchronization/archive paths. |
| Read-only protected inputs | Every other repository and external path, including the current unrelated `operations/release/files.mjs` and `operations/test/release/files.test.mjs` diagnostic candidate. |
| Deletion complement | No tracked deletion; generated prune behavior is limited to the admitted runtime root's exact direct real `bin/**` subtree and matching `RECORD` rows. |
| Mutable refs | None for implementation owner. Main agent may later commit/push `codex/formal-rewrite` after review. |
| Consumes | Strict-valid planning artifacts, root `updater-build-artifact`, uv target-layout evidence, and the current allowed dirty-state inventory. |
| Produces | Two-file implementation candidate, exact-head Development evidence, synchronized/archived capability, and a newly admissible product revision for Operations. |
| Dependencies | Groups 1–2 precede Development Actions; green exact-head Development precedes sync/archive; the archived correction precedes a separate same-product, dual-identity remote acceptance refresh; only that archived refresh precedes Operations receipt rebinding and candidate resumption. |
| Deliverables | Closed prune/verify implementation, focused tests, audit evidence, clean diff/residue, Actions result, and lifecycle completion. |
| Acceptance | Strict OpenSpec, allowed static syntax/diff checks, complete exact-head Development Actions, main-agent zero-P0/P1 audit, and later unchanged Operations cross-checkout comparison. |
| Non-goals | No public/product/dependency/schema/lock/Operations comparison or external-state change. |
| Operations deferred | Release, deployment, activation, host/service/public-route mutation, scheduling, cutover, and legacy retirement. |
| Stop/rollback conditions | Stop on branch/HEAD/dirty-state mismatch, protected edit need, unclosed deletion, metadata invalidity, behavior/dependency drift, or external mutation. Never use reset-hard, checkout rollback, git clean, `git add -A`, broad recursive deletion, or external writes. |

## 1. Implementation Admission

- [x] 1.1 Before any implementation write, verify branch
  `codex/formal-rewrite`, starting HEAD
  `d93d9b5d0390dd64ffbcaf48d53a7d8e68fea34e`, and an allowed dirty inventory
  containing only the active change plus the two main-agent-owned Operations
  diagnostic files; stop on any other path or staged entry.
- [x] 1.2 Verify proposal, design, delta specification, tasks, and the active
  Operations change with OpenSpec 1.6.0 strict validation; record main-agent
  approval before apply.

## 2. Updater Runtime Pruning

- [x] 2.1 In `updater/build/runtime_prune.py`, admit the direct real runtime
  `bin` subtree only when every regular file has one exact safe installed
  `RECORD` owner; bind admission to non-following descriptors and stable
  identities, atomically quarantine and completely rescan the owned tree
  before the first unlink, remove only those files/empty directories and rows,
  preserve all other bytes/rows, safely restore a complete pre-delete failure,
  and make post-prune verification reject any residual direct `bin` or
  quarantine child.
- [x] 2.2 In `updater/build/test_artifact.py`, add producer-shaped fixtures for
  `bin/jsonschema`, matching `RECORD` digest/size, two distinct absolute
  interpreter shebangs with identical pruned results, supported-launcher
  preservation, unrecorded/duplicate/missing/symlink/residual rejection, and
  deterministic late file/hard-link/intermediate-directory replacement hooks
  proving no earlier unlink, external-sentinel mutation, or quarantine
  residue.
- [x] 2.3 End the implementation group with read-only status/diff review,
  allowed static checks, `git diff --check`, and no generated residue. Do not
  run local product tests, builds, Docker, cleanup, staging, commit, or push;
  hand the unstaged two-file candidate to the main agent.

## 3. Acceptance and Lifecycle

- [ ] 3.1 Main agent audits the implementation/specification for zero P0/P1,
  confirms the earlier main-owned Operations diagnostic checkpoint remains
  separate, stages only the reviewed change and exact implementation files,
  commits and pushes one intentional implementation checkpoint, and requires
  the complete Development workflow to succeed at that exact head.
- [ ] 3.2 After exact-head Development success, record the run identity and
  correction evidence, synchronize the delta into
  `openspec/specs/updater-build-artifact/spec.md`, archive this change, and
  strictly validate all OpenSpec with clean diff/residue evidence.
- [ ] 3.3 Create and strictly approve a separate acceptance-refresh OpenSpec,
  then bind the exact acceptance-free product revision/tree to the Updater
  checks and one compatible acceptance-control revision/tree to the existing
  isolated remote package, supervisor, targeted,
  exception/unexecuted-cell, cleanup, and zero-P0/P1 audit closure. Prove by
  exact Git byte/mode inventory that the control revision differs from the
  product only in its declared harness/lifecycle paths. The Darwin formal
  matrix remains explicitly unexecuted.
- [ ] 3.4 Only after that refresh is archived, hand its accepted product and
  lifecycle identities to the active Operations change for explicit
  receipt/build-definition rebinding; make no release, deployment,
  production-host/service/public-route mutation in this correction.
