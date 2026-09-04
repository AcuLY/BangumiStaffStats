## Context

The updater already builds a new immutable SQLite database from scratch and,
before its sole atomic publication rename, verifies acquisition identity,
schema/object seals, indexes, source accounting, quality rules,
`integrity_check`, `foreign_key_check`, table counts, deterministic identity,
manifest bytes, and read-only reopen. The Backend then repeats most of those
checks at every process start through `archive.LoadCandidate` /
`State.LoadCurrent`. The duplicate Backend path hashes the entire database and
performs multi-billion-byte SQLite scans before HTTP serving begins.

The user explicitly requested complete removal of that Backend admission after
observing a complete local Archive remain unavailable for more than ten
minutes. `PRODUCT.md` does not require runtime revalidation, but the formal
master plan, Backend guide, root OpenSpec, implementation, tests, and operations
wording currently do; this change reconciles those lower authorities together.

## Goals / Non-Goals

**Goals:**

- Remove every Backend Archive admission gate, candidate-admission entry point,
  admission outcome, and admission-only test/documentation claim.
- Open the `current.json`-selected SQLite snapshot directly and quickly while
  retaining contained paths, read-only/query-only access, bounded pooling,
  atomic publication, readiness probing, and safe shutdown.
- Keep dataVersion authoritative from SQLite `archive_meta` and preserve all
  API response, metric, and query behavior.
- Preserve the updater as the single validation authority before inactive
  publication and preserve operations' atomic pointer/restart/rollback flow.

**Non-Goals:**

- No updater, Archive schema, manifest, current-pointer, API/OpenAPI, frontend,
  statistical, dependency, hot-reload, fallback, or production mutation.
- No removal of SQLite read-only protections or runtime query safety.
- No claim that Backend readiness independently proves Archive integrity.

## Change Boundary

| Field | Boundary |
|---|---|
| Status | Local specification and implementation only; no push, merge, release, or deployment |
| Owner | Backend for direct open/runtime/tests; Operations for readiness wording; primary agent for authority reconciliation and acceptance |
| Writable paths | Exact paths declared in `proposal.md`; root specs only during later sync/archive |
| Read-only protected inputs | Product/design/data decisions, contracts, updater implementation/tests, frontend, original dirty worktree, local Archive bytes, remotes, hosts, and production |
| Deletion complement | Admission-owned Backend code/tests/assertions only; preserve producer validation, query/statistics code, contracts, other smoke/tests, and unrelated files |
| Mutable refs | Local `codex/remove-archive-admission` only |
| Consumes | `current.json`, immutable version directory, `bangumi.sqlite`, `archive_meta`, Store/query interfaces |
| Produces | Direct-open Store publication, updated specs/docs/tests, local runtime evidence |
| Dependencies | `411f54b`; updater publication; Backend Store, HTTP, observability, query services; operations pointer activation |
| Deliverables | Strict-valid OpenSpec, code/test/doc diff, Backend checks, local complete-Archive API/UI verification |
| Acceptance | No Backend admission code/claim remains; startup does not hash/recount/integrity-check the Archive; dataVersion and API behavior remain correct |
| Non-goals | No producer weakening, schema/API/UI/statistics/dependency change, external state, or hot reload |
| Operations deferred | Push/PR/merge/tag/release/deploy/host/public-route/legacy changes |
| Stop/rollback conditions | Stop on unreconciled authority conflict, overlapping edits, producer drift, behavioral drift, or failed gates; stop candidate and return to `411f54b` locally |

Dependency direction remains `operations -> updater publication/current pointer
-> backend direct-open Store -> query services -> HTTP/frontend`. Backend does
not call the updater and the updater does not call a Go consumer.

## Decisions

### 1. Delete admission; do not add a faster or optional admission mode

`LoadCandidate` and the ordered pointer/manifest/digest/compatibility/
integrity/foreign-key/schema/count validation pipeline are deleted. There is
no flag, environment variable, command, hidden test hook, alternate executable,
or deferred background admission. This satisfies “complete removal” and avoids
recreating smoke/admission under another name.

Alternative considered: skip only `integrity_check` and `foreign_key_check`.
Rejected because hashing, schema sealing, and recounting still duplicate the
producer and preserve the system concept the user asked to remove.

