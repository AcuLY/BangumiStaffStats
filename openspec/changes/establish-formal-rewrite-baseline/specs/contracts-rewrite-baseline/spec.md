## Capability Boundary

| Field | Contract |
|---|---|
| Status | Specified and partially applied; evidence and the first repaired planning checkpoint exist, generated trees are absent, and the five-path cleanup preparation is unstaged. Binary/non-UTF-8 `apply_patch` verification failed with zero complement deletion; the second and final repair awaits reapproval. Staged acceptance, cleanup commit, archive, final acceptance, push, release, and deploy are not complete. |
| Owner | `contracts`; apply and finalization are performed by implementation subagents. The main agent reviews or amends only OpenSpec artifacts and performs two read-only acceptances. |
| Writable paths | Exact `.gitignore`, six root OpenSpec skills, root config, named active/archived change artifacts and synchronized root spec, master plan, relocated audit, two link-only guides, tracked deletion complement, and two exact generated directories. |
| Read-only protected inputs | `LICENSE`, `PRODUCT.md`, `DESIGN.md`, `.agents/skills/impeccable/**`, `.codex/hooks.json`, `.impeccable/design.json`, and both backend guides; each remains byte-identical. |
| Deletion complement | Every tracked path outside the exact pre-archive allowlist; the moved audit source is satisfied once by the move hunk. Recursive deletion is limited to verified `frontend/node_modules/` and `frontend/dist/`. |
| Mutable refs | Formal branch through four exact final local commits, including exactly two enumerated replacements of the same unpublished planning checkpoint for observed tool failures; prototype branch through one oracle-to-evidence CAS fast-forward; no remote ref and no third amend. |
| Consumes | Oracle commit `644b7748674e553f863d0ffd61d029f86fdc0717`, root product/design authorities, formal-development plans, accepted data audit, and legacy framework blobs. |
| Produces | One repository-root OpenSpec control plane, exact formal-rewrite tracked and physical file/symlink sets, supplemental/planning/cleanup/archive commits, synchronized root spec, dated archive, relocated audit, repaired links, minimal ignore rules, approval seal, and Gate 0 evidence. |
| Dependencies | OpenSpec CLI 1.6.0, ordinary Git ancestry from the oracle, the reviewed master plan, and main-agent approval of all four change artifacts. |
| Deliverables | Stable clean-room baseline; external-behavior oracle reachability; supplemental-test evidence; sealed approved planning inputs; archived/synchronized root capability; clean worktree; and precise acceptance state report. |
| Acceptance | Read-only main-agent acceptance of the exact staged candidate, then read-only acceptance of the clean post-archive commits and exact final set; Wave 1 waits for both. |
| Non-goals | Application code or new tests, dependency manifests, API/schema implementation, CI, Docker, infrastructure, external repository work, push, PR, tag, release, deploy, or production activation. |
| Operations deferred | nginx, systemd, production Compose, timers, secrets, deployment, release, host mutation, activation, cutover, monitoring installation, real periodic runs, rollback execution, and legacy-system deletion. |
| Stop/rollback conditions | Stop on any root/branch/ref/status/hash/manifest/allowlist/link/parser/OpenSpec/ancestry/date mismatch, concurrent use, unexpected path, or absent approval; preserve evidence and never reset, checkout-restore, clean, rewrite oracle/evidence/accepted history, or auto-rollback. Only the two mechanically bounded, reapproved replacements of the unpublished planning checkpoint are excepted. |

## ADDED Requirements

### Requirement: Spec-first single-root governance
The repository SHALL use exactly one OpenSpec root at `openspec/`. Every implementation change MUST use a capability id beginning with exactly one of `contracts-`, `backend-`, `updater-`, or `frontend-`, and no apply work may begin until its proposal, capability specs, design, and tasks are complete, strictly valid, reviewed, and explicitly approved by the main agent. Actual apply work SHALL be performed only by implementation subagents; the main agent SHALL limit its implementation-phase role to OpenSpec-artifact review or amendment and read-only acceptance.

