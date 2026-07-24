## Task Boundary

| Field | Declaration |
|---|---|
| Status | investigated: complete; specified: initial checkpoint and both observed corrections approved; implemented: partial candidates retained; verified: paused-state seals, generator-pruning diagnosis, strict validation, and independent spec review complete; committed: planning/correction control history only, product not committed; pushed: no; released: no; deployed: no |
| Owner | Contracts Archive apply subagent for this checklist; one separate paired finalization subagent alone stages/archives/commits after both candidates are accepted; main agent reviews/amends OpenSpec and performs read-only acceptance |
| Writable paths | Apply: exactly `contracts/schemas/archive/**`, `contracts/goldens/archive/**`, and this file’s checkbox transitions. Finalization workflow: only the exact accepted Archive/query contract union and the two OpenSpec archive/root-spec outputs defined by the approved specs |
| Read-only protected inputs | `PRODUCT.md`, `DESIGN.md`, `openspec/config.yaml`, existing root specs, all formal-development guides/decisions, Impeccable, fixed oracle `644b7748674e553f863d0ffd61d029f86fdc0717`, and all sibling query bytes |
| Deletion complement | Every path outside this owner’s two apply roots; no pre-existing/unlisted file in them may be deleted/renamed. Sibling query paths are tolerated dirty state only and never writable by this owner |
| Mutable refs | Accepted checkpoints are `c7f868e2861e8fea250f033c27538ecf793bacad` and `ad5bf1a0fbca06aba1f7d2cff5be66e1d726701c`. One second observed correction subagent may advance the branch from `ad5bf1a0fbca06aba1f7d2cff5be66e1d726701c` with exact subject `docs(openspec): approve wave 1 query codegen correction` and exactly eight approved OpenSpec artifact paths while product/cache/temp output remains unstaged and sealed. After main-agent acceptance: this `tasks.md` checkbox state only; index and Git refs immutable. Finalization: that branch only through the exact accepted combined Wave 1A commit |
| Consumes | Approved Archive proposal/design/spec/tasks; approved sibling planning change only as an execution-boundary snapshot; root baseline capability; master/backend/data/audit authorities |
| Produces | Exact Archive schema/DDL/tooling inventory, exact valid/invalid golden inventory, path/hash/test handoff, and an unstaged candidate accepted independently of the query candidate |
| Dependencies | Common clean planning checkpoint containing both approved change dirs; `establish-formal-rewrite-baseline`; no Python/Go application runtime |
| Deliverables | Contract schemas, compatibility matrix, SQLite v1 DDL, four tooling files, closed golden corpus, strict verification, generation-feasibility evidence, and paired finalization handoff |
| Acceptance | Exact commands below; path-scoped diff/ignored checks; empty index throughout apply; strict OpenSpec/schema/vector/SQLite/codegen checks; no browser test because no UI is created |
| Non-goals | Runtime producer/consumer, full data, query/API/frontend, actual `current.json`, activation, independent Archive commit/archive, or any sibling edit |
| Operations deferred | nginx/systemd/Compose/timers/`flock`, production filesystem/permissions/secrets, pointer switch/restart/rollback, retention, release/deploy/host work |
| Stop/rollback conditions | Stop on root/branch/HEAD/index/approval/dirty/sibling/path/tool/vector drift. Preserve both candidates; never reset hard, checkout rollback, clean, `git add -A`, broad recursive delete, stage/commit/archive while sibling runs, amend/rebase, or write outside declared paths |

The paired sibling allowance is exact and read-only:

```text
openspec/changes/define-shared-query-wire/tasks.md
contracts/openapi/**
contracts/schemas/query/**
contracts/goldens/query/**
```

Every command runs from `/Users/luca/dev/BangumiStaffStats`. `WAVE1A_PLANNING_HEAD` is the exact approved common planning commit supplied by the main-agent handoff; it is not inferred from a moving branch.

Before this apply owner starts, one separate delegated checkpoint subagent—not the main agent and not either apply owner—must stage only the two approved active change directories, create the reviewed planning commit, and stop. The main agent verifies that exact commit read-only.

### Observed correction protocol (not a task checkbox)

