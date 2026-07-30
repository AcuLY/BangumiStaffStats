## Context

The accepted Archive schema already contains canonical position, member,
group, capability, and selection-rule tables, and the accepted Go consumer
publishes one immutable read-only `archive.Store`. The accepted HTTP runtime
currently exposes only health, metrics, and the separately owned image route;
its root capability explicitly forbids catalog until a later change modifies
that scope. The active `derive-position-catalog-and-cast` change must first
populate and validate the tables that this API will read.

PRODUCT requires an input-free dynamic catalog that drives the future position
selector, including every common position, multi-parent groups, fixed featured
and cast shortcuts, explicit capability, main/all exclusivity, and a dormant
staff-set extension. The first catalog failure must remain local to the future
selector; this change therefore provides a retryable GET but implements no UI.

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: no; verified: main semantic/authority/path review and strict OpenSpec gates passed |
| Owner | Contracts owner first, then one Backend owner after main-agent handoff acceptance; main agent reviews and accepts both. |
| Writable paths | Planning and the exact sequential Contracts/Backend path sets in `proposal.md`; no parent-directory implication. |
| Read-only protected inputs | Every path/state declared protected in `proposal.md`, especially Archive internals, updater/catalog derivation outputs, other Contracts, module files, frontend, refs/remotes, and production. |
| Deletion complement | None. |
| Mutable refs | None during apply. |
| Consumes | The three exact exited dependencies, accepted catalog derivation output, shared query/error wire, Store identity/read API, HTTP lifecycle, and observability. |
| Produces | Strict OpenAPI/goldens, generated Go catalog wire, immutable Store projection, exact GET route, and bounded runtime evidence. |
| Dependencies | Exactly `derive-position-catalog-and-cast`, `implement-backend-archive-consumer`, and `implement-backend-http-and-observability`; all exit before Contracts apply, then Contracts acceptance precedes Backend apply. |
| Deliverables | Four delta capabilities, API contract/goldens, generated wire, catalog package, route/composition, observability, tests, check script, documentation. |
| Acceptance | Closed wire/ordering/corruption/dormant cases; Go generation/unit/fuzz/race/vet/build/architecture; existing runtime regressions; strict OpenSpec/diff/inventory/residue gates. |
| Non-goals | Other operations, query/statistics/cache/collection, UI, Archive/updater edits, active staff-set policy, operations, release, or deployment. |
| Operations deferred | Activation/reload/rollback, production roots/secrets, scheduling, monitoring, release, deployment, migration, and cutover. |
| Stop/rollback conditions | Stop on unmet dependency, contract/owner/index/path drift, need for protected edits/dependencies, ambiguous row-to-wire meaning, or any existing-gate regression. Remove only owned disposable output. |

Dependency direction is:

`derive-position-catalog-and-cast + accepted archive consumer + accepted HTTP`
`-> contracts-catalog-api -> main acceptance -> backend-dynamic-catalog`
`-> exact HTTP/observability deltas`.

No Backend package imports updater code, no Contracts owner implements runtime,
and no frontend consumer is introduced here.

## Goals / Non-Goals

**Goals:**

- Freeze one strict, generated, cross-language catalog wire before Go work.
- Project accepted catalog tables generically and deterministically through the
  read-only Store.
- Add exactly one input-free route with accepted envelope, cancellation,
  request-ID, cache, error, event, and metric behavior.
- Fail closed on unknown/corrupt catalog data and prove dormant staff-set
  extensibility without a handler enum.

**Non-Goals:**

- Implement query operations, statistical authority, result cache, collection
  access, sharing, or any frontend surface.
- Change Archive schema, producer semantics, accepted Store loading, active
  staff-set configuration, or product catalog policy.
- Add dependencies, a catalog cache, admin mutation, hot reload, operations,
  release, or deployment.

## Decisions

### Use two sequential owner blocks

Contracts first changes only `contracts/openapi/openapi.yaml` and the closed
catalog API golden package. Backend then consumes exact accepted hashes and
cannot edit them. This preserves the repository rule that cross-language wire
belongs to Contracts and prevents the Go implementation from defining its own
convenient response.

Alternative considered: generate the wire while implementing the handler.
Rejected because it permits contract drift and prevents independent
cross-language acceptance.

### Make the OpenAPI response structurally strict and discriminated

The catalog operation has no request schema. Its success response uses closed
objects and a discriminated position union: exact staff has `positionId`,
cast has `roleScope`, and staff set has `memberKeys`. Groups contain references
rather than embedded positions. Selection, filter, and sort capabilities are
explicit data rather than prefix/label inference. The golden corpus locks
ordering, bounds, errors, unknown values, and both empty and synthetic
staff-set cases.

