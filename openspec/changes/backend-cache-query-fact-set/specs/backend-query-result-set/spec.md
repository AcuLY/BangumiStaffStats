## Capability Boundary

- **Status:** local latency-only implementation and focused verification.
- **Owner:** Backend query.
- **Writable paths:** this change, `backend/internal/query/archive_loader.go`,
  and `backend/internal/query/archive_loader_cache_test.go`.
- **Read-only protected inputs:** product/design/root specifications, Archive
  bytes, existing tests, other packages/components, external state, and
  production.
- **Deletion complement:** remove no loader, SQL, query behavior, test, gate, or
  unrelated work.
- **Mutable refs:** exact writable local files only; no Git ref mutation.
- **Consumes:** one published immutable Store, its exact runtime object
  identity, one subject type, and caller context.
- **Produces:** one complete immutable process-local FactSet per exact
  Store-and-subject-type key.
- **Dependencies:** existing standard library and Backend query/archive
  packages only.
- **Deliverables:** cache implementation, focused tests, strict validation, and
  race/diff evidence.
- **Acceptance:** sequential/concurrent reuse, key isolation, cancellation and
  failure retry, no partial publication, and unchanged query results.
- **Non-goals:** warmup, eviction, mutable Archive support, wire/statistical
  semantics, dependency, timeout, observability, external operations, or full
  gate.
- **Operations deferred:** root-spec sync/archive, batched complete gate,
  commit/push/merge/release/deploy, service mutation, and production activation.
- **Stop/rollback conditions:** stop on cache aliasing/poisoning, partial value,
  caller-visible mutation, race/leak/result drift, failed focused acceptance,
  dirty-worktree overwrite, or scope violation; patch only owned files.

This delta authorizes no nested OpenSpec root or generated skill set.

## MODIFIED Requirements

### Requirement: Evaluation SHALL be read-only, cancelable, and pre-projection

Production data access SHALL use only fixed argument-bound `SELECT`/`WITH`
statements through the accepted `archive.Store`; it SHALL create no file,
sidecar, table, pragma change, attached database, or mutation. Context
cancellation/deadline or any load/evaluation error SHALL return no partial
result. Returned values SHALL be immutable to callers.

For the process lifetime, the Backend MAY retain and share one complete
successful immutable FactSet per exact Archive Store object and subject type.
Sequential and concurrent callers for the same key SHALL reuse one completed
load. Different Store objects or subject types SHALL remain isolated. A waiting
caller's cancellation SHALL return that caller's context cause without
publishing, deleting, or truncating a successful shared value. A failed or
canceled load SHALL publish no FactSet, SHALL not poison the key, and a later
caller SHALL retry the complete load. The cache SHALL not contain partial
fields, per-operation projections, errors, or canceled results and SHALL not
change any SQL, query result, timeout, or wire behavior.

The capability SHALL not calculate averages, overall, preference,
distribution, series, rank, search, sort, pagination, endpoint response, or
cache state. Repeated and shuffled runs over identical facts SHALL return
byte-equivalent golden projections.

#### Scenario: Evaluation is canceled

- **WHEN** cancellation occurs during Archive scan or set construction
- **THEN** work SHALL stop promptly, return the context cause, expose no partial
  result, publish no cached value for that failed attempt, and leave the Store
  usable for a later complete retry

#### Scenario: Concurrent operations load the same immutable facts

- **WHEN** sequential or concurrent operations request one subject type from
  the same exact Store object
- **THEN** one complete successful FactSet SHALL be shared and later operations
  SHALL not repeat the complete Archive scan

#### Scenario: Cache keys differ

- **WHEN** callers use a different exact Store object or subject type
- **THEN** each key SHALL load and retain its own complete facts without
  cross-domain or cross-Store reuse

#### Scenario: A waiting caller is canceled

- **WHEN** one waiter is canceled while another caller's shared load continues
- **THEN** the waiter SHALL return its context cause, the successful load SHALL
  remain eligible for publication, and a later caller SHALL reuse it

#### Scenario: View-only state changes

- **WHEN** search, sort, order, page, page size, or section differs outside the
  Effective Query
- **THEN** this capability's result set SHALL be unchanged because view state is
  not consumed