The first Archive-toolchain correction was accepted at `ad5bf1a0fbca06aba1f7d2cff5be66e1d726701c`. Apply later exposed a sibling Query default-pruning defect, so both owners are stopped again at that exact HEAD with an empty index. Archive tasks 1.1–1.4 and 2.1–2.4 alone are checked and `contracts/goldens/archive` is absent. For its two roots, the SHA-256 of `LC_ALL=C` NUL-path-sorted `shasum -a 256` lines is: 11 persistent regular files excluding `node_modules/.cache/.tmp` → `070e38ecc0a91750ffc0e98900f50f0987c26d775a85aa137d39c540c21df427`; all 6,181 regular files → `5b8b8801d5b672d5ffc643483d04c3c3fa239ac45015820640843520bdd71629`. The sorted `path<TAB>readlink-target<LF>` stream for 13 symlinks seals to `8721691feb55259ac161846b32d87fce8e2fc9a4a21ffb551e8b3459f183f7ea`.

Query tasks 1.1–1.3 alone are checked; its 23 persistent/all-13,025 regular-file seals are `2a2483d6b91d5b764db1e6c722137fd707f5b79f8a3310b20285a291b9a5779f` and `84c216d846b03990ce5f7ba50fd006045df32d513fa6dcb3e15e6ba402720cf6`, and its seven-symlink seal is `4aa5af9e55948f608d1ef3d7f06ca5d76775946c2638deef2db7276d264fbfae` under the same formulas.

A separate quiescent correction subagent may stage exactly the eight proposal/design/spec/tasks paths, no product/cache/temp path, and create only a commit whose sole parent is `ad5bf1a0fbca06aba1f7d2cff5be66e1d726701c` and subject is `docs(openspec): approve wave 1 query codegen correction`. It runs no product-writing command. After main-agent acceptance and unchanged seals/check sets, this original Archive owner re-proves the replacement HEAD/sibling boundary and resumes at 2.5; Query resumes at 2.1. This lifecycle evidence is intentionally not another completion checkbox.

## 1. Contracts owner — common Wave 1A preflight and approval gate

- [x] 1.1 Before the first write, verify the canonical root, `codex/formal-rewrite`, exact `WAVE1A_PLANNING_HEAD`, ordinary baseline ancestry, empty index, completely clean worktree/untracked/ignored state, and presence of both committed active change directories; stop without mutation on any mismatch.
- [x] 1.2 Verify both changes are artifact-complete, `openspec validate --all --strict` and `openspec doctor --json` pass, this change’s proposal/design/spec/tasks bytes equal the main-agent-approved planning checkpoint, and the approval record has zero unresolved P0/P1 findings.
- [x] 1.3 Record the HEAD tree/hash inventory of `openspec/changes/define-shared-query-wire/**` and the sibling’s four exact task/apply roots; prove they do not overlap this change’s `tasks.md`, `contracts/schemas/archive/**`, or `contracts/goldens/archive/**`.
- [x] 1.4 End the group by rerunning the empty-index and clean-status checks plus strict validation; record `investigated=yes`, `specified=yes`, `implemented=no`, `verified=preflight-only`, `committed=planning-checkpoint-only`, `pushed=no`, `released=no`, `deployed=no`.

Exact initial commands:

```sh
test "$(git rev-parse --show-toplevel)" = "/Users/luca/dev/BangumiStaffStats"
test "$(git branch --show-current)" = "codex/formal-rewrite"
test -n "${WAVE1A_PLANNING_HEAD:-}"
test "$(git rev-parse HEAD)" = "$WAVE1A_PLANNING_HEAD"
git merge-base --is-ancestor e5d67d7d74614b7a95da4a7887caa8e1f25bc307 HEAD
test -z "$(git diff --cached --name-only)"
test -z "$(git status --porcelain=v1 --untracked-files=all)"
test -z "$(git ls-files --others --ignored --exclude-standard)"
test -f openspec/changes/define-archive-manifest-contract/.openspec.yaml
test -f openspec/changes/define-shared-query-wire/.openspec.yaml
git diff --exit-code HEAD -- openspec/changes/define-archive-manifest-contract
git diff --exit-code HEAD -- openspec/changes/define-shared-query-wire
openspec status --change define-archive-manifest-contract --json | jq -e '.isComplete == true'
openspec status --change define-shared-query-wire --json | jq -e '.isComplete == true'
openspec validate --all --strict
openspec doctor --json
git ls-tree -r --full-tree HEAD -- openspec/changes/define-shared-query-wire | git hash-object --stdin
```

## 2. Contracts owner — `contracts/schemas/archive/**`