This adds no production dependency. Existing pinned OpenAPI generation remains
the tool authority; a catalog-specific script selects and verifies only the
catalog declarations without changing `go.mod`. The existing query projection
script is narrowly updated to select only its already accepted empty-path/query
components from the larger OpenAPI, and its generated Go file must remain
byte-identical.

Alternative considered: return the SQLite rows almost verbatim. Rejected
because database storage fields do not form a safe public union and would leak
internal selection representation. Alternative considered: expose one
untyped map. Rejected because unknown fields and enum drift would reach the
frontend silently.

### Query only through a small catalog package over archive.Store

`backend/internal/catalog` owns fixed `SELECT` statements, row scanning,
semantic validation, deterministic sorting, and immutable DTO assembly. It
depends only on the accepted Archive read boundary. It never opens files or
SQLite itself and never accepts raw query text from a request. Each HTTP call
builds a fresh value; the immutable Store makes separate table reads
consistent, and the rows lifetimes remain context-bound.

No catalog cache is added. The current catalog is compact and Store-local;
result caching belongs to a later query capability. If measurement later
shows a need, a separate OpenSpec can add one immutable dataVersion-keyed
projection without changing this wire.

Alternative considered: load a second catalog copy during Archive publication.
Rejected for this bounded change because it would modify the accepted consumer
publication/readiness contract and expand the critical startup path.
Alternative considered: issue SQL directly from the HTTP handler. Rejected
because validation, ordering, and cleanup would be coupled to transport.

### Compose one exact GET without changing readiness

Runtime composition passes a read-only current-Store provider to the catalog
handler. The route is registered even in degraded startup mode, but absence of
a Store returns `NOT_READY`; the handler never initiates loading or fallback.
Health semantics remain controlled by the accepted fixed readiness probe.

The handler rejects query/body input, completes encoding before commit, uses
`no-cache` only for success, and uses accepted `no-store` envelopes for every
failure. Deadline and cancellation remain owned by existing middleware.

Alternative considered: omit the route until readiness succeeds. Rejected
because route topology would depend on startup state and wrong-method/not-ready
behavior would vary. Alternative considered: return an empty catalog when not
ready. Rejected because PRODUCT explicitly distinguishes failure from empty.

### Extend observability with closed values only

The existing runtime already models a typed `catalog` query operation, but its
accepted route/metric inventory does not admit the route. This change adds the
single fixed route/operation pair and uses existing event and metric families.
Catalog values, dataVersion, row counts, SQL, and content never become labels
or event fields. Committed JSON outcomes get one terminal event; pre-commit
cancellation gets none.

Alternative considered: emit catalog size/version fields for diagnostics.
Rejected because they create avoidable cardinality/snapshot disclosure and
are not required for the product contract.

## Risks / Trade-offs

- [The producer table projection and API union diverge] → Contracts goldens
  include exact logical rows and wire results; Backend consumes them before
  route integration.
- [A future common catalog becomes larger] → API bounds must be equal to or
  wider than the exited producer contract, with no legacy item cap; response
  cost is covered by bounded tests and measurement.
- [One corrupt row produces a misleading partial selector] → assemble and
  validate the complete response before encoding or committing.
- [Repeated requests reread immutable rows] → accept the simpler bounded v1
  path; cache only through a later measured, dataVersion-keyed change.
- [Route addition regresses health/image behavior] → retain existing tests and
  add exact architecture route inventory, degraded-startup, cancel, race, and
  full-suite gates.
- [Generated types drift from OpenAPI] → exact tool/version/command/digest,
  deterministic replay, compile test, and `--check`.

## Migration Plan

1. Keep apply blocked until the three exact dependencies have exited and all
   planning artifacts are strict-valid and main-approved.
2. Contracts owner writes OpenAPI and closed goldens, verifies, and stops.
3. Main agent reviews and seals the Contracts handoff.
4. Backend owner generates the wire, implements Store projection, then exact
   route/runtime/observability integration and all development gates.
5. Main agent reviews the unstaged candidate; synchronization/archive/commit
   are separate lifecycle actions, not apply claims.

Rollback during apply removes only newly created owned files or restores only
owned modified files to their recorded preimages. It never changes a snapshot,
pointer, Store, ref, external service, or production state.

## Open Questions

None are delegated to apply. Any need to change Archive schema/consumer,
shared query components, module dependencies, or the owned path envelope stops
the change for main-agent spec review.
