## Context

`codex/formal-rewrite` was created at ordinary commit `644b7748674e553f863d0ffd61d029f86fdc0717`, which contains the final prototype, legacy backend, historical artifacts, accepted decisions, formal-development guides, and duplicated frontend/backend OpenSpec scaffolds. The rewrite must begin from a minimal tracked tree without losing the legal file, normative product/design documents, accepted data decisions, design framework, planning guidance, spec-first control plane, or the ability to inspect the prototype and legacy implementation.

The root OpenSpec bootstrap currently consists of six skill files byte-identical to both legacy locations, an enhanced root `openspec/config.yaml`, and this change scaffold. Cleanup has not been applied. Another planning subagent supplied `tmp-formal-development/formal-development-master-plan.md`; it is a mandatory retained input.

The previous checkpoint missed one real source file because the legacy root `.gitignore` globally ignored `*_test.go`: `backend/internal/core/subject/rate_test.go` remains in the worktree but is absent from oracle commit `644b7748674e553f863d0ffd61d029f86fdc0717`. The only other ignored legacy content is the rebuildable `frontend/node_modules/` and `frontend/dist/` trees. A tracked-only cleanup would therefore lose test provenance and leave old physical content behind.

This is a repository-governance change, not a product or application change. It deliberately has no runtime, API, dependency, bundle, data-model, deployment, or production effect.

## Change Boundary

| Field | Contract |
|---|---|
| Reseal-checkpoint status | At this approval boundary, work is applied through accepted cleanup commit `c5435f0a7584bf63aeddf9d33738b15485fbd19e`. Archive/sync has run and all tasks are complete, but the archive commit is fail-closed because the reviewed double-LF root-spec hash and `git diff --cached --check` are mutually exclusive. The bounded post-archive canonicalization reseal awaits explicit main-agent approval. No archive commit, final acceptance, push, release, or deploy has occurred at this checkpoint; the final handoff records their later state. |
| Owner | `contracts`; one implementation subagent applies reviewed tasks, and a finalization subagent commits/archives only after the staged candidate is accepted. The main agent may review or amend only OpenSpec artifacts and performs two read-only acceptances. |
| Writable paths | Exact paths only: `.gitignore`; the six root `.codex/skills/openspec-*/SKILL.md` files; `openspec/config.yaml`; the named active-change files including `.approval-manifest.json`; the dated archived change and synchronized root spec; the master plan; the relocated audit; the two link-only guides; the reviewed tracked deletion complement; and the two exact generated directories. |
| Read-only protected inputs | `LICENSE`, `PRODUCT.md`, `DESIGN.md`, `.agents/skills/impeccable/**`, `.codex/hooks.json`, `.impeccable/design.json`, and both backend implementation/operations guides. They remain byte-identical and are never made writable by parent-directory ownership. |
| Deletion complement | Oracle/evidence/planning-commit tracked files outside the exact pre-archive allowlist; the moved audit source is satisfied by the move hunk and MUST NOT be deleted twice. Recursive deletion is limited to verified `frontend/node_modules/` and `frontend/dist/`. |
| Mutable refs | `refs/heads/codex/formal-rewrite` only through the four final evidence, planning-approval, cleanup, and archive commits, including exactly two mechanically bounded replacements of the unpublished planning checkpoint for the two observed tool-compatibility failures; `refs/heads/codex/person-workbench-unified-prototype` only through CAS from oracle to evidence. No remote ref. |
| Consumes | Oracle `644b7748674e553f863d0ffd61d029f86fdc0717`; `PRODUCT.md`; `DESIGN.md`; the formal-development master plan and guides; the accepted data audit; legacy OpenSpec and Impeccable blobs. |
| Produces | The exact allowlisted tracked and physical tree, one root OpenSpec control plane, supplemental evidence/planning-approval/cleanup/archive local commits, synchronized root capability spec, archived change, relocated audit, two repaired active links, minimal ignore policy, approval manifest, and mechanical Gate 0 evidence. |
| Dependencies | OpenSpec CLI 1.6.0, Git ordinary ancestry, the separately supplied master plan, completed strict-valid artifacts, and explicit main-agent approval before apply. |
| Deliverables | Stable clean-room tree, immutable-behavior-oracle reachability, supplemental test evidence, sealed approved planning inputs, clean local commits, archived/synchronized baseline capability, and two acceptance reports with precise state labels. |
| Acceptance | Main agent first accepts the exact staged cleanup candidate read-only; after subagent commits and archives, the main agent accepts the exact clean post-archive baseline read-only. Both are mandatory before Wave 1. |
| Non-goals | Application code/new tests, dependencies, contracts/API implementation, CI, Docker, infrastructure, deployment/release, external repository or host work, push, PR, tag, release, or deployment. |
| Operations deferred | nginx, systemd, production Compose, timers, secrets, deployment/release workflows, activation, cutover, monitoring installation, real periodic execution, rollback execution, and legacy-system deletion. |
| Stop/rollback conditions | Stop on any root/branch/ref/worktree/hash/manifest/allowlist/link/parser/OpenSpec/ancestry/date mismatch, concurrent ref/worktree use, unexpected path, or missing approval. Preserve evidence; do not reset, checkout-restore, clean, rewrite oracle/evidence/accepted history, or automatically roll back. Only the two mechanically bounded, reapproved replacements of the same unpublished planning checkpoint are history-rewrite exceptions; no third planning amend is authorized. One separately bounded post-archive output-canonicalization reseal may occur before the existing archive commit only under the exact observed byte/tree/diagnostic predicates below. |

