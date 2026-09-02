## Capability Boundary

- **Status/Owner:** Modified; Backend owns process cache policy.
- **Writable paths:** Collection cache API/implementation/tests and query-service call sites.
- **Read-only protected inputs:** Collection provider, cache-key/digest algorithms, result evaluation, metrics, and archived changes.
- **Deletion complement:** Preserve first/expired loads, singleflight, positive/negative budgets, stale fallback, privacy, and result caching.
- **Mutable refs:** Local topic branch only.
- **Consumes/Produces:** Consumes anonymous collection snapshots; produces immutable collection access for the five query services.
- **Dependencies/Deliverables:** Existing cache primitives only; no caller-controlled fresh-hit bypass.
- **Acceptance:** Runtime-cache focused tests and backend full gate.
- **Non-goals/Operations deferred:** No TTL, provider, resource-budget, formula, or deployment change.
- **Stop/rollback conditions:** Stop if ordinary cache semantics drift; roll back the isolated branch.

## MODIFIED Requirements

### Requirement: Collection cache SHALL implement exact freshness semantics

The five production query services SHALL share the process owner's one
collection cache and its positive, negative, and detached-load state.
Collection keys SHALL separate personal identities using a one-way UID digest
and include subject type plus the canonical ordered collection-status set. Raw
UIDs SHALL not enter keys, metrics, or errors. Positive values SHALL carry an
immutable query collection snapshot, canonical digest, fetchedAt, freshUntil,
and staleUntil.

The collection digest SHALL deterministically cover subject ID/type, status,
rate, comment, tags, volume/episode progress, private, and updatedAt evidence in
stable order. Public empty collections SHALL be positive values.

A request SHALL use a positive value until freshUntil. A missing or expired
value SHALL load through the collection detached-load path without clearing
either cache. Only timeout, network, upstream 429, and upstream 5xx failures MAY
fall back to a positive value before staleUntil, which is 30 minutes after fresh
expiry. Not-found and not-public outcomes SHALL never use stale. Negative
not-found SHALL live two minutes and negative forbidden SHALL live 30 seconds;
other failures SHALL not be negative-cached.

The process defaults SHALL remain one 64 MiB/4096-entry positive cache with an
8 MiB per-item limit and one 2 MiB/4096-entry negative cache; they SHALL NOT be
created or counted once per service. The collection provider SHALL remain an
injected dependency and MAY be absent until its separately governed admission;
absence SHALL NOT cause the process resources to be duplicated.

#### Scenario: Two operations load the same collection
- **WHEN** two production services concurrently request the same collection key
- **THEN** one process collection cache and detached load SHALL supply both without duplicate retained positive or negative entries

#### Scenario: A fresh collection is requested again
- **WHEN** a positive collection value has not reached freshUntil
- **THEN** the cache SHALL return that value without loading the upstream collection

#### Scenario: An expired collection loads unchanged content
- **WHEN** a positive collection reaches freshUntil and the upstream digest is unchanged
- **THEN** new collection metadata SHALL publish and existing result cores MAY be reused by collection digest

#### Scenario: Temporary expired-load failure has eligible stale data
- **WHEN** an expired collection load has a temporary upstream failure before staleUntil
- **THEN** the prior value SHALL be returned with stale true and warning code `COLLECTION_STALE`

#### Scenario: A forbidden collection fails
- **WHEN** upstream establishes that anonymous collection access is forbidden
- **THEN** no stale positive value SHALL be served and the shared negative result SHALL expire after 30 seconds

#### Scenario: Provider admission remains pending
- **WHEN** app assembly has no admitted public collection provider
- **THEN** it SHALL still construct one shared runtime while personal collection access remains unavailable through the existing service error semantics
