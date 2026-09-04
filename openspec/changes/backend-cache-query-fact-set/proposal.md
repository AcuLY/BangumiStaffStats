## Why

Each ranking, candidate, partner, co-star, and person-detail core currently
rescans the same complete subject-type facts from the immutable Archive. On the
local complete Archive this repeated cold work adds several seconds to person
detail and related operation loads even though the Store and facts cannot
change during the process lifetime.

## What Changes

- Cache one complete successful `query.FactSet` per exact Archive Store object
  and subject type for the process lifetime.
- Coalesce concurrent loads for the same key while allowing each waiting caller
  to stop on its own context cancellation.
- Publish no partial, failed, or canceled value; a later call retries after any
  unsuccessful load.
- Preserve all SQL, normalization, filtering, statistical, wire, timeout, and
  operation-result semantics. No warmup, dependency, or external mutation is
  added.
- Add focused sequential, concurrent, key-isolation, cancellation, and retry
  tests.

Externally visible behavior is **PRESERVE_ORACLE** against
`644b7748674e553f863d0ffd61d029f86fdc0717`; only repeated-load latency changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `backend-query-result-set`: permit a process-local, Store-and-subject-type
  keyed cache of complete immutable Archive FactSets while retaining the
  existing no-partial-result and cancellation contract.

## Impact

- **Status:** local specification, implementation, and focused verification.
- **Owner:** Backend query.
- **Writable paths:**
  `openspec/changes/backend-cache-query-fact-set/**`,
  `backend/internal/query/archive_loader.go`, and
  `backend/internal/query/archive_loader_cache_test.go`.
- **Read-only protected inputs:** `PRODUCT.md`, `DESIGN.md`, root OpenSpec
  specifications, Archive bytes, existing query tests, all other Backend
  packages, Frontend, Contracts, Updater, Operations, remotes, hosts, and
  production.
- **Deletion complement:** delete no loader, SQL, test, gate, cache, query rule,
  Archive behavior, or unrelated work.
- **Mutable refs:** current local worktree files listed as writable only; no Git
  ref mutation.
- **Consumes:** an already published immutable `archive.Store`, its exact object
  identity, caller context, and one subject type.
- **Produces:** one complete immutable in-process `FactSet` value per exact
  Store-and-subject-type key.
- **Dependencies:** existing Go standard-library `context` and `sync`,
  `archive.Store`, and the current query loader; no new dependency.
- **Deliverables:** strict-valid OpenSpec artifacts, focused implementation and
  tests, focused Go test/race evidence, and diff hygiene evidence.
- **Acceptance:** sequential and concurrent calls reuse one complete value;
  different Stores or subject types remain isolated; canceled waiters return
  their context cause; failed/canceled builds publish no cache value and later
  successful calls retry; query results remain identical.
- **Non-goals:** warmup, cache eviction, mutable Archive support, API/wire/query
  semantics, timeouts, observability, full Backend gate, or broad tuning.
- **Operations deferred:** root-spec sync/archive, full batched gate,
  commit/push/PR/merge/release/deploy, service restart, host mutation, and
  production activation.
- **Stop/rollback conditions:** stop on Store/subject-type aliasing, partial or
  erroneous publication, cancellation poisoning, caller-visible mutation,
  race/leak, result drift, focused test failure, or any required write outside
  the declared paths; rollback only the exact owned edits with a normal patch.
- **External state:** this change touches no other repository, external service,
  remote ref, host, or production state.

Apply is blocked until proposal, specs, design, and tasks are complete,
strict-valid, explicitly reviewed, and approved by the main agent.
