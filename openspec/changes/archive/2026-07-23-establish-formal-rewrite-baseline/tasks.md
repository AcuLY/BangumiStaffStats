## Task Boundary

| Field | Contract |
|---|---|
| Reseal-checkpoint status | At this approval boundary, work is applied through accepted cleanup commit `c5435f0a7584bf63aeddf9d33738b15485fbd19e`. Archive/sync has run, all 23 tasks are complete, and the original 13 no-renames archive paths are staged. The archive commit is fail-closed because the reviewed double-LF root-spec hash passes while `git diff --cached --check` rejects that exact EOF blank line. The bounded post-archive canonicalization reseal awaits approval; archive committed, final accepted, pushed, released, and deployed are false at this checkpoint, with later state recorded by the final handoff. |
| Owner | `contracts`; apply and finalization are subagent-only. The main agent may amend OpenSpec artifacts and performs two read-only acceptances. |
| Writable paths | Exact `.gitignore`; six root OpenSpec skill files; root OpenSpec config; named active/archived change artifacts and synchronized root spec; master plan; relocated audit; two link-only guides; reviewed tracked deletion complement; and exact generated directories `frontend/node_modules/` and `frontend/dist/`. |
| Read-only protected inputs | `LICENSE`, `PRODUCT.md`, `DESIGN.md`, `.agents/skills/impeccable/**`, `.codex/hooks.json`, `.impeccable/design.json`, and both backend guides remain byte-identical. |
| Deletion complement | Every tracked path outside the pre-archive allowlist; the audit source is satisfied by its move hunk and is excluded from later delete hunks. No recursive deletion except the two verified generated directories. |
| Mutable refs | `codex/formal-rewrite` through four exact final local commits, including exactly two enumerated replacements of the unpublished planning checkpoint for observed tool failures; `codex/person-workbench-unified-prototype` through one oracle-to-evidence compare-and-swap; no remote ref and no third amend. |
| Consumes | Fixed oracle, accepted authorities and guides, approval manifest, OpenSpec CLI 1.6.0, and explicit main-agent approvals. |
| Produces | Evidence, planning-approval, cleanup, and archive commits; exact retained file/symlink sets; archived/synchronized baseline spec; and acceptance evidence. |
| Dependencies | Exact initial state, complete strict-valid artifacts, sealed manifest, ordinary ancestry, no concurrent worktree/ref use, and staged-candidate acceptance before finalization. |
| Deliverables | Clean committed formal baseline, reachable oracle/test evidence, one root OpenSpec, archived baseline capability, and precise status report. |
| Acceptance | Main agent read-only accepts the exact staged candidate, then separately accepts the clean post-archive branch; Wave 1 waits for both. |
| Non-goals | Application/tests/dependencies/contracts/API/CI/Docker/infrastructure, external repo or host work, push/PR/tag/release/deploy, or production operations. |
| Operations deferred | nginx, systemd, production Compose, timers, secrets, activation, cutover, monitoring installation, real periodic execution, rollback execution, and legacy deletion. |
| Stop/rollback conditions | Stop on any root/branch/ref/status/hash/manifest/allowlist/link/parser/OpenSpec/ancestry/date/concurrency mismatch or absent approval. Preserve evidence; never reset, checkout-restore, clean, rewrite oracle/evidence/accepted history, or auto-rollback. Only the two exact reapproved replacements of the unpublished planning checkpoint are history-rewrite exceptions; no third planning amend is permitted. One separately bounded post-archive output-canonicalization reseal may occur before the existing archive commit only under the exact fixed state below. |

## 1. Contracts owner — approval and exact initial preflight

- [x] 1.1 Before any mutation, confirm that the main agent has reviewed and explicitly approved `proposal.md`, `design.md`, `specs/contracts-rewrite-baseline/spec.md`, and this task list and has sealed `.approval-manifest.json`. Run OpenSpec status, strict validation, and doctor from the repository root; stop unless every artifact is done, the change is valid, and the resolved root is `/Users/luca/dev/BangumiStaffStats`.
- [x] 1.2 Verify the exact canonical repository, branch, oracle `HEAD`, local prototype ref, clean index, untracked planning/bootstrap manifest, and ignored manifest. The initial ignored set MUST be exactly the legacy rate test plus `frontend/node_modules/` and `frontend/dist/`; any additional, missing, or differently classified path stops apply.
- [x] 1.3 Verify the approval-manifest digest and exact file set; exact-hash every static reviewed artifact and checkbox/digest-placeholder-normalize only `tasks.md`. Verify the master plan and all retained authorities/frameworks exist; root OpenSpec skills are byte-identical to both oracle copies; both legacy configs are identical; the retained oracle documents and full Impeccable tree are unchanged; and the fixed license, audit, and ignored-test hashes match.
- [x] 1.4 Verify the two ignored generated paths are real directories canonically inside this repository and contain no tracked file. Do not stage, commit, move, remove, or overwrite anything until all preflight evidence passes.

OpenSpec gate:

```zsh
set -euo pipefail

test "$(openspec --version)" = 1.6.0

openspec status \
  --change establish-formal-rewrite-baseline \
  --json |
  node -e '
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", chunk => input += chunk);
    process.stdin.on("end", () => {
      const value = JSON.parse(input);
      if (!value.isComplete) process.exit(1);
      if (!Array.isArray(value.artifacts) || value.artifacts.length !== 4) {
        process.exit(1);
      }
      if (!value.artifacts.every(item => item.status === "done")) {
        process.exit(1);
      }
      if (value.root?.path !== "/Users/luca/dev/BangumiStaffStats") {
        process.exit(1);
      }
    });
  '

openspec validate establish-formal-rewrite-baseline \
  --type change \
  --strict \
  --json \
  --no-interactive

openspec doctor --json |
  node -e '
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", chunk => input += chunk);
    process.stdin.on("end", () => {
      const value = JSON.parse(input);
      if (value.root?.path !== "/Users/luca/dev/BangumiStaffStats") {
        process.exit(1);
      }
      if (value.root?.healthy !== true) process.exit(1);
      if (!Array.isArray(value.status) || value.status.length !== 0) {
        process.exit(1);
      }
    });
  '
```

Exact initial-state gate:

```zsh
set -euo pipefail

node <<'NODE'
const fs = require("fs");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

const root = "/Users/luca/dev/BangumiStaffStats";
const oracle = "644b7748674e553f863d0ffd61d029f86fdc0717";
const prototypeRef = "refs/heads/codex/person-workbench-unified-prototype";
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const fail = message => {
  process.stderr.write(`${message}\n`);
  process.exit(1);
};

if (fs.realpathSync(process.cwd()) !== fs.realpathSync(root)) {
  fail("wrong physical working directory");
}
if (fs.realpathSync(git("rev-parse", "--show-toplevel")) !== fs.realpathSync(root)) {
  fail("wrong git top-level");
}
if (git("branch", "--show-current") !== "codex/formal-rewrite") {
  fail("wrong branch");
}
if (git("rev-parse", "HEAD") !== oracle) fail("HEAD is not the oracle");
if (git("rev-parse", prototypeRef) !== oracle) {
  fail("prototype branch is not at the oracle");
}

const index = spawnSync("git", ["diff", "--cached", "--quiet"]);
if (index.status !== 0) fail(`index is not clean: ${index.status}`);

const expected = [
  "?? .codex/skills/openspec-apply-change/SKILL.md",
  "?? .codex/skills/openspec-archive-change/SKILL.md",
  "?? .codex/skills/openspec-explore/SKILL.md",
  "?? .codex/skills/openspec-propose/SKILL.md",
  "?? .codex/skills/openspec-sync-specs/SKILL.md",
  "?? .codex/skills/openspec-update-change/SKILL.md",
    "?? openspec/changes/establish-formal-rewrite-baseline/.openspec.yaml",
    "?? openspec/changes/establish-formal-rewrite-baseline/.approval-manifest.json",
  "?? openspec/changes/establish-formal-rewrite-baseline/design.md",
  "?? openspec/changes/establish-formal-rewrite-baseline/proposal.md",
  "?? openspec/changes/establish-formal-rewrite-baseline/specs/contracts-rewrite-baseline/spec.md",
  "?? openspec/changes/establish-formal-rewrite-baseline/tasks.md",
  "?? openspec/config.yaml",
  "?? tmp-formal-development/formal-development-master-plan.md",
  "!! backend/internal/core/subject/rate_test.go",
  "!! frontend/dist/",
  "!! frontend/node_modules/",
].sort();

const status = execFileSync(
  "git",
  [
    "status",
    "--porcelain=v1",
    "--ignored=matching",
    "--untracked-files=all",
  ],
  { encoding: "utf8" },
).trim().split("\n").filter(Boolean).sort();

if (JSON.stringify(status) !== JSON.stringify(expected)) {
  fail(
    `unexpected initial status\nexpected:\n${expected.join("\n")}\nactual:\n${status.join("\n")}`,
  );
}

for (const relative of ["frontend/node_modules", "frontend/dist"]) {
  const absolute = path.join(root, relative);
  const stat = fs.lstatSync(absolute);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    fail(`${relative} is not a real directory`);
  }
  if (fs.realpathSync(absolute) !== absolute) {
    fail(`${relative} resolves outside its exact canonical path`);
  }
  const tracked = execFileSync(
    "git",
    ["ls-files", "-z", "--", relative],
    { encoding: "utf8" },
  );
  if (tracked.length !== 0) fail(`${relative} contains tracked files`);
}
NODE
```

Immutable-input gate:

```zsh
set -euo pipefail

FORMAL_ORACLE=644b7748674e553f863d0ffd61d029f86fdc0717

test -f tmp-formal-development/formal-development-master-plan.md
test "$(git hash-object LICENSE)" = \
  23bff8550cae9005fd63c7dc45ff9a8c4e4738b8
test "$(git rev-parse \
  "${FORMAL_ORACLE}:docs/decisions/prototype-data-logic-audit.md")" = \
  28fb89d29e2b7f58677d7be17c7c6acbca9db849

git diff --quiet "$FORMAL_ORACLE" -- \
  LICENSE \
  PRODUCT.md \
  DESIGN.md \
  .agents/skills/impeccable \
  .codex/hooks.json \
  .impeccable/design.json \
  tmp-formal-development/backend-development-implementation-guide.md \
  tmp-formal-development/backend-operations-implementation-guide.md \
  tmp-formal-development/data-logic-implementation-guide.md \
  tmp-formal-development/frontend-production-cleanup-and-architecture-plan.md

root_skills=(.codex/skills/openspec-*/SKILL.md)
test "${#root_skills[@]}" -eq 6
for root_skill in "${root_skills[@]}"; do
  skill_rel="${root_skill#.codex/skills/}"
  test "$(git hash-object "$root_skill")" = \
    "$(git rev-parse \
      "${FORMAL_ORACLE}:backend/.codex/skills/${skill_rel}")"
  test "$(git hash-object "$root_skill")" = \
    "$(git rev-parse \
      "${FORMAL_ORACLE}:frontend/.codex/skills/${skill_rel}")"
done

test "$(
  git rev-parse "${FORMAL_ORACLE}:backend/openspec/config.yaml"
)" = "$(
  git rev-parse "${FORMAL_ORACLE}:frontend/openspec/config.yaml"
)"

test "$(git hash-object backend/internal/core/subject/rate_test.go)" = \
  3d52f6e505596819bad687d817d286f7a85d7c06
test "$(
  shasum -a 256 backend/internal/core/subject/rate_test.go |
  awk "{print \$1}"
)" = e662fa678ce94c1f2b72fbc67d4e8d5fc53e7d882356a69c9af4b57ad462ef74
test "$(
  wc -l < backend/internal/core/subject/rate_test.go |
  tr -d "[:space:]"
)" = 47
```

Approval-seal gate. Run this block at initial preflight and again immediately
before the evidence commit, planning-approval commit, generated-tree removal,
relocation, tracked deletion, candidate staging, cleanup commit, and the
`openspec archive` mutation. After the active change has moved, use the
dedicated **Post-archive approval-seal and exact-tree gate** instead; this
active-path block MUST NOT be run before the archive commit. Static files MUST
remain exact. The only accepted drift is a task checkbox transition; the
embedded digest line is canonicalized solely to break the manifest
self-reference:

```zsh
set -euo pipefail

FORMAL_APPROVAL_MANIFEST_SHA256=1c2c8f619e11eb44aad52af54170662b6f34004e72ad7e1b41d9788254cee270
FORMAL_MANIFEST=openspec/changes/establish-formal-rewrite-baseline/.approval-manifest.json

test "$(
  shasum -a 256 "$FORMAL_MANIFEST" |
  awk "{print \$1}"
)" = "$FORMAL_APPROVAL_MANIFEST_SHA256"

node <<'NODE'
const crypto = require("crypto");
const fs = require("fs");
const { execFileSync } = require("child_process");

const manifestPath =
  "openspec/changes/establish-formal-rewrite-baseline/.approval-manifest.json";
const taskPath =
  "openspec/changes/establish-formal-rewrite-baseline/tasks.md";
const expectedPaths = [
  ".codex/skills/openspec-apply-change/SKILL.md",
  ".codex/skills/openspec-archive-change/SKILL.md",
  ".codex/skills/openspec-explore/SKILL.md",
  ".codex/skills/openspec-propose/SKILL.md",
  ".codex/skills/openspec-sync-specs/SKILL.md",
  ".codex/skills/openspec-update-change/SKILL.md",
  "openspec/config.yaml",
  "openspec/changes/establish-formal-rewrite-baseline/.openspec.yaml",
  "openspec/changes/establish-formal-rewrite-baseline/proposal.md",
  "openspec/changes/establish-formal-rewrite-baseline/design.md",
  taskPath,
  "openspec/changes/establish-formal-rewrite-baseline/specs/contracts-rewrite-baseline/spec.md",
  "tmp-formal-development/formal-development-master-plan.md",
].sort();
const digest = value =>
  crypto.createHash("sha256").update(value).digest("hex");
const normalizeTasks = value =>
  value
    .replace(/^(\s*-\s*)\[[ xX]\]/gm, "$1[ ]")
    .replace(
      /^FORMAL_APPROVAL_MANIFEST_SHA256=[0-9a-f]{64}$/m,
      "FORMAL_APPROVAL_MANIFEST_SHA256=<APPROVAL_MANIFEST_SHA256>",
    );

for (const marker of [
  "MERGE_HEAD",
  "CHERRY_PICK_HEAD",
  "REVERT_HEAD",
  "BISECT_LOG",
  "AUTO_MERGE",
  "rebase-merge",
  "rebase-apply",
  "sequencer",
]) {
  const markerPath = execFileSync("git", ["rev-parse", "--git-path", marker], {
    encoding: "utf8",
  }).trim();
  if (fs.existsSync(markerPath)) {
    process.stderr.write(`in-progress Git operation: ${marker}\n`);
    process.exit(1);
  }
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (manifest.schemaVersion !== 1 || manifest.approvedOn !== "2026-07-23") {
  process.exit(1);
}
if (
  manifest.taskNormalization !==
  "checkboxes-unchecked-and-embedded-manifest-digest-placeholder"
) {
  process.exit(1);
}
const actualPaths = manifest.files.map(item => item.path).sort();
if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
  process.stderr.write("approval manifest path set differs\n");
  process.exit(1);
}
for (const item of manifest.files) {
  const body = fs.readFileSync(item.path);
  const checked =
    item.path === taskPath
      ? digest(normalizeTasks(body.toString("utf8")))
      : digest(body);
  if (checked !== item.sha256) {
    process.stderr.write(`approval hash differs: ${item.path}\n`);
    process.exit(1);
  }
}
const planningCommit = execFileSync(
  "git",
  [
    "log",
    "--format=%H",
    "--grep=^chore: approve formal rewrite baseline spec$",
    "-n",
    "1",
  ],
  { encoding: "utf8" },
).trim();
if (planningCommit) {
  const approvedTasks = execFileSync(
    "git",
    ["show", `${planningCommit}:${taskPath}`],
    { encoding: "utf8" },
  );
  const extractDigest = value => {
    const match = value.match(
      /^FORMAL_APPROVAL_MANIFEST_SHA256=([0-9a-f]{64})$/m,
    );
    if (!match) process.exit(1);
    return match[1];
  };
  if (
    extractDigest(approvedTasks) !==
    extractDigest(fs.readFileSync(taskPath, "utf8"))
  ) {
    process.stderr.write("embedded manifest digest drifted from planning commit\n");
    process.exit(1);
  }
}
NODE
```

## 2. Contracts owner — supplemental evidence and approved-plan checkpoints

- [x] 2.1 Immediately re-run the exact initial-state and approval-seal gates with no intervening command, then stage only `backend/internal/core/subject/rate_test.go` with an exact forced path. Verify the full staged/untracked/ignored porcelain state, proposed commit path/mode/blob, and whitespace before creating one local commit with subject `chore: preserve ignored prototype test`.
- [x] 2.2 Verify the new commit has exactly one parent and that parent is the fixed oracle; its only delta is the added test; the committed blob, SHA-256, and line count match; and all planning/bootstrap files remain untracked.
- [x] 2.3 Only after those predicates pass and after proving the prototype branch is not checked out in any other worktree, compare-and-swap `refs/heads/codex/person-workbench-unified-prototype` from the oracle to the evidence commit. Do not fetch, push, create a PR or tag, amend, rebase, or mutate any remote ref, except for the two exact planning-approval reseal repairs explicitly authorized below for the two observed tool failures.
- [x] 2.4 Re-run the approval-seal gate, stage only its exact reviewed control paths, create `chore: approve formal rewrite baseline spec`, and prove its parent is the evidence commit and its only delta is that exact path set. Do not mark any task checkbox before this planning-approval commit.
- [x] 2.5 Re-run the approval-seal, then run the generated-tree removal gate, whose own pre-deletion manifest MUST contain exactly `frontend/node_modules/` and `frontend/dist/`. Revalidate and remove only those exact canonical directories, then prove the full status is empty. The post-planning status gate runs afterward as task 3.1's preflight. These two rebuildable directories are the only recursive-deletion exception in this change.

