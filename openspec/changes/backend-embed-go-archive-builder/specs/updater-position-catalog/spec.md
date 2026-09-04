## Capability Boundary

- **Status:** Existing Python catalog/cast/quality implementation retired after the Go builder matches its accepted outputs.
- **Owner:** Contracts retains catalog semantics; Backend `backend-archive-builder` becomes the production compiler; Updater retains no runtime owner.
- **Writable paths:** This delta spec and, after parity, the exact `updater/src/**/catalog/**`, matching tests, config packaging, and updater-only documentation declared by the change.
- **Read-only protected inputs:** `contracts/schemas/catalog/**`, `contracts/goldens/catalog/**`, Archive producer goldens, governed catalog semantics, real common/Archive bytes, and unrelated paths.
- **Deletion complement:** Only the exited Python catalog/compiler/adapter implementation and updater-only packaging may be deleted; catalog schemas, goldens, governed configuration meaning, and historical specs remain.
- **Mutable refs:** Local `codex/embed-go-archive-builder` only.
- **Consumes:** Accepted Go parity over common/catalog/cast/quality fixtures.
- **Produces:** No new runtime artifact; production responsibility is transferred to `backend-archive-builder`.
- **Dependencies:** `contracts-position-catalog`, `contracts-archive-goldens`, and the Go builder's real catalog integration.
- **Deliverables:** Retired Updater requirements and exact later source cleanup.
- **Acceptance:** The Go builder matches common/category/group/staff-set/cast/quality evidence before Python removal.
- **Non-goals:** Any catalog redesign, label/order/key change, cast inference, rule-version change, static enum, or product/query change.
- **Operations deferred:** Real common/Archive acquisition, deployment, host mutation, and production cleanup.
- **Stop/rollback conditions:** Stop if any catalog/cast/quality golden differs or a downstream consumer still requires Python bytes; rollback is parent `411f54b`.

## REMOVED Requirements

### Requirement: Apply SHALL begin only from the exited producer and accepted Contracts handoff
**Reason:** The historical Updater apply handoff is no longer the production implementation boundary.

**Migration:** The Go builder apply remains OpenSpec-first and consumes the same accepted Contracts inputs in the dedicated change worktree.

### Requirement: Common catalog compilation SHALL be complete and deterministic
**Reason:** Python no longer owns common compilation.

**Migration:** `backend-archive-builder` preserves five-type dynamic compilation, ordering, exact staff entities, unknown-position handling, and deterministic failure semantics against the same goldens.

### Requirement: Display groups, shortcuts, and staff sets SHALL compile from governed configuration
**Reason:** The governed compiler is moving to Go with no semantic delta.

**Migration:** The Go builder consumes the same display/staff-set documents and canonical digest algorithm and emits identical positions, groups, shortcuts, capabilities, rules, and dormant staff-set rows.

### Requirement: Cast SHALL use only exact same-subject evidence and the accepted global whitelist
**Reason:** Exact cast derivation remains required but is no longer produced by the Python updater.

**Migration:** The Go builder retains the global valid-person whitelist, exact same-subject joins, integer roles `1..6`, anime/game scope, and non-inferential behavior.

### Requirement: Quality evidence SHALL distinguish accepted gaps from blocking faults
**Reason:** Quality classification is moving with the production compiler.

**Migration:** The Go builder reproduces the same four manifest counts, bounded samples, unknown-position evidence, and blocking closure conditions.

### Requirement: Catalog and cast SHALL enter identity before immutable finalization
**Reason:** Python finalization is retired.

**Migration:** Go completes catalog/cast/quality before manifest and inactive publication, and the unchanged canonical catalog digest remains part of dataVersion.

### Requirement: Acceptance SHALL cover synthetic and complete sources without broadening scope
**Reason:** The Python-specific acceptance owner and artifact no longer exist.

**Migration:** Focused Go fixture parity runs during development; one accumulated complete-source Go build and Backend read probe replaces the former Python-to-Go smoke.