- [x] 2.1 Before schema writes, reverify root/branch/exact HEAD, empty index, approval seal, and changed-path union. Allow only the exact sibling roots plus any already-created Archive roots/task checkbox changes; stop rather than restoring either owner’s bytes.
- [x] 2.2 Create exactly `README.md`, the four strict JSON Schemas, `compatibility-matrix.json`, and canonical `schema.sql`; encode the fixed versions, complete SQLite v1 facts/catalog tables/constraints/indexes, preserved raw unknown-position credit without fabricated catalog row, the seven exact Archive basenames, fixed golden common commit, JSON-safe source accounting equation, strict manifest/pointer shapes, cycle-free digest graph, canonical dataVersion bytes, compatibility tuple, validation precedence, and explicit no-`current.json` boundary.
- [x] 2.3 Create exactly the four approved tooling files. Pin `ajv@8.20.0` and `quicktype@26.0.0` as the only direct dev dependencies; add exact npm `overrides.stream-json=2.1.0` to repair quicktype's Node-20.19-vs-transitive-Node-22 engine conflict; lock the graph; require `npm ls quicktype stream-json` to resolve only `26.0.0`/`2.1.0`, no `3.5.0`, and require `require("stream-json").parser.asStream` callable. Implement strict schema/vector/hash verification and stdlib SQLite fixture construction without adding any other tool/dependency/file.
- [x] 2.4 Require `node >=20.19.0` and `npm >=10`; route configurable npm and Go build/module/workspace caches, installed packages, process temporary files, fixture scratch, Python bytecode, and codegen output only below the declared Archive schema root; verify effective npm cache/`GOCACHE`/`GOMODCACHE`/`GOPATH`/`TMPDIR`, set `GOENV=off`, `GOWORK=off`, and `GOTOOLCHAIN=local`, enable npm engine-strict mode, and disable Python bytecode writes. Before any ordinary Go process, run the absolute Go executable's `go env GOTELEMETRY GOTELEMETRYDIR` with those Go controls inside a bootstrap macOS `sandbox-exec` profile containing `(allow default)`, `(deny network*)`, and `(deny file-write*)`. Stop on upload-enabled/unknown returned mode, then canonicalize and byte-seal the returned directory. For local mode, run every later Go-starting command through a reviewed profile denying `file-write*` beneath that directory; never change global mode, interpret/delete counters, or authorize upload. Run schema compilation, DDL construction/integrity/foreign-key/object checks, and temporary Python/Go generation smoke, then require the telemetry seal unchanged; do not require updater/backend application packages or Go 1.26 features.
- [ ] 2.5 End the group by removing only the three exact verified ephemeral roots, proving the persistent schema path set equals the approved inventory, proving no ignored/generated output remains under either Archive root, running path-scoped diff checks, and confirming the global index is still empty. Do not stage or commit.

Exact schema/tool commands after the files exist follow. When the recorded telemetry mode is `local`, the `verify:codegen` command SHALL be executed inside the approved write-denial `sandbox-exec` profile so every descendant Go process inherits it; the verifier SHALL also apply that wrapper to any nested Go command:

```sh
mkdir -p contracts/schemas/archive/.tmp/system
TMPDIR="$PWD/contracts/schemas/archive/.tmp/system" PYTHONDONTWRITEBYTECODE=1 python3 contracts/schemas/archive/tooling/build_sqlite_fixtures.py --self-test
TMPDIR="$PWD/contracts/schemas/archive/.tmp/system" npm_config_engine_strict=true npm_config_cache="$PWD/contracts/schemas/archive/.cache/npm" npm ci --prefix contracts/schemas/archive/tooling --ignore-scripts
TMPDIR="$PWD/contracts/schemas/archive/.tmp/system" npm_config_engine_strict=true npm_config_cache="$PWD/contracts/schemas/archive/.cache/npm" npm --prefix contracts/schemas/archive/tooling run verify:schemas
TMPDIR="$PWD/contracts/schemas/archive/.tmp/system" npm_config_engine_strict=true npm_config_cache="$PWD/contracts/schemas/archive/.cache/npm" GOCACHE="$PWD/contracts/schemas/archive/.cache/go-build" GOMODCACHE="$PWD/contracts/schemas/archive/.cache/go-mod" GOPATH="$PWD/contracts/schemas/archive/.cache/go-path" GOENV=off GOWORK=off GOTOOLCHAIN=local npm --prefix contracts/schemas/archive/tooling run verify:codegen
git diff --check -- openspec/changes/define-archive-manifest-contract/tasks.md contracts/schemas/archive contracts/goldens/archive
test -z "$(git diff --cached --name-only)"
```

