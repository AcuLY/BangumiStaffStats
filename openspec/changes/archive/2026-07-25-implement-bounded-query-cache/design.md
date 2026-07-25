## Context

The runtime needs two independent bounded caches. Collection values are keyed
by privacy-preserving UID digest plus subject type/statuses and carry freshness;
result values are keyed by operation and immutable query/input/data digests.
Cache behavior must never alter a successful business result.

## Decisions

1. Use one generic `map + container/list + sync.Mutex` weighted LRU core. Loads,
   clones, digesting, and computation happen outside the lock.
2. Values enter and leave through caller-supplied clone functions. Oversize
   values are returned but not stored.
3. A per-key loader uses `singleflight` with its own bounded context. Caller
   cancellation stops only that wait, not work shared by other callers.
4. A semaphore-backed executor admits at most two running and eight queued
   expensive computations and returns a typed `SERVER_BUSY` error when full.
5. Collection policy owns fresh, stale, and negative TTLs. Only temporary
   upstream failures may use a positive value up to 30 minutes beyond fresh
   expiry; 403/404 never use stale.
6. Result keys contain operation, dataVersion, queryDigest, inputDigest, and an
   optional collectionDigest. View fields never enter the key.

## Defaults

- Collection: 64 MiB, 4096 entries, 8 MiB per entry, fresh for one hour.
- Result: 190 MiB, 512 entries, 32 MiB per entry.
- Negative: 2 MiB, 4096 entries; not-found two minutes, forbidden 30 seconds.
- Compute: two running, eight queued.

## Verification

Deterministic eviction/cost tests, immutability tests, same/different-key
concurrency tests, waiter cancellation, timeout, queue saturation, stale
eligibility, negative TTL, refresh bypass, digest stability, race tests, and
the full backend gate must pass.