#### Scenario: Baseline artifacts are ready for review
- **WHEN** `establish-formal-rewrite-baseline` is presented to the main agent
- **THEN** its proposal, `contracts-rewrite-baseline` spec, design, and tasks all exist and pass OpenSpec strict validation
- **AND** no apply or cleanup is represented as approved or complete

#### Scenario: Nested control plane is proposed
- **WHEN** a change or task proposes an `openspec/` root or generated OpenSpec skill set below `frontend/`, `backend/`, `updater/`, `contracts/`, `apps/`, or `packages/`
- **THEN** validation or review SHALL reject the change before apply

### Requirement: Fail-safe apply preflight
The implementation subagent MUST run a read-only preflight before any cleanup. It SHALL verify the canonical repository root is `/Users/luca/dev/BangumiStaffStats`, the branch is `codex/formal-rewrite`, `HEAD` and the local `codex/person-workbench-unified-prototype` ref both equal the oracle before the supplemental checkpoint, the index is clean, and the tracked, untracked, and ignored workspace manifests exactly equal the reviewed bootstrap state. That ignored state MUST contain only `backend/internal/core/subject/rate_test.go`, `frontend/node_modules/`, and `frontend/dist/`. It MUST verify the approved SHA-256 manifest before every mutation phase, allowing only task-checkbox transitions under the declared normalization. Any mismatch MUST stop apply without modifying or discarding workspace state, except that either of the two exact tool-rejection recoveries defined under `Approved specification remains sealed through apply` MAY replace the same unpublished planning checkpoint only after its own exceptional pre-amend seal passes.

#### Scenario: Exact bootstrap is present
- **WHEN** repository root, branch, `HEAD`, prototype ref, index, tracked status, untracked planning paths, and the three ignored paths exactly match the reviewed initial manifest
- **THEN** the subagent MAY continue to the supplemental evidence checkpoint

#### Scenario: Unexpected dirty state is present
- **WHEN** any staged, tracked, or untracked path falls outside the reviewed planning/bootstrap set
- **THEN** apply SHALL stop before the first mutation
- **AND** the subagent SHALL report the path without resetting, checking out, cleaning, overwriting, staging, or deleting it

#### Scenario: Ancestry is not ordinary
- **WHEN** `git merge-base --is-ancestor 644b7748674e553f863d0ffd61d029f86fdc0717 HEAD` fails
- **THEN** apply SHALL stop
- **AND** no orphan branch, oracle/evidence history rewrite, rebase, or replacement oracle SHALL be created

### Requirement: Checkpoint-omitted test is preserved without replacing the oracle
Before cleanup, the implementation subagent MUST create exactly one ordinary local supplemental evidence commit. Its parent MUST be `644b7748674e553f863d0ffd61d029f86fdc0717`; its only tree delta MUST be the addition of `backend/internal/core/subject/rate_test.go`; that file MUST have 47 lines, Git blob `3d52f6e505596819bad687d817d286f7a85d7c06`, and SHA-256 `e662fa678ce94c1f2b72fbc67d4e8d5fc53e7d882356a69c9af4b57ad462ef74`. The subagent SHALL prove the local prototype branch is not checked out by another worktree, then compare-and-swap `refs/heads/codex/person-workbench-unified-prototype` from the oracle to this commit with `git update-ref <ref> <evidence> <oracle>`. It MUST NOT amend the oracle, push either branch, or include any planning file in that commit.

#### Scenario: Supplemental evidence checkpoint is exact
- **WHEN** the local evidence commit is created
- **THEN** it has the oracle as its single parent
- **AND** its exact name-status delta is `A backend/internal/core/subject/rate_test.go`
- **AND** the committed blob, SHA-256, and line count match the fixed values
- **AND** every OpenSpec/bootstrap/master-plan file remains untracked and absent from the commit