Before exact cleanup, each target MUST be a non-symlink canonical descendant of `/Users/luca/dev/BangumiStaffStats/contracts/schemas/archive/`; only these targets may be recursively removed:

```text
contracts/schemas/archive/.cache
contracts/schemas/archive/.tmp
contracts/schemas/archive/tooling/node_modules
```

After cleanup:

```sh
test ! -e contracts/schemas/archive/.cache
test ! -e contracts/schemas/archive/.tmp
test ! -e contracts/schemas/archive/tooling/node_modules
test -z "$(git ls-files --others --ignored --exclude-standard -- contracts/schemas/archive contracts/goldens/archive)"
test -z "$(git diff --cached --name-only)"
```

## 3. Contracts owner — `contracts/goldens/archive/**`

- [ ] 3.1 Before golden writes, reverify root/branch/exact HEAD, empty index, approval seal, the exact persistent schema inventory, and the changed-path union. Tolerate only the snapshotted sibling roots and never treat them as an input to Archive generation or verification.
- [ ] 3.2 Implement `vectors/data-version.json` and the minimal valid `archive-manifest.json`, inert `current-pointer.json`, and `bangumi.sqlite`. Prove the fixed canonical preimage/byte length/dataVersion, final SQLite digest, manifest byte digest, fixed common commit, seven-source accounting, preserved unknown-position raw credit/unresolved evidence, embedded metadata, table counts, constraints/indexes, and sentinel results agree without a self-reference.
- [ ] 3.3 Implement exactly the approved invalid JSON and invalid bundle directories, including `manifest-source-accounting-mismatch.json` and `sqlite-table-count-mismatch`. Make each case reach its indexed first failure, including accounting equation failure before compatibility, a corrupt SQLite whose manifest digest matches the corrupt bytes so it fails at format rather than digest, and a count mismatch whose earlier gates all pass.
- [ ] 3.4 Generate `index.json` last and make it a closed-world inventory of every other golden path, SHA-256, case, validation stage, and expected stable result. Reject missing/extra/duplicate/symlink/non-regular/hash-drifted files.
- [ ] 3.5 Run the complete schema, dataVersion, digest, path-safety, compatibility, SQLite, fixture-index, and temporary Python/Go generation acceptance. Re-run the builder in `--check` mode so generation cannot rewrite accepted golden bytes.
- [ ] 3.6 End the group by cleaning the three exact ephemeral roots, proving the approved persistent file inventory with no actual `current.json`, no ignored output under this owner, a path-scoped clean diff check, strict OpenSpec validation, and an empty global index. Do not stage, commit, archive, download Archive/common data, or write another path.

Exact full acceptance commands follow. When the recorded telemetry mode is `local`, the `verify` command SHALL be executed inside the same approved write-denial `sandbox-exec` profile so every descendant Go process inherits it:

```sh
mkdir -p contracts/schemas/archive/.tmp/system
TMPDIR="$PWD/contracts/schemas/archive/.tmp/system" PYTHONDONTWRITEBYTECODE=1 python3 contracts/schemas/archive/tooling/build_sqlite_fixtures.py --write
TMPDIR="$PWD/contracts/schemas/archive/.tmp/system" PYTHONDONTWRITEBYTECODE=1 python3 contracts/schemas/archive/tooling/build_sqlite_fixtures.py --check
TMPDIR="$PWD/contracts/schemas/archive/.tmp/system" npm_config_engine_strict=true npm_config_cache="$PWD/contracts/schemas/archive/.cache/npm" npm ci --prefix contracts/schemas/archive/tooling --ignore-scripts
TMPDIR="$PWD/contracts/schemas/archive/.tmp/system" npm_config_engine_strict=true npm_config_cache="$PWD/contracts/schemas/archive/.cache/npm" GOCACHE="$PWD/contracts/schemas/archive/.cache/go-build" GOMODCACHE="$PWD/contracts/schemas/archive/.cache/go-mod" GOPATH="$PWD/contracts/schemas/archive/.cache/go-path" GOENV=off GOWORK=off GOTOOLCHAIN=local npm --prefix contracts/schemas/archive/tooling run verify
TMPDIR="$PWD/contracts/schemas/archive/.tmp/system" PYTHONDONTWRITEBYTECODE=1 python3 contracts/schemas/archive/tooling/build_sqlite_fixtures.py --check
test -z "$(find contracts/schemas/archive contracts/goldens/archive -name current.json -print)"
git diff --check -- openspec/changes/define-archive-manifest-contract/tasks.md contracts/schemas/archive contracts/goldens/archive
openspec validate define-archive-manifest-contract --strict
openspec validate --all --strict
test -z "$(git diff --cached --name-only)"
```

