## Context

The Archive producer currently finishes its own strict contract, schema, SQLite, accounting, digest, determinism, and read-only-reopen checks, then starts a separately packaged Go `archive-smoke` command before it atomically publishes an inactive version. The Backend repeats the same loader admission when `cmd/api` reads the selected `current.json`. Supplying the middle gate requires a second Backend executable, a two-binary artifact schema, an Updater CLI path argument and subprocess supervisor, a release `tools` payload, two active tool symlinks, an updater bind mount, and deploy/rollback handling.

The user has chosen to remove that dedicated middle gate. This is an intentional reliability/latency trade: an Archive that satisfies every producer-owned invariant can be published inactive without proving Go compatibility at that moment; activation remains fail-closed because the API will not become ready unless its real runtime loader accepts the selected Archive.

## Change Boundary

| Field | Boundary |
|---|---|
| Status | Specified; apply only after strict validation and main-agent zero-P0/P1 review |
| Owner | Updater producer gate, Backend command/artifacts, Contracts release identity, Operations release topology; primary agent integrates and accepts |
| Writable paths | Exact paths declared in `proposal.md`; lifecycle sync only to the seven named main specs |
| Read-only protected inputs | Product/design/data authorities, contracts and schemas, Archive builder/acquisition/manifest semantics, Backend runtime loader/API, Frontend, other worktrees, local Archive, remotes and live host |
| Deletion complement | Only the two `backend/cmd/archive-smoke` files and smoke-specific code/tests/artifact/topology references; no generic smoke or runtime validation removal |
| Mutable refs | Local `codex/remove-archive-smoke` branch and isolated worktree only |
| Consumes | Producer validation, API startup admission, current artifact/release topology |
| Produces | Producer without Go subprocess, one-binary Backend bundle, smoke-free release/Compose topology |
| Dependencies | Contracts -> Backend/Updater -> Operations; no reverse edge and no new dependency |
| Deliverables | Code, focused regressions, complete component gates, docs and synchronized specs |
| Acceptance | Backend, Updater, Operations, artifact, residual-reference, OpenSpec and diff gates in `tasks.md` |
| Non-goals | Weaken producer or API loader validation; remove unrelated smoke; modify schema/data/API/UI; deploy or delete host state |
| Operations deferred | Existing live-tool retirement and the breaking-boundary production activation/rollback plan require separate live authorization |
| Stop/rollback conditions | Stop on validation loss, rollback inconsistency, surviving functional dependency, out-of-scope edit, or failing gate; inverse-patch owned diff only |

## Goals / Non-Goals

**Goals:**

- Remove every source, CLI, artifact, release, Compose, and accepted-spec dependency on the dedicated `archive-smoke` command.
- Keep producer-owned validation and inactive atomic publication unchanged except for deletion of the subprocess phase.
- Keep API-startup Archive admission and readiness fail-closed.
- Reduce the Backend artifact to one distributable executable and remove Operations tool topology.
- Leave repository definitions coherent for clean smoke-free releases and make the existing live topology an explicit later migration boundary.

**Non-Goals:**

- Do not remove API container health smoke, updater package smoke, contract codegen smoke, frontend smoke, or other unrelated checks.
- Do not change Archive contents, dataVersion, schemas, source acquisition, catalog derivation, publication atomicity, updater schedule, API behavior, UI, or statistics.
- Do not mutate the current production host, delete existing tool links/releases, push, merge, release, or deploy.

## Decisions

### The producer ends with its own validation and atomic publication

The new phase order is `preflight -> acquisition -> identity -> build -> manifest -> publication`. `ProduceRequest` no longer carries an executable, CLI parsing no longer accepts `--archive-smoke`, and producer service code no longer validates, starts, supervises, parses, or reports a Go subprocess. Publication remains a same-filesystem rename after every remaining fallible producer/cancellation gate.

The shared update-status v1 schema remains version 1 but its closed phase enum loses `smoke`. The Python lifecycle/status writer, indexed Contracts goldens, and Go metrics reader change together so no producer or consumer accepts a terminal phase that can no longer occur.