#### Scenario: Prototype branch is updated safely
- **WHEN** the local prototype branch still points to the oracle and the exact evidence commit has passed all predicates
- **THEN** that local branch SHALL be fast-forwarded to the evidence commit
- **AND** the behavior oracle SHALL remain the fixed parent commit
- **AND** no remote ref SHALL be read for write capability or mutated

#### Scenario: Hidden state differs
- **WHEN** the ignored manifest contains another path, the test hash differs, either generated tree is not the exact expected directory, or a generated tree contains a tracked file
- **THEN** apply SHALL stop before commit or deletion
- **AND** no hidden path SHALL be cleaned automatically

### Requirement: Exact retained tracked baseline
After apply and before archive, every file in the proposed Git index and every physical file or symlink below the repository root except `.git/**` MUST match the following allowlist, and every listed mandatory file MUST exist in both the index and worktree. Empty directories are not members of this baseline set and MAY remain only when they contain no file or symlink:

```text
.gitignore
LICENSE
PRODUCT.md
DESIGN.md
.agents/skills/impeccable/**
.codex/hooks.json
.codex/skills/openspec-apply-change/SKILL.md
.codex/skills/openspec-archive-change/SKILL.md
.codex/skills/openspec-explore/SKILL.md
.codex/skills/openspec-propose/SKILL.md
.codex/skills/openspec-sync-specs/SKILL.md
.codex/skills/openspec-update-change/SKILL.md
.impeccable/design.json
openspec/config.yaml
openspec/changes/establish-formal-rewrite-baseline/.openspec.yaml
openspec/changes/establish-formal-rewrite-baseline/.approval-manifest.json
openspec/changes/establish-formal-rewrite-baseline/proposal.md
openspec/changes/establish-formal-rewrite-baseline/design.md
openspec/changes/establish-formal-rewrite-baseline/tasks.md
openspec/changes/establish-formal-rewrite-baseline/specs/contracts-rewrite-baseline/spec.md
tmp-formal-development/backend-development-implementation-guide.md
tmp-formal-development/backend-operations-implementation-guide.md
tmp-formal-development/data-logic-implementation-guide.md
tmp-formal-development/frontend-production-cleanup-and-architecture-plan.md
tmp-formal-development/formal-development-master-plan.md
tmp-formal-development/decisions/prototype-data-logic-audit.md
```

The implementation MUST remove every other legacy tracked path from the rewrite branch while preserving Git history. It MUST also remove the exact rebuildable ignored trees `frontend/node_modules/` and `frontend/dist/` after verifying their canonical paths are inside the owned repository and contain no tracked file. No other ignored path may be deleted by recursive command. In particular, no physical file or symlink may remain below `backend/`, `frontend/`, `artifacts/`, `docs/`, `.superpowers/`, or `.impeccable/live/`, and `bangumi_plugin.js`, `design-qa.md`, and the legacy `README.md` MUST be absent.

After the working-tree relocation, cleanup, and content checks pass, the implementation subagent SHALL stage only individually reviewed allowlisted additions/modifications and individually reviewed deletion targets so the index represents the proposed final tracked tree. `git add -A`, broad or unresolved pathspecs, and staging any unrelated path are forbidden. No cleanup commit is authorized by this staging step until main-agent candidate acceptance.

#### Scenario: Allowlist and required-file checks pass
- **WHEN** cleanup and relocation finish
- **THEN** a full proposed-index allowlist check and a physical repository walk produce no unexpected path
- **AND** an explicit required-file check finds every listed exact file and the complete retained Impeccable oracle tree in both index and worktree
- **AND** worktree content equals the proposed index with no unstaged drift

#### Scenario: An unspecified legacy file remains
- **WHEN** any proposed-index, untracked, ignored, or physical path is not matched by the exact allowlist
- **THEN** Gate 0 SHALL fail
- **AND** the change SHALL not be staged, committed, synced, or archived