First enumerated pre-cleanup planning-approval reseal repair: if and only if the
execution environment rejects the originally reviewed `rm -rf --` invocation
before either generated directory is changed, the main agent MAY replace only
that invocation with the stricter `rm -r --` form below, reseal the approval
manifest, and explicitly reapprove the revised artifacts. While `HEAD` is still
the unpublished planning-approval commit, both generated directories and the
rest of the post-planning status remain exact, the index is clean, the evidence
commit and prototype ref remain exact, and the only worktree changes are this
task file, `.approval-manifest.json`, `proposal.md`, `design.md`, the
`contracts-rewrite-baseline` capability spec, and the master plan, the apply
subagent MAY pass the dedicated exceptional pre-amend seal below, stage only
those six paths, and replace that local planning-approval commit with
`git -c core.hooksPath=/dev/null commit --amend --no-edit`. It MUST record the
old and replacement OIDs and prove that the replacement still has the evidence
commit as its sole parent, the exact approved subject, the same exact 14-path
delta, the newly approved tree, and a passing revised approval seal. This
creates no fifth commit and authorizes no other amend or history rewrite except
for the separately bounded second and final binary/non-UTF-8 transport repair
in task 3.4. Command substitution remains prohibited without exception.

Checkpoint commands. Immediately before this block, re-run the complete
**Exact initial-state gate** and **Approval-seal gate** verbatim:

```zsh
set -euo pipefail

FORMAL_ORACLE=644b7748674e553f863d0ffd61d029f86fdc0717
FORMAL_TEST=backend/internal/core/subject/rate_test.go

git add -f -- "$FORMAL_TEST"
test "$(git diff --cached --name-only)" = "$FORMAL_TEST"
git diff --cached --check

node <<'NODE'
const { execFileSync } = require("child_process");
const expected = [
  "A  backend/internal/core/subject/rate_test.go",
  "?? .codex/skills/openspec-apply-change/SKILL.md",
  "?? .codex/skills/openspec-archive-change/SKILL.md",
  "?? .codex/skills/openspec-explore/SKILL.md",
  "?? .codex/skills/openspec-propose/SKILL.md",
  "?? .codex/skills/openspec-sync-specs/SKILL.md",
  "?? .codex/skills/openspec-update-change/SKILL.md",
  "?? openspec/changes/establish-formal-rewrite-baseline/.openspec.yaml",
  "?? openspec/changes/establish-formal-rewrite-baseline/.approval-manifest.json",
  "?? openspec/changes/establish-formal-rewrite-baseline/design.md",
  "?? openspec/changes/establish-formal-rewrite-baseline/proposal.md",
  "?? openspec/changes/establish-formal-rewrite-baseline/specs/contracts-rewrite-baseline/spec.md",
  "?? openspec/changes/establish-formal-rewrite-baseline/tasks.md",
  "?? openspec/config.yaml",
  "?? tmp-formal-development/formal-development-master-plan.md",
  "!! frontend/dist/",
  "!! frontend/node_modules/",
].sort();
const actual = execFileSync(
  "git",
  [
    "status",
    "--porcelain=v1",
    "--ignored=matching",
    "--untracked-files=all",
  ],
  { encoding: "utf8" },
).trim().split("\n").filter(Boolean).sort();
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  process.stderr.write(`unexpected staged-evidence state:\n${actual.join("\n")}\n`);
  process.exit(1);
}
NODE

test "$(git ls-files --stage -- "$FORMAL_TEST" | awk '{print $1}')" = 100644
test "$(git ls-files --stage -- "$FORMAL_TEST" | awk '{print $2}')" = \
  3d52f6e505596819bad687d817d286f7a85d7c06
test "$(git ls-files --stage -- "$FORMAL_TEST" | awk '{print $3}')" = 0
FORMAL_EVIDENCE_TREE="$(git write-tree)"
git -c core.hooksPath=/dev/null \
  commit -m "chore: preserve ignored prototype test"

FORMAL_EVIDENCE="$(git rev-parse HEAD)"
test "$(git rev-parse "${FORMAL_EVIDENCE}^{tree}")" = "$FORMAL_EVIDENCE_TREE"
test "$(
  git rev-list --parents -n 1 "$FORMAL_EVIDENCE" |
  awk "{print NF}"
)" = 2
test "$(git rev-parse "${FORMAL_EVIDENCE}^")" = "$FORMAL_ORACLE"
test "$(git diff-tree --no-commit-id --name-status -r "$FORMAL_EVIDENCE")" = \
  $'A\tbackend/internal/core/subject/rate_test.go'
test "$(git rev-parse "${FORMAL_EVIDENCE}:${FORMAL_TEST}")" = \
  3d52f6e505596819bad687d817d286f7a85d7c06
test "$(
  git show "${FORMAL_EVIDENCE}:${FORMAL_TEST}" |
  shasum -a 256 |
  awk "{print \$1}"
)" = e662fa678ce94c1f2b72fbc67d4e8d5fc53e7d882356a69c9af4b57ad462ef74
test "$(
  git show "${FORMAL_EVIDENCE}:${FORMAL_TEST}" |
  wc -l |
  tr -d "[:space:]"
)" = 47

node <<'NODE'
const { execFileSync } = require("child_process");
const expected = [
  "?? .codex/skills/openspec-apply-change/SKILL.md",
  "?? .codex/skills/openspec-archive-change/SKILL.md",
  "?? .codex/skills/openspec-explore/SKILL.md",
  "?? .codex/skills/openspec-propose/SKILL.md",
  "?? .codex/skills/openspec-sync-specs/SKILL.md",
  "?? .codex/skills/openspec-update-change/SKILL.md",
  "?? openspec/changes/establish-formal-rewrite-baseline/.openspec.yaml",
  "?? openspec/changes/establish-formal-rewrite-baseline/.approval-manifest.json",
  "?? openspec/changes/establish-formal-rewrite-baseline/design.md",
  "?? openspec/changes/establish-formal-rewrite-baseline/proposal.md",
  "?? openspec/changes/establish-formal-rewrite-baseline/specs/contracts-rewrite-baseline/spec.md",
  "?? openspec/changes/establish-formal-rewrite-baseline/tasks.md",
  "?? openspec/config.yaml",
  "?? tmp-formal-development/formal-development-master-plan.md",
  "!! frontend/dist/",
  "!! frontend/node_modules/",
].sort();
const actual = execFileSync(
  "git",
  [
    "status",
    "--porcelain=v1",
    "--ignored=matching",
    "--untracked-files=all",
  ],
  { encoding: "utf8" },
).trim().split("\n").filter(Boolean).sort();
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  process.stderr.write(`unexpected post-evidence state:\n${actual.join("\n")}\n`);
  process.exit(1);
}
NODE

test "$(git rev-parse \
  refs/heads/codex/person-workbench-unified-prototype)" = "$FORMAL_ORACLE"
git merge-base --is-ancestor \
  refs/heads/codex/person-workbench-unified-prototype \
  "$FORMAL_EVIDENCE"
prototype_worktrees="$(
  git worktree list --porcelain |
  awk '
    $1 == "branch" &&
    $2 == "refs/heads/codex/person-workbench-unified-prototype" {
      print $2
    }
  '
)"
test -z "$prototype_worktrees"
git update-ref \
  refs/heads/codex/person-workbench-unified-prototype \
  "$FORMAL_EVIDENCE" \
  "$FORMAL_ORACLE"
test "$(git rev-parse \
  refs/heads/codex/person-workbench-unified-prototype)" = "$FORMAL_EVIDENCE"
```

Planning-approval commit. Re-run the approval-seal gate immediately before this
block. No task checkbox may have changed yet:

```zsh
set -euo pipefail

FORMAL_EVIDENCE="$(git rev-parse HEAD)"
planning_paths=(
  .codex/skills/openspec-apply-change/SKILL.md
  .codex/skills/openspec-archive-change/SKILL.md
  .codex/skills/openspec-explore/SKILL.md
  .codex/skills/openspec-propose/SKILL.md
  .codex/skills/openspec-sync-specs/SKILL.md
  .codex/skills/openspec-update-change/SKILL.md
  openspec/config.yaml
  openspec/changes/establish-formal-rewrite-baseline/.openspec.yaml
  openspec/changes/establish-formal-rewrite-baseline/.approval-manifest.json
  openspec/changes/establish-formal-rewrite-baseline/proposal.md
  openspec/changes/establish-formal-rewrite-baseline/design.md
  openspec/changes/establish-formal-rewrite-baseline/tasks.md
  openspec/changes/establish-formal-rewrite-baseline/specs/contracts-rewrite-baseline/spec.md
  tmp-formal-development/formal-development-master-plan.md
)

node <<'NODE'
const fs = require("fs");
const { execFileSync } = require("child_process");
const taskPath =
  "openspec/changes/establish-formal-rewrite-baseline/tasks.md";
const body = fs.readFileSync(taskPath, "utf8");
const unchecked = body.match(/^\s*-\s*\[ \]/gm) ?? [];
const checked = body.match(/^\s*-\s*\[[xX]\]/gm) ?? [];
if (unchecked.length !== 23 || checked.length !== 0) {
  process.stderr.write(
    `planning task state differs: unchecked=${unchecked.length}, checked=${checked.length}\n`,
  );
  process.exit(1);
}
const expectedStatus = [
  "?? .codex/skills/openspec-apply-change/SKILL.md",
  "?? .codex/skills/openspec-archive-change/SKILL.md",
  "?? .codex/skills/openspec-explore/SKILL.md",
  "?? .codex/skills/openspec-propose/SKILL.md",
  "?? .codex/skills/openspec-sync-specs/SKILL.md",
  "?? .codex/skills/openspec-update-change/SKILL.md",
  "?? openspec/changes/establish-formal-rewrite-baseline/.openspec.yaml",
  "?? openspec/changes/establish-formal-rewrite-baseline/.approval-manifest.json",
  "?? openspec/changes/establish-formal-rewrite-baseline/design.md",
  "?? openspec/changes/establish-formal-rewrite-baseline/proposal.md",
  "?? openspec/changes/establish-formal-rewrite-baseline/specs/contracts-rewrite-baseline/spec.md",
  "?? openspec/changes/establish-formal-rewrite-baseline/tasks.md",
  "?? openspec/config.yaml",
  "?? tmp-formal-development/formal-development-master-plan.md",
  "!! frontend/dist/",
  "!! frontend/node_modules/",
].sort();
const actualStatus = execFileSync(
  "git",
  [
    "status",
    "--porcelain=v1",
    "--ignored=matching",
    "--untracked-files=all",
  ],
  { encoding: "utf8" },
).trim().split("\n").filter(Boolean).sort();
if (JSON.stringify(actualStatus) !== JSON.stringify(expectedStatus)) {
  process.stderr.write(`unexpected pre-planning state:\n${actualStatus.join("\n")}\n`);
  process.exit(1);
}
NODE

git add -- "${planning_paths[@]}"
git diff --cached --check
FORMAL_PLAN_TREE="$(git write-tree)"

node <<'NODE'
const { execFileSync } = require("child_process");
const expected = [
  ".codex/skills/openspec-apply-change/SKILL.md",
  ".codex/skills/openspec-archive-change/SKILL.md",
  ".codex/skills/openspec-explore/SKILL.md",
  ".codex/skills/openspec-propose/SKILL.md",
  ".codex/skills/openspec-sync-specs/SKILL.md",
  ".codex/skills/openspec-update-change/SKILL.md",
  "openspec/config.yaml",
  "openspec/changes/establish-formal-rewrite-baseline/.openspec.yaml",
  "openspec/changes/establish-formal-rewrite-baseline/.approval-manifest.json",
  "openspec/changes/establish-formal-rewrite-baseline/proposal.md",
  "openspec/changes/establish-formal-rewrite-baseline/design.md",
  "openspec/changes/establish-formal-rewrite-baseline/tasks.md",
  "openspec/changes/establish-formal-rewrite-baseline/specs/contracts-rewrite-baseline/spec.md",
  "tmp-formal-development/formal-development-master-plan.md",
].sort();
const actual = execFileSync(
  "git",
  ["diff", "--cached", "--no-renames", "--name-only", "-z"],
  { encoding: "utf8" },
).split("\0").filter(Boolean).sort();
if (JSON.stringify(actual) !== JSON.stringify(expected)) process.exit(1);
NODE

git -c core.hooksPath=/dev/null \
  commit -m "chore: approve formal rewrite baseline spec"

FORMAL_PLAN="$(git rev-parse HEAD)"
test "$(git rev-parse "${FORMAL_PLAN}^{tree}")" = "$FORMAL_PLAN_TREE"
test "$(
  git rev-list --parents -n 1 "$FORMAL_PLAN" |
  awk "{print NF}"
)" = 2
test "$(git rev-parse "${FORMAL_PLAN}^")" = "$FORMAL_EVIDENCE"
test "$(git show -s --format=%s "$FORMAL_PLAN")" = \
  "chore: approve formal rewrite baseline spec"
test -z "$(git status --porcelain=v1 --untracked-files=all)"
```

First exceptional pre-amend seal and planning-checkpoint replacement. This
block is authorized only for the exact tool-layer rejection already described;
it MUST run before either generated directory changes. After it passes, re-run
the complete normal **Approval-seal gate** verbatim and require it to pass
against the replacement planning commit before entering the generated-tree
removal gate:

```zsh
set -euo pipefail

FORMAL_ROOT=/Users/luca/dev/BangumiStaffStats
FORMAL_ORACLE=644b7748674e553f863d0ffd61d029f86fdc0717
FORMAL_EVIDENCE=751958fc243f86891a4ad07e5e46760956b01b72
FORMAL_OLD_PLAN=19a33ba6ab5e99d5bc87404ac0b564af0eb036d7
FORMAL_OLD_PLAN_TREE=16cc626d6234b5e1baad51377d76a5286fa67a2d
FORMAL_OLD_MANIFEST_SHA256=0bafedcee17d5a9db0407e42c21e0fdd20202ff2fec86d1f5dc704e79bd3be16
FORMAL_MANIFEST=openspec/changes/establish-formal-rewrite-baseline/.approval-manifest.json
FORMAL_TASKS=openspec/changes/establish-formal-rewrite-baseline/tasks.md

repair_paths=(
  openspec/changes/establish-formal-rewrite-baseline/.approval-manifest.json
  openspec/changes/establish-formal-rewrite-baseline/proposal.md
  openspec/changes/establish-formal-rewrite-baseline/design.md
  openspec/changes/establish-formal-rewrite-baseline/tasks.md
  openspec/changes/establish-formal-rewrite-baseline/specs/contracts-rewrite-baseline/spec.md
  tmp-formal-development/formal-development-master-plan.md
)

test "$(git rev-parse --show-toplevel)" = "$FORMAL_ROOT"
test "$(git branch --show-current)" = codex/formal-rewrite
test "$(git rev-parse HEAD)" = "$FORMAL_OLD_PLAN"
test "$(git rev-parse "${FORMAL_OLD_PLAN}^{tree}")" = \
  "$FORMAL_OLD_PLAN_TREE"
test "$(
  git rev-list --parents -n 1 "$FORMAL_OLD_PLAN" |
  awk "{print NF}"
)" = 2
test "$(git rev-parse "${FORMAL_OLD_PLAN}^")" = "$FORMAL_EVIDENCE"
test "$(git rev-parse "${FORMAL_EVIDENCE}^")" = "$FORMAL_ORACLE"
test "$(git show -s --format=%s "$FORMAL_OLD_PLAN")" = \
  "chore: approve formal rewrite baseline spec"
test "$(git rev-parse \
  refs/heads/codex/person-workbench-unified-prototype)" = "$FORMAL_EVIDENCE"
test "$(
  git for-each-ref \
    --format="%(refname)" \
    --points-at "$FORMAL_OLD_PLAN"
)" = refs/heads/codex/formal-rewrite
git diff --cached --quiet

test "$(
  git show "${FORMAL_OLD_PLAN}:${FORMAL_TASKS}" |
  sed -n \
    "s/^FORMAL_APPROVAL_MANIFEST_SHA256=//p"
)" = "$FORMAL_OLD_MANIFEST_SHA256"

node <<'NODE'
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = "/Users/luca/dev/BangumiStaffStats";
const oldPlan = "19a33ba6ab5e99d5bc87404ac0b564af0eb036d7";
const evidence = "751958fc243f86891a4ad07e5e46760956b01b72";
const manifestPath =
  "openspec/changes/establish-formal-rewrite-baseline/.approval-manifest.json";
const taskPath =
  "openspec/changes/establish-formal-rewrite-baseline/tasks.md";
const expectedStatus = [
  " M openspec/changes/establish-formal-rewrite-baseline/.approval-manifest.json",
  " M openspec/changes/establish-formal-rewrite-baseline/design.md",
  " M openspec/changes/establish-formal-rewrite-baseline/proposal.md",
  " M openspec/changes/establish-formal-rewrite-baseline/specs/contracts-rewrite-baseline/spec.md",
  " M openspec/changes/establish-formal-rewrite-baseline/tasks.md",
  " M tmp-formal-development/formal-development-master-plan.md",
  "!! frontend/dist/",
  "!! frontend/node_modules/",
].sort();
const planningPaths = [
  ".codex/skills/openspec-apply-change/SKILL.md",
  ".codex/skills/openspec-archive-change/SKILL.md",
  ".codex/skills/openspec-explore/SKILL.md",
  ".codex/skills/openspec-propose/SKILL.md",
  ".codex/skills/openspec-sync-specs/SKILL.md",
  ".codex/skills/openspec-update-change/SKILL.md",
  "openspec/config.yaml",
  "openspec/changes/establish-formal-rewrite-baseline/.openspec.yaml",
  manifestPath,
  "openspec/changes/establish-formal-rewrite-baseline/proposal.md",
  "openspec/changes/establish-formal-rewrite-baseline/design.md",
  taskPath,
  "openspec/changes/establish-formal-rewrite-baseline/specs/contracts-rewrite-baseline/spec.md",
  "tmp-formal-development/formal-development-master-plan.md",
].sort();
const digest = value =>
  crypto.createHash("sha256").update(value).digest("hex");
const normalizeTasks = value =>
  value
    .replace(/^(\s*-\s*)\[[ xX]\]/gm, "$1[ ]")
    .replace(
      /^FORMAL_APPROVAL_MANIFEST_SHA256=[0-9a-f]{64}$/m,
      "FORMAL_APPROVAL_MANIFEST_SHA256=<APPROVAL_MANIFEST_SHA256>",
    );
const fail = message => {
  process.stderr.write(`${message}\n`);
  process.exit(1);
};

const status = execFileSync(
  "git",
  [
    "status",
    "--porcelain=v1",
    "--ignored=matching",
    "--untracked-files=all",
  ],
  { encoding: "utf8" },
).trimEnd().split("\n").filter(Boolean).sort();
if (JSON.stringify(status) !== JSON.stringify(expectedStatus)) {
  fail(`unexpected exceptional-reseal state:\n${status.join("\n")}`);
}

for (const marker of [
  "MERGE_HEAD",
  "CHERRY_PICK_HEAD",
  "REVERT_HEAD",
  "BISECT_LOG",
  "AUTO_MERGE",
  "rebase-merge",
  "rebase-apply",
  "sequencer",
]) {
  const markerPath = execFileSync("git", ["rev-parse", "--git-path", marker], {
    encoding: "utf8",
  }).trim();
  if (fs.existsSync(markerPath)) fail(`in-progress Git operation: ${marker}`);
}

for (const relative of ["frontend/node_modules", "frontend/dist"]) {
  const absolute = path.join(root, relative);
  const stat = fs.lstatSync(absolute);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    fail(`${relative} is not a real directory`);
  }
  if (fs.realpathSync(absolute) !== absolute) {
    fail(`${relative} is not canonical`);
  }
  if (
    execFileSync("git", ["ls-files", "-z", "--", relative], {
      encoding: "utf8",
    }).length !== 0
  ) fail(`${relative} contains tracked files`);
}

const manifestBody = fs.readFileSync(manifestPath);
const tasks = fs.readFileSync(taskPath, "utf8");
const embedded = tasks.match(
  /^FORMAL_APPROVAL_MANIFEST_SHA256=([0-9a-f]{64})$/m,
)?.[1];
if (!embedded || digest(manifestBody) !== embedded) {
  fail("exceptional manifest whole-file digest differs");
}
const generatedCommandLines = tasks
  .split("\n")
  .filter(line => line.startsWith("rm -r"));
const approvedGeneratedCommand = "rm -r -- " + "\\";
if (
  generatedCommandLines.length !== 1 ||
  generatedCommandLines[0] !== approvedGeneratedCommand
) {
  fail("generated-tree command form differs");
}
const unchecked = tasks.match(/^\s*-\s*\[ \]/gm) ?? [];
const checked = tasks.match(/^\s*-\s*\[[xX]\]/gm) ?? [];
if (unchecked.length !== 23 || checked.length !== 0) {
  fail(
    `exceptional task state differs: unchecked=${unchecked.length}, checked=${checked.length}`,
  );
}
const manifest = JSON.parse(manifestBody);
for (const item of manifest.files) {
  const body = fs.readFileSync(item.path);
  const actual =
    item.path === taskPath
      ? digest(normalizeTasks(body.toString("utf8")))
      : digest(body);
  if (actual !== item.sha256) fail(`approval hash differs: ${item.path}`);
}
const oldDelta = execFileSync(
  "git",
  ["diff", "--no-renames", "--name-only", "-z", evidence, oldPlan],
  { encoding: "utf8" },
).split("\0").filter(Boolean).sort();
if (JSON.stringify(oldDelta) !== JSON.stringify(planningPaths)) {
  fail("old planning delta differs");
}
NODE

git diff --check
openspec validate establish-formal-rewrite-baseline \
  --type change \
  --strict \
  --json \
  --no-interactive
openspec doctor --json |
node -e '
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", chunk => input += chunk);
  process.stdin.on("end", () => {
    const value = JSON.parse(input);
    if (
      value.root?.path !== "/Users/luca/dev/BangumiStaffStats" ||
      value.root?.healthy !== true ||
      !Array.isArray(value.status) ||
      value.status.length !== 0
    ) process.exit(1);
  });
'

git add -- "${repair_paths[@]}"
git diff --cached --check

node <<'NODE'
const { execFileSync } = require("child_process");
const expected = [
  "openspec/changes/establish-formal-rewrite-baseline/.approval-manifest.json",
  "openspec/changes/establish-formal-rewrite-baseline/design.md",
  "openspec/changes/establish-formal-rewrite-baseline/proposal.md",
  "openspec/changes/establish-formal-rewrite-baseline/specs/contracts-rewrite-baseline/spec.md",
  "openspec/changes/establish-formal-rewrite-baseline/tasks.md",
  "tmp-formal-development/formal-development-master-plan.md",
].sort();
const actual = execFileSync(
  "git",
  ["diff", "--cached", "--no-renames", "--name-only", "-z"],
  { encoding: "utf8" },
).split("\0").filter(Boolean).sort();
if (JSON.stringify(actual) !== JSON.stringify(expected)) process.exit(1);
NODE

FORMAL_RESEALED_PLAN_TREE="$(git write-tree)"
git -c core.hooksPath=/dev/null commit --amend --no-edit
FORMAL_PLAN="$(git rev-parse HEAD)"

test "$FORMAL_PLAN" != "$FORMAL_OLD_PLAN"
test "$(git rev-parse "${FORMAL_PLAN}^{tree}")" = \
  "$FORMAL_RESEALED_PLAN_TREE"
test "$(
  git rev-list --parents -n 1 "$FORMAL_PLAN" |
  awk "{print NF}"
)" = 2
test "$(git rev-parse "${FORMAL_PLAN}^")" = "$FORMAL_EVIDENCE"
test "$(git show -s --format=%s "$FORMAL_PLAN")" = \
  "chore: approve formal rewrite baseline spec"
test "$(git rev-list --count "${FORMAL_ORACLE}..${FORMAL_PLAN}")" = 2
test -z "$(
  git for-each-ref \
    --format="%(refname)" \
    --points-at "$FORMAL_OLD_PLAN"
)"

node <<'NODE'
const { execFileSync } = require("child_process");
const evidence = "751958fc243f86891a4ad07e5e46760956b01b72";
const expected = [
  ".codex/skills/openspec-apply-change/SKILL.md",
  ".codex/skills/openspec-archive-change/SKILL.md",
  ".codex/skills/openspec-explore/SKILL.md",
  ".codex/skills/openspec-propose/SKILL.md",
  ".codex/skills/openspec-sync-specs/SKILL.md",
  ".codex/skills/openspec-update-change/SKILL.md",
  "openspec/config.yaml",
  "openspec/changes/establish-formal-rewrite-baseline/.openspec.yaml",
  "openspec/changes/establish-formal-rewrite-baseline/.approval-manifest.json",
  "openspec/changes/establish-formal-rewrite-baseline/proposal.md",
  "openspec/changes/establish-formal-rewrite-baseline/design.md",
  "openspec/changes/establish-formal-rewrite-baseline/tasks.md",
  "openspec/changes/establish-formal-rewrite-baseline/specs/contracts-rewrite-baseline/spec.md",
  "tmp-formal-development/formal-development-master-plan.md",
].sort();
const plan = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const delta = execFileSync(
  "git",
  ["diff", "--no-renames", "--name-only", "-z", evidence, plan],
  { encoding: "utf8" },
).split("\0").filter(Boolean).sort();
if (JSON.stringify(delta) !== JSON.stringify(expected)) process.exit(1);
const status = execFileSync(
  "git",
  [
    "status",
    "--porcelain=v1",
    "--ignored=matching",
    "--untracked-files=all",
  ],
  { encoding: "utf8" },
).trimEnd().split("\n").filter(Boolean).sort();
const expectedStatus = ["!! frontend/dist/", "!! frontend/node_modules/"].sort();
if (JSON.stringify(status) !== JSON.stringify(expectedStatus)) process.exit(1);
NODE

printf 'FORMAL_OLD_PLAN=%s\n' "$FORMAL_OLD_PLAN"
printf 'FORMAL_PLAN=%s\n' "$FORMAL_PLAN"
printf 'FORMAL_PLAN_TREE=%s\n' "$FORMAL_RESEALED_PLAN_TREE"
```

Generated-tree removal gate:

```zsh
set -euo pipefail

FORMAL_ROOT=/Users/luca/dev/BangumiStaffStats
test "$(git rev-parse --show-toplevel)" = "$FORMAL_ROOT"

node <<'NODE'
const { execFileSync, spawnSync } = require("child_process");
const expected = ["!! frontend/dist/", "!! frontend/node_modules/"].sort();
const fail = message => {
  process.stderr.write(`${message}\n`);
  process.exit(1);
};
if (execFileSync("git", ["branch", "--show-current"], {
  encoding: "utf8",
}).trim() !== "codex/formal-rewrite") fail("wrong branch");
if (spawnSync("git", ["diff", "--quiet"]).status !== 0) {
  fail("tracked worktree differs before generated deletion");
}
if (spawnSync("git", ["diff", "--cached", "--quiet"]).status !== 0) {
  fail("index differs before generated deletion");
}
const actual = execFileSync(
  "git",
  [
    "status",
    "--porcelain=v1",
    "--ignored=matching",
    "--untracked-files=all",
  ],
  { encoding: "utf8" },
).trim().split("\n").filter(Boolean).sort();
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  fail(`unexpected pre-deletion state:\n${actual.join("\n")}`);
}
NODE

node <<'NODE'
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const root = "/Users/luca/dev/BangumiStaffStats";
for (const relative of ["frontend/node_modules", "frontend/dist"]) {
  const absolute = path.join(root, relative);
  const stat = fs.lstatSync(absolute);
  if (!stat.isDirectory() || stat.isSymbolicLink()) process.exit(1);
  if (fs.realpathSync(absolute) !== absolute) process.exit(1);
  const tracked = execFileSync(
    "git",
    ["ls-files", "-z", "--", relative],
    { encoding: "utf8" },
  );
  if (tracked.length !== 0) process.exit(1);
}
NODE

rm -r -- \
  "$FORMAL_ROOT/frontend/node_modules" \
  "$FORMAL_ROOT/frontend/dist"

test ! -e "$FORMAL_ROOT/frontend/node_modules"
test ! -e "$FORMAL_ROOT/frontend/dist"

post_generated_status="$(
  git status \
    --porcelain=v1 \
    --ignored=matching \
    --untracked-files=all
)"
test -z "$post_generated_status"
```

## 3. Contracts owner — authority relocation and exact clean-room tree

- [x] 3.1 Re-run the approval-seal gate. Verify the formal branch, full supplemental-commit predicates, exact planning-approval commit delta, local prototype ref, clean index/worktree, and empty untracked/ignored status. This is the stage-specific preflight; do not rerun the obsolete initial manifest after approved mutations.
- [x] 3.2 Use `apply_patch` to move `docs/decisions/prototype-data-logic-audit.md` byte-for-byte to `tmp-formal-development/decisions/prototype-data-logic-audit.md`, change only the two active guide links to `./decisions/prototype-data-logic-audit.md`, and replace `.gitignore` with the exact content in the capability spec.
- [x] 3.3 Verify the moved audit blob, the exact expected blobs for both link-only guide edits, the exact `.gitignore` blob, unchanged retained authorities/frameworks, and the complete Impeccable oracle tree before broad cleanup.
- [x] 3.4 Re-run the approval-seal gate. Compute and print the tracked deletion complement using the exact allowlist. Exclude `docs/decisions/prototype-data-logic-audit.md` because its deletion is already satisfied by the move hunk. Review every remaining path and classify it mechanically: delete all 321 strict-UTF-8 regular targets with explicit `apply_patch` delete hunks; delete only the fixed 36-path binary/non-UTF-8 ledger with the exact non-recursive, non-forcing commands below, one literal path per `rm --`, after its per-path gate passes. Do not use `rm -f`, recursion, command-substitution or array targets, unresolved globs, `git rm`, `git clean`, or any path outside that fixed ledger.
- [x] 3.5 Walk the physical repository excluding `.git/**`; stop unless every remaining file or symlink matches the exact allowlist. Empty legacy directories do not affect Git, but no legacy content may remain inside them.
- [x] 3.6 Re-run the approval-seal gate, then stage the exact named additions/modifications and already reviewed deletion complement with path-scoped commands. Do not use `git add -A`, `git add -u`, broad pathspecs, or stage an unrelated path. Require zero unstaged, untracked, or ignored drift before final validation.

Post-planning status gate:

```zsh
set -euo pipefail

node <<'NODE'
const { execFileSync, spawnSync } = require("child_process");
const oracle = "644b7748674e553f863d0ffd61d029f86fdc0717";
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const fail = message => {
  process.stderr.write(`${message}\n`);
  process.exit(1);
};
const plan = git("rev-parse", "HEAD");
const evidence = git("rev-parse", `${plan}^`);

if (git("branch", "--show-current") !== "codex/formal-rewrite") {
  fail("wrong branch");
}
if (git("rev-parse", `${evidence}^`) !== oracle) {
  fail("evidence parent is not oracle");
}
if (
  git("rev-parse", "refs/heads/codex/person-workbench-unified-prototype") !==
  evidence
) {
  fail("prototype ref is not evidence commit");
}
if (git("show", "-s", "--format=%s", plan) !==
  "chore: approve formal rewrite baseline spec") {
  fail("planning commit subject differs");
}
const expectedPlanPaths = [
  ".codex/skills/openspec-apply-change/SKILL.md",
  ".codex/skills/openspec-archive-change/SKILL.md",
  ".codex/skills/openspec-explore/SKILL.md",
  ".codex/skills/openspec-propose/SKILL.md",
  ".codex/skills/openspec-sync-specs/SKILL.md",
  ".codex/skills/openspec-update-change/SKILL.md",
  "openspec/config.yaml",
  "openspec/changes/establish-formal-rewrite-baseline/.openspec.yaml",
  "openspec/changes/establish-formal-rewrite-baseline/.approval-manifest.json",
  "openspec/changes/establish-formal-rewrite-baseline/proposal.md",
  "openspec/changes/establish-formal-rewrite-baseline/design.md",
  "openspec/changes/establish-formal-rewrite-baseline/tasks.md",
  "openspec/changes/establish-formal-rewrite-baseline/specs/contracts-rewrite-baseline/spec.md",
  "tmp-formal-development/formal-development-master-plan.md",
].sort();
const actualPlanPaths = execFileSync(
  "git",
  ["diff-tree", "--no-commit-id", "--name-only", "-r", "-z", plan],
  { encoding: "utf8" },
).split("\0").filter(Boolean).sort();
if (JSON.stringify(actualPlanPaths) !== JSON.stringify(expectedPlanPaths)) {
  fail("planning commit path set differs");
}

const actual = execFileSync(
  "git",
  [
    "status",
    "--porcelain=v1",
    "--ignored=matching",
    "--untracked-files=all",
  ],
  { encoding: "utf8" },
).trim().split("\n").filter(Boolean).sort();

if (actual.length !== 0) fail(`unexpected post-planning status:\n${actual.join("\n")}`);
NODE
```

Relocation and exact-content gates:

```zsh
set -euo pipefail

FORMAL_ORACLE=644b7748674e553f863d0ffd61d029f86fdc0717

test "$(git hash-object \
  tmp-formal-development/decisions/prototype-data-logic-audit.md)" = \
  28fb89d29e2b7f58677d7be17c7c6acbca9db849
test "$(git hash-object \
  tmp-formal-development/data-logic-implementation-guide.md)" = \
  64d43ac002f4ace17c91ddd2fde031c11aa2bd6c
test "$(git hash-object \
  tmp-formal-development/frontend-production-cleanup-and-architecture-plan.md)" = \
  7bcd686b2249c9c256109fcb72a4a19b7ec9c452
test "$(git hash-object .gitignore)" = \
  aa5f57b075141668fb5252d3bd19b5643c38439d

git diff --quiet "$FORMAL_ORACLE" -- \
  LICENSE \
  PRODUCT.md \
  DESIGN.md \
  .agents/skills/impeccable \
  .codex/hooks.json \
  .impeccable/design.json \
  tmp-formal-development/backend-development-implementation-guide.md \
  tmp-formal-development/backend-operations-implementation-guide.md
```

Second and final exceptional pre-amend seal and planning-checkpoint
replacement. This block is authorized only because the explicit
tracked-complement `apply_patch` failed during verification on binary/non-UTF-8
content, changed none of the 357 complement targets, and left the index empty.
It MUST run with the exact five-path cleanup preparation still unstaged and the
generated directories still absent. After it passes, re-run the complete normal
**Approval-seal gate** verbatim and require it to pass against the replacement
planning commit before re-running the deletion-complement printer:

```zsh
set -euo pipefail

FORMAL_ROOT=/Users/luca/dev/BangumiStaffStats
FORMAL_ORACLE=644b7748674e553f863d0ffd61d029f86fdc0717
FORMAL_EVIDENCE=751958fc243f86891a4ad07e5e46760956b01b72
FORMAL_OLD_PLAN=df257264ca1f2fc02a9421e2fcf4e9fdd557bc80
FORMAL_OLD_PLAN_TREE=9042b8c40fb8ca0e33f0a855b3aa6d4a8e47170f
FORMAL_OLD_MANIFEST_SHA256=fe8a9890edffb0b542a0cec35d2c6208c461a8e4543dcc96945b558936d1f083
FORMAL_MANIFEST=openspec/changes/establish-formal-rewrite-baseline/.approval-manifest.json
FORMAL_TASKS=openspec/changes/establish-formal-rewrite-baseline/tasks.md

repair_paths=(
  openspec/changes/establish-formal-rewrite-baseline/.approval-manifest.json
  openspec/changes/establish-formal-rewrite-baseline/proposal.md
  openspec/changes/establish-formal-rewrite-baseline/design.md
  openspec/changes/establish-formal-rewrite-baseline/tasks.md
  openspec/changes/establish-formal-rewrite-baseline/specs/contracts-rewrite-baseline/spec.md
  tmp-formal-development/formal-development-master-plan.md
)

test "$(git rev-parse --show-toplevel)" = "$FORMAL_ROOT"
test "$(git branch --show-current)" = codex/formal-rewrite
test "$(git rev-parse HEAD)" = "$FORMAL_OLD_PLAN"
test "$(git rev-parse "${FORMAL_OLD_PLAN}^{tree}")" = \
  "$FORMAL_OLD_PLAN_TREE"
test "$(
  git rev-list --parents -n 1 "$FORMAL_OLD_PLAN" |
  awk "{print NF}"
)" = 2
test "$(git rev-parse "${FORMAL_OLD_PLAN}^")" = "$FORMAL_EVIDENCE"
test "$(git rev-parse "${FORMAL_EVIDENCE}^")" = "$FORMAL_ORACLE"
test "$(git show -s --format=%s "$FORMAL_OLD_PLAN")" = \
  "chore: approve formal rewrite baseline spec"
test "$(git rev-parse \
  refs/heads/codex/person-workbench-unified-prototype)" = "$FORMAL_EVIDENCE"
test "$(
  git for-each-ref \
    --format="%(refname)" \
    --points-at "$FORMAL_OLD_PLAN"
)" = refs/heads/codex/formal-rewrite
git diff --cached --quiet

test "$(
  git show "${FORMAL_OLD_PLAN}:${FORMAL_TASKS}" |
  sed -n \
    "s/^FORMAL_APPROVAL_MANIFEST_SHA256=//p"
)" = "$FORMAL_OLD_MANIFEST_SHA256"

test ! -e frontend/node_modules
test ! -e frontend/dist
test "$(git hash-object \
  tmp-formal-development/decisions/prototype-data-logic-audit.md)" = \
  28fb89d29e2b7f58677d7be17c7c6acbca9db849
test "$(git hash-object \
  tmp-formal-development/data-logic-implementation-guide.md)" = \
  64d43ac002f4ace17c91ddd2fde031c11aa2bd6c
test "$(git hash-object \
  tmp-formal-development/frontend-production-cleanup-and-architecture-plan.md)" = \
  7bcd686b2249c9c256109fcb72a4a19b7ec9c452
test "$(git hash-object .gitignore)" = \
  aa5f57b075141668fb5252d3bd19b5643c38439d

node <<'NODE'
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { TextDecoder } = require("util");

const root = "/Users/luca/dev/BangumiStaffStats";
const oldPlan = "df257264ca1f2fc02a9421e2fcf4e9fdd557bc80";
const evidence = "751958fc243f86891a4ad07e5e46760956b01b72";
const manifestPath =
  "openspec/changes/establish-formal-rewrite-baseline/.approval-manifest.json";
const taskPath =
  "openspec/changes/establish-formal-rewrite-baseline/tasks.md";
const relocationSource = "docs/decisions/prototype-data-logic-audit.md";
const allow = /^(\.gitignore|LICENSE|PRODUCT\.md|DESIGN\.md|\.codex\/hooks\.json|\.codex\/skills\/openspec-(apply-change|archive-change|explore|propose|sync-specs|update-change)\/SKILL\.md|\.agents\/skills\/impeccable\/.+|\.impeccable\/design\.json|tmp-formal-development\/(backend-development-implementation-guide|backend-operations-implementation-guide|data-logic-implementation-guide|frontend-production-cleanup-and-architecture-plan|formal-development-master-plan)\.md|tmp-formal-development\/decisions\/prototype-data-logic-audit\.md|openspec\/config\.yaml|openspec\/changes\/establish-formal-rewrite-baseline\/(\.openspec\.yaml|\.approval-manifest\.json|proposal\.md|design\.md|tasks\.md|specs\/contracts-rewrite-baseline\/spec\.md))$/;
const expectedStatus = [
  " M .gitignore",
  " D docs/decisions/prototype-data-logic-audit.md",
  " M openspec/changes/establish-formal-rewrite-baseline/.approval-manifest.json",
  " M openspec/changes/establish-formal-rewrite-baseline/design.md",
  " M openspec/changes/establish-formal-rewrite-baseline/proposal.md",
  " M openspec/changes/establish-formal-rewrite-baseline/specs/contracts-rewrite-baseline/spec.md",
  " M openspec/changes/establish-formal-rewrite-baseline/tasks.md",
  " M tmp-formal-development/data-logic-implementation-guide.md",
  " M tmp-formal-development/formal-development-master-plan.md",
  " M tmp-formal-development/frontend-production-cleanup-and-architecture-plan.md",
  "?? tmp-formal-development/decisions/prototype-data-logic-audit.md",
].sort();
const planningPaths = [
  ".codex/skills/openspec-apply-change/SKILL.md",
  ".codex/skills/openspec-archive-change/SKILL.md",
  ".codex/skills/openspec-explore/SKILL.md",
  ".codex/skills/openspec-propose/SKILL.md",
  ".codex/skills/openspec-sync-specs/SKILL.md",
  ".codex/skills/openspec-update-change/SKILL.md",
  "openspec/config.yaml",
  "openspec/changes/establish-formal-rewrite-baseline/.openspec.yaml",
  manifestPath,
  "openspec/changes/establish-formal-rewrite-baseline/proposal.md",
  "openspec/changes/establish-formal-rewrite-baseline/design.md",
  taskPath,
  "openspec/changes/establish-formal-rewrite-baseline/specs/contracts-rewrite-baseline/spec.md",
  "tmp-formal-development/formal-development-master-plan.md",
].sort();
const digest = value =>
  crypto.createHash("sha256").update(value).digest("hex");
const normalizeTasks = value =>
  value
    .replace(/^(\s*-\s*)\[[ xX]\]/gm, "$1[ ]")
    .replace(
      /^FORMAL_APPROVAL_MANIFEST_SHA256=[0-9a-f]{64}$/m,
      "FORMAL_APPROVAL_MANIFEST_SHA256=<APPROVAL_MANIFEST_SHA256>",
    );
const fail = message => {
  process.stderr.write(`${message}\n`);
  process.exit(1);
};

const status = execFileSync(
  "git",
  [
    "status",
    "--porcelain=v1",
    "--ignored=matching",
    "--untracked-files=all",
  ],
  { encoding: "utf8" },
).trimEnd().split("\n").filter(Boolean).sort();
if (JSON.stringify(status) !== JSON.stringify(expectedStatus)) {
  fail(`unexpected second-reseal state:\n${status.join("\n")}`);
}

for (const marker of [
  "MERGE_HEAD",
  "CHERRY_PICK_HEAD",
  "REVERT_HEAD",
  "BISECT_LOG",
  "AUTO_MERGE",
  "rebase-merge",
  "rebase-apply",
  "sequencer",
]) {
  const markerPath = execFileSync("git", ["rev-parse", "--git-path", marker], {
    encoding: "utf8",
  }).trim();
  if (fs.existsSync(markerPath)) fail(`in-progress Git operation: ${marker}`);
}

const manifestBody = fs.readFileSync(manifestPath);
const tasks = fs.readFileSync(taskPath, "utf8");
const embedded = tasks.match(
  /^FORMAL_APPROVAL_MANIFEST_SHA256=([0-9a-f]{64})$/m,
)?.[1];
if (!embedded || digest(manifestBody) !== embedded) {
  fail("second exceptional manifest whole-file digest differs");
}
const unchecked = tasks.match(/^\s*-\s*\[ \]/gm) ?? [];
const checked = tasks.match(/^\s*-\s*\[[xX]\]/gm) ?? [];
if (unchecked.length !== 23 || checked.length !== 0) {
  fail(
    `second exceptional task state differs: unchecked=${unchecked.length}, checked=${checked.length}`,
  );
}
const manifest = JSON.parse(manifestBody);
for (const item of manifest.files) {
  const body = fs.readFileSync(item.path);
  const actual =
    item.path === taskPath
      ? digest(normalizeTasks(body.toString("utf8")))
      : digest(body);
  if (actual !== item.sha256) fail(`approval hash differs: ${item.path}`);
}

const oldDelta = execFileSync(
  "git",
  ["diff", "--no-renames", "--name-only", "-z", evidence, oldPlan],
  { encoding: "utf8" },
).split("\0").filter(Boolean).sort();
if (JSON.stringify(oldDelta) !== JSON.stringify(planningPaths)) {
  fail("old planning delta differs");
}

const indexEntries = new Map();
for (const record of execFileSync("git", ["ls-files", "--stage", "-z"], {
  encoding: "utf8",
}).split("\0").filter(Boolean)) {
  const match = record.match(/^([0-7]{6}) ([0-9a-f]{40}) 0\t(.+)$/s);
  if (!match) fail(`unexpected index entry: ${record}`);
  indexEntries.set(match[3], { mode: match[1], blob: match[2] });
}
const tracked = [...indexEntries.keys()].sort();
const complement = tracked
  .filter(file => !allow.test(file) && file !== relocationSource)
  .sort();
if (tracked.length !== 487 || complement.length !== 357) {
  fail(`tracked/complement count differs: ${tracked.length}/${complement.length}`);
}
if (fs.existsSync(relocationSource)) fail("relocation source still exists");

const strictUtf8 = [];
const binary = [];
const binaryRecords = [];
let binaryBytes = 0;
for (const relative of complement) {
  const absolute = path.join(root, relative);
  const stat = fs.lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    fail(`non-regular complement target: ${relative}`);
  }
  if (fs.realpathSync(absolute) !== absolute) {
    fail(`non-canonical complement target: ${relative}`);
  }
  const entry = indexEntries.get(relative);
  if (entry.mode !== "100644") fail(`mode differs: ${relative}`);
  const actualBlob = execFileSync("git", ["hash-object", "--", relative], {
    encoding: "utf8",
  }).trim();
  if (actualBlob !== entry.blob) fail(`worktree blob differs: ${relative}`);
  const body = fs.readFileSync(absolute);
  let isStrictUtf8 = !body.includes(0);
  if (isStrictUtf8) {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(body);
    } catch {
      isStrictUtf8 = false;
    }
  }
  if (isStrictUtf8) {
    strictUtf8.push(relative);
  } else {
    binary.push(relative);
    binaryBytes += body.length;
    binaryRecords.push(
      `${relative}\t${entry.mode}\t${entry.blob}\t${digest(body)}\t${body.length}\n`,
    );
  }
}

if (strictUtf8.length !== 321 || binary.length !== 36) {
  fail(`classification differs: ${strictUtf8.length}/${binary.length}`);
}
const pathDigest = values => digest(`${values.join("\n")}\n`);
if (
  pathDigest(complement) !==
  "3cce8d63442d65dd582ceafc3e1bf6f319cde029e3c1a603f8fd13972d50e2d6"
) fail("complement path digest differs");
if (
  pathDigest(strictUtf8) !==
  "bd74c64de136470358054c12d58f32967d94571271cc13fc4493b7bfb0f26e5d"
) fail("strict UTF-8 path digest differs");
if (
  binaryBytes !== 41539482 ||
  digest(binaryRecords.join("")) !==
    "e84c3cbb9ecb79d2afd7cafb16de44602ca20a7ccf05dcd0ae82e3b3ac7fcb49"
) fail("binary ledger digest differs");
NODE

git diff --check
openspec validate establish-formal-rewrite-baseline \
  --type change \
  --strict \
  --json \
  --no-interactive
openspec doctor --json |
node -e '
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", chunk => input += chunk);
  process.stdin.on("end", () => {
    const value = JSON.parse(input);
    if (
      value.root?.path !== "/Users/luca/dev/BangumiStaffStats" ||
      value.root?.healthy !== true ||
      !Array.isArray(value.status) ||
      value.status.length !== 0
    ) process.exit(1);
  });
'

git add -- "${repair_paths[@]}"
git diff --cached --check

node <<'NODE'
const { execFileSync } = require("child_process");
const expected = [
  "openspec/changes/establish-formal-rewrite-baseline/.approval-manifest.json",
  "openspec/changes/establish-formal-rewrite-baseline/design.md",
  "openspec/changes/establish-formal-rewrite-baseline/proposal.md",
  "openspec/changes/establish-formal-rewrite-baseline/specs/contracts-rewrite-baseline/spec.md",
  "openspec/changes/establish-formal-rewrite-baseline/tasks.md",
  "tmp-formal-development/formal-development-master-plan.md",
].sort();
const actual = execFileSync(
  "git",
  ["diff", "--cached", "--no-renames", "--name-only", "-z"],
  { encoding: "utf8" },
).split("\0").filter(Boolean).sort();
if (JSON.stringify(actual) !== JSON.stringify(expected)) process.exit(1);
NODE

FORMAL_RESEALED_PLAN_TREE="$(git write-tree)"
git -c core.hooksPath=/dev/null commit --amend --no-edit
FORMAL_PLAN="$(git rev-parse HEAD)"

test "$FORMAL_PLAN" != "$FORMAL_OLD_PLAN"
test "$(git rev-parse "${FORMAL_PLAN}^{tree}")" = \
  "$FORMAL_RESEALED_PLAN_TREE"
test "$(
  git rev-list --parents -n 1 "$FORMAL_PLAN" |
  awk "{print NF}"
)" = 2
test "$(git rev-parse "${FORMAL_PLAN}^")" = "$FORMAL_EVIDENCE"
test "$(git show -s --format=%s "$FORMAL_PLAN")" = \
  "chore: approve formal rewrite baseline spec"
test "$(git rev-list --count "${FORMAL_ORACLE}..${FORMAL_PLAN}")" = 2
test -z "$(
  git for-each-ref \
    --format="%(refname)" \
    --points-at "$FORMAL_OLD_PLAN"
)"
git diff --cached --quiet

node <<'NODE'
const { execFileSync } = require("child_process");
const evidence = "751958fc243f86891a4ad07e5e46760956b01b72";
const expectedPlanPaths = [
  ".codex/skills/openspec-apply-change/SKILL.md",
  ".codex/skills/openspec-archive-change/SKILL.md",
  ".codex/skills/openspec-explore/SKILL.md",
  ".codex/skills/openspec-propose/SKILL.md",
  ".codex/skills/openspec-sync-specs/SKILL.md",
  ".codex/skills/openspec-update-change/SKILL.md",
  "openspec/config.yaml",
  "openspec/changes/establish-formal-rewrite-baseline/.openspec.yaml",
  "openspec/changes/establish-formal-rewrite-baseline/.approval-manifest.json",
  "openspec/changes/establish-formal-rewrite-baseline/proposal.md",
  "openspec/changes/establish-formal-rewrite-baseline/design.md",
  "openspec/changes/establish-formal-rewrite-baseline/tasks.md",
  "openspec/changes/establish-formal-rewrite-baseline/specs/contracts-rewrite-baseline/spec.md",
  "tmp-formal-development/formal-development-master-plan.md",
].sort();
const expectedStatus = [
  " M .gitignore",
  " D docs/decisions/prototype-data-logic-audit.md",
  " M tmp-formal-development/data-logic-implementation-guide.md",
  " M tmp-formal-development/frontend-production-cleanup-and-architecture-plan.md",
  "?? tmp-formal-development/decisions/prototype-data-logic-audit.md",
].sort();
const plan = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const delta = execFileSync(
  "git",
  ["diff", "--no-renames", "--name-only", "-z", evidence, plan],
  { encoding: "utf8" },
).split("\0").filter(Boolean).sort();
if (JSON.stringify(delta) !== JSON.stringify(expectedPlanPaths)) process.exit(1);
const status = execFileSync(
  "git",
  [
    "status",
    "--porcelain=v1",
    "--ignored=matching",
    "--untracked-files=all",
  ],
  { encoding: "utf8" },
).trimEnd().split("\n").filter(Boolean).sort();
if (JSON.stringify(status) !== JSON.stringify(expectedStatus)) process.exit(1);
NODE

printf 'FORMAL_OLD_PLAN=%s\n' "$FORMAL_OLD_PLAN"
printf 'FORMAL_PLAN=%s\n' "$FORMAL_PLAN"
printf 'FORMAL_PLAN_TREE=%s\n' "$FORMAL_RESEALED_PLAN_TREE"
```

Deletion-complement printer:

```zsh
set -euo pipefail

node <<'NODE'
const { execFileSync } = require("child_process");
const allow = /^(\.gitignore|LICENSE|PRODUCT\.md|DESIGN\.md|\.codex\/hooks\.json|\.codex\/skills\/openspec-(apply-change|archive-change|explore|propose|sync-specs|update-change)\/SKILL\.md|\.agents\/skills\/impeccable\/.+|\.impeccable\/design\.json|tmp-formal-development\/(backend-development-implementation-guide|backend-operations-implementation-guide|data-logic-implementation-guide|frontend-production-cleanup-and-architecture-plan|formal-development-master-plan)\.md|tmp-formal-development\/decisions\/prototype-data-logic-audit\.md|openspec\/config\.yaml|openspec\/changes\/establish-formal-rewrite-baseline\/(\.openspec\.yaml|\.approval-manifest\.json|proposal\.md|design\.md|tasks\.md|specs\/contracts-rewrite-baseline\/spec\.md))$/;
const tracked = execFileSync("git", ["ls-files", "-z"], {
  encoding: "utf8",
}).split("\0").filter(Boolean);
const relocationSource = "docs/decisions/prototype-data-logic-audit.md";
if (require("fs").existsSync(relocationSource)) {
  process.stderr.write("audit relocation source still exists\n");
  process.exit(1);
}
const deletions = tracked
  .filter(file => !allow.test(file) && file !== relocationSource)
  .sort();
if (deletions.length === 0) {
  process.stderr.write("deletion complement is unexpectedly empty\n");
  process.exit(1);
}
process.stdout.write(`${deletions.join("\n")}\n`);
NODE
```

Binary/non-UTF-8 ledger preflight. The 36 literal `/bin/rm --` commands in the
later block are themselves the fixed path ledger; this preflight extracts those
literals from this sealed task file and proves that they are exactly the
non-strict-UTF-8 members of the unchanged 357-path complement. Run it before
applying any text deletion:

```zsh
set -euo pipefail

node <<'NODE'
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { TextDecoder } = require("util");

const root = "/Users/luca/dev/BangumiStaffStats";
const taskPath =
  "openspec/changes/establish-formal-rewrite-baseline/tasks.md";
const relocationSource = "docs/decisions/prototype-data-logic-audit.md";
const allow = /^(\.gitignore|LICENSE|PRODUCT\.md|DESIGN\.md|\.codex\/hooks\.json|\.codex\/skills\/openspec-(apply-change|archive-change|explore|propose|sync-specs|update-change)\/SKILL\.md|\.agents\/skills\/impeccable\/.+|\.impeccable\/design\.json|tmp-formal-development\/(backend-development-implementation-guide|backend-operations-implementation-guide|data-logic-implementation-guide|frontend-production-cleanup-and-architecture-plan|formal-development-master-plan)\.md|tmp-formal-development\/decisions\/prototype-data-logic-audit\.md|openspec\/config\.yaml|openspec\/changes\/establish-formal-rewrite-baseline\/(\.openspec\.yaml|\.approval-manifest\.json|proposal\.md|design\.md|tasks\.md|specs\/contracts-rewrite-baseline\/spec\.md))$/;
const digest = value =>
  crypto.createHash("sha256").update(value).digest("hex");
const fail = message => {
  process.stderr.write(`${message}\n`);
  process.exit(1);
};
const taskBody = fs.readFileSync(taskPath, "utf8");
const literalBinaryPaths = [
  ...taskBody.matchAll(/^\/bin\/rm -- '([^'\n]+)'$/gm),
].map(match => match[1]);
if (
  literalBinaryPaths.length !== 36 ||
  new Set(literalBinaryPaths).size !== 36 ||
  literalBinaryPaths.some(value => /[\u0000-\u001f\u007f]/.test(value))
) fail("literal binary ledger differs");

const indexEntries = new Map();
for (const record of execFileSync("git", ["ls-files", "--stage", "-z"], {
  encoding: "utf8",
}).split("\0").filter(Boolean)) {
  const match = record.match(/^([0-7]{6}) ([0-9a-f]{40}) 0\t(.+)$/s);
  if (!match) fail(`unexpected index entry: ${record}`);
  indexEntries.set(match[3], { mode: match[1], blob: match[2] });
}
const tracked = [...indexEntries.keys()].sort();
const complement = tracked
  .filter(file => !allow.test(file) && file !== relocationSource)
  .sort();
if (tracked.length !== 487 || complement.length !== 357) {
  fail(`tracked/complement count differs: ${tracked.length}/${complement.length}`);
}

const classify = (relative, body) => {
  if (relative === ".superpowers/.DS_Store") {
    if (
      !body.subarray(0, 4).equals(Buffer.from([0x00, 0x00, 0x00, 0x01])) ||
      body.subarray(4, 8).toString("ascii") !== "Bud1"
    ) {
      fail("DS Store magic differs");
    }
    return "Apple DS Store";
  }
  if (relative.endsWith(".ttf")) {
    const magic = body.subarray(0, 4);
    if (
      !magic.equals(Buffer.from([0x00, 0x01, 0x00, 0x00])) &&
      magic.toString("ascii") !== "OTTO"
    ) fail(`TrueType magic differs: ${relative}`);
    return "TrueType";
  }
  if (relative.endsWith("/LICENSE.txt")) {
    if (!body.includes(0)) fail("NUL-containing license differs");
    return "NUL-containing data";
  }
  if (relative.endsWith(".woff2")) {
    if (body.subarray(0, 4).toString("ascii") !== "wOF2") {
      fail("WOFF2 magic differs");
    }
    return "WOFF2";
  }
  if (relative.startsWith("artifacts/")) {
    if (!body.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
      fail(`JPEG magic differs: ${relative}`);
    }
    return "JPEG";
  }
  if (relative.startsWith("frontend/public/")) {
    if (
      !body.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      )
    ) fail(`PNG magic differs: ${relative}`);
    return "PNG";
  }
  fail(`unclassified binary path: ${relative}`);
};

const strictUtf8 = [];
const binary = [];
const recordsWithType = [];
const recordsWithoutType = [];
let binaryBytes = 0;
for (const relative of complement) {
  const absolute = path.join(root, relative);
  const stat = fs.lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    fail(`non-regular complement target: ${relative}`);
  }
  if (fs.realpathSync(absolute) !== absolute) {
    fail(`non-canonical complement target: ${relative}`);
  }
  fs.accessSync(path.dirname(absolute), fs.constants.W_OK);
  const entry = indexEntries.get(relative);
  if (entry.mode !== "100644") fail(`mode differs: ${relative}`);
  const actualBlob = execFileSync("git", ["hash-object", "--", relative], {
    encoding: "utf8",
  }).trim();
  if (actualBlob !== entry.blob) fail(`worktree blob differs: ${relative}`);
  const body = fs.readFileSync(absolute);
  let isStrictUtf8 = !body.includes(0);
  if (isStrictUtf8) {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(body);
    } catch {
      isStrictUtf8 = false;
    }
  }
  if (isStrictUtf8) {
    strictUtf8.push(relative);
  } else {
    const type = classify(relative, body);
    const sha256 = digest(body);
    binary.push(relative);
    binaryBytes += body.length;
    recordsWithType.push(
      `${relative}\t${entry.mode}\t${entry.blob}\t${sha256}\t${type}\t${body.length}\n`,
    );
    recordsWithoutType.push(
      `${relative}\t${entry.mode}\t${entry.blob}\t${sha256}\t${body.length}\n`,
    );
  }
}

if (
  strictUtf8.length !== 321 ||
  binary.length !== 36 ||
  JSON.stringify(binary) !==
    JSON.stringify([...literalBinaryPaths].sort())
) fail("literal ledger does not equal binary classification");
const pathDigest = values => digest(`${values.join("\n")}\n`);
if (
  pathDigest(complement) !==
    "3cce8d63442d65dd582ceafc3e1bf6f319cde029e3c1a603f8fd13972d50e2d6" ||
  pathDigest(strictUtf8) !==
    "bd74c64de136470358054c12d58f32967d94571271cc13fc4493b7bfb0f26e5d"
) fail("complement classification path digest differs");
if (
  binaryBytes !== 41539482 ||
  digest(recordsWithType.join("")) !==
    "65e1527f33080a068a74e39e299bf741fee00d70a989315708224b536e2f0126" ||
  digest(recordsWithoutType.join("")) !==
    "e84c3cbb9ecb79d2afd7cafb16de44602ca20a7ccf05dcd0ae82e3b3ac7fcb49"
) fail("binary ledger metadata digest differs");

process.stdout.write(`${recordsWithType.join("")}`);
NODE

git diff --cached --quiet
```

After that preflight passes, the apply subagent MUST use explicit
`apply_patch` delete hunks for exactly the 321 strict-UTF-8 paths. It MUST
recompute the strict path set and require that all 321 are absent while all 36
ledger paths still exist and match the index before running this block. Each
`/bin/rm` invocation below has exactly one sealed literal target:

```zsh
set -euo pipefail

node <<'NODE'
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { TextDecoder } = require("util");

const root = "/Users/luca/dev/BangumiStaffStats";
const taskPath =
  "openspec/changes/establish-formal-rewrite-baseline/tasks.md";
const relocationSource = "docs/decisions/prototype-data-logic-audit.md";
const allow = /^(\.gitignore|LICENSE|PRODUCT\.md|DESIGN\.md|\.codex\/hooks\.json|\.codex\/skills\/openspec-(apply-change|archive-change|explore|propose|sync-specs|update-change)\/SKILL\.md|\.agents\/skills\/impeccable\/.+|\.impeccable\/design\.json|tmp-formal-development\/(backend-development-implementation-guide|backend-operations-implementation-guide|data-logic-implementation-guide|frontend-production-cleanup-and-architecture-plan|formal-development-master-plan)\.md|tmp-formal-development\/decisions\/prototype-data-logic-audit\.md|openspec\/config\.yaml|openspec\/changes\/establish-formal-rewrite-baseline\/(\.openspec\.yaml|\.approval-manifest\.json|proposal\.md|design\.md|tasks\.md|specs\/contracts-rewrite-baseline\/spec\.md))$/;
const digest = value =>
  crypto.createHash("sha256").update(value).digest("hex");
const fail = message => {
  process.stderr.write(`${message}\n`);
  process.exit(1);
};
const literalBinaryPaths = [
  ...fs.readFileSync(taskPath, "utf8")
    .matchAll(/^\/bin\/rm -- '([^'\n]+)'$/gm),
].map(match => match[1]).sort();
if (
  literalBinaryPaths.length !== 36 ||
  new Set(literalBinaryPaths).size !== 36
) fail("literal binary ledger differs before removal");

const indexEntries = new Map();
for (const record of execFileSync("git", ["ls-files", "--stage", "-z"], {
  encoding: "utf8",
}).split("\0").filter(Boolean)) {
  const match = record.match(/^([0-7]{6}) ([0-9a-f]{40}) 0\t(.+)$/s);
  if (!match) fail(`unexpected index entry: ${record}`);
  indexEntries.set(match[3], { mode: match[1], blob: match[2] });
}
const complement = [...indexEntries.keys()]
  .filter(file => !allow.test(file) && file !== relocationSource)
  .sort();
const present = complement.filter(relative =>
  fs.existsSync(path.join(root, relative)),
).sort();
const absent = complement.filter(relative =>
  !fs.existsSync(path.join(root, relative)),
).sort();
if (
  complement.length !== 357 ||
  present.length !== 36 ||
  absent.length !== 321 ||
  JSON.stringify(present) !== JSON.stringify(literalBinaryPaths)
) fail("text/binary deletion partition differs");
if (
  digest(`${absent.join("\n")}\n`) !==
  "bd74c64de136470358054c12d58f32967d94571271cc13fc4493b7bfb0f26e5d"
) fail("deleted strict UTF-8 path digest differs");

const records = [];
let bytes = 0;
for (const relative of present) {
  const absolute = path.join(root, relative);
  const stat = fs.lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    fail(`non-regular binary target: ${relative}`);
  }
  if (fs.realpathSync(absolute) !== absolute) {
    fail(`non-canonical binary target: ${relative}`);
  }
  fs.accessSync(path.dirname(absolute), fs.constants.W_OK);
  const entry = indexEntries.get(relative);
  const body = fs.readFileSync(absolute);
  let decoded = !body.includes(0);
  if (decoded) {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(body);
    } catch {
      decoded = false;
    }
  }
  if (decoded) fail(`binary target became strict UTF-8: ${relative}`);
  const actualBlob = execFileSync("git", ["hash-object", "--", relative], {
    encoding: "utf8",
  }).trim();
  if (entry.mode !== "100644" || actualBlob !== entry.blob) {
    fail(`binary target differs from index: ${relative}`);
  }
  bytes += body.length;
  records.push(
    `${relative}\t${entry.mode}\t${entry.blob}\t${digest(body)}\t${body.length}\n`,
  );
}
if (
  bytes !== 41539482 ||
  digest(records.join("")) !==
    "e84c3cbb9ecb79d2afd7cafb16de44602ca20a7ccf05dcd0ae82e3b3ac7fcb49"
) fail("binary target metadata differs before removal");

const deleted = execFileSync(
  "git",
  ["diff", "--no-renames", "--name-only", "-z", "--diff-filter=D"],
  { encoding: "utf8" },
).split("\0").filter(Boolean).sort();
if (
  deleted.length !== 322 ||
  !deleted.includes(relocationSource) ||
  digest(
    `${deleted.filter(value => value !== relocationSource).join("\n")}\n`,
  ) !== "bd74c64de136470358054c12d58f32967d94571271cc13fc4493b7bfb0f26e5d"
) fail("pre-binary deletion set differs");
NODE

git diff --cached --quiet

/bin/rm -- '.superpowers/.DS_Store'
/bin/rm -- '.superpowers/concepts/fonts/harmonyos-sans-sc/HarmonyOS_Sans_SC_Bold.ttf'
/bin/rm -- '.superpowers/concepts/fonts/harmonyos-sans-sc/HarmonyOS_Sans_SC_Medium.ttf'
/bin/rm -- '.superpowers/concepts/fonts/harmonyos-sans-sc/HarmonyOS_Sans_SC_Regular.ttf'
/bin/rm -- '.superpowers/concepts/fonts/harmonyos-sans-sc/LICENSE.txt'
/bin/rm -- '.superpowers/concepts/fonts/source-han-sans/SourceHanSansSC-VF.otf.woff2'
/bin/rm -- 'artifacts/person-card-audit-2026-07-21/01-six-people-1024-baseline.png'
/bin/rm -- 'artifacts/person-card-audit-2026-07-21/02-five-people-1024-baseline.png'
/bin/rm -- 'artifacts/person-card-audit-2026-07-21/03-four-people-1024-baseline.png'
/bin/rm -- 'artifacts/person-card-audit-2026-07-21/04-three-people-1024-baseline.png'
/bin/rm -- 'artifacts/person-card-audit-2026-07-21/05-three-people-406-baseline.png'
/bin/rm -- 'artifacts/person-card-audit-2026-07-21/06-six-people-2560-baseline.png'
/bin/rm -- 'artifacts/person-card-audit-2026-07-21/07-three-people-1024-final.png'
/bin/rm -- 'artifacts/person-card-audit-2026-07-21/08-five-people-1024-final.png'
/bin/rm -- 'artifacts/person-card-audit-2026-07-21/09-six-people-1024-final.png'
/bin/rm -- 'artifacts/person-card-audit-2026-07-21/10-four-people-1024-final.png'
/bin/rm -- 'artifacts/person-card-audit-2026-07-21/11-six-people-2560-final.png'
/bin/rm -- 'artifacts/person-card-audit-2026-07-21/12-six-people-406-final.png'
/bin/rm -- 'artifacts/person-card-audit-2026-07-21/13-three-people-406-final.png'
/bin/rm -- 'artifacts/person-card-audit-2026-07-21/14-three-people-320-final.jpg'
/bin/rm -- 'artifacts/person-card-audit-2026-07-21/15-six-people-1024-final.jpg'
/bin/rm -- 'artifacts/person-card-audit-2026-07-21/16-five-people-before-after-comparison.jpg'
/bin/rm -- 'artifacts/person-card-audit-2026-07-21/17-five-people-1024-final.jpg'
/bin/rm -- 'artifacts/person-card-audit-2026-07-21/18-five-people-2560-final.jpg'
/bin/rm -- 'artifacts/person-card-audit-2026-07-21/19-three-people-1024-final.jpg'
/bin/rm -- 'artifacts/person-card-narrow-audit-2026-07-21/01-three-people-516-before.jpg'
/bin/rm -- 'artifacts/person-card-narrow-audit-2026-07-21/02-three-people-516-after.jpg'
/bin/rm -- 'artifacts/person-card-narrow-audit-2026-07-21/03-three-people-516-comparison.jpg'
/bin/rm -- 'artifacts/person-card-narrow-audit-2026-07-21/04-five-people-516-after.jpg'
/bin/rm -- 'artifacts/person-card-narrow-audit-2026-07-21/05-six-people-516-after.jpg'
/bin/rm -- 'artifacts/person-card-narrow-audit-2026-07-21/06-six-people-320-after.jpg'
/bin/rm -- 'artifacts/person-card-narrow-audit-2026-07-21/07-five-people-1024-after.jpg'
/bin/rm -- 'frontend/public/bgmss.png'
/bin/rm -- 'frontend/public/info.png'
/bin/rm -- 'frontend/public/star.png'
/bin/rm -- 'frontend/public/star_unrated.png'

node <<'NODE'
const crypto = require("crypto");
const fs = require("fs");
const { execFileSync } = require("child_process");
const relocationSource = "docs/decisions/prototype-data-logic-audit.md";
const allow = /^(\.gitignore|LICENSE|PRODUCT\.md|DESIGN\.md|\.codex\/hooks\.json|\.codex\/skills\/openspec-(apply-change|archive-change|explore|propose|sync-specs|update-change)\/SKILL\.md|\.agents\/skills\/impeccable\/.+|\.impeccable\/design\.json|tmp-formal-development\/(backend-development-implementation-guide|backend-operations-implementation-guide|data-logic-implementation-guide|frontend-production-cleanup-and-architecture-plan|formal-development-master-plan)\.md|tmp-formal-development\/decisions\/prototype-data-logic-audit\.md|openspec\/config\.yaml|openspec\/changes\/establish-formal-rewrite-baseline\/(\.openspec\.yaml|\.approval-manifest\.json|proposal\.md|design\.md|tasks\.md|specs\/contracts-rewrite-baseline\/spec\.md))$/;
const digest = value =>
  crypto.createHash("sha256").update(value).digest("hex");
const complement = execFileSync("git", ["ls-files", "-z"], {
  encoding: "utf8",
}).split("\0").filter(Boolean)
  .filter(file => !allow.test(file) && file !== relocationSource)
  .sort();
if (
  complement.length !== 357 ||
  complement.some(file => fs.existsSync(file)) ||
  digest(`${complement.join("\n")}\n`) !==
    "3cce8d63442d65dd582ceafc3e1bf6f319cde029e3c1a603f8fd13972d50e2d6"
) process.exit(1);
const deleted = execFileSync(
  "git",
  ["diff", "--no-renames", "--name-only", "-z", "--diff-filter=D"],
  { encoding: "utf8" },
).split("\0").filter(Boolean).sort();
if (
  deleted.length !== 358 ||
  !deleted.includes(relocationSource) ||
  digest(
    `${deleted.filter(value => value !== relocationSource).join("\n")}\n`,
  ) !== "3cce8d63442d65dd582ceafc3e1bf6f319cde029e3c1a603f8fd13972d50e2d6"
) process.exit(1);
NODE

git diff --cached --quiet
```

After the 321 explicit `apply_patch` deletions and the sealed 36 literal binary
deletions have all passed, run the physical-tree gate:

