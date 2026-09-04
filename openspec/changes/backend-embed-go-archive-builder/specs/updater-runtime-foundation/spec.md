## Capability Boundary

| Field | Declaration |
|---|---|
| Status | Python Updater runtime retired by `backend-embed-go-archive-builder`; deletion follows accepted Go parity. |
| Owner | Backend owns the replacement builder runtime; the Updater cleanup block owns deletion of `updater/**`. |
| Writable paths | This delta spec and, after parity acceptance, the exact `updater/**` deletion complement declared by the change. |
| Read-only protected inputs | Python updater source/tests remain read-only parity evidence until the Go builder passes; Contracts, real Archive data, unrelated components, production, hosts, remotes, and archived OpenSpec remain protected. |
| Deletion complement | The Python package, CLI, lock, tool configuration, tests, and runtime-only files under `updater/**`; governed catalog inputs move to Backend ownership before deletion. |
| Mutable refs | Local `codex/embed-go-archive-builder` only. |
| Consumes | Existing Python behavior as read-only parity evidence and the accepted language-neutral Archive/catalog contracts. |
| Produces | No Updater package or CLI; equivalent producer behavior is supplied by `backend-archive-builder` inside `bgmss-api`. |
| Dependencies | Go fixture parity for acquisition/build/catalog/manifest/publication and Backend artifact acceptance. |
| Deliverables | Removal of the Python runtime project and all package/CLI/toolchain references after parity. |
| Acceptance | Repository production build/runtime no longer installs Python or uv for Archive updating; Backend tests cover migrated behavior; strict validation passes. |
| Non-goals | Removing unrelated development-only Python tooling, changing Archive semantics, or adding another standalone updater language/runtime. |
| Operations deferred | Release, deployment, live updater retirement, and deletion on a host remain separately authorized. |
| Stop/rollback conditions | Stop before deletion if Go parity, embedded inputs, or full affected gates fail; restore only owned uncommitted cleanup. |

## REMOVED Requirements

### Requirement: The updater SHALL be one exact installable package

**Reason**: Production Archive construction moves into the single Go Backend binary and no Python updater package remains deployable.

**Migration**: Port required producer behavior to `backend/internal/archivebuild`, move governed catalog inputs into Backend-owned embedded inputs, then delete the Python package and wheel metadata.

### Requirement: The CLI SHALL be terminating, deterministic, and truthful

**Reason**: `bgmss-updater` and its module entry point are removed with the Python runtime.

**Migration**: Invoke the Go builder only through the Backend scheduler and focused Go test seams; no replacement operator CLI is introduced.

### Requirement: Contracts SHALL remain the sole Archive authority

**Reason**: The Python adapter implementing this requirement is retired, while the authority itself remains governed by the existing Contracts capabilities.

**Migration**: Make the Go builder consume the same accepted Archive/catalog contracts and producer-runtime manifest through Backend-owned embedded inputs.

### Requirement: Producer-side validation SHALL preserve shared outcomes

**Reason**: Producer-side validation is moving from the Python adapter to the Go builder.

**Migration**: Execute the same indexed positive/negative outcomes through Go contract and builder tests under `backend-archive-builder`.

### Requirement: Dependencies SHALL be exact and removable

**Reason**: The Python/jsonschema/pytest/mypy/Ruff/Hatchling/uv dependency graph is removed with the updater package.

**Migration**: Use the Backend Go module and existing Go acceptance gates; do not add a replacement Python environment.

### Requirement: Quality and cleanup SHALL be reproducible

**Reason**: The Python-specific quality matrix and cache roots cease to exist.

**Migration**: Cover migrated producer behavior in the Backend Go source/build gates and repository residue checks.

### Requirement: The foundation SHALL remain one-shot and path-disjoint

**Reason**: There is no longer a separate Updater owner or runtime boundary; the Backend intentionally owns both API and scheduled Archive building.

**Migration**: Enforce the new dependency direction and bounded scheduler under Backend capabilities rather than preserving an artificial sibling component.
