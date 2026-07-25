## 1. Contract

- [ ] 1.1 Define closed rankings schemas/OpenAPI operation, success/error envelopes, and deterministic personal/global goldens.
- [ ] 1.2 Add isolated backend/frontend rankings generation and drift checks; update only exact authority-hash evidence required by the existing query/catalog projections.

## 2. Backend core

- [ ] 2.1 Implement Archive person projection and immutable ranking core from accepted query/statistics authorities.
- [ ] 2.2 Implement defaulted view validation, strict total sorting, rank-before-search, metric scale, summary, search, checked pagination, and scope omission rules.
- [ ] 2.3 Integrate the result-cache interface without making cache outcome observable in business results.

## 3. HTTP and wiring

- [ ] 3.1 Implement strict POST transport, stable error mapping, headers/metadata, request cancellation, and route registration.
- [ ] 3.2 Wire the current Archive provider and explicit collection dependency boundary into the production runtime without fixtures or browser-upstream access.

## 4. Acceptance

- [ ] 4.1 Pass contract/golden, focused service/handler, repeated/race, vet, build, full backend/frontend generation, and cancellation/immutability tests.
- [ ] 4.2 Pass strict OpenSpec, doctor, diff, generated-residue, architecture, protected-path, index, and ref gates; leave an unstaged candidate.
