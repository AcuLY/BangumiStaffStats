## Task Boundary

| Field | Declaration |
|---|---|
| Status | investigated: complete; specified: complete; implemented: no; verified: no; committed: no; pushed: no; released: no; deployed: no |
| Apply owner | One Contracts implementation subagent. |
| Writable paths | Exact five affected API `verify.mjs` files and `contracts/artifacts/test/ci-policy.test.mjs`. |
| Protected paths | Every other repository path and all external state. |
| Generated state | Only exact package-local `node_modules`, `.cache`, and `.tmp` during verification; remove through exact guarded package paths before handoff. |
| Git/OpenSpec lifecycle | Main agent only. Apply does not stage, commit, push, sync, archive, or update task markers. |

## 1. Admission and implementation

- [x] 1.1 Record clean HEAD/index/worktree, active changes, exact owned-file
  preimages, and the five unchanged package/lock identities. Confirm formal
  failure is the sibling `frontend/node_modules` import and stop on any other
  protected drift.
- [x] 1.2 In Rankings, Candidates, Person Detail, Partners, and Co-Star, replace
  only the dynamic tool-root AJV imports with package-local bare imports.
  Remove obsolete `pathToFileURL`, `toolRoot`, and `*_TOOL_ROOT` handling.
  Preserve every other verifier byte and output.
- [x] 1.3 Extend the existing CI policy test to enumerate exactly Catalog plus
  the five affected packages, require exact local AJV declarations/imports,
  and reject sibling/root `node_modules`, Frontend, URL-built dependency
  imports, or tool-root environment escape hatches.

## 2. Verification and handoff

- [x] 2.1 Run the focused CI-policy test and syntax-check all six verifiers.
  Prove the five package manifests and locks and every schema/golden/OpenAPI
  path remain byte-identical.
- [x] 2.2 With `frontend/node_modules` absent, independently run exact
  install/verify for Catalog, Rankings, Candidates, Person Detail, Partners,
  and Co-Star using Node 24.18.0/npm 11.16.0 with install scripts disabled and
  engine strict. Record all six exits and remove only their exact generated
  roots.
- [x] 2.3 Run all Contracts artifact tests, strict validation for this change
  and all OpenSpec items, `git diff --check`, exact-path diff, residue, and Git
  status. Report exact commands/files/results; do not stage or commit.

## 3. Main-agent lifecycle

- [x] 3.1 Main agent audits the import-only verifier diff and regression test,
  independently repeats focused verification, marks completed tasks, and
  commits the reviewed implementation.
- [x] 3.2 Main agent synchronizes and archives this repair and verifies that
  only the acceptance change remains active. Product resealing, source-bound
  artifact rebuilds, and resumed formal acceptance continue under
  `complete-integrated-development-acceptance`; no release, deployment, or
  operations claim follows from this repair.
