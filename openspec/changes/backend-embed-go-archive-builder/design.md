## Context

The current system has three runtime layers for weekly data: Python builds an
inactive SQLite Archive, a host systemd timer/wrapper activates it, and the Go
API restarts to consume it. The Go runtime already uses an
`atomic.Pointer[archive.Store]`, dynamic StoreProvider closures, immutable
dataVersion-keyed result caches, and a Store that drains active SQLite rows on
close. Those existing boundaries make a small in-process replacement practical.

The user explicitly accepts a low-query overnight maintenance window and does
not want ORM adoption, multi-replica coordination, durable queues, request
leases, or a generalized hot-reload framework. The Go builder must nevertheless
preserve the accepted Archive schema, manifest/dataVersion algorithm,
catalog/cast rules, quality classification, and deterministic publication.

## Goals / Non-Goals

**Goals:**

- Produce the same immutable SQLite/manifest contract entirely in Go.
- Schedule one startup freshness check and one weekly Sunday 04:15 UTC+8 run
  inside the API process without systemd.
- Serve ordinary requests during download/build and pause only briefly while
  swapping the Store.
- Leave the current Archive untouched on acquisition/build/open failure.
- After successful activation, close and delete old versions and retain only
  current.
- Remove the Python updater and separate updater deployment artifact/runtime.

**Non-Goals:**

- No ORM, authenticated collection requests, statistical/API/UI changes,
  multi-instance leader election, distributed lock, persistent queue, retry
  dashboard, Store reference-count framework, long-term previous data rollback,
  or production mutation in this development change.

## Change Boundary

| Field | Boundary |
|---|---|
| Status | Local specification and implementation only |
| Owner | Backend builder/runtime; Contracts handoffs; Operations topology; primary agent cross-component acceptance |
| Writable paths | Exact paths declared in `proposal.md`; root specs only during sync/archive |
| Read-only protected inputs | Product/design/public API/statistics/query semantics, real Archive bytes, unrelated worktrees, remotes, hosts, production, routing, legacy |
| Deletion complement | Only Python `updater/**`, exact updater-only artifact/update-status fixtures, update/data-rollback wrappers, and Archive timer/service after Go parity |
| Mutable refs | `codex/embed-go-archive-builder` only |
| Consumes | Official Archive latest/release, fixed common commit, schema/config/contracts, current Archive, modernc SQLite |
| Produces | One Go API/builder image, contract-equivalent SQLite/manifest, in-process update state, reduced deployment topology |
| Dependencies | Parent `411f54b`, existing schema/goldens, atomic Store and dataVersion cache boundaries |
| Deliverables | Go builder/scheduler/swap, parity fixtures/tests, reduced artifacts/operations, strict OpenSpec and affected gates |
| Acceptance | Fixture parity, no-change, failure preservation, live A-to-B swap without listener restart, old cleanup, no Python/systemd production dependency |
| Non-goals | ORM, distributed scheduling, product semantics, unrelated cleanup |
| Operations deferred | Real download/build, host write, release/deploy, live deletion, push/merge/routing/legacy retirement |
| Stop/rollback conditions | Stop on schema/dataVersion/catalog/quality/query drift, unbounded streaming memory, unsafe deletion, overlap, or failed parity; rollback to `411f54b` |

Dependency direction becomes `Go scheduler -> Go archivebuild -> immutable
candidate -> app maintenance gate -> archive.State -> query services`. Contracts
remain inputs; Operations only mounts storage and runs the one API image.

## Decisions

### 1. Port the producer as one Backend-internal Go package

`backend/internal/archivebuild` owns acquisition, extraction, catalog
compilation, SQLite build, manifest identity, staging, and inactive publication.
It does not know HTTP handlers or Store activation. The package consumes the
existing schema and governed catalog inputs embedded into the Backend binary.

Go standard packages cover HTTP, ZIP, SHA-256, JSON streaming, files, timing,
and synchronization. Existing `modernc.org/sqlite` remains the database driver.
`go.yaml.in/yaml/v3 v3.0.4`, already locked transitively, becomes a direct
Backend dependency solely to parse the two governed YAML inputs and reject
duplicate keys through `yaml.Node`. A handwritten YAML parser was rejected as
less maintainable; no ORM, JSON Schema runtime, or scheduler library is added.

The builder streams JSONLines into one SQLite transaction and keeps only bounded
maps needed for reference/duplicate/cast joins. Its outputs remain exactly
`bangumi.sqlite` and `manifest.json` below one dataVersion directory.

### 2. Keep only necessary producer validation