#### Scenario: A required retained file is missing
- **WHEN** any exact required file or retained framework subtree is absent
- **THEN** Gate 0 SHALL fail even if no unexpected file remains

#### Scenario: Proposed tracked tree is assembled for acceptance
- **WHEN** working-tree checks pass and every staged path has been matched to the reviewed allowlist or deletion complement
- **THEN** the subagent SHALL stage only those exact paths
- **AND** `git ls-files` SHALL represent the proposed baseline for final mechanical and main-agent review
- **AND** committed, pushed, released, and deployed states SHALL remain false

### Requirement: Retained content and relocations preserve authority
The implementation MUST preserve `LICENSE`, `PRODUCT.md`, `DESIGN.md`, `.agents/skills/impeccable/**`, `.codex/hooks.json`, and `.impeccable/design.json` byte-for-byte from the oracle. `LICENSE` MUST retain Git blob `23bff8550cae9005fd63c7dc45ff9a8c4e4738b8`. The data audit MUST move from `docs/decisions/prototype-data-logic-audit.md` to `tmp-formal-development/decisions/prototype-data-logic-audit.md` with unchanged blob `28fb89d29e2b7f58677d7be17c7c6acbca9db849`.

Only these two active documentation links MAY change:

```text
tmp-formal-development/data-logic-implementation-guide.md
tmp-formal-development/frontend-production-cleanup-and-architecture-plan.md
```

Each MUST point to `./decisions/prototype-data-logic-audit.md`. Active links in retained plans, guides, OpenSpec artifacts, and Impeccable documentation MUST resolve in the cleaned worktree. Because the relocated audit remains byte-identical, a local historical-evidence link inside that audit MAY resolve against the supplemental evidence commit when its target was intentionally removed from the rewrite tip; every such target MUST exist in that commit.

#### Scenario: Audit relocation is exact
- **WHEN** the relocated audit is inspected after apply
- **THEN** its Git blob equals `28fb89d29e2b7f58677d7be17c7c6acbca9db849`
- **AND** both active guides resolve the new relative path
- **AND** no retained guide references `../docs/decisions/prototype-data-logic-audit.md`
- **AND** every historical local link in the audit resolves either in the cleaned worktree or in the supplemental evidence commit

#### Scenario: A retained authority changes unexpectedly
- **WHEN** any retained oracle document, Impeccable file, hook, sidecar, or license differs outside the two approved link replacements
- **THEN** Gate 0 SHALL fail and apply SHALL stop without attempting an automatic restoration

### Requirement: OpenSpec framework deduplicates without drift
The six root `.codex/skills/openspec-*/SKILL.md` files MUST be byte-identical to both corresponding legacy frontend and backend copies at the oracle. The enhanced root `openspec/config.yaml` SHALL be OpenSpec 1.6.0-parseable and is not required to match the legacy blank config hash. After apply, no nested OpenSpec root or nested generated OpenSpec skill set may remain.

#### Scenario: Root framework parity passes
- **WHEN** each root OpenSpec skill is compared with both oracle legacy copies
- **THEN** all twelve comparisons succeed
- **AND** `openspec doctor --json` reports the repository root as healthy

#### Scenario: Config differs from the blank legacy config
- **WHEN** the root config contains the reviewed authority, ownership, approval, single-root, external-write, and operations-deferral rules
- **THEN** its legacy config hash difference SHALL be accepted
- **AND** YAML parsing and OpenSpec doctor validation MUST still pass

#### Scenario: A nested root survives
- **WHEN** a tracked `frontend/openspec`, `backend/openspec`, or nested `.codex/skills/openspec-*` path remains
- **THEN** Gate 0 SHALL fail