Dependency direction is one-way:

```text
PRODUCT / DESIGN / accepted data decisions
  -> formal master plan and owned implementation guides
      -> approved contracts-rewrite-baseline OpenSpec
          -> implementation-subagent apply and staged candidate
              -> main-agent read-only candidate acceptance
                  -> finalization-subagent cleanup commit + sync/archive commit
                      -> main-agent read-only stable-baseline acceptance
```

An OpenSpec artifact cannot silently override a higher authority. An intentional product, design, or data-semantic delta must first update the owning authority in the same reviewed change.

## Goals / Non-Goals

**Goals:**

- Make the retained tree exact, mechanically checkable, and complete.
- Check both the proposed Git index and the physical file tree, including ignored and untracked content.
- Preserve legal and normative authority while removing legacy implementation from the rewrite tip.
- Preserve the checkpoint-omitted legacy rate test in one verifiable local evidence commit before removing it from the rewrite tip.
- Keep the oracle reachable through ordinary Git ancestry instead of copying legacy source into the new tree.
- Deduplicate OpenSpec into one healthy repository-root control plane.
- Preserve the Impeccable framework while explicitly retiring stale live-target state.
- Make unexpected dirty state, hash drift, missing files, broken links, parser failures, nested roots, operations creep, or external writes fail closed.
- Leave the repository ready for later bounded `contracts-`, `backend-`, `updater-`, and `frontend-` changes.

**Non-Goals:**

- Designing or scaffolding the new application.
- Creating tests, manifests, package metadata, schemas, fixtures, CI, Docker, or deployment assets.
- Updating product behavior, statistical semantics, visual behavior, copy, accessibility, or responsive rules.
- Regenerating `.impeccable/design.json` before the real frontend foundation exists.
- Retaining prototype code “temporarily” in the rewrite tip.
- Performing general Git history rewriting, push, PR, tag, release, deployment, migration, or host mutation. Four exact final local commits are permitted: supplemental evidence, planning approval, cleanup, and archived/synchronized baseline. The only rewrite exceptions are the two reviewed replacements of the same unpublished planning checkpoint for the already-observed command and binary-decoding failures; exact path-scoped staging is required, no third planning amend is authorized, and no remote publication is authorized. The post-archive output-canonicalization reseal below changes no existing commit and is included in the already-authorized archive commit.

## Decisions

### 1. Use ordinary ancestry and an immutable oracle

The exact oracle commit remains the parent/ancestor of the rewrite. The cleaned tip does not retain old source, but reviewers can use `git show <oracle>:<path>`, worktree-independent diffs, and later browser evidence against that commit.

Alternatives considered:

- **Orphan branch**: rejected because it breaks ordinary ancestry and makes review, provenance, and file-level comparison harder.
- **Copy old source into an archive directory**: rejected because it contaminates the new tracked tree and creates a second stale authority.
- **Delete history or replace the oracle**: rejected as destructive and outside scope.

Oracle evidence is classified separately:

- `PRESERVE_ORACLE`: future outward behavior evidence only; no behavior is implemented here.
- `INTENTIONAL_DELTA`: repository layout, OpenSpec location, audit location, and ignore rules.
- `NEW_CAPABILITY`: spec-first governance and mechanical Gate 0.

### 2. Define the final tree as allowlist plus mandatory set

Cleanup is evaluated using two independent checks:

1. every tracked path must match the exact allowlist;
2. every mandatory retained file must exist.

