## Context

Run `6d7dd3d4-9eb4-472e-af09-0561dc313617` proved that upstream transport and
identity now work: acquisition completed in 53 seconds with the official
digest, while the subsequent SQLite build failed after 402 seconds.
`PRAGMA temp_store=FILE` is explicit in the builder. The container supplies a
256 MiB `/tmp` tmpfs, the official ZIP is 426 MiB compressed, host free disk
exceeds 50 GiB, and kernel/Docker OOM counts stayed zero.

SQLite's official Unix VFS documentation places `SQLITE_TMPDIR` ahead of
`TMPDIR`, `/var/tmp`, `/usr/tmp`, and `/tmp`, using the first directory with
write and execute permission.

| Field | Declaration |
|---|---|
| Status | Design complete; implementation remains blocked on strict validation and zero-P0/P1 review. |
| Owner | Main agent directly owns the sequential correction. |
| Writable paths | Proposal writable paths only. |
| Read-only protected inputs | Proposal protected inputs only. |
| Deletion complement | Proposal deletion complement only. |
| Mutable refs | Proposal mutable refs only. |
| Consumes | Exact failure/runtime/source evidence and SQLite official documentation. |
| Produces | One fixed Compose environment projection plus focused tests/docs. |
| Dependencies | Evidence → reviewed spec → Compose/test/docs correction → Actions → activation amendment. |
| Deliverables | Proposal deliverables only. |
| Acceptance | Delta scenarios plus full Actions and narrow diff. |
| Non-goals | Proposal non-goals only. |
| Operations deferred | Proposal deferred items only. |
| Stop/rollback conditions | Proposal stop/rollback conditions only. |

Dependency direction is the existing disk-backed Archive bind mount →
updater-only process environment → SQLite VFS temporary spill. No product or
host state feeds back into the repository change.

## Goals / Non-Goals

**Goals:**

- Remove only the 256 MiB SQLite file-spill ceiling.
- Keep temporary work on the already bounded production data filesystem.
- Prove the input cannot leak to API/Prometheus or alter proxy projection.

**Non-Goals:**

- Changing SQLite build logic, database schema, data acceptance, memory
  limits, or the updater's general `/tmp`.
- Adding configurable paths, new mounts, volumes, dependencies, or retries.

## Decisions

### 1. Use a fixed SQLite-specific environment input

`operations/compose.yaml` gives updater the literal
`SQLITE_TMPDIR=/var/lib/bgmss/archive`. This is the exact path already mounted
read-write for staging and publication, is on the same disk with sufficient
capacity, and follows SQLite's supported Unix selection mechanism.

Alternative rejected: increase the tmpfs and container memory limit. Tmpfs
consumes memory and would turn a disk-spill workload into avoidable memory
pressure on a single host.

Alternative rejected: use deprecated `PRAGMA temp_store_directory`. SQLite
documents it as process-global, non-thread-safe, advisory, and deprecated.

Alternative rejected: set general `TMPDIR`. That would redirect unrelated
Python/process temporaries and broaden the change.

### 2. Keep the value outside release state

The value is a fixed Compose definition, not a `current.env` input. Operators
cannot point SQLite scratch elsewhere during deploy or rollback. Direct and
proxy projections share the same fixed value; the proxy overlay remains
responsible only for `BGMSS_HTTPS_PROXY` and network attachment.

### 3. Verify the full projection boundary

The existing operations projection test asserts the exact value on updater in
both direct/proxy modes, absence on API/Prometheus, and unchanged network
sets. README records the SQLite-specific reason. Full workflow dispatch runs
the same operations test before producing an artifact.

## Risks / Trade-offs

- **SQLite creates large temporary files beside production data** → files are
  process-owned/unlinked by SQLite, the host has more than 50 GiB free, and
  publication still uses exact staging/pointer transactions.
- **A fixed path masks host capacity loss** → existing deployment/update
  capacity and failure-safe publication gates remain; activation rechecks
  free disk before the new invocation.
- **The diagnosed failure has another SQLite cause** → the single new
  invocation remains fail-closed with no public cutover or automatic retry.

## Migration Plan

1. Strict-validate and approve the change with zero P0/P1 findings.
2. Add the fixed updater environment entry, projection assertions, and README
   explanation.
3. Obtain green exact-head Development Actions through one workflow dispatch.
4. Sync/archive this change and amend production activation with exact old/new
   Compose identities, current failed baseline, and one new invocation.
5. Only after the amendment commit/push, transactionally install the one
   Compose file, verify projection, and run the authorized updater once.

## Open Questions

None.