### Requirement: Generated Impeccable state has an explicit lifecycle
`.impeccable/design.json` MUST remain a generated sidecar subordinate to root `DESIGN.md`; retaining it at Gate 0 SHALL NOT represent it as regenerated or current for the new implementation. `.impeccable/live/config.json` MUST NOT survive because it targets the deleted legacy `frontend/index.html`. The first approved `frontend-` foundation change MUST define the regeneration contract and timing, mark the retained sidecar stale, and assign `harden-frontend-design-and-accessibility` as the only change that may rewrite it after real component primitives exist and before that change exits. A new live configuration may be created only after a real frontend entry path exists.

#### Scenario: Gate 0 retains only safe Impeccable state
- **WHEN** the baseline is inspected
- **THEN** `.impeccable/design.json` is present and byte-identical to the oracle
- **AND** `.impeccable/live/config.json` is absent
- **AND** the change records `design.json` as `GENERATED` and awaiting the foundation-defined handoff followed by later hardening regeneration

### Requirement: Minimal ignore rules do not hide source or contract evidence
The new `.gitignore` MUST contain only the reviewed generated-local-state rules:

```gitignore
# macOS
.DS_Store

# Local secrets and environment overrides
.env
.env.*
!.env.example
!.env.*.example

# Node, Vite, tests
node_modules/
dist/
.vite/
coverage/
playwright-report/
test-results/
*.tsbuildinfo

# Python producer tooling
.venv/
__pycache__/
*.py[cod]
*.egg-info/
.pytest_cache/
.mypy_cache/
.ruff_cache/
.coverage
htmlcov/

# Go test output
/coverage.out

# Local logs and scratch
*.log
/tmp/
```

It MUST NOT ignore `*_test.go`, `*.sqlite`, `*.db`, `fixtures/`, `goldens/`, `config.toml`, `.vscode/`, `bin/`, or `build/`. Later changes may add only exact generated or local-secret paths after those paths have an approved owner.

#### Scenario: Generated local state is ignored
- **WHEN** representative `.env`, `.env.local`, `node_modules`, Python cache, test report, coverage, log, and root scratch paths are checked
- **THEN** Git reports them ignored

#### Scenario: Contract and test evidence remains trackable
- **WHEN** representative Go test, shared golden, SQLite fixture, example config, editor config, and future source/build paths are checked
- **THEN** Git does not report them ignored

### Requirement: Oracle remains reachable after cleanup
The rewrite branch MUST retain ordinary ancestry from `644b7748674e553f863d0ffd61d029f86fdc0717`. After cleanup, Git MUST still be able to read representative frontend, backend, and historical decision files from that commit even though those paths no longer exist at the rewrite tip.

#### Scenario: Deleted implementation remains reviewable
- **WHEN** a reviewer requests the oracle versions of `frontend/src/workbench/WorkbenchApp.vue`, `backend/cmd/main.go`, and `docs/decisions/prototype-global-design-unification.md`
- **THEN** all three `git show <oracle>:<path>` reads succeed
- **AND** no legacy implementation file is reintroduced into the rewrite tip

### Requirement: Gate 0 creates no application or operations implementation
This change MUST NOT create application source, new application tests, dependency manifests, shared contract implementation, API schema implementation, CI workflows, Dockerfiles, Compose files, infrastructure, deployment or release scripts, host configuration, or production state. Apart from the exact four local commits and one local prototype-ref compare-and-swap authorized by this spec, it MUST NOT write outside approved worktree paths, mutate another repository, remote, service, host, or production system.

#### Scenario: Gate 0 path scan passes
- **WHEN** the final tracked tree is scanned for application, CI, Docker, infrastructure, deployment, and nested-root paths
- **THEN** no path exists beyond the retained operations guide and planning text

#### Scenario: An operations task is discovered
- **WHEN** a task would configure nginx, systemd, Compose, timers, production secrets, deployment, release, activation, cutover, monitoring installation, a real periodic run, rollback execution, or legacy deletion
- **THEN** apply SHALL stop
- **AND** that work SHALL require a later user-approved operations change

#### Scenario: A command targets external state
- **WHEN** an apply command would write outside the owned repository or mutate a remote, external repository, service, or host
- **THEN** the command SHALL NOT run
- **AND** the task SHALL be reported as out of scope

