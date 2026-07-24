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
| Consumes | The corrected root Archive/runtime specs, corrected shared indexed corpus, and caller-supplied root. |
| Produces | `backend/internal/archive` runtime store, minimal application assembly, and a development-only candidate-smoke CLI. |
| Dependencies | `contracts-archive-manifest`, `backend-runtime-foundation`, accepted/exited `correct-archive-subject-semantics`, Go `1.26.5`, and driver pins below. |
| Deliverables | Loader/state/store, startup/shutdown wiring, candidate-smoke CLI, dependency/path guards, tests. |
| Acceptance | Full indexed corpus, added mutation/path/write/concurrency/lifecycle cases, full/race/vet/build and repository gates. |
| Non-goals | HTTP, observability, producer, catalog/query semantics, activation/hot reload/rollback, operations. |
| Operations deferred | Production root convention, pointer switch, restart, retention, scheduler and deploy. |
| Stop/rollback conditions | On drift or failure, close only the candidate, publish nothing, preserve protected state, and stop. |

## Goals / Non-Goals

**Goals:** fail-closed current and inactive-candidate validation; provable
no-create, read-only SQLite access; single atomic runtime publication; clean
concurrent lifecycle.

**Non-Goals:** any HTTP/query wire, route, metric, or log contract; Archive
construction or activation; production path choice; reload; rollback; or
business query.

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

`cmd/api` requires `-archive-root` as an absolute path and passes it explicitly
to `app`; no default production directory is defined. Runtime selection opens an
`os.Root`, strictly reads `current.json` once, validates its three fields, and
delegates to a shared candidate loader. The candidate loader accepts the same
absolute root plus one validated dataVersion and derives only
`versions/<dataVersion>/manifest.json` and `bangumi.sqlite`; it does not require,
read, create, or publish a pointer.
`os.Root` plus component `Lstat` rejects escape, symlink, and non-regular
objects; manifest and database bytes are each hashed from their validated file.
The consumer compares the database's file identity, size, and modification time
before hashing and after SQLite validation, failing if any changes. This uses Go
1.26.5, which contains the current `os.Root` traversal fix.

Go's standard JSON decoder replaces malformed UTF-8 with U+FFFD, so
unknown-field rejection alone is insufficient for the corrected contract.
Both pointer and manifest readers first require `utf8.Valid` on the bounded raw
bytes, then perform the one-value strict JSON decode. This rejection precedes
shape, compatibility, digest, or publication decisions and is covered by
temporary invalid-byte mutations whose replacement text would otherwise remain
schema-valid.

Validation follows `compatibility-matrix.json` precedence: fatal UTF-8 and
strict manifest shape/accounting; supported tuple; recomputed dataVersion;
directory and manifest identity; regular-file containment and size; SQLite
digest/format; application/user versions and `archive_meta`; required
tables/indexes, integrity/foreign-key; then table counts. Runtime selection
additionally gates fatal UTF-8, pointer shape, and manifest digest before
publication.

The corrected matrix's exact sentinel values describe the indexed minimal
fixture. Contract tests execute them against that fixture and its derived
mutations; the runtime/candidate loader does not require arbitrary full Archive
content to equal those fixture counts. Before sentinels, the loader computes
the corrected language-neutral digest of every actual explicit
`sqlite_schema` definition and requires the matrix's canonical 35-object seal;
matching object names alone is insufficient. Compiled v1 constants are tested
directly against the shared matrix, `schema.sql`, vector, and every indexed
golden; no schema or golden is copied.

### Give the producer an independent, pointer-free smoke

`cmd/archive-smoke` accepts an absolute `-archive-root` and one
`-data-version`, calls the candidate loader, emits exactly one bounded JSON
result containing `ok`, `dataVersion`, `manifestDigest`, and `sqliteDigest`,
then closes the store. It never reads or writes `current.json`, never mutates
the version, and never publishes readiness. Failure emits a sanitized stable
code and a non-zero status without paths or content values. A failed result
write is itself a command failure: the smoke never reports success or returns
zero when its bounded JSON cannot be emitted. This lets the producer build the
fixed `versions/<dataVersion>` layout inside disposable staging, run the
actual Go consumer, and only then atomically publish the inactive directory.

### Make every pooled connection read-only

Register a per-store read-only `modernc.org/sqlite/vfs` over a narrow
`os.Root` for the already validated version directory. Build, never
concatenate, a `net/url` URI for only the relative `bangumi.sqlite` name with
that generated VFS plus `cache=private`, `immutable=1`, `mode=ro`, and the exact
busy-timeout, foreign-key, and query-only pragmas. The store owns the database,
VFS, and roots through close. This ensures SQLite opens the same root-bound
object that was validated even if a pathname is renamed/rebound, and neither an
`ATTACH` nor a changed `query_only` pragma can create or write an external file.

SQLite documents [`mode=ro`](https://sqlite.org/uri.html) as read-only rather
than read-write-create and `immutable=1` for files guaranteed not to change;
the root-bound read-only VFS is the filesystem enforcement and `query_only` is
defense in depth. Immutable mode is admitted only after the producer is closed,
journal mode is `DELETE`, no `-wal`/`-shm`/`-journal` sidecar exists, and the
version bytes are guaranteed unchanged until all handles close; otherwise
loading fails rather than weakening the DSN. Shared cache, `nolock`, and
consumer journal pragmas are forbidden.

`sql.Open` is followed by pool limits `MaxOpenConns=4`, `MaxIdleConns=4`, zero
lifetime/idle expiry, then `PingContext`. Four acquired connections must each
report the configured pragmas; `integrity_check(1)` must return exactly one
`ok` row and `foreign_key_check` zero rows. The Store admits only one statement
of at most 65,536 bytes whose first ASCII keyword is `SELECT` or `WITH`, with
no SQL comment token or semicolon; rejected text returns a fixed safe
programming-error sentinel before reaching the driver. SQLite `query_only`
remains the second gate for a write-capable `WITH`. Tests assert the main VFS
identity, missing-file no-create, pathname rebound safety, rejected
DDL/DML/pragma/attach/multi-statement input, and absence of every external or
sidecar file.

### Publish one complete store

Loading builds a private candidate. A deferred close remains armed through every gate. The pointer-selected runtime path alone may disarm it after a successful compare-and-swap from nil to one immutable `Store`; pointer-free validation returns an owned store that its smoke caller closes and never touches readiness. The state pointer is readiness: nil is not-ready. Competing or second runtime publication loses, closes its candidate, and cannot replace the winner.
Shutdown first stops serving, atomically clears readiness, and closes the winner exactly once; no runtime reload API exists.

## Risks / Trade-offs

- [Filesystem changes during validation] → immutable layout, one root-bound
  read-only SQLite VFS, pre/post identity checks, `immutable=1`, pathname
  rebound tests, and fail-closed close ordering.
- [Compiled contract constants drift] → direct matrix/schema/vector and closed golden tests fail before acceptance.
- [Fixture sentinel values reject production-sized data] → exact matrix values
  remain minimal-golden assertions; arbitrary candidates use content-independent
  contract, integrity, object, metadata, and count gates.
- [Four connections are not performance-tuned] → bounded safe baseline; later query work may change it only with race/benchmark evidence.

## Migration Plan

Apply the consumer and pins, wire the required root into startup, then run all acceptance gates. No data migration, activation, deployment, or rollback action occurs; failure leaves the prior code candidate unaccepted.

## Open Questions

None.
