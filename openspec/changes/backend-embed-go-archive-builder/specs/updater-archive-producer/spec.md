## Capability Boundary

- **Status:** Existing Python production capability retired only after Go parity is accepted; this delta changes planning ownership, not production state.
- **Owner:** Backend `backend-archive-builder` becomes the sole production writer; Updater source remains read-only reference until the final cleanup task.
- **Writable paths:** This delta spec and, during the later accepted cleanup task, only `updater/**` paths declared by the change.
- **Read-only protected inputs:** Existing Python producer source/tests before parity, Archive/contracts/catalog authorities, real Archive bytes, unrelated repository paths, remotes, hosts, and production.
- **Deletion complement:** Only the Python updater producer/package/tests and exact updater-only artifact inputs may be removed after Go parity; no Archive version, contract, golden, or historical OpenSpec is deleted.
- **Mutable refs:** Local `codex/embed-go-archive-builder` only.
- **Consumes:** Accepted Go parity evidence proving every retained producer outcome has moved to `backend-archive-builder`.
- **Produces:** No production artifact; this delta removes obsolete Python ownership and points callers to the Go Backend capability.
- **Dependencies:** `backend-archive-builder`, `contracts-archive-manifest`, `contracts-archive-goldens`, and `contracts-position-catalog` accepted in the same change.
- **Deliverables:** Removal of stale production requirements and later exact cleanup of Python runtime files.
- **Acceptance:** No production/release/Compose path invokes the Python producer; the Go builder passes existing producer goldens before deletion.
- **Non-goals:** Rewriting historical archived changes, changing Archive semantics, or removing unrelated Python tooling outside the updater product component.
- **Operations deferred:** Production uninstall/deletion, release, deploy, live Archive mutation, and host cleanup are not authorized here.
- **Stop/rollback conditions:** Stop deletion if any retained producer golden, catalog output, manifest/dataVersion field, or downstream build still depends on the Python runtime; rollback is to parent `411f54b`.

## REMOVED Requirements

### Requirement: Acquisition SHALL be exact, bounded, and staged
**Reason:** Production acquisition is moving from the terminating Python updater to the Backend-owned Go Archive builder, and retaining a second writer would violate the selected single-service architecture.

**Migration:** `backend-archive-builder` preserves the accepted official latest/common identities, HTTPS/proxy semantics, bounds, ZIP inventory, staging, failure behavior, and cancellation outcomes in Go.

### Requirement: Every source record SHALL be streamed and accounted
**Reason:** The Python JSONLines-to-SQLite implementation is retired after the Go builder proves parity against the same language-neutral producer cases.

**Migration:** `backend-archive-builder` owns streaming, exclusive accounting, raw-domain preservation, duplicate/reference classification, and all 20 SQLite table outputs.

### Requirement: Identity, quality, and manifest SHALL be deterministic
**Reason:** Deterministic identity, quality, and manifest finalization remain required, but Python is no longer their production owner.

**Migration:** The unchanged Contracts schemas/vectors/goldens gate the real Go finalizer and builder; duplicate smoke/reopen/whole-contract audits are not migrated.

### Requirement: Go validation SHALL precede inactive atomic publication
**Reason:** A separate Python-to-Go smoke process is obsolete when the Go Backend itself constructs and opens the candidate.

**Migration:** `backend-archive-builder` performs one necessary build-time SQLite/identity/read check and one atomic inactive publication before in-process activation, without `archive-smoke`.

### Requirement: Dependency and acceptance scope SHALL remain minimal
**Reason:** The Python/PyYAML wheel and updater artifact gates are removed with the Python runtime.

**Migration:** The single Backend artifact uses Go standard packages, existing modernc SQLite, and the already locked Go YAML module; existing producer/catalog goldens remain the parity authority.

### Requirement: Updater SHALL own one non-overridable production rule pair
**Reason:** Updater no longer owns production construction.

**Migration:** `backend-archive-builder` derives `domain-raw-v1` and `cast-exact-v1` from the same compatibility authority and exposes no caller override.