### Requirement: Approved specification remains sealed through apply
The main-agent-approved root config, master plan, change metadata, proposal, design, capability spec, normalized tasks, and six root OpenSpec skills MUST be recorded in `.approval-manifest.json`. The manifest digest MUST be embedded in the task procedure. Before cleanup, an implementation subagent MUST create a local planning-approval commit containing exactly those approved control files after the supplemental evidence commit. Every later mutation phase MUST compare static artifacts exactly and task content under checkbox/digest-placeholder normalization against both the manifest and planning commit.

If and only if the execution safety layer rejects the originally reviewed
`rm -rf --` invocation before either verified generated directory changes, the
main agent MAY replace only that command with the stricter `rm -r --` form, add
the exact recovery gates, obtain a matching master-plan amendment from its
subagent owner, reseal every governed artifact, and explicitly reapprove. While
the initial planning checkpoint is unpublished and is still `HEAD`, the index is
clean, both generated directories remain exact, the prototype ref still equals
the evidence commit, and the only tracked worktree changes are the six reviewed
OpenSpec/master/manifest recovery paths, the apply subagent MAY stage only those
paths and replace the planning checkpoint with `git -c core.hooksPath=/dev/null
commit --amend --no-edit`. It MUST prove old and new OIDs, the evidence commit as
the sole parent, the unchanged subject, the exact same 14-path delta, the
newly approved tree and seal, and that the formal branch still contains only the
evidence and replacement planning commits after the oracle. This first
exception MUST NOT rewrite the oracle or evidence commit, bless unrelated
drift, create a fifth final commit, or apply after either generated directory
changes.

If and only if the subsequent explicit `apply_patch` deletion fails during
verification on tracked binary/non-UTF-8 blobs, deletes no tracked-complement
file, leaves the index clean and the approved five-path cleanup preparation
exact, and the generated trees remain absent, the main agent MAY approve a
second and final planning repair. The repair MUST classify the exact complement
as strict-UTF-8 regular files versus a fixed binary/non-UTF-8 ledger. Every
strict-UTF-8 target MUST still be deleted by an explicit `apply_patch` hunk.
Only the fixed binary/non-UTF-8 ledger MAY be deleted by non-recursive,
non-forcing `rm --` using one literal path per command, and only after exact
per-path repository containment,
tracked mode, blob, SHA-256, file-type, existence, index-equality, and
non-symlink checks. `rm -f`, recursive deletion, globs, command-substitution
targets, execution arrays, `git rm`, and any path outside the fixed ledger are
forbidden. The main
agent MAY reseal the same six control paths and the apply subagent MAY amend
only the same unpublished planning checkpoint while leaving all five cleanup
paths unstaged. It MUST again prove old/new OIDs, the evidence sole parent,
unchanged subject, exact 14-path delta, approved tree and seal, no fifth final
commit, and no ref to the replaced checkpoint. No third repair or planning
amend is authorized.

#### Scenario: Approved artifacts are unchanged
- **WHEN** a mutation phase begins
- **THEN** the manifest digest, exact file set, per-file hashes, normalized task hash, and planning-commit delta all match
- **AND** the phase MAY continue

#### Scenario: Reviewed content drifts
- **WHEN** a static artifact differs or task content differs beyond permitted checkbox transitions
- **THEN** apply SHALL stop before the next mutation
- **AND** neither the manifest nor the planning commit SHALL be regenerated to bless the drift
- **AND** neither enumerated recovery SHALL apply unless its exact observed tool rejection, stage-specific cleanup state, six-path recovery diff, old planning OID, clean index, evidence parent, prototype ref, and explicit reapproval predicates all pass

