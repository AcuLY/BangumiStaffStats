## Context

`backend/internal/archive/contracttest` currently checks only selected contract evidence and deliberately has no runtime store. The authoritative runtime contract is `contracts-archive-manifest`; package direction remains `cmd/api -> app -> archive`, while later `query` may depend on `archive`.

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: no; verified: independent driver review, main semantic audit, targeted/all strict validation, and doctor passed; committed: determined by containing Git history; pushed/released/deployed: no |
| Owner | Backend owner; main agent owns review and acceptance. |
| Writable paths | Exactly the apply paths enumerated in `proposal.md`; `go.mod`, `go.sum`, architecture guard, check script, README, app assembly, and `cmd/api` are included only for the admitted driver/startup delta. |
| Read-only protected inputs | Shared Archive schemas/matrix/goldens, root specs, guides, other code/changes, refs/remotes, hosts, and production. |
| Deletion complement | None. |
| Mutable refs | None during apply. |
| Consumes | Root Archive/runtime specs, shared indexed corpus, caller-supplied root. |
| Produces | `backend/internal/archive` runtime store plus minimal application assembly. |
| Dependencies | `contracts-archive-manifest`, `backend-runtime-foundation`, Go `1.26.5`, driver pins below. |
| Deliverables | Loader/state/store, startup/shutdown wiring, dependency/path guards, tests. |
| Acceptance | Full indexed corpus, added mutation/path/write/concurrency/lifecycle cases, full/race/vet/build and repository gates. |
| Non-goals | HTTP, observability, producer, catalog/query semantics, activation/hot reload/rollback, operations. |
| Operations deferred | Production root convention, pointer switch, restart, retention, scheduler and deploy. |
| Stop/rollback conditions | On drift or failure, close only the candidate, publish nothing, preserve protected state, and stop. |

## Goals / Non-Goals

**Goals:** fail-closed resolution and contract validation; provable no-create, read-only SQLite access; single atomic publication; clean concurrent lifecycle.

**Non-Goals:** any wire/route/metric/log contract, Archive construction or activation, production path choice, reload, rollback, or business query.

## Decisions

### Pin one CGO-free SQLite driver

Admit direct runtime dependency `modernc.org/sqlite v1.54.0` and guard its
resolved upstream dependency `modernc.org/libc` at exactly `v1.74.1`. As
checked 2026-07-24, the [tagged driver](https://pkg.go.dev/modernc.org/sqlite?tab=versions)
is BSD-3, CGO-free, supports the target desktop/server platforms, and embeds
SQLite 3.53.3; its [tag changelog](https://gitlab.com/cznic/sqlite/-/raw/v1.54.0/CHANGELOG.md)
requires that matching libc version. The standard library has no SQLite driver;
`mattn/go-sqlite3` adds CGO/C toolchain coupling, while a custom file reader
cannot execute integrity, metadata, sentinel, or later domain queries.

The cost is a larger module/binary and pinned transitive runtime. Acceptance
checks exact versions, matching libc, ordinary `CGO_ENABLED=0` build/test,
separate race tests with the host race toolchain, license/module inventory, and
removal of the driver if the consumer is removed.

### Resolve beneath one root, then validate in contract order

`cmd/api` requires `-archive-root` as an absolute path and passes it explicitly to `app`; no default production directory is defined. The loader opens an `os.Root`, strictly reads `current.json` once, validates its three fields, and derives only `versions/<dataVersion>/manifest.json` and `bangumi.sqlite`.
`os.Root` plus component `Lstat` rejects escape, symlink, and non-regular
objects; manifest and database bytes are each hashed from their validated file.
The consumer compares the database's file identity, size, and modification time
before hashing and after SQLite validation, failing if any changes. This uses Go
1.26.5, which contains the current `os.Root` traversal fix.

Validation follows `compatibility-matrix.json` precedence: strict pointer and manifest shape/accounting; supported tuple; recomputed dataVersion; pointer, manifest digest, directory and manifest identity; regular-file containment and size; SQLite digest/format; application/user versions and `archive_meta`; required tables/indexes, integrity/foreign-key/sentinels; table counts.
Compiled v1 constants are tested directly against the shared matrix, `schema.sql`, vector, and every indexed golden; no schema or golden is copied.

### Make every pooled connection read-only

Build (never concatenate) this `net/url` file URI for the validated absolute DB: `file:///abs...?cache=private&immutable=1&mode=ro&_pragma=busy_timeout%285000%29&_pragma=foreign_keys%281%29&_pragma=query_only%281%29`.
SQLite documents [`mode=ro`](https://sqlite.org/uri.html) as read-only rather than read-write-create and `immutable=1` for files guaranteed not to change; `query_only` is defense in depth. Immutable mode is admitted only after the producer is closed, journal mode is `DELETE`, no `-wal`/`-shm`/`-journal` sidecar exists, and the version path/bytes are guaranteed unchanged until all handles close; otherwise loading fails rather than weakening the DSN. Shared cache, `nolock`, and consumer journal pragmas are forbidden.

`sql.Open` is followed by pool limits `MaxOpenConns=4`, `MaxIdleConns=4`, zero lifetime/idle expiry, then `PingContext`. Four acquired connections must each report the configured pragmas; `integrity_check(1)` must return exactly one `ok` row and `foreign_key_check` zero rows. Tests also assert the main database path, missing-file no-create, and rejected DDL/DML.

### Publish one complete store

Loading builds a private candidate. A deferred close remains armed through every gate; only a successful compare-and-swap from nil to one immutable `Store` disarms it. The pointer is readiness: nil is not-ready. Competing or second publication loses, closes its candidate, and cannot replace the winner.
Shutdown first stops serving, atomically clears readiness, and closes the winner exactly once; no runtime reload API exists.

## Risks / Trade-offs

- [Filesystem changes during validation] → immutable layout, `os.Root`, pre/post identity checks, `immutable=1`, and fail-closed tests.
- [Compiled contract constants drift] → direct matrix/schema/vector and closed golden tests fail before acceptance.
- [Four connections are not performance-tuned] → bounded safe baseline; later query work may change it only with race/benchmark evidence.

## Migration Plan

Apply the consumer and pins, wire the required root into startup, then run all acceptance gates. No data migration, activation, deployment, or rollback action occurs; failure leaves the prior code candidate unaccepted.

## Open Questions

None.