Alternative considered: retain an optional smoke flag. Rejected because optional execution preserves two behaviors and the artifact/operations dependency the user asked to remove.

### Go admission moves exclusively to real API startup

`internal/archive` remains unchanged. The API still reads `current.json`, validates manifest and SQLite identities, opens through the root-bound immutable VFS, checks integrity/schema objects/table counts/sentinels, and becomes ready only after successful publication of the read-only Store. Removal deletes only `cmd/archive-smoke`; it does not weaken the shared loader.

Alternative considered: replace the command with a library call from Python. Rejected because it retains the cross-language pre-publication gate and packaging complexity under another invocation mechanism.

### Backend artifacts keep schema v2 with one executable record

The normalized binary bundle contains `bin/bgmss-api` and `metadata/build.json`. Schema v2 remains because its role/path/size/digest model already supports a closed executable inventory; the accepted inventory changes from two records to one. OCI runtime-image behavior and API artifact-only smoke remain unchanged.

Alternative considered: bump artifact schema solely for the cardinality change. Rejected because no field meaning or parser shape changes.

### Operations removes active tool topology without deleting live legacy bytes

New bundles contain no Backend tool archive or release `tools/` directory. Compose supplies only producer inputs and Archive storage to updater. Clean deployment, rollback, update, and isolated-validation definitions use application env/frontend plus data pointers; they do not create or require `current-tools`/`previous-tools`.

Repository implementation does not delete pre-existing live tool links or releases. Crossing from the current smokeful production revision to the first smoke-free revision is a breaking operations migration because a pre-change updater image expects the removed flag/mount. That live transition, rollback authority, and exact retirement targets remain blocked until a separately authorized activation plan binds current host state. This development change must not silently claim cross-boundary live rollback.

Alternative considered: keep a deprecated ignored CLI flag and dormant tool mount for rollback compatibility. Rejected because it leaves the requested system dependency present and makes its retirement indefinite.

### Residual-reference validation distinguishes the dedicated command from generic smoke

Acceptance rejects `archive-smoke`, `archive_smoke`, `GO_SMOKE`, and active tool-link topology from production/current source and main specs after sync. Generic `smoke` terminology remains allowed only where it names other accepted checks.

## Risks / Trade-offs

- **A producer-valid Archive can be Go-incompatible until activation** -> Publication remains inactive; API startup fails not-ready, and the host update transaction must restore the prior pointer when readiness fails.
- **Loss of a cross-language early warning** -> Backend Archive contract/golden tests remain required, and real API startup is the authoritative consumer boundary.
- **Artifact consumers assume two executables** -> Change artifact validation, evidence generation, tests, docs, and Operations bundle assembly together; reject any stale two-entry or missing-one-entry inventory.
- **Existing production rollback crosses a breaking updater interface** -> Do not deploy from this development change. Preserve live legacy tool bytes read-only and require an exact later activation/rollback plan.
- **Broad word-based cleanup removes unrelated smoke** -> Use an exact dedicated-reference allowlist and inspect every deletion; generic API/artifact/frontend smoke remains protected.

## Migration Plan

1. Remove the Updater CLI/request/subprocess phase and update producer tests.
2. Delete the Backend command and reduce artifact/Docker/build/architecture inventories to the API executable.
3. Remove Operations tool bundle, release directory, symlinks, updater mount, deploy/rollback handling, isolated-validation expectations, and fixtures.
4. Run complete component and operations acceptance plus residual-reference audit.
5. Sync all nine modified capabilities and archive this development change locally.
6. Before any live rollout, create a separate operations activation change that binds the exact current/previous revisions, smokeful updater compatibility, legacy tool links/releases, rollback target, and retirement sequence. No live object is removed by this change.

Development rollback is the inverse owned patch restoring the command/gate/artifact/topology together. Live rollback is not authorized here.

## Open Questions

None for development implementation. Exact live cross-boundary activation remains intentionally deferred to observed production state.