Acquisition verifies official latest shape, HTTPS hosts, size, digest, exact ZIP
inventory, and safe extraction. Build preserves strict record shapes,
deterministic duplicates/errors, source accounting, catalog/cast/quality rules,
foreign keys, table counts, manifest/dataVersion, and one SQLite integrity/read
check before publication.

The port does not recreate the removed Go archive-smoke, Python runtime contract
audit, Backend startup admission, second whole-file digest, or duplicate reopen
scan. Existing producer goldens are the parity authority.

### 3. Use one simple in-process scheduler

App starts one goroutine. It performs one asynchronous freshness check at
startup, then uses `time.Timer` to wait for the next Sunday 04:15 in a fixed
UTC+8 zone. One goroutine calls `RunOnce` serially, so no second lock, queue, or
overlap state machine is required. Each run derives one six-hour context from
the process context. Shutdown cancels the active run and stops the timer.

No schedule state is persisted: every process start checks official latest and
the deterministic dataVersion, which naturally catches up after downtime.

### 4. Build outside, swap inside one short maintenance gate

The HTTP handler is wrapped once with an app-owned `sync.RWMutex`: ordinary
requests hold the read side for their complete handler lifetime. Download,
build, candidate direct-open, and the readiness query happen without this lock.

Activation takes the write side, which waits for ordinary requests to finish
and briefly blocks new ones. Because detached expensive work can outlive an HTTP
request, activation also waits for the existing bounded executor's running and
queued counts to reach zero. No per-request lease or reference counter is
introduced.

Inside the gate the app:

1. prepares the complete replacement `current.json` bytes;
2. atomically replaces `archive.State.current` with the already-open candidate;
3. atomically renames the prepared pointer;
4. updates readiness/dataVersion;
5. swaps back to the old Store if pointer activation fails.

After successful activation there can be no pre-swap request using the old
Store, so the app closes it, releases the gate, and removes non-current version
directories. Cleanup failure is logged and retried by the next run; it does not
roll back a healthy new Store.

### 5. Reuse current StoreProvider and cache versioning

All query services already call a StoreProvider at the beginning of an
operation, so new requests naturally capture the replacement Store. Result
cache keys already contain dataVersion; old cache entries cannot answer new
queries and may leave through the existing bounded eviction policy. Collection
cache is Archive-independent. No ORM or cache-generation subsystem is needed.

`archive.State` gains a narrow Replace operation returning the old Store;
initial LoadCurrent remains separate. Store owns `database/sql`, its four
connection pool, VFS, and close/drain behavior exactly as before.

### 6. Collapse build and deployment to one product component

The Backend image embeds schema/catalog producer inputs and contains the sole
API executable. Compose removes the Updater service and mounts the Archive root
writable only into API; the image root filesystem remains read-only. Release
metadata and compatibility coordination become Backend plus Frontend, not
Backend plus Updater plus Frontend.

Python updater code, its artifact/tests, update-status file contract, host
update/rollback-data wrappers, and Archive systemd units are deleted only after
Go fixture parity is green. Historical archived OpenSpec remains untouched.

## Risks / Trade-offs

- **Builder resource use competes with overnight queries** -> accepted for the
  observed low-query window; build remains outside the maintenance gate and
  uses streaming/SQLite-backed work rather than loading the complete dump.
- **A Go builder defect is now in the API binary** -> fixture parity and staging
  ensure failure never mutates current; scheduling calls error-returning code
  and records failure without changing readiness.
- **The short gate waits on a rare active query** -> this is intentional and
  simpler than leases; the existing bounded executor supplies the only drain
  observation required.
- **Successful swap removes immediate data rollback** -> explicitly accepted;
  any later recovery rebuilds an official Archive rather than retaining old
  versions.
- **Writable Archive mount broadens API authority** -> writes are confined to
  the configured Archive root/staging/current pointer; container root remains
  read-only and deletion targets only validated version names.

## Migration Plan

1. Implement and accept Go acquisition/build parity while Python remains
   read-only reference.
2. Implement State replacement, maintenance gate, scheduler, and fixture A-to-B
   live activation.
3. Switch Backend artifact/Compose/observability to the embedded builder.
4. Remove Python updater, updater artifact/CI branch, status-file handoff,
   wrappers, and systemd units.
5. Run focused gates during development; run one complete real Archive build and
   the full affected batch only after accumulated code is ready.

No production migration occurs in this change. Before a future activation, the
accepted current Archive remains the rollback input for the old `411f54b`
application. After the new service successfully deletes old versions, recovery
requires rebuilding or restoring a complete Archive.

## Open Questions

None. The user selected embedded Go scheduling/building and accepted the simple
overnight maintenance model.