```zsh
set -euo pipefail

node <<'NODE'
const fs = require("fs");
const path = require("path");
const root = "/Users/luca/dev/BangumiStaffStats";
const allow = /^(\.gitignore|LICENSE|PRODUCT\.md|DESIGN\.md|\.codex\/hooks\.json|\.codex\/skills\/openspec-(apply-change|archive-change|explore|propose|sync-specs|update-change)\/SKILL\.md|\.agents\/skills\/impeccable\/.+|\.impeccable\/design\.json|tmp-formal-development\/(backend-development-implementation-guide|backend-operations-implementation-guide|data-logic-implementation-guide|frontend-production-cleanup-and-architecture-plan|formal-development-master-plan)\.md|tmp-formal-development\/decisions\/prototype-data-logic-audit\.md|openspec\/config\.yaml|openspec\/changes\/establish-formal-rewrite-baseline\/(\.openspec\.yaml|\.approval-manifest\.json|proposal\.md|design\.md|tasks\.md|specs\/contracts-rewrite-baseline\/spec\.md))$/;
const files = [];
function walk(directory, relative = "") {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (relative === "" && entry.name === ".git") continue;
    const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
    const childAbsolute = path.join(directory, entry.name);
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      walk(childAbsolute, childRelative);
    } else {
      files.push(childRelative);
    }
  }
}
walk(root);
const unexpected = files.filter(file => !allow.test(file)).sort();
if (unexpected.length) {
  process.stderr.write(`unexpected physical paths:\n${unexpected.join("\n")}\n`);
  process.exit(1);
}
NODE
```

Exact staging procedure:

```zsh
set -euo pipefail

node <<'NODE'
const { execFileSync, spawnSync } = require("child_process");
const allow = /^(\.gitignore|LICENSE|PRODUCT\.md|DESIGN\.md|\.codex\/hooks\.json|\.codex\/skills\/openspec-(apply-change|archive-change|explore|propose|sync-specs|update-change)\/SKILL\.md|\.agents\/skills\/impeccable\/.+|\.impeccable\/design\.json|tmp-formal-development\/(backend-development-implementation-guide|backend-operations-implementation-guide|data-logic-implementation-guide|frontend-production-cleanup-and-architecture-plan|formal-development-master-plan)\.md|tmp-formal-development\/decisions\/prototype-data-logic-audit\.md|openspec\/config\.yaml|openspec\/changes\/establish-formal-rewrite-baseline\/(\.openspec\.yaml|\.approval-manifest\.json|proposal\.md|design\.md|tasks\.md|specs\/contracts-rewrite-baseline\/spec\.md))$/;

const exactWrites = [
  ".gitignore",
  ".codex/skills/openspec-apply-change/SKILL.md",
  ".codex/skills/openspec-archive-change/SKILL.md",
  ".codex/skills/openspec-explore/SKILL.md",
  ".codex/skills/openspec-propose/SKILL.md",
  ".codex/skills/openspec-sync-specs/SKILL.md",
  ".codex/skills/openspec-update-change/SKILL.md",
  "openspec/config.yaml",
  "openspec/changes/establish-formal-rewrite-baseline/.openspec.yaml",
  "openspec/changes/establish-formal-rewrite-baseline/.approval-manifest.json",
  "openspec/changes/establish-formal-rewrite-baseline/proposal.md",
  "openspec/changes/establish-formal-rewrite-baseline/design.md",
  "openspec/changes/establish-formal-rewrite-baseline/tasks.md",
  "openspec/changes/establish-formal-rewrite-baseline/specs/contracts-rewrite-baseline/spec.md",
  "tmp-formal-development/formal-development-master-plan.md",
  "tmp-formal-development/decisions/prototype-data-logic-audit.md",
  "tmp-formal-development/data-logic-implementation-guide.md",
  "tmp-formal-development/frontend-production-cleanup-and-architecture-plan.md",
];

for (const file of exactWrites) {
  if (!allow.test(file)) {
    process.stderr.write(`write path is outside allowlist: ${file}\n`);
    process.exit(1);
  }
}
let result = spawnSync("git", ["add", "--", ...exactWrites], {
  stdio: "inherit",
});
if (result.status !== 0) process.exit(result.status ?? 1);

const deleted = execFileSync(
  "git",
  ["diff", "--name-only", "-z", "--diff-filter=D"],
  { encoding: "utf8" },
).split("\0").filter(Boolean);
for (const file of deleted) {
  if (allow.test(file)) {
    process.stderr.write(`allowlisted file was deleted: ${file}\n`);
    process.exit(1);
  }
  result = spawnSync("git", ["add", "--", file], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
NODE

git diff --quiet
git diff --cached --check
untracked_after_stage="$(git ls-files --others --exclude-standard)"
test -z "$untracked_after_stage"

ignored_after_stage="$(
  git status \
    --porcelain=v1 \
    --ignored=matching \
    --untracked-files=all |
  awk '$1 == "!!" { print }'
)"
test -z "$ignored_after_stage"
git diff --cached --name-status
```

## 4. Contracts owner — proposed-index validation and handoff

- [x] 4.1 Re-run the approval-seal gate. Compare the proposed index and physical file/symlink sets exactly; enforce the allowlist and mandatory set; verify the complete Impeccable subtree has exactly the same paths and contents as the oracle; and prove no unstaged, untracked, ignored, nested-OpenSpec, application, CI, Docker, infrastructure, deployment, or operations implementation path survives.
- [x] 4.2 Verify all fixed blobs, all supplemental evidence predicates, the exact planning-approval delta, root-skill parity against both oracle copies, and ordinary ancestry. `HEAD` is the planning-approval commit; the local prototype ref equals its evidence parent; deleted frontend/backend/decision evidence remains readable from the oracle; and the ignored rate test remains readable from the evidence commit.
- [x] 4.3 Parse every proposed JSON, YAML, and TOML file. Check active Markdown links against the worktree, but resolve missing local links inside the byte-identical data audit against the evidence commit. Fail on an invalid encoding, repository escape, missing active target, or missing historical evidence target.
- [x] 4.4 Run OpenSpec doctor/status/strict validation, hook-target validation, exact `.gitignore` behavior, and cached whitespace checks. Because Impeccable context output has already appeared in this conversation, do not rerun `context.mjs`; instead prove its PRODUCT/DESIGN/skill/hook inputs are unchanged. In a future conversation with no prior output, run it once with `IMPECCABLE_NO_UPDATE_CHECK=1`.
- [x] 4.5 After tasks 1.1–4.4 pass, perform pass one: mark only those completed boxes, restage only this exact file, and rerun the approval-seal gate, worktree/index equality, cached whitespace, strict validation, and final tree checker. Then perform pass two: mark 4.5 complete, restage this file again, and rerun the same complete gate so no self-referential checkbox change remains unvalidated.
- [x] 4.6 Prepare the precise handoff report, then mark 4.6 complete, restage only this task file, re-run the approval-seal and complete final gate one last time, and record `git write-tree` as the immutable candidate id. Preserve that exact staged candidate for main-agent read-only acceptance. Report: investigated/specified/supplemental-evidence-committed/planning-approval-committed yes; cleanup candidate applied/staged/mechanically verified yes only if every gate passed; main-agent candidate accepted pending; cleanup committed/archived/final accepted/pushed/released/deployed no. Do not commit cleanup or archive before explicit main-agent acceptance; never push, release, or deploy under this change.

Final exact-tree checker:

```zsh
set -euo pipefail

node <<'NODE'
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const root = "/Users/luca/dev/BangumiStaffStats";
const oracle = "644b7748674e553f863d0ffd61d029f86fdc0717";
const allow = /^(\.gitignore|LICENSE|PRODUCT\.md|DESIGN\.md|\.codex\/hooks\.json|\.codex\/skills\/openspec-(apply-change|archive-change|explore|propose|sync-specs|update-change)\/SKILL\.md|\.agents\/skills\/impeccable\/.+|\.impeccable\/design\.json|tmp-formal-development\/(backend-development-implementation-guide|backend-operations-implementation-guide|data-logic-implementation-guide|frontend-production-cleanup-and-architecture-plan|formal-development-master-plan)\.md|tmp-formal-development\/decisions\/prototype-data-logic-audit\.md|openspec\/config\.yaml|openspec\/changes\/establish-formal-rewrite-baseline\/(\.openspec\.yaml|\.approval-manifest\.json|proposal\.md|design\.md|tasks\.md|specs\/contracts-rewrite-baseline\/spec\.md))$/;
const required = [
  ".gitignore",
  "LICENSE",
  "PRODUCT.md",
  "DESIGN.md",
  ".agents/skills/impeccable/SKILL.md",
  ".codex/hooks.json",
  ".codex/skills/openspec-apply-change/SKILL.md",
  ".codex/skills/openspec-archive-change/SKILL.md",
  ".codex/skills/openspec-explore/SKILL.md",
  ".codex/skills/openspec-propose/SKILL.md",
  ".codex/skills/openspec-sync-specs/SKILL.md",
  ".codex/skills/openspec-update-change/SKILL.md",
  ".impeccable/design.json",
  "openspec/config.yaml",
  "openspec/changes/establish-formal-rewrite-baseline/.openspec.yaml",
  "openspec/changes/establish-formal-rewrite-baseline/.approval-manifest.json",
  "openspec/changes/establish-formal-rewrite-baseline/proposal.md",
  "openspec/changes/establish-formal-rewrite-baseline/design.md",
  "openspec/changes/establish-formal-rewrite-baseline/tasks.md",
  "openspec/changes/establish-formal-rewrite-baseline/specs/contracts-rewrite-baseline/spec.md",
  "tmp-formal-development/backend-development-implementation-guide.md",
  "tmp-formal-development/backend-operations-implementation-guide.md",
  "tmp-formal-development/data-logic-implementation-guide.md",
  "tmp-formal-development/frontend-production-cleanup-and-architecture-plan.md",
  "tmp-formal-development/formal-development-master-plan.md",
  "tmp-formal-development/decisions/prototype-data-logic-audit.md",
];
const git = (...args) => execFileSync("git", args, { encoding: "utf8" });
const tracked = git("ls-files", "-z").split("\0").filter(Boolean).sort();
const unexpected = tracked.filter(file => !allow.test(file));
if (unexpected.length) {
  process.stderr.write(`unexpected tracked paths:\n${unexpected.join("\n")}\n`);
  process.exit(1);
}
for (const file of required) {
  if (!tracked.includes(file) || !fs.existsSync(path.join(root, file))) {
    process.stderr.write(`missing required path: ${file}\n`);
    process.exit(1);
  }
}

const physical = [];
function walk(directory, relative = "") {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (relative === "" && entry.name === ".git") continue;
    const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
    const childAbsolute = path.join(directory, entry.name);
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      walk(childAbsolute, childRelative);
    } else {
      physical.push(childRelative);
    }
  }
}
walk(root);
physical.sort();
if (JSON.stringify(physical) !== JSON.stringify(tracked)) {
  const physicalOnly = physical.filter(file => !tracked.includes(file));
  const indexOnly = tracked.filter(file => !physical.includes(file));
  process.stderr.write(
    `physical/index mismatch\nphysical only:\n${physicalOnly.join("\n")}\nindex only:\n${indexOnly.join("\n")}\n`,
  );
  process.exit(1);
}

const oracleImpeccable = git(
  "ls-tree",
  "-r",
  "--name-only",
  "-z",
  oracle,
  "--",
  ".agents/skills/impeccable",
).split("\0").filter(Boolean).sort();
const currentImpeccable = tracked.filter(
  file => file.startsWith(".agents/skills/impeccable/"),
);
if (JSON.stringify(currentImpeccable) !== JSON.stringify(oracleImpeccable)) {
  process.stderr.write("Impeccable tree membership differs from oracle\n");
  process.exit(1);
}
NODE
```

Blob, ancestry, and evidence checks:

```zsh
set -euo pipefail

FORMAL_ORACLE=644b7748674e553f863d0ffd61d029f86fdc0717
FORMAL_PLAN="$(git rev-parse HEAD)"
FORMAL_EVIDENCE="$(git rev-parse "${FORMAL_PLAN}^")"
FORMAL_TEST=backend/internal/core/subject/rate_test.go

git diff --quiet
git diff --cached --check
git merge-base --is-ancestor "$FORMAL_ORACLE" "$FORMAL_PLAN"
test "$(git rev-parse "${FORMAL_EVIDENCE}^")" = "$FORMAL_ORACLE"
test "$(git show -s --format=%s "$FORMAL_PLAN")" = \
  "chore: approve formal rewrite baseline spec"
test "$(git show -s --format=%s "$FORMAL_EVIDENCE")" = \
  "chore: preserve ignored prototype test"
test "$(git rev-parse \
  refs/heads/codex/person-workbench-unified-prototype)" = "$FORMAL_EVIDENCE"
test "$(git diff-tree \
  --no-commit-id \
  --name-status \
  -r \
  "$FORMAL_EVIDENCE")" = $'A\tbackend/internal/core/subject/rate_test.go'
test "$(git rev-parse "${FORMAL_EVIDENCE}:${FORMAL_TEST}")" = \
  3d52f6e505596819bad687d817d286f7a85d7c06
test "$(
  git show "${FORMAL_EVIDENCE}:${FORMAL_TEST}" |
  shasum -a 256 |
  awk "{print \$1}"
)" = e662fa678ce94c1f2b72fbc67d4e8d5fc53e7d882356a69c9af4b57ad462ef74
test "$(
  git show "${FORMAL_EVIDENCE}:${FORMAL_TEST}" |
  wc -l |
  tr -d "[:space:]"
)" = 47

node <<'NODE'
const fs = require("fs");
const { execFileSync } = require("child_process");
const plan = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const manifest = JSON.parse(fs.readFileSync(
  "openspec/changes/establish-formal-rewrite-baseline/.approval-manifest.json",
  "utf8",
));
const expected = [
  "openspec/changes/establish-formal-rewrite-baseline/.approval-manifest.json",
  ...manifest.files.map(item => item.path),
].sort();
const actual = execFileSync(
  "git",
  ["diff-tree", "--no-commit-id", "--name-only", "-r", "-z", plan],
  { encoding: "utf8" },
).split("\0").filter(Boolean).sort();
if (JSON.stringify(actual) !== JSON.stringify(expected)) process.exit(1);
NODE

git diff --quiet "$FORMAL_ORACLE" -- \
  LICENSE \
  PRODUCT.md \
  DESIGN.md \
  .agents/skills/impeccable \
  .codex/hooks.json \
  .impeccable/design.json \
  tmp-formal-development/backend-development-implementation-guide.md \
  tmp-formal-development/backend-operations-implementation-guide.md

root_skills=(.codex/skills/openspec-*/SKILL.md)
test "${#root_skills[@]}" -eq 6
for root_skill in "${root_skills[@]}"; do
  skill_rel="${root_skill#.codex/skills/}"
  test "$(git hash-object "$root_skill")" = \
    "$(git rev-parse \
      "${FORMAL_ORACLE}:backend/.codex/skills/${skill_rel}")"
  test "$(git hash-object "$root_skill")" = \
    "$(git rev-parse \
      "${FORMAL_ORACLE}:frontend/.codex/skills/${skill_rel}")"
done

test "$(git hash-object .gitignore)" = \
  aa5f57b075141668fb5252d3bd19b5643c38439d
test "$(git hash-object \
  tmp-formal-development/decisions/prototype-data-logic-audit.md)" = \
  28fb89d29e2b7f58677d7be17c7c6acbca9db849
test "$(git hash-object \
  tmp-formal-development/data-logic-implementation-guide.md)" = \
  64d43ac002f4ace17c91ddd2fde031c11aa2bd6c
test "$(git hash-object \
  tmp-formal-development/frontend-production-cleanup-and-architecture-plan.md)" = \
  7bcd686b2249c9c256109fcb72a4a19b7ec9c452

git show "${FORMAL_ORACLE}:frontend/src/workbench/WorkbenchApp.vue" >/dev/null
git show "${FORMAL_ORACLE}:backend/cmd/main.go" >/dev/null
git show \
  "${FORMAL_ORACLE}:docs/decisions/prototype-global-design-unification.md" \
  >/dev/null
git show \
  "${FORMAL_EVIDENCE}:backend/internal/core/subject/rate_test.go" \
  >/dev/null
```

Parser and link checks:

```zsh
set -euo pipefail

git diff --quiet

node <<'NODE'
const fs = require("fs");
const { execFileSync } = require("child_process");
const files = execFileSync("git", ["ls-files", "-z", "*.json"], {
  encoding: "utf8",
}).split("\0").filter(Boolean);
for (const file of files) JSON.parse(fs.readFileSync(file, "utf8"));
NODE

git ls-files -z '*.yaml' '*.yml' |
ruby -e '
  require "date"
  require "yaml"
  STDIN.read.split("\0").reject(&:empty?).each do |file|
    YAML.safe_load(
      File.read(file),
      permitted_classes: [Date],
      permitted_symbols: [],
      aliases: false
    )
  end
'

git ls-files -z '*.toml' |
python3 -c '
import pathlib
import sys
import tomllib
for raw in sys.stdin.buffer.read().split(b"\0"):
    if raw:
        tomllib.loads(pathlib.Path(raw.decode()).read_text())
'

node <<'NODE'
const fs = require("fs");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");
const root = "/Users/luca/dev/BangumiStaffStats";
const audit =
  "tmp-formal-development/decisions/prototype-data-logic-audit.md";
const evidence = execFileSync("git", ["rev-parse", "HEAD^"], {
  encoding: "utf8",
}).trim();
const files = execFileSync("git", ["ls-files", "-z", "*.md"], {
  encoding: "utf8",
}).split("\0").filter(Boolean);
const failures = [];

for (const file of files) {
  const body = fs.readFileSync(file, "utf8");
  for (const match of body.matchAll(/\[[^\]]*]\(([^)]+)\)/g)) {
    let target = match[1].trim().replace(/^<|>$/g, "");
    if (/^(https?:|mailto:|data:|#)/i.test(target)) continue;
    target = target.split("#", 1)[0].split("?", 1)[0];
    if (!target) continue;
    try {
      target = decodeURIComponent(target);
    } catch {
      failures.push(`${file}: invalid encoded link: ${match[1]}`);
      continue;
    }
    const resolved = path.resolve(path.dirname(path.join(root, file)), target);
    const relative = path.relative(root, resolved).split(path.sep).join("/");
    if (relative === ".." || relative.startsWith("../")) {
      failures.push(`${file}: repository escape: ${target}`);
      continue;
    }
    if (fs.existsSync(resolved)) continue;
    if (file !== audit) {
      failures.push(`${file}: missing active target: ${target}`);
      continue;
    }
    const historical = spawnSync(
      "git",
      ["cat-file", "-e", `${evidence}:${relative}`],
    );
    if (historical.status !== 0) {
      failures.push(`${file}: missing evidence target: ${target}`);
    }
  }
}
if (failures.length) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exit(1);
}
NODE
```