#### Scenario: Reviewed deletion form is rejected before cleanup
- **WHEN** the safety layer rejects `rm -rf --` before either exact generated directory changes and every exceptional pre-amend predicate passes
- **THEN** the main agent MAY reapprove a seal whose only semantic execution change is the stricter `rm -r --` form plus its mechanical recovery gates
- **AND** the apply subagent MAY replace only the unpublished planning checkpoint under the exact parent, subject, 14-path delta, tree, seal, and four-final-commit predicates

#### Scenario: Binary blob prevents explicit patch deletion
- **WHEN** `apply_patch` rejects the whole deletion patch during verification on a member of the fixed binary/non-UTF-8 ledger, zero complement target changed, and every second exceptional pre-amend predicate passes
- **THEN** the main agent MAY reapprove a seal that keeps all strict-UTF-8 deletions in explicit patch hunks and adds only the verified fixed-ledger, one-literal-path-per-command `rm --` transport
- **AND** the apply subagent MAY replace the same unpublished planning checkpoint once more under the exact parent, subject, 14-path delta, tree, seal, five-path unstaged-cleanup, and four-final-commit predicates
- **AND** no third amend or broader deletion transport SHALL be authorized

### Requirement: Accepted cleanup becomes an archived stable baseline
The apply subagent MUST stop with an exact staged cleanup candidate for main-agent read-only acceptance. Only after explicit acceptance MAY a finalization subagent create a local cleanup commit, verify its exact parent and tree, complete the remaining task markers, run `openspec archive establish-formal-rewrite-baseline -y --json` on 2026-07-23 so the delta is synchronized to `openspec/specs/contracts-rewrite-baseline/spec.md` and the change moves to `openspec/changes/archive/2026-07-23-establish-formal-rewrite-baseline/`, replace the generated root spec's placeholder Purpose with `Define the clean-room repository baseline, governance boundaries, immutable prototype evidence, and acceptance gates required before any formal frontend, backend, updater, or shared-contract implementation begins.`, and create a local archive commit. The final branch MUST have no active change, no staged/unstaged/untracked/ignored file, and only the exact post-archive allowlist. No push, PR, tag, release, deployment, or operations action is authorized.

#### Scenario: Candidate has not been accepted
- **WHEN** explicit main-agent staged-candidate acceptance is absent or the staged candidate changed after acceptance
- **THEN** cleanup commit, archive, and archive commit SHALL NOT run

#### Scenario: Stable finalization succeeds
- **WHEN** the cleanup commit and archive commit have exact expected parents and deltas, strict validation passes for all synchronized specs, the active change is absent, and the worktree is clean
- **THEN** the main agent SHALL perform a second read-only acceptance
- **AND** Wave 1 remains blocked until that acceptance passes

### Requirement: Validation failures stop safely
The implementation subagent MUST run the specified exact-root, branch/ref, staged/unstaged/untracked/ignored manifest, proposed-index, physical-tree, required-file, blob/tree-integrity, active-link, historical-evidence-link, JSON, YAML, TOML, OpenSpec strict-validation, retained Impeccable-context evidence, oracle, ancestry, ignore-rule, and operations-deferral checks. Every command group MUST use an explicit shell and reliable failure propagation; no check may translate an execution error into a no-match success. Any failure MUST preserve the working tree for review and prohibit reset, checkout-based rollback, `git clean`, `git add -A`, unapproved recursive deletion, cleanup commit, push, sync, archive, deploy, or claims of completion.

#### Scenario: All Gate 0 checks pass
- **WHEN** every mechanical check exits successfully and the main agent completes read-only acceptance
- **THEN** the candidate may be reported as applied, staged, and mechanically verified
- **AND** supplemental evidence and planning approval MAY be reported as committed
- **AND** cleanup committed, archived, final accepted, pushed, released, and deployed states SHALL remain separately unclaimed until their exact later gates are performed

#### Scenario: Any Gate 0 check fails
- **WHEN** a check returns nonzero or produces an unexpected path or content difference
- **THEN** work SHALL stop at the current state
- **AND** the subagent SHALL report the failing command, result, and affected paths without destructive recovery