The first catches undeleted legacy content; the second catches accidental over-deletion. The implementation subagent may derive explicit deletion targets from `git ls-files` minus the reviewed allowlist, but must print and review that list before mutation. It may not use an unresolved glob, broad recursive deletion, `git clean`, or a path outside the repository.

Alternative considered:

- **Denylist only**: rejected because unknown legacy paths could survive.
- **Allowlist only without mandatory checks**: rejected because an empty or over-deleted tree could pass.

### 3. Preserve authoritative blobs and use one controlled relocation

`LICENSE`, `PRODUCT.md`, `DESIGN.md`, Impeccable files, hook, and generated design sidecar remain byte-identical to the oracle. The data audit is moved byte-for-byte into `tmp-formal-development/decisions/`, and only its two active guide links change. Historical local links inside that byte-identical audit may point to implementation removed from the rewrite tip; they are validated against the supplemental evidence commit rather than rewritten.

The MIT license stays because code replacement does not authorize a license change and the retained framework and documents remain repository content. Its Git blob is fixed at `23bff8550cae9005fd63c7dc45ff9a8c4e4738b8`.

The global-design and selector-placeholder decision records remain available only through the oracle. Their stable accepted outcomes are already projected into higher authorities, while carrying the files forward would preserve prototype-era and conflicting implementation status as apparent current truth.

Alternative considered:

- **Keep all `docs/decisions/`**: rejected because only the data audit is still an active source referenced by the implementation guides.
- **Copy rather than move the data audit**: rejected because it would create two apparent authorities.

### 4. Deduplicate OpenSpec at the repository root

The six legacy frontend/backend skill pairs are identical, so one root copy of each is retained and verified against both oracle sources. Both nested roots are removed. The enhanced root config is intentionally not hash-equal to the blank legacy config; acceptance is based on YAML parsing, OpenSpec 1.6.0 doctor output, required governance content, and strict validation.

Alternative considered:

- **Keep frontend/backend OpenSpec roots**: rejected because cross-language work would have ambiguous authority and duplicate active changes.
- **Choose one nested root as primary**: rejected because the rewrite is one repository with shared contracts and dependency gates.

No library or runtime dependency is added. OpenSpec CLI 1.6.0 is the existing planning tool, not an application dependency.

### 5. Retain generated design state, retire stale live state

`.impeccable/design.json` is retained as a `GENERATED` sidecar subordinate to `DESIGN.md`, not as evidence that the future UI has been generated or accepted. The first approved `frontend-` foundation change defines the regeneration contract and timing, marks the retained sidecar stale, and assigns the later owner; only `harden-frontend-design-and-accessibility` may rewrite the sidecar, after real component primitives exist and before its own exit gate. `.impeccable/live/config.json` is removed because its `frontend/index.html` target disappears, and a new live config may be created only after a real new entry exists.

Alternative considered:

- **Retain the live config as inactive**: rejected because a stale path looks valid to tooling.
- **Regenerate the sidecar during Gate 0**: rejected because there is no new frontend entry or accepted implementation to scan.

### 6. Replace the legacy ignore file with a narrow generated-state policy

The legacy file is replaced rather than edited because it contains obsolete paths and the prohibited `*_test.go` rule. The new file ignores only common local secrets, dependency/build/test caches, Python tool state, Go root coverage output, logs, and root scratch. It deliberately does not ignore test source, shared goldens, SQLite fixtures, example configuration, editor configuration, or generic future `bin/` and `build/` paths.

Alternative considered:

- **Ignore broad language-specific trees now**: rejected because the new owners and paths have not been created or approved.
- **No `.gitignore` until scaffolding**: rejected because secrets and common generated local state could be accidentally staged during the next change.

### 7. Preserve the ignored legacy test, then remove all ignored legacy content

Before cleanup, the implementation subagent creates one ordinary local commit whose parent is the fixed oracle and whose only tree delta is adding `backend/internal/core/subject/rate_test.go` with 47 lines, Git blob `3d52f6e505596819bad687d817d286f7a85d7c06`, and SHA-256 `e662fa678ce94c1f2b72fbc67d4e8d5fc53e7d882356a69c9af4b57ad462ef74`. It then fast-forwards the local `codex/person-workbench-unified-prototype` ref from the oracle to that commit. This corrects the earlier “commit everything” omission without changing the outward-behavior oracle or rewriting history.

