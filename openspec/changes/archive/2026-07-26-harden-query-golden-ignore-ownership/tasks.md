## Task Boundary

| Field | Declaration |
|---|---|
| Owner | One delegated Contracts owner implements; main agent owns spec, review, task markers, sync/archive, commits, and formal acceptance. |
| Writable paths | `contracts/goldens/query/verify.mjs`; exactly two evidence objects in `contracts/goldens/query/manifest.json`; this change's task markers. |
| Protected paths | Root `.gitignore`, all other product/contract files, acceptance harness, other OpenSpec paths, refs/remotes, external state, and production. |
| Acceptance | Locked Query gate with deterministic projection negatives, cleanup/residue, strict OpenSpec, and exact diff review. |

## 1. Query owner implementation

- [x] 1.1 Replace whole-root-ignore byte equality with fatal UTF-8, LF-only,
  final-LF, and exact ordered Query-owned projection validation.
- [x] 1.2 Add deterministic in-process negative cases for missing, duplicate,
  reordered, broadened, CRLF, invalid-UTF-8, and no-final-LF inputs, plus an
  accepted document containing unrelated owner rules.
- [x] 1.3 Update only the Query-owned ignore descriptor and verifier
  bytes/SHA-256 in the manifest.
- [x] 1.4 Run locked install, full verifier/codegen, cleanup-safety, exact
  cleanup, second read-only verification, strict OpenSpec, diff, inventory,
  Git state, and physical residue checks; hand off unstaged.

## 2. Main acceptance and lifecycle

- [x] 2.1 Audit exact path/field scope and rerun the material Query/OpenSpec
  gates with no generated residue or protected mutation.
- [x] 2.2 Sync the delta, archive this change, and prepare the exact reviewed
  correction before rebuilding artifacts and rerunning integrated acceptance.
