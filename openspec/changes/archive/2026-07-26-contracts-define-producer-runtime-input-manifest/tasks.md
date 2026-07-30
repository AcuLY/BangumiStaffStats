## Task Boundary

| Field | Declaration |
|---|---|
| Status | Apply-ready after strict validation and main-agent approval. |
| Owner | One Contracts implementation subagent. |
| Writable paths | Exact new manifest/schema/lib/test, one CLI command hunk, exact statement schema/emitter/validator additions and affected artifact tests, and this change's task markers. |
| Read-only protected inputs | All selected authority, other product/harness/CI/operations paths, refs/remotes, and external state. |
| Deletion complement | None. |
| Mutable refs | None during apply. |
| Consumes | Approved artifacts and current selected source bytes. |
| Produces | Canonical 42-file producer-runtime input authority and Updater component-statement binding. |
| Dependencies | No overlapping Contracts owner; Node standard library only. |
| Deliverables | Manifest/schema/validator/command/tests and evidence. |
| Acceptance | Exact derivation, comprehensive negatives, full artifact tests, strict OpenSpec, diff/residue. |
| Non-goals | Source authority edits, packaging, Updater/operations implementation, deploy. |
| Operations deferred | Release assembly and all external mutation. |
| Stop/rollback conditions | Stop on dirty overlap, ambiguous closure, protected edit, unexpected path, dependency need, or residue. |

## 1. Manifest authority

- [x] 1.1 Preflight branch/HEAD, exact dirty allowlist, selected source
  inventory/modes, and absence of an overlapping Contracts owner.
- [x] 1.2 Add the strict v1 schema and canonical manifest with the exact
  42-file derivation, sizes, digests, total, and file-set digest.
- [x] 1.3 Implement the pure validator and bounded CLI command using only
  existing helpers and Node standard library.
- [x] 1.4 Require the logical producer-runtime manifest input in the Updater
  component statement schema, emitter, offline validator, and affected fixtures.

## 2. Verification

- [x] 2.1 Add focused positive/determinism and comprehensive malformed,
  unsafe-path, duplicate/order, missing/extra, digest/size, index disagreement,
  symlink/hard-link/special-file, mode, statement-binding, and
  noncanonical-input negatives.
- [x] 2.2 Run focused and full Contracts artifact tests, current-root CLI,
  independent closure recomputation, strict OpenSpec, exact diff and residue.
- [x] 2.3 Hand off unstaged; main agent audits, syncs, archives, and commits
  before Updater artifact packaging begins.