The evidence commit is local only. It is neither pushed nor treated as a production source. Cleanup later removes the test from the proposed rewrite tip along with all other legacy code. The rebuildable ignored directories `frontend/node_modules/` and `frontend/dist/` are removed only after exact path, repository-root, ignored-state, and no-tracked-file checks pass. No other ignored path is authorized for deletion.

Alternatives considered:

- **Drop the ignored test**: rejected because it would violate the checkpoint intent and leave the audit’s evidence incomplete.
- **Amend the oracle**: rejected because it would replace the already-recorded immutable behavior baseline and invalidate every recorded hash.
- **Retain the test in the rewrite tip**: rejected because Gate 0 must contain no legacy application code or tests.
- **Leave generated directories ignored**: rejected because the user requested a physical clean-room baseline, not merely a clean Git index.

### 8. Seal the approved plan before cleanup

The main-agent-approved `openspec/config.yaml`, master plan, `.openspec.yaml`, proposal, design, capability spec, normalized task list, and six root OpenSpec skill files are recorded in `openspec/changes/establish-formal-rewrite-baseline/.approval-manifest.json`. Task normalization changes only Markdown checkbox markers back to unchecked and canonicalizes the embedded manifest digest placeholder; every other byte remains governed. The manifest digest is embedded in the task procedure. Before destructive mutation, the implementation subagent commits the exact approved planning/control set in `chore: approve formal rewrite baseline spec`; later phases compare static files exactly and task content after normalization to that commit and manifest.

This local planning commit is not a claim that cleanup is applied. It creates a stable, reviewable specification boundary and prevents reviewed content from drifting while task checkboxes legitimately advance.

The execution environment rejected the originally reviewed `rm -rf --` command
before either canonical generated directory changed. That is not product,
cleanup, or unrelated content drift. Under the one-time recovery protocol, the
main agent may change only the deletion form to the stricter `rm -r --`, add the
mechanical recovery gates, obtain the master-plan exception from its subagent
owner, reseal every governed hash, and explicitly reapprove. The apply subagent
may then replace only the unpublished planning-approval commit. Before and after
replacement it must prove the exact old/new OIDs, the evidence commit as sole
parent, the unchanged subject and exact 14-path delta, the newly approved tree
and seal, both generated directories still present before replacement, and no
fifth branch commit. This exception cannot bless any other drift and cannot
rewrite the oracle, evidence commit, accepted candidate, or published history.

The tracked-complement step then exposed a distinct transport limitation:
`apply_patch` rejected the entire deletion patch during verification because
named `.DS_Store`, font, raster image, and WOFF2 blobs are not strict UTF-8. No
tracked-complement file was deleted, the index remained clean, the five
previously approved cleanup paths remained exact, and the generated trees
remained absent. The second and final recovery therefore keeps explicit
`apply_patch` delete hunks for every strict-UTF-8 regular target and permits
`rm --` only for a fixed reviewed binary/non-UTF-8 ledger, with one literal
path per command after each path's
tracked mode, blob, SHA-256, file type, repository containment, and non-symlink
status pass. The fallback forbids `-f`, recursion, globs,
command-substitution targets, `git rm`, arrays used as execution targets, or
any path outside that ledger. The same
six control paths are resealed and amend only the unpublished planning
checkpoint; the already applied five-path cleanup state remains unstaged and
excluded from that commit. Old/new OIDs, the evidence sole parent, subject,
exact 14-path delta, new tree/seal, and four-final-commit ancestry are
reverified. No third planning repair or amend is authorized.

Archive finalization later exposed a different, post-history contradiction.
OpenSpec 1.6.0 generated the reviewed raw root spec exactly, and the exact
Purpose replacement passed strict validation, but the precomputed curated hash
encoded two terminal LF bytes. Reaching that hash made the staged archive fail
only `git diff --cached --check` with `new blank line at EOF`; using the
canonical single terminal LF passed whitespace validation but missed that
double-LF hash by exactly one byte. The finalization subagent stopped before the
archive commit in both cases.

This is resolved without another planning amend, archive rerun, or extra
commit. Under the exact cleanup OID, accepted tree, staged archive tree, staged
path set, root-spec hash, empty unstaged/untracked/ignored sets, and sole cached
whitespace diagnostic recorded in `tasks.md`, the main agent may amend and
reapprove only the dated archived OpenSpec/manifest artifacts and synchronized
root spec. It MUST obtain the matching master-plan amendment from that plan's
subagent owner, review it, and include it in the combined seal. The archived
manifest records the immutable planning seal it supersedes. The synchronized
root spec becomes the strictly validated capability plus the exact Purpose with
one terminal LF, the final archive staging includes the subagent-authored
master-plan correction, and cached whitespace MUST pass. The fourth and final
commit remains `chore: archive formal rewrite baseline`; no existing commit or
ref is rewritten.