OpenSpec, hook, ignore, and scope checks:

```zsh
set -euo pipefail

openspec doctor --json |
node -e '
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", chunk => input += chunk);
  process.stdin.on("end", () => {
    const value = JSON.parse(input);
    if (value.root?.path !== "/Users/luca/dev/BangumiStaffStats") {
      process.exit(1);
    }
    if (value.root?.healthy !== true || value.status?.length !== 0) {
      process.exit(1);
    }
  });
'

openspec status \
  --change establish-formal-rewrite-baseline \
  --json |
node -e '
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", chunk => input += chunk);
  process.stdin.on("end", () => {
    const value = JSON.parse(input);
    if (!value.isComplete) process.exit(1);
    if (!value.artifacts?.every(item => item.status === "done")) {
      process.exit(1);
    }
  });
'

openspec validate establish-formal-rewrite-baseline \
  --type change \
  --strict \
  --json \
  --no-interactive

node -e '
const fs = require("fs");
const hooks = JSON.parse(fs.readFileSync(".codex/hooks.json", "utf8"));
const command = hooks.hooks.PostToolUse[0].hooks[0].command;
if (!command.includes(".agents/skills/impeccable/scripts/hook.mjs")) {
  process.exit(1);
}
if (!fs.existsSync(".agents/skills/impeccable/scripts/hook.mjs")) {
  process.exit(1);
}
if (!fs.existsSync("PRODUCT.md") || !fs.existsSync("DESIGN.md")) {
  process.exit(1);
}
'

for ignored_path in \
  .env \
  frontend/.env.local \
  backend/.env.production \
  frontend/node_modules/example \
  frontend/dist/example \
  updater/__pycache__/example.pyc \
  playwright-report/index.html \
  coverage/index.html \
  run.log \
  tmp/scratch
do
  git check-ignore -q --no-index "$ignored_path"
done

for trackable_path in \
  backend/domain/sentinel_test.go \
  contracts/goldens/example.json \
  contracts/fixtures/minimal.sqlite \
  backend/config/config.example.toml \
  .vscode/settings.json \
  bin/tool.go \
  build/build.go
do
  set +e
  git check-ignore -q --no-index "$trackable_path"
  ignore_status=$?
  set -e
  test "$ignore_status" -eq 1
done

node <<'NODE'
const { execFileSync } = require("child_process");
const forbidden = /^(backend|frontend|artifacts|docs|\.superpowers)(\/|$)|^(bangumi_plugin\.js|design-qa\.md|README\.md|\.impeccable\/live)(\/|$)|(^|\/)(go\.mod|go\.sum|package\.json|pyproject\.toml|Dockerfile|compose[^/]*\.ya?ml|nginx[^/]*|systemd[^/]*|deploy[^/]*|infra[^/]*|\.github\/workflows)(\/|$)/i;
const files = execFileSync("git", ["ls-files", "-z"], {
  encoding: "utf8",
}).split("\0").filter(Boolean);
const matches = files.filter(file => forbidden.test(file));
if (matches.length) {
  process.stderr.write(`forbidden paths:\n${matches.join("\n")}\n`);
  process.exit(1);
}
NODE

git diff --quiet
git diff --cached --check
```

Candidate task-state gate. Run after the final 4.6 restage and before recording
the accepted candidate tree:

```zsh
set -euo pipefail

node <<'NODE'
const fs = require("fs");
const taskPath =
  "openspec/changes/establish-formal-rewrite-baseline/tasks.md";
const body = fs.readFileSync(taskPath, "utf8");
const unchecked = [...body.matchAll(/^\s*-\s*\[ \]\s+(\d+\.\d+)/gm)]
  .map(match => match[1]);
const checked = [...body.matchAll(/^\s*-\s*\[[xX]\]\s+(\d+\.\d+)/gm)]
  .map(match => match[1]);
if (
  JSON.stringify(unchecked) !== JSON.stringify(["5.1", "5.2"]) ||
  checked.length !== 21
) {
  process.stderr.write(
    `candidate task state differs: unchecked=${unchecked.join(",")}, checked=${checked.length}\n`,
  );
  process.exit(1);
}
NODE

git diff --quiet
git diff --cached --check
git write-tree
```

## 5. Contracts owner — accepted candidate finalization

- [x] 5.1 A finalization subagent, dispatched only after explicit main-agent candidate acceptance, MUST re-run the apply and archive skill instructions, receive the accepted cached-tree id, re-run the approval-seal and complete candidate gates without modifying the index, and create the local cleanup commit `chore: establish formal rewrite baseline` only when `git write-tree` still equals that accepted id.
- [x] 5.2 Verify the cleanup commit has the planning-approval commit as its parent, its tree equals the accepted tree, and the full workspace is clean. Then mark 5.1 and 5.2 complete with `apply_patch`, confirm no unchecked task remains, and re-run the approval-seal, strict validation, cached/unstaged checks, and exact-tree checker. Only after every task is complete may the same subagent execute the archive protocol below.

Cleanup-commit gate. `FORMAL_ACCEPTED_TREE` MUST be copied exactly from the
main-agent acceptance dispatch; it MUST NOT be inferred after the candidate has
changed:

```zsh
set -euo pipefail

FORMAL_ACCEPTED_TREE="${FORMAL_ACCEPTED_TREE:?main-agent accepted tree is required}"
FORMAL_PLAN="$(git rev-parse HEAD)"

test "$(git branch --show-current)" = codex/formal-rewrite
test "$(git show -s --format=%s "$FORMAL_PLAN")" = \
  "chore: approve formal rewrite baseline spec"
test "$(git write-tree)" = "$FORMAL_ACCEPTED_TREE"
git diff --quiet
git diff --cached --check

git -c core.hooksPath=/dev/null \
  commit -m "chore: establish formal rewrite baseline"

FORMAL_CLEANUP="$(git rev-parse HEAD)"
test "$(
  git rev-list --parents -n 1 "$FORMAL_CLEANUP" |
  awk "{print NF}"
)" = 2
test "$(git rev-parse "${FORMAL_CLEANUP}^")" = "$FORMAL_PLAN"
test "$(git rev-parse "${FORMAL_CLEANUP}^{tree}")" = "$FORMAL_ACCEPTED_TREE"
test "$(git show -s --format=%s "$FORMAL_CLEANUP")" = \
  "chore: establish formal rewrite baseline"
test -z "$(
  git status \
    --porcelain=v1 \
    --ignored=matching \
    --untracked-files=all
)"
printf 'FORMAL_ACCEPTED_TREE=%s\n' "$FORMAL_ACCEPTED_TREE"
printf 'FORMAL_CLEANUP=%s\n' "$FORMAL_CLEANUP"
```

After marking 5.1 and 5.2 complete, carry forward the exact
`FORMAL_ACCEPTED_TREE` and `FORMAL_CLEANUP` printed by the cleanup-commit gate;
do not recompute either value from a later `HEAD`. Require an actually complete
task file before archive:

```zsh
set -euo pipefail

node <<'NODE'
const fs = require("fs");
const taskPath =
  "openspec/changes/establish-formal-rewrite-baseline/tasks.md";
const body = fs.readFileSync(taskPath, "utf8");
const incomplete = body.match(/^\s*-\s*\[ \]/gm) ?? [];
if (incomplete.length !== 0) {
  process.stderr.write(`${incomplete.length} incomplete tasks remain\n`);
  process.exit(1);
}
NODE

openspec status \
  --change establish-formal-rewrite-baseline \
  --json |
node -e '
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", chunk => input += chunk);
  process.stdin.on("end", () => {
    const value = JSON.parse(input);
    if (!value.isComplete) process.exit(1);
    if (!value.artifacts?.every(item => item.status === "done")) {
      process.exit(1);
    }
  });
'

openspec validate establish-formal-rewrite-baseline \
  --type change \
  --strict \
  --json \
  --no-interactive

git diff --cached --quiet
git diff --check
test "$(git diff --name-only)" = \
  openspec/changes/establish-formal-rewrite-baseline/tasks.md
test -z "$(git ls-files --others --exclude-standard)"
test -z "$(
  git status \
    --porcelain=v1 \
    --ignored=matching \
    --untracked-files=all |
  awk '$1 == "!!" { print }'
)"
```

Finalization protocol after all tasks are complete:

1. Re-run the approval-seal gate against the active change.
2. Require OpenSpec `1.6.0`, UTC date `2026-07-23`, and require the exact archive target not to
   exist.
3. Run `openspec archive establish-formal-rewrite-baseline -y --json`; do not
   use `--skip-specs` or `--no-validate`. Verify the raw generated root-spec
   hash, then use `apply_patch` to replace only OpenSpec's placeholder Purpose
   with the exact reviewed Purpose stated below.
4. Validate the exact post-archive file/symlink set, archived approval seal,
   curated synchronized root spec, ancestry, local refs, and empty active-change
   list.
5. Stage only the exact old active paths, new archived paths, and synchronized
   root spec; create `chore: archive formal rewrite baseline`.
6. Stop for the main agent's second read-only acceptance. Do not push, tag,
   release, deploy, or begin Wave 1.

```zsh
set -euo pipefail

FORMAL_ARCHIVE_DATE=2026-07-23
FORMAL_CHANGE=establish-formal-rewrite-baseline
FORMAL_ACTIVE="openspec/changes/${FORMAL_CHANGE}"
FORMAL_ARCHIVE="openspec/changes/archive/${FORMAL_ARCHIVE_DATE}-${FORMAL_CHANGE}"
FORMAL_ROOT_SPEC=openspec/specs/contracts-rewrite-baseline/spec.md
FORMAL_ORACLE=644b7748674e553f863d0ffd61d029f86fdc0717
FORMAL_ACCEPTED_TREE="${FORMAL_ACCEPTED_TREE:?accepted tree must be carried forward}"
FORMAL_CLEANUP="${FORMAL_CLEANUP:?cleanup OID must be carried forward}"
FORMAL_PLAN="$(git rev-parse "${FORMAL_CLEANUP}^")"
FORMAL_EVIDENCE="$(git rev-parse "${FORMAL_PLAN}^")"

test "$(openspec --version)" = 1.6.0
test "$(date -u +%F)" = "$FORMAL_ARCHIVE_DATE"
test "$(git rev-parse HEAD)" = "$FORMAL_CLEANUP"
test "$(git rev-parse "${FORMAL_CLEANUP}^{tree}")" = "$FORMAL_ACCEPTED_TREE"
test "$(git show -s --format=%s "$FORMAL_CLEANUP")" = \
  "chore: establish formal rewrite baseline"
test "$(git show -s --format=%s "$FORMAL_PLAN")" = \
  "chore: approve formal rewrite baseline spec"
test "$(git rev-parse "${FORMAL_EVIDENCE}^")" = "$FORMAL_ORACLE"
test "$(git show -s --format=%s "$FORMAL_EVIDENCE")" = \
  "chore: preserve ignored prototype test"
test "$(git rev-parse \
  refs/heads/codex/person-workbench-unified-prototype)" = "$FORMAL_EVIDENCE"
test -d "$FORMAL_ACTIVE"
test ! -e "$FORMAL_ARCHIVE"
test ! -e "$FORMAL_ROOT_SPEC"

archive_json="$(
  openspec archive "$FORMAL_CHANGE" -y --json
)"
printf '%s' "$archive_json" |
node -e '
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", chunk => input += chunk);
  process.stdin.on("end", () => {
    const value = JSON.parse(input);
    if (
      value.archive?.change !== "establish-formal-rewrite-baseline" ||
      value.archive?.archivedAs !==
        "2026-07-23-establish-formal-rewrite-baseline" ||
      value.archive?.specsUpdated !== true ||
      value.archive?.totals?.added !== 13 ||
      value.archive?.totals?.modified !== 0 ||
      value.archive?.totals?.removed !== 0 ||
      value.archive?.totals?.renamed !== 0
    ) process.exit(1);
  });
'

test ! -e "$FORMAL_ACTIVE"
test -d "$FORMAL_ARCHIVE"
test -f "$FORMAL_ROOT_SPEC"
test "$(
  shasum -a 256 "$FORMAL_ROOT_SPEC" |
  awk "{print \$1}"
)" = 79dd241c931be329170461e5ed0153a619595d34bacefeb5acdeb0f759f327fb
```

The finalization subagent MUST now apply this exact root-spec-only patch with
`apply_patch`; no archived delta artifact is changed:

```diff
*** Begin Patch
*** Update File: openspec/specs/contracts-rewrite-baseline/spec.md
@@
-TBD - created by archiving change establish-formal-rewrite-baseline. Update Purpose after archive.
+Define the clean-room repository baseline, governance boundaries, immutable prototype evidence, and acceptance gates required before any formal frontend, backend, updater, or shared-contract implementation begins.
*** End Patch
```

```zsh
set -euo pipefail

FORMAL_ROOT_SPEC=openspec/specs/contracts-rewrite-baseline/spec.md
test "$(
  shasum -a 256 "$FORMAL_ROOT_SPEC" |
  awk "{print \$1}"
)" = 73ba0c12b7d3fd69592621d716f08a3a5ce7cdb16bb2853c3eca0e780862cd07

openspec validate \
  --all \
  --strict \
  --json \
  --no-interactive

openspec list --json |
node -e '
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", chunk => input += chunk);
  process.stdin.on("end", () => {
    const value = JSON.parse(input);
    const changes = Array.isArray(value) ? value : value.changes ?? [];
    if (changes.some(item =>
      (item.name ?? item.id) === "establish-formal-rewrite-baseline"
    )) process.exit(1);
  });
'
```

Final and only post-archive output-canonicalization reseal. The original
Purpose patch and strict validation completed, but the reviewed curated hash
encoded two terminal LF bytes. The exact staged archive tree
`4ec4543e89350085e0d3844c753e20c4383af9fd` then failed only
`git diff --cached --check` with
`openspec/specs/contracts-rewrite-baseline/spec.md:327: new blank line at EOF.`
No archive commit was created. The canonical one-terminal-LF output differs by
only that byte and is the only form that can satisfy cached whitespace.

This reseal is not a third planning repair or a history rewrite. The immutable
planning seal remains
`f42737d0d31bab3c04bb2d95a4e8b64a832340e3728e793656ac8314902b5635`.
The main agent MAY amend only the dated archived manifest, proposal, design,
tasks, capability delta, and synchronized root spec; it MUST obtain the matching
master-plan amendment from that plan's subagent owner, review it, and only then
reapprove the combined seal. The finalization subagent MUST NOT rerun
`openspec archive`, amend an existing commit, create an extra commit, unstage
the already reviewed archive move, or change any other path. The same fourth
and final archive commit absorbs these reapproved outputs. The original
archive/Purpose/EOF procedure above is retained as failure evidence and MUST
NOT be executed again after this reseal; resume only from the gate below.

Before resuming finalization, re-run this entire gate. The seven worktree
control/spec paths are expected because they are the reviewed reseal itself;
the index MUST remain the exact failed archive candidate:

```zsh
set -euo pipefail

FORMAL_CLEANUP=c5435f0a7584bf63aeddf9d33738b15485fbd19e
FORMAL_ACCEPTED_TREE=bca117877cd580f6388187d11ba70e6ae736597e
FORMAL_FAILED_ARCHIVE_TREE=4ec4543e89350085e0d3844c753e20c4383af9fd
FORMAL_PLANNING_MANIFEST_SHA256=f42737d0d31bab3c04bb2d95a4e8b64a832340e3728e793656ac8314902b5635
FORMAL_FINAL_ROOT_SPEC_SHA256=78a68814751b268f802979742d683fb1a72945ff7f3e030e1da0f2121c8cf02f
FORMAL_ARCHIVE=openspec/changes/archive/2026-07-23-establish-formal-rewrite-baseline
FORMAL_MANIFEST="${FORMAL_ARCHIVE}/.approval-manifest.json"
FORMAL_TASKS="${FORMAL_ARCHIVE}/tasks.md"
FORMAL_DELTA="${FORMAL_ARCHIVE}/specs/contracts-rewrite-baseline/spec.md"
FORMAL_ROOT_SPEC=openspec/specs/contracts-rewrite-baseline/spec.md
FORMAL_ARCHIVED_MANIFEST_SHA256="$(
  sed -n \
    "s/^FORMAL_APPROVAL_MANIFEST_SHA256=//p" \
    "$FORMAL_TASKS"
)"

test "$(git rev-parse HEAD)" = "$FORMAL_CLEANUP"
test "$(git rev-parse "${FORMAL_CLEANUP}^{tree}")" = \
  "$FORMAL_ACCEPTED_TREE"
test "$(git rev-parse "${FORMAL_CLEANUP}^")" = \
  671738d7fb882279dd34ee6d37118cf14329dce9
test "$(git write-tree)" = "$FORMAL_FAILED_ARCHIVE_TREE"
test ! -e openspec/changes/establish-formal-rewrite-baseline
test -d "$FORMAL_ARCHIVE"
test -f "$FORMAL_ROOT_SPEC"
test -z "$(git ls-files --others --exclude-standard)"
test -z "$(
  git status \
    --porcelain=v1 \
    --ignored=matching \
    --untracked-files=all |
  awk '$1 == "!!" { print }'
)"

node <<'NODE'
const { execFileSync } = require("child_process");
const active = "openspec/changes/establish-formal-rewrite-baseline";
const archive =
  "openspec/changes/archive/2026-07-23-establish-formal-rewrite-baseline";
const rel = [
  ".openspec.yaml",
  ".approval-manifest.json",
  "proposal.md",
  "design.md",
  "tasks.md",
  "specs/contracts-rewrite-baseline/spec.md",
];
const expectedStaged = [
  "openspec/specs/contracts-rewrite-baseline/spec.md",
  ...rel.flatMap(file => [`${active}/${file}`, `${archive}/${file}`]),
].sort();
const actualStaged = execFileSync(
  "git",
  ["diff", "--cached", "--no-renames", "--name-only", "-z"],
  { encoding: "utf8" },
).split("\0").filter(Boolean).sort();
if (JSON.stringify(actualStaged) !== JSON.stringify(expectedStaged)) {
  process.stderr.write("failed archive staged path set differs\n");
  process.exit(1);
}
const expectedUnstaged = [
  `${archive}/.approval-manifest.json`,
  `${archive}/proposal.md`,
  `${archive}/design.md`,
  `${archive}/tasks.md`,
  `${archive}/specs/contracts-rewrite-baseline/spec.md`,
  "openspec/specs/contracts-rewrite-baseline/spec.md",
  "tmp-formal-development/formal-development-master-plan.md",
].sort();
const actualUnstaged = execFileSync(
  "git",
  ["diff", "--name-only", "-z"],
  { encoding: "utf8" },
).split("\0").filter(Boolean).sort();
if (JSON.stringify(actualUnstaged) !== JSON.stringify(expectedUnstaged)) {
  process.stderr.write("post-archive reseal path set differs\n");
  process.exit(1);
}
NODE

test "$(
  git show :openspec/specs/contracts-rewrite-baseline/spec.md |
  shasum -a 256 |
  awk "{print \$1}"
)" = 73ba0c12b7d3fd69592621d716f08a3a5ce7cdb16bb2853c3eca0e780862cd07
test "$(
  git show :openspec/specs/contracts-rewrite-baseline/spec.md |
  wc -c |
  tr -d "[:space:]"
)" = 25907

set +e
cached_check="$(git diff --cached --check 2>&1)"
cached_check_status=$?
set -e
test "$cached_check_status" -eq 2
test "$cached_check" = \
  "openspec/specs/contracts-rewrite-baseline/spec.md:327: new blank line at EOF."

test "$(
  shasum -a 256 "$FORMAL_MANIFEST" |
  awk "{print \$1}"
)" = "$FORMAL_ARCHIVED_MANIFEST_SHA256"
test "$(
  shasum -a 256 "$FORMAL_ROOT_SPEC" |
  awk "{print \$1}"
)" = "$FORMAL_FINAL_ROOT_SPEC_SHA256"

node <<'NODE'
const crypto = require("crypto");
const fs = require("fs");
const { execFileSync } = require("child_process");
const archive =
  "openspec/changes/archive/2026-07-23-establish-formal-rewrite-baseline";
const manifestPath = `${archive}/.approval-manifest.json`;
const taskPath = `${archive}/tasks.md`;
const deltaPath = `${archive}/specs/contracts-rewrite-baseline/spec.md`;
const rootSpecPath = "openspec/specs/contracts-rewrite-baseline/spec.md";
const oldSeal =
  "f42737d0d31bab3c04bb2d95a4e8b64a832340e3728e793656ac8314902b5635";
const digest = value =>
  crypto.createHash("sha256").update(value).digest("hex");
const normalizeTasks = value =>
  value
    .replace(/^(\s*-\s*)\[[ xX]\]/gm, "$1[ ]")
    .replace(
      /^FORMAL_APPROVAL_MANIFEST_SHA256=[0-9a-f]{64}$/m,
      "FORMAL_APPROVAL_MANIFEST_SHA256=<APPROVAL_MANIFEST_SHA256>",
    );
const manifestBody = fs.readFileSync(manifestPath);
const manifest = JSON.parse(manifestBody);
if (
  manifest.supersedesPlanningManifestSha256 !== oldSeal ||
  manifest.resealReason !== "post-archive-root-spec-eof-canonicalization"
) process.exit(1);
const embedded = fs.readFileSync(taskPath, "utf8").match(
  /^FORMAL_APPROVAL_MANIFEST_SHA256=([0-9a-f]{64})$/m,
)?.[1];
if (!embedded || embedded !== digest(manifestBody)) process.exit(1);
for (const item of manifest.files) {
  const currentPath = item.path.startsWith(
    "openspec/changes/establish-formal-rewrite-baseline/",
  )
    ? `${archive}/${item.path.slice(
        "openspec/changes/establish-formal-rewrite-baseline/".length,
      )}`
    : item.path;
  const body = fs.readFileSync(currentPath);
  const actual =
    currentPath === taskPath
      ? digest(normalizeTasks(body.toString("utf8")))
      : digest(body);
  if (actual !== item.sha256) {
    process.stderr.write(`post-archive reseal hash differs: ${currentPath}\n`);
    process.exit(1);
  }
}
const planningTasks = execFileSync(
  "git",
  [
    "show",
    "671738d7fb882279dd34ee6d37118cf14329dce9:openspec/changes/establish-formal-rewrite-baseline/tasks.md",
  ],
  { encoding: "utf8" },
);
const planningSeal = planningTasks.match(
  /^FORMAL_APPROVAL_MANIFEST_SHA256=([0-9a-f]{64})$/m,
)?.[1];
if (planningSeal !== oldSeal) process.exit(1);
const delta = fs.readFileSync(deltaPath, "utf8");
const rootSpec = fs.readFileSync(rootSpecPath, "utf8");
const deltaBody = delta
  .split("## ADDED Requirements\n")[1]
  ?.replace(/^\n/, "");
const rootBody = rootSpec.split("## Requirements\n")[1];
if (!deltaBody || !rootBody || deltaBody !== rootBody) {
  process.stderr.write("archived delta and synchronized root requirements differ\n");
  process.exit(1);
}
if (!rootSpec.endsWith("\n") || rootSpec.endsWith("\n\n")) {
  process.stderr.write("root spec is not canonical single-LF\n");
  process.exit(1);
}
if (Buffer.byteLength(rootSpec) !== 28036) {
  process.stderr.write("root spec byte length differs\n");
  process.exit(1);
}
NODE

openspec validate --all --strict --json --no-interactive
```

Post-archive approval-seal and exact-tree gate:

```zsh
set -euo pipefail

node <<'NODE'
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = "/Users/luca/dev/BangumiStaffStats";
const activePrefix =
  "openspec/changes/establish-formal-rewrite-baseline/";
const archivePrefix =
  "openspec/changes/archive/2026-07-23-establish-formal-rewrite-baseline/";
const manifestPath = `${archivePrefix}.approval-manifest.json`;
const archivedTaskPath = `${archivePrefix}tasks.md`;
const digest = value =>
  crypto.createHash("sha256").update(value).digest("hex");
const normalizeTasks = value =>
  value
    .replace(/^(\s*-\s*)\[[ xX]\]/gm, "$1[ ]")
    .replace(
      /^FORMAL_APPROVAL_MANIFEST_SHA256=[0-9a-f]{64}$/m,
      "FORMAL_APPROVAL_MANIFEST_SHA256=<APPROVAL_MANIFEST_SHA256>",
    );
if (
  digest(fs.readFileSync("openspec/specs/contracts-rewrite-baseline/spec.md")) !==
  "78a68814751b268f802979742d683fb1a72945ff7f3e030e1da0f2121c8cf02f"
) {
  process.stderr.write("curated root spec hash differs\n");
  process.exit(1);
}
const archivedTaskBody = fs.readFileSync(archivedTaskPath, "utf8");
const digestMatch = archivedTaskBody.match(
  /^FORMAL_APPROVAL_MANIFEST_SHA256=([0-9a-f]{64})$/m,
);
if (!digestMatch) process.exit(1);
const manifestSha = digestMatch[1];
if (digest(fs.readFileSync(manifestPath)) !== manifestSha) process.exit(1);
const planningCommit = execFileSync(
  "git",
  [
    "log",
    "--format=%H",
    "--grep=^chore: approve formal rewrite baseline spec$",
    "-n",
    "1",
  ],
  { encoding: "utf8" },
).trim();
if (!planningCommit) process.exit(1);
const approvedTaskBody = execFileSync(
  "git",
  ["show", `${planningCommit}:${activePrefix}tasks.md`],
  { encoding: "utf8" },
);
const approvedDigestMatch = approvedTaskBody.match(
  /^FORMAL_APPROVAL_MANIFEST_SHA256=([0-9a-f]{64})$/m,
);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const planningSeal =
  "f42737d0d31bab3c04bb2d95a4e8b64a832340e3728e793656ac8314902b5635";
if (
  !approvedDigestMatch ||
  approvedDigestMatch[1] !== planningSeal ||
  manifest.supersedesPlanningManifestSha256 !== planningSeal ||
  manifest.resealReason !== "post-archive-root-spec-eof-canonicalization"
) {
  process.stderr.write("archived reseal provenance differs\n");
  process.exit(1);
}
for (const item of manifest.files) {
  const currentPath = item.path.startsWith(activePrefix)
    ? `${archivePrefix}${item.path.slice(activePrefix.length)}`
    : item.path;
  const body = fs.readFileSync(currentPath);
  const checked =
    currentPath === archivedTaskPath
      ? digest(normalizeTasks(body.toString("utf8")))
      : digest(body);
  if (checked !== item.sha256) {
    process.stderr.write(`archived approval hash differs: ${currentPath}\n`);
    process.exit(1);
  }
}

const delta = fs.readFileSync(
  `${archivePrefix}specs/contracts-rewrite-baseline/spec.md`,
  "utf8",
);
const rootSpec = fs.readFileSync(
  "openspec/specs/contracts-rewrite-baseline/spec.md",
  "utf8",
);
const deltaBody = delta
  .split("## ADDED Requirements\n")[1]
  ?.replace(/^\n/, "");
const rootBody = rootSpec.split("## Requirements\n")[1];
if (!deltaBody || !rootBody || deltaBody !== rootBody) {
  process.stderr.write("archived delta and synchronized root requirements differ\n");
  process.exit(1);
}
if (!rootSpec.endsWith("\n") || rootSpec.endsWith("\n\n")) {
  process.stderr.write("root spec is not canonical single-LF\n");
  process.exit(1);
}

const allow = /^(\.gitignore|LICENSE|PRODUCT\.md|DESIGN\.md|\.codex\/hooks\.json|\.codex\/skills\/openspec-(apply-change|archive-change|explore|propose|sync-specs|update-change)\/SKILL\.md|\.agents\/skills\/impeccable\/.+|\.impeccable\/design\.json|tmp-formal-development\/(backend-development-implementation-guide|backend-operations-implementation-guide|data-logic-implementation-guide|frontend-production-cleanup-and-architecture-plan|formal-development-master-plan)\.md|tmp-formal-development\/decisions\/prototype-data-logic-audit\.md|openspec\/config\.yaml|openspec\/specs\/contracts-rewrite-baseline\/spec\.md|openspec\/changes\/archive\/2026-07-23-establish-formal-rewrite-baseline\/(\.openspec\.yaml|\.approval-manifest\.json|proposal\.md|design\.md|tasks\.md|specs\/contracts-rewrite-baseline\/spec\.md))$/;
const physical = [];
function walk(directory, relative = "") {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (relative === "" && entry.name === ".git") continue;
    const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
    const childAbsolute = path.join(directory, entry.name);
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      walk(childAbsolute, childRelative);
    } else {
      physical.push(childRelative);
    }
  }
}
walk(root);
physical.sort();
const unexpected = physical.filter(file => !allow.test(file));
if (unexpected.length) {
  process.stderr.write(`unexpected post-archive paths:\n${unexpected.join("\n")}\n`);
  process.exit(1);
}
const required = [
  "openspec/specs/contracts-rewrite-baseline/spec.md",
  `${archivePrefix}.openspec.yaml`,
  manifestPath,
  `${archivePrefix}proposal.md`,
  `${archivePrefix}design.md`,
  archivedTaskPath,
  `${archivePrefix}specs/contracts-rewrite-baseline/spec.md`,
];
for (const file of required) {
  if (!physical.includes(file)) {
    process.stderr.write(`missing post-archive path: ${file}\n`);
    process.exit(1);
  }
}
NODE
```

Exact archive staging and commit:

```zsh
set -euo pipefail

FORMAL_ARCHIVE_DATE=2026-07-23
FORMAL_CHANGE=establish-formal-rewrite-baseline
FORMAL_ACTIVE="openspec/changes/${FORMAL_CHANGE}"
FORMAL_ARCHIVE="openspec/changes/archive/${FORMAL_ARCHIVE_DATE}-${FORMAL_CHANGE}"
FORMAL_CLEANUP="${FORMAL_CLEANUP:?cleanup OID must be carried forward}"

test "$(git rev-parse HEAD)" = "$FORMAL_CLEANUP"
test "$(git show -s --format=%s "$FORMAL_CLEANUP")" = \
  "chore: establish formal rewrite baseline"

test "$(git write-tree)" = \
  4ec4543e89350085e0d3844c753e20c4383af9fd
archive_stage_paths=(
  "${FORMAL_ARCHIVE}/.approval-manifest.json"
  "${FORMAL_ARCHIVE}/proposal.md"
  "${FORMAL_ARCHIVE}/design.md"
  "${FORMAL_ARCHIVE}/tasks.md"
  "${FORMAL_ARCHIVE}/specs/contracts-rewrite-baseline/spec.md"
  openspec/specs/contracts-rewrite-baseline/spec.md
  tmp-formal-development/formal-development-master-plan.md
)

git add -- "${archive_stage_paths[@]}"
git diff --quiet
git diff --cached --check
test -z "$(git ls-files --others --exclude-standard)"
test -z "$(
  git status \
    --porcelain=v1 \
    --ignored=matching \
    --untracked-files=all |
  awk '$1 == "!!" { print }'
)"

node <<'NODE'
const { execFileSync } = require("child_process");
const active = "openspec/changes/establish-formal-rewrite-baseline";
const archive =
  "openspec/changes/archive/2026-07-23-establish-formal-rewrite-baseline";
const rel = [
  ".openspec.yaml",
  ".approval-manifest.json",
  "proposal.md",
  "design.md",
  "tasks.md",
  "specs/contracts-rewrite-baseline/spec.md",
];
const expected = [
  "openspec/specs/contracts-rewrite-baseline/spec.md",
  "tmp-formal-development/formal-development-master-plan.md",
  ...rel.flatMap(file => [`${active}/${file}`, `${archive}/${file}`]),
].sort();
const actual = execFileSync(
  "git",
  ["diff", "--cached", "--no-renames", "--name-only", "-z"],
  { encoding: "utf8" },
).split("\0").filter(Boolean).sort();
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  process.stderr.write("archive staged path set differs\n");
  process.exit(1);
}

const fs = require("fs");
const path = require("path");
const root = "/Users/luca/dev/BangumiStaffStats";
const tracked = execFileSync("git", ["ls-files", "-z"], {
  encoding: "utf8",
}).split("\0").filter(Boolean).sort();
const physical = [];
function walk(directory, relative = "") {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (relative === "" && entry.name === ".git") continue;
    const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
    const childAbsolute = path.join(directory, entry.name);
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      walk(childAbsolute, childRelative);
    } else {
      physical.push(childRelative);
    }
  }
}
walk(root);
physical.sort();
if (JSON.stringify(physical) !== JSON.stringify(tracked)) {
  process.stderr.write("post-archive physical/index set differs\n");
  process.exit(1);
}
NODE

FORMAL_ARCHIVE_TREE="$(git write-tree)"
git -c core.hooksPath=/dev/null \
  commit -m "chore: archive formal rewrite baseline"

FORMAL_ARCHIVE_COMMIT="$(git rev-parse HEAD)"
test "$(git rev-parse "${FORMAL_ARCHIVE_COMMIT}^{tree}")" = \
  "$FORMAL_ARCHIVE_TREE"
test "$(
  git rev-list --parents -n 1 "$FORMAL_ARCHIVE_COMMIT" |
  awk "{print NF}"
)" = 2
test "$(git rev-parse "${FORMAL_ARCHIVE_COMMIT}^")" = "$FORMAL_CLEANUP"
test "$(git show -s --format=%s "$FORMAL_ARCHIVE_COMMIT")" = \
  "chore: archive formal rewrite baseline"
FORMAL_PLAN="$(git rev-parse "${FORMAL_CLEANUP}^")"
FORMAL_EVIDENCE="$(git rev-parse "${FORMAL_PLAN}^")"
FORMAL_ORACLE=644b7748674e553f863d0ffd61d029f86fdc0717
test "$(git show -s --format=%s "$FORMAL_CLEANUP")" = \
  "chore: establish formal rewrite baseline"
test "$(git show -s --format=%s "$FORMAL_PLAN")" = \
  "chore: approve formal rewrite baseline spec"
test "$(git rev-parse "${FORMAL_EVIDENCE}^")" = "$FORMAL_ORACLE"
test "$(git show -s --format=%s "$FORMAL_EVIDENCE")" = \
  "chore: preserve ignored prototype test"
test "$(git rev-parse \
  refs/heads/codex/person-workbench-unified-prototype)" = "$FORMAL_EVIDENCE"
test "$(
  shasum -a 256 openspec/specs/contracts-rewrite-baseline/spec.md |
  awk "{print \$1}"
)" = 78a68814751b268f802979742d683fb1a72945ff7f3e030e1da0f2121c8cf02f
test -z "$(
  git status \
    --porcelain=v1 \
    --ignored=matching \
    --untracked-files=all
)"

openspec validate \
  --all \
  --strict \
  --json \
  --no-interactive
```

After the archive commit, re-run the complete **Post-archive approval-seal and
exact-tree gate** verbatim against the clean committed tree. Also re-run the
physical/index equality portion of **Exact archive staging and commit** with no
cached diff expected. Any mismatch stops finalization before the second
main-agent acceptance.

Final handoff status MUST say: investigated, specified, evidence committed,
planning approved/committed, cleanup applied/accepted/committed, and archive
synced/committed are yes only with corresponding evidence; final main-agent
acceptance remains pending until performed; pushed, released, deployed, and
operations remain no. Wave 1 MUST NOT start before final acceptance.
