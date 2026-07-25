## 1. Runtime primitives

- [x] 1.1 Implement the generic weighted LRU with entry/cost/item limits, clone-on-publish/read, replacement, deterministic eviction, and statistics.
- [x] 1.2 Implement detached per-key loading and the two-running/eight-queued executor with typed cancellation, timeout, and `SERVER_BUSY` outcomes.

## 2. Domain policies

- [x] 2.1 Implement canonical collection snapshot digesting, privacy-safe keying, fresh/refresh/stale/negative policy, and immutable metadata.
- [x] 2.2 Implement result keys and immutable typed result storage without view fields or per-page caching.

## 3. Acceptance

- [x] 3.1 Add focused deterministic, concurrency, cancellation, stale, negative, oversize, eviction, refresh, digest, and race tests.
- [ ] 3.2 Run focused tests, repeated tests, race, vet, build, full backend check, strict OpenSpec, and diff/hygiene gates; leave an unstaged candidate.