### 9. Separate apply, acceptance, finalization, and publication states

The implementation subagent performs only reviewed apply tasks and stops with an exact staged cleanup candidate. The main agent performs a first read-only acceptance. Only after that explicit result may a finalization subagent create `chore: establish formal rewrite baseline`, verify its exact delta, complete the remaining task markers, run `openspec archive establish-formal-rewrite-baseline -y --json`, replace OpenSpec's generated placeholder Purpose with the exact reviewed baseline Purpose, validate the synchronized root spec and dated archive, and create `chore: archive formal rewrite baseline`. If and only if the observed EOF hash/whitespace contradiction is reproduced exactly before that archive commit, the post-archive-only reseal above canonicalizes the output and the same finalization subagent resumes without rerunning archive. The main agent then performs a second read-only acceptance against a clean worktree. Push, PR, tag, release, deployment, and operations remain unauthorized.

Alternatives considered:

- **Cleanup and archive before review**: rejected because it removes the inspection point between the fully assembled candidate and its stable commits.
- **Leave Wave 1 on a staged dirty tree**: rejected because later changes need a committed, archived, clean baseline.

## Gate 0 Validation Matrix

| Gate | Mechanical evidence | Pass condition |
|---|---|---|
| Bootstrap | exact repository root, branch, `HEAD`, prototype ref, index/worktree/ignored status, and exact planning paths | Oracle tip before apply; only the named test and two generated trees are ignored |
| Evidence checkpoint | single-parent commit predicate, exact path/blob/hash, and local prototype-ref fast-forward | One local commit; behavior oracle unchanged; no push |
| Tracked tree | anchored allowlist expression plus explicit mandatory-file and preserved-tree checks | No extra path, no missing required file, and proposed index equals worktree |
| Physical file/symlink set | repository walk excluding `.git`, with the same allowlist and exact Impeccable oracle tree | No ignored, untracked, symlink, or legacy file survives; empty directories are not baseline members |
| Preserved blobs | `git diff`/blob comparison against oracle | License, authorities, Impeccable, hook, sidecar unchanged |
| Audit move | oracle blob comparison, two active-link check, and historical-link evidence resolver | Blob unchanged; two active links use `./decisions/`; audit evidence resolves in the supplemental commit |
| OpenSpec parity | root skill comparisons against both legacy copies | All pairs match; nested roots absent |
| Parsers | JSON, YAML, and TOML parsing | All tracked configuration parses |
| OpenSpec | doctor, status JSON, strict validate | One healthy root; all artifacts done; change valid |
| Impeccable | retained context evidence, exact oracle tree, root documents, and hook-target check | No repeated context scan in the same conversation; unchanged inputs prove root PRODUCT/DESIGN discovery remains valid |
| Ignore policy | exact-file diff plus positive/negative `git check-ignore` cases | Generated state ignored; source/evidence remains trackable |
| Oracle | ancestry and representative `git show` reads | Oracle and deleted legacy evidence remain reachable |
| Scope | path and task scans | No application, test, CI, Docker, infrastructure, deploy, or operations implementation |
| External state | command/owned-path review | No command can write outside the repository or mutate external state |
| Approval seal | SHA-256 manifest, normalized-task comparison, planning-approval commit delta | Reviewed control artifacts cannot drift across mutation phases |
| Stable finalization | exact cleanup/archive commit deltas, synchronized root spec, dated archive, clean status | No active change remains; Wave 1 starts from a committed clean baseline |

The concrete commands belong in `tasks.md`; both the subagent and main-agent acceptance use the same gates.

## Risks / Trade-offs

- **[Complement cleanup can remove too much]** → Require a printed deletion list, independent mandatory-file checks, fixed blob comparisons, and stop before staging.
- **[Ignored content bypasses tracked checks]** → Compare the exact initial ignored manifest, preserve the one source test, remove only two named rebuildable trees, and validate the final physical tree.
- **[Concurrent planning work appears during apply]** → Use stage-specific exact status manifests; treat any unreviewed tracked, untracked, or ignored path as an immediate stop.
- **[The master plan is missing or changes unexpectedly]** → Make its existence and reviewed content a hard preflight dependency.
- **[Enhanced config cannot match legacy hash]** → Compare only generated skill copies by hash; validate config semantically with YAML and OpenSpec 1.6.0.
- **[Generated Impeccable sidecar becomes stale]** → Foundation defines timing and marks it stale; only the later design/accessibility hardening change rewrites it before exit.
- **[Historical decisions become harder to discover]** → Keep the full oracle hash in every baseline artifact and verify representative `git show` paths.
- **[Broad ignore rules hide future contracts/tests]** → Fix the initial content exactly and test both ignored and deliberately non-ignored sentinels.
- **[A failed cleanup invites destructive recovery]** → Preserve the worktree and report; prohibit reset, checkout rollback, clean, broad deletion, and automatic restoration.