### 2. Retain a minimal direct-open boundary

Runtime still must safely locate and use a database. The new path reads
`current.json` once to obtain the fixed dataVersion directory, requires
contained non-symlink directories and a regular `bangumi.sqlite`, rejects
SQLite sidecars, opens it via the existing root-bound VFS with
`immutable=1`, `mode=ro`, `query_only=1`, and the bounded four-connection pool,
then reads the single `archive_meta.data_version` value for Store identity.
It does not read or validate `manifest.json`, hash SQLite, compare compatibility
tuples, execute integrity/foreign-key/schema/count gates, or inspect producer
claims.

Alternative considered: trust a raw path or standard writable SQLite DSN.
Rejected because containment and read-only/query-only controls are access
safety, not Archive admission, and are required to avoid writes or path escape.

### 3. Replace candidate admission with direct version open only where tests need it

The exported admission-named `LoadCandidate` API is removed. Tests that need a
Store may use an explicitly named `OpenVersion` helper with the same minimal
direct-open behavior; production startup uses only `State.LoadCurrent`.
Admission-only contract/golden/mutation tests are deleted or rewritten into
small direct-open, read-only, publication, query-lifetime, and shutdown tests.

Alternative considered: keep `LoadCandidate` but make it lighter. Rejected
because its name and contract preserve the removed admission abstraction.

### 4. Preserve degraded serving and bounded failure telemetry

The app keeps one startup open attempt. If path/open/identity setup fails, it
emits the existing sanitized `archive_load_failed` event and serves liveness,
metrics, image, and 503 Archive-dependent routes for that process lifetime.
The event describes a load/open failure, not validation admission; obsolete
contract-specific error codes are removed from the allowlist.

Alternative considered: exit the process on open failure. Rejected because it
would change established liveness and operations behavior beyond the request.

### 5. Producer validation becomes the sole Archive validation authority

Updater build/finalization tests and implementation remain byte-for-byte out of
scope. Operations may verify that a producer-published version is selected and
that API readiness/dataVersion/query probes work, but those probes do not claim
to re-admit Archive integrity. Rollback still swaps the pointer when open or
business readiness fails.

## Risks / Trade-offs

- **Risk: corrupted bytes can open and fail later during a query** -> Producer
  validation, immutable publication, checksummed transfer/deployment, exact
  pointer rollback, and ordinary query errors remain; Backend readiness is
  explicitly narrowed to open plus probe, not integrity proof.
- **Risk: a manually fabricated version bypasses producer guarantees** -> It
  remains unsupported operational input; operations requirements continue to
  require a producer-published real Archive before activation.
- **Risk: removing broad tests hides Store lifecycle regressions** -> Keep
  focused direct-open, read-only/query safety, atomic publication, concurrent
  query, active-row shutdown, and app degraded-serving tests.
- **Risk: wording-only remnants recreate the old contract** -> Acceptance uses
  repository-wide searches for Archive admission and removed gate functions,
  followed by strict OpenSpec sync/archive validation.
- **Trade-off: readiness becomes faster but weaker evidence** -> This is the
  intentional user-authorized delta; producer evidence and runtime service
  evidence are reported separately.

## Migration Plan

1. Reconcile master-plan/Backend-guide statements and delta specs before code.
2. Replace the Archive loader with direct current/version open; retain Store
   access and publication lifecycles.
3. Remove admission-only decoders/gates/codes/tests and update app telemetry
   mappings plus dependent Store test setup.
4. Run focused Archive/app/query tests, the complete Backend gate, strict
   OpenSpec validation, and `git diff --check`.
5. Build a temporary Linux binary, start it against the existing complete
   Archive, verify startup/readiness/catalog/metrics/dataVersion and V2 pages.
6. Sync/archive only after all tasks pass. No push or production action.

Rollback before any future deployment is to stop the candidate and run the
parent `411f54b` binary. A future repository rollback can revert the eventual
single local implementation commit; Archive bytes and pointer format do not
change.

## Open Questions

None. The user selected complete Backend admission removal; producer validation,
read-only access controls, runtime open failure handling, and operations
rollback boundaries are explicitly preserved.