After the same exact validated cleanup as group 2:

```sh
test ! -e contracts/schemas/archive/.cache
test ! -e contracts/schemas/archive/.tmp
test ! -e contracts/schemas/archive/tooling/node_modules
test -z "$(git ls-files --others --ignored --exclude-standard -- contracts/schemas/archive contracts/goldens/archive)"
test -z "$(git diff --cached --name-only)"
```

Browser acceptance is not applicable: this change creates no HTML, CSS, JavaScript application, route, server, or user-visible surface.

## 4. Contracts owner — unstaged candidate seal and main-agent acceptance

- [ ] 4.1 Before sealing, reverify root/branch/exact planning HEAD, empty index, approved artifact bytes, no Archive ephemeral/ignored output, and the exact changed-path union. The only tolerated non-Archive changes are the sibling’s exact task/apply roots.
- [ ] 4.2 Produce a deterministic Archive candidate manifest containing every owned physical path, Git status, mode, byte size, SHA-256/Git blob where applicable, schema/tool versions, local Python/Node/Go/SQLite feasibility versions, every exact command/result, and explicit states for investigated/specified/implemented/verified/committed/pushed/released/deployed. Store it only in the agent handoff, not as a repository file.
- [ ] 4.3 Stop with all Archive outputs unstaged and no ref mutation. The main agent SHALL perform read-only path/schema/vector/SQLite/tooling acceptance and return zero P0/P1 findings plus the exact accepted candidate seal before this owner marks the implementation candidate accepted.
- [ ] 4.4 After acceptance, rerun the seal without changing accepted bytes, record `implemented=yes`, `verified=yes`, `committed=no`, `pushed=no`, `released=no`, `deployed=no`, and stop permanently. Do not stage, commit, archive, or modify the sibling candidate.

Path-scoped candidate commands:

```sh
test "$(git rev-parse HEAD)" = "$WAVE1A_PLANNING_HEAD"
test -z "$(git diff --cached --name-only)"
git diff --check -- openspec/changes/define-archive-manifest-contract/tasks.md contracts/schemas/archive contracts/goldens/archive
git diff --name-status -- openspec/changes/define-archive-manifest-contract/tasks.md contracts/schemas/archive contracts/goldens/archive
git ls-files --others --exclude-standard -- contracts/schemas/archive contracts/goldens/archive
find contracts/schemas/archive contracts/goldens/archive -type l -print
find contracts/schemas/archive contracts/goldens/archive -name current.json -print
openspec validate --all --strict
```

## 5. Paired finalization handoff — no Archive-owner mutation

- [ ] 5.1 After both apply agents are stopped and both candidates are independently accepted, provide the finalization subagent with the exact planning HEAD, two active-change seals, two candidate path/hash inventories, exact allowed combined union, exact phase subject `feat(contracts): establish wave 1 shared contracts`, and the requirement to read/follow `openspec-archive-change` before mutation.
- [ ] 5.2 Require the finalization subagent alone to re-prove empty index and exact combined state; archive only `define-archive-manifest-contract` and `define-shared-query-wire`; stage only their accepted contract outputs, active-change deletions, two generated archive directories, and two synchronized root specs; run strict/cached/path/hash checks; then stop for final main-agent read-only acceptance before creating the one phase commit.
- [ ] 5.3 Require fail-closed behavior on any extra/missing/drifted path or byte. After final acceptance, the same finalization subagent creates the exact-subject commit and proves clean index/worktree, correct single parent/delta, both root specs strict-valid, and final states `committed=yes`, `pushed=no`, `released=no`, `deployed=no`; it does not amend, squash, push, tag, release, deploy, or activate.

The Archive apply owner MUST NOT execute this finalization protocol. Finalization paths do not broaden its product writable paths; they are the two approved OpenSpec archive/sync outputs and exact accepted combined contract union. All operations, actual `current.json`, full data acquisition/build, and runtime implementation remain deferred.