## Migration Plan

This is a repository-tree migration, not a deployment.

1. Main agent reviews and, if necessary, amends all four OpenSpec artifacts; apply remains blocked until explicit approval.
2. Implementation subagent runs the exact repository, branch, oracle, prototype-ref, index, worktree, untracked, and ignored preflight.
3. It verifies root OpenSpec skill parity, config health, master-plan presence, immutable oracle blobs, the ignored test hash, and the two rebuildable ignored directories.
4. It creates and verifies the one-file supplemental evidence commit, then locally compare-and-swap fast-forwards the unused prototype branch to it without push.
5. It seals the exact approved control files in a planning-approval commit and rechecks that commit before each later mutation phase.
6. If the execution safety layer rejects the reviewed deletion command before either generated tree changes, apply stops; only the one-time main-agent-reviewed reseal and exact unpublished-planning replacement above may run, after which every new seal and planning predicate is rechecked.
7. It validates and removes only `frontend/node_modules/` and `frontend/dist/` with the approved `rm -r --` form.
8. It relocates the audit without changing its blob, repairs only the two active links, and writes the exact minimal `.gitignore`.
9. If `apply_patch` rejects the deletion patch during verification on binary/non-UTF-8 blobs with zero complement deletion, apply stops; only the second and final reviewed reseal and unpublished-planning replacement above may run.
10. It recomputes the tracked deletion complement; strict-UTF-8 regular files use explicit `apply_patch` delete hunks, while only the fixed per-blob-verified binary/non-UTF-8 ledger uses non-recursive, non-forcing `rm --` with one literal path per command.
11. It validates the physical working-tree result, then stages only the exact reviewed additions, modifications, and deletion targets with path-scoped commands; `git add -A` remains forbidden.
12. It proves the worktree equals the proposed index, runs the full validation matrix against that index, and marks a task complete only after its evidence passes.
13. It stops for the first main-agent read-only acceptance with the exact staged candidate unchanged.
14. After explicit acceptance, a finalization subagent creates the exact local cleanup commit and verifies its parent and delta.
15. The finalization subagent completes the remaining task markers, archives and synchronizes the change, and validates the post-archive exact file/symlink set.
16. If the exact reviewed double-LF hash then conflicts with the cached-whitespace gate, finalization stops; only the bounded main-agent-reviewed post-archive canonicalization reseal above may run, without rerunning archive or creating another commit.
17. The finalization subagent validates the canonical single-LF synchronized spec, stages the exact archive paths plus the corrected master plan, and creates the exact local archive commit.
18. The main agent performs a second read-only acceptance on the clean post-archive branch. Push, release, deployment, and operations remain unperformed.

Rollback is intentionally not automated. Before or after a failure, the subagent preserves the current workspace and reports evidence. Any corrective edit requires reviewed task/spec guidance; it does not use reset, checkout-based rollback, clean, or broad restoration.

## Stop Conditions

Apply stops immediately when:

- repository root, branch, oracle parent, prototype ref, ancestry, evidence-commit predicate, index, or stage-specific tracked/untracked/ignored-state checks differ;
- any required authority, framework, master plan, change artifact, or oracle blob is missing or changed;
- a deletion target is outside the repository, inside the allowlist, unresolved, or broader than the printed explicit list;
- an active local link, historical audit evidence link, or parser check fails;
- OpenSpec doctor/status/strict validation fails;
- Impeccable cannot resolve root context or hook target;
- a nested OpenSpec root survives;
- an unapproved commit, operation, application, CI, Docker, infrastructure, deployment, publication, or external-state action appears;
- any reviewer approval is absent.

## Open Questions

- Main-agent review and explicit approval are outstanding. This is an approval gate, not permission inferred from artifact completion.
- The separately authored `tmp-formal-development/formal-development-master-plan.md` must exist and be reviewed before apply; if its final ownership or sequencing conflicts with this change, these artifacts must be reconciled and revalidated first.
